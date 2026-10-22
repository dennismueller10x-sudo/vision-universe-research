// Direktlink-Pruefung fuer Quant (/quant/#/...): positive Inhaltsmerkmale statt "kein Fehler".
//
// PR #619 lieferte einen WebKit-Race, bei dem ein Direktlink eine LEERE Seite
// zeigte, ohne Seitenfehler und ohne Fehlermeldung. Eine Pruefung, die nur auf
// "kein Fehlertext" wartet, besteht dann. Deshalb gilt eine Route erst als
// gerendert, wenn ihre Merkmale SICHTBAR da sind: Ueberschrift mit erwartetem
// Namen, Kursblock, gezeichneter Chart (Pfade und Flaeche > 0), genug Text und
// keine Ladeanzeige im Kern. Reine Funktionen und Erwartungstabelle; kein
// Browser-Start hier (browser-qa.mjs und browser-qa-direct.mjs nutzen sie).
//
// PHASE 4 (Stabilitaetsmission): die Pruefung erkennt jetzt auch FACHLICHE Fehlerzustaende, die vorher gruen blieben
// (#652: Kursdynamik "Nicht verfuegbar" trotz momentum.state = STRONG_POSITIVE; #616: fehlender Technik-Scherben).
//   1. Erwartung aus den DATEN: technicalExpectation() liest den Datensatz des Titels aus dem Release (by-ticker-Ausschnitt)
//      und leitet daraus ab, was die Seite zeigen MUSS. Zurueckgehaltene Titel (kein Bundle, UNDETERMINED) erwarten
//      "Nicht verfuegbar" und sind KEIN Fehler; ein bestimmter Zustand mit "Nicht verfuegbar" ist einer.
//   2. Inhalt: leere Abschnitte, nicht aufgeloeste Ladezustaende im ganzen Hauptbereich (nicht nur im Kern),
//      "konnte nicht geladen werden"-Meldungen, fehlende Charts.
//   3. Netz: assessRequests() bewertet jede Antwort (404/5xx auf JS/CSS/Daten, unlesbare Daten); 404 auf eine Datei,
//      die im Release NICHT liegt, ist die gewollte Rueckfalllogik (z. B. golden-preview/daily/ref_X.json) und kein Fehler.
//   4. Stempel: assessRelease() vergleicht meta vu-release mit /release-id.json und jeden ?v= mit den ausgelieferten Bytes.

import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Harte Fehlermeldungen: diese Saetze duerfen NIRGENDS im Hauptbereich stehen.
export const STRICT_ERRORS = ['Gerade nicht erreichbar', 'Technik nicht verfügbar', 'konnte nicht aufgebaut werden', 'Die Seite konnte nicht geladen werden'];
// Technische Ladefehler der Oberflaeche (nicht zu verwechseln mit fachlicher Enthaltung): gelten im ganzen Hauptbereich.
export const LOAD_FAILED_RE = '(?:konnte|konnten)\\s+(?:gerade\\s+)?nicht\\s+geladen\\s+werden|Daten konnten nicht';
// Ladezustaende, die nach der Beruhigung nicht mehr da sein duerfen ("Radar wird geladen …", "Kurs lädt"). Gilt nur fuer KURZE Zeilen
// (Platzhalter), damit Erklaertexte nicht anschlagen.
export const LOADING_RE = '(?:wird|werden)\\s+geladen|\\blädt\\b|Lade\\s+Daten';
export const LOADING_LINE_MAX = 80;
export const LOADING_SELECTOR = '[aria-busy="true"],[class*="skeleton"],[class*="spinner"],[class*="qx-loading"],[data-loading],[role="progressbar"]';
// Im Kern (Kopf, Kurs, Chart) darf weder eine Ladeanzeige noch ein "nicht verfuegbar" stehen.
// In weiter unten liegenden Abschnitten sind "noch nicht verfuegbar" (z. B. Quant-Analyse
// fuer europaeische Titel) ehrliche Auskunft und bewusst erlaubt.
export const CORE_BAD = 'nicht verfügbar|wird geladen|lädt|nicht erreichbar|keine daten';

