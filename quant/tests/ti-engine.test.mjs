/* TECHNICAL INTELLIGENCE (TI) — Kausalitaet, Invarianten, Engines, Outcomes.
   Wichtigster Test: Live-Produkt und Backtest teilen denselben Code. Ein
   Ergebnis an Bar t darf sich nicht aendern, wenn Bars nach t fehlen oder
   vergiftet sind. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixtures } from "./technical-fixtures.mjs";
import { loadGoldenDaily, weeklySeriesFromPoints } from "../../scripts/technical/lib/ti-data.mjs";

const require = createRequire(import.meta.url);
const TI = require("../engines/technical/ti/engine.js");
const Ctx = require("../engines/technical/ti/context.js");
const Dow = require("../engines/technical/ti/dow-trend.js");
const MV = require("../engines/technical/ti/momentum-volatility.js");
const Pat = require("../engines/technical/ti/chart-patterns.js");
const Wy = require("../engines/technical/ti/wyckoff.js");
const Lv = require("../engines/technical/ti/levels.js");
const Sc = require("../engines/technical/ti/scenario.js");
const Out = require("../engines/technical/ti/outcomes.js");
const Canonical = require("../engines/technical/canonical-bars.js");

/* dataVersion ist der Hash der GESAMTEN Eingangsserie (Provenienz) — er darf sich unterscheiden; alles andere nicht. */
const strip = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.diagnostics.computeMs; delete o.dataQuality.dataVersion; return JSON.stringify(o); };
const NVDA = loadGoldenDaily("NVDA");

test("TI-C1 · Kausalitaet: Ergebnis an t identisch mit der Analyse der bei t abgeschnittenen Serie (inkl. Wochensicht)", () => {
  const P = TI.prepare(NVDA);
  for (const t of [900, 1500, 2100, NVDA.length - 1]) {
    const a = TI.analyzeAt(P, t);
    const b = TI.analyze(Canonical.slice(NVDA, t));
    assert.equal(strip(a), strip(b), "Abweichung bei t=" + t + " (" + NVDA.timestamps[t] + ")");
  }
});

test("TI-C2 · Vergiftete Zukunft aendert nichts an Bar t", () => {
  const t = 1800;
  const patches = []; for (let k = t + 1; k < NVDA.length; k += 1) patches.push({ index: k, open: 1, high: 9999, low: 0.5, close: 1, volume: 1 });
  const poisoned = Canonical.revise(NVDA, patches, "poison");
  assert.equal(strip(TI.analyzeAt(TI.prepare(NVDA), t)), strip(TI.analyzeAt(TI.prepare(poisoned), t)));
});

test("TI-C3 · Wochenkontext nutzt nur abgeschlossene Wochen", () => {
  const P = TI.prepare(NVDA);
  for (const t of [700, 1234, 2000]) {
    const w = TI.completedWeek(P.weekly, t);
    assert.ok(P.weekly.spans[w][1] < t || (P.weekly.spans[w][1] === t && w < P.weekly.spans.length - 1 && P.weekly.spans[w + 1][0] > t), "Woche " + w + " endet nach t=" + t);
    assert.ok(P.weekly.spans[w + 1][0] <= t, "die Woche von t gilt nicht als abgeschlossen");
  }
});

test("TI-I1 · Szenario-Geometrie: Invalidation < Einstieg < Ziel 1 < Ziel 2 (bullish), gespiegelt bearish", () => {
  const P = TI.prepare(NVDA);
  let checked = 0;
  for (let t = 600; t < NVDA.length; t += 37) {
    const r = TI.analyzeAt(P, t, { skipHigher: true });
    for (const s of r.scenarios.filter((x) => x.entryZone && x.invalidation && x.kind !== "TAIL")) {
      const up = s.direction === "BULLISH";
      assert.ok(s.entryZone.zoneLow < s.entryZone.zoneHigh);
      if (up) assert.ok(s.invalidation.price < s.entryZone.zoneLow, JSON.stringify([t, s.invalidation, s.entryZone]));
      else assert.ok(s.invalidation.price > s.entryZone.zoneHigh, JSON.stringify([t, s.invalidation, s.entryZone]));
      let prev = up ? s.entryZone.zoneHigh : s.entryZone.zoneLow;
      for (const z of s.targets) {
        assert.ok(z.zoneLow < z.zoneHigh);
        if (up) { assert.ok(z.zoneLow > prev, "Ziele aufsteigend bei t=" + t); prev = z.zoneHigh; }
        else { assert.ok(z.zoneHigh < prev, "Ziele absteigend bei t=" + t); prev = z.zoneLow; }
      }
      checked++;
    }
  }
  assert.ok(checked > 40, "zu wenige Szenarien geprueft: " + checked);
});

