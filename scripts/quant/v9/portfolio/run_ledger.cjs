#!/usr/bin/env node
'use strict';
// V9 portfolio: run the EXISTING research ledger (runPortfolio) on real,
// SEC-sourced dividend, split and terminal events. No engine change.
// Registration is written and hashed before any outcome is computed.
// Full inputs/results go to a private directory outside the repository; only
// a compact summary is written to --summary.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const TS = require(path.join(ROOT, 'quant/engines/realtime/trading-session.js'));
const RS = require(path.join(ROOT, 'quant/engines/return-series.js'));
const CAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/market-calendar.json'), 'utf8'));
const EVD = 'docs/quant-recovery/v9/portfolio';

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const closeAt = d => d >= CAL.coverage.from ? TS.sessionFor(d, { calendar: CAL, exchange: 'XNYS' }).close : TS.localToUtc(d, '16:00', 'America/New_York');
function addWeekdays(d, n) { // n<0: go back n weekdays; holidays from the calendar where covered (2022+)
  let t = Date.parse(d + 'T00:00:00Z'), k = Math.abs(n), s = Math.sign(n);
  const hol = new Set(CAL.exchanges.XNYS.holidays);
  while (k > 0) { t += s * 86400000; const x = new Date(t), iso = x.toISOString().slice(0, 10); if (x.getUTCDay() % 6 !== 0 && !hol.has(iso)) k--; }
  return new Date(t).toISOString().slice(0, 10);
}
// Settlement-cycle rule (not a sourced ex-date): T+3 -> record-2bd, T+2 (from 2017-09-05) -> record-1bd, T+1 (from 2024-05-28) -> record.
const ruleExDate = rec => addWeekdays(rec, rec >= '2024-05-28' ? 0 : rec >= '2017-09-07' ? -1 : -2);
const firstOnOrAfter = (dates, d) => dates.find(x => x >= d) || null;

