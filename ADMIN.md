# Admin guide: building & deploying Causal Wizard

This site is a static Eleventy build — no server, no database. Everything
in `src/` compiles to plain HTML/CSS/JS in `_site/`, which is what actually
gets deployed.

## Prerequisites

- Node.js 20+ (built and tested with Node 24 LTS). If you don't have Node
  installed, the easiest route is [nvm](https://github.com/nvm-sh/nvm):
  ```
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  nvm install --lts
  ```

## One-time setup

```
npm install
```

## Building

```
npm run build
```

Compiles everything in `src/` into `_site/`. That's the deployable output —
you can open `_site/index.html` directly, or point any static file server
at the `_site/` directory.

## Local preview (with live reload)

```
npm run serve
```

Starts a local dev server (Eleventy's built-in server) and rebuilds on file
changes. It prints the local URL to open (typically `http://localhost:8080`).

## Deploying

### Automatic (GitHub Pages, via GitHub Actions — recommended)

`.github/workflows/deploy.yml` builds the site and deploys it to GitHub
Pages automatically on every push to `main`. One-time setup in the GitHub
repo, done once via the web UI (not something that can be scripted from
here):

1. Go to **Settings → Pages** in the `causal_wizard_app` GitHub repo.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or re-run the workflow manually from the Actions tab) —
   the site will build and deploy, and GitHub will show you the
   `*.github.io` URL it's live at.

To use your own custom domain instead of (or as well as) the `.github.io`
URL:

1. In your DNS provider, add the record GitHub's docs currently specify for
   your case — typically an `A`/`ALIAS`/`ANAME` record at your apex domain
   pointing at GitHub's Pages IPs, or a `CNAME` record if you're using a
   subdomain like `www`. Check
   [GitHub's current custom-domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
   for the exact records, since these can change.
2. In **Settings → Pages → Custom domain**, enter your domain and save.
   GitHub verifies DNS and provisions HTTPS automatically (can take a
   little while).
3. Once set, GitHub redirects the default `*.github.io` URL to your custom
   domain automatically — you don't need to maintain two copies of
   anything.

### Manual (any static host)

```
npm run build
```

then upload the contents of `_site/` to wherever you're hosting (Netlify,
Cloudflare Pages, S3, etc. — anything that serves static files works,
since there's nothing server-side to configure).

## Repo layout

```
src/
  _includes/base.njk   — shared layout (nav, <head>, etc.)
  assets/              — vendored CSS/JS/images/fonts, copied as-is to /assets/
  *.njk                — one file per page; front matter sets layout + title
eleventy.config.js      — Eleventy config (input/output dirs, passthrough copy)
ROADMAP.md              — migration plan and architecture decisions
```

Eleventy gives each page a "pretty URL" matching its filename automatically
— `src/about.njk` → `/about/`, `src/index.njk` → `/` — so adding a new
static page is just adding a new `.njk` file with:

```
---
layout: base.njk
title: Page Title
---
<div class="container">
  ...your content...
</div>
```

## Notebooks (future)

Per `ROADMAP.md` (stage 8.6), the Python analysis notebooks will live in a
`./notebooks` folder in this same repo, not a separate one. Nothing there
yet.
