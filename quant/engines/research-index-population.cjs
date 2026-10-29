'use strict';
// Research-only PIT index population from SEC fund holdings (V12 SPXPOP, rules docs/quant-recovery/v12/spxpop/rules-1.0.1.json).
// Opt-in: nothing in the product, the weekly loader or any study reads this module. It provides
//   (1) pure functions used by the builder (scripts/quant/v12/spxpop/build-population.cjs): split classification,
//       fund-flow factor, status groups, period qualification;
//   (2) createIndexPopulation(): read access to the generated population (members, weights, period returns, status per
//       case) in docs/quant-recovery/v12/spxpop/population-<version>.json.gz. Fail-closed: without {optIn: true} it throws;
//       a data file whose sha256 differs from the manifest throws; periods that are not QUALIFIED are refused unless
//       {allowUnqualified: true}; bounded cases (unknown exit return, ambiguous corporate action) never get a point return
//       unless the caller names a scenario (boundedAs: 'ZERO' | 'LOWER').
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const RULE = Object.freeze({
  id: 'v12-spxpop-index-population', version: '1.0.1',
  TRIGGER_LOG: Math.log(1.15), RATIO_TOL: 0.05, MARGIN: 0.10, MAX_RESIDUAL: 1.0, CLEAN_LOG: Math.log(1.10),
  FUZZY_SIM: 0.6, BREAK_SIM: 0.5, FUZZY_Q_LOG: Math.log(1.5), FUZZY_RESID: 0.7, CROSS_PRICE_TOL: 0.02,
  SERIES_MAX_GAP_DAYS: 7, FROZEN_RUN: 4,
  MIN_COVERED_W: 0.97, MAX_BOUNDED_W: 0.03, TOL_PP_QUARTER: 0.5, APPROX_EXTRA_PP: 0.25, INTERNAL_AGREE: 0.99, INTERNAL_DR_PP: 0.1
});
const RATIOS = Object.freeze(['2', '3', '4', '5', '6', '7', '8', '10', '15', '20', '3/2', '4/3', '5/4', '5/2', '5/3', '1/2', '1/3', '1/4', '1/5', '1/6', '1/8',
  '1/10', '1/12', '1/15', '1/20', '1/25', '1/30', '1/40', '1/50', '2/3', '3/4', '4/5', '2/5'].map(s => { const [a, b] = s.split('/').map(Number); return Object.freeze({ label: s, num: a, den: b || 1, value: a / (b || 1) }); }));
const STATUS = Object.freeze(['OBS_CHAIN', 'OBS_CROSSFUND', 'OBS_SERIES', 'EST_SERIES_END', 'EST_CASH', 'BOUNDED_AMBIGUOUS_CA', 'BOUNDED_EXIT', 'BOUNDED_EXIT_SERIES_DELISTED']);
const GROUP = Object.freeze({ OBS_CHAIN: 'observed', OBS_CROSSFUND: 'observed', OBS_SERIES: 'observed', EST_SERIES_END: 'estimated', EST_CASH: 'estimated',
  BOUNDED_AMBIGUOUS_CA: 'bounded', BOUNDED_EXIT: 'bounded', BOUNDED_EXIT_SERIES_DELISTED: 'bounded' });
const TIERS = Object.freeze(['C1_CUSIP', 'C2_NAME', 'C2_NAME_DUP', 'C3_CIK', 'C4_FUZZY', 'NONE']);
const SPLIT_CLASSES = Object.freeze(['NONE', 'SPLIT', 'SHARE_CHANGE', 'AMBIGUOUS_CA', 'NA']);
const FATES = Object.freeze(['', 'ACQUIRED_OR_MERGED', 'ACQUIRED_OR_MERGED_NO_25_15', 'DELISTED_OTHER', 'DELISTED_BANKRUPTCY', 'BANKRUPTCY_NO_25_15',
  'STILL_REPORTING_INDEX_EXIT', 'NO_SEC_EVIDENCE', 'NO_CIK', 'CIK_NAME_MISMATCH', 'TEMPORARY_ABSENCE', 'NOT_FATED']);

