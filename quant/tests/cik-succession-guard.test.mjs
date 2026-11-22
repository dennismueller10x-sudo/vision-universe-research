/* CIK-Nachfolge-Regel (scripts/universe/lib/cik-succession-guard.mjs, Steuerung 22.11.2026).
   Spielzeugdaten, keine Live-Artefakte (TI-1). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardNewIssuerAttachments, PENDING } from "../../scripts/universe/lib/cik-succession-guard.mjs";

const C1 = "0000000001", C2 = "0000000002", C3 = "0000000003";
function fresh() {
  return new Map([
    ["OLDA", { cik: C1, status: "RESOLVED" }],   // Vorgaenger, im Produkt
    ["NEWA", { cik: C1, status: "RESOLVED" }],   // Nachfolger mit Registereintrag
    ["OLDB", { cik: C2, status: "RESOLVED" }],
    ["NEWB", { cik: C2, status: "RESOLVED" }],   // neues Kuerzel ohne Registereintrag
    ["FRSH", { cik: C3, status: "RESOLVED" }],   // neuer Emittent
    ["CLSA", { cik: C2, status: "RESOLVED" }],   // Aktienklasse, schon vorher an C2
    ["REUS", { cik: C1, status: "RESOLVED" }]    // Kuerzel neu vergeben: vorher andere CIK
  ]);
}
const previous = {
  OLDA: { cik: C1, status: "RESOLVED" }, OLDB: { cik: C2, status: "RESOLVED" },
  CLSA: { cik: C2, status: "RESOLVED" }, REUS: { cik: "0000000009", status: "RESOLVED" }
};
const product = ["OLDA", "NEWA", "OLDB", "NEWB", "FRSH", "CLSA", "REUS"];
const successions = [{ fromTicker: "OLDA", toTicker: "NEWA", cik: C1, effective: "2026-10-01" }];

test("CG-1: registrierter Nachfolger behaelt die CIK, unbelegtes Kuerzel wird PENDING", () => {
  const by = fresh();
  const g = guardNewIssuerAttachments({ byTicker: by, previous, productTickers: product, successions });
  assert.equal(by.get("NEWA").cik, C1);
  assert.deepEqual(g.registered.map((r) => r.ticker), ["NEWA"]);
  assert.equal(by.get("NEWB").cik, null);
  assert.equal(by.get("NEWB").status, PENDING);
  assert.deepEqual(by.get("NEWB").candidates, [C2]);
  assert.deepEqual(by.get("NEWB").heldBy, ["CLSA", "OLDB"]);
});

test("CG-2: neuer Emittent und bestehende Aktienklasse bleiben unberuehrt", () => {
  const by = fresh();
  guardNewIssuerAttachments({ byTicker: by, previous, productTickers: product, successions });
  assert.equal(by.get("FRSH").cik, C3);
  assert.equal(by.get("CLSA").cik, C2);
  assert.equal(by.get("CLSA").status, "RESOLVED");
});

test("CG-3: neu vergebenes Kuerzel behaelt seine bisherige CIK bis zum Beleg", () => {
  const by = fresh();
  const g = guardNewIssuerAttachments({ byTicker: by, previous, productTickers: product, successions });
  assert.equal(by.get("REUS").cik, "0000000009");
  assert.equal(by.get("REUS").status, PENDING);
  assert.equal(g.pending.find((p) => p.ticker === "REUS").keptCik, "0000000009");
});

test("CG-4: retirePredecessor false oder andere CIK im Register erklaert nichts", () => {
  for (const e of [{ ...successions[0], retirePredecessor: false }, { ...successions[0], cik: C3 }]) {
    const by = fresh();
    guardNewIssuerAttachments({ byTicker: by, previous, productTickers: product, successions: [e] });
    assert.equal(by.get("NEWA").status, PENDING);
  }
});

test("CG-5: ausserhalb des Produkts und ohne vorigen Stand keine Pruefung", () => {
  const by = fresh();
  guardNewIssuerAttachments({ byTicker: by, previous, productTickers: ["OLDB"], successions: [] });
  assert.equal(by.get("NEWB").cik, C2);
  const by2 = fresh();
  const g = guardNewIssuerAttachments({ byTicker: by2, previous: null, productTickers: product, successions: [] });
  assert.equal(g.checked, false);
  assert.equal(by2.get("NEWB").cik, C2);
});
