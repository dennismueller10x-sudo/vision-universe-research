'use strict';
// Research-only backtest runner (opt-in, offline). One entry point runBacktest(spec, options) for the six backtest kinds.
// It composes EXISTING pieces only and derives no new finance:
//   population  scripts/quant/research/research-population.cjs (buildPopulation profile; loaders; delisted availability)
//   kind engine quant/engines/research-studies.cjs (runReplayValidation, runPatternStudy, runSignalStudy, runSetupStudy,
//               runFactorStudy, runEventStudy, classifyRegimes/analyzeRegimes), quant/engines/research-portfolio.cjs
//               (runPortfolio, buildSchedule), scripts/quant/run-real-weekly-backtest.cjs (real weekly ledger),
//               scripts/quant/v10/studies/signal-study.cjs (funded signal schedule/input), scripts/quant/v10/setup/
//               run-setup-reconstruction.cjs (reconstructed setup states), scripts/quant/v10/factor/panel.cjs (private panel)
//   methods     research-monte-carlo, research-validation (walk-forward, OOS, temporal block inference, sensitivity via the
//               recorded-grid evaluator of scripts/quant/run-research.cjs), classifyRegimes/analyzeRegimes, runEventStudy
//   metrics     quant/engines/backtest-metrics.cjs (portfolio paths); per-event statistics from the adapters
//   envelope    quant/engines/backtest-result-adapters.cjs -> backtest-result-2.0.0, validated (fail-closed)
// No product path, endpoint, UI or workflow reads this module. productionApproved stays false; nothing here certifies.
// States: A RESEARCH_EXECUTED (historical research run with observed outcomes), B PREPARED_DATA_LIMITED (engine ready,
// inputs missing; exact missing inputs listed), C PRODUCT_CERTIFIED only if the repository certification artifact certifies
// the kind (and follows its gates) AND the spec explicitly requests the product state. A never becomes C automatically.
// Location: scripts/quant/research (research tooling), not quant/engines (guard tests count engine callers of the loader).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const req = p => require(path.join(ROOT, p));
const Kinds = req('quant/engines/backtest-kinds.cjs');
const Contract = req('quant/engines/backtest-result-contract.cjs');
const A = req('quant/engines/backtest-result-adapters.cjs');
const Identity = req('core/identity.js');

const VERSION = 'backtest-runner-1.0.0';
const SPEC_SCHEMA = 'backtest-runner-spec-1.0.0';
const RESULT_SCHEMA = 'backtest-runner-result-1.0.0';
const CERTIFICATION_PATH = 'quant/data/product/backtest-certification-v1.json';
const TR_REGISTER = 'docs/quant-recovery/v10/corporate-actions/tr-register-1.0.0.json';
const SETUP_REPLAY = 'quant/data/product/setup-replay-v1';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_END = 'T23:59:59.999Z';
const NO_CLAIM = 'NO_ALPHA_OR_CERTIFICATION_CLAIM';
const CODE_FILES = ['scripts/quant/research/backtest-runner.cjs', 'scripts/quant/research/research-population.cjs', 'quant/engines/research-studies.cjs',
  'quant/engines/research-portfolio.cjs', 'quant/engines/research-validation.cjs', 'quant/engines/research-monte-carlo.cjs', 'quant/engines/backtest-metrics.cjs',
  'quant/engines/backtest-result-adapters.cjs', 'quant/engines/backtest-result-contract.cjs', 'quant/engines/backtest-kinds.cjs', 'quant/engines/research-weekly-loader.cjs',
  'quant/engines/weekly-real-adapter.cjs', 'quant/engines/weekly-benchmark.cjs', 'quant/engines/signal-backtest.js', 'quant/engines/pattern-research.js', 'quant/engines/setup-engine.js',
  'quant/engines/setup-oos.cjs', 'quant/engines/research-delisted-series.cjs', 'scripts/quant/run-real-weekly-backtest.cjs', 'scripts/quant/run-research.cjs',
  'scripts/quant/v10/studies/common.cjs', 'scripts/quant/v10/studies/signal-study.cjs', 'scripts/quant/v10/setup/run-setup-reconstruction.cjs', 'scripts/quant/v10/factor/panel.cjs'];

