/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/creative-job.test.mjs

   Ein logischer Job pro Anfrage. Diese Tests halten die Grenze fest —
   und die Befunde aus den realen Deliveries, damit eine spaetere
   Aenderung sie nicht still verschiebt.

   Kein Test hier loest eine Work-Ausfuehrung aus.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const J = require("../engines/creative-job.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ECHT = JSON.parse(readFileSync(
  join(ROOT, "social/data/creative-jobs.json"), "utf8")).jobs;

const SPEC = {
  contentId: "vu-test-20260918", briefId: "brief_test",
  briefBlobSha: "a".repeat(40),
  processingKey: "brief_test:vu-test-20260918:" + "a".repeat(40) + ":1.0",
  attempt: 1
};

/* ------------------------------------------------------------------ */
/* DIE GRENZE                                                          */
/* ------------------------------------------------------------------ */

test("CJ1 · Ein zweiter Dispatch zum selben Schluessel faellt geschlossen", () => {
  /* Die Owner-Vorgabe woertlich: 1 logical content request -> max. 1
     externally requested Creative Job. Ein zweiter Dispatch ist eine
     zweite Anfrage fuer dieselbe Arbeit und kostet dieselbe begrenzte
     Ressource noch einmal. */
  const r = J.createRegistry([]);
  r.dispatch(SPEC, { now: "2026-09-18T08:00:00Z" });

  const darf = r.mayDispatch(SPEC);
  assert.equal(darf.ok, false);
  assert.equal(darf.reason, "alreadyDispatched");

  /* Und zwar als Wurf, nicht als Vermerk: wer trotzdem dispatcht, hat
     eine falsche Annahme ueber die Welt. */
  assert.throws(() => r.dispatch(SPEC), (e) => e.code === "alreadyDispatched");
});

test("CJ2 · Keine parallelen Anlaeufe desselben Inhaltsobjekts", () => {
  /* Zwei gleichzeitige Anlaeufe erzeugen zwei Ergebnisse fuer dieselbe
     content_id. Welches gewaenne, entschiede die Ankunft — also der
     Zufall. */
  const r = J.createRegistry([]);
  r.dispatch(SPEC, { now: "2026-09-18T08:00:00Z" });
  const job = r.all()[0];
  r.transition(job.creativeJobId, "CREATIVE_JOB_DISPATCHED", { prNumber: 1 });

  const zweiterAnlauf = Object.assign({}, SPEC, {
    briefBlobSha: "b".repeat(40), attempt: 2,
    processingKey: "brief_test:vu-test-20260918:" + "b".repeat(40) + ":1.0" });

  const darf = r.mayDispatch(zweiterAnlauf);
  assert.equal(darf.ok, false);
  assert.equal(darf.reason, "concurrentJob");
});

test("CJ3 · Nach Abschluss darf der naechste Anlauf starten", () => {
  /* Die Gegenprobe: die Grenze sperrt Gleichzeitigkeit, nicht den
     Betrieb. Sonst waere sie keine Grenze, sondern ein Riegel. */
  const r = J.createRegistry([]);
  r.dispatch(SPEC, { now: "2026-09-18T08:00:00Z" });
  const job = r.all()[0];
  r.transition(job.creativeJobId, "CREATIVE_JOB_DISPATCHED", { prNumber: 1 });
  r.transition(job.creativeJobId, "CREATIVE_JOB_FAILED", { note: "Transport" });

  const zweiter = Object.assign({}, SPEC, {
    briefBlobSha: "b".repeat(40), attempt: 2,
    processingKey: "brief_test:vu-test-20260918:" + "b".repeat(40) + ":1.0" });
  assert.equal(r.mayDispatch(zweiter).ok, true);
});

test("CJ4 · Die Anlaufgrenze ist eine Entscheidung, kein Automatismus", () => {
  const r = J.createRegistry([]);
  const zuViel = Object.assign({}, SPEC, { attempt: 4,
    processingKey: "brief_test:vu-test-20260918:" + "d".repeat(40) + ":1.0" });
  const darf = r.mayDispatch(zuViel);
  assert.equal(darf.ok, false);
  assert.equal(darf.reason, "attemptBudget");
  assert.equal(J.BUDGET.maxAttemptsPerContentId, 3);
});

test("CJ5 · Diagnostische Jobs gehoeren nicht in den Produktionspfad", () => {
  /* Am 17.09. liefen drei davon und verbrauchten dieselbe begrenzte
     Ressource wie echte Inhalte. */
  const r = J.createRegistry([]);
  const diag = Object.assign({}, SPEC, { contentId: "vu-diag-baseline-20260918",
    processingKey: "x:vu-diag-baseline-20260918:" + "c".repeat(40) + ":1.0" });

  assert.equal(r.mayDispatch(diag, { productionPath: true }).reason,
    "diagnosticInProduction");
  /* Ausserhalb des Produktionspfads bleibt er moeglich — mit Absicht. */
  assert.equal(r.mayDispatch(diag, { productionPath: false }).ok, true);

  assert.equal(J.istDiagnostisch("vu-diag-size-20260917"), true);
  assert.equal(J.istDiagnostisch("vu-permcheck-20260918"), true);
  assert.equal(J.istDiagnostisch("vu-image-trigger-proof-20260917-001"), true);
  /* Im Zweifel produktiv: was nicht eindeutig diagnostisch ist, wird
     nach der strengeren Regel behandelt. */
  assert.equal(J.istDiagnostisch("vu-xom-20260911"), false);
});

test("CJ6 · Ohne Processing Key gibt es keinen Dispatch", () => {
  const r = J.createRegistry([]);
  assert.equal(r.mayDispatch({ contentId: "x" }).reason, "noProcessingKey");
  assert.equal(r.mayDispatch({ processingKey: "k" }).reason, "noContentId");
});

