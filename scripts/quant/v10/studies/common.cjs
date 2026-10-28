'use strict';
// V10 strand STUDIES – shared, outcome-free building blocks (population frame, weekly panel,
// benchmark, inference wrappers, evidence envelope, survivorship sensitivity).
// Reuses the existing research engines; no product data writes, no engine changes.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const C = require(ROOT + '/quant/engines/research-contract.cjs');
const L = require(ROOT + '/quant/engines/research-weekly-loader.cjs');
const S = require(ROOT + '/quant/engines/research-studies.cjs');
const V = require(ROOT + '/quant/engines/research-validation.cjs');
const B = require(ROOT + '/quant/engines/weekly-benchmark.cjs');
const Signal = require(ROOT + '/quant/engines/signal-backtest.js');

const SERIES_DIR = 'quant/data/market/discover-series-long';
const DOCS_DIR = path.join(ROOT, 'docs/quant-recovery/v10/studies');
const REG_FILE = path.join(DOCS_DIR, 'registration-1.0.0.json');
const MIC = { NASDAQ: 'XNAS', NYSE: 'XNYS', AMEX: 'XASE', 'NYSE MKT': 'XASE' };
const WINDOW = ['2000-01-01', '2025-12-31'];
const PRIMARY_LOADER_OPTIONS = Object.freeze({ identityEvidence: true, corporateActionEvidence: true });
// Signal eligibility mirrors research-studies.runSignalStudy (priceFeatureLookback = WARMUP + COOLDOWN).
const SIGNAL_FEATURE_LOOKBACK = Signal.WARMUP_WEEKS + Signal.COOLDOWN_WEEKS;
const SUBPERIODS = [['2000-01-01', '2007-12-31'], ['2008-01-01', '2012-12-31'], ['2013-01-01', '2019-12-31'], ['2020-01-01', '2025-12-31']];
const REGIME_CONFIG = { mode: 'EX_POST_DESCRIPTIVE', lookbackBars: 26, volatilityLookbackBars: 26, annualization: 52, trendBand: 0.05, volatilityThreshold: 0.25 };
const INFERENCE = { replicates: 1999, seed: 1729, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' };
const blockLengthFor = h => (h >= 52 ? 104 : 52);

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const weekOf = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); };
const gitHead = () => { try { return cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
const netOf = (gross, feeBps, slippageBps) => { const s = (feeBps + slippageBps) / 10000; return (1 + gross) * (1 - s) / (1 + s) - 1; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

function parseArgs(argv) {
  const out = { stage: argv[0], out: null, loaderOptions: { ...PRIMARY_LOADER_OPTIONS }, studies: ['signal', 'pattern', 'replay'], publish: null };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--loader-options') out.loaderOptions = JSON.parse(argv[++i]);
    else if (a === '--studies') out.studies = argv[++i].split(',');
    else if (a === '--publish') out.publish = argv[++i];
    else throw Error('UNKNOWN_ARGUMENT:' + a);
  }
  return out;
}
// Tag for a loader configuration (used in output paths); unknown keys are passed through to the loader (fail closed there).
function loaderTag(opts) {
  const keys = Object.keys(opts).filter(k => opts[k] === true).sort();
  if (!keys.length) return 'adapter-default';
  const short = { identityEvidence: 'id', corporateActionEvidence: 'ca', listingLifecycleEvidence: 'lifecycle', identityEvidenceAllowCoverPageOnly: 'coveronly' };
  return keys.map(k => short[k] || k).join('-');
}
function privateDir(directory) {
  if (!directory) throw Error('PRIVATE_OUTPUT_REQUIRED');
  const out = path.resolve(directory); fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const real = fs.realpathSync(out), root = fs.realpathSync(ROOT);
  if (real === root || real.startsWith(root + path.sep)) throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  return real;
}
function codeHashes(extra = []) {
  const files = ['scripts/quant/v10/studies/common.cjs', 'quant/engines/research-weekly-loader.cjs', 'quant/engines/weekly-real-adapter.cjs', 'quant/engines/research-studies.cjs', 'quant/engines/research-validation.cjs',
    'quant/engines/research-contract.cjs', 'quant/engines/research-portfolio.cjs', 'quant/engines/weekly-benchmark.cjs', 'quant/engines/signal-backtest.js', 'quant/engines/pattern-research.js',
    'quant/engines/corporate-action-evidence.js', 'quant/engines/research-identity-evidence.cjs', 'quant/engines/research-ca-evidence.cjs', ...extra];
  return Object.fromEntries(files.filter(f => fs.existsSync(path.join(ROOT, f))).map(f => [f, C.shaFile(path.join(ROOT, f))]));
}

// ---------- population frame (deterministic, outcome-free; V9 frame rule on the research loader) ----------
function micOf(doc) {
  if (doc.identityEvidenceBinding) return ['XNAS', 'XNYS', 'XASE'].includes(doc.identityEvidenceBinding.mic) ? doc.identityEvidenceBinding.mic : null;
  const exch = String(doc.listingId).split(':')[1];
  return MIC[exch] || null;
}
function buildFrame(loaderOptions) {
  const loader = L.createResearchLoader(ROOT, loaderOptions);
  const files = fs.readdirSync(path.join(ROOT, SERIES_DIR)).filter(f => /^ref_.*\.json$/.test(f)).sort();
  const reasons = {}, qualified = [], docs = new Map();
  for (const f of files) {
    const id = f.slice(0, -5);
    try { docs.set(id, loader(id)); qualified.push(id); reasons.QUALIFIED = (reasons.QUALIFIED || 0) + 1; }
    catch (e) { const r = String(e.message).split(':')[0]; reasons[r] = (reasons[r] || 0) + 1; }
  }
  const labels = new Map();
  for (const id of qualified) for (const [d] of docs.get(id).points) { const k = weekOf(d); if (!labels.has(k)) labels.set(k, new Map()); const m = labels.get(k); m.set(d, (m.get(d) || 0) + 1); }
  const modal = new Map([...labels].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0]]));
  const calendar = [...modal.values()].sort();
  const excluded = { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [] }, frame = [];
  for (const id of qualified) {
    const d = docs.get(id);
    if (d.points.some(([x]) => modal.get(weekOf(x)) !== x)) excluded.NON_MODAL_WEEK_LABEL.push(id);
    else if (!micOf(d)) excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET.push(id);
    else frame.push(id);
  }
  return { loader, loaderOptions, files, reasons, qualified, docs, calendar, excluded, frame };
}
function lifecycleOf(doc) { return doc.listingLifecycle ?? null; }
function sourceManifest(fr) {
  const extra = ['quant/data/market/security-master/us-security-master.json', B.SOURCE, 'quant/data/market/multi-asset/instruments.json', 'quant/data/market/discover-series/ref_SPY.json'];
  const rows = fr.qualified.map(id => {
    const d = fr.docs.get(id), lc = lifecycleOf(d);
    return [id, C.shaFile(path.join(ROOT, SERIES_DIR, id + '.json')), d.points[0][0], d.points.at(-1)[0], d.points.length, C.hash(d.points), d.listingStart, micOf(d), d.listingId,
      lc ? { status: lc.status ?? null, lastTradeDate: lc.lastTradeDate ?? null, terminalKind: lc.terminal?.kind ?? null, cashPerShare: lc.terminal?.cashPerShare ?? null } : null];
  });
  return { schemaVersion: 'v10-studies-source-manifest-1.0.0', loaderOptions: fr.loaderOptions, columns: ['securityId', 'fileSha256', 'firstDate', 'lastDate', 'points', 'pointsHash', 'listingStart', 'mic', 'listingId', 'lifecycle'],
    qualified: rows, frame: fr.frame, excluded: fr.excluded, qualificationCounts: fr.reasons, calendarHash: V.hash(fr.calendar), calendarLength: fr.calendar.length,
    files: Object.fromEntries(extra.map(f => [f, C.shaFile(path.join(ROOT, f))])) };
}

