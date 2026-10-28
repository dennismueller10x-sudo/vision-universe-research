#!/usr/bin/env node
/* V9 follow-up (corporate-action registry): build quant/engines/research-ca-evidence.cjs from the private verification facts
 * (verify_ca_events.py). Only series whose EVERY unresolved event has an admissible class (GENUINE_MOVE, SPINOFF_DISTRIBUTION)
 * are written (protocol.json#candidateFrame.seriesRule). Writes only --out.
 *   node build-ca-registry.cjs --facts <facts.jsonl> --out quant/engines/research-ca-evidence.cjs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const factsPath = opt('--facts'), out = opt('--out');
if (!factsPath || !out) { console.error('usage: --facts <facts.jsonl> --out <cjs>'); process.exit(2); }
const protocolBytes = fs.readFileSync(path.join(root, 'docs/quant-recovery/v9-followups/ca-registry/protocol.json'));
const protocolSha256 = crypto.createHash('sha256').update(protocolBytes).digest('hex');
const ADMISSIBLE = { GENUINE_MOVE: 'PRICE_RETURN', SPINOFF_DISTRIBUTION: 'PRICE_RETURN_ONLY' };
const accOf = url => { const m = /\/(\d{10})(\d{2})(\d{6})\//.exec(url); return m ? m[1] + '-' + m[2] + '-' + m[3] : null; };
const series = fs.readFileSync(factsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const records = [];
for (const s of series) {
  if (s.protocolSha256 !== protocolSha256) throw Error('FACTS_FROM_OTHER_PROTOCOL:' + s.securityId);
  if (!s.events.length || !s.events.every(e => Object.hasOwn(ADMISSIBLE, e.verdict))) continue;
  for (const e of s.events) {
    const idr = e.identity.find(x => x.result === 'PASS'), b = idr.before, a = idr.after;
    const coverQuote = c => 'dei:TradingSymbol ' + JSON.stringify(c.tradingSymbols) + '; dei:EntityCommonStockSharesOutstanding ' + c.shares + ' as of ' + c.coverDate
      + (c.exchanges.length ? '; dei:SecurityExchangeName ' + JSON.stringify(c.exchanges) : '');
    const sources = [
      { role: 'COVER_BEFORE', form: b.form, filingDate: b.filingDate, accession: b.accession, url: b.instanceUrl, sha256: b.instanceSha256, quote: coverQuote(b) },
      { role: 'COVER_AFTER', form: a.form, filingDate: a.filingDate, accession: a.accession, url: a.instanceUrl, sha256: a.instanceSha256, quote: coverQuote(a) },
      { role: 'PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE', accession: accOf(e.periodicText.url), url: e.periodicText.url, sha256: e.periodicText.sha256, quote: '' }
    ];
    if (idr.exchangeEvidence.via !== 'dei:SecurityExchangeName') sources.push({ role: 'EXCHANGE_10K_COVER', accession: idr.exchangeEvidence.accession, url: idr.exchangeEvidence.url, sha256: idr.exchangeEvidence.sha256, quote: s.exchange });
    for (const k of e.splitWindow8K || []) sources.push({ role: 'SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE', accession: k.accession, url: k.url, sha256: k.sha256, quote: 'items ' + k.items.join(',') });
    if (e.verdict === 'GENUINE_MOVE') sources.push({ role: 'AFFIRMATIVE_8K', items: e.affirmative.items, filingDate: e.affirmative.filingDate, reportDate: e.affirmative.reportDate,
      accession: e.affirmative.accession, url: e.affirmative.url, sha256: e.affirmative.sha256, quote: e.affirmative.quote });
    else sources.push({ role: 'SPINOFF_8K', filingDate: e.spinoff.filingDate, reportDate: e.spinoff.reportDate, accession: e.spinoff.accession, url: e.spinoff.url, sha256: e.spinoff.sha256,
      distributionDate: e.spinoff.distributionDateHits[0].date, quote: e.spinoff.distributionDateHits[0].quote });
    records.push({
      securityId: s.securityId, ticker: s.ticker, cik: String(idr.cik).padStart(10, '0'), issuer: idr.issuer, canonicalId: s.canonicalId,
      week: e.week, prevWeek: e.prevWeek, prevClose: e.prevClose, close: e.close, weeklyRatio: e.weeklyRatio, jumpDay: e.jumpDay, providerReason: e.reason,
      class: e.verdict, returnBasis: ADMISSIBLE[e.verdict],
      identity: { before: { accession: b.accession, form: b.form, filingDate: b.filingDate, tradingSymbol: s.ticker, tagged: b.tradingSymbols },
        after: { accession: a.accession, form: a.form, filingDate: a.filingDate, tradingSymbol: s.ticker, tagged: a.tradingSymbols }, exchange: s.exchange,
        exchangeEvidence: idr.exchangeEvidence.via === 'dei:SecurityExchangeName' ? { via: idr.exchangeEvidence.via, values: idr.exchangeEvidence.values } : { via: idr.exchangeEvidence.via, accession: idr.exchangeEvidence.accession } },
      shareContinuity: { before: { accession: b.accession, coverDate: b.coverDate, shares: b.shares }, after: { accession: a.accession, coverDate: a.coverDate, shares: a.shares }, ratio: a.shares / b.shares },
      splitChecks: { xbrlSplitFactsInWindow: e.xbrlSplitFacts.length, splitWindow8K: (e.splitWindow8K || []).length, periodicTextStrongMatch: false, spikeReversal: false },
      sources, protocolSha256, verifiedAt: s.verifiedAt
    });
  }
}
records.sort((x, y) => x.securityId.localeCompare(y.securityId) || x.week.localeCompare(y.week));
const reg = {
  schemaVersion: 'research-ca-evidence-1.0.0',
  scope: 'Source-verified corporate-action resolutions for OFFLINE weekly research only (research-weekly-loader createResearchLoader option corporateActionEvidence, default off; the productive weekly-real-adapter never reads this file). Each record resolves exactly one UNRESOLVED split-sized weekly move, bound to the event\'s own points (week, prevWeek, closes, ratio within 1e-5). No series, master or published value is changed.',
  ownerDecision: '2026-10-28: corrections only after independent source verification; no blanket activation of the 81 V9 dry-run cases.',
  protocol: 'docs/quant-recovery/v9-followups/ca-registry/protocol.json', protocolSha256,
  builder: 'scripts/quant/v9-followups/ca-registry/build-ca-registry.cjs',
  sourceHashConvention: 'sha256 of the fetched SEC body (complete)',
  records
};
const body = "'use strict';\n// Versioned SEC-sourced corporate-action evidence for offline weekly research. Data only; read by\n// quant/engines/research-weekly-loader.cjs exclusively when createResearchLoader(root, { corporateActionEvidence: true }) is requested.\n// Regenerate with scripts/quant/v9-followups/ca-registry/build-ca-registry.cjs; never hand-edit a record.\nmodule.exports = " + JSON.stringify(reg, null, 2) + ';\n';
fs.writeFileSync(out, body);
console.log(JSON.stringify({ records: records.length, series: new Set(records.map(r => r.securityId)).size, byClass: records.reduce((m, r) => (m[r.class] = (m[r.class] || 0) + 1, m), {}) }));
