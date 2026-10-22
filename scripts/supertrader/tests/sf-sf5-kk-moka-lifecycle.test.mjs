// Supertrader 5.0 – Kullamaegi Common Breakout (research/kk-breakout-lifecycle.mjs) und Morales / Kacher Pocket Pivot /
// Buyable Gap-Up (research/moka-lifecycle.mjs) auf der gemeinsamen Engine. Golden Cases, Quellgrenzen, PIT, Abstimmung.
// Simuliert nur Research-Trades; kein Kaufsignal, keine Order, keine Statusaufwertung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, KK_RUN_VARIANTS, validateKkConfig, kkBreakoutSetupAt, kkVariantRegistrySha256, KK_SETUP_PROXIES } from '../source-faithful/research/kk-breakout-lifecycle.mjs';
import { POCKET_PIVOT_ADAPTER, BUYABLE_GAP_UP_ADAPTER, PP_REFERENCE_CONFIG, BGU_REFERENCE_CONFIG, PP_RUN_VARIANTS, BGU_RUN_VARIANTS, validatePpConfig, validateBguConfig, sellGuideSeries, mokaVariantRegistrySha256 } from '../source-faithful/research/moka-lifecycle.mjs';
import { sellGuideEvidence } from '../source-faithful/methods/morales-kacher.mjs';
import { breakoutStopCheck, adr20 } from '../source-faithful/methods/kullamagi.mjs';

const PINNED_KK_VARIANTS = '4ce68694eb3182fc6c720297d665077969c7f0d2864dfae39be43d9f1396d491';
const PINNED_MOKA_VARIANTS = '709c00ac75473dfea9b218e3eb134d8746f756ea0c0b68ee3f31ba0413e3e3ca';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const r3 = (k, c, v = 1e6) => bar(k, c, c * 1.015, c * 0.985, c, v);
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const runA = (adapter, ref, d, changes = {}) => runResearchLifecycle(d, { adapter, config: { ...ref, ...changes } });

/** flat 80 sessions, +50 % in 30, tight 10-session consolidation, breakout bar 120 (close 30.9, low 30.4) */
function kkScenario({ breakoutLow = 30.4, tail = null } = {}) {
  const bars = [];
  for (let k = 0; k < 80; k++) bars.push(r3(k, 20));
  for (let k = 80; k < 110; k++) bars.push(r3(k, 20 + (10 * (k - 79)) / 30));
  for (let k = 110; k < 120; k++) bars.push(r3(k, 29.6 + 0.02 * (k - 110)));
  bars.push(bar(120, 29.9, 31, breakoutLow, 30.9));
  (tail ?? [[31, 31.6, 30.9, 31.4], [31.4, 32, 31.2, 31.8], [31.8, 32.6, 31.6, 32.4], [32.4, 33, 32.2, 32.8], [32.8, 33, 31.9, 32.0], [32, 32.2, 30.5, 30.6], [30.6, 30.8, 30.2, 30.4]]).forEach(([o, h, l, c], j) => bars.push(bar(121 + j, o, h, l, c)));
  for (let j = 0; j < 5; j++) bars.push(r3(bars.length, 30.4));
  return { id: 'KK', bars };
}

test('GC-SF5-KK-LIFECYCLE: Tagesausbruch zum Schluss, Stop = Tagestief (KK-012), Teilverkauf 1/3 nach 3 Tagen, Rest Break-even', () => {
  const s = kkScenario(), r = runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(s));
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.entryDate, day(120)); assert.equal(t.entryBasis, 'CLOSE'); assert.equal(t.entryFill, 30.9); assert.equal(t.initialStop, 30.4);
  const sells = t.events.filter((e) => e.type === 'SELL');
  assert.equal(sells[0].date, day(124)); assert.equal(sells[0].reason, 'KK_PARTIAL_AFTER_DAYS'); assert.ok(Math.abs(sells[0].shares - t.shares / 3) < 1e-9);
  assert.equal(t.exitReason, 'STOP_KK-013-BREAKEVEN'); assert.equal(t.exitDate, day(126));
  assert.ok(t.weight <= 0.25 + 1e-9 && t.weight <= 0.30); // KK-001 cap (platform cap stricter)
  assert.ok(t.riskOfEquity <= KK_REFERENCE_CONFIG.sizing.riskFraction + 1e-12);
  assert.equal(r.reconciliation.pass, true); assert.equal(r.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST');
  assert.deepEqual(t.openManualDecisionsSubstituted, ['KK-MR-SETUP', 'KK-MR-LEVEL', 'KK-MR-PRIORITY']);
});

