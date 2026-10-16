/* Preflight und Nachpruefung fuer den automatischen Re-Freeze des 46er-Rollbacks
   (.github/workflows/company-intelligence-refreeze-auto.yml).

   FAIL-CLOSED und rein lesend: Der Treiber wird auf `get` reduziert, es gibt keinen
   Schreibpfad, keinen Prozessstart und keinen Netzwerkaufruf ausser GET auf die
   oeffentlichen Produktionsobjekte. Der einzige schreibende Schritt ist der
   Re-Freeze-Befehl selbst (`universe-release.mjs refreeze`), den der Workflow nur
   aufruft, wenn `preflight` die Entscheidung REFREEZE liefert.

   Entscheidungen von `preflight`:
   REFREEZE  alle Voraussetzungen erfuellt und ein neuerer Legacy-GOOD vorhanden
   SKIP      alle Voraussetzungen erfuellt, aber nichts Neueres einzufrieren (kein Fehler)
   BLOCKED   mindestens eine Voraussetzung fehlt: kein Re-Freeze, Exit 1
   Exit-Codes: 0 = REFREEZE/SKIP, 1 = BLOCKED bzw. Nachpruefung fehlgeschlagen, 2 = Absturz. */
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {goodState,goodKey,activationKey} from './refresh-storage.mjs';
import {refreshConfig,evaluateHealth,freshness,FRESHNESS_HOURS} from './refresh-approval.mjs';
import {universeConfig} from './universe-approval.mjs';
import {approval} from './production-approval.mjs';
import {prefixFor} from './public-delivery.mjs';
import {productionObservation,readGateState} from './production-observation.mjs';
import {parseRollout} from './propagation-proof.mjs';
import {assertLegacyScope,refreezeArchiveKey,refreezeArchiveBytes} from './frozen-refreeze.mjs';

export const HOUR=3600000;
/* Der eingefrorene Rollback verfaellt sieben Tage nach manifest.generatedAt (CONSUMER_EXPIRED). */
export const FREEZE_LIFETIME_MS=7*24*HOUR;
/* Unterhalb dieser Restlaufzeit ist jeder Fehlschlag dringend (::error::, nicht nur ::warning::). */
export const URGENT_MS=48*HOUR;
export const LIVE_ORIGIN='https://research.visionuniverse.de';
const hex24=/^[a-f0-9]{24}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const sameJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const iso=ms=>Number.isFinite(ms)?new Date(ms).toISOString():null;
const hours=ms=>Math.round(ms/HOUR*10)/10;
const codeOf=e=>/^[A-Z0-9_:-]+$/.test(e?.message||'')?e.message:(e?.code||e?.name||'UNKNOWN');
/* Nur lesender Treiber: ein versehentliches put ist ein TypeError, kein Schreibzugriff. */
export const readOnly=driver=>Object.freeze({get:key=>driver.get(key)});

async function attempt(fn){try{return {ok:true,value:await fn()};}catch(error){return {ok:false,error:codeOf(error)};}}
async function liveObject(fetchImpl,path,now){
 try{
  const r=await fetchImpl(LIVE_ORIGIN+path+'?refreeze-auto='+now,{signal:AbortSignal.timeout(15000)});
  const text=await r.text();let json=null;try{json=JSON.parse(text);}catch{}
  return {ok:Boolean(r.ok),status:r.status,text,json};
 }catch(error){return {ok:false,status:null,text:'',json:null,error:error?.name==='TimeoutError'||error?.name==='AbortError'?'TIMEOUT':'FETCH_FAILED'};}
}
const check=(id,title,failures,detail)=>({id,title,status:failures.length?'FAIL':'PASS',code:failures.length?failures[0].split(':')[0]:null,detail:failures.length?failures.join('; '):detail});

