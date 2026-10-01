// Read-only replay of identity-qualified, bounded scale histories. No API calls.
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {importEvidence} from './import-marketstack-evidence.mjs';
export function privateOutputRoot(input) {
 const root=resolve(input);if(/\/(quant\/data|discover\/data|dashboard\/data)(\/|$)/.test(root))throw Error('PRIVATE_WORKING_OUTPUT_REQUIRED');
 for(let path=root;;path=dirname(path)){if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('PRIVATE_OUTPUT_SYMLINK_FORBIDDEN');if(dirname(path)===path)break;}
 return root;
}
export function importScaleHistory(probe,references,base,existing=base.listings) {
 const endpoints=[],decisions=[],refs=new Map(),metadata=new Map(),conflicts=new Set(),referenceFields=new Map(),metadataFields=new Map();
 const observe=(ledger,symbol,values)=>{const known=ledger.get(symbol)||[];values.forEach((value,index)=>{if(!value)return;if(known[index]&&known[index]!==value)conflicts.add(symbol);else known[index]=value;});ledger.set(symbol,known);};
 for(const r of references.flatMap(r=>r.matches||[])){
  observe(referenceFields,r.provider_symbol,[r.mic,r.isin,r.trading_currency]);
  const old=refs.get(r.provider_symbol);if(old&&['mic','isin','trading_currency'].some(k=>old[k]&&r[k]&&old[k]!==r[k]))conflicts.add(r.provider_symbol);
  if(!old)refs.set(r.provider_symbol,r);
 }
 const identityValues=e=>[e.data?.symbol,e.data?.isin,e.data?.stock_exchange?.mic,e.data?.item_type,e.data?.price_currency,e.data?.currency];
 for(const e of (probe.endpoints||[]).filter(e=>e.ok&&/^tickers\/[^/]+$/.test(e.endpoint))){
  const symbol=e.endpoint.slice(8),old=metadata.get(symbol),values=identityValues(e),previous=old&&identityValues(old);
  observe(metadataFields,symbol,values);
  const ref=refs.get(symbol);if(ref&&((values[1]&&values[1]!==ref.isin)||(values[2]&&values[2]!==ref.mic)||[values[4],values[5]].some(v=>v&&ref.trading_currency&&v!==ref.trading_currency)))conflicts.add(symbol);
  if(previous&&values.some((v,i)=>v&&previous[i]&&v!==previous[i]))conflicts.add(symbol);
  if(!old||values.filter(Boolean).length>previous.filter(Boolean).length)metadata.set(symbol,e);
 }
 const windows=[];
 for(const e of probe.endpoints||[]){
  if(e.label==='listing-history')windows.push(e);
  if(e.label!=='germany-full-equity-latest-week')continue;
  const rows=e.data?.data,p=e.data?.pagination,symbols=String(e.params?.symbols||'').split(',');
  const complete=e.ok&&Array.isArray(rows)&&p&&Number.isSafeInteger(p.total)&&p.total===rows.length&&p.count===rows.length&&p.offset===0&&p.limit===e.params.limit;
  for(const symbol of new Set(symbols)){
   const raw=complete?rows.filter(r=>r?.symbol===symbol):[];
   windows.push({...e,label:'listing-history',ok:complete,originalRequestParams:e.params,params:{...e.params,symbols:symbol},data:{pagination:complete?{...p,count:raw.length,total:raw.length}:null,data:raw}});
  }
 }
 for(const e of windows) {
  const symbol=e.endpoint==='eod'?e.params?.symbols:/^tickers\/([^/]+)\/eod$/.exec(e.endpoint)?.[1],mic=e.params?.exchange;
  if(base.listings.some(r=>r.providerSymbol===symbol&&r.mic===mic)){decisions.push({providerSymbol:symbol,status:'ACCEPTED_BASE_HISTORY_PRESERVED'});continue;}
  const ref=refs.get(symbol),identity=metadata.get(symbol),meta=identity?.data;
  const reject=reason=>decisions.push({providerSymbol:symbol,status:'BLOCKED',reason});
  if(conflicts.has(symbol)){reject('CONTRADICTORY_IDENTITY_OBSERVATIONS');continue;}
  if(!symbol||!mic||!ref?.isin||ref.mic!==mic||meta?.symbol!==symbol||meta?.isin!==ref.isin||meta?.stock_exchange?.mic!==mic){reject('EXACT_OFFICIAL_IDENTITY_REQUIRED');continue;}
  const body=e.data?.data,raw=Array.isArray(body)?body:body?.eod,p=e.data?.pagination;
  if(!e.ok||!Array.isArray(raw)||!raw.length){reject('PRICE_UNAVAILABLE');continue;}
  if(body?.symbol&&body.symbol!==symbol){reject('HISTORY_WRAPPER_IDENTITY_MISMATCH');continue;}
  if(!p||!Number.isSafeInteger(p.total)||p.total!==raw.length||p.count!==raw.length||p.offset!==0||p.limit!==e.params.limit){reject('COMPLETE_BOUNDED_PAGINATION_REQUIRED');continue;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.params.date_from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(e.params.date_to||'')){reject('EXPLICIT_HISTORY_WINDOW_REQUIRED');continue;}
  endpoints.push({...identity,label:'listing-identity'}, {...e,label:'global-qualified-eod',params:{...e.params,symbols:symbol},data:{...e.data,data:raw}});
 }
 const result=importEvidence({...probe,endpoints},references,existing);
 const ids=new Set(base.listings.map(r=>r.listingId)),keys=new Set(base.listings.map(r=>r.ticker+'@'+r.mic));
 for(const row of result.layer.listings)if(ids.has(row.listingId)||keys.has(row.ticker+'@'+row.mic))throw Error('ACCEPTED_BASE_REPLACEMENT_FORBIDDEN');
 const layer={...base,generatedAt:probe.generatedAt,listings:[...base.listings,...result.layer.listings]};
 return {...result,layer,summary:{...result.summary,decisions:[...decisions,...result.summary.decisions],protectedBaseRecords:base.listings.length,technicalActivation:false}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const arg=n=>process.argv.find(s=>s.startsWith('--'+n+'='))?.slice(n.length+3),read=p=>JSON.parse(readFileSync(p));
 if(!arg('probe')||!arg('references')||!arg('base')||!arg('out'))throw Error('PROBE_REFERENCES_BASE_PRIVATE_OUT_REQUIRED');
 const out=privateOutputRoot(arg('out'));
 const base=read(arg('base')),existing=arg('existing')?read(arg('existing')).listings:base.listings;
 const result=importScaleHistory(read(arg('probe')),arg('references').split(',').map(read),base,existing);
 mkdirSync(join(out,'daily'),{recursive:true});writeFileSync(join(out,'listings.json'),JSON.stringify(result.layer)+'\n');
 for(const [id,history]of Object.entries(result.histories))writeFileSync(join(out,'daily',id+'.json'),JSON.stringify(history)+'\n',{mode:0o600});
 writeFileSync(join(out,'summary.json'),JSON.stringify(result.summary,null,2)+'\n');console.log(JSON.stringify({...result.summary,decisions:undefined}));
}
