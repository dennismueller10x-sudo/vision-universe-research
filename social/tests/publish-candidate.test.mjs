/* =========================================================================
   VU SOCIAL — Der Publish Candidate (PC1–PC14)

   Der Owner entscheidet APPROVE oder REJECT und sonst nichts. Alles, was
   er dafuer braucht, muss im Kandidaten stehen — und alles, was darin
   steht, muss stimmen.

   -------------------------------------------------------------------------
   DIE ZWEI FEHLER, DIE HIER TEUER WAEREN
   -------------------------------------------------------------------------

   Eine erfundene Erwartung ("wir rechnen mit 400 Reichweite") wuerde
   nach der Messung als getroffen oder verfehlt zitiert — obwohl sie nie
   eine Grundlage hatte.

   Und eine Auswahl, die in Wahrheit an der Reihenfolge haengt, waere ein
   System, das eine Begruendung liefert, die es nicht benutzt hat. Genau
   das war der erste Stand: ein stillschweigend leerer Join, alle Scores
   0, und die Auswahl fiel auf das erste Paket.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { frequenzbefund, zielmetrik } from "../../scripts/social/make-publish-candidate.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ContentHash = require("../engines/content-hash.js");

const NOW = "2026-09-17T12:00:00Z";
const GRENZEN = { minHoursBetweenPosts: 20, maxPostsPer7Days: 4, maxPostsPer30Days: 12 };

const pipelineBeitrag = (iso) => ({
  publishedAt: iso, lineage: { origin: "PIPELINE_APPROVED" }
});
const bestandsBeitrag = (iso) => ({
  publishedAt: iso, lineage: { origin: "ORGANIC_PRE_EXISTING" }
});

/* ------------------------------------------------------------------ */
/* DIE FREQUENZ                                                        */
/* ------------------------------------------------------------------ */

test("PC1 · Ohne Pipeline-Beitraege ist alles frei", () => {
  const b = frequenzbefund([], GRENZEN, NOW);
  assert.equal(b.erlaubt, true);
  assert.equal(b.letzterPipelineBeitrag, null);
});

test("PC2 · Der Mindestabstand gilt", () => {
  const b = frequenzbefund([pipelineBeitrag("2026-09-17T02:00:00Z")], GRENZEN, NOW);
  assert.equal(b.erlaubt, false);
  assert.equal(b.stundenSeither, 10);
  assert.match(b.gruende.join(" "), /Mindestabstand ist 20/);
});

test("PC3 · Nach dem Mindestabstand ist wieder frei", () => {
  const b = frequenzbefund([pipelineBeitrag("2026-09-16T10:00:00Z")], GRENZEN, NOW);
  assert.equal(b.erlaubt, true);
  assert.equal(b.stundenSeither, 26);
});

test("PC4 · Die Wochengrenze gilt", () => {
  const tage = ["09-13", "09-14", "09-15", "09-16"].map((d) =>
    pipelineBeitrag("2026-" + d + "T10:00:00Z"));
  const b = frequenzbefund(tage, GRENZEN, NOW);
  assert.equal(b.erlaubt, false);
  assert.equal(b.in7Tagen, 4);
  assert.match(b.gruende.join(" "), /sieben Tagen/);
});

test("PC5 · Bestandsbeitraege zaehlen nicht in die Frequenz des Systems", () => {
  /* Sie sind die Entscheidung des Owners. Sie mitzuzaehlen hiesse, dem
     System eine Zurueckhaltung zu verordnen, die jemand anders bereits
     ausgeuebt hat. */
  const viele = ["09-13", "09-14", "09-15", "09-16", "09-17"].map((d) =>
    bestandsBeitrag("2026-" + d + "T10:00:00Z"));
  const b = frequenzbefund(viele, GRENZEN, NOW);
  assert.equal(b.erlaubt, true);
  assert.equal(b.in7Tagen, 0);
  assert.equal(b.letzterPipelineBeitrag, null);
});

