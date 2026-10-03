// Refresh final public bytes using an authenticated, previously QA-bound
// package. No providers, builders, publication or production storage writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gunzipSync,inflateRawSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {attachCanonicalProjections,verifyStagedCanonicalPublication,isProductizationProjectionPath,CANONICAL_PUBLICATION_PATHS,PRODUCTIZATION_QA_SCHEMA,REQUIRED_PUBLICATION_QA} from './tiingo2-publication.mjs';
import {validatePreparedHistoryPlan} from './tiingo2-finalize-preview.mjs';
import {classifyMaterializedFactorRecord} from './tiingo2-factors.mjs';
import {codeLines,HARDCODED_CURRENCY} from '../quality/currency-debt-patterns.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(readFileSync(p));
const Company=createRequire(import.meta.url)('../../quant/engines/company-master.js');
const FactorEvidence=createRequire(import.meta.url)('../../quant/engines/factor-evidence.js');
const encode=d=>Buffer.from(JSON.stringify(d,null,2)+'\n');
const dataPrefixes=['quant/data/','discover/data/','discover/logos/','screener/data/','supertrader/data/','assets/logos/'];
function safe(path){for(let p=resolve(path);;p=dirname(p)){try{const s=lstatSync(p);if(s.isSymbolicLink()||s.isFile()&&s.nlink>1)throw Error('REFRESH_LINK_REJECTED');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}return path;}
function inside(root,path){if(typeof path!=='string'||!path||path.includes('\\')||path.split('/').includes('..')||resolve(path)===path)throw Error('REFRESH_PATH_REJECTED');const p=resolve(root,path),rel=relative(root,p);if(!rel||rel.startsWith('..'+sep))throw Error('REFRESH_PATH_REJECTED');return safe(p);}
function privatePath(root,path){path=resolve(path);if(!relative(root,path).startsWith('.market-cache'+sep))throw Error('REFRESH_PRIVATE_OUTPUT_REQUIRED');return safe(path);}
function scan(path){safe(path);const s=lstatSync(path);if(s.isDirectory())for(const n of readdirSync(path))scan(join(path,n));else if(!s.isFile())throw Error('REFRESH_FILE_TYPE_REJECTED');}
function put(path,bytes){safe(path);if(existsSync(path)){if(!readFileSync(path).equals(bytes))throw Error('REFRESH_IMMUTABLE_CONTENT_CONFLICT');return;}mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,bytes,{flag:'wx',mode:0o600});}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:32*1024*1024});}
function fileSha(path){return existsSync(path)?sha(readFileSync(path)):null;}
function validHash(value){return /^[a-f0-9]{64}$/.test(value||'');}
function assetReferenced(value,path){if(typeof value==='string')return value===path||value.endsWith('/'+path)||value==='files/wide/PASW.png';if(!value||typeof value!=='object')return false;return Object.entries(value).some(([key,v])=>assetReferenced(key,path)||assetReferenced(v,path));}
const sorted=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(sorted):Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,sorted(value[k])])):value;
const stable=value=>JSON.stringify(sorted(value));
const isoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString().slice(0,10)===value;
function chronological(row){return isoDate(row.periodEnd)&&isoDate(row.filedAt)&&row.filedAt>=row.periodEnd&&(row.availableAt===undefined||isoDate(row.availableAt)&&row.availableAt>=row.periodEnd&&row.availableAt>=row.filedAt);}
function validConsumerTtm(bundle){const formulas={free_cash_flow:{inputs:['operating_cash_flow','capital_expenditures'],add:false},ebitda:{inputs:['operating_income','depreciation_and_amortization'],add:true},net_debt:{inputs:['total_debt','cash_and_equivalents'],add:false}};
 const checked=new Set(),visiting=new Set();function verify(metric){if(checked.has(metric))return true;if(visiting.has(metric))return false;const row=bundle.ttm?.[metric];if(!row||!isoDate(row.end)||!Number.isFinite(row.v))return false;visiting.add(metric);let valid;
  if(row.derived===true){const recipe=formulas[metric],a=recipe&&bundle.ttm[recipe.inputs[0]],b=recipe&&bundle.ttm[recipe.inputs[1]];valid=!!(recipe&&stable(row.inputs)===stable(recipe.inputs)&&recipe.inputs.every(verify)&&row.end===a.end&&(metric==='net_debt'||row.through===a.through&&a.through===b.through)&&row.v===(recipe.add?a.v+b.v:a.v-b.v));}
  else valid=isoDate(row.filed)&&row.end<=row.filed&&row.filed<=bundle.asOf&&!!row.accn;
  visiting.delete(metric);if(valid)checked.add(metric);return valid;
 }return Object.keys(bundle.ttm||{}).every(verify);}
function observationKey(row){const {ingestedAt,revisionId,restatementStatus,...observation}=row;return stable(observation);}
function accountedObservations(before,after){if(!Array.isArray(before)||!Array.isArray(after)||after.some(row=>!chronological(row)))throw Error('REFRESH_CANONICAL_CHRONOLOGY_INVALID');const old=new Map(),next=new Map();for(const row of before.filter(chronological)){const key=observationKey(row);old.set(key,(old.get(key)||0)+1);}for(const row of after){const key=observationKey(row);next.set(key,(next.get(key)||0)+1);}if(old.size!==next.size||[...old].some(([key,count])=>next.get(key)!==count))throw Error('REFRESH_CANONICAL_VALID_OBSERVATION_CHANGED');return before.length-after.length;}

