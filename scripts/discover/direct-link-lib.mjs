// Direktlink-Pruefung fuer Discover: positive Inhaltsmerkmale statt "kein Fehler".
//
// PR #619 lieferte einen WebKit-Race, bei dem ein Direktlink eine LEERE Seite
// zeigte, ohne Seitenfehler und ohne Fehlermeldung. Eine Pruefung, die nur auf
// "kein Fehlertext" wartet, besteht dann. Deshalb gilt eine Route erst als
// gerendert, wenn ihre Merkmale SICHTBAR da sind: Ueberschrift mit erwartetem
// Namen, Kursblock, gezeichneter Chart (Pfade und Flaeche > 0), genug Text und
// keine Ladeanzeige im Kern. Reine Funktionen und Erwartungstabelle; kein
// Browser-Start hier (browser-qa.mjs und browser-qa-direct.mjs nutzen sie).
//
// PHASE 4 (Stabilitaetsmission): die Pruefung erkennt jetzt auch FACHLICHE Fehlerzustaende, die vorher gruen blieben.
//   1. Erwartung aus den DATEN: discoverExpectation() liest den Datensatz des Titels aus dem Release
//      (discover/data/stocks/<Welt>/<Symbol>.json) und leitet daraus ab, was die Seite zeigen MUSS: ein Kursverlauf, wenn
//      series.available gilt; die Zeilen Marktstruktur und Support / Resistance, wenn die Technical-Intelligence-Schicht
//      "available" ist. Zurueckgehaltene Faelle (technicalIntelligence.available = false, sparklineStatus WITHHELD_*,
//      discoveryEligible = false) erwarten die Enthaltung und sind KEIN Fehler.
//   2. Inhalt: leere Kapitel, nicht aufgeloeste Ladezustaende (Skeleton, aria-busy, "wird geladen"; die Poster-Platzhalter der
//      Nachlade-Reihen zaehlen nicht), "konnte nicht geladen werden"-Meldungen.
//   3. Netz: assessRequests() bewertet jede Antwort (404/5xx auf JS/CSS/Daten, unlesbare Daten); 404 auf eine Datei, die im
//      Release NICHT liegt, ist gewollter Rueckfall und kein Fehler.
//   4. Stempel: assessRelease() vergleicht meta vu-release mit /release-id.json und jeden ?v= mit den ausgelieferten Bytes.

import {readFileSync, existsSync, readdirSync} from 'node:fs';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Harte Fehlermeldungen: diese Saetze duerfen NIRGENDS im Hauptbereich stehen.
export const STRICT_ERRORS = ['Gerade nicht erreichbar', 'Technik nicht verfügbar', 'konnte nicht aufgebaut werden', 'Die Seite konnte nicht geladen werden'];
// Technische Ladefehler der Oberflaeche (nicht zu verwechseln mit fachlicher Enthaltung): gelten im ganzen Hauptbereich.
export const LOAD_FAILED_RE = '(?:konnte|konnten)\\s+(?:gerade\\s+)?nicht\\s+geladen\\s+werden|Daten konnten nicht';
// Ladezustaende, die nach der Beruhigung nicht mehr da sein duerfen ("Markt wird geladen …", "Kurs lädt"). Nur KURZE Zeilen (Platzhalter).
export const LOADING_RE = '(?:wird|werden)\\s+geladen|\\blädt\\b|Lade\\s+Daten';
export const LOADING_LINE_MAX = 80;
// Die Poster der Nachlade-Reihen tragen bis zum Sichtbarwerden ein Skeleton (dx-art-skeleton) - das ist Absicht, kein Ladefehler.
export const LOADING_SELECTOR = '[aria-busy="true"],[class*="skeleton"],[class*="spinner"],[data-loading],[role="progressbar"]';
// dx-lazy-media: Karten laden ihren Verlauf erst, wenn sie ins Bild kommen (Startseite, Feed) - Absicht.
export const LOADING_IGNORE = '.dx-poster, .dx-rail, .dx-lazy-media, [aria-hidden="true"]';
// Im Kern (Kopf, Kurs, Chart) darf weder eine Ladeanzeige noch ein "nicht verfuegbar" stehen.
// In weiter unten liegenden Abschnitten sind "noch nicht verfuegbar" (z. B. Quant-Analyse
// fuer europaeische Titel) ehrliche Auskunft und bewusst erlaubt.
export const CORE_BAD = 'nicht verfügbar|wird geladen|lädt|nicht erreichbar|keine daten';

