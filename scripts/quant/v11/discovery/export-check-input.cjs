#!/usr/bin/env node
'use strict';
// V11 DISCOVERY – exports raw inputs (loader output: weekly split-adjusted closes after CA/lifecycle qualification,
// provider split factors, listing start, SPY closes, PIT panel scores/market caps) for the independent Python
// recomputation. Only inputs; no strategy result is exported. Usage: node export-check-input.cjs [--out <file>]
const path = require('node:path');
const L = require('./lib.cjs');

function main() {
  const a = process.argv.slice(2), out = a.includes('--out') ? a[a.indexOf('--out') + 1] : path.join(L.PRIVATE, 'python-check-input.json.gz');
  const ctx = L.buildContext({ withPanel: true });
  const listings = ctx.listings.map(l => ({ id: l.id, cal0: l.cal0, listingStart: l.listingStart, closes: Array.from(l.closes), splits: (ctx.fr.docs.get(l.id).corporateActions?.splits || []) }));
  const panel = ctx.fund.js.filter(j => ctx.cal[j] >= '2016-12-01').map(j => { const fd = ctx.fund.byJ.get(j); return { date: ctx.cal[j], rows: [...fd.rows].map(([id, r]) => [id, r.q ?? null, r.p ?? null, r.mcap ?? null]) }; });
  L.writeJson(out, { calendar: ctx.cal, spy: Array.from(ctx.spy).map(v => Number.isFinite(v) ? v : null), listings, panel, manifestHash: ctx.manifestHash }, true);
  console.log('exported', listings.length, 'listings', panel.length, 'rank dates');
}
main();
