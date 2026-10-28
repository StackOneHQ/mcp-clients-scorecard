// npm run build            regenerate README table, EVIDENCE.md and both PNGs
// npm run build -- --no-images   skip the PNGs (no Chrome needed)
// npm run check            fail if README.md or EVIDENCE.md is out of date with the data
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, load, tierMismatches } from './data.mjs';
import { readmeTable, evidence, spliceReadme } from './markdown.mjs';
import { tiersHtml, matrixHtml } from './images.mjs';

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const model = load();

const unexplained = tierMismatches(model.data).filter(m => !m.note);
if (unexplained.length) {
  console.error(unexplained.map(m => `${m.name} is tier ${m.tier} but the rubric gives ${m.rubric}. Move it, or add a tier_note.`).join("\n"));
  process.exit(1);
}

const outputs = {
  'README.md': spliceReadme(fs.readFileSync(ROOT + 'README.md', 'utf8'), readmeTable(model), model.data),
  'EVIDENCE.md': evidence(model),
};

if (check) {
  const stale = Object.entries(outputs).filter(([f, s]) => !fs.existsSync(ROOT + f) || fs.readFileSync(ROOT + f, 'utf8') !== s).map(([f]) => f);
  if (stale.length) {
    console.error(`Out of date: ${stale.join(', ')}. Run \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  const missing = ['tiers', 'matrix'].filter(n => !fs.existsSync(ROOT + `assets/${n}.png`));
  if (missing.length) {
    console.error(`Missing assets/${missing.join('.png, assets/')}.png. Run \`npm run build\` with Chrome available.`);
    process.exit(1);
  }
  console.log(`data valid, ${model.data.clients.length} clients, README.md and EVIDENCE.md up to date`);
  process.exit(0);
}

for (const [f, s] of Object.entries(outputs)) fs.writeFileSync(ROOT + f, s);
console.log('wrote README.md, EVIDENCE.md');

if (!args.has('--no-images')) {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-compat-'));
  for (const [name, html] of [['tiers', tiersHtml(model)], ['matrix', matrixHtml(model)]]) {
    const src = path.join(tmp, name + '.html');
    fs.writeFileSync(src, html);
    const png = ROOT + `assets/${name}.png`;
    execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--window-size=1080,1350', '--virtual-time-budget=8000', `--screenshot=${png}`, 'file://' + src], { stdio: 'ignore' });
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
