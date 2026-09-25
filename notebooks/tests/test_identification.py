from causalwizard import identification
from tests.helpers import make_graph


def test_build_digraph_string_format():
    graph = make_graph([("age", "treated"), ("treated", "outcome")])
    dot = identification.build_digraph_string(graph)
    assert dot.startswith("digraph {")
    assert '"age" -> "treated";' in dot
    assert '"treated" -> "outcome";' in dot


def test_build_causal_model_and_identify_backdoor(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    names = identification.estimand_names(identified)
    assert "backdoor" in names
    assert "frontdoor" not in names


def test_identify_frontdoor_via_mediator(backdoor_df):
    # Treated -> no_degree -> outcome, no other path: a pure frontdoor structure.
    graph = make_graph([("treated", "no_degree"), ("no_degree", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    names = identification.estimand_names(identified)
    assert "frontdoor" in names


def test_estimand_names_drops_numbered_alternates(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("region", "treated"), ("region", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    names = identification.estimand_names(identified)
    assert all(not name[-1].isdigit() for name in names)


def test_estimand_info_has_expression_and_assumptions(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    info = identification.estimand_info(identified, "backdoor")
    assert isinstance(info["expression"], str) and info["expression"]
    assert isinstance(info["assumptions"], dict) and info["assumptions"]


def test_estimand_variables_backdoor_matches_confounders(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("no_degree", "treated"), ("no_degree", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    variables = identification.estimand_variables(identified, "backdoor")
    assert set(variables) == {"age", "no_degree"}


def test_estimand_variables_frontdoor_matches_mediator(backdoor_df):
    graph = make_graph([("treated", "no_degree"), ("no_degree", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    variables = identification.estimand_variables(identified, "frontdoor")
    assert variables == ["no_degree"]


def test_estimand_variables_unknown_name_returns_empty(backdoor_df):
    graph = make_graph([("age", "treated"), ("age", "outcome"), ("treated", "outcome")])
    model = identification.build_causal_model(backdoor_df, graph, "treated", "outcome")
    identified = identification.identify(model)
    assert identification.estimand_variables(identified, "nonsense") == []