const PRICE_EUR = '\\d[\\d.]*,\\d{2}\\s*[€$]';
export const SPECS = {
  nvda: {path: '/discover/#/s/US_REAL/NVDA', critical: true, h1: '^NVIDIA', price: {selector: '.dx-price, .dx-chart-hero-preis', re: PRICE_EUR},
    chart: {scope: '.dx-chapter--chart', minW: 150, minH: 100, minGeom: 2}, core: '.dx-dhero, .dx-chapter--chart', minText: 1500},
  rheinmetall: {path: '/discover/#/s/EUROPE/ref_RHM_DE_XETR', critical: true, h1: 'Rheinmetall', price: {selector: '.dx-price, .dx-chart-hero-preis', re: PRICE_EUR},
    chart: {scope: '.dx-chapter--chart', minW: 150, minH: 100, minGeom: 2}, core: '.dx-dhero, .dx-chapter--chart', minText: 800},
  einzeln: {path: '/discover/#/einzeln/NVDA', critical: true, feed: true, minText: 1000,
    chart: {scope: '.dx-feed-screen', minW: 150, minH: 100, minGeom: 2}},
  daten: {path: '/discover/#/daten', h1: '^Daten & Quellen', minText: 3000, includes: ['Marktdaten']},
  maerkte: {path: '/discover/#/maerkte', h1: '^Märkte', minText: 4000, includes: ['Marktbarometer'], textRe: '[−+-]\\d+,\\d+\\s*%',
    chart: {scope: 'main', minW: 100, minH: 20, minGeom: 2}},
  strategien: {path: '/discover/#/strategien', h1: '^Strategien$', minText: 1500, list: {selector: '#v2-main a[href*="#/"]', min: 5}},
  aktien: {path: '/discover/#/aktien', h1: 'Alle Aktien', minText: 800, list: {selector: '#v2-main a[href*="/s/"]', min: 30}},
  start: {path: '/discover/', h1: 'Sieh den Markt', minText: 2000, list: {selector: '#v2-main a[href*="/s/"]', min: 4}},
  // Die Nicht-gefunden-Seite IST die erwartete Auskunft; der Abruf der Aktiendatei, der ins Leere laeuft, gehoert dazu.
  unknownStock: {path: '/discover/#/s/XX/UNKNOWN', h1: 'Aktie nicht gefunden', minText: 40, expectNotFound: true, allow404Data: true}
};

// ---------------------------------------------------------------- Erwartung aus den Daten (Node-Seite, kein Browser)
/** Liest den Datensatz des Titels, den die Route zeigt, aus dem Release. null = Route ohne Titeldatensatz (Listen, Europa, Unbekannt).
 *  Die Seite entscheidet nicht, was sie zeigen muss - der Datensatz tut es. */
