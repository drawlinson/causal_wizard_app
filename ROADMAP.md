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

**8.3 revision 2 — small dataset-page usability fixes** ✅ done
Three small fixes from later hands-on testing:
- Renamed the "Treatment" tab to **"Covariate balance"** - the tab's own
  content already used that name for its second half (the balance table),
  and it better describes what the tab is actually for on this page (the
  assignment widget here is just the input to the balance comparison, not
  an end in itself - that's the study page's job).
- **Bivariate tab**: linked "Pearson correlation" and "Spearman
  correlation" to their Wikipedia articles, matching the old site (`cw/
  static/js/dataset.js`'s `getJointStatistics()` rendering) which linked
  both terms next to their computed values.
- **Columns tab's "near-unique (ID-like)" flag no longer fires for
  numeric columns.** It was true-but-useless there: any continuous
  numeric measurement (age, income, a GPS coordinate) is naturally almost
  all-unique, so the flag fired on essentially every numeric column,
  numeric ID or not - it's only actually informative for categorical/text
  columns, where near-uniqueness really does suggest an identifier.
  `sniffType()` in `datasets/types.js` now gates `isNearUnique` on `type
  !== "numeric"`. This is the only other column-quality flag besides
  `isConstant` ("constant" badge) - there isn't a broader flag system to
  extend here, just these two.

Verified: a from-scratch Node check of `sniffType()` against a 100-row
numeric ID column, a 100-row numeric measurement column, and a 100-row
text ID column confirms only the text column still gets `isNearUnique:
true`. Confirmed in-browser: tab renamed, Bivariate stats line renders
both correlation coefficients as working Wikipedia links, no console
errors. Production build and the internal-link checker both pass clean
(same pre-existing `/project/*` placeholders, unrelated to this page).

**8.3 revision 3 — covariate-balance crash on all-null groups** ✅ done
User-reported bug: uploading a large file with heavy nulls, CJK values,
and many columns threw `TypeError: Cannot read properties of null
(reading 'toFixed')` from `renderCovariatesTable()`, both on load and
when toggling "Everything not listed is Control" in the assignment
widget. Root cause: `groupBy()` (`datasets/stats.js`) can return a group
that exists (some rows fall into it) but has `mean`/`std`/`topValue: null`
when every value of *that particular covariate* happens to be missing
for every row in that group - plausible on any wide, null-heavy file.
`renderCovariatesTable()` only checked that the group object itself was
truthy, not that its stats were non-null, so it called `.toFixed()` on
`null`.

This one crash had a second, seemingly unrelated symptom: the
Correlations tab's plot never appeared. `render()` calls each tab's
render function synchronously and unguarded, in order, with
`renderTreatmentTab()` before `renderCorrelationsTab()` - the uncaught
exception above aborted `render()` entirely, so `renderCorrelationsTab()`
never got a chance to run. Fixed both: `renderCovariatesTable()` now
checks `stat?.mean != null` / `stat?.topValue != null` before formatting,
and `render()` now runs each tab's render step in a try/catch loop so one
tab's bug can't silently take the rest of the page down with it.

Verified with a synthetic 300-row, 17-column CSV built specifically to
reproduce this (heavy random nulls throughout, CJK category values, and
one covariate forced to be entirely null within one treatment group):
loads without error, the Covariate balance tab renders all rows
(including the null-group covariate, shown as "-"), toggling "Everything
not listed is Control" no longer throws, and the Correlations tab renders
its plot and table. No console errors. Production build and the
internal-link checker both pass clean (same pre-existing `/project/*`
placeholders, unrelated to this page).

**8.3 revision 4 — explain what the treatment widget's catch-all checkboxes do** ✅ done
User asked what "Everything not listed below is Control/Treated" actually
means and whether the table shows all the data. Answer: each value's
explicit Control/Treated/Exclude button always wins; the checkbox only
sets the default for values that don't have an explicit pick (excluded,
if neither is checked); the two checkboxes are mutually exclusive
(checking one clears the other); and the table only lists the top 50
most frequent distinct values - anything beyond that never gets a row and
is governed entirely by the checkbox default. Added this as explanatory
copy directly in `treatment-widget.js`'s categorical editor, above and
around the checkboxes.

While verifying the truncation warning, found it could never actually
fire: both callers (`data-view.js`, `study-view.js`) passed `limit: 50`
into `categoryCounts()`, so the widget always received an already-capped
list and its own `valueCounts.length > 50` check was never true,
regardless of the column's real cardinality - the "showing top 50 of N"
warning was dead code. `categoryCounts()` is now uncapped by default
(only used by these two callers), and both now call it uncapped, letting
the widget's own cap and truncation check do their job correctly.

Verified in-browser: a low-cardinality column (4 values) shows no
truncation warning and the new explanatory text reads cleanly; a
synthetic 80-value column correctly triggers "Showing the 50 most common
values of 80 - the other 30 aren't listed below individually..." No
console errors. Production build and the internal-link checker both pass
clean (same pre-existing `/project/*` placeholders, unrelated to this
page).

**8.3 revision 5 — correlation heatmap axes broken by numeric-looking column names** ✅ done
User-reported: on a 13,199-row/39-column file, the Correlations tab's
heatmap showed numeric axes running up to over 1,000,000 instead of a
39x39 grid of column names. Root cause: Plotly's `heatmap` trace
auto-detects axis type from the tick values it's given, and switches from
"category" to "linear" (numeric) if every value parses as a number - which
column *names* can easily do (e.g. numeric IDs, years, or column indices
as headers). Once that happens, tiles are positioned at their literal
numeric value instead of one evenly-spaced tile per column, producing a
huge, mostly-empty numeric axis with only a few visible cells crammed
together - exactly the reported symptom.

This is a general Plotly gotcha, not unique to the correlation heatmap -
any chart passing category-like values as x/y without forcing the axis
type is vulnerable the same way if those values happen to look numeric
(a numeric-coded categorical column, for instance). Added an explicit
`type: "category"` to every chart in `datasets/charts.js` that plots
discrete categories on an axis: `plotCorrelationHeatmap` (both axes -
the one actually reported), `plotHeatmap` (bivariate categorical x
categorical, both axes), `plotCategoryBar` (univariate category counts),
and `plotViolin` (categorical x-axis).

Verified the mechanism directly in the browser first (a 4x4 heatmap with
numeric-string column names reproduced the bug exactly - axis type
"linear", range `[1000.5, 1004.5]`; adding `type: "category"` fixed it to
range `[-0.5, 3.5]`), then end-to-end with a synthetic 200-row/10-column
CSV whose headers are `1000000`-`1000009`: the Correlations tab now
renders a clean 10x10 grid with `xaxis.type: "category"` and range
`[-0.5, 9.5]`, correct column-name tick labels, no numeric blow-up.
Re-verified a normal (non-numeric-header) dataset's Correlations and
Univariate tabs still render correctly (no regression). No console
errors. Production build and the internal-link checker both pass clean
(same pre-existing `/project/*` placeholders, unrelated to this page).

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

**8.4 revision — variable-type model, treatment widget UX, legend, Check modal** ✅ done
A detailed round of hands-on feedback on the Studies/wizard page, covering
eight points:
- **One consistent "effective type" model.** Previously the study page
  recomputed each column's type by sniffing raw data only, ignoring the
  dataset page's Columns-tab type overrides entirely - a numeric-looking
  column a user had already told the dataset page was categorical (e.g.
  `toy_panel.csv`'s `purchase`) silently reverted to numeric here. Added
  `effectiveVariableType()`/`setVariableType()` in `study-view.js` as the
  single resolution/mutation path: study-level `question.variableTypes`
  override &rarr; dataset-level `typeOverrides` &rarr; sniffed default. All
  three places a type can be set - the diagram node-edit modal, and new
  small type `<select>` elements below the treatment/outcome pickers -
  now read and write through this one path, so they always agree.
  `validate.js` takes a `resolveType` callback instead of reading dataset
  schema types directly, for the same reason.
- **Treatment-groups widget is now collapsible**, behind a "Treatment
  groups" button below the treatment type select (Bootstrap `collapse`),
  auto-expanding when the treatment variable changes. It was previously
  always open and pushed the causal diagram - the actual point of this
  page - below the fold.
- **Outcome type selector** added, mirroring the treatment one, resolved
  through the same effective-type model.
- **Check button moved inline** with the "Causal diagram" heading instead
  of sitting below it; dropped the redundant `<hr>` under the diagram
  (it already has its own card outline).
- **Legend restored to the original image** (`graph-legend.png`, copied
  back from the old site - it had been deleted during 8.1's unreferenced-
  image cleanup, which didn't yet know the wizard would need it) and now
  shown by default rather than behind a toggle. The CSS-badge legend it
  replaced was missing the numeric/categorical iconography and the
  mediator/collider fill+outline conventions.
- **Treatment/outcome selects are now colour-coded** to match their node
  colour in the diagram (inline `background-color`, cleared when unset).
- **Check modal restructured**: the "Next: run the analysis" content
  (model picker, config download, numbered how-to-run-the-notebook steps)
  used to live in a separate page section below the diagram, visible only
  after a successful Check and easy to miss. It's now built directly into
  the Check-result modal, which is 85vw wide. The steps use numbered
  badges instead of a plain `<ol>`; step 2 links to the dataset's XDA page
  (opens in a new tab) instead of just naming it.
- **Bug fix**: changing the treatment or outcome selector recoloured the
  node in the diagram only on the *next* topology change (e.g. drawing an
  edge), not immediately - both `change` handlers were missing a direct
  call to `updateGraphClasses()`, relying on a call further down that
  only fired for other reasons. Fixed by calling it explicitly in both
  handlers.

Two more bugs turned up during this pass, unrelated to the 8 feedback
points but caught while re-testing the whole page end-to-end:
- **Mediator/collider highlighting was never wired up at all** - the CSS
  classes existed but nothing computed or passed `mediatorVariables`/
  `colliderVariables` to the graph. Added `findMediators`/`findColliders`
  to `dag.js` and a `deriveStructuralRoles()` in `study-view.js` that
  runs off pure graph structure (independent of a successful Check,
  unlike backdoor/frontdoor/IV roles).
- **A blank CSV header column** (e.g. `toy_panel.csv`'s
  `,mkt_costs,purchase,city` - a pandas row-index export artifact)
  produced a column named `""`, indistinguishable from "nothing selected"
  in every `<select>` that lists dataset columns - it silently became the
  default/first option, so an unrelated "add unobserved node" action
  could save with the wrong `src`. Fixed at the source in
  `datasets/parse.js` (`sanitizeFieldNames()`/`remapRows()`): a blank
  header becomes `column_N`, applied consistently across the peek and
  full-parse paths for both CSV and XLSX.

Verified via a from-scratch scenario built on `toy_panel.csv`: type
override respected as the study-page default; treatment-groups widget
auto-expands/collapses; outcome type selector resolves correctly; Check
button inline with the diagram heading, no stray `<hr>`; full legend
image shown by default; treatment/outcome selects colour-matched to their
diagram nodes; treatment node recolours immediately on selection, no edge
draw required; a 5-node/7-edge graph (`city &rarr; purchase &rarr;
mkt_costs`, with an unobserved mediator on the purchase&rarr;mkt_costs
path and an unobserved collider fed by both) correctly highlighted the
mediator (grey fill, dark red border) and collider (dark red border) per
the restored legend; Check modal at 85vw with numbered steps and a
working dataset link. No console errors. Production build and the
internal-link checker both pass clean (the only findings are the
pre-existing `/project/*` nav placeholders, out of scope until 8.7).

*Skipped by request*: 8.5 (below) - the greenfield site never grew user
account features, so there's nothing to remove.

**8.4 revision 2 — panel-data mode, type-select constraints, advanced options** ✅ done
A second round of hands-on testing on the Studies page, all on the panel-
data (`pd+fe`) side plus a couple of loose ends from the first revision:
- **Panel data now hides the causal diagram** (no graph needed for a fixed-
  effects design) but keeps the Check button visible and working - the
  diagram's paragraph/toolbar/legend/canvas moved into a new
  `#sv-diagram-section` wrapper that `updateMethodVisibility()` hides for
  `pd+fe`, while the "Causal diagram" heading + Check button (now outside
  that wrapper) stay put so panel-data studies can still be Checked.
  Switching back to Causal Diagram & Potential Outcomes shows it again.
- **Outcome type selector was stuck on one option.** `allowedTypesFor()`
  was reading the *resolved* schema type (post dataset-override) to decide
  whether "numerical" is even a valid choice, instead of the underlying
  raw sniff - so a numeric column already overridden to categorical at the
  dataset level (e.g. `toy_panel.csv`'s `purchase`) couldn't be switched
  back to numerical from the study page, even though the option is
  perfectly valid. `state.schema.columns` now keeps `rawType` (the
  pre-override sniff) alongside the resolved `type`, and
  `allowedTypesFor()` checks that instead.
- **"How should the treatment be used?" now collapses with the treatment-
  groups widget** instead of staying visible on its own - moved
  `#sv-design-row` inside `#sv-treatment-collapse`, alongside the widget,
  so both show/hide together off the "Treatment groups" toggle.
- **Check-modal numbered steps were top-aligned** against text of a
  different line-height, producing a visible offset between each badge
  and its text; switched `align-items-start` to `align-items-center` on
  all four step rows.
- **Added the missing "Advanced options"** card below the diagram/panel
  section (always visible, not collapsed per request): a "Desired effect"
  select (ATE/ATT/ATC, noting panel data always uses ATT regardless) and
  a "Held-out test set (%)" number input, both wired straight to the
  existing `question.effect`/`question.splitTestPc` fields (present in the
  config schema since stage 8.4 but never exposed as controls until now).
- **Blank placeholder instead of "-- choose --"** on every select that can
  be unset (treatment, outcome, panel entity, panel time) -
  `populateSelect()`'s `placeholder` option now takes a boolean and always
  renders `<option value=""></option>` with no text, rather than a string
  that doubled as both "should there be a blank option" and "what should
  it say."
- **Added a "Clear" button next to the panel covariates multi-select.**
  Native `<select multiple>` only deselects one option at a time via ctrl/
  cmd-click, with no built-in way to clear everything - not a bug in our
  code, but not discoverable either, so this makes "no covariates" a
  one-click action instead of a multi-step one.

Verified all of the above in-browser on the same `toy_panel.csv`-backed
study used for the first revision: switching method hides/restores the
diagram and keeps Check working either way; the treatment-groups toggle
and "how should the treatment be used" radio show/hide together; a full
panel-data Check (entity=city, time=purchase, treatment=purchase grouped,
outcome=mkt_costs) succeeds with a correctly-aligned modal; Advanced
options persist `effect`/`splitTestPc` to the study record; a from-scratch
study shows blank selects everywhere nothing is chosen; the covariates
Clear button empties both the DOM selection and the persisted state. No
console errors on any of the above. Production build and the internal-
link checker both pass clean (same pre-existing `/project/*` placeholders
as before, unrelated to this page).

**8.4 revision 3 — treatment histogram binning, panel-data polish** ✅ done
A third, smaller round of fixes:
- **Treatment-widget numeric histogram used misleading bin edges.** Plotly
  auto-bins each histogram trace (Excluded/Control/Treated) independently
  by default, so e.g. a "< 7" Control cutoff could visually show bars
  reaching up to 7.9 - not because any control-classified value was that
  high, but because that trace's own auto-binning rounded its bin edges up
  on its own subset of the data. `treatment-widget.js` now computes one
  shared bin grid (`sharedBins()`, a "nice round number" step size sized
  off the full column) from the combined data and applies the same
  `xbins`/`autobinx: false` to all three traces, so the bars stop exactly
  where the threshold says they should.
- Removed a stray `<hr>` above "Panel data structure" - the section
  already reads clearly without it.
- **"Treatment groups" toggle is now `btn-primary`** (was
  `btn-outline-secondary`) to match the Check button's visual weight,
  since picking treatment groups is as core to the flow as Checking.
- **The "Causal diagram" heading now reads "Study design"** when the
  method is panel data (no diagram shown) - the Check button next to it
  still validates/identifies the study either way, so the heading
  shouldn't imply a diagram is involved. Reverts back to "Causal diagram"
  for CD+PO.

Verified in-browser using `toy_panel.csv`'s `purchase` column (values
5-15) with a Control "< 7" / Treated ">= 7" split: Control's actual max
value is 6.5, and previously Plotly's independent auto-binning stretched
the last Control bar out to ~7.9; with shared bins (start 5, end 15, size
0.5 for this data) the last Control bar now ends exactly at 7. Also
confirmed the toggle button's new styling, the removed `<hr>`, and the
"Study design"/"Causal diagram" heading swap when toggling method. No
console errors. Production build and the internal-link checker both pass
clean (same pre-existing `/project/*` placeholders, unrelated to this
page).

**8.4 revision 4 — threshold-exact binning, optional panel columns, redundant design radio removed** ✅ done
A fourth round, following up on gaps the shared bin grid from revision 3
didn't fully close:
- **The shared "nice round number" bin grid still wasn't enough** - even a
  uniform grid can have a bin that straddles a group's own cutoff (e.g. a
  bin covering [6.5, 7.2) with a "< 7"/">= 7" split), which visually reads
  as Control and Treated overlapping in the same bar even though no value
  is actually double-counted. `treatment-widget.js`'s
  `sharedBins()`/`xbins` approach is replaced with `thresholdAwareBins()` +
  `binCounts()`: bin edges are now built to always land exactly on every
  finite Control/Treated threshold, with "nice enough" sub-bins filling
  the space between thresholds (rendered as a manually-computed `bar`
  trace, since Plotly's `histogram` type can't do non-uniform bins).
  Confirmed via `toy_panel.csv`'s `purchase` column at both a contiguous
  "< 7"/">= 7" split and a gapped "< 5"/">= 8" split: edges land exactly
  on 7, and on both 5 and 8, in each case. This is the same module the
  dataset page's Treatment tab already uses (`data-view.js` and
  `study-view.js` both call `renderTreatmentWidget()` from
  `treatment-widget.js`), so the fix applies to both without duplicating
  anything - verified directly on the dataset page too.
- **Panel data's Entity and Time columns are now optional.** Leaving both
  unset just means an ordinary regression with no fixed effects, which
  the notebook (stage 8.6) handles directly - `validate.js`'s
  `runPanelDataCheck()` only runs the entity/time duplicate-row check when
  both are actually chosen, instead of hard-requiring both up front. The
  now-unreachable `method_pdfe_no_time_series` issue key was removed, and
  `time_non_unique`'s message was reworded now that it only fires in the
  both-present case.
- **Fixed the treatment-widget's numeric-vs-categorical choice to follow
  the effective type selector**, not the raw dataset type -
  `renderTreatmentGroupWidget()` now derives `columnType` from
  `effectiveVariableType(q.treatment)` (as the "8.4 revision 2" fix above
  already did for the outcome type selector's *options*, but not yet for
  this widget's editor kind). Fixes the "select the type, widget doesn't
  follow" issue flagged as a known gap at the end of the last revision.
- **Removed the "How should the treatment be used?" grouped/continuous
  radio** as redundant, per request, now that the type selector alone
  drives the widget: `treatmentDesign` is gone from the question schema,
  `validate.js`'s Check always runs the treatment-group-size checks (no
  more "continuous, skip groups" branch), and `#sv-design-row` is gone
  from `view.njk`. This also fixed a real bug the removal surfaced during
  testing: switching the treatment type selector to Categorical made the
  entire treatment-groups toggle and widget disappear, because the
  toggle's visibility was keyed off the (now-stale) `treatmentDesign`
  field rather than just "is a treatment selected" - confirmed fixed by
  toggling Numerical &harr; Categorical repeatedly and checking the
  toggle/widget survive both directions.

Verified in-browser: threshold-exact bin edges on both a contiguous and a
gapped Control/Treated split, on both pages that use the widget; a
from-scratch panel-data Check succeeds with Entity and Time both left
blank, and again with only Entity set; toggling the treatment type
selector between Numerical and Categorical correctly swaps the widget's
editor and keeps the toggle button visible throughout; `#sv-design-row`
and every `treatmentDesign` reference confirmed gone via grep. No console
errors on either page. Production build and the internal-link checker
both pass clean (same pre-existing `/project/*` placeholders, unrelated
to this page).

**8.4 revision 5 — grouped/continuous choice restored, correctly scoped this time** ✅ done
Revision 4 removed the grouped/continuous radio as redundant, reasoning
that the type selector (Numerical/Categorical) already captured the
distinction. That reasoning was wrong: a *numerical* treatment still has
two legitimate readings - thresholded into Control/Treated groups, or
passed through as a continuous value - and only the type selector
(categorical vs numerical) was actually redundant with anything. The
decision is a 2-stage tree: categorical treatments are always grouped (no
choice to offer); numerical treatments choose grouped-vs-continuous, and
that choice affects the applicable estimation methods, so it belongs to
the study, not the dataset.

This time the choice lives *inside* the shared `treatment-widget.js`
component instead of as a page-level row in `view.njk`, gated behind a
new `allowContinuous` option on `renderTreatmentWidget()`:
- `defaultSpecFor()`'s numeric spec now carries `design: "grouped" |
  "continuous"`, alongside `control`/`treated` - living inside the spec
  (rather than a separate top-level `question.treatmentDesign`, which is
  what caused revision 4's "widget disappears" bug: a field independent
  of the spec/type that didn't reset when either changed) means it
  naturally resets to a fresh default whenever the treatment or its type
  changes, since `treatmentSpec` itself gets nulled out in both cases.
- `study-view.js` passes `allowContinuous: true` (only numerical
  treatments even reach `renderNumericEditor()`, so this radio is never
  offered for a categorical one). `data-view.js` (the dataset page's
  Treatment/balance tab) doesn't pass it, so that page is unaffected and
  always gets the grouped editor - a continuous treatment doesn't have
  a Control/Treated split to compute SMD/balance against, so that page
  was never a candidate for this choice.
- When `design === "continuous"`, `renderNumericEditor()` replaces the
  range inputs, histogram, and summary table with a plain "Continuous
  treatment." line - the radio itself stays visible so it's a one-click
  switch back. `drawNumericPreview()` is skipped in this case (there's no
  `#tw-numeric-plot` element to draw into).
- `validate.js`'s `runCheck()` skips the Control/Treated group-size checks
  entirely when `treatmentSpec.kind === "numeric" && treatmentSpec.design
  === "continuous"` - restoring the "continuous, skip groups" behavior
  revision 4 removed, but reading the flag from inside `treatmentSpec`
  instead of a separate schema field.

Verified in-browser: the radio appears for a numerical treatment (both
options selectable, defaults to grouped) and is absent for a categorical
one; switching to continuous replaces the editor with the placeholder
text and persists `treatmentSpec.design: "continuous"`; Check succeeds
with a continuous treatment and no group thresholds defined; switching
back to grouped restores the full editor; the dataset page's Treatment
tab confirmed to never show the radio, on the same `purchase` column
used on the study page. No console errors on either page. Production
build and the internal-link checker both pass clean (same pre-existing
`/project/*` placeholders, unrelated to this page).

**8.4 revision 6 — Check button moved up to the page header** ✅ done
The Check button lived next to the "Causal diagram"/"Study design"
heading, far enough below the fold on a typical viewport that it was easy
to miss for a page whose entire point is that button. Moved it into the
header row in `view.njk`, between the study name and the "Explore
dataset" link (`<h2>` &rarr; Check &rarr; status &rarr; `ms-auto` &rarr;
Explore dataset), so it's visible without scrolling. The diagram/study-
design heading is now a plain `<h5>` with no button attached. No JS
changes needed - `study-view.js` only ever looked these elements up by
id, so the same `#sv-check-button` element just moved in the DOM.

Verified in-browser: exactly one `#sv-check-button` on the page (no
duplicate left behind), Check still runs and opens the results modal from
its new position, and the heading still swaps between "Causal diagram"
and "Study design" correctly when the method changes. No console errors.
Production build and the internal-link checker both pass clean (same
pre-existing `/project/*` placeholders, unrelated to this page).

**8.4 revision 7 — restored contextual help links** ✅ done
The old site's wizard had contextual "learn more" links scattered through
the form that never made it into the port. Added them back:
- A small "help" link to `/articles/study-design-method/` after the
  Method select's existing explanation text.
- A small "help" link to `/articles/treatment/` next to the Treatment
  label.
- A "See Control and treated groups for background" line linking to
  `/articles/control-and-treated/`, placed as static markup in `view.njk`
  above `#sv-treatment-widget` (not inside the widget's own re-rendered
  HTML), so it survives every re-render regardless of whether the widget
  is currently showing the grouped editor, the categorical editor, or the
  "Continuous treatment." placeholder - all three replace the widget's
  own innerHTML on every change, so anything inside it would have
  disappeared under "Continuous treatment."
- "Help me choose" next to the Model select in the Check-results modal,
  linking to `/articles/model-selection/`.
- "more" links to `/articles/validation/` after both Advanced options
  explanations (Desired effect and Held-out test set).

All five target slugs (`study-design-method`, `treatment`,
`control-and-treated`, `model-selection`, `validation`) confirmed to
exist under `src/articles/` before wiring anything up. Verified in-
browser: the Control-and-treated link stays visible after switching the
treatment-groups widget to "Continuous treatment," and "Help me choose"
renders next to the model select in a successful Check's modal. No
console errors. Production build and the internal-link checker both pass
clean (same pre-existing `/project/*` placeholders, unrelated to this
page).

**8.4 revision 8 — help-link corrections** ✅ done
Two follow-up tweaks from the previous revision:
- The "Desired effect" advanced-option's help link pointed at
  `/articles/validation/` (copy-pasted from the test-set link next to it)
  - should be `/articles/causal-effect/`, which is actually about ATE/
    ATT/ATC. Fixed.
- Moved the Control-and-treated link into the treatment widget itself:
  it's now "More info" (was "See Control and treated groups for
  background"), on the same line as and right after the "Use as a
  continuous value" radio option, inside `numericDesignRadioHtml()` in
  `treatment-widget.js`, rather than static markup in `view.njk` above
  the widget. Still survives switching to "Continuous treatment" (the
  radio row itself doesn't disappear, only the grouped-editor controls
  below it do) - only now it's scoped to numeric treatments specifically
  (where that radio exists at all) rather than showing unconditionally
  for every treatment type.

Verified in-browser: "More info" sits inline after the continuous-value
label and survives toggling to "Continuous treatment"; the Desired
effect help link now points at `/articles/causal-effect/`. No console
errors. Production build and the internal-link checker both pass clean
(same pre-existing `/project/*` placeholders, unrelated to this page).

**8.5 — Remove user account features** (auth-removal half skipped - not
applicable, see above; project-builder-port half done, see "8.5 revision"
below) ✅ done
Strip login/signup/auth. Port the project builder (`builder.js`) to browser
storage, reusing its existing share-code (`prid`) pattern for
export/import instead of a server lookup.
*Deliverable*: no auth surface anywhere; project builder answers persist in
the browser and can be exported/imported as a file.

**8.5 revision — migrate the AI/ML Project Designer, redesigned as a wizard** ✅ done
The old site's `/project/` app (a separate "brainstorm your AI/ML project
before you touch data" tool - not part of the causal-inference wizard) was
originally scoped as a straight port under 8.5 ("no auth surface"), but the
user asked for a redesign at the same time: the old UI put all 30 questions
on screen at once (7 Bootstrap tabs), each behind an identical "Read more"
collapse box regardless of whether it had real content - "too static...
empty boxes and large Read more boxes." Requested instead: a wizard with
Next/Prev and "chapter skip" between the 7 sections, and a single-page
read-only summary at the end for download.

**Content recovery.** The old site's `Project`/`ProjectQuestion` Django
models hold no relational answer rows - `ProjectQuestion` (section,
sequence, objective, prompt, more_info - DB-seeded via TinyMCE) is the
actual question bank, and `Project.answers` is a flat JSON dict keyed by
`"<section>_<sequence>"` (e.g. `"1_1"`). The SQL dump (`backup_final.sql`,
sibling to both `cw/` and this repo) has full schema for both tables but
no `COPY` data block for either - a deliberate exclusion that swept up the
question bank along with the (actually sensitive) per-user answers. All 32
question prompts, "Additional context & tips" bodies, section titles/
intros, and embedded links were instead recovered verbatim from the live
site (`causalwizard.app/project/section/1..7`, which render everything
uncollapsed) via browser automation - see the file this was assembled
into, `src/_data/projectQuestions.js`. Recovery also turned up 5
illustrative images (`denormalization_for_ml.png`,
`supervised_learning_classification_vs_regression.png`,
`optimisation_reinforcement_learning_unsupervised_learning.png`,
`create_dataset_for_ml.png`, `bias_concept.png`) referenced from question
`more_info` content, all still present under `cw/cw/static/images/` with
their original filenames and copied across as-is (one, `bias_concept.png`,
turned out to already be vendored and in use by `articles/bias.html` -
same illustration, same file, confirmed by matching checksum). Three
`more_info` links also turned out to already point at articles that exist
on this site (`/articles/bootstrap-validation/`, `/articles/bias/`,
`/articles/sample/`) - found only by inspecting live DOM `<a>` hrefs, since
they're embedded in rich-text DB content invisible to a static grep of the
old templates.

**Single source of truth, not duplicated.** The user specifically asked to
keep the old site's separate read-only "tips" pages (`/project/1/` through
`/project/7/`, static article-style reading of a section's questions with
no input boxes - already stubbed as nav links) without duplicating all the
question content a second time for them. `src/_data/projectQuestions.js`
is that single source: Eleventy's data cascade feeds it directly to
`src/project/tips.njk` (one template, `pagination.data` over the 7
sections, `permalink: "/project/{{ section.number }}/"` - generates all 7
pages from one file), and a small `.11ty.js` template
(`src/project-questions.11ty.js`) republishes the exact same object as a
static JSON asset at `/assets/data/project-questions.json` for client-side
JS (the builder wizard, the list page's progress counts, the summary/view
page) to `fetch()` - same data, two consumers, zero duplication either way.

**Data model**: one new IndexedDB store, `projects` (`src/assets/js/
projects/db.js`, `ProjectStore` - same list/get/put/delete/newId shape as
`StudyStore`/`DatasetStore`). A `Project` record is just `{id, name,
answers: {uid: text}, currentSection, createdAt, modifiedAt}` - no login,
no `prid` magic-link sharing (unlike the old site, everything here is
already local-only IndexedDB, so there was never a server to need a
share-link workaround for).

**Pages**: `/project/` (list + create, mirrors `studies.njk`/
`study-list.js`, with a progress column computed from the fetched question
count); `/project/builder/?id=` (the wizard - one section/"chapter" per
screen, chapter-skip pills across the top showing each section's answered/
total count, Next/Prev between sections, "Finish" on the last section
linking to the summary page; each question's tips render inline,
unconditionally expanded, only when `more_info` is non-empty - directly
fixing the empty-box complaint, since there's no collapse mechanism left
at all); `/project/view/?id=` (read-only summary of every section/
question/answer in one page, "Not answered" shown in muted italic for
blanks, "Download PDF" via a vendored `html2pdf.bundle.min.js` - same
library the old site used, rendering the visible summary div client-side,
no server involved).

Verified in-browser end-to-end: created a project, answered one question,
confirmed the chapter-nav badge and IndexedDB record updated within the
400ms debounce, chapter-skip and Prev/Next both navigate correctly,
"Finish" from section 7 lands on the summary page showing the one answer
and 31 "Not answered", PDF download completes without error, the list
page shows "1 / 32 answered", and both recovered images (one on the tips
page, one inside the wizard's inline tips) load with a real
`naturalWidth`, not broken. No console errors anywhere in the flow.
Production build + a full clean rebuild (`rm -rf _site`) both succeed, and
the internal-link checker is fully clean for the first time this project -
the `/project/*` placeholders that were "out of scope until 8.7" in every
previous stage's link-check note are now real, working pages.

**8.6 prerequisite — continuous treatment is PD+FE-only; counterfactual value inputs** ✅ done
Two small UI changes ahead of the notebooks themselves, driven by research
into the old site's actual estimation code (see the notebooks entry below):
- **DoWhy doesn't support continuous treatment at all** - the old app's
  CD+PO validation forbade it outright, and its DML estimator hardcoded
  `discrete_treatment=True`. The new site's treatment widget had been
  offering "Use as a continuous value" for *any* numeric treatment
  regardless of method (added in an earlier revision without this
  constraint in mind). Fixed: `renderTreatmentGroupWidget()` now passes
  `allowContinuous: question.method === "pd+fe"` instead of an unconditional
  `true`, and the `sv-method` change handler (which previously never
  re-rendered the treatment widget at all) now does, resetting
  `treatmentSpec` back to a fresh grouped default if the user had continuous
  selected and switches away from PD+FE - the same "drop the stale spec,
  let the widget regenerate a valid default" pattern already used when a
  treatment's type changes.
- **Counterfactual treatment value inputs.** The results notebooks' item 3
  (counterfactual outcomes table) needs two optional values - "lower
  (control)" and "upper (treated)" - to evaluate a continuous treatment's
  counterfactual outcome at, matching what the old site's estimate config
  carried (`treatment_counterfactual_lower/upper`) but with no UI to set
  them anywhere on the new site yet. Added two number inputs directly
  inside `treatment-widget.js`'s "continuous" branch (`spec.
  counterfactualLower`/`counterfactualUpper`), wired the same way as the
  existing range inputs. Since continuous mode is now PD+FE-only, these
  inputs are automatically scoped correctly with no extra visibility logic.
  Flows into the exported config for free - `config-export.js` already
  passes `question` (which owns `treatmentSpec`) through wholesale.

Verified in-browser: CD+PO shows no grouped/continuous radio at all (just
the grouped editor directly); switching to PD+FE brings the radio back;
selecting continuous shows the two counterfactual inputs, which persist to
IndexedDB correctly; switching back to CD+PO resets the spec to grouped
and the radio disappears again. No console errors. Production build and
the internal-link checker both pass clean.

**8.6 — Make notebooks** ✅ done
Two Jupyter notebooks under `causal_wizard_app/notebooks/` reproducing the
old site's server-side estimation + results page, redesigned from scratch
(not ported) per the user's read of the old `cw/inference/*.py` code as
architecturally messy. Built on top of two research passes into exactly
what the old Python pipeline computes and exactly how the old results page
(`result_show.html`/`result.js`) renders each of its plots/tables - full
technical detail in the approved plan file
(`/home/dave/.claude/plans/compressed-yawning-spindle.md` at planning
time). Shape: a `causalwizard/` Python package holding all the actual
logic (`config`, `identification`, `estimation_cdpo`/`estimation_pdfe`,
`counterfactuals`, `propensity`, `refutation`, `diagnostics`, `plotting`,
`results_schema`), with notebook 1 (identification & estimation) doing all
the numeric work into a `results.json`, and notebook 2 (results) as pure
presentation reading that JSON plus the same config/data - modeled on the
old site's own `resultData` JSON shape, reused as the hand-off contract.
Deliberate corrections over the old code: PD+FE standard errors genuinely
entity-clustered (old code's comment claimed this but didn't do it); the
covariate-balance "love" plot's SMD reference line at 0.1 (the old page's
own explanatory text value, not the 0.2 its code actually used); CD+PO's
own linear-regression/GLM estimators implemented via statsmodels directly
rather than DoWhy's built-in `RegressionEstimator`, for direct control over
the do-operator predictions counterfactuals/generalization/the entity plot
need. `requirements.txt` pins `pandas<3.0` - DoWhy 0.12's own
`RegressionEstimator` (used internally by the frontdoor two-stage
estimator too, so this isn't fully dodged by the rewrite above) does
positional integer indexing into a name-indexed pandas Series, removed in
pandas 3.0; a `networkx.algorithms.d_separated` compatibility shim
(renamed to `is_d_separator` in networkx ≥3.3) lives in
`causalwizard/__init__.py`.

Verified end-to-end (not just unit-level): every estimator family fitted
against real (`lalonde.csv`) or synthetic data with sane, cross-checked
numbers - CD+PO propensity weighting/matching/stratification, CD+PO's own
linear regression and GLM (g-computation ATE/ATT/ATC reduces exactly to
the regression coefficient for OLS, and to a real average-probability
difference for GLM), EconML DML, IV, frontdoor, and PD+FE two-way fixed
effects (recovers a known synthetic effect with genuine cluster-robust
SEs). Both notebooks executed headlessly via `jupyter nbconvert
--execute` against three real configs (CD+PO/linear regression/numerical
outcome, PD+FE/continuous treatment, CD+PO/propensity weighting/
categorical outcome) - every one of the 10 results-page sections renders
without error for the combinations where it applies, and correctly says
"not applicable"/skips where it doesn't (e.g. no contingency table for a
continuous treatment, no causal diagram for PD+FE, no positivity/balance
for a non-propensity estimator).
*Deliverable*: a user takes the downloaded config JSON + their data file,
runs notebook 1 then notebook 2 (locally or in Colab via the badges in
`notebooks/README.md`), gets the same analyses as today.

**8.6 follow-up — user-testing fixes** ✅ done
User testing against real config/data files surfaced several real bugs, found and fixed:
- **CD+PO's own linear regression/GLM was regressing on every covariate in the
  dataset**, not the DoWhy-identified backdoor set - e.g. it included an "ID"
  column. Notebook 1 now computes `covariate_cols` from
  `identification.estimand_variables()` once, before estimation, and uses it
  consistently (also fixes the covariate-balance/positivity checks, which
  happened to already be correct by a different path).
- **A NaN in a covariate for even one held-out row silently NaN'd that row's
  prediction** (statsmodels doesn't raise), which then poisoned every
  aggregate generalization metric (RMSE/MAE/R² all propagate NaN via plain
  numpy arithmetic) while the scatter plot looked fine (Plotly just omits
  the NaN point). Fixed with a new `config.dropna_rows()` pass over the
  model's actual covariates, run before the train/test split.
- **A rewrite of the identification/estimation cell split introduced a
  worse bug while fixing the above**: building the DoWhy `CausalModel` on
  the full (pre-split) dataframe so identification could run before
  finalizing covariates meant DoWhy's own estimators (propensity/DML/IV/
  frontdoor) were being fit on *all* the data, held-out rows included -
  `identify_effect()` is graph-only and didn't care, but `estimate_effect()`
  reuses the same bound data. Fixed by re-identifying on `train_df` alone,
  right before estimation (cheap - identification doesn't touch data
  values, only the graph).
- **Double ML had no do-operator** (no counterfactual table, no
  generalization check, even though its refutation tests did run - just
  weren't rendered legibly). Added one via EconML's own
  `.effect(X=None, T0=, T1=)`, which gives the shift from a row's actual
  treatment to a counterfactual one - correct for the counterfactual table,
  but not usable for a held-out accuracy check (its "prediction" for a
  row's actual treatment is trivially that row's own observed outcome), so
  generalization stays unavailable for DML with an explanatory reason
  (`diagnostics.generalization_unavailable_reason()`) shown in notebook 2.
- **DML's effect estimate was wildly irreproducible** (swings of 1000+,
  including sign flips, from the identical train/test split) - its
  GradientBoosting nuisance models had no `random_state`. Pinned to 42.
- Propensity-based estimators (weighting/matching/stratification) still
  have no generalization check - they compare groups directly rather than
  fitting a "predict Y from X" model, so there's no outcome model to check
  against held-out data. The held-out split still happens either way (it's
  a property of the study, not the chosen estimator), but notebook 2 now
  explains why generalization isn't shown instead of just saying "not
  available."
- Fixed several markdown cells that rendered a literal `\n\n` instead of a
  line break (an escaping mistake - `\\n` in a plain Python string literal
  is the two characters backslash+n, not a newline; only mattered in
  markdown cells, since code cells' `\n` is interpreted by Python itself at
  execution time). Converted the affected two-line notes to one line instead
  of just fixing the escaping, per feedback that they didn't need to be two
  lines.
- `results.json` now embeds the config/data file paths it was built from
  (`source.configPath`/`dataPath`), and gained `results_schema.
  find_latest_results()` - notebook 2 defaults to the most recently written
  `results*.json` in the folder and reads config/data paths back out of it,
  so nothing needs re-entering between the two notebooks.
- Added `causalwizard/display_utils.py` (a `show()` pretty-printer, indented
  instead of a dense one-line dict repr) and `diagnostics.validation_rows()`
  (renders CD+PO's bootstrap/placebo/random-common-cause or PD+FE's z/F-stat
  as a proper table instead of a raw dict dump easy to skim past).
- Modelling statements moved from the last section to a "Study summary" at
  the top of notebook 2, rendered as Markdown
  (`diagnostics.modelling_statements_markdown()`) instead of a plain-text
  dict dump.
- Both notebooks now show the site's logo above the title, and are labeled
  "(1/2)"/"(2/2)".

Re-verified end-to-end against 5 real/synthetic scenarios (linear regression,
Double ML, propensity weighting + categorical outcome, PD+FE + continuous
treatment, and a deliberately-introduced missing covariate value) via
`jupyter nbconvert --execute` - all clean, including confirming the
generalization R²/RMSE/MAE are real numbers again (not NaN) and DML's effect
is now reproducible run-to-run.

**8.6 follow-up 2 — more user-testing fixes and explanatory content** ✅ done
- **A blank CSV header crashed notebook 1** with `KeyError: 'column_1'`. The
  site's own parser (`datasets/parse.js`) renames a blank header to
  `column_N` before anything else sees it, but pandas doesn't know that
  convention - a literal single-space header stays `' '`, a truly empty one
  becomes `'Unnamed: N'` - so the config's column names (which are always
  the site's already-renamed ones) didn't match the raw dataframe's. Fixed
  with `config.align_columns()`, which renames the loaded CSV's columns to
  the config's own `dataset.expectedColumns` names *by position* (both sides
  read the file left-to-right in the same order), called right after
  `pd.read_csv()` in both notebooks - this also covers any other case where
  pandas' own header guess doesn't match the site's, not just blank headers.
- Outcome/generalization plots were Plotly's cramped default aspect ratio;
  set to a standard 800x600 (4:3) via `plotting.PLOT_WIDTH`/`PLOT_HEIGHT`.
- Added a link to the live site (https://causalwizard.app) in both notebooks'
  header cells, alongside the existing logo.
- Found the "Summary results" section from the old site's `result_show.html`
  had no notebook equivalent - the full statsmodels regression summary
  (R², F-statistic, a coefficient table with std errors/t-stats/p-values/
  confidence intervals, Omnibus, Durbin-Watson, Jarque-Bera, condition
  number) that the old code laboriously parsed field-by-field out of
  `result.summary()`'s internal tables. Since our own regression/GLM and
  PD+FE estimators already return that `result` object, showing
  `str(result.summary())` directly gets everything for free, including the
  z/F-statistics the "Validation" table alone doesn't fully contextualize -
  added as its own section (own linear regression/GLM and PD+FE only;
  propensity/DML/IV/frontdoor don't have a comparable plain-regression
  summary).
- A full pass through `result_show.html`/`result.js` for explanatory text a
  reader with general stats knowledge but new to causal inference would
  need, adapted into notebook 2 and rendered as Markdown (not plain text) -
  covering Findings (the effect number now gets its own heading instead of
  being one line among many plain-text ones), Assumptions, Validation (a
  one-line description + desired result per test - z-statistic, F-statistic,
  bootstrap, placebo treatment, random common cause), held-out
  Generalization (why it matters, a data-leakage caveat, and metric
  definitions - R²/RMSE/MAE or accuracy/F1/precision/recall depending on
  outcome type), the Counterfactual table (do-operator explanation plus the
  categorical-outcome and continuous-treatment caveats), Contingency table,
  Positivity, Covariate balance, Summary results, and the Causal diagram -
  each linking back to the matching article on causalwizard.app where one
  exists. `diagnostics.py` gained one markdown-building function per section.

Re-verified end-to-end against 6 scenarios (the original 5 plus a
deliberately blank-headed CSV column) via `jupyter nbconvert --execute` -
all clean.

**8.6 follow-up 3 — own linear regression/GLM now run refutation too** ✅ done
CD+PO's own linear regression/GLM estimator (fit via a named statsmodels
formula, bypassing DoWhy's built-in one - see `estimation_cdpo.py`) had no
`dowhy_estimate`, so `refute_estimate()` had nothing to run against and
these two estimators silently skipped the whole Validation section. Traced
this to a since-outdated assumption: the bypass was originally needed
because DoWhy 0.12's own `RegressionEstimator` crashed under pandas>=3.0
(the bug `requirements.txt`'s `pandas<3.0` pin exists for), but with that
pin already in place, DoWhy's native `backdoor.linear_regression`/
`generalized_linear_model` now fits fine and agrees with our own fit on the
effect to several significant figures - confirmed by also tracing DoWhy's
`RegressionEstimator.interventional_outcomes()`, which turns out to
already implement the same do-operator our own `predict()` does (per the
user: they originally built this do-operator support for Causal Wizard and
upstreamed it into DoWhy). Kept our own named-formula fit (needed for
real column names in the "Summary results" table - DoWhy's own fit uses a
raw, anonymous `x1`/`x2`/`const` feature matrix internally, which would
make that table much less readable), but now *also* separately calls
DoWhy's native estimator for the same method purely so refutation has a
real `CausalEstimate` to run against. Also fixed a related latent bug
surfaced while testing this: DoWhy's `generalized_linear_model` estimator
requires an explicit `glm_family` in `method_params` (we weren't passing
one), which would have raised a `ValueError` the first time this path was
actually exercised end-to-end.

Re-verified end-to-end: own linear regression, GLM, and all 5 previous
scenarios via `jupyter nbconvert --execute` - all clean, with bootstrap/
placebo/random-common-cause refutation results now genuinely populated
for own linear regression/GLM instead of being silently skipped.

**8.6 follow-up 4 — GLM family selection (Poisson/Binomial), a second latent bug** ✅ done
Immediate follow-up to follow-up 3: the `glm_family` fix above only
handled the binary-outcome case, leaving GLM still broken for a numerical
outcome (the site's own model-selection UI explicitly offers GLM for
numerical outcomes too - "suitable for... numerical outcomes such as
count data" - so this combination is a real, reachable path, not a
hypothetical). Root-caused against the old Django site's actual family-
selection algorithm (`cw/inference/causal_methods.py`'s
`add_method_specific_params()`, per the user's own recollection of having
built it): **Binomial** for a binary-categorical outcome, **Poisson** (not
Gaussian) for a numerical one - the site's own UI text ("count data")
already promised this. Along the way, also found and fixed a real
conflation bug in `_fit_own_regression()`: it branched on outcome type for
*both* `linear_regression` and `generalized_linear_model`, meaning
`linear_regression` would silently switch to a Binomial-GLM fit for a
binary outcome instead of staying plain OLS (a linear probability model,
same treatment PD+FE already gives a binary outcome) - the old site's
`linear_regression` estimator (DoWhy's own `LinearRegressionEstimator`)
never had this outcome-type branching at all. New `glm_family()` helper
used both by our own fit and by the DoWhy-native fit obtained for
refutation, so both agree.

Re-verified all 4 combinations (linear_regression/GLM x binary/numerical
outcome) directly, plus the two previously-untested end-to-end (GLM with
each outcome type, via `jupyter nbconvert --execute`) - all give distinct,
sane effect estimates with working refutation, no crashes.

**8.6 follow-up 5 — None in required_cols crashed dropna for PD+FE** ✅ done
Covariates, entity, and time are all independently optional (an empty
covariate list is fine). The "Finalize sample" cell's `required_cols` list
included `panelData.entity`/`time` unconditionally whenever method was
PD+FE, so an unset one landed in the list as a literal `None`, and
`config.dropna_rows()`'s `df.dropna(subset=[...])` raised `KeyError:
[None]` - `None` isn't a real column. Fixed by filtering falsy entries out
of `required_cols` before the call. (This entry originally also added a
hard requirement that PD+FE needs *both* entity and time set - that
assumption was wrong; see follow-up 6, immediately below, which replaces
it with the correct behavior.)

**8.6 follow-up 6 — entity/time are independently optional for PD+FE, not required** ✅ done
Corrects a mistake in follow-up 5 immediately above: entity and time were
treated as jointly mandatory for PD+FE (raising a clear `ValueError` if
either was unset), but only treatment and outcome are actually mandatory -
entity, time, and covariates are all independently optional, same as
covariates already were. With neither entity nor time set, PD+FE should
degrade to plain OLS (`outcome ~ treatment [+ covariates]`); with only one
set, one-way fixed effects on that dimension alone. Fixed throughout
`estimation_pdfe.py`: `_demean()`/`_redemean_new_rows()` skip whichever of
entity/time demeaning isn't applicable, and the `predict()` closure adds
back only the demeaning terms that were actually subtracted. Entity-
clustered standard errors need an entity to cluster on, so with none, the
fit falls back to heteroskedasticity-robust (HC1) instead - still robust,
just not clustered. Also removed the now-wrong Identification-cell
`ValueError`, and fixed a related bug in notebook 2's "Outcomes over Time"
plot cell, which checked `if q["panelData"]:` (always true once the dict
exists) rather than `q["panelData"].get("time")` - `plot_outcomes_over_time()`
needs a real time column to group by.

Re-verified all 4 entity/time combinations (both set, entity-only,
time-only, neither) directly against synthetic panel data, plus all 4
end-to-end via `jupyter nbconvert --execute` (including the user's exact
"no covariates, no entity, no time" case, which now behaves as a genuinely
simple linear regression) - no crashes, and correct `cov_type` in each
case; all previously-covered scenarios re-verified unaffected.

**8.6 follow-up 7 — three PD+FE/continuous-treatment display bugs** ✅ done
User testing a PD+FE study with an entity but no time (continuous
treatment, no covariates) surfaced three real bugs in notebook 2, all in
`plotting.py`/the results notebook rather than the underlying estimation:
- **"Outcomes by Sample Cohort" rendered nonsense for a continuous
  treatment**: notebook 2 called `plot_outcomes_cohort()` unconditionally,
  but that plot filters rows by `treatment_col == 0`/`== 1` - meaningless
  for a continuous variable, and actively misleading when a continuous
  value coincidentally equals 1.0 (as one row's `mkt_costs` did here),
  producing a plausible-looking but meaningless single-point "Treated"
  box. Now skipped entirely when `treatmentIsContinuous`, matching the old
  site's own binary-design-only scope for this plot.
- **`plot_outcomes_entity()` didn't connect same-entity points**, and
  notebook 2 was passing `entity_col=None` unconditionally regardless of
  whether the study actually had one - so even fixing that, there was
  nothing joining a given entity's points together to show how its
  outcome varies with treatment. Rewrote the plot to draw one line per
  entity per series (Observed/Predicted/Control-Lower/Treated-Upper),
  each in that series' own colour (counterfactual lines thinner), when an
  entity column is available; falls back to plain unjoined points when
  there isn't one (e.g. CD+PO, which has no panel structure to join by).
- **Counterfactual table mislabeled continuous-treatment rows**: the 7
  fixed `SCENARIOS` labels ("if all samples were controls"/"treated") are
  written for a grouped design; for a continuous one only 3 of the 7 rows
  are ever populated, and showing all 7 (4 always blank) with
  group-language labels that don't apply was confusing. Added
  `counterfactuals.display_scenarios()`, which returns just the 3
  applicable rows for a continuous design, explicitly labelled with the
  actual counterfactual values ("If all samples had mkt_costs = 2
  (Lower)") instead of "controls"/"treated".

Also hit, and want to flag for the record since it briefly produced
misleading verification results: mid-session, the live-edited notebook on
disk (the user's own manual Jupyter testing, with their own config/data
paths appended) got copied into an automated test run before a coincident
regeneration, so one batch of "all scenarios pass" output was briefly
testing the user's file instead of the intended ones. Caught via
suspicious identical output sizes across unrelated scenarios, traced with
`git diff`, resolved by regenerating clean notebooks and re-running the
full suite against isolated copies. No code was affected - purely a
testing-methodology hazard worth remembering when a notebook under test is
also open elsewhere.

Re-verified end-to-end against the reported scenario (entity-only,
continuous treatment, no covariates) - confirmed via direct inspection of
the executed notebook's Plotly JSON and rendered tables: the cohort plot
no longer appears, the entity plot shows 16 traces (4 series x 4 entities,
consistent per-series colour), and the counterfactual table shows exactly
3 correctly-labelled rows. Also re-ran all 12 previously-covered scenarios
- all clean.

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
