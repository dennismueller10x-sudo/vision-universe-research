#!/usr/bin/env node
/* Klassifiziererwechsel 1.1.0 -> 1.3.0 (Owner P2, 28.10.2026): historische Quant-Ergebnisse vor jedem Wechsel
   unveränderlich sichern und Ergebnisse nach dem Wechsel NUR als neue Generation in einem neuen privaten Wurzelverzeichnis
   erzeugen. Kein Abruf, kein Zeitplan, keine Veröffentlichung, kein Umhängen des Lesers.

   node scripts/quant/backtest-generation-freeze.cjs repo-manifest --out <datei> [--source-commit <sha>]
   node scripts/quant/backtest-generation-freeze.cjs freeze --generations <privat> --out <datei>
   node scripts/quant/backtest-generation-freeze.cjs verify --generations <privat> --manifest <datei>
   node scripts/quant/backtest-generation-freeze.cjs build-post-switch --frozen <privat-alt> --manifest <datei> --output <privat-neu> --blocklist <identity-blocklist.json> --prev-master <stamm-vor-dem-wechsel.json> [--series-dir <dir>] [--ids a,b]
   node scripts/quant/backtest-generation-freeze.cjs compare --frozen <privat-alt> --output <privat-neu> [--approved <datei> ...] --blocklist <datei> --out <datei>

   masterHash bleibt, was er ist (SHA-256 der ganzen Stammdatei, quant/engines/weekly-real-adapter.cjs); dieses Skript
   liest ihn nur aus den Snapshots und ändert keinen Hash-Vertrag. Der Inhalts-Fingerabdruck-Entwurf wird nicht geladen. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const A=require('../../quant/engines/weekly-real-adapter.cjs');
const ROOT=path.resolve(__dirname,'../..');
const MASTER='quant/data/market/security-master/us-security-master.json';
const FREEZE_SCHEMA='quant-backtest-generation-freeze-1.0.0',REPO_SCHEMA='quant-v130-repository-freeze-1.0.0',LINEAGE_SCHEMA='quant-backtest-generation-lineage-1.0.0',COMPARE_SCHEMA='quant-backtest-generation-compare-1.0.0';
const TARGET_MASTER_VERSION='us-security-master-1.3.0';
const TRANSIENT=new Set(['.materialize.lock','.materialize.acquire']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inside=(parent,child)=>{const r=path.relative(parent,child);return r===''||(r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r));};
// Echter Pfad auch für noch nicht angelegte Ziele: Symlinks im vorhandenen Teil werden aufgelöst (Review #1100).
const real=p=>{let q=path.resolve(p),rest=[];while(!fs.existsSync(q)){rest.unshift(path.basename(q));const up=path.dirname(q);if(up===q)break;q=up;}return path.join(fs.realpathSync(q),...rest);};

/* Eingefrorene, committete Quant-Evidenz: abgeschlossene Generationen V5.1–V9 samt Folgearbeit und Methodik-Entwurf,
   seit der Übergabe V13 (Merge #1132, 30.10.2026) auch V10–V13c mit ihren Berichten. */
const FROZEN_DIRS=['docs/quant-recovery/methodology-v1','docs/quant-recovery/v51','docs/quant-recovery/v6','docs/quant-recovery/v6-securement','docs/quant-recovery/v6-securement-final','docs/quant-recovery/v7','docs/quant-recovery/v7-securement','docs/quant-recovery/v8','docs/quant-recovery/v9','docs/quant-recovery/v9-followups',
 'docs/quant-recovery/v10','docs/quant-recovery/v11','docs/quant-recovery/v12','docs/quant-recovery/v13','docs/quant-recovery/v13b','docs/quant-recovery/v13c'];
const FROZEN_DOC_RULE='alle Dateien direkt unter docs/quant-recovery/ außer NOT_FROZEN_DOC';
/* Committete Ausgaben, die vom Stamm abhängen und beim Wechsel NICHT still neu entstehen: jede bekommt einen eigenen
   Erzeuger-PR mit Vorher/Nachher. Ihre Bytes stehen in der Git-Historie; sie werden hier nicht festgenagelt, weil ihre
   Erzeuger sie mit den Datenläufen fortschreiben. */
