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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
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
/* EIN OWNER-AUFTRAG HEBT DIE UHR AUF, NIE EIN TOR (Owner Correction #101) */
/*                                                                      */
/* frequenzbefund() traf frueher eine EIGENE Kadenzentscheidung, die   */
/* von manual-mode.js nichts wusste — eine zweite Source of Truth      */
/* fuer dieselbe Regel. JETZT POST ERSTELLEN wirkte deshalb genau in   */
/* dem Fall nicht, fuer den es existiert: der Orchestrator entschied   */
/* bereits "prepare = ja", und der Kandidatenbau lehnte trotzdem ab.   */
/*                                                                      */
/* Die sechs Faelle aus der Owner-Korrektur, direkt an der Funktion.   */
/* ------------------------------------------------------------------ */

const SPERRT = [pipelineBeitrag("2026-09-17T02:00:00Z")]; // 10 h her, Sperre 20 h

test("PC15 · Gegenprobe 1 — AUTO (kein Modus) + Spacing nicht erreicht -> kein Kandidat", () => {
  const b = frequenzbefund(SPERRT, GRENZEN, NOW);
  assert.equal(b.erlaubt, false);
  assert.deepEqual(b.aufgehoben, []);
  assert.match(b.gruende.join(" "), /Mindestabstand ist 20/);
});

test("PC16 · Gegenprobe 2 — JETZT PRUEFEN + Spacing nicht erreicht -> kein Kandidat", () => {
  /* §28: JETZT PRUEFEN ist kein Produktionsauftrag. Es hebt nichts auf,
     obwohl es einer der drei Knoepfe ist. */
  const b = frequenzbefund(SPERRT, GRENZEN, NOW, "JETZT_PRUEFEN");
  assert.equal(b.erlaubt, false);
  assert.deepEqual(b.aufgehoben, []);
});

test("PC17 · Gegenprobe 3 — MANUAL NOW + Spacing nicht erreicht -> Kandidat erlaubt", () => {
  const b = frequenzbefund(SPERRT, GRENZEN, NOW, "MANUAL_NOW");
  assert.equal(b.erlaubt, true);
  assert.equal(b.gruende.length, 0);
  assert.equal(b.aufgehoben.length, 1);
  assert.match(b.aufgehoben[0], /Mindestabstand ist 20/);
  assert.match(b.aufgehoben[0], /JETZT POST ERSTELLEN/);
});

test("PC18 · MANUAL NOW hebt auch die Wochen- und Monatsgrenze auf", () => {
  /* "Daily Cap ... dürfen für die Candidate-Produktion übergangen
     werden" — dieselbe KLASSE wie die Tagesobergrenze im Orchestrator,
     hier als Wochen-/Monatsquote. */
  const tage = ["09-13", "09-14", "09-15", "09-16"].map((d) =>
    pipelineBeitrag("2026-" + d + "T10:00:00Z"));
  const b = frequenzbefund(tage, GRENZEN, NOW, "MANUAL_NOW");
  assert.equal(b.erlaubt, true);
  assert.equal(b.in7Tagen, 4);
  assert.equal(b.aufgehoben.length, 1);
  assert.match(b.aufgehoben[0], /sieben Tagen/);
});

test("PC19 · POST ZU THEMA hebt dieselben Gruende auf wie JETZT POST ERSTELLEN", () => {
  /* §30: derselbe Auftrag, nur mit benanntem Thema. Dieselbe Tabelle
     gilt fuer beide - nicht eine dritte Kopie fuer MANUAL_TOPIC. */
  const b = frequenzbefund(SPERRT, GRENZEN, NOW, "MANUAL_TOPIC");
  assert.equal(b.erlaubt, true);
  assert.match(b.aufgehoben[0], /POST ZU THEMA/);
});

