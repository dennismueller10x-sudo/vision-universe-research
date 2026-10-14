// Die Leere-Seiten-Erkennung der Direktlink-QA (scripts/discover/direct-link-lib.mjs):
// ein Seitengeruest allein darf nie als gerendert gelten. Reine Bewertung, kein Browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SPECS, STRICT_ERRORS, fullSpec, verdict, expectationProblems, discoverExpectation, pickWithheldProbes,
  assessRequests, assessRelease, pageStamps, isDataRequest, collectFacts, qualifyingCoreTitles} from '../../scripts/discover/direct-link-lib.mjs';

const stock = overrides => ({loadFailedHits: [], loadingHits: [], emptyChapters: [], ti: {present: true, rows: {Marktstruktur: 'Aufwärtsstruktur · HH/HL', 'Support / Resistance': '4 Zonen'}, chartLink: true}, hasMain: true, busy: 'false', gateVisible: false, textLength: 9000, h1: ['NVIDIA'], strictHits: [], includesMissing: [], textReHit: true,
  priceOk: true, coreCount: 2, coreBad: null, coreSkeletons: 0, charts: [{w: 374, h: 405, geometry: 2}], ...overrides});
const nvda = fullSpec(SPECS.nvda);

test('vollstaendige Aktienseite besteht', () => assert.deepEqual(verdict(stock(), nvda), []));

test('nur Seitengeruest (h1 vorhanden, sonst leer) besteht nicht', () => {
  const shell = stock({textLength: 12, h1: ['Discover'], priceOk: false, coreCount: 0, charts: []});
  const problems = verdict(shell, nvda);
  assert(problems.some(p => /passt nicht/.test(p)));
  assert(problems.some(p => /zu kurz/.test(p)));
  assert(problems.some(p => /Kursblock/.test(p)));
  assert(problems.some(p => /Chart/.test(p)));
});

test('leeres Dokument und sichtbare Zugangsmaske bestehen nicht', () => {
  assert.match(verdict({hasMain: false, gateVisible: false}, nvda)[0], /Seitengeruest/);
  assert.match(verdict({hasMain: false, gateVisible: true}, nvda)[0], /Zugangsmaske/);
});

test('Chart ohne Geometrie oder ohne Flaeche zaehlt nicht', () => {
  assert(verdict(stock({charts: [{w: 374, h: 405, geometry: 0}]}), nvda).some(p => /Chart/.test(p)));
  assert(verdict(stock({charts: [{w: 0, h: 0, geometry: 5}]}), nvda).some(p => /Chart/.test(p)));
  assert(verdict(stock({charts: []}), nvda).some(p => /Chart/.test(p)));
});

test('Ladeanzeige, Skeleton und Fehlermeldung im Kern bestehen nicht', () => {
  assert(verdict(stock({coreBad: 'lädt'}), nvda).some(p => /Platzhalter/.test(p)));
  assert(verdict(stock({coreSkeletons: 1}), nvda).some(p => /Skeleton/.test(p)));
  assert(verdict(stock({strictHits: ['Gerade nicht erreichbar'], h1: ['Gerade nicht erreichbar']}), nvda).some(p => /Fehlermeldung/.test(p)));
  assert(verdict(stock({busy: 'true'}), nvda).some(p => /aria-busy/.test(p)));
});

test('die harten Fehlermeldungen aus dem Auftrag sind hinterlegt', () => {
  for (const phrase of ['Gerade nicht erreichbar', 'Technik nicht verfügbar']) assert(STRICT_ERRORS.includes(phrase), phrase);
});

test('Feed (Einzelansicht): Zaehler und gefuellte erste Karte sind Pflicht', () => {
  const feed = fullSpec(SPECS.einzeln);
  const ok = {hasMain: true, busy: 'false', gateVisible: false, textLength: 3600, h1: [], strictHits: [], includesMissing: [], textReHit: true, priceOk: true, coreCount: 0,
    charts: [{w: 346, h: 185, geometry: 2}], feedCounter: '1 von 400', feedFirstText: 300, coreSkeletons: 0, coreBad: null};
  assert.deepEqual(verdict(ok, feed), []);
  assert(verdict({...ok, feedCounter: ''}, feed).some(p => /Zaehler/.test(p)));
  assert(verdict({...ok, feedFirstText: 10}, feed).some(p => /leer/.test(p)));
  assert(verdict({...ok, coreSkeletons: 2}, feed).some(p => /Skeleton/.test(p)));
});

test('jede Route hat einen eigenen Pfad und mindestens ein positives Merkmal', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    assert(spec.path.startsWith('/discover/'), name);
    assert(spec.h1 || spec.feed, name + ' braucht h1 oder Feed-Merkmal');
    assert(spec.minText > 0, name + ' braucht Mindesttext');
  }
});

