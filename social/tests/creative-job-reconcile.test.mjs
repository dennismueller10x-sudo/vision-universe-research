/* =========================================================================
   VISION UNIVERSE SOCIAL — DER RUECKWEG INS JOB-REGISTER (CR1–CR16)

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   Ein Creative Job stand 51 Stunden auf CREATIVE_JOB_IN_FLIGHT und
   blockierte MAX_OPEN_CREATIVE_JOBS = 1. Sein Ergebnis lag seit zehn
   Minuten nach dem Start im Repository, das Ledger nannte denselben
   processing_key COMPLETED, und eine Revision hatte ihn ueberholt.

       ingest-creative.mjs  schrieb  ->  creative-invocations.json
       run-orchestrator.mjs zaehlte  <-  creative-jobs.json

   Zwei Register fuer dieselbe Tatsache, und nur eines wurde
   fortgeschrieben. Ohne Bruecke blockiert so ein Job FUER IMMER: eine
   Altersregel, die ihn freigaebe, gibt es nicht — und soll es nicht
   geben.

   -------------------------------------------------------------------------
   WOGEGEN DIESE SUITE STEHT
   -------------------------------------------------------------------------

   Gegen die naechstliegende Reparatur: das Alter zum Beweis machen.
   51 Stunden, also tot. Das ist kein Beweis, sondern Ungeduld — PR 105
   hat nach elf Stunden noch geliefert. Die Liste zulaessiger Evidenz
   ist deshalb Code und kein Kommentar, und CR7 prueft, dass sie
   zurueckweist.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Job = require(join(ROOT, "social/engines/creative-job.js"));

function job(over = {}) {
  return Object.assign({
    creativeJobId: "job_test:sha:attempt1",
    contentId: "vu-test",
    briefId: "brief_test",
    processingKey: "brief_test:vu-test:sha:1.0",
    state: "CREATIVE_JOB_IN_FLIGHT",
    createdAt: "2026-09-19T06:00:00.000Z",
    updatedAt: "2026-09-19T07:00:00.000Z",
    deliveryIds: [],
    history: [{ state: "CREATIVE_JOB_REQUESTED", at: "2026-09-19T06:00:00.000Z" }]
  }, over);
}

/* ------------------------------------------------ Die Zustandsmaschine */

test("CR1 · UEBERHOLT ist ein eigener terminaler Zustand", () => {
  /* FAILED waere eine Aussage ueber den Agenten, die niemand belegen
     kann: ein ueberholter Job hat nicht geliefert, aber auch nichts
     falsch gemacht. */
  assert.ok(Job.STATES.includes("CREATIVE_JOB_SUPERSEDED"));
  assert.ok(Job.TERMINAL.includes("CREATIVE_JOB_SUPERSEDED"));
  assert.ok(!Job.OFFEN.includes("CREATIVE_JOB_SUPERSEDED"),
    "Ein ueberholter Job darf den Slot nicht weiter belegen.");
});

test("CR2 · OFFEN ist unveraendert — der Slot wird nicht heimlich weiter", () => {
  /* MAX_OPEN_CREATIVE_JOBS haengt an genau dieser Liste. Wer hier
     etwas herausnimmt, lockert die Grenze, ohne sie zu nennen. */
  assert.deepEqual(Job.OFFEN, ["CREATIVE_JOB_REQUESTED", "CREATIVE_JOB_DISPATCHED",
    "CREATIVE_JOB_IN_FLIGHT", "CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_STALE"]);
  assert.ok(Job.OFFEN.includes("CREATIVE_JOB_STALE"),
    "STALE bleibt offen: Alter allein gibt den Slot nicht frei.");
});

test("CR3 · Reconcile GEHT den Weg, es springt nicht", () => {
  const r = Job.createRegistry([job()]);
  const a = r.reconcile("job_test:sha:attempt1", "RESULT_VERIFIED",
    { now: "2026-09-21T12:00:00Z" });

  assert.equal(a.geaendert, true);
  assert.equal(a.from, "CREATIVE_JOB_IN_FLIGHT");
  assert.equal(a.to, "CREATIVE_JOB_VERIFIED");
  /* Der Zwischenschritt steht in der History. Ein Sprung haette
     verschwiegen, dass ein Ergebnis vorlag. */
  assert.deepEqual(a.steps,
    ["CREATIVE_JOB_RESULT_AVAILABLE", "CREATIVE_JOB_VERIFIED"]);
  const h = r.get("job_test:sha:attempt1").history;
  assert.equal(h.length, 3);
  assert.equal(h[1].state, "CREATIVE_JOB_RESULT_AVAILABLE");
  assert.match(h[1].note, /RESULT_VERIFIED/);
});

