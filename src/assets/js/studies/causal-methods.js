// Estimand-type -> compatible-estimator rules, ported from the old site's
// causal_methods.py get_compatible_models(). This is a static rule table
// (which estimators make sense given the estimand type, outcome type, and
// outcome cardinality), not a computation - the notebook does the actual
// fitting.

export const ESTIMAND_TYPE = {
  FIXED_EFFECTS: "fixed-effects",
  IV: "iv",
  BACKDOOR: "backdoor",
  FRONTDOOR: "frontdoor",
};

const ESTIMATOR = {
  LR: "linear_regression",
  GLM: "generalized_linear_model",
  DML: "econml.dml.DML",
  TWO_STAGE: "two_stage_regression",
  IV: "instrumental_variable",
  PSW: "propensity_score_weighting",
  PSM: "propensity_score_matching",
  PSS: "propensity_score_stratification",
};

// Which /articles/ page explains each estimator, for a "Learn more about
// this method" link next to the model picker - keyed by ESTIMATOR value,
// since that's the specific statistical technique a user most needs
// explained (the estimand type - backdoor/frontdoor/fixed-effects - is
// already covered by the causal diagram legend and identification.html).
export const ESTIMATOR_ARTICLE_SLUGS = {
  [ESTIMATOR.LR]: "regression",
  [ESTIMATOR.GLM]: "regression",
  [ESTIMATOR.DML]: "double-ml",
  [ESTIMATOR.TWO_STAGE]: "frontdoor-variable",
  [ESTIMATOR.IV]: "iv",
  [ESTIMATOR.PSW]: "propensity-scores",
  [ESTIMATOR.PSM]: "propensity-scores",
  [ESTIMATOR.PSS]: "propensity-scores",
};

const LINEARITY_WARNING =
  "All interactions between independent variables (including Treatment) and the outcome must be linear.";

function model(estimandType, estimandName, estimatorKey, estimatorName, warnings = []) {
  return {
    estimandType,
    estimandName,
    estimatorKey,
    estimatorName,
    methodKey: `${estimandType}.${estimatorKey}`,
    methodName: `${estimandName}: ${estimatorName}`,
    warnings,
  };
}

/**
 * @param estimandType one of ESTIMAND_TYPE
 * @param backdoorVariables array (only meaningful for BACKDOOR)
 * @param outcomeType "numeric" | "boolean" | "categorical" | ... (from types.js sniffType)
 * @param outcomeCardinality distinct-value count, when known (null if no data)
 */
export function getCompatibleModels(estimandType, { backdoorVariables = [], outcomeType, outcomeCardinality } = {}) {
  const models = [];
  const outcomeIsNumeric = outcomeType === "numeric";
  const outcomeIsBinaryCategorical =
    (outcomeType === "categorical" || outcomeType === "boolean") && (outcomeCardinality === 2 || outcomeType === "boolean");

  if (estimandType === ESTIMAND_TYPE.FIXED_EFFECTS) {
    models.push(model(estimandType, "Fixed Effects", ESTIMATOR.LR, "Linear Regression", [LINEARITY_WARNING]));
  }

  if (estimandType === ESTIMAND_TYPE.BACKDOOR) {
    const name = "Backdoor";
    if (backdoorVariables.length > 0) {
      models.push(model(estimandType, name, ESTIMATOR.PSW, "Propensity Score-based Inverse Weighting"));
      models.push(model(estimandType, name, ESTIMATOR.PSM, "Propensity Score Matching"));
      models.push(model(estimandType, name, ESTIMATOR.PSS, "Propensity Score Stratification"));
    }
    models.push(model(estimandType, name, ESTIMATOR.LR, "Linear Regression", [LINEARITY_WARNING]));

    if (outcomeIsNumeric) {
      models.push(
        model(estimandType, name, ESTIMATOR.DML, "Double ML", [
          "Interactions between independent variables (including Treatment) and the outcome can be nonlinear.",
          "Uses gradient-boosted models for the outcome and treatment as appropriate to their types.",
        ])
      );
    }

    let glmCompatible = false;
    const glmWarnings = [];
    if (outcomeIsNumeric) {
      glmCompatible = true;
    } else if (outcomeIsBinaryCategorical) {
      glmCompatible = true;
    } else if (outcomeCardinality === null || outcomeCardinality === undefined) {
      glmWarnings.push("Without data, can't confirm outcome cardinality - GLM model selection depends on it.");
    }
    if (glmCompatible) {
      glmWarnings.push("Suitable for binary categorical outcomes, or numerical outcomes such as count data.");
      models.push(model(estimandType, name, ESTIMATOR.GLM, "Generalized Linear Models", glmWarnings));
    }
  }

  if (estimandType === ESTIMAND_TYPE.IV) {
    models.push(model(estimandType, "I.V.", ESTIMATOR.IV, "Instrumental Variables"));
  }

  if (estimandType === ESTIMAND_TYPE.FRONTDOOR) {
    models.push(model(estimandType, "Frontdoor", ESTIMATOR.TWO_STAGE, "Two-stage regression", ["All interactions must be linear."]));
  }

  return models;
}
