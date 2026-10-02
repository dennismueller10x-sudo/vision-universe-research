// Supertrader — Wochenreihe fuer Wochenstrategien (Weinstein). Eine Quelle fuer
// Live-Build (scripts/supertrader/build.mjs) und interne Pruefung
// (scripts/supertrader/validation/analyze-methods.mjs).
import { isoWeekKey, sma } from './indicators.mjs';

// Wochenreihe: lange Wochenschlusskurse + aus Tagesbalken abgeleitete Wochen
// danach. Volumen nur, wo Tagesbalken existieren. weekAt[t] ist nur an
// VOLLSTAENDIGEN Wochenenden gesetzt (naechster Balken in neuer Woche, oder
// letzter Balken an einem Freitag).
export function buildWeekly(inst, longPoints, bench) {
  const { bars } = inst;
  const weeks = new Map();
  for (const [d, c] of longPoints || []) weeks.set(isoWeekKey(String(d).slice(0, 10)), { date: String(d).slice(0, 10), close: c, volume: null });
  const n = bars.date.length;
  const weekAt = new Array(n).fill(null);
  const dailyWeekEnd = new Map();
  for (let t = 0; t < n; t++) {
    const wk = isoWeekKey(bars.date[t]);
    const w = weeks.get(wk) || { date: bars.date[t], close: bars.close[t], volume: 0 };
    if (w.volume === null) w.volume = 0;
    w._daily = (w._daily || 0) + 1;
    w.volume += Number.isFinite(bars.volume[t]) ? bars.volume[t] : 0;
    w.close = bars.close[t]; w.date = bars.date[t];
    weeks.set(wk, w);
    const nextWk = t + 1 < n ? isoWeekKey(bars.date[t + 1]) : null;
    const complete = nextWk ? nextWk !== wk : new Date(bars.date[t] + 'T12:00:00Z').getUTCDay() === 5;
    if (complete) dailyWeekEnd.set(t, wk);
  }
  const keys = [...weeks.keys()].sort();
  // Die erste Woche im Tagesfenster ist moeglicherweise unvollstaendig
  // (Fenster beginnt mitten in der Woche): Volumen dort nicht verwenden.
  const firstDailyWeek = isoWeekKey(bars.date[0]);
  const w = { date: [], close: [], volume: [], key: [] };
  for (const k of keys) {
    const x = weeks.get(k);
    w.key.push(k); w.date.push(x.date); w.close.push(x.close);
    w.volume.push(x._daily && k !== firstDailyWeek ? x.volume : null);
  }
  w.ma30 = sma(w.close, 30);
  w.rs = w.close.map((c, i) => { const b = bench.byWeek.get(w.key[i]); return Number.isFinite(b) && b > 0 ? c / b : null; });
  w.volAvg = w.volume.map((_, i) => {
    let s = 0, c = 0;
    for (let j = i - 10; j < i; j++) if (j >= 0 && Number.isFinite(w.volume[j])) { s += w.volume[j]; c++; }
    return c >= 8 ? s / c : null;
  });
  const keyIndex = new Map(w.key.map((k, i) => [k, i]));
  for (const [t, wk] of dailyWeekEnd) weekAt[t] = keyIndex.get(wk);
  return { weekly: w, weekAt };
}

