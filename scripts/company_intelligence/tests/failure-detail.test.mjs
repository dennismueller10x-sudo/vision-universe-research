import test from 'node:test';
import assert from 'node:assert/strict';
import {failureDetail,MAX_DETAIL} from '../failure-detail.mjs';
test('failureDetail keeps name, code and a short message but masks urls, hosts, paths and secrets',()=>{
 const e=Object.assign(new Error('GET https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abcdef failed host h.example.com:443 at /home/runner/x token=abc123 AKIAIOSFODNN7EXAMPLE1234'),{name:'TypeError',code:'ECONNRESET'});
 const d=failureDetail(e);
 assert.equal(d.name,'TypeError');assert.equal(d.code,'ECONNRESET');
 for(const bad of ['https','cloudflarestorage','Signature=','example.com','/home/runner','abc123','AKIAIOSFODNN7'])assert(!d.message.includes(bad),bad+' in '+d.message);
 assert(d.message.length<=MAX_DETAIL);
});
test('failureDetail tolerates non-errors and caps length',()=>{
 assert.deepEqual(failureDetail(null),{name:'Error',code:null,message:''});
 assert.equal(failureDetail(new Error('x '.repeat(500))).message.length,MAX_DETAIL);
 assert.equal(failureDetail({$metadata:{httpStatusCode:503},message:'boom'}).code,'503');
});
