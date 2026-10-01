// Bounded, server-only evidence collection. No production writes or source switch.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { createMarketstackClient } = require('../../providers/marketstack/client.js');
const arg = (n, fallback) => process.argv.find(a => a.startsWith('--' + n + '='))?.slice(n.length + 3) || fallback;
const out = resolve(arg('out', '.market-cache/marketstack/probe.json'));
const key = process.env.MARKETSTACK_API_KEY;
const maxCredits = Math.min(300, Number(arg('max-credits', '250')));
if (!Number.isInteger(maxCredits) || maxCredits < 1) throw Error('INVALID_BUDGET');
const report = { schemaVersion: 'marketstack-probe-1.0.0', generatedAt: new Date().toISOString(), state: key ? 'RUNNING' : 'NOT_CONFIGURED',
  run: { source: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local', runId: process.env.GITHUB_RUN_ID || null, commit: process.env.GITHUB_SHA || null },
  budget: { maxCredits, maxRequests: 160, semantics: 'CONSERVATIVE_ESTIMATE_NOT_ACCOUNT_BALANCE' }, endpoints: [] };
if (key) {
  const client = createMarketstackClient({ apiKey: key, maxCredits, maxRequests: 160, maxRetries: 1, timeoutMs: 20000 });
  async function probe(endpoint, params, label) {
    const started = Date.now();
    const r = await client.request('/' + endpoint, params);
    report.endpoints.push({ endpoint, params, label, durationMs: Date.now() - started, checkedAt: new Date().toISOString(), ...r });
    save();
    return r;
  }
  function save() { report.accounting = client.stats(); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
  await probe('exchanges', { limit: 1000 }, 'exchange-metadata');
  // Explicit US sample covers share classes, ADRs, IPOs and corporate actions.
  for (const ticker of ['NVDA','AAPL','PLTR','TSLA','MSFT','JPM','XOM','BRK.B','BRK.A','GOOG','GOOGL','TSM','BABA','XPEV','F','RIVN','ARM','GME','CROX','ACMR','ASTS','RKLB','KOPN','SPY','QQQ','VOO','VTI','IWM','ARKK']) {
    await probe('eod', { symbols: ticker, date_from: '2026-09-21', date_to: '2026-09-30', limit: 100 }, 'us-eod');
  }
  for (const search of ['SAP','Siemens','Rheinmetall','Allianz','Deutsche Telekom','ASML','LVMH','Airbus','Novo Nordisk','Nestle','Shell','Ferrari','Samsung','SK Hynix','Toyota','Sony','MSCI World','FTSE All-World','UCITS']) {
    await probe('tickerslist', { search, limit: 100 }, 'global-discovery');
  }
  for (const mic of ['XETR','XFRA','XPAR','XAMS','XBRU','XMIL','XMAD','XWBO','XSWX','XLON','XCSE','XSTO','XOSL','XHEL','XTKS','XKRX','XTAI','XHKG','XSHG','XBOM','BVMF']) {
    await probe('exchanges/' + mic + '/tickers', { limit: 1000 }, 'venue-discovery');
  }
  for (const [symbols,exchange] of [['NVDA','XNAS'],['SPY','ARCX'],['SAP','XETR'],['MC','XPAR'],['7203','XTKS']]) {
    await probe('intraday/latest', { symbols, exchange, interval: '1min', limit: 10 }, 'intraday-availability');
    await probe('stockprice', { ticker: symbols, exchange }, 'snapshot-availability');
  }
  await probe('intraday', { symbols: 'NVDA', interval: '5min', after_hours: true, date_from: '2026-09-29', date_to: '2026-09-30', limit: 1000 }, 'us-extended-hours');
  for (const ticker of ['SPY','QQQ','VOO']) await probe('etfholdings', { ticker, limit: 1000 }, 'etf-holdings');
  await probe('etflist', { limit: 1000 }, 'etf-metadata');
  for (const endpoint of ['company_facts','concept/accounts_payable','submissions']) await probe(endpoint, { cik_code: '0000320193', limit: 1 }, 'fundamental-entitlement');
  await probe('tickerinfo', { ticker: 'AAPL' }, 'company-details-entitlement');
  await probe('companyratings', { ticker: 'AAPL' }, 'ratings-entitlement');
  // Split/dividend/history evidence, independent of the current EOD comparison window.
  for (const [symbols,from,to] of [['NVDA','2024-06-03','2024-06-14'],['AAPL','2020-08-24','2020-09-04'],['SPY','2026-09-01','2026-09-30']]) {
    await probe('eod', { symbols, date_from: from, date_to: to, limit: 100 }, 'corporate-action-window');
    await probe('splits', { symbols, date_from: from, date_to: to, limit: 100 }, 'split-endpoint');
    await probe('dividends', { symbols, date_from: from, date_to: to, limit: 100 }, 'dividend-endpoint');
  }
  report.state = report.endpoints.some(e => e.ok) ? 'MEASURED' : 'UNAVAILABLE';
  report.accounting = client.stats();
}
mkdirSync(dirname(out), { recursive: true });
const encoded = JSON.stringify(report, null, 2) + '\n';
if (key && encoded.includes(key)) throw Error('SECRET_IN_OUTPUT_REJECTED');
writeFileSync(out, encoded);
console.log(JSON.stringify({ state: report.state, endpoints: report.endpoints.length, accounting: report.accounting || null }));
