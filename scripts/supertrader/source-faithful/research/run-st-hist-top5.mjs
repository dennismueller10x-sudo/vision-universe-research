#!/usr/bin/env node
/**
 * Supertrader Neustart (04.11.2026) – erster historischer Backtest der V1-Methoden (Top 5: C01, C02, C03, C08, C12).
 * Forschung, nicht zertifiziert. Keine neue Regel, kein Parameter, keine Engine: die unveränderten SF6-Referenzen
 * (research/sf6-references.mjs, Konfiguration REF) laufen auf dem eingefrorenen DEV-Snapshot (2016-01-04 bis 2026-09-30,
 * Kurse mit Split-Faktoren nach ADR-002, delistete Titel des Snapshots mit Abrechnung), mit der DQ-K5-Quarantäne
 * (die ungeklärten Kapitalmaßnahmen sind ausgeschlossen, E1) und den vier vorregistrierten Kostenstufen
 * (SF6-VALIDATION-PROTOCOL 1.1.0). Optional zusätzlich Universum B mit den V13-Delisting-Ketten (st9-v13-delisted-study).
 *
 *   node scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs --snapshot sts1-<id> --out <dir außerhalb> \
 *     --reviewer-key <pem> [--v13-series <dir> --v13-raw <dir>]
 *
 * Ausgaben (nur nach --out): st-hist-top5.public.json (Status, Zählungen, Hashes; keine Renditezahl) und
 * st-hist-top5.sealed.<owner|reviewer>.json (alles, hybrid verschlüsselt). Öffentliche Renditeaussagen braucht der Owner.
 * Das HOLDOUT-Fenster 2008-2015 bleibt unberührt (PREREGISTRATION-R14).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { computeDiagnosticMetrics } from '../runner/metrics.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { SF6_REFERENCES } from './sf6-references.mjs';
import { SF6_VALIDATION_PROTOCOL } from './run-sf6-validation.mjs';
import * as S from './st9-v13-delisted-study.mjs';
import * as X from './st9-hist-execution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const ST_HIST_TOP5_VERSION = 'st-hist-top5-1.0.0';
export const TOP5 = Object.freeze(['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']);
export const LABEL = Object.freeze({ evidenceKind: 'HISTORICAL_RESEARCH_BACKTEST', label: 'Forschung, nicht zertifiziert', certification: 'DIAGNOSTIC_NOT_CERTIFIED', productionApproved: false, performanceClaim: 'NONE', publication: 'OWNER_DECISION_REQUIRED' });
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
const INITIAL_CAPITAL = 100000;
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const argOf = (argv) => (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/** Kennzahlen eines Laufs: Trefferquote auf abgeschlossenen Trades, Gesamtrendite, CAGR, max. Verlust, SPY, Kosten. */
export function summarizeRun(r, ds, { protocol = SF6_VALIDATION_PROTOCOL } = {}) {
  const m = computeDiagnosticMetrics({ curve: r.run.curve, trades: r.metricTrades, ledger: r.run.ledger, costs: r.run.counts?.costs ?? 0, spyTR: ds.spyTR, splitPeriods: protocol.splitPeriods[L.WINDOW_NAME] ?? [], initialCapital: INITIAL_CAPITAL });
  const end = r.run.curve.at(-1)?.equity ?? null, first = r.run.curve[0]?.date ?? null, last = r.run.curve.at(-1)?.date ?? null;
  let spyTotal = null;
  if (ds.spyTR && first && last) { const s = ds.spyTR.filter((p) => p.date >= first && p.date <= last); if (s.length > 1 && s[0].value > 0) spyTotal = s.at(-1).value / s[0].value - 1; }
  const closed = r.trades.filter((t) => t.status === 'CLOSED');
  return {
    trades: r.trades.length, closedTrades: closed.length, openAtDataEnd: r.trades.length - closed.length,
    hitRate: closed.length ? closed.filter((t) => (t.pnl ?? 0) > 0).length / closed.length : null,
    totalReturn: end !== null ? end / INITIAL_CAPITAL - 1 : null, cagr: m.cagr, maxDrawdown: m.maxDrawdown, volatility: m.volatility, sharpe: m.sharpe,
    spyTotalReturn: spyTotal, spyCagr: m.spyCagr, spyDistance: m.spyDistance, costsPaid: r.run.counts?.costs ?? null, costBurden: m.costBurden,
    profitFactor: m.profitFactor, exposure: m.exposure, medianHoldingSessions: m.medianHoldingSessions, annualReturns: m.annualReturns, periods: m.periods,
    from: first, to: last, reconciliation: r.run.reconciliation ? { pass: r.run.reconciliation.pass } : null,
  };
}