test("CR4 · Jeder Schritt bleibt ein zulaessiger Uebergang", () => {
  /* Der Weg wird gesucht, nicht gesetzt. Waere er von Hand gepflegt,
     waere er die naechste Stelle, die beim naechsten Zustand vergessen
     wird. */
  const r = Job.createRegistry([job()]);
  for (const von of Job.STATES) {
    for (const nach of Job.STATES) {
      const weg = r.pfadZu(von, nach);
      if (!weg) continue;
      let hier = von;
      for (const schritt of weg) {
        assert.ok((Job.UEBERGAENGE[hier] || []).includes(schritt),
          von + " -> " + weg.join(" -> ") + ": " + hier + " -> " + schritt +
          " ist kein zulaessiger Uebergang.");
        hier = schritt;
      }
      assert.equal(hier, nach);
    }
  }
});

/* --------------------------------------------------------- Idempotenz */

test("CR5 · Zweimal reconcilen erzeugt keinen zweiten History-Eintrag", () => {
  const r = Job.createRegistry([job()]);
  r.reconcile("job_test:sha:attempt1", "RESULT_VERIFIED", { now: "2026-09-21T12:00:00Z" });
  const nach1 = r.get("job_test:sha:attempt1").history.length;

  const b = r.reconcile("job_test:sha:attempt1", "RESULT_VERIFIED",
    { now: "2026-09-21T12:05:00Z" });
  assert.equal(b.ok, true);
  assert.equal(b.geaendert, false);
  assert.equal(b.reason, "bereitsReconciled");
  assert.equal(r.get("job_test:sha:attempt1").history.length, nach1,
    "Die Provenance waechst sonst mit der Zahl der Reparaturlaeufe.");
});

test("CR6 · Ein terminaler Job wird auch von anderer Evidenz nicht bewegt", () => {
  const r = Job.createRegistry([job({ state: "CREATIVE_JOB_FAILED" })]);
  const b = r.reconcile("job_test:sha:attempt1", "RESULT_VERIFIED", {});
  assert.equal(b.geaendert, false);
  assert.equal(b.reason, "bereitsTerminal");
  assert.equal(r.get("job_test:sha:attempt1").state, "CREATIVE_JOB_FAILED");
});

/* ----------------------------------------- Was KEINE Evidenz ist (§2/§4) */

test("CR7 · Alter allein schliesst keinen Job", () => {
  const r = Job.createRegistry([job()]);
  for (const nichts of Job.KEINE_EVIDENZ) {
    const b = r.reconcile("job_test:sha:attempt1", nichts, {});
    assert.equal(b.ok, false, nichts + " wurde akzeptiert.");
    assert.equal(b.geaendert, false);
    assert.equal(b.reason, "inadmissibleEvidence");
    assert.equal(r.get("job_test:sha:attempt1").state, "CREATIVE_JOB_IN_FLIGHT");
  }
  assert.ok(Job.KEINE_EVIDENZ.includes("ALTER"));
});

test("CR8 · Die Evidenzliste ist geschlossen — Unbekanntes faellt zu", () => {
  const r = Job.createRegistry([job()]);
  const b = r.reconcile("job_test:sha:attempt1", "SIEHT_FERTIG_AUS", {});
  assert.equal(b.ok, false);
  assert.equal(b.reason, "inadmissibleEvidence");
  assert.equal(r.get("job_test:sha:attempt1").state, "CREATIVE_JOB_IN_FLIGHT");
});

test("CR9 · Jede zulaessige Evidenz hat ein Ziel, und keines ist offen", () => {
  for (const [art, ziel] of Object.entries(Job.EVIDENZ)) {
    assert.ok(Job.STATES.includes(ziel), art + " zeigt auf " + ziel);
    assert.ok(Job.TERMINAL.includes(ziel),
      art + " fuehrt nach " + ziel + " — das ist kein Abschluss.");
  }
});

/* ------------------------------------------------- Die Zielzuordnung */

test("CR10 · Geliefert heisst VERIFIED, ueberholt heisst SUPERSEDED", () => {
  const a = Job.createRegistry([job()]);
  a.reconcile("job_test:sha:attempt1", "RESULT_VERIFIED", {});
  assert.equal(a.get("job_test:sha:attempt1").state, "CREATIVE_JOB_VERIFIED");

  const b = Job.createRegistry([job()]);
  b.reconcile("job_test:sha:attempt1", "SUPERSEDED_BY_VERIFIED_SUCCESSOR", {});
  assert.equal(b.get("job_test:sha:attempt1").state, "CREATIVE_JOB_SUPERSEDED");

  const c = Job.createRegistry([job()]);
  c.reconcile("job_test:sha:attempt1", "LEDGER_REJECTED", {});
  assert.equal(c.get("job_test:sha:attempt1").state, "CREATIVE_JOB_FAILED");
});

