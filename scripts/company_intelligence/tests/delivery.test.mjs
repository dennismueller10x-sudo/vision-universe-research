import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {allowedAsset,publish,readAsset,prefixFor} from '../public-delivery.mjs';
const require=createRequire(import.meta.url), {createHandler}=require('../pilot-handler.cjs');
const rollout=require('../../../company-intelligence/config/rollout.js');
function driver(){const objects=new Map();return {objects,get:async k=>objects.get(k)||null,put:async(k,b)=>objects.set(k,b)}}
function fixture(generation='a'.repeat(24), stamp='2026-10-02T12:00:00Z'){
 const root=mkdtempSync(join(tmpdir(),'intelligence-public-')), path=`snapshots/${generation}/iss_cik_0000320193.json`;
 const payload={schema:'vu-company-intelligence-1.0.0',state:'AVAILABLE',companyId:'iss_cik_0000320193',generatedAt:stamp,listings:[{symbol:'AAPL',instrumentId:'vu_12345678901234'}],news:[],events:[],earnings:[],filings:[],calls:[],timeline:[],coverage:{newsGuarantee:false}};
 const values={'index.json':{schema:payload.schema,generation,generatedAt:stamp,state:'PREVIEW',companies:{[payload.companyId]:path},tickers:{AAPL:[{companyId:payload.companyId,instrumentId:'vu_12345678901234'}]}},[path]:payload}, assets={};
 for(const [p,v] of Object.entries(values)){mkdirSync(join(root,p,'..'),{recursive:true});const data=Buffer.from(JSON.stringify(v));writeFileSync(join(root,p),data);assets[p]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}
 writeFileSync(join(root,'manifest.json'),JSON.stringify({schema:1,generation,generatedAt:stamp,assets,tickers:['AAPL']}));return {root,path};
}
const now=Date.parse('2026-10-02T14:00:00Z');
test('consumer allowlist never admits private state or traversal',()=>{for(const p of ['../state.sqlite','state/index.json','snapshots/../foo.json','snapshots/a'.repeat(24),'/index.json','index.json?x=1'])assert.equal(allowedAsset(p),false);assert.equal(allowedAsset('index.json'),true);assert.throws(()=>prefixFor('../main'));});
test('pointer last publication, stable rerun and previous generation recovery',async()=>{const d=driver(),a=fixture(),b=fixture('b'.repeat(24),'2026-10-02T13:00:00Z');try{const first=await publish(d,{namespace:'test',directory:a.root});assert.equal(first.uploadedObjects,2);const again=await publish(d,{namespace:'test',directory:a.root});assert.equal(again.uploadedObjects,0);await publish(d,{namespace:'test',directory:b.root});assert.equal((await readAsset(d,{namespace:'test',asset:a.path,now})).generation,'a'.repeat(24));assert.equal((await readAsset(d,{namespace:'test',asset:'index.json',now})).generation,'b'.repeat(24));}finally{rmSync(a.root,{recursive:true});rmSync(b.root,{recursive:true});}});
test('failed object upload leaves existing pointer readable',async()=>{const d=driver(),a=fixture(),b=fixture('b'.repeat(24));try{await publish(d,{namespace:'test',directory:a.root});const normal=d.put;d.put=async(k,v)=>{if(k.includes('slot-1'))throw Error('unavailable');return normal(k,v)};await assert.rejects(publish(d,{namespace:'test',directory:b.root}));assert.equal((await readAsset(d,{namespace:'test',asset:a.path,now})).generation,'a'.repeat(24));}finally{rmSync(a.root,{recursive:true});rmSync(b.root,{recursive:true});}});
test('corrupt, expired and unpublished bytes fail closed',async()=>{const d=driver(),a=fixture();try{await publish(d,{namespace:'test',directory:a.root});await assert.rejects(readAsset(d,{namespace:'test',asset:a.path,now:now+10*86400000}));d.objects.set(prefixFor('test')+'slot-0/iss_cik_0000320193.json',Buffer.from('{}'));await assert.rejects(readAsset(d,{namespace:'test',asset:a.path,now}),/INTEGRITY/);await assert.rejects(readAsset(d,{namespace:'test',asset:a.path.replace('a'.repeat(24),'c'.repeat(24)),now}));}finally{rmSync(a.root,{recursive:true});}});
async function request(handler,url,method='GET'){let body;const res={setHeader(){},end(v){body=JSON.parse(v)}};await handler({method,url,headers:{}},res);return {status:res.statusCode,body};}
test('stock rollout closes stage zero, enables only the approved production cohort and honors emergency off',()=>{
 const stage=rollout.stage;
 try{
  rollout.stage=0;assert.equal(rollout.enabled('AAPL',{search:''}),false);assert.equal(rollout.enabled('AAPL',{search:'?company-intelligence=preview'}),true);assert.equal(rollout.enabled('ZZZZ',{search:'?company-intelligence=preview'}),false);
  rollout.stage=1;assert.equal(rollout.enabled('AAPL',{search:''}),true);assert.equal(rollout.enabled('ZZZZ',{search:''}),false);
  rollout.productionOff=true;assert.equal(rollout.enabled('AAPL',{search:''}),false);assert.equal(rollout.enabled('AAPL',{search:'?company-intelligence=preview',enabled:true}),false);
 }finally{rollout.stage=stage;delete rollout.productionOff;}
});
test('disabled API makes zero storage calls and unsafe paths never reach storage',async()=>{let calls=0;const getDriver=()=>{calls++;throw Error()};assert.equal((await request(createHandler({env:{},getDriver}),'/api/company-intelligence?asset=index.json')).body.state,'DISABLED');const handler=createHandler({env:{COMPANY_INTELLIGENCE_ENABLED:'true',COMPANY_INTELLIGENCE_CONSUMER_NAMESPACE:'test'},getDriver});assert.equal((await request(handler,'/api/company-intelligence?asset=../../state.sqlite')).status,400);assert.equal(calls,0);});
test('enabled API returns only manifest-listed verified consumer data',async()=>{const d=driver(),a=fixture();try{await publish(d,{namespace:'test',directory:a.root});const handler=createHandler({env:{COMPANY_INTELLIGENCE_ENABLED:'true',COMPANY_INTELLIGENCE_CONSUMER_NAMESPACE:'test'},getDriver:async()=>d,now:()=>now});assert.equal((await request(handler,'/api/company-intelligence?asset='+a.path)).body.companyId,'iss_cik_0000320193');assert.equal((await request(handler,'/api/company-intelligence?asset=index.json&asset=state')).status,400);}finally{rmSync(a.root,{recursive:true});}});
test('consumer source links reject local networks and credential-bearing URLs',()=>{const {safeLink}=require('../../../company-intelligence/api/contract.js');for(const url of ['javascript:alert(1)','http://127.1/private','http://localhost./','https://service.localhost/','http://[::1]/','http://10.0.0.1/','http://host.internal/','https://user:pass@sec.gov/','https://sec.gov:444/'])assert.equal(safeLink(url),null);assert.equal(safeLink('https://www.sec.gov/'),'https://www.sec.gov/');});
test('two-slot consumer storage stays bounded across many generations',async()=>{const d=driver();for(let i=0;i<6;i++){const a=fixture(String(i).repeat(24),'2026-10-02T13:00:00Z');try{await publish(d,{namespace:'bounded',directory:a.root})}finally{rmSync(a.root,{recursive:true})}}assert.equal(d.objects.size,6);});
test('Pages projection copies current and previous consumer generations only',async()=>{const {download}=await import('../download-public.mjs'),d=driver(),a=fixture(),b=fixture('b'.repeat(24)),out=mkdtempSync(join(tmpdir(),'intelligence-release-'));try{await publish(d,{namespace:'pages',directory:a.root});await publish(d,{namespace:'pages',directory:b.root});const r=await download(d,{namespace:'pages',output:out,now});assert.equal(r.retainedGenerations,2);assert.equal(r.privateObjectsRead,0);assert.equal(r.files,3);}finally{for(const f of [a.root,b.root,out])rmSync(f,{recursive:true})}});
test('failed Pages integrity check preserves the disabled release index',async()=>{const {download}=await import('../download-public.mjs'),d=driver(),a=fixture(),out=mkdtempSync(join(tmpdir(),'intelligence-release-'));try{writeFileSync(join(out,'index.json'),'{"state":"DISABLED"}');await publish(d,{namespace:'pages',directory:a.root});d.objects.set(prefixFor('pages')+'slot-0/iss_cik_0000320193.json',Buffer.from('corrupt'));await assert.rejects(download(d,{namespace:'pages',output:out,now}));const {readFileSync}=await import('node:fs');assert.equal(JSON.parse(readFileSync(join(out,'index.json'))).state,'DISABLED');}finally{for(const f of [a.root,out])rmSync(f,{recursive:true})}});
test('Pages download pins manifests and checks the pointer again before any write',async()=>{const {download}=await import('../download-public.mjs'),d=driver(),a=fixture(),b=fixture('b'.repeat(24)),out=mkdtempSync(join(tmpdir(),'intelligence-release-'));try{await publish(d,{namespace:'pinned',directory:a.root});await publish(d,{namespace:'pinned',directory:b.root});let reads=0;const get=d.get;d.get=async key=>{if(key.endsWith('manifest.json')||key.endsWith('previous.json'))reads++;return get(key)};await download(d,{namespace:'pinned',output:out,now});assert.equal(reads,3);}finally{for(const f of [a.root,b.root,out])rmSync(f,{recursive:true})}});
test('a pointer swap during Pages download fails before replacing the disabled index',async()=>{const {download}=await import('../download-public.mjs'),d=driver(),a=fixture(),out=mkdtempSync(join(tmpdir(),'intelligence-release-'));try{await publish(d,{namespace:'race',directory:a.root});writeFileSync(join(out,'index.json'),'{"state":"DISABLED"}');let reads=0;const get=d.get;d.get=async key=>{const value=await get(key);if(key.endsWith('manifest.json')&&++reads===2)return Buffer.from('{}');return value};await assert.rejects(download(d,{namespace:'race',output:out,now}),/GENERATION_CHANGED/);const {readFileSync}=await import('node:fs');assert.equal(JSON.parse(readFileSync(join(out,'index.json'))).state,'DISABLED');}finally{for(const f of [a.root,out])rmSync(f,{recursive:true})}});

