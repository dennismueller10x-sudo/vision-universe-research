import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const gateUrl=process.env.SCHEDULER_GATE_MODULE?pathToFileURL(process.env.SCHEDULER_GATE_MODULE).href:new URL('../scheduler-gate.mjs',import.meta.url).href;
const gate=await import(gateUrl);
const {decide,parseMarker,markerName,collectRuns,evaluate}=gate;
const repoRoot=join(here,'..','..','..');
const NOW='2026-10-14T12:00:00Z';
const H=3600e3;
const iso=(hoursAgo)=>new Date(Date.parse(NOW)-hoursAgo*H).toISOString();
// Lauf, der vor `ago` Stunden fertig wurde und `dur` Stunden dauerte.
function prod(ago,{financial=false,dur=0.4,mode='production',conclusion='success',event='schedule',marker=true}={}){
  return {id:Math.floor(Math.random()*1e9),event,conclusion,startedAt:iso(ago+dur),completedAt:iso(ago),marker:marker?{mode,financial}:null};
}

test('Nicht-Schedule-Ereignis: Finanz-Refresh bleibt an, Lauf startet immer',()=>{
  for(const event of ['workflow_dispatch','workflow_call','push']){
    const r=decide({event,now:NOW,runs:[prod(0.1,{financial:true})]});
    assert.equal(r.run,true);assert.equal(r.financial,true);
  }
});

test('Finanz-Zeitgrenze: 7,9 h kein Finanzlauf, 8,1 h Finanzlauf (ohne Toleranz)',()=>{
  const config={financialGraceHours:0,guardHours:0.1};
  // Letzter Finanzlauf STARTETE vor 7,9 / 8,1 h; ein neuerer Lauf ohne Finanz liegt dazwischen.
  const at=(h)=>[prod(3,{financial:false}),prod(h-0.4,{financial:true,dur:0.4})];
  assert.equal(decide({event:'schedule',now:NOW,runs:at(7.9),config}).financial,false);
  assert.equal(decide({event:'schedule',now:NOW,runs:at(8.1),config}).financial,true);
  assert.equal(decide({event:'schedule',now:NOW,runs:at(8.0),config}).financial,true,'genau 8 h ist faellig');
});

test('Schedule-Verzug: Toleranz verhindert, dass ein um Minuten zu junger Lauf den Finanzlauf auf 12 h schiebt',()=>{
  const runs=[prod(3.6,{financial:false}),prod(7.2,{financial:true,dur:0.4})]; // Finanzstart vor 7,6 h
  const strict=decide({event:'schedule',now:NOW,runs,config:{financialGraceHours:0,guardHours:0.1}});
  const tolerant=decide({event:'schedule',now:NOW,runs,config:{guardHours:0.1}});
  assert.equal(strict.financial,false);
  assert.equal(tolerant.financial,true);
  // Ein Finanzlauf von vor 4 h wird auch mit Toleranz nicht wiederholt.
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(3.6,{financial:true})],config:{guardHours:0.1}}).financial,false);
});

test('Finanz-Soll-Spanne ist konfigurierbar',()=>{
  const runs=[prod(5.6,{financial:true})]; // Start vor 6 h
  const config={guardHours:0.1,financialGraceHours:0};
  assert.equal(decide({event:'schedule',now:NOW,runs,config:{...config,financialHours:8}}).financial,false);
  assert.equal(decide({event:'schedule',now:NOW,runs,config:{...config,financialHours:4}}).financial,true);
});

test('leerer Verlauf und fehlende Markierung: Lauf und Finanz an (nie still aus)',()=>{
  const empty=decide({event:'schedule',now:NOW,runs:[]});
  assert.deepEqual([empty.run,empty.financial,empty.reason],[true,true,'NO_MARKED_PRODUCTION_RUN']);
  const unmarked=decide({event:'schedule',now:NOW,runs:[prod(0.2,{marker:false})]});
  assert.equal(unmarked.run,true,'Erfolg ohne Markierung (Altlauf oder von der Wache uebersprungen) ist keine Frische');
  assert.equal(unmarked.financial,true);
});

