import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {requestKey,seedPages} from '../../scripts/market/scale-marketstack.mjs';
import {responseContentFingerprint,validateOriginalActionProbe,indexOriginalActionProbes,materializeResponse,materializeMarketstackEvidence} from '../../scripts/market/materialize-marketstack-evidence.mjs';
const when='2026-10-01T01:30:00Z';
const entry=()=>({endpoint:'tickers/TEST',params:{},ok:true,checkedAt:when,retrievedAt:'2026-10-01T01:29:59Z',data:{symbol:'TEST',nested:{a:1,b:2}}});
const original=(runId='111',entries=[entry()])=>({schemaVersion:'marketstack-probe-1.0.0',generatedAt:when,run:{source:'github-actions',runId},
  accounting:{provider:'marketstack',requestsAttempted:1,estimatedCreditsConsumed:1},endpoints:entries});
const checkpoint=()=>({schemaVersion:'marketstack-scale-evidence-1.0.0',updatedAt:'2026-10-01T04:00:00Z',lastRun:{runId:'999'},tasks:{},
  runs:{999:{startedAt:'2026-10-01T03:00:00Z',finishedAt:'2026-10-01T04:00:00Z',requestsAttempted:1,estimatedCreditsConsumed:2}}});
function cache(response){
  const root=mkdtempSync(join(tmpdir(),'vu-marketstack-materialization-')),state=checkpoint(),key=requestKey(response.endpoint,response.params),hash=createHash('sha256').update(key).digest('hex');
  const relative=`responses/${parseInt(hash[0],16)%4}/${hash}.json`;mkdirSync(dirname(join(root,relative)),{recursive:true});
  writeFileSync(join(root,relative),JSON.stringify(response));
  state.tasks[key]={file:relative,endpoint:response.endpoint,params:response.params,checkedAt:response.checkedAt,ok:response.ok,seeded:response.seeded||false};
  writeFileSync(join(root,'checkpoint.json'),JSON.stringify(state));
  return {root,state,relative};
}

test('fingerprints compare response content and semantic request keys, ignoring replay annotations',()=>{
  const first={...entry(),params:{offset:0,limit:1000}},second={...entry(),params:{limit:'1000',offset:'0'},label:'new-label',seeded:true,sourceRunId:'999',
    data:{nested:{b:2,a:1},symbol:'TEST'}};
  assert.equal(responseContentFingerprint(first),responseContentFingerprint(second));
  for(const changed of [{checkedAt:'2026-10-01T01:30:01Z'},{ok:false},{reason:'timeout'},{endpoint:'tickers/OTHER'},{params:{offset:1000,limit:1000}},{data:{symbol:'OTHER'}}])
    assert.notEqual(responseContentFingerprint(first),responseContentFingerprint({...first,...changed}));
  assert.notEqual(responseContentFingerprint({...first,data:[1,2]}),responseContentFingerprint({...first,data:[2,1]}));
});

test('original probes require genuine single-run shape and fail closed on replay or mixed provenance',()=>{
  assert.equal(validateOriginalActionProbe(original()),'111');
  for(const changed of [{schemaVersion:'marketstack-materialized-evidence-1.0.0'},{run:{source:'github-actions',runId:'111',snapshotRunId:'999'}},
    {run:{source:'github-actions',runId:'111',role:'REPLAY_CONTAINER_NOT_ORIGINAL_RESPONSE_RUN'}},{run:{source:'local',runId:'111'}},
    {accounting:{provider:'marketstack',requestsAttempted:-1,estimatedCreditsConsumed:1}},{accounting:{provider:'marketstack',requestsAttempted:1,estimatedCreditsConsumed:1,older:{startedAt:when}}},
    {endpoints:[{...entry(),seeded:true}]},{endpoints:[{...entry(),sourceRunId:'222'}]}])
    assert.throws(()=>validateOriginalActionProbe({...original(),...changed}),/EVIDENCE_MATERIALIZATION_/);
});