/** Storage migration can withhold invalid chronology, but cannot invent a
 * value/date or lose a previously valid observation. Revision ordinals and
 * original/restated labels may rebase when an invalid first revision leaves. */
export function verifyCanonicalMigrationObservations({before,after}){
 if(before.schema!=='vu-canonical-v1'||after.schema!==before.schema||stable(before.security)!==stable(after.security)||stable(before.dataSource)!==stable(after.dataSource)||stable(before.unsupportedMetrics??null)!==stable(after.unsupportedMetrics??null))throw Error('REFRESH_CANONICAL_IDENTITY_CHANGED');
 const withheldFacts=accountedObservations(before.facts,after.facts),withheldFilings=accountedObservations(before.filings,after.filings);
 const a=before.industrySpecificMetrics,b=after.industrySpecificMetrics;
 if(!!a!==!!b)throw Error('REFRESH_CANONICAL_INDUSTRY_METADATA_CHANGED');
 let withheldIndustryFacts=0;if(a){const {facts:af,...am}=a,{facts:bf,...bm}=b;if(stable(am)!==stable(bm))throw Error('REFRESH_CANONICAL_INDUSTRY_METADATA_CHANGED');withheldIndustryFacts=accountedObservations(af||[],bf||[]);}
 if(after.coverage?.factCount!==after.facts.length)throw Error('REFRESH_CANONICAL_COVERAGE_MISMATCH');
 return {validFactsPreserved:before.facts.filter(chronological).length,withheldFacts,withheldFilings,withheldIndustryFacts};
}

export function validateNewCanonicalStorageMigrations({baselineRoot,shadowRoot,original}){
 const migrations=[],indexPath='quant/data/sec/canonical_index.json',indexEntry=original.manifest.files.find(f=>f.path===indexPath);
 for(const file of original.manifest.files.filter(f=>/^quant\/data\/sec\/canonical\/[A-Z0-9_.-]+\.json$/.test(f.path)))if(existsSync(inside(shadowRoot,file.path))&&existsSync(inside(shadowRoot,file.path+'.gz')))throw Error('REFRESH_CANONICAL_STORAGE_DUPLICATE');
 const missing=original.manifest.files.filter(f=>/^quant\/data\/sec\/canonical\/[A-Z0-9_.-]+\.json$/.test(f.path)&&!existsSync(inside(shadowRoot,f.path)));
 if(!missing.length)return migrations;
 if(!indexEntry)throw Error('REFRESH_CANONICAL_INDEX_PROOF_MISSING');
 const oldIndex=read(inside(original.stage,indexEntry.stagedPath)),index=read(inside(shadowRoot,indexPath));
 for(const old of missing){const path=old.path+'.gz',ticker=old.path.split('/').at(-1).slice(0,-5),oldRows=(oldIndex.companies||[]).filter(r=>r.ticker===ticker),rows=(index.companies||[]).filter(r=>r.ticker===ticker);
  if(old.baselineSha256!==null||existsSync(inside(baselineRoot,old.path))||existsSync(inside(baselineRoot,path))||rows.length!==1||oldRows.length!==1||rows[0].file!=='canonical/'+ticker+'.json.gz'||oldRows[0].file!=='canonical/'+ticker+'.json'||rows[0].securityId!=='sec_'+ticker||oldRows[0].securityId!==rows[0].securityId||String(rows[0].cik).padStart(10,'0')!==String(oldRows[0].cik).padStart(10,'0')||!/^\d{10}$/.test(String(rows[0].cik).padStart(10,'0')))throw Error('REFRESH_CANONICAL_STORAGE_IDENTITY_INVALID');
  const bytes=readFileSync(inside(shadowRoot,path)),decoded=gunzipSync(bytes);
  // Python and Node can use different zlib versions and produce different
  // valid deflate bytes. Determinism requires the native fixed gzip header,
  // no filename/time/comment metadata and exactly one complete member, not
  // bit equality with a different runtime's recompressor.
  if(bytes.length<18||bytes[0]!==31||bytes[1]!==139||bytes[2]!==8||bytes[3]!==0||bytes.readUInt32LE(4)!==0||bytes[8]!==2||![3,255].includes(bytes[9]))throw Error('REFRESH_CANONICAL_GZIP_NOT_DETERMINISTIC');
  const inflated=inflateRawSync(bytes.subarray(10,-8),{info:true});if(inflated.engine.bytesWritten!==bytes.length-18||!inflated.buffer.equals(decoded))throw Error('REFRESH_CANONICAL_GZIP_NOT_DETERMINISTIC');
  const before=read(inside(original.stage,old.stagedPath)),after=JSON.parse(decoded),instrumentPath=CANONICAL_PUBLICATION_PATHS.instruments+'/'+Company.shardKey(ticker)+'.json',instruments=read(inside(shadowRoot,instrumentPath)).instruments?.filter(r=>r.symbol===ticker);
  if(after.security?.ticker!==ticker||after.security.securityId!==rows[0].securityId||instruments?.length!==1||instruments[0].cik!==String(rows[0].cik).padStart(10,'0'))throw Error('REFRESH_CANONICAL_STORAGE_IDENTITY_INVALID');
  const accounting=verifyCanonicalMigrationObservations({before,after});migrations.push({oldPath:old.path,path,ticker,securityId:rows[0].securityId,cik:String(rows[0].cik).padStart(10,'0'),originalSha256:old.stagedSha256,sha256:sha(bytes),decodedSha256:sha(decoded),...accounting});
 }
 return migrations;
}

