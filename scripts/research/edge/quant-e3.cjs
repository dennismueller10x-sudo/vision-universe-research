'use strict';
// E3 Quant-Forschungsadapter (edge-quant-adapter-1.0.0). Forschung, nicht zertifiziert.
// Setzt docs/research/edge/PROTOKOLL.md für die 84 Quant-Varianten um, ohne Fachengines zu ändern:
// - Auswahl: dieselbe Logik wie quant/engines/portfolio-backtest.cjs#decide (Faktorzeilen je Stichtag zwischengespeichert,
//   weil sie vom Profil unabhängig sind; Paritätstest gegen decide/runModelPortfolio in edge-quant.test.cjs).
// - Konstruktion: portfolio-construction.cjs mit EQUAL und dem Protokollstandard je N (min = max = Ziel = N,
//   Positionsmaximum max(8 %, 1/N), Branchenmaximum 25 %); Ledger research-portfolio.cjs#runPortfolio unverändert;
//   Kosten wie portfolio-backtest.cjs (1 bp + 5 bp im Ledger, halber Spread als anteiliger Abschlag am Handelstag).
// - Marktfilter: SPY-Tagesschluss (kanonisch splitbereinigt) > arithmetisches Mittel der letzten 200 Sitzungen
//   einschließlich Entscheidungstag; Gleichstand = Cash. Bewertet am letzten Tagesschluss jeder Entscheidungswoche, Ausführung
//   zum Schluss der Folgewoche (wie Engine). Aus: Ziel leer (Positionen kostenpflichtig schließen); an: Ziel = gültige Auswahl.
// - Uhr: Neuauswahl alle 13/26 Wochen ab dem ersten Entwicklungswochenstichtag (Anker), fortlaufend über Fenster.
// - Jedes Fenster startet in Cash; die Startauswahl ist die Auswahl des letzten Termins <= erstem Fensterstichtag.
const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const M = require(path.join(ROOT, 'quant/engines/backtest-metrics.cjs'));
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const VERSION = 'edge-quant-adapter-1.0.0';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : P.canonical(x)).digest('hex');
const at = d => d + 'T23:59:59.999Z';
function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }

// ------------------------------------------------------------ Marktfilter
function marketFilter(dailyPoints, n = 200) {
  const dates = dailyPoints.map(p => p[0]), closes = dailyPoints.map(p => p[1]);
  const on = new Array(dates.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) on[i] = closes[i] > sum / n;
  }
  // Zustand zum letzten Tagesschluss <= Datum; null = noch kein 200-Tage-Mittel (blockiert).
  return function stateAt(date) {
    let lo = 0, hi = dates.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= date) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    return k < 0 ? null : on[k];
  };
}

// ------------------------------------------------------------ Auswahl (decide mit Zwischenspeicher)
function firstIndex(s) { if (s._first === undefined) s._first = s.adj.findIndex(x => x > 0); return s._first; }
function createSelector(panel, { riskWindowWeeks = 104, candidatePool = 90 } = {}) {
  const rowsCache = new Map(), poolCache = new Map();
  function rowsAt(t) {
    if (rowsCache.has(t)) return rowsCache.get(t);
    const date = panel.calendar[t], rows = [], secs = [];
    for (const s of panel.securities) {
      if (!(s.adj[t] > 0) || !s.sector) continue;
      const f0 = firstIndex(s);
      if (f0 < 0 || t - f0 < riskWindowWeeks) continue;
      if (s.terminal && s.terminal.lastIdx < t) continue;
      rows.push({ id: s.id, ...F.priceFactors(s.adj, t), ...F.fundamentalFactors(s.bundle, date, s.raw[t]) }); secs.push(s);
    }
    const out = { rows, secs, fam: F.familyScores(rows) };
    rowsCache.set(t, out);
    return out;
  }
  function poolAt(t, profileId, std, families) {
    const key = t + '|' + profileId;
    if (poolCache.has(key)) return poolCache.get(key);
    const { rows, secs, fam } = rowsAt(t), score = F.profileScores(profileId, fam, families);
    const cands = [];
    rows.forEach((r, i) => { if (!isNum(score[i])) return; const s = secs[i];
      cands.push({ id: s.id, score: score[i], sector: s.sector, price: s.raw[t], dollarVolume: s.dv ? s.dv[t] : undefined, marketCap: isNum(r.marketCap) ? r.marketCap : undefined, sec: s }); });
    const liquid = cands.filter(c => C.liquidity(c, std).eligible).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    const pool = [], returnsById = new Map(), W = riskWindowWeeks;
    for (const c of liquid) {
      if (pool.length >= candidatePool) break;
      const a = c.sec.adj, r = [];
      let ok = true;
      for (let k = t - W + 1; k <= t; k++) { if (!(a[k] > 0) || !(a[k - 1] > 0)) { ok = false; break; } r.push(a[k] / a[k - 1] - 1); }
      if (!ok) continue;
      returnsById.set(c.id, r); pool.push(c);
    }
    const out = { universe: rows.length, scored: cands.length, liquid: liquid.length, pool: pool.map(({ sec, ...c }) => c), returnsById };
    poolCache.set(key, out);
    return out;
  }
  // Liquiditätsgrenzen hängen nicht von N ab (nur Titelzahl und Positionsmaximum), deshalb ein Pool je Profil und Stichtag.
  function select(t, profileId, weighting, standard, families) {
    const std = C.standardOf(standard), p = poolAt(t, profileId, std, families);
    const built = C.construct({ candidates: p.pool, returnsById: p.returnsById, weighting, standard });
    return { t, date: panel.calendar[t], universe: p.universe, scored: p.scored, liquid: p.liquid, pool: p.pool.length, built };
  }
  return { select, rowsAt };
}

