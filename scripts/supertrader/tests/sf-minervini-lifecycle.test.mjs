// Supertrader 4.0 – Minervini Trade Lifecycle (research/minervini-lifecycle.mjs, minervini-execution.mjs,
// minervini-trade-view.mjs). Golden Cases und adversariale Faelle, synthetisch. Simuliert nur Research-Trades; kein
// Kaufsignal, keine Order, keine Statusaufwertung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { variantRegistrySha256, sepaSetupAt, sepaSetupSeries, powerPlaySetupAt, powerPlaySetupSeries, entryEligibility, fillBuyOrder, validateConfig, REFERENCE_CONFIG, RUN_VARIANTS, MODEL_ASSUMPTIONS, EXIT_POLICIES } from '../source-faithful/research/minervini-lifecycle.mjs';
import { buildSetupIndex, runMinerviniLifecycle, runMetrics, lifecycleMetrics, EQUITY_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/minervini-execution.mjs';
import { tradeView } from '../source-faithful/research/minervini-trade-view.mjs';
import { fundamentalEvidence } from '../source-faithful/research/minervini-components.mjs';

// pinned before the first snapshot result of the lifecycle was read (review SF4-S-Q5)
const PINNED_VARIANT_REGISTRY_SHA256 = 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mk = (closes, vols = null, range = 0.002) => closes.map((c, k) => bar(k, c, c * (1 + range), c * (1 - range), c, vols ? vols[k] : 1e6));
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };
const cfg = (changes = {}) => ({ ...REFERENCE_CONFIG, ...changes });

// textbook VCP (20 / 10 / 5 %), setup armed at the close of bar 324: pivot 96.192, structure stop 91.0176, limit 101.13
const VCP = path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95], [330, 97], [340, 120], [400, 130]]);
const VOL = VCP.map((_, k) => (k <= 260 ? 2e6 : k <= 284 ? 1.5e6 : k <= 300 ? 1e6 : k <= 330 ? 5e5 : 3e6));
const ARM = 324, PIVOT = 96.192, STOP = 91.0176;
/** VCP history up to the armed close, then explicit bars (open, high, low, close) and an optional continuation */
const scenario = (id, tail, cont = 20) => {
  const bars = mk(VCP.slice(0, ARM + 1), VOL.slice(0, ARM + 1));
  tail.forEach(([o, h, l, c, v = 1e6], j) => bars.push(bar(ARM + 1 + j, o, h, l, c, v)));
  const last = bars.at(-1).close; for (let j = 0; j < cont; j++) bars.push(bar(bars.length, last, last * 1.002, last * 0.998, last));
  return { id, bars };
};
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const run = (d, strategy = 'SEPA', changes = {}, extra = {}) => runMinerviniLifecycle(d, { strategy, setupIndex: buildSetupIndex(d, strategy), config: cfg(changes), ...extra });

// Power Play: flat history, +125 % in 30 sessions, tight 15-session consolidation, breakout
const PP = path([[0, 20], [80, 20], [110, 45], [125, 44.2], [126, 46], [150, 52]]);
const PP_WIDE = path([[0, 20], [80, 20], [110, 45], [118, 35], [125, 44], [126, 46], [150, 52]]);

