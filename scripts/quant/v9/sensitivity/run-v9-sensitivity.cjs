#!/usr/bin/env node
'use strict';
// V9 workstream C (sensitivity). Registered dependence diagnostics and broadened-population
// sensitivity grid for NEW_52W_HIGH. Offline, reuses existing engines; no product data writes,
// no parameter winner, no certification. Stages:
//   reproduce-v8 <private>  exact replay of the V8 sensitivity generation (V8 plan reused)
//   register     <private>  qualification, frame, deterministic sample, source manifest, plan
//   run          <private>  events, grid inference, dependence diagnostics, decision
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const C = require(ROOT + '/quant/engines/research-contract.cjs'), A = require(ROOT + '/quant/engines/weekly-real-adapter.cjs');
const S = require(ROOT + '/quant/engines/research-studies.cjs'), V = require(ROOT + '/quant/engines/research-validation.cjs'), B = require(ROOT + '/quant/engines/weekly-benchmark.cjs');
const D = require('./dependence.cjs');
const OUT_DOCS = path.join(ROOT, 'docs/quant-recovery/v9/sensitivity');
const REG_FILE = path.join(OUT_DOCS, 'registration-1.0.0.json'), MANIFEST_FILE = path.join(OUT_DOCS, 'source-manifest-1.0.0.json.gz');
const SERIES_DIR = 'quant/data/market/discover-series-long';
const TRIO = ['ref_JPM', 'ref_MSFT', 'ref_NVDA'];
const MIC = { NASDAQ: 'XNAS', NYSE: 'XNYS', AMEX: 'XASE', 'NYSE MKT': 'XASE' };
const DIMENSIONS = { horizonBars: [4, 13, 26], entryDelayBars: [1, 2], feeBps: [0, 10], slippageBps: [0, 5, 20] };
const BASELINE = { horizonBars: 13, entryDelayBars: 1, feeBps: 10, slippageBps: 5 };
const WINDOW = ['2000-01-01', '2025-12-31'];
const INFERENCE = { blockLength: 52, minimumBlockLength: 28, replicates: 1999, seed: 1729, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' };
const SAMPLE = { seedString: 'V9-SENSITIVITY-SAMPLE-1.0.0|seed=20261027', size: 1000 };
const SE_CURVE_BLOCKS = [1, 2, 4, 8, 13, 26, 39, 52, 78, 104, 156, 208];
const PLATEAU_BLOCKS = [39, 52, 78, 104];
const FIXED_BANDWIDTHS = [26, 52, 104];
const ACF_LAGS = 104;

function privateDir(directory) {
  if (!directory) throw Error('PRIVATE_OUTPUT_REQUIRED');
  const out = path.resolve(directory); fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const real = fs.realpathSync(out); if (real === ROOT || real.startsWith(ROOT + path.sep)) throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  return out;
}
const gitHead = () => cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const weekOf = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); };
function codeHashes() {
  const files = ['scripts/quant/v9/sensitivity/run-v9-sensitivity.cjs', 'scripts/quant/v9/sensitivity/dependence.cjs', 'quant/engines/research-validation.cjs', 'quant/engines/research-studies.cjs',
    'quant/engines/research-contract.cjs', 'quant/engines/weekly-real-adapter.cjs', 'quant/engines/weekly-benchmark.cjs', 'quant/engines/research-classification-evidence.cjs',
    'quant/engines/corporate-action-evidence.js', 'quant/engines/return-series.js', 'quant/engines/signal-backtest.js', 'quant/engines/pattern-research.js', 'quant/engines/setup-engine.js', 'quant/engines/profile-backtest.js'];
  return Object.fromEntries(files.map(f => [f, C.shaFile(path.join(ROOT, f))]));
}

