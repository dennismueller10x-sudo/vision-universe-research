/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/audience-fit.test.mjs

   Der Hook "47,6 % in 12 Monaten, aber nur 76 von 100: XOMs Staerke hat
   ein Gegengewicht." hat JEDES bestehende Tor bestanden: Evidenz
   gebunden, Marke 100, Komposition 96, Rubrik 10 von 10.

   Die bestehenden Tore pruefen, ob der Text zur EVIDENZ passt und ob er
   handwerklich taugt. Keines fragte, ob er zum PUBLIKUM passt. Ein
   System, das nur seine eigene Fragestellung optimiert, wird darin
   immer besser - und merkt nicht, dass die Frage die falsche war.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const A = require("../engines/audience-fit.js");

/* Die kuratierte Namensliste des Repositories - keine zweite Quelle. */
const NAMEN = JSON.parse(readFileSync(
  new URL("../../discover/config/company-names.json", import.meta.url), "utf8")).names;

const ECHTER_HOOK =
  "47,6 % in 12 Monaten, aber nur 76 von 100: XOMs Stärke hat ein Gegengewicht.";

test("AF1 · Der freigegebene Hook faellt durch - und zwar zweifach", () => {
  const r = A.check({ hook: ECHTER_HOOK, names: NAMEN });
  assert.equal(r.passed, false);
  const ids = r.findings.map((f) => f.id).sort();
  assert.deepEqual(ids, ["plainEntityName", "scaleSelfExplaining"]);
});

test("AF2 · Der Klarname steht im Repository, nicht in dieser Datei", () => {
  /* Eine zweite Tickerliste ginge irgendwann gegen die kuratierte
     auseinander, und dann meldete das Tor Namen, die es nicht gibt. */
  const t = A.unerklaerteKuerzel("XOMs Stärke", NAMEN);
  assert.equal(t.length, 1);
  assert.equal(t[0].ticker, "XOM");
  assert.match(t[0].plainName, /Exxon Mobil/);
});

test("AF3 · Steht der Name dabei, ist das Kuerzel erklaert", () => {
  assert.deepEqual(
    A.unerklaerteKuerzel("Exxon Mobil (XOM) legt zu", NAMEN), []);
});

test("AF4 · Ohne Namensliste wird kein Kuerzel erfunden", () => {
  /* Das Tor darf nicht raten, was ein Ticker sein koennte. Ohne
     Klarnamen gibt es nichts vorzuschlagen - und damit keinen Befund. */
  assert.deepEqual(A.unerklaerteKuerzel("XOMs Stärke", {}), []);
  assert.deepEqual(A.unerklaerteKuerzel("XOMs Stärke", null), []);
});

test("AF5 · KI und ETF sind keine unerklaerten Tickersymbole", () => {
  /* Die Gegenrichtung, und die gefaehrlichere: ein Tor, das jedes
     Grossbuchstabenwort meldet, wiese genau die Sprache zurueck, die es
     fordern soll. */
  const r = A.check({ hook: "KI-Aktien und ETF-Sparplaene: was 2026 zaehlt.",
    names: NAMEN });
  assert.equal(r.criteria.find((k) => k.id === "plainEntityName").passed, true);
});

test("AF6 · Eine Skala muss sagen, was sie misst", () => {
  const ohne = A.check({ hook: "Nur 76 von 100 für den Konzern.", names: NAMEN });
  assert.equal(ohne.criteria.find((k) => k.id === "scaleSelfExplaining").passed, false);

  const mit = A.check({
    hook: "Exxon Mobil erreicht 76 von 100 Punkten im Technik-Score.",
    names: NAMEN });
  assert.equal(mit.criteria.find((k) => k.id === "scaleSelfExplaining").passed, true);
});

test("AF7 · Ohne Skala im Einstieg wird nichts vorgeworfen", () => {
  const r = A.check({ hook: "Exxon Mobil legt seit zwölf Monaten kräftig zu.",
    names: NAMEN });
  assert.equal(r.criteria.find((k) => k.id === "scaleSelfExplaining").passed, true);
  assert.equal(r.passed, true, r.explanation);
});

