// The website, generated from data/ into dist/. Cloudflare's GitHub app builds it with `npm run site` and deploys it
// with worker/index.js on every push to main. No Chrome needed: the share cards are drawn by `npm run build`.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, COLUMNS, HARNESS, TIERS, GROUPS, load, protocolGrade, formatDate, featureScore } from './data.mjs';
import { TIER_COLOR, logo, esc } from './images.mjs';
import { fixText } from './markdown.mjs';

const pkg = JSON.parse(fs.readFileSync(ROOT + 'package.json', 'utf8'));
const SITE = pkg.homepage.replace(/\/$/, '');
const REPO = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const TITLE = 'MCP clients scorecard';
const SO = 'https://www.stackone.com';
const FEATURES = COLUMNS.filter(([k]) => k !== 'protocol');
const LABEL = Object.fromEntries(COLUMNS);
const MARK = { y: 'Yes', p: 'Partial', n: 'No', na: 'n/a' };
const METHOD = { probe: 'live probe', source: 'source code', docs: 'docs', changelog: 'changelog', issue: 'issue' };
const GRADE = { g: 'current spec', a: 'one version behind', rd: 'older spec', x: 'not published' };
// Attribute values: esc() leaves quotes alone, which is fine in text but not inside href="..."
const attr = s => esc(s).replace(/"/g, '&quot;');
// Evidence strings mark code with backticks, as in the README
const prose = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const clientUrl = c => `/clients/${c.slug}/`;

export function buildSite(out) {
  const model = load();
  const { data } = model;
  const previous = previousSnapshot(data.as_of);
  const changes = previous ? diff(previous, data) : [];
  fs.rmSync(out, { recursive: true, force: true });
  const write = (f, s) => {
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.writeFileSync(path.join(out, f), s);
  };
  // Share cards are drawn by `npm run build` and committed, so this build needs no Chrome
  const ogImage = name => {
    if (!fs.existsSync(ROOT + `assets/og/${name}.png`)) throw new Error(`assets/og/${name}.png is missing: run npm run build`);
    return `${SITE}/og/${name}.png`;
  };
  const faq = homeFaq(data);
  // Each page and its Markdown copy, which opens with the same title, description and canonical URL
  const both = (dir, meta, md) => {
    write(`${dir}index.html`, page(meta));
    write(`${dir}index.md`, frontmatter(meta, data.as_of) + md);
  };

  both('', {
    title: `MCP clients ranked: which support MCP Apps, Tasks, CIMD and more (${formatDate(data.as_of)})`,
    description: `${data.clients.length} MCP clients ranked S to D on ${COLUMNS.length} checks, with a linked, dated source for every cell. ${(s => (s.length ? `S tier: ${s.join(', ')}.` : 'No client is S tier yet.'))(byRank(data).filter(c => c.tier === 'S').map(c => c.name))}`,
    path: '/',
    image: ogImage('index'),
    modified: data.as_of,
    jsonld: homeJsonld(data, faq),
    markdown: '/index.md',
    body: home(data, changes, previous, faq),
  }, homeMarkdown(data, faq));
  data.clients.forEach((c, i) => {
    const qa = clientFaq(data, c);
    both(`clients/${c.slug}/`, {
      title: `${c.name} MCP support: ${c.tier} tier, ${supportLine(c)} features`,
      description: `${summary(data, c)} Every cell links to a dated source.`,
      path: clientUrl(c),
      image: ogImage(c.slug),
      modified: data.as_of,
      jsonld: clientJsonld(data, c, qa),
      markdown: `${clientUrl(c)}index.md`,
      body: clientPage(data, c, data.clients[i - 1], data.clients[i + 1]),
    }, clientMarkdown(data, c, qa));
  });
  write('404.html', page({ title: `Not found: ${TITLE}`, description: 'Page not found', path: '/404', image: ogImage('index'), noindex: true, body: '<main class="wrap narrow"><h1>Not found</h1><p><a href="/">Back to the tier list</a></p></main>' }));
  write('data.json', JSON.stringify(publicData(data), null, 2) + '\n');
  write('llms.txt', llms(data));
  write('llms-full.txt', llmsFull(data));
  write('robots.txt', ROBOTS);
  write('sitemap.xml', sitemap(data));
  write('sitemap.md', sitemapMd(data));
  write('style.css', CSS);
  write('app.js', JS);
  fs.cpSync(ROOT + 'assets/mark.svg', path.join(out, 'favicon.svg'));
  for (const dir of ['logos', 'icons', 'badges', 'fonts']) fs.cpSync(ROOT + `assets/${dir}`, path.join(out, 'assets', dir), { recursive: true, filter: f => !f.endsWith('.md') });
  if (fs.existsSync(ROOT + 'assets/og')) fs.cpSync(ROOT + 'assets/og', path.join(out, 'og'), { recursive: true });
  for (const png of ['tiers', 'matrix', 'history-features', 'history-clients']) fs.cpSync(ROOT + `assets/${png}.png`, path.join(out, 'assets', `${png}.png`));
  // Short badge URLs for READMEs: /badges/<slug>.svg
  fs.cpSync(ROOT + 'assets/badges', path.join(out, 'badges'), { recursive: true });

  return { pages: data.clients.length + 2, changes: changes.length };
}

// ---------- pages

// StackOne brand faces: Stack Sans Text for headings, Geist for text, Geist Mono for figures.
// The pages serve them from assets/fonts/ (style.css); only the share cards, drawn at build time, load them from Google.
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Stack+Sans+Text:wght@400;500&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">';
const icon = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SEARCH = icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const GITHUB = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" stroke="none" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const STACKONE = '<img class="wordmark" src="/assets/logos/stackone-white.svg" alt="StackOne" width="90" height="12">';
const groupLabel = g => (g === 'cli' ? 'CLI' : 'App or IDE');
const badgeSize = c => { const [, w, h] = fs.readFileSync(ROOT + `assets/badges/${c.slug}.svg`, 'utf8').match(/<svg[^>]*?width="([\d.]+)" height="([\d.]+)"/); return `width="${Math.ceil(w)}" height="${Math.ceil(h)}"`; };
const logoImg = (c, size) => `<span class="lg"><img src="/assets/logos/${attr(c.logo)}" alt="" width="${size}" height="${size}"></span>`;

function page({ title, description, path: p, image, body, noindex = false, modified, jsonld, markdown }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${attr(description)}"><meta name="theme-color" content="#242424"><meta name="color-scheme" content="dark">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${attr(SITE + p)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">`}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${markdown ? `<link rel="alternate" type="text/markdown" href="${attr(markdown)}">` : ''}<link rel="alternate" type="application/json" href="/data.json" title="Scorecard data"><meta name="author" content="StackOne">
<meta property="og:type" content="website"><meta property="og:site_name" content="${TITLE}"><meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(SITE + p)}"><meta property="og:image" content="${attr(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">${modified ? `<meta property="og:updated_time" content="${modified}">` : ''}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@StackOneHQ"><meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(description)}"><meta name="twitter:image" content="${attr(image)}">
<link rel="preload" href="/assets/fonts/stack-sans-text.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css?v=${VERSION}"><script src="/app.js?v=${VERSION}" defer></script></head>
<body><header class="top"><div class="wrap bar"><div class="brand"><a class="home" href="/" aria-label="${TITLE}, home"><img class="mark" src="/favicon.svg" alt="" width="28" height="28"><span>${TITLE}</span></a><a class="by" href="${SO}/">by ${STACKONE}</a></div>
<nav aria-label="Main"><a href="/#board">Tiers</a><a href="/#matrix">Matrix</a><a href="/#changes">Changes</a><a href="${REPO}/blob/main/methodology/RUBRIC.md">Method</a></nav>
<button type="button" class="search-btn" data-palette aria-label="Search clients and features">${SEARCH}<span>Search</span><kbd data-mod>Ctrl</kbd><kbd>K</kbd></button>
<a class="btn sm gh" href="${REPO}" aria-label="GitHub repo">${GITHUB}<span>GitHub</span></a></div></header>
${body}
<footer class="foot"><div class="wrap foot-in">
<div class="foot-brand"><a href="${SO}/">${STACKONE.replace('width="90" height="12"', 'width="120" height="16"')}</a>
<p>We test the <a href="${SO}/platform/mcp/">StackOne MCP server</a> against every client on this board, so we keep this list for ourselves and publish it. StackOne is integration infrastructure for AI agents.</p></div>
<nav class="foot-links" aria-label="Project"><a href="${REPO}">${GITHUB}GitHub repo</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Fix a wrong cell</a><a href="${REPO}/blob/main/methodology/RUBRIC.md">How tiers are scored</a><a href="/data.json">data.json</a><a href="/llms.txt">llms.txt</a><a href="/index.md">Markdown</a></nav>
<p class="foot-meta">Data MIT licensed · <kbd data-mod>Ctrl</kbd> <kbd>K</kbd> search · <kbd>/</kbd> filter</p></div></footer>
<dialog class="dlg palette" id="palette" aria-label="Search" data-repo="${attr(REPO)}"><div class="pal-in">${SEARCH}<input id="pal-q" type="search" placeholder="Search clients, tiers, features…" autocomplete="off" spellcheck="false" role="combobox" aria-controls="pal-list" aria-expanded="true"><kbd>esc</kbd></div>
<ul class="pal-list" id="pal-list" role="listbox"></ul><div class="pal-ft"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd data-mod>Ctrl</kbd><kbd>↵</kbd> new tab</span></div></dialog>
</body></html>
`;
}

function filterAttrs(data, c) {
  const y = FEATURES.filter(([k]) => c.cells[k].value === 'y').map(([k]) => k);
  const p = FEATURES.filter(([k]) => c.cells[k].value === 'p').map(([k]) => k);
  const hay = [c.name, c.slug, groupLabel(c.group), c.group, `${c.tier}-tier`, ...y.concat(p).map(k => LABEL[k])].join(' ').toLowerCase();
  return `data-client="${attr(c.slug)}" data-group="${c.group}" data-tier="${c.tier}" data-y="${y.join(' ')}" data-p="${p.join(' ')}" data-hay="${attr(hay)}"`;
}

const strip = c => `<span class="strip" aria-hidden="true">${FEATURES.map(([k]) => `<i class="bdot ${c.cells[k].value}"></i>`).join('')}</span>`;

// What StackOne wrote while building against these clients, keyed by the column each piece explains
const READING = [
  ['protocol', '/blog/mcp-spec-execution-gap/', 'The MCP 2026-07-28 spec: why agents still stall in production'],
  ['cimd', '/blog/oauth-for-ai-agents/', 'OAuth for AI agents: how it works'],
  ['code_mode', '/blog/mcp-code-mode-agent-context-architecture/', 'MCP code mode: keeping tool responses out of agent context'],
  ['tool_search', '/blog/mcp-tool-search-bm25-tfidf-hybrid/', 'Comparing BM25, TF-IDF and hybrid search for MCP tool discovery'],
  [null, '/blog/agent-tool-count-ceiling/', 'Why AI agent accuracy drops as the tool count grows'],
  [null, '/blog/mcp-token-optimization/', 'MCP token optimization: four approaches compared'],
];
// stackone.com setup guides for clients on this board
const SO_GUIDE = { chatgpt: 'chatgpt', 'claude-app': 'claude', 'claude-code': 'claude-code', codex: 'codex', cursor: 'cursor', 'gemini-cli': 'gemini-cli', goose: 'goose', 'vs-code': 'vscode' };

function home(data, changes, previous, faq) {
  const perTier = Object.fromEntries(TIERS.map(t => [t, data.clients.filter(c => c.tier === t).length]));
  const shareText = `${data.clients.length} MCP clients ranked S to D, with a source behind every cell`;
  const supporters = k => data.clients.filter(c => c.cells[k].value === 'y');
  const asks = ['apps', 'tasks', 'cimd', 'code_mode'].filter(k => Object.hasOwn(LABEL, k));
  const askPanel = (k, i) => {
    const yes = supporters(k), part = data.clients.filter(c => c.cells[k].value === 'p');
    const who = (list, cls) => list.map(c => `<a class="${cls}" href="${clientUrl(c)}">${logoImg(c, 20)}<span>${esc(c.name)}</span><span class="tb t-${c.tier}">${c.tier}</span></a>`).join('');
    return `<div class="ask-panel${i === 0 ? ' on' : ''}" id="ask-${k}" role="tabpanel" aria-labelledby="tab-${k}"><p class="ask-q">Who supports ${esc(LABEL[k])}?</p>
<p class="ask-n"><b>${yes.length}</b> of ${data.clients.length} clients${part.length ? `, ${part.length} partly` : ''}</p>
<div class="ask-who">${who(yes, 'y') || '<span class="muted">Nobody yet</span>'}${who(part, 'p')}</div>
<button type="button" class="link" data-apply="${k}">Filter the tier list by ${esc(LABEL[k])}</button></div>`;
  };
  return `<main>
<section class="wrap hero"><div class="hero-copy"><p class="meta-line"><i class="bdot"></i>Updated ${formatDate(data.as_of)}, rechecked every Monday</p>
<h1>Which MCP clients actually support MCP?</h1>
<p class="lede">${data.clients.length} MCP clients ranked S to D on the same ${COLUMNS.length} checks. Every cell links to a dated source: a live probe, the source code, the docs or a changelog.</p>
<div class="ctas"><a class="btn primary" href="#board">Explore the tier list</a><a class="btn" href="${REPO}">${GITHUB}View on GitHub</a></div>
<p class="share-line">Share ${share(shareText, SITE + '/')}</p></div>
${asks.length ? `<div class="ask" aria-label="Ask the board"><div class="ask-tabs" role="tablist">${asks.map((k, i) => `<button type="button" role="tab" id="tab-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="ask-${k}" data-ask="${k}">${esc(LABEL[k])}</button>`).join('')}</div>${asks.map(askPanel).join('')}</div>` : ''}</section>

<section id="board" class="wrap sec"><div class="sec-hd"><h2>Tier list</h2><p class="note">Tiers follow the <a href="${REPO}/blob/main/methodology/RUBRIC.md">rubric</a>. Each dot under a logo is one check, in column order.</p></div>
<div class="cmdbar" role="search"><label class="field">${SEARCH}<span class="sr">Filter clients</span><input id="q" type="search" placeholder="${attr('Filter: a name, "s tier", "cli", a feature…')}" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
<div class="seg" role="group" aria-label="Client type"><button type="button" data-g="all" aria-pressed="true">All</button>${GROUPS.map(([g, l]) => `<button type="button" data-g="${g}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>
<span class="result mono" id="count" aria-live="polite"><b>${data.clients.length}</b> of ${data.clients.length} clients</span><button type="button" class="reset" id="reset">Clear</button>
<div class="feats" role="group" aria-label="Must support"><span class="lab">Must support</span>${FEATURES.map(([k, l]) => `<button type="button" class="fchip${HARNESS.has(k) ? ' h' : ''}" data-feat="${k}" aria-pressed="false">${esc(l)}<span class="n">${supporters(k).length + data.clients.filter(c => c.cells[k].value === 'p').length}</span></button>`).join('')}</div></div>
<div class="board"><div class="bhead"><span></span>${GROUPS.map(([, l]) => `<span>${l}</span>`).join('')}</div>
${TIERS.map(t => `<div class="trow t-${t}"><div class="tlabel"><b>${t}</b><small>${perTier[t]} client${perTier[t] === 1 ? '' : 's'}</small></div>${GROUPS.map(([g, l]) => `<div class="lane"><span class="glabel">${l}</span>${data.clients.filter(c => c.group === g && c.tier === t).map(c => card(data, c)).join('')}</div>`).join('')}</div>`).join('\n')}
</div>
<div class="legend"><span><i class="bdot y"></i>Yes</span><span><i class="bdot p"></i>Partly</span><span><i class="bdot"></i>No</span><span class="muted">Dots in column order: ${FEATURES.map(([, l]) => esc(l)).join(', ')}</span></div></section>

${changes.length ? `<section id="changes" class="wrap sec"><h2>What changed since ${formatDate(previous.as_of)}</h2><ul class="changes">${changes.map(ch => `<li><i class="bdot y"></i><span>${ch}</span></li>`).join('')}</ul></section>` : `<section id="changes" class="wrap sec"><h2>What changed</h2><p class="note">${previous ? `No changes since ${formatDate(previous.as_of)}.` : 'No earlier snapshot to compare against yet.'}</p></section>`}

<section id="matrix" class="wrap sec"><div class="sec-hd"><h2>Every cell, with its source</h2><p class="note">Hover or focus a cell for the evidence, click it for the source. Click a column to sort. Harness columns are how a client handles tools, not part of the MCP spec.</p></div>
<div class="mx">${matrix(data)}</div>
<details class="defs"><summary>What each column means</summary><dl>${data.features.map(f => `<div><dt>${esc(f.label)}${HARNESS.has(f.id) ? ' <span class="tag">harness</span>' : ''}</dt><dd>${prose(f.definition)} <a href="${attr(f.url)}">${esc(f.ref)}</a>${READING.filter(([k]) => k === f.id).map(([, p, t]) => ` · <a href="${SO}${p}">${esc(t)}</a>`).join('')}</dd></div>`).join('')}
<div><dt>MCP bugs fixed</dt><dd>The share of the client's MCP issues since ${formatDate(data.bug_window_start)} closed as completed, duplicates removed. <a href="${REPO}/blob/main/methodology/METHODOLOGY.md#mcp-bugs-fixed">How it is counted</a></dd></div></dl></details></section>

<section id="faq" class="wrap sec"><h2>Questions</h2><div class="faq">${faq.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join('')}</div></section>

<section id="reading" class="wrap sec"><div class="sec-hd"><h2>Notes from StackOne</h2><p class="note">We run an MCP server and test it in these clients every week. What we wrote up along the way.</p></div>
<ul class="reading">${READING.map(([k, p, t]) => `<li><a href="${SO}${p}">${esc(t)}</a>${k ? `<span class="muted">${esc(LABEL[k])}</span>` : ''}</li>`).join('')}</ul></section>

<section class="wrap sec"><h2>Adoption over time</h2><div class="charts"><img class="chart" src="/assets/history-features.png" alt="Which MCP clients shipped each feature, and when" loading="lazy" width="1200" height="700">
<img class="chart" src="/assets/history-clients.png" alt="Features supported per client over time" loading="lazy" width="1200" height="700"></div></section>
</main>
<div class="tray" id="tray" aria-live="polite"><span class="lgs"></span><span class="txt"></span><button type="button" class="btn sm primary" id="tray-go" disabled>Compare</button><button type="button" class="xbtn" id="tray-clear" aria-label="Clear the selection">×</button></div>
<dialog class="dlg" id="compare" aria-label="Compare clients"><div class="dlg-hd"><h3>Compare</h3><label class="toggle"><input type="checkbox" id="cmp-diff">Only differences</label><button type="button" class="btn sm" id="cmp-share" data-copy="">Copy link</button><button type="button" class="xbtn" data-close aria-label="Close">×</button></div>
<div class="cmp-body"></div><div class="cmp-add"><select id="cmp-pick" aria-label="Add a client to the comparison"></select><span>Rows with a dot differ. Hover a cell for its evidence.</span></div></dialog>`;
}

const card = (data, c) => `<div class="card t-${c.tier}" ${filterAttrs(data, c)}><a class="card-link" href="${clientUrl(c)}">${logoImg(c, 40)}<span class="nm">${esc(c.name)}</span>${strip(c)}<span class="sr">${supportLine(c)} features</span></a><button type="button" class="cmp-btn" data-cmp="${attr(c.slug)}" aria-pressed="false" aria-label="Compare ${attr(c.name)}">+</button></div>`;

function cellHtml(data, key, cell) {
  if (key === 'protocol') {
    const g = protocolGrade(cell.value, data.spec_versions);
    return `<span class="pv ${g}">${esc(cell.value)}${cell.fallback ? '*' : ''}</span>`;
  }
  const label = key === 'tool_search' && cell.value === 'y' && cell.label ? `<span class="lbl">${esc(cell.label)}</span>` : '';
  return `<img src="/assets/icons/${cell.value}.svg" alt="${MARK[cell.value]}" width="18" height="18">${label}`;
}

function matrix(data) {
  const sortBtn = (key, l) => `<button type="button" class="sort" data-sort="${key}">${esc(l)}</button>`;
  const head = `<tr><th>${sortBtn('name', 'Client')}</th><th>${sortBtn('tier', 'Tier')}</th><th>${sortBtn('fix', 'MCP bugs fixed')}</th>${COLUMNS.map(([k, l]) => `<th data-k="${k}"${HARNESS.has(k) ? ' class="h"' : ''}>${sortBtn(k, l)}</th>`).join('')}</tr>`;
  let i = 0;
  const bodies = GROUPS.map(([g, label]) => `<tbody><tr class="grp"><td colspan="${COLUMNS.length + 3}">${label}</td></tr>`
    + data.clients.filter(c => c.group === g).map(c => `<tr ${filterAttrs(data, c)} data-i="${i++}" data-name="${attr(c.name.toLowerCase())}" data-score="${featureScore(c)}" data-fix="${c.fix.kind === 'rate' ? c.fix.ratio : -1}"><th><a href="${clientUrl(c)}"><img src="/assets/logos/${attr(c.logo)}" alt="" width="22" height="22">${esc(c.name)}</a></th>`
      + `<td><span class="tb t-${c.tier}">${c.tier}</span></td><td class="fix">${esc(fixText(c.fix))}</td>`
      + COLUMNS.map(([k]) => {
        const cell = c.cells[k];
        return `<td data-k="${k}"${HARNESS.has(k) ? ' class="h"' : ''}><a href="${attr(cell.source)}" title="${attr(cell.evidence)}" data-v="${k === 'protocol' ? '' : cell.value}" data-m="${METHOD[cell.method]}" data-ck="${formatDate(cell.checked)}" data-head="${attr(`${c.name}, ${LABEL[k]}`)}" rel="nofollow">${cellHtml(data, k, cell)}</a></td>`;
      }).join('')
      + '</tr>').join('') + '</tbody>').join('');
  return `<table class="matrix"><thead>${head}</thead>${bodies}</table>`;
}

function clientPage(data, c, prev, next) {
  const pageUrl = SITE + clientUrl(c);
  const badge = `${SITE}/badges/${c.slug}.svg`;
  const md = `[![MCP clients scorecard: tier ${c.tier}](${badge})](${pageUrl})`;
  const html = `<a href="${pageUrl}"><img src="${badge}" alt="MCP clients scorecard: tier ${c.tier}"></a>`;
  const links = [['Website', c.website], ['Docs', c.docs], ['Repo', c.repo], c.tracker && ['Issues', `https://github.com/${c.tracker.repo}/issues`]].filter(l => l && l[1]);
  const score = featureScore(c);
  const R = 48, C = +(2 * Math.PI * R).toFixed(1);
  const off = +(C * (1 - score / FEATURES.length)).toFixed(1);
  const checks = COLUMNS.map(([k, l]) => {
    const cell = c.cells[k];
    const f = data.features.find(x => x.id === k);
    const s = cell.since;
    const g = k === 'protocol' && protocolGrade(cell.value, data.spec_versions);
    const value = k === 'protocol'
      ? `<span class="pv ${g}">${esc(cell.value)}</span> ${GRADE[g]}${cell.fallback ? `, falls back to ${esc(cell.fallback)}` : ''}`
      : `<img src="/assets/icons/${cell.value}.svg" alt="" width="18" height="18">${MARK[cell.value]}${cell.value === 'y' && cell.label ? ` · ${esc(cell.label)}` : ''}`;
    return `<article class="check v-${g || cell.value}"><div class="ck-hd"><h3 title="${attr(f.definition)}">${esc(l)}</h3>${HARNESS.has(k) ? '<span class="tag">harness</span>' : ''}<span class="ck-v">${value}</span></div>
<p>${prose(cell.evidence)}</p><div class="src"><a href="${attr(cell.source)}" rel="nofollow">Source: ${METHOD[cell.method]} ↗</a><span>checked ${formatDate(cell.checked)}</span>${s ? `<span>shipped <a href="${attr(s.source)}" rel="nofollow">${formatDate(s.date)}${s.version ? ` in ${esc(s.version)}` : ''}</a></span>` : ''}</div></article>`;
  }).join('\n');
  const pagerLink = (o, cls, dir) => `<a class="${cls}" href="${clientUrl(o)}">${cls === 'next' ? '' : logoImg(o, 28)}<span><small>${dir}</small>${esc(o.name)} · ${o.tier}</span>${cls === 'next' ? logoImg(o, 28) : ''}</a>`;
  return `<main class="wrap t-${c.tier}">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Tier list</a><span>/</span>${esc(c.name)}</nav>
<section class="chero">${`<div class="big lg"><img src="/assets/logos/${attr(c.logo)}" alt="" width="76" height="76"></div>`}
<div><h1>${esc(c.name)}</h1><div class="metas"><span class="meta">${groupLabel(c.group)}</span><span class="meta">${c.version_checked ? `v${esc(c.version_checked)}` : 'hosted'}</span><span class="meta">MCP bugs fixed: ${esc(fixText(c.fix))}</span></div>
<p class="links">${links.map(([l, u]) => `<a href="${attr(u)}">${l} ↗</a>`).join('')}</p></div>
<div class="scorebox"><div class="ring" title="Feature score: yes counts 1, partly counts half"><svg viewBox="0 0 112 112" aria-hidden="true"><circle class="trk" cx="56" cy="56" r="${R}" fill="none" stroke-width="9"/><circle class="val" cx="56" cy="56" r="${R}" fill="none" stroke-width="9" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg><div><b>${score}</b><span>of ${FEATURES.length}</span></div></div>
<div class="tierbig" title="Tier ${c.tier}">${c.tier}</div></div></section>
<p class="summary">${esc(summary(data, c))}</p>
${c.tier_note ? `<p class="callout">${prose(c.tier_note)}</p>` : ''}${c.note ? `<p class="callout">${prose(c.note)}</p>` : ''}
<div class="ctas"><a class="btn" href="/#compare=${attr(c.slug)}">Compare with another client</a><a class="btn" href="${REPO}/edit/main/data/clients/${c.slug}.yaml">${GITHUB}Wrong? Edit ${esc(c.slug)}.yaml</a><p class="share-line">Share ${share(`${c.name} is ${c.tier} tier on the MCP clients scorecard`, pageUrl)}</p></div>
<h2 class="checks-hd">Every check, with its source</h2>
<div class="checks">${checks}</div>
${SO_GUIDE[c.slug] ? `<p class="so-note">Connect ${esc(c.name)} to the business apps your team already uses: <a href="${SO}/platform/mcp/ai-agent/${SO_GUIDE[c.slug]}/">set up the StackOne MCP server in ${esc(c.name)}</a>.</p>` : ''}
<section class="embed"><h2>Show your tier</h2><p><img src="/badges/${c.slug}.svg" alt="MCP clients scorecard: tier ${c.tier}" ${badgeSize(c)}></p>
<p class="muted">Add the badge to a README. It updates when the tier does.</p>
<div class="code"><pre>${esc(md)}</pre><button type="button" class="btn" data-copy="${attr(md)}">Copy Markdown</button></div>
<div class="code"><pre>${esc(html)}</pre><button type="button" class="btn" data-copy="${attr(html)}">Copy HTML</button></div></section>
<nav class="pager" aria-label="Other clients">${prev ? pagerLink(prev, 'prev', '← previous') : ''}${next ? pagerLink(next, 'next', 'next →') : ''}</nav>
</main>`;
}

function share(text, url) {
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  return `<a class="slink" href="${attr(x)}" target="_blank" rel="noopener">X</a><a class="slink" href="${attr(li)}" target="_blank" rel="noopener">LinkedIn</a><button type="button" class="slink" data-copy="${attr(url)}">Copy link</button>`;
}

const counts = c => ({ y: FEATURES.filter(([k]) => c.cells[k].value === 'y').length, p: FEATURES.filter(([k]) => c.cells[k].value === 'p').length });
function supportLine(c) {
  const { y, p } = counts(c);
  return `${y}${p ? ` (plus ${p} partly)` : ''} of ${FEATURES.length}`;
}

// ---------- answers for search and AI assistants: one plain-text source, shown on the page, in JSON-LD and in the Markdown copies

const plain = s => String(s).replace(/`([^`]+)`/g, '$1');
const sentence = s => plain(s).trim().replace(/[.;:,]?$/, '.');
const list = (names, and = 'and') => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}`);
const byRank = data => [...data.clients].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || featureScore(b) - featureScore(a) || a.name.localeCompare(b.name));
const withValue = (data, k, v) => byRank(data).filter(c => c.cells[k].value === v);

function summary(data, c) {
  const of = v => FEATURES.filter(([k]) => c.cells[k].value === v).map(([, l]) => l);
  const [y, p, n] = [of('y'), of('p'), of('n')];
  const g = protocolGrade(c.cells.protocol.value, data.spec_versions);
  return [`${c.name} is ${c.tier} tier on the MCP clients scorecard as of ${formatDate(data.as_of)}.`, y.length && `It supports ${list(y)}.`,
    p.length && `It partly supports ${list(p)}.`, n.length && `It does not support ${list(n, 'or')}.`, g === 'x' ? 'It has not published which MCP spec version it supports.' : `It speaks MCP spec ${c.cells.protocol.value} (${GRADE[g]}).`].filter(Boolean).join(' ');
}

function homeFaq(data) {
  const n = data.clients.length;
  const tier = t => byRank(data).filter(c => c.tier === t).map(c => c.name);
  const top = ['S', 'A', 'B', 'C', 'D'].filter(t => tier(t).length).slice(0, 2);
  const latest = String(data.spec_versions[0]); // newest first (data/meta.yaml)
  const current = byRank(data).filter(c => protocolGrade(c.cells.protocol.value, data.spec_versions) === 'g').map(c => c.name);
  return [
    ['What is the best MCP client?', `As of ${formatDate(data.as_of)}, the highest ranked MCP clients, in ${top[0]} tier, are ${list(tier(top[0]))}${top[1] ? `, followed in ${top[1]} tier by ${list(tier(top[1]))}` : ''}. Tiers come from ${COLUMNS.length} checks: the MCP spec version and features such as MCP Apps, Tasks, CIMD and elicitation, plus how the client handles tools (code mode, tool search). Every cell links to a dated source.`],
    ...FEATURES.map(([k, l]) => {
      const y = withValue(data, k, 'y').map(c => c.name), p = withValue(data, k, 'p').map(c => c.name);
      const lead = y.length ? `${y.length} of ${n} MCP clients support${y.length === 1 ? 's' : ''} ${l}: ${list(y)}.` : `None of the ${n} MCP clients fully supports ${l} yet.`;
      return [`Which MCP clients support ${l}?`, `${lead}${p.length ? ` ${list(p)} support${p.length === 1 ? 's' : ''} it partly.` : ''}`];
    }),
    ['Which MCP clients support the latest MCP spec?', current.length ? `${current.length} of ${n} clients speak the current MCP spec, ${latest}: ${list(current)}.` : `None of the ${n} clients speaks the current MCP spec, ${latest}, yet.`],
    ['How often is the MCP clients scorecard updated?', `Every Monday. Each cell records the date it was last checked and links to its source: a live probe, the client's source code, its docs or a changelog. The last refresh was on ${formatDate(data.as_of)}.`],
  ];
}

function clientFaq(data, c) {
  return COLUMNS.map(([k, l]) => {
    const cell = c.cells[k];
    const s = cell.since;
    const when = `Checked ${formatDate(cell.checked)}${s ? `, shipped ${formatDate(s.date)}${s.version ? ` in ${s.version}` : ''}` : ''}.`;
    if (k === 'protocol') {
      const g = protocolGrade(cell.value, data.spec_versions);
      return [`Which MCP spec version does ${c.name} support?`, `${g === 'x' ? `${c.name} has not published it` : `${cell.value} (${GRADE[g]})`}. ${sentence(cell.evidence)} ${when}`];
    }
    return [`Does ${c.name} support ${l}?`, `${MARK[cell.value]}. ${sentence(cell.evidence)} ${when}`];
  });
}

const ORG = { '@type': 'Organization', '@id': `${SO}/#organization`, name: 'StackOne', url: `${SO}/`, logo: `${SO}/stackone-logo.svg`, sameAs: ['https://github.com/StackOneHQ', 'https://x.com/StackOneHQ'] };
const WEBSITE = { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: TITLE, inLanguage: 'en', publisher: { '@id': ORG['@id'] } };
const faqLd = faq => ({ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

function homeJsonld(data, faq) {
  const ranked = byRank(data);
  return { '@context': 'https://schema.org', '@graph': [ORG, WEBSITE,
    { '@type': 'Dataset', '@id': `${SITE}/#dataset`, name: TITLE, url: `${SITE}/`, description: `Which MCP clients support which parts of the Model Context Protocol, with a linked, dated source for every cell. ${data.clients.length} clients, ${COLUMNS.length} checks.`,
      license: 'https://opensource.org/licenses/MIT', isAccessibleForFree: true, creator: { '@id': ORG['@id'] }, publisher: { '@id': ORG['@id'] }, dateModified: String(data.as_of), isBasedOn: REPO,
      keywords: ['MCP', 'Model Context Protocol', 'MCP clients', ...FEATURES.map(([, l]) => l)], variableMeasured: COLUMNS.map(([, l]) => l),
      distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/data.json` }] },
    { '@type': 'ItemList', name: 'MCP clients ranked by tier', itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: ranked.length,
      itemListElement: ranked.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: `${c.name} (${c.tier} tier)`, url: SITE + clientUrl(c) })) },
    faqLd(faq)] };
}

function clientJsonld(data, c, qa) {
  const url = SITE + clientUrl(c);
  return { '@context': 'https://schema.org', '@graph': [ORG, WEBSITE,
    { '@type': 'WebPage', '@id': url, url, name: `${c.name} MCP support`, description: summary(data, c), dateModified: String(data.as_of), isPartOf: { '@id': WEBSITE['@id'] },
      about: { '@type': 'SoftwareApplication', name: c.name, applicationCategory: 'DeveloperApplication', ...(c.website && { url: c.website }) } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Tier list', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: c.name, item: url }] },
    faqLd(qa)] };
}

const mdCell = (data, k, cell) => (k === 'protocol' ? String(cell.value) : MARK[cell.value]);

const yamlString = v => JSON.stringify(String(v));
const frontmatter = (meta, asOf) => ['---', `title: ${yamlString(meta.title)}`, `description: ${yamlString(meta.description)}`, `canonical_url: ${SITE + meta.path}`, `last_updated: ${asOf}`, '---', '', ''].join('\n');

function homeMarkdown(data, faq) {
  const ranked = byRank(data);
  return [`# ${TITLE}`, '', `> ${data.clients.length} MCP clients ranked S to D on ${COLUMNS.length} checks, with a linked, dated source for every cell. Updated ${formatDate(data.as_of)}, rechecked every Monday. Maintained by StackOne. Data MIT licensed: ${SITE}/data.json`, '',
    '## Tiers', '', ...TIERS.map(t => `- **${t}**: ${data.clients.filter(c => c.tier === t).map(c => `[${c.name}](${SITE + clientUrl(c)})`).join(', ') || 'none'}`), '',
    '## Every client', '', `| Client | Tier | ${COLUMNS.map(([, l]) => l).join(' | ')} |`, `|${' --- |'.repeat(COLUMNS.length + 2)}`,
    ...ranked.map(c => `| [${c.name}](${SITE + clientUrl(c)}) | ${c.tier} | ${COLUMNS.map(([k]) => `[${mdCell(data, k, c.cells[k])}](${c.cells[k].source} "checked ${c.cells[k].checked}")`).join(' | ')} |`), '',
    '## Questions', '', ...faq.flatMap(([q, a]) => [`### ${q}`, '', a, '']),
    '## What each column means', '', ...data.features.map(f => `- **${f.label}**: ${plain(f.definition)} (${f.url})`), '',
    `Source and methodology: ${REPO}`, ''].join('\n');
}

function clientMarkdown(data, c, qa) {
  return [`# ${c.name} MCP support`, '', `> ${summary(data, c)}`, '', `Tier: ${c.tier}. MCP bugs fixed: ${fixText(c.fix)}.${c.version_checked ? ` Version checked: ${c.version_checked}.` : ''}`, '',
    '| Check | Value | Evidence | Source | Checked |', '| --- | --- | --- | --- | --- |',
    ...COLUMNS.map(([k, l]) => { const cell = c.cells[k]; return `| ${l} | ${mdCell(data, k, cell)} | ${plain(cell.evidence).replace(/\|/g, '\\|')} | ${cell.source} | ${cell.checked} |`; }), '',
    ...qa.flatMap(([q, a]) => [`### ${q}`, '', a, '']), `Full scorecard: ${SITE}/`, ''].join('\n');
}

function llmsFull(data) {
  const faq = homeFaq(data);
  return [homeMarkdown(data, faq), ...byRank(data).map(c => clientMarkdown(data, c, clientFaq(data, c)))].join('\n---\n\n');
}

// Search engines and AI assistants may read, cite and learn from the data, which is MIT licensed
const ROBOTS = `User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

// ---------- what changed: against the newest snapshot at least 6 days older than as_of, so the list covers a weekly refresh

function previousSnapshot(asOf) {
  const cutoff = new Date(Date.parse(asOf + 'T00:00:00Z') - 6 * 864e5).toISOString().slice(0, 10);
  const dates = fs.readdirSync(ROOT + 'data/history').map(f => f.replace(/\.json$/, '')).filter(d => d <= cutoff).sort();
  if (!dates.length) return null;
  const file = `data/history/${dates.at(-1)}.json`;
  const snap = JSON.parse(fs.readFileSync(ROOT + file, 'utf8'));
  // Old snapshots are committed files that load() never validates, and they feed the home page
  const bad = Object.entries(snap.clients).find(([, c]) => !TIERS.includes(c.tier) || typeof c.name !== 'string'
    || COLUMNS.some(([k]) => k !== 'protocol' && c[k] !== undefined && !Object.hasOwn(MARK, c[k])));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snap.as_of) || bad) throw new Error(`${file}: invalid snapshot${bad ? ` entry ${bad[0]}` : ''}`);
  return snap;
}

function diff(previous, data) {
  const out = [];
  for (const c of data.clients) {
    const was = Object.hasOwn(previous.clients, c.slug) && previous.clients[c.slug];
    const name = `<a href="${clientUrl(c)}">${esc(c.name)}</a>`;
    if (!was) { out.push(`${name} joins the board in ${c.tier} tier`); continue; }
    if (was.tier !== c.tier) out.push(`${name} moves from ${esc(was.tier)} to ${c.tier} tier`);
    const flips = COLUMNS.filter(([k]) => was[k] !== undefined && String(was[k]) !== String(c.cells[k].value))
      .map(([k]) => `${esc(LABEL[k])} ${k === 'protocol' ? `${esc(was[k])} → ${esc(c.cells[k].value)}` : `${MARK[was[k]].toLowerCase()} → ${MARK[c.cells[k].value].toLowerCase()}`}`);
    if (flips.length) out.push(`${name}: ${flips.join(', ')}`);
  }
  for (const [slug, was] of Object.entries(previous.clients)) if (!data.clients.some(c => c.slug === slug)) out.push(`${esc(was.name)} leaves the board`);
  return out;
}

// ---------- machine-readable copies

function publicData(data) {
  return {
    as_of: String(data.as_of),
    spec_versions: data.spec_versions.map(String),
    source: REPO,
    features: data.features.map(({ id, label, definition, ref, url, kind }) => ({ id, label, definition, ref, url, kind: kind || 'spec' })),
    clients: data.clients.map(c => ({
      slug: c.slug, name: c.name, group: c.group, tier: c.tier, url: SITE + clientUrl(c), logo: `${SITE}/assets/logos/${c.logo}`, version_checked: c.version_checked ?? null,
      mcp_bugs_fixed: c.fix, mcp_bugs_fixed_text: fixText(c.fix),
      cells: Object.fromEntries(COLUMNS.map(([k]) => {
        const { value, method, source, evidence, checked, label, quality, fallback, since } = c.cells[k];
        return [k, { value: String(value), method, source, evidence, checked: String(checked), ...(label && { label }), ...(quality && { quality }), ...(fallback && { fallback }), ...(since && { since: { ...since, date: String(since.date) } }) }];
      })),
    })),
  };
}

function llms(data) {
  return [`# ${TITLE}`, '', `> Which MCP clients support which parts of the Model Context Protocol, with a linked source for every cell. As of ${data.as_of}. Maintained by StackOne.`, '',
    `Full data as JSON: ${SITE}/data.json`, `Every page with its Markdown copy: ${SITE}/sitemap.md`, `Source and methodology: ${REPO}`, '', '## Tiers', '',
    ...TIERS.map(t => `- ${t}: ${data.clients.filter(c => c.tier === t).map(c => `[${c.name}](${SITE + clientUrl(c)})`).join(', ') || 'none'}`), ''].join('\n');
}

// The sitemap for agents: every page, its Markdown copy and when it last changed
function sitemapMd(data) {
  const row = (name, u) => `- [${name}](${SITE + u}) ([Markdown](${SITE + u}index.md))`;
  return [`# ${TITLE}: sitemap`, '', `Last updated ${data.as_of}.`, '', row('Tier list', '/'), '', '## Clients', '',
    ...byRank(data).map(c => row(`${c.name}, ${c.tier} tier`, clientUrl(c))), '', '## Data', '',
    `- [data.json](${SITE}/data.json)`, `- [llms-full.txt](${SITE}/llms-full.txt)`, ''].join('\n');
}

function sitemap(data) {
  const urls = ['/', ...data.clients.map(clientUrl)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${SITE + u}</loc><lastmod>${data.as_of}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

// ---------- share cards (1200x630): `npm run build` draws them into assets/og/ with Chrome and commits them

const MARK_URI = `data:image/svg+xml;base64,${fs.readFileSync(ROOT + 'assets/mark.svg').toString('base64')}`;
// StackOne dark canvas: warm grey with a soft vignette, brand faces, tier colours as the one bright element
const cardCss = `*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;color:#F4F2F0;font-family:Geist,system-ui,sans-serif;padding:56px 64px;position:relative;overflow:hidden;background:radial-gradient(85% 75% at 50% 35%,#3B3B3B 0%,#2B2B2B 100%)}
h1,.brand,.tier,.t{font-family:'Stack Sans Text',Geist,sans-serif;font-weight:500}.mono{font-family:'Geist Mono',monospace}
.brand{display:flex;align-items:center;gap:14px;font-size:26px}.brand img{width:44px;height:44px}
.so{position:absolute;right:64px;bottom:52px;height:22px}.foot{position:absolute;left:64px;bottom:50px;font-size:22px;color:#A19F9E}
.lg{background:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}.lg img{width:70%;height:70%;object-fit:contain}
.dots{display:flex;gap:10px}.dots i{width:22px;height:22px;border-radius:8.8px;background:#4A4A4A}.dots i.y{background:#76D6AE}.dots i.p{background:#E1BF92}`;
const brand = `<div class="brand"><img src="${MARK_URI}" alt="">${TITLE}</div>`;
const cardFoot = data => `<div class="foot mono">${new URL(SITE).host} · ${formatDate(data.as_of)}</div><img class="so" src="${logo('stackone-white.svg')}" alt="StackOne">`;

function indexCard(data) {
  const rows = TIERS.map(t => `<div class="t" style="background:${TIER_COLOR[t]}">${t}</div><div class="r">${data.clients.filter(c => c.tier === t).map(c => `<div class="lg"><img src="${logo(c.logo)}"></div>`).join('')}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${cardCss}
h1{font-size:46px;line-height:1.1;letter-spacing:-.5px;margin:28px 0 24px;max-width:720px}.b{display:grid;grid-template-columns:56px 1fr;gap:6px;width:720px}
.t{color:#222121;font-size:28px;display:flex;align-items:center;justify-content:center;height:46px;border-radius:10px}.r{background:#242424;border-radius:10px;display:flex;gap:8px;align-items:center;padding:0 8px}.r .lg{width:36px;height:36px;border-radius:9px}
.side{position:absolute;right:64px;top:176px;width:320px;display:grid;gap:28px}.side b{display:block;font-size:56px;font-weight:500;line-height:1}.side span{color:#A19F9E;font-size:22px}
</style></head><body>${brand}<h1>Which MCP clients actually support MCP?</h1><div class="b">${rows}</div>
<div class="side"><div><b class="mono">${data.clients.length}</b><span>clients ranked S to D</span></div><div><b class="mono">${COLUMNS.length}</b><span>checks, each with a dated source</span></div></div>
${cardFoot(data)}</body></html>`;
}

function clientCard(data, c) {
  const { y, p } = counts(c);
  const g = protocolGrade(c.cells.protocol.value, data.spec_versions);
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${cardCss}
.h{display:flex;align-items:center;gap:32px;margin-top:52px}.h .lg{width:132px;height:132px;border-radius:30px}
h1{font-size:76px;line-height:1.05;letter-spacing:-1px;max-width:600px}.tier{position:absolute;right:64px;top:124px;width:220px;height:220px;color:#222121;font-size:150px;display:flex;align-items:center;justify-content:center;border-radius:28px}
.stats{display:flex;gap:56px;margin-top:48px}.stats b{display:block;font-size:44px;font-weight:500}.stats span{display:block;font-size:22px;color:#A19F9E;margin-top:6px}.dots{margin-top:36px}
</style></head><body>${brand}<div class="h"><div class="lg"><img src="${logo(c.logo)}"></div><h1>${esc(c.name)}</h1></div>
<div class="tier" style="background:${TIER_COLOR[c.tier]}">${c.tier}</div>
<div class="stats"><div><b class="mono">${y}/${FEATURES.length}</b><span>features supported</span></div>${p ? `<div><b class="mono">${p}</b><span>partly</span></div>` : ''}<div><b class="mono">${g === 'x' ? 'n/a' : esc(c.cells.protocol.value)}</b><span>${g === 'x' ? 'spec version not published' : `spec version, ${GRADE[g]}`}</span></div></div>
<div class="dots">${FEATURES.map(([k]) => `<i class="${c.cells[k].value}"></i>`).join('')}</div>
${cardFoot(data)}</body></html>`;
}

// [name, html] for every share card, drawn to assets/og/<name>.png
export const shareCards = data => [['index', indexCard(data)], ...data.clients.map(c => [c.slug, clientCard(data, c)])];

const JS = fs.readFileSync(ROOT + 'render/site/app.js', 'utf8');

// Tier colours come from images.mjs so the site, the charts and the badges always agree
const CSS = `:root{${TIERS.map(t => `--t-${t}:${TIER_COLOR[t]}`).join(';')}}\n` + fs.readFileSync(ROOT + 'render/site/style.css', 'utf8');
// Cache buster for the two files, so a deploy never pairs new HTML with a cached old script or stylesheet
const VERSION = crypto.createHash('sha256').update(CSS + JS).digest('hex').slice(0, 10);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = buildSite(ROOT + 'dist');
  console.log(`wrote dist/: ${r.pages} pages, ${r.changes} changes listed`);
}
