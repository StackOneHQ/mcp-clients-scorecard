// The changelog: every dated event the data can vouch for, newest first. Built at every build from three sources:
// - the weekly snapshots in data/history/: a client joins or leaves, a tier moves, a cell changes value (dated by the check)
// - the `since` date on each supported cell: the release that shipped the feature (dated by the release note), which
//   replaces the check-dated event of the cell's first support, so the timeline shows when the vendor shipped, not when we noticed
// - data/features.yaml and data/meta.yaml: spec milestones and spec releases
import fs from 'node:fs';
import { ROOT, COLUMNS, TIERS } from './data.mjs';
import { snapshot } from './history.mjs';

export const KINDS = [['client', 'Clients'], ['support', 'Feature support'], ['tier', 'Tier moves'], ['spec', 'Spec']];
export const KIND_LABEL = { client: 'Client', support: 'Feature', tier: 'Tier', spec: 'Spec' };
// The README, the home page and the feeds show this many days before as_of; older events fold away
export const RECENT_DAYS = 30;
// Recent changes shown before a reader asks for more: the home page pages by it, the README folds after it
export const CHANGES_PAGE = 10;
const LABEL = Object.fromEntries(COLUMNS);
const WORD = { y: 'yes', p: 'partly', n: 'no', na: 'n/a' };
const SHIPS = new Set(['y', 'p']);
const KIND_ORDER = Object.fromEntries(KINDS.map(([k], i) => [k, i]));

// Committed snapshots before as_of, which load() never validates: check the fields the changelog reads
function readSnapshots(asOf) {
  const dir = ROOT + 'data/history';
  return fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.replace(/\.json$/, '')).filter(d => d < asOf).sort()
    .map(d => {
      const file = `data/history/${d}.json`;
      const snap = JSON.parse(fs.readFileSync(ROOT + file, 'utf8'));
      const bad = !snap.clients || typeof snap.clients !== 'object' ? ['clients'] : Object.entries(snap.clients).find(([, c]) => !TIERS.includes(c.tier) || typeof c.name !== 'string'
        || COLUMNS.some(([k]) => k !== 'protocol' && c[k] !== undefined && !Object.hasOwn(WORD, c[k])));
      if (snap.as_of !== d || bad) throw new Error(`${file}: invalid snapshot${bad ? ` entry ${bad[0]}` : ''}`);
      return snap;
    });
}

const flip = (k, from, to) => (k === 'protocol' ? `spec version ${from} → ${to}` : `${LABEL[k]} ${WORD[from]} → ${WORD[to]}`);

