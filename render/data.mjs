import fs from 'node:fs';
import YAML from 'yaml';

export const ROOT = new URL('..', import.meta.url).pathname;
const readYaml = f => YAML.parse(fs.readFileSync(ROOT + f, 'utf8'));
// Column order and labels come from data/features.yaml
const FEATURES = readYaml('data/features.yaml');
export const COLUMNS = FEATURES.map(f => [f.id, f.label]);
export const TIERS = ['S', 'A', 'B', 'C', 'D'];
export const GROUPS = [['cli', 'CLIs'], ['app', 'Apps and IDEs']];
const MARKS = new Set(['y', 'p', 'n']);
const METHODS = new Set(['probe', 'source', 'docs', 'changelog', 'issue']);
// Protocol cell value for hosted clients that do not say which spec version they speak
const NOT_PUBLISHED = 'not published';
// A fix rate needs at least this many non-duplicate issues to be shown
export const MIN_ISSUES = 20;

const CLIENT_KEYS = new Set(['name', 'group', 'tier', 'tier_note', 'note', 'unmaintained', 'logo', 'website', 'docs', 'repo', 'version_checked', 'npm', 'tracker', 'cells']);
const CELL_KEYS = new Set(['value', 'method', 'source', 'evidence', 'checked', 'label', 'quality', 'fallback', 'since']);
const SINCE_KEYS = new Set(['date', 'version', 'source']);
const FEATURE_KEYS = new Set(['id', 'label', 'definition', 'ref', 'url', 'spec_date', 'spec_source', 'spec_event']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS = /^https:\/\/\S+$/;
const slugOf = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Pass { counts: false } to load the clients without data/bugs.json (npm run bugs does this to rebuild it)
export function load({ counts = true } = {}) {
  const meta = readYaml('data/meta.yaml');
  const clients = fs.readdirSync(ROOT + 'data/clients').filter(f => f.endsWith('.yaml')).sort()
    .map(f => ({ file: f, ...readYaml('data/clients/' + f) }));
  const data = { ...meta, features: FEATURES, clients };
  const bugs = counts ? JSON.parse(fs.readFileSync(ROOT + 'data/bugs.json', 'utf8')) : null;
  validate(data, bugs);
  for (const c of clients) {
    c.slug = c.file.replace(/\.yaml$/, '');
    delete c.file;
  }
  if (!counts) return { data };
  for (const c of clients) c.fix = fixRate(c, bugs);
  // Group, then tier, then feature score, then name, so a new file lands in a stable place
  const g = c => GROUPS.findIndex(([k]) => k === c.group);
  clients.sort((a, b) => g(a) - g(b) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || featureScore(b) - featureScore(a) || a.name.localeCompare(b.name));
  return { data, bugs };
}

// Share of MCP issues opened since the window start that were closed as completed, duplicates removed
function fixRate(client, bugs) {
  if (!client.tracker) return { kind: 'none' };
  const r = bugs.repos[client.tracker.repo];
  const n = r.issues - r.duplicates;
  if (n < MIN_ISSUES) return { kind: 'few', n };
  // ratio drives the rubric and colours; pct is rounded for display only
  return { kind: 'rate', ratio: r.completed / n, pct: Math.round((100 * r.completed) / n), n };
}

function validate(data, bugs) {
  const errs = [];
  const asOf = String(data.as_of);
  if (!DATE.test(asOf)) errs.push('data/meta.yaml: as_of must be YYYY-MM-DD');
  if (!Array.isArray(data.spec_versions) || !data.spec_versions.length) errs.push('data/meta.yaml: spec_versions must list spec revisions, newest first');
  const ids = new Set();
  for (const f of data.features) {
    const at = `data/features.yaml ${f.id || '(no id)'}`;
    if (ids.has(f.id)) errs.push(`${at}: duplicate id`);
    ids.add(f.id);
    for (const k of Object.keys(f)) if (!FEATURE_KEYS.has(k)) errs.push(`${at}: unknown key ${k}`);
    for (const k of ['id', 'label', 'definition', 'ref']) if (!f[k]) errs.push(`${at}: ${k} is empty`);
    if (!HTTPS.test(f.url || '')) errs.push(`${at}: url must be an https URL`);
    if (f.spec_date !== undefined && (!DATE.test(String(f.spec_date)) || !HTTPS.test(f.spec_source || ''))) errs.push(`${at}: spec_date must be YYYY-MM-DD with an https spec_source`);
    if (f.spec_date !== undefined && !f.spec_event) errs.push(`${at}: spec_date needs a spec_event that says what happened on that date`);
    if (f.spec_date !== undefined && String(f.spec_date) > String(data.as_of)) errs.push(`${at}: spec_date is after as_of`);
  }
  if (!ids.has('protocol')) errs.push('data/features.yaml: the protocol column is required');
  if (bugs) {
    if (String(bugs.window_start) !== String(data.bug_window_start)) errs.push(`data/bugs.json window_start ${bugs.window_start} does not match bug_window_start ${data.bug_window_start}. Run npm run bugs.`);
    for (const [repo, r] of Object.entries(bugs.repos || {})) {
      const ok = ['issues', 'completed', 'duplicates'].every(k => Number.isInteger(r[k]) && r[k] >= 0) && r.completed + r.duplicates <= r.issues;
      if (!ok) errs.push(`data/bugs.json ${repo}: counts must be non-negative integers with completed + duplicates <= issues`);
    }
  }
  const seen = new Set();
  for (const c of data.clients) {
    const at = `data/clients/${c.file}`;
    if (!c.name) { errs.push(`${at}: name is required`); continue; }
    if (c.file !== slugOf(c.name) + '.yaml') errs.push(`${at}: file name must be ${slugOf(c.name)}.yaml for "${c.name}"`);
    if (seen.has(c.name)) errs.push(`${at}: duplicate name ${c.name}`);
    seen.add(c.name);
    for (const k of Object.keys(c)) if (k !== 'file' && !CLIENT_KEYS.has(k)) errs.push(`${at}: unknown key ${k}`);
    if (!GROUPS.some(([g]) => g === c.group)) errs.push(`${at}: group must be cli or app`);
    if (!TIERS.includes(c.tier)) errs.push(`${at}: tier must be one of ${TIERS.join(' ')}`);
    if (!c.logo || !fs.existsSync(ROOT + 'assets/logos/' + c.logo)) errs.push(`${at}: logo ${c.logo} not found in assets/logos`);
    if (!HTTPS.test(c.website || '')) errs.push(`${at}: website must be an https URL`);
    for (const k of ['docs', 'repo']) if (c[k] != null && !HTTPS.test(c[k])) errs.push(`${at}: ${k} must be an https URL or null`);
    if (bugs && c.tracker && !bugs.repos?.[c.tracker.repo]) errs.push(`${at}: no counts for ${c.tracker.repo} in data/bugs.json`);
    for (const k of Object.keys(c.cells || {})) if (!ids.has(k)) errs.push(`${at}: unknown cell ${k}`);
    for (const [key] of COLUMNS) {
      const cell = c.cells?.[key];
      const ca = `${at} ${key}`;
      if (!cell) { errs.push(`${at}: missing cell ${key}`); continue; }
      for (const k of Object.keys(cell)) if (!CELL_KEYS.has(k)) errs.push(`${ca}: unknown key ${k}`);
      if (key !== 'protocol' && !MARKS.has(cell.value)) errs.push(`${ca}: value must be y, p or n`);
      if (key === 'protocol' && cell.value !== NOT_PUBLISHED && !data.spec_versions?.includes(String(cell.value))) errs.push(`${ca}: value must be in spec_versions or "${NOT_PUBLISHED}"`);
      if (!METHODS.has(cell.method)) errs.push(`${ca}: method must be one of ${[...METHODS].join(', ')}`);
      if (!HTTPS.test(cell.source || '')) errs.push(`${ca}: source must be an https URL`);
      if (!cell.evidence) errs.push(`${ca}: evidence is empty`);
      if (!DATE.test(String(cell.checked))) errs.push(`${ca}: checked must be YYYY-MM-DD`);
      else if (String(cell.checked) > asOf) errs.push(`${ca}: checked ${cell.checked} is after as_of ${asOf}`);
      if (cell.since !== undefined) {
        const s = cell.since || {};
        for (const k of Object.keys(s)) if (!SINCE_KEYS.has(k)) errs.push(`${ca}.since: unknown key ${k}`);
        if (key !== 'protocol' && cell.value === 'n') errs.push(`${ca}.since: only y or p cells take a since date`);
        if (!DATE.test(String(s.date))) errs.push(`${ca}.since: date must be YYYY-MM-DD`);
        else if (String(s.date) > asOf) errs.push(`${ca}.since: date ${s.date} is after as_of ${asOf}`);
        if (!HTTPS.test(s.source || '')) errs.push(`${ca}.since: source must be an https URL`);
      }
    }
  }
  if (errs.length) throw new Error('data/ is invalid:\n  ' + errs.join('\n  '));
}

// Spec version freshness: current (g), one behind (a), older (rd), not published (x)
export function protocolGrade(v, versions) {
  const i = versions.indexOf(String(v));
  return i === 0 ? 'g' : i === 1 ? 'a' : i > 1 ? 'rd' : 'x';
}

export function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Feature score: y = 1, p = 0.5 across every column except the spec version
export function featureScore(c) {
  return COLUMNS.filter(([k]) => k !== 'protocol').reduce((s, [k]) => s + ({ y: 1, p: 0.5 }[c.cells[k].value] || 0), 0);
}

// The tier the rubric in methodology/RUBRIC.md gives a client. A client may sit elsewhere only with a tier_note.
export function rubricTier(c, versions) {
  const score = featureScore(c);
  const spec = protocolGrade(c.cells.protocol.value, versions);
  const lowFix = c.fix.kind === 'rate' && c.fix.ratio < 0.15;
  if (c.unmaintained || (score <= 1 && spec === 'rd')) return 'D';
  if (score >= 5 && (spec === 'g' || spec === 'a')) return 'S';
  if (score >= 3 && spec === 'rd' && lowFix) return 'C';
  if (score >= 3 && spec === 'x' && c.fix.kind === 'none') return 'B';
  if (score >= 3) return 'A';
  if (score >= 2) return 'B';
  return 'C';
}

export function tierMismatches(data) {
  return data.clients
    .map(c => ({ name: c.name, tier: c.tier, rubric: rubricTier(c, data.spec_versions), note: c.tier_note }))
    .filter(m => m.tier !== m.rubric);
}
