import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildIssuerReference } from '../../scripts/market/build-marketstack-issuer-reference.mjs';
import { buildSecurityReference, extendIssuerReference, REPORTING_VENUE_PROXY_LEIS } from '../../scripts/market/build-marketstack-security-reference.mjs';
import { classifyCFI, finalizeGermanCompanies, assessGermanPolicyReadiness } from '../../scripts/market/finalize-marketstack-germany-companies.mjs';
const stamp = '2026-10-01T12:00:00Z', sha = 'a'.repeat(64), lei = '529900D6BF99LW9R2E68', ordinary = 'DE0007164600', preferred = 'DE0006048432';
const source = { url: 'https://api.gleif.org/api/v1/lei-records?filter%5Blei%5D=' + lei, requestedLEIs: [lei], sha256: sha, retrievedAt: stamp };
function record(id = lei, country = 'DE') { return { id, attributes: { lei: id, entity: { legalName: { name: 'Test issuer' }, legalAddress: { country }, headquartersAddress: { country: 'CH' }, jurisdiction: country, status: 'ACTIVE' }, registration: { status: 'ISSUED' } } }; }
function issuer(isin = ordinary, country = 'DE', id = lei) { return { status: 'EXACT_GLEIF_ISIN_LEI_REFERENCE', domicileBasis: 'GLEIF_LEGAL_ADDRESS_COUNTRY', sourceEvidence: { sourceSystem: 'GLEIF_ANNA_ISIN_TO_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE', leiBatchResponseSHA256: sha, leiRecordURL: 'https://api.gleif.org/api/v1/lei-records/' + id }, isin, lei: id, companyId: 'LEI:' + id, legalName: 'Test issuer', domicileCountry: country, jurisdiction: country, entityStatus: 'ACTIVE' }; }
function listing(isin = ordinary, mic = 'XETR', symbol = 'SAP.DE') { return { status: 'CLASSIFIED_CANDIDATE', assetType: 'EQUITY', providerSymbol: symbol, mic, referenceIdentity: { isin, officialName: 'Test security', active: true, tradingCurrency: 'EUR' } }; }
function valid(isin = ordinary, mic = 'XETR', symbol = 'SAP.DE') { return { isin, mic, providerSymbol: symbol, metadataStatus: 'EXACT_IDENTITY_VERIFIED', currentPriceStatus: 'VALID', calendarAgeDays: 1, latestValidTradingDate: '2026-09-30', candlesAdmittedForPriceValidation: 7 }; }
const type = (isin = ordinary, cfi = 'ESVUFB') => ({ isin, cfiReferences: [{ cfi, observations: 1 }], responseSHA256: sha });
const volume = (symbol = 'SAP.DE', amount = 100) => ({ symbol, exchange: 'XETR', date: '2026-09-30', volume: amount });
function run(rows = [listing()], issuers = [issuer()], vals = [valid()], vols = [volume()], types = [type()]) { return finalizeGermanCompanies({ generatedAt: stamp, equityListings: rows }, { generatedAt: stamp, records: issuers }, { generatedAt: stamp, listings: vals }, { listings: [] }, vols, { securityReferences: { records: types } }); }

