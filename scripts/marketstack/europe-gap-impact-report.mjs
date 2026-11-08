/** Offline impact and root-cause report for the visible European price gaps.
 *
 * Zero provider requests. Reads only committed public artifacts, reuses the
 * product's own range, eligibility, calendar and continuity rules, and writes a
 * deterministic JSON report bound to the SHA-256 of every input. It never
 * changes a price, session, quarantine, identity, calendar or gate, and it
 * contains no licensed price values (counts, dates, symbols and status codes
 * only).
 *
 * Primary cause per missing session (exactly one, no double counting):
 *   CALENDAR_DEVIATION_SUSPECTED  provider-absent on a MIC-date where every eligible
 *                                 security is absent (#1285 calendarRecheck rule) and
 *                                 no official evidence says the venue was open
 *   IDENTITY_HOLD                 quarantined session inside an identity-quarantine
 *                                 interval (reproduces the 18,098 holds of #644/#658)
 *   SYMBOL_CHANGE_SUSPECTED       series tail after the provider stopped serving the
 *                                 stored symbol (Paris .PA, HTTP 422/406)
 *   QUARANTINE                    data delivered but excluded (immutable quarantine,
 *                                 241 invalid Close values, withheld tail)
 *   PROVIDER_NO_DATA              provider returned no row for a rule-calendar session
 *   UNEXPLAINED                   remainder
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Calendar = require('../../core/europe-exchange-calendar.js');
const Ranges = require('../../core/chart-history.js');
const Eligibility = require('../../core/europe-discover-eligibility.js');
import { POLICY as CONTINUITY } from '../discover/europe-chart-continuity.mjs';

export const REPORT_VERSION = 'vu-europe-gap-impact-report-1';
export const RANGES = Object.freeze(['1Y', '3Y', '5Y', 'MAX']);
export const CAUSES = Object.freeze(['CALENDAR_DEVIATION_SUSPECTED', 'IDENTITY_HOLD', 'SYMBOL_CHANGE_SUSPECTED', 'QUARANTINE', 'PROVIDER_NO_DATA', 'UNEXPLAINED']);
/** #1285 europe-gap-date-clusters.mjs POLICY (copied, not changed). */
export const CLUSTER_POLICY = Object.freeze({ marketWideShare: 0.9, minimumEligible: 5, partialShare: 0.2, partialMinimumMissing: 3 });
/** Official-open evidence: #644 (docs/reports/europe-integrity-449-20261013/README.md):
 * "Official FWB annual calendars 2011–2014 ... October 3, 2011–2013 was open". */
export const OFFICIAL_OPEN = Object.freeze({ XETR: Object.freeze(['2011-10-03', '2012-10-03', '2013-10-03']) });
/** German rule: exact MIC XETR. Checked to coincide with issuerCountry DE. */
export const GERMANY_RULE = 'listing.mic === "XETR" (equals identityAdmission.issuerCountry === "DE" in this catalog)';
const DAY = 86400000;
const sha = b => createHash('sha256').update(b).digest('hex');
const check = (ok, code) => { if (!ok) throw new Error(code); };
const quantile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : null;
const median = s => !s.length ? null : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
const dist = values => { const s = values.slice().sort((a, b) => a - b); return { n: s.length, min: s[0] ?? null, median: median(s), p90: quantile(s, 0.9), max: s.at(-1) ?? null, sum: s.reduce((a, b) => a + b, 0) }; };
const zero = () => Object.fromEntries(CAUSES.map(c => [c, 0]));

/** #1285 MIC-date cluster rule over the public ledger (calendarRecheck = every
 * eligible security absent; MARKET_WIDE = share >= 90 % and >= 5 eligible). */
