#!/usr/bin/env node
// PIT-F3 Schattenprüfung (nur lesend): baut aus dem Company Master (quant/data/universe/instruments) ein Listing-Register
// (core/listing-register.js#createListingRegister) und prüft, dass es die bestehenden securityIds nicht bricht:
//   1. jede securityId des Masters löst am Stichtag (heute) auf ihren eigenen Emittenten auf (sofern aktiv und mit CIK),
//   2. Zählung: Emittenten mit mehreren Tickern (Umbenennung), Ticker mit mehreren Emittenten (Wiederverwendung), Überlappungen.
// usage: node scripts/quant/pit-listing-shadow.mjs [--out datei.json] [--as-of YYYY-MM-DD]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LR = require(join(ROOT, 'core/listing-register.js'));
const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const asOf = opt('--as-of', new Date().toISOString().slice(0, 10)), out = opt('--out', null);

const dir = join(ROOT, 'quant/data/universe/instruments');
const rows = [], skipped = { noCik: 0, badTicker: 0 };
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  for (const i of JSON.parse(readFileSync(join(dir, f), 'utf8')).instruments || []) {
    if (!i.cik) { skipped.noCik++; continue; }
    if (!require(join(ROOT, 'core/identity.js')).normalizeTicker(i.symbol)) { skipped.badTicker++; continue; }
    rows.push({ cik: i.cik, ticker: i.symbol, validFrom: i.firstTradeDate || null, validTo: i.active === false ? i.lastTradeDate || i.delistedAt || null : null });
  }
}
const reg = LR.createListingRegister(rows), census = reg.census();
let ok = 0, ambiguous = 0, unknown = 0, wrong = 0;
for (const r of rows) {
  const res = reg.resolve(r.ticker, asOf);
  if (r.validTo && r.validTo < asOf) continue; // beendete Listings sind am Stichtag erwartbar unbekannt
  if (res.status === 'OK') (res.issuerId === LR.issuerIdForCik(r.cik) ? ok++ : wrong++);
  else if (res.status === 'AMBIGUOUS') ambiguous++; else unknown++;
}
const report = { asOf, instrumentsWithCik: rows.length, skipped, listings: reg.size, renamedIssuers: census.renamedIssuers.length, reusedSecurityIds: census.reusedSecurityIds.length,
  activeResolution: { ok, ambiguous, unknown, wrongIssuer: wrong }, examples: { renamed: census.renamedIssuers.slice(0, 5), reused: census.reusedSecurityIds.slice(0, 5) } };
console.log(JSON.stringify(report, null, 1));
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
process.exitCode = wrong ? 1 : 0;
