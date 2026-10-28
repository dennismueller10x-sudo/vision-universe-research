#!/usr/bin/env node
/* V10 POPULATION: build the research registers from the committed evidence files.
 *  - quant/engines/research-identity-evidence.cjs: keeps the five 1.0.0 records byte-identical and (re)writes the
 *    extension block `v10` (research-identity-evidence-1.1.0) from docs/quant-recovery/v10/population/identity-cases.json
 *  - quant/engines/research-listing-lifecycle.cjs (research-listing-lifecycle-1.0.0) from lifecycle-cases.json
 * Never hand-edit a record; rerun this builder.
 *   node scripts/quant/v10/population/build-registers.cjs [--root <dir>] [--identity-out <file>] [--lifecycle-out <file>]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const root = path.resolve(arg('--root') || path.join(__dirname, '../../../..'));
const ev = p => JSON.parse(fs.readFileSync(path.join(root, 'docs/quant-recovery/v10/population', p), 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const protocolSha256 = sha(fs.readFileSync(path.join(root, 'docs/quant-recovery/v10/population/protocol-1.0.0.json')));
const clip = (s, n = 300) => String(s).slice(0, n);

// ------------------------------------------------------------ identity extension
function identityRecords() {
  const cases = ev('identity-cases.json').cases.filter(c => c.decision === 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER');
  return cases.map(c => {
    const cov = c.latestCover, sd = c.startDocument;
    const matches = c.anchors.filter(a => a.state === 'MATCH' && a.attributed);
    const sources = [{ role: 'IXBRL_COVER_LATEST', accession: cov.accession, url: cov.url, sha256: cov.sha256, sha256Normalized: cov.sha256Normalized, bytesRead: cov.bytesRead, complete: cov.complete,
      claim: `${cov.form} ${cov.filingDate} cover: ${cov.row.TradingSymbol} / ${cov.row.Security12bTitle} / ${cov.row.SecurityExchangeName}` }];
    if (sd && sd.state === 'VERIFIED' && sd.accession && sd.accession !== cov.accession)
      sources.push({ role: sd.kind === 'IXBRL_COVER_FIRST' ? 'IXBRL_COVER_FIRST' : 'FULLTEXT_TICKER_STATEMENT', accession: sd.accession, url: sd.url, sha256: sd.sha256, sha256Normalized: sd.sha256Normalized,
        bytesRead: sd.bytesRead, complete: sd.complete, claim: clip(typeof sd.detail === 'string' ? sd.detail : `${sd.detail.TradingSymbol} / ${sd.detail.Security12bTitle} / ${sd.detail.SecurityExchangeName}`) });
    for (const a of matches) if (!sources.some(s => s.accession === a.accession && s.sha256 === a.sha256))
      sources.push({ role: 'SAME_DAY_PRICE', accession: a.accession, url: a.url, sha256: a.sha256, sha256Normalized: a.sha256Normalized, bytesRead: a.bytesRead, complete: a.complete,
        claim: `${a.form} ${a.filingDate}: closing price $${a.sourceRawPrice} on ${a.date}` });
    return {
      securityId: c.securityId, ticker: c.ticker, cik: c.cik, issuer: c.secName || c.issuer, masterRowAction: 'SELECT_EXISTING_ROW', selectedCanonicalId: c.selectedCanonicalId,
      masterRowSet: c.masterRowSet, mic: cov.mic, instrumentClass: 'COMMON_STOCK', coverClassTitle: cov.row.Security12bTitle, filerType: c.filerType, currency: 'USD', activeStatus: 'ACTIVE_SEC_CONFIRMED',
      validFrom: c.validFrom, validTo: null, intervalBasis: [c.v9.basis].concat(c.intervalMoves.map(m => m.rule)), evidenceLevel: 'SEC_SAME_DAY_PRICE_AND_COVER', protocolSha256,
      historyGuard: c.historyGuard, lastConfirmedCover: { accession: cov.accession, filingDate: cov.filingDate, sha256: cov.sha256 },
      anchorGaps: c.anchorGaps, sources,
      priceEvidence: matches.map(a => ({ date: a.date, rawPrice: a.sourceRawPrice, laterSplitProduct: a.laterSplitProduct, seriesBar: a.bar, basis: a.basis, ratioSeriesToSource: a.ratioSeriesToSource,
        accession: a.accession, sha256: a.sha256, quote: clip(a.quote) })),
    };
  }).sort((a, b) => a.securityId < b.securityId ? -1 : 1);
}
function writeIdentity(out) {
  const file = path.join(root, 'quant/engines/research-identity-evidence.cjs');
  const src = fs.readFileSync(file, 'utf8');
  delete require.cache[require.resolve(file)];
  const reg = JSON.parse(JSON.stringify(require(file)));
  const records = identityRecords();
  reg.v10 = { schemaVersion: 'research-identity-evidence-1.1.0', protocol: 'docs/quant-recovery/v10/population/protocol-1.0.0.json', protocolSha256,
    scope: 'V10 protocol bindings for ambiguous baseline ids (several master rows): SELECT_EXISTING_ROW, SEC same-day price + current cover evidence only. Applied only with createResearchLoader option identityEvidenceProtocolV10 (requires identityEvidence). Owner release pending; the 1.0.0 owner decision above is unchanged.',
    builder: 'scripts/quant/v10/population/build-registers.cjs', evidence: 'docs/quant-recovery/v10/population/identity-cases.json', records };
  const head = src.slice(0, src.indexOf('module.exports = '));
  const note = '// V10 extension `v10` (research-identity-evidence-1.1.0): written by scripts/quant/v10/population/build-registers.cjs; the five 1.0.0 records stay byte-identical.\n';
  fs.writeFileSync(out || file, (head.includes(note) ? head : head + note) + 'module.exports = ' + JSON.stringify(reg, null, 2) + ';\n');
  return records.length;
}
// ------------------------------------------------------------ listing lifecycle
function writeLifecycle(out) {
  const doc = ev('lifecycle-cases.json');
  const records = doc.cases.filter(c => c.resolved).map(c => {
    const sources = [];
    const lt = c.sources.find(s => s.lastTradeQuote);
    sources.push({ role: 'LAST_TRADE_STATEMENT', accession: lt.accession, url: lt.url, sha256: lt.sha256, sha256Normalized: lt.sha256Normalized, quote: clip(lt.lastTradeQuote),
      rule: c.lastTrade.rule, statedDate: c.lastTrade.statedDate });
    const cs = c.sources.find(s => s.considerationQuote);
    if (cs && c.terminal && ['CASH_MERGER', 'STOCK_MERGER', 'CASH_AND_STOCK', 'UNKNOWN'].includes(c.terminal.kind))
      sources.push({ role: c.terminal.kind === 'UNKNOWN' ? 'TERMINAL_CONSIDERATION_UNQUANTIFIED' : 'TERMINAL_CONSIDERATION', accession: cs.accession, url: cs.url, sha256: cs.sha256, sha256Normalized: cs.sha256Normalized, quote: clip(cs.considerationQuote) });
    return { securityId: c.securityId, ticker: c.ticker, cik: c.cik, issuer: c.issuer, category: c.category, status: 'DELISTED_SOURCE_VERIFIED', protocolSha256,
      lastTradeDate: c.lastTrade.lastTradeDate, frozenClose: c.weeklyTail.close, frozenTailBarsAtBuild: c.frozenTailBarsRemoved, historyGuard: c.historyGuard,
      terminal: c.terminal, delistingForms: (c.forms || {}).delisting || [], masterConflict: c.masterConflict || null, sources };
  }).sort((a, b) => a.securityId < b.securityId ? -1 : 1);
  const reg = { schemaVersion: 'research-listing-lifecycle-1.0.0', protocol: 'docs/quant-recovery/v10/population/protocol-1.0.0.json', protocolSha256,
    scope: 'Source-bound last trading days and terminal consideration for weekly series with a frozen (carried-forward) end, OFFLINE research only (createResearchLoader option listingLifecycleEvidence, default off). No product, master or series change.',
    builder: 'scripts/quant/v10/population/build-registers.cjs', evidence: 'docs/quant-recovery/v10/population/lifecycle-cases.json',
    conventions: { historyGuard: 'weekly-real-adapter hash(): sha256(JSON.stringify(points with checkedFrom <= date <= lastTradeDate))', lastTradeDate: 'protocol-1.0.0 B2 lastTradeDate rule', paymentDate: 'null unless a document states it' },
    records };
  const text = "'use strict';\n// Research-only listing-lifecycle register (frozen series ends). Data only; read exclusively by the research loader option listingLifecycleEvidence.\n"
    + '// Regenerate with scripts/quant/v10/population/build-registers.cjs; never hand-edit a record.\nmodule.exports = ' + JSON.stringify(reg, null, 2) + ';\n';
  fs.writeFileSync(out || path.join(root, 'quant/engines/research-listing-lifecycle.cjs'), text);
  return records.length;
}
const n1 = fs.existsSync(path.join(root, 'docs/quant-recovery/v10/population/identity-cases.json')) ? writeIdentity(arg('--identity-out')) : null;
const n2 = fs.existsSync(path.join(root, 'docs/quant-recovery/v10/population/lifecycle-cases.json')) ? writeLifecycle(arg('--lifecycle-out')) : null;
console.log(JSON.stringify({ identityV10Records: n1, lifecycleRecords: n2 }));
