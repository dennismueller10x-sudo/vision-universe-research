/**
 * Price-data root-cause and backtest-impact audit: shared helpers (diagnostic only, never certifying).
 *
 * Nothing here is a detection rule for the canonical core. The census thresholds are the ones the earlier audits
 * already used (raw overnight move of 10x without a declared split, #705/#721; declared split day whose total-return
 * step is 2x or more, #721 defectDays), so the populations can be joined. Independent labels come only from SEC 8-K
 * effective split statements, the FINRA OTC Daily List and SEC share counts (corporate-action-v3 labels.mjs with the
 * vendor channel switched off). No second price vendor is read or published.
 *
 * Scenario transforms reuse existing mechanisms: a "cut" is the tournament's own data quarantine (bars from the event
 * on are dropped, a DATA_QUARANTINE terminal follows), a "normalization" applies an independently stated split ratio
 * exactly like a declared provider split would have been applied (return-series geometry).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export const VERSION = 'vu-price-root-cause-audit-1.0.0';
export const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const finite = (x) => typeof x === 'number' && Number.isFinite(x);
export const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };
export const r1 = (x) => (finite(x) ? Math.round(x * 10) / 10 : null);
export const r3 = (x) => (finite(x) ? Math.round(x * 1000) / 1000 : null);
export const r4 = (x) => (finite(x) ? Math.round(x * 1e4) / 1e4 : null);
const imp = (root, rel) => import(pathToFileURL(path.join(root, rel)).href);
const daysApart = (a, b) => Math.abs(Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 864e5;

/** Census thresholds of the earlier audits (joined, not tuned). */
export const CENSUS = Object.freeze({ undeclaredRawJump: 10, declaredResidualStep: 2, secWindowDays: 10, finraWindowDays: 10 });

/* ------------------------------------------------------------------ loaders */

/** Tournament + V4 pipeline from the pinned #705 checkout, labels/FINRA from the pinned v3 checkout. */
export async function loadModules(baseRoot, v3Root) {
  const T = 'scripts/supertrader/research/';
  const [ci, rr, methods, metrics, r3m, r4m, policy, sanity, cons, cmp, diag, listing] = await Promise.all([
    imp(baseRoot, T + 'certification/canonical-input.mjs'), imp(baseRoot, T + 'certification/run-rerun.mjs'),
    imp(baseRoot, T + 'tournament/methods.mjs'), imp(baseRoot, T + 'tournament/metrics.mjs'),
    imp(baseRoot, T + 'calibration/runner-certified-v3.mjs'), imp(baseRoot, T + 'v4/methods/runner-v4.mjs'),
    imp(baseRoot, T + 'v4/measurement/measurement-policy-v4.mjs'), imp(baseRoot, T + 'v4/measurement/price-sanity-v4.mjs'),
    imp(baseRoot, T + 'v4/oracle/constructions-v4.mjs'), imp(baseRoot, T + 'v4/oracle/compare-v4.mjs'),
    imp(baseRoot, T + 'v4/diagnose-calibration-v4.mjs'), imp(baseRoot, 'scripts/supertrader/validation/lib.mjs')]);
  const labels = v3Root ? await imp(v3Root, 'scripts/quant/corporate-action-v3/labels.mjs') : null;
  const FDL = v3Root ? require(path.join(v3Root, 'quant/engines/finra-daily-list.js')) : null;
  const protocol = JSON.parse(fs.readFileSync(path.join(baseRoot, T + 'tournament/protocol.json')));
  return { ci, rr, methods, metrics, r3m, r4m, policy, sanity, cons, cmp, diag, listing, labels, FDL, protocol, baseRoot };
}

/** Canonical capture -> raw dataset (tournament input) and the tournament's prepared data. */
export function loadCapture(M, dir) {
  const raw = M.ci.loadCanonicalData(dir, { sourceProvenanceOverlay: true, expectedSourceMetadataSha256: sha(fs.readFileSync(path.join(dir, 'data-certification-inputs.json'))) });
  return { raw, prepared: M.rr.prepareRerunData(raw, M.protocol).data };
}

