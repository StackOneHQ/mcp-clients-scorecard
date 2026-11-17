// The website, generated from data/ into dist/ and deployed to Cloudflare by the build workflow.
// npm run site                  build dist/, with the share cards drawn by Chrome
// npm run site -- --no-og       skip the share cards (no Chrome needed); pages point at assets/tiers.png instead
import fs from 'node:fs';
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

function page({ title, description, path: p, image, body, noindex = false }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${attr(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${attr(SITE + p)}">`}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:site_name" content="${TITLE}"><meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(SITE + p)}"><meta property="og:image" content="${attr(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@StackOneHQ"><meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(description)}"><meta name="twitter:image" content="${attr(image)}">
${FONT}<link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script></head>
<body><header class="top"><div class="wrap bar"><a class="brand" href="/"><span class="dot">S</span>${TITLE}</a>
<nav><a href="/#tiers">Tiers</a><a href="/#matrix">Matrix</a><a href="/#changes">Changes</a><a href="${REPO}/blob/main/methodology/METHODOLOGY.md">Method</a><a class="gh" href="${REPO}">GitHub</a></nav></div></header>
${body}
<footer class="wrap foot"><p>Maintained by <a href="https://www.stackone.com">StackOne</a>. Data is MIT licensed: <a href="/data.json">data.json</a> · <a href="/llms.txt">llms.txt</a> · <a href="${REPO}">source</a>.</p>
<p>Spotted a wrong cell? <a href="${REPO}/blob/main/CONTRIBUTING.md">Send a pull request</a> with a source and it moves.</p></footer>
</body></html>
`;
}

function home(data, changes, previous) {
  const perTier = TIERS.map(t => [t, data.clients.filter(c => c.tier === t).length]);
  const shareText = `${data.clients.length} MCP clients ranked S to D, with a source behind every cell`;
  return `<main>
<section class="wrap hero"><p class="kicker">Updated ${formatDate(data.as_of)} · rechecked every Monday</p>
<h1>Which MCP clients actually support MCP?</h1>
<p class="lede">${data.clients.length} clients, ${COLUMNS.length} checks, and a linked, dated source for every cell. Click any client for the evidence.</p>
<div class="ctas"><a class="btn primary" href="#matrix">See every cell</a><a class="btn" href="${REPO}/blob/main/CONTRIBUTING.md">Ranked wrong? Send a PR</a>${share(shareText, SITE + '/')}</div></section>
<section id="tiers" class="wrap"><div class="board">
<div></div>${GROUPS.map(([, l]) => `<div class="colhd">${l}</div>`).join('')}
${TIERS.map(t => `<div class="tier tc-${t}">${t}</div>${GROUPS.map(([g]) => `<div class="row">${data.clients.filter(c => c.group === g && c.tier === t).map(chip).join('')}</div>`).join('')}`).join('\n')}
</div><p class="note">${perTier.map(([t, n]) => `${n} in ${t}`).join(' · ')}. Tiers follow the <a href="${REPO}/blob/main/methodology/RUBRIC.md">rubric</a>.</p></section>
${changes.length ? `<section id="changes" class="wrap"><h2>What changed since ${formatDate(previous.as_of)}</h2><ul class="changes">${changes.map(ch => `<li>${ch}</li>`).join('')}</ul></section>` : `<section id="changes" class="wrap"><h2>What changed</h2><p class="note">${previous ? `No changes since ${formatDate(previous.as_of)}.` : 'No earlier snapshot to compare against yet.'}</p></section>`}
<section id="matrix" class="wrap"><h2>Every cell, with its source</h2><p class="note">Hover a cell for the evidence, click it for the source. Columns marked harness are how a client handles tools, not part of the MCP spec.</p>
<div class="scroll">${matrix(data)}</div>
<details class="defs"><summary>What each column means</summary><dl>${data.features.map(f => `<dt>${esc(f.label)}${HARNESS.has(f.id) ? ' <span class="tag">harness</span>' : ''}</dt><dd>${prose(f.definition)} <a href="${attr(f.url)}">${esc(f.ref)}</a></dd>`).join('')}
<dt>MCP bugs fixed</dt><dd>The share of the client's MCP issues since ${formatDate(data.bug_window_start)} closed as completed, duplicates removed. <a href="${REPO}/blob/main/methodology/METHODOLOGY.md#mcp-bugs-fixed">How it is counted</a></dd></dl></details></section>
<section class="wrap"><h2>Adoption over time</h2><img class="chart" src="/assets/history-features.png" alt="Which MCP clients shipped each feature, and when" loading="lazy" width="1200" height="700">
<img class="chart" src="/assets/history-clients.png" alt="Features supported per client over time" loading="lazy" width="1200" height="700"></section>
</main>`;
}

const chip = c => `<a class="chip" href="${clientUrl(c)}"><span class="lg"><img src="/assets/logos/${attr(c.logo)}" alt="" width="40" height="40"></span><span>${esc(c.name)}</span></a>`;

function cellHtml(data, key, cell) {
  if (key === 'protocol') {
    const g = protocolGrade(cell.value, data.spec_versions);
    return `<span class="pv ${g}">${esc(cell.value)}${cell.fallback ? '*' : ''}</span>`;
  }
  const label = key === 'tool_search' && cell.value === 'y' && cell.label ? `<span class="lbl">${esc(cell.label)}</span>` : '';
  return `<img src="/assets/icons/${cell.value}.svg" alt="${MARK[cell.value]}" width="18" height="18">${label}`;
}

function matrix(data) {
  const head = `<tr><th>Client</th><th>Tier</th><th>MCP bugs fixed</th>${COLUMNS.map(([k, l]) => `<th${HARNESS.has(k) ? ' class="h"' : ''}>${esc(l)}</th>`).join('')}</tr>`;
  const rows = GROUPS.map(([g, label]) => `<tr class="grp"><td colspan="${COLUMNS.length + 3}">${label}</td></tr>`
    + data.clients.filter(c => c.group === g).map(c => `<tr><th><a href="${clientUrl(c)}"><img src="/assets/logos/${attr(c.logo)}" alt="" width="20" height="20">${esc(c.name)}</a></th>`
      + `<td><span class="tb tc-${c.tier}">${c.tier}</span></td><td class="fix">${esc(fixText(c.fix))}</td>`
      + COLUMNS.map(([k]) => `<td${HARNESS.has(k) ? ' class="h"' : ''}><a href="${attr(c.cells[k].source)}" title="${attr(c.cells[k].evidence)}" rel="nofollow">${cellHtml(data, k, c.cells[k])}</a></td>`).join('')
      + '</tr>').join('')).join('');
  return `<table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function clientPage(data, c, prev, next) {
  const pageUrl = SITE + clientUrl(c);
  const badge = `${SITE}/badges/${c.slug}.svg`;
  const md = `[![MCP clients scorecard: tier ${c.tier}](${badge})](${pageUrl})`;
  const html = `<a href="${pageUrl}"><img src="${badge}" alt="MCP clients scorecard: tier ${c.tier}"></a>`;
  const links = [['Website', c.website], ['Docs', c.docs], ['Repo', c.repo], c.tracker && ['Issues', `https://github.com/${c.tracker.repo}/issues`]].filter(l => l && l[1]);
  const rows = COLUMNS.map(([k, l]) => {
    const cell = c.cells[k];
    const f = data.features.find(x => x.id === k);
    const s = cell.since;
    const value = k === 'protocol' ? `${esc(cell.value)} <span class="muted">(${GRADE[protocolGrade(cell.value, data.spec_versions)]}${cell.fallback ? `, falls back to ${esc(cell.fallback)}` : ''})</span>` : `<img src="/assets/icons/${cell.value}.svg" alt="" width="18" height="18"> ${MARK[cell.value]}${cell.value === 'y' && cell.label ? ` <span class="muted">(${esc(cell.label)})</span>` : ''}`;
    return `<tr><th><span title="${attr(f.definition)}">${esc(l)}</span>${HARNESS.has(k) ? ' <span class="tag">harness</span>' : ''}</th><td class="v">${value}</td>
<td>${prose(cell.evidence)}<div class="src"><a href="${attr(cell.source)}" rel="nofollow">Source: ${METHOD[cell.method]}</a> · checked ${formatDate(cell.checked)}${s ? ` · shipped <a href="${attr(s.source)}" rel="nofollow">${formatDate(s.date)}${s.version ? ` in ${esc(s.version)}` : ''}</a>` : ''}</div></td></tr>`;
  }).join('\n');
  return `<main class="wrap">
<nav class="crumbs"><a href="/">Tier list</a> / ${esc(c.name)}</nav>
<section class="client"><div class="big lg"><img src="/assets/logos/${attr(c.logo)}" alt="" width="72" height="72"></div>
<div><h1>${esc(c.name)}</h1><p class="muted">${c.group === 'cli' ? 'CLI' : 'App or IDE'} · ${c.version_checked ? `version ${esc(c.version_checked)}` : 'hosted'} · MCP bugs fixed: ${esc(fixText(c.fix))}</p>
<p class="links">${links.map(([l, u]) => `<a href="${attr(u)}">${l}</a>`).join(' · ')}</p></div>
<div class="tierbig tc-${c.tier}" title="Tier ${c.tier}">${c.tier}</div></section>
${c.tier_note ? `<p class="callout">${prose(c.tier_note)}</p>` : ''}${c.note ? `<p class="callout">${prose(c.note)}</p>` : ''}
<div class="ctas">${share(`${c.name} is ${c.tier} tier on the MCP clients scorecard`, pageUrl)}<a class="btn" href="${REPO}/edit/main/data/clients/${c.slug}.yaml">Wrong? Edit ${esc(c.slug)}.yaml</a></div>
<div class="scroll"><table class="cells"><thead><tr><th>Check</th><th>Value</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div>
<section class="embed"><h2>Show your tier</h2><p><img src="/badges/${c.slug}.svg" alt="MCP clients scorecard: tier ${c.tier}"></p>
<p class="muted">Add the badge to a README. It updates when the tier does.</p>
<div class="code"><pre>${esc(md)}</pre><button type="button" data-copy="${attr(md)}">Copy Markdown</button></div>
<div class="code"><pre>${esc(html)}</pre><button type="button" data-copy="${attr(html)}">Copy HTML</button></div></section>
<nav class="pager">${prev ? `<a href="${clientUrl(prev)}">← ${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a href="${clientUrl(next)}">${esc(next.name)} →</a>` : ''}</nav>
</main>`;
}

function share(text, url) {
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  return `<span class="share"><a class="btn" href="${attr(x)}" target="_blank" rel="noopener">Share on X</a><a class="btn" href="${attr(li)}" target="_blank" rel="noopener">LinkedIn</a><button type="button" class="btn" data-copy="${attr(url)}">Copy link</button></span>`;
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
  const label = Object.fromEntries(COLUMNS);
  for (const c of data.clients) {
    const was = Object.hasOwn(previous.clients, c.slug) && previous.clients[c.slug];
    const name = `<a href="${clientUrl(c)}">${esc(c.name)}</a>`;
    if (!was) { out.push(`${name} joins the board in ${c.tier} tier`); continue; }
    if (was.tier !== c.tier) out.push(`${name} moves from ${esc(was.tier)} to ${c.tier} tier`);
    const flips = COLUMNS.filter(([k]) => was[k] !== undefined && String(was[k]) !== String(c.cells[k].value))
      .map(([k]) => `${esc(label[k])} ${k === 'protocol' ? `${esc(was[k])} → ${esc(c.cells[k].value)}` : `${MARK[was[k]].toLowerCase()} → ${MARK[c.cells[k].value].toLowerCase()}`}`);
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
      slug: c.slug, name: c.name, group: c.group, tier: c.tier, url: SITE + clientUrl(c), version_checked: c.version_checked ?? null,
      mcp_bugs_fixed: c.fix,
      cells: Object.fromEntries(COLUMNS.map(([k]) => {
        const { value, method, source, evidence, checked, label, quality, fallback, since } = c.cells[k];
        return [k, { value: String(value), method, source, evidence, checked: String(checked), ...(label && { label, quality }), ...(fallback && { fallback }), ...(since && { since: { ...since, date: String(since.date) } }) }];
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

const cardCss = `*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:#000;color:#fff;font-family:Inter,system-ui,sans-serif;padding:56px 64px;position:relative;overflow:hidden}
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

const JS = `document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  navigator.clipboard.writeText(b.dataset.copy).then(() => {
    const t = b.textContent;
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = t; }, 1500);
  });
});
`;

const CSS = `${TIERS.map(t => `.tc-${t}{background:${TIER_COLOR[t]}}`).join('')}
*{box-sizing:border-box}html{background:#000;color:#EDEDED;font-family:Inter,system-ui,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0;line-height:1.5}a{color:#fff}a:hover{color:${TIER_COLOR.A}}img{max-width:100%}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px}.narrow{max-width:640px;padding-top:80px}
.top{border-bottom:1px solid #222;position:sticky;top:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);z-index:5}
.bar{display:flex;align-items:center;justify-content:space-between;height:56px;gap:16px}.brand{font-weight:700;text-decoration:none;display:flex;align-items:center;gap:10px;white-space:nowrap}
.dot{background:${TIER_COLOR.S};color:#1a1a17;border-radius:7px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}
.top nav a{color:#B5B5B0;text-decoration:none;margin-left:18px;font-size:15px}.top nav a:hover{color:#fff}.top nav .gh{color:#fff}
.hero{padding:64px 16px 32px}.kicker{color:${TIER_COLOR.D};font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase;margin:0}
h1{font-size:clamp(34px,6vw,64px);line-height:1.05;letter-spacing:-.03em;margin:12px 0 16px;font-weight:800}h2{font-size:28px;letter-spacing:-.02em;margin:56px 0 12px}
.lede{font-size:20px;color:#B5B5B0;max-width:720px;margin:0 0 24px}.note,.muted{color:#8A8A85;font-size:15px}
.ctas{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:16px 0}.share{display:inline-flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-block;border:1px solid #333;background:#111;color:#fff;border-radius:999px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}
.btn:hover{border-color:#666;color:#fff}.btn.primary{background:#fff;color:#000;border-color:#fff}
.board{display:grid;grid-template-columns:72px 1fr 1fr;gap:4px}.colhd{text-align:center;font-weight:700;color:#B5B5B0;padding:6px}
.tier{color:#1a1a17;font-size:40px;font-weight:800;display:flex;align-items:center;justify-content:center;min-height:104px}
.row{background:#1A1A17;display:flex;flex-wrap:wrap;align-content:center;gap:6px;padding:8px}
.chip{display:flex;flex-direction:column;align-items:center;gap:6px;width:92px;text-decoration:none;font-size:13px;font-weight:600;text-align:center;line-height:1.15;padding:4px;border-radius:12px}
.chip:hover{background:#2A2A26;color:#fff}.lg{background:#fff;border-radius:12px;width:56px;height:56px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}
.lg img{width:40px;height:40px;object-fit:contain}.big.lg{width:96px;height:96px;border-radius:22px}.big.lg img{width:72px;height:72px}
.changes{padding-left:20px}.changes li{margin:6px 0}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #222;border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid #1E1E1C;text-align:left;vertical-align:middle}
thead th{position:sticky;top:0;background:#0D0D0C;color:#B5B5B0;font-weight:600;white-space:nowrap}.matrix td{text-align:center}
.matrix tbody th{position:sticky;left:0;background:#000;white-space:nowrap;z-index:1}.matrix tbody th a{display:flex;align-items:center;gap:8px;text-decoration:none}
.matrix tbody th img{background:#fff;border-radius:5px;padding:2px}.matrix td a{display:inline-flex;align-items:center;gap:4px;text-decoration:none}
.matrix .h{background:#0A0A12}.grp td{text-align:left!important;font-weight:700;color:#8A8A85;background:#0D0D0C}.fix{white-space:nowrap;color:#B5B5B0}
.tb{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;color:#1a1a17;font-weight:800;border-radius:6px}
.pv{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}.pv.g{color:${TIER_COLOR.D}}.pv.a{color:${TIER_COLOR.A}}.pv.rd{color:${TIER_COLOR.S}}.pv.x{color:#8A8A85}
.lbl{font-size:12px;color:#B5B5B0}.tag{font-size:11px;border:1px solid #333;border-radius:4px;padding:0 4px;color:#8A8A85;font-weight:500}
.defs{margin:16px 0}.defs summary{cursor:pointer;font-weight:600}.defs dt{font-weight:700;margin-top:12px}.defs dd{margin:2px 0 0;color:#B5B5B0}
.chart{display:block;width:100%;height:auto;border-radius:12px;margin:12px 0}
.crumbs{margin:28px 0 0;color:#8A8A85;font-size:14px}.crumbs a{color:#B5B5B0}
.client{display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;margin:24px 0}.client h1{margin:0 0 4px}.client p{margin:2px 0}
.tierbig{width:120px;height:120px;border-radius:20px;color:#1a1a17;font-size:84px;font-weight:800;display:flex;align-items:center;justify-content:center}
.callout{border-left:3px solid ${TIER_COLOR.B};padding:8px 14px;background:#111;color:#B5B5B0}
.cells th{white-space:nowrap}.cells td.v{white-space:nowrap}.cells td.v img{vertical-align:middle}.src{font-size:13px;color:#8A8A85;margin-top:4px}
code{background:#1A1A17;border-radius:4px;padding:1px 4px;font-size:.92em;word-break:break-word}
.embed .code{display:flex;gap:10px;align-items:stretch;margin:8px 0}.embed pre{flex:1;margin:0;background:#111;border:1px solid #222;border-radius:8px;padding:10px;overflow-x:auto;font-size:13px}
.embed button{background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:0 12px;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}
.pager{display:flex;justify-content:space-between;margin:40px 0}.foot{border-top:1px solid #222;margin-top:64px;padding-top:24px;padding-bottom:40px;color:#8A8A85;font-size:14px}
@media (max-width:720px){.top nav a:not(.gh){display:none}
.cells thead{display:none}.cells tr{display:grid;grid-template-columns:1fr auto;border-bottom:1px solid #1E1E1C}.cells th,.cells td{border:0}.cells td:last-child{grid-column:1/-1;padding-top:0}.board{grid-template-columns:44px 1fr}.colhd{display:none}.board>div:first-child{display:none}
.tier{font-size:28px;grid-row:span 2;min-height:0}.chip{width:76px;font-size:12px}.lg{width:44px;height:44px}.lg img{width:32px;height:32px}
.client{grid-template-columns:auto 1fr}.tierbig{width:72px;height:72px;font-size:48px;grid-column:2;grid-row:1;justify-self:end}.big.lg{width:64px;height:64px}.big.lg img{width:48px;height:48px}
.embed .code{flex-direction:column}}
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const og = !process.argv.includes('--no-og');
  const r = buildSite(ROOT + 'dist', { og });
  console.log(`wrote dist/: ${r.pages} pages, ${r.changes} changes listed${og ? ', share cards drawn' : ', no share cards'}`);
}
