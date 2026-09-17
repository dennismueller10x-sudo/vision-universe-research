/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/provider-lifecycle.test.mjs

   PR 101 meldete sechsmal STARTED und lieferte nie. Der Orchestrator
   stand still — nicht wegen des Anbieters, sondern weil es keinen
   Zustand fuer "nichts Beobachtbares im Fenster" gab.

   Diese Tests halten fest, was der Zustand sagt und was er
   ausdruecklich NICHT sagt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../engines/provider-lifecycle.js");
const Ledger = require("../engines/invocation-ledger.js");

/* ------------------------------------------------------------------ */
/* DIE FRIST                                                           */
/* ------------------------------------------------------------------ */

test("PL1 · Die Frist stammt aus einer Messung, nicht aus einer Konstante", () => {
  /* PR 98: STARTED 09:48:36Z, Result-Commit 09:54:21Z = 345 s. */
  assert.equal(L.REFERENZMESSUNGEN.length, 1);
  assert.equal(L.REFERENZMESSUNGEN[0].seconds, 345);
  assert.equal(L.sekundenZwischen("2026-09-17T09:48:36Z", "2026-09-17T09:54:21Z"), 345);
});

test("PL2 · Eine einzelne Messung ist keine Verteilung, und das steht dran", () => {
  const f = L.lease();
  assert.equal(f.regime, "BOOTSTRAP");
  assert.equal(f.sampleSize, 1);
  assert.equal(f.seconds, 3450);
  assert.match(f.explanation, /keine Verteilung|Nichtwissen/);
});

test("PL3 · Mehr Messungen verengen die Frist", () => {
  /* Der Sicherheitsfaktor ist Schutz gegen Nichtwissen. Wer mehr weiss,
     braucht weniger davon. */
  const eng = L.lease([300, 320, 345, 360, 310, 330, 355, 340, 305, 350]);
  assert.equal(eng.regime, "MATURE");
  assert.ok(eng.seconds < L.lease().seconds,
    "mehr Wissen fuehrte nicht zu einer engeren Frist");
});

test("PL4 · Ohne jede Messung wird nicht geraten", () => {
  const f = L.lease([]);
  assert.equal(f.regime, "BOOTSTRAP");
  const ohne = L.lease.call(null, []);
  assert.ok(ohne.seconds > 0);
});

test("PL5 · Die Frist unterschreitet nie den bekannten Erfolgsfall", () => {
  /* Ein Fenster, das den einzigen bekannten Erfolg abschneidet, misst
     nicht den Anbieter, sondern sich selbst. */
  const winzig = L.lease([1, 2, 3]);
  assert.ok(winzig.seconds >= L.MIN_LEASE_SEKUNDEN);
  assert.ok(L.MIN_LEASE_SEKUNDEN >= 2 * 345);
});

/* ------------------------------------------------------------------ */
/* DER ZUSTAND                                                         */
/* ------------------------------------------------------------------ */

test("PL6 · Der reale Fall PR 101 wird STALE_NO_RESULT", () => {
  const z = L.classify(
    { lastActivityAt: "2026-09-17T13:11:37Z", startedCount: 6 },
    { now: "2026-09-17T17:00:00Z" });
  assert.equal(z.state, "STALE_NO_RESULT");
  assert.equal(z.startedCount, 6);
});

test("PL7 · STALE_NO_RESULT blockiert den Graphen nicht", () => {
  /* Der Kern der Owner-Vorgabe: ein externer Agent darf den
     Orchestrator niemals unbegrenzt blockieren. */
  const z = L.classify(
    { lastActivityAt: "2026-09-17T13:11:37Z", startedCount: 6 },
    { now: "2026-09-17T17:00:00Z" });
  assert.equal(z.blocking, false);
  assert.equal(L.mayProceedWithout("STALE_NO_RESULT"), true);
});

test("PL8 · STALE_NO_RESULT ist NICHT endgueltig", () => {
  /* Es sagt, dass wir nichts gesehen haben — nicht, dass nichts kommt.
     Taucht spaeter doch ein Ergebnis auf, darf es verarbeitet werden. */
  assert.equal(L.TERMINAL.includes("STALE_NO_RESULT"), false);
  const z = L.classify({ lastActivityAt: "2026-09-17T13:11:37Z", startedCount: 6 },
    { now: "2026-09-17T17:00:00Z" });
  assert.equal(z.terminal, false);
});

test("PL9 · Innerhalb der Frist bleibt es IN_FLIGHT", () => {
  const z = L.classify(
    { lastActivityAt: "2026-09-17T13:11:37Z", startedCount: 6 },
    { now: "2026-09-17T13:30:00Z" });
  assert.equal(z.state, "IN_FLIGHT");
  assert.equal(z.blocking, true);
});

test("PL10 · Der Erfolgsfall PR 98 waere nie stale geworden", () => {
  /* Die Gegenprobe zur Frist: sie darf den bekannten Erfolg nicht
     abschneiden. */
  const z = L.classify(
    { lastActivityAt: "2026-09-17T09:48:36Z", startedCount: 1 },
    { now: "2026-09-17T09:54:21Z" });
  assert.equal(z.state, "IN_FLIGHT");
});

