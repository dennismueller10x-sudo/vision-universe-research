import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const A=require('../engines/weekly-real-adapter.cjs'),R=require('../engines/research-weekly-loader.cjs');
const Identity=require('../engines/research-identity-evidence.cjs'),Lifecycle=require('../engines/research-listing-lifecycle.cjs');
const root=resolve(import.meta.dirname,'../..');
const EV=p=>JSON.parse(readFileSync(join(root,'docs/quant-recovery/v10/population',p),'utf8'));
const seriesBytes=id=>readFileSync(join(root,'quant/data/market/discover-series-long',id+'.json'),'utf8');
const outcome=fn=>{try{return {ok:true,value:JSON.stringify(fn())};}catch(e){return {ok:false,value:e.message};}};
const sha=x=>createHash('sha256').update(x).digest('hex');
const FIVE=['ref_BGC','ref_COHR','ref_DCOM','ref_SGI','ref_TRAK'];
// sha256(JSON.stringify(registry without the v10 extension)) on main a1a0dd972a: the five owner-approved 1.0.0 records stay byte-identical.
const BASE_REGISTRY_SHA256='b471d52e7a903eb53048a4842db933ccc19f3f8802e705aabd963ad01bfd08b9';
const V10=Identity.v10.records,LC=Lifecycle.records;
const FRAME={identityEvidence:true,identityEvidenceProtocolV10:true,corporateActionEvidence:true,listingLifecycleEvidence:true};
const frozenRun=pts=>{let n=1;for(let i=pts.length-2;i>=0&&pts[i][1]===pts.at(-1)[1];i--)n++;return n;};

test('reference cases: the five V9 dossier records are byte-identical and keep their 1.0.0 semantics',()=>{
 const {v10,...base}=Identity;
 assert.equal(sha(JSON.stringify(base)),BASE_REGISTRY_SHA256);
 assert.deepEqual(Identity.records.map(r=>r.securityId).sort(),FIVE);
 assert.equal(R.validateIdentityEvidenceRegistry(Identity),Identity);
 const L=R.createResearchLoader(root,{identityEvidence:true}),LV=R.createResearchLoader(root,{identityEvidence:true,identityEvidenceProtocolV10:true});
 for(const id of ['ref_BGC','ref_COHR','ref_DCOM','ref_SGI']){
  const a=L(id),b=LV(id);assert.equal(a.listingId,b.listingId);assert.deepEqual(a.points,b.points);assert.equal(a.identityEvidenceBinding.schemaVersion,'research-identity-evidence-1.0.0');
 }
 // TRAK: cover page only, never through the V10 flag, never in the V10 extension.
 assert.ok(!V10.some(r=>FIVE.includes(r.securityId)));
 assert.throws(()=>LV('ref_TRAK'),/^Error: INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED$/);
 assert.ok(!LV.identityEvidence.boundSecurityIds.includes('ref_TRAK'));
});

test('default path stays byte-identical to the adapter; registers are not even loaded',()=>{
 const sample=[...FIVE,...V10.slice(0,6).map(r=>r.securityId),...LC.slice(0,6).map(r=>r.securityId),'ref_NVDA','ref_MSFT','ref_CHL','ref_ADEX','ref_FRMEP'];
 const ref=A.createLoader(root);
 for(const L of [R.createResearchLoader(root),R.createResearchLoader(root,{}),R.createResearchLoader(root,{listingLifecycleEvidence:false,identityEvidence:false})])
  for(const id of sample)assert.deepEqual(outcome(()=>L(id)),outcome(()=>ref(id)),id);
 const loaded=execFileSync(process.execPath,['-e',"const R=require('./quant/engines/research-weekly-loader.cjs');const L=R.createResearchLoader('.');try{L('ref_CHL')}catch{};process.stdout.write(String(Object.keys(require.cache).some(k=>/research-(listing-lifecycle|identity-evidence)\\.cjs$/.test(k))))"],{cwd:root,encoding:'utf8'});
 assert.equal(loaded,'false');
});

