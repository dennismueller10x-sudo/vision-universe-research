import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const repoRoot=join(here,'..','..','..');
const modulePath=process.env.WATCHDOG_MODULE||join(repoRoot,'scripts/company_intelligence/refresh-watchdog.mjs');
const {evaluateWatchdog,busyRuns}=await import(pathToFileURL(modulePath).href);
const NOW='2026-10-14T12:00:00Z';
const H=3600e3,iso=h=>new Date(Date.parse(NOW)-h*H).toISOString();
const apiRun=(id,ago,{conclusion='success',event='schedule',dur=0.3}={})=>({id,event,status:'completed',conclusion,created_at:iso(ago+dur),run_started_at:iso(ago+dur),updated_at:iso(ago)});

// Fake-API: busy = {workflowFile: {status: count}}, runs/artifacts fuer den Refresh
function api({busy={},runs=[],artifacts={},fail=null}={}){
  const calls=[];
  const fetchJson=async path=>{
    calls.push(path);
    if(fail&&fail(path))throw new Error('HTTP_500');
    let m=/workflows\/([^/]+)\/runs\?status=(\w+)/.exec(path);
    if(m){const n=(busy[m[1]]||{})[m[2]]||0;return {total_count:n,workflow_runs:Array.from({length:n},(_,i)=>({id:i}))};}
    if(/workflows\/company-intelligence-refresh\.yml\/runs\?branch=main/.test(path))return {workflow_runs:runs};
    m=/runs\/(\d+)\/artifacts/.exec(path);
    if(m)return {artifacts:(artifacts[m[1]]||[]).map(name=>({name,expired:false}))};
    throw new Error('UNEXPECTED '+path);
  };
  return {fetchJson,calls};
}
const ev=(a,extra={})=>evaluateWatchdog({fetchJson:a.fetchJson,repo:'o/r',now:NOW,...extra});

test('Veraltet (6 h) und Gruppe frei -> dispatch, Finanz-Urteil wird mitgegeben',async()=>{
  const a=api({runs:[apiRun(1,9)],artifacts:{1:['ci-refresh-mode-1-production-financial']}});
  const r=await ev(a);
  assert.deepEqual([r.dispatch,r.reason],[true,'PRODUCTION_RUN_DUE']);
  assert.equal(r.financial,true); // Finanzlauf vor 9,3 h: faellig
  const plain=api({runs:[apiRun(1,6),apiRun(2,13)],artifacts:{1:['ci-refresh-mode-1-production-plain'],2:['ci-refresh-mode-2-production-financial']}});
  const p=await ev(plain);assert.deepEqual([p.dispatch,p.financial],[true,true]); // Finanzlauf vor 13 h: faellig
  const recent=api({runs:[apiRun(1,6),apiRun(2,5)],artifacts:{1:['ci-refresh-mode-1-production-financial'],2:['ci-refresh-mode-2-production-plain']}});
  const q=await ev(recent);assert.deepEqual([q.dispatch,q.financial],[true,false]); // Finanzlauf vor 6 h: nicht faellig
});

test('Frisch (unter 4,5 h) -> kein Dispatch',async()=>{
  for(const ago of [1,2.5,4.4]){
    const a=api({runs:[apiRun(1,ago)],artifacts:{1:['ci-refresh-mode-1-production-plain']}});
    const r=await ev(a);assert.deepEqual([r.dispatch,r.reason],[false,'FRESH_PRODUCTION_RUN']);
  }
  const r=await ev(api({runs:[apiRun(1,4.6)],artifacts:{1:['ci-refresh-mode-1-production-plain']}}));
  assert.equal(r.dispatch,true);
});

test('Gruppe belegt: kein Dispatch bei laufendem ODER wartendem Lauf jedes der drei Workflows',async()=>{
  const workflows=['company-intelligence-refresh.yml','company-intelligence-profile-source.yml','company-intelligence-universe-release.yml'];
  for(const wf of workflows)for(const status of ['queued','in_progress','waiting','pending','requested']){
    const a=api({busy:{[wf]:{[status]:1}},runs:[apiRun(1,9)],artifacts:{1:['ci-refresh-mode-1-production-plain']}});
    const r=await ev(a);
    assert.deepEqual([r.dispatch,r.reason],[false,'GROUP_BUSY'],wf+' '+status);
  }
});

