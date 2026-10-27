'use strict';
// Research-only evidence contracts. These do not alter the active certification engine.
const crypto = require('node:crypto');
const fs = require('node:fs');
const VERSION = 'quant-research-contract-1.0.0';
const AREAS = Object.freeze(['SAME_STOCK_REPLAY','PATTERN_EVIDENCE','SIGNAL_BACKTEST','SETUP_BACKTEST','STRATEGY_BACKTEST','FACTOR_RANKING_BACKTEST','MONTE_CARLO','WALK_FORWARD','OUT_OF_SAMPLE','MARKET_REGIME','PARAMETER_SENSITIVITY','EVENT_DRIVEN','PORTFOLIO_REBALANCING']);
const AXES = Object.freeze(['IMPLEMENTATION_COMPLETE','DATA_ELIGIBLE','METHOD_VALIDATED','INDEPENDENT_EVIDENCE','ECONOMIC_ADVANTAGE','PRODUCTION_APPROVED']);
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw Error('NON_FINITE_NUMBER'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  throw Error('NON_JSON_VALUE');
}
function hash(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function shaFile(path) { return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'); }
function runtime() { return {node:process.version,v8:process.versions.v8,platform:process.platform,arch:process.arch,glibc:process.report?.getReport().header.glibcVersionRuntime || null,binarySha256:shaFile(process.execPath)}; }
function timestamp(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value.replace(/(?<!\.\d{3})Z$/,'.000Z')) throw Error('INVALID_UTC_TIMESTAMP'); return Date.parse(value); }
function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function validateManifest(m) {
  const errors=[], unknown=[];
  if (!m || m.schemaVersion!=='research-dataset-1.0.0') return {contractValid:false,errors:['UNKNOWN_DATASET_SCHEMA'],unknown:['POPULATION_NOT_AUDITED'],dataEligible:false};
  if (!['AS_PUBLISHED_PIT','PIT_RECONSTRUCTION','HISTORICAL_SIMULATION','SYNTHETIC_TEST'].includes(m.mode)) errors.push('UNKNOWN_DATA_MODE');
  let asOf; try { asOf=timestamp(m.asOf); } catch { errors.push('INVALID_AS_OF'); }
  if (!['PRICE_RETURN','TOTAL_RETURN','RAW_PRICE_WITH_ACTIONS'].includes(m.returnBasis)) errors.push('UNKNOWN_RETURN_BASIS');
  if (!m.population || m.population.definition!=='US_PRIMARY_COMMON_NYSE_NASDAQ_AMERICAN' || !validHash(m.population.sourceHash)) errors.push('POPULATION_DEFINITION_OR_SOURCE_MISSING');
  const ids=new Map();
  if (!Array.isArray(m.listings) || !m.listings.length) errors.push('NO_LISTINGS');
  for (const l of m.listings||[]) {
    if (!l.listingId || !l.issuerId || ids.has(l.listingId)) errors.push('MISSING_OR_DUPLICATE_IDENTITY');
    ids.set(l.listingId,l);
    if (!validHash(l.sourceHash)) errors.push('IDENTITY_SOURCE_MISSING:'+l.listingId);
    if (!Array.isArray(l.classifications)||!l.classifications.length) errors.push('HISTORICAL_CLASSIFICATION_MISSING:'+l.listingId);
    let end=-Infinity;
    for (const c of l.classifications||[]) {
      try {
        const from=timestamp(c.effectiveFrom), to=c.effectiveTo===null?Infinity:timestamp(c.effectiveTo), available=timestamp(c.availableAt);
        if (from>=to||from<end) errors.push('CLASSIFICATION_INTERVAL_INVALID:'+l.listingId);
        end=to;
        if (!['XNYS','XNAS','XASE'].includes(c.mic)||c.instrumentClass!=='COMMON_STOCK'||c.primary!==true) errors.push('INELIGIBLE_CLASSIFICATION:'+l.listingId);
        if (available>from && m.mode==='AS_PUBLISHED_PIT') errors.push('CLASSIFICATION_NOT_KNOWN_AT_EFFECTIVE_TIME:'+l.listingId);
        if (!validHash(c.sourceHash)) errors.push('CLASSIFICATION_SOURCE_MISSING:'+l.listingId);
      } catch { errors.push('CLASSIFICATION_TIMESTAMP_INVALID:'+l.listingId); }
    }
  }
  if (!Array.isArray(m.observations)||!m.observations.length) errors.push('NO_OBSERVATIONS');
  const seen=new Set();
  for (const o of m.observations||[]) {
    const l=ids.get(o.listingId); if (!l) { errors.push('UNKNOWN_LISTING:'+o.listingId); continue; }
    try {
      const effective=timestamp(o.effectiveAt), available=timestamp(o.availableAt), decision=timestamp(o.decisionAt);
      if (effective>decision||available>decision||decision>asOf) errors.push('OBSERVATION_NOT_AVAILABLE_AT_DECISION:'+o.listingId);
      if (!(l.classifications||[]).some(c=>timestamp(c.effectiveFrom)<=decision&&(c.effectiveTo===null||timestamp(c.effectiveTo)>decision)&&timestamp(c.availableAt)<=decision)) errors.push('NO_ELIGIBLE_CLASSIFICATION_AT_DECISION:'+o.listingId);
      const key=[o.listingId,o.field,o.effectiveAt,o.vintage].join('|'); if(seen.has(key)) errors.push('DUPLICATE_OBSERVATION'); seen.add(key);
      if (!o.field||!o.vintage||!validHash(o.sourceHash)||typeof o.value!=='number'||!Number.isFinite(o.value)) errors.push('INVALID_OBSERVATION_VALUE_OR_PROVENANCE');
    } catch {errors.push('OBSERVATION_TIMESTAMP_INVALID');}
  }
  // A manifest validates submitted records, never completeness of the missing population.
  unknown.push('POPULATION_COMPLETENESS_REQUIRES_EXTERNAL_AUDIT','CORPORATE_ACTION_AND_TERMINAL_COVERAGE_REQUIRES_AUDIT','LICENSE_SCOPE_REQUIRES_SOURCE_REVIEW');
  if (m.mode!=='AS_PUBLISHED_PIT') unknown.push('NOT_AN_AS_PUBLISHED_ARCHIVE');
  return {contractValid:errors.length===0,errors:[...new Set(errors)].sort(),unknown,dataEligible:false,inputHash:hash(m),scope:'SUBMITTED_RECORD_CONTRACT_ONLY'};
}
function assessment(area, checks, scope) {
  if (!AREAS.includes(area)||!Array.isArray(checks)||typeof scope!=='string'||!scope) throw Error('INVALID_ASSESSMENT');
  const evidence=checks.map(c=>{
    if (!c.id||!AXES.includes(c.axis)||!['PASS','FAIL','UNKNOWN','NOT_APPLICABLE'].includes(c.state)||!c.reason) throw Error('INVALID_EVIDENCE_CHECK');
    if (c.state==='PASS'&&(!validHash(c.artifactHash)||!c.artifact)) throw Error('PASS_WITHOUT_HASHED_EVIDENCE');
    return {...c};
  });
  const axes={};
  for(const axis of AXES) {
    const items=evidence.filter(c=>c.axis===axis);
    axes[axis]=axis==='PRODUCTION_APPROVED'?'NOT_APPROVED':!items.length?'UNKNOWN':items.some(c=>c.state==='FAIL')?'FAIL':items.some(c=>c.state==='UNKNOWN')?'UNKNOWN':items.every(c=>c.state==='NOT_APPLICABLE')?'NOT_APPLICABLE':items.some(c=>c.state==='NOT_APPLICABLE')?'UNKNOWN':'PASS';
  }
  const payload={schemaVersion:VERSION,area,scope,axes,checks:evidence,certification:'NOT_CERTIFIED',productionApproved:false,interpretation:'EVIDENCE_ASSESSMENT_DOES_NOT_OVERRIDE_ACTIVE_GATES'};
  return {...payload,resultHash:hash(payload)};
}
function envelope(area,input,result) {
  if(!AREAS.includes(area)) throw Error('UNKNOWN_RESEARCH_AREA');
  const payload={schemaVersion:VERSION,area,inputHash:hash(input),calculationRuntime:runtime(),codeHash:shaFile(__filename),result,certification:'NOT_CERTIFIED',productionApproved:false};
  return {...payload,resultHash:hash(payload)};
}
module.exports={VERSION,AREAS,AXES,canonical,hash,shaFile,runtime,timestamp,validateManifest,assessment,envelope};
