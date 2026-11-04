#!/usr/bin/env node
'use strict';
// Musterportfolios nach dem VU-Portfolio-Standard, historisch auf rekonstruierter PIT-Basis (Forschung, nicht zertifiziert).
//
//   node scripts/quant/portfolio/model-portfolios.cjs --out FILE
//        [--fundamentals DIR]   PIT-Bündel (Lesart ORIGINAL) aus build_pit_fundamentals.py; ohne: committete Consumer-Bündel
//                               (zuletzt eingereichte Fassung, stark verzögert; Kennzeichnung LAGGED_LATEST_FILING)
//        [--work-dir DIR]       kanonische Tagesbalken DIR/tiingo/daily/<securityId>.json (R2, nur im Workflow): Gesamtrendite,
//                               Rohschluss, Tagesumsatz. Ohne: committete Wochenreihen (nur Kurs, nur heutige Titel).
//        [--delisted-dir DIR]   private V13-Reihen delisteter Titel (R2-Archiv, nur im Workflow; verlangt --work-dir)
//        [--profiles a,b] [--weighting RISK_PARITY] [--window 2012-01-01,2026-10-31] [--limit N] [--sensitivity]
//
// Liest nur; schreibt ausschließlich --out. Kein Anbieterabruf.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const Returns = require(path.join(ROOT, 'quant/engines/return-series.js'));
const Codec = require(path.join(ROOT, 'vorsorge/engines/series-codec.js'));
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const Risk = require(path.join(ROOT, 'quant/engines/portfolio-risk.cjs'));
const VERSION = 'vu-model-portfolios-1.0.0';

const DEFAULT_PROFILES = ['quality-compounder', 'momentum-leader', 'garp', 'defensive-quality', 'value-momentum'];
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');

function args(argv) {
  const a = { profiles: DEFAULT_PROFILES, weighting: 'RISK_PARITY', window: ['2012-01-01', '2026-10-31'], limit: 0, sensitivity: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--out') { a.out = v; i++; } else if (k === '--fundamentals') { a.fundamentals = v; i++; } else if (k === '--work-dir') { a.workDir = v; i++; }
    else if (k === '--delisted-dir') { a.delistedDir = v; i++; } else if (k === '--profiles') { a.profiles = v.split(','); i++; } else if (k === '--weighting') { a.weighting = v; i++; }
    else if (k === '--window') { a.window = v.split(','); i++; } else if (k === '--limit') { a.limit = Number(v); i++; } else if (k === '--sensitivity') a.sensitivity = true;
    else if (k === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 13).join('\n')); process.exit(0); }
    else throw Error('UNKNOWN_ARG ' + k);
  }
  if (!a.out) throw Error('--out required');
  if (path.resolve(a.out).startsWith(path.join(ROOT, 'quant/data'))) throw Error('--out darf nicht unter quant/data liegen');
  if (a.delistedDir && !a.workDir) throw Error('--delisted-dir verlangt --work-dir (Gesamtrendite-Basis)');
  return a;
}