// ------------------------------------------------------------ Ein Lauf (ein Fenster, Cash-Start)
const DEFAULTS = Object.freeze({ initialCapital: 1e6, terminalRecovery: BT.DEFAULTS.terminalRecovery });
function runVariant(panel, selector, variant, { window, anchorDate, filterStateAt = null, weighting = 'EQUAL' }) {
  const cfg = { ...DEFAULTS };
  const std = C.standardOf(variant.standard || {}), T = panel.calendar.length, cal = panel.calendar, bench = panel.benchmark.levels;
  const idx = [...cal.keys()].filter(i => cal[i] >= window[0] && cal[i] <= window[1] && bench[i] > 0);
  if (idx.length < 60) fail('WINDOW_TOO_SHORT');
  for (let k = 1; k < idx.length; k++) if (idx[k] !== idx[k - 1] + 1) fail('BENCHMARK_GAP_IN_WINDOW', cal[idx[k]]);
  const first = idx[0], last = idx.at(-1), byId = new Map(panel.securities.map(s => [s.id, s]));
  const anchor = cal.indexOf(anchorDate);
  if (anchor < 0 || anchor > first) fail('ANCHOR_INVALID', anchorDate);
  const scheduled = t => (t - anchor) % variant.weeks === 0;
  // Startauswahl: letzter Termin <= erstem Fensterstichtag (nur Daten bis zu diesem Termin).
  const t0 = anchor + Math.floor((first - anchor) / variant.weeks) * variant.weeks;
  const decisions = [], targets = [], memberships = [], unfilled = [], filterLog = [];
  let current = null, lastEmitted = null, tooFew = 0, filterBlocked = 0;
  const pickAt = t => { const d = selector.select(t, variant.profileId, weighting, variant.standard, variant.profileFamilies); decisions.push(d); if (d.built.state === 'CONSTRUCTED') current = d; else tooFew++; };
  if (t0 < first) pickAt(t0);
  for (let t = first; t < last; t++) {
    if (scheduled(t)) pickAt(t);
    let on = true;
    if (variant.filter) {
      const st = filterStateAt(cal[t]);
      if (st === null) { filterBlocked++; on = false; } else on = st;
    }
    const desired = !current ? null : on ? current.built.weights : {};
    if (desired === null) continue;
    // Ziel nur bei neuer Auswahl (Umschichtung, Filter an), bei Filterwechsel oder beim ersten Kauf im Fenster.
    const rebalance = scheduled(t) && on && current.t === t;
    const changed = lastEmitted === null ? on && Object.keys(desired).length > 0 : P.canonical(desired) !== P.canonical(lastEmitted);
    if (!rebalance && !changed) continue;
    if (variant.filter && lastEmitted !== null && (Object.keys(lastEmitted).length > 0) !== on) filterLog.push({ date: cal[t], on });
    const e = t + 1, w = {};
    for (const [id, x] of Object.entries(desired)) {
      const s = byId.get(id);
      if (s.adj[e] > 0 && !(s.terminal && s.terminal.lastIdx < e)) w[id] = x; else unfilled.push({ date: cal[e], id, weight: x });
    }
    const members = Object.keys(w).sort(), mh = sha({ date: cal[t], members, variant: variant.id });
    memberships.push({ effectiveAt: cal[t] + 'T00:00:00Z', availableAt: cal[t] + 'T00:00:00Z', sourceHash: mh, members });
    targets.push({ decisionDate: cal[t], executionDate: cal[e], availableAt: at(cal[t]), membershipHash: mh, weights: w, hs: current.built.halfSpreadBps || {} });
    lastEmitted = desired;
  }
  const ledgerOut = ledgerFromTargets(panel, cfg, std, idx, targets, memberships, variant.weeks);
  return { variantId: variant.id, window: [cal[first], cal[last]], ...ledgerOut,
    construction: { selections: decisions.length, constructed: decisions.filter(d => d.built.state === 'CONSTRUCTED').length, tooFewEligible: tooFew,
      averageUniverse: decisions.length ? decisions.reduce((s, d) => s + d.universe, 0) / decisions.length : null,
      averagePositions: (() => { const b = decisions.filter(d => d.built.state === 'CONSTRUCTED'); return b.length ? b.reduce((s, d) => s + d.built.positions, 0) / b.length : null; })(),
      targetsEmitted: targets.length, unfilledAtExecution: unfilled.length, filterSwitches: filterLog.length, filterBlockedWeeks: filterBlocked } };
}

