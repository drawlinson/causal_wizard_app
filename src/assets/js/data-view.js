import { DatasetStore } from "./datasets/db.js";
import { parseFileFull } from "./datasets/parse.js";
import { sniffType, parseNumeric } from "./datasets/types.js";
import {
  computeColumnStats,
  sampleRowIndices,
  groupBy,
  categoryCounts,
  pearsonCorrelation,
  standardizedMeanDiff,
} from "./datasets/stats.js";
import {
  plotHistogram,
  plotCategoryBar,
  plotScatter,
  plotContour,
  plotViolin,
  plotHeatmap,
  plotCorrelationHeatmap,
} from "./datasets/charts.js";
import { renderTreatmentWidget, classifierFromSpec } from "./treatment-widget.js";

const TABLE_PAGE_SIZE = 50;
const SAMPLE_SIZE = 1000;

// "numeric" plots as numeric; everything else (boolean/categorical/text/
// datetime) is bucketed as categorical for the purposes of choosing a
// bivariate plot type. Datetime-aware plotting (e.g. outcome-over-time) is
// a follow-up, not in this pass.
function plotKind(type) {
  return type === "numeric" ? "numeric" : "categorical";
}

const state = {
  record: null,
  columns: null,
  columnNames: [],
  schema: null,
  tablePage: 0,
  sampleIndices: null,
  filteredIndices: null,
  typeOverrides: {},
  treatmentSpec: null,
};

function columnByName(name) {
  return state.schema.columns.find((c) => c.name === name);
}

function numericColumnNames() {
  return state.schema.columns.filter((c) => c.type === "numeric").map((c) => c.name);
}

function getSampleIndices() {
  if (!state.sampleIndices) {
    state.sampleIndices = sampleRowIndices(
      state.columns,
      numericColumnNames(),
      state.schema.rowCount,
      SAMPLE_SIZE
    );
  }
  return state.sampleIndices;
}

function sampledColumn(name) {
  return getSampleIndices().map((i) => state.columns[name][i]);
}

function showError(message) {
  document.getElementById("dv-loading").hidden = true;
  const el = document.getElementById("dv-error");
  el.textContent = message;
  el.hidden = false;
}

function showProgress(message) {
  const loading = document.getElementById("dv-loading");
  loading.textContent = message;
  loading.hidden = false;
}

function hideProgress() {
  document.getElementById("dv-loading").hidden = true;
}

async function persist() {
  state.record.typeOverrides = state.typeOverrides;
  state.record.treatmentSpec = state.treatmentSpec;
  state.record.schema = state.schema;
  state.record.modifiedAt = Date.now();
  await DatasetStore.put(state.record);
}

async function main() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    showError("No dataset specified.");
    return;
  }
  const record = await DatasetStore.get(id);
  if (!record) {
    showError("Dataset not found - it may have been deleted.");
    return;
  }
  state.record = record;
  document.getElementById("dv-name").textContent = record.name;
  document.getElementById("dv-create-study").href = `/studies/?datasetId=${id}`;

  showProgress("Reading file…");
  let parsed;
  try {
    parsed = await parseFileFull(record.fileBlob, {
      onProgress: (n) => showProgress(`Reading file… ${n.toLocaleString()} rows so far`),
    });
  } catch (err) {
    console.error(err);
    showError(`Couldn't parse this file: ${err.message}`);
    return;
  }
  state.columns = parsed.columns;
  state.columnNames = parsed.columnNames;

  showProgress("Analyzing columns…");
  const columns = parsed.columnNames.map((name) => {
    const sniff = sniffType(parsed.columns[name]);
    const stats = computeColumnStats(parsed.columns[name], sniff.type);
    return {
      name,
      type: sniff.type,
      detectedType: sniff.type,
      isConstant: sniff.isConstant,
      isNearUnique: sniff.isNearUnique,
      ...stats,
    };
  });

  // Re-apply any type overrides the user previously chose on this dataset -
  // otherwise they'd silently revert every time the file gets re-scanned.
  state.typeOverrides = record.typeOverrides || {};
  for (const col of columns) {
    const override = state.typeOverrides[col.name];
    if (override && override !== col.type) {
      col.type = override;
      Object.assign(col, computeColumnStats(parsed.columns[col.name], override));
    }
  }
  state.schema = { rowCount: parsed.rowCount, columns };
  state.treatmentSpec = record.treatmentSpec || null;

  // Cache the refined schema so the list page / a future visit don't need
  // to re-scan the file just to show row/column counts.
  await persist();

  hideProgress();
  document.getElementById("dv-summary").textContent =
    `${state.schema.rowCount.toLocaleString()} rows, ${state.columnNames.length} columns`;
  document.getElementById("dv-content").hidden = false;

  render();
}

