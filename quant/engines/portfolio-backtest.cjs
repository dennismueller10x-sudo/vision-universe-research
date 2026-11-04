'use strict';
// VU-Portfolio-Standard, historischer Walk-forward-Lauf (portfolio-backtest-1.0.0). Forschung, nicht zertifiziert.
//
// Ablauf je Rebalancing-Stichtag t (Wochenschluss), alles nur mit Daten <= t:
//   1. PIT-Universum: Titel mit Kurs zu t, mindestens riskWindowWeeks+1 Wochen Historie, nicht vor t beendet, Branche bekannt.
//   2. Faktoren rekonstruieren (portfolio-pit-factors.cjs), Profilscore, Liquidität (ADV oder Marktkapitalisierung).
//   3. Risikomodell auf den letzten riskWindowWeeks Wochenrenditen (Ledoit/Wolf), Konstruktion nach dem Standard
//      (portfolio-construction.cjs).
//   4. Ausführung zum Schluss der nächsten Woche. Titel ohne Kurs zur Ausführung (z. B. delistet) bleiben Cash.
// Der Ledger ist research-portfolio.cjs#runPortfolio, unverändert: Gebühr + Slippage je Seite pauschal, delistete Titel
// über TERMINAL_CASH-Ereignisse. Der titelabhängige halbe Spread wird je Handelstag als anteiliger Abschlag auf den
// Portfoliowert gebucht (SPREAD_PROPORTIONAL_EQUITY_HAIRCUT_AT_TRADE_SESSION). Kennzahlen: backtest-metrics.cjs.
// Walk-forward: keine Größe wird auf Ergebnissen angepasst; Regeln sind fest vorregistriert, Risikomodell und Scores werden
// rollierend nur aus der Vergangenheit geschätzt. Berichtet wird zusätzlich je festem Testfenster (Folds).
const crypto = require('node:crypto');
const P = require('./research-portfolio.cjs');
const M = require('./backtest-metrics.cjs');
const F = require('./portfolio-pit-factors.cjs');
const C = require('./portfolio-construction.cjs');
const VERSION = 'portfolio-backtest-1.0.0';

const DEFAULTS = Object.freeze({ rebalanceWeeks: 4, riskWindowWeeks: 104, candidatePool: 90, initialCapital: 1e6, foldYears: 3,
  // Endwert delisteter Titel je Klasse (Anteil des letzten Schlusses), vorregistrierte Annahme; Sensitivität im Bericht.
  terminalRecovery: { MERGER: 1, UNKNOWN: 0.7, DISTRESS: 0, SERIES_END: 1 } });

const isNum = x => typeof x === 'number' && Number.isFinite(x);
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : P.canonical(x)).digest('hex');
function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }
const at = d => d + 'T23:59:59.999Z';

// panel = { calendar: [YYYY-MM-DD], basis: 'TOTAL_RETURN'|'PRICE_RETURN', benchmark: {label, levels: number[] (NaN fehlt), sourceHash},
//           securities: [{id, sector, mic, adj: number[], raw: number[], dv: number[]|null, bundle|null, terminal: {lastIdx, kind}|null}],
//           provenance: {datasetHash, identityEvidence, populationEvidence, corporateActionEvidence, lifecycleEvidence, licenseEvidence} }
function validatePanel(panel) {
  if (!panel || !Array.isArray(panel.calendar) || panel.calendar.length < 60) fail('PANEL_CALENDAR_REQUIRED');
  if (!['TOTAL_RETURN', 'PRICE_RETURN'].includes(panel.basis)) fail('PANEL_BASIS_REQUIRED');
  const T = panel.calendar.length;
  if (!panel.benchmark || panel.benchmark.levels.length !== T) fail('PANEL_BENCHMARK_REQUIRED');
  for (const s of panel.securities) if (s.adj.length !== T || s.raw.length !== T || (s.dv && s.dv.length !== T)) fail('PANEL_SERIES_LENGTH', s.id);
  if (panel.basis === 'PRICE_RETURN' && panel.securities.some(s => s.terminal)) fail('PRICE_RETURN_PANEL_IS_SURVIVOR_ONLY');
  return T;
}
function firstIndex(s) { if (s._first === undefined) s._first = s.adj.findIndex(x => x > 0); return s._first; }