const PRICE_USD = '\\d[\\d.]*,\\d{2}\\s*\\$';
const STOCK_CORE = '.qx-stock-hero, .q-stock-price, .qc-chart';
const STOCK_CHART = {scope: '.qc-chart', minW: 150, minH: 100, minGeom: 2};
const GLOBE = {scope: '.q-hero', minW: 100, minH: 100, minGeom: 5};
export const SPECS = {
  nvda: {path: '/quant/#/aktie/NVDA', critical: true, h1: '^NVIDIA', price: {selector: '.q-stock-price', re: PRICE_USD}, chart: STOCK_CHART, core: STOCK_CORE, minText: 4000, includes: ['NVDA'], technik: 'NVDA'},
  aapl: {path: '/quant/#/aktie/AAPL', critical: true, h1: '^Apple', price: {selector: '.q-stock-price', re: PRICE_USD}, chart: STOCK_CHART, core: STOCK_CORE, minText: 4000, includes: ['AAPL'], technik: 'AAPL'},
  start: {path: '/quant/', critical: true, h1: 'Jeden Tag sehen', minText: 3000, chart: GLOBE, includes: ['Quant']},
  radar: {path: '/quant/#/radar', h1: 'Was ist heute neu', minText: 8000, chart: GLOBE},
  strategien: {path: '/quant/#/strategien', h1: 'Welche Art von Unternehmen', minText: 1500, chart: GLOBE},
  screener: {path: '/quant/screener/', h1: 'Quant Screener', minText: 2000, chart: GLOBE, includes: ['Alle Kennzahlen']},
  // emptyOk: "Zuletzt analysiert" ist beim Erstbesuch ehrlich leer (die Einleitung erklaert, wo Aktien erscheinen) - kein Fehler.
  technical: {path: '/quant/technical/', h1: 'Welche Aktie', minText: 2500, chart: GLOBE, includes: ['Beobachten'], emptyOk: ['Zuletzt analysiert']},
  // Chartbild (Elliott/Kursstruktur): das Bild selbst muss gezeichnet sein; der Kopf (h1) nennt den Trend und ist datenabhaengig.
  chartbild: {path: '/quant/#/elliott/NVDA', h1: '\\S', minText: 1500, includes: ['Warum dieses Bild'], chart: {scope: '.cb-chart-card', minW: 150, minH: 100, minGeom: 5}},
  // Die beiden Nicht-gefunden-Seiten SIND die erwartete Auskunft; Datenabrufe, die ins Leere laufen, gehoeren dazu.
  notFoundStock: {path: '/quant/#/aktie/ZZZZQ', h1: 'Aktie nicht gefunden', minText: 100, allow404Data: true},
  notFoundRoute: {path: '/quant/#/unbekannt', h1: 'Diese Seite gibt es nicht', minText: 100, allow404Data: true}
};

// ---------------------------------------------------------------- Erwartung aus den Daten (Node-Seite, kein Browser)
// Was die Aktienseite im Abschnitt "08 / Technik" zeigt, ist im Vertrag festgelegt (quant/api/product-services.js,
// getTechnicalIntelligence): Beschriftungstabellen je Klasse; was dort nicht steht (UNDETERMINED, fehlender Code), heisst
// "Nicht verfügbar" - das ist die ehrliche Enthaltung. quant/tests/direct-link-lib.test.mjs vergleicht diese Tabellen mit dem Dienst.
export const NO_LABEL = 'Nicht verfügbar';
export const TECHNICAL_LABELS = {
  Trend: {BULLISH: 'Aufwärtstrend', BEARISH: 'Abwärtstrend', NEUTRAL: 'Keine klare Richtung', SIDEWAYS: 'Seitwärts'},
  Kursdynamik: {STRONG_POSITIVE: 'Stark positiv', POSITIVE: 'Positiv', NEUTRAL: 'Neutral', NEGATIVE: 'Negativ', STRONG_NEGATIVE: 'Stark negativ'},
  Schwankung: {NORMAL: 'Normal', HIGH: 'Erhöht', LOW: 'Niedrig', EXTREME: 'Sehr hoch'}
};
const CODE_OF = {Trend: b => b.trend && b.trend.direction, Kursdynamik: b => b.momentum && b.momentum.state, Schwankung: b => b.volatility && b.volatility.regime};

