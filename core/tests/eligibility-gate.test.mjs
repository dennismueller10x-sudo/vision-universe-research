/* Gate fuer das Produktuniversum (Strang A, 05.11.2026): Vertragstest statt Pfad-Gate. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../../scripts/core/eligibility-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIMITS = JSON.parse(readFileSync(join(ROOT, "core/registry/eligibility-gate.json"), "utf8")).limits;
const doc = (rows) => ({ counts: { universeMembers: rows.length }, decisions: rows.map(([id, s]) => ({ securityId: id, product_eligibility: s })) });
const uni = (n) => ({ actualSize: n });
const base = Array.from({ length: 1000 }, (_, i) => [`ref_T${i}`, i < 900 ? "ELIGIBLE" : "EXCLUDED"]);

test("EG-1 · unveraendert und kleine Bewegung: COMMIT", () => {
  assert.equal(evaluate({ prev: doc(base), next: doc(base), prevUniverse: uni(900), nextUniverse: uni(900), limits: LIMITS }).decision, "COMMIT");
  const next = base.map(([id, s], i) => [id, i < 5 ? "REVIEW" : s]);
  const r = evaluate({ prev: doc(base), next: doc(next), prevUniverse: uni(900), nextUniverse: uni(900), limits: LIMITS });
  assert.equal(r.decision, "COMMIT"); assert.equal(r.counted.statusChanges, 5); assert.equal(r.transitions["ELIGIBLE->REVIEW"], 5);
});

test("EG-2 · zu viele Wechsel, zu viele Ausschluesse, Universumssprung, Mitgliedschaft geaendert: BLOCKED", () => {
  const many = base.map(([id, s], i) => [id, i < 61 ? "REVIEW" : s]);
  assert.equal(evaluate({ prev: doc(base), next: doc(many), prevUniverse: uni(900), nextUniverse: uni(900), limits: LIMITS }).decision, "BLOCKED");
  const out = base.map(([id, s], i) => [id, i < 16 ? "EXCLUDED" : s]);
  assert.match(evaluate({ prev: doc(base), next: doc(out), prevUniverse: uni(900), nextUniverse: uni(884), limits: LIMITS }).failures.join(), /eligibleToExcluded 16/);
  assert.match(evaluate({ prev: doc(base), next: doc(base), prevUniverse: uni(900), nextUniverse: uni(920), limits: LIMITS }).failures.join(), /productUniverseDeltaPct/);
  assert.match(evaluate({ prev: doc(base), next: doc(base.slice(1)), prevUniverse: uni(900), nextUniverse: uni(900), limits: LIMITS }).failures.join(), /universeMembersChanged/);
});

test("EG-3 · Workflow: Ausgabe nach RUNNER_TEMP, Commit nur mit commit=true und Gate COMMIT, kein Zeitplan vor dem Nachholen", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/security-master-eligibility.yml"), "utf8");
  assert.match(wf, /--out "\$RUNNER_TEMP\/elig\/out" --scale-out "\$RUNNER_TEMP\/elig\/scale"/);
  assert.match(wf, /if: inputs\.commit == true && steps\.gate\.outputs\.decision == 'COMMIT'/);
  assert.match(wf, /group: market-data-\$\{\{ github\.ref_name \}\}/);
  assert.match(wf, /scripts\/ci\/push-with-retry\.sh/);
  assert.doesNotMatch(wf, /^\s*(schedule|cron)\s*:/m);
});
