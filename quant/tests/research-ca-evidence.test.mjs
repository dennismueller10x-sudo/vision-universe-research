import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const A=require('../engines/weekly-real-adapter.cjs'),R=require('../engines/research-weekly-loader.cjs'),CA=require('../engines/corporate-action-evidence.js');
const Registry=require('../engines/research-ca-evidence.cjs');
const root=resolve(import.meta.dirname,'../..');
// sha256 on main 07dfe5dd55: the research option must not touch the productive adapter or the CA evidence engine.
const MAIN_ADAPTER_SHA256='15c468a5b403c7c0e9c57241d9464c9383dd11aa145f8a51d482f1b63f8e176a';
const MAIN_CA_EVIDENCE_SHA256='6c17d2c9d77b126b9d88608005c26dcac53c60fbefd677c2c225092a3893d09d';
// The registry names its own registered protocol (V9 follow-up 1.0.0, since V10 the superset 1.1.x); its sidecar .sha256 is the registered hash.
const PROTOCOL_SHA256=readFileSync(join(root,Registry.protocol.replace(/\.json$/,'.sha256')),'utf8').split(/\s+/)[0];
const sha=b=>createHash('sha256').update(b).digest('hex');
const seriesBytes=id=>readFileSync(join(root,'quant/data/market/discover-series-long',id+'.json'),'utf8');
const outcome=fn=>{try{return {ok:true,value:JSON.stringify(fn())};}catch(e){return {ok:false,value:e.message};}};
const IDS=[...new Set(Registry.records.map(r=>r.securityId))].sort();
const CA_ON={identityEvidence:true,corporateActionEvidence:true};

test('registry schema: protocol-bound records with SEC sources pass; every broken variant fails closed',()=>{
 assert.equal(Registry.schemaVersion,'research-ca-evidence-1.0.0');
 assert.equal(Registry.protocolSha256,PROTOCOL_SHA256);
 assert.equal(sha(readFileSync(join(root,Registry.protocol))),PROTOCOL_SHA256);
 assert.equal(sha(readFileSync(join(root,'docs/quant-recovery/v9-followups/ca-registry/protocol.json'))),'db7e31a8fd9a34c1f50d2b3dea968a978eaf51e6cbb2826be1827b6d3c7171c2');
 assert.equal(R.validateCaEvidenceRegistry(Registry),Registry);
 assert.ok(Registry.records.length>=1);
 for(const r of Registry.records){
  assert.ok(['GENUINE_MOVE','SPINOFF_DISTRIBUTION'].includes(r.class),r.securityId);
  assert.equal(r.returnBasis,r.class==='SPINOFF_DISTRIBUTION'?'PRICE_RETURN_ONLY':'PRICE_RETURN');
  assert.ok(CA.splitSized(r.weeklyRatio));
  for(const s of r.sources){assert.match(s.accession,/^\d{10}-\d{2}-\d{6}$/);assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.match(s.url,/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);}
  assert.ok(r.sources.some(s=>s.role==='COVER_BEFORE')&&r.sources.some(s=>s.role==='COVER_AFTER'));
 }
 const broken=[
  r=>{r.schemaVersion='research-ca-evidence-0.9.0';},
  r=>{r.protocolSha256='0'.repeat(63);},
  r=>{r.records.push(structuredClone(r.records[0]));},
  r=>{r.records[0].class='NEGATIVE_EVIDENCE_ONLY';},
  r=>{r.records[0].class='SPLIT_UNADJUSTED';},
  r=>{r.records[0].returnBasis=r.records[0].returnBasis==='PRICE_RETURN'?'PRICE_RETURN_ONLY':'PRICE_RETURN';},
  r=>{r.records[0].weeklyRatio*=1.001;},
  r=>{r.records[0].weeklyRatio=1.5;r.records[0].close=r.records[0].prevClose*1.5;},
  r=>{r.records[0].prevWeek=r.records[0].week;},
  r=>{r.records[0].shareContinuity.ratio=0.5;r.records[0].shareContinuity.after.shares=r.records[0].shareContinuity.before.shares*0.5;},
  r=>{r.records[0].shareContinuity.after.coverDate='1999-01-01';},
  r=>{r.records[0].identity.after.tradingSymbol='XXXX';},
  r=>{r.records[0].sources=r.records[0].sources.filter(s=>s.role!=='AFFIRMATIVE_8K'&&s.role!=='SPINOFF_8K');},
  r=>{r.records[0].sources[0].sha256='nope';},
  r=>{r.records[0].sources[0].url='https://example.com/x';},
  r=>{r.records[0].protocolSha256='f'.repeat(64);},
  r=>{r.records[0].ticker='OTHER';}
 ];
 for(const mutate of broken){const copy=structuredClone(Registry);mutate(copy);assert.throws(()=>R.validateCaEvidenceRegistry(copy),/^Error: INVALID_RESEARCH_CA_EVIDENCE/);}
});