export const technicalShardKey = ticker => (ticker + '_').slice(0, 2).replace(/[^A-Z0-9._-]/g, '_'); // wie product-services.js#technicalShard
export function readJsonGz(file) { return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')); }

/** Gibt die Erwartung fuer einen Titel zurueck oder null, wenn der Release keinen Datensatz fuer ihn enthaelt.
 *  available = die Daten tragen eine veroeffentlichte, herkunftsgepruefte Auswertung (dieselben Bedingungen wie im Dienst):
 *  dann MUSS der Abschnitt stehen, mit den Beschriftungen aus dem Vertrag. Sonst (kein Bundle, Herkunft nicht bestanden)
 *  ist Enthaltung die richtige Seite. */
export function technicalExpectation(release, ticker, {today = new Date().toISOString().slice(0, 10), overlay = null} = {}) {
  // overlay: Schicht, die ueber dem Release ausgeliefert wird (Mutationsnachweise); die Erwartung folgt dem, was ausgeliefert wird.
  const dirs = [overlay, release].filter(Boolean).map(root => root + '/quant/data/product/technical-signals-v1/');
  const file = dirs.flatMap(dir => [dir + 'by-ticker/' + ticker + '.json.gz', dir + technicalShardKey(ticker) + '.json.gz']).find(f => existsSync(f));
  if (!file) return null;
  let doc;
  try { doc = readJsonGz(file); } catch (error) { return {ticker, available: false, unreadable: true, reason: 'Datensatz unlesbar: ' + error.message}; }
  const source = doc.instruments && doc.instruments[ticker];
  if (!source) return {ticker, available: false, reason: 'kein Eintrag im Datensatz', withheld: doc.unavailable && doc.unavailable[ticker] || null};
  const b = source.bundle;
  const provenance = source.instrumentId === ticker && source.isMock === false && source.dataMode === 'real' && source.source === 'tiingo'
    && b && b.instrumentId === ticker && /^\d{4}-\d{2}-\d{2}$/.test(String(b.dataCutoff)) && b.dataCutoff <= today && !!b.methodologyVersion;
  if (!provenance) return {ticker, available: false, reason: b ? 'Herkunftspruefung nicht bestanden' : 'kein veroeffentlichtes Bundle', withheld: doc.unavailable && doc.unavailable[ticker] || null};
  const labels = {}, codes = {};
  for (const name of Object.keys(TECHNICAL_LABELS)) { const code = CODE_OF[name](b); codes[name] = code || null; labels[name] = TECHNICAL_LABELS[name][code] || NO_LABEL; }
  return {ticker, available: true, labels, codes, dataCutoff: b.dataCutoff, methodology: b.methodologyVersion};
}

/** Kerntitel, deren Auswertung strikt erwartet wird: DATENGETRIEBEN aus einer Kandidatenliste, nur solche mit veroeffentlichter,
 *  herkunftsgepruefter Auswertung im Release. Ein einzelner zurueckgehaltener Kandidat (UNDETERMINED, kein Bundle, Stand in der
 *  Zukunft) ist zulaessige Enthaltung; erst wenn weniger als `min` qualifizieren, fehlt den Kerntiteln die Auswertung (Datenproblem). */
export const CORE_CANDIDATES = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'AVGO', 'TSLA'];
export function qualifyingCoreTitles(release, {candidates = CORE_CANDIDATES, today, overlay = null} = {}) {
  return candidates.filter(t => { const e = technicalExpectation(release, t, {...(today ? {today} : {}), overlay}); return e && e.available; });
}

