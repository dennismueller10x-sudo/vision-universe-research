// Prüft die Präsentation: startet einen eigenen Server, lädt sie in Chromium (Playwright),
// meldet JS-Fehler, fehlende Screens, fehlende Dateien und macht optional Folien-Screenshots.
// Aufruf: node check.js <siteDir> [--shots <outDir>] [--only <Folien-ID-Präfix, z. B. Q>]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const site = path.resolve(process.argv[2]);
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const shots = arg('--shots'), only = arg('--only');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = path.join(site, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
srv.listen(0, async () => {
  const port = srv.address().port, b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push('JS: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().replace('http://localhost:' + port, '')); });
  await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForTimeout(2500);
  const info = await pg.evaluate(() => ({ slides: document.querySelectorAll('#deck>section').length, screens: Object.keys(VU.screens).length, missing: [...document.querySelectorAll('.missing p')].map(p => p.textContent), sw: document.documentElement.scrollWidth }));
  console.log(JSON.stringify(info, null, 1)); console.log(errs.length ? errs.join('\n') : 'keine Fehler');
  if (shots) { fs.mkdirSync(shots, { recursive: true }); const secs = await pg.$$('#deck>section'); for (const s of secs) { const id = await s.getAttribute('id'); if (only && !id.startsWith(only)) continue; await s.scrollIntoViewIfNeeded(); await pg.waitForTimeout(120); await s.screenshot({ path: path.join(shots, id + '.jpg'), type: 'jpeg', quality: 70 }); } console.log('Screenshots in ' + shots); }
  await b.close(); srv.close();
});