// ---------------------------------------------------------------- Phase 4: fachliche Fehlerzustaende
// Stand vor Phase 4: nur der Kern (Kopf, Kurs, Chart) wurde auf "nicht verfügbar" gelesen, es gab keine Wertepruefung; das
// Kapitel "Chartbild — Kursstruktur" und alle Datenabrufe blieben ungeprueft.
const expectNvda = {symbol: 'NVDA', universe: 'US_REAL', series: {available: true, source: 'technical-instrument'},
  technical: {available: true, marketStructure: 'available', supportResistance: 'available'}, withheld: {sparkline: false, ineligible: false}};
const nvdaExpect = fullSpec({...SPECS.nvda, expect: expectNvda});

test('Kursstruktur: bei status=available MUSS die Zeile stehen und etwas anderes als "nicht verfügbar" zeigen', () => {
  assert.deepEqual(verdict(stock(), nvdaExpect), []);
  const wrong = verdict(stock({ti: {present: true, rows: {Marktstruktur: 'nicht verfügbar', 'Support / Resistance': '4 Zonen'}}}), nvdaExpect);
  assert.equal(wrong.length, 1);
  assert.match(wrong[0], /Zeile "Marktstruktur" zeigt "nicht verfügbar", die Daten tragen status=available/);
  assert(verdict(stock({ti: {present: true, rows: {Marktstruktur: 'Aufwärtsstruktur'}}}), nvdaExpect).some(p => /Zeile "Support \/ Resistance" fehlt/.test(p)));
  assert(verdict(stock({ti: {present: false}}), nvdaExpect).some(p => /Kapitel "Chartbild — Kursstruktur" fehlt/.test(p)));
});

test('GEGENNACHWEIS: zurueckgehaltene Technical-Intelligence-Schicht - "nicht verfügbar" oder keine Zeile ist die richtige Antwort', () => {
  const withheld = {...expectNvda, symbol: 'A', technical: {available: false, marketStructure: 'unavailable', supportResistance: 'unavailable'}};
  const spec = fullSpec({...SPECS.nvda, expect: withheld});
  assert.deepEqual(verdict(stock({ti: {present: true, rows: {Marktstruktur: 'nicht verfügbar', 'Support / Resistance': 'nicht verfügbar'}}}), spec), []);
  assert.deepEqual(verdict(stock({ti: {present: true, rows: {}}}), spec), []);
  assert.deepEqual(expectationProblems(stock(), null), []);
});

test('zeigen die Daten einen Kursverlauf, gehoert ein gezeichneter Chart zur Route - auch ohne Eintrag in der Tabelle', () => {
  const bare = fullSpec({path: '/discover/#/s/US_REAL/A', h1: '\\S', minText: 100, expect: {...expectNvda, technical: {available: false}}});
  assert.equal(bare.chart.scope, '.dx-chapter--chart');
  assert(verdict(stock({charts: []}), bare).some(p => /kein gezeichneter Chart/.test(p)));
  const withheldSeries = fullSpec({path: '/discover/#/s/US_REAL/A', h1: '\\S', minText: 100, expect: {...expectNvda, series: {available: false}, technical: {available: false}}});
  assert.equal(withheldSeries.chart, undefined, 'ohne Kursverlauf in den Daten wird kein Chart verlangt');
});

test('Inhalt: leere Kapitel, nicht aufgeloeste Ladezustaende, Ladefehler und unlesbarer Datensatz sind Fehler', () => {
  assert(verdict(stock({emptyChapters: ['Bewertung']}), nvdaExpect).some(p => /leeres Kapitel: Bewertung/.test(p)));
  assert(verdict(stock({loadingHits: ['div.dx-lazy-media']}), nvdaExpect).some(p => /Ladezustand nicht aufgeloest/.test(p)));
  assert(verdict(stock({loadFailedHits: ['Die Kursreihe konnte nicht geladen werden: x']}), nvdaExpect).some(p => /Ladefehler/.test(p)));
  assert(verdict(stock(), fullSpec({...SPECS.nvda, expect: {unreadable: true, reason: 'Datensatz unlesbar: x'}})).some(p => /unlesbar/.test(p)));
});

