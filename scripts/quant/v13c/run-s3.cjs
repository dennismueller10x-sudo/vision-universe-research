#!/usr/bin/env node
'use strict';
// V13c - S3' of study registration 3.0.0: V12 REQUAL P5a (unchanged code) with
//   step A: the unchanged V13 O6 replacement of bounded exits by QUALIFIED delisted chains, now from register 1.1.0, and
//   step B: the usable source-backed S&P 500 terminal values of spx-terminal-register-1.0.0 (28; First Data 2006 and all
//           unresolved rows excluded) for members that are still BOUNDED_EXIT*.
// P5A  = registered P5a span 2009-09-30..2026-06-30 (primary); EARLY = SPY periods 1995-12-31..2009-09-30 (secondary, descriptive,
// all NOT_QUALIFIED in SPXPOP: only the deltas are read). R3: stage V13 reproduces the committed V13 S3 result.
//   node scripts/quant/v13c/run-s3.cjs [--out docs/quant-recovery/v13c/s3-spx-3.0.0.json] [--private <dir>]
const fs = require('node:fs'), path = require('node:path');
const C = require('./lib.cjs'), W = C.W, D = C.D;
const L = require(W.ROOT + '/scripts/quant/v12/requal/lib.cjs');
const P5 = require(W.ROOT + '/scripts/quant/v12/requal/p5a-population.cjs');
const RS3 = require(W.ROOT + '/scripts/quant/v13/studies/run-s3.cjs');
const { readRegistration } = require(W.ROOT + '/scripts/quant/v12/requal/plan.cjs');

const SPX_REGISTER = 'docs/quant-recovery/v13b/hist/spx-terminal-register-1.0.0.json';
const SPX_REVIEW = 'docs/quant-recovery/v13b/hist/spx-terminal-review-1.0.0.json';
const EARLY_END = '2009-09-30';

/** Usable SPX terminal values (registration 3.0.0 S3prime_P5A): TERMINAL_* rows of register 1.0.0 minus First Data and review flags. */
function usableTerminalRows(reg, review) {
  const flagged = new Set(((review['register_1.0.0'] || {}).flagged || []).map(f => f.t0 + '|' + Number(f.cik)));
  const all = reg.rows.filter(r => /^TERMINAL_(CASH|STOCK|MIXED)$/.test(r.status));
  const excluded = all.filter(r => r.keyHash16 === C.FIRST_DATA_KEY || flagged.has(r.t0 + '|' + Number(r.cik)));
  const usable = all.filter(r => !excluded.includes(r));
  for (const r of usable) if (!(typeof r.return === 'number' && Number.isFinite(r.return))) throw Error('V13C_SPX_RETURN_MISSING:' + r.keyHash16);
  return { accepted: all.length, excluded: excluded.map(r => ({ t0: r.t0, keyHash16: r.keyHash16, name: r.name, cik: r.cik })), usable };
}

/** Step B wrapper (pure apart from the population it wraps): documented value for still-bounded members matched exactly once. */
function wrapTerminal(pop, rowsByT0, keyOf, log) {
  const cache = new Map();
  return { ...pop, members(t0) {
    if (cache.has(t0)) return cache.get(t0);
    const a = pop.members(t0), members = a.members.slice();
    for (const row of rowsByT0.get(t0) || []) {
      const hits = members.map((m, i) => [m, i]).filter(([m]) => String(keyOf(m.chainId)).slice(0, 16) === row.keyHash16 && Number(m.cik) === Number(row.cik) && Math.abs(m.weight - row.weight) <= 5e-9);
      if (hits.length !== 1) throw Error('V13C_SPX_MATCH:' + t0 + ':' + row.keyHash16 + ':' + hits.length);
      const [m, i] = hits[0];
      const entry = { t0, t1: a.t1, keyHash16: row.keyHash16, name: row.name, cik: row.cik, weight: m.weight, kind: row.status, priorStatus: m.status, fate: m.fate, fateClass: m.fateClass, before: m.ret, documented: row.return };
      if (m.status === 'V13_DELISTED_OBSERVED') { log.push({ ...entry, state: 'CONFLICT_SERIES_FIRST' }); continue; }
      if (!/^BOUNDED_EXIT/.test(m.status || '')) throw Error('V13C_SPX_NOT_BOUNDED:' + t0 + ':' + row.keyHash16 + ':' + m.status);
      members[i] = { ...m, status: 'V13C_SPX_TERMINAL_DOCUMENTED', group: 'v13c_documented', ret: { ZERO: row.return, LOWER: row.return, FATE: row.return, UPPER: row.return } };
      log.push({ ...entry, state: 'REPLACED' });
    }
    const r = { ...a, members }; cache.set(t0, r); return r;
  } };
}

