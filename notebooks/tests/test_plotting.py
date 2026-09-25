"""Smoke tests: each plotting function should run without raising and
return a real figure, given minimal/synthetic inputs - not a check on
exact visual output (see follow-up 13's bugfixes, which were caught by
actually rendering and looking, not by these). Kaleido isn't installed
in this environment, so these stop at "a Figure object came back", not
"it rendered to an image" - see notebooks/requirements.txt.
"""

import plotly.graph_objects as go
import pytest

from causalwizard import plotting, propensity
from tests.helpers import make_graph


def test_plot_positivity(backdoor_df):
    scores = backdoor_df["age"].to_numpy() / backdoor_df["age"].max()  # any 0-1 values will do here
    dist = propensity.positivity_distribution(scores, backdoor_df["treated"].to_numpy())
    fig = plotting.plot_positivity(dist)
    assert isinstance(fig, go.Figure)


def test_plot_covariate_balance(backdoor_df):
    scores = backdoor_df["age"].to_numpy() / backdoor_df["age"].max()
    balance = propensity.covariate_balance(
        backdoor_df, ["age", "no_degree", "region"],
        {"age": "numerical", "no_degree": "categorical", "region": "categorical"},
        backdoor_df["treated"].to_numpy(), scores,
    )
    fig = plotting.plot_covariate_balance(balance)
    assert isinstance(fig, go.Figure)
    # one dumbbell pair per feature, including one per categorical level
    assert len(fig.data) == 2 + len(balance["features"])


@pytest.mark.parametrize("outcome_is_categorical", [False, True])
def test_plot_outcomes_cohort(backdoor_df, outcome_is_categorical):
    outcome_col = "outcome_binary" if outcome_is_categorical else "outcome"
    fig = plotting.plot_outcomes_cohort(backdoor_df, "treated", outcome_col, outcome_is_categorical)
    assert isinstance(fig, go.Figure)


def test_plot_outcomes_entity_without_predictions(backdoor_df):
    fig = plotting.plot_outcomes_entity(backdoor_df, "treated", "outcome", None)
    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 1  # just "Observed"


def test_plot_outcomes_entity_with_predictions_and_entity_column(panel_df):
    n = len(panel_df)
    fig = plotting.plot_outcomes_entity(
        panel_df, "treated", "outcome", "entity",
        predicted=panel_df["outcome"] + 1, control_pred=[0.0] * n, treated_pred=[5.0] * n,
        control_value=0.0, treated_value=1.0,
    )
    assert isinstance(fig, go.Figure)
    assert len(fig.data) > 1


def test_plot_outcomes_entity_counterfactual_x_values_are_fixed(panel_df):
    # Regression test for follow-up 8: counterfactual series must use the
    # fixed control/treated VALUE for every point's x-coordinate, not each
    # row's own actual treatment value.
    n = len(panel_df)
    fig = plotting.plot_outcomes_entity(
        panel_df, "treated", "outcome", "entity",
        predicted=panel_df["outcome"] + 1, control_pred=[0.0] * n, treated_pred=[5.0] * n,
        control_value=2.5, treated_value=7.5,
    )
    control_traces = [t for t in fig.data if t.name and t.name.startswith("Control/Lower")]
    assert control_traces
    for trace in control_traces:
        assert set(trace.x) == {2.5}


def test_plot_outcomes_over_time_averages_duplicate_entity_time_rows(panel_df):
    fig = plotting.plot_outcomes_over_time(panel_df, "time", "entity", "outcome")
    assert isinstance(fig, go.Figure)
    # one trace per entity, each with one point per distinct time value -
    # not one point per raw row (this fixture has several rows per cell)
    for trace in fig.data:
        assert len(trace.x) == panel_df["time"].nunique()


def test_plot_outcomes_over_time_without_entity_column(panel_df):
    fig = plotting.plot_outcomes_over_time(panel_df, "time", None, "outcome")
    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 1


def test_plot_generalization_scatter_binary_treatment():
    generalization = {"actual": [1.0, 2.0, 3.0, 4.0], "predicted": [1.1, 2.1, 2.9, 4.2], "treatment": [0, 0, 1, 1]}
    fig = plotting.plot_generalization_scatter(generalization, treatment_col_is_binary=True)
    assert isinstance(fig, go.Figure)


def test_confusion_matrix_counts():
    generalization = {"actual": [1, 1, 0, 0], "predicted": [0.9, 0.4, 0.1, 0.6]}
    cm = plotting.confusion_matrix(generalization, threshold=0.5)
    assert cm["tp"] == 1  # actual=1, predicted>=0.5 -> 0.9
    assert cm["fn"] == 1  # actual=1, predicted<0.5 -> 0.4
    assert cm["fp"] == 1  # actual=0, predicted>=0.5 -> 0.6
    assert cm["tn"] == 1  # actual=0, predicted<0.5 -> 0.1
    assert cm["accuracy"] == pytest.approx(0.5)


def test_plot_causal_diagram(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("treated", "outcome")])
    roles = {"treated": "treatment", "outcome": "outcome", "age": "backdoor"}
    fig = plotting.plot_causal_diagram(graph, roles)
    assert fig is not None


def test_plot_feature_importance_excludes_intercept_and_sorts_by_value():
    coefficients = {"Intercept": 100.0, "Q('treated')": 5.0, "C(Q('region'))[T.North]": -3.0}
    fig = plotting.plot_feature_importance(coefficients)
    assert isinstance(fig, go.Figure)
    labels = list(fig.data[0].y)
    values = list(fig.data[0].x)
    assert "Intercept" not in labels
    assert values == sorted(values)
    assert "region = North" in labels
