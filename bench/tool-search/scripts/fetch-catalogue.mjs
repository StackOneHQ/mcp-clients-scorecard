// Run public MCP servers via npx with no credentials, list their tools, and write
// data/servers/<id>.json per server that answered. Servers that need credentials to
// list tools fail here and are recorded as skipped.
// Usage: node bench/tool-search/scripts/fetch-catalogue.mjs [serverId ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTools } from '../lib/list-tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'servers');
const tmp = process.env.BENCH_TMP || '/workspace/.scratch/bench-tmp';
const fsRoot = join(tmp, 'fsroot');
mkdirSync(outDir, { recursive: true });
mkdirSync(fsRoot, { recursive: true });

// id, npm package (pinned at fetch time by npx resolving latest), extra args, dummy env
export const SERVERS = [
  { id: 'filesystem', pkg: '@modelcontextprotocol/server-filesystem', args: [fsRoot] },
  { id: 'memory', pkg: '@modelcontextprotocol/server-memory' },
  { id: 'everything', pkg: '@modelcontextprotocol/server-everything', args: ['stdio'] },
  { id: 'github-legacy', pkg: '@modelcontextprotocol/server-github' },
  { id: 'gitlab', pkg: '@modelcontextprotocol/server-gitlab' },
  { id: 'sequential-thinking', pkg: '@modelcontextprotocol/server-sequential-thinking' },
  { id: 'puppeteer', pkg: '@modelcontextprotocol/server-puppeteer', env: { PUPPETEER_SKIP_DOWNLOAD: '1' } },
  { id: 'brave-search', pkg: '@modelcontextprotocol/server-brave-search', env: { BRAVE_API_KEY: 'dummy' } },
  { id: 'slack', pkg: '@modelcontextprotocol/server-slack', env: { SLACK_BOT_TOKEN: 'dummy', SLACK_TEAM_ID: 'T000' } },
  { id: 'google-maps', pkg: '@modelcontextprotocol/server-google-maps', env: { GOOGLE_MAPS_API_KEY: 'dummy' } },
  { id: 'postgres', pkg: '@modelcontextprotocol/server-postgres', args: ['postgresql://localhost/none'] },
  { id: 'redis', pkg: '@modelcontextprotocol/server-redis', args: ['redis://localhost:1'] },
  { id: 'gdrive', pkg: '@modelcontextprotocol/server-gdrive' },
  { id: 'playwright', pkg: '@playwright/mcp' },
  { id: 'chrome-devtools', pkg: 'chrome-devtools-mcp' },
  { id: 'notion', pkg: '@notionhq/notion-mcp-server' },
  { id: 'stripe', pkg: '@stripe/mcp', args: ['--tools=all', '--api-key=sk_test_dummy'] },
  { id: 'context7', pkg: '@upstash/context7-mcp' },
  { id: 'desktop-commander', pkg: '@wonderwhy-er/desktop-commander' },
  { id: 'kubernetes', pkg: 'mcp-server-kubernetes' },
  { id: 'browserbase', pkg: '@browserbasehq/mcp', env: { BROWSERBASE_API_KEY: 'dummy', BROWSERBASE_PROJECT_ID: 'dummy' } },
  { id: 'firecrawl', pkg: 'firecrawl-mcp', env: { FIRECRAWL_API_KEY: 'fc-dummy' } },
  { id: 'sentry', pkg: '@sentry/mcp-server', args: ['--access-token=dummy'] },
  { id: 'heroku', pkg: '@heroku/mcp-server', env: { HEROKU_API_KEY: 'dummy' } },
  { id: 'hubspot', pkg: '@hubspot/mcp-server', env: { PRIVATE_APP_ACCESS_TOKEN: 'dummy' } },
  { id: 'mongodb', pkg: 'mongodb-mcp-server' },
  { id: 'supabase', pkg: '@supabase/mcp-server-supabase', args: ['--access-token=dummy'] },
  { id: 'atlassian-community', pkg: 'mcp-atlassian' },
  { id: 'todoist', pkg: '@abhiz123/todoist-mcp-server', env: { TODOIST_API_TOKEN: 'dummy' } },
  { id: 'elasticsearch', pkg: '@elastic/mcp-server-elasticsearch', env: { ES_URL: 'http://localhost:1' } },
  { id: 'shopify-dev', pkg: '@shopify/dev-mcp' },
  { id: 'airtable', pkg: 'airtable-mcp-server', env: { AIRTABLE_API_KEY: 'dummy' } },
  { id: 'linear-community', pkg: 'linear-mcp-server', env: { LINEAR_API_KEY: 'dummy' } },
  { id: 'gitlab-community', pkg: '@zereight/mcp-gitlab', env: { GITLAB_PERSONAL_ACCESS_TOKEN: 'dummy' } },
  { id: 'git', pkg: '@cyanheads/git-mcp-server' },
  { id: 'jira-community', pkg: '@aashari/mcp-server-atlassian-jira', env: { ATLASSIAN_SITE_NAME: 'x', ATLASSIAN_USER_EMAIL: 'a@b.c', ATLASSIAN_API_TOKEN: 'dummy' } },
];

// Upstream descriptions sometimes contain em or en dashes; the repo style bans them, so they
// are stored as plain hyphens. Tokenizers treat both as separators, so ranking is unaffected.
const noDash = (s) => s.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-');

const only = process.argv.slice(2);
const targets = only.length ? SERVERS.filter((s) => only.includes(s.id)) : SERVERS;
const env = { npm_config_cache: join(tmp, 'npm-cache'), npm_config_yes: 'true', npm_config_loglevel: 'error' };

const results = await Promise.all(targets.map(async (s) => {
  try {
    const r = await listTools('npx', ['-y', s.pkg, ...(s.args || [])], { env: { ...env, ...(s.env || {}) }, cwd: tmp, timeoutMs: 180000 });
    const tools = r.tools.map((t) => ({
      name: t.name,
      description: noDash(t.description || ''),
      params: Object.keys(t.inputSchema?.properties || {}),
    }));
    writeFileSync(join(outDir, `${s.id}.json`), JSON.stringify({
      id: s.id,
      origin: `npx -y ${s.pkg} (tools/list, run ${new Date().toISOString().slice(0, 10)})`,
      serverInfo: r.serverInfo,
      tools,
    }, null, 2) + '\n');
    return `ok   ${s.id}: ${tools.length} tools (${r.serverInfo?.name} ${r.serverInfo?.version})`;
  } catch (e) {
    return `skip ${s.id}: ${String(e.message).replace(/\s+/g, ' ').slice(0, 160)}`;
  }
}));
console.log(results.join('\n'));