test("CR11 · Auch aus REQUESTED und STALE fuehrt ein Weg", () => {
  for (const von of ["CREATIVE_JOB_REQUESTED", "CREATIVE_JOB_DISPATCHED",
                     "CREATIVE_JOB_STALE", "CREATIVE_JOB_RESULT_AVAILABLE"]) {
    const r = Job.createRegistry([job({ state: von })]);
    const b = r.reconcile("job_test:sha:attempt1", "RESULT_VERIFIED", {});
    assert.equal(b.geaendert, true, von + ": kein Weg gefunden.");
    assert.equal(r.get("job_test:sha:attempt1").state, "CREATIVE_JOB_VERIFIED");
  }
});

/* ------------------------------------------ Der Slot, gemessen (§6) */

test("CR12 · Nach dem Abgleich zaehlt der Slot die Wirklichkeit", () => {
  const r = Job.createRegistry([
    job({ creativeJobId: "a", contentId: "c-a" }),
    job({ creativeJobId: "b", contentId: "c-b", state: "CREATIVE_JOB_VERIFIED" })
  ]);
  const offen = () => r.all().filter((j) => Job.OFFEN.includes(j.state)).length;

  assert.equal(offen(), 1);
  r.reconcile("a", "LEDGER_COMPLETED", {});
  assert.equal(offen(), 0, "Der Slot ist nach dem Abgleich frei.");
});

test("CR13 · Ein unbekannter Job wird benannt abgewiesen, nicht stumm", () => {
  const r = Job.createRegistry([job()]);
  const b = r.reconcile("gibt-es-nicht", "RESULT_VERIFIED", {});
  assert.equal(b.ok, false);
  assert.equal(b.reason, "unknownJob");
});

/* ------------------------------- Der Rueckweg im Skript (§1/§5) */

test("CR14 · Ein Abschluss zieht das Register nach — gefahren, nicht gelesen", async () => {
  /* Die erste Fassung las den Quelltext. Die Gegenprobe zeigte, dass
     das jede Faelschung ueberlebt: den Block entfernen ODER den
     Zustand direkt setzen fiel beides nur einem Grep auf.

     Jetzt wird die Funktion gefahren und am Register gemessen. */
  const { registerNachziehen } = await import("../../scripts/social/ingest-creative.mjs");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  const dir = mkdtempSync(join(tmpdir(), "vu-cr14-"));
  const pfad = join(dir, "creative-jobs.json");
  writeFileSync(pfad, JSON.stringify({ jobs: [job()] }, null, 2));

  const r = registerNachziehen(
    { state: "COMPLETED", processingKey: "brief_test:vu-test:sha:1.0" },
    { now: "2026-09-21T12:00:00Z", registerPfad: pfad });

  assert.equal(r.geaendert, true, "Der Abschluss kam nicht im Register an.");
  const nachher = JSON.parse(readFileSync(pfad, "utf8"));
  assert.equal(nachher.jobs[0].state, "CREATIVE_JOB_VERIFIED");
  /* Und ueber die Maschine gegangen, nicht gesprungen. */
  const h = nachher.jobs[0].history;
  assert.equal(h[h.length - 2].state, "CREATIVE_JOB_RESULT_AVAILABLE");
  assert.ok(Job.OFFEN.indexOf(nachher.jobs[0].state) === -1,
    "Der Slot ist nach dem Abschluss nicht frei.");

  /* Zweiter Lauf: kein zweiter Eintrag. */
  const laenge = h.length;
  const b = registerNachziehen(
    { state: "COMPLETED", processingKey: "brief_test:vu-test:sha:1.0" },
    { now: "2026-09-21T12:05:00Z", registerPfad: pfad });
  assert.equal(b.geaendert, false);
  assert.equal(JSON.parse(readFileSync(pfad, "utf8")).jobs[0].history.length, laenge);
});

