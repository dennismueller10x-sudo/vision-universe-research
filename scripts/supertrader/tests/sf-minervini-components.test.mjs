// Minervini SEPA / VCP und Power Play: mechanische Komponenten (methods/minervini-components.mjs).
// Golden Cases und adversariale Faelle, synthetisch. Kein Kaufsignal, keine Wachstumsschwelle, keine erfundene Volumenregel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRsPercentileProxy, fundamentalEvidence, vcpContractions, pivotBreakout, positionSize, sellEvidence, sepaClassify, powerPlayClassify, MINERVINI_COMPONENTS_VERSION } from '../source-faithful/methods/minervini-components.mjs';
import { sepaScreen, powerPlayScreen, MINERVINI_VERSION } from '../source-faithful/methods/minervini.mjs';

const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const mk = (closes, vols = null, range = 0.002) => closes.map((c, k) => ({ date: day(k), open: c, high: c * (1 + range), low: c * (1 - range), close: c, volume: vols ? vols[k] : 1e6, rawClose: c, rawVolume: vols ? vols[k] : 1e6, splitAdj: 1 }));
/** piecewise linear path through [index, price] knots */
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };

// uptrend to 100 at 260, then three contractions 20 % -> 10 % -> 5 % (a textbook VCP footprint)
const VCP = path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95]]);
const vcpVol = VCP.map((_, k) => (k <= 260 ? 2e6 : k <= 284 ? 1.5e6 : k <= 300 ? 1e6 : 5e5));

test('GC-MIN-VCP-CONTRACTIONS: drei Kontraktionen 20/10/5 % von links nach rechts, sinkendes Volumen, Pivot am letzten Swing-Hoch', () => {
  const b = mk(VCP, vcpVol), i = b.length - 1, v = vcpContractions(b, i);
  assert.equal(v.status, 'EVIDENCE_ONLY'); assert.equal(v.gate, false);
  assert.equal(v.count, 3);
  assert.deepEqual(v.contractions.map((c) => Math.round(c.depth * 100)), [20, 10, 5]);
  assert.equal(v.contractingLeftToRight, true);
  assert.ok(v.depthRatios.every((r) => r > 0.4 && r < 0.6), 'roughly halving');
  assert.ok(v.lastContractionVolumeVs50d < 1 && v.driestDayVolumeVs50d < 1);
  assert.equal(v.pivot.date, day(300));
  assert.equal(v.translationUnverified, true);
});

test('ADV-MIN-VCP-EXPANDING: sich ausweitende Kontraktionen bleiben Evidenz (kein Gate, keine erfundene Zaehlregel)', () => {
  const b = mk(path([[0, 40], [260, 100], [266, 95], [276, 99], [290, 85], [300, 97], [315, 75], [320, 80]]));
  const v = vcpContractions(b, b.length - 1);
  assert.equal(v.contractingLeftToRight, false);
  assert.equal(v.status, 'EVIDENCE_ONLY');
  assert.equal(vcpContractions(b, 100).status, 'INSUFFICIENT_HISTORY');
  const gap = mk(VCP); gap[300] = { ...gap[300], high: NaN };
  assert.equal(vcpContractions(gap, gap.length - 1).status, 'MISSING_DATA');
});

test('GC-MIN-PIVOT-VOLUME: Pivot-Ausbruch meldet beide Lesarten von "zunehmendem Volumen", waehlt keine', () => {
  const closes = [...VCP, 97.5], vols = [...vcpVol, 1.8e6], b = mk(closes, vols);
  const pv = vcpContractions(b, b.length - 2).pivot.level;
  const r = pivotBreakout(b, b.length - 1, pv);
  assert.equal(r.status, 'PIVOT_REACHED'); assert.equal(r.gate, false);
  assert.equal(r.referenceFill, Math.max(b.at(-1).open, pv));
  assert.equal(r.volume.increasingVsPriorSession, true);
  assert.ok(r.volume.vs50dMean > 1);
  const quiet = mk(closes, [...vcpVol, 1e5]);
  const q = pivotBreakout(quiet, quiet.length - 1, pv);
  assert.equal(q.status, 'PIVOT_REACHED'); // price first (MIN-MM-VOL-EX); volume is judged, not gated
  assert.equal(q.volume.increasingVs50d, false);
  assert.equal(pivotBreakout(b, b.length - 1, 1e9).status, 'BELOW_PIVOT');
});

