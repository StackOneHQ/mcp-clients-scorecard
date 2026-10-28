// Recount MCP issues per tracker with the GitHub search API and rewrite data/bugs.json.
// Needs the gh CLI, signed in. Search allows 30 requests a minute, so this takes about two minutes.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, load } from '../render/data.mjs';

const { data } = load({ counts: false });
const start = data.bug_window_start;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function count(q) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const n = execFileSync('gh', ['api', '-X', 'GET', 'search/issues', '-f', `q=${q}`, '--jq', '.total_count'], { encoding: 'utf8' });
      await sleep(2200);
      return Number(n.trim());
    } catch (e) {
      await sleep(30000 * (attempt + 1));
    }
  }
  throw new Error(`search failed: ${q}`);
}

const trackers = [...new Map(data.clients.filter(c => c.tracker).map(c => [c.tracker.repo, c.tracker])).values()];
const repos = {};
for (const t of trackers) {
  const base = `repo:${t.repo} is:issue created:>=${start}${t.mcp_in_title ? ' mcp in:title' : ''}`;
  repos[t.repo] = {
    issues: await count(base),
    completed: await count(`${base} is:closed reason:completed`),
    duplicates: await count(`${base} is:closed reason:duplicate`),
  };
  console.log(t.repo, JSON.stringify(repos[t.repo]));
}
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(ROOT + 'data/bugs.json', JSON.stringify({ as_of: today, window_start: start, repos }, null, 2) + '\n');
console.log('wrote data/bugs.json');