export function micDateClusters(inventory) {
  const byMic = new Map(), absent = new Map(), other = new Map();
  for (const r of inventory.rows) { if (!byMic.has(r.mic)) byMic.set(r.mic, []); byMic.get(r.mic).push(r); }
  for (const r of inventory.rows) for (const g of r.allGaps) for (const c of g.causes) {
    const key = r.mic + '|' + c.date, m = c.classification === 'PROVIDER_MISSING_DAY' ? absent : other;
    m.set(key, (m.get(key) || 0) + 1);
  }
  const out = new Map();
  for (const [key, missing] of absent) {
    const [mic, date] = key.split('|'), eligible = byMic.get(mic).filter(s => s.firstRawDate <= date && s.lastRawDate >= date).length;
    const share = eligible ? missing / eligible : 1, o = other.get(key) || 0;
    const classification = eligible < CLUSTER_POLICY.minimumEligible ? 'SMALL_MIC_UNDETERMINED' : share >= CLUSTER_POLICY.marketWideShare ? 'MARKET_WIDE'
      : share >= CLUSTER_POLICY.partialShare && missing >= CLUSTER_POLICY.partialMinimumMissing ? 'PARTIAL_MARKET' : 'SECURITY_SPECIFIC';
    out.set(key, { mic, date, missing, eligible, classification, calendarRecheck: eligible >= CLUSTER_POLICY.minimumEligible && missing + o >= eligible });
  }
  return out;
}

/** Audit-ledger cause per (securityId|date), restricted to the public approved span. */
function ledgerCauses(inventory) {
  const map = new Map();
  for (const r of inventory.rows) {
    const idBreaks = r.priceOrIdentityBreaks.filter(b => b.classification === 'IDENTITY_QUARANTINE_INTERVAL');
    for (const g of r.allGaps) {
      const identity = idBreaks.some(b => b.from === g.from && b.to === g.to);
      for (const c of g.causes) map.set(r.securityId + '|' + c.date, { ledger: c.classification, identityInterval: identity, gapClass: g.classification });
    }
  }
  return map;
}

/** Session dates: the audited exact-MIC library calendar (exchange_calendars
 * 4.13.2, sha 40b68829..., public closures in europe_449_calendar_audit.json)
 * inside its coverage, the rule calendar (core/europe-exchange-calendar.js)
 * outside it. Both are the product's own calendars; neither is changed here. */
export function makeCalendar(calendarAudit) {
  const audited = new Map();
  for (const [mic, c] of Object.entries(calendarAudit?.calendars || {})) audited.set(mic, { from: c.coverageFrom, to: c.coverageTo, closed: new Set(c.closures.map(x => x.date)) });
  const cache = new Map();
  function sessions(mic, from, to) {
    const key = mic + from + to; if (cache.has(key)) return cache.get(key);
    const rule = Calendar.sessions(mic, from, to).map(x => x.date), a = audited.get(mic), out = [];
    if (!a) { cache.set(key, rule); return rule; }
    const ruleSet = new Set(rule);
    for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay();
      const inside = d >= a.from && d <= a.to;
      if (inside ? wd !== 0 && wd !== 6 && !a.closed.has(d) : ruleSet.has(d)) out.push(d);
    }
    cache.set(key, out); return out;
  }
  /** Weekdays where the rule calendar and the audited calendar disagree. */
  function deviations(mic) {
    const a = audited.get(mic); if (!a) return { ruleSessionAuditedClosed: [], ruleClosedAuditedSession: [] };
    const rule = new Set(Calendar.sessions(mic, a.from, a.to).map(x => x.date)), ruleSessionAuditedClosed = [], ruleClosedAuditedSession = [];
    for (let t = Date.parse(a.from); t <= Date.parse(a.to); t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay(); if (wd === 0 || wd === 6) continue;
      if (rule.has(d) && a.closed.has(d)) ruleSessionAuditedClosed.push(d); else if (!rule.has(d) && !a.closed.has(d)) ruleClosedAuditedSession.push(d);
    }
    return { ruleSessionAuditedClosed, ruleClosedAuditedSession };
  }
  return { sessions, deviations, auditedMics: [...audited.keys()].sort() };
}