function weeklyStudy(reg) {
  const div = read(EVD + '/dividend-evidence.json'), spl = read(EVD + '/split-evidence.json');
  const series = Object.fromEntries(reg.universe.map(t => [t, read('quant/data/market/discover-series-long/ref_' + t + '.json')]));
  const dateSets = reg.universe.map(t => new Set(series[t].points.map(p => p[0])));
  const dates = series[reg.universe[0]].points.map(p => p[0]).filter(d => d >= reg.period[0] && d <= reg.period[1] && dateSets.every(s => s.has(d)));
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  const closeOf = new Map(sessions.map(s => [s.date, s.closeAt]));
  const audit = { events: [], splitCrossCheck: [] };
  const listings = reg.universe.map(t => {
    const splits = spl.splits.filter(s => s.ticker === t && s.kind === 'SPLIT');
    if (splits.some(s => s.status !== 'SOURCED')) throw Error('UNSOURCED_SPLIT ' + t);
    // Cross-check sourced splits against provider corporateActions and return-series splitFactors.
    const prov = series[t].corporateActions.splits.filter(s => s[0] >= reg.period[0] && s[0] <= reg.period[1]);
    const pts = series[t].points.filter(p => p[0] >= reg.period[0] && p[0] <= reg.period[1]);
    const rsBars = pts.map(p => ({ date: p[0], splitFactor: 1 }));
    for (const s of splits) { const i = rsBars.findIndex(b => b.date >= s.effectiveDate); if (i >= 0) rsBars[i].splitFactor = s.ratio; }
    const rsF = RS.splitFactors(rsBars);
    const factor = d => splits.filter(s => s.effectiveDate > d).reduce((f, s) => f * s.ratio, 1);
    audit.splitCrossCheck.push({ ticker: t, sourced: splits.map(s => [s.effectiveDate, s.ratio]), provider: prov,
      equal: JSON.stringify(splits.map(s => [s.effectiveDate, s.ratio])) === JSON.stringify(prov),
      returnSeriesSplitFactorsAgree: pts.every((p, i) => rsF[i] === factor(p[0])) });
    const bars = pts.filter(p => closeOf.has(p[0])).map(p => ({ date: p[0], close: p[1] * factor(p[0]), availableAt: closeOf.get(p[0]) }));
    const events = [];
    for (const s of splits) {
      const eff = firstOnOrAfter(dates, s.effectiveDate);
      if (!eff) continue;
      events.push({ id: `${t}:SPLIT:${s.effectiveDate}`, type: 'SPLIT', effectiveDate: eff, ratio: s.ratio, availableAt: s.availableAt,
        sourceHash: s.documents.find(x => x.ratioStated)?.sha256, sequence: 0, _date: s.effectiveDate });
    }
    const comp = div.companies.find(c => c.ticker === t);
    for (const e of comp.events) {
      if (!e.payDate || !e.amount) throw Error('INCOMPLETE_DIVIDEND ' + t + ' ' + e.recordDate);
      const lo = firstOnOrAfter(dates, addWeekdays(e.recordDate, -3)), hi = firstOnOrAfter(dates, e.recordDate), ex = ruleExDate(e.recordDate);
      const eff = firstOnOrAfter(dates, ex);
      if (!eff || eff > reg.period[1]) continue;
      if (eff < dates[0]) continue;
      const close = Date.parse(closeOf.get(eff));
      const sec = e.firstSecAvailability && e.firstSecAvailability.acceptanceUtc;
      let availableAt, tier;
      if (sec && Date.parse(sec) <= close) { availableAt = sec; tier = 'SEC_ACCEPTANCE'; }
      else if (e.declarationDate && Date.parse(e.declarationDate + 'T23:59:59.000Z') <= close) { availableAt = e.declarationDate + 'T23:59:59.000Z'; tier = 'ISSUER_STATED_DECLARATION_DATE_RETROSPECTIVE'; }
      else { availableAt = null; tier = 'NOT_AVAILABLE_BY_ENTITLEMENT_SESSION'; }
      audit.events.push({ ticker: t, recordDate: e.recordDate, ruleExDate: ex, entitlementSession: eff, mappingInvariant: lo === hi, payDate: e.payDate, amount: e.amount, availabilityTier: tier, secAcceptance: sec || null });
      if (!availableAt) throw Error('EVENT_NOT_AVAILABLE_BY_ENTITLEMENT ' + t + ' ' + e.recordDate);
      events.push({ id: `${t}:DIV:${e.recordDate}`, type: 'CASH_DIVIDEND', effectiveDate: eff, payDate: e.payDate, amount: Number(e.amount), currency: 'USD',
        availableAt, sourceHash: e.firstSecAvailability.sha256, sequence: 0, _date: ex });
    }
    // Same-session ordering follows the sourced calendar dates (split trading date vs rule ex-date).
    const bySession = {};
    events.forEach(e => (bySession[e.effectiveDate] = bySession[e.effectiveDate] || []).push(e));
    Object.values(bySession).forEach(list => list.sort((a, b) => a._date.localeCompare(b._date) || a.type.localeCompare(b.type)).forEach((e, i) => { e.sequence = i; }));
    events.forEach(e => delete e._date);
    return { listingId: 'ref_' + t, issuerId: 'ISSUER_' + t, mic: /NASDAQ/.test(reg.mic[t]) ? 'XNAS' : 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true,
      currency: 'USD', firstTradeDate: dates[0], lastTradeDate: null, bars, events, _adjusted: pts.filter(p => closeOf.has(p[0])).map(p => ({ date: p[0], close: p[1], availableAt: closeOf.get(p[0]) })) };
  });
  return { sessions, dates, listings, audit };
}

function baseInput(reg, sessions, dates, listings, provenance, returnBasis, weightsTotal) {
  const ids = listings.map(l => l.listingId), mh = C.hash({ ids, registration: reg.registrationHash });
  const snapshots = dates.filter((d, k) => k % reg.rebalanceEverySessions === 0).map(date => ({ effectiveAt: date + 'T00:00:00Z', availableAt: date + 'T00:00:00Z', sourceHash: C.hash({ date, mh }), members: ids }));
  const snapFor = d => { const k = dates.indexOf(d); return C.hash({ date: dates[Math.floor(k / reg.rebalanceEverySessions) * reg.rebalanceEverySessions], mh }); };
  const w = Object.fromEntries(ids.map(i => [i, weightsTotal / ids.length]));
  const targets = dates.slice(0, -1).filter((d, k) => k % reg.rebalanceEverySessions === 0).map(decisionDate => ({ decisionDate, executionDate: dates[dates.indexOf(decisionDate) + 1], availableAt: sessions[dates.indexOf(decisionDate)].closeAt, membershipHash: snapFor(decisionDate), weights: w }));
  return { sessions, initialCapital: reg.initialCapital, currency: 'USD', returnBasis, provenance, costs: reg.costs, maxMembershipAgeDays: 45, maxFactorAgeDays: 45,
    listings: listings.map(({ _adjusted, ...l }) => l), memberships: snapshots, factorSnapshots: [], targets,
    benchmark: { currency: 'USD', returnBasis, sourceHash: C.hash({ benchmark: 'ZERO_RATE_CASH_CONSTANT_LEVEL', registration: reg.registrationHash }), costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 1 })) } };
}

