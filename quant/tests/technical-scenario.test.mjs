/* CHECKPOINT 5 — Scenario, Trade Setup, Confluence, Opportunity Score, Orchestrator */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fixtures } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const Confluence = require("../engines/technical/confluence.js");
const TradeSetup = require("../engines/technical/trade-setup.js");
const Score = require("../engines/technical/technical-score.js");
const Scenario = require("../engines/technical/scenario-engine.js");
const Hash = require("../engines/hash.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");

const METH = { technical: JSON.parse(readFileSync(new URL("../methodology/technical-v1.json", import.meta.url), "utf8")) };
const run = (s, b) => Analysis.analyze({ series: s, benchmarkSeries: b || null, methodology: METH, options: { annotations: false, elliott: false } });

test("SC1 · Bullischer Trend → PRIMARY/ALTERNATIVE/BEAR mit Entry, Invalidation, Target-Zonen, Evidence", () => {
  const b = run(fixtures.cleanUptrend(), fixtures.range());
  const sc = b.scenarios;
  assert.equal(sc.direction, "BULLISH");
  assert.ok(sc.primary && sc.alternative && sc.bear);
  const p = sc.primary;
  for (const f of ["scenarioId", "instrumentId", "analysisTime", "direction", "status", "timeframe", "entryZone", "invalidation", "targetZones", "confidence", "supportingEvidence", "conflictingEvidence", "engineVersions", "dataCutoff"]) assert.ok(f in p, f);
  assert.equal(p.targetZones.length, 2);
  assert.ok(p.targetZones[0].zoneHigh > p.targetZones[0].zoneLow, "Zone statt Einzelwert");
  assert.ok(p.targetZones[1].zoneLow > p.targetZones[0].zoneHigh, "T2 liegt ueber T1");
  assert.ok(p.targetZones.every((z) => z.sources.length >= 1 && z.methodologyVersion), "jede Zone dokumentiert ihre Quelle");
  assert.ok(p.invalidation.price < p.entryZone.zoneLow, "Invalidation liegt unter der Entry Zone");
  assert.ok(p.invalidation.rule && p.invalidation.basis === "STRUCTURE");
  assert.ok(p.entryZone.sources.some((s) => s.type === "RETRACEMENT") && p.entryZone.sources.some((s) => s.type === "VOLATILITY"));
  assert.ok(p.supportingEvidence.length > p.conflictingEvidence.length);
  assert.equal(p.confidenceType, "methodology_confidence");
  assert.equal(sc.bear.direction, "BEARISH"); assert.equal(sc.bear.entryZone, null); assert.ok(sc.bear.trigger.price === p.invalidation.price);
  assert.equal(p.tradeStop.price, p.invalidation.price);
  assert.ok("tradeStop" in p && "invalidation" in p, "Count Invalidation und Trade Stop getrennt gespeichert");
});

test("SC2 · Bearischer Trend ist gespiegelt; Range liefert kein richtungsgebendes Setup", () => {
  const d = run(fixtures.cleanDowntrend()).scenarios;
  assert.equal(d.direction, "BEARISH");
  assert.ok(d.primary.invalidation.price > d.primary.entryZone.zoneHigh);
  assert.ok(d.primary.targetZones[0].zoneHigh < d.primary.entryZone.zoneLow);
  const r = run(fixtures.range()).scenarios;
  assert.ok(["RANGE", "NEUTRAL"].includes(r.direction), r.direction);
  assert.equal(r.primary.entryZone, null);
  assert.equal(r.primary.entryStatus, "NONE");
  assert.match(r.primary.whatMustHappen, /Close/);
});

test("SC3 · Quality Gate: ohne Entry/Invalidation/Target kein Trade Setup", () => {
  const b = run(fixtures.range());
  assert.equal(b.tradeSetup.status, "INCOMPLETE");
  assert.ok(b.tradeSetup.missing.includes("entry"));
  assert.equal(b.tradeSetup.riskReward, null);
  const s = { scenarioId: "x", direction: "BULLISH", status: "ACTIVE", entryZone: { zoneLow: 100, zoneHigh: 102 }, invalidation: { price: 105 }, tradeStop: { price: 105 }, targetZones: [{ zoneLow: 110, zoneHigh: 112 }] };
  assert.deepEqual(TradeSetup.buildTradeSetup(s, { close: 101, atr: 1 }).missing, ["stopInsideEntry"]);
});

