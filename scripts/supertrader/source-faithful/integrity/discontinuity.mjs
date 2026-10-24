/**
 * Supertrader 6.0 – V4-D1 containment in the research pipeline: causal detection of price discontinuities that no
 * declared corporate action explains, and a quarantine that keeps their LOOKBACK out of every lifecycle.
 *
 * Background (#705 V4-D1, #721/#722, #737, #758, #763): the provider sometimes carries no split factor for a (reverse)
 * split; the adjusted series then shows a 5x-1000x overnight "move". Three Quant protocols showed that a data-layer
 * correction is not certifiable with the free evidence sources (NOT_READY: false-positive shares 0.35-0.82). This module
 * therefore does NOT repair anything and does NOT claim a defect. It flags a SUPERSET of suspicious sessions.
 *
 * Rule (fixed before any Supertrader 6.0 result; thresholds adopted from earlier data protocols, never from a strategy
 * result):
 *  - session relative r_i = (close_i + dividend_i) / close_(i-1) on the SPLIT-ADJUSTED bars of one security (the
 *    research input of every lifecycle, runner/snapshot-input.mjs). It equals the total-return relative of
 *    validation/lib.mjs#adjustSeries, so a consistent declared split gives r ~ 1;
 *  - flag session i when r_i >= k or r_i <= 1/k;
 *    k = 5: DQ-K5, the ratio bound of core 1.2.0 (#722). There it was set POST HOC after the 1.1.0 data audit (k = 2/3
 *           held mostly genuine moves; no strategy result involved) and combined with ratio and volume conditions that
 *           DQ-K5 does NOT use: DQ-K5 is the bare ratio bound, a wider superset;
 *    k = 3: DQ-K3, the candidate bound of protocol v3 (#758, a selection bound only), a sensitivity band;
 *  - this catches undeclared splits in both directions, a declared factor on the wrong day or with the wrong ratio,
 *    unit errors and spikes (a spike gives two flags), and also genuine moves (a +400 % day): a SUPERSET;
 *  - undeclared 2:1 / 3:1 splits stay below DQ-K5 (only DQ-K3 sees 3:1; 2:1 is seen by neither): the containment is
 *    partial by construction and is reported so.
 * Quarantine (review SF6-A H1 / H2 / M1): the security is cut at every flagged session i. The adjusted bars are sliced,
 * never re-adjusted, so every price level outside the flag stays identical to BASE. Two treatments of the flagged session
 * itself, both pre-registered, bracket the unknowable truth (a defect or a genuine move):
 *  - BOOK  (primary): the earlier piece ENDS WITH bar i, so a position held into session i is settled from bar i's own
 *          price (like BASE: a genuine crash stays booked, a fake jump too); the next piece starts at bar i;
 *  - PRIOR (sensitivity): the earlier piece ends with bar i-1, a held position is settled from the last close before
 *          the flag (a fake jump is removed, a genuine crash is removed too);
 * in both, no indicator, setup or stop of the later piece reaches back across the flag (own warm-up), which is the part
 * that removes the V4-D1 signal artefacts. Pieces shorter than MIN_SEGMENT_BARS are dropped; the last kept piece keeps
 * the original terminal (an economic delisting is never turned into a data gap). Every other piece ends as a research-v1
 * data event (DATA_GAP). DQ results are a containment sensitivity, never a corrected result.
 * Causality: the flag of session i uses bars i-1 and i only (prefix test). Descriptive census fields marked EX_POST
 * (reversion on the next session) are reported only and never used.
 */
import { fin } from '../common/series.mjs';

