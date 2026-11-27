import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, COLUMNS } from './data.mjs';
import { buildSite } from './site.mjs';
import { changelog, splitRecent, recentCutoff, forFeature, KINDS, CHANGES_PAGE } from './changelog.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-test-'));
const SHA = 'c0ffee0000000000000000000000000000000000';
process.env.SITE_COMMIT = SHA;
buildSite(out);
delete process.env.SITE_COMMIT;
after(() => fs.rmSync(out, { recursive: true, force: true }));
const read = f => fs.readFileSync(path.join(out, f), 'utf8');
const { data } = load();
const href = url => `href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;

test('version.json falls back to the commit Workers Builds sets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-ci-'));
  process.env.WORKERS_CI_COMMIT_SHA = 'feed000000000000000000000000000000000000';
  try {
    buildSite(dir);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).commit, process.env.WORKERS_CI_COMMIT_SHA);
  } finally {
    delete process.env.WORKERS_CI_COMMIT_SHA;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every client gets a page that links the source of every cell', () => {
  for (const c of data.clients) {
    const html = read(`clients/${c.slug}/index.html`);
    for (const [k] of COLUMNS) assert.ok(html.includes(href(c.cells[k].source)), `${c.slug} ${k}`);
  }
});

test('the home page links every client and the sitemap lists every page', () => {
  const home = read('index.html');
  const sitemap = read('sitemap.xml');
  for (const c of data.clients) {
    assert.ok(home.includes(`href="/clients/${c.slug}/"`), c.slug);
    assert.ok(sitemap.includes(`/clients/${c.slug}/</loc>`), c.slug);
  }
});

const FEATURE_IDS = data.features.map(f => f.id).filter(k => k !== 'protocol');
const pages = ['index.html', '404.html', ...data.clients.map(c => `clients/${c.slug}/index.html`), ...FEATURE_IDS.map(k => `features/${k}/index.html`)];

// worker/index.js sets a Content-Security-Policy without 'unsafe-inline', so the browser would drop these.
// JSON-LD is data, never run, so CSP leaves it alone.
test('pages carry no inline styles or scripts', () => {
  for (const p of pages) assert.doesNotMatch(read(p), /\sstyle=|<script(?![^>]*\b(src=|type="application\/ld\+json"))|\son[a-z]+=/, p);
});

test('every page has valid JSON-LD, and every indexed page a Markdown copy', () => {
  for (const p of pages.filter(p => p !== '404.html')) {
    const html = read(p);
    const ld = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/);
    assert.ok(ld, p);
    const types = JSON.parse(ld[1])['@graph'].map(n => n['@type']);
    assert.ok(types.includes('FAQPage') && types.includes('Organization'), `${p}: ${types}`);
    const md = html.match(/<link rel="alternate" type="text\/markdown" href="([^"]+)">/);
    assert.ok(md && fs.existsSync(path.join(out, md[1])), p);
  }
  assert.ok(read('llms-full.txt').includes(data.clients[0].name));
  assert.match(read('robots.txt'), /Content-Signal: search=yes/);
  for (const c of data.clients) assert.ok(read('sitemap.md').includes(`/clients/${c.slug}/index.md`), c.slug);
});

test('the worker serves Markdown to agents and sets the security headers', async () => {
  const { default: worker } = await import('../worker/index.js');
  const ASSETS = { fetch: async req => new Response(new URL(req.url).pathname.endsWith('.md') ? `# ${new URL(req.url).pathname}` : '<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) };
  for (const [u, headers, file] of [
    ['https://x.dev/clients/codex/', { Accept: 'text/markdown' }, '/clients/codex/index.md'],
    ['https://x.dev/clients/codex/', { 'User-Agent': 'Mozilla/5.0 (compatible; Claude-User/1.0)' }, '/clients/codex/index.md'],
    ['https://x.dev/clients/codex.md', {}, '/clients/codex/index.md'],
    ['https://x.dev/sitemap.md', {}, '/sitemap.md'],
    ['https://x.dev//evil.dev/', { Accept: 'text/markdown' }, '/evil.dev/index.md'],
  ]) {
    const md = await worker.fetch(new Request(u, { headers }), { ASSETS });
    assert.equal(md.headers.get('Content-Type'), 'text/markdown; charset=utf-8', u);
    assert.equal(await md.text(), `# ${file}`, u);
  }
  const google = await worker.fetch(new Request('https://x.dev/', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } }), { ASSETS });
  assert.equal(await google.text(), '<!doctype html>');
  const html = await worker.fetch(new Request('https://x.dev/'), { ASSETS });
  assert.match(html.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal(html.headers.get('Link'), '</index.md>; rel="alternate"; type="text/markdown"');
  assert.match(html.headers.get('Vary'), /Accept/);
});

