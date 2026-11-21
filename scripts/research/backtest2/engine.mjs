/**
 * Backtest 2.0 – Depotführung. Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md §2.
 *
 * Ablauf je Handelstag t (kein Blick in die Zukunft):
 *  1. Eröffnung t: offene Verkaufsaufträge (vom Schluss t-1), dann Käufe (Kandidaten vom Schluss t-1), zum Eröffnungskurs.
 *  2. Im Tag: nachgezogener Stopp (Tief ≤ Stopp -> Verkauf zu min(Eröffnung, Stopp)); die Eröffnung ist der erste Kurs des
 *     Tages, deshalb gilt das auch am Kauftag.
 *  3. Letzter Handelstag eines delisteten Titels: Abrechnung zum Schluss × Endwertquote (Übernahme 1, unbekannt 0,7, Insolvenz 0).
 *  4. Schluss t: Hochpunkt (Schlussbasis), Ausstiege auf Schlussbasis und Marktfilter -> Verkauf zur nächsten Eröffnung;
 *     freie Plätze -> Kandidaten des Tages im Universum -> Kauf zur nächsten Eröffnung.
 *  5. Bewertung zum Schluss (letzter bekannter Schluss je Titel).
 * Kosten je Seite: 1 bp Gebühr + 5 bp Slippage + halber Spread nach Ø Dollarumsatz (quant/engines/portfolio-construction.cjs).
 * Kein Hebel: Käufe nur aus vorhandenem Cash. Cash unverzinst. Bruchstücke erlaubt.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PC = require('../../../quant/engines/portfolio-construction.cjs');

export const ENGINE_VERSION = 'backtest2-engine-1.0.0';
export const FEE_BPS = 1, SLIPPAGE_BPS = 5, RISK_PER_POSITION = 0.01, STALE_SESSIONS = 5, INITIAL = 100000;

export const sideBps = (adv) => FEE_BPS + SLIPPAGE_BPS + PC.halfSpreadBps({ dollarVolume: adv > 0 ? adv : undefined }).bps;

/**
 * p: { positions, sizing: 'EQUAL'|'RISK', cap, exit: {kind:'TRAIL',pct}|{kind:'SMA',n}|{kind:'HOLD',days}|{kind:'CHANNEL',n},
 *      filter: 'NONE'|'SMA200'|'SMA50', uniTop, minPrice }
 * opts: { t0, t1, daily (Float64Array Equity je Tag zurückgeben), trades (Handelsliste), onDay(t, equity) }
 */
