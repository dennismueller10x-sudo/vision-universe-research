// Urteil ueber den Block "Was ist jetzt wichtig?" (#veraenderung .q-now) der Aktienseite.
//
// Gepruefte Eigenschaft: Der gerenderte Block entspricht dem fachlich gueltigen Zustand, den die Produkt-API fuer genau diese
// Aktie veroeffentlicht. Es wird KEIN Wortlaut verlangt (frueher: /Setup|Veränderung|Stand/, Issue #1289). Die erwartete
// Zustandsform kommt aus getRadarCard(ticker) (quant/api/product-services.js), die gerenderte aus dem DOM, erzeugt von
// quant/app/page-stock.js#nowContent:
//   Radar verfuegbar mit Ereignissen   -> ul.q-events mit genau so vielen li.q-ev, jede mit Label, Erklaerung, Datum;
//                                         die Erklaerung ist die veroeffentlichte; kein Leerhinweis
//   Radar verfuegbar ohne Ereignisse   -> genau ein p.q-now-none, keine Ereignisliste
//   Radar nicht verfuegbar             -> weder Ereignisse noch Leerhinweis, genau ein Leerzustand (p.qx-small)
//   "Naechster Schritt" (p.q-now-line) -> genau dann, wenn die API offene Bedingungen nennt
// Immer: der Platzhalter "wird geladen" ist verschwunden.
// Reine Funktion, ohne Browser; getestet in quant/tests/browser-qa-now-block.test.mjs (Gegenproben).

const blank = (s) => typeof s !== 'string' || s.trim() === '';

/**
 * @param {{available:boolean, events:{explanation:string}[], nextOpen:number}} expected  aus der Produkt-API
 * @param {null|{loading:boolean, eventItems:{label:string,explanation:string,date:string}[], none:number, nextLines:string[], empty:string[]}} dom
 * @returns {string[]} Befunde (leer = gueltig)
 */
export function judgeNowBlock(expected, dom) {
  const f = [];
  if (!expected || typeof expected.available !== 'boolean' || !Array.isArray(expected.events) || !Number.isInteger(expected.nextOpen)) return ['erwarteter Zustand unlesbar'];
  if (!dom) return ['Block .q-now fehlt'];
  if (dom.loading) f.push('Platzhalter "wird geladen" steht noch');
  const events = Array.isArray(dom.eventItems) ? dom.eventItems : [];
  const nextLines = Array.isArray(dom.nextLines) ? dom.nextLines : [];
  const empty = Array.isArray(dom.empty) ? dom.empty : [];

  if (expected.available && expected.events.length > 0) {
    if (events.length !== expected.events.length) f.push('Ereignisse: ' + events.length + ' angezeigt, ' + expected.events.length + ' veroeffentlicht');
    events.forEach((e, i) => {
      if (blank(e.label)) f.push('Ereignis ' + (i + 1) + ' ohne Bezeichnung');
      if (blank(e.explanation)) f.push('Ereignis ' + (i + 1) + ' ohne Erklaerung');
      if (blank(e.date)) f.push('Ereignis ' + (i + 1) + ' ohne Datum');
      const want = expected.events[i] && expected.events[i].explanation;
      if (!blank(e.explanation) && typeof want === 'string' && e.explanation.trim() !== want.trim()) f.push('Ereignis ' + (i + 1) + ': Erklaerung weicht von der veroeffentlichten ab');
    });
    if (dom.none) f.push('Leerhinweis "keine neue Veraenderung" trotz veroeffentlichter Ereignisse');
    if (empty.length) f.push('Leerzustand trotz veroeffentlichter Ereignisse');
  } else if (expected.available) {
    if (events.length) f.push('Ereignisse angezeigt, obwohl keine veroeffentlicht sind');
    if (dom.none !== 1) f.push('Leerhinweis "keine neue Veraenderung" fehlt (' + dom.none + ' gefunden)');
    if (empty.length) f.push('Leerzustand "kein Radar-Stand" trotz verfuegbarem Radar');
  } else {
    if (events.length) f.push('Ereignisse angezeigt, obwohl der Radar nicht verfuegbar ist');
    if (dom.none) f.push('Leerhinweis "keine neue Veraenderung" obwohl der Radar nicht verfuegbar ist');
    if (nextLines.length === 0 && (empty.length !== 1 || blank(empty[0]))) f.push('Radar nicht verfuegbar, aber genau ein Leerzustand fehlt (' + empty.length + ' gefunden)');
  }

  if (expected.nextOpen > 0) {
    if (nextLines.length !== 1 || blank(nextLines[0])) f.push('Zeile "Naechster Schritt" fehlt, obwohl die API offene Bedingungen nennt (' + expected.nextOpen + ')');
  } else if (nextLines.length) f.push('Zeile "Naechster Schritt" angezeigt, obwohl die API keine offenen Bedingungen nennt');
  return f;
}