// Each event: { date, kind, client: { slug, name } | null, text, source | null, key }. With a client, text follows its name.
// key names what changed in stable terms (column keys, tiers, values), so a feed id survives a label or name change.
// Events about one column also carry feature (its id); a recheck carries changes, one [id, text] per column that moved.
export function changelog({ data }) {
  const events = [];
  const live = new Set(data.clients.map(c => c.slug));
  const who = (slug, name) => ({ slug: live.has(slug) ? slug : null, name });
  // as_of compares against the live data, so the board is current even before the build writes its snapshot
  const snaps = [...readSnapshots(String(data.as_of)), JSON.parse(snapshot({ data }))];
  // The snapshot where each cell was first supported. A since date dates that move, not later ones. value is the one
  // it moved to, kept only when a recheck saw the move: a cell supported on its first snapshot was never seen unshipped
  const first = new Map();
  snaps.forEach((snap, i) => {
    for (const [slug, c] of Object.entries(snap.clients)) {
      for (const [k] of COLUMNS) {
        const was = snaps[i - 1]?.clients[slug]?.[k];
        if (SHIPS.has(c[k]) && !first.has(`${slug}:${k}`)) first.set(`${slug}:${k}`, { i, value: was === undefined ? null : c[k] });
      }
    }
  });
  const dated = new Set(data.clients.flatMap(c => COLUMNS.filter(([k]) => c.cells[k].since && SHIPS.has(c.cells[k].value)).map(([k]) => `${c.slug}:${k}`)));
  if (snaps.length) events.push({ date: snaps[0].as_of, kind: 'client', client: null, text: `Scorecard published with ${Object.keys(snaps[0].clients).length} clients`, source: null, key: 'publish' });
  for (let i = 1; i < snaps.length; i++) {
    const [prev, cur] = [snaps[i - 1], snaps[i]];
    const date = cur.as_of;
    for (const [slug, c] of Object.entries(cur.clients)) {
      const was = prev.clients[slug];
      if (!was) { events.push({ date, kind: 'client', client: who(slug, c.name), text: `joins the board in ${c.tier} tier`, source: null, key: `join:${slug}` }); continue; }
      if (was.tier !== c.tier) {
        const up = TIERS.indexOf(c.tier) < TIERS.indexOf(was.tier);
        events.push({ date, kind: 'tier', client: who(slug, c.name), text: `${up ? 'moves up' : 'moves down'} from ${was.tier} to ${c.tier} tier`, source: null, key: `tier:${slug}:${was.tier}>${c.tier}` });
      }
      const moved = COLUMNS.filter(([k]) => was[k] !== undefined && c[k] !== undefined && String(was[k]) !== String(c[k])).map(([k]) => k);
      // A cell's first support with a since date shows once, by its ship event on the release date
      const changed = moved.filter(k => !(dated.has(`${slug}:${k}`) && first.get(`${slug}:${k}`).i === i));
      const changes = changed.map(k => [k, flip(k, was[k], c[k])]);
      // The key keeps every column that moved, so a feed id stays the same when one is told by its ship event instead
      if (changed.length) events.push({ date, kind: 'support', client: who(slug, c.name), text: `rechecked: ${changes.map(([, t]) => t).join(', ')}`, source: null, key: `recheck:${slug}:${moved.map(k => `${k}=${was[k]}>${c[k]}`).join(',')}`, changes });
    }
    for (const [slug, c] of Object.entries(prev.clients)) if (!cur.clients[slug]) events.push({ date, kind: 'client', client: who(slug, c.name), text: 'leaves the board', source: null, key: `leave:${slug}` });
  }
  for (const c of data.clients) {
    for (const [k, l] of COLUMNS) {
      const cell = c.cells[k], s = cell.since;
      if (!s || !SHIPS.has(cell.value)) continue;
      // Worded from the value the cell first had, so a partial first release does not read as full support
      const shipped = first.get(`${c.slug}:${k}`)?.value ?? cell.value;
      events.push({ date: String(s.date), kind: 'support', client: who(c.slug, c.name), text: `ships ${l}${shipped === 'p' ? ' (partly)' : ''}${s.version ? ` in ${s.version}` : ''}`, source: s.source, key: `ship:${c.slug}:${k}`, feature: k });
    }
  }
  for (const f of data.features) if (f.spec_date && f.spec_event) events.push({ date: String(f.spec_date), kind: 'spec', client: null, text: f.spec_event, source: f.spec_source ?? f.url, key: `feature:${f.id}`, feature: f.id });
  for (const v of data.spec_versions) events.push({ date: String(v), kind: 'spec', client: null, text: `MCP spec ${v} released`, source: `https://modelcontextprotocol.io/specification/${v}`, key: `spec:${v}` });
  const asOf = String(data.as_of);
  return events.filter(e => e.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.client?.name || '').localeCompare(b.client?.name || '') || a.text.localeCompare(b.text));
}

// The last day outside the recent window (as_of minus RECENT_DAYS): recent events are later than it
export function recentCutoff(asOf) {
  return new Date(Date.parse(`${asOf}T00:00:00Z`) - RECENT_DAYS * 864e5).toISOString().slice(0, 10);
}

export function splitRecent(events, asOf) {
  const cut = recentCutoff(asOf);
  return { recent: events.filter(e => e.date > cut), older: events.filter(e => e.date <= cut) };
}

// The events about one column, for its page and feeds: its spec milestone, each client shipping it, and the rechecks
// that moved it. A recheck that moved several columns keeps only this one in its text.
export function forFeature(events, id) {
  return events.flatMap(e => {
    if (e.feature === id) return [e];
    const part = e.changes?.find(([k]) => k === id);
    return part ? [{ ...e, text: `rechecked: ${part[1]}` }] : [];
  });
}

export const plainEvent = e => (e.client ? `${e.client.name} ${e.text}` : e.text);
