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

// id, npm package pinned to the version the committed catalogue came from, extra args, dummy env.
// These are third-party packages that npx runs with your filesystem and network access: bump a pin
// only after reviewing that release, and run a refresh inside a throwaway container.
export const SERVERS = [
  { id: 'filesystem', pkg: '@modelcontextprotocol/server-filesystem@1.0.0', args: [fsRoot] },
  { id: 'memory', pkg: '@modelcontextprotocol/server-memory@1.0.0' },
  { id: 'everything', pkg: '@modelcontextprotocol/server-everything@1.0.0', args: ['stdio'] },
  { id: 'github-legacy', pkg: '@modelcontextprotocol/server-github@2025.4.8' },
  { id: 'gitlab', pkg: '@modelcontextprotocol/server-gitlab@2025.4.25' },
  { id: 'sequential-thinking', pkg: '@modelcontextprotocol/server-sequential-thinking@1.0.0' },
  { id: 'puppeteer', pkg: '@modelcontextprotocol/server-puppeteer@2025.5.12', env: { PUPPETEER_SKIP_DOWNLOAD: '1' } },
  { id: 'brave-search', pkg: '@modelcontextprotocol/server-brave-search@0.6.2', env: { BRAVE_API_KEY: 'dummy' } },
  { id: 'slack', pkg: '@modelcontextprotocol/server-slack@2025.4.25', env: { SLACK_BOT_TOKEN: 'dummy', SLACK_TEAM_ID: 'T000' } },
  { id: 'google-maps', pkg: '@modelcontextprotocol/server-google-maps@0.6.2', env: { GOOGLE_MAPS_API_KEY: 'dummy' } },
  { id: 'postgres', pkg: '@modelcontextprotocol/server-postgres@0.6.2', args: ['postgresql://localhost/none'] },
  { id: 'redis', pkg: '@modelcontextprotocol/server-redis@2025.4.25', args: ['redis://localhost:1'] },
  { id: 'gdrive', pkg: '@modelcontextprotocol/server-gdrive@2025.1.14' },
  { id: 'playwright', pkg: '@playwright/mcp@0.0.83' },
  { id: 'chrome-devtools', pkg: 'chrome-devtools-mcp@1.12.0' },
  { id: 'notion', pkg: '@notionhq/notion-mcp-server@2.6.1' },
  { id: 'stripe', pkg: '@stripe/mcp@0.3.3', args: ['--tools=all', '--api-key=sk_test_dummy'] },
  { id: 'context7', pkg: '@upstash/context7-mcp@4.4.4' },
  { id: 'desktop-commander', pkg: '@wonderwhy-er/desktop-commander@0.3.1' },
  { id: 'kubernetes', pkg: 'mcp-server-kubernetes@4.2.1' },
  { id: 'browserbase', pkg: '@browserbasehq/mcp@3.0.0', env: { BROWSERBASE_API_KEY: 'dummy', BROWSERBASE_PROJECT_ID: 'dummy' } },
  { id: 'firecrawl', pkg: 'firecrawl-mcp@3.36.0', env: { FIRECRAWL_API_KEY: 'fc-dummy' } },
  { id: 'sentry', pkg: '@sentry/mcp-server@0.42.0', args: ['--access-token=dummy'] },
  { id: 'heroku', pkg: '@heroku/mcp-server@1.2.13', env: { HEROKU_API_KEY: 'dummy' } },
  { id: 'hubspot', pkg: '@hubspot/mcp-server@0.4.0', env: { PRIVATE_APP_ACCESS_TOKEN: 'dummy' } },
  { id: 'mongodb', pkg: 'mongodb-mcp-server@3.2.2' },
  { id: 'supabase', pkg: '@supabase/mcp-server-supabase@0.15.0', args: ['--access-token=dummy'] },
  { id: 'atlassian-community', pkg: 'mcp-atlassian@2.1.0' },
  { id: 'todoist', pkg: '@abhiz123/todoist-mcp-server@0.1.0', env: { TODOIST_API_TOKEN: 'dummy' } },
  { id: 'elasticsearch', pkg: '@elastic/mcp-server-elasticsearch@0.3.1', env: { ES_URL: 'http://localhost:1' } },
  { id: 'shopify-dev', pkg: '@shopify/dev-mcp@1.18.0' },
  { id: 'airtable', pkg: 'airtable-mcp-server@1.14.0', env: { AIRTABLE_API_KEY: 'dummy' } },
  { id: 'linear-community', pkg: 'linear-mcp-server@0.1.0', env: { LINEAR_API_KEY: 'dummy' } },
  { id: 'gitlab-community', pkg: '@zereight/mcp-gitlab@2.3.16', env: { GITLAB_PERSONAL_ACCESS_TOKEN: 'dummy' } },
  { id: 'git', pkg: '@cyanheads/git-mcp-server@2.15.3' },
  { id: 'jira-community', pkg: '@aashari/mcp-server-atlassian-jira@3.3.0', env: { ATLASSIAN_SITE_NAME: 'x', ATLASSIAN_USER_EMAIL: 'a@b.c', ATLASSIAN_API_TOKEN: 'dummy' } },
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