test('Frische-Wache: Produktionslauf juenger als 2,5 h -> ueberspringen, aelter -> laufen',()=>{
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(2.4)]}).run,false);
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(2.4)]}).reason,'FRESH_PRODUCTION_RUN');
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(2.6)]}).run,true);
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(0.01)]}).run,false);
});

test('Verifikationslaeufe zaehlen nie als Produktions-Frische oder Finanzstand',()=>{
  const r=decide({event:'schedule',now:NOW,runs:[prod(0.2,{mode:'verification',financial:true,event:'workflow_dispatch'})]});
  assert.equal(r.run,true);assert.equal(r.financial,true);
});

test('fehlgeschlagene oder abgebrochene Laeufe sind keine Frische',()=>{
  const failed=prod(0.2,{conclusion:'failure'});
  const cancelled=prod(0.2,{conclusion:'cancelled'});
  assert.equal(decide({event:'schedule',now:NOW,runs:[cancelled,prod(5)]}).run,true);
  assert.notEqual(decide({event:'schedule',now:NOW,runs:[failed,prod(5)]}).reason,'FRESH_PRODUCTION_RUN');
});

test('Fehlschlag-Wartezeit: kein Zweitversuch binnen 45 min, danach wieder; Erfolg danach hebt sie auf',()=>{
  const failedRecently=prod(0.3,{conclusion:'failure',marker:false});
  const older=prod(5);
  assert.deepEqual([decide({event:'schedule',now:NOW,runs:[failedRecently,older]}).run,decide({event:'schedule',now:NOW,runs:[failedRecently,older]}).reason],[false,'FAILURE_COOLDOWN']);
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(1,{conclusion:'failure',marker:false}),older]}).run,true);
  // Ein Fehlschlag, der VOR dem letzten Erfolg lag, loest keine Wartezeit aus.
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(2.6),prod(2.9,{conclusion:'failure',marker:false})]}).reason,'PRODUCTION_RUN_DUE');
  // Nur Schedule-Fehlschlaege zaehlen; ein fehlgeschlagener Dispatch blockiert den Takt nicht.
  assert.equal(decide({event:'schedule',now:NOW,runs:[prod(0.3,{conclusion:'failure',marker:false,event:'workflow_dispatch'}),older]}).run,true);
});

test('defekte Eingaben und Zeitversatz: fail-safe laufen + Finanz an',()=>{
  for(const runs of [null,undefined,'x',{}]){
    const r=decide({event:'schedule',now:NOW,runs});
    assert.deepEqual([r.run,r.financial,r.failSafe],[true,true,true]);
  }
  assert.equal(decide({event:'schedule',now:'kaputt',runs:[]}).run,true);
  const future=decide({event:'schedule',now:NOW,runs:[prod(-5)]});
  assert.deepEqual([future.run,future.financial,future.reason],[true,true,'RUN_TIMESTAMP_IN_FUTURE']);
  // kaputte Eintraege werden ignoriert, nicht als Frische gelesen
  const junk=decide({event:'schedule',now:NOW,runs:[null,{conclusion:'success',marker:{mode:'production',financial:true},completedAt:'x',startedAt:'y'},42]});
  assert.equal(junk.run,true);assert.equal(junk.financial,true);
});

test('Markierungsname: gueltig nur fuer den eigenen Lauf, Format fest',()=>{
  assert.deepEqual(parseMarker('ci-refresh-mode-123-production-financial',123),{mode:'production',financial:true});
  assert.deepEqual(parseMarker('ci-refresh-mode-123-verification-plain'),{mode:'verification',financial:false});
  assert.equal(parseMarker('ci-refresh-mode-123-production-financial',124),null);
  for(const bad of ['company-intelligence-refresh-health-123','ci-refresh-mode-1-prod-plain','ci-refresh-mode-x-production-plain','',null,undefined])assert.equal(parseMarker(bad),null);
  assert.equal(markerName(7,{verification:false,financial:true}),'ci-refresh-mode-7-production-financial');
  assert.equal(parseMarker(markerName(7,{verification:true,financial:false}),7).mode,'verification');
});

