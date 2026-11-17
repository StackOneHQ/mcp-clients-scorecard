// The website, generated from data/ into dist/ and deployed to Cloudflare by the build workflow.
// npm run site                  build dist/, with the share cards drawn by Chrome
// npm run site -- --no-og       skip the share cards (no Chrome needed); pages point at assets/tiers.png instead
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, COLUMNS, HARNESS, TIERS, GROUPS, load, protocolGrade, formatDate, featureScore } from './data.mjs';
import { TIER_COLOR, FONT, logo, esc } from './images.mjs';
import { fixText } from './markdown.mjs';
import { screenshots } from './chrome.mjs';

const pkg = JSON.parse(fs.readFileSync(ROOT + 'package.json', 'utf8'));
const SITE = pkg.homepage.replace(/\/$/, '');
const REPO = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const TITLE = 'MCP clients scorecard';
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

export function buildSite(out, { og = true } = {}) {
  const model = load();
  const { data } = model;
  const previous = previousSnapshot(data.as_of);
  const changes = previous ? diff(previous, data) : [];
  fs.rmSync(out, { recursive: true, force: true });
  const write = (f, s) => {
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.writeFileSync(path.join(out, f), s);
  };
  const ogImage = name => (og ? `${SITE}/og/${name}.png` : `${SITE}/assets/tiers.png`);

  write('index.html', page({
    title: `${TITLE}: which MCP clients support MCP`,
    description: `${data.clients.length} MCP clients ranked S to D on ${COLUMNS.length} checks, with a linked source for every cell. Updated ${formatDate(data.as_of)}.`,
    path: '/',
    image: ogImage('index'),
    body: home(data, changes, previous),
  }));
  data.clients.forEach((c, i) => write(`clients/${c.slug}/index.html`, page({
    title: `${c.name} is ${c.tier} tier: ${TITLE}`,
    description: `${c.name} supports ${supportLine(c)} of the MCP features we track. Every cell links to its source.`,
    path: clientUrl(c),
    image: ogImage(c.slug),
    body: clientPage(data, c, data.clients[i - 1], data.clients[i + 1]),
  })));
  write('404.html', page({ title: `Not found: ${TITLE}`, description: 'Page not found', path: '/404', image: ogImage('index'), noindex: true, body: '<main class="wrap narrow"><h1>Not found</h1><p><a href="/">Back to the tier list</a></p></main>' }));
  write('data.json', JSON.stringify(publicData(data), null, 2) + '\n');
  write('llms.txt', llms(data));
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  write('sitemap.xml', sitemap(data));
  write('_headers', HEADERS);
  write('style.css', CSS);
  write('app.js', JS);
  write('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${TIER_COLOR.S}"/><text x="32" y="45" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="40" fill="#1a1a17">S</text></svg>\n`);
  for (const dir of ['logos', 'icons', 'badges']) fs.cpSync(ROOT + `assets/${dir}`, path.join(out, 'assets', dir), { recursive: true });
  for (const png of ['tiers', 'matrix', 'history-features', 'history-clients']) fs.cpSync(ROOT + `assets/${png}.png`, path.join(out, 'assets', `${png}.png`));
  // Short badge URLs for READMEs: /badges/<slug>.svg
  fs.cpSync(ROOT + 'assets/badges', path.join(out, 'badges'), { recursive: true });

  if (og) {
    fs.mkdirSync(path.join(out, 'og'), { recursive: true });
    screenshots([
      [indexCard(data), 1200, 630, path.join(out, 'og', 'index.png')],
      ...data.clients.map(c => [clientCard(data, c), 1200, 630, path.join(out, 'og', `${c.slug}.png`)]),
    ]);
  }
  return { pages: data.clients.length + 2, changes: changes.length };
}

// ---------- pages

// StackOne brand faces: Stack Sans Text for headings, Geist for text, Geist Mono for figures
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Stack+Sans+Text:wght@400;500&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">';
const icon = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SEARCH = icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const GITHUB = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" stroke="none" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const STACKONE = '<img class="wordmark" src="/assets/logos/stackone-white.svg" alt="StackOne" width="90" height="12">';
const groupLabel = g => (g === 'cli' ? 'CLI' : 'App or IDE');
const logoImg = (c, size) => `<span class="lg"><img src="/assets/logos/${attr(c.logo)}" alt="" width="${size}" height="${size}"></span>`;

function page({ title, description, path: p, image, body, noindex = false }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${attr(description)}"><meta name="theme-color" content="#242424"><meta name="color-scheme" content="dark">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${attr(SITE + p)}">`}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:site_name" content="${TITLE}"><meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(SITE + p)}"><meta property="og:image" content="${attr(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@StackOneHQ"><meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(description)}"><meta name="twitter:image" content="${attr(image)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONTS}<link rel="stylesheet" href="/style.css?v=${VERSION}"><script src="/app.js?v=${VERSION}" defer></script></head>
<body><header class="top"><div class="wrap bar"><div class="brand"><a class="home" href="/" aria-label="${TITLE}, home"><span class="dot">S</span><span>${TITLE}</span></a><a class="by" href="https://www.stackone.com/?utm_source=mcp-clients-scorecard">by ${STACKONE}</a></div>
<nav aria-label="Main"><a href="/#board">Tiers</a><a href="/#matrix">Matrix</a><a href="/#changes">Changes</a><a href="${REPO}/blob/main/methodology/RUBRIC.md">Method</a></nav>
<button type="button" class="search-btn" data-palette aria-label="Search clients and features">${SEARCH}<span>Search</span><kbd data-mod>Ctrl</kbd><kbd>K</kbd></button>
<a class="btn sm gh" href="${REPO}" aria-label="GitHub repo">${GITHUB}<span>GitHub</span></a></div></header>
${body}
<footer class="foot"><div class="wrap foot-in">
<div class="foot-brand"><a href="https://www.stackone.com/?utm_source=mcp-clients-scorecard">${STACKONE.replace('width="90" height="12"', 'width="120" height="16"')}</a>
<p>We test the StackOne MCP server against every client on this board, so we keep this list for ourselves and publish it. StackOne is integration infrastructure for AI agents.</p></div>
<nav class="foot-links" aria-label="Project"><a href="${REPO}">${GITHUB}GitHub repo</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Fix a wrong cell</a><a href="${REPO}/blob/main/methodology/RUBRIC.md">How tiers are scored</a><a href="/data.json">data.json</a><a href="/llms.txt">llms.txt</a></nav>
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

function home(data, changes, previous) {
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
<details class="defs"><summary>What each column means</summary><dl>${data.features.map(f => `<div><dt>${esc(f.label)}${HARNESS.has(f.id) ? ' <span class="tag">harness</span>' : ''}</dt><dd>${prose(f.definition)} <a href="${attr(f.url)}">${esc(f.ref)}</a></dd></div>`).join('')}
<div><dt>MCP bugs fixed</dt><dd>The share of the client's MCP issues since ${formatDate(data.bug_window_start)} closed as completed, duplicates removed. <a href="${REPO}/blob/main/methodology/METHODOLOGY.md#mcp-bugs-fixed">How it is counted</a></dd></div></dl></details></section>

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
${c.tier_note ? `<p class="callout">${prose(c.tier_note)}</p>` : ''}${c.note ? `<p class="callout">${prose(c.note)}</p>` : ''}
<div class="ctas"><a class="btn" href="/#compare=${attr(c.slug)}">Compare with another client</a><a class="btn" href="${REPO}/edit/main/data/clients/${c.slug}.yaml">${GITHUB}Wrong? Edit ${esc(c.slug)}.yaml</a><p class="share-line">Share ${share(`${c.name} is ${c.tier} tier on the MCP clients scorecard`, pageUrl)}</p></div>
<div class="checks">${checks}</div>
<section class="embed"><h2>Show your tier</h2><p><img src="/badges/${c.slug}.svg" alt="MCP clients scorecard: tier ${c.tier}"></p>
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
    `Full data as JSON: ${SITE}/data.json`, `Source and methodology: ${REPO}`, '', '## Tiers', '',
    ...TIERS.map(t => `- ${t}: ${data.clients.filter(c => c.tier === t).map(c => `[${c.name}](${SITE + clientUrl(c)})`).join(', ') || 'none'}`), ''].join('\n');
}

function sitemap(data) {
  const urls = ['/', ...data.clients.map(clientUrl)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${SITE + u}</loc><lastmod>${data.as_of}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

// ---------- share cards (1200x630), drawn by Chrome

const cardCss = `*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;color:#fff;font-family:Inter,system-ui,sans-serif;padding:56px 64px;position:relative;overflow:hidden;background:radial-gradient(600px 340px at 85% -10%,rgba(0,175,102,.35),transparent),radial-gradient(500px 300px at 10% 110%,rgba(255,127,127,.18),transparent),linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/40px 40px,#05060a}
.so{position:absolute;right:64px;bottom:48px;height:24px;opacity:.85}.foot{position:absolute;left:64px;bottom:48px;font-size:26px;color:#8A8A85}
.lg{background:#fff;border-radius:18px;display:flex;align-items:center;justify-content:center;overflow:hidden}.lg img{width:70%;height:70%;object-fit:contain}`;

function indexCard(data) {
  const rows = TIERS.map(t => `<div class="t" style="background:${TIER_COLOR[t]}">${t}</div><div class="r">${data.clients.filter(c => c.tier === t).map(c => `<div class="lg"><img src="${logo(c.logo)}"></div>`).join('')}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${cardCss}
h1{font-size:56px;font-weight:800;letter-spacing:-1.5px;margin-bottom:28px}.b{display:grid;grid-template-columns:64px 1fr;gap:6px;width:760px}
.t{color:#1a1a17;font-weight:800;font-size:34px;display:flex;align-items:center;justify-content:center;height:64px}.r{background:#1A1A17;display:flex;gap:8px;align-items:center;padding:0 8px}.r .lg{width:48px;height:48px;border-radius:12px}
.side{position:absolute;right:64px;top:150px;width:300px;font-size:34px;font-weight:700;line-height:1.25}.side span{color:#8A8A85;font-weight:500;font-size:26px;display:block;margin-top:14px}
</style></head><body><h1>Which MCP clients support MCP?</h1><div class="b">${rows}</div>
<div class="side">${data.clients.length} clients<br>${COLUMNS.length} checks<span>A linked source behind every cell</span></div>
<div class="foot">As of ${formatDate(data.as_of)}</div><img class="so" src="${logo('stackone-white.svg')}"></body></html>`;
}

function clientCard(data, c) {
  const { y, p } = counts(c);
  const g = protocolGrade(c.cells.protocol.value, data.spec_versions);
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${cardCss}
.k{font-size:28px;color:#8A8A85;font-weight:600;margin-bottom:40px}.h{display:flex;align-items:center;gap:36px}.h .lg{width:150px;height:150px;border-radius:34px}
h1{font-size:76px;font-weight:800;letter-spacing:-2px;line-height:1.05;max-width:630px}.tier{position:absolute;right:64px;top:56px;width:250px;height:250px;color:#1a1a17;font-size:190px;font-weight:800;display:flex;align-items:center;justify-content:center;border-radius:28px}
.stats{display:flex;gap:56px;margin-top:56px}.stats div{font-size:46px;font-weight:800}.stats span{display:block;font-size:24px;color:#8A8A85;font-weight:500;margin-top:6px}
</style></head><body><div class="k">MCP clients scorecard</div><div class="h"><div class="lg"><img src="${logo(c.logo)}"></div><h1>${esc(c.name)}</h1></div>
<div class="tier" style="background:${TIER_COLOR[c.tier]}">${c.tier}</div>
<div class="stats"><div>${y}/${FEATURES.length}<span>features supported</span></div>${p ? `<div>${p}<span>partly</span></div>` : ''}<div>${esc(c.cells.protocol.value)}<span>spec version, ${GRADE[g]}</span></div></div>
<div class="foot">As of ${formatDate(data.as_of)} · a source behind every cell</div><img class="so" src="${logo('stackone-white.svg')}"></body></html>`;
}

// ---------- static files

const HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
/badges/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
/data.json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
`;

const JS = fs.readFileSync(ROOT + 'render/site/app.js', 'utf8');

// Tier colours come from images.mjs so the site, the charts and the badges always agree
const CSS = `:root{${TIERS.map(t => `--t-${t}:${TIER_COLOR[t]}`).join(';')}}\n` + fs.readFileSync(ROOT + 'render/site/style.css', 'utf8');
// Cache buster for the two files, so a deploy never pairs new HTML with a cached old script or stylesheet
const VERSION = crypto.createHash('sha256').update(CSS + JS).digest('hex').slice(0, 10);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const og = !process.argv.includes('--no-og');
  const r = buildSite(ROOT + 'dist', { og });
  console.log(`wrote dist/: ${r.pages} pages, ${r.changes} changes listed${og ? ', share cards drawn' : ', no share cards'}`);
}
