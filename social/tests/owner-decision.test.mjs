/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/owner-decision.test.mjs

   Diese Datei hat einen Anlass, und er war ein Fehler von mir.

   Ein Testartefakt hatte den echten Kandidaten cand_20260917_0363e680
   als SUPERSEDED markiert. Bei der Reparatur habe ich ihn auf
   AWAITING_APPROVAL zurueckgesetzt — und damit eine bereits getroffene
   Owner-Entscheidung ueberschrieben: nicht veroeffentlichen, wegen
   unzureichender Evidenz zurueckhalten, ausdruecklich keine Ablehnung
   wegen erwarteter Leistung.

   Moeglich war das, weil es fuer diese Entscheidung KEINEN ZUSTAND
   gab. Das Vokabular kannte AWAITING_APPROVAL, APPROVED, REJECTED und
   SUPERSEDED. Was nirgends steht, ueberschreibt der naechste Vorgang,
   ohne es zu merken.

   Die Tests hier halten beide Haelften fest: dass es den Zustand gibt,
   und dass keine Maschine an ihm vorbeikommt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const O = require("../engines/owner-decision.js");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ------------------------------------------------------------------ */
/* DIE GRENZE                                                          */
/* ------------------------------------------------------------------ */

test("OD1 · Es gibt einen Zustand fuer 'zurueckgehalten'", () => {
  /* Der Kern des Vorfalls: ohne ihn liess sich die Entscheidung nicht
     festhalten, und eine nicht festgehaltene Entscheidung ist keine. */
  assert.ok(O.ZUSTAENDE.includes("HELD_FOR_ENRICHMENT"));
  assert.ok(O.istEntschieden("HELD_FOR_ENRICHMENT"));
  assert.ok(!O.istMaschinell("HELD_FOR_ENRICHMENT"));
});

test("OD2 · Zurueckgehalten ist keine Leistungsaussage", () => {
  /* Der Owner hat das ausdruecklich verlangt, und es gilt aus dem
     gleichen Grund wie bei REJECTED: der Beitrag ist nie erschienen. */
  assert.equal(O.traegtLeistungsaussage("HELD_FOR_ENRICHMENT"), false);
  assert.equal(O.traegtLeistungsaussage("REJECTED"), false);
  assert.equal(O.traegtLeistungsaussage("APPROVED"), true);
});

test("OD3 · Eine Maschine kommt an keiner Owner-Entscheidung vorbei", () => {
  for (const entschieden of O.ENTSCHIEDEN) {
    for (const ziel of O.ZUSTAENDE) {
      const b = O.mayTransition(entschieden, ziel, { actor: "machine" });
      assert.equal(b.ok, false, entschieden + " -> " + ziel + " war erlaubt");
      assert.equal(b.reason, "ownerDecided");
    }
  }
});

test("OD4 · Genau der Uebergang, der passiert ist, wird abgewiesen", () => {
  const b = O.mayTransition("HELD_FOR_ENRICHMENT", "AWAITING_APPROVAL", { actor: "machine" });
  assert.equal(b.ok, false);
  assert.equal(b.reason, "ownerDecided");
  assert.match(b.explanation, /Recovery|Reparatur/);
});

test("OD5 · Eine Maschine trifft auch keine neue Entscheidung", () => {
  /* Die Gegenrichtung. Ein Lauf, der selbst auf REJECTED setzt, haette
     entschieden — und genau das ist dem Owner vorbehalten. */
  for (const ziel of O.ENTSCHIEDEN) {
    const b = O.mayTransition("AWAITING_APPROVAL", ziel, { actor: "machine" });
    assert.equal(b.ok, false, "Maschine durfte " + ziel + " setzen");
    assert.equal(b.reason, "machineCannotDecide");
  }
});

test("OD6 · Der Owner darf jeden Zustand setzen", () => {
  /* Sonst waere der Guard kein Schutz, sondern eine Sperre gegen den,
     den er schuetzt. */
  for (const von of O.ZUSTAENDE) {
    for (const nach of O.ZUSTAENDE) {
      assert.equal(O.mayTransition(von, nach, { actor: "owner" }).ok, true,
        von + " -> " + nach + " war dem Owner verboten");
    }
  }
});

