/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/orchestrator.test.mjs

   AUTONOM HEISST NICHT UNBEAUFSICHTIGT

   Der Owner soll nicht mehr regelmaessig Themen auswaehlen, Signale
   sammeln, Slates erzeugen, Rankings starten, Bilder verschieben oder
   Lernlaeufe anstossen. Er soll an genau einer Stelle stehen: am
   Publishing Gate.

   Damit das haelt, muss eine Stelle bei jedem Lauf sagen, was dran ist -
   und pruefbar sein. Pruefbar ist die Bedingung dafuer, dass ihr jemand
   einen Zeitplan anvertraut.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const O = require("../engines/orchestrator.js");

const JETZT = "2026-09-20T06:00:00Z";

/* ----------------------------------------------- Die Reihenfolge haelt */

test("OR1 · Gemessen wird vor dem Vorbereiten", () => {
  /* Ein Kandidat, der vor den Zahlen entsteht, lernt aus dem Stand von
     gestern - und das faellt nie auf, weil das Ergebnis plausibel
     aussieht. */
  const h = O.naechsteHandlung({ now: JETZT,
    dueMeasurements: [{ mediaId: "a" }], lastPreparedAt: null }, {});
  assert.equal(h.stage, O.STAGE.PREPARE_CANDIDATE);
  assert.equal(h.actions[0].stage, O.STAGE.MEASURE,
    "Messen steht vor dem Vorbereiten in der Liste");
});

test("OR2 · Ein wartender Kandidat verhindert einen zweiten", () => {
  /* Zwei wartende Kandidaten sind keine Auswahl, sondern eine
     Warteschlange - genau das, was dieser Betrieb dem Owner abnehmen
     soll. */
  const h = O.naechsteHandlung({ now: JETZT,
    awaitingCandidates: [{ candidateId: "cand_1" }],
    lastPreparedAt: "2026-09-01T06:00:00Z" }, {});
  assert.equal(h.stage, O.STAGE.AWAITING_OWNER_GATE);
  assert.equal(h.awaitingOwner, true);
  assert.deepEqual(h.awaitingCandidateIds, ["cand_1"]);
  assert.equal(h.actions.some((a) => a.stage === O.STAGE.PREPARE_CANDIDATE), false);
});

test("OR3 · Gemessen wird trotzdem, waehrend der Owner entscheidet", () => {
  /* Messen braucht keine Freigabe und darf nicht warten: sonst fehlen
     die Zahlen genau in dem Fenster, in dem sie entstehen. */
  const h = O.naechsteHandlung({ now: JETZT,
    awaitingCandidates: [{ candidateId: "cand_1" }],
    dueMeasurements: [{ mediaId: "a" }] }, {});
  assert.equal(h.stage, O.STAGE.AWAITING_OWNER_GATE);
  assert.ok(h.actions.some((a) => a.stage === O.STAGE.MEASURE));
});

test("OR4 · Der Mindestabstand zwischen Kandidaten haelt", () => {
  const frisch = O.naechsteHandlung({ now: JETZT,
    lastPreparedAt: "2026-09-20T02:00:00Z",
    lastMeasuredAt: "2026-09-20T05:30:00Z" }, {});
  assert.equal(frisch.stage, O.STAGE.IDLE);

  const reif = O.naechsteHandlung({ now: JETZT,
    lastPreparedAt: "2026-09-18T02:00:00Z",
    lastMeasuredAt: "2026-09-20T05:30:00Z" }, {});
  assert.equal(reif.stage, O.STAGE.PREPARE_CANDIDATE);
});

test("OR5 · Der Abstand ist eine Owner-Groesse, keine Naturkonstante", () => {
  const z = { now: JETZT, lastPreparedAt: "2026-09-20T00:00:00Z",
    lastMeasuredAt: "2026-09-20T05:30:00Z" };
  assert.equal(O.naechsteHandlung(z, { minHoursBetweenCandidates: 24 }).stage,
    O.STAGE.IDLE);
  assert.equal(O.naechsteHandlung(z, { minHoursBetweenCandidates: 4 }).stage,
    O.STAGE.PREPARE_CANDIDATE);
});

/* --------------------------------------------------- Halt schlaegt alles */

test("OR6 · Ein Halt verhindert auch das Messen", () => {
  /* Ein Schalter, den man uebergehen kann, ist keiner. */
  const h = O.naechsteHandlung({ now: JETZT, halted: true,
    haltReason: "Kill Switch",
    dueMeasurements: [{ mediaId: "a" }],
    lastPreparedAt: null }, {});
  assert.equal(h.stage, O.STAGE.HALTED);
  assert.deepEqual(h.actions, []);
  assert.match(h.explanation, /Kill Switch/);
});

