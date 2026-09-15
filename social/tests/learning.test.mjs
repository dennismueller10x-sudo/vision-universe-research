/* =========================================================================
   VU SOCIAL — ANALYTICS, PERFORMANCE, LERNEN, EXPERIMENTE
   (§17, §19, §20, §21, §26, §51,
    §43 "Analytics normalization", "Learning updates", "Strategy rollback")

   Zwei Tests tragen diese Datei:

   L8  Ein markenschaedlicher Beitrag mit grosser Reichweite ist KEIN
       Erfolg. Ohne diese Sperre laeuft ein lernendes System auf Empoerung
       zu — nicht aus Boshaftigkeit, sondern arithmetisch.

   L14 Die Learning Engine kann die Faktenpruefung nicht abschalten, auch
       wenn die Daten es nahelegen. §51 ist hier Code und kein Vorsatz.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Analytics = require("../engines/analytics.js");
const Performance = require("../engines/performance.js");
const Learning = require("../engines/learning.js");
const Experiments = require("../engines/experiments.js");
const Schema = require("../engines/schema.js");

const NOW = "2026-09-15T12:00:00Z";

/* ---------------------------------------------------------- Analytics */

test("L1 · Was die Plattform nicht meldet, bleibt null", () => {
  const res = Analytics.normalize("meta", { impressions: 5000, reach: 4000 });
  assert.equal(res.metrics.impressions, 5000);
  assert.equal(res.metrics.saves, null);
  assert.notEqual(res.metrics.saves, 0,
    "Eine 0 waere die Aussage 'niemand hat gespeichert' — die hat niemand gemessen");
  assert.ok(res.coverage.missing.includes("saves"));
});

test("L2 · Die Originalkennzahlen bleiben erhalten", () => {
  const raw = { impressions: 5000, like_count: 200, saved: 80 };
  const res = Analytics.normalize("meta", raw);
  assert.deepEqual(res.providerMetrics, raw);
  assert.equal(res.metrics.likes, 200);
  assert.equal(res.metrics.saves, 80);
});

test("L3 · Ein unbekanntes Feld ist ein Befund, kein Muell", () => {
  const res = Analytics.normalize("meta", { impressions: 100, brandneues_feld: 7 });
  assert.deepEqual(res.unknownFields, ["brandneues_feld"]);
  assert.equal(res.schemaChangeSuspected, true,
    "Ein Schemawechsel der Plattform muss auffallen, nicht monatelang durchlaufen");

  /* Bekannte, bewusst nicht-kanonische Felder sind kein Befund. */
  const clean = Analytics.normalize("meta", { impressions: 100, total_interactions: 50, id: "x" });
  assert.deepEqual(clean.unknownFields, []);
});

test("L4 · Die Interaktionsrate wird gerechnet und nennt ihren Nenner", () => {
  const res = Analytics.normalize("meta",
    { reach: 1000, like_count: 50, comments_count: 10, saved: 20, shares: 20 });
  assert.equal(res.metrics.engagementRate, 0.1);
  assert.equal(res.engagementBasis.base, "reach");
  assert.deepEqual(res.engagementBasis.missingMetrics, []);

  /* Fehlt ein Bestandteil, steht das dabei — eine Rate aus drei von vier
     Teilen sieht sonst aus wie eine aus vier. */
  const partial = Analytics.normalize("meta", { reach: 1000, like_count: 50 });
  assert.ok(partial.engagementBasis.missingMetrics.includes("saves"));
});

test("L5 · Ein Schnappschuss kennt sein Alter und seinen Zustand", () => {
  const fresh = Analytics.snapshot({
    publicationId: "p1", providerId: "meta", capturedAt: "2026-09-15T10:00:00Z",
    providerMetrics: { impressions: 100, reach: 90 }
  }, { now: NOW });
  assert.equal(fresh.state, "VERIFIED");
  assert.ok(fresh.ageHours >= 1.9 && fresh.ageHours <= 2.1);

  const old = Analytics.snapshot({
    publicationId: "p1", providerId: "meta", capturedAt: "2026-09-10T10:00:00Z",
    providerMetrics: { impressions: 100 }
  }, { now: NOW });
  assert.equal(old.state, "STALE");

  const empty = Analytics.snapshot({
    publicationId: "p1", providerId: "meta", capturedAt: NOW, providerMetrics: {}
  }, { now: NOW });
  assert.equal(empty.state, "UNAVAILABLE");
});