export function buildReport({ catalog, manifest, series, oneYear = null, inventory, calendarAudit = null, diagnostics = null, sources = {} }) {
  check(Array.isArray(catalog?.securities) && catalog.securities.length > 0, 'CATALOG_REQUIRED');
  check(Array.isArray(inventory?.rows), 'INVENTORY_REQUIRED');
  const now = manifest?.generatedAt || catalog.securities[0].listings[0].discoverChart.evaluatedAt;
  const clusters = micDateClusters(inventory), ledger = ledgerCauses(inventory), invById = new Map(inventory.rows.map(r => [r.securityId, r]));
  const cal = makeCalendar(calendarAudit), rows = [], gapLengths = [], dateMap = new Map(), overlaps = {}, causeTotals = zero(), causeTotalsDE = zero(), consistency = { ledgerDatesNotRecomputed: 0, recomputedDatesWithoutLedger: 0, oneYearFileMismatch: 0, publishedMaxStatusMismatch: 0, refreshMissingSessionsDeclared: 0, refreshMissingSessionsRecomputed: 0 };
  const overlap = k => { overlaps[k] = (overlaps[k] || 0) + 1; };
  const perRange = Object.fromEntries(RANGES.map(r => [r, { all: blank(), DE: blank() }]));
  function blank() { return { securities: 0, shown: 0, affected: 0, affectedShown: 0, continuousValid: 0, chartReadyWindow: 0, missingSessions: 0 }; }
  for (const s of catalog.securities) {
    const l = s.listings.find(x => x.listingId === s.primaryListingId) || s.listings[0];
    const de = l.mic === 'XETR', inv = invById.get(s.securityId), file = series.get(s.securityId);
    check(file && file.securityId === s.securityId && Array.isArray(file.points) && file.points.length > 1, 'SERIES_REQUIRED:' + s.securityId);
    const maxWin = l.discoverDisplay?.ranges?.MAX, start = maxWin?.safeHistoryStart || file.points[0][0];
    const points = file.points.filter(p => p[0] >= start), have = new Set(points.map(p => p[0]));
    const first = points[0][0], last = points.at(-1)[0];
    const expectedLast = l.discoverChart?.calendarProof?.expectedLastCompletedSession || last;
    const all = cal.sessions(l.mic, first, expectedLast > last ? expectedLast : last);
    const lag = l.discoverChart?.sessionLag, published = (l.discoverPublication?.status || 'ADMITTED') === 'ADMITTED';
    // A tail within the product's freshness tolerance (sessionLag <= 3, published) is
    // "not yet delivered", not a gap; only a blocked or stale tail counts.
    const staleTail = !published || !(Number.isInteger(lag) && lag <= Eligibility.POLICY.maximumSessionLag);
    const interior = all.filter(d => d <= last && !have.has(d)), tail = staleTail ? all.filter(d => d > last) : [];
    const win0 = staleTail ? all : all.filter(d => d <= last);
    const auditCutoff = inv?.lastApprovedDate || null;
    // Consistency: every ledger date inside the visible window must be recomputed by the rule calendar.
    if (inv) {
      const recomputed = new Set(interior);
      for (const g of inv.allGaps) for (const c of g.causes) if (c.date >= first && c.date <= last && !recomputed.has(c.date)) consistency.ledgerDatesNotRecomputed++;
    }
    const refresh = l.discoverChart?.refresh; if (refresh) consistency.refreshMissingSessionsDeclared += refresh.missingSessions || 0;
    // Primary cause per missing session.
    const causes = zero(), perDate = [];
    const publication = l.discoverPublication || {};
    const symbolFailure = /no_valid_symbols_provided|HTTP422|HTTP406|the_requested_data_is_not_available/.test(publication.reasonCode || '');
    for (const d of interior.concat(tail)) {
      let cause, isTail = d > last;
      const lc = ledger.get(s.securityId + '|' + d), cl = clusters.get(l.mic + '|' + d);
      if (isTail) cause = symbolFailure ? 'SYMBOL_CHANGE_SUSPECTED' : publication.reasonClass === 'PRICE_DISCONTINUITY_UNRESOLVED' || refresh?.unpublishedFrom ? 'QUARANTINE' : 'PROVIDER_NO_DATA';
      else if (lc) {
        if (lc.ledger.startsWith('QUARANTINED')) cause = lc.identityInterval ? 'IDENTITY_HOLD' : 'QUARANTINE';
        else if (lc.ledger === 'UNKNOWN') cause = 'QUARANTINE'; // #644: all 241 UNKNOWN are delivered invalid Close values
        else if (lc.ledger === 'PROVIDER_MISSING_DAY') cause = cl?.calendarRecheck && !(OFFICIAL_OPEN[l.mic] || []).includes(d) ? 'CALENDAR_DEVIATION_SUSPECTED' : 'PROVIDER_NO_DATA';
        else cause = 'UNEXPLAINED';
        if (lc.ledger === 'PROVIDER_MISSING_DAY' && cl?.calendarRecheck && (OFFICIAL_OPEN[l.mic] || []).includes(d)) overlap('CALENDAR_RECHECK_BUT_OFFICIALLY_OPEN');
        if (lc.ledger === 'PROVIDER_MISSING_DAY' && lc.identityInterval) overlap('PROVIDER_ABSENT_INSIDE_IDENTITY_INTERVAL');
        if (lc.ledger === 'PROVIDER_MISSING_DAY' && cl?.classification === 'MARKET_WIDE') overlap('PROVIDER_ABSENT_ON_MARKET_WIDE_MIC_DATE');
        if (lc.ledger.startsWith('QUARANTINED') && cl?.classification === 'MARKET_WIDE') overlap('QUARANTINED_ON_MARKET_WIDE_PROVIDER_ABSENT_MIC_DATE');
        if (lc.gapClass === 'MIXED_MISSING_GAP') overlap('SESSION_IN_MIXED_CAUSE_GAP');
        if (s.identity?.status === 'BLOCKED' && cause === 'PROVIDER_NO_DATA') overlap('PROVIDER_NO_DATA_ON_CATALOG_IDENTITY_BLOCKED_SECURITY');
      } else if (auditCutoff && d > auditCutoff) { cause = 'PROVIDER_NO_DATA'; consistency.refreshMissingSessionsRecomputed++; }
      else { cause = 'UNEXPLAINED'; consistency.recomputedDatesWithoutLedger++; }
      causes[cause]++; causeTotals[cause]++; if (de) causeTotalsDE[cause]++;
      perDate.push([d, cause]);
      const k = d; if (!dateMap.has(k)) dateMap.set(k, { date: d, securities: 0, mics: {}, causes: {} });
      const e = dateMap.get(k); e.securities++; e.mics[l.mic] = (e.mics[l.mic] || 0) + 1; e.causes[cause] = (e.causes[cause] || 0) + 1;
    }
    // Visible interior gaps = maximal runs of consecutive missing calendar sessions between two observations.
    const idx = new Map(all.map((d, i) => [d, i])), gaps = [];
    for (let i = 1; i < points.length; i++) { const n = idx.get(points[i][0]) - idx.get(points[i - 1][0]) - 1; if (n > 0) gaps.push({ from: points[i - 1][0], to: points[i][0], sessions: n }); }
    gaps.forEach(g => gapLengths.push(g.sessions));
    const severe = []; for (let i = 1; i < points.length; i++) { const r = points[i][1] / points[i - 1][1]; if (r >= CONTINUITY.severeCloseRatio || r <= 1 / CONTINUITY.severeCloseRatio) severe.push(points[i][0]); }
    const idIntervals = (inv?.priceOrIdentityBreaks || []).filter(b => b.classification === 'IDENTITY_QUARANTINE_INTERVAL');
    // Published MAX status reproduced with the product's continuity status rule.
    const maxMissing = interior.length, maxExpected = win0.filter(d => d <= last).length;
    const maxStatus = severe.length || points.length < CONTINUITY.minimumSafeObservations ? 'BROKEN' : gaps.some(g => g.sessions > CONTINUITY.maximumSmallGapSessions) || maxMissing / maxExpected > CONTINUITY.maximumMinorMissingRatio ? 'MAJOR_GAPS' : maxMissing || idIntervals.length ? 'MINOR_GAPS' : 'CLEAN';
    if (maxWin && maxWin.visualQualityStatus !== maxStatus) consistency.publishedMaxStatusMismatch++;
    // Periods: product range length (core/chart-history.js) and gates (core/europe-discover-eligibility.js).
    const ranges = {};
    for (const r of RANGES) {
      const slice = Ranges.sliceRange(points, r), cutoff = Ranges.days[r] === null ? first : new Date(Date.parse(last) - Ranges.days[r] * DAY).toISOString().slice(0, 10);
      const from = cutoff > first ? cutoff : first, win = win0.filter(d => d >= from), missing = win.filter(d => !have.has(d));
      const winGaps = gaps.filter(g => g.to > from), major = winGaps.some(g => g.sessions > CONTINUITY.maximumSmallGapSessions);
      const breaks = severe.filter(d => d >= from).length + idIntervals.filter(b => b.to > from).length;
      const gate = Eligibility.chart(s, l, now, r).ready, shown = gate && Ranges.available(points, r);
      const clean = missing.length === 0 && breaks === 0, ready = !major && breaks === 0 && tail.length === 0 && missing.length / win.length <= CONTINUITY.readyMissingRatio;
      ranges[r] = { shown, gateReady: gate, available: Ranges.available(points, r), from, windowSessions: win.length, missingSessions: missing.length, gaps: winGaps.length, continuousValid: shown && clean, chartReadyWindow: shown && ready };
      for (const bucket of de ? ['all', 'DE'] : ['all']) {
        const b = perRange[r][bucket]; b.securities++; b.shown += shown; b.affected += missing.length > 0; b.affectedShown += shown && missing.length > 0;
        b.continuousValid += shown && clean; b.chartReadyWindow += shown && ready; b.missingSessions += missing.length;
      }
      if (r === '1Y' && oneYear?.has(s.securityId) && JSON.stringify(oneYear.get(s.securityId).points) !== JSON.stringify(slice.points)) consistency.oneYearFileMismatch++;
    }
    rows.push({ securityId: s.securityId, symbol: l.providerSymbol, mic: l.mic, germany: de, catalogIdentity: s.identity?.status || null, publication: publication.status || null,
      first, last, expectedLast, observations: points.length, expectedSessions: win0.length, gaps: gaps.length, missingInterior: interior.length, missingTail: tail.length,
      longestGap: gaps.reduce((m, g) => Math.max(m, g.sessions), 0), displaySegmentBreaks: Math.max(0, (maxWin?.segmentStartDates?.length || 1) - 1), severeBreaks: severe.length,
      identityIntervals: idIntervals.length, causes, ranges });
  }
  const affected = rows.filter(r => r.missingInterior + r.missingTail > 0), withGap = rows.filter(r => r.gaps > 0);
  const byMic = {};
  for (const r of rows) { const m = byMic[r.mic] ||= { securities: 0, withGap: 0, missingSessions: 0, gaps: 0 }; m.securities++; m.withGap += r.gaps > 0 || r.missingTail > 0; m.missingSessions += r.missingInterior + r.missingTail; m.gaps += r.gaps; }
  const sharedDays = [...dateMap.values()].sort((a, b) => b.securities - a.securities || a.date.localeCompare(b.date)).slice(0, 25)
    .map(e => ({ date: e.date, securities: e.securities, mics: Object.fromEntries(Object.entries(e.mics).sort()), causes: Object.fromEntries(Object.entries(e.causes).sort()) }));
  const recheck = [...clusters.values()].filter(c => c.calendarRecheck), wide = [...clusters.values()].filter(c => c.classification === 'MARKET_WIDE');
  const report = {
    schema: REPORT_VERSION, evaluatedAt: now, providerRequests: 0, pricesIncluded: false, sources,
    rules: { germany: GERMANY_RULE, ranges: { definition: 'core/chart-history.js days (1Y 366, 3Y 1096, 5Y 1827 calendar days back from the last observation; MAX = whole display window)', shown: 'core/europe-discover-eligibility.js chart(..., range).ready AND core/chart-history.js available() (>= 95 % span, >= 5 points)', continuousValid: 'shown AND 0 missing rule-calendar sessions AND 0 severe/identity breaks in the window (visualQualityStatus CLEAN, scripts/discover/europe-chart-continuity.mjs)', chartReadyWindow: 'shown AND no gap > 5 sessions AND no break AND no stale tail AND missing ratio <= 2 % (CHART_READY rule)' }, calendar: 'audited exact-MIC calendar (europe_449_calendar_audit.json, exchange_calendars 4.13.2) inside 2010-01-04..2026-10-30, core/europe-exchange-calendar.js ' + Calendar.VERSION + ' after it', visibleGap: 'maximal run of consecutive missing rule-calendar sessions between two displayed observations; the stale tail after the last observation is counted separately', clusters: CLUSTER_POLICY, officialOpen: OFFICIAL_OPEN },
    universe: { securities: rows.length, germany: rows.filter(r => r.germany).length, byMic: Object.fromEntries(Object.entries(byMic).sort()) },
    q1: { withAnyMissingSession: affected.length, withAnyMissingSessionGermany: affected.filter(r => r.germany).length, withInteriorGap: withGap.length, withInteriorGapGermany: withGap.filter(r => r.germany).length, withStaleTail: rows.filter(r => r.missingTail > 0).map(r => r.symbol) },
    q2: perRange,
    q3: { gapLengthSessions: dist(gapLengths), gapsPerSecurity: dist(rows.map(r => r.gaps)), missingSessionsPerSecurity: dist(rows.map(r => r.missingInterior + r.missingTail)),
      gapsPerSecurityGermany: dist(rows.filter(r => r.germany).map(r => r.gaps)), displaySegmentBreaks: dist(rows.map(r => r.displaySegmentBreaks)),
      top20: rows.slice().sort((a, b) => (b.missingInterior + b.missingTail) - (a.missingInterior + a.missingTail) || a.securityId.localeCompare(b.securityId)).slice(0, 20)
        .map(r => ({ symbol: r.symbol, mic: r.mic, gaps: r.gaps, missing: r.missingInterior + r.missingTail, longestGap: r.longestGap, first: r.first, causes: Object.fromEntries(Object.entries(r.causes).filter(([, n]) => n)) })),
      sharedOutageDaysTop25: sharedDays },
    q4: { primaryCause: causeTotals, primaryCauseGermany: causeTotalsDE, total: Object.values(causeTotals).reduce((a, b) => a + b, 0), overlaps: Object.fromEntries(Object.entries(overlaps).sort()),
      clusters: { marketWideMicDates: wide.length, marketWideSessions: wide.reduce((n, c) => n + c.missing, 0), marketWideDistinctDates: new Set(wide.map(c => c.date)).size, calendarRecheckMicDates: recheck.length, calendarRecheckSessions: recheck.reduce((n, c) => n + c.missing, 0),
        marketWideDatesByMic: Object.fromEntries([...new Set(wide.map(c => c.mic))].sort().map(m => [m, wide.filter(c => c.mic === m).map(c => c.date + (c.calendarRecheck ? '*' : '')).sort()])) } },
    calendarDeviation: Object.fromEntries(Object.keys(byMic).sort().map(mic => { const d = cal.deviations(mic); return [mic, { ruleSessionAuditedClosed: d.ruleSessionAuditedClosed.length, ruleClosedAuditedSession: d.ruleClosedAuditedSession.length, examples: d.ruleSessionAuditedClosed.slice(-5) }]; })),
    q7: diagnostics ? billing(diagnostics) : null,
    consistency, rows
  };
  return report;
}