/* ------------------------------------------------------------------ */
/* DIE ZUSTAENDE                                                       */
/* ------------------------------------------------------------------ */

test("CJ7 · Ein abgeschlossener Job wird nicht wiederbelebt", () => {
  const r = J.createRegistry([]);
  const job = r.dispatch(SPEC, { now: "2026-09-18T08:00:00Z" });
  r.transition(job.creativeJobId, "CREATIVE_JOB_DISPATCHED");
  r.transition(job.creativeJobId, "CREATIVE_JOB_RESULT_AVAILABLE");
  r.transition(job.creativeJobId, "CREATIVE_JOB_VERIFIED");

  assert.throws(() => r.transition(job.creativeJobId, "CREATIVE_JOB_IN_FLIGHT"),
    (e) => e.code === "illegalTransition");
});

test("CJ8 · STALE ist kein Endzustand", () => {
  /* Dieselbe Begruendung wie im Ledger: "wir haben nichts gesehen" ist
     keine Aussage darueber, dass nichts mehr kommt. PR 105 hat nach elf
     Stunden noch gemeldet. */
  assert.equal(J.TERMINAL.includes("CREATIVE_JOB_STALE"), false);

  const r = J.createRegistry([]);
  const job = r.dispatch(SPEC, { now: "2026-09-18T08:00:00Z" });
  r.transition(job.creativeJobId, "CREATIVE_JOB_DISPATCHED");
  r.transition(job.creativeJobId, "CREATIVE_JOB_STALE");
  /* Ein spaetes Ergebnis darf noch ankommen. */
  assert.doesNotThrow(() =>
    r.transition(job.creativeJobId, "CREATIVE_JOB_RESULT_AVAILABLE"));
});

test("CJ9 · Die Kennung kommt aus der Identitaet, nicht aus einem Zaehler", () => {
  /* Ein Zaehler machte zwei Laeufe ueber dieselbe Arbeit zu zwei
     verschiedenen Dingen — und damit die Entdopplung unmoeglich. */
  const a = J.jobId({ contentId: "c", briefBlobSha: "sha", attempt: 2 });
  const b = J.jobId({ contentId: "c", briefBlobSha: "sha", attempt: 2 });
  assert.equal(a, b);
  assert.notEqual(a, J.jobId({ contentId: "c", briefBlobSha: "sha", attempt: 3 }));
});

/* ------------------------------------------------------------------ */
/* DIE REALEN DELIVERIES                                               */
/* ------------------------------------------------------------------ */

test("CJ10 · VU hat nie eine doppelte Delivery erzeugt", () => {
  /* Der zentrale Befund der Trigger-Analyse, als Test festgehalten:
     acht logische Jobs, acht Deliveries. Jeder Request-PR traegt genau
     EINE delivery_id, und alle Starts desselben PRs nennen dieselbe.

     Faellt dieser Test spaeter, hat VU angefangen, mehrfach
     auszuloesen — und das waere unsere Schuld und nicht die des
     Anbieters. */
  ECHT.forEach((j) => {
    assert.equal(j.deliveryCount, 1,
      "PR " + j.prNumber + " traegt " + j.deliveryCount + " Deliveries");
  });

  const keys = {};
  ECHT.forEach((j) => { keys[j.processingKey] = (keys[j.processingKey] || 0) + 1; });
  Object.keys(keys).forEach((k) =>
    assert.equal(keys[k], 1, "zwei Jobs zum selben Schluessel: " + k));
});

test("CJ11 · Die Vervielfachung haengt am Scheitern, nicht am Ausloesen", () => {
  /* Der Befund, auf dem die Einstufung beruht.

     Jobs, die beim ersten Lauf lieferten, zeigen GENAU EINEN Start.
     Jobs, deren Lauf scheiterte, zeigen fuenf bis sechs. Dazwischen
     liegt kein Unterschied in der Ausloesung: gleiche Branch-Konvention,
     gleicher Titel, gleicher Draft-Zustand, gleiche eine Delivery.

     Waere die Vervielfachung eine Frage der Trigger-Konfiguration,
     muesste sie auch die erfolgreichen Jobs treffen. Sie tut es nicht. */
  const erfolgreichSchnell = ECHT.filter((j) =>
    j.state === "CREATIVE_JOB_VERIFIED" && j.durationSeconds !== null);
  erfolgreichSchnell.forEach((j) =>
    assert.equal(j.observedStarts, 1,
      "PR " + j.prNumber + " lieferte und zeigt trotzdem " + j.observedStarts + " Starts"));

  const gescheitert = ECHT.filter((j) => j.state === "CREATIVE_JOB_FAILED");
  assert.ok(gescheitert.length >= 4);
  gescheitert.forEach((j) =>
    assert.ok(j.observedStarts >= 5,
      "PR " + j.prNumber + " scheiterte mit nur " + j.observedStarts + " Starts"));
});

test("CJ12 · Der Ergebnis-Commit des Agenten loest keinen neuen Lauf aus", () => {
  /* Ein Negativbefund, der ausdruecklich festgehalten gehoert: die
     Sorge vor einer Rekursion ueber Result-Commits war unbegruendet.
     PRs 103, 106 und 108 haben einen Ergebnis-Commit (ein
     synchronize-Ereignis) und trotzdem nur ihre eine delivery_id. */
  const mitErgebnis = ECHT.filter((j) => j.state === "CREATIVE_JOB_VERIFIED");
  assert.ok(mitErgebnis.length >= 3);
  mitErgebnis.forEach((j) => assert.equal(j.deliveryCount, 1,
    "PR " + j.prNumber + ": der Ergebnis-Commit hat eine zweite Delivery erzeugt"));
});
