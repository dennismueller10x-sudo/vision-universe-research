#!/usr/bin/env node
// Quant: Direktlinks mit AKTIVER Passwortsperre, langsamen Verbindungen und parallelen Ladevorgaengen.
//
// Hintergrund: PR #619 hatte einen WebKit-Race, der nur ueber die Zugangsmaske auftrat
// (scripts/access-gate/runtime.js oeffnet die Seite per document.open/write/close). Die
// Quant-Browser-QA (browser-qa.mjs) laeuft ohne Maske. Dieses Skript baut aus dem
// fertigen Release eine zweite, GESPERRTE Auslieferung (nur die HTML-Seiten werden
// verpackt, alles andere kommt unveraendert aus dem Release) und laedt jede Route
// durch die Maske - mit Zugangszustand wie in den Gate-Tests (accessStateFor).
//
// Aufruf: node scripts/vu2/browser-qa-direct.mjs --release <Release-Verzeichnis> [--engine chromium|webkit]
//          [--out <Verzeichnis>] [--scale 1] [--seed N] [--overlay <Verzeichnis>] [--empty /pfad ...]
//   --overlay  Dateien, die VOR dem Verpacken ueber das Release gelegt werden (Mutationsnachweis).
//   --empty    diesen Pfad leer (200, 0 Byte) ausliefern (Mutationsnachweis: leere Inhaltsdatei).
// Es werden keine Produktionsdaten geschrieben; Arbeitsverzeichnis ist ein Temp-Ordner.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp, mkdir, readdir, readFile, writeFile, copyFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, extname, dirname, relative, sep} from 'node:path';
import {protectRelease, accessStateFor, verifierForKey} from '../access-gate/build.mjs';
import {SPECS, waitRendered, sleep} from './direct-link-lib.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright'); }
const argv = process.argv.slice(2);
const arg = (key, otherwise) => { const i = argv.indexOf('--' + key); return i < 0 ? otherwise : argv[i + 1]; };
const args = key => argv.flatMap((a, i) => a === '--' + key ? [argv[i + 1]] : []);
const release = resolve(arg('release', ''));
if (!arg('release')) throw Error('--release <Release-Verzeichnis> fehlt');
const engine = arg('engine', 'chromium');
if (!['chromium', 'webkit'].includes(engine)) throw Error('--engine chromium|webkit');
const out = resolve(arg('out', join(tmpdir(), 'quant-direct-qa')));
const scale = Number(arg('scale', '1'));
const seed = Number(arg('seed', String(Date.now() % 100000)));
const overlay = arg('overlay') ? resolve(arg('overlay')) : null;
const emptyPaths = new Set(args('empty'));
const gatePrefixes = ['quant'];
const gateOn = !argv.includes('--no-gate'); // nur fuer den Vergleich mit der ungesperrten Auslieferung

await mkdir(out, {recursive: true});

