/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/ingest-open-creative-jobs.test.mjs

   DIE FEHLENDE ERSTE LINIE (IOJ1–IOJ4)

   PR #170 (vu-nvda-20260918) trug seit Stunden ein echtes, vollstaendig
   bestaetigtes Creative-Result — `ingest-creative.mjs` bestaetigt es
   als COMPLETED, sobald man es gegen den Request-Branch ausfuehrt. Der
   Job blieb trotzdem offen, weil ingest-creative.mjs in keinem Workflow
   je aufgerufen wird: reconcile-creative-jobs.mjs sucht das Ergebnis
   nur im bereits ausgecheckten Baum von main, wo es nie ankommt — der
   Agent committet auf den Request-Branch.

   ingest-open-creative-jobs.mjs ist die fehlende erste Linie: fuer
   jeden offenen Job mit Request-PR den Branch holen und den
   bestehenden, bereits getesteten Ingest darauf ansetzen. Dieser Test
   deckt die einzige reine Entscheidung des Skripts ab — WELCHE Jobs
   ueberhaupt einen Branch haben koennen, dessen Holen sich lohnt. Der
   Rest (git fetch, ingest-creative.mjs selbst) ist bereits an anderer
   Stelle gegen ein echtes Repository getestet; das hier noch einmal
   nachzubilden würde eine Nachbildung pruefen statt die Sache selbst.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { offeneJobsMitPr } from "../../scripts/social/ingest-open-creative-jobs.mjs";

test("IOJ1 · Ein offener Job MIT Request-PR wird geholt", () => {
  const register = { jobs: [
    { contentId: "vu-a", state: "CREATIVE_JOB_DISPATCHED", prNumber: 170 }
  ] };
  const jobs = offeneJobsMitPr(register);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].contentId, "vu-a");
});

test("IOJ2 · Ein offener Job OHNE Request-PR wird nicht geholt", () => {
  /* Dafuer misst reconcile-creative-jobs.mjs bereits DISPATCH_NIE_ERFOLGT -
     ein Branch, den es nicht gibt, zu holen, waere kein Befund, nur ein
     Fehlschlag, der wie einer aussieht. */
  const register = { jobs: [
    { contentId: "vu-b", state: "CREATIVE_JOB_REQUESTED", prNumber: null }
  ] };
  assert.equal(offeneJobsMitPr(register).length, 0);
});

test("IOJ3 · Ein terminaler Job wird nicht erneut geholt", () => {
  /* CREATIVE_JOB_VERIFIED/FAILED/SUPERSEDED sind abgeschlossen - ein
     erneutes Holen waere doppelte Arbeit fuer eine Frage, die schon
     beantwortet ist. */
  const register = { jobs: [
    { contentId: "vu-c", state: "CREATIVE_JOB_VERIFIED", prNumber: 101 },
    { contentId: "vu-d", state: "CREATIVE_JOB_FAILED", prNumber: 102 }
  ] };
  assert.equal(offeneJobsMitPr(register).length, 0);
});

test("IOJ4 · Mehrere offene Jobs mit PR bleiben alle sichtbar", () => {
  /* Kein Job wird bevorzugt oder ausgelassen, nur weil ein anderer
     zuerst steht — jeder bekommt seinen eigenen Versuch. */
  const register = { jobs: [
    { contentId: "vu-e", state: "CREATIVE_JOB_DISPATCHED", prNumber: 170 },
    { contentId: "vu-f", state: "CREATIVE_JOB_IN_FLIGHT", prNumber: 171 },
    { contentId: "vu-g", state: "CREATIVE_JOB_RESULT_AVAILABLE", prNumber: 172 },
    { contentId: "vu-h", state: "CREATIVE_JOB_STALE", prNumber: 173 }
  ] };
  const ids = offeneJobsMitPr(register).map((j) => j.contentId);
  assert.deepEqual(ids, ["vu-e", "vu-f", "vu-g", "vu-h"]);
});
