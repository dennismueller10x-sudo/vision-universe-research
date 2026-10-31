// Spec-Builder der internen Vorschau (scripts/quant/research/backtest-spec-builder.cjs): Auswahl -> gepruefte Runner-Spec.
// Rein: liest nur die registrierten Vorlagen, fuehrt nichts aus, schreibt nichts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../../scripts/quant/research/backtest-spec-builder.cjs');
const R = require('../../scripts/quant/research/backtest-runner.cjs');
const T = B.loadTemplates();
const sel = (o) => ({ schemaVersion: B.SCHEMA, ...o });

test('Menue: alle sechs Arten, 16 Vorlagen, Werte aus den Code-Konstanten', () => {
  const m = B.menu(T);
  assert.equal(m.kinds.length, 6); assert.equal(m.templates.length, 16);
  assert.deepEqual(m.signalRules, ['MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH']);
  assert.ok(m.factorIds.includes('momentum') && m.factorIds.includes('composite'));
  assert.ok(m.methodsByKind.STRATEGY_BACKTEST.includes('PORTFOLIO_REBALANCING') && !m.methodsByKind.STRATEGY_BACKTEST.includes('WALK_FORWARD'));
  assert.deepEqual(Object.keys(m.costPresets), ['NONE', 'STANDARD', 'HIGH']);
});

test('gueltige Auswahl ergibt eine vom Runner akzeptierte Spec, deterministisch, ohne Zertifizierungsanforderung', () => {
  const a = B.buildSpec(sel({ template: 'signal-2022-bear', window: { from: '2022-01-01', to: '2022-06-30' }, costPreset: 'HIGH', ruleIds: ['TREND_DOWN'] }), T);
  assert.equal(a.ok, true); assert.equal(R.validateSpec(a.spec), true);
  assert.deepEqual(a.spec.costs, { feeBps: 20, slippageBps: 20 }); assert.deepEqual(a.spec.engine.ruleIds, ['TREND_DOWN']);
  assert.equal(a.spec.status, undefined);
  const b = B.buildSpec(sel({ template: 'signal-2022-bear', window: { from: '2022-01-01', to: '2022-06-30' }, costPreset: 'HIGH', ruleIds: ['TREND_DOWN'] }), T);
  assert.equal(a.specHash, b.specHash); assert.equal(a.spec.id, b.spec.id);
  const f = B.buildSpec(sel({ template: 'factor-momentum-v10-panel', factorId: 'value', methods: 'NONE' }), T);
  assert.equal(f.ok, true); assert.equal(f.spec.engine.factorId, 'value'); assert.equal(f.spec.methods, undefined);
  assert.deepEqual(f.spec.population.privateInputs, ['factorPanel'], 'private Eingaben bleiben ausgewiesen');
});

test('fail closed mit sicheren Codes', () => {
  const code = (s) => B.buildSpec(s, T).code;
  assert.equal(code({ template: 'signal-2022-bear' }), 'SELECTION_SCHEMA_UNKNOWN');
  assert.equal(code(sel({ template: 'x' })), 'UNKNOWN_TEMPLATE');
  assert.equal(code(sel({ template: 'signal-2022-bear', status: { requestProductCertifiedState: true } })), 'SELECTION_UNKNOWN_KEY');
  assert.equal(code(sel({ template: 'signal-2022-bear', window: { from: '2022-01-01', to: '2026-01-01' } })), 'WINDOW_INVALID', 'nicht nach dem Datenstand der Vorlage');
  assert.equal(code(sel({ template: 'signal-2022-bear', window: { from: '2022-07-01', to: '2022-01-01' } })), 'WINDOW_INVALID');
  assert.equal(code(sel({ template: 'signal-2022-bear', costPreset: 'ZERO' })), 'COST_PRESET_UNKNOWN');
  assert.equal(code(sel({ template: 'signal-2022-bear', benchmark: 'QQQ' })), 'BENCHMARK_UNKNOWN');
  assert.equal(code(sel({ template: 'signal-2022-bear', ruleIds: ['MAGIC'] })), 'RULE_NOT_ALLOWED');
  assert.equal(code(sel({ template: 'signal-2008-crash', ruleIds: ['MOMENTUM_IMPROVED'] })), 'RULE_NOT_ALLOWED', 'finanzierte Regel muss enthalten bleiben');
  assert.equal(code(sel({ template: 'strategy-2019-bull', ruleIds: ['TREND_UP'] })), 'RULES_ONLY_FOR_SIGNAL');
  assert.equal(code(sel({ template: 'signal-2022-bear', factorId: 'value' })), 'FACTOR_ONLY_FOR_FACTOR_KIND');
  assert.equal(code(sel({ template: 'factor-momentum-v10-panel', factorId: 'alpha' })), 'FACTOR_NOT_ALLOWED');
  assert.equal(code(sel({ template: 'signal-2022-bear', methods: 'ALL' })), 'METHODS_OPTION_UNKNOWN');
  assert.equal(code(sel({ template: 'strategy-2019-bull', costPreset: 'HIGH' })), 'SENSITIVITY_GRID_EXCLUDES_SELECTED_COSTS', 'Basis muss auf dem Sensitivitaetsraster liegen');
  assert.equal(B.buildSpec(sel({ template: 'strategy-2019-bull', costPreset: 'HIGH', methods: 'NONE' }), T).ok, true);
  assert.equal(B.buildSpec(sel({ template: 'strategy-2019-bull', costPreset: 'NONE' }), T).ok, true, 'feeBps 0 liegt auf dem Raster');
  for (const c of B.SAFE_CODES) assert.ok(/^[A-Z_]+$/.test(c));
});
