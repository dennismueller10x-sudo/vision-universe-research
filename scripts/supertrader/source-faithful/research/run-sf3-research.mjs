#!/usr/bin/env node
/**
 * Supertrader 3.0 research runner: measures the new research components on the frozen research snapshot with
 * research-v1 conventions. DIAGNOSTIC_NOT_CERTIFIED. Nothing here is a strategy return or a release:
 *  - TURTLE      reference runs without groups (must equal the CURRENT_ENGINE reference counts) and every pre-registered
 *                correlation variant (research/turtle-correlation.mjs) as a before / after: rejections by LIMIT6 / 10,
 *                unknown-group coverage, risk concentration of the actual book;
 *  - WEINSTEIN   PIT SIC group indices per pre-registered variant: membership coverage, group-chart availability, label
 *                distribution per year; Investor / Trader screen candidates (every 4th week) with the group evidence;
 *  - MINERVINI   month-end screen statistics: SEPA classification, Power Play classes, RS-proxy and PIT-fundamentals
 *                coverage; forward price change after a classification only in the sealed file (SCREEN_STATISTIC);
 *  - CONTEXT     industry-leadership coverage, research-universe breadth summary.
 * Code under test is not changed: methods/*, runner/run-research.mjs (AG-3 code fingerprint) stay as they are.
 * Public output: counts, coverage shares, hashes. Sealed output (owner key): everything incl. metrics.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf3-research.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--parts turtle,weinstein,minervini,context] [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { runTurtle } from '../methods/turtle.mjs';
import { investorScreen, traderScreen, benchmarkWeekly, weeklyBars } from '../methods/weinstein.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { computeDiagnosticMetrics } from '../runner/metrics.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { REFERENCE_RUNS } from '../completion/facts.mjs';
import { FOUNDATION } from '../contract.mjs';
import { makeWeinsteinGroupMembership, cikCandidatesFromSegments } from '../adapters/industry-groups.mjs';
import { CORRELATION_VARIANTS, createCorrelationGroupProvider, concentrationReport, TURTLE_CORR_RESEARCH_VERSION } from './turtle-correlation.mjs';
import { GROUP_VARIANTS, buildGroupStrength, maRelation, withIndustryEvidence, INDUSTRY_STRENGTH_VERSION } from './industry-strength.mjs';
import { buildMarketBreadth } from './market-breadth.mjs';
import { createRsPercentileProxy, sepaClassify, powerPlayClassify, MINERVINI_COMPONENTS_VERSION } from './minervini-components.mjs';
import { industryLeadership } from './context-evidence.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF3_RUNNER_VERSION = 'sf3-research-runner-1.0.0';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';
const RESEARCH_FILES = ['turtle-correlation.mjs', 'industry-strength.mjs', 'market-breadth.mjs', 'minervini-components.mjs', 'context-evidence.mjs', 'run-sf3-research.mjs'];
export function researchCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of RESEARCH_FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const year = (d) => d.slice(0, 4);
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/** Attaches the frozen sec-pit r12 records (cik, how, eps, rev) to the dataset securities by listing id. */
export function attachSecPit(dataset, secPit) {
  let withFund = 0;
  for (const s of dataset.securities) { const f = secPit[s.id.split('#')[0]]; if (f) { s.fund = { eps: f.eps || [], rev: f.rev || [] }; withFund++; } }
  return { securities: dataset.securities.length, withFund };
}

