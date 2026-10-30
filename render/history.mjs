// Time series built from the `since` dates on each cell, and the per-date snapshot in data/history/
import { COLUMNS, TIERS } from './data.mjs';

const FEATURE_COLS = COLUMNS.filter(([k]) => k !== 'protocol');
const supported = cell => cell.value === 'y' || cell.value === 'p';

// A cell counts from the month of its since date. Cells that are y or p today but carry no since are "undated".
const datedMonth = cell => (supported(cell) && cell.since ? String(cell.since.date).slice(0, 7) : null);

// What every client looked like on as_of. Written to data/history/<as_of>.json so later dates can be compared.
export function snapshot({ data }) {
  const clients = {};
  for (const c of [...data.clients].sort((a, b) => a.slug.localeCompare(b.slug))) {
    clients[c.slug] = { name: c.name, group: c.group, tier: c.tier, ...Object.fromEntries(COLUMNS.map(([k]) => [k, String(c.cells[k].value)])) };
  }
  return JSON.stringify({ as_of: String(data.as_of), spec_versions: data.spec_versions.map(String), clients }, null, 2) + '\n';
}

// Month labels from the month before the earliest dated release, so the first step shows, to the month of as_of
export function months(data) {
  const out = [];
  const first = data.clients.flatMap(c => FEATURE_COLS.map(([k]) => datedMonth(c.cells[k]))).filter(Boolean).sort()[0];
  let [y, m] = (first ?? String(data.as_of)).slice(0, 7).split('-').map(Number);
  if (--m < 1) { m = 12; y--; }
  const end = String(data.as_of).slice(0, 7);
  for (;;) {
    const s = `${y}-${String(m).padStart(2, '0')}`;
    out.push(s);
    if (s >= end) return out;
    if (++m > 12) { m = 1; y++; }
  }
}



// Where a line steps up: the month index and the logos of the clients whose release caused it, ordered by client name.
// A logo two clients share shows once per step.
function jumps(ms, shipped) {
  const by = new Map();
  for (const s of [...shipped].sort((a, b) => a.c.name.localeCompare(b.c.name))) {
    const at = ms.indexOf(s.d);
    if (!by.has(at)) by.set(at, []);
    if (!by.get(at).includes(s.c.logo)) by.get(at).push(s.c.logo);
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([at, logos]) => ({ at, logos }));
}

export function featureSeries({ data }) {
  const ms = months(data);
  return FEATURE_COLS.map(([k, label]) => {
    const shipped = data.clients.map(c => ({ c, d: datedMonth(c.cells[k]) })).filter(s => s.d);
    const undated = data.clients.filter(c => supported(c.cells[k]) && !c.cells[k].since).length;
    return { label, values: ms.map(m => shipped.filter(s => s.d <= m).length), undated, jumps: jumps(ms, shipped) };
  });
}

// One row per client with a dated feature: the month index of each feature it shipped (f is the feature's index, matching
// featureSeries and so its colour), plus how many supported features carry no date and so cannot be placed.
export function clientSeries({ data }) {
  const ms = months(data);
  return data.clients
    .map(c => ({
      label: c.name, tier: c.tier, logo: c.logo,
      shipped: FEATURE_COLS.map(([k], f) => ({ f, at: ms.indexOf(datedMonth(c.cells[k])) })).filter(s => s.at >= 0),
      undated: FEATURE_COLS.filter(([k]) => supported(c.cells[k]) && !c.cells[k].since).length,
    }))
    .filter(s => s.shipped.length)
    .sort((a, b) => b.shipped.length - a.shipped.length || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.label.localeCompare(b.label));
}

// The earliest dated release per feature, with every client that shipped it that month
export function firstShippers({ data }) {
  const out = [];
  for (const [k, label] of FEATURE_COLS) {
    const dated = data.clients.filter(c => supported(c.cells[k]) && c.cells[k].since).map(c => ({ name: c.cells[k].value === 'p' ? `${c.name} (partial)` : c.name, date: String(c.cells[k].since.date) }));
    if (!dated.length) continue;
    const first = dated.reduce((a, b) => (b.date < a.date ? b : a)).date;
    const names = dated.filter(d => d.date.slice(0, 7) === first.slice(0, 7)).map(d => d.name).sort();
    out.push({ label, date: first, names });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

export function datedCounts({ data }) {
  let dated = 0, undated = 0;
  for (const c of data.clients) for (const [k] of FEATURE_COLS) {
    if (!supported(c.cells[k])) continue;
    if (c.cells[k].since) dated++; else undated++;
  }
  return { dated, undated };
}
