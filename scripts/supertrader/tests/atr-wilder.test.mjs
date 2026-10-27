// Supertrader-ATR auf Wilder (docs/SUPERTRADER_ATR_WILDER.md): Referenztests.
// Handgerechnete Werte, eine unabhaengige naive Referenz (geschlossene Form der
// Wilder-Rekursion), Gleichheit mit dem Turtle-N der Live-Engine und die
// festgeschriebene Rechenweise der eingefrorenen Regelversion Donchian 1.1.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { atr, wilder, trueRange, sma, computeIndicators, ATR_DEFAULT_METHOD, ATR_METHODS } from '../engine/indicators.mjs';
import donchian from '../engine/strategies/donchian.mjs';
import { turtleN as turtleNEngine } from '../engine/strategies/donchian-v2.mjs';

const close = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// Deterministischer Zufall (mulberry32), damit die Referenzreihen reproduzierbar sind.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randomBars(n, seed) {
  const r = rng(seed), b = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  let c = 100;
  for (let i = 0; i < n; i++) {
    const o = c * (1 + (r() - 0.5) * 0.04 + (r() < 0.03 ? (r() - 0.3) * 0.2 : 0)); // gelegentliche Kurs-Luecken
    const nc = o * (1 + (r() - 0.5) * 0.05);
    const h = Math.max(o, nc) * (1 + r() * 0.02), l = Math.min(o, nc) * (1 - r() * 0.02);
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    b.date.push(d); b.open.push(o); b.high.push(h); b.low.push(l); b.close.push(nc); b.volume.push(1e6 + r() * 1e6);
    c = nc;
  }
  return b;
}

// Naive Referenz ohne Rekursion: ATR_t = (1-a)^(t-s) * Start + Summe_{k=s+1..t} a (1-a)^(t-k) TR_k,
// a = 1/n, s = n-1, Start = Mittel der ersten n TR.
function naiveWilderAtr(b, n) {
  const tr = b.high.map((h, i) => (i === 0 ? h - b.low[i] : Math.max(h - b.low[i], Math.abs(h - b.close[i - 1]), Math.abs(b.low[i] - b.close[i - 1]))));
  const a = 1 / n, s = n - 1, seed = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  return tr.map((_, t) => {
    if (t < s) return null;
    let v = Math.pow(1 - a, t - s) * seed;
    for (let k = s + 1; k <= t; k++) v += a * Math.pow(1 - a, t - k) * tr[k];
    return v;
  });
}

test('ATR: Standard ist Wilder, Methoden sind festgelegt, unbekannte Methode bricht ab', () => {
  assert.equal(ATR_DEFAULT_METHOD, 'wilder');
  assert.deepEqual([...ATR_METHODS], ['wilder', 'sma']);
  assert.throws(() => atr([1], [1], [1], 14, { method: 'ema' }), /ATR_METHOD_UNKNOWN:ema/);
});

test('Wilder: handgerechnete Werte (n = 3)', () => {
  const w = wilder([1, 2, 3, 4, 5, 6], 3);
  assert.deepEqual(w.slice(0, 2), [null, null]);
  assert.ok(close(w[2], 2));              // (1+2+3)/3
  assert.ok(close(w[3], 8 / 3));          // (2*2+4)/3
  assert.ok(close(w[4], 31 / 9));         // (8/3*2+5)/3
  assert.ok(close(w[5], 116 / 27));       // (31/9*2+6)/3
});

test('ATR: handgerechnete True Range, Wilder und SMA an einer Kurs-Luecke', () => {
  // H, L, C; Tag 4 oeffnet mit Luecke ueber dem Vortagesschluss.
  const H = [10, 11, 13, 12, 16], L = [8, 9, 10, 9, 11], C = [9, 10, 12, 10, 15];
  assert.deepEqual(trueRange(H, L, C), [2, 2, 3, 3, 6]);
  const w = atr(H, L, C, 3), s = atr(H, L, C, 3, { method: 'sma' });
  assert.deepEqual([w[0], w[1], s[0], s[1]], [null, null, null, null]);
  assert.ok(close(w[2], 7 / 3) && close(s[2], 7 / 3), 'gleicher Startwert');
  assert.ok(close(w[3], 23 / 9)); assert.ok(close(s[3], 8 / 3));
  // Schock: Wilder reagiert mit 1/n, das SMA mit dem vollen Fenster - und vergisst ihn nach n Tagen abrupt.
  assert.ok(close(w[4], 100 / 27)); assert.ok(close(s[4], 4));
});

