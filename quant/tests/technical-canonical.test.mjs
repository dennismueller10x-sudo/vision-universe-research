/* CHECKPOINT 1 — Canonical Bars, Timeframe, Feature Store */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixtures, rawBarsWithSplit, seriesFromCloses } from "./technical-fixtures.mjs";

const require = createRequire(import.meta.url);
const Canonical = require("../engines/technical/canonical-bars.js");
const Timeframe = require("../engines/technical/timeframe.js");
const Features = require("../engines/technical/feature-store.js");
const Generator = require("../engines/mock-generator.js");
const MockProvider = require("../engines/mock-provider.js");
const Semantics = require("../engines/price-semantics.js");

test("C1 · CanonicalBar traegt alle Pflichtfelder, keine Vendor-Felder", () => {
  const s = fixtures.cleanUptrend(50);
  const bars = Canonical.toBars(s);
  assert.equal(bars.length, 50);
  for (const b of bars) assert.equal(Canonical.validateBar(b).valid, true);
  assert.deepEqual(Object.keys(bars[0]).sort(), Canonical.BAR_FIELDS.slice().sort());
  assert.equal(Canonical.validateSeries(s).valid, true);
});

test("C2 · Ein 4:1-Split verschwindet aus der SPLIT_ADJUSTED-Geometrie und bleibt als Flag", () => {
  const { bars, actions, days } = rawBarsWithSplit(300, 150, 4);
  const worlds = Canonical.fromPriceBars(bars, actions, { instrumentId: "SPLIT" });
  const raw = worlds.RAW, sa = worlds.SPLIT_ADJUSTED, tr = worlds.TOTAL_RETURN;
  // RAW zeigt den Sprung, SPLIT_ADJUSTED nicht.
  assert.ok(raw.close[150] / raw.close[149] < 0.3, "RAW muss den Split-Sprung zeigen");
  const ratio = sa.close[150] / sa.close[149];
  assert.ok(ratio > 0.99 && ratio < 1.01, `SPLIT_ADJUSTED darf keinen Sprung haben (${ratio})`);
  assert.equal(sa.adjustmentFactor[149], 4);
  assert.equal(sa.adjustmentFactor[150], 1);
  assert.deepEqual(sa.corporateActionFlags[150], ["SPLIT"]);
  assert.equal(sa.volume[149], raw.volume[149] * 4);
  assert.equal(sa.timestamps[150], days[150]);
  // Drei Welten sind drei Serien mit eigener Semantik und eigenem Hash.
  assert.equal(Semantics.check("breakout", sa.priceSeriesType).allowed, true);
  assert.equal(Semantics.check("breakout", raw.priceSeriesType).allowed, false);
  assert.notEqual(sa.dataHash, raw.dataHash);
  assert.equal(tr.priceSeriesType, "TOTAL_RETURN");
  assert.equal(tr.meta.ohlcDerived, true);
});

test("C3 · Die Mock-Split-Fixture VUF011 ergibt eine stetige splitbereinigte Reihe", () => {
  const dataset = Generator.generateDataset();
  const provider = MockProvider.createMockProvider({ dataset });
  const bars = provider.getPriceBars("sec_VUF011", { from: "2021-06-01", to: "2021-11-30" }).data;
  const actions = provider.getCorporateActions("sec_VUF011", {}).data;
  const worlds = Canonical.fromPriceBars(bars, actions, { instrumentId: "VUF011" });
  const sa = worlds.SPLIT_ADJUSTED, raw = worlds.RAW;
  const i = Canonical.indexAtOrBefore(sa, "2021-08-31");
  assert.equal(sa.timestamps[i], "2021-08-31");
  assert.ok(raw.close[i] / raw.close[i - 1] < 0.4, "RAW-Print faellt am Split-Tag");
  const r = sa.close[i] / sa.close[i - 1];
  assert.ok(r > 0.85 && r < 1.15, `kein Split-Sprung in SPLIT_ADJUSTED (${r})`);
  assert.equal(worlds.SPLIT_ADJUSTED.meta.splitsApplied.length, 1);
});

test("C4 · slice() ist kausal: Praefix-Hash unabhaengig von spaeteren Bars", () => {
  const full = fixtures.cleanUptrend(300);
  const a = Canonical.slice(full, 199);
  const b = Canonical.slice(Canonical.slice(full, 250), 199);
  assert.equal(a.length, 200);
  assert.equal(a.dataHash, b.dataHash);
  assert.equal(a.dataVersion, full.dataVersion, "dieselbe Datenrevision");
  assert.equal(Canonical.slice(full, full.timestamps[10]).length, 11);
});

test("C5 · Eine Datenrevision erzeugt eine neue dataVersion, die alte bleibt", () => {
  const s = fixtures.cleanUptrend(100);
  const r = Canonical.revise(s, [{ index: 50, close: s.close[50] * 1.02, high: s.high[50] * 1.03 }], "fixture-2");
  assert.notEqual(r.dataVersion, s.dataVersion);
  assert.equal(r.meta.revisedFrom, s.dataVersion);
  assert.equal(s.close[50] * 1.02, r.close[50]);
});

