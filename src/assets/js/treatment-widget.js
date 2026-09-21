// Reusable treatment/control assignment widget. Maps any column - numeric
// or categorical/boolean/text - into three buckets: treated, control,
// excluded. Used by the dataset XDA page (Treatment tab) and, later, the
// wizard's causal diagram editor - built as a standalone module (DOM
// rendering separated from the pure classification logic) so both can
// share it without duplicating the mapping logic.
//
// Numeric: each group is an optionally-half-open range - {min, minOp: '>'
// | '>=', max, maxOp: '<' | '<='}. A null bound means "no bound on this
// side". A group with both bounds null matches nothing (inactive).
//
// Categorical/boolean/text: each group is an explicit list of values, plus
// an "anything else" wildcard flag. A value assigned to a group is removed
// from the other group's list, so groups stay mutually exclusive by
// construction - same "swap on assign" behavior as the old site's tag UI.

import { parseNumeric } from "./datasets/types.js";

export function defaultSpecFor(columnType, topCategories) {
  if (columnType === "numeric" || columnType === "datetime") {
    return {
      kind: "numeric",
      control: { min: null, minOp: ">=", max: null, maxOp: "<" },
      treated: { min: null, minOp: ">=", max: null, maxOp: "<" },
    };
  }

  const spec = { kind: "categorical", control: [], treated: [], controlAnything: false, treatedAnything: false };
  const truthy = new Set(["true", "yes", "y", "t", "1"]);
  if (columnType === "boolean" && topCategories.length === 2) {
    for (const c of topCategories) {
      if (truthy.has(String(c.value).toLowerCase())) spec.treated.push(c.value);
      else spec.control.push(c.value);
    }
  } else if (topCategories.length === 2) {
    // Smart default for any 2-valued column: first (most common) -> control,
    // second -> treated. User can swap freely.
    spec.control.push(topCategories[0].value);
    spec.treated.push(topCategories[1].value);
  }
  return spec;
}

function numericMatches(v, group) {
  if (group.min === null && group.max === null) return false;
  if (group.min !== null) {
    const ok = group.minOp === ">=" ? v >= group.min : v > group.min;
    if (!ok) return false;
  }
  if (group.max !== null) {
    const ok = group.maxOp === "<=" ? v <= group.max : v < group.max;
    if (!ok) return false;
  }
  return true;
}

export function classifierFromSpec(spec) {
  if (spec.kind === "numeric") {
    return (rawValue) => {
      const v = parseNumeric(rawValue);
      if (v === null) return "excluded";
      if (numericMatches(v, spec.control)) return "control";
      if (numericMatches(v, spec.treated)) return "treated";
      return "excluded";
    };
  }
  return (rawValue) => {
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") return "excluded";
    const value = String(rawValue).trim();
    if (spec.control.includes(value)) return "control";
    if (spec.treated.includes(value)) return "treated";
    if (spec.controlAnything) return "control";
    if (spec.treatedAnything) return "treated";
    return "excluded";
  };
}

export function summarize(values, spec) {
  const classify = classifierFromSpec(spec);
  let control = 0;
  let treated = 0;
  let excluded = 0;
  for (const v of values) {
    const bucket = classify(v);
    if (bucket === "control") control += 1;
    else if (bucket === "treated") treated += 1;
    else excluded += 1;
  }
  return { control, treated, excluded, total: values.length };
}

// ---------- DOM rendering ----------

function numericGroupHtml(prefix, label, group) {
  return `
    <div class="d-flex align-items-center gap-1 flex-wrap mb-2">
      <b style="display:inline-block; width:5em;">${label}</b>
      <select class="form-select form-select-sm w-auto" data-role="${prefix}-minOp">
        <option value=">=" ${group.minOp === ">=" ? "selected" : ""}>&ge;</option>
        <option value=">" ${group.minOp === ">" ? "selected" : ""}>&gt;</option>
      </select>
      <input type="number" class="form-control form-control-sm w-auto" style="width:8em;" data-role="${prefix}-min" value="${group.min ?? ""}" placeholder="no lower bound" />
      <span>and</span>
      <select class="form-select form-select-sm w-auto" data-role="${prefix}-maxOp">
        <option value="<" ${group.maxOp === "<" ? "selected" : ""}>&lt;</option>
        <option value="<=" ${group.maxOp === "<=" ? "selected" : ""}>&le;</option>
      </select>
      <input type="number" class="form-control form-control-sm w-auto" style="width:8em;" data-role="${prefix}-max" value="${group.max ?? ""}" placeholder="no upper bound" />
    </div>`;
}

