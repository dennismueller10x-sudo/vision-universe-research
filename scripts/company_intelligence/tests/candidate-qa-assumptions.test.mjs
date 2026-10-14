import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {candidateRollout} from '../candidate-rollout.mjs';
import {expectsEstimatedWindow} from '../estimated-window-expectation.mjs';

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