test('the worker leaves error responses alone: no Markdown type, long cache, CORS or Link', async () => {
  const { default: worker } = await import('../worker/index.js');
  const ASSETS = { fetch: async () => new Response('<!doctype html>', { status: 404, headers: { 'Content-Type': 'text/html' } }) };
  for (const [u, accept] of [['https://x.dev/nope/index.md'], ['https://x.dev/style.css?v=1'], ['https://x.dev/badges/nope.svg'], ['https://x.dev/nope/', 'text/markdown']]) {
    const res = await worker.fetch(new Request(u, { headers: accept ? { Accept: accept } : {} }), { ASSETS });
    assert.equal(res.status, 404, u);
    assert.equal(res.headers.get('Content-Type'), 'text/html', u);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null, u);
    assert.equal(res.headers.get('Link'), null, u);
    assert.doesNotMatch(res.headers.get('Cache-Control') || '', /immutable/, u);
    assert.match(res.headers.get('Content-Security-Policy'), /default-src 'self'/, u);
  }
});

test('the FAQ names the newest spec revision as current', () => {
  assert.match(read('index.html'), new RegExp(`speaks? the current MCP spec, ${data.spec_versions[0]}`));
});

test('client summaries read as plain sentences', () => {
  for (const c of data.clients) {
    const html = read(`clients/${c.slug}/index.html`);
    const summary = html.match(/<p class="summary">([^<]*)<\/p>/)[1];
    assert.doesNotMatch(summary, /not published \(|are ,|\(undefined\)/, c.slug);
  }
});

test('data.json carries every client with every cell', () => {
  const json = JSON.parse(read('data.json'));
  assert.equal(json.clients.length, data.clients.length);
  for (const c of json.clients) assert.deepEqual(Object.keys(c.cells).sort(), COLUMNS.map(([k]) => k).sort());
});

test('version.json names the data date and the deployed commit', () => {
  const v = JSON.parse(read('version.json'));
  assert.equal(v.as_of, String(data.as_of));
  assert.equal(v.commit, SHA);
});

test('the badge files the pages embed exist', () => {
  for (const c of data.clients) assert.ok(fs.existsSync(path.join(out, 'badges', `${c.slug}.svg`)), c.slug);
});

// The live filters read these attributes: a wrong one silently hides or shows the wrong client
test('every board card carries the features it supports for the filters', () => {
  const home = read('index.html');
  for (const c of data.clients) {
    const m = home.match(new RegExp(`<div class="card t-${c.tier}" data-client="${c.slug}"[^>]*data-y="([^"]*)" data-p="([^"]*)"`));
    assert.ok(m, c.slug);
    const want = v => COLUMNS.filter(([k]) => k !== 'protocol' && c.cells[k].value === v).map(([k]) => k).join(' ');
    assert.equal(m[1], want('y'), `${c.slug} yes`);
    assert.equal(m[2], want('p'), `${c.slug} partly`);
  }
});

test('the changelog lists the last 30 days near the top, every kind tab, and folds the rest', () => {
  const json = JSON.parse(read('changelog.json'));
  const { recent, older } = splitRecent(changelog({ data }), String(data.as_of));
  assert.equal(json.events.length, recent.length + older.length);
  const cut = recentCutoff(String(data.as_of));
  assert.ok(recent.every(e => e.date > cut && e.date <= String(data.as_of)));
  assert.ok(older.every(e => e.date <= cut));
  for (let i = 1; i < json.events.length; i++) assert.ok(json.events[i - 1].date >= json.events[i].date, 'newest first');
  const home = read('index.html');
  assert.ok(home.indexOf('id="changes"') < home.indexOf('id="board"'), 'changes sit above the board');
  for (const k of ['all', ...KINDS.map(([k]) => k)]) assert.ok(home.includes(`data-cl="${k}"`), k);
  const shown = home.match(/<ol class="cl" id="cl-recent">([\s\S]*?)<\/ol>/)?.[1] ?? '';
  assert.equal((shown.match(/<li /g) || []).length, recent.length);
  if (older.length) assert.match(home, new RegExp(`Show <span class="cl-n">${older.length}</span> older change`));
  assert.match(read('changelog.xml'), /^<\?xml[\s\S]*<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">[\s\S]*<\/feed>\n$/);
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.indexOf('<!-- changes:start -->') < readme.indexOf('<!-- table:start -->'));
});

test('recent changes page by CHANGES_PAGE: rows past it marked, a load more link, a short README table', () => {
  const home = read('index.html');
  const { recent } = splitRecent(changelog({ data }), String(data.as_of));
  assert.match(home, new RegExp(`<section id="changes" class="wrap sec" data-f="all" data-page="${CHANGES_PAGE}">`));
  // Every row ships in the HTML; style.css hides the .over ones until the reader asks for more
  const rows = home.match(/<ol class="cl" id="cl-recent">([\s\S]*?)<\/ol>/)?.[1].match(/<li[^>]*>/g) ?? [];
  assert.deepEqual(rows.map(li => li.includes('class="over"')), recent.map((e, i) => i >= CHANGES_PAGE));
  // Only the home page pages its list: a feature page shows every change
  assert.doesNotMatch(read('features/events/index.html'), /class="over"/);
  assert.equal(home.includes(`<a class="btn sm cl-load" href="#cl-recent"><span class="cl-load-t">Show all</span><span class="n">${recent.length}</span></a>`), recent.length > CHANGES_PAGE);
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const section = readme.slice(readme.indexOf('<!-- changes:start -->'), readme.indexOf('<!-- changes:end -->'));
  assert.equal((section.split('<details>')[0].match(/^\| \d{4}-/gm) || []).length, Math.min(recent.length, CHANGES_PAGE));
});

test('the changelog dates board changes against the live data, with ids that ignore labels', () => {
  const live = structuredClone(data);
  live.as_of = '2099-01-01';
  const [gone, moved, flipped] = live.clients;
  live.clients = live.clients.filter(c => c !== gone);
  live.clients.push({ ...structuredClone(moved), slug: 'newcomer', name: 'Newcomer' });
  moved.tier = moved.tier === 'S' ? 'C' : 'S';
  // A cell with no since date, whose upgrade the recheck itself reports
  const [k] = COLUMNS.find(([k]) => k !== 'protocol' && flipped.cells[k].value !== 'na' && !flipped.cells[k].since) ?? [];
  assert.ok(k, `${flipped.slug} has no undated column left to flip`);
  const was = flipped.cells[k].value;
  flipped.cells[k].value = was === 'y' ? 'n' : 'y';
  const today = changelog({ data: live }).filter(e => e.date === '2099-01-01').map(e => [e.kind, e.key]);
  assert.deepEqual(today.sort(), [
    ['client', 'join:newcomer'],
    ['client', `leave:${gone.slug}`],
    ['support', `recheck:${flipped.slug}:${k}=${was}>${flipped.cells[k].value}`],
    ['tier', `tier:${moved.slug}:${data.clients[1].tier}>${moved.tier}`],
  ].sort());
});

test('an upgrade with a since date shows on its release date, not on the day the board picked it up', () => {
  const live = structuredClone(data);
  live.as_of = '2099-01-01';
  // A cell that is no today and was never supported in a committed snapshot, so the upgrade is its first support
  const history = fs.readdirSync(new URL('../data/history/', import.meta.url)).map(f => JSON.parse(fs.readFileSync(new URL(`../data/history/${f}`, import.meta.url), 'utf8')));
  const never = (slug, k) => history.every(h => !['y', 'p'].includes(h.clients[slug]?.[k]));
  const fresh = ([k]) => k !== 'list_changed' && k !== 'protocol';
  const c = live.clients.find(c => COLUMNS.some(col => fresh(col) && c.cells[col[0]].value === 'n' && never(c.slug, col[0])));
  const [k] = COLUMNS.find(col => fresh(col) && c.cells[col[0]].value === 'n' && never(c.slug, col[0]));
  Object.assign(c.cells[k], { value: 'y', since: { date: '2098-06-01', version: '9.9', source: 'https://example.com/changelog' } });
  const events = changelog({ data: live });
  assert.ok(!events.some(e => e.date === '2099-01-01' && e.key.startsWith(`recheck:${c.slug}:`) && e.key.includes(`${k}=n>y`)));
  assert.ok(events.some(e => e.date === '2098-06-01' && e.key === `ship:${c.slug}:${k}`));
  // A downgrade is a finding of the recheck, so it keeps the check date
  const d = live.clients.find(x => x !== c && COLUMNS.some(([j]) => x.cells[j].value === 'y' && x.cells[j].since));
  const [j] = COLUMNS.find(([j]) => d.cells[j].value === 'y' && d.cells[j].since);
  d.cells[j].value = 'p';
  assert.ok(changelog({ data: live }).some(e => e.date === '2099-01-01' && e.key === `recheck:${d.slug}:${j}=y>p`));
});

test('every matrix row and the README table link the client website', () => {
  const home = read('index.html');
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const c of data.clients.filter(c => c.website)) {
    assert.ok(home.includes(`<a class="ext" ${href(c.website)}`), c.slug);
    assert.ok(readme.includes(`[↗](${c.website})`), c.slug);
  }
  assert.ok(JSON.parse(read('data.json')).clients.every(c => 'website' in c));
});

