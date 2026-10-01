// Supertrader — explorativer Pilot-Backtest (Donchian-Kanal auf Wochenschluessen).
//
// VORAB FESTGELEGT (registriert 2026-10-01, vor dem ersten Lauf; keine
// Parametersuche, genau eine Spezifikation):
//   Regeln      Turtle-Kanal 20/10 (Donchian), auf Wochenschluesse uebertragen
//               (VU-Uebertragung: Original Tagesbalken, Futures, Intraday-Stop).
//               Einstieg: Wochenschluss > hoechster Schluss der 20 Vorwochen.
//               Ausstieg: Wochenschluss < tiefster Schluss der 10 Vorwochen.
//               Ausfuehrung jeweils zum Schluss der FOLGEWOCHE (keine Kenntnis
//               des Signalbalkens vor seinem Ende; eine Woche Verzoegerung).
//   Universum   alle oeffentlichen Langreihen (discover-series-long), d. h. NUR
//               heute gelistete Titel -> Survivorship Bias. Je Woche zulaessig:
//               >= 52 Wochen Historie, Schluss der Vorwoche >= 5 USD.
//   Zeitraum    2000-01-07 bis letzte vollstaendige Woche; In-Sample bis
//               2015-12-31, Out-of-Sample ab 2016-01-01 (gleicher Lauf).
//   Portfolio   max. 20 Positionen, je 1/20 des Depotwerts beim Einstieg;
//               mehr Signale als freie Plaetze -> Rang nach 20-Wochen-Rendite.
//   Kosten      0,25 % je Seite (Kommission, Spread, Slippage), keine Steuern.
//   Renditebasis Kurs (split-adjustiert), ohne Dividenden - Strategie und
//               Vergleichsgroessen gleich behandelt.
//   Datenpruefung Wochenrenditen ausserhalb [-75 %, +300 %] gelten als
//               Datenanomalie: der Titel ist in dieser Woche nicht handelbar und
//               fliesst nicht in den Gleichgewichts-Vergleich ein (gezaehlt).
//   Vergleich   (a) gleichgewichtetes Portfolio desselben zulaessigen
//               Universums, woechentlich neu gewichtet, ohne Kosten;
//               (b) SPY Kursindex (ohne Dividenden).
import fs from 'node:fs';
import path from 'node:path';
import { isoWeekKey } from '../engine/indicators.mjs';

export const PILOT_SPEC = Object.freeze({
  id: 'PILOT-DONCHIAN-WEEKLY-20-10',
  registeredAt: '2026-10-01',
  status: 'EXPLORATORY',
  entryLookback: 20, exitLookback: 10, minHistoryWeeks: 52, minPrice: 5,
  start: '2000-01-07', isEnd: '2015-12-31',
  maxPositions: 20, costPerSide: 0.0025,
  anomalyLow: -0.75, anomalyHigh: 3.0,
});

const round = (v, d = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export function loadWeeklyUniverse(root) {
  const dir = path.join(root, 'quant/data/market/discover-series-long');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('ref_') && f.endsWith('.json')).sort();
  const series = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(j.points) || j.points.length < 2) continue;
    series.push({ symbol: j.ticker || f.slice(4, -5), points: j.points.map(([d, c]) => [isoWeekKey(String(d).slice(0, 10)), String(d).slice(0, 10), Number(c)]) });
  }
  const spy = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8'));
  const spyWeek = new Map();
  for (const [d, v] of spy.points) spyWeek.set(isoWeekKey(String(d).slice(0, 10)), Number(v)); // letzter Tag der Woche gewinnt
  return { series, spyWeek, spyThrough: spy.to };
}

