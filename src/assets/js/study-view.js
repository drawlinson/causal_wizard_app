import { StudyStore } from "./studies/db.js";
import { DatasetStore } from "./datasets/db.js";
import { parseFileFull } from "./datasets/parse.js";
import { sniffType } from "./datasets/types.js";
import { computeColumnStats, categoryCounts, sampleRowIndices } from "./datasets/stats.js";
import { renderTreatmentWidget } from "./treatment-widget.js";
import { StudyGraph } from "./studies/graph.js";
import { runCheck } from "./studies/validate.js";
import { issueHtml } from "./studies/issue-messages.js";
import { buildConfig, downloadConfig } from "./studies/config-export.js";

const SAMPLE_SIZE = 1000;

// Notebooks live in this same repo's ./notebooks (see ROADMAP.md stage
// 8.6) - these links are wired up now to the path stage 8.6 commits to,
// but won't resolve until that stage actually creates the notebook.
const NOTEBOOKS_REPO = "drawlinson/causal_wizard_app";
const NOTEBOOKS_BRANCH = "main";
const IDENTIFICATION_NOTEBOOK_PATH = "notebooks/01-identification-and-estimation.ipynb";

const state = {
  study: null,
  dataset: null,
  columns: null,
  columnNames: [],
  schema: null,
  graph: null,
  sampleIndices: null,
  lastCheck: null,
};

function showError(message) {
  document.getElementById("sv-loading").hidden = true;
  const el = document.getElementById("sv-error");
  el.textContent = message;
  el.hidden = false;
}

function showProgress(message) {
  const el = document.getElementById("sv-loading");
  el.textContent = message;
  el.hidden = false;
}

async function persist() {
  state.study.graph = state.graph.serialize();
  state.study.modifiedAt = Date.now();
  await StudyStore.put(state.study);
}

function columnByName(name) {
  return state.schema.columns.find((c) => c.name === name);
}

function numericColumnNames() {
  return state.schema.columns.filter((c) => c.type === "numeric").map((c) => c.name);
}

function getSampleIndices() {
  if (!state.sampleIndices) {
    state.sampleIndices = sampleRowIndices(state.columns, numericColumnNames(), state.schema.rowCount, SAMPLE_SIZE);
  }
  return state.sampleIndices;
}

function sampledColumn(name) {
  return getSampleIndices().map((i) => state.columns[name][i]);
}

async function main() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return showError("No study specified.");

  const study = await StudyStore.get(id);
  if (!study) return showError("Study not found - it may have been deleted.");
  state.study = study;

  const dataset = await DatasetStore.get(study.datasetId);
  if (!dataset) return showError("This study's dataset has been deleted. Create a new study with a different dataset.");
  state.dataset = dataset;

  document.getElementById("sv-name").textContent = study.name;
  document.getElementById("sv-dataset-link").href = `/data/view/?id=${dataset.id}`;

  showProgress("Reading dataset…");
  let parsed;
  try {
    parsed = await parseFileFull(dataset.fileBlob, {
      onProgress: (n) => showProgress(`Reading dataset… ${n.toLocaleString()} rows so far`),
    });
  } catch (err) {
    console.error(err);
    return showError(`Couldn't parse this dataset: ${err.message}`);
  }
  state.columns = parsed.columns;
  state.columnNames = parsed.columnNames;
  state.schema = {
    rowCount: parsed.rowCount,
    columns: parsed.columnNames.map((name) => {
      const sniff = sniffType(parsed.columns[name]);
      const stats = computeColumnStats(parsed.columns[name], sniff.type);
      return { name, type: sniff.type, isConstant: sniff.isConstant, isNearUnique: sniff.isNearUnique, ...stats };
    }),
  };

  document.getElementById("sv-loading").hidden = true;
  document.getElementById("sv-content").hidden = false;

  initGraph();
  render();
}

// ---------- diagram ----------

