# REVIEW PACK — package.json at e2e6a74f83c9611e458a9312c3ecddc203e0d976

## Hunks
```diff
diff --git a/package.json b/package.json
index e72d254..675954d 100644
--- a/package.json
+++ b/package.json
@@ -24,5 +24,8 @@
   },
   "dependencies": {
     "yaml": "^2.9.1"
+  },
+  "devDependencies": {
+    "wrangler": "4.160.1"
   }
 }
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