test('GC-SF5-KK-WIDE-STOP-REJECT: Abstand Schluss-Tagestief > ADR20 lehnt ab, kein engerer Ersatzstop (KK-012)', () => {
  const s = kkScenario({ breakoutLow: 28.6 });
  const adr = adr20(s.bars, 120), dist = ((30.9 - 28.6) / 30.9) * 100;
  assert.ok(dist > adr); assert.equal(breakoutStopCheck({ entry: 30.9, lowOfDay: 28.6, adrPct: adr }).status, 'REJECT_WIDE_STOP');
  const r = runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(s));
  assert.ok(!r.trades.some((t) => t.signalDate === day(120))); assert.ok(r.counts.eligibilityBlockers.REJECT_WIDE_STOP >= 1);
});

test('GC-SF5-KK-TRAIL-MA10: ohne Teilverkauf fuehrt der erste Schluss unter MA10 zum Ausstieg zur naechsten Eroeffnung', () => {
  const tail = [[31, 31.6, 30.9, 31.4], [31.4, 32, 31.2, 31.8], [31.8, 32.6, 31.6, 32.4], [32.4, 33, 32.2, 32.8], [32.8, 33.4, 32.6, 33.2], [33.2, 33.5, 33, 33.3], [33.3, 33.4, 31.1, 31.2], [31.3, 31.5, 31, 31.2]];
  const r = runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(kkScenario({ tail })), { exitPolicy: 'NO_PARTIAL_MA10' });
  const t = r.trades[0];
  assert.equal(t.exitReason, 'KK_TRAIL_CLOSE_BELOW_MA10'); assert.equal(t.exitDate, day(128));
  assert.equal(t.events.find((e) => e.type === 'EXIT_SCHEDULED_NEXT_OPEN').date, day(127));
});

test('GC-SF5-KK-NEXT-OPEN: Alternative kauft zur naechsten Eroeffnung; Stop = Ausbruchstag-Tief; Abstand > ADR wird nicht ausgefuehrt', () => {
  const r = runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(kkScenario()), { entryTiming: 'NEXT_OPEN' });
  assert.equal(r.trades[0].entryDate, day(121)); assert.equal(r.trades[0].entryBasis, 'OPEN'); assert.equal(r.trades[0].initialStop, 30.4);
  const gap = kkScenario({ tail: [[33, 33.5, 32.8, 33.2], [33.2, 33.4, 33, 33.1]] }); // open 8.6 % above the breakout-day low
  const g = runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(gap), { entryTiming: 'NEXT_OPEN' });
  assert.ok(!g.trades.some((t) => t.signalDate === day(120))); assert.ok(g.counts.notExecutedPlannedLossAboveMax >= 1);
  assert.ok(g.rejections.some((x) => x.date === day(121) && x.reason === 'NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX'));
});

test('GC-SF5-KK-SETUP-PIT: Setup auf Balken i nutzt nur Balken 0..i (Ergebnis unabhaengig von spaeteren Balken)', () => {
  const s = kkScenario();
  for (let i = 100; i < s.bars.length; i++) assert.deepEqual(kkBreakoutSetupAt(s.bars.slice(0, i + 1), i), kkBreakoutSetupAt(s.bars, i));
  assert.equal(kkBreakoutSetupAt(s.bars, 119), null); // no close above the level before the breakout bar
  assert.equal(kkBreakoutSetupAt(s.bars, 120).level, s.bars.slice(110, 120).reduce((m, b) => Math.max(m, b.high), -Infinity));
  // no prior move: flat history is not a setup
  const flat = { bars: Array.from({ length: 130 }, (_, k) => r3(k, 20 + (k === 129 ? 1 : 0))) };
  assert.equal(kkBreakoutSetupAt(flat.bars, 129, KK_SETUP_PROXIES.NO_MA_CONDITION), null);
});

// ---------------------------------------------------------------- Morales / Kacher

