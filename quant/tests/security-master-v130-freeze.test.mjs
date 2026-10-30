// Klassifiziererwechsel 1.1.0 -> 1.3.0 (Owner P2): historische Quant-Ergebnisse vor jedem Wechsel unveränderlich,
// Ergebnisse nach dem Wechsel nur als neue Generation in einer neuen privaten Wurzel. Alles in tmpdir, nichts im Repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'../..');
const F=require('../../scripts/quant/backtest-generation-freeze.cjs'),{materialize}=require('../../scripts/quant/materialize-real-backtest-read.cjs');
const MANIFEST='docs/data/security-master/v130-quant-freeze.json',MASTER='quant/data/market/security-master/us-security-master.json';
const sha=b=>createHash('sha256').update(b).digest('hex');

test('SMF-1 · eingefrorene Quant-Evidenz V5.1–V13c ist bytegleich und vollständig (neue Dateien erlaubt)',()=>{
 const m=JSON.parse(fs.readFileSync(join(root,MANIFEST),'utf8'));
 assert.ok(Object.hasOwn(m.frozen.files,'docs/quant-recovery/BACKTEST_V51.md'),'V5.1-Hauptbericht eingefroren');
 assert.equal(m.schema,'quant-v130-repository-freeze-1.0.0');assert.ok(m.frozen.count>=240);assert.equal(Object.keys(m.frozen.files).length,m.frozen.count);
 assert.equal(sha(JSON.stringify(m.frozen.files)),m.frozen.filesSha256,'Manifest selbst unverändert');
 assert.deepEqual(F.verifyRepo(m,{root}),{state:'INTACT',changed:[],missing:[]});
 // jede abgeschlossene Generation ist erfasst, seit der V13-Übergabe auch V10–V13c und ihre Berichte
 for(const d of ['v6','v7','v8','v9','v9-followups','v51','methodology-v1','v10','v11','v12','v13','v13b','v13c'])assert.ok(Object.keys(m.frozen.files).some(p=>p.startsWith('docs/quant-recovery/'+d+'/')),d);
 for(const f of ['BACKTEST_V10_FINAL.md','ALPHA_DISCOVERY_V11.md','DATA_QUALITY_V12_FINAL.md','DATA_QUALITY_V13_FINAL.md','HANDOVER_V13.md'])assert.ok(Object.hasOwn(m.frozen.files,'docs/quant-recovery/'+f),f);
 // jede Datei in den eingefrorenen Generationen ist im Manifest; neue Generationen (neue Verzeichnisse, neue Berichte) bleiben möglich
 const gens=[...new Set(Object.keys(m.frozen.files).filter(p=>/^docs\/quant-recovery\/[^/]+\//.test(p)).map(p=>p.split('/').slice(0,3).join('/')))];
 const all=[];const walk=d=>{for(const e of fs.readdirSync(join(root,d),{withFileTypes:true}))e.isDirectory()?walk(d+'/'+e.name):all.push(d+'/'+e.name);};for(const g of gens)walk(g);
 assert.deepEqual(all.filter(p=>!Object.hasOwn(m.frozen.files,p)).sort(),[]);
});

test('SMF-2 · Ausgangsstamm des Freeze = Ausgangsstamm der Sonderfreigabe; masterHash-Vertrag unverändert, kein Inhalts-Fingerabdruck',()=>{
 const m=JSON.parse(fs.readFileSync(join(root,MANIFEST),'utf8')),ap=JSON.parse(fs.readFileSync(join(root,'docs/data/security-master/v130-approved-changes.json'),'utf8'));
 assert.equal(m.preSwitchMaster.sha256,ap.prevMasterSha256);assert.equal(m.preSwitchMaster.version,'us-security-master-1.1.0');
 const src=fs.readFileSync(join(root,'scripts/quant/backtest-generation-freeze.cjs'),'utf8');
 assert.equal(/require\([^)]*security-master-content-hash/.test(src),false);assert.equal(/contentHash\(/.test(src),false);
 const A=require('../engines/weekly-real-adapter.cjs');assert.equal(A.createLoader(root).masterHash,sha(fs.readFileSync(join(root,MASTER))));
 // Erzeuger sind die einzigen Schreiber: das Skript verweigert Ausgaben in generierte Datenpfade
 for(const d of ['quant/data','discover/data','supertrader/data','social/data'])assert.ok(src.includes(`'${d}'`),d);
});

// Fixture wie backtest-refresh.test.mjs: echte Reihen, echter Erzeuger, aber alles in tmpdir
const folder=fs.mkdtempSync(join(tmpdir(),'vu-v130-freeze-')),fixture=join(folder,'source'),oldRoot=join(folder,'private-1.1.0'),newRoot=join(folder,'private-1.3.0');
const LOST='ref_ACGLO',ids=['ref_NVDA','ref_MSFT','ref_XOM',LOST];
const copy=p=>{const to=join(fixture,p);fs.mkdirSync(dirname(to),{recursive:true});fs.cpSync(join(root,p),to,{recursive:true});};
for(const p of ['quant/engines','quant/api','quant/methodology','quant/data/universe/instruments',MASTER,'quant/data/market/multi-asset/series/SPY.json','quant/data/market/multi-asset/instruments.json','quant/data/market/discover-series/ref_SPY.json','scripts/quant/materialize-real-backtest-read.cjs','scripts/quant/run-real-weekly-backtest.cjs','scripts/quant/contracts/weekly-execution-model-v2.json','quant/config/development-preview.json','quant/config/feature-gates.json'])copy(p);
for(const id of ids)copy('quant/data/market/discover-series-long/'+id+'.json');
test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
let manifest,old;

test('SMF-3 · Freeze der privaten Generation: jede Datei mit SHA-256, Snapshot geprüft, Manipulation wird erkannt',()=>{
 old=materialize({root:fixture,output:oldRoot,ids});assert.equal(old.state,'COMPLETE');
 manifest=F.freeze({generations:oldRoot});assert.equal(manifest.release.generation,old.generation);assert.equal(manifest.release.masterHash,sha(fs.readFileSync(join(fixture,MASTER),'utf8')));
 assert.equal(F.verify({generations:oldRoot,manifest}).state,'INTACT');
 const f=join(oldRoot,old.generation,'listings/ref_NVDA/summary.json'),b=fs.readFileSync(f);
 fs.writeFileSync(f,b.toString().replace('"NOT_CERTIFIED"','"NOT_CERTIFIED" ')); assert.deepEqual(F.verify({generations:oldRoot,manifest}).changed,[old.generation+'/listings/ref_NVDA/summary.json']);
 fs.writeFileSync(f,b);fs.writeFileSync(join(oldRoot,'extra.json'),'{}');assert.deepEqual(F.verify({generations:oldRoot,manifest}).added,['extra.json']);fs.rmSync(join(oldRoot,'extra.json'));
 assert.throws(()=>F.freeze({generations:join(root,'quant')}),/PRIVATE_OUTSIDE_REPOSITORY/);
});

test('SMF-4 · vor dem Wechsel verweigert: gleicher Stamm, gleiche oder verschachtelte Wurzel',()=>{
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:newRoot}),/MASTER_NOT_SWITCHED/);
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:oldRoot}),/SEPARATE_ROOT/);
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:join(oldRoot,'next')}),/SEPARATE_ROOT/);
 // Review #1100: Symlink auf die eingefrorene Wurzel, Symlink darin, Name mit führenden Punkten
 fs.symlinkSync(oldRoot,oldRoot+'-link');assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:oldRoot+'-link'}),/SEPARATE_ROOT/);
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:join(oldRoot+'-link','neu')}),/SEPARATE_ROOT/);
 fs.mkdirSync(oldRoot+'-mix');fs.symlinkSync(join(oldRoot,old.generation),join(oldRoot+'-mix',old.generation));assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:oldRoot+'-mix'}),/SEPARATE_ROOT/);
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:join(oldRoot,'..next')}),/SEPARATE_ROOT/);
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:join(oldRoot,old.generation),manifest,output:oldRoot+'-x'}),/FROZEN_GENERATION_CHANGED/);
 assert.equal(fs.existsSync(newRoot),false);
});

