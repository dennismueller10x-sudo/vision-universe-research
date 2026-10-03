/** Compare the isolated product shadow with the checkout that actually built it.
 * No historical #353 baseline or generated provider input is accepted. */
import {readFileSync,existsSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeUniverse} from '../screener/build-universe.mjs';
import {REQUIRED_PROTECTED_PRODUCT_CHECKS} from './tiingo2-publication.mjs';
import {DNA_CORRECTION_PATH,verifyExistingDnaEligibilityCorrection} from './tiingo2-productize.mjs';
import {readDerivedFactorPopulationComparison} from './tiingo2-factor-population-qa.mjs';
import {compareChangedExistingProductFiles} from './tiingo2-existing-product-semantics.mjs';
import {proveDnaTechnicalRefresh} from './tiingo2-dna-technical-proof.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>{const bytes=readFileSync(path);return JSON.parse(path.endsWith('.gz')?gunzipSync(bytes):bytes);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const symbol=row=>row.ticker??row.symbol??row.s;
const rows=(root,path,key)=>read(join(root,path))[key];
const fileHash=path=>existsSync(path)?digest(readFileSync(path)):null;
const findBy=(array,key)=>new Map(array.map(row=>[row[key],row]));
function compareRows(before,after,key,{allowChanged=new Set(),fields=null}={}){
 const current=findBy(after,key),missing=[],changed=[];
 for(const row of before){const next=current.get(row[key]);if(!next){missing.push(symbol(row));continue;}
  if(!allowChanged.has(row[key])&&!equal(fields?Object.fromEntries(fields.map(field=>[field,row[field]])):row,
    fields?Object.fromEntries(fields.map(field=>[field,next[field]])):next))changed.push(symbol(row));}
 return {missing,changed};
}
function searchEntries(root,kind){
 const manifest=read(join(root,'quant/data/universe/search/manifest.json')),
  shards=new Set((manifest[kind]??[]).map(row=>row.shard)),entries=new Map();
 for(const shard of shards){const path=join(root,'quant/data/universe/search',kind,shard+'.json');
  if(!existsSync(path))continue;
  entries.set(shard,(read(path).entries??[]).map(row=>row.i+'|'+row.s));
 }
 return {shards,entries};
}
function instrumentRows(root){return readdirSync(join(root,'quant/data/universe/instruments')).filter(name=>name.endsWith('.json'))
 .flatMap(name=>read(join(root,'quant/data/universe/instruments',name)).instruments??[]);}