const DEPENDENTS=[
 {path:'quant/data/product/survivorship-control-v1.json',producer:'scripts/quant/build-survivorship-control.mjs',reads:'inaktive Stammaktien-Zeilen',expected:'191 -> 180',handling:'EIGENER_ERZEUGER_PR'},
 {path:'quant/data/product/emerging-leaders-v1/study.json',producer:'.github/workflows/emerging-leaders-study.yml',reads:'commonEquityIds, inactiveEquityIds',expected:'Eingangsmenge -138, inaktive -11',handling:'EIGENER_ERZEUGER_PR'},
 {path:'quant/data/product/capabilities-v1',producer:'eigenes Inventar',reads:'Produktinventar',expected:'nennt 116 der 127 IDs',handling:'NICHT_NEU_GEBAUT'},
 {path:'quant/data/product/sic-peer-taxonomy-v1',producer:'eigenes Inventar',reads:'Produktinventar',expected:'nennt 113 der 127 IDs',handling:'NICHT_NEU_GEBAUT'},
 {path:'quant/data/product/naming-contract-v1',producer:'eigenes Inventar',reads:'Produktinventar',expected:'nennt 9 der 127 IDs',handling:'NICHT_NEU_GEBAUT'},
 {path:'quant/data/product/total-return-quality-v1',producer:'eigenes Inventar',reads:'Produktinventar',expected:'nennt 1 der 127 IDs',handling:'NICHT_NEU_GEBAUT'},
 {path:'<privat>/<generation>/ (snapshot.json, listings, index, release.json)',producer:'scripts/quant/materialize-real-backtest-read.cjs',reads:'masterHash, backtestfähige IDs',expected:'alte Generation: BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED, zurückgehalten; neue Generation 6.397 -> 6.270 IDs',handling:'FREEZE_VOR_DEM_WECHSEL_NEUE_GENERATION_IN_NEUER_WURZEL'},
 {path:'server/quant-backtest-freshness.cjs, server/quant-backtest-reader.cjs',producer:'Code',reads:'masterHash aus dem Snapshot',expected:'SECURITY_MASTER als geänderte Abhängigkeit',handling:'UNVERAENDERT'},
];

/* Betriebsunterlagen, keine Ergebnisse: die Anleitung des verschlüsselten Archivs wird mit jedem Archivstand
   fortgeschrieben und bindet ihre Teile selbst per SHA-256 (manifest-<version>.json). */
/* Ausnahmen je DATEI, mit Grund (Review #1159): nur fortgeschriebene Anleitungen, nie Ergebnisse oder Hash-Anker.
   Archiv-Manifeste und der öffentliche Archivschlüssel bleiben eingefroren (eine neue Archivversion ist eine neue Datei). */
const NOT_FROZEN=new Map([
 ['docs/quant-recovery/v13/archive/README.md','Anleitung des verschlüsselten Archivs, wird mit jedem Archivstand fortgeschrieben'],
]);
const NOT_FROZEN_DOC=[[/^docs\/quant-recovery\/SESSION_HANDOVER_\d{4}-\d{2}-\d{2}\.md$/,'laufende Sitzungsübergabe, kein Ergebnis']];
function walk(base,rel=''){
 const out=[];for(const e of fs.readdirSync(path.join(base,rel),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){
  const p=rel?rel+'/'+e.name:e.name;if(e.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED:'+p);
  if(e.isDirectory())out.push(...walk(base,p));else if(e.isFile()&&!TRANSIENT.has(e.name)&&!NOT_FROZEN.has(p))out.push(p);
 }
 return out;
}
const fileTable=(base,files)=>Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(path.join(base,p)))]));