test("L6 · Eine Differenz ueber eine fehlende Kennzahl ist null, nicht null Zuwachs", () => {
  const a = Analytics.snapshot({ publicationId: "p", providerId: "meta", capturedAt: NOW,
    providerMetrics: { impressions: 100, saved: 5 } }, { now: NOW });
  const b = Analytics.snapshot({ publicationId: "p", providerId: "meta", capturedAt: NOW,
    providerMetrics: { impressions: 180 } }, { now: NOW });
  const d = Analytics.delta(a, b);
  assert.equal(d.impressions, 80);
  assert.equal(d.saves, null);
});

/* -------------------------------------------------------- Performance */

function baselineOf(n = 8) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ metrics: { reach: 3000 + i * 50, impressions: 4000, likes: 150, comments: 20,
                           shares: 25, saves: 50, engagementRate: 0.06, followersGained: 8,
                           completionRate: null } });
  }
  return Performance.buildBaseline(rows);
}

test("L7 · Ohne Vergleichsbasis gibt es keinen Performance Score", () => {
  const thin = Performance.buildBaseline([{ metrics: { reach: 1000 } }]);
  assert.equal(thin.sufficient, false);
  const res = Performance.score({ metrics: { reach: 5000 } }, thin, {});
  assert.equal(res.available, false);
  assert.equal(res.score, null);
  assert.match(res.explanation, /ohne Basis waere eine Behauptung/);
});

test("L8 · Grosse Reichweite bei negativer Reaktion ist KEIN Erfolg", () => {
  const baseline = baselineOf();
  const metrics = { reach: 40000, impressions: 60000, likes: 3000, comments: 900,
                    shares: 900, saves: 900, engagementRate: 0.14, followersGained: 60,
                    completionRate: null, views: null, watchTimeSeconds: null,
                    clicks: null, profileVisits: null };

  const positive = Performance.score({ metrics }, baseline,
    { brandFitScore: 0.9, qualityScore: 0.8, sentiment: 0.8, strategicValue: 0.6 });
  const outrage = Performance.score({ metrics }, baseline,
    { brandFitScore: 0.9, qualityScore: 0.8, sentiment: 0.1, strategicValue: 0.6 });

  assert.ok(positive.score > 70);
  assert.ok(outrage.score <= 30, "Der Deckel muss greifen, nicht nur mindern");
  assert.ok(outrage.rawScore > outrage.score);
  assert.equal(outrage.capped.dimension, "sentiment");
  assert.match(outrage.explanation, /Aufmerksamkeit ist hier kein Erfolg/);
});

test("L9 · Ein markenfremder Beitrag wird ebenfalls gedeckelt", () => {
  const res = Performance.score({ metrics: { reach: 30000, impressions: 40000, likes: 2000,
    comments: 300, shares: 400, saves: 500, engagementRate: 0.11, followersGained: 40 } },
    baselineOf(), { brandFitScore: 0.2, qualityScore: 0.8, sentiment: 0.8, strategicValue: 0.6 });
  assert.equal(res.capped.dimension, "brandFit");
  assert.ok(res.score <= 35);
});

test("L10 · Saves und Shares wiegen mehr als Likes", () => {
  const w = Performance.DEFAULT_METHODOLOGY.weights;
  assert.ok(w.saves > w.engagement);
  assert.ok(w.shares > w.engagement);
  assert.ok(w.saves >= w.reach);
});

test("L11 · Ein einzelner viraler Ausreisser dominiert nicht", () => {
  const baseline = baselineOf();
  const context = { brandFitScore: 0.9, qualityScore: 0.8, sentiment: 0.8, strategicValue: 0.6 };
  const normal = Performance.score({ metrics: { reach: 3200, impressions: 4000, likes: 150,
    comments: 20, shares: 25, saves: 50, engagementRate: 0.06, followersGained: 8 } }, baseline, context);
  const viral = Performance.score({ metrics: { reach: 320000, impressions: 400000, likes: 15000,
    comments: 2000, shares: 2500, saves: 5000, engagementRate: 0.08, followersGained: 800 } },
    baseline, context);
  assert.ok(viral.score > normal.score);
  /* Hundertfache Reichweite ergibt nicht den hundertfachen Score. */
  assert.ok(viral.score < 100);
  assert.ok(viral.score - normal.score < 45);
});

/* ------------------------------------------------------------ Lernen */

function records(value, base, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ value, performanceScore: base + ((i * 7) % 9) });
  return out;
}

