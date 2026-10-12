/* Startseite: nachgeladene Skriptgruppen (discover/ui/lazy.js) und die Aufteilung in index.html.
   Die Tests halten fest, WAS bedarfsgerecht geladen wird und dass der Rest der Seite nicht von diesen
   Modulen abhaengt - ohne Browser. Ein Browserlauf deckt scripts/discover/browser-qa.mjs ab. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');
const html = read('discover/index.html');
const Lazy = require('../ui/lazy.js');

function template(id) {
  const match = html.match(new RegExp('<template id="' + id + '">([\\s\\S]*?)</template>'));
  assert.ok(match, 'Template fehlt: ' + id);
  return [...match[1].matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
}
const eager = template('dx-start');
const groups = Object.fromEntries(['detail', 'markets', 'daten', 'feed'].map(name => [name, template('dx-lazy-' + name)]));
const path = src => src.split('?')[0];

test('index.html: keine blockierenden Skripte ausser Navigation und PWA - alles andere steht in Templates', () => {
  const live = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<template[\s\S]*?<\/template>/g, '');
  const sources = [...live.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sources, ['/assets/pwa.js', '/assets/site-navigation.js', '/assets/scroll-memory.js']);
});

test('jedes Skript der Templates existiert, und keines steht doppelt im Start', () => {
  for (const src of [...eager, ...Object.values(groups).flat()]) assert.ok(existsSync(join(root, path(src).slice(1))), src);
  assert.equal(new Set(eager).size, eager.length, 'Start: doppeltes Skript');
  for (const [name, list] of Object.entries(groups)) assert.equal(new Set(list).size, list.length, name + ': doppeltes Skript');
});

test('ein Skript ist entweder Start oder Gruppe - ausser dem geteilten Reihenabtastmodul', () => {
  const shared = new Set();
  const seen = new Map();
  for (const [name, list] of Object.entries(groups)) for (const src of list) {
    if (eager.includes(src)) assert.fail(src + ' steht im Start und in ' + name);
    if (seen.has(src)) shared.add(src);
    seen.set(src, name);
  }
  assert.deepEqual([...shared], ['/quant/engines/series-sampling.js']);
});

test('Start behaelt, was die Startseite zeichnet; die Detailroute wartet nicht im Start', () => {
  for (const must of ['/quant/ui/shell.js', '/quant/engines/realtime/freshness.js', '/quant/engines/realtime/source-state.js',
    '/discover/ui/live-hub.js', '/discover/ui/cards.js', '/discover/ui/microchart.js', '/discover/ui/artwork.js', '/discover/ui/logos.js',
    '/discover/ui/surfaces.js', '/discover/engines/fundamentals.js', '/discover/ui/search.js', '/discover/ui/global.js',
    '/discover/engines/global-universe.js', '/core/discover-universe.js', '/core/client.js', '/core/identity.js',
    '/discover/ui/markets.js', '/discover/ui/home-market.js', '/discover/themes.js', '/discover/home.js', '/discover/ui/featured.js',
    '/discover/ui/europe.js', '/discover/engines/europe-product.js', '/discover/engines/europe-bootstrap.js', '/discover/app.js']) {
    assert.ok(eager.some(src => path(src) === must), must + ' fehlt im Start');
  }
  for (const lazy of ['/discover/ui/detail.js', '/discover/detail.js', '/discover/ui/detail-fundamentals.js', '/company-intelligence/ui/stock-section.js',
    '/discover/ui/market-intelligence.js', '/discover/ui/market-barometer.js', '/discover/ui/market-detail.js', '/discover/ui/daten.js', '/discover/ui/feed.js', '/quant/ui/charts.js']) {
    assert.ok(!eager.some(src => path(src) === lazy), lazy + ' darf nicht im Start stehen');
  }
});

test('Reihenfolge im Start: lazy.js vor app.js, bootstrap zuletzt, Waehrungskern unveraendert', () => {
  const order = eager.map(path);
  assert.ok(order.indexOf('/discover/ui/lazy.js') >= 0 && order.indexOf('/discover/ui/lazy.js') < order.indexOf('/discover/ui/global.js'));
  assert.ok(order.indexOf('/discover/ui/lazy.js') < order.indexOf('/discover/app.js'));
  assert.equal(order.at(-1), '/discover/engines/europe-bootstrap.js');
  assert.equal(order.at(-2), '/discover/app.js');
  const detail = groups.detail.map(path);
  assert.ok(detail.indexOf('/quant/ui/charts.js') < detail.indexOf('/quant/ui/technical-chart.js'));
  assert.ok(detail.indexOf('/discover/ui/detail.js') < detail.indexOf('/discover/detail.js'));
  assert.ok(detail.indexOf('/company-intelligence/api/contract.js') < detail.indexOf('/company-intelligence/ui/stock-section.js'));
  assert.ok(detail.indexOf('/quant/engines/series-sampling.js') < detail.indexOf('/discover/ui/detail.js'));
  const markets = groups.markets.map(path);
  assert.ok(markets.indexOf('/quant/engines/series-sampling.js') < markets.indexOf('/discover/ui/market-detail.js'));
});

test('jede Route aus app.js, die ein nachgeladenes Modul braucht, steht in Lazy.ROUTES', () => {
  const app = read('discover/app.js');
  assert.match(app, /D\.Lazy&&D\.Lazy\.forRoute\(parts\)/);
  for (const [route, name] of [['s', 'detail'], ['maerkte', 'markets'], ['daten', 'daten'], ['einzeln', 'feed']]) {
    assert.deepEqual(Lazy.ROUTES[route], [name]);
    assert.ok(groups[name].length > 0);
  }
  assert.deepEqual(Lazy.WARM.slice().sort(), Object.keys(groups).sort());
  // die Hash-Routen, die forRoute abdeckt, sind genau die, die app.js nicht als Startseite behandelt
  const nonHome = app.match(/!\/\^\(([^)]*)\)\$\/\.test\(parts\[0\]/)[1].split('|');
  for (const route of Object.keys(Lazy.ROUTES)) assert.ok(nonHome.includes(route), route);
  assert.match(html, new RegExp('\\^\\(' + nonHome.join('\\|') + '\\)\\$'), 'index.html entscheidet ueber die Startseiten-Route anders als app.js');
});

test('Startseiten-Skripte greifen auf nachgeladene Module nur aus Routen-Code zu', () => {
  // Module, die erst auf ihrer Route (oder im Vorladen) vorhanden sind, und die einzigen Dateien, die sie ansprechen duerfen.
  const lazyModules = {
    'Views.Detail|V.Detail|D.Detail': ['discover/app.js', 'discover/ui/europe.js'],
    'MarketDetail': ['discover/app.js'],
    'MarketIntelligence': ['discover/ui/markets.js'],
    'MarketBarometer': ['discover/ui/markets.js'],
    'D\\.Daten|\\.Daten\\b': ['discover/app.js'],
    'D\\.Feed|\\.Feed\\b': ['discover/app.js'],
    'VUMarketPulse': ['discover/ui/markets.js'],
    'QuantCharts': [],
    'VUChartRanges': [],
    'VUInstrumentDirectory': ['discover/app.js'],
    'DetailFundamentals': [],
    'VUCompanyIntelligence': [],
    'ChartHistory': []
  };
  for (const [pattern, allowed] of Object.entries(lazyModules)) {
    const re = new RegExp('(?:' + pattern + ')');
    for (const src of eager) {
      const file = path(src).slice(1);
      if (!existsSync(join(root, file)) || allowed.includes(file)) continue;
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
      const hits = code.split('\n').filter(line => re.test(line) && !/["'][^"']*(Daten|Feed|Detail)[^"']*["']\s*[,)]|text:|href|class:|aria-label/.test(line));
      assert.deepEqual(hits.map(h => h.trim().slice(0, 80)), [], file + ' greift auf nachgeladenes Modul ' + pattern + ' zu');
    }
  }
});

function fakeDocument(templates, options = {}) {
  const appended = [];
  return {
    appended,
    readyState: 'complete',
    head: { appendChild(node) { appended.push(node); setTimeout(() => (options.fail && options.fail(node.src) ? node.onerror() : node.onload()), 1); } },
    getElementById(id) {
      const list = templates[id.replace('dx-lazy-', '')];
      return list ? { content: { querySelectorAll: () => list.map(src => ({ getAttribute: () => src })) } } : null;
    },
    createElement: () => ({ remove() {} }),
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; }
  };
}
import vm from 'node:vm';
function instance(templates, options = {}, hash = '', handlers = {}) {
  const document = fakeDocument(templates, options);
  const context = { document, location: { hash }, setTimeout, clearTimeout, module: { exports: {} }, navigator: {}, addEventListener(name, fn) { handlers[name] = fn; }, removeEventListener() {} };
  context.globalThis = context;
  vm.runInNewContext(read('discover/ui/lazy.js'), context);
  return { api: context.module.exports, document };
}

test('Lazy.load: Skripte in Reihenfolge, async=false, einmal pro Adresse, Query ignoriert', async () => {
  const { api, document } = instance({ a: ['/x/1.js', '/x/2.js?v=abc'], b: ['/x/2.js', '/x/3.js'] });
  await api.load('a');
  assert.deepEqual(document.appended.map(n => n.src), ['/x/1.js', '/x/2.js?v=abc']);
  assert.ok(document.appended.every(n => n.async === false));
  await Promise.all([api.load('a'), api.load('b')]);
  assert.deepEqual(document.appended.map(n => n.src), ['/x/1.js', '/x/2.js?v=abc', '/x/3.js'], '2.js darf nicht ein zweites Mal geladen werden');
});

test('Lazy.load: unbekannte Gruppe lehnt ab, ein Ladefehler wird beim naechsten Aufruf erneut versucht', async () => {
  const { api, document } = instance({ a: ['/x/1.js', '/x/2.js'] }, { fail: src => src === '/x/2.js' && failing });
  var failing = true;
  await assert.rejects(api.load('nope'), /LAZY_GROUP_UNKNOWN/);
  await assert.rejects(api.load('a'), /LAZY_SCRIPT_FAILED:\/x\/2\.js/);
  failing = false;
  await api.load('a');
  assert.deepEqual(document.appended.map(n => n.src), ['/x/1.js', '/x/2.js', '/x/2.js'], 'nur das fehlgeschlagene Skript wird wiederholt');
});

test('Lazy.forRoute: Startseite und unbekannte Routen laden nichts, Detail laedt die Detailgruppe', async () => {
  const { api, document } = instance({ detail: ['/d.js'], markets: ['/m.js'], daten: ['/n.js'], feed: ['/f.js'] });
  await api.forRoute([]);
  await api.forRoute(['welten']);
  assert.equal(document.appended.length, 0);
  await api.forRoute(['s', 'US_REAL', 'NVDA']);
  assert.deepEqual(document.appended.map(n => n.src), ['/d.js']);
  await api.forRoute(['maerkte', 'QQQ']);
  assert.deepEqual(document.appended.map(n => n.src), ['/d.js', '/m.js']);
});

test('Lazy.settled / onHome: Startseite wartet auf die ersten Karten, andere Routen nicht', async () => {
  const home = instance({}, {}, '');
  assert.equal(home.api.onHome(), true);
  assert.equal(instance({}, {}, '#/s/US_REAL/NVDA').api.onHome(), false);
  assert.equal(instance({}, {}, '#/maerkte').api.onHome(), false);
  assert.equal(instance({}, {}, '#/c/US_REAL/top-10').api.onHome(), false);
  const other = instance({}, {}, '#/welten');
  await Promise.race([other.api.settled(), new Promise((_, reject) => setTimeout(() => reject(new Error('settled haengt')), 3000))]);
});

test('Lazy.image setzt die Adresse erst nach settled', async () => {
  const { api } = instance({}, {}, '#/welten');
  const img = {};
  api.image(img, '/a.webp');
  assert.equal(img.src, undefined);
  await api.settled();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(img.src, '/a.webp');
});

test('vorgerenderter Kopf stimmt mit home.js ueberein (Texte, Ziele, Klassen)', () => {
  const home = read('discover/home.js');
  const header = html.match(/<header class="v2-intro[\s\S]*?<\/header>/)[0];
  for (const text of ['Sieh den Markt mit anderen Augen.', 'Entdecke Unternehmen, Trends und Themenwelten weltweit.', 'Jetzt entdecken →', 'Themenwelten', 'Märkte', 'Unternehmen oder Symbol suchen']) {
    assert.ok(header.includes(text), 'statischer Kopf ohne: ' + text);
    assert.ok(home.includes(text), 'home.js ohne: ' + text);
  }
  for (const href of ['#/aktien', '#/welten', '#/maerkte', '/assets/product-icons.svg#discover']) {
    assert.ok(header.includes(href) && home.includes(href), href);
  }
  for (const cls of ['v2-intro vu-product-hero vu-hero-fidelity', 'vu-hero-scene', 'v2-intro-copy vu-product-hero__copy', 'vu-product-icon vu-product-icon--hero',
    'vu-hero-name', 'vu-product-title vu-hero-headline', 'v2-intro-lead vu-product-lead vu-hero-description', 'v2-search-prompt', 'v2-search-arrow',
    'v2-intro-actions', 'v2-pill v2-pill-dark v2-intro-cta', 'v2-pill v2-pill-ghost']) {
    assert.ok(header.includes('class="' + cls + '"') && home.includes("'" + cls + "'"), cls);
  }
  assert.match(header, /data-product="discover"/);
  assert.match(header, /aria-label="Unternehmen oder Symbol suchen"/);
  assert.equal((header.match(/<h1\b/g) || []).length, 1);
});

test('Kopfbild wird vorgeladen und passt zum Stil des Kopfes', () => {
  assert.match(html, /l\.href="\/assets\/hero-visuals\/discover\.webp"/);
  assert.match(html, /fetchpriority/);
  assert.match(read('discover/home.css'), /\.vu-hero-scene\{background-image:url\('\/assets\/hero-visuals\/discover\.webp'\)\}/);
});

test('Lazy.watch: wer eine Aktienkarte oder einen Maerkte-Link beruehrt, bekommt die Gruppe sofort (ohne auf Ruhe zu warten)', async () => {
  const handlers = {};
  const { api, document } = instance({ detail: ['/d.js'], markets: ['/m.js'], daten: ['/n.js'], feed: ['/f.js'] }, {}, '', handlers);
  const link = href => ({ closest: () => ({ getAttribute: () => href }) });
  api.watch();
  assert.equal(document.appended.length, 0, 'ohne Eingabe wird nichts vorgeladen');
  assert.deepEqual(Array.from(api.routeOf(link('#/s/US_REAL/NVDA'))), ['s', 'US_REAL', 'NVDA']);
  assert.equal(api.routeOf(link('/quant/')), null);
  assert.equal(api.routeOf({}), null);
  handlers.pointerdown({ target: link('#/s/US_REAL/NVDA') });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(document.appended.map(n => n.src), ['/d.js']);
  handlers.mouseover({ target: link('#/maerkte/QQQ') });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(document.appended.map(n => n.src), ['/d.js', '/m.js']);
  handlers.mouseover({ target: link('#/welten') });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(document.appended.length, 2, 'Startseiten-Ziele laden keine Gruppe');
});

test('Lazy.watch: Datensparmodus und 2G laden nichts im Voraus', () => {
  const handlers = {};
  const document = fakeDocument({ detail: ['/d.js'] });
  const context = { document, location: { hash: '' }, setTimeout, clearTimeout, module: { exports: {} }, navigator: { connection: { saveData: true } }, addEventListener(name, fn) { handlers[name] = fn; }, removeEventListener() {} };
  context.globalThis = context;
  vm.runInNewContext(read('discover/ui/lazy.js'), context);
  context.module.exports.watch();
  assert.deepEqual(Object.keys(handlers), []);
});

/* Startreihenfolge in index.html: das Skript im Kopf wird mit einem Mini-DOM ausgefuehrt. */
function runLoader(hash, { metaBody } = {}) {
  const source = html.match(/<script>(\(function\(w,d\)\{var home=[\s\S]*?)<\/script>/)[1];
  const calls = [], appended = [], listeners = {};
  const template = { content: { querySelectorAll: () => ['/a.js', '/b.js'].map(src => ({ getAttribute: () => src })) } };
  const meta = metaBody || { home: [{ universeId: 'US_REAL', chunks: ['/discover/data/home/US_REAL.json', '/discover/data/home/US_REAL.2.json'] }], realtime: { available: true, intraday: { index: '/quant/data/market/intraday/index.json' } } };
  const respond = url => ({ ok: true, url, clone: () => ({ json: async () => (url === '/discover/data/meta.json' ? meta : { pairs: [{ base: 'EUR', quote: 'USD', file: 'EURUSD.json' }] }) }) });
  const window = { fetch: (url, options) => { calls.push([url, options && options.cache]); return Promise.resolve(respond(url)); } };
  const document = {
    documentElement: {}, head: { appendChild: n => appended.push(n) },
    createElement: tag => ({ tag, setAttribute(k, v) { this[k] = v; } }),
    getElementById: id => (id === 'dx-start' ? template : null),
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const timers = [];
  vm.runInNewContext(source, { window, document, location: { hash }, setTimeout: (fn, ms) => timers.push([fn, ms]) });
  return { window, calls, appended, listeners, timers, original: window.fetch };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Startseite: meta.json und Kalender sofort, das Kopfbild wird vorgeladen, Skripte und Daten warten darauf', async () => {
  const { calls, appended, timers, window } = runLoader('');
  assert.deepEqual(calls, [['/discover/data/meta.json', 'no-cache'], ['/quant/config/market-calendar.json', 'no-cache']]);
  const preload = appended.find(n => n.tag === 'link');
  assert.equal(preload.rel, 'preload'); assert.equal(preload.as, 'image'); assert.equal(preload.fetchpriority, 'high');
  assert.equal(timers.length, 1); assert.equal(timers[0][1], 2500);
  window.__vuParsed();
  assert.equal(appended.filter(n => n.tag === 'script').length, 0, 'vor dem Kopfbild startet nichts');
  preload.onload(); await tick(); await tick();
  assert.deepEqual(appended.filter(n => n.tag === 'script').map(n => [n.src, n.async]), [['/a.js', false], ['/b.js', false]]);
  const urls = calls.map(c => c[0]);
  for (const url of ['/discover/data/home/US_REAL.json', '/quant/data/market/intraday/index.json', '/discover/live/im-blick-US_REAL.json', '/quant/data/market/multi-asset/snapshot.json',
    '/quant/config/multi-asset.json', '/quant/config/fx-license.json', '/quant/data/market/fx/ecb/index.json', '/quant/data/market/fx/ecb/EURUSD.json']) assert.ok(urls.includes(url), url);
  assert.equal(urls.filter(u => u === '/discover/data/home/US_REAL.json').length, 1);
  // Cache-Modi wie bei den spaeteren Aufrufen: loadJSON = no-cache, Verzeichnis und Wechselkurse = Standard
  const mode = Object.fromEntries(calls.map(c => [c[0], c[1]]));
  assert.equal(mode['/discover/data/home/US_REAL.json'], 'no-cache');
  assert.equal(mode['/quant/data/market/intraday/index.json'], undefined);
  assert.equal(mode['/quant/data/market/fx/ecb/EURUSD.json'], undefined);
});

test('Startseite: der spaetere fetch() derselben Adresse bekommt die vorgeholte Antwort - genau einmal', async () => {
  const { calls, window, appended } = runLoader('#/');
  const before = calls.length;
  const first = await window.fetch('/discover/data/meta.json', { cache: 'no-cache' });
  assert.equal(calls.length, before, 'kein zweiter Abruf');
  assert.equal(first.url, '/discover/data/meta.json');
  await window.fetch('/discover/data/meta.json', { cache: 'no-cache' });
  assert.equal(calls.length, before + 1, 'die zweite Anfrage geht normal ins Netz');
  await window.fetch('/other.json');
  assert.equal(calls.at(-1)[0], '/other.json');
  assert.ok(appended.length >= 1);
});

test('Spaeter Start (Kopfbild fehlt): nach 2,5 s starten Skripte und Daten trotzdem', async () => {
  const { appended, timers, window } = runLoader('');
  window.__vuParsed();
  assert.equal(appended.filter(n => n.tag === 'script').length, 0);
  timers[0][0](); await tick();
  assert.equal(appended.filter(n => n.tag === 'script').length, 2);
});

test('andere Routen: kein Kopfbild, keine vorgeholten Daten, fetch bleibt unveraendert, Skripte starten nach dem Lesen', async () => {
  for (const hash of ['#/s/US_REAL/NVDA', '#/maerkte', '#/s/EUROPE/ref_ALV_DE_XETR', '#/daten', '#/einzeln/US_REAL', '#/watchlist', '#/settings', '#/thema/ki']) {
    const { calls, appended, window, original } = runLoader(hash);
    assert.deepEqual(calls, [], hash);
    assert.equal(window.fetch, original, hash + ': fetch darf nicht ersetzt werden');
    assert.equal(appended.filter(n => n.tag === 'link').length, 0, hash);
    assert.equal(appended.length, 0);
    window.__vuParsed();
    assert.deepEqual(appended.map(n => n.src), ['/a.js', '/b.js'], hash);
  }
});

test('Meta ohne Intraday-Freigabe: kein Verzeichnis-Abruf; fehlerhafte Meta bricht den Start nicht', async () => {
  const noRealtime = runLoader('', { metaBody: { home: [{ universeId: 'US_REAL', chunks: ['/discover/data/home/US_REAL.json'] }], realtime: { available: false } } });
  noRealtime.window.__vuParsed(); noRealtime.appended.find(n => n.tag === 'link').onload(); await tick(); await tick();
  assert.ok(!noRealtime.calls.some(c => /intraday\/index/.test(c[0])));
  const broken = runLoader('', { metaBody: {} });
  broken.window.__vuParsed(); broken.appended.find(n => n.tag === 'link').onerror(); await tick(); await tick();
  assert.equal(broken.appended.filter(n => n.tag === 'script').length, 2);
});

test('Tipp auf die vorgerenderte Suche vor dem Skriptstart wird gemerkt, spaeter nicht mehr', () => {
  const { listeners, window } = runLoader('');
  const target = { closest: selector => (selector === '[data-static] .v2-search-prompt' ? {} : null) };
  listeners.click({ target: { closest: () => null } });
  assert.equal(window.__vuSearchTap, undefined);
  listeners.click({ target });
  assert.equal(window.__vuSearchTap, 1);
  assert.match(read('discover/home.js'), /__vuSearchTap[\s\S]{0,80}ctx\.openSearch\(\)/);
});

test('Taste "/" vor dem Skriptstart wird ebenfalls gemerkt - nicht aber im Eingabefeld oder ohne vorgerenderten Kopf', () => {
  const body = html.match(/d\.addEventListener\("keydown"[\s\S]*?,true\);/)[0];
  const run = (key, tag, hasStatic) => {
    const state = { tap: undefined, prevented: false };
    const handlers = {};
    const document = { addEventListener: (name, fn) => { handlers[name] = fn; }, querySelector: () => (hasStatic ? {} : null) };
    vm.runInNewContext(body.replace(/^d\./, 'document.'), { document, w: state, window: state, d: document });
    handlers.keydown({ key, target: { tagName: tag }, preventDefault() { state.prevented = true; } });
    return state;
  };
  assert.equal(run('/', 'BODY', true).__vuSearchTap, 1);
  assert.equal(run('/', 'BODY', true).prevented, true);
  assert.equal(run('/', 'INPUT', true).__vuSearchTap, undefined, 'im Eingabefeld bleibt "/" ein Zeichen');
  assert.equal(run('a', 'BODY', true).__vuSearchTap, undefined);
  assert.equal(run('/', 'BODY', false).__vuSearchTap, undefined, 'nach dem Start uebernimmt search.js die Taste');
});

test('Lazy.settled auf der Startseite: erst nach vu-home-drawn - auch wenn das Ereignis vor dem ersten Aufruf kam', async () => {
  const early = instance({}, {}, '');
  early.document.handlers['vu-home-drawn']();
  await Promise.race([early.api.settled(), new Promise((_, reject) => setTimeout(() => reject(new Error('settled haengt')), 3000))]);

  const late = instance({}, {}, '');
  let done = false;
  late.api.settled().then(() => { done = true; });
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(done, false, 'ohne gezeichnete Karten bleibt die Seite nicht "zur Ruhe gekommen"');
  late.document.handlers['vu-home-drawn']();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(done, true);
});

test('Lazy.watch: Vorladen im Leerlauf nur auf der Startseite', async () => {
  for (const [hash, expected] of [['', ['/d.js', '/m.js', '/n.js', '/f.js']], ['#/s/US_REAL/NVDA', []]]) {
    const handlers = {};
    const { api, document } = instance({ detail: ['/d.js'], markets: ['/m.js'], daten: ['/n.js'], feed: ['/f.js'] }, {}, hash, handlers);
    api.watch();
    handlers.keydown({ target: {} });
    if (!hash) document.handlers['vu-home-drawn']();
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.deepEqual(document.appended.map(n => n.src), expected, hash || 'Startseite');
  }
});

test('Lazy: Release-Stempel (?v= von detail.js) geht an die uebrigen Skripte; ohne Stempel bleiben Adressen unveraendert', async () => {
  const stamped = instance({ detail: ['/q/charts.js', '/discover/ui/detail.js?v=abc123def4567890'], markets: ['/m.js', '/x.js?v=keep'] });
  await stamped.api.load('detail'); await stamped.api.load('markets');
  assert.deepEqual(stamped.document.appended.map(n => n.src), ['/q/charts.js?v=abc123def4567890', '/discover/ui/detail.js?v=abc123def4567890', '/m.js?v=abc123def4567890', '/x.js?v=keep']);
  const plain = instance({ detail: ['/q/charts.js'] });
  await plain.api.load('detail');
  assert.deepEqual(plain.document.appended.map(n => n.src), ['/q/charts.js']);
});

test('Lazy: Ladefehler laedt die Seite genau einmal neu', async () => {
  const store = {}; let reloads = 0;
  const document = fakeDocument({ a: ['/x.js'] }, { fail: () => true });
  const context = { document, location: { hash: '', reload() { reloads++; } }, sessionStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    setTimeout, clearTimeout, module: { exports: {} }, navigator: {}, addEventListener() {}, removeEventListener() {} };
  context.globalThis = context;
  vm.runInNewContext(read('discover/ui/lazy.js'), context);
  await assert.rejects(context.module.exports.load('a'), /LAZY_SCRIPT_FAILED/);
  await assert.rejects(context.module.exports.load('a'), /LAZY_SCRIPT_FAILED/);
  assert.equal(reloads, 1);
});