/** Observed credit billing from the public header summary of run 41661792038. */
export function billing(diag) {
  const reqs = diag.requests || [], byStatus = {}, multi = [];
  for (const r of reqs) {
    const h = r.rateAndCreditHeaders || {}, inc = Number(h['x-increment-usage']), symbols = String(r.params?.symbols || '').split(',').filter(Boolean).length;
    const b = byStatus[r.httpStatus] ||= { requests: 0, creditsBooked: 0, increments: {} };
    b.requests++; b.creditsBooked += inc; b.increments[inc] = (b.increments[inc] || 0) + 1;
    if (symbols > 1) multi.push({ seq: r.seq, endpoint: r.endpoint, symbols, increment: inc, httpStatus: r.httpStatus });
  }
  const first = Number(reqs[0]?.rateAndCreditHeaders?.['x-quota-remaining']), lastReq = reqs.at(-1), last = Number(lastReq?.rateAndCreditHeaders?.['x-quota-remaining']) - Number(lastReq?.rateAndCreditHeaders?.['x-increment-usage']);
  return { requests: reqs.length, httpStatusCounts: diag.httpStatusCounts, byStatus, multiSymbolRequests: multi, creditsBooked: Object.values(byStatus).reduce((n, b) => n + b.creditsBooked, 0),
    quotaRemainingBefore: first, quotaRemainingAfter: last, quotaLimit: Number(reqs[0]?.rateAndCreditHeaders?.['x-quota-limit']), rateLimitPerSecond: Number(reqs[0]?.rateAndCreditHeaders?.['x-ratelimit-limit-second']), headerNames: diag.observedRateAndCreditHeaderNames };
}

