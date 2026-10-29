#!/usr/bin/env node
/* V12 LARGECAP effect step 2: index coverage per fund date under the three option sets. Runs the unchanged INDEXPOP producer
 * scripts/quant/v12/indexpop/build-outputs.cjs (rules 1.2.0) once per option set on the INDEXPOP private snapshots/mapping and the
 * qualified-<tag>.json of qualify-sets.cjs, each into a private work directory, and condenses its coverage-1.2.0.json.
 *   node scripts/quant/v12/largecap/coverage.cjs --indexpop-private <dir> --private-dir <dir> --out docs/quant-recovery/v12/largecap/coverage-1.0.0.json */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const IP = arg('--indexpop-private'), PRIV = arg('--private-dir'), OUT = arg('--out');
const TAGS = ['base3', 'v10', 'v12'];
const cov = {};
for (const t of TAGS) {
  const w = path.join(PRIV, 'cov-' + t), work = path.join(w, 'work'), od = path.join(w, 'out');
  fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(od, { recursive: true });
  for (const f of ['snapshots.json', 'mapping-1.2.0.json']) { const l = path.join(work, f); if (!fs.existsSync(l)) fs.symlinkSync(path.join(IP, 'work', f), l); }
  fs.copyFileSync(path.join(PRIV, 'qualified-' + t + '.json'), path.join(work, 'qualified.json'));
  execFileSync(process.execPath, ['--max-old-space-size=8000', path.join(ROOT, 'scripts/quant/v12/indexpop/build-outputs.cjs'), '--rules', '1.2.0', '--mapping', 'mapping-1.2.0.json',
    '--private', w, '--out-dir', od, '--no-register'], { stdio: ['ignore', 'ignore', 'inherit'] });
  cov[t] = JSON.parse(fs.readFileSync(path.join(od, 'coverage-1.2.0.json'), 'utf8'));
}
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/indexpop/coverage-1.2.0.json'), 'utf8'));
const key = c => c.fund + '|' + c.date;
const byTag = Object.fromEntries(TAGS.map(t => [t, new Map(cov[t].dates.map(c => [key(c), c]))]));
// base3 must reproduce the committed INDEXPOP coverage exactly (same producer, same inputs)
const refMap = new Map(ref.dates.map(c => [key(c), c]));
const reproduced = cov.base3.dates.every(c => JSON.stringify(c) === JSON.stringify(refMap.get(key(c)))) && cov.base3.dates.length === ref.dates.length;
const funds = ['SPY', 'QQQ', 'DIA', 'IWB'];
const perDate = cov.base3.dates.filter(c => funds.includes(c.fund) && c.date >= '2015-01-01').map(c => {
  const r = { fund: c.fund, date: c.date, members: c.members, mappedPctN: c.mappedPctN, mappedPctW: c.mappedPctW };
  for (const t of TAGS) { const x = byTag[t].get(key(c)); r[t] = [x.coveredPctN, x.coveredPctW]; }
  r.qualifies95_99 = Object.fromEntries(TAGS.map(t => [t, byTag[t].get(key(c)).qualifies]));
  return r;
});
const summary = {};
for (const f of funds) {
  summary[f] = {};
  for (const t of TAGS) {
    const a = cov[t].assessment[f];
    summary[f][t] = { qualifyingDates_95_99: a.thresholds.n95_w99.qualifyingDates, contiguousFrom_95_99: a.thresholds.n95_w99.contiguousToLastDateFrom,
      n90_w97: a.thresholds.n90_w97, byYear: Object.fromEntries(Object.entries(a.byYear).filter(([y]) => y >= '2015').map(([y, v]) => [y, [v.coveredPctN, v.coveredPctW]])) };
  }
  summary[f].topUncoveredSince2019H2_v12 = cov.v12.assessment[f].topUncoveredSince2019H2.slice(0, 15);
}
fs.writeFileSync(OUT, JSON.stringify({ schemaVersion: 'v12-largecap-coverage-1.0.0', producer: 'scripts/quant/v12/indexpop/build-outputs.cjs (rules 1.2.0, unchanged)',
  evidenceKind: 'RECONSTRUCTION', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
  optionSets: Object.fromEntries(TAGS.map(t => [t, cov[t].loaderOptions || null])), base3ReproducesIndexpopCoverage120: reproduced,
  columns: { perDate: 'base3|v10|v12 = [coveredPctN, coveredPctW]; mappedPct* = every T1/T2-mapped member counted (upper bound)' },
  summary, perDate }, null, 1) + '\n');
console.log(JSON.stringify({ reproduced, SPY: Object.fromEntries(TAGS.map(t => [t, summary.SPY[t].qualifyingDates_95_99])) }));
