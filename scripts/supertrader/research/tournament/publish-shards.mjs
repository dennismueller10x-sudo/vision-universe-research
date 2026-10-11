/** Portable private-shard I/O adapter; no measurement or publication by default. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {constants as bufferConstants} from 'node:buffer';
import {fileURLToPath} from 'node:url';
import {assembleShards} from './assemble.mjs';
import {assertFreeze} from './freeze.mjs';
import {publishPayload} from './publish-report.mjs';

const MANIFEST_LIMIT = 1024 * 1024;
const REVIEW_LIMIT = 64 * 1024 * 1024;
const SHARD_LIMIT = bufferConstants.MAX_STRING_LENGTH;

function readBounded(file, maximum) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maximum) throw new Error('INPUT_FILE_EXCEEDS_BOUNDED_READ');
    const bytes = fs.readFileSync(descriptor);
    if (bytes.length > maximum) throw new Error('INPUT_FILE_EXCEEDS_BOUNDED_READ');
    return bytes;
  } finally {fs.closeSync(descriptor);}
}

function manifestEntry(entry) {
  if (!entry || Array.isArray(entry) || typeof entry.path !== 'string' || !entry.path.trim() ||
      typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error('HASHED_SHARD_MANIFEST_ENTRY_REQUIRED');
  }
  return entry;
}

export function loadShardPayload(manifestPath, {assemble = assembleShards, validateFreeze = assertFreeze} = {}) {
  if (!manifestPath) throw new Error('MANIFEST_PATH_REQUIRED');
  const reference = path.resolve(manifestPath);
  const manifest = JSON.parse(readBounded(reference, MANIFEST_LIMIT).toString('utf8'));
  const historical = manifest?.historicalShards ?? manifest?.shards;
  const current = manifest?.currentShard ?? manifest?.current;
  if (!Array.isArray(historical) || !historical.length || !current) throw new Error('FULL_HASHED_SHARD_MANIFEST_REQUIRED');
  // Validate all entries before opening any shard. Relative paths are manifest-relative.
  const entries = [...historical, current].map(manifestEntry);
  const readVerified = entry => {
    const file = path.resolve(path.dirname(reference), entry.path);
    const bytes = readBounded(file, SHARD_LIMIT);
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== entry.sha256) throw new Error('INPUT_SHARD_BYTEHASH_MISMATCH');
    return JSON.parse(bytes.toString('utf8'));
  };
  const shards = entries.slice(0, -1).map(readVerified);
  const currentShard = readVerified(entries.at(-1));
  const payload = assemble(shards, currentShard);
  validateFreeze(payload.freeze);
  return payload;
}

export function publishShardManifest({manifestPath, reviewPath, outRoot, ownersealedPath,
  privateReportPath = null, publish = false}, dependencies = {}) {
  if (!manifestPath || !reviewPath || !outRoot) throw new Error('MANIFEST_REVIEW_OUTROOT_REQUIRED');
  const payload = loadShardPayload(manifestPath, dependencies);
  const review = JSON.parse(readBounded(reviewPath, REVIEW_LIMIT).toString('utf8'));
  return (dependencies.publisher ?? publishPayload)({payload, review, outRoot, ownersealedPath,
    privateReportPath, publish, inputReference: path.resolve(manifestPath), reviewReference: path.resolve(reviewPath)});
}

function flags(argv) {
  const values = {}, names = new Set(['manifest', 'review', 'outRoot', 'ownersealedPath', 'privateReportPath']);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--publish') {values.publish = true; continue;}
    const name = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !names.has(name) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('INVALID_CLI_ARGUMENT');
    if (Object.hasOwn(values, name)) throw new Error('DUPLICATE_CLI_ARGUMENT');
    values[name] = argv[++i];
  }
  return {manifestPath: values.manifest, reviewPath: values.review, outRoot: values.outRoot,
    ownersealedPath: values.ownersealedPath, privateReportPath: values.privateReportPath, publish: values.publish === true};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write('node --max-old-space-size=8192 publish-shards.mjs --manifest HASHED_SHARD_MANIFEST --review FINAL_REVIEW --outRoot REPO [--ownersealedPath OWNER] [--privateReportPath PRIVATE] [--publish]\nDefault: dry run; no output files written.\n');
  } else {
    try {process.stdout.write(JSON.stringify(publishShardManifest(flags(process.argv.slice(2)))) + '\n');}
    catch {process.stderr.write('PUBLICATION_FAILED\n'); process.exitCode = 1;}
  }
}