// Ein Stichtag: Kandidaten mit Profilscore und Risikohistorie.
function decide(panel, t, cfg, std) {
  const W = cfg.riskWindowWeeks, date = panel.calendar[t], rows = [], secs = [];
  for (const s of panel.securities) {
    if (!(s.adj[t] > 0) || !s.sector) continue;
    const f0 = firstIndex(s);
    if (f0 < 0 || t - f0 < W) continue;
    if (s.terminal && s.terminal.lastIdx < t) continue;
    const pf = F.priceFactors(s.adj, t), ff = F.fundamentalFactors(s.bundle, date, s.raw[t]);
    rows.push({ id: s.id, ...pf, ...ff }); secs.push(s);
  }
  const fam = F.familyScores(rows), score = F.profileScores(cfg.profileId, fam, cfg.profileFamilies);
  const cands = [];
  rows.forEach((r, i) => {
    if (!isNum(score[i])) return;
    const s = secs[i];
    cands.push({ id: s.id, score: score[i], sector: s.sector, price: s.raw[t], dollarVolume: s.dv ? s.dv[t] : undefined, marketCap: isNum(r.marketCap) ? r.marketCap : undefined, sec: s });
  });
  const liquid = cands.filter(c => C.liquidity(c, std).eligible).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const pool = [], returnsById = new Map();
  for (const c of liquid) {
    if (pool.length >= cfg.candidatePool) break;
    const a = c.sec.adj, r = [];
    let ok = true;
    for (let k = t - W + 1; k <= t; k++) { if (!(a[k] > 0) || !(a[k - 1] > 0)) { ok = false; break; } r.push(a[k] / a[k - 1] - 1); }
    if (!ok) continue;
    returnsById.set(c.id, r); pool.push(c);
  }
  const built = C.construct({ candidates: pool.map(({ sec, ...c }) => c), returnsById, weighting: cfg.weighting, standard: cfg.standard });
  return { date, universe: rows.length, scored: cands.length, liquid: liquid.length, pool: pool.length, built };
}