/* Gemeinsamer Lesezustand: jedes Objekt genau einmal, Ladefehler werden pro Pruefung sichtbar. */
async function load(driver,fetchImpl,now){
 const legacyNs=refreshConfig.consumerNamespace,rollbackNs=universeConfig.rollbackNamespace;
 const gate={read:()=>driver.get(prefixFor(approval.namespace)+'gate.json'),approvalId:approval.approvalId,generation:approval.consumerGeneration};
 const s={};
 s.legacy=await attempt(async()=>{const g=await goodState(driver,legacyNs);if(!g)throw Error('LEGACY_GOOD_MISSING');return assertLegacyScope(g,'LEGACY_GOOD_SCOPE_INVALID');});
 s.frozen=await attempt(async()=>{
  const bytes=await driver.get(goodKey(rollbackNs));if(!bytes)throw Error('ROLLBACK_POINTER_MISSING');
  const g=await goodState(driver,rollbackNs);if(!g)throw Error('ROLLBACK_POINTER_INVALID');
  assertLegacyScope(g,'ROLLBACK_FREEZE_SCOPE_INVALID');return {good:g,bytes:Buffer.from(bytes)};
 });
 s.activation=await attempt(async()=>{
  const raw=await driver.get(activationKey());if(!raw)return null;
  const p=JSON.parse(raw);if(p.schema!==1||p.approvalId!==universeConfig.approvalId)throw Error('ACTIVATION_INVALID');return p;
 });
 s.gate=await attempt(()=>readGateState(gate));
 s.observed=await attempt(async()=>{const raw=await driver.get(prefixFor(legacyNs)+'observed.json');return raw?JSON.parse(raw):null;});
 s.delivery=await liveObject(fetchImpl,'/company-intelligence-delivery.json',now);
 s.index=await liveObject(fetchImpl,'/company-intelligence/data/index.json',now);
 s.rollout=await liveObject(fetchImpl,'/company-intelligence/config/rollout.js',now);
 s.refresh=await liveObject(fetchImpl,'/company-intelligence-refresh.json',now);
 s.production=await attempt(()=>productionObservation(s.legacy.ok?s.legacy.value:null,s.observed.ok?(s.observed.value||{}):{},fetchImpl,gate));
 s.health=s.production.ok&&s.legacy.ok?await attempt(()=>evaluateHealth(s.legacy.value,s.observed.ok?(s.observed.value||{}):{},s.production.value,now)):null;
 return s;
}

