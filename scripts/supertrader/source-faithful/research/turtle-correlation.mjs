/**
 * Turtle TUR-LIMIT6 / TUR-LIMIT10: research operationalisation of "closely / loosely correlated markets" for the
 * long-only equity adaptation. Research code, no activation, no change to methods/turtle.mjs.
 *
 * What the source fixes and what it does not (W-TUR printed p. 16, docs/SUPERTRADER_2_INDUSTRY_GROUP_DECISIONS.md):
 *  - the limits are RISK limits on Units (one Unit = 1 % of equity per 1 N move, TUR-UNIT): at most 6 Units in one
 *    direction in closely correlated markets, at most 10 in loosely correlated markets;
 *  - the groups are given only by futures examples (heating oil / crude oil, gold / silver, Swiss franc / Deutschmark,
 *    T-Bill / Eurodollar "etc."; loosely: gold / copper, silver / copper, grains);
 *  - there is no correlation measure, no window, no threshold and no rule to form groups from pairs.
 * Everything below is therefore an EQUITY MODEL ASSUMPTION (VU), never SOURCE_EXACT. Each variant names every number
 * it adds. Variants are pre-registered here, before any snapshot measurement, and are never selected by return.
 *
 * Causality: groups used on session d come from the last month-end anchor a <= d, computed from daily returns that
 * end at the close of a. The engine asks with the PRIOR session date (methods/turtle.mjs), so no group uses the bar
 * on which an order is decided. Nothing is interpolated: a security without a complete return window at the anchor
 * is UNKNOWN, never independent. What the engine does with an unknown security is an explicit policy:
 *  - REPORT_ONLY     groupsOf -> null: the engine limits it only by LIMIT4 / LIMIT12 and counts correlationGroupMissing;
 *  - POOLED_UNKNOWN  groupsOf -> { closely: 'UNKNOWN', loosely: 'UNKNOWN' }: all unknown securities share one closely
 *                    and one loosely group (conservative: unknown counts as correlated with every other unknown).
 *
 * Grouping: hierarchical clustering on the distance 1 - rho (nearest-neighbour chain, exact for single / complete /
 * average linkage, deterministic ties by index), cut at 1 - closelyThreshold and 1 - looselyThreshold. The cut of a
 * monotone dendrogram is nested: every closely group lies inside one loosely group.
 *  - COMPLETE linkage: every pair inside a group meets the threshold (closest to the pairwise examples of the source);
 *  - AVERAGE linkage: the mean pair meets it;
 *  - SINGLE linkage: a chain of pairs meets it (diagnostic only: chaining builds market-wide groups).
 */
