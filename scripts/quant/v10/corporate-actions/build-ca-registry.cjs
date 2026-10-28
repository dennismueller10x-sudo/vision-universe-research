#!/usr/bin/env node
/* V10 corporate actions: build quant/engines/research-ca-evidence.cjs (schema research-ca-evidence-1.0.0, unchanged) from the
 * private protocol-1.1.1 facts (verify_ca_events_v11.py). Only series whose EVERY unresolved event has an admissible class
 * (GENUINE_MOVE, SPINOFF_DISTRIBUTION) are written (protocol candidateFrame.seriesRule). Also writes the provider-error
 * proposals (E4 SPLIT_UNADJUSTED) and the per-event verdict table. Writes only the given --out paths.
 *   node build-ca-registry.cjs --facts <facts.jsonl> --out <registry.cjs> --verdicts <verdicts.json> --provider-errors <provider-errors.json>
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const factsPath = opt('--facts'), out = opt('--out'), verdictsOut = opt('--verdicts'), peOut = opt('--provider-errors');
if (!factsPath || !out || !verdictsOut || !peOut) { console.error('usage: --facts <jsonl> --out <cjs> --verdicts <json> --provider-errors <json>'); process.exit(2); }
const CA = require(path.join(root, 'quant/engines/corporate-action-evidence.js'));
const PROTOCOL_REL = 'docs/quant-recovery/v10/corporate-actions/protocol-1.1.1.json';
const protocolSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, PROTOCOL_REL))).digest('hex');
const ADMISSIBLE = { GENUINE_MOVE: 'PRICE_RETURN', SPINOFF_DISTRIBUTION: 'PRICE_RETURN_ONLY' };
const accOf = url => { const m = /\/(\d{10})(\d{2})(\d{6})\//.exec(url || ''); return m ? m[1] + '-' + m[2] + '-' + m[3] : null; };
const q300 = s => String(s || '').slice(0, 300);
const factsBytes = fs.readFileSync(factsPath);
const series = factsBytes.toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

function coverSource(role, c) {
  if (c.coverVia === 'E2_TEXT_COVER') return { role, form: c.form, filingDate: c.filingDate, accession: c.accession, url: c.textUrl, sha256: c.textSha256, via: 'E2_TEXT_COVER',
    quote: q300('shares ' + c.shares + ' as of ' + c.coverDate + ' | ' + c.quote) };
  return { role, form: c.form, filingDate: c.filingDate, accession: c.accession, url: c.instanceUrl, sha256: c.instanceSha256, via: 'dei:EntityCommonStockSharesOutstanding',
    quote: 'dei:TradingSymbol ' + JSON.stringify(c.tradingSymbols) + '; dei:EntityCommonStockSharesOutstanding ' + c.shares + ' as of ' + c.coverDate
      + (c.exchanges.length ? '; dei:SecurityExchangeName ' + JSON.stringify(c.exchanges) : '') };
}

const records = [], providerErrors = [], rows = [];
for (const s of series) {
  if (s.protocolSha256 !== protocolSha256) throw Error('FACTS_FROM_OTHER_PROTOCOL:' + s.securityId);
  for (const e of s.events) rows.push([s.securityId, e.week, e.reason, e.verdict, e.detail ?? null]);
  for (const e of s.events.filter(x => x.verdict === 'SPLIT_UNADJUSTED')) {
    const idr = e.identity.find(x => x.result === 'PASS'), ss = CA.splitSized(e.close / e.prevClose);
    const factor = ss.kind === 'DOWN' ? ss.k : 1 / ss.k;
    const sources = [coverSource('COVER_BEFORE', idr.before), coverSource('COVER_AFTER', idr.after)].concat(e.splitStatements.map(st => st.kind === 'XBRL_SPLIT_RATIO'
      ? { role: 'SPLIT_STATEMENT_XBRL', accession: st.accn, url: 'https://data.sec.gov/api/xbrl/companyconcept/CIK' + String(idr.cik).padStart(10, '0') + '/us-gaap/' + st.concept + '.json', sha256: null, quote: st.concept + ' ' + st.val + ' end ' + st.end + ' form ' + st.form, statedRatio: st.val }
      : { role: st.kind === '8K_SPLIT_LANGUAGE' ? 'SPLIT_STATEMENT_8K' : 'SPLIT_STATEMENT_PERIODIC_TEXT', accession: st.accession || accOf(st.url), url: st.url, sha256: st.sha256, quote: q300(st.match) }));
    providerErrors.push({ securityId: s.securityId, ticker: s.ticker, cik: String(idr.cik).padStart(10, '0'), issuer: idr.issuer, canonicalId: s.canonicalId,
      week: e.week, prevWeek: e.prevWeek, prevClose: e.prevClose, close: e.close, weeklyRatio: e.weeklyRatio, jumpDay: e.jumpDay,
      proposal: { action: 'ADD_PROVIDER_SPLIT_FACTOR', splitFactor: factor, effectiveDate: e.jumpDay, direction: ss.kind === 'DOWN' ? 'FORWARD_SPLIT' : 'REVERSE_SPLIT',
        statedRatios: e.splitStatements.filter(x => x.kind === 'XBRL_SPLIT_RATIO').map(x => x.val), note: 'factor = snapped split size of the weekly move (protocol E4); confirm the exact ratio from the statement before the producer change' },
      shareContinuity: { before: { accession: idr.before.accession, coverDate: idr.before.coverDate, shares: idr.before.shares }, after: { accession: idr.after.accession, coverDate: idr.after.coverDate, shares: idr.after.shares }, ratio: e.shareRatio },
      sources, protocolSha256, verifiedAt: s.verifiedAt, dataChange: 'NONE (proposal for the series producer; separate PR, owner approval)' });
  }
  if (!s.events.length || !s.events.every(e => Object.hasOwn(ADMISSIBLE, e.verdict))) continue;
  for (const e of s.events) {
    const idr = e.identity.find(x => x.result === 'PASS'), b = idr.before, a = idr.after;
    const sources = [coverSource('COVER_BEFORE', b), coverSource('COVER_AFTER', a)];
    for (const [side, x] of [['BEFORE', idr.idBefore], ['AFTER', idr.idAfter]]) if (x && x.via === 'E1_TEXT') sources.push({ role: 'IDENTITY_TEXT_' + side, accession: x.accession, url: x.url, sha256: x.sha256, quote: q300(x.quote) });
    sources.push({ role: 'PERIODIC_TEXT_NO_STRONG_SPLIT_LANGUAGE', accession: accOf(e.periodicText.url), url: e.periodicText.url, sha256: e.periodicText.sha256, quote: '' });
    if (idr.exchangeEvidence.via !== 'dei:SecurityExchangeName') sources.push({ role: 'EXCHANGE_10K_COVER', accession: idr.exchangeEvidence.accession, url: idr.exchangeEvidence.url, sha256: idr.exchangeEvidence.sha256, quote: s.exchange });
    for (const k of e.splitWindow8K || []) sources.push({ role: 'SPLIT_WINDOW_8K_NO_SPLIT_LANGUAGE', accession: k.accession, url: k.url, sha256: k.sha256, quote: 'items ' + (k.items.join(',') || 'none') });
    if (e.verdict === 'GENUINE_MOVE') sources.push({ role: 'AFFIRMATIVE_8K', items: e.affirmative.items, filingDate: e.affirmative.filingDate, reportDate: e.affirmative.reportDate,
      accession: e.affirmative.accession, url: e.affirmative.url, sha256: e.affirmative.sha256, quote: q300(e.affirmative.quote) });
    else sources.push({ role: 'SPINOFF_8K', filingDate: e.spinoff.filingDate, reportDate: e.spinoff.reportDate, accession: e.spinoff.accession, url: e.spinoff.url, sha256: e.spinoff.sha256,
      distributionDate: e.spinoff.distributionDateHits[0].date, quote: q300(e.spinoff.distributionDateHits[0].quote) });
    const via = (x, c) => ({ accession: x && x.via === 'E1_TEXT' ? x.accession : c.accession, form: c.form, filingDate: c.filingDate, tradingSymbol: s.ticker, tagged: c.tradingSymbols, via: x ? x.via : 'dei:TradingSymbol' });
    records.push({
      securityId: s.securityId, ticker: s.ticker, cik: String(idr.cik).padStart(10, '0'), issuer: idr.issuer, canonicalId: s.canonicalId,
      week: e.week, prevWeek: e.prevWeek, prevClose: e.prevClose, close: e.close, weeklyRatio: e.weeklyRatio, jumpDay: e.jumpDay, providerReason: e.reason,
      class: e.verdict, returnBasis: ADMISSIBLE[e.verdict], era: e.era,
      identity: { before: via(idr.idBefore, b), after: via(idr.idAfter, a), exchange: s.exchange,
        exchangeEvidence: idr.exchangeEvidence.via === 'dei:SecurityExchangeName' ? { via: idr.exchangeEvidence.via, values: idr.exchangeEvidence.values } : { via: idr.exchangeEvidence.via, accession: idr.exchangeEvidence.accession } },
      shareContinuity: { before: { accession: b.accession, coverDate: b.coverDate, shares: b.shares, via: b.coverVia }, after: { accession: a.accession, coverDate: a.coverDate, shares: a.shares, via: a.coverVia }, ratio: a.shares / b.shares },
      splitChecks: { xbrlSplitFactsInWindow: e.xbrlSplitFacts.length, splitWindow8K: (e.splitWindow8K || []).length, periodicTextStrongMatch: false, spikeReversal: false },
      sources, protocolSha256, verifiedAt: s.verifiedAt
    });
  }
}
records.sort((x, y) => x.securityId.localeCompare(y.securityId) || x.week.localeCompare(y.week));
providerErrors.sort((x, y) => x.securityId.localeCompare(y.securityId) || x.week.localeCompare(y.week));
const reg = {
  schemaVersion: 'research-ca-evidence-1.0.0',
  scope: 'Source-verified corporate-action resolutions for OFFLINE weekly research only (research-weekly-loader createResearchLoader option corporateActionEvidence, default off; the productive weekly-real-adapter never reads this file). Each record resolves exactly one UNRESOLVED split-sized weekly move, bound to the event\'s own points (week, prevWeek, closes, ratio within 1e-5). No series, master or published value is changed.',
  ownerDecision: '2026-10-28: corrections only after independent source verification; no blanket activation of the 81 V9 dry-run cases.',
  protocol: PROTOCOL_REL, protocolSha256,
  builder: 'scripts/quant/v10/corporate-actions/build-ca-registry.cjs',
  sourceHashConvention: 'sha256 of the fetched SEC body (complete)',
  records
};
const body = "'use strict';\n// Versioned SEC-sourced corporate-action evidence for offline weekly research. Data only; read by\n// quant/engines/research-weekly-loader.cjs exclusively when createResearchLoader(root, { corporateActionEvidence: true }) is requested.\n// Regenerate with scripts/quant/v10/corporate-actions/build-ca-registry.cjs; never hand-edit a record.\nmodule.exports = " + JSON.stringify(reg, null, 2) + ';\n';
fs.writeFileSync(out, body);
const count = (xs, f) => xs.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
const bySeries = new Map();
for (const r of rows) { if (!bySeries.has(r[0])) bySeries.set(r[0], []); bySeries.get(r[0]).push(r); }
const admissibleSeries = [...bySeries].filter(([, rs]) => rs.every(r => Object.hasOwn(ADMISSIBLE, r[3]))).map(([id]) => id).sort();
const heldSeriesReason = {};
for (const [id, rs] of bySeries) {
  if (admissibleSeries.includes(id)) continue;
  const blocking = [...new Set(rs.filter(r => !Object.hasOwn(ADMISSIBLE, r[3])).map(r => r[3]))].sort().join('+');
  heldSeriesReason[blocking] = (heldSeriesReason[blocking] || 0) + 1;
}
fs.writeFileSync(verdictsOut, JSON.stringify({
  schemaVersion: 'v10-ca-verdicts-1.1.1', protocol: PROTOCOL_REL, protocolSha256, factsSha256: crypto.createHash('sha256').update(factsBytes).digest('hex'),
  series: bySeries.size, events: rows.length, byVerdict: count(rows, r => r[3]), byVerdictDetail: count(rows, r => r[3] + '|' + r[4]),
  admissibleSeries, heldSeriesByBlockingClasses: heldSeriesReason, splitUnadjustedProposals: providerErrors.length,
  registryRecords: records.length, columns: ['securityId', 'week', 'providerReason', 'verdict', 'detail'], rows
}, null, 1) + '\n');
fs.writeFileSync(peOut, JSON.stringify({
  schemaVersion: 'v10-ca-provider-errors-1.0.0', protocol: PROTOCOL_REL, protocolSha256, productionApproved: false, dataChange: 'NONE',
  scope: 'Producer repair proposals for split-sized weekly moves proven (protocol 1.1.1 E4) to be provider-unadjusted splits. No series, master, adapter or published value is changed here; a producer fix needs its own PR with before/after comparison.',
  knownSeparately: [{ securityId: 'ref_PZZA', note: '2:1 split 2013 (handoff: weekly closes before 2013-12-30 halved by the next long-series run), repaired by the series producer change of #1042 (workstream A); not part of this proposal list.' }],
  proposals: providerErrors
}, null, 1) + '\n');
console.log(JSON.stringify({ records: records.length, series: new Set(records.map(r => r.securityId)).size, byClass: count(records, r => r.class), providerErrors: providerErrors.length }));