test("AF8 · Fachjargon gehoert in die Story, nicht in den Einstieg", () => {
  /* Ausdruecklich kein Verbot: das Tor prueft nur die Flaeche, ueber
     die jemand stolpert, bevor er sich entschieden hat zu lesen. */
  const r = A.check({
    hook: "Die Schwankungsbreite von Exxon Mobil bleibt auffällig.",
    caption: "Die Volatilität lag im Perzentil 43 — das heißt: ruhiger als " +
      "bei mehr als der Hälfte der Vergleichswerte.",
    names: NAMEN });
  assert.equal(r.criteria.find((k) => k.id === "entryWithoutJargon").passed, false);
  /* Die Caption darf das - sie erklaert es sogar. */
  const tief = r.criteria.find((k) => k.id === "depthExplained");
  assert.ok(tief.detail.length > 0, "Die Tiefe traegt die Fachbegriffe.");
  assert.equal(tief.blocking, false);
});

test("AF9 · Ein Einstieg ohne Vorwissen besteht", () => {
  const r = A.check({
    hook: "Exxon Mobil ist in zwölf Monaten um 47,6 % gestiegen – und gilt " +
      "trotzdem nicht als Musterfall.",
    names: NAMEN });
  assert.equal(r.passed, true, r.explanation);
  assert.equal(r.met, r.total);
});

test("AF10 · Verstaendlich heisst nicht erfolgreich", () => {
  /* Ein verstaendlicher Hook ist nicht automatisch ein guter. Er ist
     einer, bei dem Erfolg ueberhaupt moeglich ist. Wer das verwechselt,
     lernt aus n=0 eine Regel. */
  const r = A.check({ hook: "Exxon Mobil legt zu.", names: NAMEN });
  assert.equal(r.predictsPerformance, false);
});

/* ------------------------------------------------------------------ */
/* DAS TOR HAENGT IN DER PIPELINE, NICHT DANEBEN                       */
/* ------------------------------------------------------------------ */

const Authoring = require("../engines/authoring.js");

test("AF11 · Ein uebersprungenes Tor ist kein bestandenes", () => {
  /* Dieselbe Regel wie fuer Marke und Fakten. Wer das Tor nicht
     uebergibt, bekommt es in gatesSkipped zu sehen - ein Gate, das
     niemand aufruft, waere Dekoration. */
  const v = Authoring.variant({ variantId: "v1", hook: "XOMs Stärke.",
    caption: "Text.", claims: [] });
  const ohne = Authoring.evaluate([v], {}, {});
  assert.ok(ohne[0].gatesSkipped.includes("audience-fit"));
  assert.ok(!ohne[0].gatesRun.includes("audience-fit"));
});

test("AF12 · Ein durchgefallener Einstieg laesst die Variante durchfallen", () => {
  const v = Authoring.variant({ variantId: "v1",
    hook: "47,6 % in 12 Monaten, aber nur 76 von 100: XOMs Stärke.",
    caption: "Text.", claims: [] });
  const mit = Authoring.evaluate([v], {},
    { audience: (x) => A.check({ hook: x.hook, caption: x.caption, names: NAMEN }) });
  assert.equal(mit[0].passed, false);
  assert.ok(mit[0].reasons.some((r) => r.gate === "audience-fit"));
  assert.ok(mit[0].gatesRun.includes("audience-fit"));
});

test("AF13 · Der Befund reist mit, nicht nur das Urteil", () => {
  /* Eine Variante, die nur "durchgefallen" meldet, zwingt zum Raten.
     Der Zaehler sagt, wie weit sie war. */
  const v = Authoring.variant({ variantId: "v1",
    hook: "Exxon Mobil legt in zwölf Monaten um 47,6 % zu.",
    caption: "Text.", claims: [] });
  const mit = Authoring.evaluate([v], {},
    { audience: (x) => A.check({ hook: x.hook, caption: x.caption, names: NAMEN }) });
  assert.equal(mit[0].audience.passed, true);
  assert.equal(mit[0].audience.met, mit[0].audience.total);
});
