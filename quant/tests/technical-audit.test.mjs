/* RELEASE AUDIT — Regressionstests fuer behobene Befunde */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fixtures, seriesFromCloses, tradingDays } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const Features = require("../engines/technical/feature-store.js");
const Pivots = require("../engines/technical/pivot-engine.js");
const Fib = require("../engines/technical/fibonacci.js");
const Rules = require("../engines/technical/elliott/rules.js");
const Elliott = require("../engines/technical/elliott/elliott-engine.js");
const Confluence = require("../engines/technical/confluence.js");
const TradeSetup = require("../engines/technical/trade-setup.js");
const Snapshot = require("../engines/technical/snapshot.js");
const Scanner = require("../engines/technical/scanner.js");
const Ann = require("../engines/technical/annotations.js");
const METH = { technical: JSON.parse(readFileSync(new URL("../methodology/technical-v1.json", import.meta.url), "utf8")),
               elliott: JSON.parse(readFileSync(new URL("../methodology/elliott-v1.json", import.meta.url), "utf8")) };
const run = (s, o) => Analysis.analyze({ series: s, methodology: METH, options: Object.assign({ elliott: false, annotations: false }, o || {}) });

test("AU1 · STRUCTURE_FAILURE_BULLISH ist bearische Evidenz und wird bearisch gestylt", () => {
  const b = run(fixtures.confirmedReversal(), { annotations: true });
  const failures = b.structure.events.filter((e) => e.type === "STRUCTURE_FAILURE_BULLISH");
  assert.ok(failures.length >= 1, "Fixture erzeugt einen Structure Failure");
  const p = b.scenarios.primary;
  assert.equal(p.direction, "BEARISH");
  const ids = new Set(failures.map((e) => e.eventId));
  assert.ok(p.supportingEvidence.some((ev) => ids.has(ev.key)), "Failure stuetzt das bearische Szenario");
  assert.ok(!p.conflictingEvidence.some((ev) => ids.has(ev.key)));
  const ann = b.annotations.annotations.filter((a) => a.type === "STRUCTURE_EVENT" && ids.has(a.evidenceRef));
  assert.ok(ann.length && ann.every((a) => a.semanticStyle === "event-bearish"));
});

test("AU2 · Elliott: ein 3-Leg-Zigzag wird erst CONFIRMED, wenn die 5-Leg-Alternative bewertbar ist (kein Repainting)", () => {
  const pts = [[0, 100], [30, 130], [45, 118], [90, 175], [105, 158], [135, 190], [160, 165], [175, 178], [210, 150], [240, 185], [255, 172], [300, 215]];
  const full = fixtures.piecewise(pts, { seed: "ew", rangePct: 0.003, instrumentId: "SYN_EW" });
  let prev = null, rewrites = 0;
  for (let T = 60; T < full.length; T += 2) {
    const e = Analysis.analyzeAsOf({ series: full, methodology: METH, options: { annotations: false, setupScaleId: "scale-2" } }, T).elliott;
    if (e.status === "UNAVAILABLE") continue;
    const conf = e.primaryCount.waves.filter((w) => w.status === "CONFIRMED" && w.patternId !== "pat_trailing").map((w) => w.label + "@" + w.toPivotId);
    if (prev && prev.degree === e.degreeScale) { const now = new Set(conf); if (prev.conf.some((c) => !now.has(c))) rewrites++; }
    prev = { conf, degree: e.degreeScale };
  }
  assert.equal(rewrites, 0);
  // Direkt: 3 Legs allein ergeben kein bestaetigtes Pattern.
  const legs = (p) => p.slice(1).map((x, k) => ({ fromPrice: p[k][1], toPrice: x[1], duration: 10, fromIndex: k * 10, toIndex: k * 10 + 10, status: "CONFIRMED" }));
  assert.equal(Elliott.parseHistory(legs([[0, 100], [1, 130], [2, 118], [3, 175]]), Elliott.DEFAULTS, {}).patterns.length, 0);
  assert.equal(Elliott.parseHistory(legs([[0, 100], [1, 130], [2, 118], [3, 175], [4, 158], [5, 190]]), Elliott.DEFAULTS, {}).patterns.length, 1);
});

test("AU3 · Fibonacci-Pocket traegt die Richtung des Ankers (bearischer Swing → negative Polaritaet)", () => {
  const s = Canonical.slice(fixtures.cleanDowntrend(), 460);
  const f = Features.computeFeatures(s), p = Pivots.runPivots(s, f);
  const fib = Fib.analyzeFibonacci(s, f, p);
  if (fib.inRetracementPocket) {
    const primary = fib.anchors[0];
    assert.equal(Math.sign(fib.value), primary.direction === "UP" ? 1 : -1);
  }
  const up = Fib.analyzeFibonacci(fixtures.cleanUptrend(), Features.computeFeatures(fixtures.cleanUptrend()), Pivots.runPivots(fixtures.cleanUptrend(), Features.computeFeatures(fixtures.cleanUptrend())));
  assert.ok(Math.abs(up.value) <= 0.3);
});