test('a damaged late local asset causes zero remote writes and preserves the fallback slot',async()=>{
 const d=driver(),a=fixture(),b=fixture('b'.repeat(24),'2026-10-02T13:00:00Z');
 try{
  await publish(d,{namespace:'preflight',directory:a.root});const before=new Map(d.objects);
  writeFileSync(join(b.root,b.path),'broken');
  await assert.rejects(publish(d,{namespace:'preflight',directory:b.root}),/LOCAL_CONSUMER_INTEGRITY/);
  assert.deepEqual(d.objects,before);
 }finally{for(const f of [a.root,b.root])rmSync(f,{recursive:true})}
});
test('a smaller cohort and review-only candidate cannot change any remote object',async()=>{
 const d=driver(),a=fixture(),b=fixture('b'.repeat(24),'2026-10-02T13:00:00Z');
 try{
  await publish(d,{namespace:'release-gate',directory:a.root});const before=new Map(d.objects);
  const manifestPath=join(b.root,'manifest.json'),m=JSON.parse(readFileSync(manifestPath));
  m.releaseState='REVIEW_ONLY';writeFileSync(manifestPath,JSON.stringify(m));
  await assert.rejects(publish(d,{namespace:'release-gate',directory:b.root}),/REVIEW_ONLY/);assert.deepEqual(d.objects,before);
  delete m.releaseState;m.tickers=['MSFT'];writeFileSync(manifestPath,JSON.stringify(m));
  await assert.rejects(publish(d,{namespace:'release-gate',directory:b.root}),/SHRUNK/);assert.deepEqual(d.objects,before);
 }finally{for(const f of [a.root,b.root])rmSync(f,{recursive:true})}
});