/** SEC 8-K/6-K corporate-action events (merged inputs of v3 run 39019906367) keyed by 10-digit CIK. */
export function loadSec(file) {
  if (!file || !fs.existsSync(file)) return { byCik: {}, available: false };
  return { byCik: JSON.parse(fs.readFileSync(file, 'utf8')).ciks || {}, available: true };
}
/** FINRA OTC Daily List rows (same merged inputs) indexed by symbol. */
export function loadFinra(file, FDL) {
  const bySym = new Map();
  if (!file || !fs.existsSync(file) || !FDL) return { bySym, available: false };
  for (const x of JSON.parse(fs.readFileSync(file, 'utf8')).rows.map(FDL.observation)) {
    for (const s of new Set([x.oldSymbol, x.newSymbol].filter(Boolean).map((t) => String(t).toUpperCase()))) { if (!bySym.has(s)) bySym.set(s, []); bySym.get(s).push(x); }
  }
  return { bySym, available: true };
}

/* ------------------------------------------------------------------ census */

export const sharesOf = (s) => (s.fundamentals || []).filter((f) => f.key === 'shares_outstanding' && finite(f.value))
  .map((f) => ({ periodEnd: f.periodEnd ?? null, availableAt: f.availableAt, value: f.value }));
export const cikOf = (s) => (s.issuerCik ? String(s.issuerCik).padStart(10, '0') : null);
const hasSplit = (b) => finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9;

/**
 * Every return-relevant discontinuity inside the canonical (valid) bars of one security:
 *  UNDECLARED_RAW_JUMP_10X   raw overnight ratio >= 10x or <= 1/10 on a day without a declared split
 *  DECLARED_SPLIT_RESIDUAL   declared split day whose total-return step is still >= 2x or <= 1/2
 */
export function censusOf(s) {
  const out = [], bars = s.bars || [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1], b = bars[i];
    if (!(a.totalReturnIndex > 0 && b.totalReturnIndex > 0 && a.rawClose > 0 && b.rawClose > 0)) continue;
    const g = b.totalReturnIndex / a.totalReturnIndex, r = b.rawClose / a.rawClose;
    if (!hasSplit(b) && Math.abs(Math.log(r)) >= Math.log(CENSUS.undeclaredRawJump)) out.push({ i, date: b.date, kind: 'UNDECLARED_RAW_JUMP_10X', rawRatio: r, trStep: g, dir: r > 1 ? 'UP' : 'DOWN' });
    else if (hasSplit(b) && Math.abs(Math.log(g)) >= Math.log(CENSUS.declaredResidualStep)) out.push({ i, date: b.date, kind: 'DECLARED_SPLIT_RESIDUAL', rawRatio: r, trStep: g, declared: b.splitFactor, dir: g > 1 ? 'UP' : 'DOWN' });
  }
  return out;
}

/**
 * Independent evidence for one census event (no vendor channel).
 * Classes: CONFIRMED_BY_INDEPENDENT_SOURCE (FINRA split, SEC 8-K effective split or SEC share count explains the move),
 * INDEPENDENT_EVIDENCE_AGAINST_SPLIT (SEC share count unchanged, no FINRA/SEC split), UNRESOLVED (channels exist,
 * none decides), INSUFFICIENT_EVIDENCE (no channel covers the day).
 */
