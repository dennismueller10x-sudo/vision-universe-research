// Release-only field projection. No signal, state, count or rule is recomputed.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function projectSupertraderHome(signals){
 if(signals?.schema!=='supertrader-signals-1.0.0'||!/^\d{4}-\d{2}-\d{2}$/.test(signals.asOf||'')||!signals.counts||typeof signals.counts!=='object')throw Error('INVALID_SUPERTRADER_HOME_SOURCE');
 const view={deliveryView:'st-home-view-1'};
 for(const key of ['schema','asOf','inputsGeneratedAt','policy','disclaimer','counts'])if(Object.hasOwn(signals,key))view[key]=signals[key];
 return view;
}
export async function writeSupertraderHomeView({site}){
 const source=await readFile(join(site,'supertrader/data/signals-core.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(source===null)return {state:'NOT_AVAILABLE'};
 const view=projectSupertraderHome(JSON.parse(source)),bytes=Buffer.from(JSON.stringify(view));
 if(bytes.length>16*1024)throw Error('SUPERTRADER_HOME_VIEW_BUDGET_EXCEEDED');
 await writeFile(join(site,'supertrader/data/home-view.json'),bytes);
 const index=join(site,'supertrader/index.html'),html=await readFile(index,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(html!==null&&!html.includes('name="vu-st-home-view"'))await writeFile(index,html.replace('</head>','<meta name="vu-st-home-view" content="1"></head>'));
 return {state:'AVAILABLE',bytes:bytes.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');if(i<0||!process.argv[i+1])throw Error('USAGE: supertrader-home-view.mjs --out <release-dir>');
 console.log(JSON.stringify(await writeSupertraderHomeView({site:resolve(process.argv[i+1])})));
}
