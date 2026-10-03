import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,existsSync,symlinkSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';import {gzipSync,gunzipSync} from 'node:zlib';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {captureCurrentBaseline} from '../../scripts/market/tiingo2-current-baseline.mjs';
import {runShadowQa} from '../../scripts/market/tiingo2-product-shadow-qa.mjs';
function fixture(){const base=mkdtempSync(join(tmpdir(),'tiingo2-current-baseline-')),root=join(base,'source'),out=join(root,'.market-cache/qa/current-baseline');mkdirSync(root);
 const save=(path,data)=>{const p=join(root,path);mkdirSync(dirname(p),{recursive:true});const raw=Buffer.from(JSON.stringify(data));writeFileSync(p,path.endsWith('.gz')?gzipSync(raw):raw);};
 const instrument={instrumentId:'vu_1234',symbol:'AA',issuerId:'iss_cik_0000000001',masterMemberId:'ref_AA',legacyIds:['ref_AA'],generation:0,cik:'0000000001',shareClass:null,active:true,productEligibility:'ELIGIBLE'};
 const docs={'quant/data/market/scale/universe-FULL_UNIVERSE.json':{securities:[{ticker:'AA',securityId:'ref_AA',privatePrice:'RAW_PROVIDER_SENTINEL'}]},'quant/data/market/security-master/eligibility.json':{decisions:[{ticker:'AA',securityId:'ref_AA',product_eligibility:'ELIGIBLE',instrument_type:'EQUITY_COMMON'}]},'quant/data/market/factors/factors-FULL_UNIVERSE.json':{securities:[{ticker:'AA',securityId:'ref_AA',values:{privatePrice:'RAW_PROVIDER_SENTINEL'}}]},'quant/data/universe/market-capability.json':{members:[{m:'ref_AA',s:'AA',i:'vu_1234'}]},'quant/data/universe/instruments/AA.json':{instruments:[instrument]},'quant/data/universe/search/manifest.json':{sym:[{shard:'AA',count:1}],name:[{shard:'AA',count:1}]},'quant/data/universe/search/sym/AA.json':{entries:[{i:'vu_1234',s:'AA',n:'Issuer'}]},'quant/data/universe/search/name/AA.json':{entries:[{i:'vu_1234',s:'AA',n:'Issuer'}]},'quant/data/product/factor-evidence-v1/screening.json.gz':{rows:{AA:{privatePrice:'RAW_PROVIDER_SENTINEL'}}},'discover/logos/index.json':{files:{AA:'files/AA.png'},wide:{},dark:[]},'discover/data/rows/US_REAL/rank.json':{sort:'LEADERSHIP',direction:'desc',cards:[{symbol:'AA',price:'RAW_PROVIDER_SENTINEL'}]},'discover/data/home/US_REAL.json':{surfaces:[{id:'test',cards:[{symbol:'AA'}]}]},'screener/data/universe-US_REAL.json':{columns:['s'],cols:{s:['AA'],privatePrice:['RAW_PROVIDER_SENTINEL']}},'quant/data/market/discover-series/ref_AA.json':{securityId:'ref_AA',bars:[]},'scripts/vu2/resource-budget.mjs':{unchangedBudget:100}};
 for(const [p,d]of Object.entries(docs))save(p,d);
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','canonical baseline');
 return {base,root,out,save,instrument,git,cleanup:()=>rmSync(base,{recursive:true,force:true})};}
const load=path=>JSON.parse(path.endsWith('.gz')?gunzipSync(readFileSync(path)):readFileSync(path));

test('current baseline captures actual current identities and passes unchanged shadow QA without provider values',async()=>{const f=fixture();try{
 const report=await captureCurrentBaseline(f);assert.equal(report.counts.instruments,1);assert.equal(report.sourceUnchangedAfterCapture,true);assert.equal(report.rawProviderBodiesCopied,false);
 const identities=load(join(f.out,'baseline-identities.json.gz'));assert.deepEqual(identities.instruments,[f.instrument]);assert.deepEqual(identities.raw,[{ticker:'AA',securityId:'ref_AA'}]);
 for(const name of Object.keys(report.artifacts)){const data=load(join(f.out,name));assert.equal(JSON.stringify(data).includes('RAW_PROVIDER_SENTINEL'),false,name);}
 const shadow=join(f.base,'shadow');cpSync(f.root,shadow,{recursive:true,filter:p=>!p.includes('/.git')&&!p.includes('/.market-cache')});const readiness=join(f.base,'readiness.json');writeFileSync(readiness,JSON.stringify({runId:'fixture',rows:[{ticker:'IPO',securityId:'ref_IPO',instrumentId:'vu_5678'}]}));
 const qa=runShadowQa({root:f.root,shadow,readiness,baseline:f.out,out:join(f.base,'report.json')});assert.deepEqual(qa.findings,[]);
 assert.deepEqual(await captureCurrentBaseline(f),report,'same source capture is byte-deterministic and idempotent');
}finally{f.cleanup();}});

