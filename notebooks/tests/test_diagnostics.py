import pandas as pd
import pytest

from causalwizard import diagnostics


# ---------- findings_markdown: the DAG-correctness caveat ----------


@pytest.mark.parametrize("accept", [True, False, None])
def test_findings_markdown_always_includes_dag_caveat_before_the_verdict(accept):
    # The caveat applies regardless of whether validation passed, failed,
    # or didn't run at all - a "validated" wrong-diagram result is just as
    # wrong as an unvalidated one, so this must never be conditional on
    # `accept`.
    md = diagnostics.findings_markdown("treated", "outcome", False, "numerical", None, "ate", 12.3, accept)
    assert "causal diagram" in md
    assert md.index("Before you trust this number") < md.index("Validation" if accept is not None else "No validation")


# ---------- feature_label ----------


@pytest.mark.parametrize(
    "term, expected",
    [
        ("Intercept", "Intercept"),
        ("Q('Treated')", "Treated"),
        ("Q('Education_years')", "Education_years"),
        ("C(Q('Married'))[T.1.0]", "Married = 1.0"),
        ("C(Q('No_Degree'))[T.1.0]", "No_Degree = 1.0"),
        ("C(Q('region'))[T.North]", "region = North"),
        ("something_unrecognized", "something_unrecognized"),  # falls back unchanged
    ],
)
def test_feature_label(term, expected):
    assert diagnostics.feature_label(term) == expected


# ---------- validation_rows: the good/bad significance direction ----------


def test_validation_rows_empty_for_no_validation():
    assert diagnostics.validation_rows(None) == []
    assert diagnostics.validation_rows({}) == []


def test_validation_rows_bootstrap_significant_is_valid():
    validation = {"bootstrap": {"p_value": 0.01, "significant": True, "confidence_interval": [1.0, 2.0]}}
    rows = diagnostics.validation_rows(validation)
    assert rows[0]["Estimate valid?"] == "Yes"
    assert rows[0]["95% CI"] == [1.0, 2.0]


def test_validation_rows_placebo_significant_is_invalid():
    # Placebo/random-common-cause are REVERSED: a significant result here
    # means the refuter found a problem, not that it confirmed the effect.
    validation = {"placebo_treatment": {"p_value": 0.01, "significant": True, "new_effect": 5.0}}
    rows = diagnostics.validation_rows(validation)
    assert rows[0]["Estimate valid?"] == "No"
    assert rows[0]["New effect"] == 5.0


def test_validation_rows_placebo_not_significant_is_valid():
    validation = {"placebo_treatment": {"p_value": 0.9, "significant": False}}
    rows = diagnostics.validation_rows(validation)
    assert rows[0]["Estimate valid?"] == "Yes"


def test_validation_rows_random_common_cause_reversed_too():
    validation = {"random_common_cause": {"p_value": 0.01, "significant": True}}
    rows = diagnostics.validation_rows(validation)
    assert rows[0]["Estimate valid?"] == "No"


def test_validation_rows_pdfe_z_and_f_statistics_not_reversed():
    validation = diagnostics_pdfe_validation(z_significant=True, f_significant=True)
    rows = diagnostics.validation_rows(validation)
    assert all(row["Estimate valid?"] == "Yes" for row in rows)


def test_validation_rows_missing_significant_is_blank_not_yes_or_no():
    validation = {"bootstrap": {"p_value": None, "significant": None}}
    rows = diagnostics.validation_rows(validation)
    assert rows[0]["Estimate valid?"] == ""


def diagnostics_pdfe_validation(z_significant: bool, f_significant: bool) -> dict:
    return {
        "z_statistic": {"p_value": 0.01 if z_significant else 0.9, "significant": z_significant},
        "f_statistic": {"p_value": 0.01 if f_significant else 0.9, "significant": f_significant},
    }


# ---------- contingency_table ----------


def test_contingency_table_numeric_outcome_has_no_by_outcome_breakdown():
    df = pd.DataFrame({"treated": [0, 0, 1, 1, 1], "outcome": [1.0, 2.0, 3.0, 4.0, 5.0]})
    table = diagnostics.contingency_table(df, "treated", "outcome", outcome_is_categorical=False, class1_label=None)
    assert table["total"] == {"control": 2, "treated": 3, "total": 5}
    assert "by_outcome" not in table


def test_contingency_table_categorical_outcome_breakdown():
    df = pd.DataFrame({"treated": [0, 0, 1, 1], "outcome": [0, 1, 0, 1]})
    table = diagnostics.contingency_table(df, "treated", "outcome", outcome_is_categorical=True, class1_label="Yes")
    assert table["by_outcome"]["0"] == {"control": 1, "treated": 1}
    assert table["by_outcome"]["1"] == {"control": 1, "treated": 1}
    assert table["class1_label"] == "Yes"


# ---------- generalization_unavailable_reason ----------


def test_generalization_available_for_pdfe():
    assert diagnostics.generalization_unavailable_reason("pd+fe", "anything") is None


@pytest.mark.parametrize("estimator", ["linear_regression", "generalized_linear_model"])
def test_generalization_available_for_own_regression(estimator):
    assert diagnostics.generalization_unavailable_reason("cd+po", estimator) is None


@pytest.mark.parametrize(
    "estimator",
    ["econml.dml.DML", "propensity_score_weighting", "propensity_score_matching", "propensity_score_stratification", "two_stage_regression", "instrumental_variable"],
)
def test_generalization_unavailable_with_a_reason_for_everything_else(estimator):
    reason = diagnostics.generalization_unavailable_reason("cd+po", estimator)
    assert isinstance(reason, str) and reason


# ---------- generalization_metrics_table ----------


def test_generalization_metrics_table_numerical():
    rows = diagnostics.generalization_metrics_table(False, {"R² (coefficient of determination)": "0.42"})
    labels = [r["Metric"] for r in rows]
    assert labels == [k for k, _ in diagnostics.NUMERICAL_METRIC_NOTES]
    assert rows[0]["Value"] == "0.42"
    assert rows[1]["Value"] == ""  # RMSE not supplied - blank, not a crash


def test_generalization_metrics_table_categorical():
    rows = diagnostics.generalization_metrics_table(True, {"Accuracy": "0.9"})
    labels = [r["Metric"] for r in rows]
    assert labels == [k for k, _ in diagnostics.CATEGORICAL_METRIC_NOTES]


# ---------- modelling_statements ----------


def test_modelling_statements_basic_shape():
    stmts = diagnostics.modelling_statements(
        "cd+po", "treated", "outcome", False, "numerical", None,
        {"control": 10, "treated": 5, "total": 15}, "backdoor", "P(outcome|treated,age)",
        "linear_regression", None,
    )
    assert stmts["treatment_variable"] == "treated"
    assert stmts["outcome_variable"] == "outcome"
    assert "Fixed-effects" not in stmts["methodology"]
    assert stmts["estimand_type"] == "backdoor"


def test_modelling_statements_pdfe_methodology_text():
    stmts = diagnostics.modelling_statements(
        "pd+fe", "treated", "outcome", False, "numerical", None,
        {"control": 10, "treated": 5, "total": 15}, None, None, "fixed_effects",
        {"entity": "city", "time": "month", "covariates": []},
    )
    assert "Fixed-effects" in stmts["methodology"]
    assert stmts["panel_data"]["entity"] == "city"