test('the worker lets other sites fetch the changelog feeds', async () => {
  const { default: worker } = await import('../worker/index.js');
  const ASSETS = { fetch: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }) };
  for (const f of ['changelog.json', 'changelog.xml', 'features/events/changelog.json', 'features/id_jag/changelog.xml']) {
    const res = await worker.fetch(new Request(`https://x.dev/${f}`), { ASSETS });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*', f);
  }
});

test('every check card links its proof, which works without JS and opens in the side panel with it', () => {
  for (const c of data.clients) {
    const html = read(`clients/${c.slug}/index.html`);
    assert.ok(html.includes('<dialog class="dlg drawer" id="proof"'), c.slug);
    for (const [k] of COLUMNS) {
      assert.match(html, new RegExp(`<details class="proof" id="proof-${k}"><summary>See the proof</summary><div class="proof-body">`), `${c.slug} ${k}`);
    }
  }
});

test('the hero asks who supports Events', () => {
  assert.match(read('index.html'), /id="ask-events" role="tabpanel"/);
});

test('every feature column gets a page that lists every client, with its source, a Markdown copy and its own feeds', () => {
  assert.ok(!fs.existsSync(path.join(out, 'features/protocol')), 'the spec version has no feature page');
  for (const k of FEATURE_IDS) {
    const html = read(`features/${k}/index.html`);
    for (const c of data.clients) {
      assert.ok(html.includes(`href="/clients/${c.slug}/"`), `${k} ${c.slug}`);
      assert.ok(html.includes(href(c.cells[k].source)), `${k} ${c.slug} source`);
    }
    assert.ok(html.includes(`<link rel="canonical" href="https://mcpclients.dev/features/${k}/">`), k);
    assert.ok(html.includes(`<link rel="alternate" type="application/atom+xml" href="/features/${k}/changelog.xml"`), k);
    assert.ok(html.includes(`href="/features/${k}/changelog.json"`), k);
    assert.ok(read(`features/${k}/index.md`).startsWith('---\ntitle: '), k);
    assert.match(read(`features/${k}/changelog.xml`), new RegExp(`^<\\?xml[\\s\\S]*<link rel="self" href="https://mcpclients.dev/features/${k}/changelog.xml"/>[\\s\\S]*</feed>\\n$`), k);
    assert.equal(JSON.parse(read(`features/${k}/changelog.json`)).feature, k);
    assert.ok(read('sitemap.xml').includes(`/features/${k}/</loc>`), k);
    assert.ok(read('sitemap.md').includes(`/features/${k}/index.md`), k);
    assert.ok(read('llms.txt').includes(`/features/${k}/changelog.xml`), k);
  }
});

