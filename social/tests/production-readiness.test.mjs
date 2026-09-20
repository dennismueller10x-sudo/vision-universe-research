/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/production-readiness.test.mjs

   UNGEPRUEFT IST NICHT "WAHRSCHEINLICH IN ORDNUNG"

   Der gefaehrlichste Reifebericht ist der, der bei fehlendem Befund
   schweigt und deshalb gruen aussieht. Diese Tests halten fest, dass
   ein fehlender Befund die Reife BLOCKIERT - und dass ein Schalter,
   der zwar aus ist, aber gesetzt werden koennte, nicht als Invariante
   durchgeht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../engines/production-readiness.js");
const { befehleFuer } = await import("../../scripts/social/ingest-owner-decisions.mjs");

const VOLL = {
  graph: true, visualDirection: true, gates: true, autonomy: true,
  publishingGate: true, externalSources: true, ownPerformance: true,
  isolation: true, creativeBudget: true, suites: true
};

/* ------------------------------------------------------------------ */
/* UNGEPRUEFT BLOCKIERT                                                */
/* ------------------------------------------------------------------ */

test("PR1 · Ohne jeden Befund ist nichts reif", () => {
  const r = R.pruefe({});
  assert.equal(r.ready, false);
  assert.equal(r.criticalBlockers, 10);
  assert.equal(r.unverified.length, 10);
});

test("PR2 · Ein fehlender Befund zaehlt wie nicht erfuellt", () => {
  const ohneEins = Object.assign({}, VOLL);
  delete ohneEins.isolation;
  const r = R.pruefe(ohneEins);
  assert.equal(r.ready, false);
  assert.deepEqual(r.unverified, ["TEST_PRODUCTION_ISOLATION"]);
  assert.equal(r.criticalBlockers, 1);
  assert.match(r.conditions.find((c) => c.id === "TEST_PRODUCTION_ISOLATION").explanation,
    /Ungeprueft zaehlt wie nicht erfuellt/);
});

test("PR3 · Ein einzelner gruener Test macht nichts reif", () => {
  /* Woertlich der Satz aus dem Auftrag. SUITE_GREEN steht bewusst an
     letzter Stelle: notwendig, ausdruecklich nicht hinreichend. */
  const r = R.pruefe({ suites: true });
  assert.equal(r.ready, false);
  assert.equal(r.met, 1);
  assert.equal(r.total, 10);
});

test("PR4 · Erst alle zehn ergeben READY", () => {
  const r = R.pruefe(VOLL);
  assert.equal(r.ready, true);
  assert.equal(r.criticalBlockers, 0);
  assert.equal(r.met, 10);
});

test("PR5 · READY schaltet nichts frei", () => {
  /* Eine Feststellung, kein Schalter. Die Autopublish-Gates liegen in
     social/config/ und aendern sich nur durch einen Commit. */
  assert.equal(R.pruefe(VOLL).enablesPublishing, false);
  assert.match(R.pruefe(VOLL).explanation, /nicht\s+veroeffentlichungsberechtigt/);
});

/* ------------------------------------------------------------------ */
/* §7 · EIN SETZBARER SCHALTER IST KEINE INVARIANTE                    */
/* ------------------------------------------------------------------ */

test("PR6 · Ein eingeschalteter Autopublish-Schalter faellt durch", () => {
  const h = R.hart({ gates: { GLOBAL_AUTOPUBLISH: true }, schedulerWriters: [] });
  assert.ok(h.open.includes("GLOBAL_AUTOPUBLISH_OFF"));
});

test("PR7 · Ein ungelesener Schalter ist nicht aus", () => {
  const h = R.hart({ gates: {}, schedulerWriters: [] });
  const z = h.invariants.find((i) => i.id === "GLOBAL_AUTOPUBLISH_OFF");
  assert.equal(z.state, R.ZUSTAND.UNGEPRUEFT);
  assert.match(z.explanation, /Nicht gelesen ist nicht aus/);
});

