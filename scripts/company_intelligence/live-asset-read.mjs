import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Pages edge propagation can briefly return its HTML fallback for a new asset.
// Retry hosting responses only. JSON integrity failures always fail immediately.
export async function readLiveAsset(url,meta,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),onRetry=()=>{}}={}){
 for(let attempt=1;attempt<=3;attempt++){
  const r=await fetcher(url+(url.includes('?')?'&':'?')+'asset-proof='+Date.now()+'-'+attempt,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
  const hosting=[404,429,500,502,503,504].includes(r.status)||(r.ok&&r.headers.get('content-type')?.includes('text/html'));
  if(hosting&&attempt<3){onRetry({attempt,status:r.status,contentType:r.headers.get('content-type')});await r.body?.cancel();await pause(attempt===1?500:1500);continue;}
  assert(r.ok&&!hosting,'LIVE_ASSET_HOSTING_FAILURE: '+url);
  const b=Buffer.from(await r.arrayBuffer());
  assert.equal(b.length,meta.bytes,url);assert.equal(createHash('sha256').update(b).digest('hex'),meta.sha256,url);
  return b;
 }
}