test('Verifikation zaehlt nicht als Frische; ohne Marker oder ohne Lauf -> dispatch (Primaerslot ist ausgefallen)',async()=>{
  const v=await ev(api({runs:[apiRun(1,0.5,{event:'workflow_dispatch'})],artifacts:{1:['ci-refresh-mode-1-verification-financial']}}));
  assert.equal(v.dispatch,true);
  assert.equal((await ev(api({runs:[]}))).dispatch,true);
});

test('Fehlschlag-Wartezeit des Gates gilt auch fuer den Waechter',async()=>{
  const r=await ev(api({runs:[apiRun(2,0.3,{conclusion:'failure'}),apiRun(1,9)],artifacts:{1:['ci-refresh-mode-1-production-plain']}}));
  assert.deepEqual([r.dispatch,r.reason],[false,'FAILURE_COOLDOWN']);
});

test('API-Fehler, kaputte Antworten, Zeit in der Zukunft: NIE dispatchen, Fehler sichtbar',async()=>{
  const broken=[
    api({fail:p=>/status=queued/.test(p)}),
    api({fail:p=>/branch=main/.test(p),runs:[]}),
    {fetchJson:async()=>({})},
    {fetchJson:async()=>null},
  ];
  for(const a of broken){
    const r=await ev(a);
    assert.equal(r.dispatch,false);assert.match(r.reason,/^API_OR_CONFIG_ERROR/);assert.equal(r.error,true);
  }
  const future=await ev(api({runs:[apiRun(1,-5)],artifacts:{1:['ci-refresh-mode-1-production-plain']}}));
  assert.equal(future.dispatch,false);assert.match(future.reason,/^UNSURE_NO_DISPATCH/);
});

test('busyRuns fragt alle Status aller drei Workflows ab',async()=>{
  const a=api();await busyRuns({fetchJson:a.fetchJson,repo:'o/r'});
  assert.equal(a.calls.length,15);
  assert.ok(a.calls.every(p=>p.startsWith('/repos/o/r/actions/workflows/')));
});

