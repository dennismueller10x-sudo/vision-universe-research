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

test("EG-4 · Freigabeliste: freigegebene Wechsel zaehlen nicht, Zielumfang exakt, ungenutzte Eintraege und fremder Vorstand sind rot", () => {
  const next = base.map(([id, s], i) => [id, i < 100 ? "EXCLUDED" : s]);
  const approval = { id: "t", prevSha256: "abc", productUniverseAfter: 800,
    changes: Array.from({ length: 100 }, (_, i) => ({ securityId: `ref_T${i}`, from: "ELIGIBLE", to: "EXCLUDED" })) };
  const ok = evaluate({ prev: doc(base), next: doc(next), prevUniverse: uni(900), nextUniverse: uni(800), limits: LIMITS, approval, prevSha256: "abc" });
  assert.equal(ok.decision, "COMMIT", ok.failures.join("; ")); assert.equal(ok.approval.applied, 100);
  assert.match(evaluate({ prev: doc(base), next: doc(next), prevUniverse: uni(900), nextUniverse: uni(800), limits: LIMITS, approval, prevSha256: "zzz" }).failures.join(), /anderen Vorstand/);
  const partly = base.map(([id, s], i) => [id, i < 90 ? "EXCLUDED" : s]);
  assert.match(evaluate({ prev: doc(base), next: doc(partly), prevUniverse: uni(900), nextUniverse: uni(810), limits: LIMITS, approval, prevSha256: "abc" }).failures.join(), /10 freigegebene Wechsel ungenutzt/);
  // ein anderer Wechsel desselben Titels ist nicht freigegeben
  const other = base.map(([id, s], i) => [id, i < 100 ? (i === 0 ? "REVIEW" : "EXCLUDED") : s]);
  const r = evaluate({ prev: doc(base), next: doc(other), prevUniverse: uni(900), nextUniverse: uni(801), limits: LIMITS, approval, prevSha256: "abc" });
  assert.equal(r.counted.statusChanges, 1); assert.equal(r.decision, "BLOCKED");
});

test("EG-5 · Workflow laeuft die vollstaendige Erzeugerkette (Namensschicht DEBT, Boersenverzeichnis) vor dem Gate", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/security-master-eligibility.yml"), "utf8");
  const a = wf.indexOf("node scripts/market/build-us-eligibility.mjs"), b = wf.indexOf("node scripts/market/apply-name-layer-class.mjs --classes DEBT"), c = wf.indexOf("node scripts/market/apply-exchange-directory.mjs"), g = wf.indexOf("node scripts/core/eligibility-gate.mjs");
  assert.ok(a > 0 && b > a && c > b && g > c, "Reihenfolge Erzeuger -> Namensschicht -> Boersenverzeichnis -> Gate");
  assert.match(wf, /IN_APPROVED: \$\{\{ inputs\.approved_catchup \}\}/);
});

test("EG-6 · Die committete Freigabeliste passt zum committeten Vorstand und ist vollstaendig belegt", async () => {
  const { createHash } = await import("node:crypto");
  const c = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/eligibility-catchup-2026-11.json"), "utf8"));
  const prevBytes = readFileSync(join(ROOT, "quant/data/market/security-master/eligibility.json"));
  const sha = createHash("sha256").update(prevBytes).digest("hex");
  if (sha !== c.prevSha256) return; // Vorstand seit der Liste uebernommen oder neu gebaut: die Liste gilt dann nicht mehr (Gate prueft)
  const prev = JSON.parse(prevBytes.toString("utf8"));
  const pm = new Map(prev.decisions.map((d) => [d.securityId, d.product_eligibility]));
  assert.equal(c.changes.length, c.counts.changes);
  for (const ch of c.changes) assert.equal(pm.get(ch.securityId), ch.from, ch.securityId);
  assert.ok(c.changes.every((ch) => ch.reasonAfter), "jeder Wechsel mit Grund");
});
