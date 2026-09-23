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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const O = require("../engines/orchestrator.js");
const Kadenz = require("../engines/content-cadence.js");
const KADENZ_CONFIG = require("../config/cadence.json");

/* Eine Kadenzentscheidung, die "ja" sagt. Der Orchestrator rechnet sie
   seit dem Cadence-Auftrag nicht mehr selbst - er bekommt sie herein.
   Tests, die einen Kandidaten erwarten, muessen sie deshalb mitgeben;
   ohne sie entsteht keiner, und das ist Absicht. */
function darf(now, zustand) {
  return Kadenz.entscheide(Object.assign({ now: now }, zustand || {}), KADENZ_CONFIG);
}

const JETZT = "2026-09-20T06:00:00Z";

/* ----------------------------------------------- Die Reihenfolge haelt */

test("OR1 · Gemessen wird vor dem Vorbereiten", () => {
  /* Ein Kandidat, der vor den Zahlen entsteht, lernt aus dem Stand von
     gestern - und das faellt nie auf, weil das Ergebnis plausibel
     aussieht. */
  const h = O.naechsteHandlung({ now: JETZT,
    dueMeasurements: [{ mediaId: "a" }], lastPreparedAt: null },
    { cadence: darf(JETZT) });
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

test("OR3b · Ein ausdruecklicher Owner-Auftrag hebt die Warteschlange auf", () => {
  /* manual-mode.js fuehrt ACTIVE_APPROVAL_QUEUE_NOT_EMPTY als
     AUFHEBBAR: "Wer ausdruecklich einen weiteren Beitrag bestellt,
     nimmt den Stapel in Kauf." content-cadence.js traegt diese
     Aufhebung in `kadenz.darfErzeugen` - genau das simuliert dieser
     Test, wie run-orchestrator.mjs es fuer MANUAL_NOW/MANUAL_TOPIC
     tatsaechlich baut. Vorher sperrte naechsteHandlung() hier trotzdem
     unbedingt: die "zweite Frequenzsperre" aus Aufgabe #101. */
  const h = O.naechsteHandlung({ now: JETZT,
    awaitingCandidates: [{ candidateId: "cand_1" }],
    lastPreparedAt: "2026-09-01T06:00:00Z" },
    { cadence: {
      darfErzeugen: true, grund: null,
      aufgehobenDurch: "MANUAL_TOPIC",
      aufgehobenerGrund: "ACTIVE_APPROVAL_QUEUE_NOT_EMPTY",
      erklaerung: "Owner-Auftrag MANUAL_TOPIC hebt die Warteschlangensperre auf."
    } });
  assert.equal(h.stage, O.STAGE.PREPARE_CANDIDATE);
  assert.equal(h.awaitingOwner, false);
  assert.ok(h.actions.some((a) => a.stage === O.STAGE.PREPARE_CANDIDATE));
});

test("OR3c · Ohne ausdruecklichen Auftrag sperrt die Warteschlange weiter, auch mit Kadenz", () => {
  /* Der Normalfall: content-cadence.js sieht dieselbe wartende
     Warteschlange und sagt deshalb selbst schon "nein"
     (ACTIVE_APPROVAL_QUEUE_NOT_EMPTY) - keine ausdrueckliche Aufhebung
     durch einen Owner-Auftrag liegt vor. Der Orchestrator muss dabei
     bleiben. */
  const kadenz = darf(JETZT, { activeApprovalQueue: 1 });
  assert.equal(kadenz.darfErzeugen, false);
  assert.equal(kadenz.grund, Kadenz.GRUND.ACTIVE_APPROVAL_QUEUE_NOT_EMPTY);

  const h = O.naechsteHandlung({ now: JETZT,
    awaitingCandidates: [{ candidateId: "cand_1" }],
    lastPreparedAt: "2026-09-01T06:00:00Z" },
    { cadence: kadenz });
  assert.equal(h.stage, O.STAGE.AWAITING_OWNER_GATE);
  assert.equal(h.awaitingOwner, true);
});

test("OR4 · Der Abstand wird hereingereicht, nicht hier gerechnet", () => {
  /* Hier stand eine Pruefung auf `minHoursBetweenCandidates` - EINE
     Zahl im Orchestrator fuer eine Frage, die drei Ebenen hat, und
     zwar neben einer zweiten Zahl in der Konfiguration. Die
     Entscheidung liegt jetzt in content-cadence.js.

     Geprueft wird deshalb nicht mehr eine Zahl, sondern dass der
     Orchestrator der Engine FOLGT - in beide Richtungen. */
  const z = { now: JETZT, lastMeasuredAt: "2026-09-20T05:30:00Z" };

  const zuFrueh = O.naechsteHandlung(z, { cadence: darf(JETZT, {
    candidatesToday: ["2026-09-20T05:00:00Z"],
    lastCandidateAt: "2026-09-20T05:00:00Z" }) });
  assert.equal(zuFrueh.stage, O.STAGE.IDLE);
  assert.equal(zuFrueh.reasonCode, Kadenz.GRUND.MINIMUM_SPACING_NOT_REACHED);

  const reif = O.naechsteHandlung(z, { cadence: darf(JETZT, {
    candidatesToday: ["2026-09-19T20:00:00Z"],
    lastCandidateAt: "2026-09-19T20:00:00Z" }) });
  assert.equal(reif.stage, O.STAGE.PREPARE_CANDIDATE);
});

test("OR5 · Ohne Kadenzentscheidung entsteht kein Kandidat", () => {
  /* Fail closed, und zwar ohne Rueckfallzahl. Eine Vorgabe, die
     einspringt, wenn die Engine fehlt, waere genau der zweite
     Rechenweg, den dieser Umbau beseitigt hat - nur unsichtbar. */
  const z = { now: JETZT, lastMeasuredAt: "2026-09-20T05:30:00Z" };
  const ohne = O.naechsteHandlung(z, {});
  assert.equal(ohne.stage, O.STAGE.IDLE);
  assert.equal(ohne.cadence, null);
  assert.match(ohne.explanation, /keine Kadenzentscheidung/);

  /* Und die alte Stellschraube wirkt nicht mehr heimlich weiter. */
  const alt = O.naechsteHandlung(z, { minHoursBetweenCandidates: 1 });
  assert.equal(alt.stage, O.STAGE.IDLE,
    "minHoursBetweenCandidates wirkt noch - es gibt also zwei Wege.");

  /* Auch mit faelliger Messung bleibt es beim Nichterzeugen. */
  const mitMessung = O.naechsteHandlung(
    { now: JETZT, dueMeasurements: [{ mediaId: "a" }] }, {});
  assert.equal(mitMessung.stage, O.STAGE.MEASURE);
  assert.equal(mitMessung.actions.some(
    (a) => a.stage === O.STAGE.PREPARE_CANDIDATE), false);
});

test("OR5b · Die drei Frequenzen bleiben getrennt", () => {
  /* Der Kern des Umbaus: haeufigeres Pruefen ist keine haeufigere
     Veroeffentlichung. Die Ebenen tragen Namen, damit sie niemand
     wieder zusammenzieht. */
  assert.deepEqual(Object.keys(Kadenz.EBENEN).sort(),
    ["CREATION", "PUBLISHING", "SCHEDULER"]);

  /* Die Content-Ebene kennt die Publishing-Grenzen nicht - sie rechnet
     sie nicht nach, und das ist Absicht. */
  const r = Kadenz.regime(KADENZ_CONFIG);
  assert.equal(r.ebene, Kadenz.EBENEN.CREATION);
  assert.equal(r.minHoursBetweenPosts, undefined);
  assert.equal(r.maxPostsPer7Days, undefined);

  /* Und die Konfiguration fuehrt beide getrennt. */
  assert.ok(KADENZ_CONFIG.contentCreation, "contentCreation fehlt");
  assert.ok(KADENZ_CONFIG.publishing, "publishing fehlt");
  assert.notEqual(KADENZ_CONFIG.contentCreation.minHoursBetweenCandidates,
    KADENZ_CONFIG.publishing.minHoursBetweenPosts,
    "Wenn beide gleich sind, ist die Trennung nicht pruefbar.");
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

test("OR7 · Nichts zu tun heisst nichts tun — mit Grund", () => {
  /* IDLE bleibt die richtige Stufe. Was sich geaendert hat: sie traegt
     jetzt einen benannten Grund. "Nichts faellig" war als
     Betriebszustand richtig und als Tagesentscheidung zu wenig - es
     beantwortet "warum heute keiner" mit "eben nicht". */
  const h = O.naechsteHandlung({ now: JETZT,
    lastMeasuredAt: "2026-09-20T05:30:00Z" },
    { cadence: darf(JETZT, {
      candidatesToday: ["2026-09-20T05:00:00Z"],
      lastCandidateAt: "2026-09-20T05:00:00Z" }) });
  assert.equal(h.stage, O.STAGE.IDLE);
  assert.ok(h.reasonCode, "IDLE ohne Grund ist das alte NO_ACTION.");
  assert.equal(Kadenz.grundZulaessig(h.reasonCode).zulaessig, true);
  assert.ok(h.explanation.length > 20);
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

test("OR12 · Der Zeitplan veroeffentlicht nicht und entscheidet nicht", () => {
  /* -------------------------------------------------------------------
     WAS DIESE PRUEFUNG SEIT DEM APPROVAL CENTER MEINT

     Hier stand "decide-candidate" in derselben Liste wie
     "dispatch-publications": kein Vorkommen im Workflow, Punkt.

     Das war richtig, solange nur ein Mensch entscheiden konnte. Seit
     der Owner im Browser entscheidet, muss seine Entscheidung ins
     Repository - und zwar durch decide-candidate.mjs, weil dort der
     Zustandsuebergang und die Ablehnungssemantik stehen. Der
     Scheduler ruft es also, eine Ebene tiefer, ueber
     ingest-owner-decisions.mjs.

     Die Invariante ist deswegen nicht gefallen; sie war nur zu grob
     formuliert. Sie lautet: DER SCHEDULER TRIFFT KEINE ENTSCHEIDUNG.
     Er darf eine bereits getroffene abschreiben. Der Unterschied ist
     pruefbar, und zwar genauer als "das Wort kommt nicht vor":

       - kein direkter Aufruf von decide-candidate.mjs
       - nirgends --approve oder --reject im Workflow
       - dispatch-publications.mjs gar nicht

     Eine Liste verbotener Woerter waere jetzt die bequemere Pruefung
     und die schwaechere: sie liesse sich durch Umbenennen erfuellen.
     ------------------------------------------------------------------- */
  const yml = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  for (const verboten of ["smoke-publish", "dispatch-publications",
                          "discover-creators",
                          "enrich-youtube-metrics", "plan-hashtag-observation"]) {
    assert.equal(yml.includes(verboten), false,
      "Der Orchestrator ruft " + verboten + " auf - das gehoert nicht in einen Zeitplan");
  }

  /* Entschieden wird nicht: weder direkt noch mit einer Flagge. */
  assert.ok(!/node\s+scripts\/social\/decide-candidate\.mjs/.test(yml),
    "Der Scheduler ruft decide-candidate direkt auf - dann entscheidet er.");
  for (const flagge of ["--approve", "--reject", "--hold", "--refine"]) {
    assert.ok(!yml.includes(flagge),
      "Der Scheduler traegt " + flagge + " im Workflow - eine Entscheidung, " +
      "die niemand getroffen hat.");
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

/* ------------------------------------------------------------------ */
/* JETZT POST ERSTELLEN WAEHLT DIE STORY, NICHT DIE INTERNE            */
/* GELEGENHEITSBEWERTUNG (Owner-Direktive "FINAL GOLDEN PATH           */
/* SIMPLIFICATION", 23.09., §2)                                        */
/* ------------------------------------------------------------------ */

test("OR14 · storyBestesThema() waehlt nach Story, nicht nach Opportunity.score", () => {
  const { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { execFileSync } = require("node:child_process");

  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const wurzel = mkdtempSync(join(tmpdir(), "vu-storybest-"));
  try {
    mkdirSync(join(wurzel, "quant/data/technical/instruments"), { recursive: true });
    /* Echte Bundles, keine Fixtures von Hand - eine handgebaute
       Evidenz haette genau die Frage entschieden, die dieser Test
       stellen soll: ob echte Evidenz eine echte Story traegt. */
    cpSync(join(REPO_ROOT, "quant/data/technical/instruments/MSFT.json"),
      join(wurzel, "quant/data/technical/instruments/MSFT.json"));
    cpSync(join(REPO_ROOT, "quant/data/technical/instruments/AAPL.json"),
      join(wurzel, "quant/data/technical/instruments/AAPL.json"));
    mkdirSync(join(wurzel, "social/data"), { recursive: true });
    writeFileSync(join(wurzel, "social/data/cycle-report.json"), JSON.stringify({
      generatedAt: "2026-09-23T12:00:00Z",
      opportunities: [
        { opportunityId: "opp_low", topic: "Niedrige interne Gelegenheit MSFT",
          score: 10, proposable: true },
        { opportunityId: "opp_high", topic: "Hohe interne Gelegenheit AAPL",
          score: 90, proposable: true }
      ]
    }));

    /* run-orchestrator.mjs ist ein ESM-Skript, hier ohne eigenen ESM-
       Testlauf erreichbar - ein kleines Kindskript ruft dynamic
       import() auf und gibt das Ergebnis als JSON zurueck. */
    const modulPfad = join(REPO_ROOT, "scripts/social/run-orchestrator.mjs")
      .replace(/\\/g, "/");
    const skript = `
      import(${JSON.stringify("file://" + modulPfad)}).then((O) => {
        const alt = O.bestesThema(${JSON.stringify(wurzel)});
        const neu = O.storyBestesThema(${JSON.stringify(wurzel)});
        console.log(JSON.stringify({ alt, neu }));
      });
    `;
    const kindPfad = join(wurzel, "probe.mjs");
    writeFileSync(kindPfad, skript);
    const ausgabe = execFileSync("node", [kindPfad], { encoding: "utf8" });
    const { alt, neu } = JSON.parse(ausgabe.trim().split("\n").pop());

    assert.equal(alt.symbol, "AAPL",
      "bestesThema() (score-basiert) haette die hoehere Gelegenheitsbewertung waehlen muessen.");
    assert.equal(neu.symbol, "MSFT",
      "storyBestesThema() haette das Instrument mit der staerkeren Story waehlen " +
      "muessen - unabhaengig davon, dass seine interne Gelegenheitsbewertung " +
      "(10) weit unter der von AAPL (90) liegt.");
    assert.ok(neu.storyScore > 0);
    assert.ok(neu.storyHook, "storyBestesThema() muss den gewaehlten Hook mitfuehren.");
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* REGRESSION: storyBestesThema() MUSS BIS ZUR KANDIDATENBILDUNG       */
/* REISEN, NICHT NUR BIS ZUM CREATIVE-JOB-DISPATCH                     */
/*                                                                      */
/* Realer Befund (23.09., Lauf 35879671695): der erste produktive      */
/* MANUAL_NOW-Lauf nach der Golden-Path-Integration waehlte storyBestes-*/
/* Thema() korrekt fuer creativeBedarf() (Creative Job), aber          */
/* VORBEREITEN (run-social-cycle.mjs, ein eigener Prozess) kannte      */
/* dieses Urteil nicht und fiel auf die Ladder (Opportunity.score)     */
/* zurueck - der Kandidat wurde aus "Comeback?" gebaut, dem Ranking-    */
/* Thema, DATA_CARD statt GENERATIVE, mit dem Hook "420 von 5954       */
/* geprueften Titeln" - der vom Owner ausdruecklich benannten NEGATIVE  */
/* HOOK FIXTURE. Das Hard Final Creative Gate griff nicht, weil es nur */
/* fuer visualType===GENERATIVE gilt.                                  */
/* ------------------------------------------------------------------ */
test("OR15 · MANUAL_NOW reicht storyBestesThema() bis zu VORBEREITEN durch", () => {
  const skript = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..",
      "scripts/social/run-orchestrator.mjs"), "utf8");
  assert.match(skript, /manual_now_thema=.*manualNowThema/,
    "run-orchestrator.mjs muss manualNowThema im --github-output ausgeben - " +
    "sonst kennt VORBEREITEN (ein eigener Prozess) die Story-Auswahl nicht.");

  const yml = readFileSync(".github/workflows/social-orchestrator.yml", "utf8");
  const vorbereitenBlock = yml.slice(yml.indexOf("VORBEREITEN — bis zum Publishing Gate"));
  assert.match(vorbereitenBlock.slice(0, 3000),
    /MANUAL_NOW['"]?\s*&&\s*steps\.plan\.outputs\.manual_now_thema/,
    "VORBEREITEN muss VU_SOCIAL_THEMA_FREITEXT bei MANUAL_NOW aus " +
    "steps.plan.outputs.manual_now_thema setzen - sonst waehlt run-social-cycle.mjs " +
    "wieder ueber die Ladder (Opportunity.score) statt ueber die Story.");
});