test('company, security and venue identities deduplicate independently', () => {
  const r = run([listing(), listing(ordinary, 'XFRA', 'SAP.F'), listing(ordinary, 'XFRA', 'SAP.XFRA'), listing(preferred, 'XETR', 'HEN3.DE')],
    [issuer(), issuer(preferred)], [valid(), valid(preferred, 'XETR', 'HEN3.DE')], [volume(), volume('HEN3.DE', 200)], [type(), type(preferred, 'EPNXXB')]);
  assert.equal(r.counts.distinctEquityListingIdentities, 3); assert.equal(r.counts.providerAliasSurplus, 1);
  assert.equal(r.counts.uniqueSecurityISINs, 2); assert.equal(r.counts.GermanDomiciledCompaniesVerified, 1);
  assert.equal(r.counts.securityISINsOnMultipleGermanVenues, 1); assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 1);
  assert.equal(r.selectedConsumerListings[0].isin, preferred); assert.equal(r.selectedConsumerListings[0].liquidityEvidence.confidence, 'PARTIAL');
  assert.ok(r.listings.every(x => x.quantActivation === false && x.productionActivated === false));
});
test('venue and DE ISIN prefix never establish issuer domicile', () => {
  const r = run([listing()], []); assert.equal(r.counts.GermanDomiciledCompaniesVerified, 0);
  assert.equal(r.counts.ambiguousIssuerListingIdentities, 1); assert.equal(r.listings[0].analyticalCompanyId, null);
  assert.equal(r.listings[0].primaryDecisionReason, 'ISSUER_DOMICILE_UNVERIFIED'); assert.equal(r.counts.authoritativeCompleteGermanCompanyTotal, null);
});
test('legal address and incorporation are separate; headquarters does not select country', () => {
  const i = { ...issuer(), jurisdiction: 'NL', headquartersCountry: 'CH' }; const r = run([listing()], [i]);
  assert.equal(r.counts.GermanDomiciledCompaniesVerified, 1); assert.equal(r.counts.GermanIncorporatedCompaniesVerified, 0);
  assert.equal(r.germanCompanies[0].headquartersCountry, 'CH');
});
test('foreign issuer on Xetra remains foreign, not a German company', () => {
  const r = run([listing()], [issuer(ordinary, 'US')]); assert.equal(r.counts.GermanDomiciledCompaniesVerified, 0);
  assert.equal(r.counts.ForeignEquitiesTradedOnGermanVenuesVerified, 1); assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 0);
});
test('active issuer/reference alone never grants recent price or liquidity eligibility', () => {
  const r = run([listing()], [issuer()], [], []); assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 0);
  assert.ok(r.listings[0].decisionReasons.includes('NO_VALIDATED_RECENT_OHLC_SAMPLE'));
  assert.ok(r.listings[0].decisionReasons.includes('RECENT_VOLUME_UNAVAILABLE'));
});
test('zero volume, stale price, and inactive instrument remain blocked', () => {
  const zero = run([listing()], [issuer()], [valid()], [volume('SAP.DE', 0)]); assert.ok(zero.listings[0].decisionReasons.includes('NO_POSITIVE_RECENT_TRADING_VOLUME'));
  const stale = run([listing()], [issuer()], [{ ...valid(), calendarAgeDays: 5 }]); assert.ok(stale.listings[0].decisionReasons.includes('PRICE_FRESHNESS_GATE_FAILED'));
  const inactive = listing(); inactive.referenceIdentity.active = false; const r = run([inactive]);
  assert.equal(r.counts.GermanDomiciledActiveEquitySecuritiesVerified, 0); assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 0);
});
test('CS broad-equity without CFI does not become common stock or selected consumer entry', () => {
  const r = run([listing()], [issuer()], [valid()], [volume()], []); assert.equal(r.listings[0].shareType, 'UNKNOWN');
  assert.equal(r.counts.GermanDomiciledCompaniesVerified, 0); assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 0);
});
test('preferred, receipt, collective and contradictory CFI remain distinct', () => {
  assert.equal(classifyCFI(type(ordinary, 'EPNXXB')), 'PREFERRED_SHARE'); assert.equal(classifyCFI(type(ordinary, 'EDSXFR')), 'DEPOSITARY_RECEIPT');
  assert.equal(classifyCFI(type(ordinary, 'CIOIES')), 'NON_EQUITY_CFI'); assert.equal(classifyCFI({ cfiReferences: [{ cfi: 'ESVUFB' }, { cfi: 'EPNXXB' }] }), 'CONFLICTING_CFI');
  const receipt = run([listing()], [issuer()], [valid()], [volume()], [type(ordinary, 'EDSXFR')]);
  assert.equal(receipt.counts.GermanDomiciledCompaniesVerified, 0); assert.equal(receipt.counts.uniquePrimarySelectedConsumerListings, 0);
});
test('regulatory issuer conflict withholds company identity and selection', () => {
  const r = run([listing()], [{ ...issuer(), issuerConflict: true }]); assert.equal(r.counts.ambiguousIssuerListingIdentities, 1);
  assert.equal(r.listings[0].issuerLEI, null); assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 0);
});
test('identity mismatch is quarantined despite valid raw price/volume', () => {
  const r = run([listing()], [issuer()], [{ ...valid(), metadataStatus: 'QUARANTINED', currentPriceStatus: 'QUARANTINED' }]);
  assert.equal(r.counts.uniquePrimarySelectedConsumerListings, 0); assert.ok(r.listings[0].decisionReasons.includes('PROVIDER_OR_REGULATORY_IDENTITY_CONFLICT'));
});
test('normalized issuer references retain legal domicile, jurisdiction, HQ and source separately', () => {
  const r = buildIssuerReference({ isins: [ordinary], mappings: { [ordinary]: [lei] }, zipSHA256: sha }, { batches: [source], records: [record()] });
  assert.equal(r.records[0].domicileCountry, 'DE'); assert.equal(r.records[0].headquartersCountry, 'CH');
  assert.equal(r.records[0].sourceEvidence.leiBatchResponseSHA256, sha); assert.equal(r.counts.MarketstackCreditsUsed, 0);
});
test('conflicting mappings and changed LEI records fail closed', () => {
  const mapping = { isins: [ordinary], mappings: { [ordinary]: [lei, 'W38RGI023J3WT1HWRP32'] }, zipSHA256: sha };
  assert.equal(buildIssuerReference(mapping, { batches: [source], records: [record()] }).records[0].status, 'MAPPING_CONFLICT');
  assert.throws(() => buildIssuerReference({ isins: [], mappings: {} }, { batches: [source], records: [record(), record(lei, 'US')] }), /CONFLICTING_LEI_RECORD/);
});
test('FIRDS normalization requires untruncated current published facets and exact query ISIN', () => {
  const url = 'https://registers.esma.europa.eu/solr/esma_registers_firds/select?q=isin%3ADE0007164600+AND+latest_received_flag%3A1+AND+never_published_flag%3A0&facet.limit=-1';
  const captured = { batches: [{ url, sha256: sha, retrievedAt: stamp, requestedISINs: [ordinary] }], records: [{ isin: ordinary, observations: 1, cfiReferences: [{ cfi: 'ESVUFB', observations: 1, leiObservations: [{ lei, observations: 1 }] }], responseSHA256: sha, retrievedAt: stamp }] };
  assert.equal(buildSecurityReference(captured).records[0].issuerLEICandidates[0], lei);
  assert.throws(() => buildSecurityReference({ ...captured, batches: [{ ...captured.batches[0], url: url.replace('-1', '1') }] }), /CURRENT_UNTRUNCATED/);
  assert.throws(() => buildSecurityReference({ ...captured, records: [{ ...captured.records[0], isin: preferred }] }), /SOURCE_ISIN_MISMATCH/);
});
test('FIRDS-only exact operating-venue proxy never becomes issuer; direct mapping remains intact', () => {
  const proxy = REPORTING_VENUE_PROXY_LEIS[0], securities = { generatedAt: stamp, sources: [], records: [{ isin: ordinary, issuerLEICandidates: [proxy], responseSHA256: sha, retrievedAt: stamp }] };
  const captured = { batches: [{ ...source, requestedLEIs: [proxy] }], records: [record(proxy)] };
  const operator = { sourceURL: 'https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv', responseSHA256: sha, retrievedAt: stamp, records: [{ LEI: proxy, MIC: 'XFRA' }] };
  const r = extendIssuerReference({ sources: {}, records: [{ isin: ordinary, status: 'UNMAPPED' }] }, securities, captured, { reportingVenueProxyReference: operator });
  assert.equal(r.records[0].status, 'REGULATORY_REPORTING_VENUE_ISSUER_AMBIGUOUS'); assert.equal(r.records[0].companyId, undefined);
  assert.deepEqual(r.records[0].leiCandidates, [proxy]); assert.equal(r.records[0].reportingVenueCandidate.registrationResponseSHA256, sha);
  const verified = { ...issuer(), lei: proxy, status: 'EXACT_GLEIF_ISIN_LEI_REFERENCE' };
  assert.equal(extendIssuerReference({ sources: {}, records: [verified] }, securities, captured).records[0].status, 'EXACT_GLEIF_ISIN_LEI_REFERENCE');
});
test('normal FIRDS-only company and cross-source conflict retain different confidence states', () => {
  const securities = { generatedAt: stamp, sources: [], records: [{ isin: ordinary, issuerLEICandidates: [lei], responseSHA256: sha, retrievedAt: stamp }] }, captured = { batches: [source], records: [record()] };
  const r = extendIssuerReference({ sources: {}, records: [{ isin: ordinary, status: 'UNMAPPED' }] }, securities, captured);
  assert.equal(r.records[0].status, 'EXACT_ESMA_ISIN_LEI_REFERENCE'); assert.equal(r.records[0].domicileCountry, 'DE');
  const conflict = extendIssuerReference({ sources: {}, records: [{ ...issuer(), lei: 'W38RGI023J3WT1HWRP32' }] }, securities, captured);
  assert.equal(conflict.records[0].status, 'REGULATORY_ISSUER_CONFLICT'); assert.equal(conflict.records[0].issuerConflict, true);
});
test('repeated snapshot analysis is deterministic and cannot mutate canonical input', () => {
  const canonical = { listings: [{ assetType: 'EQUITY', isin: ordinary, mic: 'XETR', tradingCurrency: 'EUR', listingId: 'accepted_listing', securityId: 'accepted_security', companyId: 'accepted_company' }] }, before = JSON.stringify(canonical);
  const inputs = [{ generatedAt: stamp, equityListings: [listing()] }, { generatedAt: stamp, records: [issuer()] }, { generatedAt: stamp, listings: [valid()] }, canonical, [volume()], { securityReferences: { records: [type()] } }];
  const a = finalizeGermanCompanies(...inputs), b = finalizeGermanCompanies(...inputs); assert.deepEqual(a, b); assert.equal(JSON.stringify(canonical), before);
  assert.equal(a.selectedConsumerListings[0].canonicalCompanyId, 'accepted_company'); assert.equal(a.selectedConsumerListings[0].listingId, 'accepted_listing');
});

