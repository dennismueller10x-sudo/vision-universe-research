/** Run existing canonical builders in an isolated shadow, preserving every
 * delivered baseline row. No provider calls, deploys or production writes. */
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { stageCanonicalPublication, CANONICAL_PUBLICATION_PATHS } from './tiingo2-publication.mjs';
import { assessEvidence, normalizeBars } from './tiingo2-evidence.mjs';
import { resolveProductUniverse } from './universe-source.mjs';
import { parseExchangeDirectory } from './tiingo2-refresh.mjs';
import { REVIEW_RESOLUTION_VERSION } from './tiingo2-review-resolution.mjs';
const require=createRequire(import.meta.url),Company=require('../../quant/engines/company-master.js'),Store=require('../../quant/engines/market-store.js');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),read=file=>JSON.parse(readFileSync(file,'utf8'));
const json=doc=>Buffer.from(JSON.stringify(doc,null,2)+'\n');
function write(file,doc){mkdirSync(dirname(file),{recursive:true});const temp=file+'.tmp-'+process.pid;writeFileSync(temp,json(doc));renameSync(temp,file);}
const symbol=row=>String(row.ticker||row.symbol||'').toUpperCase();
function guarded(root,path){const full=resolve(root,path),rel=relative(resolve(root),full);if(!rel||rel.startsWith('..'+sep)||rel==='..'||path.includes('\\'))throw Error('PRODUCTIZATION_PATH_UNSAFE');let current=resolve(root);for(const part of rel.split(sep)){current=join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error('PRODUCTIZATION_SYMLINK_UNSAFE');}return full;}
function instruments(root){const dir=join(root,CANONICAL_PUBLICATION_PATHS.instruments);return readdirSync(dir).filter(n=>n.endsWith('.json')).sort().flatMap(n=>read(join(dir,n)).instruments||[]);}
function copyShadow(root,shadowRoot){
 const exclude=new Set(['.git','.market-cache','.verification','.sec-cache','.sec-reload','.quant-state','node_modules','tmp','.launch','.vercel-public']);
 mkdirSync(shadowRoot,{recursive:true});
 for(const name of readdirSync(root)){
  if(exclude.has(name)||/^\.env(?:\.|$)/.test(name)&&name!=='.env.example')continue;
  const source=join(root,name);if(lstatSync(source).isSymbolicLink())continue;
  cpSync(source,join(shadowRoot,name),{recursive:true,mode:constants.COPYFILE_FICLONE,filter:path=>!path.split(sep).some(p=>p==='node_modules'||p==='__pycache__')&&!lstatSync(path).isSymbolicLink()});
 }
}
export function initializeShadowGit({root,shadowRoot,workDir}){
 if(existsSync(join(shadowRoot,'.git')))return {state:'EXISTING_SHADOW_REPOSITORY'};
 if(!existsSync(join(root,'.git')))return {state:'FIXTURE_WITHOUT_SOURCE_REPOSITORY'};
 const tracked=execFileSync('git',['-C',root,'ls-files','-z'],{maxBuffer:16*1024*1024}),paths=tracked.toString().split('\0').filter(path=>path&&existsSync(join(shadowRoot,path)));
 execFileSync('git',['-C',shadowRoot,'init','--quiet']);
 const pathspec=join(workDir,'shadow-baseline-paths.nul');writeFileSync(pathspec,paths.join('\0')+'\0');
 execFileSync('git',['-C',shadowRoot,'add','--pathspec-from-file='+pathspec,'--pathspec-file-nul']);
 execFileSync('git',['-C',shadowRoot,'-c','user.name=Vision Universe Shadow Builder','-c','user.email=shadow@localhost','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','--quiet','-m','Isolated productization source baseline']);
 const sourceCommit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),shadowCommit=execFileSync('git',['-C',shadowRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 write(join(workDir,'shadow-source-provenance.json'),{sourceCommit,shadowCommit,sourceTrackedFiles:paths.length,productionCommits:0});
 return {state:'INITIALIZED_SHADOW_ONLY',sourceCommit,shadowCommit};
}
/** Reconstruct accepted stage inputs from existing audit decisions and listing
 * metadata. This never invents a price series or broadens the accepted preview. */
export function loadProductizationInputs({sourceRun,sourceCache,discoveryFile,expectedAdditions=102,asOf}){
 sourceRun=resolve(sourceRun);sourceCache=resolve(sourceCache);
 const preview=read(join(sourceRun,'tiingo2_publication_preview.json')),policy=read(join(sourceRun,'tiingo2_consumer_policy_report.json'));
 if(preview.REMOVED?.length||preview.ADDED.length!==expectedAdditions)throw Error('ACCEPTED_PRODUCTIZATION_SCOPE_MISMATCH');
 if(new Set(preview.ADDED.map(symbol)).size!==preview.ADDED.length)throw Error('DUPLICATE_ACCEPTED_PRODUCTIZATION_SYMBOL');
 if(new Set(policy.rows.map(symbol)).size!==policy.rows.length)throw Error('DUPLICATE_PRODUCTIZATION_POLICY_SYMBOL');
 const policyMap=new Map(policy.rows.map(row=>[symbol(row),row])),stageDir=join(sourceRun,'canonical'),stageFile=join(stageDir,'manifest.json');
 const existingStage=existsSync(stageFile)?read(stageFile):null;
 const originalStageSymbols=new Set(existingStage?.additions.map(symbol)||[]);
 let reviewProof=null,reviewProofRows=new Map();
 if(existingStage){
  const previewIds=new Map(preview.ADDED.map(row=>[symbol(row),row.securityId]));
  if(existingStage.schemaVersion!=='tiingo2-canonical-publication-1.0.0'||existingStage.removals?.length||existingStage.additions.some(row=>previewIds.get(symbol(row))!==row.securityId))throw Error('ACCEPTED_CANONICAL_STAGE_SCOPE_MISMATCH');
  for(const row of preview.ADDED.filter(row=>!originalStageSymbols.has(symbol(row))))if(!row.reasonCodes?.includes('TECHNICAL_REVIEW_RESOLVED_WITH_LISTING_BOUND_EVIDENCE'))throw Error('ADDITIONAL_REVIEW_PUBLICATION_PROOF_MISSING');
  for(const file of existingStage.files)if(hash(readFileSync(guarded(stageDir,file.stagedPath)))!==file.stagedSha256)throw Error('ACCEPTED_CANONICAL_STAGE_INTEGRITY_FAILED');
  if(preview.ADDED.some(row=>!originalStageSymbols.has(symbol(row)))){
   const proofFile=join(sourceRun,'review-resolution-proof.json');
   if(!existsSync(proofFile)||!preview.reviewResolutionProofSha256||hash(readFileSync(proofFile))!==preview.reviewResolutionProofSha256)throw Error('ADDITIONAL_REVIEW_PROOF_FILE_MISSING_OR_CHANGED');
   reviewProof=read(proofFile);
   if(reviewProof.schemaVersion!=='tiingo2-review-resolution-proof-1'||reviewProof.resolverVersion!==REVIEW_RESOLUTION_VERSION||reviewProof.asOf!==(asOf||existingStage.asOf)||reviewProof.sourceManifestSha256!==hash(readFileSync(stageFile))||!Array.isArray(reviewProof.additional)||new Set(reviewProof.additional.map(symbol)).size!==reviewProof.additional.length)throw Error('ADDITIONAL_REVIEW_PROOF_BINDING_INVALID');
   reviewProofRows=new Map(reviewProof.additional.map(row=>[symbol(row),row]));
  }
 }
 const stagedRawEntry=existingStage?.files.find(row=>row.path===CANONICAL_PUBLICATION_PATHS.raw);
 const stagedRaw=stagedRawEntry?read(guarded(stageDir,stagedRawEntry.stagedPath)).securities:[];
 const rawMap=new Map(stagedRaw.map(row=>[symbol(row),row]));
 const discoveryPath=discoveryFile||join(sourceRun,'tiingo2_fresh_discovery.json'),discovery=read(discoveryPath),records=discovery.records||[];
 const candidates=preview.ADDED.map(added=>{
  const t=symbol(added),decision=policyMap.get(t);if(!decision||!decision.publicationReady||!['AUTO_ACCEPT','ACCEPT_AFTER_FIX'].includes(decision.decision))throw Error('ACCEPTED_POLICY_EVIDENCE_MISSING:'+t);
  const evidence=decision.evidence||{identity:decision.identity,price:decision.price,sec:decision.sec,factors:decision.marketFactors,securityForm:decision.securityForm,source:decision.source};
  if(existingStage&&!originalStageSymbols.has(t)&&(!evidence.identity?.resolved||evidence.identity.listingPeriodMatched!==true||evidence.identity.providerSymbolMatched!==true||evidence.identity.symbolCollision===true||evidence.identity.wrongExchange===true))throw Error('ADDITIONAL_REVIEW_IDENTITY_PROOF_MISSING:'+t);
  const raw=rawMap.get(t),matches=records.filter(row=>symbol(row)===t&&row.active===true&&row.assetType==='Stock'&&(!evidence.price?.firstDate||row.startDate===evidence.price.firstDate));
  const unique=new Map(matches.map(row=>[[row.exchange,row.startDate].join('|'),row]));
  const listing=raw||unique.size===1&&[...unique.values()][0];
  if(!listing?.exchange||!listing.startDate)throw Error('ACCEPTED_LISTING_EVIDENCE_MISSING:'+t);
  if(existingStage&&!originalStageSymbols.has(t))verifyReviewAddition({ticker:t,securityId:added.securityId,listing,evidence,proof:reviewProofRows.get(t),sourceCache,asOf:reviewProof.asOf});
  return {...listing,ticker:t,securityId:added.securityId,companyName:decision.companyName,name:decision.companyName,assetType:'Stock',currency:listing.currency||evidence.price?.currency||null,
   active:true,listingStatus:'ACTIVE',instrument_type:decision.policy.instrumentType,evidence,originalDecision:decision.decision,acceptedSourceRun:preview.runId||existingStage?.runId||null};
 });
 return {preview,policy,candidates,existingStage,stageDir,discovery,sourceRun,sourceCache};
}
function verifyReviewAddition({ticker,securityId,listing,evidence,proof,sourceCache,asOf}){
 const tuple=[ticker,listing.exchange,listing.startDate].join('|'),bound=(proof?.proof||[]).find(row=>row.kind==='TECHNICAL_SECURITY_FORM_NAME_AND_VENUE_RESOLUTION');
 if(!proof||proof.securityId!==securityId||proof.listingKey!==tuple||proof.decision!=='AUTO_RESOLVED'||proof.corporateActionGateWaived!==false||!bound||bound.listingKey!==tuple||bound.identityFieldsPreserved!==true)throw Error('ADDITIONAL_REVIEW_PROOF_LISTING_MISMATCH:'+ticker);
 const hashes=[proof.providerMetadataHash,proof.providerResponseSha256,proof.officialEvidenceHash];
 if(hashes.some(value=>!(/^[a-f0-9]{64}$/.test(value||'')))||bound.providerMetadataSha256!==hashes[0]||bound.providerResponseSha256!==hashes[1]||bound.officialEvidenceSha256!==hashes[2]||evidence.source?.responseSha256!==hashes[1])throw Error('ADDITIONAL_REVIEW_PROOF_HASH_MISMATCH:'+ticker);
 const dir=join(sourceCache,'evidence');let providerMatched=false;
 if(existsSync(dir))for(const name of readdirSync(dir).filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
  const cache=read(join(dir,name)),meta=cache.metadata;if(symbol(meta||{})!==ticker||meta.startDate!==listing.startDate)continue;
  if(hash(JSON.stringify(meta))===hashes[0]&&Array.isArray(cache.rows)&&hash(JSON.stringify(cache.rows))===hashes[1]&&cache.key+'.json'===name&&String(cache.summary?.source?.observedAt||'').slice(0,10)<=asOf){providerMatched=true;break;}
 }
 if(!providerMatched)throw Error('ADDITIONAL_REVIEW_PROVIDER_INPUT_PROOF_MISMATCH:'+ticker);
 let officialMatched=false;
 for(const source of ['nasdaqlisted','otherlisted']){const file=join(sourceCache,'directories',asOf+'-'+source+'.txt');if(!existsSync(file))continue;
  if(parseExchangeDirectory(readFileSync(file,'utf8'),source).some(row=>row.ticker===ticker&&hash(JSON.stringify(row))===hashes[2]))officialMatched=true;
 }
 if(!officialMatched)throw Error('ADDITIONAL_REVIEW_OFFICIAL_INPUT_PROOF_MISMATCH:'+ticker);
}
function sourceHashes(root){const paths=[CANONICAL_PUBLICATION_PATHS.raw,CANONICAL_PUBLICATION_PATHS.eligibility,CANONICAL_PUBLICATION_PATHS.names,'quant/data/universe/master-manifest.json'];for(const file of readdirSync(join(root,CANONICAL_PUBLICATION_PATHS.instruments)).filter(n=>n.endsWith('.json')))paths.push(CANONICAL_PUBLICATION_PATHS.instruments+'/'+file);return Object.fromEntries(paths.map(path=>[path,hash(readFileSync(join(root,path)))]));}

/** Reuse build-company-master and merge its verified additions into the exact
 * delivered master. Generic sync changes to any pre-existing row are ignored. */
export function materializeShadowCompanyMaster({root,shadowRoot,candidates,workDir,today}){
 const before=instruments(root),baselineById=new Map(before.map(row=>[row.instrumentId,row])),staged=instruments(shadowRoot),stagedMap=new Map(staged.map(row=>[symbol(row),row]));
 const providerFile=join(workDir,'canonical-builder-input.json');
 write(providerFile,{generatedAt:today,source:{kind:'ACCEPTED_TIINGO2_INCREMENTAL_STAGE'},entries:candidates.map(row=>({...row,name:row.companyName}))});
 const output=join(workDir,'company-builder'),working=join(workDir,'company-builder-working');
 const log=execFileSync(process.execPath,[join(shadowRoot,'scripts/universe/build-company-master.mjs'),'--from-directory',providerFile,'--out',output,'--work-dir',working,'--today',today],{cwd:shadowRoot,encoding:'utf8',maxBuffer:4*1024*1024});
 writeFileSync(join(workDir,'company-builder.log'),log);
 const built=instrumentsAt(output),builtMap=new Map(built.map(row=>[symbol(row),row])),byShard=new Map();
 for(const row of before){const key=Company.shardKey(row.symbol);if(!byShard.has(key))byShard.set(key,[]);byShard.get(key).push(row);}
 const securities=[];
 for(const candidate of candidates){const t=candidate.ticker,actual=builtMap.get(t),approved=stagedMap.get(t);
  if(!actual||!approved||actual.instrumentId!==approved.instrumentId||baselineById.has(actual.instrumentId))throw Error('CANONICAL_BUILDER_IDENTITY_MISMATCH:'+t);
  if(!['COMMON_STOCK','ADR','REIT','TRUST','SPAC'].includes(actual.securityType))throw Error('CANONICAL_BUILDER_SECURITY_FORM_MISMATCH:'+t);
  // Stage carries stronger independently checked CIK/ADR evidence than generic
  // Stock metadata. Keep that existing canonical engine's approved fields.
  const row={...actual,...approved};const key=Company.shardKey(t);if(!byShard.has(key))byShard.set(key,[]);byShard.get(key).push(row);
  securities.push({...row,ticker:t,securityId:candidate.securityId,companyId:row.issuerId||null});
 }
 const out=join(shadowRoot,'quant/data/universe');
 for(const [key,rows]of byShard)write(join(out,'instruments',key+'.json'),{shard:key,engine:Company.VERSION,count:rows.length,instruments:rows});
 const manifest=read(join(root,'quant/data/universe/master-manifest.json')),all=[...before,...securities],index=[...byShard].sort(([a],[b])=>a.localeCompare(b)).map(([shard,rows])=>({shard,count:rows.length}));
 manifest.shards={...manifest.shards,count:index.length,index};
 for(const field of ['providerRows','ingested','inMaster','published'])manifest.totals[field]=(manifest.totals[field]||0)+candidates.length;
 manifest.identifiers={...manifest.identifiers,withIssuerId:all.filter(r=>r.issuerId).length,distinctIssuers:new Set(all.filter(r=>r.issuerId).map(r=>r.issuerId)).size,withCik:all.filter(r=>r.cik).length,withName:all.filter(r=>r.companyName).length,withoutName:all.filter(r=>!r.companyName).length};
 manifest.tiingo2Productization={asOf:today,source:'scripts/universe/build-company-master.mjs',added:candidates.length,baselineRowsPreserved:before.length};write(join(out,'master-manifest.json'),manifest);
 return {securities,baselineInstruments:before.length,builderOutput:output};
}
function instrumentsAt(out){return readdirSync(join(out,'instruments')).filter(n=>n.endsWith('.json')).flatMap(n=>read(join(out,'instruments',n)).instruments||[]);}

/** Load only the exact listing generation's authenticated/restored evidence. */
export function loadCandidatePriceInputs({sourceCache,candidates,today}){
 const dir=join(sourceCache,'evidence'),byTicker=new Map(),results=new Map(),scope=new Set(candidates.map(c=>c.ticker));
 if(existsSync(dir))for(const file of readdirSync(dir).filter(n=>/^[a-f0-9]{64}\.json$/.test(n))){
  const entry=read(join(dir,file));if(entry.key+'.json'!==file)throw Error('PRIVATE_EVIDENCE_CACHE_KEY_MISMATCH');
  const t=String(entry.metadata?.ticker||'').toUpperCase();if(!scope.has(t)||!Array.isArray(entry.rows)||!entry.rows.length)continue;
  if(!byTicker.has(t))byTicker.set(t,[]);byTicker.get(t).push({file,metadata:entry.metadata,summary:entry.summary});
 }
 for(const candidate of candidates){
  const matches=(byTicker.get(candidate.ticker)||[]).filter(entry=>entry.metadata.startDate===candidate.startDate&&String(entry.metadata.exchangeCode||entry.metadata.exchange).toUpperCase()===candidate.exchange&&String(entry.summary?.source?.observedAt||'').slice(0,10)<=today);
  matches.sort((a,b)=>String(b.summary.source.observedAt).localeCompare(String(a.summary.source.observedAt)));
  if(!matches.length){results.set(candidate.ticker,{state:'BLOCKED',reason:'PRICE_CACHE_MISSING'});continue;}
  const entry=read(join(dir,matches[0].file)),responseHash=hash(JSON.stringify(entry.rows));
  if(entry.summary.source.responseSha256!==responseHash){results.set(candidate.ticker,{state:'BLOCKED',reason:'PRICE_CACHE_INTEGRITY_FAILED'});continue;}
  const assessed=assessEvidence(entry.rows,{ticker:candidate.ticker,today,currency:candidate.currency,metadata:entry.metadata});
  const latestAge=(Date.parse(today)-Date.parse(assessed.price.latestDate))/86400000;
  if(!assessed.price.historyValid||!assessed.price.latestValid||!assessed.price.corporateActionValid||!Number.isFinite(latestAge)||latestAge<0||latestAge>7){results.set(candidate.ticker,{state:'BLOCKED',reason:'PRICE_ACTION_GATE_FAILED',assessed});continue;}
  if(entry.rows.some(row=>String(row.date).slice(0,10)<candidate.startDate)){results.set(candidate.ticker,{state:'BLOCKED',reason:'PRICE_HISTORY_WRONG_LISTING_GENERATION'});continue;}
  results.set(candidate.ticker,{state:'READY',entry,assessed,responseHash});
 }
 return results;
}
function regressionScope({root,inputs}){
 const raw=read(join(root,CANONICAL_PUBLICATION_PATHS.raw)).securities,master=instruments(root),policy=new Map(inputs.policy.rows.map(row=>[row.ticker,row]));
 const candidates=[],securities=[];
 for(const ticker of ['DNA','AMC','BIRD','AMWL']){
  const source=raw.find(r=>r.ticker===ticker),instrument=master.find(r=>r.symbol===ticker&&r.masterMemberId===source?.securityId),decision=policy.get(ticker);
  if(!source||!instrument||!decision)continue;
  candidates.push({...source,ticker,name:decision.companyName||instrument.companyName,companyName:decision.companyName||instrument.companyName,startDate:source.startDate||instrument.firstTradeDate,regressionCase:true});
  securities.push({...instrument,ticker,securityId:source.securityId,regressionCase:true});
 }
 return {candidates,securities};
}
/** Resolve newly appended issuers from the existing SEC producer's verified
 * mapping. CIK disagreements remain blockers and no baseline row is rewritten. */
export function reconcileShadowIssuerMappings({shadowRoot,securities,byTicker}){
 const scope=new Map(securities.map(s=>[s.ticker,s])),mappings=byTicker instanceof Map?byTicker:new Map(Object.entries(byTicker||{})),rows=[];
 for(const file of readdirSync(join(shadowRoot,CANONICAL_PUBLICATION_PATHS.instruments)).filter(n=>n.endsWith('.json'))){
  const path=join(shadowRoot,CANONICAL_PUBLICATION_PATHS.instruments,file),doc=read(path);let changed=false;
  for(const instrument of doc.instruments){const t=symbol(instrument),mapping=mappings.get(t);if(!scope.has(t)||!/^\d{10}$/.test(String(mapping?.cik||'')))continue;
   if(instrument.cik&&instrument.cik!==mapping.cik){rows.push({ticker:t,state:'BLOCKED',reason:'CIK_CONFLICT'});continue;}
   instrument.cik=mapping.cik;instrument.issuerId=Company.issuerIdFromCik(mapping.cik);instrument.cikSource='EXISTING_SEC_CANONICAL_PRODUCER';instrument.issuerIdSource=instrument.cikSource;
   Object.assign(scope.get(t),{cik:instrument.cik,issuerId:instrument.issuerId,companyId:instrument.issuerId});rows.push({ticker:t,state:'MAPPED',cik:instrument.cik,issuerId:instrument.issuerId});changed=true;
  }if(changed)write(path,doc);
 }
 const namesPath=join(shadowRoot,CANONICAL_PUBLICATION_PATHS.names),names=read(namesPath);for(const row of names.rows){const security=scope.get(row.ticker);if(security?.cik&&!row.cik)row.cik=security.cik;}write(namesPath,names);
 return {rows,securities};
}
export function materializeShadowPrices({shadowRoot,sourceCache,candidates,securities,today,workDir}){
 const storeDir=join(shadowRoot,'.market-cache'),store=Store.createMarketStore({root:shadowRoot,providerId:'tiingo',workingDir:storeDir}),inputs=loadCandidatePriceInputs({sourceCache,candidates,today}),pricePayloads=new Map(),rows=[];
 const securityMap=new Map(securities.map(s=>[s.ticker,s]));
 for(const candidate of candidates){const input=inputs.get(candidate.ticker),security=securityMap.get(candidate.ticker);
  if(input.state!=='READY'){rows.push({ticker:candidate.ticker,securityId:candidate.securityId,state:'BLOCKED',regressionCase:candidate.regressionCase===true,reason:input.reason,findingCodes:input.assessed?.price.findingCodes||[],corporateActionState:input.assessed?.corporateActions.status||null});continue;}
  const bars=normalizeBars(input.entry.rows).map(bar=>({...bar,securityId:candidate.securityId,currency:candidate.currency})),seriesHash=hash(JSON.stringify(bars)),before=store.readBars(candidate.securityId);
  if(before?.provenance?.seriesSha256!==seriesHash)store.mergeBars(candidate.securityId,bars,{ticker:candidate.ticker,name:candidate.companyName,exchange:candidate.exchange,mic:security.mic,currency:candidate.currency,adjustmentStatus:'adjusted',adjustmentClaim:null,fetchedAt:input.entry.summary.source.observedAt,
   quality:input.assessed.price.quality,provenance:{provider:'tiingo',source:'RESTORED_ACCEPTED_EVIDENCE_CACHE',sourceResponseSha256:input.responseHash,seriesSha256:seriesHash,listingStart:candidate.startDate}});
  const payload=store.readBars(candidate.securityId);pricePayloads.set(candidate.ticker,payload);
  rows.push({ticker:candidate.ticker,securityId:candidate.securityId,instrumentId:security.instrumentId,state:'MATERIALIZED',regressionCase:candidate.regressionCase===true,bars:payload.bars.length,firstDate:payload.first,latestDate:payload.last,seriesSha256:seriesHash});
 }
 const report={asOf:today,provider:'tiingo',productionWrites:0,materialized:rows.filter(r=>r.state==='MATERIALIZED').length,blocked:rows.filter(r=>r.state==='BLOCKED').length,rows};write(join(workDir,'tiingo2_price_materialization.json'),report);
 return {pricePayloads,priceReport:report,marketStoreDir:storeDir};
}

export function prepareProductizationShadow({root=process.cwd(),workDir=join(root,'.market-cache/tiingo2-productization'),sourceRun,sourceCache=join(root,'.market-cache/tiingo2'),discoveryFile,today='2026-10-02',runId='tiingo2-productization-20261002',expectedAdditions=102,requirePrices=false}={}){
 root=resolve(root);workDir=resolve(workDir);const relativeWork=relative(root,workDir);if(!relativeWork.startsWith('.market-cache'+sep)||relativeWork.split(sep).includes('..'))throw Error('PRIVATE_PRODUCTIZATION_WORK_DIR_REQUIRED');
 guarded(root,relativeWork);const shadowRoot=join(workDir,'shadow-root'),inputs=loadProductizationInputs({sourceRun,sourceCache,discoveryFile,expectedAdditions,asOf:today}),hashes=sourceHashes(root),fingerprint=hash(JSON.stringify({hashes,preview:inputs.preview,runId,today,candidateInputs:inputs.candidates.map(c=>({ticker:c.ticker,securityId:c.securityId,exchange:c.exchange,startDate:c.startDate,companyName:c.companyName,instrument_type:c.instrument_type,evidenceSource:c.evidence.source}))})),contextFile=join(workDir,'preparation.json');
 let stage;
 if(existsSync(contextFile)){const prior=read(contextFile);if(prior.fingerprint!==fingerprint)throw Error('PRODUCTIZATION_BASELINE_OR_SCOPE_CHANGED');stage=read(join(workDir,'canonical-stage/manifest.json'));stage.manifestPath=join(workDir,'canonical-stage/manifest.json');}
 else{
  const pendingFile=join(workDir,'preparation-input.json');
  if(existsSync(shadowRoot)&&(!existsSync(pendingFile)||read(pendingFile).fingerprint!==fingerprint))throw Error('UNBOUND_PRODUCTIZATION_SHADOW_EXISTS');
  write(pendingFile,{fingerprint,runId,today});copyShadow(root,shadowRoot);initializeShadowGit({root,shadowRoot,workDir});
  stage=stageCanonicalPublication({root,output:join(workDir,'canonical-stage'),candidates:inputs.candidates,preview:inputs.preview,baselineHashes:hashes,runId,today});
  for(const file of stage.files){const source=guarded(join(workDir,'canonical-stage'),file.stagedPath),target=guarded(shadowRoot,file.path);if(hash(readFileSync(source))!==file.stagedSha256)throw Error('CANONICAL_STAGE_HASH_MISMATCH');mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);}
  write(contextFile,{fingerprint,runId,today,baselineHashes:hashes,shadowRoot});
 }
 const master=materializeShadowCompanyMaster({root,shadowRoot,candidates:inputs.candidates,workDir,today}),regressions=regressionScope({root,inputs}),priceCandidates=[...inputs.candidates,...regressions.candidates],priceSecurities=[...master.securities,...regressions.securities],prices=materializeShadowPrices({shadowRoot,sourceCache:inputs.sourceCache,candidates:priceCandidates,securities:priceSecurities,today,workDir});
 const baseline=resolveProductUniverse(root),after=resolveProductUniverse(shadowRoot),beforeIds=new Set(baseline.securities.filter(s=>s.consumer).map(s=>s.securityId));
 if([...beforeIds].some(id=>!after.securities.some(s=>s.securityId===id&&s.consumer)))throw Error('BASELINE_CONSUMER_MEMBER_REMOVED');
 if(after.securities.filter(s=>s.consumer).length!==beforeIds.size+expectedAdditions)throw Error('CANONICAL_CONSUMER_COUNT_MISMATCH');
 const beforeById=new Map(instruments(root).map(r=>[r.instrumentId,JSON.stringify(r)]));
 if(instruments(shadowRoot).some(row=>beforeById.has(row.instrumentId)&&beforeById.get(row.instrumentId)!==JSON.stringify(row)))throw Error('BASELINE_CANONICAL_IDENTITY_CHANGED');
 if(Object.entries(hashes).some(([path,expected])=>hash(readFileSync(join(root,path)))!==expected))throw Error('PRODUCTION_BASELINE_MUTATED');
 const status={runId,asOf:today,shadowRoot,productionWrites:0,canonicalAdded:inputs.candidates.length,consumerBefore:beforeIds.size,consumerAfter:after.securities.filter(s=>s.consumer).length,baselineRowsPreserved:master.baselineInstruments,priceMaterialized:prices.priceReport.materialized,priceBlocked:prices.priceReport.blocked,publicationState:'PREPARED_SHADOW_ONLY',rows:master.securities.map(s=>({ticker:s.ticker,securityId:s.securityId,instrumentId:s.instrumentId,issuerId:s.issuerId,companyName:s.companyName,exchange:s.exchange,listingStart:s.firstTradeDate,canonicalState:'MATERIALIZED',priceState:prices.priceReport.rows.find(r=>r.ticker===s.ticker)?.state||'BLOCKED'}))};
 write(join(workDir,'tiingo2_canonical_materialization.json'),status);
 if(requirePrices&&prices.priceReport.rows.some(row=>row.state==='BLOCKED'&&!row.regressionCase))throw Error('REQUIRED_PRIVATE_PRICE_INPUTS_MISSING_OR_INVALID');
 return {shadowRoot,workDir,candidates:inputs.candidates,additions:stage.additions,tickers:inputs.candidates.map(r=>r.ticker),securities:master.securities,regressionCandidates:regressions.candidates,regressionSecurities:regressions.securities,priceCandidates,priceSecurities,stage,...prices,status};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
 const result=prepareProductizationShadow({root:arg('--root'),workDir:arg('--work-dir'),sourceRun:arg('--source-run'),sourceCache:arg('--source-cache'),discoveryFile:arg('--discovery-file'),runId:arg('--run-id'),today:arg('--today'),requirePrices:args.includes('--require-prices')});
 console.log(JSON.stringify(result.status));
}