function render() {
  // Each tab renders independently - a bug in one (as happened with the
  // covariate-balance table crashing on all-null groups, which silently
  // prevented the Correlations tab below it from ever running) shouldn't
  // take the rest of the page down with it.
  for (const step of [renderColumnSelects, renderColumnsTab, renderTableTab, renderUnivariateTab, renderBivariateTab, renderTreatmentTab, renderCorrelationsTab]) {
    try {
      step();
    } catch (err) {
      console.error(`data-view: ${step.name} failed`, err);
    }
  }
}

// ---------- column <select> population ----------

function populateSelect(select, names, selected) {
  select.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
  if (selected && names.includes(selected)) select.value = selected;
}

function populateSortSelect(select, names) {
  const current = select.value;
  select.innerHTML = `<option value="">(none)</option>` + names.map((n) => `<option value="${n}">${n}</option>`).join("");
  if (names.includes(current)) select.value = current;
}

function renderColumnSelects() {
  const names = state.columnNames;
  populateSelect(document.getElementById("dv-uni-column"), names);
  populateSelect(document.getElementById("dv-biv-x"), names, names[0]);
  populateSelect(document.getElementById("dv-biv-y"), names, names[1]);
  populateSelect(document.getElementById("dv-treatment-column"), names, state.treatmentSpec?.columnName);
  populateSortSelect(document.getElementById("dv-table-sort1"), names);
  populateSortSelect(document.getElementById("dv-table-sort2"), names);
}

// ---------- Columns / data-quality tab ----------

const TYPE_OPTIONS = ["numeric", "boolean", "categorical", "text", "datetime"];

function flagsFor(col) {
  const flags = [];
  if (col.isConstant) flags.push('<span class="badge bg-warning text-dark">constant</span>');
  if (col.isNearUnique) flags.push('<span class="badge bg-warning text-dark">near-unique (ID-like)</span>');
  return flags.join(" ");
}