test('options fail closed; V10 identity needs identityEvidence',()=>{
 for(const bad of [{identityEvidenceProtocolV10:true},{listingLifecycleEvidence:'yes'},{listingLifecycleEvidance:true},{identityEvidence:true,identityEvidenceProtocolV10:1}])
  assert.throws(()=>R.createResearchLoader(root,bad),/^Error: INVALID_LOADER_OPTIONS/);
});

test('V10 identity extension: schema fail-closed, every record SEC same-day priced and cover-backed',()=>{
 assert.equal(Identity.v10.schemaVersion,'research-identity-evidence-1.1.0');
 assert.equal(Identity.v10.protocolSha256,sha(readFileSync(join(root,'docs/quant-recovery/v10/population/protocol-1.0.0.json'))));
 assert.ok(V10.length>0);
 const cases=EV('identity-cases.json');
 assert.deepEqual(V10.map(r=>r.securityId),cases.cases.filter(c=>c.decision==='QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER').map(c=>c.securityId).sort());
 assert.equal(R.validateIdentityEvidenceV10(Identity),Identity.v10);
 const broken=[
  r=>{r.v10.schemaVersion='research-identity-evidence-1.0.0';},
  r=>{r.v10.records[0].evidenceLevel='COVER_PAGE_ONLY';},
  r=>{r.v10.records[0].priceEvidence=[];},
  r=>{r.v10.records[0].priceEvidence[0].ratioSeriesToSource=1.03;},
  r=>{r.v10.records[0].priceEvidence[0].quote='x'.repeat(301);},
  r=>{r.v10.records[0].priceEvidence[0].date='1990-01-05';},
  r=>{r.v10.records[0].masterRowSet=[r.v10.records[0].selectedCanonicalId];},
  r=>{r.v10.records[0].validTo='2030-01-01';},
  r=>{r.v10.records[0].instrumentClass='AMERICAN_DEPOSITARY_SHARES';},
  r=>{r.v10.records[0].securityId='ref_BGC';r.v10.records[0].ticker='BGC';},
  r=>{r.v10.records[0].sources=r.v10.records[0].sources.filter(s=>s.role!=='IXBRL_COVER_LATEST');},
  r=>{r.v10.records.push(structuredClone(r.v10.records[0]));},
 ];
 for(const mutate of broken){const copy=structuredClone(Identity);mutate(copy);assert.throws(()=>R.validateIdentityEvidenceV10(copy),/^Error: INVALID_RESEARCH_IDENTITY_EVIDENCE_V10/);}
});