import { fin, eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';

export const TURTLE_CORR_RESEARCH_VERSION = 'sf3-turtle-corr-1.0.0';

/** Reconstruction of the source intent (what a faithful operationalisation must preserve). */
export const SOURCE_INTENT = Object.freeze({
  rules: ['TUR-LIMIT6', 'TUR-LIMIT10'],
  source: 'W-TUR, The Original Turtle Trading Rules, printed p. 16 (pinned file sha256 cfd448f2...593d4, #709)',
  established: Object.freeze([
    'the limits cap RISK measured in Units (TUR-UNIT: one Unit = 1 % of the account per 1 N); several Units in markets that move together act like one larger bet',
    'the caps are per direction (6 long or 6 short Units closely, 10 loosely); the equity adaptation is long only, so only the long caps can bind',
    'closely and loosely are two nested levels: the loosely examples (gold / copper, silver / copper, grains) are wider complexes around the closely pairs',
    'the examples are economic substitutes or the same underlying exposure (crude / heating oil, gold / silver, CHF / DEM, T-Bill / Eurodollar), not an industry classification',
  ]),
  notEstablished: Object.freeze(['correlation measure', 'observation window and frequency', 'thresholds for closely / loosely', 'how groups are formed from pairs', 'recalculation frequency', 'translation to single stocks']),
  consequence: 'any equity operationalisation is a declared VU model assumption; TUR-SF-LIMIT-CORR stays source-open and is not SOURCE_EXACT',
  rejected: Object.freeze([
    'a SIC level as the correlation definition (owner decision 2026-10-20: no SIC level counts as a correlation definition; SIC describes the business, not co-movement)',
    'a variant chosen by backtest return',
    'treating an unknown correlation as independence without saying so',
  ]),
});

/**
 * Pre-registered model variants (2026-10-21, before any snapshot measurement). Numbers are VU choices:
 *  - windows 63 / 126 / 252 sessions = one quarter / half year / year of daily returns (conventional horizons);
 *  - absolute thresholds 0.70 / 0.50 (and 0.80 / 0.60) for raw returns, 0.50 / 0.30 for market-residual returns
 *    (residuals remove the common market factor, so their correlations are lower by construction);
 *  - PAIR_QUANTILE thresholds rank pairs within the anchor's own pair distribution (top 0.5 % / 2.5 %), so a market
 *    wide correlation spike does not merge the universe into one group.
 * None is a source number; none is a recommendation. The baseline label only marks the comparison anchor.
 */
const V = (id, basis, windowSessions, linkage, threshold, extra = {}) => Object.freeze({ id, basis, windowSessions, linkage, threshold: Object.freeze(threshold), minCoverage: 1, recompute: 'MONTH_END', population: 'RESEARCH_UNIVERSE_AT_ANCHOR', sourceStatus: 'EQUITY_MODEL_ASSUMPTION', ...extra });
export const CORRELATION_VARIANTS = Object.freeze([
  V('RAW-126-COMPLETE-70-50', 'RAW', 126, 'COMPLETE', { kind: 'ABSOLUTE', closely: 0.7, loosely: 0.5 }, { role: 'BASELINE_FOR_COMPARISON' }),
  V('RAW-63-COMPLETE-70-50', 'RAW', 63, 'COMPLETE', { kind: 'ABSOLUTE', closely: 0.7, loosely: 0.5 }, { role: 'WINDOW_SENSITIVITY' }),
  V('RAW-252-COMPLETE-70-50', 'RAW', 252, 'COMPLETE', { kind: 'ABSOLUTE', closely: 0.7, loosely: 0.5 }, { role: 'WINDOW_SENSITIVITY' }),
  V('RAW-126-COMPLETE-80-60', 'RAW', 126, 'COMPLETE', { kind: 'ABSOLUTE', closely: 0.8, loosely: 0.6 }, { role: 'THRESHOLD_SENSITIVITY' }),
  V('RES-126-COMPLETE-50-30', 'MARKET_RESIDUAL', 126, 'COMPLETE', { kind: 'ABSOLUTE', closely: 0.5, loosely: 0.3 }, { role: 'BASIS_SENSITIVITY' }),
  V('RES-126-AVERAGE-50-30', 'MARKET_RESIDUAL', 126, 'AVERAGE', { kind: 'ABSOLUTE', closely: 0.5, loosely: 0.3 }, { role: 'LINKAGE_SENSITIVITY' }),
  V('RAW-126-COMPLETE-Q005-Q025', 'RAW', 126, 'COMPLETE', { kind: 'PAIR_QUANTILE', closely: 0.005, loosely: 0.025 }, { role: 'REGIME_ROBUST_THRESHOLD' }),
  V('RAW-126-SINGLE-70-50', 'RAW', 126, 'SINGLE', { kind: 'ABSOLUTE', closely: 0.7, loosely: 0.5 }, { role: 'DIAGNOSTIC_CHAINING' }),
]);
export const UNKNOWN_POLICIES = Object.freeze(['REPORT_ONLY', 'POOLED_UNKNOWN']);
export const UNKNOWN_REASON = Object.freeze({
  NO_ANCHOR: 'NO_ANCHOR_BEFORE_DATE',
  NOT_IN_POPULATION: 'NOT_IN_POPULATION_AT_ANCHOR',
  INCOMPLETE_RETURNS: 'INCOMPLETE_RETURN_WINDOW',
  BENCHMARK_INCOMPLETE: 'BENCHMARK_INCOMPLETE_FOR_RESIDUALS',
  UNKNOWN_SECURITY: 'SECURITY_NOT_IN_DATASET',
});

export function validateVariant(v) {
  const errors = [];
  if (!['RAW', 'MARKET_RESIDUAL'].includes(v.basis)) errors.push('BASIS');
  if (!(Number.isInteger(v.windowSessions) && v.windowSessions >= 20)) errors.push('WINDOW');
  if (!['SINGLE', 'COMPLETE', 'AVERAGE'].includes(v.linkage)) errors.push('LINKAGE');
  const t = v.threshold || {};
  if (t.kind === 'ABSOLUTE' && !(t.closely > t.loosely && t.loosely > -1 && t.closely <= 1)) errors.push('THRESHOLD_ORDER');
  if (t.kind === 'PAIR_QUANTILE' && !(t.closely > 0 && t.closely < t.loosely && t.loosely < 1)) errors.push('QUANTILE_ORDER');
  if (!['ABSOLUTE', 'PAIR_QUANTILE'].includes(t.kind)) errors.push('THRESHOLD_KIND');
  if (!(v.minCoverage > 0 && v.minCoverage <= 1)) errors.push('MIN_COVERAGE');
  if (v.sourceStatus !== 'EQUITY_MODEL_ASSUMPTION') errors.push('SOURCE_STATUS_MUST_BE_MODEL_ASSUMPTION');
  return errors;
}

/** Month-end anchors: calendar sessions whose next session lies in another month. */
export function monthEndAnchors(calendar) {
  const out = [];
  for (let i = 0; i < calendar.length; i++) if (i === calendar.length - 1 || calendar[i + 1].slice(0, 7) !== calendar[i].slice(0, 7)) out.push(i);
  return out;
}

/**
 * Aligned close-to-close returns per security on the calendar (split-adjusted closes; dividends are not added, a
 * declared convention: co-movement of prices). A return needs a bar on the session and on the previous session.
 */
export function alignedReturns(securities, calendar) {
  const pos = new Map(calendar.map((d, i) => [d, i])), T = calendar.length;
  const out = new Map();
  for (const s of securities) {
    const c = new Float64Array(T).fill(NaN);
    const barIndex = new Int32Array(T).fill(-1);
    s.bars.forEach((b, k) => { const t = pos.get(b.date); if (t !== undefined && fin(b.close) && b.close > 0) { c[t] = b.close; barIndex[t] = k; } });
    const r = new Float64Array(T).fill(NaN);
    for (let t = 1; t < T; t++) if (c[t] === c[t] && c[t - 1] === c[t - 1]) r[t] = c[t] / c[t - 1] - 1;
    out.set(s.id, { r, barIndex, security: s });
  }
  return out;
}

function benchmarkReturns(benchmark, calendar) {
  if (!benchmark) return null;
  return alignedReturns([{ id: '__BENCH__', bars: benchmark }], calendar).get('__BENCH__').r;
}

/** Window vector of one security (or null if incomplete), market residual if `mkt` is given. */
function windowVector(r, a, W, minCoverage, mkt) {
  const x = new Float64Array(W);
  let n = 0;
  for (let k = 0; k < W; k++) { const v = r[a - W + 1 + k]; if (v === v) { x[k] = v; n++; } else x[k] = NaN; }
  if (n < Math.ceil(minCoverage * W)) return null;
  if (n < W) return null; // minCoverage < 1 is not supported without imputation; nothing is filled
  if (mkt) {
    let mm = 0, mx = 0; for (let k = 0; k < W; k++) { mm += mkt[k]; mx += x[k]; } mm /= W; mx /= W;
    let cov = 0, vm = 0; for (let k = 0; k < W; k++) { cov += (x[k] - mx) * (mkt[k] - mm); vm += (mkt[k] - mm) ** 2; }
    const beta = vm > 0 ? cov / vm : 0;
    for (let k = 0; k < W; k++) x[k] -= beta * mkt[k];
  }
  let m = 0; for (let k = 0; k < W; k++) m += x[k]; m /= W;
  let ss = 0; for (let k = 0; k < W; k++) { x[k] -= m; ss += x[k] * x[k]; }
  if (!(ss > 0)) return null;
  const inv = 1 / Math.sqrt(ss); for (let k = 0; k < W; k++) x[k] *= inv;
  return x;
}

/** Pearson correlation of two complete window vectors (unit norm, zero mean). */
const dot = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };

