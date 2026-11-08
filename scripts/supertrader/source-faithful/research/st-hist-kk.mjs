/**
 * Strang H (06.11.2026) – historischer Test der Kullamägi-Methoden C09 (Episodic Pivot) und C10 (Parabolic Short) neben den
 * Tagesmethoden des Modus rest8 (run-st-hist-top5.mjs). Forschung, nicht zertifiziert.
 *
 * Keine neue Regel, kein Parameter, keine Engine: die gepinnten Bausteine aus run-kk-intraday.mjs (Screens, Tagessätze,
 * Cache-Schlüssel), kk-ep-lifecycle.mjs (REF) und kk-ps-study.mjs (REF) laufen auf dem DQ-K5-quarantänierten DEV-Datensatz
 * und lesen nur den privaten IEX-Minuten-Cache (0 Anfragen, nie geschrieben). run-kk-intraday.mjs bleibt byte-gleich, damit
 * die gepinnten Fingerabdrücke seiner Läufe (KK_SNAPSHOT_RUNS) gelten.
 *
 * Lesart (Claude nach der dokumentierten Empfehlung, CLAUDE.md Freigaben):
 *  - C09: REF auf dem Referenz-Tagessatz CLEAN (Stichprobe in Hash-Reihenfolge, IEX ab 2017-01-03), vier Kostenstufen,
 *    SPY-Vergleich über die Portfoliokurve der Forschungs-Engine. Das Original-EP (Katalysator) ist nicht vergebbar.
 *  - C10: REF als Trade-Studie (Kosten fest in PS_COSTS, keine Leihdaten). Ein Short-Trade ohne Leihgebühr ist nicht
 *    ausführbar; es gibt keine Portfoliokurve und daher keinen SPY-Vergleich, nur Erwartungswert je Trade.
 */
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import * as L from '../../validation/lib.mjs';
import { runResearchLifecycle, runMetricsSF5, prepareAll, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';
import { expandSession } from './kk-intraday.mjs';
import { KK_EP_ADAPTER, EP_RUN_VARIANTS } from './kk-ep-lifecycle.mjs';
import { PS_RUN_VARIANTS, PS_OVERLAP_POLICIES, PS_COSTS, evaluatePsCandidates, psTradeMetrics } from './kk-ps-study.mjs';
import { OUTSIDE_DAY_SET } from './kk-sample.mjs';
import { screenCandidates, buildDaySets, cacheKey, CACHE_SHARDS, epTradeSummary } from './run-kk-intraday.mjs';

export const ST_HIST_KK_VERSION = 'st-hist-kk-1.0.0';
const sha = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

/** Lädt den Referenz-Cache (Minuten, IEX-Basis) nur lesend; getObject(key) -> Buffer|null. */
export async function loadKkCache(getObject) {
  const out = { minutes: {}, baseline: {} };
  for (const kind of ['minutes', 'baseline']) for (let n = 0; n < CACHE_SHARDS; n++) {
    const b = await getObject(cacheKey(kind, n.toString(16)));
    if (b) Object.assign(out[kind], JSON.parse(zlib.gunzipSync(b).toString('utf8')));
  }
  return out;
}

/**
 * C09 und C10 auf einem (bereits quarantänierten) Datensatz. cache = loadKkCache(); costLevels aus dem SF6-Protokoll.
 * Rückgabe { pub (nur Zählungen und Hashes), sealed (Kennzahlen) }.
 */
export function runKkStHist(dataset, { cache, costLevels, window = L.WINDOW, log = () => {} }) {
  const cand = screenCandidates(dataset), sec = new Map(dataset.securities.map((s) => [s.id, s]));
  const sets = buildDaySets({ epCands: cand.ep, psCands: cand.ps, minuteCache: cache.minutes, baseCache: cache.baseline, barsOf: (c) => sec.get(c.id).bars, benchmark: dataset.benchmark });
  const ds = { ...dataset }, cur = sets.ep.CLEAN;
  ds.kkIntraday = {
    minutes: (t, d) => { const c = cache.minutes[`${t}|${d}`]; return c === undefined ? undefined : expandSession(c); },
    iexBaseline: (t, d) => cache.baseline[`${t}|${d}`]?.mean ?? null,
    excluded: (t, d) => `${t}|${d}` in cache.minutes && !cur.has(`${t}|${d}`),
  };
  const ref = EP_RUN_VARIANTS.find((v) => v.id === 'REF'), prepared = prepareAll(ds, KK_EP_ADAPTER, ref.config);
  const pub = { version: ST_HIST_KK_VERSION, candidates: { ep: cand.ep.length, ps: cand.ps.length }, daySet: 'CLEAN', daySetSize: { ep: sets.ep.CLEAN.size, ps: sets.ps.CLEAN.size }, daySetSha256: { ep: sets.public.daySetSha256.ep.CLEAN, ps: sets.public.daySetSha256.ps.CLEAN }, requests: 0, C09: { costs: {} }, C10: {} };
  const sealed = { C09: { costs: {} }, C10: {} };
  for (const c of costLevels) {
    const r = runResearchLifecycle(ds, { adapter: KK_EP_ADAPTER, config: ref.config, policy: { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, slippageBps: c.slippageBps, commissionBps: c.commissionBps }, prepared, from: window.from, to: window.to });
    if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:C09:${c.id}`);
    pub.C09.costs[c.id] = { trades: r.trades.length, closed: r.trades.filter((t) => t.status === 'CLOSED').length, reconciliation: true, tradesSha256: sha(r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])) };
    sealed.C09.costs[c.id] = { metrics: runMetricsSF5(r, { spyTR: ds.spyTR }), tradeLevel: epTradeSummary(r.trades) };
    log(`C09 ${c.id}: ${r.trades.length} trades`);
  }
  const psRef = PS_RUN_VARIANTS.find((v) => v.id === 'REF'), daySet = sets.ps.CLEAN;
  for (const overlap of PS_OVERLAP_POLICIES) {
    const res = evaluatePsCandidates({ cands: cand.ps, barsOf: (c) => sec.get(c.id).bars, minutesOf: (c) => ds.kkIntraday.minutes(c.ticker, c.date), inDaySet: (c) => daySet.has(`${c.ticker}|${c.date}`), cfg: psRef.config, overlap, from: window.from, to: window.to, outsideStatus: OUTSIDE_DAY_SET });
    pub.C10[overlap] = { closedTrades: res.closed.length, openAtDataEnd: res.open.length, tradesSha256: sha(res.closed.map((t) => [t.id, t.entryDate, t.exitReasons])) };
    sealed.C10[overlap] = { metrics: psTradeMetrics(res.closed, res.open) };
    log(`C10 ${overlap}: ${res.closed.length} trades`);
  }
  pub.C10.costs = PS_COSTS; pub.C10.spyComparison = 'NOT_COMPARABLE_SHORT_TRADE_STUDY_WITHOUT_BORROW_DATA';
  return { pub, sealed };
}
