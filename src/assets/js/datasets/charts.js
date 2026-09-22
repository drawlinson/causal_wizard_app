import { parseNumeric } from "./types.js";
import { pearsonCorrelation, spearmanCorrelation } from "./stats.js";

const PLOTLY_CONFIG = { responsive: true, displaylogo: false };

function baseLayout(overrides) {
  return { margin: { t: 30, r: 20, b: 50, l: 50 }, ...overrides };
}

export function plotHistogram(elementId, values, { title, logY = false } = {}) {
  Plotly.newPlot(
    elementId,
    [{ x: values, type: "histogram" }],
    baseLayout({ title, yaxis: { type: logY ? "log" : "linear" } }),
    PLOTLY_CONFIG
  );
}

/** Bar chart of pre-aggregated category counts (e.g. from
 * computeColumnStats().topCategories) - used instead of a raw histogram
 * for categorical/text/boolean columns, so a high-cardinality text column
 * doesn't try to render thousands of bars. */
export function plotCategoryBar(elementId, topCategories, { title } = {}) {
  Plotly.newPlot(
    elementId,
    [{ x: topCategories.map((c) => c.value), y: topCategories.map((c) => c.count), type: "bar" }],
    // Force a category axis - Plotly otherwise auto-detects axis type from
    // the tick values, and switches to a numeric axis (spacing bars by
    // literal value, not evenly by rank) if the category labels happen to
    // look like numbers (e.g. numeric category codes).
    baseLayout({ title, xaxis: { type: "category" } }),
    PLOTLY_CONFIG
  );
}

export function plotScatter(elementId, xValues, yValues, { xTitle, yTitle, showTrend = true } = {}) {
  const x = xValues.map(parseNumeric);
  const y = yValues.map(parseNumeric);
  const traces = [{ x, y, mode: "markers", type: "scatter", marker: { size: 6, opacity: 0.6 } }];

  if (showTrend) {
    const valid = x.map((v, i) => [v, y[i]]).filter(([a, b]) => a !== null && b !== null);
    if (valid.length >= 2) {
      const xs = valid.map((p) => p[0]);
      const ys = valid.map((p) => p[1]);
      const n = xs.length;
      const sumX = xs.reduce((a, b) => a + b, 0);
      const sumY = ys.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((a, b, i) => a + b * ys[i], 0);
      const sumXX = xs.reduce((a, b) => a + b * b, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      traces.push({
        x: [xMin, xMax],
        y: [slope * xMin + intercept, slope * xMax + intercept],
        mode: "lines",
        type: "scatter",
        line: { color: "#e03e2d" },
        name: "trend",
      });
    }
  }

  const pearson = pearsonCorrelation(x.filter((v) => v !== null), y.filter((_, i) => x[i] !== null));
  const spearman = spearmanCorrelation(x.filter((v) => v !== null), y.filter((_, i) => x[i] !== null));

  Plotly.newPlot(
    elementId,
    traces,
    baseLayout({
      xaxis: { title: xTitle },
      yaxis: { title: yTitle },
      showlegend: false,
    }),
    PLOTLY_CONFIG
  );

  return { pearson, spearman };
}

export function plotContour(elementId, xValues, yValues, { xTitle, yTitle } = {}) {
  const x = xValues.map(parseNumeric).filter((v) => v !== null);
  const y = yValues.map(parseNumeric).filter((v) => v !== null);
  Plotly.newPlot(
    elementId,
    [{ x, y, type: "histogram2dcontour", colorscale: "Blues" }],
    baseLayout({ xaxis: { title: xTitle }, yaxis: { title: yTitle } }),
    PLOTLY_CONFIG
  );
}

export function plotViolin(elementId, categoryValues, numericValues, { xTitle, yTitle } = {}) {
  Plotly.newPlot(
    elementId,
    [
      {
        x: categoryValues,
        y: numericValues.map(parseNumeric),
        type: "violin",
        box: { visible: true },
        meanline: { visible: true },
        points: false,
      },
    ],
    // x is categorical (see xCats/yCats below for the other heatmap) - same
    // "don't let Plotly guess a numeric axis from category labels" concern.
    baseLayout({ xaxis: { title: xTitle, type: "category" }, yaxis: { title: yTitle } }),
    PLOTLY_CONFIG
  );
}

export function plotHeatmap(elementId, xValues, yValues, { xTitle, yTitle } = {}) {
  const xCats = [...new Set(xValues.map(String))];
  const yCats = [...new Set(yValues.map(String))];
  const matrix = yCats.map((yc) =>
    xCats.map(
      (xc) => xValues.filter((v, i) => String(v) === xc && String(yValues[i]) === yc).length
    )
  );
  Plotly.newPlot(
    elementId,
    [{ x: xCats, y: yCats, z: matrix, type: "heatmap", colorscale: "Blues" }],
    // Force category axes - both xCats/yCats are just column values coerced
    // to strings, which can easily look numeric (e.g. numeric category
    // codes), and Plotly would otherwise switch to a numeric axis and
    // space/skew the tiles by literal value instead of one per category.
    baseLayout({ xaxis: { title: xTitle, type: "category" }, yaxis: { title: yTitle, type: "category" } }),
    PLOTLY_CONFIG
  );
}

/** All-numeric-columns correlation matrix (Pearson), for spotting
 * collinearity/confounders at a glance. */
export function plotCorrelationHeatmap(elementId, columns, numericColumnNames) {
  const names = numericColumnNames;
  const parsed = names.map((name) => columns[name].map(parseNumeric));

  const matrix = names.map((_, i) =>
    names.map((_, j) => {
      const xi = [];
      const xj = [];
      for (let k = 0; k < parsed[i].length; k++) {
        if (parsed[i][k] !== null && parsed[j][k] !== null) {
          xi.push(parsed[i][k]);
          xj.push(parsed[j][k]);
        }
      }
      return pearsonCorrelation(xi, xj);
    })
  );

  Plotly.newPlot(
    elementId,
    [
      {
        x: names,
        y: names,
        z: matrix,
        type: "heatmap",
        zmin: -1,
        zmax: 1,
        colorscale: "RdBu",
        reversescale: true,
      },
    ],
    // Force category axes - `names` are column names, which can easily look
    // numeric (e.g. columns named by a numeric ID/index/year). Without this,
    // Plotly auto-detects a numeric axis from tick values that all parse as
    // numbers, and positions/spaces the tiles by literal numeric value
    // instead of one evenly-spaced tile per column - producing a huge,
    // mostly-empty numeric axis instead of an NxN grid.
    baseLayout({ xaxis: { tickangle: -45, type: "category" }, yaxis: { autorange: "reversed", type: "category" } }),
    PLOTLY_CONFIG
  );
}
