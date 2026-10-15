import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {verifyReferenceParsed} from '../research/calibration/run-calibration-v2.mjs';
import {verifyCalibrationFreeze as verifyV2,POST_CALIBRATION_METHOD_IDS as nextIds} from '../research/calibration/run-post-calibration-v2.mjs';
import {verifyCalibrationFreeze as verifyV1,POST_CALIBRATION_METHOD_IDS as oldIds} from '../research/calibration/run-post-calibration.mjs';
import {assertFreezeV2} from '../research/certification/freeze-v2.mjs';
import * as oldRunner from '../research/calibration/runner-certified.mjs';
import * as nextRunner from '../research/calibration/runner-certified-v2.mjs';
import * as oldPortfolio from '../research/calibration/portfolio-calibration.mjs';
import * as nextPortfolio from '../research/calibration/portfolio-calibration-v2.mjs';
import {getReferenceMethod} from '../research/calibration/reference-engines.mjs';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../..'),dir=path.join(root,'scripts/supertrader/research/calibration');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const initialPath='scripts/supertrader/research/calibration/BACKTEST-CALIBRATION-FREEZE.json',initialBytes=fs.readFileSync(path.join(root,initialPath)),initial=JSON.parse(initialBytes),protocol=JSON.parse(fs.readFileSync(path.join(root,'scripts/supertrader/research/tournament/protocol.json')));

