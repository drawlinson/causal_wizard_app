import time

import pytest

from causalwizard import results_schema


def _minimal_results(**overrides) -> dict:
    kwargs = dict(
        config_path="study-config.json",
        data_path="data.csv",
        method="cd+po",
        treatment_col="treated",
        outcome_col="outcome",
        treatment_is_continuous=False,
        outcome_effective_type="numerical",
        outcome_class1_label=None,
        target_units="ate",
        effect=12.34,
        estimand_type="backdoor",
        estimand_expression="E[outcome|do(treated),age]",
        estimator_name="linear_regression",
        method_key="backdoor.linear_regression",
        assumptions={"Unconfoundedness": "..."},
        validation={"bootstrap": {"p_value": 0.01, "significant": True}},
        accept=True,
        counterfactuals={"all": {"count": 100, "sum": 1234.0, "mean": 12.34}},
        counterfactual_control_value=0.0,
        counterfactual_treated_value=1.0,
        generalization={"actual": [1.0], "predicted": [1.1], "treatment": [1.0]},
        contingency={"total": {"control": 50, "treated": 50, "total": 100}},
        sample_counts={"control": 50, "treated": 50, "total": 100},
        propensity_analysis=None,
        modelling_statements={"treatment_variable": "treated"},
        panel_data=None,
        dropped_excluded=0,
        dropped_na=0,
        coefficients={"Intercept": 1.0, "Q('treated')": 12.34},
        warnings=[],
    )
    kwargs.update(overrides)
    return results_schema.build_results(**kwargs)


def test_build_results_shape():
    results = _minimal_results()
    assert results["schemaVersion"] == 1
    assert results["source"] == {"configPath": "study-config.json", "dataPath": "data.csv"}
    assert results["estimate"]["effect"] == 12.34
    assert results["estimate"]["coefficients"] == {"Intercept": 1.0, "Q('treated')": 12.34}
    assert results["estimate"]["warnings"] == []
    assert results["sample"]["counts"] == {"control": 50, "treated": 50, "total": 100}


def test_build_results_defaults_estimand_variables_and_warnings_to_empty_list():
    results = _minimal_results()
    assert results["estimate"]["estimandVariables"] == []
    assert results["estimate"]["warnings"] == []


def test_save_and_load_results_roundtrip(tmp_path):
    results = _minimal_results()
    path = tmp_path / "results.json"
    results_schema.save_results(results, str(path))
    loaded = results_schema.load_results(str(path))
    assert loaded == results


def test_find_latest_results_picks_most_recently_written(tmp_path):
    old_path = tmp_path / "results-a.json"
    new_path = tmp_path / "results-b.json"
    results_schema.save_results(_minimal_results(), str(old_path))
    time.sleep(0.01)
    results_schema.save_results(_minimal_results(), str(new_path))
    assert results_schema.find_latest_results(str(tmp_path)) == str(new_path)


def test_find_latest_results_raises_when_none_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        results_schema.find_latest_results(str(tmp_path))
