/* =========================================================================
   VU SOCIAL — Die Schliessung des Kreislaufs (LC1–LC8)

   Der Unterschied zwischen diesem Test und allen anderen: er prueft
   nicht, ob eine Engine tut, was ihre Tests sagen, sondern ob gemessene
   Leistung eine SPAETERE ENTSCHEIDUNG erreicht.

   Er faehrt dazu den echten Zyklus als Unterprozess. Eine Nachbildung
   wuerde nur beweisen, dass die Nachbildung funktioniert — und genau
   diese Verwechslung ist der Grund, warum "viele gruene Unit-Tests"
   die Definition of Done nicht erfuellen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = "2026-09-18T12:00:00Z";

function lauf(args) {
  return execFileSync(process.execPath, [join(ROOT, "scripts/social/prove-loop-closure.mjs"), ...args],
    { cwd: ROOT, encoding: "utf8" });
}

function zyklus(datenRel, ausgabeRel) {
  execFileSync(process.execPath, [join(ROOT, "scripts/social/run-social-cycle.mjs"),
    "--provider", "mock", "--data", datenRel, "--out", ausgabeRel, "--now", NOW],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(readFileSync(join(ROOT, ausgabeRel, "cycle-report.json"), "utf8"));
}

/* Ein Arbeitsplatz im Workspace — nicht unter /tmp: der Zyklus loest
   seine Pfade gegen die Wurzel auf. */
function platz(name) {
  const rel = join("tmp", "lc-" + name + "-" + process.pid);
  mkdirSync(join(ROOT, rel), { recursive: true });
  copyFileSync(join(ROOT, "social/data/signals.json"), join(ROOT, rel, "signals.json"));
  /* -----------------------------------------------------------------
     DIE PLATTE GEHOERT IN DEN ARBEITSPLATZ

     Seit der Zyklus seine Gelegenheiten ueber die Content Ladder aus
     der Platte nimmt, ist ein Arbeitsplatz ohne Platte ein Zyklus
     ohne Themen - und diese Tests messen dann nicht, was sie messen
     wollen, sondern nur das Fehlen einer Datei.

     Gebaut wird sie mit demselben Skript wie im Scheduler und mit
     DEM ZEITPUNKT DIESES LAUFS: sonst prueft der Zyklus ihr Alter
     gegen eine andere Uhr. Geschrieben wird nur in den
     Arbeitsplatz - social/data bleibt unberuehrt (§42). */
  execFileSync(process.execPath, [join(ROOT, "scripts/social/build-opportunity-slate.mjs"),
    "--now", NOW, "--out", rel], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] });
  return rel;
}

const eintraege = (paare) => paare.flatMap(([archetype, werte]) =>
  werte.map((wert, i) => ({
    publicationId: `p_${archetype}_${i}`, packageId: `k_${archetype}_${i}`,
    publishedAt: NOW, platform: "instagram", topic: "T", entities: [],
    archetype, visualType: "STATIC_IMAGE", hook: "H", caption: "", cta: null,
    performance: wert,
    performanceProvenance: { source: "SIMULATED" }
  })));

test("LC1 · Belastbare Evidenz erreicht die Entscheidung selbst", () => {
  const aus = lauf(["--evidence", "simulated", "--now", NOW]);
  assert.match(aus, /URTEIL: CLOSED_DECISION/);
});

test("LC1b · Das Urteil ist gestaffelt und ueberclaimt nicht", () => {
  /* "Irgendetwas hat sich geaendert" waere ein zu schwaches Kriterium:
     eine hochgezaehlte Kennzahl ist auch ein Unterschied und beweist
     nichts. CLOSED_STATE als CLOSED_DECISION auszugeben waere die
     bequemste Luege dieses Projekts. */
  const aus = lauf(["--evidence", "simulated", "--now", NOW]);
  assert.doesNotMatch(aus, /URTEIL: CLOSED_STATE/);
  assert.match(aus, /Entscheidung selbst ist eine andere/);
});

test("LC2 · Die gewaehlte Entscheidung selbst aendert sich", () => {
  /* Die staerkste Form. Alles Schwaechere — mehr Datenpunkte, eine neue
     Versionsnummer — koennte ein Buchhaltungseffekt sein. */
  const aus = lauf(["--evidence", "simulated", "--now", NOW]);
  assert.match(aus, /gewaehlte Formate.*<-- anders/);
});

