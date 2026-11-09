// npm run build                   regenerate the README sections, EVIDENCE.md, the history snapshot and the PNGs
// npm run build -- --no-images    skip the PNGs (no Chrome needed)
// npm run build -- --all-images   re-render every PNG, not only the ones whose chart changed
// npm run check                   validate data/ and fail if any generated file is out of date
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, load, tierMismatches } from './data.mjs';
import { evidence, spliceReadme, readmeSections } from './markdown.mjs';
import { tiersHtml, matrixHtml, historyFeaturesHtml, historyClientsHtml, badgeSvg } from './images.mjs';
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
  ...Object.fromEntries(model.data.clients.map(c => [`assets/badges/${c.slug}.svg`, badgeSvg(c)])),
};
const ms = months(model.data);
const features = featureSeries(model);
const images = [
  ['tiers', tiersHtml(model), 1080, 1350],
  ['matrix', matrixHtml(model), 1080, 1350],
  ['history-features', historyFeaturesHtml(model, ms, features), 1200, 700],
  ['history-clients', historyClientsHtml(model, ms, clientSeries(model), features.map(f => f.label)), 1200, 700],
];
// PNG bytes differ between Chrome versions, so check compares a hash of the HTML each image was rendered from
const IMAGE_HASHES = 'assets/images.json';
const hashes = Object.fromEntries(images.map(([name, html]) => [name, crypto.createHash('sha256').update(html).digest('hex')]));
const built = fs.existsSync(ROOT + IMAGE_HASHES) ? JSON.parse(fs.readFileSync(ROOT + IMAGE_HASHES, 'utf8')) : {};
const staleImages = images.map(([n]) => n).filter(n => built[n] !== hashes[n] || !fs.existsSync(ROOT + `assets/${n}.png`));
const staleMessage = `Out of date: ${staleImages.map(n => `assets/${n}.png`).join(', ')}. Run \`npm run build\` with Chrome available and commit the result.`;

if (check) {
  const stale = Object.entries(outputs).filter(([f, s]) => !fs.existsSync(ROOT + f) || fs.readFileSync(ROOT + f, 'utf8') !== s).map(([f]) => f);
  stale.push(...orphanBadges());
  if (stale.length) {
    console.error(`Out of date: ${stale.join(', ')}. Run \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  if (staleImages.length) {
    console.error(staleMessage);
    process.exit(1);
  }
  console.log(`data valid, ${model.data.clients.length} clients; README.md, EVIDENCE.md, ${historyFile}, badges and images up to date`);
  process.exit(0);
}

for (const f of orphanBadges()) fs.rmSync(ROOT + f);
for (const [f, s] of Object.entries(outputs)) {
  fs.mkdirSync(path.dirname(ROOT + f), { recursive: true });
  fs.writeFileSync(ROOT + f, s);
}
console.log(`wrote README.md, EVIDENCE.md, ${historyFile} and ${model.data.clients.length} badges`);

if (args.has('--no-images')) {
  if (staleImages.length) console.warn(`Skipped the images. ${staleMessage}`);
} else {
  // Only re-render an image whose HTML changed, so a rebuild on another machine does not churn PNG bytes
  const todo = images.filter(([name]) => args.has('--all-images') || staleImages.includes(name));
  const chrome = todo.length ? findChrome() : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-scorecard-'));
  for (const [name, html, w, h] of todo) {
    const src = path.join(tmp, name + '.html');
    fs.writeFileSync(src, html);
    const png = ROOT + `assets/${name}.png`;
    execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${w},${h}`, '--virtual-time-budget=8000', `--screenshot=${png}`, 'file://' + src], { stdio: 'ignore' });
    console.log(`wrote assets/${name}.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(ROOT + IMAGE_HASHES, JSON.stringify(hashes, null, 2) + '\n');
}

// Badges of clients that were renamed or removed
function orphanBadges() {
  const dir = ROOT + 'assets/badges';
  return fs.existsSync(dir) ? fs.readdirSync(dir).map(f => `assets/badges/${f}`).filter(f => !(f in outputs)) : [];
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
