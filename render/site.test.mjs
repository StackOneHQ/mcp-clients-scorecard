import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, COLUMNS } from './data.mjs';
import { buildSite } from './site.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-test-'));
buildSite(out);
after(() => fs.rmSync(out, { recursive: true, force: true }));
const read = f => fs.readFileSync(path.join(out, f), 'utf8');
const { data } = load();
const href = url => `href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;

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

const pages = ['index.html', '404.html', ...data.clients.map(c => `clients/${c.slug}/index.html`)];

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