/** Titel fuer den Gegennachweis "zulaessige Enthaltung" aus dem Release: einer mit unbestimmtem Zustand (UNDETERMINED) und
 *  einer ohne veroeffentlichtes Bundle. Je der erste in Dateireihenfolge; fehlt die Art im Release, bleibt der Eintrag null. */
export function pickWithheldProbes(release, {overlay = null} = {}) {
  const dir = release + '/quant/data/product/technical-signals-v1/by-ticker/';
  const out = {undetermined: null, noBundle: null};
  let names;
  try { names = readdirSync(dir).filter(n => n.endsWith('.json.gz')).sort(); } catch { return out; }
  for (const name of names) {
    if (out.undetermined && out.noBundle) break;
    const ticker = name.slice(0, -8);
    const e = technicalExpectation(release, ticker, {overlay});
    if (!e) continue;
    if (!e.available && !e.unreadable && !out.noBundle) out.noBundle = ticker;
    else if (e.available && e.codes.Kursdynamik === 'UNDETERMINED' && !out.undetermined) out.undetermined = ticker;
  }
  return out;
}


// Laeuft IM Browser. Erhebt nur Tatsachen; die Bewertung steht in verdict().
export function collectFacts(spec) {
  // Inhalt eines zugeklappten <details> ist nicht sichtbar (Chromium haelt ihm per content-visibility eine Box, innerText ist leer):
  // ein bewusst zugeklapptes Kapitel ist kein leerer Abschnitt.
  const folded = el => { const d = el.closest('details:not([open])'); return !!d && !(d.querySelector(':scope > summary') || {contains: () => false}).contains(el); };
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !folded(el); };
  const main = document.querySelector('#qx-main');
  const facts = {hasMain: !!main, busy: main && main.getAttribute('aria-busy'), gateVisible: !!document.querySelector('#research-access-form') && visible(document.querySelector('#research-access-form'))};
  if (!main) return facts;
  const text = main.innerText || '';
  facts.textLength = text.trim().length;
  facts.h1 = Array.from(main.querySelectorAll('h1')).filter(visible).map(h => h.textContent.trim());
  facts.strictHits = spec.strictErrors.filter(phrase => text.includes(phrase));
  facts.includesMissing = (spec.includes || []).filter(phrase => !text.includes(phrase));
  facts.textReHit = spec.textRe ? new RegExp(spec.textRe).test(text) : true;
  const priceNodes = spec.price ? Array.from(main.querySelectorAll(spec.price.selector)).filter(visible) : [];
  facts.priceOk = spec.price ? priceNodes.some(n => new RegExp(spec.price.re).test(n.textContent)) : true;
  const coreNodes = spec.core ? Array.from(main.querySelectorAll(spec.core)).filter(visible) : [];
  facts.coreCount = coreNodes.length;
  facts.coreBad = coreNodes.map(n => n.innerText).join('\n').match(new RegExp(spec.coreBad, 'i'));
  facts.coreBad = facts.coreBad && facts.coreBad[0];
  facts.coreSkeletons = coreNodes.reduce((n, c) => n + c.querySelectorAll('[class*=skeleton],[data-loading],[aria-busy=true]').length, 0);
  if (spec.chart) {
    const scopes = spec.chart.scope === 'main' ? [main] : Array.from(main.querySelectorAll(spec.chart.scope)).filter(visible);
    const svgs = scopes.flatMap(scope => scope.tagName.toLowerCase() === 'svg' ? [scope] : Array.from(scope.querySelectorAll('svg')));
    facts.charts = svgs.filter(visible).map(svg => {
      const r = svg.getBoundingClientRect();
      // Gezeichnet = Pfade/Linienzuege mit Inhalt oder Formen mit Ausdehnung (der Globus der Startseiten besteht aus Kreisen und Linien).
      const geometry = Array.from(svg.querySelectorAll('path')).filter(p => (p.getAttribute('d') || '').length > 20).length
        + Array.from(svg.querySelectorAll('polyline')).filter(p => (p.getAttribute('points') || '').length > 20).length
        + Array.from(svg.querySelectorAll('rect,circle,ellipse,line')).filter(q => { const b = q.getBoundingClientRect(); return b.width > 0 || b.height > 0; }).length;
      return {w: Math.round(r.width), h: Math.round(r.height), geometry};
    });
  }
  if (spec.list) facts.listCount = main.querySelectorAll(spec.list.selector).length;
  // ---- Phase 4: Inhalt ueber den Kern hinaus
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  facts.loadFailedHits = lines.filter(l => new RegExp(spec.loadFailedRe, 'i').test(l)).slice(0, 3);
  const loadingRe = new RegExp(spec.loadingRe, 'i');
  // Textknoten statt Zeilen: Platzhaltertexte in ausgeblendeten Huellen (aria-hidden) zaehlen nicht. Der ganze Hauptbereich gilt, auch
  // unterhalb des Bildschirms: die Abschnitte der Aktienseite laden ohne Scrollen.
  const loadingText = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && loadingText.length < 3) {
    const node = walker.currentNode, t = node.textContent.replace(/\s+/g, ' ').trim(), host = node.parentElement;
    if (t && t.length <= spec.loadingLineMax && loadingRe.test(t) && host && visible(host) && !host.closest('[aria-hidden="true"]')) loadingText.push(t);
  }
  const loadingNodes = Array.from(main.querySelectorAll(spec.loadingSelector)).filter(n => visible(n) && !n.closest('[aria-hidden="true"]')).slice(0, 3).map(n => n.tagName.toLowerCase() + '.' + String(n.className).slice(0, 40));
  facts.loadingHits = loadingText.concat(loadingNodes);
  // Abschnitte ohne Inhalt: nur Kopf (Kicker, Titel, Einleitung) und sonst nichts - weder Text noch Grafik, Tabelle, Link oder Schaltflaeche.
  facts.emptySections = Array.from(main.querySelectorAll('section.qx-section, section.dx-chapter')).filter(visible).filter(sec => {
    const head = Array.from(sec.querySelectorAll('.q-kicker, .q-sec-head, .q-sec-intro')).map(n => n.innerText).join(' ').replace(/\s+/g, ' ').trim();
    const rest = sec.innerText.replace(/\s+/g, ' ').trim().length - head.length;
    // Ein Abschnitt ganz ohne Titel und Inhalt ist ein leerer Huellenabsatz, kein Ausfall.
    return !!(sec.querySelector('h2, h3') || {}).textContent && rest < 12 && !sec.querySelector('svg, img, canvas, table, a[href], button, input, select');
  }).map(sec => ((sec.querySelector('h2, h3') || {}).textContent || sec.id || sec.className).trim().slice(0, 50)).filter(title => !(spec.emptyOk || []).includes(title));
  facts.emptyStats = Array.from(main.querySelectorAll('.qx-stat')).filter(st => { const b = st.querySelector('b'); return b && !b.textContent.trim(); }).map(st => ((st.querySelector('span') || {}).textContent || '?').trim());
  facts.brokenImages = Array.from(main.querySelectorAll('img[src]')).filter(img => visible(img) && img.complete && img.naturalWidth === 0 && !img.closest('[data-logo-fallback]')).map(img => img.getAttribute('src').slice(-60)).slice(0, 3);
  // ---- Technik-Abschnitt (08 / Technik): die Anzeigewerte, gegen die verdict() die Datenerwartung haelt
  const tech = main.querySelector('#technik');
  facts.technik = {present: !!tech && visible(tech)};
  if (facts.technik.present) {
    const shown = {};
    tech.querySelectorAll('.qx-stat').forEach(st => { const b = st.querySelector('b'), l = st.querySelector('span'); if (b && l) shown[l.textContent.trim()] = b.textContent.trim(); });
    facts.technik.shown = shown;
    facts.technik.reducedSentence = /vollständige technische Auswertung[^.]*noch nicht veröffentlicht/i.test(tech.innerText);
    facts.technik.chartLink = Array.from(tech.querySelectorAll('a')).some(a => /Chartbild öffnen/.test(a.textContent));
  }
  return facts;
}

