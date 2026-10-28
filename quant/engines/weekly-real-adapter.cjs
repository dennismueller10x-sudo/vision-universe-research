/* Offline real-series adapter. No provider requests or synthetic fallback. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CorporateActions = require('./corporate-action-evidence.js');
const ClassificationEvidence = require('./research-classification-evidence.cjs');
if (ClassificationEvidence.schemaVersion !== 'research-classification-evidence-1.0.0' || !Array.isArray(ClassificationEvidence.records)) throw Error('INVALID_RESEARCH_CLASSIFICATION_EVIDENCE');
function classificationConflict(doc, identity) {
  return ClassificationEvidence.records.find(e => e.decision === 'HOLD_COMMON_STOCK_RESEARCH' && e.securityId === doc.securityId && e.canonicalId === identity?.canonical_id && e.ticker === doc.ticker);
}
const hash = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
// Exact replay requires the numerical runtime as well as prices/code/model.
// Cache once per process; expose only public runtime metadata, never the report/environment.
let runtimeMemo=null;
function calculationRuntime(){
  if(!runtimeMemo){
    let glibcVersion=null;try{glibcVersion=process.report?.getReport().header.glibcVersionRuntime||null;}catch{}
    runtimeMemo=Object.freeze({nodeVersion:process.versions.node,v8Version:process.versions.v8,platform:process.platform,arch:process.arch,glibcVersion,
      nodeExecutableHash:crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex')});
  }
  return runtimeMemo;
}
function monday(date) { const d = new Date(date+'T00:00:00Z'); const n=d.getUTCDay(); d.setUTCDate(d.getUTCDate()-(n+6)%7); return +d; }
function validate(doc, identity) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf) || !Number.isFinite(Date.parse(doc.asOf)) || new Date(doc.asOf).toISOString().slice(0,10)!==doc.asOf || doc.asOf>new Date().toISOString().slice(0,10) || doc.instrumentId !== doc.ticker) throw Error('INVALID_SOURCE_METADATA');
  if (doc.dataMode !== 'real' || doc.priceSeriesType !== 'SPLIT_ADJUSTED' || doc.grain !== 'weekly') throw Error('REAL_WEEKLY_PRICE_REQUIRED');
  if (!identity || !identity.canonical_id || identity.baseline_security_id !== doc.securityId || identity.ticker !== doc.ticker || identity.currency !== doc.currency || identity.provider !== doc.provider || doc.from < identity.start_date) throw Error('LISTING_IDENTITY_MISMATCH');
  if (classificationConflict(doc, identity)) throw Error('ORIGINAL_SOURCE_CLASSIFICATION_CONFLICT');
  if (identity.active_status !== 'ACTIVE') throw Error('INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED');
  if (identity.eligible_us_equity!==true || identity.instrument_type!=='EQUITY_COMMON') throw Error('INELIGIBLE_EQUITY_LISTING');
  if (!Array.isArray(doc.points) || doc.points.length < 55) throw Error('INSUFFICIENT_HISTORY');
  if ((doc.corporateActions?.splits || []).some(a => !Array.isArray(a) || !/^\d{4}-\d{2}-\d{2}$/.test(a[0]) || !Number.isFinite(a[1]) || a[1]<=0 || a[0]>doc.asOf)) throw Error('INVALID_SPLIT_EVIDENCE');
  const gaps=[];
  doc.points.forEach(([date,price],i)=>{
    const d=new Date(date+'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+d) || d.toISOString().slice(0,10)!==date || ![1,2,3,4,5].includes(d.getUTCDay()) || !Number.isFinite(price) || price<=0 || date>doc.asOf) throw Error('INVALID_WEEKLY_BAR');
    if(i) { const prev=doc.points[i-1][0]; if(date<=prev || monday(date)<=monday(prev)) throw Error('UNORDERED_OR_DUPLICATE_WEEK'); if(monday(date)-monday(prev)!==604800000) gaps.push({after:prev,before:date}); }
  });
  if(doc.from!==doc.points[0][0] || doc.to!==doc.points.at(-1)[0]) throw Error('SERIES_BOUNDARY_MISMATCH');
  if(gaps.length) throw Error('MISSING_WEEKS:'+JSON.stringify(gaps));
  const suspected=doc.points.flatMap(([date,price],i)=>i && CorporateActions.splitSized(price/doc.points[i-1][1])?[{time:date}]:[]);
  const corporateActionQuality=CorporateActions.resolve(suspected,doc.corporateActions);
  if(corporateActionQuality.status==='UNRESOLVED')throw Error('CORPORATE_ACTION_UNRESOLVED:'+JSON.stringify(corporateActionQuality.items));
  for(const suspect of suspected){const i=doc.points.findIndex(p=>p[0]===suspect.time), evidence=doc.corporateActions.moves.find(m=>m.week===suspect.time);if(!Number.isFinite(evidence.weeklyRatio)||Math.abs(evidence.weeklyRatio-doc.points[i][1]/doc.points[i-1][1])>0.00001)throw Error('CORPORATE_ACTION_EVIDENCE_MISMATCH');}
  return { corporateActionQuality,dataMode:'real',sourceSchemaVersion:doc.schemaVersion,calendar:'OBSERVED_ISO_WEEKS',publishBasis:doc.publishBasis||null,listingId:identity.canonical_id, securityId:doc.securityId, ticker:doc.ticker, currency:doc.currency, provider:doc.provider, listingStart:identity.start_date, identityEvidence:identity.source_provenance, identityHash:hash(identity), sourceHash:hash(doc), asOf:doc.asOf, returnBasis:'PRICE_RETURN', adjustment:'SPLIT_ADJUSTED', points:doc.points, corporateActions:doc.corporateActions || null, warnings:['EX_POST_ADJUSTED_HISTORY_NOT_AS_PUBLISHED_PIT','DIVIDENDS_EXCLUDED','SPLIT_ADJUSTMENT_PROVIDER_EVIDENCE_ONLY_NO_RAW_RECONSTRUCTION','FRACTIONAL_SPLIT_ADJUSTED_UNITS','SINGLE_LISTING_SELECTION_NO_MARKET_WIDE_EDGE','WEEKLY_CALENDAR_FROM_OBSERVED_BARS_NOT_INTRADAY_SESSION_PROOF'] };
}
// Loader options (generic; every key is opt-in and DEFAULT OFF, so createLoader(root) is unchanged):
//   identityEvidence: true                     apply the SEC-sourced bindings of research-identity-evidence.cjs
//                                              (evidenceLevel SEC_SAME_DAY_PRICE_AND_COVER only)
//   identityEvidenceAllowCoverPageOnly: true   additionally apply COVER_PAGE_ONLY bindings (requires identityEvidence)
// Unknown keys or non-boolean values fail closed (INVALID_LOADER_OPTIONS). New research registries add their own key here.
const LOADER_OPTIONS=Object.freeze(['identityEvidence','identityEvidenceAllowCoverPageOnly']);
function loaderOptions(options){
  if(options===undefined)return {};
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.getPrototypeOf(options)!==Object.prototype)throw Error('INVALID_LOADER_OPTIONS');
  for(const [k,v] of Object.entries(options))if(!LOADER_OPTIONS.includes(k)||typeof v!=='boolean')throw Error('INVALID_LOADER_OPTIONS:'+k);
  if(options.identityEvidenceAllowCoverPageOnly&&!options.identityEvidence)throw Error('INVALID_LOADER_OPTIONS:identityEvidenceAllowCoverPageOnly');
  return {...options};
}
// Research identity evidence (opt-in only; the registry module is not even required on the default path).
const IDENTITY_EVIDENCE_SCHEMA='research-identity-evidence-1.0.0', IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS=400;
const IDENTITY_EVIDENCE_LEVELS=Object.freeze(['SEC_SAME_DAY_PRICE_AND_COVER','COVER_PAGE_ONLY']);
function validateIdentityEvidenceRegistry(reg){
  const bad=why=>{throw Error('INVALID_RESEARCH_IDENTITY_EVIDENCE:'+why);};
  const DATE=/^\d{4}-\d{2}-\d{2}$/, HEX=/^[a-f0-9]{64}$/, ACC=/^\d{10}-\d{2}-\d{6}$/, isDate=x=>DATE.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  if(!reg||reg.schemaVersion!==IDENTITY_EVIDENCE_SCHEMA||!Array.isArray(reg.records)||!reg.records.length)bad('SCHEMA');
  const seen=new Set();
  for(const r of reg.records){
    const id=r?.securityId;
    if(typeof id!=='string'||!/^ref_[A-Za-z0-9_.-]+$/.test(id)||seen.has(id))bad('SECURITY_ID');seen.add(id);
    if(typeof r.ticker!=='string'||id!=='ref_'+r.ticker||!/^\d{10}$/.test(r.cik)||typeof r.issuer!=='string'||!r.issuer)bad('ISSUER:'+id);
    if(typeof r.canonicalId!=='string'||!r.canonicalId.startsWith('v9-sec-binding:'+r.cik+':'+r.ticker+':')||r.masterRowAction!=='REPLACE_MISBOUND_ROW')bad('CANONICAL_ID:'+id);
    if(!Array.isArray(r.replacesCanonicalIds)||!r.replacesCanonicalIds.length||r.replacesCanonicalIds.some(x=>typeof x!=='string'||!x||x===r.canonicalId))bad('REPLACES:'+id);
    if(!['XNAS','XNYS','XASE'].includes(r.mic)||!/COMMON/.test(r.instrumentClass||'')||r.currency!=='USD'||typeof r.provider!=='string'||r.activeStatus!=='ACTIVE_SEC_CONFIRMED')bad('LISTING:'+id);
    if(!isDate(r.validFrom)||!(r.validTo===null||isDate(r.validTo)&&r.validTo>=r.validFrom))bad('INTERVAL:'+id);
    if(!IDENTITY_EVIDENCE_LEVELS.includes(r.evidenceLevel))bad('EVIDENCE_LEVEL:'+id);
    const g=r.historyGuard;if(!g||g.checkedFrom!==r.validFrom||!isDate(g.checkedTo)||g.checkedTo<g.checkedFrom||!HEX.test(g.pointsSha256)||!Number.isInteger(g.bars)||g.bars<1)bad('HISTORY_GUARD:'+id);
    const c=r.lastConfirmedCover;if(!c||!ACC.test(c.accession)||!isDate(c.filingDate)||!HEX.test(c.sha256))bad('LAST_COVER:'+id);
    if(!Array.isArray(r.sources)||!r.sources.length||r.sources.some(s=>!ACC.test(s?.accession)||!HEX.test(s.sha256)||typeof s.url!=='string'||!s.url.startsWith('https://www.sec.gov/Archives/edgar/data/')||typeof s.claim!=='string'||!s.claim))bad('SOURCES:'+id);
    if(!r.sources.some(s=>s.accession===c.accession&&s.sha256===c.sha256))bad('LAST_COVER_NOT_SOURCED:'+id);
    const pe=r.priceEvidence;if(!Array.isArray(pe)||pe.some(p=>!isDate(p?.date)||!ACC.test(p.accession)||!HEX.test(p.sha256)))bad('PRICE_EVIDENCE:'+id);
    if((r.evidenceLevel==='COVER_PAGE_ONLY')!==(pe.length===0))bad('EVIDENCE_LEVEL_PRICE_EVIDENCE:'+id);
  }
  return reg;
}
function identityEvidenceBindings(options){
  const reg=validateIdentityEvidenceRegistry(require('./research-identity-evidence.cjs'));
  const levels=options.identityEvidenceAllowCoverPageOnly?IDENTITY_EVIDENCE_LEVELS:['SEC_SAME_DAY_PRICE_AND_COVER'];
  return {registryHash:hash(reg),bindings:new Map(reg.records.filter(r=>levels.includes(r.evidenceLevel)).map(r=>[r.securityId,r]))};
}
function coverAgeDays(asOf,filingDate){return Math.round((Date.parse(asOf+'T00:00:00Z')-Date.parse(filingDate+'T00:00:00Z'))/86400000);}
function loadBound(record,securityId,doc,rows,canonical,registryHash){
  // Master rows: every replaced row must still exist, and nothing else may be attached to this baseline id.
  for(const id of record.replacesCanonicalIds)if(!rows.some(r=>r.canonical_id===id))throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
  if(rows.some(r=>!record.replacesCanonicalIds.includes(r.canonical_id)||r.ticker!==record.ticker||canonical.get(r.canonical_id)?.size!==1))throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  const g=record.historyGuard;
  if(!Array.isArray(doc.points)||hash(doc.points.filter(p=>p[0]>=g.checkedFrom&&p[0]<=g.checkedTo))!==g.pointsSha256)throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf)||!Number.isFinite(Date.parse(doc.asOf+'T00:00:00Z')))throw Error('INVALID_SOURCE_METADATA');
  const age=coverAgeDays(doc.asOf,record.lastConfirmedCover.filingDate);
  if(age>IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS)throw Error('IDENTITY_EVIDENCE_EXPIRED:'+age);
  const points=doc.points.filter(p=>p[0]>=record.validFrom&&(record.validTo===null||p[0]<=record.validTo));
  if(!points.length)throw Error('INSUFFICIENT_HISTORY');
  const identity={canonical_id:record.canonicalId,baseline_security_id:securityId,ticker:record.ticker,currency:record.currency,provider:record.provider,start_date:record.validFrom,
    active_status:'ACTIVE',eligible_us_equity:true,instrument_type:'EQUITY_COMMON',source_provenance:IDENTITY_EVIDENCE_SCHEMA+':'+record.cik};
  const r=validate({...doc,points,from:points[0][0],to:points.at(-1)[0]},identity);
  return {...r,warnings:r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING','SERIES_RESTRICTED_TO_SOURCED_INTERVAL']),
    identityEvidenceBinding:{schemaVersion:IDENTITY_EVIDENCE_SCHEMA,registryHash,securityId,cik:record.cik,issuer:record.issuer,canonicalId:record.canonicalId,replacesCanonicalIds:record.replacesCanonicalIds.slice(),
      mic:record.mic,instrumentClass:record.instrumentClass,evidenceLevel:record.evidenceLevel,validFrom:record.validFrom,validTo:record.validTo,seriesFrom:points[0][0],seriesTo:points.at(-1)[0],
      historyGuardSha256:g.pointsSha256,lastConfirmedCover:{...record.lastConfirmedCover},coverAgeDays:age,maxCoverAgeDays:IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS,sources:record.sources.length}};
}
function createLoader(root,options) {
  const opts=loaderOptions(options), evidence=opts.identityEvidence?identityEvidenceBindings(opts):null;
  const masterBytes=fs.readFileSync(path.join(root,'quant/data/market/security-master/us-security-master.json'),'utf8');
  const master=JSON.parse(masterBytes), byId=new Map(), canonical=new Map();
  for(const row of master.rows){
    const key=row.baseline_security_id;
    if(key){if(!byId.has(key))byId.set(key,[]);byId.get(key).push(row);}
    if(row.canonical_id && key){if(!canonical.has(row.canonical_id))canonical.set(row.canonical_id,new Set());canonical.get(row.canonical_id).add(key);}
  }
  const loader=(securityId,suppliedBytes)=>{
    if(!/^ref_[A-Za-z0-9_.-]+$/.test(securityId)) throw Error('INVALID_SECURITY_ID');
    const rel='quant/data/market/discover-series-long/'+securityId+'.json';
    const bytes=suppliedBytes===undefined?fs.readFileSync(path.join(root,rel),'utf8'):suppliedBytes;
    const rows=byId.get(securityId)||[];
    const record=evidence?.bindings.get(securityId);
    if(record)return {...loadBound(record,securityId,JSON.parse(bytes),rows,canonical,evidence.registryHash),sourcePath:rel,sourceBytesHash:hash(bytes),masterVersion:master.version,masterGeneratedAt:master.generatedAt};
    if(rows.length!==1 || canonical.get(rows[0].canonical_id)?.size!==1) throw Error('AMBIGUOUS_LISTING_IDENTITY');
    return {...validate(JSON.parse(bytes),rows[0]),sourcePath:rel,sourceBytesHash:hash(bytes),masterVersion:master.version,masterGeneratedAt:master.generatedAt};
  };
  loader.masterHash=hash(masterBytes);
  if(evidence)loader.identityEvidence=Object.freeze({schemaVersion:IDENTITY_EVIDENCE_SCHEMA,registryHash:evidence.registryHash,boundSecurityIds:Object.freeze([...evidence.bindings.keys()].sort()),allowCoverPageOnly:!!opts.identityEvidenceAllowCoverPageOnly});
  return loader;
}
function load(root,securityId) { return createLoader(root)(securityId); }
module.exports={load,createLoader,validate,hash,calculationRuntime,classificationConflict,validateIdentityEvidenceRegistry,LOADER_OPTIONS,IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS};
