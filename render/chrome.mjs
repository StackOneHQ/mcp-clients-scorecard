// Headless Chrome for the PNGs that build.mjs draws: the README charts and the website share cards
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function findChrome() {
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
  throw new Error('Chrome not found. Set CHROME_PATH, or skip the images: npm run build -- --no-images.');
}

// Renders each [html, width, height, pngPath] at device scale 1
export function screenshots(pages) {
  if (!pages.length) return;
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-scorecard-'));
  try {
    pages.forEach(([html, w, h, png], i) => {
      const src = path.join(tmp, `${i}.html`);
      fs.writeFileSync(src, html);
      execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        `--window-size=${w},${h}`, '--virtual-time-budget=8000', `--screenshot=${png}`, 'file://' + src], { stdio: 'ignore' });
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