test('SMF-5 · nach dem Wechsel: neue Generation in neuer Wurzel, alte bytegleich, nur die freigegebenen IDs ändern sich',async()=>{
 const {reclassify}=await import('../../scripts/market/security-master-v130-evidence.mjs');
 const prev=JSON.parse(fs.readFileSync(join(fixture,MASTER),'utf8')),next=reclassify(prev,JSON.parse(fs.readFileSync(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'),'utf8')).securities);
 const oldPointer=fs.readFileSync(join(oldRoot,'release.json'));
 fs.writeFileSync(join(fixture,MASTER),JSON.stringify({...prev,version:next.version,rows:next.rows}));
 // ein Erzeuger, der in die eingefrorene Wurzel schreibt, wird nach dem Lauf erkannt
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:newRoot+'-bad',materializeFn:o=>{fs.writeFileSync(join(oldRoot,'release.json'),'{}');return {generation:'0'.repeat(64)};}}),/CHANGED_DURING_BUILD/);
 fs.writeFileSync(join(oldRoot,'release.json'),oldPointer);
 const lineage=F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:newRoot});
 assert.notEqual(lineage.successor.generation,old.generation);assert.equal(lineage.successor.masterVersion,'us-security-master-1.3.0');assert.equal(lineage.predecessor.generation,old.generation);
 assert.deepEqual(lineage.frozenRootVerified,{before:'INTACT',after:'INTACT'});assert.equal(lineage.publiclyActivated,false);assert.equal(lineage.readerSwitch,'OWNER_STEP_NOT_PERFORMED');
 assert.deepEqual(fs.readFileSync(join(oldRoot,'release.json')),oldPointer,'alter Zeiger unverändert');assert.equal(F.verify({generations:oldRoot,manifest}).state,'INTACT');
 const approved=JSON.parse(fs.readFileSync(join(root,'docs/data/security-master/v130-approved-changes.json'),'utf8')).instrumentTypeChanges.map(x=>x.securityId);
 assert.ok(approved.includes(LOST));
 const cmp=F.compare({frozen:oldRoot,output:newRoot,approvedIds:approved});
 assert.equal(cmp.state,'ONLY_APPROVED_CHANGES',JSON.stringify(cmp.unexpected));assert.deepEqual(cmp.changed.map(x=>x.securityId),[LOST]);assert.equal(cmp.changed[0].class,'NEWLY_BLOCKED');
 assert.equal(cmp.classes.SAME_FINANCIALS,3);
 // ohne Freigabeliste ist dieselbe Änderung unerwartet (fail closed)
 assert.equal(F.compare({frozen:oldRoot,output:newRoot}).state,'UNEXPECTED_CHANGES');
 // zweiter Lauf in dieselbe neue Wurzel ist erlaubt (Wiederaufnahme), eine eingefrorene Generation darin nie
 fs.cpSync(join(oldRoot,old.generation),join(newRoot+'-copy',old.generation),{recursive:true});
 assert.throws(()=>F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:newRoot+'-copy'}),/FROZEN_GENERATION_IN_OUTPUT/);
});

