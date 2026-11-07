// Delivery projection of the public service's validated stock, not a new quote
// reader. The normal page remains authoritative and keeps its full data path.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
export const HEAD_SHARD_BUDGET=128*1024;
export const SCHEMA='quant-stock-head-view-1';
const dateDe=iso=>{if(!iso)return '–';const p=String(iso).slice(0,10).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(iso);};
export function projectStockHead(stock,entry,viewModel){
 if(stock?.state!=='AVAILABLE'||!stock.instrumentId||!stock.masterMemberId||!stock.name||stock.name===stock.ticker||stock.price?.reason==='DISPLAY_NOT_PERMITTED'||!Number.isFinite(stock.price?.value))return null;
 const bars=stock.chart?.state==='AVAILABLE'?stock.chart.bars||[]:[],last=bars.at(-1),prev=bars.at(-2);
 const asOf=stock.price.asOf||last?.date||stock.asOf;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf||''))return null;
 // Identical display projection to page-stock.js: same value, chart, date and
 // ratio. Never substitute a second price source or an unavailable value.
 const price={value:stock.price.value,currency:'USD',changePct:last&&prev&&prev.close>0?(last.close/prev.close-1)*100:null,changeLabel:'zum Vortag',kind:'close',at:dateDe(asOf)};
 const question=viewModel?.factorState==='AVAILABLE'?'Was sagt Quant insgesamt?':'Quant-Ergebnis';
 return {ticker:stock.ticker,instrumentId:stock.instrumentId,masterMemberId:stock.masterMemberId,name:stock.name,industry:stock.industry||null,securityType:stock.securityType||entry?.t||null,listingCount:entry?.il||null,asOf,price,question,questionClass:viewModel?.factorState==='AVAILABLE'&&viewModel.overall?.rated>=3?'qv3-step-q':'qv2-result-k'};
}
export async function writeStockHeadViews({source,site,tickers,log=()=>{}}){
 source=resolve(source);site=resolve(site);
 if(source===site||site.startsWith(source+sep)||source.startsWith(site+sep))throw Error('OUTPUT_MUST_BE_OUTSIDE_SOURCE');
 const require=createRequire(join(source,'__stock_head_delivery.cjs'));
 const Service=require('./quant/api/product-services.js'),Policy=require('./quant/engines/display-policy.js'),Query=require('./quant/engines/query.js'),Identity=require('./core/identity.js'),VM=require('./quant/app/view-model.js');
 const cache=new Map();
 const loadJSON=path=>{if(!cache.has(path))cache.set(path,readFile(resolve(site,'.'+path)).then(bytes=>JSON.parse(path.endsWith('.gz')?gunzipSync(bytes):bytes)).catch(error=>{cache.delete(path);throw error;}));return cache.get(path);};
 if(!tickers){const list=await loadJSON('/quant/data/product/universe-list-v1.json.gz').catch(()=>null);if(!list?.entries)return {state:'NOT_AVAILABLE',records:0,files:[]};tickers=list.entries.map(e=>e.s).filter(Boolean);}
 tickers=[...new Set(tickers)];
 const api=Service.create({loadJSON,loadCompressedJSON:loadJSON,displayPolicy:Policy,queryEngine:Query}),groups={},rejected=[];
 let cursor=0,done=0;
 async function worker(){while(cursor<tickers.length){const ticker=tickers[cursor++];
  const [stock,entry,factors]=await Promise.all([api.getStockIntelligence(ticker),api.getUniverseEntry(ticker),api.getFactorEvidence(ticker)]);
  const projected=VM.identityNote(stock)?null:projectStockHead(stock,entry,VM.stock({ticker,factors}));
  if(projected){const key=Identity.shardKey(projected.ticker);(groups[key]||={})[projected.ticker]=projected;}else rejected.push(ticker);
  // Large single-stock/chart inputs are never shared between tickers.
  for(const path of cache.keys())if(path.includes('/'+ticker+'.')||path.includes('/'+Identity.securityIdForTicker(ticker)+'.'))cache.delete(path);
  if(++done%250===0)log({done,total:tickers.length});
 }}
 await Promise.all(Array.from({length:4},worker));
 const records=Object.fromEntries(Object.keys(groups).sort().map(key=>[key,Object.fromEntries(Object.entries(groups[key]).sort(([a],[b])=>a<b?-1:a>b?1:0))]));
 const version=createHash('sha256').update(JSON.stringify(records)).digest('hex').slice(0,16),files=[];
 const dir=join(site,'quant/data/product/stock-head-v1');await mkdir(dir,{recursive:true});
 for(const [shard,entries] of Object.entries(records)){const path='quant/data/product/stock-head-v1/'+shard+'.json',bytes=Buffer.from(JSON.stringify({schema:SCHEMA,version,shard,entries}));if(bytes.length>HEAD_SHARD_BUDGET)throw Error('STOCK_HEAD_SHARD_BUDGET_EXCEEDED:'+shard);await writeFile(join(site,path),bytes);files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(join(dir,'index.json'),JSON.stringify({schema:SCHEMA,version})+'\n');
 const report={schema:SCHEMA,state:'AVAILABLE',version,requested:tickers.length,records:tickers.length-rejected.length,rejected,files};
 await writeFile(join(site,'quant/stock-head-delivery.json'),JSON.stringify(report,null,2)+'\n');return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
 if(!arg('--out'))throw Error('USAGE: stock-head-view.mjs --out <release-dir> [--source <code-root>]');
 console.log(JSON.stringify(await writeStockHeadViews({source:arg('--source')||process.cwd(),site:arg('--out')})));
}
