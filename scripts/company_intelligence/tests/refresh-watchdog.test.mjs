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
    if(/workflows\/[^/]+\/runs\?status=/.test(path))return {total_count:0,workflow_runs:[]};
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
  assert.deepEqual([r.dispatch,r.reason],[true,'NO_RUN_IN_WINDOW']);
  assert.equal(r.financial,true); // Finanzlauf vor 9,3 h: faellig
  const plain=api({runs:[apiRun(1,6),apiRun(2,13)],artifacts:{1:['ci-refresh-mode-1-production-plain'],2:['ci-refresh-mode-2-production-financial']}});
  const p=await ev(plain);assert.deepEqual([p.dispatch,p.financial],[true,true]); // Finanzlauf vor 13 h: faellig
  const recent=api({runs:[apiRun(1,6),apiRun(2,5)],artifacts:{1:['ci-refresh-mode-1-production-financial'],2:['ci-refresh-mode-2-production-plain']}});
  const q=await ev(recent);assert.deepEqual([q.dispatch,q.financial],[true,false]); // Finanzlauf vor 6 h: nicht faellig
});

test('Frisch (unter 4,5 h) -> kein Dispatch',async()=>{
  for(const ago of [1,2.5,4.0]){
    const a=api({runs:[apiRun(1,ago)],artifacts:{1:['ci-refresh-mode-1-production-plain']}});
    const r=await ev(a);assert.deepEqual([r.dispatch,r.reason],[false,'SLOT_NOT_MISSED']);
  }
  const r=await ev(api({runs:[apiRun(1,4.6)],artifacts:{1:['ci-refresh-mode-1-production-plain']}}));
  assert.equal(r.dispatch,true);
});

test('Gruppe belegt: kein Dispatch bei laufendem ODER wartendem Lauf jedes der drei Workflows',async()=>{
  const workflows=['company-intelligence-refresh.yml','company-intelligence-profile-source.yml','company-intelligence-universe-release.yml','company-intelligence.yml'];
  for(const wf of workflows)for(const status of ['queued','in_progress','waiting','pending','requested']){
    const a=api({busy:{[wf]:{[status]:1}},runs:[apiRun(1,9)],artifacts:{1:['ci-refresh-mode-1-production-plain']}});
    const r=await ev(a);
    assert.deepEqual([r.dispatch,r.reason],[false,'GROUP_BUSY'],wf+' '+status);
  }
});

test('Gegenfall: wirklich kein Lauf im Fenster -> dispatch (auch ohne jeden Lauf)',async()=>{
  assert.equal((await ev(api({runs:[]}))).dispatch,true);
  const old=await ev(api({runs:[apiRun(1,4.6,{conclusion:'failure'})]}));
  assert.deepEqual([old.dispatch,old.reason],[true,'NO_RUN_IN_WINDOW']);
});

test('M1: Jeder Lauf im Fenster (egal Status, Conclusion, Ereignis) bedeutet "Slot nicht ausgefallen"',async()=>{
  const status=(ago,st,conclusion=null,event='schedule')=>({...apiRun(7,ago,{conclusion,event}),status:st,conclusion});
  const cases={
    failure:status(1.5,'completed','failure'),cancelled:status(2,'completed','cancelled'),skipped:status(2,'completed','skipped'),
    timed_out:status(3,'completed','timed_out'),inProgress:status(0.2,'in_progress'),queued:status(0.1,'queued'),
    dispatchFailure:status(0.2,'completed','failure','workflow_dispatch'),verification:status(0.5,'completed','success','workflow_dispatch'),
    call:status(1,'completed','failure','workflow_call')
  };
  for(const [name,run] of Object.entries(cases)){
    const r=await ev(api({runs:[run]}));
    assert.deepEqual([name,r.dispatch,r.reason],[name,false,'SLOT_NOT_MISSED']);
  }
});

