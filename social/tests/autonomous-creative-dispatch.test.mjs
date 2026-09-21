/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/autonomous-creative-dispatch.test.mjs

   DER LETZTE SCHRITT, DEN BISHER EIN MENSCH GETAN HAT

   Solange ein Mensch den Request-PR oeffnen musste, stand der Owner an
   zwei Stellen statt an einer. Diese Tests halten fest, dass der
   Scheduler ihn jetzt selbst oeffnet - und, wichtiger, unter welchen
   Bedingungen er es NICHT tut.

   Der teure Teil ist nicht der Dispatch. Der teure Teil ist der
   Dispatch, den niemand beschlossen hat.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Orchestrator = require("../engines/orchestrator.js");
const Job = require("../engines/creative-job.js");

const WORKFLOW = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");

/* Ein Spec, das durchgeht - damit jeder Test genau EINE Sache kaputt macht. */
function frei(overrides = {}) {
  return Object.assign({
    halted: false,
    candidateDue: true,
    contentId: "vu-xom-20260917",
    hasAuthoringResult: false,
    openJobs: [],
    evidenceSufficient: true,
    dispatchGate: { ok: true }
  }, overrides);
}

/* ------------------------------------------------------------------ */
/* §3 · DIE ENTSCHEIDUNG                                               */
/* ------------------------------------------------------------------ */

test("AD1 · Alles frei ergibt CREATIVE_JOB_REQUIRED", () => {
  const e = Orchestrator.creativeJobDecision(frei());
  assert.equal(e.required, true);
  assert.equal(e.decision, "CREATIVE_JOB_REQUIRED");
  assert.equal(e.contentId, "vu-xom-20260917");
});

test("AD2 · Ohne faelligen Kandidaten kein Job", () => {
  /* §5/§6: ein Scheduler-Lauf allein ist kein Grund. */
  const e = Orchestrator.creativeJobDecision(frei({ candidateDue: false }));
  assert.equal(e.required, false);
  assert.equal(e.code, "NO_CANDIDATE_DUE");
});

test("AD3 · Liegt das Ergebnis vor, wird nichts nachbestellt", () => {
  const e = Orchestrator.creativeJobDecision(frei({ hasAuthoringResult: true }));
  assert.equal(e.code, "RESULT_ALREADY_PRESENT");
});

test("AD4 · Ein laufender Job verhindert den naechsten", () => {
  /* §4 woertlich: ein neuer Scheduler-Lauf darf keinen neuen PR
     erzeugen, nur weil der vorherige Job noch nicht fertig ist. */
  const e = Orchestrator.creativeJobDecision(frei({
    openJobs: [{ creativeJobId: "cj_1", state: "CREATIVE_JOB_IN_FLIGHT" }] }));
  assert.equal(e.code, "JOB_IN_FLIGHT");
  assert.match(e.explanation, /cj_1/);
});

test("AD5 · Ohne tragende Evidenz kein Job", () => {
  const e = Orchestrator.creativeJobDecision(frei({ evidenceSufficient: false }));
  assert.equal(e.code, "EVIDENCE_INSUFFICIENT");
});

test("AD6 · Ungeprueft ist nicht hinreichend", () => {
  /* Fail closed: `undefined` ist kein `true`. */
  const spec = frei();
  delete spec.evidenceSufficient;
  assert.equal(Orchestrator.creativeJobDecision(spec).code, "EVIDENCE_INSUFFICIENT");
});

test("AD7 · Ohne Budgetbefund wird nicht bestellt", () => {
  const spec = frei();
  delete spec.dispatchGate;
  const e = Orchestrator.creativeJobDecision(spec);
  assert.equal(e.code, "BUDGET");
  assert.match(e.explanation, /ungeprueft ist nicht frei/);
});

test("AD8 · Das Budget hat das letzte Wort", () => {
  const e = Orchestrator.creativeJobDecision(frei({
    dispatchGate: { ok: false, reason: "attemptBudget", message: "Drei Anlaeufe." } }));
  assert.equal(e.code, "BUDGET");
  assert.match(e.explanation, /attemptBudget/);
});

test("AD9 · HALT schlaegt alles", () => {
  assert.equal(Orchestrator.creativeJobDecision(frei({ halted: true })).code, "HALTED");
});

