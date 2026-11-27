#!/usr/bin/env bash
# Install each CLI at its latest release (npm, or the vendor's installer manifest for Antigravity CLI), point it at server.cjs, and record the handshake it sends.
# Writes probe/results.json. Each client runs with its own empty HOME, so no local config leaks in.
# Some clients send the handshake before they check credentials, others need a signed-in account or API key in the environment.
# Each client's output goes to $PROBE_OUT/<client>.out (default: a temp dir that is printed at the end).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
OUT=${PROBE_OUT:-$WORK/out}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
export PROBE_LOG="$WORK/probe.log"
export SRV="$HERE/server.cjs"
T=${PROBE_TIMEOUT:-90}

npm install --prefix "$HERE" --no-audit --no-fund --silent
PKGS=(@anthropic-ai/claude-code @github/copilot @openai/codex opencode-ai @factory/cli)
npm install --prefix "$WORK/clients" --no-audit --no-fund --silent $(printf '%s@latest ' "${PKGS[@]}")
BIN="$WORK/clients/node_modules/.bin"

# Antigravity CLI is not on npm: fetch the build its installer (antigravity.google/cli/install.sh) picks, and check its sha512.
# The manifest is kept only after the binary is in place, since report.mjs reads the probed version from it
AGY="$WORK/clients/antigravity-cli"; mkdir -p "$AGY"
agy_install() {
  [ "$(uname -s)-$(uname -m)" = Linux-x86_64 ] || { echo "only the linux x64 build is probed"; return 1; }
  local get=(curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 300)
  "${get[@]}" --url https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json -o "$AGY/manifest.tmp" || return 1
  local url sha
  url=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).url' "$AGY/manifest.tmp") || return 1
  sha=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).sha512' "$AGY/manifest.tmp") || return 1
  [[ "$sha" =~ ^[0-9a-f]{128}$ ]] || { echo "manifest has no valid sha512"; return 1; }
  "${get[@]}" --url "$url" -o "$AGY/agy.tar.gz" || return 1
  echo "$sha  $AGY/agy.tar.gz" | sha512sum -c --quiet || return 1
  tar -xzf "$AGY/agy.tar.gz" -C "$AGY" antigravity || return 1
  mv "$AGY/manifest.tmp" "$AGY/manifest.json"
}
agy_install > "$OUT/antigravity-cli-install.out" 2>&1 || echo "Antigravity CLI not installed, see $OUT/antigravity-cli-install.out" >&2

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

# Antigravity CLI connects its MCP servers before it checks sign-in. It is a closed binary, so it gets an empty environment:
# no API keys from this shell. The log path goes in the server config, as for Codex
if [ -x "$AGY/antigravity" ]; then
  H=$(home agy); mkdir -p "$H/.gemini/config" "$H/ws"
  echo "{\"mcpServers\":{\"probe\":{\"command\":\"node\",\"args\":[$S,\"antigravity-cli\"],\"env\":{\"PROBE_LOG\":$L}}}}" > "$H/.gemini/config/mcp_config.json"
  (cd "$H/ws" && run antigravity-cli env -i PATH="$PATH" HOME="$H" timeout "$T" "$AGY/antigravity" -p "reply hi")
fi

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
