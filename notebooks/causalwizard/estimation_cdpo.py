"""CD+PO estimation: dispatches on `identification.model.key` from the
config (the exact "<estimand>.<estimator>" string `causal-methods.js`
already generates client-side) to the right estimator.

Propensity weighting/matching/stratification, Double ML, IV, and
frontdoor all use DoWhy/EconML's own implementations directly - genuinely
hard statistical machinery, not worth reimplementing. Linear regression
and GLM are implemented here via statsmodels instead of DoWhy's built-in
RegressionEstimator: a hand-rolled version gives direct control over the
do-operator (set every row's treatment to a fixed value, predict) that
counterfactuals.py needs, via the same g-computation machinery used to
compute the headline effect below, rather than depending on DoWhy's own
(allowlisted, narrower) get_interventional_outcomes. (DoWhy 0.12's own
RegressionEstimator also has a real bug under pandas>=3.0 - positional
indexing into a name-indexed Series - which is why requirements.txt pins
pandas<3.0; that bug affects the frontdoor estimator too, which chains
through the same class internally, so it isn't dodged by this rewrite.)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

PredictFn = Callable[[pd.DataFrame, "float | None"], pd.Series]

# Which estimators support the do-operator (set every row's treatment to a
# fixed value, predict outcome) - needed for counterfactuals.py and for
# computing ATE/ATT/ATC here via g-computation. Propensity/DML/IV/frontdoor
# don't have a simple "predict outcome given treatment" interface (matches
# the old site's own scope for this feature).
DO_OPERATOR_ESTIMATORS = {"linear_regression", "generalized_linear_model"}


@dataclass
class CdpoEstimate:
    method_key: str
    estimand_type: str
    estimator: str
    effect: float
    predict: PredictFn | None  # do-operator; None if this estimator doesn't support one
    dowhy_estimate: object | None  # DoWhy CausalEstimate, for refutation/bootstrap CI - None for own regression/GLM
    coefficients: dict | None = None  # {term: coef}, own regression/GLM only - feature-importance display


def _q(name: str) -> str:
    return f"Q({name!r})"


def _formula(outcome_col: str, treatment_col: str, covariate_cols: list[str], covariate_types: dict) -> str:
    terms = [_q(treatment_col)] + [
        f"C({_q(c)})" if covariate_types.get(c) == "categorical" else _q(c) for c in covariate_cols
    ]
    return f"{_q(outcome_col)} ~ " + " + ".join(terms)


def _fit_own_regression(df, treatment_col, outcome_col, covariate_cols, covariate_types, outcome_is_binary):
    formula = _formula(outcome_col, treatment_col, covariate_cols, covariate_types)
    if outcome_is_binary:
        result = smf.glm(formula, data=df, family=sm.families.Binomial()).fit()
    else:
        result = smf.ols(formula, data=df).fit()

    def predict(data: pd.DataFrame, fixed_treatment_value: float | None = None) -> pd.Series:
        d = data if fixed_treatment_value is None else data.assign(**{treatment_col: fixed_treatment_value})
        return result.predict(d)

    return result, predict


def _effect_via_gcomputation(predict: PredictFn, df: pd.DataFrame, treatment_col: str, target_units: str) -> float:
    """ATE/ATT/ATC as an average predicted-outcome difference between
    "everyone treated" and "everyone control" (g-computation) - works
    uniformly for both linear regression (where it reduces to exactly the
    treatment coefficient) and GLM (where it gives a real average
    probability difference, not a log-odds coefficient), and reuses the
    same do-operator counterfactuals.py needs elsewhere."""
    if target_units == "att":
        subset = df[df[treatment_col] == 1]
    elif target_units == "atc":
        subset = df[df[treatment_col] == 0]
    else:
        subset = df
    if len(subset) == 0:
        return float("nan")
    return float((predict(subset, 1.0) - predict(subset, 0.0)).mean())


def estimate(
    model,
    identified,
    method_key: str,
    df: pd.DataFrame,
    treatment_col: str,
    outcome_col: str,
    covariate_cols: list[str],
    covariate_types: dict,
    outcome_is_binary: bool,
    target_units: str,
) -> CdpoEstimate:
    estimand_type, estimator = method_key.split(".", 1)

    if estimator in DO_OPERATOR_ESTIMATORS:
        result, predict = _fit_own_regression(
            df, treatment_col, outcome_col, covariate_cols, covariate_types, outcome_is_binary
        )
        effect = _effect_via_gcomputation(predict, df, treatment_col, target_units)
        coefficients = {str(k): float(v) for k, v in result.params.items()}
        return CdpoEstimate(method_key, estimand_type, estimator, effect, predict, None, coefficients)

    if estimator == "econml.dml.DML":
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        from sklearn.linear_model import LinearRegression

        model_y = GradientBoostingClassifier() if outcome_is_binary else GradientBoostingRegressor()
        dowhy_estimate = model.estimate_effect(
            identified,
            method_name=f"{estimand_type}.{estimator}",
            target_units=target_units,
            test_significance=False,
            confidence_intervals=False,
            method_params={
                "init_params": {
                    "model_y": model_y,
                    "model_t": GradientBoostingClassifier(),
                    "model_final": LinearRegression(),
                    "discrete_treatment": True,
                },
                "fit_params": {},
            },
        )
    else:
        dowhy_estimate = model.estimate_effect(
            identified,
            method_name=f"{estimand_type}.{estimator}",
            target_units=target_units,
            test_significance=False,
            confidence_intervals=False,
        )

    effect = float(np.ravel(dowhy_estimate.value)[0])
    return CdpoEstimate(method_key, estimand_type, estimator, effect, None, dowhy_estimate, None)