// Reiner Rechenkern (testbar mit synthetischen Reihen).
export function runPilot({ series, spyWeek }, spec = PILOT_SPEC) {
  // Kalender: alle Wochen, die in mindestens einer Reihe vorkommen.
  const weekDate = new Map();
  for (const s of series) for (const [k, d] of s.points) if (!weekDate.has(k) || weekDate.get(k) < d) weekDate.set(k, d);
  const weeks = [...weekDate.keys()].sort();
  const W = weeks.length;
  const idx = new Map(weeks.map((k, i) => [k, i]));
  // Kursmatrix je Titel
  let anomalies = 0;
  const stocks = series.map((s) => {
    const c = new Array(W).fill(null);
    for (const [k, , v] of s.points) if (Number.isFinite(v) && v > 0) c[idx.get(k)] = v;
    const first = c.findIndex((v) => v !== null);
    const bad = new Array(W).fill(false);
    for (let t = 1; t < W; t++) {
      if (c[t] !== null && c[t - 1] !== null) {
        const r = c[t] / c[t - 1] - 1;
        if (r < spec.anomalyLow || r > spec.anomalyHigh) { bad[t] = true; anomalies++; }
      }
    }
    return { symbol: s.symbol, c, first, bad };
  });
  const startIdx = weeks.findIndex((k) => weekDate.get(k) >= spec.start);
  const lastIdx = W - 1;
  const eligible = (s, t) => s.c[t] !== null && t - s.first >= spec.minHistoryWeeks && s.c[t] >= spec.minPrice && !s.bad[t];

  const channel = (s, t, n, fn) => {
    let v = fn === 'max' ? -Infinity : Infinity;
    for (let k = t - n; k < t; k++) { const x = s.c[k]; if (x === null) return null; v = fn === 'max' ? Math.max(v, x) : Math.min(v, x); }
    return v;
  };

  let cash = 1, equityPrev = 1;
  const open = new Map(); // symbol -> {shares, entryPrice, entryWeek, lastPrice, pendingExit}
  const trades = [];
  const equity = [];
  const ewCurve = [], spyCurve = [];
  let ew = 1, spyBase = null;
  let pendingEntries = [];
  let exposureSum = 0, exposureN = 0;

  for (let t = startIdx; t <= lastIdx; t++) {
    // 1. Ausfuehrung zum Schluss dieser Woche: erst Ausstiege, dann Einstiege.
    for (const [sym, p] of open) {
      const s = p.stock;
      if (s.c[t] !== null && !s.bad[t]) p.lastPrice = s.c[t];
      if (p.pendingExit && s.c[t] !== null && !s.bad[t]) {
        const px = s.c[t] * (1 - spec.costPerSide);
        cash += p.shares * px;
        trades.push({ symbol: sym, entryWeek: weekDate.get(weeks[p.entryWeek]), exitWeek: weekDate.get(weeks[t]), ret: px / p.entryPrice - 1, weeks: t - p.entryWeek, segment: weekDate.get(weeks[p.entryWeek]) <= spec.isEnd ? 'IS' : 'OOS' });
        open.delete(sym);
      }
    }
    const mtm = () => cash + [...open.values()].reduce((a, p) => a + p.shares * p.lastPrice, 0);
    if (pendingEntries.length) {
      const eqNow = mtm();
      for (const e of pendingEntries) {
        if (open.size >= spec.maxPositions) break;
        const s = e.stock;
        if (open.has(s.symbol) || s.c[t] === null || s.bad[t]) continue;
        const px = s.c[t] * (1 + spec.costPerSide);
        const alloc = Math.min(eqNow / spec.maxPositions, cash);
        if (alloc <= 1e-9) break;
        cash -= alloc;
        open.set(s.symbol, { stock: s, shares: alloc / px, entryPrice: px, entryWeek: t, lastPrice: s.c[t], pendingExit: false });
      }
      pendingEntries = [];
    }
    const eq = mtm();
    equity.push([weekDate.get(weeks[t]), eq]);
    exposureSum += 1 - cash / eq; exposureN++;

    // 2. Vergleich: gleichgewichtetes zulaessiges Universum (ohne Kosten), SPY.
    if (t > startIdx) {
      let sum = 0, n = 0;
      for (const s of stocks) {
        if (s.c[t] === null || s.c[t - 1] === null || s.bad[t]) continue;
        if (!eligible(s, t - 1)) continue;
        sum += s.c[t] / s.c[t - 1] - 1; n++;
      }
      if (n) ew *= 1 + sum / n;
    }
    ewCurve.push([weekDate.get(weeks[t]), ew]);
    const sp = spyWeek.get(weeks[t]);
    if (Number.isFinite(sp)) { if (spyBase === null) spyBase = sp; spyCurve.push([weekDate.get(weeks[t]), sp / spyBase]); }

    // 3. Signale am Wochenschluss t -> Ausfuehrung t+1.
    if (t === lastIdx) break;
    for (const p of open.values()) {
      const s = p.stock;
      if (s.c[t] === null || s.bad[t]) continue;
      const lo = channel(s, t, spec.exitLookback, 'min');
      if (lo !== null && s.c[t] < lo) p.pendingExit = true;
    }
    const cands = [];
    for (const s of stocks) {
      if (open.has(s.symbol) || !eligible(s, t)) continue;
      const hi = channel(s, t, spec.entryLookback, 'max');
      if (hi === null || !(s.c[t] > hi)) continue;
      const base = s.c[t - spec.entryLookback];
      cands.push({ stock: s, score: base ? s.c[t] / base - 1 : 0 });
    }
    cands.sort((a, b) => b.score - a.score || a.stock.symbol.localeCompare(b.stock.symbol));
    pendingEntries = cands;
    equityPrev = eq;
  }
  void equityPrev;
  // Offene Positionen am Ende zum letzten Kurs bewerten (als offen gekennzeichnet).
  const openAtEnd = [...open.values()].map((p) => ({ symbol: p.stock.symbol, ret: p.lastPrice * (1 - spec.costPerSide) / p.entryPrice - 1 }));

  return { weeks: equity.length, anomalies, equity, ewCurve, spyCurve, trades, openAtEnd, exposure: exposureSum / exposureN, universeSize: stocks.length };
}

