import fs from 'node:fs';
import YAML from 'yaml';

export const ROOT = new URL('..', import.meta.url).pathname;
export const COLUMNS = [
  ['protocol', 'Spec version'],
  ['code_mode', 'Code mode'],
  ['tool_search', 'Tool search'],
  ['apps', 'MCP Apps'],
  ['tasks', 'Tasks'],
  ['events', 'Events'],
  ['cimd', 'CIMD'],
  ['id_jag', 'ID-JAG'],
  ['elicitation', 'Elicitation'],
];
export const TIERS = ['S', 'A', 'B', 'C', 'D'];
export const GROUPS = [['cli', 'CLIs'], ['app', 'Apps and IDEs']];
const MARKS = new Set(['y', 'p', 'n']);
const METHODS = new Set(['probe', 'source', 'docs', 'changelog', 'issue']);
// Protocol cell value for hosted clients that do not say which spec version they speak
export const NOT_PUBLISHED = 'not published';
// A fix rate needs at least this many non-duplicate issues to be shown
export const MIN_ISSUES = 20;

// Pass { counts: false } to load the clients without data/bugs.json (npm run bugs does this to rebuild it)
export function load({ counts = true } = {}) {
  const data = YAML.parse(fs.readFileSync(ROOT + 'data/clients.yaml', 'utf8'));
  const bugs = counts ? JSON.parse(fs.readFileSync(ROOT + 'data/bugs.json', 'utf8')) : null;
  validate(data, bugs);
  if (!counts) return { data };
  for (const c of data.clients) c.fix = fixRate(c, bugs);
  return { data, bugs };
}

// Share of MCP issues opened since the window start that were closed as completed, duplicates removed
export function fixRate(client, bugs) {
  if (!client.tracker) return { kind: 'none' };
  const r = bugs.repos[client.tracker.repo];
  const n = r.issues - r.duplicates;
  if (n < MIN_ISSUES) return { kind: 'few', n };
  // ratio drives the rubric and colours; pct is rounded for display only
  return { kind: 'rate', ratio: r.completed / n, pct: Math.round((100 * r.completed) / n), n };
}

function validate(data, bugs) {
  const errs = [];
  if (!Array.isArray(data.spec_versions) || !data.spec_versions.length) errs.push('spec_versions must list spec revisions, newest first');
  if (bugs) {
    if (String(bugs.window_start) !== String(data.bug_window_start)) errs.push(`data/bugs.json window_start ${bugs.window_start} does not match bug_window_start ${data.bug_window_start}. Run npm run bugs.`);
    for (const [repo, r] of Object.entries(bugs.repos || {})) {
      const ok = ['issues', 'completed', 'duplicates'].every(k => Number.isInteger(r[k]) && r[k] >= 0) && r.completed + r.duplicates <= r.issues;
      if (!ok) errs.push(`data/bugs.json ${repo}: counts must be non-negative integers with completed + duplicates <= issues`);
    }
  }
  const seen = new Set();
  for (const c of data.clients) {
    const at = c.name || '(unnamed)';
    if (seen.has(c.name)) errs.push(`${at}: duplicate name`);
    seen.add(c.name);
    if (!GROUPS.some(([g]) => g === c.group)) errs.push(`${at}: group must be cli or app`);
    if (!TIERS.includes(c.tier)) errs.push(`${at}: tier must be one of ${TIERS.join(' ')}`);
    if (!fs.existsSync(ROOT + 'assets/logos/' + c.logo)) errs.push(`${at}: logo ${c.logo} not found`);
    if (bugs && c.tracker && !bugs.repos?.[c.tracker.repo]) errs.push(`${at}: no counts for ${c.tracker.repo} in data/bugs.json`);
    for (const [key] of COLUMNS) {
      const cell = c.cells?.[key];
      if (!cell) { errs.push(`${at}: missing cell ${key}`); continue; }
      if (key !== 'protocol' && !MARKS.has(cell.value)) errs.push(`${at}.${key}: value must be y, p or n`);
      if (key === 'protocol' && cell.value !== NOT_PUBLISHED && !data.spec_versions?.includes(String(cell.value))) errs.push(`${at}.protocol: value must be in spec_versions or "${NOT_PUBLISHED}"`);
      if (!METHODS.has(cell.method)) errs.push(`${at}.${key}: method must be one of ${[...METHODS].join(', ')}`);
      if (!/^https:\/\//.test(cell.source || '')) errs.push(`${at}.${key}: source must be an https URL`);
      if (!cell.evidence) errs.push(`${at}.${key}: evidence is empty`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cell.checked))) errs.push(`${at}.${key}: checked must be YYYY-MM-DD`);
    }
  }
  if (errs.length) throw new Error('data/clients.yaml is invalid:\n  ' + errs.join('\n  '));
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

// The tier the rubric in RUBRIC.md gives a client. A client may sit elsewhere only with a tier_note.
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
