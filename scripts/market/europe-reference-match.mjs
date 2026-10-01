// Exact official identity matching shared by offline analysis and metadata foundation.
const suffixes={XETR:['.DE'],XPAR:['.PA'],XAMS:['.AS'],XBRU:['.BR'],XMIL:['.MI'],XMAD:['.MC'],XWBO:['.VI'],XSWX:['.SW'],XLON:['.L'],XCSE:['.CO'],XSTO:['.ST'],XOSL:['.OL'],XHEL:['.HE'],XLIS:['.LS'],XDUB:['.IR']};
export function officialMnemonic(symbol,mic){const suffix=[...(suffixes[mic]||[]),'.'+mic].find(s=>String(symbol).endsWith(s));return suffix?String(symbol).slice(0,-suffix.length):String(symbol);}
export const evidenceCurrency=row=>row?.tradingCurrency||row?.trading_currency||row?.currency||null;
export const evidenceMic=row=>row?.stock_exchange?.mic||row?.mic||null;
export const evidenceType=row=>{const value=String(row?.asset_type||row?.item_type||row?.type||'').toUpperCase();return ['EQUITY','STOCK','COMMON_STOCK','ADR'].includes(value)?'EQUITY':value==='ETF'?'ETF':value||null;};
export function matchReference(row,mic,references){
 if(row._evidenceConflicts?.length)return{state:'PROVIDER_REPEATED_METADATA_CONFLICT',reference:null};
 if(evidenceMic(row) && evidenceMic(row)!==mic)return{state:'PROVIDER_EXCHANGE_MISMATCH',reference:null};
 const mnemonic=officialMnemonic(row.symbol,mic);
 const symbolMatches=references.filter(ref=>ref.mic===mic&&ref.symbol===mnemonic);
 if(row.isin && symbolMatches.length && symbolMatches.every(ref=>ref.isin && ref.isin!==row.isin))return{state:'PROVIDER_ISIN_CONFLICT',reference:null};
 let matches=symbolMatches.length?symbolMatches.filter(ref=>!row.isin||!ref.isin||row.isin===ref.isin):references.filter(ref=>ref.mic===mic&&row.isin&&row.isin===ref.isin);
 const currency=evidenceCurrency(row),type=evidenceType(row);
 if(currency&&matches.length){const eligible=matches.filter(ref=>!ref.tradingCurrency||ref.tradingCurrency===currency);if(!eligible.length)return{state:'PROVIDER_CURRENCY_CONFLICT',reference:null};matches=eligible;}
 if(type&&matches.length){const eligible=matches.filter(ref=>!ref.assetType||ref.assetType===type);if(!eligible.length)return{state:'PROVIDER_ASSET_TYPE_CONFLICT',reference:null};matches=eligible;}
 const unique=[...new Map(matches.map(ref=>[[ref.isin,ref.symbol,ref.tradingCurrency,ref.assetType,ref.listingType].join('@'),ref])).values()];
 if(unique.length===1&&evidenceCurrency(row)&&unique[0].tradingCurrency&&evidenceCurrency(row)!==unique[0].tradingCurrency)return{state:'PROVIDER_CURRENCY_CONFLICT',reference:null};
 if(unique.length===1&&evidenceType(row)&&unique[0].assetType&&evidenceType(row)!==unique[0].assetType)return{state:'PROVIDER_ASSET_TYPE_CONFLICT',reference:null};
 return unique.length===1?{state:'EXACT_REFERENCE_MATCH',reference:unique[0]}:{state:unique.length?'AMBIGUOUS_REFERENCE':'NO_EXACT_REFERENCE',reference:null};
}