function initGraph() {
  state.graph = new StudyGraph({
    containerEl: document.getElementById("sv-graph"),
    initialGraph: state.study.graph,
    onTapBackground: (pos) => openNodeModal({ action: "add", x: pos.x, y: pos.y }),
    onTapNode: (node) => openNodeModal({ action: "edit", node }),
    onTopologyChanged: () => {
      persist();
      updateGraphClasses();
    },
  });
  updateGraphClasses();

  document.getElementById("sv-mode-nodes").addEventListener("change", () => state.graph.setMode("nodes"));
  document.getElementById("sv-mode-edges").addEventListener("change", () => state.graph.setMode("edges"));
  document.getElementById("sv-zoom-in").addEventListener("click", () => state.graph.zoom(1));
  document.getElementById("sv-zoom-out").addEventListener("click", () => state.graph.zoom(-1));
  document.getElementById("sv-zoom-fit").addEventListener("click", () => state.graph.fit());
  document.getElementById("sv-legend-toggle").addEventListener("click", () => {
    const el = document.getElementById("sv-legend");
    el.hidden = !el.hidden;
  });
  document.getElementById("sv-graph-clear").addEventListener("click", () => {
    if (confirm("Clear the whole diagram? This can't be undone.")) state.graph.clear();
  });
}

function updateGraphClasses() {
  const q = state.study.question;
  const roles = state.lastCheck?.valid ? deriveRoles(state.lastCheck) : {};
  state.graph.updateClasses({ treatment: q.treatment, outcome: q.outcome, ...roles });
}

function deriveRoles(checkResult) {
  const roles = { backdoorVariables: [], instrumentalVariables: [], frontdoorVariables: [], mediatorVariables: [] };
  for (const estimand of checkResult.estimands || []) {
    if (estimand.type === "backdoor") roles.backdoorVariables = estimand.variables;
    if (estimand.type === "iv") roles.instrumentalVariables = estimand.variables;
    if (estimand.type === "frontdoor") roles.frontdoorVariables = estimand.variables;
  }
  return roles;
}

// ---------- node modal ----------

let nodeModalState = null;

function defaultVariableLabel(src) {
  if (src.startsWith("u")) return `Unobserved ${src}`;
  if (src.startsWith("x")) return `User defined ${src}`;
  return src;
}

function populateNodeSrcOptions(excludeNodeId) {
  const used = state.graph.usedVariables(excludeNodeId);
  const select = document.getElementById("node-modal-src");
  const options = [];
  for (const name of state.columnNames) {
    if (used.has(name)) continue;
    options.push(`<option value="${name}">${name}</option>`);
  }
  const unobservedId = state.graph.nextUnobservedId();
  options.push(`<option value="${unobservedId}">Unobserved ${unobservedId}</option>`);
  const userDefinedId = state.graph.nextUserDefinedId();
  options.push(`<option value="${userDefinedId}">User defined ${userDefinedId}</option>`);
  select.innerHTML = options.join("");
}

function allowedTypesFor(src) {
  if (src.startsWith("u") || src.startsWith("x")) return ["numerical", "categorical"];
  const col = columnByName(src);
  if (col && col.type !== "numeric") return ["categorical"];
  return ["numerical", "categorical"];
}

function populateNodeTypeOptions(src, selected) {
  const allowed = allowedTypesFor(src);
  const select = document.getElementById("node-modal-type");
  let effective = allowed.includes(selected) ? selected : allowed[0];
  select.innerHTML = allowed
    .map((t) => `<option value="${t}" ${t === effective ? "selected" : ""}>${t === "numerical" ? "Numerical" : "Categorical"}</option>`)
    .join("");
}

function openNodeModal({ action, x, y, node }) {
  const nodeId = action === "edit" ? node.id() : state.graph.newNodeId();
  nodeModalState = { action, nodeId, x, y };

  document.getElementById("node-modal-title").textContent = action === "edit" ? "Edit node" : "Add node";
  document.getElementById("node-modal-delete").hidden = action !== "edit";

  populateNodeSrcOptions(action === "edit" ? nodeId : null);
  const srcSelect = document.getElementById("node-modal-src");
  if (action === "edit") srcSelect.value = node.data("src");

  const src = srcSelect.value;
  document.getElementById("node-modal-name").value = action === "edit" ? node.data("name") : defaultVariableLabel(src);
  populateNodeTypeOptions(src, action === "edit" ? node.data("type") : "numerical");

  new bootstrap.Modal(document.getElementById("node-modal")).show();
}

document.getElementById("node-modal-src").addEventListener("change", (e) => {
  const src = e.target.value;
  document.getElementById("node-modal-name").value = defaultVariableLabel(src);
  populateNodeTypeOptions(src, document.getElementById("node-modal-type").value);
});

