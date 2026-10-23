/**
 * Supertrader 6.0 – V4-D1 containment in the research pipeline: causal detection of price discontinuities that no
 * declared corporate action explains, and a segment quarantine that keeps them out of every lifecycle.
 *
 * Background (#705 V4-D1, #721/#722, #737, #758, #763): the provider sometimes carries no split factor for a (reverse)
 * split; the adjusted series then shows a 5x-1000x overnight "move". Three Quant protocols showed that a data-layer
 * correction is not certifiable with the free evidence sources (NOT_READY: false-positive shares 0.35-0.82). This module
 * therefore does NOT repair anything and does NOT claim a defect. It flags a SUPERSET of suspicious sessions and cuts
 * the research segment there, so that no signal, indicator, stop or holding period of any lifecycle spans the session.
 *
 * Rule (pre-registered before any Supertrader 6.0 result; thresholds from earlier pre-registered protocols, not chosen
 * on strategy results):
 *  - session ratio r_i = (close_i + dividend_i) * splitFactor_i / close_(i-1) on the RAW snapshot bars of one segment
 *    (exactly the total-return relative of validation/lib.mjs#adjustSeries, so a consistent declared split gives r ~ 1);
 *  - flag session i when r_i >= k or r_i <= 1/k;
 *    k = 5: DQ-K5, the conventional-ratio bound of core 1.2.0 (#722, pre-registered there);
 *    k = 3: DQ-K3, the candidate bound of protocol v3 (#758), a sensitivity band;
 *  - this catches undeclared splits in both directions, a declared factor on the wrong day or with the wrong ratio,
 *    unit errors and spikes (a spike gives two flags), and also some genuine moves (a +400 % day): a SUPERSET.
 * Causality: the flag of session i uses bars i-1 and i only. The cut makes the bars before i one segment (ending like a
 * data gap: research-v1 DATA event, the same treatment as a gap > MAX_GAP_DAYS) and the bars from i on a new segment
 * with its own warm-up. No decision before i can see bar i; after i no indicator reaches back across the jump.
 * Descriptive census fields marked EX_POST (e.g. reversion on the next session) are reported only and never used.
 */
import { fin } from '../common/series.mjs';

export const DQ_VERSION = 'sf6-discontinuity-quarantine-1.0.0';
export const DQ_POLICIES = Object.freeze({
  'DQ-K5': Object.freeze({ id: 'DQ-K5', k: 5, role: 'PRIMARY_CONTAINMENT', origin: '#722 core 1.2.0: conventional split ratio k >= 5 (pre-registered there before any lifecycle result)' }),
  'DQ-K3': Object.freeze({ id: 'DQ-K3', k: 3, role: 'SENSITIVITY_BAND', origin: '#758 protocol v3: 3:1 candidate bound of discontinuity-semantics (pre-registered there)' }),
});
/** Minimum length of a research segment (validation/analyze-methods.mjs#loadPitData drops shorter ones). */
export const MIN_SEGMENT_BARS = 30;
export const QUARANTINE_END_CAUSE = 'DATA_GAP'; // research-v1 data event, identical to a segment end by a data gap
export const NOT_A_DEFECT_CLAIM = Object.freeze({ claim: 'SUPERSET_OF_SUSPICIOUS_SESSIONS_NOT_A_DEFECT_FINDING', correction: 'NONE', certification: 'DIAGNOSTIC_NOT_CERTIFIED' });

/** Total-return session relative of raw bar i (null when undefined). */
export function sessionRatio(raw, i) {
  if (i < 1) return null;
  const p = raw[i - 1]?.close, b = raw[i];
  if (!(fin(p) && p > 0) || !b || !fin(b.close)) return null;
  const s = fin(b.splitFactor) && b.splitFactor > 0 ? b.splitFactor : 1;
  return ((b.close + (fin(b.dividend) ? b.dividend : 0)) * s) / p;
}

/** Indices i >= 1 of the raw segment whose session ratio is at or beyond k in either direction. Causal per index. */
export function flagDiscontinuities(raw, k) {
  if (!(k > 1)) throw new Error('DQ_K_MUST_EXCEED_1');
  const out = [];
  for (let i = 1; i < raw.length; i++) { const r = sessionRatio(raw, i); if (r !== null && (r >= k || r <= 1 / k)) out.push(i); }
  return out;
}