function runModelPortfolio(panel, config) {
  const T = validatePanel(panel);
  const cfg = { ...DEFAULTS, ...config, terminalRecovery: { ...DEFAULTS.terminalRecovery, ...(config.terminalRecovery || {}) } };
  if (!F.PROFILES[cfg.profileId] && !Array.isArray(cfg.profileFamilies)) fail('PROFILE_UNKNOWN', cfg.profileId);
  const std = C.standardOf(cfg.standard || {});
  const cal = panel.calendar, bench = panel.benchmark.levels;
  const idx = [...cal.keys()].filter(i => cal[i] >= cfg.window[0] && cal[i] <= cfg.window[1] && bench[i] > 0);
  if (idx.length < 60) fail('WINDOW_TOO_SHORT');
  for (let k = 1; k < idx.length; k++) if (idx[k] !== idx[k - 1] + 1) fail('BENCHMARK_GAP_IN_WINDOW', cal[idx[k]]);
  const first = idx[0], last = idx.at(-1), byId = new Map(panel.securities.map(s => [s.id, s]));
  // 1.-3. Entscheidungen
  const decisions = [];
  for (let t = first; t < last; t += cfg.rebalanceWeeks) decisions.push({ t, ...decide(panel, t, cfg, std) });
  // 4. Ziele zur Ausführung t+1; Titel ohne Kurs dann (oder schon beendet) bleiben Cash.
  const targets = [], memberships = [], unfilled = [];
  for (const d of decisions) {
    // Nicht konstruierbar (zu wenige geeignete Titel): kein Ziel, der Bestand läuft bis zum nächsten Stichtag unverändert weiter.
    if (d.built.state !== 'CONSTRUCTED') continue;
    const e = d.t + 1, w = {};
    for (const [id, x] of Object.entries(d.built.weights || {})) {
      const s = byId.get(id);
      if (s.adj[e] > 0 && !(s.terminal && s.terminal.lastIdx < e)) w[id] = x; else unfilled.push({ date: cal[e], id, weight: x });
    }
    const members = Object.keys(w).sort(), mh = sha({ date: d.date, members, profile: cfg.profileId });
    memberships.push({ effectiveAt: d.date + 'T00:00:00Z', availableAt: d.date + 'T00:00:00Z', sourceHash: mh, members });
    targets.push({ decisionDate: d.date, executionDate: cal[e], availableAt: at(d.date), membershipHash: mh, weights: w });
  }
  // Haltebereiche je Titel: von der Ausführung eines Ziels mit dem Titel bis zur Ausführung des ersten Ziels ohne ihn.
  const intervals = new Map();
  targets.forEach((tg, k) => {
    const e = cal.indexOf(tg.executionDate);
    for (const id of Object.keys(tg.weights)) {
      let end = last;
      for (let j = k + 1; j < targets.length; j++) if (!(tg.weights && targets[j].weights[id] > 0)) { end = cal.indexOf(targets[j].executionDate); break; }
      if (!intervals.has(id)) intervals.set(id, []);
      intervals.get(id).push([e, end]);
    }
  });
  const listings = [], carried = [], terminalEvents = [];
  let seq = 0;
  for (const [id, ivs] of [...intervals].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const s = byId.get(id), need = new Set();
    let termIdx = null;
    if (s.terminal && s.terminal.lastIdx < last) termIdx = s.terminal.lastIdx;
    // Reihe endet ohne Terminal-Angabe vor dem Fensterende: als SERIES_END behandelt (letzter Schluss).
    let lastObs = T - 1; while (lastObs >= 0 && !(s.adj[lastObs] > 0)) lastObs--;
    if (termIdx === null && lastObs < last) termIdx = lastObs;
    for (const [a, b] of ivs) for (let i = a; i <= b; i++) { if (termIdx !== null && i > termIdx) break; need.add(i); }
    const bars = [];
    let prev = null;
    for (const i of [...need].sort((x, y) => x - y)) {
      let close = s.adj[i];
      if (!(close > 0)) { for (let j = i - 1; j >= 0; j--) if (s.adj[j] > 0) { close = s.adj[j]; break; } carried.push({ id, date: cal[i] }); }
      if (!(close > 0)) fail('NO_PRICE_FOR_HELD_LISTING', id + '@' + cal[i]);
      bars.push({ date: cal[i], close, availableAt: at(cal[i]) }); prev = i;
    }
    const events = [];
    let lastTradeDate = null;
    if (termIdx !== null && termIdx < last && [...need].some(i => i <= termIdx)) {
      const kind = s.terminal ? s.terminal.kind : 'SERIES_END', rec = cfg.terminalRecovery[kind];
      if (!isNum(rec)) fail('TERMINAL_RECOVERY_UNKNOWN', kind);
      const eff = cal[termIdx + 1], lastClose = bars.filter(b => b.date <= cal[termIdx]).at(-1).close;
      lastTradeDate = bars.at(-1).date;
      events.push({ id: 'term:' + id, type: 'TERMINAL_CASH', effectiveDate: eff, availableAt: at(eff), payDate: eff, amount: lastClose * rec, currency: 'USD', sequence: seq++, sourceHash: sha({ id, kind, rec, lastClose, eff }) });
      terminalEvents.push({ id, kind, recovery: rec, lastTradeDate, effectiveDate: eff });
    }
    listings.push({ listingId: id, issuerId: id, mic: s.mic || 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: bars[0].date, lastTradeDate, events, bars });
  }
  // Ziele, die einen bereits beendeten Titel enthalten würden, gibt es nicht (Filter oben). Leere Ziele = alles Cash.
  const sessions = idx.map(i => ({ date: cal[i], closeAt: at(cal[i]) }));
  const tr = panel.basis === 'TOTAL_RETURN';
  const pv = panel.provenance;
  const provenance = tr
    ? { mode: 'HISTORICAL_OBSERVED', datasetHash: pv.datasetHash, identityEvidence: pv.identityEvidence, populationEvidence: pv.populationEvidence, corporateActionEvidence: pv.corporateActionEvidence,
      lifecycleEvidence: pv.lifecycleEvidence, licenseEvidence: pv.licenseEvidence, historicalPopulation: 'ALL_THEN_TRADEABLE_LISTINGS', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 }
    : { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: pv.datasetHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' };
  const usedTargets = targets.filter(tg => Object.keys(tg.weights).length || true);
  const input = { sessions, initialCapital: cfg.initialCapital, currency: 'USD', returnBasis: panel.basis, provenance,
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: std.feeBps, slippageBps: std.slippageBps }, maxMembershipAgeDays: 7 * cfg.rebalanceWeeks + 7, maxFactorAgeDays: 45,
    listings: listings.length ? listings : [], memberships, factorSnapshots: [],
    targets: usedTargets.map(tg => ({ ...tg, weights: tg.weights })),
    benchmark: { currency: 'USD', returnBasis: panel.basis, sourceHash: panel.benchmark.sourceHash, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: idx.map(i => ({ date: cal[i], level: bench[i] })) } };
  if (!listings.length) return { schemaVersion: VERSION, certification: 'NOT_CERTIFIED', label: 'Forschung, nicht zertifiziert', productionApproved: false, state: 'NO_PORTFOLIO_CONSTRUCTED',
    profileId: cfg.profileId, weighting: cfg.weighting, standard: std.id, basis: panel.basis, window: [cal[first], cal[last]],
    construction: { rebalances: decisions.length, constructed: 0, averageUniverse: decisions.reduce((s, d) => s + d.universe, 0) / decisions.length, averageScored: decisions.reduce((s, d) => s + d.scored, 0) / decisions.length } };
  const result = P.runPortfolio(input);
  // Spread: halber Spread je Titel zum letzten Entscheidungsstichtag vor dem Handel (Liquidität zu t).
  const hsAt = new Map(); // date -> Map(id -> bps)
  decisions.forEach(d => { const e = cal[d.t + 1]; hsAt.set(e, d.built.halfSpreadBps || {}); });
  const lastHs = new Map();
  const spreadByDate = new Map();
  let lastDecisionHs = {};
  const tradesByDate = new Map();
  for (const tr0 of result.trades) { if (!tradesByDate.has(tr0.date)) tradesByDate.set(tr0.date, []); tradesByDate.get(tr0.date).push(tr0); }
  const spreadTrades = [];
  for (const e of result.equity) {
    if (hsAt.has(e.date)) { lastDecisionHs = hsAt.get(e.date); for (const [k, v] of Object.entries(lastDecisionHs)) lastHs.set(k, v); }
    const ts = tradesByDate.get(e.date) || [];
    let sum = 0;
    for (const x of ts) {
      const bps = lastHs.has(x.listingId) ? lastHs.get(x.listingId) : C.SPREAD_BY_ADV.at(-1)[1];
      const sp = x.notional * bps / 10000; sum += sp;
      spreadTrades.push({ ...x, spread: sp, halfSpreadBps: bps });
    }
    if (sum) spreadByDate.set(e.date, sum);
  }
  let factor = 1;
  const rows = result.equity.map(e => {
    const sp = spreadByDate.get(e.date) || 0;
    if (sp) factor *= 1 - sp / e.value;
    return { date: e.date, value: e.value * factor, cash: e.cash * factor, benchmark: e.benchmark };
  });
  const ledger = { initialCapital: cfg.initialCapital, rows, trades: spreadTrades.map(x => ({ date: x.date, listingId: x.listingId, side: x.side, notional: x.notional, units: x.units, fee: x.fee, slippage: x.slippage + x.spread })) };
  const benchLabel = panel.benchmark.label;
  const metrics = M.computeMetrics(ledger, { benchmarkLabel: benchLabel });
  const gross = M.computeMetrics(M.fromPortfolio(result), { benchmarkLabel: benchLabel });
  // Folds: feste Kalenderfenster foldYears; Kennzahlen auf dem Teilpfad (Start = Wert am Fensteranfang).
  const folds = [];
  const y0 = Number(rows[0].date.slice(0, 4)), y1 = Number(rows.at(-1).date.slice(0, 4));
  for (let y = y0; y <= y1; y += cfg.foldYears) {
    const from = y + '-01-01', to = (y + cfg.foldYears - 1) + '-12-31';
    const sub = rows.filter(r => r.date >= from && r.date <= to);
    if (sub.length < 26) continue;
    const m = M.computeMetrics({ initialCapital: sub[0].value, rows: sub }, { benchmarkLabel: benchLabel });
    folds.push({ from: sub[0].date, to: sub.at(-1).date, totalReturn: m.returns.totalReturn, cagr: m.returns.cagr, vol: m.risk.annualizedVolatility, maxDrawdown: m.risk.maxDrawdown,
      benchmarkTotalReturn: m.benchmark.totalReturn, benchmarkCagr: m.benchmark.cagr, excessCagr: m.benchmark.excessCagr, beta: m.benchmark.beta });
  }
  const built = decisions.map(d => d.built).filter(b => b.state === 'CONSTRUCTED');
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const heldDelisted = new Set(terminalEvents.map(x => x.id));
  const sectorAvg = {};
  for (const b of built) for (const [k, v] of Object.entries(b.sectorWeights)) sectorAvg[k] = (sectorAvg[k] || 0) + v / built.length;
  return {
    schemaVersion: VERSION, certification: 'NOT_CERTIFIED', label: 'Forschung, nicht zertifiziert', productionApproved: false, state: 'RUN',
    profileId: cfg.profileId, weighting: cfg.weighting, standard: std.id, basis: panel.basis, benchmark: benchLabel,
    window: [rows[0].date, rows.at(-1).date], rebalanceWeeks: cfg.rebalanceWeeks, riskWindowWeeks: cfg.riskWindowWeeks,
    metrics: {
      totalReturn: metrics.returns.totalReturn, cagr: metrics.returns.cagr, annualizedVolatility: metrics.risk.annualizedVolatility, sharpeRf0: metrics.risk.sharpe,
      maxDrawdown: metrics.risk.maxDrawdown, maxDrawdownPeak: metrics.risk.peakDate, maxDrawdownTrough: metrics.risk.troughDate,
      benchmarkTotalReturn: metrics.benchmark.totalReturn, benchmarkCagr: metrics.benchmark.cagr, benchmarkVolatility: metrics.benchmark.annualizedVolatility, benchmarkMaxDrawdown: metrics.benchmark.maxDrawdown,
      excessCagr: metrics.benchmark.excessCagr, beta: metrics.benchmark.beta, correlation: metrics.benchmark.correlation, trackingError: metrics.benchmark.trackingError, informationRatio: metrics.benchmark.informationRatio,
      annualizedOneWayTurnover: metrics.turnover.annualizedOneWayTurnover, costsShareOfInitialCapital: metrics.costs.shareOfInitialCapital,
      calendarYears: metrics.returns.calendarYears.map(y => ({ year: y.year, return: y.return, partial: y.partial })),
      benchmarkCalendarYears: metrics.benchmark.calendarYears,
      grossOfSpread: { totalReturn: gross.returns.totalReturn, cagr: gross.returns.cagr },
    },
    folds,
    construction: { rebalances: decisions.length, constructed: built.length, tooFewEligible: decisions.filter(d => d.built.state === 'TOO_FEW_ELIGIBLE').map(d => d.date),
      averagePositions: avg(built.map(b => b.positions)), averageCashResidual: avg(built.map(b => b.cashResidual)), averageExAnteVol: avg(built.map(b => b.exAnte.annualVol)),
      averageShrinkage: avg(built.map(b => b.exAnte.shrinkage)), averageUniverse: avg(decisions.map(d => d.universe)), averageScored: avg(decisions.map(d => d.scored)), averageLiquid: avg(decisions.map(d => d.liquid)),
      averageSectorWeights: sectorAvg, boundSectorRebalances: built.filter(b => b.boundSectors.length).length,
      unfilledAtExecution: unfilled.length, carriedBars: carried.length, distinctHoldings: intervals.size, terminalEvents: terminalEvents.length, terminalByKind: terminalEvents.reduce((o, x) => (o[x.kind] = (o[x.kind] || 0) + 1, o), {}),
      heldDelistedListings: heldDelisted.size },
    costs: { feeBps: std.feeBps, slippageBps: std.slippageBps, spreadModel: 'HALF_SPREAD_BY_LIQUIDITY_BUCKET', spreadTotal: [...spreadByDate.values()].reduce((s, x) => s + x, 0), feesAndSlippage: result.metrics.fees + result.metrics.slippage },
    ledger: { schemaVersion: result.schemaVersion, resultHash: result.resultHash, inputHash: result.inputHash, metricsResultHash: metrics.resultHash },
    equity: rows.map(r => [r.date, r.value, r.benchmark]),
    lastHoldings: Object.entries(targets.at(-1).weights).sort((a, b) => b[1] - a[1]).map(([id, w]) => ({ id, weight: w })),
    limitations: [...new Set([...result.limitations, 'PIT_RECONSTRUCTION_NOT_LIVE_FACTOR_EVIDENCE', 'CURRENT_SIC_CLASSIFICATION_NOT_HISTORICAL', 'NO_HISTORICAL_INDEX_MEMBERSHIP_UNIVERSE_IS_ALL_LISTED_US_COMMON',
      'SPREAD_IS_MODELLED_BY_LIQUIDITY_BUCKET_NOT_OBSERVED_QUOTES', 'SPREAD_PROPORTIONAL_EQUITY_HAIRCUT_AT_TRADE_SESSION', 'TERMINAL_VALUE_ASSUMPTION_BY_DELISTING_CLASS',
      'RULES_PREREGISTERED_NOT_FITTED_WALK_FORWARD_IS_ROLLING_ESTIMATION', 'WEEKLY_CLOSE_EXECUTION_NEXT_WEEK', ...(panel.basis === 'PRICE_RETURN' ? ['PRICE_RETURN_SURVIVOR_PANEL_NOT_PIT_POPULATION'] : []),
      ...(carried.length ? ['CARRIED_LAST_CLOSE_FOR_' + carried.length + '_MISSING_WEEKLY_BARS'] : [])])],
  };
}

module.exports = { VERSION, DEFAULTS, runModelPortfolio, decide };