// ---------- Stage 1: exact V8 replay ----------
function reproduceV8(directory) {
  const out = privateDir(directory), dir = path.join(out, 'v8-replay'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const v8 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v8/sensitivity-summary.json'), 'utf8'));
  const v8Validation = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v8/sensitivity-independent-validation.json'), 'utf8'));
  const sourceChecks = Object.entries({ ...v8.sources, ...v8.dependencies }).map(([f, h]) => ({ path: f, v8: h, current: C.shaFile(path.join(ROOT, f)) })).map(x => ({ ...x, same: x.v8 === x.current }));
  // Reusing the V8 registered plan (its registeredAt) makes the replay hash-comparable.
  fs.writeFileSync(path.join(dir, 'sensitivity-plan.json'), JSON.stringify(v8.scope), { mode: 0o600 });
  cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts/quant/run-v8-sensitivity.cjs'), dir], { cwd: ROOT, stdio: 'inherit' });
  const now = JSON.parse(fs.readFileSync(path.join(dir, 'sensitivity-summary.json'), 'utf8'));
  let py = null;
  try { py = JSON.parse(cp.execFileSync('python3', [path.join(ROOT, 'scripts/quant/verify-v8-sensitivity.py'), dir, ROOT], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop()); } catch (e) { py = { state: 'FAIL', error: String(e.message).slice(0, 300) }; }
  const keys = ['planHash', 'registrationHash', 'inputHash', 'resultHash', 'nominalRejections', 'holmRejections'];
  const report = { schemaVersion: 'v9-sensitivity-v8-reproduction-1.0.0', gitHead: gitHead(), runtime: C.runtime(), v8Runtime: v8.runtime, v8GitHead: v8.gitHead,
    inputsChanged: sourceChecks.filter(x => !x.same).map(x => x.path), sourceAndCodeBindings: sourceChecks.length, allBindingsUnchanged: sourceChecks.every(x => x.same),
    hashComparison: Object.fromEntries(keys.map(k => [k, { v8: v8[k], replay: now[k], equal: v8[k] === now[k] }])),
    rowsIdentical: JSON.stringify(v8.rows) === JSON.stringify(now.rows), robustnessIdentical: JSON.stringify(v8.robustness) === JSON.stringify(now.robustness), coverageIdentical: JSON.stringify(v8.coverage) === JSON.stringify(now.coverage),
    v8PythonVerifierOnReplay: py ? { state: py.state, comparisons: py.comparisons, inputSha256: py.inputSha256, resultSha256: py.resultSha256, inputSha256EqualsV8: py.inputSha256 === v8Validation.inputSha256, resultSha256EqualsV8: py.resultSha256 === v8Validation.resultSha256 } : null,
    note: 'V8 numbers remain the historical record; replay used the V8 registered plan (registeredAt ' + v8.scope.registeredAt + ') in a private directory. Runtime differs (node/glibc) from V8; numerical results are byte-identical.',
    productionApproved: false };
  report.state = report.allBindingsUnchanged && keys.every(k => report.hashComparison[k].equal) && report.rowsIdentical && py?.state === 'PASS' ? 'EXACT_REPLAY' : 'DIFFERENT';
  fs.mkdirSync(OUT_DOCS, { recursive: true }); fs.writeFileSync(path.join(OUT_DOCS, 'v8-reproduction.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify({ state: report.state, inputsChanged: report.inputsChanged.length }));
}

// ---------- Population frame (deterministic, outcome-free) ----------
function buildFrame() {
  const loader = A.createLoader(ROOT), files = fs.readdirSync(path.join(ROOT, SERIES_DIR)).filter(f => /^ref_.*\.json$/.test(f)).sort();
  const reasons = {}, qualified = [], docs = new Map();
  for (const f of files) {
    const id = f.slice(0, -5);
    try { docs.set(id, loader(id)); qualified.push(id); reasons.QUALIFIED = (reasons.QUALIFIED || 0) + 1; }
    catch (e) { const r = String(e.message).split(':')[0]; reasons[r] = (reasons[r] || 0) + 1; }
  }
  // Modal date label per ISO week among all QUALIFIED listings (ties -> later date).
  const labels = new Map();
  for (const id of qualified) for (const [d] of docs.get(id).points) { const k = weekOf(d); if (!labels.has(k)) labels.set(k, new Map()); const m = labels.get(k); m.set(d, (m.get(d) || 0) + 1); }
  const modal = new Map([...labels].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0]]));
  const calendar = [...modal.values()].sort();
  const excluded = { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [] }, frame = [];
  for (const id of qualified) {
    const d = docs.get(id), exch = d.listingId.split(':')[1];
    if (d.points.some(([x]) => modal.get(weekOf(x)) !== x)) excluded.NON_MODAL_WEEK_LABEL.push(id);
    else if (!MIC[exch]) excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET.push(id);
    else frame.push(id);
  }
  const ranked = frame.map(id => ({ id, key: sha(SAMPLE.seedString + '|' + id) })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const p1 = ranked.slice(0, SAMPLE.size).map(x => x.id).sort(), p1Set = new Set(p1), p2 = frame.filter(id => !p1Set.has(id));
  return { loader, files, reasons, qualified, docs, calendar, excluded, frame, p1, p2 };
}
function sourceManifest(fr) {
  const extra = ['quant/data/market/security-master/us-security-master.json', 'quant/engines/research-classification-evidence.cjs', B.SOURCE, 'quant/data/market/multi-asset/instruments.json', 'quant/data/market/discover-series/ref_SPY.json'];
  const entries = fr.qualified.map(id => [SERIES_DIR + '/' + id + '.json', C.shaFile(path.join(ROOT, SERIES_DIR, id + '.json'))]).concat(extra.map(f => [f, C.shaFile(path.join(ROOT, f))]));
  return { schemaVersion: 'v9-sensitivity-source-manifest-1.0.0', qualified: fr.qualified, files: Object.fromEntries(entries) };
}

function registration(fr, manifestHash, registeredAt) {
  return {
    id: 'V9-SENSITIVITY-DEPENDENCE', version: '1.0.0', registeredAt, gitHeadAtRegistration: gitHead(), purpose: 'EXPLORATORY_ROBUSTNESS',
    question: 'Are the dependence assumptions behind the calendar-block bootstrap of the NEW_52W_HIGH sensitivity grid empirically supported (block length, LRV, stationarity diagnostics), on the V8 trio and on a broader pre-registered current-classification population?',
    priorExposure: 'V8 trio grid results (36 rows) were known before this registration. NEW_52W_HIGH has been studied on explored V7/V8 history. No outcome, event or return of populations P1/P2 was computed by this workstream before this registration (only qualification, week-label and exchange metadata). No untouched holdout exists; 2000-2025 is explored history.',
    rule: { ruleId: 'NEW_52W_HIGH', engine: 'research-studies.runSignalStudy (per listing, identical event definition to V8)', sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN' },
    grid: { dimensions: DIMENSIONS, baseline: BASELINE, points: 36 },
    window: { signalDates: WINDOW, inclusion: 'Completed events whose signal date lies on the study calendar within the window; outcomes may mature after 2025 up to the data asOf. Immature/censored/ineligible counts reported; no imputation.' },
    populations: {
      TRIO: { ids: TRIO, calendar: 'Union of trio weekly dates (balanced 2000-2025), exactly V8', note: 'Selected survivor trio; V8 replay input' },
      frameRule: 'createLoader QUALIFIED weekly listings at this commit (current classification = survivors), minus listings with any weekly date label differing from the modal label of its ISO week among QUALIFIED listings, minus current exchange outside {NASDAQ,NYSE,AMEX,NYSE MKT} (engine primary set XNAS/XNYS/XASE). Exclusions are not data repairs.',
      qualificationCounts: fr.reasons, qualifiedCount: fr.qualified.length,
      exclusions: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, { count: v.length, ids: v }])), frameCount: fr.frame.length,
      sampling: { method: 'Rank frame ids by sha256(seedString + "|" + securityId) ascending; P1 = first size ids; P2 = remaining frame', ...SAMPLE },
      P1: { role: 'PRIMARY_BROADENED', count: fr.p1.length, ids: fr.p1, idsHash: V.hash(fr.p1) },
      P2: { role: 'DECLARED_REPLICATION_SAME_HISTORY_NOT_INDEPENDENT', count: fr.p2.length, idsHash: V.hash(fr.p2) },
      calendar: { rule: 'Modal ISO-week labels among QUALIFIED listings, full history', length: fr.calendar.length, first: fr.calendar[0], last: fr.calendar.at(-1), hash: V.hash(fr.calendar) },
      unbalanced: 'Listings enter/leave the panel by their own history (no balancing); number of listings per date grows over time.',
      survivorship: 'Current QUALIFIED = active today with full weekly history; delisted/acquired/bankrupt companies are absent. Results are conditional on survival to 2026 and do not represent the historical market.'
    },
    sourceManifestHash: manifestHash,
    endpoints: {
      primary: 'POOLED_EVENT_MEAN_NET_PRICE_RETURN (V8 definition: value = (1+gross)*(1-side)/(1+side)-1, side=(fee+slippage)/1e4 per side)',
      secondary: 'POOLED_EVENT_MEAN_BENCHMARK_EXCESS = primary value - SPY price return between the same entry and exit dates (weekly-benchmark SPY, no costs on benchmark); events without both SPY dates excluded and counted'
    },
    inference: { ...INFERENCE, method: 'research-validation.inferTemporalBlockMean (circular calendar block, basic interval, centered two-sided p)', robustnessBlockLength: 104,
      adaptiveBlockLength: 'b_adapt = min(floor(T/3), max(52, ceil(max over 36 primary points of PW b_CB))); if b_adapt > 52 the full grid is re-run at b_adapt (registered robustness, Holm within grid)',
      multiplicity: 'Holm within the 36-point grid, separately per population x endpoint x block design; no cross-family correction; earlier V7/V8 searches not incorporated',
      effectiveN: 'Reported diagnostic: min(n, s^2 / SE_NW(52)^2), s^2 = sample variance of event values, SE_NW(52) = sqrt(T*LRV_Bartlett(z,52))/n' },
    diagnostics: {
      series: 'z_t = S_t - theta*N_t on the full study calendar incl. zero-event dates (linearised ratio); also N_t (event counts) descriptively',
      D1_acf: { lags: ACF_LAGS, ljungBoxLags: ['h-1 (if >=1)', 26, 52] },
      D2_overlap: 'Theoretical MA(h-1) window from overlapping h-week outcomes; max |rho| within/beyond overlap; share of lags h..104 outside +-1.96/sqrt(T); descriptive Ljung-Box on lags h..h+25',
      D3_lrv: { kernel: 'Bartlett 1-k/(bw+1)', bandwidths: ['newey_west_1994 floor(4(T/100)^(2/9))', 'schwert_l4', 'schwert_l12 floor(12(T/100)^(1/4))', 'andrews_ar1', ...FIXED_BANDWIDTHS], effectiveDates: 'T*gamma0/LRV' },
      D4_politisWhite: 'PW 2004 with PPW 2009 correction on z_t (c=2, K=max(5,ceil(sqrt(log10 T))), flat-top window, M=2*max(mhat,1) capped)',
      D5_seCurve: { method: 'CBB via engine inferTemporalBlockMean, seed 1729, 1999 reps', blocks: SE_CURVE_BLOCKS, nwBandwidths: SE_CURVE_BLOCKS },
      D6_methods: { blockLength: 52, kinds: ['CBB (engine)', 'SB Politis-Romano mean block 52 (integer-threshold geometric, circular)', 'MBB non-circular'], seed: 1729, replicates: 1999 },
      D7_kpss: { series: ['z', 'N'], bandwidths: ['schwert_l4', 'schwert_l12', 52], decisionBandwidth: 52, decisionBandwidthReason: 'Overlapping h<=26-week outcomes induce MA(h-1) dependence; Bartlett bandwidth below h under-estimates LRV and over-rejects. 52 = primary block length >= 2h.', critical05: 0.463 },
      D8_adf: { series: 'z', constant: true, lags: 'schwert_l12', critical05: -2.86, use: 'descriptive' },
      D9_split: { parts: 4, rule: 'equal calendar quarters; per-part theta, NW SE bw=min(52,floor(T_i/4)); inverse-variance Wald heterogeneity chi2(3)' },
      D10_cusum: { series: 'z', bandwidths: ['schwert_l12', 52], decisionBandwidth: 52, critical05: 1.358, limitation: 'Heteroskedastic z (growing cross-section) distorts KPSS/CUSUM asymptotics; reported, not corrected' }
    },
    decisionCriteria: {
      threshold: 'A criterion holds for a population if it holds for >= 33 of 36 grid points (primary endpoint). The 36 points share events and are not independent checks.',
      C1_PW: 'b=52 >= PW b_CB',
      C2_PLATEAU: 'max/min of CBB SE over b in {39,52,78,104} <= 1.25',
      C3_METHODS: '|SE_SB(52)/SE_CBB(52)-1| <= 0.20 and |SE_MBB(52)/SE_CBB(52)-1| <= 0.20',
      C4_LRV: '|SE_NW(bw=52)/SE_CBB(52)-1| <= 0.25',
      C5_STATIONARITY: 'KPSS(z, bw 52) and CUSUM(z, bw 52) both not rejected at 5%',
      C6_SPLIT: 'split-period Wald p > 0.01',
      populationStatus: 'BLOCK_DESIGN_SUPPORTED iff C1-C4; STATIONARITY_NOT_CONTRADICTED iff C5-C6',
      methodDecision: 'ACCEPTED_WITH_DEFINED_SCOPE iff P1 and P2 both satisfy C1-C6 (scope: conditional dependence-aware inference with empirically supported block length on the registered current-classification survivor populations, explored 2000-2025 history; trio included in scope only if it also satisfies C1-C6). Otherwise PARTIALLY_VALIDATED with the failing criteria named. Significance of grid points never enters the decision.',
      notProvable: ['Mixing/weak stationarity cannot be proven by finite-sample diagnostics; non-rejection is not proof.', 'Survivorship: current classification conditions on survival.', 'Explored history; no untouched holdout; P2 shares calendar shocks with P1 (not independent).']
    },
    productionApproved: false
  };
}
function register(directory) {
  const out = privateDir(directory), fr = buildFrame(), manifest = sourceManifest(fr), manifestHash = V.hash(manifest);
  fs.mkdirSync(OUT_DOCS, { recursive: true });
  let registeredAt = new Date().toISOString();
  if (fs.existsSync(REG_FILE)) {
    const prev = JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); registeredAt = prev.registration.registeredAt;
    const body = { ...registration(fr, manifestHash, registeredAt), gitHeadAtRegistration: prev.registration.gitHeadAtRegistration };
    if (V.hash(body) !== prev.registrationHash) throw Error('REGISTERED_PLAN_CHANGED_USE_NEW_VERSION');
    console.log(JSON.stringify({ state: 'REGISTRATION_UNCHANGED', registrationHash: prev.registrationHash })); return;
  }
  const body = registration(fr, manifestHash, registeredAt);
  const doc = { registration: body, registrationHash: V.hash(body), codeAtRegistration: codeHashes(), runtime: C.runtime() };
  fs.writeFileSync(MANIFEST_FILE, zlib.gzipSync(JSON.stringify(manifest), { level: 9 }));
  fs.writeFileSync(REG_FILE, JSON.stringify(doc, null, 1) + '\n'); fs.writeFileSync(path.join(out, 'registration-1.0.0.json'), JSON.stringify(doc));
  console.log(JSON.stringify({ registrationHash: doc.registrationHash, frame: fr.frame.length, p1: fr.p1.length, p2: fr.p2.length, manifestHash }));
}

