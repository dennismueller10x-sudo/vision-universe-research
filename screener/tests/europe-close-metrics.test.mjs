// Europa-Spalten des Screeners: Regeln aus screener/europe-close-metrics.js an synthetischen Reihen
// und der Erzeuger products/screener/producer/build-europe.mjs an den veröffentlichten Europa-Daten (nur --out in tmp).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEurope, SCHEMA } from '../../products/screener/producer/build-europe.mjs';

const require = createRequire(import.meta.url);
const M = require('../europe-close-metrics.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const days = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10));

test('lückenlose Reihe: alle Spalten exakt aus den Schlüssen, nichts geschätzt', () => {
  const d = days(300), pts = d.map((x, i) => [x, 100 + i * 0.1]);
  const r = M.compute(pts, d).values;
  const c = (k) => 100 + (299 - k) * 0.1;
  assert.equal(r.price, c(0));
  assert.equal(r.r1m, Math.round((c(0) / c(21) - 1) * 10000) / 100);
  assert.equal(r.r1y, Math.round((c(0) / c(252) - 1) * 10000) / 100);
  assert.equal(r.fromHigh52w, 0);
  const sma = d.slice(-50).map((_, i) => c(i)).reduce((a, b) => a + b) / 50;
  assert.equal(r.vsSma50, Math.round((c(0) / sma - 1) * 10000) / 100);
  assert.equal(r.coverage1y, 100);
});

test('Lücken: fehlender Anfangstag oder unter 90 % Abdeckung lässt das Feld leer; Lücken werden nicht aufgefüllt', () => {
  const d = days(300);
  const missStart = d.map((x, i) => [x, 50]).filter(([x]) => x !== d[d.length - 1 - 21]);
  const a = M.compute(missStart, d);
  assert.equal(a.values.r1m, null); assert.equal(a.reasons.r1m, 'NO_CLOSE_AT_WINDOW_START');
  assert.equal(a.values.r3m, 0);
  const sparse = d.map((x, i) => [x, 50]).filter((_, i) => i % 5 !== 0 || i === 299 || i === 299 - 63);
  const b = M.compute(sparse, d);
  assert.equal(b.values.r3m, null); assert.equal(b.reasons.r3m, 'WINDOW_COVERAGE_BELOW_90');
  assert.equal(b.values.vsSma50, null);
  const noLast = M.compute(d.slice(0, -1).map((x) => [x, 50]), d);
  assert.equal(noLast.values.price, null); assert.equal(noLast.values.r1m, null);
});

test('50-Tage-Linie: 45 von 50 Tagen reichen, 44 nicht; Mittel nur über vorhandene Schlüsse', () => {
  const d = days(120);
  const drop = (k) => d.map((x, i) => [x, i >= 70 ? 10 + (i % 3) : 10]).filter((_, i) => !(i >= 71 && i < 71 + k));
  const ok = M.compute(drop(5), d), no = M.compute(drop(6), d);
  assert.notEqual(ok.values.vsSma50, null);
  assert.equal(no.values.vsSma50, null);
});

test('Sprung über 40 % zwischen zwei Schlüssen (möglicher Split, unbereinigt) macht den Wert leer', () => {
  const d = days(300), pts = d.map((x, i) => [x, i < 290 ? 100 : 50]);
  const r = M.compute(pts, d);
  assert.equal(r.values.r1m, null); assert.equal(r.reasons.r1m, 'POSSIBLE_CORPORATE_ACTION');
  assert.equal(r.values.fromHigh52w, null); assert.equal(r.values.vsSma50, null);
});

test('Erzeuger: nur freigegebene Aktien, Identität und Währung aus dem Katalog, nur in --out', async () => {
  const out = mkdtempSync(join(tmpdir(), 'vu-sc-eu-'));
  try {
    const r = await writeEurope({ root: ROOT, out, log: () => {} });
    const data = JSON.parse(readFileSync(join(out, 'universe-EUROPE.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(ROOT, 'discover/data/europe/manifest.json'), 'utf8'));
    const blocked = new Set((manifest.publication?.blocked || []).map((b) => b.securityId));
    assert.equal(data.schema, SCHEMA); assert.equal(data.count, r.count); assert.ok(data.count > 300, String(data.count));
    assert.equal(data.rows.some((x) => blocked.has(x.securityId)), false);
    const ids = new Set(); for (const x of data.rows) { assert.equal(ids.has(x.securityId), false); ids.add(x.securityId); assert.match(x.href, /^\/discover\/#\/s\/EUROPE\/ref_/); assert.ok(x.price > 0); }
    assert.ok(data.rows.filter((x) => x.country === 'DE').length > 200);
    assert.ok(data.coverage.r1m > data.count * 0.9, JSON.stringify(data.coverage));
    assert.equal(data.basis, 'RAW_UNADJUSTED');
  } finally { rmSync(out, { recursive: true, force: true }); }
});