test('opt-in only: default, identity-only and unknown options leave every registry id unresolved and never load the registry',()=>{
 assert.deepEqual([...R.LOADER_OPTIONS],['identityEvidence','identityEvidenceAllowCoverPageOnly','corporateActionEvidence','identityEvidenceProtocolV10','listingLifecycleEvidence']);
 for(const bad of [{corporateActionEvidance:true},{corporateActionEvidence:'yes'},{corporateActionEvidence:1}])assert.throws(()=>R.createResearchLoader(root,bad),/^Error: INVALID_LOADER_OPTIONS/);
 const base=A.createLoader(root);
 for(const L of [R.createResearchLoader(root),R.createResearchLoader(root,{corporateActionEvidence:false}),R.createResearchLoader(root,{identityEvidence:true})]){
  assert.equal(L.corporateActionEvidence,undefined);
  for(const id of IDS){const o=outcome(()=>L(id));assert.deepEqual(o,outcome(()=>base(id)),id);assert.match(o.value,/^CORPORATE_ACTION_UNRESOLVED:/,id);}
 }
 const loaded=execFileSync(process.execPath,['-e',"const R=require('./quant/engines/research-weekly-loader.cjs');for(const o of [undefined,{identityEvidence:true}]){const L=R.createResearchLoader('.',o);try{L('"+IDS[0]+"')}catch{}};process.stdout.write(String(Object.keys(require.cache).some(k=>k.endsWith('research-ca-evidence.cjs'))))"],{cwd:root,encoding:'utf8'});
 assert.equal(loaded,'false');
});

test('opt-in resolves exactly the registry events, keeps validate() output otherwise and flags spin-offs PRICE_RETURN_ONLY',()=>{
 for(const opts of [{corporateActionEvidence:true},CA_ON]){
  const L=R.createResearchLoader(root,opts);
  assert.deepEqual(L.corporateActionEvidence.securityIds,IDS);assert.equal(L.corporateActionEvidence.protocolSha256,PROTOCOL_SHA256);
  for(const id of IDS){
   const r=L(id),recs=Registry.records.filter(x=>x.securityId===id);
   assert.equal(r.corporateActionQuality.status,'RESOLVED');
   const verified=r.corporateActionQuality.items.filter(i=>i.status==='RESOLVED_SOURCE_VERIFIED');
   assert.deepEqual(verified.map(i=>i.time),recs.map(x=>x.week));
   assert.ok(r.corporateActionQuality.items.every(i=>i.status==='RESOLVED_SOURCE_VERIFIED'||i.status==='RESOLVED_GENUINE_MOVE'));
   const priceOnly=recs.some(x=>x.class==='SPINOFF_DISTRIBUTION');
   assert.equal(r.returnBasis,priceOnly?'PRICE_RETURN_ONLY':'PRICE_RETURN');
   assert.equal(r.warnings.includes('SPINOFF_DISTRIBUTION_VALUE_NOT_IN_PRICE_SERIES'),priceOnly);
   assert.ok(r.warnings.includes('CORPORATE_ACTION_RESOLVED_BY_RESEARCH_REGISTRY'));
   assert.equal(r.corporateActionEvidenceBinding.registryHash,A.hash(Registry));
   assert.equal(r.sourceBytesHash,A.hash(seriesBytes(id)));assert.deepEqual(r.points,JSON.parse(seriesBytes(id)).points);
   assert.equal(r.listingId,recs[0].canonicalId);
  }
  // ids outside the registry: identical to the loader without the CA option
  const without=R.createResearchLoader(root,{identityEvidence:!!opts.identityEvidence});
  for(const id of ['ref_NVDA','ref_MSFT','ref_COHR','ref_ACET','ref_ABT','ref_ACI'])assert.deepEqual(outcome(()=>L(id)),outcome(()=>without(id)),id);
 }
});