test("L12 · Eine kleine Stichprobe ergibt keine Lernaussage", () => {
  const obs = Learning.observe("archetype", [
    { value: "A", performanceScore: 95 }, { value: "A", performanceScore: 93 },
    { value: "B", performanceScore: 40 }, { value: "B", performanceScore: 42 }
  ], { now: NOW });
  for (const o of obs) {
    assert.equal(o.sufficient, false);
    assert.match(o.note, /Anekdote/);
  }
});

test("L13 · Ein Intervall, das die Null enthaelt, ist kein Ergebnis", () => {
  /* Zwei Gruppen mit demselben Mittelwert und viel Streuung. */
  const noisy = [];
  for (let i = 0; i < 12; i++) noisy.push({ value: "A", performanceScore: 50 + ((i * 17) % 40) - 20 });
  for (let i = 0; i < 12; i++) noisy.push({ value: "B", performanceScore: 50 + ((i * 23) % 40) - 20 });
  const obs = Learning.observe("archetype", noisy, { now: NOW });
  for (const o of obs) {
    if (!o.sufficient && o.confidenceInterval) {
      assert.ok(o.confidenceInterval[0] <= 0 && o.confidenceInterval[1] >= 0 ||
                Math.abs(o.effect) < Learning.DEFAULT_OPTIONS.minimumEffect,
        "Entweder enthaelt das Intervall die Null oder der Effekt ist zu klein");
    }
  }
});

test("L14 · INVARIANT: die Learning Engine kann keine Sicherheitsregel abschalten (§51)", () => {
  for (const forbidden of ["killSwitch", "factCheck", "provenanceRequired", "secrets",
                           "tests", "publishingPermissions", "autonomyLevel", "compliance"]) {
    assert.equal(Learning.isMutable(forbidden), false, `${forbidden} darf nicht veraenderbar sein`);
  }
  for (const allowed of ["explorationRate", "archetypeWeights", "timingWindows", "contentMix"]) {
    assert.equal(Learning.isMutable(allowed), true);
  }

  /* Und der Weg ueber eine gefaelschte, statistisch "belastbare"
     Beobachtung fuehrt ebenfalls nicht hindurch. */
  const forged = [{
    observationId: "o1", dimension: "factCheck", value: "off",
    sampleSize: 500, effect: 0.9, confidenceInterval: [0.8, 1.0], sufficient: true,
    note: "Ohne Faktenpruefung laeuft es besser"
  }];
  const res = Learning.proposeStrategyUpdate({ versionId: "v0", parameters: {} }, forged, { now: NOW });
  assert.equal(res.changed, false);
  assert.equal(res.applied.length, 0);
  assert.ok(res.blocked.length > 0, "Der Versuch muss protokolliert werden, nicht nur scheitern");
});

test("L15 · Eine Aenderung ist begrenzt, versioniert und erklaert", () => {
  const obs = Learning.observe("archetype",
    records("DATA_STORY", 78, 14).concat(records("EDUCATIONAL", 45, 14)), { now: NOW });
  const res = Learning.proposeStrategyUpdate({ versionId: "v0", parameters: {} }, obs, { now: NOW });

  assert.equal(res.changed, true);
  assert.ok(res.version.versionId.startsWith("strat_"));
  assert.equal(res.version.parentVersionId, "v0");
  assert.equal(res.version.reversible, true);
  assert.ok(res.version.rationale.length > 20);
  assert.ok(res.version.observationIds.length > 0);

  for (const change of res.applied) {
    const relative = Math.abs(change.after - change.before) / Math.abs(change.before);
    assert.ok(relative <= Learning.DEFAULT_OPTIONS.maxRelativeChange + 1e-9,
      "Eine einzelne gute Woche darf die Strategie nicht umdrehen");
  }
});

test("L16 · Ein Rollback ist Teil des Normalbetriebs", () => {
  const v0 = Schema.strategyVersion({ versionId: "v0", createdAt: NOW, parameters: {} });
  const v1 = Schema.strategyVersion({ versionId: "v1", createdAt: NOW, parentVersionId: "v0",
    parameters: { explorationRate: 0.3 } });

  const ok = Learning.rollback([v0, v1], "v0");
  assert.equal(ok.ok, true);
  assert.equal(ok.version.versionId, "v0");

  assert.equal(Learning.rollback([v0, v1], "gibtesnicht").ok, false);
  const frozen = Schema.strategyVersion({ versionId: "v2", createdAt: NOW,
    parameters: {}, reversible: false });
  assert.equal(Learning.rollback([frozen], "v2").ok, false);
});