/* -------------------------------------------------- IDLE ist eine Antwort */

test("OR7 · Nichts zu tun heisst nichts tun", () => {
  const h = O.naechsteHandlung({ now: JETZT,
    lastPreparedAt: "2026-09-20T05:00:00Z",
    lastMeasuredAt: "2026-09-20T05:30:00Z" }, {});
  assert.equal(h.stage, O.STAGE.IDLE);
  assert.match(h.explanation, /kein Grund, etwas zu erzeugen/);
});

/* ------------------------------------------- Was niemals automatisch geht */

test("OR8 · Veroeffentlichen und Freigeben sind nie eine Handlung des Systems", () => {
  /* Die Grenze steht in den Daten und nicht in einem Kommentar, damit
     ein Test sie halten kann. */
  for (const verboten of ["PUBLISH", "APPROVE", "REJECT",
                          "ACTIVATE_EXTERNAL_SOURCE", "ENABLE_AUTOPUBLISH"]) {
    assert.ok(O.NIEMALS.includes(verboten), verboten);
  }
  /* Und keine Stufe traegt einen dieser Namen. */
  for (const s of Object.values(O.STAGE)) {
    assert.equal(O.NIEMALS.includes(s), false, s);
  }
});

test("OR9 · Keine Lage erzeugt jemals eine verbotene Handlung", () => {
  const lagen = [
    { now: JETZT },
    { now: JETZT, awaitingCandidates: [{ candidateId: "c" }] },
    { now: JETZT, halted: true },
    { now: JETZT, dueMeasurements: [{ mediaId: "a" }] },
    { now: JETZT, lastPreparedAt: "2026-01-01T00:00:00Z" }
  ];
  for (const z of lagen) {
    const h = O.naechsteHandlung(z, {});
    for (const a of h.actions) {
      assert.equal(O.NIEMALS.includes(a.stage), false,
        JSON.stringify(z) + " -> " + a.stage);
    }
    assert.equal(O.NIEMALS.includes(h.stage), false, JSON.stringify(z));
  }
});

/* ----------------------------------------------------- Das Betriebsmodell */

test("OR10 · Der Owner steht nur am Publishing Gate", () => {
  const m = O.betriebsmodell({});
  assert.ok(m.automatic.length >= 10);
  const nurOwner = m.ownerOnly.join(" ");
  assert.match(nurOwner, /PUBLISHING GATE/);
  /* Und die Stufen, die ihn frueher beschaeftigt haben, laufen
     automatisch. */
  const auto = m.automatic.join(" ");
  for (const stufe of ["DISCOVER", "SELECT", "MEASURE", "LEARN", "ADAPT", "VISUAL"]) {
    assert.match(auto, new RegExp(stufe), stufe + " muss automatisch laufen");
  }
});

test("OR11 · Der Betrieb braucht keine externe Quelle", () => {
  /* Der Satz, auf den es ankommt: 0..N Sensoren, nicht 1..N
     Abhaengigkeiten. */
  const m = O.betriebsmodell({ externalIntelligence: "NO_ACTIVE_EXTERNAL_SOURCE" });
  assert.equal(m.requiresExternalSource, false);
  assert.equal(m.externalSources, "NO_ACTIVE_EXTERNAL_SOURCE");
});

/* ------------------------------------ Der Workflow haelt sich an die Grenze */

test("OR12 · Der Zeitplan veroeffentlicht nicht und gibt nichts frei", () => {
  /* Gemessen am Workflow selbst: kein Aufruf, der veroeffentlicht,
     freigibt oder eine externe Quelle anfasst. */
  const yml = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  for (const verboten of ["smoke-publish", "dispatch-publications",
                          "decide-candidate", "discover-creators",
                          "enrich-youtube-metrics", "plan-hashtag-observation"]) {
    assert.equal(yml.includes(verboten), false,
      "Der Orchestrator ruft " + verboten + " auf - das gehoert nicht in einen Zeitplan");
  }
  /* Und er ruft die Stufen auf, die er soll. */
  for (const noetig of ["run-orchestrator.mjs", "run-social-cycle.mjs",
                        "make-publish-candidate.mjs"]) {
    assert.ok(yml.includes(noetig), "fehlt: " + noetig);
  }
});

test("OR13 · Der Zeitplan laeuft erst im Standardzweig — und sagt das", () => {
  /* GitHub fuehrt `schedule` nur dort aus. Eine Autonomie, die das
     verschweigt, ist eine Zusage, die niemand einloest. */
  const yml = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  assert.match(yml, /schedule/);
  assert.match(yml, /NUR im Standardzweig/);
});
