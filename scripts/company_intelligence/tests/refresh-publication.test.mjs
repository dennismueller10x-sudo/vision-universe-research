import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicationPlan,readPlanFromEnv} from '../refresh-publication.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

/* Nachgestellt aus Refresh-Lauf 38652800358 (14.10.2026 23:14 UTC): Gate DISABLED, delivery.json fehlt live,
   die Live-Pruefung lief deterministisch in PRODUCTION_PUBLICATION_SLO_FAILED und rollte erneut zurueck. */
const gate=state=>({read:async()=>Buffer.from(JSON.stringify({schema:1,state,generation:'g',approvalId:'a'})),approvalId:'a',generation:'g'});
const script=fileURLToPath(new URL('../refresh-publication.mjs',import.meta.url));

test('closed gate (DISABLED or STAGED) is GATE_CLOSED; AVAILABLE and every unclear state stay VERIFY',async()=>{
 assert.equal((await publicationPlan(gate('DISABLED'))).mode,'GATE_CLOSED');
 assert.equal((await publicationPlan(gate('STAGED'))).mode,'GATE_CLOSED');
 assert.equal((await publicationPlan(gate('AVAILABLE'))).mode,'VERIFY');
 assert.equal((await publicationPlan({read:async()=>{throw Error('r2');},approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan({read:async()=>null,approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan({read:async()=>Buffer.from('{"schema":1,"state":"DISABLED","generation":"other","approvalId":"a"}'),approvalId:'a',generation:'g'})).mode,'VERIFY');
 assert.equal((await publicationPlan(null)).mode,'VERIFY');
});

test('without storage credentials the plan and the CLI keep the strict VERIFY path (exit 1)',async()=>{
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('VU_HISTORY_S3_'))delete env[k];
 const saved={...process.env};for(const k of Object.keys(process.env))if(k.startsWith('VU_HISTORY_S3_'))delete process.env[k];
 try{assert.equal((await readPlanFromEnv()).mode,'VERIFY');}finally{Object.assign(process.env,saved);}
 const res=spawnSync(process.execPath,[script,'closed'],{encoding:'utf8',env,timeout:20000});
 assert.equal(res.status,1,res.stderr);assert.equal(JSON.parse(res.stdout).mode,'VERIFY');
 assert.equal(spawnSync(process.execPath,[script],{encoding:'utf8',env,timeout:20000}).status,2);
});

const wf=loadYamlFile(fileURLToPath(new URL('../../../.github/workflows/company-intelligence-refresh.yml',import.meta.url)));
const steps=wf.jobs.refresh.steps,deploy=steps.find(s=>s.id==='deploy_live');

test('workflow: a cleanly read closed gate ends deploy_live before any dispatch, live check or rollback trigger',()=>{
 const run=deploy.run,check=run.indexOf('refresh-publication.mjs closed'),dispatch=run.indexOf('refresh-dispatch-wait.mjs');
 assert.ok(check>=0,'Gate-Pruefung fehlt');
 assert.ok(dispatch>0&&check<dispatch&&dispatch<run.indexOf('refresh-live-verify.mjs'),'Gate-Pruefung vor Dispatch/Warten (refresh-dispatch-wait.mjs) und Live-Verifikation');
 assert.match(run,/if node scripts\/company_intelligence\/refresh-publication\.mjs closed; then\n[^\n]*\n\s*exit 0\n\s*fi\n/,'nur der GATE_CLOSED-Zweig endet erfolgreich');
 assert.equal((run.match(/exit 0/g)||[]).length,1);
 for(const k of ['VU_HISTORY_S3_ENDPOINT','VU_HISTORY_S3_BUCKET','VU_HISTORY_S3_REGION','VU_HISTORY_S3_ACCESS_KEY_ID','VU_HISTORY_S3_SECRET_ACCESS_KEY'])
  assert.equal(deploy.env[k],'${{ secrets.'+k+' }}');
 assert.equal(deploy['continue-on-error'],undefined);
});