// Ledger wie portfolio-backtest.cjs#runModelPortfolio (Haltebereiche, TERMINAL_CASH, runPortfolio, Spread-Abschlag).
function ledgerFromTargets(panel, cfg, std, idx, targets, memberships, weeks) {
  const T = panel.calendar.length, cal = panel.calendar, bench = panel.benchmark.levels, first = idx[0], last = idx.at(-1);
  const byId = new Map(panel.securities.map(s => [s.id, s]));
  const intervals = new Map();
  targets.forEach((tg, k) => {
    const e = cal.indexOf(tg.executionDate);
    for (const id of Object.keys(tg.weights)) {
      let end = last;
      for (let j = k + 1; j < targets.length; j++) if (!(targets[j].weights[id] > 0)) { end = cal.indexOf(targets[j].executionDate); break; }
      if (!intervals.has(id)) intervals.set(id, []);
      intervals.get(id).push([e, end]);
    }
  });
  const listings = [], terminalEvents = [];
  let carried = 0, seq = 0;
  for (const [id, ivs] of [...intervals].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const s = byId.get(id), need = new Set();
    let termIdx = null;
    if (s.terminal && s.terminal.lastIdx < last) termIdx = s.terminal.lastIdx;
    let lastObs = T - 1; while (lastObs >= 0 && !(s.adj[lastObs] > 0)) lastObs--;
    if (termIdx === null && lastObs < last) termIdx = lastObs;
    for (const [a, b] of ivs) for (let i = a; i <= b; i++) { if (termIdx !== null && i > termIdx) break; need.add(i); }
    const bars = [];
    for (const i of [...need].sort((x, y) => x - y)) {
      let close = s.adj[i];
      if (!(close > 0)) { for (let j = i - 1; j >= 0; j--) if (s.adj[j] > 0) { close = s.adj[j]; break; } carried++; }
      if (!(close > 0)) fail('NO_PRICE_FOR_HELD_LISTING', id + '@' + cal[i]);
      bars.push({ date: cal[i], close, availableAt: at(cal[i]) });
    }
    const events = [];
    let lastTradeDate = null;
    if (termIdx !== null && termIdx < last && [...need].some(i => i <= termIdx)) {
      const kind = s.terminal ? s.terminal.kind : 'SERIES_END', rec = cfg.terminalRecovery[kind];
      if (!isNum(rec)) fail('TERMINAL_RECOVERY_UNKNOWN', kind);
      const eff = cal[termIdx + 1], lastClose = bars.filter(b => b.date <= cal[termIdx]).at(-1).close;
      lastTradeDate = bars.at(-1).date;
      events.push({ id: 'term:' + id, type: 'TERMINAL_CASH', effectiveDate: eff, availableAt: at(eff), payDate: eff, amount: lastClose * rec, currency: 'USD', sequence: seq++, sourceHash: sha({ id, kind, rec, lastClose, eff }) });
      terminalEvents.push({ id, kind, recovery: rec, effectiveDate: eff });
    }
    listings.push({ listingId: id, issuerId: id, mic: s.mic || 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: bars[0].date, lastTradeDate, events, bars });
  }
  const sessions = idx.map(i => ({ date: cal[i], closeAt: at(cal[i]) }));
  if (!listings.length) {
    const flat = sessions.map(s => ({ date: s.date, value: cfg.initialCapital }));
    return { state: 'NO_POSITIONS', equity: flat.map(r => [r.date, r.value]), costs: { feesAndSlippage: 0, spread: 0 }, turnover: 0, terminalEvents: [], carriedBars: 0 };
  }
  const pv = panel.provenance, tr = panel.basis === 'TOTAL_RETURN';
  const provenance = tr
    ? { mode: 'HISTORICAL_OBSERVED', datasetHash: pv.datasetHash, identityEvidence: pv.identityEvidence, populationEvidence: pv.populationEvidence, corporateActionEvidence: pv.corporateActionEvidence,
      lifecycleEvidence: pv.lifecycleEvidence, licenseEvidence: pv.licenseEvidence, historicalPopulation: 'CUSTOM_STRATEGY_UNIVERSE', unresolvedIdentityCount: 0, unresolvedTerminalCount: 0 }
    : { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: pv.datasetHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' };
  // Mitgliedschaften für Filter-Ziele können älter als eine Umschichtungsperiode werden; die Frist umfasst daher das Fenster.
  const input = { sessions, initialCapital: cfg.initialCapital, currency: 'USD', returnBasis: panel.basis, provenance,
    costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: std.feeBps, slippageBps: std.slippageBps }, maxMembershipAgeDays: 7 * weeks + 7, maxFactorAgeDays: 45,
    listings, memberships, factorSnapshots: [], targets: targets.map(({ hs, ...tg }) => tg),
    benchmark: { currency: 'USD', returnBasis: panel.basis, sourceHash: panel.benchmark.sourceHash, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: idx.map(i => ({ date: cal[i], level: bench[i] })) } };
  const result = P.runPortfolio(input);
  const hsAt = new Map(targets.map(tg => [tg.executionDate, tg.hs]));
  const lastHs = new Map(), spreadByDate = new Map(), tradesByDate = new Map(), spreadTrades = [];
  for (const x of result.trades) { if (!tradesByDate.has(x.date)) tradesByDate.set(x.date, []); tradesByDate.get(x.date).push(x); }
  for (const e of result.equity) {
    if (hsAt.has(e.date)) for (const [k, v] of Object.entries(hsAt.get(e.date))) lastHs.set(k, v);
    let sum = 0;
    for (const x of tradesByDate.get(e.date) || []) { const bps = lastHs.has(x.listingId) ? lastHs.get(x.listingId) : C.SPREAD_BY_ADV.at(-1)[1]; const sp = x.notional * bps / 10000; sum += sp; spreadTrades.push({ ...x, spread: sp }); }
    if (sum) spreadByDate.set(e.date, sum);
  }
  let factor = 1;
  const rows = result.equity.map(e => { const sp = spreadByDate.get(e.date) || 0; if (sp) factor *= 1 - sp / e.value; return { date: e.date, value: e.value * factor, cash: e.cash * factor }; });
  const m = M.computeMetrics({ initialCapital: cfg.initialCapital, rows, trades: spreadTrades.map(x => ({ date: x.date, listingId: x.listingId, side: x.side, notional: x.notional, units: x.units, fee: x.fee, slippage: x.slippage + x.spread })) }, {});
  return { state: 'RUN', equity: rows.map(r => [r.date, r.value]), cashShare: m.exposure.averageCashShare,
    costs: { feesAndSlippage: result.metrics.fees + result.metrics.slippage, spread: [...spreadByDate.values()].reduce((s, x) => s + x, 0), shareOfInitialCapital: m.costs.shareOfInitialCapital },
    turnover: m.turnover.annualizedOneWayTurnover, terminalEvents: terminalEvents.reduce((o, x) => (o[x.kind] = (o[x.kind] || 0) + 1, o), {}), carriedBars: carried, ledgerResultHash: result.resultHash };
}

module.exports = { VERSION, marketFilter, createSelector, runVariant, ledgerFromTargets };
