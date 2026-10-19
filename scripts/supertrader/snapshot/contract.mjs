// Supertrader — Durable Research Snapshot: Vertrag, Reason Codes, Fingerabdruecke.
//
// Ein Snapshot friert ALLE Eingaben eines Research-Backtests ein, die validation/analyze-methods.mjs
// loadPitData liest: Tiingo-Tickerliste (Bytes), Repository-Eingabedateien (Universum, Eignung,
// Firmennamen), die R2-Quellobjekte (Kursreihen, Validierungs-Manifest, SEC-PIT) - bytegleich, je Objekt
// mit SHA-256. Die Snapshot-ID ist der Inhalts-Hash des Manifests: unveraenderlich und eindeutig.
// Eine spaetere Aenderung der Quellen ist eine NEUE Generation, nie eine Aenderung eines Snapshots.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRACT_VERSION = 'supertrader-research-snapshot-1.0.0';
export const ID_PREFIX = 'sts1-';
// Eigener Praefix ausserhalb der Produktionsdaten (v1/<provider>/...). Nur PUT/GET/HEAD/LIST, nie DELETE.
export const STORE_PREFIX = 'research-snapshots/supertrader/sts1';
export const SMOKE_PREFIX = 'research-snapshots/supertrader/sts1-smoke';
// Kostenschranke vor Aktivierung: hoechstens so viele Generationen je Ablage und so viele Bytes je Snapshot.
// Loeschen erlaubt der Treiber nicht (Zero-Cost-Haertung); das Aufraeumen ist eine Owner-Entscheidung.
export const RETENTION = Object.freeze({ maxGenerations: 3, maxSmokeGenerations: 3, maxSnapshotBytes: 3e9, shardTargetBytes: 16 * 1024 * 1024 });

export const REASON = Object.freeze({
  INPUT_INTEGRITY_FAILURE: 'INPUT_INTEGRITY_FAILURE',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  SNAPSHOT_INCOMPLETE: 'SNAPSHOT_INCOMPLETE',
  SOURCE_OBJECT_MISSING: 'SOURCE_OBJECT_MISSING',
  OBJECT_HASH_MISMATCH: 'OBJECT_HASH_MISMATCH',
  MANIFEST_ID_MISMATCH: 'MANIFEST_ID_MISMATCH',
  CONTRACT_VERSION_MISMATCH: 'CONTRACT_VERSION_MISMATCH',
  DATASET_FINGERPRINT_MISMATCH: 'DATASET_FINGERPRINT_MISMATCH',
  REPLAY_FINGERPRINT_MISMATCH: 'REPLAY_FINGERPRINT_MISMATCH',
  TICKER_LIST_NOT_IN_SNAPSHOT: 'TICKER_LIST_NOT_IN_SNAPSHOT',
  AS_OF_DATE_MISMATCH: 'AS_OF_DATE_MISMATCH',
  WINDOW_MISMATCH: 'WINDOW_MISMATCH',
  CORPORATE_ACTION_CONVENTION_MISMATCH: 'CORPORATE_ACTION_CONVENTION_MISMATCH',
  PRIVATE_DATA_UNAVAILABLE: 'PRIVATE_DATA_UNAVAILABLE',
  SNAPSHOT_NOT_RESTORABLE: 'SNAPSHOT_NOT_RESTORABLE',
  SNAPSHOT_READ_ONLY: 'SNAPSHOT_READ_ONLY',
  SNAPSHOT_OBJECT_CONFLICT: 'SNAPSHOT_OBJECT_CONFLICT',
  SNAPSHOT_RETENTION_CAP_REACHED: 'SNAPSHOT_RETENTION_CAP_REACHED',
  SNAPSHOT_SIZE_CAP_EXCEEDED: 'SNAPSHOT_SIZE_CAP_EXCEEDED',
  ZERO_COST_GUARD_BLOCKED: 'ZERO_COST_GUARD_BLOCKED',
  PARALLEL_INPUT_DIVERGENCE: 'PARALLEL_INPUT_DIVERGENCE',
});

export class SnapshotError extends Error {
  constructor(code, detail = '') {
    super(`${REASON.INPUT_INTEGRITY_FAILURE}:${code}${detail ? ' ' + detail : ''}`);
    this.code = code; this.umbrella = REASON.INPUT_INTEGRITY_FAILURE; this.detail = detail;
  }
}
export const fail = (code, detail) => { throw new SnapshotError(code, detail); };

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Kanonisches JSON: Schluessel sortiert, keine Leerzeichen. Grundlage aller Hashes.
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
}

