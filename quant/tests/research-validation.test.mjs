import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const V = require('../engines/research-validation.cjs');
const date = n => new Date(Date.UTC(2020, 0, 1 + n)).toISOString().slice(0, 10);
const calendar = Array.from({ length: 80 }, (_, i) => date(i));
const config = extra => ({ calendar, trainSize: 10, validationSize: 5, testSize: 5, mode: 'ROLLING', asOf: date(79), ...extra });
const event = (n, extra = {}) => ({ id: 'E' + n, informationStart: date(n), decisionAt: date(n), availableAt: date(n), outcomeEnd: date(n + 1), outcomeAvailableAt: date(n + 1), ...extra });
const events = Array.from({ length: 20 }, (_, i) => event(i * 4));
const holdout = extra => ({ id: 'H1', ruleHash: 'rule-v1', methodHash: 'method-v1', universeHash: 'universe-v1', dataDefinitionHash: 'data-v1', primaryEndpoint: 'net-excess', parameters: { weeks: 52 }, from: date(20), to: date(30), registeredAt: date(10), alpha: 0.05, minimumEffect: 0.005, ...extra });
const consume = extra => ({ universeHash: 'universe-v1', dataDefinitionHash: 'data-v1', primaryEndpoint: 'net-excess', datasetHash: 'dataset-v1', outcomeSetHash: 'outcomes-v1', ruleHash: 'rule-v1', methodHash: 'method-v1', parameters: { weeks: 52 }, asOf: date(35), observedAt: date(36), outcomesComplete: true, ...extra });
const sensitivity = extra => V.registerSensitivity({ id: 'S1', ruleHash: 'r', datasetHash: 'd', evaluatorHash: 'e', primaryEndpoint: 'net-return', registeredAt: date(0), purpose: 'EXPLORATORY_ROBUSTNESS', alpha: 0.05, dimensions: { feeBps: [0, 10], slippageBps: [0, 5], entryDelay: [0, 1], holdingPeriods: [13, 26] }, baseline: { feeBps: 0, slippageBps: 0, entryDelay: 0, holdingPeriods: 13 }, ...extra });
const context = { ruleHash: 'r', datasetHash: 'd', evaluatorHash: 'e', executedAt: date(1), holdout: false };
function executionFixture(partition = V.buildWalkForward(config(), events)) {
  const observations = events.map(e => ({ id: e.id, feature: Number(e.id.slice(1)), outcome: Number(e.id.slice(1)) / 1000 }));
  const trace = [];
  const callbacks = {
    executedAt: date(79),
    fit(rows, ctx) { trace.push({ role: 'train', foldId: ctx.foldId, ids: rows.map(r => r.id) }); assert.ok(Object.isFrozen(rows) && Object.isFrozen(rows[0])); return { mean: rows.reduce((s, r) => s + r.outcome, 0) / rows.length }; },
    select(model, rows, ctx) { trace.push({ role: 'validation', foldId: ctx.foldId, ids: rows.map(r => r.id) }); assert.ok(Object.isFrozen(model) && Object.isFrozen(rows)); return { direction: rows.reduce((s, r) => s + r.outcome, 0) / rows.length >= model.mean ? 1 : -1, baseline: model.mean }; },
    evaluate(model, rows, ctx) { trace.push({ role: 'test', foldId: ctx.foldId, ids: rows.map(r => r.id) }); assert.ok(Object.isFrozen(model) && Object.isFrozen(rows)); assert.equal(ctx.aggregate, undefined); return rows.map(r => ({ id: r.id, value: model.direction * (r.outcome - model.baseline) })); }
  };
  callbacks.fitHash = V.hash(callbacks.fit.toString()); callbacks.selectionRuleHash = V.hash(callbacks.select.toString()); callbacks.evaluatorHash = V.hash(callbacks.evaluate.toString());
  const registration = V.registerWalkForwardExecution({ id: 'WF1', partitionHash: partition.resultHash, dataHash: V.hash(observations), fitHash: callbacks.fitHash, selectionRuleHash: callbacks.selectionRuleHash, evaluatorHash: callbacks.evaluatorHash, primaryEndpoint: 'fixture-excess', registeredAt: date(0), purpose: 'DEVELOPMENTAL_WALK_FORWARD' });
  return { partition, observations, callbacks, registration, trace };
}