test('GC-MLC-SEPA-LIFECYCLE: VCP-Setup -> Einstieg am Pivot -> Break-even bei 3R -> offen am Datenende; Buchung abgestimmt', () => {
  const s = { id: 'VCP', bars: mk(VCP, VOL) };
  assert.equal(sepaSetupAt(s, ARM).state, 'SETUP_DETECTED');
  assert.ok(Math.abs(sepaSetupAt(s, ARM).pivot - PIVOT) < 1e-9 && Math.abs(sepaSetupAt(s, ARM).stopStructure - STOP) < 1e-9);
  const r = run(ds(s));
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.entryDate, day(ARM + 1)); assert.equal(t.signalDate, day(ARM));
  assert.equal(t.entryBasis, 'INTRADAY_PIVOT_TOUCH'); assert.ok(Math.abs(t.entryFill - PIVOT) < 1e-9);
  assert.ok(t.riskOfEquity <= REFERENCE_CONFIG.riskFraction + 1e-12 && t.weight <= 0.25);
  assert.ok(t.events.some((e) => e.type === 'STOP_RAISED_BREAKEVEN'));
  assert.equal(t.status, 'OPEN_AT_DATA_END'); assert.equal(t.exitReason, null); assert.ok(t.unrealizedPnl > 0);
  assert.equal(r.reconciliation.pass, true); assert.equal(r.endingPositionCheck.status, 'PASS');
  assert.equal(r.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST');
  assert.deepEqual(t.openManualDecisionsSubstituted, ['MIN-MR-PRIORITY', 'MIN-MR-QUALITY', 'MIN-MR-VCP', 'MIN-MR-RS']);
});

