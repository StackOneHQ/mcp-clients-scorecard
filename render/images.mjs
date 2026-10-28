// HTML for the two 1080x1350 images: the tier board and the per-feature matrix
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
.it{width:149px;height:164px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px}
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
  const heads = ['MCP bugs<br>fixed', 'Spec<br>version', 'Code<br>mode', 'Tool<br>search', 'MCP<br>Apps', 'Tasks', 'Events', 'CIMD', 'ID-JAG', 'Elicit'];
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCP clients: the receipts</title>${FONT}
<style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;background:#000;font-family:Inter,system-ui,sans-serif;color:#EDEDED;padding:52px 32px 40px;display:flex;flex-direction:column}
h1{font-size:52px;font-weight:800;letter-spacing:-1.5px;color:#fff;margin:0 0 26px 16px}
.t{flex:1;display:flex;flex-direction:column;background:#1A1A17;border-radius:18px;padding:8px 0 10px}
.h,.r{display:grid;grid-template-columns:240px 106px 112px 60px 124px repeat(6,1fr);align-items:center}
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