// ---------- Stage 3: run ----------
function listingOf(d, id) {
  const exch = d.listingId.split(':')[1];
  return { listingId: d.listingId, issuerId: id, securityId: id, identity: { mic: MIC[exch], instrumentClass: 'COMMON_STOCK', primary: true, validFrom: d.listingStart, availableAt: d.masterGeneratedAt, sourceHash: d.identityHash }, bars: d.points.map(([date, close]) => ({ date, close })) };
}
function eventsFor(listings, calendar, benchmarkBars, regInfo, perListing) {
  const base = { asOf: calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: regInfo, ruleIds: ['NEW_52W_HIGH'], costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 }, expectedCalendar: calendar, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: benchmarkBars } };
  const out = {}, inWindow = d => d >= WINDOW[0] && d <= WINDOW[1];
  for (const horizonBars of DIMENSIONS.horizonBars) for (const entryDelayBars of DIMENSIONS.entryDelayBars) {
    const events = [];
    const groups = perListing ? listings.map(l => [l]) : [listings];
    for (const g of groups) for (const e of S.runSignalStudy({ ...base, listings: g, horizonBars, entryDelayBars }).events) if (inWindow(e.signalDate)) events.push(e);
    out[horizonBars + ':' + entryDelayBars] = events.map(e => ({ listingId: e.listingId, signalDate: e.signalDate, state: e.state, completed: e.completed, entryDate: e.entryDate, exitDate: e.exitDate, grossReturn: e.completed ? e.grossReturn : null, benchmarkReturn: e.completed ? e.benchmarkReturn : null }));
  }
  return out;
}
const valueOf = (e, p) => { const side = (p.feeBps + p.slippageBps) / 10000; return (1 + e.grossReturn) * (1 - side) / (1 + side) - 1; };
function rowsFor(events, p, endpoint) {
  const done = events.filter(e => e.completed), rows = [];
  done.forEach((e, i) => {
    if (endpoint === 'primary') rows.push({ id: e.listingId + ':' + e.signalDate + ':' + i, date: e.signalDate, value: valueOf(e, p) });
    else if (e.benchmarkReturn !== null) rows.push({ id: e.listingId + ':' + e.signalDate + ':' + i, date: e.signalDate, value: valueOf(e, p) - e.benchmarkReturn });
  });
  return rows;
}
function ratioSE(values) { return Math.sqrt(D.sampleVariance(values)) / Math.sqrt(values.length); }

