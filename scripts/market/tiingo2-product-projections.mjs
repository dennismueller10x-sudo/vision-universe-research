/** Search/chart/watchlist projections from an isolated canonical universe.
 * Uses the existing search builder, chart normalization/serialization and
 * identity/watchlist loaders. Membership and Quant readiness are separate.
 * Writes only into a private shadow root; never touches user storage.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { compactSeries, SERIES_DIR, SERIES_SCHEMA } from './publish-discover-series.mjs';

const require=createRequire(import.meta.url),codeRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const Master=require('../../quant/engines/company-master.js');
const Canonical=require('../../quant/engines/technical/canonical-bars.js');
const Quality=require('../../quant/engines/market-quality.js');
const Sampling=require('../../quant/engines/series-sampling.js');
const Directory=require('../../quant/engines/instrument-directory.js');
const ProductIdentity=require('../../server/product-identity.js');
const Watchlist=require('../../quant/api/watchlist-workspace.js');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const write=(path,value)=>{mkdirSync(dirname(path),{recursive:true});const text=JSON.stringify(value,null,2)+'\n';if(!existsSync(path)||readFileSync(path,'utf8')!==text)writeFileSync(path,text);};
const symbol=row=>String(row.ticker||row.symbol||'').trim().toUpperCase();
const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString().slice(0,10)===value;
function instruments(root){
 const path=join(root,'quant/data/universe/instruments');
 return existsSync(path)?readdirSync(path).filter(x=>x.endsWith('.json')).sort().flatMap(name=>read(join(path,name)).instruments||[]):[];
}
function loadFromRoot(root){return async path=>{
 const resolved=resolve(root,'.'+(path.startsWith('/')?path:'/'+path));
 if(!resolved.startsWith(root+'/'))throw Error('PROJECTION_PATH_OUTSIDE_SHADOW');
 return read(resolved);
};}
function memoryStorage(){const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),snapshot:()=>JSON.stringify([...entries])};}
function browserWatchlistIdentity(result,expected){
 const row=result?.instrument;
 return result?.status==='OK'&&row&&Master.inProductUniverse(row)&&
  ['COMMON_STOCK','ADR','REIT','TRUST','SPAC'].includes(row.securityType)&&
  ['EQUITY_COMMON','ADR','REIT','TRUST','SPAC'].includes(row.securityClass)&&
  row.symbol===expected.symbol&&row.instrumentId===expected.instrumentId&&/^vu_[a-f0-9]+$/.test(row.instrumentId)&&
  row.masterMemberId===expected.masterMemberId&&(row.legacyIds||[]).includes(row.masterMemberId)&&
  (!row.cik||/^\d{10}$/.test(row.cik)&&row.issuerId==='iss_cik_'+row.cik);
}

/** Build the existing chart formats after canonical action/series validation. */
export function projectChart(payload,security,{asOf}={}){
 const ticker=symbol(security),securityId=security.masterMemberId||security.securityId;
 const reasons=[];
 // The existing publisher requires 30 actual sessions for a chart. Short
 // listings may still supply a validated latest quote without chart readiness.
 if(!payload||!Array.isArray(payload.bars)||payload.bars.length<2)reasons.push('INSUFFICIENT_CHART_HISTORY');
 if(payload&&(payload.provider!=='tiingo'||symbol(payload)!==ticker||payload.securityId!==securityId))reasons.push('PRICE_IDENTITY_MISMATCH');
 const currency=payload?.currency||security.currency;
 if(!currency)reasons.push('PRICE_CURRENCY_UNRESOLVED');
 if(payload?.currency&&security.currency&&payload.currency!==security.currency)reasons.push('PRICE_CURRENCY_MISMATCH');
 if(reasons.length)return {ready:false,reasonCodes:reasons};
 const bars=payload.bars;
 const latest=String(bars.at(-1)?.date||'').slice(0,10),age=(Date.parse(asOf)-Date.parse(latest))/86400000;
 if(!isDate(latest)||!Number.isFinite(age)||age<0||age>7)reasons.push('LATEST_CHART_BAR_STALE_OR_FUTURE');
 const structural=Quality.validateBars(bars,{today:asOf,adjustmentStatus:payload.adjustmentStatus||'adjusted'});
 if(!structural.ok||structural.bars.length!==bars.length||structural.bars.some((bar,i)=>bar.date!==bars[i].date))reasons.push('INVALID_CHART_SERIES');
 const actionGate=Quality.classifyCorporateActions(bars);
 if(!actionGate.ok)reasons.push(actionGate.status||'CORPORATE_ACTION_NOT_VERIFIED');
 if(reasons.length)return {ready:false,reasonCodes:[...new Set(reasons)],corporateActionStatus:actionGate.status};
 const actions=[];
 for(const bar of bars){
  if(bar.splitFactor!==1)actions.push({type:'split',exDate:bar.date,ratio:bar.splitFactor});
  if(Number.isFinite(bar.dividend)&&bar.dividend>0)actions.push({type:'dividend',exDate:bar.date,amount:bar.dividend});
 }
 const canonical=Canonical.fromPriceBars(bars,actions,{instrumentId:security.instrumentId,source:'tiingo',sourceRevision:payload.updatedAt||payload.fetchedAt,currency,exchange:security.exchange});
 if(!Canonical.validateSeries(canonical.SPLIT_ADJUSTED).valid)return {ready:false,reasonCodes:['INVALID_CANONICAL_CHART_SERIES']};
 const daily=compactSeries({...payload,currency},{ticker,securityId},{basis:'ISOLATED_TIINGO2_CANONICAL_PROJECTION',checkedAt:asOf},{minPoints:2});
 if(!daily)return {ready:false,reasonCodes:['INSUFFICIENT_CHART_HISTORY']};
 const canonicalByDate=new Map(canonical.SPLIT_ADJUSTED.timestamps.map((day,i)=>[day,canonical.SPLIT_ADJUSTED.close[i]]));
 if(daily.points.some(([day,close])=>!(close>0)||Math.abs(close-canonicalByDate.get(day))>0.00501))return {ready:false,reasonCodes:['CHART_CANONICAL_ADJUSTMENT_MISMATCH']};
 const weekly=Sampling.weeklyPoints(canonical.SPLIT_ADJUSTED.timestamps.map((day,i)=>[day,canonical.SPLIT_ADJUSTED.close[i]]));
 const long={schemaVersion:'discover-series-long-1.0.0',status:'CALCULATED',source:'tiingo',provider:'tiingo',dataMode:'real',
  securityId,ticker,instrumentId:ticker,currency,priceSeriesType:'SPLIT_ADJUSTED',range:'MAX',grain:'weekly',
  from:weekly[0][0],to:weekly.at(-1)[0],asOf:weekly.at(-1)[0],points:weekly.map(([day,close])=>[day,Math.round(close*100)/100]),
  barCount:weekly.length,sourceBarCount:bars.length,sourceFirst:bars[0].date,sourceLast:bars.at(-1).date,
  publishBasis:'ISOLATED_TIINGO2_CANONICAL_PROJECTION',publishCheckedAt:asOf};
 const longReady=long.points.length>=30&&long.points.every(([,close])=>close>0);
 const chartReady=daily.points.length>=30;
 daily.corporateActionStatus=actionGate.status;
 if(/^[a-f0-9]{64}$/.test(payload.provenance?.sourceResponseSha256||''))daily.sourceResponseSha256=payload.provenance.sourceResponseSha256;
 return {ready:chartReady,priceReady:true,reasonCodes:chartReady?[]:['CHART_BLOCKED_SHORT_HISTORY'],daily,long:longReady?long:null,longReady,longReasonCodes:longReady?[]:[long.points.length<30?'INSUFFICIENT_LONG_CHART_HISTORY':'LONG_CHART_PRECISION_LIMIT'],canonicalProof:{dataHash:canonical.SPLIT_ADJUSTED.dataHash,sourceRevision:canonical.SPLIT_ADJUSTED.sourceRevision,
  bars:canonical.SPLIT_ADJUSTED.length,currency,priceSeriesType:'SPLIT_ADJUSTED',corporateActionStatus:actionGate.status,
  firstDate:canonical.SPLIT_ADJUSTED.timestamps[0],lastDate:canonical.SPLIT_ADJUSTED.timestamps.at(-1),historyCoverage:daily.points.length<30?'SHORT_HISTORY':'STANDARD_HISTORY',
  totalReturnAvailable:!!canonical.TOTAL_RETURN,splitActions:actions.filter(a=>a.type==='split').length,dividendActions:actions.filter(a=>a.type==='dividend').length}};
}

