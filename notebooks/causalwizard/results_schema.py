"""The results.json contract: notebook 1 writes exactly this shape,
notebook 2 only reads it - modeled on the old site's own already-proven
`resultData.result` JSON (reverse-engineered from `result.js`), adapted to
this project's config field names, since that shape already covers every
one of the 13 result-page display features.
"""

from __future__ import annotations

import json


def build_results(
    *,
    method: str,
    treatment_col: str,
    outcome_col: str,
    treatment_is_continuous: bool,
    outcome_effective_type: str,
    outcome_class1_label: str | None,
    target_units: str,
    effect: float,
    estimand_type: str | None,
    estimand_expression: str | None,
    estimator_name: str,
    method_key: str,
    assumptions: dict | None,
    validation: dict,
    accept: bool,
    counterfactuals: dict,
    counterfactual_control_value: float,
    counterfactual_treated_value: float,
    generalization: dict | None,
    contingency: dict,
    sample_counts: dict,
    propensity_analysis: dict | None,
    modelling_statements: dict,
    panel_data: dict | None,
    dropped_excluded: int,
    dropped_na: int,
    train_predictions: dict | None = None,
    estimand_variables: list[str] | None = None,
) -> dict:
    return {
        "schemaVersion": 1,
        "question": {
            "method": method,
            "treatment": treatment_col,
            "outcome": outcome_col,
            "treatmentIsContinuous": treatment_is_continuous,
            "outcomeType": outcome_effective_type,
            "outcomeClass1Label": outcome_class1_label,
            "targetUnits": target_units,
            "panelData": panel_data,
        },
        "estimate": {
            "methodKey": method_key,
            "estimatorName": estimator_name,
            "effect": effect,
            "estimandType": estimand_type,
            "estimandExpression": estimand_expression,
            "assumptions": assumptions,
            "validation": validation,
            "accept": accept,
            "counterfactuals": counterfactuals,
            "counterfactualControlValue": counterfactual_control_value,
            "counterfactualTreatedValue": counterfactual_treated_value,
            "generalization": generalization,
            "propensityAnalysis": propensity_analysis,
            "trainPredictions": train_predictions,
            "estimandVariables": estimand_variables or [],
        },
        "sample": {
            "contingencyTable": contingency,
            "counts": sample_counts,
            "droppedExcluded": dropped_excluded,
            "droppedNa": dropped_na,
        },
        "modellingStatements": modelling_statements,
    }


def save_results(results: dict, path: str) -> None:
    with open(path, "w") as f:
        json.dump(results, f, indent=2, default=str)


def load_results(path: str) -> dict:
    with open(path) as f:
        return json.load(f)