test('rolling/expanding folds use chronologically separate decisions and complete, non-overlapping test windows', () => {
  const rolling = V.buildWalkForward(config(), events), expanding = V.buildWalkForward(config({ mode: 'EXPANDING' }), events);
  assert.equal(rolling.folds.length, 13);
  assert.deepEqual(rolling.folds[0].train, ['E0', 'E4', 'E8']);
  assert.deepEqual(rolling.folds[0].validation, ['E12']);
  assert.deepEqual(rolling.folds[0].test, ['E16']);
  assert.ok(expanding.folds.at(-1).train.length > rolling.folds.at(-1).train.length);
  const ids = rolling.folds.flatMap(f => f.test);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(rolling.productionApproved, false);
  assert.deepEqual(V.buildWalkForward(config(), events), rolling);
  assert.throws(() => V.buildWalkForward(config({ stepSize: 4 }), events), /INTEGER_OUT_OF_RANGE/);
});

test('purge uses declared information/outcome intersections, embargo uses label availability', () => {
  const sample = [event(8), event(10, { informationStart: date(7) }), event(16)];
  const r = V.buildWalkForward(config(), sample);
  assert.equal(r.folds[0].train.length, 0);
  assert.ok(r.folds[0].excluded.some(e => e.id === 'E8' && e.reason === 'PURGED_INFORMATION_OUTCOME_OVERLAP'));
  const e = V.buildWalkForward(config({ embargoDays: 1 }), [event(8), event(12), event(16)]);
  assert.ok(e.folds[0].excluded.some(x => x.id === 'E8' && x.reason === 'EMBARGO'));
});

test('future inputs, unknown outcomes, and delayed labels never enter a fitting/evaluation set', () => {
  const r = V.buildWalkForward(config({ asOf: date(19) }), [event(4, { outcomeAvailableAt: date(11) }), event(8, { outcomeAvailableAt: null }), event(12, { availableAt: date(13) }), event(18, { outcomeEnd: date(21), outcomeAvailableAt: date(21) })]);
  assert.equal(r.folds.length, 1);
  assert.deepEqual(r.folds[0].train, []); assert.deepEqual(r.folds[0].validation, []); assert.deepEqual(r.folds[0].test, []);
  assert.deepEqual(r.folds[0].excluded.map(x => x.reason), ['OUTCOME_NOT_MATURE_AT_CUTOFF', 'OUTCOME_UNKNOWN', 'INPUT_NOT_AVAILABLE_AT_DECISION', 'OUTCOME_NOT_MATURE_AT_CUTOFF']);
});

test('appending or corrupting future events does not alter prior fold membership', () => {
  const a = V.buildWalkForward(config({ asOf: date(24) }), events.filter(e => e.decisionAt <= date(24)));
  const b = V.buildWalkForward(config({ asOf: date(24) }), [...events.filter(e => e.decisionAt <= date(24)), event(60, { informationStart: date(0) })]);
  assert.deepEqual(a.folds, b.folds);
});

test('OOS aggregation accepts each matured test event once, with no train observations or fabricated substitutes', () => {
  const p = V.buildWalkForward(config(), events);
  const rows = p.folds.flatMap(f => f.test.map(id => ({ id, value: Number(id.slice(1)) / 1000 })));
  const a = V.aggregateOos(p, rows);
  assert.equal(a.n, rows.length); assert.equal(a.mean, rows.reduce((s, r) => s + r.value, 0) / rows.length);
  assert.throws(() => V.aggregateOos(p, rows.slice(1)), /MISSING_OOS/);
  assert.throws(() => V.aggregateOos(p, [...rows, { id: 'E0', value: 0 }]), /NON_TEST/);
  assert.throws(() => V.aggregateOos(p, [...rows, rows[0]]), /DUPLICATE_OBSERVATION/);
  assert.throws(() => V.aggregateOos({ ...p, folds: [] }, rows), /PARTITION_HASH/);
});

