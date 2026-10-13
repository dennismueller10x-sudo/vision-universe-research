// Direktlink-Pruefung fuer Discover: positive Inhaltsmerkmale statt "kein Fehler".
//
// PR #619 lieferte einen WebKit-Race, bei dem ein Direktlink eine LEERE Seite
// zeigte, ohne Seitenfehler und ohne Fehlermeldung. Eine Pruefung, die nur auf
// "kein Fehlertext" wartet, besteht dann. Deshalb gilt eine Route erst als
// gerendert, wenn ihre Merkmale SICHTBAR da sind: Ueberschrift mit erwartetem
// Namen, Kursblock, gezeichneter Chart (Pfade und Flaeche > 0), genug Text und
// keine Ladeanzeige im Kern. Reine Funktionen und Erwartungstabelle; kein
// Browser-Start hier (browser-qa.mjs und browser-qa-direct.mjs nutzen sie).

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Harte Fehlermeldungen: diese Saetze duerfen NIRGENDS im Hauptbereich stehen.
export const STRICT_ERRORS = ['Gerade nicht erreichbar', 'Technik nicht verfügbar', 'konnte nicht aufgebaut werden', 'Die Seite konnte nicht geladen werden'];
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
  unknownStock: {path: '/discover/#/s/XX/UNKNOWN', h1: 'Aktie nicht gefunden', minText: 40, expectNotFound: true}
};

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
  return {coreBad: CORE_BAD, strictErrors: STRICT_ERRORS, ...spec};
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
