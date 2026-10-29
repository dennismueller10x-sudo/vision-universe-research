'use strict';
// V12 LISTREF step 7: delisting reason classes (protocol 1.0.0 delistingReason) from 8-K item metadata + index signals.
//   node scripts/quant/v12/listref/reasons.cjs --private <dir> --out-dir docs/quant-recovery/v12/listref
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const ITEMS_FROM = '2004-08-23';
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const reasonUrl = (cik, s, e) => 'https://efts.sec.gov/LATEST/search-index?forms=8-K&ciks=' + String(cik).padStart(10, '0') + '&dateRange=custom&startdt=' + s + '&enddt=' + e;

function classify(ev, res) {
  const items = new Set(), decisive = {};
  if (res) for (const [id, form, date, its] of res.hits) for (const it of its) { items.add(it); if (!decisive[it]) decisive[it] = { id, date }; }
  const pick = (cls, it) => ({ reason: cls, item: it || null, eightK: it ? decisive[it] : null, items: [...items].sort() });
  if (items.has('2.01')) return pick('MERGER_ACQUISITION_COMPLETED', '2.01');
  if (items.has('1.03')) return pick('BANKRUPTCY', '1.03');
  if (items.has('3.01')) return pick('LISTING_RULE_OR_TRANSFER_NOTICE', '3.01');
  if (ev.mergerProcessIndexed) return pick('MERGER_PROCESS_INDICATED');
  if (ev.issuerForm25 && !ev.exchangeForm25NSE) return pick('VOLUNTARY_ISSUER_FILING');
  return pick('UNKNOWN');
}

function main() {
  const priv = path.resolve(arg('--private')), outDir = path.resolve(arg('--out-dir'));
  const reg = JSON.parse(fs.readFileSync(path.join(priv, 'work/delisting-register.json'), 'utf8'));
  const rr = JSON.parse(fs.readFileSync(path.join(priv, 'work/reasons-results.json'), 'utf8'));
  const rows = [], perYear = {}, overall = {}, byScope = {};
  let queried = 0, missing = 0;
  for (const ev of reg) {
    const linked = ev.linkedChains.length > 0;
    let res = null, scope;
    if (linked && ev.eventDate >= ITEMS_FROM) {
      const last = ev.forms.map(f => f[1]).sort().at(-1);
      res = rr.results[reasonUrl(ev.cik, addDays(ev.eventDate, -120), addDays(last, 30))] || null;
      if (res) { queried++; scope = 'LINKED_ITEMS_QUERIED'; } else { missing++; scope = 'LINKED_ITEMS_MISSING'; }
    } else scope = linked ? 'LINKED_PRE_ITEMS_ERA' : 'UNLINKED_INDEX_SIGNALS_ONLY';
    const c = classify(ev, res);
    const y = ev.eventDate.slice(0, 4);
    perYear[y] = perYear[y] || {}; perYear[y][scope] = perYear[y][scope] || {}; perYear[y][scope][c.reason] = (perYear[y][scope][c.reason] || 0) + 1;
    overall[c.reason] = (overall[c.reason] || 0) + 1;
    byScope[scope] = byScope[scope] || {}; byScope[scope][c.reason] = (byScope[scope][c.reason] || 0) + 1;
    rows.push([ev.cik, ev.eventDate, scope, c.reason, c.items, c.eightK ? c.eightK.id : null, c.eightK ? c.eightK.date : null]);
  }
  const doc = { schemaVersion: 'v12-listref-delisting-reasons-1.0.1', evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    protocolSha256: sha(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/listref/protocol-1.0.0.json'))), codeSha256: sha(fs.readFileSync(__filename)),
    inputs: { registerSha256: sha(fs.readFileSync(path.join(priv, 'work/delisting-register.json'))), reasonsResultsSha256: sha(fs.readFileSync(path.join(priv, 'work/reasons-results.json'))) },
    rule: '8-K items in [event-120d, last delisting form+30d] (efts metadata): 2.01 > 1.03 > 3.01; else merger-process forms indexed within 365d before; else issuer Form 25 without 25-NSE; else UNKNOWN. 8-K items only queried for linked events on/after 2004-08-23.',
    caveat: 'Item 2.01 also covers asset acquisitions by the registrant; 3.01 also covers voluntary transfers between exchanges and deficiency notices that were later cured. Counts are metadata-based; see verification sample for text checks.',
    counts: { events: reg.length, itemsQueried: queried, itemsMissing: missing, overall, byScope }, perYear,
    columns: ['cik', 'eventDate', 'scope', 'reason', 'items', 'decisive8K', 'decisive8KDate'], rows };
  fs.writeFileSync(path.join(outDir, 'delisting-reasons-1.0.1.json.gz'), zlib.gzipSync(JSON.stringify(doc) + '\n', { level: 9 }));
  fs.writeFileSync(path.join(priv, 'work/delisting-reasons.json'), JSON.stringify(doc));
  console.log(JSON.stringify(doc.counts, null, 1));
}
if (require.main === module) main();
module.exports = { classify };
