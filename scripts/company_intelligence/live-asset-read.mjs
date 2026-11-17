import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Pages edge propagation can briefly return its HTML fallback for a new asset.
// Retry hosting responses only. JSON integrity failures always fail immediately.
// Transiente Netzfehler (Verbindungsabbruch, Zeitueberschreitung, "fetch failed") zaehlen wie Hosting-Antworten (16.11.2026 13:57Z:
// 503, dann ECONNRESET beim Lesen eines Snapshots schloss das gesunde Gate); nach dem dritten Versuch endet der Lesepfad mit einem
// typisierten Fehler (TransientNetworkError), den die Live-Verifikation wiederholen darf. Inhalt/Hash-Fehler bleiben sofort fatal.
const NETWORK_CODES=new Set(['ECONNRESET','ETIMEDOUT','ECONNREFUSED','EAI_AGAIN','ENOTFOUND','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
export function isTransientNetworkError(e){
 if(!e||typeof e!=='object')return false;
 if(e.name==='TransientNetworkError'||e.name==='AbortError'||e.name==='TimeoutError')return true;
 if(NETWORK_CODES.has(e.code)||NETWORK_CODES.has(e.cause?.code))return true;
 return e.name==='TypeError'&&/fetch failed/i.test(String(e.message));
}
export function networkError(what,e){
 const code=String(e?.cause?.code||e?.code||e?.name||'NETWORK').replace(/[^A-Za-z0-9_]/g,'').slice(0,40);
 const error=new Error('LIVE_ASSET_NETWORK_FAILURE: '+what+' ('+code+')');error.name='TransientNetworkError';error.code=code;return error;
}
export async function readLiveAsset(url,meta,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),onRetry=()=>{}}={}){
 for(let attempt=1;attempt<=3;attempt++){
  let r,b=null,hosting;
  try{
   r=await fetcher(url+(url.includes('?')?'&':'?')+'asset-proof='+Date.now()+'-'+attempt,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
   hosting=[404,429,500,502,503,504].includes(r.status)||(r.ok&&r.headers.get('content-type')?.includes('text/html'));
   if(!hosting&&r.ok)b=Buffer.from(await r.arrayBuffer());
  }catch(e){
   if(!isTransientNetworkError(e))throw e;
   if(attempt<3){onRetry({attempt,status:0,contentType:null,error:networkError(url,e).code});await pause(attempt===1?500:1500);continue;}
   throw networkError(url,e);
  }
  if(hosting&&attempt<3){onRetry({attempt,status:r.status,contentType:r.headers.get('content-type')});await r.body?.cancel();await pause(attempt===1?500:1500);continue;}
  assert(r.ok&&!hosting,'LIVE_ASSET_HOSTING_FAILURE: '+url);
  assert.equal(b.length,meta.bytes,url);assert.equal(createHash('sha256').update(b).digest('hex'),meta.sha256,url);
  return b;
 }
}
