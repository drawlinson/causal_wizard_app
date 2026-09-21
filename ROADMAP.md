# Causal Wizard — Migration Roadmap

Migrating the old Django + Postgres site (`../cw`) into `causal_wizard_app`: a
serverless, static, no-accounts site where the wizard produces a study config
JSON that users run against their own data in provided notebooks.

## Decisions locked in

- **Frontend**: Eleventy, used purely for build-time templating/layouts
  (shared header/nav/footer across static + article pages). No client-side
  framework, no hydration/virtual DOM. Output is plain HTML/CSS/JS.
  - Reason: the existing wizard/diagram JS does direct, imperative DOM/canvas
    manipulation via Cytoscape.js and Plotly.js. A framework that owns
    re-rendering around those containers is friction with no payoff here —
    there's no server state to sync once accounts are gone. Eleventy is the
    more minimal fit of the two since we only need includes/layouts, not a
    component/content-collection system.
- **CSS/vendored JS carried over as-is**: Bootstrap, jQuery, Cytoscape.js
  (+ edgehandles plugin), Plotly.js, driver.js (guided-tour help overlays),
  lodash, html2canvas/html2pdf/jspdf (export). Keeps current look/feel exactly.
- **Own app JS rewritten, not just copied**: `wizard.js`, `graph.js`,
  `dataset.js`, `result.js`, `builder.js`, `treatment.js`, `estimand.js`,
  `sample.js`, `search.js`, `tags.js` get cleaned up into readable ES modules
  as part of the port (per the "modern JS, non-minified, reverse-engineerable"
  requirement). Vendored third-party libs stay in their normal minified
  distributions — rewriting those isn't in scope unless you want otherwise.
- **Repo layout**: single repo, `causal_wizard_app`
  (github.com/drawlinson/causal_wizard_app). Notebooks live in
  `./notebooks` inside the same repo, not a separate one.
- **In-browser identification is in scope, not just heuristics**: DoWhy's
  identification step (backdoor/front-door/IV, via networkx d-separation +
  set enumeration) and the estimand→model compatibility table are both
  graph/rule logic with no numerical fitting — realistically portable to JS.
  Model *fitting* (regression, propensity-score methods, DoWhy estimation)
  stays Python-only, in the notebooks.
- **Browser storage**, sized for datasets up to ~500k rows:
  - Persist only the **raw uploaded file** (as a Blob) in **IndexedDB**,
    keyed by dataset id — cheap, and IndexedDB's storage quota is orders of
    magnitude above localStorage's ~5-10MB cap.
  - Parse with **PapaParse in a Web Worker**, streaming, so a 500k-row CSV
    doesn't freeze the UI thread.
  - Keep the *working* parsed dataset **in memory as columnar data**
    (typed arrays per column) rather than an array of row objects — much
    better memory/perf at this scale, and existing `dataset.js`/`sample.js`
    already do sampling for plots/stats, which we keep.
  - Small state (wizard progress, diagram JSON, study config, project
    builder answers) → a small IndexedDB store or localStorage; all tiny,
    no size concerns.
  - Re-parse from the stored Blob on reload rather than persisting parsed
    structures — keeps storage lean and avoids a second serialization format
    to maintain.
- **Articles**: one-time ETL, not an ongoing CMS. Spin up a throwaway local
  Postgres to load `backup_final.sql`, extract articles + categories +
  cross-page associations once into flat Markdown files (with frontmatter
  for title/category/slug/etc.) committed to the repo. From then on articles
  are hand-edited flat files built by Eleventy — no database, ever, going
  forward. (The DB-backed CMS was only there to make writing easier; flat
  files address that fine at this content volume.)
- **Client-side search**: implemented as a small hand-rolled matcher
  (`src/assets/js/search.js`) against a build-time-generated
  `assets/data/search-index.json`, not lunr.js/FlexSearch as originally
  floated — with 94 articles and 13 categories, a substring match over
  title/keywords (replicating the old server-side query exactly) is plenty,
  and avoids pulling in a search library for a dataset this small.
