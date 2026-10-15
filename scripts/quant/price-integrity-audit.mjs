#!/usr/bin/env node
/**
 * Price-integrity audit (V4-D1 / V4-D2) inside the protected Actions runner. No performance, no calibration.
 *
 * Stage `population` (BEFORE = canonical capture with the unchanged core 1.0.0):
 *   1. loads the capture with the pinned #705 pipeline (canonical input -> rerun preparation -> V4 price sanity ->
 *      causal terminals) and recomputes the V4 diagnostic population exactly: every security-month with a holding
 *      return above +100 % or below -99 % (diagnostic classes UNDECLARED_RAW_JUMP_10X, DECLARED_SPLIT_IN_MONTH, ...),
 *      the adjusted-level > 1e6 census and a daily raw-jump census (|raw ratio| >= 3 without a declared split);
 *   2. re-reads the raw store series of every affected security (provider adjustedClose, open, volume) and explains
 *      each suspicious day with quant/engines/price-integrity.js (root cause, evidence, confidence, policy);
 *   3. writes the private case file and the public counts.
 * Stage `rebuild` (AFTER = canonical capture with core 1.1.0): same pipeline, before/after counts, every new HOLD
 * explained (false-positive check), high-level names, corporate-action consistency, content binding of the dataset.
 * Stage `seal`: seals the private case file to the owner and session keys.
 *
 * Usage:
 *   node price-integrity-audit.mjs --stage population --base-root <#705 checkout> --capture <dir> --private <dir> --public <file>
 *   node price-integrity-audit.mjs --stage rebuild --base-root <dir> --capture <dir> --private <dir> --public <file>
 *   node price-integrity-audit.mjs --stage seal --private <dir> --owner-key <pem> --session-key <pem> --sealed-dir <dir> --public <file>
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const CTR = require(path.join(ROOT, 'quant/engines/canonical-total-return.js'));
const PI = require(path.join(ROOT, 'quant/engines/price-integrity.js'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };
const r4 = (x) => (finite(x) ? Math.round(x * 1e4) / 1e4 : null);

function args(argv) { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; return o; }
const imp = (root, rel) => import(pathToFileURL(path.join(root, rel)).href);

/** The exact V4 diagnostic pipeline, from the pinned #705 checkout. */
async function loadPipeline(baseRoot) {
  const V4 = 'scripts/supertrader/research/v4/';
  const [ci, rr, sanity, policy, cons, diag, cap] = await Promise.all([
    imp(baseRoot, 'scripts/supertrader/research/certification/canonical-input.mjs'), imp(baseRoot, 'scripts/supertrader/research/certification/run-rerun.mjs'),
    imp(baseRoot, V4 + 'measurement/price-sanity-v4.mjs'), imp(baseRoot, V4 + 'measurement/measurement-policy-v4.mjs'),
    imp(baseRoot, V4 + 'oracle/constructions-v4.mjs'), imp(baseRoot, V4 + 'diagnose-calibration-v4.mjs'), imp(baseRoot, 'scripts/supertrader/research/calibration/capture-v3-inrunner.mjs')]);
  const protocol = JSON.parse(fs.readFileSync(path.join(baseRoot, 'scripts/supertrader/research/tournament/protocol.json')));
  const freeze = JSON.parse(fs.readFileSync(path.join(baseRoot, V4 + 'SUPERTRADER-V4-FREEZE.json')));
  return { ci, rr, sanity, policy, cons, diag, cap, protocol, freeze };
}

function loadPrepared(P, dir) {
  const raw = P.ci.loadCanonicalData(dir, { sourceProvenanceOverlay: true, expectedSourceMetadataSha256: sha(fs.readFileSync(path.join(dir, 'data-certification-inputs.json'))) });
  const prepared = P.rr.prepareRerunData(raw, P.protocol).data;
  const census = P.sanity.priceSanityCensus(prepared.securities);
  const data = P.policy.applyCausalTerminals(P.sanity.applyPriceSanityQuarantine(prepared, census).data).data;
  return { raw, prepared, census, data };
}