const finite = v => typeof v === 'number' && Number.isFinite(v);
function median(xs) { const s = xs.filter(finite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Nearest registered split ratio to q (by |log q - log s|). */
function nearestRatio(q) {
  let best = null;
  for (const r of RATIOS) { const d = Math.abs(Math.log(q) - Math.log(r.value)); if (!best || d < best.dist) best = { ratio: r, dist: d }; }
  return best;
}

/**
 * Split classification of one linked position (rules splitDetection).
 * q = (shares1/shares0) / F, pr = p1/p0, ridx = preliminary index return of the period.
 * Returns {cls, factor, returns: {point|null, lo, hi}, ratio: label|null, eSplit, eNone}.
 */
function classifySplit(q, pr, ridx) {
  if (!(q > 0) || !(pr > 0) || !finite(ridx) || ridx <= -1) throw Error('CLASSIFY_INPUT');
  const base = Math.log(1 + ridx), eNone = Math.log(pr) - base;
  if (Math.abs(Math.log(q)) < RULE.TRIGGER_LOG) return { cls: 'NONE', factor: 1, point: pr - 1, lo: pr - 1, hi: pr - 1, ratio: null, eSplit: null, eNone };
  const near = nearestRatio(q);
  const within = near.dist <= RULE.RATIO_TOL;
  const s = near.ratio.value, eSplit = Math.log(s * pr) - base;
  if (within && Math.abs(eSplit) + RULE.MARGIN <= Math.abs(eNone) && Math.abs(eSplit) <= RULE.MAX_RESIDUAL)
    return { cls: 'SPLIT', factor: s, point: s * pr - 1, lo: s * pr - 1, hi: s * pr - 1, ratio: near.ratio.label, eSplit, eNone };
  if ((!within || Math.abs(eNone) + RULE.MARGIN <= Math.abs(eSplit)) && Math.abs(eNone) <= RULE.MAX_RESIDUAL)
    return { cls: 'SHARE_CHANGE', factor: 1, point: pr - 1, lo: pr - 1, hi: pr - 1, ratio: within ? near.ratio.label : null, eSplit: within ? eSplit : null, eNone };
  const a = pr - 1, b = within ? s * pr - 1 : a;
  return { cls: 'AMBIGUOUS_CA', factor: null, point: null, lo: Math.min(a, b), hi: Math.max(a, b), ratio: within ? near.ratio.label : null, eSplit: within ? eSplit : null, eNone };
}

/** Months between two ISO dates (calendar months, rounded). */
function monthsBetween(a, b) { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); }
/** Consistency tolerance in percentage points (rules consistency.tolerance). */
function tolerancePp(t0, t1, approx) { return RULE.TOL_PP_QUARTER * Math.sqrt(Math.max(1, monthsBetween(t0, t1)) / 3) + (approx ? RULE.APPROX_EXTRA_PP : 0); }

/** Period qualification (rules qualification.period). p: {coveredW, boundedW, errorPp|null, approx, internalAgree|null} */
function qualifyPeriod(p, t0, t1) {
  if (!(p.coveredW >= RULE.MIN_COVERED_W && p.boundedW <= RULE.MAX_BOUNDED_W)) return 'NOT_QUALIFIED_COVERAGE';
  if (finite(p.errorPp)) return Math.abs(p.errorPp) <= tolerancePp(t0, t1, !!p.approx) ? 'QUALIFIED' : 'NOT_QUALIFIED_ERROR';
  if (finite(p.internalAgree) && p.internalAgree >= RULE.INTERNAL_AGREE) return 'QUALIFIED_INTERNAL';
  return 'NOT_QUALIFIED_NO_REFERENCE';
}

/** Longest span ending at the last period with >= 90 % qualified periods and no two consecutive failures. */
function qualifiedSpan(classes) {
  const ok = c => c === 'QUALIFIED' || c === 'QUALIFIED_INTERNAL';
  let best = null;
  for (let i = classes.length - 1; i >= 0; i--) {
    const seg = classes.slice(i);
    if (seg.length >= 2 && !ok(seg[0]) && !ok(seg[1])) break;
    const share = seg.filter(ok).length / seg.length;
    if (ok(seg[0]) && share >= 0.9) best = i;
  }
  return best;
}

// ---------------------------------------------------------------- loader
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'docs', 'quant-recovery', 'v12', 'spxpop');
function createIndexPopulation(options = {}) {
  if (!options || options.optIn !== true) throw Error('INDEX_POPULATION_OPT_IN_REQUIRED');
  const dir = options.dir || DEFAULT_DIR;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest-1.0.1.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, manifest.dataFile));
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== manifest.dataSha256) throw Error('INDEX_POPULATION_DATA_HASH_MISMATCH');
  const data = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  if (data.schemaVersion !== manifest.schemaVersion || data.ruleVersion !== RULE.version) throw Error('INDEX_POPULATION_VERSION_MISMATCH');
  const chains = data.chains; // [fund, keyHash, name, cik|null, securityId|null]
  const allowUnqualified = options.allowUnqualified === true;
  const boundedAs = options.boundedAs == null ? null : options.boundedAs;
  if (boundedAs !== null && boundedAs !== 'ZERO' && boundedAs !== 'LOWER') throw Error('INDEX_POPULATION_BOUNDED_SCENARIO');
  const popById = new Map(data.populations.map(p => [p.id, p]));
  const periodsOf = fund => data.periods.filter(p => p.fund === fund);
  function population(id) { const p = popById.get(id); if (!p) throw Error('INDEX_POPULATION_UNKNOWN:' + id); return p; }
  function periods(id) {
    const p = population(id);
    return periodsOf(p.fund).filter(x => x.t0 >= p.from && x.t1 <= p.to).map(x => ({ ...x.summary, fund: x.fund, t0: x.t0, t1: x.t1, qualification: x.qualification }));
  }
  function members(id, t0) {
    const p = population(id);
    const per = periodsOf(p.fund).find(x => x.t0 === t0 && x.t0 >= p.from && x.t1 <= p.to);
    if (!per) throw Error('INDEX_POPULATION_NO_PERIOD:' + id + ':' + t0);
    if (!allowUnqualified && per.qualification !== 'QUALIFIED' && per.qualification !== 'QUALIFIED_INTERNAL') throw Error('INDEX_POPULATION_PERIOD_NOT_QUALIFIED:' + per.qualification);
    const c = per.cols, out = [];
    for (let i = 0; i < c.chain.length; i++) {
      const status = STATUS[c.status[i]], group = GROUP[status];
      const ret = c.ret[i] == null ? null : c.ret[i] / 1e6, lo = c.lo[i] == null ? null : c.lo[i] / 1e6, hi = c.hi[i] == null ? null : c.hi[i] / 1e6;
      let used = group === 'bounded' ? null : ret;
      if (group === 'bounded' && boundedAs === 'ZERO') used = status === 'BOUNDED_AMBIGUOUS_CA' ? null : (ret == null ? 0 : ret);
      if (group === 'bounded' && boundedAs === 'LOWER') used = lo;
      const ch = chains[c.chain[i]];
      out.push({ chainId: c.chain[i], name: ch[2], cik: ch[3], securityId: c.sid[i] == null ? null : data.securityIds[c.sid[i]], weight: c.w[i] / 1e8,
        status, group, tier: TIERS[c.tier[i]], splitClass: SPLIT_CLASSES[c.split[i]], splitFactor: c.sf[i] == null ? null : c.sf[i] / 1e6,
        fate: FATES[c.fate[i]] || null, return: used, observedOrEstimatedReturn: group === 'bounded' ? null : ret, lower: lo, upper: hi });
    }
    return { fund: per.fund, t0: per.t0, t1: per.t1, qualification: per.qualification, summary: per.summary, members: out };
  }
  return { ruleVersion: RULE.version, schemaVersion: data.schemaVersion, dataSha256: sha, populations: () => data.populations.map(p => ({ ...p })), periods, members,
    chain: idx => { const ch = chains[idx]; if (!ch) throw Error('INDEX_POPULATION_NO_CHAIN'); return { fund: ch[0], keyHash: ch[1], name: ch[2], cik: ch[3] }; } };
}

module.exports = { RULE, RATIOS, STATUS, GROUP, TIERS, SPLIT_CLASSES, FATES, median, nearestRatio, classifySplit, monthsBetween, tolerancePp, qualifyPeriod, qualifiedSpan, createIndexPopulation };