/** Restore entries of unaffected baseline instruments after the existing
 * builder runs. Target members receive current canonical readiness/name data;
 * other securities keep the exact search entries already delivered.
 */
function preserveBaselineSearch(sourceRoot,shadowRoot,targetIds){
 const baseline=join(sourceRoot,'quant/data/universe/search'),shadow=join(shadowRoot,'quant/data/universe/search');
 for(const kind of ['sym','name']){
  const dir=join(baseline,kind);if(!existsSync(dir))continue;
  for(const name of readdirSync(dir).filter(x=>x.endsWith('.json'))){
   const old=read(join(dir,name)),path=join(shadow,kind,name),rebuilt=existsSync(path)?read(path):{shard:old.shard,entries:[]};
   const retained=(old.entries||[]).filter(row=>!targetIds.has(row.i)),unaffectedIds=new Set(retained.map(row=>row.i));
   const entries=[...retained,...(rebuilt.entries||[]).filter(row=>!unaffectedIds.has(row.i))].sort((a,b)=>String(a.s).localeCompare(String(b.s)));
   write(path,{...rebuilt,shard:old.shard,count:entries.length,entries});
  }
 }
 const manifestPath=join(shadow,'manifest.json'),manifest=read(manifestPath);
 for(const kind of ['sym','name'])manifest[kind]=readdirSync(join(shadow,kind)).filter(x=>x.endsWith('.json')).sort().map(name=>{const doc=read(join(shadow,kind,name));return {shard:doc.shard,count:doc.entries.length};});
 manifest.totals.symbolShards=manifest.sym.length;manifest.totals.nameShards=manifest.name.length;
 manifest.totals.nameIndexEntries=manifest.name.reduce((n,row)=>n+row.count,0);
 write(manifestPath,manifest);
}