export function metricsOf(curve, from, to) {
  const pts = curve.filter(([d]) => (!from || d >= from) && (!to || d <= to));
  if (pts.length < 3) return null;
  const r = [];
  for (let i = 1; i < pts.length; i++) r.push(pts[i][1] / pts[i - 1][1] - 1);
  const years = (new Date(pts[pts.length - 1][0]) - new Date(pts[0][0])) / (365.25 * 864e5);
  const total = pts[pts.length - 1][1] / pts[0][1] - 1;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
  let peak = -Infinity, mdd = 0;
  for (const [, v] of pts) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
  return { from: pts[0][0], to: pts[pts.length - 1][0], years: round(years, 2), totalReturn: round(total), cagr: round((1 + total) ** (1 / years) - 1), volatility: round(sd * Math.sqrt(52)), sharpeRf0: sd > 0 ? round(mean / sd * Math.sqrt(52), 2) : null, maxDrawdown: round(mdd) };
}

function tradeStats(trades) {
  if (!trades.length) return null;
  const wins = trades.filter((t) => t.ret > 0), losses = trades.filter((t) => t.ret <= 0);
  const sum = (a) => a.reduce((x, t) => x + t.ret, 0);
  return { trades: trades.length, hitRate: round(wins.length / trades.length), avgWin: round(wins.length ? sum(wins) / wins.length : null), avgLoss: round(losses.length ? sum(losses) / losses.length : null), profitFactor: losses.length && sum(losses) < 0 ? round(sum(wins) / -sum(losses), 2) : null, avgWeeksHeld: round(trades.reduce((a, t) => a + t.weeks, 0) / trades.length, 1) };
}

// Monatsstichproben fuer den Chart (klein halten).
function monthly(curve) {
  const out = []; let last = '';
  for (const [d, v] of curve) { const m = d.slice(0, 7); if (m !== last) { out.push([d, round(v, 4)]); last = m; } else out[out.length - 1] = [d, round(v, 4)]; }
  return out;
}