test("PR8 · Ein aus-, aber setzbarer Schalter ist keine Invariante", () => {
  /* Der Unterschied zwischen "tut es niemand" und "kann es niemand".
     Nur das Zweite ist eine Invariante. */
  const h = R.hart({
    gates: { GLOBAL_AUTOPUBLISH: false },
    schedulerWriters: [{ gate: "GLOBAL_AUTOPUBLISH", path: "scripts/social/boese.mjs" }]
  });
  const z = h.invariants.find((i) => i.id === "GLOBAL_AUTOPUBLISH_OFF");
  assert.equal(z.state, R.ZUSTAND.NICHT_ERFUELLT);
  assert.match(z.explanation, /kann aber gesetzt werden von/);
});

test("PR9 · Ohne Wissen ueber die Schreiber bleibt es ungeprueft", () => {
  const h = R.hart({ gates: { GLOBAL_AUTOPUBLISH: false } });
  const z = h.invariants.find((i) => i.id === "GLOBAL_AUTOPUBLISH_OFF");
  assert.equal(z.state, R.ZUSTAND.UNGEPRUEFT);
  assert.match(z.explanation, /Ein Zustand, den ein Lauf\s+aendern kann/);
});

test("PR10 · Ein Scheduler, der veroeffentlicht, faellt durch", () => {
  for (const verboten of R.SCHEDULER_DARF_NICHT) {
    const h = R.hart({ gates: { GLOBAL_AUTOPUBLISH: false }, schedulerWriters: [],
      schedulerActions: ["MEASURE", verboten] });
    assert.ok(h.open.includes("SCHEDULER_NEVER_PUBLISHES"),
      verboten + " muesste durchfallen");
  }
});

test("PR11 · Die erlaubten Handlungen sind genau die aus §7", () => {
  assert.deepEqual(R.SCHEDULER_DARF, ["DISCOVER", "MEASURE", "LEARN", "DECIDE",
    "CREATE", "VALIDATE", "CANDIDATE"]);
  /* Und keine davon ist eine verbotene. */
  for (const a of R.SCHEDULER_DARF) {
    assert.equal(R.SCHEDULER_DARF_NICHT.includes(a), false);
  }
});

/* ------------------------------------------------------------------ */
/* §6 · ZEHN INVARIANTEN, JEDE MIT BELEG                               */
/* ------------------------------------------------------------------ */

test("PR12 · Es sind genau zehn, und jede nennt ihren Beleg", () => {
  assert.equal(R.AUTONOMIE.length, 10);
  for (const i of R.AUTONOMIE) {
    assert.ok(i.beleg && i.beleg.length > 20,
      i.id + " nennt nicht, woran man sie misst");
  }
});

test("PR13 · Eine unbelegte Invariante gilt nicht als belegt", () => {
  const a = R.autonomie({ NO_DAILY_OWNER_START: true });
  assert.equal(a.ok, false);
  assert.equal(a.proven, 1);
  assert.equal(a.open.length, 9);
});

/* ------------------------------------------------------------------ */
/* §8 · KADENZ IST NICHT FREQUENZ                                      */
/* ------------------------------------------------------------------ */

test("PR14 · Aus dem Takt folgt keine Posting-Quote", () => {
  const k = R.kadenz({ runsPerDay: 2 });
  assert.equal(k.schedulerRunsPerDay, 2);
  /* Ausdruecklich null und nicht 2: eine erfundene Quote waere eine
     Zahl, die man sich ausdenkt und dann erfuellt. */
  assert.equal(k.publishingFrequency, null);
  assert.equal(k.schedulerFrequencyEqualsPublishingFrequency, false);
});

test("PR15 · Der Orchestrator hat fuenf moegliche Entscheidungen", () => {
  assert.deepEqual(R.kadenz({}).decisions,
    ["NO_ACTION", "MEASURE", "LEARN", "PREPARE", "CREATE_CANDIDATE"]);
});

