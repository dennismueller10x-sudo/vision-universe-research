'use strict';
// V10 FACTOR (RECONSTRUCTION): reconstructed vu-factor-evidence-2.0.0 factor scores on weekly data.
// Pure functions; the product engines (factor-evidence.js, fundamental-inputs.js, market-cap.js,
// return-series.js) are reused unchanged. Deviations from the product are registered in
// docs/quant-recovery/v10/factor/registration-1.0.0.json.
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const FE = require(ROOT + '/quant/engines/factor-evidence.js');
const FI = require(ROOT + '/quant/engines/fundamental-inputs.js');
const MarketCap = require(ROOT + '/quant/engines/market-cap.js');
const ReturnSeries = require(ROOT + '/quant/engines/return-series.js');
const CONTRACT = require(ROOT + '/quant/methodology/quant-v2.json');

const finite = v => typeof v === 'number' && Number.isFinite(v);
const WEEKS = Object.freeze({ m12: 52, m6: 26, m3: 13, m1: 4, sma200: 40, minMomentumBars: 56, minRiskBars: 53, minBetaPairs: 50, minVolReturns: 50, annualization: 52 });
const UNIVERSE_MIN = CONTRACT.normalization.peerFallback.at(-1).minimumValidIssuers; // 200
const FACTORS = ['quality', 'growth', 'value', 'profitability', 'momentum', 'risk'];
const COMPOSITE_WEIGHTS = Object.freeze({ quality: 0.10, growth: 0.15, value: 0.15, profitability: 0.15, momentum: 0.25, risk: 0.05 });
const SIGNALS = [...FACTORS, 'composite'];

// Component specs copied from scripts/quant/build-factor-evidence.mjs (ids, weights, directions, noWinsor).
const COMPONENTS = {
  momentum: [['priceReturn12m1m', 0.30, 'higher'], ['priceReturn6m', 0.20, 'higher'], ['priceReturn3m', 0.10, 'higher'], ['relativeStrength12m1m', 0.20, 'higher'], ['distanceTo52wHigh', 0.10, 'lower'], ['distanceToSma200', 0.10, 'higher']],
  risk: [['realizedVolatility252d', 0.35, 'lower'], ['downsideVolatility252d', 0.25, 'lower'], ['maxDrawdown252d', 0.25, 'lower'], ['beta252d', 0.15, 'lower']],
  quality: [['accrualRatio', 0.25, 'lower'], ['netDebtToAssets', 0.20, 'lower'], ['equityToAssets', 0.15, 'higher'], ['positiveFcfYears', 0.20, 'higher', true], ['operatingMarginStability', 0.20, 'lower']],
  growth: [['revenueCagr3y', 0.30, 'higher'], ['epsCagr3y', 0.20, 'higher'], ['fcfCagr3y', 0.15, 'higher'], ['revenueGrowthTtmYoy', 0.15, 'higher'], ['operatingMarginExpansion3y', 0.10, 'higher'], ['revenueGrowthAcceleration', 0.10, 'higher']],
  value: [['fcfYield', 0.30, 'higher'], ['earningsYield', 0.25, 'higher'], ['ebitdaYield', 0.20, 'higher'], ['salesYield', 0.10, 'higher'], ['bookToMarket', 0.15, 'higher']],
  profitability: [['roicTtm', 0.25, 'higher'], ['roicMedian3y', 0.15, 'higher'], ['grossProfitabilityTtm', 0.20, 'higher'], ['operatingMarginTtm', 0.15, 'higher'], ['fcfMarginTtm', 0.15, 'higher'], ['roaTtm', 0.10, 'higher']]
};
const COMPONENT_IDS = Object.values(COMPONENTS).flat().map(c => c[0]);
// Contract consistency: weights and directions must match quant-v2.json exactly.
for (const [f, list] of Object.entries(COMPONENTS)) for (const [id, w, dir] of list) {
  const c = CONTRACT.factors[f].components.find(x => x.id === id);
  if (!c || Math.abs(c.weight - w) > 1e-12 || c.direction !== dir) throw Error('COMPONENT_CONTRACT_DRIFT:' + f + ':' + id);
}

