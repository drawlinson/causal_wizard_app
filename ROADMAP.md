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
- **Client-side search**: prebuilt index (lunr.js or FlexSearch) generated
  at build time from the article Markdown, replacing the old server
  endpoint `search.js` used to hit.
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

**8.2 — Migrate articles**
Extract article/category/help content + cross-page associations from
`backup_final.sql`, convert to static content, bring over `article_images`.
Replace server search with a client-side index.
*Deliverable*: all help/article pages exist as static pages with working
internal links and search.

**8.3 — Migrate dataset / XDA features**
Port `dataset.js` to work off a client-parsed CSV/XLSX instead of
server-processed data; store results in the browser.
*Deliverable*: user can upload a CSV/Excel file and see the same
exploratory stats/plots as today, entirely client-side.

**8.4 — Migrate wizard / causal diagram editor**
Port `graph.js` (Cytoscape diagram), `wizard.js`, `treatment.js`,
`estimand.js`; add the in-browser identification/model-compatibility logic;
replace "Calculate" with "Download study config JSON."
*Deliverable*: full wizard flow works end-to-end client-side and produces a
config JSON in the schema the notebooks will consume.

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

- `backup_final.sql` needs Postgres (or careful parsing) to extract article
  data reliably — extraction tooling is throwaway, never shipped.
- `driver.js`-based guided help / contextual error messages need to be
  rebuilt against the new client-side wizard state machine.
- The SSG must never re-render the diagram container after initial load —
  only hand-written app JS touches Cytoscape's DOM.