/** Top 5 je Kostenstufe auf einem (bereits quarantänierten) Datensatz. */
export function runTop5(ds, { methods = TOP5, costLevels = SF6_VALIDATION_PROTOCOL.costLevels, window = L.WINDOW, audit = true, log = () => {} } = {}) {
  const out = {};
  for (const key of methods) {
    const ref = SF6_REFERENCES.find((x) => x.key === key);
    if (!ref) throw new Error(`UNKNOWN_METHOD ${key}`);
    const prep = ref.prep(ds, { from: window.from }) || {};
    out[key] = { candidateId: ref.candidateId, costs: {} };
    for (const c of costLevels) {
      const r = ref.run(ds, { from: window.from, to: window.to, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps }, ...prep });
      out[key].costs[c.id] = summarizeRun(r, ds);
      out[key].costs[c.id].tradesSha256 = sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.pnl]));
      if (c.id === 'REF' && audit) {
        // unabhängiger Ausführungsaudit (st9-hist-execution: Ausstiege, Gap-Stopps, Delisting, Bücher); nur Beobachter
        const a = X.auditRun(ds, r, { key, costs: { slippageBps: c.slippageBps, commissionBps: c.commissionBps }, from: window.from });
        out[key].audit = { ...X.publicAudit(a), examples: a._examples };
      }
      log(`${key} ${c.id}: ${r.trades.length} trades`);
    }
  }
  return out;
}

export function publicPart(result) {
  return { schema: 'st-hist-top5-public-1.0.0', ...LABEL, receipt: result.receipt, methods: Object.fromEntries(Object.entries(result.A).map(([k, m]) => [k, { candidateId: m.candidateId, tradesRef: m.costs.REF.trades, tradesSha256Ref: m.costs.REF.tradesSha256, auditPass: m.audit ? m.audit.pass : null, auditViolations: m.audit ? m.audit.violations : null, missedStopCheck: m.audit ? m.audit.missedStopCheck : null }])), quarantine: result.quarantine.A, universeB: result.B ? 'COMPUTED' : 'NOT_REQUESTED' };
}

async function main() {
  const argv = process.argv.slice(2), arg = argOf(argv), die = (c, n = 2) => { console.error(c); process.exit(n); };
  if (L.WINDOW_NAME !== 'DEV') die('HOLDOUT_NOT_PERMITTED');
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) die('SNAPSHOT_REQUIRED');
  const OUT = S.assertOutsideRepo(arg('--out'), ROOT);
  const reviewerPem = arg('--reviewer-key') ? fs.readFileSync(arg('--reviewer-key'), 'utf8') : null;
  if (reviewerPem && !/BEGIN PUBLIC KEY/.test(reviewerPem)) die('REVIEWER_KEY_NOT_A_PUBLIC_KEY');
  const t0 = Date.now(), log = (m) => console.log(`[st-hist-top5 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
  const { createSnapshotStore } = await import('../../snapshot/store.mjs');
  const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
  const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: false }), snapshotId, requireRestoreReceipt: true });
  const pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
  const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
  if (v.codeVersionChanged) die('INPUT_INTEGRITY_FAILURE: CODE_VERSION_CHANGED', 3);
  const datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
  const buf = await (await opened.io.createDriver()).get(pit.mine.seriesPrefix + SEC_PIT_KEY);
  if (!buf || !buf.length) die('SEC_PIT_MISSING', 3);
  const secPit = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  const dsA = datasetFromPit(pit); attachSecPit(dsA, secPit);
  const qa = S.applyQuarantine(dsA, { mode: 'DQ-K5-BOOK' });
  log(`universe A: ${dsA.securities.length} segments, quarantine ${JSON.stringify(qa.census)}`);
  const result = { schema: 'st-hist-top5-result-1.0.0', ...LABEL, window: { name: L.WINDOW_NAME, ...L.WINDOW }, costLevels: SF6_VALIDATION_PROTOCOL.costLevels, quarantine: { A: qa.census }, A: runTop5(qa.ds, { log }) };
  if (arg('--v13-series') && arg('--v13-raw')) {
    const v13 = S.loadV13Additions({ root: ROOT, seriesDir: arg('--v13-series'), rawDir: arg('--v13-raw') });
    const aCik = new Map(Object.entries(secPit).filter(([, f]) => f && f.cik).map(([k, f]) => [k, String(Number(f.cik))]));
    const chains = v13.chains.map((c) => ({ ...c, cik: String(Number(c.cik)) }));
    const { dsB, addedIds, census } = S.buildUniverseB(dsA, chains, { calendarDates: pit.spyRaw.map((b) => b.date), aCikByListing: aCik });
    const qb = S.applyQuarantine(dsB, { mode: 'DQ-K5-BOOK', addedIds });
    log(`universe B: +${census.added} chains`);
    result.universeB = census; result.quarantine.B = qb.census;
    result.B = runTop5(qb.ds, { costLevels: SF6_VALIDATION_PROTOCOL.costLevels.filter((c) => c.id === 'REF'), log });
  }
  result.receipt = { version: ST_HIST_TOP5_VERSION, snapshotId, datasetSha256, datasetVerified: v.datasetVerified, engineCodeSha256: engineCodeSha256(), runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  result.receipt.resultSha256 = sha({ A: result.A, B: result.B ?? null });
  fs.mkdirSync(OUT, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  if (reviewerPem) fs.writeFileSync(path.join(OUT, 'st-hist-top5.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plain));
  fs.writeFileSync(path.join(OUT, 'st-hist-top5.public.json'), JSON.stringify(publicPart(result), null, 1) + '\n');
  log('done');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
