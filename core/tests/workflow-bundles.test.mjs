/* Workflow-Buendelung (Plan Neustart §3, Strang A): Vertragstest statt Liste im Kopf.
   Jede Workflow-Datei hat ein Ziel-Buendel; ein Buendel-Workflow ersetzt seine Quellen nachweisbar. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = JSON.parse(readFileSync(join(ROOT, "core/registry/workflow-bundles.json"), "utf8"));
const FILES = readdirSync(join(ROOT, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f)).sort();

test("WB-1 · Jede Workflow-Datei hat genau ein bekanntes Ziel-Buendel, kein Eintrag ohne Datei", () => {
  const listed = Object.keys(DOC.workflows).sort();
  const bundleWorkflows = Object.values(DOC.bundles).map((b) => b.workflow).filter(Boolean);
  const missing = FILES.filter((f) => !DOC.workflows[f] && !bundleWorkflows.includes(f));
  assert.deepEqual(missing, [], "neue Workflows brauchen ein Ziel-Buendel in core/registry/workflow-bundles.json");
  assert.deepEqual(listed.filter((f) => !FILES.includes(f)), [], "Eintrag ohne Datei: geloeschte Workflows austragen");
  for (const [f, e] of Object.entries(DOC.workflows)) assert.ok(DOC.bundles[e.bundle], `${f}: unbekanntes Buendel ${e.bundle}`);
});

test("WB-2 · Zielbild: hoechstens 12 Buendel", () => {
  assert.ok(Object.keys(DOC.bundles).length <= 12, Object.keys(DOC.bundles).join(","));
});

test("WB-3 · Ein Buendel-Workflow ersetzt seine Quellen: sie sind geloescht und nicht mehr gelistet", () => {
  for (const [name, b] of Object.entries(DOC.bundles)) {
    if (!b.workflow) { assert.deepEqual(b.replaces, [], `${name}: replaces ohne Buendel-Workflow`); continue; }
    assert.ok(existsSync(join(ROOT, ".github/workflows", b.workflow)), `${name}: ${b.workflow} fehlt`);
    for (const src of b.replaces) {
      assert.ok(!existsSync(join(ROOT, ".github/workflows", src)), `${name}: Quelle ${src} noch vorhanden`);
      assert.ok(!DOC.workflows[src], `${name}: Quelle ${src} noch gelistet`);
    }
  }
});

test("WB-4 · Fortschritt ist messbar: Anzahl Dateien gegen Zielbild", () => {
  // Kein Ziel, das CI rot macht: die Zahl steht im Bericht von scripts/core/system-health.mjs und hier im Test-Log.
  console.log(`[buendel] ${FILES.length} Workflow-Dateien, Ziel ${Object.keys(DOC.bundles).length}`);
  assert.ok(FILES.length > 0);
});

test("WB-5 · DoD (Steuerung 08.11.2026): jede eigenstaendige Datei ist begruendete Ausnahme oder noch geplant", () => {
  const bundleWorkflows = Object.values(DOC.bundles).map((b) => b.workflow).filter(Boolean);
  for (const f of FILES.filter((x) => !bundleWorkflows.includes(x))) {
    const e = DOC.workflows[f] || {};
    const ausnahme = typeof e.ausnahme === "string" ? e.ausnahme.trim() : "";
    assert.ok(Boolean(ausnahme) !== Boolean(e.geplant), `${f}: genau eins von ausnahme (ein Satz Begruendung) oder geplant`);
    if (ausnahme) assert.match(ausnahme, /^\S.{20,}[.)]$/, `${f}: Begruendung als ganzer Satz`);
  }
  const offen = FILES.filter((f) => DOC.workflows[f]?.geplant);
  console.log(`[buendel] ${bundleWorkflows.length} Buendel, ${FILES.length - bundleWorkflows.length - offen.length} Ausnahmen, ${offen.length} noch geplant`);
});
