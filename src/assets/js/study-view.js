import { StudyStore } from "./studies/db.js";
import { DatasetStore } from "./datasets/db.js";
import { parseFileFull } from "./datasets/parse.js";
import { sniffType } from "./datasets/types.js";
import { computeColumnStats, categoryCounts, sampleRowIndices } from "./datasets/stats.js";
import { renderTreatmentWidget } from "./treatment-widget.js";
import { StudyGraph } from "./studies/graph.js";
import { findMediators, findColliders } from "./studies/dag.js";
import { runCheck } from "./studies/validate.js";
import { issueHtml } from "./studies/issue-messages.js";
import { buildConfig, downloadConfig } from "./studies/config-export.js";

const SAMPLE_SIZE = 1000;
const TREATMENT_COLOR = "#bfd9ff";
const OUTCOME_COLOR = "#d0fcdc";

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
  if (!study.question.variableTypes) study.question.variableTypes = {}; // older records
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
  const datasetTypeOverrides = dataset.typeOverrides || {};
  state.schema = {
    rowCount: parsed.rowCount,
    columns: parsed.columnNames.map((name) => {
      const sniff = sniffType(parsed.columns[name]);
      // Respect the dataset page's own type overrides (stage 8.3's Columns
      // tab) as the default here too - without this, the study page was
      // silently re-sniffing from scratch and ignoring them entirely.
      const type = datasetTypeOverrides[name] || sniff.type;
      const stats = computeColumnStats(parsed.columns[name], type);
      return { name, type, isConstant: sniff.isConstant, isNearUnique: sniff.isNearUnique, ...stats };
    }),
  };

  document.getElementById("sv-loading").hidden = true;
  document.getElementById("sv-content").hidden = false;

  initGraph();
  render();
}

// ---------- variable type model ----------
//
// One resolution path, used everywhere a "numerical vs categorical" type
// is needed: the diagram node picker, the treatment/outcome type
// selectors, and the Check pipeline. Priority: an explicit per-study
// override (question.variableTypes, set via any of those three UIs) beats
// the dataset's own sniffed/overridden type (datasets/db.js typeOverrides,
// from stage 8.3's Columns tab), which beats a plain numeric/non-numeric
// guess. Setting a type through any UI updates the same underlying value,
// so they can never drift out of sync with each other.

function datasetTypeToNodeType(datasetType) {
  return datasetType === "numeric" ? "numerical" : "categorical";
}

function allowedTypesFor(name) {
  if (name.startsWith("u") || name.startsWith("x")) return ["numerical", "categorical"];
  const col = columnByName(name);
  if (col && col.type !== "numeric") return ["categorical"]; // no numeric data to treat as numerical
  return ["numerical", "categorical"];
}

function effectiveVariableType(name) {
  const override = state.study.question.variableTypes[name];
  const allowed = allowedTypesFor(name);
  if (override && allowed.includes(override)) return override;
  if (name.startsWith("u") || name.startsWith("x")) return "numerical";
  const col = columnByName(name);
  return col ? datasetTypeToNodeType(col.type) : "numerical";
}

/** The one place that changes a variable's type. Updates the study-level
 * override, keeps the diagram node (if any) in sync, and refreshes every
 * bit of UI that shows a type for this variable. */
function setVariableType(name, type, { skipNodeSync = false } = {}) {
  state.study.question.variableTypes[name] = type;
  if (!skipNodeSync) state.graph.setNodeTypeQuiet(name, type);
  persist();

  const q = state.study.question;
  if (name === q.treatment) {
    syncTypeSelect(document.getElementById("sv-treatment-type"), name);
    updateDesignVisibility();
  }
  if (name === q.outcome) {
    syncTypeSelect(document.getElementById("sv-outcome-type"), name);
  }
  updateGraphClasses();
}

function typeSelectOptionsHtml(name, selected) {
  const allowed = allowedTypesFor(name);
  const effective = allowed.includes(selected) ? selected : allowed[0];
  return allowed
    .map((t) => `<option value="${t}" ${t === effective ? "selected" : ""}>${t === "numerical" ? "Numerical" : "Categorical"}</option>`)
    .join("");
}

function syncTypeSelect(select, name) {
  select.innerHTML = typeSelectOptionsHtml(name, effectiveVariableType(name));
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
  document.getElementById("sv-legend-toggle").addEventListener("click", (e) => {
    const el = document.getElementById("sv-legend");
    el.hidden = !el.hidden;
    e.target.classList.toggle("active", !el.hidden);
    e.target.setAttribute("aria-pressed", String(!el.hidden));
  });
  document.getElementById("sv-graph-clear").addEventListener("click", () => {
    if (confirm("Clear the whole diagram? This can't be undone.")) state.graph.clear();
  });
}

