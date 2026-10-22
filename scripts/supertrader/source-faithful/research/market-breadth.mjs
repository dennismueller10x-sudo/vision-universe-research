/**
 * Market breadth of the research universe: a VU PROXY for market-context evidence (WEIN-SF-MARKET, DAR-SF-MARKET,
 * Morales / Kacher and Kullamaegi market context). Research code, evidence only, never a gate.
 *
 * What the sources use and what is missing: Weinstein reads NYSE advance / decline (Momentum Index = 200-day mean of
 * net advances), new highs / new lows and foreign indices (#709 WEIN-CTX-MI, WEIN-CTX-HL, WEIN-CTX-WORLD). NYSE breadth
 * history is not in the snapshot and stays DATA_BLOCKED. This file measures the same quantities on the snapshot's own
 * point-in-time listing table (incl. later delisted listings), restricted to the research universe protocol of #705.
 * It is labelled VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE wherever it appears.
 *
 * Point in time: session t counts a security if it is in the research universe at the prior session and has bars on
 * t and t-1. 52-week highs / lows use the 252 sessions up to t (inclusive). at(date, { causal: true }) returns the
 * values of the session BEFORE `date` (an intraday decision on `date` cannot see its close).
 * Conventions (not source numbers): 252 sessions = 52 weeks; MA150 (daily) as the daily equivalent of the 30-week MA,
 * "rising" = above its value 5 sessions earlier; momentum = 200-session mean of the net-advance ratio.
 */
import { fin, eligibleAtPriorSession, RESEARCH_UNIVERSE } from '../common/series.mjs';

export const MARKET_BREADTH_VERSION = 'sf3-market-breadth-1.0.0';
export const BREADTH_PARAMS = Object.freeze({ yearSessions: 252, maSessions: 150, maRisingLag: 5, momentumSessions: 200 });

export function buildMarketBreadth(data, { universe = RESEARCH_UNIVERSE, P = BREADTH_PARAMS } = {}) {
  const cal = data.calendar, T = cal.length, pos = new Map(cal.map((d, i) => [d, i]));
  const adv = new Int32Array(T), dec = new Int32Array(T), unch = new Int32Array(T), pop = new Int32Array(T), nh = new Int32Array(T), nl = new Int32Array(T), maUp = new Int32Array(T), maPop = new Int32Array(T);
  for (const s of data.securities) {
    const b = s.bars, n = b.length;
    // rolling 252-session high / low of bars (by bar index; a bar gap shortens the calendar span, declared)
    const hiQ = [], loQ = [];
    let maSum = 0, maN = 0; const ma = new Float64Array(n).fill(NaN);
    for (let k = 0; k < n; k++) {
      const x = b[k];
      if (fin(x.close)) { maSum += x.close; maN++; }
      if (k >= P.maSessions && fin(b[k - P.maSessions].close)) { maSum -= b[k - P.maSessions].close; maN--; }
      if (k >= P.maSessions - 1 && maN === P.maSessions) ma[k] = maSum / P.maSessions;
      while (hiQ.length && hiQ[0] <= k - P.yearSessions) hiQ.shift();
      while (loQ.length && loQ[0] <= k - P.yearSessions) loQ.shift();
      if (fin(x.high)) { while (hiQ.length && b[hiQ.at(-1)].high <= x.high) hiQ.pop(); hiQ.push(k); }
      if (fin(x.low)) { while (loQ.length && b[loQ.at(-1)].low >= x.low) loQ.pop(); loQ.push(k); }
      if (k < 1) continue;
      const t = pos.get(x.date), tp = pos.get(b[k - 1].date);
      if (t === undefined || tp !== t - 1) continue; // needs the previous calendar session's bar
      if (!fin(x.close) || !fin(b[k - 1].close) || !eligibleAtPriorSession(b, k, universe)) continue;
      pop[t]++;
      if (x.close > b[k - 1].close) adv[t]++; else if (x.close < b[k - 1].close) dec[t]++; else unch[t]++;
      if (k >= P.yearSessions - 1) {
        if (hiQ.length && hiQ[0] === k) nh[t]++;
        if (loQ.length && loQ[0] === k) nl[t]++;
      }
      if (fin(ma[k]) && fin(ma[k - P.maRisingLag])) { maPop[t]++; if (x.close > ma[k] && ma[k] > ma[k - P.maRisingLag]) maUp[t]++; }
    }
  }
  const series = []; let line = 0; const ratios = [];
  for (let t = 0; t < T; t++) {
    const n = pop[t], ratio = n ? (adv[t] - dec[t]) / n : null;
    if (ratio !== null) line += adv[t] - dec[t];
    ratios.push(ratio);
    let mom = null;
    if (t >= P.momentumSessions - 1) { let s = 0, c = 0; for (let k = t - P.momentumSessions + 1; k <= t; k++) if (ratios[k] !== null) { s += ratios[k]; c++; } mom = c === P.momentumSessions ? s / c : null; }
    series.push({ date: cal[t], population: n, advances: adv[t], declines: dec[t], unchanged: unch[t], netAdvanceRatio: ratio, advanceDeclineLine: n ? line : null, momentumIndexProxy: mom, newHighs52w: nh[t], newLows52w: nl[t], shareAboveRisingMa150: maPop[t] ? maUp[t] / maPop[t] : null });
  }
  return {
    version: MARKET_BREADTH_VERSION, sourceStatus: 'VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE', series,
    at(date, { causal = true } = {}) {
      let t = pos.has(date) ? pos.get(date) : cal.findLastIndex((d) => d < date) + (causal ? 1 : 0);
      if (causal) t -= 1;
      const r = series[t];
      if (!r || !r.population) return { status: 'UNAVAILABLE', date };
      return { status: 'EVIDENCE_ONLY', session: r.date, ...r, nyseBreadth: 'DATA_BLOCKED (not in the snapshot)', note: 'research-universe breadth proxy; Weinstein reads NYSE breadth; no threshold' };
    },
  };
}
