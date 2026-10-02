/** Explicit public allowlist: no raw bars, adjusted prices or absolute factors. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,x[k]]));
const priceProjection=x=>{const result=pick(x,['historyValid','latestValid','latestDate','firstDate','currency','corporateActionValid','corporateActionFixed','legacySplitGateFalseRejectionCorrected','legacyFalseSplitDates','quality','findingCodes']);if(Number.isSafeInteger(x?.bars)&&x.bars>=0)result.bars=x.bars;return result;};
const metricStates=new Set(['CALCULATED','NOT_APPLICABLE','INSUFFICIENT_HISTORY','SOURCE_MISSING','BENCHMARK_STALE','UNAVAILABLE','WITHHELD_REDISTRIBUTION']);
function calculationProjection(value){
 const out={fieldStatus:Object.fromEntries(Object.entries(value?.fieldStatus||{}).filter(([key,status])=>/^[A-Za-z0-9._-]+$/.test(key)&&metricStates.has(status)))};
 if(['PARTIAL','COMPLETE_PRICE_METRICS','UNAVAILABLE'].includes(value?.state))out.state=value.state;
 if(['AVAILABLE','SOURCE_MISSING'].includes(value?.benchmarkState))out.benchmarkState=value.benchmarkState;
 for(const key of ['bars','calculatedFieldCount'])if(Number.isSafeInteger(value?.[key])&&value[key]>=0)out[key]=value[key];
 return out;
}
export function projectCandidate(r){return {readinessScope:'CANDIDATE_DATA_PRECONDITIONS_NOT_DELIVERED_PRODUCT_PROOF',...pick(r,['ticker','companyName','securityId','decision','publicationReady','reasonCodes','exclusionCategory','previousExclusionReason','previousInstrumentType']),
 dataReadiness:pick(r.dataReadiness,['quantCandidateEligible','privateMarketFactorsCalculated','marketCalculationState','canonicalFactorEvidenceState','canonicalFactorEvidenceVerified','canonicalFactorEvidenceReason','availableCanonicalFactors','fullQuantScoreState','fullQuantScoreReady']),
 policy:pick(r.policy,['policyVersion','status','included','instrumentType','reasonCodes','source']),
 productReadiness:pick(r.productReadiness,['canonical','search','chart','watchlist','fundamentals','quant','quantCandidateEligible','discover','screener','superTrader','secMapped','factorsMaterialized','canonicalFactorsMaterialized','fullQuantScoreReady']),
 checks:pick(r.checks,['active','historyValid','latestValid','latestDate','priceAgeDays','corporateActionValid','secMapped','fundamentalReady','quantReady','quantCandidateEligible']),
 identity:pick(r.evidence?.identity,['resolved','symbolCollision','wrongExchange','listingPeriodMatched','providerSymbolMatched','nameAgreement','explicitShareForm','state','staleAlias']),
 price:priceProjection(r.evidence?.price),
 sec:pick(r.evidence?.sec,['cik','available','pitValid']),
 securityForm:pick(r.evidence?.securityForm,['instrumentType','source','url','asOf','reviewed','issuerName','startDate']),
  corporateActions:r.evidence?.corporateActions?{...pick(r.evidence.corporateActions,['ok','status']),counts:pick(r.evidence.corporateActions.counts,['VALID_SPLIT','VALID_REVERSE_SPLIT','VALID_SHARE_ACTION','SUSPICIOUS_PRICE_BREAK','MISSING_PROVIDER_ACTION','BAD_SERIES','UNKNOWN']),events:(r.evidence.corporateActions.events||[]).map(e=>({...pick(e,['date','status','classification','reason']),ratios:pick(e.evidence,['expectedFactorStep','observedFactorStep','relativeError','adjustedMovePct','rawMovePct','splitFactor','dividendYield']),diagnostics:pick(e.evidence,['hasSplit','hasDividend','finiteFactorEvidence','providerActionColumnsComplete','ohlcValid','adjustmentStepIsStable','splitOnlyFactorMatches','previousCloseDividendFactorMatches','exDayCloseDividendFactorMatches'])}))}:null,
 marketFactors:{materialized:r.evidence?.factors?.materialized===true,basisValid:r.evidence?.factors?.basisValid===true,materializationScope:'PRIVATE_PRICE_METRIC_CALCULATION',calculation:calculationProjection(r.evidence?.factors?.calculation),canonicalEvidence:pick(r.evidence?.factors?.canonicalEvidence,['state','verified','artifactSha256']),fullQuantScore:pick(r.evidence?.factors?.fullQuantScore,['state','reason'])},
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
