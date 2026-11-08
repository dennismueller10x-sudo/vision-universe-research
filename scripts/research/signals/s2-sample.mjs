#!/usr/bin/env node
// E4/S2: vorregistrierte Zufallsstichprobe aus committeten Listen (deterministisch, Seed fest).
// Heutige Titel: quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json (COMMON_STOCK). Delistete: V13-Register 1.0.0, QUALIFIED.
// Schichtung im Verhältnis der beiden Grundgesamtheiten.
//   node scripts/research/signals/s2-sample.mjs --size 1000 --seed 20261105 --out docs/research/signals/s2/sample.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const size = Number(arg('--size', 500)), seed = Number(arg('--seed', 20261105)), out = arg('--out');
const sha = b => createHash('sha256').update(b).digest('hex');
const uFile = 'quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json', rFile = 'docs/quant-recovery/v13/delisted/register-1.0.0.json';
const uBytes = readFileSync(join(ROOT, uFile)), rBytes = readFileSync(join(ROOT, rFile));
// Vorzugsaktien sind im Universum teils als COMMON_STOCK geführt (Ticker „X-P-Y“); sie werden per festem Muster ausgeschlossen.
const PREFERRED = /-P(-|$)/;
const commons = JSON.parse(uBytes).securities.filter(s => s.instrumentType === 'COMMON_STOCK');
const current = commons.filter(s => !PREFERRED.test(s.ticker)).map(s => s.securityId).sort();
const excludedPreferred = commons.length - current.length;
const reg = JSON.parse(rBytes), ix = Object.fromEntries(reg.columns.map((c, i) => [c, i]));
const delisted = reg.rows.filter(r => r[ix.status] === 'QUALIFIED').map(r => 'dl_' + r[ix.chainId]).sort();
function rng(s) { let x = s >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function draw(list, n, r) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n).sort(); }
const nd = Math.round(size * delisted.length / (current.length + delisted.length)), nc = size - nd, r = rng(seed);
const doc = { schema: 'e4-signals-s2-sample-1.0.0', seed, size, population: { current: current.length, delisted: delisted.length, excludedPreferred, preferredPattern: PREFERRED.source },
  sources: { [uFile]: sha(uBytes), [rFile]: sha(rBytes) }, drawn: { current: nc, delisted: nd }, ids: [...draw(current, nc, r), ...draw(delisted, nd, r)] };
if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(doc, null, 1) + '\n'); }
console.log(JSON.stringify({ size, drawn: doc.drawn, population: doc.population }));