// ---------------------------------------------------------------- Auslieferung
const work = await mkdtemp(join(tmpdir(), 'quant-direct-'));
const gated = join(work, 'gated');
async function htmlFiles(dir, base = dir) {
  const found = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await htmlFiles(path, base));
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) found.push(relative(base, path));
  }
  return found;
}
for (const prefix of gatePrefixes) {
  for (const file of await htmlFiles(join(release, prefix), release)) {
    await mkdir(dirname(join(gated, file)), {recursive: true});
    await copyFile(join(release, file), join(gated, file));
  }
}
if (overlay) for (const file of await htmlFiles(overlay)) { await mkdir(dirname(join(gated, file)), {recursive: true}); await copyFile(join(overlay, file), join(gated, file)); }
const password = randomBytes(32).toString('hex'); // wie bei PR-Pruefungen: Einmalpasswort, nie ausgegeben
const gateReport = await protectRelease({output: gated, password});
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'};
const layers = [...(gateOn ? [gated] : []), ...(overlay ? [overlay] : []), release];
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (emptyPaths.has(path)) { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(''); return; }
    for (const root of layers) {
      const file = resolve(root, '.' + path);
      if (!file.startsWith(root + sep)) continue;
      try {
        const body = await readFile(file);
        res.setHeader('Content-Type', file.endsWith('.gz') ? 'application/octet-stream' : mime[extname(file)] || 'application/octet-stream');
        res.end(body); return;
      } catch { /* naechste Schicht */ }
    }
    res.statusCode = 404; res.end('not found');
  } catch { res.statusCode = 500; res.end('error'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
const config = JSON.parse(await readFile(join(gated, '__research/config.json'), 'utf8'));
const state = accessStateFor(password);
if (verifierForKey(state.key) !== config.verifier) throw Error('Zugangszustand passt nicht zur Maske');

// ---------------------------------------------------------------- Hilfen
function rng(initial) { let a = initial >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = rng(seed);
const devices = engine === 'webkit'
  ? [{name: 'iPhone 13', options: (({defaultBrowserType, ...rest}) => rest)(playwright.devices['iPhone 13'])}]
  : [{name: 'Pixel 7', options: (({defaultBrowserType, ...rest}) => rest)(playwright.devices['Pixel 7'])}, {name: 'Desktop 1440', options: {viewport: {width: 1440, height: 900}}}];
const launchOptions = {headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})};
const browser = await playwright[engine].launch(launchOptions);
const results = [];
const only = arg('only');
const check = async (name, fn) => {
  if (only && !name.includes(only)) return;
  const started = Date.now();
  try { const detail = await fn(); results.push({name, pass: true, milliseconds: Date.now() - started, detail}); }
  catch (error) { results.push({name, pass: false, milliseconds: Date.now() - started, error: error.message}); }
  const last = results.at(-1);
  console.log((last.pass ? 'PASS ' : 'FAIL ') + name + ' (' + last.milliseconds + ' ms)' + (last.pass ? '' : '\n     ' + last.error.split('\n').join('\n     ')));
};

// Eine Route, eine frische Seite, durch die Maske. Gibt Maengel samt Beleg zurueck.
async function loadThroughGate({device, spec, hash, throttle = null, delays = false, context = null, access = true, timeout}) {
  const own = !context;
  context ||= await browser.newContext(device.options);
  if (access && gateOn) await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch {} }, [config.storageKey, JSON.stringify(state)]);
  const page = await context.newPage();
  const pageErrors = [], contentFetches = [], failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/__research/content/')) contentFetches.push({status: response.status(), url: new URL(url).pathname});
    else if (response.status() >= 500) failedRequests.push(response.status() + ' ' + new URL(url).pathname);
  });
  let cdp = null;
  if (throttle === 'cdp' && engine === 'chromium') {
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 1.6 * 1000 * 1000 / 8, uploadThroughput: 1.6 * 1000 * 1000 / 8});
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  }
  if (delays) {
    // js/css/json (auch .json.gz): zufaellige Verzoegerung je Anfrage, damit Antworten in wechselnder Reihenfolge eintreffen.
    await page.route('**/*', async route => {
      const request = route.request(), url = request.url();
      if (['script', 'stylesheet', 'fetch', 'xhr'].includes(request.resourceType()) || /\.(js|css|json)(\.gz)?(\?|$)/.test(url)) await sleep(20 + Math.floor(random() * 330));
      await route.continue().catch(() => {});
    });
  }
  const started = Date.now(), outcome = {problems: [], contentFetches, pageErrors, failedRequests};
  try {
    const url = base + (hash ?? spec.path);
    const response = await page.goto(url, {waitUntil: 'load', timeout: 60000});
    const document = response ? await response.text() : '';
    outcome.maskServed = document.includes('research-access-settings') && document.includes('research-access-form');
    if (gateOn && !outcome.maskServed) outcome.problems.push('Ausgeliefert wurde NICHT die Zugangsmaske (Test liefe ungesperrt)');
    outcome.gotoMs = Date.now() - started;
    const rendered = await waitRendered(page, spec.specName, {timeout: timeout ?? (throttle || delays ? 60000 : 25000)});
    outcome.ms = rendered.ms;
    outcome.problems.push(...rendered.problems);
    if (access && gateOn && !contentFetches.some(f => f.status === 200)) outcome.problems.push('kein /__research/content/-Abruf mit 200 beobachtet (Maske nicht durchlaufen)');
    if (pageErrors.length) outcome.problems.push('Seitenfehler: ' + pageErrors.slice(0, 2).join(' | '));
    outcome.page = page;
  } catch (error) {
    outcome.problems.push(error.message.split('\n')[0]);
  }
  if (process.env.QA_TRACE) console.log('  load', spec.path, 'goto ' + outcome.gotoMs + ' ms, gerendert +' + outcome.ms + ' ms', outcome.problems.length ? 'FEHLER' : 'ok');
  if (own) { await page.close().catch(() => {}); await context.close().catch(() => {}); delete outcome.page; }
  return outcome;
}
const named = (key, extra = {}) => ({...SPECS[key], specName: {...SPECS[key], ...extra}});
const label = (device, key, i, n) => device.name + ' ' + key + (n > 1 ? ' #' + (i + 1) : '');
const reps = n => Math.max(1, Math.round(n * scale));