function baselinePublishedChart(sourceRoot,row,capability){
 const artifactPath='/'+SERIES_DIR+'/'+row.masterMemberId+'.json',path=join(sourceRoot,artifactPath.slice(1));
 const longPath='/quant/data/market/discover-series-long/'+row.masterMemberId+'.json',longFile=join(sourceRoot,longPath.slice(1));
 return {state:capability?'PRESERVED_BASELINE':'NO_PUBLISHED_CAPABILITY',
  priceHistoryDeclared:capability?.ph===true,priceSnapshotDeclared:capability?.ps===true,
  technicalState:capability?.t||null,factorReadyDeclared:capability?.fr===true,
  dailyPath:existsSync(path)?artifactPath:null,dailyArtifactSha256:existsSync(path)?sha(readFileSync(path,'utf8')):null,
  longPath:existsSync(longFile)?longPath:null,longArtifactSha256:existsSync(longFile)?sha(readFileSync(longFile,'utf8')):null,
  source:'EXISTING_PUBLISHED_BASELINE',freshValidationIncluded:false};
}

function recordActualMarketCapabilities(sourceRoot,shadowRoot,readiness){
 const path=join(shadowRoot,'quant/data/universe/market-capability.json');if(!existsSync(path))return;
 const document=read(path),byId=new Map(readiness.map(row=>[row.securityId,row]));
 const baselinePath=join(sourceRoot,'quant/data/universe/market-capability.json');
 const baselineById=new Map((existsSync(baselinePath)?read(baselinePath).members||[]:[]).map(member=>[member.m,member]));
 let updated=0,preserved=0;
 document.members=(document.members||[]).map(member=>{
  const item=byId.get(member.m),baseline=baselineById.get(member.m);
  // A failed refresh is diagnostic evidence about its fresh input. It cannot
  // revoke a capability already published for the same canonical identity.
  if(baseline&&(!item||item.chart.ready!==true)){preserved++;return baseline;}
  if(!item)return member;
  // Old coverage reports enumerate exceptions only within their old measured
  // population. An absent new symbol is not proof of chart/technical readiness.
  member.ph=item.chart.ready;member.ps=item.chart.priceReady===true;member.b=item.chart.canonicalProof?.bars||0;
  member.fr=false;member.t=null;member.q=item.chart.priceReady?'PASS':'REVIEW';
  member.f=item.chart.canonicalProof?.firstDate||null;member.l=item.chart.canonicalProof?.lastDate||null;
  member.src='tiingo2:actual-canonical-chart-projection';
  updated++;return member;
 });
 const members=document.members||[];
 document.totals={...document.totals,MEMBERS:members.length,WITH_PRICE_HISTORY:members.filter(row=>row.ph).length,WITH_PRICE_SNAPSHOT:members.filter(row=>row.ps).length,
  FACTOR_READY:members.filter(row=>row.fr).length,TECHNICAL_READY:members.filter(row=>row.t==='TECHNICAL_READY').length,TECHNICAL_INSUFFICIENT_HISTORY:members.filter(row=>row.t==='INSUFFICIENT_HISTORY').length};
 document.incrementalEvidence={source:'ACTUAL_CANONICAL_CHART_PROJECTION',technicalState:'REQUIRES_EXISTING_TECHNICAL_ENGINE_MATERIALIZATION',scopedSecurities:readiness.length,updatedSecurities:updated,preservedBaselineSecurities:preserved};
 write(path,document);
}

