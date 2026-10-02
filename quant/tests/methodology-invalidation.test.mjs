/* Methodikwechsel bei gleichem Stichtag (Owner-Programm 02.10.2026, §25/§26).

   Gleicher Stichtag ist nicht gleicher methodischer Stand. Die
   Idempotenz-Stufe der Materialisierung muss neu rechnen, sobald sich
   Methodik, Evidenz-Engines, Benchmark-Vertrag oder Gesamtrendite-Vertrag
   geaendert haben - ohne force. Gegenprobe: unveraendert bleibt es ein No-Op. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, changedGroups, GROUPS, SCHEMA } from "../../scripts/quant/methodology-fingerprint.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const wf = readFileSync(join(ROOT, ".github/workflows/product-intelligence-materialization.yml"), "utf8");

test("fingerprint covers methodology, evidence engines, benchmark contract and return-quality contract", () => {
  const fp = fingerprint();
  assert.equal(fp.schemaVersion, SCHEMA);
  assert.deepEqual(Object.keys(fp.groups).sort(), ["benchmark", "evidence", "methodology", "returnQuality"]);
  assert.ok(GROUPS.returnQuality().includes("quant/engines/market-quality.js"));
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
  assert.equal(changedGroups(fp, null).length, 4, "ohne gespeicherten Stand gilt alles als geaendert");
  assert.equal(changedGroups(fp, { schemaVersion: "alt", groups: fp.groups }).length, 4);
});

test("the idempotency step recomputes on a methodology change without force, and records the fingerprint only after a full run", () => {
  const step = wf.slice(wf.indexOf("id: noetig"), wf.indexOf("Existing R2 credentials are available"));
  assert.match(step, /methodology-fingerprint\.mjs --compare/);
  const iMethod = step.indexOf('elif [ -n "$METHOD" ]'), iSame = step.indexOf('elif [ -n "$STORE" ] && [ "$STORE" = "$PRODUCT" ]');
  assert.ok(iMethod > 0 && iSame > iMethod, "der Methodikwechsel wird vor dem Stichtagsvergleich geprueft");
  const iWrite = wf.indexOf("methodology-fingerprint.mjs --write"), iCommit = wf.indexOf("Commit materialized Product Data");
  assert.ok(iWrite > wf.indexOf("Public data hygiene") && iWrite < iCommit, "festgeschrieben erst nach allen Schritten, vor dem Commit");
  assert.match(wf.slice(iCommit), /quant\/data\/product\/methodology-fingerprint-v1\.json/);
});
