// Turn the probe log into probe/results.json: per package, the installed version, the versions it asked for
// and the version the server agreed. Exits 1 when no client completed a handshake, since that means the probe broke.
import fs from 'node:fs';

const [logFile, prefix, out] = process.argv.slice(2);
if (!fs.existsSync(logFile)) {
  console.error(`No probe log at ${logFile}: the server never started or no client launched it.`);
  process.exit(1);
}
const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const pkgs = ['@anthropic-ai/claude-code', '@github/copilot', '@openai/codex', '@google/gemini-cli', 'opencode-ai', '@factory/cli'];
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
  // A reply only counts as agreed when it is a version the client asked for
  const negotiated = Array.isArray(reply) ? reply.find(v => requested.includes(v)) ?? null : requested.includes(reply) ? reply : null;
  // When the server answers initialize with an older version and the client then sends notifications/initialized, the client
  // accepted the downgrade. That connects, but it is the server's version, not the newest the client supports. A retried
  // initialize is not acceptance.
  const replyAt = mine.findLastIndex(l => l.reply);
  const accepted = !negotiated && typeof reply === 'string' && mine.slice(replyAt + 1).some(l => l.method === 'notifications/initialized') ? reply : null;
  const errors = mine.filter(l => l.error).map(l => l.error.message);
  results[pkg] = { version, handshake: mine.find(l => l.method)?.method || null, requested, negotiated, accepted_downgrade: accepted, errors, client_info: clientInfo, connected: negotiated !== null || accepted !== null };
  console.log(pkg.padEnd(28), String(version).padEnd(10), negotiated ? `agreed ${negotiated} (asked ${requested.join(', ')})` : accepted ? `asked ${requested.join(', ')}, accepted the server's ${accepted}` : requested.length ? `asked ${requested.join(', ')}, no agreement: ${errors[0] || 'no reply'}` : 'no handshake');
}
fs.writeFileSync(out, JSON.stringify({ as_of: new Date().toISOString().slice(0, 10), results }, null, 2) + '\n');
if (!Object.values(results).some(r => r.connected)) {
  console.error('No client completed a handshake. Check the per-client output before trusting these results.');
  process.exit(1);
}
