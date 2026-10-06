import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildReference, validISIN, run } from '../build-de-eu-reference.mjs';
const sourcePath = process.env.VU_DE_EU_REFERENCE_SOURCE;
const frozen = sourcePath ? JSON.parse(readFileSync(sourcePath, 'utf8')) : null;
const fullTest = (name, fn) => test(name, { skip: !frozen && 'Private frozen reference not supplied; no current-universe coverage claim.' }, fn);
const identity = { securityIdForISIN: isin => `test-security-${isin}`, listingIdFor: ({ isin, mic }) => `test-listing-${mic}-${isin}`, companyIdForLEI: lei => `test-company-${lei}` };

fullTest('frozen observed tables are complete, SDAX includes the second page, intersections are deduplicated', () => {
  const { reference, listingMap } = buildReference(frozen, identity);
  assert.deepEqual(reference.indexes.map(i => [i.index, i.observedMembers]), [['DAX',40],['MDAX',50],['SDAX',70],['TECDAX',30],['EURO_STOXX_50',50]]);
  assert.equal(new Set(reference.members.map(m => m.isin)).size, reference.members.length);
  assert.equal(reference.counts.referenceMemberships, 240);
  const sap = reference.members.find(m => m.isin === 'DE0007164600');
  assert.deepEqual(sap.indexMemberships, ['DAX', 'TECDAX', 'EURO_STOXX_50']);
  const sapListings = listingMap.listings.filter(m => m.isin === 'DE0007164600');
  assert.equal(sapListings.length, 1);
  assert.equal(sapListings[0].mic, 'XETR');
  assert.equal(sapListings[0].currency, 'EUR');
  assert.equal(sapListings[0].providerVerified, false);
  assert.equal(sapListings[0].historicalIDsImported, false);
});

fullTest('official EURO STOXX 50 rows take priority but conflict and unresolved review date remain explicit', () => {
  const { reference } = buildReference(frozen, identity);
  const sx = reference.indexes.find(i => i.index === 'EURO_STOXX_50');
  assert.equal(sx.referenceCompleteness, 'COMPLETE_OFFICIAL_ROWS_EFFECTIVE_DATE_UNRESOLVED');
  assert.equal(sx.effectiveDate, null);
  assert.ok(sx.memberISINs.includes('DE0007664039'));
  assert.ok(sx.memberISINs.includes('NL0000395903'));
  assert.ok(!sx.memberISINs.includes('FR0010208488'));
  assert.ok(!sx.memberISINs.includes('FI0009000681'));
  assert.deepEqual(sx.referenceConflicts[0].alternativeOnly, ['Engie', 'Nokia']);
});

fullTest('German preferred class stays a local equity, no ADR or issuer domicile inferred from index or ISIN', () => {
  const { listingMap } = buildReference(frozen, identity);
  const vw = listingMap.listings.find(m => m.isin === 'DE0007664039');
  assert.equal(vw.shareClass, 'PREFERRED_SHARE');
  assert.equal(vw.mic, 'XETR');
  assert.equal(vw.priceRelease, 'NOT_GRANTED');
  const airbus = listingMap.listings.find(m => m.isin === 'NL0000235190');
  assert.ok(airbus.indexMemberships.includes('DAX'));
  assert.notEqual(airbus.companyReference.domicileCountry, 'DE');
  assert.equal(airbus.companyReference.domicileCountry, 'NL');
});

fullTest('unverified provider symbols never gain import approval, canonical IDs come only from injected Core', () => {
  const { listingMap } = buildReference(frozen, identity);
  assert.ok(listingMap.listings.every(m => m.providerVerified === false));
  assert.ok(listingMap.listings.filter(m => m.listingId).every(m => m.listingId.startsWith('test-listing-')));
  const noCore = buildReference(frozen, {}).listingMap;
  assert.ok(noCore.listings.every(m => !m.securityId && !m.listingId));
  assert.ok(noCore.listings.every(m => m.identityStatus === 'CANONICAL_IDENTITY_NOT_IMPLEMENTED'));
});

