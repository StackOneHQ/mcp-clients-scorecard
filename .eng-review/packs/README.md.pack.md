# REVIEW PACK — README.md at e2e6a74f83c9611e458a9312c3ecddc203e0d976

## Hunks
```diff
diff --git a/README.md b/README.md
index 3de0b12..dd9162d 100644
--- a/README.md
+++ b/README.md
@@ -347,12 +347,12 @@ The same data is published at [mcpclients.dev](https://mcpclients.dev): the tier
 
 `npm run site` builds it into `dist/` from `data/` and the committed PNGs, without Chrome; nothing in `dist/` is committed. The share cards in `assets/og/` are drawn by `npm run build` with the charts. [worker/index.js](worker/index.js) serves `dist/` ([wrangler.jsonc](wrangler.jsonc)): it sets the security headers and serves the page's Markdown copy to AI agents (by `Accept` header, User-Agent or a `.md` URL). Search engine crawlers get HTML at page URLs; a `.md` URL returns Markdown to every client.
 
-Deploys go through Cloudflare's GitHub app (Workers Builds): every push to `main` builds and deploys the site, so a merged data pull request reaches it within minutes. When the build workflow commits regenerated files back to `main`, that push deploys again.
+Deploys run in GitHub Actions: on every push to `main`, the `deploy` job in [build.yml](.github/workflows/build.yml) waits for the build job (tables, charts, `npm run check`, `npm test`), runs `npm run site` on the branch tip and `wrangler deploy`, then fails unless https://mcpclients.dev/version.json reports that commit. A merged pull request reaches the site within minutes, and a red deploy job on `main` means the site is behind.
 
-Setup, once, in the Cloudflare dashboard:
+Setup, once:
 
-1. Workers & Pages > Create > Import a repository: pick `StackOneHQ/mcp-clients-scorecard` and install the Cloudflare GitHub app on it.
-2. Build settings: production branch `main`, build command `npm ci && npm run site`, deploy command `npx wrangler deploy`, root directory `/`.
+1. In Cloudflare, create an API token from the **Edit Cloudflare Workers** template, scoped to the account that holds the `mcp-clients-scorecard` Worker.
+2. In this repo, add two Actions secrets: `CLOUDFLARE_API_TOKEN` (that token) and `CLOUDFLARE_ACCOUNT_ID` (the account id from the Workers overview page).
 3. Register `mcpclients.dev` (Cloudflare Registrar sells it at cost) and add it as a Custom Domain on the `mcp-clients-scorecard` Worker. `.dev` only works over HTTPS, which Cloudflare provides. Until then the site answers only on its workers.dev address, while its links, canonical URLs and share cards already point at the domain.
 
 ## Repository layout
```

## Call sites in this file of the helpers these added lines call, with guard context
(a guard applied to one copy of a value while a sibling escapes is the highest-yield defect shape)
  (none)

## Call order of methods in this file (line: call)
  (none)

## Blast radius of the symbols this diff changed
  (none)

## Tests related to this file
  (none)

## Tooling present — never flag what these already catch
  (none)

## This package
  mcp-clients-scorecard

## Repo rules (CLAUDE.md, AGENTS.md, in-repo skills) — a real violation of one of these is a finding
  - Use the [submit evidence form](../../issues/new?template=submit-evidence.yml). Give the client, the feature, the value you claim (`y`, `p`, `n`, or `na` for MCP Apps on a terminal CLI), a source URL, 
  - Use the date of the first release that shipped it, even behind a flag. Do not move it forward when partial support becomes full.