- **Hosting**: GitHub Pages with a custom domain. GitHub Pages supports a
  custom domain natively (`CNAME` file + DNS record to your domain), and
  once configured it automatically redirects the default
  `<user>.github.io/<repo>` URL to your custom domain — so this isn't really
  "two sites" to keep in sync, it's one deployment reachable at two URLs,
  with the `.github.io` one redirecting. We'll add a `rel=canonical` tag
  pointing at the custom domain too, as a belt-and-suspenders signal for
  search engines. Worth double-checking the exact redirect behavior against
  current GitHub docs when we actually configure DNS, since hosting-provider
  behavior can change.

## Open items still needing a decision

1. **CSV/Excel parsing libs**: proposing PapaParse (CSV) + SheetJS/xlsx
   (Excel) — both are the standard, widely-used choices. Confirm or override.

## Stage plan

Each stage should land as its own reviewable chunk, in this order.

**8.1 — Migrate static pages** ✅ done
Scaffolded Eleventy + Bootstrap assets in `causal_wizard_app` (`npm run
build` / `npm run serve`). Ported all 11 static pages (home, about,
features, reading, legal, contact, news, security, fees, ethics, tutorials)
from Django templates to Eleventy/Nunjucks. Nav rebuilt without any
login/signup/account items. `security.njk` and the "registration" bits of
`fees.njk`/`about.njk` rewritten to reflect the new no-upload, no-account
architecture (data never leaves the browser). Verified visually in Chrome —
renders correctly, no console errors.
*Known follow-up for 8.7*: `about.njk`'s FAQ still describes the old
workflow in a few places (a results/report page with a download button and
a "paid accounts" watermark) — that needs a real rewrite once the new
wizard → config-JSON → notebook flow exists, not a mechanical fix.

**8.2 — Migrate articles** ✅ done
One-time Python extraction (not committed — throwaway, per plan) parsed
`inference_article`/`inference_article_categories`/`inference_articlecategory`
directly out of the plain-text `backup_final.sql` COPY blocks (no Postgres
needed after all — pg_dump's plain-text format is just tab-separated rows).
94 articles → one HTML file each at `src/articles/{slug}.html`, YAML
frontmatter (title/summary/keywords/categorySlugs) + the article body
as-is — deliberately *not* a single JSON blob, so articles stay easy to
hand-edit (no escaping, one file per article) per the "no database, ever
again" decision above. 13 categories → `src/_data/categories.json` (small,
fixed taxonomy, fine as one file). Category pages and the A-Z/related-articles
lists are computed from an Eleventy collection (`collections.articles`), not
precomputed, so adding/removing a category on an article just means editing
that one file's frontmatter.
Content transforms applied during extraction: internal article/category
links (both relative `../../inference/article/x` and absolute
`causalwizard.app/inference/article/x` forms) → `/articles/x/` /
`/category/x/`; S3-hosted images (`causal-wizard-app.s3.amazonaws.com/...`)
→ local `/assets/images/...`; two already-broken image references in the
source content fixed (obvious typos: missing extension, stray HTML entity).
External links/images (Wikipedia, YouTube embeds, etc.) untouched.
Also caught and fixed, while link-checking the whole built site: 6
hardcoded (non-templated) article links in `news.njk` that stage 8.1 missed
converting, and a genuine `variable`/`variables` slug typo in `about.njk`
that was already a dead link on the original site.
*Known follow-up for 8.7*: article content still describes the old
Calculate-button/server-results workflow in places (most visibly the
tutorials) — same "mechanical migration now, content rewrite later" split
as the static pages.

**8.3 — Migrate dataset / XDA features** ✅ done
Rewritten from scratch against the old feature set, not ported — the old
server-side implementation was explicitly flagged as poor quality. New
architecture, all in `src/assets/js/datasets/`:
- **Storage**: `db.js`, IndexedDB. Each dataset record holds the raw file
  Blob plus a cached schema (column types/stats), so the list page doesn't
  need to re-parse just to show row/column counts.
