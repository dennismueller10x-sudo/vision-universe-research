'use strict';

// Research mechanics only. This module neither certifies a study nor authorizes production.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const VERSION = 'research-validation-1.0.0';
const DAY = 86400000;
function fail(message) { throw new Error(message); }
function check(ok, message) { if (!ok) fail(message); }
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { check(Number.isFinite(x), 'NON_FINITE_VALUE'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  check(x && Object.getPrototypeOf(x) === Object.prototype, 'JSON_OBJECT_REQUIRED');
  return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
}
function hash(x) { return crypto.createHash('sha256').update(canonical(x)).digest('hex'); }
function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
function copy(x) { return JSON.parse(canonical(x)); }
function time(s) {
  check(typeof s === 'string' && /^(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)$/.test(s), 'UTC_TIME_REQUIRED');
  const n = Date.parse(s);
  check(Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s.slice(0, 10), 'INVALID_TIME');
  return n;
}
function text(s) { check(typeof s === 'string' && s.length > 0 && s.length <= 512, 'NONEMPTY_TEXT_REQUIRED'); return s; }
function integer(n, min, max) { check(Number.isSafeInteger(n) && n >= min && n <= max, 'INTEGER_OUT_OF_RANGE'); return n; }
function stamp(body) { const result = { ...body, resultHash: hash(body) }; return freeze(result); }
function overlap(a, b, c, d) { return a <= d && c <= b; }
const DISCLAIMER = 'MECHANICS_ONLY_NOT_CERTIFIED';

/** Calendar entries are exact decision cutoffs. Label availability, not just horizon end,
 * determines whether an observation may enter fitting or evaluation. */
function buildWalkForward(config, inputEvents) {
  check(config && Array.isArray(config.calendar) && Array.isArray(inputEvents), 'INVALID_WALK_FORWARD_INPUT');
  const calendar = config.calendar.map(time);
  check(calendar.length > 0 && calendar.length <= 100000, 'CALENDAR_BUDGET');
  check(calendar.every((d, i) => !i || d > calendar[i - 1]), 'CALENDAR_NOT_STRICTLY_ORDERED');
  const tr = integer(config.trainSize, 1, 100000), va = integer(config.validationSize, 1, 100000);
  const te = integer(config.testSize, 1, 100000), step = integer(config.stepSize ?? te, te, 100000);
  check(['ROLLING', 'EXPANDING'].includes(config.mode), 'UNKNOWN_WINDOW_MODE');
  const embargo = config.embargoDays ?? 0;
  check(Number.isFinite(embargo) && embargo >= 0 && embargo <= 36500, 'INVALID_EMBARGO');
  const asOf = time(config.asOf), validCutoffs = new Set(calendar), ids = new Set();
  check(inputEvents.length <= 100000, 'EVENT_BUDGET');
  const events = inputEvents.map(raw => {
    const e = copy(raw); text(e.id); check(!ids.has(e.id), 'DUPLICATE_EVENT_ID'); ids.add(e.id);
    const d = time(e.decisionAt), a = time(e.availableAt), start = time(e.informationStart), end = time(e.outcomeEnd);
    const ready = e.outcomeAvailableAt === null ? null : time(e.outcomeAvailableAt);
    check(validCutoffs.has(d), 'DECISION_NOT_ON_CALENDAR');
    check(start <= d && end >= d && (ready === null || ready >= end), 'INVALID_EVENT_INTERVAL');
    return { id: e.id, d, a, start, end, ready };
  }).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  const usableCalendarLength = calendar.filter(t => t <= asOf).length;
  const foldCount = Math.max(0, Math.floor((usableCalendarLength - tr - va - te) / step) + 1);
  check(foldCount > 0, 'INSUFFICIENT_CALENDAR');
  const operationBudget = integer(config.operationBudget ?? 20000000, 1, 100000000);
  check(foldCount * events.length * Math.max(1, events.length) <= operationBudget, 'PURGE_OPERATION_BUDGET');
  const folds = [];
  for (let p = tr + va, k = 0; p + te <= usableCalendarLength; p += step, k++) {
    const trainStart = config.mode === 'EXPANDING' ? 0 : p - va - tr;
    const bounds = { train: [calendar[trainStart], calendar[p - va - 1]], validation: [calendar[p - va], calendar[p - 1]], test: [calendar[p], calendar[p + te - 1]] };
    const by = role => events.filter(e => e.d >= bounds[role][0] && e.d <= bounds[role][1]);
    const validationCandidates = by('validation'), testCandidates = by('test');
    const fold = { id: k, bounds: Object.fromEntries(Object.entries(bounds).map(([r, v]) => [r, v.map(n => new Date(n).toISOString())])), train: [], validation: [], test: [], excluded: [] };
    for (const role of ['train', 'validation', 'test']) {
      const cutoff = role === 'train' ? bounds.validation[0] : role === 'validation' ? bounds.test[0] : asOf;
      const protectedEvents = role === 'train' ? [...validationCandidates, ...testCandidates] : role === 'validation' ? testCandidates : [];
      for (const e of by(role)) {
        let reason = null;
        if (e.d > asOf || e.a > e.d) reason = 'INPUT_NOT_AVAILABLE_AT_DECISION';
        else if (e.ready === null) reason = 'OUTCOME_UNKNOWN';
        else if (e.ready > asOf || (role === 'test' ? e.ready > cutoff : e.ready >= cutoff)) reason = 'OUTCOME_NOT_MATURE_AT_CUTOFF';
        else if (role !== 'test' && e.ready + embargo * DAY >= cutoff) reason = 'EMBARGO';
        else if (protectedEvents.some(t => overlap(e.start, e.end, t.start, t.end))) reason = 'PURGED_INFORMATION_OUTCOME_OVERLAP';
        if (reason) fold.excluded.push({ id: e.id, role, reason }); else fold[role].push(e.id);
      }
    }
    folds.push(fold);
  }
  return stamp({ schemaVersion: VERSION, kind: 'WALK_FORWARD_PARTITION', config: copy(config), inputHash: hash(inputEvents), folds, status: DISCLAIMER, productionApproved: false,
    limitations: ['Partition mechanics do not establish untouched outcomes, PIT universe eligibility, power or economic benefit.', 'Purging conservatively excludes any intersection of declared information/outcome intervals.', 'Only complete test windows are emitted; test cutoffs never overlap.'] });
}

function aggregateOos(partition, observations) {
  check(partition?.kind === 'WALK_FORWARD_PARTITION' && Array.isArray(observations), 'INVALID_OOS_INPUT');
  const { resultHash, ...body } = partition; check(hash(body) === resultHash, 'PARTITION_HASH_MISMATCH');
  const lookup = new Map();
  for (const x of observations) {
    text(x.id); check(!lookup.has(x.id), 'DUPLICATE_OBSERVATION_ID');
    check(Number.isFinite(x.value), 'INVALID_OBSERVATION'); lookup.set(x.id, x.value);
  }
  const seen = new Set(), rows = [];
  for (const fold of partition.folds) for (const id of fold.test) {
    check(!seen.has(id), 'DUPLICATE_OOS_EVENT'); check(lookup.has(id), 'MISSING_OOS_OBSERVATION');
    seen.add(id); rows.push({ fold: fold.id, id, value: lookup.get(id) });
  }
  check(lookup.size === seen.size, 'NON_TEST_OBSERVATIONS_SUPPLIED');
  return stamp({ schemaVersion: VERSION, kind: 'OOS_AGGREGATE', partitionHash: resultHash, rows, n: rows.length,
    mean: rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : null,
    status: DISCLAIMER, productionApproved: false, limitation: 'No IID standard error or independence claim is inferred from event count.' });
}

/** Execute a registered pipeline: fitting sees train only, selection sees validation only,
 * evaluation sees the fixed selected model and test only. Callbacks must be audited code;
 * JavaScript closures are not a security sandbox. */
function runWalkForward(partition, observations, registration, callbacks) {
  const { resultHash: partitionHash, ...partitionBody } = partition;
  check(partition?.kind === 'WALK_FORWARD_PARTITION' && hash(partitionBody) === partitionHash, 'PARTITION_HASH_MISMATCH');
  check(registration?.kind === 'WALK_FORWARD_EXECUTION_REGISTRATION', 'WALK_FORWARD_REGISTRATION_REQUIRED');
  const { resultHash: registrationHash, ...registrationBody } = registration;
  check(hash(registrationBody) === registrationHash, 'EXECUTION_REGISTRATION_HASH_MISMATCH');
  const spec = registration.specification;
  check(partitionHash === spec.partitionHash && hash(observations) === spec.dataHash, 'REGISTERED_EXECUTION_INPUT_CHANGED');
  check(callbacks?.selectionRuleHash === spec.selectionRuleHash && callbacks.evaluatorHash === spec.evaluatorHash && callbacks.fitHash === spec.fitHash, 'REGISTERED_EXECUTION_CALLBACK_CHANGED');
  check(['fit', 'select', 'evaluate'].every(k => typeof callbacks[k] === 'function'), 'EXECUTION_CALLBACKS_REQUIRED');
  check(time(callbacks.executedAt) >= time(spec.registeredAt), 'EXECUTION_PRECEDES_REGISTRATION');
  check(hash(callbacks.fit.toString()) === spec.fitHash && hash(callbacks.select.toString()) === spec.selectionRuleHash && hash(callbacks.evaluate.toString()) === spec.evaluatorHash, 'CALLBACK_SOURCE_HASH_MISMATCH');
  const allTestIds = partition.folds.flatMap(f => f.test);
  check(new Set(allTestIds).size === allTestIds.length, 'DUPLICATE_OOS_EVENT');
  for (const f of partition.folds) {
    const all = [...f.train, ...f.validation, ...f.test]; check(new Set(all).size === all.length, 'OVERLAPPING_FOLD_ROLES');
  }
  const lookup = new Map();
  for (const record of observations) {
    text(record.id); check(!lookup.has(record.id), 'DUPLICATE_EXECUTION_RECORD');
    lookup.set(record.id, freeze(copy(record)));
  }
  const records = ids => freeze(ids.map(id => { check(lookup.has(id), 'MISSING_EXECUTION_RECORD'); return copy(lookup.get(id)); }));
  const completed = [], predictions = [];
  for (const fold of partition.folds) {
    check(fold.train.length > 0 && fold.validation.length > 0 && fold.test.length > 0, 'INSUFFICIENT_FOLD_DATA');
    const context = freeze({ foldId: fold.id, trainCutoff: fold.bounds.validation[0], selectionCutoff: fold.bounds.test[0], testBounds: copy(fold.bounds.test), registrationHash });
    const model = copy(callbacks.fit(records(fold.train), context));
    check(model && typeof model === 'object' && Buffer.byteLength(canonical(model)) <= 262144, 'INVALID_FITTED_MODEL');
    const selected = copy(callbacks.select(freeze(copy(model)), records(fold.validation), context));
    check(selected && typeof selected === 'object' && Buffer.byteLength(canonical(selected)) <= 262144, 'INVALID_SELECTED_MODEL');
    const selectedHash = hash(selected);
    const rows = callbacks.evaluate(freeze(copy(selected)), records(fold.test), context);
    check(Array.isArray(rows) && rows.length === fold.test.length, 'INVALID_TEST_EVALUATION');
    const expected = new Set(fold.test), seen = new Set();
    for (const row of rows) {
      check(row && expected.has(row.id) && !seen.has(row.id) && Number.isFinite(row.value), 'INVALID_TEST_EVALUATION');
      seen.add(row.id); predictions.push({ id: row.id, value: row.value });
    }
    // No test performance is exposed to the fitting/selection callback context of later folds.
    completed.push({ foldId: fold.id, fittedModelHash: hash(model), selectedModelHash: selectedHash,
      trainN: fold.train.length, validationN: fold.validation.length, testN: fold.test.length });
  }
  const aggregate = aggregateOos(partition, predictions);
  return stamp({ schemaVersion: VERSION, kind: 'WALK_FORWARD_EXECUTION', registrationHash, partitionHash,
    dataHash: spec.dataHash, folds: completed, aggregate, status: DISCLAIMER, productionApproved: false,
    limitations: ['Callback hash declarations require independent code/provenance audit; callbacks are not sandboxed.',
      'No callback may use external test labels, tune after evaluation, or consume an independent holdout without its exposure ledger.',
      'This execution is historical developmental walk-forward, not proof of an untouched holdout.'] });
}

function registerWalkForwardExecution(spec) {
  for (const k of ['id', 'partitionHash', 'dataHash', 'fitHash', 'selectionRuleHash', 'evaluatorHash', 'primaryEndpoint']) text(spec[k]);
  time(spec.registeredAt);
  check(spec.purpose === 'DEVELOPMENTAL_WALK_FORWARD', 'INDEPENDENT_HOLDOUT_REQUIRES_EXPOSURE_REGISTRY');
  return stamp({ schemaVersion: VERSION, kind: 'WALK_FORWARD_EXECUTION_REGISTRATION', specification: copy(spec), productionApproved: false });
}

const GENESIS = hash({ schemaVersion: VERSION, kind: 'EXPOSURE_LEDGER' });
function createExposureLedger() { return freeze({ schemaVersion: VERSION, kind: 'EXPOSURE_LEDGER', head: GENESIS, entries: [] }); }
function verifyExposureLedger(ledger) {
  check(ledger?.schemaVersion === VERSION && ledger.kind === 'EXPOSURE_LEDGER' && Array.isArray(ledger.entries), 'INVALID_LEDGER');
  let head = GENESIS, last = -Infinity; const ids = new Set();
  for (const entry of ledger.entries) {
    const { hash: entryHash, ...body } = entry;
    text(body.id); text(body.ruleHash); check(!ids.has(body.id), 'EXPOSURE_ID_ALREADY_USED'); ids.add(body.id);
    check(['DEVELOPMENT', 'EXPLORATION', 'SENSITIVITY', 'HOLDOUT_CONSUMED'].includes(body.purpose), 'UNKNOWN_EXPOSURE_PURPOSE');
    check(time(body.observedAt) >= time(body.to), 'EXPOSURE_NOT_YET_OBSERVABLE');
    check(body.previousHash === head && hash(body) === entryHash, 'LEDGER_HASH_MISMATCH');
    check(time(body.observedAt) >= last && time(body.from) <= time(body.to), 'INVALID_LEDGER_CHRONOLOGY');
    last = time(body.observedAt); head = entryHash;
  }
  check(ledger.head === head, 'LEDGER_HEAD_MISMATCH'); return true;
}
function appendExposure(ledger, exposure) {
  verifyExposureLedger(ledger);
  text(exposure.id); text(exposure.ruleHash);
  check(['DEVELOPMENT', 'EXPLORATION', 'SENSITIVITY', 'HOLDOUT_CONSUMED'].includes(exposure.purpose), 'UNKNOWN_EXPOSURE_PURPOSE');
  check(time(exposure.from) <= time(exposure.to), 'INVALID_EXPOSURE_INTERVAL');
  const observed = time(exposure.observedAt);
  check(observed >= time(exposure.to), 'EXPOSURE_NOT_YET_OBSERVABLE');
  check(!ledger.entries.some(e => e.id === exposure.id), 'EXPOSURE_ID_ALREADY_USED');
  check(!ledger.entries.length || observed >= time(ledger.entries.at(-1).observedAt), 'NONCHRONOLOGICAL_EXPOSURE');
  const body = { ...copy(exposure), previousHash: ledger.head }, entry = { ...body, hash: hash(body) };
  return freeze({ schemaVersion: VERSION, kind: 'EXPOSURE_LEDGER', entries: [...copy(ledger.entries), entry], head: entry.hash });
}
function assertUnexposed(ledger, from, to) {
  verifyExposureLedger(ledger);
  check(!ledger.entries.some(e => overlap(time(from), time(to), time(e.from), time(e.to))), 'HOLDOUT_ALREADY_EXPOSED');
}
function registerHoldout(spec, ledger) {
  for (const k of ['id', 'ruleHash', 'methodHash', 'universeHash', 'dataDefinitionHash', 'primaryEndpoint']) text(spec[k]);
  time(spec.registeredAt); check(time(spec.from) <= time(spec.to), 'INVALID_HOLDOUT_INTERVAL');
  check(Number.isFinite(spec.alpha) && spec.alpha > 0 && spec.alpha < 1, 'INVALID_ALPHA');
  check(Number.isFinite(spec.minimumEffect), 'INVALID_MINIMUM_EFFECT');
  check(spec.parameters && typeof spec.parameters === 'object' && !Array.isArray(spec.parameters), 'PARAMETERS_REQUIRED');
  assertUnexposed(ledger, spec.from, spec.to);
  check(!ledger.entries.length || time(spec.registeredAt) >= time(ledger.entries.at(-1).observedAt), 'REGISTRATION_PRECEDES_LEDGER');
  return stamp({ schemaVersion: VERSION, kind: 'HOLDOUT_REGISTRATION', specification: copy(spec), registeredLedgerHead: ledger.head,
    evidenceStatus: 'DECLARED_UNEXPOSED_NOT_INDEPENDENTLY_VERIFIED', productionApproved: false });
}
function consumeHoldout(registration, ledger, request) {
  const { resultHash, ...body } = registration;
  check(registration.kind === 'HOLDOUT_REGISTRATION' && hash(body) === resultHash, 'REGISTRATION_HASH_MISMATCH');
  const s = registration.specification;
  check(request.ruleHash === s.ruleHash && request.methodHash === s.methodHash && request.universeHash === s.universeHash && request.dataDefinitionHash === s.dataDefinitionHash && request.primaryEndpoint === s.primaryEndpoint && hash(request.parameters) === hash(s.parameters), 'REGISTERED_METHOD_CHANGED');
  text(request.datasetHash); text(request.outcomeSetHash);
  check(time(request.observedAt) >= time(s.registeredAt) && time(request.asOf) >= time(s.to) && time(request.asOf) <= time(request.observedAt), 'HOLDOUT_NOT_MATURE');
  check(request.outcomesComplete === true, 'HOLDOUT_OUTCOMES_INCOMPLETE');
  assertUnexposed(ledger, s.from, s.to);
  // Exact ancestor check: a declaration cannot be paired with an unrelated ledger.
  check(registration.registeredLedgerHead === GENESIS || ledger.entries.some(e => e.hash === registration.registeredLedgerHead), 'REGISTRATION_LEDGER_NOT_ANCESTOR');
  const next = appendExposure(ledger, { id: 'holdout:' + s.id, purpose: 'HOLDOUT_CONSUMED', from: s.from, to: s.to, observedAt: request.observedAt, ruleHash: s.ruleHash, registrationHash: resultHash });
  return freeze({ ledger: next, receipt: stamp({ schemaVersion: VERSION, kind: 'HOLDOUT_CONSUMPTION', registrationHash: resultHash, ledgerHead: next.head, datasetHash: request.datasetHash, outcomeSetHash: request.outcomeSetHash, universeHash: s.universeHash, dataDefinitionHash: s.dataDefinitionHash, primaryEndpoint: s.primaryEndpoint,
    evidenceStatus: 'CONSUMED_REQUIRES_INDEPENDENT_AUDIT', productionApproved: false }) });
}

function holm(pValues) {
  check(Array.isArray(pValues) && pValues.length <= 100000, 'INVALID_P_VALUES');
  pValues.forEach(p => check(Number.isFinite(p) && p >= 0 && p <= 1, 'INVALID_P_VALUE'));
  const sorted = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i), adjusted = Array(pValues.length);
  let previous = 0;
  sorted.forEach((x, rank) => { previous = Math.max(previous, Math.min(1, (sorted.length - rank) * x.p)); adjusted[x.i] = previous; });
  return adjusted;
}
function gridPoints(dimensions) {
  check(dimensions && Object.getPrototypeOf(dimensions) === Object.prototype, 'GRID_REQUIRED');
  const keys = Object.keys(dimensions).sort(); check(keys.length > 0 && keys.length <= 8, 'GRID_DIMENSION_BUDGET');
  let points = [{}];
  for (const key of keys) {
    text(key); const values = dimensions[key];
    check(Array.isArray(values) && values.length > 0 && values.length <= 100 && values.every(Number.isFinite), 'INVALID_GRID_VALUES');
    check(new Set(values).size === values.length && values.every((v, i) => !i || v > values[i - 1]), 'GRID_VALUES_NOT_STRICTLY_ORDERED');
    if (['feeBps', 'slippageBps', 'entryDelay'].includes(key)) check(values.every(v => v >= 0), 'NEGATIVE_FRICTION');
    if (['entryDelay', 'holdingPeriods'].includes(key)) check(values.every(Number.isSafeInteger), 'DISCRETE_PARAMETER_REQUIRED');
    if (key === 'holdingPeriods') check(values.every(v => v > 0), 'INVALID_HOLDING_PERIOD');
    check(points.length * values.length <= 10000, 'GRID_POINT_BUDGET');
    points = points.flatMap(p => values.map(v => ({ ...p, [key]: v })));
  }
  return points;
}
function registerSensitivity(spec) {
  for (const k of ['id', 'ruleHash', 'datasetHash', 'evaluatorHash', 'primaryEndpoint']) text(spec[k]);
  time(spec.registeredAt); check(spec.purpose === 'EXPLORATORY_ROBUSTNESS', 'SENSITIVITY_CANNOT_SELECT_ON_HOLDOUT');
  const points = gridPoints(spec.dimensions);
  check(points.some(p => hash(p) === hash(spec.baseline)), 'BASELINE_NOT_ON_GRID');
  check(Number.isFinite(spec.alpha) && spec.alpha > 0 && spec.alpha < 1, 'INVALID_ALPHA');
  return stamp({ schemaVersion: VERSION, kind: 'SENSITIVITY_REGISTRATION', specification: copy(spec), points });
}
function runSensitivity(registration, evaluator, context) {
  const { resultHash, ...body } = registration;
  check(registration.kind === 'SENSITIVITY_REGISTRATION' && hash(body) === resultHash, 'SENSITIVITY_REGISTRATION_HASH_MISMATCH');
  const spec = registration.specification;
  check(typeof evaluator === 'function', 'EVALUATOR_REQUIRED');
  check(context && context.datasetHash === spec.datasetHash && context.evaluatorHash === spec.evaluatorHash && context.ruleHash === spec.ruleHash, 'SENSITIVITY_CONTEXT_CHANGED');
  check(hash(evaluator.toString()) === spec.evaluatorHash, 'SENSITIVITY_EVALUATOR_SOURCE_CHANGED');
  check(time(context.executedAt) >= time(spec.registeredAt) && context.holdout === false, 'HOLDOUT_TUNING_PROHIBITED');
  const rows = registration.points.map(parameters => {
    const result = evaluator(freeze(copy(parameters)));
    check(result && Number.isFinite(result.estimate) && Number.isFinite(result.pValue) && result.pValue >= 0 && result.pValue <= 1, 'INVALID_SENSITIVITY_RESULT');
    integer(result.n, 1, Number.MAX_SAFE_INTEGER);
    check(Array.isArray(result.ci) && result.ci.length === 2 && result.ci.every(Number.isFinite) && result.ci[0] <= result.ci[1], 'UNCERTAINTY_INTERVAL_REQUIRED');
    text(result.inferenceMethod); integer(result.clusters, 1, result.n);
    check(Number.isFinite(result.effectiveN) && result.effectiveN > 0 && result.effectiveN <= result.n, 'INVALID_EFFECTIVE_SAMPLE');
    return { parameters: copy(parameters), estimate: result.estimate, pValue: result.pValue, n: result.n, ci: copy(result.ci), inferenceMethod: result.inferenceMethod, clusters: result.clusters, effectiveN: result.effectiveN };
  });
  const adjusted = holm(rows.map(r => r.pValue));
  rows.forEach((r, i) => { r.adjustedPValue = adjusted[i]; r.reject = adjusted[i] <= spec.alpha; });
  const baseline = rows.find(r => hash(r.parameters) === hash(spec.baseline)), keys = Object.keys(spec.dimensions).sort();
  const neighbors = rows.filter(r => {
    const differences = keys.map(k => Math.abs(spec.dimensions[k].indexOf(r.parameters[k]) - spec.dimensions[k].indexOf(spec.baseline[k])));
    return differences.reduce((a, b) => a + b, 0) === 1;
  });
  return stamp({ schemaVersion: VERSION, kind: 'SENSITIVITY_RESULT', registrationHash: resultHash, rows,
    baseline: copy(baseline), neighborhood: { count: neighbors.length, sameDirection: neighbors.length ? neighbors.every(r => Math.sign(r.estimate) === Math.sign(baseline.estimate)) : null,
      minEstimate: neighbors.length ? Math.min(...neighbors.map(r => r.estimate)) : null, maxEstimate: neighbors.length ? Math.max(...neighbors.map(r => r.estimate)) : null },
    multiplicity: 'HOLM_WITHIN_REGISTERED_GRID_ONLY', intervalMultiplicity: 'NOMINAL_EVALUATOR_DEFINED_NOT_SIMULTANEOUS', status: DISCLAIMER, productionApproved: false,
    limitations: ['Exploratory robustness only; no winning parameter is selected.', 'All additional prior searches must also enter the study-level multiplicity plan.', 'Holm adjusts p-values/rejections only; supplied confidence intervals remain nominal/evaluator-defined, not simultaneous.', 'Caller must audit evaluator provenance, dependence-aware inference and actual data exposure.'] });
}

