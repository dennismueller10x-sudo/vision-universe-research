'use strict';
// Strang G: Bewertung, Auswahl und Walk-forward (Protokoll §3, §7, §8, §9). Reine Funktionen, Forschung, nicht zertifiziert.
const St = require('./stats.cjs');
const { TRIALS, MAX_CANDIDATES, MAX_PER_FAMILY, WALK_FORWARD_YEARS, SEED, BOOT, BLOCK } = require('./protocol.cjs');
const isNum = x => typeof x === 'number' && Number.isFinite(x);

// equity [[date, value]] gegen SPY-Niveaus (Map date -> level) auf gemeinsamen Daten, ohne Auffüllen.
function evaluate(equity, spyByDate) {
  const rows = equity.filter(([d]) => spyByDate.has(d));
  if (rows.length < 3) throw Error('EVAL_TOO_SHORT');
  const dates = rows.map(r => r[0]), lv = rows.map(r => r[1]), sp = dates.map(d => spyByDate.get(d));
  const r = lv.slice(1).map((v, i) => v / lv[i] - 1), b = sp.slice(1).map((v, i) => v / sp[i] - 1);
  return { dates, droppedWeeks: equity.length - rows.length, strategy: St.metrics(lv, dates), SPY: St.metrics(sp, dates), returns: r, spyReturns: b, retDates: dates.slice(1) };
}

const sumLogExcess = (e, pred) => e.returns.reduce((s, x, i) => (pred(e.retDates[i]) ? s + Math.log1p(x) - Math.log1p(e.spyReturns[i]) : s), 0);

// DSR je Variante über eine Teilmenge der Wochen (pred), Versuchszahl TRIALS.
function dsrTable(evals, pred = () => true) {
  const ex = {}, srs = [];
  for (const [id, e] of Object.entries(evals)) {
    if (!e) continue;
    const x = St.excess(e.returns.filter((_, i) => pred(e.retDates[i])), e.spyReturns.filter((_, i) => pred(e.retDates[i])));
    if (x.length < 52) continue;
    ex[id] = x; const m = St.moments(x); if (m.sr !== null) srs.push(m.sr);
  }
  const out = {};
  for (const [id, x] of Object.entries(ex)) out[id] = St.deflatedSharpe(x, srs, TRIALS);
  return out;
}

// Auswahl nach §7. evals: id -> evaluate() oder null; fam: id -> Familie.
function select(evals, fam, { split = '2019-12-31' } = {}) {
  const dsr = dsrTable(evals), checks = {};
  for (const [id, e] of Object.entries(evals)) {
    if (!e || !dsr[id] || dsr[id].dsr === null) { checks[id] = { eligible: false, lowLoss: false, reason: 'NO_VALID_SERIES' }; continue; }
    const a = e.strategy.totalReturn > e.SPY.totalReturn;
    const b = sumLogExcess(e, d => d <= split) > 0 && sumLogExcess(e, d => d > split) > 0;
    const c = e.strategy.maxDrawdown >= e.SPY.maxDrawdown - 0.10;
    const low = e.strategy.cagr >= e.SPY.cagr - 0.015 && e.strategy.maxDrawdown >= 0.75 * e.SPY.maxDrawdown;
    checks[id] = { eligible: a && b && c, a, b, c, lowLoss: low, z: dsr[id].z, dsr: dsr[id].dsr, sr: dsr[id].sr, sr0: dsr[id].sr0, cagrGap: e.strategy.cagr - e.SPY.cagr };
  }
  const byK = ids => ids.sort((x, y) => checks[y].z - checks[x].z || (x < y ? -1 : 1));
  const picked = [], perFam = {};
  for (const id of byK(Object.keys(checks).filter(id => checks[id].eligible))) {
    if (picked.length >= MAX_CANDIDATES) break;
    if ((perFam[fam[id]] || 0) >= MAX_PER_FAMILY) continue;
    picked.push({ id, track: 'BEAT' }); perFam[fam[id]] = (perFam[fam[id]] || 0) + 1;
  }
  const lowFam = {};
  const lows = Object.keys(checks).filter(id => checks[id].lowLoss && !picked.some(p => p.id === id))
    .sort((x, y) => checks[y].cagrGap - checks[x].cagrGap || (x < y ? -1 : 1));
  for (const id of lows) {
    if (picked.length >= MAX_CANDIDATES) break;
    if (lowFam[fam[id]]) continue;
    picked.push({ id, track: 'LOW_LOSS' }); lowFam[fam[id]] = 1;
  }
  return { candidates: picked, checks };
}