/** Committete Evidenz (rein lesend). */
function repoManifest({root=ROOT,sourceCommit=null}={}){
 const files=[];for(const d of FROZEN_DIRS)if(fs.existsSync(path.join(root,d)))files.push(...walk(root,d));
 // jedes Dokument direkt unter docs/quant-recovery/ ist eingefroren, außer den benannten laufenden Übergaben (Review #1159)
 files.push(...fs.readdirSync(path.join(root,'docs/quant-recovery'),{withFileTypes:true}).filter(e=>e.isFile()).map(e=>'docs/quant-recovery/'+e.name).filter(p=>!NOT_FROZEN_DOC.some(([re])=>re.test(p))));
 files.sort();
 const masterBytes=fs.readFileSync(path.join(root,MASTER)),master=JSON.parse(masterBytes);
 const table=fileTable(root,files);
 return {schema:REPO_SCHEMA,purpose:'Historische Quant-Ergebnisse vor dem Klassifiziererwechsel 1.1.0 -> 1.3.0 unveränderlich (Owner P2, 28.10.2026)',sourceCommit,
  rule:'Jede gelistete Datei bleibt bytegleich und vorhanden. Neue Dateien sind erlaubt (neue Generation = neues Verzeichnis). Nie von Hand ändern; Neuaufbau nur mit diesem Skript.',
  preSwitchMaster:{path:MASTER,sha256:sha(masterBytes),version:master.version,generatedAt:master.generatedAt,masterHashSemantics:'SHA-256 der ganzen Datei (unverändert)'},
  frozen:{dirs:FROZEN_DIRS,docs:FROZEN_DOC_RULE,notFrozen:[...NOT_FROZEN].map(([path,reason])=>({path,reason})).concat(NOT_FROZEN_DOC.map(([re,reason])=>({pattern:re.source,reason}))),count:files.length,filesSha256:sha(JSON.stringify(table)),files:table},
  dependents:DEPENDENTS};
}
function verifyRepo(manifest,{root=ROOT}={}){
 const changed=[],missing=[];for(const [p,h] of Object.entries(manifest.frozen.files)){const f=path.join(root,p);if(!fs.existsSync(f))missing.push(p);else if(sha(fs.readFileSync(f))!==h)changed.push(p);}
 return {state:changed.length||missing.length?'VIOLATED':'INTACT',changed,missing};
}

/** Private Generationen: jede Datei unter der Wurzel (außer Sperrdateien), jede Generation mit geprüftem Snapshot. */
function freeze({generations}){
 const base=path.resolve(generations);if(inside(ROOT,base))throw Error('GENERATIONS_MUST_BE_PRIVATE_OUTSIDE_REPOSITORY');
 const release=JSON.parse(fs.readFileSync(path.join(base,'release.json')));if(!/^[a-f0-9]{64}$/.test(release.generation||''))throw Error('INVALID_RELEASE');
 const gens=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^[a-f0-9]{64}$/.test(e.name)).map(e=>e.name).sort();
 const masterHashes={};
 for(const g of gens){const s=JSON.parse(fs.readFileSync(path.join(base,g,'snapshot.json')));if(s.generation!==g||A.hash(s.input)!==g)throw Error('INVALID_SNAPSHOT:'+g);masterHashes[g]=s.input.masterHash;}
 if(!gens.includes(release.generation))throw Error('RELEASE_GENERATION_MISSING');
 const table=fileTable(base,walk(base));
 return {schema:FREEZE_SCHEMA,release:{generation:release.generation,masterHash:masterHashes[release.generation],computedAt:release.computedAt,expected:release.expected,releaseSha256:table['release.json']},generations:gens,masterHashes,count:Object.keys(table).length,filesSha256:sha(JSON.stringify(table)),files:table};
}
function verify({generations,manifest}){
 const base=path.resolve(generations);if(manifest?.schema!==FREEZE_SCHEMA)throw Error('INVALID_FREEZE_MANIFEST');
 const now=fileTable(base,walk(base)),changed=[],missing=[],added=[];
 for(const [p,h] of Object.entries(manifest.files)){if(!(p in now))missing.push(p);else if(now[p]!==h)changed.push(p);}
 for(const p of Object.keys(now))if(!(p in manifest.files))added.push(p);
 return {state:changed.length||missing.length||added.length?'VIOLATED':'INTACT',changed,missing,added};
}

