/**
 * Kullamaegi Episodic Pivot (C09) / Parabolic Short (C10), chart-first: shared intraday building blocks on REAL
 * historical Tiingo IEX minute bars (Phase 1: scripts/supertrader/validation/kk-intraday-probe.mjs).
 *
 * Data facts (Phase 1 probe, run 39931778756; R9 / R10):
 *  - IEX 1-minute bars from 2017 (2016 empty), 09:30-15:59 ET, open / high / low / close / volume, RAW prices;
 *  - IEX is ONE venue: 1-5 % of the consolidated volume. Every volume number here is an IEX-venue number and is only
 *    compared with IEX-venue numbers (never with consolidated daily volume); it is never "the market volume";
 *  - IEX high / low match the consolidated daily bar mostly within 0.1 %; the opening auction is not an IEX print, so
 *    the official open comes from the daily bar (R9 amendment A4);
 *  - the Tiingo "consolidated" beta endpoint returns the same IEX prices without volume (R10, Phase 1).
 * Nothing here derives a minute from a daily bar: a day without minutes stays without intraday information.
 * Rights: internal, non-displaying research use only; minute values never reach a public output.
 */
export const KK_INTRADAY_VERSION = 'kk-intraday-1.1.0';
export const SESSION_MINUTES = 390;
export const IDENTITY_TOLERANCE = 0.01; // R9: IEX high / low within 1 % of the raw consolidated daily bar (evidence only)
export const OPEN_IDENTITY_WINDOW = 5; // the first IEX print must fall into the first 5 session minutes
export const OPEN_IDENTITY_TOLERANCE = 0.05; // ... and lie within 5 % of the raw official open (ticker reuse is a level jump)

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const etParts = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
/** Session minute of a Tiingo timestamp: 0 = 09:30 ET ... 389 = 15:59 ET. */
export const sessionMinute = (iso) => { const [h, m] = etParts(iso); return (h - 9) * 60 + (m - 30); };

/** Tiingo IEX bars -> session minutes [{ k, open, high, low, close, volume }] (k ascending, outside-session bars dropped). */
export function toSession(rawBars) {
  const out = [];
  for (const b of rawBars || []) {
    const k = sessionMinute(b.date);
    if (k < 0 || k >= SESSION_MINUTES || ![b.open, b.high, b.low, b.close].every(fin)) continue;
    out.push({ k, open: b.open, high: b.high, low: b.low, close: b.close, volume: fin(b.volume) ? b.volume : 0 });
  }
  return out.sort((a, b) => a.k - b.k);
}

/** Compact cache format (columns, 4 decimals for prices); the cache key is `TICKER|YYYY-MM-DD`. */
const r4 = (x) => Math.round(x * 1e4) / 1e4;
export function compactSession(minutes) {
  return { k: minutes.map((m) => m.k), o: minutes.map((m) => r4(m.open)), h: minutes.map((m) => r4(m.high)), l: minutes.map((m) => r4(m.low)), c: minutes.map((m) => r4(m.close)), v: minutes.map((m) => m.volume) };
}
export function expandSession(c) {
  if (!c || !Array.isArray(c.k)) return [];
  return c.k.map((k, i) => ({ k, open: c.o[i], high: c.h[i], low: c.l[i], close: c.c[i], volume: c.v[i] }));
}

/**
 * Identity gate, known at the decision (tickers are reused after delistings): the first IEX print of the session must
 * fall into the first OPEN_IDENTITY_WINDOW minutes and its open must lie within OPEN_IDENTITY_TOLERANCE of the RAW
 * official open (rawFactor = raw / adjusted, snapshot `splitAdj`). Uses nothing after the first print, so it can never
 * exclude a day because of what happened later in that day.
 */
export function openIdentityCheck(minutes, dailyBar, rawFactor) {
  if (!minutes.length) return { status: 'NO_INTRADAY_DATA' };
  const first = minutes[0], official = dailyBar.open * rawFactor;
  if (!(first.k < OPEN_IDENTITY_WINDOW)) return { status: 'IDENTITY_NO_OPENING_PRINT', firstMinute: first.k };
  if (!(official > 0)) return { status: 'IDENTITY_NO_OFFICIAL_OPEN' };
  const openGap = first.open / official - 1;
  return Math.abs(openGap) <= OPEN_IDENTITY_TOLERANCE ? { status: 'IDENTITY_OK', openGap } : { status: 'IDENTITY_MISMATCH', openGap };
}

/**
 * Whole-day agreement (R9): IEX high / low within 1 % of the RAW daily high / low. It reads the full day, so it is a
 * data-quality EVIDENCE number only and never decides whether a day is simulated (no outcome-dependent selection).
 */
export function identityCheck(minutes, dailyBar, rawFactor) {
  if (!minutes.length) return { status: 'NO_INTRADAY_DATA' };
  const hi = Math.max(...minutes.map((m) => m.high)), lo = Math.min(...minutes.map((m) => m.low));
  const rh = dailyBar.high * rawFactor, rl = dailyBar.low * rawFactor;
  const hg = hi / rh - 1, lg = lo / rl - 1;
  return Math.abs(hg) <= IDENTITY_TOLERANCE && Math.abs(lg) <= IDENTITY_TOLERANCE ? { status: 'IDENTITY_OK', highGap: hg, lowGap: lg } : { status: 'IDENTITY_MISMATCH', highGap: hg, lowGap: lg };
}

/**
 * Opening range of the first n session minutes (known at minute n): null without an IEX bar in [0, n). The official
 * open (raw, from the daily bar; the opening auction is no IEX print) is part of the range when given.
 */
export function openingRange(minutes, n, officialOpen = null) {
  let hi = -Infinity, lo = Infinity, bars = 0;
  for (const m of minutes) { if (m.k >= n) break; hi = Math.max(hi, m.high); lo = Math.min(lo, m.low); bars++; }
  if (!bars) return null;
  if (fin(officialOpen) && officialOpen > 0) { hi = Math.max(hi, officialOpen); lo = Math.min(lo, officialOpen); }
  return { high: hi, low: lo, bars, minutes: n };
}

/**
 * Running IEX VWAP and cumulative IEX volume AFTER each minute (index-aligned with `minutes`): vwap[i] uses minutes
 * 0..i only (typical price x volume). Minutes without volume do not move it.
 */
export function runningVwap(minutes) {
  let pv = 0, v = 0;
  const vwap = [], cum = [];
  for (const m of minutes) {
    if (m.volume > 0) { pv += ((m.high + m.low + m.close) / 3) * m.volume; v += m.volume; }
    vwap.push(v > 0 ? pv / v : null); cum.push(v);
  }
  return { vwap, cum };
}

/** 5-minute candles (bucket = floor(k / 5)) completed by session minute 5 * (bucket + 1). */
export function fiveMinuteCandles(minutes) {
  const out = [];
  for (const m of minutes) {
    const b = Math.floor(m.k / 5), last = out.at(-1);
    if (!last || last.bucket !== b) out.push({ bucket: b, open: m.open, high: m.high, low: m.low, close: m.close, volume: m.volume, completeAt: 5 * (b + 1) });
    else { last.high = Math.max(last.high, m.high); last.low = Math.min(last.low, m.low); last.close = m.close; last.volume += m.volume; }
  }
  return out;
}

/** Security id -> Tiingo ticker (the convention of the R9 / R10 minute studies). */
export const tickerOf = (id) => String(id).split(':')[2] ?? String(id);
