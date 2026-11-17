import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Pages edge propagation can briefly return its HTML fallback for a new asset.
// Retry hosting responses only. JSON integrity failures always fail immediately.
// Transiente Netzfehler (Verbindungsabbruch, Zeitueberschreitung, "fetch failed") zaehlen wie Hosting-Antworten (16.11.2026 13:57Z:
// 503, dann ECONNRESET beim Lesen eines Snapshots schloss das gesunde Gate); nach dem letzten Versuch endet der Lesepfad mit einem
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
// Geduld gegen Hosting-Vorgaenge direkt nach dem Deploy (17.11.2026 08:26Z: 503, dann 429 bei ~5.580 Snapshot-Zugriffen, 3 Versuche in
// 2 s reichten nicht; das gesunde Gate wurde zum dritten Mal geschlossen). Feste Obergrenze: 8 Versuche, Pausen 1/2/4/8/15/30/30 s
// (Retry-After beachtet, hoechstens 30 s); danach LIVE_ASSET_HOSTING_FAILURE bzw. TransientNetworkError wie bisher.
export const LIVE_READ_ATTEMPTS=8,LIVE_READ_PAUSES_MS=Object.freeze([1000,2000,4000,8000,15000,30000,30000]);
const pauseFor=(attempt,r)=>{
 const base=LIVE_READ_PAUSES_MS[Math.min(attempt-1,LIVE_READ_PAUSES_MS.length-1)],header=Number(r?.headers?.get?.('retry-after'));
 return Math.min(30000,Number.isFinite(header)&&header>0?Math.max(base,header*1000):base);
};
export async function readLiveAsset(url,meta,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),onRetry=()=>{}}={}){
 for(let attempt=1;attempt<=LIVE_READ_ATTEMPTS;attempt++){
  let r,b=null,hosting;
  try{
   r=await fetcher(url+(url.includes('?')?'&':'?')+'asset-proof='+Date.now()+'-'+attempt,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
   hosting=[404,429,500,502,503,504].includes(r.status)||(r.ok&&r.headers.get('content-type')?.includes('text/html'));
   if(!hosting&&r.ok)b=Buffer.from(await r.arrayBuffer());
  }catch(e){
   if(!isTransientNetworkError(e))throw e;
   if(attempt<LIVE_READ_ATTEMPTS){onRetry({attempt,status:0,contentType:null,error:networkError(url,e).code});await pause(pauseFor(attempt));continue;}
   throw networkError(url,e);
  }
  if(hosting&&attempt<LIVE_READ_ATTEMPTS){onRetry({attempt,status:r.status,contentType:r.headers.get('content-type')});await r.body?.cancel();await pause(pauseFor(attempt,r));continue;}
  assert(r.ok&&!hosting,'LIVE_ASSET_HOSTING_FAILURE: '+url);
  assert.equal(b.length,meta.bytes,url);assert.equal(createHash('sha256').update(b).digest('hex'),meta.sha256,url);
  return b;
 }
}
