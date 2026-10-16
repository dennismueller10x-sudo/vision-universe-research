/* Workflow-Vertrag des Fehlerpfads in company-intelligence-profile-source.yml (Job "upgrade").
 * Das echte YAML wird mit dem abhaengigkeitsfreien Teilmengen-Parser geparst und Schritt fuer Schritt simuliert: Bedingungen,
 * Reihenfolge, Umgebung und die echte Entscheidungsfunktion (failure-gate-decision.mjs). Kein Workflow-Lauf, keine R2-/Netzzugriffe. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../failure-gate-decision.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const file=fileURLToPath(new URL('../../../.github/workflows/company-intelligence-profile-source.yml',import.meta.url));
const wf=loadYamlFile(file);

const find=(steps,id)=>steps.find(s=>s.id===id);
const idx=(steps,id)=>steps.indexOf(find(steps,id));
const closeStep=steps=>steps.find(s=>/^Fail closed on a material production regression/.test(s.name||''));

/** Strukturpruefung; liefert Verstoesse. Wird fuer die Mutationstests wiederverwendet. */
function problems(workflow){
 const out=[],job=workflow.jobs.upgrade,steps=job.steps,add=m=>out.push(m);
 const ids=['baseline','run','dispatch','served','liveqa','observe','decide'];
 for(const id of ids)if(!find(steps,id))add('Schritt fehlt: '+id);
 if(out.length)return out;
 const close=closeStep(steps),decide=find(steps,'decide');
 if(!close)return ['Schliess-Schritt fehlt'];
 const order=[...ids.map(id=>idx(steps,id)),steps.indexOf(close)];
 if(order.some((v,i)=>i&&v<order[i-1]))add('Reihenfolge baseline<run<dispatch<served<liveqa<observe<decide<close verletzt');
 if(steps.some(s=>s.id==='live'))add('alter Sammelschritt live noch vorhanden');
 // Schliessen nur nach ausdruecklicher Entscheidung, nie allein wegen failure()
 if(!/steps\.decide\.outputs\.decision == 'CLOSE_GATE'/.test(String(close.if)))add('Schliess-Schritt haengt nicht an der Entscheidung');
 if(/^\s*failure\(\)\s*$/.test(String(close.if))||/steps\.live\./.test(String(close.if)))add('Schliess-Schritt haengt an pauschalem failure()');
 if(!/always\(\)/.test(String(close.if)))add('Schliess-Schritt muss trotz Fehler laufen (always())');
 // Fail-closed, wenn der Entscheidungsschritt selbst nach einer Veroeffentlichung abstuerzt
 if(!/steps\.decide\.outcome == 'failure' && steps\.run\.outcome == 'success'/.test(String(close.if)))add('Fail-closed bei Absturz des Entscheidungsschritts fehlt');
 // Rollback nur nach Entscheidung (ROLLBACK), Reihenfolge rollback < disable < OFF-Dispatch bleibt
 const r=close.run,i1=r.indexOf('refresh-run.mjs rollback'),i2=r.indexOf('production-release.mjs disable'),i3=r.indexOf('gh workflow run pages-release.yml --ref main -f company_intelligence_off=true');
 if(!(i1>=0&&i2>i1&&i3>i2))add('Befehle rollback, disable, OFF-Dispatch fehlen oder Reihenfolge');
 if(!/if \[ "\$ROLLBACK" != false \]; then node scripts\/company_intelligence\/refresh-run\.mjs rollback/.test(r))add('Rollback nicht an die Entscheidung gebunden');
 if(close.env?.ROLLBACK!=='${{ steps.decide.outputs.rollback }}')add('ROLLBACK-Eingabe fehlt');
 // Nur-Rollback-Schritt: kein disable/OFF-Dispatch, nur nach ROLLBACK_ONLY, mit Erwartungs-Generation
 const rb=find(steps,'rollback');
 if(!rb)add('Rollback-Schritt fehlt');
 else{
  if(!/steps\.decide\.outputs\.decision == 'ROLLBACK_ONLY'/.test(String(rb.if)))add('Rollback-Schritt haengt nicht an ROLLBACK_ONLY');
  if(/disable|workflow run|GH_TOKEN/.test(rb.run+JSON.stringify(rb.env||{})))add('Rollback-Schritt darf Gate/Pages nicht anfassen');
  if(!/rollback --expect-generation "\$EXPECT_GENERATION"/.test(rb.run)||rb.env?.EXPECT_GENERATION!=='${{ steps.decide.outputs.generation }}')add('Rollback ohne Erwartungs-Generation');
  if(idx(steps,'decide')>steps.indexOf(rb)||steps.indexOf(rb)>steps.indexOf(close))add('Rollback-Schritt Reihenfolge');
 }
 if(!/--expect-generation "\$EXPECT_GENERATION"/.test(close.run))add('Schliess-Schritt: Rollback ohne Erwartungs-Generation');
 // Entscheidungsschritt: laeuft nur im Produktionsmodus nach Fehlern, nur Lesezugriff, alle Ergebnisse ueber env
 if(!/inputs\.publish/.test(String(decide.if))||!/always\(\)/.test(String(decide.if))||!/failure\(\)/.test(String(decide.if)))add('decide: Bedingung');
 for(const k of ['run','dispatch','served','liveqa','observe'])if(decide.env?.['OUTCOME_'+k.toUpperCase()]!==`\${{ steps.${k}.outcome }}`)add('decide: OUTCOME_'+k.toUpperCase());
 if(decide.env?.PUBLISH!=='${{ inputs.publish }}'||decide.env?.RECOVER_FULL_SCOPE!=='${{ inputs.recover_full_scope }}')add('decide: PUBLISH/RECOVER_FULL_SCOPE ueber env');
 if(/GH_TOKEN|GITHUB_TOKEN/.test(JSON.stringify(decide.env||{})))add('decide darf keinen Schreibtoken bekommen');
 if(!/failure-gate-decision\.mjs decide\s*$/.test(decide.run.trim()))add('decide: Befehl');
 if(/rollback|disable|workflow run/.test(decide.run))add('decide darf nichts veraendern');
 // Basis wird vor dem mutierenden Schritt gelesen und kann den Lauf nicht scheitern lassen
 if(find(steps,'baseline')['continue-on-error']!==true||!/failure-gate-decision\.mjs baseline/.test(find(steps,'baseline').run))add('baseline: nur lesend, continue-on-error');
 // jeder Live-Schritt nur im Produktionsmodus und nur nach Erfolg des Vorgaengers (kein always)
 for(const id of ['dispatch','served','liveqa','observe']){const c=find(steps,id).if;if(c!=='inputs.publish')add(id+': if muss "inputs.publish" sein (implizit success())');}
 // ADR-005 und Rechte
 for(const s of steps)if(/\$\{\{\s*(github\.event\.)?inputs\./.test(s.run||''))add('inputs im run-Text: '+s.name);
 if(JSON.stringify(workflow.permissions)!==JSON.stringify({contents:'read',actions:'write'}))add('Rechte veraendert');
 if(workflow.concurrency?.group!=="company-intelligence-continuous-${{ (inputs.publish || github.event_name == 'schedule') && 'production' || 'profile-source-verification' }}"||workflow.concurrency['cancel-in-progress']!==false)add('Concurrency veraendert');
 return out;
}

test('Struktur: Fehlerpfad erfuellt den Vertrag',()=>assert.deepEqual(problems(wf),[]));
test('ADR-005: keine ${{ inputs.* }} im run-Text, Rechte minimal, Concurrency unveraendert',()=>{
 for(const [name,j] of Object.entries(wf.jobs))for(const s of j.steps||[])assert(!/\$\{\{\s*(github\.event\.)?inputs\./.test(s.run||''),`${name}/${s.name}`);
 assert.deepEqual(wf.permissions,{contents:'read',actions:'write'});
 assert.equal(wf.jobs.upgrade['timeout-minutes'],120);
});
test('Struktur: Entscheidungs- und Schliess-Schritt zeigen nirgends auf den entfernten Schritt "live"',()=>{
 assert(!JSON.stringify(wf).includes('steps.live.'));
});

/* --- Mutationstests: jede Abschwaechung muss vom Vertrag erkannt werden --- */
function mutate(fn){const c=structuredClone(wf);fn(c.jobs.upgrade.steps,c);return problems(c);}
test('Mutation: Schliessen wieder pauschal bei failure() wird erkannt',()=>{
 assert(mutate(s=>{closeStep(s).if="failure() && inputs.publish";}).length);
 assert(mutate(s=>{closeStep(s).if="always() && failure()";}).length);
});
test('Mutation: Rollback ohne Entscheidung / ohne ROLLBACK-Eingabe wird erkannt',()=>{
 assert(mutate(s=>{closeStep(s).run=closeStep(s).run.replace('if [ "$ROLLBACK" != false ]; then ','').replace('; fi','');}).length);
 assert(mutate(s=>{delete closeStep(s).env.ROLLBACK;}).length);
});
test('Mutation: Entscheidungsschritt mit Schreibtoken oder ohne Ergebnis-env wird erkannt',()=>{
 assert(mutate(s=>{find(s,'decide').env.GH_TOKEN='${{ secrets.GITHUB_TOKEN }}';}).length);
 assert(mutate(s=>{delete find(s,'decide').env.OUTCOME_LIVEQA;}).length);
 assert(mutate(s=>{find(s,'decide').run+=' && node scripts/company_intelligence/production-release.mjs disable';}).length);
});
test('Mutation: ${{ inputs.* }} im run-Text oder always() an einem Live-Schritt wird erkannt',()=>{
 assert(mutate(s=>{find(s,'served').run+='\necho ${{ inputs.publish }}';}).length);
 assert(mutate(s=>{find(s,'liveqa').if='always() && inputs.publish';}).length);
});
test('Mutation: Nur-Rollback-Schritt schliesst das Gate / ohne Erwartungs-Generation / entfernt wird erkannt',()=>{
 assert(mutate(s=>{find(s,'rollback').run+='\nnode scripts/company_intelligence/production-release.mjs disable';}).length);
 assert(mutate(s=>{find(s,'rollback').run='node scripts/company_intelligence/refresh-run.mjs rollback';}).length);
 assert(mutate(s=>{s.splice(idx(s,'rollback'),1);}).length);
 assert(mutate(s=>{find(s,'rollback').if="always() && steps.decide.outputs.decision != 'NO_ACTION'";}).length);
});
test('Mutation: alter Sammelschritt live / falsche Reihenfolge wird erkannt',()=>{
 assert(mutate(s=>{s.splice(idx(s,'liveqa'),0,{id:'live',run:'true'});}).length);
 assert(mutate(s=>{const d=s.splice(idx(s,'decide'),1)[0];s.splice(idx(s,'run'),0,d);}).length);
});

/* --- Simulation: Schritt fuer Schritt mit der echten Entscheidungsfunktion --- */
function evalIf(expression,ctx){
 if(expression==null)return !ctx.failed&&!ctx.cancelled; // ohne if gilt success()
 let src=String(expression).trim().replace(/^\$\{\{\s*|\s*\}\}$/g,'');
 const strings=[];src=src.replace(/'([^']*)'/g,(_,x)=>`__S${strings.push(x)-1}__`);
 assert.match(src.replace(/__S\d+__/g,''),/^[\w\s.&|!=()]*$/,'nicht unterstuetzter Ausdruck: '+expression);
 const has=/\b(always|failure|success|cancelled)\s*\(/.test(src);
 src=src.replace(/__S(\d+)__/g,(_,i)=>JSON.stringify(strings[i]));
 const value=Function('steps','inputs','always','failure','success','cancelled',`"use strict";return (${src});`)(ctx.steps,ctx.inputs,()=>true,()=>ctx.failed,()=>!ctx.failed,()=>ctx.cancelled);
 return has?!!value:(!ctx.failed&&!ctx.cancelled&&!!value);
}
const resolveEnv=(value,ctx)=>String(value).replace(/\$\{\{\s*([\w.]+)\s*\}\}/g,(_,path)=>{
 const p=path.split('.');
 if(p[0]==='steps')return ctx.steps[p[1]]?.[p[2]]?.[p[3]]??(ctx.steps[p[1]]?.[p[2]]??'');
 if(p[0]==='inputs')return String(ctx.inputs[p[1]]);
 if(p[0]==='runner')return ctx.runnerTemp;
 return '';
});
/**
 * scenario: {fail:{<stepId>:'failure'|'cancelled'}, health, baseline, probe, inputs}
 * Rueckgabe: {ran:Set<id|name>, decision, closeRan, state}
 */
async function simulate(s,workflow=wf){
 const dir=mkdtempSync(join(tmpdir(),'pswf-')),steps=workflow.jobs.upgrade.steps;
 const ctx={inputs:{publish:true,recover_full_scope:false,...s.inputs},failed:false,cancelled:false,steps:{},runnerTemp:dir};
 if(s.health)writeFileSync(join(dir,'ci-profile-source-health.json'),'');
 const ran=new Set();let decision=null;
 for(const step of steps){
  const key=step.id||step.name||step.uses;
  if(!evalIf(step.if,ctx)){if(step.id)ctx.steps[step.id]={outcome:'skipped',outputs:{}};continue;}
  ran.add(key);
  let outcome=s.fail?.[step.id]||'success',outputs={};
  if(step.id==='decide'){
   const root=join(dir,'ci-profile-source');
   const {mkdirSync}=await import('node:fs');mkdirSync(root,{recursive:true});
   if(s.health)writeFileSync(join(root,'health.json'),JSON.stringify(s.health));
   if(s.baseline)writeFileSync(join(root,'baseline.json'),JSON.stringify(s.baseline));
   const env={};for(const [k,v] of Object.entries(step.env||{}))env[k]=resolveEnv(v,ctx);
   const out=join(dir,'gh-output');writeFileSync(out,'');
   const log=console.log;console.log=()=>{};
   try{await main(['decide'],{...env,REPORT_ROOT:root,GITHUB_OUTPUT:out,GITHUB_RUN_ID:s.health?.runId??''},{probe:async()=>{if(s.probe instanceof Error)throw s.probe;return s.probe;}});}
   finally{console.log=log;}
   outputs=Object.fromEntries(readFileSync(out,'utf8').trim().split('\n').filter(Boolean).map(l=>l.split('=')));decision=outputs;
  }
  ctx.steps[step.id||'_'+steps.indexOf(step)]={outcome,outputs};
  if(outcome==='failure'&&!step['continue-on-error'])ctx.failed=true;
  if(outcome==='cancelled')ctx.cancelled=true;
 }
 rmSync(dir,{recursive:true,force:true});
 return {ran,decision,closeRan:ran.has(closeStep(steps).name),state:ctx.steps};
}
const H=(o={})=>({runId:'5',published:true,verification:false,consumerGeneration:'gen-new',...o});
const B={available:true,gateState:'AVAILABLE',goodGeneration:'gen-old',served:{status:'FOUND',generation:'gen-old'}};
const P=(o={})=>({available:true,gateState:'AVAILABLE',goodGeneration:'gen-new',served:{status:'FOUND',generation:'gen-old'},...o});

test('Simulation: erfolgreicher Lauf => weder Entscheidung noch Schliessen',async()=>{
 const r=await simulate({health:H(),baseline:B});
 assert(!r.ran.has('decide'));assert.equal(r.closeRan,false);
});
test('Simulation: Fehler vor jeder Mutation (Wiederherstellung/Quellenabruf im Lauf) => kein disable, kein Rollback, kein OFF-Dispatch',async()=>{
 const r=await simulate({fail:{run:'failure'},health:H({published:false}),baseline:B,probe:new Error('darf nicht gelesen werden')});
 assert(r.ran.has('decide'));assert.equal(r.decision.decision,'NO_ACTION');assert.equal(r.closeRan,false);
 assert.equal(r.state.dispatch.outcome,'skipped');
});
test('Simulation: Fehler in frueheren Setup-Schritten (Tests, Browser-Runtime, Privacy) => kein Schliessen, kein R2-Zugriff',async()=>{
 for(const re of [/^Source, copy, privacy/,/^Existing browser runtime/,/^Verify private bucket access/]){
  const copy=structuredClone(wf),s=copy.jobs.upgrade.steps.find(x=>re.test(x.name||''));
  assert(s,String(re));s.id='setup';
  const r=await simulate({fail:{setup:'failure'},baseline:B,probe:new Error('darf nicht gelesen werden')},copy);
  assert.equal(r.closeRan,false,String(re));assert.equal(r.decision.decision,'NO_ACTION',String(re));
  assert(!r.ran.has('run')&&!r.ran.has('baseline'));
 }
});
test('Simulation: Szenario A/B (Dispatch-/Wartefehler, Gate offen, Vorgaenger ausgeliefert) => nur Rollback, Gate bleibt offen',async()=>{
 for(const failing of ['dispatch','served']){
  const r=await simulate({fail:{[failing]:'failure'},health:H(),baseline:B,probe:P()});
  assert.equal(r.decision.decision,'ROLLBACK_ONLY',failing);assert.equal(r.closeRan,false,failing);assert(r.ran.has('rollback'),failing);
  assert.equal(r.decision.generation,'gen-new');
 }
 // Szenario B: spaeter doch ausgeliefert, Live-QA abgebrochen
 const b=await simulate({fail:{liveqa:'cancelled'},health:H(),baseline:B,probe:P({served:{status:'FOUND',generation:'gen-new'}})});
 assert.equal(b.decision.decision,'ROLLBACK_ONLY');assert(b.ran.has('rollback'));assert.equal(b.closeRan,false);
});
test('Simulation: Szenario C (recover_full_scope oeffnet Gate, Dispatch-Fehler) => Gate schliessen, kein separater Rollback-Schritt',async()=>{
 const r=await simulate({inputs:{recover_full_scope:true},fail:{dispatch:'failure'},health:H(),baseline:{...B,gateState:'DISABLED'},probe:P({served:{status:'FOUND',generation:'gen-new'}})});
 assert.equal(r.decision.decision,'CLOSE_GATE');assert(r.closeRan);assert(!r.ran.has('rollback'));
});
test('Simulation: observe rot bei Live-QA success und eigener Generation => weder Rollback noch Schliessen',async()=>{
 const r=await simulate({fail:{observe:'failure'},health:H(),baseline:B,probe:P({served:{status:'FOUND',generation:'gen-new'}})});
 assert.equal(r.decision.decision,'NO_ACTION');assert(!r.ran.has('rollback'));assert.equal(r.closeRan,false);
});
test('Simulation: falsche Generation ausgeliefert => disable, Rollback, OFF-Dispatch',async()=>{
 const r=await simulate({fail:{served:'failure'},health:H(),baseline:B,probe:P({served:{status:'FOUND',generation:'gen-fremd'}})});
 assert.equal(r.decision.decision,'CLOSE_GATE');assert.equal(r.decision.rollback,'true');assert(r.closeRan);
});
test('Simulation: Live-QA der eigenen Veroeffentlichung rot => disable (fail-closed)',async()=>{
 const r=await simulate({fail:{liveqa:'failure'},health:H(),baseline:B,probe:P({served:{status:'FOUND',generation:'gen-new'}})});
 assert.equal(r.decision.reason,'OWN_PUBLICATION_LIVE_QA_FAILED');assert(r.closeRan);assert.equal(r.state.observe.outcome,'skipped');
});
test('Simulation: Probe nicht verfuegbar => disable nur nach eigener Mutation, sonst Warnung',async()=>{
 const post=await simulate({fail:{observe:'failure'},health:H(),baseline:B,probe:{available:false,reason:'GATE_READ_FAILED'}});
 assert.equal(post.decision.decision,'CLOSE_GATE');assert(post.closeRan);
 const pre=await simulate({fail:{run:'failure'},health:H({published:false}),baseline:B,probe:{available:false}});
 assert.equal(pre.decision.decision,'NO_ACTION');assert.equal(pre.closeRan,false);
});
test('Simulation: Abbruch (cancelled) nach Veroeffentlichung wird ausgewertet, Abbruch davor nicht',async()=>{
 const post=await simulate({fail:{served:'cancelled'},health:H(),baseline:B,probe:P({served:{status:'FOUND',generation:'gen-fremd'}})});
 assert(post.ran.has('decide'));assert(post.closeRan);
 const preOk=await simulate({fail:{run:'cancelled'},health:H({published:false}),baseline:B,probe:P()});
 assert.equal(preOk.decision.decision,'ROLLBACK_ONLY','Abbruch im Lauf ohne Beleg: moegliche Mutation, Zeiger traegt die Generation, Produktion unveraendert');
 assert.equal(preOk.closeRan,false);
 const preBad=await simulate({fail:{run:'cancelled'},health:H({published:false}),baseline:B,probe:P({served:{status:'FOUND',generation:'gen-fremd'}})});
 assert.equal(preBad.decision.decision,'CLOSE_GATE');
});
test('Simulation: Verifikationslauf (publish=false) fuehrt weder Live-Schritte noch Entscheidung aus',async()=>{
 const r=await simulate({inputs:{publish:false},fail:{run:'failure'}});
 for(const id of ['baseline','dispatch','served','liveqa','observe','decide'])assert(!r.ran.has(id),id);assert.equal(r.closeRan,false);
});
test('Mutation (Verhalten): wuerde der Schliess-Schritt wieder pauschal bei failure() laufen, schliesst der Fehler vor der Mutation das Gate',async()=>{
 const bad=structuredClone(wf);closeStep(bad.jobs.upgrade.steps).if='always() && failure() && inputs.publish';
 const r=await simulate({fail:{run:'failure'},health:H({published:false}),baseline:B,probe:P()},bad);
 assert.equal(r.closeRan,true,'der Mutant verhaelt sich wie der alte Fehlerschritt');
 const good=await simulate({fail:{run:'failure'},health:H({published:false}),baseline:B,probe:P()});
 assert.equal(good.closeRan,false);
});