function diagnosePoint(calendar, rows, h) {
  const agg = D.aggregate(calendar, rows), T = agg.T, n = agg.n, z = agg.z;
  const rho = D.acf(z, ACF_LAGS), seFromLrv = lrv => lrv > 0 ? Math.sqrt(T * lrv) / n : null;
  const lbLags = [...new Set([h - 1, 26, 52].filter(m => m >= 1))];
  const bw = { newey_west_1994: D.bandwidthRules.newey_west_1994(T), schwert_l4: D.bandwidthRules.schwert_l4(T), schwert_l12: D.bandwidthRules.schwert_l12(T), andrews_ar1: D.andrewsAr1Bandwidth(z).bandwidth };
  for (const b of FIXED_BANDWIDTHS) bw['fixed_' + b] = b;
  const g0 = D.autocovariances(z, 0)[0];
  const lrv = Object.fromEntries(Object.entries(bw).map(([k, b]) => { const v = D.bartlettLrv(z, b); return [k, { bandwidth: b, lrv: v, se: seFromLrv(v), effectiveDates: v > 0 ? T * g0 / v : null }]; }));
  const pw = D.politisWhite(z);
  const cbbCurve = SE_CURVE_BLOCKS.filter(b => b <= Math.floor(T / 2)).map(b => {
    const r = V.inferTemporalBlockMean({ calendar, ...INFERENCE, blockLength: b, minimumBlockLength: b }, rows);
    const s = D.summarizeBootstrap(r.bootstrap, r.estimate, INFERENCE.alpha);
    const nw = D.bartlettLrv(z, b);
    return { b, se: s.se, pValue: r.pValue, ci: r.ci, nwSe: seFromLrv(nw) };
  });
  const se = b => cbbCurve.find(x => x.b === b).se;
  const methods = {};
  for (const kind of ['CBB', 'SB', 'MBB']) { const v = D.blockBootstrap(kind, agg.sums, agg.counts, 52, INFERENCE.replicates, INFERENCE.seed); methods[kind] = D.summarizeBootstrap(v, agg.estimate, INFERENCE.alpha); }
  const values = rows.map(r => r.value), iidSe = ratioSE(values), nw52 = lrv.fixed_52.se;
  const plateauSes = PLATEAU_BLOCKS.map(se);
  const kpssZ = { l4: D.kpss(z, bw.schwert_l4), l12: D.kpss(z, bw.schwert_l12), bw52: D.kpss(z, 52) }, kpssN = { l4: D.kpss(agg.counts, bw.schwert_l4), l12: D.kpss(agg.counts, bw.schwert_l12), bw52: D.kpss(agg.counts, 52) };
  const cus = { l12: D.cusum(z, bw.schwert_l12), bw52: D.cusum(z, 52) }, adf = D.adf(z, bw.schwert_l12), split = D.splitPeriods(agg, 4, 52);
  const criteria = {
    C1_PW: pw.bCB !== null && 52 >= pw.bCB,
    C2_PLATEAU: Math.max(...plateauSes) / Math.min(...plateauSes) <= 1.25,
    C3_METHODS: Math.abs(methods.SB.se / se(52) - 1) <= 0.20 && Math.abs(methods.MBB.se / se(52) - 1) <= 0.20,
    C4_LRV: nw52 !== null && Math.abs(nw52 / se(52) - 1) <= 0.25,
    C5_STATIONARITY: !kpssZ.bw52.reject05 && !cus.bw52.reject05,
    C6_SPLIT: split.pValue !== null && split.pValue > 0.01
  };
  return {
    summary: { T, n, occupiedDates: agg.occupiedDates, estimate: agg.estimate, iidSe, effectiveN: nw52 ? Math.min(n, D.sampleVariance(values) / (nw52 * nw52)) : null,
      acf: rho.slice(1, 14), ljungBox: lbLags.map(m => D.ljungBox(rho, T, m)), overlap: D.overlapSummary(rho, h, T), lrv, politisWhite: pw, cbbCurve,
      plateau: { blocks: PLATEAU_BLOCKS, ses: plateauSes, maxOverMin: Math.max(...plateauSes) / Math.min(...plateauSes) },
      methods52: { CBB: methods.CBB, SB: methods.SB, MBB: methods.MBB, sbOverCbb: methods.SB.se / se(52), mbbOverCbb: methods.MBB.se / se(52), nwOverCbb: nw52 / se(52) },
      kpssZ, kpssCounts: kpssN, cusum: cus, adf, split, criteria },
    full: { acf: rho, sums: agg.sums, counts: agg.counts }
  };
}