test('Platzhalter- und Fehlertexte werden erkannt, Erklaer- und Enthaltungstexte nicht', () => {
  const spec = fullSpec(SPECS.nvda);
  const loading = new RegExp(spec.loadingRe, 'i'), failed = new RegExp(spec.loadFailedRe, 'i');
  for (const t of ['Marktdaten werden geladen …', 'Aktien werden geladen …', 'Kurs lädt', 'Lange Kursreihe wird geladen']) assert(loading.test(t), t);
  for (const t of ['Der Verlauf konnte gerade nicht geladen werden.', 'Die Kursreihe konnte nicht geladen werden: x']) assert(failed.test(t), t);
  for (const t of ['Keine Angabe', 'nicht verfügbar', 'Für diesen Titel liegen keine Geschäftszahlen vor.']) assert(!loading.test(t) && !failed.test(t), t);
  assert(spec.loadingIgnore.includes('.dx-poster'), 'die Poster-Skeletons der Nachlade-Reihen sind Absicht');
});

async function release(stocks) {
  const dir = await mkdtemp(join(tmpdir(), 'discover-direct-test-'));
  const base = join(dir, 'discover/data/stocks/US_REAL');
  await mkdir(base, {recursive: true});
  for (const [symbol, doc] of Object.entries(stocks)) await writeFile(join(base, symbol + '.json'), typeof doc === 'string' ? doc : JSON.stringify(doc));
  return dir;
}
const dataset = ({series = true, ti = true, sparkline = 'OK', eligible = true} = {}) => ({series: {available: series, source: 'discover-series'}, sparklineStatus: sparkline, discoveryEligible: eligible,
  technicalIntelligence: {available: ti, layers: {marketStructure: {status: ti ? 'available' : 'unavailable'}, supportResistance: {status: ti ? 'available' : 'unavailable'}}}});

