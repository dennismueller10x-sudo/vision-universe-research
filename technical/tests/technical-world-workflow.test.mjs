// Ausloeser und Schutzregeln des Teils technical-world in pipeline-daily.yml (vormals technical-world.yml) (docs/technical/TECHNICAL_SCHEDULE.md, ADR-005).
// Ein umbenannter Vorlauf wuerde den workflow_run-Ausloeser still abschalten; der Test vergleicht deshalb die
// eingetragenen Namen mit den name:-Zeilen der Vorlaeufe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { workflowPart, workflowHead } from "../../scripts/ci/lib/workflow-part.mjs";
import { takteVon } from "../../scripts/core/schedule-registry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const wf = (f) => readFileSync(join(root, ".github/workflows", f), "utf8");
const nameOf = (src) => (src.match(/^name:\s*["']?(.+?)["']?\s*$/m) || [])[1];
const kopf = workflowHead(root, "pipeline-daily.yml");
const yml = workflowPart(root, "pipeline-daily.yml", "technical-world");
const triggers = (() => {
  const a = kopf.indexOf("\n  workflow_run:");
  const block = kopf.slice(a, kopf.indexOf("types:", a));
  return [...block.matchAll(/^\s+-\s+"([^"]+)"/gm)].map((m) => m[1]);
})();

test("technical-world: workflow_run nach dem Nachtlauf, Namen = name: der Vorlaeufe", () => {
  assert.deepEqual(triggers, [nameOf(wf("market-data-refresh.yml")), nameOf(wf("product-intelligence-materialization.yml")), nameOf(wf("long-series.yml"))]);
});

test("technical-world: Zeitplan bleibt als Rueckfall, manueller Start moeglich", () => {
  assert.ok(takteVon("pipeline-daily.yml", root).includes("10 5 * * 2-6"), "Zeitplan-Rueckfall (Register/Wecker)");
  assert.match(workflowPart(root, "pipeline-daily.yml", "technical-world", { auswahl: true }), /'10 5 \* \* 2-6'\) echo technical-world/);
  assert.match(kopf, /\n  workflow_dispatch:/);
  assert.match(kopf, /\n {10}- technical-world\n/);
});

test("technical-world: workflow_run nur nach Erfolg auf main und nie nach einem Push-Lauf", () => {
  const cond = yml.slice(yml.indexOf("  technical-world:"), yml.indexOf("runs-on:")).replace(/\s+/g, " ");
  assert.match(cond, /github\.event_name != 'workflow_run' \|\|/);
  assert.match(cond, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(cond, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(cond, /github\.event\.workflow_run\.event != 'push'/);
});

test("technical-world: ADR-005 - Spitze auschecken, Concurrency je Branch ohne Abbruch, nur technical/data, push-with-retry", () => {
  assert.match(yml, /ref: \$\{\{ github\.ref \}\}/);
  assert.match(yml, /group: technical-world-\$\{\{ github\.ref_name \}\}/);
  assert.match(yml, /cancel-in-progress: false/);
  assert.match(yml, /git add technical\/data\n/);
  assert.match(yml, /scripts\/ci\/push-with-retry\.sh/);
  assert.doesNotMatch(yml, /\$\{\{\s*inputs\./, "Eingaben nur ueber env:");
});