// Walk-forward §3: je Jahr Y beste Variante nach K auf 2016..Y−1, Ergebnis in Y; verkettete Kurve.
function walkForward(evals) {
  const folds = [], chain = [], spy = [];
  for (const Y of WALK_FORWARD_YEARS) {
    const dsr = dsrTable(evals, d => d <= (Y - 1) + '-12-31');
    const ids = Object.keys(dsr).filter(id => dsr[id].z !== null).sort((x, y) => dsr[y].z - dsr[x].z || (x < y ? -1 : 1));
    if (!ids.length) { folds.push({ year: Y, pick: null }); continue; }
    const e = evals[ids[0]], r = [], b = [];
    e.retDates.forEach((d, i) => { if (d.slice(0, 4) === String(Y)) { r.push(e.returns[i]); b.push(e.spyReturns[i]); } });
    const g = a => a.reduce((s, x) => s * (1 + x), 1) - 1;
    folds.push({ year: Y, pick: ids[0], dsr: dsr[ids[0]].dsr, ret: g(r), spy: g(b) });
    chain.push(...r); spy.push(...b);
  }
  const g = a => a.reduce((s, x) => s * (1 + x), 1);
  const years = WALK_FORWARD_YEARS.length;
  return { folds, cagr: g(chain) ** (1 / years) - 1, spyCagr: g(spy) ** (1 / years) - 1, beats: g(chain) > g(spy) };
}

// White's Reality Check über alle gültigen Varianten mit voller Wochenzahl.
function realityCheck(evals) {
  const rows = Object.entries(evals).filter(([, e]) => e).map(([id, e]) => [id, St.excess(e.returns, e.spyReturns)]);
  if (!rows.length) return null;
  const T = Math.max(...rows.map(r => r[1].length)), full = rows.filter(r => r[1].length === T);
  const rc = St.realityCheck(full.map(r => r[1]), { count: BOOT, block: BLOCK, seed: SEED });
  return { ...rc, bestId: full[rc.bestIndex][0], excludedShortSeries: rows.length - full.length };
}

// Urteile §9 für einen Kandidaten mit Prüf- und (optional) Holdout-Bewertung.
function verdict(test, holdout, combinedP) {
  if (!test) return 'nicht bestimmbar (blockiert)';
  const beat = e => e.strategy.totalReturn > e.SPY.totalReturn;
  const low = e => e.strategy.cagr >= e.SPY.cagr - 0.015 && e.strategy.maxDrawdown >= 0.75 * e.SPY.maxDrawdown;
  const out = { testBeats: beat(test), testLowLoss: low(test) };
  if (!holdout) return { ...out, final: out.testBeats ? 'Prüfung bestanden, Holdout offen' : 'besteht nicht', lowLoss: out.testLowLoss ? 'Prüfung erfüllt, Holdout offen' : 'nein' };
  const both = out.testBeats && beat(holdout);
  return { ...out, holdoutBeats: beat(holdout), holdoutLowLoss: low(holdout),
    final: both ? (isNum(combinedP) && combinedP <= 0.05 ? 'besteht, statistisch gesichert' : 'besteht, statistisch nicht gesichert') : 'besteht nicht',
    lowLoss: out.testLowLoss && low(holdout) ? 'Mehrwert weniger Verlust' : 'nein' };
}

module.exports = { evaluate, dsrTable, select, walkForward, realityCheck, verdict, sumLogExcess };
