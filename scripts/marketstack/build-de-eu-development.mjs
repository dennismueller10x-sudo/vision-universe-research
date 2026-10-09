/** Selected-universe replay and honest readiness reports; zero provider calls. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildReference} from './build-de-eu-reference.mjs';
import {materialize} from './materialize-de-eu.mjs';
import {evaluateListingReadiness} from './de-eu-readiness.mjs';
import {assertPrivateOutput,rejectSymlinkAncestors} from './private-output.mjs';
const ROOT=fileURLToPath(new URL('../..',import.meta.url));
const hash=s=>createHash('sha256').update(s).digest('hex');
export function buildDevelopment({source,cacheRef,out,asOf,integrationEvidence=null}){
 assertPrivateOutput(out);if(!/^[a-f0-9]{40}$/.test(cacheRef||''))throw Error('EXACT_CACHE_COMMIT_REQUIRED');
 const git=(...a)=>execFileSync('git',a,{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024});
 const json=p=>JSON.parse(git('show',cacheRef+':'+p));
 const reference=buildReference(source),cached=json('quant/data/global-market/listings.json');
 const permission=json('quant/config/marketstack-display.json');
 const allRows=reference.listingMap.listings;
 const rows=allRows.filter(r=>r.mappingStatus==='VERIFIED').map(r=>({...r,companyCountry:r.companyReference?.domicileCountry||null,
  // A proven LEI issuer reference is not a proven link to an existing VU CIK.
  referencedIssuerId:r.companyId,companyId:null,companyAssociationStatus:'EXISTING_VU_COMPANY_ASSOCIATION_UNRESOLVED',
  listingCountry:r.mic==='XETR'?'DE':null,logo:{status:'EXISTING_FALLBACK',symbol:null,companyId:null}}));
 const histories={},decisions=[];
 for(const r of rows){
  const matched=cached.listings.filter(c=>c.assetType==='EQUITY'&&c.isin===r.isin&&c.mic===r.mic);
  if(matched.length!==1){decisions.push({listingId:r.listingId,cacheStatus:'MISSING',cause:'MISSING_HISTORY'});continue;}
  const prior=matched[0];if(prior.tradingCurrency!==r.tradingCurrency||permission.allowed!==true||!permission.scope.includes(prior.listingId)){
   decisions.push({listingId:r.listingId,cacheStatus:'BLOCKED',cause:'MAPPING_ERROR'});continue;
  }
  const path='quant/data/global-market/history/'+prior.listingId+'.json',raw=git('show',cacheRef+':'+path),h=JSON.parse(raw);
  if(h.listingId!==prior.listingId||h.securityId!==prior.securityId||h.currency!==r.tradingCurrency||h.displayOnly!==true||!Array.isArray(h.bars)){
   decisions.push({listingId:r.listingId,cacheStatus:'BLOCKED',cause:'MAPPING_ERROR'});continue;
  }
  const evidence=cacheRef+':'+path+'#sha256='+hash(raw);
  histories[r.listingId]={provider:'marketstack',source:'marketstack',apiVersion:'v2',isin:r.isin,mic:r.mic,currency:r.tradingCurrency,quoteUnit:r.quoteUnit,
   retrievedAt:h.retrievedAt,sourceEvidence:evidence,cacheOnly:true,points:h.bars.map(b=>[b.date,b.close]),bars:h.bars,
   adjustmentStatus:{verified:false,priceSeriesType:'UNKNOWN',evidence:[]},quality:{...h.quality,completenessVerified:false,priceBasis:'PROVIDER_REPORTED_UNVERIFIED'}};
  decisions.push({listingId:r.listingId,cacheStatus:'PARTIAL',cause:'UNKNOWN_ADJUSTMENT_BASIS',historyStart:h.bars[0]?.date,latestCachedDate:h.bars.at(-1)?.date,
   observations:h.bars.length,retrievedAt:h.retrievedAt,sourceEvidence:evidence,fullOHLC:false,freshness:'STALE_CACHE'});
 }
 const preview=materialize({rows,histories,asOf,out});
 const proven=new Set(integrationEvidence?.listingIds||[]),proof=integrationEvidence?.evidence||null;
 const readiness=rows.map(r=>{
  const h=histories[r.listingId];
  return evaluateListingReadiness({listing:r,asOf,history:h?{...h,sourceEvidence:[h.sourceEvidence]}:{},metadata:{
   identityVerified:true,identityEvidence:r.mappingSource,currencyVerified:true,currencyEvidence:r.mappingSource,quoteUnit:r.quoteUnit,
   referenceVerified:true,referenceEvidence:r.referenceEvidence.map(e=>e.membershipSourceId),
   rights:{privateDevelopment:true,publicDisplay:false,evidence:['User instruction 2026-10-06: isolated private development; no public data grant']},
   productIntegration:Object.fromEntries(['search','detail','watchlist'].map(k=>[k,{verified:proven.has(r.listingId)&&!!proof,evidence:proof?[proof]:[]}]))}});
 });
 const byId=new Map(decisions.map(r=>[r.listingId,r]));
 const ingestion={schemaVersion:'de-eu-ingestion-status-1.0.0',asOf,scope:'CURRENT_SELECTION_NOT_HISTORICAL_INDEX',newMarketstackRequests:0,newEstimatedSymbolCredits:0,
  liveImport:{status:'BLOCKED',cause:'ACCOUNT_BUDGET_UNVERIFIED',nextStep:'Supply current account remainder after other consumers and reserve; use bounded Actions import.'},
  listings:allRows.map(r=>({...Object.fromEntries(['listingId','securityId','companyId','name','isin','mic','tradingCurrency','indexMemberships'].map(k=>[k,r[k]])),
   latestAvailable:byId.get(r.listingId)||{cacheStatus:'MISSING',cause:'MISSING_HISTORY'},currentEod:{status:'NOT_TESTED',cause:'ACCOUNT_BUDGET_UNVERIFIED'},
   rawResponses:'NOT_RETRIEVED_THIS_RUN',historicalSource:'BOUNDED_PRIOR_DISPLAY_CACHE_ONLY',publicDisplay:'BLOCKED_RIGHTS_UNCONFIRMED'}))};
 const logos={schemaVersion:'de-eu-logo-status-1.0.0',asOf,verifiedLogos:0,fallbacks:rows.length,
  listings:rows.map(r=>({listingId:r.listingId,isin:r.isin,status:'EXISTING_FALLBACK',asset:null,cause:'MAPPING_ERROR',reason:'Existing company/asset association unresolved; central reviewed-logo gate preserved.',nextStep:'Verify exact existing Company linkage or pass a new issuer domain/asset through the registered central logo producer and existing review gate.'}))};
 const n=rows.length,monthly={listings:n,modelTradingSessions:22,eodOnePageCredits:n*22,overlapCalendarDays:10,pagesPerRefresh:1,corporateActionsMonthlyCredits:0,metadataMonthlyCredits:n,
  estimatedRetriesReserve:Math.ceil(n*23*.1),formula:'Refresh: N*(22 history EOD pages + 1 monthly metadata page) + 10% retry reserve. Latest close and actions derive from the same returned history; no second latest request during refresh. Initial import additionally compares latest endpoint. Actual calendars/pagination may increase cost.'};
 monthly.estimatedSymbolCredits=monthly.eodOnePageCredits+monthly.corporateActionsMonthlyCredits+monthly.metadataMonthlyCredits+monthly.estimatedRetriesReserve;
 const budget={schemaVersion:'de-eu-request-budget-1.0.0',asOf,requestsAttempted:0,estimatedCreditsConsumed:0,accountRemainingState:'UNVERIFIED',
  runCeiling:10000,conservativeLocalMonthlyCeiling:5000,reserveCredits:500,cacheReplayProviderCost:0,monthlyRefreshModel:monthly,scheduleActivated:false,
  operatingModel:'Manual Actions only. Single encrypted shared ledger. Limited overlap; no full daily history download. Budget denial is fail-closed; no overages authorised.',
  blocker:'ACCOUNT_BUDGET_UNVERIFIED',publicDisplay:'RIGHTS_UNCONFIRMED'};
 const matrix=reference.reference.indexes.map(ix=>{
  const selected=rows.filter(r=>r.indexMemberships.includes(ix.index)),cachedRows=selected.filter(r=>histories[r.listingId]);
  return {index:ix.index,reference:ix.referenceCompleteness,referenceDate:ix.referenceDate,effectiveDate:ix.effectiveDate,targetShareClasses:ix.observedMembers,
   mappedLocalListings:selected.length,validCurrentEod:0,partialCachedCloseCharts:cachedRows.length,technicallyUsableHistory:0,verifiedLogos:0,fallbacks:selected.length,
   technicalFunctionsReady:0,open:['ACCOUNT_BUDGET_UNVERIFIED','UNKNOWN_ADJUSTMENT_BASIS','MISSING_FUNDAMENTALS','EXISTING_VU_COMPANY_ASSOCIATION_UNRESOLVED','RIGHTS_UNCONFIRMED']};
 });
 const summary={schemaVersion:'de-eu-development-summary-1.0.0',asOf,...preview,targetShareClasses:allRows.length,evidenceLinkedIssuerReferences:reference.listingMap.counts.evidenceLinkedCompanies,
  existingVuCompanyLinksIntegrated:0,providerCandidates:reference.listingMap.counts.providerCandidates,indexMatrix:matrix,publicDeployment:false,
  integrationEvidence:proof,unresolvedProviderNames:allRows.filter(r=>!r.providerSymbol).map(r=>r.name)};
 const outputs={de_eu_reference_universe:reference.reference,de_eu_listing_map:reference.listingMap,de_eu_ingestion_status:ingestion,
  de_eu_product_readiness:{schemaVersion:'de-eu-readiness-1.0.0',asOf,listings:readiness},de_eu_logo_status:logos,de_eu_request_budget:budget,de_eu_development_summary:summary};
 const reportDir=join(out,'reports/marketstack/de-eu');rejectSymlinkAncestors(reportDir);mkdirSync(reportDir,{recursive:true});
 for(const [name,data]of Object.entries(outputs)){const file=join(reportDir,name+'.json');rejectSymlinkAncestors(file);writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const columns=['name','isin','index','exchange','currency','lastPriceDate','historyStart','logo','chart','screener','quant','supertrader'];
 const csv=rows.map(r=>{const d=byId.get(r.listingId),f=readiness.find(s=>s.listingId===r.listingId)?.functions;return [r.name,r.isin,r.indexMemberships.join('|'),r.mic,r.tradingCurrency,d?.latestCachedDate,d?.historyStart,'EXISTING_FALLBACK',f?.privateCloseChart.status,f?.screener.status,f?.quantFullScore.status,f?.supertrader.status].map(q).join(',');});
 rejectSymlinkAncestors(join(reportDir,'de_eu_target_stocks.csv'));writeFileSync(join(reportDir,'de_eu_target_stocks.csv'),columns.join(',')+'\n'+csv.join('\n')+'\n');
 return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
 const out=arg('out'),asOf=arg('as-of');if(!out||!asOf)throw Error('EXPLICIT_PRIVATE_OUTPUT_AND_AS_OF_REQUIRED');
 if(!arg('source'))throw Error('EXPLICIT_PRIVATE_REFERENCE_SOURCE_REQUIRED');
 const source=JSON.parse(readFileSync(arg('source'),'utf8'));
 const proof=arg('integration-evidence');console.log(JSON.stringify(buildDevelopment({source,cacheRef:arg('cache-ref'),out,asOf,integrationEvidence:proof?JSON.parse(readFileSync(proof,'utf8')):null})));
}
