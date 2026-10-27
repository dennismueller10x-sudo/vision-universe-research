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
function createLoader(root) {
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
    if(rows.length!==1 || canonical.get(rows[0].canonical_id)?.size!==1) throw Error('AMBIGUOUS_LISTING_IDENTITY');
    return {...validate(JSON.parse(bytes),rows[0]),sourcePath:rel,sourceBytesHash:hash(bytes),masterVersion:master.version,masterGeneratedAt:master.generatedAt};
  };
  loader.masterHash=hash(masterBytes);
  return loader;
}
function load(root,securityId) { return createLoader(root)(securityId); }
module.exports={load,createLoader,validate,hash,calculationRuntime,classificationConflict};
