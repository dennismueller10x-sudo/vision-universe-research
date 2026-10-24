/* Offline real-series adapter. No provider requests or synthetic fallback. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
function monday(date) { const d = new Date(date+'T00:00:00Z'); const n=d.getUTCDay(); d.setUTCDate(d.getUTCDate()-(n+6)%7); return +d; }
function validate(doc, identity) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf) || !Number.isFinite(Date.parse(doc.asOf)) || doc.instrumentId !== doc.ticker) throw Error('INVALID_SOURCE_METADATA');
  if (doc.dataMode !== 'real' || doc.priceSeriesType !== 'SPLIT_ADJUSTED' || doc.grain !== 'weekly') throw Error('REAL_WEEKLY_PRICE_REQUIRED');
  if (!identity || !identity.canonical_id || identity.baseline_security_id !== doc.securityId || identity.ticker !== doc.ticker || identity.currency !== doc.currency || identity.provider !== doc.provider || doc.from < identity.start_date) throw Error('LISTING_IDENTITY_MISMATCH');
  if (identity.active_status !== 'ACTIVE') throw Error('INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED');
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
  return { dataMode:'real',sourceSchemaVersion:doc.schemaVersion,calendar:'OBSERVED_ISO_WEEKS',publishBasis:doc.publishBasis||null,listingId:identity.canonical_id, securityId:doc.securityId, ticker:doc.ticker, currency:doc.currency, provider:doc.provider, listingStart:identity.start_date, identityEvidence:identity.source_provenance, identityHash:hash(identity), sourceHash:hash(doc), asOf:doc.asOf, returnBasis:'PRICE_RETURN', adjustment:'SPLIT_ADJUSTED', points:doc.points, corporateActions:doc.corporateActions || null, warnings:['EX_POST_ADJUSTED_HISTORY_NOT_AS_PUBLISHED_PIT','DIVIDENDS_EXCLUDED','SPLIT_ADJUSTMENT_PROVIDER_EVIDENCE_ONLY_NO_RAW_RECONSTRUCTION','FRACTIONAL_SPLIT_ADJUSTED_UNITS','SINGLE_LISTING_SELECTION_NO_MARKET_WIDE_EDGE','WEEKLY_CALENDAR_FROM_OBSERVED_BARS_NOT_INTRADAY_SESSION_PROOF'] };
}
function load(root,securityId) {
  if(!/^ref_[A-Za-z0-9_.-]+$/.test(securityId)) throw Error('INVALID_SECURITY_ID');
  const rel='quant/data/market/discover-series-long/'+securityId+'.json';
  const bytes=fs.readFileSync(path.join(root,rel),'utf8');
  const master=JSON.parse(fs.readFileSync(path.join(root,'quant/data/market/security-master/us-security-master.json'),'utf8'));
  const rows=master.rows.filter(r=>r.baseline_security_id===securityId);
  if(rows.length!==1) throw Error('AMBIGUOUS_LISTING_IDENTITY');
  return {...validate(JSON.parse(bytes),rows[0]),sourcePath:rel,sourceBytesHash:hash(bytes),masterVersion:master.version,masterGeneratedAt:master.generatedAt};
}
module.exports={load,validate,hash};