test('ATR Wilder = naive geschlossene Form (n = 14 und 20, 400 Balken)', () => {
  for (const seed of [1, 7, 42]) {
    const b = randomBars(400, seed);
    for (const n of [14, 20]) {
      const got = atr(b.high, b.low, b.close, n), ref = naiveWilderAtr(b, n);
      for (let i = 0; i < b.high.length; i++) {
        if (ref[i] === null) assert.equal(got[i], null, `seed ${seed} n ${n} i ${i}`);
        else assert.ok(close(got[i], ref[i], 1e-10), `seed ${seed} n ${n} i ${i}: ${got[i]} != ${ref[i]}`);
      }
    }
  }
});

test('ATR SMA = einfaches Mittel der True Range (bisheriges Verhalten unveraendert)', () => {
  const b = randomBars(120, 3);
  const tr = trueRange(b.high, b.low, b.close);
  assert.deepEqual(atr(b.high, b.low, b.close, 20, { method: 'sma' }), sma(tr, 20));
  const i = 80, mean = tr.slice(i - 19, i + 1).reduce((x, y) => x + y, 0) / 20;
  assert.ok(close(atr(b.high, b.low, b.close, 20, { method: 'sma' })[i], mean));
});

test('ATR Wilder: fehlender Balken liefert null, die Rekursion laeuft danach ohne Ersatzwert weiter', () => {
  const v = [1, 2, 3, null, 4, NaN, 5];
  const w = wilder(v, 3);
  assert.equal(w[3], null); assert.equal(w[5], null);
  assert.ok(close(w[4], 8 / 3));          // wie ohne Luecke: (2*2+4)/3
  assert.ok(close(w[6], (8 / 3 * 2 + 5) / 3));
  // Luecke in der Startphase: es zaehlen die ersten n gueltigen Werte.
  const w2 = wilder([1, null, 2, 3, 4], 3);
  assert.equal(w2[2], null); assert.ok(close(w2[3], 2)); assert.ok(close(w2[4], (2 * 2 + 4) / 3));
});

test('Eine Definition: ATR(20, Wilder) = Turtle-N der Live-Engine 2.0.x (Source-faithful: sf-turtle-n-wilder.test.mjs)', () => {
  for (const seed of [11, 12]) {
    const b = randomBars(300, seed);
    const a = atr(b.high, b.low, b.close, 20);
    const e = turtleNEngine(b);
    for (let i = 0; i < 300; i++) {
      if (i < 19) { assert.equal(a[i], null); continue; }
      assert.ok(close(a[i], e[i], 1e-12), `Engine 2.0.x, i ${i}`);
    }
  }
});

test('computeIndicators: atr14 nach Wilder, atr20 festgeschrieben als SMA (einziger Leser: Donchian 1.1.0)', () => {
  const b = randomBars(260, 5), ind = computeIndicators(b);
  assert.deepEqual(ind.atr14, atr(b.high, b.low, b.close, 14, { method: 'wilder' }));
  assert.deepEqual(ind.atr20, atr(b.high, b.low, b.close, 20, { method: 'sma' }));
});

test('Donchian 1.1.0: N (Stop 2N) bleibt das 20-Tage-Mittel der True Range - Ergebnisse reproduzierbar', () => {
  assert.equal(donchian.version, '1.1.0');
  // Seitwaerts mit Tagesspanne ~4 %, liquide (wie r4.test.mjs); an Tag 30 ein Spannen-Schock, der bei
  // t = 59 aus dem 20-Tage-Fenster des SMA gefallen ist, in der Wilder-Glaettung aber nachwirkt.
  const b = { date: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < 61; i++) {
    const c = 100 + 2 * Math.sin(i / 3), w = i === 30 ? 12 : 2;
    b.date.push(new Date(Date.UTC(2025, 0, 6) + i * 86400000).toISOString().slice(0, 10));
    b.open.push(c); b.high.push(c + w); b.low.push(c - w); b.close.push(c); b.volume.push(1e6);
  }
  const ctx = { symbol: 'T', bars: b, ind: computeIndicators(b) };
  const t = 59;
  const r = donchian.scan(ctx, t);
  assert.ok(r, 'Setup erwartet');
  const smaN = atr(b.high, b.low, b.close, 20, { method: 'sma' })[t], wilderN = atr(b.high, b.low, b.close, 20)[t];
  assert.equal(r.levels.n, smaN);
  assert.ok(wilderN > smaN * 1.05, 'der Schock wirkt nur in Wilder nach - der Test unterscheidet die Methoden');
  const plan = donchian.planEntry(ctx, t + 1, r);
  assert.equal(plan.stop, b.open[t + 1] - 2 * smaN);
});
