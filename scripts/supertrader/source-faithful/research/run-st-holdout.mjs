#!/usr/bin/env node
/**
 * Holdout 2008–2015, Supertrader-Teil (Strang H, docs/research/holdout/PROTOKOLL-2008-2015.json, SHA-256 gepinnt in
 * scripts/research/holdout/protocol-pin.cjs). Forschung, nicht zertifiziert. Genau einmal (Ledger im privaten Eimer).
 *
 * Die 11 auf Tagesbalken rechenbaren Methoden laufen unverändert wie im DEV-Backtest (run-st-hist-top5.mjs#runTop5):
 * SF6-Referenzen REF, DQ-K5-Quarantäne, vier Kostenstufen, Delisting-Erlös S0/S1/S2, Ausführungsaudit, ohne DQ-K5 als
 * Sensitivität, Universum B mit den V13-Ketten. Dazu je Methode die Wochenrenditen gegen die SPY-Gesamtrendite und der
 * gepaarte Block-Bootstrap (scripts/research/edge/study.cjs#pairedTest, roh); Holm über alle 12 Hypothesen setzt
 * scripts/research/holdout/combine.mjs zusammen.
 *
 *   ST_WINDOW=HOLDOUT node scripts/supertrader/source-faithful/research/run-st-holdout.mjs --snapshot sts1-<id> --out <dir> \
 *     --reviewer-key <pem> [--v13-series <dir> --v13-raw <dir>] [--allow-code-version-change]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { SF6_REFERENCES } from './sf6-references.mjs';
import { SF6_VALIDATION_PROTOCOL } from './run-sf6-validation.mjs';
import * as S from './st9-v13-delisted-study.mjs';
import { runTop5, populationCensus, publicPart, LABEL } from './run-st-hist-top5.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const require = createRequire(import.meta.url);
export const ST_HOLDOUT_VERSION = 'st-holdout-1.0.0';
export const PROTOCOL_FILE = 'docs/research/holdout/PROTOKOLL-2008-2015.json';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');

/** Protokoll lesen und gegen den Pin prüfen; die Methoden in Protokollreihenfolge, nur SF6-Referenzen. */
export function loadProtocol(root = ROOT) {
  const bytes = fs.readFileSync(path.join(root, PROTOCOL_FILE)), h = sha(bytes), pin = require(path.join(root, 'scripts/research/holdout/protocol-pin.cjs')).PROTOCOL_SHA256;
  if (h !== pin) throw new Error(`PROTOCOL_CHANGED ${h}`);
  const doc = JSON.parse(bytes);
  const methods = doc.candidates.supertrader.map((c) => { const r = SF6_REFERENCES.find((x) => x.key === c.key); if (!r || r.candidateId !== c.id) throw new Error(`PROTOCOL_METHOD_UNKNOWN ${c.id}`); return c.key; });
  return { doc, sha256: h, methods };
}

