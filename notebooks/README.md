# Causal Wizard notebooks

The [Causal Wizard](https://github.com/drawlinson/causal_wizard_app) site is entirely
client-side and doesn't run any statistics itself. Once you've built a study and it
passes the site's Check step, you download a config JSON and run these two notebooks
against that config plus your own data file to get the actual causal-effect estimate.

| | |
|---|---|
| **01-identification-and-estimation.ipynb** | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/drawlinson/causal_wizard_app/blob/main/notebooks/01-identification-and-estimation.ipynb) |
| **02-results.ipynb** | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/drawlinson/causal_wizard_app/blob/main/notebooks/02-results.ipynb) |

## How it works

1. **01-identification-and-estimation.ipynb** loads your config + data, re-derives the
   treatment/outcome encoding independently (it doesn't just trust the site), identifies
   and fits the model, runs validation/refutation, and writes everything to `results.json`.
2. **02-results.ipynb** is pure presentation: it reads `results.json` (plus the same
   config/data, for the plots that need raw rows) and renders the full results report -
   a study summary, findings, outcome plots, counterfactuals, refutation/validation,
   held-out generalization, contingency table, positivity/covariate-balance checks, the
   full regression summary (own linear regression/GLM and PD+FE), assumptions, and the
   causal diagram. Each section includes plain-language explanatory text (adapted from
   the site's own help articles, with links back to [causalwizard.app](https://causalwizard.app))
   aimed at a reader who knows statistics but is new to causal inference.

In Colab, each notebook's first cell installs the `causalwizard` package straight from
this repository. To run locally instead:

```sh
git clone https://github.com/drawlinson/causal_wizard_app.git
cd causal_wizard_app/notebooks
python3 -m venv .venv && source .venv/bin/activate   # or: uv venv && source .venv/bin/activate
pip install -r requirements.txt                       # or: uv pip install -r requirements.txt
jupyter notebook
```

Edit the `config_path`/`data_path`/`results_path` variables near the top of notebook 1
to point at your downloaded config JSON and dataset file. Notebook 2 needs no editing for
a normal run - it auto-finds the most recently written `results*.json` in the folder and
reads the config/data paths back out of it; set `results_path` there only to load a
different (older, or differently-named) results file.

## Package layout

The notebooks themselves stay thin - all computation lives in the `causalwizard/`
package so the notebook flow reads cleanly cell-by-cell:

- `config.py` - parses the study config, aligns your data file's columns to it by
  position (so a blank CSV header the site renamed to `column_N` doesn't crash a name
  lookup), re-derives column types, applies the treatment spec, encodes the outcome,
  drops rows missing a required value, and splits off a held-out test set.
- `identification.py` - builds the DoWhy causal model from your diagram and identifies
  the estimand.
- `estimation_cdpo.py` / `estimation_pdfe.py` - fits the chosen model for each method.
- `counterfactuals.py` - do-operator predictions (counterfactual table, held-out
  generalization, and the per-row predictions the results notebook's plots need).
- `propensity.py` - positivity and covariate-balance diagnostics.
- `refutation.py` - CD+PO's DoWhy refuters/bootstrap, PD+FE's z/F-statistics.
- `diagnostics.py` - contingency table, findings text, assumptions, modelling statements.
- `plotting.py` - every Plotly/matplotlib figure, one function per plot.
- `results_schema.py` - the `results.json` contract between the two notebooks (embeds the
  config/data paths themselves, and can find the latest results file automatically).
- `display_utils.py` - shared pretty-printing so dict-shaped results show up indented
  rather than as a dense one-liner.
