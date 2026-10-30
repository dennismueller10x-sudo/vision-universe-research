#!/usr/bin/env node
/* V12 LARGECAP: corporate-action frame of the protocol scope (protocol-1.0.0.json#scope.corporateAction), same per-series format as
 * scripts/quant/v9-followups/ca-registry/export-frame.cjs. The blocking reason is taken from the research loader with the INDEXPOP option
 * set {identityEvidence, corporateActionEvidence, listingLifecycleEvidence}. Read-only; writes only --out.
 *   node scripts/quant/v12/largecap/export-ca-frame.cjs --out <frame.json> */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
if (!args.includes('--out') || !out) { console.error('usage: --out <json>'); process.exit(2); }
const CA = require(path.join(root, 'quant/engines/corporate-action-evidence.js'));
const Research = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const P = JSON.parse(fs.readFileSync(path.join(root, 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json'), 'utf8'));
const dir = path.join(root, 'quant/data/market/discover-series-long');
const master = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));
const rowsById = new Map();
for (const r of master.rows) if (r.baseline_security_id) { if (!rowsById.has(r.baseline_security_id)) rowsById.set(r.baseline_security_id, []); rowsById.get(r.baseline_security_id).push(r); }
const loader = Research.createResearchLoader(root, { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true });
const series = [];
for (const id of P.scope.corporateAction) {
  let reason = 'QUALIFIED';
  try { loader(id); } catch (e) { reason = String(e.message).split(':')[0]; }
  if (reason !== 'CORPORATE_ACTION_UNRESOLVED') throw Error('SCOPE_REASON_CHANGED:' + id + ':' + reason);
  const bytes = fs.readFileSync(path.join(dir, id + '.json')), doc = JSON.parse(bytes), pts = doc.points;
  const suspected = pts.flatMap(([d, p], i) => i && CA.splitSized(p / pts[i - 1][1]) ? [{ time: d }] : []);
  const q = CA.resolve(suspected, doc.corporateActions);
  const rows = rowsById.get(id) || [];
  const events = q.items.filter(x => x.status === 'UNRESOLVED').map(x => {
    const i = pts.findIndex(p => p[0] === x.time), m = (doc.corporateActions?.moves || []).find(mv => mv.week === x.time) || null;
    return { week: x.time, prevWeek: pts[i - 1][0], prevClose: pts[i - 1][1], close: pts[i][1], weeklyRatio: pts[i][1] / pts[i - 1][1], reason: x.reason,
      jumpDay: m?.maxDailyDate || x.time, maxDailyRatio: m?.maxDailyRatio ?? null, next: pts.slice(i + 1, i + 3).map(p => p.slice()) };
  });
  series.push({ securityId: id, ticker: doc.ticker, canonicalId: rows.length === 1 ? rows[0].canonical_id : null, masterRows: rows.length, exchange: rows[0]?.exchange || null,
    asOf: doc.asOf, seriesSha256: crypto.createHash('sha256').update(bytes).digest('hex'), events });
}
const report = { schemaVersion: 'v12-largecap-ca-frame-1.0.0', protocolSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json'))).digest('hex'),
  masterVersion: master.version, series: series.length, events: series.reduce((a, s) => a + s.events.length, 0), frame: series };
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ series: report.series, events: report.events }));
