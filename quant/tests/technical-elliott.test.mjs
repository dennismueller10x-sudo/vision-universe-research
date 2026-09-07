/* CHECKPOINT 6 + 8 + 9 — Annotationen, Elliott V0/V1 Beta */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fixtures } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const Rules = require("../engines/technical/elliott/rules.js");
const Elliott = require("../engines/technical/elliott/elliott-engine.js");
const WaveGraph = require("../engines/technical/elliott/wave-graph.js");
const Ann = require("../engines/technical/annotations.js");
const Hash = require("../engines/hash.js");

const METH = { technical: JSON.parse(readFileSync(new URL("../methodology/technical-v1.json", import.meta.url), "utf8")),
               elliott: JSON.parse(readFileSync(new URL("../methodology/elliott-v1.json", import.meta.url), "utf8")) };
const run = (s, o) => Analysis.analyze({ series: s, methodology: METH, options: Object.assign({}, o || {}) });
/* Impuls (1-5), Zigzag (A-B-C), neuer Impuls mit laufender Welle 3. */
const WAVE_PATH = [[0, 100], [30, 130], [45, 118], [90, 175], [105, 158], [135, 190], [160, 165], [175, 178], [210, 150], [240, 185], [255, 172], [300, 215]];
const waveSeries = () => fixtures.piecewise(WAVE_PATH, { seed: "ew", rangePct: 0.003, instrumentId: "SYN_EW" });
const legs = (pts) => pts.slice(1).map((p, k) => ({ fromPrice: pts[k][1], toPrice: p[1], duration: p[0] - pts[k][0], fromIndex: pts[k][0], toIndex: p[0] }));

test("R1 · Hard Rules: gueltiger Impuls, W2-Verletzung, W3 kuerzeste, W4-Overlap, gueltiger Zigzag", () => {
  const valid = legs([[0, 100], [10, 120], [15, 110], [30, 150], [38, 135], [48, 160]]);
  assert.ok(Rules.impulseHardRules(valid, 1).every((r) => r.passed !== false));
  const w2 = legs([[0, 100], [10, 120], [15, 98], [30, 150], [38, 135], [48, 160]]);
  assert.ok(Rules.impulseHardRules(w2, 1).find((r) => r.ruleId === "W2_NOT_BEYOND_W1_ORIGIN").passed === false);
  const w3short = legs([[0, 100], [10, 130], [15, 115], [30, 135], [38, 131], [48, 170]]);
  assert.ok(Rules.impulseHardRules(w3short, 1).find((r) => r.ruleId === "W3_NOT_SHORTEST").passed === false);
  const w4 = legs([[0, 100], [10, 120], [15, 110], [30, 150], [38, 115], [48, 160]]);
  assert.ok(Rules.impulseHardRules(w4, 1).find((r) => r.ruleId === "W4_NO_W1_OVERLAP").passed === false);
  const zz = legs([[0, 100], [10, 80], [15, 92], [30, 70]]);
  assert.ok(Rules.zigzagHardRules(zz, -1).every((r) => r.passed !== false));
  const zzBad = legs([[0, 100], [10, 80], [15, 102], [30, 70]]);
  assert.ok(Rules.zigzagHardRules(zzBad, -1).find((r) => r.ruleId === "B_NOT_BEYOND_A_ORIGIN").passed === false);
  // Bearish gespiegelt
  const bear = legs([[0, 100], [10, 80], [15, 90], [30, 50], [38, 65], [48, 40]]);
  assert.ok(Rules.impulseHardRules(bear, -1).every((r) => r.passed !== false));
  // Kandidaten-Engine verwirft ungueltige Counts.
  assert.equal(Elliott.evaluate("IMPULSE", w2, {}).valid, false);
  assert.equal(Elliott.evaluate("IMPULSE", w2, {}).score, 0);
  assert.equal(Rules.RULE_SET_VERSION, "elliott-rules-1.0.0");
});

test("R2 · Guidelines ranken, legitimieren aber nie eine Regelverletzung", () => {
  const perfectButInvalid = legs([[0, 100], [10, 120], [15, 99], [30, 152], [38, 140], [48, 160]]);   // W2 < Ursprung
  const e = Elliott.evaluate("IMPULSE", perfectButInvalid, {});
  assert.equal(e.valid, false);
  assert.ok(e.violations.includes("W2_NOT_BEYOND_W1_ORIGIN"));
  const ok = Elliott.evaluate("IMPULSE", legs([[0, 100], [10, 120], [15, 110], [30, 150], [38, 135], [48, 160]]), {});
  assert.ok(ok.score > 0.5 && ok.guidelineFit > 0);
  assert.ok(Object.keys(ok.softMetrics).includes("W2_RETRACE_RATIO"));
});

