// FROZEN copy of integrity/ca-resolution.mjs 1.0.0 (commit 9a25c657c, run 40104626083). Used only by the runner to
// report how the sessions confirmed under 1.0.0 are classified by 1.1.0 (review HIGH-1 before/after). Never edited.
/**
 * Supertrader 7.0 – V4-D1 resolution: classification of the flagged price discontinuities (integrity/discontinuity.mjs)
 * with EXISTING corporate-action evidence, following owner decision E1 (docs/SUPERTRADER_6_V4D1_CONTAINMENT.md):
 *   (a) the Tiingo fields of the same frozen snapshot series (splitFactor, divCash, adjClose, raw close / volume),
 *   (b) Marketstack: NOT used (no verified existing US corporate-action access; no new provider),
 *   (c) SEC: the share counts of the existing private artifact _validation/sec-pit-r13.json.gz (validation/sec-pit.mjs
 *       --r13: dei:EntityCommonStockSharesOutstanding per cover-page date, first filing), and – only for reference-exposed
 *       candidates that pass every share test of a genuine move – one request of the public EDGAR submissions index of
 *       the issuer (8-K items 2.01 / 3.03 / 5.03 and merger forms around the session).
 *
 * Classes (one per flagged session; no other value is ever emitted):
 *   CONFIRMED_UNDECLARED_SPLIT  factor AND effective session evidenced: the price jump of session d (close and open)
 *                               and the SEC share counts bracketing d imply the SAME standard factor within tight
 *                               tolerances, the raw volume moves the same way, nothing else explains the share change;
 *   CONFIRMED_GENUINE_MOVE      the SEC share counts bracketing d are unchanged, no declared or Tiingo-implied corporate
 *                               action, no spike reversal, and the issuer's filings around d carry no corporate action;
 *   UNRESOLVED                  everything else (missing SEC data, identity doubt, wide brackets, conflicting evidence).
 * Every rule and tolerance below is fixed BEFORE any classification of the snapshot was seen (Supertrader 7.0,
 * 2026-10-24) and is part of the code hash. A result is a data audit, never a trading decision: the classifier reads
 * bars after d (bracket, post-split volume) on purpose; the correction it allows is standard back-adjustment
 * (integrity/ca-overlay.mjs), the same convention every declared split of the snapshot already follows.
 */
import { fin } from '../common/series.mjs';
import { sessionRatio } from './discontinuity.mjs';

export const CA_RESOLUTION_VERSION = 'sf7-ca-resolution-1.0.0';
export const CLASSES = Object.freeze({ SPLIT: 'CONFIRMED_UNDECLARED_SPLIT', GENUINE: 'CONFIRMED_GENUINE_MOVE', UNRESOLVED: 'UNRESOLVED' });

/** Standard split ratios N (1:N reverse or N:1 forward). A share or price ratio must snap to exactly one of them. */
export const STANDARD_RATIOS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 25, 30, 35, 40, 50, 60, 70, 75, 80, 100, 120, 125, 150, 200, 250, 300, 400, 500, 1000]);

/**
 * Pre-registered tolerances (fixed before the first snapshot run; never tuned on a result).
 *  shareRatioTol     |ln(q / N)| <= ln 1.10 for a split, |ln q| <= ln 1.10 for "unchanged" (q = shares before / after);
 *                    10 % allows ordinary issuance between two cover dates, not a dilution that could mimic a factor;
 *  priceRatioTol     |ln(r / N)| <= ln 1.35 for the close relative AND the open relative of session d (a reverse split
 *                    often trades down on its first day; a larger deviation is not counted as a split);
 *  volumeRatioTol    |ln(v * N)| <= ln 4 for the raw-volume relative v = median(post) / median(pre), and v on the
 *                    correct side of 1 (a 1:N reverse split divides the traded share count);
 *  maxBracketDays    the last cover-page count before d and the first after d each at most 135 calendar days away
 *                    (one quarterly filing cycle plus slack); a count dated on d itself is ambiguous and skipped;
 *  adjCloseTol       |ln(.)| <= ln 1.10 when the Tiingo adjClose relative is compared with the raw relative;
 *  reversalK         a next-session relative beyond 1/3 (or 3) in the opposite direction is a spike, not a level move;
 *  standardFactorNear a "genuine" relative within 2 % of a standard ratio stays UNRESOLVED (ADS ratio change or unit
 *                    error suspicion: the issuer's share count would not show either);
 *  unitErrorRatios   relatives near 100 / 1/100 (cents vs dollars) are never genuine;
 *  filingWindow      SEC filings in [d - 45, d + 15] calendar days are searched for a corporate action.
 */