/** Coverage and quarantine counts of a capture (public). */
function coverage(raw) {
  const reasons = {}, terminals = {};
  for (const s of raw.securities) { if (s.dataQuarantine) inc(reasons, s.dataQuarantine.reason); inc(terminals, s.terminal?.kind ?? 'OPEN'); }
  return { securities: raw.securities.length, bars: raw.securities.reduce((a, s) => a + s.bars.length, 0), quarantinesByReason: reasons, terminalsByKind: terminals,
    usableSegments: raw.coverage?.usableSegments ?? null, rejections: raw.coverage?.rejections ?? raw.coverage?.rejectionCodes ?? null };
}

/** Exactly the diagnose() outlier loop (holding returns of the EW_MARKET membership), plus the < -99 % months. */
function extremeMonths(P, data) {
  const calendar = P.cons.sessionCalendar(data), calIdx = new Map(calendar.map((d, i) => [d, i])), byId = new Map(data.securities.map((s) => [s.id, s]));
  const base = P.cons.buildConstructions(data, {});
  const out = [], counts = { gt100pct: 0, gt1000pct: 0, ltMinus99pct: 0 }, byClass = {};
  for (const m of base.months) {
    for (const id of m.EW_MARKET.privateMembership) {
      const s = byId.get(id), h = P.cons.holdingReturn(s, m.formation, m.end, calIdx);
      if (!h || !finite(h.ret)) continue;
      if (h.ret > 1) counts.gt100pct++; if (h.ret > 10) counts.gt1000pct++; if (h.ret < -0.99) counts.ltMinus99pct++;
      if (Math.abs(h.ret) > 1 || h.ret < -0.99) {
        const sig = P.diag.signature(s, m.formation, m.end), cls = h.ret > 1 ? P.diag.classifyOutlier(sig) : 'LT_MINUS_99PCT';
        inc(byClass, cls);
        out.push({ month: m.month, F: m.formation, E: m.end, id, ret: h.ret, diagnosticClass: cls, signature: sig });
      }
    }
  }
  return { cases: out, counts, byClass };
}

/** Raw-store re-read for a set of securities (provider adjustedClose, raw open/volume). Read-only, metered. */
const stats = { ok: 0, missing: 0, errors: 0, lastError: null };
async function rawReader(maxReads) {
  const Store = require(path.join(ROOT, 'quant/engines/history-store.js')), Guard = require(path.join(ROOT, 'quant/engines/zero-cost-guard.js'));
  const { createS3DriverFromEnv } = await import(pathToFileURL(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs')).href);
  const driver = createS3DriverFromEnv(process.env), budget = Guard.createBudget({ classAOperations: 0, classBOperations: 3 * maxReads + 10 });
  const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget }), pit = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US', budget });
  const [u, v] = await Promise.all([main.readUsage(), pit.readUsage()]);
  const usage = Guard.applyUsage(u, { classAOperations: v.classAOperations, classBOperations: v.classBOperations });
  if (Guard.evaluate({ usage, estimate: Guard.estimateOperations({ kind: 'VALIDATION_ANALYZE', objectReads: 3 * maxReads }), operation: 'VALIDATION_ANALYZE' }).verdict !== Guard.ALLOWED) throw new Error('ZERO_COST_GUARD_BLOCKED');
  return async (security) => {
    const key = security.priceSource?.sourceKey, l = security.listing || {};
    const candidates = [];
    if (key && (key.startsWith(pit.seriesPrefix) || key.startsWith(main.seriesPrefix))) {
      const store = key.startsWith(pit.seriesPrefix) ? pit : main;
      candidates.push([store, store.tickerFromKey(key.slice(store.seriesPrefix.length).replace(/\.json\.(zst|gz)$/, ''))]);
    }
    if (l.startDate) candidates.push([pit, `${security.ticker}@${l.startDate}`]);
    candidates.push([main, security.ticker]);
    for (const [store, symbol] of candidates) {
      try { const series = await store.getSeries(symbol); if (series?.bars?.length) { stats.ok++; return series.bars; } } catch (e) { stats.errors++; stats.lastError = String(e?.message || e).slice(0, 80); }
    }
    stats.missing++; return null;
  };
}

