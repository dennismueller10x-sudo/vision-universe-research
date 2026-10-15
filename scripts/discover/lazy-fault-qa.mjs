#!/usr/bin/env node
// Echter Browser-Fehlerfall fuer discover/ui/lazy.js (Chromium UND WebKit): Fehlerinjektion auf die echten Skriptlisten
// (dx-lazy-detail aus discover/index.html) gegen einen lokalen statischen Server mit gzip und Cache-Control: max-age=600
// (wie GitHub Pages). Prueft ohne Netz, ohne Produktionsdaten, ohne Workflow:
//   normal         jede Skript-Adresse genau 1x angefragt, Ausfuehrungsreihenfolge = Gruppenreihenfolge
//   transient      503 einmalig auf ein mittleres Skript (narrative.js) und auf eine Abhaengigkeit (chart-ranges.js):
//                  Gruppe OK, alle Skripte genau 1x ausgefuehrt, detail.js sieht beim Laden VUChartRanges
//   dauerhaft 503  Fehler LAZY_SCRIPT_FAILED:<Originaladresse> nach < 5 s, kein Nachfolger des Skripts wurde ausgefuehrt
//   404            sofortiger Fehler ohne Wiederholung (genau 1 Abruf der Originaladresse, Statusprobe)
// Aufruf: node scripts/discover/lazy-fault-qa.mjs [--engines chromium,webkit] [--require-all]
// Ohne --require-all wird eine Engine, die sich nicht starten laesst, uebersprungen (Hinweis auf stderr).
// Beendet sich selbst; Exitcode 1 bei jedem Fehlschlag. Aendert keine Datei und braucht keinen Workflow.
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const engines = arg('engines', 'chromium,webkit').split(',');
const requireAll = args.includes('--require-all');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '') + '/playwright'); }

const indexHtml = fs.readFileSync(path.join(root, 'discover/index.html'), 'utf8');
const template = indexHtml.match(/<template id="dx-lazy-detail">[\s\S]*?<\/template>/)[0];
const order = [...template.matchAll(/src="([^"]+)"/g)].map(m => m[1].split('?')[0]).filter((p, i, all) => all.indexOf(p) === i);
assert.ok(order.length > 10 && order.includes('/discover/ui/detail.js') && order.includes('/quant/engines/chart-ranges.js') && order.includes('/discover/engines/narrative.js'), 'unerwartete Skriptliste');
const MID = '/discover/engines/narrative.js', DEP = '/quant/engines/chart-ranges.js', DETAIL = '/discover/ui/detail.js';
const page = `<!doctype html><html><head><meta charset="utf-8"><title>lazy-fault-qa</title></head><body>${template}<script src="/discover/ui/lazy.js"></script></body></html>`;

let faults = {}, log = [];
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/__t.html') { res.setHeader('content-type', 'text/html'); res.end(page); return; }
  const rec = status => { if (order.includes(p)) log.push({path: p, method: req.method, url: req.url, status}); };
  const fault = faults[p];
  if (fault && fault.left > 0) {
    fault.left--; rec(fault.status);
    res.statusCode = fault.status; res.setHeader('content-type', 'text/html'); res.setHeader('cache-control', 'no-cache');
    res.end('<html><body>error ' + 'x'.repeat(4000) + '</body></html>'); return;
  }
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rec(404); res.statusCode = 404; res.end('not found'); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.js') && order.includes(p)) {
    // Beginn der Ausfuehrung wird vorn vermerkt (manche Skripte werfen ohne die App-Umgebung beim Laden; das aendert die Reihenfolge nicht)
    const pre = `;(window.__ex=window.__ex||[]).push(${JSON.stringify(p)});` + (p === DETAIL ? 'window.__sawRanges=typeof window.VUChartRanges;' : '') + '\n';
    body = Buffer.from(pre + body.toString('utf8'));
  }
  rec(200);
  res.setHeader('content-type', file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
  res.setHeader('cache-control', 'public, max-age=600');
  if (req.method === 'HEAD') { res.end(); return; }
  if (/gzip/.test(req.headers['accept-encoding'] || '')) { res.setHeader('content-encoding', 'gzip'); res.end(zlib.gzipSync(body)); } else res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

async function scenario(browser, injected) {
  faults = JSON.parse(JSON.stringify(injected)); log = [];
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto(base + '/__t.html', {waitUntil: 'load'});
  log = [];
  const result = await tab.evaluate(async () => {
    // reloadOnce() wuerde die Pruefseite bei einem endgueltigen Fehler neu laden; dieser Schutz ist der bestehende Mechanismus.
    try { sessionStorage.setItem('vu-lazy-reload', '1'); } catch (_) { /* egal */ }
    const t = performance.now();
    try { await window.VUDiscover.Lazy.load('detail'); return {ok: true, ms: Math.round(performance.now() - t), ex: window.__ex || [], saw: window.__sawRanges, nodes: document.querySelectorAll('script[src]').length}; }
    catch (error) { return {ok: false, message: error.message, attempts: error.attempts, status: error.status, ms: Math.round(performance.now() - t), ex: window.__ex || [], saw: window.__sawRanges}; }
  });
  const counts = {};
  for (const entry of log) if (entry.method === 'GET') counts[entry.path] = (counts[entry.path] || 0) + 1;
  await context.close();
  return {result, counts, log};
}

const failures = [];
async function check(name, fn) {
  try { await fn(); console.log('  ok   ' + name); } catch (error) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + String(error.message).split('\n').slice(0, 4).join('\n       ')); }
}