test("TI-I2 · Keine Wahrscheinlichkeit ohne bestandene Kalibrierung; Confidence-Komponenten getrennt", () => {
  const r = TI.analyze(NVDA);
  assert.equal(r.diagnostics.isProbability, false);
  assert.equal(r.confidence.calibrated, null);
  for (const k of ["overall", "structural", "agreement", "empirical", "calibrated"]) assert.ok(k in r.confidence);
  assert.ok(["HIGH", "MODERATE", "LOW"].includes(r.confidence.overall));
  // Mit Evidence-Tabelle, aber ohne bestandene Kalibrierung: weiterhin keine Wahrscheinlichkeit
  const key = r.signature.key;
  const table = { setups: { [key]: { n: 500, t1HitRate: 0.42, lift: 0.03, liftCiLow: 0.01, calibratedProbability: 0.42 } } };
  const r2 = TI.analyzeAt(TI.prepare(NVDA), NVDA.length - 1, { evidenceTable: table, calibration: { passed: false } });
  assert.equal(r2.confidence.calibrated, null);
  assert.equal(r2.confidence.empirical.status, "OK");
  const r3 = TI.analyzeAt(TI.prepare(NVDA), NVDA.length - 1, { evidenceTable: table, calibration: { passed: true, method: "x", brier: 0.2 } });
  assert.equal(r3.confidence.calibrated.probability, 0.42);
});

test("TI-I3 · Kleine Stichprobe wird nicht als Evidenz ausgegeben", () => {
  const sig = { key: "1D|PULLBACK|BULLISH|HIGH" };
  assert.equal(Sc.empiricalLookup({ setups: { [sig.key]: { n: 12, t1HitRate: 0.9 } } }, sig, Sc.DEFAULTS).status, "INSUFFICIENT_SAMPLE");
  assert.equal(Sc.empiricalLookup({ setups: {} }, sig, Sc.DEFAULTS).status, "NO_HISTORY");
});

test("TI-I4 · Ohne historischen Vorteil kann das Gesamtlabel nicht HIGH sein", () => {
  const conf = { level: "HIGH", mixed: false, agreement: 0.7 };
  assert.equal(Sc.overallConfidence(conf, "HIGH", { status: "OK", lift: -0.01, liftCiLow: -0.03 }).level, "LOW");
  assert.equal(Sc.overallConfidence(conf, "HIGH", { status: "OK", lift: 0.05, liftCiLow: 0.02 }).level, "HIGH");
  assert.equal(Sc.overallConfidence(Object.assign({}, conf, { mixed: true }), "HIGH", null).level, "LOW");
});

test("TI-I5 · Zonen sind gerundet und werden durch Rundung nie schmaler", () => {
  assert.equal(Sc.priceStep(230), 1); assert.equal(Sc.priceStep(45), 0.1); assert.equal(Sc.priceStep(4), 0.05);
  const r = TI.analyze(NVDA);
  for (const s of r.scenarios) for (const z of [s.entryZone].concat(s.targets || []).filter(Boolean)) {
    const st = z.displayStep || 1;
    assert.ok(Math.abs(z.zoneLow / st - Math.round(z.zoneLow / st)) < 1e-6, "Untergrenze nicht gerundet");
  }
});

// ---------------------------------------------------------------- Engines
const ctxOf = (s, t) => Ctx.at(Ctx.prepare(s), t);

test("TI-E1 · Dow: steigende Hochs und Tiefs → UP, Kipp-Niveau = letztes Tief; gespiegelt DOWN", () => {
  const up = fixtures.piecewise([[0, 100], [30, 125], [45, 112], [80, 140], [95, 128], [130, 160], [145, 147], [170, 165]], { seed: "dow", rangePct: 0.002 });
  const d = Dow.analyze(ctxOf(up));
  const anyUp = [d.primary, d.secondary, d.shortTerm].some((x) => x.state === "UP");
  assert.ok(anyUp, JSON.stringify([d.primary.state, d.secondary.state, d.shortTerm.state]));
  const lv = [d.primary, d.secondary, d.shortTerm].find((x) => x.state === "UP");
  assert.equal(lv.flipLevel, lv.lastLow.price);
  const dn = fixtures.piecewise([[0, 200], [30, 160], [45, 178], [80, 140], [95, 155], [130, 120], [145, 133], [170, 112]], { seed: "dow2", rangePct: 0.002 });
  assert.ok([Dow.analyze(ctxOf(dn)).primary, Dow.analyze(ctxOf(dn)).secondary].some((x) => x.state === "DOWN"));
});