export function discoverExpectation(release, routePath, {overlay = null} = {}) {
  const m = /^\/discover\/#\/s\/([A-Z0-9_]+)\/([A-Za-z0-9._-]+)$/.exec(routePath);
  if (!m) return null;
  // overlay: Schicht ueber dem Release (Mutationsnachweise); die Erwartung folgt dem, was ausgeliefert wird.
  const file = [overlay, release].filter(Boolean).map(root => root + '/discover/data/stocks/' + m[1] + '/' + m[2] + '.json').find(f => existsSync(f));
  if (!file) return null;
  let d;
  try { d = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { return {symbol: m[2], unreadable: true, reason: 'Datensatz unlesbar: ' + error.message}; }
  const layers = (d.technicalIntelligence && d.technicalIntelligence.layers) || {};
  const status = key => (layers[key] && layers[key].status) || null;
  return {
    symbol: m[2], universe: m[1],
    series: {available: !!(d.series && d.series.available), source: d.series && d.series.source || null},
    technical: {available: !!(d.technicalIntelligence && d.technicalIntelligence.available), marketStructure: status('marketStructure'), supportResistance: status('supportResistance')},
    withheld: {sparkline: /^WITHHELD/.test(String(d.sparklineStatus || '')), ineligible: d.discoveryEligible === false}
  };
}

/** Kerntitel, deren Kursverlauf und Kursstruktur strikt erwartet werden: DATENGETRIEBEN aus einer Kandidatenliste, nur solche, deren
 *  Datensatz im Release series.available UND available Technical-Intelligence-Schichten traegt. Ein einzelner zurueckgehaltener
 *  Kandidat ist Enthaltung (seine Route folgt dem Datensatz); erst wenn weniger als `min` qualifizieren, ist das ein Datenproblem. */
export const CORE_CANDIDATES = ['NVDA', 'AAPL', 'MSFT', 'JPM', 'XOM', 'AMZN', 'GOOGL', 'META'];
export function qualifyingCoreTitles(release, {candidates = CORE_CANDIDATES, overlay = null} = {}) {
  return candidates.filter(t => { const e = discoverExpectation(release, '/discover/#/s/US_REAL/' + t, {overlay}); return e && !e.unreadable && e.series.available && e.technical.available; });
}

/** Titel fuer den Gegennachweis "zulaessige Enthaltung" aus dem Release (US_REAL): einer, dessen Technical-Intelligence-Schicht
 *  zurueckgehalten ist (available = false), und einer mit zurueckgehaltener Sparkline (WITHHELD_*, Lizenz) oder ohne Aufnahme
 *  (discoveryEligible = false). Je der erste in Dateireihenfolge; fehlt die Art, bleibt der Eintrag null. */
export function pickWithheldProbes(release, {overlay = null} = {}) {
  const dir = release + '/discover/data/stocks/US_REAL/';
  const out = {technicalWithheld: null, redistributionWithheld: null};
  let names;
  try { names = readdirSync(dir).filter(n => n.endsWith('.json')).sort(); } catch { return out; }
  for (const name of names) {
    if (out.technicalWithheld && out.redistributionWithheld) break;
    const e = discoverExpectation(release, '/discover/#/s/US_REAL/' + name.slice(0, -5), {overlay});
    if (!e || e.unreadable || !e.series.available) continue;
    if (!out.technicalWithheld && !e.technical.available) out.technicalWithheld = e.symbol;
    else if (!out.redistributionWithheld && (e.withheld.sparkline || e.withheld.ineligible)) out.redistributionWithheld = e.symbol;
  }
  return out;
}

// Laeuft IM Browser. Erhebt nur Tatsachen; die Bewertung steht in verdict().
export function collectFacts(spec) {
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const main = document.querySelector('#v2-main');
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
      const geometry = Array.from(svg.querySelectorAll('path')).filter(p => (p.getAttribute('d') || '').length > 20).length
        + Array.from(svg.querySelectorAll('polyline')).filter(p => (p.getAttribute('points') || '').length > 20).length
        + Array.from(svg.querySelectorAll('rect')).filter(q => q.getBoundingClientRect().width > 0 && q.getBoundingClientRect().height > 0).length;
      return {w: Math.round(r.width), h: Math.round(r.height), geometry};
    });
  }
  if (spec.list) facts.listCount = main.querySelectorAll(spec.list.selector).length;
  // ---- Phase 4: Inhalt ueber den Kern hinaus
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  facts.loadFailedHits = lines.filter(l => new RegExp(spec.loadFailedRe, 'i').test(l)).slice(0, 3);
  const loadingRe = new RegExp(spec.loadingRe, 'i');
  // Textknoten statt Zeilen: Platzhaltertexte in ausgeblendeten Huellen (aria-hidden, Poster-Skeleton "Kurs lädt") zaehlen nicht.
  const loadingText = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && loadingText.length < 3) {
    const node = walker.currentNode, t = node.textContent.replace(/\s+/g, ' ').trim(), host = node.parentElement;
    if (t && t.length <= spec.loadingLineMax && loadingRe.test(t) && host && visible(host) && !host.closest(spec.loadingIgnore)) loadingText.push(t);
  }
  const loadingNodes = Array.from(main.querySelectorAll(spec.loadingSelector)).filter(n => visible(n) && !n.closest(spec.loadingIgnore)).slice(0, 3).map(n => n.tagName.toLowerCase() + '.' + String(n.className).slice(0, 40));
  // Die Einzelansicht (Feed) laedt nur die aktive Karte; die naechste, am unteren Rand sichtbare Karte bleibt bis zum Wischen im Skeleton.
  // Dort gilt die Pruefung der ersten Karte (unten, spec.feed), nicht diese.
  facts.loadingHits = spec.feed ? [] : loadingText.concat(loadingNodes);
  // Kapitel ohne Inhalt: nur eine Ueberschrift und sonst nichts. textContent statt innerText: eingeblendete Kapitel (dx-fade) melden
  // innerText leer, solange sie nicht im Bild waren; ihr Inhalt steht trotzdem da.
  const plainText = el => { const c = el.cloneNode(true); c.querySelectorAll('style,script,template').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  facts.emptyChapters = Array.from(main.querySelectorAll('section.dx-chapter')).filter(visible).filter(sec => {
    const heading = Array.from(sec.querySelectorAll('h1,h2,h3')).map(h => h.textContent.replace(/\s+/g, ' ').trim()).join(' ');
    // Ein Kapitel ganz ohne Ueberschrift und Inhalt ist ein leerer Huellenabsatz (z. B. "Weiter entdecken" ohne Eintraege), kein Ausfall.
    return !!heading && plainText(sec).length - heading.length < 12 && !sec.querySelector('svg, img, canvas, table, a[href], button, input, select');
  }).map(sec => ((sec.querySelector('h2, h3') || {}).textContent || sec.className).trim().slice(0, 50)).filter(title => !(spec.emptyOk || []).includes(title));
  // ---- Kursstruktur-Kapitel ("Chartbild — Kursstruktur"): die Zeilen, gegen die verdict() die Datenerwartung haelt
  const ti = main.querySelector('.dx-ti');
  facts.ti = {present: !!ti};
  if (ti) {
    const rows = {};
    ti.querySelectorAll('.dx-kv > div').forEach(row => { const k = row.querySelector('span'), v = row.querySelector('b'); if (k && v) rows[k.textContent.trim()] = v.textContent.trim(); });
    facts.ti.rows = rows;
    facts.ti.chartLink = Array.from(ti.querySelectorAll('a')).some(a => /Chartbild öffnen/.test(a.textContent));
  }
  if (spec.feed) {
    const counter = document.querySelector('.dx-feed-zaehler'), first = Array.from(document.querySelectorAll('.dx-feed-screen')).filter(visible)[0];
    facts.feedCounter = counter ? counter.textContent.trim() : '';
    facts.feedFirstText = first ? first.innerText.trim().length : 0;
    facts.coreSkeletons = first ? first.querySelectorAll('[class*=skeleton],[data-loading]').length : -1;
    facts.coreBad = first ? ((first.innerText.match(/wird geladen|nicht erreichbar/i) || [])[0] || null) : null;
  }
  return facts;
}