/** Neue Generation nach dem Wechsel: nur in eine NEUE private Wurzel; die eingefrorene bleibt bytegleich (vorher und nachher geprüft). */
function buildPostSwitch({root=ROOT,frozen,manifest,output,ids=null,blocklist=null,expectMasterVersion=TARGET_MASTER_VERSION,materializeFn=null}={}){
 if(!frozen||!output||!manifest)throw Error('FROZEN_MANIFEST_AND_OUTPUT_REQUIRED');
 const old=real(frozen),next=real(output);
 if(inside(old,next)||inside(next,old))throw Error('POST_SWITCH_OUTPUT_MUST_BE_SEPARATE_ROOT');
 // keine Symlinks in der neuen Wurzel, die in die eingefrorene zeigen (der Erzeuger schreibt darunter)
 if(fs.existsSync(next)){const walk=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{const p=path.join(d,e.name);if(e.isSymbolicLink()){if(inside(old,real(p)))throw Error('POST_SWITCH_OUTPUT_MUST_BE_SEPARATE_ROOT');}else if(e.isDirectory())walk(p);});walk(next);}
 const before=verify({generations:old,manifest});if(before.state!=='INTACT')throw Error('FROZEN_GENERATION_CHANGED');
 const masterBytes=fs.readFileSync(path.join(root,MASTER),'utf8'),master=JSON.parse(masterBytes);
 if(master.version!==expectMasterVersion)throw Error('MASTER_NOT_SWITCHED');
 if(A.hash(masterBytes)===manifest.release.masterHash)throw Error('MASTER_UNCHANGED_NO_NEW_GENERATION');
 if(fs.existsSync(next)&&manifest.generations.some(g=>fs.existsSync(path.join(next,g))))throw Error('FROZEN_GENERATION_IN_OUTPUT');
 // gleicher Umfang wie die eingefrorene Generation, damit der Vergleich Titel für Titel geht
 // Pflicht (Review #1136): ohne eine an genau diesen Wechsel gebundene Sperrliste keine neue Generation
 if(!blocklist||!Array.isArray(blocklist.ids)||!/^[0-9a-f]{64}$/.test(String(blocklist.sha256)))throw Error('BLOCKLIST_REQUIRED');
 if(blocklist.prevMasterSha256!==manifest.release.masterHash)throw Error('BLOCKLIST_FOR_OTHER_PREVIOUS_MASTER');
 if(blocklist.nextMasterSha256!==A.hash(masterBytes))throw Error('BLOCKLIST_NOT_FROM_COMMITTED_MASTER');
 const full=ids||JSON.parse(fs.readFileSync(path.join(old,manifest.release.generation,'snapshot.json'))).input.sources.map(s=>s.securityId);
 // Identitätssperre (Owner 30.10.2026): gesperrte IDs ohne belastbare kanonische Zuordnung gehen nie in die neue Generation
 const blocked=new Set(blocklist.ids),scope=full.filter(id=>!blocked.has(id));
 const run=materializeFn||require('./materialize-real-backtest-read.cjs').materialize;
 const report=run({root,output:next,ids:scope});
 if(manifest.generations.includes(report.generation))throw Error('GENERATION_COLLISION');
 const after=verify({generations:old,manifest});if(after.state!=='INTACT')throw Error('FROZEN_GENERATION_CHANGED_DURING_BUILD');
 const lineage={schema:LINEAGE_SCHEMA,predecessor:{generation:manifest.release.generation,masterHash:manifest.release.masterHash,freezeFilesSha256:manifest.filesSha256},
  successor:{generation:report.generation,state:report.state,masterHash:A.hash(masterBytes),masterVersion:master.version,expected:report.expected},
  frozenRootVerified:{before:before.state,after:after.state},publiclyActivated:false,readerSwitch:'OWNER_STEP_NOT_PERFORMED',
  identityBlocklist:{sha256:blocklist.sha256,count:blocked.size,excludedFromScope:full.filter(id=>blocked.has(id))}};
 fs.writeFileSync(path.join(next,'lineage.json.tmp'),JSON.stringify(lineage,null,1)+'\n');fs.renameSync(path.join(next,'lineage.json.tmp'),path.join(next,'lineage.json'));
 return lineage;
}

