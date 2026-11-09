#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – applies the final-selection rule (stated in registration-1.0.0 and candidates-frozen-1.0.0,
// i.e. before VALIDATION) mechanically to validation-results-1.0.0 and writes final-hypotheses-frozen-1.0.0.json (R3).
const path = require('node:path');
const L = require('./lib.cjs');

function main() {
  const cand = L.readJson(path.join(L.DOCS, 'candidates-frozen-1.0.0.json')), val = L.readJson(path.join(L.DOCS, 'validation-results-1.0.0.json'));
  const rule = cand.finalSelectionRule;
  const rows = val.results.map(r => ({ id: r.id, family: r.family, variantId: r.variantId, spec: r.spec,
    exSpy: r.excess.vsSpy.annualisedMean, exOwn: r.excess.vsOwnUniverseEw.annualisedMean, stressExSpy: r.stress.excessVsSpyAnnualised,
    holmP: r.excess.vsSpy.holmAdjustedP, pSpy: r.excess.vsSpy.pValue, pOwn: r.excess.vsOwnUniverseEw.pValue }));
  for (const r of rows) r.eligible = r.exSpy > 0 && r.exOwn > 0 && r.stressExSpy > 0;
  const rank = (a, b) => a.holmP - b.holmP || a.pOwn - b.pOwn || (a.id < b.id ? -1 : 1);
  const chosen = [], perFam = {};
  for (const r of rows.filter(x => x.eligible).sort(rank)) { if (chosen.length >= 3) break; if ((perFam[r.family] || 0) >= 2) { r.notChosenReason = 'MAX_2_PER_FAMILY'; continue; } chosen.push({ ...r, label: 'VALIDATION_ELIGIBLE' }); perFam[r.family] = (perFam[r.family] || 0) + 1; }
  if (chosen.length < 2) for (const fam of ['PRICE', 'FUND']) { if (chosen.length >= 3 || perFam[fam]) continue; const best = rows.filter(x => x.family === fam && !chosen.some(c => c.id === x.id)).sort(rank)[0]; if (best) { chosen.push({ ...best, label: 'DIAGNOSTIC_NOT_VALIDATED' }); perFam[fam] = 1; } }
  const doc = { schemaVersion: 'v11-discovery-final-hypotheses-frozen-1.0.0', studyId: L.STUDY_ID + ':FINAL', rule: 'R3', frozenBeforeAnyTestOutcome: true, protocolSha256: L.protocolHash(),
    selectionCriteria: rule, criteriaStatedIn: ['docs/quant-recovery/v11/discovery/registration-1.0.0.json (commit 7f0d20e9e1)', 'docs/quant-recovery/v11/discovery/candidates-frozen-1.0.0.json (commit 05ca5f85ed)'],
    evidenceUsed: 'TRAIN (exploration log) + VALIDATION (validation-results-1.0.0.json, computed once)',
    validationSummary: { holmRejectionsPrimary: { PRICE: 0, FUND: 0 }, holmRejectionsSecondary: { PRICE: 0, FUND: 0 }, note: 'No candidate has a statistically secured excess in VALIDATION. The hypotheses below carry an OBSERVED, not secured, VALIDATION excess.' },
    eligibility: rows.map(({ spec, ...r }) => r),
    hypotheses: chosen.map((c, k) => ({ hypothesisId: 'H' + (k + 1), family: c.family, candidateId: c.id, variantId: c.variantId, label: c.label, spec: c.spec,
      validation: { exSpyAnnualised: c.exSpy, holmAdjustedP: c.holmP, exOwnEwAnnualised: c.exOwn, pOwn: c.pOwn, stressExSpyAnnualised: c.stressExSpy },
      testPeriod: L.protocol().periods[c.family === 'FUND' ? 'fundamentalRules' : 'priceRules'].TEST })),
    testPlan: { computedOnceAndReportedUnconditionally: true, primaryEndpoint: 'weekly excess vs SPY (base costs), block bootstrap 26 w, Holm over the frozen hypotheses', secondary: 'vs own-universe EW (Holm), stress costs, first year separately, delisting bounds (-100 %, sourced cash), research-portfolio ledger parity',
      capWeightedBenchmark: 'plausibility filter 1.0.1 (fixed before TEST; see validation-capweight-correction-1.0.1.json)', attribution: 'attribution.cjs on VALIDATION and TEST paths' },
    priorExposureNote: 'TEST years 2021-2025 were part of the V10 full-period factor reconstruction (positive ICs for quality/profitability known); a TEST success is time-separated, not confirmatory forward evidence.',
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  L.writeJson(path.join(L.DOCS, 'final-hypotheses-frozen-1.0.0.json'), doc);
  console.log(chosen.map(c => c.id + ' ' + c.variantId + ' ' + c.label).join('\n'), '\neligible', rows.filter(r => r.eligible).map(r => r.id + (r.notChosenReason ? '(' + r.notChosenReason + ')' : '')).join(' '));
}
main();
