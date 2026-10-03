import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {materializeFactors,refreshMaterializedFactorReadiness} from '../../scripts/market/tiingo2-factors.mjs';
import {materializeProductSurfaces} from '../../scripts/market/tiingo2-product-surfaces.mjs';
const save=(root,path,value)=>{const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value));};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'vu-factor-order-'));
 save(root,'quant/methodology/quant-v2.json',{publication:{allowed:false,reason:'EXISTING_METHODOLOGY'}});
 save(root,'quant/data/market/security-master/eligibility.json',{decisions:[{ticker:'DNA',securityId:'ref_DNA',product_eligibility:'ELIGIBLE',instrument_type:'EQUITY_COMMON'}]});
 save(root,'quant/data/universe/instruments/DN.json',{instruments:[{symbol:'DNA',instrumentId:'vu_DNA',masterMemberId:'ref_DNA',screenerEligible:true}]});
 save(root,'quant/data/universe/market-capability.json',{members:[{s:'DNA',m:'ref_DNA',t:'TECHNICAL_READY'}]});
 save(root,'quant/data/market/factors/factors-FULL_UNIVERSE.json',{securities:[]});
 save(root,'quant/data/product/technical-signals-v1/summary.json',{rows:{},counts:{}});
 const shared=`import{readFileSync,writeFileSync,mkdirSync,appendFileSync}from'node:fs';import{join,dirname}from'node:path';import{gzipSync,gunzipSync}from'node:zlib';const root=process.cwd();const read=p=>JSON.parse(readFileSync(join(root,p)));const save=(p,d)=>{mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),JSON.stringify(d));};const log=s=>appendFileSync(join(root,'events.log'),s+'\\n');`;
 const script=(path,body)=>{const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,shared+body);};
 script('scripts/market/build-market-factors.mjs',`const out=process.argv[process.argv.indexOf('--out')+1];mkdirSync(out,{recursive:true});writeFileSync(join(out,'factors-TIINGO2_SCOPE.json'),JSON.stringify({benchmark:{id:'SPY'},securities:[{ticker:'DNA',securityId:'ref_DNA',asOf:'2026-10-01',bars:1371,fieldStatus:{return12M1M:'CALCULATED'}}]}));writeFileSync(join(out,'factors-TIINGO2_SCOPE-summary.json'),JSON.stringify({coverage:{measured:1}}));log('market');`);
 script('scripts/quant/build-factor-evidence.mjs',`const q=read('fresh-quote.json');const factors=Object.fromEntries(['quality','growth','momentum','value','profitability','revisions','risk'].map(id=>[id,id==='quality'?{state:'AVAILABLE',score:q.close,components:[{id:'quote',state:'AVAILABLE'}]}:{state:'UNAVAILABLE',score:null,reason:'INPUT_NOT_MATERIALIZED'}]));const record={ticker:'DNA',securityId:'ref_DNA',asOf:q.asOf,bars:1371,marketCap:q.close*100,factors,composite:{state:'WITHHELD',reason:'QUANT_V2_NOT_ACTIVE'}};const doc={schemaVersion:'factor-evidence-product-1.0.0',methodologyVersion:'vu-factor-evidence-2.0.0',derivedFrom:'quant-v2.2.0',publication:{compositeAllowed:false,rankingAllowed:false},shard:'DN',securities:{DNA:record}};mkdirSync(join(root,'quant/data/product/factor-evidence-v1'),{recursive:true});writeFileSync(join(root,'quant/data/product/factor-evidence-v1/DN.json.gz'),gzipSync(JSON.stringify(doc)));log('factor:'+q.close);`);
 script('scripts/technical/materialize-product-intelligence.mjs',`export function materialize({outDir}){mkdirSync(outDir,{recursive:true});save('fresh-quote.json',{asOf:'2026-10-01',close:19.135});writeFileSync(join(outDir,'summary.json'),JSON.stringify({rows:{DNA:{technical:'AVAILABLE',signals:'AVAILABLE',bars:1371}},counts:{available:1}}));writeFileSync(join(outDir,'DN.json.gz'),gzipSync(JSON.stringify({instruments:{DNA:{freshClose:19.135}},unavailable:{}})));log('technical');return {counts:{available:1}};}`);
 script('scripts/discover/build-discover-data.mjs',`const q=read('fresh-quote.json');save('discover/data/stocks/US_REAL/DNA.json',{symbol:'DNA',metrics:{},rawValues:{},discoveryEligible:true});log('discover:'+q.close);`);
 script('scripts/market/build-capability-matrix.mjs',`log('matrix');`);
 script('scripts/vu2/build-product-capabilities.mjs',`save('quant/data/product/capabilities-summary-v1.json',{counts:{productUniverse:1}});log('capabilities');`);
 script('scripts/quant/build-strategy-index.mjs',`writeFileSync(join(root,'quant/data/product/strategy-index-v1.json.gz'),gzipSync(JSON.stringify({universe:1})));log('strategy');`);
 script('scripts/quant/build-pattern-match.mjs',`save('quant/data/product/pattern-match-v1/summary.json',{instruments:0,unavailable:{total:1,reasons:{SHORT:1}}});log('pattern');`);
 save(root,'fresh-quote.json',{asOf:'2026-09-10',close:1});
 return root;
}
test('deferred factor evidence refuses stale proofs; one post-technical build publishes exact fresh quote and rebinds actual readiness',async()=>{
 const root=fixture();try{
  const artifactPath=join(root,'quant/data/product/factor-evidence-v1/DN.json.gz');mkdirSync(dirname(artifactPath),{recursive:true});
  const staleBytes=gzipSync(JSON.stringify({schemaVersion:'factor-evidence-product-1.0.0',methodologyVersion:'vu-factor-evidence-2.0.0',derivedFrom:'quant-v2.2.0',publication:{compositeAllowed:false,rankingAllowed:false},shard:'DN',securities:{DNA:{ticker:'DNA',securityId:'ref_DNA',asOf:'2026-09-10',factors:{quality:{state:'AVAILABLE',score:1}},composite:{state:'WITHHELD',reason:'QUANT_V2_NOT_ACTIVE'}}}}));writeFileSync(artifactPath,staleBytes);
  const report=await materializeFactors({root,tickers:['DNA'],privateDir:join(root,'private/factors'),asOf:'2026-10-02',rebuildTaxonomy:false,deferCanonicalEvidence:true});
  assert.equal(report.canonicalEvidenceDeferred,true);assert.equal(report.counts.BLOCKED,1);assert.equal(report.rows[0].canonicalEvidence.state,'DEFERRED');assert.equal(report.rows[0].productQuantReady,false);
  assert.deepEqual(readFileSync(artifactPath),staleBytes,'deferred phase neither publishes nor rebuilds the existing stale shard');
  await materializeProductSurfaces({shadowRoot:root,tickers:['DNA'],freshPriceTickers:['DNA'],privateDir:join(root,'private/surfaces'),rebuildCanonicalFactorEvidence:true});
  const ready=refreshMaterializedFactorReadiness({root,report});const artifact=JSON.parse(gunzipSync(readFileSync(artifactPath)));
  assert.equal(artifact.securities.DNA.marketCap,19.135*100,'fresh technical close keeps its precision');assert.equal(ready.rows[0].quantStatus,'PARTIAL');assert.equal(ready.rows[0].fullQuantScoreReady,false);assert.equal(ready.rows[0].reason,undefined);assert.equal(ready.canonicalEvidenceDeferred,undefined);assert.deepEqual(ready.counts,{QUANT_FULL:0,TECHNICAL_ONLY:0,PARTIAL:1,BLOCKED:0});assert.equal(ready.rows[0].canonicalEvidence.artifactSha256,hash(readFileSync(artifactPath)));assert.equal(ready.reportSha256,hash(readFileSync(ready.reportPath)));assert.deepEqual(ready.rows[0].factorStates.quality.componentStates,[{id:'quote',state:'AVAILABLE',reason:null}]);
  const events=readFileSync(join(root,'events.log'),'utf8').trim().split(/\r?\n/);assert.deepEqual(events.slice(0,4),['market','technical','factor:19.135','discover:19.135']);assert.equal(events.filter(e=>e.startsWith('factor:')).length,1);
  artifact.securities.DNA.asOf='2026-09-10';writeFileSync(artifactPath,gzipSync(JSON.stringify(artifact)));const stale=refreshMaterializedFactorReadiness({root,report:ready});assert.equal(stale.counts.BLOCKED,1);assert.equal(stale.rows[0].canonicalEvidence.verified,false);assert.equal(stale.rows[0].reason,'CANONICAL_FACTOR_BINDING_MISMATCH');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('default factor and surface APIs retain existing producer behavior without an extra canonical evidence pass',async()=>{
 const root=fixture();try{
  save(root,'fresh-quote.json',{asOf:'2026-10-01',close:1});
  const report=await materializeFactors({root,tickers:['DNA'],privateDir:join(root,'private/factors'),asOf:'2026-10-02',rebuildTaxonomy:false});assert.equal(report.rows[0].canonicalEvidence.verified,true);
  await materializeProductSurfaces({shadowRoot:root,tickers:['DNA'],freshPriceTickers:['DNA'],privateDir:join(root,'private/surfaces')});
  assert.equal(readFileSync(join(root,'events.log'),'utf8').trim().split(/\r?\n/).filter(e=>e.startsWith('factor:')).length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
