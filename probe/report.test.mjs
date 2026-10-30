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