test('SMF-6 · Identitätssperre: gesperrte IDs fehlen in der neuen Generation, der Vergleich verlangt genau das, Formfehler brechen ab',()=>{
 const STOP='ref_MSFT',bl=join(folder,'identity-blocklist.json');
 fs.writeFileSync(bl,JSON.stringify({schema:F.BLOCKLIST_SCHEMA,entries:[{securityId:STOP,reason:'START_DATE_CHANGED'}]}));
 const lineage=F.buildPostSwitch({root:fixture,frozen:oldRoot,manifest,output:newRoot+'-bl',blocklist:F.loadBlocklist(bl)});
 assert.deepEqual(lineage.identityBlocklist.excludedFromScope,[STOP]);assert.equal(lineage.identityBlocklist.count,1);assert.match(lineage.identityBlocklist.sha256,/^[0-9a-f]{64}$/);
 assert.equal(fs.existsSync(join(newRoot+'-bl',lineage.successor.generation,'listings',STOP)),false,'gesperrte ID nicht gebaut');
 assert.equal(F.verify({generations:oldRoot,manifest}).state,'INTACT');
 const approved=JSON.parse(fs.readFileSync(join(root,'docs/data/security-master/v130-approved-changes.json'),'utf8')).instrumentTypeChanges.map(x=>x.securityId);
 const ok=F.compare({frozen:oldRoot,output:newRoot+'-bl',approvedIds:approved,blockedIds:[STOP]});
 assert.equal(ok.state,'ONLY_APPROVED_CHANGES',JSON.stringify(ok.unexpected));assert.deepEqual(ok.changed.find(x=>x.securityId===STOP),{securityId:STOP,class:'MISSING_IN_NEW',approved:true,reasons:null});
 // ohne Sperrliste ist das Fehlen unerwartet; eine Freigabe ersetzt die Sperre nicht
 assert.equal(F.compare({frozen:oldRoot,output:newRoot+'-bl',approvedIds:approved}).state,'UNEXPECTED_CHANGES');
 assert.equal(F.compare({frozen:oldRoot,output:newRoot+'-bl',approvedIds:[...approved,STOP]}).state,'UNEXPECTED_CHANGES');
 // gesperrt, aber gebaut (Neubau ohne Sperrliste) = unerwartet, auch wenn die ID freigegeben wäre
 const present=F.compare({frozen:oldRoot,output:newRoot,approvedIds:[...approved,STOP],blockedIds:[STOP]});
 assert.equal(present.state,'UNEXPECTED_CHANGES');assert.equal(present.unexpected.find(x=>x.securityId===STOP).class,'BLOCKLISTED_BUT_PRESENT');
 for(const bad of [{},{schema:F.BLOCKLIST_SCHEMA,entries:[]},{schema:F.BLOCKLIST_SCHEMA,entries:[{securityId:STOP,reason:'x'},{securityId:STOP,reason:'y'}]},{schema:F.BLOCKLIST_SCHEMA,entries:[{securityId:'',reason:'x'}]},{schema:'x',entries:[{securityId:STOP,reason:'x'}]}]){
  fs.writeFileSync(bl,JSON.stringify(bad));assert.throws(()=>F.loadBlocklist(bl),/BLOCKLIST_INVALID/);
 }
});
