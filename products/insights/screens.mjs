// Insights: nimmt für jeden Ticker eines Artikels echte App-Ansichten auf (iPhone-Größe) und trägt sie in "appScreens" ein.
// Die Bilder zeigen die App am Erscheinungstag (wie die eingefrorenen Daten) und liegen unter insights/img/app/.
//   node products/insights/screens.mjs products/insights/artikel/<datei>.json [--neu]
// Startet einen eigenen kleinen Server auf der Repo-Wurzel; braucht Playwright mit Chromium (in der Umgebung vorhanden).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.resolve(process.argv[2] || '');
const A = JSON.parse(fs.readFileSync(file, 'utf8'));
if (A.appScreens && !process.argv.includes('--neu')) { console.error('App-Screens sind schon aufgenommen (--neu zum Neubau).'); process.exit(1); }

// Ansichten je Aktie: Perspektive der Aktienadresse /aktie/?t=<T>&p=<p> (core/stock-address.js)
const VIEWS = [
  ['discover', 'ueberblick', 'Discover', 'Kurs und Verlauf'],
  ['fundamental', 'zahlen', 'Fundamental', 'Das Geschäft in Zahlen'],
  ['hedgefonds', 'investoren', 'Hedgefonds', 'Was große Fonds melden'],
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.gz': 'application/gzip' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const out = path.join(root, 'insights/img/app');
fs.mkdirSync(out, { recursive: true });
A.appScreens = {};
for (const t of A.ticker) {
  A.appScreens[t] = [];
  for (const [id, p, label, text] of VIEWS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.addInitScript(() => { try { localStorage.setItem('vu-discover-theme-v1', 'light'); } catch { /* privat */ } });
    await page.goto(`${base}/aktie/?t=${t}&p=${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const name = `${t.toLowerCase()}-${id}-${A.datum}.jpg`;
    await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 80 });
    A.appScreens[t].push({ id, label, text, src: `/insights/img/app/${name}`, href: `/aktie/${t}${p === 'ueberblick' ? '' : '?p=' + p}` });
    await page.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(file, JSON.stringify(A, null, 1) + '\n');
console.log(`${path.basename(file)}: ${Object.values(A.appScreens).flat().length} App-Screens aufgenommen.`);
