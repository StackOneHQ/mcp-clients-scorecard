# Live probe

The probe checks which protocol version a CLI really sends, rather than what its docs say. It fills the spec version cell for the CLIs, and the cells whose method is `probe`.

## What it runs

[probe/run.sh](../probe/run.sh) installs each CLI at its npm latest into a temporary directory, gives each one an empty `HOME` so no local config leaks in, and points it at [probe/server.cjs](../probe/server.cjs). The server is a one-tool MCP server built on the official SDK (`@modelcontextprotocol/server`). It answers both the 2026-07-28 `server/discover` handshake and the older `initialize`, and logs every request it receives and the reply it sends to each handshake.

| Client | npm package | How it is started |
| --- | --- | --- |
| Claude Code | `@anthropic-ai/claude-code` | `claude -p` with `--mcp-config` |
| Copilot CLI | `@github/copilot` | `copilot -p` with `--additional-mcp-config` |
| Codex | `@openai/codex` | `codex exec` with the server set through `-c` |
| Gemini CLI | `@google/gemini-cli` | `gemini mcp list` in a trusted folder |
| opencode | `opencode-ai` | `opencode mcp list` |
| Droid | `@factory/cli` | `droid mcp add`, then `droid exec` |

[probe/report.mjs](../probe/report.mjs) turns the log into `probe/results.json`: per package, the installed version, the versions it asked for, and the version the server agreed. It exits 1 when no client completed a handshake. Check the per-client output in `PROBE_OUT` first: a CLI that needs sign-in or failed to install also gives no handshake.

## Reproducing it

```bash
npm run probe
# or, keeping the per-client output:
PROBE_OUT=/tmp/probe-out PROBE_TIMEOUT=120 bash probe/run.sh
```

Some clients send the handshake before they check credentials. Others need a signed-in account or an API key in the environment (for example `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) before they start MCP servers. Each client's output goes to `$PROBE_OUT/<client>.out`.

`probe/results.json` is not committed. Copy the result into the client's `protocol` cell, with the version you probed in `version_checked` and today's date in `checked`.

## Limits

- Only CLIs on npm are probed. Pi, Continue and the apps and IDEs are checked from source and docs.
- The probe sees the handshake. It does not exercise tasks, elicitation or other features, which are checked from source, docs and changelogs.
