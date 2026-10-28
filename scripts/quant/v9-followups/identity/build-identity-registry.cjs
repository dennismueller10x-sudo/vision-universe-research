#!/usr/bin/env node
/* V9 follow-up (identity): derive the compact research identity registry from the V9 proposal.
 *
 * Input : docs/quant-recovery/v9/identity/identity-evidence-proposal.json (branch claude/vision-universe-quant-v9-dsvle1)
 * Output: --out <file> (the committed registry is quant/engines/research-identity-evidence.cjs).
 * Owner decision 2026-10-28: ONLY the five dossier bindings COHR, BGC, DCOM, SGI, TRAK. The 132 bindings for
 * ambiguous ids from the same proposal are deliberately NOT carried over.
 * No network; nothing is read or written besides --proposal and --out.
 */
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const proposalPath = opt('--proposal'), out = opt('--out');
if (!proposalPath || !out) { console.error('usage: --proposal <identity-evidence-proposal.json> --out <registry.cjs>'); process.exit(2); }
const SELECTED = ['ref_BGC', 'ref_COHR', 'ref_DCOM', 'ref_SGI', 'ref_TRAK'];
const bytes = fs.readFileSync(proposalPath);
const proposal = JSON.parse(bytes);
const squash = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function claimOf(s, ticker) {
  if (s.claims && s.claims.length) return squash(s.claims.map(c => c.claim).join(' + ') + ': ' + s.claims[0].quote, 220);
  if (s.coverClass) return squash(`iXBRL cover: TradingSymbol=${s.coverClass.TradingSymbol}; Security12bTitle=${s.coverClass.Security12bTitle}; SecurityExchangeName=${s.coverClass.SecurityExchangeName}`, 220);
  if (s.quote) return squash('Ticker statement: ' + s.quote, 220);
  if (s.role === 'COVER_TICKER') return `Filing cover page names the issuer's common stock under ticker ${ticker}`;
  if (/^PRICE_IDENTITY/.test(s.role)) return 'Closing prices cited in this filing match the weekly series on the same day (see priceEvidence)';
  throw Error('SOURCE_WITHOUT_CLAIM:' + s.accession);
}
const records = SELECTED.map(id => {
  const r = proposal.records.find(x => x.securityId === id);
  if (!r || r.decision !== 'BIND_SOURCE_RESOLVED_LISTING' || r.origin !== 'DOSSIER') throw Error('NOT_A_DOSSIER_BINDING:' + id);
  const b = r.binding;
  const matches = r.priceEvidence.filter(p => p.state === 'MATCH');
  if (matches.length !== r.priceEvidence.length) throw Error('NON_MATCH_PRICE_EVIDENCE:' + id);
  return {
    securityId: r.securityId, ticker: r.ticker, cik: b.cik, issuer: b.issuer,
    canonicalId: b.canonicalId, masterRowAction: b.masterRowAction, replacesCanonicalIds: b.replacesCanonicalIds,
    replacedRowIssuer: r.predecessorOfMasterRow,
    mic: b.mic, instrumentClass: b.instrumentClass, currency: b.currency, provider: b.provider,
    validFrom: b.validFrom, validTo: b.validTo, intervalBasis: b.intervalBasis, activeStatus: b.activeStatus,
    evidenceLevel: matches.length ? 'SEC_SAME_DAY_PRICE_AND_COVER' : 'COVER_PAGE_ONLY',
    historyGuard: { checkedFrom: r.historyGuard.checkedFrom, checkedTo: r.historyGuard.checkedTo, bars: r.historyGuard.bars, pointsSha256: r.historyGuard.pointsSha256 },
    lastConfirmedCover: { accession: b.lastConfirmedCover.accession, filingDate: b.lastConfirmedCover.filingDate, sha256: b.lastConfirmedCover.sha256 },
    tickerIntervals: r.tickerIntervals,
    corporateActionNotes: r.corporateActionNotes,
    priceEvidence: matches.map(p => ({ date: p.date, accession: p.accession, sha256: p.sha256, ratioSeriesToSource: p.ratioSeriesToSource })),
    sources: r.sources.map(s => ({ role: s.role, form: s.form, filingDate: s.filingDate, accession: s.accession, url: s.url, sha256: s.sha256,
      bytesRead: s.bytesRead, complete: s.complete, claim: claimOf(s, r.ticker) }))
  };
});
const registry = {
  schemaVersion: 'research-identity-evidence-1.0.0',
  scope: 'Source-resolved listing bindings for OFFLINE weekly research only (research-weekly-loader createResearchLoader option identityEvidence, default off; the productive weekly-real-adapter never reads this file). Each binding replaces a misbound security-master row and restricts the series to the SEC-sourced interval; no history outside it is asserted. No security-master correction, no product or published-value change.',
  ownerDecision: '2026-10-28: only the five V9 dossier bindings; the 132 ambiguous-id bindings of the V9 proposal are not included.',
  derivedFrom: { proposal: 'docs/quant-recovery/v9/identity/identity-evidence-proposal.json@claude/vision-universe-quant-v9-dsvle1', proposalSha256: crypto.createHash('sha256').update(bytes).digest('hex'), builder: 'scripts/quant/v9-followups/identity/build-identity-registry.cjs' },
  sourceHashConvention: 'sha256 of the fetched SEC body; when complete=false, of its first bytesRead bytes',
  historyGuardConvention: 'weekly-real-adapter hash(): sha256(JSON.stringify(points with checkedFrom <= date <= checkedTo))',
  records
};
const text = "'use strict';\n// Versioned original-source identity bindings for offline weekly research. Data only; read by\n// quant/engines/research-weekly-loader.cjs exclusively when createResearchLoader(root, { identityEvidence: true }) is requested.\n// Regenerate with scripts/quant/v9-followups/identity/build-identity-registry.cjs; never hand-edit a record.\nmodule.exports = " + JSON.stringify(registry, null, 2) + ";\n";
fs.writeFileSync(out, text);
console.log(JSON.stringify({ records: records.map(r => [r.securityId, r.evidenceLevel, r.validFrom, r.sources.length, r.priceEvidence.length]) }));
