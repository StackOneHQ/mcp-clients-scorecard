// HTML for the PNGs in assets/: the tier board and per-feature matrix (1080x1350), and the two adoption charts (1200x700)
import fs from 'node:fs';
import { ROOT, COLUMNS, TIERS, GROUPS, protocolGrade, formatDate } from './data.mjs';

const TIER_COLOR = { S: '#FF7F7F', A: '#FFBF7F', B: '#FFDF7F', C: '#FFFF7F', D: '#BFFF7F' };
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">';

const logo = f => {
  const b = fs.readFileSync(ROOT + 'assets/logos/' + f);
  return `data:${f.endsWith('.png') ? 'image/png' : 'image/svg+xml'};base64,${b.toString('base64')}`;
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function tiersHtml({ data }) {
  const item = c => {
    const cls = c.logo === 'gh-continue.png' ? ' class="png"' : c.logo.endsWith('.png') ? ' class="av"' : '';
    return `<div class="it"><div class="chip"><img src="${logo(c.logo)}"${cls}></div><span>${esc(c.name)}</span></div>`;
  };
  const cell = (g, t) => data.clients.filter(c => c.group === g && c.tier === t).map(item).join('');
  const rows = TIERS.map(t => `<div class="tier" style="background:${TIER_COLOR[t]}">${t}</div><div class="items">${cell('cli', t)}</div><div class="bar"></div><div class="items">${cell('app', t)}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCP clients tier list</title>${FONT}
<style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;background:#000;font-family:Inter,system-ui,sans-serif;color:#fff;padding:60px 28px 48px;display:flex;flex-direction:column}
h1{font-size:60px;font-weight:800;letter-spacing:-1.5px;margin:0 0 34px 12px}
.board{flex:1;display:grid;grid-template-columns:100px minmax(0,1fr) 10px minmax(0,1fr);grid-template-rows:60px repeat(5,1fr);gap:4px}
.hd{display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;color:#EDEDED}
.tier{color:#1a1a17;font-size:96px;font-weight:700;display:flex;align-items:center;justify-content:center}
.items{background:#1A1A17;display:flex;align-items:center;justify-content:flex-start;gap:0}
.bar{background:#EDEDED;border-radius:3px}
.it{flex:0 1 149px;min-width:0;height:164px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px}
.chip{width:88px;height:88px;border-radius:22px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
.chip img{width:58px;height:58px;object-fit:contain}.chip img.png{width:78px;height:78px;filter:brightness(1.08) contrast(1.25)}.chip img.av{width:84px;height:84px}
.it span{font-size:30px;font-weight:500;color:#EDEDED;text-align:center;line-height:1.1}
.foot{margin:20px 0 0 12px;font-size:40px;color:#8A8A85}
</style></head><body><h1>MCP clients: tier list</h1>
<div class="board"><div></div><div class="hd">${GROUPS[0][1]}</div><div class="bar"></div><div class="hd">${GROUPS[1][1]}</div>${rows}</div>
<div class="foot">As of ${formatDate(data.as_of)}</div></body></html>`;
}

const ICON = {
  y: '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="#0B2814" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  p: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 0 16z" fill="#3A2A05"/></svg>',
  n: '<svg viewBox="0 0 24 24"><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#3A0D0B" stroke-width="3.2" stroke-linecap="round"/></svg>',
};
const mark = m => `<div class="m ${m}">${ICON[m]}</div>`;
const rateClass = r => (r >= 0.4 ? 'g' : r >= 0.15 ? 'a' : 'rd');
// Matrix heading and track width per column; columns not listed use their label and share the rest of the row
const MATRIX_COL = { protocol: ['Spec<br>version', '112px'], code_mode: ['Code<br>mode', '60px'], tool_search: ['Tool<br>search', '124px'], apps: ['MCP<br>Apps'], elicitation: ['Elicit'] };

export function matrixHtml({ data }) {
  const fix = f =>
    f.kind === 'rate' ? `<div class="conn ${rateClass(f.ratio)}"><b>${f.pct}%</b><i>of ${f.n}</i></div>`
    : f.kind === 'few' ? '<div class="conn x"><i>too few<br>issues</i></div>'
    : '<div class="conn x"><i>no public<br>tracker</i></div>';
  const proto = cell => {
    const g = protocolGrade(cell.value, data.spec_versions);
    if (g === 'x') return `<div class="conn x"><i>${esc(cell.value)}</i></div>`;
    return `<div class="pv ${g}">${esc(cell.value)}${cell.fallback ? '<sup>*</sup>' : ''}</div>`;
  };
  const search = cell => (cell.value === 'y' && cell.label ? `<div class="pill ${cell.quality === 'strong' ? 'g' : 'a'}">${esc(cell.label)}</div>` : mark(cell.value));
  let body = '';
  for (const [g, label] of GROUPS) {
    body += `<div class="grp">${label}</div>`;
    for (const c of data.clients.filter(c => c.group === g)) {
      const cells = COLUMNS.map(([k]) => (k === 'protocol' ? proto(c.cells[k]) : k === 'tool_search' ? search(c.cells[k]) : mark(c.cells[k].value))).join('');
      const png = c.logo.endsWith('.png') ? ' class="png"' : '';
      body += `<div class="r"><div class="name"><div class="tb" style="background:${TIER_COLOR[c.tier]}">${c.tier}</div><div class="lg"><img src="${logo(c.logo)}"${png}></div><span>${esc(c.name)}</span></div>${fix(c.fix)}${cells}</div>`;
    }
  }
  const heads = ['MCP bugs<br>fixed', ...COLUMNS.map(([k, l]) => MATRIX_COL[k]?.[0] ?? esc(l))];
  const tracks = `240px 106px ${COLUMNS.map(([k]) => MATRIX_COL[k]?.[1] ?? '1fr').join(' ')}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCP clients: the receipts</title>${FONT}
<style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;background:#000;font-family:Inter,system-ui,sans-serif;color:#EDEDED;padding:52px 32px 40px;display:flex;flex-direction:column}
h1{font-size:52px;font-weight:800;letter-spacing:-1.5px;color:#fff;margin:0 0 26px 16px}
.t{flex:1;display:flex;flex-direction:column;background:#1A1A17;border-radius:18px;padding:8px 0 10px}
.h,.r{display:grid;grid-template-columns:${tracks};align-items:center}
.h{height:68px;font-size:18px;font-weight:600;color:#9A9A94;line-height:1.15;text-align:center;border-bottom:2px solid #2E2E2A}
.h div:first-child{text-align:left;padding-left:16px}
.grp{font-size:20px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#76D6AE;padding:14px 20px 4px}
.r{flex:1;border-top:1px solid #2A2A26}
.grp+.r{border-top:none}
.r>*{justify-self:center}
.name{justify-self:start;display:flex;align-items:center;gap:12px;padding-left:16px}
.tb{width:30px;height:30px;border-radius:6px;color:#1a1a17;font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center}
.lg{width:44px;height:44px;border-radius:11px;background:#fff;display:flex;align-items:center;justify-content:center}
.lg img{width:30px;height:30px;object-fit:contain}.lg img.png{width:42px;height:42px;filter:brightness(1.08) contrast(1.25)}
.name span{font-size:23px;font-weight:600;color:#fff;white-space:nowrap}
.m{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.m svg{width:26px;height:26px}
.m.y{background:#4ADE80}.m.p{background:#FBBF24}.m.n{background:#F87171}
.pill{white-space:nowrap;font-size:17px;font-weight:700;padding:7px 12px;border-radius:999px;color:#0B0B0A}
.pill.g{background:#4ADE80}.pill.a{background:#FBBF24}
.conn{display:flex;flex-direction:column;align-items:center;line-height:1.05}
.conn b{font-size:28px;font-weight:800}.conn i{font-style:normal;font-size:18px;color:#8A8A85}
.conn.g b{color:#4ADE80}.conn.a b{color:#FBBF24}.conn.rd b{color:#F87171}
.conn.x i{font-size:15px;text-align:center}
.pv{white-space:nowrap;font-size:15px;font-weight:800;padding:7px 8px;border-radius:10px;color:#0B0B0A;text-align:center;line-height:1.05}
.pv.g{background:#4ADE80}.pv.a{background:#FBBF24}.pv.rd{background:#F87171}
.note{margin:14px 16px 0;font-size:17px;line-height:1.3;color:#8A8A85}
.foot{margin:18px 16px 0;display:flex;justify-content:space-between;align-items:center;font-size:26px;color:#8A8A85}
.leg{display:flex;gap:18px;align-items:center}.leg div{display:flex;align-items:center;gap:7px;white-space:nowrap}
.leg .m{width:30px;height:30px}.leg .m svg{width:17px;height:17px}
</style></head><body><h1>MCP clients: the receipts</h1>
<div class="t"><div class="h"><div>Client</div>${heads.map(h => `<div>${h}</div>`).join('')}</div>${body}</div>
${data.image_note ? `<div class="note">${esc(data.image_note)}</div>` : ''}
<div class="foot"><div class="leg"><div>${mark('y')}yes</div><div>${mark('p')}partial</div><div>${mark('n')}no</div></div><div style="white-space:nowrap">${formatDate(data.as_of)}</div></div>
</body></html>`;
}

// Step-line charts for the adoption section, 1200x700, from the since dates (see render/history.mjs).
// Eight distinct hues; the second four are dashed so neighbouring hues (green and lime, amber and orange) still differ.
const LINE = ['#76D6AE', '#60A5FA', '#FBBF24', '#F87171', '#C084FC', '#F5F5F5', '#A3E635', '#FB923C'];
const lineStyle = i => ({ color: LINE[i % LINE.length], dash: i % LINE.length >= 4 ? '12 8' : '' });

const SHORT = { 'Code mode': 'Code', 'Tool search': 'Search', 'MCP Apps': 'Apps', Elicitation: 'Elicit' };
const logoClass = f => (f === 'gh-continue.png' ? ' class="png"' : f.endsWith('.png') ? ' class="av"' : '');

function lineChart({ title, subtitle, months, series, yLabel, asOf, labels = false }) {
  const W = 1200, H = 700, L = 84, R = 300, T = 186, B = 92;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const step = max > 10 ? 2 : 1;
  const top = Math.ceil(max / step) * step;
  const x = i => L + (months.length === 1 ? pw / 2 : (i * pw) / (months.length - 1));
  const y = v => T + ph - (v / top) * ph;
  let grid = '';
  for (let v = 0; v <= top; v += step) grid += `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" stroke="#2A2A26"/><text x="${L - 14}" y="${y(v) + 6}" text-anchor="end" class="ax">${v}</text>`;
  // Label the first month, each January and July, and the last month, skipping labels closer than four months
  const marks = [];
  months.forEach((m, i) => {
    if (!(i === 0 || m.endsWith('-01') || m.endsWith('-07') || i === months.length - 1)) return;
    if (marks.length && i - marks.at(-1) < 4) {
      if (i !== months.length - 1) return;
      if (marks.length > 1) marks.pop(); else return;
    }
    marks.push(i);
  });
  months.forEach((m, i) => {
    if (marks.includes(i)) {
      const lab = new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      grid += `<line x1="${x(i)}" x2="${x(i)}" y1="${T + ph}" y2="${T + ph + 8}" stroke="#55554F"/><text x="${x(i)}" y="${T + ph + 34}" text-anchor="middle" class="ax">${lab}</text>`;
    }
  });
  // Small vertical offsets keep equal lines from hiding each other
  const off = i => (i - (series.length - 1) / 2) * 2.2;
  const lines = series.map((s, i) => {
    const { color, dash } = lineStyle(i);
    let d = `M${x(0)},${y(s.values[0]) + off(i)}`;
    s.values.forEach((v, j) => { if (j) d += `H${x(j)}V${y(v) + off(i)}`; });
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="${dash}" stroke-linejoin="round"/>`
      + `<circle cx="${x(months.length - 1)}" cy="${y(s.values.at(-1)) + off(i)}" r="6" fill="${color}"/>`;
  }).join('');
  const legend = series.map((s, i) => {
    const { color, dash } = lineStyle(i);
    const img = s.logo ? `<img src="${logo(s.logo)}"${logoClass(s.logo)}>` : '';
    return `<div class="lg"><svg width="34" height="8"><line x1="0" x2="34" y1="4" y2="4" stroke="${color}" stroke-width="4" stroke-dasharray="${dash ? '8 5' : ''}"/></svg>${img}<span>${esc(s.label)}</span><b>${s.values.at(-1)}</b></div>`;
  }).join('');
  // Client charts: a logo chip where a line steps up, with the feature it added. Chips that would overlap shift sideways, like an avatar row:
  // right, or left in the last month so they stay inside the plot and clear of the legend.
  const placed = [];
  const chips = series.filter(s => s.steps).flatMap((s, i) => s.steps.map(st => {
    let cx = x(st.i), cy = y(s.values[st.i]) + off(i);
    const step = st.i === months.length - 1 ? -22 : 22;
    while (placed.some(p => Math.abs(p.cx - cx) < 30 && Math.abs(p.cy - cy) < 30)) cx += step;
    placed.push({ cx, cy });
    const tag = st.features.map(l => SHORT[l] || l).join(' + ');
    return `<div class="mk" style="left:${cx - 15}px;top:${cy - 15}px;border-color:${lineStyle(i).color}"><img src="${logo(s.logo)}"${logoClass(s.logo)}></div>`
      + (labels ? `<div class="mt" style="left:${cx}px;top:${cy - 38}px">${esc(tag)}</div>` : '');
  })).join('');
  const empty = series.length ? '' : `<text x="${L + pw / 2}" y="${T + ph / 2}" text-anchor="middle" class="ax">No dated cells yet</text>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${FONT}
<style>
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;background:#000;font-family:Inter,system-ui,sans-serif;color:#EDEDED;position:relative;overflow:hidden}
h1{position:absolute;left:${L - 40}px;top:40px;font-size:40px;font-weight:800;letter-spacing:-1px;color:#fff}
h2{position:absolute;left:${L - 40}px;top:96px;font-size:20px;font-weight:500;color:#8A8A85}
svg{position:absolute;left:0;top:0}
.ax{font-size:18px;fill:#9A9A94;font-family:Inter,system-ui,sans-serif}
.yl{font-size:18px;fill:#9A9A94;font-family:Inter,system-ui,sans-serif;font-weight:600}
.leg{position:absolute;left:${W - R + 36}px;top:${T - 6}px;width:${R - 60}px;display:flex;flex-direction:column;gap:12px}
.lg{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600}
.lg svg{position:static;flex-shrink:0}
.lg span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lg b{color:#fff;font-weight:800}
.foot{position:absolute;right:40px;bottom:24px;font-size:18px;color:#8A8A85}
.lg img{width:26px;height:26px;object-fit:contain;flex-shrink:0;background:#fff;border-radius:6px;padding:3px}.lg img.av,.lg img.png{padding:0}
.mk{position:absolute;width:30px;height:30px;border-radius:8px;background:#fff;border:2px solid;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #000}
.mk img{width:20px;height:20px;object-fit:contain}.mk img.av{width:26px;height:26px;border-radius:6px}.mk img.png{width:26px;height:26px}
.mt{position:absolute;transform:translateX(-50%);font-size:13px;font-weight:700;color:#EDEDED;background:#000;padding:0 3px;white-space:nowrap}
</style></head><body><h1>${esc(title)}</h1><h2>${esc(subtitle)}</h2>
<svg width="${W}" height="${H}">${grid}<text x="${L - 60}" y="${T - 22}" class="yl">${esc(yLabel)}</text>${lines}${empty}</svg>${chips}
<div class="leg">${legend}</div><div class="foot">From dated releases · as of ${formatDate(asOf)}</div></body></html>`;
}

export function historyFeaturesHtml({ data }, ms, series) {
  return lineChart({ title: 'MCP clients supporting each feature', subtitle: 'Clients with full or partial support, counted from the first release that shipped it', months: ms, series, yLabel: 'Clients', asOf: data.as_of });
}

export function historyClientsHtml({ data }, ms, series, labels = false) {
  return lineChart({ title: 'Features supported per client', subtitle: 'Features with full or partial support, counted from the first release that shipped each', months: ms, series, yLabel: 'Features', asOf: data.as_of, labels });
}

// Per-client badge for client READMEs, regenerated with the table so it follows the tier
export function badgeSvg(c) {
  const left = 'MCP clients scorecard', right = `tier ${c.tier}`;
  const lw = left.length * 6.5 + 12, rw = right.length * 6.5 + 12;
  const text = (s, x, w) => `<text x="${x + w / 2}" y="14" text-anchor="middle" textLength="${w - 12}">${esc(s)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${esc(left)}: ${esc(right)}"><title>${esc(left)}: ${esc(right)}</title>`
    + `<rect width="${lw}" height="20" fill="#1A1A17"/><rect x="${lw}" width="${rw}" height="20" fill="${TIER_COLOR[c.tier]}"/>`
    + `<g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><g fill="#fff">${text(left, 0, lw)}</g><g fill="#1a1a17">${text(right, lw, rw)}</g></g></svg>\n`;
}