test('legacy canonical quote diagnostics retain a missing ok field without synthesizing API success',()=>{
  const diagnostic={endpoint:'canonical-quote',params:{symbol:'TEST'},available:false,reason:'notConfigured',checkedAt:when};
  const probe=original('111',[diagnostic]),index=indexOriginalActionProbes([probe]).index;
  const response=materializeResponse({...diagnostic,seeded:true},{seeded:true},checkpoint(),index);
  assert.equal(response.sourceRunId,'111');assert.equal(response.ok,undefined);assert.equal(response.available,false);
  assert.notEqual(responseContentFingerprint(response),responseContentFingerprint({...response,ok:false}));
  assert.throws(()=>responseContentFingerprint({...diagnostic,endpoint:'eod/latest'}),/INVALID_RESPONSE/);
});

test('exact original transformed directory-page content resolves a seeded response, preserving timestamps',()=>{
  const directory={endpoint:'exchanges/XETR/tickers',params:{},ok:true,checkedAt:when,retrievedAt:'2026-10-01T01:29:59Z',data:{pagination:{total:1001},
    data:{tickers:Array.from({length:1001},(_,n)=>({symbol:'S'+n}))}}};
  const probe=original('111',[directory]),transformed=seedPages(probe)[1];
  const response={...transformed,sourceRunId:null,label:'checkpoint-replay'},index=indexOriginalActionProbes([{probe,sha256:'original-file-hash'}]).index;
  const resolved=materializeResponse(response,{seeded:true},checkpoint(),index);
  assert.equal(resolved.params.offset,1000);assert.equal(resolved.sourceRunId,'111');assert.equal(resolved.sourceRunAttribution,'ORIGINAL_ACTION_PROBE_CONTENT_MATCH');
  assert.deepEqual(resolved.sourceRunContentProof.originalActionProbeSHA256s,['original-file-hash']);
  assert.equal(resolved.checkedAt,when);assert.equal(resolved.retrievedAt,response.retrievedAt);
  assert.equal(resolved.data.pagination.count,1);
});

test('identical content in distinct original runs stays ambiguous; duplicate artifacts from one run do not',()=>{
  const response={...entry(),seeded:true},many=indexOriginalActionProbes([original('111'),original('222')]);
  const ambiguous=materializeResponse(response,{seeded:true},checkpoint(),many.index);
  assert.equal(ambiguous.sourceRunId,null);assert.match(ambiguous.sourceRunAttribution,/UNKNOWN_AMBIGUOUS/);
  assert.deepEqual(ambiguous.sourceRunContentProof.candidateOriginalActionRunIds,['111','222']);
  const one=indexOriginalActionProbes([{probe:original('111'),sha256:'file-a'},{probe:original('111'),sha256:'file-b'}]);
  assert.equal(materializeResponse(response,{},checkpoint(),one.index).sourceRunId,'111');
});

test('explicit original origins and labeled interval inference remain intact; unmatched seeds stay unknown',()=>{
  const index=indexOriginalActionProbes([original()]).index;
  const explicit=materializeResponse({...entry(),sourceRunId:'222',sourceRunAttribution:'EXPLICIT_ORIGINAL_RESPONSE'}, {},checkpoint(),index);
  assert.equal(explicit.sourceRunId,'222');assert.equal(explicit.sourceRunAttribution,'EXPLICIT_ORIGINAL_RESPONSE');
  const inferred=materializeResponse({...entry(),checkedAt:'2026-10-01T03:30:00Z'}, {},checkpoint(),index);
  assert.equal(inferred.sourceRunId,'999');assert.equal(inferred.sourceRunAttribution,'CHECKPOINT_INTERVAL_ATTRIBUTION');
  const unmatched=materializeResponse({...entry(),seeded:true,data:{symbol:'UNMATCHED'}},{seeded:true},checkpoint(),index);
  assert.equal(unmatched.sourceRunId,null);assert.equal(unmatched.sourceRunAttribution,'UNKNOWN_SEEDED_ORIGINAL_RUN');
});