test("AD10 · Jeder Ablehnungsgrund ist eine eigene Aussage", () => {
  /* "Nicht noetig" ist die Zusammenfassung, nicht der Befund. Wer nur
     ein Flag setzt, kann spaeter nicht sagen, WORAN es lag. */
  const gruende = Object.keys(Orchestrator.KEIN_JOB);
  assert.ok(gruende.length >= 6);
  for (const g of gruende) {
    assert.ok(Orchestrator.KEIN_JOB[g].length > 25, g + " erklaert nichts");
  }
});

/* ------------------------------------------------------------------ */
/* §4 · HARTE IDEMPOTENZ                                               */
/* ------------------------------------------------------------------ */

test("AD11 · Ein Job je processing_key, egal in welchem Zustand", () => {
  for (const state of Job.STATES) {
    const r = Job.createRegistry([{ creativeJobId: "cj", processingKey: "pk",
      contentId: "c", state }]);
    const d = r.mayDispatch({ processingKey: "pk", contentId: "c" });
    assert.equal(d.ok, false, "Zustand " + state + " liess einen zweiten durch");
    assert.equal(d.reason, "alreadyDispatched");
  }
});

test("AD12 · Ein Brief ohne PR blockiert den naechsten Anlauf", () => {
  /* CREATIVE_JOB_REQUESTED fehlte in OFFEN: ein Job mit geschriebenem
     Brief und ohne Pull Request zaehlte weder als offen noch als
     abgeschlossen. Solange ein Mensch den PR oeffnete, war der
     Zwischenraum Sekunden lang; ein Scheduler kann darin abbrechen. */
  const r = Job.createRegistry([{ creativeJobId: "cj1", processingKey: "pk1",
    contentId: "c1", state: "CREATIVE_JOB_REQUESTED" }]);
  const d = r.mayDispatch({ processingKey: "pk2", contentId: "c1" });
  assert.equal(d.ok, false);
  assert.equal(d.reason, "concurrentJob");
});

test("AD13 · Jeder Zustand ist entweder offen oder endgueltig", () => {
  /* Die allgemeine Fassung von AD12: ein Zustand, der in keiner der
     beiden Listen steht, blockiert nichts und schliesst nichts ab. */
  for (const s of Job.STATES) {
    const offen = Job.OFFEN.includes(s);
    const fertig = Job.TERMINAL.includes(s);
    assert.ok(offen !== fertig, s + " ist weder offen noch endgueltig");
  }
});

test("AD14 · Die Vorpruefung ist dieselbe Regel, nicht eine zweite", () => {
  /* mayDispatchContent existiert, weil der Processing Key erst aus dem
     fertigen Brief entsteht. Es darf aber keine zweite Fassung der
     Grenzen sein - also muss mayDispatch bei denselben Eingaben
     denselben Befund liefern. */
  const bestand = [{ creativeJobId: "cj", processingKey: "pk", contentId: "c",
    state: "CREATIVE_JOB_IN_FLIGHT" }];
  const r = Job.createRegistry(bestand);
  const vor = r.mayDispatchContent({ contentId: "c" }, { productionPath: true });
  const voll = r.mayDispatch({ processingKey: "anderer", contentId: "c" },
    { productionPath: true });
  assert.equal(vor.reason, voll.reason);
});

test("AD15 · Keine Diagnosejobs im Produktionspfad", () => {
  const r = Job.createRegistry([]);
  assert.equal(r.mayDispatchContent({ contentId: "vu-diag-probe" },
    { productionPath: true }).reason, "diagnosticInProduction");
  assert.equal(Job.BUDGET.diagnosticJobsInProduction, 0);
});

/* ------------------------------------------------------------------ */
/* §3 · DER PULL REQUEST                                               */
/* ------------------------------------------------------------------ */

test("AD16 · Branch und Titel haben je EINE Definition", async () => {
  const R = await import("../../scripts/social/open-creative-request.mjs");
  assert.equal(R.branchFor("vu-xom-1"), "authoring/request/vu-xom-1");
  assert.equal(R.titleFor("vu-xom-1"), "VU-AUTHORING-REQUEST: vu-xom-1");
  /* Und der Branchname passt zu dem, was die Wache erwartet. */
  const V = await import("../../scripts/social/verify-creative-dispatch.mjs");
  assert.equal(V.contentIdAus(R.branchFor("vu-xom-1")), "vu-xom-1");
});