export function labelEvent(M, s, ev, sec, finra) {
  const L = M.labels, FDL = M.FDL, rawBars = s.bars.map((b) => ({ date: b.date, close: b.rawClose, volume: b.rawVolume, splitFactor: b.splitFactor }));
  const finraObs = FDL && finra.available ? FDL.forListing(finra.bySym.get(String(s.ticker).toUpperCase()) || [], { ticker: s.ticker, from: s.bars[0]?.date || s.listing?.startDate, to: s.listing?.endDate, name: null }) : [];
  const ctx = { bars: rawBars, vendor: null, vendorIdentity: null, finraObs, shares: sharesOf(s) };
  const r = ev.kind === 'DECLARED_SPLIT_RESIDUAL' ? ev.trStep : ev.rawRatio;
  const e = L.evidenceAt(ctx, ev.date, r);
  const secRows = (sec.byCik[cikOf(s)] || {}).events || [];
  const secNear = secRows.filter((x) => x.stage === 'EFFECTIVE' && finite(x.ratio) && (x.marketDate || x.effectiveDate) && daysApart(x.marketDate || x.effectiveDate, ev.date) <= CENSUS.secWindowDays);
  const secExplains = secNear.find((x) => L.explains(r, x.ratio)) || null;
  const finraRatio = e.finra?.split?.ratio ?? null;
  let cls;
  if (e.finraSplitExplains || secExplains || e.shares === 'CONFIRMS') cls = 'CONFIRMED_BY_INDEPENDENT_SOURCE';
  else if (e.shares === 'NO_SPLIT' && !e.finra?.split && !secNear.length) cls = 'INDEPENDENT_EVIDENCE_AGAINST_SPLIT';
  else if (e.shares === 'NONE' && !finraObs.length && !secRows.length) cls = 'INSUFFICIENT_EVIDENCE';
  else cls = 'UNRESOLVED';
  /* a stated ratio (FINRA or SEC 8-K) that explains the move is the only basis for a normalization; a share count alone is not */
  const statedRatio = e.finraSplitExplains ? finraRatio : secExplains ? secExplains.ratio : null;
  /* a share-count confirmation alone can be produced by a DECLARED split within the share-count window (+-200 days) */
  const declaredNear = s.bars.some((b) => hasSplit(b) && b.date !== ev.date && daysApart(b.date, ev.date) <= 200);
  const channel = e.finraSplitExplains ? 'FINRA' : secExplains ? 'SEC_8K' : e.shares === 'CONFIRMS' ? (declaredNear ? 'SEC_SHARES_ONLY_DECLARED_SPLIT_NEAR' : 'SEC_SHARES_ONLY') : null;
  return { cls, channel, finraSplit: !!e.finraSplitExplains, sec8k: !!secExplains, shares: e.shares, statedRatio,
    channels: { finraObs: finraObs.length, secEvents: secRows.length, shareRows: ctx.shares.length } };
}

/** Census + labels for a whole dataset. Returns events keyed by security id. */
export function labelledCensus(M, data, sec, finra) {
  const bySec = new Map();
  for (const s of data.securities) {
    const evs = censusOf(s);
    if (!evs.length) continue;
    bySec.set(s.id, evs.map((ev) => ({ ...ev, label: labelEvent(M, s, ev, sec, finra) })));
  }
  return bySec;
}

/* ------------------------------------------------------------------ scenario transforms (pure) */

/** Applies an independently stated split ratio q (new shares per old share) on bar k, as a declared split would be. */
export function normalizeAt(s, k, q) {
  const bars = s.bars.map((b, j) => (j < k ? { ...b, open: b.open / q, high: b.high / q, low: b.low / q, close: b.close / q, volume: b.volume * q,
    dividend: b.dividend / q, totalReturnIndex: b.totalReturnIndex / q, splitAdjustmentFactor: (b.splitAdjustmentFactor || 1) * q } : b));
  return { ...s, bars };
}
/** Cuts the series at bar k like the tournament's own data quarantine (no bar from the event day on). */
export function cutAt(s, k, reason) {
  const bars = s.bars.slice(0, k);
  if (bars.length < 2) return null;
  const date = s.bars[k].date;
  return { ...s, bars, dataQuarantine: { from: date, observedAt: date, reason, confidence: 'LOW', lastValidDate: bars.at(-1).date },
    terminal: { date, observedAt: date, lastKnownDate: bars.at(-1).date, lastClose: bars.at(-1).close, kind: 'DATA_QUARANTINE', confidence: 'LOW', proceedsKnown: false } };
}
/**
 * Applies a decision per event. decide(ev) -> 'NORMALIZE' | 'CUT' | null. Events are applied in date order; a cut ends
 * the series, so later events of that security are moot. Returns new data plus an audit of what was applied.
 */
