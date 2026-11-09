#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – post-hoc BENCHMARK correction for VALIDATION (strategies unchanged, validation-results untouched):
// the PIT cap-weighted population of validation-results-1.0.0 used unfiltered V10 panel market caps, which contain
// XBRL scale errors (ON 3.5e18 USD 2013, YUM 2.4e22 USD 2017) and is invalid. Recomputed with plausibility filter 1.0.1.
const path = require('node:path');
const L = require('./lib.cjs'), R = require('./rules.cjs');

function main() {
  const paths = L.readJson(path.join(L.PRIVATE, 'validation-paths.json.gz'));
  const ctx = L.buildContext({ withPanel: true });
  const out = [];
  for (const [id, p] of Object.entries(paths)) {
    const sch = { decisions: p.decisions.map(d => ctx.calIndex.get(d)), endExec: ctx.calIndex.get(p.endExec) };
    const cap = L.simulate(ctx, R.capWeightStrategy(ctx, { plausible: true }), { ...sch, costs: L.COSTS.base, record: false });
    const ce = cap.equity, se = p.equity, dates = se.slice(1).map(e => e[0]);
    const rs = se.slice(1).map((e, k) => e[1] / se[k][1] - 1), rc = ce.slice(1).map((e, k) => e.value / ce[k].value - 1);
    const inf = L.blockInference(dates, rs.map((x, k) => x - rc[k]), L.INFERENCE.blockLengthWeeks);
    const m = L.pathMetrics(ce.map(e => e.value), ce.map(e => e.date)), sm = L.pathMetrics(se.map(e => e[1]), se.map(e => e[0]));
    out.push({ id, capWeightedCagr: m.cagr, capWeightedMaxDrawdown: m.maxDrawdown, avgNames: L.mean(ce.map(e => e.n)), strategyCagr: sm.cagr, excessCagr: sm.cagr - m.cagr, excessWeekly: { annualisedMean: inf.estimate * 52, pValue: inf.pValue, ci: inf.ci } });
    console.error(id, (m.cagr * 100).toFixed(2), (inf.estimate * 52 * 100).toFixed(2), inf.pValue);
  }
  L.writeJson(path.join(L.DOCS, 'validation-capweight-correction-1.0.1.json'), { schemaVersion: 'v11-discovery-capweight-correction-1.0.1', period: 'VALIDATION', protocolSha256: L.protocolHash(), postHoc: true,
    reason: 'Benchmark invalid in validation-results-1.0.0 (unfiltered panel market caps with XBRL scale errors). Strategies, candidate choice and Holm families are unchanged; this only replaces a descriptive benchmark. Residual known error: ADS share counts (e.g. HSBC) remain.',
    filter: 'cap <= 5e12 USD and implied share-count change within 0.2..5x versus the panel value 12 rank dates earlier (past information only)', returnBasis: 'PRICE_RETURN', costs: L.COSTS.base, results: out, certificationStatus: 'NOT_CERTIFIED', productionApproved: false });
}
main();
