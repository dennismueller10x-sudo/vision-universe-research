#!/usr/bin/env node
/**
 * Vendor evidence for protocol 3.0.0, computed OUTSIDE the Actions runner. The validation vendor (Yahoo chart) answers
 * every request from GitHub-hosted runners with HTTP 429 (run 39007119068: 25 of 25 symbols blocked; probe run
 * 39013825289: query1/query2 both 429), so the runner seals a label request (ticker, window, a sample of provider closes
 * for the identity check, the days to label with their previous provider session) to the session key. This script reads
 * the decrypted request, fetches the vendor series, and applies the same rules as labels.mjs (vendorView, vendorIdentity,
 * vendorAt) to produce a ticker-free evidence file keyed by sha256(seed|segmentId): identity verdict, vendor splits in the
 * window and the vendor raw ratio of each requested day. No vendor price series leaves this machine; the evidence file is
 * committed and read by the runner (audit-v3.mjs --vendor-evidence).
 *
 * Usage: node vendor-evidence.mjs --request <decrypted label-request.json> --cache <dir> --out <VENDOR-EVIDENCE-V3.json> [--interval-ms 650]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchSymbol, decode, yahooSymbol, COLLECTOR_VERSION } from './vendor-collect.mjs';
import { vendorView, computeVendorEvidence, LABELS_VERSION } from './labels.mjs';

const args = (() => { const o = {}, a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1]; return o; })();
const req = JSON.parse(fs.readFileSync(args.request, 'utf8'));
fs.mkdirSync(args.cache, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const bySym = new Map();
for (const r of Object.values(req.segments)) {
  const s = yahooSymbol(r.ticker), cur = bySym.get(s) || { from: r.from, to: r.to || today };
  if (r.from < cur.from) cur.from = r.from; if ((r.to || today) > cur.to) cur.to = r.to || today;
  bySym.set(s, cur);
}
const stats = { symbols: bySym.size, fetched: 0, cached: 0, ok: 0, notFound: 0, other: 0, segments: 0, identity: {} };
const cacheFile = (s) => path.join(args.cache, encodeURIComponent(s) + '.json');
for (const [s, w] of [...bySym.entries()].sort()) {
  if (fs.existsSync(cacheFile(s))) { stats.cached++; continue; }
  const r = await fetchSymbol(s, w.from, w.to > today ? today : w.to);
  fs.writeFileSync(cacheFile(s), JSON.stringify({ t: s, ...r })); stats.fetched++;
  if (stats.fetched % 250 === 0) console.log('[vendor-evidence]', stats.fetched, '/', bySym.size);
}
const out = {};
for (const [key, r] of Object.entries(req.segments)) {
  const x = JSON.parse(fs.readFileSync(cacheFile(yahooSymbol(r.ticker)), 'utf8'));
  if (x.status === 'OK') stats.ok++; else if (x.status === 'NOT_FOUND') stats.notFound++; else stats.other++;
  const vv = x.status === 'OK' ? vendorView(decode(x)) : null;
  const ev = computeVendorEvidence(vv, { ...r, to: r.to || today });
  stats.segments++; stats.identity[ev.identity.state] = (stats.identity[ev.identity.state] || 0) + 1;
  out[key] = ev;
}
const body = { schema: 'corporate-action-v3-vendor-evidence-1.0.0', collector: COLLECTOR_VERSION, labels: LABELS_VERSION, vendor: 'Yahoo chart (validation only, not point in time, no commercial licence)',
  computedAt: new Date().toISOString(), keySeed: req.keySeed, requestSha256: crypto.createHash('sha256').update(fs.readFileSync(args.request)).digest('hex'), stats, segments: out };
fs.writeFileSync(args.out, JSON.stringify(body));
console.log('[vendor-evidence] done', JSON.stringify(stats));
