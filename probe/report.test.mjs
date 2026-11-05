// npm test: the handshake report on synthetic probe logs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const report = lines => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
  fs.writeFileSync(path.join(dir, 'log.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  execFileSync('node', [new URL('report.mjs', import.meta.url).pathname, path.join(dir, 'log.jsonl'), dir, path.join(dir, 'out.json')], { stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')).results;
};

test('a client that gets the version it asked for has negotiated it', () => {
  const r = report([{ label: '@openai/codex', method: 'initialize', params: { protocolVersion: '2025-11-25' } }, { label: '@openai/codex', reply: '2025-11-25' }]);
  assert.equal(r['@openai/codex'].negotiated, '2025-11-25');
  assert.equal(r['@openai/codex'].accepted_downgrade, null);
});

test('a client that carries on after an older version is offered accepted the downgrade', () => {
  const r = report([
    { label: '@openai/codex', method: 'initialize', params: { protocolVersion: '2026-07-28' } },
    { label: '@openai/codex', reply: '2025-11-25' },
    { label: '@openai/codex', method: 'notifications/initialized' },
  ]);
  assert.equal(r['@openai/codex'].negotiated, null);
  assert.equal(r['@openai/codex'].accepted_downgrade, '2025-11-25');
  assert.equal(r['@openai/codex'].connected, true);
});

test('a client that retries initialize after an older version is offered did not accept it', () => {
  const r = report([
    { label: '@openai/codex', method: 'initialize', params: { protocolVersion: '2026-07-28' } },
    { label: '@openai/codex', reply: '2025-11-25' },
    { label: '@openai/codex', method: 'initialize', params: { protocolVersion: '2026-07-28' } },
    { label: '@factory/cli', method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { label: '@factory/cli', reply: '2025-11-25' },
  ]);
  assert.equal(r['@openai/codex'].accepted_downgrade, null);
  assert.equal(r['@openai/codex'].connected, false);
});

test('a client that stops after an older version is offered did not connect', () => {
  const lines = [
    { label: '@openai/codex', method: 'initialize', params: { protocolVersion: '2026-07-28' } },
    { label: '@openai/codex', reply: '2025-11-25' },
    { label: '@factory/cli', method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { label: '@factory/cli', reply: '2025-11-25' },
  ];
  const r = report(lines);
  assert.equal(r['@openai/codex'].connected, false);
  assert.equal(r['@openai/codex'].accepted_downgrade, null);
});

// The report exits 1 unless some client connected, so each log carries a matching reply
const initialize = (label, capabilities) => [{ label, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities }, capabilities }, { label, reply: '2025-11-25' }];
const declares = capabilities => report(initialize('@openai/codex', capabilities))['@openai/codex'].declares;
const none = { elicitation_form: false, elicitation_url: false, tasks: false, apps: false, roots: false, sampling: false };

test('a client that declares nothing declares none of the features', () => {
  assert.deepEqual(declares({}), none);
  const r = report([{ label: '@openai/codex', method: 'initialize', params: { protocolVersion: '2025-11-25' } }, { label: '@openai/codex', reply: '2025-11-25' }]);
  assert.equal(r['@openai/codex'].capabilities, null);
  assert.deepEqual(r['@openai/codex'].declares, none);
});

test('a bare elicitation capability counts as form mode only', () => {
  assert.deepEqual(declares({ elicitation: {} }), { ...none, elicitation_form: true });
});

test('elicitation modes are read one by one', () => {
  assert.deepEqual(declares({ elicitation: { form: {}, url: {} } }), { ...none, elicitation_form: true, elicitation_url: true });
  assert.deepEqual(declares({ elicitation: { url: {} } }), { ...none, elicitation_url: true });
});

test('tasks count from the capability, the extension or experimental', () => {
  assert.equal(declares({ tasks: { requests: {} } }).tasks, true);
  assert.equal(declares({ extensions: { 'io.modelcontextprotocol/tasks': {} } }).tasks, true);
  assert.equal(declares({ experimental: { tasks: {} } }).tasks, true);
  assert.equal(declares({ extensions: { 'io.modelcontextprotocol/ui': {} } }).tasks, false);
});

test('MCP Apps, roots and sampling come from their own keys', () => {
  const d = declares({ roots: { listChanged: true }, sampling: {}, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } });
  assert.deepEqual(d, { ...none, apps: true, roots: true, sampling: true });
});

