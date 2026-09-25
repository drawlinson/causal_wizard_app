import pytest

from causalwizard import estimation_cdpo, identification, refutation
from tests.helpers import make_graph


# ---------- accept/reject logic (pure functions, no DoWhy needed) ----------


def test_pdfe_accept_true_when_both_significant():
    validation = refutation.run_pdfe_validation(z_pvalue=0.01, f_pvalue=0.02)
    assert validation["z_statistic"]["significant"] is True
    assert validation["f_statistic"]["significant"] is True
    assert refutation.pdfe_accept(validation) is True


@pytest.mark.parametrize("z_pvalue, f_pvalue", [(0.5, 0.01), (0.01, 0.5), (0.9, 0.9)])
def test_pdfe_accept_false_when_either_not_significant(z_pvalue, f_pvalue):
    validation = refutation.run_pdfe_validation(z_pvalue=z_pvalue, f_pvalue=f_pvalue)
    assert refutation.pdfe_accept(validation) is False


def test_cdpo_accept_true_when_bootstrap_significant_and_refuters_not():
    validation = {
        "bootstrap": {"significant": True},
        "placebo_treatment": {"significant": False},
        "random_common_cause": {"significant": False},
    }
    assert refutation.cdpo_accept(validation) is True


def test_cdpo_accept_false_when_bootstrap_not_significant():
    validation = {
        "bootstrap": {"significant": False},
        "placebo_treatment": {"significant": False},
        "random_common_cause": {"significant": False},
    }
    assert refutation.cdpo_accept(validation) is False


@pytest.mark.parametrize("refuter", ["placebo_treatment", "random_common_cause"])
def test_cdpo_accept_false_when_a_refuter_is_significant(refuter):
    # A significant placebo/random-common-cause result means the "effect"
    # persisted even when it shouldn't have - a bad sign, not a good one -
    # this is the exact good/bad-direction distinction the results page's
    # "Estimate valid?" column depends on (see diagnostics.py).
    validation = {
        "bootstrap": {"significant": True},
        "placebo_treatment": {"significant": False},
        "random_common_cause": {"significant": False},
    }
    validation[refuter]["significant"] = True
    assert refutation.cdpo_accept(validation) is False


# ---------- real DoWhy refutation (one integration test, sims trimmed for speed) ----------


def test_run_cdpo_refutation_shape(backdoor_df, monkeypatch):
    monkeypatch.setattr(refutation, "NUM_SIMULATIONS_REFUTATION", 5)
    monkeypatch.setattr(refutation, "NUM_SIMULATIONS_BOOTSTRAP", 5)

    graph = make_graph([("age", "treated"), ("age", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    est = estimation_cdpo.estimate(
        model, identified, "backdoor.linear_regression", backdoor_df, "treated", "outcome",
        ["age"], {"age": "numerical"}, outcome_is_binary=False, target_units="ate",
    )

    validation = refutation.run_cdpo_refutation(model, identified, est.dowhy_estimate)

    for key in ("bootstrap", "placebo_treatment", "random_common_cause"):
        assert key in validation
        assert isinstance(validation[key]["significant"], bool)
        assert 0.0 <= validation[key]["p_value"] <= 1.0
    assert len(validation["bootstrap"]["confidence_interval"]) == 2
    assert validation["placebo_treatment"]["original_effect"] == pytest.approx(est.effect)
    assert isinstance(refutation.cdpo_accept(validation), bool)