/** uptrend with quiet down days, then a pocket pivot day (bar 120) and a later 50DMA violation */
function ppScenario() {
  const bars = [];
  for (let k = 0; k < 120; k++) { const c = 30 + k * 0.1 + (k % 4 === 3 ? -0.15 : 0); bars.push(bar(k, c - 0.05, c + 0.2, c - 0.2, c, k % 4 === 3 ? 8e5 : 7e5)); }
  bars.push(bar(120, 42, 42.6, 41.9, 42.5, 2e6)); // up day, volume above every down day of the prior ten
  for (let k = 121; k < 160; k++) { const c = 42.5 + (k - 120) * 0.05; bars.push(bar(k, c, c + 0.2, c - 0.2, c)); }
  for (let k = 160; k < 175; k++) { const c = 44.5 - (k - 159) * 0.6; bars.push(bar(k, c + 0.1, c + 0.2, c - 0.3, c)); }
  return { id: 'PP', bars };
}

test('GC-SF5-PP-LIFECYCLE: Pocket Pivot -> Kauf naechste Eroeffnung -> kein Preisstop -> Ausstieg bei MA-Verletzung (Unterschreitung)', () => {
  const s = ppScenario(), r = runA(POCKET_PIVOT_ADAPTER, PP_REFERENCE_CONFIG, ds(s));
  const t = r.trades.find((x) => x.signalDate === day(120));
  assert.ok(t, 'pocket pivot day traded');
  assert.equal(t.entryDate, day(121)); assert.equal(t.entryBasis, 'OPEN'); assert.equal(t.initialStop, null);
  assert.ok(Math.abs(t.weight - 0.10) < 0.002);
  assert.match(t.exitReason, /^MOKA_MA(10|50)_VIOLATION/);
  const set = t.events.find((e) => e.type === 'EXIT_TRIGGER_SET');
  assert.ok(set && set.strict === true && set.date < t.exitDate); // the undercut is on a LATER session than the close below the MA
  assert.equal(r.reconciliation.pass, true);
});

test('GC-SF5-MOKA-GUIDE-EQUIV: Fuehrungslinie je Balken identisch mit sellGuideEvidence (beide Lesarten)', () => {
  const s = ppScenario();
  for (const reading of ['LATER_DAYS', 'NEXT_DAY']) {
    const g = sellGuideSeries(s.bars, reading);
    for (let i = 10; i < s.bars.length; i++) assert.equal(g[i] === 10 ? '10DMA' : '50DMA', sellGuideEvidence(s.bars, i).readings[reading].proposedGuide, `${reading} ${i}`);
  }
});

/** gap day 130: open 2 x ATR above the prior close, volume 3x; later trades through the gap-day low */
function bguScenario(afterGap) {
  const bars = [];
  for (let k = 0; k < 130; k++) { const c = 30 + k * 0.05; bars.push(bar(k, c, c + 0.3, c - 0.3, c)); }
  bars.push(bar(130, 37.8, 38.6, 37.6, 38.4, 3e6));
  afterGap.forEach(([o, h, l, c], j) => bars.push(bar(131 + j, o, h, l, c)));
  return { id: 'BGU', bars };
}

test('GC-SF5-BGU-LIFECYCLE: BGU -> Kauf naechste Eroeffnung -> Stop-Market am Gap-Tagestief (MOKA12-007), Gap durch den Stop zur Eroeffnung', () => {
  const s = bguScenario([[38.5, 39, 38.2, 38.8], [38.8, 39.2, 38.4, 39], [37.2, 37.5, 36.8, 37]]);
  const r = runA(BUYABLE_GAP_UP_ADAPTER, BGU_REFERENCE_CONFIG, ds(s));
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.signalDate, day(130)); assert.equal(t.entryDate, day(131)); assert.equal(t.initialStop, 37.6);
  assert.equal(t.exitDate, day(133)); assert.equal(t.exitReason, 'STOP_INITIAL_GAP_OPEN');
  assert.ok(Math.abs(t.events.find((e) => e.type === 'SELL').price - 37.2 * 0.999) < 1e-9); // open, less 10 bps slippage
  assert.ok(t.riskOfEquity <= 0.01 + 1e-12);
  // open at or below the gap-day low: not executed
  const low = bguScenario([[37.5, 38, 37.4, 37.9]]);
  assert.equal(runA(BUYABLE_GAP_UP_ADAPTER, BGU_REFERENCE_CONFIG, ds(low)).counts.notExecutedAtOrBelowStop, 1);
});

test('GC-SF5-MOKA-NO-SIGNAL-CLOSE-FILL: Einstieg nie am Signaltag (Tagesvolumen erst nach dem Schluss bekannt)', () => {
  const s = ppScenario();
  for (const t of runA(POCKET_PIVOT_ADAPTER, PP_REFERENCE_CONFIG, ds(s), { contextProxy: 'NONE' }).trades) assert.ok(t.entryDate > t.signalDate);
});