export function fullSpec(spec) {
  return {coreBad: CORE_BAD, strictErrors: STRICT_ERRORS, loadFailedRe: LOAD_FAILED_RE, loadingRe: LOADING_RE, loadingLineMax: LOADING_LINE_MAX, loadingSelector: LOADING_SELECTOR, ...spec};
}

// Gibt die Liste der Maengel zurueck; leer = die Route ist wirklich gerendert.
export function verdict(facts, spec) {
  const problems = [];
  if (facts.gateVisible) return ['Zugangsmaske sichtbar (Inhalt nicht geoeffnet)'];
  if (!facts.hasMain) return ['#qx-main fehlt (Seitengeruest nicht aufgebaut)'];
  if (facts.busy !== 'false') problems.push('aria-busy=' + facts.busy);
  if (spec.h1) {
    if (!facts.h1.length) problems.push('kein sichtbarer, nicht leerer h1');
    else if (!facts.h1.some(text => text && new RegExp(spec.h1).test(text))) problems.push('h1 "' + facts.h1.join(' | ').slice(0, 60) + '" passt nicht zu /' + spec.h1 + '/');
  }
  if (facts.textLength < (spec.minText || 0)) problems.push('Hauptbereich zu kurz: ' + facts.textLength + ' < ' + spec.minText + ' Zeichen');
  if (facts.strictHits.length) problems.push('Fehlermeldung: ' + facts.strictHits.join(', '));
  if (facts.includesMissing.length) problems.push('Text fehlt: ' + facts.includesMissing.join(', '));
  if (!facts.textReHit) problems.push('erwartetes Zahlenmuster fehlt');
  if (spec.price && !facts.priceOk) problems.push('kein sichtbarer Kursblock mit Preis');
  if (spec.core) {
    if (!facts.coreCount) problems.push('Kernbereich (Kopf/Chart) nicht sichtbar');
    if (facts.coreBad) problems.push('Platzhalter oder Fehler im Kern: "' + facts.coreBad + '"');
    if (facts.coreSkeletons) problems.push(facts.coreSkeletons + ' Skeleton(s) im Kern');
  }
  if (spec.chart) {
    const ok = (facts.charts || []).filter(c => c.w >= spec.chart.minW && c.h >= spec.chart.minH && c.geometry >= (spec.chart.minGeom || 1));
    if (!ok.length) problems.push('kein gezeichneter Chart (sichtbar >= ' + spec.chart.minW + 'x' + spec.chart.minH + ' mit Pfaden): ' + JSON.stringify((facts.charts || []).slice(0, 3)));
  }
  if (spec.list && facts.listCount < spec.list.min) problems.push('Liste zu kurz: ' + facts.listCount + ' < ' + spec.list.min);
  if (facts.loadFailedHits && facts.loadFailedHits.length) problems.push('Ladefehler der Oberflaeche: "' + facts.loadFailedHits[0].slice(0, 80) + '"');
  if (facts.loadingHits && facts.loadingHits.length) problems.push('Ladezustand nicht aufgeloest: ' + facts.loadingHits.join(' | '));
  if (facts.emptySections && facts.emptySections.length) problems.push('leerer Abschnitt: ' + facts.emptySections.join(' | '));
  if (facts.emptyStats && facts.emptyStats.length) problems.push('leere Kennzahl: ' + facts.emptyStats.join(' | '));
  if (facts.brokenImages && facts.brokenImages.length) problems.push('Bild nicht geladen: ' + facts.brokenImages.join(' | '));
  if (spec.technical) problems.push(...technicalProblems(facts.technik, spec.technical));
  return problems;
}