test("L17 · Die Explorationsrate bleibt in ihren Grenzen", () => {
  const bounds = Learning.PARAMETER_BOUNDS.explorationRate;
  assert.ok(bounds.min > 0, "Eine Rate von 0 waere das Ende des Lernens");
  assert.ok(bounds.max < 1);
});

/* ------------------------------------------------------- Experimente */

test("L18 · Ein Experiment mit zwei Variablen wird abgelehnt", () => {
  const res = Experiments.declare({
    hypothesis: "Frage schlaegt Aussage", variable: "questionVsStatement",
    control: "statement", variant: "question",
    additionalChanges: ["visualType", "postingHour"]
  }, { now: NOW });
  assert.equal(res.ok, false);
  assert.match(res.explanation, /genau eine Variable/);
});

test("L19 · Ein Experiment ohne Hypothese ist eine Variation", () => {
  const res = Experiments.declare({ variable: "hookStyle", control: "a", variant: "b" }, { now: NOW });
  assert.equal(res.ok, false);
  assert.match(res.explanation, /Ohne Hypothese/);
});

test("L20 · Nicht testbare Variablen sind ausgeschlossen", () => {
  const res = Experiments.declare({ hypothesis: "H", variable: "factCheck",
    control: "on", variant: "off" }, { now: NOW });
  assert.equal(res.ok, false);
  assert.match(res.explanation, /nicht testbar/);
});

test("L21 · Vor Erreichen der geplanten Stichprobe gibt es keine Entscheidung", () => {
  const { experiment } = Experiments.declare({
    hypothesis: "Frage schlaegt Aussage", variable: "questionVsStatement",
    control: "statement", variant: "question", plannedSamplePerArm: 8 }, { now: NOW });

  for (let i = 0; i < 8; i++) Experiments.record(experiment, "control", 50 + (i % 5));
  for (let i = 0; i < 7; i++) Experiments.record(experiment, "variant", 70 + (i % 5));

  const early = Experiments.evaluate(experiment);
  assert.equal(early.decided, false);
  assert.match(early.explanation, /bis das Ergebnis gefaellt/);

  /* Ein Blick ist erlaubt, entscheidet aber nichts. */
  const peek = Experiments.evaluate(experiment, { peek: true });
  assert.equal(peek.decided, false);
  assert.match(peek.explanation, /VORLAEUFIG/);
  assert.notEqual(experiment.state, "DECIDED");

  Experiments.record(experiment, "variant", 72);
  const final = Experiments.evaluate(experiment);
  assert.equal(final.decided, true);
  assert.equal(final.decision, "ADOPT_VARIANT");
  assert.equal(experiment.state, "DECIDED");
});

test("L22 · Kein Unterschied ist ein gueltiges Ergebnis", () => {
  const { experiment } = Experiments.declare({
    hypothesis: "H", variable: "ctaStyle", control: "a", variant: "b",
    plannedSamplePerArm: 8 }, { now: NOW });
  for (let i = 0; i < 10; i++) {
    Experiments.record(experiment, "control", 60 + ((i * 13) % 20) - 10);
    Experiments.record(experiment, "variant", 60 + ((i * 17) % 20) - 10);
  }
  const res = Experiments.evaluate(experiment);
  assert.ok(["NO_DIFFERENCE", "NEGLIGIBLE"].includes(res.decision));
  assert.match(res.explanation, /gueltiges Ergebnis|Relevanzschwelle/);
});

test("L23 · Ein Beitrag ohne Performance Score zaehlt nicht mit", () => {
  const { experiment } = Experiments.declare({
    hypothesis: "H", variable: "hookStyle", control: "a", variant: "b",
    plannedSamplePerArm: 8 }, { now: NOW });
  const res = Experiments.record(experiment, "control", null);
  assert.equal(res.ok, false);
  assert.equal(experiment.observations.control.length, 0,
    "Ihn mit 0 zu fuehren waere eine Aussage ueber Daten, die es nicht gibt");
});

test("L24 · Ein Experiment, das seine Stichprobe nie erreicht, laeuft nicht ewig", () => {
  const { experiment } = Experiments.declare({
    hypothesis: "H", variable: "hookStyle", control: "a", variant: "b",
    plannedSamplePerArm: 8 }, { now: NOW });
  assert.equal(Experiments.checkExpiry(experiment, "2026-09-20T00:00:00Z").expired, false);
  const expired = Experiments.checkExpiry(experiment, "2026-12-01T00:00:00Z");
  assert.equal(expired.expired, true);
  assert.match(expired.reason, /wird beendet/);
});