test("PL11 · Eine Aktivitaet in der Zukunft ist ein Datenfehler", () => {
  /* Ohne diese Pruefung faellt ein negatives Alter durch jeden
     Fristvergleich, und ein laengst stehengebliebener Lauf sieht aus
     wie ein frischer. Genau das passierte beim ersten Lauf gegen echte
     Daten, weil nachgetragene Eintraege erfundene Zeitstempel trugen. */
  const z = L.classify(
    { lastActivityAt: "2026-09-17T17:45:00Z", startedCount: 9 },
    { now: "2026-09-17T16:55:00Z" });
  assert.equal(z.state, "RECOVERY_REQUIRED");
  assert.match(z.explanation, /ZUKUNFT/);
});

test("PL12 · Ein gemeldeter Fehler ist etwas anderes als Schweigen", () => {
  /* Der Anbieter hat bisher keinen Fehlerkanal. Der Zustand existiert
     trotzdem — ein Zustandsraum, der den Fehlerfall nicht kennt, kann
     ihn beim ersten Auftreten wieder nicht darstellen. */
  const z = L.classify({ providerError: "quota exceeded", startedCount: 1,
    lastActivityAt: "2026-09-17T13:00:00Z" }, { now: "2026-09-17T17:00:00Z" });
  assert.equal(z.state, "PROVIDER_FAILED");
  assert.notEqual(z.state, "STALE_NO_RESULT");
});

test("PL13 · Der gluckliche Weg ist vollstaendig darstellbar", () => {
  const erwartet = ["REQUESTED", "INVOKED", "IN_FLIGHT", "RESULT_AVAILABLE",
    "INGESTED", "VERIFIED"];
  assert.deepEqual(L.VERLAUF, erwartet);
  for (const s of ["STALE_NO_RESULT", "PARTIAL_RESULT", "PROVIDER_FAILED",
                   "RESULT_INVALID", "RECOVERY_REQUIRED"]) {
    assert.ok(L.STATES.includes(s), s + " fehlt");
  }
});

test("PL14 · Teilergebnis und ungueltiges Ergebnis sind verschiedene Dinge", () => {
  const teil = L.classify({ partial: true, reason: "Asset abgeschnitten",
    lastActivityAt: "2026-09-17T13:00:00Z", startedCount: 1 }, { now: "2026-09-17T13:05:00Z" });
  assert.equal(teil.state, "PARTIAL_RESULT");

  const ungueltig = L.classify({ resultInvalid: true, reason: "hookIdMismatch",
    lastActivityAt: "2026-09-17T13:00:00Z", startedCount: 1 }, { now: "2026-09-17T13:05:00Z" });
  assert.equal(ungueltig.state, "RESULT_INVALID");
  assert.equal(ungueltig.terminal, true);
});

/* ------------------------------------------------------------------ */
/* DER LEDGER SPRICHT DIESELBE SPRACHE                                 */
/* ------------------------------------------------------------------ */

test("PL15 · Ledger und Lebenslauf teilen ein Vokabular", () => {
  /* Zwei Listen an zwei Orten haetten dasselbe Loch an zwei Stellen. */
  for (const s of L.STATES) assert.ok(Ledger.STATES.includes(s), s + " fehlt im Ledger");
  assert.equal(Ledger.TERMINAL.includes("STALE_NO_RESULT"), false);
});

test("PL16 · Der Ledger verschluckt die Beobachtungsherkunft nicht", () => {
  /* Die Weissliste in record() liess `observed` fallen. Sechs frisch
     eingelesene Meldungen zaehlten daraufhin als null. */
  const l = Ledger.createLedger([]);
  l.record({ processingKey: "k", state: "IN_FLIGHT", at: "2026-09-17T11:45:48Z",
    observed: true, deliveryId: "d1" });
  const e = l.all()[0];
  assert.equal(e.observed, true);
  assert.equal(e.timestampProvenance, "observed");

  l.record({ processingKey: "k", state: "IN_FLIGHT", at: "2026-09-17T11:00:00Z" });
  assert.equal(l.all()[1].observed, false);
  assert.equal(l.all()[1].timestampProvenance, "hand-entered-approximate");
});

/* ------------------------------------------------------------------ */
/* DIE SKALA MUSS ERREICHBAR SEIN                                      */
/* ------------------------------------------------------------------ */

test("PL17 · Das Regime kann BOOTSTRAP verlassen", () => {
  /* Die Frist kannte drei Stufen, aber nichts schrieb je eine neue
     Messung auf. Eine Skala mit drei Stufen, von denen zwei
     unerreichbar sind, ist keine Skala — dieselbe tote Dimension wie
     seinerzeit das fest verdrahtete timingKnowledge. */
  const l = Ledger.createLedger([], []);
  assert.equal(L.lease(l.latencies()).regime, "BOOTSTRAP");
  assert.equal(L.lease(l.latencies()).seconds, 3450);

  for (let i = 0; i < 12; i += 1) {
    l.recordLatency({ processingKey: "k" + i, seconds: 300 + i * 5 });
  }
  const reif = L.lease(l.latencies());
  assert.equal(reif.regime, "MATURE");
  assert.equal(reif.sampleSize, 12);
  assert.ok(reif.seconds < 3450, "mehr Wissen fuehrte nicht zu einer engeren Frist");
});