// ---------- weekly panel ----------
function buildPanel(fr) {
  const calIndex = new Map(fr.calendar.map((d, i) => [d, i]));
  return fr.frame.map(id => {
    const d = fr.docs.get(id), n = d.points.length;
    const closes = new Float64Array(n), cal = new Int32Array(n), gap = new Int32Array(n + 1);
    for (let k = 0; k < n; k++) { closes[k] = d.points[k][1]; cal[k] = calIndex.get(d.points[k][0]); }
    // gap[k+1] = number of bars j<=k whose calendar index is not previous+1 (engine calendarGaps).
    for (let k = 0; k < n; k++) gap[k + 1] = gap[k] + (k > 0 && cal[k] !== cal[k - 1] + 1 ? 1 : 0);
    return { id, doc: d, listingId: d.listingId, issuerId: id, listingStart: d.listingStart, mic: micOf(d), dates: d.points.map(p => p[0]), closes, cal, gap, lifecycle: lifecycleOf(d) };
  });
}
// Engine eligibility of a signal-date bar k (identity interval + feature calendar gap rule).
function eligibleAt(p, k, lookback) {
  if (k < Signal.WARMUP_WEEKS || p.dates[k] < p.listingStart) return false;
  const from = lookback === Infinity ? 0 : Math.max(0, k - lookback);
  return p.gap[k + 1] - p.gap[from] === 0;
}
// Next-observed-week-close entry, h-week exit, contiguous calendar path (engine eventOutcome semantics).
function forwardGross(p, k, h) {
  const e = k + 1, x = k + 1 + h;
  if (x >= p.closes.length || p.cal[x] - p.cal[k] !== 1 + h) return null;
  return p.closes[x] / p.closes[e] - 1;
}
function listingOf(p) {
  return { listingId: p.listingId, issuerId: p.issuerId, securityId: p.id,
    identity: { mic: p.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: p.listingStart, availableAt: p.doc.masterGeneratedAt || p.doc.asOf + 'T00:00:00Z', sourceHash: p.doc.identityHash },
    bars: p.dates.map((date, k) => ({ date, close: p.closes[k] })) };
}

