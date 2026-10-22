// Supertrader 5.0 – gemeinsame Lifecycle-Engine (research/lifecycle-engine.mjs) und Darvas Trade Lifecycle
// (research/darvas-lifecycle.mjs). Golden Cases, Aequivalenz zur abgenommenen Komponentenstudie, PIT-Praefixtest,
// Abrechnung. Simuliert nur Research-Trades; kein Kaufsignal, keine Order, keine Statusaufwertung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle, fillOrder, protectiveHit, plannedShares, PLATFORM_RESEARCH_PORTFOLIO_POLICY, runMetricsSF5 } from '../source-faithful/research/lifecycle-engine.mjs';
import { DARVAS_ADAPTER, DARVAS_REFERENCE_CONFIG, DARVAS_RUN_VARIANTS, DARVAS_MODEL_ASSUMPTIONS, validateDarvasConfig, darvasVariantRegistrySha256, darvasBoxSeries } from '../source-faithful/research/darvas-lifecycle.mjs';
import { darvasComponentTrades } from '../source-faithful/methods/darvas.mjs';

// pinned before any snapshot result of the Darvas lifecycle exists
const PINNED_DARVAS_VARIANTS = '6a485e006d5c1b0e1cdcd84aa54ead67559a96f35cbacaa54954f152b87057ee';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const ZERO_COST = { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, slippageBps: 0, commissionBps: 0 };
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const run = (d, changes = {}, extra = {}) => runResearchLifecycle(d, { adapter: DARVAS_ADAPTER, config: { ...DARVAS_REFERENCE_CONFIG, ...changes }, ...extra });

/** rising history to bar 29, box top 72 (bar 30) / bottom 66 complete at bar 35, breakout bar 36, higher box complete
 * at bar 41 (bottom 72.3), stop raised to 72.29 and hit on bar 43; then a flat tail without new boxes */
function textbook(tail = null) {
  const bars = [];
  for (let k = 0; k < 30; k++) { const c = 40 + k; bars.push(bar(k, c - 0.2, c + 0.5, c - 0.5, c)); }
  const rows = tail ?? [[69.5, 72, 69, 71], [70.5, 71, 68, 69], [68.5, 70.5, 66, 67], [67, 70, 67, 68], [68, 69, 67, 68.5], [68.5, 70, 66.5, 69], [72, 73.5, 72, 73.2], [73.2, 73.4, 72.5, 73], [73, 73, 72.3, 72.8], [72.8, 72.9, 72.6, 72.7], [72.7, 73, 72.5, 72.8], [72.8, 73.2, 72.4, 73], [73, 73, 72.4, 72.6], [72.35, 72.5, 72, 72.1]];
  rows.forEach(([o, h, l, c], j) => bars.push(bar(30 + j, o, h, l, c)));
  for (let j = 0; j < 8; j++) bars.push(bar(bars.length, 70.5, 71, 70, 70.5));
  return { id: 'DAR', bars };
}

test('GC-SF5-DAR-LIFECYCLE: Box komplett -> Buy-Stop naechste Sitzung -> Stop unter neuer Box angehoben -> Stopp-Ausstieg; abgestimmt', () => {
  const s = textbook(), r = run(ds(s), {}, { policy: ZERO_COST });
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.signalDate, day(35)); assert.equal(t.entryDate, day(36)); // DAR-Q3: no waiting after the box is complete
  assert.equal(t.entryBasis, 'INTRADAY_LEVEL_TOUCH'); assert.ok(Math.abs(t.entryFill - 72.01) < 1e-9);
  assert.ok(Math.abs(t.initialStop - 71.99) < 1e-9); // DAR-SF-STOP-INIT: a fraction below the broken top
  const raise = t.events.find((e) => e.type === 'STOP_RAISED');
  assert.equal(raise.date, day(41)); assert.ok(Math.abs(raise.stop - 72.29) < 1e-9); assert.equal(raise.effectiveFrom, 'next session');
  assert.equal(t.exitDate, day(43)); assert.equal(t.exitReason, 'STOP_DAR-SF-STOP-RAISE');
  assert.deepEqual(t.openManualDecisionsSubstituted, ['DAR-MR-SELECTION', 'DAR-MR-VOLUME', 'DAR-MR-MARKET', 'DAR-MR-SIZING']);
  assert.equal(r.reconciliation.pass, true); assert.equal(r.endingPositionCheck.status, 'PASS');
  assert.equal(r.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST'); assert.equal(r.tradability, 'NOT_A_TRADABLE_STRATEGY'); assert.equal(r.orders, false);
  assert.ok(Math.abs(t.weight - 0.10) < 0.001); // MA-DAR-SIZING reference
});

