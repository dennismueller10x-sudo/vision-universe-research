/* =========================================================================
   VU SOCIAL — Performance-Ingestion (PI1–PI12)

   Die Stelle, an der gemessene Plattformzahlen zu Evidenz werden. Ein
   Fehler hier ist teurer als anderswo: eine falsch zugeordnete Zahl wird
   spaeter als Beleg fuer eine Strategieentscheidung zitiert.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ingest, merge, snapshotAusBeitrag } from "../../scripts/social/ingest-performance.mjs";

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

test("PI13 · Die Reel-Verweildauer kommt in Sekunden an, nicht in Millisekunden", () => {
  /* Instagram meldet ig_reels_avg_watch_time in Millisekunden; das
     kanonische Feld ist in Sekunden. Eine Zahl, die um den Faktor 1000
     danebenliegt, faellt in einem Median nicht auf — sie verschiebt ihn
     nur, und niemand merkt es. */
  const z = snapshotAusBeitrag(beitrag({
    metrics: { reach: 24, likes: 4, comments: 0, saved: 0, shares: 0,
      ig_reels_avg_watch_time: 3510, ig_reels_video_view_total_time: 91261 }
  }), { now: JETZT });

  assert.equal(z.snapshot.metrics.watchTimeSeconds, 3.51);
  assert.equal(z.snapshot.providerMetrics.ig_reels_avg_watch_time, 3510,
    "der Rohwert bleibt als Beleg erhalten");
});

test("PI14 · Die Abschlussrate wird NICHT geschaetzt", () => {
  /* Sie waere Verweildauer geteilt durch Videolaenge, und die Laenge
     liefert diese Abfrage nicht. Eine geschaetzte Quote ginge als
     Retention in die Strategie ein und waere dort nicht mehr von einer
     gemessenen zu unterscheiden. */
  const z = snapshotAusBeitrag(beitrag({
    metrics: { reach: 24, likes: 4, ig_reels_avg_watch_time: 3510 }
  }), { now: JETZT });
  assert.equal(z.snapshot.metrics.completionRate, null);
});


/* =========================================================================
   PI15–PI22 — DAS ZUSAMMENFUEHREN

   Der Anlass ist kein gedachter: am 16.09. um 17:59 lagen 16 gemessene
   Beitraege in social/data/performance.json, um 18:05 nur noch 12. Kein
   Fehler, kein roter Lauf — die zweite Ingestion erreichte wegen eines
   zu klein gerechneten Budgets weniger und schrieb die Datei neu.

   Ein Lauf, der weniger sieht, ist ein schmalerer Blick auf dieselbe
   Welt. Er ist kein Loeschauftrag.
   ========================================================================= */

const SPAETER = "2026-09-19T12:00:00Z";

function lauf(beitraege, now = JETZT) {
  return ingest({ account: "visionuniverse.aktienreports", accountId: "1784140",
    posts: beitraege }, { now });
}

function gemessen(id, reach) {
  return beitrag({ mediaId: id, media: { mediaId: id, permalink: "https://x.invalid/" + id,
    timestamp: "2026-09-01T10:00:00+0000", mediaType: "IMAGE" },
    metrics: { reach, likes: 4, comments: 0, saved: 0, shares: 0 } });
}

function ungemessen(id, reason) {
  return beitrag({ mediaId: id, media: { mediaId: id, permalink: "https://x.invalid/" + id,
    timestamp: "2026-09-01T10:00:00+0000", mediaType: "IMAGE" },
    metrics: null, metricsError: { reason },
    provenance: { source: "instagram.graph", fetchedAt: SPAETER, measured: false } });
}

test("PI15 · Ein schmalerer Lauf loescht keine Messung", () => {
  /* Genau der Vorfall. Ohne diesen Test waere er wieder moeglich. */
  const bestand = lauf([gemessen("a", 10), gemessen("b", 20), gemessen("c", 30), gemessen("d", 40)]);
  assert.equal(bestand.measured, 4);

  const schmal = lauf([gemessen("a", 11), gemessen("b", 21)], SPAETER);
  assert.equal(schmal.measured, 2, "der Lauf selbst sieht wirklich nur zwei");

  const zusammen = merge(bestand, schmal, { now: SPAETER });
  assert.equal(zusammen.measured, 4, "der Bestand bleibt vier");
  assert.equal(zusammen.run.measured, 2, "was DIESER Lauf schaffte, bleibt sichtbar");
  assert.equal(zusammen.run.carriedOver, 2);
});

test("PI16 · Die juengere Messung gewinnt", () => {
  const bestand = lauf([gemessen("a", 10)]);
  const neu = lauf([gemessen("a", 99)], SPAETER);
  const zusammen = merge(bestand, neu, { now: SPAETER });

  assert.equal(zusammen.snapshots.length, 1);
  assert.equal(zusammen.snapshots[0].snapshot.metrics.reach, 99);
  assert.ok(!zusammen.snapshots[0].carriedOver, "eine frische Messung ist nicht uebernommen");
});

