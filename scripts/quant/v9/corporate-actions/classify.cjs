#!/usr/bin/env node
/* V9 workstream B (corporate-actions): deterministic per-event resolution from SEC evidence.
   Rule version: v9-ca-resolution-rule-1.0.0 (fixed before looking at outcome counts; thresholds below).
   Inputs (private): events.json (triage.cjs), sec-evidence.json (fetch_sec_evidence.py).
   Reads the weekly series directly for raw-price reconstruction (identity check) and round trips.
   Writes: --out (per-event resolution table, small derived facts only).

   Categories
     SPLIT_CONFIRMED_SERIES_UNADJUSTED   shares jump by ~k in the split direction across two bracketing filings
                                         AND a split filing (8-K/6-K/proxy full-text hit or XBRL split-ratio fact) in window.
                                         The weekly series carries the k-jump -> provider adjustment missing = data defect.
     PROVIDER_SPLIT_UNSUPPORTED          provider records a split in the week, shares continuous, no split filing
                                         -> provider split factor not supported by SEC share counts = data defect.
     SPIN_OFF_OR_DISTRIBUTION_CANDIDATE  DOWN move, shares continuous, distribution/spin-off full-text hit in an 8-K/10-12B
                                         -> needs manual confirmation of distribution ratio; price-return only.
     GENUINE_MOVE_SUPPORTED              shares continuous across two bracketing filings, no split filing, no distribution
                                         indicator, no provider split in week, identity consistent, not a transient round trip.
                                         Negative evidence: excludes a split/reverse split, does not prove the print.
     SHARES_K_CHANGE_UNEXPLAINED         shares change ~k but no split filing (issuance/cancellation possible) -> unresolved
     CONFLICT                            continuous shares but STRONG split filing (8-K with item 3.03/5.03 and split phrase) or
                                         XBRL split-ratio fact = k near the date -> unresolved
     SPLIT_MENTION_NEAR_DATE_REVIEW      continuous shares, but split phrase in another 8-K/6-K within +-30d -> unresolved (manual review)
     ROUND_TRIP_PRICE_INTEGRITY          shares continuous, but the move reverses within 4 weeks -> print integrity unproven
     UNRESOLVED_*                        missing mapping / no XBRL bracket / pre-2001 etc.
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const RULE = {
  version: 'v9-ca-resolution-rule-1.0.0',
  bracketMaxDays: 200,          // pre share point end >= prevWeek-200d, post share point end <= week+200d
  continuityMaxLog: Math.log(1.25),  // |ln R| <= ln 1.25  -> continuous
  splitTolLog: Math.log(1.2),        // |ln(R/S)| <= ln 1.2 -> split-consistent
  strongSplitForms: ['8-K', '8-K/A', '6-K', '6-K/A', 'DEF 14A', 'DEF 14C', 'PRE 14A', 'PRE 14C', 'DEFA14A', 'DEFM14A'],
  strongDistForms: ['8-K', '8-K/A', '6-K', '10-12B', '10-12B/A', '10-12G', '10-12G/A'],
  nearDays: 30,           // split/distribution filing must be filed within +-30 days of the event week (ratio-fact end date likewise)
  roundTripWeeks: 4, roundTripFraction: 0.5,
  floatBand: [0.2, 1.1], floatMaxDays: 730,
};
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const EV = arg('--events'), SEC = arg('--sec'), OUT = arg('--out');
const events = JSON.parse(fs.readFileSync(EV, 'utf8')).events.filter(e => e.listingStatus === 'CORPORATE_ACTION_UNRESOLVED');
const sec = JSON.parse(fs.readFileSync(SEC, 'utf8'));
const DAY = 86400000, t = s => Date.parse(s.slice(0, 10) + 'T00:00:00Z');
const seriesCache = new Map();
function series(id) { if (!seriesCache.has(id)) seriesCache.set(id, JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/discover-series-long', id + '.json'), 'utf8'))); return seriesCache.get(id); }

/* original as-reported value per period end: earliest filing that reports that end; ambiguous if that filing reports >1 distinct value */
function asReported(rows) {
  const byEnd = new Map();
  for (const r of rows || []) {
    if (!r.end || typeof r.val !== 'number' || r.unit !== 'shares') continue;
    const cur = byEnd.get(r.end);
    if (!cur || r.filed < cur.filed) byEnd.set(r.end, { end: r.end, filed: r.filed, accn: r.accn, form: r.form, vals: new Set([r.val]) });
    else if (r.filed === cur.filed && r.accn === cur.accn) cur.vals.add(r.val);
  }
  return [...byEnd.values()].filter(x => x.vals.size === 1 && [...x.vals][0] > 0).map(x => ({ end: x.end, filed: x.filed, accn: x.accn, form: x.form, val: [...x.vals][0] })).sort((a, b) => a.end < b.end ? -1 : 1);
}
function bracket(points, e) {
  const pre = points.filter(p => t(p.end) <= t(e.prevWeek) && t(p.end) >= t(e.prevWeek) - RULE.bracketMaxDays * DAY).pop();
  const postFrom = e.maxDailyDate && e.maxDailyDate > e.prevWeek ? e.maxDailyDate : e.week;
  const post = points.find(p => t(p.end) >= t(postFrom) && t(p.end) <= t(e.week) + RULE.bracketMaxDays * DAY);
  return pre && post ? { pre, post, R: post.val / pre.val } : null;
}
function rawPriceAt(doc, date) {
  const pts = doc.points; let c = null;
  for (const p of pts) { if (p[0] <= date) c = p[1]; else break; }
  if (c == null) return null;
  const f = (doc.corporateActions?.splits || []).filter(s => s[0] > date).reduce((m, s) => m * s[1], 1);
  return c * f;
}
function floatCheck(L, doc, e) {
  const fl = asReported((L.shareFacts || {})['dei:EntityPublicFloat']?.map(r => ({ ...r, unit: 'shares' })) || []);
  const sh = asReported((L.shareFacts || {})['dei:EntityCommonStockSharesOutstanding']);
  const out = [];
  for (const f of fl) {
    if (Math.abs(t(f.end) - t(e.week)) > RULE.floatMaxDays * DAY) continue;
    const s = sh.filter(x => Math.abs(t(x.end) - t(f.end)) <= 200 * DAY).sort((a, b) => Math.abs(t(a.end) - t(f.end)) - Math.abs(t(b.end) - t(f.end)))[0];
    const p = rawPriceAt(doc, f.end);
    if (!s || !p) continue;
    out.push({ floatEnd: f.end, floatUsd: f.val, floatAccn: f.accn, sharesEnd: s.end, shares: s.val, rawPriceFromSeries: Math.round(p * 1e6) / 1e6, ratio: Math.round(f.val / (p * s.val) * 1e4) / 1e4, side: f.end < e.prevWeek ? 'PRE' : 'POST' });
  }
  const ok = out.filter(x => x.ratio >= RULE.floatBand[0] && x.ratio <= RULE.floatBand[1]);
  return { checks: out, status: !out.length ? 'NO_FLOAT_FACT' : ok.length ? 'CONSISTENT' : 'INCONSISTENT' };
}
function roundTrip(e) {
  const L = Math.abs(Math.log(e.weeklyRatio));
  return e.next4.slice(0, RULE.roundTripWeeks).some(c => Math.abs(Math.log(c / e.prevClose)) < RULE.roundTripFraction * L);
}
const rows = [];
for (const e of events) {
  const L = sec.listings[e.id] || {};
  const ev = (L.events || []).find(x => x.week === e.week) || {};
  const row = { id: e.id, ticker: e.ticker, week: e.week, prevWeek: e.prevWeek, weeklyRatio: e.weeklyRatio, k: e.k, direction: e.direction,
    engineStatus: e.itemStatus, engineReason: e.reason, maxDailyRatio: e.maxDailyRatio, maxDailyDate: e.maxDailyDate, splitInWeek: e.splitInWeek,
    cik: L.cik || null, secTitle: L.secTitle || null, mapping: L.mapping || 'NOT_FETCHED', roundTrip: roundTrip(e) };
  if (e.itemStatus === 'RESOLVED_GENUINE_MOVE') { row.resolution = 'ENGINE_RESOLVED'; rows.push(row); continue; }
  if (row.mapping !== 'CURRENT_SEC_TICKER_MAP') { row.resolution = 'UNRESOLVED_NO_SEC_MAPPING'; rows.push(row); continue; }
  const S = e.direction === 'DOWN' ? e.k : 1 / e.k;  // expected share factor if the move were an unadjusted split
  row.expectedShareFactorIfSplit = S;
  const facts = L.shareFacts || {};
  let br = null, concept = null;
  for (const c of ['dei:EntityCommonStockSharesOutstanding', 'us-gaap:CommonStockSharesOutstanding']) {
    br = bracket(asReported(facts[c]), e); if (br) { concept = c; break; }
  }
  const near = (h, before, after) => t(h.filed) >= t(e.prevWeek) - before * DAY && t(h.filed) <= t(e.week) + after * DAY;
  const exhibitNoise = h => /ex-?_?10|ex-?_?2[-_.]|ex2-|ex10|ex-2d|ex10d/i.test(String(h.id).split(':')[1] || '');
  const splitHits = (ev.splitSearch?.hits || []).filter(h => !exhibitNoise(h));
  const acc = h => String(h.id).split(':')[0];
  const items303 = (ev.filingsInWindow || []).filter(f => f.form.startsWith('8-K') && /(^|,)(3\.03|5\.03)(,|$)/.test(f.items || ''));
  const acc303 = new Set(items303.map(f => f.acc));
  /* STRONG: split phrase inside an 8-K whose items include 3.03/5.03, filed within +-RULE.nearDays of the event week */
  const strongSplit = splitHits.filter(h => (h.form || '').startsWith('8-K') && acc303.has(acc(h)) && near(h, RULE.nearDays, RULE.nearDays));
  /* WEAK: split phrase in any other 8-K/6-K (non-exhibit-10/2) within +-nearDays */
  const weakSplit = splitHits.filter(h => /^(8-K|6-K)/.test(h.form || '') && !strongSplit.includes(h) && near(h, RULE.nearDays, RULE.nearDays));
  const proxySplit = splitHits.filter(h => /14[AC]/.test(h.form || ''));
  const ratioFacts = (facts['us-gaap:StockholdersEquityNoteStockSplitConversionRatio1'] || []).filter(r => r.end && t(r.end) >= t(e.prevWeek) - RULE.nearDays * DAY && t(r.end) <= t(e.week) + RULE.nearDays * DAY
    && (Math.abs(r.val / e.k - 1) < 0.03 || Math.abs(r.val * e.k - 1) < 0.03));
  const distHits = (ev.distSearch?.hits || []).filter(h => !exhibitNoise(h) && RULE.strongDistForms.includes(h.form) && (/^10-12/.test(h.form) || near(h, 90, RULE.nearDays)));
  const items201 = (ev.filingsInWindow || []).filter(f => f.form.startsWith('8-K') && /(^|,)2\.01(,|$)/.test(f.items || '') && near(f, RULE.nearDays, RULE.nearDays));
  row.evidence = {
    shareConcept: concept, bracket: br ? { pre: br.pre, post: br.post, R: Math.round(br.R * 1e6) / 1e6 } : null,
    splitSearch: ev.splitSearch ? { url: ev.splitSearch.url, sha256: ev.splitSearch.sha256, total: ev.splitSearch.total, strong: strongSplit.slice(0, 5), weak: weakSplit.slice(0, 5), proxy: proxySplit.slice(0, 3) } : null,
    items303or503: items303.map(f => ({ acc: f.acc, filed: f.filed, items: f.items })),
    xbrlSplitRatioFacts: [...new Map(ratioFacts.map(r => [r.val + '|' + r.accn, { val: r.val, accn: r.accn, filed: r.filed, end: r.end }])).values()].slice(0, 5),
    distSearch: ev.distSearch ? { url: ev.distSearch.url, sha256: ev.distSearch.sha256, total: ev.distSearch.total, strong: distHits.slice(0, 5) } : null,
    items201: items201.map(f => ({ acc: f.acc, filed: f.filed, items: f.items })),
    companyfacts: L.companyfacts ? { url: L.companyfacts.url, sha256: L.companyfacts.sha256 } : null,
    submissions: L.submissions ? { url: L.submissions.url, sha256: L.submissions.sha256, name: L.submissions.name } : null,
  };
  const ftsCovered = e.week >= '2001-01-01';
  const splitFilingStrong = strongSplit.length > 0 || ratioFacts.length > 0;
  const splitFilingAny = splitFilingStrong || weakSplit.length > 0;
  const fc = floatCheck(L, series(e.id), e);
  row.identity = { status: fc.status, checks: fc.checks.slice(0, 6) };
  if (!br) { row.resolution = e.week < '2009-06-15' ? 'UNRESOLVED_PRE_XBRL_NO_SHARE_BRACKET' : 'UNRESOLVED_NO_SHARE_BRACKET'; rows.push(row); continue; }
  const lr = Math.log(br.R);
  const continuous = Math.abs(lr) <= RULE.continuityMaxLog;
  const splitConsistent = Math.abs(lr - Math.log(S)) <= RULE.splitTolLog;
  row.shareClass = continuous ? 'CONTINUOUS' : splitConsistent ? 'SPLIT_CONSISTENT' : 'OTHER_CHANGE';
  if (splitConsistent) row.resolution = !ftsCovered ? 'UNRESOLVED_NO_FULLTEXT_COVERAGE' : splitFilingAny ? 'SPLIT_CONFIRMED_SERIES_UNADJUSTED' : 'SHARES_K_CHANGE_UNEXPLAINED';
  else if (continuous) {
    if (!ftsCovered) row.resolution = 'UNRESOLVED_NO_FULLTEXT_COVERAGE';
    else if (splitFilingStrong) row.resolution = 'CONFLICT_SPLIT_FILING_WITH_CONTINUOUS_SHARES';
    else if (weakSplit.length) row.resolution = 'SPLIT_MENTION_NEAR_DATE_REVIEW';
    else if (e.splitInWeek) row.resolution = 'PROVIDER_SPLIT_UNSUPPORTED';
    else if (e.direction === 'DOWN' && (distHits.length || items201.length)) row.resolution = 'SPIN_OFF_OR_DISTRIBUTION_CANDIDATE';
    else if (row.roundTrip) row.resolution = 'ROUND_TRIP_PRICE_INTEGRITY';
    else if (fc.status === 'INCONSISTENT') row.resolution = 'UNRESOLVED_IDENTITY_INCONSISTENT';
    else row.resolution = 'GENUINE_MOVE_SUPPORTED';
  } else row.resolution = 'UNRESOLVED_SHARES_OTHER_CHANGE';
  rows.push(row);
}
const count = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const out = { schemaVersion: 'v9-ca-event-resolutions-1.0.0', rule: RULE, codeSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  secEvidenceSha256: crypto.createHash('sha256').update(fs.readFileSync(SEC)).digest('hex'),
  counts: { events: rows.length, byResolution: count(rows, r => r.resolution), byResolutionPost2009: count(rows.filter(r => r.week >= '2009-06-15'), r => r.resolution) },
  timeNote: 'Only SEC filing dates (filingDate / file_date) and XBRL period-end dates are used; no acceptance times. No time-zone conversion involved.',
  rows };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(JSON.stringify(out.counts, null, 1));
