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

// v1.1.0 (2026-10-01, Pruefrunde 5) - nur Daten- und Buchungskorrekturen,
// keine Regel- oder Parameteraenderung (20/10, 20 Plaetze, 5 USD, Kosten,
// Zeitraum, Anomaliegrenzen unveraendert):
//   K1 Datenluecke > 4 Wochen oder Reihenende: eine gehaltene Position wurde
//      in v1.0.0 zum letzten Kurs eingefroren und belegte ihren Platz bis zum
//      naechsten Kurs - bei TRAK 496 Wochen, bei CCXI 208 Wochen, abgerechnet
//      gegen den Kurs eines spaeter unter demselben Kuerzel gelisteten
//      Unternehmens. Jetzt: Datenbruch, Abrechnung zum letzten gueltigen
//      Kurs (gekennzeichnet DATA_BREAK), die Reihe beginnt neu (52 Wochen).
//   K2 Datenanomalie in einer gehaltenen Position: v1.0.0 nahm den Titel nur
//      im Vergleichsportfolio heraus, buchte den Sprung in der Strategie aber
//      in der Folgewoche voll (z. B. POCI -99 % / +4.900 % / -90 %, ARWR
//      -86 % und -85 % innerhalb eines Trades). Jetzt fuer beide gleich:
//      eine Anomalie ist ein Datenbruch wie K1.
//   K3 Geldbuchung je Trade (pnl), damit Depotwert und Trades abstimmbar sind.
export const PILOT_VERSION = '1.1.0';
export const PILOT_SPEC = Object.freeze({
  id: 'PILOT-DONCHIAN-WEEKLY-20-10',
  version: PILOT_VERSION,
  registeredAt: '2026-10-01',
  status: 'EXPLORATORY',
  dataBreaks: true, maxGapWeeks: 4,
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
  // Abstand in Wochen nach Kalenderdatum (nicht nach Index: Wochen, die in
  // keiner Reihe vorkommen, fehlen im Index).
  const dayMs = weeks.map((k) => Date.parse(weekDate.get(k) + 'T00:00:00Z'));
  const weeksBetween = (a, b) => Math.round((dayMs[b] - dayMs[a]) / (7 * 864e5));
  // Kursmatrix je Titel
  let anomalies = 0, gapBreaks = 0;
  const breaks = !!spec.dataBreaks;
  const stocks = series.map((s) => {
    const c = new Array(W).fill(null);
    for (const [k, , v] of s.points) if (Number.isFinite(v) && v > 0) c[idx.get(k)] = v;
    const first = c.findIndex((v) => v !== null);
    const bad = new Array(W).fill(false);
    // seg[t]: erste Woche des zusammenhaengenden Abschnitts, zu dem t gehoert
    // (v1.0.0: immer die erste Woche der Reihe).
    const seg = new Array(W).fill(first);
    let lastValid = -1, segStart = first;
    for (let t = Math.max(first, 0); t < W && first >= 0; t++) {
      if (c[t] === null) { seg[t] = segStart; continue; }
      const prev = breaks ? lastValid : (t > 0 && c[t - 1] !== null ? t - 1 : -1);
      if (prev >= 0 && (!breaks || weeksBetween(prev, t) <= spec.maxGapWeeks + 1)) {
        const r = c[t] / c[prev] - 1;
        if (r < spec.anomalyLow || r > spec.anomalyHigh) { bad[t] = true; anomalies++; if (breaks) segStart = t; }
      } else if (breaks && prev >= 0) { segStart = t; gapBreaks++; }
      seg[t] = segStart;
      lastValid = t;
    }
    return { symbol: s.symbol, c, first, bad, seg };
  });
  const startIdx = weeks.findIndex((k) => weekDate.get(k) >= spec.start);
  const lastIdx = W - 1;
  const eligible = (s, t) => s.c[t] !== null && t - s.seg[t] >= spec.minHistoryWeeks && s.c[t] >= spec.minPrice && !s.bad[t];
  const sameSegment = (s, a, b) => s.seg[a] === s.seg[b];

  const channel = (s, t, n, fn) => {
    let v = fn === 'max' ? -Infinity : Infinity;
    for (let k = t - n; k < t; k++) { const x = s.c[k]; if (x === null || (breaks && !sameSegment(s, k, t))) return null; v = fn === 'max' ? Math.max(v, x) : Math.min(v, x); }
    return v;
  };

  let cash = 1, equityPrev = 1;
  const open = new Map(); // symbol -> {shares, alloc, entryPrice, entryWeek, lastPrice, lastIdx, pendingExit}
  const close = (sym, p, t, rawPx, reason) => {
    const px = rawPx * (1 - spec.costPerSide);
    cash += p.shares * px;
    trades.push({ symbol: sym, entryWeek: weekDate.get(weeks[p.entryWeek]), exitWeek: weekDate.get(weeks[t]), entryClose: p.entryClose, exitClose: rawPx, ret: px / p.entryPrice - 1, pnl: p.shares * px - p.alloc, weeks: t - p.entryWeek, reason, segment: weekDate.get(weeks[p.entryWeek]) <= spec.isEnd ? 'IS' : 'OOS' });
    open.delete(sym);
  };
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
      // K1/K2: Datenbruch (Anomalie, neuer Abschnitt oder Luecke > maxGapWeeks)
      // -> Abrechnung zum letzten gueltigen Kurs, gekennzeichnet.
      if (breaks && ((s.c[t] !== null && (s.bad[t] || s.seg[t] !== s.seg[p.lastIdx])) || (s.c[t] === null && weeksBetween(p.lastIdx, t) > spec.maxGapWeeks))) {
        close(sym, p, t, p.lastPrice, 'DATA_BREAK');
        continue;
      }
      if (s.c[t] !== null && !s.bad[t]) { p.lastPrice = s.c[t]; p.lastIdx = t; }
      if (p.pendingExit && s.c[t] !== null && !s.bad[t]) close(sym, p, t, s.c[t], 'CHANNEL_EXIT');
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
        open.set(s.symbol, { stock: s, shares: alloc / px, alloc, entryPrice: px, entryClose: s.c[t], entryWeek: t, lastPrice: s.c[t], lastIdx: t, pendingExit: false });
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
        if (!eligible(s, t - 1) || (breaks && !sameSegment(s, t - 1, t))) continue;
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
  const openAtEnd = [...open.values()].map((p) => ({ symbol: p.stock.symbol, entryWeek: weekDate.get(weeks[p.entryWeek]), ret: p.lastPrice * (1 - spec.costPerSide) / p.entryPrice - 1, pnlMarked: p.shares * p.lastPrice - p.alloc }));

  return { weeks: equity.length, anomalies, gapBreaks, equity, ewCurve, spyCurve, trades, openAtEnd, exposure: exposureSum / exposureN, universeSize: stocks.length };
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

// Unabhaengige Nachrechnung einzelner Trades direkt aus den Rohpunkten der
// Reihe (ohne den Rechenkern): Signalwoche, Kanal, Ausfuehrungskurs, Rendite.
export function verifyTradeFromRaw(points, trade, spec = PILOT_SPEC) {
  const pts = points.map((p) => (Array.isArray(p) && p.length === 3 ? [p[1], p[2]] : [String(p[0]).slice(0, 10), Number(p[1])]));
  const at = (d) => pts.findIndex((p) => p[0] === d);
  const iE = at(trade.entryWeek), iX = at(trade.exitWeek);
  if (iE < spec.entryLookback + 1 || iX < 0) return { ok: false, why: 'Woche nicht in der Reihe' };
  const sig = iE - 1;
  const prior = pts.slice(sig - spec.entryLookback, sig).map((p) => p[1]);
  const entryOk = pts[sig][1] > Math.max(...prior);
  const entryPx = pts[iE][1] * (1 + spec.costPerSide);
  let exitOk = true;
  if (trade.reason === 'CHANNEL_EXIT') {
    const xs = iX - 1;
    const lo = Math.min(...pts.slice(xs - spec.exitLookback, xs).map((p) => p[1]));
    exitOk = pts[xs][1] < lo;
  }
  const exitRaw = trade.reason === 'CHANNEL_EXIT' ? pts[iX][1] : trade.exitClose;
  const ret = (exitRaw * (1 - spec.costPerSide)) / entryPx - 1;
  return { ok: entryOk && exitOk && Math.abs(ret - trade.ret) < 1e-9 && Math.abs(pts[iE][1] - trade.entryClose) < 1e-9,
    signalWeek: pts[sig][0], signalClose: pts[sig][1], channelHigh: Math.max(...prior), entryClose: pts[iE][1], exitClose: exitRaw, ret };
}

export function buildPilotArtifact(root) {
  const data = loadWeeklyUniverse(root);
  const res = runPilot(data);
  const spec = PILOT_SPEC;
  const v100 = runPilot(data, { ...spec, dataBreaks: false });
  const seg = (curve) => ({ full: metricsOf(curve), inSample: metricsOf(curve, null, spec.isEnd), outOfSample: metricsOf(curve, '2016-01-01') });
  const years = yearly(res.equity), ewYears = yearly(res.ewCurve), spyYears = yearly(res.spyCurve);
  // Abstimmung: Depotwert am Ende = Startkapital + Summe aller gebuchten Trades + offene Positionen.
  const closedPnl = res.trades.reduce((a, t) => a + t.pnl, 0), openPnl = res.openAtEnd.reduce((a, t) => a + t.pnlMarked, 0);
  const finalEq = res.equity[res.equity.length - 1][1];
  const bucket = (px) => (px < 10 ? 'unter 10 USD' : px < 20 ? '10–20 USD' : px < 50 ? '20–50 USD' : 'ab 50 USD');
  const byPrice = {}, byPeriod = {};
  for (const t of res.trades) {
    const b = byPrice[bucket(t.entryClose)] ||= { trades: 0, wins: 0, pnl: 0 };
    b.trades++; b.pnl += t.pnl; if (t.ret > 0) b.wins++;
    const y = t.exitWeek.slice(0, 4), k = y < '2008' ? '2000–2007' : y < '2016' ? '2008–2015' : y < '2021' ? '2016–2020' : '2021–heute';
    byPeriod[k] = (byPeriod[k] || 0) + t.pnl;
  }
  const breaks = res.trades.filter((t) => t.reason === 'DATA_BREAK');
  const sorted = [...res.trades].sort((a, b) => a.ret - b.ret);
  const pickSample = [res.trades.find((t) => t.segment === 'IS' && t.reason === 'CHANNEL_EXIT'), res.trades.find((t) => t.segment === 'OOS' && t.reason === 'CHANNEL_EXIT'), sorted.find((t) => t.reason === 'CHANNEL_EXIT'), [...sorted].reverse().find((t) => t.reason === 'CHANNEL_EXIT'), breaks[0]].filter(Boolean);
  const bySym = new Map(data.series.map((s) => [s.symbol, s]));
  const sample = pickSample.map((t) => ({ ...t, ret: round(t.ret, 6), pnl: round(t.pnl, 6), raw: verifyTradeFromRaw(bySym.get(t.symbol).points, t) }));
  const r6 = (x) => round(x, 6);
  return {
    schema: 'supertrader-pilot-backtest-1.1.0',
    spec,
    status: 'EXPLORATORY',
    statusLabel: 'Explorativ — kein Nachweis historischer Überlegenheit',
    method: { strategyId: 'DONCHIAN_TURTLE', label: 'Donchian-Kanal 20/10 auf Wochenschlüssen', origin: 'Turtle-/Donchian-Kanal (Original: Tagesbalken, Futures); Übertragung auf Aktien und Wochen = VU' },
    universe: { source: 'quant/data/market/discover-series-long (öffentliche Wochenschlussreihen)', series: res.universeSize, rule: '≥ 52 Wochen lückenlose Historie, Schluss der Vorwoche ≥ 5 USD', anomaliesExcluded: res.anomalies, gapBreaks: res.gapBreaks },
    period: { from: res.equity[0][0], to: res.equity[res.equity.length - 1][0], weeks: res.weeks, inSampleEnd: spec.isEnd },
    assumptions: ['Ausführung zum Wochenschluss der Folgewoche', '0,25 % Kosten je Seite', 'Kursrendite ohne Dividenden (auch beim Vergleich)', 'max. 20 Positionen, je 1/20 des Depotwerts', 'Bargeld unverzinst', 'Datenbruch (Lücke > 4 Wochen, Reihenende, Anomalie): Abrechnung zum letzten gültigen Kurs'],
    biases: [
      { id: 'SURVIVORSHIP', label: 'Nur heute gelistete Titel', direction: 'UP', effect: 'Pleiten und übernommene Titel fehlen. Das hebt Regel UND Vergleichsportfolio; wie stark der Abstand dadurch verschoben ist, lässt sich ohne delistete Titel nicht bestimmen.' },
      { id: 'UNIVERSE_PIT', label: 'Kein damaliges Universum', direction: 'UNKNOWN', effect: 'Welche Titel damals handelbar und liquide waren, ist unbekannt; die Wochenreihen tragen kein Volumen für einen Liquiditätsfilter.' },
      { id: 'CORPORATE_ACTIONS', label: 'Split-adjustierte Kurse, keine Dividenden', direction: 'UNKNOWN', effect: 'Nach Reverse-Splits liegen alte Kurse rückwirkend höher - die 5-USD-Grenze lässt damalige Pennystocks durch. Ohne Dividenden sind Regel und Vergleich gleich benachteiligt.' },
      { id: 'DATA_BREAKS', label: 'Datenbrüche zum letzten Kurs abgerechnet', direction: 'UP', effect: 'Endet eine Reihe oder springt sie unplausibel, rechnet der Test zum letzten gültigen Kurs ab. Ein echter Totalverlust wird so nicht gebucht (' + breaks.length + ' Trades betroffen).' },
      { id: 'EXECUTION', label: 'Wochenschluss-Ausführung', direction: 'UNKNOWN', effect: 'Reale Ausführung, Gaps und Spreads kleiner Titel sind nur pauschal über Kosten abgebildet.' },
    ],
    strategy: { metrics: seg(res.equity), trades: tradeStats(res.trades), tradesIS: tradeStats(res.trades.filter((t) => t.segment === 'IS')), tradesOOS: tradeStats(res.trades.filter((t) => t.segment === 'OOS')), exposure: round(res.exposure, 3), openAtEnd: res.openAtEnd.length, dataBreakExits: breaks.length },
    comparison: { equalWeightUniverse: seg(res.ewCurve), spy: seg(res.spyCurve) },
    curves: { strategy: monthly(res.equity), equalWeightUniverse: monthly(res.ewCurve), spy: monthly(res.spyCurve) },
    years: years.map(([y, r]) => ({ year: y, strategy: r, equalWeight: (ewYears.find((x) => x[0] === y) || [])[1] ?? null, spy: (spyYears.find((x) => x[0] === y) || [])[1] ?? null })),
    audit: {
      reconciliation: { finalEquity: r6(finalEq), startPlusClosedPlusOpen: r6(1 + closedPnl + openPnl), closedPnl: r6(closedPnl), openPnl: r6(openPnl), ok: Math.abs(finalEq - (1 + closedPnl + openPnl)) < 1e-9 },
      pnlByEntryPrice: Object.fromEntries(Object.entries(byPrice).map(([k, v]) => [k, { trades: v.trades, hitRate: round(v.wins / v.trades, 3), pnl: round(v.pnl, 3) }])),
      pnlByExitPeriod: Object.fromEntries(Object.entries(byPeriod).map(([k, v]) => [k, round(v, 3)])),
      tradeSample: sample,
      // Konzentration: wie stark haengt das Ergebnis an wenigen Trades?
      topContributors: [...res.trades].sort((a, b) => b.pnl - a.pnl).slice(0, 5).map((t) => ({ symbol: t.symbol, entryWeek: t.entryWeek, exitWeek: t.exitWeek, entryClose: t.entryClose, exitClose: t.exitClose, ret: round(t.ret, 4), pnl: round(t.pnl, 3) })),
      // Reverse-Split-Artefakt: split-adjustierte Einstiegskurse ueber 1.000 USD
      // zeigen massive spaetere Reverse-Splits - damals oft Penny-/OTC-Titel.
      // Die 5-USD-Regel greift bei ihnen nicht (Spezifikationsgrenze, nicht
      // nachtraeglich korrigiert).
      adjustedPriceArtifacts: (() => {
        const a = res.trades.filter((t) => t.entryClose > 1000);
        return { rule: 'split-adjustierter Einstiegskurs > 1.000 USD', trades: a.length, pnl: round(a.reduce((x, t) => x + t.pnl, 0), 3), seriesWithAdjustedAbove10000: data.series.filter((x) => x.points.some((p) => p[2] > 10000)).length };
      })(),
      runHistory: 'Regeln und Parameter wurden vor dem ersten Lauf im Code festgelegt und danach nicht verändert (v1.0.0, ein Lauf). Die Festlegung ist nur im selben Commit wie das Ergebnis belegt, nicht extern registriert; die Datenabdeckung war vorher bekannt. v1.1.0 ist der zweite Lauf: Daten- und Buchungskorrekturen nach einer Prüfung, ohne Regel- oder Parameteränderung.',
    },
    history: [{
      version: '1.0.0', computedAt: '2026-10-01',
      metrics: { cagr: metricsOf(v100.equity).cagr, maxDrawdown: metricsOf(v100.equity).maxDrawdown, inSampleCagr: metricsOf(v100.equity, null, spec.isEnd).cagr, outOfSampleCagr: metricsOf(v100.equity, '2016-01-01').cagr, trades: v100.trades.length },
      supersededBecause: [
        'K1: Positionen über Datenlücken eingefroren (TRAK 496 Wochen, CCXI 208 Wochen; abgerechnet gegen ein später unter demselben Kürzel gelistetes Unternehmen)',
        'K2: Datenanomalien im Vergleichsportfolio ausgeschlossen, in der Regel aber voll gebucht (ungleiche Behandlung)',
      ],
    }],
    interpretation: 'Die Regel hätte auf den heute verfügbaren Reihen Geld verloren, während das gleich gewichtete Universum und SPY zulegten. Das ist kein Beleg gegen die Methode und erst recht keiner dafür: Ohne delistete Titel und ohne damaliges Universum ist das Ergebnis nicht validierbar.',
  };
}
