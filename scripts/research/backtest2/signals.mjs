/**
 * Backtest 2.0 – Signalquellen (Stufe 1: nur aus Kursen). Forschung, nicht zertifiziert.
 * Jede Quelle liefert je Tag t eine Kandidatenliste (Entscheidung zum Schluss t, Ausführung zur Eröffnung t+1),
 * absteigend nach relativer Stärke 6 Monate (126 Sitzungen). Die Engine filtert nach Universum und freien Plätzen.
 *
 *   LEADER_RS        Schluss über SMA200 und 126-Tage-Rendite > 0 (Zustand: Marktführer nach relativer Stärke)
 *   TREND_TEMPLATE   Trendvorlage nach Minervini (veröffentlichte Lesart, nicht das zertifizierte SF-Modul C06):
 *                    Schluss > SMA50 > SMA150 > SMA200, SMA200 höher als vor 21 Sitzungen, Schluss ≥ 1,3 × 52-Wochen-Tief,
 *                    Schluss ≥ 0,75 × 52-Wochen-Hoch (Zustand)
 *   BREAKOUT_20/55   Schluss über dem höchsten Hoch der 20 bzw. 55 Sitzungen davor (Ereignis; Turtle-Einstieg auf Schlussbasis)
 *   TT_BREAKOUT_55   TREND_TEMPLATE und BREAKOUT_55 am selben Tag (Ausbruch eines Marktführers)
 *
 * Vorfilter für alle Quellen (lockerstes Universum des Suchraums): Rang ≤ 3.000 und Rohschluss ≥ 5 $.
 * Stufe 2 (eigener PR): die zertifizierten Supertrader-Module und die Quant-Profile.
 */

export const SOURCES = Object.freeze(['LEADER_RS', 'TREND_TEMPLATE', 'BREAKOUT_20', 'BREAKOUT_55', 'TT_BREAKOUT_55']);
const PREFILTER = Object.freeze({ maxRank: 3000, minPrice: 5 });

/** Gleitendes Maximum/Minimum der letzten n Werte (ohne aktuellen), O(1) amortisiert. */
function rolling(n, cmp) {
  const q = [];
  return {
    peek: (k) => { while (q.length && q[0][0] < k - n) q.shift(); return q.length && q[0][0] >= k - n && q[0][0] < k ? q[0][1] : NaN; },
    push: (k, v) => { while (q.length && cmp(v, q[q.length - 1][1])) q.pop(); q.push([k, v]); },
  };
}

/**
 * Baut alle Quellen. Ergebnis je Quelle: { offsets: Int32Array(T+1), items: Int32Array } in SharedArrayBuffer,
 * Kandidaten von Tag t = items[offsets[t] .. offsets[t+1]), sortiert nach Stärke absteigend.
 */
export function buildSignals(m, { prefilter = PREFILTER } = {}) {
  const { T, S } = m;
  const perDay = Object.fromEntries(SOURCES.map((k) => [k, Array.from({ length: T }, () => [])]));
  for (let s = 0; s < S; s++) {
    const base = s * T;
    const hist = []; // Tagindizes mit Balken
    const hi252 = rolling(252, (a, b) => a >= b), lo252 = rolling(252, (a, b) => a <= b);
    const hi20 = rolling(20, (a, b) => a >= b), hi55 = rolling(55, (a, b) => a >= b);
    const c150 = []; let s150 = 0; const sma200Hist = [];
    for (let t = 0; t < T; t++) {
      const i = base + t, c = m.c[i];
      if (!(c > 0)) continue;
      const k = hist.length; hist.push(t);
      c150.push(c); s150 += c; if (c150.length > 150) s150 -= c150.shift();
      sma200Hist.push(m.sma200[i]);
      const H252 = hi252.peek(k), L252 = lo252.peek(k), H20 = hi20.peek(k), H55 = hi55.peek(k);
      hi252.push(k, m.h[i]); lo252.push(k, m.l[i]); hi20.push(k, m.h[i]); hi55.push(k, m.h[i]);
      if (k < 252) continue;
      if (!(m.rank[i] <= prefilter.maxRank && m.rc[i] >= prefilter.minPrice)) continue;
      const c126 = m.c[base + hist[k - 126]], strength = c / c126 - 1;
      if (!Number.isFinite(strength)) continue;
      const sma50 = m.sma50[i], sma200 = m.sma200[i], sma150 = c150.length === 150 ? s150 / 150 : NaN, sma200Prev = sma200Hist[k - 21];
      const leader = c > sma200 && strength > 0;
      const tt = c > sma50 && sma50 > sma150 && sma150 > sma200 && sma200 > sma200Prev && c >= 1.3 * L252 && c >= 0.75 * H252;
      const b20 = c > H20, b55 = c > H55;
      if (leader) perDay.LEADER_RS[t].push([s, strength]);
      if (tt) perDay.TREND_TEMPLATE[t].push([s, strength]);
      if (b20) perDay.BREAKOUT_20[t].push([s, strength]);
      if (b55) perDay.BREAKOUT_55[t].push([s, strength]);
      if (tt && b55) perDay.TT_BREAKOUT_55[t].push([s, strength]);
    }
  }
  const out = {};
  for (const k of SOURCES) {
    const days = perDay[k];
    let n = 0; for (const d of days) n += d.length;
    const offsets = new Int32Array(new SharedArrayBuffer((T + 1) * 4)), items = new Int32Array(new SharedArrayBuffer(Math.max(1, n) * 4));
    let p = 0;
    for (let t = 0; t < T; t++) {
      offsets[t] = p;
      days[t].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      for (const [s] of days[t]) items[p++] = s;
    }
    offsets[T] = p;
    out[k] = { offsets, items };
  }
  return out;
}