function runCli(env){
  return new Promise(resolve=>{
    const dir=mkdtempSync(join(tmpdir(),'wd-cli-')),out=join(dir,'out.txt');writeFileSync(out,'');
    const child=spawn(process.execPath,[modulePath],{cwd:repoRoot,env:{PATH:process.env.PATH,GITHUB_OUTPUT:out,...env}});
    child.on('close',code=>{const output=readFileSync(out,'utf8');rmSync(dir,{recursive:true});resolve({code,output});});
  });
}
test('CLI: API 401 -> dispatch=false und Exit 1 (sichtbarer Fehler)',async()=>{
  const server=createServer((q,r)=>{r.statusCode=401;r.end('{}');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const r=await runCli({GITHUB_REPOSITORY:'o/r',CI_GATE_API_BASE:'http://127.0.0.1:'+server.address().port});
    assert.equal(r.code,1);assert.match(r.output,/^dispatch=false\n/);assert.doesNotMatch(r.output,/dispatch=true/);
  }finally{server.close();}
});

const wdPath=join(repoRoot,'.github/workflows/company-intelligence-refresh-watchdog.yml');
export function checkWatchdogWorkflow(wf){
  assert.deepEqual([...wf.matchAll(/- cron: '([^']+)'/g)].map(m=>m[1]),['47 2-22/4 * * *']);
  assert.match(wf,/group: company-intelligence-watchdog-\$\{\{ github\.ref_name \}\}\n  cancel-in-progress: false/,'eigene Gruppe');
  assert.doesNotMatch(wf,/company-intelligence-continuous-/,'nie in der Schreibergruppe');
  assert.match(wf,/^permissions:\n  contents: read\n/m);
  assert.match(wf,/    permissions:\n      contents: read\n      actions: write\n/,'actions: write nur fuer gh workflow run, am Job');
  assert.match(wf,/ref: \$\{\{ github\.ref \}\}/);
  assert.match(wf,/id: watch\n        env:\n          GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}\n        run: node scripts\/company_intelligence\/refresh-watchdog\.mjs/);
  assert.doesNotMatch(wf,/continue-on-error/,'Fehler des Waechters muessen sichtbar bleiben');
  assert.match(wf,/if: steps\.watch\.outputs\.dispatch == 'true'/,'Dispatch nur bei Veraltung und freier Gruppe');
  assert.equal([...wf.matchAll(/gh workflow run/g)].length,1);
  assert.match(wf,/gh workflow run company-intelligence-refresh\.yml --ref "\$REF_NAME" -f verification=false -f universe=false -f financial="\$FINANCIAL"/);
  for(const block of wf.split(/\n\s+run: /).slice(1))assert.doesNotMatch(block.split(/\n\s{6}- /)[0],/\$\{\{/,'keine Ausdruecke im run-Text');
}
test('Waechter-Workflow: eigene Gruppe, Rechte, Dispatch-Bedingung, ADR-005',()=>{
  checkWatchdogWorkflow(readFileSync(wdPath,'utf8'));
});

if(!process.env.WATCHDOG_MODULE){
  const source=readFileSync(new URL('../refresh-watchdog.mjs',import.meta.url),'utf8');
  const mut={
    'Waechter dispatcht trotz belegter Gruppe':[/if\(busy\.length\)return no\('GROUP_BUSY',\{busy\}\);/,''],
    'Waechter ignoriert Frische':[/if\(!d\.run\)return no\(d\.reason,/,'if(false)return no(d.reason,'],
    'Waechter dispatcht bei Unsicherheit':[/if\(d\.failSafe\)return no\('UNSURE_NO_DISPATCH:'\+d\.reason\);/,''],
    'Waechter dispatcht bei API-Fehler':[/return \{\.\.\.no\('API_OR_CONFIG_ERROR:'\+String\(error&&error\.message\|\|error\)\.slice\(0,80\)\),error:true\};/,"return {dispatch:true,financial:true,reason:'ERR'};"],
    'Waechter prueft nur einen Status':[/export const BUSY_STATUSES=Object\.freeze\(\[[^\]]*\]\);/,"export const BUSY_STATUSES=Object.freeze(['in_progress']);"],
    'Waechter prueft nur den Refresh':[/export const GROUP_WORKFLOWS=Object\.freeze\(\[[^\]]*\]\);/,"export const GROUP_WORKFLOWS=Object.freeze(['company-intelligence-refresh.yml']);"]
  };
  for(const [name,[pattern,replacement]] of Object.entries(mut)){
    test('Mutation rot: '+name,async()=>{
      assert.match(source,pattern,'Mutationsstelle existiert');
      const dir=mkdtempSync(join(tmpdir(),'wd-mut-'));
      try{
        // Das Modul importiert ./scheduler-gate.mjs: Kopie daneben legen.
        writeFileSync(join(dir,'scheduler-gate.mjs'),readFileSync(new URL('../scheduler-gate.mjs',import.meta.url)));
        const file=join(dir,'refresh-watchdog.mjs');writeFileSync(file,source.replace(pattern,replacement));
        const env={...process.env,WATCHDOG_MODULE:file};delete env.NODE_TEST_CONTEXT;
        const run=await new Promise(res=>{const c=spawn(process.execPath,['--test',fileURLToPath(import.meta.url)],{env});c.on('close',res);c.stdout.resume();c.stderr.resume();});
        assert.notEqual(run,0,'Mutation "'+name+'" wurde nicht erkannt');
      }finally{rmSync(dir,{recursive:true});}
    });
  }
  const original=readFileSync(wdPath,'utf8');
  const wm={
    'Waechter-Workflow: Dispatch ohne Bedingung':["if: steps.watch.outputs.dispatch == 'true'\n        env:","env:"],
    'Waechter-Workflow: Gruppe des Refresh':['group: company-intelligence-watchdog-${{ github.ref_name }}','group: company-intelligence-continuous-production'],
    'Waechter-Workflow: continue-on-error':["        id: watch\n","        id: watch\n        continue-on-error: true\n"],
    'Waechter-Workflow: inputs im run-Text':['run: node scripts/company_intelligence/refresh-watchdog.mjs','run: echo ${{ inputs.x }}; node scripts/company_intelligence/refresh-watchdog.mjs'],
    'Waechter-Workflow: verification nicht false':['-f verification=false','-f verification=true'],
    'Waechter-Workflow: Job ohne actions: write ist ok, aber Workflow-weit write nicht':["permissions:\n  contents: read\nconcurrency","permissions:\n  contents: write\nconcurrency"]
  };
  for(const [name,[from,to]] of Object.entries(wm)){
    test('Mutation rot: '+name,()=>{
      assert.ok(original.includes(from));
      assert.doesNotThrow(()=>checkWatchdogWorkflow(original));
      assert.throws(()=>checkWatchdogWorkflow(original.replace(from,to)));
    });
  }
}
