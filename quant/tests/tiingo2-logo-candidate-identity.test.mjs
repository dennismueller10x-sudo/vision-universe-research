import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assembleLogoCandidates,assertScopedSecIdentities} from '../../scripts/market/tiingo2-run-productization.mjs';
import {materializeLogos} from '../../scripts/market/tiingo2-logos.mjs';
function inputs(){return {prepared:{priceCandidates:[{ticker:'DNA',companyName:'Ginkgo Bioworks',regressionCase:true}],
 priceSecurities:[{ticker:'DNA',securityId:'ref_DNA',instrumentId:'vu_dna',issuerId:'iss_cik_0001830214',cik:'0001830214'}],pricePayloads:new Map([['DNA',{}]])},
 projection:{report:{rows:[{ticker:'DNA',securityId:'ref_DNA',instrumentId:'vu_dna',watchlist:{ready:true},chart:{freshValidationState:'VALIDATED',canonicalProof:{corporateActionStatus:'PASS'}}}]}},
 fundamentals:{rows:[{ticker:'DNA',securityId:'ref_DNA',cik:'0001830214',pitValid:true}]}};}
test('fresh canonical chart/watchlist and verified matching SEC issuer admit regression DNA to the existing central logo builder',async()=>{
 const candidates=assembleLogoCandidates(inputs());assert.equal(candidates[0].identity.resolved,true);assert.equal(candidates[0].companyId,'iss_cik_0001830214');
 let called=false;const report=await materializeLogos({outputRoot:mkdtempSync(join(tmpdir(),'dna-central-logos-')),seedRoot:mkdtempSync(join(tmpdir(),'dna-logo-empty-')),candidates,
  runBuilder:async({args})=>{called=true;assert.ok(args.includes('--tickers=DNA'));}});
 assert.equal(called,true);assert.equal(report.rows[0].status,'LOGO_FALLBACK');assert.notEqual(report.rows[0].reason,'ISSUER_IDENTITY_UNRESOLVED');
});
test('mismatched SEC, missing fresh price, failed corporate action and preserved-only charts cannot grant logo identity',()=>{
 for(const change of [i=>i.fundamentals.rows[0].cik='9999999999',i=>i.prepared.pricePayloads.clear(),
  i=>i.projection.report.rows[0].chart.canonicalProof.corporateActionStatus='UNKNOWN',
  i=>i.projection.report.rows[0].chart.freshValidationState='BLOCKED',i=>i.projection.report.rows[0].watchlist.ready=false,
  i=>i.fundamentals.rows[0].securityId='ref_OTHER',i=>i.projection.report.rows[0].instrumentId='vu_other']){
  const i=inputs();i.prepared.priceCandidates[0].identityVerified=true;i.prepared.priceCandidates[0].evidence={identity:{resolved:true}};change(i);
  const row=assembleLogoCandidates(i)[0];assert.equal(row.identityVerified,false);assert.equal(row.identity.resolved,false);assert.equal(row.evidence.identity.resolved,false);
 }
});
test('accepted audited discovery identity stays unchanged and canonical issuerId is retained',()=>{
 const i=inputs(),identity={resolved:true,listingKey:'accepted-proof'};i.prepared.priceCandidates[0]={ticker:'DNA',evidence:{identity}};i.prepared.pricePayloads.clear();
 const result=assembleLogoCandidates(i)[0];assert.deepEqual(result.evidence.identity,identity);assert.equal(result.companyId,'iss_cik_0001830214');
 assert.equal(result.cik,'0001830214','verified canonical issuer identity reaches the central asset pipeline independently of financial coverage');
});
test('new SEC identity contradictions block publication while missing facts and baseline regressions preserve product-specific coverage',()=>{
 const securities=[{ticker:'NEW'}];
 for(const reason of ['SEC_IDENTITY_CIK_COLLISION','SEC_SUBMISSIONS_CIK_COLLISION','SEC_LISTING_IDENTITY_NOT_CONFIRMED']){
  assert.throws(()=>assertScopedSecIdentities({securities,report:{rows:[{ticker:'NEW',reason}]}}),/NEW_SECURITY_SEC_IDENTITY_CONTRADICTION/);
  assert.doesNotThrow(()=>assertScopedSecIdentities({securities,report:{rows:[{ticker:'BASE',reason}]}}));
 }
 for(const reason of ['NO_SEC_CIK','NO_PERIODIC_PIT_FACTS','SEC_IDENTITY_ACCESS_FAILURE'])assert.doesNotThrow(()=>assertScopedSecIdentities({securities,report:{rows:[{ticker:'NEW',reason,pitValid:false}]}}));
});