export function rebindFinalProductizationReadiness({readiness,migrations}){
 const map=new Map(migrations.map(m=>[m.oldPath,m.path]));return readiness.map(input=>{const row=structuredClone(input),sec=row.products?.SEC;if(sec?.state==='PASS'){sec.artifactPaths=sec.artifactPaths.map(path=>map.get(path)||path);if(sec.artifactPaths.some(path=>/^quant\/data\/sec\/consumer\/CIK\d{10}\.json$/.test(path)))sec.artifactPaths=[...new Set([...sec.artifactPaths,'quant/data/sec/consumer/index.json'])];}return row;});
}

/** Rebind derived report metadata to actual final SEC bytes. The existing
 * native consumer summary is reused; a stale availability/count claim is an
 * error, not permission to manufacture a new readiness result. */
export function rebindCurrentFundamentalsArtifacts({root,rows}){
 root=resolve(root);safe(root);if(!Array.isArray(rows))throw Error('REFRESH_FUNDAMENTALS_ROWS_REQUIRED');
 const result=structuredClone(rows),index=read(inside(root,'quant/data/sec/canonical_index.json')),consumerIndex=read(inside(root,'quant/data/sec/consumer/index.json')),inputs=[],prepared=[];
 for(const row of result){const f=row.fundamentals??row;if(!f||f.fundamentalsStatus==='NONE'||!f.artifacts?.length)continue;
  const ticker=row.ticker||f.ticker,cik=String(f.cik||'').padStart(10,'0'),binding=(index.companies||[]).filter(r=>r.ticker===ticker),mapping=consumerIndex.byTicker?.[ticker];
  if(!/^[A-Z0-9_.-]+$/.test(ticker)||!/^\d{10}$/.test(cik)||f.ticker!==ticker||f.securityId!==row.securityId||f.identityVerified!==true||f.pitValid!==true||binding.length!==1||binding[0].securityId!=='sec_'+ticker||String(binding[0].cik).padStart(10,'0')!==cik||!['canonical/'+ticker+'.json','canonical/'+ticker+'.json.gz'].includes(binding[0].file)||String(mapping?.cik||'').padStart(10,'0')!==cik||mapping?.file!=='consumer/CIK'+cik+'.json')throw Error('REFRESH_FUNDAMENTALS_IDENTITY_MISMATCH:'+ticker);
  const master=read(inside(root,CANONICAL_PUBLICATION_PATHS.instruments+'/'+Company.shardKey(ticker)+'.json')).instruments?.filter(r=>r.symbol===ticker&&r.masterMemberId===f.securityId);
  if(master?.length!==1||master[0].cik!==cik||row.instrumentId&&row.instrumentId!==master[0].instrumentId)throw Error('REFRESH_FUNDAMENTALS_IDENTITY_MISMATCH:'+ticker);
  const consumerPath='quant/data/sec/'+mapping.file,canonicalPath='quant/data/sec/'+binding[0].file,consumerBytes=readFileSync(inside(root,consumerPath)),bundle=JSON.parse(consumerBytes),canonicalBytes=readFileSync(inside(root,canonicalPath)),decoded=canonicalPath.endsWith('.gz')?gunzipSync(canonicalBytes):canonicalBytes,canonical=JSON.parse(decoded);
  if(String(bundle.cik).padStart(10,'0')!==cik||!bundle.tickers?.includes(ticker)||!bundle.securityIds?.includes(f.securityId)||bundle.dataSource?.isMock!==false||canonical.schema!=='vu-canonical-v1'||canonical.security?.ticker!==ticker||canonical.security.securityId!==binding[0].securityId||canonical.security.isMock!==false||!isoDate(bundle.asOf)||!canonical.facts?.length||[...canonical.facts,...(canonical.industrySpecificMetrics?.facts||[]),...(canonical.filings||[])].some(r=>!chronological(r)))throw Error('REFRESH_FUNDAMENTALS_PIT_INVALID:'+ticker);
  const yearSet=new Set();for(const scope of ['annual','quarterly']){const counts={};for(const [metric,series]of Object.entries(bundle[scope]||{})){if(!Array.isArray(series)||series.some(r=>!Array.isArray(r)||!isoDate(r[2])||!isoDate(r[4])||r[2]>r[4]||r[4]>bundle.asOf||!r[5]||!Number.isFinite(r[3])))throw Error('REFRESH_FUNDAMENTALS_PIT_INVALID:'+ticker);counts[metric]=series.length;if(scope==='annual')for(const r of series)yearSet.add(r[0]);}if(stable(counts)!==stable(bundle.coverage?.[scope+'Metrics']))throw Error('REFRESH_FUNDAMENTALS_COVERAGE_INVALID:'+ticker);}
  // Native annualYears is the examined fiscal scope; a recent IPO can have
  // that scope with no published annual observations. Preserve its native
  // meaning and require every actual annual row to belong to that scope.
  const years=bundle.coverage?.annualYears;if(!Array.isArray(years)||years.some(y=>!Number.isInteger(y))||new Set(years).size!==years.length||[...yearSet].some(y=>!years.includes(y))||stable(Object.keys(bundle.ttm||{}).sort())!==stable([...(bundle.coverage?.ttmMetrics||[])].sort())||!validConsumerTtm(bundle))throw Error('REFRESH_FUNDAMENTALS_COVERAGE_INVALID:'+ticker);
  inputs.push({ticker,cik,path:inside(root,consumerPath)});prepared.push({row,f,ticker,bundle,consumerPath,consumerBytes,canonicalPath,canonicalBytes,decoded});
 }
 if(!prepared.length)return result;
 const nativeScript="import sys,json\nfrom quant.sec.consumer import summarize_bundle\nrows=json.load(sys.stdin);out={}\nfor row in rows:\n b=json.load(open(row['path']));s=summarize_bundle(b);present=set(b['coverage']['annualMetrics'])|set(b['coverage']['quarterlyMetrics'])|set(b['coverage']['ttmMetrics']);core=['revenue','net_income','operating_cash_flow','total_assets','stockholders_equity'];s['fundamentalsStatus']='FULL' if all(m in present for m in core) and s['h3'] else 'PARTIAL';s['metricAvailability']={m:('AVAILABLE' if m in present else 'NOT_REPORTED') for m in core};out[row['ticker']]=s\nprint(json.dumps(out))";
 const summaries=JSON.parse(execFileSync('python3',['-c',nativeScript],{env:{...process.env,PYTHONPATH:fileURLToPath(new URL('..',import.meta.url))},input:JSON.stringify(inputs),encoding:'utf8',maxBuffer:4*1024*1024}));
 for(const p of prepared){const summary=summaries[p.ticker];for(const field of ['fundamentalsStatus','annualYears','quarterly','ttm','metrics','metricAvailability'])if(stable(p.f[field])!==stable(summary[field]))throw Error('REFRESH_FUNDAMENTALS_STALE_CLAIM:'+p.ticker+':'+field);
  if(fileSha(inside(root,p.consumerPath))!==sha(p.consumerBytes)||fileSha(inside(root,p.canonicalPath))!==sha(p.canonicalBytes))throw Error('REFRESH_FUNDAMENTALS_SOURCE_CHANGED');
  p.f.artifacts=[{path:p.consumerPath,sha256:sha(p.consumerBytes),bytes:p.consumerBytes.length},{path:p.canonicalPath,sha256:sha(p.canonicalBytes),bytes:p.canonicalBytes.length,storage:p.canonicalPath.endsWith('.gz')?'GZIP':'JSON',decodedSha256:sha(p.decoded),decodedBytes:p.decoded.length,roundtripVerified:true}];
 }
 return result;
}

