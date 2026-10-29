#!/usr/bin/env node
/* V12 LARGECAP: write the non-enumerable extension `v12` (research-identity-evidence-1.2.0) of quant/engines/research-identity-evidence.cjs
 * from the committed evidence files docs/quant-recovery/v12/largecap/{restrict-cases,identity-cases}-<v>.json. The text of the file up to
 * and including the existing `module.exports = {...};` statement stays byte-identical (the 1.0.0 records and the V10 extension), so
 * JSON.stringify(registry) and every existing registryHash are unchanged. Never hand-edit a record; rerun this builder.
 *   node scripts/quant/v12/largecap/build-identity-v12.cjs [--version 1.0.0] [--out <file>] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const V = arg('--version') || '1.0.1';
const D = 'docs/quant-recovery/v12/largecap';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const clip = (s, n = 300) => String(s).slice(0, n);
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const protocolFile = arg('--protocol') || D + '/protocol-1.0.0.json';
const protocolSha256 = sha(fs.readFileSync(path.join(root, protocolFile)));
const amendment = D + '/protocol-amendment-1.0.1.json', amendmentSha256 = sha(fs.readFileSync(path.join(root, amendment)));
const v10ProtocolSha256 = sha(fs.readFileSync(path.join(root, 'docs/quant-recovery/v10/population/protocol-1.0.0.json')));

function record(c) {
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
  const restrict = c.part === 'RESTRICT', byKey = !!c.selectedRowKey;
  const r = { securityId: c.securityId, ticker: c.ticker, cik: c.cik, issuer: c.secName || c.issuer,
    masterRowAction: restrict ? 'RESTRICT_SINGLE_ROW' : byKey ? 'SELECT_EXISTING_ROW_BY_KEY' : 'SELECT_EXISTING_ROW', selectedCanonicalId: c.selectedCanonicalId };
  if (byKey) { r.selectedRowKey = c.selectedRowKey; r.masterRowKeys = c.masterRowKeys; } else r.masterRowSet = c.masterRowSet;
  if (restrict) {
    const ev = c.caEvents.filter(e => !['GENUINE_MOVE', 'SPINOFF_DISTRIBUTION'].includes(e.verdict)).sort((a, b) => a.week < b.week ? -1 : 1).at(-1);
    r.caEvent = { week: ev.week, prevWeek: ev.prevWeek, verdict: ev.verdict, detail: ev.detail ?? null, evidence: D + '/ca-verdicts-1.0.0.json' };
    r.symbolStart = { accession: c.symbolStartDocument.accession, form: c.symbolStartDocument.form, filingDate: c.symbolStartDocument.filingDate, kind: c.symbolStartDocument.kind, S0: c.S0.S0 };
  }
  Object.assign(r, { mic: cov.mic, instrumentClass: 'COMMON_STOCK', coverClassTitle: cov.row.Security12bTitle, filerType: c.filerType, currency: 'USD', activeStatus: 'ACTIVE_SEC_CONFIRMED',
    validFrom: c.validFrom, validTo: null, intervalBasis: [c.v9.basis].concat(c.intervalMoves.map(m => m.rule)), evidenceLevel: 'SEC_SAME_DAY_PRICE_AND_COVER', protocolSha256,
    historyGuard: c.historyGuard, lastConfirmedCover: { accession: cov.accession, filingDate: cov.filingDate, sha256: cov.sha256 }, anchorGaps: c.anchorGaps, sources,
    priceEvidence: matches.map(a => ({ date: a.date, rawPrice: a.sourceRawPrice, laterSplitProduct: a.laterSplitProduct, seriesBar: a.bar, basis: a.basis, ratioSeriesToSource: a.ratioSeriesToSource,
      accession: a.accession, sha256: a.sha256, quote: clip(a.quote) })) });
  return r;
}
const cases = [...read(D + '/restrict-cases-' + V + '.json').cases, ...read(D + '/identity-cases-' + V + '.json').cases];
const records = cases.filter(c => c.decision === 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER').map(record).sort((a, b) => a.securityId < b.securityId ? -1 : 1);
const ext = { schemaVersion: 'research-identity-evidence-1.2.0', protocol: protocolFile, protocolSha256, amendment, amendmentSha256, v10ProtocolSha256,
  scope: 'V12 LARGECAP bindings (OFFLINE research only): SELECT_EXISTING_ROW / SELECT_EXISTING_ROW_BY_KEY for ambiguous baseline ids and RESTRICT_SINGLE_ROW (history only after an unresolved corporate action) for single-row listings, SEC same-day price + current cover evidence only. Applied only with createResearchLoader option identityEvidenceProtocolV12 (requires identityEvidenceProtocolV10); replaces a V10 record of the same id only then. Non-enumerable: JSON.stringify of this registry and every existing registryHash are unchanged.',
  builder: 'scripts/quant/v12/largecap/build-identity-v12.cjs', evidence: [D + '/restrict-cases-' + V + '.json', D + '/identity-cases-' + V + '.json'], records };
const file = path.join(root, 'quant/engines/research-identity-evidence.cjs');
const src = fs.readFileSync(file, 'utf8');
const marker = '\n// V12 LARGECAP extension `v12`';
const head = src.includes(marker) ? src.slice(0, src.indexOf(marker) + 1) : src;
if (!head.trimEnd().endsWith('};')) throw Error('UNEXPECTED_REGISTRY_TAIL');
const tail = marker.slice(1) + ' (research-identity-evidence-1.2.0): written by scripts/quant/v12/largecap/build-identity-v12.cjs. Non-enumerable so that\n'
  + '// JSON.stringify(module.exports) - the 1.0.0 records, the V10 extension and every existing registryHash - stays byte-identical.\n'
  + "Object.defineProperty(module.exports, 'v12', { enumerable: false, value: " + JSON.stringify(ext, null, 2) + ' });\n';
fs.writeFileSync(arg('--out') || file, head + tail);
console.log(JSON.stringify({ v12Records: records.length, ids: records.map(r => r.securityId + ':' + r.masterRowAction + ':' + r.validFrom) }));
