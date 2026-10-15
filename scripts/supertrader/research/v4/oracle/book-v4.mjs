/**
 * V4 equal-weight books on the V4 accounting (share/cash ledger), used as the second code path against the
 * arithmetic constructions of constructions-v4.mjs.
 *
 *  CLOSE mode (internal oracle): rebalance at the formation close F, zero costs. Its monthly equity returns
 *    must reproduce the arithmetic EW_MARKET series (compareInternal). The close fill is a measurement
 *    adapter (open := close on the formation bar), labelled as such; it is not a trading claim.
 *  NEXT_OPEN mode (frozen tournament convention): rebalance at the next session open with real open bars,
 *    zero or protocol costs. Its difference to CLOSE is reported as the execution-convention effect.
 *
 * Missing bars, stale valuation and terminals follow measurement-policy-v4.mjs (stale tracker, causal
 * quarantine terminals, data events not economic delistings).
 */
import { createBook, creditDividends, executeTargets, settleTerminals, markClose, reconcileBook } from '../measurement/accounting-v4.mjs';
import { MEASUREMENT_POLICY_V4, createStaleTracker, endingPositionCheck } from '../measurement/measurement-policy-v4.mjs';
import { sessionCalendar } from './constructions-v4.mjs';

function indexAt(bars, date) { let lo = 0, hi = bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].date < date) lo = m + 1; else hi = m; } return bars[lo]?.date === date ? lo : -1; }

export function runEqualWeightBook(data, months, { mode = 'CLOSE', initialCapital = 100000, slippageBpsPerSide = 0, commissionBpsPerSide = 0, scenario = 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT', dataEventScenario, policy = MEASUREMENT_POLICY_V4, onDay = null } = {}) {
  if (!['CLOSE', 'NEXT_OPEN'].includes(mode)) throw new Error('BOOK_MODE_REQUIRED');
  const calendar = sessionCalendar(data), byId = new Map(data.securities.map((s) => [s.id, s]));
  const first = months[0]?.formation, last = months.at(-1)?.end;
  if (!first || !last) throw new Error('BOOK_MONTHS_REQUIRED');
  const days = calendar.filter((d) => d >= first && d <= last);
  const rebalanceAt = new Map(months.map((m) => [m.formation, m]));
  const book = createBook(initialCapital), tracker = createStaleTracker(policy), cfg = { slippageBpsPerSide, commissionBpsPerSide };
  const equityOn = new Map(), stats = { executionAdapter: mode === 'CLOSE' ? 'FORMATION_CLOSE_FILL_MEASUREMENT_ADAPTER' : 'NEXT_SESSION_OPEN_REAL_BAR', rebalances: 0, unavailableSettlements: 0, terminalSettlements: 0, unexecutableHeld: 0 };
  let pending = null, prevDay = null;
  const barsFor = (ids, date) => { const m = new Map(); for (const id of ids) { const s = byId.get(id), i = s ? indexAt(s.bars, date) : -1; if (i >= 0) m.set(id, s.bars[i]); } return m; };
  for (const date of days) {
    const formation = rebalanceAt.get(date);
    const targetIds = formation ? formation.EW_MARKET.privateMembership : [];
    const pendingIds = pending ? pending.targets.map((t) => t.id) : [];
    const ids = new Set([...book.positions.keys(), ...targetIds, ...pendingIds]);
    const sourceBars = barsFor(ids, date);
    creditDividends(book, sourceBars);
    if (pending && mode === 'NEXT_OPEN') { executeTargets(book, pending.targets, sourceBars, date, cfg, { asOf: pending.asOf }); pending = null; stats.rebalances++; }
    const terminals = [...book.positions.keys()].map((id) => byId.get(id)).filter((s) => s?.terminal?.date === date).map((s) => ({ ...s.terminal, id: s.id }));
    const before = book.terminalCount;
    settleTerminals(book, sourceBars, terminals, date, cfg, scenario, dataEventScenario ? { dataEventScenario } : {});
    stats.terminalSettlements += book.terminalCount - before;
    for (const id of tracker.observe(date, [...book.positions.keys()], sourceBars)) {
      if (!book.positions.has(id)) continue;
      settleTerminals(book, sourceBars, [{ id, date, kind: 'SECURITY_UNAVAILABLE', lastClose: book.lastMarks.get(id) }], date, cfg, scenario, dataEventScenario ? { dataEventScenario } : {});
      stats.unavailableSettlements++; tracker.forget(id);
    }
    if (formation) {
      const targets = targetIds.map((id) => ({ id, weight: 1 / targetIds.length }));
      if (mode === 'CLOSE') {
        const closeBars = new Map([...sourceBars].map(([id, b]) => [id, { ...b, open: b.close }]));
        stats.unexecutableHeld += [...book.positions.keys()].filter((id) => !closeBars.has(id)).length;
        executeTargets(book, targets, closeBars, date, cfg, { asOf: prevDay ?? '0000-00-00' });
        stats.rebalances++;
      } else pending = { asOf: date, targets };
    }
    markClose(book, sourceBars, date);
    equityOn.set(date, book.curve.at(-1).equity);
    if (onDay) onDay({ date, book, bars: sourceBars });
    prevDay = date;
  }
  const monthly = new Map();
  for (const m of months) { const a = equityOn.get(m.formation), b = equityOn.get(m.end); if (a > 0 && Number.isFinite(b)) monthly.set(m.month, b / a - 1); }
  const reconciliation = reconcileBook(book);
  return { mode, monthly, book, reconciliation, endingFreshness: endingPositionCheck([...book.positions.values()], tracker, policy), stats, staleCounts: { ...tracker.counts } };
}