function summarize(r) {
  return { endCapital: r.endCapital, metrics: r.metrics, rebalances: r.rebalances.length, trades: r.trades.length, events: r.eventLedger.length,
    openReceivables: r.openReceivables.length, resultHash: r.resultHash, inputHash: r.inputHash,
    maxReceivables: Math.max(...r.equity.map(e => e.receivables)), dividendCashCredited: null };
}

function main() {
  const out = path.resolve(arg('out', '')), summaryPath = arg('summary');
  if (!arg('out') || !path.relative(ROOT, out).startsWith('..')) throw Error('PRIVATE_OUTPUT_REQUIRED');
  fs.mkdirSync(out, { recursive: true });
  const hashes = Object.fromEntries(['dividend-evidence.json', 'split-evidence.json', 'terminal-evidence.json'].filter(f => fs.existsSync(path.join(ROOT, EVD, f))).map(f => [EVD + '/' + f, C.shaFile(path.join(ROOT, EVD, f))]));
  const universe = (arg('universe', 'JPM,MSFT,NVDA')).split(',');
  const master = read('quant/data/market/security-master/us-security-master.json');
  const mic = Object.fromEntries(universe.map(t => [t, (master.rows.find(r => r.baseline_security_id === 'ref_' + t) || {}).canonical_id || '']));
  const reg = { id: 'V9-PORTFOLIO-TR-WEEKLY', version: '1.0.0', frozenAt: new Date().toISOString(), analysisMode: 'MECHANICS_ACCEPTANCE_RETROSPECTIVE',
    purpose: 'Exercise the existing ledger with SEC-sourced dividends (pay-date cash), sourced splits; compare with split-adjusted price-only run. Not a strategy test.',
    universe, mic, period: [arg('from', '2015-01-01'), arg('to', '2026-10-23')], clock: 'Weekly sessions = last trading day per ISO week from discover-series-long; closeAt 16:00 America/New_York (calendar early closes from 2022)',
    initialCapital: 100000, weights: '0.9/n equal, 10% cash buffer', rebalanceEverySessions: Number(arg('every', '4')), costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 },
    benchmark: 'ZERO_RATE_CASH constant level (no market benchmark claim)',
    eventRules: { dividendEntitlementSession: 'first weekly session on/after settlement-rule ex-date derived from sourced record date (ex-date NOT sourced)', payDate: 'sourced payment date; cash credited at first weekly session on/after it', availability: 'SEC acceptance if <= entitlement session close, else issuer-stated declaration date (end of day UTC), else run fails', split: 'sourced first split-adjusted trading date mapped to first weekly session on/after it; raw price = split-adjusted close x product of later sourced split ratios' },
    runs: ['TR_PAYDATE (primary)', 'PRICE_ADJUSTED (HISTORICAL_PRICE_SIMULATION)', 'RAW_SPLITS_ONLY (diagnostic; must equal PRICE_ADJUSTED)', 'TR_EXDATE_CASH (forbidden-assumption diagnostic)', 'TR_FULLY_INVESTED (guard demonstration)'],
    primaryEndpoint: 'endCapital and cumulative return TR_PAYDATE vs PRICE_ADJUSTED; parity with independent Python ledger',
    priorExposure: 'Trio price-only portfolio explored in V7/V8; retrospective; no confirmatory claim', evidenceHashes: hashes, codeHash: C.shaFile(__filename) };
  reg.registrationHash = C.hash(reg);
  fs.writeFileSync(path.join(out, 'registration.json'), JSON.stringify(reg, null, 1));
  const { sessions, dates, listings, audit } = weeklyStudy(reg);
  const prov = { mode: 'HISTORICAL_OBSERVED', datasetHash: C.hash({ series: universe.map(t => C.shaFile(path.join(ROOT, 'quant/data/market/discover-series-long/ref_' + t + '.json'))), hashes }),
    identityEvidence: C.shaFile(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json')), populationEvidence: reg.registrationHash,
    corporateActionEvidence: C.hash(hashes), lifecycleEvidence: C.hash({ continuousWeeklyCoverage: universe, through: reg.period[1] }),
    licenseEvidence: C.hash(universe.map(t => read('quant/data/market/discover-series-long/ref_' + t + '.json').publishBasis)),
    historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 };
  const runs = {};
  const exec = (name, input) => { fs.writeFileSync(path.join(out, name + '-input.json'), JSON.stringify(input)); try { const r = P.runPortfolio(input); fs.writeFileSync(path.join(out, name + '-result.json'), JSON.stringify(r)); runs[name] = summarize(r); return r; } catch (e) { runs[name] = { error: e.code || e.message }; return null; } };
  const tr = exec('TR_PAYDATE', baseInput(reg, sessions, dates, listings, prov, 'TOTAL_RETURN', 0.9));
  const adj = listings.map(l => ({ ...l, bars: l._adjusted, events: [] }));
  exec('PRICE_ADJUSTED', baseInput(reg, sessions, dates, adj, { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: prov.datasetHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' }, 'PRICE_RETURN', 0.9));
  exec('RAW_SPLITS_ONLY', baseInput(reg, sessions, dates, listings.map(l => ({ ...l, events: l.events.filter(e => e.type === 'SPLIT') })), prov, 'TOTAL_RETURN', 0.9));
  exec('TR_EXDATE_CASH', baseInput(reg, sessions, dates, listings.map(l => ({ ...l, events: l.events.map(e => e.type === 'CASH_DIVIDEND' ? { ...e, payDate: e.effectiveDate } : e) })), prov, 'TOTAL_RETURN', 0.9));
  exec('TR_FULLY_INVESTED', baseInput(reg, sessions, dates, listings, prov, 'TOTAL_RETURN', 1));
  if (tr) {
    const divCash = tr.eventLedger.filter(e => e.type === 'CASH_DIVIDEND').reduce((s, e) => { const ev = listings.flatMap(l => l.events).find(x => x.id === e.eventId); return s + e.entitlementUnits * ev.amount; }, 0);
    runs.TR_PAYDATE.dividendCashCredited = divCash;
    runs.TR_PAYDATE.receivableSessions = tr.equity.filter(e => e.receivables > 0).length;
  }
  const p = runs.PRICE_ADJUSTED, s = runs.RAW_SPLITS_ONLY;
  const summary = { schemaVersion: 'v9-portfolio-ledger-weekly-1.0.0', registration: reg, sessions: dates.length, period: [dates[0], dates.at(-1)],
    eventCounts: Object.fromEntries(listings.map(l => [l.listingId, { dividends: l.events.filter(e => e.type === 'CASH_DIVIDEND').length, splits: l.events.filter(e => e.type === 'SPLIT').length }])),
    eventAudit: { mappingInvariant: audit.events.filter(e => e.mappingInvariant).length, mappingDependsOnRuleExDate: audit.events.filter(e => !e.mappingInvariant).length,
      availabilityTiers: audit.events.reduce((m, e) => (m[e.availabilityTier] = (m[e.availabilityTier] || 0) + 1, m), {}), rows: audit.events },
    splitCrossCheck: audit.splitCrossCheck, runs,
    comparisons: {
      totalVsPrice: runs.TR_PAYDATE.endCapital && p.endCapital ? { trEnd: runs.TR_PAYDATE.endCapital, priceEnd: p.endCapital, trCum: runs.TR_PAYDATE.metrics.cumulativeReturn, priceCum: p.metrics.cumulativeReturn, trCagr: runs.TR_PAYDATE.metrics.cagr, priceCagr: p.metrics.cagr, cagrDiff: runs.TR_PAYDATE.metrics.cagr - p.metrics.cagr } : null,
      rawSplitsOnlyVsPriceRelDiff: p.endCapital && s.endCapital ? Math.abs(s.endCapital / p.endCapital - 1) : null,
      exDateCashMinusPayDate: runs.TR_EXDATE_CASH.endCapital && runs.TR_PAYDATE.endCapital ? runs.TR_EXDATE_CASH.endCapital - runs.TR_PAYDATE.endCapital : null },
    runtime: C.runtime(), engineSha256: C.shaFile(path.join(ROOT, 'quant/engines/research-portfolio.cjs')), runnerSha256: C.shaFile(__filename),
    certification: 'NOT_CERTIFIED', productionApproved: false };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  if (summaryPath) fs.writeFileSync(path.resolve(summaryPath), JSON.stringify(summary, null, 1) + '\n');
  console.log(JSON.stringify({ runs, comparisons: summary.comparisons, eventAudit: { ...summary.eventAudit, rows: undefined }, splitCrossCheck: summary.splitCrossCheck }, null, 1));
}
main();
