import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../ci-gate.mjs";
import { istInfrastruktur } from "../infra-retry.mjs";

const r = (name, status, conclusion) => ({ name, status, conclusion });

test("ci-gate: alles gruen oder uebersprungen besteht, das Gate selbst zaehlt nicht", () => {
  const res = evaluate([r("ci-gate", "in_progress", null), r("a", "completed", "success"), r("b", "completed", "skipped"), r("c", "completed", "neutral")]);
  assert.equal(res.state, "pass");
});
test("ci-gate: offener Check wartet, roter Check faellt", () => {
  assert.equal(evaluate([r("a", "in_progress", null), r("b", "completed", "failure")]).state, "wait");
  const res = evaluate([r("a", "completed", "success"), r("b", "completed", "failure"), r("c", "completed", "cancelled")]);
  assert.equal(res.state, "fail");
  assert.equal(res.rot.length, 2);
});
test("ci-gate: ohne weitere Checks (z. B. reiner Doku-PR) besteht es", () => {
  assert.equal(evaluate([r("ci-gate", "in_progress", null)]).state, "pass");
});
test("ci-gate: wartender Lauf ohne Jobs (queued) haelt das Gate offen", () => {
  assert.equal(evaluate([r("CI", "queued", null), r("Core", "completed", "success")]).state, "wait");
});
test("ci-gate: neuester Lauf je Name zaehlt (abgebrochener Altlauf, Wiederholung)", () => {
  assert.equal(evaluate([{ ...r("x", "completed", "cancelled"), id: 1 }, { ...r("x", "completed", "skipped"), id: 2 }]).state, "pass");
  assert.equal(evaluate([{ ...r("x", "completed", "failure"), id: 1 }, { ...r("x", "in_progress", null), id: 2 }]).state, "wait");
  assert.equal(evaluate([{ ...r("x", "completed", "success"), id: 1 }, { ...r("x", "completed", "failure"), id: 2 }]).state, "fail");
});
test("infra-retry: Signaturen ja, Testfehler nein", () => {
  assert.ok(istInfrastruktur("E: Failed to fetch http://azure.archive.ubuntu.com Temporary failure resolving 'azure.archive.ubuntu.com'"));
  assert.ok(istInfrastruktur("npm ERR! code ECONNRESET"));
  assert.ok(!istInfrastruktur("AssertionError: Unexpected price-history fanout: screenerPro@1440"));
  assert.ok(!istInfrastruktur("not ok 12 - expected 3 got 4"));
});
