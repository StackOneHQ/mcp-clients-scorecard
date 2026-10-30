// Regex over the tool name, a proxy for the regex variant of tool search where the model
// writes a pattern such as "issue|ticket". The pattern here is the alternation of the query
// words, matched case-insensitively against the server-qualified name only. Score = number of
// distinct alternatives that match; ties are broken by the same count over the description.
import { qualifiedName, splitWords, STOPWORDS } from '../lib/text.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function rank(query, catalogue) {
  const words = [...new Set(splitWords(query).filter((w) => !STOPWORDS.has(w)))];
  const res = words.map((w) => new RegExp(esc(w), 'i'));
  return catalogue
    .map((t, i) => {
      const name = qualifiedName(t);
      return { id: t.id, i, s: res.filter((r) => r.test(name)).length, d: res.filter((r) => r.test(t.description)).length };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.d - a.d || a.i - b.i)
    .map((x) => x.id);
}