test("LC3 · Ohne Evidenz entscheidet der Zyklus unveraendert", () => {
  /* Die Gegenprobe. Ohne sie wuerde LC2 auch dann bestehen, wenn die
     Entscheidung aus einem beliebigen anderen Grund schwankte. */
  const a = platz("leer-a"), b = platz("leer-b");
  try {
    const r1 = zyklus(a, join(a, "out"));
    const r2 = zyklus(b, join(b, "out"));
    assert.deepEqual(r1.shadowDecisions.map((d) => d.archetype),
                     r2.shadowDecisions.map((d) => d.archetype));
  } finally {
    rmSync(join(ROOT, a), { recursive: true, force: true });
    rmSync(join(ROOT, b), { recursive: true, force: true });
  }
});

test("LC4 · Gemessene Leistung erreicht das Formatwissen", () => {
  const p = platz("wissen");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: eintraege([["DATA_STORY", [80, 82, 78, 84, 79, 81, 83, 77]]])
    }));
    const r = zyklus(p, join(p, "out"));
    assert.equal(r.learning.archetypeKnowledge.DATA_STORY.sampleSize, 8);
    assert.ok(r.learning.archetypeKnowledge.DATA_STORY.mean > 0);
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC5 · Ungemessene Beitraege verwaessern das Wissen nicht", () => {
  /* Ein Beitrag ohne Zahlen ist eine Leerstelle, kein schlechtes
     Ergebnis. Wer ihn als 0 mitzaehlt, erzeugt genau die Sorte Zahl,
     die spaeter als Beleg zitiert wird. */
  const p = platz("leerstelle");
  try {
    const mit = eintraege([["DATA_STORY", [80, 82, 78, 84, 79, 81, 83, 77]]]);
    const ohne = Array.from({ length: 20 }, (_, i) => ({
      publicationId: "leer_" + i, packageId: "leerk_" + i, publishedAt: NOW,
      platform: "instagram", topic: "T", entities: [], archetype: "DATA_STORY",
      visualType: "STATIC_IMAGE", hook: "H", caption: "", cta: null, performance: null
    }));
    writeFileSync(join(ROOT, p, "content-memory.json"),
      JSON.stringify({ generatedAt: NOW, entries: mit.concat(ohne) }));
    const r = zyklus(p, join(p, "out"));
    assert.equal(r.learning.archetypeKnowledge.DATA_STORY.sampleSize, 8,
      "nur die 8 gemessenen zaehlen");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC6 · Duenne Evidenz aendert die Strategie NICHT", () => {
  /* Der wichtigste Test der Datei. Ein System, das aus n=2 eine
     Strategie ableitet, lernt nicht — es reagiert auf Rauschen. */
  const p = platz("duenn");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: eintraege([["DATA_STORY", [95, 93]], ["EXPLAIN_THE_MOVE", [12, 14]]])
    }));
    const r = zyklus(p, join(p, "out"));
    assert.equal(r.learning.strategyChanged, false);
    assert.equal(r.learning.strategyAfter, "strategy_initial");
    assert.ok(r.learning.observations.every((o) => o.sufficient === false));
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC7 · Schatten-Entscheidungen veroeffentlichen nichts", () => {
  const p = platz("schatten");
  try {
    const r = zyklus(p, join(p, "out"));
    assert.ok(r.shadowDecisions.length > 0, "es wird entschieden");
    for (const d of r.shadowDecisions) {
      assert.equal(d.published, false);
      assert.equal(d.wouldPublish, true);
      assert.match(d.withheldBecause, /Shadow|AUTOPUBLISH/);
    }
    assert.equal(r.published.length, 0);
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC8 · Die Strategiekette ueberlebt den Lauf", () => {
  /* Ohne Persistenz beginnt der naechste Lauf wieder von vorn, und der
     Kreislauf waere eine Schleife. */
  const p = platz("kette");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW,
      entries: eintraege([["DATA_STORY", [80, 82, 78, 84, 79, 81, 83, 77]],
                          ["EXPLAIN_THE_MOVE", [41, 38, 45, 36, 43, 40, 39, 44]]])
    }));
    const aus = join(p, "out");
    const r = zyklus(p, aus);
    assert.equal(r.learning.strategyChanged, true);

    const kette = JSON.parse(readFileSync(join(ROOT, aus, "strategy-memory.json"), "utf8"));
    assert.ok(kette.versions.length >= 2);
    assert.equal(kette.versions[0].versionId, "strategy_initial");
    assert.equal(kette.currentVersionId, r.learning.strategyAfter);
    assert.ok(kette.observations.length > 0, "die Belege bleiben bei der Version");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC9 · Ueber Regimegrenzen hinweg wird NICHT verglichen", () => {
  /* Ein Score aus BOOTSTRAP und einer aus MATURE messen verschiedene
     Dinge — sie entstehen aus verschiedenen Dimensionen. In einem
     gemeinsamen Mittelwert saehe der Regimewechsel wie eine
     Verbesserung aus, und die Strategie wuerde einer Umstellung des
     Massstabs hinterherlaufen. */
  const p = platz("regime");
  try {
    const alt = eintraege([["DATA_STORY", [20, 22, 18, 24, 19, 21, 23, 17]]])
      .map((e) => Object.assign(e, { performanceRegime: "MATURE" }));
    const neu = eintraege([["DATA_STORY", [80, 82, 78, 84, 79, 81, 83, 77]]])
      .map((e, i) => Object.assign(e, {
        publicationId: "neu_" + i, packageId: "neuk_" + i,
        performanceRegime: "BOOTSTRAP"
      }));
    writeFileSync(join(ROOT, p, "content-memory.json"),
      JSON.stringify({ generatedAt: NOW, entries: alt.concat(neu) }));

    const r = zyklus(p, join(p, "out"));
    /* Ohne Leistungsdatei gibt es kein aktives Regime aus der Messung;
       der Zyklus faellt auf BOOTSTRAP zurueck und laesst die
       MATURE-Eintraege draussen. */
    assert.equal(r.learning.evidenceRegime, "BOOTSTRAP");
    assert.equal(r.learning.crossRegimeExcluded, 8,
      "die acht MATURE-Eintraege bleiben draussen");
    assert.equal(r.learning.dataPoints, 8, "nur die aus dem aktiven Regime zaehlen");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC10 · Das Evidenzregime steht in der Strategie-Kette", () => {
  /* Eine Strategie, deren Massstab unbekannt ist, ist nicht
     nachvollziehbar — nur alt. */
  const p = platz("regimekette");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: eintraege([["DATA_STORY", [80, 82, 78, 84, 79, 81, 83, 77]]])
    }));
    const aus = join(p, "out");
    zyklus(p, aus);

    const kette = JSON.parse(readFileSync(join(ROOT, aus, "strategy-memory.json"), "utf8"));
    assert.ok(kette.evidenceRegimes.length >= 1, "die Regime-Kette existiert");
    const r = kette.evidenceRegimes[0];
    assert.ok(r.evidenceRegime);
    assert.ok(r.transitionReason, "jeder Eintrag nennt seinen Uebergangsgrund");
    assert.ok(r.assessedAt);
    /* Getrennt von der Versionskette: ein Regimewechsel aendert den
       Massstab, nicht die Absicht. */
    assert.ok(Array.isArray(kette.versions));
    assert.notEqual(kette.evidenceRegimes, kette.versions);
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