/** Raw bars of the security's segment window (store bars when available, else rebuilt from canonical raw columns). */
function rawBarsFor(security, storeBars) {
  const first = security.bars[0]?.date, last = security.listing?.endDate || '9999-12-31';
  if (Array.isArray(storeBars) && storeBars.length) {
    return { source: 'STORE', bars: storeBars.filter((b) => b.date >= first && b.date <= last).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      splitFactor: b.splitFactor ?? null, dividend: b.dividend ?? null, adjustedClose: b.adjustedClose ?? b.adjClose ?? null })) };
  }
  return { source: 'CANONICAL_RAW_COLUMNS', bars: security.bars.map((b) => ({ date: b.date, open: b.rawOpen, high: b.rawHigh, low: b.rawLow, close: b.rawClose, volume: b.rawVolume,
    splitFactor: b.splitFactor, dividend: finite(b.dividend) ? b.dividend * (b.splitAdjustmentFactor || 1) : 0, adjustedClose: null })) };
}
const sharesOf = (s) => (s.fundamentals || []).filter((f) => f.key === 'shares_outstanding' && finite(f.value)).map((f) => [f.availableAt, f.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const ctxOf = (s) => ({ shares: sharesOf(s), listing: { startDate: s.listing?.startDate, endDate: s.listing?.endDate, reusedLater: s.listing?.reusedLater === true } });
const window = (bars, i, k = 5) => bars.slice(Math.max(0, i - k), i + k + 1);
/** Severity order: a data-defect cause outranks a market move. */
const SEVERITY = ['TICKER_IDENTITY_MISMATCH', 'LISTING_CHANGE', 'DECLARED_SPLIT_DATE_SHIFT', 'DECLARED_SPLIT_INCONSISTENT', 'UNDECLARED_REVERSE_SPLIT', 'PROVIDER_SPIKE', 'CURRENCY_OR_UNIT', 'STALE_PRICE',
  'CORPORATE_ACTION_MISMATCH', 'UNDECLARED_FORWARD_SPLIT_POSSIBLE', 'UNRESOLVED', 'CONFIRMED_SPLIT', 'GENUINE_PRICE_MOVE'];

/**
 * Explains one security-month by its dominant day: the session with the largest |log| contribution of the canonical
 * total-return index inside (F, E]. That day is explained on the raw series; a declared split whose day still moves
 * the TR index by >= 1.8x is a normalization mismatch (the index does not follow the declared action).
 */
function explainMonth(rb, F, E, ctx, canon) {
  const days = [];
  for (let i = 1; i < canon.length; i++) {
    const b = canon[i]; if (b.date <= F || b.date > E) continue;
    const a = canon[i - 1]; if (!(a.totalReturnIndex > 0 && b.totalReturnIndex > 0)) continue;
    days.push({ date: b.date, contribution: Math.log(b.totalReturnIndex / a.totalReturnIndex), declared: finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9 });
  }
  const total = days.reduce((x, d) => x + d.contribution, 0);
  days.sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
  const top = days.slice(0, 3).map((d) => ({ date: d.date, trRatio: r4(Math.exp(d.contribution)), declaredSplit: d.declared }));
  const dom = days[0];
  const base = { monthLogReturn: r4(total), dominantDays: top, dominantShare: dom && total ? r4(dom.contribution / total) : null };
  if (!dom || Math.abs(dom.contribution) < Math.log(2)) return { cause: 'GENUINE_PRICE_MOVE', confidence: 'MEDIUM', locus: 'NONE', outcome: 'ACCEPT', reasonCode: 'GENUINE_MOVE_NO_DATA_SIGNATURE', days: [], ...base, note: 'no single session moves the TR index by 2x or more (gradual move)' };
  const i = rb.findIndex((b) => b.date === dom.date);
  const x = i > 0 ? PI.explainDay(rb, i, ctx) : null;
  if (!x) return { cause: 'UNRESOLVED', confidence: 'LOW', locus: 'UNKNOWN', outcome: 'ACCEPT', reasonCode: 'DISCONTINUITY_COUNTED_NOT_PROVEN', days: [], ...base, note: 'dominant day not in the raw series' };
  if (x.cause === 'CONFIRMED_SPLIT' && Math.abs(dom.contribution) >= Math.log(1.8)) {
    return { ...x, cause: 'CORPORATE_ACTION_MISMATCH', locus: 'VU_NORMALIZATION', confidence: 'MEDIUM', policyClass: 'CONFLICTING_SPLIT', outcome: 'QUARANTINE', reasonCode: 'CORPORATE_ACTION_CONTRADICTED',
      expected: 'TR index continuous across the declared split', observed: 'TR index x' + r4(Math.exp(dom.contribution)) + ' on the split day', days: [{ i, date: dom.date }], ...base };
  }
  if (x.cause === 'CONFIRMED_SPLIT') return { ...x, cause: 'GENUINE_PRICE_MOVE', days: [{ i, date: dom.date }], ...base };
  return { ...x, days: [{ i, date: dom.date }], ...base };
}
/** What the new core (1.1.0) decides on the raw series up to and including day `upTo`. */
function coreDecision(rb, upTo) {
  const prefix = rb.filter((b) => b.date <= upTo);
  if (prefix.length < 2) return null;
  const r = CTR.reconstruct(prefix, { identity: { state: 'CONFIRMED' } });
  return r.reconstructed ? { state: r.state } : { state: r.state, reason: r.reason, date: r.date ?? null, detail: typeof r.detail === 'string' ? r.detail : null };
}
const caseRecord = (s, rb, x, extra) => ({
  securityId: s.securityId ?? null, listingId: s.listing?.id ?? s.id, segmentId: s.id, ticker: s.ticker, exchange: (s.listing?.id || '').split(':')[1] ?? null, reusedLater: s.listing?.reusedLater === true,
  rawSource: rb.source, affectedDates: x.days?.map((d) => d.date) ?? [], rootCause: x.cause, confidence: x.confidence, locus: x.locus, policyClass: x.policyClass ?? null, outcome: x.outcome, reasonCode: x.reasonCode,
  expectedTransformation: x.expected ?? null, observedTransformation: x.observed ?? null, evidence: x.evidence ?? null,
  rawOhlc: x.days?.length ? window(rb.bars, x.days[0].i).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, splitFactor: b.splitFactor, dividend: b.dividend, providerAdjustedClose: b.adjustedClose })) : [],
  adjustedOhlc: x.days?.length ? window(s.bars, Math.max(0, s.bars.findIndex((b) => b.date === x.days[0].date))).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, splitAdjustmentFactor: b.splitAdjustmentFactor, totalReturnIndex: b.totalReturnIndex })) : [],
  corporateActionRecords: rb.bars.filter((b) => finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9).map((b) => ({ date: b.date, splitFactor: b.splitFactor })),
  monthAttribution: x.monthLogReturn !== undefined ? { monthLogReturn: x.monthLogReturn, dominantDays: x.dominantDays, dominantShare: x.dominantShare, note: x.note ?? null } : null,
  secShares: ctxOfShares(s), ...extra });