- **Parsing**: `parse.js`. A fast peek (PapaParse `preview`/SheetJS
  `sheetRows`, ~200 rows) for instant feedback on upload, and a full
  background parse into columnar arrays for everything else - CSV via
  PapaParse's built-in worker mode (off the main thread), XLSX via SheetJS
  (blocks the main thread - no streaming API available, so the upload page
  warns that CSV is recommended for very large files).
- **Type sniffing**: `types.js`. Materially better than the old pandas-dtype
  heuristic: detects boolean-like strings (yes/no, y/n, true/false, 1/0),
  date strings, and splits categorical vs. free-text by cardinality ratio -
  plus flags constant and near-unique (ID-like) columns, neither of which
  the old site surfaced at all. User can override the detected type per
  column on the **Columns** tab.
- **Stats**: `stats.js`. Structural stats (row/missing/unique counts,
  min/max/mean/std) computed over the **full** dataset, not sampled - see
  the "full scan" decision below. Visualization uses a 1000-row sample
  (same as the old site), keeping the old site's trick of always including
  each numeric column's extrema so plots don't look artificially truncated.
  Pearson/Spearman correlation and group-by (for balance/covariate tables)
  are hand-rolled here, same approach the old client-side `sample.js` used.
- **Charts**: `charts.js`, Plotly - histogram, category bar, scatter+trend,
  contour, violin, heatmap, all-numeric correlation heatmap.

Pages: `/data/` (list, upload, rename, delete) and `/data/view/?id=` (one
dataset - Table/Columns/Univariate/Bivariate/Treatment Balance/Covariates/
Correlations tabs). Every analysis tab carries inline explanatory copy plus
a "learn more" link into the article library, opening in a new tab, per
your request that someone with no causal-inference background can use this
unassisted - turned out the old site's article library already covered
almost everything needed (`exploratory-analysis`, `positivity`,
`class-imbalance`, `covariate-balance`, `confounding`, `correlationcausality`,
`data-type`, `cardinality`, `control-and-treated`), so no new articles were
needed for this pass.

Beyond straight parity, four enhancements were added (all agreed before
building): a treatment-group balance check with a positivity warning below
5% group share; a pre-hoc covariate-balance table (mean/std or top-category
share per covariate, split by treatment group - the old site only showed
this *after* running an estimation, not during XDA); a consolidated
data-quality view (missing %, cardinality, constant/near-unique flags, all
columns at once); and an all-numeric-columns correlation heatmap (the old
site only did on-demand pairwise correlation).

**Sampling decision** (confirmed before building): type-sniffing peek on
upload ~200 rows; full-dataset scan (not sampled) for row/missing/unique
counts and confirmed dtypes, since these are cheap even at hundreds of
thousands of rows in a Worker and are exactly the numbers someone relies on
to judge whether a column is usable; 1000-row sample (with extrema always
included) for plots/visualization only, where exactness doesn't matter and
speed does.

Tested end-to-end in Chrome: upload → type inference → all 7 tabs → rename
→ delete, plus an 8000-row synthetic dataset to confirm the full-scan-vs-
1000-sample split actually holds at scale (missing/unique counts exact,
scatter plot capped at exactly 1000 points). Caught and fixed one real bug
in testing: `Number("")` evaluates to `0` in JS, not `NaN`, so missing
numeric values were silently becoming zeros in every stat/plot until
`parseNumeric()` was fixed to guard on empty strings explicitly.

*Known gaps, not done this pass*: no "replace file" on an existing dataset
(delete + re-upload covers it); outcome-over-time plot and outlier/
duplicate-row flags were proposed but not confirmed in scope, so deferred;
datetime columns are treated as categorical for bivariate plot-type
selection (no time-series-aware plotting yet).