test("SC4 · RR ist eine Range: RR_low = (T_low − E_high)/(E_high − Stop), RR_high = (T_high − E_low)/(E_low − Stop)", () => {
  const s = { scenarioId: "x", direction: "BULLISH", status: "ACTIVE", entryStatus: "ACTIVE", entryZone: { zoneLow: 100, zoneHigh: 102, sources: [] }, invalidation: { price: 96 }, tradeStop: { price: 96 },
              targetZones: [{ zoneLow: 110, zoneHigh: 114 }, { zoneLow: 120, zoneHigh: 124 }] };
  const t = TradeSetup.buildTradeSetup(s, { close: 101, atr: 2, averageVolume: 1e6 });
  assert.equal(t.status, "COMPLETE_LOW_RR", "RR_low 1.33 liegt unter der Setup-Mindestschwelle 1.5");
  assert.equal(TradeSetup.buildTradeSetup(Object.assign({}, s, { targetZones: [{ zoneLow: 112, zoneHigh: 114 }] }), { close: 101, atr: 2, averageVolume: 1e6 }).status, "COMPLETE");
  assert.equal(t.riskToInvalidation.low, 4); assert.equal(t.riskToInvalidation.high, 6);
  assert.equal(t.riskReward.low, +((110 - 102) / 6).toFixed(2));
  assert.equal(t.riskReward.high, +((114 - 100) / 4).toFixed(2));
  assert.equal(t.targets[1].rrLow, +((120 - 102) / 6).toFixed(2));
  assert.ok(t.potentialUpside.low > 0 && t.potentialUpside.high > t.potentialUpside.low);
  assert.ok(t.setupQuality > 0 && t.setupQuality <= 100);
  assert.ok(!("positionSize" in t));
  // Bearish gespiegelt
  const bs = { scenarioId: "y", direction: "BEARISH", status: "ACTIVE", entryStatus: "ACTIVE", entryZone: { zoneLow: 98, zoneHigh: 100, sources: [] }, invalidation: { price: 104 }, tradeStop: { price: 104 }, targetZones: [{ zoneLow: 86, zoneHigh: 90 }] };
  const bt = TradeSetup.buildTradeSetup(bs, { close: 99, atr: 2, averageVolume: 1e6 });
  assert.equal(bt.riskToInvalidation.low, 4); assert.equal(bt.riskReward.low, +((98 - 90) / 6).toFixed(2));
});

test("CF1 · Confluence ist familienbasiert: RSI+MACD+MA erzeugen keine Extra-Votes, Konflikt wird bestraft", () => {
  const b = run(fixtures.cleanUptrend(), fixtures.range());
  const c = b.confluence;
  assert.deepEqual(Object.keys(c.families).sort(), Confluence.FAMILIES.slice().sort());
  assert.equal(c.scoreType, "methodology_score");
  assert.ok(c.confluenceScore > 60);
  // Ein starkes Fib/Elliott-Signal kann die Richtung nicht kippen (Kappung).
  const engines = { structure: b.structure, trend: b.trend, momentum: b.momentum, relativeStrength: b.relativeStrength, volatility: b.volatility, volume: b.volume, supportResistance: b.supportResistance,
                    fibonacci: Object.assign({}, b.fibonacci, { value: 1 }), elliott: { value: 1, evidence: [] } };
  const boosted = Confluence.computeConfluence(engines, "BULLISH");
  assert.equal(boosted.families.PROJECTION_AUXILIARY.value, Confluence.AUX_CAP);
  assert.ok(boosted.confluenceScore - c.confluenceScore < 5, "Fib/Elliott-Boost bleibt klein");
  // Konflikt: Trend bullisch, Struktur bearisch → Penalty > 0.
  const conflict = Confluence.computeConfluence(Object.assign({}, engines, { structure: { state: { structureScore: -0.8 }, evidence: [] } }), "BULLISH");
  assert.ok(conflict.conflictPenalty > 0);
  assert.ok(conflict.confluenceScore < c.confluenceScore);
});

