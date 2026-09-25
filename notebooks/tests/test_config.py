import numpy as np
import pandas as pd
import pytest

from causalwizard import config
from tests.helpers import make_config


# ---------- parse_numeric ----------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("42", 42.0),
        (42, 42.0),
        ("1,234.5", 1234.5),
        ("  3.14  ", 3.14),
        ("", None),
        (None, None),
        ("not a number", None),
    ],
)
def test_parse_numeric(raw, expected):
    assert config.parse_numeric(raw) == expected


# ---------- resolve_effective_type ----------


def test_resolve_effective_type_prefers_variable_type_override():
    cfg = {"question": {"variableTypes": {"age": "categorical"}}, "dataset": {"expectedColumns": [{"name": "age", "type": "numeric"}]}}
    assert config.resolve_effective_type(cfg, "age") == "categorical"


def test_resolve_effective_type_falls_back_to_dataset_type():
    cfg = {"question": {}, "dataset": {"expectedColumns": [{"name": "age", "type": "numeric"}, {"name": "region", "type": "text"}]}}
    assert config.resolve_effective_type(cfg, "age") == "numerical"
    assert config.resolve_effective_type(cfg, "region") == "categorical"


def test_resolve_effective_type_unknown_column_defaults_categorical():
    cfg = {"question": {}, "dataset": {"expectedColumns": []}}
    assert config.resolve_effective_type(cfg, "mystery") == "categorical"


# ---------- classify_treatment_value ----------


def test_classify_treatment_value_categorical():
    spec = {"kind": "categorical", "control": ["0"], "treated": ["1"], "controlAnything": False, "treatedAnything": False}
    assert config.classify_treatment_value("0", spec) == "control"
    assert config.classify_treatment_value("1", spec) == "treated"
    assert config.classify_treatment_value("2", spec) == "excluded"
    assert config.classify_treatment_value(None, spec) == "excluded"
    assert config.classify_treatment_value("", spec) == "excluded"


def test_classify_treatment_value_categorical_anything_fallback():
    spec = {"kind": "categorical", "control": ["0"], "treated": [], "controlAnything": False, "treatedAnything": True}
    assert config.classify_treatment_value("0", spec) == "control"
    assert config.classify_treatment_value("anything else", spec) == "treated"


def test_classify_treatment_value_numeric_ranges():
    spec = {"kind": "numeric", "control": {"max": 12, "maxOp": "<="}, "treated": {"min": 12, "minOp": ">"}}
    assert config.classify_treatment_value("10", spec) == "control"
    assert config.classify_treatment_value("12", spec) == "control"
    assert config.classify_treatment_value("13", spec) == "treated"
    assert config.classify_treatment_value("not a number", spec) == "excluded"


def test_is_continuous_treatment():
    assert config.is_continuous_treatment({"treatmentSpec": {"kind": "numeric", "design": "continuous"}})
    assert not config.is_continuous_treatment({"treatmentSpec": {"kind": "numeric", "design": "grouped"}})
    assert not config.is_continuous_treatment({"treatmentSpec": {"kind": "categorical"}})
    assert not config.is_continuous_treatment({})


# ---------- align_columns ----------


def test_align_columns_renames_by_position():
    raw = pd.DataFrame({"Unnamed: 0": [1, 2], "b": [3, 4]})
    cfg = {"dataset": {"expectedColumns": [{"name": "id", "type": "numeric"}, {"name": "value", "type": "numeric"}]}}
    aligned = config.align_columns(raw, cfg)
    assert list(aligned.columns) == ["id", "value"]


def test_align_columns_raises_on_column_count_mismatch():
    raw = pd.DataFrame({"a": [1]})
    cfg = {"dataset": {"expectedColumns": [{"name": "a", "type": "numeric"}, {"name": "b", "type": "numeric"}]}}
    with pytest.raises(ValueError):
        config.align_columns(raw, cfg)


# ---------- _encode_categorical ----------


def test_encode_categorical_two_level_becomes_numeric():
    encoded = config._encode_categorical(pd.Series([0, 1, 0, 1]))
    assert encoded.tolist() == [0.0, 1.0, 0.0, 1.0]
    assert encoded.dtype == float


def test_encode_categorical_two_level_strings_sorted_deterministically():
    encoded = config._encode_categorical(pd.Series(["True", "False", "True"]))
    # sorted(key=str): "False" < "True" -> False=0.0, True=1.0
    assert encoded.tolist() == [1.0, 0.0, 1.0]