test("PL18 · Dieselbe Messung wird nicht zweimal gezaehlt", () => {
  /* Sonst zoege ein mehrfach eingelesenes Ergebnis die Stichprobe auf,
     ohne dass mehr gemessen worden waere. */
  const l = Ledger.createLedger([], []);
  assert.equal(l.recordLatency({ processingKey: "k", seconds: 345 }).written, true);
  const zweite = l.recordLatency({ processingKey: "k", seconds: 999 });
  assert.equal(zweite.written, false);
  assert.equal(zweite.reason, "alreadyMeasured");
  assert.deepEqual(l.latencies(), [345]);
});

test("PL19 · Unplausible Dauern werden nicht aufgeschrieben", () => {
  const l = Ledger.createLedger([], []);
  for (const s of [0, -5, NaN, null, "viel"]) {
    assert.equal(l.recordLatency({ processingKey: "k" + s, seconds: s }).written, false);
  }
  assert.deepEqual(l.latencies(), []);
});

test("PL20 · Die Messungen ueberleben einen Neustart", () => {
  /* Ohne das faellt die Frist bei jedem Lauf auf die eine
     Referenzmessung zurueck. */
  const a = Ledger.createLedger([], []);
  a.recordLatency({ processingKey: "k1", seconds: 320 });
  a.recordLatency({ processingKey: "k2", seconds: 360 });
  const schnappschuss = a.snapshot({ now: "2026-09-17T18:00:00Z" });

  const b = Ledger.createLedger(schnappschuss.entries, schnappschuss.latencyObservations);
  assert.deepEqual(b.latencies(), [320, 360]);
});

/* ------------------------------------------------------------------ */
/* DAS ZWEITE FENSTER                                                  */
/* ------------------------------------------------------------------ */

test("PL21 · Wer ewig neu anfaengt, laeuft trotzdem ab", () => {
  /* Der Kontrolllauf D3 hat den Fehler gezeigt: der Anbieter meldet im
     Backoff immer wieder STARTED, und jede Meldung setzt die Ruhe-Uhr
     zurueck. Mit nur einem Fenster waere er NIE stale geworden. PR 101
     wurde es nur, weil seine Wiederholungen nach sechs Versuchen
     aufhoerten - also aus Zufall und nicht aus Logik. */
  const frist = L.lease();

  /* Lebenszeichen alle 10 Minuten, seit vier Stunden. */
  const z = L.classify({
    firstActivityAt: "2026-09-17T14:00:00Z",
    lastActivityAt: "2026-09-17T17:55:00Z",
    startedCount: 20
  }, { now: "2026-09-17T18:00:00Z" });

  assert.equal(z.state, "STALE_NO_RESULT");
  assert.equal(z.window, "total");
  assert.ok(z.totalSeconds > frist.totalSeconds);
  assert.match(z.explanation, /faengt nicht endlos an/);
});

test("PL22 · Das Gesamtfenster ist weiter als eine beobachtete Backoff-Folge", () => {
  /* PR 101 lief ueber 86 Minuten Wiederholungen. Ein Gesamtfenster
     darunter haette mitten in einen noch laufenden Backoff
     hineingeschnitten. */
  const f = L.lease();
  assert.ok(f.totalSeconds > 86 * 60,
    "das Gesamtfenster schneidet eine beobachtete Wiederholungsfolge ab");
  assert.equal(f.totalFactor, 3);
});

test("PL23 · Innerhalb beider Fenster bleibt es IN_FLIGHT", () => {
  /* Der reale Stand von D3 kurz nach dem vierten STARTED. */
  const z = L.classify({
    firstActivityAt: "2026-09-17T17:16:36Z",
    lastActivityAt: "2026-09-17T17:45:03Z",
    startedCount: 4
  }, { now: "2026-09-17T18:00:00Z" });
  assert.equal(z.state, "IN_FLIGHT");
  assert.equal(z.window, "quiet");
});

test("PL24 · Das Ruhefenster wirkt weiterhin fuer sich", () => {
  /* PR 101: Wiederholungen hoerten auf, seither Stille. Das
     Gesamtfenster war da noch nicht ausgeschoepft - das Ruhefenster
     muss allein greifen. */
  const z = L.classify({
    firstActivityAt: "2026-09-17T11:45:48Z",
    lastActivityAt: "2026-09-17T13:11:37Z",
    startedCount: 6
  }, { now: "2026-09-17T14:30:00Z" });
  assert.equal(z.state, "STALE_NO_RESULT");
  assert.equal(z.window, "quiet");
});
