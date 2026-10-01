// Explicit branch/preview publication through the existing canonical builder.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mergeGlobalMarket} from './merge-global-market.mjs';
import {buildGlobalMarket} from './build-global-market.mjs';
export function prepareFoundation(base,candidate,histories,permission,out) {
 const merged=mergeGlobalMarket(base,candidate),expandedPermission={...permission,scope:merged.layer.listings.map(r=>r.listingId)};
 const manifest=buildGlobalMarket(merged.layer,histories,out,expandedPermission,{allowMetadataOnly:true});
 return {manifest,permission:expandedPermission,summary:{...merged.summary,decisions:undefined,productionActivated:false,priceHistoryListings:Object.keys(histories).length,equityEngineActivation:false}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=(name,fallback)=>process.argv.find(s=>s.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
 const read=p=>JSON.parse(readFileSync(p));
 const base=read(arg('base','quant/data/global-market/listings.json')),candidate=read(arg('candidate','.market-cache/marketstack/germany-canonical-foundation.json')),
 histories={},directory=arg('histories','.market-cache/marketstack/imported/daily');
 for(const row of base.listings){if(!['FULL','PARTIAL'].includes(row.coverage?.price_history))continue;const path=join(directory,row.listingId+'.json');if(existsSync(path))histories[row.listingId]=read(path);}
 const out=arg('out');if(!out)throw Error('EXPLICIT_FOUNDATION_OUTPUT_REQUIRED');
 const result=prepareFoundation(base,candidate,histories,read(arg('permission','quant/config/marketstack-display.json')),out);
 const scopeOut=arg('scope-out');if(scopeOut)writeFileSync(scopeOut,JSON.stringify(result.permission,null,2)+'\n');
 const summaryOut=arg('summary-out');if(summaryOut)writeFileSync(summaryOut,JSON.stringify(result.summary,null,2)+'\n');
 console.log(JSON.stringify(result.summary));
}