document.getElementById("node-modal-delete").addEventListener("click", () => {
  state.graph.deleteNode(nodeModalState.nodeId);
  bootstrap.Modal.getInstance(document.getElementById("node-modal")).hide();
});

document.getElementById("node-modal-save").addEventListener("click", () => {
  const src = document.getElementById("node-modal-src").value;
  const name = document.getElementById("node-modal-name").value.trim() || src;
  const type = document.getElementById("node-modal-type").value;

  if (nodeModalState.action === "edit") {
    state.graph.updateNode(nodeModalState.nodeId, { src, name, type });
  } else {
    state.graph.addNode({ id: nodeModalState.nodeId, src, name, type, x: nodeModalState.x, y: nodeModalState.y });
  }
  bootstrap.Modal.getInstance(document.getElementById("node-modal")).hide();
});

// ---------- form controls ----------

function populateSelect(select, names, selected, { placeholder } = {}) {
  const placeholderHtml = placeholder ? `<option value="">${placeholder}</option>` : "";
  select.innerHTML = placeholderHtml + names.map((n) => `<option value="${n}">${n}</option>`).join("");
  select.value = selected && names.includes(selected) ? selected : "";
}

const METHOD_HELP = {
  "cd+po": "Draw a causal diagram; we identify a valid adjustment strategy (backdoor, frontdoor, or instrumental variable) from it.",
  "pd+fe": "For repeated observations of the same units over time. No diagram needed - declare the entity, time, and covariate columns below.",
};

function render() {
  const q = state.study.question;
  document.getElementById("sv-method").value = q.method;
  document.getElementById("sv-method-help").textContent = METHOD_HELP[q.method];
  populateSelect(document.getElementById("sv-treatment"), state.columnNames, q.treatment, { placeholder: "-- choose --" });
  populateSelect(document.getElementById("sv-outcome"), state.columnNames, q.outcome, { placeholder: "-- choose --" });
  document.getElementById(q.treatmentDesign === "continuous" ? "sv-design-continuous" : "sv-design-grouped").checked = true;

  populateSelect(document.getElementById("sv-panel-entity"), state.columnNames, q.panelData.entity, { placeholder: "-- choose --" });
  populateSelect(document.getElementById("sv-panel-time"), state.columnNames, q.panelData.time, { placeholder: "-- choose --" });
  const covSelect = document.getElementById("sv-panel-covariates");
  covSelect.innerHTML = state.columnNames.map((n) => `<option value="${n}" ${q.panelData.covariates.includes(n) ? "selected" : ""}>${n}</option>`).join("");

  updateMethodVisibility();
  updateDesignVisibility();
  renderTreatmentGroupWidget();
}

function updateMethodVisibility() {
  const isPanel = state.study.question.method === "pd+fe";
  document.getElementById("sv-panel-fields").hidden = !isPanel;
  document.getElementById("sv-design-row").hidden = isPanel; // PDFE always uses treatment as-is
}

function updateDesignVisibility() {
  const q = state.study.question;
  const treatmentCol = columnByName(q.treatment);
  const isNumeric = treatmentCol?.type === "numeric";
  document.getElementById("sv-design-row").hidden = q.method === "pd+fe" || !isNumeric;
  const grouped = q.method === "pd+fe" || q.treatmentDesign !== "continuous";
  document.getElementById("sv-treatment-widget-wrapper").hidden = !grouped || !q.treatment;
}

document.getElementById("sv-method").addEventListener("change", (e) => {
  state.study.question.method = e.target.value;
  document.getElementById("sv-method-help").textContent = METHOD_HELP[e.target.value];
  updateMethodVisibility();
  updateDesignVisibility();
  persist();
});

document.getElementById("sv-treatment").addEventListener("change", (e) => {
  const q = state.study.question;
  q.treatment = e.target.value;
  q.treatmentSpec = null; // stale for the new column
  updateDesignVisibility();
  renderTreatmentGroupWidget();
  persist();
});

document.getElementById("sv-outcome").addEventListener("change", (e) => {
  state.study.question.outcome = e.target.value;
  persist();
});

document.querySelectorAll('input[name="sv-design"]').forEach((el) => {
  el.addEventListener("change", (e) => {
    state.study.question.treatmentDesign = e.target.value;
    updateDesignVisibility();
    renderTreatmentGroupWidget();
    persist();
  });
});

