# REVIEW PACK — render/site.mjs at e2e6a74f83c9611e458a9312c3ecddc203e0d976

## Hunks
```diff
diff --git a/render/site.mjs b/render/site.mjs
index 3b8ada0..c70bca1 100644
--- a/render/site.mjs
+++ b/render/site.mjs
@@ -1,5 +1,5 @@
-// The website, generated from data/ into dist/. Cloudflare's GitHub app builds it with `npm run site` and deploys it
-// with worker/index.js on every push to main. No Chrome needed: the share cards are drawn by `npm run build`.
+// The website, generated from data/ into dist/. The build workflow runs `npm run site` and deploys it with
+// worker/index.js on every push to main. No Chrome needed: the share cards are drawn by `npm run build`.
 import fs from 'node:fs';
 import crypto from 'node:crypto';
 import path from 'node:path';
@@ -69,6 +69,8 @@ export function buildSite(out) {
   });
   write('404.html', page({ title: `Not found: ${TITLE}`, description: 'Page not found', path: '/404', image: ogImage('index'), noindex: true, body: '<main class="wrap narrow"><h1>Not found</h1><p><a href="/">Back to the tier list</a></p></main>' }));
   write('data.json', JSON.stringify(publicData(data), null, 2) + '\n');
+  // Lets the weekly refresh tell which commit the live site runs; SITE_COMMIT is set by the deploy job
+  write('version.json', JSON.stringify({ as_of: String(data.as_of), commit: process.env.SITE_COMMIT || null }) + '\n');
   write('llms.txt', llms(data));
   write('llms-full.txt', llmsFull(data, events));
   write('robots.txt', ROBOTS);
```

## Call sites in this file of the helpers these added lines call, with guard context
(a guard applied to one copy of a value while a sibling escapes is the highest-yield defect shape)
  write() — 10 call site(s), all UNGUARDED
  stringify() — 5 call site(s), all UNGUARDED

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