/**
 * Nearest-neighbour-chain agglomerative clustering on a symmetric distance matrix (Float64Array n*n, row major).
 * Returns merges [{ a, b, height, size }] where a, b are the smallest original index of each merged cluster.
 * Exact for the reducible linkages SINGLE / COMPLETE / AVERAGE; ties by lower index (deterministic).
 */
export function nnChainLinkage(D, n, linkage) {
  const active = new Uint8Array(n).fill(1), size = new Int32Array(n).fill(1), rep = Int32Array.from({ length: n }, (_, i) => i);
  const merges = [], chain = [];
  let remaining = n;
  const upd = linkage === 'SINGLE' ? (da, db) => Math.min(da, db) : linkage === 'COMPLETE' ? (da, db) => Math.max(da, db) : null;
  while (remaining > 1) {
    if (!chain.length) { let s = 0; while (!active[s]) s++; chain.push(s); }
    const x = chain.at(-1), prev = chain.length > 1 ? chain.at(-2) : -1;
    let best = -1, bd = Infinity;
    if (prev >= 0) { best = prev; bd = D[x * n + prev]; }
    for (let y = 0; y < n; y++) { if (!active[y] || y === x) continue; const d = D[x * n + y]; if (d < bd || (d === bd && best !== prev && y < best)) { bd = d; best = y; } }
    if (best === prev) {
      chain.pop(); chain.pop();
      const a = Math.min(x, prev), b = Math.max(x, prev);
      merges.push({ a: Math.min(rep[a], rep[b]), b: Math.max(rep[a], rep[b]), height: bd, size: size[a] + size[b] });
      for (let y = 0; y < n; y++) {
        if (!active[y] || y === a || y === b) continue;
        const da = D[a * n + y], db = D[b * n + y];
        const d = upd ? upd(da, db) : (size[a] * da + size[b] * db) / (size[a] + size[b]);
        D[a * n + y] = d; D[y * n + a] = d;
      }
      active[b] = 0; size[a] += size[b]; rep[a] = Math.min(rep[a], rep[b]); remaining--;
    } else chain.push(best);
  }
  return merges;
}