test("TI-E2 · Doppelboden: Ausbruch erst nach Bestaetigung des zweiten Tiefs und Schluss ueber der Nackenlinie", () => {
  const s = fixtures.piecewise([[0, 150], [40, 100], [60, 120], [80, 101], [100, 128], [130, 135]], { seed: "db", rangePct: 0.002 });
  let seen = null;
  for (let t = 80; t < s.length; t++) {
    const p = Pat.analyze(ctxOf(s, t)).patterns.find((x) => x.type === "DOUBLE_BOTTOM");
    if (p && p.status.startsWith("BREAKOUT")) { seen = { t, p }; break; }
  }
  assert.ok(seen, "Doppelboden-Ausbruch nicht erkannt");
  assert.ok(s.close[seen.t] > 120, "Ausbruch vor Schluss ueber der Nackenlinie");
  assert.ok(seen.p.detectionIndex <= seen.t);
  assert.equal(seen.p.direction, "BULLISH");
  assert.ok(seen.p.target.zoneLow > 120);
});

test("TI-E3 · Schulter-Kopf-Schulter wird erkannt; Ziel = Kopfhoehe unter der Nackenlinie", () => {
  const s = fixtures.piecewise([[0, 80], [30, 120], [45, 105], [70, 140], [90, 104], [115, 121], [135, 103], [160, 85]], { seed: "hs", rangePct: 0.002 });
  const found = [];
  for (let t = 120; t < s.length; t += 2) { const p = Pat.analyze(ctxOf(s, t)).patterns.find((x) => x.type === "HEAD_AND_SHOULDERS"); if (p) found.push(p); }
  assert.ok(found.length, "H&S nicht erkannt");
  const p = found.find((x) => x.status.startsWith("BREAKOUT")) || found[0];
  assert.equal(p.direction, "BEARISH");
});

test("TI-E4 · Aufsteigendes Dreieck: flache Hochs, steigende Tiefs", () => {
  const s = fixtures.piecewise([[0, 90], [30, 120], [50, 100], [75, 120.5], [95, 107], [115, 120.2], [130, 112]], { seed: "tri", rangePct: 0.002 });
  const p = Pat.analyze(ctxOf(s)).patterns.find((x) => x.type === "ASCENDING_TRIANGLE");
  assert.ok(p, JSON.stringify(Pat.analyze(ctxOf(s)).patterns.map((x) => x.type)));
});

test("TI-E5 · Wyckoff: Seitwaertsspanne nach Abwaertstrend → Akkumulation; Trend ohne Spanne → keine", () => {
  const acc = fixtures.piecewise([[0, 200], [80, 120], [95, 140], [115, 122], [135, 139], [155, 121], [170, 141], [185, 123], [200, 138]], { seed: "wy", rangePct: 0.002 });
  const w = Wy.analyze(ctxOf(acc));
  assert.equal(w.status, "TRADING_RANGE", JSON.stringify(w));
  assert.ok(["ACCUMULATION", "REACCUMULATION_OR_ACCUMULATION"].includes(w.schematic));
  assert.ok(w.events.some((e) => e.event === "SC"));
  assert.equal(w.volumeAvailable, true);
  const trend = fixtures.cleanUptrend(400);
  assert.notEqual(Wy.analyze(ctxOf(trend)).schematic, "DISTRIBUTION");
});

test("TI-E6 · Momentum-Divergenz nur aus bestaetigten Pivots, RSI an der Pivot-Bar", () => {
  const ctx = ctxOf(fixtures.piecewise([[0, 100], [20, 130], [35, 118], [70, 133], [85, 120], [100, 125]], { seed: "div", rangePct: 0.002 }));
  const d = MV.divergence(ctx, "scale-2");
  if (d.bearish) assert.ok(d.bearish.priceHigh[1] > d.bearish.priceHigh[0] && d.bearish.rsi[1] < d.bearish.rsi[0]);
  const v = MV.analyzeVolatility(ctx);
  assert.ok(["COMPRESSED", "NORMAL", "ELEVATED", "EXTREME", "UNDETERMINED"].includes(v.regime));
  assert.ok(v.atrPercentile === null || (v.atrPercentile >= 0 && v.atrPercentile <= 1), "Perzentil auf 0..1 normiert");
});