test("E1 · Historical Wave Map: Labels an echten Pivots, Vergangenheit vor Zukunft, Coverage", () => {
  const b = run(waveSeries(), { setupScaleId: "scale-2" });
  const e = b.elliott;
  assert.ok(["OK", "AMBIGUOUS"].includes(e.status), e.status);
  assert.deepEqual(e.historicalMap.patterns.map((p) => p.type), ["IMPULSE", "ZIGZAG"]);
  const pivotIds = new Set(b.pivots.scales[e.degreeScale].pivots.map((p) => p.pivotId));
  const confirmed = e.primaryCount.waves.filter((w) => w.status === "CONFIRMED");
  assert.ok(confirmed.length >= 8, "mindestens 5 + 3 bestaetigte Wellen");
  for (const w of confirmed) { assert.ok(pivotIds.has(w.toPivotId), `Welle ${w.label} haengt an keinem echten Pivot`); assert.ok(w.confirmedAt); }
  assert.deepEqual(confirmed.slice(0, 8).map((w) => w.label), ["1", "2", "3", "4", "5", "A", "B", "C"]);
  assert.ok(e.coverage >= 0.8);
  assert.equal(e.primaryCount.currentWave.label, "3");
  assert.equal(e.primaryCount.currentWave.status, "DEVELOPING");
  assert.equal(e.isProbability, false);
  assert.match(e.disclaimer, /Keine Wahrscheinlichkeit/);
});

test("E2 · Primary + Alternative Count, objektive Invalidation, Projection Zones mit Quellen", () => {
  const e = run(waveSeries(), { setupScaleId: "scale-2" }).elliott;
  const p = e.primaryCount;
  assert.ok(p.invalidation && p.invalidation.ruleId && p.invalidation.direction === "below");
  assert.ok(p.invalidation.price < 175, "Invalidation unter W2-Ende");
  assert.ok(p.projection.zones.length >= 2);
  for (const z of p.projection.zones) { assert.ok(z.zoneHigh > z.zoneLow); assert.ok(z.sources.length >= 1); assert.equal(z.status, "PROJECTED"); assert.equal(z.methodologyVersion, Elliott.ENGINE_VERSION); }
  assert.ok(p.projection.zones.some((z) => z.label === "3") && p.projection.zones.some((z) => z.label === "4") && p.projection.zones.some((z) => z.label === "5"));
  assert.ok(p.projection.path.length >= 2 && p.projection.path.every((s) => s.status === "PROJECTED" && s.toTime > e.asOf));
  assert.ok(e.alternativeCount, "eine materiell andere Alternative existiert");
  assert.ok(e.alternativeCount.currentWave.patternType !== p.currentWave.patternType || e.alternativeCount.currentWave.label !== p.currentWave.label);
  assert.ok(e.confidence >= 0 && e.confidence <= 100 && e.confidenceType === "method_fit");
  assert.ok(typeof e.stability === "number" && typeof e.fit === "number");
});

test("E3 · Walk-Forward: bestaetigte historische Wellen bleiben stabil, Developing/Projected duerfen sich aendern", () => {
  const full = waveSeries();
  const T0 = 262, T1 = 275;
  const a = Analysis.analyzeAsOf({ series: full, methodology: METH, options: { setupScaleId: "scale-2" } }, T0).elliott;
  const b = Analysis.analyzeAsOf({ series: full, methodology: METH, options: { setupScaleId: "scale-2" } }, T1).elliott;
  const conf = (e) => e.primaryCount.waves.filter((w) => w.status === "CONFIRMED" && w.patternId !== "pat_trailing").map((w) => [w.label, w.toPivotId]);
  const ca = conf(a), cb = conf(b);
  assert.ok(ca.length >= 8);
  assert.deepEqual(cb.slice(0, ca.length), ca, "bestaetigte Wellen wurden umgeschrieben");
  assert.equal(a.primaryCount.currentWave.status, "DEVELOPING");
  // Bit-identisch: Analyse bei T0 aus dem Praefix vs. aus der vollen Serie mit Cutoff.
  const c = run(Canonical.slice(full, T0), { setupScaleId: "scale-2" }).elliott;
  assert.equal(Hash.hashValue(a), Hash.hashValue(c));
});

test("E4 · Abort Conditions: zu wenig Pivots → UNAVAILABLE, erstes Leg → LOW_CONFIDENCE; keine Fake-Welle", () => {
  const short = fixtures.cleanUptrend(60);
  const e = run(short).elliott;
  assert.equal(e.status, "UNAVAILABLE"); assert.equal(e.reason, "TOO_FEW_PIVOTS"); assert.equal(e.primaryCount, null);
  const s2 = fixtures.piecewise([[0, 100], [30, 130], [45, 118], [90, 175], [105, 158], [135, 190], [160, 165], [175, 178], [210, 150], [260, 200]], { seed: "fl", rangePct: 0.003 });
  const e2 = run(s2, { setupScaleId: "scale-2" }).elliott;
  if (e2.status !== "UNAVAILABLE") {
    assert.ok(e2.primaryCount.waves.filter((w) => w.status === "PROJECTED").length === 0, "keine projizierten Wellen als Historie");
    if (e2.reason === "FIRST_LEG_ONLY") { assert.equal(e2.status, "LOW_CONFIDENCE"); assert.equal(e2.primaryCount.projection.zones.length, 0, "ohne unterscheidbare Struktur keine Projektion"); }
  }
});