test('GC-MLC-PP-LIFECYCLE: bestaetigtes Power Play wird nur ueber eigene Eligibility gehandelt; MANUAL_REVIEW_SETUP nie', () => {
  const s = { id: 'PP', bars: mk(PP) };
  const st = powerPlaySetupAt(s, 124);
  assert.equal(st.state, 'CONFIRMED_MECHANICAL_SETUP');
  const r = run(ds(s), 'POWER_PLAY');
  assert.equal(r.trades.length, 1); assert.equal(r.trades[0].entryDate, day(126)); // bar 125 stays below the pivot
  assert.ok(r.trades[0].plannedLoss <= 0.1);
  const w = { id: 'PPW', bars: mk(PP_WIDE) };
  assert.equal(powerPlaySetupAt(w, 124).state, 'MANUAL_REVIEW_SETUP');
  const rw = run(ds(w), 'POWER_PLAY');
  assert.equal(rw.trades.length, 0); assert.ok(rw.counts.eligibilityBlockers.MANUAL_REVIEW_SETUP > 0);
  // the product view never upgrades a confirmed setup to a buy
  const v = tradeView({ strategy: 'POWER_PLAY', security: s, i: 124 });
  assert.equal(v.setup.state, 'SETUP_CONFIRMED_MECHANICAL'); assert.equal(v.entry.state, 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW');
  assert.equal(v.manualReviewRequired, true); assert.equal(v.buyDeclarationAllowed, false); assert.equal(v.tradability, 'NOT_A_TRADABLE_STRATEGY');
});

test('ADV-MLC-BREAKOUT-NO-VOLUME: Ausbruch ohne Volumenbestaetigung - Referenz kauft auf Preis (MIN-MM-VOL-EX), Volumen-Variante nicht', () => {
  const quiet = scenario('Q', [[95, 97, 94.9, 96.6, 2e5]]);
  assert.equal(run(ds(quiet)).trades.length, 1);
  assert.equal(run(ds(quiet), 'SEPA', { entryTiming: 'NEXT_OPEN_AFTER_VOLUME_CONFIRMED_CLOSE' }).trades.length, 0);
  const loud = scenario('L', [[95, 97, 94.9, 96.6, 3e6], [96.7, 97.5, 96.5, 97.2]]);
  const r = run(ds(loud), 'SEPA', { entryTiming: 'NEXT_OPEN_AFTER_VOLUME_CONFIRMED_CLOSE' });
  assert.equal(r.trades.length, 1); assert.equal(r.trades[0].entryDate, day(ARM + 2)); assert.equal(r.trades[0].entryBasis, 'OPEN');
});

test('ADV-MLC-PIVOT-BEFORE-CONTRACTIONS: ein noch nicht bestaetigter Swing ist kein Pivot; ueberschrittener Pivot armiert nichts', () => {
  const s = { id: 'V', bars: mk(VCP, VOL) };
  // bars 325..331 already traded at or above the pivot: no fresh pivot
  assert.equal(sepaSetupAt(s, 327).state, 'PIVOT_ALREADY_EXCEEDED');
  // the base high at bar 260 is not yet a confirmed swing on bars 261..264 (+-5 sessions): no pivot, no order
  for (const i of [261, 262, 263]) assert.equal(sepaSetupAt(s, i).state, 'PIVOT_NOT_CONFIRMED');
  assert.equal(sepaSetupAt(s, 300).state, 'SETUP_DETECTED'); // once the contractions are confirmed
  const el = entryEligibility({ strategy: 'SEPA', setup: sepaSetupAt(s, 327), bars: s.bars, k: 328 });
  assert.equal(el.state, 'ENTRY_BLOCKED'); assert.equal(el.order, null);
});

test('ADV-MLC-PLANNED-LOSS: Stop mehr als 10 % unter dem Pivot blockiert (MIN-MM-STOP-02); Stop vor Einstieg Pflicht (MIN-RISK-01)', () => {
  const s = { id: 'V', bars: mk(VCP, VOL) };
  const st = sepaSetupAt(s, 302); // pivot 98.2 with the 88.0 contraction low: 10.4 %
  const el = entryEligibility({ strategy: 'SEPA', setup: st, bars: s.bars, k: 303 });
  assert.ok(el.blockers.some((b) => b.code === 'PLANNED_LOSS_ABOVE_10PCT' && b.rule === 'MIN-MM-STOP-02'));
  const el10 = entryEligibility({ strategy: 'SEPA', setup: st, bars: s.bars, k: 303, cfg: cfg({ stopPlacement: 'MAX_PLANNED_LOSS_10' }) });
  assert.ok(!el10.blockers.some((b) => b.code === 'PLANNED_LOSS_ABOVE_10PCT'));
  const noStop = entryEligibility({ strategy: 'SEPA', setup: { ...st, stopStructure: null }, bars: s.bars, k: 303 });
  assert.ok(noStop.blockers.some((b) => b.code === 'NO_STOP_BELOW_PIVOT' && b.rule === 'MIN-RISK-01'));
});

test('ADV-MLC-GAP-OVER-ENTRY: Gap ueber Limit nicht ausgefuehrt, Gap im Rahmen zur Eroeffnung, Limit nach Gap, Markt-Variante markiert Risiko', () => {
  const above = run(ds(scenario('A', [[103, 104, 102, 103.5]])));
  assert.equal(above.trades.length, 0); assert.equal(above.counts.notExecutedAboveLimit, 1);
  const gap = run(ds(scenario('G', [[98, 99, 97.5, 98.5]])));
  assert.equal(gap.trades[0].entryBasis, 'OPEN_GAP_AT_OR_ABOVE_PIVOT'); assert.equal(gap.trades[0].entryFill, 98);
  const lim = run(ds(scenario('L', [[103, 104, 100, 101.5]])));
  assert.equal(lim.trades[0].entryBasis, 'LIMIT_FILL_AFTER_OPEN'); assert.ok(Math.abs(lim.trades[0].plannedLoss - 0.1) < 1e-9);
  const mkt = run(ds(scenario('M', [[103, 104, 102, 103.5]])), 'SEPA', { orderType: 'BUY_STOP_MARKET' });
  assert.equal(mkt.trades[0].entryFill, 103); assert.equal(mkt.trades[0].plannedLossExceedsMax, true); assert.equal(mkt.counts.plannedLossExceededFills, 1);
});

test('ADV-MLC-GAP-THROUGH-STOP: Eroeffnung unter dem Stop -> Ausstieg zur Eroeffnung (MIN-MM-STOP-01, volumenunabhaengig)', () => {
  const r = run(ds(scenario('S', [[95, 97, 94.8, 96.5], [88, 89, 87, 88.5, 1e4]])));
  const t = r.trades[0];
  assert.equal(t.exitReason, 'STOP_INITIAL'); assert.equal(t.exitDate, day(ARM + 2));
  assert.ok(Math.abs(t.events.find((e) => e.type === 'SELL').price - 88 * (1 - 0.001)) < 1e-9);
  assert.ok(t.rMultiple < -1); // the gap makes the loss larger than the planned 1R
});

test('ADV-MLC-ENTRY-AND-STOP-SAME-BAR: Intraday-Pivot + Tief unter Stop mehrdeutig (Variante entscheidet); Gap-Fill eindeutig', () => {
  const amb = scenario('X', [[95, 97, 90.5, 92]]);
  const p = run(ds(amb));
  assert.equal(p.trades[0].exitReason, 'STOP_SAME_BAR_ASSUMED'); assert.equal(p.counts.sameBarStopAmbiguousExecuted, 1);
  const o = run(ds(amb), 'SEPA', { intrabarOrder: 'OPTIMISTIC' });
  assert.notEqual(o.trades[0].exitDate, day(ARM + 1)); assert.equal(o.counts.sameBarStopAmbiguousIgnored, 1);
  const cert = scenario('C', [[97, 97.5, 90, 91.5]]);
  for (const r of [run(ds(cert)), run(ds(cert), 'SEPA', { intrabarOrder: 'OPTIMISTIC' })]) { assert.equal(r.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN'); assert.equal(r.counts.sameBarStopCertain, 1); }
});

test('ADV-MLC-NOT-EXECUTABLE-ORDER: fehlender Balken oder fehlende Eroeffnung -> keine Ausfuehrung, kein Ersatzpreis', () => {
  const s = scenario('N', [[NaN, 97, 94.8, 96.5]]);
  const r = run(ds(s));
  assert.equal(r.trades.length, 0); assert.equal(r.counts.notExecutedNoSourceBar, 1);
  assert.equal(fillBuyOrder(undefined, { type: 'BUY_STOP_LIMIT', level: 10, stop: 9, limit: 10 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
  assert.equal(fillBuyOrder({ ...bar(0, 10, 10.5, 9.9, 10), synthetic: true }, { type: 'BUY_STOP_LIMIT', level: 10, stop: 9, limit: 10 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
});

test('ADV-MLC-SIZE-ZERO-AND-CAPITAL: Groesse null, unzureichendes Kapital, Positionsgrenze, 25-%-Deckel', () => {
  const zero = run(ds(scenario('Z', [[95, 97, 94.8, 96.5]])), 'SEPA', {}, { policy: { ...EQUITY_RESEARCH_PORTFOLIO_POLICY, initialCapital: 50 } });
  assert.equal(zero.trades.length, 0); assert.equal(zero.counts.rejectSizeZero, 1);
  const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => scenario(id, [[95, 97, 94.8, 96.5]]));
  const r = run(ds(...six));
  assert.equal(r.trades.length, 5); assert.equal(r.counts.cappedByCash, 1); assert.equal(r.counts.rejectInsufficientCapital, 1);
  assert.deepEqual(r.trades.map((t) => t.id), ['A', 'B', 'C', 'D', 'E']); // MA-MIN-SIGNAL-ORDER: security id
  assert.ok(r.trades.every((t) => t.weight <= 0.25 + 1e-12));
  assert.ok(r.curve.every((p) => p.equity > 0)); assert.equal(r.reconciliation.pass, true);
  const lim = run(ds(...six.slice(0, 3)), 'SEPA', {}, { policy: { ...EQUITY_RESEARCH_PORTFOLIO_POLICY, maxOpenPositions: 2 } });
  assert.equal(lim.trades.length, 2); assert.equal(lim.counts.rejectMaxPositions, 1);
  assert.throws(() => run(ds(six[0]), 'SEPA', {}, { policy: { ...EQUITY_RESEARCH_PORTFOLIO_POLICY, maxPositionWeight: 0.5 } }), /MAX_POSITION_WEIGHT_ABOVE_SOURCE_BOUND/);
});

test('ADV-MLC-EXIT-PRECEDENCE: geplanter Ausstieg zur Eroeffnung vor Stop; MA50 erst nach Einstand; Freeroll halbiert', () => {
  // up to > 3R, then a close below MA50 and a gap below the break-even stop on the next open
  const tail = [[95, 97, 94.8, 96.5], ...Array.from({ length: 20 }, (_, j) => { const c = 97 + j * 1.2; return [c, c + 0.3, c - 0.3, c]; })];
  const base = scenario('E', tail, 0);
  const ma = base.bars.slice(-50).reduce((a, b) => a + b.close, 0) / 50;
  const down = { ...base, bars: [...base.bars, bar(base.bars.length, ma * 0.99, ma * 0.995, 97, 97.5), bar(base.bars.length + 1, 90, 91, 89, 90), bar(base.bars.length + 2, 90, 91, 89, 90)] };
  const r = run(ds(down));
  const t = r.trades[0];
  assert.equal(t.exitReason, 'MA50_CLOSE_EXIT'); // the scheduled open exit precedes the break-even stop on the gap bar
  assert.ok(t.events.findIndex((e) => e.type === 'STOP_RAISED_BREAKEVEN') < t.events.findIndex((e) => e.type === 'EXIT_SCHEDULED_NEXT_OPEN'));
  const fr = run(ds(down), 'SEPA', { exitPolicy: 'FREEROLL_2R' });
  const sells = fr.trades[0].events.filter((e) => e.type === 'SELL');
  assert.equal(sells[0].reason, 'FREEROLL_PARTIAL_HALF'); assert.ok(Math.abs(sells[0].shares - fr.trades[0].shares / 2) < 1e-9);
  assert.equal(fr.trades[0].exitReason, 'STOP_BREAKEVEN_OR_BETTER');
  assert.equal(fr.reconciliation.pass, true);
});

test('ADV-MLC-HALT-AND-MISSING-BARS: Handelsaussetzung -> Bewertung zum letzten Schluss, nach 5 Sitzungen SECURITY_UNAVAILABLE; Luecke im Setup-Fenster blockiert', () => {
  const s = scenario('H', [[95, 97, 94.8, 96.5]], 0);
  const ref = { id: 'REF', bars: Array.from({ length: s.bars.length + 12 }, (_, k) => bar(k, 3, 3.01, 2.99, 3)) }; // calendar carrier, outside the universe
  const r = run(ds(s, ref));
  assert.equal(r.trades[0].exitReason, 'SECURITY_UNAVAILABLE'); assert.equal(r.counts.unavailableSettlements, 1);
  const gap = { id: 'G', bars: mk(VCP, VOL).map((b, k) => (k === 200 ? { ...b, high: NaN, low: NaN } : b)) };
  assert.equal(sepaSetupAt(gap, ARM).state, 'DATA_BLOCKED');
  assert.equal(run(ds(gap)).trades.length, 0);
});

test('ADV-MLC-DELISTING: wirtschaftliches Delisting zum research-v1-Szenario; Datenluecke ist kein Delisting', () => {
  const s = scenario('D', [[95, 97, 94.8, 96.5], [96, 96.5, 95.5, 96]], 0);
  s.terminal = { date: s.bars.at(-1).date, cause: 'LISTING_INACTIVE', distress: false, delistClass: null };
  const r = run(ds(s));
  assert.equal(r.trades[0].exitReason, 'TERMINAL_DELISTED'); assert.equal(r.counts.terminalSettlements, 1); assert.equal(r.reconciliation.pass, true);
  const g = scenario('DG', [[95, 97, 94.8, 96.5], [96, 96.5, 95.5, 96]], 0); g.terminal = { date: g.bars.at(-1).date, cause: 'DATA_GAP', distress: false };
  assert.equal(run(ds(g)).trades[0].status, 'OPEN_AT_DATA_END');
});

test('ADV-MLC-CORPORATE-ACTION: split-bereinigte Reihe skaliert -> gleiche R-Multiples und Renditen (eine Preiswahrheit)', () => {
  const a = scenario('S', [[95, 97, 94.8, 96.5], [93, 93.5, 88, 89]]);
  const half = { id: 'S', bars: a.bars.map((b) => ({ ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2, volume: b.volume * 2, splitAdj: 2 })) };
  const ta = run(ds(a)).trades[0], tb = run(ds(half)).trades[0];
  assert.equal(ta.exitReason, tb.exitReason);
  assert.ok(Math.abs(ta.rMultiple - tb.rMultiple) < 1e-9 && Math.abs(ta.returnPct - tb.returnPct) < 1e-9);
});

test('ADV-MLC-DUPLICATE-SIGNALS: offene Position -> kein zweites Signal; doppelte Wertpapier-ID bricht ab', () => {
  const s = { id: 'V', bars: mk(VCP, VOL) };
  const el = entryEligibility({ strategy: 'SEPA', setup: sepaSetupAt(s, ARM), bars: s.bars, k: ARM + 1, hasPosition: true });
  assert.ok(el.blockers.some((b) => b.code === 'POSITION_OPEN_DUPLICATE_SIGNAL'));
  const r = run(ds(s));
  assert.equal(r.trades.length, 1);
  assert.throws(() => run({ calendar: s.bars.map((b) => b.date), securities: [s, { ...s }] }), /DUPLICATE_SECURITY_ID/);
});

test('ADV-MLC-FUNDAMENTALS-AND-RS: fehlende oder verspaetete Fundamentaldaten und fehlender RS-Proxy werden ausgewiesen, nie ersetzt', () => {
  const s = { id: 'V', bars: mk(VCP, VOL) };
  const v = tradeView({ strategy: 'SEPA', security: s, i: ARM });
  const codes = v.dataQuality.map((d) => d.code);
  assert.ok(codes.includes('FUNDAMENTALS_MISSING') && codes.includes('IBD_RS_DATA_BLOCKED') && codes.includes('RS_PROXY_UNAVAILABLE') && codes.includes('TRANSLATION_UNVERIFIED'));
  // a filing on the decision day is not yet visible (publication lag), the next day it is
  const fund = { eps: [['2019-06-30', 1, day(ARM), 0], ['2018-06-30', 0.5, '2018-08-01', 0]], rev: [] };
  assert.equal(fundamentalEvidence(fund, day(ARM)).eps.quarters[0].quarterEnd, '2018-06-30');
  assert.equal(fundamentalEvidence(fund, day(ARM + 1)).eps.quarters[0].quarterEnd, '2019-06-30');
  const withFund = tradeView({ strategy: 'SEPA', security: { ...s, fund }, i: ARM + 1 });
  assert.ok(!withFund.dataQuality.some((d) => d.code === 'FUNDAMENTALS_MISSING'));
  // fundamentals are never a gate of the entry (MIN-PROCESS-15): the eligibility is identical with and without
  assert.equal(tradeView({ strategy: 'SEPA', security: { ...s, fund }, i: ARM }).entry.state, v.entry.state);
  assert.equal(v.positionSize.status, 'RISK_FRACTION_REQUIRED');
  assert.equal(tradeView({ strategy: 'SEPA', security: s, i: ARM, reviewerRiskFraction: 0.01, equity: 1e5 }).positionSize.status, 'SIZED');
});

test('SF4-VIEW-SIMULATED-NOT-A-POSITION: simulierte Trades sind nie Depotpositionen; Ausstiegsgrund lesbar', () => {
  const r = run(ds(scenario('S', [[95, 97, 94.8, 96.5], [88, 89, 87, 88.5]])));
  const v = tradeView({ strategy: 'SEPA', security: scenario('S', [[95, 97, 94.8, 96.5], [88, 89, 87, 88.5]]), i: ARM + 2, simulatedTrade: r.trades[0] });
  assert.equal(v.position.status, 'SIMULATED_CLOSED'); assert.equal(v.position.exitLabel, 'Initialer Stop');
  assert.equal(v.isPortfolioPosition, false); assert.equal(v.simulatedResearchOnly, true); assert.match(v.position.label, /nur Research-Simulation/);
  assert.equal(v.performanceClaim, 'NONE');
});

test('SF4-DETERMINISM: Wiederholung und permutierte Eingabe liefern identische Ledger, Trades und Kurve', () => {
  const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => scenario(id, [[95, 97, 94.8, 96.5]]));
  const a = run(ds(...six)), b = run(ds(...six)), c = run(ds(...[...six].reverse()));
  for (const x of [b, c]) { assert.deepEqual(x.ledger, a.ledger); assert.deepEqual(x.trades, a.trades); assert.deepEqual(x.curve, a.curve); }
});

test('SF4-NO-LOOKAHEAD: spaetere Balken aendern keine Entscheidung und keine Buchung bis zum Schnitt', () => {
  const full = scenario('P', [[95, 97, 94.8, 96.5], [96, 97, 95.5, 96.8], [88, 89, 87, 88.5]]);
  const cut = day(ARM + 2);
  const alt = { id: 'P', bars: full.bars.map((b) => (b.date > cut ? { ...b, open: b.open * 1.5, high: b.high * 1.5, low: b.low * 1.5, close: b.close * 1.5 } : b)) };
  const ra = run(ds(full)), rb = run(ds(alt));
  assert.deepEqual(ra.ledger.filter((x) => x.date <= cut), rb.ledger.filter((x) => x.date <= cut));
  assert.deepEqual(ra.curve.filter((x) => x.date <= cut), rb.curve.filter((x) => x.date <= cut));
  // setup series never read bars after i
  const sa = sepaSetupSeries(full).setups.get(ARM), sb = sepaSetupSeries(alt).setups.get(ARM);
  assert.deepEqual(sa, sb);
});

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const randomSeries = (seed, n, { drift = 0.001, vol = 0.02, gaps = 0.002, jumps = 0 } = {}) => {
  const r = rng(seed); let c = 20; const out = [];
  for (let k = 0; k < n; k++) {
    c *= 1 + drift + vol * (r() - 0.5) * 2 + (jumps && r() < jumps ? 0.25 : 0);
    const h = c * (1 + 0.02 * r()), l = c * (1 - 0.02 * r()), o = l + (h - l) * r();
    const b = bar(k, o, h, l, c, 1e6 * (0.5 + r()));
    out.push(r() < gaps ? { ...b, high: NaN, low: NaN } : b);
  }
  return out;
};

test('SF4-SEPA-SERIES-EQUIVALENCE: Vorfilter aendert kein Ergebnis gegenueber trendTemplate + vcpContractions je Balken', () => {
  let hits = 0;
  for (const [seed, drift] of [[1, 0.002], [2, 0.0015], [3, 0], [4, 0.003], [5, -0.001]]) {
    const s = { id: `R${seed}`, bars: randomSeries(seed, 700, { drift }) };
    const series = sepaSetupSeries(s);
    for (let i = 0; i < s.bars.length; i++) {
      const naive = sepaSetupAt(s, i);
      if (naive.state === 'SETUP_DETECTED') { hits++; assert.deepEqual(series.setups.get(i), naive, `seed ${seed} bar ${i}`); } else assert.equal(series.setups.has(i), false, `seed ${seed} bar ${i}`);
    }
    const naiveCounts = {}; for (let i = 0; i < s.bars.length; i++) { const st = sepaSetupAt(s, i).state; naiveCounts[st] = (naiveCounts[st] || 0) + 1; }
    assert.deepEqual(series.counts, naiveCounts);
  }
  assert.ok(hits > 0, 'the random series must produce setups');
});

test('SF4-PP-SERIES-EQUIVALENCE: exakter Power-Play-Vorfilter gleich powerPlayClassify je Balken (inkl. Luecken)', () => {
  let hits = 0;
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const s = { id: `P${seed}`, bars: randomSeries(seed, 500, { drift: 0.001, vol: 0.03, gaps: 0.004, jumps: 0.03 }) };
    const series = powerPlaySetupSeries(s), counts = {};
    for (let i = 0; i < s.bars.length; i++) {
      const naive = powerPlaySetupAt(s, i); counts[naive.state] = (counts[naive.state] || 0) + 1;
      if (naive.state !== 'NOT_QUALIFIED' && Number.isFinite(naive.pivot)) { hits++; assert.deepEqual(series.setups.get(i), naive, `seed ${seed} bar ${i}`); } else assert.equal(series.setups.has(i), false, `seed ${seed} bar ${i}`);
    }
    assert.deepEqual(series.counts, counts);
  }
  assert.ok(hits > 0, 'the random series must produce Power Play setups');
});

test('GC-MLC-NOT-A-STRATEGY: Varianten vorregistriert, keine Aktivierung, Konfiguration fail-closed, Kennzeichnung je Ausgabe', () => {
  assert.equal(RUN_VARIANTS[0].id, 'REF'); assert.deepEqual(RUN_VARIANTS[0].config, { ...REFERENCE_CONFIG });
  assert.ok(RUN_VARIANTS.every((v) => validateConfig(v.config).length === 0));
  assert.ok(MODEL_ASSUMPTIONS.every((m) => m.reference && m.why));
  assert.deepEqual(validateConfig({ ...REFERENCE_CONFIG, manualSubstitute: undefined }), ['MANUAL_SUBSTITUTE_REQUIRED']);
  assert.deepEqual(validateConfig({ ...REFERENCE_CONFIG, riskFraction: 0.05 }), ['RISK_FRACTION_OUTSIDE_RESEARCH_RANGE']);
  // no automatic upgrade of manual or data-blocked Power Play setups (MA-MIN-PP-ELIGIBLE-CLASSES)
  assert.deepEqual(validateConfig({ ...REFERENCE_CONFIG, ppClasses: ['CONFIRMED_MECHANICAL_SETUP', 'MANUAL_REVIEW_SETUP'] }), ['PP_CLASSES_CONFIRMED_ONLY']);
  // pre-registration: the reference and the variants are frozen; a change needs an owner decision and a new pin
  assert.equal(variantRegistrySha256(), PINNED_VARIANT_REGISTRY_SHA256);
  assert.ok(Object.keys(EXIT_POLICIES).length === 4);
  const s = { id: 'V', bars: mk(VCP, VOL) };
  assert.throws(() => runMinerviniLifecycle(ds(s), { strategy: 'SEPA', setupIndex: buildSetupIndex(ds(s), 'POWER_PLAY'), config: REFERENCE_CONFIG }), /SETUP_INDEX_STRATEGY_MISMATCH/);
  const r = run(ds(s));
  assert.equal(r.orders, false); assert.equal(r.performanceClaim, 'NONE'); assert.equal(r.tradability, 'NOT_A_TRADABLE_STRATEGY');
  assert.ok(r.trades.every((t) => t.simulatedResearchOnly && t.tradability === 'NOT_A_TRADABLE_STRATEGY'));
  const el = entryEligibility({ strategy: 'SEPA', setup: sepaSetupAt(s, ARM), bars: s.bars, k: ARM + 1 });
  assert.equal(el.buyDeclarationAllowed, false); assert.equal(el.order.simulatedOnly, true);
  const m = runMetrics(r);
  assert.equal(m.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST'); assert.equal(m.diagnostic.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
  assert.equal(lifecycleMetrics([{ status: 'CLOSED', pnl: -1, rMultiple: -1, exitDate: '2020-01-01', tradeId: 1, heldSessions: 3 }, { status: 'CLOSED', pnl: -2, rMultiple: -1, exitDate: '2020-01-02', tradeId: 2, heldSessions: 3 }]).maxConsecutiveLosses, 2);
});
