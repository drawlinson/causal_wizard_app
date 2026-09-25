import math

import pandas as pd
import pytest

from causalwizard import estimation_pdfe


def test_two_way_fixed_effects_recovers_approximate_treatment_effect(panel_df):
    # True effect baked into the fixture generator is +5 (see tests/data
    # generation) - the demeaning should recover something close to that
    # despite the duplicated (entity, time) rows.
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", [], {})
    assert est.effect == pytest.approx(5.0, abs=2.0)
    assert math.isfinite(est.z_pvalue)
    assert math.isfinite(est.f_pvalue)
    assert est.warnings == []


def test_two_way_fixed_effects_uses_entity_clustered_errors(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", [], {})
    assert est.result.cov_type == "cluster"


def test_one_way_entity_only(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", None, "treated", "outcome", [], {})
    assert math.isfinite(est.effect)
    assert est.result.cov_type == "cluster"


def test_one_way_time_only_falls_back_to_hc1(panel_df):
    est = estimation_pdfe.estimate(panel_df, None, "time", "treated", "outcome", [], {})
    assert math.isfinite(est.effect)
    assert est.result.cov_type == "HC1"  # no entity to cluster by


def test_zero_way_is_plain_ols(panel_df):
    est = estimation_pdfe.estimate(panel_df, None, None, "treated", "outcome", [], {})
    assert math.isfinite(est.effect)
    assert est.result.cov_type == "HC1"
    assert list(est.coefficients.keys()) == ["Intercept", "Q('treated')"]


def test_numeric_covariate_is_included_and_demeaned(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", ["size"], {"size": "numerical"})
    assert "Q('size')" in est.coefficients


def test_duplicate_entity_time_rows_dont_crash_and_effect_stays_sane(panel_df):
    # Sanity check that having several samples per (entity, time) cell -
    # the billboard/DiD scenario this project was debugged against - is
    # handled, not just "doesn't crash": duplicating every row shouldn't
    # change the estimated effect at all (same within-cell means).
    doubled = panel_df.copy()
    doubled2 = panel_df.copy()
    doubled2["row_id"] = doubled2["row_id"] + 1000
    doubled = pd.concat([doubled, doubled2], ignore_index=True)
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", [], {})
    est_doubled = estimation_pdfe.estimate(doubled, "entity", "time", "treated", "outcome", [], {})
    assert est_doubled.effect == pytest.approx(est.effect, abs=1e-9)


def test_singleton_entity_triggers_warning(panel_df):
    # row_id is unique per row - using it as "entity" is exactly the
    # degenerate case this warning exists for (see the ROADMAP entry on
    # the billboard entity=column_1 bug).
    est = estimation_pdfe.estimate(panel_df, "row_id", "time", "treated", "outcome", [], {})
    assert len(est.warnings) == 1
    assert "row_id" in est.warnings[0]
    assert "entity" in est.warnings[0]


def test_singleton_time_triggers_warning(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", "row_id", "treated", "outcome", [], {})
    assert len(est.warnings) == 1
    assert "row_id" in est.warnings[0]
    assert "time" in est.warnings[0]


def test_normal_entity_and_time_trigger_no_warning(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", [], {})
    assert est.warnings == []


def test_predict_do_operator_changes_with_fixed_treatment(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", [], {})
    predicted_control = est.predict(panel_df, 0.0)
    predicted_treated = est.predict(panel_df, 1.0)
    # The whole point of fitting a treatment coefficient: switching every
    # row to "treated" should shift predictions up by ~the effect size,
    # uniformly (no interaction terms in this formula).
    diff = (predicted_treated - predicted_control).to_numpy()
    assert diff == pytest.approx(est.effect, abs=1e-6)


def test_predict_actual_treatment_is_close_to_observed(panel_df):
    est = estimation_pdfe.estimate(panel_df, "entity", "time", "treated", "outcome", [], {})
    predicted = est.predict(panel_df, None)
    residual = (predicted - panel_df["outcome"]).abs()
    assert residual.mean() < 3.0  # noise std in the fixture generator was 2
