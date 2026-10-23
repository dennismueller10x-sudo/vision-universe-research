/**
 * Supertrader 5.0 – shared research lifecycle engine (signal -> order -> fill -> stop -> management -> exit -> research-v1
 * accounting) for the methods whose trade lifecycle is assembled in research/*-lifecycle.mjs (Darvas, Kullamaegi Common
 * Breakout, Morales / Kacher Pocket Pivot and Buyable Gap-Up). Simulated only: no broker, no order, no live path.
 *
 * The engine carries no method rule. Each method supplies an ADAPTER that keeps its own source fidelity:
 *  - prepare(security, cfg)            per-security precomputation; must be causal bar by bar (bar i uses bars 0..i);
 *  - signalAt(ctx, i, cfg)             setup known at the CLOSE of bar i (or null);
 *  - eligibility({ ctx, setup, bars, i, cfg }) -> { state, blockers, order, openManualDecisions }; order:
 *        { type: 'BUY_STOP', level, stop, levelOnBar?(bar) }   resting buy stop for session i + 1 only;
 *        { type: 'ON_OPEN', stop, maxPlannedLoss? }              buy at the open of session i + 1;
 *        { type: 'ON_CLOSE', stop }                              buy at the close of bar i itself (closing auction);
 *    stop may be null when the method has no initial price stop (the exit is then a management rule);
 *  - onClose(pos, ctx, i, api, cfg)    management at the close of a held bar: api.raiseStop, api.setTrigger,
 *                                      api.scheduleExit (all effective from the next session, never the same bar).
 * Platform research portfolio policy (PLATFORM_RESEARCH_PORTFOLIO_POLICY) is a VU convention shared by every method:
 * cash only, start capital, costs, neutral fill order (minervini-execution#fillRank), open-position cap. It is kept
 * apart from every original strategy; a source bound (e.g. KK-001 30 %) is checked against it, never replaced by it.
 *
 * Day loop (deterministic, one pass over the calendar; information of bar k is used only from bar k on):
 *  1. held positions on bar k: dividend; a pending next-open exit fills at the open; the protective levels (stop and an
 *     optional management trigger) fill at min(open, highest level reached); then onClose (effective from k + 1);
 *  2. orders armed at the close of k - 1 fill on bar k in the neutral order, sized from the equity of the prior close;
 *     a stop reached on the entry bar is CERTAIN after an open fill and AMBIGUOUS after an intraday touch
 *     (cfg.intrabarOrder decides); then onClose of the entry bar;
 *  3. economic delisting (LISTING_INACTIVE) by the research-v1 terminal scenario; 4. marks and the stale limit;
 *  5. setups at the close of k: ON_CLOSE orders fill at this close, all others are armed for k + 1.
 * Precedence on one bar (declared): next-open exit > protective levels > close rules; a full exit dominates a partial.
 */