// ---------- benchmark ----------
function loadBenchmark() {
  const b = B.load(ROOT);
  return { ...b, ret: (a, z) => { const x = b.byDate.get(a), y = b.byDate.get(z); return x && y ? y / x - 1 : null; } };
}
function benchmarkBars(benchmark, calendar) { const s = new Set(calendar); return [...benchmark.byDate].filter(([d]) => s.has(d)).map(([date, close]) => ({ date, close })); }
function regimeLabels(benchmark, calendar) {
  const bars = benchmarkBars(benchmark, calendar);
  const r = S.classifyRegimes({ asOf: calendar.at(-1), bars, ...REGIME_CONFIG });
  return { resultHash: r.resultHash, missingCalendarDates: calendar.length - bars.length, byDate: new Map(r.regimes.map(x => [x.date, { trend: x.state, volatility: x.volatilityState }])) };
}

// ---------- inference ----------
function blockInference(calendar, rows, blockLength) {
  if (!rows.length) return { n: 0, estimate: null, ci: null, pValue: null, state: 'NO_OBSERVATIONS' };
  if (rows.length > 100000) return { n: rows.length, estimate: mean(rows.map(r => r.value)), ci: null, pValue: null, state: 'ENGINE_OBSERVATION_BUDGET_EXCEEDED' };
  try {
    const r = V.inferTemporalBlockMean({ calendar, blockLength, minimumBlockLength: blockLength, ...INFERENCE }, rows);
    return { n: r.n, estimate: r.estimate, ci: r.ci, pValue: r.pValue, occupiedDates: r.occupiedDates, dates: r.dates, blockLength, blocks: r.blockCountDiagnostic, inputHash: r.inputHash, method: r.inferenceMethod, state: 'ESTIMATED_NOT_CERTIFIED' };
  } catch (e) { return { n: rows.length, estimate: mean(rows.map(r => r.value)), ci: null, pValue: null, state: 'ENGINE_REFUSED:' + e.message }; }
}
// Two-way cluster (date x issuer) asymptotic interval of the engine (research-studies.inference).
function clusterInference(rows) {
  const r = S.inference(rows.map(x => ({ value: x.value, v: x.value, timeCluster: x.date, issuerId: x.issuer })), 'v');
  return { n: r.n, mean: r.mean, median: r.median ?? null, se: r.standardError ?? null, ci: r.interval95, timeClusters: r.timeClusters ?? null, issuerClusters: r.issuerClusters ?? null, inferenceState: r.state };
}
function distribution(values) { const s = Signal.summarize(values); return { n: s.n, hitRate: s.positiveShare, hitRateWilson: s.positiveInterval, mean: s.mean, p10: s.p10, p25: s.p25, median: s.median, p75: s.p75, p90: s.p90, avgWin: s.avgWin, avgLoss: s.avgLoss }; }
function holmFamily(cells, alpha = INFERENCE.alpha) {
  const testable = cells.filter(c => Number.isFinite(c.pValue));
  const adj = V.holm(testable.map(c => c.pValue));
  testable.forEach((c, i) => { c.holmAdjustedP = adj[i]; c.holmReject = adj[i] <= alpha; });
  cells.filter(c => !Number.isFinite(c.pValue)).forEach(c => { c.holmAdjustedP = null; c.holmReject = false; });
  return { familySize: cells.length, testable: testable.length, rejections: testable.filter(c => c.holmReject).length, alpha, method: 'HOLM_STEP_DOWN (research-validation.holm)' };
}
function splitBy(rows, keyFn) { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (k === null || k === undefined) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }
function subperiodTable(rows) {
  return SUBPERIODS.map(([a, b]) => { const sub = rows.filter(r => r.date >= a && r.date <= b); return { from: a, to: b, ...clusterInference(sub) }; });
}
function regimeTable(rows, regimes) {
  const out = {};
  for (const axis of ['trend', 'volatility']) {
    const m = splitBy(rows, r => regimes.byDate.get(r.date)?.[axis] ?? 'REGIME_UNAVAILABLE');
    out[axis] = [...m].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([state, sub]) => ({ state, ...clusterInference(sub) }));
  }
  return out;
}