/* ------------------------------------------------------------------ */
/* DAS SKRIPT NIMMT SICH SEINE HAUSAUFGABE NICHT AB                    */
/* ------------------------------------------------------------------ */

test("PR16 · Suite und Isolation kommen von aussen, nicht aus dem Skript", () => {
  /* Ein Reifebericht, der seine eigene Testsuite startet und dann
     "gruen" meldet, hat sich selbst bestaetigt. Beide Befunde muessen
     uebergeben werden - sonst bleiben sie ungeprueft. */
  const skript = readFileSync("scripts/social/production-readiness.mjs", "utf8");
  assert.match(skript, /--suites-green/);
  assert.match(skript, /--isolation-proven/);
  assert.equal(/node --test/.test(skript), false,
    "Der Reifebericht darf seine eigene Suite nicht starten");
});

/* ------------------------------------------------------------------ */
/* §7 · DER SCHEDULER, WIE ER WIRKLICH DASTEHT                         */
/* ------------------------------------------------------------------ */

test("PR17 · Der Orchestrator-Workflow veroeffentlicht nicht und entscheidet nicht", () => {
  /* Nicht "er soll nicht", sondern gemessen an der Datei. Ein Verbot im
     Kommentar ist kein Verbot.

     Was diese Pruefung seit dem Approval Center genauer meint, steht
     ausfuehrlich bei OR12 in orchestrator.test.mjs: der Scheduler
     schreibt eine Owner-Entscheidung ab (ueber
     ingest-owner-decisions.mjs), er trifft keine. Deshalb steht
     decide-candidate.mjs hier nicht mehr auf der Wortliste, sondern
     als DIREKTER Aufruf und als Entscheidungsflagge unter Verbot. */
  const w = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  assert.equal(w.includes("dispatch-publications.mjs"), false,
    "Der Scheduler ruft dispatch-publications.mjs auf");
  assert.ok(!/node\s+scripts\/social\/decide-candidate\.mjs/.test(w),
    "Der Scheduler ruft decide-candidate direkt auf - dann entscheidet er.");
  for (const flagge of ["--approve", "--reject", "--hold", "--refine"]) {
    assert.ok(!w.includes(flagge),
      "Der Scheduler traegt " + flagge + " im Workflow.");
  }
});

test("PR17b · Der Abschreiber erfindet keine Entscheidung", () => {
  /* Die andere Haelfte derselben Invariante, und sie liegt nicht im
     Workflow: ingest-owner-decisions.mjs darf ausschliesslich
     uebersetzen, was im Journal steht. Ein Abschreiber, der bei
     Unklarheit raet, waere ein Scheduler, der entscheidet - nur eine
     Datei weiter. */
  const eingaben = [
    { decision: "REJECTED", erwartet: "--reject" },
    { decision: "APPROVED", erwartet: "--approve" }
  ];
  for (const e of eingaben) {
    const befehle = befehleFuer({ candidateId: "cand_p", decision: e.decision,
      reason: "x" });
    assert.ok(befehle, e.decision);
    assert.ok(befehle[0].includes(e.erwartet));
    /* Und ausdruecklich nur die eine Flagge. */
    for (const andere of ["--approve", "--reject", "--hold", "--refine"]) {
      if (andere === e.erwartet) continue;
      assert.ok(!befehle[0].includes(andere),
        e.decision + " erzeugt zusaetzlich " + andere);
    }
  }
  /* Alles andere ergibt KEINEN Befehl - nicht einen vorsichtigen. */
  for (const unklar of [null, undefined, "", "HELD_FOR_ENRICHMENT", "VIELLEICHT",
    "approved", "Approved"]) {
    assert.equal(befehleFuer({ candidateId: "cand_p", decision: unklar }), null,
      "Aus " + JSON.stringify(unklar) + " wurde ein Befehl.");
  }
});

