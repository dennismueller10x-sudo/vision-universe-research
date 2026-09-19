/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/score-decomposition.test.mjs

   "Die Schwankungsbreite traegt nur 5 von 10 bei und BEGRENZT DAMIT den
   Gesamtwert auf 76 von 100."

   Jede Zahl darin ist belegt. Der Satz ist trotzdem falsch, und zwar
   an der Stelle, an der keine Zahl steht: bei "damit". Die
   Faktenpruefung konnte das nicht finden - sie fragt, ob eine Zahl in
   der Evidenz steht, und das tat jede. Ein Pruefer kann nur finden,
   was er berechnen kann.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const D = require("../engines/score-decomposition.js");

const EVIDENZ = [
  { id: "score", statement: "Technical Opportunity Score 76 von 100." },
  { id: "c-trend", statement: "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei." },
  { id: "c-mom", statement: "MOMENTUM traegt 15.54 von 20 Punkten bei." },
  { id: "c-vol", statement: "VOLUME traegt 5.86 von 10 Punkten bei." },
  { id: "c-vola", statement: "VOLATILITY traegt 5 von 10 Punkten bei." },
  { id: "c-setup", statement: "SETUP traegt 13.44 von 20 Punkten bei." },
  { id: "c-proj", statement: "PROJECTION_AUXILIARY traegt 8.8 von 10 Punkten bei." }
];

const Z = D.zerlege(EVIDENZ);

test("SD1 · Die Zerlegung kommt aus den Belegen, nicht aus einer zweiten Tabelle", () => {
  assert.equal(Z.parts.length, 6);
  assert.equal(Z.complete, true, "Die Teile ergeben zusammen 100.");
  assert.ok(Math.abs(Z.total - 75.99) < 0.01);
  assert.ok(Math.abs(Z.gap - 24.01) < 0.01);
  /* Der Leitwert selbst ist KEIN Beitrag und darf nicht mitzaehlen. */
  assert.ok(!Z.parts.some((p) => p.evidenceId === "score"));
});

test("SD2 · Groesster Verlust und niedrigste Ausschoepfung sind zwei Fragen", () => {
  /* Und sie haben hier verschiedene Antworten - genau deshalb reicht
     es nicht, "die schwaechste Komponente" zu sagen und zu meinen,
     das sei dieselbe wie "die teuerste". */
  assert.equal(Z.largestLoss.component, "SETUP");
  assert.ok(Math.abs(Z.largestLoss.lost - 6.56) < 0.01);
  assert.equal(Z.lowestRatio.component, "VOLATILITY");
  assert.equal(Z.lowestRatio.ratio, 0.5);
});

test("SD3 · Eine unvollstaendige Zerlegung meldet sich als unvollstaendig", () => {
  /* Fehlt eine Komponente, ist jede Aussage ueber "die Luecke" eine
     ueber einen Ausschnitt - und darf nicht klingen wie eine ueber
     das Ganze. */
  const teil = D.zerlege(EVIDENZ.filter((e) => e.id !== "c-setup"));
  assert.equal(teil.complete, false);
  assert.equal(teil.parts.length, 5);
});

/* ------------------------------------------------------------------ */
/* DIE ZUSCHREIBUNG                                                    */
/* ------------------------------------------------------------------ */

test("SD4 · Der reale Satz faellt durch - mit der gemessenen Deckung", () => {
  const b = D.pruefeZuschreibung(
    "Die Trendstruktur erreicht 27,35 von 30, doch die Schwankungsbreite " +
    "traegt nur 5 von 10 bei und begrenzt damit den Gesamtwert auf 76 von 100.", Z);
  assert.equal(b.applicable, true);
  assert.equal(b.ok, false);
  assert.ok(b.coverage < 0.35, "Genannt sind rund 32 % der Luecke.");
  assert.match(b.explanation, /SETUP mit 6\.56/);
});