function renderNumericEditor(container, spec, onChange) {
  container.innerHTML = `
    ${numericGroupHtml("control", "Control", spec.control)}
    ${numericGroupHtml("treated", "Treated", spec.treated)}
    <p class="text-muted">Values matching neither range are excluded (shown in grey below). Leave a group's bounds empty to disable it.</p>
    <div id="tw-numeric-plot" style="height:300px;"></div>
    <div id="tw-summary"></div>`;

  function readGroup(prefix) {
    const num = (el) => (el.value.trim() === "" ? null : Number(el.value));
    return {
      min: num(container.querySelector(`[data-role="${prefix}-min"]`)),
      minOp: container.querySelector(`[data-role="${prefix}-minOp"]`).value,
      max: num(container.querySelector(`[data-role="${prefix}-max"]`)),
      maxOp: container.querySelector(`[data-role="${prefix}-maxOp"]`).value,
    };
  }

  container.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("change", () => {
      spec.control = readGroup("control");
      spec.treated = readGroup("treated");
      onChange(spec);
    });
  });
}

function categoryRowHtml(value, count, bucket) {
  return `
    <tr data-value="${value}">
      <td>${value}</td>
      <td>${count}</td>
      <td>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn ${bucket === "control" ? "btn-primary" : "btn-outline-primary"}" data-bucket="control">Control</button>
          <button type="button" class="btn ${bucket === "treated" ? "btn-danger" : "btn-outline-danger"}" data-bucket="treated">Treated</button>
          <button type="button" class="btn ${bucket === "excluded" ? "btn-secondary" : "btn-outline-secondary"}" data-bucket="excluded">Exclude</button>
        </div>
      </td>
    </tr>`;
}

function bucketOf(spec, value) {
  if (spec.control.includes(value)) return "control";
  if (spec.treated.includes(value)) return "treated";
  return "excluded";
}

function renderCategoricalEditor(container, spec, valueCounts, onChange) {
  const MAX_ROWS = 50;
  const shown = valueCounts.slice(0, MAX_ROWS);
  const truncated = valueCounts.length > MAX_ROWS;

  container.innerHTML = `
    ${truncated ? `<p class="alert alert-warning">Showing the ${MAX_ROWS} most common values of ${valueCounts.length} - this column may be too high-cardinality to use as a treatment.</p>` : ""}
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="tw-control-anything" ${spec.controlAnything ? "checked" : ""}>
      <label class="form-check-label" for="tw-control-anything">Everything not listed below is Control</label>
    </div>
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="tw-treated-anything" ${spec.treatedAnything ? "checked" : ""}>
      <label class="form-check-label" for="tw-treated-anything">Everything not listed below is Treated</label>
    </div>
    <table class="table table-sm">
      <thead><tr><th>Value</th><th>Count</th><th>Assign to&hellip;</th></tr></thead>
      <tbody>${shown.map((c) => categoryRowHtml(c.value, c.count, bucketOf(spec, c.value))).join("")}</tbody>
    </table>
    <div id="tw-summary"></div>`;

  container.querySelector("#tw-control-anything").addEventListener("change", (e) => {
    spec.controlAnything = e.target.checked;
    if (spec.controlAnything) spec.treatedAnything = false;
    renderCategoricalEditor(container, spec, valueCounts, onChange);
    onChange(spec);
  });
  container.querySelector("#tw-treated-anything").addEventListener("change", (e) => {
    spec.treatedAnything = e.target.checked;
    if (spec.treatedAnything) spec.controlAnything = false;
    renderCategoricalEditor(container, spec, valueCounts, onChange);
    onChange(spec);
  });

  container.querySelectorAll("tbody tr").forEach((row) => {
    const value = row.dataset.value;
    row.querySelectorAll("button[data-bucket]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bucket = btn.dataset.bucket;
        spec.control = spec.control.filter((v) => v !== value);
        spec.treated = spec.treated.filter((v) => v !== value);
        if (bucket === "control") spec.control.push(value);
        if (bucket === "treated") spec.treated.push(value);
        renderCategoricalEditor(container, spec, valueCounts, onChange);
        onChange(spec);
      });
    });
  });
}