test("OD7 · Maschinelle Uebergaenge bleiben moeglich", () => {
  /* Ein Guard, der alles sperrt, sperrt auch den Betrieb. */
  assert.equal(O.mayTransition("AWAITING_APPROVAL", "SUPERSEDED").ok, true);
});

test("OD8 · guardWrite wirft, statt zu vermerken", () => {
  /* Ein Vorgang, der eine Owner-Entscheidung anfassen wollte, hat eine
     falsche Annahme ueber die Welt. Die soll auffallen und nicht in
     einem Protokoll landen, das niemand liest. */
  const vorhanden = { candidateId: "cand_x", state: "HELD_FOR_ENRICHMENT" };
  const neu = { candidateId: "cand_x", state: "SUPERSEDED" };
  assert.throws(() => O.guardWrite(vorhanden, neu, { actor: "machine" }),
    (err) => err.code === "ownerDecided" && err.candidateId === "cand_x");
});

test("OD9 · Ohne Vorgaenger gibt es nichts zu schuetzen", () => {
  const neu = { candidateId: "cand_neu", state: "AWAITING_APPROVAL" };
  assert.deepEqual(O.guardWrite(null, neu, { actor: "machine" }), neu);
});

test("OD10 · partition trennt, was eine Maschine anfassen darf", () => {
  const p = O.partition([
    { candidateId: "a", state: "AWAITING_APPROVAL" },
    { candidateId: "b", state: "HELD_FOR_ENRICHMENT" },
    { candidateId: "c", state: "APPROVED" },
    { candidateId: "d", state: "SUPERSEDED" }
  ]);
  assert.deepEqual(p.machineWritable.map((x) => x.candidateId), ["a", "d"]);
  assert.deepEqual(p.ownerDecided.map((x) => x.candidateId), ["b", "c"]);
});

/* ------------------------------------------------------------------ */
/* DER ECHTE WEG                                                       */
/* ------------------------------------------------------------------ */

function platz(name) {
  const rel = join("tmp", "od-" + name + "-" + process.pid);
  mkdirSync(join(ROOT, rel), { recursive: true });
  return { rel, abs: join(ROOT, rel) };
}

function kandidatDatei(dirAbs, id, state) {
  mkdirSync(dirAbs, { recursive: true });
  writeFileSync(join(dirAbs, id + ".json"), JSON.stringify({
    candidateId: id, version: 1, state: state,
    createdAt: "2026-09-17T10:00:00Z",
    content: { contentId: "pkg_1", imageUrl: "https://x.invalid/a.jpg", caption: "Ein Text." },
    contentHash: "0".repeat(64),
    presentation: { topic: "Thema", hook: "Ein Hook." },
    provenance: { archetype: "STOCK_STORY", hook: "Ein Hook." }
  }, null, 2) + "\n");
}

function entscheide(dirRel, id, extra) {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/decide-candidate.mjs"),
     "--candidate", id, "--dir", dirRel, "--now", "2026-09-17T12:00:00Z", ...extra],
    { cwd: ROOT, encoding: "utf8" });
}