export function fullSpec(spec) {
  // Zeigen die Daten einen Kursverlauf (series.available), gehoert ein gezeichneter Chart zur Route - auch wenn die Tabelle keinen nennt.
  const chart = spec.chart || (spec.expect && spec.expect.series && spec.expect.series.available ? {scope: '.dx-chapter--chart', minW: 150, minH: 100, minGeom: 2} : undefined);
  return {coreBad: CORE_BAD, strictErrors: STRICT_ERRORS, loadFailedRe: LOAD_FAILED_RE, loadingRe: LOADING_RE, loadingLineMax: LOADING_LINE_MAX, loadingSelector: LOADING_SELECTOR, loadingIgnore: LOADING_IGNORE, ...spec, ...(chart ? {chart} : {})};
}

// Gibt die Liste der Maengel zurueck; leer = die Route ist wirklich gerendert.
export function verdict(facts, spec) {
  const problems = [];
  if (facts.gateVisible) return ['Zugangsmaske sichtbar (Inhalt nicht geoeffnet)'];
  if (!facts.hasMain) return ['#v2-main fehlt (Seitengeruest nicht aufgebaut)'];
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
  if (spec.feed) {
    if (!/^1\s+von\s+\d+/i.test(facts.feedCounter || '')) problems.push('Feed-Zaehler fehlt: "' + facts.feedCounter + '"');
    if (!(facts.feedFirstText >= 80)) problems.push('erste Feed-Karte leer (' + facts.feedFirstText + ' Zeichen)');
    if (facts.coreSkeletons > 0) problems.push('Skeleton in der ersten Feed-Karte');
    if (facts.coreBad) problems.push('Platzhalter in der ersten Feed-Karte: "' + facts.coreBad + '"');
  }
  if (facts.loadFailedHits && facts.loadFailedHits.length) problems.push('Ladefehler der Oberflaeche: "' + facts.loadFailedHits[0].slice(0, 80) + '"');
  if (facts.loadingHits && facts.loadingHits.length) problems.push('Ladezustand nicht aufgeloest: ' + facts.loadingHits.join(' | '));
  if (facts.emptyChapters && facts.emptyChapters.length) problems.push('leeres Kapitel: ' + facts.emptyChapters.join(' | '));
  if (spec.expect) problems.push(...expectationProblems(facts, spec.expect));
  return problems;
}

