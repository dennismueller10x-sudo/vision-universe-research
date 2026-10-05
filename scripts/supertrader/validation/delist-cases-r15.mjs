#!/usr/bin/env node
// Supertrader R15 – Regressionsfaelle der Delisting-Buchung (R14: DESP, BEL, HLAH, HIII, BSKY).
// Holt je Fall die SEC-Einreichungsliste (Formular, Datum) und den SIC-Code und haelt fest,
// warum der R13-Klassifikator scheiterte (keine CIK-Zuordnung vs. kein Uebernahmeformular).
// Ausgabe: verschluesselt (SEC-Metadaten sind oeffentlich; einheitlich mit den uebrigen Laeufen).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { classifyDelisting, normName } from './sec-pit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const UA = 'VisionUniverse-Research/1.0 (method fidelity review; info@visionuniverse.de)';
export const CASES = [
  { id: 'tiingo:NYSE:DESP:2017-09-20', listEnd: '2025-05-15', names: ['Despegar.com, Corp.', 'Despegar com Corp'] },
  { id: 'tiingo:NYSE:BEL:2000-08-03', listEnd: '2019-04-17', names: ['Belmond Ltd.', 'Orient-Express Hotels Ltd'] },
  { id: 'tiingo:NASDAQ:HLAH:2021-03-18', listEnd: '2022-12-14', names: ['Hamilton Lane Alliance Holdings I, Inc.'] },
  { id: 'tiingo:NASDAQ:HIII:2021-04-20', listEnd: '2022-12-21', names: ['Hudson Executive Investment Corp. III'] },
  { id: 'tiingo:NASDAQ:BSKY:2021-07-01', listEnd: '2022-12-12', names: ['Big Sky Growth Partners, Inc.'] },
];

async function main() {
  const OUT = process.argv[process.argv.indexOf('--out') + 1] || path.join(os.tmpdir(), 'r15');
  fs.mkdirSync(OUT, { recursive: true });
  const lookup = await (await fetch('https://www.sec.gov/Archives/edgar/cik-lookup-data.txt', { headers: { 'User-Agent': UA } })).text();
  const byName = new Map();
  for (const line of lookup.split('\n')) { const m = line.match(/^(.*):(\d{10}):\s*$/); if (!m) continue; const k = normName(m[1]); if (k) (byName.get(k) || byName.set(k, new Set()).get(k)).add(m[2]); }
  const out = [];
  for (const c of CASES) {
    const ciks = [...new Set(c.names.flatMap((n) => [...(byName.get(normName(n)) || [])]))];
    const cands = [];
    for (const cik of ciks.slice(0, 6)) {
      const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': UA } });
      if (!r.ok) { cands.push({ cik, status: r.status }); continue; }
      const j = await r.json();
      const fl = { form: [...(j.filings?.recent?.form || [])], filingDate: [...(j.filings?.recent?.filingDate || [])] };
      for (const f of j.filings?.files || []) { const r2 = await fetch(`https://data.sec.gov/submissions/${f.name}`, { headers: { 'User-Agent': UA } }); if (r2.ok) { const j2 = await r2.json(); fl.form.push(...(j2.form || [])); fl.filingDate.push(...(j2.filingDate || [])); } }
      const lo = Date.parse(c.listEnd) - 450 * 864e5, hi = Date.parse(c.listEnd) + 60 * 864e5;
      const win = fl.form.map((f, i) => [f, fl.filingDate[i]]).filter(([, d]) => Date.parse(d) >= lo && Date.parse(d) <= hi);
      cands.push({ cik, name: j.name, sic: j.sic, sicDescription: j.sicDescription, category: j.category || null, entityType: j.entityType || null, filingsInWindow: win, r13: classifyDelisting(fl, c.listEnd).cls });
      await new Promise((res) => setTimeout(res, 150));
    }
    out.push({ ...c, normalized: c.names.map(normName), cikCandidates: ciks, candidates: cands });
    console.log(`[r15-delist] ${c.id.split(':')[2]}: Kandidaten ${ciks.length}`);
  }
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'delist-cases-r15.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ schema: 'supertrader-delist-cases-r15-1.0.0', at: new Date().toISOString(), cases: out }))));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
