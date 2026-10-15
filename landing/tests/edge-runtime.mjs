// Native Cloudflare runtime regression. All provider traffic is synthetic and
// routed to a local mock service; no real key, contact or mail is involved.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const port=reservation.address().port;await new Promise(r=>reservation.close(r));
// Start the native binary directly so cleanup terminates the runtime as well
// as the launcher; an orphan would otherwise keep test pipes/CI open.
const packages={'linux-x64':'linux-64','linux-arm64':'linux-arm64','darwin-x64':'darwin-64','darwin-arm64':'darwin-arm64','win32-x64':'windows-64'};
const platform=packages[process.platform+'-'+process.arch];assert.ok(platform,'Unsupported workerd test platform');
const binary=createRequire(import.meta.url).resolve('@cloudflare/workerd-'+platform+'/bin/workerd'+(process.platform==='win32'?'.exe':''));
const processHandle=spawn(binary,['serve',resolve(root,'tests/edge-runtime/config.capnp'),'--socket-addr','http=127.0.0.1:'+port],{stdio:['ignore','pipe','pipe']});
let diagnostics='';processHandle.stdout.on('data',v=>diagnostics+=v);processHandle.stderr.on('data',v=>diagnostics+=v);
const origin='http://127.0.0.1:'+port;
try{
  let ready=false;
  for(let i=0;i<100;i++){
    try{ready=(await fetch(origin+'/ready')).status===200;}catch{}
    if(ready)break;
    if(processHandle.exitCode!==null)break;
    await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(ready,'Synthetic workerd failed to start: '+diagnostics.slice(-1000));
  assert.deepEqual(await fetch(origin+'/legacy').then(r=>r.json()),{rejected:true});
  const send=(email,ip)=>fetch(origin+'/api/newsletter/subscribe',{method:'POST',headers:{Origin:'https://www.visionuniverse.de','Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({email,consent:true,consentVersion:'vu-newsletter-v1',honeypot:''})});
  {const response=await send('new@example.test','192.0.2.1');assert.equal(response.status,202,await response.text());}
  {const response=await send('new@example.test','192.0.2.1');assert.equal(response.status,202,await response.text());}
  assert.equal((await send('redirect-lookup@example.test','192.0.2.2')).status,503);
  assert.equal((await send('send-redirect@example.test','192.0.2.3')).status,503);
  assert.equal((await send('send-redirect@example.test','192.0.2.3')).status,202);
  assert.deepEqual(await fetch(origin+'/stats').then(r=>r.json()),{attempted:2,accepted:1,unexpected:0,validBody:true});
  console.log('Native workerd: original redirect error reproduced; DOI API path, manual redirects, zero redirect following, fixed list 4 and no duplicate attempts verified with synthetic data.');
}finally{
  processHandle.kill('SIGTERM');if(processHandle.exitCode===null)await once(processHandle,'exit');
}
