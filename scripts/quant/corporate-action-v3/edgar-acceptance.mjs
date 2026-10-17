#!/usr/bin/env node
/**
 * Independent timestamp source for the PIT oracle (protocol 3.0.0): the EDGAR acceptance time of every SEC filing that
 * carries a corporate-action observation, read from the EDGAR submissions index (data.sec.gov/submissions), a different
 * SEC system than the full-text search (EFTS) whose file_date the evidence model uses as visibleAt.
 *
 * The oracle checks (a) that no observation is treated as public before EDGAR accepted it (filedDate >= acceptance date)
 * and (b) the lag between acceptance and the evidence model's visibleAt. Independence is from the extraction pipeline and
 * from the engine, not from the institution: SEC is the authority for its own publication time.
 *
 * Usage: node edgar-acceptance.mjs --sec <sec-events.json> --out <acceptance.json>
 */
import fs from 'node:fs';
import path from 'node:path';

const args = (() => { const o = {}, a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1]; return o; })();
const UA = process.env.SEC_USER_AGENT || 'VisionUniverse research info@visionuniverse.de';
const MIN_INTERVAL = Number(process.env.SEC_MIN_INTERVAL_MS || 130);
const stats = { ciks: 0, requests: 0, retries: 0, errors: 0, accessionsWanted: 0, accessionsFound: 0 };
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 5; a++) {
    const w = Math.max(0, last + MIN_INTERVAL - Date.now()); if (w) await sleep(w); last = Date.now(); stats.requests++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
      if (res.status === 404) return null;
      if (res.status === 403 || res.status === 429 || res.status >= 500) { stats.retries++; await sleep(5000 * (a + 1)); continue; }
      if (!res.ok) { stats.errors++; return null; }
      return await res.json();
    } catch { stats.retries++; await sleep(2000 * (a + 1)); }
  }
  stats.errors++; return null;
}
function take(block, want, out) {
  const acc = block?.accessionNumber || [], at = block?.acceptanceDateTime || [], fd = block?.filingDate || [];
  for (let i = 0; i < acc.length; i++) if (want.has(acc[i])) out[acc[i]] = { acceptanceDateTime: at[i] || null, filingDate: fd[i] || null };
}
async function main() {
  const sec = JSON.parse(fs.readFileSync(args.sec, 'utf8'));
  const byCik = new Map();
  for (const [cik, row] of Object.entries(sec.ciks || {})) {
    const s = new Set();
    for (const ev of row.events || []) for (const o of ev.observations || []) if (o.accession) s.add(o.accession);
    if (s.size) byCik.set(cik, s);
  }
  const out = {};
  for (const [cik, want] of byCik) {
    stats.ciks++; stats.accessionsWanted += want.size;
    const j = await get(`https://data.sec.gov/submissions/CIK${cik}.json`);
    if (!j) continue;
    take(j.filings?.recent, want, out);
    for (const f of j.filings?.files || []) {
      if ([...want].every((a) => out[a])) break;
      const k = await get(`https://data.sec.gov/submissions/${f.name}`);
      take(k, want, out);
    }
    if (stats.ciks % 200 === 0) console.log('[edgar-acceptance]', JSON.stringify(stats));
  }
  stats.accessionsFound = Object.keys(out).length;
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({ schema: 'edgar-acceptance-1.0.0', source: 'data.sec.gov/submissions', stats, accessions: out }));
  console.log('[edgar-acceptance] done', JSON.stringify(stats));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