test("PR18 · Der Scheduler schreibt ausschliesslich social/data/", () => {
  /* Die Autopublish-Schalter liegen in social/config/. Dass der
     Festschreiben-Schritt sie nicht anfasst, ist die strukturelle
     Antwort auf "kann ein Lauf sie setzen?" - und sie muss hier
     stehen, damit ein spaeterer Schritt sie nicht versehentlich
     weitet. */
  const w = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  /* Je PFAD, nicht je Zeile: "git add social/data/ social/config/"
     ist EINE Zeile und ZWEI Pfade, und die erste Fassung dieses Tests
     hat sie deshalb durchgelassen. Gegengeprobt durch Einbauen. */
  const addiert = [...w.matchAll(/git add ([^\n]+)/g)]
    .flatMap((m) => m[1].trim().split(/\s+/))
    .filter((a) => a.length && !a.startsWith("-"));
  assert.ok(addiert.length > 0, "kein git add gefunden");
  for (const a of addiert) {
    assert.ok(a.startsWith("social/data"),
      "Der Scheduler schreibt ausserhalb von social/data: " + a);
  }
});

test("PR19 · Der Scheduler setzt keinen Autopublish-Schalter", () => {
  const w = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  assert.equal(/VU_SOCIAL_AUTOPUBLISH\s*[:=]/.test(w), false);
  assert.equal(/GLOBAL_AUTOPUBLISH\s*[:=]/.test(w), false);
});

test("PR20 · Kein Skript schreibt die Schalterdateien", () => {
  /* Die harte Fassung: nicht "tut es keines", sondern "kann es
     keines". Eine Freischaltung ist ein Commit mit Autor und
     Begruendung, kein Seiteneffekt eines Laufs. */
  const { readdirSync } = require("node:fs");
  const schreiber = [];
  for (const d of readdirSync("scripts/social")) {
    if (!d.endsWith(".mjs")) continue;
    const t = readFileSync("scripts/social/" + d, "utf8");
    if (/writeFileSync\([^)]*(kill-switch|autonomy)\.json/.test(t)) {
      schreiber.push(d);
    }
  }
  assert.deepEqual(schreiber, []);
});

test("PR21 · Die Kadenz steht im Workflow und ist zweimal taeglich", () => {
  /* Als technischer Startwert - ausdruecklich keine Posting-Quote.
     Scheduler-Frequenz ist nicht Publishing-Frequenz. */
  const w = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  const crons = [...w.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.equal(crons.length, 2);
  assert.equal(R.kadenz({ runsPerDay: crons.length }).publishingFrequency, null);
});

/* ------------------------------------------------------------------ */
/* EIN TEST, DER DEN STICHTAG PRUEFT, PRUEFT NICHT DIE AUSSAGE         */
/* ------------------------------------------------------------------ */

test("PR22 · Kein Test friert eine Zahl aus wachsenden Produktionsdaten ein", () => {
  /* Drei Tests in evidence-package.test.mjs hielten die XOM-Werte vom
     Tag ihrer Entstehung fest: 2940 Handelstage, Score 76,
     TREND_STRUCTURE 27.35, SMA50-Abstand 3.05 ATR. Mit dem naechsten
     Datenstand waren es 2944 und 52 und 27.26 - drei rote Tests, ohne
     dass sich am Code etwas geaendert hatte.

     Die Wache dagegen ist einfach: wer Produktionsdaten liest, darf
     die gelesenen Werte nicht daneben noch einmal hinschreiben. Er
     prueft sonst den Stichtag. */
  /* Die Kommentare NENNEN die alten Werte - dort gehoeren sie hin,
     denn sonst weiss niemand mehr, was hier schiefging. Geprueft wird
     der Code, nicht die Prosa: die erste Fassung dieser Wache las
     beides und schlug auf ihrer eigenen Begruendung an. */
  const ohneKommentare = readFileSync(
    "social/tests/evidence-package.test.mjs", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const eingefroren of ["2940 Handelstage", "27.35", "3.05 ATR",
                             "erreicht 76"]) {
    assert.equal(ohneKommentare.includes(eingefroren), false,
      "eingefrorener Produktionswert im Test: " + eingefroren);
  }
});