/* =========================================================================
   LC11–LC14 — DIE ZEIT ALS ENTSCHEIDUNGSDIMENSION

   `Strategy.selectTiming` konnte gemessene Stunden schon immer
   verarbeiten. Uebergeben wurde ihr `null`. Der Rueckweg auf dieser
   Dimension war also nicht zu duenn belegt — er war nicht angeschlossen,
   und keine Messung haette daran je etwas geaendert.

   Die Stunde ist dabei die einzige Eigenschaft fremder Bestandsbeitraege,
   die ohne Uebersetzung sowohl gemessen als auch entschieden wird:
   Instagram meldet den Zeitstempel, die Strategie waehlt eine Stunde.
   ========================================================================= */

/** Eintraege zu einer festen Stunde, mit gemessener Leistung. */
const zurStunde = (stundeUtc, werte) => werte.map((wert, i) => ({
  publicationId: `t_${stundeUtc}_${i}`, packageId: `tk_${stundeUtc}_${i}`,
  publishedAt: `2026-09-1${(i % 8) + 1}T${String(stundeUtc).padStart(2, "0")}:30:00Z`,
  platform: "instagram", topic: "T", entities: [],
  archetype: null, visualType: null, mediaFormat: "REEL",
  hook: "H", caption: "", cta: null,
  performance: wert,
  performanceProvenance: { source: "SIMULATED" }
}));

