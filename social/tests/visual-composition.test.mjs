/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/visual-composition.test.mjs

   Aus den Daten dieses Objekts wird sein Bild. Gerechnet wird gegen die
   ECHTE Kursreihe im Repository — ein Layout, das nur mit erfundenen
   Zahlen stimmt, ist keines.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../engines/visual-composition.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SERIE = JSON.parse(readFileSync(
  join(ROOT, "quant/data/market/discover-series/ref_XOM.json"), "utf8"));

const BEITRAEGE = [
  { label: "Trendstruktur", value: 27.35, max: 30 },
  { label: "Momentum", value: 15.54, max: 20 },
  { label: "Volumen", value: 5.86, max: 10 },
  { label: "Schwankungsbreite", value: 5, max: 10 },
  { label: "Setup", value: 13.44, max: 20 },
  { label: "Projektion", value: 8.8, max: 10 }
];

test("VC1 · Der Pfad entsteht aus der echten Reihe", () => {
  const k = C.chart({ points: SERIE.points });
  assert.equal(k.ok, true, k.explanation);
  assert.equal(k.points.length, SERIE.points.length);
  /* Der erste Punkt ganz links, der letzte ganz rechts — sonst waere
     der Zeitraum nicht der, der drunter steht. */
  assert.equal(k.points[0].x, 0);
  assert.ok(Math.abs(k.points[k.points.length - 1].x - k.width) < 0.01);
  /* Und die y-Achse ist nicht auf den Kopf gestellt: der Hoechstwert
     liegt OBEN, also bei kleinerem y. */
  const hoch = k.points.reduce((a, b) => (b.value > a.value ? b : a));
  const tief = k.points.reduce((a, b) => (b.value < a.value ? b : a));
  assert.ok(hoch.y < tief.y, "Die Kurve steht auf dem Kopf");
});

test("VC2 · Zwei Instrumente ergeben zwei verschiedene Bilder", () => {
  /* Das ist der Unterschied zwischen "individuell" und "aus einer
     Bibliothek gewaehlt". Dieselbe Strategie, andere Daten, anderer
     Pfad. */
  const a = C.chart({ points: SERIE.points });
  const b = C.chart({ points: SERIE.points.map(([d, v], i) => [d, v * (1 + i / 400)]) });
  assert.notEqual(a.path, b.path);
});

test("VC3 · Eine zu kurze Reihe wird nicht notduerftig gezeichnet", () => {
  const k = C.chart({ points: SERIE.points.slice(0, 5) });
  assert.equal(k.ok, false);
  assert.equal(k.reason, "tooFewPoints");
});

test("VC4 · Eine flache Reihe braucht kein Bild", () => {
  const flach = Array.from({ length: 40 }, (_, i) => ["2026-01-" + (i + 1), 100]);
  const k = C.chart({ points: flach });
  assert.equal(k.ok, false);
  assert.equal(k.reason, "flatSeries");
});

