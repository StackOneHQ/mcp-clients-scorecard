// npm run build                   regenerate the README sections, EVIDENCE.md, the history snapshot and the PNGs
// npm run build -- --no-images    skip the PNGs (no Chrome needed)
// npm run check                   validate data/ and fail if any generated file is out of date
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, load, tierMismatches } from './data.mjs';
import { evidence, spliceReadme, readmeSections } from './markdown.mjs';
import { tiersHtml, matrixHtml, historyFeaturesHtml, historyClientsHtml } from './images.mjs';
import { snapshot, months, featureSeries, clientSeries } from './history.mjs';

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const model = load();

const unexplained = tierMismatches(model.data).filter(m => !m.note);
if (unexplained.length) {
  console.error(unexplained.map(m => `${m.name} is tier ${m.tier} but the rubric gives ${m.rubric}. Move it, or add a tier_note.`).join('\n'));
  process.exit(1);
}

const historyFile = `data/history/${model.data.as_of}.json`;
const outputs = {
  'README.md': spliceReadme(fs.readFileSync(ROOT + 'README.md', 'utf8'), readmeSections(model)),
  'EVIDENCE.md': evidence(model),
  [historyFile]: snapshot(model),
};
const ms = months(model.data.as_of);
const images = [
  ['tiers', tiersHtml(model), 1080, 1350],
  ['matrix', matrixHtml(model), 1080, 1350],
  ['history-features', historyFeaturesHtml(model, ms, featureSeries(model)), 1200, 700],
  ['history-clients', historyClientsHtml(model, ms, clientSeries(model)), 1200, 700],
];

if (check) {
  const stale = Object.entries(outputs).filter(([f, s]) => !fs.existsSync(ROOT + f) || fs.readFileSync(ROOT + f, 'utf8') !== s).map(([f]) => f);
  if (stale.length) {
    console.error(`Out of date: ${stale.join(', ')}. Run \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  const missing = images.map(([n]) => `assets/${n}.png`).filter(f => !fs.existsSync(ROOT + f));
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')}. Run \`npm run build\` with Chrome available.`);
    process.exit(1);
  }
  console.log(`data valid, ${model.data.clients.length} clients, ${Object.keys(outputs).join(', ')} up to date`);
  process.exit(0);
}

fs.mkdirSync(ROOT + 'data/history', { recursive: true });
for (const [f, s] of Object.entries(outputs)) fs.writeFileSync(ROOT + f, s);
console.log(`wrote ${Object.keys(outputs).join(', ')}`);

if (!args.has('--no-images')) {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-scorecard-'));
  for (const [name, html, w, h] of images) {
    const src = path.join(tmp, name + '.html');
    fs.writeFileSync(src, html);
    const png = ROOT + `assets/${name}.png`;
    execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${w},${h}`, '--virtual-time-budget=8000', `--screenshot=${png}`, 'file://' + src], { stdio: 'ignore' });
    console.log(`wrote assets/${name}.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const c of candidates) {
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim(); } catch {}
  }
  const local = path.join(os.homedir(), '.agent-browser/browsers');
  if (fs.existsSync(local)) {
    for (const d of fs.readdirSync(local).sort().reverse()) {
      const p = path.join(local, d, 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('Chrome not found. Set CHROME_PATH, or pass --no-images.');
}