test("LC11 · Gemessene Stunden erreichen die Zeitentscheidung", () => {
  const p = platz("zeit-gemessen");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: zurStunde(7, [80, 82, 78, 84, 79, 81])
    }));
    const r = zyklus(p, join(p, "out"));

    assert.ok(r.learning.timingKnowledge, "das Zeitwissen steht im Bericht");
    assert.equal(r.learning.timingKnowledge["7"].sampleSize, 6);

    const d = (r.shadowDecisions || [])[0];
    assert.ok(d, "es gibt eine Schatten-Entscheidung");
    assert.equal(d.timingSource, "gemessen",
      "die Stunde stammt aus der Messung, nicht aus dem Startwert");
    assert.equal(d.plannedHourUtc, 7);
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC12 · Unter der Mindeststichprobe entscheidet die Messung NICHT", () => {
  /* Der heutige Fall: 16 Beitraege ueber acht Stunden, groesste
     Stichprobe n=4. Das Wissen ist da und steht im Bericht — es traegt
     nur noch keine Entscheidung. Eine Schwelle, die hier nachgibt,
     macht aus vier Beitraegen eine Uhrzeitempfehlung. */
  const p = platz("zeit-zu-duenn");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: [...zurStunde(7, [80, 82, 78, 84]), ...zurStunde(9, [40, 42])]
    }));
    const r = zyklus(p, join(p, "out"));

    assert.equal(r.learning.timingKnowledge["7"].sampleSize, 4,
      "gemessen ist es — das steht im Bericht");
    const d = (r.shadowDecisions || [])[0];
    assert.notEqual(d.timingSource, "gemessen",
      "entschieden hat es nicht: n=4 liegt unter minimumSampleForExploit");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC13 · Ohne Zeitstempel oder ohne Leistung entsteht kein Zeitwissen", () => {
  /* Eine Stunde ohne gemessene Leistung ist keine Beobachtung ueber
     Stunden, sondern nur ein Datum. */
  const p = platz("zeit-ohne");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: zurStunde(7, [80, 82, 78, 84, 79, 81])
        .map((e) => Object.assign({}, e, { performance: null }))
    }));
    const r = zyklus(p, join(p, "out"));
    assert.equal(r.learning.timingKnowledge, null,
      "ungemessene Beitraege ergeben kein Zeitwissen");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC14 · Das Plattformformat steht nicht im visualType", () => {
  /* `visualType` ist unser Vokabular fuer die gestalterische
     Entscheidung; REEL steht dort gar nicht drin. Die Kohorte dort
     abzulegen erzeugte Beobachtungen ueber eine Dimension, die etwas
     anderes bedeutet als ihr Name — und CAROUSEL haette sich dabei
     stillschweigend mit unserem CAROUSEL vermischt. */
  const p = platz("format-getrennt");
  try {
    writeFileSync(join(ROOT, p, "content-memory.json"), JSON.stringify({
      generatedAt: NOW, entries: zurStunde(7, [80, 82, 78, 84, 79, 81])
    }));
    const r = zyklus(p, join(p, "out"));

    const dimensionen = (r.learning.observations || []).map((o) => o.dimension);
    assert.ok(dimensionen.includes("mediaFormat"),
      "ueber das Plattformformat wird beobachtet");
    assert.ok(!dimensionen.includes("visualType"),
      "und nicht ueber den visualType, den niemand entschieden hat");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC15 · Die Schatten-Entscheidung sagt, ob der Beitrag sendbar waere", () => {
  /* Eine Entscheidung, die sagt "ich wuerde X um T senden", behauptet
     damit, dass X sendbar WAERE. Ohne Bild gibt es keine erreichbare
     JPEG-Adresse und damit keine Veroeffentlichung — das faellt sonst
     erst auf, wenn der Anspruch schon angemeldet ist. */
  const p = platz("fracht");
  try {
    const r = zyklus(p, join(p, "out"));
    assert.ok(r.shadowDecisions.length > 0, "es gibt Entscheidungen");
    for (const d of r.shadowDecisions) {
      assert.ok(d.asset, "jede Entscheidung sagt etwas ueber ihre Fracht");
      assert.equal(typeof d.asset.plannable, "boolean");
      assert.equal(d.asset.rendered, false, "ohne --render wird nichts gezeichnet");
      if (d.asset.plannable) {
        assert.match(d.asset.imageUrl, /^https:\/\/[^/]+\/assets\/social\/pkg_[a-z0-9]+\.jpg$/,
          "die Adresse traegt die Paketkennung — wie Datei und Anspruch auch");
      } else {
        assert.ok(d.asset.reason, "und wenn nicht, steht der Grund da");
      }
    }
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});

test("LC16 · Ein Trockenlauf schreibt keine Bilddateien", () => {
  /* Ein Trockenlauf, der Binaerdateien ins Repository schreibt, ist kein
     Trockenlauf. */
  const p = platz("kein-bild");
  const bilder = join(ROOT, p, "bilder");
  try {
    zyklus(p, join(p, "out"));
    assert.ok(!existsSync(bilder), "ohne --render entsteht kein Bildordner");
  } finally { rmSync(join(ROOT, p), { recursive: true, force: true }); }
});