/** lib.makePopulation#members verbatim, parametrised only by the population id(s) (EARLY periods; premium = unchanged V12 premium). */
function makePopulationFor(ids, premium, periodFilter) {
  const z = L.IP.createIndexPopulation({ optIn: true, allowUnqualified: true, boundedAs: 'ZERO' });
  const l = L.IP.createIndexPopulation({ optIn: true, allowUnqualified: true, boundedAs: 'LOWER' });
  const periods = ids.flatMap(id => z.periods(id).map(p => ({ ...p, populationId: id }))).filter(periodFilter).sort((a, b) => a.t0 < b.t0 ? -1 : 1);
  const idOf = new Map(periods.map(p => [p.t0, p.populationId])), cache = new Map();
  function members(t0) {
    if (cache.has(t0)) return cache.get(t0);
    const id = idOf.get(t0); if (!id) throw Error('V13C_EARLY_NO_PERIOD:' + t0);
    const a = z.members(id, t0), b = l.members(id, t0);
    const covered = a.members.filter(m => m.group !== 'bounded'), popRet = L.mean(covered.map(m => m.observedOrEstimatedReturn));
    const out = a.members.map((m, i) => {
      const mb = b.members[i];
      if (mb.chainId !== m.chainId) throw Error('SCENARIO_MEMBER_ORDER');
      let zero = m.return, lower = mb.return, fate = zero, upper = zero, fateClass = null;
      if (m.status === 'BOUNDED_AMBIGUOUS_CA') { zero = (m.lower + m.upper) / 2; fate = zero; upper = m.upper; fateClass = 'AMBIGUOUS_CA'; }
      else if (m.status === 'BOUNDED_EXIT_SERIES_DELISTED') { fateClass = L.FATE_CLASS[m.fate] || 'UNKNOWN'; fate = fateClass === 'DELISTING' ? -1 : m.return; upper = m.upper; }
      else if (m.group === 'bounded') {
        fateClass = L.FATE_CLASS[m.fate] || 'UNKNOWN';
        fate = fateClass === 'TAKEOVER' ? premium.median : fateClass === 'DELISTING' ? -1 : fateClass === 'INDEX_CHANGE' ? popRet : 0;
        upper = Math.max(premium.p75, popRet);
      }
      if (![zero, lower, fate, upper].every(L.finite)) throw Error('SCENARIO_RETURN_MISSING:' + t0 + ':' + m.chainId);
      return { chainId: m.chainId, name: m.name, cik: m.cik, securityId: m.securityId, weight: m.weight, status: m.status, group: m.group, fate: m.fate, fateClass, ret: { ZERO: zero, LOWER: lower, FATE: fate, UPPER: upper } };
    });
    const r = { t0, t1: a.t1, qualification: a.qualification, members: out };
    cache.set(t0, r); return r;
  }
  return { periods, members, premium };
}