function apiFor(runs,artifacts){
  const calls=[];
  const fetchJson=async path=>{
    calls.push(path);
    if(/\/runs\?/.test(path))return {workflow_runs:runs};
    const id=/runs\/(\d+)\/artifacts/.exec(path)[1];
    return {artifacts:(artifacts[id]||[]).map(name=>({name,expired:false}))};
  };
  return {fetchJson,calls};
}
function apiRun(id,hoursAgo,{conclusion='success',event='schedule',status='completed',dur=0.3}={}){
  return {id,event,status,conclusion,created_at:iso(hoursAgo+dur),run_started_at:iso(hoursAgo+dur),updated_at:iso(hoursAgo)};
}

test('collectRuns/evaluate: liest nur Lauflisten und Artefaktnamen und entscheidet',async()=>{
  const runs=[apiRun(3,1),apiRun(2,5),apiRun(1,9)];
  const api=apiFor(runs,{3:[],2:['company-intelligence-refresh-health-2','ci-refresh-mode-2-production-plain'],1:['ci-refresh-mode-1-production-financial']});
  const r=await evaluate({event:'schedule',now:NOW,fetchJson:api.fetchJson,repo:'o/r',workflowFile:'w.yml'});
  // Lauf 3 ist ein von der Wache uebersprungener Lauf (Erfolg ohne Markierung): keine Frische.
  assert.equal(r.run,true);assert.equal(r.financial,true);
  assert.ok(api.calls.every(p=>p.startsWith('/repos/o/r/actions/')),'nur Actions-Metadaten');
  const fresh=apiFor([apiRun(2,1.0)],{2:['ci-refresh-mode-2-production-financial']});
  const skipped=await evaluate({event:'schedule',now:NOW,fetchJson:fresh.fetchJson,repo:'o/r',workflowFile:'w.yml'});
  assert.deepEqual([skipped.run,skipped.financial],[false,false]);
});

test('API-Fehler, fehlerhafte Antwort, ungueltige Konfiguration: fail-safe',async()=>{
  const bad=[async()=>{throw new Error('HTTP_500');},async()=>({}),async()=>({workflow_runs:[apiRun(1,1)]}),async()=>null];
  for(const fetchJson of bad){
    const r=await evaluate({event:'schedule',now:NOW,fetchJson,repo:'o/r',workflowFile:'w.yml'});
    assert.deepEqual([r.run,r.financial,r.failSafe],[true,true,true]);
  }
  const dir=mkdtempSync(join(tmpdir(),'gate-cfg-'));
  try{
    const cfg=join(dir,'c.json');writeFileSync(cfg,JSON.stringify({financialHours:'x'}));
    const r=await evaluate({event:'schedule',now:NOW,fetchJson:async()=>({workflow_runs:[]}),repo:'o/r',workflowFile:'w.yml',configPath:cfg});
    assert.deepEqual([r.run,r.financial],[true,true]);
    writeFileSync(cfg,JSON.stringify({financialHours:6}));
    const ok=await evaluate({event:'schedule',now:NOW,fetchJson:apiFor([apiRun(2,5,{})],{2:['ci-refresh-mode-2-production-financial']}).fetchJson,repo:'o/r',workflowFile:'w.yml',configPath:cfg});
    assert.equal(ok.financial,false,'5,3 h < 6 h Soll aus Konfiguration (mit Toleranz 5,5 h)');
  }finally{rmSync(dir,{recursive:true});}
  // Nicht-Schedule braucht keine API: kein Aufruf, auch bei kaputtem Fetch.
  const r=await evaluate({event:'workflow_dispatch',now:NOW,fetchJson:async()=>{throw new Error('nie');},repo:'o/r',workflowFile:'w.yml'});
  assert.deepEqual([r.run,r.financial],[true,true]);
});

test('Konfiguration der Produktion liefert financialHours 8',async()=>{
  const cfg=join(repoRoot,'company-intelligence/config/continuous-refresh.json');
  assert.equal(gate.loadConfig(cfg).financialHours,8);
});