// ISO-Woche als Schlüssel (Wochenreihen verschiedener Quellen datieren den letzten Handelstag der Woche).
function isoWeek(d) {
  const t = new Date(d + 'T00:00:00Z'), day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const y = t.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  return y + '-W' + String(1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0');
}

// Fama/French-12-Branchen aus SIC (Definition: Kenneth R. French Data Library, "12 Industry Portfolios").
const FF12 = [
  ['NoDur', [[100, 999], [2000, 2399], [2700, 2749], [2770, 2799], [3100, 3199], [3940, 3989]]],
  ['Durbl', [[2500, 2519], [2590, 2599], [3630, 3659], [3710, 3711], [3714, 3714], [3716, 3716], [3750, 3751], [3792, 3792], [3900, 3939], [3990, 3999]]],
  ['Manuf', [[2520, 2589], [2600, 2699], [2750, 2769], [3000, 3099], [3200, 3569], [3580, 3629], [3700, 3709], [3712, 3713], [3715, 3715], [3717, 3749], [3752, 3791], [3793, 3799], [3830, 3839], [3860, 3899]]],
  ['Enrgy', [[1200, 1399], [2900, 2999]]],
  ['Chems', [[2800, 2829], [2840, 2899]]],
  ['BusEq', [[3570, 3579], [3660, 3692], [3694, 3699], [3810, 3829], [7370, 7379]]],
  ['Telcm', [[4800, 4899]]],
  ['Utils', [[4900, 4949]]],
  ['Shops', [[5000, 5999], [7200, 7299], [7600, 7699]]],
  ['Hlth', [[2830, 2839], [3693, 3693], [3840, 3859], [8000, 8099]]],
  ['Money', [[6000, 6999]]],
];
function ff12(sic) {
  const n = Number(sic);
  if (!Number.isInteger(n) || n <= 0) return null;
  for (const [name, ranges] of FF12) if (ranges.some(([a, b]) => n >= a && n <= b)) return name;
  return 'Other';
}

function loadBenchmark(basis) {
  const file = path.join(ROOT, 'vorsorge/data/series/SPY.json'), bytes = fs.readFileSync(file);
  const doc = JSON.parse(bytes), part = basis === 'TOTAL_RETURN' ? doc.total : doc.price;
  if (doc.symbol !== 'SPY' || !part || !part.weekly) throw Error('BENCHMARK_SOURCE_INVALID');
  if (basis === 'TOTAL_RETURN' && doc.totalReturn.state !== 'TOTAL_RETURN_RECONSTRUCTED') throw Error('BENCHMARK_TR_UNAVAILABLE');
  return { points: Codec.decode(part.weekly), label: basis === 'TOTAL_RETURN' ? 'SPY_TOTAL_RETURN_DIVIDENDS_REINVESTED' : 'SPY_PRICE_RETURN', sourceHash: sha(bytes), file: 'vorsorge/data/series/SPY.json' };
}

function sicIndex(fundIndex) {
  const bySecurity = new Map();
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/sic-peer-taxonomy-v1.json'), 'utf8'));
  const c = Object.fromEntries(tax.rowColumns.map((k, i) => [k, i]));
  for (const r of tax.rows) if (r[c.sic4]) bySecurity.set(r[c.securityId], r[c.sic4]);
  if (fundIndex) for (const e of Object.values(fundIndex.issuers)) if (e.sic) for (const id of e.securityIds) if (!bySecurity.has(id)) bySecurity.set(id, e.sic);
  return bySecurity;
}

function loadBundles(dir) {
  const bySecurity = new Map();
  const files = fs.readdirSync(dir).filter(f => /^CIK\d{10}\.json$/.test(f));
  for (const f of files) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const id of b.securityIds || []) bySecurity.set(id, b);
  }
  return { bySecurity, files: files.length };
}

