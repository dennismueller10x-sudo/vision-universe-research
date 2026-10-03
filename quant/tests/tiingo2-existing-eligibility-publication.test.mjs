import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {verifyExistingEligibilityCorrections,verifyReconciledCanonicalRows,EXISTING_ELIGIBILITY_CORRECTIONS_PATH as proofPath,CANONICAL_PUBLICATION_PATHS as paths} from '../../scripts/market/tiingo2-publication.mjs';
const Company=createRequire(import.meta.url)('../engines/company-master.js'),hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'dna-correction-publication-')),output=join(root,'stage'),asOf='2026-10-02';
 const save=(base,path,doc)=>{mkdirSync(dirname(join(base,path)),{recursive:true});writeFileSync(join(base,path),JSON.stringify(doc));};
 // The accepted prepublication identity snapshot is immutable. Current public
 // rows become ELIGIBLE after a successful publication and cannot be a legacy
 // false-inactive fixture. Remaining fields freeze the accepted PR349 metadata.
 const accepted=JSON.parse(gunzipSync(readFileSync(new URL('../../docs/tiingo2-productization/qa/baseline-identities.json.gz',import.meta.url))));
 const before={...accepted.instruments.find(r=>r.symbol==='DNA'),companyName:'Ginkgo Bioworks Holdings, Inc.',exchange:'NYSE',firstTradeDate:'2021-04-19',securityType:'COMMON_STOCK',currency:'USD',active:true,
  productEligibility:'REVIEW',productEligibilityReason:'UNCONFIRMED:LISTING_INACTIVE',securityClass:'EQUITY_COMMON',classificationAgrees:true,screenerEligible:false,screenerReason:'Produktentscheidung des Wertpapierstamms: REVIEW (UNCONFIRMED:LISTING_INACTIVE)'};
 const decision={...accepted.eligibility.find(r=>r.ticker==='DNA'),exchange:'NYSE',start_date:'2021-04-19',active_status:'INACTIVE',product_eligibility_reason:'UNCONFIRMED:LISTING_INACTIVE',
  evidence_source:'SECURITY_MASTER_REJUDGED',review_flags:['NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED','MASTER_REJUDGED:EQUITY_COMMON']};
 const keep={instrumentId:'vu_protected',symbol:'KEEP',companyName:'Protected Company'};
 save(root,paths.instruments+'/DN.json',{instruments:[before,keep]});save(root,paths.eligibility,{decisions:[decision,{ticker:'KEEP',securityId:'ref_KEEP',product_eligibility:'ELIGIBLE'}]});
 const afterDecision={...decision,active_status:'ACTIVE',product_eligibility:'ELIGIBLE',product_eligibility_reason:'TIINGO2_VERIFIED_CURRENT_LISTING',evidence_source:'TIINGO2_EXISTING_LISTING_REVERIFIED'},after=Company.applyEligibility(structuredClone(before),afterDecision);
 const proof={schemaVersion:'tiingo2-existing-eligibility-correction-1',asOf,corrections:[{ticker:'DNA',securityId:'ref_DNA',instrumentId:before.instrumentId,listingKey:'DNA|NYSE|2021-04-19',beforeInstrumentSha256:hash(before),afterInstrumentSha256:hash(after),beforeDecisionSha256:hash(decision),afterDecisionSha256:hash(afterDecision),allowedInstrumentFields:['productEligibility','productEligibilityReason','screenerEligible','screenerReason'],corporateActionGateWaived:false,evidence:{providerMetadataSha256:'1'.repeat(64),providerResponseSha256:'2'.repeat(64),officialEvidenceSha256:'3'.repeat(64),secIdentitySha256:'4'.repeat(64),listingActive:true,identityMatched:true,commonEquity:true,priceHistoryValid:true,latestPriceValid:true,corporateActionsValid:true,secIdentityVerified:true,cik:'0001830214',bars:1371,latestDate:'2026-10-01',asOf}}]};
 const documents={[proofPath]:proof,[paths.instruments+'/DN.json']:{instruments:[after,keep]},[paths.eligibility]:{decisions:[afterDecision,{ticker:'KEEP',securityId:'ref_KEEP',product_eligibility:'ELIGIBLE'}]},
  'quant/data/market/discover-series/ref_DNA.json':{securityId:'ref_DNA',ticker:'DNA',source:'tiingo',dataMode:'real',priceSeriesType:'SPLIT_ADJUSTED',corporateActionStatus:'PASS',sourceBarCount:1371,sourceResponseSha256:'2'.repeat(64),currency:'USD',asOf:'2026-10-01',publishCheckedAt:asOf,publishBasis:'ISOLATED_TIINGO2_CANONICAL_PROJECTION',barCount:5,points:['2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-01'].map(d=>[d,10])},
  'quant/data/sec/canonical_index.json':{companies:[{ticker:'DNA',cik:'0001830214',securityId:'sec_DNA',file:'canonical/DNA.json'}]},
  'quant/data/sec/consumer/CIK0001830214.json':{cik:'0001830214',securityIds:['ref_DNA'],tickers:['DNA'],dataSource:{isMock:false,provider:'sec_edgar'},annual:{revenue:[[2025,'FY','2025-12-31',100,'2026-02-01','verified-accession']]},quarterly:{}}};
 const manifest={asOf,additions:[],removals:[],files:[]};
 function restage(){manifest.files=[];for(const[path,doc]of Object.entries(documents)){const stagedPath='blobs/'+hash(path)+'.json';save(output,stagedPath,doc);manifest.files.push({path,stagedPath,stagedSha256:hash(doc)});}if(documents[proofPath])manifest.existingEligibilityCorrectionsSha256=hash(documents[proofPath]);else delete manifest.existingEligibilityCorrectionsSha256;}
 restage();try{return fn({root,output,manifest,documents,proof,restage});}finally{rmSync(root,{recursive:true});}
}
test('hash-bound DNA proof corrects eligibility through existing Company.applyEligibility without adding a consumer member',()=>fixture(c=>{
 const allowed=verifyExistingEligibilityCorrections(c);assert.equal(allowed.size,2);assert.equal(c.manifest.additions.length,0);
 assert.equal(verifyReconciledCanonicalRows(c),undefined);
}));
test('unproved changes, edited proof bytes, invalid corporate action/SEC and another symbol stay blocked',()=>{
 for(const mutate of [c=>{delete c.manifest.existingEligibilityCorrectionsSha256;},c=>{c.proof.corrections[0].ticker='OTHER';c.restage();},
  c=>{c.proof.corrections[0].evidence.corporateActionsValid=false;c.restage();},c=>{c.documents['quant/data/market/discover-series/ref_DNA.json'].corporateActionStatus='UNKNOWN';c.restage();},
  c=>{c.documents['quant/data/sec/canonical_index.json'].companies[0].cik='9999999999';c.restage();},
  c=>{c.documents['quant/data/sec/consumer/CIK0001830214.json'].securityIds=['ref_OTHER'];c.restage();},
  c=>{c.documents['quant/data/market/discover-series/ref_DNA.json'].sourceResponseSha256='9'.repeat(64);c.restage();},
  c=>{c.documents[paths.instruments+'/DN.json'].instruments[0].companyName='Different issuer';c.restage();},
  c=>{c.proof.corrections[0].beforeDecisionSha256='0'.repeat(64);c.restage();},
  c=>{c.manifest.additions.push({ticker:'DNA',securityId:'ref_DNA'});},
  c=>{const entry=c.manifest.files.find(r=>r.path===proofPath);writeFileSync(join(c.output,entry.stagedPath),'{}');}])fixture(c=>{mutate(c);assert.throws(()=>verifyReconciledCanonicalRows(c),/EXISTING_ELIGIBILITY/);});
});
test('DNA proof never permits an unscoped baseline instrument or eligibility rewrite',()=>{
 for(const mutate of [c=>c.documents[paths.instruments+'/DN.json'].instruments[1].companyName='Changed protected issuer',
  c=>c.documents[paths.eligibility].decisions[1].product_eligibility='REVIEW'])fixture(c=>{mutate(c);c.restage();assert.throws(()=>verifyReconciledCanonicalRows(c),/BASELINE_ROW_CHANGED/);});
 fixture(c=>{delete c.documents[proofPath];c.restage();delete c.manifest.existingEligibilityCorrectionsSha256;assert.throws(()=>verifyReconciledCanonicalRows(c),/BASELINE_ROW_CHANGED/);});
});