test("SD5 · Ohne Ursachenbehauptung wird nichts vorgeworfen", () => {
  /* Aufzaehlen ist erlaubt. Die Rubrik missbilligt es an anderer
     Stelle, aber es ist nicht FALSCH - und dieses Tor darf nur
     falsche Zuschreibungen finden, nicht schwache Texte. */
  const b = D.pruefeZuschreibung(
    "Die Trendstruktur erreicht 27,35 von 30, die Schwankungsbreite 5 von 10. " +
    "Der Gesamtwert betraegt 76 von 100.", Z);
  assert.equal(b.applicable, false);
  assert.equal(b.ok, true);
});

test("SD6 · Eine Zuschreibung, die die Luecke mehrheitlich deckt, besteht", () => {
  /* Die Gegenrichtung: ein Tor, das JEDE Ursachenbehauptung
     zurueckweist, verboete den Spannungsbogen, um den es geht. */
  const b = D.pruefeZuschreibung(
    "Setup, Schwankungsbreite und Momentum verlieren zusammen Punkte und " +
    "begrenzen damit den Gesamtwert auf 76 von 100.", Z);
  assert.equal(b.applicable, true);
  assert.equal(b.ok, true, b.explanation);
  assert.ok(b.coverage > 0.6);
});

test("SD7 · Der Leser nennt keine Bezeichner - die Bruecke traegt trotzdem", () => {
  /* Die Caption sagt "Schwankungsbreite", nie VOLATILITY. Ohne diese
     Zuordnung koennte keine Pruefung sehen, wovon der Text spricht. */
  assert.deepEqual(D.genannt("nur die Schwankungsbreite", Z).map((x) => x.component),
    ["VOLATILITY"]);
  assert.deepEqual(D.genannt("das Volumen und der Aufbau", Z)
    .map((x) => x.component).sort(), ["SETUP", "VOLUME"]);
  assert.deepEqual(D.genannt("nichts davon", Z), []);
});

/* ------------------------------------------------------------------ */
/* ZWEI ZU WEITE STELLEN, DIE DEN FALL DURCHLIESSEN                    */
/* ------------------------------------------------------------------ */

const ECHT = "Die Auflösung liegt im Gegengewicht: Die Trendstruktur erreicht " +
  "27,35 von 30, doch die Schwankungsbreite trägt nur 5 von 10 bei und " +
  "begrenzt damit den Gesamtwert auf 76 von 100. Die 12M-Entwicklung von " +
  "47,6 % beschreibt den bisherigen Verlauf; sie ist keine Prognose. " +
  "Stand: 11.09.2026, Quelle: Tiingo. Keine Anlageberatung.";

test("SD8 · \"Entwicklung\" ist kein Synonym fuer den MOMENTUM-Beitrag", () => {
  /* Der erste Entwurf fuehrte "entwicklung" als Lesernamen. Damit
     zaehlte "Die 12M-Entwicklung von 47,6 %" als Nennung des
     MOMENTUM-BEITRAGS - zwei verschiedene Dinge: eine Kursveraenderung
     und ein Punktebeitrag von 15,54 von 20. Der fehlerhafte Satz kam
     so auf 50,4 % und bestand knapp. Eine zu weite Bruecke ist hier
     schlimmer als gar keine. */
  assert.deepEqual(D.genannt("Die 12M-Entwicklung von 47,6 %", Z), []);
  assert.deepEqual(D.genannt("Das Momentum erreicht 15,54 von 20", Z)
    .map((x) => x.component), ["MOMENTUM"]);
});

test("SD9 · Gezaehlt wird der Satz, der die Ursache behauptet", () => {
  /* Zuerst zaehlte die ganze Caption. Damit half jede Komponente mit,
     die irgendwo spaeter vorkam - drei Saetze weiter, in voellig
     anderem Zusammenhang. Eine Zuschreibung findet in EINEM Satz
     statt. */
  const satz = D.satzMitUrsache(ECHT);
  assert.match(satz, /begrenzt damit/);
  assert.doesNotMatch(satz, /Prognose/, "Nur der eine Satz, nicht die Caption.");
});

test("SD10 · Der real ausgelieferte Satz faellt durch", () => {
  const b = D.pruefeZuschreibung(ECHT, Z);
  assert.equal(b.ok, false);
  assert.deepEqual(b.named.sort(), ["TREND_STRUCTURE", "VOLATILITY"]);
  assert.ok(b.coverage < 0.35, "32 %, nicht 50,4 %.");
});
