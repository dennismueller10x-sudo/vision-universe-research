/* =========================================================================
   social/tests/evidence-shape.test.mjs

   WERTE AUF EINER ACHSE — UND JEDER BEI SEINEM GEGENSTAND

   Diese Datei entstand aus einem Patch, der zurueckgenommen wurde. Der
   Versuch war, die zweite Evidenz in die Datenkarte zu setzen: die
   Karte zeigt EINEN Namen und EINE Zahl, also waere der S&P-Wert unter
   dem Namen RUSSELL 2000 gelandet. Technisch einwandfrei, inhaltlich
   falsch, und auf einem Bild nicht mehr einzufangen.

   evidence-shape.js gibt es, damit Werte ihre Gegenstaende nie
   verlieren. Die Tests hier pruefen genau das - nicht, ob die Funktion
   laeuft, sondern ob ein Wert je ohne seinen Gegenstand herauskommt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ES = require("../engines/evidence-shape.js");

const KGV = [
  { metric: "KGV", value: 13.4, unit: "", entity: "Russell 2000", source: "vu.technical" },
  { metric: "KGV", value: 21.6, unit: "", entity: "S&P 500", source: "vu.technical" }
];

test("ES1 · Eine Achse gibt Paare zurueck, nie eine Zahlenliste", () => {
  const a = ES.aufEinerAchse(KGV);
  assert.ok(a);
  assert.equal(a.metrik, "KGV");
  a.werte.forEach((w) => {
    assert.ok(w.entitaet, "Ein Wert ohne Gegenstand: " + JSON.stringify(w));
    assert.equal(typeof w.wert, "number");
  });
});

test("ES2 · Der Wert des einen steht nie beim Namen des anderen", () => {
  /* Der Fehler, gegen den diese Datei gebaut ist, in einem Satz. */
  const a = ES.aufEinerAchse(KGV);
  const nach = {};
  a.werte.forEach((w) => { nach[w.entitaet] = w.wert; });
  assert.equal(nach["Russell 2000"], 13.4);
  assert.equal(nach["S&P 500"], 21.6);
});

test("ES3 · Ein einzelner Gegenstand ist noch kein Vergleich", () => {
  assert.equal(ES.aufEinerAchse([KGV[0]]), null);
});

test("ES4 · Zwei Kennzahlen sind zwei Achsen, nicht eine", () => {
  const gemischt = KGV.concat([
    { metric: "Dividendenrendite", value: 1.2, entity: "S&P 500" }]);
  const a = ES.aufEinerAchse(gemischt);
  assert.equal(a.metrik, "KGV");
  assert.equal(a.werte.length, 2);
});

test("ES5 · Derselbe Gegenstand zweimal ist eine Wiederholung", () => {
  const doppelt = [KGV[0], { metric: "KGV", value: 99, entity: "russell 2000" },
    KGV[1]];
  const a = ES.aufEinerAchse(doppelt);
  assert.equal(a.werte.length, 2);
  /* Die erste Nennung gilt - nicht die groessere Zahl. */
  assert.equal(a.werte[0].wert, 13.4);
});

test("ES6 · Die Schreibweise der Quelle bleibt, wo es eine gibt", () => {
  /* "184,20" ist nicht "184,2". Wer die Zahl neu schreibt, aendert
     sie - und im Kurs eines Papiers ist die letzte Stelle eine
     Aussage, keine Formatierung. */
  const a = ES.aufEinerAchse([
    { metric: "Kurs", value: "184,20", entity: "AAPL" },
    { metric: "Kurs", value: "97,05", entity: "XOM" }]);
  assert.equal(a.werte[0].anzeige, "184,20");
  assert.equal(a.werte[0].wert, 184.2);
  const peers = ES.alsPeers(a, "AAPL");
  assert.equal(peers[0].anzeige, "184,20");
  assert.equal(peers[0].highlight, true);
  assert.equal(peers[1].highlight, false);
});

test("ES7 · Ein Gegenstand ausserhalb der Reihe faerbt keinen Balken", () => {
  /* Einen falschen Balken zu faerben waere schlimmer als keinen. */
  const peers = ES.alsPeers(ES.aufEinerAchse(KGV), "NASDAQ 100");
  assert.equal(peers.some((p) => p.highlight), false);
});

test("ES8 · Der Kontrast nennt beide Gegenstaende mit ihren eigenen Werten", () => {
  const k = ES.alsKontrast(ES.aufEinerAchse(KGV));
  assert.equal(k.eines, "Russell 2000");
  assert.equal(k.wertEines, 13.4);
  assert.equal(k.anderes, "S&P 500");
  assert.equal(k.wertAnderes, 21.6);
});

test("ES9 · Ein Beleg ohne Gegenstand oder ohne Zahl zaehlt nicht mit", () => {
  /* Unbekannt als Null zu fuehren ist in diesem Projekt eine eigene
     Fehlerfamilie. Hier heisst unbekannt: kommt nicht in die Achse. */
  const a = ES.aufEinerAchse(KGV.concat([
    { metric: "KGV", value: 17.0, entity: "" },
    { metric: "KGV", value: null, entity: "NASDAQ 100" }]));
  assert.equal(a.werte.length, 2);
});

test("ES10 · Die Untergrenze ist dieselbe wie die der Zeichnung", () => {
  /* Etwas einen Vergleich zu nennen, den visual-composition.js danach
     ablehnt, waere zwei Begriffe von derselben Sache. */
  const VC = require("../engines/visual-composition.js");
  assert.equal(ES.MINDEST_GEGENSTAENDE, VC.MINDEST.vergleichswerte);
});
