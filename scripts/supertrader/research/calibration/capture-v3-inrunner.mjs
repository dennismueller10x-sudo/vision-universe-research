/**
 * V3 canonical capture inside the protected Actions runner.
 *
 * Rebuilds the canonical dataset from the read-only history store with the
 * unchanged `collectDataInventory` data contract, writes the plaintext only to a
 * private directory outside the repository, verifies it by re-reading every file
 * and prints/writes a public receipt (counts, hashes, rejection codes). No
 * encryption keys, no security identities, no performance.
 *
 * The capture timestamp is provenance. It is reported separately and is not part
 * of any claim that this capture equals an earlier one.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {collectDataInventory} from '../certification/data-inventory.mjs';
import {iterateCanonicalSecurities,loadCanonicalManifest,loadCanonicalData} from '../certification/canonical-input.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const demand=(ok,code)=>{if(!ok)throw new Error(code);};
export const CAPTURE_V3_SCHEMA='vision-universe-calibration-v3-inrunner-capture-receipt-1.0.0';
const CHUNK_BYTES=8*1024*1024;

function privateDirectory(out){
 const d=path.resolve(out);
 demand(d!==ROOT&&!d.startsWith(ROOT+path.sep),'PRIVATE_CAPTURE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
 fs.mkdirSync(d,{recursive:true,mode:0o700});fs.chmodSync(d,0o700);
 demand(fs.readdirSync(d).length===0,'PRIVATE_CAPTURE_OUTPUT_MUST_BE_EMPTY');
 return d;
}
const setHash=rows=>sha(Buffer.from(rows.slice().sort().join('\n')));

/** Writes plaintext parts exactly as the sealed writer chunks them (same bounded chunking, no truncation). */
export function writePlaintextCanonical(result,dest){
 const data=result.canonicalData;
 demand(data?.state==='AVAILABLE','CANONICAL_STATE_NOT_AVAILABLE');
 const parts=[];let batch=[],batchBytes=0;
 const flush=()=>{
  if(!batch.length)return;
  const stem=`canonical-dataset-part-${String(parts.length).padStart(4,'0')}`;
  const bytes=Buffer.from('{"schema":"supertrader-private-canonical-dataset-part-1.0.0","securities":['+batch.join(',')+']}');
  fs.writeFileSync(path.join(dest,stem+'.json'),bytes,{mode:0o600,flag:'wx'});
  parts.push({stem,sha256:sha(bytes),plaintextBytes:bytes.length,securities:batch.length});batch=[];batchBytes=0;
 };
 for(const security of data.securities){
  const encoded=JSON.stringify(security),bytes=Buffer.byteLength(encoded);
  demand(bytes<=64*1024*1024,'CANONICAL_SECURITY_OBJECT_TOO_LARGE');
  if(batch.length&&batchBytes+bytes>CHUNK_BYTES)flush();
  batch.push(encoded);batchBytes+=bytes+1;
 }
 flush();
 const manifest=Buffer.from(JSON.stringify({schema:'supertrader-private-canonical-dataset-manifest-1.0.0',state:data.state,window:data.window,fingerprint:data.fingerprint,coverage:data.coverage,limitations:data.limitations,benchmark:data.benchmark,calendar:data.calendar,securities:data.securities.length,parts:parts.map(({stem,sha256,plaintextBytes,securities})=>({stem,sha256,plaintextBytes,securities})),barHistoryTruncated:false,canonicalCoreReused:true,performanceCalculated:false}));
 fs.writeFileSync(path.join(dest,'canonical-dataset-manifest.json'),manifest,{mode:0o600,flag:'wx'});
 const inputs=Buffer.from(JSON.stringify(result.privateInput));
 fs.writeFileSync(path.join(dest,'data-certification-inputs.json'),inputs,{mode:0o600,flag:'wx'});
 return {parts,manifest,inputs};
}

/** Re-reads everything from disk. Throws a bounded code on the first violation. */
export async function verifyPlaintextCanonical(dest,written,result){
 const m=loadCanonicalManifest(dest);
 demand(m.parts.length===written.parts.length,'VERIFY_PART_COUNT_MISMATCH');
 demand(sha(fs.readFileSync(path.join(dest,'canonical-dataset-manifest.json')))===sha(written.manifest),'VERIFY_MANIFEST_HASH_MISMATCH');
 demand(sha(fs.readFileSync(path.join(dest,'data-certification-inputs.json')))===sha(written.inputs),'VERIFY_INPUTS_HASH_MISMATCH');
 let total=0;const ids=new Set();
 for(const s of iterateCanonicalSecurities(dest,{verify:true})){total++;demand(typeof s.id==='string'&&!ids.has(s.id),'VERIFY_DUPLICATE_OR_MISSING_SECURITY_ID');ids.add(s.id);}
 demand(total===m.securities&&total===written.parts.reduce((s,p)=>s+p.securities,0),'VERIFY_SECURITY_COUNT_MISMATCH');
 demand(total===(result.canonicalData.coverage?.usableSegments??-1),'VERIFY_USABLE_SEGMENT_COUNT_MISMATCH');
 const loaded=await loadCanonicalData(dest,{sourceProvenanceOverlay:true,expectedSourceMetadataSha256:sha(written.inputs)});
 demand(loaded.securities.length===total,'VERIFY_LOADER_COUNT_MISMATCH');
 const overlay=loaded.sourceProvenanceOverlay?.counts??{};
 return {securities:total,overlayCounts:overlay};
}