test('capabilities in the 2026-07-28 request _meta are recorded from the first request that has them', () => {
  const capabilities = { elicitation: { form: {} }, extensions: { 'io.modelcontextprotocol/tasks': {} } };
  const r = report([
    { label: '@anthropic-ai/claude-code', method: 'server/discover', params: {} },
    { label: '@anthropic-ai/claude-code', method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': capabilities } }, capabilities },
    { label: '@anthropic-ai/claude-code', reply: ['2026-07-28'] },
  ]);
  assert.deepEqual(r['@anthropic-ai/claude-code'].capabilities, capabilities);
  assert.deepEqual(r['@anthropic-ai/claude-code'].declares, { ...none, elicitation_form: true, tasks: true });
});

const MODERN = { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } };
const liveTools = lines => report(lines)['@openai/codex'].live_tools;

test('a 2025 client that lists tools again after the change notification relisted', () => {
  const sent = { label: '@openai/codex', sent: 'notifications/tools/list_changed' };
  const list = { label: '@openai/codex', method: 'tools/list' };
  assert.deepEqual(liveTools([...initialize('@openai/codex', {}), list, sent, list]), { listened: null, notified: true, relisted: true });
  assert.deepEqual(liveTools([...initialize('@openai/codex', {}), list, sent]), { listened: null, notified: true, relisted: false });
});

test('a 2026-07-28 client relists only through a listen stream that asks for tool changes', () => {
  const discover = [{ label: '@openai/codex', method: 'server/discover', params: MODERN }, { label: '@openai/codex', reply: ['2026-07-28'] }];
  const list = { label: '@openai/codex', method: 'tools/list', params: MODERN };
  assert.deepEqual(liveTools([...discover, list]), { listened: false, notified: false, relisted: false });
  const listen = { label: '@openai/codex', method: 'subscriptions/listen', params: { ...MODERN, notifications: { toolsListChanged: true } } };
  const sent = { label: '@openai/codex', sent: 'notifications/tools/list_changed' };
  assert.deepEqual(liveTools([...discover, list, listen, sent, list]), { listened: true, notified: true, relisted: true });
});

test('a listen stream that does not ask for tool changes does not count, and neither does a paginated list', () => {
  const discover = [{ label: '@openai/codex', method: 'server/discover', params: MODERN }, { label: '@openai/codex', reply: ['2026-07-28'] }];
  const listen = { label: '@openai/codex', method: 'subscriptions/listen', params: { ...MODERN, notifications: { resourcesListChanged: true } } };
  const sent = { label: '@openai/codex', sent: 'notifications/tools/list_changed' };
  const page = { label: '@openai/codex', method: 'tools/list', params: { ...MODERN, cursor: 'next' } };
  assert.deepEqual(liveTools([...discover, listen, sent, page]), { listened: false, notified: true, relisted: false });
});

test('a tool list from a restarted server process is not a relist', () => {
  const sent = { label: '@openai/codex', pid: 1, sent: 'notifications/tools/list_changed' };
  const list = pid => ({ label: '@openai/codex', pid, method: 'tools/list' });
  assert.deepEqual(liveTools([...initialize('@openai/codex', {}), list(1), sent, list(2)]), { listened: null, notified: true, relisted: false });
  assert.deepEqual(liveTools([...initialize('@openai/codex', {}), list(1), sent, list(1)]), { listened: null, notified: true, relisted: true });
});