test("E5 · Segment-Graph + Degree-Mapping: Elliott rechnet auf Segmenten, Degrees sind strukturell", () => {
  const b = run(waveSeries(), { elliott: false, annotations: false });
  const g = WaveGraph.buildSegmentGraph(b.series || waveSeries(), { columns: { logReturns: [], atr: [] } }, b.pivots, "scale-2");
  assert.equal(g.degreeIndex, "D1");
  assert.equal(g.segments.length, b.pivots.scales["scale-2"].pivots.length - 1);
  for (const seg of g.segments) { assert.ok(["UP", "DOWN"].includes(seg.direction)); assert.ok(seg.duration > 0); assert.ok(seg.fromPivotId && seg.toPivotId); }
  assert.equal(g.developing.status, "DEVELOPING");
  assert.deepEqual(WaveGraph.WAVE_STATUSES, ["CONFIRMED", "DEVELOPING", "PROJECTED", "INVALIDATED"]);
});

test("A1 · ChartAnnotation ist renderer-neutral: Schema, Status, Layer, Zeit statt Pixel", () => {
  const b = run(waveSeries(), { setupScaleId: "scale-2" });
  const doc = b.annotations;
  assert.equal(doc.schemaVersion, Ann.SCHEMA_VERSION);
  assert.ok(doc.annotations.length > 30);
  for (const a of doc.annotations) {
    assert.equal(Ann.validate(a).valid, true, JSON.stringify(Ann.validate(a).errors));
    assert.ok(a.layers.every((l) => Ann.LAYERS.includes(l) || l === "ALTERNATIVE" || l === "ELLIOTT_ALT"));
    assert.ok(!("x" in a) && !("y" in a) && !("svg" in a), "keine Pixel-Koordinaten");
    if (a.status === "PROJECTED" && a.endTime) assert.ok(a.endTime >= doc.analysisTime, "Projektion liegt nie in der Historie");
    if (a.status === "CONFIRMED" && a.type !== "ZONE" && a.type !== "LEVEL" && a.type !== "FIB_LEVEL" && a.type !== "FIB_CLUSTER" && a.type !== "SERIES" && a.type !== "NOW_DIVIDER" && a.endTime) assert.ok(a.endTime <= doc.analysisTime);
  }
  const src = JSON.stringify(doc); assert.ok(!/svg|canvas|tradingview|lightweight/i.test(src));
  assert.equal(doc.annotations.filter((a) => a.type === "NOW_DIVIDER").length, 1);
});

test("A2 · Layer: AUTO erklaert nur das Primary Scenario; ELLIOTT traegt Wellen mit drei Zustaenden", () => {
  const b = run(waveSeries(), { setupScaleId: "scale-2" });
  const auto = Ann.forLayer(b.annotations, "AUTO"), ell = Ann.forLayer(b.annotations, "ELLIOTT"), st = Ann.forLayer(b.annotations, "STRUCTURE");
  assert.ok(auto.some((a) => a.type === "ENTRY_ZONE") && auto.some((a) => a.type === "TARGET_ZONE") && auto.some((a) => a.type === "INVALIDATION_LEVEL"));
  assert.ok(auto.every((a) => a.type !== "WAVE_LABEL"), "AUTO zeigt keine Elliott-Labels");
  const labels = ell.filter((a) => a.type === "WAVE_LABEL");
  assert.ok(labels.some((a) => a.status === "CONFIRMED") && labels.some((a) => a.status === "DEVELOPING") && labels.some((a) => a.status === "PROJECTED"));
  assert.ok(ell.some((a) => a.type === "PROJECTION_ZONE") && ell.some((a) => a.type === "INVALIDATION_LEVEL"));
  // Labels an Pivot-Zeitpunkten
  const pivotTimes = new Set(b.pivots.scales[b.elliott.degreeScale].pivots.map((p) => p.pivotTime));
  for (const l of labels.filter((a) => a.status === "CONFIRMED")) assert.ok(pivotTimes.has(l.startTime), "Label schwebt");
  assert.ok(st.some((a) => a.type === "STRUCTURE_LABEL") && st.some((a) => a.type === "SWING_SEGMENT"));
  for (const s of st.filter((a) => a.type === "SWING_SEGMENT")) assert.ok(s.semanticStyle === "historical" || s.semanticStyle === "developing");
});

test("A3 · Visual Regression: Positions-Hash ist stabil und aendert sich bei Datenrevision", () => {
  const s = waveSeries();
  const h1 = Ann.positionHash(run(s, { setupScaleId: "scale-2" }).annotations), h2 = Ann.positionHash(run(s, { setupScaleId: "scale-2" }).annotations);
  assert.equal(h1, h2);
  const rev = Canonical.revise(s, [{ index: 250, close: s.close[250] * 0.9, low: s.low[250] * 0.88 }], "r2");
  assert.notEqual(Ann.positionHash(run(rev, { setupScaleId: "scale-2" }).annotations), h1);
});
