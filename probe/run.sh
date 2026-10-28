#!/usr/bin/env bash
# Install each CLI at its npm latest, point it at server.cjs, and record the handshake it sends.
# Writes probe/results.json. Each client runs with its own empty HOME, so no local config leaks in.
# Some clients send the handshake before they check credentials, others need a signed-in account or API key in the environment.
# Each client's output goes to $PROBE_OUT/<client>.out (default: a temp dir that is printed at the end).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
OUT=${PROBE_OUT:-$WORK/out}
mkdir -p "$OUT"
export PROBE_LOG="$WORK/probe.log"
export SRV="$HERE/server.cjs"
T=${PROBE_TIMEOUT:-90}

npm install --prefix "$HERE" --no-audit --no-fund --silent
PKGS=(@anthropic-ai/claude-code @github/copilot @openai/codex @google/gemini-cli opencode-ai @factory/cli)
npm install --prefix "$WORK/clients" --no-audit --no-fund --silent $(printf '%s@latest ' "${PKGS[@]}")
BIN="$WORK/clients/node_modules/.bin"

# Fail early if the probe server itself cannot start
node -e "require.resolve('@modelcontextprotocol/server/stdio', { paths: [process.argv[1]] })" "$HERE"

home() { local h="$WORK/home-$1"; mkdir -p "$h"; echo "$h"; }
# Print a JSON string for the server path, so a path with quotes or backslashes cannot break a config file
srv_json() { node -e 'process.stdout.write(JSON.stringify(process.env.SRV))'; }
# Run one client; a failing or timed-out client does not stop the others
run() { local name=$1; shift; "$@" < /dev/null > "$OUT/$name.out" 2>&1 || echo "$name exited $?" >> "$OUT/$name.out"; }
S=$(srv_json)
L=$(node -e 'process.stdout.write(JSON.stringify(process.env.PROBE_LOG))')

# Claude Code
H=$(home claude); echo "{\"mcpServers\":{\"probe\":{\"command\":\"node\",\"args\":[$S,\"@anthropic-ai/claude-code\"]}}}" > "$H/m.json"
run claude env HOME="$H" timeout "$T" "$BIN/claude" -p --mcp-config "$H/m.json" --strict-mcp-config "reply hi"

# Copilot CLI
H=$(home copilot); echo "{\"mcpServers\":{\"probe\":{\"type\":\"local\",\"command\":\"node\",\"args\":[$S,\"@github/copilot\"],\"tools\":[\"*\"]}}}" > "$H/m.json"
run copilot env HOME="$H" timeout "$T" "$BIN/copilot" -p "reply hi" --additional-mcp-config "@$H/m.json" --allow-all-tools

# Codex (a JSON string is also a valid TOML string). Codex does not pass its environment to MCP servers, so the log path goes in the server config
H=$(home codex); mkdir -p "$H/.codex"
run codex env HOME="$H" CODEX_HOME="$H/.codex" timeout "$T" "$BIN/codex" exec --skip-git-repo-check \
  -c 'mcp_servers.probe.command="node"' -c "mcp_servers.probe.args=[$S,\"@openai/codex\"]" -c "mcp_servers.probe.env.PROBE_LOG=$L" "reply hi"

# Gemini CLI
H=$(home gemini); mkdir -p "$H/.gemini"
echo "{\"mcpServers\":{\"probe\":{\"command\":\"node\",\"args\":[$S,\"@google/gemini-cli\"]}}}" > "$H/.gemini/settings.json"
# Gemini disables MCP servers in untrusted folders, so trust the empty home it runs in
H="$H" node -e 'process.stdout.write(JSON.stringify({ [process.env.H]: "TRUST_FOLDER" }))' > "$H/.gemini/trustedFolders.json"
(cd "$H" && run gemini env HOME="$H" GEMINI_CLI_TRUSTED_FOLDERS_PATH="$H/.gemini/trustedFolders.json" timeout "$T" "$BIN/gemini" mcp list)

# opencode
H=$(home opencode); mkdir -p "$H/.config/opencode"
echo "{\"mcp\":{\"probe\":{\"type\":\"local\",\"command\":[\"node\",$S,\"opencode-ai\"],\"enabled\":true}}}" > "$H/.config/opencode/opencode.json"
(cd "$H" && run opencode env HOME="$H" XDG_CONFIG_HOME="$H/.config" XDG_DATA_HOME="$H/.local/share" timeout "$T" "$BIN/opencode" mcp list)

# Droid
H=$(home droid)
run droid-add env HOME="$H" timeout "$T" "$BIN/droid" mcp add probe node "$SRV" @factory/cli
run droid env HOME="$H" timeout "$T" "$BIN/droid" exec "reply hi"

node "$HERE/report.mjs" "$PROBE_LOG" "$WORK/clients" "$HERE/results.json"
echo "client output: $OUT"
