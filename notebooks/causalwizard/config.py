"""Parse the study config JSON the site exports, resolve column types, turn
the treatment column into whatever the chosen model needs (binary 0/1, or
left continuous), encode the outcome, and split off a held-out test set.

This is deliberately independent of the old site's `apply_treatment_threshold`
/`apply_treatment_tags` (identification.py) - the new site's `treatmentSpec`
is range-based (arbitrary half-open bounds via minOp/maxOp), not a single
threshold, so the classification logic below is written fresh against that
richer shape. It mirrors `classifierFromSpec()` in the site's own
`treatment-widget.js` line for line, so a value is classified identically
here and on the site's own Check/preview widgets.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

TRUTHY = {"true", "yes", "y", "t", "1"}


def load_config(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def parse_numeric(value: Any) -> float | None:
    """Mirrors datasets/types.js's parseNumeric(): strips thousands
    commas, returns None (not NaN/0) for blank/unparseable values."""
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def resolve_effective_type(config: dict, column: str) -> str:
    """"numerical" | "categorical" - study-level override, else the
    dataset's own (already Columns-tab-override-resolved) type. Mirrors
    study-view.js's effectiveVariableType()."""
    override = config["question"].get("variableTypes", {}).get(column)
    if override:
        return override
    for c in config["dataset"]["expectedColumns"]:
        if c["name"] == column:
            return "numerical" if c["type"] == "numeric" else "categorical"
    return "categorical"


def _numeric_matches(value: float, group: dict) -> bool:
    if group.get("min") is None and group.get("max") is None:
        return False
    if group.get("min") is not None:
        ok = value >= group["min"] if group.get("minOp", ">=") == ">=" else value > group["min"]
        if not ok:
            return False
    if group.get("max") is not None:
        ok = value <= group["max"] if group.get("maxOp", "<") == "<=" else value < group["max"]
        if not ok:
            return False
    return True


def classify_treatment_value(raw_value: Any, spec: dict) -> str:
    """"control" | "treated" | "excluded" for one raw value, per `spec`
    (a study's treatmentSpec). Only meaningful when spec["design"] isn't
    "continuous" - callers should branch on that first."""
    if spec["kind"] == "numeric":
        v = parse_numeric(raw_value)
        if v is None:
            return "excluded"
        if _numeric_matches(v, spec["control"]):
            return "control"
        if _numeric_matches(v, spec["treated"]):
            return "treated"
        return "excluded"

    if raw_value is None or (isinstance(raw_value, float) and np.isnan(raw_value)) or str(raw_value).strip() == "":
        return "excluded"
    value = str(raw_value).strip()
    if value in spec["control"]:
        return "control"
    if value in spec["treated"]:
        return "treated"
    if spec.get("controlAnything"):
        return "control"
    if spec.get("treatedAnything"):
        return "treated"
    return "excluded"


def is_continuous_treatment(question: dict) -> bool:
    spec = question.get("treatmentSpec") or {}
    return spec.get("kind") == "numeric" and spec.get("design") == "continuous"


@dataclass
class PreparedData:
    df: pd.DataFrame  # full frame, treatment/outcome columns replaced with model-ready values
    treatment_col: str
    outcome_col: str
    treatment_is_continuous: bool
    outcome_effective_type: str  # "numerical" | "categorical"
    outcome_class1_label: str | None  # original label mapped to outcome==1, categorical only
    covariate_cols: list[str] = field(default_factory=list)
    dropped_excluded: int = 0  # rows dropped because treatment classified as "excluded"
    dropped_na: int = 0  # rows dropped for missing values after treatment/outcome prep


def _resolve_outcome(series: pd.Series, effective_type: str) -> tuple[pd.Series, str | None]:
    if effective_type == "numerical":
        return series.map(parse_numeric), None

    present = series.dropna().astype(str).str.strip()
    present = present[present != ""]
    distinct = sorted(present.unique())
    if len(distinct) != 2:
        raise ValueError(f"Categorical outcome must have exactly 2 categories, found {len(distinct)}: {distinct}")
    lowered = {v.lower() for v in distinct}
    if lowered <= TRUTHY | {"false", "no", "n", "f", "0"}:
        class1 = next(v for v in distinct if v.lower() in TRUTHY)
    else:
        class1 = distinct[-1]  # deterministic: the "larger"/later of the two, sorted

    def encode(v):
        if v is None or (isinstance(v, float) and np.isnan(v)) or str(v).strip() == "":
            return np.nan
        return 1.0 if str(v).strip() == class1 else 0.0

    return series.map(encode), class1


def prepare_dataframe(config: dict, raw_df: pd.DataFrame) -> PreparedData:
    """Applies the study's question (treatment grouping, outcome encoding)
    to the raw uploaded data, re-deriving everything from the config
    rather than trusting any client-computed result - the notebook
    re-checks independently, same promise the site itself makes."""
    question = config["question"]
    treatment_col = question["treatment"]
    outcome_col = question["outcome"]
    spec = question["treatmentSpec"]
    df = raw_df.copy()

    outcome_type = resolve_effective_type(config, outcome_col)
    df[outcome_col], class1_label = _resolve_outcome(df[outcome_col], outcome_type)

    continuous = is_continuous_treatment(question)
    dropped_excluded = 0
    if continuous:
        df[treatment_col] = df[treatment_col].map(parse_numeric)
    else:
        labels = df[treatment_col].map(lambda v: classify_treatment_value(v, spec))
        before = len(df)
        df = df[labels != "excluded"].copy()
        dropped_excluded = before - len(df)
        df[treatment_col] = (labels[labels != "excluded"] == "treated").astype(float)

    covariate_cols = [
        c["name"] for c in config["dataset"]["expectedColumns"] if c["name"] not in (treatment_col, outcome_col)
    ]
    for col in covariate_cols:
        col_type = resolve_effective_type(config, col)
        if col_type == "numerical":
            df[col] = df[col].map(parse_numeric)
        else:
            df[col] = df[col].astype(str).str.strip()

    before = len(df)
    df = df.dropna(subset=[treatment_col, outcome_col]).copy()
    dropped_na = before - len(df)

    return PreparedData(
        df=df,
        treatment_col=treatment_col,
        outcome_col=outcome_col,
        treatment_is_continuous=continuous,
        outcome_effective_type=outcome_type,
        outcome_class1_label=class1_label,
        covariate_cols=covariate_cols,
        dropped_excluded=dropped_excluded,
        dropped_na=dropped_na,
    )


def train_test_split(df: pd.DataFrame, test_pct: float, seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Ordinary random split for held-out generalization checks - not a
    causal-validity test, just "how well does this model predict outcomes
    it wasn't fit on." test_pct is a plain 0-100 percentage."""
    test_frac = max(0.0, min(50.0, test_pct)) / 100.0
    if test_frac == 0 or len(df) < 10:
        return df, df.iloc[0:0]
    test_df = df.sample(frac=test_frac, random_state=seed)
    train_df = df.drop(test_df.index)
    return train_df, test_df
