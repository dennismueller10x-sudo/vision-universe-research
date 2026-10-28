#!/usr/bin/env node
'use strict';
// V11 DECOMPOSITION - supplementary diagnostic (not in registration 1.0.0, disclosed as such): CAGR of passive
// equal-weighted population indices over exactly the funded-strategy sessions, to separate the funded excess vs SPY
// into "population (equal weight / survivor cohort)" and "selection". Weekly rebalanced EW index (no costs) over
// (a) the whole frame (listings observed in consecutive weeks) and (b) the funded universe (V10 funded rule: no
// calendar gap, series reaching the last strategy session = survivors to 2026).
// Usage: node population-index.cjs --out <private dir>
const path = require('node:path');
const K = require('../../v10/studies/common.cjs');
const E = require('./events.cjs');
const PF = require('./portfolio.cjs');
const { readRegistration } = require('./register.cjs');

function main() {
  const i = process.argv.indexOf('--out'); if (i < 0) throw Error('OUT_REQUIRED');
  const out = K.privateDir(process.argv[i + 1]), reg = readRegistration(), R = reg.registration;
  const ctx = E.context(R), pr = PF.prepare({ ...ctx, studyCalendar: ctx.studyCalendar }, 'NEW_52W_HIGH', 13);
  const cal = ctx.fr.calendar, j0 = pr.jFirst, j1 = pr.lastSession;
  const years = (Date.parse(cal[j1]) - Date.parse(cal[j0])) / (365.2425 * 86400000);
  const idx = (panel, cost = 0) => {
    let I = 1; const T = ctx.T, s = new Float64Array(T), n = new Float64Array(T);
    for (const p of panel) for (let k = 1; k < p.closes.length; k++) { if (p.cal[k] !== p.cal[k - 1] + 1 || p.dates[k - 1] < p.listingStart) continue; s[p.cal[k]] += p.closes[k] / p.closes[k - 1] - 1; n[p.cal[k]]++; }
    for (let c = j0 + 1; c <= j1; c++) I *= 1 + (n[c] ? s[c] / n[c] : 0);
    return { cagr: I ** (1 / years) - 1, meanMembers: K.mean(Array.from(n.slice(j0 + 1, j1 + 1))) };
  };
  const spy = (ctx.benchmark.byDate.get(cal[j1]) / ctx.benchmark.byDate.get(cal[j0])) ** (1 / years) - 1;
  const res = { schemaVersion: 'v11-decomposition-population-index-1.0.0', registrationHash: reg.registrationHash, supplementary: 'NOT_IN_REGISTRATION_1.0.0 (added after seeing the A3 results; diagnostic only)',
    from: cal[j0], to: cal[j1], years, spyPriceCagr: spy, ewFrameIndex: idx(ctx.panel), ewFundedUniverseIndex: idx(pr.universe), fundedUniverseListings: pr.universe.length,
    definition: 'weekly rebalanced equal-weighted mean of weekly price returns, no costs; NOT a buy-and-hold portfolio (rebalancing bonus / bid-ask bounce of small caps included)' };
  K.writeJson(path.join(out, 'population-index.json'), res);
  console.log(JSON.stringify(res));
}
main();