// Same mandatory rule as build-factor-evidence.mjs#mandatoryUnmet.
function mandatoryUnmet(factorId, has) {
  if (factorId === 'momentum') return !has('priceReturn12m1m');
  if (factorId === 'risk') return !has('realizedVolatility252d');
  if (factorId === 'quality') return !(has('accrualRatio') || has('positiveFcfYears')) || !(has('netDebtToAssets') || has('equityToAssets'));
  if (factorId === 'growth') return !(has('revenueCagr3y') || has('revenueGrowthTtmYoy'));
  if (factorId === 'value') return !(has('fcfYield') || has('earningsYield')) || !(has('salesYield') || has('bookToMarket') || has('ebitdaYield'));
  if (factorId === 'profitability') return !(has('roicTtm') || has('roaTtm')) || !(has('operatingMarginTtm') || has('fcfMarginTtm') || has('grossProfitabilityTtm'));
  return false;
}
// quant-v2: generic quality/value/profitability are NOT_APPLICABLE for banks, insurers, REITs.
const needsIndustryTemplate = sic4 => finite(sic4) && ((sic4 >= 6020 && sic4 <= 6220) || (sic4 >= 6300 && sic4 <= 6399) || sic4 === 6798);

/** Weekly price components at bar index i. closes: split-adjusted weekly closes, dates aligned; spy: Map date->close. */
function priceComponents(dates, closes, i, spy) {
  const out = {};
  const c = k => (k >= 0 && finite(closes[k]) && closes[k] > 0 ? closes[k] : null);
  if (i + 1 >= WEEKS.minMomentumBars) {
    const c0 = c(i), c4 = c(i - WEEKS.m1), c52 = c(i - WEEKS.m12), c26 = c(i - WEEKS.m6), c13 = c(i - WEEKS.m3);
    if (c4 && c52) out.priceReturn12m1m = c4 / c52 - 1;
    if (c0 && c26) out.priceReturn6m = c0 / c26 - 1;
    if (c0 && c13) out.priceReturn3m = c0 / c13 - 1;
    const s4 = spy.get(dates[i - WEEKS.m1]), s52 = spy.get(dates[i - WEEKS.m12]);
    if (c4 && c52 && finite(s4) && finite(s52) && s52 > 0) out.relativeStrength12m1m = Math.log(c4 / c52) - Math.log(s4 / s52);
    let hi = 0; for (let k = i - WEEKS.m12 + 1; k <= i; k++) if (c(k) && closes[k] > hi) hi = closes[k];
    if (c0 && hi > 0) out.distanceTo52wHigh = 1 - c0 / hi; // product reads -(px/hi-1)
    let s = 0, n = 0; for (let k = i - WEEKS.sma200 + 1; k <= i; k++) if (c(k)) { s += closes[k]; n++; }
    if (c0 && n === WEEKS.sma200) out.distanceToSma200 = c0 / (s / n) - 1;
  }
  if (i + 1 >= WEEKS.minRiskBars) {
    const r = [], pairs = [];
    for (let k = i - WEEKS.m12 + 1; k <= i; k++) {
      if (!c(k) || !c(k - 1)) continue;
      const lr = Math.log(closes[k] / closes[k - 1]); r.push(lr);
      const a = spy.get(dates[k - 1]), b = spy.get(dates[k]);
      if (finite(a) && finite(b) && a > 0 && b > 0) pairs.push([closes[k] / closes[k - 1] - 1, b / a - 1]);
    }
    if (r.length >= WEEKS.minVolReturns) {
      const m = r.reduce((x, y) => x + y, 0) / r.length;
      out.realizedVolatility252d = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(WEEKS.annualization);
      out.downsideVolatility252d = Math.sqrt(r.reduce((x, y) => x + (y < 0 ? y * y : 0), 0) / (r.length - 1)) * Math.sqrt(WEEKS.annualization);
    }
    let peak = 0, mdd = 0;
    for (let k = i - WEEKS.m12; k <= i; k++) { if (!c(k)) continue; if (closes[k] > peak) peak = closes[k]; mdd = Math.min(mdd, closes[k] / peak - 1); }
    if (c(i)) out.maxDrawdown252d = Math.abs(mdd);
    if (pairs.length >= WEEKS.minBetaPairs) {
      const n = pairs.length, ma = pairs.reduce((s, p) => s + p[0], 0) / n, mb = pairs.reduce((s, p) => s + p[1], 0) / n;
      const cov = pairs.reduce((s, p) => s + (p[0] - ma) * (p[1] - mb), 0), vb = pairs.reduce((s, p) => s + (p[1] - mb) ** 2, 0);
      if (vb > 0) out.beta252d = cov / vb;
    }
  }
  return out;
}

