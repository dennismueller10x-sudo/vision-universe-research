/* =========================================================================
   VU SOCIAL — Das Invocation Ledger (IL1–IL12)

   -------------------------------------------------------------------------
   DER BEWEISSTATUS, DEN DER OWNER GENANNT HAT
   -------------------------------------------------------------------------

   Im realen Proof wurde KEIN rekursiver Result-Commit beobachtet. Die
   verfuegbare Schnittstelle liefert aber keine vollstaendige
   Run-Historie. Damit gilt LOOP_PROTECTION_OPERATIONALLY_SUPPORTED und
   ausdruecklich NICHT FORMALLY_EXHAUSTIVE_RUN_COUNT_PROVEN.

   "Wir haben keine Rekursion gesehen" und "es kann keine geben" sind
   zwei verschiedene Aussagen. Nur die zweite erlaubt es,
   Schutzschichten wegzulassen — und sie liegt nicht vor.

   Eine einzelne Schicht wegzulassen, weil die anderen schon greifen,
   ist genau die Rechnung, die bei einem unbewiesenen Loop nicht aufgeht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const IL = require("../engines/invocation-ledger.js");

const K = "brief-1:content-1:sha-1:1.0";

test("IL1 · Ein unbekannter Schluessel darf angestossen werden", () => {
  assert.equal(IL.createLedger([]).mayInvoke(K).ok, true);
});

test("IL2 · Ein laufender Schluessel wird nicht erneut angestossen", () => {
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "REQUESTED", at: "2026-09-17T10:00:00Z" });
  const d = l.mayInvoke(K, { now: "2026-09-17T10:05:00Z" });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "inFlight");
});

test("IL3 · Ein zu lange offener Lauf wird trotzdem NICHT wiederholt", () => {
  /* Die verfuehrerische Stelle. Ein haengender Lauf sieht aus wie
     einer, den man neu starten sollte — und ob der Agent noch arbeitet,
     weiss niemand ohne nachzusehen. Ein zweiter Anstoss koennte ein
     zweites Ergebnis erzeugen. */
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "IN_FLIGHT", at: "2026-09-17T10:00:00Z" });
  const d = l.mayInvoke(K, { now: "2026-09-17T20:00:00Z" });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "staleInFlight");
  assert.match(d.message, /NICHT erneut angestossen/);
});

test("IL4 · Ein fertiges Ergebnis wird wiederverwendet, nicht neu erzeugt", () => {
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "COMPLETED", at: "2026-09-17T10:30:00Z" });
  const d = l.mayInvoke(K);
  assert.equal(d.reason, "completed");
  assert.match(d.message, /wiederverwendet/);
});

test("IL5 · Ein fertiges Ergebnis wird NIE ueberschrieben", () => {
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "COMPLETED", at: "a" });
  const r = l.record({ processingKey: K, state: "REQUESTED", at: "b" });
  assert.equal(r.written, false);
  assert.equal(r.reason, "terminal");
  assert.equal(l.get(K).state, "COMPLETED");
});

test("IL6 · Der abgewiesene Versuch wird trotzdem festgehalten", () => {
  /* Ein Ledger, das Versuche verschweigt, beantwortet die Frage nicht
     mehr, wie oft etwas lief — und genau die ist hier offen. */
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "COMPLETED", at: "a" });
  l.record({ processingKey: K, state: "REQUESTED", at: "b" });
  assert.equal(l.countFor(K), 2);
  assert.equal(l.all()[1].rejectedWrite, true);
});

test("IL7 · Eine Wiederholung nach Zurueckweisung braucht eine neue Revision", () => {
  /* Sonst entstuenden dieselben Kennungen fuer anderen Text — und genau
     das darf nie passieren. */
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "REJECTED", at: "a" });
  const d = l.mayInvoke(K);
  assert.equal(d.reason, "rejected");
  assert.match(d.message, /neue Brief-Revision/);
});

test("IL8 · RECOVERY_REQUIRED ist keine Einladung zum zweiten Versuch", () => {
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "RECOVERY_REQUIRED", at: "a" });
  const d = l.mayInvoke(K);
  assert.equal(d.reason, "recovery");
  assert.match(d.message, /Entscheidung/);
});

test("IL9 · Ein anderer Schluessel ist ein anderer Lauf", () => {
  const l = IL.createLedger([]);
  l.record({ processingKey: K, state: "COMPLETED", at: "a" });
  assert.equal(l.mayInvoke("brief-1:content-1:sha-2:1.0").ok, true,
    "eine neue Brief-Revision darf laufen");
});

test("IL10 · Unbekannte Zustaende werden abgelehnt", () => {
  assert.throws(() => IL.createLedger([]).record({ processingKey: K, state: "VIELLEICHT" }),
    /unbekannter Zustand/);
});

test("IL11 · Der Beweisstatus reist mit den Daten", () => {
  /* Wer sie spaeter liest, soll nicht annehmen muessen, was sie wert
     sind. */
  const s = IL.createLedger([]).snapshot({ now: "2026-09-17T12:00:00Z" });
  assert.equal(s.loopProtection, "LOOP_PROTECTION_OPERATIONALLY_SUPPORTED");
  assert.match(s.loopProtectionNote, /NICHT erreicht/);
  assert.match(s.loopProtectionNote, /Schutzschichten bleiben aktiv/);
});

test("IL12 · Der Snapshot behauptet nicht mehr, als bewiesen ist", () => {
  const s = IL.createLedger([]).snapshot({});
  assert.ok(!/FORMALLY_EXHAUSTIVE_RUN_COUNT_PROVEN\s*$/.test(s.loopProtection));
  assert.notEqual(s.loopProtection, "FORMALLY_EXHAUSTIVE_RUN_COUNT_PROVEN");
});