test('S1: Primaer-Fehlschlag vor 1,5 h, davor Waechter-Dispatch-Fehlschlag, letzter Erfolg vor 30 h -> kein Dispatch',async()=>{
  const runs=[apiRun(3,1.5,{conclusion:'failure'}),apiRun(2,4.0,{conclusion:'failure',event:'workflow_dispatch'}),apiRun(1,30)];
  const r=await ev(api({runs,artifacts:{1:['ci-refresh-mode-1-production-financial']}}));
  assert.deepEqual([r.dispatch,r.reason],[false,'SLOT_NOT_MISSED']);
});
test('S2: Waechter-Dispatch vor 10 min gescheitert -> kein Dispatch',async()=>{
  const r=await ev(api({runs:[apiRun(2,10/60,{conclusion:'failure',event:'workflow_dispatch'}),apiRun(1,30)],artifacts:{1:['ci-refresh-mode-1-production-financial']}}));
  assert.equal(r.dispatch,false);
});
test('S3/M2: Erfolgslaeufe vor 1 h und 5 h ohne Marker -> kein dispatch, Warnung "Lauf ohne Marker"',async()=>{
  const r=await ev(api({runs:[apiRun(2,1),apiRun(1,5)],artifacts:{}}));
  assert.equal(r.dispatch,false);
  assert.ok(r.warnings.some(w=>/Lauf ohne Marker/.test(w)),JSON.stringify(r));
  const marked=await ev(api({runs:[apiRun(2,1)],artifacts:{2:['ci-refresh-mode-2-production-plain']}}));
  assert.deepEqual(marked.warnings,[]);
});
test('M1-Fenster: Rand 4,4 h drin, 4,6 h draussen',async()=>{
  assert.equal((await ev(api({runs:[apiRun(1,4.1,{conclusion:'failure'})]}))).dispatch,false);
  assert.equal((await ev(api({runs:[apiRun(1,4.5,{conclusion:'failure'})]}))).dispatch,true);
});
test('m6: uebersprungene Laeufe (Erfolg ohne Artefakte) verbrauchen das Marker-Lookup-Limit nicht',async()=>{
  const {collectRuns}=await import(pathToFileURL(join(repoRoot,'scripts/company_intelligence/scheduler-gate.mjs')).href);
  const skipped=Array.from({length:12},(_,i)=>apiRun(100+i,1+i*0.1));
  const runs=[...skipped,apiRun(1,9)];
  const a=api({runs,artifacts:{1:['ci-refresh-mode-1-production-financial']}});
  const out=await collectRuns({fetchJson:a.fetchJson,repo:'o/r',workflowFile:'company-intelligence-refresh.yml'});
  assert.equal(out.find(r=>r.id===1).marker.mode,'production');
});

test('Fehlschlag-Wartezeit des Gates gilt auch fuer den Waechter',async()=>{
  const r=await ev(api({runs:[apiRun(2,0.3,{conclusion:'failure'}),apiRun(1,9)],artifacts:{1:['ci-refresh-mode-1-production-plain']}}));
  assert.deepEqual([r.dispatch,r.reason],[false,'SLOT_NOT_MISSED']);
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
  assert.equal(future.dispatch,false);
  // Unglaubwuerdiger Abschlusszeitstempel eines alten Laufs: Unsicherheit -> nicht dispatchen.
  const odd={...apiRun(1,6),updated_at:iso(-5)};
  const u=await ev(api({runs:[odd],artifacts:{1:['ci-refresh-mode-1-production-plain']}}));
  assert.deepEqual([u.dispatch,u.reason],[false,'UNSURE_NO_DISPATCH:RUN_TIMESTAMP_IN_FUTURE']);
});

