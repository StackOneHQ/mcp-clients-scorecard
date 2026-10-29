// Time series built from the `since` dates on each cell, and the per-date snapshot in data/history/
import { COLUMNS, TIERS } from './data.mjs';

export const SERIES_START = '2024-11';
const FEATURE_COLS = COLUMNS.filter(([k]) => k !== 'protocol');
const supported = cell => cell.value === 'y' || cell.value === 'p';

// What every client looked like on as_of. Written to data/history/<as_of>.json so later dates can be compared.
export function snapshot({ data }) {
  const clients = {};
  for (const c of [...data.clients].sort((a, b) => a.slug.localeCompare(b.slug))) {
    clients[c.slug] = { name: c.name, group: c.group, tier: c.tier, ...Object.fromEntries(COLUMNS.map(([k]) => [k, String(c.cells[k].value)])) };
  }
  return JSON.stringify({ as_of: String(data.as_of), spec_versions: data.spec_versions.map(String), clients }, null, 2) + '\n';
}

// Month labels from SERIES_START to the month of as_of, inclusive
export function months(asOf) {
  const out = [];
  let [y, m] = SERIES_START.split('-').map(Number);
  const end = String(asOf).slice(0, 7);
  for (;;) {
    const s = `${y}-${String(m).padStart(2, '0')}`;
    out.push(s);
    if (s >= end) return out;
    if (++m > 12) { m = 1; y++; }
  }
}

// A cell counts from the month of its since date. Cells that are y or p today but carry no since are "undated".
const datedMonth = cell => (supported(cell) && cell.since ? String(cell.since.date).slice(0, 7) : null);

export function featureSeries({ data }) {
  const ms = months(data.as_of);
  return FEATURE_COLS.map(([k, label]) => {
    const dated = data.clients.map(c => datedMonth(c.cells[k])).filter(Boolean);
    const undated = data.clients.filter(c => supported(c.cells[k]) && !c.cells[k].since).length;
    return { id: k, label, values: ms.map(m => dated.filter(d => d <= m).length), undated };
  });
}

export function clientSeries({ data }, limit = 8) {
  const ms = months(data.as_of);
  return data.clients
    .map(c => {
      const dated = FEATURE_COLS.map(([k]) => datedMonth(c.cells[k])).filter(Boolean);
      return { name: c.name, tier: c.tier, values: ms.map(m => dated.filter(d => d <= m).length), dated: dated.length };
    })
    .filter(s => s.dated > 0)
    .sort((a, b) => b.dated - a.dated || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// The earliest dated release per feature, with every client that shipped it that month
export function firstShippers({ data }) {
  const out = [];
  for (const [k, label] of FEATURE_COLS) {
    const dated = data.clients.filter(c => supported(c.cells[k]) && c.cells[k].since).map(c => ({ name: c.cells[k].value === 'p' ? `${c.name} (partial)` : c.name, date: String(c.cells[k].since.date) }));
    if (!dated.length) continue;
    const first = dated.reduce((a, b) => (b.date < a.date ? b : a)).date;
    const names = dated.filter(d => d.date.slice(0, 7) === first.slice(0, 7)).map(d => d.name).sort();
    out.push({ id: k, label, date: first, names });
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
