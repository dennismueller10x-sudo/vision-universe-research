/** Concrete read-only productization through existing builders. All writes
 * remain in an isolated private shadow; export contains derived status only. */
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,copyFileSync,cpSync,lstatSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareProductizationShadow,reconcileShadowIssuerMappings,initializeShadowGit,loadCandidatePriceInputs,assessProductizationReplay} from './tiingo2-productize.mjs';
import {materializeFundamentals,runExistingProcess} from './tiingo2-fundamentals.mjs';
import {materializeFactors} from './tiingo2-factors.mjs';
import {materializeProductProjections} from './tiingo2-product-projections.mjs';
import {materializeProductSurfaces} from './tiingo2-product-surfaces.mjs';
import {materializeLogos} from './tiingo2-logos.mjs';
import {resolveReviewCandidates,REVIEW_RESOLUTION_VERSION} from './tiingo2-review-resolution.mjs';
import {parseExchangeDirectory,selectCurrentListings} from './tiingo2-refresh.mjs';
import {classifyCandidate} from './tiingo2-policy.mjs';
import {attachCanonicalProjections,isProductizationProjectionPath} from './tiingo2-publication.mjs';
import {resolveProductUniverse} from './universe-source.mjs';
import {createRequire} from 'node:module';
import {buildRelease,permitted} from '../vu2/build-release.mjs';
import {restoreBenchmarkReference} from './tiingo2-benchmark-reference.mjs';
import {prepareHistoryPublication} from './tiingo2-history-preparation.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const Company=createRequire(import.meta.url)('../../quant/engines/company-master.js');
const write=(p,d)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(d,null,2)+'\n');};
const byTicker=rows=>new Map((rows||[]).map(r=>[r.ticker,r]));
export function assembleLogoCandidates({prepared,projection,fundamentals}){
 const securities=byTicker(prepared.priceSecurities||prepared.securities),projected=byTicker(projection.report?.rows||projection.rows),secRows=byTicker(fundamentals.rows);
 const cik=value=>/^\d{1,10}$/.test(String(value??''))?String(value).padStart(10,'0'):null;
 return (prepared.priceCandidates||prepared.candidates).map(candidate=>{
  const security=securities.get(candidate.ticker),companyId=security?.companyId||security?.issuerId||candidate.companyId||candidate.company_id||
   (cik(security?.cik)?'iss_cik_'+cik(security.cik):null);
  // Accepted discovery candidates retain their audited identity evidence.
  // Existing regression members need fresh canonical/SEC proof; old raw rows
  // contain no decision identity and a preserved chart alone proves nothing.
  if(candidate.regressionCase!==true)return {...candidate,companyId};
  const product=projected.get(candidate.ticker),sec=secRows.get(candidate.ticker),canonicalCik=cik(security?.cik);
  const resolved=!!(security&&prepared.pricePayloads?.has(candidate.ticker)&&product?.watchlist?.ready===true&&
   product.securityId===security.securityId&&product.instrumentId===security.instrumentId&&
   product.chart?.freshValidationState==='VALIDATED'&&product.chart?.canonicalProof?.corporateActionStatus==='PASS'&&
   sec?.pitValid===true&&sec.securityId===security.securityId&&canonicalCik&&canonicalCik===cik(sec.cik));
  const identity={resolved,source:'FRESH_CANONICAL_PRICE_SEC_IDENTITY',securityId:security?.securityId||null,
   instrumentId:security?.instrumentId||null,cik:resolved?canonicalCik:null,corporateActionGateWaived:false};
  return {...candidate,companyId,cik:resolved?canonicalCik:candidate.cik,identityVerified:resolved,identity,
   evidence:{...candidate.evidence,identity}};
 });
}
export function resolvePrivateReview({root,sourceCache,sourceRun,asOf,workDir}){
 const policy=read(join(sourceRun,'tiingo2_consumer_policy_report.json')),staged=read(join(sourceRun,'tiingo2_staged_candidates.json'));
 const discovery=read(join(sourceRun,'tiingo2_fresh_discovery.json')),listings=byTicker(selectCurrentListings(discovery.records,asOf).selected),cacheEntries=[];
 const upper=v=>String(v||'').trim().toUpperCase(),hashJSON=v=>sha(JSON.stringify(v));
 // Preserve conflicting matching metadata instead of last-wins ticker maps.
 // Every selected response must be the exact listing and response audited.
 const evidenceDir=join(sourceCache,'evidence');
 if(existsSync(evidenceDir))for(const file of readdirSync(evidenceDir).filter(n=>/^[a-f0-9]{64}\.json$/.test(n))){
  const entry=read(join(evidenceDir,file));
  if(entry.key+'.json'!==file)throw Error('PRIVATE_EVIDENCE_CACHE_KEY_MISMATCH');
  if(!entry.metadata?.ticker||!Array.isArray(entry.rows)||!entry.rows.length)continue;
  const responseHash=hashJSON(entry.rows),observed=String(entry.summary?.source?.observedAt||'').slice(0,10);
  if(responseHash!==entry.summary?.source?.responseSha256||!/^\d{4}-\d{2}-\d{2}$/.test(observed)||observed>asOf)continue;
  cacheEntries.push({metadata:entry.metadata,responseHash});
 }
 const officials=[];
 for(const source of ['nasdaqlisted','otherlisted']){const file=join(sourceCache,'directories',asOf+'-'+source+'.txt');if(existsSync(file))officials.push(...parseExchangeDirectory(readFileSync(file,'utf8'),source));}
 const metadata=[];
 const candidates=staged.rows.map(row=>{
  const listing=listings.get(row.ticker),evidence=structuredClone(row.evidence||{identity:row.identity,price:row.price,sec:row.sec,factors:row.marketFactors,securityForm:row.securityForm,source:row.source});
  const matches=cacheEntries.filter(entry=>upper(entry.metadata.ticker)===row.ticker&&entry.metadata.startDate===listing?.startDate&&upper(entry.metadata.exchangeCode||entry.metadata.exchange)===upper(listing?.exchange)&&entry.responseHash===evidence.source?.responseSha256);
  metadata.push(...matches.map(entry=>entry.metadata));
  const currency=new Set(matches.map(entry=>entry.metadata.currency).filter(Boolean));
  return {...listing,ticker:row.ticker,securityId:row.securityId,companyName:row.companyName,instrument_type:row.policy?.instrumentType,evidence,currency:currency.size===1?[...currency][0]:evidence.price?.currency};
 });
 const manualSymbols=new Set(staged.rows.filter(row=>row.decision==='MANUAL_REVIEW').map(row=>row.ticker));
 const replay=loadCandidatePriceInputs({sourceCache,candidates:candidates.filter(row=>manualSymbols.has(row.ticker)),today:asOf});
 for(const candidate of candidates.filter(row=>manualSymbols.has(row.ticker))){
  const result=replay.get(candidate.ticker),expected=candidate.evidence.source?.responseSha256;
  if(result?.state==='READY'&&result.responseHash===expected)candidate.evidence.price=result.assessed.price;
  else candidate.evidence.price={...candidate.evidence.price,...result?.assessed?.price,historyValid:false,latestValid:false,corporateActionValid:false};
 }
 const formsFile=join(root,'docs/tiingo2-productization/review-security-form-evidence.json'),forms=existsSync(formsFile)?read(formsFile):[];
 const baselineRows=read(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json')).securities;
 const report=resolveReviewCandidates({candidateRows:candidates,priorReviewRows:staged.rows,officialRows:officials,providerMetadata:metadata,reviewedSecurityForms:Array.isArray(forms)?forms:forms.rows||[],baselineRows,asOf});
 for(const row of report.rows){const result=replay.get(row.ticker);row.privatePriceReplay={state:result?.state||'BLOCKED',reason:result?.reason||null,responseMatchesAudit:result?.responseHash===candidates.find(c=>c.ticker===row.ticker)?.evidence.source?.responseSha256};if(!row.privatePriceReplay.responseMatchesAudit)row.reasonCodes=[...new Set([...row.reasonCodes,'AUDITED_PRIVATE_PRICE_RESPONSE_REQUIRED'])].sort();}
 // An independent policy rerun follows actual private raw/adjusted/action
 // replay. No stale public summary or corporate-action waiver grants admission.
 const additional=report.acceptedCandidates.filter(c=>classifyCandidate(c,{today:asOf,root,peers:[...candidates,...baselineRows]}).publicationReady);
 const derivedRun=join(workDir,'resolved-source');mkdirSync(derivedRun,{recursive:true});
 cpSync(join(sourceRun,'canonical'),join(derivedRun,'canonical'),{recursive:true});
 copyFileSync(join(sourceRun,'tiingo2_fresh_discovery.json'),join(derivedRun,'tiingo2_fresh_discovery.json'));
 const evaluated=new Map(report.overlays.map(o=>[o.ticker,classifyCandidate(o.candidate,{today:asOf,root,peers:[...candidates,...baselineRows]})]));
 const overlayPolicy={...policy,rows:policy.rows.map(r=>evaluated.get(r.ticker)||r)};
 overlayPolicy.counts={total:overlayPolicy.rows.length,AUTO_ACCEPT:0,ACCEPT_AFTER_FIX:0,MANUAL_REVIEW:0,REJECT_WITH_REASON:0,publicationReady:0,quantCandidateEligible:0,quantReady:0};overlayPolicy.reasonCounts={};
 for(const row of overlayPolicy.rows){overlayPolicy.counts[row.decision]++;if(row.publicationReady)overlayPolicy.counts.publicationReady++;if(row.productReadiness?.quantCandidateEligible)overlayPolicy.counts.quantCandidateEligible++;if(row.productReadiness?.quant)overlayPolicy.counts.quantReady++;for(const code of row.reasonCodes||[])overlayPolicy.reasonCounts[code]=(overlayPolicy.reasonCounts[code]||0)+1;}
 const preview=read(join(sourceRun,'tiingo2_publication_preview.json')),initialAcceptedCount=preview.ADDED.length;
 const proofArtifact={schemaVersion:'tiingo2-review-resolution-proof-1',resolverVersion:REVIEW_RESOLUTION_VERSION,asOf,sourceManifestSha256:sha(readFileSync(join(sourceRun,'canonical/manifest.json'))),additional:additional.map(candidate=>{
  const overlay=report.overlays.find(row=>row.ticker===candidate.ticker),proof=overlay?.proof.find(p=>p.kind==='TECHNICAL_SECURITY_FORM_NAME_AND_VENUE_RESOLUTION');
  if(!proof||proof.providerResponseSha256!==candidate.evidence.source.responseSha256)throw Error('REVIEW_PUBLICATION_BOUND_PROOF_REQUIRED:'+candidate.ticker);
  return {ticker:candidate.ticker,securityId:candidate.securityId,listingKey:overlay.listingKey,decision:'AUTO_RESOLVED',corporateActionGateWaived:false,providerMetadataHash:proof.providerMetadataSha256,providerResponseSha256:proof.providerResponseSha256,officialEvidenceHash:proof.officialEvidenceSha256,proof:overlay.proof};
 })};
 const proofFile=join(derivedRun,'review-resolution-proof.json');write(proofFile,proofArtifact);preview.reviewResolutionProofSha256=sha(readFileSync(proofFile));
 preview.ADDED.push(...additional.map(c=>({ticker:c.ticker,securityId:c.securityId,reasonCodes:['TECHNICAL_REVIEW_RESOLVED_WITH_LISTING_BOUND_EVIDENCE']})));
 preview.REMOVED=[];if(preview.counts){preview.counts.added=preview.ADDED.length;preview.counts.removed=0;preview.counts.after=preview.counts.before+preview.ADDED.length;for(const key of ['ADDED','REMOVED','RECLASSIFIED','UNCHANGED'])if(key in preview.counts&&Array.isArray(preview[key]))preview.counts[key]=preview[key].length;}
 write(join(derivedRun,'tiingo2_consumer_policy_report.json'),overlayPolicy);write(join(derivedRun,'tiingo2_publication_preview.json'),preview);
 write(join(workDir,'review-private.json'),report);
 const {overlays,acceptedCandidates,...publicReport}=report;publicReport.additionalAccepted=additional.map(c=>c.ticker).sort();publicReport.reviewProofSha256=preview.reviewResolutionProofSha256;
 return {sourceRun:derivedRun,additional,initialAcceptedCount,publicReport};
}
function walk(root,path){const dir=join(root,path);if(!existsSync(dir))return [];return readdirSync(dir).flatMap(name=>{const p=join(path,name);return lstatSync(join(root,p)).isDirectory()?walk(root,p):[p];});}
export async function runProductization({root=process.cwd(),sourceCache=join(root,'.market-cache/tiingo2'),sourceRun,workDir=join(root,'.market-cache/tiingo2-productization'),asOf=new Date().toISOString().slice(0,10),runId='tiingo2-'+Date.now(),out=join(root,'.verification/tiingo2-productization'),releaseOutput,benchmarkPreflight,allowNetwork=true,onProgress=()=>{}}={}){
 root=resolve(root);sourceCache=resolve(sourceCache);workDir=resolve(workDir);out=resolve(out);
 if(!sourceRun){const runs=join(sourceCache,'runs');sourceRun=readdirSync(runs).filter(n=>existsSync(join(runs,n,'canonical/manifest.json'))).sort().map(n=>join(runs,n)).at(-1);}
 if(!sourceRun)throw Error('ACCEPTED_SOURCE_RUN_REQUIRED');
 const replay=assessProductizationReplay({root,sourceRun,sourceCache,asOf});
 if(replay.state==='BLOCKED_REQUIRES_FRESH_DIFF')throw Error('PARTIAL_CANONICAL_PUBLICATION_REQUIRES_FRESH_DIFF');
 if(replay.state==='NO_CHANGES'){
  const summary={schemaVersion:'tiingo2-productization-status-1.0.0',runId,asOf,currentProduction:replay.currentConsumer,proposedConsumer:replay.currentConsumer,acceptedBaseline:0,additionalAccepted:0,canonicalMaterialized:0,removed:0,quant:{QUANT_FULL:0,PARTIAL:0,TECHNICAL_ONLY:0,BLOCKED:0},productionWrites:0,publicationState:'NO_CHANGES',attachmentBlocker:null,rows:[],replay};
  write(join(out,'tiingo2_productization_status.json'),summary);
  for(const name of ['accepted_materialization','review_resolution','quant_readiness','product_readiness','logo_status','chart_status'])write(join(out,'tiingo2_'+name+'.json'),{runId,state:'NO_CHANGES',scope:'NO_INCREMENTAL_SECURITIES_REBUILT',rows:[],productionWrites:0});
  write(join(out,'tiingo2_publication_diff.json'),{runId,state:'NO_CHANGES',ADDED:[],REVIEW:[],REJECTED:[],REMOVED:[],productionWrites:0});
  write(join(out,'tiingo2_final_consumer_universe.json'),{runId,current:replay.currentConsumer,proposed:replay.currentConsumer,ADDED:[],REMOVED:[],publicationState:'NO_CHANGES',productionWrites:0});
  return summary;
 }
 onProgress('Resolving listing-bound review evidence\n');
 const review=resolvePrivateReview({root,sourceCache,sourceRun,asOf,workDir});
 const currentProduction=resolveProductUniverse(root).securities.filter(r=>r.consumer).length;
 const prepared=prepareProductizationShadow({root,sourceCache,sourceRun:review.sourceRun,workDir,today:asOf,runId,expectedAdditions:review.initialAcceptedCount+review.additional.length,requirePrices:true});
 const {shadowRoot,marketStoreDir}=prepared,tickers=prepared.tickers,scope=(prepared.priceSecurities||prepared.securities).map(r=>r.ticker);
 onProgress('Canonical company/security/listing and private histories materialized\n');
 if(benchmarkPreflight)try{onProgress(JSON.stringify(await restoreBenchmarkReference({marketStoreDir,preflightFile:benchmarkPreflight}))+'\n');}catch(error){onProgress('Benchmark reference unavailable: '+error.message+'\n');}
 const fundamentals=await materializeFundamentals({root:shadowRoot,tickers:scope,privateDir:join(workDir,'sec-private'),asOf,allowNetwork,onProgress});
 reconcileShadowIssuerMappings({shadowRoot,securities:prepared.securities,byTicker:fundamentals.byTicker});
 const projection=await materializeProductProjections({sourceRoot:root,shadowRoot,securities:prepared.priceSecurities||prepared.securities,pricePayloads:prepared.pricePayloads,asOf});
 const factors=await materializeFactors({root:shadowRoot,tickers:scope,marketStoreDir,privateDir:join(workDir,'factor-private'),asOf,onProgress});
 const surfaces=await materializeProductSurfaces({shadowRoot,marketStoreDir,tickers:scope,freshPriceTickers:[...prepared.pricePayloads.keys()],privateDir:join(workDir,'surface-private'),onProgress});
 const logoReviews=join(root,'docs/tiingo2-productization/logo-asset-reviews.json');
 const logoCandidates=assembleLogoCandidates({prepared,projection,fundamentals});
 const logos=await materializeLogos({root,outputRoot:shadowRoot,tickers:scope,candidates:logoCandidates,seedRoot:root,assetReviews:existsSync(logoReviews)?read(logoReviews):{},noWikidata:true,secLogos:true,fetchAssets:allowNetwork,onProgress});
 const universeBuild=await runExistingProcess(process.execPath,[join(shadowRoot,'scripts/quant/build-universe-list.mjs')],{cwd:shadowRoot,onProgress});if(universeBuild.code!==0)throw Error('UNIVERSE_LIST_BUILDER_FAILED');
 const capabilityFile=join(shadowRoot,'quant/data/universe/market-capability.json'),capability=read(capabilityFile),technical=byTicker(surfaces.rows);
 const factorReadiness=byTicker(factors.rows);
 for(const member of capability.members){
  const row=technical.get(member.s),factor=factorReadiness.get(member.s);
  if(row&&(tickers.includes(member.s)||row.supertrader.technical==='AVAILABLE'))member.t=row.supertrader.technical==='AVAILABLE'?'TECHNICAL_READY':row.supertrader.technical;
  if(factor&&(tickers.includes(member.s)||factor.canonicalEvidence?.verified)){
   if(factor.securityId!==member.m)throw Error('FACTOR_CAPABILITY_CANONICAL_IDENTITY_MISMATCH:'+member.s);
   member.fr=factor.productQuantReady===true&&factor.canonicalEvidence?.verified===true;
  }
 }
 capability.totals={...capability.totals,FACTOR_READY:capability.members.filter(m=>m.fr).length,TECHNICAL_READY:capability.members.filter(m=>m.t==='TECHNICAL_READY').length};
 write(capabilityFile,capability);
 const projectionRows=projection.report.rows;
 const maps=[projection.report,factors,surfaces,logos,fundamentals].map(r=>byTicker(r.rows));
 const rows=(prepared.priceSecurities||prepared.securities).map(security=>{
  const [p,f,s,l,sec]=maps.map(m=>m.get(security.ticker)||{});
  return {ticker:security.ticker,companyName:security.companyName,companyId:security.companyId||security.issuerId||null,securityId:security.securityId,instrumentId:security.instrumentId,exchange:security.exchange,currency:security.currency,canonicalStatus:'CANONICAL_READY',search:p.search,chart:p.chart,watchlist:p.watchlist,quant:f,discover:s.discover,screener:s.screener,supertrader:s.supertrader,markets:s.markets,logo:l,fundamentals:sec};
 });
 initializeShadowGit({root,shadowRoot,workDir});
 // Register only canonical/public generated paths for the existing release
 // packager. Private histories and raw SEC/cache files never enter Git.
 const generated=[...walk(shadowRoot,'quant/data'),...walk(shadowRoot,'discover/data'),...walk(shadowRoot,'discover/logos'),...walk(shadowRoot,'screener/data')].filter(p=>permitted(p)||/^quant\/data\/(sec\/consumer|sec\/canonical|fundamentals\/issuers)\//.test(p));
 const pathspec=join(workDir,'public-generated-paths.nul');writeFileSync(pathspec,generated.join('\0')+'\0');execFileSync('git',['add','-f','--pathspec-from-file='+pathspec,'--pathspec-file-nul'],{cwd:shadowRoot});
 let stage,attachmentBlocker=null;
 const changed=generated.filter(p=>isProductizationProjectionPath(p)&&(!existsSync(join(root,p))||sha(readFileSync(join(root,p)))!==sha(readFileSync(join(shadowRoot,p)))));
 const productizationReadiness=rows.filter(r=>tickers.includes(r.ticker)).map(row=>({ticker:row.ticker,securityId:row.securityId,instrumentId:row.instrumentId,products:Object.fromEntries([
  ['SEARCH',row.search?.ready,['quant/data/universe/search/sym/'+Company.shardKey(row.ticker)+'.json']],['CHARTS',row.chart?.ready,[row.chart?.dailyPath?.replace(/^\//,'')]],['WATCHLIST',row.watchlist?.ready,['quant/data/universe/instruments/'+Company.shardKey(row.ticker)+'.json']],
  ['QUANT',row.quant.productQuantReady,[row.quant.canonicalEvidence?.artifactPath]],['DISCOVER',row.discover?.ready,[row.discover?.artifact]],['SCREENER',row.screener?.ready,['screener/data/universe-US_REAL.json']],['SUPERTRADER',row.supertrader?.ready,['quant/data/product/technical-signals-v1/'+Company.shardKey(row.ticker)+'.json.gz']],['SEC',row.fundamentals?.pitValid,[...(row.fundamentals?.artifacts?.map(a=>a.path)||[]), 'quant/data/sec/canonical_index.json']]
 ].map(([name,ready,paths])=>[name,{state:ready?'PASS':'UNAVAILABLE',coverage:name==='QUANT'?(row.quant.quantStatus==='QUANT_FULL'?'FULL':row.quant.quantStatus):undefined,reasonCodes:ready?[]:[({CHARTS:row.chart,SEC:row.fundamentals})[name]?.reasonCodes?.[0]||row[name.toLowerCase()]?.reasonCodes?.[0]||'CONDITIONAL_DATA_REQUIREMENTS_NOT_MET'],artifactPaths:ready?(paths||[]).filter(Boolean):[],...(name==='CHARTS'&&!ready&&row.chart?.eligibilityEvidence?{eligibilityEvidence:row.chart.eligibilityEvidence}:{})}]))}));
 const readinessArtifacts=productizationReadiness.flatMap(r=>Object.values(r.products).flatMap(p=>[...p.artifactPaths,...(p.eligibilityEvidence?.priceArtifactPath?[p.eligibilityEvidence.priceArtifactPath]:[])]));
 const publicationFiles=[...new Set([...changed,...readinessArtifacts])];
 try{stage=attachCanonicalProjections({root,staged:prepared.stage,preparedFiles:publicationFiles.map(path=>({path,bytes:readFileSync(join(shadowRoot,path))})),productizationReadiness});}
 catch(error){attachmentBlocker=error.message;stage=prepared.stage;onProgress('Publication attachment blocked: '+error.message+'\n');}
 const historyPlan=prepareHistoryPublication({marketStoreDir,outputRoot:join(root,'.market-cache/prepared/tiingo2'),additions:prepared.securities,publicationManifestSha256:stage.manifestSha256});
 const release=releaseOutput?await buildRelease({root:shadowRoot,output:releaseOutput}):null;
 const added=rows.filter(r=>tickers.includes(r.ticker));
 const summary={schemaVersion:'tiingo2-productization-status-1.0.0',runId,asOf,sourceRun:relative(sourceCache,sourceRun),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),currentProduction,acceptedBaseline:review.initialAcceptedCount,additionalAccepted:review.additional.length,proposedConsumer:currentProduction+tickers.length,removed:0,canonicalMaterialized:added.length,quant: Object.fromEntries(['QUANT_FULL','PARTIAL','TECHNICAL_ONLY','BLOCKED'].map(state=>[state,added.filter(r=>r.quant.quantStatus===state).length])),logo:logos.counts,productionWrites:0,publicationState:attachmentBlocker?'BLOCKED':'PREPARED_AWAITING_RELEASE_AND_BROWSER_QA',attachmentBlocker,manifestSha256:stage.manifestSha256,release:release?{status:release.status,secBytes:release.secBytes,screener:release.screener}:null,rows};
 write(join(out,'tiingo2_productization_status.json'),summary);
 write(join(out,'tiingo2_accepted_materialization.json'),{runId,rows:added});write(join(out,'tiingo2_review_resolution.json'),review.publicReport);
 write(join(out,'tiingo2_quant_readiness.json'),factors);write(join(out,'tiingo2_product_readiness.json'),{runId,rows});write(join(out,'tiingo2_logo_status.json'),logos);
 write(join(out,'tiingo2_chart_status.json'),{runId,rows:projectionRows.map(r=>({ticker:r.ticker,securityId:r.securityId,...r.chart}))});
 write(join(out,'tiingo2_publication_diff.json'),{runId,ADDED:added,REVIEW:review.publicReport.rows.filter(r=>r.decision==='MANUAL_REVIEW'),REJECTED:review.publicReport.rows.filter(r=>r.decision==='REJECT_WITH_REASON'),REMOVED:[],manifestSha256:stage.manifestSha256,files:stage.files,blocker:attachmentBlocker});
 write(join(out,'tiingo2_final_consumer_universe.json'),{runId,current:currentProduction,proposed:currentProduction+tickers.length,ADDED:tickers,REMOVED:[],productionWrites:0,publicationState:summary.publicationState});
 write(join(out,'tiingo2_history_publication_plan.json'),historyPlan);
 write(join(workDir,'run-result.json'),{shadowRoot,marketStoreDir,stage:stage.manifestPath,out,releaseOutput,summary:summary.publicationState});
 return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
 try{
  const result=await runProductization({sourceRun:arg('--source-run'),sourceCache:arg('--source-cache'),workDir:arg('--work-dir'),asOf:arg('--today'),runId:arg('--run-id'),out:arg('--out'),releaseOutput:arg('--release-output'),benchmarkPreflight:arg('--benchmark-preflight'),allowNetwork:!args.includes('--offline'),onProgress:s=>process.stdout.write(s)});
  console.log(JSON.stringify({canonical:result.canonicalMaterialized,quant:result.quant,proposed:result.proposedConsumer,publication:result.publicationState}));
 }catch(error){write(join(arg('--out')||'.verification/tiingo2-productization','tiingo2_failure.json'),{status:'BLOCKED',reason:error.message,productionWrites:0});console.error(error.stack);process.exitCode=1;}
}
