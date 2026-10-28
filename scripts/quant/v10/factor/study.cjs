#!/usr/bin/env node
'use strict';
// V10 FACTOR (RECONSTRUCTION): registered factor-ranking study on the PIT panel.
// Usage: node study.cjs <private_dir> [--loader-options '<json>'] [--out <evidence_dir>]
// Reads <private_dir>/panel.jsonl.gz; writes <private_dir>/study-perdate.json.gz and the compact evidence
// <out>/factor-study-1.0.0.json (default docs/quant-recovery/v10/factor). Engines: research-studies.runFactorStudy,
// research-validation.inferTemporalBlockMean/holm, research-studies.classifyRegimes, V9 bartlettLrv.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('./common.cjs'), X = require('./factors.cjs');
const S = require(F.ROOT + '/quant/engines/research-studies.cjs');
const V = require(F.ROOT + '/quant/engines/research-validation.cjs');
const D = require(F.ROOT + '/scripts/quant/v9/sensitivity/dependence.cjs');
const C = F.C;

const REG_PATH = path.join(F.ROOT, 'docs/quant-recovery/v10/factor/registration-1.0.0.json');
const HORIZONS = [4, 13, 26, 52], H_MONTHS = { 4: 1, 13: 3, 26: 6, 52: 12 };
const MIN_SCORED = 200, MIN_OBSERVED = 100, BUCKETS = 5;
const SEED = 20261028, REPLICATES = 1999;
const SUBPERIODS = [['2010-01-01', '2014-12-31'], ['2015-01-01', '2019-12-31'], ['2020-01-01', '2025-12-31']];
const blockLength = h => Math.max(12, 2 * H_MONTHS[h]);
const nwBandwidth = h => Math.max(4, 2 * H_MONTHS[h]);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