fullTest('Alzchem dated official conversion fixes stale reference without history stitching', () => {
  const { listingMap } = buildReference(frozen, identity);
  const alzchem = listingMap.listings.find(m => m.isin === 'DE000A41YHG1');
  assert.equal(alzchem.mappingStatus, 'VERIFIED');
  assert.equal(alzchem.ticker, 'ACT0');
  assert.equal(alzchem.providerSymbol, null);
  assert.equal(alzchem.predecessorISIN, 'DE000A2YNT30');
  assert.equal(alzchem.identityChangeEvidence.effectiveDate, '2026-09-17');
  assert.ok(alzchem.mappingSource.includes('alzchem-official-registered-conversion-20260917'));
  assert.ok(!listingMap.listings.some(m => m.isin === 'DE000A2YNT30'));
  assert.equal(alzchem.historicalListingId, null);
});

fullTest('Luhn validation, duplicate membership and announced future membership are rejected', () => {
  assert.ok(validISIN('DE0007164600'));
  assert.ok(!validISIN('DE0007164601'));
  const duplicate = structuredClone(frozen); duplicate.indexes[0].members.push(duplicate.indexes[0].members[0]);
  assert.throws(() => buildReference(duplicate), /DUPLICATE_INDEX_SHARE_CLASS/);
  const future = structuredClone(frozen); future.indexes[0].effectiveDate = '2026-12-01';
  assert.throws(() => buildReference(future), /FUTURE_MEMBERSHIP_NOT_EFFECTIVE/);
  const invalid = structuredClone(frozen); invalid.indexes[0].members[0].isin = 'DE0007164601';
  assert.throws(() => buildReference(invalid), /INVALID_ISIN/);
});

fullTest('partial reference does not invent missing members or block independently proven members', () => {
  const partial = structuredClone(frozen); partial.indexes[0].members.pop();
  const { reference } = buildReference(partial, identity);
  assert.equal(reference.indexes[0].observedMembers, 39);
  assert.equal(reference.indexes[0].missingReferenceCount, 1);
  assert.equal(reference.indexes[0].referenceCompleteness, 'REFERENCE_UNRESOLVED');
  assert.ok(reference.members.some(m => m.isin === 'DE0007164600'));
});