test('walk-forward rejects invalid chronology, repeated IDs, impossible timestamps and excessive work', () => {
  assert.throws(() => V.buildWalkForward(config({ calendar: [...calendar].reverse() }), events), /ORDERED/);
  assert.throws(() => V.buildWalkForward(config(), [event(0), event(0)]), /DUPLICATE_EVENT/);
  assert.throws(() => V.buildWalkForward(config(), [event(0, { informationStart: date(1) })]), /INTERVAL/);
  assert.throws(() => V.buildWalkForward(config({ asOf: '2020-02-30' }), events), /INVALID_TIME/);
  assert.throws(() => V.buildWalkForward(config({ operationBudget: 1 }), events), /BUDGET/);
  assert.throws(() => V.buildWalkForward(config({ operationBudget: Infinity }), events), /INTEGER/);
  assert.throws(() => V.buildWalkForward(config({ asOf: date(10) }), events), /INSUFFICIENT_CALENDAR/);
});

test('registered walk-forward executes fit/selection/evaluation only on allowed immutable fold data', () => {
  const f = executionFixture(), before = JSON.stringify(f.observations);
  const r = V.runWalkForward(f.partition, f.observations, f.registration, f.callbacks);
  for (const fold of f.partition.folds) for (const role of ['train', 'validation', 'test']) {
    assert.deepEqual(f.trace.find(t => t.foldId === fold.id && t.role === role).ids, fold[role]);
  }
  assert.equal(JSON.stringify(f.observations), before);
  assert.equal(r.aggregate.n, f.partition.folds.reduce((n, fold) => n + fold.test.length, 0));
  assert.deepEqual(r, V.runWalkForward(f.partition, f.observations, f.registration, f.callbacks));
  assert.equal(r.productionApproved, false);
});

test('walk-forward execution rejects changed callbacks/data, duplicate test IDs before callbacks, and immature-only fitting', () => {
  const f = executionFixture();
  assert.throws(() => V.runWalkForward(f.partition, [...f.observations, { id: 'extra' }], f.registration, f.callbacks), /INPUT_CHANGED/);
  assert.throws(() => V.runWalkForward(f.partition, f.observations, f.registration, { ...f.callbacks, select() { return {}; } }), /SOURCE_HASH_MISMATCH/);
  assert.throws(() => V.runWalkForward(f.partition, f.observations, f.registration, { ...f.callbacks, executedAt: '2019-01-01' }), /PRECEDES_REGISTRATION/);
  const tampered = JSON.parse(JSON.stringify(f.partition)); tampered.folds[1].test.push(tampered.folds[0].test[0]);
  delete tampered.resultHash; tampered.resultHash = V.hash(tampered);
  const doubled = executionFixture(tampered);
  assert.throws(() => V.runWalkForward(doubled.partition, doubled.observations, doubled.registration, doubled.callbacks), /DUPLICATE_OOS_EVENT/);
  assert.equal(doubled.trace.length, 0);
  const immature = V.buildWalkForward(config({ asOf: date(19) }), [event(0, { outcomeAvailableAt: date(20) }), event(12), event(16)]);
  const g = executionFixture(immature);
  assert.throws(() => V.runWalkForward(g.partition, g.observations, g.registration, g.callbacks), /INSUFFICIENT_FOLD_DATA/);
});

test('holdout registration excludes previously viewed development, including other rules and vendors', () => {
  const ledger = V.appendExposure(V.createExposureLedger(), { id: 'exploration', ruleHash: 'other-rule', purpose: 'DEVELOPMENT', from: date(0), to: date(25), observedAt: date(25) });
  assert.throws(() => V.registerHoldout(holdout(), ledger), /ALREADY_EXPOSED/);
  assert.equal(V.registerHoldout(holdout({ from: date(26), registeredAt: date(25) }), ledger).evidenceStatus, 'DECLARED_UNEXPOSED_NOT_INDEPENDENTLY_VERIFIED');
});