// Normal survival via erfc (Numerical Recipes rational approximation, |error| < 1.2e-7).
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
function neweyWest(values, bw) {
  const T = values.length; if (T < 8) return { n: T, mean: mean(values), se: null, t: null, p: null, bandwidth: bw };
  const b = Math.min(bw, T - 1), m = mean(values), lrv = D.bartlettLrv(values.map(v => v - m), b);
  const se = lrv > 0 ? Math.sqrt(lrv / T) : null, t = se ? m / se : null;
  return { n: T, mean: m, se, t, p: t === null ? null : erfc(Math.abs(t) / Math.SQRT2), bandwidth: b };
}
function blockInference(dates, values, h) {
  if (values.length < 2 * blockLength(h)) return null;
  const r = V.inferTemporalBlockMean({ calendar: dates, blockLength: blockLength(h), minimumBlockLength: 6, replicates: REPLICATES, seed: SEED, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' },
    dates.map((d, k) => ({ id: d, date: d, value: values[k] })));
  return { estimate: r.estimate, pValue: r.pValue, ci: r.ci, blockLength: blockLength(h), dates: r.dates, resultHash: r.resultHash };
}

function listingOf(l, from, to) {
  const k0 = Math.max(0, l.points.findIndex(p => p[0] >= from)), bars = [];
  for (let k = k0; k < l.points.length && l.points[k][0] <= to; k++) bars.push({ date: l.points[k][0], close: l.points[k][1] });
  return { listingId: l.securityId, issuerId: l.cik || l.securityId, identity: { mic: l.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: l.listingStart, availableAt: l.masterGeneratedAt, sourceHash: l.identityHash }, bars };
}

function run(privateDir, loaderOptions, outDir) {
  const t0 = Date.now();
  const reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8')), registrationHash = C.hash(reg);
  const panel = require('./panel.cjs').readPanel(path.join(privateDir, 'panel.jsonl.gz'), { withRaws: false });
  if (C.hash(panel.loaderOptions) !== C.hash(loaderOptions)) throw Error('PANEL_LOADER_OPTIONS_MISMATCH');
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const calIndex = new Map(frame.calendar.map((d, k) => [d, k]));
  const asOf = frame.calendar.at(-1);
  const registration = { id: reg.studyId, version: reg.ruleVersion, frozenAt: reg.registeredAt, analysisMode: 'EXPLORATORY' };
  const base = { asOf, sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 0, slippageBps: 0 }, expectedCalendar: frame.calendar, entryDelayBars: 1, buckets: BUCKETS,
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: spy.bars } };
  const years = [...new Set(panel.rankDates.map(d => d.slice(0, 4)))];
  // One vintage hash per (listing, rank date) over all signal scores, computed once.
  const rowHash = new Map(panel.dates.map(s => [s.date, new Map(s.rows.map(r => [r.id, C.hash([r.id, s.date, r.scores])]))]));
  const perDate = {}, coverage = {}, eventsOut = {}, engineHashes = [];
  for (const signal of X.SIGNALS) for (const h of HORIZONS) {
    const key = signal + ':' + h; perDate[key] = []; coverage[key] = { expected: 0, observed: 0, immature: 0, censored: 0, ineligible: 0, datesExcludedTooFewScored: 0, datesExcludedTooFewObserved: 0, censoredReasons: {} };
    eventsOut[key] = [];
    process.stderr.write(key + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n');
    for (const y of years) {
      const snaps = panel.dates.filter(d => d.date.slice(0, 4) === y);
      const lastIdx = calIndex.get(snaps.at(-1).date);
      const to = frame.calendar[Math.min(frame.calendar.length - 1, lastIdx + h + 2)];
      const ids = new Set(snaps.flatMap(s => s.rows.map(r => r.id)));
      const listings = [...ids].map(id => listingOf(byId.get(id), snaps[0].date, to)).filter(l => l.bars.length);
      const factorSnapshots = snaps.map(s => {
        const availableAt = s.date + 'T23:59:59.999Z';
        return { date: s.date, availableAt, sourceHash: C.hash({ date: s.date, signal }),
          rows: s.rows.map(r => ({ listingId: r.id, value: X.finite(r.scores[signal]) ? r.scores[signal] : null, availableAt, sourceHash: rowHash.get(s.date).get(r.id) })) };
      });
      // Calendar restricted to the chunk window (identical contiguity checks, bars lie inside it); exits beyond the data end stay IMMATURE.
      const expectedCalendar = frame.calendar.slice(calIndex.get(snaps[0].date), calIndex.get(to) + 1);
      const res = S.runFactorStudy({ ...base, expectedCalendar, listings, horizonBars: h, factorId: signal, factorSnapshots });
      engineHashes.push(res.resultHash);
      const c = coverage[key];
      for (const k of ['expected', 'observed', 'immature', 'censored', 'ineligible']) c[k] += res.coverage[k];
      const evByDate = new Map();
      for (const e of res.events) {
        if (!evByDate.has(e.signalDate)) evByDate.set(e.signalDate, []); evByDate.get(e.signalDate).push(e);
        if (e.state === 'CENSORED') for (const r of e.reasons || []) c.censoredReasons[r] = (c.censoredReasons[r] || 0) + 1;
      }
      for (const p of res.periods) {
        const ev = evByDate.get(p.date) || [];
        const observed = ev.filter(e => e.completed);
        if (p.eligibleAtDecision < MIN_SCORED) { c.datesExcludedTooFewScored++; continue; }
        if (observed.length < MIN_OBSERVED) { c.datesExcludedTooFewObserved++; continue; }
        const q = k => observed.filter(e => e.bucket === k).map(e => e.grossReturn);
        const q5 = q(BUCKETS - 1), q1 = q(0), all = observed.map(e => e.grossReturn);
        const bench = observed.find(e => e.bucket === BUCKETS - 1 && e.benchmarkReturn !== null)?.benchmarkReturn ?? null;
        const q5Censored = ev.filter(e => e.bucket === BUCKETS - 1 && e.state === 'CENSORED').length;
        const q5Assigned = ev.filter(e => e.bucket === BUCKETS - 1).length;
        perDate[key].push({ date: p.date, n: p.eligibleAtDecision, observed: observed.length, ic: p.spearmanObservedOnly,
          spread: q5.length && q1.length ? mean(q5) - mean(q1) : null, q5: mean(q5), q1: mean(q1), all: mean(all), spy: bench,
          excessSpy: bench === null || !q5.length ? null : mean(q5) - bench, excessEw: q5.length ? mean(q5) - mean(all) : null,
          q5Censored, q5Assigned, excessSpyLowerBound: bench === null || !q5.length ? null : (q5.reduce((s, x) => s + x, 0) - q5Censored) / (q5.length + q5Censored) - bench,
          excessSpyZeroBound: bench === null || !q5.length ? null : q5.reduce((s, x) => s + x, 0) / (q5.length + q5Censored) - bench });
        if (signal === 'composite') eventsOut[key].push(...ev.filter(e => e.completed).map(e => [e.listingId, e.signalDate, e.bucket, e.factor, e.grossReturn]));
      }
    }
  }
  // Inference per signal x horizon and endpoint.
  const endpoints = { E1_IC: 'ic', E2_SPREAD: 'spread', E3_EXCESS_SPY: 'excessSpy', E4_EXCESS_EW: 'excessEw' };
  const table = [];
  for (const signal of X.SIGNALS) for (const h of HORIZONS) {
    const key = signal + ':' + h, rows = perDate[key], row = { signal, horizonBars: h, horizonMonths: H_MONTHS[h], datesUsed: rows.length, coverage: coverage[key], endpoints: {} };
    for (const [ep, field] of Object.entries(endpoints)) {
      const pts = rows.filter(r => X.finite(r[field])), dates = pts.map(r => r.date), vals = pts.map(r => r[field]);
      const nw = neweyWest(vals, nwBandwidth(h)), bb = blockInference(dates, vals, h);
      row.endpoints[ep] = { n: vals.length, mean: nw.mean, nw, block: bb,
        positiveShare: vals.length ? vals.filter(v => v > 0).length / vals.length : null,
        subperiods: SUBPERIODS.map(([a, b]) => { const s = pts.filter(r => r.date >= a && r.date <= b).map(r => r[field]); return { from: a, to: b, ...neweyWest(s, nwBandwidth(h)) }; }) };
    }
    const lb = rows.filter(r => X.finite(r.excessSpyLowerBound)).map(r => r.excessSpyLowerBound), zb = rows.filter(r => X.finite(r.excessSpyZeroBound)).map(r => r.excessSpyZeroBound);
    row.missingOutcomeBounds = { E3_censoredAsMinus100: mean(lb), E3_censoredAsZero: mean(zb), q5CensoredTotal: rows.reduce((s, r) => s + r.q5Censored, 0), q5AssignedTotal: rows.reduce((s, r) => s + r.q5Assigned, 0) };
    table.push(row);
  }
  const multipleTesting = {};
  for (const ep of Object.keys(endpoints)) {
    const fam = table.map((r, k) => ({ k, p: r.endpoints[ep].block?.pValue })).filter(x => X.finite(x.p));
    const adj = V.holm(fam.map(x => x.p));
    fam.forEach((x, j) => { table[x.k].endpoints[ep].holm = adj[j]; table[x.k].endpoints[ep].holmReject05 = adj[j] <= 0.05; });
    multipleTesting[ep] = { family: fam.length, method: 'HOLM over 7 signals x 4 horizons (block-bootstrap p)', rejections05: fam.filter((x, j) => adj[j] <= 0.05).length, role: ep === 'E1_IC' ? 'PRIMARY' : 'SECONDARY' };
  }
  // Regimes (PIT_AVAILABLE, SPY weekly) - E1 per state, descriptive.
  const regimeBars = spy.bars.filter(b => b.date >= '2008-06-01').map(b => ({ ...b, availableAt: b.date + 'T23:59:59.999Z', sourceHash: spy.provenance.sourceBytesHash }));
  const reg8 = S.classifyRegimes({ asOf, mode: 'PIT_AVAILABLE', lookbackBars: 26, volatilityLookbackBars: 13, trendBand: 0, volatilityThreshold: 0.20, annualization: 52, bars: regimeBars });
  const stateOf = new Map(reg8.regimes.map(r => [r.date, r.state + '/' + r.volatilityState]));
  const regimes = {};
  for (const signal of X.SIGNALS) for (const h of HORIZONS) {
    const g = {};
    for (const r of perDate[signal + ':' + h]) { if (!X.finite(r.ic)) continue; const s = stateOf.get(r.date) || 'UNKNOWN'; (g[s] = g[s] || []).push(r.ic); }
    regimes[signal + ':' + h] = Object.fromEntries(Object.entries(g).sort().map(([s, v]) => [s, neweyWest(v, nwBandwidth(h))]));
  }
  const populationPerDate = panel.rankDates.map(d => ({ date: d, ...panel.counts[d] }));
  const input = { registrationHash, panelHash: C.hash(panel.dates.map(d => [d.date, d.rows.map(r => [r.id, r.scores])])), masterHash: frame.masterHash, loaderOptions,
    seriesHashes: C.hash(frame.listings.map(l => [l.securityId, l.sourceBytesHash])), spy: spy.provenance };
  const codeFiles = ['scripts/quant/v10/factor/study.cjs', 'scripts/quant/v10/factor/factors.cjs', 'scripts/quant/v10/factor/panel.cjs', 'scripts/quant/v10/factor/common.cjs', 'scripts/quant/v10/factor/pit_docs.py',
    'quant/engines/research-studies.cjs', 'quant/engines/research-validation.cjs', 'quant/engines/factor-evidence.js', 'quant/engines/fundamental-inputs.js', 'quant/engines/research-weekly-loader.cjs', 'quant/engines/return-series.js', 'quant/engines/market-cap.js'];
  const code = Object.fromEntries(codeFiles.map(f => [f, C.shaFile(path.join(F.ROOT, f))]));
  const result = {
    schemaVersion: 'v10-factor-study-1.0.0', studyId: reg.studyId, ruleVersion: reg.ruleVersion, evidenceKind: 'RECONSTRUCTION', registrationHash, registeredAt: reg.registeredAt,
    label: 'RECONSTRUCTION - nie ein damals veroeffentlichtes VU-Signal',
    dataSource: reg.dataSource, listingIdentity: reg.listingIdentity, loaderOptions,
    population: { rule: reg.population, qualification: frame.reasons, qualifiedCount: frame.qualifiedCount, exclusions: Object.fromEntries(Object.entries(frame.excluded).map(([k, v]) => [k, v.length])), frameListings: frame.listings.length, issuers: frame.ciks.size,
      listingsWithoutIssuer: frame.listings.filter(l => !l.cik).length, perDate: populationPerDate },
    period: { rankDates: panel.rankDates.length, first: panel.rankDates[0], last: panel.rankDates.at(-1) }, dataAsOf: asOf,
    availability: reg.availability, returnBasis: 'PRICE_RETURN', costs: base.costs, benchmark: { id: 'SPY', returnBasis: 'PRICE_RETURN', provenance: spy.provenance },
    horizons: HORIZONS, inference: { blockLength: Object.fromEntries(HORIZONS.map(h => [h, blockLength(h)])), nwBandwidth: Object.fromEntries(HORIZONS.map(h => [h, nwBandwidth(h)])), replicates: REPLICATES, seed: SEED },
    multipleTesting, table, regimes, regimeEngineHash: reg8.resultHash,
    maturedOutcomes: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, { observed: v.observed, immature: v.immature, censored: v.censored, ineligible: v.ineligible, expected: v.expected }])),
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false, activeContractsAffected: [],
    scope: 'Rueckblickende Rekonstruktion der PIT-rekonstruierbaren VU-Faktorteilmenge auf heutigen Survivors (bedingte Population), Kursrendite, erkundete Historie 2010-2025. Keine Aussage ueber den damaligen Gesamtmarkt, keine damals veroeffentlichten Signale, kein Ersatz der vorwaerts gesammelten Faktor-/Membership-Historie.',
    engineResultHashes: C.hash(engineHashes), code, input, runtime: C.runtime(), seconds: Math.round((Date.now() - t0) / 1000) };
  result.reproHash = C.hash({ input, code });
  fs.writeFileSync(path.join(privateDir, 'study-perdate.json.gz'), zlib.gzipSync(JSON.stringify(perDate)));
  fs.writeFileSync(path.join(privateDir, 'study-composite-events.json.gz'), zlib.gzipSync(JSON.stringify(eventsOut)));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'factor-study-1.0.0.json'), JSON.stringify(result, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, 'factor-study-perdate-1.0.0.json.gz'), zlib.gzipSync(JSON.stringify({ schemaVersion: 'v10-factor-study-perdate-1.0.0', registrationHash, perDate })));
  return result;
}

function main() {
  const privateDir = F.privateDir(process.argv[2]);
  const loaderOptions = F.parseLoaderOptions(arg('--loader-options'));
  const outDir = path.resolve(arg('--out') || path.join(F.ROOT, 'docs/quant-recovery/v10/factor'));
  const r = run(privateDir, loaderOptions, outDir);
  for (const row of r.table) {
    const e = row.endpoints.E1_IC;
    console.log([row.signal, row.horizonMonths + 'M', e.n, e.mean?.toFixed(4), e.nw.t?.toFixed(2), e.block?.pValue?.toFixed(4), e.holm?.toFixed(4)].join('\t'));
  }
  console.log(JSON.stringify({ seconds: r.seconds, multipleTesting: r.multipleTesting }));
}
if (require.main === module) main();
module.exports = { neweyWest, erfc, blockLength, nwBandwidth, HORIZONS };
