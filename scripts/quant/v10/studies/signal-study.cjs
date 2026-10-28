'use strict';
// V10 STUDIES – E: Signal Backtest (event study of all five rules) + funded long-only strategy.
// Events and outcomes come from research-studies.runSignalStudy (per listing); the cross-sectional control
// (same-week non-signal observations) uses the identical outcome semantics and is parity-checked per event.
const path = require('node:path');
const K = require('./common.cjs');
const P = require(K.ROOT + '/quant/engines/research-portfolio.cjs');

// Detection flags per listing and rule (engine detect, reads closes up to k only).
function detectionFlags(panel, rules) {
  return panel.map(p => {
    const c = Array.from(p.closes), out = {};
    for (const r of rules) { const f = new Uint8Array(c.length); for (let k = Math.max(1, K.Signal.WARMUP_WEEKS); k < c.length; k++) if (r.detect(c, k, r.params)) f[k] = 1; out[r.id] = f; }
    return out;
  });
}
// Control gross sums per calendar index: all eligible+completed observations, and those with detect=true per rule.
function controlSums(ctx, flags, h, ruleIds) {
  const T = ctx.fr.calendar.length, all = { sum: new Float64Array(T), cnt: new Float64Array(T) }, det = {};
  for (const id of ruleIds) det[id] = { sum: new Float64Array(T), cnt: new Float64Array(T) };
  ctx.panel.forEach((p, i) => {
    for (let k = K.Signal.WARMUP_WEEKS; k < p.closes.length; k++) {
      if (!K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK)) continue;
      const g = K.forwardGross(p, k, h); if (g === null) continue;
      const c = p.cal[k]; all.sum[c] += g; all.cnt[c]++;
      for (const id of ruleIds) if (flags[i][id][k]) { det[id].sum[c] += g; det[id].cnt[c]++; }
    }
  });
  return { all, det };
}
const controlMeanGross = (cs, ruleId, c) => { const n = cs.all.cnt[c] - cs.det[ruleId].cnt[c]; return n > 0 ? { mean: (cs.all.sum[c] - cs.det[ruleId].sum[c]) / n, n } : null; };

function cellRows(events, endpoint, costs, cs, calIndex) {
  const rows = [];
  for (const e of events) {
    if (e.state !== 'OBSERVED') continue;
    const net = K.netOf(e.gross, costs.feeBps, costs.slippageBps);
    let value = null;
    if (endpoint === 'RAW_NET') value = net;
    else if (endpoint === 'SPY_EXCESS') value = e.bench === null ? null : net - e.bench;
    else { const m = controlMeanGross(cs, e.rule, calIndex.get(e.signalDate)); value = m ? net - K.netOf(m.mean, costs.feeBps, costs.slippageBps) : null; }
    if (value !== null) rows.push({ id: e.securityId + ':' + e.signalDate, date: e.signalDate, value, issuer: e.securityId, securityId: e.securityId });
  }
  return rows;
}
function inferenceRows(rows) {
  if (rows.length <= 100000) return rows;
  return rows.map(r => ({ r, k: K.sha('V10-STUDIES-SUBSAMPLE-1.0.0|' + r.securityId + '|' + r.date) })).sort((a, b) => a.k < b.k ? -1 : 1).slice(0, 100000).map(x => x.r);
}

