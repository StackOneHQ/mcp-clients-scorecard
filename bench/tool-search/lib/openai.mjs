// Small OpenAI client with an on-disk cache. Reads OPENAI_API_KEY from the environment and
// never prints it. Tracks token usage so run.mjs can report estimated spend.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'cache');
mkdirSync(cacheDir, { recursive: true });

// USD per 1M tokens (OpenAI list prices).
export const PRICES = {
  'text-embedding-3-small': { input: 0.02 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};
// run.mjs sets this; post() refuses any billable request once spend reaches it.
export let spendCap = Infinity;
export function setSpendCap(usd) { spendCap = usd; }

export const usage = {}; // model -> { input, output, cachedCalls, apiCalls }

function track(model, input = 0, output = 0, cached = false) {
  const u = (usage[model] ||= { input: 0, output: 0, cachedCalls: 0, apiCalls: 0 });
  if (cached) { u.cachedCalls++; return; }
  u.apiCalls++; u.input += input; u.output += output;
}

export function spend() {
  let total = 0;
  const rows = Object.entries(usage).map(([model, u]) => {
    const p = PRICES[model] || { input: 0, output: 0 };
    const usd = (u.input * (p.input || 0) + u.output * (p.output || 0)) / 1e6;
    total += usd;
    return { model, ...u, usd };
  });
  return { rows, total };
}

async function post(path, body) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  if (spend().total >= spendCap) throw new Error(`spend cap of $${spendCap} reached`);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    // Error bodies can echo request details, including the key in escaped form, so report only
    // the error type and code, never the free-text message.
    let detail = '';
    try { const e = JSON.parse(await res.text()).error || {}; detail = [e.type, e.code].filter((x) => typeof x === 'string' && /^[a-z_]{1,64}$/.test(x)).join(' '); } catch {}
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`OpenAI ${path} ${res.status} ${detail}`.trim());
  }
}

function cachePath(kind, model, text) {
  return join(cacheDir, `${kind}-${model}-${createHash('sha256').update(text).digest('hex').slice(0, 24)}.json`);
}

// Embed many texts, batching uncached ones. Returns unit-normalised Float64 vectors.
export async function embed(texts, model = 'text-embedding-3-small') {
  const out = new Array(texts.length);
  const missing = [];
  texts.forEach((t, i) => {
    const p = cachePath('emb', model, t);
    if (existsSync(p)) { out[i] = JSON.parse(readFileSync(p, 'utf8')); track(model, 0, 0, true); }
    else missing.push(i);
  });
  for (let s = 0; s < missing.length; s += 100) {
    const idx = missing.slice(s, s + 100);
    const r = await post('embeddings', { model, input: idx.map((i) => texts[i]) });
    track(model, r.usage?.prompt_tokens || 0);
    r.data.forEach((d, j) => {
      const i = idx[j];
      out[i] = d.embedding;
      writeFileSync(cachePath('emb', model, texts[i]), JSON.stringify(d.embedding));
    });
  }
  return out.map(normalise);
}

function normalise(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export async function chat(messages, model = 'gpt-4.1-mini') {
  const key = JSON.stringify({ model, messages });
  const p = cachePath('chat', model, key);
  if (existsSync(p)) { track(model, 0, 0, true); return JSON.parse(readFileSync(p, 'utf8')); }
  const r = await post('chat/completions', { model, messages, temperature: 0, max_tokens: 60 });
  track(model, r.usage?.prompt_tokens || 0, r.usage?.completion_tokens || 0);
  // content is null on a refusal; an empty query then ranks nothing rather than aborting the run.
  const text = (r.choices[0].message.content ?? '').trim();
  writeFileSync(p, JSON.stringify(text));
  return text;
}
