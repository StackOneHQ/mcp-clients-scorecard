// Tool-search ranking benchmark. Runs every ranker over data/queries.json against
// data/catalogue.json, scores recall@1/3/5 and MRR per bucket and overall, writes
// results.json and prints a markdown table plus estimated OpenAI spend.
// Usage: node bench/tool-search/run.mjs [--offline]   (--offline skips rankers that call OpenAI)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as keyword from './rankers/keyword.mjs';
import * as regexName from './rankers/regex-name.mjs';
import * as bm25 from './rankers/bm25.mjs';
import * as embeddings from './rankers/embeddings.mjs';
import * as hybrid from './rankers/hybrid.mjs';
import * as rewrite from './rankers/rewrite.mjs';
import { setSpendCap, spend } from './lib/openai.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalogue = JSON.parse(readFileSync(join(here, 'data', 'catalogue.json'), 'utf8'));
const queries = JSON.parse(readFileSync(join(here, 'data', 'queries.json'), 'utf8'));
const offline = process.argv.includes('--offline') || !process.env.OPENAI_API_KEY;
const SPEND_CAP_USD = 5;
setSpendCap(SPEND_CAP_USD);

const ids = new Set(catalogue.map((t) => t.id));
for (const q of queries) for (const g of q.gold) if (!ids.has(g)) throw new Error(`query ${q.id}: unknown gold id ${g}`);

const RANKERS = [
  { name: 'keyword (substring)', rank: keyword.rank },
  { name: 'regex over name', rank: regexName.rank },
  { name: 'BM25', rank: (q, c) => bm25.rank(q, c) },
  { name: 'BM25, name x3', rank: bm25.rankBoosted },
  { name: 'embeddings (3-small)', rank: embeddings.rank, online: true, prepare: () => embeddings.prepare(catalogue, queries.map((q) => q.query)) },
  { name: 'hybrid RRF (BM25 + emb)', rank: hybrid.rank, online: true },
  { name: 'LLM rewrite + BM25', rank: rewrite.rankBm25, online: true },
  { name: 'LLM rewrite + hybrid', rank: rewrite.rankHybrid, online: true },
];

const BUCKETS = ['lexical', 'paraphrase', 'ambiguous'];
const KS = [1, 3, 5];

function score(list, gold) {
  const g = new Set(gold);
  const first = list.findIndex((id) => g.has(id));
  const r = { mrr: first < 0 ? 0 : 1 / (first + 1) };
  for (const k of KS) r[`r@${k}`] = first >= 0 && first < k ? 1 : 0;
  return r;
}

function aggregate(rows) {
  const out = { n: rows.length };
  for (const m of ['r@1', 'r@3', 'r@5', 'mrr']) out[m] = rows.reduce((s, r) => s + r[m], 0) / (rows.length || 1);
  return out;
}

const results = { date: '2026-10-30', catalogue: { tools: catalogue.length, servers: new Set(catalogue.map((t) => t.server)).size }, queries: queries.length, rankers: [] };

for (const R of RANKERS) {
  if (R.online && offline) { console.error(`skip ${R.name} (no OPENAI_API_KEY or --offline)`); continue; }
  if (spend().total > SPEND_CAP_USD) throw new Error('spend cap reached');
  if (R.prepare) await R.prepare();
  const per = [];
  for (const q of queries) {
    const list = (await R.rank(q.query, catalogue)).slice(0, 50);
    per.push({ id: q.id, bucket: q.bucket, top5: list.slice(0, 5), ...score(list, q.gold) });
  }
  const summary = { overall: aggregate(per) };
  for (const b of BUCKETS) summary[b] = aggregate(per.filter((p) => p.bucket === b));
  results.rankers.push({ name: R.name, summary, perQuery: per });
}

const s = spend();
results.spend = s;
// An offline run has no embeddings or rewrite rows, so it must not replace the committed results.
writeFileSync(join(here, offline ? 'results-offline.json' : 'results.json'), JSON.stringify(results, null, 1) + '\n');

const f = (x) => x.toFixed(2);
const lines = [];
lines.push(`Catalogue: ${results.catalogue.tools} tools from ${results.catalogue.servers} servers. Queries: ${queries.length} (${BUCKETS.map((b) => `${b} ${queries.filter((q) => q.bucket === b).length}`).join(', ')}).`, '');
lines.push('| Ranker | R@1 | R@3 | R@5 | MRR | Lexical R@1 / R@5 / MRR | Paraphrase R@1 / R@5 / MRR | Ambiguous R@1 / R@5 / MRR |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const r of results.rankers) {
  const o = r.summary.overall;
  const b = (k) => `${f(r.summary[k]['r@1'])} / ${f(r.summary[k]['r@5'])} / ${f(r.summary[k].mrr)}`;
  lines.push(`| ${r.name} | ${f(o['r@1'])} | ${f(o['r@3'])} | ${f(o['r@5'])} | ${f(o.mrr)} | ${b('lexical')} | ${b('paraphrase')} | ${b('ambiguous')} |`);
}
lines.push('', 'Estimated OpenAI spend this run (cached calls cost nothing):');
for (const r of s.rows) lines.push(`- ${r.model}: ${r.apiCalls} API calls, ${r.cachedCalls} cache hits, ${r.input} input + ${r.output} output tokens, $${r.usd.toFixed(4)}`);
lines.push(`- total: $${s.total.toFixed(4)}`);
console.log(lines.join('\n'));
