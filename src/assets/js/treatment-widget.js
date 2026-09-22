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
      // "grouped" (thresholded into Control/Treated, as below) or
      // "continuous" (used as-is; see allowContinuous on
      // renderTreatmentWidget). Only meaningful for numeric columns - a
      // categorical treatment has no continuous reading.
      design: "grouped",
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

/** Plotly auto-bins each histogram trace independently by default, so the
 * Control/Treated/Excluded traces (each a different subset of the data)
 * get different bin edges - even a uniform shared grid isn't enough, since
 * a bin can still straddle a group's own cutoff (e.g. a bin covering
 * [6.5, 7.2) makes a "< 7" Control cutoff and a ">= 7" Treated cutoff look
 * like they overlap at that bar, even though no value is double-counted).
 * This builds bin edges that always land exactly on every finite group
 * threshold in `spec`, with a "nice enough" number of sub-bins filling in
 * the space between thresholds so the plot still looks like a histogram. */
function thresholdAwareBins(xs, spec) {
  const dataMin = Math.min(...xs);
  const dataMax = Math.max(...xs);
  if (dataMin === dataMax) return [dataMin - 0.5, dataMax + 0.5];

  const thresholds = [spec.control.min, spec.control.max, spec.treated.min, spec.treated.max].filter(
    (v) => v !== null && v !== undefined && v > dataMin && v < dataMax
  );
  const breakpoints = Array.from(new Set([dataMin, ...thresholds, dataMax])).sort((a, b) => a - b);

  const TARGET_BINS = 30;
  const totalSpan = dataMax - dataMin;
  const edges = [breakpoints[0]];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const segStart = breakpoints[i];
    const segEnd = breakpoints[i + 1];
    const span = segEnd - segStart;
    if (span <= 0) continue;
    const nBins = Math.max(1, Math.round((span / totalSpan) * TARGET_BINS));
    const step = span / nBins;
    for (let j = 1; j <= nBins; j++) edges.push(segStart + step * j);
  }
  return edges;
}

/** Counts how many values fall in each [edges[i], edges[i+1]) bin (last bin
 * is closed on both ends, so the max value isn't dropped). */
function binCounts(xs, edges) {
  const counts = new Array(edges.length - 1).fill(0);
  for (const v of xs) {
    for (let i = 0; i < edges.length - 1; i++) {
      const isLast = i === edges.length - 2;
      if (v >= edges[i] && (v < edges[i + 1] || (isLast && v <= edges[i + 1]))) {
        counts[i] += 1;
        break;
      }
    }
  }
  return counts;
}

function numericDesignRadioHtml(design) {
  return `
    <div class="mb-3">
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" name="tw-design" id="tw-design-grouped" value="grouped" ${design !== "continuous" ? "checked" : ""}>
        <label class="form-check-label" for="tw-design-grouped">Split into Control / Treated groups</label>
      </div>
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" name="tw-design" id="tw-design-continuous" value="continuous" ${design === "continuous" ? "checked" : ""}>
        <label class="form-check-label" for="tw-design-continuous">Use as a continuous value (e.g. effect per unit increase)</label>
      </div>
      <a href="/articles/control-and-treated/" target="_blank" class="small">More info</a>
    </div>`;
}

/** allowContinuous: whether to offer the grouped/continuous choice at all -
 * only the study page's identification/estimation flow cares about that
 * distinction, so the dataset page's Treatment/balance tab (which always
 * needs a Control/Treated split to compute anything) omits it and always
 * gets the grouped editor, regardless of `spec.design`. */
