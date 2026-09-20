/* =========================================================================
   VU SOCIAL — Messfenster und verzoegerte Messung (MW1–MW14)

   Social-Performance entsteht ueber Zeit. Eine Reichweite nach zehn
   Minuten ist keine kleine Reichweite — sie ist noch keine. Die Zahl ist
   richtig; sie beantwortet nur eine andere Frage als die gestellte.

   -------------------------------------------------------------------------
   WARUM DAS MEHR IST ALS EIN SCHOENHEITSFEHLER
   -------------------------------------------------------------------------

   Wer fruehe Zahlen ins Lernen laesst, vergleicht nicht Formate, sondern
   MESSZEITPUNKTE: jeder frisch gemessene Beitrag sieht schlechter aus
   als jeder aeltere, und das System schliesst daraus auf Formate,
   Uhrzeiten und Hooks. Es lernt dann zuverlaessig — und zuverlaessig das
   Falsche.

   -------------------------------------------------------------------------
   DER FEHLER, DEN MW7 FESTHAELT
   -------------------------------------------------------------------------

   Mein erster Entwurf speicherte ein Feld `mature` in der Datei. Das ist
   eine Momentaufnahme einer sich BEWEGENDEN Eigenschaft und damit von
   der Sekunde des Schreibens an potenziell falsch. Reife wird gerechnet,
   nicht nachgeschlagen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { snapshotAusBeitrag } from "../../scripts/social/ingest-performance.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MW = require("../engines/measurement-window.js");

const KONFIG = JSON.parse(
  readFileSync(join(ROOT, "social/config/measurement-windows.json"), "utf8"));

test("MW1 · Die vier Fenster liegen an ihren Grenzen", () => {
  assert.equal(MW.windowFor(0), "EARLY");
  assert.equal(MW.windowFor(23.9), "EARLY");
  assert.equal(MW.windowFor(24), "PRELIMINARY");
  assert.equal(MW.windowFor(71.9), "PRELIMINARY");
  assert.equal(MW.windowFor(72), "SETTLING");
  assert.equal(MW.windowFor(167.9), "SETTLING");
  assert.equal(MW.windowFor(168), "MATURE");
  assert.equal(MW.windowFor(10000), "MATURE");
});

test("MW2 · Reif ist erst MATURE", () => {
  assert.equal(MW.isMature(167.9), false);
  assert.equal(MW.isMature(168), true);
});

test("MW3 · Ein unbekanntes Alter ist kein Fenster", () => {
  /* "wir wissen nicht, wie alt" ist nicht dasselbe wie "ganz frisch".
     Die zweite Lesart wuerde eine Messung ohne Zeitstempel dauerhaft vom
     Lernen ausschliessen, ohne dass jemand den Grund sieht. */
  for (const wert of [null, undefined, NaN, Infinity, "alt"]) {
    assert.equal(MW.windowFor(wert), null, String(wert));
  }
});

test("MW4 · Ein unbekanntes Alter ist NICHT reif", () => {
  /* Die vorsichtige Lesart, und hier die richtige: eine Messung ins
     Lernen zu lassen, von der niemand weiss, ob sie zehn Minuten oder
     zehn Tage alt ist, gibt den ganzen Unterschied wieder auf. */
  for (const wert of [null, undefined, NaN]) {
    assert.equal(MW.isMature(wert), false, String(wert));
  }
});

test("MW5 · Die Konfiguration im Repository passt zu den Vorgaben", () => {
  /* Zwei Zahlenreihen fuer dieselbe Frage — hier wird gesichert, dass
     sie dasselbe sagen. */
  assert.equal(KONFIG.matureFromHours, 168);
  assert.deepEqual(KONFIG.windows.map((w) => w.id),
    ["EARLY", "PRELIMINARY", "SETTLING", "MATURE"]);
  for (const w of KONFIG.windows) {
    assert.ok(w.purpose && w.purpose.length > 20,
      w.id + " sagt nicht, wofuer es da ist");
  }
});

test("MW6 · Eine eigene Konfiguration schlaegt die Vorgabe", () => {
  const eigen = { windows: [{ id: "A", fromHours: 0 }, { id: "B", fromHours: 5 }],
    matureFromHours: 5 };
  assert.equal(MW.windowFor(4, eigen), "A");
  assert.equal(MW.windowFor(5, eigen), "B");
  assert.equal(MW.isMature(5, eigen), true);
});

/* ------------------------------------------------------------------ */
/* DIE INGESTION                                                       */
/* ------------------------------------------------------------------ */

