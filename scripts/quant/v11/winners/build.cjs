#!/usr/bin/env node
'use strict';
// V11 WINNERS stage 1: cohort members, features available at t, forward outcomes and classes.
// Usage: node build.cjs --private <dir outside repo> [--docs <pit docs dir>]
// Writes <private>/members.json.gz and <private>/python-input.json.gz (loader-qualified series for the
// independent Python check). Reuses the V10 study frame, the V10 factor market-cap/fundamental path and
// the product fundamental-inputs engine unchanged.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const K = require('../../v10/studies/common.cjs');
const X = require('../../v10/factor/factors.cjs');
const Fc = require('../../v10/factor/common.cjs');
const { docAt } = require('../../v10/factor/panel.cjs');
const W = require('./lib.cjs');
const REG = require('./registration.cjs');

const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const LOADER = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true };
const FUND_FROM = '2011-01-01';
const TEMPLATE_NULL = ['grossMarginTtm', 'operatingMarginTtm', 'roaTtm', 'roeTtm', 'salesYield', 'earningsYield', 'bookToMarket', 'accrualRatio', 'netDebtToAssets', 'fcfMarginTtm', 'salesToMarketCap', 'equityToAssets'];
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

function loadDocs(dir, cik) {
  const p = path.join(dir, cik + '.json.gz');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions;
}
function rateSeries() {
  const s = JSON.parse(fs.readFileSync(path.join(K.ROOT, 'quant/data/market/multi-asset/series/US10Y.json'), 'utf8'));
  const pts = s.points.filter(p => W.finite(p[1]));
  const at = d => { let lo = 0, hi = pts.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= d) { r = pts[m]; lo = m + 1; } else hi = m - 1; } return r; };
  return { sha256: K.C.shaFile(path.join(K.ROOT, 'quant/data/market/multi-asset/series/US10Y.json')), change52w: d => {
    const a = at(d), b = at(new Date(Date.parse(d + 'T00:00:00Z') - 364 * 86400000).toISOString().slice(0, 10));
    return a && b ? { level: a[1], change: a[1] - b[1], levelDate: a[0], priorDate: b[0] } : null; } };
}