test('V10 identity bindings select the recorded master row on the sourced interval and fail closed',()=>{
 const L=R.createResearchLoader(root,{identityEvidence:true,identityEvidenceProtocolV10:true});
 let qualified=0;
 for(const rec of V10){
  assert.throws(()=>A.createLoader(root)(rec.securityId),/^Error: AMBIGUOUS_LISTING_IDENTITY$/);
  const o=outcome(()=>L(rec.securityId));
  if(!o.ok){assert.match(o.value,/^(INSUFFICIENT_HISTORY|CORPORATE_ACTION_UNRESOLVED|MISSING_WEEKS|INELIGIBLE_EQUITY_LISTING)/,rec.securityId);continue;}
  qualified++;
  const r=L(rec.securityId);
  assert.equal(r.listingId,rec.selectedCanonicalId);assert.equal(r.points[0][0],rec.validFrom);
  assert.equal(r.identityEvidenceBinding.schemaVersion,'research-identity-evidence-1.1.0');assert.equal(r.identityEvidenceBinding.masterRowAction,'SELECT_EXISTING_ROW');
  assert.ok(r.identityEvidenceBinding.priceEvidence>=1);
 }
 assert.ok(qualified>0);
 const rec=V10.find(x=>outcome(()=>L(x.securityId)).ok),doc=JSON.parse(seriesBytes(rec.securityId));
 const i=doc.points.findIndex(p=>p[0]>=rec.validFrom);
 const t=structuredClone(doc);t.points[i+2][1]=+(t.points[i+2][1]*1.01).toFixed(4);
 assert.throws(()=>L(rec.securityId,JSON.stringify(t)),/^Error: IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH$/);
 const late=new Date(Date.parse(rec.lastConfirmedCover.filingDate+'T00:00:00Z')+401*86400000).toISOString().slice(0,10);
 assert.throws(()=>L(rec.securityId,JSON.stringify({...doc,asOf:late})),/^Error: IDENTITY_EVIDENCE_EXPIRED:401$/);
 // master row set changed
 const tmp=mkdtempSync(join(tmpdir(),'v10-pop-master-'));
 try{
  const mp='quant/data/market/security-master/us-security-master.json',master=JSON.parse(readFileSync(join(root,mp),'utf8'));
  mkdirSync(join(tmp,'quant/data/market/security-master'),{recursive:true});
  const extra={...master.rows.find(r=>r.canonical_id===rec.selectedCanonicalId),canonical_id:'tiingo:TEST:'+rec.ticker+':2001-01-01'};
  writeFileSync(join(tmp,mp),JSON.stringify({...master,rows:master.rows.concat([extra])}));
  assert.throws(()=>R.createResearchLoader(tmp,{identityEvidence:true,identityEvidenceProtocolV10:true})(rec.securityId,seriesBytes(rec.securityId)),/^Error: IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED$/);
  writeFileSync(join(tmp,mp),JSON.stringify({...master,rows:master.rows.filter(r=>r.canonical_id!==rec.selectedCanonicalId)}));
  assert.throws(()=>R.createResearchLoader(tmp,{identityEvidence:true,identityEvidenceProtocolV10:true})(rec.securityId,seriesBytes(rec.securityId)),/^Error: IDENTITY_EVIDENCE_MASTER_ROW_MISSING$/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('listing lifecycle register: schema fail-closed and source-bound',()=>{
 assert.equal(Lifecycle.schemaVersion,'research-listing-lifecycle-1.0.0');
 assert.equal(R.validateLifecycleRegistry(Lifecycle),Lifecycle);
 const cases=EV('lifecycle-cases.json');
 assert.deepEqual(LC.map(r=>r.securityId),cases.cases.filter(c=>c.resolved).map(c=>c.securityId).sort());
 for(const r of LC){assert.ok(r.sources.some(s=>s.role==='LAST_TRADE_STATEMENT'&&s.quote.length>10));assert.ok(R.TERMINAL_KINDS.includes(r.terminal.kind));}
 const broken=[
  r=>{r.records[0].terminal.kind='CASH_MERGER';r.records[0].terminal.cashPerShare=null;r.records[0].terminal.stockRatio=null;},
  r=>{r.records[0].sources=r.records[0].sources.filter(s=>s.role!=='LAST_TRADE_STATEMENT');},
  r=>{r.records[0].historyGuard.checkedTo='2001-01-01';},
  r=>{r.records[0].status='ASSUMED';},
  r=>{r.records[0].lastTradeDate='2026-02-30';},
  r=>{r.records[0].terminal.kind='TRUST_ME';},
  r=>{r.records.push(structuredClone(r.records[0]));},
 ];
 for(const mutate of broken){const copy=structuredClone(Lifecycle);mutate(copy);assert.throws(()=>R.validateLifecycleRegistry(copy),/^Error: INVALID_RESEARCH_LISTING_LIFECYCLE/);}
});

test('listingLifecycleEvidence: cut at the sourced last trading day, frozen without record fails closed, everything else unchanged',()=>{
 const L=R.createResearchLoader(root,{listingLifecycleEvidence:true}),D=A.createLoader(root);
 // non-frozen series without record: exactly the default result
 for(const id of ['ref_NVDA','ref_MSFT','ref_JPM','ref_FRMEP','ref_COHR'])assert.deepEqual(outcome(()=>L(id)),outcome(()=>D(id)),id);
 // a frozen tail without record fails closed (synthetic: freeze the last four weeks of NVDA)
 const nv=JSON.parse(seriesBytes('ref_NVDA'));for(let k=2;k<=4;k++)nv.points.at(-k)[1]=nv.points.at(-1)[1];
 assert.throws(()=>L('ref_NVDA',JSON.stringify(nv)),/^Error: FROZEN_TAIL_UNRESOLVED$/);
 assert.equal(outcome(()=>D('ref_NVDA',JSON.stringify(nv))).ok,true);
 // real frozen ids without a record
 const lcIds=new Set(LC.map(r=>r.securityId));
 const cases=EV('lifecycle-cases.json').cases.filter(c=>c.weeklyFrozen&&!lcIds.has(c.securityId)&&c.defaultReason==='QUALIFIED').slice(0,5);
 for(const c of cases)assert.throws(()=>L(c.securityId),/^Error: FROZEN_TAIL_UNRESOLVED$/,c.securityId);
 // records: cut + listingLifecycle contract
 let ok=0;
 for(const rec of LC){
  const o=outcome(()=>L(rec.securityId));if(!o.ok)continue;ok++;
  const r=L(rec.securityId),ll=r.listingLifecycle;
  assert.ok(r.points.at(-1)[0]<=rec.lastTradeDate);assert.equal(ll.lastTradeDate,rec.lastTradeDate);assert.equal(ll.status,'DELISTED_SOURCE_VERIFIED');
  assert.equal(ll.frozenTailBarsRemoved,JSON.parse(seriesBytes(rec.securityId)).points.filter(p=>p[0]>rec.lastTradeDate).length);
  for(const k of ['kind','cashPerShare','stockRatio','acquirerTicker','paymentDate','evidence'])assert.ok(k in ll.terminal);
  assert.ok(r.warnings.includes('SERIES_CUT_AT_SOURCED_LAST_TRADE_DATE'));
 }
 assert.ok(ok>0);
 const rec=LC.find(x=>outcome(()=>L(x.securityId)).ok),doc=JSON.parse(seriesBytes(rec.securityId));
 const moved=structuredClone(doc);moved.points.at(-1)[1]=+(rec.frozenClose*1.05).toFixed(4);
 assert.throws(()=>L(rec.securityId,JSON.stringify(moved)),/^Error: LISTING_LIFECYCLE_(CONFLICT|HISTORY_GUARD_MISMATCH)$/);
 const before=structuredClone(doc);const j=before.points.findIndex(p=>p[0]>=rec.lastTradeDate)-3;before.points[j][1]=+(before.points[j][1]*1.01).toFixed(4);
 assert.throws(()=>L(rec.securityId,JSON.stringify(before)),/^Error: LISTING_LIFECYCLE_HISTORY_GUARD_MISMATCH$/);
 assert.throws(()=>L(rec.securityId,JSON.stringify({...doc,ticker:'XXXX',instrumentId:'XXXX'})),/^Error: LISTING_LIFECYCLE_CONFLICT$/);
});

test('population frame: ids, hash and counts reproduce under the frame loader options',()=>{
 const f=EV('population-frame-1.0.0.json');
 assert.deepEqual(f.rule.loaderOptions,FRAME);assert.equal(f.certificationStatus,'NOT_CERTIFIED');assert.equal(f.productionApproved,false);
 const ids=f.listings.map(x=>x.securityId);
 assert.equal(sha(JSON.stringify(ids)),f.idsSha256);assert.equal(f.counts.qualified,ids.length);
 assert.equal(f.counts.candidates,f.counts.qualified+Object.values(f.counts.excludedByReason).reduce((a,b)=>a+b,0));
 const L=R.createResearchLoader(root,FRAME);
 for(const x of f.listings.filter((_,i)=>i%97===0)){const r=L(x.securityId);assert.equal(r.points[0][0],x.from);assert.equal(r.points.at(-1)[0],x.to);}
 for(const [y,p] of Object.entries(f.perIsoYear))assert.equal(p.qualified,p.laterDelisted+p.survivors,y);
});
