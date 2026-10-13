import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLiveActions } from '../europe-live-actions-review.mjs';
const h = 'a'.repeat(64), sec = { securityId:'s', isin:'ISIN1', primaryListingId:'listing', listings:[{ listingId:'listing', mic:'XETR', currency:'EUR', providerSymbol:'SYM', quoteUnit:'EUR' }] };
const catalog = {securities:[sec]};
const base = {securityId:'s',from:'2025-05-01',to:'2025-05-02',beforeClose:90,afterClose:30,calendarVerified:true,priorSessionDate:'2025-05-01',missingSessions:0,sourceNormalizedSha256:h,currency:'EUR',quoteUnit:'EUR',priceCurrencyVerified:true};
const proof = {verified:true,independentlyVerified:true,sourceHashesVerified:true,sourceSha256:h,securityId:'s',listingId:'listing',mic:'XETR',isin:'ISIN1',currency:'EUR',from:'2020-01-01',to:'2026-12-31',historicalListingVerified:true,providerTicker:'SYM'};
const convention = {...proof,sourceKind:'INDEPENDENT_ACTION_CONVENTION_DOCUMENTATION',splitFactorConvention:'NEW_SHARES_PER_OLD_SHARE',eventDateSemantics:'EX_TRADING_DATE',dividendAmountUnit:'EUR'};
const action = {symbol:'SYM',exchange:'XETR',date:'2025-05-02',split_factor:3};
const probe = (row=action,kind='splits') => ({operation:{kind,listing:{securityId:'s',listingId:'listing',mic:'XETR',currency:'EUR',providerTicker:'SYM',isin:'ISIN1'},from:'2025-04-01',to:'2025-06-01'},normalizedSha256:h,rawHashes:[h],sourceHashesVerified:true,result:{ok:true,complete:true,scopeComplete:true,data:[{raw:row}]}});
const evaluate = (overrides={}) => evaluateLiveActions({catalog,cases:[base],results:[probe()],metadataBySecurity:{s:[proof]},conventionEvidence:[convention],asOf:'2026-10-13',...overrides});
test('split matched to exact ex-session explains ratio but never certifies basis or creates bars',()=>{
 const r=evaluate(); assert.equal(r.cases[0].status,'EXPLAINED_SPLIT');assert.equal(r.rows[0].corporateActionsCertification,'PARTIAL');
 for(const k of ['adjustmentsApplied','syntheticBars','quarantineReleased','missingSessionsExplained']) assert.equal(r[k],0);
 assert.equal(r.cases[0].explanationSupportsAdjustment,false);assert.equal(r.rows[0].eventHistoryComplete,false);
});
test('reverse split and explicitly documented inverse convention have correct direction',()=>{
 let r=evaluate({cases:[{...base,beforeClose:3,afterClose:30}],results:[probe({...action,split_factor:.1})]});assert.equal(r.cases[0].status,'EXPLAINED_REVERSE_SPLIT');
 r=evaluate({cases:[{...base,beforeClose:3,afterClose:30}],results:[probe({...action,split_factor:10})],conventionEvidence:[{...convention,splitFactorConvention:'OLD_SHARES_PER_NEW_SHARE'}]}); assert.equal(r.cases[0].status,'EXPLAINED_REVERSE_SPLIT');
});
test('ambiguous provider splitFactor is never guessed from price ratio',()=>{
 const r=evaluate({conventionEvidence:[]});assert.equal(r.cases[0].status,'UNEXPLAINED');assert.ok(r.cases[0].observedEvents[0].reasonCodes.includes('SPLIT_FACTOR_CONVENTION_UNVERIFIED'));
});
test('explicit new/old counts and explicit ex_date can explain without guessed ratio string',()=>{
 const r=evaluate({conventionEvidence:[],results:[probe({...action,date:undefined,ex_date:'2025-05-02',new_shares:3,old_shares:1})]});assert.equal(r.cases[0].status,'EXPLAINED_SPLIT');
});
test('ordinary versus explicit special dividend and currency/quote units remain distinct',()=>{
 const div={symbol:'SYM',exchange:'XETR',ex_date:'2025-05-02',dividend:60,currency:'EUR'};
 let r=evaluate({results:[probe(div,'dividends')]});assert.equal(r.cases[0].status,'EXPLAINED_DIVIDEND');
 r=evaluate({results:[probe({...div,type:'SPECIAL_DIVIDEND'},'dividends')]});assert.equal(r.cases[0].status,'EXPLAINED_SPECIAL_DIVIDEND');
 for(const bad of [{...div,currency:'USD'},{...div,currency:undefined},{...div,dividend:'60'},{...div,dividend:100}])assert.equal(evaluate({results:[probe(bad,'dividends')]}).cases[0].status,'UNEXPLAINED');
 assert.equal(evaluate({results:[probe(div,'dividends')],conventionEvidence:[{...convention,dividendAmountUnit:'GBp'}]}).cases[0].status,'UNEXPLAINED');
});
test('empty/error/incomplete/unhashed endpoints never establish absence or unsupported',()=>{
 for(const mutate of [p=>({...p,result:{...p.result,data:[]}}),p=>({...p,result:{...p.result,ok:false,status:504}}),p=>({...p,result:{...p.result,complete:false}}),p=>({...p,result:{...p.result,scopeComplete:false}}),p=>({...p,sourceHashesVerified:false}),p=>({...p,rawHashes:[]})]){
  const r=evaluate({results:[mutate(probe())]});assert.equal(r.cases[0].status,'UNEXPLAINED');assert.equal(r.rows[0].absenceEstablished,false);assert.equal(r.rows[0].corporateActionsCertification,'UNKNOWN');
 }
});
test('wrong symbol, MIC, ISIN, request binding, or current-only metadata blocks explanation',()=>{
 for(const row of [{...action,symbol:'OTHER'},{...action,exchange:'XPAR'},{...action,isin:'ISIN2'}])assert.equal(evaluate({results:[probe(row)]}).cases[0].status,'UNEXPLAINED');
 const p=probe();p.operation.listing.mic='XPAR';assert.equal(evaluate({results:[p]}).cases[0].status,'UNEXPLAINED');
 for(const bad of [{...proof,historicalListingVerified:false},{...proof,sourceSha256:'bad'},{...proof,isin:'OTHER'},{...proof,to:'2024-12-31'}])assert.equal(evaluate({metadataBySecurity:{s:[bad]}}).cases[0].status,'UNEXPLAINED');
});
test('missing venue remains unresolved unless exact historically-bound endpoint venue proof exists',()=>{
 const p=probe({...action,exchange:undefined});assert.equal(evaluate({results:[p]}).cases[0].status,'UNEXPLAINED');
 assert.equal(evaluate({results:[p],metadataBySecurity:{s:[{...proof,eventEndpointVenueBindingVerified:true}]}}).cases[0].status,'EXPLAINED_SPLIT');
});
test('no missing session is filled or explained by a split and multiple-year gaps cannot be causally assigned',()=>{
 for(const c of [{...base,missingSessions:1},{...base,calendarVerified:false},{...base,priorSessionDate:'2025-04-30'},{...base,from:'2020-01-01'}]){
  const r=evaluate({cases:[c]});assert.equal(r.cases[0].status,'UNEXPLAINED');assert.equal(r.missingSessionsExplained,0);assert.equal(r.syntheticBars,0);
 }
});
test('E&Z August action never explains May break or gets its effective date shifted',()=>{
 const official={securityId:'s',listingId:'listing',resolutionDate:'2025-06-18',implementationCompletedDate:'2025-08-15'};
 const r=evaluate({results:[probe({...action,date:'2025-08-13'})],officialActions:[official]});assert.equal(r.cases[0].status,'UNEXPLAINED');assert.equal(r.cases[0].observedEvents[0].date,'2025-08-13');assert.ok(r.cases[0].reasonCodes.includes('OFFICIAL_LATER_ACTION_DOES_NOT_EXPLAIN_THIS_BREAK'));
 // A distinct independently aligned earlier action is not vetoed merely because another action occurs later.
 assert.equal(evaluate({officialActions:[official]}).cases[0].status,'EXPLAINED_SPLIT');
});
test('factor mismatch and duplicate conflicting action block, identical overlap deduplicates',()=>{
 assert.equal(evaluate({results:[probe({...action,split_factor:2})]}).cases[0].status,'UNEXPLAINED');
 assert.equal(evaluate({results:[probe(),probe({...action,split_factor:3.02})]}).cases[0].status,'UNEXPLAINED');
 assert.equal(evaluate({results:[probe(),probe()]}).cases[0].status,'EXPLAINED_SPLIT');
});
test('invalid dates, numeric strings, outside-universe/duplicate cases fail closed',()=>{
 for(const date of ['2025-02-30','2025-99-99','not-a-date'])assert.equal(evaluate({results:[probe({...action,date})]}).cases[0].status,'UNEXPLAINED');
 assert.equal(evaluate({results:[probe({...action,split_factor:'3'})]}).cases[0].status,'UNEXPLAINED');
 assert.throws(()=>evaluate({cases:[{...base,securityId:'outside'}]}),/OUTSIDE_CANONICAL/);
 assert.throws(()=>evaluate({cases:[base,base]}),/DUPLICATE/);assert.throws(()=>evaluate({tolerance:.1}),/FIVE_PERCENT/);
});
test('all449 receive status, inputs remain unchanged, embedded value matches are not basis certificates',()=>{
 const all={securities:[sec,...Array.from({length:448},(_,i)=>({...sec,securityId:`s${i}`,primaryListingId:`l${i}`,listings:[{...sec.listings[0],listingId:`l${i}`}]}))]};
 const input={catalog:all,cases:[base],results:[probe()],metadataBySecurity:{s:[proof]},conventionEvidence:[convention],embeddedFactors:[{securityId:'s',date:'2025-05-02',providerFactor:3,sourceNormalizedSha256:h}],embeddedDividends:[{securityId:'s',date:'2024-01-01',dividend:2,sourceNormalizedSha256:h}],asOf:'2026-10-13'};const original=JSON.stringify(input);const r=evaluateLiveActions(input);assert.equal(r.rows.length,449);assert.equal(JSON.stringify(input),original);assert.equal(r.rows[0].embeddedComparisons[0].status,'VALUE_MATCH_NOT_CONVENTION_CERTIFICATION');assert.equal(r.rows[0].embeddedComparisons[1].status,'ENDPOINT_NOT_CORROBORATED');assert.equal(r.rows[1].status,'NO_STRONG_BREAK_IN_CASE_LEDGER');assert.equal(r.rows[1].corporateActionsCertification,'UNKNOWN');
});

