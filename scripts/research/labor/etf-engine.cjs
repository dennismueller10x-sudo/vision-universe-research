'use strict';
// Strang G: ETF-Trendfolge mit Markt- und Zinsfilter (Familie ETF, Protokoll §6). Forschung, nicht zertifiziert.
// Wochen-Gesamtrenditen aus vorsorge/data/series (Fondskosten enthalten). Entscheidung zum Wochenschluss t (Tagesfilter am
// letzten Tagesschluss <= t), Ausführung zum Schluss der Folgewoche t+1, Kosten je Seite 10 + 10 + 2 bp auf das gehandelte
// Volumen. Vor der ersten Ausführung: Cash mit BIL-Verzinsung, kostenfrei. BIL vor 2007-06-01: Rendite 0.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const Codec = require(path.join(ROOT, 'vorsorge/engines/series-codec.js'));
const { COSTS } = require('./protocol.cjs');
const VERSION = 'labor-etf-engine-1.0.0';
const P = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'IEF', 'BIL', 'XLB', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLU', 'XLV', 'XLY'];
const SECTORS = ['XLB', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLU', 'XLV', 'XLY'];

function loadEtfs(isoWeek, root = ROOT) {
  const out = {};
  for (const s of SYMBOLS) {
    const file = path.join(root, 'vorsorge/data/series', s + '.json'), d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d.symbol !== s || d.totalReturn.state !== 'TOTAL_RETURN_RECONSTRUCTED') throw Error('ETF_TR_UNAVAILABLE ' + s);
    out[s] = new Map(Codec.decode(d.total.weekly).map(([dt, v]) => [isoWeek(dt), v]));
  }
  return out;
}

// Tagesreihe -> Zustand zum letzten Wert <= Datum.
function lastAt(points) {
  const dates = points.map(p => p[0]);
  return date => { let lo = 0, hi = dates.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= date) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
}
// Zinsfilter: US10Y > Mittel der Tageswerte der letzten 52 Wochen (364 Tage) + 0,75 pp.
function rateShock(us10y) {
  const pos = lastAt(us10y);
  return date => {
    const k = pos(date); if (k < 0) return null;
    const lo = new Date(Date.parse(date + 'T00:00:00Z') - 364 * 86400000).toISOString().slice(0, 10);
    let s = 0, n = 0; for (let j = k; j >= 0 && us10y[j][0] > lo; j--) { s += us10y[j][1]; n++; }
    if (n < 200) return null;
    return us10y[k][1] > s / n + 0.75;
  };
}

// Regel -> Zielgewichte zum Index t des Wochenkalenders. lv(sym, t) = Gesamtrenditeniveau oder undefined.
function target(rule, t, ctx) {
  const { lv, date, spyOn, shock } = ctx;
  const ret = (s, a, b = 0) => { const x = lv(s, t - b), y = lv(s, t - a); return x > 0 && y > 0 ? x / y - 1 : null; };
  const bil = a => { const r = ret('BIL', a); return r === null ? 0 : r; };
  const on = spyOn(date[t]);
  switch (rule) {
    case 'E1': return on === null ? null : on ? { SPY: 1 } : { BIL: 1 };
    case 'E2': { const r = ret('SPY', 52); return r === null ? null : r > bil(52) ? { SPY: 1 } : { BIL: 1 }; }
    case 'E3': { const z = shock(date[t]); return on === null || z === null ? null : on && !z ? { SPY: 1 } : { BIL: 1 }; }
    case 'E4': { const r = ret('SPY', 52); return r === null ? null : r > bil(52) ? { SPY: 1 } : { IEF: 1 }; }
    case 'R1': case 'R2': {
      const a = rule === 'R1' ? 26 : 52, rs = ['SPY', 'QQQ', 'IWM'].map(s => [s, ret(s, a)]);
      if (rs.some(([, r]) => r === null)) return null;
      rs.sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
      return rs[0][1] > bil(a) ? { [rs[0][0]]: 1 } : { BIL: 1 };
    }
    case 'S1': case 'S2': case 'S3': case 'S4': {
      const slow = rule === 'S1' || rule === 'S2';
      if ((rule === 'S2' || rule === 'S4') && on === null) return null;
      if ((rule === 'S2' || rule === 'S4') && !on) return { BIL: 1 };
      const rs = SECTORS.map(s => [s, slow ? ret(s, 52, 4) : ret(s, 26)]);
      if (rs.some(([, r]) => r === null)) return null;
      rs.sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
      return Object.fromEntries(rs.slice(0, 3).map(([s]) => [s, 1 / 3]));
    }
    default: throw Error('ETF_RULE_UNKNOWN ' + rule);
  }
}
const REBALANCE = { S1: 13, S2: 13, S3: 4, S4: 4 };

