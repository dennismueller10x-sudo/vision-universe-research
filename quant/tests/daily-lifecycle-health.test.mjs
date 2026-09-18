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

/* =========================================================================
   EIN FELDNAME IST EINE BEHAUPTUNG

   Der Recovery-Lauf 35349647216 holte 66 Minuten lang Kurse, bestand
   jede Pruefung - und scheiterte an der Regressionssuite, weil das
   Gesundheitsurteil ein Feld `rejectionLedger.open` trug. In einem
   ausgelieferten Artefakt ist `open` der Eroeffnungskurs; die
   Hygienepruefung liest es genau so und kann einer Zahl nicht ansehen,
   ob sie ein Kurs oder eine Anzahl offener Ablehnungen ist. Der
   Feldname war der Fehler, nicht die Pruefung.

   Dieser Test haelt die Regel fest, nicht den einen Namen: kein Feld in
   diesem Artefakt darf so heissen wie ein Kursniveau. Die Liste ist
   dieselbe wie in scripts/market/assert-public-data-hygiene.mjs.
   ========================================================================= */
const KURSNIVEAU_NAMEN = new Set([
  "close", "open", "high", "low",
  "adjustedClose", "adjustedOpen", "adjustedHigh", "adjustedLow",
  "adjClose", "adjOpen", "adjHigh", "adjLow",
  "sma20", "sma50", "sma100", "sma200",
  "high52w", "low52w", "price", "last", "previousClose", "referencePrice"
]);

function kursnamen(wert, pfad, gefunden) {
  if (!wert || typeof wert !== "object") return gefunden;
  if (Array.isArray(wert)) {
    wert.forEach((x, i) => kursnamen(x, pfad + "[" + i + "]", gefunden));
    return gefunden;
  }
  for (const [name, kind] of Object.entries(wert)) {
    if (KURSNIVEAU_NAMEN.has(name) && typeof kind === "number") gefunden.push(pfad + "." + name);
    else kursnamen(kind, pfad + "." + name, gefunden);
  }
  return gefunden;
}

test("DLH-9 · das Gesundheitsurteil traegt kein Feld, das wie ein Kursniveau heisst", () => {
  /* Das vollstaendig gefuellte Register, so wie es der Ingest liefert -
     der Fall, in dem der Verstoss ueberhaupt erst entstehen kann. */
  const artefakt = Object.assign({}, H.beurteile(lage({ checked: 45, deferred: 6831, requests: 45,
                                                        openRejections: 6831, sessionsBehind: 2,
                                                        asOf: "2026-09-15" })), {
    rejectionLedger: { offen: 6831, PERMANENT_REJECT: 3, TEMPORARY_REJECT: 6828, STALE_REJECT: 0 },
    openRejections: 6831
  });
  const treffer = kursnamen(artefakt, "", []);
  assert.deepEqual(treffer, [], "Kursniveau-Namen im Gesundheitsurteil: " + treffer.join(", "));
});

test("DLH-10 · ein Register mit `open` wuerde auffallen - der Waechter selbst ist scharf", () => {
  /* Die Gegenprobe: waere der alte Name noch da, meldete der Test ihn.
     Ohne sie waere DLH-9 auch dann gruen, wenn die Suche nichts kann. */
  const treffer = kursnamen({ rejectionLedger: { open: 6831 } }, "", []);
  assert.deepEqual(treffer, [".rejectionLedger.open"]);
});
