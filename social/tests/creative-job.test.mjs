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

test("CJ4 · Gezaehlt werden Jobs, nicht Nummern", () => {
  /* Die erste Fassung wies `attempt: 4` allein wegen der NUMMER ab —
     auch auf einem leeren Register. Das traute einem Etikett mehr als
     dem Protokoll: die Nummer ist ein Identitaetsfeld des Briefs, kein
     Zaehler. Wer sie hochsetzt, hat noch nichts ausgeloest.

     Gezaehlt wird jetzt, was wirklich dispatcht wurde. */
  const leer = J.createRegistry([]);
  const vierte = Object.assign({}, SPEC, { attempt: 4,
    processingKey: "brief_test:vu-test-20260918:" + "d".repeat(40) + ":1.0" });
  assert.equal(leer.mayDispatch(vierte).ok, true,
    "ohne einen einzigen Dispatch gibt es nichts zu begrenzen");

  /* Mit drei protokollierten Anlaeufen greift die Grenze. */
  const drei = J.createRegistry([1, 2, 3].map((n) => ({
    creativeJobId: "job_t" + n, contentId: SPEC.contentId,
    processingKey: "brief_test:vu-test-20260918:" + String(n).repeat(40) + ":1.0",
    attempt: n, revision: null, state: "CREATIVE_JOB_FAILED" })));
  const darf = drei.mayDispatch(vierte);
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
  /* Nur AUSGELOESTE Jobs koennen eine Delivery haben. Ein frisch
     angelegter Job steht in CREATIVE_JOB_REQUESTED und hat noch keine -
     ihm eine zu unterstellen waere eine Behauptung ueber etwas, das
     noch nicht stattgefunden hat. */
  const ausgeloest = ECHT.filter((j) => j.prNumber);
  assert.ok(ausgeloest.length >= 8, "zu wenige ausgeloeste Jobs zum Pruefen");

  /* Geprueft wird KEINE Verdopplung, nicht "genau eine". Die erste
     Fassung verlangte exakt 1 - abgeleitet aus acht Jobs, die alle
     ausgeloest haben. PR 110 ist der neunte und hat gar nicht
     ausgeloest, weil er vertragswidrig war. Null ist aber kein
     Duplikat, und die Aussage dieses Tests ist die Abwesenheit von
     Duplikaten.

     Die Untergrenze an die Obergrenze zu binden hiesse, zwei
     verschiedene Behauptungen in einer Zusicherung zu fuehren. */
  ausgeloest.forEach((j) => {
    assert.ok((j.deliveryCount || 0) <= 1,
      "PR " + j.prNumber + " traegt " + j.deliveryCount + " Deliveries");
  });
  assert.ok(ausgeloest.filter((j) => j.deliveryCount === 1).length >= 8,
    "mindestens die acht historisch ausgeloesten Jobs muessen je eine tragen");

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
    j.state === "CREATIVE_JOB_VERIFIED" && j.durationSeconds);
  erfolgreichSchnell.forEach((j) =>
    assert.equal(j.observedStarts, 1,
      "PR " + j.prNumber + " lieferte und zeigt trotzdem " + j.observedStarts + " Starts"));

  /* Gemeint sind Jobs, deren LAUF gescheitert ist. Ein vertragswidriger
     Auftrag ist nie gelaufen - er wurde abgelehnt, bevor irgendetwas
     begann, und zeigt deshalb null Starts.

     Die beiden zusammenzuwerfen waere derselbe Fehler, der PR 110
     zwoelf Stunden gekostet hat: aus dem Ausbleiben eines Starts auf
     einen Fehler IM Lauf zu schliessen, statt auf einen Fehler VOR
     ihm. */
  const gelaufenUndGescheitert = ECHT.filter((j) =>
    j.state === "CREATIVE_JOB_FAILED" && j.failureType !== "CONTRACT_MISMATCH");
  assert.ok(gelaufenUndGescheitert.length >= 4);
  gelaufenUndGescheitert.forEach((j) =>
    assert.ok(j.observedStarts >= 5,
      "PR " + j.prNumber + " scheiterte mit nur " + j.observedStarts + " Starts"));

  /* Und die Gegenprobe: ein abgelehnter Auftrag zeigt keine Starts. */
  ECHT.filter((j) => j.failureType === "CONTRACT_MISMATCH").forEach((j) =>
    assert.equal(j.observedStarts, 0,
      "PR " + j.prNumber + " war vertragswidrig und zeigt trotzdem Starts"));
});