function renderColumnsTab() {
  const tbody = document.querySelector("#dv-columns-table tbody");
  tbody.innerHTML = state.schema.columns
    .map((col) => {
      const missingPct = ((col.missingCount / state.schema.rowCount) * 100).toFixed(1);
      const uniqueDisplay = col.type === "numeric" ? col.count : col.uniqueCount;
      const options = TYPE_OPTIONS.map(
        (t) => `<option value="${t}" ${t === col.type ? "selected" : ""}>${t}</option>`
      ).join("");
      return `
        <tr data-column="${col.name}">
          <td>${col.name}</td>
          <td><select class="form-select form-select-sm dv-type-select" data-column="${col.name}">${options}</select></td>
          <td>${missingPct}%</td>
          <td>${uniqueDisplay ?? "-"}</td>
          <td>${flagsFor(col)}</td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".dv-type-select").forEach((select) => {
    select.addEventListener("change", () => {
      const col = columnByName(select.dataset.column);
      col.type = select.value;
      const stats = computeColumnStats(state.columns[col.name], col.type);
      Object.assign(col, stats);
      state.sampleIndices = null; // numeric-column set may have changed
      state.filteredIndices = null; // sort behaviour may depend on type
      state.typeOverrides[col.name] = select.value;
      persist();
      renderColumnsTab();
      renderUnivariateTab();
      renderBivariateTab();
      renderTreatmentTab();
      renderCorrelationsTab();
      renderTableTab();
    });
  });
}

// ---------- Table tab ----------

function computeFilteredSortedIndices() {
  const query = document.getElementById("dv-table-search").value.trim().toLowerCase();
  const sort1 = document.getElementById("dv-table-sort1").value;
  const sort1Dir = document.getElementById("dv-table-sort1-dir").value;
  const sort2 = document.getElementById("dv-table-sort2").value;
  const sort2Dir = document.getElementById("dv-table-sort2-dir").value;

  let indices = [];
  for (let i = 0; i < state.schema.rowCount; i++) {
    if (query) {
      let matched = false;
      for (const name of state.columnNames) {
        const v = state.columns[name][i];
        if (v !== null && v !== undefined && String(v).toLowerCase().includes(query)) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
    }
    indices.push(i);
  }

  function compareBy(colName, dir, a, b) {
    const col = columnByName(colName);
    const va = state.columns[colName][a];
    const vb = state.columns[colName][b];
    let cmp;
    if (col.type === "numeric") {
      const na = parseNumeric(va);
      const nb = parseNumeric(vb);
      cmp = (na === null ? -Infinity : na) - (nb === null ? -Infinity : nb);
    } else {
      cmp = String(va ?? "").localeCompare(String(vb ?? ""));
    }
    return dir === "desc" ? -cmp : cmp;
  }

  if (sort1) {
    indices.sort((a, b) => {
      const c1 = compareBy(sort1, sort1Dir, a, b);
      if (c1 !== 0) return c1;
      return sort2 ? compareBy(sort2, sort2Dir, a, b) : 0;
    });
  }

  return indices;
}

function updateFilteredIndices() {
  state.filteredIndices = computeFilteredSortedIndices();
  state.tablePage = 0;
}

function renderTableTab() {
  if (!state.filteredIndices) updateFilteredIndices();
  const indices = state.filteredIndices;

  const thead = document.querySelector("#dv-table thead");
  const tbody = document.querySelector("#dv-table tbody");
  thead.innerHTML = `<tr>${state.columnNames.map((n) => `<th>${n}</th>`).join("")}</tr>`;

  const start = state.tablePage * TABLE_PAGE_SIZE;
  const end = Math.min(start + TABLE_PAGE_SIZE, indices.length);
  const rowsHtml = [];
  for (let p = start; p < end; p++) {
    const i = indices[p];
    rowsHtml.push(
      `<tr>${state.columnNames.map((n) => `<td>${state.columns[n][i] ?? ""}</td>`).join("")}</tr>`
    );
  }
  tbody.innerHTML = rowsHtml.join("") || `<tr><td colspan="${state.columnNames.length}">No matching rows.</td></tr>`;

  const totalPages = Math.max(1, Math.ceil(indices.length / TABLE_PAGE_SIZE));
  document.getElementById("dv-table-page-label").textContent =
    `Rows ${indices.length ? start + 1 : 0}-${end} of ${indices.length.toLocaleString()} (page ${state.tablePage + 1} of ${totalPages})`;
  document.getElementById("dv-table-prev").disabled = state.tablePage === 0;
  document.getElementById("dv-table-next").disabled = end >= indices.length;
}

document.getElementById("dv-table-prev").addEventListener("click", () => {
  if (state.tablePage > 0) {
    state.tablePage -= 1;
    renderTableTab();
  }
});
document.getElementById("dv-table-next").addEventListener("click", () => {
  state.tablePage += 1;
  renderTableTab();
});

let searchDebounceHandle = null;
document.getElementById("dv-table-search").addEventListener("input", () => {
  clearTimeout(searchDebounceHandle);
  searchDebounceHandle = setTimeout(() => {
    updateFilteredIndices();
    renderTableTab();
  }, 200);
});
["dv-table-sort1", "dv-table-sort1-dir", "dv-table-sort2", "dv-table-sort2-dir"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    updateFilteredIndices();
    renderTableTab();
  });
});

// ---------- Univariate tab ----------

function renderUnivariateStats(col) {
  const el = document.getElementById("dv-uni-stats");
  if (col.type === "numeric") {
    el.innerHTML = `
      <table class="table table-sm w-auto">
        <tr><th>Min</th><td>${col.min}</td></tr>
        <tr><th>Max</th><td>${col.max}</td></tr>
        <tr><th>Mean</th><td>${col.mean?.toFixed(3)}</td></tr>
        <tr><th>Median</th><td>${col.median}</td></tr>
        <tr><th>Std dev</th><td>${col.std?.toFixed(3)}</td></tr>
        <tr><th>Missing</th><td>${col.missingCount} (${((col.missingCount / state.schema.rowCount) * 100).toFixed(1)}%)</td></tr>
      </table>`;
  } else {
    const rows = col.topCategories
      .map((c) => `<tr><td>${c.value}</td><td>${c.count}</td></tr>`)
      .join("");
    el.innerHTML = `
      <p>${col.uniqueCount} distinct values, ${col.missingCount} missing (${((col.missingCount / state.schema.rowCount) * 100).toFixed(1)}%). Top values:</p>
      <table class="table table-sm w-auto"><thead><tr><th>Value</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

function renderUnivariateTab() {
  const name = document.getElementById("dv-uni-column").value || state.columnNames[0];
  if (!name) return;
  const col = columnByName(name);
  const logY = document.getElementById("dv-uni-log").checked;

  if (col.type === "numeric") {
    plotHistogram("dv-uni-plot", sampledColumn(name).map(parseNumeric), { logY });
  } else {
    plotCategoryBar("dv-uni-plot", col.topCategories);
  }
  renderUnivariateStats(col);
}

document.getElementById("dv-uni-column").addEventListener("change", renderUnivariateTab);
document.getElementById("dv-uni-log").addEventListener("change", renderUnivariateTab);

// ---------- Bivariate tab ----------

function renderBivariateTab() {
  const xName = document.getElementById("dv-biv-x").value || state.columnNames[0];
  const yName = document.getElementById("dv-biv-y").value || state.columnNames[1] || state.columnNames[0];
  if (!xName || !yName) return;
  const xCol = columnByName(xName);
  const yCol = columnByName(yName);
  const xKind = plotKind(xCol.type);
  const yKind = plotKind(yCol.type);

  const contourToggle = document.getElementById("dv-biv-contour-toggle");
  const statsEl = document.getElementById("dv-biv-stats");

  if (xKind === "numeric" && yKind === "numeric") {
    contourToggle.hidden = false;
    const asContour = document.getElementById("dv-biv-contour").checked;
    const xs = sampledColumn(xName);
    const ys = sampledColumn(yName);
    if (asContour) {
      plotContour("dv-biv-plot", xs, ys, { xTitle: xName, yTitle: yName });
      statsEl.innerHTML = "";
    } else {
      const { pearson, spearman } = plotScatter("dv-biv-plot", xs, ys, { xTitle: xName, yTitle: yName });
      statsEl.innerHTML = `<p>
        <a href="https://en.wikipedia.org/wiki/Pearson_correlation_coefficient" target="_blank">Pearson correlation coefficient</a> (linear): <b>${pearson?.toFixed(3) ?? "n/a"}</b>
        &middot;
        <a href="https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient" target="_blank">Spearman's rank correlation coefficient</a>: <b>${spearman?.toFixed(3) ?? "n/a"}</b>
      </p>`;
    }
  } else if (xKind === "categorical" && yKind === "categorical") {
    contourToggle.hidden = true;
    plotHeatmap("dv-biv-plot", sampledColumn(xName), sampledColumn(yName), { xTitle: xName, yTitle: yName });
    statsEl.innerHTML = "";
  } else {
    contourToggle.hidden = true;
    // violin: numeric on y, categorical on x
    const [catName, numName] = xKind === "categorical" ? [xName, yName] : [yName, xName];
    plotViolin("dv-biv-plot", sampledColumn(catName), sampledColumn(numName), { xTitle: catName, yTitle: numName });
    statsEl.innerHTML = "";
  }
}

document.getElementById("dv-biv-x").addEventListener("change", renderBivariateTab);
document.getElementById("dv-biv-y").addEventListener("change", renderBivariateTab);
document.getElementById("dv-biv-contour").addEventListener("change", renderBivariateTab);

// ---------- Treatment tab (assignment widget + covariate balance) ----------

function renderTreatmentTab() {
  const name = document.getElementById("dv-treatment-column").value || state.columnNames[0];
  if (!name) return;
  const col = columnByName(name);
  const values = state.columns[name];
  const container = document.getElementById("dv-treatment-widget");

  const initialSpec = state.treatmentSpec && state.treatmentSpec.columnName === name ? state.treatmentSpec.spec : null;

  const widget = renderTreatmentWidget(container, {
    columnType: col.type,
    values,
    sampleValues: sampledColumn(name),
    topCategories: categoryCounts(values), // uncapped - the widget itself caps how many rows it shows
    initialSpec,
    onChange: (spec) => {
      state.treatmentSpec = { columnName: name, spec };
      persist();
      renderCovariatesTable(name, spec);
    },
  });

  state.treatmentSpec = { columnName: name, spec: widget.getSpec() };
  persist();
  renderCovariatesTable(name, widget.getSpec());
}

document.getElementById("dv-treatment-column").addEventListener("change", renderTreatmentTab);

function smdBadge(smd) {
  if (smd === null) return "-";
  const cls = Math.abs(smd) > 0.25 ? "text-danger fw-bold" : Math.abs(smd) > 0.1 ? "text-warning" : "";
  return `<span class="${cls}">${smd.toFixed(2)}</span>`;
}

function renderCovariatesTable(treatmentName, spec) {
  const treatmentValues = state.columns[treatmentName];
  const classify = classifierFromSpec(spec);
  // groupBy() skips null/empty labels, which conveniently drops "excluded"
  // rows out of the balance comparison entirely.
  const labels = treatmentValues.map((v) => {
    const bucket = classify(v);
    return bucket === "excluded" ? null : bucket;
  });

  const others = state.columnNames.filter((n) => n !== treatmentName);
  const headerHtml = `<thead><tr><th>Covariate</th><th>Control</th><th>Treated</th><th>SMD</th></tr></thead>`;
  const rowsHtml = others
    .map((name) => {
      const col = columnByName(name);
      const groups = groupBy(labels, state.columns[name], col.type);
      const controlStat = groups.find((g) => g.group === "control");
      const treatedStat = groups.find((g) => g.group === "treated");

      if (col.type === "numeric") {
        const smd =
          controlStat?.mean != null && treatedStat?.mean != null
            ? standardizedMeanDiff(treatedStat.mean, treatedStat.std, controlStat.mean, controlStat.std)
            : null;
        // A group can exist (some rows fall in it) but still have no usable
        // values for THIS covariate - e.g. it's null for every row in that
        // group - in which case mean/std are null, not just the group.
        return `<tr>
          <td>${name}</td>
          <td>${controlStat?.mean != null ? `${controlStat.mean.toFixed(2)} &plusmn; ${controlStat.std.toFixed(2)}` : "-"}</td>
          <td>${treatedStat?.mean != null ? `${treatedStat.mean.toFixed(2)} &plusmn; ${treatedStat.std.toFixed(2)}` : "-"}</td>
          <td>${smdBadge(smd)}</td>
        </tr>`;
      }
      return `<tr>
        <td>${name}</td>
        <td>${controlStat?.topValue != null ? `${controlStat.topValue} (${(controlStat.topFraction * 100).toFixed(0)}%)` : "-"}</td>
        <td>${treatedStat?.topValue != null ? `${treatedStat.topValue} (${(treatedStat.topFraction * 100).toFixed(0)}%)` : "-"}</td>
        <td>-</td>
      </tr>`;
    })
    .join("");

  document.getElementById("dv-covariates-table").innerHTML =
    `<caption>Numeric covariates shown as mean &plusmn; SD; categorical as most common value (% of group).</caption>` +
    headerHtml +
    `<tbody>${rowsHtml}</tbody>`;
}

// ---------- Correlations tab ----------

function renderCorrelationsTab() {
  const names = numericColumnNames();
  const plotEl = document.getElementById("dv-corr-plot");
  const tableEl = document.getElementById("dv-corr-table");
  if (names.length < 2) {
    plotEl.innerHTML = "<p>Need at least two numeric columns to compute correlations.</p>";
    tableEl.innerHTML = "";
    return;
  }
  plotEl.innerHTML = "";
  plotCorrelationHeatmap("dv-corr-plot", state.columns, names);

  const parsed = {};
  for (const name of names) parsed[name] = state.columns[name].map(parseNumeric);

  const headerHtml = `<thead><tr><th></th>${names.map((n) => `<th>${n}</th>`).join("")}</tr></thead>`;
  const rowsHtml = names
    .map((rowName) => {
      const cells = names
        .map((colName) => {
          if (rowName === colName) return `<td>&mdash;</td>`;
          const a = [];
          const b = [];
          for (let i = 0; i < parsed[rowName].length; i++) {
            if (parsed[rowName][i] !== null && parsed[colName][i] !== null) {
              a.push(parsed[rowName][i]);
              b.push(parsed[colName][i]);
            }
          }
          const r = pearsonCorrelation(a, b);
          return `<td>${r === null ? "-" : r.toFixed(2)}</td>`;
        })
        .join("");
      return `<tr><th>${rowName}</th>${cells}</tr>`;
    })
    .join("");
  tableEl.innerHTML = headerHtml + `<tbody>${rowsHtml}</tbody>`;
}

main();