test('mismatch fails closed with the unchanged validate() error',()=>{
 const L=R.createResearchLoader(root,CA_ON);
 for(const id of IDS){
  const doc=JSON.parse(seriesBytes(id)),rec=Registry.records.find(x=>x.securityId===id),i=doc.points.findIndex(p=>p[0]===rec.week);
  const expectErr=d=>assert.throws(()=>L(id,JSON.stringify(d)),/^Error: CORPORATE_ACTION_UNRESOLVED:/,id);
  const closeOff=structuredClone(doc);closeOff.points[i][1]=closeOff.points[i][1]*(1+3e-5);expectErr(closeOff);
  const prevOff=structuredClone(doc);prevOff.points[i-1][1]=prevOff.points[i-1][1]*(1-3e-5);expectErr(prevOff);
  // within tolerance still resolves
  const tiny=structuredClone(doc);tiny.points[i][1]=tiny.points[i][1]*(1+2e-6);assert.equal(L(id,JSON.stringify(tiny)).corporateActionQuality.status,'RESOLVED');
  // an additional, unregistered split-sized week elsewhere keeps the series unresolved
  const extra=structuredClone(doc),j=i>60?10:doc.points.length-10;
  const f=3*extra.points[j-1][1]/extra.points[j][1]; // exact 3:1 jump at week j, history after it rescaled consistently
  for(let k=j;k<doc.points.length;k++)extra.points[k][1]=extra.points[k][1]*f;
  assert.ok(CA.splitSized(extra.points[j][1]/extra.points[j-1][1]));
  assert.throws(()=>L(id,JSON.stringify(extra)),/^Error: CORPORATE_ACTION_UNRESOLVED:/,id);
  // a record for another listing does not apply
  const other=R.createResearchLoader(root,CA_ON);
  assert.throws(()=>other(id,JSON.stringify({...doc,ticker:'ZZZZ',instrumentId:'ZZZZ'})),/^Error: LISTING_IDENTITY_MISMATCH$/);
 }
});

test('validatedResult rebuilds validate() exactly for qualified series (the overlay changes only the CA gate)',()=>{
 const master=JSON.parse(readFileSync(join(root,'quant/data/market/security-master/us-security-master.json'),'utf8'));
 let n=0;
 for(const id of ['ref_NVDA','ref_MSFT','ref_JPM','ref_OSCR','ref_FRMEP','ref_A','ref_AAPL']){
  const rows=master.rows.filter(r=>r.baseline_security_id===id);if(rows.length!==1)continue;
  const doc=JSON.parse(seriesBytes(id));let v;try{v=A.validate(doc,rows[0]);}catch{continue;}
  assert.equal(JSON.stringify(R.validatedResult(doc,rows[0],v.corporateActionQuality)),JSON.stringify(v),id);n++;
 }
 assert.ok(n>=4);
});

test('adapter and CA evidence engine are byte-identical to main; no productive caller imports the research files',()=>{
 assert.equal(sha(readFileSync(join(root,'quant/engines/weekly-real-adapter.cjs'))),MAIN_ADAPTER_SHA256);
 assert.equal(sha(readFileSync(join(root,'quant/engines/corporate-action-evidence.js'))),MAIN_CA_EVIDENCE_SHA256);
 const research=['research-weekly-loader.cjs','research-identity-evidence.cjs','research-ca-evidence.cjs'];
 const productive=[...readdirSync(join(root,'server')).filter(f=>/\.(c?js|mjs)$/.test(f)).map(f=>join('server',f)),
  ...readdirSync(join(root,'scripts/quant')).filter(f=>/\.(c?js|mjs)$/.test(f)).map(f=>join('scripts/quant',f)),
  ...readdirSync(join(root,'quant/engines')).filter(f=>/\.(c?js|mjs)$/.test(f)&&!research.includes(f)).map(f=>join('quant/engines',f)),
  ...readdirSync(join(root,'quant/api')).filter(f=>/\.(c?js|mjs)$/.test(f)).map(f=>join('quant/api',f))];
 assert.ok(productive.length>50);
 for(const f of productive)assert.doesNotMatch(readFileSync(join(root,f),'utf8'),/research-weekly-loader|research-ca-evidence/,f);
});
