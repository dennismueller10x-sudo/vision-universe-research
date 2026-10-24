/**
 * Supertrader 7.0 – V4-D1 resolution: classification of the flagged price discontinuities (integrity/discontinuity.mjs)
 * with EXISTING corporate-action evidence, following owner decision E1 (docs/SUPERTRADER_6_V4D1_CONTAINMENT.md):
 *   (a) the Tiingo fields of the same frozen snapshot series (splitFactor, divCash, adjClose, raw open / close / volume),
 *   (b) Marketstack: NOT used (no verified existing US corporate-action access; no new provider),
 *   (c) SEC: the share counts of an existing private sec-pit artifact (r13: dei cover page; r14: dei, else balance sheet,
 *       validation/sec-pit.mjs), and one request of the public EDGAR submissions index per issuer for every candidate
 *       that passed all share tests (split or genuine; budgeted by the runner).
 *
 * Classes (one per flagged session; no other value is ever emitted):
 *   CONFIRMED_UNDECLARED_SPLIT        factor AND session evidenced: the SEC share counts bracketing d give exactly one
 *                                     factor N of the factor grid (tolerance tight enough to separate N from its grid
 *                                     neighbours), the close and open relatives of d agree with N, the raw volume moves
 *                                     the same way, the CIK is KNOWN and the issuer's filings around d hold no merger or
 *                                     disposition; the overlay writes exactly 1/N;
 *   CONFIRMED_MISDATED_DECLARED_SPLIT the provider declared factor f on session j, the price moved by f on a session i at
 *                                     most 5 sessions away and not on j: the declared factor is moved, never invented;
 *   CONFIRMED_GENUINE_MOVE            share counts unchanged (the earlier count first filed before d), the raw volume does
 *                                     not behave like a split of the observed relative, no declared or Tiingo-implied
 *                                     corporate action, KNOWN CIK, a domestic filer whose filings around d carry no
 *                                     corporate action (merger, proxy, 8-K 2.01 / 3.03 / 5.03 / 5.07 / 8.01);
 *   UNRESOLVED                        everything else.
 * Every rule and tolerance is part of RULESET (hashed and pinned in a test). A result is a data audit, never a trading
 * decision: the classifier reads bars after d on purpose; the correction is standard back-adjustment (ca-overlay.mjs).
 *
 * Versions: 1.0.0 (run 40104626083). 1.1.0 (run 40111713883): misdated declared splits, balance-sheet share counts,
 * fixes of the review of #902 (HIGH-1 factor grid, HIGH-2 genuine-move guards, MEDIUM-1 filing check for splits,
 * MEDIUM-2 KNOWN CIK, MEDIUM-4 domestic filer). 1.2.0, registered before its first snapshot run, fixes of the
 * re-review (Nachpruefung) at 585d4fb:
 *  - HIGH: ordinary issuance moves q into the window of N - 1 and the close check cannot separate N from N +- 1. A split
 *    now needs the share ratio AND the overnight open relative to select the same grid value g independently, a tight
 *    share residual |ln(q/g)| <= min(0.2 x log-gap, ln 1.02), and - for g >= 10, where the log-gap is <= ln 1.10 and
 *    issuance can cross a neighbour - a second source: adjClose knows the factor, or an 8-K 5.03 / 3.03 in the window;
 *  - MEDIUM: a misdated declared split needs the jump and open relatives within ln 1.10 of the declared factor and a
 *    second source (SEC shares show the factor, or adjClose knows it at the jump);
 *  - LOW: unit-error and same-factor tolerances in TOLERANCES; an 8-K without items near a split blocks; a share
 *    bracket must use ONE source on both sides (dei-dei or bs-bs), a mixed bracket is UNRESOLVED.
 * The inverse volume test of 1.1.0 makes CONFIRMED_GENUINE_MOVE almost unreachable for crashes with high volume; this
 * is intended (conservative): a crash with a split-like volume shift is not separable from a forward split.
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';
import { sessionRatio } from './discontinuity.mjs';

export const CA_RESOLUTION_VERSION = 'sf7-ca-resolution-1.2.0';
export const CLASSES = Object.freeze({ SPLIT: 'CONFIRMED_UNDECLARED_SPLIT', MISDATED: 'CONFIRMED_MISDATED_DECLARED_SPLIT', GENUINE: 'CONFIRMED_GENUINE_MOVE', UNRESOLVED: 'UNRESOLVED' });
/** Share-count sources accepted as a reference date: dei cover page (r13, r14) and balance sheet (r14). */
export const SHARE_SOURCES = Object.freeze(['dei', 'bs']);