function renderNumericEditor(container, spec, allowContinuous, onChange) {
  const continuous = allowContinuous && spec.design === "continuous";
  container.innerHTML = `
    ${allowContinuous ? numericDesignRadioHtml(spec.design) : ""}
    ${
      continuous
        ? `<p class="text-muted mb-0">Continuous treatment.</p>`
        : `
      ${numericGroupHtml("control", "Control", spec.control)}
      ${numericGroupHtml("treated", "Treated", spec.treated)}
      <p class="text-muted">Values matching neither range are excluded (shown in grey below). Leave a group's bounds empty to disable it.</p>
      <div id="tw-numeric-plot" style="height:300px;"></div>
      <div id="tw-summary"></div>`
    }`;

  if (allowContinuous) {
    container.querySelectorAll('input[name="tw-design"]').forEach((el) => {
      el.addEventListener("change", (e) => {
        spec.design = e.target.value;
        renderNumericEditor(container, spec, allowContinuous, onChange);
        onChange(spec);
      });
    });
  }

  if (continuous) return;

  function readGroup(prefix) {
    const num = (el) => (el.value.trim() === "" ? null : Number(el.value));
    return {
      min: num(container.querySelector(`[data-role="${prefix}-min"]`)),
      minOp: container.querySelector(`[data-role="${prefix}-minOp"]`).value,
      max: num(container.querySelector(`[data-role="${prefix}-max"]`)),
      maxOp: container.querySelector(`[data-role="${prefix}-maxOp"]`).value,
    };
  }

  container.querySelectorAll("[data-role]").forEach((el) => {
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
    ${
      truncated
        ? `<p class="alert alert-warning">Showing the ${MAX_ROWS} most common values of ${valueCounts.length} (counted across the whole column, not a sample) - the other ${valueCounts.length - MAX_ROWS} aren't listed below individually, and are classified only by whichever "everything not listed" option you choose next (or excluded, if neither is checked). This column may be too high-cardinality to use as a treatment.</p>`
        : ""
    }
    <p class="text-muted mb-2">
      A value's Control/Treated/Exclude button below always takes priority. For everything
      else${truncated ? " - including every value not listed above" : ""} - pick a default:
    </p>
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="tw-control-anything" ${spec.controlAnything ? "checked" : ""}>
      <label class="form-check-label" for="tw-control-anything">Everything not listed below is Control</label>
    </div>
    <div class="form-check form-check-inline">
      <input class="form-check-input" type="checkbox" id="tw-treated-anything" ${spec.treatedAnything ? "checked" : ""}>
      <label class="form-check-label" for="tw-treated-anything">Everything not listed below is Treated</label>
    </div>
    <p class="text-muted small mb-2">Only one can be checked at a time. If neither is checked, anything not explicitly assigned is excluded.</p>
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
 * @param {object} opts { columnType, values (full column), sampleValues (for the numeric preview plot), topCategories, initialSpec, onChange(spec), allowContinuous }
 * @param {boolean} [opts.allowContinuous] offer the grouped/continuous choice for numeric columns - see renderNumericEditor()
 * @returns {{getSpec: () => object}}
 */
export function renderTreatmentWidget(container, opts) {
  const { columnType, values, sampleValues, topCategories, allowContinuous = false } = opts;
  const spec = opts.initialSpec || defaultSpecFor(columnType, topCategories);

  const notify = (updatedSpec) => {
    renderSummary(container, values, updatedSpec);
    opts.onChange(updatedSpec);
  };

  if (spec.kind === "numeric") {
    renderNumericEditor(container, spec, allowContinuous, (updatedSpec) => {
      notify(updatedSpec);
      drawNumericPreview();
    });
    var drawNumericPreview = () => {
      if (allowContinuous && spec.design === "continuous") return; // nothing to plot - no #tw-numeric-plot element either
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
      // Plotly's histogram trace can only bin on a uniform grid, so the
      // bars are built by hand from thresholdAwareBins()/binCounts() and
      // rendered as a "bar" trace instead - the only way to guarantee a
      // bin edge sits exactly on each group's cutoff.
      const edges = thresholdAwareBins(xs, spec);
      const widths = edges.slice(1).map((e, i) => e - edges[i]);
      const centers = edges.slice(1).map((e, i) => (e + edges[i]) / 2);
      const bar = (data, name, color, opacity) => ({
        x: centers,
        y: binCounts(data, edges),
        width: widths,
        name,
        type: "bar",
        opacity,
        marker: { color },
      });
      Plotly.newPlot(
        "tw-numeric-plot",
        [
          // Full/excluded distribution first and pale, so Control/Treated
          // stand out on top of it - by default (no ranges set) this is
          // the whole column, letting you see what you're picking from.
          bar(excluded, "Excluded", "#c8c8c8", 0.5),
          bar(control, "Control", "#3D85C6", 0.7),
          bar(treated, "Treated", "#e03e2d", 0.7),
        ],
        { barmode: "overlay", bargap: 0, margin: { t: 20, r: 20, b: 40, l: 40 }, xaxis: { title: "Value" } },
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
