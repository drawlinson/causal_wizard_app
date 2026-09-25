import numpy as np
import pytest

from causalwizard import estimation_cdpo, identification, propensity
from tests.helpers import make_graph


@pytest.fixture
def propensity_estimate(backdoor_df):
    graph = make_graph([
        ("age", "treated"), ("age", "outcome"), ("no_degree", "treated"), ("no_degree", "outcome"),
        ("region", "treated"), ("region", "outcome"), ("treated", "outcome"),
    ])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    covariate_cols = identification.estimand_variables(identified, "backdoor")
    covariate_types = {"age": "numerical", "no_degree": "categorical", "region": "categorical"}
    return estimation_cdpo.estimate(
        model, identified, "backdoor.propensity_score_weighting", backdoor_df, "treated", "outcome",
        covariate_cols, covariate_types, outcome_is_binary=False, target_units="ate",
    )


def test_extract_propensity_scores_are_valid_probabilities(propensity_estimate):
    scores = propensity.extract_propensity_scores(propensity_estimate.dowhy_estimate)
    assert len(scores) > 0
    assert np.all(scores > 0) and np.all(scores < 1)


def test_positivity_distribution_shape(propensity_estimate, backdoor_df):
    scores = propensity.extract_propensity_scores(propensity_estimate.dowhy_estimate)
    treatment_binary = backdoor_df["treated"].to_numpy()
    dist = propensity.positivity_distribution(scores, treatment_binary)
    assert len(dist["bin_starts"]) == propensity.N_BINS
    assert len(dist["control"]) == propensity.N_BINS
    assert len(dist["treated"]) == propensity.N_BINS
    assert pytest.approx(sum(dist["control"]), abs=1e-9) == 1.0
    assert pytest.approx(sum(dist["treated"]), abs=1e-9) == 1.0
    assert isinstance(dist["distribution_bad"], bool)


def test_positivity_distribution_flags_no_overlap():
    # Every control has a low score, every treated a high one - no overlap
    # at all, the textbook positivity violation.
    propensity_scores = np.array([0.01] * 20 + [0.99] * 20)
    treatment_binary = np.array([0] * 20 + [1] * 20)
    dist = propensity.positivity_distribution(propensity_scores, treatment_binary)
    assert dist["distribution_bad"] is True


def test_covariate_balance_numeric_and_categorical(propensity_estimate, backdoor_df):
    scores = propensity.extract_propensity_scores(propensity_estimate.dowhy_estimate)
    treatment_binary = backdoor_df["treated"].to_numpy()
    covariate_types = {"age": "numerical", "no_degree": "categorical", "region": "categorical"}
    balance = propensity.covariate_balance(backdoor_df, ["age", "no_degree", "region"], covariate_types, treatment_binary, scores)

    assert "age" in balance["features"]  # numeric covariate: one row
    # categorical covariates: one row per observed level, not one per column
    assert "no_degree = 0" in balance["features"] or "no_degree = 1" in balance["features"]
    assert any(f.startswith("region = ") for f in balance["features"])
    assert set(balance["original"].keys()) == set(balance["features"])
    assert set(balance["weighted"].keys()) == set(balance["features"])
    assert balance["reference_line"] == propensity.SMD_REFERENCE_LINE


def test_covariate_balance_weighting_reduces_imbalance_on_average(propensity_estimate, backdoor_df):
    # Not a guarantee for every single covariate, but IPW weighting should
    # reduce imbalance overall - a basic sanity check that the "weighted"
    # SMDs aren't just a copy of "original".
    scores = propensity.extract_propensity_scores(propensity_estimate.dowhy_estimate)
    treatment_binary = backdoor_df["treated"].to_numpy()
    covariate_types = {"age": "numerical", "no_degree": "categorical", "region": "categorical"}
    balance = propensity.covariate_balance(backdoor_df, ["age", "no_degree", "region"], covariate_types, treatment_binary, scores)
    mean_original = np.mean([abs(v) for v in balance["original"].values()])
    mean_weighted = np.mean([abs(v) for v in balance["weighted"].values()])
    assert mean_weighted < mean_original
