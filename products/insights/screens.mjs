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

// Ansichten je Aktie: die Aktienseite /aktie/#/<T> (App-Konzept 2, dunkel) an drei Stellen. Je Ansicht eine Liste von
// Abschnitten (Überschrift h2); genommen wird der erste vorhandene, sonst entfällt die Ansicht (junge Notierungen
// haben z. B. noch kein „Das Geschäft“). Mindestens zwei Ansichten je Aktie (Test IN-7).
const VIEWS = [
  ['kurs', null, 'Kurs', 'Kurs und Verlauf'],
  ['analyse', ['Analyse aus', 'In zwei Sätzen'], 'Analyse', 'Was die Module sagen'],
  ['geschaeft', ['Das Geschäft', 'Mehr wie'], 'Geschäft', 'Umsatz und Gewinn'],
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
  for (const [id, abschnitte, label, text] of VIEWS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${base}/aktie/#/${t}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    let titel = null;
    if (abschnitte) {
      titel = await page.evaluate((liste) => {
        const h = [...document.querySelectorAll('h2')];
        for (const s of liste) { const el = h.find((x) => x.textContent.trim().startsWith(s)); if (el) { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); return el.textContent.trim(); } }
        return null;
      }, abschnitte);
      if (!titel) { await page.close(); continue; }
      await page.waitForTimeout(800);
    }
    const name = `${t.toLowerCase()}-${id}-${A.datum}.jpg`;
    await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 80 });
    const neben = titel && !titel.startsWith(abschnitte[0]);
    A.appScreens[t].push({ id, label: neben ? titel.replace(/^Mehr wie .*/, 'Ähnliche Aktien') : label, text: neben ? 'Auf der Aktienseite' : text, src: `/insights/img/app/${name}`, href: `/aktie/#/${t}` });
    await page.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(file, JSON.stringify(A, null, 1) + '\n');
console.log(`${path.basename(file)}: ${Object.values(A.appScreens).flat().length} App-Screens aufgenommen.`);