test("PC19b · Ein unbekannter Modus hebt nichts auf", () => {
  /* Unbekanntes ist kein Freibrief - derselbe Grundsatz wie in
     manual-mode.js selbst. Ein Tippfehler in der Umgebungsvariable
     darf nie zu einer stillschweigend uebergangenen Sperre werden. */
  const b = frequenzbefund(SPERRT, GRENZEN, NOW, "MANUEL_NOW");
  assert.equal(b.erlaubt, false);
  assert.deepEqual(b.aufgehoben, []);
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

function lauf(rel, extra = [], env = {}) {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/make-publish-candidate.mjs"),
     "--data", rel, "--now", NOW, ...extra],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
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

test("PC14b · Gegenprobe 3, Ende-zu-Ende — MANUAL NOW erreicht das Schreiben", () => {
  /* Derselbe Aufbau wie PC14, aber mit dem Owner-Auftrag in der
     Umgebung — genau der Weg, ueber den run-orchestrator.mjs und die
     VORBEREITEN-Stufe des Workflows ihn uebergeben. Ohne die Korrektur
     bliebe dies "KEIN KANDIDAT", trotz JETZT POST ERSTELLEN. */
  const p = platz("frequenz-manual");
  try {
    stand(p.abs, [entscheidung()],
      [{ opportunityId: "opp_a", score: 80, proposable: true, explanation: "stark" }]);
    writeFileSync(join(p.abs, "content-memory.json"), JSON.stringify({
      entries: [pipelineBeitrag("2026-09-17T06:00:00Z")] }));

    const aus = lauf(p.rel, ["--write"], { VU_SOCIAL_MODUS: "MANUAL_NOW" });
    assert.doesNotMatch(aus, /KEIN KANDIDAT/);
    assert.match(aus, /Durch Owner-Auftrag aufgehoben/);
    assert.match(aus, /Geschrieben:/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC14c · Gegenprobe 5 — MANUAL NOW hebt das Quality Gate nicht auf", () => {
  /* Ein nicht gezeichnetes Bild (PC12) bleibt ein nicht gezeichnetes
     Bild — unabhaengig davon, dass die Frequenzsperre aufgehoben ist.
     Der Auftrag beschleunigt die Auswahl, er ersetzt sie nicht. */
  const p = platz("quality-manual");
  try {
    stand(p.abs, [entscheidung({ asset: { plannable: true, rendered: false,
      imageUrl: "https://x.invalid/a.jpg" } })],
      [{ opportunityId: "opp_a", score: 80, proposable: true, explanation: "stark" }]);
    writeFileSync(join(p.abs, "content-memory.json"), JSON.stringify({
      entries: [pipelineBeitrag("2026-09-17T06:00:00Z")] }));

    const aus = lauf(p.rel, [], { VU_SOCIAL_MODUS: "MANUAL_NOW" });
    assert.match(aus, /Durch Owner-Auftrag aufgehoben/,
      "die Frequenzsperre ist aufgehoben —");
    assert.match(aus, /KEIN KANDIDAT/, "— das Qualitaetstor trotzdem nicht");
    assert.match(aus, /keine Entscheidung hat ein gezeichnetes Bild/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC14d · Gegenprobe 6 — MANUAL NOW hebt das Asset-Tor nicht auf", () => {
  /* Keine sendbare Entscheidung ueberhaupt (kein Kandidat mit Bild und
     imageUrl in der Fracht) — der Auftrag erfindet keine Fracht, die
     es nicht gibt. */
  const p = platz("asset-manual");
  try {
    stand(p.abs, [], []);
    writeFileSync(join(p.abs, "content-memory.json"), JSON.stringify({
      entries: [pipelineBeitrag("2026-09-17T06:00:00Z")] }));

    const aus = lauf(p.rel, [], { VU_SOCIAL_MODUS: "MANUAL_NOW" });
    assert.match(aus, /Durch Owner-Auftrag aufgehoben/);
    assert.match(aus, /KEIN KANDIDAT/);
    assert.match(aus, /keine Entscheidung hat ein gezeichnetes Bild/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC20 · Ein fremder Datenstand erreicht die echte Freigabe nicht", () => {
  /* Der Kandidatenordner lag fest, unabhaengig von --data. Das Skript
     las damit aus dem Datenstand, den man ihm nannte, und schrieb in
     den EINEN echten Kandidatenordner — denselben, den die
     Owner-Freigabe liest.

     Aufgefallen ist es an einem Kandidaten mit dem Thema "Stark", der
     Hook "Ein Hook." und dem Text "Ein Text.", der dort aus einem
     frueheren Testlauf lag. Ein Test, der der Freigabe etwas zum
     Freigeben unterschiebt, ist kein Test mehr. */
  const echt = join(ROOT, "social/data/publish-candidates");
  const vorher = existsSync(echt) ? readdirSync(echt).sort() : [];

  const p = platz("fremder-stand");
  try {
    stand(p.abs, [entscheidung({ packageId: "pkg_fremd", topic: "Fremd" })],
      [{ opportunityId: "opp_a", score: 90, proposable: true, explanation: "stark" }]);
    lauf(p.rel, ["--write"]);

    const nachher = existsSync(echt) ? readdirSync(echt).sort() : [];
    assert.deepEqual(nachher, vorher,
      "der Lauf hat in den echten Kandidatenordner geschrieben");

    /* Und der eigene Ordner ist da, wo der Datenstand ist. */
    const eigener = join(p.abs, "publish-candidates");
    assert.ok(existsSync(eigener), "kein Kandidatenordner im eigenen Datenstand");
    assert.ok(readdirSync(eigener).some((f) => f.endsWith(".json")));
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC21 · Ein Lauf ersetzt keinen zurueckgehaltenen Kandidaten", () => {
  /* Der zweite Teil des Vorfalls. Das Testartefakt hatte den echten
     Kandidaten als SUPERSEDED markiert, weil die Supersede-Regel ALLE
     offenen Kandidaten anfasst.

     "Offen" heisst jetzt: maschinell. Ein zurueckgehaltener Kandidat
     ist entschieden und faellt nicht darunter — und selbst wenn der
     Filter ihn durchliesse, wirft der Guard beim Schreiben. */
  const p = platz("held-bleibt");
  try {
    stand(p.abs, [entscheidung({ packageId: "pkg_neu", topic: "Neu" })],
      [{ opportunityId: "opp_a", score: 90, proposable: true, explanation: "stark" }]);

    const kdir = join(p.abs, "publish-candidates");
    mkdirSync(kdir, { recursive: true });
    const gehalten = {
      candidateId: "cand_gehalten", version: 1, state: "HELD_FOR_ENRICHMENT",
      createdAt: "2026-09-17T09:00:00Z",
      content: { contentId: "pkg_alt", imageUrl: "https://x.invalid/a.jpg", caption: "Alt." },
      contentHash: "0".repeat(64),
      hold: { reason: "Evidenz reicht nicht.", decidedBy: "owner",
              decidedAt: "2026-09-17T09:30:00Z" }
    };
    writeFileSync(join(kdir, "cand_gehalten.json"),
      JSON.stringify(gehalten, null, 2) + "\n");

    lauf(p.rel, ["--write"]);

    const nachher = JSON.parse(readFileSync(join(kdir, "cand_gehalten.json"), "utf8"));
    assert.equal(nachher.state, "HELD_FOR_ENRICHMENT",
      "der Lauf hat eine Owner-Entscheidung ueberschrieben");
    assert.equal(nachher.supersededBy, undefined);
    assert.equal(nachher.hold.reason, "Evidenz reicht nicht.");

    /* Und der neue Kandidat entsteht trotzdem — der Schutz sperrt die
       Entscheidung, nicht den Betrieb. */
    const neue = readdirSync(kdir).filter((f) => f !== "cand_gehalten.json");
    assert.ok(neue.length >= 1, "kein neuer Kandidat entstanden");
    assert.equal(JSON.parse(readFileSync(join(kdir, neue[0]), "utf8")).state,
      "AWAITING_APPROVAL");
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC22 · Ein zweiter Lauf ueberschreibt die eigene Owner-Entscheidung nicht", () => {
  /* Die Luecke, die PC21 offen liess.

     PC21 schuetzt die VORGAENGER. Die Datei, die der Lauf selbst
     schreibt, war ungeschuetzt — und das reichte nur so lange, wie ein
     neuer Kandidat eine neue Kennung bekam. Die Kennung kommt aber aus
     dem Inhalt: derselbe Datenstand ergibt dieselbe Kennung. Nach einer
     Owner-Entscheidung haette ein zweiter Lauf ueber unveraenderte
     Daten sie glatt ueberschrieben und den Kandidaten wieder auf
     AWAITING_APPROVAL gesetzt.

     Genau derselbe Fehler wie bei cand_20260917_0363e680, eine Zeile
     weiter. */
  const p = platz("eigener-schutz");
  try {
    stand(p.abs, [entscheidung({ packageId: "pkg_x", topic: "Thema X" })],
      [{ opportunityId: "opp_a", score: 90, proposable: true, explanation: "stark" }]);

    /* Erster Lauf: der Kandidat entsteht. */
    lauf(p.rel, ["--write"]);
    const kdir = join(p.abs, "publish-candidates");
    const datei = readdirSync(kdir)[0];
    const pfad = join(kdir, datei);
    assert.equal(JSON.parse(readFileSync(pfad, "utf8")).state, "AWAITING_APPROVAL");

    /* Der Owner entscheidet: redaktionell zurueckgehalten. */
    const entschieden = JSON.parse(readFileSync(pfad, "utf8"));
    entschieden.state = "HELD_FOR_CREATIVE_REFINEMENT";
    entschieden.hold = { reason: "Hook nicht stark genug.", decidedBy: "owner",
      decidedAt: NOW, stage: "CREATIVE", evidenceFailure: false, creativeFailure: true };
    writeFileSync(pfad, JSON.stringify(entschieden, null, 2) + "\n");

    /* Zweiter Lauf ueber DENSELBEN Datenstand - also dieselbe Kennung. */
    const aus = lauf(p.rel, ["--write"]);

    const nachher = JSON.parse(readFileSync(pfad, "utf8"));
    assert.equal(nachher.state, "HELD_FOR_CREATIVE_REFINEMENT",
      "der Lauf hat seine eigene Owner-Entscheidung ueberschrieben");
    assert.equal(nachher.hold.reason, "Hook nicht stark genug.");

    /* Und er sagt das, statt abzustuerzen: eine erreichte Entscheidung
       ist der Normalfall, keine Stoerung. */
    assert.match(aus, /NICHT GESCHRIEBEN/);
    assert.match(aus, /HELD_FOR_CREATIVE_REFINEMENT/);
  } finally { rmSync(p.abs, { recursive: true, force: true }); }
});

test("PC23 · Die beiden Halte-Gruende werden nicht verwechselt", () => {
  /* "Zu wenig Belege" und "die Auswahl aus den Belegen traegt nicht"
     schicken verschiedene Stufen zurueck an die Arbeit. Wer sie
     gleich protokolliert, laesst die falsche Stelle suchen. */
  const OD = require("../engines/owner-decision.js");

  const evidenz = OD.haltegrund("HELD_FOR_ENRICHMENT");
  const kreativ = OD.haltegrund("HELD_FOR_CREATIVE_REFINEMENT");

  assert.equal(evidenz.stage, "EVIDENCE");
  assert.equal(evidenz.evidenceFailure, true);
  assert.equal(kreativ.stage, "CREATIVE");
  assert.equal(kreativ.evidenceFailure, false);
  assert.equal(kreativ.creativeFailure, true);

  /* Beide sind entschieden, beide ohne Leistungsaussage. */
  ["HELD_FOR_ENRICHMENT", "HELD_FOR_CREATIVE_REFINEMENT"].forEach((z) => {
    assert.equal(OD.istEntschieden(z), true, z);
    assert.equal(OD.traegtLeistungsaussage(z), false, z);
    assert.equal(OD.mayTransition(z, "AWAITING_APPROVAL", { actor: "machine" }).ok,
      false, z + " ist maschinell aenderbar");
  });
});