/** Technik-Abschnitt gegen die Datenerwartung (technicalExpectation). Reine Funktion.
 *  Regeln: (1) Tragen die Daten eine veroeffentlichte Auswertung, MUSS der Abschnitt stehen und je Kennzahl exakt die
 *  Vertragsbeschriftung zeigen - auch "Nicht verfügbar", wenn der Code UNDETERMINED oder unbekannt ist (das ist die Enthaltung).
 *  (2) Der Satz "vollständige technische Auswertung … noch nicht veröffentlicht" und ein fehlender Chartbild-Link sind bei
 *  vorhandenem Bundle Fehler. (3) Ohne Bundle (zurueckgehalten) wird nichts verlangt. */
export function technicalProblems(technik, expectation) {
  if (!expectation || expectation.unreadable) return expectation && expectation.unreadable ? ['Datensatz der technischen Auswertung unlesbar: ' + expectation.reason] : [];
  if (!expectation.available) return [];
  const problems = [];
  if (!technik || !technik.present) return ['Abschnitt "08 / Technik" fehlt, obwohl die Daten eine Auswertung tragen (' + expectation.ticker + ', Stand ' + expectation.dataCutoff + ')'];
  for (const name of Object.keys(expectation.labels)) {
    const shown = technik.shown && technik.shown[name], wanted = expectation.labels[name], code = expectation.codes[name];
    if (shown === undefined) problems.push(name + ' fehlt im Technik-Abschnitt');
    else if (shown !== wanted) problems.push(name + ' zeigt "' + shown + '", die Daten tragen ' + (code || 'keinen Code') + ' (erwartet "' + wanted + '")');
  }
  if (technik.reducedSentence) problems.push('Hinweis "vollständige technische Auswertung … noch nicht veröffentlicht" trotz vorhandener Auswertung in den Daten');
  if (!technik.chartLink) problems.push('"Chartbild öffnen" fehlt trotz vorhandener Auswertung');
  return problems;
}

