import test from 'node:test';
import assert from 'node:assert/strict';
import{methods,historicalParticipants,dataBlocked,rulebook}from '../research/tournament/methods.mjs';
import{createFreeze,assertFreeze}from '../research/tournament/freeze.mjs';
test('full engine registry imports without providers, isolates ten identities and six historical participants',()=>{
 assert.equal(methods.length,10);assert.equal(new Set(methods.map(m=>m.id)).size,10);assert.equal(historicalParticipants.length,6);assert.ok(methods.every(m=>Object.isFrozen(m)&&typeof m.evaluate==='function'));assert.ok(dataBlocked.some(m=>m.id==='industry_momentum'));assert.ok(dataBlocked.some(m=>m.id==='residual_momentum'));
});
test('source-to-code rulebooks include separate strategy code/tests and honest fidelity',()=>{
 for(const method of methods){const b=rulebook(method);assert.equal(b.replicationClaimAllowed,false);assert.ok(b.codeAndTestMap.module.endsWith('.mjs'));assert.ok(b.codeAndTestMap.test.includes('tournament-'));assert.ok(b.parameters||b.params);assert.ok(b.rules&&Object.keys(b.rules).length||b.provenance?.length);}
});
test('freeze validates code, parameters and transitive canonical dependencies; tampering fails',()=>{
 const f=createFreeze();assert.equal(assertFreeze(f),true);assert.ok(f.dependencies['quant/engines/canonical-total-return.js']);assert.ok(f.files['accounting.mjs']);assert.ok(f.methods.every(m=>m.rulebookHash.length===64));
 const bad=structuredClone(f);bad.files['runner.mjs']='0'.repeat(64);assert.throws(()=>assertFreeze(bad),/FROZEN_CODE_CHANGED/);
 const params=structuredClone(f);params.methods[0].rulebookHash='0'.repeat(64);assert.throws(()=>assertFreeze(params),/FROZEN_RULEBOOK_CHANGED/);
});