export const DQ_VERSION = 'sf6-discontinuity-quarantine-1.1.0';
export const DQ_POLICIES = Object.freeze({
  'DQ-K5-BOOK': Object.freeze({ id: 'DQ-K5-BOOK', k: 5, settle: 'BOOK', role: 'PRIMARY_CONTAINMENT', origin: '#722 core 1.2.0: ratio bound k >= 5, set there post hoc after the 1.1.0 data audit (no strategy result involved); 1.2.0 adds ratio/volume conditions that DQ-K5 does not use' }),
  'DQ-K5-PRIOR': Object.freeze({ id: 'DQ-K5-PRIOR', k: 5, settle: 'PRIOR', role: 'SETTLEMENT_SENSITIVITY', origin: 'as DQ-K5-BOOK; a position held into the flag is settled from the close before it' }),
  'DQ-K3-BOOK': Object.freeze({ id: 'DQ-K3-BOOK', k: 3, settle: 'BOOK', role: 'THRESHOLD_SENSITIVITY', origin: '#758 protocol v3: 3:1 candidate selection bound of discontinuity-semantics (pre-registered there)' }),
});
export const PRIMARY_POLICY = 'DQ-K5-BOOK';
/** Minimum length of a research segment (validation/analyze-methods.mjs#loadPitData drops shorter ones). */
export const MIN_SEGMENT_BARS = 30;
export const NOT_A_DEFECT_CLAIM = Object.freeze({ claim: 'SUPERSET_OF_SUSPICIOUS_SESSIONS_NOT_A_DEFECT_FINDING', correction: 'NONE', certification: 'DIAGNOSTIC_NOT_CERTIFIED' });

/** Total-return session relative of adjusted bar i (null when undefined). */
export function sessionRatio(bars, i) {
  if (i < 1) return null;
  const p = bars[i - 1]?.close, b = bars[i];
  if (!(fin(p) && p > 0) || !b || !fin(b.close)) return null;
  return (b.close + (fin(b.dividend) ? b.dividend : 0)) / p;
}

/** Indices i >= 1 whose session relative is at or beyond k in either direction. Causal per index. */
export function flagDiscontinuities(bars, k) {
  if (!(k > 1)) throw new Error('DQ_K_MUST_EXCEED_1');
  const out = [];
  for (let i = 1; i < bars.length; i++) { const r = sessionRatio(bars, i); if (r !== null && (r >= k || r <= 1 / k)) out.push(i); }
  return out;
}

/** Research-universe membership at bar j on raw prices (raw close >= 5, mean 20-session raw dollar volume >= 1e6). */
function universeAtRaw(bars, j) {
  if (j < 19) return false;
  const rc = (b) => b.rawClose ?? b.close, rv = (b) => b.rawVolume ?? b.volume;
  if (!(rc(bars[j]) >= 5)) return false;
  let dv = 0; for (let k = j - 19; k <= j; k++) { const c = rc(bars[k]), v = rv(bars[k]); if (!fin(c) || !fin(v)) return false; dv += c * v; }
  return dv / 20 >= 1e6;
}
const median = (a) => { const v = a.filter(fin).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };

/** Descriptive census row of one flagged session (no ticker; the security id stays in the sealed part only). */
export function describeFlag(bars, i, k) {
  const r = sessionRatio(bars, i), b = bars[i], prev = bars[i - 1];
  const declared = fin(b.splitAdj) && fin(prev.splitAdj) && Math.abs(prev.splitAdj / b.splitAdj - 1) > 1e-9;
  const vMed = median(bars.slice(Math.max(0, i - 20), i).map((x) => x.rawVolume ?? x.volume));
  const rn = i + 1 < bars.length ? sessionRatio(bars, i + 1) : null, prc = prev.rawClose ?? prev.close, vol = b.rawVolume ?? b.volume;
  return {
    date: b.date, year: b.date.slice(0, 4), ratio: r, direction: r >= k ? 'UP' : 'DOWN',
    kind: declared ? 'DECLARED_SPLIT_RESIDUAL' : 'NO_DECLARED_EVENT',
    priorRawCloseBand: prc < 1 ? 'LT_1' : prc < 5 ? '1_TO_5' : 'GE_5',
    researchUniverseAtPriorSession: universeAtRaw(bars, i - 1),
    volumeVsPrior20Median: vMed > 0 && fin(vol) ? (vol < vMed ? 'BELOW' : 'AT_OR_ABOVE') : 'UNKNOWN',
    exPostRevertsNextSession: rn !== null && (r >= k ? rn <= 1 / k : rn >= k), // EX_POST: descriptive only, never used
  };
}

