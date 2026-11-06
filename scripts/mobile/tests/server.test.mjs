import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {startServer} from '../server.mjs';
test('measurement server compresses text, preserves gzip shards and rejects missing/outside paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'e5-server-'));
 const shard=gzipSync(Buffer.from('{"price":204.64}'));
 await writeFile(join(root,'index.html'),'<h1>Release</h1>');
 await writeFile(join(root,'NV.json.gz'),shard);
 const server=await startServer(root), base=`http://127.0.0.1:${server.address().port}`;
 try {
  const html=await fetch(base+'/');assert.equal(html.headers.get('content-encoding'),'gzip');assert.equal(await html.text(),'<h1>Release</h1>');
  const gz=await fetch(base+'/NV.json.gz');assert.equal(gz.headers.get('content-encoding'),null);assert.deepEqual(Buffer.from(await gz.arrayBuffer()),shard);
  assert.equal((await fetch(base+'/absent.json')).status,404);
  assert.equal((await fetch(base+'/%2e%2e%2foutside')).status,404);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true});}
});