test("TOS1 · Opportunity Score: Methodology Rank, gekappte Projektion, keine Wahrscheinlichkeit", () => {
  const b = run(fixtures.cleanUptrend(), fixtures.range());
  const s = b.opportunityScore;
  assert.equal(s.interpretation, "methodology_rank"); assert.equal(s.isProbability, false);
  assert.ok(s.score >= 0 && s.score <= 100);
  const sum = Object.keys(s.contributions).reduce((a, k) => a + s.contributions[k], 0);
  assert.ok(Math.abs(sum * (1 - s.conflictPenalty) - s.score) < 0.2);
  for (const k of Object.keys(s.maxContribution)) assert.ok(s.contributions[k] <= s.maxContribution[k] + 1e-9);
  assert.equal(s.maxContribution.PROJECTION_AUXILIARY, 10);
  // Schwacher Trend + volle Projektion ≠ 90er-Score.
  const weak = run(fixtures.cleanDowntrend());
  const forced = Score.computeOpportunityScore({ confluence: Object.assign({}, weak.confluence, { families: Object.assign({}, weak.confluence.families, { PROJECTION_AUXILIARY: { value: 0.3 } }) }),
    scenarios: { primary: { direction: "BULLISH", invalidation: {} } }, tradeSetup: { status: "INCOMPLETE", missing: ["entry"] } });
  assert.ok(forced.score < 50, `Score ${forced.score}`);
  assert.match(s.disclaimer, /Keine Wahrscheinlichkeit/);
});

test("OR1 · Orchestrator: Provenienz vollstaendig, SPLIT_ADJUSTED erzwungen, Walk-Forward bit-identisch", () => {
  const full = fixtures.cleanUptrend(400), bench = fixtures.range(400);
  const b = run(full, bench);
  for (const k of ["dataCutoff", "dataVersion", "dataHash", "parametersHash", "methodologyVersion", "engineVersions", "analysisTime", "bundleVersion"]) assert.ok(b[k], k);
  assert.equal(b.methodologyVersion, "technical-v1.0.0");
  assert.equal(b.analysisLookback.bars, 400);
  assert.throws(() => run(Canonical.createSeries({ priceSeriesType: "TOTAL_RETURN", instrumentId: "x" }, { timestamps: ["2020-01-01"], open: [1], high: [1], low: [1], close: [1], volume: [1] })), /SPLIT_ADJUSTED/);
  const T = 320;
  const a = Analysis.analyzeAsOf({ series: full, benchmarkSeries: bench, methodology: METH, options: { annotations: false, elliott: false } }, T);
  const c = run(Canonical.slice(full, T), Canonical.slice(bench, T));
  assert.equal(a.dataCutoff, full.timestamps[T]);
  assert.equal(Hash.hashValue(a), Hash.hashValue(c), "Analyse an T ist unabhaengig von spaeteren Bars");
  assert.equal(a.scenarios.primary.scenarioId, c.scenarios.primary.scenarioId);
});

test("OR2 · Mock-Universum: Analyse laeuft ueber 20 Jahre synthetischer Historie inkl. Split-Fixture", () => {
  const dataset = Generator.generateDataset();
  const provider = MockProvider.createMockProvider({ dataset });
  const bench = provider.getBenchmarkBars(Generator.BENCHMARK_ID, {}).data.bars;
  const benchSeries = Canonical.fromRows(bench.map((r) => ({ date: r.date, open: r.level, high: r.level, low: r.level, close: r.level, volume: null })), { instrumentId: Generator.BENCHMARK_ID, priceSeriesType: "SPLIT_ADJUSTED", source: "mock" });
  for (const id of ["sec_VUF011", "sec_VUF002", "sec_VUF005"]) {
    const worlds = Canonical.fromPriceBars(provider.getPriceBars(id, {}).data, provider.getCorporateActions(id, {}).data, { instrumentId: id });
    const b = run(worlds.SPLIT_ADJUSTED, benchSeries);
    assert.ok(b.analysisLookback.bars > 4000);
    assert.ok(b.scenarios.primary);
    assert.ok(typeof b.opportunityScore.score === "number");
    assert.notEqual(b.relativeStrength.state, "UNAVAILABLE");
  }
  const st = Analysis.summarize(run(Canonical.fromPriceBars(provider.getPriceBars("sec_VUF002", {}).data, [], { instrumentId: "sec_VUF002" }).SPLIT_ADJUSTED, benchSeries));
  assert.ok(["BULLISH", "NEUTRAL"].includes(st.trend), "Momentum-Fixture sollte nicht bearisch sein: " + st.trend);
});

test("TX1 · Kein Engine-Output formuliert eine Wahrscheinlichkeit oder Kaufaufforderung", () => {
  const b = run(fixtures.cleanUptrend(), fixtures.range());
  const text = JSON.stringify(b);
  assert.doesNotMatch(text, /% Wahrscheinlichkeit|% Chance|probability of profit|garantiert/i);
  assert.doesNotMatch(text, /"(BUY|SELL|STRONG BUY)"/);
  assert.ok(Scenario.priceStep(5) === 1 && Scenario.priceStep(0.4) === 0.1 && Scenario.priceStep(50) === 10, "Rundungsschritt aus ATR");
});