test("CR14b · Ein fremder Schluessel bewegt nichts", async () => {
  /* Die Bruecke ist der processing_key. Ginge sie ueber die
     content_id, schloesse der vorletzte Anlauf den letzten. */
  const { registerNachziehen } = await import("../../scripts/social/ingest-creative.mjs");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  const dir = mkdtempSync(join(tmpdir(), "vu-cr14b-"));
  const pfad = join(dir, "creative-jobs.json");
  writeFileSync(pfad, JSON.stringify({ jobs: [job()] }, null, 2));

  const r = registerNachziehen(
    { state: "COMPLETED", processingKey: "brief_test:vu-test:ANDERE_SHA:1.0" },
    { now: "2026-09-21T12:00:00Z", registerPfad: pfad });

  assert.equal(r.geaendert, false);
  assert.equal(r.grund, "keinEintrag");
  assert.equal(JSON.parse(readFileSync(pfad, "utf8")).jobs[0].state,
    "CREATIVE_JOB_IN_FLIGHT");
});

test("CR15 · Ein unlesbares Register faellt zu, statt still weiterzugehen", async () => {
  const { registerNachziehen } = await import("../../scripts/social/ingest-creative.mjs");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  const dir = mkdtempSync(join(tmpdir(), "vu-cr15-"));
  const pfad = join(dir, "creative-jobs.json");
  writeFileSync(pfad, "{ kaputt");

  const still = { log() {}, error() {} };
  const r = registerNachziehen(
    { state: "COMPLETED", processingKey: "brief_test:vu-test:sha:1.0" },
    { now: "2026-09-21T12:00:00Z", registerPfad: pfad, log: still });

  assert.equal(r.ok, false, "Unlesbar darf nicht wie 'nichts zu tun' aussehen.");
  assert.equal(r.grund, "registerUnlesbar");
});

test("CR16 · Der Abgleich veroeffentlicht nichts und erzeugt keinen Job", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(
    join(ROOT, "scripts/social/reconcile-creative-jobs.mjs"), "utf8");
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(ohneKommentare, /dispatch\(|mayDispatch|request-creative|publish/);
  assert.doesNotMatch(ohneKommentare, /splice|delete /,
    "Ein Job wird nie geloescht — die Provenance bleibt.");
});

/* =========================================================================
   DER PASS, END ZU ENDE GEFAHREN (CR17–CR21)

   CR14 misst die Funktion. Dass `main` sie auch RUFT, faellt damit
   nicht auf — die Gegenprobe hat den Aufruf entfernt, und kein Test
   ist umgefallen. Das Tor war gebaut und stand neben dem Weg.

   Die tragende Absicherung ist deshalb die zweite Linie: der
   Abgleichpass, den der Orchestrator VOR jeder Zustandsermittlung
   faehrt. Verpasst der Ingest den Rueckweg, holt ihn der naechste
   Lauf nach — und dieser Pass wird hier als Programm gefahren, nicht
   als Quelltext gelesen.
   ========================================================================= */