function runGrid(calendar, events, endpoint, specBase, extraBlock) {
  const results = [], robust = [], adaptive = [];
  const evaluator = function (parameters) {
    const rows = rowsFor(events[parameters.horizonBars + ':' + parameters.entryDelayBars], parameters, endpoint);
    const config = { calendar, ...INFERENCE };
    const result = V.inferTemporalBlockMean(config, rows), long = V.inferTemporalBlockMean({ ...config, blockLength: 104 }, rows);
    const agg = D.aggregate(calendar, rows), lrv = D.bartlettLrv(agg.z, 52), nwSe = Math.sqrt(agg.T * lrv) / agg.n;
    const effectiveN = lrv > 0 ? Math.min(agg.n, D.sampleVariance(rows.map(r => r.value)) / (nwSe * nwSe)) : null;
    results.push({ parameters, result }); robust.push({ parameters, result: long });
    return { estimate: result.estimate, pValue: result.pValue, n: result.n, ci: result.ci, inferenceMethod: result.inferenceMethod, clusters: result.blockCountDiagnostic, effectiveN };
  };
  const datasetHash = V.hash({ calendar, events, endpoint }), ruleHash = C.shaFile(path.join(ROOT, 'quant/engines/signal-backtest.js'));
  const spec = { ...specBase, ruleHash, datasetHash, evaluatorHash: V.hash(evaluator.toString()) };
  const registered = V.registerSensitivity(spec);
  const result = V.runSensitivity(registered, evaluator, { datasetHash, evaluatorHash: spec.evaluatorHash, ruleHash, executedAt: new Date().toISOString(), holdout: false });
  const holmOf = list => { const adj = V.holm(list.map(x => x.result.pValue)); return list.map((x, i) => ({ parameters: x.parameters, estimate: x.result.estimate, pValue: x.result.pValue, ci: x.result.ci, adjustedPValue: adj[i], reject: adj[i] <= INFERENCE.alpha })); };
  let adaptiveRows = null;
  if (extraBlock && extraBlock > 52) {
    for (const x of results) { const rows = rowsFor(events[x.parameters.horizonBars + ':' + x.parameters.entryDelayBars], x.parameters, endpoint); adaptive.push({ parameters: x.parameters, result: V.inferTemporalBlockMean({ calendar, ...INFERENCE, blockLength: extraBlock, minimumBlockLength: INFERENCE.minimumBlockLength }, rows) }); }
    adaptiveRows = holmOf(adaptive);
  }
  return { registered, result, datasetHash, results, robust, adaptive, robustRows: holmOf(robust), adaptiveRows };
}

