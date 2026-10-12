import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {approvedNonEquityPrune,universeChanges} from '../universe-regression.mjs';
const cid='iss_cik_0000007789',common={symbol:'ASB',instrumentId:'vu_eedf5a6036188e'},note={symbol:'ASBA',instrumentId:'vu_47fcc13d40f235'};
const master={...note,issuerId:cid,cik:'0000007789',securityClass:'DEBT',productEligibility:'EXCLUDED',productEligibilityReason:'CONFIRMED_NON_EQUITY:DEBT'};
test('exact same-owner non-equity Master exclusion permits pruning, never a new mapping',()=>{
 assert(approvedNonEquityPrune(cid,[common,note],[common],[master]));
 for(const alteration of [{issuerId:'iss_cik_0000320193'},{cik:'0000320193'},{productEligibility:'ELIGIBLE'},{securityClass:'EQUITY_COMMON'},{productEligibilityReason:'UNCONFIRMED'},{instrumentId:'vu_00000000000000'}])
  assert(!approvedNonEquityPrune(cid,[common,note],[common],[{...master,...alteration}]));
 assert(!approvedNonEquityPrune(cid,[common,note],[common],[]));
 assert(!approvedNonEquityPrune(cid,[common,note],[common],[master,{...master}]));
 assert(!approvedNonEquityPrune(cid,[common,note],[],[master]));
 assert(!approvedNonEquityPrune(cid,[common,note],[{...common,instrumentId:'vu_11111111111111'}],[master]));
 assert(!approvedNonEquityPrune(cid,[common,note],[common,{symbol:'NEW',instrumentId:'vu_11111111111111'}],[master]));
});
test('publication accepts the observed Master cleanup but refuses unexplained listing loss',()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-identity-prune-')),old=join(root,'old'),current=join(root,'current');
 const write=(base,path,value)=>{const p=join(base,path);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,JSON.stringify(value));};
 try{
  const oldPath=`snapshots/old/${cid}.json`,newPath=`snapshots/new/${cid}.json`;
  const payload={companyId:cid,news:[],latestFinancials:{state:'UNAVAILABLE'}};
  write(old,'index.json',{generation:'old'});write(old,'manifest.json',{assets:{[oldPath]:{}}});
  write(old,oldPath,{...payload,listings:[common,note]});
  write(current,'manifest.json',{generation:'new',eligibility:{[cid]:{}}});write(current,newPath,{...payload,listings:[common]});
  const result=universeChanges(current,old,{masterRows:[master]});assert.equal(result.identityRemappings,0);assert.deepEqual(result.approvedNonEquityPrunes,[{issuer:cid,removedListings:1}]);
  assert.throws(()=>universeChanges(current,old,{masterRows:[]}),/UNEXPLAINED_PUBLIC_IDENTITY_REMAPPING/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
