// Cosine similarity with OpenAI text-embedding-3-small. Tools are embedded as
// "<qualified name>\n\n<description>\n\nParameters: <names>" (VS Code embeds name + "\n\n" +
// description; param names are added here so every ranker sees the same fields).
// Vectors are cached in bench/tool-search/cache/.
import { embed } from '../lib/openai.mjs';
import { qualifiedName } from '../lib/text.mjs';

const MODEL = 'text-embedding-3-small';
const toolVecs = new WeakMap();

export const toolText = (t) => `${qualifiedName(t)}\n\n${t.description.slice(0, 6000)}\n\nParameters: ${t.params.join(', ')}`;

export async function prepare(catalogue, queries) {
  if (!toolVecs.has(catalogue)) toolVecs.set(catalogue, await embed(catalogue.map(toolText), MODEL));
  if (queries?.length) await embed(queries, MODEL);
}

export async function rank(query, catalogue) {
  await prepare(catalogue);
  const vecs = toolVecs.get(catalogue);
  const [q] = await embed([query], MODEL);
  return catalogue
    .map((t, i) => ({ id: t.id, s: vecs[i].reduce((acc, x, j) => acc + x * q[j], 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}
