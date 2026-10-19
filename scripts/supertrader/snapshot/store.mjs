// Supertrader — Durable Research Snapshot: unveraenderliche, inhaltsadressierte Ablage.
//
// Der R2-Treiber (scripts/market/storage/s3-driver.mjs) kennt keine Versionierung und kein Loeschen.
// Unveraenderlichkeit entsteht deshalb aus der Adresse: jeder Schluessel enthaelt den SHA-256 seines
// Inhalts. Vor jedem PUT steht ein HEAD; existiert das Objekt, wird es gelesen und verglichen statt
// ueberschrieben. Gleicher Schluessel heisst gleiche Bytes - auch zwei gleichzeitige Schreiber koennen
// nichts Abweichendes hinterlassen. Produktionspfade (v1/...) werden nie beruehrt.
import zlib from 'node:zlib';
import { sha256, canonicalJson, snapshotIdOf, fail, REASON, RETENTION, STORE_PREFIX, SMOKE_PREFIX } from './contract.mjs';

export function createSnapshotStore({ driver, smoke = false, meter = null } = {}) {
  if (!driver) fail(REASON.PRIVATE_DATA_UNAVAILABLE, 'no driver');
  const prefix = smoke ? SMOKE_PREFIX : STORE_PREFIX;
  if (!prefix.startsWith('research-snapshots/')) throw new Error('SNAPSHOT_PREFIX_GUARD');
  const count = (cls, n = 1) => { if (meter) meter[cls] += n; };
  const objectKey = (hash) => `${prefix}/objects/${hash}.bin`;
  const manifestKey = (id) => `${prefix}/manifests/${id}.json.gz`;
  // Review F2: Wiederholungen eines Laufs (gleiche runId) schreiben eigene Belege; der Inhalts-Hash im Schluessel
  // macht jeden Beleg write-once ohne Konflikt.
  const receiptKey = (id, role, runId, job, hash) => `${prefix}/receipts/${id}/${role}-${runId}-${job}-${hash.slice(0, 16)}.json`;

  async function putOnce(key, bytes) {
    count('classB'); const head = await driver.head(key);
    if (head) {
      count('classB'); const existing = await driver.get(key);
      if (!existing || sha256(existing) !== sha256(bytes)) fail(REASON.SNAPSHOT_OBJECT_CONFLICT, key);
      return { key, written: false };
    }
    count('classA'); await driver.put(key, bytes, { contentType: 'application/octet-stream', metadata: { sha256: sha256(bytes) } });
    return { key, written: true };
  }
  async function getVerified(key, expectedSha) {
    count('classB'); const buf = await driver.get(key);
    if (!buf) fail(REASON.SOURCE_OBJECT_MISSING, key);
    if (expectedSha && sha256(buf) !== expectedSha) fail(REASON.OBJECT_HASH_MISMATCH, key);
    return buf;
  }

  return {
    prefix, objectKey, manifestKey, receiptKey,
    async putObject(bytes) { const hash = sha256(bytes); const r = await putOnce(objectKey(hash), bytes); return { ...r, sha256: hash, bytes: bytes.length }; },
    getObject: (hash) => getVerified(objectKey(hash), hash),
    async putManifest(manifest) {
      if (snapshotIdOf(manifest) !== manifest.snapshotId) fail(REASON.MANIFEST_ID_MISMATCH);
      const gz = zlib.gzipSync(Buffer.from(canonicalJson(manifest)), { level: 9 });
      return putOnce(manifestKey(manifest.snapshotId), gz);
    },
    async getManifest(id) {
      count('classB'); const gz = await driver.get(manifestKey(id));
      if (!gz) fail(REASON.SNAPSHOT_NOT_FOUND, id);
      return JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
    },
    async listManifests() { count('classA'); return (await driver.list(`${prefix}/manifests/`)).map((o) => o.key.split('/').pop().replace(/\.json\.gz$/, '')).sort(); },
    async putReceipt(id, receipt) { const b = Buffer.from(canonicalJson(receipt)); return putOnce(receiptKey(id, receipt.role, receipt.runId, receipt.job, sha256(b)), b); },
    async listReceipts(id) {
      count('classA'); const objs = await driver.list(`${prefix}/receipts/${id}/`);
      const out = [];
      for (const o of objs) { count('classB'); const b = await driver.get(o.key); if (b) out.push(JSON.parse(b.toString('utf8'))); }
      return out;
    },
    // Review F7: Generationen UND belegte Bytes (auch verwaiste Objekte abgebrochener Captures) zaehlen.
    async assertRetention(incomingBytes = 0) {
      const ids = await this.listManifests();
      const cap = smoke ? RETENTION.maxSmokeGenerations : RETENTION.maxGenerations;
      if (ids.length >= cap) fail(REASON.SNAPSHOT_RETENTION_CAP_REACHED, `${ids.length} >= ${cap} (${prefix})`);
      count('classA'); const used = (await driver.list(`${prefix}/objects/`)).reduce((a, o) => a + (o.size || 0), 0);
      const byteCap = (smoke ? RETENTION.maxSmokeGenerations : RETENTION.maxGenerations) * RETENTION.maxSnapshotBytes;
      if (used + incomingBytes > byteCap) fail(REASON.SNAPSHOT_RETENTION_CAP_REACHED, `bytes ${used + incomingBytes} > ${byteCap}`);
      return { existing: ids.length, cap, nextGeneration: ids.length + 1, usedBytes: used, byteCap };
    },
  };
}

// Quellobjekte in Shards packen: Bytes hintereinander, Index im Manifest (Schluessel, Shard, Offset, Laenge, SHA-256).
// Reihenfolge nach Schluessel, damit derselbe Inhalt dieselben Shards ergibt.
export function packShards(entries, targetBytes = RETENTION.shardTargetBytes) {
  const sorted = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const shards = [], index = [];
  let cur = [], size = 0;
  const flush = () => { if (!cur.length) return; const buf = Buffer.concat(cur.map((e) => e.bytes)); shards.push({ buf, entries: cur }); cur = []; size = 0; };
  for (const e of sorted) {
    if (e.bytes === null) { index.push({ key: e.key, missing: true }); continue; }
    if (size && size + e.bytes.length > targetBytes) flush();
    cur.push(e); size += e.bytes.length;
  }
  flush();
  shards.forEach((s, si) => { let off = 0; for (const e of s.entries) { index.push({ key: e.key, shard: si, offset: off, length: e.bytes.length, sha256: sha256(e.bytes) }); off += e.bytes.length; } });
  index.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { shards: shards.map((s) => s.buf), index };
}

export function unpackShards(shardBufs, index) {
  const out = new Map();
  for (const e of index) {
    if (e.missing) { out.set(e.key, null); continue; }
    const buf = shardBufs[e.shard];
    if (!buf || e.offset + e.length > buf.length) fail(REASON.SOURCE_OBJECT_MISSING, e.key);
    const b = buf.subarray(e.offset, e.offset + e.length);
    if (sha256(b) !== e.sha256) fail(REASON.OBJECT_HASH_MISMATCH, e.key);
    out.set(e.key, Buffer.from(b));
  }
  return out;
}
