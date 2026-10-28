#!/usr/bin/env node
'use strict';
// V9 follow-up (ledger): before/after evidence for research-portfolio 1.1.0 -> 1.2.0.
// (1) Unchanged behaviour: recorded V9 (L1/L2/L3/terminal), V8 reference and V7 portfolio results are
//     reproduced by the new engine. resultHash binds the engine source and VERSION, so the new result is
//     re-stamped with the recorded engine identity (and, where recorded on another Node binary, the
//     recorded runtime) and generation/resultHash are recomputed; equality with the recorded hash proves
//     every other field is byte-identical.
// (2) New types on real sourced events (run_ca_ledger.cjs) and the independent Python parity.
// All inputs are private run directories (outside the repository); output is one small JSON file.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '../../../..');
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const NEW = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const OLD = require(path.resolve(arg('old-engine')));
const oldIdentity = read(arg('old-identity'));

function restamp(r, runtime = r.runtime) {
  const x = { ...r, schemaVersion: oldIdentity.VERSION, sourceHashes: oldIdentity.sourceHashes, runtime };
  delete x.resultHash; delete x.generation;
  x.generation = NEW.hash({ version: oldIdentity.VERSION, inputHash: x.inputHash, sourceHashes: x.sourceHashes, runtime: x.runtime });
  x.resultHash = NEW.hash(x);
  return x;
}
const strip = r => { const { schemaVersion, sourceHashes, generation, resultHash, ...rest } = r; return NEW.canonical(rest); };

function v9() {
  const rec = arg('v9-recorded'), o = arg('v9-old-out'), n = arg('v9-new-out'), out = {};
  for (const [k, f] of [['L1', 'ledger-L1.json'], ['L2', 'ledger-L2.json'], ['L3', 'ledger-L3.json'], ['TERMINAL_DAILY', 'ledger-terminal-daily.json']]) {
    const dir = k === 'TERMINAL_DAILY' ? 'TD' : k, r0 = read(path.join(rec, f)), sOld = read(path.join(o, dir + '-summary.json')), sNew = read(path.join(n, dir + '-summary.json'));
    const runs = {};
    for (const [name, x] of Object.entries(r0.runs)) {
      if (x.error) { runs[name] = { recordedError: x.error, oldEngineError: sOld.runs[name].error, newEngineError: sNew.runs[name].error, equal: sOld.runs[name].error === x.error && sNew.runs[name].error === x.error }; continue; }
      const rn = read(path.join(n, dir, name + '-result.json')), ro = read(path.join(o, dir, name + '-result.json'));
      runs[name] = { endCapital: rn.endCapital, recordedResultHash: x.resultHash, oldEngineResultHash: ro.resultHash, newEngineRawResultHash: rn.resultHash,
        newEngineRestampedResultHash: restamp(rn).resultHash, equal: ro.resultHash === x.resultHash && restamp(rn).resultHash === x.resultHash && strip(rn) === strip(ro) && rn.endCapital === x.endCapital };
    }
    out[k] = { registrationHashReproduced: sNew.registration.registrationHash === r0.registration.registrationHash && sOld.registration.registrationHash === r0.registration.registrationHash, runs };
  }
  return out;
}
function v8() {
  const rec = read(path.join(ROOT, 'docs/quant-recovery/v8/reference-portfolio.json')), o = read(arg('v8-old')), n = read(arg('v8-new'));
  return { method: 'scripts/quant/verify-research-portfolio.py --node v8_node_shim.cjs (recorded runtime + 1.1.0 identity re-stamped)', status: { old: o.status, new: n.status },
    cases: rec.cases.map((c, i) => ({ case: c.case, recordedResultHash: c.resultHash, oldEngine: o.cases[i].resultHash, newEngine: n.cases[i].resultHash, equal: o.cases[i].resultHash === c.resultHash && n.cases[i].resultHash === c.resultHash && n.cases[i].expectedEndCapital === c.expectedEndCapital })) };
}
function v7() {
  const dir = arg('v7-out'), rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v7/real-studies.json.gz'))));
  return Object.fromEntries([1, 4, 13].map(f => {
    const id = 'V7-PORTFOLIO-' + f, input = read(path.join(dir, id + '-input.json')), s = rec.studies.find(x => x.id === id);
    const ro = OLD.runPortfolio(input), rn = NEW.runPortfolio(input);
    return [id, { recordedEndCapital: s.endCapital, oldEngineEndCapital: ro.endCapital, newEngineEndCapital: rn.endCapital, metricsEqualRecorded: JSON.stringify(rn.metrics) === JSON.stringify(s.metrics), rebalances: rn.rebalances.length,
      recordedInputHash: s.inputHash, rerunInputHash: C.hash(input), payloadWithoutIdentityIdenticalOldVsNew: strip(rn) === strip(ro),
      equal: ro.endCapital === s.endCapital && rn.endCapital === s.endCapital && JSON.stringify(rn.metrics) === JSON.stringify(s.metrics) && strip(rn) === strip(ro) }];
  }));
}
function ca() {
  const s = read(arg('ca-summary')), p = read(arg('parity'));
  const pick = r => r.error ? { error: r.error, expected: r.expectError || null } : { endCapital: r.endCapital, cumulativeReturn: r.metrics.cumulativeReturn, trades: r.trades, notStatedClaims: r.notStatedClaims ? r.notStatedClaims.map(c => ({ eventId: c.eventId, amount: c.amount, entitlementDate: c.entitlementDate })) : undefined,
    events: r.eventLedger.filter(e => e.type !== 'CASH_DIVIDEND').map(e => ({ date: e.date, eventId: e.eventId, type: e.type, entitlementUnits: e.entitlementUnits })) };
  return { evidenceSha256: s.evidenceSha256, v9DividendEvidenceSha256: s.v9DividendEvidenceSha256, engineVersion: s.engineVersion, engineSha256: s.engineSha256, runnerSha256: s.runnerSha256,
    studies: Object.fromEntries(Object.entries(s.studies).map(([k, st]) => [k, { period: st.period, sessions: st.sessions, audit: st.audit, runs: Object.fromEntries(Object.entries(st.runs).map(([n, r]) => [n, { engine: r.engine, note: r.note, primary: r.primary, ...pick(r) }])) }])),
    parity: { status: p.status, tolerance: p.tolerance, scriptSha256: p.scriptSha256, runs: Object.fromEntries(Object.entries(p.runs).map(([k, r]) => [k, { match: r.match, python: r.python || r.pythonEnd, maxEquityRelDiff: r.maxEquityRelDiff, maxNotStatedRelDiff: r.maxNotStatedRelDiff, inputParity: r.inputParity }])) } };
}