test("VC5 · Das Achsendatum ist oeffentlicher Text und damit deutsch", () => {
  /* In den Daten steht die Schreibweise, in der Maschinen sortieren.
     Auf dem Bild liest es ein Mensch. Die Quelle bleibt unveraendert. */
  const k = C.chart({ points: SERIE.points });
  assert.match(k.labels.start, /^\d{2}\.\d{2}\.\d{4}$/);
  assert.match(k.labels.startIso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(C.datumDe("2026-09-11"), "11.09.2026");
});

test("VC6 · Die Balkenlaenge ist der Anteil, nicht der Rohwert", () => {
  /* Sonst saehe ein Beitrag von 27 aus 30 kuerzer aus als einer von
     8,8 aus 10 — und das Bild sagte etwas Falsches ueber den Score. */
  const k = C.score({ total: 76, totalMax: 100, contributions: BEITRAEGE });
  assert.equal(k.ok, true, k.explanation);
  const trend = k.bars.find((b) => b.label === "Trendstruktur");
  const proj = k.bars.find((b) => b.label === "Projektion");
  assert.ok(trend.value > proj.value, "Vorbedingung: 27,35 > 8,8");
  assert.ok(trend.share > proj.share, "91 % muss laenger sein als 88 %");
  assert.ok(Math.abs(trend.share - 27.35 / 30) < 1e-9);
});

test("VC7 · Das Bild erzaehlt dieselbe Geschichte wie die Copy", () => {
  /* story-selection.js misst die Teile am Leitwert selbst. Das Bild
     benutzt dieselbe Regel — sonst waere rot markiert, was der Text
     nicht erwaehnt. */
  const k = C.score({ total: 76, totalMax: 100, contributions: BEITRAEGE });
  const ueber = k.bars.filter((b) => b.above).map((b) => b.label);
  assert.deepEqual(ueber.sort(), ["Momentum", "Projektion", "Trendstruktur"]);
  const unter = k.bars.filter((b) => b.above === false).map((b) => b.label);
  assert.ok(unter.includes("Schwankungsbreite"));
});

test("VC8 · Ein Score aus einem Beitrag ist keine Zerlegung", () => {
  const k = C.score({ total: 76, totalMax: 100, contributions: [BEITRAEGE[0]] });
  assert.equal(k.ok, false);
  assert.equal(k.reason, "tooFewContributions");
});

test("VC9 · Die Performance-Skala umfasst die Null", () => {
  /* Sonst zeigten negative und positive Balken in dieselbe Richtung. */
  const k = C.performance({ returns: [
    { label: "1M", value: -4.2 }, { label: "3M", value: 13.2 },
    { label: "12M", value: 47.6 }] });
  assert.equal(k.ok, true);
  assert.ok(k.domain.min <= 0 && k.domain.max >= 0);
  const negativ = k.bars.find((b) => b.label === "1M");
  const positiv = k.bars.find((b) => b.label === "12M");
  assert.equal(negativ.positive, false);
  assert.equal(positiv.positive, true);
  /* Der negative Balken liegt links der Nulllinie, der positive rechts. */
  assert.ok(negativ.from < k.zeroX + 0.01);
  assert.ok(positiv.to > k.zeroX);
});

test("VC10 · Der Vergleich sortiert und findet den eigenen Rang", () => {
  const k = C.comparison({ peers: [
    { label: "AAPL", value: 65 }, { label: "XOM", value: 76, highlight: true },
    { label: "MSFT", value: 61 }, { label: "JPM", value: 63 }] });
  assert.equal(k.ok, true);
  assert.equal(k.bars[0].label, "XOM");
  assert.equal(k.highlightRank, 1);
  assert.equal(k.bars[k.bars.length - 1].label, "MSFT");
});

test("VC11 · Ein Vergleich mit einem Wert ist keiner", () => {
  const k = C.comparison({ peers: [{ label: "XOM", value: 76 }] });
  assert.equal(k.ok, false);
  assert.equal(k.reason, "tooFewPeers");
});

test("VC12 · Fuer eine generative Strategie gibt es hier kein Layout", () => {
  /* Kein Fehler — eine Zustaendigkeitsgrenze. */
  const k = C.compose("FUTURE_TECH", {});
  assert.equal(k.ok, false);
  assert.equal(k.reason, "unsupportedStrategy");
});

/* ------------------------------------------------------------------ */
/* DER SATZ UNTER EINEM VERGLEICH                                      */
/* ------------------------------------------------------------------ */

test("VC13 · Zwei Werte bekommen ihren Abstand, keinen Rang", () => {
  /* Unter der fertigen Grafik stand "Rang 2 von 2 in diesem Lauf."
     Zwei Maengel in einem Satz: "Lauf" ist ein Begriff aus unserer
     Maschine, und ein Rang unter zwei Werten sagt nur, welcher der
     kleinere ist - das zeigen die Balken schon.

     Geprueft wird deshalb beides: dass der interne Begriff weg ist
     UND dass an seiner Stelle etwas Neues steht. Nur das Wort zu
     verbieten haette einen leeren Satz zugelassen. */
  const k = C.comparison({ einheit: "Punkte", peers: [
    { label: "S&P 500", value: 21.6, anzeige: "21,6" },
    { label: "Russell 2000", value: 13.4, anzeige: "13,4", highlight: true }] });
  assert.equal(k.ok, true);
  const satz = C.aussage(k, "KGV");
  assert.doesNotMatch(satz, /Lauf/);
  assert.doesNotMatch(satz, /Rang/);
  assert.match(satz, /S&P 500/);
  assert.match(satz, /Russell 2000/);
  /* 21,6 - 13,4 = 8,2, deutsch geschrieben und mit der Einheit. */
  assert.match(satz, /8,2 Punkte/);
});

test("VC14 · Ab drei Werten traegt die Rangfolge wieder, oeffentlich benannt", () => {
  const k = C.comparison({ peers: [
    { label: "AAPL", value: 65 }, { label: "XOM", value: 76 },
    { label: "MSFT", value: 61, highlight: true }] });
  const satz = C.aussage(k, "Score");
  assert.match(satz, /MSFT/);
  assert.match(satz, /Rang 3 von 3/);
  assert.doesNotMatch(satz, /Lauf/);
});

test("VC15 · Die Schreibweise der Quelle reist bis an den Balken", () => {
  /* Auf dem fertigen Bild stand "22" und "13" statt 21,6 und 13,4:
     der Zeichner rundete, weil die Zahl ohne ihre Schreibweise
     ankam. Eine gerundete Zahl ist eine andere Zahl - und sie steht
     unter dem Namen eines Gegenstands als dessen Wert. */
  const k = C.comparison({ peers: [
    { label: "S&P 500", value: 21.6, anzeige: "21,6" },
    { label: "Russell 2000", value: 13.4, anzeige: "13,4" }] });
  assert.equal(k.bars[0].anzeige, "21,6");
  assert.equal(k.bars[1].anzeige, "13,4");
  /* Und ohne Schreibweise: die Stellen aus den Werten, nicht geraten. */
  assert.equal(C.stellenAus([{ value: 21.6 }, { value: 13.4 }]), 1);
  assert.equal(C.stellenAus([{ value: 27.35 }, { value: 8 }]), 2);
  assert.equal(C.stellenAus([{ value: 21 }, { value: 13 }]), 0);
});
