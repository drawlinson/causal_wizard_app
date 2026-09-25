import math

import pytest

from causalwizard import estimation_cdpo, identification
from tests.helpers import make_graph

def _backdoor_edges(outcome_col: str) -> list[tuple[str, str]]:
    confounders = ["age", "no_degree", "region"]
    return [(c, "treated") for c in confounders] + [(c, outcome_col) for c in confounders] + [("treated", outcome_col)]


FRONTDOOR_EDGES = [("treated", "no_degree"), ("no_degree", "outcome")]
IV_EDGES = [("no_degree", "treated"), ("treated", "outcome")]

COVARIATE_TYPES = {"age": "numerical", "no_degree": "categorical", "region": "categorical"}


def _backdoor_setup(df, outcome_col="outcome"):
    graph = make_graph(_backdoor_edges(outcome_col))
    model = identification.build_causal_model(df, graph, "treated", outcome_col)
    identified = identification.identify(model)
    covariate_cols = identification.estimand_variables(identified, "backdoor")
    return model, identified, covariate_cols


@pytest.fixture
def backdoor_setup(backdoor_df):
    return _backdoor_setup(backdoor_df, "outcome")


@pytest.fixture
def backdoor_setup_binary_outcome(backdoor_df):
    return _backdoor_setup(backdoor_df, "outcome_binary")


@pytest.fixture
def frontdoor_setup(backdoor_df):
    graph = make_graph(FRONTDOOR_EDGES)
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    covariate_cols = identification.estimand_variables(identified, "frontdoor")
    return model, identified, covariate_cols


@pytest.fixture
def iv_setup(backdoor_df):
    graph = make_graph(IV_EDGES)
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    return model, identified


# ---------- own linear_regression / GLM (do-operator estimators) ----------


def test_linear_regression_numeric_outcome(backdoor_df, backdoor_setup):
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.linear_regression", backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units="ate",
    )
    assert math.isfinite(est.effect)
    assert est.predict is not None
    assert est.coefficients is not None
    assert "Q('treated')" in est.coefficients
    assert est.dowhy_estimate is not None  # always set for CD+PO, even own-regression estimators
    assert est.summary_text and "OLS" in est.summary_text


def test_linear_regression_effect_matches_treatment_coefficient(backdoor_df, backdoor_setup):
    # For plain OLS, ATE via g-computation should reduce to exactly the
    # treatment coefficient (no interaction terms in the formula).
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.linear_regression", backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units="ate",
    )
    assert est.effect == pytest.approx(est.coefficients["Q('treated')"], abs=1e-6)


def test_glm_binary_outcome_uses_binomial_family(backdoor_df, backdoor_setup_binary_outcome):
    model, identified, covariate_cols = backdoor_setup_binary_outcome
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.generalized_linear_model", backdoor_df, "treated", "outcome_binary",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=True, target_units="ate",
    )
    assert math.isfinite(est.effect)
    # A real average-probability-difference effect, not a log-odds coefficient
    # straight out of the model - should stay within a valid probability delta.
    assert -1.0 <= est.effect <= 1.0
    assert est.coefficients is not None


def test_glm_numeric_outcome_uses_poisson_family(backdoor_df, backdoor_setup):
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.generalized_linear_model", backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units="ate",
    )
    assert math.isfinite(est.effect)
    assert est.coefficients is not None


@pytest.mark.parametrize("target_units", ["ate", "att", "atc"])
def test_linear_regression_target_units(backdoor_df, backdoor_setup, target_units):
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.linear_regression", backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units=target_units,
    )
    assert math.isfinite(est.effect)


# ---------- propensity-based estimators ----------


@pytest.mark.parametrize(
    "method_key",
    ["backdoor.propensity_score_weighting", "backdoor.propensity_score_matching", "backdoor.propensity_score_stratification"],
)
def test_propensity_estimators(backdoor_df, backdoor_setup, method_key):
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, method_key, backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units="ate",
    )
    assert math.isfinite(est.effect)
    assert est.predict is None  # no do-operator for propensity methods
    assert est.coefficients is None
    assert est.dowhy_estimate is not None
    # Propensity scores must be stashed on the fitted estimate for propensity.py to use.
    assert "propensity_score" in est.dowhy_estimate._data.columns


# ---------- Double ML ----------


def test_double_ml(backdoor_df, backdoor_setup):
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.econml.dml.DML", backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units="ate",
    )
    assert math.isfinite(est.effect)
    assert est.predict is not None  # DML gets a (limited) do-operator
    assert est.coefficients is None


def test_double_ml_predict_is_identity_for_actual_treatment(backdoor_df, backdoor_setup):
    model, identified, covariate_cols = backdoor_setup
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.econml.dml.DML", backdoor_df, "treated", "outcome",
        covariate_cols, COVARIATE_TYPES, outcome_is_binary=False, target_units="ate",
    )
    predicted = est.predict(backdoor_df, None)
    assert list(predicted) == pytest.approx(list(backdoor_df["outcome"]))


# ---------- Frontdoor (the categorical-mediator regression test) ----------


def test_frontdoor_two_stage_regression(backdoor_df, frontdoor_setup):
    # no_degree is a 0/1-valued covariate used as the sole frontdoor
    # mediator here - this is exactly the scenario that used to crash with
    # "Pandas data cast to numpy dtype of object" before config.py started
    # encoding 2-level categoricals numerically (see test_config.py).
    model, identified, covariate_cols = frontdoor_setup
    covariate_types = {"no_degree": "categorical"}
    est = estimation_cdpo.estimate(
        model, identified, "frontdoor.two_stage_regression", backdoor_df, "treated", "outcome",
        covariate_cols, covariate_types, outcome_is_binary=False, target_units="ate",
    )
    assert math.isfinite(est.effect)
    assert est.predict is None
    assert est.dowhy_estimate is not None


def test_frontdoor_crashes_if_mediator_left_as_string(backdoor_df):
    """Regression test for the actual bug: a string/object-dtype mediator
    column raises inside DoWhy's TwoStageRegressionEstimator, confirming
    config.py's numeric encoding (not something specific to the fixture
    data) is what makes the case above pass. DoWhy's frontdoor/propensity/
    IV estimators fit against the data captured when the CausalModel
    itself was built (identification.build_causal_model()), not a `df`
    passed separately to estimate() - so the broken dtype has to be baked
    into the model here, not swapped in afterwards."""
    broken_df = backdoor_df.copy()
    broken_df["no_degree"] = broken_df["no_degree"].map({0: "False", 1: "True"})
    graph = make_graph(FRONTDOOR_EDGES)
    model = identification.build_causal_model(broken_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    covariate_cols = identification.estimand_variables(identified, "frontdoor")
    with pytest.raises(ValueError, match="dtype of object"):
        estimation_cdpo.estimate(
            model, identified, "frontdoor.two_stage_regression", broken_df, "treated", "outcome",
            covariate_cols, {"no_degree": "categorical"}, outcome_is_binary=False, target_units="ate",
        )


# ---------- Instrumental variables ----------


def test_instrumental_variable(backdoor_df, iv_setup):
    model, identified = iv_setup
    est = estimation_cdpo.estimate(
        model, identified, "iv.instrumental_variable", backdoor_df, "treated", "outcome",
        [], {}, outcome_is_binary=False, target_units="ate",
    )
    assert math.isfinite(est.effect)
    assert est.predict is None
    assert est.coefficients is None
