"""Contingency table, sample counts, assumptions text, and modelling
statements (results-page features 5, 8, 10). Static prose is ported
verbatim from the old site's `result_show.html`; the per-estimand
"extra assumptions" are DoWhy's own auto-generated text (see
identification.py) - nothing custom to reverse-engineer there.
"""

from __future__ import annotations

import pandas as pd

GENERAL_ASSUMPTIONS = [
    ("Data represents an unbiased sample",
     "The data used for this study should be an unbiased and representative sample of the population you want to draw conclusions about."),
    ("Domain knowledge is correctly captured",
     "The causal diagram (or panel-data structure) should correctly and completely capture the relevant domain knowledge - missing or incorrect relationships will bias the result."),
    ("The model is appropriate",
     "The chosen estimation method should be a reasonable fit for the data and the question being asked - check the validation tests above."),
    ("The sample is sufficiently large",
     "Causal estimates, like all statistics, are more reliable with more data. Small samples produce noisy, unreliable estimates even when every other assumption holds."),
]

CDPO_ASSUMPTIONS = [
    ("Positivity", "Every unit must have a nonzero probability of receiving either treatment level, given its covariates - see the positivity check above, if shown."),
    ("Consistency", "The observed outcome for a treated (or control) unit equals its potential outcome under the treatment (or control) it actually received."),
    ("Ignorability / Exchangeability", "Conditional on the observed covariates, treatment assignment is independent of the potential outcomes - i.e. no unmeasured confounding."),
    ("No Unmeasured Confounding", "There are no unobserved common causes of treatment and outcome not already captured by the causal diagram."),
    ("SUTVA", "The Stable Unit Treatment Value Assumption: one unit's outcome doesn't depend on another unit's treatment assignment, and there's only one version of each treatment level."),
]

PDFE_ASSUMPTIONS = [
    ("Time-invariant Unobserved Heterogeneity", "Unobserved confounders may exist, as long as they don't change over time within an entity - fixed effects absorb these."),
    ("Strict Exogeneity", "The treatment (and covariates) in any time period are uncorrelated with the error term in every time period, past and future."),
    ("No Perfect Collinearity", "No covariate is a constant, or an exact linear function of the other covariates, entity effects, or time effects."),
    ("Homoscedasticity / Independence of Errors", "Handled here via cluster-robust standard errors, which don't require errors to have constant variance."),
    ("No Serial Correlation", "Also handled via entity-clustered standard errors, which allow for arbitrary correlation between observations of the same entity over time."),
    ("Common Time Trends", "Time fixed effects assume that time-varying shocks affect every entity equally."),
    ("Parallel Trends (if comparing groups over time)", "Absent treatment, treated and control entities would have followed the same trend over time."),
    ("No Spillover", "One entity's treatment doesn't affect another entity's outcome."),
]


def contingency_table(df: pd.DataFrame, treatment_col: str, outcome_col: str, outcome_is_categorical: bool, class1_label: str | None) -> dict:
    control = df[df[treatment_col] == 0]
    treated = df[df[treatment_col] == 1]
    result: dict = {
        "total": {"control": int(len(control)), "treated": int(len(treated)), "total": int(len(df))},
    }
    if outcome_is_categorical:
        result["by_outcome"] = {
            "0": {"control": int((control[outcome_col] == 0).sum()), "treated": int((treated[outcome_col] == 0).sum())},
            "1": {"control": int((control[outcome_col] == 1).sum()), "treated": int((treated[outcome_col] == 1).sum())},
        }
        result["class1_label"] = class1_label
    return result


ACCEPT_TEXT = (
    "All validation tests passed. The validation tests explore the robustness and stability of the "
    "results. This provides confidence in the estimated causal effect, as long as no assumptions are "
    "violated."
)

REJECT_TEXT = (
    "Some validation tests failed. This means the estimate of the causal effect should be treated "
    "cautiously. Examine the validation tests to understand whether the model was close to passing, "
    "or failed by a large margin. Validation failure means the true effect might be zero, even if the "
    "current estimate is large. Also, if the current estimate is close to zero, it does not confirm "
    "the absence of a causal effect - a significant effect might still be found with more data, or "
    "other settings."
)


def findings_statement(
    treatment_col: str,
    outcome_col: str,
    treatment_is_continuous: bool,
    outcome_effective_type: str,
    outcome_class1_label: str | None,
    target_units: str,
    effect: float,
) -> str:
    """The plain-English "what does this effect mean" sentence (results-page
    feature 1) - ported from result.js's setFindingsEffect(), same wording
    and same branching (binary vs continuous treatment design x categorical
    vs numerical outcome x ATE/ATT/ATC), minus the HTML/jQuery plumbing."""
    sign = "increased" if effect >= 0 else "decreased"
    magnitude = effect if outcome_effective_type == "categorical" else abs(effect)

    if outcome_effective_type == "categorical":
        outcome_phrase = f"the probability {outcome_col} = 1 ({outcome_class1_label})"
    else:
        outcome_phrase = f"the value of outcome {outcome_col}"

    subgroup = {
        "ate": ".",
        "att": ", for samples which were originally in the Treated group.",
        "atc": ", for samples which were originally in the Control group.",
    }[target_units]

    if treatment_is_continuous:
        return (
            f"This means that {outcome_phrase} is on average {sign} by {magnitude:.4g} "
            f"for every unit change in {treatment_col}{subgroup}"
        )
    return (
        f"This means that when treatment {treatment_col} = Treated, {outcome_phrase} is on average "
        f"{sign} by {magnitude:.4g} compared to when {treatment_col} = Control{subgroup}"
    )


def modelling_statements(
    method: str,
    treatment_col: str,
    outcome_col: str,
    treatment_is_continuous: bool,
    outcome_effective_type: str,
    outcome_class1_label: str | None,
    sample_counts: dict,
    estimand_type: str | None,
    estimand_expression: str | None,
    estimator_name: str,
    panel_data: dict | None,
) -> dict:
    return {
        "methodology": "Causal Diagram and Potential Outcomes framework." if method == "cd+po" else "Fixed-effects model applied to Panel Data.",
        "study_design": "Continuous, numerical treatment." if treatment_is_continuous else "Binary treatment (comparison of Control and Treated groups).",
        "treatment_variable": treatment_col,
        "outcome_variable": outcome_col,
        "outcome_type": (
            f"Categorical: 0 vs 1 ({outcome_class1_label})" if outcome_effective_type == "categorical" else "Numerical (Integer or Real)"
        ),
        "sample_counts": sample_counts,
        "panel_data": panel_data,
        "estimand_type": estimand_type,
        "estimand_expression": estimand_expression,
        "estimator_name": estimator_name,
    }
