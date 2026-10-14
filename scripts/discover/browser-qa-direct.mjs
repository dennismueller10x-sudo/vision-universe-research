#!/usr/bin/env node
// Direktlinks mit AKTIVER Passwortsperre, langsamen Verbindungen und parallelen Ladevorgaengen.
//
// Hintergrund: PR #619 hatte einen WebKit-Race, der nur ueber die Zugangsmaske auftrat
// (scripts/access-gate/runtime.js oeffnet die Seite per document.open/write/close). Die
// Direktlink-Pruefung in browser-qa.mjs laeuft ohne Maske. Dieses Skript baut aus dem
// fertigen Release eine zweite, GESPERRTE Auslieferung (nur die HTML-Seiten werden
// verpackt, alles andere kommt unveraendert aus dem Release) und laedt jede Route
// durch die Maske - mit Zugangszustand wie in den Gate-Tests (accessStateFor).
//
// Aufruf: node scripts/discover/browser-qa-direct.mjs --release <Release-Verzeichnis> [--engine chromium|webkit]
//          [--out <Verzeichnis>] [--scale 1] [--seed N] [--overlay <Verzeichnis>] [--empty /pfad ...]
//   --overlay  Dateien, die VOR dem Verpacken ueber das Release gelegt werden (Mutationsnachweis).
//   --empty    diesen Pfad leer (200, 0 Byte) ausliefern (Mutationsnachweis: leere Inhaltsdatei).
//   --fail     /pfad=404|503 diesen Pfad mit dem Statuscode ausliefern (Mutationsnachweis: fehlender Scherben, Serverfehler).
//   --hang     diesen Pfad nie beantworten (Mutationsnachweis: nicht aufgeloester Ladezustand).
//   --tamper   diesen Pfad mit anderen Bytes ausliefern als auf der Platte liegen (Mutationsnachweis: Auslieferungsabweichung).
//   --corrupt  diesen Pfad mit unlesbarem Inhalt ausliefern (Mutationsnachweis: Parsefehler).
//   --serve    /pfad=lokale-Datei  diesen Pfad aus einer anderen Datei bedienen (Mutationsnachweis: alte Kennung).
//   --allow-no-release-id  Lauf gegen einen Release ohne release-id.json zulassen (sonst: Fehler; die CI stempelt vorher).
// Es werden keine Produktionsdaten geschrieben; Arbeitsverzeichnis ist ein Temp-Ordner.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {mkdtemp, mkdir, readdir, readFile, writeFile, copyFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, extname, dirname, relative, sep} from 'node:path';
import {protectRelease, accessStateFor, verifierForKey} from '../access-gate/build.mjs';
import {SPECS, waitRendered, sleep, collectFacts, fullSpec, assessRequests, assessRelease, pageStamps, discoverExpectation, pickWithheldProbes, qualifyingCoreTitles, CORE_CANDIDATES} from './direct-link-lib.mjs';

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
const out = resolve(arg('out', join(tmpdir(), 'discover-direct-qa')));
const scale = Number(arg('scale', '1'));
const seed = Number(arg('seed', String(Date.now() % 100000)));
const overlay = arg('overlay') ? resolve(arg('overlay')) : null;
const emptyPaths = new Set(args('empty'));
const gatePrefixes = ['discover'];
const PRODUCT = 'discover';
const failPaths = new Map(args('fail').map(a => { const i = a.lastIndexOf('='); return [a.slice(0, i), Number(a.slice(i + 1))]; }));
const corruptPaths = new Set(args('corrupt'));
const tamperPaths = new Set(args('tamper'));
const hangPaths = new Set(args('hang'));
const servePaths = new Map(args('serve').map(a => { const i = a.indexOf('='); return [a.slice(0, i), resolve(a.slice(i + 1))]; }));
const allowNoReleaseId = argv.includes('--allow-no-release-id');
const gateOn = !argv.includes('--no-gate'); // nur fuer den Vergleich mit der ungesperrten Auslieferung

await mkdir(out, {recursive: true});