/**
 * Factor grid (HIGH-1): every integer 2..1000 plus 1.5 and 2.5. A share ratio q snaps to grid value g when
 * |ln(q/g)| <= tol(g) = min(ln shareRatioTol, 0.45 * ln of the gap to each grid neighbour) – so the windows of N and N±1
 * never overlap (1:24 is never read as 1:25) and the overlay writes 1/g exactly.
 */
export const FACTOR_GRID = Object.freeze([1.5, 2, 2.5, ...Array.from({ length: 998 }, (_, k) => k + 3)]);
/** Common split ratios: only used for the ADS-ratio / round-number suspicion of a "genuine" move. */
export const STANDARD_RATIOS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 25, 30, 35, 40, 50, 60, 70, 75, 80, 100, 120, 125, 150, 200, 250, 300, 400, 500, 1000]);

/**
 * Pre-registered tolerances (never tuned on a result).
 *  shareRatioTol       upper bound of a grid window and |ln q| <= ln 1.10 for "unchanged" (q = shares before / after);
 *  gridGapShare        0.45: a grid window spans at most 45 % of the log gap to its neighbour;
 *  priceRatioTol       |ln(r / N)| <= ln 1.35 for the close AND open relative of d;
 *  volumeRatioTol      |ln(v * N)| <= ln 4 for the raw-volume relative v = median(10 from d) / median(20 before), v on
 *                      the split's side of 1; for a genuine move the same test against the observed relative must FAIL;
 *  maxBracketDays      the last accepted count before d and the first after d each at most 135 calendar days away; a
 *                      count dated on d is ambiguous and skipped; a 'bs' count before d only when first filed before d;
 *                      a genuine move also needs the earlier count (any source) first filed before d;
 *  adjCloseTol         |ln(.)| <= ln 1.10 for the Tiingo adjClose relative against the raw relative;
 *  reversalK           a next-session relative beyond 1/3 (or 3) in the opposite direction is a spike;
 *  standardFactorNear  a genuine relative within 2 % of a common ratio stays UNRESOLVED (ADS ratio / round number);
 *  unitErrorRatios     relatives near 100 or 1/100 are never genuine;
 *  largeDistribution   a dividend >= 25 % of the prior close within 5 sessions blocks a genuine move;
 *  filingWindowDays    SEC filings in [d - 45, d + 15] calendar days;
 *  misdatedMaxSessions declared split and its jump at most 5 sessions apart.
 */
export const TOLERANCES = Object.freeze({
  shareRatioTol: 1.10, gridGapShare: 0.45, priceRatioTol: 1.35, volumeRatioTol: 4, maxBracketDays: 135, adjCloseTol: 1.10, reversalK: 3,
  standardFactorNear: 1.02, unitErrorRatios: Object.freeze([100]), largeDistribution: 0.25, distributionSessions: 5,
  volumePreBars: 20, volumePostBars: 10, volumeMinBars: 5, filingWindowDays: Object.freeze([-45, 15]), misdatedMaxSessions: 5,
  // 1.2.0
  shareResidualGapShare: 0.2, shareResidualMax: 1.02, secondSourceMinFactor: 10, misdatedPriceTol: 1.10, unitErrorTol: 1.5, sameFactorLogTol: 1e-3,
});
/** 8-K items that serve as a second source of a reverse / forward split (1.2.0). */
export const SPLIT_SECOND_SOURCE_8K_ITEMS = Object.freeze(['5.03', '3.03']);
/** 8-K items that are a corporate action for a genuine move; for a split only 2.01 (merger / disposition) blocks. */
export const CA_8K_ITEMS = Object.freeze(['2.01', '3.03', '5.03', '5.07', '8.01']);
export const SPLIT_BLOCKING_8K_ITEMS = Object.freeze(['2.01']);
export const MERGER_FORMS = Object.freeze(['DEFM14A', 'PREM14A', 'DEFM14C', 'PREM14C', 'SC TO-T', 'SC TO-T/A', 'SC 14D9', 'SC 14D9/A', 'SC 13E3', 'SC 13E3/A', 'SC13E3', '425', 'S-4', 'S-4/A', 'F-4', '15-12B', '15-12G', '25-NSE']);
export const PROXY_FORMS = Object.freeze(['DEF 14A', 'PRE 14A', 'DEF 14C', 'PRE 14C']);
/** Kept for 1.0.0 readers: every form that blocks a genuine move. */
export const CA_FORMS = Object.freeze([...MERGER_FORMS, ...PROXY_FORMS]);
export const DOMESTIC_FORMS = Object.freeze(['10-Q', '10-K', '10-Q/A', '10-K/A', '10-QSB', '10-KSB', '10-K405']);
export const FOREIGN_FORMS = Object.freeze(['6-K', '20-F', '40-F', '6-K/A', '20-F/A', '40-F/A']);