function yearly(curve) {
  const byYear = new Map();
  for (const [d, v] of curve) byYear.set(d.slice(0, 4), v);
  const ys = [...byYear.keys()].sort();
  const out = [];
  let prev = curve[0][1];
  for (const y of ys) { const v = byYear.get(y); out.push([y, round(v / prev - 1)]); prev = v; }
  return out;
}

export function buildPilotArtifact(root) {
  const data = loadWeeklyUniverse(root);
  const res = runPilot(data);
  const spec = PILOT_SPEC;
  const seg = (curve) => ({ full: metricsOf(curve), inSample: metricsOf(curve, null, spec.isEnd), outOfSample: metricsOf(curve, '2016-01-01') });
  const years = yearly(res.equity), ewYears = yearly(res.ewCurve), spyYears = yearly(res.spyCurve);
  return {
    schema: 'supertrader-pilot-backtest-1.0.0',
    spec,
    status: 'EXPLORATORY',
    statusLabel: 'Explorativ — kein Nachweis historischer Überlegenheit',
    method: { strategyId: 'DONCHIAN_TURTLE', label: 'Donchian-Kanal 20/10 auf Wochenschlüssen', origin: 'Turtle-/Donchian-Kanal (Original: Tagesbalken, Futures); Übertragung auf Aktien und Wochen = VU' },
    universe: { source: 'quant/data/market/discover-series-long (öffentliche Wochenschlussreihen)', series: res.universeSize, rule: '≥ 52 Wochen Historie, Schluss der Vorwoche ≥ 5 USD', anomaliesExcluded: res.anomalies },
    period: { from: res.equity[0][0], to: res.equity[res.equity.length - 1][0], weeks: res.weeks, inSampleEnd: spec.isEnd },
    assumptions: ['Ausführung zum Wochenschluss der Folgewoche', '0,25 % Kosten je Seite', 'Kursrendite ohne Dividenden (auch beim Vergleich)', 'max. 20 Positionen, gleich gewichtet', 'Bargeld unverzinst'],
    biases: [
      { id: 'SURVIVORSHIP', label: 'Nur heute gelistete Titel', effect: 'Insolvente und übernommene Titel fehlen. Das hebt Strategie UND Vergleichsportfolio; der Abstand zwischen beiden ist dadurch nicht bereinigt.' },
      { id: 'UNIVERSE_PIT', label: 'Kein damaliges Universum', effect: 'Welche Titel damals handelbar oder liquide waren, ist unbekannt; es gibt keine Umsatzhistorie für einen Liquiditätsfilter.' },
      { id: 'CORPORATE_ACTIONS', label: 'Split-adjustierte Kurse, keine Dividenden', effect: 'Historische Kurse sind rückwirkend angepasst; die 5-USD-Grenze greift daher nicht exakt wie damals.' },
      { id: 'EXECUTION', label: 'Wochenschluss-Ausführung', effect: 'Reale Ausführung, Gaps und Spreads kleiner Titel sind nur pauschal über Kosten abgebildet.' },
    ],
    strategy: { metrics: seg(res.equity), trades: tradeStats(res.trades), tradesIS: tradeStats(res.trades.filter((t) => t.segment === 'IS')), tradesOOS: tradeStats(res.trades.filter((t) => t.segment === 'OOS')), exposure: round(res.exposure, 3), openAtEnd: res.openAtEnd.length },
    comparison: { equalWeightUniverse: seg(res.ewCurve), spy: seg(res.spyCurve) },
    curves: { strategy: monthly(res.equity), equalWeightUniverse: monthly(res.ewCurve), spy: monthly(res.spyCurve) },
    years: years.map(([y, r]) => ({ year: y, strategy: r, equalWeight: (ewYears.find((x) => x[0] === y) || [])[1] ?? null, spy: (spyYears.find((x) => x[0] === y) || [])[1] ?? null })),
    interpretation: 'Dieser Lauf zeigt, wie sich die Regel auf den heute verfügbaren Reihen verhalten hätte. Er ist kein Beleg, dass die Methode funktioniert: Ohne delistete Titel und ohne damaliges Universum sind alle Renditen nach oben verzerrt.',
  };
}
