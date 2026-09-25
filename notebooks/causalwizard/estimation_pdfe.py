"""Panel Data with Fixed Effects: two-way fixed effects via the standard
demean(entity) + demean(time) + OLS approach (not `linearmodels.PanelOLS` -
this is deliberately the simple, well-understood textbook method, matching
the old site's own approach) - but with genuine entity-clustered standard
errors (`cov_type="cluster"`), which the old code's own comment claimed to
do but didn't (it used heteroskedasticity-robust HC1 only). Binary outcomes
still get plain OLS (a linear probability model) rather than a fixed-effects
logit - this is standard, accepted econometric practice for panel FE models
(a "real" panel logit with entity fixed effects has its own well-known
problems - the incidental parameters problem - that a linear probability
model sidesteps), not a capability gap being silently carried over.

Entity, time, and covariates are all independently optional - only
treatment and outcome are mandatory. Demeaning by whichever of
entity/time is actually set (both, one, or neither) degrades this cleanly
to two-way FE, one-way FE, or plain OLS - with no entity to cluster by,
standard errors fall back to heteroskedasticity-robust (HC1) rather than
entity-clustered, since clustering needs a grouping variable to cluster on.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd
import statsmodels.formula.api as smf


def _q(name: str) -> str:
    return f"Q({name!r})"


@dataclass
class DemeanState:
    entity_col: str | None
    time_col: str | None
    entity_means: dict  # {column: {entity_value: mean}}
    time_means: dict  # {column: {time_value: mean}}
    columns: list[str]


def _demean(df: pd.DataFrame, entity_col: str | None, time_col: str | None, columns: list[str]) -> tuple[pd.DataFrame, DemeanState]:
    work = df.copy()
    entity_means: dict = {}
    time_means: dict = {}
    for col in columns:
        if entity_col:
            entity_mean = work.groupby(entity_col)[col].transform("mean")
            entity_means[col] = work.groupby(entity_col)[col].mean().to_dict()
            work[col] = work[col] - entity_mean

        if time_col:
            time_mean = work.groupby(time_col)[col].transform("mean")
            time_means[col] = work.groupby(time_col)[col].mean().to_dict()
            work[col] = work[col] - time_mean
    return work, DemeanState(entity_col, time_col, entity_means, time_means, columns)


def _redemean_new_rows(df: pd.DataFrame, state: DemeanState) -> pd.DataFrame:
    """Applies the *already-fitted* entity/time means to (possibly
    counterfactual) rows - same entities/times as the training data, just
    predicting under a hypothetical treatment value. Unseen entity/time
    values fall back to the grand mean (0, since means were subtracted at
    fit time) - reasonable for a held-out row sharing entities/times with
    the training panel, which is the only case this is used for."""
    work = df.copy()
    for col in state.columns:
        if col not in work.columns:
            continue
        if state.entity_col:
            entity_mean = work[state.entity_col].map(state.entity_means[col]).fillna(0.0)
            work[col] = work[col] - entity_mean
        if state.time_col:
            time_mean = work[state.time_col].map(state.time_means[col]).fillna(0.0)
            work[col] = work[col] - time_mean
    return work


@dataclass
class PdfeEstimate:
    effect: float  # treatment coefficient - the ATT DoWhy/EconML would call it, per the old site's convention of always using ATT for PD+FE
    result: object  # fitted statsmodels result (cov_type="cluster")
    predict: Callable[[pd.DataFrame, "float | None"], pd.Series]
    coefficients: dict  # {term: coef}, for feature-importance display
    z_pvalue: float  # treatment coefficient's own significance
    f_pvalue: float  # overall model significance


def estimate(
    df: pd.DataFrame,
    entity_col: str | None,
    time_col: str | None,
    treatment_col: str,
    outcome_col: str,
    covariate_cols: list[str],
    covariate_types: dict,
) -> PdfeEstimate:
    demean_cols = [outcome_col, treatment_col] + [c for c in covariate_cols if covariate_types.get(c) != "categorical"]
    work, state = _demean(df, entity_col, time_col, demean_cols)

    categorical_covariates = [c for c in covariate_cols if covariate_types.get(c) == "categorical"]
    for c in categorical_covariates:
        work[c] = df[c].values  # categorical covariates are dummy-encoded by the formula, not demeaned

    terms = [_q(treatment_col)] + [_q(c) for c in demean_cols if c not in (outcome_col, treatment_col)]
    terms += [f"C({_q(c)})" for c in categorical_covariates]
    formula = f"{_q(outcome_col)} ~ " + " + ".join(terms) if terms else f"{_q(outcome_col)} ~ {_q(treatment_col)}"
    # Entity-clustered SEs need an entity to cluster on; with none, fall back
    # to heteroskedasticity-robust (HC1) - still robust, just not clustered.
    if entity_col:
        result = smf.ols(formula, data=work).fit(cov_type="cluster", cov_kwds={"groups": df[entity_col]})
    else:
        result = smf.ols(formula, data=work).fit(cov_type="HC1")

    def predict(data: pd.DataFrame, fixed_treatment_value: float | None = None) -> pd.Series:
        d = data if fixed_treatment_value is None else data.assign(**{treatment_col: fixed_treatment_value})
        demeaned = _redemean_new_rows(d, state)
        for c in categorical_covariates:
            demeaned[c] = d[c].values
        predicted_demeaned = result.predict(demeaned)
        # undo the demeaning to bring the prediction back to the outcome's original scale
        entity_mean = d[entity_col].map(state.entity_means[outcome_col]).fillna(0.0) if entity_col else 0.0
        time_mean = d[time_col].map(state.time_means[outcome_col]).fillna(0.0) if time_col else 0.0
        entity_mean = entity_mean.values if entity_col else entity_mean
        time_mean = time_mean.values if time_col else time_mean
        return predicted_demeaned + entity_mean + time_mean

    treatment_term = _q(treatment_col)
    coefficients = {str(k): float(v) for k, v in result.params.items()}
    return PdfeEstimate(
        effect=float(result.params[treatment_term]),
        result=result,
        predict=predict,
        coefficients=coefficients,
        z_pvalue=float(result.pvalues[treatment_term]),
        f_pvalue=float(result.f_pvalue),
    )