test('GC-SF5-KK-MOKA-VARIANTS: vorregistrierte Varianten gueltig und festgeschrieben; Rahmen geprueft', () => {
  for (const v of KK_RUN_VARIANTS) assert.deepEqual(validateKkConfig(v.config), [], v.id);
  for (const v of PP_RUN_VARIANTS) assert.deepEqual(validatePpConfig(v.config), [], v.id);
  for (const v of BGU_RUN_VARIANTS) assert.deepEqual(validateBguConfig(v.config), [], v.id);
  assert.deepEqual(validateKkConfig({ ...KK_REFERENCE_CONFIG, sizing: { mode: 'RISK', riskFraction: 0.02 } }), ['RISK_FRACTION_OUTSIDE_PRINTED_CONTEXT']);
  assert.deepEqual(validatePpConfig({ ...PP_REFERENCE_CONFIG, sizing: { mode: 'RISK', riskFraction: 0.01 } }), ['PP_SIZING_WEIGHT_ONLY']);
  assert.equal(kkVariantRegistrySha256(), PINNED_KK_VARIANTS);
  assert.equal(mokaVariantRegistrySha256(), PINNED_MOKA_VARIANTS);
  assert.equal(KK_BREAKOUT_ADAPTER.sourceMaxPositionWeight, 0.30);
  assert.ok(PLATFORM_RESEARCH_PORTFOLIO_POLICY.maxPositionWeight <= KK_BREAKOUT_ADAPTER.sourceMaxPositionWeight);
});

// ---------------------------------------------------------------- Holy Grail research variant (W-RAS97, owner decision pending)
import { HOLY_GRAIL_RESEARCH_ADAPTER, HG_REFERENCE_CONFIG, HG_RUN_VARIANTS, validateHgConfig, holyGrailSetupSeries, W_RAS97 } from '../source-faithful/research/holy-grail-lifecycle.mjs';
import { holyGrailScreen } from '../source-faithful/methods/holy-grail.mjs';
import { HOLY_GRAIL } from '../source-faithful/contracts/holy-grail.mjs';

/** quiet base, strong impulse (ADX > 30), pullback to the 20 EMA on bar 75, continuation above the impulse high */
function hgScenario() {
  const bars = [];
  for (let k = 0; k < 40; k++) bars.push(bar(k, 20, 20.3, 19.7, 20 + (k % 2 ? 0.1 : -0.1)));
  for (let k = 40; k < 70; k++) { const c = 20 + (k - 39) * 0.6; bars.push(bar(k, c - 0.3, c + 0.4, c - 0.4, c)); }
  for (let k = 70; k < 76; k++) { const c = 38 - (k - 69) * 0.9; bars.push(bar(k, c + 0.3, c + 0.5, c - 0.4, c)); }
  for (let k = 76; k < 96; k++) { const c = 33 + (k - 75) * 0.5; bars.push(bar(k, c - 0.2, c + 0.4, c - 0.3, c)); }
  return { id: 'HG', bars };
}

test('GC-SF5-HG-RESEARCH-VARIANT: Buy-Stop ueber dem Beruehrungsbalken, Stop am Swing-Tief, Ausstieg nach neuem Hoch; Vertrag unveraendert', () => {
  const s = hgScenario(), setups = holyGrailSetupSeries(s.bars);
  const first = [...setups.keys()][0];
  assert.ok(first >= 70, `first touch ${first}`);
  assert.equal(holyGrailScreen(s, { asOfIndex: first }).length, 1); // same touch as the unchanged component
  const r = runResearchLifecycle(ds(s), { adapter: HOLY_GRAIL_RESEARCH_ADAPTER, config: HG_REFERENCE_CONFIG });
  assert.ok(r.trades.length >= 1);
  // the first touch arms a buy stop that is not reached; the order is re-armed at the next touch close (next session only)
  const t = r.trades[0], k = s.bars.findIndex((b) => b.date === t.signalDate), st = setups.get(k);
  assert.ok(st && k >= first); assert.equal(s.bars[k + 1].date, t.entryDate);
  assert.ok(Math.abs(t.orderLevel - (st.touchHigh + 0.01)) < 1e-9); assert.equal(t.initialStop, st.swingLow);
  assert.equal(t.exitReason, 'RAS_NEW_HIGH_EXIT');
  assert.equal(r.label, 'MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT_SOURCE_PENDING'); assert.equal(r.reconciliation.pass, true);
  for (const v of HG_RUN_VARIANTS) assert.deepEqual(validateHgConfig(v.config), []);
  assert.equal(W_RAS97.contractStatusUnchanged, true);
  for (const id of ['RAS-SF-ENTRY', 'RAS-SF-STOP', 'RAS-SF-SIZE']) assert.equal(HOLY_GRAIL.rules.find((x) => x.id === id).status, 'SOURCE_AMBIGUOUS');
});