/* (1) CI verfuegbar und Gate offen. Alles live; das Gate zusaetzlich lesend aus R2. */
function checkGateOpen(s){
 const f=[],d=s.delivery.json;
 if(s.delivery.status!==200)f.push('DELIVERY_HTTP_'+(s.delivery.status??s.delivery.error));
 else if(!d||d.status!=='PASS'||!hex24.test(d.generation||'')||d.cohortStocks!==46||d.issuers!==45)f.push('DELIVERY_NOT_PASS_46_45');
 const i=s.index.json;
 if(s.index.status!==200||!i)f.push('INDEX_UNAVAILABLE');
 else if(i.state==='DISABLED')f.push('INDEX_STATE_DISABLED');
 else if(!['PREVIEW','AVAILABLE'].includes(i.state))f.push('INDEX_STATE_INVALID');
 const r=s.rollout.status===200?parseRollout(s.rollout.text):null;
 if(!r)f.push('ROLLOUT_UNREADABLE');else if(r.productionOff||r.stage!==1)f.push('ROLLOUT_PRODUCTION_OFF');
 if(!s.gate.ok||s.gate.value.gateState!=='AVAILABLE')f.push('GATE_NOT_AVAILABLE:'+(s.gate.ok?s.gate.value.gateState||s.gate.value.gateReason:s.gate.error));
 return check('gate-open','CI verfuegbar, Gate offen',f,'delivery 200 PASS, index.json '+i?.state+', rollout.js nicht productionOff, R2-Gate AVAILABLE');
}
/* (2) Letzter Refresh erfolgreich und frisch (vorhandene Health-Schwelle, nicht lockerer). */
function checkRefreshFresh(s,now){
 const f=[];let age=null;
 if(!s.legacy.ok)f.push('LEGACY_GOOD_UNUSABLE:'+s.legacy.error);
 else{
  const last=s.legacy.value.health?.lastSuccessfulRefresh,t=Date.parse(last);
  if(!Number.isFinite(t))f.push('LAST_REFRESH_MISSING');
  else{age=now-t;if(age<-5*60000)f.push('LAST_REFRESH_IN_FUTURE');else if(freshness(last,now)==='CRITICAL')f.push('LAST_REFRESH_STALE');}
 }
 return check('refresh-fresh','Letzter Refresh erfolgreich und frisch',f,'lastSuccessfulGoodRefresh vor '+hours(age)+' h (Grenze '+FRESHNESS_HOURS.critical+' h)');
}
/* (3) Health HEALTHY, Datenqualitaet gesund: Neuberechnung mit den vorhandenen Funktionen. */
function checkHealth(s){
 const f=[];let h=null;
 if(!s.health||!s.health.ok)f.push('HEALTH_NOT_COMPUTABLE:'+(s.health?.error||s.production.error||'NO_GOOD'));
 else{
  h=s.health.value;
  if(h.status!=='HEALTHY')f.push('HEALTH_'+h.status);
  if(h.productionState!=='VERIFIED')f.push('PRODUCTION_'+h.productionState+(h.productionReason?'/'+h.productionReason:''));
  if(h.gateState!=='AVAILABLE')f.push('GATE_STATE_'+h.gateState);
  for(const k of ['refreshSLO','buildSLO','publicationSLO'])if(h[k]!=='HEALTHY')f.push(k.toUpperCase()+'_'+h[k]);
  if(h.failureStage||h.failureCode)f.push('GOOD_HEALTH_FAILURE:'+(h.failureStage||'')+'/'+(h.failureCode||''));
 }
 return check('health','Health HEALTHY, Datenqualitaet gesund',f,'status HEALTHY, productionState VERIFIED, gateState AVAILABLE, refresh/build/publication SLO HEALTHY, kein Fehlerstatus im GOOD');
}
/* (4) Eine Produktionsgeneration, kein Mischstand. */
function checkGeneration(s){
 const f=[],seen={};
 seen.legacyGood=s.legacy.ok?s.legacy.value.generation:null;
 seen.delivery=s.delivery.json?.generation??null;
 seen.index=s.index.json?.generation??null;
 seen.served=s.health?.ok?s.health.value.servedGeneration:null;
 seen.refresh=s.refresh.json?.generation??null;
 seen.rollout=s.rollout.status===200?parseRollout(s.rollout.text)?.expectedGeneration??null:null;
 seen.observed=s.observed.ok?s.observed.value?.generation??null:null;
 const target=seen.legacyGood,missing=Object.entries(seen).filter(([,v])=>!hex24.test(v||'')).map(([k])=>k);
 if(missing.length)f.push('GENERATION_UNKNOWN:'+missing.join(','));
 const mixed=Object.entries(seen).filter(([,v])=>hex24.test(v||'')&&v!==target).map(([k,v])=>k+'='+v);
 if(mixed.length)f.push('GENERATION_MIXED:'+mixed.join(','));
 return check('generation-unanimous','Produktionsgeneration eindeutig',f,'delivery = index = served = rollout = refresh = observed = Legacy-GOOD = '+target);
}
/* (5) Artefakte vorhanden und konsistent. */
function checkArtifacts(s){
 const f=[],r=s.refresh.json;
 if(s.refresh.status!==200||!r)f.push('REFRESH_JSON_UNAVAILABLE');
 else{
  if(r.status!=='PASS')f.push('REFRESH_JSON_NOT_PASS');
  if(s.legacy.ok){
   const m=s.legacy.value.manifest;
   if(!sameJson(r.manifest?.assets,m.assets))f.push('MANIFEST_HASHES_DIFFER');
   if(!sameJson(r.manifest?.tickers,m.tickers))f.push('MANIFEST_TICKERS_DIFFER');
  }
 }
 if(!s.index.json||s.index.status!==200)f.push('INDEX_JSON_UNAVAILABLE');
 if(s.delivery.status!==200||!s.delivery.json)f.push('DELIVERY_JSON_UNAVAILABLE');
 if(!s.observed.ok||!s.observed.value)f.push('OBSERVED_MISSING');
 return check('artifacts','Artefakte vorhanden und konsistent',f,'delivery.json, refresh.json (Manifest-Hashes = GOOD), index.json, observed.json');
}
/* (6) Alter Rollback-Stand kann sicher archiviert werden. Verfall blockiert nicht: refreeze heilt ihn, ALREADY_CURRENT verlaengert nicht. */
function checkArchivable(s){
 const f=[];let expiry=null;
 if(!s.frozen.ok)f.push('ROLLBACK_NAMESPACE_UNREADABLE:'+s.frozen.error);
 else{
  const {good}=s.frozen.value;
  expiry=Date.parse(good.manifest.generatedAt)+FREEZE_LIFETIME_MS;
  if(!Number.isFinite(expiry))f.push('ROLLBACK_GENERATED_AT_INVALID');
 }
 if(!s.activation.ok)f.push('ACTIVATION_UNREADABLE:'+s.activation.error);
 else if(s.activation.value&&s.activation.value.state!=='ROLLBACK_46')f.push('UNIVERSE_ACTIVE:'+s.activation.value.state);
 return {c:check('rollback-archivable','Alter Rollback-Stand sicher archivierbar',f,'Rollback-Namespace lesbar, Universum nicht aktiv'),expiry};
}
async function checkArchiveKey(s,driver,legacyGeneration){
 // Archiv-Schluessel frei oder byte-identisch (idempotent); nur relevant, wenn wirklich neu eingefroren wird.
 if(!s.frozen.ok||!s.legacy.ok||s.frozen.value.good.generation===legacyGeneration)return [];
 const {good,bytes}=s.frozen.value,existing=await attempt(()=>driver.get(refreezeArchiveKey(good.generation)));
 if(!existing.ok)return ['ARCHIVE_KEY_UNREADABLE:'+existing.error];
 if(existing.value&&!Buffer.from(existing.value).equals(refreezeArchiveBytes(good,bytes)))return ['ARCHIVE_COLLISION'];
 return [];
}

