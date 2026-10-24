/**
 * Kullamaegi EP (C09) / PS (C10) chart-first studies, Supertrader 6.0: clean per-method samples and a stratified
 * evaluation of the private IEX minute cache. DIAGNOSTIC_NOT_CERTIFIED. Pure functions (no IO).
 *
 * Why (review of run 39939887192):
 *  - both fetch loops walk the SAME global hash order (sha256 of `TICKER|date`); EP is fetched first, the PS loop skips
 *    every cached key. A PS candidate that is also an EP candidate (gap >= 10 %) is therefore cached up to the EP
 *    frontier, every other PS candidate only up to the (much shorter) PS frontier: evaluating "every cached PS day"
 *    over-represents the gap-up PS days (about 4.5x). The PS evaluation uses its own clean hash prefix only;
 *  - EP days without a usable IEX volume baseline are not executable under PACE_20 but executable without a volume
 *    rule: the EP variants ran on different day sets. Every EP variant now runs on one common day set.
 * A deterministic hash prefix is outcome-independent, but NOT automatically representative (finite-sample deviations
 * per year, liquidity or regime). The stratified evaluation equalises the sampling fraction across pre-registered
 * strata known at the decision; it is still a sample of the candidate days, never a full backtest.
 *
 * Every number below is a research convention (MODEL_ASSUMPTION), never a Kullamaegi source rule.
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';

export const KK_SAMPLE_VERSION = 'kk-sample-1.0.0';
export const LIQUIDITY_SESSIONS = 20; // same window as the research universe floor (RESEARCH_UNIVERSE.dollarVolumeSessions)
export const LIQUIDITY_BOUNDS = Object.freeze([10_000_000, 100_000_000]); // raw USD; every candidate is >= 1 M (universe floor)
export const LIQUIDITY_BUCKETS = Object.freeze(['LIQ_1M_10M', 'LIQ_10M_100M', 'LIQ_100M_PLUS']);
export const REGIME_SMA_SESSIONS = 200;
export const STRATA_MIN_POPULATION = 100;
export const STRATA_SCHEMES = Object.freeze([
  Object.freeze({ id: 'YEAR_X_LIQUIDITY', dims: Object.freeze(['year', 'liquidity']) }),
  Object.freeze({ id: 'YEAR_X_LIQUIDITY_X_REGIME', dims: Object.freeze(['year', 'liquidity', 'regime']) }),
]);
export const OUTSIDE_DAY_SET = 'NOT_EVALUATED_OUTSIDE_DAY_SET';

export const KK_SAMPLE_ASSUMPTIONS = Object.freeze([
  { id: 'MA-SAMPLE-CLEAN-PREFIX', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'per method the longest hash-order prefix of its own candidate keys that its own fetch path reached: EP up to the highest-ranked EP key with a cached baseline (only the EP path fetches baselines), PS up to the highest-ranked cached PS key that is not an EP candidate (only the PS path can have cached it). Cached keys beyond the prefix are dropped; keys inside it without a definitive answer are reported as holes', alternatives: [], why: 'review 6.0: the PS loop skipped keys cached by the EP loop, over-representing gap-up PS days' },
  { id: 'MA-SAMPLE-EP-COMMON-DAY-SET', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'every EP variant runs on one day set: keys in the EP prefix with minutes and an IEX volume baseline (mean > 0); days with too few IEX baseline sessions or too little history are excluded for ALL variants and counted', alternatives: [], why: 'review 6.0: PACE_20 and NONE ran on different day sets; the baseline is known at the prior close (point in time)' },
  { id: 'MA-STRAT-YEAR', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'calendar year of the trade day', alternatives: [], why: 'known at the decision; IEX coverage and market conditions differ by year' },
  { id: 'MA-STRAT-LIQUIDITY', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'mean raw dollar volume (raw close x raw volume) of the 20 sessions before the trade day, fixed nominal bounds: LIQ_1M_10M < 10 M <= LIQ_10M_100M < 100 M <= LIQ_100M_PLUS (USD); NA if a session is missing', alternatives: [], why: 'fixed decade bounds chosen before any result, known at the decision (population terciles would use later candidates); same measure as the universe floor (1 M). Nominal, not inflation adjusted' },
  { id: 'MA-STRAT-REGIME', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'SPY adjusted close of the prior session above its 200-session SMA (SPY_ABOVE_SMA200) or not (SPY_AT_OR_BELOW_SMA200); NA under 200 sessions. Optional dimension (scheme YEAR_X_LIQUIDITY_X_REGIME)', alternatives: [], why: 'common market-regime convention, known at the prior close' },
  { id: 'MA-STRAT-MIN-POPULATION', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'a stratum takes part only with at least 100 candidate keys (population); smaller strata are excluded from the stratified evaluation and counted', alternatives: [], why: 'the common fraction is the minimum over strata; tiny strata would drive it toward zero by chance' },
  { id: 'MA-STRAT-EQUAL-FRACTION', class: 'MODEL_ASSUMPTION', phase: 'SAMPLING', reference: 'common fraction f = min over eligible strata of (cached keys in the clean prefix / population); each eligible stratum keeps its first floor(f x population) cached prefix keys in hash order', alternatives: [], why: 'equal sampling fraction per stratum; hash rank inside the stratum stays outcome-independent' },
]);

export const sha256Hex = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
/** Deterministic order: sha256 of the key (no ranking by anything that could relate to an outcome); duplicates removed. */
export function hashOrder(keys) {
  const h = new Map([...new Set(keys)].map((k) => [k, sha256Hex(k)]));
  return [...h.keys()].sort((a, b) => (h.get(a) < h.get(b) ? -1 : h.get(a) > h.get(b) ? 1 : 0));
}