/**
 * Cuts one research security ({ id, bars, terminal, ... }) at every flagged session. BOOK: piece p = bars[b_p .. b_(p+1)]
 * (the flagged bar closes the earlier piece and opens the next); PRIOR: piece p = bars[b_p .. b_(p+1) - 1]. Ids: the first
 * kept piece keeps the original id (unaffected trades keep their identity); later pieces get '#dq<n>' (the listing id
 * id.split('#')[0] stays valid). Non-final pieces end as a data event; the last kept piece keeps the original terminal.
 */
export function quarantineSecurity(sec, policy) {
  const flags = flagDiscontinuities(sec.bars, policy.k);
  if (!flags.length) return { pieces: [sec], flags: [], droppedBars: 0 };
  const starts = [0, ...flags], n = sec.bars.length, raw = [];
  for (let p = 0; p < starts.length; p++) {
    const end = p + 1 < starts.length ? (policy.settle === 'BOOK' ? starts[p + 1] : starts[p + 1] - 1) : n - 1;
    raw.push({ p, bars: sec.bars.slice(starts[p], end + 1), final: p === starts.length - 1 });
  }
  const kept = raw.filter((x) => x.bars.length >= MIN_SEGMENT_BARS);
  const dropped = raw.filter((x) => x.bars.length < MIN_SEGMENT_BARS).reduce((a, x) => a + x.bars.length, 0);
  const pieces = kept.map((x, j) => {
    const last = j === kept.length - 1, lastDate = x.bars.at(-1).date;
    // the last kept piece carries the original end (H2): a delisting stays a delisting, dated at the piece's last bar
    const terminal = last ? (sec.terminal ? { ...sec.terminal, date: lastDate } : null) : { date: lastDate, cause: 'DATA_GAP', distress: false, delistClass: null };
    return { ...sec, id: x.p === 0 ? sec.id : `${sec.id}#dq${x.p}`, bars: x.bars, terminal, dataQuarantine: { policy: policy.id, version: DQ_VERSION, piece: x.p, of: raw.length, endsAtFlag: !x.final, keptOriginalTerminal: last } };
  });
  return { pieces, flags: flags.map((i) => ({ i, ...describeFlag(sec.bars, i, policy.k) })), droppedBars: dropped };
}

const inc = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };

/**
 * Applies a policy to every security of a research dataset. Returns a new dataset (pieces in place of their security),
 * the sealed event list (security ids and dates, owner only) and the public census (counts only).
 */
export function quarantineDataset(ds, policy) {
  const out = [], events = [];
  const census = { policy: policy.id, k: policy.k, settle: policy.settle, version: DQ_VERSION, ...NOT_A_DEFECT_CLAIM, securities: ds.securities.length, securitiesFlagged: 0, flags: 0, piecesAfter: 0, barsBefore: 0, barsDroppedShortPieces: 0, byYear: {}, byDirection: {}, byKind: {}, byPriorRawCloseBand: {}, inResearchUniverseAtPriorSession: 0, volumeBelowPrior20Median: 0, exPostRevertsNextSession: 0, survivorSecuritiesFlagged: 0 };
  for (const sec of ds.securities) {
    census.barsBefore += sec.bars.length;
    const q = quarantineSecurity(sec, policy);
    out.push(...q.pieces); census.piecesAfter += q.pieces.length; census.barsDroppedShortPieces += q.droppedBars;
    if (!q.flags.length) continue;
    census.securitiesFlagged++; if (sec.survivor) census.survivorSecuritiesFlagged++;
    for (const f of q.flags) {
      census.flags++; inc(census.byYear, f.year); inc(census.byDirection, f.direction); inc(census.byKind, f.kind); inc(census.byPriorRawCloseBand, f.priorRawCloseBand);
      if (f.researchUniverseAtPriorSession) census.inResearchUniverseAtPriorSession++;
      if (f.volumeVsPrior20Median === 'BELOW') census.volumeBelowPrior20Median++;
      if (f.exPostRevertsNextSession) census.exPostRevertsNextSession++;
      events.push({ securityId: sec.id, date: f.date, ratio: f.ratio, direction: f.direction, kind: f.kind, priorRawCloseBand: f.priorRawCloseBand, researchUniverseAtPriorSession: f.researchUniverseAtPriorSession });
    }
  }
  census.barsDroppedShare = census.barsBefore ? census.barsDroppedShortPieces / census.barsBefore : 0;
  return { ds: { ...ds, securities: out }, events, census };
}