function main() {
  const priv = K.privateDir(arg('--private', path.join(SCRATCH, 'v11-private/winners')));
  const docsDir = arg('--docs', path.join(SCRATCH, 'v10-private/factor/docs'));
  const t0 = Date.now();
  const fr = K.buildFrame(LOADER);
  const panel = K.buildPanel(fr);
  const bench = K.loadBenchmark();
  const regimes = K.regimeLabels(bench, fr.calendar);
  const rates = rateSeries();
  const calIndex = new Map(fr.calendar.map((d, i) => [d, i])), calLast = fr.calendar.length - 1;
  const cohorts = W.cohortDates(fr.calendar);
  const spyOnCal = fr.calendar.map(d => bench.byDate.get(d) ?? null);
  const peers = Fc.peerTable();
  console.error('frame', fr.frame.length, 'cohorts', cohorts.length, ((Date.now() - t0) / 1000).toFixed(1) + 's');

  // ---- members, price features, forward outcomes ----
  const cohortRows = cohorts.map(date => ({ date, ci: calIndex.get(date), members: [], counts: { candidatesWithBar: 0, youngerThan52w: 0, beforeListingStart: 0 } }));
  const byListing = new Map();
  for (const p of panel) {
    const k0 = p.cal[0];
    for (const c of cohortRows) {
      const k = c.ci - k0; if (k < 0 || k >= p.cal.length || p.cal[k] !== c.ci) continue;
      c.counts.candidatesWithBar++;
      if (p.dates[k] < p.listingStart) { c.counts.beforeListingStart++; continue; }
      if (k < 52 || p.cal[k] - p.cal[k - 52] !== 52) { c.counts.youngerThan52w++; continue; }
      const f = W.priceFeatures(p.closes, k, j => spyOnCal[p.cal[j]]);
      const fwd = {}, spy = {};
      for (const [hk, h] of Object.entries(W.HORIZONS)) {
        fwd[hk] = W.forwardOutcome(p, k, h, calLast);
        const a = spyOnCal[c.ci + 1], b = spyOnCal[c.ci + 1 + h];
        spy[hk] = W.finite(a) && W.finite(b) ? b / a - 1 : null;
      }
      const m = { id: p.id, k, f, fwd, spy, fund: null };
      c.members.push(m);
      if (!byListing.has(p.id)) byListing.set(p.id, []);
      byListing.get(p.id).push({ c, m });
    }
  }
  console.error('members', cohortRows.reduce((s, c) => s + c.members.length, 0), ((Date.now() - t0) / 1000).toFixed(1) + 's');

  // ---- fundamentals (filed < t), 2011+ ----
  const fundCounts = {};
  const cnt = (d, r) => { fundCounts[d] = fundCounts[d] || {}; fundCounts[d][r] = (fundCounts[d][r] || 0) + 1; };
  const listingCik = new Map(), cikListings = new Map();
  for (const p of panel) {
    const cik = p.doc.identityEvidenceBinding?.cik || peers.get(p.id)?.cik || null;
    listingCik.set(p.id, cik);
    if (cik) cikListings.set(cik, (cikListings.get(cik) || 0) + 1);
  }
  const pById = new Map(panel.map(p => [p.id, p]));
  const byCik = new Map();
  for (const [id, list] of byListing) {
    const cik = listingCik.get(id), rel = list.filter(x => x.c.date >= FUND_FROM);
    if (!rel.length) continue;
    if (!cik) { rel.forEach(x => cnt(x.c.date, 'noCik')); continue; }
    if (!byCik.has(cik)) byCik.set(cik, []);
    byCik.get(cik).push([id, rel]);
  }
  let docsRead = 0;
  for (const [cik, items] of byCik) {
    const versions = loadDocs(docsDir, cik); docsRead++;
    for (const [id, rel] of items) {
      const p = pById.get(id), sic4 = peers.get(id)?.sic4, template = X.needsIndustryTemplate(Number.parseInt(sic4, 10));
      const factors = X.weeklySplitFactors(p.dates, (p.doc.corporateActions?.splits || []).map(s => [s[0], s[1]]));
      for (const { c, m } of rel) {
        if (!versions) { cnt(c.date, 'noPitDocument'); continue; }
        const v = docAt(versions, c.date); if (!v) { cnt(c.date, 'noFilingVisible'); continue; }
        const cutoff = Fc.dayBefore(c.date);
        if (v.asOf > cutoff) throw Error('PIT_DOC_AFTER_CUTOFF:' + cik + '@' + c.date);
        const mc = X.marketCapAt({ doc: v.doc, cutoff, dates: p.dates, closes: p.closes, factors, i: m.k, issuerListings: cikListings.get(cik) || 1 });
        cnt(c.date, 'marketCap:' + (mc.reason || 'OK'));
        const fi = require(K.ROOT + '/quant/engines/fundamental-inputs.js').compute(v.doc, cutoff, W.finite(mc.value) ? mc.value : null);
        if (!fi) { cnt(c.date, 'fundamentalsDocumentInvalid'); continue; }
        if (fi.availableAt && fi.availableAt > cutoff) throw Error('FUNDAMENTAL_AFTER_CUTOFF:' + id + '@' + c.date);
        const r = fi.raws, ch = fi.change || {};
        const f = { logMarketCap: W.finite(mc.value) && mc.value > 0 ? Math.log(mc.value) : null, revenueGrowthTtmYoy: r.revenueGrowthTtmYoy, revenueCagr3y: r.revenueCagr3y, epsCagr3y: r.epsCagr3y,
          grossMarginTtm: ch.grossMarginTtm, operatingMarginTtm: r.operatingMarginTtm, roaTtm: r.roaTtm, roeTtm: r.roeTtm, salesYield: r.salesYield, earningsYield: r.earningsYield,
          bookToMarket: r.bookToMarket, accrualRatio: r.accrualRatio, netDebtToAssets: r.netDebtToAssets, fcfMarginTtm: r.fcfMarginTtm,
          // amendment 1.0.1
          salesToMarketCap: W.finite(mc.value) && mc.value > 0 && W.finite(v.doc.ttm?.revenue?.v) && v.doc.ttm.revenue.filed <= cutoff ? v.doc.ttm.revenue.v / mc.value : null,
          equityToAssets: r.equityToAssets };
        if (template) { cnt(c.date, 'industryTemplate'); for (const key of TEMPLATE_NULL) f[key] = null; }
        for (const key of Object.keys(f)) if (W.finite(f[key])) m.f[key] = f[key];
        const rev = v.doc.ttm?.revenue, ni = v.doc.ttm?.net_income;
        m.fund = { cik, docFrom: v.from, availableAt: fi.availableAt, referenceEnd: fi.referenceEnd, template,
          revenue: rev ? { end: rev.end, filed: rev.filed, accn: rev.accn, v: rev.v } : null, netIncome: ni ? { end: ni.end, filed: ni.filed, accn: ni.accn, v: ni.v } : null };
      }
    }
  }
  console.error('fundamentals docs', docsRead, ((Date.now() - t0) / 1000).toFixed(1) + 's');

  // ---- cohort context: regime, rate phase, SPY ----
  for (const c of cohortRows) {
    c.regime = regimes.byDate.get(c.date) || { trend: 'REGIME_UNAVAILABLE', volatility: 'REGIME_UNAVAILABLE' };
    const rt = rates.change52w(c.date); c.rate = rt; c.ratePhase = W.ratePhase(rt ? rt.change : null);
    c.subperiod = W.subperiodOf(c.date);
  }
  const header = { schemaVersion: 'v11-winners-members-1.0.0', loaderOptions: LOADER, calendarLength: fr.calendar.length, calendarFirst: fr.calendar[0], calendarLast: fr.calendar[calLast],
    frame: fr.frame.length, qualification: fr.reasons, frameExcluded: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, v.length])), regimeResultHash: regimes.resultHash,
    us10ySha256: rates.sha256, benchmark: { source: K.B.SOURCE, sha256: K.C.shaFile(path.join(K.ROOT, K.B.SOURCE)) }, fundCounts, registrationHash: JSON.parse(fs.readFileSync(path.join(K.ROOT, 'docs/quant-recovery/v11/winners/registration-1.0.0.json'), 'utf8')).registrationHash,
    codeHashes: K.codeHashes(['scripts/quant/v11/winners/lib.cjs', 'scripts/quant/v11/winners/build.cjs', 'scripts/quant/v10/factor/factors.cjs', 'quant/engines/fundamental-inputs.js']), gitHead: K.gitHead(),
    lifecycle: Object.fromEntries(panel.filter(p => p.lifecycle).map(p => [p.id, { status: p.lifecycle.status, lastTradeDate: p.lifecycle.lastTradeDate ?? null, lastObservedDate: p.lifecycle.lastObservedDate ?? null, terminal: p.lifecycle.terminal?.kind ?? null, cashPerShare: p.lifecycle.terminal?.cashPerShare ?? null }])),
    tickers: Object.fromEntries(panel.map(p => [p.id, p.doc.ticker])), seconds: Math.round((Date.now() - t0) / 1000) };
  K.writeJson(path.join(priv, 'members.json.gz'), { header, cohorts: cohortRows.map(c => ({ ...c, members: c.members.map(m => ({ id: m.id, k: m.k, f: m.f, fwd: m.fwd, spy: m.spy, fund: m.fund })) })) }, true);
  // Python input: loader-qualified weekly closes on calendar indices, lifecycle, SPY, US10Y path, cohort dates.
  K.writeJson(path.join(priv, 'python-input.json.gz'), { calendar: fr.calendar, spy: spyOnCal, cohorts,
    listings: panel.map(p => ({ id: p.id, listingStart: p.listingStart, dates: p.dates, closes: Array.from(p.closes), lifecycle: p.lifecycle ? { status: p.lifecycle.status, terminal: p.lifecycle.terminal } : null })) }, true);
  console.error('done', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'rss', (process.memoryUsage().rss / 1e9).toFixed(2));
}
if (require.main === module) main();