/** Labels (cluster representative = smallest original index) after merging every merge with height <= h. */
export function cutDendrogram(merges, n, h) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const m of merges) if (m.height <= h + 1e-12) { const ra = find(m.a), rb = find(m.b); if (ra !== rb) { const lo = Math.min(ra, rb), hi = Math.max(ra, rb); parent[hi] = lo; } }
  const lab = new Int32Array(n);
  for (let i = 0; i < n; i++) lab[i] = find(i);
  return lab;
}

/** Quantile of the upper-triangle correlations via a fine histogram (deterministic, resolution 0.0005). */
function pairQuantileThreshold(C, n, topShare) {
  const BINS = 4000, h = new Float64Array(BINS + 1);
  let total = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const b = Math.max(0, Math.min(BINS, Math.round((C[i * n + j] + 1) / 2 * BINS))); h[b]++; total++; }
  let need = topShare * total, acc = 0;
  for (let b = BINS; b >= 0; b--) { acc += h[b]; if (acc >= need) return b / BINS * 2 - 1; }
  return -1;
}

/**
 * Correlation groups at one anchor. ids: population (sorted). vectors: complete window vectors in the same order.
 * Returns { closely: Map id -> label, loosely: Map, thresholds, stats }.
 */
export function groupsAtAnchor(ids, vectors, variant) {
  const n = ids.length;
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) { C[i * n + i] = 1; for (let j = i + 1; j < n; j++) { const c = dot(vectors[i], vectors[j]); C[i * n + j] = c; C[j * n + i] = c; } }
  let closelyT = variant.threshold.closely, looselyT = variant.threshold.loosely;
  if (variant.threshold.kind === 'PAIR_QUANTILE') { closelyT = n > 1 ? pairQuantileThreshold(C, n, variant.threshold.closely) : 1; looselyT = n > 1 ? pairQuantileThreshold(C, n, variant.threshold.loosely) : 1; }
  const pairStats = (() => {
    if (n < 2) return null;
    let s = 0, k = 0, aboveC = 0, aboveL = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const c = C[i * n + j]; s += c; k++; if (c >= closelyT) aboveC++; if (c >= looselyT) aboveL++; }
    return { pairs: k, meanCorrelation: s / k, shareAboveClosely: aboveC / k, shareAboveLoosely: aboveL / k };
  })();
  const D = new Float64Array(n * n); for (let x = 0; x < n * n; x++) D[x] = 1 - C[x];
  const merges = n > 1 ? nnChainLinkage(D, n, variant.linkage) : [];
  const label = (lab, prefix) => { const m = new Map(); for (let i = 0; i < n; i++) m.set(ids[i], `${prefix}:${ids[lab[i]]}`); return m; };
  const cl = cutDendrogram(merges, n, 1 - closelyT), ll = cutDendrogram(merges, n, 1 - looselyT);
  const sizes = (lab) => { const c = new Map(); for (let i = 0; i < n; i++) c.set(lab[i], (c.get(lab[i]) || 0) + 1); const v = [...c.values()]; return { groups: v.length, multiMemberGroups: v.filter((x) => x > 1).length, largest: v.length ? Math.max(...v) : 0, shareInMultiMemberGroups: n ? v.filter((x) => x > 1).reduce((a, b) => a + b, 0) / n : 0 }; };
  return { closely: label(cl, 'C'), loosely: label(ll, 'L'), thresholds: { closely: closelyT, loosely: looselyT }, stats: { population: n, closely: sizes(cl), loosely: sizes(ll), pairs: pairStats } };
}