/** Split factor per weekly bar via return-series.splitFactors (ADR-002): split assigned to first bar on/after its date. */
function weeklySplitFactors(dates, splits) {
  const bars = dates.map(d => ({ date: d, splitFactor: 1 }));
  for (const [d, f] of splits || []) {
    let k = 0; while (k < dates.length && dates[k] < d) k++;
    if (k < dates.length) bars[k].splitFactor *= f;
  }
  return ReturnSeries.splitFactors(bars);
}

/**
 * PIT market capitalization: shares (end E, filed < t) x split-adjusted close(t) x splitFactor at last bar <= E.
 * Returns {value, reason, splitBetween} - withheld reasons follow build-factor-evidence.mjs.
 */
function marketCapAt({ doc, cutoff, dates, closes, factors, i, issuerListings }) {
  const shares = FI.compute(doc, cutoff, null)?.shares || null;
  const concept = doc.ttm && doc.ttm.shares_outstanding ? doc.ttm.shares_outstanding.concept || null : null;
  if (issuerListings > 1) return { value: null, reason: 'SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING' };
  if (!shares || !finite(shares.value) || !(shares.value > 0)) return { value: null, reason: 'NO_PIT_SHARE_COUNT' };
  if (concept && !MarketCap.OUTSTANDING_CONCEPTS.includes(concept)) return { value: null, reason: 'SHARE_COUNT_NOT_OUTSTANDING' };
  if (!MarketCap.sameCurrencyAsListing(doc.units)) return { value: null, reason: 'REPORTING_CURRENCY_NOT_LISTING_CURRENCY' };
  let k = i; while (k > 0 && dates[k] > shares.end) k--;
  if (dates[k] > shares.end) return { value: null, reason: 'SHARE_DATE_BEFORE_PRICE_HISTORY' };
  return { value: shares.value * closes[i] * factors[k], reason: null, splitBetween: factors[k] !== factors[i], sharesEnd: shares.end, sharesFiled: shares.filed };
}

/** Raw fundamental components from a PIT consumer document (fundamental-inputs.compute, unchanged). */
function fundamentalComponents(doc, cutoff, marketCap) {
  const r = FI.compute(doc, cutoff, finite(marketCap) ? marketCap : null);
  if (!r) return null;
  return { raws: r.raws, availableAt: r.availableAt, referenceEnd: r.referenceEnd };
}

/**
 * Cross-sectional scores for one rank date.
 * rows: [{id, raws:{componentId:number}, template:boolean}] -> per row {factorId: score|null, composite}
 */
function scoreCrossSection(rows) {
  const comp = {};
  for (const [factorId, list] of Object.entries(COMPONENTS)) for (const [id, , direction, noWinsor] of list) {
    const raws = rows.map(r => {
      if (r.template && ['quality', 'value', 'profitability'].includes(factorId)) return null;
      const v = r.raws[id]; return finite(v) ? v : null;
    });
    const bounds = noWinsor ? null : FE.winsorBounds(raws);
    const vals = raws.map(v => (v === null ? null : FE.clamp(v, bounds)));
    const valid = vals.filter(v => v !== null).length;
    comp[id] = valid >= UNIVERSE_MIN ? FE.midrankPercentiles(vals, direction) : rows.map(() => null);
  }
  return rows.map((r, idx) => {
    const out = {};
    for (const factorId of FACTORS) {
      if (r.template && ['quality', 'value', 'profitability'].includes(factorId)) { out[factorId] = null; continue; }
      const components = COMPONENTS[factorId].map(([id, weight]) => {
        const s = comp[id][idx];
        return { id, weight, state: finite(s) ? 'AVAILABLE' : 'UNAVAILABLE', score: finite(s) ? s : null };
      });
      let a = FE.assembleFactor(CONTRACT.factors[factorId], components);
      if (a.state === 'AVAILABLE' && mandatoryUnmet(factorId, id => components.some(c => c.id === id && c.state === 'AVAILABLE'))) a = { state: 'UNAVAILABLE', score: null };
      out[factorId] = a.state === 'AVAILABLE' ? a.score : null;
    }
    out.composite = FACTORS.every(f => finite(out[f])) ? FACTORS.reduce((s, f) => s + COMPOSITE_WEIGHTS[f] * out[f], 0) / FACTORS.reduce((s, f) => s + COMPOSITE_WEIGHTS[f], 0) : null;
    return out;
  });
}

module.exports = { WEEKS, UNIVERSE_MIN, FACTORS, SIGNALS, COMPOSITE_WEIGHTS, COMPONENTS, COMPONENT_IDS, mandatoryUnmet, needsIndustryTemplate, priceComponents, weeklySplitFactors, marketCapAt, fundamentalComponents, scoreCrossSection, finite };