test('large content loss inside an unchanged issuer cohort is refused before writes',async()=>{
 const d=driver(),a=fixture(),b=fixture('b'.repeat(24),'2026-10-02T13:00:00Z');
 function news(directory,path,rows){
  const file=join(directory,path),p=JSON.parse(readFileSync(file));p.news=rows;
  const bytes=Buffer.from(JSON.stringify(p));writeFileSync(file,bytes);
  const mf=join(directory,'manifest.json'),m=JSON.parse(readFileSync(mf));m.assets[path]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};writeFileSync(mf,JSON.stringify(m));
 }
 try{
  news(a.root,a.path,[{companyId:'iss_cik_0000320193',newsId:'retained'}]);
  await publish(d,{namespace:'content-floor',directory:a.root});const before=new Map(d.objects);
  await assert.rejects(publish(d,{namespace:'content-floor',directory:b.root}),/CONTENT_REGRESSION/);assert.deepEqual(d.objects,before);
 }finally{for(const f of [a.root,b.root])rmSync(f,{recursive:true})}
});

test('filtered source review cannot publish after its manifest review label is removed',async()=>{
 const d=driver(),a=fixture();
 try{
  const file=join(a.root,a.path),p=JSON.parse(readFileSync(file));p.previewBasis='OWNED_IR_SEC_REVIEW';
  const bytes=Buffer.from(JSON.stringify(p));writeFileSync(file,bytes);
  const mf=join(a.root,'manifest.json'),m=JSON.parse(readFileSync(mf));m.assets[a.path]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};writeFileSync(mf,JSON.stringify(m));
  await assert.rejects(publish(d,{namespace:'restore-review',directory:a.root}),/REVIEW_ONLY_PUBLICATION_REFUSED/);
  assert.equal(d.objects.size,0);
 }finally{rmSync(a.root,{recursive:true})}
});

test('a failed update after active-slot corruption preserves the last intact previous generation',async()=>{
 const d=driver(),a=fixture(),b=fixture('b'.repeat(24),'2026-10-02T13:00:00Z'),c=fixture('c'.repeat(24),'2026-10-02T14:00:00Z');
 try{
  await publish(d,{namespace:'intact-fallback',directory:a.root});await publish(d,{namespace:'intact-fallback',directory:b.root});
  d.objects.set(prefixFor('intact-fallback')+'slot-1/iss_cik_0000320193.json',Buffer.from('corrupt'));
  const retained=d.objects.get(prefixFor('intact-fallback')+'slot-0/iss_cik_0000320193.json'),normal=d.put;
  d.put=async(k,v)=>{if(k.includes('slot-1/'))throw Error('upload failed');return normal(k,v)};
  await assert.rejects(publish(d,{namespace:'intact-fallback',directory:c.root}));
  assert.deepEqual(d.objects.get(prefixFor('intact-fallback')+'slot-0/iss_cik_0000320193.json'),retained);
  assert.equal((await readAsset(d,{namespace:'intact-fallback',asset:a.path,now})).generation,'a'.repeat(24));
 }finally{for(const f of [a.root,b.root,c.root])rmSync(f,{recursive:true})}
});