test('later legitimate publication establishes a new current baseline and refuses silently replacing the prior capture',async()=>{const f=fixture();try{
 await captureCurrentBaseline(f);const updated={...f.instrument,active:true,productEligibility:'ELIGIBLE',legacyIds:['ref_AA','previous_AA']};
 f.save('quant/data/universe/instruments/AA.json',{instruments:[updated,{...f.instrument,instrumentId:'vu_5678',symbol:'IPO',masterMemberId:'ref_IPO'}]});f.git('add','quant');f.git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','reviewed later publication');
 await assert.rejects(captureCurrentBaseline(f),/BASELINE_ALREADY_CAPTURED_DIFFERENT_SOURCE/);
 const next=join(f.root,'.market-cache/qa/next-baseline'),report=await captureCurrentBaseline({...f,out:next});assert.equal(report.counts.instruments,2);assert.deepEqual(load(join(next,'baseline-identities.json.gz')).instruments[0],updated);
 assert.notEqual(report.sourceCommit,load(join(f.out,'current-baseline.json')).sourceCommit);
}finally{f.cleanup();}});

test('missing stored Screener uses existing read-only producer contract and catches source mutation during capture',async()=>{const f=fixture();try{
 unlinkSync(join(f.root,'screener/data/universe-US_REAL.json'));let calls=0;
 const buildScreener=async({root})=>{assert.equal(root,f.root);calls++;return {generatedAt:'different-runtime-stamp-'+calls,cols:{s:['AA']},columns:['s']};};
 await captureCurrentBaseline({...f,buildScreener});assert.equal(calls,1);assert.equal(load(join(f.out,'generated-screener-baseline.json')).scope,'EXISTING_READ_ONLY_CANONICAL_SCREENER_BUILDER');assert.equal(existsSync(join(f.root,'screener/data/universe-US_REAL.json')),false);
 const bytes=readFileSync(join(f.out,'current-baseline.json'));await captureCurrentBaseline({...f,buildScreener});assert.equal(calls,2);assert.ok(readFileSync(join(f.out,'current-baseline.json')).equals(bytes),'changing runtime generatedAt cannot change the captured canonical baseline');
 await assert.rejects(captureCurrentBaseline({...f,out:join(f.root,'.market-cache/changed'),buildScreener:async()=>{f.save('quant/data/universe/instruments/AA.json',{instruments:[]});return {cols:{s:['AA']}};}}),/CURRENT_SOURCE_CHANGED_DURING_BASELINE_CAPTURE/);
}finally{f.cleanup();}});

test('private-only capture rejects public output, linked source and dangling output before writing',async()=>{const f=fixture();try{
 await assert.rejects(captureCurrentBaseline({...f,out:join(f.root,'docs/baseline')}),/PRIVATE_CURRENT_BASELINE_REQUIRED/);assert.equal(existsSync(join(f.root,'docs')),false);
 const source=join(f.root,'quant/data/universe/instruments/AA.json');unlinkSync(source);symlinkSync(join(f.base,'absent-source'),source);
 await assert.rejects(captureCurrentBaseline(f),/BASELINE_LINK_UNSAFE/);assert.equal(existsSync(f.out),false);
 unlinkSync(source);f.save('quant/data/universe/instruments/AA.json',{instruments:[f.instrument]});mkdirSync(dirname(f.out),{recursive:true});symlinkSync(join(f.base,'absent-target'),f.out);
 await assert.rejects(captureCurrentBaseline(f),/BASELINE_LINK_UNSAFE/);assert.equal(existsSync(join(f.base,'absent-target')),false);
}finally{f.cleanup();}});

test('duplicate current identities and stale Search descriptor counts cannot become a trusted baseline',async()=>{const f=fixture();try{
 f.save('quant/data/universe/instruments/BB.json',{instruments:[f.instrument]});await assert.rejects(captureCurrentBaseline(f),/DUPLICATE_CURRENT_INSTRUMENT_ID/);unlinkSync(join(f.root,'quant/data/universe/instruments/BB.json'));
 f.save('quant/data/universe/search/manifest.json',{sym:[{shard:'AA',count:2}],name:[{shard:'AA',count:1}]});await assert.rejects(captureCurrentBaseline(f),/CURRENT_SEARCH_SHARD_COUNT_MISMATCH/);assert.equal(existsSync(f.out),false);
}finally{f.cleanup();}});

test('duplicate CLI flags cannot silently change the requested source or private capture destination',()=>{const f=fixture();try{
 const cli=fileURLToPath(new URL('../../scripts/market/tiingo2-current-baseline.mjs',import.meta.url));
 for(const flag of ['--root','--out']){const args=['--root',f.root,'--out',f.out,flag,flag==='--root'?f.root:f.out];const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/INVALID_BASELINE_ARGUMENT/);assert.equal(existsSync(f.out),false);}
}finally{f.cleanup();}});
