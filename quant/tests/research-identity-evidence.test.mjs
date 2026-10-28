import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),A=require('../engines/weekly-real-adapter.cjs'),R=require('../engines/research-weekly-loader.cjs');
import {createHash} from 'node:crypto';
// sha256 of quant/engines/weekly-real-adapter.cjs on main 07dfe5dd55: the research option must not touch the adapter.
const MAIN_ADAPTER_SHA256='15c468a5b403c7c0e9c57241d9464c9383dd11aa145f8a51d482f1b63f8e176a';
const Registry=require('../engines/research-identity-evidence.cjs');
const root=resolve(import.meta.dirname,'../..');
const FIVE=['ref_BGC','ref_COHR','ref_DCOM','ref_SGI','ref_TRAK'],PRICE_BACKED=['ref_BGC','ref_COHR','ref_DCOM','ref_SGI'];
// Would qualify under the V9 proposal's 132 ambiguous-id bindings, which the owner did NOT approve.
const UNBOUND_AMBIGUOUS=['ref_ACI','ref_ADT'];
const SAMPLE=[...FIVE,...UNBOUND_AMBIGUOUS,'ref_NVDA','ref_MSFT','ref_JPM','ref_FRMEP'];
const seriesBytes=id=>readFileSync(join(root,'quant/data/market/discover-series-long',id+'.json'),'utf8');
const outcome=(fn)=>{try{return {ok:true,value:JSON.stringify(fn())};}catch(e){return {ok:false,value:e.message};}};
const record=id=>Registry.records.find(r=>r.securityId===id);

test('registry holds exactly the five owner-approved V9 dossier bindings and passes schema validation',()=>{
 assert.equal(Registry.schemaVersion,'research-identity-evidence-1.0.0');
 assert.deepEqual(Registry.records.map(r=>r.securityId).sort(),FIVE);
 assert.equal(R.validateIdentityEvidenceRegistry(Registry),Registry);
 for(const r of Registry.records){
  assert.equal(r.evidenceLevel,r.securityId==='ref_TRAK'?'COVER_PAGE_ONLY':'SEC_SAME_DAY_PRICE_AND_COVER');
  assert.equal(r.historyGuard.checkedFrom,r.validFrom);assert.equal(r.validTo,null);assert.equal(r.activeStatus,'ACTIVE_SEC_CONFIRMED');
  assert.ok(r.canonicalId.startsWith('v9-sec-binding:'+r.cik+':'+r.ticker+':'+r.validFrom));
 }
 const broken=[
  r=>{r.schemaVersion='research-identity-evidence-0.9.0';},
  r=>{r.records=[];},
  r=>{r.records.push(structuredClone(r.records[0]));},
  r=>{r.records[0].evidenceLevel='TRUST_ME';},
  r=>{r.records[0].sources=[];},
  r=>{delete r.records[0].sources[0].sha256;},
  r=>{r.records[0].sources[0].accession='unknown';},
  r=>{r.records[0].lastConfirmedCover.sha256='0'.repeat(64);},
  r=>{r.records[0].historyGuard.checkedFrom='1990-01-05';},
  r=>{r.records[0].validTo='2000-01-01';},
  r=>{r.records[0].instrumentClass='PREFERRED_STOCK';},
  r=>{r.records[0].replacesCanonicalIds=[];},
  r=>{r.records[0].priceEvidence=[];},
  r=>{r.records[4].priceEvidence=structuredClone(r.records[0].priceEvidence);}
 ];
 for(const mutate of broken){const copy=structuredClone(Registry);mutate(copy);assert.throws(()=>R.validateIdentityEvidenceRegistry(copy),/^Error: INVALID_RESEARCH_IDENTITY_EVIDENCE/);}
});

test('every registry record is backed by SEC accession + sha256 sources incl. its last confirmed cover',()=>{
 for(const r of Registry.records){
  assert.ok(r.sources.length>=5,r.securityId);
  for(const s of r.sources){assert.match(s.accession,/^\d{10}-\d{2}-\d{6}$/);assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.match(s.url,/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);assert.ok(s.claim.length>10);}
  assert.ok(r.sources.some(s=>s.role==='IXBRL_COVER_LATEST'&&s.accession===r.lastConfirmedCover.accession&&s.sha256===r.lastConfirmedCover.sha256),r.securityId);
  for(const p of r.priceEvidence){assert.match(p.accession,/^\d{10}-\d{2}-\d{6}$/);assert.match(p.sha256,/^[a-f0-9]{64}$/);}
 }
});

