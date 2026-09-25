import pytest

from causalwizard import counterfactuals, estimation_cdpo, identification
from tests.helpers import make_graph


@pytest.fixture
def linear_regression_estimate(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    return estimation_cdpo.estimate(
        model, identified, "backdoor.linear_regression", backdoor_df, "treated", "outcome",
        ["age"], {"age": "numerical"}, outcome_is_binary=False, target_units="ate",
    )


# ---------- display_scenarios ----------


def test_display_scenarios_grouped_returns_all_seven():
    scenarios = counterfactuals.display_scenarios(False, "treated", 0.0, 1.0)
    assert scenarios == counterfactuals.SCENARIOS


def test_display_scenarios_continuous_returns_three_with_value_labels():
    scenarios = counterfactuals.display_scenarios(True, "dose", 2.0, 5.0)
    keys = [k for k, _ in scenarios]
    assert keys == ["all", "all_if_control", "all_if_treated"]
    assert "2" in scenarios[1][1] and "dose" in scenarios[1][1]
    assert "5" in scenarios[2][1] and "dose" in scenarios[2][1]


# ---------- counterfactual_table ----------


def test_counterfactual_table_none_when_predict_unsupported():
    table = counterfactuals.counterfactual_table(None, "treated", None, False, 0.0, 1.0)
    assert all(v is None for v in table.values())
    assert set(table.keys()) == {key for key, _ in counterfactuals.SCENARIOS}


def test_counterfactual_table_grouped_design(backdoor_df, linear_regression_estimate):
    table = counterfactuals.counterfactual_table(backdoor_df, "treated", linear_regression_estimate.predict, False, 0.0, 1.0)
    assert table["all"]["count"] == len(backdoor_df)
    assert table["control"]["count"] == int((backdoor_df["treated"] == 0).sum())
    assert table["treated"]["count"] == int((backdoor_df["treated"] == 1).sum())
    # "if all treated" should sit above "if all control" - a positive effect in this fixture
    assert table["all_if_treated"]["mean"] > table["all_if_control"]["mean"]


def test_counterfactual_table_continuous_design_only_populates_three_rows(backdoor_df, linear_regression_estimate):
    table = counterfactuals.counterfactual_table(backdoor_df, "treated", linear_regression_estimate.predict, True, 0.0, 1.0)
    assert table["all"] is not None
    assert table["all_if_control"] is not None
    assert table["all_if_treated"] is not None
    for key in ("control", "control_if_treated", "treated", "treated_if_control"):
        assert table[key] is None


# ---------- train_predictions / generalization_predictions ----------


def test_train_predictions_none_when_unsupported():
    assert counterfactuals.train_predictions(None, None, 0.0, 1.0) is None


def test_train_predictions_shape(backdoor_df, linear_regression_estimate):
    preds = counterfactuals.train_predictions(backdoor_df, linear_regression_estimate.predict, 0.0, 1.0)
    assert len(preds["predicted"]) == len(backdoor_df)
    assert len(preds["counterfactualControl"]) == len(backdoor_df)
    assert len(preds["counterfactualTreated"]) == len(backdoor_df)
    assert all(isinstance(v, float) for v in preds["predicted"])


def test_generalization_predictions_none_for_empty_test_set(backdoor_df, linear_regression_estimate):
    assert counterfactuals.generalization_predictions(backdoor_df.iloc[0:0], linear_regression_estimate.predict, "treated", "outcome") is None


def test_generalization_predictions_shape(backdoor_df, linear_regression_estimate):
    test_df = backdoor_df.iloc[:20]
    result = counterfactuals.generalization_predictions(test_df, linear_regression_estimate.predict, "treated", "outcome")
    assert len(result["actual"]) == 20
    assert len(result["predicted"]) == 20
    assert len(result["treatment"]) == 20
    assert result["actual"] == pytest.approx(test_df["outcome"].tolist())
