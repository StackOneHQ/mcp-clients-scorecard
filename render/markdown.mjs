// README sections and EVIDENCE.md, all generated from data/
import { COLUMNS, HARNESS, GROUPS, MIN_ISSUES, protocolGrade, formatDate } from './data.mjs';
import { featureSeries, firstShippers, datedCounts } from './history.mjs';

const KIND = { cli: 'CLI', app: 'App or IDE' };
// Status icons are small SVGs in assets/icons, so the tables keep their colours without emoji
const icon = (file, alt) => `![${alt}](assets/icons/${file}.svg)`;
const MARK = { y: icon('y', 'yes'), p: icon('p', 'partial'), n: icon('n', 'no') };
const GRADE = { g: icon('spec-current', 'current spec'), a: icon('spec-behind', 'one version behind'), rd: icon('spec-older', 'older spec'), x: icon('spec-unknown', 'not published') };
const cellText = (key, cell, versions) => {
  if (key === 'protocol') return `${GRADE[protocolGrade(cell.value, versions)]} ${cell.value}${cell.fallback ? ` (falls back to ${cell.fallback})` : ''}`;
  if (key === 'tool_search' && cell.value === 'y' && cell.label) return `${MARK.y} ${cell.label}`;
  return MARK[cell.value];
};
const pipe = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
// Link text and URL land inside a table cell, so brackets in the text are escaped, except inside the status icons
const ICON = /(!\[[a-z ]+\]\(assets\/icons\/[a-z-]+\.svg\))/;
const escText = s => pipe(s).split(ICON).map((part, i) => (i % 2 ? part : part.replace(/[[\]]/g, m => '\\' + m))).join('');
// Percent-encode what a Markdown link target cannot hold (spaces, brackets, pipes, non-ASCII), keeping existing %XX escapes as they are
const encUrl = url => url.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')
  .replace(/[^A-Za-z0-9\-._~:/?#@!$&'*+,;=%]/gu, c => (c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c)));
const link = (text, url) => `[${escText(text)}](${encUrl(url)})`;
const fixText = f => (f.kind === 'rate' ? `${f.pct}% of ${f.n}` : f.kind === 'few' ? 'too few issues' : 'no public tracker');
const anchor = name => name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
// Mermaid labels: drop characters that end a label or start a comment
const mm = s => String(s).replace(/["%:;#]/g, '');
const month = iso => String(iso).slice(0, 7);
// Harness columns are tagged in every header so they read as a separate group from the spec columns
const head = (k, l) => (HARNESS.has(k) ? `${l} <sub>harness</sub>` : l);

export function readmeTable({ data }) {
  const out = [];
  for (const [g, label] of GROUPS) {
    out.push(`### ${label}`, '');
    out.push(`| Tier | Client | Checked on | MCP bugs fixed | ${COLUMNS.map(([k, l]) => head(k, l)).join(' | ')} |`);
    out.push(`|${' --- |'.repeat(4 + COLUMNS.length)}`);
    for (const c of data.clients.filter(c => c.group === g)) {
      const cells = COLUMNS.map(([k]) => link(cellText(k, c.cells[k], data.spec_versions), c.cells[k].source));
      const tracker = c.tracker ? `[${fixText(c.fix)}](https://github.com/${c.tracker.repo}/issues)` : fixText(c.fix);
      out.push(`| **${c.tier}** | [${pipe(c.name)}](EVIDENCE.md#${anchor(c.name)}) | ${c.version_checked ? '`' + pipe(c.version_checked) + '`' : 'hosted'} | ${tracker} | ${cells.join(' | ')} |`);
    }
    out.push('');
  }
  const harness = COLUMNS.filter(([k]) => HARNESS.has(k)).map(([, l]) => l);
  if (harness.length) out.push(`${harness.join(' and ')} are marked harness: they are how the client handles tools, not part of the MCP spec. They sit after the spec columns and still count toward the tier.`, '');
  const notes = data.clients.filter(c => c.note).map(c => `- **${c.name}**: ${c.note}`);
  if (notes.length) out.push(...notes, '');
  return out.join('\n');
}

export function columnsTable({ data }) {
  const out = ['| Column | Meaning | Defined in |', '| --- | --- | --- |'];
  for (const f of data.features) out.push(`| ${head(f.id, pipe(f.label))} | ${pipe(f.definition)} | ${link(f.ref, f.url)} |`);
  out.push('| MCP bugs fixed | The share of the client\'s MCP issues closed as completed. | [Methodology](methodology/METHODOLOGY.md#mcp-bugs-fixed) |', '');
  return out.join('\n');
}

export function featureCounts({ data }) {
  const cols = COLUMNS.filter(([k]) => k !== 'protocol');
  const count = (k, v) => data.clients.filter(c => c.cells[k].value === v).length;
  return [
    `| Feature | ${MARK.y} Yes | ${MARK.p} Partial | ${MARK.n} No |`,
    '| --- | --- | --- | --- |',
    ...cols.map(([k, l]) => `| ${head(k, l)} | ${count(k, 'y')} | ${count(k, 'p')} | ${count(k, 'n')} |`),
    '',
  ].join('\n');
}

export function adoption(model) {
  const { data } = model;
  const firsts = firstShippers(model);
  const { dated, undated } = datedCounts(model);
  const series = featureSeries(model);
  const out = [
    '![Which MCP clients shipped each feature, and when](assets/history-features.png)',
    '',
    '![Features supported per client, one dot per feature at the release that shipped it](assets/history-clients.png)',
    '',
  ];
  if (firsts.length) {
    // Group by month: a mermaid timeline period holds several events
    const events = [];
    for (const f of data.features) if (f.spec_date) events.push({ m: month(f.spec_date), text: mm(f.spec_event) });
    for (const f of firsts) events.push({ m: month(f.date), text: `${mm(f.label)}, first in ${f.names.map(mm).join(' and ')}` });
    const byMonth = new Map();
    for (const e of events.sort((a, b) => a.m.localeCompare(b.m))) byMonth.set(e.m, [...(byMonth.get(e.m) || []), e.text]);
    out.push('```mermaid', 'timeline', '    title Spec milestones and the first client to ship each feature', ...[...byMonth].map(([m, ts]) => `    ${m} : ${ts.join(' : ')}`), '```', '');
  }
  out.push(
    `Dated from the first release that shipped each feature; cells without a verified date are left out. ${dated} of ${dated + undated} supported cells carry a date. See [methodology](methodology/METHODOLOGY.md#dating-support).`,
    '',
    '<details><summary>Undated supported cells per feature</summary>',
    '',
    '| Feature | Dated | Undated |',
    '| --- | --- | --- |',
    ...series.map(s => `| ${s.label} | ${s.values.at(-1)} | ${s.undated} |`),
    '',
    '</details>',
    '',
  );
  return out.join('\n');
}

export function evidence({ data }) {
  const out = [
    '# Evidence',
    '',
    '<!-- Generated by `npm run build` from data/. Do not edit by hand. -->',
    '',
    `Every cell in the [README](README.md) table, with the source it was checked against. As of ${formatDate(data.as_of)}. To change a cell, edit the client's file in [data/clients/](data/clients/) (see [CONTRIBUTING.md](CONTRIBUTING.md)).`,
    '',
    'Methods: `probe` is a live handshake against a local MCP server (see [methodology/PROBE.md](methodology/PROBE.md)), `source` is the client\'s own code at a pinned commit or published package, `docs` and `changelog` are the vendor\'s pages, `issue` is a GitHub issue or pull request. Shipped is the first release with the feature, where a release note or changelog dates it.',
    '',
  ];
  for (const c of data.clients) {
    out.push(`## ${c.name}`, '');
    const meta = [`Tier **${c.tier}**`, KIND[c.group]];
    if (c.version_checked) meta.push(`checked on \`${c.version_checked}\``);
    if (c.tracker) meta.push(`tracker [${c.tracker.repo}](https://github.com/${c.tracker.repo}/issues)`);
    meta.push(`MCP bugs fixed: ${fixText(c.fix)}`);
    out.push(meta.join(' · '), '');
    const links = [link('website', c.website), c.docs && link('docs', c.docs), c.repo && link('repo', c.repo), `[data file](data/clients/${c.slug}.yaml)`].filter(Boolean);
    out.push(links.join(' · '), '');
    if (c.note) out.push(`> ${c.note}`, '');
    out.push('| Feature | Value | Evidence | Method | Checked | Shipped |', '| --- | --- | --- | --- | --- | --- |');
    for (const [k, l] of COLUMNS) {
      const cell = c.cells[k];
      const s = cell.since;
      const shipped = s ? link(`${s.date}${s.version ? ` (${s.version})` : ''}`, s.source) : '';
      out.push(`| ${l} | ${link(cellText(k, cell, data.spec_versions), cell.source)} | ${pipe(cell.evidence)} | ${cell.method} | ${cell.checked} | ${shipped} |`);
    }
    out.push('');
  }
  out.push(`MCP bugs fixed is completed issues divided by issues minus duplicates, for issues opened since ${data.bug_window_start} with "mcp" in the title (every issue, for trackers that are only about MCP). Below ${MIN_ISSUES} issues the rate is not shown. Counts are in [data/bugs.json](data/bugs.json).`, '');
  return out.join('\n');
}

// Each generated README section sits between <!-- name:start --> and <!-- name:end -->
export function spliceReadme(readme, sections) {
  for (const [name, body] of Object.entries(sections)) {
    const a = `<!-- ${name}:start -->`, b = `<!-- ${name}:end -->`;
    const i = readme.indexOf(a), j = readme.indexOf(b);
    if (i < 0 || j < i) throw new Error(`README.md needs ${a} and ${b} markers`);
    readme = readme.slice(0, i + a.length) + '\n' + body + readme.slice(j);
  }
  return readme;
}

export function readmeSections(model) {
  const stamp = `<!-- Generated by \`npm run build\` from data/. Do not edit between the markers. -->\n\nAs of ${formatDate(model.data.as_of)}. Click any cell for its source, or a client name for the full evidence.\n\n`;
  return {
    table: stamp + readmeTable(model),
    features: featureCounts(model),
    adoption: adoption(model),
    columns: columnsTable(model),
  };
}
