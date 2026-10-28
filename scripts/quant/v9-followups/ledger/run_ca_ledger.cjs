#!/usr/bin/env node
'use strict';
// V9 follow-up (ledger): run the research ledger on REAL, SEC-sourced corporate
// actions that version 1.1.0 could not represent:
//   SPIN  IBM -> Kyndryl spin-off (weekly, 2021-07 .. 2022-01, plus a 2022 extension)
//   WBS   Webster -> 2.0548 Santander ADS + $48.75 cash (daily, 2026-07 .. 2026-10)
// "Before" runs use an older engine file (--old-engine) on the same inputs.
// Full inputs/results go to a private directory outside the repository; only a
// compact summary is written to --summary. Research only: no product path reads this.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const TS = require(path.join(ROOT, 'quant/engines/realtime/trading-session.js'));
const RS = require(path.join(ROOT, 'quant/engines/return-series.js'));
const CAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/market-calendar.json'), 'utf8'));
const EVIDENCE = 'docs/quant-recovery/v9-followups/ledger/ca-events.json';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const read = p => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8'));
const closeAt = d => d >= CAL.coverage.from ? TS.sessionFor(d, { calendar: CAL, exchange: 'XNYS' }).close : new Date(TS.localToUtc(d, '16:00', 'America/New_York')).toISOString();
function addWeekdays(d, n) {
  let t = Date.parse(d + 'T00:00:00Z'), k = Math.abs(n); const s = Math.sign(n), hol = new Set(CAL.exchanges.XNYS.holidays);
  while (k > 0) { t += s * 86400000; const x = new Date(t), iso = x.toISOString().slice(0, 10); if (x.getUTCDay() % 6 !== 0 && !hol.has(iso)) k--; }
  return new Date(t).toISOString().slice(0, 10);
}
// Same settlement rule as V9 (not a sourced ex-date): T+2 regime -> record-1bd, T+1 from 2024-05-28 -> record.
const ruleExDate = rec => addWeekdays(rec, rec >= '2024-05-28' ? 0 : rec >= '2017-09-07' ? -1 : -2);
const firstOnOrAfter = (dates, d) => dates.find(x => x >= d) || null;
const H = x => C.hash(x);

function membership(ids, dates, every, tag) {
  const mh = H({ ids, tag });
  const snaps = dates.filter((d, k) => k % every === 0).map(date => ({ effectiveAt: date + 'T00:00:00Z', availableAt: date + 'T00:00:00Z', sourceHash: H({ date, mh }), members: ids }));
  return { snaps, hashFor: d => snaps.filter(s => s.effectiveAt.slice(0, 10) <= d).at(-1).sourceHash };
}
function target(sessions, dates, m, decisionDate, weights) {
  const i = dates.indexOf(decisionDate);
  if (i < 0 || i + 1 >= dates.length) throw Error('NO_DECISION_SESSION ' + decisionDate);
  return { decisionDate, executionDate: dates[i + 1], availableAt: sessions[i].closeAt, membershipHash: m.hashFor(decisionDate), weights };
}
function input({ sessions, listings, memberships, targets, provenance, basis = 'TOTAL_RETURN', tag }) {
  // Engine requires a unique (effectiveDate, sequence) across all listings.
  const by = {};
  listings.flatMap(l => l.events).forEach(e => (by[e.effectiveDate] = by[e.effectiveDate] || []).push(e));
  Object.values(by).forEach(list => list.sort((a, b) => a.id.localeCompare(b.id)).forEach((e, i) => { e.sequence = i; }));
  return { sessions, initialCapital: 100000, currency: 'USD', returnBasis: basis, provenance, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 },
    maxMembershipAgeDays: 45, maxFactorAgeDays: 45, listings, memberships, factorSnapshots: [], targets,
    benchmark: { currency: 'USD', returnBasis: basis, sourceHash: H({ benchmark: 'ZERO_RATE_CASH_CONSTANT_LEVEL', tag }), costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: sessions.map(s => ({ date: s.date, level: 1 })) } };
}
const clone = x => JSON.parse(JSON.stringify(x));