test('GC-SF5-DAR-ATH-BLOCK: Box unter einem frueheren Hoch wird nicht gehandelt (DAR-SF-ATH)', () => {
  const s = textbook(), i = 35, setup = DARVAS_ADAPTER.signalAt(darvasBoxSeries(s) && { ...darvasBoxSeries(s), bars: s.bars }, i);
  assert.equal(setup.top, 72); assert.equal(setup.athThroughBar, 72);
  assert.equal(DARVAS_ADAPTER.eligibility({ setup, bars: s.bars, i }).state, 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW');
  const el = DARVAS_ADAPTER.eligibility({ setup: { ...setup, athThroughBar: 80 }, bars: s.bars, i });
  assert.equal(el.state, 'ENTRY_BLOCKED'); assert.equal(el.blockers[0].code, 'NOT_ALL_TIME_HIGH_IN_HISTORY'); assert.equal(el.order, null);
  assert.equal(el.buyDeclarationAllowed, false);
});

test('GC-SF5-DAR-ENTRY-BAR-STOP: Ausbruchsbalken mit Tief unter dem Stop - pessimistisch Ausstieg, optimistisch gehalten; Gap-Fill sicher', () => {
  const rows = [[69.5, 72, 69, 71], [70.5, 71, 68, 69], [68.5, 70.5, 66, 67], [67, 70, 67, 68], [68, 69, 67, 68.5], [68.5, 70, 66.5, 69], [71.5, 73.5, 71.5, 73.2], [73.2, 73.4, 72.5, 73]];
  const amb = textbook(rows);
  const p = run(ds(amb), {}, { policy: ZERO_COST }), o = run(ds(amb), { intrabarOrder: 'OPTIMISTIC' }, { policy: ZERO_COST });
  assert.equal(p.trades[0].exitReason, 'STOP_SAME_BAR_ASSUMED'); assert.equal(p.trades[0].exitDate, day(36));
  assert.notEqual(o.trades[0].exitDate, day(36)); assert.equal(o.counts.sameBarStopAmbiguousIgnored, 1);
  // gap: open 72.5 above the trigger, low 71.9 below the stop after the open -> certain
  const gap = textbook([...rows.slice(0, 6), [72.5, 73.5, 71.9, 73.2], [73.2, 73.4, 72.5, 73]]);
  const g = run(ds(gap), { intrabarOrder: 'OPTIMISTIC' }, { policy: ZERO_COST });
  assert.equal(g.trades[0].entryBasis, 'OPEN_GAP_AT_OR_ABOVE_LEVEL'); assert.equal(g.trades[0].entryFill, 72.5); assert.equal(g.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN');
});

/** deterministic pseudo-random walk with regimes, enough to form many boxes */
function walk(seed, n = 700, start = 30) {
  let x = seed >>> 0; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
  const bars = []; let c = start;
  for (let k = 0; k < n; k++) {
    const drift = Math.sin(k / 60) * 0.004 + 0.0008, o = c * (1 + (rnd() - 0.5) * 0.02);
    c = Math.max(6, o * (1 + drift + (rnd() - 0.5) * 0.04));
    const h = Math.max(o, c) * (1 + rnd() * 0.015), l = Math.min(o, c) * (1 - rnd() * 0.015);
    bars.push(bar(k, +o.toFixed(2), +h.toFixed(2), +l.toFixed(2), +c.toFixed(2), 2e6));
  }
  return bars;
}

test('GC-SF5-DAR-EQUIV-COMPONENT: ohne Kosten und Kapitalgrenze identisch mit der abgenommenen Komponentenstudie (darvasComponentTrades)', () => {
  let compared = 0;
  for (const seed of [1, 7, 42, 99, 2024, 31337]) {
    const s = { id: `W${seed}`, bars: walk(seed) };
    const comp = darvasComponentTrades(s).filter((t) => t.entryDate >= s.bars[20].date);
    const r = run(ds(s), {}, { policy: ZERO_COST });
    assert.equal(r.trades.length, comp.length, `seed ${seed}`);
    r.trades.forEach((t, k) => {
      const c = comp[k];
      assert.equal(t.entryDate, c.entryDate); assert.ok(Math.abs(t.entryFill - c.entryFill) < 1e-9);
      assert.equal(t.exitDate, c.exitDate);
      if (c.exitFill !== null) { const sell = t.events.find((e) => e.type === 'SELL'); assert.ok(Math.abs(sell.price - c.exitFill) < 1e-9, `seed ${seed} trade ${k}`); }
      assert.equal(t.events.filter((e) => e.type === 'STOP_RAISED').length, c.stopRaises);
    });
    compared += comp.length;
    assert.equal(r.reconciliation.pass, true);
  }
  assert.ok(compared >= 20, `compared ${compared}`);
});

test('GC-SF5-DAR-PIT-PREFIX: Entscheidungen bis Sitzung m haengen nicht von spaeteren Balken ab (kein Lookahead)', () => {
  const full = { id: 'P', bars: walk(5, 600) };
  const a = run(ds(full), {}, { policy: ZERO_COST });
  for (const m of [250, 400, 520]) {
    const cut = { id: 'P', bars: full.bars.slice(0, m) }, b = run(ds(cut), {}, { policy: ZERO_COST });
    const before = (r) => r.trades.filter((t) => t.entryDate < day(m)).map((t) => [t.entryDate, t.entryFill, t.events.filter((e) => e.date < day(m)).map((e) => [e.date, e.type, e.stop ?? e.price ?? null])]);
    assert.deepEqual(before(b), before(a), `cut ${m}`);
    assert.deepEqual(b.curve, a.curve.slice(0, m));
  }
});

test('GC-SF5-ENGINE-FILL: Buy-Stop, Gap, Limit-Ablehnung, Stop am/unter Fill; Schutzstufen nehmen die hoechste erreichte', () => {
  const b = (o, h, l, c) => ({ date: '2020-01-02', open: o, high: h, low: l, close: c, volume: 1 });
  assert.equal(fillOrder(b(9, 9.5, 8.8, 9.2), { type: 'BUY_STOP', level: 10, stop: 9 }).status, 'NOT_TRIGGERED');
  assert.deepEqual(fillOrder(b(9.8, 10.5, 9.7, 10.2), { type: 'BUY_STOP', level: 10, stop: 9 }).fill, 10);
  assert.equal(fillOrder(b(10.6, 11, 10.5, 10.8), { type: 'BUY_STOP', level: 10, stop: 9 }).basis, 'OPEN_GAP_AT_OR_ABOVE_LEVEL');
  assert.equal(fillOrder(b(10.6, 11, 10.5, 10.8), { type: 'ON_OPEN', stop: 9, maxPlannedLoss: 0.1 }).status, 'NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX');
  assert.equal(fillOrder(b(8.9, 9.1, 8.5, 9), { type: 'ON_OPEN', stop: 9 }).status, 'NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP');
  assert.equal(fillOrder({ ...b(10, 10.5, 9.5, 10), synthetic: true }, { type: 'ON_OPEN', stop: 9 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
  const pos = { stop: 9, stopReason: 'STOP_INITIAL', trigger: { level: 9.5, strict: true, reason: 'MA_VIOLATION' } };
  assert.deepEqual(protectiveHit(pos, b(10, 10.2, 9.4, 9.8)), { fill: 9.5, reason: 'MA_VIOLATION' });
  assert.equal(protectiveHit(pos, b(10, 10.2, 9.5, 9.8)), null); // strict undercut: an equal low does not trigger
  assert.deepEqual(protectiveHit(pos, b(8.5, 8.8, 8.4, 8.6)), { fill: 8.5, reason: 'MA_VIOLATION_GAP_OPEN' });
  assert.deepEqual(plannedShares({ sizing: { mode: 'RISK', riskFraction: 0.01 }, fill: 10, stop: 9.9, equity: 1e5, policy: PLATFORM_RESEARCH_PORTFOLIO_POLICY }).cappedByMaxWeight, true);
  assert.equal(plannedShares({ sizing: { mode: 'WEIGHT', weight: 0.1 }, fill: 10, stop: null, equity: 1e5, policy: PLATFORM_RESEARCH_PORTFOLIO_POLICY, sourceMaxPositionWeight: 0.05 }).shares, 500);
});

test('GC-SF5-ENGINE-PORTFOLIO: Positionsgrenze, Kapitalgrenze, neutrale Reihenfolge, Determinismus, Abstimmung ueber viele Titel', () => {
  const secs = Array.from({ length: 40 }, (_, k) => ({ id: `S${String(k).padStart(2, '0')}`, bars: walk(1000 + k, 500) }));
  const d = ds(...secs);
  const c = { intrabarOrder: 'OPTIMISTIC', sizing: { mode: 'WEIGHT', weight: 0.2 } }, a = run(d, c), b = run(d, c);
  assert.deepEqual(a.ledger, b.ledger);
  assert.equal(a.reconciliation.pass, true);
  const maxPos = Math.max(...a.curve.map((p) => p.positions));
  assert.ok(maxPos > 1 && maxPos <= PLATFORM_RESEARCH_PORTFOLIO_POLICY.maxOpenPositions);
  assert.ok(a.counts.rejectInsufficientCapital + a.counts.cappedByCash > 0); // 20 % weight: capital binds
  assert.ok(Math.min(...a.curve.map((p) => p.equity - p.equity * p.exposure)) > -1e-6); // cash never negative
  for (const t of a.trades) assert.ok(t.weight <= 0.25 + 1e-9);
  const m = runMetricsSF5(a);
  assert.ok(m.lifecycle.closedTrades > 0); assert.equal(m.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST');
});

test('GC-SF5-ENGINE-DELIST-STALE: Delisting nach research-v1-Szenario, fehlende Balken nach Stale-Grenze', () => {
  const s = textbook(); const lastHeld = day(38);
  const del = { ...s, bars: s.bars.slice(0, 39), terminal: { date: lastHeld, cause: 'LISTING_INACTIVE', distress: false, delistClass: 'MERGER' } };
  const r = run(ds(del), {}, { policy: ZERO_COST });
  assert.equal(r.trades[0].exitReason, 'TERMINAL_DELISTED'); assert.equal(r.reconciliation.pass, true);
  const other = { id: 'Z', bars: walk(3, 60) }; // the calendar continues without bars of the held security
  const st = run(ds({ ...s, bars: s.bars.slice(0, 39) }, other), {}, { policy: ZERO_COST });
  assert.equal(st.trades.find((t) => t.id === 'DAR').exitReason, 'SECURITY_UNAVAILABLE');
});

test('GC-SF5-DAR-VARIANTS: vorregistrierte Varianten gueltig, Referenz unveraendert, Konfiguration ausserhalb des Rahmens abgelehnt', () => {
  for (const v of DARVAS_RUN_VARIANTS) assert.deepEqual(validateDarvasConfig(v.config), [], v.id);
  assert.deepEqual(validateDarvasConfig({ ...DARVAS_REFERENCE_CONFIG, sizing: { mode: 'WEIGHT', weight: 0.4 } }), ['SIZING_OUTSIDE_RESEARCH_RANGE']);
  assert.deepEqual(validateDarvasConfig({ ...DARVAS_REFERENCE_CONFIG, manualSubstitute: 'NONE' }), ['MANUAL_SUBSTITUTE_REQUIRED']);
  assert.equal(darvasVariantRegistrySha256(), PINNED_DARVAS_VARIANTS);
  assert.ok(DARVAS_MODEL_ASSUMPTIONS.every((m) => m.id.startsWith('MA-DAR-') && m.reference && m.why));
  // the AFTER_TOP_CONFIRMED reading changes boxes, not the machine (DAR-SF-BOTTOM-START is SOURCE_AMBIGUOUS)
  const s = { id: 'W', bars: walk(11) };
  assert.ok(darvasBoxSeries(s).boxes > 0 && darvasBoxSeries(s, { bottomSearchStart: 'AFTER_TOP_CONFIRMED' }).boxes > 0);
});
