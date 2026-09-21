// The "Check" pipeline: validates a study's graph + question against its
// dataset, then runs identification. Order follows the old site's
// validate() (identification.py): missing/duplicate treatment-outcome ->
// outcome usability -> treatment group sizes -> covariate cardinality ->
// method-specific identification (CD+PO graph identification, or PDFE
// panel-structure checks).

import { identifyEffect } from "./identify.js";
import { classifierFromSpec } from "../treatment-widget.js";
import { getCompatibleModels, ESTIMAND_TYPE } from "./causal-methods.js";

function outcomeUsability(outcomeCol) {
  if (!outcomeCol) return { usable: false, cardinality: null };
  if (outcomeCol.type === "numeric") return { usable: true, cardinality: null };
  if (outcomeCol.type === "boolean") return { usable: true, cardinality: 2 };
  if (outcomeCol.type === "categorical" && outcomeCol.uniqueCount === 2) {
    return { usable: true, cardinality: 2 };
  }
  return { usable: false, cardinality: outcomeCol.uniqueCount ?? null };
}

function checkTreatmentGroups(treatmentSpec, values) {
  const classify = classifierFromSpec(treatmentSpec);
  let control = 0;
  let treated = 0;
  const total = values.length;
  for (const v of values) {
    const bucket = classify(v);
    if (bucket === "control") control += 1;
    else if (bucket === "treated") treated += 1;
  }
  return { control, treated, total };
}

function checkCovariateCardinality(graph, treatment, outcome, schemaColumns) {
  for (const node of graph.nodes) {
    if (node === treatment || node === outcome) continue;
    if (node.startsWith("u") || node.startsWith("x")) continue; // no data to check
    const col = schemaColumns.find((c) => c.name === node);
    if (col && (col.type === "categorical" || col.type === "text") && col.uniqueCount > 10) {
      return false;
    }
  }
  return true;
}

/**
 * @param question the study's `question` object (see studies/db.js)
 * @param graph the study's `graph` object ({nodes, edges, variableTypes})
 * @param datasetColumns columnar dataset values, keyed by column name
 * @param datasetSchema the dataset's full-scan schema (from datasets/db.js)
 * @returns {{valid: boolean, issues?: string[], estimands?: object[], groupCounts?: object}}
 */
export function runCheck({ question, graph, datasetColumns, datasetSchema }) {
  const { treatment, outcome, method, treatmentDesign, treatmentSpec, panelData } = question;

  if (!treatment || !outcome) return { valid: false, issues: ["treatment_or_outcome_missing"] };
  if (treatment === outcome) return { valid: false, issues: ["treatment_is_outcome"] };

  const schemaColumns = datasetSchema?.columns || [];
  const outcomeCol = schemaColumns.find((c) => c.name === outcome);
  const { usable: outcomeUsable, cardinality: outcomeCardinality } = outcomeUsability(outcomeCol);
  const outcomeType = outcomeCol?.type;

  const issues = [];
  if (!outcomeUsable) issues.push("excessive_cardinality_outcome");

  let groupCounts = null;
  if (treatmentDesign !== "continuous") {
    if (!treatmentSpec) {
      issues.push("treatment_group_undefined");
    } else {
      groupCounts = checkTreatmentGroups(treatmentSpec, datasetColumns[treatment]);
      if (groupCounts.control === 0) issues.push("treatment_zero_control");
      if (groupCounts.treated === 0) issues.push("treatment_zero_treated");
      if (groupCounts.control > 0 && groupCounts.treated > 0) {
        const minShare = Math.min(groupCounts.control, groupCounts.treated) / groupCounts.total;
        if (minShare < 0.05) issues.push("class_imbalance");
      }
    }
  }

  if (!checkCovariateCardinality(graph, treatment, outcome, schemaColumns)) {
    issues.push("excessive_cardinality");
  }

  if (issues.length > 0) return { valid: false, issues };

  if (method === "pd+fe") {
    return runPanelDataCheck({ panelData, datasetColumns, outcomeType, outcomeCardinality });
  }

  const observable = new Set(graph.nodes.filter((n) => !n.startsWith("u")));
  const result = identifyEffect(graph, treatment, outcome, observable, { outcomeType, outcomeCardinality });
  if (!result.valid) {
    return { valid: false, issues: [result.issue || "no_valid_estimand"] };
  }
  return { valid: true, estimands: result.estimands, groupCounts };
}

function runPanelDataCheck({ panelData, datasetColumns, outcomeType, outcomeCardinality }) {
  if (!panelData?.entity || !panelData?.time) {
    return { valid: false, issues: ["method_pdfe_no_time_series"] };
  }

  const entities = datasetColumns[panelData.entity];
  const times = datasetColumns[panelData.time];
  const seen = new Set();
  for (let i = 0; i < entities.length; i++) {
    const key = `${entities[i]}|${times[i]}`;
    if (seen.has(key)) return { valid: false, issues: ["time_non_unique"] };
    seen.add(key);
  }

  const estimand = {
    type: ESTIMAND_TYPE.FIXED_EFFECTS,
    name: "Fixed Effects",
    variables: panelData.covariates || [],
    models: getCompatibleModels(ESTIMAND_TYPE.FIXED_EFFECTS, { outcomeType, outcomeCardinality }),
  };
  return { valid: true, estimands: [estimand] };
}