// ---------------------------------------------------------------- Auslieferung
const work = await mkdtemp(join(tmpdir(), 'discover-direct-'));
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
// Was die Seite von einer Datei zu sehen bekommt, ist auch deren Lesbarkeit: JSON und JSON.gz werden beim Ausliefern einmal je Pfad
// geprueft (Parsefehler, leere Datei), das Ergebnis lesen die Netzpruefungen unten. Dateien ueber 6 MB bleiben ungeprueft.
const validity = new Map();
function checkReadable(path, body) {
  if (!/\.json(\.gz)?$/.test(path)) return;
  if (validity.has(path)) return;
  let error = null;
  try {
    if (body.length > 6e6) { validity.set(path, null); return; }
    const raw = path.endsWith('.gz') ? gunzipSync(body) : body;
    if (!raw.length) throw Error('leere Datei');
    JSON.parse(raw.toString('utf8'));
  } catch (caught) { error = String(caught.message).slice(0, 80); }
  validity.set(path, error);
}
// Auslieferungsschichten OHNE Zugangsmaske: so liegt eine Datei im Release (Grundlage fuer "404 trotz vorhandener Datei" und die ?v=-Stempel).
const releaseLayers = [...(overlay ? [overlay] : []), release];
const releaseHas = path => releaseLayers.some(root => { const file = resolve(root, '.' + path); return file.startsWith(root + sep) && existsSync(file); });
const readRelease = path => { for (const root of releaseLayers) { try { return readFileSync(resolve(root, '.' + path)); } catch { /* naechste Schicht */ } } return null; };
const stamps = new Map();
function stampOf(path) {
  if (!stamps.has(path)) { const bytes = readRelease(path); stamps.set(path, bytes ? createHash('sha256').update(bytes).digest('hex').slice(0, 16) : null); }
  return stamps.get(path);
}
const pageHtml = new Map();
function stampsOfPage(routePath) { // die Stempel der Seite, die diese Route ausliefert
  let page = routePath.split('#')[0].split('?')[0]; if (page.endsWith('/')) page += 'index.html';
  if (!pageHtml.has(page)) pageHtml.set(page, pageStamps((readRelease(page) || '').toString()));
  return pageHtml.get(page);
}
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (hangPaths.has(path)) return; // nie antworten; der Browser schliesst die Verbindung am Ende
    if (failPaths.has(path)) { res.statusCode = failPaths.get(path); res.end('fault'); return; }
    if (corruptPaths.has(path)) { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); const body = Buffer.from(path.endsWith('.gz') ? 'kein gzip' : '{"abgeschnitten": [1, 2'); checkReadable(path, body); res.end(body); return; }
    if (tamperPaths.has(path)) { for (const root of layers) { try { const body = Buffer.concat([await readFile(resolve(root, '.' + path)), Buffer.from('\n/* abweichend ausgeliefert */\n')]); res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(body); return; } catch { /* naechste Schicht */ } } }
    if (emptyPaths.has(path)) { res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); validity.set(path, 'leere Datei'); res.end(''); return; }
    if (servePaths.has(path)) { const body = await readFile(servePaths.get(path)); res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(body); return; }
    for (const root of layers) {
      const file = resolve(root, '.' + path);
      if (!file.startsWith(root + sep)) continue;
      try {
        const body = await readFile(file);
        res.setHeader('Content-Type', file.endsWith('.gz') ? 'application/octet-stream' : mime[extname(file)] || 'application/octet-stream');
        checkReadable(path, body);
        res.end(body); return;
      } catch { /* naechste Schicht */ }
    }
    res.statusCode = 404; res.end('not found');
  } catch { res.statusCode = 500; res.end('error'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
const config = JSON.parse(await readFile(join(gated, '__research/config.json'), 'utf8'));
// Die Kennung, die ein Browser jetzt von /release-id.json bekommt (der Release-Waechter der Seite liest dieselbe Datei).
let releaseIdJson = null;
try { const answer = await fetch(base + '/release-id.json'); if (answer.ok) releaseIdJson = await answer.json(); } catch { /* ohne Kennung */ }
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
async function loadThroughGate({device, spec, hash, throttle = null, delays = false, context = null, access = true, timeout, keepFacts = false}) {
  const own = !context;
  context ||= await browser.newContext(device.options);
  if (access && gateOn) await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch {} }, [config.storageKey, JSON.stringify(state)]);
  const page = await context.newPage();
  const pageErrors = [], contentFetches = [], failedRequests = [], records = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => { try { const u = new URL(request.url()); if (u.origin === base) records.push({type: request.resourceType(), path: u.pathname, search: u.search, failed: (request.failure() || {}).errorText || 'failed'}); } catch { /* ignorieren */ } });
  page.on('response', response => {
    const url = response.url();
    try {
      const u = new URL(url);
      if (u.origin === base) {
        const record = {type: response.request().resourceType(), path: u.pathname, search: u.search, status: response.status()};
        // Hash der tatsaechlich EMPFANGENEN Bytes statisch gestempelter Skripte/Stile (nicht der Datei auf der Platte).
        if ((record.type === 'script' || record.type === 'stylesheet') && record.status === 200 && /[?&]v=[0-9a-f]+/.test(u.search)) record.received = response.body().then(b => createHash('sha256').update(b).digest('hex').slice(0, 16), () => null);
        records.push(record);
      }
    } catch { /* ignorieren */ }
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
    if (access) {
      // Netz und Kennung (Phase 4): jede Antwort dieser Seite, nicht nur die sichtbaren Folgen.
      outcome.problems.push(...assessRequests(records.map(r => ({...r, parseError: r.failed ? null : validity.get(r.path) || null})), {has: releaseHas, allow404: !!spec.specName.allow404Data}));
      // Die Kennungs- und Stempelpruefung gilt Seiten der gestempelten Produkte (release-id.mjs#PRODUCTS: quant, discover). Leitet eine Route
      // auf eine Seite ausserhalb um (kein meta vu-release, kein Eintrag in release-id.json), wird sie dort nicht verlangt; Chart, Netz,
      // Ladezustand und Leere der Route bleiben aktiv. Heute leitet keine Discover-Route um (geprueft).
      const finalPath = (() => { try { return new URL(page.url()).pathname; } catch { return ''; } })();
      const stampedProduct = finalPath.startsWith('/' + PRODUCT + '/');
      if (stampedProduct && (releaseIdJson || !allowNoReleaseId)) {
        const meta = await page.evaluate(() => { const m = document.querySelector('meta[name="vu-release"]'); return m ? {product: m.getAttribute('data-product'), content: m.getAttribute('content')} : null; }).catch(() => null);
        const own = stampsOfPage(spec.path.split('#')[0] || '/discover/');
        const stampsSeen = records.filter(r => (r.type === 'script' || r.type === 'stylesheet') && /[?&]v=([0-9a-f]+)/.test(r.search || '')).map(r => ({path: r.path, v: r.search.match(/[?&]v=([0-9a-f]+)/)[1], actual: stampOf(r.path), fixed: own.has(r.path), received: r.received}));
        for (const st of stampsSeen) { st.received = await st.received; if (st.received) st.actual = st.received; }
        outcome.problems.push(...assessRelease({meta, json: releaseIdJson, product: PRODUCT, stamps: stampsSeen, known: [...own.values()]}));
      }
      if (keepFacts) outcome.facts = await page.evaluate(collectFacts, fullSpec(spec.specName)).catch(() => null);
    }
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
// Datenerwartung aus dem Datensatz des Titels im Release (nur Routen mit Titel; sonst keine).
const named = (key, extra = {}) => {
  const expect = discoverExpectation(release, SPECS[key].path, {overlay});
  return {...SPECS[key], specName: {...SPECS[key], ...(expect ? {expect} : {}), ...extra}};
};
const label = (device, key, i, n) => device.name + ' ' + key + (n > 1 ? ' #' + (i + 1) : '');
const reps = n => Math.max(1, Math.round(n * scale));

// ---------------------------------------------------------------- 1. Maske belegen
if (gateOn) await check('Zugangsmaske ist aktiv: ohne Zugang keine App, mit Zugang Abruf von /__research/content/', async () => {
  const device = devices[0];
  const locked = await loadThroughGate({device, spec: {path: '/discover/#/s/US_REAL/NVDA', specName: {...SPECS.nvda}}, access: false, timeout: 4000});
  assert(locked.maskServed, 'Maske wurde nicht ausgeliefert');
  assert(locked.contentFetches.length === 0, 'Inhalt ohne Zugang abgerufen');
  assert(locked.problems.some(p => /Zugangsmaske sichtbar/.test(p)), 'ohne Zugang erwartet: sichtbare Maske, war: ' + locked.problems.join('; '));
  const open = await loadThroughGate({device, spec: named('nvda')});
  assert(open.problems.length === 0, 'mit Zugang: ' + open.problems.join('; '));
  assert(open.contentFetches.some(f => f.url === '/__research/content/discover/index.html' && f.status === 200), 'Abruf der Inhalts-Datei fehlt: ' + JSON.stringify(open.contentFetches));
  return {maske: gateReport, abrufe: open.contentFetches.map(f => f.url)};
});
function assert(condition, message) { if (!condition) throw Error(message); }

// ---------------------------------------------------------------- 2. Direktlinks (durch die Maske)
const critical = ['nvda', 'rheinmetall', 'einzeln'], others = ['daten', 'maerkte', 'strategien', 'aktien'];
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

// ---------------------------------------------------------------- 2b. Fachliche Erwartung aus den Daten
// Die Erwartung kommt aus dem Datensatz des Titels im Release (discover/data/stocks/...), nie aus dem Seitentext. Ohne Datensatz
// fuer NVDA bliebe die Kursstruktur ungeprueft - das ist selbst ein Fehler und bleibt nicht still.
await check('Datenerwartung: mindestens 2 Kerntitel tragen Kursverlauf und Technical-Intelligence-Schichten im Release', async () => {
  // Datengetrieben: ein einzelner zurueckgehaltener Kerntitel ist zulaessige Enthaltung; seine Route folgt dem Datensatz.
  // Erst wenn weniger als 2 Kandidaten qualifizieren, ist das ein Datenproblem.
  const qualified = qualifyingCoreTitles(release, {overlay});
  assert(qualified.length >= 2, 'Kerntitel haben keine veroeffentlichte Auswertung (' + qualified.length + ' von ' + CORE_CANDIDATES.length + ' Kandidaten qualifizieren) - Kursstruktur waere ungeprueft');
  return {qualifiziert: qualified, zurueckgehalten_oder_ohne_datensatz: CORE_CANDIDATES.filter(t => !qualified.includes(t))};
});
// Gegennachweis: zulaessige Enthaltung ist KEIN Fehler. Ein Titel mit zurueckgehaltener Technical-Intelligence-Schicht
// (available = false) zeigt "nicht verfügbar" oder keine Zeile und muss dabei gruen sein; ein Titel mit zurueckgehaltener
// Sparkline (WITHHELD_*, Lizenz) oder ohne Aufnahme (discoveryEligible = false) ebenso.
const probes = pickWithheldProbes(release, {overlay});
for (const device of devices) {
  await check('Zulaessige Enthaltung ist kein Fehler (TI zurueckgehalten ' + (probes.technicalWithheld || '-') + ', Sparkline/Aufnahme zurueckgehalten ' + (probes.redistributionWithheld || '-') + '): ' + device.name, async () => {
    const detail = {};
    if (!probes.technicalWithheld && !probes.redistributionWithheld) { console.warn('WARNUNG: der Release enthaelt keinen zurueckgehaltenen Titel - Gegennachweis uebersprungen'); return {uebersprungen: true}; }
    for (const [kind, symbol] of Object.entries(probes)) {
      if (!symbol) continue;
      const path = '/discover/#/s/US_REAL/' + symbol, expect = discoverExpectation(release, path, {overlay});
      const result = await loadThroughGate({device, spec: {path, specName: {path, h1: '\\S', minText: 1000, expect}}, keepFacts: true});
      assert(!result.problems.length, symbol + ' (' + kind + ') wurde als Fehler gewertet: ' + result.problems.join('; '));
      const ti = result.facts && result.facts.ti;
      if (kind === 'technicalWithheld') {
        assert(!expect.technical.available, symbol + ': Datensatz ist nicht zurueckgehalten, Gegennachweis leer');
        assert(ti && ti.present, symbol + ': Kapitel "Chartbild — Kursstruktur" fehlt');
        assert(Object.values(ti.rows || {}).every(v => /nicht verfügbar/i.test(v)), symbol + ': zurueckgehaltene Schicht zeigt einen Wert: ' + JSON.stringify(ti.rows));
      }
      detail[kind] = {symbol, zeilen: ti && ti.rows};
    }
    return detail;
  });
}

// ---------------------------------------------------------------- 3. Fehlerhafte Hash-Routen
const broken = [['/discover/#%zz', 'start'], ['/discover/#/s/XX/UNKNOWN', 'unknownStock'], ['/discover/#/unbekannt', 'start'], ['/discover/', 'start'], ['/discover/#', 'start']];
for (const device of devices) {
  await check('Fehlerhafte Hash-Routen, danach funktioniert die Navigation: ' + device.name, async () => {
    const failures = [];
    for (const [path, expected] of broken) {
      const context = await browser.newContext(device.options);
      const opened = await loadThroughGate({device, spec: {path, specName: named(expected).specName}, context});
      if (opened.problems.length) { failures.push(path + ': ' + opened.problems.join('; ')); await context.close().catch(() => {}); continue; }
      // JS bleibt funktionsfaehig: hashchange auf NVDA muss die Aktie zeigen.
      const page = opened.page;
      await page.evaluate(() => { location.hash = '#/s/US_REAL/NVDA'; });
      const next = await waitRendered(page, named('nvda').specName, {timeout: 25000});
      if (!next.ok) failures.push(path + ' -> #/s/US_REAL/NVDA: ' + next.problems.join('; '));
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
    for (const key of ['nvda', 'rheinmetall', 'einzeln', 'daten']) for (let i = 0; i < reps(1); i++) {
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
const parallelKeys = ['nvda', 'rheinmetall', 'einzeln', 'maerkte', 'daten'];
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
await writeFile(join(out, 'direct-links-' + engine + '.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({status: report.status, engine, seed, checks: results.length, failed: failed.map(f => f.name), seconds: report.seconds}));
await rm(work, {recursive: true, force: true});
if (failed.length) process.exitCode = 1;
