/* =========================================================================
   DER ZUSTAND, DER KEINEN NAMEN HATTE

   45 geholt, 6.831 stillschweigend uebersprungen, Kurse drei Sitzungen
   alt - und der Lauf meldete Erfolg. Diese Tests halten fest, dass genau
   dieser Zustand jetzt FAIL heisst, und dass ein normaler Tag weiter
   gruen bleibt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const H = require(join(root, "quant", "engines", "daily-lifecycle-health.js"));

const lage = (over) => Object.assign({
  hasStatus: true, universe: 6876, checked: 6876, deferred: 0, requests: 6876,
  openRejections: 0, sessionsBehind: 0, asOf: "2026-09-17", expectedSession: "2026-09-17"
}, over || {});

test("DLH-1 · der Vorfall vom 18.09.2026 ist FAIL", () => {
  const r = H.beurteile(lage({ checked: 45, deferred: 6831, requests: 45,
                               openRejections: 6831, sessionsBehind: 2, asOf: "2026-09-15" }));
  assert.equal(r.verdict, "FAIL");
  assert.ok(r.reasons.some((g) => /nur 45 von 6876/.test(g)), r.reasons.join(" | "));
  assert.ok(r.reasons.some((g) => /2 Sitzungen zurueck/.test(g)), r.reasons.join(" | "));
});

test("DLH-2 · ein vollstaendiger Lauf auf der letzten Sitzung ist PASS", () => {
  assert.equal(H.beurteile(lage()).verdict, "PASS");
});

test("DLH-3 · ein groesserer Rueckstand im Universum ist WARNING, kein Abbruch", () => {
  const r = H.beurteile(lage({ checked: 5800, deferred: 1076, requests: 5800 }));
  assert.equal(r.verdict, "WARNING");
});

test("DLH-4 · eine Sitzung zurueck ist WARNING, zwei sind FAIL", () => {
  assert.equal(H.beurteile(lage({ sessionsBehind: 1, asOf: "2026-09-16" })).verdict, "WARNING");
  assert.equal(H.beurteile(lage({ sessionsBehind: 2, asOf: "2026-09-15" })).verdict, "FAIL");
});

test("DLH-5 · ein Register, das die Mehrheit des Universums sperrt, ist FAIL", () => {
  const r = H.beurteile(lage({ openRejections: 4000 }));
  assert.equal(r.verdict, "FAIL");
  assert.ok(r.reasons.some((g) => /offene Ablehnungen/.test(g)));
});

test("DLH-6 · ohne Statusbericht gibt es kein Gruen", () => {
  assert.equal(H.beurteile(lage({ hasStatus: false })).verdict, "FAIL");
});

test("DLH-7 · ein unlesbarer Datenstand ist WARNING - nicht stillschweigend gruen", () => {
  const r = H.beurteile(lage({ sessionsBehind: null, asOf: null }));
  assert.equal(r.verdict, "WARNING");
});

test("DLH-8 · zurueckgestellte Titel zaehlen NICHT als geprueft", () => {
  /* Der Kern des Vorfalls: 'uebersprungen' ist kein Ergebnis. */
  const r = H.beurteile(lage({ checked: 45, deferred: 6831 }));
  assert.equal(r.verdict, "FAIL");
  assert.ok(r.checkedShare < 0.01);
});