/** Flagged dates by listing id (the part of a security id before the first '#'). */
export function flagIndex(events) {
  const m = new Map();
  for (const e of events) { const id = String(e.securityId).split('#')[0]; if (!m.has(id)) m.set(id, []); m.get(id).push(e.date); }
  for (const v of m.values()) v.sort();
  return m;
}

const addDaysIso = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Lookback horizon (calendar days) that covers the longest setup window of the lifecycles (a 52-week high plus a base). */
export const EXPOSURE_LOOKBACK_DAYS = 400;

/**
 * Trade-level comparison of a reference run on BASE with the same configuration on a quarantined dataset. Key = listing
 * id + entry date; a trade is unchanged when exit date, exit reason, shares and status are equal (price levels are
 * identical by construction). A base trade is DIRECTLY_EXPOSED when its listing has a flagged session in
 * [entry - EXPOSURE_LOOKBACK_DAYS, exit or data end] (signal window or holding period), HELD_ACROSS_FLAG when a flagged
 * session lies in (entry, exit]. Other differences are knock-on: capital and position slots, and cross-sectional inputs
 * (e.g. the Minervini RS percentile population) that change because pieces are added or dropped.
 */
export function compareTrades(base, q, events, { dataEnd } = {}) {
  const key = (t) => `${String(t.id).split('#')[0]}|${t.entryDate}`;
  const sig = (t) => [t.exitDate ?? null, t.exitReason ?? null, t.shares, t.status].join('|');
  const qm = new Map(q.map((t) => [key(t), t])), bm = new Map(base.map((t) => [key(t), t])), flags = flagIndex(events);
  const res = { baseTrades: base.length, quarantineTrades: q.length, unchanged: 0, changed: 0, removed: 0, added: 0, directlyExposed: 0, heldAcrossFlag: 0, directlyExposedRemoved: 0, directlyExposedChanged: 0, knockOnChanged: 0, knockOnRemoved: 0, exposedOpenAtDataEnd: 0 };
  const exposedKeys = [];
  for (const t of base) {
    const id = String(t.id).split('#')[0], ds = flags.get(id) || [], lo = addDaysIso(t.entryDate, -EXPOSURE_LOOKBACK_DAYS), hi = t.exitDate ?? dataEnd ?? '9999-12-31';
    const exposed = ds.some((d) => d >= lo && d <= hi), held = ds.some((d) => d > t.entryDate && d <= hi), m = qm.get(key(t));
    if (exposed) { res.directlyExposed++; exposedKeys.push(key(t)); if (t.status !== 'CLOSED') res.exposedOpenAtDataEnd++; }
    if (held) res.heldAcrossFlag++;
    if (!m) { res.removed++; if (exposed) res.directlyExposedRemoved++; else res.knockOnRemoved++; continue; }
    if (sig(m) === sig(t)) res.unchanged++;
    else { res.changed++; if (exposed) res.directlyExposedChanged++; else res.knockOnChanged++; }
  }
  for (const t of q) if (!bm.has(key(t))) res.added++;
  res.directlyExposedShare = base.length ? res.directlyExposed / base.length : 0;
  res.heldAcrossFlagShare = base.length ? res.heldAcrossFlag / base.length : 0;
  res.unchangedShare = base.length ? res.unchanged / base.length : 0;
  return { public: res, sealedExposedKeys: exposedKeys };
}
