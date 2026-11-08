#!/usr/bin/env node
'use strict';
// Holdout 2008–2015, Quant-Teil (docs/research/holdout/PROTOKOLL-2008-2015.json, SHA-256 unten gepinnt). Forschung, nicht
// zertifiziert. Genau die vorab genannte Hypothese Q-value-momentum-N20-W13-F0, unverändert mit dem E3-Adapter
// (scripts/research/edge/quant-e3.cjs) und denselben Daten wie E3; DQ-K5 (BOOK) als Sensitivität. Keine Variantensuche.
//
//   node scripts/research/holdout/quant-holdout.cjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D \
//        --out <Ordner außerhalb des Repos> [--reviewer-key <pem>]
//
// Ausgabe nur nach --out: quant-holdout.public.json (Zählungen, Hashes, keine Rendite) und quant-holdout.sealed.<owner|
// reviewer>.json (Kennzahlen und Wochenrenditen für die Holm-Zusammenführung). Nichts im Repository wird geschrieben.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const PROTOCOL_FILE = 'docs/research/holdout/PROTOKOLL-2008-2015.json';
const PROTOCOL_SHA256 = require('./protocol-pin.cjs').PROTOCOL_SHA256;
const VERSION = 'holdout-quant-1.0.0';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function args(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw Error('ARG ' + k); a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; }
  return a;
}
function protocol() {
  const bytes = fs.readFileSync(path.join(ROOT, PROTOCOL_FILE)), h = sha(bytes);
  if (h !== PROTOCOL_SHA256) throw Error('PROTOCOL_CHANGED ' + h);
  return { doc: JSON.parse(bytes), sha256: h };
}
/** Die eine Quant-Variante aus dem Protokoll, unverändert aus study.cjs#variants. */
function holdoutVariant(p, S = require('../edge/study.cjs')) {
  const ids = p.candidates.quant.map(x => x.id);
  if (ids.length !== 1) throw Error('QUANT_CANDIDATES_NOT_ONE');
  const v = S.variants().find(x => x.id === ids[0]);
  if (!v || v.family !== 'quant') throw Error('QUANT_VARIANT_UNKNOWN ' + ids[0]);
  return v;
}
function runOne(panel, variant, window, bm, MP) {
  const Q = require('../edge/quant-e3.cjs'), E3 = require('../edge/run-e3.cjs');
  const anchorDate = panel.calendar.find(d => d >= window[0]);
  const r = Q.runVariant(panel, Q.createSelector(panel), variant, { window, anchorDate, filterStateAt: null });
  const ev = E3.evaluate(r.equity, bm, MP);
  return { state: r.state, window: r.window, anchorDate, evaluation: { ...ev, returns: undefined, spyReturns: undefined }, weeklyReturns: ev.returns, spyWeeklyReturns: ev.spyReturns,
    costs: r.costs, turnover: r.turnover, cashShare: r.cashShare, terminalEvents: r.terminalEvents, construction: r.construction, ledgerResultHash: r.ledgerResultHash || null };
}

async function main() {
  const a = args(process.argv);
  if (!a.out) throw Error('OUT_REQUIRED');
  const out = path.resolve(a.out);
  if (out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('OUT_INSIDE_REPOSITORY');
  const reviewerPem = a.reviewerKey ? fs.readFileSync(a.reviewerKey, 'utf8') : null;
  if (reviewerPem && !/BEGIN PUBLIC KEY/.test(reviewerPem)) throw Error('REVIEWER_KEY_NOT_A_PUBLIC_KEY');
  const p = protocol(), variant = holdoutVariant(p.doc), window = [p.doc.window.from, p.doc.window.to];
  // Einmal-Ledger (privater Eimer): vor der Rechnung reservieren, nach dem Versiegeln abschließen
  const LG = await import(path.join(ROOT, 'scripts/research/holdout/ledger.mjs'));
  const { createS3DriverFromEnv } = await import(path.join(ROOT, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  const attempt = await LG.startAttempt(driver, 'quant', { runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, protocolSha256: p.sha256 });
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), E3 = require('../edge/run-e3.cjs');
  const panel = MP.buildPanel({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, fundamentals: a.fundamentals, window: [window[0], E3.TEST[1]], limit: 0 });
  if (panel.basis !== 'TOTAL_RETURN') throw Error('TOTAL_RETURN_PANEL_REQUIRED');
  const bm = E3.benchmarks(MP);
  const years = Array.from({ length: 8 }, (_, k) => 2008 + k);
  const result = { schema: 'vu-holdout-quant-result-1.0.0', label: p.doc.label, version: VERSION, protocolId: p.doc.id, protocolSha256: p.sha256, variant: variant.id, window,
    data: { ...panel.meta, population: panel.population }, coverageByYear: MP.coverageByYear(panel, years), primary: runOne(panel, variant, window, bm, MP) };
  const { panel: qp, census } = MP.applyDq(panel, 'DQ-K5-BOOK');
  result.dqK5 = { census, run: runOne(qp, variant, window, bm, MP) };
  result.receipt = { runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, resultSha256: sha(JSON.stringify({ primary: result.primary, dqK5: result.dqK5 })) };
  const L = await import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs'));
  fs.mkdirSync(out, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  fs.writeFileSync(path.join(out, 'quant-holdout.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  if (reviewerPem) fs.writeFileSync(path.join(out, 'quant-holdout.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plain));
  const pub = { schema: 'vu-holdout-quant-public-1.0.0', label: p.doc.label, version: VERSION, protocolSha256: p.sha256, variant: variant.id, state: result.primary.state, weeks: result.primary.evaluation.weeks ?? null,
    coverageByYear: result.coverageByYear, dqK5Flags: census.flags, resultSha256: result.receipt.resultSha256 };
  await LG.sealAttempt(driver, 'quant', attempt, { resultSha256: result.receipt.resultSha256 });
  pub.ledgerAttempt = attempt;
  fs.writeFileSync(path.join(out, 'quant-holdout.public.json'), JSON.stringify(pub, null, 1) + '\n');
  console.log(JSON.stringify({ state: pub.state, weeks: pub.weeks, resultSha256: pub.resultSha256 }));
}
if (require.main === module) main().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
module.exports = { VERSION, PROTOCOL_FILE, protocol, holdoutVariant };
