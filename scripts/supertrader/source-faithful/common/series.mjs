/**
 * Shared, causal series helpers for the source-faithful methods. Pure functions on an array of bars
 * { date, open, high, low, close, volume, rawClose?, splitAdj?, dividend? } (split-adjusted, ascending).
 * "prior" helpers use bars i-n .. i-1 and never bar i, so a level known at the prior close cannot see the current bar.
 * Missing values (non-finite) make an indicator null instead of being filled.
 */

export const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export function trueRangeAt(bars, i) {
  const b = bars[i];
  if (!b || !fin(b.high) || !fin(b.low)) return null;
  if (i === 0 || !fin(bars[i - 1]?.close)) return b.high - b.low;
  const pc = bars[i - 1].close;
  return Math.max(b.high - b.low, b.high - pc, pc - b.low);
}

/** Highest high of bars i-n .. i-1; null without n prior bars or with a missing value. */
export function priorHigh(bars, i, n) {
  if (i < n) return null;
  let v = -Infinity;
  for (let k = i - n; k < i; k++) { const h = bars[k].high; if (!fin(h)) return null; if (h > v) v = h; }
  return v;
}
export function priorLow(bars, i, n) {
  if (i < n) return null;
  let v = Infinity;
  for (let k = i - n; k < i; k++) { const l = bars[k].low; if (!fin(l)) return null; if (l < v) v = l; }
  return v;
}

/**
 * Lowest low / highest high over the bars of i-n .. i-1 that HAVE a value (exit levels): a missing bar does not switch an
 * exit off for the length of the window; null only when no bar in the window has a value or fewer than n prior bars.
 */
export function priorLowAvailable(bars, i, n) {
  if (i < n) return null;
  let v = Infinity; for (let k = i - n; k < i; k++) { const l = bars[k].low; if (fin(l) && l < v) v = l; }
  return v === Infinity ? null : v;
}
export function priorHighAvailable(bars, i, n) {
  if (i < n) return null;
  let v = -Infinity; for (let k = i - n; k < i; k++) { const h = bars[k].high; if (fin(h) && h > v) v = h; }
  return v === -Infinity ? null : v;
}

/** Simple mean of field over bars i-n+1 .. i (inclusive of i). */
export function smaAt(bars, i, n, field = 'close') {
  if (i < n - 1) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) { const v = bars[k][field]; if (!fin(v)) return null; s += v; }
  return s / n;
}
/** Simple mean of field over bars i-n .. i-1 (prior only). */
export function priorMean(bars, i, n, field) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n; k < i; k++) { const v = bars[k][field]; if (!fin(v)) return null; s += v; }
  return s / n;
}

/** Array SMA of a numeric array (null where undefined). */
export function smaSeries(values, n) {
  const out = new Array(values.length).fill(null);
  let s = 0, valid = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (fin(v)) { s += v; valid++; }
    if (i >= n) { const o = values[i - n]; if (fin(o)) { s -= o; valid--; } }
    if (i >= n - 1 && valid === n) out[i] = s / n;
  }
  return out;
}

/** EMA with alpha 2/(n+1), seeded by the SMA of the first n values. */
export function emaSeries(values, n) {
  const out = new Array(values.length).fill(null), a = 2 / (n + 1);
  let e = null, s = 0, c = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!fin(v)) { e = null; s = 0; c = 0; continue; }
    if (e === null) { s += v; c++; if (c === n) { e = s / n; out[i] = e; } continue; }
    e = a * v + (1 - a) * e; out[i] = e;
  }
  return out;
}

/** One raw cent in the split-adjusted price basis of bar b (adjusted = raw / splitAdj). */
export const rawTickAdjusted = (b, rawTick = 0.01) => rawTick / (fin(b.splitAdj) && b.splitAdj > 0 ? b.splitAdj : 1);

/**
 * Research universe protocol (CONVENTION, not a source number): the pre-registered tournament universe of #705
 * (certification/reviews/PREMEASUREMENT-INVARIANTS.json): raw close >= 5 and mean 20-session raw dollar volume
 * >= 1,000,000, both at the PRIOR session. Applied identically to every source-faithful method that needs a liquid
 * equity universe, so that methods are compared on the same population.
 */
export const RESEARCH_UNIVERSE = Object.freeze({ id: 'VU_TOURNAMENT_UNIVERSE_705', priceFloorRaw: 5, dollarVolumeFloor: 1_000_000, dollarVolumeSessions: 20, evaluatedAt: 'PRIOR_SESSION', origin: '#705 PREMEASUREMENT-INVARIANTS (pre-registered, not derived from any result)' });

export function eligibleAtPriorSession(bars, i, u = RESEARCH_UNIVERSE) {
  const j = i - 1, n = u.dollarVolumeSessions;
  if (j < n - 1) return false;
  const rc = bars[j].rawClose ?? bars[j].close;
  if (!(rc >= u.priceFloorRaw)) return false;
  let dv = 0;
  for (let k = j - n + 1; k <= j; k++) {
    const b = bars[k], c = b.rawClose ?? b.close, v = b.rawVolume ?? b.volume;
    if (!fin(c) || !fin(v)) return false;
    dv += c * v;
  }
  return dv / n >= u.dollarVolumeFloor;
}

/** Date -> index map of a bar array. */
export const indexByDate = (bars) => new Map(bars.map((b, i) => [b.date, i]));

/**
 * ISO-week aggregation of daily bars (Monday-based week key). Weekly high / low / volume over the sessions that exist;
 * a week is never filled from missing sessions. Returns [{ week, end, open, high, low, close, volume, sessions }].
 */
export function isoWeeks(bars) {
  const out = [];
  for (const b of bars) {
    if (!fin(b.high) || !fin(b.low) || !fin(b.close)) continue;
    const d = new Date(`${b.date}T00:00:00Z`), monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
    const w = out.at(-1);
    if (!w || w.week !== monday) out.push({ week: monday, end: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: fin(b.volume) ? b.volume : 0, sessions: 1 });
    else { w.end = b.date; w.high = Math.max(w.high, b.high); w.low = Math.min(w.low, b.low); w.close = b.close; w.volume += fin(b.volume) ? b.volume : 0; w.sessions++; }
  }
  return out;
}