function run(directory) {
  const out = privateDir(directory), t0 = Date.now();
  const reg = JSON.parse(fs.readFileSync(REG_FILE, 'utf8'));
  if (V.hash(reg.registration) !== reg.registrationHash) throw Error('REGISTRATION_HASH_MISMATCH');
  const fr = buildFrame(), manifest = sourceManifest(fr);
  if (V.hash(manifest) !== reg.registration.sourceManifestHash) throw Error('SOURCE_MANIFEST_CHANGED_SINCE_REGISTRATION');
  if (V.hash(fr.p1) !== reg.registration.populations.P1.idsHash || V.hash(fr.p2) !== reg.registration.populations.P2.idsHash) throw Error('POPULATION_CHANGED');
  const benchmark = B.load(ROOT), regInfo = { id: reg.registration.id, version: reg.registration.version, frozenAt: reg.registration.registeredAt, analysisMode: 'EXPLORATORY', selection: 'V9 registered population' };
  // Trio exactly as V8 (balanced union calendar).
  const trioDocs = TRIO.map(id => fr.docs.get(id) || fr.loader(id)), trioListings = trioDocs.map((d, i) => listingOf(d, TRIO[i]));
  const trioCalendarFull = [...new Set(trioListings.flatMap(l => l.bars.map(b => b.date)))].sort();
  const benchFor = cal => { const s = new Set(cal); return [...benchmark.byDate].filter(([d]) => s.has(d)).map(([date, close]) => ({ date, close })); };
  const pops = {
    TRIO: { listings: trioListings, calendarFull: trioCalendarFull, perListing: false },
    P1: { listings: fr.p1.map(id => listingOf(fr.docs.get(id), id)), calendarFull: fr.calendar, perListing: true },
    P2: { listings: fr.p2.map(id => listingOf(fr.docs.get(id), id)), calendarFull: fr.calendar, perListing: true }
  };
  const summary = { schemaVersion: 'v9-sensitivity-run-1.0.0', gitHead: gitHead(), runtime: C.runtime(), code: codeHashes(), registrationHash: reg.registrationHash, sourceManifestHash: reg.registration.sourceManifestHash, benchmark: benchmark.provenance, populations: {} };
  const full = { registrationHash: reg.registrationHash, populations: {} };
  // V8 replay events (if present) must equal the V9 trio events (primary endpoint inputs).
  const v8Input = path.join(out, 'v8-replay', 'sensitivity-input.json');
  for (const [name, P] of Object.entries(pops)) {
    const t1 = Date.now(), studyCalendar = P.calendarFull.filter(d => d >= WINDOW[0] && d <= WINDOW[1]);
    const events = eventsFor(P.listings, P.calendarFull, benchFor(P.calendarFull), regInfo, P.perListing);
    let v8Match = null;
    if (name === 'TRIO' && fs.existsSync(v8Input)) {
      const v8 = JSON.parse(fs.readFileSync(v8Input, 'utf8')).events;
      v8Match = Object.keys(events).every(k => JSON.stringify(events[k].map(e => [e.listingId, e.signalDate, e.state, e.entryDate, e.exitDate, e.grossReturn])) === JSON.stringify(v8[k].map(e => [e.listingId, e.signalDate, e.state, e.entryDate, e.exitDate, e.completed ? e.grossReturn : null])));
      if (!v8Match) throw Error('TRIO_EVENTS_DIFFER_FROM_V8_REPLAY');
    }
    const coverage = Object.fromEntries(Object.entries(events).map(([k, ev]) => [k, { states: ev.reduce((a, e) => (a[e.state] = (a[e.state] || 0) + 1, a), {}), completed: ev.filter(e => e.completed).length, completedWithoutBenchmark: ev.filter(e => e.completed && e.benchmarkReturn === null).length, listingsWithCompletedEvents: new Set(ev.filter(e => e.completed).map(e => e.listingId)).size }]));
    const points = V.registerSensitivity({ id: 'tmp', ruleHash: 'x', datasetHash: 'x', evaluatorHash: 'x', primaryEndpoint: 'x', registeredAt: reg.registration.registeredAt, purpose: 'EXPLORATORY_ROBUSTNESS', dimensions: DIMENSIONS, baseline: BASELINE, alpha: 0.05 }).points;
    const popOut = { listings: P.listings.length, studyCalendar: { T: studyCalendar.length, first: studyCalendar[0], last: studyCalendar.at(-1), hash: V.hash(studyCalendar) }, v8EventMatch: v8Match, coverage, endpoints: {} };
    const popFull = { studyCalendar, events, endpoints: {} };
    for (const endpoint of ['primary', 'secondary']) {
      const diag = points.map(p => ({ parameters: p, ...diagnosePoint(studyCalendar, rowsFor(events[p.horizonBars + ':' + p.entryDelayBars], p, endpoint), p.horizonBars) }));
      const maxB = Math.max(...diag.map(d => d.summary.politisWhite.bCB || 0)), bAdapt = Math.min(Math.floor(studyCalendar.length / 3), Math.max(52, Math.ceil(maxB)));
      const specBase = { id: 'V9-SENSITIVITY-' + name + '-' + endpoint.toUpperCase(), registeredAt: reg.registration.registeredAt, purpose: 'EXPLORATORY_ROBUSTNESS', dimensions: DIMENSIONS, baseline: BASELINE, alpha: 0.05,
        primaryEndpoint: endpoint === 'primary' ? 'POOLED_EVENT_MEAN_NET_PRICE_RETURN' : 'POOLED_EVENT_MEAN_BENCHMARK_EXCESS_SPY', v9RegistrationHash: reg.registrationHash };
      const g = runGrid(studyCalendar, events, endpoint, specBase, bAdapt);
      const counts = Object.fromEntries(Object.keys(diag[0].summary.criteria).map(k => [k, diag.filter(d => d.summary.criteria[k]).length]));
      const holds = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v >= 33]));
      const rows = g.result.rows;
      popOut.endpoints[endpoint] = {
        grid: { registrationHash: g.registered.resultHash, resultHash: g.result.resultHash, datasetHash: g.datasetHash, rows, baseline: g.result.baseline, neighborhood: g.result.neighborhood,
          nominalRejections: rows.filter(r => r.pValue <= 0.05).length, holmRejections: rows.filter(r => r.reject).length, positiveEstimates: rows.filter(r => r.estimate > 0).length,
          robustness104: { rows: g.robustRows, nominalRejections: g.robustRows.filter(r => r.pValue <= 0.05).length, holmRejections: g.robustRows.filter(r => r.reject).length },
          adaptive: { maxPwBcb: maxB, blockLength: bAdapt, rerun: bAdapt > 52, rows: g.adaptiveRows, holmRejections: g.adaptiveRows ? g.adaptiveRows.filter(r => r.reject).length : null } },
        diagnostics: diag.map(d => ({ parameters: d.parameters, ...d.summary })),
        criteriaCounts: counts, criteriaHold: holds,
        populationStatus: { BLOCK_DESIGN_SUPPORTED: holds.C1_PW && holds.C2_PLATEAU && holds.C3_METHODS && holds.C4_LRV, STATIONARITY_NOT_CONTRADICTED: holds.C5_STATIONARITY && holds.C6_SPLIT }
      };
      popFull.endpoints[endpoint] = { diagnosticsFull: diag.map(d => ({ parameters: d.parameters, ...d.full })), inference: g.results.map(x => ({ parameters: x.parameters, result: x.result })), robustness: g.robust.map(x => ({ parameters: x.parameters, result: x.result })), adaptive: g.adaptive.map(x => ({ parameters: x.parameters, result: x.result })) };
    }
    popOut.seconds = (Date.now() - t1) / 1000; summary.populations[name] = popOut; full.populations[name] = popFull;
    console.error(name, 'done', popOut.seconds, 's');
  }
  // Method decision (registered rule; significance never enters).
  const ok = name => { const s = summary.populations[name].endpoints.primary.populationStatus; return s.BLOCK_DESIGN_SUPPORTED && s.STATIONARITY_NOT_CONTRADICTED; };
  const failing = Object.fromEntries(Object.keys(pops).map(n => [n, Object.entries(summary.populations[n].endpoints.primary.criteriaHold).filter(([, v]) => !v).map(([k]) => k)]));
  summary.decision = { rule: reg.registration.decisionCriteria.methodDecision, perPopulationPrimary: Object.fromEntries(Object.keys(pops).map(n => [n, { allCriteria: ok(n), failing: failing[n], counts: summary.populations[n].endpoints.primary.criteriaCounts }])),
    methodStatus: ok('P1') && ok('P2') ? 'ACCEPTED_WITH_DEFINED_SCOPE' : 'PARTIALLY_VALIDATED', trioInScope: ok('P1') && ok('P2') && ok('TRIO'), productionApproved: false };
  summary.seconds = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(out, 'run-full.json'), JSON.stringify(full)); fs.writeFileSync(path.join(out, 'run-summary.json'), JSON.stringify(summary));
  console.log(JSON.stringify({ seconds: summary.seconds, decision: summary.decision }));
}

if (require.main === module) {
  const [stage, dir] = process.argv.slice(2);
  ({ 'reproduce-v8': reproduceV8, register, run })[stage]?.(dir) ?? (stage in { 'reproduce-v8': 1, register: 1, run: 1 } ? null : (() => { throw Error('STAGE_REQUIRED: reproduce-v8|register|run'); })());
}
module.exports = { buildFrame, diagnosePoint, rowsFor, valueOf };