function updateGraphClasses() {
  const q = state.study.question;
  const structural = deriveStructuralRoles();
  const checked = state.lastCheck?.valid ? deriveCheckRoles(state.lastCheck) : {};
  state.graph.updateClasses({ treatment: q.treatment, outcome: q.outcome, ...structural, ...checked });
}

/** Mediator/collider highlighting is pure graph structure, so it's always
 * live - not gated behind a successful Check like backdoor/frontdoor/IV
 * are (those specifically represent "what Check found"). */
function deriveStructuralRoles() {
  const q = state.study.question;
  if (q.method !== "cd+po" || !q.treatment || !q.outcome || !state.graph) return {};
  const dag = state.graph.toDagShape();
  if (!dag.nodes.includes(q.treatment) || !dag.nodes.includes(q.outcome)) return {};
  return {
    mediatorVariables: findMediators(q.treatment, q.outcome, dag.nodes, dag.edges),
    colliderVariables: findColliders(dag.nodes, dag.edges),
  };
}

function deriveCheckRoles(checkResult) {
  const roles = { backdoorVariables: [], instrumentalVariables: [], frontdoorVariables: [] };
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
  document.getElementById("node-modal-type").innerHTML = typeSelectOptionsHtml(
    src,
    action === "edit" ? node.data("type") : effectiveVariableType(src)
  );

  new bootstrap.Modal(document.getElementById("node-modal")).show();
}

document.getElementById("node-modal-src").addEventListener("change", (e) => {
  const src = e.target.value;
  document.getElementById("node-modal-name").value = defaultVariableLabel(src);
  document.getElementById("node-modal-type").innerHTML = typeSelectOptionsHtml(src, effectiveVariableType(src));
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
  setVariableType(src, type, { skipNodeSync: true }); // node already has this type from above
  bootstrap.Modal.getInstance(document.getElementById("node-modal")).hide();
});

// ---------- form controls ----------

function populateSelect(select, names, selected, { placeholder } = {}) {
  const placeholderHtml = placeholder ? `<option value="">${placeholder}</option>` : "";
  select.innerHTML = placeholderHtml + names.map((n) => `<option value="${n}">${n}</option>`).join("");
  select.value = selected && names.includes(selected) ? selected : "";
}

function updateSelectColors() {
  const q = state.study.question;
  document.getElementById("sv-treatment").style.backgroundColor = q.treatment ? TREATMENT_COLOR : "";
  document.getElementById("sv-outcome").style.backgroundColor = q.outcome ? OUTCOME_COLOR : "";
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

  if (q.treatment) syncTypeSelect(document.getElementById("sv-treatment-type"), q.treatment);
  else document.getElementById("sv-treatment-type").innerHTML = "";
  if (q.outcome) syncTypeSelect(document.getElementById("sv-outcome-type"), q.outcome);
  else document.getElementById("sv-outcome-type").innerHTML = "";
  updateSelectColors();

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
}

function updateDesignVisibility() {
  const q = state.study.question;
  const isNumeric = q.treatment && effectiveVariableType(q.treatment) === "numerical";
  document.getElementById("sv-design-row").hidden = q.method === "pd+fe" || !isNumeric;

  const grouped = q.method === "pd+fe" || q.treatmentDesign !== "continuous";
  const toggleBtn = document.getElementById("sv-treatment-collapse-toggle");
  toggleBtn.hidden = !grouped || !q.treatment;
  if (toggleBtn.hidden) {
    bootstrap.Collapse.getOrCreateInstance(document.getElementById("sv-treatment-collapse"), { toggle: false }).hide();
  }
}

function expandTreatmentCollapse() {
  bootstrap.Collapse.getOrCreateInstance(document.getElementById("sv-treatment-collapse"), { toggle: false }).show();
}

document.getElementById("sv-method").addEventListener("change", (e) => {
  state.study.question.method = e.target.value;
  document.getElementById("sv-method-help").textContent = METHOD_HELP[e.target.value];
  updateMethodVisibility();
  updateDesignVisibility();
  updateGraphClasses();
  persist();
});

document.getElementById("sv-treatment").addEventListener("change", (e) => {
  const q = state.study.question;
  q.treatment = e.target.value || null;
  q.treatmentSpec = null; // stale for the new column
  if (q.treatment && !q.variableTypes[q.treatment]) {
    q.variableTypes[q.treatment] = effectiveVariableType(q.treatment);
  }
  if (q.treatment) syncTypeSelect(document.getElementById("sv-treatment-type"), q.treatment);
  else document.getElementById("sv-treatment-type").innerHTML = "";
  updateSelectColors();
  updateDesignVisibility();
  renderTreatmentGroupWidget();
  updateGraphClasses(); // was missing - node didn't recolor until an unrelated topology change
  persist();
  if (q.treatment && !document.getElementById("sv-treatment-collapse-toggle").hidden) expandTreatmentCollapse();
});

