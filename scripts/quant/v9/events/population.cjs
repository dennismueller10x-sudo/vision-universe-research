#!/usr/bin/env node
'use strict';
// V9 events: candidate population from repo daily series + security master + weekly qualification.
// Read-only on repo data. Writes only to a private directory outside the repository.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const A = require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const MIC = { NYSE: 'XNYS', NASDAQ: 'XNAS', AMEX: 'XASE', 'NYSE MKT': 'XASE' };
function main(outDir) {
  if (!outDir) throw Error('PRIVATE_OUTPUT_REQUIRED');
  const out = path.resolve(outDir); if (out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  fs.mkdirSync(out, { recursive: true });
  const masterPath = 'quant/data/market/security-master/us-security-master.json';
  const masterBytes = fs.readFileSync(path.join(ROOT, masterPath));
  const master = JSON.parse(masterBytes), byId = new Map(), canon = new Map();
  for (const r of master.rows) { const k = r.baseline_security_id; if (!k) continue; if (!byId.has(k)) byId.set(k, []); byId.get(k).push(r); if (!canon.has(r.canonical_id)) canon.set(r.canonical_id, new Set()); canon.get(r.canonical_id).add(k); }
  const loader = A.createLoader(ROOT);
  const dir = path.join(ROOT, 'quant/data/market/discover-series');
  const files = fs.readdirSync(dir).filter(f => /^ref_.+\.json$/.test(f)).sort();
  const rows = [], counts = {};
  const bump = k => { counts[k] = (counts[k] || 0) + 1; };
  for (const f of files) {
    const id = f.slice(0, -5), rel = 'quant/data/market/discover-series/' + f, bytes = fs.readFileSync(path.join(dir, f));
    let d; try { d = JSON.parse(bytes); } catch { bump('DAILY_PARSE_ERROR'); continue; }
    const row = { securityId: id, ticker: d.ticker, dailyPath: rel, dailySha256: sha(bytes), dailyFrom: d.from, dailyTo: d.to, dailyBars: (d.points || []).length };
    const reasons = [];
    if (d.dataMode !== 'real' || d.priceSeriesType !== 'SPLIT_ADJUSTED' || d.grain !== 'daily' || d.currency !== 'USD' || d.securityId !== id) reasons.push('DAILY_SCOPE_UNVERIFIED');
    const m = byId.get(id) || [];
    if (m.length !== 1 || canon.get(m[0].canonical_id)?.size !== 1) reasons.push('AMBIGUOUS_OR_MISSING_MASTER_IDENTITY');
    else {
      const r = m[0]; Object.assign(row, { canonicalId: r.canonical_id, exchange: r.exchange, instrumentType: r.instrument_type, eligibleUsEquity: r.eligible_us_equity, primaryListing: r.primary_listing, activeStatus: r.active_status, listingStart: r.start_date, masterTicker: r.ticker });
      if (r.instrument_type !== 'EQUITY_COMMON') reasons.push('NOT_EQUITY_COMMON');
      if (r.eligible_us_equity !== true) reasons.push('NOT_ELIGIBLE_US_EQUITY');
      if (r.primary_listing !== true) reasons.push('NOT_PRIMARY_LISTING');
      if (r.ticker !== d.ticker) reasons.push('TICKER_MISMATCH_MASTER_VS_DAILY');
      row.mic = MIC[r.exchange] || null; if (!row.mic) reasons.push('EXCHANGE_OUTSIDE_ENGINE_PRIMARY_MICS:' + r.exchange);
    }
    try { const w = loader(id); row.weekly = 'QUALIFIED'; row.identityHash = w.identityHash; row.masterGeneratedAt = w.masterGeneratedAt; }
    catch (e) { row.weekly = 'NOT_QUALIFIED'; row.weeklyReason = String(e.message).split(':')[0]; }
    if (row.weekly !== 'QUALIFIED') reasons.push('WEEKLY_NOT_QUALIFIED');
    row.reasons = reasons; row.eligible = reasons.length === 0;
    for (const x of reasons) bump(x.split(':')[0]); if (row.eligible) bump('ELIGIBLE');
    rows.push(row);
  }
  const doc = { schemaVersion: 'v9-events-population-1.0.0', masterPath, masterSha256: sha(masterBytes), masterGeneratedAt: master.generatedAt, dailyFiles: files.length, counts, eligible: rows.filter(r => r.eligible).length, rows };
  fs.writeFileSync(path.join(out, 'population.json'), JSON.stringify(doc));
  console.log(JSON.stringify({ dailyFiles: files.length, eligible: doc.eligible, counts }));
}
if (require.main === module) main(process.argv[2]);
module.exports = { main };