/** ISO-Woche wie die Quant-Seite (scripts/quant/portfolio/model-portfolios.cjs#isoWeek), damit beide Teile dieselben Wochen zählen. */
export const isoWeek = (d) => require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')).isoWeek(d);
/** Letzter Wert je ISO-Woche: points [{date, value}] -> Map(week -> {date, value}). */
export function weeklyLast(points) {
  const m = new Map();
  for (const p of points) if (Number.isFinite(p.value) && p.value > 0) m.set(isoWeek(p.date), { date: p.date, value: p.value });
  return m;
}
/** Gepaarte Wochenrenditen Strategie/SPY über dieselben Wochen (nur Wochen, die beide haben, ohne Auffüllen). */
export function pairedWeekly(curve, spyTR) {
  const a = weeklyLast(curve.map((p) => ({ date: p.date, value: p.equity }))), b = weeklyLast(spyTR);
  const weeks = [...a.keys()].filter((w) => b.has(w)).sort();
  const lv = weeks.map((w) => a.get(w).value), sv = weeks.map((w) => b.get(w).value), dates = weeks.map((w) => a.get(w).date);
  return { dates, levels: lv, spyLevels: sv, returns: lv.slice(1).map((v, i) => v / lv[i] - 1), spyReturns: sv.slice(1).map((v, i) => v / sv[i] - 1) };
}
/** Je Methode der REF-Lauf erneut (deterministisch, gleiches Ergebnis wie runTop5) für Kurve, Wochenrenditen und Test. */
export function holdoutStats(ds, methods, { window = L.WINDOW, Sx = require(path.join(ROOT, 'scripts/research/edge/study.cjs')) } = {}) {
  const ref = SF6_VALIDATION_PROTOCOL.costLevels.find((c) => c.id === 'REF'), out = {};
  for (const key of methods) {
    const r0 = SF6_REFERENCES.find((x) => x.key === key), prep = r0.prep(ds, { from: window.from }) || {};
    const r = r0.run(ds, { from: window.from, to: window.to, costs: { slippageBps: ref.slippageBps, commissionBps: ref.commissionBps }, ...prep });
    const pw = pairedWeekly(r.run.curve, ds.spyTR);
    let m = null, spy = null, test = null, error = null;
    try { m = Sx.metrics(pw.levels, pw.dates); spy = Sx.metrics(pw.spyLevels, pw.dates); test = Sx.pairedTest(pw.returns, pw.spyReturns); } catch (e) { error = String(e.message || e).slice(0, 80); }
    out[key] = { candidateId: r0.candidateId, weeks: pw.dates.length, from: pw.dates[0] ?? null, to: pw.dates.at(-1) ?? null, metrics: m, spy, test, error, weeklyReturns: pw.returns, spyWeeklyReturns: pw.spyReturns, tradesSha256: sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.pnl])) };
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }, die = (c, n = 2) => { console.error(c); process.exit(n); };
  if (L.WINDOW_NAME !== 'HOLDOUT') die('HOLDOUT_WINDOW_REQUIRED (ST_WINDOW=HOLDOUT)');
  const P = loadProtocol();
  if (L.WINDOW.from !== P.doc.window.from || L.WINDOW.to !== P.doc.window.to) die('HOLDOUT_WINDOW_MISMATCH');
  const snapshotId = arg('--snapshot');
  if (snapshotId !== P.doc.data.supertraderSnapshotId) die('HOLDOUT_SNAPSHOT_NOT_REGISTERED');
  const OUT = S.assertOutsideRepo(arg('--out'), ROOT);
  const reviewerPem = arg('--reviewer-key') ? fs.readFileSync(arg('--reviewer-key'), 'utf8') : null;
  if (!reviewerPem || !/BEGIN PUBLIC KEY/.test(reviewerPem)) die('REVIEWER_KEY_REQUIRED');
  const t0 = Date.now(), log = (m) => console.log(`[st-holdout +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const LG = await import(path.join(ROOT, 'scripts/research/holdout/ledger.mjs'));
  const { createS3DriverFromEnv } = await import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs'));
  const ledgerDriver = createS3DriverFromEnv(process.env);
  const attempt = await LG.startAttempt(ledgerDriver, 'supertrader', { runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, protocolSha256: P.sha256 }).catch((e) => die(String(e.message), 5));
  log(`ledger attempt ${attempt}`);
  const K = await import('../../snapshot/contract.mjs');
  const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
  const { createSnapshotStore } = await import('../../snapshot/store.mjs');
  const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
  const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: false }), snapshotId, requireRestoreReceipt: true });
  const pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
  const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
  if (v.codeVersionChanged && !(argv.includes('--allow-code-version-change') && v.datasetVerified === 'EXACT')) die('INPUT_INTEGRITY_FAILURE: CODE_VERSION_CHANGED', 3);
  const datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
  const buf = await (await opened.io.createDriver()).get(pit.mine.seriesPrefix + SEC_PIT_KEY);
  if (!buf || !buf.length) die('SEC_PIT_MISSING', 3);
  const secPit = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  const dsA = datasetFromPit(pit); attachSecPit(dsA, secPit);
  const qa = S.applyQuarantine(dsA, { mode: 'DQ-K5-BOOK' });
  log(`universe A: ${dsA.securities.length} segments`);
  const methods = P.methods;
  const result = { schema: 'vu-holdout-st-result-1.0.0', ...LABEL, protocolId: P.doc.id, protocolSha256: P.sha256, window: { name: L.WINDOW_NAME, ...L.WINDOW }, methods, costLevels: SF6_VALIDATION_PROTOCOL.costLevels, quarantine: { A: qa.census }, population: { A: populationCensus(dsA) } };
  result.A = runTop5(qa.ds, { methods, log });
  result.stats = holdoutStats(qa.ds, methods);
  for (const k of methods) if (result.stats[k].tradesSha256 !== result.A[k].costs.REF.tradesSha256) die(`HOLDOUT_REF_NOT_REPRODUCED ${k}`, 4);
  result.A_NO_DQK5 = runTop5(dsA, { methods, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF'), audit: false, log });
  if (arg('--v13-series') && arg('--v13-raw')) {
    const v13 = S.loadV13Additions({ root: ROOT, seriesDir: arg('--v13-series'), rawDir: arg('--v13-raw') });
    const aCik = new Map(Object.entries(secPit).filter(([, f]) => f && f.cik).map(([k, f]) => [k, String(Number(f.cik))]));
    const chains = v13.chains.map((c) => ({ ...c, cik: String(Number(c.cik)) }));
    const { dsB, addedIds, census } = S.buildUniverseB(dsA, chains, { calendarDates: pit.spyRaw.map((b) => b.date), aCikByListing: aCik });
    const qb = S.applyQuarantine(dsB, { mode: 'DQ-K5-BOOK', addedIds });
    log(`universe B: +${census.added} chains`);
    result.universeB = census; result.quarantine.B = qb.census; result.population.B = populationCensus(dsB);
    result.B = runTop5(qb.ds, { methods, costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF'), log });
    result.statsB = holdoutStats(qb.ds, methods);
  }
  result.receipt = { version: ST_HOLDOUT_VERSION, snapshotId, datasetSha256, datasetVerified: v.datasetVerified, codeVersionChanged: !!v.codeVersionChanged, engineCodeSha256: engineCodeSha256(), runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, ledgerAttempt: attempt };
  result.receipt.resultSha256 = sha({ A: result.A, stats: result.stats, B: result.B ?? null, A_NO_DQK5: result.A_NO_DQK5 });
  const auditPass = Object.values(result.A).every((m) => !m.audit || m.audit.pass === true);
  result.status = auditPass ? 'COMPLETE' : 'EXECUTION_AUDIT_FAILED';
  fs.mkdirSync(OUT, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  fs.writeFileSync(path.join(OUT, 'st-holdout.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  fs.writeFileSync(path.join(OUT, 'st-holdout.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plain));
  await LG.sealAttempt(ledgerDriver, 'supertrader', attempt, { resultSha256: result.receipt.resultSha256 });
  const pub = { ...publicPart(result), schema: 'vu-holdout-st-public-1.0.0', protocolSha256: P.sha256, ledgerAttempt: attempt };
  fs.writeFileSync(path.join(OUT, 'st-holdout.public.json'), JSON.stringify(pub, null, 1) + '\n');
  if (!auditPass) { console.error('EXECUTION_AUDIT_FAILED (versiegelt; der Holdout ist trotzdem verbraucht)'); process.exit(4); }
  log('done');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