test("AD17 · Ohne Brief, ohne Job, im falschen Zustand: kein PR", async () => {
  const R = await import("../../scripts/social/open-creative-request.mjs");
  const job = { creativeJobId: "cj", contentId: "c", state: "CREATIVE_JOB_REQUESTED" };

  assert.equal(R.pruefe({ contentId: "c", briefExists: false, jobs: [job] }).reason,
    "noBrief");
  assert.equal(R.pruefe({ contentId: "c", briefExists: true, jobs: [] }).reason,
    "noJob");
  assert.equal(R.pruefe({ contentId: "c", briefExists: true,
    jobs: [Object.assign({}, job, { state: "CREATIVE_JOB_DISPATCHED" })] }).reason,
    "wrongState");
  assert.equal(R.pruefe({ contentId: "c", briefExists: true,
    jobs: [Object.assign({}, job, { prNumber: 116 })] }).reason, "prExists");
  assert.equal(R.pruefe({ contentId: "c", briefExists: true, jobs: [job],
    branchExists: true }).reason, "branchExists");

  const ok = R.pruefe({ contentId: "c", briefExists: true, jobs: [job] });
  assert.equal(ok.ok, true);
  assert.equal(ok.branch, "authoring/request/c");
});

test("AD18 · Der PR-Text nennt Job, Schluessel und Grund", async () => {
  /* Ein Request-PR ohne Herkunft ist ein Dispatch, den niemand
     beschlossen hat - auch dann, wenn er beschlossen wurde. */
  const R = await import("../../scripts/social/open-creative-request.mjs");
  const body = R.bodyFor("vu-xom-1",
    { creativeJobId: "cj_1", processingKey: "pk_1", attempt: 1 },
    "Kandidat faellig.");
  assert.match(body, /cj_1/);
  assert.match(body, /pk_1/);
  assert.match(body, /Kandidat faellig\./);
  assert.match(body, /FULL_CREATIVE/);
  assert.match(body, /Veroeffentlicht wird dadurch nichts/);
});

/* ------------------------------------------------------------------ */
/* §6 · SCHEDULER-FREQUENZ IST NICHT CREATIVE-FREQUENZ                 */
/* ------------------------------------------------------------------ */

test("AD19 · Der Dispatch haengt an der Entscheidung, nicht am Lauf", () => {
  /* -----------------------------------------------------------------
     GEPRUEFT WIRD DIE BEDINGUNG, NICHT IHRE SCHREIBWEISE

     Der erste Anlauf suchte die Zeile `if: steps.plan.outputs.creative
     == 'ja'` woertlich. Als die Lauf-Lease (§5) als zweite Bedingung
     dazukam, wurde aus der einen Zeile ein mehrzeiliger Block - und
     der Test meldete einen Fehler, obwohl die Bedingung unveraendert
     dastand und sogar strenger geworden war.

     Wieder ein Pruefer, der korrekten Text verbietet. Gesucht wird
     jetzt im if-Block des Schritts, nicht nach einer Formatierung. */
  const ab = WORKFLOW.indexOf("- name: CREATIVE JOB");
  assert.ok(ab > 0, "Der Schritt fehlt");
  const block = WORKFLOW.slice(ab, ab + 500);
  assert.match(block, /steps\.plan\.outputs\.creative == 'ja'/,
    "Der Dispatch haengt nicht mehr an der Entscheidung");
  /* Und der Orchestrator gibt diese Zeile nur aus, wenn er sie
     entschieden hat. */
  const runner = readFileSync("scripts/social/run-orchestrator.mjs", "utf8");
  assert.match(runner, /"creative=" \+ \(creative\.required \? "ja" : "nein"\)/);
});

test("AD20 · Kein zweiter Ausloesemechanismus", () => {
  /* §3 woertlich. Der Workflow ruft die BESTEHENDEN Skripte - wer hier
     etwas anderes einsetzt, baut einen zweiten Weg in dieselbe
     begrenzte Ressource. */
  for (const s of ["request-creative.mjs", "dispatch-creative-job.mjs",
                   "open-creative-request.mjs"]) {
    assert.ok(WORKFLOW.includes(s), "Der Workflow ruft " + s + " nicht auf");
  }
  /* Und keine klassische OpenAI-API. */
  assert.equal(/openai|OPENAI_API_KEY/i.test(WORKFLOW), false);
});

