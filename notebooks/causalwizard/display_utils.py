"""Shared notebook-display helpers, so notebook 2's cells don't each
hand-roll their own dict formatting or duplicate the same table-building
logic.
"""

from __future__ import annotations

from pprint import pformat


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
