// Reciprocal rank fusion (k = 60) of BM25 and embedding rankings.
import { rank as bm25 } from './bm25.mjs';
import { rank as embeddings } from './embeddings.mjs';

function rrf(lists, k = 60) {
  const score = new Map();
  for (const list of lists) list.forEach((id, r) => score.set(id, (score.get(id) || 0) + 1 / (k + r + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export async function rank(query, catalogue) {
  return rrf([bm25(query, catalogue), await embeddings(query, catalogue)]);
}