**8.3 revision — treatment widget + review fixes** ✅ done
A round of hands-on testing turned up real design problems, not just
polish:
- **New `src/assets/js/treatment-widget.js`**: a standalone, reusable
  treated/control/excluded assignment component, deliberately factored out
  of the dataset page because the old site's wizard has its own version of
  this (`treatment.js`) and we want exactly one implementation shared by
  both. Numeric columns get optionally-half-open range editors per group
  (e.g. age &ge; 35 &rarr; treated) instead of one global threshold like
  the old site; categorical/boolean/text columns get a per-value
  Control/Treated/Exclude assignment with an "everything else" wildcard per
  group (same concept as the old site's tag UI). Smart defaults: a 2-valued
  boolean column auto-assigns truthy &rarr; treated; any 2-valued column
  auto-assigns by frequency. Replaces the old Treatment Balance tab, which
  was unusable for a numeric column (it rendered one table row per distinct
  numeric value).
- **Treatment Balance and Covariates merged into one "Treatment" tab** -
  they shared state (the treatment column) across two separate tabs before,
  which was confusing and, worse, meant the covariate table didn't actually
  reflect the Control/Treated split you'd defined (it grouped by raw
  column value, not by the assignment). Now the covariate table is driven
  directly by the widget's classifier function.
- **Covariate table**: added an SMD (standardized mean difference) column
  for numeric covariates, colour-flagged past 0.1/0.25 - the standard
  single-number imbalance signal, replacing the old vague "distribution"
  claim that didn't match what was actually shown. Numeric cells now show
  `mean ± SD` explicitly rather than a bare pair of numbers.
- **Column type overrides now persist.** They were being recomputed from
  scratch (and silently discarded) on every page load; `record.typeOverrides`
  is now saved to IndexedDB and reapplied after each fresh full-scan.
- **Correlations tab**: added the pairwise correlation table under the
  heatmap - same numbers, easier to read exact values off.
- **Table tab**: added a search box (substring match across all columns,
  treated as text even for numeric columns) and two-level sort (primary +
  secondary column, each with direction), replacing plain sequential
  browsing.

Caught one real bug while re-testing: `treatment-widget.js` imported
`./types.js` instead of `./datasets/types.js` (it lives one directory up
from the `datasets/` modules) - failed silently enough that the whole page
hung on "Loading dataset..." with no console error, since the browser's
module loader just refused the entire graph. Root-caused via
`read_network_requests` (a 503 on the wrong path), not the console.

**8.4 — Migrate wizard / causal diagram editor** ✅ done
Renamed "the wizard" to **Studies** throughout (nav already said Studies).
Both old methods in scope (CD+PO and PD+FE, by request — the old site
roughly doubles its validation matrix for this, same here). New code in
`src/assets/js/studies/`:

- **`db.js`**: `StudyStore`, IndexedDB. A study is `{datasetId, graph,
  question}`, matching the old `Study` model's shape. Storage is now
  unified: added `src/assets/js/db.js` as a single shared IndexedDB
  connection (single DB, single version, one `onupgradeneeded`) that both
  `datasets/db.js` and `studies/db.js` open — two independent
  `indexedDB.open()` calls against the same database name would have been
  a real version-conflict bug waiting to happen.
- **`graph.js`**: `StudyGraph`, a from-scratch Cytoscape wrapper (same
  vendored library as the old site) - modern class, no jQuery, no global
  DOM event bus, modal concerns left to the page controller. Node
  add/edit/delete, edge add/delete via the vendored edgehandles plugin,
  node-role CSS classes (treatment/outcome/backdoor-adjusted/IV/frontdoor/
  mediator/unobserved) ported directly from the old site's styling.
  Serializes to `{nodes, edges}` keyed by Cytoscape's own ids, plus a
  `toDagShape()` that re-keys by variable name (column name, or `u<n>`/
  `x<n>` for unobserved/user-defined) for the identification algorithms.
