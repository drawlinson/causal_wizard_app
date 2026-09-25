# Causal Wizard

**[causalwizard.app](https://causalwizard.app)** — a free, open-source tool for measuring
cause-and-effect relationships in your own data, without needing a semester of causal
inference training first.

You draw a **causal diagram** encoding what you believe causes what (informed by your own
domain knowledge — the tool doesn't try to learn this for you); Causal Wizard identifies a
valid statistical strategy from that diagram, and a companion Jupyter notebook fits the
model and reports the effect, along with a battery of robustness/validation checks. See
[`/about/`](https://causalwizard.app/about/) for the full pitch and
[`/articles/`](https://causalwizard.app/articles/) for the ~90-article glossary covering
the statistics and causal-inference concepts involved.

This repository is the entire project: the site and the notebooks both. There's no
server and no account system — the site is a static build that runs entirely in your
browser, and the actual statistical fitting happens in a notebook you run yourself (in
Google Colab, free, or on your own computer), so your data never has to leave your own
machine. See [`/security/`](https://causalwizard.app/security/) for what that means in
practice.

## The two halves of this repo

**Everything here works together as one product at [causalwizard.app](https://causalwizard.app) —
these are two halves of a single workflow, not two separate tools.** You only need to
run this repo's code yourself if you want to self-host the site, or run/modify the
notebooks locally instead of in Colab; using the hosted site still means running the
notebooks (from GitHub or via Colab) yourself for the estimation step.

### 1. The site (`src/`)

A static [Eleventy](https://www.11ty.dev/) build — plain HTML/CSS/JS, no backend, no
database. In the browser, it handles:

- uploading and exploring your dataset (CSV/Excel), entirely client-side
- building a study: choosing treatment/outcome, drawing the causal diagram, and (for
  panel data) declaring the entity/time/covariate structure
- **Check**: client-side identification — given your diagram, is there a valid
  statistical strategy (backdoor/frontdoor/instrumental-variable adjustment, or fixed
  effects) for estimating this effect, and which models are compatible?
- exporting a small **config JSON** describing the study, which is what you hand to the
  notebooks below to actually compute the result
- the ~90-article help glossary and tutorials

See [`ADMIN.md`](ADMIN.md) for how to build, preview, and deploy the site (it auto-deploys
to GitHub Pages on every push to `main` — see `.github/workflows/deploy.yml`).

```sh
npm install
npm run serve   # local dev server with live reload
npm run build   # compiles src/ to _site/, the deployable static output
```

### 2. The notebooks (`notebooks/`)

The site never computes a result itself — deliberately: the actual model fitting is real
Python statistics (via [DoWhy](https://www.pywhy.org/dowhy/), EconML, and statsmodels),
not a cut-down JavaScript reimplementation, and running it yourself (rather than
uploading your data to a server) is what lets the whole product avoid needing accounts
or file uploads at all. Once a study passes Check on the site, you download its config
JSON and run it through two notebooks:

| | |
|---|---|
| **01-identification-and-estimation.ipynb** | loads your config + data, re-derives everything independently (it doesn't just trust the site), fits the model, runs validation/refutation, writes `results.json` |
| **02-results.ipynb** | pure presentation — reads `results.json` and renders the full report (findings, plots, counterfactuals, validation, generalization, assumptions, diagram) |

Both open directly in Google Colab (no install) via the badges in
[`notebooks/README.md`](notebooks/README.md), which also covers running them locally and
the `causalwizard` package layout (`config.py`, `identification.py`, `estimation_cdpo.py`/
`estimation_pdfe.py`, `refutation.py`, `propensity.py`, `plotting.py`, and more — one
module per concern, no logic living in the notebook cells themselves).

```sh
cd notebooks
uv venv && source .venv/bin/activate   # or: python3 -m venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt     # or: pip install -r requirements.txt
jupyter notebook
```

A pytest suite for the `causalwizard` package lives in [`notebooks/tests/`](notebooks/tests/)
(README there too) — fast, synthetic-data unit tests covering every estimator variant,
separate from (and much quicker than) actually executing the notebooks end-to-end:

```sh
cd notebooks
uv pip install -r requirements.txt -r requirements-dev.txt
pytest
```

## Repo layout

```
src/                    the site - one .njk file per page, layout in src/_includes/
  articles/              help glossary + tutorials (one .html file per article)
  assets/js/studies/     study builder: causal diagram editor, Check/identification, config export
  data.njk, studies.njk  the Data and Studies list pages (data/, studies/ hold the "view one" pages)
notebooks/
  causalwizard/          the estimation/plotting package - see notebooks/README.md
  tests/                 pytest suite for causalwizard - see notebooks/tests/README.md
  *.ipynb                the two notebooks described above
eleventy.config.js       site build config
ADMIN.md                 build/deploy guide for the site
ROADMAP.md               migration history and architecture decisions - useful background
                         for *why* things are built the way they are, not just what's here
```

## Contributing / feedback

No sign-up, no fees, fully open source (BSD 2-Clause, see [`LICENSE`](LICENSE)) — issues
and PRs welcome. See [`/contact/`](https://causalwizard.app/contact/) on the site, or
open a GitHub issue here.
