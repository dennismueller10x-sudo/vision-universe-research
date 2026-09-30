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

export function atr(high, low, close, n = 14) {
  const tr = high.map((h, i) => {
    if (!Number.isFinite(h) || !Number.isFinite(low[i])) return null;
    const pc = i > 0 ? close[i - 1] : null;
    return Number.isFinite(pc) ? Math.max(h - low[i], Math.abs(h - pc), Math.abs(low[i] - pc)) : h - low[i];
  });
  return sma(tr, n);
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
    adr20: adrPct(high, low, 20), atr14: atr(high, low, close, 14),
    high252: rollingMax(high, 252), low252: rollingMin(low, 252),
    ret21: pctReturn(close, 21), ret63: pctReturn(close, 63), ret126: pctReturn(close, 126),
    ret189: pctReturn(close, 189), ret252: pctReturn(close, 252),
    dollarVol20: dollarVolume(close, volume, 20),
    range1d: high.map((h, i) => (Number.isFinite(h) && low[i] > 0) ? h / low[i] - 1 : null),
  };
}