export function applyEvents(data, census, decide) {
  const audit = { normalized: 0, cut: 0, removed: 0, securities: new Set() };
  const securities = [];
  for (const s0 of data.securities) {
    const evs = census.get(s0.id);
    if (!evs) { securities.push(s0); continue; }
    let s = s0, dropped = false;
    for (const ev of [...evs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const d = decide(ev);
      if (!d) continue;
      const k = s.bars.findIndex((b) => b.date === ev.date);
      if (k < 1) continue;
      audit.securities.add(s0.id);
      if (d === 'NORMALIZE') { s = normalizeAt(s, k, ev.label.statedRatio); audit.normalized++; continue; }
      const c = cutAt(s, k, 'ROOT_CAUSE_AUDIT_' + ev.kind);
      audit.cut++;
      if (!c) { dropped = true; audit.removed++; break; }
      s = c; break;
    }
    if (!dropped) securities.push(s);
  }
  return { data: { ...data, securities }, audit: { normalized: audit.normalized, cut: audit.cut, removed: audit.removed, securities: audit.securities.size } };
}
/** Whole-series policy: every security with any data quarantine is removed (as the Quant studies do). */
export function dropQuarantined(data) {
  const securities = data.securities.filter((s) => !s.dataQuarantine);
  return { data: { ...data, securities }, audit: { removed: data.securities.length - securities.length } };
}

/* ------------------------------------------------------------------ backtest metrics */

export function runMetrics(M, run, data) {
  const cap = M.protocol.execution.initialCapital;
  const pm = M.metrics.portfolioMetrics(run.curve, { initialCapital: cap, turnover: run.turnover, trades: run.trades, executionCosts: run.executionCosts });
  const exposure = run.curve.map((p) => p.exposure).filter(finite);
  return { cagr: pm.cagr, maxDrawdown: pm.maxDrawdown, sharpe: pm.sharpe, totalReturn: pm.totalReturn, finalEquity: pm.finalEquity,
    meanExposure: exposure.length ? exposure.reduce((a, b) => a + b, 0) / exposure.length : null, trades: run.trades.length,
    positions: new Set(run.trades.map((t) => t.id + '|' + t.entryDate)).size, terminalCount: run.terminalCount, executionCosts: run.executionCosts };
}
export function benchmarkMetrics(M, data) {
  const cap = M.protocol.execution.initialCapital, curve = M.r3m.benchmarkCurve(data, cap);
  const pm = M.metrics.portfolioMetrics(curve, { initialCapital: cap });
  return { cagr: pm.cagr, maxDrawdown: pm.maxDrawdown, sharpe: pm.sharpe };
}

/**
 * Which trades touch the event population: in an event security at all, open across an event day (direct P&L impact),
 * or entered within one year after an event (signal/ranking contamination of look-back rules).
 */
export function tradeExposure(run, census, calendar) {
  const pos = new Map(calendar.map((d, i) => [d, i]));
  const out = { tradeRecords: run.trades.length, inEventSecurities: 0, spanningEvent: 0, enteredWithin252AfterEvent: 0, pnlSpanning: 0, pnlInEventSecurities: 0,
    distinctEventSecuritiesTraded: 0, eventMonthsHeld: 0, byClass: {} };
  const ids = new Set(), months = new Set();
  for (const t of run.trades) {
    const evs = census.get(t.id);
    if (!evs) continue;
    out.inEventSecurities++; out.pnlInEventSecurities += finite(t.pnl) ? t.pnl : 0; ids.add(t.id);
    const span = evs.filter((e) => t.entryDate < e.date && e.date <= t.date);
    if (span.length) { out.spanningEvent++; out.pnlSpanning += finite(t.pnl) ? t.pnl : 0; span.forEach((e) => { months.add(t.id + '|' + e.date.slice(0, 7)); inc(out.byClass, e.kind + ':' + e.label.cls); }); }
    const ei = pos.get(t.entryDate);
    if (finite(ei) && evs.some((e) => e.date <= t.entryDate && finite(pos.get(e.date)) && ei - pos.get(e.date) <= 252)) out.enteredWithin252AfterEvent++;
  }
  out.distinctEventSecuritiesTraded = ids.size; out.eventMonthsHeld = months.size;
  return out;
}

/* ------------------------------------------------------------------ sealing (owner key only) */

export function sealForOwner(M, bytes, file) {
  const pem = fs.readFileSync(path.join(M.baseRoot, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const sealed = M.listing.encryptForOwner(pem, bytes);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, sealed, { flag: 'wx' });
  return { audience: 'owner', file: path.basename(file), plaintextSha256: sha(bytes), sealedSha256: sha(Buffer.from(sealed)) };
}

export function args(argv) { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; return o; }
export const writeJson = (f, o) => { fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
