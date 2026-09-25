"""Shared notebook-display helpers, so notebook 2's cells don't each
hand-roll their own dict formatting or duplicate the same table-building
logic.
"""

from __future__ import annotations

from pprint import pformat

import pandas as pd


def show(obj, label: str | None = None) -> None:
    """Pretty-print a dict/list with indentation, instead of the dense
    one-line repr a plain print(some_dict) gives you."""
    if label:
        print(f"{label}:")
    print(pformat(obj, indent=2, sort_dicts=False, width=100))


def style_yes_no(df, column: str):
    """Colours a Yes/No column green/red - for a table where the reader
    just needs the verdict at a glance (e.g. "Estimate valid?"), not to
    parse each row's own raw statistic to work out what it means."""

    def _color(value):
        if value == "Yes":
            return "color: green; font-weight: bold"
        if value == "No":
            return "color: red; font-weight: bold"
        return ""

    return df.style.map(_color, subset=[column])


def wrap_table(df, wrap_columns: list[str] | None = None):
    """A DataFrame styled so a wide text column (e.g. a "Notes"
    explanation) wraps onto multiple lines instead of pandas' default
    truncate-with-"..." at 50 characters (its default `display.
    max_colwidth`, which plain `display(df)` applies but a Styler
    doesn't) - and the table stretches to use the available width rather
    than staying cramped to its narrowest natural size."""
    wrap_columns = list(df.columns) if wrap_columns is None else wrap_columns
    return (
        df.style
        .set_properties(subset=wrap_columns, **{"white-space": "normal", "text-align": "left"})
        .set_table_attributes('style="width:100%"')
    )


def style_confusion_matrix(df):
    """Colours a confusion-matrix DataFrame (rows=Actual, columns=
    Predicted) the way the old site did: green on the diagonal (correct
    predictions), red off it (incorrect) - a "Total" row/column, if
    present, stays uncoloured."""
    def _cell_style(row_label: str, col_label: str) -> str:
        if row_label == "Total" or col_label == "Total":
            return ""
        return "background-color: #d4edda" if row_label == col_label else "background-color: #f8d7da"

    styles = pd.DataFrame(
        [[_cell_style(r, c) for c in df.columns] for r in df.index], index=df.index, columns=df.columns,
    )
    return df.style.apply(lambda _: styles, axis=None)
