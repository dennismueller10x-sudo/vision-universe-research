/* Methodikwechsel bei gleichem Stichtag (Owner-Programm 02.10.2026, §25/§26).

   Gleicher Stichtag ist nicht gleicher methodischer Stand. Die
   Idempotenz-Stufe der Materialisierung muss neu rechnen, sobald sich
   Methodik, Evidenz-Engines, Benchmark-Vertrag oder Gesamtrendite-Vertrag
   geaendert haben - ohne force. Gegenprobe: unveraendert bleibt es ein No-Op. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, changedGroups, GROUPS, SCHEMA } from "../../scripts/quant/methodology-fingerprint.mjs";
import { decide } from "../../scripts/quant/materialization-decision.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const wf = readFileSync(join(ROOT, ".github/workflows/product-intelligence-materialization.yml"), "utf8");

test("fingerprint covers methodology, evidence engines, benchmark contract and return-quality contract", () => {
  const fp = fingerprint();
  assert.equal(fp.schemaVersion, SCHEMA);
  assert.deepEqual(Object.keys(fp.groups).sort(), ["benchmark", "contracts", "evidence", "methodology", "returnQuality"]);
  assert.ok(GROUPS.returnQuality().includes("quant/engines/market-quality.js"));
  assert.ok(GROUPS.returnQuality().includes("quant/engines/canonical-total-return.js"));
  assert.ok(GROUPS.benchmark().includes("scripts/market/refresh-benchmark-history.mjs"));
  assert.ok(GROUPS.benchmark().includes("@benchmark"));
  assert.ok(GROUPS.methodology().includes("quant/methodology/return-semantics-v1.json"));
  assert.ok(GROUPS.evidence().includes("scripts/quant/build-signal-backtest.mjs"));
  assert.deepEqual(fingerprint(), fp, "deterministisch");
});

test("same as-of, changed contract: the group is reported; unchanged: nothing", () => {
  const fp = fingerprint();
  assert.deepEqual(changedGroups(fp, fp), [], "Gegenprobe: gleicher Stand bleibt ein No-Op");
  for (const g of Object.keys(fp.groups)) {
    const stored = { ...fp, groups: { ...fp.groups, [g]: "0000000000000000" } };
    assert.deepEqual(changedGroups(fp, stored), [g]);
  }
  assert.equal(changedGroups(fp, null).length, 5, "ohne gespeicherten Stand gilt alles als geaendert");
  assert.equal(changedGroups(fp, { schemaVersion: "alt", groups: fp.groups }).length, 5);
});

test("a new total-return, corporate-action or benchmark contract version changes the fingerprint at the same as-of", () => {
  const src = join(ROOT, "quant/engines/canonical-total-return.js"), orig = readFileSync(src, "utf8");
  const base = fingerprint();
  try {
    for (const [name, from, to] of [["totalReturn", '"canonical-total-return-1.0.0"', '"canonical-total-return-9.9.9"'],
      ["corporateActions", '"corporate-action-contract-1.0.0"', '"corporate-action-contract-9.9.9"'], ["benchmark", '"benchmark-contract-1.0.0"', '"benchmark-contract-9.9.9"']]) {
      assert.ok(orig.includes(from), name);
      writeFileSync(src, orig.replace(from, to));
      const fp = fingerprint();
      assert.notEqual(fp.groups.contracts, base.groups.contracts, name);
      assert.ok(changedGroups(fp, base).includes("contracts"), name);
    }
  } finally { writeFileSync(src, orig); }
  assert.deepEqual(fingerprint(), base, "zurueckgesetzt");
});

test("the idempotency step recomputes on a methodology change without force, and records the fingerprint only after a full run", () => {
  const step = wf.slice(wf.indexOf("id: noetig"), wf.indexOf("Existing R2 credentials are available"));
  assert.match(step, /methodology-fingerprint\.mjs --compare/);
  // Die Entscheidung lebt in scripts/quant/materialization-decision.mjs: der
  // Schritt reicht den Methodikbefund weiter, und ein Methodikwechsel schlaegt
  // den gleichen Stichtag (vorher als elif-Reihenfolge im Shell-Text geprueft).
  assert.match(step, /materialization-decision\.mjs --store="\$STORE" --product="\$PRODUCT" \\\s*\n\s*--method="\$METHOD"/);
  const same = { store: "2026-10-02", product: "2026-10-02" };
  assert.equal(decide({ ...same }).noop, true, "gleicher Stichtag ohne Befund ist ein No-Op");
  assert.deepEqual(decide({ ...same, method: "benchmark" }), { noop: false, reason: "METHODOLOGY_CHANGED" },
    "der Methodikwechsel wird vor dem Stichtagsvergleich geprueft");
  const iWrite = wf.indexOf("methodology-fingerprint.mjs --write"), iCommit = wf.indexOf("Commit materialized Product Data");
  assert.ok(iWrite > wf.indexOf("Public data hygiene") && iWrite < iCommit, "festgeschrieben erst nach allen Schritten, vor dem Commit");
  assert.match(wf.slice(iCommit), /quant\/data\/product\/methodology-fingerprint-v1\.json/);
});
