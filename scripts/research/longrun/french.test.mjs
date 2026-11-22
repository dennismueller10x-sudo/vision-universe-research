// Langfrist-Auswertung: Parser, Kennzahlen und Filter auf erfundenen Daten mit bekanntem Ergebnis. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { unzipFirst, firstMonthlyBlock, metrics, relative, trendFiltered } from './french.mjs';

test('ZIP: erster Eintrag (Deflate) wird gelesen', () => {
  const body = Buffer.from('a,b\n1,2\n'), comp = zlib.deflateRawSync(body), name = Buffer.from('x.csv');
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(comp.length, 18); h.writeUInt16LE(name.length, 26);
  assert.equal(unzipFirst(Buffer.concat([h, name, comp])), 'a,b\n1,2\n');
});

test('CSV: nur der erste Monatsblock, Prozent als Zahl', () => {
  const t = 'Kopf\n\n  Value Weight Returns -- Monthly\n,A,B\n192607,   1.00,  -2.00\n192608,   0.50,  -99.99\n\n  Equal Weight\n,A,B\n192607,9,9\n';
  const b = firstMonthlyBlock(t);
  assert.deepEqual(b.cols, ['A', 'B']); assert.equal(b.rows.length, 2); assert.equal(b.rows[0][1], 1);
});

test('Kennzahlen: 1 % je Monat über 12 Monate = 12,68 % p. a.; Kostenabzug wirkt monatlich', () => {
  const r = Array(12).fill(0.01), rf = Array(12).fill(0), m = Array.from({ length: 12 }, (_, i) => '2000' + String(i + 1).padStart(2, '0'));
  assert.ok(Math.abs(metrics(r, rf, m).cagr - (1.01 ** 12 - 1)) < 1e-12);
  assert.ok(Math.abs(metrics(r, rf, m, 0, 11, 0.12).cagr) < 1e-12);
});

test('Relativ: immer vorn -> 100 % der Fenster, keine Durststrecke', () => {
  const r = Array(60).fill(0.02), b = Array(60).fill(0.01), m = Array.from({ length: 60 }, (_, i) => String(200001 + i));
  const x = relative(r, b, m, 12); assert.equal(x.winShare, 1); assert.equal(x.longestBehindMonths, 0);
});

test('Filter: unter dem 10-Monats-Schnitt in Geldmarkt, Entscheidung nur aus Vormonaten', () => {
  const up = Array(12).fill(0.01), down = Array(6).fill(-0.05), sig = [...up, ...down], rf = sig.map(() => 0.001);
  const f = trendFiltered(sig, sig, rf);
  assert.equal(f.r[10], 0.01); // nach 10 Monaten Aufwärtstrend investiert
  assert.equal(f.r[12], -0.05); // erster Verlustmonat noch investiert (Signal vom Vormonat), trägt den Verlust
  assert.equal(f.r[17], 0.001); // nach mehreren Verlustmonaten im Geldmarkt
});
