#!/usr/bin/env node
// Strang G: Insider-Käufe (Form 4) Point-in-Time aus den SEC Insider Transactions Data Sets. Forschung, nicht zertifiziert.
//
//   node scripts/research/labor/build-insider.mjs --datasets DIR --fund-index FILE --out FILE
//
// DIR enthält YYYYqQ_form345.zip (oder je Quartal ein Verzeichnis mit den TSV-Dateien, Fixtures). Extraktion unverändert über
// scripts/market/build-ownership-signals.mjs#extractInsiderDataset (Form 4 ohne Änderungen). Labor-Regel (Protokoll §4, §6):
// Transaktionscode P, meldende Person Director oder Officer, sichtbar ab Einreichungsdatum; Zuordnung über die Emittenten-CIK
// zu den securityIds des PIT-Fundamentalindex (index.json aus build_pit_fundamentals.py, enthält delistete Ketten).
// Ausgabe: { schema, quarters, missing, events: { securityId: [[filed, ownerCik, valueUsd], ...] } }. Schreibt nur --out.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const E = require(path.join(ROOT, 'quant/engines/ownership-signals.js'));
export const VERSION = 'labor-insider-1.0.0';
const MASK = 1 | 2; // DIRECTOR | OFFICER (ownership-signals.js REL)

export function quarterList(from, to) {
  const out = []; let [y, q] = from.split('q').map(Number); const [y1, q1] = to.split('q').map(Number);
  while (y < y1 || (y === y1 && q <= q1)) { out.push(`${y}q${q}`); q++; if (q > 4) { q = 1; y++; } }
  return out;
}

export function eventsFromAccessions(accessions, cikToIds, into = new Map(), stats = { purchases: 0, unmapped: 0, notInsider: 0 }) {
  for (const a of Object.values(accessions)) {
    const owners = a.o.filter(([, bits]) => bits & MASK).map(([c]) => c);
    const buys = a.x.filter(x => x[0] === 'P');
    if (!buys.length) continue;
    if (!owners.length) { stats.notInsider++; continue; }
    const ids = cikToIds.get(String(a.i).padStart(10, '0'));
    if (!ids) { stats.unmapped++; continue; }
    const value = buys.reduce((s, x) => s + (Number.isFinite(x[3]) ? x[3] : 0), 0);
    const filed = E.isoOf(a.f);
    stats.purchases++;
    for (const id of ids) {
      if (!into.has(id)) into.set(id, []);
      // Wert einmal je Einreichung (erste meldende Person), weitere Personen zählen nur als Käufer.
      owners.forEach((o, k) => into.get(id).push([filed, o, k === 0 ? value : 0]));
    }
  }
  return { into, stats };
}

export function cikIndex(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')), out = new Map();
  for (const [cik, e] of Object.entries(doc.issuers || {})) if (e.securityIds && e.securityIds.length) out.set(String(cik).padStart(10, '0'), e.securityIds);
  return out;
}

async function main() {
  const a = {}; const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!a.datasets || !a['fund-index'] || !a.out) { console.error('--datasets, --fund-index, --out'); process.exit(2); }
  if (path.resolve(a.out).startsWith(ROOT)) { console.error('OUT_INSIDE_REPOSITORY'); process.exit(2); }
  const { extractInsiderDataset } = await import(path.join(ROOT, 'scripts/market/build-ownership-signals.mjs'));
  const cikToIds = cikIndex(a['fund-index']);
  const names = fs.readdirSync(a.datasets).map(f => (/^(\d{4}q[1-4])/.exec(f) || [])[1]).filter(Boolean);
  const want = quarterList(a.from || '2006q1', a.to || names.sort().at(-1));
  const into = new Map(), stats = { purchases: 0, unmapped: 0, notInsider: 0 }, missing = [], quarters = [];
  for (const q of want) {
    const zip = path.join(a.datasets, q + '_form345.zip'), dir = path.join(a.datasets, q);
    const handle = fs.existsSync(zip) ? { zip } : fs.existsSync(dir) ? { dir } : null;
    if (!handle) { missing.push(q); continue; }
    const r = await extractInsiderDataset(handle);
    eventsFromAccessions(r.accessions, cikToIds, into, stats);
    quarters.push({ q, submissions: r.stats.submissions, transactions: r.stats.transactions });
    console.log(JSON.stringify({ q, ...r.stats }));
  }
  const events = {};
  for (const [id, ev] of [...into].sort((x, y) => (x[0] < y[0] ? -1 : 1))) events[id] = ev.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : 1));
  fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify({ schema: VERSION, quarters, missing, stats, securities: Object.keys(events).length, events }));
  console.log(JSON.stringify({ out: a.out, quarters: quarters.length, missing, stats, securities: Object.keys(events).length }));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