const ctxOfShares = (s) => sharesOf(s).slice(-12);

async function population(o) {
  const P = await loadPipeline(o['base-root']);
  const before = loadPrepared(P, o.capture);
  const binding = P.cap.computeContentBinding(o.capture), frozen = P.freeze.dataContract.canonicalCapture;
  const sameAsV4 = ['normalizedPartListSha256', 'normalizedManifestSha256', 'dataFingerprint'].every((k) => binding[k] === frozen[k]);
  return populationCore(P, before, binding, sameAsV4, (n) => rawReader(n), o);
}

export async function populationCore(P, before, binding, sameAsV4, makeReader, o) {
  const ext = extremeMonths(P, before.data);
  const byId = new Map(before.data.securities.map((s) => [s.id, s])), preparedById = new Map(before.prepared.securities.map((s) => [s.id, s]));
  const high = before.census.privateRows;
  // daily raw-jump census on the canonical (valid-prefix) bars: data only, independent of monthly returns
  const daily = { total: 0, byDirection: {}, coreSignature: 0, coreSpike: 0 };
  const dailyIds = new Set();
  for (const s of before.data.securities) for (let i = 1; i < s.bars.length; i++) {
    const a = s.bars[i - 1], b = s.bars[i];
    if (!(a.rawClose > 0 && b.rawClose > 0) || (finite(b.splitFactor) && b.splitFactor !== 1)) continue;
    const r = b.rawClose / a.rawClose; if (Math.abs(Math.log(r)) < Math.log(3)) continue;
    daily.total++; inc(daily.byDirection, r > 1 ? 'UP' : 'DOWN'); dailyIds.add(s.id);
  }
  const casesById = new Map(); for (const c of ext.cases) { if (!casesById.has(c.id)) casesById.set(c.id, []); casesById.get(c.id).push(c); }
  const highById = new Map(high.map((h) => [h.id, h]));
  const ids = [...new Set([...casesById.keys(), ...highById.keys(), ...dailyIds])];
  const read = await makeReader(ids.length);
  const cases = [], highCases = [], dailyCases = [], rawSources = {};
  // one security at a time: read, explain, release (bounded memory)
  for (const id of ids) {
    const s = byId.get(id) ?? preparedById.get(id); if (!s) continue;
    const rb = rawBarsFor(s, await read(s)); inc(rawSources, rb.source);
    const ctx = ctxOf(s);
    for (const c of casesById.get(id) ?? []) {
      const x = explainMonth(rb.bars, c.F, c.E, ctx, s.bars);
      cases.push({ kind: 'EXTREME_SECURITY_MONTH', month: c.month, ret: r4(c.ret), diagnosticClass: c.diagnosticClass, in83: c.diagnosticClass === 'UNDECLARED_RAW_JUMP_10X' || c.diagnosticClass === 'DECLARED_SPLIT_IN_MONTH',
        newCoreAtMonthEnd: coreDecision(rb.bars, c.E), ...caseRecord(s, rb, x, {}) });
    }
    const h = highById.get(id);
    if (h) {
      const hx = PI.explainHighLevel(preparedById.get(id) ?? s);
      let dayX = null;
      for (let i = 1; i < rb.bars.length; i++) { const a = rb.bars[i - 1], b = rb.bars[i]; if (a.close > 0 && b.close > 0 && !(finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9) && Math.abs(Math.log(b.close / a.close)) >= Math.log(10)) { dayX = PI.explainDay(rb.bars, i, ctx); if (dayX) dayX.date = b.date; break; } }
      highCases.push({ kind: 'ADJUSTED_LEVEL_GT_1E6', v4SanityClass: h.cls, v4Defect: h.defect, highLevelCause: hx?.cause ?? null, highLevelEvidence: hx?.evidence ?? null,
        firstUndeclaredJump: dayX && { date: dayX.date, cause: dayX.cause, confidence: dayX.confidence, evidence: dayX.evidence },
        newCoreFull: coreDecision(rb.bars, '9999-12-31'), securityId: s.securityId ?? null, listingId: s.listing?.id ?? s.id, segmentId: s.id, ticker: s.ticker, rawSource: rb.source, exchange: (s.listing?.id || '').split(':')[1] ?? null,
        corporateActionRecords: rb.bars.filter((b) => finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9).map((b) => ({ date: b.date, splitFactor: b.splitFactor })) });
    }
    if (dailyIds.has(id)) for (let i = 1; i < rb.bars.length; i++) {
      const a = rb.bars[i - 1], b = rb.bars[i];
      if (!(a.close > 0 && b.close > 0) || (finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9) || Math.abs(Math.log(b.close / a.close)) < Math.log(3)) continue;
      const x = PI.explainDay(rb.bars, i, ctx); if (!x) continue;
      if (x.evidence?.coreSignature) daily.coreSignature++; if (x.evidence?.coreSpike) daily.coreSpike++;
      dailyCases.push({ segmentId: s.id, date: b.date, cause: x.cause, confidence: x.confidence, locus: x.locus, outcome: x.outcome, reasonCode: x.reasonCode, rawRatio: r4(x.evidence.rawRatio), persists: x.evidence.persists ?? null, coreSignature: Boolean(x.evidence.coreSignature), coreSpike: x.evidence.coreSpike });
    }
  }
  fs.mkdirSync(o.private, { recursive: true, mode: 0o700 });
  const priv = { schema: 'quant-price-integrity-private-1.0.0', stage: 'population', captureBinding: binding, sameCanonicalContentAsV4Freeze: sameAsV4, extremeCases: cases, highLevelCases: highCases, dailyJumpCases: dailyCases,
    beforeCoverage: coverage(before.raw), beforeExtremeKeys: ext.cases.map((c) => `${c.id}|${c.month}`), beforeHighIds: high.map((h) => h.id), rawSources };
  fs.writeFileSync(path.join(o.private, 'population.json'), JSON.stringify(priv), { mode: 0o600 });
  const tally = (rows, k) => rows.reduce((a, r) => inc(a, r[k] ?? 'NONE'), {});
  const in83 = cases.filter((c) => c.in83);
  const pub = { schema: 'quant-price-integrity-population-1.0.0', stage: 'BEFORE (canonical-total-return-1.0.0)', runId: process.env.GITHUB_RUN_ID ?? null, codeCommit: process.env.GITHUB_SHA ?? null,
    capture: { dataFingerprint: binding.dataFingerprint, normalizedPartListSha256: binding.normalizedPartListSha256, normalizedManifestSha256: binding.normalizedManifestSha256, securities: binding.securities, sameCanonicalContentAsV4Freeze: sameAsV4 },
    diagnosticReproduction: { extremeSecurityMonths: ext.counts, outliersByDiagnosticClass: ext.byClass, v4Diagnostic: { gt100pct: 2200, gt1000pct: 65, ltMinus99pct: 13, UNDECLARED_RAW_JUMP_10X: 55, DECLARED_SPLIT_IN_MONTH: 28 } },
    known83: { cases: in83.length, byRootCause: tally(in83, 'rootCause'), byLocus: tally(in83, 'locus'), byConfidence: tally(in83, 'confidence'), byOutcome: tally(in83, 'outcome'),
      byDiagnosticClassAndCause: in83.reduce((a, c) => inc(a, `${c.diagnosticClass}|${c.rootCause}`), {}), newCoreHoldsByMonthEnd: in83.filter((c) => c.newCoreAtMonthEnd && c.newCoreAtMonthEnd.state !== 'TOTAL_RETURN_RECONSTRUCTED').length,
      newCoreReasons: tally(in83.map((c) => ({ r: c.newCoreAtMonthEnd?.reason ?? 'RECONSTRUCTED' })), 'r') },
    allExtremeMonths: { cases: cases.length, byRootCause: tally(cases, 'rootCause'), byLocus: tally(cases, 'locus') },
    adjustedLevelGt1e6: { securities: highCases.length, byV4SanityClass: tally(highCases, 'v4SanityClass'), byCause: tally(highCases, 'highLevelCause'), firstUndeclaredJumpCause: tally(highCases.map((h) => ({ c: h.firstUndeclaredJump?.cause ?? 'NONE' })), 'c'),
      newCoreHolds: highCases.filter((h) => h.newCoreFull && h.newCoreFull.state !== 'TOTAL_RETURN_RECONSTRUCTED').length },
    dailyRawJumpCensus: { ...daily, byCause: tally(dailyCases, 'cause'), byLocus: tally(dailyCases, 'locus') },
    beforeCoverage: priv.beforeCoverage, rawSources: priv.rawSources, rawReads: stats, privateSha256: sha(fs.readFileSync(path.join(o.private, 'population.json'))), performanceCalculated: false };
  fs.mkdirSync(path.dirname(path.resolve(o.public)), { recursive: true });
  fs.writeFileSync(o.public, JSON.stringify(pub, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ stage: 'population', sameAsV4, extremes: ext.counts, byClass: ext.byClass, in83: in83.length, high: highCases.length }) + '\n');
}

