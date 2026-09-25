"""Regenerates backdoor.csv and panel.csv - run this and commit the
result if you deliberately want different fixture data (different N,
different effect sizes, etc). Not run automatically by the test suite -
the CSVs are committed so results are exactly reproducible without
depending on numpy's RNG behaving identically across versions/platforms.

    cd notebooks && .venv/bin/python tests/data/generate_fixtures.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent


def generate_backdoor(path: Path) -> None:
    """A CD+PO fixture: age (numeric confounder), region (3-level
    categorical confounder), no_degree (binary confounder that doubles as
    a frontdoor mediator - see test_estimation_cdpo.py's frontdoor cases),
    a numeric outcome, and a binary outcome (for GLM/classification
    tests)."""
    rng = np.random.default_rng(42)
    n = 250

    age = rng.normal(45, 12, n).round(1)
    region = rng.choice(["North", "South", "East"], size=n, p=[0.5, 0.3, 0.2])
    region_effect = pd.Series(region).map({"North": 0.0, "South": 5.0, "East": -4.0}).to_numpy()
    no_degree = (rng.uniform(size=n) < (0.5 - 0.006 * (age - 45))).astype(int)

    treat_logit = 0.0 + 0.025 * (age - 45) - 0.6 * no_degree
    treated = (rng.uniform(size=n) < 1 / (1 + np.exp(-treat_logit))).astype(int)

    noise = rng.normal(0, 5, n)
    outcome = (50 + 10 * treated + 0.5 * (age - 45) - 15 * no_degree + region_effect + noise).round(2)

    bin_logit = -0.3 + 1.0 * treated + 0.03 * (age - 45) - 1.0 * no_degree + rng.normal(0, 1, n)
    outcome_binary = (bin_logit > 0).astype(int)

    pd.DataFrame({
        "age": age,
        "region": region,
        "no_degree": no_degree,
        "treated": treated,
        "outcome": outcome,
        "outcome_binary": outcome_binary,
    }).to_csv(path, index=False)


def generate_panel(path: Path) -> None:
    """A PD+FE fixture: 5 entities x 3 time periods, with 2-4 samples per
    (entity, time) cell (like the real billboard/DiD dataset this project
    was debugged against - see ROADMAP.md 8.6 follow-up 12/13) - not one
    row per cell. `row_id` (unique per row) is there to trigger the
    singleton-entity/time warning on demand, by passing it as entity_col
    or time_col in a test."""
    rng = np.random.default_rng(7)

    entities = ["A", "B", "C", "D", "E"]
    times = [0, 1, 2]
    entity_fx = {"A": 0.0, "B": 3.0, "C": -2.0, "D": 5.0, "E": -4.0}
    time_fx = {0: 0.0, 1: 2.0, 2: 4.0}
    treat_start = {"A": None, "B": None, "C": 1, "D": 1, "E": 2}  # A, B never treated

    rows = []
    row_id = 0
    for entity in entities:
        for time in times:
            treated = int(treat_start[entity] is not None and time >= treat_start[entity])
            n_samples = 4 if entity in ("A", "C") else 2
            for _ in range(n_samples):
                size = rng.normal(10, 2)
                noise = rng.normal(0, 2)
                outcome = 20 + 5 * treated + entity_fx[entity] + time_fx[time] + 0.5 * size + noise
                rows.append({
                    "row_id": row_id,
                    "entity": entity,
                    "time": time,
                    "treated": treated,
                    "size": round(size, 2),
                    "outcome": round(outcome, 2),
                })
                row_id += 1

    pd.DataFrame(rows).to_csv(path, index=False)


if __name__ == "__main__":
    generate_backdoor(HERE / "backdoor.csv")
    generate_panel(HERE / "panel.csv")
    print(f"Wrote {HERE / 'backdoor.csv'} and {HERE / 'panel.csv'}")