test('Workflow: Gate, Cron-Redundanz, Finanz-Kopplung und ADR-005',()=>{
  const wf=readFileSync(join(repoRoot,'.github/workflows/company-intelligence-refresh.yml'),'utf8');
  assert.doesNotMatch(wf,/date -u \+%H\) % 8/,'Startstunden-Kopplung entfernt');
  assert.match(wf,/node scripts\/company_intelligence\/scheduler-gate\.mjs/);
  assert.match(wf,/FINANCIAL: \$\{\{ needs\.gate\.outputs\.financial \}\}/);
  assert.match(wf,/needs\.gate\.outputs\.run != 'false'/);
  assert.match(wf,/MARKER=ci-refresh-mode-\$\{GITHUB_RUN_ID\}-\$\{mode\}-\$\{fin\}/);
  assert.match(wf,/name: \$\{\{ env\.MARKER \}\}/);
  assert.match(wf,/name: company-intelligence-refresh-health-\$\{\{ github\.run_id \}\}\n/,'Gesundheits-Artefaktname unveraendert');
  const crons=[...wf.matchAll(/- cron: '([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(crons,['17 */4 * * *','47 2-22/4 * * *']);
  // Slots duerfen sich nie ueberlappen und nie auf :00/:30 liegen.
  for(const c of crons)assert.doesNotMatch(c,/^(0|30) /);
  // Eingaben nur ueber env: nie ${{ inputs.* }} im Shell-Text.
  for(const block of wf.split(/\n\s+run: /).slice(1)){
    const body=block.split(/\n\s{6}- /)[0];
    assert.doesNotMatch(body,/\$\{\{\s*inputs\./,'Eingabe im run-Block');
  }
  assert.match(wf,/permissions:\n  contents: read\n  actions: write\n/,'Rechte unveraendert');
  assert.match(wf,/group: company-intelligence-continuous-\$\{\{ inputs\.verification && 'verification' \|\| 'production' \}\}\n  cancel-in-progress: false/,'Concurrency unveraendert');
});

// Mutationen: dieselbe Suite muss gegen eine kaputte Wache/ein kaputtes Gate ROT werden.
if(!process.env.SCHEDULER_GATE_MODULE){
  const source=readFileSync(new URL('../scheduler-gate.mjs',import.meta.url),'utf8');
  const mutations={
    'Wache immer laufen':[/if\(Number\.isFinite\(lastProd\)&&prodAge<c\.guardHours\)\{/,'if(false){'],
    'Wache immer ueberspringen':[/if\(Number\.isFinite\(lastProd\)&&prodAge<c\.guardHours\)\{/,'if(true){'],
    'Finanz-Gate immer aus':[/const financial=!\(finAge<c\.financialHours-c\.financialGraceHours\);/,'const financial=false;'],
    'Finanz-Gate immer an':[/const financial=!\(finAge<c\.financialHours-c\.financialGraceHours\);/,'const financial=true;'],
    'Verifikation zaehlt als Frische':[/r\.marker\.mode==='production'&&Number/,"(r.marker.mode==='production'||r.marker.mode==='verification')&&Number"],
    'Fehler nicht fail-safe':[/return failSafe\('API_OR_CONFIG_ERROR:'[^;]*;/,"return {run:false,financial:false,reason:'ERR'};"],
    'Erfolg ohne Markierung zaehlt':[/r\.conclusion==='success'&&r\.marker&&r\.marker\.mode==='production'&&/,"r.conclusion==='success'&&"]
  };
  for(const [name,[pattern,replacement]] of Object.entries(mutations)){
    test('Mutation rot: '+name,()=>{
      assert.match(source,pattern,'Mutationsstelle existiert');
      const dir=mkdtempSync(join(tmpdir(),'gate-mut-'));
      try{
        const file=join(dir,'scheduler-gate.mjs');writeFileSync(file,source.replace(pattern,replacement));
        const env={...process.env,SCHEDULER_GATE_MODULE:file};delete env.NODE_TEST_CONTEXT;
        const run=spawnSync(process.execPath,['--test',fileURLToPath(import.meta.url)],{env,encoding:'utf8'});
        assert.notEqual(run.status,0,'Mutation "'+name+'" wurde nicht erkannt');
      }finally{rmSync(dir,{recursive:true});}
    });
  }
}
