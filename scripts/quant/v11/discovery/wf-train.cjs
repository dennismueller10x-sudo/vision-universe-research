#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – walk-forward WITHIN TRAIN (research-validation buildWalkForward/runWalkForward).
// Question: does "pick the best explored variant" carry out-of-sample value inside TRAIN? Observations are the
// per-decision-interval excess returns (vs own-universe EW and vs SPY) of every logged TRAIN variant that shares
// the family's dominant decision calendar. Usage: node wf-train.cjs [--log <jsonl>] [--out <json>]
const fs = require('node:fs'), path = require('node:path');
const L = require('./lib.cjs'), V = L.V;

function load(logFile) { return fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); }

// Callbacks (hash-registered). Records: {id, values:{variant: excess}}.
function fit(train) {
  const ids = Object.keys(train[0].values), m = {};
  for (const v of ids) m[v] = train.reduce((s, r) => s + r.values[v], 0) / train.length;
  return { shortlist: ids.sort((a, b) => m[b] - m[a] || (a < b ? -1 : 1)).slice(0, 5), trainMeans: Object.fromEntries(ids.map(v => [v, m[v]])) };
}
function select(model, validation) {
  const m = v => validation.reduce((s, r) => s + r.values[v], 0) / validation.length;
  const best = model.shortlist.slice().sort((a, b) => m(b) - m(a) || (a < b ? -1 : 1))[0];
  return { variant: best };
}
function evaluate(selected, test) { return test.map(r => ({ id: r.id, value: r.values[selected.variant] })); }

function runFamily(entries, family, cadenceKey, endpoint, cfg, subset = 'ALL', keep = () => true) {
  entries = entries.filter(keep);
  const fam = entries.filter(e => e.family === family && cadenceKey(e.spec));
  const dates = fam[0].intervals.map(x => x[0]);
  const usable = fam.filter(e => JSON.stringify(e.intervals.map(x => x[0])) === JSON.stringify(dates));
  const col = endpoint === 'OWN_EW' ? 2 : 3;
  const records = dates.map((d, q) => ({ id: d, values: Object.fromEntries(usable.map(e => [e.id, e.intervals[q][1] - e.intervals[q][col]])) }));
  const events = dates.map((d, q) => ({ id: d, decisionAt: d + 'T00:00:00Z', availableAt: d + 'T00:00:00Z', informationStart: d + 'T00:00:00Z', outcomeEnd: usable[0].intervals[q][4] + 'T00:00:00Z', outcomeAvailableAt: usable[0].intervals[q][4] + 'T00:00:00Z' }));
  const partition = V.buildWalkForward({ calendar: dates.map(d => d + 'T00:00:00Z'), trainSize: cfg.train, validationSize: cfg.validation, testSize: cfg.test, stepSize: cfg.test, mode: 'EXPANDING', embargoDays: 0, asOf: usable[0].intervals.at(-1)[4] + 'T00:00:00Z' }, events);
  const registration = V.registerWalkForwardExecution({ id: 'V11-DISCOVERY-WF-' + family + '-' + endpoint, partitionHash: partition.resultHash, dataHash: V.hash(records), fitHash: V.hash(fit.toString()), selectionRuleHash: V.hash(select.toString()), evaluatorHash: V.hash(evaluate.toString()),
    primaryEndpoint: 'mean interval excess vs ' + endpoint + ' of the selected variant on test folds', registeredAt: '2026-10-28T00:00:00Z', purpose: 'DEVELOPMENTAL_WALK_FORWARD' });
  const ex = V.runWalkForward(partition, records, registration, { fit, select, evaluate, fitHash: registration.specification.fitHash, selectionRuleHash: registration.specification.selectionRuleHash, evaluatorHash: registration.specification.evaluatorHash, executedAt: new Date().toISOString() });
  // Reconstruct selections per fold (same deterministic callbacks) for reporting, and the average-variant benchmark.
  const byId = new Map(records.map(r => [r.id, r]));
  const folds = partition.folds.map(f => {
    const model = fit(f.train.map(id => byId.get(id))), sel = select(model, f.validation.map(id => byId.get(id)));
    const test = f.test.map(id => byId.get(id)), m = v => test.reduce((s, r) => s + r.values[v], 0) / test.length;
    const all = usable.map(e => m(e.id)).sort((a, b) => a - b);
    return { id: f.id, bounds: f.bounds, trainN: f.train.length, validationN: f.validation.length, testN: f.test.length, excluded: f.excluded.length, shortlist: model.shortlist, selected: sel.variant,
      selectedTestMean: m(sel.variant), averageVariantTestMean: all.reduce((s, x) => s + x, 0) / all.length, selectedTestRankAmongVariants: all.filter(x => x > m(sel.variant)).length + 1, variants: all.length };
  });
  const per = ex.aggregate.rows.map(r => r.value);
  return { family, endpoint, subset, variantsUsed: usable.length, variantsExcludedOtherCalendar: fam.length - usable.length + entries.filter(e => e.family === family && !cadenceKey(e.spec)).length, config: cfg,
    partitionHash: partition.resultHash, registrationHash: registration.resultHash, executionHash: ex.resultHash, oosIntervals: ex.aggregate.n, oosMeanPerInterval: ex.aggregate.mean,
    averageVariantOosMeanPerInterval: L.mean(folds.map(f => f.averageVariantTestMean)), folds, status: ex.status, limitations: ex.limitations, oosRows: ex.aggregate.rows };
}

function main() {
  const li = process.argv.indexOf('--log'), oi = process.argv.indexOf('--out');
  const logFile = li > 0 ? process.argv[li + 1] : path.join(L.PRIVATE, 'train-exploration.jsonl');
  const out = oi > 0 ? process.argv[oi + 1] : path.join(L.PRIVATE, 'wf-train.json');
  const entries = load(logFile).filter(e => !e.id.startsWith('B-'));
  const res = [];
  for (const ep of ['OWN_EW', 'SPY']) {
    res.push(runFamily(entries, 'PRICE', s => s.rebalanceWeeks === 4, ep, { train: 39, validation: 13, test: 13 }));
    res.push(runFamily(entries, 'PRICE', s => s.rebalanceWeeks === 4, ep, { train: 39, validation: 13, test: 13 }, 'QUOTED_PRICE_GE_5_ONLY', e => (e.spec.filters || []).some(f => f[0] === 'rawPx')));
    res.push(runFamily(entries, 'FUND', s => s.cadence === 'MONTHLY' && (s.rebalanceMonths || 1) === 1, ep, { train: 24, validation: 12, test: 12 }));
  }
  L.writeJson(out, res);
  for (const r of res) console.log(r.family, r.subset, r.endpoint, 'variants', r.variantsUsed, 'OOS n', r.oosIntervals, 'selected mean/interval', (r.oosMeanPerInterval * 100).toFixed(3) + '%', 'avg variant', (r.averageVariantOosMeanPerInterval * 100).toFixed(3) + '%', 'folds', r.folds.map(f => f.selected.replace(/^(P\d?b?|F\d)-/, '') + '#' + f.selectedTestRankAmongVariants + '/' + f.variants).join(' | '));
}
if (require.main === module) main();
module.exports = { fit, select, evaluate, runFamily };