/** A peer normalization can change shard bytes without changing a security's
 * factor availability. Rebind only the evidence hash after the actual native
 * record reproduces every old state/classification; never enable composites
 * or upgrade a blocked/unavailable product through report metadata. */
export function rebindCurrentQuantEvidenceArtifacts({root,rows}){
 root=resolve(root);safe(root);if(!Array.isArray(rows))throw Error('REFRESH_QUANT_ROWS_REQUIRED');
 const methodology=read(inside(root,'quant/methodology/quant-v2.json'));if(methodology.publication?.allowed!==false)throw Error('REFRESH_QUANT_COMPOSITE_POLICY_CHANGED');
 const result=structuredClone(rows),cache=new Map();
 for(const row of result){const q=row.quant??row;if(!q||!q.quantStatus)continue;const ticker=row.ticker||q.ticker,id=row.securityId||q.securityId,shard=Company.shardKey(ticker),path='quant/data/product/factor-evidence-v1/'+shard+'.json.gz';
  if(q.ticker!==ticker||q.securityId!==id||q.fullQuantScoreReady!==false||q.fullQuantScoreState!=='BLOCKED_BY_EXISTING_METHODOLOGY')throw Error('REFRESH_QUANT_IDENTITY_OR_COMPOSITE_CHANGED:'+ticker);
  let evidence=cache.get(path);if(!evidence&&existsSync(inside(root,path))){const bytes=readFileSync(inside(root,path)),payload=JSON.parse(gunzipSync(bytes));if(!FactorEvidence.validShard(payload,shard))throw Error('REFRESH_QUANT_SHARD_INVALID:'+ticker);evidence={bytes,payload};cache.set(path,evidence);}
  const record=evidence?.payload.securities?.[ticker];if(record&&(record.ticker!==ticker||record.securityId!==id||FactorEvidence.publicationViolations(record).length))throw Error('REFRESH_QUANT_RECORD_INVALID:'+ticker);
  const classification=classifyMaterializedFactorRecord(record,{publicationAllowed:false,refreshedPrice:q.refreshedPrice===true,expectedTicker:ticker,expectedSecurityId:id,expectedAsOf:q.canonicalEvidence?.verified?q.canonicalEvidence.asOf:undefined});
  for(const field of ['quantStatus','factorDnaStatus','availableFactors','fullQuantScoreReady'])if(stable(classification[field])!==stable(q[field]))throw Error('REFRESH_QUANT_STALE_CLASSIFICATION:'+ticker+':'+field);
  if(q.canonicalEvidence?.verified!==true){if(q.productQuantReady!==false||q.canonicalEvidence?.state!=='NOT_MATERIALIZED')throw Error('REFRESH_QUANT_BLOCKED_EVIDENCE_UPGRADE:'+ticker);continue;}
  const master=read(inside(root,CANONICAL_PUBLICATION_PATHS.instruments+'/'+shard+'.json')).instruments?.filter(i=>i.symbol===ticker&&i.masterMemberId===id);
  if(!record||master?.length!==1||row.instrumentId&&row.instrumentId!==master[0].instrumentId||(record.cik??null)!==(master[0].cik??null)||q.productQuantReady!==true||q.canonicalEvidence.state!=='MATERIALIZED'||q.canonicalEvidence.artifactPath!==path||q.canonicalEvidence.ticker!==ticker||q.canonicalEvidence.securityId!==id||q.canonicalEvidence.schemaVersion!==evidence.payload.schemaVersion||q.canonicalEvidence.methodologyVersion!==evidence.payload.methodologyVersion||q.bars!==record.bars)throw Error('REFRESH_QUANT_CANONICAL_BINDING_CHANGED:'+ticker);
  const states=Object.fromEntries(FactorEvidence.FACTOR_ORDER.map(f=>{const factor=record.factors[f];return [f,{state:factor.state,reason:factor.reason??null,componentStates:(factor.components||[]).map(c=>({id:c.id,state:c.state,reason:c.reason??null}))}];}));
  if(stable(states)!==stable(q.factorStates))throw Error('REFRESH_QUANT_FACTOR_STATES_CHANGED:'+ticker);
  q.canonicalEvidence={...q.canonicalEvidence,artifactSha256:sha(evidence.bytes)};
 }
 for(const [path,evidence]of cache)if(fileSha(inside(root,path))!==sha(evidence.bytes))throw Error('REFRESH_QUANT_SOURCE_CHANGED');
 return result;
}