test('discoverExpectation liest den Datensatz des Titels aus dem Release - nicht aus dem Seitentext', async () => {
  const dir = await release({NVDA: dataset(), A: dataset({ti: false, sparkline: 'WITHHELD_REDISTRIBUTION'}), ADEX: dataset({ti: false, eligible: false}), BAD: 'kein json'});
  try {
    const nvda = discoverExpectation(dir, '/discover/#/s/US_REAL/NVDA');
    assert.deepEqual(nvda.technical, {available: true, marketStructure: 'available', supportResistance: 'available'});
    assert.equal(nvda.series.available, true);
    assert.equal(discoverExpectation(dir, '/discover/#/s/US_REAL/A').withheld.sparkline, true);
    assert.equal(discoverExpectation(dir, '/discover/#/s/US_REAL/ADEX').withheld.ineligible, true);
    assert.equal(discoverExpectation(dir, '/discover/#/s/US_REAL/BAD').unreadable, true);
    assert.equal(discoverExpectation(dir, '/discover/#/s/US_REAL/GIBTESNICHT'), null);
    assert.equal(discoverExpectation(dir, '/discover/#/maerkte'), null, 'Listen haben keinen Titeldatensatz');
    assert.equal(discoverExpectation(dir, '/discover/#/s/XX/UNKNOWN'), null);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('pickWithheldProbes: der erste Titel mit zurueckgehaltener Schicht und der naechste mit zurueckgehaltener Sparkline/Aufnahme', async () => {
  const dir = await release({A0: dataset(), A1: dataset({ti: false, sparkline: 'WITHHELD_REDISTRIBUTION'}), A2: dataset({ti: false, eligible: false}), A3: dataset({series: false, ti: false})});
  try {
    assert.deepEqual(pickWithheldProbes(dir), {technicalWithheld: 'A1', redistributionWithheld: 'A2'});
    assert.deepEqual(pickWithheldProbes(join(dir, 'gibt-es-nicht')), {technicalWithheld: null, redistributionWithheld: null});
  } finally { await rm(dir, {recursive: true, force: true}); }
});

const rec = (path, status, extra = {}) => ({type: 'fetch', path, status, ...extra});
test('Netz: 404 auf eine Datei, die im Release liegt (Serie, Aktiendatei), ist ein Fehler; 404 auf eine fehlende Datei ist gewollter Rueckfall', () => {
  const has = path => path === '/quant/data/market/discover-series-long/ref_NVDA.json';
  assert.match(assessRequests([rec('/quant/data/market/discover-series-long/ref_NVDA.json', 404)], {has})[0], /404.*im Release liegt/);
  assert.deepEqual(assessRequests([rec('/quant/data/market/golden-preview/daily/ref_ADEX.json', 404)], {has}), []);
  assert.deepEqual(assessRequests([rec('/discover/data/stocks/XX/UNKNOWN.json', 404)], {has: () => true, allow404: true}), [], 'die Nicht-gefunden-Seite fragt ins Leere');
  assert(SPECS.unknownStock.allow404Data);
});

test('Netz: 5xx, 404 auf JS/CSS, Parsefehler und abgebrochene Verbindungen sind Fehler; Vorladungen und Logos nicht', () => {
  assert(assessRequests([rec('/discover/data/stocks/US_REAL/NVDA.json', 503)])[0].startsWith('Serverfehler 503'));
  assert.match(assessRequests([{type: 'script', path: '/discover/ui/detail.js', status: 404}], {has: () => false})[0], /veraltete Asset-Referenz.*detail\.js/);
  assert.match(assessRequests([rec('/discover/data/stocks/US_REAL/NVDA.json', 200, {parseError: 'Unexpected end of JSON input'})])[0], /nicht lesbar/);
  assert.match(assessRequests([{type: 'other', path: '/discover/data/stocks/US_REAL/X.json', status: 200, parseError: 'leere Datei'}])[0], /nicht lesbar/);
  assert.match(assessRequests([{type: 'fetch', path: '/quant/data/x.json', failed: 'net::ERR_CONNECTION_RESET'}])[0], /fehlgeschlagen/);
  assert.deepEqual(assessRequests([{type: 'fetch', path: '/quant/data/x.json', failed: 'net::ERR_ABORTED'}]), []);
  assert.deepEqual(assessRequests([{type: 'image', path: '/discover/logos/files/X.png', status: 404}], {has: () => true}), []);
  assert(isDataRequest(rec('/discover/data/a.json', 200)) && !isDataRequest({type: 'stylesheet', path: '/discover/app.css'}));
});

test('Kennung: meta vu-release gegen release-id.json; statisch verlinkte Dateien tragen den Hash ihrer Bytes, nachgeladene die Produktkennung', () => {
  const json = {schema: 'vu-release-id-1', products: {discover: 'aaaaaaaaaaaaaaaa'}}, meta = {product: 'discover', content: 'aaaaaaaaaaaaaaaa'};
  const stamp = {path: '/discover/detail.css', v: '1111111111111111', actual: '1111111111111111', fixed: true};
  assert.deepEqual(assessRelease({meta, json, product: 'discover', stamps: [stamp]}), []);
  assert.match(assessRelease({meta, json: null, product: 'discover'})[0], /release-id\.json fehlt/);
  assert.match(assessRelease({meta: null, json, product: 'discover'})[0], /meta vu-release fehlt/);
  assert.match(assessRelease({meta: {product: 'discover', content: 'bbbbbbbbbbbbbbbb'}, json, product: 'discover'})[0], /passt nicht zu release-id\.json/);
  assert.match(assessRelease({meta, json, product: 'discover', stamps: [{...stamp, v: '2222222222222222'}]})[0], /veralteter Stempel/);
  const lazy = {path: '/discover/ui/charts.js', actual: 'cccccccccccccccc', fixed: false};
  assert.deepEqual(assessRelease({meta, json, product: 'discover', stamps: [{...lazy, v: 'aaaaaaaaaaaaaaaa'}]}), []);
  assert.deepEqual(assessRelease({meta, json, product: 'discover', stamps: [{...lazy, v: 'dddddddddddddddd'}], known: ['dddddddddddddddd']}), [], 'Discover stempelt Nachladeskripte mit dem Stempel von detail.js');
  assert.equal(assessRelease({meta, json, product: 'discover', stamps: [{...lazy, v: 'eeeeeeeeeeeeeeee'}]}).length, 1);
  assert.deepEqual([...pageStamps('<link href="/discover/detail.css?v=53ce49c8ef03d342"><script src="/discover/ui/detail.js?v=ab12"></script><script src="/x.js"></script>')],
    [['/discover/detail.css', '53ce49c8ef03d342'], ['/discover/ui/detail.js', 'ab12']]);
});

test('collectFacts ist ein einzelner, eigenstaendiger Funktionskoerper (Playwright serialisiert ihn in den Browser)', () => {
  assert(!/\bimport\b|\brequire\(/.test(collectFacts.toString()) && !collectFacts.toString().includes('readFileSync'));
});

test('Kerntitel werden datengetrieben gewaehlt: ein zurueckgehaltener Kandidat ist Enthaltung, erst zu wenige qualifizierte sind ein Datenproblem', async () => {
  const dir = await release({NVDA: dataset({ti: false}), AAPL: dataset(), MSFT: dataset({series: false}), JPM: dataset(), XOM: dataset()});
  const fewer = await release({NVDA: dataset({ti: false}), AAPL: dataset(), MSFT: dataset({series: false})});
  try {
    assert.deepEqual(qualifyingCoreTitles(dir), ['AAPL', 'JPM', 'XOM']);
    assert(qualifyingCoreTitles(fewer).length < 2, 'weniger als 2 Kandidaten: lauter Fehler im Runner');
    assert.deepEqual(qualifyingCoreTitles(join(dir, 'gibt-es-nicht')), []);
  } finally { await rm(dir, {recursive: true, force: true}); await rm(fewer, {recursive: true, force: true}); }
});