test("OD11 · --hold setzt den Zustand und nennt ihn keine Ablehnung", () => {
  const p = platz("hold");
  try {
    kandidatDatei(p.abs, "cand_hold", "AWAITING_APPROVAL");
    const aus = entscheide(p.rel, "cand_hold",
      ["--hold", "--reason", "Evidenz reicht nicht."]);
    assert.match(aus, /ZURUECKGEHALTEN/);
    assert.match(aus, /keine Ablehnung/);

    const d = JSON.parse(readFileSync(join(p.abs, "cand_hold.json"), "utf8"));
    assert.equal(d.state, "HELD_FOR_ENRICHMENT");
    assert.equal(d.hold.reason, "Evidenz reicht nicht.");
    assert.match(d.hold.note, /KEINE Aussage ueber die zu erwartende Leistung/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("OD12 · --hold ohne Grund ist keine Entscheidung", () => {
  const p = platz("hold-ohne-grund");
  try {
    kandidatDatei(p.abs, "cand_hold", "AWAITING_APPROVAL");
    assert.throws(() => entscheide(p.rel, "cand_hold", ["--hold"]));
    const d = JSON.parse(readFileSync(join(p.abs, "cand_hold.json"), "utf8"));
    assert.equal(d.state, "AWAITING_APPROVAL");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("OD13 · Ein zurueckgehaltener Kandidat wird nicht mehr entschieden", () => {
  /* Eine zweite Entscheidung ueber denselben Beitrag ist entweder
     wirkungslos oder gefaehrlich. */
  const p = platz("hold-dann-approve");
  try {
    kandidatDatei(p.abs, "cand_hold", "HELD_FOR_ENRICHMENT");
    assert.throws(() => entscheide(p.rel, "cand_hold", ["--approve"]));
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("OD14 · Genau eines von approve, reject und hold", () => {
  const p = platz("zwei-auf-einmal");
  try {
    kandidatDatei(p.abs, "cand_x", "AWAITING_APPROVAL");
    assert.throws(() => entscheide(p.rel, "cand_x", ["--hold", "--reject", "--reason", "x"]));
    assert.throws(() => entscheide(p.rel, "cand_x", []));
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------------ */
/* DIE FEHLERART, DREIMAL GEFUNDEN                                     */
/* ------------------------------------------------------------------ */

test("OD15 · Kein Testlauf schreibt in den Produktionsbestand", () => {
  /* Dreimal in diesem Abschnitt gefunden:
       1. make-publish-candidate.mjs schrieb Kandidaten in einen festen
          Ordner statt in den zum Datenstand gehoerenden
       2. quant/tests schreiben quant/data/universe neu
       3. decide-candidate.mjs schrieb die Rueckmeldung in eine feste
          Datei, obwohl --dir die Kandidaten verschob

     Der gemeinsame Bau: Eingabestand aus einem Parameter, Ausgabestand
     aus einer Konstante. Dieser Test prueft die Klasse und nicht den
     Einzelfall — er vergleicht den gesamten Produktionsbestand vor und
     nach einem vollstaendigen Entscheidungslauf. */
  const bestand = join(ROOT, "social/data");
  const vorher = new Map();
  for (const f of readdirSync(bestand)) {
    const p = join(bestand, f);
    if (statSync(p).isFile()) vorher.set(f, readFileSync(p, "utf8"));
  }

  const p = platz("kein-produktionsschreiben");
  try {
    kandidatDatei(p.abs, "cand_a", "AWAITING_APPROVAL");
    kandidatDatei(p.abs, "cand_b", "AWAITING_APPROVAL");
    entscheide(p.rel, "cand_a", ["--hold", "--reason", "Evidenz reicht nicht."]);
    entscheide(p.rel, "cand_b", ["--reject", "--reason", "Passt nicht."]);

    for (const [f, inhalt] of vorher) {
      assert.equal(readFileSync(join(bestand, f), "utf8"), inhalt,
        "social/data/" + f + " wurde von einem Testlauf veraendert");
    }
    /* Und die Rueckmeldung liegt im eigenen Datenstand. */
    const eigene = join(p.abs, "approval-feedback.json");
    assert.ok(existsSync(eigene), "keine Rueckmeldung im eigenen Datenstand");
    const fb = JSON.parse(readFileSync(eigene, "utf8"));
    assert.deepEqual(fb.entries.map((e) => e.decision).sort(), ["HOLD", "REJECT"]);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("OD16 · Der vierte Zustand: zurueckgehalten, aber nicht wegen Evidenz", () => {
  /* Derselbe Befund ein zweites Mal. cand_20260918_ca4ea408 war
     technisch einwandfrei, evidenzgebunden, faktengeprueft — und
     redaktionell noch nicht gut genug.

     Ohne eigenen Zustand haette diese Entscheidung als eine der drei
     vorhandenen protokolliert werden muessen, und jede davon haette
     etwas Unwahres behauptet: HELD_FOR_ENRICHMENT "zu wenig Belege",
     REJECTED "falsches Thema", AWAITING_APPROVAL "noch nicht
     entschieden". */
  assert.ok(O.ENTSCHIEDEN.includes("HELD_FOR_CREATIVE_REFINEMENT"));
  assert.equal(O.istEntschieden("HELD_FOR_CREATIVE_REFINEMENT"), true);
  assert.equal(O.istMaschinell("HELD_FOR_CREATIVE_REFINEMENT"), false);

  /* Kein Leistungsurteil — genau wie REJECTED und HELD_FOR_ENRICHMENT,
     und aus demselben Grund: der Beitrag ist nie erschienen. */
  assert.equal(O.traegtLeistungsaussage("HELD_FOR_CREATIVE_REFINEMENT"),
    false);

  /* Und keine Maschine kommt daran vorbei. */
  const versuch = O.mayTransition(
    "HELD_FOR_CREATIVE_REFINEMENT", "AWAITING_APPROVAL", { actor: "machine" });
  assert.equal(versuch.ok, false);
  assert.equal(versuch.reason, "ownerDecided");

  /* Der Owner schon — das IST das Owner-Gate. */
  assert.equal(O.mayTransition(
    "HELD_FOR_CREATIVE_REFINEMENT", "APPROVED", { actor: "owner" }).ok, true);
});

test("OD17 · Eine Maschine erfindet diesen Zustand nicht", () => {
  /* Er ist eine Entscheidung. "Das ist redaktionell zu schwach" ist
     ein Urteil ueber Qualitaet, und das faellt ein Mensch. Die Rubrik
     in creative-quality.js BERAET dabei; sie entscheidet nicht. */
  const versuch = O.mayTransition(
    "AWAITING_APPROVAL", "HELD_FOR_CREATIVE_REFINEMENT", { actor: "machine" });
  assert.equal(versuch.ok, false);
  assert.equal(versuch.reason, "machineCannotDecide");
});

/* ------------------------------------------------------------------ */
/* DER DRITTE HALTEGRUND LIEGT EINE EBENE HOEHER                       */
/* ------------------------------------------------------------------ */

test("OD18 · Audience Fit ist weder Evidenz- noch Creative-Fehler", () => {
  /* Beides kann mit Ja beantwortet sein und der Beitrag trotzdem nicht
     veroeffentlichungsfaehig, weil das Content-KONZEPT ein Publikum
     voraussetzt, das es nicht gibt. Ein Zustandsraum, der das nicht
     ausdruecken kann, zwingt zu einer falschen Einordnung. */
  const g = O.haltegrund("HELD_FOR_AUDIENCE_FIT");
  assert.equal(g.evidenceFailure, false);
  assert.equal(g.creativeFailure, false);
  assert.equal(g.audienceFailure, true);
  assert.equal(g.stage, "OPPORTUNITY");
});

test("OD19 · Die Nacharbeit setzt frueher an als der Text", () => {
  /* "Creative Refinement" hiesse: schreib es besser. Der Befund lautet
     aber: waehle etwas anderes aus. Eine weitere Textrevision waere die
     falsche Nacharbeit - und genau die hat der Owner untersagt. */
  assert.equal(O.haltegrund("HELD_FOR_AUDIENCE_FIT").reworkStage,
    "SOCIAL_OPPORTUNITY");
  assert.equal(O.haltegrund("HELD_FOR_CREATIVE_REFINEMENT").reworkStage,
    undefined);
});

test("OD20 · Ein nie erschienener Beitrag hat keine Leistung", () => {
  /* Der Post wurde nicht veroeffentlicht. Daraus darf KEINE Aussage
     ueber reale Social Performance gelernt werden - sonst lernt das
     System aus n=0 eine Regel. */
  assert.ok(O.OHNE_LEISTUNGSAUSSAGE.includes("HELD_FOR_AUDIENCE_FIT"));
});

test("OD21 · Der Zustand ist entschieden und maschinell unantastbar", () => {
  assert.equal(O.istEntschieden("HELD_FOR_AUDIENCE_FIT"), true);
  const alt = { candidateId: "c1", state: "HELD_FOR_AUDIENCE_FIT", version: 1 };
  assert.throws(() => O.guardWrite(alt,
    { candidateId: "c1", state: "AWAITING_APPROVAL", version: 1 },
    { actor: "machine" }));
});
