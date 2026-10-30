# Tool-search ranking benchmark

This benchmark asks how often a tool-search ranker puts the right MCP tool near the top of its results when the catalogue has a few hundred real tools. It compares the lexical rankers that clients ship (substring match, regex over the name, BM25) with OpenAI embeddings, a hybrid of the two, and an LLM query rewrite placed before BM25.

Run on 2026-10-30, Node 22, no Python.

## What it measures

- **Catalogue** (`data/catalogue.json`): 453 tools from 28 MCP servers. Each tool was fetched with `tools/list` from a server started by `npx -y <package>` with no real credentials (`scripts/fetch-catalogue.mjs`, then `scripts/build-catalogue.mjs`). Every tool keeps its name, description and input schema property names. Its `source` field records the package and the run date. The raw output for each server is in `data/servers/`.
- **Queries** (`data/queries.json`): 148 hand-written queries, each with gold tool ids. `run.mjs` checks that every gold id exists in the catalogue.
  - **lexical** (48): the query uses words that appear in the tool name or description, for example "create a GitHub pull request".
  - **paraphrase** (52): the query describes the same task in other words, for example "set aside my half-done work so I can switch tasks" for `git_stash`. 22 of the 52 still name the product ("in HubSpot").
  - **ambiguous** (48): several tools across servers are acceptable, for example "search issues mentioning timeout". Gold is the full set of acceptable tools.
- **Indexed text**: each tool is indexed under its client-visible name, `mcp__<server>__<tool>`, as Claude Code and Codex expose MCP tools. The rest of the indexed text is the description and the parameter names.
- **Metrics**:
  - recall@1, @3 and @5: the share of queries with at least one gold tool in the top k
  - MRR: the mean of 1/rank of the first gold tool, counted as 0 when no gold tool is in the top 50

  Each metric is reported overall and per bucket.

### Rankers (`rankers/`)

| Ranker | File | What it does |
|---|---|---|
| keyword (substring) | `keyword.mjs` | Counts how many query words (stop words removed) appear as substrings in the name, description and parameters. |
| regex over name | `regex-name.mjs` | Matches the alternation of the query words, case-insensitive, against the qualified name only. Ties are broken by matches in the description. This stands in for a model writing a regex such as `issue\|ticket`. |
| BM25 | `bm25.mjs` | Okapi BM25 (k1 = 1.2, b = 0.75) over the name words (snake and camel case split), description and parameter names, with English stop words and Porter stemming. Codex's bm25 crate also uses stop words and stemming. |
| BM25, name x3 | `bm25.mjs` | The same, with the name tokens repeated three times to boost the name field. |
| embeddings (3-small) | `embeddings.mjs` | OpenAI `text-embedding-3-small` over the name, description and parameters, ranked by cosine similarity. |
| hybrid RRF | `hybrid.mjs` | Reciprocal rank fusion (k = 60) of the BM25 and embeddings rankings. |
| LLM rewrite + BM25 | `rewrite.mjs` | `gpt-4.1-mini` turns the request into 3 to 8 search keywords, then BM25 ranks. The model sees only the list of connected server names, not the tool names. |
| LLM rewrite + hybrid | `rewrite.mjs` | The same rewritten query, ranked by the hybrid. |

## How to run

```bash
npm run bench:tool-search                     # all rankers, needs OPENAI_API_KEY
node bench/tool-search/run.mjs --offline      # lexical rankers only, no API calls
node bench/tool-search/scripts/fetch-catalogue.mjs [serverId ...]   # refetch tools (BENCH_TMP sets the npm cache dir)
node bench/tool-search/scripts/build-catalogue.mjs
```

The refetch runs third-party packages with your filesystem and network access. Each package is pinned to the version the committed catalogue came from; review a release before bumping its pin, and run the refetch in a throwaway container.

OpenAI responses are cached in `cache/`, which is gitignored, so a rerun costs nothing. `run.mjs` writes `results.json` with the top 5 for every query and prints the table and the estimated spend. It stops if spend passes $5.

## Results (2026-10-30)

| Ranker | R@1 | R@3 | R@5 | MRR | Lexical R@1 / R@5 / MRR | Paraphrase R@1 / R@5 / MRR | Ambiguous R@1 / R@5 / MRR |
|---|---|---|---|---|---|---|---|
| keyword (substring) | 0.40 | 0.59 | 0.64 | 0.51 | 0.83 / 1.00 / 0.91 | 0.10 / 0.23 / 0.18 | 0.29 / 0.73 / 0.46 |
| regex over name | 0.52 | 0.58 | 0.63 | 0.57 | 0.96 / 1.00 / 0.97 | 0.02 / 0.12 / 0.08 | 0.63 / 0.81 / 0.70 |
| BM25 | 0.54 | 0.63 | 0.68 | 0.61 | 0.94 / 1.00 / 0.96 | 0.17 / 0.31 / 0.24 | 0.54 / 0.77 / 0.66 |
| BM25, name x3 | 0.54 | 0.64 | 0.68 | 0.61 | 0.94 / 1.00 / 0.97 | 0.15 / 0.31 / 0.23 | 0.56 / 0.77 / 0.66 |
| embeddings (3-small) | 0.76 | 0.86 | 0.91 | 0.82 | 1.00 / 1.00 / 1.00 | 0.54 / 0.83 / 0.67 | 0.75 / 0.92 / 0.82 |
| hybrid RRF (BM25 + emb) | 0.64 | 0.76 | 0.80 | 0.72 | 0.96 / 1.00 / 0.98 | 0.27 / 0.56 / 0.40 | 0.71 / 0.85 / 0.79 |
| LLM rewrite + BM25 | 0.72 | 0.84 | 0.88 | 0.79 | 0.92 / 1.00 / 0.95 | 0.56 / 0.75 / 0.64 | 0.71 / 0.90 / 0.80 |
| LLM rewrite + hybrid | 0.74 | 0.89 | 0.92 | 0.82 | 0.94 / 1.00 / 0.97 | 0.50 / 0.87 / 0.66 | 0.79 / 0.90 / 0.85 |