// Which optional methods fit which kind (anything else is refused when requested).
const METHOD_FIT = Object.freeze({
  MONTE_CARLO: ['SAME_STOCK_REPLAY', 'STRATEGY_BACKTEST', 'SIGNAL_BACKTEST'],
  WALK_FORWARD: ['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'SETUP_BACKTEST', 'FACTOR_RANKING_BACKTEST'],
  OUT_OF_SAMPLE: ['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'SETUP_BACKTEST', 'FACTOR_RANKING_BACKTEST'],
  MARKET_REGIME: Kinds.KINDS.slice(),
  PARAMETER_SENSITIVITY: ['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'STRATEGY_BACKTEST'],
  EVENT_DRIVEN: Kinds.KINDS.slice(),
  PORTFOLIO_REBALANCING: ['STRATEGY_BACKTEST', 'SIGNAL_BACKTEST'],
});
const SPEC_KEYS = ['schemaVersion', 'id', 'version', 'description', 'kind', 'asOf', 'window', 'registeredAt', 'population', 'engine', 'costs', 'benchmark', 'methods', 'status'];
const POPULATION_KEYS = ['profile', 'tickers', 'securityIds', 'sample', 'privateInputs'];
const ENGINE_KEYS = {
  SAME_STOCK_REPLAY: ['variant', 'pattern', 'cooldownBars', 'horizonBars', 'period'],
  PATTERN_EVIDENCE: ['pattern', 'cooldownBars', 'horizonBars'],
  SIGNAL_BACKTEST: ['ruleIds', 'horizonBars', 'funded'],
  SETUP_BACKTEST: ['entryStates', 'entryVariants', 'exitVariants', 'horizonBars'],
  STRATEGY_BACKTEST: ['variant', 'weights', 'rebalance', 'initialCapital', 'dividends'],
  FACTOR_RANKING_BACKTEST: ['factorId', 'horizonBars', 'buckets'],
};

function fail(code, detail) { const e = new Error(code + (detail !== undefined ? ':' + detail : '')); e.code = code; throw e; }
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { if (!Number.isFinite(x)) fail('NON_FINITE_NUMBER'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  fail('NON_JSON_VALUE');
}
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : canonical(x)).digest('hex');
const shaBytes = b => crypto.createHash('sha256').update(b).digest('hex');
const shaFile = f => shaBytes(fs.readFileSync(f));
const isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const clone = x => JSON.parse(JSON.stringify(x));
const uniq = list => [...new Set(list.filter(x => typeof x === 'string' && x))];
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
function keysOnly(obj, keys, name) { if (!plain(obj)) fail('SPEC_INVALID', name); for (const k of Object.keys(obj)) if (!keys.includes(k)) fail('SPEC_UNKNOWN_KEY', name + '.' + k); }
function posInt(x, name, min = 1) { if (!Number.isSafeInteger(x) || x < min) fail('SPEC_INVALID', name); return x; }
function insideRoot(dir) { const real = fs.realpathSync(dir), r = fs.realpathSync(ROOT); return real === r || real.startsWith(r + path.sep); }

/* ------------------------------------------------------------------ spec */
function validateSpec(spec) {
  keysOnly(spec, SPEC_KEYS, 'spec');
  if (spec.schemaVersion !== SPEC_SCHEMA) fail('SPEC_SCHEMA_UNKNOWN', String(spec.schemaVersion));
  if (typeof spec.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(spec.id)) fail('SPEC_INVALID', 'id');
  if (!Kinds.isKind(spec.kind)) fail('UNKNOWN_KIND', String(spec.kind));
  if (!isDate(spec.asOf)) fail('SPEC_INVALID', 'asOf');
  keysOnly(spec.window, ['from', 'to'], 'window');
  if (!isDate(spec.window.from) || !isDate(spec.window.to) || spec.window.from > spec.window.to || spec.window.to > spec.asOf) fail('SPEC_INVALID', 'window');
  if (typeof spec.registeredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(spec.registeredAt)) fail('SPEC_INVALID', 'registeredAt');
  keysOnly(spec.population, POPULATION_KEYS, 'population');
  const pop = spec.population;
  if (typeof pop.profile !== 'string') fail('SPEC_INVALID', 'population.profile');
  if (pop.tickers !== undefined && (!Array.isArray(pop.tickers) || !pop.tickers.length || pop.tickers.some(t => typeof t !== 'string'))) fail('SPEC_INVALID', 'population.tickers');
  if (pop.securityIds !== undefined && (!Array.isArray(pop.securityIds) || !pop.securityIds.length || pop.securityIds.some(t => typeof t !== 'string' || !/^(ref|dl)_[A-Za-z0-9_.-]+$/.test(t)))) fail('SPEC_INVALID', 'population.securityIds');
  if (pop.sample !== undefined) { keysOnly(pop.sample, ['size', 'seed'], 'population.sample'); posInt(pop.sample.size, 'population.sample.size'); if (typeof pop.sample.seed !== 'string' || !pop.sample.seed) fail('SPEC_INVALID', 'population.sample.seed'); }
  if (pop.privateInputs !== undefined && (!Array.isArray(pop.privateInputs) || pop.privateInputs.some(x => !['delistedSeries', 'factorPanel'].includes(x)))) fail('SPEC_INVALID', 'population.privateInputs');
  keysOnly(spec.engine, ENGINE_KEYS[spec.kind], 'engine');
  keysOnly(spec.costs, ['feeBps', 'slippageBps'], 'costs');
  for (const k of ['feeBps', 'slippageBps']) if (!Number.isFinite(spec.costs[k]) || spec.costs[k] < 0 || spec.costs[k] > 500) fail('SPEC_INVALID', 'costs.' + k);
  if (!['SPY', 'NONE'].includes(spec.benchmark)) fail('SPEC_INVALID', 'benchmark');
  if (spec.methods !== undefined) {
    if (!plain(spec.methods)) fail('SPEC_INVALID', 'methods');
    for (const m of Object.keys(spec.methods)) {
      if (!Kinds.isMethod(m)) fail('UNKNOWN_METHOD', m);
      if (!METHOD_FIT[m].includes(spec.kind)) fail('METHOD_NOT_APPLICABLE_TO_KIND', spec.kind + ':' + m);
      if (!plain(spec.methods[m])) fail('SPEC_INVALID', 'methods.' + m);
    }
  }
  if (spec.status !== undefined) { keysOnly(spec.status, ['requestProductCertifiedState'], 'status'); if (typeof spec.status.requestProductCertifiedState !== 'boolean') fail('SPEC_INVALID', 'status.requestProductCertifiedState'); }
  return true;
}
function specHash(spec) { return sha(spec); }

/* ------------------------------------------------------------ population */
function lazy() {
  return {
    Pop: req('scripts/quant/research/research-population.cjs'), L: req('quant/engines/research-weekly-loader.cjs'), S: req('quant/engines/research-studies.cjs'),
    P: req('quant/engines/research-portfolio.cjs'), V: req('quant/engines/research-validation.cjs'), MC: req('quant/engines/research-monte-carlo.cjs'),
    M: req('quant/engines/backtest-metrics.cjs'), B: req('quant/engines/weekly-benchmark.cjs'), Signal: req('quant/engines/signal-backtest.js'),
  };
}
// Fingerprint of everything the population build reads (series bytes, loader registers, frame code, private delisted files).
function dataFingerprint(profile, privateDirs, E) {
  const dir = path.join(ROOT, 'quant/data/market/discover-series-long');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(f + ':' + shaFile(path.join(dir, f)) + '\n');
  const loader = E.Pop.createLoader(profile);
  const regs = {};
  for (const k of ['identityEvidence', 'corporateActionEvidence', 'listingLifecycleEvidence']) if (loader[k]) regs[k] = { registryHash: loader[k].registryHash || null, v12: loader[k].v12RegistryHash || null, v13: loader[k].v13RegistryHash || null, v13s: loader[k].v13StrictRegistryHash || null, protocol: loader[k].protocolSha256 || null };
  const out = { series: h.digest('hex'), masterHash: loader.masterHash || null, registers: regs,
    code: Object.fromEntries(['scripts/quant/research/research-population.cjs', 'scripts/quant/v10/studies/common.cjs', 'scripts/quant/v13/studies/run-frame.cjs', 'scripts/quant/v13/studies/lib.cjs', 'quant/engines/research-weekly-loader.cjs', 'quant/engines/weekly-real-adapter.cjs', 'quant/engines/research-delisted-series.cjs'].map(f => [f, shaFile(path.join(ROOT, f))])) };
  const { spec } = E.Pop.profileSpec(profile);
  if (spec.delistedFrame) {
    const d = privateDirs.delistedSeries, ph = crypto.createHash('sha256');
    for (const f of fs.readdirSync(d).filter(x => x.endsWith('.json')).sort()) ph.update(f + ':' + shaFile(path.join(d, f)) + '\n');
    out.delisted = { register: shaFile(path.join(ROOT, 'docs/quant-recovery/v13/delisted/register-1.0.0.json')), privateFiles: ph.digest('hex') };
  }
  return sha(out);
}
const populationMemo = new Map();
function populationFrame(profile, privateDirs, ctx, E) {
  if (ctx.deps.population) return ctx.deps.population(profile, privateDirs);
  const fingerprint = dataFingerprint(profile, privateDirs, E);
  const key = sha({ v: VERSION, pop: E.Pop.VERSION, profile: E.Pop.profileSpec(profile).specHash, fingerprint });
  if (populationMemo.has(key)) { ctx.diagnostics.populationCache = 'MEMORY'; return populationMemo.get(key); }
  const file = ctx.cacheDir ? path.join(ctx.cacheDir, 'population-' + key + '.json') : null;
  let summary = null, docs = null;
  if (file && fs.existsSync(file)) { summary = JSON.parse(fs.readFileSync(file, 'utf8')); ctx.diagnostics.populationCache = 'HIT'; }
  else {
    const p = E.Pop.buildPopulation({ profile, ...(privateDirs.delistedSeries ? { privateDirs: { delistedSeries: privateDirs.delistedSeries } } : {}) });
    summary = { ...E.Pop.summarize(p), populationHash: p.populationHash, fingerprint };
    docs = p.listings; ctx.diagnostics.populationCache = file ? 'MISS_WRITTEN' : 'DISABLED';
    if (file) fs.writeFileSync(file, JSON.stringify(summary));
  }
  // Documents: from the build, else re-loaded by the profile's own loader (ref_) or the hash-bound delisted loader (dl_).
  let loader = null, delisted = null;
  const docOf = id => {
    if (docs && docs.has(id)) return docs.get(id);
    if (id.startsWith('dl_')) {
      if (!delisted) delisted = req('quant/engines/research-delisted-series.cjs').loadDelisted(ROOT, { dir: privateDirs.delistedSeries, include: E.Pop.profileSpec(profile).spec.delistedFrame === 'F1' ? 'QUALIFIED' : 'ALL_LOADABLE' }).docs;
      const d = delisted.get(id); if (!d) fail('DELISTED_DOC_MISSING', id); return d;
    }
    if (!loader) loader = E.Pop.createLoader(profile);
    return loader(id);
  };
  const frame = { summary, frameSet: new Set(summary.frameIds), docOf, tryLoad: id => { try { return { doc: docOf(id) }; } catch (e) { return { error: String(e.code === 'ENOENT' ? 'SERIES_FILE_MISSING' : e.message).split(':')[0] }; } } };
  populationMemo.set(key, frame);
  return frame;
}
function truncate(doc, asOf) {
  const points = doc.points.filter(p => p[0] <= asOf);
  return { ...doc, points, totalReturnPoints: Array.isArray(doc.totalReturnPoints) ? doc.totalReturnPoints.filter(p => p[0] <= asOf) : doc.totalReturnPoints };
}
function resolvePopulation(spec, ctx, E) {
  const pop = spec.population;
  let profileInfo;
  try { profileInfo = E.Pop.profileSpec(pop.profile); } catch (e) { fail('UNKNOWN_POPULATION_PROFILE', pop.profile); }
  const privateDirs = {};
  const missing = [];
  if (profileInfo.spec.delistedFrame) {
    const av = E.Pop.availability(pop.profile, { privateDirs: { delistedSeries: ctx.privateDirs.delistedSeries } });
    if (av.status !== 'AVAILABLE') missing.push(av.status + ':delistedSeries (docs/quant-recovery/v13/delisted/register-1.0.0.json, private hash-bound series)');
    else privateDirs.delistedSeries = ctx.privateDirs.delistedSeries;
  }
  if (missing.length) return { missing, profile: pop.profile, profileSpecHash: profileInfo.specHash };
  const frame = populationFrame(pop.profile, privateDirs, ctx, E);
  const s = frame.summary, asOf = spec.asOf;
  const calendar = s.calendar.filter(d => d <= asOf);
  // Requested identities: tickers via core/identity.js (ADR-001), or explicit security ids.
  const requested = [...(pop.tickers || []).map(t => ({ ticker: t, securityId: Identity.securityIdForTicker(t) })), ...(pop.securityIds || []).map(id => ({ ticker: null, securityId: id }))];
  let candidates;
  if (requested.length) candidates = requested;
  else {
    candidates = s.frameIds.map(id => ({ ticker: null, securityId: id }));
    if (pop.sample) candidates = candidates.map(c => ({ c, k: sha('backtest-runner-sample|' + pop.sample.seed + '|' + c.securityId) })).sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0).map(x => x.c);
  }
  const listings = [], excluded = [], wanted = pop.sample && !requested.length ? pop.sample.size : Infinity;
  for (const c of candidates) {
    if (listings.length >= wanted) break;
    if (!frame.frameSet.has(c.securityId)) {
      const t = frame.tryLoad(c.securityId);
      excluded.push({ securityId: c.securityId, ticker: c.ticker, reason: t.error ? t.error : 'NOT_IN_POPULATION_FRAME' });
      continue;
    }
    const doc = truncate(frame.docOf(c.securityId), asOf);
    if (!doc.points.length || doc.points.at(-1)[0] < spec.window.from) { excluded.push({ securityId: c.securityId, ticker: c.ticker, reason: 'NO_DATA_IN_WINDOW' }); continue; }
    if (doc.points[0][0] > spec.window.to) { excluded.push({ securityId: c.securityId, ticker: c.ticker, reason: 'LISTING_STARTS_AFTER_WINDOW' }); continue; }
    listings.push({ securityId: c.securityId, ticker: c.ticker || doc.ticker || null, doc });
  }
  if (!listings.length) missing.push('NO_ADMISSIBLE_LISTING:' + excluded.map(x => x.securityId + '=' + x.reason).join(','));
  return { missing, profile: pop.profile, profileSpecHash: profileInfo.specHash, privateDirs, summary: s, calendar, listings, excluded, frame };
}

/* --------------------------------------------------------- engine inputs */
function micOfDoc(doc) {
  if (doc.mic) return doc.mic;
  if (doc.identityEvidenceBinding) return ['XNAS', 'XNYS', 'XASE'].includes(doc.identityEvidenceBinding.mic) ? doc.identityEvidenceBinding.mic : null;
  return ({ NASDAQ: 'XNAS', NYSE: 'XNYS', AMEX: 'XASE', 'NYSE MKT': 'XASE' })[String(doc.listingId).split(':')[1]] || null;
}
// research-studies listing: identity from the loader document; a sourced last trade date bounds the identity (engine censors).
function engineListing(l, { listingIdIsSecurityId = false, from = null, to = null } = {}) {
  const d = l.doc, lc = d.listingLifecycle || null, validTo = lc && lc.lastTradeDate ? lc.lastTradeDate : null;
  const identity = { mic: micOfDoc(d), instrumentClass: 'COMMON_STOCK', primary: true, validFrom: d.listingStart, availableAt: d.masterGeneratedAt || (d.asOf + 'T00:00:00Z'), sourceHash: d.identityHash };
  if (validTo) identity.validTo = validTo;
  return { listingId: listingIdIsSecurityId ? l.securityId : d.listingId, issuerId: l.securityId, securityId: l.securityId, identity,
    bars: d.points.filter(([date]) => (!validTo || date <= validTo) && (!from || date >= from) && (!to || date <= to)).map(([date, close]) => ({ date, close })) };
}
// Signal rules read at most WARMUP_WEEKS bars plus the COOLDOWN_WEEKS detection memory before a signal; bars older than
// the window start minus this buffer cannot change any event inside the window (checked in backtest-runner tests), so they
// are dropped to stay within the engine's work budgets. Pattern/replay features (running maximum) keep the full history.
function signalTrimDate(spec, pop, E) {
  const k = pop.calendar.findIndex(d => d >= spec.window.from);
  const buffer = E.Signal.WARMUP_WEEKS + E.Signal.COOLDOWN_WEEKS + 52;
  return k < 0 ? null : pop.calendar[Math.max(0, k - buffer)];
}
function benchmarkBars(ctx, calendar) {
  if (!ctx.benchmark) return null;
  const set = new Set(calendar);
  return [...ctx.benchmark.byDate].filter(([d]) => set.has(d)).map(([date, close]) => ({ date, close }));
}
function studyBase(spec, pop, ctx, extra = {}) {
  const bars = spec.benchmark === 'SPY' ? benchmarkBars(ctx, pop.calendar) : null;
  return { asOf: spec.asOf, sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: { id: spec.id, version: spec.version || '1.0.0', frozenAt: spec.registeredAt, analysisMode: 'EXPLORATORY' }, entryDelayBars: 1,
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: spec.costs.feeBps, slippageBps: spec.costs.slippageBps }, expectedCalendar: pop.calendar,
    ...(bars ? { benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars } } : {}), ...extra };
}
// Windowed view of an engine result: events whose signal date lies in spec.window; counts/statistics recomputed with the
// engine's own inference(). The full engine run stays referenced by engineResultHash.
function windowed(result, window, S) {
  const inW = d => d >= window.from && d <= window.to;
  const events = result.events.filter(e => inW(e.signalDate));
  const counts = { expected: events.length, observed: 0, immature: 0, censored: 0, ineligible: 0 };
  for (const e of events) counts[e.state === 'OBSERVED' ? 'observed' : e.state === 'IMMATURE' ? 'immature' : e.state === 'CENSORED' ? 'censored' : 'ineligible']++;
  const den = counts.expected - counts.immature;
  const out = { ...result, events, coverage: { ...counts, maturedDenominator: den, observedShareMatured: den ? counts.observed / den : null }, statistics: S.inference(events),
    window: { from: window.from, to: window.to, engineEvents: result.events.length }, engineResultHash: result.resultHash };
  delete out.resultHash;
  if (Array.isArray(out.baseRates)) out.baseRates = out.baseRates.filter(b => inW(b.signalDate)).map(b => ({ signalDate: b.signalDate, observedOnlyMean: b.observedOnlyMean, completeCohortMean: b.completeCohortMean, population: b.population.length }));
  if (Array.isArray(out.rules)) out.rules = out.rules.map(r => ({ ...r, statistics: S.inference(events.filter(e => e.ruleId === r.id)) }));
  if (Array.isArray(out.controls)) { out.controls = out.controls.filter(e => inW(e.signalDate)); out.controlStatistics = S.inference(out.controls); out.matchedStatistics = S.inference(events, 'matchedExcess'); out.controlsInWindow = out.controls.length; delete out.controls; }
  if (Array.isArray(out.controlCoverage)) out.controlCoverage = out.controlCoverage.filter(x => inW(x.signalDate));
  if (Array.isArray(out.suppressed)) out.suppressed = out.suppressed.filter(x => inW(x.date)).length;
  if (Array.isArray(out.periods)) out.periods = out.periods.filter(p => inW(p.date));
  return { ...out, resultHash: S.hash(out) };
}

