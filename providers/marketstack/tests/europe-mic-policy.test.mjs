import test from 'node:test';
import assert from 'node:assert/strict';
import { germanRegionalMicEvidence, validRegionalMicEvidence, GERMAN_REGIONAL_POLICY } from '../../../scripts/marketstack/europe-mic-policy.mjs';
import { verifiedGermanRegionalCashShare, verifiedGermanIndexLocalCashShare, buildEuropeEquityUniverse } from '../../../scripts/marketstack/europe-universe.mjs';
const now = '2026-10-09T16:00:00Z', isin = 'DE0007164600', sha = 'a'.repeat(64);
const source = { url: 'https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv', sha256: sha, retrievedAt: '2026-10-09T15:28:00Z', httpStatus: 200 };
const record = (mic, operating = mic, country = 'DE', status = 'ACTIVE') => ({ MIC: mic, 'OPERATING MIC': operating, 'OPRT/SGMT': mic === operating ? 'OPRT' : 'SGMT', 'ISO COUNTRY CODE (ISO 3166)': country, STATUS: status });
const relationships = { verified: true, source, rows: [record('FRAA', 'XFRA'), record('XFRA'), record('XMUN'), record('XETR'), record('XNYS', 'XNYS', 'US'), record('MTAA', 'XMIL', 'IT'), record('XMIL', 'XMIL', 'IT')] };
function evidence(primary = 'FRAA') {
  const provenance = { url: 'https://official.example/', sha256: sha, retrievedAt: '2026-10-09T15:00:00Z', httpStatus: 200 };
  return { verified: true, isin, lei: '529900T8BM49AURSDO55', issuerCountry: 'DE', legalJurisdiction: 'DE', issuerCountryBasis: 'GLEIF_ENTITY_JURISDICTION',
    entityCategory: 'GENERAL', entityStatus: 'ACTIVE', officialInstrumentType: 'CS', typeSource: 'XETRA_REFERENCE', active: true, regulatoryLiquid: true,
    mic: 'XETR', primaryMic: 'XETR', primaryMarketMic: primary, productPrimaryPolicy: GERMAN_REGIONAL_POLICY, securityType: 'equity',
    source: 'OFFICIAL', provenance: { gleif: { ...provenance, queryIsin: isin }, xetra: provenance },
    regionalMicEvidence: germanRegionalMicEvidence(relationships, primary, now), regionalActivityEvidence: { verified: true, validPrice: true,
      mic: 'XETR', isin, providerSymbol: 'SAP.DE', currency: 'EUR', volume: 100, rawSha256: sha, metadataRawSha256: sha,
      observedDate: '2026-10-08', freshness: 'DELAYED', calendar: { mic: 'XETR', verified: true, source: 'official-schedule', expectedLastCompletedSession: '2026-10-09', expectedSessions: ['2026-10-07', '2026-10-08', '2026-10-09'] } } };
}
const listing = { mic: 'XETR', isin, providerSymbol: 'SAP.DE', currency: 'EUR' };
test('FRAA explicit segment relation and XMUN operating primary support separate Xetra preference', () => {
  for (const primary of ['FRAA', 'XMUN']) {
    const e = evidence(primary); assert.equal(verifiedGermanRegionalCashShare(e, listing), true);
    assert.equal(e.primaryMarketMic, primary); assert.notEqual(e.primaryMarketMic, e.primaryMic);
    assert.equal(validRegionalMicEvidence(e.regionalMicEvidence, primary, now), true);
  }
});
test('foreign, inactive, ambiguous, old and future ISO records fail closed without alias equivalence', () => {
  assert.equal(germanRegionalMicEvidence(relationships, 'XNYS', now), null);
  assert.equal(germanRegionalMicEvidence(relationships, 'MTAA', now), null);
  assert.equal(germanRegionalMicEvidence({ ...relationships, rows: [...relationships.rows, record('FRAA', 'XFRA')] }, 'FRAA', now), null);
  assert.equal(germanRegionalMicEvidence({ ...relationships, rows: relationships.rows.map(r => r.MIC === 'XFRA' ? { ...r, STATUS: 'EXPIRED' } : r) }, 'FRAA', now), null);
  for (const retrievedAt of ['2026-10-08T15:28:00Z', '2026-10-09T17:28:00Z']) assert.equal(germanRegionalMicEvidence({ ...relationships, source: { ...source, retrievedAt } }, 'FRAA', now), null);
});
test('current CS/DE/liquid activity proof is mandatory; provider ETF conflict is never overridden', () => {
  for (const edit of [e => e.issuerCountry = 'NL', e => e.regulatoryLiquid = false, e => e.active = false, e => e.regionalActivityEvidence.observedDate = '2026-10-07',
    e => e.regionalActivityEvidence.volume = 0, e => e.regionalActivityEvidence.validPrice = false, e => e.regionalActivityEvidence.currency = 'USD',
    e => e.provenance.gleif.retrievedAt = '2026-10-08T15:00:00Z']) {
    const e = evidence(); edit(e); assert.equal(verifiedGermanRegionalCashShare(e, listing), false);
  }
  const row = type => ({ row: { symbol: 'SAP.DE', exchangeMic: 'XETR', isin, item_type: type, assetType: type, currency: 'EUR' }, provenance: { source: 'raw' } });
  const options = { identityEvidence: [evidence()], generatedAt: now };
  assert.equal(buildEuropeEquityUniverse([row('equity')], options).summary.accepted, 1);
  assert.equal(buildEuropeEquityUniverse([row('etf')], options).summary.accepted, 0);
});


test('existing exact official German index relevance applies to DE without inventing regulatory liquidity', () => {
  const e = evidence('XFRA'); e.productPrimaryPolicy = 'GERMANY_OFFICIAL_INDEX_EUROPEAN_LOCAL_XETRA'; e.regulatoryLiquid = false;
  e.germanIndexMembershipEvidence = { verified: true, rosterExtractionVerified: true, isin, index: 'DAX', asOf: '2026-10-09', evaluatedAt: now, source: { url: 'https://official.example/index', sha256: sha } };
  assert.equal(Boolean(verifiedGermanIndexLocalCashShare(e, listing)), true); assert.equal(e.regulatoryLiquid, false);
  e.germanIndexMembershipEvidence.isin = 'DE0007236101'; assert.equal(verifiedGermanIndexLocalCashShare(e, listing), false);
  e.germanIndexMembershipEvidence.isin = isin; e.primaryMarketMic = 'XNYS'; assert.equal(verifiedGermanIndexLocalCashShare(e, listing), false);
});