test('unreviewed status or missing source proof never grants issuer identity', () => {
  for (const changed of [{ ...issuer(), status: 'NAME_HINT' }, { ...issuer(), sourceEvidence: null }, { ...issuer(), companyId: 'OTHER_COMPANY' }]) {
    const r = run([listing()], [changed]); assert.equal(r.counts.GermanDomiciledCompaniesVerified, 0); assert.equal(r.listings[0].analyticalCompanyId, null);
  }
});

test('committed CLI replay includes regulatory enrichment/operator guards deterministically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-issuer-cli-'));
  try {
    const proxy = REPORTING_VENUE_PROXY_LEIS[0];
    const put = (name, value) => { const p = join(dir, name + '.json'); writeFileSync(p, JSON.stringify(value)); return p; };
    const mapping = put('mapping', { isins: [ordinary], mappings: {}, zipSHA256: sha });
    const captured = put('gleif', { batches: [{ ...source, requestedLEIs: [proxy] }], records: [record(proxy)] });
    const url = 'https://registers.esma.europa.eu/solr/esma_registers_firds/select?q=isin%3ADE0007164600+AND+latest_received_flag%3A1+AND+never_published_flag%3A0&facet.limit=-1';
    const fir = put('firds', { batches: [{ url, sha256: sha, retrievedAt: stamp, requestedISINs: [ordinary] }], records: [{ isin: ordinary, observations: 1, cfiReferences: [{ cfi: 'ESVUFB', observations: 1, leiObservations: [{ lei: proxy, observations: 1 }] }], responseSHA256: sha, retrievedAt: stamp }] });
    const operator = put('operator', { sourceURL: 'https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv', responseSHA256: sha, retrievedAt: stamp, records: [{ LEI: proxy, MIC: 'XFRA' }] });
    const direct = join(dir, 'direct.json'), types = join(dir, 'types.json'), output = join(dir, 'enriched.json');
    execFileSync(process.execPath, ['scripts/market/build-marketstack-issuer-reference.mjs', '--mapping-subset=' + mapping, '--lei-record-index=' + captured, '--out=' + direct]);
    const args = ['scripts/market/build-marketstack-security-reference.mjs', '--captured=' + fir, '--out=' + types, '--issuer-reference=' + direct, '--lei-record-index=' + captured, '--operator-reference=' + operator, '--issuer-out=' + output];
    execFileSync(process.execPath, args); const first = readFileSync(output, 'utf8'); execFileSync(process.execPath, args); assert.equal(readFileSync(output, 'utf8'), first);
    assert.equal(JSON.parse(first).records[0].status, 'REGULATORY_REPORTING_VENUE_ISSUER_AMBIGUOUS');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('research proposals never relax existing all-candidate history/turnover policy', () => {
  const policy = { minHistoryBars: 250, minDailyTurnoverUSD: 5000000 };
  const good = { active: true, assetType: 'EQUITY', primaryListing: true, coverage: { price: 'VERIFIED' }, corporateActionBasis: 'VERIFIED', avgDailyTurnoverUSD: 6000000 };
  assert.equal(assessGermanPolicyReadiness(good, policy, 250).verifiedEligible, true);
  assert.equal(assessGermanPolicyReadiness(good, policy, 249).verifiedEligible, false);
  assert.equal(assessGermanPolicyReadiness({ ...good, avgDailyTurnoverUSD: 4900000 }, policy, 300).verifiedEligible, false);
  const unknown = assessGermanPolicyReadiness({ ...good, avgDailyTurnoverUSD: undefined, tradingCurrency: 'EUR' }, policy, 300);
  assert.equal(unknown.verifiedEligible, false); assert.equal(unknown.avgDailyTurnoverUSD, null);
  assert.ok(unknown.reasons.includes('EXISTING_USD_TURNOVER_UNVERIFIED_NO_FX_SYNTHESIS'));
  const proposed = run(); assert.equal(proposed.counts.uniquePrimarySelectedConsumerListings, 1); assert.equal(proposed.counts.strictExistingPolicyVerifiedEligibleCompanies, 0);
  assert.equal(proposed.counts.authoritativeExistingPolicyActualEligibleCompanies, null); assert.equal(proposed.existingUniversePolicy.requirementScope, 'APPLIES_TO_ALL_GLOBAL_CONSUMER_SELECTION_CANDIDATES');
});