// V13 run-s3.cjs#summary (not exported there; identical copy, checked by R3).
function summary(agg) {
  if (!agg) return null;
  const pick = ['EW_ALL', 'CW_ALL', 'EW_WITH_H', 'EW_WITHOUT_H', 'SPY', 'SPY_TR', 'EW_FRAME'];
  return { periods: agg.periods, years: agg.years, from: agg.from, to: agg.to, cagr: Object.fromEntries(pick.map(k => [k, agg.cagr[k]])),
    terms: Object.fromEntries(['survivorshipInIndex', 'equalWeightInIndex', 'frameMinusSpy'].map(k => [k, agg.terms[k] && { cagrDiffPp: agg.terms[k].cagrDiffPp, meanPeriodPp: agg.terms[k].meanPeriodPp, nwP: agg.terms[k].nwP }])) };
}
const aggsP5A = rows => Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, { full: summary(P5.aggregate(rows, sc)), from2013_03_rule101: summary(P5.aggregate(rows, sc, r => r.t0 >= P5.SPAN_101)) }]));
const noTest = s => s && { ...s, terms: Object.fromEntries(Object.entries(s.terms).map(([k, v]) => [k, v && { cagrDiffPp: v.cagrDiffPp, meanPeriodPp: v.meanPeriodPp }])) };
const aggsEarly = rows => Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, noTest(summary(P5.aggregate(rows, sc)))]));
const byCikOf = docs => { const m = new Map(); for (const [id, d] of docs) { const k = String(Number(d.listingLifecycle.cik)); if (!m.has(k)) m.set(k, []); m.get(k).push({ id, dates: d.points.map(p => p[0]), closes: d.points.map(p => p[1]), listingStart: d.listingStart, lifecycle: d.listingLifecycle }); } return m; };
const r4 = C.r4;
const repRow = (x, logsByJ) => ({ t0: x.t0, cik: x.cik, chainId: x.chainId, priorStatus: x.status, fateClass: x.fateClass, weight: r4(x.weight), kind: x.kind, terminalClass: x.terminalClass, matchingChains: x.chains,
  beforeZero: r4(x.before.ZERO), beforeLower: r4(x.before.LOWER), beforeFate: r4(x.before.FATE), afterS0: r4(x.r), afterS1: r4(logsByJ[1].find(y => y.t0 === x.t0 && y.chainId === x.chainId).r), afterS2: r4(logsByJ[2].find(y => y.t0 === x.t0 && y.chainId === x.chainId).r) });
const termRow = x => ({ t0: x.t0, name: x.name, cik: x.cik, keyHash16: x.keyHash16, kind: x.kind, priorStatus: x.priorStatus, fate: x.fate, fateClass: x.fateClass, weight: r4(x.weight), state: x.state,
  beforeZero: r4(x.before.ZERO), beforeLower: r4(x.before.LOWER), beforeFate: r4(x.before.FATE), beforeUpper: r4(x.before.UPPER), documented: r4(x.documented) });

/** Runs the three stages (base, +A, +B) for one population; returns rows per stage and terminal scenario j plus the logs. */
function stages(ctx, pop, spy, dist, byCik110, rowsByT0, keyOf) {
  const base = P5.computePeriods(ctx, pop, spy, dist), A = [], B = [], logA = [], logB = [];
  for (let j = 0; j < 3; j++) {
    const la = [], lb = [], la2 = [];
    A.push(P5.computePeriods(ctx, RS3.wrapPopulation(pop, byCik110, j, la), spy, dist));
    B.push(P5.computePeriods(ctx, wrapTerminal(RS3.wrapPopulation(pop, byCik110, j, la2), rowsByT0, keyOf, lb), spy, dist));
    if (JSON.stringify(la) !== JSON.stringify(la2)) throw Error('V13C_STAGE_A_NOT_DETERMINISTIC');
    logA.push(la); logB.push(lb);
  }
  return { base, A, B, logA, logB };
}
const countBy = (xs, f) => xs.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});