/** Proper median (mean of the two middle values for an even count); null when empty. */
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Clean hash prefix of one method. `orderedKeys` in hash order; `ownPath(k)`: k can only have been cached by this
 * method's fetch path; `cached(k)`: k is complete for this method. Returns the prefix keys (Set) and public counts.
 */
export function cleanPrefix(orderedKeys, { cached, ownPath }) {
  let last = -1;
  for (let r = 0; r < orderedKeys.length; r++) if (ownPath(orderedKeys[r])) last = r;
  const inPrefix = orderedKeys.slice(0, last + 1), keys = new Set(inPrefix.filter(cached));
  return { keys, counts: { population: orderedKeys.length, prefixLength: last + 1, cachedInPrefix: keys.size, holesInPrefix: inPrefix.length - keys.size, cachedBeyondPrefixDropped: orderedKeys.slice(last + 1).filter(cached).length } };
}

/** EP common day set: prefix keys with an IEX baseline mean > 0; the excluded keys counted by reason. */
export function epCommonDaySet(prefixKeys, baseCache) {
  const keys = new Set(), excluded = {};
  for (const k of prefixKeys) {
    const b = baseCache[k];
    if (b?.mean > 0) keys.add(k);
    else { const why = b?.reason === 'HISTORY' ? 'BASELINE_HISTORY_TOO_SHORT' : 'BASELINE_TOO_FEW_IEX_DAYS'; excluded[why] = (excluded[why] || 0) + 1; }
  }
  return { keys, excluded };
}

/** Mean raw dollar volume of the LIQUIDITY_SESSIONS sessions before index i; null if not measurable. */
export function liquidityAt(bars, i) {
  if (i < LIQUIDITY_SESSIONS) return null;
  let dv = 0;
  for (let k = i - LIQUIDITY_SESSIONS; k < i; k++) {
    const b = bars[k], c = b?.rawClose ?? b?.close, v = b?.rawVolume ?? b?.volume;
    if (!fin(c) || !fin(v)) return null;
    dv += c * v;
  }
  return dv / LIQUIDITY_SESSIONS;
}
export const liquidityBucket = (v) => (v === null || !fin(v) ? 'NA' : v < LIQUIDITY_BOUNDS[0] ? LIQUIDITY_BUCKETS[0] : v < LIQUIDITY_BOUNDS[1] ? LIQUIDITY_BUCKETS[1] : LIQUIDITY_BUCKETS[2]);

/** date -> SPY regime at that session's close (SPY adjusted bars of the snapshot). */
export function regimeByDate(benchmarkBars = []) {
  const out = new Map();
  for (let j = 0; j < benchmarkBars.length; j++) {
    let regime = 'NA';
    if (j >= REGIME_SMA_SESSIONS - 1 && fin(benchmarkBars[j].close)) {
      let s = 0, ok = true;
      for (let k = j - REGIME_SMA_SESSIONS + 1; k <= j; k++) { if (!fin(benchmarkBars[k].close)) { ok = false; break; } s += benchmarkBars[k].close; }
      if (ok) regime = benchmarkBars[j].close > s / REGIME_SMA_SESSIONS ? 'SPY_ABOVE_SMA200' : 'SPY_AT_OR_BELOW_SMA200';
    }
    out.set(benchmarkBars[j].date, regime);
  }
  return out;
}

/** Strata features of a candidate on trade day i of `bars` (everything known at the prior close). */
export function strataFeatures(bars, i, regimes) {
  return { year: bars[i].date.slice(0, 4), liquidity: liquidityBucket(liquidityAt(bars, i)), regime: (i > 0 && regimes.get(bars[i - 1].date)) || 'NA' };
}
export const stratumOf = (features, scheme) => scheme.dims.map((d) => features[d]).join('|');

/**
 * Equal-fraction stratified sample. population: Map key -> stratum; sampled: Set of keys available (clean prefix).
 * f = min over strata with population >= minPopulation of sampled/population (exact rational); each such stratum keeps
 * floor(f x population) of its sampled keys in hash order. Returns the kept keys and public per-stratum counts.
 */
export function stratifiedSample(population, sampled, minPopulation = STRATA_MIN_POPULATION) {
  const by = new Map();
  for (const [k, s] of population) { if (!by.has(s)) by.set(s, { all: 0, have: [] }); const g = by.get(s); g.all++; if (sampled.has(k)) g.have.push(k); }
  let num = null, den = null; // f = num / den
  for (const g of by.values()) if (g.all >= minPopulation && (num === null || g.have.length * den < num * g.all)) { num = g.have.length; den = g.all; }
  const keys = new Set(), strata = {};
  for (const s of [...by.keys()].sort()) {
    const g = by.get(s), eligible = g.all >= minPopulation, keep = eligible && num !== null ? Math.floor((num * g.all) / den) : 0;
    for (const k of hashOrder(g.have).slice(0, keep)) keys.add(k);
    strata[s] = { population: g.all, cachedInPrefix: g.have.length, kept: keep, eligible };
  }
  return { keys, fraction: num === null ? null : { num, den, value: num / den }, strata, excludedSmallStrata: Object.values(strata).filter((x) => !x.eligible).length };
}

export function kkSampleRegistrySha256() {
  return sha256Hex({ version: KK_SAMPLE_VERSION, liquidity: { sessions: LIQUIDITY_SESSIONS, bounds: LIQUIDITY_BOUNDS, buckets: LIQUIDITY_BUCKETS }, regimeSma: REGIME_SMA_SESSIONS, minPopulation: STRATA_MIN_POPULATION, schemes: STRATA_SCHEMES, assumptions: KK_SAMPLE_ASSUMPTIONS.map((a) => a.id) });
}
