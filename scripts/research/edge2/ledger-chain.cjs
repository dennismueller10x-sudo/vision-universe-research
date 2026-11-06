'use strict';
// Nur angehängtes, hash-verkettetes JSONL-Ledger (Edge 2: Papierdepot EDGE2-PAPER, KI-Depot). Forschung, nicht zertifiziert.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function ledger(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []; }
/** Prüft die ganze Kette und hängt einen Eintrag an. */
function append(entry, file, depot) {
  if (!file || !depot) throw Error('LEDGER_FILE_AND_DEPOT_REQUIRED');
  const rows = ledger(file);
  let prev = 'GENESIS';
  for (const r of rows) { const { hash, ...body } = r; if (body.prevHash !== prev || sha(JSON.stringify(body)) !== hash) throw Error('LEDGER_CHAIN_BROKEN at ' + r.seq); prev = hash; }
  const body = { seq: rows.length + 1, depot, prevHash: prev, recordedAt: new Date().toISOString(), ...entry };
  const row = { ...body, hash: sha(JSON.stringify(body)) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
  return row;
}
module.exports = { ledger, append };