test('case price currency and quote units must themselves be verified before attribution',()=>{
 for(const c of [{...base,currency:'USD'},{...base,quoteUnit:'GBp'},{...base,priceCurrencyVerified:false},{...base,listingId:'OTHER'},{...base,mic:'XPAR'}])assert.equal(evaluate({cases:[c]}).cases[0].status,'UNEXPLAINED');
});

test('grouped action window keeps exact same HTTP proof for each covered case and rejects unrelated/outside cases',()=>{
 const first={...base,discontinuityId:'first'};const second={...base,discontinuityId:'second',from:'2025-05-02',to:'2025-05-05',priorSessionDate:'2025-05-02',beforeClose:30,afterClose:10};
 const p=probe();p.operation={...p.operation,discontinuityId:'first',caseIds:['first','second'],windowId:'shared-window'};p.result.data.push({raw:{...action,date:'2025-05-05'}});
 const r=evaluate({cases:[first,second],results:[p]});assert.equal(r.explained,2);assert.deepEqual(r.cases[0].probeEvidence[0].source,r.cases[1].probeEvidence[0].source);assert.deepEqual(r.cases[1].probeEvidence[0].operation,p.operation);
 assert.equal(evaluate({cases:[{...second,discontinuityId:'unrelated'}],results:[p]}).cases[0].probeEvidence.length,0);
 p.operation.to='2025-05-02';assert.equal(evaluate({cases:[second],results:[p]}).cases[0].probeEvidence.length,0);
});
test('US scope and merely asserted hash strings cannot certify identity/conventions',()=>{
 assert.throws(()=>evaluate({catalog:{securities:[{...sec,listings:[{...sec.listings[0],mic:'XNYS'}]}]}}),/US_SCOPE_REFUSED/);
 assert.equal(evaluate({metadataBySecurity:{s:[{...proof,sourceHashesVerified:false}]}}).cases[0].status,'UNEXPLAINED');
 assert.equal(evaluate({conventionEvidence:[{...convention,independentlyVerified:false}]}).cases[0].status,'UNEXPLAINED');
});
import { loadVerifiedLiveActionResults } from '../europe-live-actions-review.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
function archiveFixture({row=action,total=1,rows=[row],ok=true,complete=true,status=200,mutateEntry=x=>x}={}) {
 const root=mkdtempSync(join(tmpdir(),'ca-live-proof-'));for(const d of ['raw','normalized'])mkdirSync(join(root,d));
 const digest=x=>createHash('sha256').update(x).digest('hex');
 const write=(path,data)=>{const raw=Buffer.from(JSON.stringify(data)+'\n'),zip=gzipSync(raw);writeFileSync(join(root,path),zip);return{path,sha256:digest(raw),compressedSha256:digest(zip)}};
 const body={pagination:{offset:0,limit:1000,count:rows.length,total},data:rows};
 const raw=write('raw/000001.json.gz',body);const operation={...probe().operation,discontinuityId:'first',caseIds:['first','second'],windowId:'w'};
 const entry=mutateEntry({ordinal:0,operation,responseIds:['000001'],result:{ok,complete,scopeComplete:true,retrievedAt:'2026-10-13T00:00:00Z',data:rows.map(raw=>({raw,normalized:{providerTicker:'FORGED',splitFactor:100}}))}});
 const normalized=write('normalized/000000.json.gz',entry);
 const summary={results:[{ordinal:0,operation,responseIds:['000001'],resultPath:normalized.path,normalizedSha256:normalized.sha256,normalizedCompressedSha256:normalized.compressedSha256}]};
 const rawManifest=[{id:'000001',...raw,endpoint:'/splits',params:{symbols:'SYM',date_from:operation.from,date_to:operation.to,sort:'ASC',limit:1000,offset:0},status}];
 return{root,summary,rawManifest,clean:()=>rmSync(root,{recursive:true,force:true})};
}
test('gzip action loader verifies raw + compressed hashes and regenerates normalized action fields',()=>{
 const a=archiveFixture();try{const r=loadVerifiedLiveActionResults(a);assert.equal(r[0].sourceHashesVerified,true);assert.equal(r[0].result.scopeComplete,true);assert.equal(r[0].result.data[0].normalized.providerTicker,'SYM');assert.equal(r[0].result.data[0].normalized.splitFactor,3);assert.deepEqual(r[0].operation,a.summary.results[0].operation);assert.equal(r[0].sourceReplay.normalizedRegeneratedFromRaw,true);}finally{a.clean();}
});
test('empty HTTP pagination proves only query completeness, not action absence or support',()=>{
 const a=archiveFixture({rows:[],total:0});try{const results=loadVerifiedLiveActionResults(a);assert.equal(results[0].result.scopeComplete,true);const r=evaluate({cases:[{...base,discontinuityId:'first'}],results});assert.equal(r.cases[0].status,'UNEXPLAINED');assert.equal(r.rows[0].absenceEstablished,false);}finally{a.clean();}
});
test('caller complete true cannot hide final-page truncation, ordering or window breach',()=>{
 for(const config of [{total:2},{rows:[{...action,date:'2025-05-05'},action],total:2},{rows:[{...action,date:'2027-01-01'}],total:1}]){
  const a=archiveFixture(config);try{const r=loadVerifiedLiveActionResults(a);assert.equal(r[0].result.scopeComplete,false);assert.equal(r[0].sourceReplay.complete,false);assert.equal(evaluate({cases:[{...base,discontinuityId:'first'}],results:r}).cases[0].status,'UNEXPLAINED');}finally{a.clean();}
 }
});
test('forged normalized raw or request scope cannot enter the proof boundary',()=>{
 const a=archiveFixture({mutateEntry:e=>({...e,result:{...e.result,data:[{raw:{...action,split_factor:99}}]}})});try{assert.throws(()=>loadVerifiedLiveActionResults(a),/NORMALIZED_RAW_LOSS/);}finally{a.clean();}
 const b=archiveFixture();try{b.rawManifest[0].params.symbols='OTHER';assert.throws(()=>loadVerifiedLiveActionResults(b),/REQUEST_SCOPE/);}finally{b.clean();}
});
test('compressed hash mismatch and path traversal fail before action evaluation',()=>{
 const a=archiveFixture();try{writeFileSync(join(a.root,a.rawManifest[0].path),gzipSync('tampered'));assert.throws(()=>loadVerifiedLiveActionResults(a),/COMPRESSED_HASH/);}finally{a.clean();}
 const b=archiveFixture();try{b.summary.results[0].resultPath='../raw/000001.json.gz';assert.throws(()=>loadVerifiedLiveActionResults(b),/PATH_REFUSED/);}finally{b.clean();}
});
test('failed action HTTP is retained as private error evidence and cannot be completeness certified',()=>{
 const a=archiveFixture({ok:false,complete:false,status:504});try{const r=loadVerifiedLiveActionResults(a);assert.equal(r[0].sourceHashesVerified,true);assert.equal(r[0].result.scopeComplete,false);assert.ok(r[0].sourceReplay.reasonCodes.includes('HTTP_ACTION_RESPONSE_NOT_SUCCESS'));assert.equal(evaluate({cases:[{...base,discontinuityId:'first'}],results:r}).cases[0].status,'UNEXPLAINED');}finally{a.clean();}
});
