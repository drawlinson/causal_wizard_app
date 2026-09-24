"""CD+PO estimation: dispatches on `identification.model.key` from the
config (the exact "<estimand>.<estimator>" string `causal-methods.js`
already generates client-side) to the right estimator.

Propensity weighting/matching/stratification, Double ML, IV, and
frontdoor all use DoWhy/EconML's own implementations directly - genuinely
hard statistical machinery, not worth reimplementing. Double ML gets a
do-operator too (see _dml_predict below), built from EconML's own
`.effect(X, T0=, T1=)` rather than a hand-rolled model - it supports the
counterfactual table but NOT a held-out generalization check (see that
function's docstring for why). Propensity/IV/frontdoor still have no
do-operator - no comparable "predict Y for new X" hook exists for them.

Linear regression and GLM are *also* fit here via statsmodels directly
(not just left to DoWhy's own built-in RegressionEstimator), because a
hand-rolled version gives direct control over the do-operator (set every
row's treatment to a fixed value, predict) that counterfactuals.py needs,
via the same g-computation machinery used to compute the headline effect
below - and because fitting via a real patsy formula keeps real column
names in the coefficient table (`Q('Age')`, not DoWhy's own raw-array
fit's anonymous `x1`/`x2`), which matters for the "Summary results"
notebook section. But this estimator *also* separately calls DoWhy's own
`model.estimate_effect()` for the same method, purely so its refuters can
run against a real DoWhy CausalEstimate (refute_estimate() needs one) -
DoWhy 0.12's own RegressionEstimator had a real bug under pandas>=3.0
(positional indexing into a name-indexed Series) that made this
impossible at first, but requirements.txt now pins pandas<3.0, which
fixes it (confirmed: both fits agree on the effect to several sig figs).
That pin still matters for the frontdoor estimator, which chains through
the same buggy class internally and has no hand-rolled bypass.
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
    dowhy_estimate: object | None  # DoWhy CausalEstimate, for refutation/bootstrap CI - always set for CD+PO
    coefficients: dict | None = None  # {term: coef}, own regression/GLM only - feature-importance display
    summary_text: str | None = None  # str(result.summary()) - own regression/GLM only


def _q(name: str) -> str:
    return f"Q({name!r})"


def _formula(outcome_col: str, treatment_col: str, covariate_cols: list[str], covariate_types: dict) -> str:
    terms = [_q(treatment_col)] + [
        f"C({_q(c)})" if covariate_types.get(c) == "categorical" else _q(c) for c in covariate_cols
    ]
    return f"{_q(outcome_col)} ~ " + " + ".join(terms)


def glm_family(outcome_is_binary: bool):
    """The site always offers GLM for a binary-categorical outcome or a
    numerical one ("suitable for... numerical outcomes such as count
    data" - causal-methods.js's own GLM warning text), never anything
    else (the old site's algorithm - causal_methods.py's
    add_method_specific_params() - raised NotImplementedError for any
    other categorical cardinality, which our own config.py already
    enforces upstream by requiring exactly 2 categories). Binomial for
    the binary case (logistic regression); Poisson for the numerical one
    (count-data regression) - not Gaussian, matching that same algorithm."""
    return sm.families.Binomial() if outcome_is_binary else sm.families.Poisson()


def _fit_own_regression(df, treatment_col, outcome_col, covariate_cols, covariate_types, estimator, outcome_is_binary):
    formula = _formula(outcome_col, treatment_col, covariate_cols, covariate_types)
    if estimator == "generalized_linear_model":
        result = smf.glm(formula, data=df, family=glm_family(outcome_is_binary)).fit()
    else:
        # linear_regression is always plain OLS, regardless of outcome type -
        # a linear probability model for a binary outcome, same as PD+FE's own
        # always-OLS choice (see estimation_pdfe.py) - not conflated with GLM's
        # own outcome-type-dependent family selection above.
        result = smf.ols(formula, data=df).fit()

    def predict(data: pd.DataFrame, fixed_treatment_value: float | None = None) -> pd.Series:
        d = data if fixed_treatment_value is None else data.assign(**{treatment_col: fixed_treatment_value})
        return result.predict(d)

    return result, predict


def _effect_via_gcomputation(predict: PredictFn, df: pd.DataFrame, treatment_col: str, target_units: str) -> float:
    """ATE/ATT/ATC as an average predicted-outcome difference between
    "everyone treated" and "everyone control" (g-computation) - works
    uniformly for linear regression (reduces to exactly the treatment
    coefficient), Binomial GLM (a real average probability difference, not
    a log-odds coefficient), and Poisson GLM (a real average count-rate
    difference, not a log-rate coefficient), and reuses the same
    do-operator counterfactuals.py needs elsewhere."""
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
            df, treatment_col, outcome_col, covariate_cols, covariate_types, estimator, outcome_is_binary
        )
        effect = _effect_via_gcomputation(predict, df, treatment_col, target_units)
        coefficients = {str(k): float(v) for k, v in result.params.items()}
        # Separate DoWhy-native fit of the *same* model, purely so refute_estimate()
        # has a real CausalEstimate to run its refuters against - see module docstring.
        # GLM requires glm_family explicitly - it has no way to infer it from the
        # data the way our own _fit_own_regression() (via glm_family()) does.
        method_params = {"glm_family": glm_family(outcome_is_binary)} if estimator == "generalized_linear_model" else None
        dowhy_estimate = model.estimate_effect(
            identified, method_name=method_key, target_units=target_units,
            test_significance=False, confidence_intervals=False, method_params=method_params,
        )
        return CdpoEstimate(method_key, estimand_type, estimator, effect, predict, dowhy_estimate, coefficients, str(result.summary()))

    if estimator == "econml.dml.DML":
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        from sklearn.linear_model import LinearRegression

        # random_state pinned on both nuisance models: unset, GradientBoosting's
        # own randomness (unrelated to cross-fit sample splitting, which DML
        # seeds separately) made the effect wildly irreproducible run-to-run
        # on this dataset's size - swings of 1000+, including sign flips,
        # from the exact same train_df.
        model_y = (
            GradientBoostingClassifier(random_state=42) if outcome_is_binary else GradientBoostingRegressor(random_state=42)
        )
        dowhy_estimate = model.estimate_effect(
            identified,
            method_name=f"{estimand_type}.{estimator}",
            target_units=target_units,
            test_significance=False,
            confidence_intervals=False,
            method_params={
                "init_params": {
                    "model_y": model_y,
                    "model_t": GradientBoostingClassifier(random_state=42),
                    "model_final": LinearRegression(),
                    "discrete_treatment": True,
                    "random_state": 42,
                },
                "fit_params": {},
            },
        )
        effect = float(np.ravel(dowhy_estimate.value)[0])
        predict = _dml_predict(dowhy_estimate, treatment_col, outcome_col)
        return CdpoEstimate(method_key, estimand_type, estimator, effect, predict, dowhy_estimate, None)

    dowhy_estimate = model.estimate_effect(
        identified,
        method_name=f"{estimand_type}.{estimator}",
        target_units=target_units,
        test_significance=False,
        confidence_intervals=False,
    )

    effect = float(np.ravel(dowhy_estimate.value)[0])
    return CdpoEstimate(method_key, estimand_type, estimator, effect, None, dowhy_estimate, None)


def _dml_predict(dowhy_estimate, treatment_col: str, outcome_col: str) -> PredictFn:
    """DML's do-operator: EconML's own `.effect(X, T0=, T1=)` gives the
    estimated shift in outcome from one treatment value to another (our
    config never sets effect-modifier features, so this shift is constant
    across rows, but the vectorised form is used anyway for a uniform
    per-row Series). "Predicted" for a row's *actual* treatment is just
    that row's own observed outcome (shifting from T_actual to T_actual is
    a zero shift by construction) - genuinely correct for the counterfactual
    table's "actual data" scenarios, but NOT a real fitted prediction, so
    callers must not use this for a held-out generalization check (that
    would trivially show a perfect fit)."""
    raw = dowhy_estimate.estimator.estimator

    def predict(data: pd.DataFrame, fixed_treatment_value: float | None = None) -> pd.Series:
        observed = data[outcome_col].astype(float)
        if fixed_treatment_value is None:
            return observed.copy()
        t0 = data[treatment_col].to_numpy(dtype=float)
        t1 = np.full(len(data), float(fixed_treatment_value))
        shift = raw.effect(X=None, T0=t0, T1=t1)
        return pd.Series(observed.to_numpy() + shift, index=data.index)

    return predict