/** Private, offline registry. One atomic state contains registrations, receipts and ledger.
 * A stale state hash or a concurrent writer fails closed. This is not user authorization,
 * WORM storage or proof that an operator never viewed labels outside this registry. */
function openHoldoutStore(directory) {
  check(typeof directory === 'string' && path.isAbsolute(directory), 'ABSOLUTE_PRIVATE_DIRECTORY_REQUIRED');
  const repository = fs.realpathSync(path.resolve(__dirname, '../..')), requested = path.resolve(directory);
  check(requested !== repository && !requested.startsWith(repository + path.sep), 'STORE_MUST_BE_OUTSIDE_REPOSITORY');
  let ancestor = requested;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const actualAncestor = fs.realpathSync(ancestor);
  check(actualAncestor !== repository && !actualAncestor.startsWith(repository + path.sep), 'STORE_MUST_BE_OUTSIDE_REPOSITORY');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dirStat = fs.lstatSync(directory);
  check(dirStat.isDirectory() && !dirStat.isSymbolicLink() && !(dirStat.mode & 0o077), 'PRIVATE_DIRECTORY_REQUIRED');
  const real = fs.realpathSync(directory);
  check(real !== repository && !real.startsWith(repository + path.sep), 'STORE_MUST_BE_OUTSIDE_REPOSITORY');
  const file = path.join(real, 'holdout-registry.json'), lock = path.join(real, '.writer-lock');
  function readState() {
    check(fs.existsSync(file), 'HOLDOUT_STORE_NOT_INITIALIZED');
    const stat = fs.lstatSync(file);
    check(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && stat.size <= 16777216, 'INVALID_PRIVATE_STORE_FILE');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { resultHash, ...body } = state;
    check(hash(body) === resultHash && state.kind === 'PRIVATE_HOLDOUT_REGISTRY' && state.schemaVersion === VERSION, 'STORE_HASH_MISMATCH');
    verifyExposureLedger(state.ledger);
    check(Array.isArray(state.registrations) && Array.isArray(state.receipts), 'INVALID_STORE_CONTENTS');
    for (const r of [...state.registrations, ...state.receipts]) {
      const { resultHash: h, ...b } = r; check(hash(b) === h, 'STORE_RECORD_HASH_MISMATCH');
    }
    return freeze(state);
  }
  function persist(state) {
    const bytes = JSON.stringify(state) + '\n';
    check(Buffer.byteLength(bytes) <= 16777216, 'HOLDOUT_STORE_SIZE_BUDGET');
    const tmp = path.join(real, '.holdout-' + crypto.randomUUID() + '.tmp');
    try {
      const fd = fs.openSync(tmp, 'wx', 0o600);
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, file);
      const fdDir = fs.openSync(real, 'r');
      try { fs.fsyncSync(fdDir); } finally { fs.closeSync(fdDir); }
    } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  }
  function locked(action) {
    try { fs.mkdirSync(lock, { mode: 0o700 }); } catch (e) { if (e.code === 'EEXIST') fail('HOLDOUT_WRITER_LOCKED'); throw e; }
    try { return action(); } finally { fs.rmdirSync(lock); }
  }
  function update(expectedStateHash, action) {
    text(expectedStateHash);
    return locked(() => {
      const state = readState(); check(state.resultHash === expectedStateHash, 'HOLDOUT_STATE_CHANGED');
      const mutable = copy(state), result = action(mutable);
      const { resultHash, ...body } = mutable;
      body.generation = integer(body.generation, 0, Number.MAX_SAFE_INTEGER - 1) + 1;
      const next = stamp(body); persist(next);
      return freeze({ stateHash: next.resultHash, result });
    });
  }
  if (!fs.existsSync(file)) locked(() => {
    check(!fs.existsSync(file), 'HOLDOUT_STORE_ALREADY_INITIALIZED');
    persist(stamp({ schemaVersion: VERSION, kind: 'PRIVATE_HOLDOUT_REGISTRY', generation: 0,
      ledger: createExposureLedger(), registrations: [], receipts: [], productionApproved: false }));
  });
  return Object.freeze({
    read: readState,
    expose(exposure, expectedStateHash) { return update(expectedStateHash, s => { s.ledger = appendExposure(s.ledger, exposure); return s.ledger; }); },
    register(spec, expectedStateHash) { return update(expectedStateHash, s => {
      check(!s.registrations.some(r => r.specification.id === spec.id), 'HOLDOUT_ID_ALREADY_REGISTERED');
      const r = registerHoldout(spec, s.ledger); s.registrations.push(r); return r;
    }); },
    consume(id, request, expectedStateHash) { return update(expectedStateHash, s => {
      const r = s.registrations.find(x => x.specification.id === id); check(r, 'UNKNOWN_HOLDOUT_ID');
      const consumed = consumeHoldout(r, s.ledger, request); s.ledger = consumed.ledger; s.receipts.push(consumed.receipt); return consumed.receipt;
    }); }
  });
}

module.exports = { VERSION, hash, buildWalkForward, aggregateOos, registerWalkForwardExecution, runWalkForward, createExposureLedger, verifyExposureLedger, appendExposure, registerHoldout, consumeHoldout, holm, registerSensitivity, runSensitivity, openHoldoutStore };