function buildPanel(a) {
  const basis = a.workDir ? 'TOTAL_RETURN' : 'PRICE_RETURN';
  const bench = loadBenchmark(basis);
  const calendar = bench.points.map(p => p[0]), T = calendar.length;
  const weekIdx = new Map(calendar.map((d, i) => [isoWeek(d), i]));
  const levels = bench.points.map(p => p[1]);
  const fundDir = a.fundamentals || path.join(ROOT, 'quant/data/sec/consumer');
  const fundIndex = a.fundamentals && fs.existsSync(path.join(a.fundamentals, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(a.fundamentals, 'index.json'), 'utf8')) : null;
  const bundles = loadBundles(fundDir), sics = sicIndex(fundIndex);
  const securities = [], counts = { candidates: 0, noSector: 0, notReal: 0, noBars: 0, notInFinalWeek: 0, delisted: 0, delistedNoSector: 0, delistedPriceOnly: 0 }, sourceHashes = [];
  const lastIdx = calendar.findLastIndex(d => d <= a.window[1]);
  const seriesDir = path.join(ROOT, 'quant/data/market/discover-series-long');
  let files = fs.readdirSync(seriesDir).filter(f => /^ref_.+\.json$/.test(f)).sort();
  if (a.limit) files = files.slice(0, a.limit);
  for (const f of files) {
    const id = f.slice(0, -5);
    counts.candidates++;
    const sector = ff12(sics.get(id));
    if (!sector) { counts.noSector++; continue; }
    const adj = new Float64Array(T).fill(NaN), raw = new Float64Array(T).fill(NaN);
    let dv = null, srcHash;
    if (a.workDir) {
      const file = path.join(a.workDir, 'tiingo/daily', id + '.json');
      if (!fs.existsSync(file)) { counts.noBars++; continue; }
      const bytes = fs.readFileSync(file), bars = (JSON.parse(bytes).bars || []).filter(b => b && typeof b.date === 'string').sort((x, y) => x.date < y.date ? -1 : 1);
      srcHash = sha(bytes); dv = new Float64Array(T).fill(NaN);
      const tv = [];
      for (let k = 0; k < bars.length; k++) {
        const b = bars[k], d = b.date.slice(0, 10), w = weekIdx.get(isoWeek(d));
        tv.push(Number(b.close) * Number(b.volume));
        if (w === undefined) continue;
        const next = bars[k + 1];
        if (next && isoWeek(next.date.slice(0, 10)) === isoWeek(d)) continue; // nur der letzte Tag der Woche
        if (Number(b.adjustedClose) > 0 && Number(b.close) > 0) { adj[w] = Number(b.adjustedClose); raw[w] = Number(b.close); }
        const win = tv.slice(-20).filter(Number.isFinite);
        if (win.length >= 10) dv[w] = win.reduce((s, x) => s + x, 0) / win.length;
      }
    } else {
      const bytes = fs.readFileSync(path.join(seriesDir, f)), doc = JSON.parse(bytes);
      if (doc.dataMode !== 'real' || doc.priceSeriesType !== 'SPLIT_ADJUSTED') { counts.notReal++; continue; }
      srcHash = sha(bytes);
      // Rohschluss = split-bereinigt × Faktor der späteren Splits (return-series.js#splitFactors, ADR-002).
      const pts = doc.points, splits = (doc.corporateActions && doc.corporateActions.splits) || [];
      const pseudo = pts.map(p => ({ date: p[0], splitFactor: 1 }));
      for (const [d, ratio] of splits) { const k = pts.findIndex(p => p[0] >= d); if (k >= 0) pseudo[k].splitFactor *= ratio; }
      const fac = Returns.splitFactors(pseudo);
      pts.forEach((p, k) => { const w = weekIdx.get(isoWeek(p[0])); if (w !== undefined && p[1] > 0) { adj[w] = p[1]; raw[w] = p[1] * fac[k]; } });
      // Nur-Kurs-Panel: heutige Kohorte; Titel ohne Kurs in der letzten Fensterwoche fallen heraus (Kennzeichnung).
      if (!(adj[lastIdx] > 0)) { counts.notInFinalWeek++; continue; }
    }
    if (!adj.some(x => x > 0)) { counts.noBars++; continue; }
    securities.push({ id, sector, mic: 'XNYS', adj, raw, dv, bundle: bundles.bySecurity.get(id) || null, terminal: null });
    sourceHashes.push([id, srcHash]);
  }
  if (a.delistedDir) {
    const D = require(path.join(ROOT, 'quant/engines/research-delisted-series.cjs'));
    const { docs } = D.loadDelisted(ROOT, { dir: a.delistedDir });
    for (const doc of docs.values()) {
      counts.delisted++;
      const sector = ff12(sics.get(doc.securityId));
      if (!sector) { counts.delistedNoSector++; continue; }
      const adj = new Float64Array(T).fill(NaN), raw = new Float64Array(T).fill(NaN);
      const tr = Array.isArray(doc.totalReturnPoints) && doc.totalReturnPoints.length === doc.points.length ? doc.totalReturnPoints : null;
      if (!tr) counts.delistedPriceOnly++;
      const lc = doc.listingLifecycle || {}, lastRaw = lc.terminal && lc.terminal.lastRawClose, lastAdj = doc.points.at(-1)[1];
      let li = -1;
      doc.points.forEach((p, k) => {
        const w = weekIdx.get(isoWeek(p[0])); if (w === undefined) return;
        adj[w] = tr ? tr[k][1] : p[1];
        raw[w] = lastRaw > 0 ? p[1] * lastRaw / lastAdj : p[1]; li = Math.max(li, w);
      });
      if (li < 0) continue;
      const kind = lc.terminal && ['MERGER', 'DISTRESS', 'UNKNOWN'].includes(lc.terminal.kind) ? lc.terminal.kind : 'UNKNOWN';
      securities.push({ id: doc.securityId, sector, mic: doc.mic || 'XNYS', adj, raw, dv: null, bundle: bundles.bySecurity.get(doc.securityId) || null, terminal: { lastIdx: li, kind } });
      sourceHashes.push([doc.securityId, doc.identityHash]);
    }
  }
  const prov = {
    datasetHash: sha({ series: sourceHashes, benchmark: bench.sourceHash }), identityEvidence: sha(sourceHashes.map(x => x[0])),
    populationEvidence: sha({ rule: 'ALL_LISTED_US_COMMON_WITH_SIC_AND_PRICE_AT_DECISION', ids: sourceHashes.length }), corporateActionEvidence: sha({ basis, splitFactors: 'return-series.js#splitFactors' }),
    lifecycleEvidence: sha({ delisted: a.delistedDir ? 'V13_REGISTER_1.0.0' : 'NONE' }), licenseEvidence: sha('TIINGO_COMMERCIAL_LICENSE_DERIVED_RESULTS_ONLY'),
  };
  return {
    calendar, basis, benchmark: { label: bench.label, levels, sourceHash: bench.sourceHash, file: bench.file }, securities, provenance: prov,
    meta: { counts, securities: securities.length, withFundamentals: securities.filter(s => s.bundle).length, fundamentalsSource: a.fundamentals ? 'PIT_ORIGINAL_FILING' : 'LAGGED_LATEST_FILING_COMMITTED_CONSUMER', fundamentalsFiles: bundles.files },
  };
}

