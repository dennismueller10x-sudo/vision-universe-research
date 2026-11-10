'use strict';
// Fuehrt die Engines ueber die synthetischen Orakel-Faelle (scripts/quant/oracle/ledger_cases.py) und schreibt Ist-Buchungen.
// Nutzung: node run-js-ledger.cjs <cases.json> --out <result.json>. Schreibt nie in ein committetes Artefakt.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const M = require(path.join(ROOT, 'quant/engines/backtest-metrics.cjs'));
const H = 'a'.repeat(64);
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
if (args.length < 3 || outIdx < 0) { console.error('usage: run-js-ledger.cjs <cases.json> --out <result.json>'); process.exit(2); }
const cases = JSON.parse(fs.readFileSync(args[0], 'utf8')).filter(c => c.kind === 'WEEKLY_LEDGER');
const closeAt = d => d + 'T21:00:00Z';

function inputOf(c) {
  const sessions = c.sessions.map(d => ({ date: d, closeAt: closeAt(d) }));
  const evByListing = {};
  (c.events || []).forEach((e, k) => {
    const date = c.sessions[e.index];
    const base = { id: 'E' + k, effectiveDate: date, sequence: k, sourceHash: H };
    let ev;
    if (e.type === 'SPLIT') ev = { ...base, type: 'SPLIT', ratio: Number(e.ratio), availableAt: '2000-01-01T00:00:00Z' };
    else if (e.type === 'CASH_DIVIDEND') ev = { ...base, type: 'CASH_DIVIDEND', amount: Number(e.amount), currency: 'USD', availableAt: '2000-01-01T00:00:00Z', ...(e.pay_index == null ? { payDate: null, payDateState: 'NOT_STATED' } : { payDate: c.sessions[e.pay_index] }) };
    else ev = { ...base, type: 'TERMINAL_CASH', amount: Number(e.amount), currency: 'USD', payDate: date, availableAt: '2000-01-01T00:00:00Z' };
    (evByListing[e.listing] ||= []).push(ev);
  });
  const ids = Object.keys(c.listings);
  const listings = ids.map(id => {
    const px = c.listings[id].close.map(Number);
    const ended = px.length < sessionsLen(c);
    return { listingId: id, issuerId: 'I_' + id, mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: c.sessions[0],
      lastTradeDate: ended ? c.sessions[px.length - 1] : null, events: evByListing[id] || [], bars: px.map((x, i) => ({ date: c.sessions[i], availableAt: closeAt(c.sessions[i]), close: x })) };
  });
  const targets = Object.entries(c.targets).map(([e, w]) => ({ decisionDate: c.sessions[e - 1], executionDate: c.sessions[e], availableAt: closeAt(c.sessions[e - 1]), membershipHash: H, weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) }));
  return { sessions, initialCapital: Number(c.initial), currency: 'USD', provenance: { mode: 'SYNTHETIC_TEST', datasetHash: H }, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: c.fee_bps, slippageBps: c.slip_bps },
    maxMembershipAgeDays: 36500, maxFactorAgeDays: 45, listings, memberships: [{ effectiveAt: '1999-12-31T21:00:00Z', availableAt: '1999-12-31T21:00:00Z', sourceHash: H, members: ids }], factorSnapshots: [], targets,
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', sourceHash: H, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: sessions.map(s => ({ date: s.date, level: 100 })) } };
}
function sessionsLen(c) { return c.sessions.length; }

const out = {};
for (const c of cases) {
  try {
    const r = P.runPortfolio(inputOf(c));
    const m = M.computeMetrics(M.fromPortfolio(r));
    const idx = Object.fromEntries(c.sessions.map((d, i) => [d, i]));
    out[c.id] = { equity: r.equity.map(e => e.value), cash: r.equity.map(e => e.cash), receivables: r.equity.map(e => e.receivables || 0),
      units: Object.fromEntries((r.equity.at(-1).positions || []).map(p => [p.listingId, p.units])), fees: r.metrics.fees, slippage: r.metrics.slippage, turnover: r.metrics.oneWayTurnoverSum,
      trades: r.trades.map(t => ({ index: idx[t.date], listing: t.listingId, side: t.side, notional: t.notional, units: t.units })),
      notStated: r.equity.at(-1).notStatedClaims || 0, totalReturn: r.metrics.cumulativeReturn, maxDrawdown: r.metrics.maxDrawdown, metricsTotalReturn: m.returns.totalReturn, metricsMaxDrawdown: m.risk.maxDrawdown };
  } catch (e) { out[c.id] = { error: e.code || e.message }; }
}
fs.writeFileSync(args[outIdx + 1], JSON.stringify(out, null, 1));