/** Research-universe membership at raw bar j (raw close >= 5, mean 20-session raw dollar volume >= 1e6), raw prices. */
function universeAtRaw(raw, j) {
  if (j < 19) return false;
  if (!(raw[j].close >= 5)) return false;
  let dv = 0; for (let k = j - 19; k <= j; k++) { const c = raw[k].close, v = raw[k].volume; if (!fin(c) || !fin(v)) return false; dv += c * v; }
  return dv / 20 >= 1e6;
}
const median = (a) => { const v = a.filter(fin).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };

/** Descriptive census row of one flagged session (no ticker; the segment id stays in the sealed part only). */
export function describeFlag(raw, i, k) {
  const r = sessionRatio(raw, i), b = raw[i], prev = raw[i - 1];
  const declared = fin(b.splitFactor) && b.splitFactor !== 1;
  const vMed = median(raw.slice(Math.max(0, i - 20), i).map((x) => x.volume));
  const rn = i + 1 < raw.length ? sessionRatio(raw, i + 1) : null;
  return {
    date: b.date, year: b.date.slice(0, 4), ratio: r, direction: r >= k ? 'UP' : 'DOWN',
    kind: declared ? 'DECLARED_SPLIT_RESIDUAL' : 'NO_DECLARED_EVENT',
    priorRawCloseBand: prev.close < 1 ? 'LT_1' : prev.close < 5 ? '1_TO_5' : 'GE_5',
    researchUniverseAtPriorSession: universeAtRaw(raw, i - 1),
    volumeVsPrior20Median: vMed > 0 && fin(b.volume) ? (b.volume < vMed ? 'BELOW' : 'AT_OR_ABOVE') : 'UNKNOWN',
    exPostRevertsNextSession: rn !== null && (r >= k ? rn <= 1 / k : rn >= k), // EX_POST: descriptive only, never used
  };
}

/**
 * Cuts one snapshot segment ({ id, raw, endCause, delisted, ... }) before every flagged session. Pieces shorter than
 * MIN_SEGMENT_BARS are dropped (the loadPitData rule). The first kept piece keeps the original id (so unaffected trades
 * keep their identity); later pieces get '#dq<n>' (listing id = id.split('#')[0] stays valid for SEC / delist lookups).
 * Every piece but the last ends as a data event; the last keeps the original end cause.
 */
export function quarantineSegment(seg, policy) {
  const flags = flagDiscontinuities(seg.raw, policy.k);
  if (!flags.length) return { pieces: [seg], flags: [], droppedBars: 0 };
  const bounds = [0, ...flags, seg.raw.length], pieces = [];
  let dropped = 0, n = 0;
  for (let p = 0; p < bounds.length - 1; p++) {
    const raw = seg.raw.slice(bounds[p], bounds[p + 1]), last = p === bounds.length - 2;
    if (raw.length < MIN_SEGMENT_BARS) { dropped += raw.length; continue; }
    const id = n === 0 && p === 0 ? seg.id : `${seg.id}#dq${p}`;
    n++;
    pieces.push({ ...seg, id, raw, endCause: last ? seg.endCause : QUARANTINE_END_CAUSE, delisted: last ? seg.delisted : true, dataQuarantine: { policy: policy.id, version: DQ_VERSION, piece: p, of: bounds.length - 1, cutBefore: last ? null : seg.raw[bounds[p + 1]].date } });
  }
  return { pieces, flags: flags.map((i) => ({ i, ...describeFlag(seg.raw, i, policy.k) })), droppedBars: dropped };
}

const inc = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };

/**
 * Applies a policy to every segment. Returns the quarantined segment list (same order; pieces in place of their segment),
 * the sealed event list (segment ids and dates, owner only) and the public census (counts only).
 */