import * as AC from '../../validation/accounting-contract.mjs';
import { SCENARIOS } from '../../validation/portfolio.mjs';
import { fin, eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';
import { computeDiagnosticMetrics } from '../runner/metrics.mjs';
import { fillRank, lifecycleMetrics } from './minervini-execution.mjs';

export const ENGINE_VERSION = 'sf5-lifecycle-engine-1.0.0';
export const NOT_A_STRATEGY_SF5 = Object.freeze({ tradability: 'NOT_A_TRADABLE_STRATEGY', performanceClaim: 'NONE', liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED' });
export const STUDY_LABEL = Object.freeze({ MODEL: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST' });

/**
 * Platform research portfolio policy (VU convention, identical numbers to the Supertrader 4.0 Minervini policy so that
 * methods stay comparable). maxPositionWeight 0.25 is a platform cap, not a source rule; a method with a stricter source
 * cap passes it as sourceMaxPositionWeight and the engine applies the smaller one.
 */
export const PLATFORM_RESEARCH_PORTFOLIO_POLICY = Object.freeze({
  id: 'VU-SF5-EQUITY-RESEARCH-PORTFOLIO', version: '1.0.0', separateFromOriginalStrategy: true,
  initialCapital: 100000, cashOnly: true, maxPositionWeight: 0.25, maxOpenPositions: 20,
  slippageBps: 10, commissionBps: 1, terminalScenario: 'S0_LAST_PRICE',
  notModelled: Object.freeze(['a source cap per position (e.g. KK-001 30 %) is applied at the entry; a held position that grows above it is not trimmed', 'pyramiding / adds (manual in every source)', 'exposure scaling by market condition (manual or proprietary)', 'exit liquidity: participation is reported, not limited', 'short side (no borrow history)']),
});

/** Sizing (model assumption of each method): RISK = fraction of equity at risk to the initial stop; WEIGHT = fixed weight. */
export function plannedShares({ sizing, fill, stop, equity, policy, sourceMaxPositionWeight = null }) {
  const cap = Math.min(policy.maxPositionWeight, sourceMaxPositionWeight ?? Infinity);
  const byWeightCap = Math.floor((cap * equity) / fill + 1e-9);
  let planned;
  if (sizing.mode === 'RISK') {
    if (!fin(stop) || !(fill > stop)) return { shares: 0, reason: 'NO_RISK_TO_STOP' };
    planned = Math.floor((equity * sizing.riskFraction) / (fill - stop) + 1e-9);
  } else if (sizing.mode === 'WEIGHT') planned = Math.floor((equity * sizing.weight) / fill + 1e-9);
  else throw new Error('UNKNOWN_SIZING');
  return { shares: Math.min(planned, byWeightCap), cappedByMaxWeight: byWeightCap < planned, cap };
}

/**
 * Fill of a research buy order on one daily bar. BUY_STOP: open at or above the level fills at the open (gap), else
 * a high at or above the level fills at the level; ON_OPEN fills at the open. A fill at or below the stop is not
 * executed; a planned loss above order.maxPlannedLoss is not executed (rejection, never a tighter stop).
 * INTRADAY_RESOLVED (Kullamaegi C09, research/kk-ep-lifecycle.mjs): the adapter resolves the day from REAL minute bars
 * in time order (fill, stop known at the fill minute, same-day stop decided by the later minutes); its own source
 * checks (e.g. KK-034) are part of the resolution. Any other status is a counted non-execution.
 */
export function fillOrder(bar, order) {
  if (!AC.isExecutableBar(bar, 'open') || !fin(bar.high) || !fin(bar.low)) return { status: 'NOT_EXECUTED_NO_SOURCE_BAR' };
  let fill, basis;
  if (order.type === 'INTRADAY_RESOLVED') {
    const r = order.resolve(bar);
    if (!r || r.status === 'NOT_TRIGGERED') return { status: 'NOT_TRIGGERED', resolution: r ?? null };
    if (r.status !== 'FILLED') return { status: r.status, resolution: r };
    return { status: 'FILLED', fill: r.fill, basis: 'INTRADAY_MINUTE', plannedLoss: 1 - r.stop / r.fill, stop: r.stop, sameBarStop: r.sameDayStop ?? null, sameBarExitFill: r.sameDayExitFill ?? null, resolution: r };
  }
  if (order.type === 'ON_OPEN') { fill = bar.open; basis = 'OPEN'; }
  else if (order.type === 'BUY_STOP') {
    const level = order.levelOnBar ? order.levelOnBar(bar) : order.level;
    if (!(bar.high >= level)) return { status: 'NOT_TRIGGERED' };
    if (bar.open >= level) { fill = bar.open; basis = 'OPEN_GAP_AT_OR_ABOVE_LEVEL'; } else { fill = level; basis = 'INTRADAY_LEVEL_TOUCH'; }
  } else throw new Error('UNKNOWN_ORDER_TYPE');
  if (fin(order.stop) && !(fill > order.stop)) return { status: 'NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP', fill };
  const plannedLoss = fin(order.stop) ? 1 - order.stop / fill : null;
  if (fin(order.maxPlannedLoss) && plannedLoss > order.maxPlannedLoss + 1e-12) return { status: 'NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX', fill, plannedLoss };
  const sameBarStop = fin(order.stop) && bar.low <= order.stop ? (basis === 'INTRADAY_LEVEL_TOUCH' ? 'AMBIGUOUS' : 'CERTAIN') : null;
  return { status: 'FILLED', fill, basis, plannedLoss, sameBarStop };
}

/** Protective levels of a long position on one bar: the highest level reached fills at min(open, level). */
export function protectiveHit(pos, bar) {
  const hits = [];
  if (fin(pos.stop) && bar.low <= pos.stop) hits.push({ level: pos.stop, reason: pos.stopReason });
  const t = pos.trigger;
  if (t && fin(t.level) && (t.strict ? bar.low < t.level : bar.low <= t.level)) hits.push({ level: t.level, reason: t.reason });
  if (!hits.length) return null;
  const h = hits.reduce((a, b) => (b.level > a.level ? b : a));
  return { fill: Math.min(bar.open, h.level), reason: bar.open < h.level ? `${h.reason}_GAP_OPEN` : h.reason };
}

/**
 * Runs one method adapter with one configuration over { calendar, securities[{ id, bars, terminal }] }. Returns trades
 * with their event history, ledger, curve, counts, rejections, open positions at the data end and the reconciliation.
 */
export function runResearchLifecycle(dataset, { adapter, config, policy = PLATFORM_RESEARCH_PORTFOLIO_POLICY, from = null, to = null, dataEventScenario, prepared = null, universe = RESEARCH_UNIVERSE } = {}) {
  const errs = adapter.validateConfig(config); if (errs.length) throw new Error(`INVALID_CONFIG:${errs.join(',')}`);
  if (!(policy.maxPositionWeight > 0 && policy.maxPositionWeight <= 0.25)) throw new Error('MAX_POSITION_WEIGHT_ABOVE_PLATFORM_BOUND');
  if (!['PESSIMISTIC', 'OPTIMISTIC'].includes(config.intrabarOrder)) throw new Error('INTRABAR_ORDER_REQUIRED');
  const slip = policy.slippageBps / 1e4, fee = policy.commissionBps / 1e4, dataFactor = AC.dataEventFactor(dataEventScenario);
  const calendar = dataset.calendar.filter((d) => (!from || d >= from) && (!to || d <= to));
  const prep = prepared ?? prepareAll(dataset, adapter, config);
  const sec = new Map(dataset.securities.map((s) => [s.id, { s, idx: new Map(s.bars.map((b, i) => [b.date, i])), ctx: prep.get(s.id) }]));
  if (sec.size !== dataset.securities.length) throw new Error('DUPLICATE_SECURITY_ID');
  const ids = [...sec.keys()].sort();
  const stale = AC.createStaleTracker();
  let cash = policy.initialCapital, grossFlows = 0, tradeSeq = 0;
  const positions = new Map(), lastClose = new Map(), ledger = [], trades = [], curve = [], rejections = [];
  let orders = new Map();
  const counts = { setupsSeen: 0, ordersArmed: 0, ordersNotTriggered: 0, entries: 0, closeEntries: 0, notExecutedNoSourceBar: 0, notExecutedAtOrBelowStop: 0, notExecutedPlannedLossAboveMax: 0, rejectMaxPositions: 0, rejectSizeZero: 0, rejectInsufficientCapital: 0, cappedByCash: 0, cappedByMaxWeight: 0, gapFills: 0, sameBarStopCertain: 0, sameBarStopAmbiguousExecuted: 0, sameBarStopAmbiguousIgnored: 0, protectiveExits: 0, scheduledExits: 0, partialExits: 0, stopRaises: 0, duplicateSignalsIgnored: 0, terminalSettlements: 0, unavailableSettlements: 0, dividends: 0, costs: 0, eligibilityBlockers: {} };
  const book = (row) => { ledger.push(row); grossFlows += Math.abs(row.gross || 0) + Math.abs(row.fee || 0); };
  const mv = () => { let v = 0; for (const p of positions.values()) v += p.shares * (lastClose.get(p.id) ?? p.entry); return v; };
  const blocked = (el) => { for (const bl of el.blockers) counts.eligibilityBlockers[bl.code] = (counts.eligibilityBlockers[bl.code] || 0) + 1; };

  function sell(pos, shares, price, date, reason) {
    const px = price * (1 - slip), gross = shares * px, f = gross * fee;
    cash += gross - f; counts.costs += shares * price * slip + f;
    book({ date, id: pos.id, side: 'SELL', shares, price: px, gross, fee: f, reason, tradeId: pos.tradeId });
    const costShare = pos.costBasis * (shares / pos.shares);
    pos.realized += gross - f - costShare; pos.costBasis -= costShare; pos.shares -= shares;
    pos.events.push({ date, type: 'SELL', shares, price: px, reason });
    const dust = AC.dustDecision(pos.shares, price);
    if (dust.action === 'WRITE_OFF') { pos.events.push({ date, type: 'DUST_WRITE_OFF', shares: pos.shares, value: dust.value }); pos.realized -= pos.costBasis; pos.costBasis = 0; pos.shares = 0; }
    if (pos.shares <= 0) finish(pos, date, reason);
  }
  function finish(pos, date, reason) {
    const t = pos.trade;
    Object.assign(t, { status: 'CLOSED', exitDate: date, exitReason: reason, pnl: pos.realized + pos.dividends, heldSessions: pos.sessions, events: pos.events, finalStop: pos.stop });
    t.rMultiple = t.initialRiskAmount > 0 ? t.pnl / t.initialRiskAmount : null;
    t.returnPct = t.costTotal > 0 ? t.pnl / t.costTotal : null;
    positions.delete(pos.id); stale.forget(pos.id); pos.closed = true;
  }
  function apiFor(pos, date) {
    return {
      raiseStop(level, rule) { if (fin(level) && (!fin(pos.stop) || level > pos.stop)) { pos.stop = level; pos.stopReason = `STOP_${rule}`; counts.stopRaises++; pos.events.push({ date, type: 'STOP_RAISED', stop: level, rule, effectiveFrom: 'next session' }); } },
      setTrigger(tr) { pos.trigger = tr ? { ...tr } : null; if (tr) pos.events.push({ date, type: 'EXIT_TRIGGER_SET', level: tr.level, strict: !!tr.strict, rule: tr.rule, effectiveFrom: 'next session' }); },
      scheduleExit(fraction, reason) { if (pos.pendingExit && pos.pendingExit.fraction >= 1) return; if (!pos.pendingExit || fraction >= 1) { pos.pendingExit = { fraction, reason }; pos.events.push({ date, type: 'EXIT_SCHEDULED_NEXT_OPEN', reason, fraction }); } },
    };
  }
  function enter(id, x, i, date, f, o, equityPrev) {
    if (positions.size >= policy.maxOpenPositions) { counts.rejectMaxPositions++; rejections.push({ id, date, reason: 'REJECT_MAX_OPEN_POSITIONS' }); return null; }
    const sz = plannedShares({ sizing: config.sizing, fill: f.fill, stop: o.order.stop, equity: equityPrev, policy, sourceMaxPositionWeight: adapter.sourceMaxPositionWeight ?? null });
    const unitCost = f.fill * (1 + slip) * (1 + fee), byCash = Math.floor(Math.max(0, cash) / unitCost + 1e-9);
    if (!(sz.shares > 0)) { counts.rejectSizeZero++; rejections.push({ id, date, reason: 'REJECT_SIZE_ZERO' }); return null; }
    if (!(byCash > 0)) { counts.rejectInsufficientCapital++; rejections.push({ id, date, reason: 'REJECT_INSUFFICIENT_CAPITAL' }); return null; }
    const shares = Math.min(sz.shares, byCash);
    if (byCash < sz.shares) counts.cappedByCash++;
    if (sz.cappedByMaxWeight) counts.cappedByMaxWeight++;
    const px = f.fill * (1 + slip), gross = shares * px, fe = gross * fee;
    cash -= gross + fe; counts.costs += shares * f.fill * slip + fe;
    const tradeId = ++tradeSeq;
    book({ date, id, side: 'BUY', shares, price: px, gross, fee: fe, reason: `ENTRY_${f.basis}`, tradeId });
    counts.entries++; if (f.basis === 'OPEN_GAP_AT_OR_ABOVE_LEVEL') counts.gapFills++; if (f.basis === 'CLOSE') counts.closeEntries++;
    const stop = fin(o.order.stop) ? o.order.stop : null, perShare = stop !== null ? f.fill - stop : null;
    const trade = { tradeId, id, strategy: adapter.strategy, setupDate: o.setup.date, signalDate: o.armedDate, entryDate: date, entryFill: f.fill, entryBasis: f.basis, orderLevel: o.order.level ?? null, initialStop: stop, riskPerShare: perShare, shares, costTotal: gross + fe, initialRiskAmount: perShare !== null ? shares * perShare : null, riskOfEquity: perShare !== null ? (shares * perShare) / equityPrev : null, weight: (shares * f.fill) / equityPrev, plannedLoss: f.plannedLoss, openManualDecisionsSubstituted: o.eligibility.openManualDecisions, setupEvidence: o.setup.evidence ?? null, ...(f.resolution ? { intradayEvidence: f.resolution.evidence ?? null } : {}), status: 'OPEN', simulatedResearchOnly: true, ...NOT_A_STRATEGY_SF5 };
    trades.push(trade);
    const pos = { id, tradeId, trade, entry: f.fill, entryIndex: i, initialStop: stop, stop, stopReason: 'STOP_INITIAL', trigger: null, shares, costBasis: gross + fe, realized: 0, dividends: 0, sessions: 1, entryDate: date, events: [{ date, type: 'ENTRY', basis: f.basis, fill: f.fill, shares, stop }], pendingExit: null, closed: false, state: {} };
    positions.set(id, pos);
    return pos;
  }

  for (const date of calendar) {
    const equityPrev = cash + mv();
    // 1) held positions
    for (const id of [...positions.keys()].sort()) {
      const pos = positions.get(id), x = sec.get(id), i = x.idx.get(date), b = i === undefined ? null : x.s.bars[i];
      if (!b) continue;
      pos.sessions++;
      if (fin(b.dividend) && b.dividend > 0 && pos.entryDate < date) { const d = pos.shares * b.dividend; cash += d; pos.dividends += d; counts.dividends += d; book({ date, id, side: 'DIVIDEND', shares: pos.shares, price: b.dividend, gross: d, fee: 0, reason: 'EX_DATE_HELD_PREVIOUS_CLOSE', tradeId: pos.tradeId }); }
      if (AC.isExecutableBar(b, 'open')) {
        if (pos.pendingExit) {
          const pe = pos.pendingExit; pos.pendingExit = null;
          sell(pos, pe.fraction >= 1 ? pos.shares : AC.sellQuantity(pos.shares, pe.fraction, 1), b.open, date, pe.reason);
          counts.scheduledExits++; if (pe.fraction < 1) counts.partialExits++;
          if (pos.closed) continue;
        }
        const hit = fin(b.low) ? protectiveHit(pos, b) : null;
        if (hit) { sell(pos, pos.shares, hit.fill, date, hit.reason); counts.protectiveExits++; continue; }
      }
      // every bar of a held security reaches the close rules, also without an executable open or a close (e.g. a box
      // confirmed from high / low only); adapters guard the fields they read; effective from the next session
      adapter.onClose(pos, x.ctx, i, apiFor(pos, date), config);
    }
    // 2) pending entries armed at the prior close, in the date-seeded neutral order (minervini-execution#fillRank)
    for (const id of [...orders.keys()].sort((a, c) => fillRank(date, a) - fillRank(date, c) || (a < c ? -1 : a > c ? 1 : 0))) {
      const o = orders.get(id), x = sec.get(id), i = x.idx.get(date), b = i === undefined ? null : x.s.bars[i];
      if (positions.has(id)) continue;
      const f = b ? fillOrder(b, o.order) : { status: 'NOT_EXECUTED_NO_SOURCE_BAR' };
      if (f.status === 'NOT_TRIGGERED') { counts.ordersNotTriggered++; continue; }
      if (f.status !== 'FILLED') {
        const known = { NOT_EXECUTED_NO_SOURCE_BAR: 'notExecutedNoSourceBar', NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP: 'notExecutedAtOrBelowStop', NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX: 'notExecutedPlannedLossAboveMax' }[f.status];
        if (known) counts[known]++; else { counts.notExecutedResolved ??= {}; counts.notExecutedResolved[f.status] = (counts.notExecutedResolved[f.status] || 0) + 1; }
        rejections.push({ id, date, reason: f.status }); continue;
      }
      // a resolved intraday fill carries the stop known at its fill minute (the armed order has none)
      const pos = enter(id, x, i, date, f, fin(f.stop) ? { ...o, order: { ...o.order, stop: f.stop } } : o, equityPrev); if (!pos) continue;
      if (f.sameBarStop === 'CERTAIN') { counts.sameBarStopCertain++; sell(pos, pos.shares, fin(f.sameBarExitFill) ? f.sameBarExitFill : pos.stop, date, 'STOP_SAME_BAR_CERTAIN'); counts.protectiveExits++; continue; }
      if (f.sameBarStop === 'AMBIGUOUS') {
        if (config.intrabarOrder === 'PESSIMISTIC') { counts.sameBarStopAmbiguousExecuted++; sell(pos, pos.shares, pos.stop, date, 'STOP_SAME_BAR_ASSUMED'); counts.protectiveExits++; continue; }
        counts.sameBarStopAmbiguousIgnored++; pos.events.push({ date, type: 'SAME_BAR_STOP_IGNORED', rule: 'intrabarOrder OPTIMISTIC' });
      }
      adapter.onClose(pos, x.ctx, i, apiFor(pos, date), config);
    }
    orders = new Map();
    // 3) economic delisting
    for (const id of [...positions.keys()].sort()) {
      const pos = positions.get(id), x = sec.get(id), t = x.s.terminal;
      if (!t || t.date !== date || t.cause !== 'LISTING_INACTIVE') continue;
      const i = x.idx.get(date), last = i !== undefined && fin(x.s.bars[i].close) ? x.s.bars[i].close : lastClose.get(id);
      const net = SCENARIOS[policy.terminalScenario]({ lastClose: last, distress: t.distress, delistClass: t.delistClass }, slip);
      sell(pos, pos.shares, net / (1 - slip), date, 'TERMINAL_DELISTED'); counts.terminalSettlements++;
    }
    // 4) marks and the stale limit
    const seen = new Map();
    for (const id of ids) { const x = sec.get(id), i = x.idx.get(date); if (i !== undefined && fin(x.s.bars[i].close)) { lastClose.set(id, x.s.bars[i].close); if (positions.has(id)) seen.set(id, { close: x.s.bars[i].close, volume: x.s.bars[i].volume }); } }
    for (const id of stale.observe([...positions.keys()].sort(), seen)) { const pos = positions.get(id); sell(pos, pos.shares, lastClose.get(id) * dataFactor, date, 'SECURITY_UNAVAILABLE'); counts.unavailableSettlements++; }
    // 5) setups at this close: ON_CLOSE fills now, everything else is armed for the next session
    const closeFills = [];
    for (const id of ids) {
      const x = sec.get(id); if (!x.ctx) continue;
      const i = x.idx.get(date); if (i === undefined) continue;
      if (x.s.terminal && x.s.terminal.date <= date) continue; // no new position on or after the terminal date (review SF5-C-L3)
      const setup = adapter.signalAt(x.ctx, i, config); if (!setup) continue;
      counts.setupsSeen++;
      if (positions.has(id)) { counts.duplicateSignalsIgnored++; continue; }
      const el = adapter.eligibility({ ctx: x.ctx, setup, bars: x.s.bars, i, cfg: config });
      // research universe at the session before the fill: i - 1 for a closing fill on bar i, i for a fill on bar i + 1
      if (!eligibleAtPriorSession(x.s.bars, el.order?.type === 'ON_CLOSE' || adapter.closeEntry?.(config) ? i : i + 1, universe)) el.blockers.push({ code: 'OUTSIDE_RESEARCH_UNIVERSE', rule: 'VU_TOURNAMENT_UNIVERSE_705 (convention)', class: 'MODEL_ASSUMPTION' });
      if (el.blockers.length) { blocked(el); continue; }
      if (el.order.type === 'ON_CLOSE') closeFills.push({ id, x, i, setup, el });
      else { orders.set(id, { order: el.order, setup, eligibility: el, armedDate: date }); counts.ordersArmed++; }
    }
    for (const c of closeFills.sort((a, d) => fillRank(date, a.id) - fillRank(date, d.id) || (a.id < d.id ? -1 : 1))) {
      const b = c.x.s.bars[c.i];
      if (!AC.isExecutableBar(b, 'close')) { counts.notExecutedNoSourceBar++; rejections.push({ id: c.id, date, reason: 'NOT_EXECUTED_NO_SOURCE_BAR' }); continue; }
      const stop = c.el.order.stop;
      if (fin(stop) && !(b.close > stop)) { counts.notExecutedAtOrBelowStop++; rejections.push({ id: c.id, date, reason: 'NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP' }); continue; }
      const f = { status: 'FILLED', fill: b.close, basis: 'CLOSE', plannedLoss: fin(stop) ? 1 - stop / b.close : null, sameBarStop: null };
      enter(c.id, c.x, c.i, date, f, { order: c.el.order, setup: c.setup, eligibility: c.el, armedDate: date }, equityPrev);
    }
    const m = mv();
    if (cash < -AC.reconciliationTolerance(grossFlows, policy.initialCapital)) throw new Error('SF5_NEGATIVE_CASH');
    curve.push({ date, equity: cash + m, exposure: cash + m > 0 ? m / (cash + m) : 0, positions: positions.size });
  }
  for (const pos of positions.values()) {
    const mark = lastClose.get(pos.id) ?? pos.entry, unrealized = pos.shares * mark - pos.costBasis;
    Object.assign(pos.trade, { status: 'OPEN_AT_DATA_END', exitDate: null, exitReason: null, markDate: calendar.at(-1) ?? null, mark, unrealizedPnl: unrealized, realizedPnl: pos.realized + pos.dividends, heldSessions: pos.sessions, events: pos.events, finalStop: pos.stop });
  }
  let replay = policy.initialCapital;
  for (const r of ledger) replay += r.side === 'BUY' ? -(r.gross + r.fee) : r.gross - r.fee;
  const tol = AC.reconciliationTolerance(grossFlows, policy.initialCapital);
  return {
    engineVersion: ENGINE_VERSION, adapterVersion: adapter.version, strategy: adapter.strategy, config, policy: policy.id, label: adapter.label ?? STUDY_LABEL.MODEL, simulatedResearchOnly: true, orders: false, ...NOT_A_STRATEGY_SF5,
    trades, ledger, curve, counts, rejections, staleCounts: { ...stale.counts },
    openAtEnd: trades.filter((t) => t.status === 'OPEN_AT_DATA_END').map((t) => ({ id: t.id, tradeId: t.tradeId, unrealizedPnl: t.unrealizedPnl })),
    endingPositionCheck: AC.endingPositionCheck([...positions.keys()], stale),
    reconciliation: { ledgerCash: replay, cash, absoluteDifference: Math.abs(replay - cash), tolerance: tol, pass: Math.abs(replay - cash) <= tol },
  };
}

/** Per-security preparation of an adapter (shared by the variants of a run that do not change the setup inputs). */
export function prepareAll(dataset, adapter, config) {
  const m = new Map();
  for (const s of dataset.securities) { const c = adapter.prepare(s, config, dataset); if (c) m.set(s.id, c); }
  return m;
}

/** Diagnostic metrics of a lifecycle run (closed trades for trade statistics; the curve includes open marks). */
export function runMetricsSF5(run, { spyTR = null, policy = PLATFORM_RESEARCH_PORTFOLIO_POLICY } = {}) {
  const closed = run.trades.filter((t) => t.status === 'CLOSED');
  return { label: run.label, diagnostic: computeDiagnosticMetrics({ curve: run.curve, trades: closed, ledger: run.ledger, costs: run.counts.costs, spyTR, splitPeriods: [], initialCapital: policy.initialCapital }), lifecycle: lifecycleMetrics(run.trades) };
}

/** Entry eligibility skeleton shared by the adapters: collects blockers and returns the order only when none remain. */
export function eligibilityResult({ strategy, bars, i, blockers, order, openManualDecisions, extra = {} }) {
  const ok = blockers.length === 0;
  return { strategy, asOf: bars[i]?.date ?? null, state: ok ? 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW' : 'ENTRY_BLOCKED', blockers, openManualDecisions, buyDeclarationAllowed: false, ...NOT_A_STRATEGY_SF5, order: ok ? { ...order, simulatedOnly: true } : null, ...extra };
}
