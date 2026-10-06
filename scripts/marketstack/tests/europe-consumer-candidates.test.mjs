import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,statSync,symlinkSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {buildCandidates,run} from '../build-europe-consumer-candidates.mjs';
const require=createRequire(import.meta.url),Identity=require('../../../core/identity.js');
const LEI='529900D6BF99LW9R2E68';
const candidate=(extra={})=>({name:'Synthetic source-backed issuer',isin:'DE000BASF111',mic:'XETR',issuerLEI:LEI,issuerDomicile:'DE',shareClass:'ORDINARY_SHARE',tradingCurrency:'EUR',providerSymbolCandidates:['BAS.DE'],officialLocalTicker:'BAS',mappingBasis:'EXACT_REGULATORY_ISIN_LEI_AND_OPERATOR_ISIN_MIC_REFERENCE',metadataSourceIds:['official-test'],issuerEvidence:{regulatoryResponseSHA256:'synthetic-issuer-evidence'},securityEvidence:{cfiCodes:['ESVUFR'],responseSHA256:'synthetic-share-class-source-response'},listingActive:true,officialActivityStatus:'HISTORICAL_OFFICIAL_ACTIVE',tier:'B_CANDIDATE',...extra});
const coreRow=(extra={})=>({name:'Synthetic SAP local listing',isin:'DE0007164600',mic:'XETR',ticker:'SAP',shareClass:'ORDINARY_SHARE',tradingCurrency:'EUR',mappingStatus:'VERIFIED',mappingSource:['official-test'],providerSymbol:'SAP.DE',indexMemberships:['DAX','TECDAX'],companyReference:{lei:LEI,domicileCountry:'DE'},officialActive:true,...extra});
const inputs=(rows=[],core=[coreRow()])=>({source:{sourceDate:'2026-10-01',listings:rows},coreMap:{asOf:'2026-10-06',listings:core}});