// ---------- survivorship sensitivity (requires listingLifecycleEvidence; read defensively) ----------
// events: [{securityId, entryDate, entryClose, expectedExitDate, state, value(net) or null, lastClose}] ; lifecycle per security.
function survivorshipSensitivity(rows, censored, lifecycleById, costs, benchmark, endpoint) {
  const anyLifecycle = [...lifecycleById.values()].some(x => x);
  if (!anyLifecycle) return { state: 'NOT_EVALUABLE_WITHOUT_LISTING_LIFECYCLE_EVIDENCE', cohort: 'SURVIVOR_COHORT_ONLY',
    note: 'Loader ran without listingLifecycleEvidence: every listing in the frame is a current survivor; delisted issuers are absent, so with/without-delisted and censoring bounds cannot be computed. Results are conditional on survival to the data date.' };
  const delisted = new Set([...lifecycleById].filter(([, lc]) => lc && lc.lastTradeDate).map(([id]) => id));
  const terminalRows = [], unresolved = [];
  for (const c of censored) {
    const lc = lifecycleById.get(c.securityId);
    if (!lc || !lc.lastTradeDate || c.expectedExitDate === null || c.expectedExitDate <= lc.lastTradeDate || !(c.entryClose > 0)) continue;
    const t = lc.terminal || {};
    if (t.kind === 'CASH_MERGER' && Number.isFinite(t.cashPerShare) && t.cashPerShare > 0) {
      const gross = t.cashPerShare / c.entryClose - 1, net = netOf(gross, costs.feeBps, costs.slippageBps);
      const spy = benchmark.ret(c.entryDate, c.expectedExitDate);
      terminalRows.push({ ...c, value: endpoint === 'SPY_EXCESS' ? (spy === null ? null : net - spy) : net, valueKind: 'TERMINAL_CONSIDERATION' });
    } else unresolved.push(c);
  }
  const boundRows = kind => unresolved.map(c => {
    const gross = kind === 'MINUS_100' ? -1 : c.lastClose / c.entryClose - 1, net = kind === 'MINUS_100' ? -1 : netOf(gross, costs.feeBps, costs.slippageBps);
    const spy = benchmark.ret(c.entryDate, c.expectedExitDate);
    return { ...c, value: endpoint === 'SPY_EXCESS' ? (spy === null ? null : net - spy) : net };
  }).filter(r => Number.isFinite(r.value));
  const m = rs => ({ n: rs.length, mean: mean(rs.map(r => r.value)) });
  const tv = terminalRows.filter(r => Number.isFinite(r.value));
  return { state: 'EVALUATED', delistedListings: delisted.size,
    observedOnly: m(rows), withoutDelisted: m(rows.filter(r => !delisted.has(r.securityId))), withTerminalConsideration: m(rows.concat(tv)),
    censoredBeyondLastTrade: { terminalConsideration: tv.length, unresolved: unresolved.length },
    boundMinus100: m(rows.concat(tv, boundRows('MINUS_100'))), boundLastClose: m(rows.concat(tv, boundRows('LAST_CLOSE'))) };
}

