// Supertrader-ATR auf Wilder (docs/SUPERTRADER_ATR_WILDER.md): Das Turtle-N der Source-faithful-Methode
// ist dieselbe Wilder-ATR wie engine/indicators.mjs#atr(…, 20). Eigene Datei, weil nur sf-*-Tests den
// Source-faithful-Baum lesen duerfen (SF2-LEGACY-ISOLATION).
import test from 'node:test';
import assert from 'node:assert/strict';
import { atr } from '../engine/indicators.mjs';
import { turtleN } from '../source-faithful/methods/turtle.mjs';

test('GC-TUR-N-WILDER: SF-Turtle-N = Plattform-ATR(20, Wilder) auf 2 x 300 Zufallsbalken', () => {
  for (const seed of [11, 12]) {
    let s = seed >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const bars = [];
    let c = 100;
    for (let i = 0; i < 300; i++) {
      const o = c * (1 + (r() - 0.5) * 0.04 + (r() < 0.03 ? (r() - 0.3) * 0.2 : 0)), nc = o * (1 + (r() - 0.5) * 0.05);
      bars.push({ date: new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10), open: o, high: Math.max(o, nc) * (1 + r() * 0.02), low: Math.min(o, nc) * (1 - r() * 0.02), close: nc, volume: 1e6 });
      c = nc;
    }
    const a = atr(bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close), 20), n = turtleN(bars);
    for (let i = 19; i < 300; i++) assert.ok(Math.abs(a[i] - n[i]) <= 1e-12 * n[i], `seed ${seed} i ${i}: ${a[i]} != ${n[i]}`);
    assert.equal(a[18], null);
  }
});