test("AU4 · Bearische Target Zone 2 liegt immer jenseits von Target Zone 1", () => {
  for (const name of ["cleanDowntrend", "confirmedReversal", "highVol"]) {
    const b = run(fixtures[name]());
    const p = b.scenarios.primary;
    if (p.direction !== "BEARISH" || p.targetZones.length < 2) continue;
    assert.ok(p.targetZones[1].zoneHigh < p.targetZones[0].zoneLow, `${name}: T2 ${p.targetZones[1].zoneHigh} muss unter T1 ${p.targetZones[0].zoneLow} liegen`);
  }
  for (const name of ["cleanUptrend", "gap"]) {
    const p = run(fixtures[name]()).scenarios.primary;
    if (p.direction === "BULLISH" && p.targetZones.length >= 2) assert.ok(p.targetZones[1].zoneLow > p.targetZones[0].zoneHigh);
  }
});

test("AU5 · Pivot Engine: das Extrem zwischen Pivot und Bestaetigungsbar geht nicht verloren", () => {
  // Hoch bei Bar 10. Bar 11 faellt 5.0 (Schwelle dort 5.2 → keine Bestaetigung), Bar 12 faellt nur 4.7
  // (Schwelle 4.6 → Bestaetigung). Das tiefere Low von Bar 11 muss der naechste Pivot werden.
  const closes = [100, 100.5, 101, 101.5, 102, 102.5, 103, 103.5, 104, 104.5, 105, 100.0, 100.3, 103, 105, 106, 107, 108, 109, 110];
  const days = tradingDays("2020-01-06", closes.length);
  const s = Canonical.fromRows(closes.map((c, i) => ({ date: days[i], open: c, high: c, low: c, close: c, volume: 1 })), { instrumentId: "PV", priceSeriesType: "SPLIT_ADJUSTED" });
  const atr = closes.map((_, i) => (i === 11 ? 1.13 : 1.0));
  const r = Pivots.runScale(s, atr, { scaleId: "t", kAtr: 4.6, minPct: 0.01 }, "x");
  const high = r.pivots.find((p) => p.side === "HIGH");
  assert.ok(high && high.pivotIndex === 10 && high.confirmedIndex === 12, JSON.stringify(r.pivots));
  const low = r.pivots.find((p) => p.side === "LOW" && p.pivotIndex > 10) || r.developing;
  assert.equal(low.pivotIndex, 11, "das tiefste Low (Bar 11) ist das Extrem, nicht das Low der Bestaetigungsbar");
  assert.equal(low.pivotPrice, 100.0);
});

test("AU6 · Evidence: Entry und Target in derselben Bar zaehlen nicht als sofortiger Treffer", () => {
  const rec = { direction: "BULLISH", dataCutoff: "2020-01-01", entry: { zoneLow: 98, zoneHigh: 100 }, invalidation: 90, targets: [{ zoneLow: 110, zoneHigh: 112 }] };
  const series = Canonical.fromRows([{ date: "2020-01-02", open: 103, high: 111, low: 99, close: 105, volume: 1 }, { date: "2020-01-03", open: 105, high: 106, low: 104, close: 105, volume: 1 }], { instrumentId: "x", priceSeriesType: "SPLIT_ADJUSTED" });
  const out = Snapshot.evaluateOutcome(rec, series);
  assert.ok(out.eventualOutcome !== "ALL_TARGETS" && out.timeToTarget !== 0, out.eventualOutcome);
});

test("AU7 · UNDETERMINED Engines geben keinen Richtungs-Vote in die Confluence", () => {
  const b = run(Canonical.slice(fixtures.cleanUptrend(), 45));
  assert.equal(b.trend.direction, "UNDETERMINED");
  assert.equal(b.trend.value, 0);
  assert.equal(b.confluence.families.TREND.available, false);
  if (b.momentum.state === "UNDETERMINED") assert.equal(b.confluence.families.MOMENTUM.available, false);
  const eng = { structure: { state: { regime: "UNDETERMINED", structureScore: 0.6 }, evidence: [] }, trend: { direction: "UNDETERMINED", value: 1 }, momentum: { state: "UNDETERMINED", value: 1 }, fibonacci: { value: 0 }, elliott: null };
  const c = Confluence.computeConfluence(eng, "BULLISH");
  assert.equal(c.families.STRUCTURE.available, false);
  assert.equal(c.families.PROJECTION_AUXILIARY.available, false, "ohne Fib/Elliott-Beitrag ist die Familie nicht verfuegbar");
  assert.equal(c.coverage, 0);
});

