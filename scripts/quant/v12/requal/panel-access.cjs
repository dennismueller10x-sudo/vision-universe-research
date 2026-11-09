'use strict';
// V12 REQUAL - streaming access to the private V10/V12-MCAP factor panels (panel.jsonl.gz, format of scripts/quant/v10/factor/panel.cjs).
// Reads only the requested rank dates. Outcome-free.
const fs = require('node:fs'), zlib = require('node:zlib'), readline = require('node:readline'), crypto = require('node:crypto');

async function readPanelDates(file, wanted) {
  const want = new Set(wanted), out = new Map(); let header = null;
  const hash = crypto.createHash('sha256');
  const raw = fs.createReadStream(file); raw.on('data', b => hash.update(b));
  const rl = readline.createInterface({ input: raw.pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    if (!header) { header = JSON.parse(line); continue; }
    if (!line.startsWith('{"date":"')) continue;
    const d = line.slice(9, 19); if (!want.has(d)) continue;
    const x = JSON.parse(line), ids = header.componentIds;
    out.set(d, new Map(x.rows.map(([id, scores, vec, template, marketCap]) => [id, { id, scores, template, marketCap, raws: Object.fromEntries(ids.map((c, k) => [c, vec[k]]).filter(([, v]) => v !== null)) }])));
  }
  return { header, byDate: out, sha256: hash.digest('hex') };
}
/** Latest rank date in [t0 - maxDays, t0]. */
function rankDateFor(rankDates, t0, maxDays) {
  let best = null; for (const r of rankDates) if (r <= t0) best = r; else break;
  if (!best) return null;
  return (Date.parse(t0) - Date.parse(best)) / 86400000 <= maxDays ? best : null;
}
module.exports = { readPanelDates, rankDateFor };
