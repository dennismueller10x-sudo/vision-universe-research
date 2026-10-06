/** Fixed-input guard: production files are read, never written by this run. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export const protectedPaths=['quant/data','discover/data','discover/logos','supertrader/data','social/data','vorsorge','quant/config','quant/engines','scripts/quant','scripts/universe','scripts/technical','scripts/supertrader','api','worker','workers','worker-waker','server','.github/workflows'];
const sha=s=>createHash('sha256').update(s).digest('hex');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export function snapshot(root,ref){
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
 const commit=git('rev-parse',ref).trim();
 const paths=Object.fromEntries(protectedPaths.map(p=>[p,sha(git('ls-tree','-r',commit,'--',p))]));
 const relevant=['quant/data/market/security-master/eligibility.json','quant/data/universe/master-manifest.json','quant/data/market/factors/factors-FULL_UNIVERSE-summary.json','discover/data/meta.json','supertrader/data/build.json','core/registry/domains.json'];
 const semantics={};for(const p of relevant){try{const v=JSON.parse(git('show',commit+':'+p));semantics[p]={sha256:sha(JSON.stringify(canonical(v))),schemaVersion:v.schemaVersion||v.schema||null,asOf:v.asOf||null,generatedAt:v.generatedAt||v.generated_at_utc||null,records:Array.isArray(v.decisions)?v.decisions.length:null};}catch{semantics[p]={state:'MISSING_AT_BASELINE'};}}
 return {schemaVersion:'de-eu-baseline-1.0.0',mainSHA:commit,protectedTreeChecksums:paths,semanticChecksums:semantics};
}
export function compare(root,baseline,ref){const current=snapshot(root,ref);return {baselineSHA:baseline.mainSHA,comparedSHA:current.mainSHA,changedProtectedGroups:protectedPaths.filter(p=>baseline.protectedTreeChecksums[p]!==current.protectedTreeChecksums[p])};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
 const root=resolve(arg('root')||'.'),out=arg('out');if(!out)throw Error('EXPLICIT_OUTPUT_REQUIRED');
 const result=arg('baseline')?compare(root,JSON.parse(readFileSync(arg('baseline'),'utf8')),arg('ref')||'HEAD'):snapshot(root,arg('ref')||'origin/main');
 mkdirSync(dirname(resolve(out)),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
