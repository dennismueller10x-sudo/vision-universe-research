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
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
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
