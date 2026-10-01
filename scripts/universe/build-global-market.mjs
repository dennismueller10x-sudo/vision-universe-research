// Publish a verified canonical extension, never append to or rebuild the US master.
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), G = require('../../quant/engines/global-market.js');
const arg = n => process.argv.find(a => a.startsWith('--' + n + '='))?.slice(n.length + 3);
export const SEARCH_PAGE_MAX_BYTES = 32768, SEARCH_PAGE_MAX_ROWS = 96, SEARCH_INDEX_MAX_BYTES = 65536;
const searchToken = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const shardToken = value => searchToken(value).slice(0,2).padEnd(2,'_');
export function compactSearchListing(row) {
  const fields = ['listingId','ticker','companyName','name','mic','exchange','assetType','listingType','country','region','listingCountry','listingRegion','tradingCurrency','isin','aliases','active'];
  const compact = Object.fromEntries(fields.filter(key => row[key] !== undefined && row[key] !== null).map(key => [key,row[key]]));
  if(compact.companyName) delete compact.name;
  compact.country=row.country || null; compact.region=row.region || null;
  compact.universeId = 'GLOBAL_MARKET';
  compact.cap = ['HAS_PROFILE'];
  if(row.price && Number.isFinite(row.price.value) && row.price.value > 0) compact.cap.push('HAS_PRICE_SNAPSHOT');
  if(row.historyPath && ['FULL','PARTIAL'].includes(row.coverage?.price_history || row.coverage?.priceHistory)) compact.cap.push('HAS_PRICE_HISTORY');
  return compact;
}
// Pure metadata indexing permits scale measurement without generating price fixtures.
// Heavy two-character buckets contain bounded pages ordered by indexed term.
export function buildSearchIndex(listings) {
  const postings = new Map(), files = new Map();
  for(const row of listings) {
    const terms = [...new Set([row.ticker,row.companyName,row.name,row.isin,row.country,row.listingCountry,row.region,row.listingRegion,row.universeTier,row.exchange,row.mic,...(row.aliases || [])]
      .filter(Boolean).flatMap(value => String(value).split(/\s+/)).map(searchToken).filter(Boolean))];
    const compact = compactSearchListing(row);
    for(const term of terms) {
      const key=shardToken(term); if(!postings.has(key))postings.set(key,[]);
      postings.get(key).push({term,entry:compact});
    }
  }
  for(const [key,values] of postings) {
    const unique = [...new Map(values.map(value => [value.entry.listingId,value.entry])).values()];
    const plain={entries:unique};
    if(unique.length<=SEARCH_PAGE_MAX_ROWS && Buffer.byteLength(JSON.stringify(plain)+'\n')<=SEARCH_PAGE_MAX_BYTES) {files.set('search/'+key+'.json',plain);continue;}
    const compare=(a,b)=>a<b?-1:a>b?1:0;
    values.sort((a,b)=>compare(a.term,b.term)||compare(String(a.entry.ticker),String(b.entry.ticker))||compare(a.entry.listingId,b.entry.listingId));
    const pages=[];let page=[],bytes=0;
    function emit() {
      if(!page.length)return;
      const entries=[...new Map(page.map(value=>[value.entry.listingId,value.entry])).values()];
      const path='search/'+key+'/'+String(pages.length).padStart(4,'0')+'.json';
      files.set(path,{entries});
      pages.push({path:path.slice(7),firstTerm:page[0].term,lastTerm:page.at(-1).term,
        exactSymbols:[...new Set(page.filter(value=>value.term===searchToken(value.entry.ticker)).map(value=>searchToken(value.entry.ticker)))].sort(),
        listingCountries:[...new Set(entries.map(row=>row.listingCountry).filter(Boolean))].sort(),
        listingRegions:[...new Set(entries.map(row=>row.listingRegion).filter(Boolean))].sort()});
      page=[];bytes=0;
    }
    for(const value of values) {
      const size=Buffer.byteLength(JSON.stringify(value.entry))+1;
      if(page.length && (page.length>=SEARCH_PAGE_MAX_ROWS || bytes+size+15>SEARCH_PAGE_MAX_BYTES))emit();
      if(size+15>SEARCH_PAGE_MAX_BYTES)throw Error('SEARCH_ENTRY_BUDGET_EXCEEDED:'+value.entry.listingId);
      page.push(value);bytes+=size;
    }
    emit();
    const descriptor={schemaVersion:'global-search-pages-1.0.0',prefix:key,pages};
    if(Buffer.byteLength(JSON.stringify(descriptor)+'\n')>SEARCH_INDEX_MAX_BYTES)throw Error('SEARCH_DESCRIPTOR_BUDGET_EXCEEDED:'+key);
    files.set('search/'+key+'.json',descriptor);
  }
  return {files,shards:[...postings.keys()].sort()};
}
export function buildGlobalMarket(layer, histories, out, permission, options = {}) {
  const metadataOnly=row=>options.allowMetadataOnly===true && !histories[row.listingId] && row.coverage?.price_history==='NONE' && row.coverage?.price_eod==='NONE' && !Object.hasOwn(row,'price');
  G.validate(layer);
  const publicOutput = resolve(out).includes('/quant/data/global-market');
  if (publicOutput && (!permission || permission.allowed !== true || !permission.basis || !permission.checkedAt || !Array.isArray(permission.scope) || layer.listings.some(r=>!permission.scope.includes(r.listingId)))) throw Error('DISPLAY_PERMISSION_REQUIRED');
  // Validate every candidate before any output is touched.
  for (const row of layer.listings) {
    if(metadataOnly(row))continue;
    const h = histories[row.listingId], issues = G.priceIssues(h?.bars);
    if (issues.length) throw Error('GLOBAL_PRICE_GATE:' + row.listingId + ':' + issues.join(','));
    if (h.bars.some(b => b.currency !== row.tradingCurrency || b.securityId !== row.securityId)) throw Error('GLOBAL_HISTORY_IDENTITY_OR_CURRENCY_MISMATCH');
  }
  out = resolve(out); mkdirSync(dirname(out), {recursive:true});
  const target = out, staging = mkdtempSync(join(dirname(out), '.global-market-stage-'));
  out = staging;
  const byInstrument = new Map(), searchRows = [];
  const token = shardToken;
  const add = (map,key,row) => { if(!map.has(key))map.set(key,[]); if(!map.get(key).some(r => r.listingId === row.listingId))map.get(key).push(row); };
  const write = (path,value) => {mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,JSON.stringify(value)+'\n');};
  for (const row of layer.listings) {
    const history = histories[row.listingId];
    const metadata=metadataOnly(row);
    const last=metadata?null:history.bars.at(-1);
    const item = {...row,symbol:row.ticker,name:row.companyName || row.name, instrumentId:row.listingId,
      price:metadata?null:{value:last.close,asOf:last.date,delayState:'EOD_ONLY',marketTimestamp:last.marketTimestamp || last.market_timestamp || last.timestamp || null,providerTimestamp:last.providerTimestamp || last.provider_timestamp || null,retrievedAt:history.retrievedAt || last.retrieved_at || null},
      ...(permission ? {publishBasis:permission.basis,publishCheckedAt:permission.checkedAt} : {}),
      ...(!metadata ? {historyPath:'history/'+row.listingId+'.json',cap:['CHART_AVAILABLE']} : {}),universeId:'GLOBAL_MARKET'};
    if(metadata) {delete item.historyPath;delete item.cap;}
    add(byInstrument,token(row.ticker),item);
    searchRows.push(item);
    if(metadata)continue;
    // Public product display is a bounded close chart, not a provider OHLC dump.
    // Closes remain real market data; no claim they become licensed derivatives.
    const delivered=publicOutput?{schemaVersion:'listing-close-chart-1.0.0',listingId:row.listingId,securityId:row.securityId,currency:row.tradingCurrency,retrievedAt:history.retrievedAt,adjustmentStatus:history.adjustmentStatus,quality:history.quality,bars:history.bars.map(b=>({date:b.date,close:b.close})),displayOnly:true}:history;
    write(join(out,'history',row.listingId+'.json'),{...delivered,listingId:row.listingId,assetType:row.assetType,tradingCurrency:row.tradingCurrency,delayState:'EOD_ONLY',...(permission ? {publishBasis:permission.basis,publishCheckedAt:permission.checkedAt} : {})});
  }
  for(const [key,instruments] of byInstrument)write(join(out,'instruments',key+'.json'),{instruments});
  const searchIndex=buildSearchIndex(searchRows);
  for(const [path,payload] of searchIndex.files)write(join(out,path),payload);
  const counts = {total:layer.listings.length,equities:layer.listings.filter(r=>r.assetType==='EQUITY').length,etfs:layer.listings.filter(r=>r.assetType==='ETF').length};
  const manifest={schemaVersion:G.VERSION,generatedAt:layer.generatedAt,counts,instrumentShards:[...byInstrument.keys()].sort(),searchShards:searchIndex.shards};
  write(join(out,'manifest.json'),manifest);write(join(out,'listings.json'),layer);
  const backup = target + '.previous';
  if (existsSync(backup)) throw Error('PREVIOUS_PUBLISH_REQUIRES_RECOVERY');
  const previous = existsSync(target);
  if (previous) renameSync(target,backup);
  try { renameSync(staging,target); } catch (error) { if(previous)renameSync(backup,target);throw error; }
  if(previous)rmSync(backup,{recursive:true,force:true});
  return manifest;
}
if(process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
 const input=arg('input'), historyDir=arg('histories'), out=arg('out');
 const allowMetadataOnly=process.argv.includes('--allow-metadata-only');
 if(!input||(!historyDir&&!allowMetadataOnly)||!out)throw Error('INPUT_HISTORIES_OUT_REQUIRED');
 const layer=JSON.parse(readFileSync(input)),histories={};
 for(const row of layer.listings){const p=historyDir&&join(historyDir,row.listingId+'.json');if(p&&existsSync(p))histories[row.listingId]=JSON.parse(readFileSync(p));else if(!allowMetadataOnly)throw Error('HISTORY_REQUIRED');}
 const policy=arg('permission');console.log(JSON.stringify(buildGlobalMarket(layer,histories,resolve(out),policy?JSON.parse(readFileSync(policy)):null,{allowMetadataOnly})));
}
