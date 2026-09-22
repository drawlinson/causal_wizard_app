import { parseNumeric } from "./types.js";

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values, m) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function median(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedValues[mid - 1] + sortedValues[mid]) / 2 : sortedValues[mid];
}

/** Full-column stats. `type` comes from sniffType() (types.js). */
export function computeColumnStats(values, type) {
  const present = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  const missingCount = values.length - present.length;

  if (type === "numeric") {
    const nums = present.map(parseNumeric).filter((n) => n !== null).sort((a, b) => a - b);
    const m = nums.length ? mean(nums) : null;
    return {
      missingCount,
      count: nums.length,
      min: nums.length ? nums[0] : null,
      max: nums.length ? nums[nums.length - 1] : null,
      mean: m,
      median: median(nums),
      std: m !== null ? stddev(nums, m) : null,
    };
  }

  // categorical / boolean / text / datetime: frequency table
  const counts = new Map();
  for (const v of present) {
    const key = String(v).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const topCategories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));

  return {
    missingCount,
    count: present.length,
    uniqueCount: counts.size,
    topCategories,
  };
}

/** Full (not top-10-capped) frequency table, for UI that needs to list
 * every distinct value - e.g. the treatment-assignment widget. Uncapped by
 * default (`limit` is only for callers that want a smaller top-N) - the
 * widget itself caps how many rows it displays, and needs the *true* count
 * of distinct values to decide whether it's showing everything or not. */
export function categoryCounts(values, limit = Infinity) {
  const counts = new Map();
  for (const v of values) {
    if (v === null || v === undefined || String(v).trim() === "") continue;
    const key = String(v).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

/** Random sample of row indices, always including the argmin/argmax row for
 * every numeric column in `numericColumnNames` (mirrors the old site's
 * approach: extremes aren't lost to a small random sample). */
export function sampleRowIndices(columns, numericColumnNames, rowCount, sampleSize) {
  if (rowCount <= sampleSize) {
    return Array.from({ length: rowCount }, (_, i) => i);
  }

  const mustInclude = new Set();
  for (const name of numericColumnNames) {
    let minIdx = -1;
    let maxIdx = -1;
    let minVal = Infinity;
    let maxVal = -Infinity;
    const col = columns[name];
    for (let i = 0; i < col.length; i++) {
      const n = parseNumeric(col[i]);
      if (n === null) continue;
      if (n < minVal) {
        minVal = n;
        minIdx = i;
      }
      if (n > maxVal) {
        maxVal = n;
        maxIdx = i;
      }
    }
    if (minIdx >= 0) mustInclude.add(minIdx);
    if (maxIdx >= 0) mustInclude.add(maxIdx);
  }

  const indices = new Set(mustInclude);
  while (indices.size < sampleSize) {
    indices.add(Math.floor(Math.random() * rowCount));
  }
  return [...indices];
}

export function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n < 2) return null;
  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

function rank(values) {
  const sorted = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[sorted[k][1]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorrelation(x, y) {
  return pearsonCorrelation(rank(x), rank(y));
}

/**
 * Splits `columnValues` into groups by `treatmentValues` and summarizes
 * each group - numeric mean/std, or category frequency. Used for both the
 * treatment-group balance check (summarizing the treatment column against
 * itself, as counts) and the covariate-balance table (summarizing every
 * other candidate covariate by treatment group).
 */
export function groupBy(treatmentValues, columnValues, columnType) {
  const groups = new Map();
  for (let i = 0; i < treatmentValues.length; i++) {
    const t = treatmentValues[i];
    if (t === null || t === undefined || String(t).trim() === "") continue;
    const key = String(t).trim();
    if (!groups.has(key)) groups.set(key, []);
    const v = columnValues[i];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      groups.get(key).push(v);
    }
  }

  const result = [];
  for (const [group, values] of groups.entries()) {
    if (columnType === "numeric") {
      const nums = values.map(parseNumeric).filter((n) => n !== null);
      const m = nums.length ? mean(nums) : null;
      result.push({
        group,
        count: nums.length,
        mean: m,
        std: m !== null ? stddev(nums, m) : null,
      });
    } else {
      const counts = new Map();
      for (const v of values) {
        const key = String(v).trim();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      result.push({
        group,
        count: values.length,
        topValue: top ? top[0] : null,
        topFraction: top ? top[1] / values.length : null,
      });
    }
  }
  return result.sort((a, b) => b.count - a.count);
}

/** Standardized mean difference between two groups - the standard "Table 1"
 * balance metric: (meanA - meanB) / pooled std dev. |SMD| > 0.1 is
 * conventionally worth a look, > 0.25 a real imbalance concern. */
export function standardizedMeanDiff(meanA, stdA, meanB, stdB) {
  const pooled = Math.sqrt((stdA ** 2 + stdB ** 2) / 2);
  if (pooled === 0) return null;
  return (meanA - meanB) / pooled;
}
