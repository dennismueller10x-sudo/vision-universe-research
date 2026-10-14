// Die Bewertung der Quant-Direktlink-QA (scripts/vu2/direct-link-lib.mjs): leere Seiten, fachliche Fehlerzustaende und
// zulaessige Enthaltung. Reine Funktionen und Dateien in einem Temp-Ordner, kein Browser.
//
// Ausgangspunkt (Phase 4): #652 (Kursdynamik "Nicht verfügbar" trotz STRONG_POSITIVE) und #616 (fehlender Technik-Scherben)
// blieben gruen, weil die Pruefung nur den Kernbereich auf "nicht verfügbar" las und keine Wertepruefung kannte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {SPECS, STRICT_ERRORS, TECHNICAL_LABELS, NO_LABEL, fullSpec, verdict, technicalProblems, technicalExpectation, pickWithheldProbes,
  assessRequests, assessRelease, pageStamps, isDataRequest, collectFacts} from '../../scripts/vu2/direct-link-lib.mjs';

const root = new URL('../../', import.meta.url);
const TODAY = '2026-10-14';

// ---------------------------------------------------------------- Bausteine
const technik = (overrides = {}) => ({present: true, shown: {Trend: 'Aufwärtstrend', Kursdynamik: 'Stark positiv', Schwankung: 'Normal'}, reducedSentence: false, chartLink: true, ...overrides});
const stock = overrides => ({hasMain: true, busy: 'false', gateVisible: false, textLength: 9000, h1: ['Apple Inc.'], strictHits: [], includesMissing: [], textReHit: true,
  priceOk: true, coreCount: 2, coreBad: null, coreSkeletons: 0, charts: [{w: 374, h: 405, geometry: 2}],
  loadFailedHits: [], loadingHits: [], emptySections: [], emptyStats: [], brokenImages: [], technik: technik(), ...overrides});
const expectation = (code, overrides = {}) => ({ticker: 'AAPL', available: true, dataCutoff: '2026-10-13', methodology: 'm-1',
  codes: {Trend: 'BULLISH', Kursdynamik: code, Schwankung: 'NORMAL'},
  labels: {Trend: 'Aufwärtstrend', Kursdynamik: TECHNICAL_LABELS.Kursdynamik[code] || NO_LABEL, Schwankung: 'Normal'}, ...overrides});
const aapl = {...fullSpec(SPECS.aapl), technical: expectation('STRONG_POSITIVE')};

// ---------------------------------------------------------------- bisherige Leere-Seiten-Erkennung
test('vollstaendige Aktienseite besteht', () => assert.deepEqual(verdict(stock(), aapl), []));

test('nur Seitengeruest (h1 vorhanden, sonst leer) besteht nicht', () => {
  const problems = verdict(stock({textLength: 12, h1: ['Quant'], priceOk: false, coreCount: 0, charts: []}), aapl);
  for (const re of [/passt nicht/, /zu kurz/, /Kursblock/, /Chart/]) assert(problems.some(p => re.test(p)), String(re));
});

test('leeres Dokument und sichtbare Zugangsmaske bestehen nicht', () => {
  assert.match(verdict({hasMain: false, gateVisible: false}, aapl)[0], /Seitengeruest/);
  assert.match(verdict({hasMain: false, gateVisible: true}, aapl)[0], /Zugangsmaske/);
});

test('Ladeanzeige, Skeleton und Fehlermeldung im Kern bestehen nicht', () => {
  assert(verdict(stock({coreBad: 'lädt'}), aapl).some(p => /Platzhalter/.test(p)));
  assert(verdict(stock({coreSkeletons: 1}), aapl).some(p => /Skeleton/.test(p)));
  assert(verdict(stock({strictHits: ['Gerade nicht erreichbar']}), aapl).some(p => /Fehlermeldung/.test(p)));
  assert(verdict(stock({busy: 'true'}), aapl).some(p => /aria-busy/.test(p)));
  for (const phrase of ['Gerade nicht erreichbar', 'Technik nicht verfügbar']) assert(STRICT_ERRORS.includes(phrase), phrase);
});

test('jede Route hat einen Pfad unter /quant/ und mindestens ein positives Merkmal', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    assert(spec.path.startsWith('/quant/'), name);
    assert(spec.h1, name + ' braucht h1');
    assert(spec.minText > 0, name + ' braucht Mindesttext');
  }
  assert(SPECS.chartbild.chart && SPECS.chartbild.chart.scope === '.cb-chart-card', 'das Chartbild braucht einen gezeichneten Chart');
});