test("AD21 · Die Wache laeuft auch dort, wo pull_request nicht feuert", () => {
  /* Ein PR, den GITHUB_TOKEN oeffnet, loest in diesem Repository keine
     Workflows aus. creative-job-guard.yml schwiege damit ausgerechnet
     fuer die automatisch erzeugten Requests. */
  assert.match(WORKFLOW, /verify-creative-dispatch\.mjs/);
});

test("AD22 · Der Orchestrator darf Pull Requests oeffnen", () => {
  /* Ohne dieses Recht endet der Dispatch genau dort, wo er frueher
     einen Menschen brauchte - und zwar erst zur Laufzeit. */
  assert.match(WORKFLOW, /pull-requests:\s*write/);
});

/* ------------------------------------------------------------------ */
/* §9 · NICHTS DAVON VEROEFFENTLICHT                                   */
/* ------------------------------------------------------------------ */

test("AD23 · Kein Creative Job ruehrt die Autopublish-Schalter an", () => {
  const dateien = ["scripts/social/request-creative.mjs",
    "scripts/social/dispatch-creative-job.mjs",
    "scripts/social/open-creative-request.mjs"];
  for (const d of dateien) {
    const t = readFileSync(d, "utf8");
    assert.equal(/kill-switch\.json|GLOBAL_AUTOPUBLISH|VU_SOCIAL_AUTOPUBLISH/.test(t),
      false, d + " fasst einen Schalter an");
  }
});

/* ------------------------------------------------------------------ */
/* §8 · KEINE STEHENDE DEPLOY-ANFORDERUNG MEHR                         */
/* ------------------------------------------------------------------ */

test("AD24 · DEPLOY_REQUEST liegt nicht mehr im Repository", () => {
  /* Solange die Datei dalag, deployte jeder Push auf claude/**, der
     einen der Trigger-Pfade beruehrte, den Worker. Am 20.09. hat so
     eine Korrektur an einer CI-Pruefung ein Deployment ausgeloest -
     folgenlos, aber von niemandem beschlossen.

     Ihr Grund war echt und ist entfallen: ohne Workflow auf main gab
     es keinen Dispatch-Knopf. Den gibt es jetzt. */
  const { existsSync } = require("node:fs");
  assert.equal(existsSync("workers/vision-universe-social/DEPLOY_REQUEST"), false);
});

test("AD25 · Ohne die Datei deployt ein Push nicht", () => {
  /* Die Entscheidung steht im Workflow und nicht in einer Erinnerung:
     ohne Anforderungsdatei faellt die Betriebsart auf Preflight. */
  const cf = readFileSync(".github/workflows/social-cloudflare.yml", "utf8");
  assert.match(cf, /Push ohne DEPLOY_REQUEST — nur Preflight/);
  /* Und ein Deploy per Dispatch verlangt weiterhin die getippte
     Bestaetigung. */
  assert.match(cf, /confirm_deploy \}\}" != "DEPLOY"/);
});

/* ------------------------------------------------------------------ */
/* §5 · AUTONOM HEISST NICHT UNBEGRENZT                                */
/* ------------------------------------------------------------------ */

test("AD26 · Hoechstens ein offener Creative Job, ueberhaupt", () => {
  /* Das Budget in creative-job.js begrenzt je processing_key und je
     content_id. Gemessen ist aber etwas anderes: ein SCHEITERNDER
     Work-Lauf wird anbieterintern wiederholt, ohne beobachtbare
     Obergrenze (8 Jobs, 32 Starts; PR 105 meldete nach 11 h 13 min
     noch). Ein Abbruchsignal hat VU nicht.

     Solange ein Mensch den Request-PR oeffnete, war er in genau dem
     Moment anwesend, in dem dieser Zweig beginnt. Der Scheduler ist es
     nicht - also bleibt als Grenze die Zahl gleichzeitig offener
     Jobs. */
  const e = Orchestrator.creativeJobDecision(frei({
    allOpenJobs: [{ creativeJobId: "cj9", contentId: "ein-anderer" }] }));
  assert.equal(e.required, false);
  assert.equal(e.code, "ANOTHER_JOB_OPEN");
  assert.match(e.explanation, /ein-anderer/);
});

