// Release packaging only. Canonical sources and R2 objects are never modified.
import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const SEC_BUDGET=8*1024*1024;
const fields=(x,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(x||{},k)).map(k=>[k,x[k]]));
export function projectInspector(source){
 if(!source?.cik||!Array.isArray(source.rows)||source.policy!=='latest_known')throw Error('INVALID_INSPECTOR_SOURCE');
 return {...fields(source,['cik','generated_at_utc','versions','policy','as_of','scope','quality_summary','quality_errors']),
  profile:fields(source.profile,['cik','name','tickers','sic']),
  rows:source.rows.map(row=>fields(row,['metric','fiscal_year','fiscal_period','value','unit','period_start','period_end','available','available_from','filed','form','accession','concept','source','transformation','quality','flags','reason']))};
}
export function permitted(path){
 if(path.split('/').some(p=>p.startsWith('.'))&&path!=='.nojekyll')return false;
 if(/^(scripts|docs|providers)\//.test(path)||/\/(tests|fixtures)\//.test(path)||/\.test\.(m?js|py)$/.test(path))return false;
 if(/^quant\/data\/(sec|fundamentals)\//.test(path))return false;
 return !/^(README\.md|VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER\.md)$/.test(path);
}
export async function buildRelease({root,output}){
 root=resolve(root);output=resolve(output);
 if(output===root||root.startsWith(output+sep)||output.startsWith(root+sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_SOURCE');
 const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
 const emitted=[];await mkdir(output,{recursive:true});
 // Refuse reuse: stale files must not survive a release projection.
 const {readdir}=await import('node:fs/promises');if((await readdir(output)).length)throw Error('OUTPUT_NOT_EMPTY');
 for(const p of paths.filter(permitted)){const from=resolve(root,p);if(!(await lstat(from)).isFile())throw Error('NON_FILE_INPUT');await mkdir(dirname(resolve(output,p)),{recursive:true});await copyFile(from,resolve(output,p));}
 async function json(path,value){const bytes=Buffer.from(JSON.stringify(value));await mkdir(dirname(resolve(output,path)),{recursive:true});await writeFile(resolve(output,path),bytes);emitted.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const load=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
 const index=await load('quant/data/sec/inspector_index.json');
 await json('quant/data/sec/inspector_index.json',index);
 for(const name of ['quant-factor-inputs.json','coverage_matrix.json','pit_gates.json'])await json('quant/data/sec/'+name,await load('quant/data/sec/'+name));
 for(const company of index.companies){
  if(!/^[A-Z0-9.-]+$/.test(company.ticker)||!/^\d{10}$/.test(company.cik))throw Error('INVALID_INDEX_IDENTITY');
  const source=await load('quant/data/sec/inspector/'+company.ticker+'.json');
  if(source.cik!==company.cik)throw Error('INSPECTOR_IDENTITY_MISMATCH');
  await json('quant/data/sec/inspector/'+company.ticker+'.json',projectInspector(source));
 }
 // Delivery-only compaction: preserve canonical shard contents and URLs.
 for(const p of paths.filter(p=>/^quant\/data\/universe\/instruments\/[^/]+\.json$/.test(p))){
  await writeFile(resolve(output,p),JSON.stringify(await load(p)));
 }
 // Concatenate classic scripts in their existing document order. Original
 // modules remain available to every other workspace, including Discovery.
 const html=await readFile(resolve(root,'vu2/index.html'),'utf8');
 const tags=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
 if(!tags.length||tags.length!==(html.match(/<script\b/g)||[]).length)throw Error('UNSUPPORTED_SCRIPT_TAG');
 const chunks=[];
 for(const tag of tags){const p=tag[1].startsWith('/')?tag[1].slice(1):'vu2/'+tag[1];
  if(!paths.includes(p)||!permitted(p))throw Error('INVALID_BUNDLE_INPUT');
  chunks.push('/* '+p+' */\n'+await readFile(resolve(root,p),'utf8'));
 }
 await writeFile(resolve(output,'vu2/release-bundle.js'),chunks.join('\n;\n'));
 let bundled=html;for(const tag of tags)bundled=bundled.replace(tag[0],'');
 bundled=bundled.replace('</body>','<script src="/vu2/release-bundle.js"></script></body>');
 await writeFile(resolve(output,'vu2/index.html'),bundled);
 // Activate the reviewed Quant 2.0 entry only in the release projection.
 // Source workspaces stay intact, keeping rollback a reversible Git action.
 const quantEntry='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/vu2/"><link rel="canonical" href="/vu2/"><title>Vision Universe® Quant 2.0</title></head><body><p><a href="/vu2/">Vision Universe® Quant 2.0 öffnen</a></p><script>location.replace("/vu2/"+location.search+location.hash)</script></body></html>';
 await mkdir(resolve(output,'quant'),{recursive:true});
 await writeFile(resolve(output,'quant/index.html'),quantEntry);
 // Preserve the capitalized entry used in owner-facing launch links.
 await mkdir(resolve(output,'Quant'),{recursive:true});
 await writeFile(resolve(output,'Quant/index.html'),quantEntry);
 const bytes=emitted.reduce((n,f)=>n+f.bytes,0);
 if(bytes>SEC_BUDGET||emitted.some(f=>f.bytes>2*1024*1024))throw Error('SEC_DELIVERY_BUDGET_EXCEEDED');
 const report={schemaVersion:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),storage:'EXISTING_R2_UNCHANGED',secBudget:SEC_BUDGET,secBytes:bytes,files:emitted,excluded:['quant/data/sec/consumer','quant/data/sec/canonical','quant/data/fundamentals'],status:'PASS'};
 await writeFile(resolve(output,'release-delivery.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(!output)throw Error('OUTPUT_REQUIRED');
 console.log(JSON.stringify(await buildRelease({root:process.cwd(),output}),null,2));
}
