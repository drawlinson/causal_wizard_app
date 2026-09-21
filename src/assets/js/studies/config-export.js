// Builds the downloadable study config JSON that the notebooks consume,
// and triggers the browser download. This is the point where this site
// hands off to Python - see ROADMAP.md stage 8.6. Schema is deliberately
// explicit/verbose (column names + types included) since there's no server
// to keep the notebook and site in sync any other way.

const SCHEMA_VERSION = 1;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "study";
}

export function buildConfig({ study, dataset, checkResult, selectedModelKey }) {
  const selectedEstimand = checkResult?.estimands?.find((e) =>
    e.models.some((m) => m.methodKey === selectedModelKey)
  );
  const selectedModel = selectedEstimand?.models.find((m) => m.methodKey === selectedModelKey);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    study: {
      name: study.name,
    },
    dataset: {
      fileName: dataset.fileName,
      expectedColumns: (dataset.schema?.columns || []).map((c) => ({ name: c.name, type: c.type })),
    },
    graph: study.graph,
    question: study.question,
    identification: selectedEstimand
      ? {
          estimandType: selectedEstimand.type,
          variables: selectedEstimand.variables,
          model: selectedModel
            ? { key: selectedModel.methodKey, name: selectedModel.methodName, warnings: selectedModel.warnings }
            : null,
        }
      : null,
  };
}

export function downloadConfig(config, study) {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(study.name)}-config.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