export function snapshotIdOf(body) {
  const { snapshotId, ...rest } = body; void snapshotId;
  return ID_PREFIX + sha256(canonicalJson(rest)).slice(0, 32);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// Adjustment-Konvention: Quelltext der Funktionen, die aus Rohkerzen Split-/TR-Reihen machen, plus Segment-
// und Codec-Regeln. Aendert sich einer davon, ist ein alter Snapshot fuer diese Rechnung nicht mehr gueltig.
export const CONVENTION_FILES = Object.freeze(['scripts/supertrader/validation/lib.mjs', 'quant/engines/bar-codec.js', 'quant/engines/history-store.js']);
export async function conventionFingerprint() {
  const L = await import('../validation/lib.mjs');
  const parts = { adjustSeries: L.adjustSeries.toString(), splitSegments: L.splitSegments.toString(), maxGapDays: L.MAX_GAP_DAYS, buildListingTable: L.buildListingTable.toString(), tableHash: L.tableHash.toString(), parseTickerCsv: L.parseTickerCsv.toString() };
  return { id: 'VU_SUPERTRADER_VALIDATION_ADJUSTMENT', basis: 'validation/lib.mjs adjustSeries (Split-Divisor = Produkt der splitFactor nach t; TR = (close+div)*split/prevClose-1)', sha256: sha256(canonicalJson(parts)) };
}
// Code-/Engine-Version: Hash der Dateien, die den Datensatz und den Replay bestimmen.
export const CODE_FILES = Object.freeze([...CONVENTION_FILES, 'scripts/supertrader/validation/analyze-methods.mjs', 'scripts/supertrader/validation/portfolio.mjs', 'scripts/supertrader/validation/accounting-contract.mjs', 'scripts/supertrader/engine/simulator.mjs', 'scripts/supertrader/engine/strategies/donchian.mjs', 'scripts/supertrader/snapshot/contract.mjs', 'scripts/supertrader/snapshot/io.mjs', 'scripts/supertrader/snapshot/store.mjs', 'scripts/supertrader/snapshot/replay.mjs']);
export function codeFingerprint() {
  const files = Object.fromEntries(CODE_FILES.map((f) => [f, fs.existsSync(path.join(root, f)) ? sha256(fs.readFileSync(path.join(root, f))) : null]));
  return { files, sha256: sha256(canonicalJson(files)) };
}

// Pruefungen eines geladenen Manifests gegen die Erwartung des Konsumenten. Wirft beim ersten Verstoss.
export function checkManifest(manifest, expect = {}) {
  if (!manifest) fail(REASON.SNAPSHOT_NOT_FOUND);
  if (manifest.contract !== CONTRACT_VERSION) fail(REASON.CONTRACT_VERSION_MISMATCH, String(manifest.contract));
  if (snapshotIdOf(manifest) !== manifest.snapshotId) fail(REASON.MANIFEST_ID_MISMATCH);
  if (expect.snapshotId && expect.snapshotId !== manifest.snapshotId) fail(REASON.MANIFEST_ID_MISMATCH, 'requested ' + expect.snapshotId);
  if (manifest.complete !== true) fail(REASON.SNAPSHOT_INCOMPLETE);
  if (expect.asOfDate && expect.asOfDate !== manifest.asOfDate) fail(REASON.AS_OF_DATE_MISMATCH, `${expect.asOfDate} != ${manifest.asOfDate}`);
  if (expect.window && canonicalJson(expect.window) !== canonicalJson(manifest.window)) fail(REASON.WINDOW_MISMATCH);
  if (expect.convention && expect.convention.sha256 !== manifest.convention.sha256) fail(REASON.CORPORATE_ACTION_CONVENTION_MISMATCH);
  if (expect.tickerListSha256 && expect.tickerListSha256 !== manifest.universe.tickerListSha256) fail(REASON.TICKER_LIST_NOT_IN_SNAPSHOT);
  if (expect.codec && expect.codec !== manifest.codec) fail(REASON.CORPORATE_ACTION_CONVENTION_MISMATCH, 'codec');
  return true;
}

export function describeContract() {
  return {
    contract: CONTRACT_VERSION, idScheme: ID_PREFIX + 'sha256(canonicalJson(manifest ohne snapshotId))[0:32]', storePrefix: STORE_PREFIX, smokePrefix: SMOKE_PREFIX, retention: RETENTION,
    reasonCodes: Object.values(REASON),
    components: ['fixe Ticker-Liste (Bytes)', 'fixes As-of-Date', 'Source-Object-Manifest (Schluessel, SHA-256, Laenge)', 'Listing-IDs und securityIds', 'kanonischer Datensatz (Fingerabdruck)', 'Corporate-Action-Metadaten (Zaehlungen)', 'Adjustment-Konvention (Hash)', 'Input-Hashes', 'Contract-Version', 'Code-/Engine-Version', 'Capture-Provenienz', 'Integrity-Receipts'],
  };
}