/** Identitätssperrliste aus security-master-drift-evidence.mjs (identity-blocklist.json); jeder Formfehler bricht ab. */
const BLOCKLIST_SCHEMA='security-master-identity-blocklist-1.0.0';
const BLOCKLIST_GENERATOR='security-master-identity-blocklist-builder-1.1.0';
/** Form der Sperrliste (Datei oder Objekt): Schema, Erzeuger, eindeutige IDs mit Grund, Bindung an beide Stämme. */
function checkBlocklist(j){
 if(!j||j.schema!==BLOCKLIST_SCHEMA||j.generator!==BLOCKLIST_GENERATOR||!Array.isArray(j.entries))throw Error('BLOCKLIST_INVALID');
 const ids=j.entries.map(e=>e&&e.securityId);if(ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length||j.entries.some(e=>typeof e.reason!=='string'||!e.reason))throw Error('BLOCKLIST_INVALID');
 if(!/^[0-9a-f]{64}$/.test(String(j.prevMasterSha256))||!/^[0-9a-f]{64}$/.test(String(j.nextMasterSha256)))throw Error('BLOCKLIST_INVALID');
 return ids;
}
function loadBlocklist(file){
 const b=fs.readFileSync(file),j=JSON.parse(b),ids=checkBlocklist(j);
 return {ids,sha256:sha(b),prevMasterSha256:j.prevMasterSha256,nextMasterSha256:j.nextMasterSha256,entries:j.entries};
}
/** Die Sperrliste muss aus den tatsächlichen Stämmen nachgerechnet werden können (Review #1159: keine handgeschriebene Liste). */
async function reproduceBlocklist({blocklist,prevMasterFile,nextMasterFile,seriesDir}){
 const B=await import(path.join(ROOT,'scripts/market/build-security-master-identity-blocklist.mjs'));
 const pb=fs.readFileSync(prevMasterFile),nb=fs.readFileSync(nextMasterFile);
 if(sha(pb)!==blocklist.prevMasterSha256)throw Error('BLOCKLIST_FOR_OTHER_PREVIOUS_MASTER');
 if(sha(nb)!==blocklist.nextMasterSha256)throw Error('BLOCKLIST_NOT_FROM_COMMITTED_MASTER');
 const exp=B.buildBlocklist({prevMaster:JSON.parse(pb),nextMaster:JSON.parse(nb),seriesEnd:B.seriesEndReader(seriesDir),prevMasterSha256:sha(pb),nextMasterSha256:sha(nb)});
 if(JSON.stringify(exp.entries)!==JSON.stringify(blocklist.entries))throw Error('BLOCKLIST_NOT_REPRODUCIBLE');
}