export function quarantineSegments(segs, policy) {
  const out = [], events = [];
  const census = { policy: policy.id, k: policy.k, version: DQ_VERSION, ...NOT_A_DEFECT_CLAIM, segments: segs.length, segmentsFlagged: 0, flags: 0, piecesAfter: 0, barsBefore: 0, barsDropped: 0, byYear: {}, byDirection: {}, byKind: {}, byPriorRawCloseBand: {}, inResearchUniverseAtPriorSession: 0, volumeBelowPrior20Median: 0, exPostRevertsNextSession: 0, survivorSegmentsFlagged: 0 };
  for (const seg of segs) {
    census.barsBefore += seg.raw.length;
    const q = quarantineSegment(seg, policy);
    out.push(...q.pieces); census.piecesAfter += q.pieces.length; census.barsDropped += q.droppedBars;
    if (!q.flags.length) continue;
    census.segmentsFlagged++; if (seg.survivor) census.survivorSegmentsFlagged++;
    for (const f of q.flags) {
      census.flags++; inc(census.byYear, f.year); inc(census.byDirection, f.direction); inc(census.byKind, f.kind); inc(census.byPriorRawCloseBand, f.priorRawCloseBand);
      if (f.researchUniverseAtPriorSession) census.inResearchUniverseAtPriorSession++;
      if (f.volumeVsPrior20Median === 'BELOW') census.volumeBelowPrior20Median++;
      if (f.exPostRevertsNextSession) census.exPostRevertsNextSession++;
      events.push({ segmentId: seg.id, date: f.date, ratio: f.ratio, direction: f.direction, kind: f.kind, priorRawCloseBand: f.priorRawCloseBand, researchUniverseAtPriorSession: f.researchUniverseAtPriorSession });
    }
  }
  census.barsDroppedShare = census.barsBefore ? census.barsDropped / census.barsBefore : 0;
  return { segs: out, events, census };
}

/** Flagged dates by listing id (the part of a segment id before the first '#'). */
export function flagIndex(events) {
  const m = new Map();
  for (const e of events) { const id = String(e.segmentId).split('#')[0]; if (!m.has(id)) m.set(id, []); m.get(id).push(e.date); }
  for (const v of m.values()) v.sort();
  return m;
}

const addDaysIso = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Lookback horizon (calendar days) that covers the longest setup window of the lifecycles (a 52-week high plus a base). */
export const EXPOSURE_LOOKBACK_DAYS = 400;

/**
 * Trade-level comparison of a reference run on the original segments (base) with the same configuration on the
 * quarantined segments (q). Key = listing id + entry date. A base trade is DIRECTLY_EXPOSED when its listing has a
 * flagged session in [entry - EXPOSURE_LOOKBACK_DAYS, exit or data end]: its signal window or holding period touches a
 * flagged session. Other differences are portfolio knock-on (capital and position slots freed or taken).
 */
export function compareTrades(base, q, events, { dataEnd } = {}) {
  const key = (t) => `${String(t.id).split('#')[0]}|${t.entryDate}`;
  const sig = (t) => [t.exitDate ?? null, t.exitReason ?? null, t.shares, t.status].join('|');
  const qm = new Map(q.map((t) => [key(t), t])), bm = new Map(base.map((t) => [key(t), t])), flags = flagIndex(events);
  const res = { baseTrades: base.length, quarantineTrades: q.length, unchanged: 0, changed: 0, removed: 0, added: 0, directlyExposed: 0, directlyExposedRemoved: 0, directlyExposedChanged: 0, knockOnChanged: 0, knockOnRemoved: 0, exposedOpenAtDataEnd: 0 };
  const exposedKeys = [];
  for (const t of base) {
    const id = String(t.id).split('#')[0], ds = flags.get(id) || [], lo = addDaysIso(t.entryDate, -EXPOSURE_LOOKBACK_DAYS), hi = t.exitDate ?? dataEnd ?? '9999-12-31';
    const exposed = ds.some((d) => d >= lo && d <= hi), m = qm.get(key(t));
    if (exposed) { res.directlyExposed++; exposedKeys.push(key(t)); if (t.status !== 'CLOSED') res.exposedOpenAtDataEnd++; }
    if (!m) { res.removed++; if (exposed) res.directlyExposedRemoved++; else res.knockOnRemoved++; continue; }
    if (sig(m) === sig(t)) res.unchanged++;
    else { res.changed++; if (exposed) res.directlyExposedChanged++; else res.knockOnChanged++; }
  }
  for (const t of q) if (!bm.has(key(t))) res.added++;
  res.directlyExposedShare = base.length ? res.directlyExposed / base.length : 0;
  res.unchangedShare = base.length ? res.unchanged / base.length : 0;
  return { public: res, sealedExposedKeys: exposedKeys };
}