// ---------- IBM -> KD spin-off (weekly) ----------
function spinStudy(ev, div, to) {
  const spin = ev.events.find(e => e.kind === 'SPINOFF');
  const ibm = read('quant/data/market/discover-series-long/ref_IBM.json'), kd = read('quant/data/market/discover-series-long/ref_KD.json');
  const period = ['2021-07-01', to];
  const dates = ibm.points.map(p => p[0]).filter(d => d >= period[0] && d <= period[1]);
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  const closeOf = new Map(sessions.map(s => [s.date, s.closeAt]));
  // Provider-adjusted IBM closes divide pre-ex closes by the provider's spin-off factor; undo it
  // with the one split-factor arithmetic (ADR-002) to recover raw closes, then model the spin-off explicitly.
  const prov = ibm.corporateActions.splits.filter(s => s[0] > dates[0] && s[0] <= dates.at(-1));
  if (prov.length !== 1 || prov[0][0] !== spin.exDate) throw Error('UNEXPECTED_PROVIDER_FACTORS ' + JSON.stringify(prov));
  const pts = ibm.points.filter(p => closeOf.has(p[0]));
  const bars = pts.map(p => ({ date: p[0], splitFactor: 1 }));
  bars[bars.findIndex(b => b.date >= prov[0][0])].splitFactor = prov[0][1];
  const f = RS.splitFactors(bars);
  const ibmRaw = pts.map((p, i) => ({ date: p[0], close: p[1] * f[i], availableAt: closeOf.get(p[0]) }));
  const ibmAdj = pts.map(p => ({ date: p[0], close: p[1], availableAt: closeOf.get(p[0]) }));
  const kdBars = kd.points.filter(p => closeOf.has(p[0]) && p[0] >= spin.distributedFirstRegularWayDate).map(p => ({ date: p[0], close: p[1], availableAt: closeOf.get(p[0]) }));
  if (kd.corporateActions.splits.length) throw Error('KD_SPLITS_PRESENT');
  const exSession = firstOnOrAfter(dates, spin.exDate);
  const ibmDivs = mode => div.companies.find(c => c.ticker === 'IBM').events.flatMap(e => {
    const ex = ruleExDate(e.recordDate);
    if (ex < dates[0] || ex > dates.at(-1)) return [];
    if (!e.payDate || !e.amount) throw Error('INCOMPLETE_DIVIDEND ' + e.recordDate);
    const base = { id: 'IBM:DIV:' + e.recordDate, type: 'CASH_DIVIDEND', effectiveDate: firstOnOrAfter(dates, ex), payDate: e.payDate, amount: Number(e.amount), currency: 'USD', sourceHash: e.firstSecAvailability.sha256, sequence: 0 };
    return [mode === 'LEGACY' ? { ...base, availableAt: e.firstSecAvailability.acceptanceUtc } : { ...base, informationAvailableAt: e.firstSecAvailability.acceptanceUtc }];
  });
  const spinEvent = infoKey => ({ id: 'IBM:SPINOFF:KD:' + spin.recordDate, type: 'SPINOFF', effectiveDate: exSession, distributedListingId: 'ref_KD', shareRatio: Number(spin.shareRatio),
    informationAvailableAt: spin.informationAvailableAt[infoKey], sourceHash: spin.sourceHash, sequence: 0 });
  const L = (id, bars, events, extra = {}) => ({ listingId: id, issuerId: 'ISSUER_' + id.slice(4), mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: bars[0].date, lastTradeDate: null, bars, events, ...extra });
  const m = membership(['ref_IBM'], dates, 4, 'SPIN'), mFull = membership(['ref_IBM', 'ref_KD'], dates, 4, 'SPIN');
  const every4 = dates.slice(0, -1).filter((d, k) => k % 4 === 0).map(d => target(sessions, dates, m, d, { ref_IBM: 0.9 }));
  const provenance = { mode: 'HISTORICAL_OBSERVED', datasetHash: H({ series: ['IBM', 'KD'].map(t => C.shaFile(path.join(ROOT, 'quant/data/market/discover-series-long/ref_' + t + '.json'))), evidence: C.shaFile(path.join(ROOT, EVIDENCE)) }),
    identityEvidence: C.shaFile(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json')), populationEvidence: H({ study: 'SPIN', universe: ['IBM'] }),
    corporateActionEvidence: H({ ca: C.shaFile(path.join(ROOT, EVIDENCE)), dividends: div.__sha }), lifecycleEvidence: H({ continuousWeeklyCoverage: ['IBM', 'KD from regular-way start'] }),
    licenseEvidence: H(ibm.publishBasis), historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 };
  const kdListing = L('ref_KD', kdBars, [], { firstTradeDate: spin.distributedFirstRegularWayDate });
  const runs = {
    SPIN_BEFORE_NO_SPINOFF_RAW: { engines: ['old', 'new'], input: input({ sessions, listings: [L('ref_IBM', ibmRaw, ibmDivs('LEGACY'))], memberships: m.snaps, targets: every4, provenance, tag: 'SPIN' }),
      note: 'what 1.1.0 can run: raw IBM, sourced dividends, spin-off omitted (KD value lost at ex-date)' },
    SPIN_PRICE_ADJUSTED: { engines: ['old', 'new'], input: input({ sessions, listings: [{ ...L('ref_IBM', ibmAdj, []) }], memberships: m.snaps, targets: every4,
      provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: provenance.datasetHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' }, basis: 'PRICE_RETURN', tag: 'SPIN' }),
      note: 'provider-adjusted IBM price return (spin-off value reinvested into IBM by the provider factor; no dividends)' },
    SPIN_TERMS: { engines: ['old', 'new'], primary: true, input: input({ sessions, listings: [L('ref_IBM', ibmRaw, [...ibmDivs('INFO'), spinEvent('TERMS')]), kdListing], memberships: m.snaps, targets: every4, provenance, tag: 'SPIN' }),
      note: 'SPINOFF 1 KD per 5 IBM at the first weekly session on/after the ex-date; informationAvailableAt = Form 10/A terms; KD sold at the next rebalance (target IBM 0.9)' },
    SPIN_COMPLETION: { engines: ['new'], input: input({ sessions, listings: [L('ref_IBM', ibmRaw, [...ibmDivs('INFO'), spinEvent('COMPLETION')]), kdListing], memberships: m.snaps, targets: every4, provenance, tag: 'SPIN' }),
      note: 'as SPIN_TERMS, information time = completion 8-K' },
    SPIN_GUARD_DECISION_BEFORE_COMPLETION: { engines: ['new'], expectError: 'DECISION_BEFORE_EVENT_INFORMATION', input: input({ sessions, listings: [L('ref_IBM', ibmRaw, [...ibmDivs('INFO'), spinEvent('COMPLETION')]), kdListing], memberships: mFull.snaps,
      targets: [target(sessions, dates, mFull, dates[0], { ref_IBM: 0.9 }), target(sessions, dates, mFull, dates[dates.indexOf(exSession) - 1], { ref_IBM: 0.45, ref_KD: 0.45 })], provenance, tag: 'SPIN' }),
      note: 'decision at the weekly close before the ex-session (executed at the ex-session) cannot use a spin-off first known from the completion 8-K' },
    SPIN_SAME_SCHEDULE_TERMS: { engines: ['new'], input: input({ sessions, listings: [L('ref_IBM', ibmRaw, [...ibmDivs('INFO'), spinEvent('TERMS')]), kdListing], memberships: mFull.snaps,
      targets: [target(sessions, dates, mFull, dates[0], { ref_IBM: 0.9 }), target(sessions, dates, mFull, dates[dates.indexOf(exSession) - 1], { ref_IBM: 0.45, ref_KD: 0.45 })], provenance, tag: 'SPIN' }),
      note: 'same schedule with information time = Form 10/A terms: accepted' },
    SPIN_DOUBLE_APPLICATION: { engines: ['new'], expectError: 'DUPLICATE_SPINOFF', input: input({ sessions, listings: [L('ref_IBM', ibmRaw, [...ibmDivs('INFO'), spinEvent('TERMS'), { ...spinEvent('COMPLETION'), id: 'IBM:SPINOFF:KD:dup' }]), kdListing], memberships: m.snaps, targets: every4, provenance, tag: 'SPIN' }),
      note: 'the same distribution entered twice (terms and completion source) is rejected' },
  };
  runs.SPIN_TERMS_OLD_ENGINE = { ...runs.SPIN_TERMS, engines: ['old'], primary: false, note: '1.1.0 on the SPIN_TERMS input' };
  runs.SPIN_TERMS.engines = ['new'];
  return { dates, sessions, runs, audit: { exSession, providerFactor: prov[0], kdFirstBar: kdBars[0], ibmRawAtPreEx: ibmRaw.find(b => b.date === dates[dates.indexOf(exSession) - 1]) } };
}

// ---------- WBS -> SAN ADS + cash (daily) ----------
function wbsStudy(ev) {
  const x = ev.events.find(e => e.kind === 'TERMINAL_EXCHANGE');
  const daily = t => read('quant/data/market/discover-series/ref_' + t + '.json');
  const period = ['2026-07-01', '2026-10-26'];
  const dates = daily('MSFT').points.map(p => p[0]).filter(d => d >= period[0] && d <= period[1]);
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  const closeOf = new Map(sessions.map(s => [s.date, s.closeAt]));
  for (const t of ['WBS', 'SAN']) if (read('quant/data/market/discover-series-long/ref_' + t + '.json').corporateActions.splits.some(s => s[0] > dates[0] && s[0] <= dates.at(-1))) throw Error('SPLIT_IN_WINDOW ' + t);
  const wbsPts = daily('WBS').points.filter(p => closeOf.has(p[0]) && p[0] <= x.lastTradeDate);
  const excluded = daily('WBS').points.filter(p => closeOf.has(p[0]) && p[0] > x.lastTradeDate);
  const sanPts = daily('SAN').points.filter(p => closeOf.has(p[0]));
  if (dates.some(d => d <= x.lastTradeDate && !wbsPts.find(p => p[0] === d)) || sanPts.length !== dates.length) throw Error('MISSING_BAR');
  const crossCheck = daily('SAN').points.find(p => p[0] === x.adsIdentityCrossCheck.statedDate);
  const bars = pts => pts.map(p => ({ date: p[0], close: p[1], availableAt: closeOf.get(p[0]) }));
  const ev0 = { id: 'WBS:TERMINAL_EXCHANGE:' + x.closingDate, type: 'TERMINAL_EXCHANGE', effectiveDate: x.firstSuccessorSession, successorListingId: 'ref_SAN', shareRatio: Number(x.shareRatio),
    amount: Number(x.cashPerShare), currency: 'USD', payDate: null, payDateState: 'NOT_STATED', informationAvailableAt: x.informationAvailableAt, sourceHash: x.sourceHash, sequence: 0 };
  const wbs = events => ({ listingId: 'ref_WBS', issuerId: 'ISSUER_WBS', mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: dates[0], lastTradeDate: x.lastTradeDate, bars: bars(wbsPts), events });
  const san = (cls = 'ADS', primary = false) => ({ listingId: 'ref_SAN', issuerId: 'ISSUER_SAN', mic: 'XNYS', instrumentClass: cls, primary, currency: 'USD', firstTradeDate: dates[0], lastTradeDate: null, bars: bars(sanPts), events: [] });
  const ids = ['ref_WBS', 'ref_SAN'], m = membership(ids, dates, 20, 'WBS');
  const t1 = target(sessions, dates, m, dates[0], { ref_WBS: 0.9 });
  const exit = target(sessions, dates, m, x.firstSuccessorSession, {});
  const early = target(sessions, dates, m, x.lastTradeDate, {});
  const provenance = { mode: 'HISTORICAL_OBSERVED', datasetHash: H({ series: ['MSFT', 'WBS', 'SAN'].map(t => C.shaFile(path.join(ROOT, 'quant/data/market/discover-series/ref_' + t + '.json'))), evidence: C.shaFile(path.join(ROOT, EVIDENCE)) }),
    identityEvidence: x.adsIdentitySourceHash, populationEvidence: H({ study: 'WBS', universe: ['WBS'] }), corporateActionEvidence: C.shaFile(path.join(ROOT, EVIDENCE)), lifecycleEvidence: x.sourceHash,
    licenseEvidence: H(daily('WBS').publishBasis), historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 };
  const conservative = { ...ev0, payDate: dates.at(-1) }; delete conservative.payDateState;
  const legacyConservative = { ...conservative, availableAt: x.informationAvailableAt }; delete legacyConservative.informationAvailableAt;
  const mk = (listings, targets) => input({ sessions, listings, memberships: m.snaps, targets, provenance, tag: 'WBS' });
  const runs = {
    WBS_NOT_STATED: { engines: ['new'], primary: true, input: mk([wbs([ev0]), san()], [t1, exit]), note: 'exchange into 2.0548 SAN ADS; $48.75 cash claim NOT_STATED (outside equity); SAN sold at the session after the exchange' },
    WBS_NOT_STATED_OLD_ENGINE: { engines: ['old'], input: mk([wbs([ev0]), san()], [t1, exit]), note: '1.1.0 on the WBS_NOT_STATED input' },
    WBS_CONSERVATIVE_LAST_SESSION: { engines: ['new'], input: mk([wbs([conservative]), san()], [t1, exit]), note: 'V9 convention: unsourced cash credit at the last session (claim inside equity, never investable in-window)' },
    WBS_V9_STYLE_MISLABELLED_OLD_ENGINE: { engines: ['old', 'new'], input: mk([wbs([legacyConservative]), san('COMMON_STOCK', true)], [t1, exit]), note: 'what 1.1.0 would need: SAN mislabelled as primary common stock; economically equal to WBS_CONSERVATIVE_LAST_SESSION' },
    WBS_GUARD_DECISION_BEFORE_INFORMATION: { engines: ['new'], expectError: 'DECISION_BEFORE_EVENT_INFORMATION', input: mk([wbs([ev0]), san()], [t1, early]), note: 'decision at the last WBS close, executed at the first SAN session: the completion 8-K was accepted only before the next open' },
    WBS_GUARD_ADS_TARGETED: { engines: ['new'], expectError: 'ADS_SUCCESSOR_ONLY', input: mk([wbs([ev0]), san()], [t1, { ...exit, weights: { ref_SAN: 0.5 } }]), note: 'an ADS may only arrive as terminal consideration, never be bought' },
    WBS_GUARD_ADS_WITHOUT_EXCHANGE: { engines: ['new'], expectError: 'ADS_SUCCESSOR_ONLY', input: mk([wbs([]), san()], [t1]), note: 'an ADS listing that is no terminal-exchange successor is rejected' },
  };
  return { dates, sessions, runs, audit: { lastTradeDate: x.lastTradeDate, excludedCarryForwardBars: excluded, adsIdentityCrossCheck: { stated: x.adsIdentityCrossCheck, seriesClose: crossCheck } } };
}

function summarize(r, ex) {
  if (!r) return { error: ex.code || ex.message, detail: ex.message };
  const s = { endCapital: r.endCapital, metrics: r.metrics, trades: r.trades.length, rebalances: r.rebalances.length, schemaVersion: r.schemaVersion, inputHash: r.inputHash, resultHash: r.resultHash,
    eventLedger: r.eventLedger.map(e => ({ date: e.date, eventId: e.eventId, type: e.type, entitlementUnits: e.entitlementUnits })), openReceivables: r.openReceivables.length, limitations: r.limitations };
  if (r.notStatedClaims) s.notStatedClaims = r.notStatedClaims;
  return s;
}

function main() {
  const out = arg('out') && path.resolve(arg('out'));
  if (!out || !path.relative(ROOT, out).startsWith('..')) throw Error('PRIVATE_OUTPUT_REQUIRED');
  const divPath = arg('v9-dividends');
  if (!divPath) throw Error('V9_DIVIDEND_EVIDENCE_REQUIRED (docs/quant-recovery/v9/portfolio/dividend-evidence.json from the V9 branch)');
  fs.mkdirSync(out, { recursive: true });
  const ev = read(EVIDENCE), div = read(divPath); div.__sha = C.shaFile(path.resolve(divPath));
  const engines = { new: P };
  if (arg('old-engine')) engines.old = require(path.resolve(arg('old-engine')));
  const studies = { SPIN: spinStudy(ev, div, '2022-01-31'), SPIN_2022: spinStudy(ev, div, '2022-12-31'), WBS: wbsStudy(ev) };
  // 2022 extension: only the runs that show how a late SEC information time interacts with decisions.
  studies.SPIN_2022.runs = { SPIN_2022_TERMS: { ...studies.SPIN_2022.runs.SPIN_TERMS, engines: ['new'], primary: false, note: 'SPIN_TERMS extended to 2022-12: the 2022-02 dividend is first in SEC on 2022-02-22, after a scheduled decision' },
    SPIN_2022_TERMS_OLD_ENGINE: { ...studies.SPIN_2022.runs.SPIN_BEFORE_NO_SPINOFF_RAW, engines: ['old'], note: '1.1.0 with legacy availableAt dividends over the 2022 extension' } };
  const summary = { schemaVersion: 'v9-followup-ledger-ca-runs-1.0.0', evidenceSha256: C.shaFile(path.join(ROOT, EVIDENCE)), v9DividendEvidenceSha256: div.__sha,
    engineSha256: { new: C.shaFile(require.resolve(path.join(ROOT, 'quant/engines/research-portfolio.cjs'))), old: arg('old-engine') ? C.shaFile(path.resolve(arg('old-engine'))) : null },
    engineVersion: { new: P.VERSION, old: engines.old ? engines.old.VERSION : null }, runnerSha256: C.shaFile(__filename), runtime: C.runtime(), studies: {} };
  for (const [sk, st] of Object.entries(studies)) {
    const rows = {};
    for (const [name, run] of Object.entries(st.runs)) {
      for (const eng of run.engines) {
        if (!engines[eng]) continue;
        const key = name + (run.engines.length > 1 ? '@' + eng : '');
        const inp = clone(run.input);
        fs.writeFileSync(path.join(out, key + '-input.json'), JSON.stringify(inp));
        let r = null, err = null;
        try { r = engines[eng].runPortfolio(inp); fs.writeFileSync(path.join(out, key + '-result.json'), JSON.stringify(r)); } catch (e) { err = e; }
        rows[key] = { engine: eng, note: run.note, primary: !!run.primary, expectError: run.expectError || null, ...summarize(r, err) };
        if (run.expectError) rows[key].expectationMet = rows[key].error === run.expectError;
      }
    }
    summary.studies[sk] = { sessions: st.dates.length, period: [st.dates[0], st.dates.at(-1)], audit: st.audit, runs: rows };
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  if (arg('summary')) fs.writeFileSync(path.resolve(arg('summary')), JSON.stringify(summary, null, 1) + '\n');
  for (const [sk, st] of Object.entries(summary.studies)) for (const [k, v] of Object.entries(st.runs)) console.log(sk, k, v.error ? 'ERROR ' + v.error + (v.expectError ? ' expected=' + v.expectationMet : '') : v.endCapital);
}
main();
