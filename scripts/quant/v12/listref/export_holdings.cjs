'use strict';
// V12 LISTREF step 2: our price holdings as seen by the research stack (read-only).
// For every weekly long series: raw first/last bar, listing identity (master canonical_id), whether the series is
// QUALIFIED by the V10/V11 research loader {identityEvidence, corporateActionEvidence, listingLifecycleEvidence} and
// whether it enters the V10/V11 research frame (common.buildFrame), plus the listing lifecycle (SEC-sourced last
// trading day). Writes only --out (private).
//   node scripts/quant/v12/listref/export_holdings.cjs --out <private>/work/holdings.json
const fs = require('node:fs'), path = require('node:path');
const common = require('../../v10/studies/common.cjs');
const { ROOT, C } = common;

const LOADER_OPTIONS = Object.freeze({ identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true });

function main() {
  const i = process.argv.indexOf('--out');
  if (i < 0) throw new Error('--out required');
  const out = path.resolve(process.argv[i + 1]);
  if (out.startsWith(ROOT + path.sep)) throw new Error('PRIVATE_OUTPUT_REQUIRED');
  const fr = common.buildFrame(LOADER_OPTIONS);
  const inFrame = new Set(fr.frame);
  const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));
  const bySid = new Map();
  for (const r of master.rows) if (r.baseline_security_id) { if (!bySid.has(r.baseline_security_id)) bySid.set(r.baseline_security_id, []); bySid.get(r.baseline_security_id).push(r); }
  const series = [];
  for (const f of fr.files) {
    const id = f.slice(0, -5);
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/discover-series-long', f), 'utf8'));
    const pts = raw.points || [];
    const doc = fr.docs.get(id) || null;
    const rows = (bySid.get(id) || []).map(r => ({ canonicalId: r.canonical_id, ticker: r.ticker, exchange: r.exchange, start: r.start_date, end: r.end_date,
      instrumentType: r.instrument_type, baselineMember: r.baseline_member, active: r.active_status }));
    const lc = doc && doc.listingLifecycle ? doc.listingLifecycle : null;
    series.push({
      securityId: id, ticker: raw.ticker, rawFirst: pts.length ? pts[0][0] : null, rawLast: pts.length ? pts.at(-1)[0] : null, rawBars: pts.length,
      qualified: !!doc, inFrame: inFrame.has(id), listingId: doc ? doc.listingId : null,
      frameFirst: doc ? doc.points[0][0] : null, frameLast: doc ? doc.points.at(-1)[0] : null,
      lifecycle: lc ? { status: lc.status ?? null, lastTradeDate: lc.lastTradeDate ?? null, lastObservedDate: lc.lastObservedDate ?? null, terminal: lc.terminal?.kind ?? null } : null,
      masterRows: rows,
    });
  }
  const res = { schemaVersion: 'v12-listref-holdings-1.0.0', loaderOptions: LOADER_OPTIONS, qualificationCounts: fr.reasons, frameSize: fr.frame.length,
    excluded: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, v.length])), masterSha256: C.shaFile(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json')),
    seriesCount: series.length, series };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(JSON.stringify({ series: series.length, qualified: series.filter(s => s.qualified).length, frame: fr.frame.length, reasons: fr.reasons }));
}
main();
