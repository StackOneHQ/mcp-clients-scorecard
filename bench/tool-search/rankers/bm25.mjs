// Okapi BM25 (k1 = 1.2, b = 0.75) over name words + description + param names, with
// English stop words and Porter stemming. `nameBoost` repeats the name tokens that many
// times in the document, a simple way to weight the name field higher.
import { tokenize, toolFields } from '../lib/text.mjs';

const indexes = new Map();

function buildIndex(catalogue, { nameBoost, stem }) {
  const docs = catalogue.map((t) => {
    const f = toolFields(t);
    const name = tokenize(f.name, { stem });
    const toks = [...Array(nameBoost).fill(name).flat(), ...tokenize(f.description, { stem }), ...tokenize(f.params, { stem })];
    const tf = new Map();
    for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
    return { id: t.id, tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / docs.length;
  return { docs, df, avgdl, N: docs.length };
}

export function scores(query, catalogue, { k1 = 1.2, b = 0.75, nameBoost = 1, stem = true } = {}) {
  const key = `${nameBoost}:${stem}`;
  let byCat = indexes.get(catalogue);
  if (!byCat) indexes.set(catalogue, (byCat = new Map()));
  if (!byCat.has(key)) byCat.set(key, buildIndex(catalogue, { nameBoost, stem }));
  const { docs, df, avgdl, N } = byCat.get(key);
  const q = [...new Set(tokenize(query, { stem }))];
  return docs.map((d) => {
    let s = 0;
    for (const w of q) {
      const f = d.tf.get(w);
      if (!f) continue;
      const n = df.get(w);
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgdl));
    }
    return { id: d.id, s };
  });
}

export function rank(query, catalogue, opts) {
  return scores(query, catalogue, opts).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.id);
}

export const rankBoosted = (query, catalogue) => rank(query, catalogue, { nameBoost: 3 });
