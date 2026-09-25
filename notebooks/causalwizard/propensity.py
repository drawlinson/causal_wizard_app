"""Propensity-score diagnostics (results-page features 6 and 7) -
positivity check and covariate balance ("Love plot"). Only relevant for
the three propensity-based estimators (weighting/matching/stratification),
which is also where the propensity scores themselves come from: DoWhy's
own PropensityScoreEstimator base class fits a logistic regression of
treatment-on-backdoor-variables internally during `estimate_effect()` and
stashes the result on the fitted data - this module only reads it back,
it doesn't estimate propensity scores itself.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

BIN_WIDTH = 0.02
N_BINS = 50  # covers [0, 1] at 0.02 width - matches the "<0.06 / >=0.94" (3 bins) positivity-bad threshold below
TAIL_BINS = 3
BAD_POSITIVITY_THRESHOLD = 0.1
SMD_REFERENCE_LINE = 0.1  # the old page's own stated threshold (its code actually drew 0.2 - see ROADMAP)


def extract_propensity_scores(dowhy_estimate) -> np.ndarray:
    # DoWhy's PropensityScoreEstimator fits treatment-on-backdoor-variables
    # internally during estimate_effect() and stashes the column on the
    # CausalEstimate's own _data (not the estimator object) - this just
    # reads it back.
    return np.asarray(dowhy_estimate._data["propensity_score"])


def positivity_distribution(propensity: np.ndarray, treatment_binary: np.ndarray) -> dict:
    bin_edges = np.linspace(0.0, 1.0, N_BINS + 1)
    control_hist, _ = np.histogram(propensity[treatment_binary == 0], bins=bin_edges)
    treated_hist, _ = np.histogram(propensity[treatment_binary == 1], bins=bin_edges)

    control_density = control_hist / control_hist.sum() if control_hist.sum() > 0 else control_hist.astype(float)
    treated_density = treated_hist / treated_hist.sum() if treated_hist.sum() > 0 else treated_hist.astype(float)

    control_tail = control_density[:TAIL_BINS].sum() + control_density[-TAIL_BINS:].sum()
    treated_tail = treated_density[:TAIL_BINS].sum() + treated_density[-TAIL_BINS:].sum()
    bad = (control_tail + treated_tail) / 2 > BAD_POSITIVITY_THRESHOLD

    return {
        "bin_starts": bin_edges[:-1].tolist(),
        "control": control_density.tolist(),
        "treated": treated_density.tolist(),
        "bounds": BIN_WIDTH * TAIL_BINS,  # e.g. 0.06 - the positivity "danger zone" edge
        "control_empty": bool(control_hist.sum() == 0),
        "treated_empty": bool(treated_hist.sum() == 0),
        "distribution_bad": bool(bad),
    }


def covariate_balance(df: pd.DataFrame, backdoor_vars: list[str], covariate_types: dict, treatment_binary: np.ndarray, propensity: np.ndarray) -> dict:
    """Standardized Mean Difference per backdoor variable, unweighted
    ("original") and IPW-weighted ("weighted") - the before/after pair a
    Love plot needs. A categorical confounder gets one row per observed
    level, each as a 0/1 indicator (SMD on an indicator is the same
    formula, and a 0/1 variable's mean is just its proportion) - the
    standard way balance-checking tools (e.g. R's cobalt/MatchIt) handle a
    factor variable. Without this, a study whose whole identified backdoor
    set happens to be categorical would show an empty plot - not a rare
    case (e.g. a single categorical confounder like "region")."""
    treated_mask = treatment_binary == 1
    control_mask = treatment_binary == 0
    weight = np.where(treated_mask, 1.0 / np.clip(propensity, 1e-6, 1), 1.0 / np.clip(1 - propensity, 1e-6, 1))

    def smd(values: np.ndarray, w: np.ndarray | None) -> float:
        wt = w[treated_mask] if w is not None else None
        wc = w[control_mask] if w is not None else None
        mean_t = np.average(values[treated_mask], weights=wt)
        mean_c = np.average(values[control_mask], weights=wc)
        var_t = np.average((values[treated_mask] - mean_t) ** 2, weights=wt)
        var_c = np.average((values[control_mask] - mean_c) ** 2, weights=wc)
        pooled_sd = np.sqrt((var_t + var_c) / 2)
        return float((mean_t - mean_c) / pooled_sd) if pooled_sd > 0 else 0.0

    features: list[str] = []
    original: dict[str, float] = {}
    weighted: dict[str, float] = {}
    for var in backdoor_vars:
        if covariate_types.get(var) == "categorical":
            for level in sorted(df[var].dropna().unique(), key=str):
                label = f"{var} = {level}"
                indicator = (df[var] == level).to_numpy(dtype=float)
                features.append(label)
                original[label] = smd(indicator, None)
                weighted[label] = smd(indicator, weight)
        else:
            values = df[var].to_numpy(dtype=float)
            features.append(var)
            original[var] = smd(values, None)
            weighted[var] = smd(values, weight)

    return {
        "features": features,
        "original": original,
        "weighted": weighted,
        "reference_line": SMD_REFERENCE_LINE,
    }