export function safeOut(out) {
  check(typeof out === 'string' && isAbsolute(out), 'ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED');
  const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const target = resolve(out), rel = relative(root, existsSync(target) ? realpathSync(target) : target);
  const inside = rel && !rel.startsWith('..') && !isAbsolute(rel);
  check(!inside || rel === 'docs/reports/europe-marketstack-support-report-20261103', 'OUTPUT_INSIDE_REPOSITORY_REFUSED');
  check(rel !== '', 'OUTPUT_INSIDE_REPOSITORY_REFUSED');
  return target;
}

export function run({ root, out, diagnosticsPath = null }) {
  const base = join(root, 'discover/data/europe'), sources = {};
  const readJson = (name, path) => { const b = readFileSync(path); sources[name] = sha(b); return JSON.parse(b); };
  const catalog = readJson('catalog', join(base, 'catalog.json')), manifest = readJson('manifest', join(base, 'manifest.json'));
  const inventory = readJson('gapInventory', join(root, 'docs/reports/europe-continuity-449-20261012/europe_449_gap_inventory.json'));
  const calendarAudit = readJson('calendarAudit', join(root, 'docs/reports/europe-continuity-449-20261012/europe_449_calendar_audit.json'));
  sources.integrityReadme = sha(readFileSync(join(root, 'docs/reports/europe-integrity-449-20261013/README.md')));
  for (const f of ['core/europe-exchange-calendar.js', 'core/chart-history.js', 'core/europe-discover-eligibility.js', 'scripts/discover/europe-chart-continuity.mjs']) sources[f] = sha(readFileSync(join(root, f)));
  const series = new Map(), seriesHashes = [];
  for (const s of catalog.securities) {
    const binding = manifest.history?.[s.securityId]?.MAX; check(binding, 'MANIFEST_MAX_BINDING_REQUIRED:' + s.securityId);
    const bytes = readFileSync(join(root, binding.url.slice(1))), h = sha(bytes);
    check(h === binding.sha256, 'SERIES_HASH_MISMATCH:' + s.securityId);
    series.set(s.securityId, JSON.parse(bytes)); seriesHashes.push(s.securityId + ':' + h);
  }
  sources.seriesLong = sha(seriesHashes.sort().join('\n'));
  const oneYear = new Map(), oneYearHashes = [];
  for (const s of catalog.securities) {
    const binding = manifest.series?.[s.securityId]; if (!binding) continue;
    const bytes = readFileSync(join(root, binding.url.slice(1))), h = sha(bytes);
    check(h === binding.sha256, 'SERIES_1Y_HASH_MISMATCH:' + s.securityId);
    oneYear.set(s.securityId, JSON.parse(bytes)); oneYearHashes.push(s.securityId + ':' + h);
  }
  sources.series1Y = sha(oneYearHashes.sort().join('\n'));
  const diagnostics = diagnosticsPath ? readJson('diagnosticsPublicSummary', diagnosticsPath) : null;
  const report = buildReport({ catalog, manifest, series, oneYear, inventory, calendarAudit, diagnostics, sources });
  const dir = safeOut(out); mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(report, null, 1) + '\n';
  writeFileSync(join(dir, 'europe_gap_impact_report.json'), text);
  return { report, sha256: sha(text) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.split(/=(.*)/s).slice(0, 2)));
  check(args['--out'], 'USAGE: --out=<absolute dir> [--diagnostics=<public summary json>] [--root=<repo>]');
  const root = args['--root'] ? resolve(args['--root']) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { report, sha256 } = run({ root, out: args['--out'], diagnosticsPath: args['--diagnostics'] || null });
  console.log(JSON.stringify({ sha256, q1: report.q1, q2: report.q2, q4: report.q4, consistency: report.consistency }, null, 1));
}