function beitrag(timestamp) {
  return {
    mediaId: "17992767560843861",
    media: { mediaId: "1", permalink: "p", timestamp, mediaType: "IMAGE" },
    metrics: { reach: 100, likes: 10, comments: 1, saved: 0, shares: 0 },
    unanswered: [], metricsError: null,
    provenance: { source: "instagram.graph", fetchedAt: "2026-09-18T12:00:00Z", measured: true }
  };
}
const JETZT = "2026-09-18T12:00:00Z";

test("MW7 · Die Datei speichert KEINE Reife", () => {
  /* Der Fehler aus meinem ersten Entwurf. Ein gespeichertes `mature`
     waere eine Momentaufnahme einer sich bewegenden Eigenschaft: ein
     Beitrag, der bei der Messung vier Stunden alt war, stuende dort fuer
     immer als unreif — auch als Monat alter Beitrag. */
  const z = snapshotAusBeitrag(beitrag("2026-09-18T08:00:00+0000"), { now: JETZT });
  assert.equal(z.mature, undefined, "kein Feld `mature` an der Zeile");
  assert.equal(z.snapshot.mature, undefined, "und keines am Snapshot");
});

test("MW8 · Gespeichert wird das Fenster als Etikett der MESSUNG", () => {
  /* Das ist unveraenderlich und deshalb speicherbar: diese Messung wurde
     genommen, als der Beitrag vier Stunden alt war. Daran aendert
     spaeteres Vergehen von Zeit nichts. */
  const z = snapshotAusBeitrag(beitrag("2026-09-18T08:00:00+0000"), { now: JETZT });
  assert.equal(z.window, "EARLY");
  assert.equal(z.snapshot.window, "EARLY");
  assert.equal(z.snapshot.ageHours, 4);
});

test("MW9 · Reife laesst sich aus dem rechnen, was gespeichert ist", () => {
  const frisch = snapshotAusBeitrag(beitrag("2026-09-18T08:00:00+0000"), { now: JETZT });
  const alt = snapshotAusBeitrag(beitrag("2026-09-01T08:00:00+0000"), { now: JETZT });

  assert.equal(MW.isMature(frisch.snapshot.ageHours), false);
  assert.equal(MW.isMature(alt.snapshot.ageHours), true);
});

test("MW10 · VERIFIED heisst reif, STALE heisst noch im Wachstum", () => {
  assert.equal(snapshotAusBeitrag(beitrag("2026-09-18T08:00:00+0000"),
    { now: JETZT }).snapshot.state, "STALE");
  assert.equal(snapshotAusBeitrag(beitrag("2026-09-01T08:00:00+0000"),
    { now: JETZT }).snapshot.state, "VERIFIED");
});

test("MW11 · Eine 43 Stunden alte Messung ist NICHT verifiziert", () => {
  /* Die Grenze lag frueher bei 24 Stunden. Dazwischen waechst die
     Reichweite noch deutlich — und ein so bewerteter Beitrag sieht
     systematisch schlechter aus als ein aelterer. */
  const z = snapshotAusBeitrag(beitrag("2026-09-16T17:00:00+0000"), { now: JETZT });
  assert.equal(z.window, "PRELIMINARY");
  assert.equal(z.snapshot.state, "STALE");
});

/* ------------------------------------------------------------------ */
/* DIE NACHMESSUNG                                                     */
/* ------------------------------------------------------------------ */

const zeile = (publishedAt, window) => ({
  mediaId: "m1", publishedAt, snapshot: { window, ageHours: 1 }
});

test("MW12 · Faellig ist, wer das Fenster gewechselt hat", () => {
  /* Nicht nach festem Takt: ein fester Takt misst reife Beitraege ewig
     weiter und frische zu selten. */
  const faellig = MW.dueForRemeasurement(
    [zeile("2026-09-17T12:00:00Z", "EARLY")], "2026-09-19T12:00:00Z");
  assert.equal(faellig.length, 1);
  assert.equal(faellig[0].from, "EARLY");
  assert.equal(faellig[0].to, "PRELIMINARY");
});

test("MW13 · Wer reif gemessen ist, wird nicht weiter gemessen", () => {
  /* Das kostet Aufrufe und aendert nichts. Und Aufrufe sind hier keine
     abstrakte Groesse: das Subrequest-Budget des Workers ist der Grund,
     warum eine Messung schon einmal unvollstaendig war. */
  const faellig = MW.dueForRemeasurement(
    [zeile("2026-01-01T12:00:00Z", "MATURE")], "2026-09-19T12:00:00Z");
  assert.deepEqual(faellig, []);
});

test("MW14 · Im selben Fenster wird nicht nachgemessen", () => {
  const faellig = MW.dueForRemeasurement(
    [zeile("2026-09-19T08:00:00Z", "EARLY")], "2026-09-19T12:00:00Z");
  assert.deepEqual(faellig, []);
});