test("PC6 · Ein ungesendeter Eintrag zaehlt nicht", () => {
  /* Eine Schatten-Entscheidung hat publishedAt = null. Sie als Beitrag
     zu zaehlen hiesse, das System fuer etwas zu bremsen, das nie
     hinausging. */
  const b = frequenzbefund([{ publishedAt: null, lineage: { origin: "SHADOW_CYCLE" } }],
    GRENZEN, NOW);
  assert.equal(b.erlaubt, true);
  assert.equal(b.in7Tagen, 0);
});

/* ------------------------------------------------------------------ */
/* DIE ERWARTUNG                                                       */
/* ------------------------------------------------------------------ */

test("PC7 · Ohne Vergleichsbasis gibt es keine Erwartung", () => {
  /* Eine Zahl hinzuschreiben, damit das Feld gefuellt aussieht, waere
     eine Prognose ohne Grundlage — und sie wuerde nach der Messung als
     getroffen oder verfehlt zitiert. */
  const z = zielmetrik({ cohorts: {} }, "IMAGE");
  assert.equal(z.metric, "reach");
  assert.equal(z.baseline, null);
  assert.equal(z.expectation, null);
  assert.match(z.note, /keine gemessene/i);
});

test("PC8 · Mit Vergleichsbasis nennt sie den Median der KOHORTE", () => {
  const z = zielmetrik({ cohorts: { REEL: {
    activeDimensions: ["reach", "engagement"], sampleSize: 9,
    baseline: { medians: { reach: 11 } } } } }, "REEL");
  assert.equal(z.metric, "reach");
  assert.equal(z.baseline, 11);
  assert.match(z.expectation, /Median der Kohorte \(11\)/);
  assert.match(z.note, /n=9/);
});

test("PC9 · Die Kohorte wird nicht verwechselt", () => {
  /* Ein Bild gegen die Reels zu messen waere eine Erwartung aus einer
     anderen Welt. */
  const befund = { cohorts: { REEL: { activeDimensions: ["reach"], sampleSize: 9,
    baseline: { medians: { reach: 11 } } } } };
  assert.equal(zielmetrik(befund, "IMAGE").baseline, null);
});

/* ------------------------------------------------------------------ */
/* DER LAUF                                                            */
/* ------------------------------------------------------------------ */

function platz(name) {
  const rel = join("tmp", "pc-" + name + "-" + process.pid);
  mkdirSync(join(ROOT, rel), { recursive: true });
  return { rel, abs: join(ROOT, rel) };
}

function entscheidung(over = {}) {
  return Object.assign({
    packageId: "pkg_1", topic: "Thema A", hook: "Ein Hook.",
    caption: "Ein Text.", hashtags: [], visualType: "DATA_CARD",
    archetype: "EXPLAIN_THE_MOVE", mode: "EXPLOIT", modeReason: "weil",
    plannedHourUtc: 9, timingSource: "Startwert", timingReason: "Standardfenster",
    strategyVersion: "strategy_initial",
    opportunityId: "opp_a", signalIds: ["sig_1"],
    asset: { plannable: true, rendered: true, visualType: "DATA_CARD",
      imageUrl: "https://research.visionuniverse.de/assets/social/pkg_1.jpg" }
  }, over);
}

function stand(abs, decisions, opportunities) {
  writeFileSync(join(abs, "shadow-decisions.json"),
    JSON.stringify({ generatedAt: NOW, decisions }));
  writeFileSync(join(abs, "cycle-report.json"), JSON.stringify({
    generatedAt: NOW, opportunities,
    learning: { evidenceRecord: { cohorts: {} } }, packages: [] }));
  writeFileSync(join(abs, "content-memory.json"), JSON.stringify({ entries: [] }));
}

function lauf(rel, extra = []) {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/make-publish-candidate.mjs"),
     "--data", rel, "--now", NOW, ...extra], { cwd: ROOT, encoding: "utf8" });
}