function deferredDnaSnapshot(base){
 const technical='quant/data/product/technical-signals-v1',row=(path,key)=>{
  const file=join(base,path);return existsSync(file)?read(file)[key]??null:null;};
 const searchKind=kind=>{
  const manifest=row('quant/data/universe/search/manifest.json',kind)??[],matches=[];
  for(const {shard} of manifest){const file=join(base,'quant/data/universe/search',kind,shard+'.json');
   if(!existsSync(file))continue;
   for(const entry of read(file).entries??[])if(entry.i==='vu_f4c48467a5f4ef'||entry.s==='DNA')matches.push({shard,entry});
  }
  return matches.sort((a,b)=>a.shard.localeCompare(b.shard)||a.entry.s.localeCompare(b.entry.s));
 };
 const signal={};for(const lookback of [5,20,60]){
  const file=join(base,technical,'signals-'+lookback+'.json.gz'),payload=existsSync(file)?read(file):null;
  signal[lookback]={result:payload?.results?.find(item=>item.ticker==='DNA')??null,
   events:payload?.events?.filter(item=>item.ticker==='DNA')??[]};
 }
 const chartPaths=['quant/data/market/discover-series/ref_DNA.json','quant/data/market/discover-series-long/ref_DNA.json'];
 const instruments=instrumentRows(base).filter(item=>item.symbol==='DNA'||item.masterMemberId==='ref_DNA'),
  instrument=instruments.length===1?instruments[0]:null,
  marketCapability=(row('quant/data/universe/market-capability.json','members')??[])
   .filter(item=>item.s==='DNA'||item.m==='ref_DNA'||item.i==='vu_f4c48467a5f4ef'),
  universeList=(row('quant/data/product/universe-list-v1.json.gz','entries')??[]).filter(item=>item.s==='DNA');
 return {instrument:instruments,
  watchlistIdentity:instrument?{symbol:instrument.symbol,instrumentId:instrument.instrumentId,
   securityId:instrument.masterMemberId,issuerId:instrument.issuerId,legacyIds:instrument.legacyIds,
   productEligibility:instrument.productEligibility}:null,
  searchSymbol:searchKind('sym'),searchName:searchKind('name'),
  marketCapability,universeList,
  eligibility:(row('quant/data/market/security-master/eligibility.json','decisions')??[]).filter(item=>item.securityId==='ref_DNA'||item.ticker==='DNA'),
  raw:(row('quant/data/market/scale/universe-FULL_UNIVERSE.json','securities')??[]).filter(item=>item.securityId==='ref_DNA'||item.ticker==='DNA'),
  marketFactor:(row('quant/data/market/factors/factors-FULL_UNIVERSE.json','securities')??[]).filter(item=>item.securityId==='ref_DNA'||item.ticker==='DNA'),
  technical:row(technical+'/DN.json.gz','instruments')?.DNA??null,
  technicalSummary:row(technical+'/summary.json','rows')?.DNA??null,signals:signal,
  factorDna:row('quant/data/product/factor-evidence-v1/screening.json.gz','rows')?.DNA??null,
  discoverStock:existsSync(join(base,'discover/data/stocks/US_REAL/DNA.json'))?read(join(base,'discover/data/stocks/US_REAL/DNA.json')):null,
  charts:Object.fromEntries(chartPaths.map(path=>[path,fileHash(join(base,path))]))};
}
export function compareDeferredDnaSnapshots(before,after){
 const changed=Object.keys(before).filter(key=>!equal(before[key],after[key]));
 for(const key of ['instrument','marketCapability','universeList','eligibility','raw'])
  if(!Array.isArray(before[key])||before[key].length!==1||!Array.isArray(after[key])||after[key].length!==1)
   changed.push(key+':IDENTITY_CARDINALITY');
 return {status:changed.length?'BLOCKED':'PASS',changed,existingRowsPreserved:changed.length===0};
}
function historyFiles(root){
 const parent=join(root,'quant/data/market'),files=[];
 for(const dir of ['golden-preview/daily','golden-preview/weekly','golden-preview/monthly','discover-series','discover-series-long','history']){
  const path=join(parent,dir);if(!existsSync(path))continue;
  const visit=(base,relative='')=>{for(const name of readdirSync(base,{withFileTypes:true})){
   const suffix=join(relative,name.name),full=join(base,name.name);
   if(name.isDirectory())visit(full,suffix);else if(name.isFile()&&name.name.endsWith('.json'))files.push(join('quant/data/market',dir,suffix));
  }};visit(path);
 }
 return files.sort();
}
function classifyChangedPath(path,verifiedDna,semantic,dnaTechnicalProof){
 if(verifiedDna&&(/(?:eligibility\.json|instruments\/DN\.json|tiingo2-existing-eligibility-corrections\.json)$/.test(path)))
  return ['VERIFIED_EXISTING_ELIGIBILITY_CORRECTION','The existing DNA listing correction is backed by fresh canonical identity and corporate action evidence.'];
 if((/^discover\/data\/stocks\/US_REAL\//.test(path)||/^quant\/data\/product\/technical-signals-v1\//.test(path)||path==='screener/data/universe-US_REAL.json')&&
    semantic?.status!=='PASS')
  return ['UNVERIFIED_SEMANTIC_CHANGE','Existing product payload changed outside its proven population fields; publication remains blocked.'];
 if(dnaTechnicalProof?.status==='PASS'&&(
    path==='quant/data/product/technical-signals-v1/DN.json.gz'||
    path==='quant/data/product/technical-signals-v1/summary.json'||
    /^quant\/data\/product\/technical-signals-v1\/signals-(?:5|20|60)\.json\.gz$/.test(path)))
  return ['VERIFIED_EXISTING_ELIGIBILITY_CORRECTION','The existing DNA technical row was refreshed from its validated private Tiingo history; the native producer replay and append-only price overlap matched the staged bytes.'];
 if(semantic&&/^quant\/data\/product\/technical-signals-v1\//.test(path))
  return ['ADDITIVE_MEMBERSHIP_OR_INDEX','The technical bundle adds scoped listing rows; semantic comparison preserved every existing technical instrument and signal event.'];
 if(semantic&&/^discover\/data\/stocks\/US_REAL\//.test(path)&&semantic.allowedSample.every(field=>field==='/updatedAt'))
  return ['CANONICAL_METADATA_UPDATE','The rebuilt existing stock card changed only its generation timestamp; all price, fundamental, eligibility and signal fields are identical.'];
 if(semantic&&path==='screener/data/universe-US_REAL.json'&&semantic.allowedCount===0)
  return ['ADDITIVE_MEMBERSHIP_OR_INDEX','The Screener columnar artifact adds scoped listings; every existing row and column remains semantically identical.'];
 if(/(?:factors|factor-evidence|technical-signals|discover\/data\/(?:rank|stocks|themes|meta))/.test(path))
  return ['POPULATION_RANK_NORMALIZATION','The existing producer rebuilt this output for the enlarged canonical population; the factor population comparison and protected row checks record its impact.'];
 if(/(?:company-names|cik-map|sec\/consumer)/.test(path))
  return ['CANONICAL_METADATA_UPDATE','The canonical company metadata projection adds listing-bound issuer identities while retaining every protected existing row.'];
 return ['ADDITIVE_MEMBERSHIP_OR_INDEX','The canonical membership or product index gained scoped securities while the protected existing identity and policy checks retained the baseline.'];
}
export function explainChangedExistingFiles(stage,{verifiedDna=false,semantics=[],dnaTechnicalProof=null}={}){
 const byPath=new Map(semantics.map(row=>[row.path,row]));
 return (stage.files??[]).filter(row=>row.projection&&row.baselineSha256!==null&&row.baselineSha256!==row.stagedSha256)
  .map(row=>{const [reasonCode,explanation]=classifyChangedPath(row.path,verifiedDna,byPath.get(row.path),dnaTechnicalProof);
   return {path:row.path,beforeSha256:row.baselineSha256,afterSha256:row.stagedSha256,reasonCode,explanation};});
}
export async function runCurrentShadowQA({root,shadow,stage,workDir,marketStoreDir,sourceCache,secReportPath,dnaBaselineDecision,out}){
 root=resolve(root);shadow=resolve(shadow);workDir=resolve(workDir);out=resolve(out);
 if(root===shadow||!shadow.startsWith(join(root,'.market-cache')+'/'))throw Error('ISOLATED_CURRENT_MAIN_SHADOW_REQUIRED');
 if(stage?.projectionStatus!=='MATERIALIZED_AND_VERIFIED'||!stage.manifestSha256||!stage.productizationReadinessSha256)
  throw Error('VERIFIED_CURRENT_MAIN_STAGE_REQUIRED');
 const checks=[],findings=[],scope=new Set(stage.productizationReadiness.map(row=>row.ticker)),additions=new Set(stage.additions.map(row=>row.ticker));
 const check=(name,ok,detail={})=>{const result={name,status:ok?'PASS':'FAIL',...detail};checks.push(result);if(!ok)findings.push(result);};
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const baselineCAS=Object.entries(stage.baselineHashes??{}).filter(([path,hash])=>fileHash(join(root,path))!==hash).map(([path])=>path);
 const dirty=execFileSync('git',['status','--porcelain','--','quant/data','discover/data','discover/logos','screener/data','supertrader/data'],{cwd:root,encoding:'utf8'}).trim();
 check('PROTECTED_PRODUCTION_BASELINE_BYTES',!baselineCAS.length&&!dirty,{casMismatches:baselineCAS,dirtyTrackedData:!!dirty});
 const rawPath='quant/data/market/scale/universe-FULL_UNIVERSE.json',eligPath='quant/data/market/security-master/eligibility.json',capPath='quant/data/universe/market-capability.json',factorPath='quant/data/market/factors/factors-FULL_UNIVERSE.json';
 const rawBefore=rows(root,rawPath,'securities'),rawAfter=rows(shadow,rawPath,'securities');
 const rawDiff=compareRows(rawBefore,rawAfter,'securityId',{fields:['securityId','ticker']});
 check('RAW_CANONICAL_IDENTITIES',!rawDiff.missing.length&&!rawDiff.changed.length,rawDiff);
 const capBefore=rows(root,capPath,'members'),capAfter=rows(shadow,capPath,'members');
 const capDiff=compareRows(capBefore,capAfter,'i',{fields:['m','s','i']});
 check('CAPABILITY_CANONICAL_IDENTITIES',!capDiff.missing.length&&!capDiff.changed.length,capDiff);
 const factorBefore=rows(root,factorPath,'securities'),factorAfter=rows(shadow,factorPath,'securities');
 const factorIds=compareRows(factorBefore,factorAfter,'securityId',{fields:['securityId','ticker']});
 check('MARKET_FACTOR_IDENTITIES',!factorIds.missing.length&&!factorIds.changed.length,factorIds);
 const factorMap=findBy(factorAfter,'securityId'),factorChanges=factorBefore.filter(row=>!scope.has(row.ticker)&&!equal(row,factorMap.get(row.securityId))).map(row=>row.ticker);
 check('UNSCOPED_MARKET_FACTOR_VALUES',!factorChanges.length,{changed:factorChanges});
 const scopedIds=new Set([...scope].flatMap(ticker=>['ref_'+ticker,'ref_'+ticker.replace(/[.-]/g,'_')])),historyChanges=[];
 for(const path of historyFiles(root)){
  if(scopedIds.has(path.split('/').at(-1).replace(/\.json$/,'')))continue;
  if(fileHash(join(root,path))!==fileHash(join(shadow,path)))historyChanges.push(path);
 }
 check('UNSCOPED_HISTORICAL_PRICE_BYTES',!historyChanges.length,{changed:historyChanges.slice(0,30),totalChanged:historyChanges.length});
 const eligBefore=rows(root,eligPath,'decisions'),eligAfter=rows(shadow,eligPath,'decisions'),eligMap=findBy(eligAfter,'securityId');
 const beforeInstruments=instrumentRows(root),afterInstruments=instrumentRows(shadow),instMap=findBy(afterInstruments,'instrumentId');
 const correctionPath=join(shadow,DNA_CORRECTION_PATH);
 let verifiedDna=false,dnaError=null,dnaCorrection=null;
 if(existsSync(correctionPath)){
  try{const doc=read(correctionPath);if(!Array.isArray(doc.corrections)||doc.corrections.length>1)throw Error('INVALID_DNA_CORRECTION');
   if(doc.corrections.length){const proof=doc.corrections[0],before=beforeInstruments.find(row=>row.instrumentId===proof.instrumentId);
    verifyExistingDnaEligibilityCorrection({beforeInstrument:before,afterInstrument:instMap.get(proof.instrumentId),
     beforeDecision:eligBefore.find(row=>row.securityId==='ref_DNA'),afterDecision:eligMap.get('ref_DNA'),proof,asOf:doc.asOf});verifiedDna=true;dnaCorrection=proof;}
  }catch(error){dnaError=error.message;}
 }
 check('VERIFIED_DNA_EXISTING_LISTING_CORRECTION',dnaError===null,{verifiedCorrection:verifiedDna,error:dnaError});
 const deferredDna=dnaBaselineDecision?.state==='DEFERRED_EXISTING_DNA_UNCHANGED';
 if(deferredDna){const frozen=compareDeferredDnaSnapshots(deferredDnaSnapshot(root),deferredDnaSnapshot(shadow));
  if(verifiedDna||frozen.status!=='PASS')findings.push({name:'DEFERRED_DNA_BASELINE_CHANGED',changed:frozen.changed});
 }
 if(dnaBaselineDecision?.state==='DNA_FULL_HISTORY_VERIFIED'&&!verifiedDna)
  findings.push({name:'DNA_VERIFIED_BASELINE_WITHOUT_CORRECTION'});
 const allowDna=verifiedDna?new Set(['ref_DNA']):new Set();
 const policyChanged=eligBefore.filter(row=>!scope.has(row.ticker)&&!allowDna.has(row.securityId)&&
  (!eligMap.has(row.securityId)||['ticker','product_eligibility','instrument_type'].some(field=>eligMap.get(row.securityId)[field]!==row[field]))).map(row=>row.ticker);
 check('UNSCOPED_CONSUMER_POLICY',!policyChanged.length,{changed:policyChanged});
 const instrumentDiff=compareRows(beforeInstruments,afterInstruments,'instrumentId',{allowChanged:new Set(verifiedDna?beforeInstruments.filter(row=>row.symbol==='DNA').map(row=>row.instrumentId):[])});
 check('BASELINE_INSTRUMENT_IDS_URL_ALIASES',!instrumentDiff.missing.length&&!instrumentDiff.changed.length,instrumentDiff);
 check('BASELINE_CANONICAL_ROWS_EXACT',!instrumentDiff.missing.length&&!instrumentDiff.changed.length,instrumentDiff);
 const eligibilityDiff=compareRows(eligBefore,eligAfter,'securityId',{allowChanged:allowDna});
 check('BASELINE_EXISTING_POLICY_ROWS_EXACT',!eligibilityDiff.missing.length&&!eligibilityDiff.changed.length,eligibilityDiff);
 check('UNIQUE_CANONICAL_INSTRUMENT_IDS',new Set(afterInstruments.map(row=>row.instrumentId)).size===afterInstruments.length,{after:afterInstruments.length});
 for(const kind of ['sym','name']){
  const before=searchEntries(root,kind),after=searchEntries(shadow,kind),lostShards=[...before.shards].filter(shard=>!after.shards.has(shard)),lostEntries=[];
  check('BASELINE_SEARCH_MANIFEST_'+kind.toUpperCase(),!lostShards.length,{lostShards});
  for(const [shard,old] of before.entries){const current=new Set(after.entries.get(shard)??[]);for(const entry of old)if(!current.has(entry))lostEntries.push(shard+':'+entry);}
  check('BASELINE_SEARCH_ENTRIES_'+kind.toUpperCase(),!lostEntries.length,{lostEntries:lostEntries.slice(0,30),totalLost:lostEntries.length});
 }
 const baselineDna=read(join(root,'quant/data/product/factor-evidence-v1/screening.json.gz')).rows,
  shadowDna=read(join(shadow,'quant/data/product/factor-evidence-v1/screening.json.gz')).rows;
 const lostDna=Object.keys(baselineDna).filter(ticker=>!(ticker in shadowDna));
 check('BASELINE_FACTOR_DNA_COVERAGE',!lostDna.length,{before:Object.keys(baselineDna).length,after:Object.keys(shadowDna).length,lost:lostDna});
 const logoBefore=read(join(root,'discover/logos/index.json')),logoAfter=read(join(shadow,'discover/logos/index.json'));
 for(const kind of ['files','wide','dark']){
  const old=logoBefore[kind]??(kind==='dark'?[]:{}),next=logoAfter[kind]??(kind==='dark'?[]:{}),lost=Array.isArray(old)?old.filter(ticker=>!next.includes(ticker)):Object.keys(old).filter(ticker=>next[ticker]!==old[ticker]);
  const changedBytes=kind==='files'?Object.entries(old).filter(([,path])=>fileHash(join(root,'discover/logos',path))!==fileHash(join(shadow,'discover/logos',path))).map(([ticker])=>ticker):[];
  check('BASELINE_LOGO_MAPPING_'+kind.toUpperCase(),!lost.length&&!changedBytes.length,{lost,changedBytes});
 }
 const baselineScreenRoot=join(workDir,'baseline-screener');
 await writeUniverse({root,out:baselineScreenRoot,log:()=>{}});
 const baselineScreener=read(join(baselineScreenRoot,'universe-US_REAL.json')),
  baselineScreen=new Set(baselineScreener.cols?.s??[]),
  shadowScreen=new Set(read(join(shadow,'screener/data/universe-US_REAL.json')).cols?.s??[]),lostScreen=[...baselineScreen].filter(ticker=>!shadowScreen.has(ticker));
 check('BASELINE_SCREENER_MEMBERSHIP',!lostScreen.length,{before:baselineScreen.size,after:shadowScreen.size,lost:lostScreen});
 const names=checks.map(row=>row.name);
 if(names.length!==REQUIRED_PROTECTED_PRODUCT_CHECKS.length||REQUIRED_PROTECTED_PRODUCT_CHECKS.some(name=>names.filter(item=>item===name).length!==1))
  throw Error('CURRENT_SHADOW_QA_CHECK_SET_INCOMPLETE');
 const derivedFactorChanges=readDerivedFactorPopulationComparison({root,shadow,scope:[...scope]});
 let dnaTechnicalProof=null;
 if(verifiedDna){
  try{dnaTechnicalProof=await proveDnaTechnicalRefresh({root,shadow,marketStoreDir,sourceCache,secReportPath,workDir,correction:dnaCorrection,asOf:stage.asOf});}
  catch(error){dnaTechnicalProof={status:'BLOCKED',reasonCodes:[String(error.message).split(':')[0]]};}
  if(dnaTechnicalProof.status==='PASS'&&(
     dnaTechnicalProof.historicalR2BaselineSha256!==dnaBaselineDecision?.baselineSha256||
     dnaTechnicalProof.r2IndexSymbolSha256!==dnaBaselineDecision?.r2IndexSymbolSha256||
     dnaTechnicalProof.r2IndexETagSha256!==dnaBaselineDecision?.r2IndexETagSha256))
    dnaTechnicalProof={...dnaTechnicalProof,status:'BLOCKED',reasonCodes:['DNA_R2_PROOF_NOT_BOUND_TO_BASELINE_DECISION']};
  if(dnaTechnicalProof.status!=='PASS')findings.push({name:'DNA_TECHNICAL_PROOF_NOT_GREEN',reasonCodes:dnaTechnicalProof.reasonCodes});
 }
 const semantic=compareChangedExistingProductFiles({root,shadow,stage,baselineScreener,dnaTechnicalProof});
 findings.push(...semantic.findings);
 const changedExistingFiles=explainChangedExistingFiles(stage,{verifiedDna,semantics:semantic.comparisons,dnaTechnicalProof});
 const result={schemaVersion:'tiingo2-product-shadow-qa-1',runId:stage.runId,sourceCommit,
  sourceManifestSha256:stage.manifestSha256,sourceReadinessSha256:stage.productizationReadinessSha256,
  scope:[...scope].sort(),checks,findings,changedExistingFiles,semanticDiff:semantic,dnaTechnicalProof,derivedFactorChanges,
  populationChangeExplanation:'New listing membership recomputes derived ranks and Discover card ordering through the existing canonical producers; existing identities, values, policy, logos, histories and membership are checked independently.',
  productionWrites:0};
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 return result;
}