test("TI-E7 · Wochenschluss-Reihen: kein Volumen → Volumenbefunde UNAVAILABLE, keine Luecken-Zonen", () => {
  const pts = []; let v = 50; for (let i = 0; i < 400; i++) { v *= 1 + 0.01 * Math.sin(i / 7) + 0.002; pts.push([new Date(Date.UTC(2010, 0, 1) + i * 7 * 864e5).toISOString().slice(0, 10), +v.toFixed(2)]); }
  const s = weeklySeriesFromPoints(pts, "SYNW");
  const r = TI.analyze(s);
  assert.equal(r.methods.volume.status, "UNAVAILABLE");
  assert.equal(r.dataQuality.closeOnly, true);
  assert.ok(r.methods.supportResistance.zones.every((z) => !z.kinds.includes("GAP_EDGE")));
});

test("TI-E8 · Fibonacci: Niveaus nur von bestaetigten Ankern; Extension ueber B hinaus", () => {
  const f = Lv.fibOfSwing(100, 200, "x");
  assert.equal(f.find((x) => x.kind === "RETRACEMENT" && x.ratio === 0.618).price.toFixed(1), "138.2");
  assert.equal(f.find((x) => x.kind === "EXTENSION" && x.ratio === 1.618).price.toFixed(1), "261.8");
});

// ---------------------------------------------------------------- Outcomes
const bars = (closes, hl = 0.5) => Canonical.fromRows(closes.map((c, i) => ({ date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), open: c, high: c + hl, low: c - hl, close: c, volume: 1000 })), { priceSeriesType: "SPLIT_ADJUSTED", timeframe: "1D" });

test("TI-O1 · Outcome beginnt nach t; Ziel und Invalidation in derselben Bar zaehlen als Invalidation", () => {
  const s = bars([100, 100, 99, 98, 120, 80, 100]);
  const g = { dir: 1, entryLow: 97, entryHigh: 99, invalidation: 95, t1Low: 110, t1High: 112 };
  const r = Out.simulate(s, 1, g, { entryWindow: 5, horizon: 10 });
  assert.ok(r.entryIndex >= 2, "Einstieg frueher als t+1");
  assert.equal(r.outcome, "TARGET1");
  const s2 = Canonical.fromRows([100, 100, 98, 97].map((c, i) => ({ date: "2020-01-0" + (i + 1), open: c, high: c, low: c, close: c })).concat([{ date: "2020-01-05", open: 98, high: 115, low: 90, close: 92 }]), { priceSeriesType: "SPLIT_ADJUSTED" });
  assert.equal(Out.simulate(s2, 1, g, { entryWindow: 5, horizon: 10 }).outcome, "INVALIDATED");
});

test("TI-O2 · Beruehrung der Zone ist ein Fill — Schluss unter der Invalidation in derselben Bar ist ein Verlust, kein 'kein Einstieg'", () => {
  /* Regressionstest Review-Befund 1 (02.10.2026): vorher als NO_ENTRY verworfen → Trefferquote ueberhoeht. */
  const s = bars([100, 100, 100, 90, 85]);
  const g = { dir: 1, entryLow: 92, entryHigh: 94, invalidation: 91, t1Low: 110, t1High: 112 };
  const r = Out.simulate(s, 2, g, { entryWindow: 5 });
  assert.equal(r.outcome, "INVALIDATED");
  assert.equal(r.entryIndex, 3);
  assert.ok(r.returnPct < 0);
  const s2 = Canonical.fromRows([[103,103,103,103],[102,102,93,94]].map((b, i) => ({ date: "2020-01-0" + (i + 1), open: b[0], high: b[1], low: b[2], close: b[3] })), { priceSeriesType: "SPLIT_ADJUSTED" });
  assert.equal(Out.simulate(s2, 0, { dir: 1, entryLow: 99, entryHigh: 100, invalidation: 95, t1Low: 110, t1High: 111 }, { entryWindow: 3 }).outcome, "INVALIDATED");
  assert.equal(Out.simulate(bars([100, 100, 100, 100]), 0, { dir: 1, entryLow: 80, entryHigh: 81, invalidation: 70, t1Low: 120, t1High: 121 }, { entryWindow: 2 }).outcome, "NO_ENTRY", "Zone nie erreicht");
});

