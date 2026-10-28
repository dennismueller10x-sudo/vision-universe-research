#!/usr/bin/env node
/* V9 follow-up (corporate-action registry): candidate frame per protocol.json#candidateFrame.
 * Every UNRESOLVED item of corporate-action-evidence.resolve over the weekly series, restricted to series whose load with
 * createResearchLoader(root, { identityEvidence: true }) fails with CORPORATE_ACTION_UNRESOLVED. Read-only; writes only --out.
 */
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
const Identity = require(path.join(root, 'quant/engines/research-identity-evidence.cjs'));
const SUBSET_FROM = '2011-07-01';
const dir = path.join(root, 'quant/data/market/discover-series-long');
const master = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));
const rowsById = new Map();
for (const r of master.rows) if (r.baseline_security_id) { if (!rowsById.has(r.baseline_security_id)) rowsById.set(r.baseline_security_id, []); rowsById.get(r.baseline_security_id).push(r); }
const bound = new Map(Identity.records.map(r => [r.securityId, r]));
const loader = Research.createResearchLoader(root, { identityEvidence: true });
const ids = fs.readdirSync(dir).filter(f => /^ref_[A-Za-z0-9_.-]+\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const series = [];
for (const id of ids) {
  let reason = 'QUALIFIED';
  try { loader(id); } catch (e) { reason = String(e.message).split(':')[0]; }
  if (reason !== 'CORPORATE_ACTION_UNRESOLVED') continue;
  const doc = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
  const pts = doc.points;
  const suspected = pts.flatMap(([d, p], i) => i && CA.splitSized(p / pts[i - 1][1]) ? [{ time: d }] : []);
  const q = CA.resolve(suspected, doc.corporateActions);
  const row = bound.get(id) ? null : rowsById.get(id)[0];
  const events = q.items.filter(x => x.status === 'UNRESOLVED').map(x => {
    const i = pts.findIndex(p => p[0] === x.time), m = (doc.corporateActions?.moves || []).find(mv => mv.week === x.time) || null;
    return { week: x.time, prevWeek: pts[i - 1][0], prevClose: pts[i - 1][1], close: pts[i][1], weeklyRatio: pts[i][1] / pts[i - 1][1], reason: x.reason,
      jumpDay: m?.maxDailyDate || x.time, maxDailyRatio: m?.maxDailyRatio ?? null, next: pts.slice(i + 1, i + 3).map(p => p.slice()) };
  });
  series.push({ securityId: id, ticker: doc.ticker, canonicalId: bound.get(id)?.canonicalId || row.canonical_id, exchange: bound.get(id) ? bound.get(id).mic : row.exchange,
    asOf: doc.asOf, seriesSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, id + '.json'))).digest('hex'),
    inSubset: events.every(e => e.week >= SUBSET_FROM), events });
}
const n = series.reduce((a, s) => a + s.events.length, 0), sub = series.filter(s => s.inSubset);
const report = { schemaVersion: 'v9-followup-ca-frame-1.0.0', subsetFrom: SUBSET_FROM, masterVersion: master.version, series: series.length, events: n,
  subsetSeries: sub.length, subsetEvents: sub.reduce((a, s) => a + s.events.length, 0), frame: series };
fs.writeFileSync(out, JSON.stringify(report) + '\n');
console.log(JSON.stringify({ series: report.series, events: n, subsetSeries: report.subsetSeries, subsetEvents: report.subsetEvents }));
