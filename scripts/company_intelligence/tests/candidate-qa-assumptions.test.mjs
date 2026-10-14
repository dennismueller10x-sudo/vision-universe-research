import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {candidateRollout} from '../candidate-rollout.mjs';
import {expectsEstimatedWindow,mustShowEstimatedWindow} from '../estimated-window-expectation.mjs';
import {createRequire} from 'node:module';

const generation='a'.repeat(24);
const served=readFileSync(new URL('./fixtures/rollout.served-minified.js',import.meta.url),'utf8'); // bytes served by Pages (gate OFF, release-minified)
const source=readFileSync(new URL('../../../company-intelligence/config/rollout.js',import.meta.url),'utf8');
const evaluate=text=>{const sandbox={URLSearchParams};runInNewContext(text,sandbox);return sandbox.VUCompanyIntelligenceRollout;};

test('candidate canary accepts the release-minified served gate-OFF file and only changes it in the intercepted copy',()=>{
 assert.match(served,/const config=\{stage:0,productionOff:!0,/); // the shape that broke runs 38453617543, 38485967037, 38513671904
 assert.equal(evaluate(served).enabled('AAPL'),false);
 const canary=evaluate(candidateRollout(served,generation));
 assert.equal(canary.stage,1);assert.equal(canary.enabled('AAPL'),true);assert.equal(canary.enabled('ZZZZZ'),false);assert.equal(canary.expectedGeneration,generation);
 assert.equal(evaluate(served).enabled('AAPL'),false);
});

test('candidate canary accepts every real spelling of the gate: minified ON, source ON, source OFF',()=>{
 const minifiedOn=served.replace('const config={stage:0,productionOff:!0,','const config={stage:1,');
 for(const text of [minifiedOn,source,source.replace('const config = {stage:1,','const config = {stage:0,productionOff:true,')])
  assert.equal(evaluate(candidateRollout(text,generation)).enabled('NVDA'),true);
});

test('candidate canary still fails closed on a changed gate shape, cohort or baseline',()=>{
 assert.throws(()=>candidateRollout(served.replace('const config={stage:0,','const config={stage:2,'),generation),/CANDIDATE_UI_BASELINE_MISMATCH/);
 assert.throws(()=>candidateRollout(served.replace('const config=','const settings='),generation),/CANDIDATE_UI_BASELINE_MISMATCH|ReferenceError/);
 assert.throws(()=>candidateRollout(served.replace(/expectedGeneration:"[a-f0-9]{24}"/,'expectedGeneration:null'),generation),/CANDIDATE_UI_BASELINE_MISMATCH/);
 assert.throws(()=>candidateRollout(served.replace('"AAPL"','"ZZZZZ"'),generation),/CANDIDATE_COHORT_MISMATCH/);
 assert.throws(()=>candidateRollout(served,'short'),/INVALID_CANDIDATE_GENERATION/);
});

const now=Date.parse('2026-10-13T12:00:00Z');
const payload=events=>({companyId:'iss_cik_0001227500',events});
const estimate=(over={})=>({companyId:'iss_cik_0001227500',eventType:'EARNINGS_ESTIMATED',confirmationStatus:'ESTIMATED',fiscalYear:2026,fiscalQuarter:'Q3',dateStart:'2026-10-20',dateEnd:'2026-10-30',...over});
const scheduled=(over={})=>({companyId:'iss_cik_0001227500',eventType:'EARNINGS_SCHEDULED',confirmationStatus:'CONFIRMED',fiscalYear:2026,fiscalQuarter:'Q3',startsAt:'2026-10-22T20:00:00Z',date:'2026-10-22',...over});

test('QA expects an estimated window only where the chapter must render one',()=>{
 assert.equal(expectsEstimatedWindow(payload([estimate()]),now),true);
 assert.equal(expectsEstimatedWindow(payload([estimate({dateStart:'2026-10-01',dateEnd:'2026-10-09'})]),now),false,'window already passed: hidden, not a defect');
 assert.equal(expectsEstimatedWindow(payload([estimate(),scheduled()]),now),false,'superseded by confirmed date for the same quarter');
 assert.equal(expectsEstimatedWindow(payload([estimate(),scheduled({fiscalQuarter:'Q4'})]),now),true,'confirmed date of another quarter does not supersede');
 assert.equal(expectsEstimatedWindow(payload([estimate({eventStatus:'CANCELLED'})]),now),false);
 assert.equal(expectsEstimatedWindow(payload([scheduled()]),now),false);
 assert.equal(expectsEstimatedWindow(payload([]),now),false);
 // Time dependence that made the old assertion flap: same payload, later clock.
 assert.equal(expectsEstimatedWindow(payload([estimate()]),Date.parse('2026-10-31T00:00:00Z')),false);
});

test('independent lower bound: valid estimates, margins, supersession, first-window rule',()=>{
 const must=(events,at=now)=>mustShowEstimatedWindow(payload(events),at).length>0;
 assert.equal(must([estimate()]),true);
 assert.equal(must([estimate({dateEnd:'2026-10-15'})]),true,'end = today+2 qualifies');
 assert.equal(must([estimate({dateEnd:'2026-10-14'})]),false,'inside the midnight safety margin');
 assert.equal(must([estimate({dateEnd:'2026-10-09'})]),false);
 assert.equal(must([estimate(),scheduled()]),false);
 assert.equal(must([estimate(),scheduled({fiscalQuarter:'Q4'})]),true);
 assert.equal(must([estimate({eventStatus:'POSTPONED'})]),false);assert.equal(must([estimate({status:'CANCELLED'})]),false);
 assert.equal(must([estimate({startsAt:'2026-10-20T00:00:00Z'})]),false,'clock instants are judged by the view model');
 assert.equal(must([estimate({dateEnd:'garbage'})]),false);assert.equal(must([]),false);
 assert.equal(must([estimate({fiscalQuarter:'Q4'}),estimate()]),true,'first-window rule: at least one pill, never a count');
});

test('lower bound is a strict subset of what the shipped view model renders (no false alarms)',()=>{
 const days=[...Array(120).keys()].map(i=>now+i*86400000);
 const ends=['2026-10-14','2026-10-15','2026-10-16','2026-11-30','2027-01-31'];
 for(const at of days)for(const dateEnd of ends)for(const extra of [[],[scheduled()],[scheduled({fiscalQuarter:'Q4'})],[estimate({fiscalQuarter:'Q4',dateEnd:'2026-10-01'})]])
  for(const flags of [{},{eventStatus:'CANCELLED'},{startsAt:'2026-10-20T00:00:00Z'}]){
   const p=payload([estimate({dateEnd,...flags}),...extra]);
   if(mustShowEstimatedWindow(p,at).length>0)assert.equal(expectsEstimatedWindow(p,at),true,JSON.stringify({at,dateEnd,extra,flags}));
  }
});

test('MUTATION: a view model that discards valid estimates is invisible to a view-model oracle but caught by the lower bound',()=>{
 const require=createRequire(import.meta.url),api=require('../../../company-intelligence/api/contract.js');
 const text=readFileSync(new URL('../../../company-intelligence/ui/stock-section.js',import.meta.url),'utf8');
 const broken=text.replace('estimates:estimates.slice(0,1)','estimates:[]');
 assert.notEqual(broken,text);
 const sandbox={VUCompanyIntelligence:api};runInNewContext(broken,sandbox);
 const p=payload([estimate()]);
 // The broken chapter renders no pill; an oracle built on the same broken view model expects none: circular pass.
 const brokenVm=sandbox.VUCompanyIntelligenceStock.viewModel(p,now).estimates.length>0;
 const renderedPills=brokenVm?1:0;
 assert.equal(renderedPills>0,brokenVm,'circular check would pass');
 // The QA assertion in universe-browser-qa.mjs: fail when pills===0 and a valid estimate exists.
 const qaFails=pills=>!(pills>0||mustShowEstimatedWindow(p,now).length===0);
 assert.equal(qaFails(renderedPills),true);
 assert.equal(qaFails(1),false);
 const passed=payload([estimate({dateEnd:'2026-10-09'})]);
 assert.equal(!(0>0||mustShowEstimatedWindow(passed,now).length===0),false,'hidden passed window is not a failure');
});

const gate=(text,gen=generation)=>candidateRollout(text,gen);
test('HARDENING: anchored gate pattern and evaluated semantics reject decoys, keep both real spellings',()=>{
 const decoyComment=served.replace('const config={stage:0,productionOff:!0,','const config={stage:2,productionOff:!0,')+'\n// const config = {stage:1, cohort}\n';
 assert.throws(()=>gate(decoyComment),/CANDIDATE_UI_BASELINE_MISMATCH/);
 assert.throws(()=>gate(served.replace('productionOff:!0','productionOff:!1')),/CANDIDATE_UI_BASELINE_MISMATCH/,'OFF without productionOff');
 assert.throws(()=>gate(served.replace('productionOff:!0','productionOff:false')),/CANDIDATE_UI_BASELINE_MISMATCH/);
 assert.throws(()=>gate(served.replace('const config={','const xconfig={')),/CANDIDATE_UI_BASELINE_MISMATCH|ReferenceError/);
 assert.throws(()=>gate(served.replace('const config={','const obj.config={')),/SyntaxError|CANDIDATE_UI_BASELINE_MISMATCH/);
 assert.throws(()=>gate(source.replace('const config = {stage:1,','const config = {stage:1,productionOff:true,')),/CANDIDATE_UI_BASELINE_MISMATCH/,'stage 1 with productionOff is contradictory');
 assert.equal(evaluate(gate(served)).productionOff,undefined);assert.equal(evaluate(gate(source)).enabled('AAPL'),true);
});