test("C6 · Wochen- und Monatsaggregation folgt dem Handelskalender", () => {
  const s = fixtures.cleanUptrend(260);
  const w = Timeframe.aggregate(s, "1W", { closed: true });
  const m = Timeframe.aggregate(s, "1M");
  assert.equal(w.timeframe, "1W");
  assert.equal(w.sessionType, "AGGREGATED");
  assert.equal(Canonical.validateSeries(w).valid, true);
  // Jede Wochenbar traegt den letzten Handelstag ihrer ISO-Woche.
  const spans = w.meta.bucketSpans;
  spans.forEach(([first, last], k) => {
    assert.equal(w.timestamps[k], s.timestamps[last]);
    assert.equal(Timeframe.isoWeekKey(s.timestamps[first]), Timeframe.isoWeekKey(s.timestamps[last]));
    let hi = -Infinity, lo = Infinity, vol = 0;
    for (let i = first; i <= last; i++) { hi = Math.max(hi, s.high[i]); lo = Math.min(lo, s.low[i]); vol += s.volume[i]; }
    assert.equal(w.high[k], hi); assert.equal(w.low[k], lo); assert.equal(w.volume[k], vol);
    assert.equal(w.open[k], s.open[first]); assert.equal(w.close[k], s.close[last]);
  });
  assert.equal(m.meta.lastBarStatus, "DEVELOPING");
  assert.equal(w.meta.lastBarStatus, "CONFIRMED");
  assert.equal(m.meta.aggregation.version, Timeframe.AGGREGATION_VERSION);
  assert.throws(() => Timeframe.aggregate(w, "1D"), /groesseren Timeframe/);
});

test("C7 · 4h-Bars sind session-verankert, nicht UTC-verankert", () => {
  // 1-Minuten-Bars einer regulaeren XNYS-Session plus Pre-Market.
  const rows = [];
  const day = "2024-03-05";
  for (let m = 8 * 60; m < 16 * 60; m++) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
    rows.push({ timestamp: `${day}T${hh}:${mm}`, open: 100, high: 101, low: 99, close: 100 + m / 1000, volume: 10 });
  }
  const s1 = Canonical.fromRows(rows, { instrumentId: "X", timeframe: "1m", priceSeriesType: "SPLIT_ADJUSTED" });
  const h4 = Timeframe.aggregate(s1, "4h");
  assert.deepEqual(h4.timestamps, [`${day}T09:30`, `${day}T13:30`], "Bars beginnen am Session-Start, Pre-Market ausgeschlossen");
  assert.equal(h4.meta.partialLastBucket, true, "die zweite 4h-Bar ist eine Teilbar bis Session-Ende");
  assert.equal(h4.meta.aggregation.policyId, "XNYS-regular-v1");
  const h1 = Timeframe.aggregate(s1, "1h");
  assert.equal(h1.timestamps[0], `${day}T09:30`);
  assert.equal(h1.length, 7);
});

test("C8 · Kalender: Offsets innerhalb der Historie exakt, danach Werktage", () => {
  const s = fixtures.cleanUptrend(30);
  const cal = Timeframe.createCalendar(s.timestamps);
  assert.equal(cal.offset(s.timestamps[0], 5), s.timestamps[5]);
  const beyond = cal.offset(s.timestamps[29], 3);
  assert.ok(beyond > s.timestamps[29]);
  const wd = new Date(beyond + "T00:00:00Z").getUTCDay();
  assert.ok(wd !== 0 && wd !== 6);
  assert.deepEqual(Timeframe.roles("1D"), { context: "1W", setup: "1D", trigger: "4h" });
});

test("F1 · Features sind deterministisch, versioniert und kausal", () => {
  const s = fixtures.cleanUptrend(400);
  const a = Features.computeFeatures(s), b = Features.computeFeatures(s);
  assert.equal(a.parametersHash, b.parametersHash);
  assert.equal(a.featureVersion, "features-1.0.0");
  assert.deepEqual(a.at(399), b.at(399));
  // Praefix-Eigenschaft: Feature an i haengt nicht von Bars > i ab.
  const cut = Features.computeFeatures(Canonical.slice(s, 299));
  for (const k of Object.keys(a.columns)) {
    const x = a.columns[k][299], y = cut.columns[k][299];
    assert.ok((Number.isNaN(x) && Number.isNaN(y)) || x === y, `${k} sieht in die Zukunft`);
  }
});

test("F2 · Bekannte Werte: SMA, ATR, RSI, Drawdown, 52W-Hoch", () => {
  const closes = [];
  for (let i = 0; i < 300; i++) closes.push(100 + i);
  const s = seriesFromCloses(closes, { rangePct: 0 });
  const f = Features.computeFeatures(s).columns;
  assert.ok(Math.abs(f.sma20[299] - (closes.slice(280).reduce((a, b) => a + b) / 20)) < 1e-9);
  assert.ok(Number.isNaN(f.sma200[198]) && !Number.isNaN(f.sma200[199]), "SMA200 erst ab Bar 200");
  assert.ok(f.rsi14[299] > 99, "monoton steigend → RSI nahe 100");
  assert.equal(f.drawdown[299], 0);
  assert.ok(Math.abs(f.distanceTo52wHigh[299]) < 1e-9);
  assert.ok(f.atr[299] > 0.9 && f.atr[299] < 1.1, "ATR einer +1/Tag-Reihe ohne Range ≈ 1");
  // Fehlende Historie ist NaN, nicht 0.
  assert.ok(Number.isNaN(f.momentum12M[100]));
  assert.equal(Features.computeFeatures(s).at(100).momentum12M, null);
});

test("F3 · Relative Volume nutzt ausschliesslich vorherige Bars", () => {
  const s = fixtures.cleanUptrend(100);
  s.volume[80] = s.volume[80] * 10;
  const f = Features.computeFeatures(s).columns;
  // Der Ausreisser selbst ist gross, die Basis am selben Tag unveraendert.
  assert.ok(f.relativeVolume[80] > 5);
  assert.ok(f.averageVolume[80] < s.volume[80] / 5);
});
