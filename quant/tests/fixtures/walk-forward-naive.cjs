// Test-only oracle: unchanged partition implementation before PR #2019 (main 9bfba060; also unchanged at 46ca41d0).
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

module.exports = { buildWalkForward };
