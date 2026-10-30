// Safety checks for the OpenAI client: no request goes out at the spend cap, and an error
// body that echoes the key never reaches the thrown message. fetch is mocked; nothing is billed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const FAKE_KEY = 'sk-test-0123456789abcdefghij';
process.env.OPENAI_API_KEY = FAKE_KEY;
const { chat, setSpendCap } = await import('./openai.mjs');

function mockFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(url); return respond(url, init); };
  return calls;
}

test('error message carries no part of the key, even JSON-escaped', async () => {
  setSpendCap(Infinity);
  const escaped = FAKE_KEY.replace(/-/g, '\\u002d');
  mockFetch(() => new Response(`{"error":{"message":"bad key ${escaped} ${FAKE_KEY}","type":"invalid_request_error","code":"invalid_api_key"}}`, { status: 401 }));
  const err = await chat([{ role: 'user', content: randomUUID() }]).catch((e) => e);
  assert.match(err.message, /401 invalid_request_error invalid_api_key/);
  assert.ok(!err.message.includes('0123456789abcdefghij'));
  assert.ok(!err.message.includes('u002d'));
});

test('no request is sent once spend reaches the cap', async () => {
  setSpendCap(0);
  const calls = mockFetch(() => { throw new Error('fetch must not be called'); });
  await assert.rejects(chat([{ role: 'user', content: randomUUID() }]), /spend cap of \$0 reached/);
  assert.equal(calls.length, 0);
});