// ---------- parallel engine calls (worker_threads, unchanged engine per listing) ----------
function engineInput(ctx, extra = {}) {
  const R = ctx.R;
  return { asOf: ctx.fr.calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: { id: R.id, version: R.version, frozenAt: R.registeredAt, analysisMode: 'EXPLORATORY', selection: 'V10 registered frame' }, entryDelayBars: 1,
    costs: { basis: 'PER_SIDE_NOTIONAL', ...R.costs.base }, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN' }, ...extra };
}
function workerListing(p) { return { id: p.id, listingId: p.listingId, listingStart: p.listingStart, mic: p.mic, identityHash: p.doc.identityHash, availableAt: p.doc.masterGeneratedAt || p.doc.asOf + 'T00:00:00Z', dates: p.dates, closes: Array.from(p.closes) }; }
async function runEngineParallel(ctx, kind, panel, horizons, extra = {}, workers = Number(process.env.V10_STUDIES_WORKERS || 3)) {
  const { Worker } = require('node:worker_threads');
  const chunks = Array.from({ length: Math.max(1, Math.min(workers, panel.length)) }, () => []);
  panel.forEach((p, i) => chunks[Math.floor(i * chunks.length / panel.length)].push(workerListing(p)));
  const benchmark = benchmarkBars(ctx.benchmark, ctx.fr.calendar), base = engineInput(ctx);
  const results = await Promise.all(chunks.map(listings => new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'engine-worker.cjs'), { workerData: { kind, listings, calendar: ctx.fr.calendar, benchmark, base, horizons, extra } });
    w.once('message', resolve); w.once('error', reject); w.once('exit', code => { if (code) reject(Error('ENGINE_WORKER_EXIT_' + code)); });
  })));
  return Object.fromEntries(horizons.map(h => [h, results.flatMap(r => r[h])]));
}
// Same calls in the main thread with the FULL calendar and benchmark (no slicing): identity check for a subsample.
function runEngineDirect(ctx, kind, panel, h, extra = {}) {
  const W = require('./engine-worker.cjs'), out = [];
  for (const p of panel) {
    const x = workerListing(p), input = { ...engineInput(ctx, extra), horizonBars: h, expectedCalendar: ctx.fr.calendar, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: benchmarkBars(ctx.benchmark, ctx.fr.calendar) }, listings: [W.listingOf(x)] };
    const r = kind === 'signal' ? S.runSignalStudy(input) : S.runReplayValidation(input);
    for (const e of r.events) out.push({ rule: e.ruleId ?? null, securityId: p.id, signalDate: e.signalDate, state: e.state, gross: e.completed ? e.grossReturn : null, bench: e.completed ? e.benchmarkReturn : null, expectedExitDate: e.expectedExitDate });
  }
  return out;
}

// ---------- evidence envelope ----------
function evidence(fields) {
  const required = ['studyId', 'ruleVersion', 'dataSource', 'listingIdentity', 'population', 'inclusionsExclusions', 'period', 'dataAsOf', 'availability', 'returnBasis', 'costs', 'benchmark', 'maturedOutcomes', 'performance', 'uncertainty', 'multipleTesting', 'scope'];
  for (const k of required) if (!(k in fields)) throw Error('EVIDENCE_FIELD_MISSING:' + k);
  const body = { schemaVersion: 'v10-studies-evidence-1.0.0', evidenceKind: 'HISTORICAL_DEVELOPMENT_STUDY', ...fields, certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  return body;
}
function readRegistration() {
  const reg = JSON.parse(fs.readFileSync(REG_FILE, 'utf8'));
  if (V.hash(reg.registration) !== reg.registrationHash) throw Error('REGISTRATION_HASH_MISMATCH');
  return reg;
}
function writeJson(file, x, gz = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const s = JSON.stringify(x) + (gz ? '' : '\n');
  fs.writeFileSync(file, gz ? zlib.gzipSync(s, { level: 9 }) : s, { mode: 0o644 });
}
function readJson(file) { const b = fs.readFileSync(file); return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8')); }

module.exports = { ROOT, C, L, S, V, B, Signal, SERIES_DIR, DOCS_DIR, REG_FILE, MIC, WINDOW, PRIMARY_LOADER_OPTIONS, SIGNAL_FEATURE_LOOKBACK, SUBPERIODS, REGIME_CONFIG, INFERENCE,
  blockLengthFor, sha, weekOf, gitHead, netOf, mean, parseArgs, loaderTag, privateDir, codeHashes, micOf, buildFrame, lifecycleOf, sourceManifest, buildPanel, eligibleAt, forwardGross,
  listingOf, loadBenchmark, benchmarkBars, regimeLabels, blockInference, clusterInference, distribution, holmFamily, splitBy, subperiodTable, regimeTable, survivorshipSensitivity,
  evidence, readRegistration, writeJson, readJson, engineInput, workerListing, runEngineParallel, runEngineDirect };