function renderSummary(container, values, spec) {
  const el = container.querySelector("#tw-summary");
  if (!el) return;
  const { control, treated, excluded, total } = summarize(values, spec);
  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : "0.0");
  let warning = "";
  if (control === 0 || treated === 0) {
    warning = `<div class="alert alert-warning mt-2">Define both a Control and a Treated group to see a comparison.</div>`;
  } else if (control / total < 0.05 || treated / total < 0.05) {
    warning = `<div class="alert alert-warning mt-2">One group has fewer than 5% of samples. This can violate the <a href="/articles/positivity/" target="_blank">positivity</a> assumption.</div>`;
  } else {
    warning = `<div class="alert alert-success mt-2">Group sizes look reasonably balanced.</div>`;
  }
  el.innerHTML = `
    <table class="table table-sm w-auto">
      <tr><td>Control</td><td>${control} (${pct(control)}%)</td></tr>
      <tr><td>Treated</td><td>${treated} (${pct(treated)}%)</td></tr>
      <tr><td>Excluded</td><td>${excluded} (${pct(excluded)}%)</td></tr>
    </table>
    ${warning}`;
}

/**
 * @param {HTMLElement} container
 * @param {object} opts { columnType, values (full column), sampleValues (for the numeric preview plot), topCategories, initialSpec, onChange(spec) }
 * @returns {{getSpec: () => object}}
 */
export function renderTreatmentWidget(container, opts) {
  const { columnType, values, sampleValues, topCategories } = opts;
  const spec = opts.initialSpec || defaultSpecFor(columnType, topCategories);

  const notify = (updatedSpec) => {
    renderSummary(container, values, updatedSpec);
    opts.onChange(updatedSpec);
  };

  if (spec.kind === "numeric") {
    renderNumericEditor(container, spec, (updatedSpec) => {
      notify(updatedSpec);
      drawNumericPreview();
    });
    var drawNumericPreview = () => {
      const classify = classifierFromSpec(spec);
      const xs = sampleValues.map(parseNumeric).filter((v) => v !== null);
      const control = [];
      const treated = [];
      const excluded = [];
      for (const v of xs) {
        const bucket = classify(v);
        if (bucket === "control") control.push(v);
        else if (bucket === "treated") treated.push(v);
        else excluded.push(v);
      }
      Plotly.newPlot(
        "tw-numeric-plot",
        [
          // Full/excluded distribution first and pale, so Control/Treated
          // stand out on top of it - by default (no ranges set) this is
          // the whole column, letting you see what you're picking from.
          { x: excluded, name: "Excluded", type: "histogram", opacity: 0.5, marker: { color: "#c8c8c8" } },
          { x: control, name: "Control", type: "histogram", opacity: 0.7, marker: { color: "#3D85C6" } },
          { x: treated, name: "Treated", type: "histogram", opacity: 0.7, marker: { color: "#e03e2d" } },
        ],
        { barmode: "overlay", margin: { t: 20, r: 20, b: 40, l: 40 }, xaxis: { title: "Value" } },
        { responsive: true, displaylogo: false }
      );
    };
    drawNumericPreview();
  } else {
    renderCategoricalEditor(container, spec, topCategories, notify);
  }

  renderSummary(container, values, spec);

  return { getSpec: () => spec };
}