The first full run cost an estimated $0.013: $0.0008 for 41k embedding tokens and $0.012 for 25k input and 1k output tokens of `gpt-4.1-mini`. A rerun after the dash normalisation below re-embedded 4.6k tokens ($0.0001) and gave the same table.

Upstream descriptions that contained em or en dashes are stored with plain hyphens (`noDash` in `scripts/fetch-catalogue.mjs`). The tokenizers treat both as separators.

## Finding

BM25 is weak only when the words in the query differ from the words in the tool. On lexical queries BM25 reaches recall@1 of 0.94 and recall@5 of 1.00, close to embeddings at 1.00 for both. On paraphrased queries, raw BM25 finds a correct tool in the top 5 for 31% of queries and embeddings find one for 83%, which moves overall MRR from 0.61 to 0.82. That gap mostly disappears when a model writes the search query first: `gpt-4.1-mini` keywords followed by plain BM25 reach an MRR of 0.79 and a recall@5 of 0.88. Codex and Claude Code work this way, since the agent, not the user, types the tool_search query. Fusing BM25 with embeddings through RRF did worse than embeddings alone (MRR 0.72 against 0.82), because on paraphrases BM25 adds confident wrong answers. Boosting the name field changed nothing. For an agent client, BM25 behind a model-written query is within a few points of embeddings at this catalogue size. For search on the raw user text, embeddings are clearly better.

## What the clients do (sources opened on 2026-10-30)

**Codex.** Codex uses BM25 through the `bm25` crate 2.3.2, built with `EmbedderBuilder::with_fit_to_corpus(Language::English, ...)`, which gives English tokenizing, stemming and stop words.
- There is no score threshold. `TOOL_SEARCH_DEFAULT_LIMIT` is 8.
- The indexed text has five parts:
  - the tool name
  - the name with underscores replaced by spaces
  - the description
  - the schema property names and their descriptions, collected recursively through `items` and `anyOf`
  - for a namespace, its name and description

Source files (commit 2ebf42f, 2026-10-27):
- https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/tool_search.rs
- https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_search.rs
- https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_discovery.rs
- https://github.com/openai/codex/blob/main/codex-rs/Cargo.toml

**VS Code (Copilot Chat).** VS Code embeds `name + "\n\n" + description` and ranks tools by cosine similarity against the query embedding.
- The model is `EMBEDDING_TYPE_FOR_TOOL_GROUPING = metis-1024-I16-Binary`. Users who are not signed in get `text-embedding-3-small-512` instead.
- The search tool returns 5 results by default (`DEFAULT_SEARCH_LIMIT`).
- Grouping matches 10 tools (`NUM_EMBED_MATCHED_TOOLS`) and starts at 64 tools (`HARD_TOOL_LIMIT / 2`).
- The old `microsoft/vscode-copilot-chat` repo is archived, and this code now lives in `microsoft/vscode` under `extensions/copilot`.

Source files (commit 472dff4, 2026-10-13):
- https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/extension/tools/common/virtualTools/toolEmbeddingsComputer.ts
- https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/extension/tools/common/virtualTools/preComputedToolEmbeddingsCache.ts
- https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/extension/tools/common/virtualTools/virtualToolsConstants.ts
- https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/extension/tools/node/toolSearchTool.ts
- https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/platform/embeddings/common/embeddingsComputer.ts

**Anthropic API.** The API offers two search tools:
- `tool_search_tool_regex_20251119` takes a Python `re.search` pattern, case-insensitive, of at most 200 characters.
- `tool_search_tool_bm25_20251119` takes a natural-language query of at most 500 characters.

Both search tool names, descriptions, argument names and argument descriptions. They return 5 results by default, and up to 10,000 tools can be deferred. A custom search, such as one based on embeddings, can return `tool_reference` blocks.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool

**Claude Code.** The docs say: "Tool search is enabled by default: MCP tools are deferred and discovered on demand." `ENABLE_TOOL_SEARCH` takes these values:
- `auto` loads tools upfront until their definitions pass 10% of the context window.
- `auto:N` sets a custom percentage.
- `false` always loads tools upfront.

The docs do not say which ranking Claude Code uses, regex or BM25.
- https://code.claude.com/docs/en/mcp

**Not verified here:** Cursor exposing tools as files, and the keyword search used by other clients. No source was opened for either.

## Limitations

- **Small catalogue.** 453 tools from 28 servers that list tools without credentials. That excludes most hosted SaaS servers, and the gap between BM25 and embeddings may grow with thousands of tools. These servers were skipped:
  - official GitLab, which needs a token to list tools
  - redis, which needs a live server
  - gdrive, which needs credentials
  - stripe, which validates its key remotely and timed out
  - kubernetes and browserbase, which are missing the `hono`/`ws` dependency
  - `mcp-atlassian`, which is missing `jsdom`
  - `@elastic/mcp-server-elasticsearch`, which is missing `zod`
- **One author.** One person wrote the queries and gold sets, and some paraphrases still contain a product name. Gold sets for ambiguous queries are a judgement call.
- **Recall is a hit rate.** It counts any one gold tool, not the share of the gold set found.
- **One embedding model.** It is not VS Code's `metis` model, and its input includes parameter names, which VS Code does not use.
- **Our BM25 is not Codex's crate.** It is a reimplementation, and its tokenizer differs in detail.
- **The rewrite step is one model with one prompt.** A frontier agent model would probably write better queries.
- **Untuned fusion.** RRF used equal weights with k = 60.