/* ----------------------------------------------------------- kind engines */
function patternOf(engine) {
  const p = engine.pattern;
  if (!plain(p) || typeof p.id !== 'string' || typeof p.version !== 'string' || !Array.isArray(p.terms)) fail('SPEC_INVALID', 'engine.pattern');
  return p;
}
function runPerEventKind(spec, pop, ctx, E, override = {}) {
  const eng = { ...spec.engine, ...override.engine }, costs = { ...spec.costs, ...override.costs };
  const sp = { ...spec, costs };
  const kind = spec.kind;
  if (kind === 'SAME_STOCK_REPLAY') {
    if (pop.listings.length !== 1) fail('SPEC_INVALID', 'SAME_STOCK_REPLAY requires exactly one listing');
    const r = E.S.runReplayValidation(studyBase(sp, pop, ctx, { listings: [engineListing(pop.listings[0])], horizonBars: posInt(eng.horizonBars, 'engine.horizonBars'), pattern: patternOf(eng), cooldownBars: posInt(eng.cooldownBars, 'engine.cooldownBars') }));
    return { raw: r, path: 'research-studies.runReplayValidation' };
  }
  if (kind === 'PATTERN_EVIDENCE') {
    const r = E.S.runPatternStudy(studyBase(sp, pop, ctx, { listings: pop.listings.map(l => engineListing(l)), horizonBars: posInt(eng.horizonBars, 'engine.horizonBars'), pattern: patternOf(eng), cooldownBars: posInt(eng.cooldownBars, 'engine.cooldownBars') }));
    return { raw: r, path: 'research-studies.runPatternStudy' };
  }
  if (kind === 'SIGNAL_BACKTEST') {
    const from = override.untrimmed ? null : signalTrimDate(spec, pop, E);
    const r = E.S.runSignalStudy(studyBase(sp, pop, ctx, { listings: pop.listings.map(l => engineListing(l, { from })), horizonBars: posInt(eng.horizonBars, 'engine.horizonBars'), ...(eng.ruleIds ? { ruleIds: eng.ruleIds } : {}) }));
    return { raw: r, path: 'research-studies.runSignalStudy' };
  }
  fail('INTERNAL_KIND_DISPATCH', kind);
}

function runSetup(spec, pop, ctx, E) {
  const RS = req('scripts/quant/v10/setup/run-setup-reconstruction.cjs');
  const eng = spec.engine, listings = [], states = [], replayHashes = {}, excluded = [];
  for (const l of pop.listings) {
    const file = path.join(ROOT, SETUP_REPLAY, l.securityId + '.json.gz');
    if (!fs.existsSync(file)) { excluded.push({ securityId: l.securityId, reason: 'NO_RECONSTRUCTED_SETUP_REPLAY' }); continue; }
    const bytes = fs.readFileSync(file), replay = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
    if (replay.engine?.mapping !== 'setup-mapping-1.0.0' || replay.cadence !== 'WEEKLY' || replay.securityId !== l.securityId) { excluded.push({ securityId: l.securityId, reason: 'REPLAY_ENGINE_OR_CADENCE_MISMATCH' }); continue; }
    const listing = RS.listingOf(l.doc, l.securityId, l.doc.listingLifecycle ?? null);
    const stream = RS.eventStream(replay, listing, shaBytes(bytes));
    replayHashes[l.securityId] = shaBytes(bytes);
    listings.push(listing); states.push(...stream.states.filter(s => s.date <= spec.asOf));
  }
  if (!listings.length) return { missing: ['NO_RECONSTRUCTED_SETUP_REPLAY_FOR_POPULATION (' + SETUP_REPLAY + ')'], excluded };
  states.sort((a, b) => a.date.localeCompare(b.date) || a.listingId.localeCompare(b.listingId));
  const base = studyBase(spec, pop, ctx);
  delete base.executionClock; // the reconstruction runs on explicit session close times (closeAt), exactly like V10
  const h = posInt(eng.horizonBars || 26, 'engine.horizonBars');
  const r = E.S.runSetupStudy({ ...base, horizonBars: h, entryStates: eng.entryStates || ['SETUP_NEW', 'SETUP_CONFIRMED'], listings, setups: states,
    entryVariants: eng.entryVariants || [{ id: 'NEXT_WEEK_CLOSE', delayBars: 1 }], exitVariants: eng.exitVariants || [{ id: 'M6_TIME', type: 'TIME_EXIT', horizonBars: h }] });
  return { raw: r, path: 'research-studies.runSetupStudy (reconstructed states: setup-replay-v1 + run-setup-reconstruction.eventStream)', replayHashes, excluded };
}

// Setup OOS status exactly as the certification builder evaluates it (published states only).
function setupOosFromCertificationPath(E) {
  const SetupOos = req('quant/engines/setup-oos.cjs');
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/methodology/backtest-certification-v1.json'), 'utf8'));
  const outcomes = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/setup-outcomes-v1.json'), 'utf8'));
  const st = outcomes.study;
  const completedM6 = Math.max(...['SETUP_CONFIRMED', 'SETUP_NEW'].map(k => st[k].variants.NEXT_CLOSE.m6.status.COMPLETED));
  const r = SetupOos.evaluateSetupOos({ rows: null, completedCount: completedM6, minPerSegment: M.kinds.SETUP_BACKTEST.requirements.oosMinPerSegment, segmentation: SetupOos.segmentationFromMethodology(M) });
  return { evaluator: r.schemaVersion, status: r.status, reasonCode: r.reasonCode, completed: r.completed, minPerSegment: r.minPerSegment, source: 'quant/data/product/setup-outcomes-v1.json (published states)' };
}

function readPanelOnce(file) {
  const Panel = req('scripts/quant/v10/factor/panel.cjs');
  return Panel.readPanel(file, { withRaws: false });
}
function runFactor(spec, pop, ctx, E) {
  const file = ctx.privateDirs.factorPanel;
  const missing = ['PRIVATE_FACTOR_PANEL panel.jsonl.gz (scripts/quant/v10/factor/panel.cjs from SEC companyfacts PIT documents, scripts/quant/v10/factor/pit_docs.py)', 'REVISIONS_FACTOR_HAS_NO_LICENSED_PIT_CONSENSUS_SOURCE (not reconstructable)'];
  if (!file || !fs.existsSync(file)) return { missing: missing.slice(0, 1) };
  if (insideRoot(path.dirname(file))) fail('PRIVATE_DIR_INSIDE_REPOSITORY', 'factorPanel');
  const panel = readPanelOnce(file);
  const loaderOptions = E.Pop.profileSpec(spec.population.profile).spec.loaderOptions;
  if (sha(panel.loaderOptions) !== sha(loaderOptions)) fail('PANEL_LOADER_OPTIONS_MISMATCH', spec.population.profile);
  const X = req('scripts/quant/v10/factor/factors.cjs');
  const eng = spec.engine;
  if (!X.SIGNALS.includes(eng.factorId)) fail('SPEC_INVALID', 'engine.factorId');
  const ids = new Set(pop.listings.map(l => l.securityId));
  const snaps = panel.dates.filter(d => d.date >= spec.window.from && d.date <= spec.window.to);
  if (!snaps.length) return { missing: ['FACTOR_PANEL_HAS_NO_RANK_DATE_IN_WINDOW'] };
  const factorSnapshots = snaps.map(s => {
    const availableAt = s.date + DAY_END;
    return { date: s.date, availableAt, sourceHash: sha({ date: s.date, signal: eng.factorId }),
      rows: s.rows.filter(r => ids.has(r.id)).map(r => ({ listingId: r.id, value: X.finite(r.scores[eng.factorId]) ? r.scores[eng.factorId] : null, availableAt, sourceHash: sha([r.id, s.date, r.scores]) })) };
  });
  const used = new Set(factorSnapshots.flatMap(s => s.rows.map(r => r.listingId)));
  // Factor values come from the panel; prices are only needed for outcomes: bars from the first rank date to the last
  // possible exit (+2 sessions), like scripts/quant/v10/factor/study.cjs (exits beyond stay IMMATURE/CENSORED as in the engine).
  const k = pop.calendar.indexOf(snaps.at(-1).date), to = pop.calendar[Math.min(pop.calendar.length - 1, (k < 0 ? pop.calendar.length - 1 : k) + posInt(eng.horizonBars, 'engine.horizonBars') + 2)];
  const listings = pop.listings.filter(l => used.has(l.securityId)).map(l => engineListing(l, { listingIdIsSecurityId: true, from: snaps[0].date, to }));
  const r = E.S.runFactorStudy(studyBase(spec, pop, ctx, { listings, horizonBars: posInt(eng.horizonBars, 'engine.horizonBars'), buckets: posInt(eng.buckets || 5, 'engine.buckets', 2), factorId: eng.factorId, factorSnapshots }));
  return { raw: r, path: 'research-studies.runFactorStudy (private V10 PIT panel)', panelSha256: shaFile(file), panelRankDates: snaps.length };
}