async function rebuild(o) {
  const P = await loadPipeline(o['base-root']);
  const after = loadPrepared(P, o.capture), binding = P.cap.computeContentBinding(o.capture);
  return rebuildCore(P, after, binding, (n) => rawReader(n), o);
}

export async function rebuildCore(P, after, binding, makeReader, o) {
  const pop = JSON.parse(fs.readFileSync(path.join(o.private, 'population.json')));
  const ext = extremeMonths(P, after.data);
  const afterKeys = new Set(ext.cases.map((c) => `${c.id}|${c.month}`)), afterIds = new Map(after.data.securities.map((s) => [s.id, s]));
  const newHoldReasons = new Set(['SPLIT_SUSPECTED_UNDECLARED', 'PRICE_SPIKE_REVERTED']);
  const rawById = new Map(after.raw.securities.map((s) => [s.id, s]));
  const newHolds = after.raw.securities.filter((s) => s.dataQuarantine && newHoldReasons.has(s.dataQuarantine.reason));
  const read = await makeReader(newHolds.length + 5);
  const holdRows = [];
  for (const s0 of newHolds) {
    const s = s0, rb = rawBarsFor(s, await read(s));
    const i = rb.bars.findIndex((b) => b.date === s.dataQuarantine.from);
    const x = i > 0 ? PI.explainDay(rb.bars, i, ctxOf(s)) : null;
    const plausible = x && ['UNDECLARED_REVERSE_SPLIT', 'PROVIDER_SPIKE', 'DECLARED_SPLIT_DATE_SHIFT', 'CURRENCY_OR_UNIT', 'STALE_PRICE', 'LISTING_CHANGE', 'TICKER_IDENTITY_MISMATCH'].includes(x.cause);
    const persistsOrSpike = x && (x.cause === 'PROVIDER_SPIKE' || x.evidence?.persists === true || x.evidence?.secSharesInverse === true);
    holdRows.push({ segmentId: s.id, listingId: s.listing?.id, ticker: s.ticker, reason: s.dataQuarantine.reason, from: s.dataQuarantine.from, observedAt: s.dataQuarantine.observedAt, detail: s.dataQuarantine.detail ?? null,
      forensicCause: x?.cause ?? 'NOT_EXPLAINED', forensicConfidence: x?.confidence ?? null, evidence: x?.evidence ?? null,
      falsePositiveCandidate: !(plausible && persistsOrSpike), barsBefore: s.bars.length, rawOhlc: i > 0 ? window(rb.bars, i).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, providerAdjustedClose: b.adjustedClose })) : [] });
  }
  // before cases after the fix
  const fate = pop.extremeCases.map((c) => {
    const key = `${c.segmentId}|${c.month}`, s = afterIds.get(c.segmentId), q = rawById.get(c.segmentId)?.dataQuarantine;
    const stillExtreme = afterKeys.has(key);
    return { key, in83: c.in83, rootCause: c.rootCause, outcome: c.outcome, stillExtreme, afterQuarantine: q ? { reason: q.reason, from: q.from } : null, presentAfter: Boolean(s),
      resolvedBy: stillExtreme ? null : q && newHoldReasons.has(q.reason) ? 'NEW_HOLD' : q ? 'OTHER_QUARANTINE' : !s ? 'SEGMENT_ABSENT' : 'NO_LONGER_EXTREME' };
  });
  const highFate = pop.highLevelCases.map((h) => { const q = rawById.get(h.segmentId)?.dataQuarantine; return { segmentId: h.segmentId, cause: h.highLevelCause, v4SanityClass: h.v4SanityClass, presentAfter: Boolean(afterIds.get(h.segmentId)), afterQuarantine: q ? { reason: q.reason, from: q.from } : null }; });
  // corporate-action consistency: undeclared >= 10x raw jumps left inside canonical valid bars
  const jumps = (secs) => { let n = 0, sig = 0; for (const s of secs) for (let i = 1; i < s.bars.length; i++) { const a = s.bars[i - 1], b = s.bars[i]; if (!(a.rawClose > 0 && b.rawClose > 0) || (finite(b.splitFactor) && b.splitFactor !== 1)) continue; if (Math.abs(Math.log(b.rawClose / a.rawClose)) >= Math.log(10)) n++; } return n; };
  const afterCov = coverage(after.raw);
  const priv = { schema: 'quant-price-integrity-private-1.0.0', stage: 'rebuild', captureBinding: binding, newHolds: holdRows, beforeCaseFate: fate, highLevelFate: highFate };
  fs.writeFileSync(path.join(o.private, 'rebuild.json'), JSON.stringify(priv), { mode: 0o600 });
  const tally = (rows, k) => rows.reduce((a, r) => inc(a, r[k] ?? 'NONE'), {});
  const f83 = fate.filter((f) => f.in83);
  const pub = { schema: 'quant-price-integrity-rebuild-1.0.0', stage: 'AFTER (canonical-total-return-1.2.0, corporate-action-contract-1.2.0)', runId: process.env.GITHUB_RUN_ID ?? null, codeCommit: process.env.GITHUB_SHA ?? null,
    capture: { dataFingerprint: binding.dataFingerprint, normalizedPartListSha256: binding.normalizedPartListSha256, normalizedManifestSha256: binding.normalizedManifestSha256, normalizedInputsSha256: binding.normalizedInputsSha256, sourceObjectSetSha256: binding.sourceObjectSetSha256, securities: binding.securities,
      sameSourceObjectsAsBefore: binding.sourceObjectSetSha256 === pop.captureBinding.sourceObjectSetSha256, sameReadReceiptsAsBefore: binding.readReceiptSetSha256 === pop.captureBinding.readReceiptSetSha256 },
    coverage: { before: pop.beforeCoverage, after: afterCov },
    extremeSecurityMonths: { after: ext.counts, afterByDiagnosticClass: ext.byClass },
    known83: { total: f83.length, resolvedBy: tally(f83, 'resolvedBy'), stillExtremeByCause: tally(f83.filter((f) => f.stillExtreme), 'rootCause') },
    allExtremeFate: { total: fate.length, resolvedBy: tally(fate, 'resolvedBy'), stillExtremeByCause: tally(fate.filter((f) => f.stillExtreme), 'rootCause') },
    newHolds: { total: holdRows.length, byReason: tally(holdRows, 'reason'), byForensicCause: tally(holdRows, 'forensicCause'), falsePositiveCandidates: holdRows.filter((h) => h.falsePositiveCandidate).length },
    highLevel: { total: highFate.length, presentAfter: highFate.filter((h) => h.presentAfter).length, legitimatePresentAfter: highFate.filter((h) => ['LEGITIMATE_HIGH_NOMINAL_PRICE', 'ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS'].includes(h.cause) && h.presentAfter && !h.afterQuarantine).length,
      legitimateTotal: highFate.filter((h) => ['LEGITIMATE_HIGH_NOMINAL_PRICE', 'ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS'].includes(h.cause)).length, newlyQuarantined: highFate.filter((h) => h.afterQuarantine && newHoldReasons.has(h.afterQuarantine.reason)).length },
    corporateActionConsistency: { undeclared10xJumpsInsideCanonicalBars: { after: jumps(after.data.securities) } },
    rawReads: stats, privateSha256: sha(fs.readFileSync(path.join(o.private, 'rebuild.json'))), performanceCalculated: false, calibrationRun: false };
  fs.writeFileSync(o.public, JSON.stringify(pub, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ stage: 'rebuild', newHolds: pub.newHolds, known83: pub.known83 }) + '\n');
}