/** A historical audit may replace its formerly mutable baseline reference
 * with a content-addressed snapshot. It remains source provenance, never a
 * current membership or product projection. Only these exact metadata fields
 * may change, and the snapshot must equal the original Git/raw baseline. */
export function validateSourceOnlyHistoricalProvenance({baselineRoot,shadowRoot,changed}){
 const path='quant/data/market/security-master/reconciliation.json';
 const snapshotPrefix='quant/data/market/security-master/baselines/';
 const possible=changed.filter(p=>p===path||p.startsWith(snapshotPrefix));if(!possible.length)return [];
 const before=read(inside(baselineRoot,path)),after=read(inside(shadowRoot,path)),e=after.nonDestructive,source=CANONICAL_PUBLICATION_PATHS.raw;
 const snapshot=snapshotPrefix+'universe-FULL_UNIVERSE.'+e?.baselineSha256+'.json.gz';
 if(possible.length!==2||!possible.includes(path)||!possible.includes(snapshot)||!validHash(e?.baselineSha256)||e.baselineFile!==snapshot||e.baselineSourceFile!==source||e.baselineSourceCommit!==before.run?.commit||!/^[a-f0-9]{40}$/.test(e.baselineSourceCommit)||before.nonDestructive?.baselineFile!==source)throw Error('REFRESH_HISTORICAL_PROVENANCE_INVALID');
 const expected={...before,nonDestructive:{...before.nonDestructive,baselineFile:snapshot,baselineSourceFile:source,baselineSha256:e.baselineSha256,baselineSourceCommit:e.baselineSourceCommit}};
 if(JSON.stringify(after)!==JSON.stringify(expected))throw Error('REFRESH_HISTORICAL_AUDIT_ROWS_CHANGED');
 const compressed=readFileSync(inside(shadowRoot,snapshot)),bytes=gunzipSync(compressed),originalBytes=execFileSync('git',['-C',baselineRoot,'show',e.baselineSourceCommit+':'+source],{maxBuffer:32*1024*1024});
 const count=JSON.parse(bytes).securities?.length;
 if(sha(bytes)!==e.baselineSha256||!bytes.equals(originalBytes)||fileSha(inside(baselineRoot,source))!==e.baselineSha256||count!==before.nonDestructive.baselineCount||count!==before.nonDestructive.baselinePreserved||before.nonDestructive.baselineRemoved!==0)throw Error('REFRESH_HISTORICAL_SNAPSHOT_NOT_ORIGINAL');
 return possible.map(path=>({path,sha256:fileSha(inside(shadowRoot,path)),category:'SOURCE_ONLY_HISTORICAL_PROVENANCE'}));
}

/** The native FX debt register records source locations, not market data.
 * A reader guard can move a preserved debt line. Only its timestamp/line
 * metadata may change; every complete referenced code line must remain
 * identical and both locations must reproduce the native scanner result.
 * This exemption applies to this register alone, never an FX projection. */
