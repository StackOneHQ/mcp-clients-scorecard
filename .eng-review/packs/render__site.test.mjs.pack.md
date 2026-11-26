# REVIEW PACK — render/site.test.mjs at e2e6a74f83c9611e458a9312c3ecddc203e0d976

## Hunks
```diff
diff --git a/render/site.test.mjs b/render/site.test.mjs
index 3693e0f..971c941 100644
--- a/render/site.test.mjs
+++ b/render/site.test.mjs
@@ -107,6 +107,12 @@ test('data.json carries every client with every cell', () => {
   for (const c of json.clients) assert.deepEqual(Object.keys(c.cells).sort(), COLUMNS.map(([k]) => k).sort());
 });
 
+test('version.json names the data date and the deployed commit', () => {
+  const v = JSON.parse(read('version.json'));
+  assert.equal(v.as_of, String(data.as_of));
+  assert.equal(v.commit, process.env.SITE_COMMIT || null);
+});
+
 test('the badge files the pages embed exist', () => {
   for (const c of data.clients) assert.ok(fs.existsSync(path.join(out, 'badges', `${c.slug}.svg`)), c.slug);
 });
```

## Call sites in this file of the helpers these added lines call, with guard context
(a guard applied to one copy of a value while a sibling escapes is the highest-yield defect shape)
  parse() — 5 call site(s), all UNGUARDED
  read() — 10 call site(s), all UNGUARDED
  equal() — 10 call site(s), all UNGUARDED

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
