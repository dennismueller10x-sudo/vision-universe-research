#!/usr/bin/env node
/* V9 workstream B: build the PROPOSED source-evidence registry (ca-evidence-proposal.json) from the
   per-event resolution table, and dry-run its effect on weekly qualification WITHOUT editing any engine.

   The wrapper calls the unchanged createLoader(); only listings that throw CORPORATE_ACTION_UNRESOLVED are
   re-examined: if EVERY unresolved item is covered by an ACCEPTED registry entry whose bindings re-verify
   against the series bytes, the listing is counted as WOULD_QUALIFY. CORPORATE_ACTION_UNRESOLVED is the last
   throwing check in weekly-real-adapter.cjs#validate before CORPORATE_ACTION_EVIDENCE_MISMATCH, which
   only applies to engine-resolved items (re-checked here too), so all other checks have passed for these listings.

   Usage: node proposal_dryrun.cjs --resolutions <json> --quotes <json> --proposal <out json> --dryrun <out json>
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const { createLoader } = require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'));
const CA = require(path.join(ROOT, 'quant/engines/corporate-action-evidence.js'));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const RES = JSON.parse(fs.readFileSync(arg('--resolutions'), 'utf8'));
const QUOTES = arg('--quotes') ? JSON.parse(fs.readFileSync(arg('--quotes'), 'utf8')) : { rows: [] };
const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));
const canon = new Map(master.rows.filter(r => r.baseline_security_id).map(r => [r.baseline_security_id, r.canonical_id]));

/* Manual review verdicts bound to quoted original SEC documents (build_manual_review.py). */
const REVIEW = JSON.parse(fs.readFileSync(arg('--review'), 'utf8'));
const reviewByKey = new Map(REVIEW.reviews.map(r => [r.key, r]));
const MANUAL_DISTRIBUTIONS = Object.fromEntries(REVIEW.reviews.filter(r => /_CONFIRMED$/.test(r.verdict) && r.distribution).map(r => [r.key, { verdict: r.verdict, ...r.distribution, documents: r.documents }]));
const ACCEPT_RULE = {
  version: 'ca-evidence-registry-acceptance-1.0.0',
  GENUINE_MOVE: 'accept iff: SEC share count (dei:EntityCommonStockSharesOutstanding, else us-gaap:CommonStockSharesOutstanding; original as-reported value = earliest filing per period end) from two filings bracketing the event: pre.end <= prevWeek and >= prevWeek-200d, post.end >= max(maxDailyDate, week-start) and <= week+200d; |ln(post/pre)| <= ln(1.25); no STRONG split filing (8-K with item 3.03/5.03 containing a split phrase, or XBRL StockholdersEquityNoteStockSplitConversionRatio1 = k or 1/k with end within +-30d), no WEAK split mention (split phrase in any 8-K/6-K non-exhibit-10 document filed within +-30d), no distribution/spin-off indicator for DOWN moves, no provider split in the week, event week >= 2001-01-01 (EDGAR full-text coverage), not a round trip (move reverses by >= half (log) within 4 weeks), identity check CONSISTENT (dei:EntityPublicFloat / (raw series price x shares) in [0.2, 1.1] for at least one float fact within +-730d).',
  SPIN_OFF_DISTRIBUTION: 'accept as PRICE_RETURN_ONLY iff the distribution (asset, ratio, date) is documented by a quoted original SEC filing and shares are continuous; total-return use requires the documented distribution value.',
  SPLIT_UNADJUSTED: 'never accepted by the registry; requires a corrected series generation (pre-event closes multiplied by the price factor 1/k (DOWN) or k (UP)) produced by the series producer and re-validated.',
  PROVIDER_SPLIT_UNSUPPORTED: 'never accepted by the registry; provider split factor contradicted by SEC share counts -> producer must remove the factor and re-publish.',
  bindings: 'every entry binds securityId, canonicalId, event week, prevWeek, weeklyRatio (6 dp) and the sha256 of the series bytes it was derived from; any mismatch invalidates the entry.',
};
const entries = [], rejectedOnReview = [];
for (const r of RES.rows) {
  if (r.resolution === 'ENGINE_RESOLVED') continue;
  let resolution = null, accepted = false, effect = null;
  const manual = MANUAL_DISTRIBUTIONS[r.id + '|' + r.week];
  if (r.resolution === 'GENUINE_MOVE_SUPPORTED') {
    resolution = 'GENUINE_MOVE';
    accepted = r.identity?.status === 'CONSISTENT';
    effect = accepted ? 'RESOLVED_SOURCE_EVIDENCE_GENUINE_MOVE' : 'NOT_ACCEPTED_IDENTITY_UNVERIFIED';
  } else if (r.resolution === 'SPIN_OFF_OR_DISTRIBUTION_CANDIDATE') {
    resolution = 'SPIN_OFF_DISTRIBUTION';
    accepted = !!manual;
    effect = manual ? 'RESOLVED_PRICE_RETURN_ONLY_DISTRIBUTION_DOCUMENTED' : 'NOT_ACCEPTED_DISTRIBUTION_NOT_CONFIRMED';
    if (!manual) { rejectedOnReview.push({ key: r.id + '|' + r.week, automated: r.resolution, review: 'NOT_CONFIRMED_AS_DISTRIBUTION_OF_THIS_ISSUER_AT_THIS_DATE' }); continue; }
  } else if (r.resolution === 'SPLIT_CONFIRMED_SERIES_UNADJUSTED' || reviewByKey.get(r.id + '|' + r.week)?.verdict === 'SPLIT_CONFIRMED_SERIES_UNADJUSTED') {
    const rv = reviewByKey.get(r.id + '|' + r.week);
    if (!rv || rv.verdict !== 'SPLIT_CONFIRMED_SERIES_UNADJUSTED') { rejectedOnReview.push({ key: r.id + '|' + r.week, automated: r.resolution, review: rv ? rv.verdict : 'NOT_REVIEWED', reason: rv?.reason }); continue; }
    resolution = 'SPLIT_UNADJUSTED'; effect = 'DATA_DEFECT_REQUIRES_CORRECTED_SERIES';
  } else if (reviewByKey.get(r.id + '|' + r.week)?.verdict === 'GENUINE_MOVE_SUPPORTED_MANUAL_PRE2001') {
    resolution = 'GENUINE_MOVE'; accepted = true; effect = 'RESOLVED_SOURCE_EVIDENCE_GENUINE_MOVE_MANUAL_PRE2001';
  } else if (r.resolution === 'PROVIDER_SPLIT_UNSUPPORTED') {
    resolution = 'PROVIDER_SPLIT_UNSUPPORTED'; effect = 'DATA_DEFECT_REQUIRES_PRODUCER_FIX';
  } else continue;
  const bytes = fs.readFileSync(path.join(ROOT, 'quant/data/market/discover-series-long', r.id + '.json'));
  const q = QUOTES.rows.filter(x => x.key === r.id + '|' + r.week || x.key.startsWith(r.id + '|' + r.week + '#')).map(x => ({ url: x.url, acc: x.acc, form: x.form, filed: x.filed, sha256: x.sha256, quotes: x.quotes }));
  entries.push({
    securityId: r.id, canonicalId: canon.get(r.id) || null, ticker: r.ticker, cik: r.cik, secTitle: r.secTitle,
    week: r.week, prevWeek: r.prevWeek, weeklyRatio: r.weeklyRatio, k: r.k, direction: r.direction,
    engineReason: r.engineReason, maxDailyRatio: r.maxDailyRatio, maxDailyDate: r.maxDailyDate,
    resolution, accepted, effect, classifierResolution: r.resolution,
    priceFactorCorrection: resolution === 'SPLIT_UNADJUSTED' ? { multiplyClosesOnOrBefore: r.prevWeek, factor: r.direction === 'DOWN' ? 1 / r.k : r.k, note: 'proposal only; must be produced by the series producer from provider daily bars, never by editing the weekly file' } : undefined,
    distribution: resolution === 'SPIN_OFF_DISTRIBUTION' ? (manual || null) : undefined,
    returnBasisRestriction: resolution === 'SPIN_OFF_DISTRIBUTION' ? 'PRICE_RETURN_ONLY' : undefined,
    manualReview: reviewByKey.get(r.id + '|' + r.week) || null,
    evidence: !r.evidence ? null : { shareConcept: r.evidence.shareConcept, bracket: r.evidence.bracket, splitSearch: r.evidence.splitSearch && { url: r.evidence.splitSearch.url, sha256: r.evidence.splitSearch.sha256, total: r.evidence.splitSearch.total, strong: r.evidence.splitSearch.strong.length, weak: r.evidence.splitSearch.weak.length, proxy: r.evidence.splitSearch.proxy.length },
      distSearch: r.evidence.distSearch && { url: r.evidence.distSearch.url, sha256: r.evidence.distSearch.sha256, total: r.evidence.distSearch.total, strong: r.evidence.distSearch.strong.map(h => h.id) },
      xbrlSplitRatioFacts: r.evidence.xbrlSplitRatioFacts, items303or503: r.evidence.items303or503, items201: r.evidence.items201,
      companyfacts: r.evidence.companyfacts, submissions: r.evidence.submissions, identity: r.identity, documents: q },
    bindings: { seriesSha256: sha(bytes) },
  });
}
const proposalHead = 0;
const proposal = { schemaVersion: 'ca-evidence-registry-proposal-1.0.0', status: 'PROPOSAL_NOT_ACTIVE', productionApproved: false,
  acceptanceRule: ACCEPT_RULE, classifierRule: RES.rule, classifierCodeSha256: RES.codeSha256, secEvidenceSha256: RES.secEvidenceSha256,
  negativeEvidenceNote: 'GENUINE_MOVE is negative evidence: it shows that no split/reverse split (share-count change by ~k) and no split/distribution filing occurred around the date. It does not prove the correctness of the individual price print.',
  rejectedOnReview, entries };