test('runner V2 clone changes only common accounting import and correction diagnostic output',()=>{
 const expected=read('runner-certified.mjs').replace("from '../certification/execution-audit-accounting.mjs'","from './accounting-budget-v2.mjs'").replace('endingPositions:[...book.positions.values()]};','endingPositions:[...book.positions.values()],cashPrecisionCorrections:book.cashPrecisionCorrections??[]};');
 assert.equal(read('runner-certified-v2.mjs'),expected);
});
test('reference-portfolio V2 clone uses the same common accounting and otherwise retains the complete construction/clock/cost math',()=>{
 const expected=read('portfolio-calibration.mjs').replace("from '../certification/execution-audit-accounting.mjs'","from './accounting-budget-v2.mjs'").replace("from './runner-certified.mjs'","from './runner-certified-v2.mjs'").replace('rejections:book.rejections,reconciliation};','rejections:book.rejections,reconciliation,cashPrecisionCorrections:book.cashPrecisionCorrections??[]};');
 assert.equal(read('portfolio-calibration-v2.mjs'),expected);
});
test('postcal orchestration V2 clone changes only runner version/receipt names and additional V2 component bindings',()=>{
 const bindings=" 'scripts/supertrader/research/calibration/accounting-budget-v2.mjs',\n 'scripts/supertrader/research/calibration/runner-certified-v2.mjs',\n 'scripts/supertrader/research/calibration/portfolio-calibration-v2.mjs',\n 'scripts/supertrader/research/calibration/run-calibration-v2.mjs',\n 'scripts/supertrader/research/calibration/run-post-calibration-v2.mjs',\n 'scripts/supertrader/tests/calibration-budget-v2.test.mjs',\n 'scripts/supertrader/tests/calibration-infra-versioning-v2.test.mjs',\n";
 const expected=read('run-post-calibration.mjs').replace("from './runner-certified.mjs'","from './runner-certified-v2.mjs'").replace('POSITIVE_FINITE_ENTRY_OPEN_GUARD_ALL_SIX_FROZEN_METHODS_V1','FINITE_BINARY64_BUDGET_AND_ENTRY_OPEN_GUARDS_ALL_SIX_FROZEN_METHODS_V2').replace('const REQUIRED_FILES=[\n','const REQUIRED_FILES=[\n'+bindings);
 assert.equal(read('run-post-calibration-v2.mjs'),expected);assert.deepEqual(nextIds,oldIds);
});
test('calibration launcher V2 retains all mathematical/source formulas outside its strict parent-reuse gate',()=>{
 const before=read('run-calibration.mjs'),after=read('run-calibration-v2.mjs'),gate=/export function verifyReferenceParsed\([\s\S]*?(?=export function monthlyEffect)/;
 assert.equal(before.match(gate)?.length,1);assert.equal(after.match(gate)?.length,1);
 const expected=before.replace("from './portfolio-calibration.mjs'","from './portfolio-calibration-v2.mjs'").replace("from './run-post-calibration.mjs'","from './run-post-calibration-v2.mjs'").replace(gate,after.match(gate)[0]);assert.equal(after,expected);
});

function reuseFixture(){const parent=initial.referenceArithmetic,parsed={schema:'SYNTHETIC_METADATA_ONLY_NO_REFERENCE_RETURN_VALUES',freezeFileSha256:sha(initialBytes),codeSha256:parent.codeSha256,sourcePlanSha256:parent.sourcePlanSha256,referenceWindow:parent.window,referenceInputSha256s:Object.fromEntries(parent.inputReceipts.map(r=>[r.id,r.sha256]))},bytes=Buffer.from(JSON.stringify(parsed));
 const freeze={strategyDefinitionsChanged:false,postResultTuningAllowed:false,parentFreezeSourceReceipt:{path:initialPath,sha256:sha(initialBytes)},referenceArithmetic:{...structuredClone(parent),reusedParsedFromFreezeSha256:sha(initialBytes),reusedParsedArtifactSha256:sha(bytes)}};
 return {parsed,bytes,expected:sha(bytes),freeze};}
const verify=f=>verifyReferenceParsed(f.parsed,f.bytes,f.expected,Buffer.from(JSON.stringify(f.freeze)),f.freeze);
test('old reference receipts fail closed after the scanner-safe parser bytes change',()=>{assert.throws(()=>verify(reuseFixture()),/REFERENCE_PARSER_PHYSICAL_AND_FREEZE_BINDING_REQUIRED/);
 for(const alter of [f=>delete f.freeze.parentFreezeSourceReceipt,f=>f.freeze.parentFreezeSourceReceipt.path='../different-parent.json',f=>f.freeze.parentFreezeSourceReceipt.sha256='0'.repeat(64),f=>f.freeze.referenceArithmetic.codeSha256='0'.repeat(64),f=>f.freeze.referenceArithmetic.sourcePlanSha256='0'.repeat(64),f=>f.freeze.referenceArithmetic.inputReceipts[0].sha256='0'.repeat(64),f=>f.freeze.referenceArithmetic.window.to='2026-09',f=>f.freeze.referenceArithmetic.noPostResultTuning=false,f=>f.freeze.postResultTuningAllowed=true]){const fixture=reuseFixture();alter(fixture);assert.throws(()=>verify(fixture));}
});
test('reuse cannot forge parent digest, parsed fields, parsed window, source membership or physical artifact SHA independently',()=>{
 for(const alter of [f=>f.freeze.referenceArithmetic.reusedParsedFromFreezeSha256='0'.repeat(64),f=>f.freeze.referenceArithmetic.reusedParsedArtifactSha256='0'.repeat(64),f=>f.parsed.referenceWindow={from:'2019-01',to:'2026-08'},f=>f.parsed.referenceInputSha256s.FRENCH_VAR='0'.repeat(64),f=>delete f.parsed.referenceInputSha256s.FRENCH_DAILY_RF,f=>f.parsed.freezeFileSha256='0'.repeat(64),f=>f.bytes=Buffer.from(f.bytes+' '),f=>f.expected='0'.repeat(64)]){const fixture=reuseFixture();alter(fixture);assert.throws(()=>verify(fixture));}
 const fixture=reuseFixture(),differentFreeze=Buffer.from(JSON.stringify({...fixture.freeze,postResultTuningAllowed:true}));assert.throws(()=>verifyReferenceParsed(fixture.parsed,fixture.bytes,fixture.expected,differentFreeze,fixture.freeze));
});
test('original V1 frozen source bytes are preserved at the #643 base; this branch requires a fresh V3 parser freeze',()=>{
 const historicalHead='cc9ecb5b677035338f034cd0f3c21a24b02c9fa2';
 for(const [file,digest]of Object.entries(initial.files)){const historical=execFileSync('git',['show',`${historicalHead}:${file}`],{cwd:root});assert.equal(sha(historical),digest,file);}
 assert.notEqual(sha(fs.readFileSync(path.join(root,'scripts/supertrader/research/calibration/reference-return-arithmetic.mjs'))),initial.referenceArithmetic.codeSha256);
 const old=JSON.parse(fs.readFileSync(path.join(root,initial.baselineFreeze.path)));assert.equal(assertFreezeV2(old),true);assert.equal(initial.protocolHash,old.protocolHash);assert.equal(old.methods.length,10);
});
test('V2 rejects its stale parser binding after the V3 scanner repair',()=>{
 const added=['accounting-budget-v2.mjs','runner-certified-v2.mjs','portfolio-calibration-v2.mjs','run-calibration-v2.mjs','run-post-calibration-v2.mjs'].map(n=>'scripts/supertrader/research/calibration/'+n).concat(['scripts/supertrader/tests/calibration-budget-v2.test.mjs','scripts/supertrader/tests/calibration-infra-versioning-v2.test.mjs']);
 const f={...structuredClone(initial),files:{...initial.files,...Object.fromEntries(added.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]))}};assert.throws(()=>verifyV2(f));
});