// Portfolio inputs from the population (existing runPortfolio contract; schedule via buildSchedule).
function closeAtObserved() {
  const TS = req('quant/engines/realtime/trading-session.js');
  const CAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/config/market-calendar.json'), 'utf8'));
  return d => d >= CAL.coverage.from ? TS.sessionFor(d, { calendar: CAL, exchange: 'XNYS' }).close : TS.localToUtc(d, '16:00', 'America/New_York');
}
function trRegister() { const bytes = fs.readFileSync(path.join(ROOT, TR_REGISTER)); return { reg: JSON.parse(bytes), sha256: shaBytes(bytes) }; }
function strategyInput(spec, pop, ctx, E, override = {}) {
  const eng = { ...spec.engine, ...override.engine }, costs = { ...spec.costs, ...override.costs };
  if (eng.variant !== 'FIXED_WEIGHTS') fail('SPEC_INVALID', 'engine.variant');
  const withDividends = eng.dividends === 'TR_REGISTER' && !override.priceOnly;
  const tr = eng.dividends === 'TR_REGISTER' ? trRegister() : null;
  const listings = pop.listings;
  const sets = listings.map(l => new Set(l.doc.points.map(p => p[0])));
  const bench = ctx.benchmark;
  let dates = pop.calendar.filter(d => d >= spec.window.from && d <= spec.window.to && sets.every(s => s.has(d)));
  if (!withDividends && spec.benchmark === 'SPY') dates = dates.filter(d => bench.byDate.has(d));
  if (dates.length < 3) return { missing: ['COMMON_WEEKLY_SESSIONS_IN_WINDOW<3'] };
  const closeAt = withDividends ? closeAtObserved() : (d => d + DAY_END);
  const sessions = dates.map(date => ({ date, closeAt: closeAt(date) }));
  const inWin = new Set(dates), members = listings.map(l => l.securityId), mh = sha({ members, window: spec.window });
  const weightsOf = () => {
    if (eng.weights === 'EQUAL' || eng.weights === undefined) return Object.fromEntries(members.map(m => [m, 1 / members.length]));
    if (!plain(eng.weights)) fail('SPEC_INVALID', 'engine.weights');
    const w = {}; for (const [t, x] of Object.entries(eng.weights)) { const id = Identity.securityIdForTicker(t); if (!members.includes(id) || !Number.isFinite(x) || x < 0) fail('SPEC_INVALID', 'engine.weights.' + t); w[id] = x; }
    return w;
  };
  const weights = weightsOf();
  const rb = eng.rebalance || { frequency: 'sessions', everySessions: 4 };
  keysOnly(rb, ['frequency', 'everySessions'], 'engine.rebalance');
  const schedule = E.P.buildSchedule(sessions, rb.frequency, rb.everySessions || 1);
  let events = {}, trWindows = {};
  if (tr) {
    for (const l of listings) {
      const t = tr.reg.titles.find(x => x.securityId === l.securityId);
      if (!t) return { missing: ['TR_REGISTER_TITLE_MISSING:' + l.securityId + ' (' + TR_REGISTER + ')'] };
      const w = t.totalReturnWindows.find(x => x.from <= spec.window.from && x.to >= spec.window.to);
      if (!w) return { missing: ['TR_WINDOW_NOT_COVERED:' + l.securityId + ':' + spec.window.from + '..' + spec.window.to] };
      trWindows[l.securityId] = w;
      // Register sequences are per title; simultaneous events of different titles are independent, the title index orders them.
      const li = listings.indexOf(l);
      events[l.securityId] = withDividends ? t.portfolioEvents.filter(e => e.effectiveDate >= dates[0] && e.effectiveDate <= dates.at(-1)).map(e => ({ ...e, sequence: li * 1000 + e.sequence })) : [];
    }
  }
  const initialCapital = eng.initialCapital || 100000;
  const provenance = withDividends
    ? { mode: 'HISTORICAL_OBSERVED', datasetHash: sha({ series: listings.map(l => [l.securityId, l.doc.sourceBytesHash || sha(l.doc.points)]), register: tr.sha256 }), identityEvidence: sha(listings.map(l => l.doc.identityHash)),
      populationEvidence: mh, corporateActionEvidence: tr.sha256, lifecycleEvidence: sha({ continuousWeeklyCoverage: members, window: spec.window }), licenseEvidence: sha(listings.map(l => l.doc.publishBasis || '')),
      historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 }
    : { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: sha(listings.map(l => [l.securityId, l.doc.sourceBytesHash || sha(l.doc.points)])), priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' };
  const returnBasis = withDividends ? 'TOTAL_RETURN' : 'PRICE_RETURN';
  const benchmark = withDividends || spec.benchmark !== 'SPY'
    ? { currency: 'USD', returnBasis, sourceHash: sha({ benchmark: 'ZERO_RATE_CASH_CONSTANT_LEVEL', window: spec.window }), costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: 1 })) }
    : { currency: 'USD', returnBasis: 'PRICE_RETURN', sourceHash: bench.provenance.sourceBytesHash, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: dates.map(date => ({ date, level: bench.byDate.get(date) })) };
  const input = { sessions, initialCapital, currency: 'USD', returnBasis, provenance, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: costs.feeBps, slippageBps: costs.slippageBps },
    maxMembershipAgeDays: 20000, maxFactorAgeDays: 45,
    listings: listings.map((l, i) => ({ listingId: l.securityId, issuerId: l.securityId, mic: micOfDoc(l.doc), instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: withDividends ? dates[0] : l.doc.listingStart, lastTradeDate: null,
      events: tr ? events[l.securityId] : [], bars: l.doc.points.filter(p => inWin.has(p[0])).map(([date, close]) => ({ date, close, availableAt: closeAt(date) })) })),
    memberships: [{ effectiveAt: dates[0] + 'T00:00:00Z', availableAt: dates[0] + 'T00:00:00Z', sourceHash: mh, members }], factorSnapshots: [],
    targets: schedule.map(s => ({ ...s, availableAt: closeAt(s.decisionDate), membershipHash: mh, weights })), benchmark };
  return { input, trWindows, schedule: rb, benchmarkId: withDividends ? 'ZERO_RATE_CASH' : spec.benchmark === 'SPY' ? 'SPY_PRICE_RETURN' : 'ZERO_RATE_CASH' };
}