test('GC-MIN-FUNDAMENTALS-PIT: nur vor dem Tag eingereichte Quartale; YoY-Wachstum, negative Basis, abgeleitetes Q4; keine Schwelle', () => {
  const fund = { eps: [['2020-03-31', 1.0, '2020-05-01', 0], ['2020-06-30', -0.5, '2020-08-01', 0], ['2020-12-31', 0.9, '2021-02-20', 1], ['2021-03-31', 1.5, '2021-05-01', 0], ['2021-06-30', 0.8, '2021-08-01', 0]], rev: [['2020-03-31', 100, '2020-05-01', 0], ['2021-03-31', 130, '2021-05-01', 0]] };
  const a = fundamentalEvidence(fund, '2021-07-01');
  assert.equal(a.gate, false);
  assert.ok(Math.abs(a.eps.latestYoy - 0.5) < 1e-12);
  assert.ok(Math.abs(a.revenue.latestYoy - 0.3) < 1e-12);
  assert.equal(a.eps.quarters.find((q) => q.quarterEnd === '2020-12-31').derivedQ4, true);
  // filed on the session date: not yet visible (could be after the close)
  assert.equal(fundamentalEvidence(fund, '2021-08-01').eps.quarters[0].quarterEnd, '2021-03-31');
  const c = fundamentalEvidence(fund, '2021-08-02');
  assert.equal(c.eps.quarters[0].status, 'NEGATIVE_OR_ZERO_BASE'); assert.equal(c.eps.latestYoy, null);
  assert.equal(fundamentalEvidence(null, '2021-01-01').status, 'NO_PIT_FUNDAMENTALS');
  assert.equal(fundamentalEvidence(fund, '2020-04-01').status, 'NO_QUARTER_FILED_BEFORE_DATE');
  assert.doesNotMatch(JSON.stringify(a), /"pass"|threshold/);
});

test('GC-MIN-RS-PROXY-PIT: VU-Perzentil des PIT-Universums; nie Gate; spaetere Daten aendern nichts', () => {
  const mkS = (id, g, n = 300) => ({ id, bars: mk(Array.from({ length: n }, (_, k) => 20 * (1 + g) ** k)) });
  const ds = { securities: [mkS('A', 0.001), mkS('B', 0.002), mkS('C', 0.003), mkS('D', -0.001), mkS('PENNY', 0.01, 300)] };
  ds.securities[4].bars = mk(Array.from({ length: 300 }, (_, k) => 0.5 * 1.01 ** (k / 100)));
  const p = createRsPercentileProxy(ds), d = day(280);
  assert.equal(p.at('C', d).proxy.vuPercentile, 100); assert.equal(p.at('D', d).proxy.vuPercentile, 0);
  assert.equal(p.at('C', d).gate, false); assert.equal(p.at('C', d).status, 'DATA_BLOCKED_IBD_RS');
  assert.equal(p.at('PENNY', d).proxy.vuPercentile, null); // below the research-universe price floor
  const future = { securities: ds.securities.map((s) => ({ ...s, bars: s.bars.map((b, k) => (k > 280 ? { ...b, close: b.close * 5 } : b)) })) };
  assert.deepEqual(createRsPercentileProxy(future).at('B', d), p.at('B', d));
  assert.equal(p.at('A', day(100)).proxy.vuPercentile, null); // fewer than 252 sessions
});

test('GC-MIN-SIZING: Groesse aus Reviewer-Risiko und Stop, Deckel 25 %, 10-%-Flag; kein Default-Risiko', () => {
  assert.equal(positionSize({ equity: 1e5, entry: 50, stop: 47 }).status, 'RISK_FRACTION_REQUIRED');
  const s = positionSize({ equity: 1e5, riskFraction: 0.01, entry: 50, stop: 47 });
  assert.equal(s.shares, 333); assert.equal(s.cappedByMaxWeight, false); assert.equal(s.stopCheck.exceedsMaxPlannedLoss, false);
  const tight = positionSize({ equity: 1e5, riskFraction: 0.02, entry: 50, stop: 49.5 });
  assert.equal(tight.shares, 500); assert.equal(tight.cappedByMaxWeight, true); assert.ok(Math.abs(tight.weight - 0.25) < 1e-12);
  assert.equal(positionSize({ equity: 1e5, riskFraction: 0.01, entry: 50, stop: 40 }).stopCheck.exceedsMaxPlannedLoss, true);
  assert.equal(positionSize({ equity: 1e5, riskFraction: 0.01, entry: 50, stop: 55 }).status, 'INVALID_INPUT');
});

test('GC-MIN-STOP-EXECUTION: gesetzter Stop wird unabhaengig vom Volumen ausgefuehrt; 3R und MA50 sind Review-Fragen', () => {
  const b = mk(path([[0, 50], [80, 50], [100, 70]]));
  const hold = sellEvidence(b, 100, { entry: 55, stop: 50 });
  assert.equal(hold.status, 'HOLD_REVIEW'); assert.ok(hold.rMultiple >= 3);
  assert.ok(hold.reviewQuestions.some((q) => q.rule === 'MIN-RISK-05'));
  const crash = [...b.slice(0, 101), { ...b[100], date: day(101), open: 60, high: 61, low: 48, close: 49, volume: 1 }];
  const ex = sellEvidence(crash, 101, { entry: 55, stop: 50 });
  assert.equal(ex.status, 'STOP_EXIT'); assert.equal(ex.stopExit.fill, 50);
  const gapDown = [...b.slice(0, 101), { ...b[100], date: day(101), open: 45, high: 46, low: 44, close: 45 }];
  assert.equal(sellEvidence(gapDown, 101, { entry: 55, stop: 50 }).stopExit.fill, 45);
});