export const TOLERANCES = Object.freeze({
  shareRatioTol: 1.10, priceRatioTol: 1.35, volumeRatioTol: 4, maxBracketDays: 135, adjCloseTol: 1.10, reversalK: 3,
  standardFactorNear: 1.02, unitErrorRatios: Object.freeze([100]), volumePreBars: 20, volumePostBars: 10, volumeMinBars: 5,
  filingWindowDays: Object.freeze([-45, 15]),
});
/** 8-K items that are a corporate action for this purpose: 2.01 acquisition / disposition (spin-off, merger), 3.03 modification of holders' rights, 5.03 amendment of articles (reverse split). */
export const CA_8K_ITEMS = Object.freeze(['2.01', '3.03', '5.03']);
export const CA_FORMS = Object.freeze(['DEFM14A', 'PREM14A', 'DEFM14C', 'PREM14C', 'SC TO-T', 'SC TO-T/A', 'SC 14D9', 'SC 14D9/A', 'SC 13E3', 'SC 13E3/A', 'SC13E3', '425', 'S-4', 'S-4/A', 'F-4', '15-12B', '15-12G', '25-NSE']);

const ln = Math.log;
const within = (x, tol) => fin(x) && x > 0 && Math.abs(ln(x)) <= ln(tol) + 1e-12;
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5;
const median = (a) => { const v = a.filter((x) => fin(x) && x > 0).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };

/** The signed standard ratios: N for a 1:N reverse split (price up), 1/N for an N:1 forward split (price down). */
const SIGNED = Object.freeze(STANDARD_RATIOS.flatMap((n) => [n, 1 / n]));
/** All signed standard ratios within tol of x (more than one = ambiguous). */
export function snapStandard(x, tol) { return fin(x) && x > 0 ? SIGNED.filter((c) => within(x / c, tol)) : []; }
/** Human label of a price factor c (price after / before): 10 -> '1:10' (reverse), 0.5 -> '2:1' (forward). */
export const ratioLabel = (c) => (c >= 1 ? `1:${Math.round(c)}` : `${Math.round(1 / c)}:1`);

/**
 * Bracketing SEC share counts around session date d: the last dei cover-page count dated before d and the first dated
 * after d, each within maxBracketDays. shares rows are [asOf, value, firstFiled, source] (validation/sec-pit.mjs).
 */
export function bracketShares(shares, d, tol = TOLERANCES) {
  const rows = (shares || []).filter((r) => Array.isArray(r) && r[3] === 'dei' && fin(r[1]) && r[1] > 0 && typeof r[0] === 'string');
  if (!rows.length) return { ok: false, reason: (shares || []).length ? 'SEC_SHARES_NOT_DEI' : 'SEC_SHARES_MISSING' };
  let before = null, after = null;
  for (const r of rows) { if (r[0] < d) { if (!before || r[0] > before[0]) before = r; } else if (r[0] > d) { if (!after || r[0] < after[0]) after = r; } }
  if (!before || !after) return { ok: false, reason: 'SEC_SHARES_NOT_BRACKETING' };
  const gapBefore = daysBetween(before[0], d), gapAfter = daysBetween(d, after[0]);
  if (gapBefore > tol.maxBracketDays || gapAfter > tol.maxBracketDays) return { ok: false, reason: 'SEC_BRACKET_TOO_WIDE', gapBefore, gapAfter };
  return { ok: true, before, after, gapBefore, gapAfter, q: before[1] / after[1] };
}

/** Raw-volume relative around bar i: median raw volume of [i, i + post) over that of [i - pre, i). */
export function volumeRelative(raw, i, tol = TOLERANCES) {
  const pre = raw.slice(Math.max(0, i - tol.volumePreBars), i).map((b) => b.volume), post = raw.slice(i, i + tol.volumePostBars).map((b) => b.volume);
  if (pre.filter((v) => v > 0).length < tol.volumeMinBars || post.filter((v) => v > 0).length < tol.volumeMinBars) return null;
  const a = median(pre), b = median(post);
  return a > 0 && b > 0 ? b / a : null;
}

/** Tiingo adjClose relative across bar i over the raw total-return relative (1 = Tiingo adjusts nothing; ~1/c = Tiingo knows a factor c). */
export function adjCloseImplied(raw, i) {
  const a0 = raw[i - 1]?.adjClose, a1 = raw[i]?.adjClose, c0 = raw[i - 1]?.close, c1 = raw[i]?.close;
  if (!(fin(a0) && a0 > 0 && fin(a1) && a1 > 0 && fin(c0) && c0 > 0 && fin(c1) && c1 > 0)) return null;
  const rawRel = (c1 + (fin(raw[i].dividend) ? raw[i].dividend : 0)) / c0;
  return (a1 / a0) / rawRel;
}

/**
 * Corporate-action evidence from an EDGAR submissions index ({ form[], filingDate[], items[] }) around date d. The index
 * must reach back to d + window start (else the filings are not covered: no further page is fetched, E1 one request).
 */