async function run(ctx) {
  const R = ctx.R, SB = R.studies.SIGNAL_BACKTEST, base = R.costs.base, t0 = Date.now();
  const calIndex = new Map(ctx.fr.calendar.map((d, i) => [d, i])), inWindow = d => d >= R.window.signalDates[0] && d <= R.window.signalDates[1];
  const rules = SB.rules.map(id => K.Signal.RULE_BY_ID[id]);
  const flags = detectionFlags(ctx.panel, rules);
  const byId = new Map(ctx.panel.map(p => [p.id, p]));
  const lifecycleById = new Map(ctx.panel.map(p => [p.id, p.lifecycle]));
  const cells = [], perHorizon = {}, parity = { eventsCompared: 0, grossMismatch: 0, stateMismatch: 0, detectionCountMismatch: 0, controlEventFlagMismatch: 0 };
  const privateEvents = {};
  const engine = await K.runEngineParallel(ctx, 'signal', ctx.panel, SB.horizonsWeeks, { ruleIds: SB.rules });
  // Identity of the worker path (sliced calendar/benchmark) with the plain engine call on a hash subsample.
  const idSample = ctx.panel.map(p => ({ p, k: K.sha('V10-STUDIES-ENGINE-IDENTITY-1.0.0|' + p.id) })).sort((a, b) => a.k < b.k ? -1 : 1).slice(0, 25).map(x => x.p);
  const panelPos = new Map(ctx.panel.map((p, i) => [p.id, i])); idSample.sort((a, b) => panelPos.get(a.id) - panelPos.get(b.id));
  parity.workerIdentity = {};
  for (const h of [SB.horizonsWeeks[0], SB.horizonsWeeks.at(-1)]) {
    const direct = K.runEngineDirect(ctx, 'signal', idSample, h, { ruleIds: SB.rules }), ids = new Set(idSample.map(p => p.id));
    const fromWorker = engine[h].filter(e => ids.has(e.securityId)).map(e => ({ rule: e.rule, securityId: e.securityId, signalDate: e.signalDate, state: e.state, gross: e.gross, bench: e.bench, expectedExitDate: e.expectedExitDate }));
    parity.workerIdentity[h] = { listings: idSample.length, events: direct.length, identical: K.C.hash(direct) === K.C.hash(fromWorker) };
  }
  const ruleById = new Map(rules.map(r => [r.id, r]));
  for (const h of SB.horizonsWeeks) {
    const t1 = Date.now(), events = [];
    const byListing = K.splitBy(engine[h], e => e.securityId);
    for (const p of ctx.panel) {
      const dateIdx = new Map(p.dates.map((d, k) => [d, k]));
      const detected = {}; for (const id of SB.rules) detected[id] = 0;
      for (const e of byListing.get(p.id) || []) {
        detected[e.rule]++;
        const k = dateIdx.get(e.signalDate);
        // Parity of the control construction against the engine, per event.
        parity.eventsCompared++;
        const fg = K.forwardGross(p, k, h), elig = K.eligibleAt(p, k, K.SIGNAL_FEATURE_LOOKBACK);
        if ((elig && fg !== null) !== (e.state === 'OBSERVED')) parity.stateMismatch++;
        if (e.state === 'OBSERVED' && fg !== e.gross) parity.grossMismatch++;
        if (e.state === 'OBSERVED' && e.bench !== ctx.benchmark.ret(e.entryDate, e.exitDate)) parity.benchMismatch = (parity.benchMismatch || 0) + 1;
        if (inWindow(e.signalDate)) events.push(e);
      }
      for (const id of SB.rules) if (K.Signal.detectEvents(Array.from(p.closes), ruleById.get(id)).length !== detected[id]) parity.detectionCountMismatch++;
    }
    // Each engine event must carry detect=true in the control flags (so it is never its own control).
    const idx = new Map(ctx.panel.map((p, i) => [p.id, i]));
    for (const e of events) { const p = byId.get(e.securityId), k = p.dates.indexOf(e.signalDate); if (!flags[idx.get(e.securityId)][e.rule][k]) parity.controlEventFlagMismatch++; }
    const cs = controlSums(ctx, flags, h, SB.rules);
    privateEvents[h] = events;
    // Basis-rate table (all eligible completed observations, window signal weeks).
    let bs = 0, bn = 0; const dateMeans = [];
    for (const d of ctx.studyCalendar) { const c = calIndex.get(d); if (cs.all.cnt[c] > 0) { bs += cs.all.sum[c]; bn += cs.all.cnt[c]; dateMeans.push(K.netOf(cs.all.sum[c] / cs.all.cnt[c], base.feeBps, base.slippageBps)); } }
    perHorizon[h] = { baseRate: { observations: bn, pooledMeanNet: bn ? K.netOf(bs / bn, base.feeBps, base.slippageBps) : null, meanOfWeeklyMeansNet: K.mean(dateMeans), weeksWithControls: dateMeans.length }, seconds: null };
    for (const rule of SB.rules) {
      const ev = events.filter(e => e.rule === rule);
      const states = ev.reduce((a, e) => { const k = e.state + (e.reason ? ':' + e.reason : ''); a[k] = (a[k] || 0) + 1; return a; }, {});
      const observed = ev.filter(e => e.state === 'OBSERVED');
      const coverage = { events: ev.length, states, observed: observed.length, immature: ev.filter(e => e.state === 'IMMATURE').length, censored: ev.filter(e => e.state === 'CENSORED').length, ineligible: ev.filter(e => e.state === 'INELIGIBLE').length,
        observedWithoutSpy: observed.filter(e => e.bench === null).length, observedWithoutControl: observed.filter(e => !controlMeanGross(cs, rule, calIndex.get(e.signalDate))).length, listings: new Set(observed.map(e => e.securityId)).size,
        maxDrawdownMedian: K.Signal.median(observed.map(e => e.maxDrawdown)) };
      for (const endpoint of SB.endpoints) {
        const rows = cellRows(ev, endpoint, base, cs, calIndex), infRows = inferenceRows(rows), B = K.blockLengthFor(h);
        const primary = K.blockInference(ctx.studyCalendar, infRows, B), robust = B === 104 ? primary : K.blockInference(ctx.studyCalendar, infRows, 104);
        const censored = ev.filter(e => e.state === 'CENSORED');
        const cell = { rule, horizonWeeks: h, endpoint, n: rows.length, estimate: K.mean(rows.map(r => r.value)), inferenceSubsampled: infRows.length !== rows.length,
          ci: primary.ci, pValue: primary.pValue, blockLength: B, block: primary, robustness104: { ci: robust.ci, pValue: robust.pValue, blockLength: 104 }, cluster: K.clusterInference(rows), distribution: K.distribution(rows.map(r => r.value)),
          regimes: K.regimeTable(rows, ctx.regimes), subperiods: K.subperiodTable(rows),
          costSensitivity: R.costs.sensitivity.map(c => { const rr = cellRows(ev, endpoint, c, cs, calIndex); return { ...c, n: rr.length, mean: K.mean(rr.map(r => r.value)) }; }),
          survivorship: K.survivorshipSensitivity(rows, censored.map(e => ({ securityId: e.securityId, entryDate: e.entryDate, entryClose: e.entryClose, expectedExitDate: e.expectedExitDate, lastClose: e.lastClose, controlNet: (m => m ? K.netOf(m.mean, base.feeBps, base.slippageBps) : null)(controlMeanGross(cs, rule, calIndex.get(e.signalDate))) })), lifecycleById, base, ctx.benchmark, endpoint),
          coverage };
        if (rule === 'NEW_52W_HIGH') cell.v9Subsets = v9Subsets(rows, ctx);
        cells.push(cell);
      }
    }
    perHorizon[h].seconds = (Date.now() - t1) / 1000;
    console.error('signal h', h, perHorizon[h].seconds, 's');
  }
  const family = K.holmFamily(cells);
  K.writeJson(path.join(ctx.dir, 'signal-events.json.gz'), { registrationHash: ctx.reg.registrationHash, events: privateEvents }, true);
  const funded = runFunded(ctx, flags);
  const ev = K.evidence({
    studyId: 'V10-SIGNAL-BACKTEST', ruleVersion: Object.fromEntries(rules.map(r => [r.id, r.version])), ruleEngine: { signalBacktest: K.Signal.VERSION, researchStudies: K.S.VERSION },
    dataSource: { loader: 'research-weekly-loader.createResearchLoader', loaderOptions: ctx.loaderOptions, sourceManifestHash: ctx.manifestHash, series: K.SERIES_DIR, benchmark: ctx.benchmark.provenance },
    listingIdentity: ctx.R.population.identityRule,
    population: { rule: R.population.frameRule, cohortMode: R.population.cohortMode, frame: ctx.fr.frame.length, qualified: ctx.fr.qualified.length, frameIdsHash: K.V.hash(ctx.fr.frame) },
    inclusionsExclusions: { qualificationCounts: ctx.fr.reasons, frameExclusions: Object.fromEntries(Object.entries(ctx.fr.excluded).map(([k, v]) => [k, v.length])) },
    period: { signalDates: R.window.signalDates, studyCalendarWeeks: ctx.studyCalendar.length, firstWeek: ctx.studyCalendar[0], lastWeek: ctx.studyCalendar.at(-1) },
    dataAsOf: ctx.fr.calendar.at(-1), availability: R.timing, returnBasis: 'PRICE_RETURN', costs: R.costs, benchmark: R.benchmark,
    maturedOutcomes: Object.fromEntries(SB.horizonsWeeks.map(h => [h, Object.fromEntries(SB.rules.map(rule => { const c = cells.find(x => x.rule === rule && x.horizonWeeks === h && x.endpoint === 'RAW_NET').coverage; return [rule, { events: c.events, observed: c.observed, immature: c.immature, censored: c.censored, ineligible: c.ineligible }]; }))])),
    performance: cells.map(c => ({ rule: c.rule, horizonWeeks: c.horizonWeeks, endpoint: c.endpoint, n: c.n, estimate: c.estimate, ci: c.ci, pValue: c.pValue, holmAdjustedP: c.holmAdjustedP, holmReject: c.holmReject, hitRate: c.distribution.hitRate, median: c.distribution.median })),
    drawdown: 'Per-event max drawdown within the holding window (engine) in cells[].coverage.maxDrawdownMedian; portfolio drawdown in funded-strategy-evidence.json',
    uncertainty: { method: R.inference.primary, blockLength: R.inference.blockLength, replicates: R.inference.replicates, seed: R.inference.seed, secondary: R.inference.secondary },
    multipleTesting: { ...family, definition: SB.family.definition },
    controls: R.controls.signal, baseRate: perHorizon, engineParity: parity,
    cells,
    reproHash: K.C.hash({ registrationHash: ctx.reg.registrationHash, sourceManifestHash: ctx.manifestHash, code: K.codeHashes(['scripts/quant/v10/studies/signal-study.cjs']) }),
    scope: 'Retrospective development study on explored 2000-2025 history; current-classification survivor frame (unless the lifecycle loader configuration is used); weekly split-adjusted PRICE_RETURN; long event outcomes only; no funded execution proof, no total return, no historical membership. Not a certification.'
  });
  K.writeJson(path.join(ctx.dir, 'signal-backtest-evidence.json'), ev);
  K.writeJson(path.join(ctx.dir, 'funded-strategy-evidence.json'), funded);
  K.writeJson(path.join(ctx.dir, 'parity-engine-signal.json'), parity);
  console.error('signal done', (Date.now() - t0) / 1000, 's', JSON.stringify(parity), family);
}