export function validateSourceOnlyCurrencyDebtMetadata({baselineRoot,shadowRoot,changed}){
 const path='quant/data/market/fx/currency-debt-register.json';if(!changed.includes(path))return [];
 const beforeBytes=readFileSync(inside(baselineRoot,path)),afterBytes=readFileSync(inside(shadowRoot,path)),before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);
 const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value;
 if(before.schema!=='vu-currency-debt-register-1.0.0'||after.schema!==before.schema||!timestamp(before.generatedAtUtc)||!timestamp(after.generatedAtUtc)||after.generatedAtUtc<before.generatedAtUtc||!Array.isArray(before.entries)||!Array.isArray(after.entries))throw Error('REFRESH_CURRENCY_DEBT_METADATA_INVALID');
 const functional=register=>{const {generatedAtUtc,entries,...rest}=register;return {...rest,entries:entries.map(({line,...entry})=>entry)};};
 const content=functional(before);if(stable(content)!==stable(functional(after)))throw Error('REFRESH_CURRENCY_DEBT_FUNCTIONAL_CHANGE');
 const sources=new Map(),movedReferences=[];
 for(let i=0;i<before.entries.length;i++){
  const old=before.entries[i],next=after.entries[i];
  if(!Number.isSafeInteger(old.line)||old.line<1||!Number.isSafeInteger(next.line)||next.line<1)throw Error('REFRESH_CURRENCY_DEBT_SOURCE_REFERENCE_INVALID');
  let source=sources.get(old.file);if(!source){const oldBytes=readFileSync(inside(baselineRoot,old.file)),bytes=readFileSync(inside(shadowRoot,old.file));source={file:old.file,beforeSha256:sha(oldBytes),sha256:sha(bytes),old:codeLines(oldBytes.toString('utf8')),next:codeLines(bytes.toString('utf8'))};sources.set(old.file,source);}
  const a=source.old.find(r=>r.line===old.line),b=source.next.find(r=>r.line===next.line);
  if(!a||!b||a.text!==b.text||a.text.slice(0,160)!==old.text||b.text.slice(0,160)!==next.text||HARDCODED_CURRENCY.find(r=>r.re.test(a.text))?.id!==old.rule||HARDCODED_CURRENCY.find(r=>r.re.test(b.text))?.id!==next.rule)throw Error('REFRESH_CURRENCY_DEBT_SOURCE_REFERENCE_INVALID');
  if(old.line!==next.line)movedReferences.push({file:old.file,rule:old.rule,beforeLine:old.line,line:next.line});
 }
 return [{path,category:'SOURCE_ONLY_CURRENCY_DEBT_METADATA',beforeSha256:sha(beforeBytes),sha256:sha(afterBytes),functionalSha256:sha(stable(content)),entryCount:before.entries.length,movedReferences,sourceFiles:[...sources.values()].map(({file,beforeSha256,sha256})=>({file,beforeSha256,sha256}))}];
}

/** The caller must authenticate/decrypt with tiingo2-cache.open first and bind
 * the expected manifest/source commit to the trusted original Actions run. */
export function validateOriginalPublicationPackage({originalPreparedRoot,expectedManifestSha256}){
 originalPreparedRoot=resolve(originalPreparedRoot);scan(originalPreparedRoot);
 const stage=join(originalPreparedRoot,'canonical-stage'),manifestBytes=readFileSync(join(stage,'manifest.json')),manifest=JSON.parse(manifestBytes),proof=read(join(stage,'qa-proof.json'));
 if(!validHash(expectedManifestSha256)||sha(manifestBytes)!==expectedManifestSha256||manifest.schemaVersion!=='tiingo2-canonical-publication-1.0.0'||manifest.removals?.length||!Array.isArray(manifest.additions)||!manifest.additions.length||!Array.isArray(manifest.files)||!manifest.baselineHashes||manifest.projectionStatus!=='MATERIALIZED_AND_VERIFIED'||proof.schemaVersion!==PRODUCTIZATION_QA_SCHEMA||proof.manifestSha256!==expectedManifestSha256||proof.productReadinessSha256!==manifest.productizationReadinessSha256||proof.productionWrites!==0||REQUIRED_PUBLICATION_QA.some(k=>proof.checks?.[k]!=='PASS'))throw Error('ORIGINAL_PUBLICATION_PROOF_INVALID');
 const receipt=read(join(stage,'applied.json'));
 if(receipt.status!=='APPLIED'||receipt.manifestSha256!==expectedManifestSha256||JSON.stringify(receipt.files)!==JSON.stringify(manifest.files)||JSON.stringify(receipt.baselineHashes)!==JSON.stringify(manifest.baselineHashes))throw Error('ORIGINAL_ROLLBACK_RECEIPT_INVALID');
 const paths=new Set();for(const f of manifest.files){if(paths.has(f.path))throw Error('ORIGINAL_DUPLICATE_PATH');paths.add(f.path);
  const bytes=readFileSync(inside(stage,f.stagedPath));if(sha(bytes)!==f.stagedSha256||bytes.length!==f.bytes||manifest.baselineHashes[f.path]!==f.baselineSha256)throw Error('ORIGINAL_STAGED_BYTES_INVALID');
  if(f.baselineSha256!==null&&(!validHash(f.baselineSha256)||fileSha(inside(stage,'rollback/'+f.path))!==f.baselineSha256))throw Error('ORIGINAL_ROLLBACK_BYTES_INVALID');
 }
 const historyBytes=readFileSync(join(originalPreparedRoot,'history-publication-plan.json')),history=JSON.parse(historyBytes);
 if(proof.historyPlanSha256!==sha(historyBytes))throw Error('ORIGINAL_HISTORY_PROOF_INVALID');
 validatePreparedHistoryPlan({history,additions:manifest.additions,publicationManifestSha256:expectedManifestSha256});
 for(const row of history.rows){const bytes=readFileSync(inside(originalPreparedRoot,row.path)),payload=JSON.parse(bytes);
  if(sha(bytes)!==row.sha256||payload.ticker!==row.ticker||payload.securityId!==row.securityId||payload.provider!=='tiingo'||payload.bars?.length!==row.bars||payload.bars.some(b=>b.securityId!==row.securityId))throw Error('ORIGINAL_PRIVATE_HISTORY_INVALID');
 }
 return {stage,manifest,proof,history,historySha256:sha(historyBytes)};
}