let ran = 0;
for (const engine of engines) {
  let browser;
  try { browser = await playwright[engine].launch({headless: true}); } catch (error) {
    console.error('Engine ' + engine + ' nicht startbar: ' + String(error.message).split('\n')[0]);
    if (requireAll) failures.push(engine + ' nicht startbar');
    continue;
  }
  ran++;
  console.log(engine + ' ' + browser.version());
  await check('normal: jede Adresse 1x, Reihenfolge unveraendert', async () => {
    const {result, counts} = await scenario(browser, {});
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.ex, order);
    assert.deepEqual(Object.keys(counts).sort(), order.slice().sort());
    assert.deepEqual(Object.entries(counts).filter(([, n]) => n !== 1), [], 'Adressen mehrfach angefragt');
  });
  for (const [label, target] of [['mittleres Skript', MID], ['Abhaengigkeit von detail.js', DEP]]) {
    await check('transienter 503 auf ' + label + ' (' + path.basename(target) + '): Gruppe OK, Reihenfolge, detail.js sieht VUChartRanges', async () => {
      const {result, counts} = await scenario(browser, {[target]: {status: 503, left: 1}});
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.deepEqual(result.ex, order, 'jedes Skript genau einmal, in Gruppenreihenfolge');
      assert.equal(result.saw, 'object', 'detail.js hat VUChartRanges beim Laden nicht gesehen');
      assert.ok(counts[target] >= 2 && counts[target] <= 3, 'Abrufe von ' + target + ': ' + counts[target]);
      assert.ok(result.ms < 5000, 'Dauer ' + result.ms);
    });
  }
  await check('dauerhafter 503 auf mittleres Skript: Fehler < 5 s, kein Nachfolger ausgefuehrt', async () => {
    const {result} = await scenario(browser, {[MID]: {status: 503, left: 99}});
    assert.equal(result.ok, false);
    assert.equal(result.message, 'LAZY_SCRIPT_FAILED:' + MID, 'Fehler nennt die Originaladresse: ' + result.message);
    assert.equal(result.attempts, 3);
    assert.equal(result.status, 503);
    assert.ok(result.ms < 5000, 'Dauer ' + result.ms);
    assert.deepEqual(result.ex, order.slice(0, order.indexOf(MID)), 'nur die Vorgaenger duerfen gelaufen sein');
    assert.equal(result.saw, undefined, 'detail.js darf nicht gelaufen sein');
  });
  await check('dauerhafter 404 auf Abhaengigkeit: sofortiger Fehler ohne Wiederholung, kein Nachfolger', async () => {
    const {result, counts, log} = await scenario(browser, {[DEP]: {status: 404, left: 99}});
    assert.equal(result.ok, false);
    assert.equal(result.message, 'LAZY_SCRIPT_FAILED:' + DEP);
    assert.equal(result.attempts, 1);
    assert.equal(result.status, 404);
    assert.ok(result.ms < 2000, 'Dauer ' + result.ms);
    assert.equal(counts[DEP] || 0, 1, 'GET-Abrufe: ' + JSON.stringify(log.filter(l => l.path === DEP)));
    assert.deepEqual(result.ex, order.slice(0, order.indexOf(DEP)));
  });
  await browser.close();
}
server.close();
if (ran === 0 && !failures.length) failures.push('keine Engine lief');
if (failures.length) { console.error('\n' + failures.length + ' Pruefung(en) fehlgeschlagen'); process.exit(1); }
console.log('\nlazy-fault-qa: alles ok (' + ran + ' Engine(s))');
process.exit(0);
