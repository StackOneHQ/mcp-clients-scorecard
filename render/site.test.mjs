import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, COLUMNS } from './data.mjs';
import { buildSite } from './site.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-test-'));
buildSite(out, { og: false });
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

// _headers sets a Content-Security-Policy without 'unsafe-inline', so the browser would drop these
test('pages carry no inline styles or scripts', () => {
  const pages = ['index.html', '404.html', ...data.clients.map(c => `clients/${c.slug}/index.html`)];
  for (const p of pages) assert.doesNotMatch(read(p), /\sstyle=|<script>|\son[a-z]+=/, p);
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
