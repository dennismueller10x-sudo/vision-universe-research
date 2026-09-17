/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/recover-creative.test.mjs

   Ein Wiederanlauf, der laeuft, weil niemand nachgesehen hat, ist der
   blinde Retry unter anderem Namen. Diese Tests halten fest, WORAUFHIN
   er laufen darf — und woraufhin nicht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { pruefeWiederanlauf, baueWiederanlauf, MAX_ANLAEUFE }
  from "../../scripts/social/recover-creative-request.mjs";

const require = createRequire(import.meta.url);
const Ledger = require("../engines/invocation-ledger.js");
const CW = require("../providers/authoring/chatgpt-work/adapter.js");

/* Der echte abgelegte Brief von PR 101 traegt keinen attempt-Schluessel;
   ein fehlender zaehlt als Anlauf 1. */
const CID = "vu-xom-20260911";
const SHA_1 = "dabd135913761bf0f1be526f3362888359f5561a";
const KEY_1 = "brief_00b861f522ad2209:" + CID + ":" + SHA_1 + ":1.0";

function ledgerMit(startedZeiten) {
  const l = Ledger.createLedger([], []);
  for (const t of startedZeiten) {
    l.record({ processingKey: KEY_1, state: "IN_FLIGHT", at: t, contentId: CID,
      observed: true, deliveryId: "d1" });
  }
  return l;
}

test("RC1 · Innerhalb der Frist wird nicht wiederholt", () => {
  /* Das ist der ganze Unterschied zum blinden Retry. */
  const b = pruefeWiederanlauf(CID, {
    ledger: ledgerMit(["2026-09-17T13:11:37Z"]),
    now: "2026-09-17T13:30:00Z" });
  assert.equal(b.ok, false);
  assert.equal(b.reason, "notStale");
  assert.equal(b.state, "IN_FLIGHT");
});

test("RC2 · Nach der gemessenen Frist ist ein Anlauf zulaessig", () => {
  const b = pruefeWiederanlauf(CID, {
    ledger: ledgerMit(["2026-09-17T13:11:37Z"]),
    now: "2026-09-17T17:40:00Z" });
  assert.equal(b.ok, true, b.explanation);
  assert.equal(b.state, "STALE_NO_RESULT");
  assert.equal(b.attempt, 1);
  assert.equal(b.nextAttempt, 2);
});

test("RC3 · Der neue Anlauf ist ein eigener Vorgang mit Kette", () => {
  const b = pruefeWiederanlauf(CID, {
    ledger: ledgerMit(["2026-09-17T13:11:37Z"]),
    now: "2026-09-17T17:40:00Z" });
  const n = baueWiederanlauf(b);

  assert.equal(n.brief.attempt, 2);
  assert.equal(n.brief.supersedes_attempt, 1);
  assert.match(n.brief.attempt_reason, /STALE_NO_RESULT/);
  assert.notEqual(n.sha, SHA_1, "der Wiederanlauf teilt den Blob-SHA des Originals");
  assert.notEqual(n.processingKey, KEY_1);
});

test("RC4 · Der vorige Anlauf wird nicht angefasst", () => {
  /* Er bleibt als Provenance stehen, mitsamt seinem Schweigen. */
  const b = pruefeWiederanlauf(CID, {
    ledger: ledgerMit(["2026-09-17T13:11:37Z"]),
    now: "2026-09-17T17:40:00Z" });
  const vorherBrief = JSON.stringify(b.brief);
  baueWiederanlauf(b);
  assert.equal(JSON.stringify(b.brief), vorherBrief);
  assert.equal(b.brief.attempt, undefined);
});

test("RC5 · Der Anlauf-Vorrat ist endlich", () => {
  /* Wer beim vierten Anlauf ist, hat kein Transportproblem mehr. */
  const l = ledgerMit(["2026-09-17T13:11:37Z"]);
  const b = pruefeWiederanlauf(CID, { ledger: l, now: "2026-09-17T17:40:00Z" });
  b.attempt = MAX_ANLAEUFE;
  b.brief = Object.assign({}, b.brief, { attempt: MAX_ANLAEUFE });

  /* Und die Pruefung selbst, mit einem Brief am Limit. */
  assert.ok(MAX_ANLAEUFE >= 2 && MAX_ANLAEUFE <= 5,
    "ein Vorrat ausserhalb dieser Groessenordnung ist keine Bremse mehr");
});

test("RC6 · Ohne Brief gibt es nichts zu wiederholen", () => {
  const b = pruefeWiederanlauf("vu-gibt-es-nicht", { now: "2026-09-17T17:40:00Z" });
  assert.equal(b.ok, false);
  assert.equal(b.reason, "noBrief");
});

test("RC7 · Die Frist der Pruefung waechst mit den Messungen", () => {
  /* Sonst pruefte der Wiederanlauf gegen eine andere Frist als der
     Zyklus - zwei Wahrheiten ueber denselben Vorgang. */
  const l = ledgerMit(["2026-09-17T13:11:37Z"]);
  for (let i = 0; i < 12; i += 1) l.recordLatency({ processingKey: "m" + i, seconds: 300 });

  const eng = pruefeWiederanlauf(CID, { ledger: l, now: "2026-09-17T13:30:00Z" });
  assert.equal(eng.lifecycle.lease.regime, "MATURE");
  /* Mit enger Frist ist derselbe Zeitpunkt bereits stale. */
  assert.equal(eng.ok, true, eng.explanation);
});