export function filingEvidence(sub, d, tol = TOLERANCES) {
  if (!sub || !Array.isArray(sub.form) || !Array.isArray(sub.filingDate)) return { covered: false, reason: 'SEC_FILINGS_UNAVAILABLE' };
  const lo = new Date(Date.parse(`${d}T00:00:00Z`) + tol.filingWindowDays[0] * 864e5).toISOString().slice(0, 10);
  const hi = new Date(Date.parse(`${d}T00:00:00Z`) + tol.filingWindowDays[1] * 864e5).toISOString().slice(0, 10);
  const oldest = sub.filingDate.reduce((m, x) => (x && (!m || x < m) ? x : m), null);
  if (!oldest || oldest > lo) return { covered: false, reason: 'SEC_FILINGS_NOT_COVERED' };
  const hits = [], unknownItems = [];
  for (let k = 0; k < sub.form.length; k++) {
    const f = sub.form[k], fd = sub.filingDate[k]; if (!(fd >= lo && fd <= hi)) continue;
    if (CA_FORMS.includes(f)) hits.push([f, fd, null]);
    if (f === '8-K' || f === '8-K/A') {
      const it = String(sub.items?.[k] ?? '').trim();
      if (!it) unknownItems.push([f, fd]);
      else { const ca = it.split(/[,\s]+/).filter((x) => CA_8K_ITEMS.includes(x)); if (ca.length) hits.push([f, fd, ca.join(',')]); }
    }
  }
  return { covered: true, hits, unknownItems, window: [lo, hi] };
}

const unresolved = (reason, evidence = {}) => ({ cls: CLASSES.UNRESOLVED, reason, evidence });

/**
 * Classifies one flagged session i of a snapshot segment.
 *  raw          the segment's raw snapshot bars (same index as the adjusted research bars);
 *  bars         the adjusted research bars (snapshot-input.mjs) – the flag and its relative come from them;
 *  sec          { cik, how, taxonomy, shares } of the listing from sec-pit-r13, or null;
 *  identity     { cikSharedAtSession, instrumentClass } – a CIK that maps to another listing alive on d, or an ADR,
 *               leaves the share counts ambiguous;
 *  otherFlagDates  the dates of every other flagged session (K3) of the same listing;
 *  filings      filingEvidence(...) for the issuer, or undefined when not fetched (only reference-exposed candidates).
 * Returns { cls, reason, factor?, splitFactor?, evidence } – stage 'NEEDS_FILING_CHECK' marks a candidate that passed every
 * share test of a genuine move and still needs (c), which only the runner can provide; it is UNRESOLVED until then.
 */