// ---------------------------------------------------------------- 1. Maske belegen
if (gateOn) await check('Zugangsmaske ist aktiv: ohne Zugang keine App, mit Zugang Abruf von /__research/content/', async () => {
  const device = devices[0];
  const locked = await loadThroughGate({device, spec: {path: '/quant/#/aktie/NVDA', specName: {...SPECS.nvda}}, access: false, timeout: 4000});
  assert(locked.maskServed, 'Maske wurde nicht ausgeliefert');
  assert(locked.contentFetches.length === 0, 'Inhalt ohne Zugang abgerufen');
  assert(locked.problems.some(p => /Zugangsmaske sichtbar/.test(p)), 'ohne Zugang erwartet: sichtbare Maske, war: ' + locked.problems.join('; '));
  const open = await loadThroughGate({device, spec: named('nvda')});
  assert(open.problems.length === 0, 'mit Zugang: ' + open.problems.join('; '));
  assert(open.contentFetches.some(f => f.url === '/__research/content/quant/index.html' && f.status === 200), 'Abruf der Inhalts-Datei fehlt: ' + JSON.stringify(open.contentFetches));
  return {maske: gateReport, abrufe: open.contentFetches.map(f => f.url)};
});
function assert(condition, message) { if (!condition) throw Error(message); }

// ---------------------------------------------------------------- 2. Direktlinks (durch die Maske)
const critical = ['nvda', 'aapl', 'start'], others = ['radar', 'strategien', 'screener', 'technical'];
for (const device of devices) {
  const primary = device === devices[0];
  await check('Direktlinks ' + (gateOn ? 'durch die Maske' : 'OHNE Maske') + ': ' + device.name, async () => {
    const failures = [];
    let loads = 0;
    const plan = [...critical.map(key => [key, engine === 'webkit' ? reps(15) : primary ? reps(4) : reps(2)]), ...others.map(key => [key, engine === 'webkit' ? reps(3) : 1])];
    for (const [key, count] of plan) {
      for (let i = 0; i < count; i++) {
        loads++;
        const result = await loadThroughGate({device, spec: named(key)});
        if (result.problems.length) failures.push(label(device, key, i, count) + ': ' + result.problems.join('; '));
      }
    }
    assert(!failures.length, failures.length + ' von ' + loads + ' Ladevorgaengen ohne Inhalt:\n' + failures.slice(0, 8).join('\n'));
    return {loads};
  });
}

// ---------------------------------------------------------------- 3. Fehlerhafte Hash-Routen
const broken = [['/quant/#%zz', 'notFoundRoute'], ['/quant/#/aktie/ZZZZQ', 'notFoundStock'], ['/quant/#/unbekannt', 'notFoundRoute'], ['/quant/#/aktie/%zz', 'notFoundRoute'], ['/quant/', 'start'], ['/quant/#', 'start']];
for (const device of devices) {
  await check('Fehlerhafte Hash-Routen, danach funktioniert die Navigation: ' + device.name, async () => {
    const failures = [];
    for (const [path, expected] of broken) {
      const context = await browser.newContext(device.options);
      const opened = await loadThroughGate({device, spec: {path, specName: named(expected).specName}, context});
      if (opened.problems.length) { failures.push(path + ': ' + opened.problems.join('; ')); await context.close().catch(() => {}); continue; }
      // JS bleibt funktionsfaehig: hashchange auf NVDA muss die Aktie zeigen.
      const page = opened.page;
      await page.evaluate(() => { location.hash = '#/aktie/NVDA'; });
      const next = await waitRendered(page, named('nvda').specName, {timeout: 25000});
      if (!next.ok) failures.push(path + ' -> #/aktie/NVDA: ' + next.problems.join('; '));
      if (opened.pageErrors.length) failures.push(path + ': Seitenfehler nach Navigation: ' + opened.pageErrors[0]);
      await page.close().catch(() => {}); await context.close().catch(() => {});
    }
    assert(!failures.length, failures.join('\n'));
  });
}