/* Vorabpruefung. Liefert das maschinenlesbare Verdikt; schreibt nichts. */
export async function evaluatePreflight({driver,fetchImpl=fetch,now=Date.now()}){
 const ro=readOnly(driver),s=await load(ro,fetchImpl,now);
 const checks=[checkGateOpen(s),checkRefreshFresh(s,now),checkHealth(s),checkGeneration(s),checkArtifacts(s)];
 const arch=checkArchivable(s);
 const keyFailures=await checkArchiveKey(s,ro,s.legacy.ok?s.legacy.value.generation:null);
 if(keyFailures.length)Object.assign(arch.c,check(arch.c.id,arch.c.title,keyFailures,''));
 checks.push(arch.c);
 const frozen=s.frozen.ok?s.frozen.value.good:null,legacy=s.legacy.ok?s.legacy.value:null;
 const expiresMs=arch.expiry,remaining=Number.isFinite(expiresMs)?expiresMs-now:null;
 // Unbekannte Restlaufzeit gilt als dringend: ohne Lesbarkeit ist nicht belegbar, dass noch Zeit bleibt.
 const urgent=remaining===null||remaining<URGENT_MS;
 let decision,reason;
 const failed=checks.filter(c=>c.status==='FAIL');
 if(failed.length){decision='BLOCKED';reason='PREREQUISITE_FAILED';}
 else if(frozen.generation===legacy.generation){decision='SKIP';reason='FREEZE_ALREADY_CURRENT_GENERATION';}
 else if(!(Date.parse(legacy.manifest.generatedAt)>Date.parse(frozen.manifest.generatedAt))){decision='SKIP';reason='NO_NEWER_LEGACY_GOOD';}
 else{decision='REFREEZE';reason='NEWER_VERIFIED_LEGACY_GOOD';}
 if(decision==='SKIP'&&urgent){
  // Nichts Neueres zum Einfrieren und der Freeze laeuft bald ab: nicht heilbar, laut melden.
  checks.push({id:'freeze-needed',title:'Freeze-Verfall heilbar',status:'FAIL',code:'FREEZE_EXPIRING_NOT_HEALABLE',detail:'FREEZE_EXPIRING_NOT_HEALABLE: '+reason+', Restlaufzeit '+hours(remaining)+' h'});
  decision='BLOCKED';reason='FREEZE_EXPIRING_NOT_HEALABLE';
 }
 return {schema:1,kind:'REFREEZE_AUTO_VERDICT',phase:'preflight',decision,reason,urgent:decision==='BLOCKED'&&urgent,checkedAt:iso(now),
  generation:legacy?.generation||null,writes:'NONE',
  legacy:legacy&&{generation:legacy.generation,generatedAt:legacy.manifest.generatedAt,goodDataAgeHours:hours(now-Date.parse(legacy.health?.lastSuccessfulRefresh))},
  freeze:frozen&&{generation:frozen.generation,generatedAt:frozen.manifest.generatedAt,pointerSha256:sha(s.frozen.value.bytes),expiresAt:iso(expiresMs),hoursToExpiry:hours(remaining),expired:remaining<=0,
   note:'ALREADY_CURRENT verlaengert den Verfall nicht; nur ein Re-Freeze auf einen neueren Legacy-GOOD tut das'},
  checks};
}