// ---------------------------------------------------------------- Phase 4: Technik gegen die Datenerwartung
test('#652: Kursdynamik "Nicht verfügbar" bei STRONG_POSITIVE ist ein Fehler, mit Zustand und erwarteter Beschriftung im Befund', () => {
  const problems = verdict(stock({technik: technik({shown: {Trend: 'Aufwärtstrend', Kursdynamik: 'Nicht verfügbar', Schwankung: 'Normal'}})}), aapl);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Kursdynamik zeigt "Nicht verfügbar".*STRONG_POSITIVE.*Stark positiv/);
});

test('jede bestimmte Momentum-Klasse verlangt ihre Beschriftung - auch nach der Beruhigung nicht "Nicht verfügbar"', () => {
  for (const [code, label] of Object.entries(TECHNICAL_LABELS.Kursdynamik)) {
    const spec = {...aapl, technical: expectation(code)};
    assert.deepEqual(verdict(stock({technik: technik({shown: {Trend: 'Aufwärtstrend', Kursdynamik: label, Schwankung: 'Normal'}})}), spec), [], code);
    const wrong = verdict(stock({technik: technik({shown: {Trend: 'Aufwärtstrend', Kursdynamik: NO_LABEL, Schwankung: 'Normal'}})}), spec);
    assert(wrong.some(p => new RegExp('Kursdynamik zeigt.*' + code).test(p)), code);
  }
});

test('GEGENNACHWEIS: UNDETERMINED erwartet "Nicht verfügbar" - die Enthaltung ist kein Fehler, ein erfundener Wert schon', () => {
  const spec = {...aapl, technical: expectation('UNDETERMINED')};
  assert.equal(spec.technical.labels.Kursdynamik, NO_LABEL);
  assert.deepEqual(verdict(stock({technik: technik({shown: {Trend: 'Aufwärtstrend', Kursdynamik: NO_LABEL, Schwankung: 'Normal'}})}), spec), []);
  assert(verdict(stock({technik: technik({shown: {Trend: 'Aufwärtstrend', Kursdynamik: 'Positiv', Schwankung: 'Normal'}})}), spec).some(p => /Kursdynamik zeigt "Positiv"/.test(p)));
});

test('GEGENNACHWEIS: ohne veroeffentlichtes Bundle (zurueckgehalten) wird nichts verlangt - weder Abschnitt noch Beschriftung', () => {
  const withheld = {ticker: 'AAAC', available: false, reason: 'kein veroeffentlichtes Bundle', withheld: {reason: 'INSUFFICIENT_HISTORY'}};
  const spec = {...aapl, technical: withheld};
  assert.deepEqual(verdict(stock({technik: {present: false}}), spec), []);
  assert.deepEqual(verdict(stock({technik: technik({reducedSentence: true, chartLink: false, shown: {Trend: NO_LABEL, Kursdynamik: NO_LABEL, Schwankung: NO_LABEL}})}), spec), []);
  assert.deepEqual(technicalProblems(undefined, null), []);
});

test('tragen die Daten eine Auswertung, MUSS der Abschnitt "08 / Technik" stehen (#616: Scherben fehlte, Seite blieb ruhig)', () => {
  const problems = verdict(stock({technik: {present: false}}), aapl);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Abschnitt "08 \/ Technik" fehlt.*AAPL/);
});

test('"vollständige technische Auswertung … noch nicht veröffentlicht" bei vorhandenem Bundle ist ein Fehler', () => {
  assert(verdict(stock({technik: technik({reducedSentence: true})}), aapl).some(p => /noch nicht veröffentlicht/.test(p)));
  assert(verdict(stock({technik: technik({chartLink: false})}), aapl).some(p => /Chartbild öffnen/.test(p)));
});

test('eine fehlende Kennzahl im Abschnitt und ein unlesbarer Datensatz sind Fehler, nicht Enthaltung', () => {
  assert(technicalProblems(technik({shown: {Trend: 'Aufwärtstrend', Schwankung: 'Normal'}}), expectation('POSITIVE')).some(p => /Kursdynamik fehlt/.test(p)));
  assert(technicalProblems(technik(), {unreadable: true, reason: 'Datensatz unlesbar: x'}).some(p => /unlesbar/.test(p)));
});

