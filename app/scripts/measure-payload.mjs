// Misst, was die Produktseiten beim Start vom Netz laden (gzip-Uebertragung wie GitHub Pages).
// Nur lesend: bedient das Repository statisch ueber localhost, schreibt nichts ins Repository.
// Aufruf: node app/scripts/measure-payload.mjs [--out datei.json] [--slow]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// --root <Ordner>: statt des Quelltexts einen gebauten Release messen (node scripts/vu2/build-release.mjs --output=...).
// Wichtig: Produktion liefert den Release aus, nicht den Quelltext (Faktor-Shards entstehen erst im Release-Build).
const root = path.resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const out = arg('--out');
const slow = process.argv.includes('--slow');
const {chromium} = createRequire(import.meta.url)('playwright');

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};
const GZ = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest']);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  const ext = path.extname(file);
  const body = fs.readFileSync(file);
  const headers = {'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store'};
  if (GZ.has(ext) && body.length > 1024) {
    const z = zlib.gzipSync(body, {level: 6});
    res.writeHead(200, {...headers, 'content-encoding': 'gzip', 'x-decoded-length': String(body.length)});
    return res.end(z);
  }
  res.writeHead(200, {...headers, 'x-decoded-length': String(body.length)}); res.end(body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const ROUTES = [
  ['Discover Start', '/discover/'],
  ['Discover Aktie', '/discover/#/s/US_REAL/NVDA'],
  ['Quant Start', '/quant/'],
  ['Quant Aktie', '/quant/#/aktie/NVDA'],
  ['Technical', '/technical/'],
  ['Supertrader', '/supertrader/'],
  ['Konto (Web)', '/konto/'],
];

const browser = await chromium.launch();
const rows = [];
for (const [name, route] of ROUTES) {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (slow) await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8});
  const reqs = new Map();
  cdp.on('Network.responseReceived', e => reqs.set(e.requestId, {url: e.response.url, status: e.response.status, type: e.type}));
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.wire = e.encodedDataLength; });
  cdp.on('Network.dataReceived', e => { const r = reqs.get(e.requestId); if (r) r.decoded = (r.decoded || 0) + e.dataLength; });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 120)));
  const t0 = Date.now();
  let timedOut = false;
  try { await page.goto(base + route, {waitUntil: 'load', timeout: 60000}); } catch { timedOut = true; }
  try { await page.waitForLoadState('networkidle', {timeout: 20000}); } catch { /* weiter laufende Abrufe: gemessen bis hierher */ }
  const settle = Date.now() - t0;
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics').catch(() => ({metrics: []}))).metrics.map(m => [m.name, m.value]));
  await cdp.send('Performance.enable').catch(() => {});
  const m2 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const list = [...reqs.values()].filter(r => r.url.startsWith(base));
  const wire = list.reduce((s, r) => s + (r.wire || 0), 0);
  const dec = list.reduce((s, r) => s + (r.decoded || 0), 0);
  const top = list.filter(r => r.status === 200).sort((a, b) => (b.wire || 0) - (a.wire || 0)).slice(0, 5)
    .map(r => ({path: r.url.replace(base, '').slice(0, 90), wireKB: Math.round((r.wire || 0) / 1024), decodedKB: Math.round((r.decoded || 0) / 1024)}));
  const json = list.filter(r => /\.json(\?|$)/.test(r.url));
  rows.push({name, route, settleMs: settle, timedOut, requests: list.length, wireKB: Math.round(wire / 1024), decodedKB: Math.round(dec / 1024),
    jsonRequests: json.length, jsonWireKB: Math.round(json.reduce((s, r) => s + (r.wire || 0), 0) / 1024),
    jsHeapMB: Math.round(((m2.JSHeapUsedSize || metrics.JSHeapUsedSize || 0) / 1048576) * 10) / 10,
    notFound: list.filter(r => r.status >= 400).length, pageErrors: errors.length, top});
  await ctx.close();
}
await browser.close(); server.close();
const result = {profile: slow ? 'iPhone-Breite, Chromium, 1,6 Mbit/s, 150 ms' : 'iPhone-Breite, Chromium, lokal ohne Drosselung',
  root: process.argv.includes('--root') ? 'gebauter Release' : 'Quelltext',
  note: 'Chromium, nicht WKWebView. Uebertragung gzip Stufe 6 wie GitHub Pages; echte Werte auf dem Geraet stehen aus.', rows};
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2)); 
console.log(JSON.stringify(result, null, 2));