- **`dag.js`**: the one genuinely new piece of engineering in this stage -
  a from-scratch d-separation implementation (moralized-ancestral-graph
  algorithm) plus backdoor-set search (smallest valid set, increasing-size
  enumeration - a reasonable, well-justified choice, not claimed to be
  bit-for-bit DoWhy's own "minimize IV count" heuristic), best-effort
  frontdoor detection (Pearl's three conditions), and instrumental-variable
  detection. Unobserved variables fully participate in the graph structure
  but are excluded from candidate adjustment sets (can't condition on data
  you don't have). **Verified against 13 hand-written textbook cases**
  (classic confounding, collider (both a direct d-separation check and via
  the backdoor-set search), chain-blocking, the canonical frontdoor
  example, a valid-instrument example, cycle detection, directed-path
  detection) via a standalone Node test script before it touched any UI -
  all passing.
- **`causal-methods.js`**: ported `causal_methods.py`'s
  `get_compatible_models()` rule table (estimand type + outcome type/
  cardinality → compatible estimators + warnings) essentially 1:1.
- **`identify.js`**: orchestrates `dag.js` into the estimand list shape
  (backdoor/frontdoor/IV, each with its compatible models attached).
- **`validate.js`** + **`issue-messages.js`**: the "Check" pipeline,
  ordered per the old site's `identification.py` `validate()` - outcome
  usability → treatment-group sizes/balance → covariate cardinality →
  method-specific identification (CD+PO graph identification, or PDFE
  panel-structure checks: entity/time present, each entity×time
  combination unique). Message vocabulary is conceptually the old ~25-key
  set, adapted to this site's actual data model rather than force-fitted
  to the old single-threshold/tag fields.
- **`config-export.js`**: builds the downloadable JSON (schema version,
  study name, dataset filename + expected column names/types, graph,
  question, chosen identification/model) and triggers the browser download.

**The treatment-group UI is the same `treatment-widget.js` built for stage
8.3**, exactly as asked - one shared component, no duplicate logic between
the dataset page and the wizard. The old "Define Intervention" naming is
gone; both pages now just say "Treatment groups." A **new "design" concept**
was added that the old naming didn't cleanly separate: for a numeric
treatment, you now explicitly choose between splitting into Control/Treated
groups (the widget) or using the value continuously (e.g. "effect per extra
year of age") - shown only when it's actually a live choice (numeric
treatment, CD+PO method). The embedded dataset "Data" tab from the old
wizard is gone, replaced by an "Explore dataset ↗" link to the XDA page in
a new tab, per your request.

**The Colab handoff finding** (see the chat - not repeated in full here):
a fully automatic data+config handoff into a live Colab runtime isn't
achievable without either the user manually uploading in-session or the
data leaving the browser via some hosted intermediary, which would break
the core "your data never leaves your device" promise. Shipped instead:
one-click "Open in Colab" (deep-links straight to the identification
notebook), a config JSON download, and copy-paste-ready instructions.
*The Colab/notebooks-repo links are wired up now to the path stage 8.6
will commit to* (`notebooks/01-identification-and-estimation.ipynb` in
this same repo) *but won't resolve until that stage actually creates it.*

**Tested end-to-end in Chrome**: study creation → treatment/outcome
selection (with a placeholder-option fix so neither dropdown silently
looked pre-selected) → treatment widget (categorical smart-default and
numeric range editor, including the grey full-distribution histogram from
the 8.3 revision) → diagram nodes (add/edit, including the "unused
variables only" picker and type restrictions) → diagram edges (drag-to-
connect via the vendored edgehandles plugin didn't work under browser
automation - verified the underlying wiring correctly instead, by
injecting edges into a saved study and confirming they deserialize,
render with correct arrows, and drive Check correctly) → Check for both
CD+PO (found the right backdoor set on a classic confounding structure,
correct node re-coloring) and PDFE (valid and invalid/duplicate-entity-
time cases) → config download. Two real bugs caught in this pass:
- `causal-methods.js` had its GLM-compatibility condition order wrong,
  so GLM was silently excluded for *numeric* outcomes (the one case it's
  unconditionally valid for) whenever outcome cardinality was `null` -
  numeric outcomes don't have a "cardinality," so this hit every numeric
  outcome. Caught by the Node integration test before it ever reached
  the browser.
- `cytoscape-edgehandles.js`'s UMD wrapper falls back to
  `root["_"]["memoize"]` (global lodash) when no other module system is
  detected - silently uninstalled the plugin since lodash wasn't vendored
  on this page. Fixed by vendoring `lodash.min.js` and loading it before
  the plugin. (Also hit Eleventy dev-server live-reload doing a DOM-patch-
  without-reload after a rebuild, which left stale pre-fix JS running -
  not a real bug, just a reminder that a hard reload is sometimes needed
  when chasing a script-loading issue in dev mode.)
- Also re-confirmed the stage-8.3-revision pattern (a widget's
  smart-default spec must be explicitly captured via `getSpec()` after the
  first render, since `onChange` only fires on user interaction) - missed
  it again in the new treatment-groups integration on this page
  specifically, same fix applied.

*Known gaps, not done this pass*: no UI yet for the "advanced" question
fields (effect type / target unit / train-test-split percentage) - they're
in the config schema with sensible defaults, just not exposed as controls;
node dragging/repositioning and the diagram's zoom in/out/legend/clear
buttons were wired but not exhaustively re-verified after the edgehandles
fix; frontdoor/IV detection is best-effort (documented in `dag.js`) rather
than exhaustively validated against DoWhy's own edge cases - the notebook
re-identifies everything independently regardless, per the original
in-browser-identification decision.

**8.5 — Remove user account features**
Strip login/signup/auth. Port the project builder (`builder.js`) to browser
storage, reusing its existing share-code (`prid`) pattern for
export/import instead of a server lookup.
*Deliverable*: no auth surface anywhere; project builder answers persist in
the browser and can be exported/imported as a file.

**8.6 — Make notebooks**
Refactor the `cw/inference` Python package (`causal_methods.py`,
`causal_task.py`, `counterfactuals.py`, `cw_regression_estimator.py`,
`estimation.py`, `features.py`, `fixed_effects.py`, `identification.py`,
`propensity.py`) into a clean, facade-based package under
`causal_wizard_app/notebooks`, on current pandas/numpy/DoWhy/statsmodels.
Two notebooks: (1) identification & estimation — full validation of config
+ data even though partially pre-checked client-side; (2) results analysis,
keeping all current plots. README with an Open-in-Colab badge; notebooks
take config-file-location and data-file-location variables.
*Deliverable*: a user takes the downloaded config JSON + their data file,
runs notebook 1 then notebook 2 (locally or in Colab), gets the same
analyses as today.

**8.7 — Update site content**
Rewrite help articles, tutorials, and security/privacy copy to describe the
new workflow (site → config JSON → notebooks) and its implications for data
handling.
*Deliverable*: content accurately reflects the new architecture everywhere.

## Notes for later stages

- **Drop the PDF watermarking.** The old `result.js` (`onResultNotAvailable()`,
  line ~73) toggles a `.watermark` CSS class (`project.css`, tiled
  `watermark.png` background) on the PDF-export container, removed only for
  paid accounts (see `Result.methodPDFE` / the html2canvas+html2pdf+jspdf
  export pipeline in `result.js`). There are no paid accounts anymore, so
  when this export functionality gets ported (if it's even still needed —
  results now live in notebooks, not the browser) don't carry the
  watermarking logic over at all. `watermark.png` has already been removed
  from `src/assets/images` — if the export pipeline gets ported, don't
  re-add it.

## Risks / things to watch

- `driver.js`-based guided help / contextual error messages need to be
  rebuilt against the new client-side wizard state machine.
- The SSG must never re-render the diagram container after initial load —
  only hand-written app JS touches Cytoscape's DOM.