test('GC-MIN-SEPA-CLASSIFY: Trend Template ist Screen, keine Strategie; Komponentenstatus getrennt', () => {
  const sec = { id: 'V', bars: mk(VCP, vcpVol), fund: { eps: [['2019-03-31', 1, '2019-05-01', 0], ['2019-09-30', 2, '2019-11-01', 0]] } };
  const i = sec.bars.length - 1;
  const c = sepaClassify(sec, i);
  assert.equal(c.classification, 'MECHANICAL_SCREEN_PASS');
  assert.equal(c.status, 'MANUAL_REVIEW_REQUIRED'); assert.equal(c.buyDeclarationAllowed, false);
  assert.equal(c.components.relativeStrength.state, 'DATA_BLOCKED_IBD_RS');
  assert.equal(c.components.entry.state, 'MANUAL');
  assert.equal(c.components.fundamentals.value.status, 'EVIDENCE_ONLY');
  assert.equal(sepaClassify(sec, 100).classification, 'IPO_SCOPE_REVIEW');
  const down = { id: 'D', bars: mk(Array.from({ length: 300 }, (_, k) => 200 - k * 0.3)) };
  assert.equal(sepaClassify(down, 299).classification, 'NOT_QUALIFIED');
  // the existing screen is unchanged
  assert.equal(sepaScreen(sec).length, 1); assert.equal(MINERVINI_VERSION, 'sf-minervini-1.0.0');
});

// Power Play: 100 flat sessions, +120 % in 30 sessions on rising volume, then a consolidation
const pp = (consolidation, { flat = 100 } = {}) => {
  const closes = [...Array(flat).fill(10), ...path([[0, 10], [30, 22]]).slice(1), ...consolidation];
  const vols = closes.map((_, k) => (k > flat && k <= flat + 30 ? 3e6 : 1e6));
  return { id: 'PP', bars: mk(closes, vols) };
};
const cons = (lowFrac, n = 15) => path([[0, 21.8], [Math.floor(n / 2), 22 * (1 - lowFrac)], [n - 1, 21.5]]);

test('GC-MIN-PP-CLASSES: bestaetigt mechanisch / manuell / datenblockiert / nicht qualifiziert', () => {
  const ok = pp(cons(0.07)), i = ok.bars.length - 1;
  const a = powerPlayClassify(ok, i);
  assert.equal(a.classification, 'CONFIRMED_MECHANICAL_SETUP', JSON.stringify(a.reasons));
  assert.equal(a.status, 'MANUAL_REVIEW_REQUIRED'); assert.equal(a.buyDeclarationAllowed, false);
  assert.ok(a.openManualQuestions.some((q) => q.flag === 'MIN-MR-PP-VOLUME'), 'strong start volume stays a judgment');
  assert.equal(a.evidence.stopReference.exceeds10pct, false);
  assert.equal(powerPlayClassify(pp(cons(0.15)), i).classification, 'MANUAL_REVIEW_SETUP');
  assert.deepEqual(powerPlayClassify(pp(cons(0.22)), i).reasons, ['CORRECTION_IN_PRINTED_RANGE_20_25', 'NOT_TIGHT_VCP_CHARACTERISTICS_REVIEW']);
  assert.equal(powerPlayClassify(pp(cons(0.3)), i).classification, 'NOT_QUALIFIED');
  const young = pp(cons(0.07), { flat: 20 });
  const y = powerPlayClassify(young, young.bars.length - 1);
  assert.equal(y.classification, 'DATA_BLOCKED_SETUP'); assert.deepEqual(y.dataGaps, ['RUN_START_VOLUME_HISTORY_UNAVAILABLE']);
  const hole = pp(cons(0.07)); hole.bars[i - 3] = { ...hole.bars[i - 3], low: NaN };
  assert.equal(powerPlayClassify(hole, i).classification, 'DATA_BLOCKED_SETUP');
  const slow = { id: 'S', bars: mk(path([[0, 10], [200, 22], [215, 21.5]])) };
  assert.equal(powerPlayClassify(slow, 215).classification, 'NOT_QUALIFIED');
  // consistency with the unchanged screen: classified setups are exactly the screen's records
  for (const s of [ok, pp(cons(0.15)), pp(cons(0.3))]) assert.equal(powerPlayScreen(s, { asOfIndex: i }).length > 0, powerPlayClassify(s, i).classification !== 'NOT_QUALIFIED');
  assert.match(MINERVINI_COMPONENTS_VERSION, /^sf-minervini-components-/);
});

test('ADV-MIN-PP-LONG-BASE: Konsolidierung jenseits 3-6 Wochen wird Review, nie Ablehnung', () => {
  const s = pp(path([[0, 21.8], [20, 20.5], [44, 21.6]])), i = s.bars.length - 1;
  const r = powerPlayClassify(s, i);
  assert.equal(r.classification, 'MANUAL_REVIEW_SETUP');
  assert.ok(r.reasons.includes('CONSOLIDATION_BEYOND_TYPICAL_DURATION'));
});