test("CJ12 · Der Ergebnis-Commit des Agenten loest keinen neuen Lauf aus", () => {
  /* Ein Negativbefund, der ausdruecklich festgehalten gehoert: die
     Sorge vor einer Rekursion ueber Result-Commits war unbegruendet.
     PRs 103, 106 und 108 haben einen Ergebnis-Commit (ein
     synchronize-Ereignis) und trotzdem nur ihre eine delivery_id.

     -----------------------------------------------------------------
     NULL HEISST NICHT ERFASST, NICHT KEINE

     Die erste Fassung prueft `deliveryCount === 1` fuer JEDEN
     verifizierten Job. Solange PR 112 auf IN_FLIGHT stand, sah sie ihn
     nicht. Nach dem Abgleich ist er verifiziert — und traegt
     deliveryCount 0 bei einer vorhandenen delivery_id. Die beiden
     Felder widersprechen sich in diesem Datensatz seit jeher; der
     Zaehler wurde fuer diesen PR nie gepflegt.

     0 belegt die Aussage nicht und verletzt sie auch nicht. Ein Test,
     der ihn durchfallen laesst, misst die Pflege eines Feldes und
     nicht die Rekursion, gegen die er steht. Gemessen wird deshalb
     dort, wo der Zaehler ERFASST ist — und dort muss er 1 sein.
     ----------------------------------------------------------------- */
  const verifiziert = ECHT.filter((j) =>
    j.state === "CREATIVE_JOB_VERIFIED" && j.prNumber);
  const erfasst = verifiziert.filter((j) => typeof j.deliveryCount === "number" &&
    j.deliveryCount > 0);

  assert.ok(erfasst.length >= 3,
    "Zu wenige verifizierte PRs mit erfasstem Zaehler: " + erfasst.length);
  erfasst.forEach((j) => assert.equal(j.deliveryCount, 1,
    "PR " + j.prNumber + ": der Ergebnis-Commit hat eine zweite Delivery erzeugt"));

  /* Und die Luecke bleibt sichtbar, statt still durchzugehen. */
  const ohne = verifiziert.filter((j) => !j.deliveryCount);
  if (ohne.length) {
    console.log("CJ12 · ohne erfassten Delivery-Zaehler: " +
      ohne.map((j) => "PR" + j.prNumber).join(", "));
  }
  assert.ok(ohne.length <= 1,
    "Mehr als ein verifizierter PR ohne Zaehler — das Feld verfaellt.");
});

test("CJ13 · Anlauf ist nicht Revision", () => {
  /* Ein ANLAUF wiederholt etwas Gescheitertes; unbegrenzt zu wiederholen
     hiesse, auf ein anderes Ergebnis derselben Sache zu hoffen. Eine
     REVISION ueberarbeitet etwas Gelungenes, weil ein Mensch es
     entschieden hat. Sie unter dieselbe Grenze zu stellen hiesse, eine
     Owner-Entscheidung als Fehlschlag zu zaehlen.

     Gefunden beim ersten echten Versuch: Anlauf 3 war erfolgreich, die
     Ueberarbeitung waere "Anlauf 4" gewesen, und das Gatter verweigerte
     sie mit der Begruendung, drei Versuche seien genug. Die Begruendung
     stimmte — fuer die falsche Sache. */
  const drei = [1, 2, 3].map((n) => ({
    creativeJobId: "job_c:sha" + n + ":attempt" + n,
    contentId: "vu-c-20260918", processingKey: "b:vu-c-20260918:sha" + n + ":1.0",
    attempt: n, revision: null, state: "CREATIVE_JOB_FAILED"
  }));
  const r = J.createRegistry(drei);

  /* Ein vierter ANLAUF ist zu viel. */
  const anlauf4 = { contentId: "vu-c-20260918", attempt: 4,
    processingKey: "b:vu-c-20260918:sha4:1.0" };
  assert.equal(r.mayDispatch(anlauf4).reason, "attemptBudget");

  /* Eine REVISION derselben Nummer ist es nicht. */
  const revision = Object.assign({}, anlauf4, { revision: "text-only" });
  assert.equal(r.mayDispatch(revision).ok, true,
    r.mayDispatch(revision).message);
});

test("CJ14 · Auch Revisionen sind begrenzt — aber eigenstaendig", () => {
  /* Wenn drei Runden denselben Text nicht tragen, ist die ANWEISUNG das
     Problem und nicht der Text. Dann gehoert es vor den Owner und nicht
     in eine vierte Runde. */
  const drei = [1, 2, 3].map((n) => ({
    creativeJobId: "job_d:r" + n, contentId: "vu-d-20260918",
    processingKey: "b:vu-d-20260918:r" + n + ":1.0",
    attempt: n + 1, revision: "text-only", state: "CREATIVE_JOB_VERIFIED"
  }));
  const r = J.createRegistry(drei);
  const vierte = { contentId: "vu-d-20260918", attempt: 5, revision: "text-only",
    processingKey: "b:vu-d-20260918:r4:1.0" };
  const darf = r.mayDispatch(vierte);
  assert.equal(darf.ok, false);
  assert.equal(darf.reason, "revisionBudget");
  assert.match(darf.message, /gehoert vor den Owner/);

  /* Ein echter Anlauf bleibt daneben moeglich — die Zaehler sind
     getrennt, nicht nur verschieden benannt. */
  assert.equal(r.mayDispatch({ contentId: "vu-d-20260918", attempt: 5,
    processingKey: "b:vu-d-20260918:a1:1.0" }).ok, true);
});
