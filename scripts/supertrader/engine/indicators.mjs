// Supertrader — Indikatoren auf spaltenorientierten Tagesbalken.
//
// Alle Funktionen sind rein und kausal: der Wert an Index t haengt nur von
// Balken 0..t ab. Das ist die Voraussetzung dafuer, dass derselbe Code im
// Live-Scan und im Backtest laufen darf, ohne Zukunftswissen einzuschleusen.
// Fehlt die Historie fuer einen Wert, steht dort null - nie ein Ersatzwert.

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { sum = 0; count = 0; continue; }
    sum += v; count++;
    if (count > n) { sum -= values[i - n]; count = n; }
    if (count === n) out[i] = sum / n;
  }
  return out;
}

// Kullamaegis ADR-Definition: durchschnittliche prozentuale Tagesspanne
// (High/Low - 1) der letzten 20 Sitzungen, als Anteil (0.05 = 5 %).
export function adrPct(high, low, n = 20) {
  const r = high.map((h, i) => (Number.isFinite(h) && Number.isFinite(low[i]) && low[i] > 0) ? h / low[i] - 1 : null);
  return sma(r, n);
}

// ATR (Average True Range). Eine Definition fuer die Plattform: Wilder-Glaettung
// (RMA) wie in der Technical-Welt (quant/engines/technical/feature-store.js#wilder)
// und in der Turtle-Quelle ("N = (19 x PDN + TR) / 20", Start mit dem 20-Tage-Mittel).
// method: 'wilder' (Standard) | 'sma' (einfaches Mittel der letzten n True Ranges;
// nur noch fuer Regelversionen, die es ausdruecklich festschreiben, z. B. Donchian 1.1.0).
// Herleitung und Vorher/Nachher: docs/SUPERTRADER_ATR_WILDER.md.
export const ATR_METHODS = Object.freeze(['wilder', 'sma']);
export const ATR_DEFAULT_METHOD = 'wilder';

export function atr(high, low, close, n = 14, { method = ATR_DEFAULT_METHOD } = {}) {
  const tr = trueRange(high, low, close);
  if (method === 'wilder') return wilder(tr, n);
  if (method === 'sma') return sma(tr, n);
  throw new Error(`ATR_METHOD_UNKNOWN:${method}`);
}

// True Range je Balken: max(H - L, |H - Vortagesschluss|, |L - Vortagesschluss|);
// ohne Vortagesschluss (erster Balken, Luecke) die Tagesspanne H - L.
export function trueRange(high, low, close) {
  return high.map((h, i) => {
    if (!Number.isFinite(h) || !Number.isFinite(low[i])) return null;
    const pc = i > 0 ? close[i - 1] : null;
    return Number.isFinite(pc) ? Math.max(h - low[i], Math.abs(h - pc), Math.abs(low[i] - pc)) : h - low[i];
  });
}

// Wilder-Glaettung (RMA, alpha = 1/n): Startwert = Mittel der ersten n gueltigen
// Werte, danach prev = (prev * (n - 1) + v) / n. Ein fehlender Wert aendert den
// Zustand nicht und liefert an seiner Stelle null (kein Ersatzwert); die Rekursion
// laeuft mit dem naechsten gueltigen Wert weiter - wie die Technical-Welt, die an
// der Luecke selbst den Vorwert zeigt.
export function wilder(values, n) {
  const out = new Array(values.length).fill(null);
  let prev = null, sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (prev === null) {
      sum += v; count++;
      if (count === n) { prev = sum / n; out[i] = prev; }
      continue;
    }
    prev = (prev * (n - 1) + v) / n;
    out[i] = prev;
  }
  return out;
}

export function rollingMax(values, n) {
  const out = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    let m = -Infinity, ok = true;
    for (let j = i - n + 1; j <= i; j++) { if (!Number.isFinite(values[j])) { ok = false; break; } if (values[j] > m) m = values[j]; }
    if (ok) out[i] = m;
  }
  return out;
}

