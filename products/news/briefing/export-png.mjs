// Marktbriefing: exportiert die Karten eines Briefings als PNG 1080×1350 (Instagram-Karussell, Video).
//   node products/news/briefing/export-png.mjs <briefing.json> <zielordner>
// Braucht Playwright mit Chromium (in Cloud-Sitzungen vorinstalliert; nicht Teil der Seite).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);
const Render = require('./render.js');

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) { console.error('Aufruf: export-png.mjs <briefing.json> <zielordner>'); process.exit(2); }
const b = JSON.parse(fs.readFileSync(file, 'utf8'));
const font = pathToFileURL(path.join(root, 'assets/fonts/inter-latin.woff2')).href;
const html = '<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Inter;src:url(' + font + ') format("woff2");font-weight:100 900}' +
  'body{margin:0;background:#000}svg{display:block}</style>' + b.cards.map((c, i) => Render.cardSvg(c, i, b.cards.length, b.session)).join('');
fs.mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, '.karten.html');
fs.writeFileSync(tmp, html);

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire(path.join(process.env.NODE_PATH || '/usr/lib/node_modules', 'x'))('playwright')); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Render.W, height: Render.H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
const svgs = page.locator('svg');
const n = await svgs.count();
for (let i = 0; i < n; i++) {
  const name = path.join(outDir, b.session + '-karte-' + String(i + 1).padStart(2, '0') + '.png');
  await svgs.nth(i).screenshot({ path: name });
}
await browser.close();
fs.unlinkSync(tmp);
console.log(n + ' Karten nach ' + outDir);
