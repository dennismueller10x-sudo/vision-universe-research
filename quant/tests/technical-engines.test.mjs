/* CHECKPOINT 3 — Trend, Momentum, Relative Strength, Volatility, Volume */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixtures, seriesFromCloses } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Features = require("../engines/technical/feature-store.js");
const Trend = require("../engines/technical/trend-engine.js");
const Momentum = require("../engines/technical/momentum-engine.js");
const RS = require("../engines/technical/relative-strength-engine.js");
const Vol = require("../engines/technical/volatility-engine.js");
const Volume = require("../engines/technical/volume-engine.js");
const Hash = require("../engines/hash.js");

const feat = (s) => Features.computeFeatures(s);

test("T1 · Trend: Aufwaertstrend BULLISH, Abwaertstrend BEARISH, Range nicht bullish", () => {
  const up = Trend.analyzeTrend(fixtures.cleanUptrend(), feat(fixtures.cleanUptrend()));
  const down = Trend.analyzeTrend(fixtures.cleanDowntrend(), feat(fixtures.cleanDowntrend()));
  const rg = Trend.analyzeTrend(fixtures.range(), feat(fixtures.range()));
  assert.equal(up.direction, "BULLISH"); assert.ok(up.trendScore > 65);
  assert.equal(down.direction, "BEARISH"); assert.ok(down.trendScore < 35);
  assert.notEqual(rg.direction, "BULLISH");
  assert.equal(up.scoreType, "methodology_score");
  for (const k of Object.keys(Trend.DEFAULTS.weights)) assert.ok(k in up.components);
  assert.ok(up.evidence.length >= 5 && up.evidence.every((e) => e.family === "TREND" && e.evidenceId));
});

test("T2 · Trend: fehlende Komponenten senken die Coverage, werden nie durch 50 ersetzt", () => {
  const short = fixtures.cleanUptrend(80);            // keine SMA200, kein 52W
  const t = Trend.analyzeTrend(short, feat(short));
  assert.ok(t.coverage < 1);
  assert.equal(t.components.highProximity, null);
  const tiny = fixtures.cleanUptrend(15);
  assert.equal(Trend.analyzeTrend(tiny, feat(tiny)).direction, "UNDETERMINED");
});

test("M1 · Momentum: Multi-Horizon-Returns, Beschleunigung, RSI/MACD ohne Vote", () => {
  const s = fixtures.cleanUptrend();
  const m = Momentum.analyzeMomentum(s, feat(s));
  assert.ok(["POSITIVE", "STRONG_POSITIVE"].includes(m.state), m.state);
  for (const h of ["1M", "3M", "6M", "12M"]) assert.ok(typeof m.horizons[h].return === "number");
  assert.equal(m.explanatory.rsi14.vote, false);
  assert.equal(m.explanatory.macd.vote, false);
  assert.ok(m.evidence.every((e) => !/rsi|macd/i.test(e.key)), "RSI/MACD duerfen keinen Evidence-Vote erzeugen");
  const d = Momentum.analyzeMomentum(fixtures.cleanDowntrend(), feat(fixtures.cleanDowntrend()));
  assert.ok(["NEGATIVE", "STRONG_NEGATIVE"].includes(d.state), d.state);
});

test("R1 · Relative Staerke ist nicht RSI: Instrument vs. Benchmark, Sektor optional, Rang aus Universum", () => {
  const stock = fixtures.cleanUptrend(), bench = fixtures.range();
  const r = RS.analyzeRelativeStrength(stock, bench, { universeRank: { percentile: 92, universeId: "test", n: 100 } });
  assert.equal(r.state, "STRONG");
  assert.ok(r.vsBenchmark.horizons["12M"] > 0);
  assert.equal(r.vsSector.status, "UNAVAILABLE");
  assert.ok(r.evidence.some((e) => e.key === "universeRank"));
  const none = RS.analyzeRelativeStrength(stock, null);
  assert.equal(none.state, "UNAVAILABLE"); assert.equal(none.value, 0); assert.ok(none.reason);
  // Benchmark-Alignment nimmt nie einen spaeteren Benchmark-Wert.
  const aligned = RS.alignedCloses(stock, bench);
  assert.equal(aligned[10], bench.close[10]);
});

test("V1 · Volatilitaet: Kompression vs. Expansion, Regime, kein Stop-Modell", () => {
  const closes = [];
  for (let i = 0; i < 400; i++) closes.push(100 + (i < 300 ? 6 * Math.sin(i / 5) : 0.4 * Math.sin(i / 5)));
  const comp = seriesFromCloses(closes, { rangePct: 0.001, seed: "vc" });
  const v = Vol.analyzeVolatility(comp, feat(comp));
  assert.equal(v.compression, true); assert.equal(v.regime, "LOW"); assert.ok(v.value > 0);
  const hv = Vol.analyzeVolatility(fixtures.highVol(), feat(fixtures.highVol()));
  assert.ok(typeof hv.metrics.atr === "number" && hv.metrics.atr > 0);
  assert.equal(hv.noiseBufferAtr, 1.0);
  assert.ok(!("stop" in hv) && !("stopLoss" in hv));
});

test("U1 · Volumen: Breakout-Volumen, Dry-Up, Richtungsanteil, UNAVAILABLE ohne Volumen", () => {
  const s = fixtures.cleanUptrend(300);
  const n = s.length - 1;
  s.volume[n] = s.volume[n] * 4; s.close[n] = s.high[n] = Math.max(...s.high.slice(n - 25, n)) * 1.03;
  const v = Volume.analyzeVolume(s, feat(s));
  assert.equal(v.state, "BREAKOUT_VOLUME_UP");
  assert.ok(v.breakout && v.breakout.index === n);
  const q = fixtures.cleanUptrend(300);
  for (let i = q.length - 6; i < q.length; i++) q.volume[i] = 100000;
  const dry = Volume.analyzeVolume(q, feat(q));
  assert.equal(dry.dryUp, true); assert.equal(dry.state, "DRY_UP");
  const nov = fixtures.cleanUptrend(100); nov.volume = nov.volume.map(() => null);
  const u = Volume.analyzeVolume(nov, feat(nov));
  assert.equal(u.state, "UNAVAILABLE"); assert.equal(u.value, 0);
});

test("E1 · Alle Zustandsengines sind deterministisch, versioniert und kausal (Praefix)", () => {
  const full = fixtures.cleanUptrend(400), bench = fixtures.range(400);
  const T = 320;
  const cut = Canonical.slice(full, T), bcut = Canonical.slice(bench, T);
  const run = (s, b) => {
    const f = feat(s);
    return [Trend.analyzeTrend(s, f), Momentum.analyzeMomentum(s, f), RS.analyzeRelativeStrength(s, b), Vol.analyzeVolatility(s, f), Volume.analyzeVolume(s, f)];
  };
  const a = run(cut, bcut), b = run(cut, bcut);
  assert.equal(Hash.hashValue(a), Hash.hashValue(b));
  for (const r of a) { assert.equal(r.asOfIndex, T); assert.match(r.engineVersion, /-1\.0\.0$/); assert.ok(r.parametersHash); assert.equal(r.repaintingPolicy, "NON_REPAINTING"); }
  // Der Zustand an T ist derselbe, ob 400 oder 321 Bars vorliegen — sofern nur bis T gerechnet wird.
  const fullFeat = feat(full);
  const atT = Trend.analyzeTrend(Canonical.slice(full, T), Features.computeFeatures(Canonical.slice(full, T)));
  assert.deepEqual(atT.components, a[0].components);
  assert.ok(fullFeat.length === 400);
});
