#!/usr/bin/env node
/* V9 identity: dry run of the PROPOSED identity-evidence binding against the unchanged weekly adapter.
 *
 * before: createLoader(root)(id) exactly as today.
 * after : for ids with a BIND_SOURCE_RESOLVED_LISTING record, emulate the proposed loader branch WITHOUT
 *         editing any engine: verify the history guard, restrict the series to [validFrom, validTo], build the
 *         identity row from the binding and call the adapter's own exported validate(doc, identity).
 *         All other ids keep their createLoader result.
 * Writes only --out. No engine, data or master file is modified.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const Adapter = require(path.join(root, 'quant/engines/weekly-real-adapter.cjs'));
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const proposalPath = opt('--proposal'), out = opt('--out');
if (!proposalPath || !out) { console.error('usage: --proposal <json> --out <json>'); process.exit(2); }
const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
const bind = new Map(proposal.records.filter(r => r.decision === 'BIND_SOURCE_RESOLVED_LISTING').map(r => [r.securityId, r]));
const reason = e => String(e && e.message || e).split(':')[0];

// Proposed loader branch (identical logic is proposed for weekly-real-adapter.cjs#createLoader).
function boundLoad(securityId, record, bytes) {
  const doc = JSON.parse(bytes);
  const b = record.binding, g = record.historyGuard;
  const guarded = doc.points.filter(p => p[0] >= g.checkedFrom && p[0] <= g.checkedTo);
  if (crypto.createHash('sha256').update(JSON.stringify(guarded)).digest('hex') !== g.pointsSha256) throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if (b.activeStatus !== 'ACTIVE_SEC_CONFIRMED' || b.instrumentClass.indexOf('COMMON') < 0 || doc.ticker !== record.ticker) throw Error('IDENTITY_EVIDENCE_BINDING_INVALID');
  const points = doc.points.filter(p => p[0] >= b.validFrom && (b.validTo === null || p[0] <= b.validTo));
  if (!points.length) throw Error('INSUFFICIENT_HISTORY');
  const sliced = { ...doc, points, from: points[0][0], to: points.at(-1)[0] };
  const identity = { canonical_id: b.canonicalId, baseline_security_id: securityId, ticker: doc.ticker, currency: b.currency, provider: b.provider,
    start_date: b.validFrom, active_status: 'ACTIVE', eligible_us_equity: true, instrument_type: 'EQUITY_COMMON',
    source_provenance: 'V9_SEC_IDENTITY_EVIDENCE:' + b.cik };
  const r = Adapter.validate(sliced, identity);
  return { ...r, identityEvidence: { cik: b.cik, canonicalId: b.canonicalId, validFrom: b.validFrom, validTo: b.validTo },
    warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL']) };
}

const loader = Adapter.createLoader(root);
const dir = path.join(root, 'quant/data/market/discover-series-long');
const ids = fs.readdirSync(dir).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
const before = {}, after = {}, changed = [];
const tally = (m, k) => { m[k] = (m[k] || 0) + 1; };
for (const id of ids) {
  let rb = 'QUALIFIED';
  try { loader(id); } catch (e) { rb = reason(e); }
  let ra = rb, detail = null;
  if (bind.has(id)) {
    try {
      const r = boundLoad(id, bind.get(id), fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
      ra = 'QUALIFIED'; detail = { from: r.points[0][0], to: r.points.at(-1)[0], bars: r.points.length, corporateActionQuality: r.corporateActionQuality.status };
    } catch (e) { ra = reason(e); detail = String(e.message).slice(0, 200); }
    changed.push({ securityId: id, before: rb, after: ra, origin: bind.get(id).origin, detail });
  }
  tally(before, rb); tally(after, ra);
}
const newly = changed.filter(c => c.before !== 'QUALIFIED' && c.after === 'QUALIFIED');
const report = {
  schemaVersion: 'v9-identity-dry-run-1.0.0', generatedAt: new Date().toISOString(), productionApproved: false,
  masterHash: loader.masterHash, proposalSha256: crypto.createHash('sha256').update(fs.readFileSync(proposalPath)).digest('hex'),
  codeSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  adapterSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'quant/engines/weekly-real-adapter.cjs'))).digest('hex'),
  runtime: Adapter.calculationRuntime(), total: ids.length, before, after,
  newlyQualified: newly.length, newlyQualifiedIds: newly.map(c => c.securityId),
  bindingsEvaluated: changed.length, bindingsNotQualified: changed.filter(c => c.after !== 'QUALIFIED'),
  bindings: changed,
  note: 'Dry run only. Bound ids are evaluated on their SEC-sourced usable interval with the unchanged adapter validate(); every other adapter check (history >=55 bars, gaps, corporate actions, classification conflicts) still applies.'
};
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ before, after, newlyQualified: newly.length, bindingsEvaluated: changed.length }, null, 1));
