/* Isolated checkpoint bridge. Reuses production's tested storage drivers.
   Two bounded slots, pointer written last, full read-back hash verification.
   One workflow concurrency group serializes ALL branch writers. No deployment. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createS3DriverFromEnv } from '../market/storage/s3-driver.mjs';
import { createFsDriver } from '../market/storage/fs-driver.mjs';
const MAX = 128 * 1024 * 1024;
const hash = b => createHash('sha256').update(b).digest('hex');

export function prefixFor(namespace) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace || '')) throw new Error('INVALID_STATE_NAMESPACE');
  return `v1/company-intelligence/state/${namespace}/`;
}
export function safeFailureCode(error) {
  const known = new Set(['INVALID_STATE_NAMESPACE','INVALID_REMOTE_CHECKPOINT','REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED',
    'REMOTE_STATE_CORRUPT','INVALID_SYNC_DIRECTION','CHECKPOINT_STORAGE_BUDGET_EXCEEDED',
    'CHECKPOINT_UPLOAD_VERIFICATION_FAILED','CHECKPOINT_POINTER_VERIFICATION_FAILED','MISSING_SYNC_ARGUMENT']);
  if (known.has(error?.message)) return error.message;
  if (error?.$metadata?.httpStatusCode === 403 || error?.name === 'AccessDenied') return 'PRIVATE_STATE_READ_ACCESS_DENIED';
  if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey') return 'PRIVATE_STATE_OBJECT_NOT_FOUND';
  if (error?.name === 'CredentialsProviderError') return 'PRIVATE_STATE_CREDENTIALS_UNAVAILABLE';
  return 'PRIVATE_STATE_STORAGE_REQUEST_FAILED'; // Never echo SDK messages, URLs, headers or keys.
}
function validate(meta) {
  if (!meta || meta.schema !== 1 || ![0, 1].includes(meta.slot) || !/^[a-f0-9]{64}$/.test(meta.sha256) || !Number.isSafeInteger(meta.bytes) || meta.bytes <= 0 || meta.bytes > MAX) throw new Error('INVALID_REMOTE_CHECKPOINT');
  return meta;
}
export async function sync(driver, {direction, namespace, file, initialize = false}) {
  let operations = 0;
  const underlying = driver;
  driver = Object.fromEntries(['get', 'head', 'put'].map(method => [method, async (...args) => { operations++; return underlying[method](...args); }]));
  const prefix = prefixFor(namespace), key = prefix + 'index.json';
  const indexBytes = await driver.get(key); // 403/timeout is NEVER an empty ledger.
  let prior = indexBytes ? validate(JSON.parse(indexBytes)) : null;
  if (direction === 'pull') {
    if (!prior) {
      if (!initialize) throw new Error('REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED');
      return {status: 'INITIALIZE', operations};
    }
    for (const meta of [prior, prior.previous].filter(Boolean)) {
      validate(meta);
      const head = await driver.head(prefix + `snapshot-${meta.slot}.tar.gz`);
      if (!head || head.size !== meta.bytes) continue;
      const bytes = await driver.get(prefix + `snapshot-${meta.slot}.tar.gz`);
      if (bytes?.length === meta.bytes && hash(bytes) === meta.sha256) {
        writeFileSync(file, bytes);
        return {status: meta === prior ? 'RESTORED' : 'RECOVERED_PREVIOUS', sha256: meta.sha256, bytes: meta.bytes, operations};
      }
    }
    throw new Error('REMOTE_STATE_CORRUPT');
  }
  if (direction !== 'push') throw new Error('INVALID_SYNC_DIRECTION');
  if (!prior && !initialize) throw new Error('REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED');
  if (prior) {
    const candidates = [prior, prior.previous].filter(Boolean);
    let intact = null;
    for (const meta of candidates) {
      validate(meta);
      const head = await driver.head(prefix + `snapshot-${meta.slot}.tar.gz`);
      if (head?.size !== meta.bytes) continue;
      const retained = await driver.get(prefix + `snapshot-${meta.slot}.tar.gz`);
      if (retained?.length === meta.bytes && hash(retained) === meta.sha256) { intact = meta; break; }
    }
    if (!intact) throw new Error('REMOTE_STATE_CORRUPT');
    prior = intact; // Never overwrite the only intact slot after recovery.
  }
  if (statSync(file).size <= 0 || statSync(file).size > MAX) throw new Error('CHECKPOINT_STORAGE_BUDGET_EXCEEDED');
  const bytes = readFileSync(file), digest = hash(bytes), slot = prior ? 1 - prior.slot : 0;
  if (prior?.sha256 === digest) return {status: 'UNCHANGED', operations};
  await driver.put(prefix + `snapshot-${slot}.tar.gz`, bytes);
  const verified = await driver.get(prefix + `snapshot-${slot}.tar.gz`);
  if (!verified || hash(verified) !== digest) throw new Error('CHECKPOINT_UPLOAD_VERIFICATION_FAILED');
  const current = {schema: 1, slot, bytes: bytes.length, sha256: digest, updatedAt: new Date().toISOString(), previous: prior ? {schema: 1, slot: prior.slot, bytes: prior.bytes, sha256: prior.sha256} : null};
  await driver.put(key, Buffer.from(JSON.stringify(current)));
  const check = JSON.parse(await driver.get(key));
  if (check.sha256 !== digest) throw new Error('CHECKPOINT_POINTER_VERIFICATION_FAILED');
  return {status: 'PRESERVED', sha256: digest, bytes: bytes.length, operations};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('MISSING_SYNC_ARGUMENT'); return args[i + 1]; };
  const driver = args.includes('--local-root') ? createFsDriver(arg('--local-root')) : createS3DriverFromEnv();
  try { console.log(JSON.stringify(await sync(driver, {direction: args[0], namespace: arg('--namespace'), file: arg('--file'), initialize: args.includes('--initialize')}))); }
  catch (error) { console.error('INTELLIGENCE_STATE_SYNC_FAILED: ' + safeFailureCode(error)); process.exitCode = 1; }
}