// ---------------------------------------------------------------- TURTLE
export function turtlePart(dataset, { from = L.WINDOW.from, to = L.WINDOW.to, variants = CORRELATION_VARIANTS, log = () => {} } = {}) {
  const opts = (system) => ({ system, from, to, initialCapital: 100000, scenario: 'S0_LAST_PRICE', slippageBps: 10, commissionBps: 1 });
  const pub = { version: TURTLE_CORR_RESEARCH_VERSION, reference: {}, variants: {} }, sealed = { reference: {}, variants: {} };
  const ref = {};
  for (const system of ['S1', 'S2']) {
    const r = runTurtle(dataset, opts(system)); ref[system] = r;
    const m = computeDiagnosticMetrics({ curve: r.curve, trades: r.positionTrades, ledger: r.ledger, costs: r.counts.costs, spyTR: dataset.spyTR, splitPeriods: [], initialCapital: 100000 });
    const want = REFERENCE_RUNS.find((x) => x.method === `SF_TURTLE_${system}` && x.role === 'CURRENT_ENGINE');
    pub.reference[system] = { trades: m.trades, entries: r.counts.entries, reconciliation: r.reconciliation.pass, correlationLimits: r.correlationLimits, ledgerSha256: sha(r.ledger), referenceTradesBaseS0: want?.trades?.BASE_S0 ?? null, referenceEntriesBaseS0: want?.entries?.BASE_S0 ?? null, equalsCurrentEngineReference: want ? want.trades.BASE_S0 === m.trades && (want.entries?.BASE_S0 ?? r.counts.entries) === r.counts.entries : null };
    sealed.reference[system] = { metrics: m };
    log(`turtle reference ${system}: trades ${r.positionTrades.length}`);
  }
  for (const v of variants) {
    for (const policy of v.role === 'BASELINE_FOR_COMPARISON' ? ['REPORT_ONLY', 'POOLED_UNKNOWN'] : ['REPORT_ONLY']) {
      const p = createCorrelationGroupProvider(dataset, v, { unknownPolicy: policy });
      const key = `${v.id}|${policy}`; pub.variants[key] = { variant: v.id, policy, systems: {} }; sealed.variants[key] = { systems: {} };
      for (const system of ['S1', 'S2']) {
        const r = runTurtle(dataset, { ...opts(system), groupsOf: p.groupsOf });
        if (!r.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${key}:${system}`);
        const conc = concentrationReport(r, p, { calendar: dataset.calendar, from, to });
        const concRef = concentrationReport(ref[system], p, { calendar: dataset.calendar, from, to });
        pub.variants[key].systems[system] = {
          trades: r.positionTrades.length, entries: r.counts.entries, adds: r.counts.adds, rejectCorrelationLimit6: r.counts.rejectCorrelationLimit6, rejectCorrelationLimit10: r.counts.rejectCorrelationLimit10, correlationGroupMissing: r.counts.correlationGroupMissing,
          engineLabel: r.correlationLimits, reconciliation: r.reconciliation.pass, ledgerSha256: sha(r.ledger),
          concentrationWithLimits: conc, concentrationOfReferenceBook: concRef, conformance: p.conformance(r),
        };
        sealed.variants[key].systems[system] = { metrics: computeDiagnosticMetrics({ curve: r.curve, trades: r.positionTrades, ledger: r.ledger, costs: r.counts.costs, spyTR: dataset.spyTR, splitPeriods: [], initialCapital: 100000 }) };
      }
      const st = p.anchorStats(), med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
      pub.variants[key].anchors = { computed: st.length, medianPopulation: med(st.map((s) => s.population)), medianCloselyLargest: med(st.map((s) => s.closely.largest)), maxCloselyLargest: Math.max(0, ...st.map((s) => s.closely.largest)), medianLooselyLargest: med(st.map((s) => s.loosely.largest)), maxLooselyLargest: Math.max(0, ...st.map((s) => s.loosely.largest)), medianShareInClosedGroups: med(st.map((s) => s.closely.shareInMultiMemberGroups)), medianMeanPairCorrelation: med(st.map((s) => s.pairs?.meanCorrelation)), largestByYear: Object.fromEntries(Object.entries(st.reduce((a, s) => { (a[year(s.anchor)] ||= []).push(s.closely.largest); return a; }, {})).map(([y, xs]) => [y, Math.max(...xs)])) };
      pub.variants[key].diagnostics = p.diagnostics();
      log(`turtle ${key}: S1 rej6 ${pub.variants[key].systems.S1.rejectCorrelationLimit6}, S2 rej6 ${pub.variants[key].systems.S2.rejectCorrelationLimit6}`);
    }
  }
  return { pub, sealed };
}

// ---------------------------------------------------------------- WEINSTEIN
export function weinsteinPart(dataset, { classification, cikCandidates, bench, breadth, log = () => {}, weekStride = 4 } = {}) {
  const pub = { version: INDUSTRY_STRENGTH_VERSION, variants: {} };
  const benchW = benchmarkWeekly(bench);
  // screen candidates every `weekStride` completed weeks (the screens do not depend on the group variant)
  const candidates = [];
  for (const s of dataset.securities) {
    const nWeeks = weeklyBars(s.bars).length - 1; // the last week may be incomplete
    for (let w = 31; w < nWeeks; w += weekStride) for (const [kind, fn] of [['investor', investorScreen], ['trader', traderScreen]]) for (const rec of fn(s, { bench: benchW, week: w })) candidates.push({ kind, rec });
  }
  log(`weinstein: ${candidates.length} sampled screen candidates`);
  for (const v of GROUP_VARIANTS) {
    if (v.weighting === 'CAP') { pub.variants[v.id] = { status: 'DATA_BLOCKED', reason: 'NO_PIT_SHARES_OUTSTANDING_IN_SNAPSHOT' }; continue; }
    const membership = makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: v.ref, level: v.level, maxAgeDays: v.maxAgeDays, acceptedIdentityEvidence: v.acceptedIdentityEvidence } });
    const built = buildGroupStrength(dataset, membership, { minMembers: v.minMembers });
    const labels = {}, groupsPerYear = {};
    for (const g of built.groups.values()) {
      for (let w = 0; w < g.weeks.length; w++) if (Number.isFinite(g.weeks[w].close)) { const e = maRelation(g.weeks, w); const y = g.weeks[w].date.slice(0, 4); (labels[y] ||= {}); bump(labels[y], e.label ?? e.status); }
      for (const w of g.weeks) if (Number.isFinite(w.close)) { (groupsPerYear[w.date.slice(0, 4)] ||= new Set()).add(g.key); }
    }
    const cand = { investor: 0, trader: 0, byGroupStatus: {}, byLabel: {} };
    for (const { kind, rec } of candidates) { cand[kind]++; const e = withIndustryEvidence(rec, { built, bench: benchW, breadth, variant: v }).machineScreenEvidence.find((x) => x.ruleId === 'WEIN-SF-GROUP').value; bump(cand.byGroupStatus, e.status); bump(cand.byLabel, e.maRelation?.label ?? e.status); }
    pub.variants[v.id] = { variant: v, coverage: { ...built.coverage, membershipResolvedShare: built.coverage.lookups ? 1 - built.coverage.unknownMembership / built.coverage.lookups : null, validGroupSessionShare: built.coverage.validGroupSessions / Math.max(1, built.coverage.validGroupSessions + built.coverage.tooFewSessions) }, membershipDiagnostics: membership.diagnostics(), groupsWithChartByYear: Object.fromEntries(Object.entries(groupsPerYear).map(([y, s]) => [y, s.size])), groupLabelsByYear: labels, screenCandidatesSampled: { weekStride, ...cand } };
    log(`weinstein ${v.id}: membership ${pub.variants[v.id].coverage.membershipResolvedShare?.toFixed(3)}, candidates ${cand.investor}/${cand.trader}`);
  }
  return { pub };
}

// ---------------------------------------------------------------- MINERVINI
export function minerviniPart(dataset, { log = () => {}, forward = 63 } = {}) {
  const rs = createRsPercentileProxy(dataset);
  const monthEnds = new Set(dataset.calendar.filter((d, i, a) => i === a.length - 1 || a[i + 1].slice(0, 7) !== d.slice(0, 7)));
  const sepa = {}, pp = {}, cov = { sepaPass: 0, rsProxyKnown: 0, fundamentalsEvidence: 0, fundamentalsAccel: 0 }, fwd = { sepa: [], pp: {} };
  for (const s of dataset.securities) for (let i = 0; i < s.bars.length; i++) {
    const d = s.bars[i].date; if (!monthEnds.has(d)) continue;
    const y = year(d);
    const c = sepaClassify(s, i, { rsProxy: rs }); (sepa[y] ||= {}); bump(sepa[y], c.classification);
    if (c.classification === 'MECHANICAL_SCREEN_PASS') {
      cov.sepaPass++; if (Number.isFinite(c.components.relativeStrength.value?.proxy?.vuPercentile)) cov.rsProxyKnown++;
      const f = c.components.fundamentals.value; if (f.status === 'EVIDENCE_ONLY') { cov.fundamentalsEvidence++; if (f.eps.accelerating) cov.fundamentalsAccel++; }
      if (i + forward < s.bars.length) fwd.sepa.push(s.bars[i + forward].close / s.bars[i].close - 1);
    }
    const p = powerPlayClassify(s, i); (pp[y] ||= {}); bump(pp[y], p.classification);
    if (p.classification !== 'NOT_QUALIFIED' && i + forward < s.bars.length) (fwd.pp[p.classification] ||= []).push(s.bars[i + forward].close / s.bars[i].close - 1);
  }
  const dist = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, p25: s[Math.floor(s.length / 4)] ?? null, p50: s[Math.floor(s.length / 2)] ?? null, p75: s[Math.floor((3 * s.length) / 4)] ?? null }; };
  log(`minervini: sepa pass ${cov.sepaPass}`);
  return {
    pub: { version: MINERVINI_COMPONENTS_VERSION, label: 'SCREEN_STATISTICS_NOT_A_STRATEGY', sampling: 'month-end sessions', sepaByYear: sepa, powerPlayByYear: pp, coverage: { ...cov, rsProxyShare: cov.sepaPass ? cov.rsProxyKnown / cov.sepaPass : null, fundamentalsShare: cov.sepaPass ? cov.fundamentalsEvidence / cov.sepaPass : null } },
    sealed: { label: 'SCREEN_STATISTIC_FORWARD_PRICE_CHANGE_NOT_A_STRATEGY_RETURN', forwardSessions: forward, sepa: dist(fwd.sepa), powerPlay: Object.fromEntries(Object.entries(fwd.pp).map(([k, v]) => [k, dist(v)])) },
  };
}

// ---------------------------------------------------------------- CONTEXT
export function contextPart(dataset, { built, breadth }) {
  const quarterEnds = dataset.calendar.filter((d, i, a) => i < a.length - 1 && a[i + 1].slice(5, 7) !== d.slice(5, 7) && ['03', '06', '09', '12'].includes(d.slice(5, 7)));
  const lead = {};
  const has = new Map(dataset.securities.map((s) => [s.id, new Set(s.bars.map((b) => b.date))]));
  for (const d of quarterEnds) { const y = year(d); lead[y] ||= {}; for (const s of dataset.securities) if (has.get(s.id).has(d)) bump(lead[y], industryLeadership(built, s.id, d).status); }
  const byYear = {};
  for (const r of breadth.series) if (r.population) { const y = year(r.date); const o = (byYear[y] ||= { sessions: 0, meanPopulation: 0, meanNetAdvanceRatio: 0, minMomentum: null, maxMomentum: null }); o.sessions++; o.meanPopulation += r.population; o.meanNetAdvanceRatio += r.netAdvanceRatio; if (r.momentumIndexProxy !== null) { o.minMomentum = o.minMomentum === null ? r.momentumIndexProxy : Math.min(o.minMomentum, r.momentumIndexProxy); o.maxMomentum = o.maxMomentum === null ? r.momentumIndexProxy : Math.max(o.maxMomentum, r.momentumIndexProxy); } }
  for (const o of Object.values(byYear)) { o.meanPopulation /= o.sessions; o.meanNetAdvanceRatio /= o.sessions; }
  return { pub: { leadershipStatusByYear: lead, breadthByYear: byYear, breadthSha256: sha(breadth.series) } };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--limit', '0')), parts = new Set(arg('--parts', 'turtle,weinstein,minervini,context').split(','));
  const t0 = Date.now(), log = (m) => console.log(`[sf3 +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: await LIVE_IO.createDriver(), smoke: argv.includes('--smoke-snapshot') }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged && !argv.includes('--allow-code-version-change')) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes, smokeStore: argv.includes('--smoke-snapshot') };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + SEC_PIT_KEY);
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; sec-pit r12 listings ${Object.keys(secPit).length}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const dataset = datasetFromPit(pit);
  const fundCoverage = attachSecPit(dataset, secPit);
  log(`dataset: ${dataset.securities.length} securities, ${dataset.calendar.length} sessions, sec-pit ${fundCoverage.withFund}`);
  const receipt = { schema: 'supertrader-sf3-research-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), researchCodeSha256: researchCodeSha256(), runner: SF3_RUNNER_VERSION, limit: LIMIT || null, ...verification, computedSegmentsSha256: sha(dataset.securities.map((s) => s.id).join('\n')), runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const pub = { schema: 'supertrader-sf3-research-public-1.0.0', receipt, fundCoverage }, sealed = { receipt };
  const breadth = buildMarketBreadth(dataset);
  if (parts.has('turtle')) { const r = turtlePart(dataset, { log }); pub.turtle = r.pub; sealed.turtle = r.sealed; }
  let built = null;
  if (parts.has('weinstein') || parts.has('context')) {
    const { loadSicHistory } = await import('../../../core/load-sic-history.mjs');
    const cikCandidates = cikCandidatesFromSegments(pit.segs, Object.fromEntries(Object.entries(secPit).map(([k, v]) => [k, { cik: v.cik, how: v.how }])));
    const ciks = new Set([...cikCandidates.values()].flat().map((c) => c.cik));
    const classification = loadSicHistory({ ciks });
    log(`sic history: ${ciks.size} ciks`);
    if (parts.has('weinstein')) { const r = weinsteinPart(dataset, { classification, cikCandidates, bench: dataset.benchmark, breadth, log }); pub.weinstein = r.pub; }
    const v0 = GROUP_VARIANTS.find((v) => v.role === 'BASELINE_FOR_COMPARISON');
    built = buildGroupStrength(dataset, makeWeinsteinGroupMembership({ classification, cikCandidates, decision: { ref: v0.ref, level: v0.level, maxAgeDays: v0.maxAgeDays, acceptedIdentityEvidence: v0.acceptedIdentityEvidence } }), { minMembers: v0.minMembers });
  }
  if (parts.has('minervini')) { const r = minerviniPart(dataset, { log }); pub.minervini = r.pub; sealed.minervini = r.sealed; }
  if (parts.has('context') && built) pub.context = contextPart(dataset, { built, breadth }).pub;
  sealed.public = pub;
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf3-research${LIMIT || verification.smokeStore ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
