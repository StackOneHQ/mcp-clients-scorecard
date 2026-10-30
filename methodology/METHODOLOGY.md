# Methodology

How every cell in the [scorecard](../README.md) is graded, where the evidence comes from, and what the data does not tell you.

## What is graded

Each client gets nine cells, one per entry in [data/features.yaml](../data/features.yaml):

| Column | Graded as | Where it is defined |
| --- | --- | --- |
| Spec version | The newest protocol revision the client negotiates | [MCP specification](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |
| Code mode | `y`, `p` or `n` | Client feature, not in the spec ([Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp), [Cloudflare](https://blog.cloudflare.com/code-mode/)) |
| Tool search | `y`, `p` or `n`, plus a label for how it searches | Client feature, not in the spec ([Anthropic](https://www.anthropic.com/engineering/advanced-tool-use)) |
| MCP Apps | `y`, `p` or `n` | [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview) |
| Tasks | `y`, `p` or `n` | [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview), experimental in the 2025-11-25 spec |
| Events | `y`, `p` or `n` | [Triggers and Events working group](https://github.com/modelcontextprotocol/experimental-ext-triggers-events) |
| CIMD | `y`, `p` or `n` | [Authorization, client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration) |
| ID-JAG | `y`, `p` or `n` | [Enterprise-Managed Authorization extension](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization) |
| Elicitation | `y`, `p` or `n` | [Client elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation) |

The values mean:

- `y`: the feature works in the version checked, on by default or with a documented setting.
- `p`: partial. Behind a flag, off by default, marked experimental, or only one of two modes (for example form elicitation without URL elicitation).
- `n`: not supported, or not documented anywhere we could find. A missing feature and an undocumented one look the same from outside, so a vendor who can show support should [send the source](../CONTRIBUTING.md).

A feature the vendor calls beta or preview is `y` when it is on by default or turned on by a documented setting or admin policy, and `p` when it needs an experimental flag or an undocumented switch. The evidence names the vendor's label.

For tool search, `quality: strong` marks a search the vendor documents (BM25, embeddings, deferred loading with a search tool), and `basic` marks one whose ranking is not documented. Strong labels show green in the matrix image, basic ones amber.

[bench/tool-search](../bench/tool-search/README.md) measures how well each ranking finds the right tool: keyword, regex, BM25 and embeddings over 453 tools from 28 public MCP servers, with lexical, paraphrased and ambiguous queries. The grade above does not use those numbers yet.

## Evidence methods

Every cell names one method:

| Method | What was checked | Typical source |
| --- | --- | --- |
| `probe` | A live handshake against a local MCP server, see [PROBE.md](PROBE.md) | The vendor changelog that matches the probe result |
| `source` | The client's own code at a pinned commit, or the published package | A GitHub permalink with a commit hash and line number |
| `docs` | The vendor's documentation | A docs page |
| `changelog` | The vendor's release notes or changelog | A changelog entry or release |
| `issue` | A GitHub issue or pull request | An open feature request, or a merged pull request |

When sources disagree, the order of trust is probe, then source at a pinned commit, then changelog, then docs, then issue. Each cell also records `checked`, the date someone last opened the source and confirmed the value, and `evidence`, a short note on what the source says.

## Spec version

The protocol cell holds the newest revision the client asks for or agrees to. For the CLIs this comes from the live probe. For apps and IDEs it comes from the code or the vendor's docs. Hosted clients that do not say which revision they speak show `not published`.

The grade compares that value with `spec_versions` in [data/meta.yaml](../data/meta.yaml): the first entry is current, the second is one behind, and any other listed revision is older. `not published` gets no grade and shows as not published. When a new revision ships, it goes at the front of the list and every client drops a grade until it catches up.

## MCP bugs fixed

For each client with a public tracker, `npm run bugs` ([scripts/bugs.mjs](../scripts/bugs.mjs)) counts issues opened on or after `bug_window_start` with the GitHub search API:

```
fix rate = completed / (issues - duplicates)
```

- `issues`: issues opened since the window start, with "mcp" in the title, unless the tracker is only about MCP (`mcp_in_title: false`).
- `completed`: those closed with reason completed.
- `duplicates`: those closed with reason duplicate.

Below 20 issues after removing duplicates the rate is not shown. The counts live in [data/bugs.json](../data/bugs.json), and the build fails if its window does not match `bug_window_start`. The rate shows how a team responds to MCP reports. It does not measure how many bugs a client has, since a popular client gets more reports.

## Tiers

Tiers come from the feature score (`y` = 1, `p` = 0.5 across the eight feature columns), the spec grade and the fix rate. The rules are in [RUBRIC.md](RUBRIC.md) and in `rubricTier` in [render/data.mjs](../render/data.mjs). A client can sit in another tier only with a written `tier_note`, and the build fails on any other mismatch.

## Dating support

The adoption charts in the README are rebuilt from `since` on each supported cell:

```yaml
since:
  date: 2025-07-09        # release date of the first version with the feature
  version: "1.102"        # that version, when the vendor numbers releases
  source: https://...     # the release note, changelog entry or tag that dates it
```

Rules:

- `since` is set only from a public release note, changelog entry, release tag or dated vendor announcement that names the feature, or from a vendor docs page that names the first version with the feature, dated by that version's release. A commit date, or a docs page with neither a date nor a version, is not enough.
- The date is the release date of the first version that shipped the feature to users, including behind a flag. A later change from partial to full support does not move it.
- A cell that is `y` or `p` with no `since` is treated as date unknown. It counts in the scorecard and the feature counts table, and is left out of the time series. The README lists how many cells per feature are undated.
- `since.date` may not be after `as_of`, and its source must be https. `npm run check` enforces both.

Because undated cells are left out, the lines show a lower bound on adoption. A feature with many undated cells will look later and smaller than it is.

The history snapshots in [data/history/](../data/history/) are a second record. Each build writes the value of every cell on the `as_of` date, so a change between two reviews is visible even when no release note dates it.

## Validation

`npm run check` runs in CI on every pull request ([.github/workflows/check.yml](../.github/workflows/check.yml)) and fails when:

- a client file is missing a required field (`name`, `group`, `tier`, `logo`, `website`, all nine cells), its file name does not match its name, or it carries an unknown key;
- a `y` or `p` cell lacks a known `method`, an https `source`, `evidence`, or a `checked` date in YYYY-MM-DD form;
- a `since` block has a date after `as_of` or a source that is not https;
- a client's tier differs from the rubric without a `tier_note`;
- the README sections, EVIDENCE.md or the history snapshot for `as_of` differ from what `npm run build` would write.

The same checks apply to `n` cells, which also need a source showing where we looked.

## Limitations

- Apps and IDEs are checked from code and docs, not with the live probe. Hosted clients can change without a release note.
- Partial is a wide bucket. The evidence column says which kind of partial a cell is.
- The fix rate depends on how each team labels and closes issues.
- The adoption charts only show what release notes date, and depend on vendors naming features in them.
- The list covers widely used clients. It is not every MCP client. To add one, see [CONTRIBUTING.md](../CONTRIBUTING.md).