/**
 * Builds a point-in-time group provider for runTurtle({ groupsOf }).
 * data: { calendar, securities, benchmark } (runner/snapshot-input.mjs datasetFromPit). variant: CORRELATION_VARIANTS
 * entry. unknownPolicy: REPORT_ONLY | POOLED_UNKNOWN (no default: the caller decides and the run records it).
 */
export function createCorrelationGroupProvider(data, variant, { unknownPolicy, universe = RESEARCH_UNIVERSE, populationFilter = null, anchorCache = null } = {}) {
  const errors = validateVariant(variant);
  if (errors.length) throw new Error('INVALID_VARIANT:' + errors.join(','));
  if (!UNKNOWN_POLICIES.includes(unknownPolicy)) throw new Error('UNKNOWN_POLICY_REQUIRED');
  const calendar = data.calendar, pos = new Map(calendar.map((d, i) => [d, i]));
  const anchors = monthEndAnchors(calendar);
  const rets = alignedReturns(data.securities, calendar);
  const mktR = variant.basis === 'MARKET_RESIDUAL' ? benchmarkReturns(data.benchmark, calendar) : null;
  if (variant.basis === 'MARKET_RESIDUAL' && !mktR) throw new Error('BENCHMARK_REQUIRED_FOR_RESIDUALS');
  // anchorCache: share the computed anchors between providers of the SAME variant and data (e.g. the two unknown
  // policies); the groups do not depend on the policy
  const W = variant.windowSessions, cache = anchorCache ?? new Map();
  const counts = { lookups: 0, resolved: 0 }, reasons = {};
  const bump = (k) => { reasons[k] = (reasons[k] || 0) + 1; };

  function inPopulation(e, a) {
    const k = e.barIndex[a];
    if (k < 0) return false;
    if (populationFilter) return populationFilter(e.security, k);
    // tradable by the engine on the session after the anchor: research universe at the prior session (= the anchor)
    return eligibleAtPriorSession(e.security.bars, k + 1, universe);
  }
  function compute(a) {
    if (cache.has(a)) return cache.get(a);
    let res;
    if (a - W + 1 < 1) res = { unavailable: UNKNOWN_REASON.NO_ANCHOR };
    else {
      let mkt = null;
      if (mktR) { mkt = new Float64Array(W); for (let k = 0; k < W; k++) { const v = mktR[a - W + 1 + k]; if (v !== v) { mkt = null; break; } mkt[k] = v; } }
      if (mktR && !mkt) res = { unavailable: UNKNOWN_REASON.BENCHMARK_INCOMPLETE };
      else {
        const ids = [], vecs = [], excluded = new Map();
        for (const id of [...rets.keys()].sort()) {
          const e = rets.get(id);
          if (!inPopulation(e, a)) { excluded.set(id, UNKNOWN_REASON.NOT_IN_POPULATION); continue; }
          const v = windowVector(e.r, a, W, variant.minCoverage, mkt);
          if (!v) { excluded.set(id, UNKNOWN_REASON.INCOMPLETE_RETURNS); continue; }
          ids.push(id); vecs.push(v);
        }
        const g = groupsAtAnchor(ids, vecs, variant);
        res = { ...g, excluded, vectors: new Map(ids.map((id, i) => [id, vecs[i]])) };
      }
    }
    res.date = calendar[a];
    cache.set(a, res);
    return res;
  }
  function anchorFor(date) {
    const t = pos.has(date) ? pos.get(date) : (() => { let lo = -1; for (let i = 0; i < calendar.length && calendar[i] <= date; i++) lo = i; return lo; })();
    let best = -1; for (const a of anchors) { if (a <= t) best = a; else break; }
    return best;
  }
  /** Raw lookup with reason (measurement). */
  function lookup(id, date) {
    counts.lookups++;
    if (!rets.has(id)) { bump(UNKNOWN_REASON.UNKNOWN_SECURITY); return { status: 'UNKNOWN', reason: UNKNOWN_REASON.UNKNOWN_SECURITY }; }
    const a = anchorFor(date);
    if (a < 0) { bump(UNKNOWN_REASON.NO_ANCHOR); return { status: 'UNKNOWN', reason: UNKNOWN_REASON.NO_ANCHOR }; }
    const g = compute(a);
    if (g.unavailable) { bump(g.unavailable); return { status: 'UNKNOWN', reason: g.unavailable, anchor: g.date }; }
    if (!g.closely.has(id)) { const r = g.excluded.get(id) || UNKNOWN_REASON.NOT_IN_POPULATION; bump(r); return { status: 'UNKNOWN', reason: r, anchor: g.date }; }
    counts.resolved++;
    return { status: 'KNOWN', closely: g.closely.get(id), loosely: g.loosely.get(id), anchor: g.date };
  }
  function groupsOf(id, date) {
    const r = lookup(id, date);
    if (r.status === 'KNOWN') return { closely: `${variant.id}@${r.anchor}:${r.closely}`, loosely: `${variant.id}@${r.anchor}:${r.loosely}` };
    return unknownPolicy === 'POOLED_UNKNOWN' ? { closely: 'UNKNOWN', loosely: 'UNKNOWN' } : null;
  }
  /** Correlation of two securities at the anchor of `date` (null if either is unknown). Measurement only. */
  function pairCorrelation(idA, idB, date) {
    const a = anchorFor(date); if (a < 0) return null;
    const g = compute(a); if (g.unavailable) return null;
    const x = g.vectors.get(idA), y = g.vectors.get(idB);
    return x && y ? dot(x, y) : null;
  }
  /** Thresholds in force on `date` (PAIR_QUANTILE thresholds differ per anchor). */
  function thresholdsAt(date) {
    const a = anchorFor(date); if (a < 0) return null;
    const g = compute(a); return g.unavailable ? null : g.thresholds;
  }
  function anchorStats() {
    return [...cache.values()].filter((g) => !g.unavailable).sort((x, y) => x.date.localeCompare(y.date)).map((g) => ({ anchor: g.date, thresholds: g.thresholds, ...g.stats }));
  }
  /** Counters are cumulative over every lookup (engine and measurement); callers take differences per run. */
  function diagnostics() {
    return { version: TURTLE_CORR_RESEARCH_VERSION, variant: variant.id, unknownPolicy, sourceStatus: 'EQUITY_MODEL_ASSUMPTION', ...counts, unknown: counts.lookups - counts.resolved, unknownByReason: { ...reasons }, anchorsComputed: cache.size, unknownMeaning: 'UNKNOWN_NOT_INDEPENDENT' };
  }
  /** Same shape as adapters/industry-groups.mjs conformance(): never "conform". */
  function conformance(runResult) {
    const d = diagnostics(), missing = runResult?.counts?.correlationGroupMissing ?? null;
    return {
      rules: SOURCE_INTENT.rules, engineLabel: runResult?.correlationLimits ?? null, ruleConformance: 'NOT_ESTABLISHED',
      reasons: ['CORRELATION_OPERATIONALISATION_IS_EQUITY_MODEL_ASSUMPTION', ...(unknownPolicy === 'REPORT_ONLY' && missing ? ['UNKNOWN_GROUPS_LIMITED_ONLY_BY_LIMIT4_LIMIT12'] : []), ...(unknownPolicy === 'POOLED_UNKNOWN' ? ['UNKNOWN_SECURITIES_POOLED_CONSERVATIVELY'] : []), ...(d.unknown ? ['UNKNOWN_GROUP_IS_NOT_PROVEN_INDEPENDENCE'] : [])],
      entriesWithUnknownGroup: unknownPolicy === 'REPORT_ONLY' ? missing : null,
      diagnostics: d,
    };
  }
  return { variant, groupsOf, lookup, pairCorrelation, thresholdsAt, anchorStats, diagnostics, conformance };
}

