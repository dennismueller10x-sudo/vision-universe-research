import test from 'node:test';
import assert from 'node:assert/strict';
import {publicTarget,waitForRelease,redactSecrets} from '../europe-public-live-qa.mjs';
const expected='a'.repeat(40);
test('live QA is fixed to the reviewed production origin',()=>{
 assert.equal(publicTarget(),'https://research.visionuniverse.de');
 for(const target of ['http://research.visionuniverse.de','https://example.com','https://research.visionuniverse.de.attacker.test','https://research.visionuniverse.de?token=secret'])assert.throws(()=>publicTarget(target),/REVIEWED_PUBLIC_SITE_REQUIRED/);
});
test('live QA waits for the exact deployed commit and ignores earlier builds',async()=>{
 const calls=[],pauses=[];let count=0;
 const result=await waitForRelease({origin:publicTarget(),expected,pause:async ms=>pauses.push(ms),fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({sourceCommit:++count===1?'b'.repeat(40):expected})};}});
 assert.equal(result.sourceCommit,expected);assert.equal(result.attempts,2);assert.deepEqual(pauses,[5000]);assert.equal(calls[0].options.cache,'no-store');assert.ok(calls.every(c=>c.url.startsWith(publicTarget()+'/release-delivery.json?')));
});
test('unavailable release metadata cannot become successful live evidence',async()=>{
 await assert.rejects(waitForRelease({origin:publicTarget(),expected,deadlineMs:0,fetcher:async()=>{throw Error('offline');}}),/EXPECTED_PRODUCTION_RELEASE_NOT_OBSERVED/);
});
test('live QA rejects an absent or malformed expected SHA before fetch',async()=>{
 let calls=0;
 for(const value of ['', 'a'.repeat(39),'G'.repeat(40)])await assert.rejects(waitForRelease({origin:publicTarget(),expected:value,fetcher:async()=>{calls++;throw Error();}}),/EXPECTED_SOURCE_SHA_REQUIRED/);
 assert.equal(calls,0);
});

test('QA redacts plaintext and derived keys literally in error and browser messages',()=>{
 const password='fixture.+[password]',key='abc123'.repeat(10)+'abcd',message='console '+password+' stack '+key+' repeated '+password;
 const redacted=redactSecrets(message,[password,key]);
 assert.ok(!redacted.includes(password));assert.ok(!redacted.includes(key));assert.equal(redacted.match(/\[REDACTED\]/g).length,3);
 assert.equal(redactSecrets('unchanged',[undefined,'']),'unchanged');
});