test('holdout is version pinned and single-use along its ledger lineage; declaration is not proof of secrecy', () => {
  const ledger = V.createExposureLedger(), registration = V.registerHoldout(holdout(), ledger);
  assert.throws(() => V.consumeHoldout(registration, ledger, consume({ parameters: { weeks: 48 } })), /METHOD_CHANGED/);
  assert.throws(() => V.consumeHoldout(registration, ledger, consume({ asOf: date(29) })), /NOT_MATURE/);
  assert.throws(() => V.consumeHoldout(registration, ledger, consume({ outcomesComplete: false })), /INCOMPLETE/);
  assert.throws(() => V.consumeHoldout(registration, ledger, consume({ universeHash: 'changed' })), /METHOD_CHANGED/);
  assert.throws(() => V.consumeHoldout(registration, ledger, consume({ dataDefinitionHash: 'changed' })), /METHOD_CHANGED/);
  const used = V.consumeHoldout(registration, ledger, consume());
  assert.equal(V.verifyExposureLedger(used.ledger), true);
  assert.throws(() => V.consumeHoldout(registration, used.ledger, consume()), /ALREADY_EXPOSED/);
  assert.equal(used.receipt.evidenceStatus, 'CONSUMED_REQUIRES_INDEPENDENT_AUDIT');
  assert.equal(used.receipt.productionApproved, false);
  assert.equal(ledger.entries.length, 0);
});

test('exposure ledger detects tampering, branch replacement and chronology reversal', () => {
  const a = V.appendExposure(V.createExposureLedger(), { id: 'first', ruleHash: 'r', purpose: 'EXPLORATION', from: date(0), to: date(5), observedAt: date(6) });
  const registration = V.registerHoldout(holdout(), a);
  assert.throws(() => V.consumeHoldout(registration, V.createExposureLedger(), consume()), /NOT_ANCESTOR/);
  const altered = JSON.parse(JSON.stringify(a)); altered.entries[0].to = date(4);
  assert.throws(() => V.verifyExposureLedger(altered), /HASH_MISMATCH/);
  assert.throws(() => V.appendExposure(a, { id: 'second', ruleHash: 'r', purpose: 'EXPLORATION', from: date(0), to: date(4), observedAt: date(5) }), /NONCHRONOLOGICAL/);
});

test('Holm adjustment matches analytic examples and preserves input order', () => {
  assert.deepEqual(V.holm([0.01, 0.04, 0.03, 0.002]), [0.03, 0.06, 0.06, 0.008]);
  assert.deepEqual(V.holm([1, 0, 0.01]), [1, 0, 0.02]);
  assert.throws(() => V.holm([NaN]), /INVALID_P_VALUE/);
});

test('registered sensitivity evaluates the complete predeclared grid and local neighbors without choosing a winner', () => {
  const seen = [];
  const evaluator = p => { seen.push(p); return { estimate: 0.1 - p.feeBps / 10000 - p.slippageBps / 10000 - p.entryDelay / 100, pValue: 0.001, n: 50, ci: [-0.1, 0.3], inferenceMethod: 'FIXTURE_ONLY', clusters: 10, effectiveN: 20 }; };
  const evaluatorHash = V.hash(evaluator.toString()), r = sensitivity({ evaluatorHash });
  const result = V.runSensitivity(r, evaluator, { ...context, evaluatorHash });
  assert.equal(seen.length, 16); assert.equal(result.rows.length, 16);
  assert.ok(result.rows.every(x => x.adjustedPValue === 0.016));
  assert.equal(result.neighborhood.count, 4); assert.equal(result.neighborhood.sameDirection, true);
  assert.equal(result.bestParameters, undefined);
  assert.equal(result.status, 'MECHANICS_ONLY_NOT_CERTIFIED');
  assert.equal(result.intervalMultiplicity, 'NOMINAL_EVALUATOR_DEFINED_NOT_SIMULTANEOUS');
  assert.ok(Object.isFrozen(seen[0]));
});

