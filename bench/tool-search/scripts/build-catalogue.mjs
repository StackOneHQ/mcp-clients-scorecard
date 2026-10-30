// Merge data/servers/*.json into data/catalogue.json. Tool id = "<server>__<tool name>".
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const tools = [];
for (const f of readdirSync(join(dataDir, 'servers')).filter((f) => f.endsWith('.json')).sort()) {
  const s = JSON.parse(readFileSync(join(dataDir, 'servers', f), 'utf8'));
  for (const t of s.tools) {
    tools.push({ id: `${s.id}__${t.name}`, server: s.id, name: t.name, description: t.description, params: t.params, source: s.origin });
  }
}
const ids = new Set(tools.map((t) => t.id));
if (ids.size !== tools.length) throw new Error('duplicate tool ids');
writeFileSync(join(dataDir, 'catalogue.json'), JSON.stringify(tools, null, 1) + '\n');
console.log(`${tools.length} tools from ${new Set(tools.map((t) => t.server)).size} servers`);