function v9Subsets(rows, ctx) {
  const v9 = K.readJson(path.join(K.ROOT, 'docs/quant-recovery/v9/sensitivity/registration-1.0.0.json'));
  const p1 = new Set(v9.registration.populations.P1.ids);
  const a = rows.filter(r => p1.has(r.securityId)), b = rows.filter(r => !p1.has(r.securityId));
  return { note: 'Descriptive replication check against V9 (different loader configuration and frame; not a new test).', P1: { listings: new Set(a.map(r => r.securityId)).size, n: a.length, mean: K.mean(a.map(r => r.value)) }, frameMinusP1: { listings: new Set(b.map(r => r.securityId)).size, n: b.length, mean: K.mean(b.map(r => r.value)) } };
}

// ---------- funded long-only strategy (research-portfolio, price simulation) ----------
// Deviation from the registration (numeraire only): the ledger runs with initial capital 1 instead of 100,000.
// research-portfolio removes a sold-out position only if |units| <= 1e-12 (absolute); selling a position to
// weight 0 can leave float dust above that bound for large unit counts, which then fails EXACT_PRICE_UNAVAILABLE
// at the next session without a bar. All results are returns; the engine's other tolerances are relative to the
// initial capital, so the scaling does not change any reported return. Reported capital is rescaled to 100,000.
const LEDGER_CAPITAL = 1;
// research-portfolio ids allow [A-Za-z0-9_:./-]; other listing ids get a deterministic hashed ledger id.
const ledgerId = listingId => /^[A-Za-z0-9_:./-]{1,160}$/.test(listingId) ? listingId : 'ledger:' + K.sha(listingId).slice(0, 32);
function fundedSchedule(ctx, flags, rule, F) {
  const cal = ctx.fr.calendar, ci = new Map(cal.map((d, i) => [d, i]));
  const jFirst = ci.get(ctx.studyCalendar[0]), jLast = ci.get(ctx.studyCalendar.at(-1)), H = F.holdingWeeks, N = F.maxPositions;
  const lastSession = jLast + 1 + H;
  if (lastSession >= cal.length) throw Error('FUNDED_LAST_SESSION_BEYOND_CALENDAR');
  const universe = ctx.panel.map((p, i) => ({ p, i })).filter(({ p }) => p.gap[p.closes.length] === 0 && p.cal[p.closes.length - 1] >= lastSession);
  const signals = new Map();
  for (const { p, i } of universe) {
    const f = flags[i][rule];
    for (const k of K.Signal.detectEvents(Array.from(p.closes), K.Signal.RULE_BY_ID[rule])) {
      if (!f[k]) throw Error('DETECTION_FLAG_MISMATCH');
      const j = p.cal[k]; if (j < jFirst || j > jLast || p.dates[k] < p.listingStart) continue;
      if (!signals.has(j)) signals.set(j, []); signals.get(j).push(p);
    }
  }
  const held = new Map(), targets = [], episodes = []; let skippedNoSlot = 0, signalCount = 0;
  for (let j = jFirst; j < lastSession; j++) {
    const exec = j + 1; let changed = false;
    for (const [id, e] of [...held]) if (e.entryExec + H === exec) { held.delete(id); changed = true; e.ep.exitExec = exec; }
    if (j <= jLast) {
      const cands = (signals.get(j) || []).filter(p => !held.has(p.id)).map(p => ({ p, key: K.sha('V10-STUDIES-FUNDED-1.0.0|' + p.id + '|' + cal[j]) })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      signalCount += (signals.get(j) || []).length;
      const free = N - held.size;
      cands.slice(0, Math.max(0, free)).forEach(({ p }) => { const ep = { securityId: p.id, listingId: p.listingId, signalDate: cal[j], entryExec: exec, exitExec: null }; episodes.push(ep); held.set(p.id, { entryExec: exec, p, ep }); changed = true; });
      skippedNoSlot += Math.max(0, cands.length - Math.max(0, free));
    }
    if (changed) targets.push({ decision: j, exec, weights: Object.fromEntries([...held.values()].map(e => [ledgerId(e.p.listingId), 1 / N]).sort((a, b) => a[0] < b[0] ? -1 : 1)) });
  }
  if (held.size) throw Error('FUNDED_POSITIONS_NOT_CLOSED');
  return { jFirst, jLast, lastSession, universe: universe.map(x => x.p), targets, episodes, skippedNoSlot, signalCount };
}
function fundedInput(ctx, sch, costs, F) {
  const cal = ctx.fr.calendar, sessions = cal.slice(sch.jFirst, sch.lastSession + 1), closeAt = d => d + 'T23:59:59.999Z';
  const used = new Map();
  for (const ep of sch.episodes) { if (!used.has(ep.securityId)) used.set(ep.securityId, []); used.get(ep.securityId).push(ep); }
  const byId = new Map(ctx.panel.map(p => [p.id, p]));
  const listings = [...used].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([id, eps]) => {
    const p = byId.get(id), idx = new Set();
    for (const ep of eps) for (let s = ep.entryExec; s <= ep.exitExec; s++) idx.add(s);
    const bars = p.dates.map((date, k) => ({ k, date })).filter(x => idx.has(p.cal[x.k])).map(x => ({ date: x.date, close: p.closes[x.k], availableAt: closeAt(x.date) }));
    if (bars.length !== idx.size) throw Error('FUNDED_BAR_MISSING:' + id);
    return { listingId: ledgerId(p.listingId), issuerId: ledgerId(p.id), mic: p.mic, instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: p.dates[0], lastTradeDate: null, events: [], bars, _first: p.dates[0], _last: p.dates.at(-1) };
  });
  const snapIdx = []; for (let s = sch.jFirst; s <= sch.lastSession; s += 4) snapIdx.push(s);
  const memberships = snapIdx.map(s => { const d = cal[s], members = listings.filter(l => l._first <= d && l._last >= d).map(l => l.listingId); return { effectiveAt: d + 'T00:00:00Z', availableAt: d + 'T00:00:00Z', sourceHash: K.V.hash({ d, members }), members }; });
  const snapFor = j => memberships[Math.floor((j - sch.jFirst) / 4)];
  const targets = sch.targets.map(t => ({ decisionDate: cal[t.decision], executionDate: cal[t.exec], availableAt: closeAt(cal[t.decision]), membershipHash: snapFor(t.decision).sourceHash, weights: t.weights }));
  for (const l of listings) { delete l._first; delete l._last; }
  return { sessions: sessions.map(date => ({ date, closeAt: closeAt(date) })), initialCapital: LEDGER_CAPITAL, currency: 'USD', returnBasis: 'PRICE_RETURN',
    provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: ctx.manifestHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' },
    costs: { basis: 'PER_SIDE_NOTIONAL', ...costs }, maxMembershipAgeDays: 45, maxFactorAgeDays: 45, listings, factorSnapshots: [], memberships, targets,
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', sourceHash: ctx.benchmark.provenance.sourceBytesHash, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: sessions.map(date => { const v = ctx.benchmark.byDate.get(date); if (!v) throw Error('FUNDED_SPY_MISSING:' + date); return { date, level: v }; }) } };
}
function sharpe(rets) { const m = K.mean(rets), sd = Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1)); return { annualisedMean: m * 52, annualisedVolatility: sd * Math.sqrt(52), sharpe: sd > 0 ? m / sd * Math.sqrt(52) : null }; }
function runFunded(ctx, flags) {
  const F = ctx.R.studies.SIGNAL_BACKTEST.fundedStrategy, out = [], diffCells = [];
  for (const rule of F.rules) {
    const sch = fundedSchedule(ctx, flags, rule, F.parameters), variants = {};
    for (const [name, costs] of [['base', F.parameters.costs], ['costSensitivity', F.parameters.costSensitivity]]) {
      const input = fundedInput(ctx, sch, costs, F.parameters), r = P.runPortfolio(input);
      const values = [LEDGER_CAPITAL, ...r.equity.map(e => e.value)], spy = [LEDGER_CAPITAL, ...r.equity.map(e => e.benchmark)];
      const rs = values.slice(1).map((v, i) => v / values[i] - 1), rb = spy.slice(1).map((v, i) => v / spy[i] - 1);
      const cmp = K.B.compare(ctx.benchmark, r.equity.map(e => ({ date: e.date, value: e.value })), { totalReturn: r.metrics.cumulativeReturn, cagr: r.metrics.cagr }, 'USD', LEDGER_CAPITAL);
      const invested = K.mean(r.equity.map(e => e.value > 0 ? (e.value - e.cash) / e.value : 0));
      const diffRows = r.equity.map((e, i) => ({ id: e.date, date: e.date, value: rs[i] - rb[i] }));
      const inf = K.blockInference(r.equity.map(e => e.date), diffRows, 52);
      variants[name] = { costs, ledgerInitialCapital: LEDGER_CAPITAL, endCapitalPer100k: r.endCapital / LEDGER_CAPITAL * F.parameters.initialCapital, inputHash: r.inputHash, resultHash: r.resultHash, generation: r.generation, sessions: r.equity.length, from: r.equity[0].date, to: r.equity.at(-1).date,
        listingsUsed: input.listings.length, trades: r.trades.length, rebalances: r.rebalances.length, endCapital: r.endCapital, metrics: r.metrics, ...sharpe(rs), averageInvestedShare: invested,
        spy: { endCapital: cmp.endCapital, totalReturn: cmp.totalReturn, cagr: cmp.cagr, maxDrawdown: cmp.maxDrawdown, ...sharpe(rb), state: cmp.state }, excessCagr: cmp.excessCagr, excessTotalReturn: cmp.excessTotalReturn,
        weeklyDifference: { n: inf.n, estimate: inf.estimate, ci: inf.ci, pValue: inf.pValue, blockLength: 52 }, limitations: r.limitations };
      if (name === 'base') { diffCells.push({ rule, pValue: inf.pValue, estimate: inf.estimate }); K.writeJson(path.join(ctx.dir, 'funded-' + rule + '-equity.json.gz'), { equity: r.equity.map(e => [e.date, e.value, e.cash, e.benchmark]), episodes: sch.episodes, targets: input.targets.length }, true); }
    }
    out.push({ rule, universe: { listings: sch.universe.length, excludedFromFrame: ctx.panel.length - sch.universe.length }, signalsInUniverse: sch.signalCount, episodes: sch.episodes.length, skippedNoFreeSlot: sch.skippedNoSlot, variants });
  }
  const family = K.holmFamily(diffCells);
  out.forEach(o => { const c = diffCells.find(x => x.rule === o.rule); o.variants.base.weeklyDifference.holmAdjustedP = c.holmAdjustedP; o.variants.base.weeklyDifference.holmReject = c.holmReject; });
  return K.evidence({ studyId: 'V10-SIGNAL-FUNDED-LONG-ONLY', ruleVersion: Object.fromEntries(F.rules.map(r => [r, K.Signal.RULE_BY_ID[r].version])), engine: P.VERSION,
    dataSource: { loaderOptions: ctx.loaderOptions, sourceManifestHash: ctx.manifestHash }, listingIdentity: ctx.R.population.identityRule,
    population: { rule: F.rules_detail[4], frame: ctx.panel.length }, inclusionsExclusions: out.map(o => ({ rule: o.rule, ...o.universe })),
    period: { decisions: ctx.R.window.signalDates }, dataAsOf: ctx.fr.calendar.at(-1), availability: F.rules_detail, returnBasis: 'PRICE_RETURN (virtual split-adjusted units)', costs: { base: F.parameters.costs, sensitivity: F.parameters.costSensitivity },
    benchmark: 'SPY buy-and-hold price return over the same sessions, no costs', maturedOutcomes: 'All positions closed inside the data (last exit before asOf).', parameters: F.parameters,
    performance: out, drawdown: 'metrics.maxDrawdown per variant', uncertainty: F.inference, multipleTesting: { ...family, definition: 'Holm over the three funded strategies (weekly return difference vs SPY)' },
    reproHash: K.C.hash({ registrationHash: ctx.reg.registrationHash, sourceManifestHash: ctx.manifestHash, results: out.map(o => o.variants.base.resultHash) }),
    scope: 'Fixed-parameter long-only price simulation on a current-classification cohort with split-adjusted virtual units, no dividends, no cash interest, no terminal events, no capacity model; parameters fixed before the run; not a certification.' });
}

module.exports = { run, fundedSchedule, fundedInput, controlSums, detectionFlags };
