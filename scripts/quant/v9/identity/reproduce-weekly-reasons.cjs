#!/usr/bin/env node
/* V9 identity: reproduce per-id weekly qualification reasons via the unchanged
 * weekly-real-adapter createLoader. Read-only; writes only to --out. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const { createLoader } = require(path.join(root, 'quant/engines/weekly-real-adapter.cjs'));
const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
if (!args.includes('--out') || !out) { console.error('usage: --out <file>'); process.exit(2); }
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const loader = createLoader(root);
const rows = [];
const counts = {};
for (const id of ids) {
  let reason = 'QUALIFIED';
  try { loader(id); } catch (e) { reason = String(e.message).split(':')[0]; }
  counts[reason] = (counts[reason] || 0) + 1;
  rows.push({ securityId: id, reason });
}
fs.writeFileSync(out, JSON.stringify({ masterHash: loader.masterHash, total: ids.length, counts, rows }, null, 1));
console.log(JSON.stringify({ total: ids.length, counts }, null, 1));
