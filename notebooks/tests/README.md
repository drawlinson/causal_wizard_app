# causalwizard test suite

Unit/integration tests for the `causalwizard` Python package (the notebooks'
actual statistics code), calling its functions directly rather than
executing the notebooks themselves - the same checks, at a fraction of the
runtime (the whole suite runs in a few seconds; a single `jupyter nbconvert
--execute` pass takes much longer). Covers Python only, matching the rest
of this project's split - the site's own JS has no test suite here.

## Running

```sh
cd notebooks
uv pip install -r requirements.txt -r requirements-dev.txt   # once
.venv/bin/python -m pytest                                   # or: .venv/bin/pytest
```

`pythonpath = .` in `pytest.ini` makes `import causalwizard` resolve
regardless of cwd - the package isn't pip-installed into `.venv` (nothing
in this venv is; it has no working `pip`, only `uv` can install into it -
see ROADMAP.md 8.6 follow-up 11/12 for how that was discovered).

## Structure

- `conftest.py` - shared fixtures (`backdoor_df`, `panel_df`, loaded from
  `data/`).
- `helpers.py` - `make_graph()` builds the `{"nodes": [...], "edges":
  [...]}` shape `identification.py` (and the site's own config.json)
  use, from a plain list of `(source_column, target_column)` edges;
  `make_config()` builds a full study config dict for tests that want to
  exercise `config.prepare_dataframe()` end-to-end.
- `test_*.py` - one file per `causalwizard/*.py` module.
- `data/backdoor.csv`, `data/panel.csv` - the two fixture datasets (see
  below). `data/generate_fixtures.py` regenerates them deterministically
  (fixed RNG seeds) - only re-run it if you deliberately want different
  fixture data; the CSVs are committed so test results don't depend on
  numpy's RNG behaving identically across versions.

## Fixture data

**`backdoor.csv`** (250 rows) - a CD+PO scenario: `age` (numeric
confounder), `region` (3-level categorical confounder), `no_degree`
(binary confounder), `treated` (binary treatment), `outcome` (numeric),
`outcome_binary` (binary, for GLM/classification tests). `no_degree` is
also used as a frontdoor mediator in some tests - a boolean/2-level
column used as a mediator is exactly the scenario that used to crash
DoWhy's `TwoStageRegressionEstimator` with "Pandas data cast to numpy
dtype of object" before `config.py` started encoding 2-level categoricals
numerically (`test_estimation_cdpo.py::test_frontdoor_crashes_if_
mediator_left_as_string` reproduces the original bug directly, to keep it
that way).

**`panel.csv`** (42 rows) - a PD+FE scenario: 5 entities x 3 time
periods, with 2-4 samples per `(entity, time)` cell rather than one -
like the real billboard/DiD dataset this project was debugged against
(ROADMAP.md 8.6 follow-up 12). Also has a `row_id` column (unique per
row) for deliberately triggering the singleton-entity/time warning by
passing it as `entity_col`/`time_col` in a test.

## What's covered

Every `causalwizard/*.py` module has a matching `test_*.py`. Notably:

- **Every CD+PO estimator variant** (`test_estimation_cdpo.py`): own
  linear regression, GLM (both Binomial/binary and Poisson/numeric
  outcome), all three propensity methods, Double ML, frontdoor
  (two-stage regression, including the categorical-mediator regression
  test above), and instrumental variables.
- **Every PD+FE fixed-effects configuration** (`test_estimation_pdfe.py`):
  two-way, one-way (entity-only, time-only), zero-way (plain OLS),
  entity-clustered vs HC1 standard errors, the singleton-entity/time
  warning, and that duplicated `(entity, time)` rows don't change the
  estimated effect.
- The good/bad significance-direction logic for validation
  (`test_diagnostics.py`, `test_refutation.py`) - bootstrap significant =
  good, but placebo/random-common-cause significant = bad, the exact
  distinction the results page's "Estimate valid?" column depends on.
- Plotting smoke tests (`test_plotting.py`) - every plot function runs
  and returns a figure; a couple also check the specific things earlier
  bugs got wrong (counterfactual-series x-coordinates, duplicate-row
  averaging in the outcomes-over-time plot).

## What this doesn't replace

This doesn't replace occasionally running the real notebooks end-to-end
(`jupyter nbconvert --execute`, or opening them in Jupyter/Colab) after a
change - that's still the only thing that catches a notebook-cell wiring
mistake (a cell calling a function with the wrong variable, a markdown
cell referencing a renamed field, an import left out of a cell) rather
than a bug in `causalwizard` itself. Do both: this suite for fast,
routine checks of the actual statistics/logic, a real notebook run before
calling a change done.