test('materialization is byte-deterministic, preserves source/accounting, and labels wrapper as replay',()=>{
  const response={...entry(),seeded:true},fixture=cache(response),source=join(fixture.root,'original.json'),out=join(fixture.root,'probe-provenance.json');
  try{
    writeFileSync(source,JSON.stringify(original()));const before=readFileSync(join(fixture.root,'checkpoint.json'));
    const first=materializeMarketstackEvidence({workingDirectory:fixture.root,originalProbePaths:[source],output:out}),bytes=readFileSync(out);
    const second=materializeMarketstackEvidence({workingDirectory:fixture.root,originalProbePaths:[source],output:out});assert.equal(first.sha256,second.sha256);assert.deepEqual(readFileSync(out),bytes);
    const materialized=JSON.parse(bytes);assert.equal(materialized.generatedAt,fixture.state.updatedAt);
    assert.deepEqual(materialized.accounting,fixture.state.runs);assert.equal(materialized.run.snapshotRunId,'999');
    assert.equal(materialized.run.role,'REPLAY_CONTAINER_NOT_ORIGINAL_RESPONSE_RUN');assert.equal(materialized.run.runId,undefined);
    assert.equal(materialized.endpoints[0].sourceRunId,'111');assert.equal(materialized.endpoints[0].checkedAt,when);assert.equal(first.newProviderRequests,0);
    assert.equal(JSON.stringify(materialized.endpoints[0].data),JSON.stringify(response.data));
    assert.deepEqual(readFileSync(join(fixture.root,'checkpoint.json')),before);assert.deepEqual(JSON.parse(readFileSync(join(fixture.root,fixture.relative))),response);
  }finally{rmSync(fixture.root,{recursive:true,force:true});}
});

test('invalid checkpoint task identities and symlinked response files cannot be materialized',()=>{
  const fixture=cache(entry());
  try{
    const bad=structuredClone(fixture.state);Object.values(bad.tasks)[0].params={ticker:'OTHER'};writeFileSync(join(fixture.root,'checkpoint.json'),JSON.stringify(bad));
    assert.throws(()=>materializeMarketstackEvidence({workingDirectory:fixture.root}),/RECOVERY_REQUIRED_INVALID_TASK_REFERENCE/);
    writeFileSync(join(fixture.root,'checkpoint.json'),JSON.stringify(fixture.state));const target=join(fixture.root,'separate.json');writeFileSync(target,JSON.stringify(entry()));
    rmSync(join(fixture.root,fixture.relative));symlinkSync(target,join(fixture.root,fixture.relative));
    assert.throws(()=>materializeMarketstackEvidence({workingDirectory:fixture.root}),/RECOVERY_REQUIRED_UNSAFE_RESPONSE_PATH/);
  }finally{rmSync(fixture.root,{recursive:true,force:true});}
});

test('public output, symlinked output ancestors, and replacing checkpoint/original evidence are rejected',()=>{
  const fixture=cache(entry());
  try{
    assert.throws(()=>materializeMarketstackEvidence({workingDirectory:fixture.root,output:join(fixture.root,'reports','raw.json')}),/PRIVATE_PATH_REQUIRED/);
    assert.throws(()=>materializeMarketstackEvidence({workingDirectory:fixture.root,output:join(fixture.root,'checkpoint.json')}),/OUTPUT_MUST_NOT_REPLACE_SOURCE_EVIDENCE/);
    const linked=join(fixture.root,'link');symlinkSync(join(fixture.root,'nonexistent'),linked);
    assert.throws(()=>materializeMarketstackEvidence({workingDirectory:fixture.root,output:join(linked,'probe.json')}),/UNSAFE_SYMLINK_PATH/);
    const input=join(fixture.root,'original.json');writeFileSync(input,JSON.stringify(original()));
    assert.throws(()=>materializeMarketstackEvidence({workingDirectory:fixture.root,originalProbePaths:[input],output:input}),/OUTPUT_MUST_NOT_REPLACE_SOURCE_EVIDENCE/);
  }finally{rmSync(fixture.root,{recursive:true,force:true});}
});
