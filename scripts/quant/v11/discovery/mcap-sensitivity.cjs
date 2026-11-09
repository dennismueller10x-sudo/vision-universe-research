#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – market-cap plausibility: counts implausible PIT panel market caps per rank date (rule 1.0.1) and
// reports, as a SENSITIVITY ONLY (frozen sets unchanged), the FUND candidates (VALIDATION) and hypotheses (TEST)
// with the >= 300 Mio USD universe filter evaluated on plausibility-filtered caps. Value scores stay as in the panel.
const path = require('node:path');
const L = require('./lib.cjs'), R = require('./rules.cjs'), E = require('./evaluate.cjs');

function main() {
  const ctx = L.buildContext({ withPanel: true });
  const counts = ctx.fund.js.map(j => {
    const fd = ctx.fund.byJ.get(j); let withCap = 0, implausible = 0, huge = 0; const ex = [];
    for (const [id, r] of fd.rows) { if (!L.finite(r.mcap)) continue; withCap++; if (r.mcap > 5e12) huge++; if (R.plausibleCap(ctx, fd, id, j) === null) { implausible++; if (ex.length < 5 && r.mcap > 5e12) ex.push([id, r.mcap]); } }
    return { date: ctx.cal[j], withCap, implausible, above5e12: huge, examples: ex };
  });
  const cand = L.readJson(path.join(L.DOCS, 'candidates-frozen-1.0.0.json')), fin = L.readJson(path.join(L.DOCS, 'final-hypotheses-frozen-1.0.0.json'));
  const proto = L.protocol().periods.fundamentalRules, sens = [];
  const items = [...cand.families.FUND.candidates.map(c => ['VALIDATION', c.candidateId, c.spec]), ...fin.hypotheses.map(h => ['TEST', h.hypothesisId, h.spec])];
  for (const [stage, id, spec] of items) {
    const [a, b] = proto[stage];
    const base = E.evaluateSpec(ctx, spec, a, b, { stress: false }), alt = E.evaluateSpec(ctx, { ...spec, plausibleMcap: true }, a, b, { stress: false });
    sens.push({ stage, id, variantId: spec.id, frozen: { cagr: base.strategy.cagr, exVsSpyAnn: base.excess.vsSpy.annualisedMean, pSpy: base.excess.vsSpy.pValue }, plausibleCapUniverse: { cagr: alt.strategy.cagr, exVsSpyAnn: alt.excess.vsSpy.annualisedMean, pSpy: alt.excess.vsSpy.pValue } });
    console.error(stage, id, (base.strategy.cagr * 100).toFixed(2), '->', (alt.strategy.cagr * 100).toFixed(2));
  }
  L.writeJson(path.join(L.DOCS, 'mcap-plausibility-sensitivity-1.0.0.json'), { schemaVersion: 'v11-discovery-mcap-sensitivity-1.0.0', protocolSha256: L.protocolHash(), rule: 'plausibility 1.0.1: cap <= 5e12 USD and implied share count within 0.2..5x of the panel value 12 rank dates earlier',
    disclosure: 'Rule fixed after VALIDATION (when the cap-weighted benchmark exposed the errors), before TEST. Frozen candidate and hypothesis specifications were NOT changed; this file is a sensitivity only. Value/yield scores in the panel that use the erroneous caps are not recomputed.',
    countsPerRankDate: counts, totals: { rankDates: counts.length, capRows: counts.reduce((s, c) => s + c.withCap, 0), implausibleRows: counts.reduce((s, c) => s + c.implausible, 0), above5e12Rows: counts.reduce((s, c) => s + c.above5e12, 0) },
    sensitivity: sens, certificationStatus: 'NOT_CERTIFIED', productionApproved: false });
}
main();