export async function materializeProductProjections({sourceRoot=codeRoot,shadowRoot,securities=[],pricePayloads=new Map(),asOf,runSearchBuilder=true}={}){
 sourceRoot=resolve(sourceRoot);shadowRoot=resolve(shadowRoot||'');
 if(shadowRoot===sourceRoot||!shadowRoot.startsWith(join(sourceRoot,'.market-cache')+'/'))throw Error('ISOLATED_PRIVATE_SHADOW_ROOT_REQUIRED');
 if(!isDate(asOf))throw Error('PRODUCT_PROJECTION_AS_OF_REQUIRED');
 const master=instruments(shadowRoot),baseline=instruments(sourceRoot),baselineById=new Map(baseline.map(row=>[row.instrumentId,row]));
 const baselineCapabilityPath=join(sourceRoot,'quant/data/universe/market-capability.json');
 const baselineCapabilities=new Map((existsSync(baselineCapabilityPath)?read(baselineCapabilityPath).members||[]:[]).map(row=>[row.m,row]));
 const byTicker=new Map();for(const row of master){const t=symbol(row);byTicker.set(t,[...(byTicker.get(t)||[]),row]);}
 const requested=[...new Set(securities.map(symbol))].sort(),targetRows=[],readiness=[];
 for(const ticker of requested){
  const wanted=securities.find(row=>symbol(row)===ticker),matches=(byTicker.get(ticker)||[]).filter(row=>wanted.instrumentId?row.instrumentId===wanted.instrumentId:row.masterMemberId===(wanted.masterMemberId||wanted.securityId));
  const row=matches.length===1?matches[0]:null;
  if(!row||!Master.inProductUniverse(row)||!row.masterMemberId||!(row.legacyIds||[]).includes(row.masterMemberId)){
   readiness.push({ticker,securityId:wanted.masterMemberId||wanted.securityId||null,instrumentId:wanted.instrumentId||null,search:{ready:false,reasonCodes:['CANONICAL_IDENTITY_NOT_ELIGIBLE']},chart:{ready:false,reasonCodes:['CANONICAL_IDENTITY_NOT_ELIGIBLE']},watchlist:{ready:false,reasonCodes:['CANONICAL_IDENTITY_NOT_ELIGIBLE']}});continue;
  }
  const old=baselineById.get(row.instrumentId);
  if(old&&old.masterMemberId!==row.masterMemberId)throw Error('BASELINE_SECURITY_ID_CHANGED');
  targetRows.push(row);
  const payload=pricePayloads instanceof Map?pricePayloads.get(ticker):pricePayloads[ticker];
  const chart=projectChart(payload,row,{asOf});
  if(chart.priceReady){
   write(join(shadowRoot,SERIES_DIR,row.masterMemberId+'.json'),chart.daily);
   if(chart.longReady)write(join(shadowRoot,'quant/data/market/discover-series-long',row.masterMemberId+'.json'),chart.long);
  }
  readiness.push({ticker,securityId:row.masterMemberId,instrumentId:row.instrumentId,issuerId:row.issuerId||null,isBaseline:!!old,
   search:{ready:false,reasonCodes:['SEARCH_NOT_CHECKED']},chart:{ready:chart.ready,priceReady:chart.priceReady===true,reasonCodes:chart.reasonCodes,
    priceProjectionPath:chart.priceReady?'/'+SERIES_DIR+'/'+row.masterMemberId+'.json':null,
    eligibilityEvidence:chart.priceReady&&!chart.ready?{priceArtifactPath:SERIES_DIR+'/'+row.masterMemberId+'.json'}:null,
    freshValidationState:chart.priceReady?'VALIDATED':'BLOCKED',baselinePublished:old?baselinePublishedChart(sourceRoot,old,baselineCapabilities.get(old.masterMemberId)):null,
    dailyPath:chart.ready?'/'+SERIES_DIR+'/'+row.masterMemberId+'.json':null,longPath:chart.longReady?'/quant/data/market/discover-series-long/'+row.masterMemberId+'.json':null,
    longReady:chart.longReady===true,longReasonCodes:chart.longReasonCodes||[],canonicalProof:chart.canonicalProof||null},
   watchlist:{ready:false,reasonCodes:['WATCHLIST_NOT_CHECKED']},quant:{ready:false,reasonCodes:['SEPARATE_CANONICAL_FACTOR_AND_FUNDAMENTAL_REQUIREMENTS']}});
 }
 // The existing builder projects the canonical master and actual delivered
 // chart artifacts. It never receives a private per-product symbol universe.
 if(runSearchBuilder){
  execFileSync(process.execPath,[join(codeRoot,'scripts/universe/build-universe-indexes.mjs'),'--root',shadowRoot],{cwd:shadowRoot,encoding:'utf8',maxBuffer:8*1024*1024});
  preserveBaselineSearch(sourceRoot,shadowRoot,new Set(targetRows.map(row=>row.instrumentId)));
  recordActualMarketCapabilities(sourceRoot,shadowRoot,readiness);
 }
 const loadJSON=loadFromRoot(shadowRoot),directory=Directory.create({loadJSON});
 for(const item of readiness){
  const row=targetRows.find(row=>row.instrumentId===item.instrumentId);if(!row)continue;
  const queries=[row.symbol,row.companyName,...(row.symbolAliases||[]),...(row.companyNameAliases||[]),...(row.nameAliases||[])].filter(Boolean);
  const searchChecks=[];
  for(const query of [...new Set(queries)]){const result=await directory.search(query,{limit:500});searchChecks.push({query,found:result.entries.some(entry=>entry.i===row.instrumentId)});}
  item.search={ready:searchChecks.every(check=>check.found),reasonCodes:searchChecks.every(check=>check.found)?[]:['CANONICAL_SEARCH_PROJECTION_MISSING'],checks:searchChecks};
  // Quant's actual consumer and Watchlist APIs resolve through this canonical
  // browser directory. Its existing product scope includes preserved REVIEW
  // rows such as DNA. The stricter server policy is a separate diagnostic.
  const identity=await directory.getInstrument({symbol:row.symbol,instrumentId:row.instrumentId});
  const legacy=await directory.getInstrument(row.masterMemberId);
  const serverIdentity=await ProductIdentity.resolveIdentity({ticker:row.symbol,securityId:row.instrumentId},{loadJSON});
  const storage=memoryStorage();storage.setItem('vu.quant.watchlist.v1','protected-existing-user-selection');
  const legacyBefore=storage.getItem('vu.quant.watchlist.v1');
  Watchlist.saveCanonical(storage,[{ticker:row.symbol,securityId:row.instrumentId,masterMemberId:row.masterMemberId}]);
  const loaded=Watchlist.load(storage),canonicalLoaded=Watchlist.loadCanonical(storage);
  const model=Watchlist.build(loaded,{state:'AVAILABLE',stocks:[{ticker:row.symbol,securityId:row.instrumentId,masterMemberId:row.masterMemberId,name:row.companyName,state:'AVAILABLE'}]});
  const primaryResolved=browserWatchlistIdentity(identity,row),legacyResolved=browserWatchlistIdentity(legacy,row);
  const persisted=canonicalLoaded.length===1&&canonicalLoaded[0].ticker===row.symbol&&canonicalLoaded[0].securityId===row.instrumentId&&canonicalLoaded[0].masterMemberId===row.masterMemberId;
  Watchlist.removeCanonical(storage,row.instrumentId);
  const removed=Watchlist.loadCanonical(storage).length===0&&Watchlist.load(storage).length===0;
  const stable=primaryResolved&&legacyResolved&&persisted&&removed&&model.members[0].securityId===row.instrumentId&&storage.getItem('vu.quant.watchlist.v1')===legacyBefore;
  item.watchlist={ready:stable,reasonCodes:stable?[]:['CANONICAL_WATCHLIST_IDENTITY_NOT_RESOLVED'],persistentSelectionRoundtrip:loaded[0]===row.symbol,canonicalIdPreserved:stable,legacyIdResolved:legacyResolved,
   canonicalIdPersisted:persisted,addReloadRemoveRoundtrip:removed,persistenceProof:'LOCAL_STORAGE_CONTRACT',liveBrowserValidation:'PENDING',
   identitySource:'EXISTING_CANONICAL_BROWSER_DIRECTORY',serverEligibilityState:serverIdentity.state,existingUserStorageTouched:false};
 }
 const dailyDir=join(shadowRoot,SERIES_DIR),longDir=join(shadowRoot,'quant/data/market/discover-series-long');
 for(const [dir,schema] of [[dailyDir,'discover-series-index-1.0.0'],[longDir,'discover-series-long-index-1.0.0']]){
  if(!existsSync(dir))continue;const files=readdirSync(dir).filter(name=>name.endsWith('.json')&&name!=='index.json').sort();
  write(join(dir,'index.json'),{schemaVersion:schema,generatedAt:asOf,count:files.length,pathPattern:'/'+relative(shadowRoot,dir)+'/<securityId>.json',source:'CANONICAL_COMPANY_MASTER',scope:'EXISTING_BASELINE_AND_INCREMENTAL_CANONICAL_ADDITIONS'});
 }
 const report={schemaVersion:'tiingo2-product-projections-1',asOf,source:'CANONICAL_COMPANY_MASTER',productionMutations:0,requested:requested.length,
  counts:{search:readiness.filter(row=>row.search.ready).length,chart:readiness.filter(row=>row.chart.ready).length,watchlist:readiness.filter(row=>row.watchlist.ready).length},
  rows:readiness,artifactHashes:Object.fromEntries(readiness.filter(row=>row.chart.priceReady).flatMap(row=>[row.chart.priceProjectionPath,row.chart.longPath].filter(Boolean).map(path=>[path,sha(readFileSync(join(shadowRoot,path.slice(1)),'utf8'))])))};
 write(join(shadowRoot,'quant/data/universe/tiingo2-product-projections.json'),report);
 return {shadowRoot,report,readiness,paths:{search:'/quant/data/universe/search/manifest.json',charts:'/'+SERIES_DIR+'/',longCharts:'/quant/data/market/discover-series-long/',report:'/quant/data/universe/tiingo2-product-projections.json'}};
}