async function seal(o) {
  const { encryptForOwner } = await import(pathToFileURL(path.join(o['base-root'], 'scripts/supertrader/validation/lib.mjs')).href);
  const bytes = Buffer.from(JSON.stringify({ population: JSON.parse(fs.readFileSync(path.join(o.private, 'population.json'))), rebuild: fs.existsSync(path.join(o.private, 'rebuild.json')) ? JSON.parse(fs.readFileSync(path.join(o.private, 'rebuild.json'))) : null }));
  fs.mkdirSync(o['sealed-dir'], { recursive: true });
  const env = [['owner', o['owner-key']], ['session', o['session-key']]].map(([aud, k]) => { const f = path.join(o['sealed-dir'], `PRICE-INTEGRITY-PRIVATE.${aud}.sealed.json`), s = encryptForOwner(fs.readFileSync(k, 'utf8'), bytes); fs.writeFileSync(f, s); return { audience: aud, file: path.basename(f), sha256: sha(Buffer.from(s)) }; });
  fs.writeFileSync(o.public, JSON.stringify({ schema: 'quant-price-integrity-sealed-1.0.0', plaintextSha256: sha(bytes), plaintextBytes: bytes.length, envelopes: env }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2));
  const run = { population, rebuild, seal }[o.stage];
  if (!run) throw new Error('STAGE_REQUIRED');
  run(o).catch((e) => { process.stderr.write(JSON.stringify({ phase: 'PRICE_INTEGRITY_AUDIT', stage: o.stage, code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 5).map((l) => l.replace(/\(.*\/(scripts|quant)\//, '($1/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
export { explainMonth, coreDecision, rawBarsFor, extremeMonths, loadPipeline, coverage };