/** Vergleich Titel für Titel; Abweichung außerhalb der freigegebenen IDs = UNEXPECTED_CHANGES. */
function compare({frozen,output,approvedIds=[],blocklist=null}){
 // Pflicht: dieselbe Sperrliste, mit der die neue Generation gebaut wurde (lineage.json), und Nachfolger dieser Generation
 if(!blocklist||!Array.isArray(blocklist.ids)||!/^[0-9a-f]{64}$/.test(String(blocklist.sha256)))throw Error('BLOCKLIST_REQUIRED');
 const lin=path.join(path.resolve(output),'lineage.json');
 const lineage=fs.existsSync(lin)?JSON.parse(fs.readFileSync(lin)):null;
 if(!lineage||lineage.identityBlocklist?.sha256!==blocklist.sha256)throw Error('BLOCKLIST_NOT_USED_FOR_BUILD');
 if(lineage.predecessor?.generation!==JSON.parse(fs.readFileSync(path.join(path.resolve(frozen),'release.json'))).generation)throw Error('OUTPUT_NOT_SUCCESSOR_OF_FROZEN');
 const blockedIds=blocklist.ids;
 const load=(base)=>{const r=JSON.parse(fs.readFileSync(path.join(base,'release.json')));return {generation:r.generation,dir:path.join(base,r.generation,'listings')};};
 const a=load(path.resolve(frozen)),b=load(path.resolve(output)),approved=new Set(approvedIds),blocked=new Set(blockedIds);
 const read=(dir,id)=>{const f=path.join(dir,id,'summary.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null;};
 const finance=s=>Object.fromEntries(Object.entries(s.periods||{}).map(([k,p])=>[k,{from:p.from,to:p.to,metrics:p.metrics,endCapital:p.endCapital,openPositions:p.openPositions,buyAndHold:p.buyAndHold}]));
 const classes={},rows=[];
 for(const id of fs.readdirSync(a.dir).sort()){
  const x=read(a.dir,id),y=read(b.dir,id);let c;
  if(!y)c='MISSING_IN_NEW';
  else if(x.state==='BLOCKED'&&y.state==='BLOCKED')c=JSON.stringify(x.quality.exclusionReasons)===JSON.stringify(y.quality.exclusionReasons)?'SAME_BLOCKED':'CHANGED_BLOCK_REASON';
  else if(y.state==='BLOCKED')c='NEWLY_BLOCKED';else if(x.state==='BLOCKED')c='NEWLY_AVAILABLE';
  else c=JSON.stringify(finance(x))===JSON.stringify(finance(y))?'SAME_FINANCIALS':'CHANGED_FINANCIALS';
  // eine gesperrte ID darf nur fehlen; jede andere Abweichung braucht weiter eine Freigabe
  const ok=c==='MISSING_IN_NEW'?blocked.has(id):approved.has(id)&&!blocked.has(id);
  if(blocked.has(id)&&c!=='MISSING_IN_NEW')c='BLOCKLISTED_BUT_PRESENT';
  classes[c]=(classes[c]||0)+1;if(!c.startsWith('SAME')||blocked.has(id))rows.push({securityId:id,class:c,approved:ok,reasons:y?.quality?.exclusionReasons||null});
 }
 // IDs nur in der neuen Generation: nie still (gesperrt = gebaut trotz Sperre, sonst neu im Umfang)
 for(const id of fs.existsSync(b.dir)?fs.readdirSync(b.dir).sort():[])if(!fs.existsSync(path.join(a.dir,id))){const c=blocked.has(id)?'BLOCKLISTED_BUT_PRESENT':'NEW_IN_NEW';classes[c]=(classes[c]||0)+1;rows.push({securityId:id,class:c,approved:false,reasons:null});}
 const unexpected=rows.filter(r=>!r.approved);
 return {schema:COMPARE_SCHEMA,predecessor:a.generation,successor:b.generation,classes,changed:rows,unexpected,state:unexpected.length?'UNEXPECTED_CHANGES':'ONLY_APPROVED_CHANGES'};
}

if(require.main===module){
 const [cmd,...args]=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
 const write=(file,o)=>{const p=path.resolve(file);if(['quant/data','discover/data','supertrader/data','social/data'].some(d=>inside(path.join(ROOT,d),p)))throw Error('OUT_IN_GENERATED_DATA_PATH');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(o,null,1)+'\n');};
 const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 // Schalter mit Wert: fehlt der Wert oder folgt ein weiterer Schalter, Abbruch statt stiller Standard
 const need=k=>{const v=get(k);if(!v||v.startsWith('--'))throw Error('BLOCKLIST_REQUIRED');return v;};
 (async()=>{try{
  if(cmd==='repo-manifest'){if(!get('--out'))throw Error('OUT_REQUIRED');const m=repoManifest({sourceCommit:get('--source-commit')});write(get('--out'),m);console.log(`[freeze] ${m.frozen.count} Dateien, filesSha256 ${m.frozen.filesSha256}`);}
  else if(cmd==='verify-repo'){const r=verifyRepo(json(get('--manifest')));console.log(JSON.stringify(r));if(r.state!=='INTACT')process.exitCode=1;}
  else if(cmd==='freeze'){if(!get('--out'))throw Error('OUT_REQUIRED');const m=freeze({generations:get('--generations')});write(get('--out'),m);console.log(`[freeze] ${m.count} Dateien, Generation ${m.release.generation}, filesSha256 ${m.filesSha256}`);}
  else if(cmd==='verify'){const r=verify({generations:get('--generations'),manifest:json(get('--manifest'))});console.log(JSON.stringify(r));if(r.state!=='INTACT')process.exitCode=1;}
  else if(cmd==='build-post-switch'){
   // die Sperrliste wird aus dem alten Stamm (Bytes = masterHash der eingefrorenen Generation) und dem committeten neuen
   // Stamm nachgerechnet; nur eine reproduzierbare Liste gilt
   const manifest=json(get('--manifest')),blocklist=loadBlocklist(need('--blocklist'));
   const prevFile=need('--prev-master');if(sha(fs.readFileSync(prevFile,'utf8'))!==manifest.release.masterHash)throw Error('PREV_MASTER_NOT_FROZEN_MASTER');
   await reproduceBlocklist({blocklist,prevMasterFile:prevFile,nextMasterFile:path.join(ROOT,MASTER),seriesDir:get('--series-dir')||path.join(ROOT,'quant/data/market/discover-series')});
   console.log(JSON.stringify(buildPostSwitch({frozen:get('--frozen'),manifest,output:get('--output'),ids:get('--ids')?.split(',')||null,blocklist})));}
  else if(cmd==='compare'){if(!get('--out'))throw Error('OUT_REQUIRED');// mehrere --approved zulässig
  const files=args.flatMap((a,i)=>a==='--approved'?[args[i+1]]:[]);if(files.some(f=>!f||f.startsWith('--')))throw Error('APPROVED_FILE_REQUIRED');
  // Freigabelisten 1.0.0 und 1.1.0 (#1143): jede dort genannte securityId gilt als erwartete Änderung
  const blocklist=loadBlocklist(need('--blocklist'));
  // Freigabelisten nur mit bekanntem Schema und, wo vorhanden, an denselben alten Stamm gebunden (Review #1159)
  const lists=files.map(json);for(const ap of lists){if(!['security-master-approved-changes-1.0.0','security-master-approved-changes-1.1.0'].includes(ap.schema))throw Error('APPROVED_SCHEMA_UNKNOWN');if(ap.prevMasterSha256!==blocklist.prevMasterSha256)throw Error('APPROVED_FOR_OTHER_PREVIOUS_MASTER');}
  const ids=lists.flatMap(ap=>['instrumentTypeChanges','eligibilityFlips','canonicalIdChanges','deactivations','tickerChanges','nameChanges'].flatMap(k=>(ap[k]||[]).map(x=>x.securityId)));
  const r=compare({frozen:get('--frozen'),output:get('--output'),approvedIds:[...new Set(ids)],blocklist});write(get('--out'),r);console.log(JSON.stringify({state:r.state,classes:r.classes}));if(r.state!=='ONLY_APPROVED_CHANGES')process.exitCode=1;}
  else throw Error('UNKNOWN_COMMAND');
 }catch(e){console.error(e.message);process.exitCode=2;}})();
}
module.exports={NOT_FROZEN,NOT_FROZEN_DOC,checkBlocklist,reproduceBlocklist,BLOCKLIST_GENERATOR,repoManifest,verifyRepo,freeze,verify,buildPostSwitch,compare,loadBlocklist,BLOCKLIST_SCHEMA,FROZEN_DIRS,TARGET_MASTER_VERSION};