// ---------------------------------------------------------------- Phase 4: Inhalt
test('leere Abschnitte, nicht aufgeloeste Ladezustaende (auch ausserhalb des Kerns), Ladefehler, leere Kennzahlen, kaputte Bilder', () => {
  assert(verdict(stock({emptySections: ['Pro und Contra']}), aapl).some(p => /leerer Abschnitt: Pro und Contra/.test(p)));
  assert(verdict(stock({loadingHits: ['Radar-Status wird geladen …']}), aapl).some(p => /Ladezustand nicht aufgeloest/.test(p)));
  assert(verdict(stock({loadFailedHits: ['Der Verlauf konnte nicht geladen werden.']}), aapl).some(p => /Ladefehler/.test(p)));
  assert(verdict(stock({emptyStats: ['Kursdynamik']}), aapl).some(p => /leere Kennzahl/.test(p)));
  assert(verdict(stock({brokenImages: ['/x.png']}), aapl).some(p => /Bild nicht geladen/.test(p)));
});

test('die Platzhalter- und Fehlertexte der Oberflaeche werden erkannt, Erklaertexte nicht', () => {
  const spec = fullSpec(SPECS.nvda);
  const loading = new RegExp(spec.loadingRe, 'i'), failed = new RegExp(spec.loadFailedRe, 'i');
  for (const t of ['Radar wird geladen …', 'Die Szenario-Marken werden geladen …', 'Kurs lädt', 'Lade Daten …', 'Chartbild wird geladen …']) assert(loading.test(t), t);
  for (const t of ['Der Verlauf konnte nicht geladen werden.', 'Die Daten konnten gerade nicht geladen werden.', 'Daten konnten nicht geladen werden']) assert(failed.test(t), t);
  assert(!loading.test('Noch nicht verfügbar') && !failed.test('Noch nicht verfügbar'), 'zulaessige Enthaltung bleibt unbeanstandet');
  assert(!failed.test('Für diesen Titel liegt keine geprüfte Kurshistorie vor.'));
});

// ---------------------------------------------------------------- Erwartung aus den Daten (Dateien)
async function release(docs) {
  const dir = await mkdtemp(join(tmpdir(), 'quant-direct-test-'));
  const base = join(dir, 'quant/data/product/technical-signals-v1/by-ticker');
  await mkdir(base, {recursive: true});
  for (const [ticker, doc] of Object.entries(docs)) await writeFile(join(base, ticker + '.json.gz'), typeof doc === 'string' ? doc : gzipSync(Buffer.from(JSON.stringify(doc))));
  return dir;
}
const instrument = (ticker, {momentum = 'POSITIVE', cutoff = '2026-10-13', mock = false, bundle = true} = {}) => ({
  instruments: {[ticker]: {instrumentId: ticker, isMock: mock, dataMode: 'real', source: 'tiingo',
    bundle: bundle ? {instrumentId: ticker, dataCutoff: cutoff, methodologyVersion: 'm-1', trend: {direction: 'BULLISH'}, momentum: {state: momentum}, volatility: {regime: 'LOW'}} : null}}, unavailable: {}});

