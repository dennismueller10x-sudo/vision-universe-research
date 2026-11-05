'use strict';
// Strang G: Aktien-Varianten auf dem E3-Ablauf (Forschung, nicht zertifiziert).
// - Auswahl: Labor-Signale (signals.cjs) statt Profilscore, sonst wie quant/engines/portfolio-backtest.cjs#decide und
//   scripts/research/edge/quant-e3.cjs#createSelector (Liquidität, Kandidatenpool 90, 104 Wochen Risikohistorie).
// - Konstruktion portfolio-construction.cjs (EQUAL, VU-Standard je N), Ledger research-portfolio.cjs#runPortfolio
//   über quant-e3.cjs#ledgerFromTargets (unverändert), Kosten aus dem Standard (Protokoll 10 + 10 bp je Seite + halber Spread).
// - Ablauf je Fenster wie quant-e3.cjs#runVariant (Cash-Start, Neuwahl alle W Wochen ab Fensterstart, Filter wöchentlich).
// - Cash-Verzinsung mit BIL (Protokoll §5) als eigenes Geldmarktkonto ohne Reinvestition in Aktien (cashInterest).
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const Q = require(path.join(ROOT, 'scripts/research/edge/quant-e3.cjs'));
const S = require('./signals.cjs');
const VERSION = 'labor-stock-engine-1.0.0';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const sha = x => crypto.createHash('sha256').update(P.canonical(x)).digest('hex');
const at = d => d + 'T23:59:59.999Z';
function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }

function createSelector(panel, events, { riskWindowWeeks = 104, candidatePool = 90, terminal = { MERGER: 1, UNKNOWN: 0.7, DISTRESS: 0 } } = {}) {
  const rowsCache = new Map(), poolCache = new Map(), fwdCache = new Map();
  const firstIdx = s => { if (s._first === undefined) s._first = s.adj.findIndex(x => x > 0); return s._first; };
  function rowsAt(t) {
    if (rowsCache.has(t)) return rowsCache.get(t);
    const date = panel.calendar[t], rows = [], secs = [];
    for (const s of panel.securities) {
      if (!(s.adj[t] > 0) || !s.sector) continue;
      const f0 = firstIdx(s);
      if (f0 < 0 || t - f0 < riskWindowWeeks) continue;
      if (s.terminal && s.terminal.lastIdx < t) continue;
      rows.push(S.row(s, t, date, events)); secs.push(s);
    }
    const out = { rows, secs, sig: S.signalTable(rows) };
    rowsCache.set(t, out);
    return out;
  }
  // Folgerendite von t+1 bis t+14 (Ausführung in der Folgewoche); Ende eines delisteten Titels mit Endwertklasse.
  function forward(s, t) {
    const a = s.adj, e = t + 1, h = t + 14;
    if (!(a[e] > 0)) return null;
    if (a[h] > 0 && !(s.terminal && s.terminal.lastIdx < h)) return a[h] / a[e] - 1;
    let k = Math.min(h, s.terminal ? s.terminal.lastIdx : h); while (k > e && !(a[k] > 0)) k--;
    const rec = s.terminal && s.terminal.lastIdx < h ? (terminal[s.terminal.kind] ?? 1) : 1;
    return a[k] * rec / a[e] - 1;
  }
  function trainingAt(t) {
    if (fwdCache.has(t)) return fwdCache.get(t);
    const { rows, secs, sig } = rowsAt(t), X = S.learnMatrix(sig, rows.length);
    const fr = secs.map(s => forward(s, t)), y = F.percentiles(fr);
    const out = { X: [], y: [] };
    X.forEach((x, i) => { if (isNum(y[i])) { out.X.push(x); out.y.push(y[i] - 0.5); } });
    fwdCache.set(t, out);
    return out;
  }
  // Lernendes Ranking: Stichprobe alle 4 Wochen ab trainStart, Label vollständig bekannt (t' + 14 <= t), mind. 52 Stichtage.
  function learnScores(t, variant, trainStartIdx) {
    const { rows, sig } = rowsAt(t), X = S.learnMatrix(sig, rows.length);
    const dates = [];
    for (let k = trainStartIdx; k + 14 <= t; k += 4) dates.push(k);
    if (dates.length < 52) return { scores: X.map(x => x.reduce((s, v) => s + v, 0) / x.length), model: 'EQUAL_FALLBACK', samples: dates.length };
    const XX = [], yy = [];
    for (const k of dates) { const d = trainingAt(k); for (let i = 0; i < d.X.length; i++) { XX.push(d.X[i]); yy.push(d.y[i]); } }
    const b = S.ridge(XX, yy, variant.lambda);
    return { scores: X.map(x => x.reduce((s, v, j) => s + v * b[j], 0)), model: 'RIDGE', samples: dates.length, beta: b };
  }
  function poolAt(t, variant, std, trainStartIdx) {
    const key = t + '|' + variant.score + '|' + (variant.lambda || '');
    if (poolCache.has(key)) return poolCache.get(key);
    const { rows, secs, sig } = rowsAt(t);
    let score, model = null;
    if (variant.score === 'LERN') { const l = learnScores(t, variant, trainStartIdx); score = l.scores; model = { kind: l.model, samples: l.samples, beta: l.beta || null }; }
    else score = S.scoreOf(variant.score, sig);
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
    const out = { universe: rows.length, scored: cands.length, liquid: liquid.length, pool: pool.map(({ sec, ...c }) => c), returnsById, model };
    poolCache.set(key, out);
    return out;
  }
  function select(t, variant, trainStartIdx) {
    const std = C.standardOf(variant.standard), p = poolAt(t, variant, std, trainStartIdx);
    const built = C.construct({ candidates: p.pool, returnsById: p.returnsById, weighting: 'EQUAL', standard: variant.standard });
    return { t, date: panel.calendar[t], universe: p.universe, scored: p.scored, liquid: p.liquid, pool: p.pool.length, model: p.model, built };
  }
  return { select, rowsAt };
}