const { execFileSync } = await import("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
const { tmpdir } = await import("node:os");

/** Ein vollstaendiger Datenstand: Register, Ledger, Ergebnisse. */
function werkbank(over = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-cr-"));
  const daten = join(dir, "data");
  const anfragen = join(dir, "requests");
  mkdirSync(daten, { recursive: true });
  mkdirSync(join(anfragen, "vu-test"), { recursive: true });

  writeFileSync(join(daten, "creative-jobs.json"),
    JSON.stringify({ jobs: over.jobs || [job()] }, null, 2));
  writeFileSync(join(daten, "creative-invocations.json"),
    JSON.stringify({ entries: over.ledger || [] }, null, 2));
  if (over.ergebnis !== null) {
    writeFileSync(join(anfragen, "vu-test", "authoring-result.json"),
      JSON.stringify(over.ergebnis || {
        content_id: "vu-test", brief_id: "brief_test",
        processing: { status: "completed",
          processing_key: "brief_test:vu-test:sha:1.0" }
      }, null, 2));
  }
  return { dir, daten, anfragen,
    register: () => JSON.parse(readFileSync(join(daten, "creative-jobs.json"), "utf8")) };
}

function pass(w, extra = []) {
  const aus = execFileSync("node",
    [join(ROOT, "scripts/social/reconcile-creative-jobs.mjs"),
     "--json", "--data", w.daten, "--requests", w.anfragen,
     "--now", "2026-09-21T12:00:00Z", ...extra],
    { cwd: ROOT, encoding: "utf8" });
  return JSON.parse(aus);
}

test("CR17 · Der Pass loest einen Zombie auf — mit Ergebnis als Evidenz", () => {
  const w = werkbank();
  const r = pass(w, ["--write"]);

  assert.equal(r.openBefore, 1);
  assert.equal(r.openAfter, 0);
  assert.equal(r.reconciled, 1);
  assert.equal(r.findings[0].nachher, "CREATIVE_JOB_VERIFIED");
  assert.equal(w.register().jobs[0].state, "CREATIVE_JOB_VERIFIED");
});

test("CR18 · Ohne --write wird nichts geschrieben", () => {
  const w = werkbank();
  const r = pass(w);
  assert.equal(r.written, false);
  assert.equal(r.reconciled, 1, "Gezeigt wird trotzdem, was geschehen wuerde.");
  assert.equal(w.register().jobs[0].state, "CREATIVE_JOB_IN_FLIGHT",
    "Ein Trockenlauf hat geschrieben.");
});

test("CR19 · Zweiter Lauf: keine Aenderung, kein zweiter History-Eintrag", () => {
  const w = werkbank();
  pass(w, ["--write"]);
  const laenge = w.register().jobs[0].history.length;

  const zweiter = pass(w, ["--write"]);
  assert.equal(zweiter.reconciled, 0);
  assert.equal(zweiter.openAfter, 0);
  assert.equal(w.register().jobs[0].history.length, laenge);
});

test("CR20 · Ohne Evidenz bleibt der Job offen — Alter zaehlt nicht", () => {
  /* Derselbe Job, nur ohne Ergebnis und ohne Ledger-Eintrag. Er ist
     genauso alt. Das aendert nichts. */
  const w = werkbank({ ergebnis: null });
  const r = pass(w, ["--write"]);

  assert.equal(r.reconciled, 0);
  assert.equal(r.openAfter, 1, "Der Slot wurde ohne Beweis freigegeben.");
  assert.equal(r.findings[0].grund, "keineEvidenz");
  assert.match(r.findings[0].satz, /Alter allein/);
  assert.equal(w.register().jobs[0].state, "CREATIVE_JOB_IN_FLIGHT");
});

test("CR21 · Ein Ergebnis mit fremdem Schluessel schliesst nichts", () => {
  /* Zu einem Inhaltsobjekt gibt es mehrere Anlaeufe. Ginge die
     Bruecke ueber die content_id, schloesse der vorletzte den letzten. */
  const w = werkbank({ ergebnis: {
    content_id: "vu-test", brief_id: "brief_test",
    processing: { status: "completed",
      processing_key: "brief_test:vu-test:EINE_ANDERE_SHA:1.0" } } });
  const r = pass(w, ["--write"]);

  assert.equal(r.reconciled, 0);
  assert.equal(r.openAfter, 1);
  assert.equal(w.register().jobs[0].state, "CREATIVE_JOB_IN_FLIGHT");
});

test("CR22 · Der Orchestrator gleicht ab, BEVOR er zaehlt", async () => {
  /* Ein Tor, das hinter der Zaehlung steht, ist kein Tor. Gemessen
     wird die Reihenfolge im Workflow, nicht ihre Erwaehnung: der
     Abgleich muss vor dem Schritt stehen, der die offenen Jobs
     ermittelt, und vor jedem Schritt, der Zustand schreibt. */
  const yaml = readFileSync(
    join(ROOT, ".github/workflows/social-orchestrator.yml"), "utf8");
  const ohneKommentare = yaml.replace(/^\s*#.*$/gm, "");

  const abgleich = ohneKommentare.indexOf("reconcile-creative-jobs.mjs");
  const zaehlung = ohneKommentare.indexOf("Was ist jetzt dran?");
  assert.ok(abgleich !== -1, "Der Abgleich laeuft im Orchestrator gar nicht.");
  assert.ok(zaehlung !== -1);
  assert.ok(abgleich < zaehlung,
    "Der Abgleich steht hinter der Zaehlung — dann zaehlt sie den alten Stand.");

  for (const schreibend of ["run-social-cycle.mjs", "make-publish-candidate.mjs",
                            "dispatch-creative-job.mjs", "publish-approval-queue.mjs"]) {
    const i = ohneKommentare.indexOf(schreibend);
    if (i === -1) continue;
    assert.ok(abgleich < i, schreibend + " laeuft vor dem Abgleich.");
  }
});

test("CR23 · Der Abgleich laeuft schreibend — sonst repariert er nichts", () => {
  const yaml = readFileSync(
    join(ROOT, ".github/workflows/social-orchestrator.yml"), "utf8");
  const zeile = yaml.split("\n").find((z) => z.includes("reconcile-creative-jobs.mjs"));
  assert.ok(zeile, "Kein Aufruf gefunden.");
  assert.match(zeile, /--write/,
    "Ohne --write zeigt der Pass nur, was er taete.");
});