test("AU8 · Setup Quality: Kurs jenseits der Entry Zone Richtung Stop ist keine Entry-Naehe", () => {
  const sc = (close) => ({ scenarioId: "x", direction: "BULLISH", status: "ACTIVE", entryStatus: close < 100 ? "BELOW_ZONE" : "AWAITING_PULLBACK", entryZone: { zoneLow: 100, zoneHigh: 102, sources: [] }, invalidation: { price: 96 }, tradeStop: { price: 96 }, targetZones: [{ zoneLow: 112, zoneHigh: 114 }] });
  const weak = TradeSetup.buildTradeSetup(sc(97.5), { close: 97.5, atr: 2, averageVolume: 1e6 });
  const healthy = TradeSetup.buildTradeSetup(sc(104.5), { close: 104.5, atr: 2, averageVolume: 1e6 });
  assert.equal(weak.qualityComponents.entryProximity, 0);
  assert.ok(healthy.setupQuality > weak.setupQuality);
});

test("AU9 · Elliott Hard Rules: 'ueberschreitet'-Regeln sind fuer ein laufendes Leg offen, 'nicht-ueber'-Regeln sofort pruefbar", () => {
  const legs = [{ fromPrice: 100, toPrice: 130, duration: 10, status: "CONFIRMED" }, { fromPrice: 130, toPrice: 115, duration: 5, status: "CONFIRMED" }, { fromPrice: 115, toPrice: 125, duration: 3, status: "DEVELOPING" }];
  const res = Rules.impulseHardRules(legs, 1);
  assert.equal(res.find((r) => r.ruleId === "W3_BEYOND_W1_END").passed, null);
  assert.equal(Elliott.evaluate("IMPULSE", legs, {}).valid, true, "developing W3 unter W1-Hoch ist noch kein ungueltiger Count");
  const done = legs.map((l) => Object.assign({}, l, { status: "CONFIRMED" }));
  assert.equal(Rules.impulseHardRules(done, 1).find((r) => r.ruleId === "W3_BEYOND_W1_END").passed, false);
  const w2bad = [{ fromPrice: 100, toPrice: 130, duration: 10, status: "CONFIRMED" }, { fromPrice: 130, toPrice: 95, duration: 5, status: "DEVELOPING" }];
  assert.equal(Rules.impulseHardRules(w2bad, 1).find((r) => r.ruleId === "W2_NOT_BEYOND_W1_ORIGIN").passed, false);
  const zz = [{ fromPrice: 100, toPrice: 80, duration: 10, status: "CONFIRMED" }, { fromPrice: 80, toPrice: 92, duration: 5, status: "CONFIRMED" }, { fromPrice: 92, toPrice: 85, duration: 3, status: "DEVELOPING" }];
  assert.notEqual(Rules.zigzagHardRules(zz, -1).find((r) => r.ruleId === "C_BEYOND_B_END").passed, false, "ein laufendes C in A-Richtung verletzt die Regel nicht");
});

test("AU10 · Range-Szenario ist zweiseitig invalidierbar; Gap-Zonen-Distanz folgt der Rolle; Scanner asOf = juengster Stand", () => {
  const b = run(fixtures.range());
  const p = b.scenarios.primary;
  if (p.template === "RANGE") { assert.ok(p.invalidation.upperPrice > p.invalidation.price); assert.match(p.invalidation.rule, /Oberkante/); }
  const g = run(fixtures.gap()).supportResistance.zones.filter((z) => z.origin === "GAP_UP");
  for (const z of g) assert.ok(z.currentRole === "INSIDE" ? z.distanceAtr === 0 : z.distanceAtr >= 0, JSON.stringify(z));
  const scan = Scanner.scanUniverse({ universe: [{ instrumentId: "A", series: fixtures.cleanUptrend(300) }, { instrumentId: "B", series: fixtures.cleanDowntrend(400) }], benchmarkSeries: null, methodology: METH, universeId: "t" });
  assert.equal(scan.asOf, scan.rows.map((r) => r.analysisTime).sort().pop());
});

test("AU11 · Renderer: Zeichenbereich wird geclippt, Segmentstart am Fensterrand interpoliert (Quellprüfung)", () => {
  const src = readFileSync(new URL("../ui/technical-chart.js", import.meta.url), "utf8");
  assert.ok(src.includes("clipPath") && src.includes('"clip-path": "url(#" + clipId + ")"'));
  assert.ok(/if \(xa < i0 && xb > xa\)/.test(src), "Interpolation am linken Fensterrand");
  assert.ok(/Math\.min\(h - PAD\.bottom - 4, Math\.max\(PAD\.top \+ 10, y\)\)/.test(src), "Labels bleiben im Zeichenbereich");
});
