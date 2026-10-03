// Capture the current canonical source before a periodic shadow refresh.
// Private fingerprints and identities only; no provider bodies or prices copied.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,existsSync,mkdtempSync,renameSync,rmSync,realpathSync} from 'node:fs';
import {resolve,join,relative,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {buildUniverse} from '../screener/build-universe.mjs';

const DIRECTORIES=['quant/data','discover/data','discover/logos','supertrader/data','screener/data','dashboard/config','quant/config'];
const BUDGET='scripts/vu2/resource-budget.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blobOid=bytes=>createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
function plain(path){const stat=lstatSync(path);if(stat.isSymbolicLink()||stat.isFile()&&stat.nlink>1)throw Error('BASELINE_LINK_UNSAFE:'+path);return stat;}
function ancestors(path){for(let current=path;;current=dirname(current)){if(existsSync(current)){if(lstatSync(current).isSymbolicLink())throw Error('BASELINE_LINK_UNSAFE:'+current);}else{try{lstatSync(current);throw Error('BASELINE_LINK_UNSAFE:'+current);}catch(e){if(e.code!=='ENOENT')throw e;}}if(dirname(current)===current)break;}}
function list(root){const files=[];function walk(path){const stat=plain(join(root,path));if(stat.isDirectory())for(const name of readdirSync(join(root,path)).sort())walk(path+'/'+name);else if(stat.isFile())files.push(path);else throw Error('BASELINE_FILE_TYPE_UNSAFE:'+path);}
 for(const dir of DIRECTORIES){ancestors(join(root,dir));if(existsSync(join(root,dir)))walk(dir);}ancestors(join(root,BUDGET));walk(BUDGET);return files.sort();}
function fingerprints(root){return list(root).map(path=>{const bytes=readFileSync(join(root,path)),stat=plain(join(root,path));return {path,gitBlobOid:blobOid(bytes),bytes:bytes.length,mode:stat.mode&0o111?'100755':'100644',sha256:sha(bytes)};});}
const load=path=>{plain(path);const raw=readFileSync(path);return JSON.parse(path.endsWith('.gz')?gunzipSync(raw):raw);};
function sourceCommit(root){return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}

export async function captureCurrentBaseline({root=process.cwd(),out=join(root,'.market-cache/tiingo2-qa/current-baseline'),buildScreener=buildUniverse}={}){
 root=realpathSync(root);out=resolve(out);const target=relative(root,out);
 if(!target.startsWith('.market-cache'+sep)||target.split(sep).includes('..'))throw Error('PRIVATE_CURRENT_BASELINE_REQUIRED');
 ancestors(out);if(existsSync(out)){plain(out);if(!lstatSync(out).isDirectory())throw Error('BASELINE_DIRECTORY_REQUIRED');}
 const commit=sourceCommit(root),files=fingerprints(root),read=path=>load(join(root,path));
 const rows=(path,key)=>{const result=read(path)[key];if(!Array.isArray(result))throw Error('INVALID_CURRENT_CANONICAL_ARRAY:'+path);return result;};
 const instruments=files.filter(f=>/^quant\/data\/universe\/instruments\/.+\.json$/.test(f.path)).flatMap(f=>rows(f.path,'instruments'));
 if(new Set(instruments.map(row=>row.instrumentId)).size!==instruments.length)throw Error('DUPLICATE_CURRENT_INSTRUMENT_ID');
 const manifest=read('quant/data/universe/search/manifest.json'),searchManifest={},searchIdentities={};
 for(const kind of ['sym','name']){if(!Array.isArray(manifest[kind]))throw Error('INVALID_CURRENT_SEARCH_MANIFEST');searchManifest[kind]=manifest[kind];searchIdentities[kind]={};
  for(const entry of manifest[kind]){if(!/^[A-Z0-9_-]+$/.test(entry.shard))throw Error('INVALID_SEARCH_SHARD');const path='quant/data/universe/search/'+kind+'/'+entry.shard+'.json';const entries=rows(path,'entries');if(entries.length!==entry.count)throw Error('CURRENT_SEARCH_SHARD_COUNT_MISMATCH:'+path);searchIdentities[kind][path]=entries.map(({i,s})=>({i,s}));}}
 const screening=read('quant/data/product/factor-evidence-v1/screening.json.gz');
 const identities={schemaVersion:'tiingo2-productization-baseline-identities-1',sourceCommit:commit,
  raw:rows('quant/data/market/scale/universe-FULL_UNIVERSE.json','securities').map(({securityId,ticker})=>({securityId,ticker})),
  eligibility:rows('quant/data/market/security-master/eligibility.json','decisions').map(({securityId,ticker,product_eligibility,instrument_type})=>({securityId,ticker,product_eligibility,instrument_type})),
  marketFactors:rows('quant/data/market/factors/factors-FULL_UNIVERSE.json','securities').map(({securityId,ticker})=>({securityId,ticker})),
  capability:rows('quant/data/universe/market-capability.json','members').map(({m,s,i})=>({m,s,i})),
  factorDnaSymbols:Object.keys(screening.rows??{}).sort(),instruments,searchManifest,searchIdentities,logos:read('discover/logos/index.json')};
 const rankRows={};for(const f of files.filter(f=>/^discover\/data\/(?:rows\/US_REAL\/.+|home\/US_REAL(?:\.\d+)?)\.json$/.test(f.path))){const row=read(f.path);rankRows[f.path]=row.surfaces?{surfaces:row.surfaces.map(s=>({id:s.id,symbols:(s.cards??[]).map(c=>c.symbol)}))}:{sort:row.sort,direction:row.direction,symbols:(row.cards??[]).map(c=>c.symbol)};}
 const screenerPath='screener/data/universe-US_REAL.json',hasStored=existsSync(join(root,screenerPath));
 const screener=hasStored?read(screenerPath):await buildScreener({root,log:()=>{}});
 if(!Array.isArray(screener.cols?.s)||new Set(screener.cols.s).size!==screener.cols.s.length)throw Error('INVALID_CURRENT_SCREENER_MEMBERSHIP');
 // The read-only builder stamps wall-clock generatedAt; it is not a source
 // change. Preserve exact stored bytes, but omit only that transient field
 // when fingerprinting an in-memory serving projection.
 const {generatedAt:runtimeGeneratedAt,...deterministicScreener}=screener;
 const screenBytes=hasStored?readFileSync(join(root,screenerPath)):Buffer.from(JSON.stringify(deterministicScreener));
 const artifacts={
  'protected-baseline-files.json.gz':gzipSync(Buffer.from(JSON.stringify({schemaVersion:'tiingo2-productization-current-fingerprints-1',sourceCommit:commit,files}))),
  'baseline-identities.json.gz':gzipSync(Buffer.from(JSON.stringify(identities))),
  'baseline-rank-populations.json':Buffer.from(JSON.stringify({schemaVersion:'tiingo2-productization-baseline-rank-populations-1',sourceCommit:commit,scope:'CURRENT_CANONICAL_POPULATION',rows:rankRows})+'\n'),
  'generated-screener-baseline.json':Buffer.from(JSON.stringify({schemaVersion:'tiingo2-productization-generated-screener-baseline-1',sourceCommit:commit,artifactPath:screenerPath,artifactSha256:sha(screenBytes),artifactBytes:screenBytes.length,fingerprintBasis:hasStored?'EXACT_STORED_BYTES':'CANONICAL_JSON_EXCLUDING_RUNTIME_GENERATED_AT',count:screener.cols.s.length,columns:screener.columns??null,symbols:screener.cols.s,scope:hasStored?'CURRENT_STORED_CANONICAL_SCREENER':'EXISTING_READ_ONLY_CANONICAL_SCREENER_BUILDER'})+'\n')};
 if(commit!==sourceCommit(root)||JSON.stringify(files)!==JSON.stringify(fingerprints(root)))throw Error('CURRENT_SOURCE_CHANGED_DURING_BASELINE_CAPTURE');
 const summary={schemaVersion:'tiingo2-productization-current-baseline-1',sourceCommit:commit,scope:'ACTUAL_CURRENT_CANONICAL_SOURCE_BEFORE_PRODUCERS',protectedFiles:files.length,counts:{raw:identities.raw.length,instruments:instruments.length,capability:identities.capability.length,factorDna:identities.factorDnaSymbols.length,screener:screener.cols.s.length},artifacts:Object.fromEntries(Object.entries(artifacts).map(([name,bytes])=>[name,{sha256:sha(bytes),bytes:bytes.length}])),sourceUnchangedAfterCapture:true,rawProviderBodiesCopied:false};
 artifacts['current-baseline.json']=Buffer.from(JSON.stringify(summary,null,2)+'\n');
 if(existsSync(out)){for(const[name,bytes]of Object.entries(artifacts)){const path=join(out,name);if(!existsSync(path)||!plain(path).isFile()||!readFileSync(path).equals(bytes))throw Error('BASELINE_ALREADY_CAPTURED_DIFFERENT_SOURCE');}return summary;}
 mkdirSync(dirname(out),{recursive:true,mode:0o700});ancestors(dirname(out));const temporary=mkdtempSync(join(dirname(out),'.current-baseline-'));
 try{for(const[name,bytes]of Object.entries(artifacts))writeFileSync(join(temporary,name),bytes,{mode:0o600});renameSync(temporary,out);}finally{if(existsSync(temporary))rmSync(temporary,{recursive:true,force:true});}
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--root','--out'].includes(key)||!process.argv[i+1]||args[key.slice(2)])throw Error('INVALID_BASELINE_ARGUMENT');args[key.slice(2)]=process.argv[i+1];}
 captureCurrentBaseline(args).then(r=>console.log(JSON.stringify({sourceCommit:r.sourceCommit,protectedFiles:r.protectedFiles,counts:r.counts}))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
