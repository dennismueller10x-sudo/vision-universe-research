#!/usr/bin/env node
'use strict';
// V10 FACTOR: job list for pit_docs.py - first rank date per issuer on/after its earliest weekly close. Outcome-free.
// Usage: node jobs.cjs <private_dir> [--loader-options '<json>']  -> <private_dir>/jobs.json
const fs = require('node:fs'), path = require('node:path');
const F = require('./common.cjs');
const i = process.argv.indexOf('--loader-options');
const out = F.privateDir(process.argv[2]);
const frame = F.buildFrame(F.parseLoaderOptions(i > 0 ? process.argv[i + 1] : null));
const ciks = {};
for (const l of frame.listings) {
  if (!l.cik) continue;
  const first = frame.rankDates.find(d => d >= l.points[0][0]);
  if (first && (!ciks[l.cik] || first < ciks[l.cik])) ciks[l.cik] = first;
}
fs.writeFileSync(path.join(out, 'jobs.json'), JSON.stringify({ rankDates: frame.rankDates, ciks }));
console.log(JSON.stringify({ ciks: Object.keys(ciks).length, rankDates: frame.rankDates.length }));
