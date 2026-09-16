/* =========================================================================
   VU SOCIAL — Performance-Ingestion (PI1–PI12)

   Die Stelle, an der gemessene Plattformzahlen zu Evidenz werden. Ein
   Fehler hier ist teurer als anderswo: eine falsch zugeordnete Zahl wird
   spaeter als Beleg fuer eine Strategieentscheidung zitiert.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ingest, snapshotAusBeitrag } from "../../scripts/social/ingest-performance.mjs";

const require = createRequire(import.meta.url);
const Performance = require("../engines/performance.js");

const JETZT = "2026-09-18T12:00:00Z";

function beitrag(overrides = {}) {
  return Object.assign({
    mediaId: "17992767560843861",
    media: { mediaId: "17992767560843861", permalink: "https://www.instagram.com/p/X/",
      timestamp: "2026-09-16T17:10:14+0000", mediaType: "IMAGE" },
    metrics: { reach: 412, likes: 23, comments: 4, saved: 7, shares: 2 },
    unanswered: [], metricsError: null,
    provenance: { source: "instagram.graph", fetchedAt: JETZT, measured: true }
  }, overrides);
}

test("PI1 · Instagram-Namen werden auf kanonische Namen abgebildet", () => {
  const z = snapshotAusBeitrag(beitrag(), { now: JETZT });
  assert.equal(z.snapshot.metrics.reach, 412);
  assert.equal(z.snapshot.metrics.likes, 23);
  assert.equal(z.snapshot.metrics.saves, 7, "saved -> saves");
  assert.equal(z.snapshot.metrics.shares, 2);
});

test("PI2 · Die Originalzahlen bleiben erhalten", () => {
  /* Beleg und Rueckfallebene. Ohne sie waere eine Korrektur der
     Zuordnung Datenverlust. */
  const z = snapshotAusBeitrag(beitrag(), { now: JETZT });
  assert.equal(z.snapshot.providerMetrics.saved, 7);
});

test("PI3 · Nicht gelieferte Kennzahlen stehen als null, nicht als 0", () => {
  const z = snapshotAusBeitrag(beitrag(), { now: JETZT });
  assert.equal(z.snapshot.metrics.views, null);
  assert.equal(z.snapshot.metrics.watchTimeSeconds, null);
  assert.notEqual(z.snapshot.metrics.views, 0);
});

test("PI4 · Die Interaktionsrate rechnet gegen die Reichweite", () => {
  /* Nicht gegen die Followerzahl: ein Beitrag, den 100 von 100
     Erreichten mochten, ist etwas anderes als einer, den 100 von
     10.000 mochten. */
  const z = snapshotAusBeitrag(beitrag(), { now: JETZT });
  assert.equal(z.snapshot.metrics.engagementRate, Math.round((36 / 412) * 10000) / 10000);
});

test("PI5 · Ohne Reichweite gibt es keine Rate — und keine Schaetzung", () => {
  const z = snapshotAusBeitrag(beitrag({ metrics: { likes: 23, comments: 4 } }), { now: JETZT });
  assert.equal(z.snapshot.metrics.engagementRate, null);
});

test("PI6 · Ein frischer Beitrag ist STALE, kein VERIFIED", () => {
  /* Eine Reichweite nach zehn Minuten ist kein Ergebnis, sondern ein
     Zwischenstand — Instagram traegt nach. */
  const z = snapshotAusBeitrag(
    beitrag({ media: { timestamp: "2026-09-18T11:30:00+0000", mediaType: "IMAGE" } }),
    { now: JETZT });
  assert.equal(z.snapshot.state, "STALE");
});

test("PI7 · Ein gereifter Beitrag ist VERIFIED", () => {
  const z = snapshotAusBeitrag(beitrag(), { now: JETZT });
  assert.equal(z.snapshot.state, "VERIFIED");
  assert.ok(z.snapshot.ageHours > 24);
});

test("PI8 · Ohne Zahlen wird nichts erfunden", () => {
  const z = snapshotAusBeitrag(
    beitrag({ metrics: null, metricsError: { reason: "objectNotFound" } }), { now: JETZT });
  assert.equal(z.snapshot.state, "UNAVAILABLE");
  assert.equal(z.snapshot.metrics.reach, null);
  assert.equal(z.snapshot.metrics.engagementRate, null);
});

