"""The counterfactual-outcomes table (results-page feature 3) and
held-out generalization predictions (part of the validation section).

Mechanically: for a fixed treatment value, set every row's treatment
column to that value and predict the outcome (the "do-operator"), then
summarize. Only estimators with a `predict` function support this -
CD+PO's own linear_regression/generalized_linear_model, and PD+FE always -
matching the old site's scope (its own do-operator was only wired up for
the two equivalent CW-custom regression estimators).
"""

from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd

PredictFn = Callable[[pd.DataFrame, "float | None"], pd.Series]

SCENARIOS = [
    ("all", "All actual data"),
    ("all_if_control", "If all samples were controls"),
    ("all_if_treated", "If all samples were treated"),
    ("control", "All actual controls"),
    ("control_if_treated", "If controls were treated"),
    ("treated", "All actual treated"),
    ("treated_if_control", "If treated were controls"),
]


def display_scenarios(treatment_is_continuous: bool, treatment_col: str, control_value: float, treated_value: float) -> list[tuple[str, str]]:
    """(key, label) pairs actually worth displaying for this design - for a
    continuous treatment, only 3 of SCENARIOS' 7 keys are ever populated
    (see counterfactual_table()), and "controls"/"treated" language is
    misleading when there's no such group, just two counterfactual values -
    so those 3 get design-specific labels naming the actual values instead."""
    if not treatment_is_continuous:
        return SCENARIOS
    return [
        ("all", "All actual data"),
        ("all_if_control", f"If all samples had {treatment_col} = {control_value:.4g} (Lower)"),
        ("all_if_treated", f"If all samples had {treatment_col} = {treated_value:.4g} (Upper)"),
    ]


def _summarize(series: pd.Series) -> dict:
    series = series.dropna()
    if len(series) == 0:
        return {"count": 0, "sum": None, "mean": None}
    return {"count": int(len(series)), "sum": float(series.sum()), "mean": float(series.mean())}


def counterfactual_table(
    df: pd.DataFrame,
    treatment_col: str,
    predict: PredictFn | None,
    treatment_is_continuous: bool,
    control_value: float,
    treated_value: float,
) -> dict:
    """{scenario_key: {count, sum, mean} | None} for the 7 fixed rows. All
    None if `predict` is unsupported for the chosen estimator - the
    results page shows a "regression models only" note in that case
    rather than an empty table."""
    if predict is None:
        return {key: None for key, _ in SCENARIOS}

    if treatment_is_continuous:
        # No observed Control/Treated split to fall back on - only the
        # "all data" and "all at value X" scenarios make sense.
        result = {
            "all": _summarize(predict(df, None)),
            "all_if_control": _summarize(predict(df, control_value)),
            "all_if_treated": _summarize(predict(df, treated_value)),
            "control": None,
            "control_if_treated": None,
            "treated": None,
            "treated_if_control": None,
        }
        return result

    control_rows = df[df[treatment_col] == 0]
    treated_rows = df[df[treatment_col] == 1]
    return {
        "all": _summarize(predict(df, None)),
        "all_if_control": _summarize(predict(df, 0.0)),
        "all_if_treated": _summarize(predict(df, 1.0)),
        "control": _summarize(predict(control_rows, None)) if len(control_rows) else None,
        "control_if_treated": _summarize(predict(control_rows, 1.0)) if len(control_rows) else None,
        "treated": _summarize(predict(treated_rows, None)) if len(treated_rows) else None,
        "treated_if_control": _summarize(predict(treated_rows, 0.0)) if len(treated_rows) else None,
    }


def train_predictions(df: pd.DataFrame, predict: PredictFn | None, control_value: float, treated_value: float) -> dict | None:
    """Per-row predicted outcome (plus the two counterfactual-value
    predictions), aligned with `df`'s row order - what plotting.py's
    plot_outcomes_entity()/plot_outcomes_over_time() need to redraw those
    plots from a saved results.json alone, with no live fitted model
    (notebook 2 is pure presentation - see module docstring)."""
    if predict is None:
        return None
    return {
        "predicted": [float(v) for v in predict(df, None)],
        "counterfactualControl": [float(v) for v in predict(df, control_value)],
        "counterfactualTreated": [float(v) for v in predict(df, treated_value)],
    }


def generalization_predictions(test_df: pd.DataFrame, predict: PredictFn | None, treatment_col: str, outcome_col: str) -> dict | None:
    """{actual, predicted, treatment} parallel lists for the held-out test
    set, or None if this estimator has no predict function (same
    do-operator support gate as the counterfactual table)."""
    if predict is None or len(test_df) == 0:
        return None
    predicted = predict(test_df, None)
    return {
        "actual": test_df[outcome_col].tolist(),
        "predicted": [float(v) for v in predicted],
        "treatment": test_df[treatment_col].tolist(),
    }
