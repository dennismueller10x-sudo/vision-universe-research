/** Explicit public allowlist: no raw bars, adjusted prices or absolute factors. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function projectCandidate(r){return {ticker:r.ticker,companyName:r.companyName,securityId:r.securityId,decision:r.decision,publicationReady:r.publicationReady,reasonCodes:r.reasonCodes,policy:r.policy,productReadiness:r.productReadiness,checks:r.checks,exclusionCategory:r.exclusionCategory,previousExclusionReason:r.previousExclusionReason,previousInstrumentType:r.previousInstrumentType,
 identity:r.evidence?.identity,price:r.evidence?.price,sec:r.evidence?.sec,corporateActions:r.evidence?.corporateActions,
 marketFactors:{materialized:r.evidence?.factors?.materialized===true,basisValid:r.evidence?.factors?.basisValid===true,fieldStatus:r.evidence?.factors?.summary?.fieldStatus||null},source:r.evidence?.source};}
export function exportFindings({runDir,out}){
 const read=n=>JSON.parse(readFileSync(join(runDir,n),'utf8')),write=(n,v)=>writeFileSync(join(out,n),JSON.stringify(v,null,2)+'\n');mkdirSync(out,{recursive:true});
 const summary=read('tiingo2_final_universe_summary.json');write('tiingo2_final_universe_summary.json',summary);
 for(const name of ['tiingo2_staged_candidates.json','tiingo2_false_exclusions.json','tiingo2_split_false_rejections.json']){const doc=read(name);write(name,{...doc,rows:doc.rows.map(projectCandidate)});}
 const policy=read('tiingo2_consumer_policy_report.json');write('tiingo2_consumer_policy_report.json',{...policy,rows:policy.rows.map(projectCandidate)});
 const preview=read('tiingo2_publication_preview.json');write('tiingo2_publication_preview.json',preview);
 const fresh=read('tiingo2_fresh_discovery.json');write('tiingo2_fresh_discovery.json',{version:fresh.version,runId:fresh.runId,discoveryTimestamp:fresh.discoveryTimestamp,sourceTimestamp:fresh.sourceTimestamp,providerSource:fresh.providerSource,counts:fresh.counts,recordsSha256:fresh.recordsSha256,fullRecords:'PRIVATE_CACHE_ONLY'});
 const diff=read('tiingo2_universe_diff.json');write('tiingo2_universe_diff.json',{version:diff.version,runId:diff.runId,counts:diff.counts,safety:diff.safety,fullRecords:'PRIVATE_CACHE_ONLY'});
 const identity=read('tiingo2_symbol_changes.json');write('tiingo2_symbol_changes.json',{version:identity.version,counts:identity.counts,symbolChanges:identity.symbolChanges,retainedCount:identity.retained.length});
 const listings=read('tiingo2_new_listings.json');write('tiingo2_new_listings.json',{version:listings.version,runId:listings.runId,totalObserved:listings.records.length,
  records:listings.records.filter(r=>summary.added.includes(r.ticker)||['CART','CRCL','FIG','FLY','Q','SNDK','VLTO','SKHY','DNA'].includes(r.ticker)),providerLatencyState:'UNAVAILABLE_WITHOUT_PROVIDER_LISTED_TIMESTAMP'});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),arg=n=>a[a.indexOf(n)+1];exportFindings({runDir:resolve(arg('--run-dir')),out:resolve(arg('--out'))});}
