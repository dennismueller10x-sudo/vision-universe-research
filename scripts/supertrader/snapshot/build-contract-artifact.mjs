#!/usr/bin/env node
// Schreibt SUPERTRADER-SNAPSHOT-CONTRACT.json aus dem Code (keine Handpflege). Aufruf: --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import * as K from './contract.mjs';
import { CANONICAL_LOAD, EXTRA_SERIES_KEYS } from './snapshot.mjs';
import { REPLAY } from './replay.mjs';
import { PIT_REPO_FILES } from '../validation/analyze-methods.mjs';

const i = process.argv.indexOf('--out');
const out = process.argv[i + 1];
const doc = {
  schema: 'supertrader-snapshot-contract-1.0.0', ...K.describeContract(),
  inputsFrozen: { tickerList: 'Tiingo supported_tickers.zip (Bytes, einmal je Capture)', repoFiles: PIT_REPO_FILES, r2: 'jedes von loadPitData gelesene Objekt (Reihen tiingo-delisted und tiingo, Validierungs-Manifest, SEC-PIT/-Delisting), 404 als fehlend', extraSeriesKeys: EXTRA_SERIES_KEYS, canonicalLoad: CANONICAL_LOAD, notFrozen: ['Nutzungszaehler der Nullkostenschranke (_usage, Betriebszustand)'] },
  manifest: ['contract', 'snapshotId', 'generation', 'complete', 'smoke', 'asOfDate', 'window', 'capture', 'provenance', 'codec', 'convention', 'code', 'engines', 'universe', 'identity', 'sideObjects', 'objects.shards', 'objects.index', 'dataset', 'replay', 'privacy'],
  immutability: 'Schluessel = SHA-256 des Inhalts; HEAD vor PUT, bestehendes Objekt wird gelesen und verglichen, nie ueberschrieben (SNAPSHOT_OBJECT_CONFLICT); Manifest-ID = Hash des Manifests; neue Quellen = neue Generation',
  lifecycle: ['capture (ein Job): lesen, aufzeichnen, Kostenschranke, schreiben, zuruecklesen, Manifest, CAPTURE-Beleg', 'restore (unabhaengige Jobs nach Ende des Captures): jedes Byte pruefen, Datensatz neu bauen, Kontroll-Backtest, RESTORE-Beleg', 'compare: alle Konsumenten identisch, sonst PARALLEL_INPUT_DIVERGENCE', 'Konsument (analyze-methods --snapshot): verlangt unabhaengigen RESTORE-Beleg'],
  failClosed: { SNAPSHOT_INCOMPLETE: 'Snapshot unvollstaendig', SOURCE_OBJECT_MISSING: 'Source-Object fehlt', DATASET_FINGERPRINT_MISMATCH: 'Dataset-Fingerprint weicht ab', TICKER_LIST_NOT_IN_SNAPSHOT: 'Tickerliste gehoert nicht zum Snapshot', AS_OF_DATE_MISMATCH: 'Stichtag unterschiedlich', CORPORATE_ACTION_CONVENTION_MISMATCH: 'Corporate-Action-Konvention weicht ab', PRIVATE_DATA_UNAVAILABLE: 'private Daten nicht verfuegbar', SNAPSHOT_NOT_RESTORABLE: 'nicht unabhaengig wiederhergestellt', OBJECT_HASH_MISMATCH: 'Bytes veraendert', MANIFEST_ID_MISMATCH: 'Manifest manipuliert', REPLAY_FINGERPRINT_MISMATCH: 'Kontroll-Backtest weicht ab', PARALLEL_INPUT_DIVERGENCE: 'parallele Jobs sahen verschiedene Eingaben' },
  replay: REPLAY,
  storage: { backend: 'bestehender privater R2-Eimer (VU_HISTORY_S3_*), bestehender Treiber scripts/market/storage/s3-driver.mjs (nur GET/PUT/HEAD/LIST)', prefix: K.STORE_PREFIX, smokePrefix: K.SMOKE_PREFIX, productionPrefixesTouched: false, versioning: 'nicht noetig (Inhaltsadressierung); Treiber verbietet Versionierung', deletion: 'nicht moeglich (Treiber); Aufraeumen = Owner-Entscheidung', encryption: 'Zugriffsschutz des privaten Eimers (wie der bestehende Rohdatenspeicher); keine zusaetzliche Umschlagverschluesselung, da Konsumenten-Jobs lesen muessen und kein Schluessel-Secret existiert', publicOutputs: 'nur Hashes, Zaehlungen, Reason Codes; Fehlerdetails mit Objektschluesseln nur als Hash' },
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'SUPERTRADER-SNAPSHOT-CONTRACT.json'), JSON.stringify(doc, null, 1) + '\n');
console.log('ok');
