/**
 * Supertrader 7.0 – execution of the Minervini lifecycle with ONE pre-registered research exit rule
 * (research/minervini-sf7-exits.mjs, owner decision E7-7). Docs: docs/SUPERTRADER_7_MINERVINI_EXIT_VARIANTS.md.
 *
 * Why a copy: research/minervini-execution.mjs (4.0) has no exit hook, and it feeds pinned fingerprints (4.0 research
 * code c834b227…, sf5 and EP/PS code, SF6-PAPER-2027 1.1.0); it is not changed. runMinerviniLifecycleWithExitRule is
 * the 4.0 runMinerviniLifecycle line for line, with three additions only:
 *  - at the entry fill the rule state is created from bars before the entry (createExitRule);
 *  - after the REF close rules of a bar (held positions and the entry bar) sf7Close may schedule a next-open exit
 *    (MA-MIN7-EXIT-PRECEDENCE);
 *  - the next-open fill of such an exit is counted in sf7ExitCounts (outside counts, which keep the REF shape).
 * With exitRule = null the run is the 4.0 run: ledger, trades and curve identical (test SF7-EXIT-ENGINE-IDENTITY on
 * synthetic universes for every RUN_VARIANTS configuration; the snapshot runner fails unless the copy reproduces the
 * REF ledger hash). Simulated only: no broker, no order, no live path; research-v1 accounting unchanged.
 */
import * as AC from '../../validation/accounting-contract.mjs';
import { SCENARIOS } from '../../validation/portfolio.mjs';
import { fin, smaAt } from '../common/series.mjs';
import { NOT_A_STRATEGY } from './minervini-components.mjs';
import { LIFECYCLE_VERSION, EXIT_POLICIES, entryEligibility, fillBuyOrder, breakoutVolumeVs50d, validateConfig } from './minervini-lifecycle.mjs';
import { EXECUTION_VERSION, EQUITY_RESEARCH_PORTFOLIO_POLICY, fillRank } from './minervini-execution.mjs';
import { createExitRule } from './minervini-sf7-exits.mjs';

export const SF7_EXIT_EXECUTION_VERSION = 'sf7-minervini-exit-execution-1.0.0';