test('GC-SF5-HG-READINGS: ADX-Lesart und erste Beruehrung sind vorregistrierte Alternativen; Referenz = Vertragskomponente', () => {
  const s = hgScenario();
  const ref = holyGrailSetupSeries(s.bars), first = holyGrailSetupSeries(s.bars, { touches: 'FIRST_TOUCH_ONLY' }), atHigh = holyGrailSetupSeries(s.bars, { adxReading: 'AT_IMPULSE_HIGH' });
  assert.ok(first.size >= 1 && first.size <= ref.size);
  for (const k of first.keys()) assert.ok(ref.has(k) || atHigh.has(k));
  assert.equal([...first.keys()][0], [...ref.keys()][0]); // the first touch is in both
  assert.ok(atHigh.size >= ref.size); // the ADX may fall below 30 during the retracement
  // reference touches equal the unchanged screen
  for (const k of ref.keys()) assert.equal(holyGrailScreen(s, { asOfIndex: k }).length, 1);
});

test('GC-SF5-MOKA-USED-VIOLATION: eine bereits durch Unterschreitung bestaetigte 10DMA-Verletzung kehrt nicht als Ausloeser zurueck (Review SF5-C-M1)', () => {
  // entry with the 50DMA guide; a 10DMA violation is confirmed while the 50DMA guide is active (no sale); later lows
  // below that used level with no new close below the MA10 must not trigger a 10DMA exit after the guide flips to 10
  const bars = [];
  for (let k = 0; k < 66; k++) { const c = 20 + 0.1 * k; bars.push(bar(k, c, c + 0.1, c - 0.1, c)); }
  bars[55] = bar(55, 25.4, 25.5, 24.4, 24.5); bars[56] = bar(56, 24.5, 25.6, 24.3, 25.6);
  bars.push(bar(66, 26.4, 26.5, 25.9, 26.0)); bars.push(bar(67, 26.0, 27.2, 25.8, 27.1));
  for (let k = 68; k < 76; k++) { const c = 27.1 + 0.05 * (k - 67); bars.push(bar(k, c, c + 0.1, c - 0.1, c)); }
  const flat = bars.at(-1).close; for (let k = 76; k < 140; k++) bars.push(bar(k, flat, flat + 0.1, k > 110 ? 25.85 : flat - 0.1, flat));
  const s = { id: 'PP', bars }, guide = sellGuideSeries(bars, 'LATER_DAYS');
  assert.equal(guide[61], 50); assert.ok(guide.some((g, i) => i > 100 && g === 10));
  const ctx = { setups: new Map([[60, { i: 60, date: day(60), evidence: {} }]]), bars, guide }; // injected signal: the exit rule is under test
  const r = runResearchLifecycle(ds(s), { adapter: POCKET_PIVOT_ADAPTER, config: PP_REFERENCE_CONFIG, prepared: new Map([['PP', ctx]]) });
  const t = r.trades[0];
  assert.equal(t.entryDate, day(61));
  assert.ok(!t.events.some((e) => e.type === 'EXIT_TRIGGER_SET' && e.level === 25.9), 'used 10DMA level re-armed');
  assert.notEqual(t.exitReason, 'MOKA_MA10_VIOLATION');
  assert.equal(r.reconciliation.pass, true);
});

test('GC-SF5-KK-DELIST-NO-CLOSE-ENTRY: kein Schlusskurs-Einstieg am Delisting-Tag; Teilverkauf rueckt bei fehlendem Schluss auf den naechsten Balken', () => {
  const s = kkScenario(), del = { ...s, terminal: { date: day(120), cause: 'LISTING_INACTIVE', distress: false, delistClass: 'MERGER' } };
  assert.equal(runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(del)).trades.length, 0);
  const nan = kkScenario(); nan.bars[123] = { ...nan.bars[123], close: NaN };
  const t = runA(KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, ds(nan)).trades[0];
  assert.ok(t.events.some((e) => e.type === 'EXIT_SCHEDULED_NEXT_OPEN' && e.reason === 'KK_PARTIAL_AFTER_DAYS' && e.date === day(124)));
});
