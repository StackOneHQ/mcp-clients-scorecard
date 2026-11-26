# REVIEW PACK — AGENTS.md at e2e6a74f83c9611e458a9312c3ecddc203e0d976

## Hunks
```diff
diff --git a/AGENTS.md b/AGENTS.md
index 9fff3af..2adddde 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -36,7 +36,7 @@ The full rules and an example are in [data/README.md#writing-evidence](data/READ
 ## CI
 
 - `.github/workflows/build.yml` runs on every push, `main` included. It rebuilds the tables and badges, redraws with Chrome any chart whose HTML changed, commits any change back to the branch, then runs `npm run check` and `npm test`.
-- Deploys are not in GitHub Actions: Cloudflare's GitHub app (Workers Builds) runs `npm ci && npm run site` and `npx wrangler deploy` on every push to `main` (README.md#website). That build has no Chrome, which is why the share cards are committed.
+- On `main`, the `deploy` job in `build.yml` runs `npm run site` and `wrangler deploy` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, then checks that https://mcpclients.dev/version.json reports the deployed commit (README.md#website). It runs no Chrome, which is why the share cards are committed.
 - `.github/workflows/check.yml` runs `npm run check` and `npm test` on pull requests. A pull request with stale charts fails it.
 
 ## Other commands
```

## Call sites in this file of the helpers these added lines call, with guard context
(a guard applied to one copy of a value while a sibling escapes is the highest-yield defect shape)
  commit() — 6 call site(s), all UNGUARDED

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
