// Additive canonical metadata merge. Accepted listing records always win intact.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),G=require('../../quant/engines/global-market.js');
export function mergeGlobalMarket(base, additions) {
 G.validate(base);G.validate(additions);
 const byId=new Map(base.listings.map(r=>[r.listingId,r])),byKey=new Map(base.listings.map(r=>[r.ticker+'@'+r.mic,r]));
 const decisions=[],securityTypes=new Map(base.listings.map(r=>[r.securityId,r.assetType]));
 for(const row of additions.listings){
  if(securityTypes.has(row.securityId)&&securityTypes.get(row.securityId)!==row.assetType)throw Error('CANONICAL_MERGE_SECURITY_ASSET_TYPE_CONFLICT:'+row.securityId);
  const previous=byId.get(row.listingId)||byKey.get(row.ticker+'@'+row.mic);
  if(previous){
   const conflict=['listingId','securityId','mic','tradingCurrency','assetType'].find(k=>previous[k]!==row[k])||(previous.isin&&row.isin&&previous.isin!==row.isin?'isin':null);
   if(conflict)throw Error('CANONICAL_MERGE_IDENTITY_CONFLICT:'+row.listingId+':'+conflict);
   decisions.push({listingId:row.listingId,status:'ACCEPTED_BASE_RECORD_PRESERVED'});continue;
  }
  if(row.coverage?.price_eod!=='NONE'||row.coverage?.price_history!=='NONE'||Object.hasOwn(row,'price'))throw Error('NEW_FOUNDATION_REQUIRES_METADATA_ONLY:'+row.listingId);
  byId.set(row.listingId,row);byKey.set(row.ticker+'@'+row.mic,row);securityTypes.set(row.securityId,row.assetType);decisions.push({listingId:row.listingId,status:'METADATA_FOUNDATION_ADDED'});
 }
 const layer={...base,generatedAt:additions.generatedAt,listings:[...byId.values()]};G.validate(layer);
 for(const row of base.listings)if(JSON.stringify(row)!==JSON.stringify(byId.get(row.listingId)))throw Error('BASE_RECORD_CHANGED');
 return {layer,summary:{protectedBaseRecords:base.listings.length,preservedOverlap:decisions.filter(r=>r.status==='ACCEPTED_BASE_RECORD_PRESERVED').length,metadataRecordsAdded:decisions.filter(r=>r.status==='METADATA_FOUNDATION_ADDED').length,total:layer.listings.length,decisions}};
}
