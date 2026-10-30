// Proxy for the regex variant of tool search, where the model writes a pattern such as
// "issue|ticket": score = distinct query words found in the server-qualified name, ties
// broken by the same count over the description. Matching ignores case.
import { qualifiedName, splitWords, STOPWORDS } from '../lib/text.mjs';

export function rank(query, catalogue) {
  const words = [...new Set(splitWords(query).filter((w) => !STOPWORDS.has(w)))];
  const hits = (text) => { const lower = text.toLowerCase(); return words.filter((w) => lower.includes(w)).length; };
  return catalogue
    .map((t, i) => ({ id: t.id, i, s: hits(qualifiedName(t)), d: hits(t.description) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.d - a.d || a.i - b.i)
    .map((x) => x.id);
}
