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
    baseLayout({ title }),
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
    baseLayout({ xaxis: { title: xTitle }, yaxis: { title: yTitle } }),
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
    baseLayout({ xaxis: { title: xTitle }, yaxis: { title: yTitle } }),
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
    baseLayout({ xaxis: { tickangle: -45 }, yaxis: { autorange: "reversed" } }),
    PLOTLY_CONFIG
  );
}
