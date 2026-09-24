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