const v9r = v9(), v8r = v8(), v7r = v7(), car = ca();
const allEqual = [...Object.values(v9r).flatMap(s => [s.registrationHashReproduced, ...Object.values(s.runs).map(r => r.equal)]), ...v8r.cases.map(c => c.equal), ...Object.values(v7r).map(r => r.equal)];
const evidence = {
  schemaVersion: 'v9-followup-ledger-before-after-1.0.0', engine: { before: { version: OLD.VERSION, sha256: C.shaFile(path.resolve(arg('old-engine'))) }, after: { version: NEW.VERSION, sha256: C.shaFile(path.join(ROOT, 'quant/engines/research-portfolio.cjs')) } },
  runtime: C.runtime(), builderSha256: C.shaFile(__filename),
  unchanged: { summary: { comparisons: allEqual.length, equal: allEqual.filter(Boolean).length }, v9: v9r, v8ReferencePortfolio: v8r, v7Portfolio: v7r,
    v7Note: 'V7 private inputs are rebuilt by scripts/quant/run-v7-real-studies.cjs from current repository data; their inputHash differs from the recorded one (input metadata), but endCapital, metrics and rebalance count equal the recorded V7 values exactly and old/new engine payloads are identical.',
    identityNote: 'resultHash includes the engine source hash and VERSION; it changes by design. verify-v7-scope.cjs EXACT_REPEAT on recorded private outputs is engine-identity bound and would report the identity change, not a calculation change.' },
  newTypes: car,
  consumers: { research: ['scripts/quant/run-research.cjs', 'scripts/quant/run-v7-real-studies.cjs', 'scripts/quant/verify-v7-scope.cjs', 'scripts/quant/verify-research-portfolio.py', 'quant/tests/research-portfolio.test.mjs', 'quant/tests/research-v7-scope.test.mjs', 'quant/tests/research-adversarial.test.mjs'],
    productReadPaths: 'none (no workflow, core, discover, frontend or product data producer requires research-portfolio.cjs)' },
  certification: 'NOT_CERTIFIED', productionApproved: false,
};
fs.mkdirSync(path.dirname(path.resolve(arg('out'))), { recursive: true });
fs.writeFileSync(path.resolve(arg('out')), JSON.stringify(evidence, null, 1) + '\n');
console.log(JSON.stringify({ unchanged: evidence.unchanged.summary, parity: car.parity.status }));
