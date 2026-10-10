/* Authenticated read-only CURRENT R2 handoff. No polling, pointer writes or deploy.
   Only the explicit report directory may become a public Actions artifact. */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {sync, prefixFor} from './sync-state.mjs';
import {refreshConfig} from './refresh-approval.mjs';
import {universeContracts} from './universe-contract.mjs';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
const temporary=resolve(arg('--temporary'));mkdirSync(temporary,{recursive:true});
const driver=createS3DriverFromEnv(),key=prefixFor(refreshConfig.stateNamespace)+'index.json';
const read=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
function py(file,args){execFileSync('python3',['scripts/company_intelligence/'+file,...args],{stdio:['ignore','ignore','pipe'],timeout:900000,maxBuffer:1024*1024});}
try{
 const pointer=await driver.get(key);if(!pointer)throw Error('CURRENT_AUTHORITATIVE_POINTER_MISSING');
 const snapshot=join(temporary,'current.tar.gz');const result=await sync(driver,{direction:'pull',namespace:refreshConfig.stateNamespace,file:snapshot});
 const asOf=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 if(result.status!=='RESTORED'||result.sha256!==JSON.parse(pointer).sha256)throw Error('CURRENT_POINTER_RESTORE_MISMATCH');
 for(const suffix of ['first','fresh']){
  const state=join(temporary,suffix+'-state'),out=join(temporary,suffix);
  py('checkpoint.py',['restore','--snapshot',snapshot,'--state',state,'--sha256',result.sha256]);
  py('universe_audit.py',['--state',state,'--identity-root',arg('--identity-root'),'--out',out,'--as-of',asOf]);
 }
 const first=read(join(temporary,'first/audit.json')),fresh=read(join(temporary,'fresh/audit.json'));
 if(JSON.stringify(first.databases)!==JSON.stringify(fresh.databases)||first.generation!==fresh.generation)throw Error('FRESH_UNIVERSE_RESTORE_NOT_DETERMINISTIC');
 const m=read(join(temporary,'first/consumer/manifest.json')),n=read(join(temporary,'fresh/consumer/manifest.json'));
 if(JSON.stringify(m)!==JSON.stringify(n))throw Error('FRESH_UNIVERSE_MANIFEST_MISMATCH');
 for(const [path,meta] of Object.entries(m.assets)){
  const b=readFileSync(join(temporary,'first/consumer',path)),c=readFileSync(join(temporary,'fresh/consumer',path));
  if(sha(b)!==meta.sha256||!b.equals(c))throw Error('FRESH_UNIVERSE_CONSUMER_BYTES_MISMATCH');
 }
 if(!Buffer.from(await driver.get(key)).equals(Buffer.from(pointer)))throw Error('CURRENT_STATE_ADVANCED_DURING_READ_ONLY_AUDIT');
 const evidence=join(temporary,'evidence');mkdirSync(evidence,{recursive:true});
 const contracts=await universeContracts(join(temporary,'first/consumer'));
 const report={...first,r2CheckpointSha256:result.sha256,r2CheckpointBytes:result.bytes,freshRestoreVerified:true,
  allConsumerBytesReproduced:true,consumerContracts:contracts,remoteWrites:0,sourceRequests:0,codeSha:process.env.GITHUB_SHA,event:process.env.GITHUB_EVENT_NAME};
 writeFileSync(join(evidence,'audit.json'),JSON.stringify(report,null,2)+'\n');
 writeFileSync(join(evidence,'eligibility.json'),readFileSync(join(temporary,'first/eligibility.json')));
 writeFileSync(join(evidence,'sample.json'),readFileSync(join(temporary,'first/sample.json')));
 console.log(JSON.stringify({status:'PASS',generation:m.generation,privatePayloads:first.privatePayloadCount,eligibleIssuers:first.eligibleIssuerCount,freshRestoreVerified:true,remoteWrites:0}));
}catch(e){console.error('UNIVERSE_AUDIT_FAILED');if(e.stderr){const stderr=String(e.stderr),c=stderr.match(/(?:ValueError|RuntimeError): ([A-Z0-9_:-]+)/)?.[1],line=[...stderr.matchAll(/File "[^\n]*\/(universe_eligibility\.py|universe_audit\.py|checkpoint\.py)", line (\d+)/g)].at(-1);console.error(c||'PYTHON_'+(stderr.match(/([A-Za-z]+Error):[^\n]*\s*$/)?.[1]||'PROCESS_FAILURE').toUpperCase()+(line?'_L'+line[2]:''));}else if(/^[A-Z0-9_:-]+$/.test(e.message))console.error(e.message);process.exitCode=1;}