export function prepareRefreshedPublicationPackage({root=process.cwd(),originalPreparedRoot,workDir,preparedRoot,expectedManifestSha256,originalSourceCommit,expectedSourceCommit,runId}={}){
 root=resolve(root);safe(root);originalPreparedRoot=privatePath(root,originalPreparedRoot);workDir=privatePath(root,workDir);preparedRoot=privatePath(root,preparedRoot);
 if(!runId||![originalSourceCommit,expectedSourceCommit].every(h=>/^[a-f0-9]{40}$/.test(h||''))||git(root,['rev-parse','HEAD']).trim()!==expectedSourceCommit)throw Error('REFRESH_SOURCE_BINDING_INVALID');
 if([originalPreparedRoot,preparedRoot].some(p=>p===workDir||p.startsWith(workDir+sep)||workDir.startsWith(p+sep))||originalPreparedRoot===preparedRoot||originalPreparedRoot.startsWith(preparedRoot+sep)||preparedRoot.startsWith(originalPreparedRoot+sep)||existsSync(workDir)||existsSync(preparedRoot))throw Error('REFRESH_NEW_SEPARATE_OUTPUT_REQUIRED');
 const original=validateOriginalPublicationPackage({originalPreparedRoot,expectedManifestSha256}),sourceHead=git(root,['rev-parse','HEAD']).trim();
 // Use tracked final bytes exclusively; uncommitted data must never become a
 // package accidentally. Code/config are separately covered by full final QA.
 if(git(root,['status','--porcelain','--untracked-files=all','--',...dataPrefixes.map(p=>p.slice(0,-1))]).trim())throw Error('REFRESH_FINAL_PUBLIC_TREE_NOT_COMMITTED');
 const baselineRoot=join(workDir,'baseline-root'),shadowRoot=join(workDir,'shadow-root');mkdirSync(workDir,{recursive:true,mode:0o700});
 git(root,['worktree','add','--detach',baselineRoot,originalSourceCommit]);git(root,['worktree','add','--detach',shadowRoot,expectedSourceCommit]);
 for(const tree of [baselineRoot,shadowRoot])for(const prefix of dataPrefixes)if(existsSync(join(tree,prefix)))scan(join(tree,prefix));
 for(const [path,expected]of Object.entries(original.manifest.baselineHashes))if(fileSha(inside(baselineRoot,path))!==expected)throw Error('ORIGINAL_SOURCE_BASELINE_HASH_MISMATCH:'+path);
 const paths=new Set(original.manifest.files.map(f=>f.path));
 const changed=git(root,['diff','--name-only','--no-renames',originalSourceCommit,expectedSourceCommit,'--',...dataPrefixes.map(p=>p.slice(0,-1))]).trim().split('\n').filter(Boolean);
 const sourceOnly=validateSourceOnlyHistoricalProvenance({baselineRoot,shadowRoot,changed}),sourceOnlyCurrencyDebtMetadata=validateSourceOnlyCurrencyDebtMetadata({baselineRoot,shadowRoot,changed}),sourceOnlyPaths=new Set([...sourceOnly,...sourceOnlyCurrencyDebtMetadata].map(r=>r.path));
 for(const path of changed){if(sourceOnlyPaths.has(path))continue;if(!isProductizationProjectionPath(path)&&path!==CANONICAL_PUBLICATION_PATHS.raw)throw Error('REFRESH_UNSUPPORTED_PUBLIC_DIFF:'+path);paths.add(path);}
 const canonicalMigrations=validateNewCanonicalStorageMigrations({baselineRoot,shadowRoot,original}),canonicalOldPaths=new Set(canonicalMigrations.map(m=>m.oldPath));
 for(const migration of canonicalMigrations)paths.add(migration.path);
 const omitted=[];for(const path of paths){if(existsSync(inside(shadowRoot,path)))continue;
  if(canonicalOldPaths.has(path)){omitted.push(path);paths.delete(path);continue;}
  // The quarantined PASW wide asset was first introduced by the old stage.
  // Omitting it is safe only when no baseline asset or final alias exists.
  const entry=original.manifest.files.find(f=>f.path===path),index=read(join(shadowRoot,'discover/logos/index.json')),creditsPath=join(shadowRoot,'discover/logos/credits.json'),credits=existsSync(creditsPath)?read(creditsPath):{};
  if(path!=='discover/logos/files/wide/PASW.png'||entry?.baselineSha256!==null||existsSync(inside(baselineRoot,path))||Object.hasOwn(index.wide??{},'PASW')||index.wide?.includes?.('PASW')||assetReferenced(index,path)||assetReferenced(credits,path))throw Error('REFRESH_BASELINE_OR_UNPROVED_REMOVAL:'+path);
  omitted.push(path);paths.delete(path);
 }
 const stage=join(workDir,'canonical-stage');mkdirSync(stage,{recursive:true,mode:0o700});
 const manifest=structuredClone(original.manifest);manifest.runId=runId;manifest.status='STAGED_ONLY';manifest.canonicalFilesWritten=false;manifest.files=manifest.files.filter(f=>!omitted.includes(f.path));
 manifest.publicationRefresh={schemaVersion:'tiingo2-publication-package-refresh-1',originalManifestSha256:expectedManifestSha256,originalHistoryPlanSha256:original.historySha256,originalSourceCommit,finalSourceCommit:sourceHead,omittedNewAssets:omitted.filter(p=>!canonicalOldPaths.has(p)),canonicalStorageMigrations:canonicalMigrations,sourceOnlyHistoricalProvenance:sourceOnly,sourceOnlyCurrencyDebtMetadata,providerCalls:0,historyRebuilds:0,productionWrites:0};
 for(const f of manifest.files){put(inside(stage,f.stagedPath),readFileSync(inside(original.stage,f.stagedPath)));if(f.baselineSha256!==null)put(inside(stage,'rollback/'+f.path),readFileSync(inside(original.stage,'rollback/'+f.path)));}
 put(join(stage,'manifest.json'),encode(manifest));
 const raw=manifest.files.find(f=>f.path===CANONICAL_PUBLICATION_PATHS.raw);if(raw&&fileSha(inside(shadowRoot,raw.path))!==raw.stagedSha256)throw Error('REFRESH_RAW_MEMBERSHIP_CHANGED');
 const attached=attachCanonicalProjections({root:baselineRoot,staged:{manifestPath:join(stage,'manifest.json')},preparedFiles:[...paths].filter(isProductizationProjectionPath).sort().map(path=>({path,bytes:readFileSync(inside(shadowRoot,path))})),productizationReadiness:rebindFinalProductizationReadiness({readiness:original.manifest.productizationReadiness,migrations:canonicalMigrations})});
 const verified=verifyStagedCanonicalPublication({root:baselineRoot,staged:attached});
 for(const entry of attached.files){const before=inside(baselineRoot,entry.path),backup=inside(stage,'rollback/'+entry.path);if(entry.baselineSha256!==null&&!existsSync(backup))put(backup,readFileSync(before));if(entry.baselineSha256!==null&&fileSha(backup)!==entry.baselineSha256)throw Error('REFRESH_ROLLBACK_BYTES_INVALID');}
 for(const row of original.history.rows){const source=inside(originalPreparedRoot,row.path),target=inside(preparedRoot,row.path);mkdirSync(dirname(target),{recursive:true,mode:0o700});copyFileSync(source,target);if(fileSha(target)!==row.sha256)throw Error('REFRESH_HISTORY_BYTES_CHANGED');}
 const history={...original.history,publicationManifestSha256:verified.manifestSha256};put(join(preparedRoot,'history-publication-plan.json'),encode(history));
 if(git(root,['rev-parse','HEAD']).trim()!==sourceHead||git(root,['status','--porcelain','--untracked-files=all','--',...dataPrefixes.map(p=>p.slice(0,-1))]).trim())throw Error('REFRESH_SOURCE_CHANGED_DURING_PREPARATION');
 const result={schemaVersion:'tiingo2-publication-package-refresh-1',state:'STAGED_REQUIRES_FINAL_QA',runId,sourceCommit:sourceHead,originalSourceCommit,originalManifestSha256:expectedManifestSha256,manifestSha256:verified.manifestSha256,files:verified.files,additions:verified.additions,privateHistories:history.rows.length,privateHistoriesRebuilt:0,omittedNewAssets:omitted.filter(p=>!canonicalOldPaths.has(p)),canonicalStorageMigrations:canonicalMigrations,baselineRoot,shadowRoot,stage:attached.manifestPath,preparedRoot,providerCalls:0,productionWrites:0,productionPublishAllowed:false,requiredGates:['FINAL_EXACT_BYTE_QA','CURRENT_PRODUCTION_BASELINE_CAS','CURRENT_STORAGE_PREFLIGHT']};
 put(join(workDir,'run-result.json'),encode(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const mapping={'--root':'root','--original-prepared':'originalPreparedRoot','--work-dir':'workDir','--prepared-root':'preparedRoot','--original-manifest-sha':'expectedManifestSha256','--original-source-commit':'originalSourceCommit','--source-commit':'expectedSourceCommit','--run-id':'runId'},args={};for(let i=2;i<process.argv.length;i+=2){const key=mapping[process.argv[i]];if(!key||args[key]||!process.argv[i+1])throw Error('INVALID_REFRESH_ARGUMENT');args[key]=process.argv[i+1];}try{console.log(JSON.stringify(prepareRefreshedPublicationPackage(args)));}catch(e){console.error(e.message);process.exitCode=1;}}
