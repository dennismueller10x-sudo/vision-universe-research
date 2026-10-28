'use strict';
// V10 STUDIES – D2 Pattern Evidence (15 registered price candidates, same-week control group) and
// D1 rule-based Same Stock Replay (hash-sampled listings, research-studies.runReplayValidation).
// Features/hits: pattern-research.featuresAt + matchesPattern (engine); events/outcomes follow
// runPatternStudy semantics and are parity-checked against the engine on a registered subsample.
const fs = require('node:fs'), path = require('node:path');
const K = require('./common.cjs');
const Pattern = require(K.ROOT + '/quant/engines/pattern-research.js');

function patternsFromRegistration(R) {
  const meth = K.readJson(path.join(K.ROOT, 'quant/methodology/pattern-research-v1.json'));
  return R.studies.PATTERN_EVIDENCE.candidates.map(id => {
    const c = meth.candidates.find(x => x.id === id); if (!c || c.also) throw Error('PATTERN_CANDIDATE_CHANGED:' + id);
    return { id, version: meth.methodologyVersion, terms: [{ feature: c.feature, operator: c.operator, value: c.value }] };
  });
}
// hits[i][patternIndex] Int8Array: 1 hit, 0 measurable non-hit, -1 not measurable (k < 53 left at -2).
function computeHits(panel, patterns) {
  return panel.map(p => {
    const closes = Array.from(p.closes), ctx = { runningMax: Pattern.runningMaxOf(closes) }, n = closes.length;
    const out = patterns.map(() => new Int8Array(n).fill(-2));
    for (let k = K.Signal.WARMUP_WEEKS; k < n; k++) {
      const f = Pattern.featuresAt(closes, k, ctx);
      for (let j = 0; j < patterns.length; j++) {
        const hit = !!f && Pattern.matchesPattern(f, patterns[j]);
        out[j][k] = hit === null ? -1 : hit ? 1 : 0;
      }
    }
    return out;
  });
}
// Engine eventOutcome state for a bar k (no feature lookback: any earlier calendar gap -> INELIGIBLE).
function outcomeState(p, k, h, T) {
  if (!K.eligibleAt(p, k, Infinity)) return { state: 'INELIGIBLE', reason: p.dates[k] < p.listingStart ? 'IDENTITY_OUTSIDE_VALID_INTERVAL' : 'FEATURE_CALENDAR_GAP_BEFORE_SIGNAL' };
  const n = p.closes.length;
  if (k + 1 >= n) return { state: p.cal[k] + 1 < T ? 'CENSORED' : 'IMMATURE', reason: 'ENTRY_NOT_OBSERVED' };
  if (p.cal[k + 1] !== p.cal[k] + 1) return { state: 'CENSORED', reason: 'IMMEDIATE_NEXT_SESSION_MISSING' };
  if (k + 1 + h >= n) return { state: p.cal[k] + 1 + h < T ? 'CENSORED' : 'IMMATURE', reason: 'OUTCOME_NOT_OBSERVED' };
  if (p.cal[k + 1 + h] - p.cal[k] !== 1 + h) return { state: 'CENSORED', reason: 'SESSION_GAP' };
  return { state: 'OBSERVED', reason: null, gross: p.closes[k + 1 + h] / p.closes[k + 1] - 1 };
}
function patternEvents(ctx, hits, j, h, cooldown) {
  const T = ctx.fr.calendar.length, events = [], suppressed = { NOT_MEASURABLE: 0, COOLDOWN: 0 };
  const cs = { sum: new Float64Array(T), cnt: new Float64Array(T), incomplete: new Float64Array(T) };
  ctx.panel.forEach((p, i) => {
    const hv = hits[i][j]; let last = -Infinity;
    for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
      const hit = hv[k];
      if (hit === -1) { suppressed.NOT_MEASURABLE++; continue; }
      if (hit === 1 && k - last < cooldown) { suppressed.COOLDOWN++; continue; }
      const o = outcomeState(p, k, h, T);
      if (hit === 1) {
        last = k;
        const entryDate = k + 1 < p.closes.length ? p.dates[k + 1] : null, exitDate = o.state === 'OBSERVED' ? p.dates[k + 1 + h] : null;
        events.push({ securityId: p.id, signalDate: p.dates[k], k, state: o.state, reason: o.reason, gross: o.state === 'OBSERVED' ? o.gross : null,
          bench: o.state === 'OBSERVED' ? ctx.benchmark.ret(entryDate, exitDate) : null, entryDate, exitDate,
          expectedExitDate: ctx.fr.calendar[p.cal[k] + 1 + h] ?? null, entryClose: entryDate ? p.closes[k + 1] : null, lastClose: p.closes[p.closes.length - 1] });
      } else if (o.state === 'OBSERVED') { const c = p.cal[k]; cs.sum[c] += o.gross; cs.cnt[c]++; }
      else if (o.state !== 'INELIGIBLE') cs.incomplete[p.cal[k]]++;
    }
  });
  return { events, controls: cs, suppressed };
}
function rowsFor(events, endpoint, costs, cs, calIndex, inWindow) {
  const rows = [];
  for (const e of events) {
    if (e.state !== 'OBSERVED' || !inWindow(e.signalDate)) continue;
    const net = K.netOf(e.gross, costs.feeBps, costs.slippageBps);
    let value = null;
    if (endpoint === 'RAW_NET') value = net;
    else if (endpoint === 'SPY_EXCESS') value = e.bench === null ? null : net - e.bench;
    else { const c = calIndex.get(e.signalDate); value = cs.cnt[c] > 0 ? net - K.netOf(cs.sum[c] / cs.cnt[c], costs.feeBps, costs.slippageBps) : null; }
    if (value !== null) rows.push({ id: e.securityId + ':' + e.signalDate, date: e.signalDate, value, issuer: e.securityId, securityId: e.securityId });
  }
  return rows;
}
function inferenceRows(rows) {
  if (rows.length <= 100000) return rows;
  return rows.map(r => ({ r, k: K.sha('V10-STUDIES-SUBSAMPLE-1.0.0|' + r.securityId + '|' + r.date) })).sort((a, b) => a.k < b.k ? -1 : 1).slice(0, 100000).map(x => x.r);
}
function cellFor(ctx, events, cs, h, endpoint, calIndex, inWindow, lifecycleById, extra) {
  const base = ctx.R.costs.base, rows = rowsFor(events, endpoint, base, cs, calIndex, inWindow), infRows = inferenceRows(rows), B = K.blockLengthFor(h);
  const primary = K.blockInference(ctx.studyCalendar, infRows, B), robust = B === 104 ? primary : K.blockInference(ctx.studyCalendar, infRows, 104);
  const censored = events.filter(e => e.state === 'CENSORED' && inWindow(e.signalDate));
  return { ...extra, horizonWeeks: h, endpoint, n: rows.length, estimate: K.mean(rows.map(r => r.value)), inferenceSubsampled: infRows.length !== rows.length, inferenceN: infRows.length,
    ci: primary.ci, pValue: primary.pValue, blockLength: B, block: primary, robustness104: { ci: robust.ci, pValue: robust.pValue, blockLength: 104 }, cluster: K.clusterInference(rows), distribution: K.distribution(rows.map(r => r.value)),
    regimes: K.regimeTable(rows, ctx.regimes), subperiods: K.subperiodTable(rows),
    costSensitivity: ctx.R.costs.sensitivity.map(c => { const rr = rowsFor(events, endpoint, c, cs, calIndex, inWindow); return { ...c, n: rr.length, mean: K.mean(rr.map(r => r.value)) }; }),
    survivorship: K.survivorshipSensitivity(rows, censored.map(e => ({ securityId: e.securityId, entryDate: e.entryDate, entryClose: e.entryClose, expectedExitDate: e.expectedExitDate, lastClose: e.lastClose })), lifecycleById, base, ctx.benchmark, endpoint) };
}
function coverageOf(events, inWindow, cs, calIndex) {
  const ev = events.filter(e => inWindow(e.signalDate)), obs = ev.filter(e => e.state === 'OBSERVED');
  return { events: ev.length, states: ev.reduce((a, e) => { const k = e.state + (e.reason ? ':' + e.reason : ''); a[k] = (a[k] || 0) + 1; return a; }, {}), observed: obs.length,
    immature: ev.filter(e => e.state === 'IMMATURE').length, censored: ev.filter(e => e.state === 'CENSORED').length, ineligible: ev.filter(e => e.state === 'INELIGIBLE').length,
    observedWithoutSpy: obs.filter(e => e.bench === null).length, observedWithoutControl: obs.filter(e => !(cs.cnt[calIndex.get(e.signalDate)] > 0)).length, listings: new Set(obs.map(e => e.securityId)).size };
}
function baseInput(ctx, h) {
  const R = ctx.R;
  return { asOf: ctx.fr.calendar.at(-1), sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', executionClock: 'OBSERVED_WEEKLY_DATES', returnBasis: 'PRICE_RETURN', currency: 'USD',
    registration: { id: R.id, version: R.version, frozenAt: R.registeredAt, analysisMode: 'EXPLORATORY', selection: 'V10 registered frame' }, horizonBars: h, entryDelayBars: 1,
    costs: { basis: 'PER_SIDE_NOTIONAL', ...R.costs.base }, expectedCalendar: ctx.fr.calendar, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: K.benchmarkBars(ctx.benchmark, ctx.fr.calendar) } };
}
// Engine parity on the registered subsample: runPatternStudy events and completed controls vs this construction.
function engineParity(ctx, patterns, hits) {
  const PE = ctx.R.studies.PATTERN_EVIDENCE, sp = PE.engineParitySample, h = sp.horizonWeeks;
  const sample = ctx.panel.map((p, i) => ({ p, i, key: K.sha('V10-STUDIES-PATTERN-PARITY-1.0.0|' + p.id) })).sort((a, b) => a.key < b.key ? -1 : 1).slice(0, sp.listings);
  const out = { listings: sample.map(x => x.p.id), horizonWeeks: h, patterns: {} };
  for (const pid of sp.patterns) {
    const j = patterns.findIndex(x => x.id === pid), pat = patterns[j];
    const r = K.S.runPatternStudy({ ...baseInput(ctx, h), listings: sample.map(x => K.listingOf(x.p)), pattern: pat, cooldownBars: 13 });
    const sub = { ...ctx, panel: sample.map(x => x.p) }, mine = patternEvents(sub, sample.map(x => hits[x.i]), j, h, 13);
    const key = e => e.securityId + '|' + e.signalDate, idOf = new Map(sample.map(x => [x.p.listingId, x.p.id]));
    const eng = new Map(r.events.map(e => [idOf.get(e.listingId) + '|' + e.signalDate, e])), my = new Map(mine.events.map(e => [key(e), e]));
    let stateMismatch = 0, grossMismatch = 0, missing = 0;
    for (const [k, e] of my) { const x = eng.get(k); if (!x) { missing++; continue; } if (x.state !== e.state) stateMismatch++; if (e.state === 'OBSERVED' && x.grossReturn !== e.gross) grossMismatch++; }
    // completed controls: engine list vs per-date sums of this construction
    const T = ctx.fr.calendar.length, engSum = new Float64Array(T), engCnt = new Float64Array(T), ci = new Map(ctx.fr.calendar.map((d, i) => [d, i]));
    for (const c of r.controls) if (c.completed) { const t = ci.get(c.signalDate); engSum[t] += c.grossReturn; engCnt[t]++; }
    let cntMismatch = 0, sumMaxAbs = 0;
    for (let t = 0; t < T; t++) { if (engCnt[t] !== mine.controls.cnt[t]) cntMismatch++; sumMaxAbs = Math.max(sumMaxAbs, Math.abs(engSum[t] - mine.controls.sum[t])); }
    out.patterns[pid] = { engineEvents: r.events.length, events: mine.events.length, missingInEngine: missing, stateMismatch, grossMismatch, engineCompletedControls: r.controls.filter(c => c.completed).length,
      controls: [...mine.controls.cnt].reduce((a, b) => a + b, 0), controlCountMismatchDates: cntMismatch, controlSumMaxAbsDiff: sumMaxAbs, engineSuppressed: r.suppressed.length, suppressed: mine.suppressed.COOLDOWN + mine.suppressed.NOT_MEASURABLE,
      pass: missing === 0 && stateMismatch === 0 && grossMismatch === 0 && r.events.length === mine.events.length && cntMismatch === 0 && sumMaxAbs < 1e-9 && r.suppressed.length === mine.suppressed.COOLDOWN + mine.suppressed.NOT_MEASURABLE };
  }
  return out;
}

