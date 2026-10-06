/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/german-text.test.mjs

   Zwei Richtungen, und die zweite ist die wichtigere.

   Dass "traegt" repariert wird, ist der Anlass. Dass "dauert",
   "neue" und "Feuer" unangetastet bleiben, ist die Bedingung, unter
   der die Reparatur ueberhaupt laufen darf: ein Werkzeug, das
   richtiges Deutsch kaputtmacht, waere schlimmer als das Problem.

   Und eine dritte Eigenschaft, die keine der beiden ist: was das
   Woerterbuch nicht kennt, wird gemeldet statt geraten. Die alte
   Wortliste hat geschwiegen, wo sie nichts wusste. Dieses Schweigen
   hat "traegt" durchgelassen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const G = require("../engines/german-text.js");
const Brand = require("../engines/brand.js");

/* ------------------------------------------------------------------ */
/* WAS REPARIERT WIRD                                                  */
/* ------------------------------------------------------------------ */

test("GT1 · Der Satz aus den Quant-Daten wird deutsch", () => {
  assert.equal(
    G.normalize("TREND_STRUCTURE traegt 27.35 von 30 Punkten bei."),
    "TREND_STRUCTURE trägt 27.35 von 30 Punkten bei.");
});

test("GT2 · Die Grossschreibung des Vorbilds bleibt erhalten", () => {
  assert.equal(G.normalize("Staerke"), "Stärke");
  assert.equal(G.normalize("staerke"), "stärke");
});

test("GT3 · Die -taet-Endung ist produktiv und braucht kein Wort im Buch", () => {
  /* Volatilitaet, Qualitaet, Liquiditaet, Rentabilitaet: die Sprache
     bildet diese Woerter beliebig neu. Eine Liste kaeme nie hinterher. */
  assert.equal(G.normalize("Volatilitaet"), "Volatilität");
  assert.equal(G.normalize("Liquiditaet"), "Liquidität");
  assert.equal(G.normalize("Rentabilitaet"), "Rentabilität");
  assert.equal(G.normalize("Qualitaeten"), "Qualitäten");
});

test("GT4 · Zahlen, Kennungen und Einheiten bleiben unberuehrt", () => {
  const ein = "SMA50 ueber SMA200 (2.68 ATR), TREND_STRUCTURE, 27.35 %";
  const aus = G.normalize(ein);
  assert.equal(aus, "SMA50 über SMA200 (2.68 ATR), TREND_STRUCTURE, 27.35 %");
  assert.deepEqual(ein.match(/[0-9.]+/g), aus.match(/[0-9.]+/g));
});

/* ------------------------------------------------------------------ */
/* WAS NICHT ANGETASTET WIRD                                           */
/* ------------------------------------------------------------------ */

test("GT5 · Echtes Deutsch mit denselben Buchstabenfolgen bleibt stehen", () => {
  /* Jedes "au"+"e" und jedes "eu"+"e" erzeugt die Folge "ue", ohne
     dass je ein Umlaut gemeint war. Eine Regel ueber Digraphen
     wuerde hier reihenweise Woerter zerstoeren. */
  const echt = "Die neue Steuer dauert an, genauer gesagt seit Feuer, " +
    "Abenteuer und Frauen auf der Mauer.";
  assert.equal(G.normalize(echt), echt);
  assert.deepEqual(G.residue(echt), []);
});

test("GT6 · Fremdwoerter mit ue bleiben stehen", () => {
  const echt = "Das Duett ist aktuell, die Statue ein Kontinuum.";
  assert.equal(G.normalize(echt), echt);
  assert.deepEqual(G.residue(echt), []);
});

test("GT6b \u00b7 Die qu-Klasse ist kein Umlaut", () => {
  /* "Request" hat die Pruefung als Umschrift gemeldet — q+u+e ergibt
     dieselbe Buchstabenfolge. Frequenz, Sequenz und konsequent sind
     deutsche Woerter derselben Klasse. */
  const echt = "Der Request nennt Frequenz und Sequenz, konsequent gemessen.";
  assert.deepEqual(G.residue(echt), []);
  assert.equal(G.normalize(echt), echt);

  /* Und die Gegenprobe: "guenstig" ist keine qu-Klasse. */
  assert.deepEqual(G.residue("guenstig"), ["guenstig"]);
});

test("GT7 · Bereits richtiges Deutsch aendert sich nicht", () => {
  const richtig = "Der Wert beschreibt die Lage — nicht ihre Ursache. " +
    "Für jeden Titel gilt dasselbe Verfahren.";
  assert.equal(G.normalize(richtig), richtig);
  assert.deepEqual(G.residue(richtig), []);
});

/* ------------------------------------------------------------------ */
/* WAS GEMELDET WIRD                                                   */
/* ------------------------------------------------------------------ */

test("GT8 · Unbekannte Umschrift wird gemeldet, nicht geraten", () => {
  const rest = G.residue("Ein voellig unbekanntes Wort: Schoenwetterlage.");
  assert.deepEqual(rest, ["voellig", "Schoenwetterlage"]);
});