// ---------------------------------------------------------------- 4. Langsame Verbindungen
for (const device of engine === 'chromium' ? [devices[0]] : devices) {
  if (engine === 'chromium') await check('Langsames Netz (CDP 150 ms, 1,6 Mbit/s, CPU x4): ' + device.name, async () => {
    const failures = [];
    for (const key of ['nvda', 'aapl', 'start', 'screener']) for (let i = 0; i < reps(1); i++) {
      const result = await loadThroughGate({device, spec: named(key), throttle: 'cdp'});
      if (result.problems.length) failures.push(key + ' #' + (i + 1) + ': ' + result.problems.join('; '));
    }
    assert(!failures.length, failures.join('\n'));
  });
  await check('Zufaellige Verzoegerung 20-350 ms je js/css/json (Seed ' + seed + '): ' + device.name, async () => {
    const failures = [];
    for (const key of critical) for (let i = 0; i < reps(engine === 'webkit' ? 5 : 3); i++) {
      const result = await loadThroughGate({device, spec: named(key), delays: true});
      if (result.problems.length) failures.push(key + ' #' + (i + 1) + ': ' + result.problems.join('; '));
    }
    for (const key of others) {
      const result = await loadThroughGate({device, spec: named(key), delays: true});
      if (result.problems.length) failures.push(key + ': ' + result.problems.join('; '));
    }
    assert(!failures.length, failures.join('\n'));
  });
}

// ---------------------------------------------------------------- 5. Parallel
const parallelKeys = ['nvda', 'aapl', 'start', 'radar', 'screener'];
for (const device of devices) {
  await check('Paralleles Laden: ' + parallelKeys.length + ' Kontexte gleichzeitig und ' + parallelKeys.length + ' Tabs in einem Kontext: ' + device.name, async () => {
    const failures = [];
    for (let round = 0; round < reps(engine === 'webkit' ? 4 : 2); round++) {
      const separate = await Promise.all(parallelKeys.map(key => loadThroughGate({device, spec: named(key), delays: round % 2 === 1})));
      separate.forEach((result, i) => { if (result.problems.length) failures.push('Kontext ' + parallelKeys[i] + ' Runde ' + (round + 1) + ': ' + result.problems.join('; ')); });
      const shared = await browser.newContext(device.options);
      const tabs = await Promise.all(parallelKeys.map(key => loadThroughGate({device, spec: named(key), context: shared})));
      tabs.forEach((result, i) => { if (result.problems.length) failures.push('Tab ' + parallelKeys[i] + ' Runde ' + (round + 1) + ': ' + result.problems.join('; ')); });
      await shared.close().catch(() => {});
    }
    assert(!failures.length, failures.join('\n'));
  });
}

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
const report = {status: failed.length ? 'FAIL' : 'PASS', engine, seed, scale, release: relative(process.cwd(), release) || '.', overlay: overlay ? relative(process.cwd(), overlay) : null,
  empty: [...emptyPaths], gate: gateOn ? gateReport : null, seconds: Math.round(results.reduce((n, r) => n + r.milliseconds, 0) / 1000), checks: results};
await writeFile(join(out, 'quant-direct-links-' + engine + '.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({status: report.status, engine, seed, checks: results.length, failed: failed.map(f => f.name), seconds: report.seconds}));
await rm(work, {recursive: true, force: true});
if (failed.length) process.exitCode = 1;