test("AD27 · Ohne offene Jobs bleibt der Weg frei", () => {
  assert.equal(Orchestrator.creativeJobDecision(frei({ allOpenJobs: [] })).required,
    true);
});

test("AD28 · Der Orchestrator zaehlt die offenen Jobs wirklich", () => {
  /* Eine Grenze, die der Aufrufer nie befuellt, ist keine Grenze. */
  const runner = readFileSync("scripts/social/run-orchestrator.mjs", "utf8");
  assert.match(runner, /allOpenJobs: alleOffen/);
  assert.match(runner, /register\.jobs \|\| \[\]\)\.filter/);
});

/* =========================================================================
   AD29 — ROTER CODE SCHREIBT KEINE PRODUKTIONSDATEN

   Zwei Schritte des Workflows haben diese Regel getragen, ohne dass sie
   je geprueft wurde: die Suite und die Isolationspruefung liefen ganz
   oben, und wer sie verschiebt, merkt es an nichts.

   Beim Umstellen auf verify-suites.mjs ist genau das aufgefallen: die
   beiden Schritte liessen sich ersetzen, und keine einzige Zusicherung
   hat sich geruehrt. Ein Waechter, der nur aus Reihenfolge besteht.
   ========================================================================= */
/* Ein Kommentar ist keine Handlung.

   AD29 fand "verify-suites.mjs" beim ersten Versuch im ERKLAERBLOCK
   ueber dem Schritt - und hielt die Erklaerung fuer die Ausfuehrung.
   Verschiebt man den Schritt ans Ende, bleibt die Fundstelle oben, und
   der Test haelt weiter.

   Derselbe Fehler steckte in SCHEDULER_NEVER_PUBLISHES (decide-candidate
   aus einem YAML-Kommentar) und in OD12 (is-ancestor aus dem eigenen
   Kommentar). Deshalb steht die Antwort hier EINMAL. */
function ohneKommentare(yaml) {
  return yaml.split("\n").map((z) => z.replace(/(^|\s)#.*$/, "")).join("\n");
}

test("AD29 · Gemessen wird, BEVOR irgendetwas schreibt", () => {
  const AUSGEFUEHRT = ohneKommentare(WORKFLOW);
  const messen = AUSGEFUEHRT.indexOf("verify-suites.mjs");
  assert.ok(messen > 0,
    "Der Workflow misst Suiten und Isolation gar nicht mehr");

  /* Jeder Schritt, der Zustand veraendert - egal ob im Repository, in
     der Warteschlange oder beim Creative-Provider. */
  const schreibend = [
    "run-social-cycle.mjs",       // baut Pakete
    "make-publish-candidate.mjs", // erzeugt den Kandidaten
    "dispatch-creative-job.mjs",  // verbraucht Work-Budget
    "publish-approval-queue.mjs", // schreibt in den Worker
    "git commit"                  // schreibt ins Repository
  ];

  for (const name of schreibend) {
    const stelle = AUSGEFUEHRT.indexOf(name);
    if (stelle === -1) continue;   // nicht jeder Schritt muss es geben
    assert.ok(messen < stelle,
      name + " steht VOR der Messung. Ein Lauf auf rotem Code wuerde " +
      "dann Fehler in Produktionsdaten schreiben, bevor jemand es merkt.");
  }
});

test("AD30 · Der Reifebericht bekommt keine Behauptung mehr hereingereicht", () => {
  /* `--suites-green "social/tests (Zeitpunkt)"` war ehrlicher als in der
     CI - der Schritt brach oben ab, wenn die Suite rot war - aber es
     blieb eine Behauptung in Textform: keine Zahl, kein Stand, und
     vierzehn uebersprungene Tests waeren darin unsichtbar geblieben. */
  assert.ok(!/--suites-green|--isolation-proven/.test(ohneKommentare(WORKFLOW)),
    "Der Reifebericht bekommt den Suitenzustand wieder als Fahne");
});
