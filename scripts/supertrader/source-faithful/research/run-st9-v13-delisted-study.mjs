#!/usr/bin/env node
/**
 * Supertrader 9 – runner of the isolated V13 delisted reuse study (st9-v13-delisted-study.mjs). Research only; reads
 * the frozen research snapshot (universe A) and the private V13 archive (weekly series + decrypted daily fetch),
 * writes ONLY to --out, which must lie outside the repository. No network fetch of prices; the snapshot is read from
 * the existing private store exactly as run-sf6-integrity.mjs does.
 *
 *   node scripts/supertrader/source-faithful/research/run-st9-v13-delisted-study.mjs --snapshot sts1-<id> \
 *     --accounting research-v1 --v13-series <v13-private>/series --v13-raw <v13-private>/raw --out <dir outside repo> \
 *     [--quarantine DQ-K5-BOOK | CA-Q-K5-DATES --quarantine-dates <sealed list.json>] [--methods KEY,KEY] [--write-plain]
 *
 * Outputs: st9-v13-delisted.public.json (counts and hashes only), st9-v13-delisted.sealed.json (everything, encrypted
 * to the owner key validation/results-public-key.pem) and with --write-plain st9-v13-delisted.private.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import * as S from './st9-v13-delisted-study.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const REGISTRATION_FILE = 'scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json';
/** Pinned before any V13 chain entered a Supertrader run (tests hold it). */
export const REGISTRATION_SHA256 = '548b8079fc9b6e0c80df236fb184fefac257d6d74b18fb42a832b1d7862136bc';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz'; // same input construction as run-sf6-integrity.mjs
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function studyCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of S.STUDY_FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
export function verifyRegistration(root = ROOT) {
  const b = fs.readFileSync(path.join(root, REGISTRATION_FILE));
  if (sha(b) !== REGISTRATION_SHA256) throw new S.StudyError('REGISTRATION_HASH_MISMATCH');
  return sha(b);
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const die = (code, n = 2) => { console.error(code); process.exit(n); };
  if (arg('--accounting') !== 'research-v1') die('RESEARCH_ACCOUNTING_REQUIRED');
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) die('SNAPSHOT_REQUIRED');
  let OUT, params, registrationSha256, v13, dates = null;
  try {
    OUT = S.assertOutsideRepo(arg('--out'), ROOT);
    registrationSha256 = verifyRegistration();
    const quarantine = arg('--quarantine', 'DQ-K5-BOOK');
    params = S.studyParameters({ methods: arg('--methods', S.STUDY_METHODS.join(',')).split(','), quarantine });
    if (quarantine === 'CA-Q-K5-DATES') dates = S.readQuarantineDates(arg('--quarantine-dates'));
    v13 = S.loadV13Additions({ root: ROOT, seriesDir: arg('--v13-series'), rawDir: arg('--v13-raw') });
  } catch (e) { die(e instanceof S.StudyError ? `STUDY_INPUT_REFUSED: ${e.code}` : `STUDY_INPUT_REFUSED: UNEXPECTED ${e?.message ?? e}`, 3); }
  const t0 = Date.now(), log = (m) => console.log(`[st9-v13 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  log(`V13 chains bound (weekly + daily): ${v13.chains.length}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, secPit, verification;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: false }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, bytesVerified: opened.verified.bytes };
    const buf = await (await opened.io.createDriver()).get(pit.mine.seriesPrefix + SEC_PIT_KEY);
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
  } catch (e) {
    die(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`, 3);
  }
  const dsA = datasetFromPit(pit); attachSecPit(dsA, secPit);
  // CIK of A listings from sec-pit r12 (when present) for the issuer-interval dedupe
  const aCik = new Map(Object.entries(secPit).filter(([, f]) => f && f.cik).map(([k, f]) => [k, String(Number(f.cik))]));
  const chains = v13.chains.map((c) => ({ ...c, cik: String(Number(c.cik)) }));
  const { dsB, addedIds, census } = S.buildUniverseB(dsA, chains, { calendarDates: pit.spyRaw.map((b) => b.date), aCikByListing: aCik });
  log(`universe B: +${census.added} chains (${census.addedSecurities} securities), excluded ${JSON.stringify(census.excluded)}`);
  const result = S.runStudy({ dsA, dsB, addedIds, params, datesBySegment: dates?.map ?? null, log });
  const receipt = { schema: 'st9-v13-delisted-receipt-1.0.0', snapshotId, datasetSha256, ...verification, registrationSha256, studyCodeSha256: studyCodeSha256(), engineCodeSha256: engineCodeSha256(), quarantineDatesSha256: dates?.sha256 ?? null, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, window: L.WINDOW_NAME };
  const pub = S.publicPart(result, { census, provenance: v13.provenance, receipt });
  const full = { receipt, public: pub, universeB: census, v13: v13.provenance, result };
  fs.mkdirSync(OUT, { recursive: true });
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'st9-v13-delisted.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify(full))));
  fs.writeFileSync(path.join(OUT, 'st9-v13-delisted.public.json'), JSON.stringify(pub, null, 1) + '\n');
  if (argv.includes('--write-plain')) fs.writeFileSync(path.join(OUT, 'st9-v13-delisted.private.json'), JSON.stringify(full, null, 1) + '\n');
  log('done');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
