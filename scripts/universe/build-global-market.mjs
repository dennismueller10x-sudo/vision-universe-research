// Publish a verified canonical extension, never append to or rebuild the US master.
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), G = require('../../quant/engines/global-market.js');
const arg = n => process.argv.find(a => a.startsWith('--' + n + '='))?.slice(n.length + 3);
export function buildGlobalMarket(layer, histories, out, permission) {
  G.validate(layer);
  const publicOutput = resolve(out).includes('/quant/data/global-market');
  if (publicOutput && (!permission || permission.allowed !== true || !permission.basis || !permission.checkedAt || !Array.isArray(permission.scope) || layer.listings.some(r=>!permission.scope.includes(r.listingId)))) throw Error('DISPLAY_PERMISSION_REQUIRED');
  // Validate every candidate before any output is touched.
  for (const row of layer.listings) {
    const h = histories[row.listingId], issues = G.priceIssues(h?.bars);
    if (issues.length) throw Error('GLOBAL_PRICE_GATE:' + row.listingId + ':' + issues.join(','));
    if (h.bars.some(b => b.currency !== row.tradingCurrency || b.securityId !== row.securityId)) throw Error('GLOBAL_HISTORY_IDENTITY_OR_CURRENCY_MISMATCH');
  }
  out = resolve(out); mkdirSync(dirname(out), {recursive:true});
  const target = out, staging = mkdtempSync(join(dirname(out), '.global-market-stage-'));
  out = staging;
  const byInstrument = new Map(), bySearch = new Map();
  const token = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,2).padEnd(2,'_');
  const add = (map,key,row) => { if(!map.has(key))map.set(key,[]); if(!map.get(key).some(r => r.listingId === row.listingId))map.get(key).push(row); };
  const write = (path,value) => {mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,JSON.stringify(value)+'\n');};
  for (const row of layer.listings) {
    const history = histories[row.listingId];
    const issues = G.priceIssues(history?.bars);
    if (issues.length) throw Error('GLOBAL_PRICE_GATE:' + row.listingId + ':' + issues.join(','));
    if (history.bars.some(b => b.currency !== row.tradingCurrency || b.securityId !== row.securityId)) throw Error('GLOBAL_HISTORY_IDENTITY_OR_CURRENCY_MISMATCH');
    const last = history.bars.at(-1);
    const item = {...row,symbol:row.ticker,name:row.companyName || row.name, instrumentId:row.listingId,
      price:{value:last.close,asOf:last.date,delayState:'EOD_ONLY',marketTimestamp:last.marketTimestamp || last.market_timestamp || last.timestamp || null,providerTimestamp:last.providerTimestamp || last.provider_timestamp || null,retrievedAt:history.retrievedAt || last.retrieved_at || null},
      ...(permission ? {publishBasis:permission.basis,publishCheckedAt:permission.checkedAt} : {}),historyPath:'history/'+row.listingId+'.json',universeId:'GLOBAL_MARKET',cap:['CHART_AVAILABLE']};
    add(byInstrument,token(row.ticker),item);
    const words = [row.ticker,row.companyName,row.name,row.isin,row.country,row.listingCountry,row.region,row.listingRegion,row.universeTier,row.exchange,row.mic,...(row.aliases || [])].filter(Boolean).flatMap(v => String(v).split(/\s+/));
    for (const word of words) add(bySearch,token(word),item);
    // Public product display is a bounded close chart, not a provider OHLC dump.
    // Closes remain real market data; no claim they become licensed derivatives.
    const delivered=publicOutput?{schemaVersion:'listing-close-chart-1.0.0',listingId:row.listingId,securityId:row.securityId,currency:row.tradingCurrency,retrievedAt:history.retrievedAt,adjustmentStatus:history.adjustmentStatus,quality:history.quality,bars:history.bars.map(b=>({date:b.date,close:b.close})),displayOnly:true}:history;
    write(join(out,'history',row.listingId+'.json'),{...delivered,listingId:row.listingId,assetType:row.assetType,tradingCurrency:row.tradingCurrency,delayState:'EOD_ONLY',...(permission ? {publishBasis:permission.basis,publishCheckedAt:permission.checkedAt} : {})});
  }
  for(const [key,instruments] of byInstrument)write(join(out,'instruments',key+'.json'),{instruments});
  for(const [key,entries] of bySearch)write(join(out,'search',key+'.json'),{entries});
  const counts = {total:layer.listings.length,equities:layer.listings.filter(r=>r.assetType==='EQUITY').length,etfs:layer.listings.filter(r=>r.assetType==='ETF').length};
  const manifest={schemaVersion:G.VERSION,generatedAt:layer.generatedAt,counts,instrumentShards:[...byInstrument.keys()].sort(),searchShards:[...bySearch.keys()].sort()};
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
 if(!input||!historyDir||!out)throw Error('INPUT_HISTORIES_OUT_REQUIRED');
 const layer=JSON.parse(readFileSync(input)),histories={};
 for(const row of layer.listings){const p=join(historyDir,row.listingId+'.json');if(!existsSync(p))throw Error('HISTORY_REQUIRED');histories[row.listingId]=JSON.parse(readFileSync(p));}
 const policy=arg('permission');console.log(JSON.stringify(buildGlobalMarket(layer,histories,resolve(out),policy?JSON.parse(readFileSync(policy)):null)));
}
