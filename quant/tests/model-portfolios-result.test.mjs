// Vertrag des committeten Ergebnisses docs/quant/research/portfolio-v1/model-portfolios.json (falls vorhanden):
// Kennzeichnung, Standard, Vollständigkeit der Kennzahlen, keine Kursreihen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'docs/quant/research/portfolio-v1/model-portfolios.json');

test('Musterportfolios: Kennzeichnung, Standard, Kennzahlen, keine Kurse', { skip: !fs.existsSync(FILE) && 'noch kein Ergebnis committet' }, () => {
  const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(doc.certification, 'NOT_CERTIFIED');
  assert.equal(doc.label, 'Forschung, nicht zertifiziert');
  assert.equal(doc.productionApproved, false);
  assert.equal(doc.publiclyActivated, false);
  assert.equal(doc.standard.maxPositionWeight, 0.08);
  assert.equal(doc.standard.maxSectorWeight, 0.25);
  assert.ok(doc.results.length >= 3 && doc.results.length <= 7);
  assert.ok(Array.isArray(doc.openLimits) && doc.openLimits.includes('KEINE_HISTORISCHE_INDEXMITGLIEDSCHAFT'));
  for (const r of doc.results) {
    assert.equal(r.label, 'Forschung, nicht zertifiziert');
    if (r.state !== 'RUN') continue;
    for (const k of ['cagr', 'benchmarkCagr', 'annualizedVolatility', 'maxDrawdown', 'beta']) assert.ok(Number.isFinite(r.metrics[k]), r.profileId + ' ' + k);
    assert.ok(r.construction.averagePositions >= 15 && r.construction.averagePositions <= 30);
    assert.ok(r.lastHoldings.every(h => h.weight <= 0.08 + 1e-9));
    // Wertentwicklung: [Datum, Portfoliowert, Benchmarkwert], keine Einzeltitelkurse.
    assert.ok(r.equity.every(e => e.length === 3 && typeof e[0] === 'string'));
  }
  const text = JSON.stringify(doc);
  assert.equal(/"(adj|raw|close|bars|points)"\s*:/.test(text), false, 'keine Kursfelder im Ergebnis');
});
