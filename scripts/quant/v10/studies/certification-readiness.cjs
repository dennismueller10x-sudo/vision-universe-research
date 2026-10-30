#!/usr/bin/env node
'use strict';
// V10 STUDIES – kind-specific certification readiness for SAME_STOCK_REPLAY, PATTERN_EVIDENCE, SIGNAL_BACKTEST,
// measured against the ACTIVE contract (quant/data/product/backtest-certification-v1.json, read only) and the V9
// readiness blockers. Changes no status, no gate, no contract. Usage: certification-readiness.cjs <tag> [--out file]
const fs = require('node:fs'), path = require('node:path');
const K = require('./common.cjs');

function main(tag, outFile) {
  const dir = path.join(K.DOCS_DIR, tag), read = f => K.readJson(path.join(dir, f));
  const active = K.readJson(path.join(K.ROOT, 'quant/data/product/backtest-certification-v1.json'));
  const v9 = K.readJson(path.join(K.ROOT, 'docs/quant-recovery/v9/certification-readiness-1.0.0.json'));
  const sig = read('signal-backtest-evidence.json'), fund = read('funded-strategy-evidence.json'), pat = read('pattern-evidence.json'), rep = read('same-stock-replay-evidence.json');
  const py = fs.existsSync(path.join(dir, 'python-parity.json')) ? read('python-parity.json') : null;
  const fileHash = f => K.C.shaFile(path.join(dir, f));
  const survivorshipState = sig.cells[0].survivorship.state;
  const kindOf = id => active.kinds.find(k => k.id === id);
  const sigCells = (rule, ep) => sig.cells.filter(c => c.rule === rule && c.endpoint === ep);
  const ruleRows = sig.ruleVersion ? Object.keys(sig.ruleVersion).map(rule => {
    const ex = sigCells(rule, 'SPY_EXCESS'), br = sigCells(rule, 'BASE_RATE_EXCESS');
    const both = [4, 13, 26, 52].filter(h => { const a = ex.find(c => c.horizonWeeks === h), b = br.find(c => c.horizonWeeks === h); return a.holmReject && b.holmReject && a.estimate > 0 && b.estimate > 0; });
    const sub = sigCells(rule, 'BASE_RATE_EXCESS').find(c => c.horizonWeeks === 13).subperiods.map(s => s.mean);
    return { rule, holmRejections: sig.cells.filter(c => c.rule === rule && c.holmReject).length,
      registeredAdvantageHorizons: both, economicAdvantageClaim: both.length > 0,
      baseRateExcess13wSubperiodSigns: sub.map(m => m === null ? null : Math.sign(m)), subperiodSignStable13w: sub.every(m => m !== null && Math.sign(m) === Math.sign(sub[0])) };
  }) : [];
  const measured = (state, evidence, note) => ({ state, evidence, note });
  const out = {
    schemaVersion: 'v10-studies-certification-readiness-1.0.0', loaderConfiguration: tag, activeContract: { path: 'quant/data/product/backtest-certification-v1.json', sha256: K.C.shaFile(path.join(K.ROOT, 'quant/data/product/backtest-certification-v1.json')), unchanged: true },
    v9Readiness: 'docs/quant-recovery/v9/certification-readiness-1.0.0.json', pythonParity: py ? { state: py.state, checks: py.checks, failures: py.failures } : null,
    kinds: {
      SIGNAL_BACKTEST: {
        activeStatus: kindOf('SIGNAL_BACKTEST').status, v9Blockers: v9.kinds.find(k => k.kind === 'SIGNAL_BACKTEST').blockers.map(b => b.reason),
        gates: {
          survivorship: measured(survivorshipState === 'EVALUATED' ? 'MEASURED_SENSITIVITY' : 'NOT_MET', 'signal-backtest-evidence.json cells[].survivorship', survivorshipState === 'EVALUATED' ? 'Delisted listings and censoring bounds evaluated in the main study population (requires gate owner decision whether this satisfies SURVIVORSHIP_CONTROL).' : 'Frame is a survivor cohort (no listingLifecycleEvidence yet); the gate stays FAIL.'),
          returnBasis: measured('NOT_MET_IN_THIS_STUDY', 'returnBasis PRICE_RETURN', 'The V10 study is PRICE_RETURN; the active product gate passes on the product TR study, not on this one.'),
          costs: measured('MET', 'costs.base + costSensitivity (4 points)', null), slippage: measured('MET', 'slippage 5 bps per side base, 20/30 sensitivity', null),
          benchmark: measured('MET', 'SPY_EXCESS and BASE_RATE_EXCESS (same-week control of the same population)', null),
          sample: measured('MET', 'maturedOutcomes', 'n per rule and horizon >> 3,000 with > 300 titles'),
          regimeDiversity: measured('MEASURED_NOT_CERTIFIED', 'cells[].regimes (classifyRegimes on SPY, EX_POST_DESCRIPTIVE)', 'Supplemental SPY regime split is reported; it does not certify the Market-Regime engine history the active gate refers to.'),
          independence: measured('MEASURED', 'calendar-block bootstrap (b 52/104) + two-way cluster', 'Dependence-aware inference; no claim of independent cases.'),
          oos: measured('NOT_MET', null, 'No untouched holdout; 2000-2025 is explored history (prior V7-V9 exposure).'),
          walkForward: measured('NOT_MEASURED', null, 'Not part of this registration.'),
          parameterStability: measured('NOT_MEASURED', null, 'No parameter grid (registered: no parameter search).'),
          ruleCertified: measured('NOT_MET', 'ruleAssessments', 'Certification requires all gates; no rule is certifiable from this study.')
        },
        ruleAssessments: ruleRows,
        fundedStrategy: fund.performance.map(o => ({ rule: o.rule, cagr: o.variants.base.metrics.cagr, spyCagr: o.variants.base.spy.cagr, maxDrawdown: o.variants.base.metrics.maxDrawdown, sharpe: o.variants.base.sharpe, weeklyDifferenceHolmReject: o.variants.base.weeklyDifference.holmReject })),
        certifiable: false
      },
      PATTERN_EVIDENCE: {
        activeStatus: kindOf('PATTERN_EVIDENCE').status, v9Blockers: v9.kinds.find(k => k.kind === 'PATTERN_EVIDENCE').blockers.map(b => b.reason),
        gates: {
          survivorship: measured(survivorshipState === 'EVALUATED' ? 'MEASURED_SENSITIVITY' : 'NOT_MET', 'pattern-evidence.json cells[].survivorship', survivorshipState === 'EVALUATED' ? 'Quantified (with/without delisted, bounds).' : 'Still unquantified: survivor cohort only.'),
          returnBasis: measured('NOT_MET', 'PRICE_RETURN', 'Total return not available for this population.'),
          certifiedAsBacktest: measured('UNCHANGED_STRUCTURAL', null, 'The active product pattern study declares itself a frequency evaluation; this V10 event study with same-week controls is a separate study and does not replace it.'),
          scope: measured('BROADER', 'pattern-evidence.json scopeComparison', 'V7/V8: 11 named survivors, 1 pattern; V10: whole frame, 15 registered patterns, same-week controls.'),
          engineParity: measured(Object.values(pat.engineParity.patterns).every(x => x.pass) ? 'MET' : 'NOT_MET', 'parity-engine-pattern (runPatternStudy)', null)
        },
        holmRejections: pat.multipleTesting.rejections, familySize: pat.multipleTesting.familySize, certifiable: false
      },
      SAME_STOCK_REPLAY: {
        activeStatus: kindOf('SAME_STOCK_REPLAY').status, v9Blockers: v9.kinds.find(k => k.kind === 'SAME_STOCK_REPLAY').blockers.map(b => b.reason),
        gates: {
          ruleTest: measured('MET_FOR_THE_RULE_STUDY', 'same-stock-replay-evidence.json', 'A fixed rule with hash-sampled cases, entry/exit, cooldown, costs, benchmark and matured outcomes is now tested (DESCRIPTIVE_NOT_A_TEST applies to the unchanged descriptive view, which stays as it is).'),
          survivorship: measured(survivorshipState === 'EVALUATED' ? 'MEASURED_SENSITIVITY' : 'NOT_MET', 'cells[].survivorship', 'Case selection from the frame removes hand-picking, but the frame itself is a survivor cohort unless listingLifecycleEvidence is used; SURVIVOR_BY_CONSTRUCTION of the descriptive view is unchanged.'),
          persistence: measured('MEASURED', 'persistence[]', 'Whether a stock\'s own earlier replay outcome predicts its later outcome.')
        },
        holmRejections: rep.multipleTesting.rejections, familySize: rep.multipleTesting.familySize, certifiable: false
      }
    },
    evidenceFiles: Object.fromEntries(['signal-backtest-evidence.json', 'funded-strategy-evidence.json', 'pattern-evidence.json', 'same-stock-replay-evidence.json'].map(f => [f, fileHash(f)])),
    statusChanged: false, certificationStatus: 'NOT_CERTIFIED', productionApproved: false
  };
  out.assessments = ['SIGNAL_BACKTEST', 'PATTERN_EVIDENCE', 'SAME_STOCK_REPLAY'].map(area => {
    const file = { SIGNAL_BACKTEST: 'signal-backtest-evidence.json', PATTERN_EVIDENCE: 'pattern-evidence.json', SAME_STOCK_REPLAY: 'same-stock-replay-evidence.json' }[area];
    return K.C.assessment(area, [
      { id: 'implementation', axis: 'IMPLEMENTATION_COMPLETE', state: 'PASS', reason: 'Registered study executed with existing engines', artifact: file, artifactHash: fileHash(file) },
      { id: 'parity', axis: 'METHOD_VALIDATED', state: py && py.state === 'PASS' ? 'PASS' : 'UNKNOWN', reason: 'Independent Python recomputation (computational parity, not a holdout)', ...(py && py.state === 'PASS' ? { artifact: 'python-parity.json', artifactHash: fileHash('python-parity.json') } : {}) },
      { id: 'population', axis: 'DATA_ELIGIBLE', state: survivorshipState === 'EVALUATED' ? 'UNKNOWN' : 'FAIL', reason: survivorshipState === 'EVALUATED' ? 'Lifecycle evidence used; completeness of the historical population not audited' : 'Survivor cohort, no historical population' },
      { id: 'holdout', axis: 'INDEPENDENT_EVIDENCE', state: 'FAIL', reason: 'Explored history, no untouched holdout' },
      { id: 'advantage', axis: 'ECONOMIC_ADVANTAGE', state: 'UNKNOWN', reason: 'See registered decision rule and results; not a certification input' }
    ], 'V10 STUDIES ' + tag + ': retrospective development study, PRICE_RETURN, not certified');
  });
  K.writeJson(outFile || path.join(dir, 'certification-readiness-1.0.0.json'), out);
  console.log(JSON.stringify({ written: outFile || path.join(dir, 'certification-readiness-1.0.0.json'), rules: ruleRows.map(r => [r.rule, r.economicAdvantageClaim]) }));
}
if (require.main === module) { const a = process.argv.slice(2); main(a[0] || 'ca-id', a[1] === '--out' ? a[2] : null); }
module.exports = { main };
