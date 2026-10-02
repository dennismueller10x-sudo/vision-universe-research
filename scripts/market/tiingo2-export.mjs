/** Explicit public allowlist: no raw bars, adjusted prices or absolute factors. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,x[k]]));
const priceProjection=x=>{const result=pick(x,['historyValid','latestValid','latestDate','firstDate','currency','corporateActionValid','quality','findingCodes']);if(Number.isSafeInteger(x?.bars)&&x.bars>=0)result.bars=x.bars;return result;};
export function projectCandidate(r){return {...pick(r,['ticker','companyName','securityId','decision','publicationReady','reasonCodes','exclusionCategory','previousExclusionReason','previousInstrumentType']),
 policy:pick(r.policy,['policyVersion','status','included','instrumentType','reasonCodes','source']),
 productReadiness:pick(r.productReadiness,['canonical','search','chart','watchlist','fundamentals','quant','discover','screener','superTrader','secMapped','factorsMaterialized']),
 checks:pick(r.checks,['active','historyValid','latestValid','latestDate','priceAgeDays','corporateActionValid','secMapped','fundamentalReady','quantReady']),
 identity:pick(r.evidence?.identity,['resolved','symbolCollision','wrongExchange','listingPeriodMatched','providerSymbolMatched','nameAgreement','explicitShareForm','state','staleAlias']),
 price:priceProjection(r.evidence?.price),
 sec:pick(r.evidence?.sec,['cik','available','pitValid']),
 securityForm:pick(r.evidence?.securityForm,['instrumentType','source','url','asOf','reviewed','issuerName','startDate']),
  corporateActions:r.evidence?.corporateActions?{...pick(r.evidence.corporateActions,['ok','status']),counts:pick(r.evidence.corporateActions.counts,['VALID_SPLIT','VALID_REVERSE_SPLIT','VALID_SHARE_ACTION','SUSPICIOUS_PRICE_BREAK','MISSING_PROVIDER_ACTION','BAD_SERIES','UNKNOWN']),events:(r.evidence.corporateActions.events||[]).map(e=>({...pick(e,['date','status','classification','reason']),ratios:pick(e.evidence,['expectedFactorStep','observedFactorStep','relativeError','adjustedMovePct','rawMovePct','splitFactor','dividendYield']),diagnostics:pick(e.evidence,['hasSplit','hasDividend','finiteFactorEvidence','providerActionColumnsComplete','ohlcValid','adjustmentStepIsStable','splitOnlyFactorMatches','previousCloseDividendFactorMatches','exDayCloseDividendFactorMatches'])}))}:null,
 marketFactors:{materialized:r.evidence?.factors?.materialized===true,basisValid:r.evidence?.factors?.basisValid===true},
 source:pick(r.evidence?.source,['provider','rule','observedAt','responseSha256'])};}
export function exportFindings({runDir,out}){
 const read=n=>JSON.parse(readFileSync(join(runDir,n),'utf8')),write=(n,v)=>writeFileSync(join(out,n),JSON.stringify(v,null,2)+'\n');mkdirSync(out,{recursive:true});
 const summary=read('tiingo2_final_universe_summary.json');write('tiingo2_final_universe_summary.json',summary);
 for(const name of ['tiingo2_staged_candidates.json','tiingo2_false_exclusions.json','tiingo2_split_false_rejections.json']){const doc=read(name);write(name,{...doc,rows:doc.rows.map(projectCandidate)});}
 const policy=read('tiingo2_consumer_policy_report.json');write('tiingo2_consumer_policy_report.json',{...policy,rows:policy.rows.map(projectCandidate)});
 const preview=read('tiingo2_publication_preview.json');write('tiingo2_publication_preview.json',preview);
 const fresh=read('tiingo2_fresh_discovery.json');write('tiingo2_fresh_discovery.json',{version:fresh.version,runId:fresh.runId,discoveryTimestamp:fresh.discoveryTimestamp,sourceTimestamp:fresh.sourceTimestamp,providerSource:fresh.providerSource,counts:fresh.counts,recordsSha256:fresh.recordsSha256,fullRecords:'PRIVATE_CACHE_ONLY'});
 const diff=read('tiingo2_universe_diff.json');write('tiingo2_universe_diff.json',{version:diff.version,runId:diff.runId,counts:diff.counts,safety:diff.safety,fullRecords:'PRIVATE_CACHE_ONLY'});
 const identity=read('tiingo2_symbol_changes.json');write('tiingo2_symbol_changes.json',{version:identity.version,counts:identity.counts,symbolChanges:identity.symbolChanges,retainedCount:identity.retained.length,evidenceLimitations:identity.evidenceLimitations});
 const listings=read('tiingo2_new_listings.json');write('tiingo2_new_listings.json',{version:listings.version,runId:listings.runId,totalObserved:listings.records.length,
  records:listings.records.filter(r=>summary.added.includes(r.ticker)||['CART','CRCL','FIG','FLY','Q','SNDK','VLTO','SKHY','DNA'].includes(r.ticker)),providerLatencyState:'UNAVAILABLE_WITHOUT_PROVIDER_LISTED_TIMESTAMP'});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),arg=n=>a[a.indexOf(n)+1];exportFindings({runDir:resolve(arg('--run-dir')),out:resolve(arg('--out'))});}