function main() {
  const o = W.args(process.argv.slice(2), { out: path.join(W.ROOT, C.OUT_DIR, 's3-spx-3.0.0.json'), private: null, series: C.SERIES_100, series110: C.SERIES_110 });
  const data = C.dataState(); if (!data.quantDataEqualsSnapshot) throw Error('V13C_DATA_NOT_SNAPSHOT (amendment 3.0.1 D1)');
  const t0 = Date.now(), regSha = C.registrationSha(), amSha = C.amendmentSha(), reg12 = readRegistration();
  const spxReg = JSON.parse(fs.readFileSync(path.join(W.ROOT, SPX_REGISTER), 'utf8')), review = JSON.parse(fs.readFileSync(path.join(W.ROOT, SPX_REVIEW), 'utf8'));
  if (W.shaFile(SPX_REGISTER) !== '0dba611a573cbc635b497691475bae79ff8e9778915e53fc3e2d34194f0b8727' || W.shaFile(SPX_REVIEW) !== '531c97c7f7fca2333c8072158139b54e6300b3ee522a7680bcb162083b556baa') throw Error('V13C_SPX_INPUT_HASH');
  const term = usableTerminalRows(spxReg, review);
  if (term.usable.length !== 28) throw Error('V13C_SPX_USABLE_COUNT:' + term.usable.length);
  const rowsByT0 = new Map(); for (const r of term.usable) { if (!rowsByT0.has(r.t0)) rowsByT0.set(r.t0, []); rowsByT0.get(r.t0).push(r); }
  const ctx = P5.frameContext(), pop = L.makePopulation(), spy = L.makeSpy(), dist = L.spyDistributions();
  const zc = L.IP.createIndexPopulation({ optIn: true, allowUnqualified: true }), keyOf = idx => zc.chain(idx).keyHash;
  const dl100 = D.loadDelisted(W.ROOT, { dir: o.series, include: 'QUALIFIED' }), dl110 = C.loadDelisted110('QUALIFIED', o.series, o.series110);
  const byCik100 = byCikOf(dl100.docs), byCik110 = byCikOf(dl110.docs);
  // ---------- R3: V13 stage reproduces the committed V13 S3 result ----------
  const committed = JSON.parse(fs.readFileSync(path.join(W.ROOT, 'docs/quant-recovery/v13/studies/s3-spx-exits-1.0.0.json'), 'utf8'));
  const v13 = [], log13 = [];
  for (let j = 0; j < 3; j++) { const lg = []; v13.push(P5.computePeriods(ctx, RS3.wrapPopulation(pop, byCik100, j, lg), spy, dist)); log13.push(lg); }
  // ---------- P5A stages ----------
  const S = stages(ctx, pop, spy, dist, byCik110, rowsByT0, keyOf);
  const rep13 = log13[0].filter(x => x.state === 'REPLACED').map(x => repRow(x, log13));
  const r3 = { beforeAggregatesIdentical: JSON.stringify(aggsP5A(S.base)) === JSON.stringify(committed.aggregates.before),
    afterAggregatesIdentical: [0, 1, 2].map(j => JSON.stringify(aggsP5A(v13[j])) === JSON.stringify(committed.aggregates['afterTerminalS' + j])),
    replacedRowsIdentical: JSON.stringify(rep13) === JSON.stringify(committed.replacedRows), replacedV13: rep13.length };
  r3.pass = r3.beforeAggregatesIdentical && r3.afterAggregatesIdentical.every(Boolean) && r3.replacedRowsIdentical;
  if (!r3.pass) throw Error('V13C_R3_FAILED:' + JSON.stringify(r3));
  // ---------- EARLY stages ----------
  const early = makePopulationFor(['PIT_SP500_EARLY', 'PIT_SP500'], pop.premium, p => p.t1 <= EARLY_END);
  const check = makePopulationFor(['PIT_SP500'], pop.premium, p => p.t0 >= L.SPAN[0] && p.t1 <= L.SPAN[1]);
  const earlyLogicIdentical = check.periods.length === pop.periods.length && check.periods.every(p => JSON.stringify(check.members(p.t0)) === JSON.stringify(pop.members(p.t0)));
  if (!earlyLogicIdentical) throw Error('V13C_EARLY_MEMBER_LOGIC_DIFFERS');
  const E = stages(ctx, early, spy, dist, byCik110, rowsByT0, keyOf);
  // every usable value used exactly once (P5A or EARLY), replaced or conflict
  const usedKeys = [...S.logB[0], ...E.logB[0]].map(x => x.t0 + '|' + x.keyHash16).sort(), wantKeys = term.usable.map(r => r.t0 + '|' + r.keyHash16).sort();
  if (JSON.stringify(usedKeys) !== JSON.stringify(wantKeys)) throw Error('V13C_SPX_NOT_ALL_USED:' + usedKeys.length);
  const repA = S.logA[0].filter(x => x.state === 'REPLACED'), newSet = new Set(C.newQualifiedChains());
  const repAE = E.logA[0].filter(x => x.state === 'REPLACED');
  const stageAggs = (st, f) => ({ base: f(st.base), ...Object.fromEntries([0, 1, 2].flatMap(j => [['A_S' + j, f(st.A[j])], ['B_S' + j, f(st.B[j])]])) });
  const pick = (s, sc, k) => s[sc].full ? s[sc].full.cagr[k] : s[sc].cagr[k];
  const deltas = (agg, v13agg) => Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, Object.fromEntries(['EW_ALL', 'CW_ALL', 'EW_WITH_H'].map(k => {
    const b = v13agg ? pick(v13agg, sc, k) : pick(agg.base, sc, k), a = pick(agg.A_S0, sc, k), z = pick(agg.B_S0, sc, k);
    return [k, { reference: b, afterA: a, afterB: z, deltaA_pp: W.r6((a - b) * 100), deltaB_pp: W.r6((z - a) * 100), deltaTotal_pp: W.r6((z - b) * 100) }];
  }).concat([['survivorshipTermCagrDiffPp', (() => { const tt = s => (s[sc].full || s[sc]).terms.survivorshipInIndex.cagrDiffPp; const b = v13agg ? tt(v13agg) : tt(agg.base); return { reference: b, afterA: tt(agg.A_S0), afterB: tt(agg.B_S0), deltaTotal_pp: W.r6(tt(agg.B_S0) - b) }; })()]]))]));
  const p5aAggs = stageAggs(S, aggsP5A), earlyAggs = stageAggs(E, aggsEarly);
  const periodTable = st => st.base.map((r, i) => ({ t0: r.t0, t1: r.t1, qualification: r.qualification,
    errorPp: (early.periods.find(p => p.t0 === r.t0) || {}).errorPp ?? null, tolerancePp: (early.periods.find(p => p.t0 === r.t0) || {}).tolerancePp ?? null,
    boundedWeight: { base: r.counts.boundedWeight, A: st.A[0][i].counts.boundedWeight, B: st.B[0][i].counts.boundedWeight }, boundedMembers: { base: r.counts.boundedMembers, A: st.A[0][i].counts.boundedMembers, B: st.B[0][i].counts.boundedMembers },
    EW_ALL: Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, { base: r.series[sc].EW_ALL, A: st.A[0][i].series[sc].EW_ALL, B: st.B[0][i].series[sc].EW_ALL }])),
    CW_ALL: Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, { base: r.series[sc].CW_ALL, A: st.A[0][i].series[sc].CW_ALL, B: st.B[0][i].series[sc].CW_ALL }])),
    survivorshipTermPp: Object.fromEntries(L.SCENARIOS_P5A.map(sc => [sc, { base: W.r6((r.series[sc].EW_WITH_H - r.series[sc].EW_ALL) * 100), B: W.r6((st.B[0][i].series[sc].EW_WITH_H - st.B[0][i].series[sc].EW_ALL) * 100) }])),
    SPY: r.series.ZERO.SPY }));
  const out = { studyId: 'V13C-S3PRIME-SPX', registrationSha256: regSha, amendmentSha256: amSha, data, evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', evidenceLabel: 'NON_CONFIRMATORY_EXTENSION_STUDY', confirmatory: false, certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    basedOn: { v12: 'V12-REQUAL-P5A 1.1.0 (p5a-population.cjs unchanged)', v12RegistrationSha256: reg12.sha256, v13: 'docs/quant-recovery/v13/studies/s3-spx-exits-1.0.0.json (cited, unchanged)', r3 },
    inputs: { spxTerminalRegister: { file: SPX_REGISTER, sha256: W.shaFile(SPX_REGISTER) }, spxTerminalReview: { file: SPX_REVIEW, sha256: W.shaFile(SPX_REVIEW) }, delistedRegister100: dl100.registerHash, delistedRegister110: dl110.registerHash,
      delistedLoaded: { register100: dl100.counts.loaded, register110: dl110.counts.loaded }, populationDataSha256: pop.dataSha256 },
    terminalValues: { acceptedInRegister100: term.accepted, excluded: term.excluded, usable: term.usable.length, inP5ASpan: S.logB[0].length, inEarly: E.logB[0].length,
      states: { P5A: countBy(S.logB[0], x => x.state), EARLY: countBy(E.logB[0], x => x.state) },
      matching: 'same t0, population chain keyHash (16 hex) = keyHash16, same CIK, |weight - register weight| <= 5e-9, member BOUNDED_EXIT*; exactly one member (fail closed otherwise); series replacement (step A) first' },
    returnBasis: 'PRICE_RETURN both sides as V12/V13; documented terminal value = (cash + ratio x acquirer price at t1) / p0 - 1 (spx-terminal-rules 1.0.0), used in all four P5a scenarios; SPY_TR reference as V12',
    costs: 'none (index population returns, as V12 P5a)', weighting: { EW_ALL: 'equal weight of all index members', CW_ALL: 'holdings weight (SPY) of all index members' },
    P5A: { span: L.SPAN, periods: S.base.length, label: 'PRIMARY (registered P5a span)',
      stepA: { states: countBy(S.logA[0], x => x.state), replaced: repA.length, replacedByNewChains: repA.filter(x => newSet.has(x.chainId)).length, replacedRows: repA.map(x => repRow(x, S.logA)) },
      stepB: { replacedRows: S.logB[0].map(termRow) },
      aggregates: p5aAggs, v13Aggregates: { afterTerminalS0: committed.aggregates.afterTerminalS0, afterTerminalS1: committed.aggregates.afterTerminalS1, afterTerminalS2: committed.aggregates.afterTerminalS2 },
      decompositionVsV13_S0: deltas(p5aAggs, committed.aggregates.afterTerminalS0) },
    EARLY: { span: [early.periods[0].t0, EARLY_END], periods: early.periods.length, label: 'SECONDARY DESCRIPTIVE - all periods NOT_QUALIFIED in SPXPOP; levels not interpreted, only the deltas', memberLogicIdenticalOnP5A: earlyLogicIdentical,
      qualification: countBy(early.periods, p => p.qualification), takeoverPremium: { median: W.r6(pop.premium.median), p75: W.r6(pop.premium.p75), source: 'unchanged V12 premium (P5a span)' },
      stepA: { states: countBy(E.logA[0], x => x.state), replaced: repAE.length, replacedRows: repAE.map(x => repRow(x, E.logA)) },
      stepB: { replacedRows: E.logB[0].map(termRow) },
      aggregates: earlyAggs, decompositionVsBase_S0: deltas(earlyAggs, null), periodTable: periodTable(E) },
    scenarios: { P5a: P5.SCENARIO_LABELS, terminal: { S0: 'delisted series replacement at the last traded close', S1: 'MERGER -10 %, DISTRESS/UNKNOWN -30 % (series ended before t1)', S2: 'MERGER +10 %, DISTRESS/UNKNOWN -100 %' }, stages: { base: 'V12 bounds only', A: '+ register-1.1.0 delisted chains (V13 O6 rule)', B: '+ documented SPX terminal values' } },
    scope: 'Index population (S&P 500 members by SPY holdings). P5A tests only descriptive (V12 NW p of the period terms, no Holm); EARLY no test. Not a strategy, no alpha claim, no certification.', runtimeSeconds: null };
  out.runtimeSeconds = Math.round((Date.now() - t0) / 1000);
  const h = W.writeJson(o.out, out);
  if (o.private) fs.writeFileSync(path.join(W.K.privateDir(o.private), 's3-logs-v13c.json'), JSON.stringify({ A: S.logA, B: S.logB, EA: E.logA, EB: E.logB }));
  console.log(JSON.stringify({ out: path.relative(W.ROOT, o.out), sha256: h, r3, terminal: out.terminalValues.states, p5aStepA: out.P5A.stepA.states, earlyStepA: out.EARLY.stepA.states, seconds: out.runtimeSeconds }));
}
if (require.main === module) main();
module.exports = { usableTerminalRows, wrapTerminal, makePopulationFor, summary };
