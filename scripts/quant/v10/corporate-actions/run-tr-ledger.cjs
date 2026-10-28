#!/usr/bin/env node
'use strict';
/* V10 TR register: run the EXISTING research ledger (research-portfolio.cjs runPortfolio, unchanged) on the register's
 * CASH_DIVIDEND events, one single-title buy-and-hold ledger per title over its longest TOTAL_RETURN window
 * (tr-protocol-1.0.3 "parity"): buy at the first execution session (weight 1, no costs), hold, dividend cash credited at the
 * first weekly session on/after payDate (not reinvested). Also the same window price-only (no events) and the CA status of the
 * series via createResearchLoader. Full inputs/results go to --private (outside the repo); a compact summary to --out.
 *   node run-tr-ledger.cjs --register <tr-register.json> --private <dir> --out <summary.json>
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const TS = require(path.join(ROOT, 'quant/engines/realtime/trading-session.js'));
const Research = require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs'));
const CAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/market-calendar.json'), 'utf8'));
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const regPath = arg('register'), priv = arg('private'), out = arg('out');
if (!regPath || !priv || !out || !path.relative(ROOT, path.resolve(priv)).startsWith('..')) { console.error('usage: --register <json> --private <dir outside repo> --out <json>'); process.exit(2); }
fs.mkdirSync(priv, { recursive: true });
const closeAt = d => d >= CAL.coverage.from ? TS.sessionFor(d, { calendar: CAL, exchange: 'XNYS' }).close : TS.localToUtc(d, '16:00', 'America/New_York');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const regBytes = fs.readFileSync(regPath), reg = JSON.parse(regBytes);
const caLoader = Research.createResearchLoader(ROOT, { identityEvidence: true, corporateActionEvidence: true });
const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));

function input(t, w, withEvents) {
  const seriesPath = path.join(ROOT, 'quant/data/market/discover-series-long/' + t.securityId + '.json');
  const doc = JSON.parse(fs.readFileSync(seriesPath, 'utf8'));
  const pts = doc.points.filter(p => p[0] >= w.from && p[0] <= w.to);
  const dates = pts.map(p => p[0]);
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  const events = withEvents ? t.portfolioEvents.filter(e => e.effectiveDate >= dates[0] && e.effectiveDate <= dates.at(-1)) : [];
  const row = master.rows.find(r => r.baseline_security_id === t.securityId) || {};
  const listing = { listingId: t.securityId, issuerId: 'CIK' + t.cik, mic: row.exchange === 'NASDAQ' ? 'XNAS' : 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD',
    firstTradeDate: dates[0], lastTradeDate: null, bars: pts.map((p, i) => ({ date: p[0], close: p[1], availableAt: sessions[i].closeAt })), events };
  const regHash = sha(regBytes), mh = C.hash({ ids: [t.securityId], register: regHash });
  const returnBasis = 'TOTAL_RETURN';
  return { dates, inp: {
    sessions, initialCapital: 100000, currency: 'USD', returnBasis,
    provenance: { mode: 'HISTORICAL_OBSERVED', datasetHash: C.hash({ series: sha(fs.readFileSync(seriesPath)), register: regHash }), identityEvidence: sha(JSON.stringify(row)), populationEvidence: mh,
      corporateActionEvidence: regHash, lifecycleEvidence: C.hash({ continuousWeeklyCoverage: t.securityId, window: w }), licenseEvidence: C.hash(doc.publishBasis || ''),
      historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 },
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 }, maxMembershipAgeDays: 45, maxFactorAgeDays: 45,
    listings: [listing], memberships: [{ effectiveAt: dates[0] + 'T00:00:00Z', availableAt: dates[0] + 'T00:00:00Z', sourceHash: C.hash({ d: dates[0], mh }), members: [t.securityId] }], factorSnapshots: [],
    targets: [{ decisionDate: dates[0], executionDate: dates[1], availableAt: sessions[0].closeAt, membershipHash: C.hash({ d: dates[0], mh }), weights: { [t.securityId]: 1 } }],
    benchmark: { currency: 'USD', returnBasis, sourceHash: C.hash({ benchmark: 'ZERO_RATE_CASH_CONSTANT_LEVEL', register: regHash }), costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 1 })) } } };
}

const summary = [];
for (const t of reg.titles) {
  let ca;
  try { const r = caLoader(t.securityId); ca = { status: 'QUALIFIED', returnBasis: r.returnBasis }; } catch (e) { ca = { status: 'CA_OR_IDENTITY_UNRESOLVED', reason: String(e.message).split(':')[0] }; }
  const w = [...t.totalReturnWindows].sort((a, b) => (Date.parse(b.to) - Date.parse(b.from)) - (Date.parse(a.to) - Date.parse(a.from)) || a.from.localeCompare(b.from))[0];
  if (!w || ca.status !== 'QUALIFIED') { summary.push({ ticker: t.ticker, securityId: t.securityId, loader: ca, window: w || null, run: null, note: !w ? 'NO_TOTAL_RETURN_WINDOW' : 'SERIES_NOT_QUALIFIED' }); continue; }
  const res = {};
  for (const [name, withEvents] of [['TR_PAYDATE', true], ['NO_EVENTS', false]]) {
    const { inp, dates } = input(t, w, withEvents);
    fs.writeFileSync(path.join(priv, t.ticker + '-' + name + '-input.json'), JSON.stringify(inp));
    try {
      const r = P.runPortfolio(inp);
      fs.writeFileSync(path.join(priv, t.ticker + '-' + name + '-result.json'), JSON.stringify(r));
      const last = r.equity.at(-1);
      res[name] = { sessions: dates.length, from: dates[0], to: dates.at(-1), executionDate: dates[1], endCapital: r.endCapital, endCash: last.cash, endReceivables: last.receivables,
        units: r.trades[0] ? r.trades[0].units : null, buyPrice: r.trades[0] ? r.trades[0].price : null,
        dividendEvents: r.eventLedger.filter(e => e.type === 'CASH_DIVIDEND').length, eventsEntitled: r.eventLedger.filter(e => e.type === 'CASH_DIVIDEND' && e.entitlementUnits > 0).length,
        openReceivables: r.openReceivables.length, cumulativeReturn: r.metrics.cumulativeReturn, cagr: r.metrics.cagr, inputHash: r.inputHash, resultHash: r.resultHash };
    } catch (e) { res[name] = { error: e.code || e.message }; }
  }
  summary.push({ ticker: t.ticker, securityId: t.securityId, loader: ca, window: w, runs: res,
    trMinusPrCagr: res.TR_PAYDATE.cagr != null && res.NO_EVENTS.cagr != null ? res.TR_PAYDATE.cagr - res.NO_EVENTS.cagr : null });
}
const report = { schemaVersion: 'v10-tr-ledger-summary-1.0.0', evidenceKind: 'TECHNICAL_PARITY', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
  register: path.relative(ROOT, path.resolve(regPath)), registerSha256: sha(regBytes), engine: 'quant/engines/research-portfolio.cjs (unchanged)', engineSha256: sha(fs.readFileSync(path.join(ROOT, 'quant/engines/research-portfolio.cjs'))),
  codeSha256: sha(fs.readFileSync(__filename)), runtime: { node: process.version },
  mechanics: 'single title, buy at first execution session with weight 1 and zero costs, hold; CASH_DIVIDEND at entitlementSession (first weekly session on/after the DERIVED ex-date), cash credited at first weekly session on/after the SOURCED payDate, not reinvested; open receivables at the end are counted as equity by the engine and reported separately',
  returnBasisNote: 'NO_EVENTS = same window, price-only (split-adjusted closes); the difference is the dividend cash only. Not a strategy result.',
  titles: summary };
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(summary.map(s => ({ t: s.ticker, ca: s.loader.status, w: s.window && [s.window.from, s.window.to], tr: s.runs && s.runs.TR_PAYDATE.endCapital, pr: s.runs && s.runs.NO_EVENTS.endCapital, err: s.runs && (s.runs.TR_PAYDATE.error || s.runs.NO_EVENTS.error) }))));