/** The full rule set; its SHA-256 is pinned in a test (any change is a new, versioned rule set). */
export const RULESET = Object.freeze({ version: CA_RESOLUTION_VERSION, classes: CLASSES, shareSources: SHARE_SOURCES, factorGrid: FACTOR_GRID, standardRatios: STANDARD_RATIOS, tolerances: TOLERANCES, ca8kItems: CA_8K_ITEMS, splitBlocking8kItems: SPLIT_BLOCKING_8K_ITEMS, splitSecondSource8kItems: SPLIT_SECOND_SOURCE_8K_ITEMS, mergerForms: MERGER_FORMS, proxyForms: PROXY_FORMS, domesticForms: DOMESTIC_FORMS, foreignForms: FOREIGN_FORMS });
export const rulesetSha256 = () => crypto.createHash('sha256').update(JSON.stringify(RULESET)).digest('hex');

const ln = Math.log;
const within = (x, tol) => fin(x) && x > 0 && Math.abs(ln(x)) <= ln(tol) + 1e-12;
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const median = (a) => { const v = a.filter((x) => fin(x) && x > 0).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };

/** Grid windows (log half-widths), computed once from the grid and the tolerances. */
const GRID_WINDOWS = Object.freeze(FACTOR_GRID.map((g, k) => {
  const prev = k ? FACTOR_GRID[k - 1] : 1, next = FACTOR_GRID[k + 1] ?? Infinity;
  return [g, Math.min(ln(TOLERANCES.shareRatioTol), TOLERANCES.gridGapShare * ln(g / prev), TOLERANCES.gridGapShare * ln(next / g))];
}));
/** Smallest log-gap from grid value g (>= 1) to a grid neighbour (1 below the grid). */
export function gridLogGap(g) {
  const x = g >= 1 ? g : 1 / g, k = FACTOR_GRID.findIndex((y) => Math.abs(y - x) < 1e-9);
  if (k < 0) return null;
  const prev = k ? FACTOR_GRID[k - 1] : 1, next = FACTOR_GRID[k + 1] ?? Infinity;
  return Math.min(ln(x / prev), ln(next / x));
}
/** Signed grid values whose window contains q: g (1:g reverse, price up) or 1/g (g:1 forward). At most one by construction. */
export function snapFactor(q) {
  if (!(fin(q) && q > 0)) return [];
  const out = [];
  for (const [g, w] of GRID_WINDOWS) { if (Math.abs(ln(q / g)) <= w + 1e-12) out.push(g); if (Math.abs(ln(q * g)) <= w + 1e-12) out.push(1 / g); }
  return out;
}
/** Common ratios within tol of x (only for the round-number suspicion). */
export function snapStandard(x, tol) { return fin(x) && x > 0 ? STANDARD_RATIOS.flatMap((n) => [n, 1 / n]).filter((c) => within(x / c, tol)) : []; }
/** Label of a price factor c: 10 -> '1:10' (reverse), 0.5 -> '2:1', 1/1.5 -> '1.5:1'. */
export const ratioLabel = (c) => { const g = c >= 1 ? c : 1 / c, n = Math.abs(g - Math.round(g)) < 1e-6 ? `${Math.round(g)}` : g.toFixed(1); return c >= 1 ? `1:${n}` : `${n}:1`; };
const sameFactor = (a, b) => fin(a) && fin(b) && a > 0 && b > 0 && Math.abs(ln(a / b)) < TOLERANCES.sameFactorLogTol;