export async function captureV3({out,publicOut,factDocLimit=4,collect=collectDataInventory,options={}}){
 const dest=privateDirectory(out);
 const result=await collect({canonical:true,factDocLimit,...options});
 demand(result.canonicalData?.state==='AVAILABLE','CANONICAL_CAPTURE_NOT_AVAILABLE:'+(result.canonicalData?.state??'NONE'));
 const written=writePlaintextCanonical(result,dest);
 const verified=await verifyPlaintextCanonical(dest,written,result);
 const status=result.publicStatus,private_=result.privateInput;
 const receipt={
  schema:CAPTURE_V3_SCHEMA,
  status:'V3_CANONICAL_CAPTURE_VERIFIED_IN_RUNNER',
  claim:'NEW_AUTHORIZED_CAPTURE_FROM_VU_HISTORY_STORE; EARLIER_ENCRYPTED_500_PART_CAPTURE_NOT_DECRYPTED_OR_COMPARED',
  provenance:{capturedAt:private_.observedAt,workflowRunId:process.env.GITHUB_RUN_ID||null,codeCommit:process.env.GITHUB_SHA||null,timestampIsPartOfContentClaim:false},
  contract:{dataInventorySha256:sha(fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/certification/data-inventory.mjs'))),canonicalInputSha256:sha(fs.readFileSync(path.join(ROOT,'scripts/supertrader/research/certification/canonical-input.mjs'))),captureRunnerSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),chunkBytes:CHUNK_BYTES,factDocLimit},
  inputs:{
   manifestSha256:sha(written.manifest),manifestBytes:written.manifest.length,
   sourceMetadataSha256:sha(written.inputs),sourceMetadataBytes:written.inputs.length,
   dataFingerprint:result.canonicalData.fingerprint,
   parts:written.parts.map(({stem,sha256,plaintextBytes,securities})=>({stem,sha256,plaintextBytes,securities})),
   sourceObjectSetSha256:setHash((private_.sourceObjects||[]).map(o=>`${o.key}|${o.status}|${o.sha256}`)),
   readReceiptSetSha256:setHash((private_.readReceipts||[]).map(o=>`${o.sourceKey}|${o.sha256}`)),
   sourceObjects:{available:(private_.sourceObjects||[]).filter(o=>o.status==='AVAILABLE').length,missing:(private_.sourceObjects||[]).filter(o=>o.status==='MISSING').length},
   readReceipts:(private_.readReceipts||[]).length
  },
  counts:{inputSegments:status.canonicalCounts?.inputSegments,usableSegments:status.canonicalCounts?.usableSegments,parts:written.parts.length,verifiedSecurities:verified.securities,providerSupportedListingRecords:status.counts?.providerSupportedListingRecords,observedListingGenerations:status.counts?.observedListingGenerations,readOnlyGetCalls:status.counts?.readOnlyGetCalls,writeCalls:status.counts?.writeCalls},
  rejections:status.canonicalRejections??null,
  overlay:verified.overlayCounts,
  verification:{rereadFromDisk:true,perPartHashesMatchManifest:true,uniqueSecurityIds:true,partsSumEqualsUsableSegments:true,loaderWithSourceOverlayPassed:true},
  performanceCalculated:false,privateIdentitiesPublished:false,plaintextUploaded:false
 };
 if(publicOut){fs.mkdirSync(path.dirname(path.resolve(publicOut)),{recursive:true});fs.writeFileSync(publicOut,JSON.stringify(receipt,null,2)+'\n');}
 return receipt;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),arg=f=>{const i=a.indexOf(f);return i>=0?a[i+1]:null;};
 try{
  demand(arg('--out')&&arg('--public-out'),'EXPLICIT_OUT_AND_PUBLIC_OUT_REQUIRED');
  const r=await captureV3({out:arg('--out'),publicOut:arg('--public-out')});
  process.stdout.write(JSON.stringify({status:r.status,counts:r.counts,rejections:r.rejections,manifestSha256:r.inputs.manifestSha256,sourceMetadataSha256:r.inputs.sourceMetadataSha256,capturedAt:r.provenance.capturedAt})+'\n');
 }catch(e){
  process.stderr.write(JSON.stringify({status:'V3_CAPTURE_FAILED_CLOSED',code:/^[A-Z0-9_:]+$/.test(e.message)?e.message:'PRIVATE_CAPTURE_FAILURE'})+'\n');process.exitCode=1;
 }
}
