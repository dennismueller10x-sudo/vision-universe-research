import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLiveActions } from '../europe-live-actions-review.mjs';
const h = 'a'.repeat(64), sec = { securityId:'s', isin:'ISIN1', primaryListingId:'listing', listings:[{ listingId:'listing', mic:'XETR', currency:'EUR', providerSymbol:'SYM', quoteUnit:'EUR' }] };
const catalog = {securities:[sec]};
const base = {securityId:'s',from:'2025-05-01',to:'2025-05-02',beforeClose:90,afterClose:30,calendarVerified:true,priorSessionDate:'2025-05-01',missingSessions:0,sourceNormalizedSha256:h,currency:'EUR',quoteUnit:'EUR',priceCurrencyVerified:true};
const proof = {verified:true,sourceSha256:h,securityId:'s',listingId:'listing',mic:'XETR',isin:'ISIN1',currency:'EUR',from:'2020-01-01',to:'2026-12-31',historicalListingVerified:true,providerTicker:'SYM'};
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