test('sensitivity rejects holdout tuning, changed data/methods, undeclared grids and invalid evaluator outputs', () => {
  const evaluate = () => ({ estimate: -0.1, pValue: 0.5, n: 10, ci: [-0.2, 0.1], inferenceMethod: 'FIXTURE_ONLY', clusters: 5, effectiveN: 5 });
  const evaluatorHash = V.hash(evaluate.toString()), r = sensitivity({ evaluatorHash }), ctx = { ...context, evaluatorHash };
  assert.throws(() => V.runSensitivity(r, evaluate, { ...ctx, holdout: true }), /HOLDOUT_TUNING/);
  assert.throws(() => V.runSensitivity(r, evaluate, { ...ctx, datasetHash: 'changed' }), /CONTEXT_CHANGED/);
  assert.throws(() => sensitivity({ purpose: 'CONFIRMATORY_HOLDOUT' }), /CANNOT_SELECT/);
  assert.throws(() => sensitivity({ baseline: { weeks: 52 } }), /BASELINE_NOT_ON_GRID/);
  assert.throws(() => sensitivity({ dimensions: { feeBps: [10, 0] } }), /NOT_STRICTLY_ORDERED/);
  assert.throws(() => V.runSensitivity(r, () => ({ estimate: 0, pValue: 2, n: 10 }), ctx), /SOURCE_CHANGED/);
  const invalid = () => ({ estimate: 0, pValue: 2, n: 10 }), badHash = V.hash(invalid.toString());
  assert.throws(() => V.runSensitivity(sensitivity({ evaluatorHash: badHash }), invalid, { ...context, evaluatorHash: badHash }), /INVALID_SENSITIVITY/);
});

test('private persistent registry enforces latest state, single consumption, locking and disk integrity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vu-holdout-test-'));
  try {
    const store = V.openHoldoutStore(dir), original = store.read();
    const registration = store.register(holdout(), original.resultHash);
    assert.throws(() => store.register(holdout({ id: 'H2' }), original.resultHash), /STATE_CHANGED/);
    assert.throws(() => store.consume('H1', consume(), original.resultHash), /STATE_CHANGED/);
    const openedAgain = V.openHoldoutStore(dir);
    const consumed = openedAgain.consume('H1', consume(), registration.stateHash);
    assert.equal(consumed.result.datasetHash, 'dataset-v1');
    assert.throws(() => store.consume('H1', consume(), consumed.stateHash), /ALREADY_EXPOSED/);
    fs.mkdirSync(path.join(dir, '.writer-lock'));
    assert.throws(() => store.register(holdout({ id: 'H2' }), consumed.stateHash), /WRITER_LOCKED/);
    fs.rmdirSync(path.join(dir, '.writer-lock'));
    const file = path.join(dir, 'holdout-registry.json');
    const mutated = JSON.parse(fs.readFileSync(file, 'utf8')); mutated.generation++;
    fs.writeFileSync(file, JSON.stringify(mutated), { mode: 0o600 });
    assert.throws(() => store.read(), /STORE_HASH_MISMATCH/);
    assert.equal(store.read === undefined, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('holdout store rejects repository directories and non-private storage', () => {
  assert.throws(() => V.openHoldoutStore(new URL('../../', import.meta.url).pathname), /OUTSIDE_REPOSITORY/);
  assert.throws(() => V.openHoldoutStore('relative'), /ABSOLUTE_PRIVATE/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vu-holdout-permission-test-'));
  try {
    fs.chmodSync(dir, 0o755);
    assert.throws(() => V.openHoldoutStore(dir), /PRIVATE_DIRECTORY_REQUIRED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('independent Python partition/Holm/sensitivity arithmetic reference', () => {
  const script = new URL('../../scripts/quant/verify-research-validation.py', import.meta.url);
  const p = V.buildWalkForward(config(), events);
  const rows = p.folds.flatMap(f => f.test.map(id => ({ id, value: Number(id.slice(1)) / 1000 })));
  const evaluator = q => ({ estimate: (q.holdingPeriods / 100) - q.feeBps / 10000 - q.slippageBps / 10000 - q.entryDelay / 100, pValue: 0.001 * (q.entryDelay + 1), n: 50, ci: [-0.1, 0.3], inferenceMethod: 'FIXTURE_ONLY', clusters: 10, effectiveN: 20 });
  const evaluatorHash = V.hash(evaluator.toString());
  const s = V.runSensitivity(sensitivity({ evaluatorHash }), evaluator, { ...context, evaluatorHash });
  const input = { config: config(), events, partition: p, aggregate: V.aggregateOos(p, rows), sensitivity: s, holm: { raw: [0.01, 0.04, 0.03, 0.002], adjusted: V.holm([0.01, 0.04, 0.03, 0.002]) } };
  const f = executionFixture(p);
  input.execution = V.runWalkForward(p, f.observations, f.registration, f.callbacks);
  input.observations = f.observations;
  const run = spawnSync('python3', [script.pathname], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /PASS/);
});