export function runMinerviniLifecycleWithExitRule(dataset, { strategy, setupIndex, config, exitRule = null, stage2 = null, policy = EQUITY_RESEARCH_PORTFOLIO_POLICY, from = null, to = null, dataEventScenario } = {}) {
  if (!['SEPA', 'POWER_PLAY'].includes(strategy)) throw new Error('STRATEGY_REQUIRED');
  if (!setupIndex || setupIndex.strategy !== strategy) throw new Error('SETUP_INDEX_STRATEGY_MISMATCH');
  const errs = validateConfig(config); if (errs.length) throw new Error(`INVALID_CONFIG:${errs.join(',')}`);
  if (!(policy.maxPositionWeight > 0 && policy.maxPositionWeight <= 0.25)) throw new Error('MAX_POSITION_WEIGHT_ABOVE_SOURCE_BOUND');
  const exitP = EXIT_POLICIES[config.exitPolicy];
  const slip = policy.slippageBps / 1e4, fee = policy.commissionBps / 1e4, dataFactor = AC.dataEventFactor(dataEventScenario);
  const calendar = dataset.calendar.filter((d) => (!from || d >= from) && (!to || d <= to));
  const sec = new Map(dataset.securities.map((s) => [s.id, { s, idx: new Map(s.bars.map((b, i) => [b.date, i])), setups: setupIndex.index.get(s.id) ?? null }]));
  if (sec.size !== dataset.securities.length) throw new Error('DUPLICATE_SECURITY_ID'); // one security, one order book entry
  const ids = [...sec.keys()].sort();
  const stale = AC.createStaleTracker();
  let cash = policy.initialCapital, grossFlows = 0, tradeSeq = 0;
  const positions = new Map(), lastClose = new Map(), ledger = [], trades = [], curve = [], rejections = [];
  let orders = new Map(); // id -> { order, setup, eligibility, armedDate }
  const counts = { setupsSeen: 0, ordersArmed: 0, ordersNotTriggered: 0, entries: 0, notExecutedNoSourceBar: 0, notExecutedAboveLimit: 0, notExecutedAtOrBelowStop: 0, rejectMaxPositions: 0, rejectSizeZero: 0, rejectInsufficientCapital: 0, cappedByCash: 0, cappedByMaxWeight: 0, gapFills: 0, limitFills: 0, plannedLossExceededFills: 0, sameBarStopCertain: 0, sameBarStopAmbiguousExecuted: 0, sameBarStopAmbiguousIgnored: 0, stopExits: 0, breakevenRaises: 0, ma50Exits: 0, freerollPartials: 0,duplicateSignalsIgnored: 0, terminalSettlements: 0, unavailableSettlements: 0, dividends: 0, costs: 0, eligibilityBlockers: {} };
  const xc = { rule: exitRule ? exitRule.kind : null, evaluated: 0, notEvaluable: {}, signals: 0, scheduled: 0, suppressedByRefExit: 0, replacedRefPartial: 0, executed: 0 }; // SF7 exit counts (outside counts: the REF shape stays)
  const book = (row) => { ledger.push(row); grossFlows += Math.abs(row.gross || 0) + Math.abs(row.fee || 0); };
  const mv = () => { let v = 0; for (const p of positions.values()) v += p.shares * (lastClose.get(p.id) ?? p.entry); return v; };

  function sell(pos, shares, price, date, reason, slipRate = slip) {
    const px = price * (1 - slipRate), gross = shares * px, f = gross * fee;
    cash += gross - f; counts.costs += shares * price * slipRate + f;
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
  /** close rules of the exit policy on bar i (position still open after the stop check) */
  function closeRules(pos, x, i, date) {
    const b = x.s.bars[i]; if (!fin(b.close)) return;
    const risk = pos.entry - pos.initialStop, r = risk > 0 ? (b.close - pos.entry) / risk : null;
    let full = null, partial = null;
    if (exitP.breakevenAtR && !pos.beDone && r !== null && r >= exitP.breakevenAtR) { pos.beDone = true; if (pos.entry > pos.stop) { pos.stop = pos.entry; counts.breakevenRaises++; pos.events.push({ date, type: 'STOP_RAISED_BREAKEVEN', stop: pos.stop, rule: 'MIN-RISK-05', effectiveFrom: 'next session' }); } }
    if (exitP.freerollAtR && !pos.freerollDone && r !== null && r >= exitP.freerollAtR) { pos.freerollDone = true; partial = { fraction: 0.5, reason: 'FREEROLL_PARTIAL_HALF' }; if (pos.entry > pos.stop) { pos.stop = pos.entry; pos.events.push({ date, type: 'STOP_RAISED_BREAKEVEN', stop: pos.stop, rule: 'MIN-TTC-FREEROLL', effectiveFrom: 'next session' }); } }
    if (exitP.ma50AfterBreakeven && pos.stop >= pos.entry) { const m = smaAt(x.s.bars, i, 50); if (fin(m) && b.close < m) full = { fraction: 1, reason: 'MA50_CLOSE_EXIT' }; }
    const next = full ?? partial; // a full exit dominates a partial one (no pre-registered policy produces both)
    if (next) { pos.pendingExit = next; pos.events.push({ date, type: 'EXIT_SCHEDULED_NEXT_OPEN', reason: next.reason, fraction: next.fraction }); }
  }
  /** SF7 exit rule on bar i, after the REF close rules (MA-MIN7-EXIT-PRECEDENCE); reads bars up to i only */
  function sf7Close(pos, i, date) {
    if (!pos.sf7 || pos.closed) return;
    const hit = pos.sf7.onClose(i); if (!hit) return;
    xc.signals++;
    const pe = pos.pendingExit;
    if (pe && pe.fraction >= 1) { xc.suppressedByRefExit++; pos.events.push({ date, type: 'SF7_EXIT_SIGNAL_SUPPRESSED', reason: hit.reason, by: pe.reason }); return; }
    if (pe && hit.fraction < 1) { xc.suppressedByRefExit++; pos.events.push({ date, type: 'SF7_EXIT_SIGNAL_SUPPRESSED', reason: hit.reason, by: pe.reason }); return; } // partial vs pending partial: REF first
    if (pe) xc.replacedRefPartial++;
    pos.pendingExit = { fraction: hit.fraction, reason: hit.reason, sf7: true }; xc.scheduled++;
    pos.events.push({ date, type: 'EXIT_SCHEDULED_NEXT_OPEN', reason: hit.reason, fraction: hit.fraction, signalDate: pos.bars[hit.signalIndex]?.date ?? date, rule: 'SF7_EXIT_VARIANT' });
  }
  function stopCheck(pos, b, date) {
    if (!(b.low <= pos.stop)) return false;
    sell(pos, pos.shares, Math.min(b.open, pos.stop), date, pos.stop >= pos.entry ? 'STOP_BREAKEVEN_OR_BETTER' : 'STOP_INITIAL');
    counts.stopExits++; return true;
  }

  for (const date of calendar) {
    const equityPrev = cash + mv();
    // 1) held positions
    for (const id of [...positions.keys()].sort()) {
      const pos = positions.get(id), x = sec.get(id), i = x.idx.get(date), b = i === undefined ? null : x.s.bars[i];
      if (!b) continue;
      pos.sessions++;
      if (fin(b.dividend) && b.dividend > 0 && pos.entryDate < date) { const d = pos.shares * b.dividend; cash += d; pos.dividends += d; counts.dividends += d; book({ date, id, side: 'DIVIDEND', shares: pos.shares, price: b.dividend, gross: d, fee: 0, reason: 'EX_DATE_HELD_PREVIOUS_CLOSE', tradeId: pos.tradeId }); }
      if (!AC.isExecutableBar(b, 'open')) continue; // halt / missing open: no fill, the stale limit applies (the SF7 rule reads this close later, MA-MIN7-EXIT-CATCH-UP)
      if (pos.pendingExit) {
        const pe = pos.pendingExit; pos.pendingExit = null;
        const q = pe.fraction >= 1 ? pos.shares : AC.sellQuantity(pos.shares, pe.fraction, 1);
        sell(pos, q, b.open, date, pe.reason);
        if (pe.sf7) xc.executed++; else if (pe.reason === 'MA50_CLOSE_EXIT') counts.ma50Exits++; else counts.freerollPartials++;
        if (pos.closed) continue;
      }
      if (stopCheck(pos, b, date)) continue;
      closeRules(pos, x, i, date);
      sf7Close(pos, i, date);
    }
    // 2) pending entries (armed at the prior close), in the date-seeded neutral order (MA-MIN-SIGNAL-ORDER)
    for (const id of [...orders.keys()].sort((a, b) => fillRank(date, a) - fillRank(date, b) || (a < b ? -1 : a > b ? 1 : 0))) {
      const o = orders.get(id), x = sec.get(id), i = x.idx.get(date), b = i === undefined ? null : x.s.bars[i];
      if (positions.has(id)) continue;
      const f = b ? fillBuyOrder(b, o.order) : { status: 'NOT_EXECUTED_NO_SOURCE_BAR' };
      if (f.status === 'NOT_TRIGGERED') { counts.ordersNotTriggered++; continue; }
      if (f.status !== 'FILLED') {
        const k = { NOT_EXECUTED_NO_SOURCE_BAR: 'notExecutedNoSourceBar', NOT_EXECUTED_ABOVE_LIMIT: 'notExecutedAboveLimit', NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP: 'notExecutedAtOrBelowStop' }[f.status];
        counts[k]++; rejections.push({ id, date, reason: f.status }); continue;
      }
      if (positions.size >= policy.maxOpenPositions) { counts.rejectMaxPositions++; rejections.push({ id, date, reason: 'REJECT_MAX_OPEN_POSITIONS' }); continue; }
      const perShare = f.fill - o.order.stop;
      const byRisk = Math.floor((equityPrev * config.riskFraction) / perShare + 1e-9), byWeight = Math.floor((policy.maxPositionWeight * equityPrev) / f.fill + 1e-9);
      const unitCost = f.fill * (1 + slip) * (1 + fee), byCash = Math.floor(Math.max(0, cash) / unitCost + 1e-9);
      const planned = Math.min(byRisk, byWeight);
      if (!(planned > 0)) { counts.rejectSizeZero++; rejections.push({ id, date, reason: 'REJECT_SIZE_ZERO' }); continue; }
      if (!(byCash > 0)) { counts.rejectInsufficientCapital++; rejections.push({ id, date, reason: 'REJECT_INSUFFICIENT_CAPITAL' }); continue; }
      const shares = Math.min(planned, byCash);
      if (byCash < planned) counts.cappedByCash++;
      if (byWeight < byRisk) counts.cappedByMaxWeight++;
      const px = f.fill * (1 + slip), gross = shares * px, fe = gross * fee;
      cash -= gross + fe; counts.costs += shares * f.fill * slip + fe;
      const tradeId = ++tradeSeq;
      book({ date, id, side: 'BUY', shares, price: px, gross, fee: fe, reason: `ENTRY_${f.basis}`, tradeId });
      counts.entries++; if (f.basis === 'OPEN_GAP_AT_OR_ABOVE_PIVOT') counts.gapFills++; if (f.basis === 'LIMIT_FILL_AFTER_OPEN') counts.limitFills++; if (f.plannedLossExceedsMax) counts.plannedLossExceededFills++;
      const trade = { tradeId, id, strategy, setupDate: o.setup.date, signalDate: o.armedDate, entryDate: date, entryFill: f.fill, entryBasis: f.basis, pivot: o.order.level, initialStop: o.order.stop, riskPerShare: perShare, shares, costTotal: gross + fe, initialRiskAmount: shares * perShare, riskOfEquity: (shares * perShare) / equityPrev, weight: (shares * f.fill) / equityPrev, plannedLoss: f.plannedLoss, plannedLossExceedsMax: f.plannedLossExceedsMax, breakoutVolumeVs50d: breakoutVolumeVs50d(x.s.bars, i), openManualDecisionsSubstituted: o.eligibility.openManualDecisions, status: 'OPEN', simulatedResearchOnly: true, ...NOT_A_STRATEGY };
      trades.push(trade);
      const pos = { id, tradeId, trade, entry: f.fill, initialStop: o.order.stop, stop: o.order.stop, shares, costBasis: gross + fe, realized: 0, dividends: 0, sessions: 1, entryDate: date, events: [{ date, type: 'ENTRY', basis: f.basis, fill: f.fill, shares, stop: o.order.stop }], beDone: false, freerollDone: false, pendingExit: null, closed: false };
      positions.set(id, pos);
      if (exitRule) { // rule state from bars before the entry; the setup bar is the order's setup (MA-MIN7-STAGE2-START)
        const s0 = x.idx.get(o.setup.date);
        pos.bars = x.s.bars; pos.sf7 = createExitRule(exitRule, x.s.bars, { e: i, s0, stage2, key: `${id}|${s0}` });
        trade.sf7Exit = { rule: exitRule.kind, status: pos.sf7.status };
        if (pos.sf7.status === 'EVALUATED') xc.evaluated++; else xc.notEvaluable[pos.sf7.status] = (xc.notEvaluable[pos.sf7.status] || 0) + 1;
      }
      if (f.sameBarStop === 'CERTAIN') { counts.sameBarStopCertain++; sell(pos, pos.shares, pos.stop, date, 'STOP_SAME_BAR_CERTAIN'); counts.stopExits++; continue; }
      if (f.sameBarStop === 'AMBIGUOUS') {
        if (config.intrabarOrder === 'PESSIMISTIC') { counts.sameBarStopAmbiguousExecuted++; sell(pos, pos.shares, pos.stop, date, 'STOP_SAME_BAR_ASSUMED'); counts.stopExits++; continue; }
        counts.sameBarStopAmbiguousIgnored++; pos.events.push({ date, type: 'SAME_BAR_STOP_IGNORED', rule: 'MA-MIN-INTRABAR-ORDER OPTIMISTIC' });
      }
      closeRules(pos, x, i, date);
      sf7Close(pos, i, date);
    }
    orders = new Map();
    // 3) economic delisting
    for (const id of [...positions.keys()].sort()) {
      const pos = positions.get(id), x = sec.get(id), t = x.s.terminal;
      if (!t || t.date !== date || t.cause !== 'LISTING_INACTIVE') continue;
      const i = x.idx.get(date), last = i !== undefined && fin(x.s.bars[i].close) ? x.s.bars[i].close : lastClose.get(id); // review SF4-C-L6
      const net = SCENARIOS[policy.terminalScenario]({ lastClose: last, distress: t.distress, delistClass: t.delistClass }, slip);
      sell(pos, pos.shares, net / (1 - slip), date, 'TERMINAL_DELISTED'); counts.terminalSettlements++;
    }
    // 4) marks and the stale limit (A4)
    const seen = new Map();
    for (const id of ids) { const x = sec.get(id), i = x.idx.get(date); if (i !== undefined && fin(x.s.bars[i].close)) { lastClose.set(id, x.s.bars[i].close); if (positions.has(id)) seen.set(id, { close: x.s.bars[i].close, volume: x.s.bars[i].volume }); } }
    for (const id of stale.observe([...positions.keys()].sort(), seen)) { const pos = positions.get(id); sell(pos, pos.shares, lastClose.get(id) * dataFactor, date, 'SECURITY_UNAVAILABLE'); counts.unavailableSettlements++; }
    // 5) arm orders for the next session from the setups at this close
    for (const id of ids) {
      const x = sec.get(id); if (!x.setups) continue;
      const i = x.idx.get(date); if (i === undefined) continue;
      if (config.entryTiming === 'NEXT_OPEN_AFTER_VOLUME_CONFIRMED_CLOSE') {
        // the setup of the PRIOR close armed a pivot; bar i reached it with volume above the 50-day mean -> next open
        const prevSetup = i > 0 ? x.setups.get(i - 1) : null; if (!prevSetup) continue;
        counts.setupsSeen++;
        if (positions.has(id)) { counts.duplicateSignalsIgnored++; continue; }
        const el = entryEligibility({ strategy, setup: prevSetup, bars: x.s.bars, k: i, cfg: config });
        if (el.state !== 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW') { for (const bl of el.blockers) counts.eligibilityBlockers[bl.code] = (counts.eligibilityBlockers[bl.code] || 0) + 1; continue; }
        const b = x.s.bars[i], v = breakoutVolumeVs50d(x.s.bars, i);
        if (!(fin(b.high) && b.high >= el.order.level && fin(v) && v > 1)) continue;
        // the breakout bar itself reached the stop: the structure is broken before the next-open entry (review SF4-C-L4)
        if (fin(b.low) && b.low <= el.order.stop) { counts.eligibilityBlockers.STOP_REACHED_ON_BREAKOUT_BAR = (counts.eligibilityBlockers.STOP_REACHED_ON_BREAKOUT_BAR || 0) + 1; continue; }
        orders.set(id, { order: { type: 'ON_OPEN', stop: el.order.stop, limit: el.order.limit }, setup: prevSetup, eligibility: el, armedDate: date }); counts.ordersArmed++;
        continue;
      }
      const setup = x.setups.get(i); if (!setup) continue;
      counts.setupsSeen++;
      if (positions.has(id)) { counts.duplicateSignalsIgnored++; continue; }
      const el = entryEligibility({ strategy, setup, bars: x.s.bars, k: i + 1, cfg: config });
      if (el.state !== 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW') { for (const bl of el.blockers) counts.eligibilityBlockers[bl.code] = (counts.eligibilityBlockers[bl.code] || 0) + 1; continue; }
      orders.set(id, { order: el.order, setup, eligibility: el, armedDate: date }); counts.ordersArmed++;
    }
    const m = mv();
    if (cash < -AC.reconciliationTolerance(grossFlows, policy.initialCapital)) throw new Error('MINERVINI_NEGATIVE_CASH');
    curve.push({ date, equity: cash + m, exposure: cash + m > 0 ? m / (cash + m) : 0, positions: positions.size });
  }
  // open positions at the data end: marked at the last close, unrealized, never booked as exits
  for (const pos of positions.values()) {
    const mark = lastClose.get(pos.id) ?? pos.entry, unrealized = pos.shares * mark - pos.costBasis;
    Object.assign(pos.trade, { status: 'OPEN_AT_DATA_END', exitDate: null, exitReason: null, markDate: calendar.at(-1) ?? null, mark, unrealizedPnl: unrealized, realizedPnl: pos.realized + pos.dividends, heldSessions: pos.sessions, events: pos.events, finalStop: pos.stop });
  }
  let replay = policy.initialCapital;
  for (const r of ledger) replay += r.side === 'BUY' ? -(r.gross + r.fee) : r.gross - r.fee;
  const tol = AC.reconciliationTolerance(grossFlows, policy.initialCapital);
  return {
    version: SF7_EXIT_EXECUTION_VERSION, baseExecutionVersion: EXECUTION_VERSION, lifecycleVersion: LIFECYCLE_VERSION, exitRule: exitRule ? exitRule.kind : null, sf7ExitCounts: xc, strategy, config, policy: policy.id, label: 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST', certification: 'DIAGNOSTIC_NOT_CERTIFIED', simulatedResearchOnly: true, orders: false, ...NOT_A_STRATEGY,
    trades, ledger, curve, counts, rejections, staleCounts: { ...stale.counts },
    openAtEnd: trades.filter((t) => t.status === 'OPEN_AT_DATA_END').map((t) => ({ id: t.id, tradeId: t.tradeId, unrealizedPnl: t.unrealizedPnl })),
    endingPositionCheck: AC.endingPositionCheck([...positions.keys()], stale),
    reconciliation: { ledgerCash: replay, cash, absoluteDifference: Math.abs(replay - cash), tolerance: tol, pass: Math.abs(replay - cash) <= tol },
  };
}
