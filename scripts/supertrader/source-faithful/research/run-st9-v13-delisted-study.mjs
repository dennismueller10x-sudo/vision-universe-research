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
 *     [--identity-blocklist <security-master-identity-blocklist.json> --identity-blocklist-sha256 <hex>] [--preflight]
 *     [--repeat-check]
 *
 * Every code file the registration pins is re-hashed before the run (REGISTERED_REFERENCE_CHANGED stops it). After the
 * run each method and universe is audited independently (research/st9-hist-execution.mjs: exits, gap stops at the open,
 * delisting at the last traded close, books); a failed audit marks the public part EXECUTION_AUDIT_FAILED and exits 4.
 * --repeat-check calls S.runStudy a second time IN THE SAME PROCESS on the SAME in-memory datasets dsA / dsB and
 * requires the identical result hash (no seeds are used). It checks the determinism of the method runs, quarantine and
 * evaluation only; loading the snapshot, binding the V13 chains and building B are NOT repeated (receipt
 * repeatCheckScope). A full second run is a second invocation with the same inputFingerprint.
 *
 * sec-pit r12 (_validation/sec-pit-r12.json.gz of the snapshot store) is part of universe A by the registration
 * (attachSecPit, CIK dedupe): a missing or unreadable file stops the run (exit 3, SEC_PIT_MISSING / SEC_PIT_INVALID);
 * its SHA-256 (of the stored bytes) enters the receipt and the inputFingerprint.
 *
 * --preflight checks every input without opening the snapshot and prints { ready, missing[] } (exit 0 ready, 3 not);
 * nothing is computed. The identity blocklist (#1159) is an optional input in FLAG mode only: the registered universes
 * stay unchanged, blocked securityIds are counted (research/st9-hist-universe.mjs).
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
import * as H from './st9-hist-universe.mjs';
import * as X from './st9-hist-execution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const REGISTRATION_FILE = 'scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json';
/** Pinned before any V13 chain entered a Supertrader run (tests hold it). */
export const REGISTRATION_SHA256 = '548b8079fc9b6e0c80df236fb184fefac257d6d74b18fb42a832b1d7862136bc';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz'; // same input construction as run-sf6-integrity.mjs
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const REPEAT_CHECK_SCOPE = 'SAME_PROCESS_SAME_DATASETS_RUNSTUDY_ONLY';

/** sec-pit r12 bytes of the snapshot store -> { secPit, sha256 }; fail closed (never an empty substitute). */
export function readSecPit(buf) {
  if (!buf || !buf.length) throw new S.StudyError('SEC_PIT_MISSING');
  let secPit;
  try { secPit = JSON.parse(zlib.gunzipSync(buf).toString('utf8')); } catch { throw new S.StudyError('SEC_PIT_INVALID'); }
  if (!secPit || typeof secPit !== 'object' || Array.isArray(secPit) || !Object.keys(secPit).length) throw new S.StudyError('SEC_PIT_INVALID');
  return { secPit, sha256: sha(buf) };
}

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

export const S3_ENV = Object.freeze(['VU_HISTORY_S3_ENDPOINT', 'VU_HISTORY_S3_BUCKET', 'VU_HISTORY_S3_ACCESS_KEY_ID', 'VU_HISTORY_S3_SECRET_ACCESS_KEY']);
const argOf = (argv) => (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/**
 * Every input a real run needs, checked without opening the snapshot and without reading a price. Returns
 * { ready, missing: [{ code, detail }] }; secrets are checked by name only (never printed).
 */
export function preflight(argv, { env = process.env, root = ROOT } = {}) {
  const arg = argOf(argv), missing = [], need = (ok, code, detail = null) => { if (!ok) missing.push({ code, detail }); };
  need(arg('--accounting') === 'research-v1', 'RESEARCH_ACCOUNTING_REQUIRED');
  need(/^sts1-[0-9a-f]{32}$/.test(arg('--snapshot') || ''), 'SNAPSHOT_REQUIRED');
  try { S.assertOutsideRepo(arg('--out'), root); } catch (e) { missing.push({ code: e.code ?? 'OUT_INVALID' }); }
  try { verifyRegistration(root); } catch { missing.push({ code: 'REGISTRATION_HASH_MISMATCH' }); }
  try { X.verifyRegisteredReferences(root, JSON.parse(fs.readFileSync(path.join(root, REGISTRATION_FILE), 'utf8'))); } catch (e) { missing.push({ code: e.code ?? 'REGISTERED_REFERENCE_CHANGED', detail: e.detail ?? null }); }
  for (const k of S3_ENV) need(!!env[k], 'SNAPSHOT_STORE_SECRET_MISSING', k);
  const series = arg('--v13-series'), raw = arg('--v13-raw');
  if (!series || !fs.existsSync(series)) missing.push({ code: 'V13_SERIES_DIR_MISSING', detail: 'archive 1.2.0 part v13-derived (restore-archive.sh)' });
  else {
    const reg = JSON.parse(fs.readFileSync(path.join(root, 'docs/quant-recovery/v13/delisted/register-1.0.0.json'), 'utf8')), ix = Object.fromEntries(reg.columns.map((c, i) => [c, i]));
    const want = reg.rows.filter((r) => r[ix.status] === 'QUALIFIED').map((r) => r[ix.chainId]), have = new Set(fs.readdirSync(series));
    const absent = want.filter((id) => !have.has(id + '.json')).length;
    need(absent === 0, 'V13_SERIES_INCOMPLETE', `${absent} of ${want.length} QUALIFIED series absent`);
  }
  if (!raw || !fs.existsSync(raw)) missing.push({ code: 'V13_DAILY_DIR_MISSING', detail: 'archive 1.2.0 part v13-raw (restore-archive.sh)' });
  else need(fs.readdirSync(raw).some((d) => fs.existsSync(path.join(raw, d, 'series.jsonl.gz'))), 'V13_DAILY_DIR_EMPTY');
  const q = arg('--quarantine', 'DQ-K5-BOOK');
  need(S.QUARANTINE_MODES.includes(q), 'UNKNOWN_QUARANTINE_MODE', q);
  if (q === 'CA-Q-K5-DATES') need(!!arg('--quarantine-dates') && fs.existsSync(arg('--quarantine-dates')), 'QUARANTINE_DATES_MISSING');
  if (arg('--identity-blocklist')) { try { H.readIdentityBlocklist(arg('--identity-blocklist'), { expectedSha256: arg('--identity-blocklist-sha256') }); } catch (e) { missing.push({ code: e.code ?? 'IDENTITY_BLOCKLIST_INVALID' }); } }
  need(fs.existsSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem')), 'OWNER_PUBLIC_KEY_MISSING');
  return { ready: missing.length === 0, missing };
}

async function main() {
  const argv = process.argv.slice(2), arg = argOf(argv);
  const die = (code, n = 2) => { console.error(code); process.exit(n); };
  if (argv.includes('--preflight')) { const p = preflight(argv); console.log(JSON.stringify(p, null, 1)); process.exit(p.ready ? 0 : 3); }
  if (arg('--accounting') !== 'research-v1') die('RESEARCH_ACCOUNTING_REQUIRED');
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) die('SNAPSHOT_REQUIRED');
  let OUT, params, registrationSha256, referencesSha256, v13, dates = null, blocklist = null;
  try {
    OUT = S.assertOutsideRepo(arg('--out'), ROOT);
    registrationSha256 = verifyRegistration();
    referencesSha256 = X.verifyRegisteredReferences(ROOT, JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRATION_FILE), 'utf8'))).sha256;
    const quarantine = arg('--quarantine', 'DQ-K5-BOOK');
    params = S.studyParameters({ methods: arg('--methods', S.STUDY_METHODS.join(',')).split(','), quarantine });
    if (quarantine === 'CA-Q-K5-DATES') dates = S.readQuarantineDates(arg('--quarantine-dates'));
    if (arg('--identity-blocklist')) blocklist = H.readIdentityBlocklist(arg('--identity-blocklist'), { expectedSha256: arg('--identity-blocklist-sha256') });
    v13 = S.loadV13Additions({ root: ROOT, seriesDir: arg('--v13-series'), rawDir: arg('--v13-raw') });
  } catch (e) { die(e instanceof S.StudyError || e instanceof H.HistError || e instanceof X.ExecError ? `STUDY_INPUT_REFUSED: ${e.code}` : `STUDY_INPUT_REFUSED: UNEXPECTED ${e?.message ?? e}`, 3); }
  const t0 = Date.now(), log = (m) => console.log(`[st9-v13 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  log(`V13 chains bound (weekly + daily): ${v13.chains.length}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, secPit, secPitSha256, verification;
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
    ({ secPit, sha256: secPitSha256 } = readSecPit(buf));
  } catch (e) {
    die(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}` : e instanceof S.StudyError ? `INPUT_INTEGRITY_FAILURE: ${e.code}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`, 3);
  }
  const dsA = datasetFromPit(pit); attachSecPit(dsA, secPit);
  // CIK of A listings from sec-pit r12 for the issuer-interval dedupe (listings without a CIK there are not CIK-deduped)
  const aCik = new Map(Object.entries(secPit).filter(([, f]) => f && f.cik).map(([k, f]) => [k, String(Number(f.cik))]));
  const chains = v13.chains.map((c) => ({ ...c, cik: String(Number(c.cik)) }));
  const { dsB, addedIds, census } = S.buildUniverseB(dsA, chains, { calendarDates: pit.spyRaw.map((b) => b.date), aCikByListing: aCik });
  log(`universe B: +${census.added} chains (${census.addedSecurities} securities), excluded ${JSON.stringify(census.excluded)}`);
  // historical infrastructure (counts only; registered universes unchanged): point in time, identity, delisting, coverage
  let hist;
  try {
    const addedTickers = new Map(chains.map((c) => [`${S.ADDED_ID_PREFIX}${c.exchange}:${c.chainId}`, c.ticker]));
    const opts = { window: L.WINDOW, calendarDates: pit.spyRaw.map((b) => b.date), blocklist, addedTickers };
    hist = { A: H.universeDiagnostics(dsA, opts), B: H.universeDiagnostics(dsB, { ...opts, addedIds }) };
    // cross-check of the dedupe: an added chain must never share a securityId with an overlapping listing
    if (hist.B.identity.duplicateListingOverlap.byOrigin.B_ADDED) throw new H.HistError('IDENTITY_DUPLICATE_IN_ADDED', String(hist.B.identity.duplicateListingOverlap.byOrigin.B_ADDED));
  } catch (e) { die(e instanceof H.HistError ? `STUDY_INPUT_REFUSED: ${e.code}` : `STUDY_INPUT_REFUSED: UNEXPECTED ${e?.message ?? e}`, 3); }
  log(`point in time: A ${JSON.stringify(hist.A.pointInTime)}; identity B ${JSON.stringify(hist.B.identity.duplicateListingOverlap)}`);
  // independent audit of every finished run (read-only observer); trades kept for the A/B diff
  const audits = {}, tradesOf = {};
  const outcomeOf = new Map(), flagsOf = { A: hist.A._flags, B: hist.B._flags };
  for (const w of H.listingWindows(dsB, { addedIds })) outcomeOf.set(w.lid, H.outcomeOf(w));
  const onRun = ({ key, frame, ds, r, opts }) => {
    const a = X.auditRun(ds, r, { key, costs: opts.costs, from: opts.from });
    const cov = X.tradeCoverageByYear(r.trades, { key, addedIds: frame === 'B' ? addedIds : new Set(), outcomeOfId: (id) => outcomeOf.get(id) ?? null, identityFlags: flagsOf[frame], perTrade: a._perTrade });
    (audits[key] ||= {})[frame] = { audit: a, coverage: cov };
    (tradesOf[key] ||= {})[frame] = r.trades;
    log(`${key} ${frame}: audit ${a.pass ? 'pass' : `FAILED ${JSON.stringify(a.violations)}`}`);
  };
  const result = S.runStudy({ dsA, dsB, addedIds, params, datesBySegment: dates?.map ?? null, log, onRun });
  const resultSha256 = X.resultSha256(result);
  if (argv.includes('--repeat-check')) {
    try { X.assertSameResult(result, S.runStudy({ dsA, dsB, addedIds, params, datesBySegment: dates?.map ?? null })); } catch (e) { die(`STUDY_REFUSED: ${e.code ?? e.message}`, 4); }
    log(`repeat check (${REPEAT_CHECK_SCOPE}): identical result hash`);
  }
  const abDiff = Object.fromEntries(Object.entries(tradesOf).map(([k, t]) => [k, X.abDiff(t.A, t.B, { addedIds })]));
  const auditPass = Object.values(audits).every((m) => m.A.audit.pass && m.B.audit.pass);
  const receipt = { schema: 'st9-v13-delisted-receipt-1.0.0', snapshotId, datasetSha256, ...verification, registrationSha256, studyCodeSha256: studyCodeSha256(), engineCodeSha256: engineCodeSha256(), quarantineDatesSha256: dates?.sha256 ?? null, identityBlocklistSha256: blocklist?.sha256 ?? null, histUniverseVersion: H.ST9_HIST_UNIVERSE_VERSION, histExecutionVersion: X.ST9_HIST_EXECUTION_VERSION, registeredReferencesSha256: referencesSha256, resultSha256, repeatChecked: argv.includes('--repeat-check'), repeatCheckScope: argv.includes('--repeat-check') ? REPEAT_CHECK_SCOPE : null, secPitSha256, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, window: L.WINDOW_NAME };
  const histPublic = { A: H.publicUniverseDiagnostics(hist.A), B: H.publicUniverseDiagnostics(hist.B), identityBlocklistMode: blocklist ? 'FLAG' : 'NOT_SUPPLIED', addedTerminalCoverage: { addedLastTradeInWindow: census.addedLastTradeInWindow, addedTerminalBooked: census.addedTerminalBooked, terminalSegmentTooShort: census.terminalSegmentTooShort, terminalSegmentTooShortByClass: census.terminalSegmentTooShortByClass, windowEndSegmentTooShort: census.windowEndSegmentTooShort } };
  receipt.inputFingerprint = X.inputFingerprint({ snapshotId, datasetSha256, registrationSha256, registeredReferencesSha256: referencesSha256, parametersSha256: params.sha256, v13RegisterSha256: v13.provenance.registerSha256, v13ChainsSha256: v13.provenance.chainsSha256, secPitSha256, quarantineDatesSha256: dates?.sha256 ?? null, identityBlocklistSha256: blocklist?.sha256 ?? null, studyCodeSha256: receipt.studyCodeSha256, engineCodeSha256: receipt.engineCodeSha256 }).sha256;
  const execPublic = { pass: auditPass, methods: Object.fromEntries(Object.entries(audits).map(([k, m]) => [k, { A: { audit: X.publicAudit(m.A.audit), coverage: m.A.coverage }, B: { audit: X.publicAudit(m.B.audit), coverage: m.B.coverage }, abDiff: abDiff[k] }])) };
  const pub = { ...S.publicPart(result, { census, provenance: v13.provenance, receipt }), historicalInfrastructure: { ...histPublic, execution: execPublic }, status: auditPass ? 'COMPLETE' : 'EXECUTION_AUDIT_FAILED' };
  const full = { receipt, public: pub, universeB: census, v13: v13.provenance, result, historicalInfrastructure: { ...histPublic, flagsA: Object.fromEntries(hist.A._flags), flagsB: Object.fromEntries(hist.B._flags), auditExamples: Object.fromEntries(Object.entries(audits).map(([k, m]) => [k, { A: m.A.audit._examples, B: m.B.audit._examples }])) } };
  fs.mkdirSync(OUT, { recursive: true });
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'st9-v13-delisted.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify(full))));
  fs.writeFileSync(path.join(OUT, 'st9-v13-delisted.public.json'), JSON.stringify(pub, null, 1) + '\n');
  if (argv.includes('--write-plain')) fs.writeFileSync(path.join(OUT, 'st9-v13-delisted.private.json'), JSON.stringify(full, null, 1) + '\n');
  if (!auditPass) { console.error('EXECUTION_AUDIT_FAILED (sealed examples in the private part)'); process.exit(4); }
  log('done');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