function erfc(x) { // Numerical Recipes erfcc, fractional error < 1.2e-7
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

function run(ctx, which) {
  const R = ctx.R, PE = R.studies.PATTERN_EVIDENCE, SR = R.studies.SAME_STOCK_REPLAY, t0 = Date.now();
  const calIndex = new Map(ctx.fr.calendar.map((d, i) => [d, i])), inWindow = d => d >= R.window.signalDates[0] && d <= R.window.signalDates[1];
  const lifecycleById = new Map(ctx.panel.map(p => [p.id, p.lifecycle]));
  const patterns = patternsFromRegistration(R), hits = computeHits(ctx.panel, patterns);
  console.error('pattern hits', (Date.now() - t0) / 1000, 's');
  const cells = [], coverage = {}, controlsByPatternH = {}, eventsByPatternH = {};
  for (let j = 0; j < patterns.length; j++) for (const h of PE.horizonsWeeks) {
    const { events, controls, suppressed } = patternEvents(ctx, hits, j, h, 13);
    controlsByPatternH[patterns[j].id + ':' + h] = controls;
    if (patterns[j].id === 'above-40w-line') eventsByPatternH[h] = events;
    coverage[patterns[j].id + ':' + h] = { ...coverageOf(events, inWindow, controls, calIndex), suppressed,
      controlObservationsInWindow: ctx.studyCalendar.reduce((s, d) => s + controls.cnt[calIndex.get(d)], 0), incompleteControlsInWindow: ctx.studyCalendar.reduce((s, d) => s + controls.incomplete[calIndex.get(d)], 0) };
    if (which.includes('pattern')) for (const endpoint of PE.endpoints) cells.push(cellFor(ctx, events, controls, h, endpoint, calIndex, inWindow, lifecycleById, { pattern: patterns[j].id }));
  }
  console.error('pattern cells', (Date.now() - t0) / 1000, 's');
  if (which.includes('pattern')) {
    const family = K.holmFamily(cells), parity = engineParity(ctx, patterns, hits);
    const prior = priorScope();
    const ev = K.evidence({
      studyId: 'V10-PATTERN-EVIDENCE', ruleVersion: { methodology: patterns[0].version, patternEngine: Pattern.METHODOLOGY_VERSION || null, cooldownBars: 13 },
      dataSource: { loader: 'research-weekly-loader.createResearchLoader', loaderOptions: ctx.loaderOptions, sourceManifestHash: ctx.manifestHash, benchmark: ctx.benchmark.provenance },
      listingIdentity: R.population.identityRule, population: { rule: R.population.frameRule, frame: ctx.fr.frame.length, frameIdsHash: K.V.hash(ctx.fr.frame) },
      inclusionsExclusions: { qualificationCounts: ctx.fr.reasons, frameExclusions: Object.fromEntries(Object.entries(ctx.fr.excluded).map(([k, v]) => [k, v.length])), excludedCandidates: PE.excludedCandidates },
      period: { signalDates: R.window.signalDates }, dataAsOf: ctx.fr.calendar.at(-1), availability: R.timing, returnBasis: 'PRICE_RETURN', costs: R.costs, benchmark: R.benchmark,
      maturedOutcomes: coverage, performance: cells.map(c => ({ pattern: c.pattern, horizonWeeks: c.horizonWeeks, endpoint: c.endpoint, n: c.n, estimate: c.estimate, ci: c.ci, pValue: c.pValue, holmAdjustedP: c.holmAdjustedP, holmReject: c.holmReject, hitRate: c.distribution.hitRate })),
      uncertainty: { method: R.inference.primary, blockLength: R.inference.blockLength, engineBudget: R.inference.engineBudget, overlap: 'Overlapping holding windows and same-week cross-sectional dependence are handled by resampling whole calendar blocks; cooldown 13 bars limits same-listing repetition.' },
      multipleTesting: { ...family, definition: PE.family.definition }, controls: R.controls.pattern, engineParity: parity, scopeComparison: prior, cells,
      reproHash: K.C.hash({ registrationHash: ctx.reg.registrationHash, sourceManifestHash: ctx.manifestHash, code: K.codeHashes(['scripts/quant/v10/studies/pattern-study.cjs']) }),
      scope: 'Fixed pre-registered price patterns as an event study with same-week control group on the current-classification frame; weekly PRICE_RETURN; explored history; not a tradable rule, not a certification.' });
    K.writeJson(path.join(ctx.dir, 'pattern-evidence.json'), ev);
    K.writeJson(path.join(ctx.dir, 'parity-engine-pattern.json'), parity);
    console.error('pattern done', family, JSON.stringify(Object.fromEntries(Object.entries(parity.patterns).map(([k, v]) => [k, v.pass]))));
  }
  if (which.includes('replay')) runReplay(ctx, controlsByPatternH, eventsByPatternH, calIndex, inWindow, lifecycleById);
}

function priorScope() {
  const out = { V7: { listings: 11, patterns: 1, pattern: 'ABOVE_40W_SMA', horizonBars: 13, source: 'scripts/quant/run-v7-real-studies.cjs' }, V8: { listings: 11, note: 'V8 incremental studies reused the V7 named survivors; no new pattern study population', source: 'scripts/quant/run-v8-real-studies.cjs' }, V9: { patternStudy: 'none (V9 broadened NEW_52W_HIGH sensitivity only)' } };
  try { const s = K.readJson(path.join(K.ROOT, 'quant/data/product/pattern-research-v1/study.json')); out.productPatternStudy = { titles: s.population?.titles ?? s.population?.count ?? null, observations: s.population?.observations ?? null, horizons: 'H12-H60 winner frequencies', note: 'product study, different question (winner frequencies), not an event study with same-week control' }; } catch { out.productPatternStudy = null; }
  return out;
}

function runReplay(ctx, controlsByPatternH, d2Events, calIndex, inWindow, lifecycleById) {
  const R = ctx.R, SR = R.studies.SAME_STOCK_REPLAY, base = R.costs.base;
  const sample = ctx.panel.map(p => ({ p, key: K.sha(SR.caseSelection.method.match(/"([^"]+)"/)[1] + p.id) })).sort((a, b) => a.key < b.key ? -1 : 1).slice(0, SR.caseSelection.listings).map(x => x.p);
  const cells = [], perListing = {}, parity = { compared: 0, missingInD2: 0, stateMismatch: 0, grossMismatch: 0 }, persistence = [];
  for (const h of SR.horizonsWeeks) {
    const cs = controlsByPatternH['above-40w-line:' + h], events = [];
    const d2 = new Map(d2Events[h].map(e => [e.securityId + '|' + e.signalDate, e]));
    for (const p of sample) {
      const r = K.S.runReplayValidation({ ...baseInput(ctx, h), listings: [K.listingOf(p)], pattern: SR.rule.pattern, cooldownBars: SR.rule.cooldownBars });
      for (const e of r.events) {
        const x = d2.get(p.id + '|' + e.signalDate); parity.compared++;
        if (!x) parity.missingInD2++; else { if (x.state !== e.state) parity.stateMismatch++; if (e.state === 'OBSERVED' && x.gross !== e.grossReturn) parity.grossMismatch++; }
        events.push({ securityId: p.id, signalDate: e.signalDate, state: e.state, reason: e.reasons ? e.reasons[0] : null, gross: e.completed ? e.grossReturn : null, bench: e.completed ? e.benchmarkReturn : null,
          maxDrawdown: e.completed ? e.maxDrawdown : null, entryDate: e.entryDate, exitDate: e.exitDate, expectedExitDate: e.expectedExitDate, entryClose: e.entryDate ? p.closes[p.dates.indexOf(e.entryDate)] : null, lastClose: p.closes[p.closes.length - 1] });
      }
    }
    for (const endpoint of SR.endpoints) {
      const c = cellFor(ctx, events, cs, h, endpoint, calIndex, inWindow, lifecycleById, { test: 'POOLED' });
      c.coverage = coverageOf(events, inWindow, cs, calIndex);
      c.drawdown = (() => { const dd = events.filter(e => e.state === 'OBSERVED' && inWindow(e.signalDate)).map(e => e.maxDrawdown); return { median: K.Signal.median(dd), p10: K.Signal.quantile(Float64Array.from(dd).sort(), 0.1) }; })();
      const byL = K.splitBy(rowsFor(events, endpoint, base, cs, calIndex, inWindow), r => r.securityId);
      const means = [...byL.values()].map(rs => K.mean(rs.map(r => r.value)));
      c.perListing = { listingsWithEvents: byL.size, shareOfListingsWithPositiveMean: means.length ? means.filter(m => m > 0).length / means.length : null, distribution: K.distribution(means) };
      cells.push(c);
    }
    // episodes per listing
    perListing[h] = sample.map(p => { const ev = events.filter(e => e.securityId === p.id && inWindow(e.signalDate)); return { securityId: p.id, episodes: ev.length, observed: ev.filter(e => e.state === 'OBSERVED').length }; });
    // persistence of the same stock's replay outcome (first half -> second half)
    const rows = rowsFor(events, 'BASE_RATE_EXCESS', base, cs, calIndex, inWindow), byL = K.splitBy(rows, r => r.securityId), pairs = [];
    for (const [id, rs] of byL) { rs.sort((a, b) => a.date < b.date ? -1 : 1); const m = Math.floor(rs.length / 2), a = rs.slice(0, m), b = rs.slice(m); if (a.length >= 2 && b.length >= 2) pairs.push({ securityId: id, factor: K.mean(a.map(x => x.value)), netReturn: K.mean(b.map(x => x.value)) }); }
    const rho = K.S.rankCorrelation(pairs), n = pairs.length, z = rho === null || n < 4 ? null : Math.atanh(Math.max(-0.999999, Math.min(0.999999, rho))) * Math.sqrt(n - 3);
    persistence.push({ test: 'PERSISTENCE', horizonWeeks: h, endpoint: 'BASE_RATE_EXCESS_FIRST_HALF_VS_SECOND_HALF', n, estimate: rho, pValue: z === null ? null : erfc(Math.abs(z) / Math.SQRT2), method: 'Spearman (research-studies.rankCorrelation), Fisher z approximate' });
  }
  const all = cells.concat(persistence), family = K.holmFamily(all);
  const ev = K.evidence({
    studyId: 'V10-SAME-STOCK-REPLAY-RULE', ruleVersion: { pattern: SR.rule.pattern, cooldownBars: SR.rule.cooldownBars, engine: K.S.VERSION },
    dataSource: { loaderOptions: ctx.loaderOptions, sourceManifestHash: ctx.manifestHash }, listingIdentity: R.population.identityRule,
    population: { caseSelection: SR.caseSelection, sampledListings: sample.map(p => p.id), sampleHash: K.V.hash(sample.map(p => p.id)), frame: ctx.panel.length },
    inclusionsExclusions: { frameExclusions: Object.fromEntries(Object.entries(ctx.fr.excluded).map(([k, v]) => [k, v.length])) }, period: { signalDates: R.window.signalDates }, dataAsOf: ctx.fr.calendar.at(-1),
    availability: R.timing, returnBasis: 'PRICE_RETURN', costs: R.costs, benchmark: R.benchmark, maturedOutcomes: Object.fromEntries(cells.filter(c => c.endpoint === 'RAW_NET').map(c => [c.horizonWeeks, c.coverage])),
    performance: all.map(c => ({ test: c.test, horizonWeeks: c.horizonWeeks, endpoint: c.endpoint, n: c.n, estimate: c.estimate, ci: c.ci ?? null, pValue: c.pValue, holmAdjustedP: c.holmAdjustedP, holmReject: c.holmReject })),
    drawdown: Object.fromEntries(cells.filter(c => c.endpoint === 'RAW_NET').map(c => [c.horizonWeeks, c.drawdown])), uncertainty: { pooled: R.inference.primary, persistence: SR.persistence.definition },
    multipleTesting: { ...family, definition: SR.family.definition }, separation: SR.separation, descriptiveViewUnchanged: true, dependence: SR.dependence, episodes: perListing, engineParityVsPatternEvidence: parity, cells, persistence,
    reproHash: K.C.hash({ registrationHash: ctx.reg.registrationHash, sourceManifestHash: ctx.manifestHash, sample: sample.map(p => p.id) }),
    scope: 'Rule-based replay of one fixed pattern on 200 hash-sampled current-classification listings; tests the rule and the informativeness of a stock\'s own history, not a market edge; descriptive single-stock view unchanged; not a certification.' });
  K.writeJson(path.join(ctx.dir, 'same-stock-replay-evidence.json'), ev);
  console.error('replay done', family, JSON.stringify(parity));
}

module.exports = { run, computeHits, patternEvents, outcomeState, patternsFromRegistration };
