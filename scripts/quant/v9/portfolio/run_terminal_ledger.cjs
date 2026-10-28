#!/usr/bin/env node
'use strict';
// V9 portfolio: daily ledger run with REAL sourced terminal events
// (CRNX cash-out $85.00, LBRDK -> 0.236 CHTR Class A) plus SEC-sourced
// MSFT/NVDA dividends, on the existing runPortfolio engine (unchanged).
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const TS = require(path.join(ROOT, 'quant/engines/realtime/trading-session.js'));
const CAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/market-calendar.json'), 'utf8'));
const EVD = 'docs/quant-recovery/v9/portfolio';
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const closeAt = d => TS.sessionFor(d, { calendar: CAL, exchange: 'XNYS' }).close;

function main() {
  const out = path.resolve(arg('out', '')), summaryPath = arg('summary');
  if (!arg('out') || !path.relative(ROOT, out).startsWith('..')) throw Error('PRIVATE_OUTPUT_REQUIRED');
  fs.mkdirSync(out, { recursive: true });
  const files = ['dividend-evidence.json', 'split-evidence.json', 'terminal-ledger-events.json'];
  const hashes = Object.fromEntries(files.map(f => [EVD + '/' + f, C.shaFile(path.join(ROOT, EVD, f))]));
  const reg = { id: 'V9-PORTFOLIO-TERMINAL-DAILY', version: '1.0.0', frozenAt: new Date().toISOString(), analysisMode: 'MECHANICS_ACCEPTANCE_RETROSPECTIVE',
    holdings: ['MSFT', 'NVDA', 'CRNX', 'LBRDK'], successorOnly: ['CHTR'], period: ['2025-10-01', '2026-10-26'], initialCapital: 100000,
    weights: '0.9/4 equal at the first execution; buy-and-hold', secondRebalance: { decisionDate: '2026-10-01', weights: '0.9/3 MSFT, NVDA, CHTR' },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 }, clock: 'daily sessions of discover-series (MSFT calendar); closeAt from market-calendar incl. early closes',
    rules: { prices: 'split-adjusted daily closes used as raw: no sourced or provider split for these listings inside the window (checked)', terminalBars: 'bars after the sourced last trading session are excluded (provider carry-forward closes)',
      terminalCashPayDate: { CONSERVATIVE: 'last session of the run (credit date not stated in source; claim never investable in-window)', OPTIMISTIC_UNSOURCED: 'closing date (right-to-receive date; labelled assumption)' },
      dividends: 'MSFT/NVDA SEC-sourced; T+1 regime ex-date = record date (rule, not sourced); entitlement at that session; cash at sourced payDate' },
    runs: ['HOLD_CONSERVATIVE (primary)', 'HOLD_OPTIMISTIC_UNSOURCED', 'REBAL_CONSERVATIVE (expected guard failure)', 'REBAL_OPTIMISTIC_UNSOURCED', 'PRICE_SIMULATION_ATTEMPT (expected contract rejection)'],
    evidenceHashes: hashes, codeHash: C.shaFile(__filename), priorExposure: 'none of these terminal names used in earlier studies' };
  reg.registrationHash = C.hash(reg);
  fs.writeFileSync(path.join(out, 'registration.json'), JSON.stringify(reg, null, 1));

  const div = read(EVD + '/dividend-evidence.json'), spl = read(EVD + '/split-evidence.json'), term = read(EVD + '/terminal-ledger-events.json');
  const daily = t => read('quant/data/market/discover-series/ref_' + t + '.json');
  const dates = daily('MSFT').points.map(p => p[0]).filter(d => d >= reg.period[0] && d <= reg.period[1]);
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  const closeOf = new Map(sessions.map(s => [s.date, s.closeAt]));
  const prev = d => dates[dates.indexOf(d) - 1];
  const audit = { splitCheck: {}, bars: {}, events: [] };
  const mk = (t, lastTradeDate, events) => {
    const s = daily(t);
    const longCA = read('quant/data/market/discover-series-long/ref_' + t + '.json').corporateActions.splits.filter(x => x[0] > dates[0] && x[0] <= dates.at(-1));
    const sourced = spl.splits.filter(x => x.ticker === t && x.status === 'SOURCED' && x.effectiveDate > dates[0] && x.effectiveDate <= dates.at(-1));
    if (longCA.length || sourced.length) throw Error('SPLIT_IN_WINDOW ' + t);
    audit.splitCheck[t] = { providerSplitsInWindow: 0, sourcedSplitsInWindow: 0 };
    const pts = s.points.filter(p => closeOf.has(p[0]) && (!lastTradeDate || p[0] <= lastTradeDate));
    const excluded = s.points.filter(p => closeOf.has(p[0]) && lastTradeDate && p[0] > lastTradeDate).map(p => p);
    audit.bars[t] = { used: pts.length, first: pts[0][0], last: pts.at(-1)[0], excludedAfterLastTrade: excluded };
    const need = dates.filter(d => !lastTradeDate || d <= lastTradeDate);
    if (need.some(d => !pts.find(p => p[0] === d))) throw Error('MISSING_BAR ' + t);
    return { listingId: 'ref_' + t, issuerId: 'ISSUER_' + t, mic: 'XNAS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: dates[0], lastTradeDate,
      bars: pts.map(p => ({ date: p[0], close: p[1], availableAt: closeOf.get(p[0]) })), events };
  };
  const divEvents = t => div.companies.find(c => c.ticker === t).events.filter(e => e.recordDate >= dates[0] && e.recordDate <= dates.at(-1)).map(e => {
    if (!closeOf.has(e.recordDate)) throw Error('RECORD_DATE_NOT_SESSION ' + e.recordDate);
    const close = Date.parse(closeOf.get(e.recordDate)), sec = e.firstSecAvailability.acceptanceUtc;
    const tier = Date.parse(sec) <= close ? 'SEC_ACCEPTANCE' : e.declarationDate && Date.parse(e.declarationDate + 'T23:59:59.000Z') <= close ? 'ISSUER_STATED_DECLARATION_DATE_RETROSPECTIVE' : null;
    if (!tier) throw Error('EVENT_NOT_AVAILABLE ' + t + e.recordDate);
    audit.events.push({ ticker: t, type: 'CASH_DIVIDEND', recordDate: e.recordDate, payDate: e.payDate, amount: e.amount, tier });
    return { id: `${t}:DIV:${e.recordDate}`, type: 'CASH_DIVIDEND', effectiveDate: e.recordDate, payDate: e.payDate, amount: Number(e.amount), currency: 'USD',
      availableAt: tier === 'SEC_ACCEPTANCE' ? sec : e.declarationDate + 'T23:59:59.000Z', sourceHash: e.firstSecAvailability.sha256, sequence: 0 };
  });
  const crnx = term.events.find(e => e.ticker === 'CRNX'), lbrdk = term.events.find(e => e.ticker === 'LBRDK');
  const termEvent = (e, payMode) => {
    const eff = e.type === 'TERMINAL_CASH' ? e.closingDate : dates.find(d => d > e.closingDate);
    const pay = payMode === 'CONSERVATIVE' ? dates.at(-1) : eff;
    return { id: `${e.ticker}:${e.type}:${e.closingDate}`, type: e.type, effectiveDate: eff, payDate: pay, amount: Number(e.cashPerShare), currency: 'USD',
      availableAt: e.ledgerAvailableAt, sourceHash: e.sha256, sequence: 0, ...(e.type === 'TERMINAL_EXCHANGE' ? { successorListingId: 'ref_' + e.successor, shareRatio: Number(e.shareRatio) } : {}) };
  };
  const build = payMode => {
    const tc = termEvent(crnx, payMode), tx = termEvent(lbrdk, payMode);
    return [mk('MSFT', null, divEvents('MSFT')), mk('NVDA', null, divEvents('NVDA')), mk('CRNX', prev(tc.effectiveDate), [tc]), mk('LBRDK', prev(tx.effectiveDate), [tx]), mk('CHTR', null, [])];
  };
  // Global unique (effectiveDate, sequence).
  const seq = listings => { const by = {}; listings.flatMap(l => l.events).forEach(e => (by[e.effectiveDate] = by[e.effectiveDate] || []).push(e)); Object.values(by).forEach(l => l.sort((a, b) => a.id.localeCompare(b.id)).forEach((e, i) => { e.sequence = i; })); return listings; };
  const ids = ['ref_MSFT', 'ref_NVDA', 'ref_CRNX', 'ref_LBRDK', 'ref_CHTR'];
  const mh = C.hash({ ids, reg: reg.registrationHash });
  const snaps = dates.filter((d, k) => k % 20 === 0).map(date => ({ effectiveAt: date + 'T00:00:00Z', availableAt: date + 'T00:00:00Z', sourceHash: C.hash({ date, mh }), members: ids }));
  const snapFor = d => snaps.filter(s => s.effectiveAt.slice(0, 10) <= d).at(-1).sourceHash;
  const t1 = { decisionDate: dates[0], executionDate: dates[1], availableAt: closeOf.get(dates[0]), membershipHash: snapFor(dates[0]), weights: { ref_MSFT: 0.225, ref_NVDA: 0.225, ref_CRNX: 0.225, ref_LBRDK: 0.225 } };
  const d2 = reg.secondRebalance.decisionDate;
  const t2 = { decisionDate: d2, executionDate: dates[dates.indexOf(d2) + 1], availableAt: closeOf.get(d2), membershipHash: snapFor(d2), weights: { ref_MSFT: 0.3, ref_NVDA: 0.3, ref_CHTR: 0.3 } };
  const prov = { mode: 'HISTORICAL_OBSERVED', datasetHash: C.hash({ series: ['MSFT', 'NVDA', 'CRNX', 'LBRDK', 'CHTR'].map(t => C.shaFile(path.join(ROOT, 'quant/data/market/discover-series/ref_' + t + '.json'))), hashes }),
    identityEvidence: C.shaFile(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json')), populationEvidence: reg.registrationHash, corporateActionEvidence: C.hash(hashes),
    lifecycleEvidence: hashes[EVD + '/terminal-ledger-events.json'], licenseEvidence: C.hash(['MSFT'].map(t => daily(t).publishBasis || 'see discover-series-long publishBasis')),
    historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 };
  const input = (listings, targets, provenance = prov, basis = 'TOTAL_RETURN') => ({ sessions, initialCapital: reg.initialCapital, currency: 'USD', returnBasis: basis, provenance, costs: reg.costs, maxMembershipAgeDays: 45, maxFactorAgeDays: 45,
    listings: seq(listings), memberships: snaps, factorSnapshots: [], targets,
    benchmark: { currency: 'USD', returnBasis: basis, sourceHash: C.hash({ benchmark: 'ZERO_RATE_CASH', reg: reg.registrationHash }), costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 1 })) } });
  const runs = {};
  const exec = (name, inp) => { fs.writeFileSync(path.join(out, name + '-input.json'), JSON.stringify(inp)); try { const r = P.runPortfolio(inp); fs.writeFileSync(path.join(out, name + '-result.json'), JSON.stringify(r));
    const at = d => r.equity.find(e => e.date === d);
    runs[name] = { endCapital: r.endCapital, metrics: r.metrics, trades: r.trades.length, eventLedger: r.eventLedger.map(e => ({ date: e.date, eventId: e.eventId, type: e.type, entitlementUnits: e.entitlementUnits })),
      openReceivables: r.openReceivables, chtrUnitsAfterExchange: (at(dates.find(d => d > lbrdk.closingDate)).positions.find(p => p.listingId === 'ref_CHTR') || {}).units || 0,
      receivableAtCrnxClose: at(crnx.closingDate).receivables, cashAtCrnxClose: at(crnx.closingDate).cash, resultHash: r.resultHash }; return r; } catch (e) { runs[name] = { error: e.code || e.message }; return null; } };
  exec('HOLD_CONSERVATIVE', input(build('CONSERVATIVE'), [t1]));
  exec('HOLD_OPTIMISTIC_UNSOURCED', input(build('OPTIMISTIC'), [t1]));
  exec('REBAL_CONSERVATIVE', input(build('CONSERVATIVE'), [t1, t2]));
  exec('REBAL_OPTIMISTIC_UNSOURCED', input(build('OPTIMISTIC'), [t1, t2]));
  exec('PRICE_SIMULATION_ATTEMPT', input(build('CONSERVATIVE'), [t1], { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: prov.datasetHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' }, 'PRICE_RETURN'));
  const summary = { schemaVersion: 'v9-portfolio-ledger-terminal-daily-1.0.0', registration: reg, sessions: dates.length, period: [dates[0], dates.at(-1)], audit, runs,
    runtime: C.runtime(), engineSha256: C.shaFile(path.join(ROOT, 'quant/engines/research-portfolio.cjs')), runnerSha256: C.shaFile(__filename), certification: 'NOT_CERTIFIED', productionApproved: false };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  if (summaryPath) fs.writeFileSync(path.resolve(summaryPath), JSON.stringify(summary, null, 1) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.error || { end: v.endCapital, chtr: v.chtrUnitsAfterExchange, recvCrnx: v.receivableAtCrnxClose, open: v.openReceivables.length, trades: v.trades }])), null, 1));
  console.log(JSON.stringify(audit.bars));
}
main();