function coverageByYear(panel, years) {
  return years.map(y => {
    const d = y + '-06-30', t = panel.calendar.findIndex(x => x >= d);
    if (t < 0) return { year: y };
    let priced = 0, fund = 0, delisted = 0;
    for (const s of panel.securities) {
      if (!(s.adj[t] > 0)) continue; priced++;
      if (s.terminal) delisted++;
      if (s.bundle && F.fundamentalFactors(s.bundle, panel.calendar[t], s.raw[t]).fundamentalsAsOfEnd) fund++;
    }
    return { year: y, priced, withFreshFundamentals: fund, laterDelisted: delisted };
  });
}

function main() {
  const a = args(process.argv);
  const t0 = Date.now();
  const panel = buildPanel(a);
  const y0 = Number(a.window[0].slice(0, 4)), y1 = Number(a.window[1].slice(0, 4));
  const coverage = coverageByYear(panel, Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i));
  const results = [];
  for (const profileId of a.profiles) {
    const r = BT.runModelPortfolio(panel, { profileId, weighting: a.weighting, window: a.window });
    results.push(r);
    console.log(JSON.stringify({ profileId, cagr: r.metrics.cagr, bench: r.metrics.benchmarkCagr, vol: r.metrics.annualizedVolatility, mdd: r.metrics.maxDrawdown, beta: r.metrics.beta, positions: r.construction.averagePositions }));
  }
  const sensitivity = [];
  if (a.sensitivity) for (const profileId of a.profiles) {
    for (const v of [{ weighting: 'EQUAL' }, ...(a.delistedDir ? [{ terminalRecovery: { MERGER: 1, UNKNOWN: 1, DISTRESS: 1 }, label: 'TERMINAL_LAST_CLOSE' }, { terminalRecovery: { MERGER: 1, UNKNOWN: 0.3, DISTRESS: 0 }, label: 'TERMINAL_HARSH' }] : [])]) {
      const r = BT.runModelPortfolio(panel, { profileId, weighting: v.weighting || a.weighting, window: a.window, terminalRecovery: v.terminalRecovery });
      sensitivity.push({ profileId, variant: v.label || ('WEIGHTING_' + v.weighting), cagr: r.metrics.cagr, benchmarkCagr: r.metrics.benchmarkCagr, vol: r.metrics.annualizedVolatility, maxDrawdown: r.metrics.maxDrawdown, beta: r.metrics.beta });
    }
  }
  const doc = {
    schemaVersion: VERSION, certification: 'NOT_CERTIFIED', label: 'Forschung, nicht zertifiziert', productionApproved: false, publiclyActivated: false,
    engines: { backtest: BT.VERSION, construction: C.VERSION, factors: F.VERSION, risk: Risk.VERSION },
    standard: C.STANDARD, spreadModel: { byAdv: C.SPREAD_BY_ADV, byMarketCap: C.SPREAD_BY_MCAP, lowPriceSurchargeBps: C.LOW_PRICE_SURCHARGE_BPS }, defaults: BT.DEFAULTS,
    data: { basis: panel.basis, benchmark: panel.benchmark.label, benchmarkFile: panel.benchmark.file, ...panel.meta, provenance: panel.provenance, coverageByYear: coverage,
      delistedSource: a.delistedDir ? 'V13_PRIVATE_ARCHIVE_REGISTER_1.0.0_QUALIFIED' : 'NONE_SURVIVOR_COHORT', priceSource: a.workDir ? 'R2_CANONICAL_DAILY_TIINGO' : 'COMMITTED_WEEKLY_SPLIT_ADJUSTED' },
    window: a.window, weighting: a.weighting, results, sensitivity,
    openLimits: ['KEINE_HISTORISCHE_INDEXMITGLIEDSCHAFT', 'SIC_HEUTIGER_STAND', 'SPREAD_MODELLIERT_NICHT_BEOBACHTET', 'ENDWERT_DELISTETER_TITEL_ANNAHME_JE_KLASSE',
      ...(a.workDir ? [] : ['NUR_KURSRENDITE_KEINE_DIVIDENDEN', 'NUR_HEUTIGE_TITEL_SURVIVORSHIP']), ...(a.fundamentals ? [] : ['FUNDAMENTALDATEN_VERZOEGERT_ZULETZT_EINGEREICHT']),
      ...(a.delistedDir ? ['DELISTETE_TITEL_OHNE_TAGESUMSATZ_LIQUIDITAET_UEBER_MARKTKAPITALISIERUNG'] : [])],
    runtimeSeconds: Math.round((Date.now() - t0) / 1000),
  };
  fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(doc));
  console.log(JSON.stringify({ out: a.out, securities: panel.meta.securities, runtimeSeconds: doc.runtimeSeconds }));
}

if (require.main === module) main();
module.exports = { isoWeek, ff12, buildPanel, coverageByYear, DEFAULT_PROFILES, VERSION };
