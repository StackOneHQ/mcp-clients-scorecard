// Substring keyword match, the approach of simpler clients: score = number of query words
// (stop words removed, no stemming) found as substrings of the tool's name + description +
// param names. Ties keep catalogue order.
import { splitWords, STOPWORDS, toolFields } from '../lib/text.mjs';

const haystacks = new WeakMap();

export function rank(query, catalogue) {
  if (!haystacks.has(catalogue)) {
    haystacks.set(catalogue, catalogue.map((t) => { const f = toolFields(t); return `${f.name} ${f.description} ${f.params}`.toLowerCase(); }));
  }
  const hay = haystacks.get(catalogue);
  const words = [...new Set(splitWords(query).filter((w) => !STOPWORDS.has(w)))];
  return catalogue
    .map((t, i) => ({ id: t.id, i, s: words.reduce((n, w) => n + (hay[i].includes(w) ? 1 : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.id);
}