document.getElementById("sv-panel-entity").addEventListener("change", (e) => {
  state.study.question.panelData.entity = e.target.value;
  persist();
});
document.getElementById("sv-panel-time").addEventListener("change", (e) => {
  state.study.question.panelData.time = e.target.value;
  persist();
});
document.getElementById("sv-panel-covariates").addEventListener("change", (e) => {
  state.study.question.panelData.covariates = [...e.target.selectedOptions].map((o) => o.value);
  persist();
});

function renderTreatmentGroupWidget() {
  const q = state.study.question;
  const container = document.getElementById("sv-treatment-widget");
  if (!q.treatment || document.getElementById("sv-treatment-widget-wrapper").hidden) {
    container.innerHTML = "";
    return;
  }
  const col = columnByName(q.treatment);
  const values = state.columns[q.treatment];
  const widget = renderTreatmentWidget(container, {
    columnType: col.type,
    values,
    sampleValues: sampledColumn(q.treatment),
    topCategories: categoryCounts(values, 50),
    initialSpec: q.treatmentSpec,
    onChange: (spec) => {
      q.treatmentSpec = spec;
      persist();
    },
  });
  // Capture the widget's initial (possibly smart-defaulted) spec - onChange
  // only fires on user interaction, so without this a freshly-picked
  // treatment column would report "no group defined" until touched.
  q.treatmentSpec = widget.getSpec();
  persist();
}

// ---------- Check ----------

document.getElementById("sv-check-button").addEventListener("click", async () => {
  const status = document.getElementById("sv-check-status");
  status.textContent = "Checking…";

  const result = runCheck({
    question: state.study.question,
    graph: state.graph.toDagShape(),
    datasetColumns: state.columns,
    datasetSchema: state.schema,
  });
  state.lastCheck = result;
  updateGraphClasses();

  status.textContent = "";
  showCheckModal(result);
});

function showCheckModal(result) {
  const body = document.getElementById("check-modal-body");
  if (!result.valid) {
    body.innerHTML = `
      <div class="alert alert-warning">
        <p><b>Not ready yet:</b></p>
        <ul>${result.issues.map((key) => `<li>${issueHtml(key)}</li>`).join("")}</ul>
      </div>`;
    document.getElementById("sv-export-section").hidden = true;
  } else {
    const allModels = result.estimands.flatMap((e) => e.models);
    const estimandSummary = result.estimands
      .map((e) => `<li><b>${e.name}</b>${e.variables.length ? `: adjusting for ${e.variables.join(", ")}` : ""}</li>`)
      .join("");
    body.innerHTML = `
      <div class="alert alert-success">Your diagram and data support estimating this effect.</div>
      <p>Identification found:</p>
      <ul>${estimandSummary}</ul>
      <p>Compatible models: ${allModels.map((m) => m.methodName).join(", ")}</p>`;
    populateModelSelect(allModels);
    document.getElementById("sv-export-section").hidden = false;
  }
  new bootstrap.Modal(document.getElementById("check-modal")).show();
}

function populateModelSelect(models) {
  const select = document.getElementById("sv-model-select");
  select.innerHTML = models.map((m) => `<option value="${m.methodKey}">${m.methodName}</option>`).join("");
  if (state.study.question.modelKey && models.some((m) => m.methodKey === state.study.question.modelKey)) {
    select.value = state.study.question.modelKey;
  }
  select.onchange = () => {
    state.study.question.modelKey = select.value;
    persist();
  };
  select.onchange();

  const colabUrl = `https://colab.research.google.com/github/${NOTEBOOKS_REPO}/blob/${NOTEBOOKS_BRANCH}/${IDENTIFICATION_NOTEBOOK_PATH}`;
  const repoUrl = `https://github.com/${NOTEBOOKS_REPO}/tree/${NOTEBOOKS_BRANCH}/notebooks`;
  document.getElementById("sv-colab-link").href = colabUrl;
  document.getElementById("sv-notebooks-repo-link").href = repoUrl;
}

document.getElementById("sv-download-config").addEventListener("click", () => {
  const config = buildConfig({
    study: state.study,
    dataset: state.dataset,
    checkResult: state.lastCheck,
    selectedModelKey: state.study.question.modelKey,
  });
  downloadConfig(config, state.study);
});

main();