test('busyRuns fragt alle Status aller drei Workflows ab',async()=>{
  const a=api();await busyRuns({fetchJson:a.fetchJson,repo:'o/r'});
  assert.equal(a.calls.length,20);
  assert.ok(a.calls.filter(p=>p.includes('workflows/company-intelligence.yml/')).every(p=>p.includes('&event=workflow_dispatch')),'PR-Laeufe von company-intelligence.yml blockieren nicht');
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
  assert.match(wf,/name: Dispatch production refresh[^\n]*\n        if: steps\.watch\.outputs\.dispatch == 'true' && github\.ref == 'refs\/heads\/main'\n/,'Dispatch nur bei Ausfall, freier Gruppe und auf main');
  assert.equal([...wf.matchAll(/gh workflow run/g)].length,1);
  assert.match(wf,/gh workflow run company-intelligence-refresh\.yml --ref main -f verification=false -f universe=false -f financial="\$FINANCIAL"/,'--ref fest main');
  assert.doesNotMatch(wf,/--ref "?\$/,'kein variabler Ref');
  assert.match(wf,/name: Verify the dispatched run is visible\n        if: steps\.watch\.outputs\.dispatch == 'true'[^\n]*\n(?:.*\n)*?.*sleep 15\n(?:.*\n)*?.*::warning::/,'Sichtbarkeitspruefung mit Warnung');
  for(const block of wf.split(/\n\s+run: /).slice(1))assert.doesNotMatch(block.split(/\n\s{6}- /)[0],/\$\{\{/,'keine Ausdruecke im run-Text');
}
test('Waechter-Workflow: eigene Gruppe, Rechte, Dispatch-Bedingung, ADR-005',()=>{
  checkWatchdogWorkflow(readFileSync(wdPath,'utf8'));
});

if(!process.env.WATCHDOG_MODULE){
  const source=readFileSync(new URL('../refresh-watchdog.mjs',import.meta.url),'utf8');
  const mut={
    'Waechter dispatcht trotz belegter Gruppe':[/if\(busy\.length\)return no\('GROUP_BUSY',\{busy\}\);/,''],
    'Waechter dispatcht bei Unsicherheit':[/if\(d\.failSafe\)return no\('UNSURE_NO_DISPATCH:'\+d\.reason\);/,''],
    'Waechter dispatcht bei API-Fehler':[/return \{\.\.\.no\('API_OR_CONFIG_ERROR:'\+String\(error&&error\.message\|\|error\)\.slice\(0,80\)\),error:true\};/,"return {dispatch:true,financial:true,reason:'ERR'};"],
    'Waechter prueft nur einen Status':[/export const BUSY_STATUSES=Object\.freeze\(\[[^\]]*\]\);/,"export const BUSY_STATUSES=Object.freeze(['in_progress']);"],
    'M1 Waechter zaehlt nur erfolgreiche Laeufe':[/if\(inWindow\.length\)\{/,"if(inWindow.filter(r=>r.conclusion==='success').length){"],
    'M1 Waechter zaehlt nur Schedule-Laeufe':[/if\(inWindow\.length\)\{/,"if(inWindow.filter(r=>r.event==='schedule').length){"],
    'M1 Fenster ignoriert':[/return nowMs-best<windowHours\*3600e3;/,'return false;'],
    'M2 Warnung fehlt':[/warnings\.push\('Lauf ohne Marker im Fenster: Frische nicht pruefbar, kein Dispatch'\)/,'0'],
    'm3 company-intelligence.yml fehlt in der Busy-Liste':[/,'company-intelligence\.yml'\]\);/,"]);"],
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
    'Waechter-Workflow: Dispatch ohne Bedingung':["        if: steps.watch.outputs.dispatch == 'true' && github.ref == 'refs/heads/main'\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          FINANCIAL","        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          FINANCIAL"],
    'Waechter-Workflow: Gruppe des Refresh':['group: company-intelligence-watchdog-${{ github.ref_name }}','group: company-intelligence-continuous-production'],
    'Waechter-Workflow: continue-on-error':["        id: watch\n","        id: watch\n        continue-on-error: true\n"],
    'Waechter-Workflow: inputs im run-Text':['run: node scripts/company_intelligence/refresh-watchdog.mjs','run: echo ${{ inputs.x }}; node scripts/company_intelligence/refresh-watchdog.mjs'],
    'm4: Dispatch ohne main-Bedingung':[" && github.ref == 'refs/heads/main'\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          FINANCIAL","\n        env:\n          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          FINANCIAL"],
    'm4: variabler Ref':['--ref main -f verification','--ref "$GITHUB_REF_NAME" -f verification'],
    'm5: Sichtbarkeitspruefung ohne Warnung':['::warning::Watchdog dispatch','Watchdog dispatch'],
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