/** Datenerwartung (discoverExpectation) gegen das, was die Seite zeigt. Reine Funktion.
 *  Regeln: (1) Zeigen die Daten einen Kursverlauf, MUSS ein Chart gezeichnet sein (steht in fullSpec/verdict ueber spec.chart).
 *  (2) Ist die Technical-Intelligence-Schicht "available", MUSS die Zeile (Marktstruktur, Support / Resistance) im Kapitel
 *  "Chartbild — Kursstruktur" stehen und etwas anderes als "nicht verfügbar" zeigen. (3) Ist sie zurueckgehalten, ist "nicht
 *  verfügbar" (oder keine Zeile) die richtige Antwort und kein Fehler. (4) Ein Datensatz, der nicht lesbar ist, ist ein Fehler. */
export function expectationProblems(facts, expect) {
  if (!expect) return [];
  if (expect.unreadable) return ['Datensatz des Titels unlesbar: ' + expect.reason];
  const problems = [];
  const t = expect.technical || {};
  const wanted = [['Marktstruktur', t.marketStructure], ['Support / Resistance', t.supportResistance]].filter(([, status]) => status === 'available');
  if (wanted.length) {
    if (!facts.ti || !facts.ti.present) problems.push('Kapitel "Chartbild — Kursstruktur" fehlt, obwohl die Daten die Schichten tragen (' + wanted.map(w => w[0]).join(', ') + ')');
    else for (const [name] of wanted) {
      const shown = facts.ti.rows && facts.ti.rows[name];
      if (shown === undefined) problems.push('Zeile "' + name + '" fehlt, obwohl die Daten sie tragen');
      else if (!shown || /nicht verfügbar/i.test(shown)) problems.push('Zeile "' + name + '" zeigt "' + shown + '", die Daten tragen status=available');
    }
  }
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
