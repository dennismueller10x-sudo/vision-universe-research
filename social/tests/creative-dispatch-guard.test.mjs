/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creative-dispatch-guard.test.mjs

   Simuliert den Dispatch-Pfad vollstaendig ohne eine einzige
   Work-Ausfuehrung: der Guard bekommt erfundene Branches und ein
   erfundenes Register und muss dieselben Antworten geben wie gegen die
   echten Daten.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const G = await import("../../scripts/social/verify-creative-dispatch.mjs");

const JOB = {
  creativeJobId: "job_vu-echt-20260918:aaa:attempt1",
  contentId: "vu-echt-20260918",
  processingKey: "b:vu-echt-20260918:aaa:1.0",
  attempt: 1, state: "CREATIVE_JOB_VERIFIED", prNumber: 1
};

test("DG1 · Die content_id kommt aus dem Branch, ohne Anlauf-Suffix", () => {
  /* Der Anlauf gehoert zum Branch, nicht zur Kennung. Wer ihn mitnimmt,
     findet den Job des dritten Anlaufs nicht mehr. */
  assert.equal(G.contentIdAus("authoring/request/vu-xom-20260911"), "vu-xom-20260911");
  assert.equal(G.contentIdAus("authoring/request/vu-xom-20260911-attempt3"),
    "vu-xom-20260911");
  assert.equal(G.contentIdAus("feature/etwas-anderes"), null);
});

test("DG2 · Ein Request-PR ohne beschlossenen Job ist rot", () => {
  /* Der Fall, der eintritt, wenn jemand am Gatter vorbei pusht — also
     genau so, wie alle acht bisherigen Jobs entstanden sind. */
  const befund = G.pruefe("authoring/request/vu-nicht-beschlossen-20260918", [JOB]);
  assert.equal(befund.ok, false);
  assert.equal(befund.reason, "noJob");
  assert.match(befund.message, /ohne dass VU das beschlossen haette/);
});

test("DG3 · Ein beschlossener Job innerhalb des Budgets ist gruen", () => {
  const befund = G.pruefe("authoring/request/vu-echt-20260918", [JOB]);
  assert.equal(befund.ok, true);
});

test("DG4 · Zwei Jobs zum selben Processing Key sind rot", () => {
  const doppelt = [JOB, Object.assign({}, JOB,
    { creativeJobId: "job_zweiter" })];
  const befund = G.pruefe("authoring/request/vu-echt-20260918", doppelt);
  assert.equal(befund.ok, false);
  assert.equal(befund.reason, "duplicateJob");
});

test("DG5 · Ein fremder Branch wird nicht beurteilt", () => {
  /* Eine Pruefung, die auch dort etwas sagt, wo sie nichts weiss,
     erzeugt Rauschen — und Rauschen wird abgeschaltet. */
  const befund = G.pruefe("claude/irgendwas", []);
  assert.equal(befund.ok, true);
  assert.equal(befund.reason, "notARequestBranch");
});

test("DG6 · Das Skript endet mit ungleich null, wenn es rot ist", () => {
  /* Die Lehre aus request-creative.mjs: dort stand `process.exit(0)`
     hinter einer Verweigerung. Jede Automation, die den Rueckgabewert
     prueft — und das ist sein Sinn — las das als "in Ordnung, weiter".
     Ein Gatter, das mit 0 endet, ist kein Gatter. */
  let code = 0;
  try {
    execFileSync(process.execPath,
      [join(ROOT, "scripts/social/verify-creative-dispatch.mjs"),
       "--branch", "authoring/request/vu-gibt-es-nicht-20260918"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  } catch (err) { code = err.status; }
  assert.equal(code, 5, "der Guard endete mit " + code);
});

test("DG7 · Der echte dritte Anlauf ist gedeckt", () => {
  /* Gegenprobe gegen die realen Daten: der Branch, der tatsaechlich
     existiert, muss gruen sein. Sonst prueft der Guard etwas anderes
     als das, was passiert ist. */
  const aus = execFileSync(process.execPath,
    [join(ROOT, "scripts/social/verify-creative-dispatch.mjs"),
     "--branch", "authoring/request/vu-xom-20260911-attempt3"],
    { cwd: ROOT, encoding: "utf8" });
  assert.match(aus, /Innerhalb des Budgets/);
});
