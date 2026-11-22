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

test('beendete Notierung (Teil B3, CONFIRMED_LISTING_ENDED) erklaert den Abgang einer Notierung, sonst nichts',()=>{
 const ended={...master,securityClass:'EQUITY_COMMON',productEligibilityReason:'CONFIRMED_LISTING_ENDED:MASTER_INACTIVE'};
 assert(approvedNonEquityPrune(cid,[common,note],[common],[ended]));
 assert(approvedNonEquityPrune(cid,[common,note],[common],[{...ended,productEligibilityReason:'CONFIRMED_LISTING_ENDED:ACQUISITION'}]));
 for(const alteration of [{issuerId:'iss_cik_0000320193'},{cik:'0000320193'},{productEligibility:'ELIGIBLE'},{productEligibilityReason:'CONFIRMED_LISTING_ENDED:OTHER'},{productEligibilityReason:'UNCONFIRMED:LISTING_INACTIVE'},{instrumentId:'vu_00000000000000'}])
  assert(!approvedNonEquityPrune(cid,[common,note],[common],[{...ended,...alteration}]));
 // Verbleibende Notierung muss unveraendert sein: Neuzugang oder ID-Wechsel bleibt gesperrt, ebenso Abgang ALLER Notierungen
 assert(!approvedNonEquityPrune(cid,[common,note],[common,{symbol:'NEW',instrumentId:'vu_11111111111111'}],[ended]));
 assert(!approvedNonEquityPrune(cid,[common,note],[{...common,instrumentId:'vu_11111111111111'}],[ended]));
 assert(!approvedNonEquityPrune(cid,[common,note],[],[ended]));
});

test('belegte Nachfolge (SUCCEEDED, Nachfolger beim selben Emittenten) erklaert nur den Ersatz, nie Wachstum oder fremde Umbelegung',async()=>{
 const {approvedSuccession}=await import('../universe-regression.mjs');
 const oldL={symbol:'ANY',instrumentId:'vu_aaaaaaaaaaaaaa'},newL={symbol:'DRK',instrumentId:'vu_bbbbbbbbbbbbbb'};
 const pred={...oldL,issuerId:cid,cik:'0000007789',productEligibility:'EXCLUDED',productEligibilityReason:'CONFIRMED_LISTING_ENDED:SUCCEEDED',securityClass:'EQUITY_COMMON'};
 const succ={...newL,issuerId:cid,cik:'0000007789',productEligibility:'ELIGIBLE',productEligibilityReason:'US_COMMON_EQUITY_ON_PRIMARY_VENUE',securityClass:'EQUITY_COMMON'};
 assert(approvedSuccession(cid,[oldL],[newL],[pred,succ]));
 for(const [name,rows] of Object.entries({
  'Nachfolger ohne issuerId':[pred,{...succ,issuerId:null}],'Nachfolger anderer Emittent':[pred,{...succ,issuerId:'iss_cik_0000320193'}],
  'Nachfolger nicht im Produkt':[pred,{...succ,productEligibility:'REVIEW'}],'Vorgaenger anderer Grund':[{...pred,productEligibilityReason:'CONFIRMED_LISTING_ENDED:MASTER_INACTIVE'},succ],
  'Vorgaenger noch zugelassen':[{...pred,productEligibility:'ELIGIBLE'},succ],'Vorgaenger anderer Emittent':[{...pred,issuerId:'iss_cik_0000320193'},succ],'Master fehlt':[]}))
  assert(!approvedSuccession(cid,[oldL],[newL],rows),name);
 assert(!approvedSuccession(cid,[oldL],[newL,{symbol:'EXTRA',instrumentId:'vu_cccccccccccccc'}],[pred,succ]),'Wachstum');
 assert(!approvedSuccession(cid,[oldL],[],[pred,succ]),'alle weg ist Emittenten-Abgang, kein Ersatz');
 assert(!approvedSuccession(cid,[oldL],[oldL],[pred,succ]),'nichts geaendert');
 // Zusammenspiel: SUCCEEDED ist auch als reiner Abgang einer von mehreren Notierungen erklaert
 assert(approvedNonEquityPrune(cid,[common,note],[common],[{...master,securityClass:'EQUITY_COMMON',productEligibilityReason:'CONFIRMED_LISTING_ENDED:SUCCEEDED'}]));
});

test('Veroeffentlichung akzeptiert den belegten Kuerzelwechsel und verweigert ihn ohne Nachfolger im Master',()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-succession-')),old=join(root,'old'),current=join(root,'current');
 const write=(base,path,value)=>{const p=join(base,path);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,JSON.stringify(value));};
 try{
  const a={symbol:'ANY',instrumentId:'vu_aaaaaaaaaaaaaa'},b={symbol:'DRK',instrumentId:'vu_bbbbbbbbbbbbbb'};
  const oldPath=`snapshots/old/${cid}.json`,newPath=`snapshots/new/${cid}.json`,payload={companyId:cid,news:[],latestFinancials:{state:'UNAVAILABLE'}};
  write(old,'index.json',{generation:'old'});write(old,'manifest.json',{assets:{[oldPath]:{}}});write(old,oldPath,{...payload,listings:[a]});
  write(current,'manifest.json',{generation:'new',eligibility:{[cid]:{}}});write(current,newPath,{...payload,listings:[b]});
  const rows=[{...a,issuerId:cid,cik:'0000007789',productEligibility:'EXCLUDED',productEligibilityReason:'CONFIRMED_LISTING_ENDED:SUCCEEDED'},{...b,issuerId:cid,cik:'0000007789',productEligibility:'ELIGIBLE'}];
  const result=universeChanges(current,old,{masterRows:rows});
  assert.equal(result.identityRemappings,0);assert.deepEqual(result.approvedSuccessions,[{issuer:cid,removedListings:['ANY'],addedListings:['DRK']}]);
  assert.throws(()=>universeChanges(current,old,{masterRows:[rows[0]]}),/UNEXPLAINED_PUBLIC_IDENTITY_REMAPPING/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
