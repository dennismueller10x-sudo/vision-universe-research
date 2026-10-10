import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Evaluate the actual workflow's compatible expression, rather than a copy of
// its policy. Model GitHub's one-running/one-pending concurrency behavior.
const yaml=readFileSync(process.env.CI_QUEUE_TEST_WORKFLOW||new URL('../../../.github/workflows/pages-release.yml',import.meta.url),'utf8');
const expression=yaml.match(/^\s+group: \$\{\{ (.*?) \}\}$/m)?.[1];
assert(expression,'Pages concurrency expression required');
function group(event_name,conclusion='success',run_id=1,number=1){
 return runInNewContext(expression,{github:{event_name,run_id,event:{workflow_run:{conclusion},pull_request:{number}}},format:(text,...args)=>text.replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)]))},{timeout:100});
}
test('all publishable production triggers stay serialized; PR queues remain separate',()=>{
 const production=group('push');
 for(const event of ['schedule','workflow_dispatch','workflow_run'])assert.equal(group(event),production);
 assert.notEqual(group('pull_request','success',1,10),production);
 assert.notEqual(group('pull_request','success',1,10),group('pull_request','success',2,11));
});
test('ignored completion cannot replace pending Company Intelligence publication',()=>{
 const production=group('push');
 for(const conclusion of ['failure','cancelled','skipped','neutral','timed_out','action_required']){
  const pending=new Map([[production,'approved-company-intelligence-release']]);
  pending.set(group('workflow_run',conclusion,2),'ignored-source-completion');
  assert.equal(pending.get(production),'approved-company-intelligence-release',conclusion);
 }
 // A newer successful trigger legitimately replaces pending work; it builds
 // the same authoritative GOOD pointer, without a second concurrent publisher.
 const pending=new Map([[production,'approved-company-intelligence-release']]);
 pending.set(group('workflow_run','success',3),'newer-successful-build');
 assert.equal(pending.size,1);assert.equal(pending.get(production),'newer-successful-build');
});