test('canonical local IDs preserve legacy ticker IDs and never imply current provider/Company admission',()=>{
 const before=Identity.securityIdForTicker('SAP');const out=buildCandidates(inputs([candidate({currentProviderVerified:true,providerVerified:true,companyId:'unproven-id'})]));
 const c=out.core.listings[0],r=out.germany.listings[0];assert.equal(c.listingId,Identity.listingIdFor({isin:c.isin,mic:c.mic}));assert.notEqual(c.securityId,before);assert.equal(Identity.securityIdForTicker('SAP'),before);
 assert.equal(r.companyId,null);assert.equal(r.referencedIssuerId,Identity.companyIdForLEI(LEI));assert.equal(r.currentProviderVerified,false);assert.equal(r.providerVerified,false);assert.equal(r.priceRelease,'NOT_GRANTED');assert.equal(r.mappingStatus,'VERIFIED');
});
test('mandatory security wins its preferred listing; diagnostic alternatives never overwrite it',()=>{
 const source=candidate({isin:'DE0007164600',mic:'XFRA',providerSymbolCandidates:['SAP.F'],availableListingAlternatives:[{mic:'XFRA',currency:'EUR',providerSymbolCandidates:['SAP.F']}]});
 const out=buildCandidates(inputs([source]));assert.equal(out.core.listings[0].mic,'XETR');assert.equal(out.core.listings[0].providerSymbol,'SAP.DE');assert.equal(out.germany.listings.length,0);assert.equal(out.diagnostics.alternativeDiagnostics[0].status,'DIAGNOSTIC_ONLY_NOT_SELECTED');
});
test('regional selection is based on issuer domicile and non-index memberships stay empty',()=>{
 const out=buildCandidates(inputs([candidate({isin:'NL0010273215',issuerDomicile:'NL',mic:'XAMS',tradingCurrency:'EUR',officialLocalTicker:'ASML',providerSymbolCandidates:['ASML.AS'],indexMemberships:['invented-AEX'],alternativeListing:true,preferredMICs:['XAMS']})]));
 assert.equal(out.germany.listings.length,0);assert.equal(out.europe.listings.length,1);assert.deepEqual(out.europe.listings[0].indexMemberships,[]);assert.equal(out.europe.listings[0].alternativeListing,true);assert.equal(out.europe.listings[0].primaryListingVerified,false);
});
test('future, explicit inactive, fund/rights/depositary classes and out-of-scope issuers are skipped with causes',()=>{
 for(const patch of [{effectiveDate:'2026-12-01'},{referenceEvidence:[{effectiveDate:'2026-12-01'}]},{listingActive:false},{assetType:'ETF'},{shareClass:'DEPOSITARY_RECEIPT'},{issuerDomicile:'US'},{shareClass:'RIGHT'},{officialActivityStatus:'NOT_IN_CURRENT_XETRA_REFERENCE'}]){
  const out=buildCandidates(inputs([candidate(patch)]));assert.equal(out.germany.listings.length,0);assert.equal(out.europe.listings.length,0);assert.equal(out.diagnostics.rejected.length,1);assert.ok(out.diagnostics.rejected[0].cause);
 }
});
test('a field flag or name match cannot replace missing independent identity/share/currency evidence',()=>{
 for(const patch of [{mappingBasis:'FUZZY_NAME'},{securityEvidence:{cfiCodes:['CIXXXX']}},{issuerEvidence:null},{metadataSourceIds:[]},{tradingCurrency:null},{issuerLEI:'INVALID'}]){
  const out=buildCandidates(inputs([candidate(patch)]));assert.equal(out.germany.listings.length,0);assert.equal(out.diagnostics.rejected.length,1);
 }
});
test('genuine local preferred classes are allowed, but contradictory CFI is rejected',()=>{
 const row=candidate({isin:'DE0007664039',shareClass:'PREFERRED_SHARE',securityEvidence:{cfiCodes:['EPVUFR'],responseSHA256:'synthetic-share-class-source-response'},officialLocalTicker:'VOW3',providerSymbolCandidates:['VOW3.DE']});
 assert.equal(buildCandidates(inputs([row])).germany.listings[0].shareClass,'PREFERRED_SHARE');assert.equal(buildCandidates(inputs([{...row,securityEvidence:{cfiCodes:['ESVUFR'],responseSHA256:'synthetic-share-class-source-response'}}])).diagnostics.rejected.length,1);
});
test('GBP/GBX unit is never inferred; unsupported/absent units block only that candidate',()=>{
 const row=candidate({issuerDomicile:'GB',mic:'XLON',tradingCurrency:'GBP',officialLocalTicker:'TEST',providerSymbolCandidates:['TEST.L']});
 assert.equal(buildCandidates(inputs([row])).diagnostics.rejected[0].cause,'MISSING_FX_OR_SHARE_BASIS');
 assert.equal(buildCandidates(inputs([{...row,quoteUnit:'MINOR',quoteUnitEvidence:['synthetic-official-GBX-quote-evidence']}])).europe.listings[0].quoteUnit,'MINOR');
});
test('missing symbols for a proved core listing remain missing, and quarantined symbols cannot be queried',()=>{
 const out=buildCandidates(inputs([candidate({providerQuarantineReasons:['METADATA_ISIN_MISMATCH']})],[coreRow({providerSymbol:null})]));
 assert.equal(out.core.listings[0].providerSymbol,null);assert.equal(out.diagnostics.unresolvedCore.length,1);assert.equal(out.germany.listings[0].providerSymbol,null);assert.equal(out.germany.listings[0].providerStatus,'HISTORICAL_PROVIDER_CONTRADICTION');
});
test('duplicate securities abort rather than first-match selection; deterministic replay has no clock',()=>{
 const input=inputs([candidate()]);assert.deepEqual(buildCandidates(input),buildCandidates(input));
 assert.throws(()=>buildCandidates(inputs([candidate(),candidate({mic:'XFRA'})])),/DUPLICATE_EXPANSION_SHARE_CLASS/);
 assert.throws(()=>buildCandidates(inputs([],[coreRow(),coreRow({mic:'XFRA'})])),/DUPLICATE_CORE_SHARE_CLASS/);
 const future=inputs([candidate()]);future.source.sourceDate='2026-11-01';assert.throws(()=>buildCandidates(future),/FUTURE_OR_INVALID_REFERENCE_SOURCE/);
});
test('CLI requires private explicit inputs, rejects symlinks and any Git checkout output, writes only private metadata maps',()=>{
 assert.throws(()=>run([]),/EXPLICIT_PRIVATE_SOURCE_CORE_MAP_OUT_REQUIRED/);const root=mkdtempSync(join(tmpdir(),'eu-candidate-test-'));
 try{
  const source=join(root,'source.json'),core=join(root,'core.json'),out=join(root,'out');const input=inputs([candidate()]);writeFileSync(source,JSON.stringify(input.source));writeFileSync(core,JSON.stringify(input.coreMap));
  const args=['--source',source,'--core-map',core,'--out',out];assert.equal(run(args).germany.shareClasses,1);const file=join(out,'germany_ab_listing_map.json');assert.equal(statSync(file).mode&0o777,0o600);assert.equal(statSync(out).mode&0o777,0o700);
  const map=JSON.parse(readFileSync(file));assert.ok(!('bars' in map.listings[0]));assert.equal(map.listings[0].currentProviderVerified,false);
  const fakeRepo=join(root,'other-checkout');mkdirSync(fakeRepo);writeFileSync(join(fakeRepo,'.git'),'gitdir: elsewhere');assert.throws(()=>run([...args.slice(0,4),'--out',join(fakeRepo,'public')]),/GIT_REPOSITORY_REJECTED/);
  symlinkSync(out,join(root,'link'));assert.throws(()=>run([...args.slice(0,4),'--out',join(root,'link')]),/SYMLINK_REJECTED/);
  assert.throws(()=>run([...args.slice(0,4),'--out',resolve(new URL('../../..',import.meta.url).pathname,'public-europe-output')]),/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
