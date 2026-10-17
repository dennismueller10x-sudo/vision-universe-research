/**
 * Independent labels of protocol 3.0.0 (blinded): what independent sources say happened on a day, never what the
 * mechanism decided. This module reads only
 *   - the second price vendor (validation-only, vendor-collect.mjs#decode),
 *   - FINRA OTC Daily List observations of the listing (finra-daily-list.js#forListing output),
 *   - SEC XBRL shares outstanding of the capture,
 *   - the raw provider bars of the day being labelled (the subject, not a label source).
 * It imports no engine of the canonical core (test B1 in quant/tests/corporate-action-v3.test.mjs enforces this), so a
 * label cannot depend on the decision it scores. The rules are pre-registered in CORPORATE-ACTION-PROTOCOL-V3.json.
 */

export const LABELS_VERSION = 'corporate-action-v3-labels-1.0.0';
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const addDays = (d, n) => new Date(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
/** q (new shares per old) explains the raw move r better than "no event". */
export const explains = (r, q) => r > 0 && q > 0 && Math.abs(Math.log(r) + Math.log(q)) < Math.abs(Math.log(r));

/* ---------------------------------------------------------------- second vendor */
/** Vendor raw closes: split-adjusted close x product of the vendor's later split ratios. */
export function vendorView(dec) {
  if (!dec || dec.status !== 'OK' || !dec.dates?.length) return null;
  const sp = (dec.splits || []).slice().sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const raw = new Array(dec.dates.length);
  let k = sp.length - 1, mult = 1;
  for (let i = dec.dates.length - 1; i >= 0; i--) {
    while (k >= 0 && sp[k][0] > dec.dates[i]) { mult *= sp[k][1]; k--; }
    raw[i] = dec.close[i] * mult;
  }
  const idx = new Map(dec.dates.map((d, i) => [d, i]));
  return { dates: dec.dates, close: dec.close, raw, splits: sp, idx };
}
/**
 * Listing identity of vendor and provider: share of common consecutive days whose daily raw returns agree within 1 %
 * (days moving more than 25 % on either side excluded). CONFIRMED >= 0.9 on >= 60 days; MISMATCH < 0.5 on >= 60 days.
 */
export function vendorIdentity(vv, bars) {
  if (!vv) return { state: 'NO_VENDOR_DATA', overlap: 0, agree: null };
  if (vv.fromEvidence) return vv.identity;
  let n = 0, ok = 0;
  for (let i = 1; i < bars.length; i++) {
    const a = vv.idx.get(bars[i - 1].date), b = vv.idx.get(bars[i].date);
    if (a === undefined || b === undefined || b !== a + 1) continue;
    if (!(bars[i - 1].close > 0 && bars[i].close > 0)) continue;
    const rt = bars[i].close / bars[i - 1].close, rv = vv.raw[b] / vv.raw[a];
    if (Math.abs(Math.log(rt)) > Math.log(1.25) || Math.abs(Math.log(rv)) > Math.log(1.25)) continue;
    n++; if (Math.abs(Math.log(rv / rt)) <= 0.01) ok++;
  }
  const agree = n ? ok / n : null;
  return { state: n < 60 ? 'INSUFFICIENT_OVERLAP' : agree >= 0.9 ? 'CONFIRMED' : agree < 0.5 ? 'MISMATCH' : 'INCONCLUSIVE', overlap: n, agree: agree === null ? null : Math.round(agree * 1e4) / 1e4 };
}
/** What the vendor shows for the provider's move r on day d (vendor identity must be CONFIRMED). */
export function vendorAt(vv, ident, bars, d, r) {
  if (!vv || ident?.state !== 'CONFIRMED') return { move: 'NO_VENDOR_DATA', split: null, splitNear10: false };
  const split = vv.splits.find((s) => daysApart(s[0], d) <= 5) || null;
  const splitNear10 = vv.splits.some((s) => daysApart(s[0], d) <= 15);
  let rv;
  if (vv.fromEvidence) {
    /* precomputed vendor raw ratio of the day (vendor-evidence.mjs, same rule as below) */
    rv = vv.rvAt[d];
    if (!finite(rv)) return { move: 'NO_VENDOR_DAY', split: split ? { date: split[0], ratio: split[1] } : null, splitNear10 };
  } else {
    const b = vv.idx.get(d);
    const pi = bars.findIndex((x) => x.date === d) - 1, prevDate = pi >= 0 ? bars[pi].date : null, a = prevDate ? vv.idx.get(prevDate) : undefined;
    if (b === undefined || a === undefined || !(vv.raw[a] > 0)) return { move: 'NO_VENDOR_DAY', split: split ? { date: split[0], ratio: split[1] } : null, splitNear10 };
    rv = vv.raw[b] / vv.raw[a];
  }
  const move = Math.abs(Math.log(rv) - Math.log(r)) <= Math.log(1.1) ? 'SAME_MOVE' : Math.abs(Math.log(rv)) < 0.5 * Math.abs(Math.log(r)) ? 'NO_MOVE' : 'OTHER_MOVE';
  return { move, rv: Math.round(rv * 1e6) / 1e6, split: split ? { date: split[0], ratio: split[1] } : null, splitNear10 };
}

/**
 * Vendor evidence computed outside the runner (vendor-evidence.mjs; the validation vendor blocks cloud runners, run
 * 39007119068): per segment the identity verdict on a sample of provider closes, the vendor split list and, per requested
 * day, the vendor raw ratio against the provider's previous session. Same rules as vendorView/vendorIdentity/vendorAt.
 */
export function vendorFromEvidence(seg) {
  if (!seg) return null;
  return { fromEvidence: true, identity: seg.identity, splits: (seg.splits || []).slice().sort((a, b) => (a[0] < b[0] ? -1 : 1)), rvAt: seg.rv || {} };
}
/** Local half: identity on the sampled provider bars and the vendor raw ratio of every requested day. */
export function computeVendorEvidence(vv, req) {
  const identity = vendorIdentity(vv, req.sample.map(([date, close]) => ({ date, close })));
  const rv = {};
  if (vv) for (const [d, prevDate] of req.tasks) {
    const b = vv.idx.get(d), a = prevDate ? vv.idx.get(prevDate) : undefined;
    if (b !== undefined && a !== undefined && vv.raw[a] > 0) rv[d] = Math.round((vv.raw[b] / vv.raw[a]) * 1e6) / 1e6;
  }
  return { identity, splits: vv ? vv.splits.filter(([d]) => d >= req.from && d <= req.to) : [], rv };
}

/* ---------------------------------------------------------------- SEC shares outstanding (as protocol 2.0.0) */
export function sharesAcross(shares, d) {
  const rows = (shares || []).filter((s) => finite(s.value) && s.value > 0).map((s) => ({ at: String(s.periodEnd || s.availableAt).slice(0, 10), value: s.value })).sort((a, b) => (a.at < b.at ? -1 : 1));
  let before = null, after = null;
  for (const x of rows) { if (x.at < d) before = x; else if (!after) after = x; }
  if (!before || !after || before.at < addDays(d, -200) || after.at > addDays(d, 200)) return null;
  return after.value / before.value;
}
export function sharesLabel(sr, q) {
  if (sr === null || !finite(sr)) return 'NONE';
  if (Math.abs(Math.log(sr)) < Math.log(1.25)) return 'NO_SPLIT';
  return finite(q) && explains(1 / sr, q) ? 'CONFIRMS' : 'OTHER_CHANGE';
}

/* ---------------------------------------------------------------- FINRA */
export function finraNear(obs, d, days = 10) {
  const splits = (obs || []).filter((o) => o.kind === 'SPLIT' && !o.cancelled && finite(o.ratio) && o.exDate && daysApart(o.exDate, d) <= days);
  const listing = (obs || []).filter((o) => ['EXCHANGE_DELISTING_TO_OTC', 'EXCHANGE_LISTING_FROM_OTC', 'MARKET_CENTER_CHANGE', 'SYMBOL_CHANGE', 'ADR_RATIO_CHANGE'].includes(o.kind) && daysApart(o.exDate || o.listDay || o.visibleAt, d) <= 5);
  return { split: splits[0] ? { ratio: splits[0].ratio, exDate: splits[0].exDate } : null, listing: listing.map((o) => o.kind) };
}

/* ---------------------------------------------------------------- evidence bundle of one day */
/**
 * Everything the independent sources say about day d with provider raw move r (q: ratio the intervention claims, if any).
 * exclude: label channels that took part in the decision being scored ('FINRA', 'SHARES'); they are blanked (review P3-02/03:
 * LABEL_SOURCE != VALIDATION_SOURCE).
 */
export function evidenceAt(ctx, d, r, q, exclude = []) {
  const v = vendorAt(ctx.vendor, ctx.vendorIdentity, ctx.bars, d, r);
  const f = exclude.includes('FINRA') ? { split: null, listing: [], excluded: true } : finraNear(ctx.finraObs, d);
  const qq = finite(q) ? q : finite(r) && r > 0 ? 1 / r : null;
  const sh = exclude.includes('SHARES') ? 'EXCLUDED' : sharesLabel(sharesAcross(ctx.shares, d), qq);
  const vendorSplitExplains = !!(v.split && finite(r) && explains(r, v.split.ratio));
  const finraSplitExplains = !!(f.split && finite(r) && explains(r, f.split.ratio));
  return { vendor: v, finra: f, shares: sh, vendorSplitExplains, finraSplitExplains,
    event: vendorSplitExplains || finraSplitExplains || sh === 'CONFIRMS',
    badData: v.move === 'NO_MOVE' && !v.split,
    genuine: v.move === 'SAME_MOVE' && !v.splitNear10 && !f.split && sh !== 'CONFIRMS' };
}
const out = (label, e, basis) => ({ label, basis, evidence: { vendorMove: e.vendor.move, vendorSplit: e.vendor.split, finraSplit: e.finra.split, finraListing: e.finra.listing, shares: e.shares } });

/** Label channels to blank for a decision whose evidence used these systems. */
export function excludedBy(systems) {
  const s = new Set(systems || []), out = [];
  if (s.has('FINRA_OTC_DAILY_LIST')) out.push('FINRA');
  if (s.has('SEC_SHARES_OUTSTANDING')) out.push('SHARES');
  return out;
}
/** HOLD from a price discontinuity (any cause): TP = an independent event or provider bad data; FP = genuine move. */
export function labelHold(ctx, d, r, sourceSystems = []) {
  const e = evidenceAt(ctx, d, r, undefined, excludedBy(sourceSystems));
  if (e.event) return out('TRUE_POSITIVE', e, e.vendorSplitExplains ? 'VENDOR_SPLIT' : e.finraSplitExplains ? 'FINRA_SPLIT' : 'SEC_SHARES_CONFIRM');
  if (e.badData) return out('TRUE_POSITIVE', e, 'VENDOR_SHOWS_NO_MOVE');
  if (e.genuine) return out('FALSE_POSITIVE', e, 'VENDOR_CONFIRMS_MOVE_WITHOUT_SPLIT');
  return out('UNLABELED', e, null);
}
/**
 * NORMALIZE of ratio q: TP = vendor split of the same ratio (1 %) within 5 days, a FINRA split of the same ratio (only
 * when FINRA did not trigger it), or SEC shares CONFIRMS (only when the share count was not the corroboration).
 * FP = vendor shows the same move without any split, a vendor split of a different ratio, or SEC shares NO_SPLIT (same caveat).
 */
export function labelNormalize(ctx, d, r, q, { triggerSystem, corroboration = [] } = {}) {
  /* FINRA is blanked when it triggered OR corroborated (SECOND_SOURCE), shares when they corroborated; the vendor is never a
     decision input and is read first, so independent false-positive evidence is never overridden by a dependent channel */
  const exclude = [...(triggerSystem === 'FINRA_OTC_DAILY_LIST' || corroboration.includes('SECOND_SOURCE') ? ['FINRA'] : []), ...(corroboration.includes('SEC_SHARE_COUNT') ? ['SHARES'] : [])];
  const e = evidenceAt(ctx, d, r, q, exclude);
  const sameQ = (x) => finite(x) && Math.abs(Math.log(x) - Math.log(q)) <= Math.log(1.01);
  if (e.vendor.split && sameQ(e.vendor.split.ratio)) return out('TRUE_POSITIVE', e, 'VENDOR_SPLIT_SAME_RATIO');
  if (e.vendor.split && Math.abs(Math.log(e.vendor.split.ratio) - Math.log(q)) > Math.log(1.05)) return out('FALSE_POSITIVE', e, 'VENDOR_SPLIT_OTHER_RATIO');
  if (e.vendor.move === 'SAME_MOVE' && !e.vendor.splitNear10) return out('FALSE_POSITIVE', e, 'VENDOR_CONFIRMS_MOVE_WITHOUT_SPLIT');
  if (e.finra.split && sameQ(e.finra.split.ratio)) return out('TRUE_POSITIVE', e, 'FINRA_SPLIT_SAME_RATIO');
  if (e.shares === 'CONFIRMS') return out('TRUE_POSITIVE', e, 'SEC_SHARES_CONFIRM');
  if (e.shares === 'NO_SPLIT') return out('FALSE_POSITIVE', e, 'SEC_SHARES_NO_SPLIT');
  return out('UNLABELED', e, null);
}
/** INVALID_RANGE / data QUARANTINE at d: TP = vendor shows no such move (provider bad data); FP = vendor shows the same move without split. */
export function labelDataDefect(ctx, d, r, sourceSystems = []) {
  const e = evidenceAt(ctx, d, r, undefined, excludedBy(sourceSystems));
  if (e.badData) return out('TRUE_POSITIVE', e, 'VENDOR_SHOWS_NO_MOVE');
  if (e.event) return out('TRUE_POSITIVE', e, 'INDEPENDENT_EVENT');
  if (e.genuine) return out('FALSE_POSITIVE', e, 'VENDOR_CONFIRMS_MOVE_WITHOUT_SPLIT');
  return out('UNLABELED', e, null);
}
/** TERMINAL from a listing change: TP = FINRA listing event within 5 days; FP = vendor shows the same continuous move without split and no listing evidence. */
export function labelTerminal(ctx, d, r, sourceSystems = []) {
  /* a terminal triggered by a FINRA listing event is not labelled by it */
  const e = evidenceAt(ctx, d, r, undefined, excludedBy(sourceSystems));
  if (e.finra.listing.length) return out('TRUE_POSITIVE', e, 'FINRA_LISTING_EVENT');
  if (e.genuine) return out('FALSE_POSITIVE', e, 'VENDOR_CONFIRMS_CONTINUOUS_MOVE');
  return out('UNLABELED', e, null);
}
/** Independent class of an extreme move (item 7): CONFIRMED_EVENT / BAD_DATA / LEGITIMATE_MOVE / UNRESOLVED. */
export function classifyMove(ctx, d, r) {
  const e = evidenceAt(ctx, d, r);
  const cls = e.event ? 'CONFIRMED_EVENT' : e.badData ? 'BAD_DATA' : e.genuine ? 'LEGITIMATE_MOVE' : 'UNRESOLVED';
  return { class: cls, ...out(cls, e, null).evidence, sharesNoSplit: e.shares === 'NO_SPLIT' };
}

/* ---------------------------------------------------------------- independent true events (FN population) */
/**
 * Corporate actions that independent sources place inside the listing: vendor splits (identity CONFIRMED), FINRA splits
 * (not cancelled), SEC share-count drops <= 1/3 within 200 days (as protocol 2.0.0). Each event: {from, to, ratio, source}.
 * Share-count rises are not events (issuance cannot be told from forward splits).
 */
export function trueEvents(ctx) {
  const evs = [], first = ctx.bars[0]?.date, last = ctx.bars[ctx.bars.length - 1]?.date;
  if (!first) return evs;
  if (ctx.vendor && ctx.vendorIdentity?.state === 'CONFIRMED')
    for (const [d, q] of ctx.vendor.splits) if (d > first && d <= last && Math.abs(Math.log(q)) >= Math.log(1.5)) evs.push({ from: addDays(d, -5), to: addDays(d, 5), date: d, ratio: q, source: 'VENDOR_SPLIT', engineIndependent: true });
  for (const o of ctx.finraObs || []) if (o.kind === 'SPLIT' && !o.cancelled && finite(o.ratio) && o.exDate && o.exDate > first && o.exDate <= last && Math.abs(Math.log(o.ratio)) >= Math.log(1.5))
    evs.push({ from: addDays(o.exDate, -5), to: addDays(o.exDate, 5), date: o.exDate, ratio: o.ratio, source: 'FINRA_SPLIT', engineIndependent: false });
  const sh = (ctx.shares || []).filter((s) => finite(s.value) && s.value > 0).map((s) => ({ at: String(s.periodEnd || s.availableAt).slice(0, 10), value: s.value })).sort((a, b) => (a.at < b.at ? -1 : 1));
  for (let k = 1; k < sh.length; k++) {
    const a = sh[k - 1], b = sh[k], sr = b.value / a.value;
    if (b.at <= a.at || b.at > addDays(a.at, 200) || a.at < first || b.at > last || sr > 1 / 3) continue;
    evs.push({ from: a.at, to: b.at, date: null, ratio: sr, source: 'SEC_SHARES_DROP', engineIndependent: false });
  }
  /* one event per corporate action: a vendor/FINRA event inside a share-count window replaces the window */
  const dated = evs.filter((e) => e.date);
  return dated.filter((e, i) => !dated.slice(0, i).some((x) => daysApart(x.date, e.date) <= 10 && Math.abs(Math.log(x.ratio) - Math.log(e.ratio)) <= Math.log(1.05)))
    .concat(evs.filter((e) => !e.date && !dated.some((x) => x.date > e.from && x.date <= e.to)));
}
