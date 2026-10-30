// LLM query rewrite, then rank. In Codex and Claude Code the model writes the search query,
// not the user, so this asks a cheap model (gpt-4.1-mini) to turn the user request into a
// short keyword query. The model sees only the list of connected servers (Codex lists tool
// sources in its tool_search description), not the tool names.
import { chat } from '../lib/openai.mjs';
import { rank as bm25 } from './bm25.mjs';
import { rrf } from './hybrid.mjs';
import { rank as embeddings } from './embeddings.mjs';

const MODEL = 'gpt-4.1-mini';

export async function rewrite(query, catalogue) {
  const servers = [...new Set(catalogue.map((t) => t.server))].join(', ');
  return chat([
    { role: 'system', content: `You are an agent that can call tool_search, a keyword (BM25) search over the names, descriptions and parameter names of deferred MCP tools. Connected MCP servers: ${servers}. Given the user's request, reply with only the search query you would send: 3 to 8 keywords likely to appear in the right tool's name or description. No explanation.` },
    { role: 'user', content: query },
  ], MODEL);
}

export async function rankBm25(query, catalogue) {
  return bm25(await rewrite(query, catalogue), catalogue);
}

export async function rankHybrid(query, catalogue) {
  const q = await rewrite(query, catalogue);
  return rrf([bm25(q, catalogue), await embeddings(q, catalogue)]);
}