export function simulate(m, sig, p, { t0 = 0, t1 = m.T - 1, daily = false, trades = false, onDay = null } = {}) {
  const { T } = m;
  let cash = INITIAL;
  const pos = new Map(); // s -> {shares, entry, entryT, hw, stop, last, missing, sellPending}
  let buys = []; // [s, riskDist] für die nächste Eröffnung
  const eq = daily ? new Float64Array(t1 - t0 + 1) : null;
  const log = trades ? [] : null;
  const stats = { buys: 0, sells: 0, stops: 0, terminals: 0, stale: 0, costs: 0, rejectedCash: 0 };
  const trail = p.exit.kind === 'TRAIL' ? p.exit.pct : null;

  const sell = (s, q, price, t, reason) => {
    const proceeds = q.shares * price, cost = proceeds * sideBps(m.adv[s * T + t] || m.adv[s * T + q.entryT]) / 1e4;
    cash += proceeds - cost; stats.costs += cost; stats.sells++;
    if (log) log.push({ s, entryT: q.entryT, exitT: t, entry: q.entry, exit: price, ret: price / q.entry - 1, reason });
    pos.delete(s);
  };
  const markValue = () => { let v = 0; for (const q of pos.values()) v += q.shares * q.last; return v; };

  for (let t = t0; t <= t1; t++) {
    // 1) Eröffnung: Verkäufe, dann Käufe
    for (const [s, q] of [...pos]) {
      if (!q.sellPending) continue;
      const o = m.o[s * T + t];
      if (o > 0) sell(s, q, o, t, q.sellPending);
    }
    if (buys.length) {
      const equity0 = cash + markValue();
      for (const [s, riskDist] of buys) {
        const i = s * T + t, o = m.o[i];
        if (!(o > 0) || pos.has(s) || pos.size >= p.positions) continue;
        let value = p.sizing === 'EQUAL' ? equity0 / p.positions : Math.min(p.cap * equity0, RISK_PER_POSITION * equity0 / Math.max(riskDist, 1e-4));
        const bps = sideBps(m.adv[i]);
        const maxValue = cash / (1 + bps / 1e4);
        if (value > maxValue) { if (maxValue < 0.25 * value) { stats.rejectedCash++; continue; } value = maxValue; }
        if (!(value > 0)) continue;
        const cost = value * bps / 1e4;
        cash -= value + cost; stats.costs += cost; stats.buys++;
        pos.set(s, { shares: value / o, entry: o, entryT: t, hw: o, stop: trail ? o * (1 - trail) : -Infinity, last: o, missing: 0, sellPending: null });
      }
      buys = [];
    }
    // 2) + 3) im Tag: Stopps, Abrechnung delisteter Titel, Bewertung
    for (const [s, q] of [...pos]) {
      const i = s * T + t, c = m.c[i];
      if (!(c > 0)) {
        if (++q.missing > STALE_SESSIONS) { stats.stale++; sell(s, q, q.last, t, 'STALE'); }
        continue;
      }
      q.missing = 0;
      if (trail && m.l[i] <= q.stop) { stats.stops++; sell(s, q, Math.min(m.o[i], q.stop), t, 'TRAIL'); continue; }
      q.last = c;
      if (m.terminal[s] === t) { stats.terminals++; sell(s, q, c * m.recovery[s], t, 'TERMINAL'); continue; }
      if (c > q.hw) { q.hw = c; if (trail) q.stop = c * (1 - trail); }
    }
    // 4) Schluss: Ausstiege und Kandidaten für die nächste Eröffnung
    const filterOn = p.filter === 'NONE' ? true : p.filter === 'SMA200' ? m.spyOn200[t] === 1 : m.spyOn50[t] === 1;
    let held = 0;
    for (const [s, q] of pos) {
      const i = s * T + t, c = m.c[i];
      if (!filterOn) { q.sellPending = 'FILTER'; continue; }
      if (c > 0) {
        const e = p.exit;
        if (e.kind === 'SMA') { const sma = e.n === 50 ? m.sma50[i] : m.sma200[i]; if (c < sma) q.sellPending = 'SMA' + e.n; }
        else if (e.kind === 'HOLD') { if (t - q.entryT >= e.days) q.sellPending = 'HOLD'; }
        else if (e.kind === 'CHANNEL') {
          let low = Infinity, n = 0;
          for (let k = t - 1; k >= 0 && n < e.n; k--) { const lk = m.l[s * T + k]; if (lk > 0) { low = Math.min(low, lk); n++; } }
          if (n === e.n && c < low) q.sellPending = 'CHANNEL' + e.n;
        }
      }
      if (!q.sellPending) held++;
    }
    if (filterOn && t < t1 && held < p.positions) {
      const src = sig, from = src.offsets[t], to = src.offsets[t + 1];
      for (let k = from; k < to && held + buys.length < p.positions; k++) {
        const s = src.items[k], i = s * T + t;
        if (pos.has(s) || m.rank[i] > p.uniTop || !(m.rc[i] >= p.minPrice)) continue;
        if (m.terminal[s] >= 0 && m.terminal[s] <= t + 1) continue; // kein Kauf am letzten Handelstag
        const riskDist = trail ?? (m.atr20[i] > 0 ? 2 * m.atr20[i] / m.c[i] : 0.1);
        buys.push([s, riskDist]);
      }
    }
    const equity = cash + markValue();
    if (cash < -1e-6 * INITIAL) throw new Error('BACKTEST2_NEGATIVE_CASH');
    if (eq) eq[t - t0] = equity;
    if (onDay) onDay(t, equity);
  }
  return { equity: cash + markValue(), daily: eq, trades: log, stats, openPositions: pos.size };
}