// Wartet, bis die Route ALLE Merkmale zeigt, und prueft nach einer kurzen
// Beruhigung erneut (ein Bild, das aufblitzt und wieder leer wird, besteht nicht).
export async function waitRendered(page, specName, {timeout = 25000, settle = 350} = {}) {
  const spec = fullSpec(typeof specName === 'string' ? SPECS[specName] : specName);
  const started = Date.now();
  let problems = ['nicht gestartet'];
  while (Date.now() - started < timeout) {
    let facts;
    try { facts = await page.evaluate(collectFacts, spec); } catch (error) { problems = ['evaluate: ' + error.message.split('\n')[0]]; await sleep(250); continue; }
    problems = verdict(facts, spec);
    if (!problems.length) {
      await sleep(settle);
      try { problems = verdict(await page.evaluate(collectFacts, spec), spec); } catch (error) { problems = ['evaluate: ' + error.message.split('\n')[0]]; }
      if (!problems.length) return {ok: true, ms: Date.now() - started, problems: []};
    }
    await sleep(200);
  }
  return {ok: false, ms: Date.now() - started, problems};
}

// ---------------------------------------------------------------- Netz: Antworten der Seite bewerten (reine Funktion)
export const DATA_PATH = /\/data\/|\.json(?:\.gz)?$/;
export const isDataRequest = r => ['fetch', 'xhr', 'other'].includes(r.type) && DATA_PATH.test(r.path);
const isCode = r => r.type === 'script' || r.type === 'stylesheet';