test("PC10 · Die Auswahl folgt dem Gelegenheitsscore, nicht der Reihenfolge", () => {
  /* Der erste Stand schlug die Gelegenheit ueber den Bericht nach, fand
     stillschweigend nichts, und waehlte damit das erste Paket — mit
     einer Begruendung, die es nicht benutzt hatte. */
  const p = platz("auswahl");
  try {
    stand(p.abs, [
      entscheidung({ packageId: "pkg_schwach", opportunityId: "opp_schwach", topic: "Schwach" }),
      entscheidung({ packageId: "pkg_stark", opportunityId: "opp_stark", topic: "Stark" })
    ], [
      { opportunityId: "opp_schwach", score: 40, proposable: true, explanation: "schwach",
        signalIds: ["s1"] },
      { opportunityId: "opp_stark", score: 80, proposable: true, explanation: "stark",
        signalIds: ["s2"] }
    ]);
    const aus = lauf(p.rel, ["--write"]);
    assert.match(aus, /Gewaehlt:  pkg_stark/);
    assert.match(aus, /Unterlegen: Schwach \(40\)/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC11 · Eine nicht vorschlagsfaehige Gelegenheit wird nicht vorgelegt", () => {
  /* Die Freigabe ist kein Ersatz fuer eine Schwelle. Sie ist eine
     Entscheidung ueber einen Beitrag, der die Schwellen bestanden hat. */
  const p = platz("nicht-vorschlagsfaehig");
  try {
    stand(p.abs, [entscheidung()],
      [{ opportunityId: "opp_a", score: 30, proposable: false, explanation: "zu duenn" }]);
    const aus = lauf(p.rel, ["--write"]);
    assert.match(aus, /KEIN KANDIDAT/);
    assert.ok(!existsSync(join(ROOT, "social/data/publish-candidates")) ||
      !readFileSync(join(p.abs, "shadow-decisions.json"), "utf8").includes("AWAITING"));
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC12 · Ein nur geplantes Bild reicht nicht", () => {
  const p = platz("nicht-gezeichnet");
  try {
    stand(p.abs, [entscheidung({ asset: { plannable: true, rendered: false,
      imageUrl: "https://x.invalid/a.jpg" } })],
      [{ opportunityId: "opp_a", score: 80, proposable: true, explanation: "stark" }]);
    assert.match(lauf(p.rel), /KEIN KANDIDAT/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC13 · Der Abdruck im Kandidaten deckt genau den Inhalt", () => {
  const p = platz("abdruck");
  try {
    stand(p.abs, [entscheidung()],
      [{ opportunityId: "opp_a", score: 80, proposable: true, explanation: "stark",
         signalIds: ["sig_1"] }]);
    const aus = lauf(p.rel, ["--write"]);
    const datei = (aus.match(/Geschrieben: (\S+\.json)/) || [])[1];
    const k = JSON.parse(readFileSync(join(ROOT, datei), "utf8"));

    assert.equal(k.state, "AWAITING_APPROVAL");
    assert.equal(k.contentHash, ContentHash.contentHash(k.content));
    assert.equal(k.content.contentId, "pkg_1");
    /* Die Kette entsteht HIER und nicht nachtraeglich: nachtraeglich
       waere sie eine Rekonstruktion, und eine Rekonstruktion ist keine
       Herkunft. */
    assert.deepEqual(k.provenance.signalIds, ["sig_1"]);
    assert.equal(k.provenance.opportunityId, "opp_a");
    assert.equal(k.provenance.strategyVersion, "strategy_initial");
    assert.equal(k.provenance.archetype, "EXPLAIN_THE_MOVE");
    assert.equal(k.provenance.mediaId, null, "noch nichts veroeffentlicht");
    assert.equal(k.provenance.approval, null, "und noch nichts freigegeben");
    rmSync(join(ROOT, datei), { force: true });
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC14 · Bei erreichter Frequenzgrenze entsteht kein Kandidat", () => {
  const p = platz("frequenz");
  try {
    stand(p.abs, [entscheidung()],
      [{ opportunityId: "opp_a", score: 80, proposable: true, explanation: "stark" }]);
    writeFileSync(join(p.abs, "content-memory.json"), JSON.stringify({
      entries: [pipelineBeitrag("2026-09-17T06:00:00Z")] }));

    const aus = lauf(p.rel, ["--write"]);
    assert.match(aus, /KEIN KANDIDAT/);
    assert.match(aus, /Frequenzgrenze/);
    assert.match(aus, /keine Messung an ihm/,
      "und der Grund wird genannt, nicht nur die Regel");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});