function stressData(n=659){const dates=['2017-12-29','2018-01-02','2018-01-03'],bars=dates.map(date=>({date,open:10.1,close:10.1,high:10.1,low:10.1,rawClose:10.1,rawVolume:1000000,volume:1000000,totalReturnIndex:10.1,splitAdjustmentFactor:1,dividend:0}));return {securities:Array.from({length:n},(_,i)=>({id:'SYNTHETIC_'+i,ticker:'SYNTHETIC_'+i,bars:structuredClone(bars),fundamentals:[],listing:{startDate:dates[0]},terminal:null})),benchmark:{bars},spyBars:bars,calendar:dates.slice(1)};}
function correctionProof(c){assert.ok(c.residual<0&&-c.residual<=c.bound);assert.equal(c.availableCash,1e14);assert.ok(Number.isFinite(c.demand)&&c.demand>0);assert.ok(Number.isFinite(c.scale)&&c.scale>0&&c.scale<=1);assert.equal(c.computedBeforePurchases,true);assert.equal(c.observedResidualUsed,false);}
test('reference-book V2 exports all ex-ante correction inputs without changing source recipes, gross/net modes or source weights',()=>{
 const data=stressData(),p={...protocol,window:{...protocol.window,from:data.calendar[0],to:data.calendar.at(-1)},execution:{...protocol.execution,initialCapital:1e14}},method=getReferenceMethod('CALIB_EQUAL_WEIGHT');
 assert.throws(()=>oldPortfolio.runReferencePortfolio(data,method,p,{costMode:'SOURCE_GROSS'}),/ACCOUNTING_NEGATIVE_CASH/);
 const next=nextPortfolio.runReferencePortfolio(data,method,p,{costMode:'SOURCE_GROSS'});assert.equal(next.top.reconciliation.pass,true);assert.equal(next.costMode,'SOURCE_GROSS');assert.equal(next.top.cashPrecisionCorrections.length,1);correctionProof(next.top.cashPrecisionCorrections[0]);assert.equal(next.top.fills.length,659);
});
test('common V2 diagnostic reaches the tournament runner while every original method/clock/portfolio formula stays frozen',()=>{
 const data=stressData();const prefix=Array.from({length:20},(_,i)=>{const date=new Date(Date.UTC(2017,11,1+i)).toISOString().slice(0,10);return {...data.benchmark.bars[0],date};});for(const s of data.securities)s.bars=[...prefix.map(b=>({...b})),...s.bars];data.benchmark.bars=[...prefix,...data.benchmark.bars];data.spyBars=data.benchmark.bars;
 const p={...protocol,execution:{...protocol.execution,initialCapital:1e14}},method={id:'SYNTHETIC_STATEFUL_NO_ORIGINAL_METHOD_EDIT',portfolioSemantics:{mode:'STATEFUL_DAILY',targetWeightScope:'STATEFUL'},evaluate:ctx=>({status:'READY',targets:ctx.securities.map(s=>({id:s.id,ticker:s.ticker,weight:1/659})),ruleTrace:[]})};
 assert.throws(()=>oldRunner.runMethod(data,method,p,{measureSignals:false}),/ACCOUNTING_NEGATIVE_CASH/);
 const next=nextRunner.runMethod(data,method,p,{measureSignals:false});assert.equal(next.reconciliation.pass,true);assert.equal(next.cashPrecisionCorrections.length,1);correctionProof(next.cashPrecisionCorrections[0]);assert.equal(next.endingPositions.length,659);
});