def test_encode_categorical_three_level_stays_string():
    encoded = config._encode_categorical(pd.Series(["North", "South", "East"]))
    assert encoded.tolist() == ["North", "South", "East"]
    assert encoded.dtype == object


# ---------- prepare_dataframe (integration) ----------


@pytest.fixture
def backdoor_config():
    return make_config(
        columns=[("age", "numeric"), ("region", "text"), ("no_degree", "boolean"), ("treated", "boolean"), ("outcome", "numeric"), ("outcome_binary", "boolean")],
        treatment="treated",
        outcome="outcome",
        graph_edges=[("age", "treated"), ("age", "outcome"), ("region", "outcome"), ("no_degree", "treated"), ("no_degree", "outcome"), ("treated", "outcome")],
        model_key="backdoor.linear_regression",
        estimand_type="backdoor",
        variable_types={"region": "categorical", "no_degree": "categorical", "treated": "categorical"},
    )


def test_prepare_dataframe_binarizes_treatment_and_keeps_outcome_numeric(backdoor_df, backdoor_config):
    prepared = config.prepare_dataframe(backdoor_config, backdoor_df)
    assert set(prepared.df["treated"].unique()) <= {0.0, 1.0}
    assert prepared.treatment_is_continuous is False
    assert prepared.outcome_effective_type == "numerical"
    assert prepared.outcome_class1_label is None
    assert pd.api.types.is_float_dtype(prepared.df["outcome"])


def test_prepare_dataframe_encodes_two_level_covariate_numerically(backdoor_df, backdoor_config):
    prepared = config.prepare_dataframe(backdoor_config, backdoor_df)
    # no_degree is a 2-level categorical covariate - should be numeric 0.0/1.0, not stringified
    assert set(prepared.df["no_degree"].unique()) <= {0.0, 1.0}
    assert pd.api.types.is_float_dtype(prepared.df["no_degree"])


def test_prepare_dataframe_leaves_multilevel_covariate_as_string(backdoor_df, backdoor_config):
    prepared = config.prepare_dataframe(backdoor_config, backdoor_df)
    assert prepared.df["region"].dtype == object
    assert set(prepared.df["region"].unique()) == {"North", "South", "East"}


def test_prepare_dataframe_categorical_outcome(backdoor_df, backdoor_config):
    backdoor_config["question"]["outcome"] = "outcome_binary"
    backdoor_config["question"]["variableTypes"]["outcome_binary"] = "categorical"
    prepared = config.prepare_dataframe(backdoor_config, backdoor_df)
    assert prepared.outcome_effective_type == "categorical"
    assert prepared.outcome_class1_label == "1"
    assert set(prepared.df["outcome_binary"].unique()) <= {0.0, 1.0}


def test_prepare_dataframe_drops_no_rows_for_clean_fixture(backdoor_df, backdoor_config):
    prepared = config.prepare_dataframe(backdoor_config, backdoor_df)
    assert prepared.dropped_excluded == 0
    assert prepared.dropped_na == 0
    assert len(prepared.df) == len(backdoor_df)


# ---------- dropna_rows ----------


def test_dropna_rows_drops_only_rows_missing_the_given_columns():
    df = pd.DataFrame({"a": [1.0, np.nan, 3.0], "b": [1.0, 2.0, np.nan]})
    clean, dropped = config.dropna_rows(df, ["a"])
    assert dropped == 1
    assert clean["a"].tolist() == [1.0, 3.0]


# ---------- train_test_split ----------


def test_train_test_split_respects_percentage_and_is_deterministic():
    df = pd.DataFrame({"x": range(100)})
    train1, test1 = config.train_test_split(df, 20, seed=42)
    train2, test2 = config.train_test_split(df, 20, seed=42)
    assert len(test1) == 20
    assert len(train1) == 80
    assert test1.index.tolist() == test2.index.tolist()


def test_train_test_split_no_split_below_minimum_rows():
    df = pd.DataFrame({"x": range(5)})
    train, test = config.train_test_split(df, 20)
    assert len(test) == 0
    assert len(train) == 5


def test_train_test_split_zero_percent_disables_split():
    df = pd.DataFrame({"x": range(100)})
    train, test = config.train_test_split(df, 0)
    assert len(test) == 0
    assert len(train) == 100
