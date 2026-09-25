"""Shared test-only builders - not part of the causalwizard package itself."""

from __future__ import annotations


def make_graph(edges: list[tuple[str, str]]) -> dict:
    """Builds the {"nodes": [...], "edges": [...]} graph shape
    identification.py expects (the same shape the site exports in a
    study's config.json), from a plain list of (source_column,
    target_column) edges - one node per distinct column referenced,
    with auto-generated ids."""
    columns: list[str] = []
    for a, b in edges:
        if a not in columns:
            columns.append(a)
        if b not in columns:
            columns.append(b)
    node_id = {col: f"n{i}" for i, col in enumerate(columns)}
    return {
        # "name" (the display label) is part of the real shape the site
        # exports - plotting.plot_causal_diagram() reads it directly, so
        # it has to be here even though identification.py only ever
        # looks at "id"/"src".
        "nodes": [{"data": {"id": node_id[c], "src": c, "name": c}} for c in columns],
        "edges": [{"data": {"source": node_id[a], "target": node_id[b]}} for a, b in edges],
    }


def make_config(
    *,
    columns: list[tuple[str, str]],  # (name, "numeric"|"boolean") pairs, in CSV column order
    treatment: str,
    outcome: str,
    graph_edges: list[tuple[str, str]],
    model_key: str,
    estimand_type: str,
    treatment_control: list[str] = ["0"],
    treatment_treated: list[str] = ["1"],
    variable_types: dict[str, str] | None = None,
    panel_data: dict | None = None,
    split_test_pc: int = 20,
) -> dict:
    """A full study config.json, in the exact shape the site exports and
    build_notebooks.py's cells consume - lets test_config.py and any
    end-to-end test exercise the real prepare_dataframe()/
    build_causal_model() entry points, not just the lower-level
    functions they call."""
    return {
        "schemaVersion": 1,
        "study": {"name": "test study"},
        "dataset": {
            "fileName": "test.csv",
            "expectedColumns": [{"name": name, "type": type_} for name, type_ in columns],
        },
        "graph": make_graph(graph_edges),
        "question": {
            "method": "pd+fe" if panel_data is not None else "cd+po",
            "treatment": treatment,
            "outcome": outcome,
            "treatmentSpec": {
                "kind": "categorical",
                "control": treatment_control,
                "treated": treatment_treated,
                "controlAnything": False,
                "treatedAnything": False,
            },
            "variableTypes": variable_types or {},
            "effect": "ate",
            "splitTestPc": split_test_pc,
            "panelData": panel_data,
            "modelKey": model_key,
        },
        "identification": {
            "estimandType": estimand_type,
            "variables": [],
            "model": {"key": model_key, "name": model_key, "warnings": []},
        },
    }
