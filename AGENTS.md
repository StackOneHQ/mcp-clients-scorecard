# Agent instructions

Instructions for coding agents (Claude Code, Codex, Copilot and others) working in this repository. People should read [CONTRIBUTING.md](CONTRIBUTING.md) for the data rules.

## Generated files

`data/` is the source of truth. These files are generated from it and must never be edited by hand:

- the marked sections of `README.md`
- `EVIDENCE.md`
- `data/history/<as_of>.json`
- `assets/badges/*.svg`
- the four charts `assets/tiers.png`, `assets/matrix.png`, `assets/history-features.png` and `assets/history-clients.png`, with their hashes in `assets/images.json`

To change a chart, change `data/` or the templates in `render/images.mjs`, then rebuild.

## After any change to data/ or render/

1. Run `npm ci` once, then `npm run build`. It needs Chrome to draw the charts. The build looks for `CHROME_PATH`, then `google-chrome`, `chromium` and the Chrome that `agent-browser` installs under `~/.agent-browser/browsers/`. If none is found, install one (`npx @puppeteer/browsers install chrome@stable`) and set `CHROME_PATH` to it.
2. Run `npm run check`. It must print `images up to date`. It fails when a chart is stale, which happens when the build ran with `--no-images` or without Chrome.
3. Look at every PNG that changed before you commit it, to catch overlapping labels or a broken layout.
4. Commit the regenerated files in the same commit as the data or template change.

Only use `npm run build -- --no-images` when no Chrome can be installed. It warns which charts it left stale. Say so in the pull request: the build workflow redraws the charts and commits them to the branch after you push, so wait for that commit and pull it before you push again.

## CI

- `.github/workflows/build.yml` runs on every push, `main` included. It rebuilds everything with Chrome, commits any change back to the branch, then runs `npm run check` and `npm test`.
- `.github/workflows/check.yml` runs `npm run check` and `npm test` on pull requests. A pull request with stale charts fails it.

## Other commands

- `npm test` runs the probe and benchmark unit tests.
- `npm run build -- --all-images` redraws every chart, not only the ones whose HTML changed. Use it after a change to fonts or shared styles.
