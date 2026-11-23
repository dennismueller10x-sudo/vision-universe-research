// Marktbriefing → Instagram-Karussell: node products/news/briefing/social.mjs <briefing.json> <ordner> [--ausgabe <landing/marktbriefing/<sitzung>>]
// Schreibt marktbriefing-ig-1..N.png (1080×1350) und caption.txt. Playwright nötig (wie pdf.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const Social = require('./social.js');
function playwright() {
  try { return require('playwright'); } catch { /* global */ }
  for (const p of [process.env.PLAYWRIGHT_PREFIX, process.env.NODE_PATH, '/usr/lib/node_modules', '/usr/local/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(path.join(p, 'x.js'))('playwright'); } catch { /* weiter */ }
    try { return createRequire(path.join(p, 'node_modules', 'x.js'))('playwright'); } catch { /* weiter */ }
  }
  throw new Error('Playwright fehlt (PLAYWRIGHT_PREFIX oder NODE_PATH setzen).');
}
export async function writeSocial(b, out, { ausgabe = null } = {}) {
  fs.mkdirSync(out, { recursive: true });
  let screens = [];
  if (ausgabe) {
    const list = ((JSON.parse(fs.existsSync(path.join(ausgabe, 'bildschirme.json')) ? fs.readFileSync(path.join(ausgabe, 'bildschirme.json'), 'utf8') : '{"screens":[]}')).screens || []);
    const by = (id) => (list.find((x) => x.id === id) || {}).file;
    screens = [by('start'), by('indizes'), by('marktbild') || by('marktbreite')].filter(Boolean).map((f) => pathToFileURL(path.join(ausgabe, f)).href);
  }
  const font = pathToFileURL(path.resolve(here, '../../../landing/assets/fonts/inter-latin.woff2')).href;
  const tmp = path.join(out, '.social-' + process.pid + '.html');
  fs.writeFileSync(tmp, Social.html(b, { font, screens }));
  const { chromium } = playwright();
  const browser = await chromium.launch();
  const files = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const n = await page.locator('section.s').count();
    for (let i = 1; i <= n; i++) { const f = path.join(out, 'marktbriefing-ig-' + i + '.png'); await page.locator('#s' + i).screenshot({ path: f }); files.push(f); }
  } finally { await browser.close(); fs.rmSync(tmp, { force: true }); }
  const cap = path.join(out, 'caption.txt'); fs.writeFileSync(cap, Social.caption(b)); files.push(cap);
  return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, out] = process.argv.slice(2);
  const i = process.argv.indexOf('--ausgabe');
  if (!file || !out) { console.error('Aufruf: social.mjs <briefing.json> <ordner> [--ausgabe <ordner der Ausgabe>]'); process.exit(2); }
  const files = await writeSocial(JSON.parse(fs.readFileSync(file, 'utf8')), path.resolve(out), { ausgabe: i > 0 ? path.resolve(process.argv[i + 1]) : null });
  console.log(files.join('\n'));
}
