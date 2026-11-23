/**
 * Backtest 2.0 – Marktmodell: spaltenweise Tagesbalken aller Titel auf einem gemeinsamen Kalender, in SharedArrayBuffer
 * (Worker lesen ohne Kopie). Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md.
 *
 * Felder je Titel s und Tag t (Index s*T+t), fehlender Balken = NaN:
 *   o,h,l,c   Gesamtrendite-bereinigte Kurse (Dividenden und Splits eingerechnet), Grundlage für Rendite und Stopps
 *   rc        Rohschluss (Preisgrenze), adv Ø Dollarumsatz 20 Sitzungen roh (Universum, Spread)
 *   v         Stückumsatz des Tages (roh; nur für Umsatzvergleiche innerhalb eines Titels, Stufe 6)
 *   sma50, sma200, atr20   aus o/h/l/c
 *   rank      Rang nach adv unter allen Titeln mit Balken am Tag (1 = höchster Umsatz), 65535 = kein Rang
 * Titelweise: terminal (Tagindex des letzten Handelstags eines delisteten Titels, sonst -1) und recovery (Anteil des Schlusses).
 * Markt: spyOn200 / spyOn50 (1 = SPY-Schluss über seiner SMA), aus der SPY-Tagesreihe.
 */

const F32 = (n) => new Float32Array(new SharedArrayBuffer(n * 4));

export const RECOVERY = Object.freeze({ MERGER: 1, ACQUISITION: 1, MERGER_ACQUISITION_COMPLETED: 1, SERIES_END: 1, UNKNOWN: 0.7, DISTRESS: 0, BANKRUPTCY: 0 });

/** Leeres Marktmodell für S Titel auf dem Kalender `dates`. */
export function allocate(dates, ids) {
  const T = dates.length, S = ids.length, n = S * T;
  const m = {
    dates, ids, T, S,
    o: F32(n), h: F32(n), l: F32(n), c: F32(n), rc: F32(n), adv: F32(n), sma50: F32(n), sma200: F32(n), atr20: F32(n), v: F32(n),
    rank: new Uint16Array(new SharedArrayBuffer(n * 2)),
    terminal: new Int32Array(new SharedArrayBuffer(S * 4)).fill(-1),
    recovery: new Float32Array(new SharedArrayBuffer(S * 4)).fill(1),
    spyOn200: new Uint8Array(new SharedArrayBuffer(T)), spyOn50: new Uint8Array(new SharedArrayBuffer(T)),
    spyClose: new Float64Array(new SharedArrayBuffer(T * 8)),
  };
  for (const k of ['o', 'h', 'l', 'c', 'rc', 'adv', 'sma50', 'sma200', 'atr20', 'v']) m[k].fill(NaN);
  m.rank.fill(65535);
  return m;
}

/** Schreibt einen Titel ein. cols: {o,h,l,c,rc,v} je Kalendertag (NaN = kein Balken). */
export function setSecurity(m, s, cols) {
  const T = m.T, base = s * T;
  for (let t = 0; t < T; t++) {
    const c = cols.c[t];
    if (!(c > 0)) continue;
    const o = cols.o[t] > 0 ? cols.o[t] : c, h = cols.h[t] > 0 ? cols.h[t] : Math.max(o, c), l = cols.l[t] > 0 ? cols.l[t] : Math.min(o, c);
    m.o[base + t] = o; m.h[base + t] = Math.max(h, o, c); m.l[base + t] = Math.min(l, o, c); m.c[base + t] = c;
    m.rc[base + t] = cols.rc[t] > 0 ? cols.rc[t] : c;
    m.v[base + t] = cols.v[t] > 0 ? cols.v[t] : 0;
  }
  // Ø Dollarumsatz 20 Sitzungen (roh), SMA 50/200 und ATR 20 über die vorhandenen Balken dieses Titels
  const dv = [], c50 = [], c200 = [], tr20 = [];
  let s50 = 0, s200 = 0, sdv = 0, str = 0, prevC = NaN;
  for (let t = 0; t < T; t++) {
    const i = base + t, c = m.c[i];
    if (!(c > 0)) continue;
    const v = cols.v[t] > 0 ? cols.v[t] : 0, d = m.rc[i] * v;
    dv.push(d); sdv += d; if (dv.length > 20) sdv -= dv.shift();
    c50.push(c); s50 += c; if (c50.length > 50) s50 -= c50.shift();
    c200.push(c); s200 += c; if (c200.length > 200) s200 -= c200.shift();
    const tr = Number.isFinite(prevC) ? Math.max(m.h[i] - m.l[i], Math.abs(m.h[i] - prevC), Math.abs(m.l[i] - prevC)) : m.h[i] - m.l[i];
    tr20.push(tr); str += tr; if (tr20.length > 20) str -= tr20.shift();
    if (dv.length >= 10) m.adv[i] = sdv / dv.length;
    if (c50.length === 50) m.sma50[i] = s50 / 50;
    if (c200.length === 200) m.sma200[i] = s200 / 200;
    if (tr20.length === 20) m.atr20[i] = str / 20;
    prevC = c;
  }
}

export function setTerminal(m, s, t, recovery) { m.terminal[s] = t; m.recovery[s] = recovery; }

/** Rang nach Dollarumsatz je Tag; danach SPY-Filter. spy: Schlusskurse je Kalendertag (NaN = fehlt, wird fortgeschrieben). */
export function finalize(m, spy) {
  const { T, S } = m, buf = new Float64Array(S), idx = new Int32Array(S);
  for (let t = 0; t < T; t++) {
    let n = 0;
    for (let s = 0; s < S; s++) { const a = m.adv[s * T + t]; if (a > 0 && m.c[s * T + t] > 0) { buf[n] = a; idx[n] = s; n++; } }
    const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => buf[b] - buf[a] || idx[a] - idx[b]);
    for (let r = 0; r < n && r < 65534; r++) m.rank[idx[order[r]] * T + t] = r + 1;
  }
  let last = NaN; const w200 = [], w50 = []; let s200 = 0, s50 = 0;
  for (let t = 0; t < T; t++) {
    if (spy[t] > 0) last = spy[t];
    m.spyClose[t] = last;
    if (!(last > 0)) continue;
    w200.push(last); s200 += last; if (w200.length > 200) s200 -= w200.shift();
    w50.push(last); s50 += last; if (w50.length > 50) s50 -= w50.shift();
    m.spyOn200[t] = w200.length === 200 && last > s200 / 200 ? 1 : 0;
    m.spyOn50[t] = w50.length === 50 && last > s50 / 50 ? 1 : 0;
  }
  return m;
}

/** Übertragbare Beschreibung für Worker (nur SharedArrayBuffer und kleine Felder). */
export function share(m) {
  const out = {};
  for (const [k, v] of Object.entries(m)) out[k] = ArrayBuffer.isView(v) ? { kind: v.constructor.name, buffer: v.buffer } : v;
  return out;
}
export function attach(d) {
  const ctor = { Float32Array, Float64Array, Uint16Array, Uint8Array, Int32Array };
  const m = {};
  for (const [k, v] of Object.entries(d)) m[k] = v && v.buffer instanceof SharedArrayBuffer ? new ctor[v.kind](v.buffer) : v;
  return m;
}
