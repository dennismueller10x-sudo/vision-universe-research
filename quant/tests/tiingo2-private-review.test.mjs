import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {resolvePrivateReview} from '../../scripts/market/tiingo2-run-productization.mjs';
import {assessEvidence} from '../../scripts/market/tiingo2-evidence.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),today='2026-10-02';
const save=(p,v)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(v));};
function fixture(run){
 const root=mkdtempSync(join(tmpdir(),'tiingo2-private-review-')),sourceRun=join(root,'accepted'),sourceCache=join(root,'cache'),workDir=join(root,'work');
 const bars=['2026-09-01','2026-09-02','2026-10-01'].map(date=>({date,open:10,high:10,low:10,close:10,volume:100,adjOpen:10,adjHigh:10,adjLow:10,adjClose:10,adjVolume:100,splitFactor:1,divCash:0}));
 const metadata={ticker:'IPO',name:'IPO Corporation',startDate:'2026-09-01',exchangeCode:'NASDAQ',currency:'USD'},summary=assessEvidence(bars,{ticker:'IPO',today,currency:'USD',metadata});
 const row={ticker:'IPO',securityId:'ref_IPO',companyName:'IPO Corporation',decision:'MANUAL_REVIEW',publicationReady:false,reasonCodes:['IDENTITY_UNRESOLVED'],policy:{instrumentType:'EQUITY_COMMON'},identity:{resolved:false,state:'NEW_SECURITY',symbolCollision:false,staleAlias:false},price:summary.price,sec:{},marketFactors:{},source:summary.source};
 save(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'),{securities:[]});
 save(join(sourceRun,'tiingo2_fresh_discovery.json'),{records:[{ticker:'IPO',exchange:'NASDAQ',startDate:metadata.startDate,assetType:'Stock',active:true,endDate:'2026-10-01'}]});
 save(join(sourceRun,'tiingo2_staged_candidates.json'),{rows:[row]});save(join(sourceRun,'tiingo2_consumer_policy_report.json'),{rows:[row]});save(join(sourceRun,'tiingo2_publication_preview.json'),{ADDED:[],REMOVED:[],counts:{before:0,added:0,removed:0,after:0}});save(join(sourceRun,'canonical/manifest.json'),{schemaVersion:'fixture'});
 const key=hash('fixture');save(join(sourceCache,'evidence',key+'.json'),{key,metadata,rows:bars,summary});
 mkdirSync(join(sourceCache,'directories'),{recursive:true});writeFileSync(join(sourceCache,'directories',today+'-nasdaqlisted.txt'),'Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nIPO|IPO Corporation - Common Stock|Q|N|N|100|N|N\n');
 const options={root,sourceRun,sourceCache,workDir,asOf:today};
 try{run({...options,row,metadata,bars,summary,key});}finally{rmSync(root,{recursive:true,force:true});}
}
test('private review replays exact audited cache and emits listing/hash-bound additional publication proof',()=>fixture(options=>{
 const result=resolvePrivateReview(options);assert.equal(result.additional.length,1);
 const proofFile=join(result.sourceRun,'review-resolution-proof.json'),proof=JSON.parse(readFileSync(proofFile));
 assert.equal(proof.sourceManifestSha256,hash(readFileSync(join(options.sourceRun,'canonical/manifest.json'))));assert.equal(proof.additional[0].listingKey,'IPO|NASDAQ|2026-09-01');assert.equal(proof.additional[0].providerResponseSha256,options.summary.source.responseSha256);
 const preview=JSON.parse(readFileSync(join(result.sourceRun,'tiingo2_publication_preview.json')));assert.equal(preview.reviewResolutionProofSha256,hash(readFileSync(proofFile)));assert.deepEqual(preview.counts,{before:0,added:1,removed:0,after:1});assert.equal(result.publicReport.rows[0].privatePriceReplay.state,'READY');
}));
test('conflicting same-response provider metadata cannot bypass resolver duplicate guard',()=>fixture(options=>{
 const key=hash('conflicting');save(join(options.sourceCache,'evidence',key+'.json'),{key,metadata:{...options.metadata,name:'Other Mining Corporation'},rows:options.bars,summary:options.summary});
 const result=resolvePrivateReview(options);assert.equal(result.additional.length,0);assert.ok(result.publicReport.rows[0].reasonCodes.includes('CONFLICTING_DUPLICATE_REVIEW_INPUT'));
}));
test('a modified or different cache response cannot reuse an optimistic prior price summary',()=>fixture(options=>{
 const bars=options.bars.map(b=>({...b,open:12,high:12,low:12,close:12,adjOpen:12,adjHigh:12,adjLow:12,adjClose:12}));const summary=assessEvidence(bars,{ticker:'IPO',today,currency:'USD',metadata:options.metadata});save(join(options.sourceCache,'evidence',options.key+'.json'),{key:options.key,metadata:options.metadata,rows:bars,summary});
 const result=resolvePrivateReview(options);assert.equal(result.additional.length,0);assert.equal(result.publicReport.rows[0].privatePriceReplay.responseMatchesAudit,false);assert.ok(result.publicReport.rows[0].reasonCodes.includes('AUDITED_PRIVATE_PRICE_RESPONSE_REQUIRED'));
}));
test('private cache filename/key mismatch aborts review before any approved extension',()=>fixture(options=>{
 save(join(options.sourceCache,'evidence',options.key+'.json'),{key:hash('wrong'),metadata:options.metadata,rows:options.bars,summary:options.summary});assert.throws(()=>resolvePrivateReview(options),/PRIVATE_EVIDENCE_CACHE_KEY_MISMATCH/);
}));