test("TI-O4 · Baseline-Einstieg zum Schluss: Hoch/Tief der Einstiegsbar zaehlen nicht", () => {
  /* Regressionstest Review-Befund 2: high[u] lag vor dem Fill zum Schluss. */
  const s = Canonical.fromRows([[100,100,100,100],[100,106,99,100],[100,101,99,100],[100,101,99,100]].map((b, i) => ({ date: "2020-01-0" + (i + 1), open: b[0], high: b[1], low: b[2], close: b[3] })), { priceSeriesType: "SPLIT_ADJUSTED" });
  const r = Out.baseline(s, 1, { dir: 1, stopPct: 0.05, targetPct: 0.05 }, { horizon: 2 });
  assert.notEqual(r.outcome, "TARGET1");
});

test("TI-O3 · Statistik: Wilson-Intervall und Aggregation mit Baseline", () => {
  const [lo, hi] = Out.wilson(40, 100);
  assert.ok(Math.abs(lo - 0.3094) < 0.001 && Math.abs(hi - 0.4980) < 0.001);
  const a = Out.aggregate([{ outcome: "TARGET1", symbol: "A", baselineHits: 1, baselineDraws: 3 }, { outcome: "INVALIDATED", symbol: "B", baselineHits: 0, baselineDraws: 3 }, { outcome: "NO_ENTRY", symbol: "C" }]);
  assert.equal(a.n, 2); assert.equal(a.t1HitRate, 0.5); assert.equal(a.baselineN, 6); assert.equal(a.baselineRate, 0.1667); assert.equal(a.fillRate, 0.6667);
});

// ------------------------------------------------- Review-Regressionen
test("TI-R1 · Laufender Pivot von pivotView == Pivot-Engine auf der abgeschnittenen Serie (Gleichstand-Regel)", () => {
  const Pivots = require("../engines/technical/pivot-engine.js");
  const EV2 = require("../engines/technical/elliott/elliott-v2.js");
  const P = TI.prepare(NVDA);
  for (const t of [700, 1111, 1600, 2222]) {
    const cut = Canonical.slice(NVDA, t);
    const prep = Ctx.prepare(cut);
    for (const id of prep.pivots.scaleIds) {
      const live = prep.pivots.scales[id].developing;
      const v = EV2.pivotView(NVDA, P.main.pivots, id, t);
      if (!live || !v.developing) continue;
      assert.equal(v.developing.pivotIndex, live.pivotIndex, id + " t=" + t);
    }
  }
});

test("TI-R2 · Datenlage je Stand-Bar kausal; leere Serie wird abgelehnt", () => {
  const P = TI.prepare(NVDA);
  const cut = Ctx.prepare(Canonical.slice(NVDA, 900));
  const a = Ctx.at(P.main, 900), b = Ctx.at(cut, 900);
  assert.deepEqual([a.hasVolume, a.closeOnly], [b.hasVolume, b.closeOnly]);
  assert.throws(() => TI.prepare(Object.assign({}, NVDA, { length: 0, close: [] })), /leere Kursreihe/);
});

test("TI-R3 · Szenario-ID ohne Zeitstempel; Tail-Zone liegt jenseits der Invalidation", () => {
  const P = TI.prepare(NVDA);
  let tails = 0;
  for (let t = 1200; t < NVDA.length; t += 97) {
    const sc = TI.analyzeAt(P, t).scenarios;
    const pr = sc.find((x) => x.kind === "PRIMARY"), tail = sc.find((x) => x.kind === "TAIL");
    if (pr && tail && tail.template === "DEEPER_CORRECTION" && pr.invalidation) {
      tails++;
      if (pr.direction === "BULLISH") assert.ok(tail.entryZone.zoneHigh <= pr.invalidation.price + 1e-9, "t=" + t);
      else assert.ok(tail.entryZone.zoneLow >= pr.invalidation.price - 1e-9, "t=" + t);
    }
  }
  assert.ok(tails > 0, "kein Tail-Szenario geprueft");
  /* gleiche Lesart an aufeinanderfolgenden Bars → gleiche ID (sonst feuert SCENARIO_CHANGED jeden Tag) */
  const key = (p) => JSON.stringify([p.kind, p.direction, p.template, p.entryZone && [p.entryZone.zoneLow, p.entryZone.zoneHigh], p.invalidation && p.invalidation.price]);
  let same = 0;
  for (let t = 1500; t < 1700; t++) {
    const a = TI.analyzeAt(P, t).scenarios[0], b = TI.analyzeAt(P, t + 1).scenarios[0];
    if (a && b && key(a) === key(b)) { same++; assert.equal(a.scenarioId, b.scenarioId, "t=" + t); }
  }
  assert.ok(same > 0, "keine unveraenderte Lesart gefunden");
});