fullTest('output is deterministic, explicit and isolated; no quote fields are written', () => {
  const one = buildReference(frozen, identity); const two = buildReference(frozen, identity);
  assert.deepEqual(one, two);
  assert.throws(() => run([]), /EXPLICIT_OUT_REQUIRED/);
  const out = mkdtempSync(resolve(tmpdir(), 'de-eu-reference-'));
  try {
    run(['--out', out, '--source', sourcePath]);
    assert.deepEqual(readdirSync(out).sort(), ['de_eu_listing_map.json','de_eu_reference_universe.json']);
    const listing = JSON.parse(readFileSync(resolve(out, 'de_eu_listing_map.json')));
    assert.ok(listing.listings.every(m => !('close' in m) && !('bars' in m)));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

fullTest('BBVA/Santander use exact ISIN Xetra alternatives without primary-venue or current-price certification', () => {
  const { listingMap } = buildReference(frozen, identity);
  for (const isin of ['ES0113211835','ES0113900J37']) {
    const r = listingMap.listings.find(m => m.isin === isin);
    assert.equal(r.mic, 'XETR');
    assert.equal(r.preferredMIC, 'XMAD');
    assert.equal(r.alternativeListing, true);
    assert.equal(r.primaryListing, false);
    assert.equal(r.mappingStatus, 'VERIFIED');
    assert.equal(r.providerVerified, false);
    assert.equal(r.selectionReason, 'PRIMARY_PROVIDER_MAPPING_UNRESOLVED_VERIFIED_XETRA_ALTERNATIVE');
    assert.equal(r.companyAssociationStatus, 'EXISTING_VU_COMPANY_ASSOCIATION_UNRESOLVED');
  }
});

const fixture = { asOf:'2026-10-06', frozenAt:'2026-10-06T00:00:00Z', sources:[{id:'TEST_SOURCE',type:'SYNTHETIC_CONTRACT_FIXTURE'}], indexes:[{index:'DAX',expectedMembers:2,referenceDate:'2026-10-06',effectiveDate:null,referenceCompleteness:'REFERENCE_UNRESOLVED',sourceIds:['TEST_SOURCE'],members:[{name:'Synthetic equity',isin:'DE0007164600'}]}],listingCandidates:[{isin:'DE0007164600',mic:'XETR',officialActive:true,localTicker:'SAP',tradingCurrency:'EUR',providerSymbol:'TEST_SYMBOL',providerIdentityBasis:'SYNTHETIC_NOT_A_REAL_PROVIDER_MAPPING',mappingSourceIds:['TEST_SOURCE'],companyReference:{lei:null}}] };
test('synthetic schema fixture preserves partial-reference and unverified-provider boundaries',()=>{
 const {reference,listingMap}=buildReference(fixture);assert.equal(reference.indexes[0].missingReferenceCount,1);assert.equal(reference.indexes[0].referenceCompleteness,'REFERENCE_UNRESOLVED');assert.equal(reference.members.length,1);assert.equal(listingMap.listings[0].providerVerified,false);assert.equal(listingMap.listings[0].priceRelease,'NOT_GRANTED');
});
test('central ISIN validation rejects source errors and future membership',()=>{
 assert.ok(validISIN('DE0007164600'));assert.ok(!validISIN('DE0007164601'));
 const bad=structuredClone(fixture);bad.indexes[0].members[0].isin='DE0007164601';assert.throws(()=>buildReference(bad),/INVALID_ISIN/);
 const future=structuredClone(fixture);future.indexes[0].effectiveDate='2026-12-01';assert.throws(()=>buildReference(future),/FUTURE_MEMBERSHIP/);
});

test('named current-core corporate REIT uses independent CS/issuer proof while preserving actual CBCJXS CFI and provider conflict',()=>{
 const target={asOf:'2026-10-06',frozenAt:'2026-10-06T00:00:00Z',sources:[{id:'T7',type:'OFFICIAL_EXCHANGE_T7_INSTRUMENT_REFERENCE',url:'https://example.test/t7.csv',referenceDate:'2026-10-06',sha256:'a'.repeat(64)},{id:'CFI',type:'REGULATORY_CFI_FACET_REFERENCE',url:'https://registers.esma.europa.eu/solr/esma_registers_firds/select?q=synthetic',referenceDate:'2026-10-01',sha256:'b'.repeat(64)}],indexes:[{index:'SDAX',expectedMembers:1,sourceIds:['T7'],referenceDate:'2026-10-06',effectiveDate:null,referenceCompleteness:'SYNTHETIC_FIXTURE',members:[{name:'Synthetic reviewed local corporate REIT',isin:'DE000A3H2333'}]}],listingCandidates:[{isin:'DE000A3H2333',mic:'XETR',officialActive:true,officialInstrumentType:'CS',quotationUnit:'Shares',localTicker:'HABA',tradingCurrency:'EUR',shareClass:'NON_EQUITY_CFI',mappingSourceIds:['T7'],regulatorySourceIds:['CFI'],providerSymbol:null,providerIdentityBasis:'UNRESOLVED',providerReportedAssetType:'ETF',securityEvidence:{isin:'DE000A3H2333',issuerLEI:'529900EJTD8IR1GN0P96',cfiCodes:['CBCJXS'],responseSHA256:'b'.repeat(64)},companyReference:{lei:'529900EJTD8IR1GN0P96',basis:'EXACT_GLEIF_ISIN_LEI_REFERENCE',evidence:{leiRecordURL:'https://api.gleif.org/api/v1/lei-records/529900EJTD8IR1GN0P96',leiBatchResponseSHA256:'c'.repeat(64)}}}]};
 const row=buildReference(target).listingMap.listings[0];assert.equal(row.shareClass,'LOCAL_CORPORATE_REIT_SHARE');assert.deepEqual(row.securityEvidence.cfiCodes,['CBCJXS']);assert.equal(row.originalShareClass,'NON_EQUITY_CFI');assert.equal(row.providerReportedAssetType,'ETF');assert.equal(row.providerVerified,false);assert.equal(row.priceRelease,'NOT_GRANTED');assert.equal(row.classificationReviewStatus,'READY');assert.deepEqual(row.classificationEvidence.originalCFICodes,['CBCJXS']);
 for(const patch of [{mic:'XFRA'},{officialActive:false},{quotationUnit:'Units'},{securityEvidence:null},{securityEvidence:{...target.listingCandidates[0].securityEvidence,cfiCodes:['CICJXS']}},{companyReference:{lei:'529900D6BF99LW9R2E68'}},{regulatorySourceIds:[]},{officialInstrumentType:'ETF'}]){const changed=structuredClone(target);Object.assign(changed.listingCandidates[0],patch);assert.equal(buildReference(changed).listingMap.listings[0].shareClass,'NON_EQUITY_CFI');}
 const other=structuredClone(target);other.indexes[0].members[0].isin='DE0007164600';other.listingCandidates[0].isin='DE0007164600';assert.equal(buildReference(other).listingMap.listings[0].shareClass,'NON_EQUITY_CFI');
});