/* Nachpruefung nach dem einzigen schreibenden Schritt (oder nach dessen Fehlschlag). */
export async function evaluatePostcheck({driver,release,expectGeneration,preflight=null,now=Date.now()}){
 const ro=readOnly(driver),checks=[],add=(id,title,failures,detail)=>checks.push(check(id,title,failures,detail));
 const ok=release&&['REFROZEN','ALREADY_CURRENT'].includes(release.status);
 const frozen=await attempt(async()=>{
  const bytes=await ro.get(goodKey(universeConfig.rollbackNamespace));const g=await goodState(ro,universeConfig.rollbackNamespace);
  if(!bytes||!g)throw Error('ROLLBACK_POINTER_MISSING');assertLegacyScope(g,'ROLLBACK_FREEZE_SCOPE_INVALID');return {good:g,bytes:Buffer.from(bytes)};
 });
 if(!ok){
  add('result','Ergebnis des Re-Freeze',['REFREEZE_RESULT_'+(release?.status||'MISSING')+(release?.code?':'+release.code:'')],'');
  // Kein Teilzustand: der Rollback-Zeiger muss exakt der von vor dem Lauf sein.
  const f=[];
  if(!frozen.ok)f.push('ROLLBACK_POINTER_UNREADABLE:'+frozen.error);
  else if(preflight?.freeze&&sha(frozen.value.bytes)!==preflight.freeze.pointerSha256)f.push('PARTIAL_STATE_ROLLBACK_POINTER_CHANGED');
  else if(!preflight?.freeze)f.push('NO_PREFLIGHT_BASELINE');
  add('no-partial-state','Kein Teilzustand nach Fehlschlag',f,'Rollback-Zeiger byte-identisch zum Stand vor dem Lauf');
 }else{
  add('result','Ergebnis des Re-Freeze',[],release.status);
  const bad=['privateStateModified','activationModified','gateModified','universeGoodModified'].filter(k=>release[k]!==false);
  add('flags','Vier Schutz-Flags false',bad.map(k=>'FLAG_NOT_FALSE:'+k),'privateState/activation/gate/universeGood unveraendert');
  add('generation','Generation wie gepruefte',release.generation===expectGeneration&&hex24.test(expectGeneration||'')?[]:['GENERATION_MISMATCH:'+release.generation+'!='+expectGeneration],expectGeneration);
  const f=[];let g=null;
  if(!frozen.ok)f.push('ROLLBACK_POINTER_UNREADABLE:'+frozen.error);
  else{
   g=frozen.value.good;
   if(g.generation!==expectGeneration)f.push('FREEZE_GENERATION_MISMATCH:'+g.generation);
   if(release.status==='REFROZEN'&&g.refreeze?.sourceGeneration!==expectGeneration)f.push('REFREEZE_MARKER_MISSING');
   if(Date.parse(g.manifest.generatedAt)+FREEZE_LIFETIME_MS<=now)f.push('NEW_FREEZE_ALREADY_EXPIRED');
  }
  add('new-freeze','Neuer Freeze gueltig',f,g?'generatedAt '+g.manifest.generatedAt+', gueltig bis '+iso(Date.parse(g.manifest.generatedAt)+FREEZE_LIFETIME_MS):'');
  const a=[];
  if(frozen.ok){
   const marker=frozen.value.good.refreeze,key=release.status==='REFROZEN'?release.archiveKey:marker?.archiveKey;
   if(release.status==='REFROZEN'||marker){
    if(!key||(marker&&key!==marker.archiveKey))a.push('ARCHIVE_KEY_MISSING_OR_INCONSISTENT');
    else{
     const raw=await attempt(()=>ro.get(key));
     if(!raw.ok||!raw.value)a.push('ARCHIVE_MISSING');
     else{
      const r=await attempt(()=>{const x=JSON.parse(raw.value);return x.kind==='ROLLBACK_FREEZE_ARCHIVE'&&x.generation===marker.previousGeneration&&x.pointerSha256===marker.previousPointerSha256&&sha(Buffer.from(x.pointer))===x.pointerSha256;});
      if(!r.ok||!r.value)a.push('ARCHIVE_INVALID');
     }
    }
   }
  }else a.push('ROLLBACK_POINTER_UNREADABLE');
  add('archive','Archiv des alten Rollbacks vorhanden',a,'Archiv zum vorherigen Zeiger vorhanden und hash-konsistent');
 }
 const failed=checks.some(c=>c.status==='FAIL');
 return {schema:1,kind:'REFREEZE_AUTO_VERDICT',phase:'postcheck',decision:failed?'FAILED':'VERIFIED',reason:failed?'POSTCHECK_FAILED':(release.status),urgent:failed,checkedAt:iso(now),generation:expectGeneration||null,checks};
}