document.getElementById("sv-outcome").addEventListener("change", (e) => {
  const q = state.study.question;
  q.outcome = e.target.value || null;
  if (q.outcome && !q.variableTypes[q.outcome]) {
    q.variableTypes[q.outcome] = effectiveVariableType(q.outcome);
  }
  if (q.outcome) syncTypeSelect(document.getElementById("sv-outcome-type"), q.outcome);
  else document.getElementById("sv-outcome-type").innerHTML = "";
  updateSelectColors();
  updateGraphClasses(); // same fix as treatment, above
  persist();
});

document.getElementById("sv-treatment-type").addEventListener("change", (e) => {
  const q = state.study.question;
  if (q.treatment) setVariableType(q.treatment, e.target.value);
});
document.getElementById("sv-outcome-type").addEventListener("change", (e) => {
  const q = state.study.question;
  if (q.outcome) setVariableType(q.outcome, e.target.value);
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
  if (!q.treatment || document.getElementById("sv-treatment-collapse-toggle").hidden) {
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
    resolveType: effectiveVariableType,
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
      <div class="alert alert-warning mb-0">
        <p class="mb-2"><b>Not ready yet:</b></p>
        <ul class="mb-0">${result.issues.map((key) => `<li>${issueHtml(key)}</li>`).join("")}</ul>
      </div>`;
  } else {
    const allModels = result.estimands.flatMap((e) => e.models);
    const estimandSummary = result.estimands
      .map((e) => `<li><b>${e.name}</b>${e.variables.length ? `: adjusting for ${e.variables.join(", ")}` : ""}</li>`)
      .join("");
    const colabUrl = `https://colab.research.google.com/github/${NOTEBOOKS_REPO}/blob/${NOTEBOOKS_BRANCH}/${IDENTIFICATION_NOTEBOOK_PATH}`;
    const repoUrl = `https://github.com/${NOTEBOOKS_REPO}/tree/${NOTEBOOKS_BRANCH}/notebooks`;
    const datasetUrl = `/data/view/?id=${state.dataset.id}`;

    body.innerHTML = `
      <div class="alert alert-success">Your diagram and data support estimating this effect.</div>
      <p>Identification found:</p>
      <ul>${estimandSummary}</ul>

      <hr class="my-3" />
      <h5>Next: run the analysis</h5>
      <p>
        This site doesn't run the actual estimation &mdash; that happens in a
        notebook, on your own computer or in Colab, using the same data you
        already have. Nothing about your data changes; you're just moving the
        last step somewhere with full Python statistics tooling.
      </p>
      <div class="mb-3">
        <label class="form-label" for="sv-model-select">Model</label>
        <select class="form-select w-auto" id="sv-model-select"></select>
      </div>
      <div class="d-flex align-items-start gap-2 mb-2">
        <span class="badge bg-secondary rounded-pill">1</span>
        <div>Download your study configuration: <button class="btn btn-sm btn-success" id="sv-download-config">Download config JSON</button></div>
      </div>
      <div class="d-flex align-items-start gap-2 mb-2">
        <span class="badge bg-secondary rounded-pill">2</span>
        <div>Have your data file handy &mdash; <a href="${datasetUrl}" target="_blank">${state.dataset.name}</a> (opens in a new tab).</div>
      </div>
      <div class="d-flex align-items-start gap-2 mb-2">
        <span class="badge bg-secondary rounded-pill">3</span>
        <div>
          Open the notebooks &mdash;
          <a href="${colabUrl}" target="_blank" class="btn btn-sm btn-outline-primary">Open in Colab &#8599;</a>
          or clone the <a href="${repoUrl}" target="_blank">notebooks repository</a> to run locally.
        </div>
      </div>
      <div class="d-flex align-items-start gap-2 mb-3">
        <span class="badge bg-secondary rounded-pill">4</span>
        <div>When the notebook asks for your config file and data file, provide the two files above.</div>
      </div>
      <p class="text-muted mb-0">
        The notebook re-checks everything independently (it doesn't just
        trust this page), so if anything here turns out to be a poor fit for
        your data, it'll tell you there too.
      </p>`;

    populateModelSelect(allModels);
    document.getElementById("sv-download-config").addEventListener("click", () => {
      const config = buildConfig({
        study: state.study,
        dataset: state.dataset,
        checkResult: state.lastCheck,
        selectedModelKey: state.study.question.modelKey,
      });
      downloadConfig(config, state.study);
    });
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
}

main();
