// The "Check" pipeline: validates a study's graph + question against its
// dataset, then runs identification. Order follows the old site's
// validate() (identification.py): missing/duplicate treatment-outcome ->
// outcome usability -> treatment group sizes -> covariate cardinality ->
// method-specific identification (CD+PO graph identification, or PDFE
// panel-structure checks).
//
// Variable types are resolved via `resolveType(name)` (study-view.js's
// effectiveVariableType - see its docs), not read directly off the dataset
// schema, so a user's "treat this numeric column as categorical" override
// is respected everywhere a type matters, not just in the diagram.

import { identifyEffect } from "./identify.js";
import { classifierFromSpec } from "../treatment-widget.js";
import { getCompatibleModels, ESTIMAND_TYPE } from "./causal-methods.js";

function outcomeUsability(outcomeCol, effectiveType) {
  if (!outcomeCol) return { usable: false, cardinality: null };
  if (effectiveType === "numerical") return { usable: true, cardinality: null };
  // categorical: only usable if binary
  return { usable: outcomeCol.uniqueCount === 2, cardinality: outcomeCol.uniqueCount ?? null };
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

function checkCovariateCardinality(graph, treatment, outcome, schemaColumns, resolveType) {
  for (const node of graph.nodes) {
    if (node === treatment || node === outcome) continue;
    if (node.startsWith("u") || node.startsWith("x")) continue; // no data to check
    const col = schemaColumns.find((c) => c.name === node);
    if (!col) continue;
    const isCategorical = resolveType ? resolveType(node) === "categorical" : col.type === "categorical" || col.type === "text";
    if (isCategorical && col.uniqueCount > 10) return false;
  }
  return true;
}

/**
 * @param question the study's `question` object (see studies/db.js)
 * @param graph the study's `graph` object ({nodes, edges, variableTypes})
 * @param datasetColumns columnar dataset values, keyed by column name
 * @param datasetSchema the dataset's full-scan schema (from datasets/db.js)
 * @param resolveType (name) => "numerical" | "categorical" - the same
 *   resolution used to drive the diagram/type selectors
 * @returns {{valid: boolean, issues?: string[], estimands?: object[], groupCounts?: object}}
 */
export function runCheck({ question, graph, datasetColumns, datasetSchema, resolveType }) {
  const { treatment, outcome, method, treatmentSpec, panelData } = question;

  if (!treatment || !outcome) return { valid: false, issues: ["treatment_or_outcome_missing"] };
  if (treatment === outcome) return { valid: false, issues: ["treatment_is_outcome"] };

  const schemaColumns = datasetSchema?.columns || [];
  const outcomeCol = schemaColumns.find((c) => c.name === outcome);
  const outcomeEffectiveType = resolveType ? resolveType(outcome) : outcomeCol?.type === "numeric" ? "numerical" : "categorical";
  const { usable: outcomeUsable, cardinality: outcomeCardinality } = outcomeUsability(outcomeCol, outcomeEffectiveType);
  const outcomeType = outcomeEffectiveType === "numerical" ? "numeric" : "categorical";

  const issues = [];
  if (!outcomeUsable) issues.push("excessive_cardinality_outcome");

  // A numeric treatment can be marked "continuous" (see treatment-widget.js
  // - only numeric columns offer that choice) instead of thresholded into
  // Control/Treated groups - in that case there are no groups to validate.
  const isContinuousTreatment = treatmentSpec?.kind === "numeric" && treatmentSpec?.design === "continuous";

  let groupCounts = null;
  if (!isContinuousTreatment) {
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

  if (!checkCovariateCardinality(graph, treatment, outcome, schemaColumns, resolveType)) {
    issues.push("excessive_cardinality");
  }

  if (issues.length > 0) return { valid: false, issues };

  if (method === "pd+fe") {
    return runPanelDataCheck({ panelData, outcomeType, outcomeCardinality });
  }

  const observable = new Set(graph.nodes.filter((n) => !n.startsWith("u")));
  const result = identifyEffect(graph, treatment, outcome, observable, { outcomeType, outcomeCardinality });
  if (!result.valid) {
    return { valid: false, issues: [result.issue || "no_valid_estimand"] };
  }
  return { valid: true, estimands: result.estimands, groupCounts };
}

function runPanelDataCheck({ panelData, outcomeType, outcomeCardinality }) {
  // Entity/time are optional - without them this is just an ordinary
  // regression (no fixed effects), which the notebook handles directly.
  // Repeated entity/time combinations are fine (e.g. several individual
  // units - branches, accounts - sharing the same coarser group/period
  // cell, a standard repeated-cross-section panel design): the notebook's
  // demeaning is a plain groupby-mean, which handles multiple rows per
  // entity and/or per time perfectly well, and entity-clustered SEs are
  // if anything more appropriate with them (that's exactly what
  // clustering corrects for) - so this used to reject that as an error,
  // which was wrong.
  const estimand = {
    type: ESTIMAND_TYPE.FIXED_EFFECTS,
    name: "Fixed Effects",
    variables: panelData.covariates || [],
    models: getCompatibleModels(ESTIMAND_TYPE.FIXED_EFFECTS, { outcomeType, outcomeCardinality }),
  };
  return { valid: true, estimands: [estimand] };
}
