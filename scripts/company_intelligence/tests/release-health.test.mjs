import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseHealth,updateAcceptedHealth,acceptedHealthServed} from '../release-health.mjs';
import {goodKey} from '../refresh-storage.mjs';
const source={sourceGeneration:'private-current',privateCompanies:5120,health:{lastSuccessfulRefresh:'2026-10-10T14:36:59Z',lastSuccessfulMaterialRefresh:'2026-10-09T15:47:18Z'}};
const options={privateGeneration:'private-current',checkpointSha256:'a'.repeat(64),expectedCheckpointSha256:'a'.repeat(64),generatedAt:'2026-10-10T16:50:17Z',builtAt:'2026-10-10T17:12:00Z',now:Date.parse('2026-10-10T18:00:00Z')};
test('unchanged consumer generation cannot certify stale production health metadata',()=>{
 const accepted={generation:'accepted',lastSuccessfulPrivateRefresh:'2026-10-10T14:36:59Z',lastSuccessfulConsumerBuild:'2026-10-10T17:12:00.000Z'};
 const delivery={status:'PASS',generation:'accepted'};
 const refresh={generation:'accepted',health:{lastSuccessfulPrivateRefresh:accepted.lastSuccessfulPrivateRefresh,lastSuccessfulConsumerBuild:accepted.lastSuccessfulConsumerBuild}};
 assert.equal(acceptedHealthServed(delivery,refresh,accepted),true);
 assert.equal(acceptedHealthServed(delivery,{...refresh,health:{...refresh.health,lastSuccessfulPrivateRefresh:'2026-10-10T05:54:50Z'}},accepted),false);
 assert.equal(acceptedHealthServed(delivery,{...refresh,health:{...refresh.health,lastSuccessfulConsumerBuild:'2026-10-10T06:00:52.579Z'}},accepted),false);
 assert.equal(acceptedHealthServed({...delivery,generation:'previous'},refresh,accepted),false);
 assert.equal(acceptedHealthServed({...delivery,status:'FAILED'},refresh,accepted),false);
});
test('full release uses actual private refresh and historical accepted build, not rollback or repair time',()=>{
 const h=releaseHealth(source,options);assert.equal(h.lastSuccessfulRefresh,source.health.lastSuccessfulRefresh);assert.equal(h.lastSuccessfulConsumerBuild,'2026-10-10T17:12:00.000Z');assert.equal(h.lastSuccessfulMaterialRefresh,source.health.lastSuccessfulMaterialRefresh);
 for(const bad of [{privateGeneration:'wrong'},{expectedCheckpointSha256:'b'.repeat(64)},{builtAt:'2026-10-11T00:00:00Z'},{builtAt:'2026-10-10T15:00:00Z'}])assert.throws(()=>releaseHealth(source,{...options,...bad}));
});
test('metadata reconciliation preserves previous GOOD and all consumer bytes, and compensates failed readback',async()=>{
 const expected={schema:1,generation:'accepted',payloadNamespace:'eligible-a',manifest:{scope:'PER_ISSUER_ELIGIBILITY',assets:{'index.json':{sha256:'verified'}}},inventory:{company:{tickers:['TEST']}},health:{lastSuccessfulRefresh:'old'},previous:{generation:'previous',payloadNamespace:'eligible-b'}};
 const key=goodKey('eligible'),before=Buffer.from(JSON.stringify(expected));let bytes=before;
 const driver={get:async()=>bytes,put:async(k,b)=>{assert.equal(k,key);bytes=Buffer.from(b);}};
 await updateAcceptedHealth(driver,{namespace:'eligible',expectedGood:expected,health:releaseHealth(source,options)});
 const updated=JSON.parse(bytes);assert.deepEqual(updated.previous,expected.previous);assert.deepEqual(updated.manifest,expected.manifest);assert.deepEqual(updated.inventory,expected.inventory);assert.equal(updated.generation,expected.generation);assert.equal(updated.payloadNamespace,expected.payloadNamespace);
 await assert.rejects(updateAcceptedHealth(driver,{namespace:'eligible',expectedGood:expected,health:{}}),/CONCURRENT_HEALTH_POINTER_ADVANCE/);
 bytes=before;const get=driver.get;let badRead=false;driver.put=async(k,b)=>{bytes=Buffer.from(b);badRead=!bytes.equals(before);};driver.get=async()=>{if(badRead){badRead=false;return Buffer.from('{}');}return get();};
 await assert.rejects(updateAcceptedHealth(driver,{namespace:'eligible',expectedGood:expected,health:releaseHealth(source,options)}),/HEALTH_POINTER_READBACK_FAILED/);assert.deepEqual(bytes,before);
});
