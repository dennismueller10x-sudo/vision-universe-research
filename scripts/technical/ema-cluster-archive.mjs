#!/usr/bin/env node
// Existing immutable research store + existing encryption/S3 signatures. No production paths.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSnapshotStore } from '../supertrader/snapshot/store.mjs';
import { sha256, canonicalJson } from '../supertrader/snapshot/contract.mjs';
import { createS3DriverFromEnv, signRequest, uriEncode } from '../market/storage/s3-driver.mjs';
import { encryptForOwner } from '../supertrader/validation/lib.mjs';
export const ORIGINAL = Object.freeze({ artifactId: 14199346700, sourceCommit: '46ca41d0b007c31a1a0a4f9179cc772f40a04b4e',
  artifactSha256: 'a5924195ef4387c6d14e5dc873b219d761baa793d1850f342ca2c04c9d4cf407',
  snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', researchDate: '2026-11-16',
  selectionHash: '1ebfb1d6277e1cb349195d0470c1ad333098d2a68611e4f585e2a137232c4669',
  resultHash: '1b7b7444eac249719928c05f7c65ba5db0326d4c46e3ae8ef751e6daa1fb2a27' });
export async function archiveBytes(store, bytes, expectedSha) {
  if (sha256(bytes) !== expectedSha) throw new Error('ARCHIVE_INPUT_HASH_MISMATCH');
  const ref = await store.putObject(bytes), restored = await store.getObject(ref.sha256);
  if (!restored.equals(bytes)) throw new Error('ARCHIVE_RESTORE_MISMATCH');
  return { sha256: ref.sha256, key: ref.key, bytes: bytes.length, restored: true };
}
// A runner can authorize a byte-identical upload without exporting its permanent S3 secret.
// Each signature binds method, object address and body digest; returned only under existing RSA/AES encryption.
export function objectRequests(env, store, hash, bytes, now = new Date()) {
  if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 64 * 1024 * 1024) throw new Error('INVALID_ARCHIVE_OBJECT');
  const endpoint = new URL(env.VU_HISTORY_S3_ENDPOINT), key = store.objectKey(hash);
  const objectPath = '/' + uriEncode(env.VU_HISTORY_S3_BUCKET, false) + '/' + uriEncode(key, false);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const requests = {};
  for (const method of ['PUT', 'GET']) {
    const payloadHash = method === 'PUT' ? hash : sha256(Buffer.alloc(0));
    const headers = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate,
      ...(method === 'PUT' ? { 'content-length': String(bytes) } : {}) };
    const signed = signRequest({ method, host: endpoint.host, path: objectPath, query: {}, headers, payloadHash,
      accessKeyId: env.VU_HISTORY_S3_ACCESS_KEY_ID, secretAccessKey: env.VU_HISTORY_S3_SECRET_ACCESS_KEY,
      region: env.VU_HISTORY_S3_REGION || 'auto', service: 's3', amzDate });
    requests[method] = { url: endpoint.origin + objectPath, headers: { ...headers, authorization: signed.authorization } };
  }
  return { objectSha256: hash, objectBytes: bytes, requests };
}
async function main() {
  const a = process.argv.slice(2), opt = k => a[a.indexOf(k) + 1], out = path.resolve(opt('--out'));
  const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  if (out === root || out.startsWith(root + path.sep)) throw new Error('ARCHIVE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
  const metadata = JSON.parse(process.env.EMA_ARCHIVE_METADATA || '{}');
  const store = createSnapshotStore({ driver: createS3DriverFromEnv(process.env) });
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const pub = fs.readFileSync(opt('--reviewer-key'), 'utf8');
  if (metadata.phase === 'prepare') {
    const res = await fetch('https://api.github.com/repos/dennismueller10x-sudo/vision-universe-research/actions/artifacts/' + ORIGINAL.artifactId + '/zip',
      { headers: { authorization: 'Bearer ' + process.env.GH_TOKEN, accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('ORIGINAL_ARTIFACT_DOWNLOAD_' + res.status);
    const original = await archiveBytes(store, Buffer.from(await res.arrayBuffer()), ORIGINAL.artifactSha256);
    const request = objectRequests(process.env, store, metadata.packageCipherSha256, metadata.packageCipherBytes);
    const existing = await store.getObject(request.objectSha256).catch(e => {
      if (e.code === 'SOURCE_OBJECT_MISSING') return null; throw e;
    });
    fs.writeFileSync(path.join(out, 'transfer.reviewer.sealed.json'), encryptForOwner(pub, Buffer.from(JSON.stringify({ ...request, alreadyStored: !!existing, original }))), { mode: 0o600 });
    fs.writeFileSync(path.join(out, 'prepare.public.json'), canonicalJson({ ...ORIGINAL, original, packageCipherSha256: request.objectSha256, packageZipSha256: metadata.packageZipSha256 }));
  } else if (metadata.phase === 'confirm') {
    const packageBytes = await store.getObject(metadata.packageCipherSha256);
    if (packageBytes.length !== metadata.packageCipherBytes) throw new Error('PACKAGE_BYTES_MISMATCH');
    const original = await store.getObject(ORIGINAL.artifactSha256);
    const receipt = { role: 'EMA_ARCHIVE', ...ORIGINAL, packageZipSha256: metadata.packageZipSha256,
      packageCipherSha256: metadata.packageCipherSha256, packageCipherBytes: packageBytes.length,
      packageObject: store.objectKey(metadata.packageCipherSha256), originalObject: store.objectKey(ORIGINAL.artifactSha256),
      originalBytes: original.length, verified: 'SHA256_AND_READBACK_EXACT', runId: process.env.GITHUB_RUN_ID || 'local', job: 'portfolio', at: new Date().toISOString() };
    await store.putReceipt(ORIGINAL.snapshotId, receipt);
    const restored = (await store.listReceipts(ORIGINAL.snapshotId)).find(r => r.role === receipt.role && r.runId === receipt.runId);
    if (canonicalJson(restored) !== canonicalJson(receipt)) throw new Error('ARCHIVE_RECEIPT_RESTORE_MISMATCH');
    fs.writeFileSync(path.join(out, 'archive.public.json'), canonicalJson({ ...receipt, receiptSha256: sha256(canonicalJson(receipt)) }));
  } else throw new Error('UNKNOWN_ARCHIVE_PHASE');
  console.log(JSON.stringify({ phase: metadata.phase, archivedOriginal: ORIGINAL.artifactSha256, originalResultHash: ORIGINAL.resultHash }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
