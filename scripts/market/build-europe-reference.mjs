// Normalize retrieved official reference metadata only; discard all quoted prices.
import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';import{resolve,dirname}from'node:path';
export function parseReferenceCSV(text){
 const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===';'&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);rows.push(row);}const header=(rows.shift()||[]).map(v=>v.replace(/^\uFEFF/,''));return rows.map(values=>Object.fromEntries(header.map((key,index)=>[key,values[index]||'']))).filter(row=>/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row.ISIN||''));
}
export const effectiveSecurityTypeSource=(source,issueType)=>source?.method==='POST'&&source.filter?.issueType===issueType&&!source.error&&Number.isInteger(source.observedRows)&&Number.isInteger(source.total)&&source.total>=0&&source.observedRows===source.total;
export const effectiveCommonSource=source=>effectiveSecurityTypeSource(source,'101');
export function normalizeOfficialReferences({venueCSVs=[],commonISINs=new Set(),preferredISINs=new Set(),classificationSourcesByISIN=new Map(),six=null,nordic=[],sources={}}){
 const rows=[];
 for(const input of venueCSVs)for(const row of parseReferenceCSV(input.text)){
  const type=commonISINs.has(row.ISIN)?'COMMON_STOCK':preferredISINs.has(row.ISIN)?'PREFERRED':null;
  rows.push({mic:input.mic,referenceMic:input.referenceMic||input.mic,symbol:row.Symbol,name:row.Name,isin:row.ISIN,tradingCurrency:/^[A-Z]{3}$/.test(row.Currency)?row.Currency:null,assetType:type?'EQUITY':null,listingType:type,status:null,issuerCountry:null,reportingCurrency:null,sourceId:input.sourceId,classificationSourceId:type?(type==='COMMON_STOCK'?'EURONEXT_OFFICIAL_COMMON_STOCK_101':'EURONEXT_OFFICIAL_PREFERRED_STOCK_106'):null,classificationEvidenceSourceId:type?classificationSourcesByISIN.get(row.ISIN)||null:null,classificationState:type?'OFFICIAL_FILTERED_SECURITY_TYPE':'CURRENCY_ISIN_REFERENCE_TYPE_UNRESOLVED'});
 }
 if(six)for(const values of six.rowData||[]){const row=Object.fromEntries(six.colNames.map((name,index)=>[name,values[index]]));if(!['RS','BS','SS','PC'].includes(row.SecTypeCode))continue;
  rows.push({mic:'XSWX',symbol:row.ValorSymbol,name:row.ShortName,isin:row.ISIN,tradingCurrency:row.TradingBaseCurrency,assetType:'EQUITY',listingType:'UNKNOWN',officialSecurityTypeCode:row.SecTypeCode,officialSecurityType:row.SecTypeDesc,reportedTradingState:row.TradingState,status:null,issuerCountry:null,reportingCurrency:null,sourceId:'SIX_OFFICIAL_EQUITY_REFERENCE',classificationState:'OFFICIAL_EQUITY_SECURITY_TYPE_SHARE_CLASS_UNRESOLVED'});
 }
 for(const input of nordic)for(const row of input.data?.data?.instrumentListing?.rows||[]){if(row.assetClass!=='SHARES'||!row.isin||!row.symbol)continue;
  rows.push({mic:input.mic,symbol:row.symbol.replace(/\s+/g,'-'),officialSymbol:row.symbol,name:row.fullName,isin:row.isin,tradingCurrency:row.currency,assetType:'EQUITY',listingType:'UNKNOWN',status:null,issuerCountry:null,reportingCurrency:null,sourceId:input.sourceId,classificationState:'OFFICIAL_MAIN_MARKET_SHARES_CLASS_SHARE_SUBTYPE_UNRESOLVED',symbolMapping:'NASDAQ_OFFICIAL_SPACE_TO_PROVIDER_HYPHEN'});
 }
 return{schemaVersion:'europe-official-reference-1.0.0',generatedAt:new Date().toISOString(),sources,rows,limitations:['SIX participation certificates stay distinct official security types; a registered/bearer share description does not independently prove common-share preference rights.','Unfiltered Euronext equities include rights and warrants; only effective POST issueType101/106 classifications grant equity candidate type. GET download args filters were empirically ignored.','Issuer country and reporting currency are never inferred from ISIN, exchange or trading currency.','Market-data quotes in official responses are discarded; this artifact is identity/classification/currency reference only.']};
}
export function mergeClassifiedXetraReferences(base,artifact){
 const rows=(artifact?.candidates||[]).filter(r=>r.mic==='XETR'&&r.assetType==='EQUITY'&&r.officialInstrumentType==='CS'&&r.officialStatus==='ACTIVE').map(r=>({mic:r.mic,symbol:r.exchangeMnemonic,name:r.officialInstrumentName,isin:r.isin,tradingCurrency:r.tradingCurrency,assetType:'EQUITY',listingType:r.listingTypeHint||'UNKNOWN',status:r.officialStatus,officialSecurityTypeCode:'CS',sourceId:r.referenceSourceId,classificationState:'OFFICIAL_XETRA_CS_SHARE_SUBTYPE_UNRESOLVED'}));
 return{...base,rows:base.rows.concat(rows),sources:{...base.sources,...artifact.referenceSources}};
}
export function mergeTypedETFReferences(base,etfs){
 if(!Array.isArray(etfs?.rows))throw Error('TYPED_ETF_REFERENCE_ROWS_REQUIRED');
 const rows=base.rows.concat(etfs.rows.filter(row=>row.assetType==='ETF'));
 const identity=row=>[row.mic,row.symbol,row.isin,row.tradingCurrency].join('@'),typed=new Set(rows.filter(row=>row.assetType).map(identity));
 const unique=new Map();for(const row of rows)if(row.assetType||!typed.has(identity(row)))unique.set(identity(row)+'@'+row.assetType+'@'+row.listingType,row);
 return{...base,rows:[...unique.values()],sources:{...base.sources,ETF_EXACT_TYPED_REFERENCES:etfs.sources||{}}};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const arg=key=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3),root=arg('official-directory'),out=arg('out');if(!root||!out)throw Error('OFFICIAL_DIRECTORY_AND_OUT_REQUIRED');
 const read=name=>JSON.parse(readFileSync(resolve(root,name))),sources={},venueCSVs=[],nordic=[],commonISINs=new Set(),preferredISINs=new Set(),classificationSourcesByISIN=new Map();
 const typeSources=existsSync(resolve(root,'euronext-common-sources.json'))?read('euronext-common-sources.json'):[];
 for(const source of typeSources){if(!effectiveCommonSource(source))continue;const data=read(source.id+'.json');for(const row of data.aaData||[])if(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row[1])){commonISINs.add(row[1]);classificationSourcesByISIN.set(row[1],source.id);}sources[source.id]=source;}
 if(existsSync(resolve(root,'euronext-type-sources.json')))for(const source of read('euronext-type-sources.json')){if(!effectiveSecurityTypeSource(source,'106'))continue;for(const row of read(source.id+'.json').aaData||[])if(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row[1])){preferredISINs.add(row[1]);classificationSourcesByISIN.set(row[1],source.id);}sources[source.id]=source;}
 const venueSources=read('official-venue-feeds.json');for(const source of venueSources){if(source.error||!source.id.startsWith('euronext-'))continue;const referenceMic=source.id.slice(9);venueCSVs.push({mic:referenceMic==='MTAA'?'XMIL':referenceMic,referenceMic,sourceId:source.id,text:readFileSync(resolve(root,source.id+'.txt'),'utf8')});sources[source.id]=source;}
 const six=existsSync(resolve(root,'six-official-equity-reference.json'))?read('six-official-equity-reference.json'):null;if(six)sources.SIX_OFFICIAL_EQUITY_REFERENCE=read('six-official-equity-source.json');
 for(const source of read('classified-feed-sources.json')){if(source.error||!source.id.startsWith('nasdaq-')||source.rows!==source.pagination?.total)continue;const market=source.id.split('-')[1],mic=({CPH:'XCSE',STO:'XSTO',HEL:'XHEL'})[market];if(!mic)continue;nordic.push({mic,sourceId:source.id,data:read(source.id+'.txt')});sources[source.id]=source;}
 const equity=normalizeOfficialReferences({venueCSVs,commonISINs,preferredISINs,classificationSourcesByISIN,six,nordic,sources}),result=arg('etf-references')?mergeTypedETFReferences(equity,JSON.parse(readFileSync(arg('etf-references')))):equity;const combined=arg('xetra-classified')?mergeClassifiedXetraReferences(result,JSON.parse(readFileSync(arg('xetra-classified')))):result;mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(combined,null,2)+'\n');console.log(JSON.stringify({rows:combined.rows.length,classified:combined.rows.filter(row=>row.assetType).length,commonISINs:commonISINs.size,preferredISINs:preferredISINs.size}));
}