test('the Events page lists ChatGPT, Hermes Agent and OpenClaw as Partial and nobody as Yes', () => {
  const html = read('features/events/index.html');
  const group = id => html.match(new RegExp(`<section class="fgroup" id="${id}">([\\s\\S]*?)</section>`))?.[1] ?? '';
  const slugs = id => [...group(id).matchAll(/<article class="fcell" id="([^"]+)"/g)].map(m => m[1]).sort();
  const want = v => data.clients.filter(c => c.cells.events.value === v).map(c => c.slug).sort();
  assert.deepEqual(slugs('yes'), want('y'));
  assert.deepEqual(slugs('partial'), want('p'));
  assert.deepEqual(slugs('no'), want('n'));
  for (const s of ['chatgpt', 'hermes-agent', 'openclaw']) assert.ok(slugs('partial').includes(s), s);
  const y = want('y').length, p = want('p').length;
  assert.ok(html.includes(`<b>${y}</b> of ${data.clients.length} clients support it${p ? `, <b class="p">${p}</b> partly` : ''}.`));
  assert.match(read('index.html'), /<div class="ask-panel[^"]*" id="ask-events"[\s\S]*?<a href="\/features\/events\/">See every Events cell<\/a>/);
});

test('a feature feed carries only the events about that feature', () => {
  const events = changelog({ data });
  for (const k of FEATURE_IDS) {
    const own = forFeature(events, k);
    for (const e of own) {
      const ok = e.key === `feature:${k}` || e.key === `ship:${e.client?.slug}:${k}` || (e.key.startsWith('recheck:') && e.key.split(':').slice(2).join(':').split(',').some(p => p.startsWith(`${k}=`)));
      assert.ok(ok, `${k}: ${e.key}`);
    }
    // A recheck's key also names a column told by its ship event instead, so count by the changes it shows
    const expected = events.filter(e => e.key === `feature:${k}` || e.key.endsWith(`:${k}`) && e.key.startsWith('ship:') || e.changes?.some(([c]) => c === k));
    assert.equal(own.length, expected.length, k);
    assert.equal(JSON.parse(read(`features/${k}/changelog.json`)).events.length, own.length, k);
    assert.equal((read(`features/${k}/changelog.xml`).match(/<entry>/g) || []).length, Math.min(own.length, 100), k);
  }
  const titles = JSON.parse(read('features/events/changelog.json')).events.map(e => e.title);
  assert.ok(titles.length && titles.every(t => /Events/.test(t)), titles.join('; '));
});

test('a recheck that moved several columns shows only the one feature in that feature feed', () => {
  const live = structuredClone(data);
  live.as_of = '2099-01-01';
  const c = live.clients.find(c => ['events', 'tasks'].every(k => c.cells[k].value !== 'na'));
  for (const k of ['events', 'tasks']) c.cells[k].value = c.cells[k].value === 'y' ? 'n' : 'y';
  const events = changelog({ data: live });
  const both = events.find(e => e.date === '2099-01-01' && e.key.startsWith(`recheck:${c.slug}:`));
  assert.match(both.text, /Tasks .*Events|Events .*Tasks/);
  const own = forFeature(events, 'events').find(e => e.key === both.key);
  assert.match(own.text, /^rechecked: Events \w+ → \w+$/);
  assert.equal(forFeature(events, 'tasks').find(e => e.key === both.key).text.includes('Events'), false);
});
