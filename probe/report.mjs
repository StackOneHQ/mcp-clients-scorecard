// Turn the probe log into probe/results.json: per package, the installed version, the versions it asked for,
// the version the server agreed, the capabilities the client declared and whether it relisted tools on a change. Exits 1 when no client completed a handshake, since that means the probe broke.
import fs from 'node:fs';

const [logFile, prefix, out] = process.argv.slice(2);
if (!fs.existsSync(logFile)) {
  console.error(`No probe log at ${logFile}: the server never started or no client launched it.`);
  process.exit(1);
}
const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const pkgs = ['@anthropic-ai/claude-code', '@github/copilot', '@openai/codex', '@google/gemini-cli', 'opencode-ai', '@factory/cli'];
// What a declared capabilities object means for the scorecard columns
const EXT_TASKS = 'io.modelcontextprotocol/tasks';
const EXT_UI = 'io.modelcontextprotocol/ui';
const has = v => v !== undefined && v !== null;
const derive = c => {
  const caps = c || {};
  const e = caps.elicitation;
  return {
    // A bare elicitation: {} is the pre-mode way of declaring form support
    elicitation_form: has(e) && (has(e.form) || !has(e.url)),
    elicitation_url: has(e) && has(e.url),
    // Tasks sit in capabilities.tasks (2025-11-25) or in the io.modelcontextprotocol/tasks extension (2026-07-28)
    tasks: has(caps.tasks) || has(caps.extensions?.[EXT_TASKS]) || has(caps.experimental?.tasks),
    apps: has(caps.extensions?.[EXT_UI]),
    roots: has(caps.roots),
    sampling: has(caps.sampling),
  };
};
const results = {};
for (const pkg of pkgs) {
  const pj = `${prefix}/node_modules/${pkg}/package.json`;
  const version = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')).version : null;
  const mine = lines.filter(l => l.label === pkg);
  const requested = [];
  let clientInfo = null;
  for (const m of mine.filter(l => l.method)) {
    const p = m.params || {};
    const v = p.protocolVersion || p._meta?.['io.modelcontextprotocol/protocolVersion'];
    if (v && !requested.includes(v)) requested.push(v);
    clientInfo ||= p.clientInfo || p._meta?.['io.modelcontextprotocol/clientInfo'] || null;
  }
  // initialize replies with the agreed version; server/discover replies with a list, which only agrees if it holds a requested version
  const reply = mine.filter(l => l.reply).at(-1)?.reply ?? null;
  const negotiated = Array.isArray(reply) ? reply.find(v => requested.includes(v)) ?? null : requested.includes(reply) ? reply : null;
  // A client that sends notifications/initialized after the server offers an older version accepted the downgrade:
  // it connects, but on the server's version, not the newest it supports
  const replyAt = mine.findLastIndex(l => l.reply);
  const accepted = !negotiated && typeof reply === 'string' && mine.slice(replyAt + 1).some(l => l.method === 'notifications/initialized') ? reply : null;
  // The first request that carried capabilities: params.capabilities on initialize, _meta on the 2026-07-28 path
  const capabilities = mine.find(l => l.method && l.capabilities)?.capabilities ?? null;
  const errors = mine.filter(l => l.error).map(l => l.error.message);
  // Below 2026-07-28 every client gets the change notice; from it, only one with an opted-in subscriptions/listen stream
  const notifiedAt = mine.findIndex(l => l.sent === 'notifications/tools/list_changed');
  const live_tools = {
    listened: negotiated !== null && negotiated >= '2026-07-28' ? mine.some(l => l.method === 'subscriptions/listen' && l.params?.notifications?.toolsListChanged === true) : null,
    notified: notifiedAt >= 0,
    relisted: notifiedAt >= 0 && mine.slice(notifiedAt + 1).some(l => l.method === 'tools/list'),
  };
  results[pkg] = { version, handshake: mine.find(l => l.method)?.method || null, requested, negotiated, accepted_downgrade: accepted, errors, client_info: clientInfo, capabilities, declares: derive(capabilities), live_tools, connected: negotiated !== null || accepted !== null };
  const declares = Object.entries(results[pkg].declares).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
  console.log(pkg.padEnd(28), String(version).padEnd(10), negotiated ? `agreed ${negotiated} (asked ${requested.join(', ')})` : accepted ? `asked ${requested.join(', ')}, accepted the server's ${accepted}` : requested.length ? `asked ${requested.join(', ')}, no agreement: ${errors[0] || 'no reply'}` : 'no handshake', `| declares: ${declares}`, `| relisted tools: ${live_tools.relisted ? 'yes' : 'no'}`);
}
fs.writeFileSync(out, JSON.stringify({ as_of: new Date().toISOString().slice(0, 10), results }, null, 2) + '\n');
if (!Object.values(results).some(r => r.connected)) {
  console.error('No client completed a handshake. Check the per-client output before trusting these results.');
  process.exit(1);
}
