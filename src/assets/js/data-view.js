import { DatasetStore } from "./datasets/db.js";
import { parseFileFull } from "./datasets/parse.js";
import { sniffType, parseNumeric } from "./datasets/types.js";
import { computeColumnStats, sampleRowIndices, groupBy } from "./datasets/stats.js";
import {
  plotHistogram,
  plotCategoryBar,
  plotScatter,
  plotContour,
  plotViolin,
  plotHeatmap,
  plotCorrelationHeatmap,
} from "./datasets/charts.js";

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
  state.schema = {
    rowCount: parsed.rowCount,
    columns: parsed.columnNames.map((name) => {
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
    }),
  };

  // Cache the refined schema so the list page / a future visit don't need
  // to re-scan the file just to show row/column counts.
  record.schema = state.schema;
  await DatasetStore.put(record);

  hideProgress();
  document.getElementById("dv-summary").textContent =
    `${state.schema.rowCount.toLocaleString()} rows, ${state.columnNames.length} columns`;
  document.getElementById("dv-content").hidden = false;

  render();
}

function render() {
  renderColumnSelects();
  renderColumnsTab();
  renderTableTab();
  renderUnivariateTab();
  renderBivariateTab();
  renderBalanceTab();
  renderCorrelationsTab();
}

// ---------- column <select> population ----------

function populateSelect(select, names, selected) {
  select.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
  if (selected && names.includes(selected)) select.value = selected;
}

function renderColumnSelects() {
  const names = state.columnNames;
  populateSelect(document.getElementById("dv-uni-column"), names);
  populateSelect(document.getElementById("dv-biv-x"), names, names[0]);
  populateSelect(document.getElementById("dv-biv-y"), names, names[1]);
  populateSelect(document.getElementById("dv-treatment-column"), names);
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
      renderColumnsTab();
      renderUnivariateTab();
      renderBivariateTab();
      renderCorrelationsTab();
    });
  });
}

// ---------- Table tab ----------

function renderTableTab() {
  const thead = document.querySelector("#dv-table thead");
  const tbody = document.querySelector("#dv-table tbody");
  thead.innerHTML = `<tr>${state.columnNames.map((n) => `<th>${n}</th>`).join("")}</tr>`;

  const start = state.tablePage * TABLE_PAGE_SIZE;
  const end = Math.min(start + TABLE_PAGE_SIZE, state.schema.rowCount);
  const rowsHtml = [];
  for (let i = start; i < end; i++) {
    rowsHtml.push(
      `<tr>${state.columnNames.map((n) => `<td>${state.columns[n][i] ?? ""}</td>`).join("")}</tr>`
    );
  }
  tbody.innerHTML = rowsHtml.join("");

  const totalPages = Math.max(1, Math.ceil(state.schema.rowCount / TABLE_PAGE_SIZE));
  document.getElementById("dv-table-page-label").textContent =
    `Rows ${start + 1}-${end} of ${state.schema.rowCount.toLocaleString()} (page ${state.tablePage + 1} of ${totalPages})`;
  document.getElementById("dv-table-prev").disabled = state.tablePage === 0;
  document.getElementById("dv-table-next").disabled = end >= state.schema.rowCount;
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
      statsEl.innerHTML = `<p>Pearson correlation: <b>${pearson?.toFixed(3) ?? "n/a"}</b> &middot; Spearman correlation: <b>${spearman?.toFixed(3) ?? "n/a"}</b></p>`;
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

// ---------- Treatment balance + Covariates tabs ----------

function renderBalanceTab() {
  const name = document.getElementById("dv-treatment-column").value || state.columnNames[0];
  if (!name) return;
  const values = state.columns[name];
  const groups = groupBy(values, values, "categorical");
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  const tbody = document.querySelector("#dv-balance-table tbody");
  tbody.innerHTML = groups
    .map((g) => `<tr><td>${g.group}</td><td>${g.count}</td><td>${((g.count / total) * 100).toFixed(1)}%</td></tr>`)
    .join("");

  const warningEl = document.getElementById("dv-balance-warning");
  const smallGroups = groups.filter((g) => g.count / total < 0.05);
  if (groups.length < 2) {
    warningEl.innerHTML = `<div class="alert alert-warning">Only one group found - this column doesn't vary, so it can't be used as a treatment.</div>`;
  } else if (smallGroups.length > 0) {
    warningEl.innerHTML = `<div class="alert alert-warning">${smallGroups.length} group(s) have fewer than 5% of samples (${smallGroups.map((g) => g.group).join(", ")}). This can violate the <a href="/articles/positivity/" target="_blank">positivity</a> assumption - estimates for small groups will be less reliable.</div>`;
  } else {
    warningEl.innerHTML = `<div class="alert alert-success">Group sizes look reasonably balanced.</div>`;
  }

  renderCovariatesTab(name);
}

document.getElementById("dv-treatment-column").addEventListener("change", renderBalanceTab);

function renderCovariatesTab(treatmentName) {
  const treatmentValues = state.columns[treatmentName];
  const groupNames = [...new Set(treatmentValues.filter((v) => v !== null && String(v).trim() !== "").map(String))];

  const others = state.columnNames.filter((n) => n !== treatmentName);
  const headerHtml = `<thead><tr><th>Covariate</th>${groupNames.map((g) => `<th>${g}</th>`).join("")}</tr></thead>`;
  const rowsHtml = others
    .map((name) => {
      const col = columnByName(name);
      const groups = groupBy(treatmentValues, state.columns[name], col.type);
      const cellsHtml = groupNames
        .map((g) => {
          const stat = groups.find((s) => s.group === g);
          if (!stat) return "<td>-</td>";
          if (col.type === "numeric") {
            return `<td>${stat.mean?.toFixed(2)} (${stat.std?.toFixed(2)})</td>`;
          }
          return `<td>${stat.topValue} (${(stat.topFraction * 100).toFixed(0)}%)</td>`;
        })
        .join("");
      return `<tr><td>${name}</td>${cellsHtml}</tr>`;
    })
    .join("");

  document.getElementById("dv-covariates-table").innerHTML = headerHtml + `<tbody>${rowsHtml}</tbody>`;
}

// ---------- Correlations tab ----------

function renderCorrelationsTab() {
  const names = numericColumnNames();
  if (names.length < 2) {
    document.getElementById("dv-corr-plot").innerHTML =
      "<p>Need at least two numeric columns to compute correlations.</p>";
    return;
  }
  plotCorrelationHeatmap("dv-corr-plot", state.columns, names);
}

main();
