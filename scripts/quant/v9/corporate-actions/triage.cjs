#!/usr/bin/env node
/* V9 workstream B (corporate-actions): triage of all weekly-qualification holds.
   Read-only. Reuses quant/engines/weekly-real-adapter.cjs#createLoader and
   corporate-action-evidence.js unchanged. Writes only to --out (private dir) and
   --summary (small derived JSON in docs/quant-recovery/v9/corporate-actions/).

   Usage: node scripts/quant/v9/corporate-actions/triage.cjs --out <private.json> --summary <summary.json> --events <events.json>
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const { createLoader } = require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'));
const CA = require(path.join(ROOT, 'quant/engines/corporate-action-evidence.js'));

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const OUT = arg('--out'), SUMMARY = arg('--summary'), EVENTS = arg('--events');
if (!OUT || !SUMMARY || !EVENTS) { console.error('need --out --summary --events'); process.exit(2); }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const dir = path.join(ROOT, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const loader = createLoader(ROOT);
const results = [], events = [], gapRows = [];
const sourceHashes = {};
for (const id of ids) {
  const bytes = fs.readFileSync(path.join(dir, id + '.json'), 'utf8');
  sourceHashes[id] = sha(bytes);
  let status = 'QUALIFIED', detail = null;
  try { loader(id, bytes); } catch (e) {
    const m = String(e.message);
    const c = m.indexOf(':');
    status = c > 0 ? m.slice(0, c) : m;
    detail = c > 0 ? m.slice(c + 1) : null;
  }
  const row = { id, status };
  const doc = JSON.parse(bytes);
  const pts = doc.points || [];
  // engine suspects computed exactly as the adapter (independent of gap status)
  const suspected = pts.flatMap(([d, p], i) => i && CA.splitSized(p / pts[i - 1][1]) ? [{ time: d }] : []);
  const res = CA.resolve(suspected, doc.corporateActions);
  if (status === 'CORPORATE_ACTION_UNRESOLVED') {
    const items = JSON.parse(detail);
    // parity: adapter error items equal our recomputation
    if (JSON.stringify(items) !== JSON.stringify(res.items)) throw Error('ITEM_PARITY_FAIL ' + id);
  }
  if (status === 'MISSING_WEEKS') {
    row.gaps = JSON.parse(detail);
    row.hiddenSuspects = res.items.length;
    row.hiddenUnresolved = res.items.filter(x => x.status !== 'RESOLVED_GENUINE_MOVE').length;
  }
  if (status === 'CORPORATE_ACTION_UNRESOLVED' || status === 'MISSING_WEEKS' || status === 'QUALIFIED') {
    row.suspects = res.items.length;
  }
  row.from = doc.from; row.to = doc.to; row.ticker = doc.ticker; row.points = pts.length;
  row.hasEvidence = !!(doc.corporateActions && doc.corporateActions.version === CA.VERSION);
  if (status === 'CORPORATE_ACTION_UNRESOLVED' || status === 'MISSING_WEEKS') {
    const splits = (doc.corporateActions && doc.corporateActions.splits) || [];
    for (const it of res.items) {
      const i = pts.findIndex(p => p[0] === it.time);
      const r = pts[i][1] / pts[i - 1][1];
      const ss = CA.splitSized(r);
      const mv = doc.corporateActions && Array.isArray(doc.corporateActions.moves) ? doc.corporateActions.moves.find(x => x.week === it.time) : null;
      const t = Date.parse(it.time + 'T00:00:00Z');
      const near = splits.filter(s => Math.abs(Date.parse(s[0] + 'T00:00:00Z') - t) <= 400 * 86400000);
      events.push({ id, ticker: doc.ticker, listingStatus: status, week: it.time, prevWeek: pts[i - 1][0],
        prevClose: pts[i - 1][1], close: pts[i][1], weeklyRatio: Math.round(r * 1e6) / 1e6, k: ss.k, direction: ss.kind,
        itemStatus: it.status, reason: it.reason, maxDailyRatio: mv ? mv.maxDailyRatio : null, maxDailyDate: mv ? mv.maxDailyDate : null,
        splitInWeek: mv ? mv.splitInWeek : null, providerSplitsWithin400d: near,
        next4: pts.slice(i + 1, i + 5).map(p => p[1]), prev4: pts.slice(Math.max(0, i - 4), i).map(p => p[1]) });
    }
  }
  results.push(row);
}
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const caEvents = events.filter(e => e.listingStatus === 'CORPORATE_ACTION_UNRESOLVED');
const caIds = results.filter(r => r.status === 'CORPORATE_ACTION_UNRESOLVED');
const caUnres = caEvents.filter(e => e.itemStatus !== 'RESOLVED_GENUINE_MOVE');
const summary = {
  schemaVersion: 'v9-ca-triage-1.0.0',
  engine: { adapter: 'quant/engines/weekly-real-adapter.cjs', evidence: CA.VERSION,
    adapterSha256: sha(fs.readFileSync(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'))),
    evidenceSha256: sha(fs.readFileSync(path.join(ROOT, 'quant/engines/corporate-action-evidence.js'))),
    masterHash: loader.masterHash },
  sourceManifestHash: sha(JSON.stringify(sourceHashes)),
  listings: results.length,
  statusCounts: count(results, r => r.status),
  ca: {
    listings: caIds.length,
    events: caEvents.length,
    eventsUnresolved: caUnres.length,
    eventsAlreadyResolvedGenuineInHeldListings: caEvents.length - caUnres.length,
    listingsWithEvidenceBlock: caIds.filter(r => r.hasEvidence).length,
    unresolvedByReason: count(caUnres, e => e.reason),
    unresolvedByK: count(caUnres, e => e.k + '_' + e.direction),
    unresolvedByDirection: count(caUnres, e => e.direction),
    unresolvedByYear: count(caUnres, e => e.week.slice(0, 4)),
    unresolvedPost2009: caUnres.filter(e => e.week >= '2009-06-15').length,
    unresolvedPre2009: caUnres.filter(e => e.week < '2009-06-15').length,
    listingsByUnresolvedEventCount: count(caIds, r => caUnres.filter(e => e.id === r.id).length),
    listingsAllUnresolvedPost2009: caIds.filter(r => caUnres.filter(e => e.id === r.id).every(e => e.week >= '2009-06-15')).length,
    listingsSingleUnresolvedEvent: caIds.filter(r => caUnres.filter(e => e.id === r.id).length === 1).length,
    unresolvedWithProviderSplitWithin400d: caUnres.filter(e => e.providerSplitsWithin400d.length).length,
  },
  xbrlEraCutoffNote: 'Post-2009 = week >= 2009-06-15 (first XBRL phase-in for large accelerated filers; smaller reporting companies from fiscal periods after 2011-06-15). dei/us-gaap share counts in companyfacts are therefore typically available only from ~2009-2011 on.',
  missingWeeks: {
    listings: results.filter(r => r.status === 'MISSING_WEEKS').length,
    listingsWithHiddenUnresolvedCA: results.filter(r => r.status === 'MISSING_WEEKS' && r.hiddenUnresolved > 0).length,
  },
  productionApproved: false,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ summary, results, sourceHashes }, null, 0));
fs.writeFileSync(EVENTS, JSON.stringify({ schemaVersion: 'v9-ca-events-1.0.0', note: 'All suspected split-sized weekly moves in CORPORATE_ACTION_UNRESOLVED and MISSING_WEEKS listings, recomputed with corporate-action-evidence.js#resolve; parity with adapter error items asserted for every CA listing.', events }, null, 0));
fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
