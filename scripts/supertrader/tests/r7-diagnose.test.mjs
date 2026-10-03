// Runde 7: Bausteine der Ursachenanalyse (rein, ohne Netz).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spyWindow, signalQuality, exposureScenarios, theoreticalMaxExposure } from '../validation/diagnose-methods.mjs';

const spyTR = [{ date: '2020-01-02', value: 100 }, { date: '2020-01-03', value: 101 }, { date: '2020-01-06', value: 102 }, { date: '2020-01-07', value: 99 }];
const spyIdx = new Map(spyTR.map((p, i) => [p.date, i]));

test('D-1 SPY-Fenster: vom Schluss vor dem Einstieg bis zum Ausstiegstag', () => {
  assert.equal(spyWindow(spyIdx, spyTR, '2020-01-03', '2020-01-06'), 102 / 100 - 1);
  assert.equal(spyWindow(spyIdx, spyTR, '2020-01-03', '2099-01-01'), null);
});

test('D-2 Signalqualität: Überrendite je Trade gegen SPY im selben Zeitraum, R-Vielfache, Gap gegenüber Trigger', () => {
  const t = { id: 'a', entry: { date: '2020-01-03', price: 10 * 1.001 }, initialStop: 9, trigger: 9.8, rawOpenEntry: 10, exits: [{ date: '2020-01-06', price: 11, fraction: 1, ruleId: 'X-EXIT', basis: 'NEXT_OPEN' }], terminal: null, heldSessions: 1 };
  const q = signalQuality([t], spyIdx, spyTR);
  assert.equal(q.trades, 1);
  assert.ok(q.ret.mean > 0.09 && q.ret.mean < 0.1);
  assert.ok(Math.abs(q.excessVsSpySameWindow.mean - (q.ret.mean - 0.02)) < 1e-12);
  assert.ok(Math.abs(q.entryGapVsTrigger.mean - (10 / 9.8 - 1)) < 1e-9);
  assert.ok(q.rMultiple.mean > 0.9 && q.rMultiple.mean < 1.0);
});

test('D-3 Investitionsquote: SPY mit gleicher Quote und Strategie + Cash in SPY', () => {
  const eq = [{ date: '2020-01-02', equity: 100, exposure: 0 }, { date: '2020-01-03', equity: 100, exposure: 0.5 }, { date: '2020-01-06', equity: 100, exposure: 0.5 }, { date: '2020-01-07', equity: 100, exposure: 0 }];
  const s = exposureScenarios(eq, spyIdx, spyTR);
  assert.equal(s.meanExposure, 0.25);
  assert.equal(s.daysBelow5pct, 0.5);
  assert.ok(Number.isFinite(s.spyExposureMatched.cagr));
});

test('D-4 Theoretische Höchstquote bei 0,5 % Risiko und 10 Positionen', () => {
  const tr = [{ entry: { price: 100 }, initialStop: 90 }, { entry: { price: 100 }, initialStop: 90 }];
  const m = theoreticalMaxExposure(tr);
  assert.equal(m.medianStopDistance, 0.1);
  assert.ok(Math.abs(m.positionPctAtMedianStop - 0.05) < 1e-12);
  assert.ok(Math.abs(m.maxExposureAtMedianStop - 0.5) < 1e-12);
});
