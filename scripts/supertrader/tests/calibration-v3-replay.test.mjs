import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseArguments,qualifiedMethodIds,replayFromScans,runCurrentReplay} from '../research/calibration/run-current-replay-v3.mjs';
const CAL='scripts/supertrader/research/calibration';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'v3-replay-'));
test('private output must be outside the repository and every argument is required',()=>{
 assert.throws(()=>parseArguments(['--freeze','a']),/REPLAY_ARGUMENT_REQUIRED/);
 const ok=['--freeze','f','--completion','c','--completion-sha','s','--tournament-summaries','d','--public-out','p'];
 assert.throws(()=>parseArguments([...ok,'--out','/tmp/x']),/PRIVATE_OUT_OUTSIDE_REPOSITORY_REQUIRED/);
 assert.equal(parseArguments([...ok,'--out','/workspace/private/r']).out,'/workspace/private/r');
});
test('qualified admits a method only with fullyQualified and a passed tournament review',()=>{
 const d=tmp(),w=(id,s)=>fs.writeFileSync(path.join(d,`TOURNAMENT-V3-${id}-SUMMARY-1.json`),JSON.stringify(s));
 w('A',{qualification:{fullyQualified:false},verdict:'MEASURED_RECONCILED_REVIEW_PENDING'});
 w('B',{qualification:{fullyQualified:true},verdict:'MEASURED_RECONCILED_REVIEW_PENDING'});
 w('C',{qualification:{fullyQualified:true},verdict:'MEASURED_RECONCILED_REVIEW_PASSED'});
 assert.deepEqual(qualifiedMethodIds(d,['A','B','C','D']),['C']);
 assert.deepEqual(qualifiedMethodIds(path.join(d,'missing'),['A']),[]);
});
test('diagnostic consensus covers all frozen methods while qualified stays empty without certified methods',()=>{
 const cand=(t)=>({id:'x:'+t,ticker:t}),scans=[{id:'A',asOf:'2026-10-14',candidates:[cand('P'),cand('Q')]},{id:'B',asOf:'2026-10-14',candidates:[cand('P')]}];
 const r=replayFromScans({scans,frozenIds:['A','B'],qualifiedIds:[]});
 assert.equal(r.qualified.length,0);assert.equal(r.diagnostic.length,1);assert.equal(r.diagnostic[0].methodCount,2);
 const q=replayFromScans({scans,frozenIds:['A','B'],qualifiedIds:['A','B']});assert.equal(q.qualified.length,1);
});
test('blocked current data still produces a sealed private report and a public summary without lists or numbers',async()=>{
 const freezeFile=fs.readdirSync(CAL).filter(f=>/^BACKTEST-CALIBRATION-FREEZE-V3-\d+\.json$/.test(f)).sort().at(-1);
 const freeze=JSON.parse(fs.readFileSync(path.join(CAL,freezeFile)));
 const comp=path.join(CAL,`CALIBRATION-V3-COMPLETION-${freeze.freezeId}.json`);
 if(!fs.existsSync(comp)){return;}
 const out=tmp(),pubOut=path.join(tmp(),'pub.json');
 const pub=await runCurrentReplay({freezeFile:path.join(CAL,freezeFile),completionFile:comp,completionSha:sha(fs.readFileSync(comp)),summariesDir:path.join(out,'none'),out:path.join(out,'r'),publicOut:pubOut},{loader:async()=>({state:'UNAVAILABLE',reason:'TEST_NO_DATA'})});
 assert.equal(pub.status,'CURRENT_BLOCKED_DATA');assert.equal(pub.consensus.qualified.tickersWithAtLeastTwoMethods,0);
 assert.equal(fs.existsSync(path.join(out,'r','current-replay.private.json')),false);assert.ok(fs.existsSync(path.join(out,'r','current-replay.private.json.sealed')));
 const text=fs.readFileSync(pubOut,'utf8');assert.equal(pub.candidateListsPublished,false);assert.equal(/"ticker"|candidates/.test(text),false);
});