/** records: [{type, path, status, failed?, parseError?}] - eine Zeile je Antwort. has(path): liegt die Datei im Release?
 *  Fehler: 5xx irgendwo; 4xx auf JS/CSS (veraltete Asset-Referenz); 4xx auf eine Datendatei, die im Release LIEGT (Scherben,
 *  Ausschnitt, Reihe fehlt oder wird falsch ausgeliefert); unlesbare Daten (Parsefehler, leere Datei); abgebrochene
 *  Verbindung auf Code/Daten. KEIN Fehler: 4xx auf eine Datei, die im Release nicht liegt (gewollter Rueckfall, z. B.
 *  golden-preview/daily/ref_X.json) und Seiten, die ihre Nicht-gefunden-Auskunft zeigen (allow404). */
export function assessRequests(records, {has = () => true, allow404 = false} = {}) {
  const problems = [];
  const seen = new Set();
  const add = text => { if (!seen.has(text)) { seen.add(text); problems.push(text); } };
  for (const r of records) {
    if (r.failed) {
      if (/ABORTED|cancel/i.test(r.failed)) continue;
      if (isCode(r) || isDataRequest(r)) add('Anfrage fehlgeschlagen (' + r.failed + '): ' + r.path);
      continue;
    }
    if (r.status >= 500) add('Serverfehler ' + r.status + ': ' + r.path);
    else if (r.status >= 400) {
      if (isCode(r)) add('veraltete Asset-Referenz, ' + r.status + ' auf ' + r.path);
      else if (isDataRequest(r) && !allow404 && has(r.path)) add('Daten-Request ' + r.status + ', obwohl die Datei im Release liegt: ' + r.path);
    } else if (r.parseError && isDataRequest(r)) add('Datendatei nicht lesbar (' + r.parseError + '): ' + r.path);
  }
  return problems;
}

/** Stempel (?v=) der Verweise im ausgelieferten HTML: Pfad -> Stempel. Nur lokale JS-/CSS-Verweise (wie release-id.mjs#linkedAssets). */
export function pageStamps(html) {
  const out = new Map();
  for (const m of String(html).matchAll(/\b(?:src|href)\s*=\s*["'](\/[^"'#?]+\.(?:js|css))\?v=([0-9a-f]+)["']/g)) out.set(m[1], m[2]);
  return out;
}

/** Kennung: meta vu-release der Seite gegen /release-id.json, und jeder ?v=-Stempel einer geladenen Datei.
 *  meta: {product, content} | null; json: Inhalt von release-id.json | null;
 *  stamps: [{path, v, actual, fixed}] - fixed = die Seite selbst stempelt diesen Pfad (dann MUSS v der Hash der ausgelieferten
 *  Bytes sein, `actual`); sonst wurde die Datei nachgeladen und traegt die Kennung des Produkts oder einen Stempel der Seite (known). */
export function assessRelease({meta, json, product, stamps = [], known = []}) {
  const problems = [];
  if (!json) problems.push('release-id.json fehlt (Lauf gegen build-release-Stand ohne Kennung; scripts/vu2/release-id.mjs nach dem Verkleinern ausfuehren)');
  else {
    const id = json.products && json.products[product];
    if (!id) problems.push('release-id.json kennt das Produkt "' + product + '" nicht');
    if (!meta) problems.push('meta vu-release fehlt in der ausgelieferten Seite');
    else if (meta.product !== product) problems.push('meta vu-release gehoert zu "' + meta.product + '", erwartet "' + product + '"');
    else if (id && meta.content !== id) problems.push('Kennung der Seite (' + meta.content + ') passt nicht zu release-id.json (' + id + ')');
  }
  const productId = json && json.products && json.products[product];
  for (const s of stamps) {
    if (!s.actual) continue;
    const ok = s.fixed ? s.v === s.actual : (s.v === s.actual || s.v === productId || known.includes(s.v));
    if (!ok) problems.push('veralteter Stempel ?v=' + s.v + ' an ' + s.path + ' (Datei: ' + s.actual + ', Release-Kennung: ' + productId + ')');
  }
  return problems;
}