/* ---- dry run ---- */
const accepted = new Map(entries.filter(e => e.accepted).map(e => [e.securityId + '|' + e.week, e]));
const loader = createLoader(ROOT);
const dir = path.join(ROOT, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const before = {}, after = {}, newly = [], blockedBy = {};
for (const id of ids) {
  const bytes = fs.readFileSync(path.join(dir, id + '.json'), 'utf8');
  let st = 'QUALIFIED', items = null;
  try { loader(id, bytes); } catch (e) { const m = String(e.message), c = m.indexOf(':'); st = c > 0 ? m.slice(0, c) : m; if (st === 'CORPORATE_ACTION_UNRESOLVED') items = JSON.parse(m.slice(c + 1)); }
  before[st] = (before[st] || 0) + 1;
  let st2 = st;
  if (st === 'CORPORATE_ACTION_UNRESOLVED') {
    const doc = JSON.parse(bytes), pts = doc.points, h = sha(bytes);
    const unresolved = items.filter(x => x.status !== 'RESOLVED_GENUINE_MOVE');
    const ok = unresolved.every(x => {
      const e = accepted.get(id + '|' + x.time); if (!e) return false;
      const i = pts.findIndex(p => p[0] === x.time);
      return e.bindings.seriesSha256 === h && e.canonicalId === canon.get(id) && pts[i - 1][0] === e.prevWeek && Math.abs(pts[i][1] / pts[i - 1][1] - e.weeklyRatio) <= 1e-5;
    });
    /* engine-resolved items must still pass the adapter's evidence-mismatch check */
    const mismatch = items.filter(x => x.status === 'RESOLVED_GENUINE_MOVE').some(x => { const i = pts.findIndex(p => p[0] === x.time), m = doc.corporateActions.moves.find(v => v.week === x.time); return !Number.isFinite(m.weeklyRatio) || Math.abs(m.weeklyRatio - pts[i][1] / pts[i - 1][1]) > 0.00001; });
    if (ok && !mismatch) { st2 = 'QUALIFIED'; newly.push({ id, events: unresolved.map(x => ({ week: x.time, resolution: accepted.get(id + '|' + x.time).resolution })), priceReturnOnly: unresolved.some(x => accepted.get(id + '|' + x.time).resolution === 'SPIN_OFF_DISTRIBUTION') }); }
    else {
      const missing = unresolved.filter(x => !accepted.has(id + '|' + x.time)).length;
      blockedBy[missing === 1 ? 'ONE_EVENT_NOT_ACCEPTED' : 'MULTIPLE_EVENTS_NOT_ACCEPTED'] = (blockedBy[missing === 1 ? 'ONE_EVENT_NOT_ACCEPTED' : 'MULTIPLE_EVENTS_NOT_ACCEPTED'] || 0) + 1;
    }
  }
  after[st2] = (after[st2] || 0) + 1;
}
const count = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const dry = { schemaVersion: 'v9-ca-dryrun-1.0.0', note: 'Dry run with an external wrapper around the UNCHANGED createLoader; no engine or data file edited. Not a qualification decision.',
  adapterSha256: sha(fs.readFileSync(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'))), evidenceEngine: CA.VERSION, masterHash: loader.masterHash,
  proposalEntries: entries.length, acceptedEntries: accepted.size, entriesByEffect: count(entries, e => e.effect),
  before, after, delta: { QUALIFIED: (after.QUALIFIED || 0) - (before.QUALIFIED || 0), CORPORATE_ACTION_UNRESOLVED: (after.CORPORATE_ACTION_UNRESOLVED || 0) - (before.CORPORATE_ACTION_UNRESOLVED || 0) },
  newlyQualified: newly, newlyQualifiedPriceReturnOnly: newly.filter(x => x.priceReturnOnly).length, stillHeldBreakdown: blockedBy, productionApproved: false };
/* hypothetical: in-memory corrected series for confirmed unadjusted splits (no file written, NOT counted) */
const hypothetical = entries.filter(e => e.resolution === 'SPLIT_UNADJUSTED').map(e => {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, e.securityId + '.json'), 'utf8'));
  doc.points = doc.points.map(([d, p]) => [d, d <= e.priceFactorCorrection.multiplyClosesOnOrBefore ? p * e.priceFactorCorrection.factor : p]);
  let st = 'QUALIFIED'; try { loader(e.securityId, JSON.stringify(doc)); } catch (x) { st = String(x.message).split(':')[0]; }
  return { securityId: e.securityId, week: e.week, factor: e.priceFactorCorrection.factor, correctedSeriesStatusInMemory: st, note: 'hypothetical only; publisher rounding of corrected closes not reproduced; requires producer-side regeneration' };
});
dry.hypotheticalCorrectedSeries = hypothetical;
fs.writeFileSync(arg('--proposal'), JSON.stringify(proposal, null, 1));
fs.writeFileSync(arg('--dryrun'), JSON.stringify(dry, null, 1));
console.log(JSON.stringify({ entries: entries.length, accepted: accepted.size, byEffect: dry.entriesByEffect, before, after, delta: dry.delta, stillHeld: blockedBy, priceReturnOnly: dry.newlyQualifiedPriceReturnOnly }, null, 1));