test("PI17 · Ein neues Scheitern gewinnt NICHT gegen eine vorhandene Messung", () => {
  /* Dass die Abfrage heute misslang, macht die Zahl von gestern nicht
     falsch. Der Beitrag als UNAVAILABLE zu fuehren waere eine Aussage
     ueber den Beitrag statt ueber die Abfrage. */
  const bestand = lauf([gemessen("a", 10)]);
  const neu = lauf([ungemessen("a", "graphError")], SPAETER);
  const zusammen = merge(bestand, neu, { now: SPAETER });

  const z = zusammen.snapshots[0];
  assert.equal(z.snapshot.metrics.reach, 10);
  assert.notEqual(z.snapshot.state, "UNAVAILABLE");
  assert.equal(z.carriedOver, true);
  assert.equal(z.lastAttemptAt, SPAETER);
  assert.equal(z.lastAttemptReason, "graphError");
  assert.equal(zusammen.measured, 1);
  assert.equal(zusammen.run.measured, 0, "der Lauf hat nichts gemessen, und das steht da");
});

test("PI18 · Eine uebernommene Zahl behaelt ihr Alter", () => {
  /* capturedAt ist der Zeitpunkt der Messung, nicht des Schreibens. Eine
     uebernommene Zahl mit neuem Datum waere eine Faelschung des Alters —
     und Alter entscheidet hier darueber, ob VERIFIED oder STALE gilt. */
  const bestand = lauf([gemessen("a", 10)]);
  const vorher = bestand.snapshots[0].snapshot.capturedAt;
  const zusammen = merge(bestand, lauf([ungemessen("a", "x")], SPAETER), { now: SPAETER });

  assert.equal(zusammen.snapshots[0].snapshot.capturedAt, vorher);
  assert.notEqual(zusammen.snapshots[0].snapshot.capturedAt, SPAETER);
});

test("PI19 · Wonach ein Lauf gar nicht fragt, verschwindet nicht", () => {
  /* Ein kuerzeres Zeitfenster ist kein Loeschgrund. */
  const bestand = lauf([gemessen("a", 10), gemessen("b", 20)]);
  const zusammen = merge(bestand, lauf([gemessen("a", 11)], SPAETER), { now: SPAETER });

  const ids = zusammen.snapshots.map((z) => z.mediaId).sort();
  assert.deepEqual(ids, ["a", "b"]);
  const b = zusammen.snapshots.find((z) => z.mediaId === "b");
  assert.equal(b.carriedOver, true);
  assert.equal(b.notRequestedAt, SPAETER, "warum es bleibt, steht dabei");
});

test("PI20 · Ein neuer Beitrag kommt hinzu, ohne die alten zu verdraengen", () => {
  const bestand = lauf([gemessen("a", 10)]);
  const zusammen = merge(bestand, lauf([gemessen("a", 11), gemessen("neu", 5)], SPAETER),
    { now: SPAETER });

  assert.equal(zusammen.measured, 2);
  assert.equal(zusammen.requested, 2);
  assert.equal(zusammen.run.measured, 2);
  assert.equal(zusammen.run.carriedOver, 0);
});

test("PI21 · Ein nie gemessener Beitrag bleibt ungemessen — ohne Erfindung", () => {
  const bestand = lauf([ungemessen("a", "archiviert")]);
  const zusammen = merge(bestand, lauf([ungemessen("a", "archiviert")], SPAETER), { now: SPAETER });

  assert.equal(zusammen.measured, 0);
  assert.equal(zusammen.snapshots[0].snapshot.state, "UNAVAILABLE");
  assert.equal(zusammen.unmeasured.length, 1);
  assert.equal(zusammen.unmeasured[0].reason, "archiviert");
});

test("PI22 · Das Zusammenfuehren ist wiederholbar ohne Wirkung", () => {
  /* Zweimal derselbe Lauf darf nicht zu doppelten Zeilen fuehren — der
     Workflow laeuft oefter als die Zahlen sich aendern. */
  const bestand = lauf([gemessen("a", 10), gemessen("b", 20)]);
  const eins = merge(bestand, lauf([gemessen("a", 10), gemessen("b", 20)], SPAETER), { now: SPAETER });
  const zwei = merge(eins, lauf([gemessen("a", 10), gemessen("b", 20)], SPAETER), { now: SPAETER });

  assert.equal(zwei.snapshots.length, 2);
  assert.deepEqual(zwei.snapshots.map((z) => z.mediaId).sort(), ["a", "b"]);
  assert.equal(zwei.measured, 2);
});
