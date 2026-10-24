/* Local INTERNAL_REVIEW transport. Never exported by api/ or a deployment entry.
   Private artifacts are read only through the existing Quant product service. */
'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Service=require('../quant/api/product-services.js'),Store=require('./quant-backtest-store.cjs');
const PREFIX='/quant/internal-backtest/',COOKIE='vu_backtest_review';
async function credential(file){
 const resolved=await fs.realpath(file),repo=await fs.realpath(path.resolve(__dirname,'..'));if(!path.relative(repo,resolved).startsWith('..'+path.sep))throw Error('CREDENTIAL_MUST_BE_OUTSIDE_REPOSITORY');
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512||(stat.mode&0o077))throw Error('PRIVATE_CREDENTIAL_FILE_REQUIRED');
 const key=(await fs.readFile(file,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_CREDENTIAL_FILE');return key;
}
function create({directory,credentialKey,root=path.resolve(__dirname,'..'),allowedTickers=['NVDA'],ttlMs=600000,maxResponseBytes=262144,clock=Date.now}={}){
 if(!/^[a-f0-9]{64}$/.test(credentialKey||'')||!Number.isInteger(ttlMs)||ttlMs<100||ttlMs>900000||!Number.isInteger(maxResponseBytes)||maxResponseBytes<256||maxResponseBytes>2097152)throw Error('INVALID_PREVIEW_CONFIGURATION');
 if(!allowedTickers.length||allowedTickers.length>32||allowedTickers.some(t=>!/^[A-Z0-9.-]{1,12}$/.test(t)))throw Error('INVALID_PREVIEW_ALLOW_LIST');
 const grants=new Set(allowedTickers),store=Store.create({directory,repositoryRoot:root}),sessions=new Map(),secret=crypto.createHash('sha256').update(credentialKey).digest();
 const freshness=require('./quant-backtest-freshness.cjs').create({root,directory,clock});
 const loadJSON=async p=>JSON.parse(await fs.readFile(path.join(root,p.replace(/^\//,'')),'utf8'));
 const makeService=()=>Service.create({loadJSON,displayPolicy:require('../quant/engines/display-policy.js'),queryEngine:require('../quant/engines/query.js'),realBacktestPreview:{enabled:true,audience:'INTERNAL_REVIEW'},realBacktestStore:store});
 let service=makeService(),serviceGeneration=null;
 let origin=null,failures=0,failureUntil=0;
 const assets=new Map([
  [PREFIX+'client.js',['scripts/quant/preview/client.js','text/javascript; charset=utf-8']],
  ['/quant/app/app.css',['quant/app/app.css','text/css']],['/quant/ui/quant.css',['quant/ui/quant.css','text/css']],
  ['/quant/ui/charts.js',['quant/ui/charts.js','text/javascript']],['/assets/fonts/inter-latin.woff2',['assets/fonts/inter-latin.woff2','font/woff2']]
 ]);
 function headers(res){
  for(const [k,v] of Object.entries({'Cache-Control':'private, no-store, max-age=0, must-revalidate','Pragma':'no-cache','Vary':'Cookie, Authorization, Sec-Fetch-Site','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'"}))res.setHeader(k,v);
 }
 function json(res,status,value){const body=JSON.stringify(value);if(Buffer.byteLength(body)>maxResponseBytes){res.statusCode=503;res.setHeader('Content-Type','application/json');res.end('{"state":"PAYLOAD_LIMIT"}');return;}res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(body);}
 const deny=(res,status=401,state='NOT_AUTHORIZED')=>json(res,status,{state});
 function session(req){const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));if(cookies.length!==1)return null;const token=cookies[0].slice(COOKIE.length+1);if(!/^[a-f0-9]{64}$/.test(token))return null;const s=sessions.get(token);if(!s||s.expiresAt<=clock()){sessions.delete(token);return null;}return {token,...s};}
 async function body(req){let bytes=0,chunks=[];for await(const b of req){bytes+=b.length;if(bytes>4096)throw Error('REQUEST_TOO_LARGE');chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('INVALID_REQUEST');}}
 const server=http.createServer(async(req,res)=>{
  headers(res);
  try{
   if(!origin||req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return deny(res,403,'ORIGIN_NOT_ALLOWED');
   const url=new URL(req.url,origin);
   if(url.pathname===PREFIX&&req.method==='GET'&&!url.search){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile(path.join(root,'scripts/quant/preview/index.html')));return;}
   if(assets.has(url.pathname)&&req.method==='GET'&&!url.search){const [file,type]=assets.get(url.pathname);res.setHeader('Content-Type',type);res.end(await fs.readFile(path.join(root,file)));return;}
   if(url.pathname===PREFIX+'login'&&req.method==='POST'&&!url.search){
    if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return deny(res,403);
    if(clock()<failureUntil)return deny(res,429,'TRY_LATER');
    if(Number(req.headers['content-length'])>4096)return deny(res,413,'REQUEST_TOO_LARGE');
    const payload=await body(req);if(typeof payload.key!=='string'||payload.key.length>128)return deny(res);
    const supplied=crypto.createHash('sha256').update(payload.key).digest();
    if(!crypto.timingSafeEqual(secret,supplied)){failures++;if(failures>=5){failureUntil=clock()+60000;failures=0;}return deny(res);}
    for(const [t,s] of sessions)if(s.expiresAt<=clock())sessions.delete(t);if(sessions.size>=32)return deny(res,429,'SESSION_LIMIT');
    failures=0;const token=crypto.randomBytes(32).toString('hex'),expiresAt=clock()+ttlMs;sessions.set(token,{expiresAt});
    res.setHeader('Set-Cookie',COOKIE+'='+token+'; HttpOnly; SameSite=Strict; Path='+PREFIX+'; Max-Age='+Math.ceil(ttlMs/1000));return json(res,200,{state:'AUTHORIZED',expiresAt});
   }
   const auth=session(req);if(!auth)return deny(res);
   if(url.pathname===PREFIX+'logout'&&req.method==='POST'&&!url.search){if(req.headers.origin!==origin)return deny(res,403);sessions.delete(auth.token);res.setHeader('Set-Cookie',COOKIE+'=; HttpOnly; SameSite=Strict; Path='+PREFIX+'; Max-Age=0');return json(res,200,{state:'SIGNED_OUT'});}
   if(req.method!=='GET')return deny(res,405,'METHOD_NOT_ALLOWED');
   if(url.pathname===PREFIX+'session'&&!url.search){const release=await store.loadJSON('release.json');return json(res,200,{state:'AUTHORIZED',expiresAt:auth.expiresAt,generation:release.generation,allowedTickers:[...grants]});}
   if(url.pathname!==PREFIX+'data')return deny(res,404,'NOT_FOUND');
   const allowed=new Set(['ticker','period','section','generation','listingId']);for(const k of url.searchParams.keys())if(!allowed.has(k)||url.searchParams.getAll(k).length!==1)return deny(res,400,'INVALID_SELECTION');
   const ticker=url.searchParams.get('ticker')||'NVDA',period=url.searchParams.get('period')||'MAX',section=url.searchParams.get('section')||'summary',generation=url.searchParams.get('generation'),listingId=url.searchParams.get('listingId');
   if(!grants.has(ticker))return deny(res,403,'NOT_AUTHORIZED');
   if(!['1Y','3Y','5Y','10Y','MAX'].includes(period)||!['summary','quality','equity','trades'].includes(section)||generation&&!/^[a-f0-9]{64}$/.test(generation)||listingId&&!/^[A-Za-z0-9:._-]{1,180}$/.test(listingId))return deny(res,400,'INVALID_SELECTION');
   if(['equity','trades'].includes(section)&&(!generation||!listingId))return deny(res,400,'PINNED_IDENTITY_REQUIRED');
   const selected=await store.loadJSON('release.json');if(selected.generation!==serviceGeneration){service=makeService();serviceGeneration=selected.generation;}
   const result=await service.getRealBacktest(ticker,{period,section});
   if(generation&&generation!==result.generation)return deny(res,409,'GENERATION_CHANGED');
   if(listingId&&listingId!==result.identity?.listingId)return deny(res,409,'IDENTITY_MISMATCH');
   const current=await store.loadJSON('release.json');if(result.generation&&current.generation!==result.generation)return deny(res,409,'GENERATION_CHANGED');
   if(result.generation)result.delivery=await freshness(result);
   // Authorize again after asynchronous reads: an expired/revoked session never
   // receives a late response, including from the service's summary cache.
   if(!session(req))return deny(res);
   if(result.certification!=='NOT_CERTIFIED'||result.productionApproved!==false||result.returnBasis&&result.returnBasis!=='PRICE_RETURN')return deny(res,503,'CONTRACT_REJECTED');
   return json(res,result.state==='UNAVAILABLE'?503:200,result);
  }catch(e){return deny(res,e.message==='REQUEST_TOO_LARGE'?413:e.message==='INVALID_REQUEST'?400:503,e.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':e.message==='INVALID_REQUEST'?'INVALID_REQUEST':'PREVIEW_UNAVAILABLE');}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;server.maxHeadersCount=32;
 return {server,get service(){return service;},async listen(port=0){await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});origin='http://127.0.0.1:'+server.address().port;return origin+PREFIX;},async close(){sessions.clear();server.closeAllConnections();await new Promise(ok=>server.close(ok));}};
}
module.exports={create,credential,PREFIX};