export function renderSummary(v){
 const icon={PASS:'OK',FAIL:'FEHLER',SKIP:'UEBERSPRUNGEN'};
 const head=v.phase==='preflight'?'Vorabpruefung':'Nachpruefung';
 const lines=[`## Company Intelligence Auto-Re-Freeze: ${head}`,'',`Entscheidung: **${v.decision}** (${v.reason})`,`Generation: ${v.generation||'unbekannt'}`];
 if(v.freeze)lines.push(`Aktueller Freeze: ${v.freeze.generation}, gueltig bis ${v.freeze.expiresAt}, Restlaufzeit ${v.freeze.hoursToExpiry} h${v.freeze.expired?' (ABGELAUFEN, heilbar per Re-Freeze)':''}`);
 if(v.urgent)lines.push('','**DRINGEND:** Freeze-Verfall in weniger als 48 h oder nicht bestimmbar.');
 lines.push('','| Pruefung | Ergebnis | Ursache / Beleg |','|---|---|---|');
 for(const c of v.checks)lines.push(`| ${c.title} | ${icon[c.status]||c.status} | ${String(c.detail||'').replace(/\|/g,'/')} |`);
 return lines.join('\n')+'\n';
}
/* Annotationen: bei Verfall < 48 h ::error::, sonst ::warning:: (der Job ist in beiden Faellen rot). */
export function annotations(v){
 const out=[];
 for(const c of v.checks.filter(x=>x.status==='FAIL'))out.push(`::${v.urgent?'error':'warning'}::Auto-Re-Freeze ${c.id}: ${c.detail}`);
 if(v.decision==='BLOCKED')out.push(`::${v.urgent?'error':'warning'}::Auto-Re-Freeze BLOCKIERT, kein Re-Freeze ausgefuehrt${v.freeze?` (Freeze gueltig bis ${v.freeze.expiresAt}, Restlaufzeit ${v.freeze.hoursToExpiry} h)`:''}`);
 if(v.decision==='FAILED')out.push('::error::Auto-Re-Freeze Nachpruefung fehlgeschlagen, Zustand pruefen (Artefakt refreeze-auto-<runId>)');
 if(v.decision==='SKIP')out.push(`::notice::Auto-Re-Freeze uebersprungen (${v.reason}); Freeze gueltig bis ${v.freeze?.expiresAt}`);
 return out;
}
const exitCodeOf=v=>['BLOCKED','FAILED'].includes(v.decision)?1:0;

async function main(argv,env=process.env){
 const mode=['preflight','verify'].includes(argv[0])?argv[0]:'preflight',arg=k=>argv.includes(k)?argv[argv.indexOf(k)+1]:null,out=arg('--out');
 let verdict;
 try{
  const {createS3DriverFromEnv}=await import('../market/storage/s3-driver.mjs');
  const driver=createS3DriverFromEnv();
  if(mode==='preflight')verdict=await evaluatePreflight({driver});
  else{
   const expectGeneration=arg('--expect-generation');let release=null,pre=null;
   try{release=JSON.parse(readFileSync(arg('--release')));}catch{}
   try{pre=JSON.parse(readFileSync(arg('--preflight')));}catch{}
   verdict=await evaluatePostcheck({driver,release,expectGeneration,preflight:pre});
  }
 }catch(error){
  verdict={schema:1,kind:'REFREEZE_AUTO_VERDICT',phase:mode,decision:'CRASHED',reason:codeOf(error),urgent:true,checkedAt:new Date().toISOString(),generation:null,checks:[]};
  console.log(`::error::Auto-Re-Freeze Pruefung abgestuerzt (${verdict.reason}); kein Re-Freeze`);
 }
 if(out){mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(verdict,null,2)+'\n');}
 for(const line of annotations(verdict))console.log(line);
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,renderSummary(verdict));
 if(env.GITHUB_OUTPUT&&mode==='preflight')appendFileSync(env.GITHUB_OUTPUT,`decision=${verdict.decision}\ngeneration=${verdict.decision==='REFREEZE'?verdict.generation:''}\nurgent=${verdict.urgent}\n`);
 console.log(JSON.stringify({phase:verdict.phase,decision:verdict.decision,reason:verdict.reason,generation:verdict.generation}));
 return verdict.decision==='CRASHED'?2:exitCodeOf(verdict);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main(process.argv.slice(2));