export function classifyFlag({ raw, bars, i, sec, identity = {}, otherFlagDates = [], filings, tol = TOLERANCES }) {
  const d = bars[i].date, r = sessionRatio(bars, i), b = raw[i], p = raw[i - 1];
  const ev = { date: d, ratio: r };
  if (!fin(r) || !p || !b) return unresolved('PRICE_EVIDENCE_MISSING', ev);
  // declared corporate actions of the provider anywhere in the 135-day neighbourhood: the flag is a residual of a
  // declared event (wrong day / ratio) or competes with it -> out of the undeclared scope
  const lo = new Date(Date.parse(`${d}T00:00:00Z`) - tol.maxBracketDays * 864e5).toISOString().slice(0, 10), hi = new Date(Date.parse(`${d}T00:00:00Z`) + tol.maxBracketDays * 864e5).toISOString().slice(0, 10);
  if (raw.some((x) => x.date >= lo && x.date <= hi && fin(x.splitFactor) && x.splitFactor !== 1)) return unresolved('DECLARED_SPLIT_NEARBY', ev);
  // a spike (the next session reverts) is a bad print, neither a split nor a level move
  const next = i + 1 < bars.length ? sessionRatio(bars, i + 1) : null;
  if (fin(next) && (r > 1 ? next <= 1 / tol.reversalK : next >= tol.reversalK)) return unresolved('SPIKE_REVERSAL', ev);
  if (!sec) return unresolved('SEC_LISTING_NOT_MAPPED', ev);
  ev.mapping = sec.how || null;
  if (identity.instrumentClass === 'ADR' || sec.taxonomy === 'ifrs-full') return unresolved('ADR_OR_FOREIGN_FILER', ev);
  if (identity.cikSharedAtSession) return unresolved('CIK_SHARED_BY_LIVE_LISTINGS', ev);
  const br = bracketShares(sec.shares, d, tol);
  if (!br.ok) return unresolved(br.reason, { ...ev, gapBefore: br.gapBefore ?? null, gapAfter: br.gapAfter ?? null });
  Object.assign(ev, { sharesBefore: br.before[1], sharesBeforeAsOf: br.before[0], sharesAfter: br.after[1], sharesAfterAsOf: br.after[0], q: br.q });
  if (otherFlagDates.some((x) => x !== d && x > br.before[0] && x < br.after[0])) return unresolved('MULTIPLE_JUMPS_IN_BRACKET', ev);
  const adj = adjCloseImplied(raw, i); ev.adjCloseImplied = adj;
  const openRel = fin(b.open) && b.open > 0 && fin(p.close) && p.close > 0 ? b.open / p.close : null; ev.openRelative = openRel;

  // ---- split: share counts and price imply the same unique standard factor
  const shareSnap = snapStandard(br.q, tol.shareRatioTol);
  if (shareSnap.length > 1) return unresolved('SHARE_RATIO_AMBIGUOUS_FACTOR', ev);
  if (shareSnap.length === 1) {
    const c = shareSnap[0]; ev.factor = c;
    if ((c > 1) !== (r > 1)) return unresolved('SHARE_AND_PRICE_DIRECTION_CONFLICT', ev);
    if (!within(r / c, tol.priceRatioTol)) return unresolved('PRICE_RATIO_OFF_FACTOR', ev);
    if (!within(openRel / c, tol.priceRatioTol)) return unresolved('OPEN_RATIO_OFF_FACTOR', ev);
    const v = volumeRelative(raw, i, tol); ev.volumeRelative = v;
    if (v === null) return unresolved('VOLUME_EVIDENCE_MISSING', ev);
    if (!(c > 1 ? v < 1 : v > 1) || !within(v * c, tol.volumeRatioTol)) return unresolved('VOLUME_INCONSISTENT_WITH_FACTOR', ev);
    // Tiingo adjClose: either it adjusts nothing (the usual V4-D1 case) or it adjusts exactly this factor
    const adjKnowsFactor = adj !== null && within(adj * c, tol.adjCloseTol), adjNeutral = adj !== null && within(adj, tol.adjCloseTol);
    if (adj !== null && !adjKnowsFactor && !adjNeutral) return unresolved('TIINGO_ADJCLOSE_CONFLICT', ev);
    ev.tiingoAdjCloseCorroborates = adjKnowsFactor;
    // an N:1 forward split looks like a dilutive offering into a crash (shares up, price down): a second independent
    // source is required (the provider's adjClose)
    if (c < 1 && !adjKnowsFactor) return unresolved('FORWARD_SPLIT_NEEDS_SECOND_SOURCE', ev);
    if (filings?.covered && filings.hits.some((h) => h[0] !== '8-K' || /2\.01/.test(h[2] || ''))) return unresolved('MERGER_OR_DISPOSITION_FILING_NEAR_SPLIT', { ...ev, filings: filings.hits });
    return { cls: CLASSES.SPLIT, reason: 'SHARES_PRICE_VOLUME_SAME_FACTOR', factor: c, splitFactor: 1 / c, label: ratioLabel(c), evidence: ev };
  }
  // ---- genuine: share count unchanged
  if (!within(br.q, tol.shareRatioTol)) return unresolved('SHARE_RATIO_NO_MATCH', ev);
  if (adj !== null && !within(adj, tol.adjCloseTol)) return unresolved('TIINGO_ADJCLOSE_CONFLICT', ev);
  if (tol.unitErrorRatios.some((u) => within(r / u, 1.5) || within(r * u, 1.5))) return unresolved('UNIT_ERROR_SUSPECT', ev);
  if (snapStandard(r, tol.standardFactorNear).length) return unresolved('PRICE_RATIO_AT_STANDARD_FACTOR', ev);
  for (let k = Math.max(0, i - 5); k <= Math.min(raw.length - 1, i + 5); k++) if (fin(raw[k].dividend) && raw[k].dividend > 0 && raw[k].dividend >= 0.25 * (raw[k - 1]?.close ?? Infinity)) return unresolved('LARGE_DISTRIBUTION_NEARBY', ev);
  if (sec.how !== 'KNOWN') return unresolved('GENUINE_REQUIRES_KNOWN_CIK', ev);
  if (filings === undefined) return { ...unresolved('NEEDS_FILING_CHECK', ev), stage: 'NEEDS_FILING_CHECK' };
  if (!filings.covered) return unresolved(filings.reason, ev);
  if (filings.hits.length) return unresolved('CA_FILING_IN_WINDOW', { ...ev, filings: filings.hits });
  if (filings.unknownItems.length) return unresolved('8K_ITEMS_UNKNOWN_IN_WINDOW', ev);
  return { cls: CLASSES.GENUINE, reason: 'SHARES_UNCHANGED_NO_CA_FILING', evidence: { ...ev, filingWindow: filings.window } };
}
