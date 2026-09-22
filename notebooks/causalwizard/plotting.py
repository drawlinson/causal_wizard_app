"""Plotly figure builders, one function per results-page plot. Colors for
the causal-diagram plot are ported directly from the site's own
`src/assets/js/studies/graph.js` STYLE array, so a notebook's diagram
matches the study editor's own colors exactly.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go

# Ported verbatim from graph.js's STYLE array: {bg, border}
NODE_COLORS = {
    "default": ("#f0f0f0", "#555555"),
    "treatment": ("#bfd9ff", "#05419c"),
    "outcome": ("#d0fcdc", "#184925"),
    "backdoor": ("#fab5a5", "#f03a11"),
    "frontdoor": ("#ffe6cc", "#cc6600"),
    "iv": ("#f2ccff", "#cc33ff"),
    "mediator": ("#cccccc", "#980000"),
    "collider": ("#f0f0f0", "#980000"),
    "unobserved": ("#ffffff", "#555555"),
}

CONTROL_COLOR = "#3D85C6"
TREATED_COLOR = "#e03e2d"
CONTROL_COLOR_LIGHT = "#a9c9ea"
TREATED_COLOR_LIGHT = "#f0a99e"
PREDICTED_COLOR = "#a52a2a"


# ---------- Positivity check ----------


def plot_positivity(distribution: dict) -> go.Figure:
    bin_starts = distribution["bin_starts"]
    control = distribution["control"]
    treated = [-v for v in distribution["treated"]]  # mirrored below the axis
    bounds = distribution["bounds"]

    fig = go.Figure(
        [
            go.Bar(x=bin_starts, y=control, name="Control", marker_color=CONTROL_COLOR),
            go.Bar(x=bin_starts, y=treated, name="Treated", marker_color=TREATED_COLOR),
        ]
    )
    fig.add_vline(x=bounds, line_dash="dash", line_color="firebrick", annotation_text="Limit (lower)")
    fig.add_vline(x=1 - bounds, line_dash="dash", line_color="firebrick", annotation_text="Limit (upper)")
    fig.update_layout(
        barmode="overlay",
        title="Distribution of Propensity Scores for Control and Treated groups",
        xaxis_title="Propensity score",
        yaxis_title="Frequency (mirrored: control up, treated down)",
    )
    return fig


# ---------- Covariate balance / love plot ----------


def plot_covariate_balance(balance: dict) -> go.Figure:
    features = balance["features"]
    original = [abs(balance["original"][f]) for f in features]
    weighted = [abs(balance["weighted"][f]) for f in features]

    fig = go.Figure()
    for i, feature in enumerate(features):
        fig.add_trace(
            go.Scatter(
                x=[original[i], weighted[i]], y=[feature, feature],
                mode="lines", line=dict(color="lightgrey"), showlegend=False,
            )
        )
    fig.add_trace(go.Scatter(x=original, y=features, mode="markers", name="Original SMD", marker=dict(color="orange", size=12)))
    fig.add_trace(go.Scatter(x=weighted, y=features, mode="markers", name="Weighted SMD", marker=dict(color="darkblue", size=12)))
    fig.add_vline(x=balance["reference_line"], line_dash="dash", line_color="darkred", annotation_text="SMD limit")
    fig.update_layout(
        title="Covariate Balance before and after propensity weighting",
        xaxis_title="Absolute standard mean difference (SMD)",
        yaxis_title="Variable",
        yaxis=dict(automargin=True),
    )
    return fig


# ---------- Outcomes plots ----------


def plot_outcomes_cohort(df: pd.DataFrame, treatment_col: str, outcome_col: str, outcome_is_categorical: bool) -> go.Figure:
    """Binary-design outcome plot: box/violin split by group for a
    numerical outcome, or a stacked frequency bar for a categorical one."""
    control = df[df[treatment_col] == 0][outcome_col]
    treated = df[df[treatment_col] == 1][outcome_col]

    if outcome_is_categorical:
        control_counts = control.value_counts(normalize=True).sort_index()
        treated_counts = treated.value_counts(normalize=True).sort_index()
        fig = go.Figure(
            [
                go.Bar(x=["Control"], y=[control_counts.get(0, 0)], name="Outcome 0", marker_color=CONTROL_COLOR_LIGHT),
                go.Bar(x=["Control"], y=[control_counts.get(1, 0)], name="Outcome 1", marker_color=TREATED_COLOR_LIGHT, base=[control_counts.get(0, 0)]),
                go.Bar(x=["Treated"], y=[treated_counts.get(0, 0)], showlegend=False, marker_color=CONTROL_COLOR_LIGHT),
                go.Bar(x=["Treated"], y=[treated_counts.get(1, 0)], showlegend=False, marker_color=TREATED_COLOR_LIGHT, base=[treated_counts.get(0, 0)]),
            ]
        )
        fig.update_layout(barmode="stack", title=f"Outcome '{outcome_col}' frequency by Control/Treated", yaxis_title="Proportion")
        return fig

    fig = go.Figure(
        [
            go.Box(y=control, name="Control", marker_color=CONTROL_COLOR, boxmean=True),
            go.Box(y=treated, name="Treated", marker_color=TREATED_COLOR, boxmean=True),
        ]
    )
    fig.update_layout(title=f"Outcome '{outcome_col}' distribution by Control/Treated group", yaxis_title=outcome_col)
    return fig


def plot_outcomes_entity(
    df: pd.DataFrame, treatment_col: str, outcome_col: str, entity_col: str | None,
    predicted=None, control_pred=None, treated_pred=None,
    control_value: float | None = None, treated_value: float | None = None,
) -> go.Figure:
    """Numerical-design outcome plot: observed vs. predicted outcome
    against treatment value, plus flat reference lines for the
    counterfactual lower/upper predictions. `predicted`/`control_pred`/
    `treated_pred` are precomputed per-row arrays (aligned with `df`'s
    row order), not a live model - this is a pure-presentation function so
    it works from a saved results.json alone, no fitted estimator needed.
    Pass `predicted=None` when the chosen estimator has no do-operator."""
    fig = go.Figure()
    if entity_col and entity_col in df.columns:
        for entity, group in df.groupby(entity_col):
            fig.add_trace(go.Scatter(x=group[treatment_col], y=group[outcome_col], mode="markers", name=f"Observed ({entity})", marker=dict(color="#444444")))
    else:
        fig.add_trace(go.Scatter(x=df[treatment_col], y=df[outcome_col], mode="markers", name="Observed", marker=dict(color="#444444")))

    if predicted is not None:
        fig.add_trace(go.Scatter(x=df[treatment_col], y=predicted, mode="markers", name="Predicted", marker=dict(color=PREDICTED_COLOR, symbol="x")))
        fig.add_trace(go.Scatter(x=[control_value] * len(df), y=control_pred, mode="markers", name=f"Control/Lower = {control_value}", marker=dict(color="lightgreen")))
        fig.add_trace(go.Scatter(x=[treated_value] * len(df), y=treated_pred, mode="markers", name=f"Treated/Upper = {treated_value}", marker=dict(color="#ffcc80")))

    fig.update_layout(title=f"Scatter plot of predicted and actual Outcomes '{outcome_col}'", xaxis_title=f"Treatment ({treatment_col})", yaxis_title=outcome_col)
    return fig


def plot_outcomes_over_time(
    df: pd.DataFrame, time_col: str, entity_col: str | None, outcome_col: str, predicted=None,
) -> go.Figure:
    """`predicted` is a precomputed per-row array aligned with `df`'s row
    order (see plot_outcomes_entity), or None if unsupported."""
    fig = go.Figure()
    group_cols = [time_col] + ([entity_col] if entity_col else [])
    grouped = df.groupby(group_cols, as_index=False)[outcome_col].mean()

    if entity_col:
        for entity, g in grouped.groupby(entity_col):
            fig.add_trace(go.Scatter(x=g[time_col], y=g[outcome_col], mode="lines+markers", name=f"Observed ({entity})"))
    else:
        fig.add_trace(go.Scatter(x=grouped[time_col], y=grouped[outcome_col], mode="lines+markers", name="Observed", line=dict(color="#444444")))

    if predicted is not None:
        pred_df = df.copy()
        pred_df["_predicted"] = np.asarray(predicted)
        pred_grouped = pred_df.groupby(group_cols, as_index=False)["_predicted"].mean()
        if entity_col:
            for entity, g in pred_grouped.groupby(entity_col):
                fig.add_trace(go.Scatter(x=g[time_col], y=g["_predicted"], mode="lines", line=dict(color=PREDICTED_COLOR, dash="dash"), name=f"Predicted ({entity})"))
        else:
            fig.add_trace(go.Scatter(x=pred_grouped[time_col], y=pred_grouped["_predicted"], mode="lines", line=dict(color=PREDICTED_COLOR, dash="dash"), name="Predicted"))

    fig.update_layout(title=f"Outcomes over time ('{outcome_col}')", xaxis_title=time_col, yaxis_title=outcome_col)
    return fig


# ---------- Generalization (held-out test set) ----------


def plot_generalization_scatter(generalization: dict, treatment_col_is_binary: bool) -> go.Figure:
    actual = np.array(generalization["actual"])
    predicted = np.array(generalization["predicted"])
    treatment = np.array(generalization["treatment"])

    fig = go.Figure()
    lo, hi = min(actual.min(), predicted.min()), max(actual.max(), predicted.max())
    fig.add_trace(go.Scatter(x=[lo, hi], y=[lo, hi], mode="lines", line=dict(dash="dash", color="grey"), name="Predicted = Actual"))

    if treatment_col_is_binary:
        for value, name, color in [(0, "Control", CONTROL_COLOR_LIGHT), (1, "Treated", TREATED_COLOR_LIGHT)]:
            mask = treatment == value
            fig.add_trace(go.Scatter(x=actual[mask], y=predicted[mask], mode="markers", name=name, marker=dict(color=color)))
    else:
        fig.add_trace(go.Scatter(x=actual, y=predicted, mode="markers", name="Samples", marker=dict(color=CONTROL_COLOR_LIGHT)))

    slope, intercept = np.polyfit(actual, predicted, 1)
    xs = np.linspace(lo, hi, 50)
    fig.add_trace(go.Scatter(x=xs, y=slope * xs + intercept, mode="lines", line=dict(color="red"), name="Trend"))

    fig.update_layout(title="Held-out test set: predicted vs. actual outcome", xaxis_title="Actual", yaxis_title="Predicted")
    return fig


def confusion_matrix(generalization: dict, threshold: float = 0.5) -> dict:
    actual = np.array(generalization["actual"])
    predicted = (np.array(generalization["predicted"]) >= threshold).astype(int)
    tp = int(((actual == 1) & (predicted == 1)).sum())
    tn = int(((actual == 0) & (predicted == 0)).sum())
    fp = int(((actual == 0) & (predicted == 1)).sum())
    fn = int(((actual == 1) & (predicted == 0)).sum())
    n = tp + tn + fp + fn
    accuracy = (tp + tn) / n if n else float("nan")
    precision = tp / (tp + fp) if (tp + fp) else float("nan")
    recall = tp / (tp + fn) if (tp + fn) else float("nan")
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else float("nan")
    return {"tp": tp, "tn": tn, "fp": fp, "fn": fn, "accuracy": accuracy, "precision": precision, "recall": recall, "f1": f1}


# ---------- Causal diagram ----------


def plot_causal_diagram(graph: dict, roles: dict):
    """networkx + matplotlib render of the study's causal diagram, using
    the same node/edge colors as the site's own diagram editor. `roles`
    maps node src -> one of NODE_COLORS' keys (besides "default"/
    "unobserved", which are derived from the node's own kind)."""
    import matplotlib.pyplot as plt
    import networkx as nx

    g = nx.DiGraph()
    id_to_src = {n["data"]["id"]: n["data"]["src"] for n in graph["nodes"]}
    for n in graph["nodes"]:
        g.add_node(n["data"]["src"], label=n["data"]["name"])
    for e in graph["edges"]:
        g.add_edge(id_to_src[e["data"]["source"]], id_to_src[e["data"]["target"]])

    node_colors, edge_colors = [], []
    for node in g.nodes:
        is_unobserved = node.startswith("u") and node[1:].isdigit()
        role = roles.get(node, "unobserved" if is_unobserved else "default")
        bg, border = NODE_COLORS.get(role, NODE_COLORS["default"])
        node_colors.append(bg)
        edge_colors.append(border)

    pos = nx.spring_layout(g, seed=42)
    fig, ax = plt.subplots(figsize=(8, 6))
    nx.draw_networkx_edges(g, pos, ax=ax, edge_color="#555555", arrows=True, arrowsize=15)
    nx.draw_networkx_nodes(g, pos, ax=ax, node_color=node_colors, edgecolors=edge_colors, linewidths=2, node_size=1200)
    nx.draw_networkx_labels(g, pos, ax=ax, labels={n: g.nodes[n]["label"] for n in g.nodes}, font_size=9)
    ax.set_title("Causal diagram used for this study")
    ax.axis("off")
    return fig