test("GT9 · Was das Woerterbuch repariert hat, bleibt nicht im Rest", () => {
  const r = G.clean("Relative Staerke nicht verfuegbar, Kurs ueber SMA50.");
  assert.match(r.text, /Stärke nicht verfügbar/);
  assert.deepEqual(r.residue, []);
});

test("GT10 · Kennungen in Grossbuchstaben sind keine Prosa", () => {
  /* TREND_STRUCTURE, VALUE, PROJECTION_AUXILIARY: wer so schreibt,
     meint einen Schluessel und keinen Umlaut. */
  assert.deepEqual(G.residue("TREND_STRUCTURE und VALUE_QUEUE"), []);
});

/* ------------------------------------------------------------------ */
/* DAS TOR                                                             */
/* ------------------------------------------------------------------ */

test("GT11 · Das Marken-Tor blockiert jetzt auch, was keine Liste kannte", () => {
  /* Der eigentliche Grund fuer diese Datei: "traegt" stand in keiner
     Wortliste und kam aus den Quant-Daten in den Entwurf. */
  const res = Brand.check({
    hook: "XOM im Technical Opportunity Score.",
    caption: "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei. Keine Anlageberatung."
  });
  assert.equal(res.passed, false);
  const ids = res.blocking.map((b) => b.id);
  assert.ok(ids.includes("transliterated-umlauts"));
  assert.match(res.blocking.find((b) => b.id === "transliterated-umlauts").message,
    /traegt/);
});

test("GT12 · Derselbe Satz in deutscher Schreibung besteht", () => {
  const res = Brand.check({
    hook: "XOM im Technical Opportunity Score.",
    caption: "TREND_STRUCTURE trägt 27.35 von 30 Punkten bei. Keine Anlageberatung."
  });
  const ids = res.blocking.map((b) => b.id);
  assert.ok(!ids.includes("transliterated-umlauts"));
});

test("GT20 · Produktive Staemme decken jede Beugung ab", () => {
  /* Das Woerterbuch aus exakten Wortformen war zu klein. Aufgefallen
     ist es an einem simulierten Ergebnis mit "moeglichen",
     "ausschoepft" und "zwoelf" — Alltagswoertern, die residue()
     pflichtgemaess meldete und die damit jede Variante blockierten.
     Eine Liste aller Beugungen waere nie fertig geworden. */
  const t = "Der Trend schoepft 27,35 von 30 moeglichen Punkten aus. " +
    "In zwoelf Monaten hoeher, die Pruefung bestaetigt das.";
  const n = G.normalize(t);
  assert.match(n, /schöpft/);
  assert.match(n, /möglichen/);
  assert.match(n, /zwölf/);
  assert.match(n, /höher/);
  assert.match(n, /Prüfung/);
  assert.deepEqual(G.residue(n), []);
});

test("GT21 · Ein Stamm greift nur, wo er in echtem Deutsch nie steht", () => {
  /* Aufgenommen wird ein Stamm nur, wenn die ASCII-Folge in echtem
     Deutsch NIE vorkommt — sonst raet er, und Raten ist genau das, was
     diese Datei nicht tut. */
  const echt = ["Die neue Steuer dauert an.", "Frauen und Feuer, genauer betrachtet.",
    "Ein aktuelles Duett im Kontinuum.", "Die Frequenz ist konsequent.",
    "Silhouette und Poesie.", "Koexistenz und Aerodynamik.", "Michael und Israel."];
  echt.forEach((t) => assert.equal(G.normalize(t), t,
    "echtes Deutsch veraendert: " + t));
});

test("GT22 · Bezeichner bleiben unberuehrt", () => {
  /* Staemme ersetzen INNERHALB eines Worts. Genau deshalb duerfen sie
     Bezeichner nicht sehen: aus "vu-pruef-test" wuerde sonst
     "vu-pr<ue>f-test", und eine Kennung, die sich beim Durchreichen
     aendert, ist keine mehr. */
  ["https://research.visionuniverse.de/assets/social/pkg.jpg",
   "vu-xom-20260911-rev1", "authoring/requests/vu-pruef-test",
   "brief_00b861f_pruef"].forEach((id) =>
    assert.equal(G.normalize(id), id, "Bezeichner veraendert: " + id));
});

test("GT23 · Der reale englische Quelltitel wird als Kontamination erkannt", () => {
  /* Owner-Direktive "WEB-FIRST + FULL-POST-GENERATION" (24.09.), §5.1 —
     realer Befund: cand_20260924_d052c375 trug diesen Titel woertlich
     als Hook. */
  const treffer = G.englischeKontamination(
    "10-year U.S. Treasury yield tops 5.1%, marking its highest level since 2007.");
  assert.deepEqual(treffer, ["its", "since"]);
});

test("GT24 · Echtes Deutsch meldet keine englische Kontamination", () => {
  const t = "Die Rendite zehnjaehriger US-Staatsanleihen steigt ueber 5,1 Prozent — " +
    "das hoechste Niveau seit 2007. Fuer Anleger zaehlt jetzt die Richtung.";
  assert.deepEqual(G.englischeKontamination(t), []);
});

test("GT25 · Eigennamen und Ticker allein loesen keinen Treffer aus", () => {
  assert.deepEqual(G.englischeKontamination(
    "MSFT und der S&P 500 legten am Freitag zu."), []);
});