export function rollingMin(values, n) {
  const out = new Array(values.length).fill(null);
  for (let i = n - 1; i < values.length; i++) {
    let m = Infinity, ok = true;
    for (let j = i - n + 1; j <= i; j++) { if (!Number.isFinite(values[j])) { ok = false; break; } if (values[j] < m) m = values[j]; }
    if (ok) out[i] = m;
  }
  return out;
}

export function pctReturn(close, n) {
  return close.map((c, i) => (i >= n && Number.isFinite(c) && close[i - n] > 0) ? c / close[i - n] - 1 : null);
}

export function dollarVolume(close, volume, n = 20) {
  return sma(close.map((c, i) => (Number.isFinite(c) && Number.isFinite(volume[i])) ? c * volume[i] : null), n);
}

export function maxIn(values, from, to) {
  let m = -Infinity, at = -1;
  for (let i = Math.max(0, from); i <= to; i++) if (Number.isFinite(values[i]) && values[i] > m) { m = values[i]; at = i; }
  return at < 0 ? null : { value: m, index: at };
}

export function minIn(values, from, to) {
  let m = Infinity, at = -1;
  for (let i = Math.max(0, from); i <= to; i++) if (Number.isFinite(values[i]) && values[i] < m) { m = values[i]; at = i; }
  return at < 0 ? null : { value: m, index: at };
}

export function mean(values, from, to) {
  let s = 0, c = 0;
  for (let i = Math.max(0, from); i <= to; i++) if (Number.isFinite(values[i])) { s += values[i]; c++; }
  return c ? s / c : null;
}

// Perzentilrang (0..100) jedes Werts innerhalb eines Querschnitts.
// Gleiche Werte erhalten denselben (mittleren) Rang.
export function percentileRanks(entries) {
  const valid = entries.filter((e) => Number.isFinite(e.value)).sort((a, b) => a.value - b.value);
  const out = new Map();
  const n = valid.length;
  if (n < 2) { for (const e of valid) out.set(e.key, null); return out; }
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && valid[j + 1].value === valid[i].value) j++;
    const rank = ((i + j) / 2) / (n - 1) * 100;
    for (let k = i; k <= j; k++) out.set(valid[k].key, rank);
    i = j + 1;
  }
  return out;
}

// ISO-Kalenderwoche als Schluessel "YYYY-Www" (Handelswoche = Kalenderwoche).
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Standardpaket je Instrument; einmal berechnet, von allen Strategien gelesen.
export function computeIndicators(bars) {
  const { high, low, close, volume } = bars;
  return {
    sma10: sma(close, 10), sma20: sma(close, 20), sma50: sma(close, 50),
    sma150: sma(close, 150), sma200: sma(close, 200),
    vol20: sma(volume, 20), vol50: sma(volume, 50),
    // atr14: Plattform-ATR (Wilder). atr20: einziger Leser ist die eingefrorene
    // Regelversion Donchian 1.1.0 (N = 2 x atr20 als Stop); PREREGISTRATION-R8-TURTLE
    // fuehrt "N als 20-Tage-Mittel" ausdruecklich als ihren Unterschied zu 2.0.0.
    // Deshalb bleibt atr20 festgeschrieben das SMA - neue Regeln lesen atr14 oder
    // rufen atr() mit Wilder auf (docs/SUPERTRADER_ATR_WILDER.md).
    adr20: adrPct(high, low, 20), atr14: atr(high, low, close, 14), atr20: atr(high, low, close, 20, { method: 'sma' }),
    high252: rollingMax(high, 252), low252: rollingMin(low, 252),
    ret21: pctReturn(close, 21), ret63: pctReturn(close, 63), ret126: pctReturn(close, 126),
    ret189: pctReturn(close, 189), ret252: pctReturn(close, 252),
    dollarVol20: dollarVolume(close, volume, 20),
    range1d: high.map((h, i) => (Number.isFinite(h) && low[i] > 0) ? h / low[i] - 1 : null),
  };
}