// Wochenlauf. weeks: Datumsliste (SPY-Kalender), etfs: Map je Symbol (isoWeek -> Niveau).
function runEtf(variant, { weeks, window, etfs, isoWeek, spyOn, shock, cashInterest = true }) {
  const idxAll = weeks.map((d, i) => [d, i]);
  const lvAt = (s, i) => (i >= 0 && i < weeks.length ? etfs[s].get(isoWeek(weeks[i])) : undefined);
  const inWin = idxAll.filter(([d]) => d >= window[0] && d <= window[1]).map(([, i]) => i);
  if (inWin.length < 60) throw Error('WINDOW_TOO_SHORT');
  const first = inWin[0], last = inWin.at(-1), every = REBALANCE[variant.rule] || 1;
  const cost = (COSTS.feeBps + COSTS.slippageBps + COSTS.etfHalfSpreadBps) / 10000;
  const ctx = { lv: lvAt, date: weeks, spyOn, shock };
  let hold = {}, value = 1e6, pending = null, lastSet = null, lastExec = null, turnover = 0, costs = 0, trades = 0, blocked = 0, switches = 0;
  const equity = [[weeks[first], value]], held = [];
  for (let t = first; t < last; t++) {
    // Entscheidung zum Schluss t. S1–S4: Sektorwahl nur alle W Wochen; der Filter (S2/S4) wird wöchentlich geprüft und
    // setzt bei „an“ die zuletzt gültige Sektorwahl ein.
    let want;
    if (REBALANCE[variant.rule]) {
      const sched = (t - first) % every === 0;
      if (sched) { const pick = target(variant.rule.replace('2', '1').replace('4', '3'), t, ctx); if (pick) lastSet = pick; }
      const filt = (variant.rule === 'S2' || variant.rule === 'S4') ? spyOn(weeks[t]) : true;
      want = filt === null || !lastSet ? null : filt ? lastSet : { BIL: 1 };
    } else want = target(variant.rule, t, ctx);
    if (want === null) blocked++; else if (lastExec === null || P(want) !== P(lastExec)) pending = want;
    // Woche t -> t+1 mit dem Bestand nach dem Handel in t.
    let r = 0;
    const cashW = 1 - Object.values(hold).reduce((s, x) => s + x, 0);
    for (const [s, w] of Object.entries(hold)) { const a = lvAt(s, t), b = lvAt(s, t + 1); if (!(a > 0 && b > 0)) throw Error('ETF_GAP ' + s + ' ' + weeks[t + 1]); r += w * (b / a - 1); }
    if (cashW > 1e-12 && cashInterest) { const a = lvAt('BIL', t), b = lvAt('BIL', t + 1); if (a > 0 && b > 0) r += cashW * (b / a - 1); }
    // Gewichte driften; neue Gewichte nach Rendite.
    const drifted = {};
    for (const [s, w] of Object.entries(hold)) drifted[s] = w * (lvAt(s, t + 1) / lvAt(s, t)) / (1 + r);
    value *= 1 + r;
    hold = drifted;
    // Ausführung der Entscheidung aus t zum Schluss t+1.
    if (pending) {
      const keys = new Set([...Object.keys(hold), ...Object.keys(pending)]);
      let tv = 0; for (const k of keys) tv += Math.abs((pending[k] || 0) - (hold[k] || 0));
      if (tv > 1e-9) {
        const c = tv * cost; value *= 1 - c; costs += c; turnover += tv; trades++;
        if (Object.keys(hold).join() !== Object.keys(pending).join()) switches++;
        hold = { ...pending };
      }
      lastExec = pending; pending = null;
    }
    equity.push([weeks[t + 1], value]);
    held.push([weeks[t + 1], Object.keys(hold).join('+')]);
  }
  const years = (Date.parse(weeks[last]) - Date.parse(weeks[first])) / 86400000 / 365.25;
  return { variantId: variant.id, state: 'RUN', window: [weeks[first], weeks[last]], equity, costs: { shareOfStart: costs }, turnover: turnover / 2 / years, trades, switches, blockedWeeks: blocked, held };
}

module.exports = { VERSION, SYMBOLS, SECTORS, loadEtfs, rateShock, target, runEtf, lastAt };
