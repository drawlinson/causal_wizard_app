"""Shared fixtures for the causalwizard test suite.

Two small synthetic datasets, generated once and committed under
tests/data/ (see tests/README.md for how) rather than regenerated per
test run, so results are exactly reproducible and tests don't depend on
numpy's RNG behaving identically across versions:

- backdoor.csv: a CD+PO fixture (250 rows) with a real numeric confounder
  (age), a 3-level categorical confounder (region), and a binary
  confounder (no_degree) that doubles as a frontdoor mediator - it's
  what exercises the "categorical/boolean column used as a frontdoor
  mediator" regression test (see test_config.py and
  test_estimation_cdpo.py's frontdoor case).
- panel.csv: a PD+FE fixture (42 rows, 5 entities x 3 time periods) with
  deliberately duplicated (entity, time) rows (2-4 samples per cell,
  like the real billboard/DiD dataset this project was debugged
  against), plus a `row_id` column for triggering the singleton-entity
  warning on demand.
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")  # headless - these tests never need to actually display a plot

from pathlib import Path

import pandas as pd
import pytest

DATA_DIR = Path(__file__).parent / "data"


@pytest.fixture
def backdoor_df() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "backdoor.csv")


@pytest.fixture
def panel_df() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "panel.csv")
