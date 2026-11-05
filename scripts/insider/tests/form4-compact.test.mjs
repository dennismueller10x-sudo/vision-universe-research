// Eine Form-4-Abholung fuer zwei Sichten: E2-Rohdaten -> Cache-Auszug der Eigentuemer-Signale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { build, seed, compactRaw } from "../form4-compact.mjs";
import { compactForm4 } from "../../market/build-ownership-signals.mjs";

const require = createRequire(import.meta.url);
const E = require("../../../quant/engines/ownership-signals.js");

const tx = (code, ad) => `<nonDerivativeTransaction><transactionDate><value>2026-06-01</value></transactionDate>
<transactionCoding><transactionCode>${code}</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>100</value></transactionShares>
<transactionPricePerShare><value>2.5</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>${ad}</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>`;
const filing = (txs) => `<SEC-DOCUMENT>\n<ACCEPTANCE-DATETIME>20260605173000\n<XML>\n<ownershipDocument><documentType>4</documentType>
<issuer><issuerCik>0000000123</issuerCik></issuer><reportingOwner><reportingOwnerId><rptOwnerCik>0000000456</rptOwnerCik><rptOwnerName>Person</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship><isOfficer>1</isOfficer></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable>${txs}</nonDerivativeTable></ownershipDocument>\n</XML>\n</SEC-DOCUMENT>`;

function raw(dir, entries) {
  mkdirSync(dir, { recursive: true });
  for (const [acc, , , text] of entries) writeFileSync(join(dir, acc + ".txt"), text);
  writeFileSync(join(dir, "index.json"), JSON.stringify(entries.map(([a, d, f]) => [a, d, f])));
}

test("F4C-1 Auszug ist exakt der Cache-Eintrag der Eigentuemer-Signale; ohne P/S null; 4/A aussen vor", () => {
  const t = mkdtempSync(join(tmpdir(), "f4c-"));
  try {
    const buy = filing(tx("P", "A") + tx("S", "D")), grant = filing(tx("A", "A"));
    raw(join(t, "raw"), [["0000000123-26-000001", "2026-06-05", "4", buy], ["0000000123-26-000002", "2026-06-30", "4", grant],
      ["0000000123-26-000003", "2026-07-01", "4/A", buy]]);
    const out = compactRaw(join(t, "raw"));
    assert.deepEqual(Object.keys(out).sort(), ["2026-06"]);
    assert.deepEqual(out["2026-06"]["0000000123-26-000001"], compactForm4(E.parseForm4Xml(buy), "2026-06-05"));
    assert.equal(out["2026-06"]["0000000123-26-000001"].x.length, 2);
    assert.equal(out["2026-06"]["0000000123-26-000002"], null);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("F4C-2 build fuehrt mit dem Vorstand zusammen und verwirft Monate ausserhalb des Fensters", () => {
  const t = mkdtempSync(join(tmpdir(), "f4c-"));
  try {
    raw(join(t, "raw"), [["0000000123-26-000001", "2026-06-05", "4", filing(tx("P", "A"))], ["0000000123-25-000009", "2025-10-31", "4", filing(tx("P", "A"))]]);
    mkdirSync(join(t, "prev"));
    writeFileSync(join(t, "prev", "2026-06.json"), JSON.stringify({ "0000000999-26-000001": null }));
    const r = build({ raw: join(t, "raw"), outDir: join(t, "out"), prevDir: join(t, "prev"), keepMonths: 6, asOf: "2026-06-06" });
    assert.deepEqual(r.written.map((w) => w.month), ["2026-06"]);
    assert.equal(r.oldest, "2026-01");
    const m = JSON.parse(readFileSync(join(t, "out", "2026-06.json"), "utf8"));
    assert.deepEqual(Object.keys(m).sort(), ["0000000123-26-000001", "0000000999-26-000001"]);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("F4C-3 seed uebernimmt nur Fehlendes; vorhandene Cache-Eintraege gewinnen", () => {
  const t = mkdtempSync(join(tmpdir(), "f4c-"));
  try {
    mkdirSync(join(t, "cache", "form4"), { recursive: true });
    mkdirSync(join(t, "from"));
    writeFileSync(join(t, "cache", "form4", "2026-06.json"), JSON.stringify({ a: { keep: 1 } }));
    writeFileSync(join(t, "from", "2026-06.json"), JSON.stringify({ a: null, b: null }));
    writeFileSync(join(t, "from", "2026-07.json"), JSON.stringify({ c: null }));
    writeFileSync(join(t, "from", "2025-12.json"), JSON.stringify({ alt: null }));
    writeFileSync(join(t, "from", "notes.txt"), "x");
    const s = seed({ cache: join(t, "cache"), fromDir: join(t, "from"), asOf: "2026-07-02" });
    assert.deepEqual(s, [{ month: "2026-06", added: 1, total: 2 }, { month: "2026-07", added: 1, total: 1 }]);
    assert.deepEqual(JSON.parse(readFileSync(join(t, "cache", "form4", "2026-06.json"), "utf8")), { a: { keep: 1 }, b: null });
  } finally { rmSync(t, { recursive: true, force: true }); }
});
