// Generationenmanifest der Auslieferung: /core/release-manifest.json (ADR-008, nur Auslieferung, nie committet).
//
// Es benennt, mit welchem Code und welchen Daten ein Release gebaut wurde:
//   code.sha, dataBranch.sha, je Datenart (core/registry/domains.json + Datenzweig-Pfade) Pfad + Inhaltshash,
//   Erzeuger-Version, Security-Master- und Company-Intelligence-Generation und ein Gesamthash der Nutzdaten.
//
// NUTZDATENHASH: Er laeuft ueber (Datenart, Pfad, Inhaltshash) und NICHT ueber variable Metadaten. Je JSON-Datei
// werden vor dem Hashen die Schluessel aus VOLATILE_KEYS (Spitzenebene) und die Zeitstempelfelder des Vertrags
// (domains.json, Feld timestamp) entfernt; das Manifest nennt sie unter `volatile`. `bytesSha256` je Datei bleibt
// daneben stehen (roher Stand), geht aber nicht in `payloadHash` ein.
//
// Aufruf: node scripts/vu2/release-manifest.mjs --site=<Release-Ordner> [--stage=SEALED] [--data-branch-sha=<sha>]
//         (pages-release.yml: nach dem Datenzweig-Overlay und dem Stempeln, schreibt das Manifest neu).
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

export const SCHEMA='vu-release-manifest-1';
export const MANIFEST_PATH='core/release-manifest.json';
export const VOLATILE_KEYS=['generatedAt','generated_at','generated_at_utc','generatedAtUtc','checkedAt','updatedAt','fetchedAt','lastUpdate','builtAt','runId'];
export const VERSION_KEYS=['version','moduleVersion','schemaVersion','schema','contractVersion','methodologyVersion','engineVersion'];
export const STAGES=['BUILT','SEALED'];
const sha=b=>createHash('sha256').update(b).digest('hex');

const stripPath=(obj,path)=>{const p=path.split('.'),last=p.pop();let o=obj;for(const k of p){if(!o||typeof o!=='object')return;o=o[k];}if(o&&typeof o==='object')delete o[last];};
/* Stabile Darstellung: Schluessel sortiert, damit nur der Inhalt zaehlt. */
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;