test('technicalExpectation: Beschriftungen aus dem Datensatz, UNDETERMINED und unbekannte Codes als "Nicht verfügbar"', async () => {
  const dir = await release({NVDA: instrument('NVDA', {momentum: 'POSITIVE'}), ADEX: instrument('ADEX', {momentum: 'UNDETERMINED'}), ODD: instrument('ODD', {momentum: 'SOMETHING_NEW'})});
  try {
    const nvda = technicalExpectation(dir, 'NVDA', {today: TODAY});
    assert.deepEqual(nvda.labels, {Trend: 'Aufwärtstrend', Kursdynamik: 'Positiv', Schwankung: 'Niedrig'});
    assert.equal(technicalExpectation(dir, 'ADEX', {today: TODAY}).labels.Kursdynamik, NO_LABEL);
    assert.equal(technicalExpectation(dir, 'ODD', {today: TODAY}).labels.Kursdynamik, NO_LABEL);
    assert.equal(technicalExpectation(dir, 'GIBTESNICHT', {today: TODAY}), null);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('technicalExpectation: ohne Bundle, mit Test-Herkunft, mit Datum in der Zukunft oder unlesbar ist die Auswertung NICHT erwartet', async () => {
  const dir = await release({AAAC: instrument('AAAC', {bundle: false}), MOCK: instrument('MOCK', {mock: true}), FUT: instrument('FUT', {cutoff: '2026-12-01'}), BAD: 'kein gzip'});
  try {
    for (const t of ['AAAC', 'MOCK', 'FUT']) assert.equal(technicalExpectation(dir, t, {today: TODAY}).available, false, t);
    const bad = technicalExpectation(dir, 'BAD', {today: TODAY});
    assert.equal(bad.available, false);
    assert.equal(bad.unreadable, true);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('pickWithheldProbes: der erste unbestimmte und der erste Titel ohne Bundle, in Dateireihenfolge', async () => {
  const dir = await release({A1: instrument('A1'), A2: instrument('A2', {momentum: 'UNDETERMINED'}), A3: instrument('A3', {bundle: false}), A4: instrument('A4', {momentum: 'UNDETERMINED'})});
  try {
    assert.deepEqual(pickWithheldProbes(dir), {undetermined: 'A2', noBundle: 'A3'});
    assert.deepEqual(pickWithheldProbes(join(dir, 'gibt-es-nicht')), {undetermined: null, noBundle: null});
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('Vertrag: die Beschriftungstabellen der Pruefung sind die des Dienstes (quant/api/product-services.js#getTechnicalIntelligence)', async () => {
  const source = await readFile(new URL('quant/api/product-services.js', root), 'utf8');
  const table = (field) => {
    const m = source.match(new RegExp('status\\(b\\.' + field + '\\?\\.(?:direction|state|regime),\\{([^}]*)\\}'));
    assert(m, field + ': Tabelle im Dienst nicht gefunden');
    return Object.fromEntries([...m[1].matchAll(/([A-Z_]+):'([^']*)'/g)].map(x => [x[1], x[2]]));
  };
  assert.deepEqual(TECHNICAL_LABELS.Trend, table('trend'));
  assert.deepEqual(TECHNICAL_LABELS.Kursdynamik, table('momentum'));
  assert.deepEqual(TECHNICAL_LABELS.Schwankung, table('volatility'));
  assert(source.includes("label:'Nicht verfügbar'"), 'der Dienst nennt unbekannte Codes "Nicht verfügbar"');
  assert.equal(NO_LABEL, 'Nicht verfügbar');
});

// ---------------------------------------------------------------- Netz
const rec = (path, status, extra = {}) => ({type: 'fetch', path, status, ...extra});
test('Netz: 404 auf eine Datei, die im Release liegt (Scherben, Ausschnitt), ist ein Fehler; 404 auf eine fehlende Datei ist gewollter Rueckfall', () => {
  const has = path => path === '/quant/data/product/technical-signals-v1/by-ticker/NVDA.json.gz';
  assert.match(assessRequests([rec('/quant/data/product/technical-signals-v1/by-ticker/NVDA.json.gz', 404)], {has})[0], /404.*im Release liegt.*by-ticker\/NVDA/);
  assert.deepEqual(assessRequests([rec('/quant/data/market/golden-preview/daily/ref_ADEX.json', 404)], {has}), []);
  assert.deepEqual(assessRequests([rec('/quant/data/product/x.json', 404)], {has: () => true, allow404: true}), [], 'Nicht-gefunden-Seiten duerfen ins Leere fragen');
});

test('Netz: 5xx irgendwo, 404 auf JS/CSS, Parsefehler und abgebrochene Verbindungen sind Fehler', () => {
  assert(assessRequests([rec('/quant/data/product/x.json.gz', 503)])[0].startsWith('Serverfehler 503'));
  assert(assessRequests([{type: 'image', path: '/assets/a.png', status: 500}])[0].startsWith('Serverfehler 500'));
  assert.match(assessRequests([{type: 'script', path: '/quant/app/page-stock.js', status: 404}], {has: () => false})[0], /veraltete Asset-Referenz.*page-stock/);
  assert.match(assessRequests([{type: 'stylesheet', path: '/quant/ui/quant.css', status: 404}], {has: () => false})[0], /veraltete Asset-Referenz/);
  assert.match(assessRequests([rec('/quant/data/x.json.gz', 200, {parseError: 'incorrect header check'})])[0], /nicht lesbar/);
  assert.match(assessRequests([{type: 'fetch', path: '/quant/data/x.json', failed: 'net::ERR_CONNECTION_RESET'}])[0], /fehlgeschlagen/);
  assert.deepEqual(assessRequests([{type: 'fetch', path: '/quant/data/x.json', failed: 'net::ERR_ABORTED'}]), [], 'abgebrochene Vorladungen sind kein Fehler');
  assert.deepEqual(assessRequests([{type: 'image', path: '/discover/logos/files/X.png', status: 404}], {has: () => true}), [], 'fehlende Logos sind Rueckfall, kein Datenfehler');
  assert(isDataRequest(rec('/quant/data/a.json.gz', 200)) && !isDataRequest({type: 'script', path: '/quant/app/a.js'}));
});

// ---------------------------------------------------------------- Kennung
test('Kennung: meta vu-release gegen release-id.json und Stempel gegen die ausgelieferten Bytes', () => {
  const json = {schema: 'vu-release-id-1', products: {quant: 'aaaaaaaaaaaaaaaa'}};
  const meta = {product: 'quant', content: 'aaaaaaaaaaaaaaaa'};
  const ok = {path: '/quant/ui/quant.css', v: '1111111111111111', actual: '1111111111111111', fixed: true};
  assert.deepEqual(assessRelease({meta, json, product: 'quant', stamps: [ok]}), []);
  assert.match(assessRelease({meta, json: null, product: 'quant'})[0], /release-id\.json fehlt/);
  assert.match(assessRelease({meta: null, json, product: 'quant'})[0], /meta vu-release fehlt/);
  assert.match(assessRelease({meta: {product: 'quant', content: 'bbbbbbbbbbbbbbbb'}, json, product: 'quant'})[0], /passt nicht zu release-id\.json/);
  assert.match(assessRelease({meta: {product: 'discover', content: 'aaaaaaaaaaaaaaaa'}, json, product: 'quant'})[0], /gehoert zu "discover"/);
  assert.match(assessRelease({meta, json, product: 'quant', stamps: [{...ok, v: '2222222222222222'}]})[0], /veralteter Stempel \?v=2222222222222222/);
});

test('Kennung: nachgeladene Dateien tragen die Produktkennung oder einen Stempel der Seite, statisch verlinkte den Hash ihrer Bytes', () => {
  const json = {products: {quant: 'aaaaaaaaaaaaaaaa'}}, meta = {product: 'quant', content: 'aaaaaaaaaaaaaaaa'};
  const lazy = {path: '/quant/app/page-evidence.js', actual: 'cccccccccccccccc', fixed: false};
  assert.deepEqual(assessRelease({meta, json, product: 'quant', stamps: [{...lazy, v: 'aaaaaaaaaaaaaaaa'}]}), []);
  assert.deepEqual(assessRelease({meta, json, product: 'quant', stamps: [{...lazy, v: 'dddddddddddddddd'}], known: ['dddddddddddddddd']}), []);
  assert.equal(assessRelease({meta, json, product: 'quant', stamps: [{...lazy, v: 'eeeeeeeeeeeeeeee'}]}).length, 1);
  // Statisch verlinkt: die Produktkennung genuegt NICHT (die Seite stempelt den Hash der Datei).
  assert.equal(assessRelease({meta, json, product: 'quant', stamps: [{...lazy, fixed: true, v: 'aaaaaaaaaaaaaaaa'}]}).length, 1);
});

test('pageStamps liest die Stempel der Verweise im ausgelieferten HTML', () => {
  const html = '<link rel="stylesheet" href="/quant/ui/quant.css?v=de13e8d04825f314"><script src="/quant/release-bundle.js?v=070dfd4ad0e69656"></script><script src="/x/ohne.js"></script>';
  assert.deepEqual([...pageStamps(html)], [['/quant/ui/quant.css', 'de13e8d04825f314'], ['/quant/release-bundle.js', '070dfd4ad0e69656']]);
});

test('collectFacts ist ein einzelner, eigenstaendiger Funktionskoerper (Playwright serialisiert ihn in den Browser)', () => {
  const source = collectFacts.toString();
  assert(!/\bimport\b|\brequire\(/.test(source) && !source.includes('readFileSync'), 'collectFacts darf keine Node-Abhaengigkeit tragen');
});
