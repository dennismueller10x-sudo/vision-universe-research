/* Release health comes from the restored CURRENT source run, never the older
   frozen rollback. Metadata repair preserves every generation and asset. */
import assert from 'node:assert/strict';
import {goodKey} from './refresh-storage.mjs';
export function acceptedHealthServed(delivery,refresh,accepted){
 return delivery?.status==='PASS'&&delivery.generation===accepted.generation
  &&refresh?.generation===accepted.generation
  &&refresh.health?.lastSuccessfulPrivateRefresh===accepted.lastSuccessfulPrivateRefresh
  &&refresh.health?.lastSuccessfulConsumerBuild===accepted.lastSuccessfulConsumerBuild;
}
export function releaseHealth(source,{privateGeneration,checkpointSha256,expectedCheckpointSha256,generatedAt,builtAt,now=Date.now()}){
 assert.equal(source.sourceGeneration,privateGeneration,'HEALTH_PRIVATE_GENERATION_MISMATCH');
 assert.equal(checkpointSha256,expectedCheckpointSha256,'HEALTH_CHECKPOINT_MISMATCH');
 assert(source.privateCompanies>=5120,'HEALTH_FULL_PRIVATE_STATE_REQUIRED');
 const refreshed=Date.parse(source.health?.lastSuccessfulRefresh),built=Date.parse(builtAt),prepared=Date.parse(generatedAt);
 assert(Number.isFinite(refreshed)&&Number.isFinite(built)&&Number.isFinite(prepared)&&refreshed<=prepared&&prepared<=built&&built<=now,'INVALID_ACCEPTED_HEALTH_TIMESTAMPS');
 return {...source.health,lastSuccessfulConsumerBuild:new Date(built).toISOString(),lastSuccessfulConsumerCommit:new Date(built).toISOString()};
}
export async function updateAcceptedHealth(driver,{namespace,expectedGood,health}){
 assert.equal(expectedGood.manifest.scope,'PER_ISSUER_ELIGIBILITY');
 const key=goodKey(namespace),before=await driver.get(key);
 assert.deepEqual(JSON.parse(before),expectedGood,'CONCURRENT_HEALTH_POINTER_ADVANCE');
 const bytes=Buffer.from(JSON.stringify({...expectedGood,health}));
 try{
  await driver.put(key,bytes);assert(Buffer.from(await driver.get(key)).equals(bytes),'HEALTH_POINTER_READBACK_FAILED');
 }catch(error){
  await driver.put(key,before);assert(Buffer.from(await driver.get(key)).equals(before),'HEALTH_POINTER_RECOVERY_FAILED');throw error;
 }
 return {generation:expectedGood.generation,previousGeneration:expectedGood.previous?.generation||null};
}
