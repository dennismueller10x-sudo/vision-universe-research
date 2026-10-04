/** Additive repair of native SEC consumer routing from delivered canonical
 * identity and actual PIT bundles. This module never fetches or writes facts. */
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const json=p=>JSON.parse(readFileSync(p));
export const CONSUMER_INDEX_PATH='quant/data/sec/consumer/index.json';
export function consumerIndexEntry(bundle){
 const coverage=bundle.coverage,horizons=coverage?.horizons;
 if(!coverage||!Array.isArray(coverage.annualYears)||!horizons||!coverage.quarterlyMetrics||!Array.isArray(coverage.ttmMetrics))throw Error('CONSUMER_INDEX_COVERAGE_REQUIRED');
 return {cik:bundle.cik,file:'consumer/CIK'+bundle.cik+'.json',annualYears:coverage.annualYears.length,quarterly:Math.max(0,...Object.values(coverage.quarterlyMetrics)),ttm:coverage.ttmMetrics.length>0,h3:horizons['3y'],h5:horizons['5y'],h10:horizons['10y']};
}
export function verifyConsumerBinding({ticker,security,instrument,canonical,document,bundle,asOf}){
 const cik=canonical?.cik;
 if(!date(asOf)||!security||!instrument||instrument.symbol!==ticker||instrument.masterMemberId!==security.securityId||instrument.issuerId!=='iss_cik_'+cik||instrument.cik!==cik||!/^\d{10}$/.test(cik||'')||canonical.ticker!==ticker||canonical.securityId!=='sec_'+ticker||!/^canonical\/[A-Z0-9_.-]+\.json(?:\.gz)?$/.test(canonical.file||'')||canonical.file!=='canonical/'+ticker+'.json'&&canonical.file!=='canonical/'+ticker+'.json.gz'||document?.schema!=='vu-canonical-v1'||document.security?.ticker!==ticker||document.security?.securityId!==canonical.securityId||document.security?.isMock!==false||document.dataSource?.provider!=='sec_edgar'||document.dataSource?.isMock!==false||bundle?.schema!=='vu-consumer-fundamentals-1.0.0'||bundle.cik!==cik||!date(bundle.asOf)||bundle.asOf>asOf||!bundle.tickers?.includes(ticker)||!bundle.securityIds?.includes(security.securityId)||bundle.dataSource?.provider!=='sec_edgar'||bundle.dataSource?.isMock!==false)throw Error('CONSUMER_INDEX_IDENTITY_BINDING_FAILED:'+ticker);
 const rows=['annual','quarterly'].flatMap(scope=>Object.values(bundle[scope]||{}).flat());
 if(!rows.length||rows.some(row=>!date(row[2])||!date(row[4])||row[2]>row[4]||row[4]>asOf||!row[5]))throw Error('CONSUMER_INDEX_PIT_BINDING_FAILED:'+ticker);
 return consumerIndexEntry(bundle);
}
export function restoreConsumerIndexBindings({index,canonicalRows,securities,instruments,bundles,canonicalDocuments,tickers,asOf}){
 if(!date(asOf)||!index?.byTicker||new Set(tickers).size!==tickers.length)throw Error('CONSUMER_INDEX_SCOPE_REQUIRED');
 const result=structuredClone(index),added=[],unavailable=[];
 for(const ticker of [...tickers].sort()){
  if(Object.hasOwn(result.byTicker,ticker))continue;
  const matches=canonicalRows.filter(r=>r.ticker===ticker),members=securities.filter(r=>r.ticker===ticker),master=instruments.filter(r=>r.symbol===ticker);
  if(!matches.length){unavailable.push({ticker,reason:'CANONICAL_SEC_NOT_MATERIALIZED'});continue;}
  if(matches.length!==1||members.length!==1||master.length!==1)throw Error('CONSUMER_INDEX_AMBIGUOUS_IDENTITY:'+ticker);
  const canonical=matches[0],bundle=bundles.get(canonical.cik),document=canonicalDocuments.get(ticker);
  const entry=verifyConsumerBinding({ticker,security:members[0],instrument:master[0],canonical,document,bundle,asOf});
  result.byTicker[ticker]=entry;added.push({ticker,securityId:members[0].securityId,instrumentId:master[0].instrumentId,cik:canonical.cik,file:entry.file});
 }
 result.asOf=asOf;result.count=new Set(Object.values(result.byTicker).map(row=>row.cik)).size;
 return {document:result,added,unavailable,baselineMappingsPreserved:Object.keys(index.byTicker).length};
}
export function restoreScopedConsumerIndex({root,tickers,asOf}){
 const index=json(join(root,CONSUMER_INDEX_PATH)),canonicalRows=json(join(root,'quant/data/sec/canonical_index.json')).companies,
 securities=json(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json')).securities,instruments=[];
 for(const name of readdirSync(join(root,'quant/data/universe/instruments')).filter(n=>n.endsWith('.json')))instruments.push(...json(join(root,'quant/data/universe/instruments',name)).instruments);
 const bundles=new Map(),canonicalDocuments=new Map();
 for(const row of canonicalRows.filter(r=>tickers.includes(r.ticker))){
  const p=join(root,'quant/data/sec/consumer/CIK'+row.cik+'.json');if(existsSync(p))bundles.set(row.cik,json(p));
  if(row.file==='canonical/'+row.ticker+'.json'||row.file==='canonical/'+row.ticker+'.json.gz'){
   const canonicalPath=join(root,'quant/data/sec',row.file);if(existsSync(canonicalPath)){const bytes=readFileSync(canonicalPath);canonicalDocuments.set(row.ticker,JSON.parse(row.file.endsWith('.gz')?gunzipSync(bytes):bytes));}
  }
 }
 return restoreConsumerIndexBindings({index,canonicalRows,securities,instruments,bundles,canonicalDocuments,tickers,asOf});
}
