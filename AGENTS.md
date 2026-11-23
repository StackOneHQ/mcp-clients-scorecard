# Agent instructions

Instructions for coding agents (Claude Code, Codex, Copilot and others) working in this repository. People should read [CONTRIBUTING.md](CONTRIBUTING.md) for the data rules.

## Generated files

`data/` is the source of truth. These files are generated from it and must never be edited by hand:

- the marked sections of `README.md`
- `EVIDENCE.md`
- `data/history/<as_of>.json`
- `assets/badges/*.svg`
- the four charts `assets/tiers.png`, `assets/matrix.png`, `assets/history-features.png` and `assets/history-clients.png`, and the website share cards `assets/og/*.png`, with their hashes in `assets/images.json`

To change a chart, change `data/` or the templates in `render/images.mjs` (share cards: `render/site.mjs`), then rebuild.

## After any change to data/ or render/

1. Run `npm ci` once, then `npm run build`. It needs Chrome to draw the charts. The build looks for `CHROME_PATH`, then `google-chrome`, `chromium` and the Chrome that `agent-browser` installs under `~/.agent-browser/browsers/`. If none is found, install one (`npx @puppeteer/browsers install chrome@stable`) and set `CHROME_PATH` to it.
2. Run `npm run check`. It must print `images up to date`. It fails when a chart is stale, for example after a build with `--no-images`.
3. Look at every PNG that changed before you commit it, to catch overlapping labels or a broken layout.
4. Commit the regenerated files in the same commit as the data or template change.

Only use `npm run build -- --no-images` when no Chrome can be installed. It warns which charts it left stale. Say so in the pull request: the build workflow redraws the charts and commits them to the branch after you push, so wait for that commit and pull it before you push again. On a fork the workflow only runs if Actions is enabled there; otherwise a maintainer has to rebuild the charts.

## Writing evidence and site copy

Every claim on the site is backed by a cell's `source` and `evidence`, and the client pages show the whole evidence in a proof panel. Write `evidence` as structured Markdown, never as one long run-on sentence:

- open with the verdict in one sentence (the card shows only that line),
- when there are two or more supporting facts, put each in its own `- ` bullet (one fact stays a second sentence, never a one-item list),
- **bold** the one or two facts that decide the value, *italic* for a caveat word, `code` for env vars, flags, settings keys, method and extension ids.

The full rules and an example are in [data/README.md#writing-evidence](data/README.md#writing-evidence). `render/evidence.mjs` renders the subset; anything else (headings, tables, HTML) shows as plain text. Page copy in `render/site.mjs` follows the same habit: short sentences, lists for parallel items, bold for the one fact a reader must not miss. No em or en dashes anywhere.

## CI

- `.github/workflows/build.yml` runs on every push, `main` included. It rebuilds the tables and badges, redraws with Chrome any chart whose HTML changed, commits any change back to the branch, then runs `npm run check` and `npm test`.
- Deploys are not in GitHub Actions: Cloudflare's GitHub app (Workers Builds) runs `npm ci && npm run site` and `npx wrangler deploy` on every push to `main` (README.md#website). That build has no Chrome, which is why the share cards are committed.
- `.github/workflows/check.yml` runs `npm run check` and `npm test` on pull requests. A pull request with stale charts fails it.

## Other commands

- `npm run site` builds the website into `dist/` (never committed). It reads `data/` and the generated charts, so run `npm run build` first. It needs no Chrome. `worker/index.js` serves `dist/` and sets the security headers, including the Content-Security-Policy (Cloudflare skips `_headers` once a Worker runs first). Page templates live in `render/site.mjs`, the styles in `render/site/style.css` and the browser script (search palette, filters, compare, matrix sorting) in `render/site/app.js`. Keep every style and script in those two files: the site's Content-Security-Policy blocks inline styles and scripts (JSON-LD is data and is fine). Fonts are self-hosted in `assets/fonts/`. Filters, compare and the palette must stay additions on top of server-rendered HTML, so every page still works without JavaScript.
- `npm test` runs the probe and benchmark unit tests and the website build tests.
- `npm run build -- --all-images` redraws every chart, not only the ones whose HTML changed. Use it when something outside the HTML changed, such as the web font or the Chrome version.
