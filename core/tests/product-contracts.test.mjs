/* Vertragstests statt Pfad-Gates (Plan Neustart §3, Strang A).
   Ein Pfad-Gate verbot Querschnitts-PRs. Ein Vertrag verlangt stattdessen: wer ein Produkt aendert,
   loest dessen CI und Vertragstests aus, und jede Schnittstelle zwischen Produkten hat ein
   geprueftes Schema. Registry: core/registry/product-contracts.json. */
import { workflowPart } from "../../scripts/ci/lib/workflow-part.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = JSON.parse(readFileSync(join(ROOT, "core/registry/product-contracts.json"), "utf8"));
const WF = join(ROOT, ".github/workflows");

/** pull_request-Pfadfilter einer Workflow-Datei (Block- oder Flow-Liste), ohne YAML-Bibliothek. */
export function prPaths(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^  pull_request:\s*$/.test(l));
  if (i < 0) return null;
  const out = [];
  for (let k = i + 1; k < lines.length && (/^\s{4,}/.test(lines[k]) || !lines[k].trim()); k++) {
    if (/^\s+paths:\s*\[/.test(lines[k])) {
      let flow = lines[k].replace(/^\s+paths:\s*\[/, "");
      while (!flow.includes("]") && k + 1 < lines.length) flow += lines[++k];
      out.push(...flow.slice(0, flow.indexOf("]")).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean));
      continue;
    }
    if (/^\s+paths:\s*$/.test(lines[k])) {
      for (k++; k < lines.length && /^\s+-\s/.test(lines[k]); k++) out.push(lines[k].replace(/^\s+-\s*/, "").replace(/^['"]|['"]$/g, "").trim());
      k--;
    }
  }
  return out;
}
const covers = (filters, p) => filters.some((f) => f === p || (f.endsWith("/**") && p.startsWith(f.slice(0, -2))) || (f.endsWith("/**") && p === f));

test("PC-1 · Jede Produktaenderung loest die Produkt-CI aus (Pfadfilter deckt alle Produktpfade)", () => {
  for (const [id, p] of Object.entries(REG.products)) {
    const file = join(WF, p.ci);
    assert.ok(existsSync(file), `${id}: ${p.ci} fehlt`);
    const filters = prPaths(readFileSync(file, "utf8"));
    assert.ok(filters, `${id}: ${p.ci} reagiert nicht auf pull_request`);
    for (const path of p.paths) assert.ok(covers(filters, path), `${id}: ${p.ci} laeuft nicht bei ${path}`);
  }
});

test("PC-2 · Die Produkt-CI fuehrt die Vertragstests des Produkts aus", () => {
  for (const [id, p] of Object.entries(REG.products)) {
    const text = readFileSync(join(WF, p.ci), "utf8");
    for (const t of p.contractTests) {
      assert.ok(text.includes(t) || text.includes(`"${t}"`), `${id}: ${p.ci} fuehrt ${t} nicht aus`);
      const dir = join(ROOT, dirname(t));
      assert.ok(existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".test.mjs")), `${id}: keine Tests unter ${t}`);
    }
  }
});

test("PC-3 · Jede Schnittstelle zwischen Produkten hat ihr Schema (Daten-Vertrag statt Pfadverbot)", () => {
  for (const [id, p] of Object.entries(REG.products)) for (const c of p.consumes) assert.ok(REG.interfaces[c], `${id} liest unbekannte Schnittstelle ${c}`);
  for (const [id, i] of Object.entries(REG.interfaces)) {
    assert.ok(REG.products[i.provider], `${id}: Anbieter ${i.provider} unbekannt`);
    const file = join(ROOT, i.artifact);
    assert.ok(existsSync(file), `${id}: ${i.artifact} fehlt`);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(doc[i.schemaField], i.schema, `${id}: Schema geaendert - Verbraucher und Registry im selben PR nachziehen`);
  }
});

test("PC-4 · Kein Pfad-Gate blockiert mehr: die ersetzten Gates sind Bericht oder entfernt", () => {
  const guard = readFileSync(join(ROOT, "scripts/supertrader/guard-protected-paths.mjs"), "utf8");
  assert.doesNotMatch(guard, /process\.exit\(1\)/, "Gate A meldet nur noch");
  const disc = workflowPart(ROOT, "ci.yml", "discover"); /* seit CI Stufe 2 Teil discover in ci.yml, vormals discover-ci.yml */
  assert.doesNotMatch(disc, /- name: Discover veraendert keine bestehende Engine/);
  const ci = readFileSync(join(WF, "company-intelligence.yml"), "utf8");
  assert.doesNotMatch(ci, /- name: Reject changes to protected production paths/);
});