/* -------------------------------------------------------------- methods */
function endpointValue(e, endpoint) { return endpoint === 'benchmarkExcess' ? e.benchmarkExcess : endpoint === 'matchedExcess' ? e.matchedExcess : e.netReturn; }
function eventId(e) { return [e.listingId, e.signalDate, e.ruleId || '', e.entryVariant || '', e.exitVariant || '', e.eventId || ''].join('|'); }
function blockInference(E, calendar, rows, cfg) {
  const blockLength = Math.min(cfg.blockLength || 26, Math.floor(calendar.length / 2));
  const r = E.V.inferTemporalBlockMean({ calendar, blockLength, minimumBlockLength: Math.min(cfg.minimumBlockLength || blockLength, blockLength), replicates: cfg.replicates || 999, seed: cfg.seed || 20261029, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' }, rows);
  return { estimate: r.estimate, pValue: r.pValue, n: r.n, ci: r.ci, inferenceMethod: r.inferenceMethod, clusters: r.occupiedDates, effectiveN: null, blockLength, resultHash: r.resultHash };
}
function perEventRows(events, endpoint) {
  return events.filter(e => e.state === 'OBSERVED' && Number.isFinite(endpointValue(e, endpoint))).map(e => ({ id: eventId(e), date: e.signalDate, value: endpointValue(e, endpoint) }));
}
function walkForward(spec, pop, res, cfg, E) {
  keysOnly(cfg, ['trainSize', 'validationSize', 'testSize', 'stepSize', 'mode', 'embargoDays', 'endpoint'], 'methods.WALK_FORWARD');
  const endpoint = cfg.endpoint || 'netReturn';
  const cal = pop.calendar.filter(d => d >= spec.window.from && d <= spec.window.to);
  const idx = new Map(pop.calendar.map((d, k) => [d, k]));
  const events = res.events.filter(e => e.state !== 'OBSERVED' || Number.isFinite(endpointValue(e, endpoint))).map(e => {
    const k = idx.get(e.signalDate), start = pop.calendar[Math.max(0, k - (cfg.lookbackBars || 66))];
    const end = (e.exitDate || e.expectedExitDate || e.signalDate) + DAY_END;
    return { id: eventId(e), decisionAt: e.signalDate + DAY_END, availableAt: e.signalDate + DAY_END, informationStart: start + 'T00:00:00Z', outcomeEnd: end < e.signalDate + DAY_END ? e.signalDate + DAY_END : end, outcomeAvailableAt: e.state === 'OBSERVED' ? end : null };
  });
  const config = { calendar: cal.map(d => d + DAY_END), trainSize: posInt(cfg.trainSize, 'trainSize'), validationSize: posInt(cfg.validationSize, 'validationSize'), testSize: posInt(cfg.testSize, 'testSize'),
    ...(cfg.stepSize ? { stepSize: cfg.stepSize } : {}), mode: cfg.mode || 'ROLLING', embargoDays: cfg.embargoDays ?? 0, asOf: spec.asOf + DAY_END, operationBudget: 100000000 };
  const partition = E.V.buildWalkForward(config, events);
  const values = new Map(res.events.filter(e => e.state === 'OBSERVED').map(e => [eventId(e), endpointValue(e, endpoint)]));
  const testIds = partition.folds.flatMap(f => f.test);
  const oos = E.V.aggregateOos(partition, testIds.map(id => ({ id, value: values.get(id) })));
  const excluded = {}; for (const f of partition.folds) for (const x of f.excluded) excluded[x.reason] = (excluded[x.reason] || 0) + 1;
  const foldMeans = partition.folds.map(f => { const v = f.test.map(id => values.get(id)); return { fold: f.id, test: f.bounds.test.map(x => x.slice(0, 10)), train: f.train.length, validation: f.validation.length, n: v.length, mean: mean(v) }; });
  return {
    WALK_FORWARD: { state: 'EXECUTED', result: { engine: E.V.VERSION, mode: config.mode, sizes: { train: config.trainSize, validation: config.validationSize, test: config.testSize, step: config.stepSize || config.testSize }, embargoDays: config.embargoDays, folds: partition.folds.length, excludedByReason: excluded, partitionHash: partition.resultHash, use: 'FIXED_RULE_NO_FITTING_PARTITION_MECHANICS' } },
    OUT_OF_SAMPLE: { state: 'EXECUTED', result: { endpoint, n: oos.n, mean: oos.mean, perFold: foldMeans, partitionHash: oos.partitionHash, resultHash: oos.resultHash, note: 'TEST_WINDOW_MEANS_OF_A_PRE_FIXED_RULE_NOT_AN_UNTOUCHED_HOLDOUT' } },
  };
}
function regimeMethod(spec, pop, ctx, observations, cfg, E) {
  keysOnly(cfg, ['lookbackBars', 'volatilityLookbackBars', 'trendBand', 'volatilityThreshold'], 'methods.MARKET_REGIME');
  if (!ctx.benchmark) fail('SPEC_INVALID', 'MARKET_REGIME requires the SPY benchmark');
  const bars = benchmarkBars(ctx, pop.calendar).map(b => ({ ...b, availableAt: b.date + DAY_END, sourceHash: ctx.benchmark.provenance.sourceBytesHash }));
  const reg = E.S.classifyRegimes({ asOf: spec.asOf, mode: 'PIT_AVAILABLE', lookbackBars: cfg.lookbackBars || 26, volatilityLookbackBars: cfg.volatilityLookbackBars || 13, trendBand: cfg.trendBand ?? 0, volatilityThreshold: cfg.volatilityThreshold || 0.2, annualization: 52, bars });
  const regimes = reg.regimes.map(r => ({ date: r.date, state: r.state + '/' + r.volatilityState, sourceHash: r.sourceHash, availableAt: r.availableAt }));
  const a = E.S.analyzeRegimes({ mode: 'PIT_AVAILABLE', regimes, observations });
  return { state: 'EXECUTED', result: { engine: 'research-studies.classifyRegimes+analyzeRegimes', mode: 'PIT_AVAILABLE', definition: 'SPY_WEEKLY_TREND_' + (cfg.lookbackBars || 26) + '_VOL_' + (cfg.volatilityLookbackBars || 13), regimeResultHash: reg.resultHash,
    states: a.states.map(s => ({ state: s.state, episodes: s.episodes, n: s.statistics.n, mean: s.statistics.mean, median: s.statistics.median ?? null, interval95: s.statistics.interval95 })), unmatched: a.unmatched.length, resultHash: a.resultHash } };
}
function eventMethod(spec, pop, ctx, cfg, E) {
  keysOnly(cfg, ['source', 'horizonBars'], 'methods.EVENT_DRIVEN');
  if ((cfg.source || 'TR_REGISTER_DIVIDEND_FILINGS') !== 'TR_REGISTER_DIVIDEND_FILINGS') fail('SPEC_INVALID', 'methods.EVENT_DRIVEN.source');
  const tr = trRegister();
  const listings = [], events = [];
  for (const l of pop.listings) {
    const t = tr.reg.titles.find(x => x.securityId === l.securityId); if (!t) continue;
    const el = engineListing(l); listings.push(el);
    for (const e of t.portfolioEvents) if (e.type === 'CASH_DIVIDEND' && e.informationAvailableAt.slice(0, 10) >= spec.window.from && e.informationAvailableAt.slice(0, 10) <= spec.window.to)
      events.push({ eventId: e.id, eventType: 'DIVIDEND_FILING_AVAILABLE', listingId: el.listingId, sourceHash: e.sourceHash, occurredAt: e.informationAvailableAt, publishedAt: e.informationAvailableAt, availableAt: e.informationAvailableAt });
  }
  if (!events.length) return { state: 'NOT_RUN', result: { reason: 'NO_TR_REGISTER_EVENTS_FOR_POPULATION_IN_WINDOW', register: TR_REGISTER } };
  const r = E.S.runEventStudy(studyBase(spec, pop, ctx, { listings, horizonBars: posInt(cfg.horizonBars || 4, 'methods.EVENT_DRIVEN.horizonBars'), events }));
  const obs = r.events.filter(e => e.state === 'OBSERVED'), ex = obs.filter(e => Number.isFinite(e.benchmarkExcess)).map(e => e.benchmarkExcess);
  return { state: 'EXECUTED', result: { engine: 'research-studies.runEventStudy', source: TR_REGISTER, registerSha256: tr.sha256, entryModel: r.entryModel, coverage: r.coverage, meanNet: r.statistics.mean, medianNet: r.statistics.median ?? null,
    interval95: r.statistics.interval95, meanBenchmarkExcess: mean(ex), resultHash: r.resultHash, scope: 'EVENT_STUDY_DESCRIPTIVE_NOT_A_TRADING_RULE' } };
}
function monteCarlo(spec, cfg, observations, model, E, provenanceHash, scope) {
  keysOnly(cfg, ['simulations', 'horizon', 'seed', 'blockLength'], 'methods.MONTE_CARLO');
  const input = { model, seed: cfg.seed || 20261029, simulations: posInt(cfg.simulations || 2000, 'simulations'), horizon: posInt(cfg.horizon || 52, 'horizon'), initialCapital: 1, observations, returnBasis: 'PRICE_RETURN',
    costs: { basis: 'ALREADY_NET', modelVersion: 'runner-net-of-engine-costs' }, provenance: { sourceKind: 'HISTORICAL_OBSERVED', sourceHash: provenanceHash, sourceVersion: VERSION, samplingUnit: model === 'TRADE_IID' ? 'NON_OVERLAPPING_TRADE' : 'REGULAR_PERIOD', scope }, percentiles: [0.05, 0.5, 0.95] };
  if (model === 'CIRCULAR_BLOCK') input.blockLength = posInt(cfg.blockLength || 13, 'blockLength');
  const r = E.MC.runMonteCarlo(input);
  const q = d => Object.fromEntries(d.quantiles.map(x => ['p' + Math.round(x.p * 100), x.value]));
  return { state: 'EXECUTED', result: { engine: E.MC.VERSION, model, simulations: input.simulations, horizon: input.horizon, seed: input.seed, blockLength: input.blockLength || null, sourceObservations: observations.length,
    totalReturn: q(r.distributions.totalReturn), maxDrawdown: q(r.distributions.maxDrawdown), inputHash: r.inputHash, scope: 'CONDITIONAL_RESAMPLING_NOT_A_FORECAST' } };
}
function nonOverlapping(events) {
  const obs = events.filter(e => e.state === 'OBSERVED').sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const out = []; let lastExit = '';
  for (const e of obs) if (e.entryDate >= lastExit && (!out.length || e.entryDate > out.at(-1).entryDate)) { out.push(e); lastExit = e.exitDate; }
  return out;
}
function sensitivity(spec, pop, ctx, E, cfg, evaluatePoint) {
  keysOnly(cfg, ['dimensions', 'endpoint', 'blockLength', 'replicates', 'seed', 'alpha'], 'methods.PARAMETER_SENSITIVITY');
  if (!plain(cfg.dimensions)) fail('SPEC_INVALID', 'methods.PARAMETER_SENSITIVITY.dimensions');
  const RR = req('scripts/quant/run-research.cjs');
  const baseline = {};
  for (const k of Object.keys(cfg.dimensions).sort()) baseline[k] = k === 'holdingPeriods' ? spec.engine.horizonBars : k === 'everySessions' ? (spec.engine.rebalance || {}).everySessions : spec.costs[k];
  const points = E.V.registerSensitivity({ id: spec.id + ':grid', ruleHash: sha(spec.engine), datasetHash: ctx.inputHash, evaluatorHash: 'pending', primaryEndpoint: cfg.endpoint || 'netReturn', registeredAt: spec.registeredAt, purpose: 'EXPLORATORY_ROBUSTNESS', dimensions: cfg.dimensions, baseline, alpha: cfg.alpha || 0.05 }).points;
  // Recorded grid: each point is evaluated by the SAME kind engine, then consumed through run-research's recorded evaluator.
  let results;
  // A grid point whose engine inference refuses (e.g. a sparse block bootstrap) leaves the grid unrecorded: NOT_RUN with the reason.
  try { results = points.map(p => ({ parameters: p, result: evaluatePoint(p) })); }
  catch (e) { if (!/EMPTY_BOOTSTRAP_SAMPLE|INTEGER_OUT_OF_RANGE|OBSERVATION_BUDGET|BUDGET/.test(String(e.message))) throw e; return { state: 'NOT_RUN', result: { reason: 'GRID_POINT_INFERENCE_REFUSED:' + String(e.message), points: points.length } }; }
  const rows = new Map(results.map(r => [E.V.hash(r.parameters), r.result]));
  const evaluatorHash = E.V.hash(RR.recordedSensitivityEvaluator(rows).toString());
  const registration = E.V.registerSensitivity({ id: spec.id + ':grid', ruleHash: sha(spec.engine), datasetHash: ctx.inputHash, evaluatorHash, primaryEndpoint: cfg.endpoint || 'netReturn', registeredAt: spec.registeredAt, purpose: 'EXPLORATORY_ROBUSTNESS', dimensions: cfg.dimensions, baseline, alpha: cfg.alpha || 0.05 });
  const r = RR.METHODS.sensitivity[1]({ results, registration, context: { datasetHash: ctx.inputHash, evaluatorHash, ruleHash: sha(spec.engine), executedAt: spec.registeredAt, holdout: false } });
  return { state: 'EXECUTED', result: { engine: 'research-validation.runSensitivity (recorded grid, run-research evaluator)', grid: r.rows.map(x => ({ parameters: x.parameters, n: x.n, estimate: x.estimate, ci: x.ci, pValue: x.pValue, adjustedPValue: x.adjustedPValue })),
    baseline: r.baseline.parameters, neighborhood: r.neighborhood, multiplicity: r.multiplicity, registrationHash: r.registrationHash, resultHash: r.resultHash, note: 'EXPLORATORY_ROBUSTNESS_NO_PARAMETER_SELECTED' } };
}

/* ----------------------------------------------------------- envelope */
function certificationDoc(ctx) {
  if (ctx.deps.certification) return ctx.deps.certification;
  return JSON.parse(fs.readFileSync(path.join(ROOT, CERTIFICATION_PATH), 'utf8'));
}
function publicSpec(spec) { return clone(spec); }
function augment(envelope, a, ctx) {
  const e = clone(envelope);
  if (a.methods) for (const [m, v] of Object.entries(a.methods)) { const i = e.methods.findIndex(x => x.method === m); e.methods[i] = { method: m, state: v.state, result: v.result ?? null }; }
  e.spec = { id: a.spec.id, version: a.spec.version || null, description: a.spec.description || null,
    parameters: { runner: VERSION, runnerSpecSchema: SPEC_SCHEMA, runnerSpec: publicSpec(a.spec), runnerSpecHash: a.specHash, inputHashes: a.inputHashes, inputHash: a.inputHash, kindPath: a.kindPath, adapterSpec: envelope.spec }, specHash: null };
  if (a.populationId) { e.identity.populationId = e.identity.scope === 'POPULATION' ? a.populationId : null; if (e.identity.scope === 'POPULATION') e.identity.populationHash = a.populationHash; }
  if (a.grain) e.period.grain = a.grain;
  if (a.periodAsOf) e.period.asOf = a.periodAsOf;
  if (a.dataQuality) for (const [k, v] of Object.entries(a.dataQuality)) e.dataQuality[k] = k === 'warnings' ? uniq([...(e.dataQuality.warnings || []), ...v]) : v;
  if (a.metricsExtra) for (const [k, v] of Object.entries(a.metricsExtra)) e.metrics[k] = plain(e.metrics[k]) ? { ...e.metrics[k], ...v } : v;
  e.limitations = uniq([...e.limitations, ...(a.limitations || []), NO_CLAIM]);
  if (a.productCertified) { e.status.state = 'PRODUCT_CERTIFIED'; e.status.certificationStatus = 'CERTIFIED'; }
  const sealed = Contract.seal(e);
  const check = Contract.validate(sealed, { certification: ctx.certDoc });
  if (!check.valid) fail('ENVELOPE_INVALID', check.errors.join(','));
  return sealed;
}
function preparedEnvelope(spec, ctx, missing, a) {
  const base = A.fromCertificationKind(ctx.certDoc, spec.kind, {});
  return augment(base, { ...a, periodAsOf: spec.asOf, limitations: ['STATE_B_PREPARED_DATA_LIMITED_ENGINE_READY', ...missing.map(m => 'MISSING_INPUT:' + m)] }, ctx);
}
// C only when the repository artifact certifies this kind, follows its gates, the run is A and the spec asks for it.
function productCertified(spec, ctx, researchState) {
  if (!(spec.status && spec.status.requestProductCertifiedState === true)) return false;
  const Cert = req('quant/engines/backtest-certification.js');
  const entry = Contract.certificationEntry(ctx.certDoc, spec.kind, 'KIND', null);
  const violations = Cert.certificationViolations(ctx.certDoc);
  if (!entry || entry.status !== 'CERTIFIED' || violations.length || researchState !== 'RESEARCH_EXECUTED') fail('PRODUCT_CERTIFIED_STATE_REFUSED', !entry ? 'NO_ENTRY' : entry.status !== 'CERTIFIED' ? entry.status : violations.length ? 'ARTIFACT_VIOLATES_GATES' : researchState);
  return true;
}

/* ------------------------------------------------------------- runner */
function codeHashes() { return Object.fromEntries(CODE_FILES.map(f => [f, shaFile(path.join(ROOT, f))])); }
// Per listing: the source file bytes hash (public series) or the register-bound points hash (private delisted series), plus
// the as-of truncation (first/last bar, count). Re-hashing every point would cost ~10 s on the full frame for no extra binding.
function listingInputHashes(pop) { return Object.fromEntries(pop.listings.map(l => [l.securityId, { listingId: l.doc.listingId, sourceBytesHash: l.doc.sourceBytesHash || null, registerPointsSha256: l.doc.sourceBytesHash ? null : l.doc.identityHash, first: l.doc.points[0][0], last: l.doc.points.at(-1)[0], bars: l.doc.points.length }])); }

function runBacktest(spec, options = {}) {
  const t0 = process.hrtime.bigint(), rss0 = process.memoryUsage().rss;
  validateSpec(spec);
  const ctx = { deps: options.deps || {}, privateDirs: { ...(options.privateDirs || {}) }, cacheDir: options.cacheDir || null, diagnostics: { populationCache: 'NOT_USED', resultCache: 'DISABLED' } };
  if (ctx.cacheDir) { fs.mkdirSync(ctx.cacheDir, { recursive: true }); if (insideRoot(ctx.cacheDir)) fail('CACHE_DIR_INSIDE_REPOSITORY'); }
  for (const [k, d] of Object.entries(ctx.privateDirs)) if (d && fs.existsSync(d) && insideRoot(k === 'factorPanel' ? path.dirname(d) : d)) fail('PRIVATE_DIR_INSIDE_REPOSITORY', k);
  const E = lazy();
  const sHash = specHash(spec);
  ctx.certDoc = certificationDoc(ctx);
  // A certification artifact whose statuses do not follow its own gates (spoof or stale edit) is never used.
  const certViolations = req('quant/engines/backtest-certification.js').certificationViolations(ctx.certDoc);
  if (certViolations.length) fail('CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT', certViolations[0]);
  const certSha = sha(ctx.certDoc);
  ctx.benchmark = spec.benchmark === 'SPY' || Object.keys(spec.methods || {}).includes('MARKET_REGIME') ? (ctx.deps.benchmark || E.B.load(ROOT)) : null;
  const pop = resolvePopulation(spec, ctx, E);
  const kindPath = { kind: spec.kind, engine: null, adapter: null, population: spec.population.profile };
  const inputHashes = { code: codeHashes(), certification: certSha, benchmark: ctx.benchmark ? ctx.benchmark.provenance.sourceBytesHash : null, population: null, listings: null, private: {} };
  const finishResult = (envelope, extras = {}) => {
    const body = { schemaVersion: RESULT_SCHEMA, runner: VERSION, kind: spec.kind, state: envelope.status.state, specHash: sHash, spec: publicSpec(spec), inputHashes, inputHash: sha(inputHashes), kindPath,
      envelope, envelopeHash: envelope.envelopeHash, population: extras.population || null, extras: extras.extras || null, pit: extras.pit || null, qa: extras.qa || null };
    const out = { ...body, resultHash: sha(body) };
    if (ctx.cacheFile) { fs.writeFileSync(ctx.cacheFile, JSON.stringify(out)); ctx.diagnostics.resultCache = 'MISS_WRITTEN'; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    Object.defineProperty(out, 'diagnostics', { value: { ...ctx.diagnostics, runtimeMs: Math.round(ms), rssMb: Math.round(process.memoryUsage().rss / 1e6), rssDeltaMb: Math.round((process.memoryUsage().rss - rss0) / 1e6) }, enumerable: false });
    return out;
  };
  if (pop.missing.length) {
    inputHashes.population = { profile: pop.profile, profileSpecHash: pop.profileSpecHash };
    return finishResult(preparedEnvelope(spec, ctx, pop.missing, { spec, specHash: sHash, inputHashes, inputHash: sha(inputHashes), kindPath }), { population: { profile: pop.profile, missing: pop.missing, excluded: pop.excluded || [] } });
  }
  inputHashes.population = { profile: pop.profile, profileSpecHash: pop.profileSpecHash, populationHash: pop.summary.populationHash, calendarHash: pop.summary.inputHashes.calendarHash, calendarLength: pop.summary.inputHashes.calendarLength,
    sourceManifestHash: pop.summary.inputHashes.sourceManifestHash, masterHash: pop.summary.inputHashes.masterHash, registers: pop.summary.inputHashes.registers, pointsHashRoot: pop.summary.inputHashes.pointsHashRoot };
  inputHashes.listings = listingInputHashes(pop);
  if (pop.listings.length > 100) inputHashes.listings = { count: pop.listings.length, root: sha(inputHashes.listings), rule: 'sha256(canonical map securityId -> {listingId, sourceBytesHash|registerPointsSha256, first, last, bars})' };
  if (pop.listings.some(l => l.securityId.startsWith('dl_'))) inputHashes.private.delisted = { register: pop.summary.inputHashes.registers.delistedRegister, listings: pop.listings.filter(l => l.securityId.startsWith('dl_')).map(l => [l.securityId, l.doc.identityHash]) };
  if (spec.kind === 'FACTOR_RANKING_BACKTEST' && ctx.privateDirs.factorPanel && fs.existsSync(ctx.privateDirs.factorPanel)) inputHashes.private.factorPanel = shaFile(ctx.privateDirs.factorPanel);
  ctx.inputHash = sha(inputHashes);
  // Result cache (private, optional): spec hash + input hashes (incl. code) -> identical result.
  // Injected dependencies (test seam) disable the cache unless they carry an explicit cacheTag that enters the key.
  const cacheKey = sha({ v: VERSION, specHash: sHash, inputHash: ctx.inputHash, deps: options.deps ? options.deps.cacheTag || null : null });
  const cacheFile = ctx.cacheDir && (!options.deps || typeof options.deps.cacheTag === 'string') ? path.join(ctx.cacheDir, 'result-' + cacheKey + '.json') : null;
  ctx.cacheFile = cacheFile;
  if (cacheFile && fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    ctx.diagnostics.resultCache = 'HIT';
    const out = { ...cached };
    Object.defineProperty(out, 'diagnostics', { value: { ...ctx.diagnostics, runtimeMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e6), rssMb: Math.round(process.memoryUsage().rss / 1e6) }, enumerable: false });
    return out;
  }
  const popInfo = { profile: pop.profile, populationHash: pop.summary.populationHash, frameSize: pop.summary.frameSize, calendar: { first: pop.calendar[0], last: pop.calendar.at(-1), length: pop.calendar.length },
    listings: pop.listings.map(l => ({ securityId: l.securityId, ticker: l.ticker, listingId: l.doc.listingId, first: l.doc.points[0][0], last: l.doc.points.at(-1)[0], corporateActionQuality: l.doc.corporateActionQuality ? l.doc.corporateActionQuality.status : null,
      splitsInWindow: ((l.doc.corporateActions && l.doc.corporateActions.splits) || []).filter(s => s[0] >= spec.window.from && s[0] <= spec.window.to), lifecycle: l.doc.listingLifecycle ? { status: l.doc.listingLifecycle.status, lastTradeDate: l.doc.listingLifecycle.lastTradeDate || null, terminalKind: l.doc.listingLifecycle.terminal ? l.doc.listingLifecycle.terminal.kind : null, terminalScenarios: l.doc.listingLifecycle.terminal ? l.doc.listingLifecycle.terminal.scenarios || null : null } : null })),
    excluded: pop.excluded, warnings: pop.summary.dataQuality.warnings };
  // Large cohorts: listing details are replaced by counts and a hash of the id list (the per-listing input hashes stay complete).
  const LIST_LIMIT = 100;
  const countBy = (list, f) => list.reduce((a, x) => { const k = String(f(x)); a[k] = (a[k] || 0) + 1; return a; }, {});
  const caListings = popInfo.listings.map(l => ({ securityId: l.securityId, quality: l.corporateActionQuality, splitsInWindow: l.splitsInWindow }));
  if (popInfo.listings.length > LIST_LIMIT) popInfo.listings = { count: popInfo.listings.length, idsHash: sha(popInfo.listings.map(l => l.securityId)), corporateActionQuality: countBy(popInfo.listings, l => l.corporateActionQuality), withSplitsInWindow: popInfo.listings.filter(l => l.splitsInWindow.length).length, withLifecycle: popInfo.listings.filter(l => l.lifecycle).length };
  if (popInfo.excluded.length > LIST_LIMIT) popInfo.excluded = { count: popInfo.excluded.length, byReason: countBy(popInfo.excluded, x => x.reason) };
  const popWarnings = uniq([...pop.summary.dataQuality.warnings, ...pop.listings.flatMap(l => l.doc.warnings || [])]);
  const commonDq = { warnings: popWarnings, corporateActions: { contract: 'LOADER_CORPORATE_ACTION_EVIDENCE (ADR-002 split-adjusted weekly closes)', listings: caListings.length > LIST_LIMIT ? { count: caListings.length, quality: countBy(caListings, l => l.quality), withSplitsInWindow: caListings.filter(l => l.splitsInWindow.length).length } : caListings },
    survivorship: { state: pop.listings.some(l => l.securityId.startsWith('dl_')) ? 'INCLUDES_PRIVATE_DELISTED_SERIES' : 'CONDITIONAL_CURRENT_SURVIVOR_COHORT', control: 'population profile ' + pop.profile + ' (' + pop.summary.populationHash.slice(0, 16) + ')' } };
  const terminals = pop.listings.filter(l => l.doc.listingLifecycle && l.doc.listingLifecycle.terminal).map(l => ({ securityId: l.securityId, lifecycle: { lastTradeDate: l.doc.listingLifecycle.lastTradeDate || null, terminalKind: l.doc.listingLifecycle.terminal.kind, terminalScenarios: l.doc.listingLifecycle.terminal.scenarios || null } }));
  if (terminals.length) commonDq.terminal = { state: 'SOURCED_TERMINAL_CLASS_CENSORS_EVENTS_AFTER_LAST_TRADE', listings: terminals.map(l => ({ securityId: l.securityId, lastTradeDate: l.lifecycle.lastTradeDate, terminalKind: l.lifecycle.terminalKind, terminalScenarios: l.lifecycle.terminalScenarios })) };
  const populationId = 'runner:' + pop.profile + ':' + sHash.slice(0, 16);
  const populationHash = sha({ populationHash: pop.summary.populationHash, listings: pop.listings.map(l => l.securityId), window: spec.window, asOf: spec.asOf });
  const common = { spec, specHash: sHash, inputHashes, inputHash: ctx.inputHash, kindPath, populationId, populationHash, dataQuality: commonDq, grain: 'WEEKLY' };
  const methodsCfg = spec.methods || {};
  const maxBar = Math.max(...pop.listings.map(l => Date.parse(l.doc.points.at(-1)[0])));
  const pit = { asOf: spec.asOf, latestInputBar: new Date(maxBar).toISOString().slice(0, 10), inputsAfterAsOf: pop.listings.reduce((n, l) => n + l.doc.points.filter(p => p[0] > spec.asOf).length, 0) };

  /* ---- portfolio kinds ---- */
  if (spec.kind === 'STRATEGY_BACKTEST' || (spec.kind === 'SAME_STOCK_REPLAY' && spec.engine.variant === 'REAL_WEEKLY_LEDGER')) {
    let raw, envelope, methods = {}, extras = {}, qa = {};
    if (spec.kind === 'STRATEGY_BACKTEST') {
      if (spec.engine.variant === 'PROFILE') return finishResult(preparedEnvelope(spec, ctx, ['PROFILE_TARGETS_REQUIRE_PIT_FACTOR_SNAPSHOTS_WITH_ROW_AVAILABILITY (research-portfolio.buildProfileTargets)', 'HISTORICAL_OBSERVED_PROVENANCE_EVIDENCE_HASHES (identity, population, corporate actions, lifecycle, license)'], common), { population: popInfo });
      const built = strategyInput(spec, pop, ctx, E);
      if (built.missing) return finishResult(preparedEnvelope(spec, ctx, built.missing, common), { population: popInfo });
      raw = E.P.runPortfolio(built.input);
      kindPath.engine = 'research-portfolio.runPortfolio + buildSchedule(' + built.schedule.frequency + (built.schedule.everySessions ? ',' + built.schedule.everySessions : '') + ')';
      kindPath.adapter = 'fromPortfolio';
      envelope = A.fromPortfolio(raw, { kind: 'STRATEGY_BACKTEST', certification: ctx.certDoc, benchmarkId: built.benchmarkId, asOf: spec.asOf, specId: spec.id });
      const metricsDoc = E.M.computeMetrics(E.M.fromPortfolio(raw));
      extras.metricsDetail = metricsDoc;
      const { calendarYears: _cy, ...benchStats } = metricsDoc.benchmark || {};
      const metricsExtra = { benchmark: { pathStatistics: benchStats }, excess: { sharpeRiskFreeZero: metricsDoc.risk.sharpe, riskFreeAssumption: metricsDoc.assumptions.riskFree, metricsEngine: E.M.VERSION } };
      if (spec.engine.dividends === 'TR_REGISTER') {
        const prBuilt = strategyInput(spec, pop, ctx, E, { priceOnly: true });
        const pr = E.P.runPortfolio(prBuilt.input);
        metricsExtra.excess.versusPriceOnly = { totalReturnWithDividends: raw.metrics.cumulativeReturn, priceOnlyTotalReturn: pr.metrics.cumulativeReturn, dividendContribution: raw.metrics.cumulativeReturn - pr.metrics.cumulativeReturn,
          cagrWithDividends: raw.metrics.cagr, priceOnlyCagr: pr.metrics.cagr, priceOnlyResultHash: pr.resultHash, dividendEventsApplied: raw.eventLedger.filter(x => x.type === 'CASH_DIVIDEND' && x.entitlementUnits > 0).length, openReceivables: raw.openReceivables.length };
        extras.trWindows = built.trWindows;
        inputHashes.private.trRegister = trRegister().sha256;
      }
      methods.PORTFOLIO_REBALANCING = { state: 'EXECUTED', result: { engine: E.P.VERSION, rebalances: raw.rebalances.length, skipped: raw.rebalances.filter(r => r.skipped).length, oneWayTurnoverSum: raw.metrics.oneWayTurnoverSum, schedule: built.schedule } };
      qa.portfolio = { input: { sessions: built.input.sessions.map(s => s.date), initialCapital: built.input.initialCapital, costs: built.input.costs, listings: built.input.listings.map(l => ({ listingId: l.listingId, events: l.events.length })), targets: built.input.targets.map(t => ({ decisionDate: t.decisionDate, executionDate: t.executionDate, weights: t.weights })), withDividends: spec.engine.dividends === 'TR_REGISTER' } };
      common.metricsExtra = metricsExtra; common.grain = 'WEEKLY';
      if (methodsCfg.PARAMETER_SENSITIVITY) methods.PARAMETER_SENSITIVITY = sensitivity(spec, pop, ctx, E, methodsCfg.PARAMETER_SENSITIVITY, p => {
        const b = strategyInput(spec, pop, ctx, E, { costs: { feeBps: p.feeBps ?? spec.costs.feeBps, slippageBps: p.slippageBps ?? spec.costs.slippageBps }, engine: p.everySessions ? { rebalance: { frequency: 'sessions', everySessions: p.everySessions } } : {} });
        const r = E.P.runPortfolio(b.input), eq = r.equity;
        const rows = eq.slice(1).map((x, i) => ({ id: x.date, date: x.date, value: (x.value / eq[i].value - 1) - (x.benchmark / eq[i].benchmark - 1) }));
        return blockInference(E, eq.slice(1).map(x => x.date), rows, methodsCfg.PARAMETER_SENSITIVITY);
      });
    } else {
      if (pop.profile !== 'PRODUCT_DEFAULT' || pop.listings.length !== 1) fail('SPEC_INVALID', 'REAL_WEEKLY_LEDGER requires profile PRODUCT_DEFAULT and one listing');
      const W = req('scripts/quant/run-real-weekly-backtest.cjs');
      raw = W.run(pop.listings[0].doc, { period: spec.engine.period || 'MAX', asOf: spec.asOf, benchmark: ctx.benchmark || E.B.load(ROOT) });
      kindPath.engine = 'run-real-weekly-backtest.run (NEW_52W_HIGH, one funded position at a time)'; kindPath.adapter = 'fromRealWeeklyLedger';
      envelope = A.fromRealWeeklyLedger(raw, { kind: 'SAME_STOCK_REPLAY', certification: ctx.certDoc });
      const vals = [raw.input.initialCapital, ...raw.equity.map(e => e.value)];
      qa.ledger = { trades: raw.trades.map(t => ({ signalDate: t.signalDate, entryDate: t.entryDate, exitDate: t.exitDate, entryPrice: t.entryPrice, exitPrice: t.exitPrice, netReturn: t.netReturn })), costs: raw.input.costs };
      extras.metricsDetail = E.M.computeMetrics({ initialCapital: raw.input.initialCapital, rows: raw.equity.map(e => ({ date: e.date, value: e.value, benchmark: e.benchmark })) });
      common.metricsExtra = { excess: { sharpeRiskFreeZero: extras.metricsDetail.risk.sharpe, metricsEngine: E.M.VERSION } };
      void vals;
    }
    if (methodsCfg.MONTE_CARLO) {
      if (spec.kind === 'STRATEGY_BACKTEST') {
        const eq = raw.equity, obs = eq.slice(1).map((x, i) => ({ date: x.date, return: x.value / eq[i].value - 1 }));
        methods.MONTE_CARLO = monteCarlo(spec, methodsCfg.MONTE_CARLO, obs, 'CIRCULAR_BLOCK', E, raw.resultHash, 'weekly net portfolio returns of the runPortfolio ledger');
      } else {
        const obs = raw.trades.map(t => ({ date: t.entryDate, return: t.netReturn }));
        methods.MONTE_CARLO = obs.length >= 2 ? monteCarlo(spec, methodsCfg.MONTE_CARLO, obs, 'TRADE_IID', E, raw.resultHash, 'completed non-overlapping ledger trades') : { state: 'NOT_RUN', result: { reason: 'FEWER_THAN_TWO_COMPLETED_TRADES' } };
      }
    }
    if (methodsCfg.MARKET_REGIME) {
      const eq = raw.equity, obs = eq.slice(1).map((x, i) => ({ signalDate: eq[i].date, netReturn: x.value / eq[i].value - 1, listingId: 'PORTFOLIO', issuerId: 'PORTFOLIO', decisionAt: eq[i].date + DAY_END }));
      methods.MARKET_REGIME = regimeMethod(spec, pop, ctx, obs, methodsCfg.MARKET_REGIME, E);
    }
    if (methodsCfg.EVENT_DRIVEN) methods.EVENT_DRIVEN = eventMethod(spec, pop, ctx, methodsCfg.EVENT_DRIVEN, E);
    qa.equity = { initialCapital: raw.initialCapital || raw.input.initialCapital };
    const env = augment(envelope, { ...common, methods, limitations: ['RUNNER_COMPOSED_EXISTING_ENGINES', ...(spec.engine.dividends === 'TR_REGISTER' ? ['DIVIDENDS_FROM_TR_REGISTER_CASH_CREDITED_AT_PAY_DATE_NOT_REINVESTED', 'BENCHMARK_ZERO_RATE_CASH_TOTAL_RETURN_BASIS'] : [])],
      productCertified: productCertified(spec, ctx, envelope.status.state) }, ctx);
    return finishResult(env, { population: popInfo, extras, pit, qa });
  }

  /* ---- per-event kinds ---- */
  let run;
  if (spec.kind === 'SETUP_BACKTEST') run = runSetup(spec, pop, ctx, E);
  else if (spec.kind === 'FACTOR_RANKING_BACKTEST') run = runFactor(spec, pop, ctx, E);
  else run = runPerEventKind(spec, pop, ctx, E);
  if (run.missing) return finishResult(preparedEnvelope(spec, ctx, run.missing, common), { population: popInfo });
  if (run.replayHashes) inputHashes.private.setupReplay = run.replayHashes;
  if (run.panelSha256) inputHashes.private.factorPanel = run.panelSha256;
  ctx.inputHash = sha(inputHashes); common.inputHash = ctx.inputHash;
  kindPath.engine = run.path; kindPath.adapter = 'fromResearchStudy';
  const res = windowed(run.raw, spec.window, E.S);
  const envelope = A.fromResearchStudy(res, { kind: spec.kind, certification: ctx.certDoc });
  const methods = {}, extras = { engineResultHash: run.raw.resultHash, engineEvents: run.raw.events.length, windowEvents: res.events.length };
  if (run.excluded && run.excluded.length) extras.kindExcluded = run.excluded;
  const limitations = ['RUNNER_COMPOSED_EXISTING_ENGINES', 'WINDOWED_VIEW_OF_ENGINE_RUN_SIGNAL_DATES_IN_SPEC_WINDOW'];
  if (spec.kind === 'SETUP_BACKTEST') {
    limitations.push('EVIDENCE_KIND_RECONSTRUCTION_NOT_PUBLISHED_STATE_EVIDENCE', 'RECONSTRUCTED_SETUP_STATES_CANNOT_SATISFY_PUBLISHED_ONLY_GATE');
    methods.OUT_OF_SAMPLE = { state: 'NOT_RUN', result: { reason: 'RECONSTRUCTION_IS_NOT_OOS_EVIDENCE', certificationPathSetupOos: setupOosFromCertificationPath(E) } };
  }
  if (spec.kind === 'FACTOR_RANKING_BACKTEST') {
    limitations.push('EVIDENCE_KIND_RECONSTRUCTION_PRIVATE_V10_PIT_PANEL', 'PRIVATE_DATA_REQUIRED');
    const periods = res.periods || [];
    const sp = periods.map(p => p.spearmanObservedOnly).filter(Number.isFinite), tmb = periods.map(p => p.topMinusBottom).filter(Number.isFinite);
    common.metricsExtra = { perEvent: { factor: { factorId: spec.engine.factorId, rankDates: periods.length, meanSpearmanObservedOnly: mean(sp), spearmanDates: sp.length, meanTopMinusBottomCompleteCohort: mean(tmb), topMinusBottomDates: tmb.length, buckets: spec.engine.buckets || 5 } } };
  }
  if (spec.kind === 'SAME_STOCK_REPLAY') limitations.push('SINGLE_LISTING_RULE_NOT_MARKET_EVIDENCE');
  if (methodsCfg.WALK_FORWARD || methodsCfg.OUT_OF_SAMPLE) {
    const cfg = methodsCfg.WALK_FORWARD || methodsCfg.OUT_OF_SAMPLE;
    let wf;
    // Only the engine's own operation budgets are turned into NOT_RUN (with the reason); every other error propagates.
    try { wf = walkForward(spec, pop, res, cfg, E); } catch (e) { if (!/BUDGET/.test(String(e.message))) throw e; const nr = { state: 'NOT_RUN', result: { reason: String(e.message), events: res.events.length } }; wf = { WALK_FORWARD: nr, OUT_OF_SAMPLE: nr }; }
    if (spec.kind === 'SETUP_BACKTEST') methods.WALK_FORWARD = wf.WALK_FORWARD;
    else Object.assign(methods, wf);
  }
  if (methodsCfg.MARKET_REGIME) {
    const obs = res.events.filter(e => e.state === 'OBSERVED').map(e => ({ signalDate: e.signalDate, netReturn: e.netReturn, listingId: e.listingId, issuerId: e.issuerId, decisionAt: e.signalDate + DAY_END, timeCluster: e.signalDate }));
    methods.MARKET_REGIME = obs.length ? regimeMethod(spec, pop, ctx, obs, methodsCfg.MARKET_REGIME, E) : { state: 'NOT_RUN', result: { reason: 'NO_OBSERVED_OUTCOMES' } };
  }
  if (methodsCfg.EVENT_DRIVEN) methods.EVENT_DRIVEN = eventMethod(spec, pop, ctx, methodsCfg.EVENT_DRIVEN, E);
  if (methodsCfg.MONTE_CARLO) {
    if (spec.kind === 'SAME_STOCK_REPLAY') {
      const nov = nonOverlapping(res.events);
      methods.MONTE_CARLO = nov.length >= 2 ? monteCarlo(spec, methodsCfg.MONTE_CARLO, nov.map(e => ({ date: e.entryDate, return: e.netReturn })), 'TRADE_IID', E, res.resultHash, 'greedy non-overlapping observed replay events') : { state: 'NOT_RUN', result: { reason: 'FEWER_THAN_TWO_NON_OVERLAPPING_OUTCOMES' } };
    }
  }
  if (methodsCfg.PARAMETER_SENSITIVITY) {
    const cfg = methodsCfg.PARAMETER_SENSITIVITY, endpoint = cfg.endpoint || 'netReturn';
    const cal = pop.calendar.filter(d => d >= spec.window.from && d <= spec.window.to);
    methods.PARAMETER_SENSITIVITY = sensitivity(spec, pop, ctx, E, cfg, p => {
      const r = runPerEventKind(spec, pop, ctx, E, { engine: p.holdingPeriods ? { horizonBars: p.holdingPeriods } : {}, costs: { feeBps: p.feeBps ?? spec.costs.feeBps, slippageBps: p.slippageBps ?? spec.costs.slippageBps } });
      const w = windowed(r.raw, spec.window, E.S);
      return blockInference(E, cal, perEventRows(w.events, endpoint), cfg);
    });
  }
  if (spec.kind === 'SIGNAL_BACKTEST' && spec.engine.funded) {
    const f = runFunded(spec, pop, ctx, E);
    methods.PORTFOLIO_REBALANCING = f.method;
    extras.funded = f.extras;
    if (methodsCfg.MONTE_CARLO) {
      const eq = f.raw.equity, obs = eq.slice(1).map((x, i) => ({ date: x.date, return: x.value / eq[i].value - 1 }));
      methods.MONTE_CARLO = monteCarlo(spec, methodsCfg.MONTE_CARLO, obs, 'CIRCULAR_BLOCK', E, f.raw.resultHash, 'weekly net returns of the funded signal ledger');
    }
  } else if (spec.kind === 'SIGNAL_BACKTEST' && methodsCfg.MONTE_CARLO) methods.MONTE_CARLO = { state: 'NOT_RUN', result: { reason: 'MONTE_CARLO_NEEDS_THE_FUNDED_LEDGER_OVERLAPPING_EVENTS_ARE_NOT_IID' } };
  if (spec.kind === 'SIGNAL_BACKTEST' && methodsCfg.PORTFOLIO_REBALANCING && !spec.engine.funded) fail('SPEC_INVALID', 'PORTFOLIO_REBALANCING for SIGNAL_BACKTEST requires engine.funded');
  const pitEvents = { entryNotAfterSignal: res.events.filter(e => e.entryDate && e.entryDate <= e.signalDate).length, exitAfterAsOf: res.events.filter(e => e.exitDate && e.exitDate > spec.asOf).length, signalsAfterWindow: res.events.filter(e => e.signalDate > spec.window.to).length };
  const qa = { events: res.events.map(e => ({ securityId: e.issuerId, listingId: e.listingId, ruleId: e.ruleId || null, signalDate: e.signalDate, entryDate: e.entryDate || null, exitDate: e.exitDate || null, state: e.state,
    grossReturn: e.completed ? e.grossReturn : null, netReturn: e.completed ? e.netReturn : null, benchmarkReturn: e.completed ? e.benchmarkReturn : null, maxDrawdown: e.completed ? e.maxDrawdown : null })), costs: spec.costs };
  const env = augment(envelope, { ...common, methods, limitations, productCertified: productCertified(spec, ctx, envelope.status.state) }, ctx);
  return finishResult(env, { population: popInfo, extras, pit: { ...pit, ...pitEvents }, qa });
}

// Funded long-only variant of a signal rule: V10 schedule/input functions (signal-study.cjs), unchanged ledger.
function runFunded(spec, pop, ctx, E) {
  const K = req('scripts/quant/v10/studies/common.cjs'), SS = req('scripts/quant/v10/studies/signal-study.cjs');
  const f = spec.engine.funded;
  keysOnly(f, ['rule', 'maxPositions', 'holdingWeeks'], 'engine.funded');
  const rule = E.Signal.RULE_BY_ID[f.rule]; if (!rule) fail('SPEC_INVALID', 'engine.funded.rule');
  const fr = { frame: pop.listings.map(l => l.securityId), docs: new Map(pop.listings.map(l => [l.securityId, l.doc])), calendar: pop.calendar };
  const panel = K.buildPanel(fr);
  const flags = SS.detectionFlags(panel, [rule]);
  const fctx = { fr, panel, studyCalendar: pop.calendar.filter(d => d >= spec.window.from && d <= spec.window.to), benchmark: { byDate: ctx.benchmark.byDate, provenance: ctx.benchmark.provenance }, manifestHash: pop.summary.populationHash };
  const F = { holdingWeeks: posInt(f.holdingWeeks, 'engine.funded.holdingWeeks'), maxPositions: posInt(f.maxPositions, 'engine.funded.maxPositions') };
  const sch = SS.fundedSchedule(fctx, flags, f.rule, F);
  const input = SS.fundedInput(fctx, sch, { feeBps: spec.costs.feeBps, slippageBps: spec.costs.slippageBps }, F);
  const raw = E.P.runPortfolio(input);
  const md = E.M.computeMetrics(E.M.fromPortfolio(raw));
  return { raw, method: { state: 'EXECUTED', result: { engine: E.P.VERSION + ' via signal-study.fundedSchedule/fundedInput', rule: f.rule, maxPositions: F.maxPositions, holdingWeeks: F.holdingWeeks, episodes: sch.episodes.length, skippedNoFreeSlot: sch.skippedNoSlot,
    from: raw.equity[0].date, to: raw.equity.at(-1).date, totalReturn: raw.metrics.cumulativeReturn, cagr: raw.metrics.cagr, maxDrawdown: raw.metrics.maxDrawdown, volatility: md.risk.annualizedVolatility, sharpeRiskFreeZero: md.risk.sharpe,
    benchmark: md.benchmark ? { id: 'SPY_PRICE_RETURN', totalReturn: md.benchmark.totalReturn ?? null, beta: md.benchmark.beta ?? null, trackingError: md.benchmark.trackingError ?? null } : null, averageCashShare: md.exposure.averageCashShare, resultHash: raw.resultHash } },
    extras: { metricsDetail: md, episodes: sch.episodes.length } };
}

// Test seam: the windowed per-event engine result for a spec (override.untrimmed disables the signal history trim).
function kindEvents(spec, options = {}, override = {}) {
  validateSpec(spec);
  const ctx = { deps: options.deps || {}, privateDirs: { ...(options.privateDirs || {}) }, cacheDir: options.cacheDir || null, diagnostics: {} };
  const E = lazy();
  ctx.benchmark = spec.benchmark === 'SPY' ? (ctx.deps.benchmark || E.B.load(ROOT)) : null;
  const pop = resolvePopulation(spec, ctx, E);
  if (pop.missing.length) fail('POPULATION_MISSING', pop.missing.join(','));
  return windowed(runPerEventKind(spec, pop, ctx, E, override).raw, spec.window, E.S);
}

module.exports = { kindEvents, VERSION, SPEC_SCHEMA, RESULT_SCHEMA, METHOD_FIT, ENGINE_KEYS, validateSpec, specHash, runBacktest, windowed, canonical, hash: sha, CERTIFICATION_PATH };