test('default off: createResearchLoader(root) delegates to the unchanged single-row loader, byte-identical for a sample incl. the five',()=>{
 const master=JSON.parse(readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'),'utf8'));
 const rowsOf=id=>master.rows.filter(r=>r.baseline_security_id===id);
 const shared=id=>new Set(master.rows.filter(r=>r.canonical_id===rowsOf(id)[0]?.canonical_id&&r.baseline_security_id).map(r=>r.baseline_security_id)).size;
 // Reference: the pre-change loader semantics, rebuilt from the exported validate().
 const reference=id=>{const bytes=seriesBytes(id),rows=rowsOf(id);if(rows.length!==1||shared(id)!==1)throw Error('AMBIGUOUS_LISTING_IDENTITY');
  return {...A.validate(JSON.parse(bytes),rows[0]),sourcePath:'quant/data/market/discover-series-long/'+id+'.json',sourceBytesHash:A.hash(bytes),masterVersion:master.version,masterGeneratedAt:master.generatedAt};};
 const loaders=[A.createLoader(root),R.createResearchLoader(root),R.createResearchLoader(root,undefined),R.createResearchLoader(root,{}),R.createResearchLoader(root,{identityEvidence:false})];
 for(const L of loaders)assert.equal(L.identityEvidence,undefined);
 for(const id of SAMPLE){
  const want=outcome(()=>reference(id));
  for(const L of loaders)assert.deepEqual(outcome(()=>L(id)),want,id);
  assert.deepEqual(outcome(()=>A.load(root,id)),want,id);
 }
 for(const id of FIVE)assert.equal(outcome(()=>A.createLoader(root)(id)).ok,false,id);
 // The registry module is not even loaded on the default path.
 const loaded=execFileSync(process.execPath,['-e',"const R=require('./quant/engines/research-weekly-loader.cjs');const L=R.createResearchLoader('.');try{L('ref_COHR')}catch{};process.stdout.write(String(Object.keys(require.cache).some(k=>k.endsWith('research-identity-evidence.cjs'))))"],{cwd:root,encoding:'utf8'});
 assert.equal(loaded,'false');
});

test('loader options fail closed on unknown keys, non-boolean values and a dangling cover-page flag',()=>{
 for(const bad of [{identityEvidance:true},{identityEvidence:'yes'},{identityEvidence:1},{identityEvidenceAllowCoverPageOnly:true},[],null,'identityEvidence',new (class X{})()])
  assert.throws(()=>R.createResearchLoader(root,bad),/^Error: INVALID_LOADER_OPTIONS/);
 assert.deepEqual([...R.LOADER_OPTIONS],['identityEvidence','identityEvidenceAllowCoverPageOnly','corporateActionEvidence']);
});

test('opt-in qualifies the four price-backed bindings on their sourced interval; TRAK needs the extra cover-page flag',()=>{
 const L=R.createResearchLoader(root,{identityEvidence:true}),LC=R.createResearchLoader(root,{identityEvidence:true,identityEvidenceAllowCoverPageOnly:true});
 assert.deepEqual(L.identityEvidence.boundSecurityIds,PRICE_BACKED);assert.deepEqual(LC.identityEvidence.boundSecurityIds,FIVE);
 for(const id of FIVE){
  const rec=record(id),def=outcome(()=>A.createLoader(root)(id));
  if(id==='ref_TRAK')assert.deepEqual(outcome(()=>L(id)),def);
  for(const loader of id==='ref_TRAK'?[LC]:[L,LC]){
   const r=loader(id);
   assert.equal(r.listingId,rec.canonicalId);assert.equal(r.listingStart,rec.validFrom);assert.equal(r.points[0][0],rec.validFrom);
   assert.ok(r.points.every(p=>p[0]>=rec.validFrom));assert.ok(r.points.length>=55);
   const g=rec.historyGuard;assert.equal(A.hash(r.points.filter(p=>p[0]<=g.checkedTo)),g.pointsSha256);
   assert.deepEqual(r.warnings.slice(-2),['SOURCE_RESOLVED_IDENTITY_BINDING','SERIES_RESTRICTED_TO_SOURCED_INTERVAL']);
   assert.ok(r.warnings.includes('EX_POST_ADJUSTED_HISTORY_NOT_AS_PUBLISHED_PIT'));
   const b=r.identityEvidenceBinding;assert.equal(b.cik,rec.cik);assert.equal(b.evidenceLevel,rec.evidenceLevel);assert.deepEqual(b.lastConfirmedCover,rec.lastConfirmedCover);
   assert.equal(b.sources,rec.sources.length);assert.ok(b.coverAgeDays<=400);assert.equal(b.registryHash,A.hash(Registry));
   assert.equal(r.identityEvidence,'research-identity-evidence-1.0.0:'+rec.cik);assert.equal(r.sourceBytesHash,A.hash(seriesBytes(id)));
  }
 }
 // Non-bound ids are untouched by the opt-in, including ambiguous ids the V9 proposal would have bound.
 for(const id of UNBOUND_AMBIGUOUS){assert.throws(()=>L(id),/^Error: AMBIGUOUS_LISTING_IDENTITY$/);assert.throws(()=>LC(id),/^Error: AMBIGUOUS_LISTING_IDENTITY$/);}
 for(const id of ['ref_NVDA','ref_FRMEP'])assert.deepEqual(outcome(()=>LC(id)),outcome(()=>A.createLoader(root)(id)));
});

test('opt-in fails closed: tampered history guard, expired cover, foreign ticker',()=>{
 const L=R.createResearchLoader(root,{identityEvidence:true,identityEvidenceAllowCoverPageOnly:true});
 for(const id of FIVE){
  const doc=JSON.parse(seriesBytes(id)),rec=record(id);
  const i=doc.points.findIndex(p=>p[0]>=rec.historyGuard.checkedFrom);
  const tampered=structuredClone(doc);tampered.points[i+3][1]=+(tampered.points[i+3][1]*1.01).toFixed(4);
  assert.throws(()=>L(id,JSON.stringify(tampered)),/^Error: IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH$/,id);
  const dropped=structuredClone(doc);dropped.points.splice(i+1,1);
  assert.throws(()=>L(id,JSON.stringify(dropped)),/^Error: IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH$/,id);
  // asOf more than 400 days after the last confirmed cover filing.
  const late=new Date(Date.parse(rec.lastConfirmedCover.filingDate+'T00:00:00Z')+401*86400000).toISOString().slice(0,10);
  assert.throws(()=>L(id,JSON.stringify({...doc,asOf:late})),/^Error: IDENTITY_EVIDENCE_EXPIRED:401$/,id);
  const edge=new Date(Date.parse(rec.lastConfirmedCover.filingDate+'T00:00:00Z')+400*86400000).toISOString().slice(0,10);
  assert.throws(()=>L(id,JSON.stringify({...doc,asOf:edge})),e=>!/IDENTITY_EVIDENCE_EXPIRED/.test(e.message),id);
  assert.throws(()=>L(id,JSON.stringify({...doc,ticker:'XXXX',instrumentId:'XXXX'})),/^Error: LISTING_IDENTITY_MISMATCH$/,id);
 }
});

test('opt-in fails closed when the replaced master row is missing or the master row set changed',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'identity-evidence-master-'));
 try{
  const masterPath='quant/data/market/security-master/us-security-master.json',master=JSON.parse(readFileSync(join(root,masterPath),'utf8'));
  const write=rows=>{mkdirSync(join(tmp,'quant/data/market/security-master'),{recursive:true});writeFileSync(join(tmp,masterPath),JSON.stringify({...master,rows}));};
  const rec=record('ref_COHR'),bytes=seriesBytes('ref_COHR');
  write(master.rows.filter(r=>!rec.replacesCanonicalIds.includes(r.canonical_id)));
  assert.throws(()=>R.createResearchLoader(tmp,{identityEvidence:true})('ref_COHR',bytes),/^Error: IDENTITY_EVIDENCE_MASTER_ROW_MISSING$/);
  const extra={...master.rows.find(r=>r.canonical_id===rec.replacesCanonicalIds[0]),canonical_id:'tiingo:NYSE:COHR:2022-09-08',active_status:'ACTIVE'};
  write(master.rows.concat([extra]));
  assert.throws(()=>R.createResearchLoader(tmp,{identityEvidence:true})('ref_COHR',bytes),/^Error: IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED$/);
  // Default path on the same modified master keeps its own (unchanged) rule.
  assert.throws(()=>A.createLoader(tmp)('ref_COHR',bytes),/^Error: AMBIGUOUS_LISTING_IDENTITY$/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('the productive adapter is byte-identical to main and no productive caller imports the research loader',()=>{
 const adapter=readFileSync(join(root,'quant/engines/weekly-real-adapter.cjs'));
 assert.equal(createHash('sha256').update(adapter).digest('hex'),MAIN_ADAPTER_SHA256);
 assert.doesNotMatch(adapter.toString(),/research-identity-evidence|research-weekly-loader/);
 const productive=[...readdirSync(join(root,'server')).filter(f=>/\.(c?js|mjs)$/.test(f)).map(f=>join('server',f)),
  ...readdirSync(join(root,'scripts/quant')).filter(f=>/\.(c?js|mjs)$/.test(f)).map(f=>join('scripts/quant',f)),
  ...readdirSync(join(root,'quant/engines')).filter(f=>/\.(c?js|mjs)$/.test(f)&&f!=='research-weekly-loader.cjs'&&f!=='research-identity-evidence.cjs').map(f=>join('quant/engines',f)),
  ...readdirSync(join(root,'quant/api')).filter(f=>/\.(c?js|mjs)$/.test(f)).map(f=>join('quant/api',f))];
 assert.ok(productive.length>50);
 for(const f of productive)assert.doesNotMatch(readFileSync(join(root,f),'utf8'),/research-weekly-loader|research-identity-evidence/,f);
});