// Ein Fenster, Cash-Start. Wie quant-e3.cjs#runVariant; Anker = erster Fensterstichtag (Protokoll §3).
function runVariant(panel, selector, variant, { window, trainStart, filterStateAt = null, terminalRecovery }) {
  const cal = panel.calendar, bench = panel.benchmark.levels;
  const idx = [...cal.keys()].filter(i => cal[i] >= window[0] && cal[i] <= window[1] && bench[i] > 0);
  if (idx.length < 60) fail('WINDOW_TOO_SHORT');
  for (let k = 1; k < idx.length; k++) if (idx[k] !== idx[k - 1] + 1) fail('BENCHMARK_GAP_IN_WINDOW', cal[idx[k]]);
  const first = idx[0], last = idx.at(-1), byId = new Map(panel.securities.map(s => [s.id, s]));
  const trainStartIdx = cal.findIndex(d => d >= trainStart);
  const scheduled = t => (t - first) % variant.weeks === 0;
  const decisions = [], targets = [], memberships = [], unfilled = [];
  let current = null, lastEmitted = null, tooFew = 0, filterBlocked = 0, switches = 0;
  for (let t = first; t < last; t++) {
    if (scheduled(t)) { const d = selector.select(t, variant, trainStartIdx); decisions.push(d); if (d.built.state === 'CONSTRUCTED') current = d; else tooFew++; }
    let on = true;
    if (variant.filter) { const st = filterStateAt(cal[t]); if (st === null) { filterBlocked++; on = false; } else on = st; }
    const desired = !current ? null : on ? current.built.weights : {};
    if (desired === null) continue;
    const rebalance = scheduled(t) && on && current.t === t;
    const changed = lastEmitted === null ? on && Object.keys(desired).length > 0 : P.canonical(desired) !== P.canonical(lastEmitted);
    if (!rebalance && !changed) continue;
    if (variant.filter && lastEmitted !== null && (Object.keys(lastEmitted).length > 0) !== on) switches++;
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
  const cfg = { initialCapital: 1e6, terminalRecovery };
  const out = ledgerWithCash(panel, cfg, C.standardOf(variant.standard), idx, targets, memberships, variant.weeks);
  const constructed = decisions.filter(d => d.built.state === 'CONSTRUCTED');
  return { variantId: variant.id, window: [cal[first], cal[last]], ...out, targets: targets.map(t => ({ d: t.decisionDate, n: Object.keys(t.weights).length })),
    construction: { selections: decisions.length, constructed: constructed.length, tooFewEligible: tooFew,
      averageUniverse: decisions.length ? decisions.reduce((s, d) => s + d.universe, 0) / decisions.length : null,
      averagePositions: constructed.length ? constructed.reduce((s, d) => s + d.built.positions, 0) / constructed.length : null,
      averageScored: decisions.length ? decisions.reduce((s, d) => s + d.scored, 0) / decisions.length : null,
      targetsEmitted: targets.length, unfilledAtExecution: unfilled.length, filterSwitches: switches, filterBlockedWeeks: filterBlocked,
      models: decisions.filter(d => d.model).map(d => ({ date: d.date, ...d.model })) },
    lastHoldings: lastEmitted };
}

// Ledger über quant-e3.cjs#ledgerFromTargets (unverändert). Die Cash-Reihe des Ledgers wird für die Verzinsung gebraucht;
// sie wird beim Aufruf von research-portfolio.cjs#runPortfolio mitgeschnitten (kein Eingriff in die Rechnung) und mit dem
// Spread-Faktor der E3-Kurve skaliert (cash_e3 = cash_ledger × value_e3 / value_ledger).
function ledgerWithCash(...args) {
  const orig = P.runPortfolio; let captured = null;
  P.runPortfolio = input => (captured = orig(input));
  let out;
  try { out = Q.ledgerFromTargets(...args); } finally { P.runPortfolio = orig; }
  const share = new Map();
  if (captured) for (const e of captured.equity) share.set(e.date, e.value > 0 ? e.cash / e.value : 1);
  return { ...out, cashShare: share };
}

// Geldmarktkonto: Zinsertrag auf den Cash-Anteil (1 − Investitionsquote) mit BIL-Wochenrendite, nicht reinvestiert.
// equity: [[date, value]], cashShare: Map(date -> Anteil Cash), bilRet: Map(date -> Wochenrendite oder 0).
function withCashInterest(equity, cashShare, bilRet) {
  let acc = 0;
  return equity.map(([d, v], i) => {
    if (i > 0) { const prev = equity[i - 1]; acc = acc * (1 + (bilRet.get(d) || 0)) + prev[1] * (cashShare.get(prev[0]) ?? 1) * (bilRet.get(d) || 0); }
    return [d, v + acc];
  });
}

module.exports = { VERSION, createSelector, runVariant, ledgerWithCash, withCashInterest };