const q = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
const dist = (v) => { const s = [...v].sort((a, b) => a - b); return { n: s.length, p50: q(s, 0.5), p95: q(s, 0.95), max: s.length ? s.at(-1) : null }; };

/**
 * Risk concentration of an ACTUAL run (any runTurtle result with a ledger), measured with a provider's groups as known
 * at each session (anchor <= session). Measurement only: it changes nothing in the run.
 * Units: one BUY row = +1 unit, one SELL row = -1 unit (methods/turtle.mjs books one row per unit).
 * Per session end: units in the largest closely / loosely group, units with unknown group, the largest pairwise
 * "neighbourhood" (units of held securities with rho >= the closely threshold to one held security, itself included),
 * and the unit-weighted mean pairwise correlation of the book.
 */
export function concentrationReport(runResult, provider, { calendar, from = null, to = null } = {}) {
  const rowsByDate = new Map();
  for (const r of runResult.ledger || []) { if (r.side !== 'BUY' && r.side !== 'SELL') continue; (rowsByDate.get(r.date) || rowsByDate.set(r.date, []).get(r.date)).push(r); }
  const units = new Map();
  const days = calendar.filter((d) => (!from || d >= from) && (!to || d <= to));
  const series = { maxClosely: [], maxLoosely: [], unknownUnits: [], neighbourhood: [], meanPairCorrelation: [], totalUnits: [] };
  let over6 = 0, over10 = 0, neighOver6 = 0, sessionsWithUnits = 0;
  const P = { closely: 6, loosely: 10 };
  for (const d of days) {
    for (const r of rowsByDate.get(d) || []) { const u = (units.get(r.id) || 0) + (r.side === 'BUY' ? 1 : -1); if (u > 0) units.set(r.id, u); else units.delete(r.id); }
    if (!units.size) continue;
    sessionsWithUnits++;
    const held = [...units.entries()];
    const gc = new Map(), gl = new Map(); let unknown = 0, total = 0;
    const info = held.map(([id, u]) => { total += u; const l = provider.lookup(id, d); if (l.status !== 'KNOWN') unknown += u; else { gc.set(l.closely, (gc.get(l.closely) || 0) + u); gl.set(l.loosely, (gl.get(l.loosely) || 0) + u); } return { id, u, l }; });
    const mc = gc.size ? Math.max(...gc.values()) : 0, ml = gl.size ? Math.max(...gl.values()) : 0;
    let neigh = 0, ws = 0, wn = 0;
    const thr = provider.thresholdsAt(d)?.closely ?? null;
    for (let i = 0; i < info.length; i++) {
      let nb = info[i].u;
      for (let j = 0; j < info.length; j++) {
        if (i === j) continue;
        const c = provider.pairCorrelation(info[i].id, info[j].id, d);
        if (c === null) continue;
        if (j > i) { ws += c * info[i].u * info[j].u; wn += info[i].u * info[j].u; }
        if (thr !== null && c >= thr) nb += info[j].u;
      }
      neigh = Math.max(neigh, nb);
    }
    series.maxClosely.push(mc); series.maxLoosely.push(ml); series.unknownUnits.push(unknown); series.neighbourhood.push(neigh); series.totalUnits.push(total);
    if (wn > 0) series.meanPairCorrelation.push(ws / wn);
    if (mc > P.closely) over6++; if (ml > P.loosely) over10++; if (neigh > P.closely) neighOver6++;
  }
  return {
    version: TURTLE_CORR_RESEARCH_VERSION, variant: provider.variant.id, label: 'MEASUREMENT_OF_RISK_CONCENTRATION_NOT_A_RULE_CHECK',
    sessionsWithUnits,
    unitsInLargestCloselyGroup: dist(series.maxClosely), unitsInLargestLooselyGroup: dist(series.maxLoosely),
    unitsWithUnknownGroup: dist(series.unknownUnits), largestPairwiseNeighbourhoodUnits: dist(series.neighbourhood),
    unitWeightedMeanPairCorrelation: dist(series.meanPairCorrelation), totalUnits: dist(series.totalUnits),
    sessionsAboveCap: { closely6: over6, loosely10: over10, pairwiseNeighbourhood6: neighOver6 },
    note: 'groups as known at each session (month-end anchor); the pairwise neighbourhood is the alternative reading of "closely correlated markets" (per security instead of per partition); measured, not enforced',
  };
}