test("PI9 · Nicht Messbares verschwindet nicht aus dem Bericht", () => {
  const e = ingest({ account: "visionuniverse.aktienreports", posts: [
    beitrag(), beitrag({ mediaId: "999", metrics: null, metricsError: { reason: "objectNotFound" } })
  ] }, { now: JETZT });

  assert.equal(e.requested, 2);
  assert.equal(e.measured, 1);
  assert.equal(e.unmeasured.length, 1, "der Fehlschlag steht ausdruecklich da");
  assert.equal(e.unmeasured[0].mediaId, "999");
});

test("PI10 · Die Snapshots taugen als Basis fuer den Performance Score", () => {
  /* Der eigentliche Zweck: die Ausgabe muss in performance.buildBaseline
     passen, sonst ist der Rueckweg an der naechsten Stelle unterbrochen. */
  const e = ingest({ posts: [beitrag()] }, { now: JETZT });
  const basis = Performance.buildBaseline(e.snapshots.map((z) => z.snapshot));
  assert.equal(basis.sampleSize, 1);
  assert.equal(basis.sufficient, false, "n=1 ist keine Basis — und sagt das auch");
  assert.match(basis.reason, /Nur 1 Beitraege/);
});

test("PI11 · Ein archivierter Beitrag ist ungemessen, nicht schlecht", () => {
  /* Der reale Fall dieses Projekts. Der eine veroeffentlichte Beitrag
     wurde vom Owner archiviert; die Graph API gibt ihn seitdem nicht
     mehr heraus:

       code 100, subcode 33, GraphMethodException
       "Object with ID ... does not exist, cannot be loaded due to
        missing permissions, or does not support this operation."

     Waere daraus eine Reichweite von 0 geworden, haette das System
     gelernt, dass dieses Format nicht funktioniert — aus einer Tatsache
     ueber die Sichtbarkeit einer API-Ressource. Das ist die teuerste
     Sorte stiller Fehler: sie sieht wie Evidenz aus. */
  const z = snapshotAusBeitrag({
    mediaId: "17992767560843861",
    media: null,
    mediaError: { reason: "providerError", metaCode: 100, metaSubcode: 33 },
    metrics: null,
    metricsError: { reason: "providerError", metaCode: 100, metaSubcode: 33,
      metaType: "GraphMethodException", fbtraceId: "AxlLTlX3ASySaPwgIL_qH2L" },
    provenance: { source: "instagram.graph", fetchedAt: JETZT, measured: false }
  }, { now: JETZT });

  assert.equal(z.snapshot.state, "UNAVAILABLE");
  assert.equal(z.snapshot.metrics.reach, null, "keine 0");
  assert.equal(z.snapshot.metrics.engagementRate, null);
  assert.equal(z.error.metaSubcode, 33, "die Ursache reist mit");
  assert.equal(z.error.fbtraceId, "AxlLTlX3ASySaPwgIL_qH2L",
    "ohne fbtrace_id ist eine Rueckfrage bei Meta wertlos");
});

test("PI12 · Ein unmessbarer Beitrag gelangt nicht in die Vergleichsbasis", () => {
  /* Die Folge von PI11 eine Stufe weiter: buildBaseline filtert
     Snapshots ohne Metriken nicht selbst heraus — der Zyklus tut es,
     indem er UNAVAILABLE aussortiert. Dieser Test haelt fest, dass die
     Aussortierung noetig IST, damit sie nicht jemand als ueberfluessig
     entfernt. */
  const e = ingest({ posts: [
    beitrag(),
    beitrag({ mediaId: "999", metrics: null, metricsError: { reason: "providerError" } })
  ] }, { now: JETZT });

  const alle = e.snapshots.map((z) => z.snapshot);
  const nurGemessene = alle.filter((s) => s.state !== "UNAVAILABLE");

  assert.equal(alle.length, 2);
  assert.equal(nurGemessene.length, 1);
  assert.equal(Performance.buildBaseline(nurGemessene).sampleSize, 1);
  assert.equal(Performance.buildBaseline(alle).sampleSize, 2,
    "ungefiltert zaehlte der unmessbare Beitrag mit — genau deshalb wird gefiltert");
});