export function payloadDigest(bytes,{path='',timestamp=[]}={}){
 const raw=sha(bytes);
 if(!/\.json(\.gz)?$/.test(path))return {bytesSha256:raw,payloadSha256:raw,json:false};
 let j;
 try{j=JSON.parse((path.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'));}catch{return {bytesSha256:raw,payloadSha256:raw,json:false};}
 if(j&&typeof j==='object'&&!Array.isArray(j)){for(const k of VOLATILE_KEYS)delete j[k];for(const t of timestamp)stripPath(j,t);}
 return {bytesSha256:raw,payloadSha256:sha(JSON.stringify(canon(j))),json:true,j};
}

/** Datenarten und ihre Auslieferungspfade: Vertragsartefakt (domains.json) plus Dateien des Datenzweigs. */
export function dataTypes(root){
 const reg=JSON.parse(readFileSync(resolve(root,'core/registry/domains.json'),'utf8')).domains||[];
 const out=[],seen=new Set();
 for(const d of reg)if(d.artifact){const path=String(d.artifact).replace(/^\//,'');out.push({id:d.id,path,timestamp:d.timestamp||[]});seen.add(path);}
 let branch={domains:[]};try{branch=JSON.parse(readFileSync(resolve(root,'core/registry/data-branch.json'),'utf8'));}catch{}
 for(const d of branch.domains||[])for(const p of d.paths||[])if(!seen.has(p)){seen.add(p);out.push({id:`${d.id}:${p}`,path:p,timestamp:[]});}
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}

export function hashDataTypes({root,site}){
 const entries=[];
 for(const t of dataTypes(root)){
  const file=resolve(site,t.path);
  if(!existsSync(file)){entries.push({id:t.id,path:t.path,state:'ABSENT'});continue;}
  const d=payloadDigest(readFileSync(file),{path:t.path,timestamp:t.timestamp});
  const e={id:t.id,path:t.path,state:'PRESENT',bytesSha256:d.bytesSha256,payloadSha256:d.payloadSha256};
  if(d.json&&d.j&&typeof d.j==='object'){const v=VERSION_KEYS.map(k=>[k,d.j[k]]).find(([,x])=>typeof x==='string');if(v)e.producerVersion=`${v[0]}=${v[1]}`;}
  entries.push(e);
 }
 return entries;
}
/** Gesamthash: Datenart, Pfad und Inhaltshash in fester Reihenfolge; eine fehlende Datenart geht als ABSENT ein. */
export function totalPayloadHash(entries){
 const h=createHash('sha256');
 for(const e of [...entries].sort((a,b)=>a.id.localeCompare(b.id)))h.update(`${e.id}\0${e.path}\0${e.state==='PRESENT'?e.payloadSha256:'ABSENT'}\n`);
 return h.digest('hex');
}

const readJson=f=>{try{return JSON.parse(readFileSync(f,'utf8'));}catch{return null;}};
function codeSha(root){
 if(process.env.VU_CODE_SHA)return process.env.VU_CODE_SHA;
 try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}
}
/* Der Datenzweig-Stand, den seed-data-branch.sh eingespielt hat (Datei im .git-Verzeichnis, nie im Arbeitsbaum). */
function dataBranchSha(root,given){
 if(given)return given;
 if(process.env.VU_DATA_BRANCH_SHA)return process.env.VU_DATA_BRANCH_SHA;
 try{
  const p=execFileSync('git',['rev-parse','--git-path','vu-data-branch.sha'],{cwd:root,encoding:'utf8'}).trim();
  return readFileSync(resolve(root,p),'utf8').trim()||null;
 }catch{return null;}
}

export function buildManifest({root,site,stage='BUILT',dataBranchSha:given=null,builtAt=new Date().toISOString()}){
 const entries=hashDataTypes({root,site});
 const elig=entries.find(e=>e.id==='securityMaster'&&e.state==='PRESENT');
 const eligJson=elig?readJson(resolve(site,elig.path)):null;
 const approval=readJson(resolve(root,'company-intelligence/config/production-approval.json'))||{};
 const ciIndex=readJson(resolve(site,'company-intelligence/data/index.json'));
 return {
  schema:SCHEMA,stage,builtAt,
  code:{sha:codeSha(root)},
  dataBranch:{name:readJson(resolve(root,'core/registry/data-branch.json'))?.branch||null,sha:dataBranchSha(root,given)},
  securityMasterGeneration:elig?{version:eligJson?.version||null,classificationRuleVersion:eligJson?.classificationRuleVersion||null,payloadSha256:elig.payloadSha256}:null,
  companyIntelligenceGeneration:{approvedGeneration:approval.consumerGeneration||null,acceptedGeneration:approval.acceptedGeneration||null,
   deliveredState:ciIndex?.state||null,deliveredGeneration:ciIndex?.generation||ciIndex?.consumerGeneration||null},
  volatile:{note:'Nicht im payloadHash: variable Metadaten (Zeitstempel). Je Datei stehen bytesSha256 (roh) und payloadSha256 (ohne diese Felder).',keys:VOLATILE_KEYS,contractTimestampPaths:'domains.json -> timestamp'},
  payloadHash:totalPayloadHash(entries),
  dataTypes:entries
 };
}
export function writeManifest(opts){
 const m=buildManifest(opts),file=resolve(opts.site,MANIFEST_PATH);
 mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(m,null,1)+'\n');return m;
}
/** Vergleich zweier Manifeste (CI gegen Pages): gleiche Nutzdaten? Nennt die abweichenden Datenarten. */
export function comparePayload(a,b){
 const by=m=>new Map((m.dataTypes||[]).map(e=>[e.id,e]));
 const A=by(a),B=by(b),diff=[];
 for(const id of new Set([...A.keys(),...B.keys()])){
  const x=A.get(id),y=B.get(id);
  if(!x||!y)diff.push({id,reason:'MISSING_TYPE'});
  else if(x.path!==y.path)diff.push({id,reason:'PATH_SWAPPED'});
  else if(x.state!==y.state)diff.push({id,reason:'STATE_DIFFERS'});
  else if(x.payloadSha256!==y.payloadSha256)diff.push({id,reason:'CONTENT_DIFFERS'});
 }
 return {equal:a.payloadHash===b.payloadHash&&!diff.length,diff};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
 const site=arg('site');if(!site)throw Error('SITE_REQUIRED');
 const stage=arg('stage')||'SEALED';if(!STAGES.includes(stage))throw Error('INVALID_STAGE');
 const m=writeManifest({root:process.cwd(),site:resolve(site),stage,dataBranchSha:arg('data-branch-sha')||null});
 console.log(JSON.stringify({stage:m.stage,codeSha:m.code.sha,dataBranchSha:m.dataBranch.sha,payloadHash:m.payloadHash,absent:m.dataTypes.filter(e=>e.state==='ABSENT').length,types:m.dataTypes.length}));
}
