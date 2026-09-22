"""Refutation/validation tests (results-page feature 4).

CD+PO always runs the same two DoWhy refuters (placebo treatment,
random common cause; 100 simulations each - unconditional, not chosen
per-method, matching the old site) plus a bootstrap significance test and
confidence interval computed uniformly across every estimator (the old
site's own reasoning, preserved here: estimator-specific significance
machinery varies, but bootstrapping the estimate itself works the same way
regardless of which estimator produced it).

PD+FE has no DoWhy model to refute - it gets a z-statistic (the treatment
coefficient's own significance) and an F-statistic (overall model
significance), both already computed by `estimation_pdfe.estimate()`.
"""

from __future__ import annotations

NUM_SIMULATIONS_REFUTATION = 100
NUM_SIMULATIONS_BOOTSTRAP = 100
SIGNIFICANCE_LEVEL = 0.05


def run_cdpo_refutation(model, identified, dowhy_estimate) -> dict:
    """Only meaningful when `dowhy_estimate` is a real DoWhy CausalEstimate
    (propensity/DML/IV/frontdoor) - CD+PO's own linear_regression/GLM
    estimators aren't DoWhy objects, so refutation/bootstrap don't apply
    to them (matches the old site's scope for these tests, which only
    ever exercised DoWhy's built-in estimator classes)."""
    bootstrap_sig = dowhy_estimate.test_stat_significance(method="bootstrap", num_null_simulations=NUM_SIMULATIONS_BOOTSTRAP)
    bootstrap_ci = dowhy_estimate.get_confidence_intervals(
        confidence_level=1 - SIGNIFICANCE_LEVEL, method="bootstrap", num_simulations=NUM_SIMULATIONS_BOOTSTRAP
    )
    bootstrap_p = float(bootstrap_sig["p_value"][1]) if isinstance(bootstrap_sig["p_value"], tuple) else float(bootstrap_sig["p_value"])

    placebo = model.refute_estimate(
        identified, dowhy_estimate, method_name="placebo_treatment_refuter",
        placebo_type="permute", num_simulations=NUM_SIMULATIONS_REFUTATION,
    )
    random_cause = model.refute_estimate(
        identified, dowhy_estimate, method_name="random_common_cause",
        num_simulations=NUM_SIMULATIONS_REFUTATION,
    )

    def _refuter_result(ref) -> dict:
        return {
            "new_effect": float(ref.new_effect) if ref.new_effect is not None else None,
            "p_value": float(ref.refutation_result["p_value"]) if ref.refutation_result else None,
            "significant": bool(ref.refutation_result["p_value"] < SIGNIFICANCE_LEVEL) if ref.refutation_result and ref.refutation_result["p_value"] is not None else None,
        }

    return {
        "bootstrap": {
            "p_value": bootstrap_p,
            "significant": bootstrap_p <= SIGNIFICANCE_LEVEL,
            "confidence_interval": [float(bootstrap_ci[0]), float(bootstrap_ci[1])],
            "num_simulations": NUM_SIMULATIONS_BOOTSTRAP,
        },
        "placebo_treatment": {**_refuter_result(placebo), "original_effect": float(dowhy_estimate.value), "num_simulations": NUM_SIMULATIONS_REFUTATION},
        "random_common_cause": {**_refuter_result(random_cause), "num_simulations": NUM_SIMULATIONS_REFUTATION},
    }


def run_pdfe_validation(z_pvalue: float, f_pvalue: float) -> dict:
    return {
        "z_statistic": {"p_value": z_pvalue, "significant": z_pvalue <= SIGNIFICANCE_LEVEL},
        "f_statistic": {"p_value": f_pvalue, "significant": f_pvalue <= SIGNIFICANCE_LEVEL},
    }


def cdpo_accept(validation: dict) -> bool:
    """Findings' accept/reject banner: accept iff the bootstrap test is
    significant AND neither refuter is (a significant placebo/random-cause
    result means the "effect" persists even when it shouldn't - a bad
    sign)."""
    return (
        validation["bootstrap"]["significant"]
        and not (validation["placebo_treatment"]["significant"] or False)
        and not (validation["random_common_cause"]["significant"] or False)
    )


def pdfe_accept(validation: dict) -> bool:
    return validation["z_statistic"]["significant"] and validation["f_statistic"]["significant"]
