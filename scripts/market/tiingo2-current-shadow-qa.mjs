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
function classifyChangedPath(path,verifiedDna){
 if(verifiedDna&&(/(?:eligibility\.json|instruments\/DN\.json|tiingo2-existing-eligibility-corrections\.json)$/.test(path)))
  return ['VERIFIED_EXISTING_ELIGIBILITY_CORRECTION','The existing DNA listing correction is backed by fresh canonical identity and corporate action evidence.'];
 if(/(?:factors|factor-evidence|technical-signals|discover\/data\/(?:rank|stocks|themes|meta))/.test(path))
  return ['POPULATION_RANK_NORMALIZATION','The existing producer rebuilt this output for the enlarged canonical population; the factor population comparison and protected row checks record its impact.'];
 if(/(?:company-names|cik-map|sec\/consumer)/.test(path))
  return ['CANONICAL_METADATA_UPDATE','The canonical company metadata projection adds listing-bound issuer identities while retaining every protected existing row.'];
 return ['ADDITIVE_MEMBERSHIP_OR_INDEX','The canonical membership or product index gained scoped securities while the protected existing identity and policy checks retained the baseline.'];
}
export function explainChangedExistingFiles(stage,{verifiedDna=false}={}){
 return (stage.files??[]).filter(row=>row.projection&&row.baselineSha256!==null&&row.baselineSha256!==row.stagedSha256)
  .map(row=>{const [reasonCode,explanation]=classifyChangedPath(row.path,verifiedDna);
   return {path:row.path,beforeSha256:row.baselineSha256,afterSha256:row.stagedSha256,reasonCode,explanation};});
}
export async function runCurrentShadowQA({root,shadow,stage,workDir,out}){
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
 let verifiedDna=false,dnaError=null;
 if(existsSync(correctionPath)){
  try{const doc=read(correctionPath);if(!Array.isArray(doc.corrections)||doc.corrections.length>1)throw Error('INVALID_DNA_CORRECTION');
   if(doc.corrections.length){const proof=doc.corrections[0],before=beforeInstruments.find(row=>row.instrumentId===proof.instrumentId);
    verifyExistingDnaEligibilityCorrection({beforeInstrument:before,afterInstrument:instMap.get(proof.instrumentId),
     beforeDecision:eligBefore.find(row=>row.securityId==='ref_DNA'),afterDecision:eligMap.get('ref_DNA'),proof,asOf:doc.asOf});verifiedDna=true;}
  }catch(error){dnaError=error.message;}
 }
 check('VERIFIED_DNA_EXISTING_LISTING_CORRECTION',dnaError===null,{verifiedCorrection:verifiedDna,error:dnaError});
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
 const baselineScreen=new Set(read(join(baselineScreenRoot,'universe-US_REAL.json')).cols?.s??[]),
  shadowScreen=new Set(read(join(shadow,'screener/data/universe-US_REAL.json')).cols?.s??[]),lostScreen=[...baselineScreen].filter(ticker=>!shadowScreen.has(ticker));
 check('BASELINE_SCREENER_MEMBERSHIP',!lostScreen.length,{before:baselineScreen.size,after:shadowScreen.size,lost:lostScreen});
 const names=checks.map(row=>row.name);
 if(names.length!==REQUIRED_PROTECTED_PRODUCT_CHECKS.length||REQUIRED_PROTECTED_PRODUCT_CHECKS.some(name=>names.filter(item=>item===name).length!==1))
  throw Error('CURRENT_SHADOW_QA_CHECK_SET_INCOMPLETE');
 const derivedFactorChanges=readDerivedFactorPopulationComparison({root,shadow,scope:[...scope]});
 const changedExistingFiles=explainChangedExistingFiles(stage,{verifiedDna});
 const result={schemaVersion:'tiingo2-product-shadow-qa-1',runId:stage.runId,sourceCommit,
  sourceManifestSha256:stage.manifestSha256,sourceReadinessSha256:stage.productizationReadinessSha256,
  scope:[...scope].sort(),checks,findings,changedExistingFiles,derivedFactorChanges,
  populationChangeExplanation:'New listing membership recomputes derived ranks and Discover card ordering through the existing canonical producers; existing identities, values, policy, logos, histories and membership are checked independently.',
  productionWrites:0};
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 return result;
}