/**
 * Bracketing SEC share counts around session date d (or the span d .. dEnd of a pair): the last accepted count dated
 * before d and the first dated after dEnd, each within maxBracketDays. Rows are [asOf, value, firstFiled, source].
 * 'bs' rows count BEFORE d only when first filed before d (a later filing may already be restated for the split).
 * The reason SEC_SHARES_NOT_DEI (kept from 1.0.0) means: no row of an accepted source.
 */
export function bracketShares(shares, d, tol = TOLERANCES, dEnd = d) {
  const rows = (shares || []).filter((r) => Array.isArray(r) && SHARE_SOURCES.includes(r[3]) && fin(r[1]) && r[1] > 0 && typeof r[0] === 'string');
  if (!rows.length) return { ok: false, reason: (shares || []).length ? 'SEC_SHARES_NOT_DEI' : 'SEC_SHARES_MISSING' };
  // 1.2.0: one source on both sides (cover page and balance sheet can count differently); dei first, then bs
  for (const src of SHARE_SOURCES) { const b = bracketRows(rows.filter((r) => r[3] === src), d, tol, dEnd); if (b.ok) return b; }
  const mixed = bracketRows(rows, d, tol, dEnd);
  return mixed.ok ? { ok: false, reason: 'SEC_MIXED_SOURCE_BRACKET' } : mixed;
}
function bracketRows(rows, d, tol, dEnd) {
  let before = null, after = null;
  for (const r of rows) {
    if (r[0] < d) { if (r[3] === 'bs' && !(typeof r[2] === 'string' && r[2] < d)) continue; if (!before || r[0] > before[0]) before = r; }
    else if (r[0] > dEnd) { if (!after || r[0] < after[0]) after = r; }
  }
  if (!before || !after) return { ok: false, reason: 'SEC_SHARES_NOT_BRACKETING' };
  const gapBefore = daysBetween(before[0], d), gapAfter = daysBetween(dEnd, after[0]);
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
/** True when the volume relative v behaves like a split of price factor c (traded share count divided by c). */
const volumeLikeSplit = (v, c, tol) => fin(v) && (c > 1 ? v < 1 : v > 1) && within(v * c, tol.volumeRatioTol);

/** Tiingo adjClose relative across bar i over the raw total-return relative (1 = Tiingo adjusts nothing; ~1/c = it knows c). */
export function adjCloseImplied(raw, i) {
  const a0 = raw[i - 1]?.adjClose, a1 = raw[i]?.adjClose, c0 = raw[i - 1]?.close, c1 = raw[i]?.close;
  if (!(fin(a0) && a0 > 0 && fin(a1) && a1 > 0 && fin(c0) && c0 > 0 && fin(c1) && c1 > 0)) return null;
  const rawRel = (c1 + (fin(raw[i].dividend) ? raw[i].dividend : 0)) / c0;
  return (a1 / a0) / rawRel;
}

/**
 * Corporate-action evidence from an EDGAR submissions index ({ form[], filingDate[], items[] }) around date d. The index
 * must reach back to the window start (one request, no further page). hits: [form, date, items, kind] with kind
 * MERGER / PROXY / ITEM; domesticFiler / foreignFiler from the forms anywhere in the index.
 */
export function filingEvidence(sub, d, tol = TOLERANCES) {
  if (!sub || !Array.isArray(sub.form) || !Array.isArray(sub.filingDate)) return { covered: false, reason: 'SEC_FILINGS_UNAVAILABLE' };
  const lo = addDays(d, tol.filingWindowDays[0]), hi = addDays(d, tol.filingWindowDays[1]);
  const oldest = sub.filingDate.reduce((m, x) => (x && (!m || x < m) ? x : m), null);
  if (!oldest || oldest > lo) return { covered: false, reason: 'SEC_FILINGS_NOT_COVERED' };
  const hits = [], unknownItems = [];
  for (let k = 0; k < sub.form.length; k++) {
    const f = sub.form[k], fd = sub.filingDate[k]; if (!(fd >= lo && fd <= hi)) continue;
    if (MERGER_FORMS.includes(f)) hits.push([f, fd, null, 'MERGER']);
    if (PROXY_FORMS.includes(f)) hits.push([f, fd, null, 'PROXY']);
    if (f === '8-K' || f === '8-K/A') {
      const it = String(sub.items?.[k] ?? '').trim();
      if (!it) unknownItems.push([f, fd]);
      else { const ca = it.split(/[,\s]+/).filter((x) => CA_8K_ITEMS.includes(x)); if (ca.length) hits.push([f, fd, ca.join(','), 'ITEM']); }
    }
  }
  return { covered: true, hits, unknownItems, window: [lo, hi], domesticFiler: sub.form.some((f) => DOMESTIC_FORMS.includes(f)), foreignFiler: sub.form.some((f) => FOREIGN_FORMS.includes(f)) };
}
const blocksSplit = (h) => h[3] === 'MERGER' || (h[3] === 'ITEM' && h[2].split(',').some((x) => SPLIT_BLOCKING_8K_ITEMS.includes(x)));

const unresolved = (reason, evidence = {}) => ({ cls: CLASSES.UNRESOLVED, reason, evidence });
const needsFilings = (kind, evidence) => ({ cls: CLASSES.UNRESOLVED, reason: 'NEEDS_FILING_CHECK', stage: 'NEEDS_FILING_CHECK', pendingClass: kind, evidence });
const rawRelative = (raw, k) => { const p = raw[k - 1]?.close, c = raw[k]?.close; return fin(p) && p > 0 && fin(c) ? (c + (fin(raw[k].dividend) ? raw[k].dividend : 0)) / p : null; };
const declaredAt = (raw, k) => fin(raw[k]?.splitFactor) && raw[k].splitFactor > 0 && raw[k].splitFactor !== 1;

/**
 * A declared split on the wrong session. For the flag at x it finds the pair (j: declared session, i: jump), canonically
 * from j, so both flags of a pair get the same answer. Returns a CONFIRMED_MISDATED_DECLARED_SPLIT result, an UNRESOLVED
 * result with a specific reason, or null (no candidate pair: the caller reports DECLARED_SPLIT_NEARBY). The price factor
 * c of a declared splitFactor s is 1/s (1:10 reverse: s = 0.1, c = 10).
 */
export function misdatedDeclaredSplit({ raw, bars, i: x, sec, identity = {}, otherFlagDates = [], tol = TOLERANCES }) {
  const N = tol.misdatedMaxSessions, d = bars[x].date, lo = addDays(d, -tol.maxBracketDays), hi = addDays(d, tol.maxBracketDays);
  const declared = []; for (let k = 1; k < raw.length; k++) if (raw[k].date >= lo && raw[k].date <= hi && declaredAt(raw, k)) declared.push(k);
  if (declared.length !== 1) return declared.length > 1 ? unresolved('MULTIPLE_DECLARED_SPLITS_NEARBY', { date: d }) : null;
  const j = declared[0], s = raw[j].splitFactor, c = 1 / s;
  if (Math.abs(j - x) > N) return null;
  const jumps = []; for (let k = Math.max(1, j - N); k <= Math.min(raw.length - 1, j + N); k++) if (k !== j && within(rawRelative(raw, k) / c, tol.misdatedPriceTol)) jumps.push(k);
  if (jumps.length !== 1) return jumps.length > 1 ? unresolved('MISDATED_JUMP_AMBIGUOUS', { date: d }) : null;
  const i = jumps[0];
  if (x !== i && x !== j) return null;
  const ev = { date: d, pairJumpDate: raw[i].date, pairDeclaredDate: raw[j].date, declaredSplitFactor: s, factor: c, sessionsApart: i - j };
  const rj = rawRelative(raw, j); ev.declaredSessionRawRelative = rj;
  if (!within(rj, tol.priceRatioTol)) return unresolved('DECLARED_SESSION_MOVES', ev);
  const b = raw[i], p = raw[i - 1], openRel = fin(b.open) && b.open > 0 && fin(p?.close) && p.close > 0 ? b.open / p.close : null; ev.openRelative = openRel;
  if (!within(openRel / c, tol.misdatedPriceTol)) return unresolved('OPEN_RATIO_OFF_FACTOR', ev);
  const v = volumeRelative(raw, i, tol); ev.volumeRelative = v;
  if (v === null) return unresolved('VOLUME_EVIDENCE_MISSING', ev);
  if (!volumeLikeSplit(v, c, tol)) return unresolved('VOLUME_INCONSISTENT_WITH_FACTOR', ev);
  const a = Math.min(i, j), z = Math.max(i, j), wLo = raw[Math.max(0, a - N)].date, wHi = raw[Math.min(raw.length - 1, z + N)].date;
  if (otherFlagDates.some((y) => y !== raw[i].date && y !== raw[j].date && y >= wLo && y <= wHi)) return unresolved('MULTIPLE_JUMPS_NEAR_PAIR', ev);
  // SEC share counts, where usable, must show the same factor (never contradict it)
  ev.secCorroborates = false;
  if (sec && !identity.cikSharedAtSession && identity.instrumentClass !== 'ADR' && sec.taxonomy !== 'ifrs-full') {
    const br = bracketShares(sec.shares, raw[a].date, tol, raw[z].date);
    if (br.ok) {
      Object.assign(ev, { sharesBefore: br.before[1], sharesBeforeAsOf: br.before[0], sharesAfter: br.after[1], sharesAfterAsOf: br.after[0], sharesBeforeSource: br.before[3], sharesAfterSource: br.after[3], q: br.q });
      const snap = snapFactor(br.q);
      if (!(snap.length === 1 && sameFactor(snap[0], c))) return unresolved('SEC_CONTRADICTS_DECLARED_FACTOR', ev);
      ev.secCorroborates = true;
    }
  }
  // 1.2.0: a second source must show the factor at the jump (a phantom declared factor next to a genuine crash
  // would otherwise erase the crash): SEC shares (above) or the provider's adjClose
  const adj = adjCloseImplied(raw, i); ev.adjCloseImplied = adj;
  ev.adjCloseCorroborates = adj !== null && within(adj * c, tol.adjCloseTol);
  if (!ev.secCorroborates && !ev.adjCloseCorroborates) return unresolved('MISDATED_NEEDS_SECOND_SOURCE', ev);
  return { cls: CLASSES.MISDATED, reason: 'DECLARED_FACTOR_ON_WRONG_SESSION', factor: c, splitFactor: s, label: ratioLabel(c), overlay: { date: raw[i].date, splitFactor: s, moveFromDate: raw[j].date }, evidence: ev };
}

/**
 * Classifies one flagged session i of a snapshot segment.
 *  raw / bars      raw snapshot bars and adjusted research bars (same index);
 *  sec             { cik, how, taxonomy, shares } of the listing (sec-pit), or null;
 *  identity        { cikSharedAtSession, instrumentClass };
 *  otherFlagDates  the dates of every flagged session (K3) of the same LISTING (all its segments);
 *  filings         filingEvidence(...) of the issuer, or undefined when not (yet) fetched.
 * A candidate that passed every share test of a split or a genuine move and still needs the filing check returns
 * stage 'NEEDS_FILING_CHECK' (UNRESOLVED until the runner supplies the filings).
 */
export function classifyFlag({ raw, bars, i, sec, identity = {}, otherFlagDates = [], filings, tol = TOLERANCES }) {
  const d = bars[i].date, r = sessionRatio(bars, i), b = raw[i], p = raw[i - 1];
  const ev = { date: d, ratio: r };
  if (!fin(r) || !p || !b) return unresolved('PRICE_EVIDENCE_MISSING', ev);
  if (raw.some((x) => x.date >= addDays(d, -tol.maxBracketDays) && x.date <= addDays(d, tol.maxBracketDays) && fin(x.splitFactor) && x.splitFactor !== 1)) {
    return misdatedDeclaredSplit({ raw, bars, i, sec, identity, otherFlagDates, tol }) || unresolved('DECLARED_SPLIT_NEARBY', ev);
  }
  const next = i + 1 < bars.length ? sessionRatio(bars, i + 1) : null;
  if (fin(next) && (r > 1 ? next <= 1 / tol.reversalK : next >= tol.reversalK)) return unresolved('SPIKE_REVERSAL', ev);
  if (!sec) return unresolved('SEC_LISTING_NOT_MAPPED', ev);
  ev.mapping = sec.how || null;
  if (identity.instrumentClass === 'ADR' || sec.taxonomy === 'ifrs-full') return unresolved('ADR_OR_FOREIGN_FILER', ev);
  if (identity.cikSharedAtSession) return unresolved('CIK_SHARED_BY_LIVE_LISTINGS', ev);
  const br = bracketShares(sec.shares, d, tol);
  if (!br.ok) return unresolved(br.reason, { ...ev, gapBefore: br.gapBefore ?? null, gapAfter: br.gapAfter ?? null });
  Object.assign(ev, { sharesBefore: br.before[1], sharesBeforeAsOf: br.before[0], sharesBeforeFiled: br.before[2], sharesAfter: br.after[1], sharesAfterAsOf: br.after[0], sharesBeforeSource: br.before[3], sharesAfterSource: br.after[3], q: br.q });
  if (otherFlagDates.some((x) => x !== d && x > br.before[0] && x < br.after[0])) return unresolved('MULTIPLE_JUMPS_IN_BRACKET', ev);
  const adj = adjCloseImplied(raw, i); ev.adjCloseImplied = adj;
  const openRel = fin(b.open) && b.open > 0 && fin(p.close) && p.close > 0 ? b.open / p.close : null; ev.openRelative = openRel;
  const v = volumeRelative(raw, i, tol); ev.volumeRelative = v;

  // ---- split: the share ratio gives exactly one grid factor; price, volume and filings agree with it
  const snap = snapFactor(br.q);
  if (snap.length > 1) return unresolved('SHARE_RATIO_AMBIGUOUS_FACTOR', ev);
  if (snap.length === 1) {
    const c = snap[0]; ev.factor = c;
    if ((c > 1) !== (r > 1)) return unresolved('SHARE_AND_PRICE_DIRECTION_CONFLICT', ev);
    if (!within(r / c, tol.priceRatioTol)) return unresolved('PRICE_RATIO_OFF_FACTOR', ev);
    if (!within(openRel / c, tol.priceRatioTol)) return unresolved('OPEN_RATIO_OFF_FACTOR', ev);
    // 1.2.0: the overnight open relative selects the same grid value independently; the share residual is tight
    const gap = gridLogGap(c); ev.gridLogGap = gap; ev.shareResidual = Math.abs(ln(br.q / c));
    const openSnap = snapFactor(openRel); ev.openSnap = openSnap[0] ?? null;
    if (!(openSnap.length === 1 && sameFactor(openSnap[0], c))) return unresolved('OPEN_SELECTS_OTHER_FACTOR', ev);
    if (ev.shareResidual > Math.min(tol.shareResidualGapShare * gap, ln(tol.shareResidualMax)) + 1e-12) return unresolved('SHARE_RESIDUAL_TOO_LARGE', ev);
    if (v === null) return unresolved('VOLUME_EVIDENCE_MISSING', ev);
    if (!volumeLikeSplit(v, c, tol)) return unresolved('VOLUME_INCONSISTENT_WITH_FACTOR', ev);
    const adjKnowsFactor = adj !== null && within(adj * c, tol.adjCloseTol), adjNeutral = adj !== null && within(adj, tol.adjCloseTol);
    if (adj !== null && !adjKnowsFactor && !adjNeutral) return unresolved('TIINGO_ADJCLOSE_CONFLICT', ev);
    ev.tiingoAdjCloseCorroborates = adjKnowsFactor;
    // an N:1 forward split looks like a dilutive offering into a crash: a second independent source (adjClose) is required
    if (c < 1 && !adjKnowsFactor) return unresolved('FORWARD_SPLIT_NEEDS_SECOND_SOURCE', ev);
    if (sec.how !== 'KNOWN') return unresolved('SPLIT_REQUIRES_KNOWN_CIK', ev);
    if (filings === undefined) return needsFilings(CLASSES.SPLIT, ev);
    if (!filings.covered) return unresolved(filings.reason, ev);
    if (filings.hits.some(blocksSplit)) return unresolved('MERGER_OR_DISPOSITION_FILING_NEAR_SPLIT', { ...ev, filings: filings.hits });
    if (filings.unknownItems.length) return unresolved('8K_ITEMS_UNKNOWN_NEAR_SPLIT', { ...ev, filings: filings.hits });
    // 1.2.0: where ordinary issuance can cross a grid neighbour (factor >= 10: log-gap <= ln 1.10), a second source is required
    const item8k = filings.hits.some((h) => h[3] === 'ITEM' && h[2].split(',').some((x) => SPLIT_SECOND_SOURCE_8K_ITEMS.includes(x)));
    ev.secondSource = adjKnowsFactor ? 'ADJCLOSE' : item8k ? '8K_ITEM' : null;
    if (Math.max(c, 1 / c) >= tol.secondSourceMinFactor - 1e-9 && !ev.secondSource) return unresolved('LARGE_FACTOR_NEEDS_SECOND_SOURCE', ev);
    return { cls: CLASSES.SPLIT, reason: 'SHARES_PRICE_VOLUME_SAME_FACTOR', factor: c, splitFactor: 1 / c, label: ratioLabel(c), evidence: { ...ev, filingWindow: filings.window, filings: filings.hits } };
  }
  // ---- genuine: share count unchanged
  if (!within(br.q, tol.shareRatioTol)) return unresolved('SHARE_RATIO_NO_MATCH', ev);
  if (!(typeof br.before[2] === 'string' && br.before[2] < d)) return unresolved('GENUINE_BEFORE_COUNT_FILED_AFTER_SESSION', ev);
  if (adj !== null && !within(adj, tol.adjCloseTol)) return unresolved('TIINGO_ADJCLOSE_CONFLICT', ev);
  if (tol.unitErrorRatios.some((u) => within(r / u, tol.unitErrorTol) || within(r * u, tol.unitErrorTol))) return unresolved('UNIT_ERROR_SUSPECT', ev);
  if (snapStandard(r, tol.standardFactorNear).length) return unresolved('PRICE_RATIO_AT_STANDARD_FACTOR', ev);
  if (v === null) return unresolved('VOLUME_EVIDENCE_MISSING', ev);
  if (volumeLikeSplit(v, r, tol)) return unresolved('VOLUME_CONSISTENT_WITH_SPLIT', ev);
  for (let k = Math.max(1, i - tol.distributionSessions); k <= Math.min(raw.length - 1, i + tol.distributionSessions); k++) if (fin(raw[k].dividend) && raw[k].dividend > 0 && raw[k].dividend >= tol.largeDistribution * raw[k - 1].close) return unresolved('LARGE_DISTRIBUTION_NEARBY', ev);
  if (sec.how !== 'KNOWN') return unresolved('GENUINE_REQUIRES_KNOWN_CIK', ev);
  if (filings === undefined) return needsFilings(CLASSES.GENUINE, ev);
  if (!filings.covered) return unresolved(filings.reason, ev);
  if (!filings.domesticFiler || filings.foreignFiler) return unresolved('NOT_A_DOMESTIC_FILER', ev);
  if (filings.hits.length) return unresolved('CA_FILING_IN_WINDOW', { ...ev, filings: filings.hits });
  if (filings.unknownItems.length) return unresolved('8K_ITEMS_UNKNOWN_IN_WINDOW', ev);
  return { cls: CLASSES.GENUINE, reason: 'SHARES_UNCHANGED_NO_CA_FILING', evidence: { ...ev, filingWindow: filings.window } };
}
