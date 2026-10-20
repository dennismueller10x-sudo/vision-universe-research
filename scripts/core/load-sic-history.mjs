// Laedt die historische SIC-Basis (quant/data/sec/sic-history) fuer
// core/industry-classification.js. Nur die Shards der angefragten CIKs werden
// gelesen; ohne `ciks` alle. Kein Netz, kein Schreiben.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const IC = require('../../core/industry-classification.js');
export const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'quant', 'data', 'sec', 'sic-history');

export function loadSicHistory({ dir = DEFAULT_DIR, ciks = null } = {}) {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const codes = existsSync(join(dir, 'sic-codes.json')) ? JSON.parse(readFileSync(join(dir, 'sic-codes.json'), 'utf8')).codes : {};
  const wanted = ciks ? new Set([...ciks].map(IC.normalizeCik).filter(Boolean)) : null;
  const shards = wanted ? [...new Set([...wanted].map(IC.shardOf))] : readdirSync(join(dir, 'issuers')).filter((f) => f.endsWith('.json.gz')).map((f) => f.slice(0, 3));
  const issuers = {};
  for (const s of shards.sort()) {
    const file = join(dir, 'issuers', `${s}.json.gz`);
    if (!existsSync(file)) continue;
    const payload = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
    for (const [cik, rec] of Object.entries(payload.issuers)) if (!wanted || wanted.has(cik)) issuers[cik] = rec;
  }
  return IC.create({ issuers, codes, index });
}
