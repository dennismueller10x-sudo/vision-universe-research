#!/usr/bin/env node
'use strict';
// Offline CLI for the research backtest runner (no provider fetch, no product path, no workflow).
//   node scripts/quant/research/run-backtest.cjs --spec <spec.json> --out <result.json>
//        [--cache <private dir outside the repository>] [--private-delisted <dir>] [--private-factor-panel <panel.jsonl.gz>]
//        [--no-qa]   (drops the QA block: per-event rows / portfolio schedule used by the independent Python check)
//   node scripts/quant/research/run-backtest.cjs --help
// Writes only --out (and, when given, the private cache directory). Prints a one-line summary with runtime and memory.
// Fail closed (P0.5): Vor dem Schreiben wird das eigene Ergebnis gegen den Ergebnisvertrag geprueft
// (quant/engines/backtest-result-contract.cjs#validate mit dem committeten Zertifizierungsartefakt), gegen die eigenen
// Hashes (envelopeHash, resultHash) und gegen die Research-Regeln (productionApproved=false, kein PRODUCT_CERTIFIED
// ohne Anforderung). Ein Verstoss schreibt nichts und endet mit Exit 1. Geschrieben wird atomar (Zwischendatei + rename).
// Die Zusammenfassungszeile nennt zusaetzlich den laufzeitfreien Kennzahlen-Hash (backtest-metrics-hash.cjs, P0.7);
// die Ergebnisdatei selbst bleibt unveraendert.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./backtest-runner.cjs');
const MH = require('./backtest-metrics-hash.cjs');
const Contract = require('../../../quant/engines/backtest-result-contract.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];
const HELP = [
  'Research-Backtest offline rechnen (kein Anbieterabruf, kein Produktpfad, keine Zertifizierung).',
  '',
  'Aufruf:',
  '  node scripts/quant/research/run-backtest.cjs --spec <spec.json> --out <ergebnis.json> [Optionen]',
  '  node scripts/quant/research/run-backtest.cjs --help',
  '',
  'Pflicht:',
  '  --spec <datei>                 Spezifikation backtest-runner-spec-1.0.0 (z. B. aus backtest-spec-builder.cjs --out)',
  '  --out <datei>                  Ergebnisdatei; nie unter quant/data, discover/data, supertrader/data, social/data',
  '',
  'Optionen:',
  '  --cache <verzeichnis>          privater Ergebnis-/Populationscache ausserhalb des Repositorys',
  '  --private-delisted <dir>       private delistete Reihen (sonst VU_PRIVATE_DELISTED_SERIES)',
  '  --private-factor-panel <datei> privates V10-PIT-Faktorpanel (sonst VU_PRIVATE_FACTOR_PANEL)',
  '  --no-qa                        ohne QA-Block (Ereigniszeilen fuer die Python-Gegenrechnung)',
  '  --help, -h                     diese Hilfe; schreibt nichts',
  '',
  'Fail closed: Die eigene Ausgabe wird vor dem Schreiben gegen den Ergebnisvertrag v2',
  '(backtest-result-contract.cjs#validate) und gegen ihre Hashes geprueft. Bei einem Verstoss wird nichts',
  'geschrieben (Exit 1). Die Ausgabe landet ausschliesslich in --out.',
  ''
].join('\n');

function parse(argv) {
  const o = { qa: true }, flags = { '--spec': 'spec', '--out': 'out', '--cache': 'cache', '--private-delisted': 'delisted', '--private-factor-panel': 'factorPanel' };
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-qa') { o.qa = false; continue; }
    const k = flags[argv[i]];
    if (!k || !argv[i + 1] || o[k] !== undefined) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    o[k] = argv[++i];
  }
  if (!o.spec || !o.out) throw Error('SPEC_AND_OUT_REQUIRED');
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith('..') && GENERATED.some(g => rel === g || rel.startsWith(g + path.sep))) throw Error('OUT_INSIDE_GENERATED_DATA:' + rel);
  return o;
}

/** Prueft ein Runner-Ergebnis gegen den Ergebnisvertrag und die eigenen Hashes. Liefert die Verstoesse (leer = gueltig). */
function checkResult(result, spec, certification) {
  const errors = [];
  if (!result || typeof result !== 'object') return ['RESULT_NOT_AN_OBJECT'];
  if (result.schemaVersion !== R.RESULT_SCHEMA) errors.push('RESULT_SCHEMA_UNKNOWN:' + result.schemaVersion);
  if (result.runner !== R.VERSION) errors.push('RUNNER_VERSION_UNKNOWN:' + result.runner);
  if (!result.envelope) return errors.concat('ENVELOPE_MISSING');
  const v = Contract.validate(result.envelope, { certification });
  if (!v.valid) for (const e of v.errors) errors.push('ENVELOPE:' + e);
  if (result.envelopeHash !== result.envelope.envelopeHash) errors.push('ENVELOPE_HASH_NOT_RECORDED');
  const body = { ...result }; delete body.resultHash;
  let recomputed = null;
  try { recomputed = R.hash(body); } catch (e) { errors.push('RESULT_NOT_CANONICAL_JSON'); }
  if (recomputed !== null && recomputed !== result.resultHash) errors.push('RESULT_HASH_MISMATCH');
  if (spec && result.specHash !== R.specHash(spec)) errors.push('SPEC_HASH_MISMATCH');
  if (spec && result.kind !== spec.kind) errors.push('KIND_MISMATCH');
  if (result.state !== result.envelope.status.state) errors.push('STATE_MISMATCH');
  if (result.envelope.status.productionApproved !== false) errors.push('PRODUCTION_APPROVAL_FORBIDDEN');
  const asked = !!(spec && spec.status && spec.status.requestProductCertifiedState === true);
  if (result.state === 'PRODUCT_CERTIFIED' && !asked) errors.push('PRODUCT_CERTIFIED_WITHOUT_REQUEST');
  return errors;
}

function writeAtomic(file, text) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.tmp-' + process.pid;
  try { fs.writeFileSync(tmp, text); fs.renameSync(tmp, target); } finally { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); }
}

function main(argv = process.argv.slice(2), io = { stdout: s => process.stdout.write(s) }) {
  const o = parse(argv);
  if (o.help) { io.stdout(HELP); return 0; }
  const spec = JSON.parse(fs.readFileSync(o.spec, 'utf8'));
  const result = R.runBacktest(spec, { cacheDir: o.cache || null, privateDirs: { delistedSeries: o.delisted || process.env.VU_PRIVATE_DELISTED_SERIES || null, factorPanel: o.factorPanel || process.env.VU_PRIVATE_FACTOR_PANEL || null } });
  const certification = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
  const violations = checkResult(result, spec, certification);
  if (violations.length) throw Error('RESULT_CONTRACT_VIOLATION:' + violations.slice(0, 5).join(','));
  const out = o.qa ? result : { ...result, qa: null };
  writeAtomic(o.out, JSON.stringify(out, null, 1) + '\n');
  io.stdout(JSON.stringify({ id: spec.id, kind: result.kind, state: result.state, envelopeHash: result.envelopeHash, resultHash: result.resultHash, metricsHash: MH.metricsHash(result), contract: 'VALID', ...result.diagnostics, certification: 'NOT_CERTIFIED', productionApproved: false }) + '\n');
  return 0;
}
if (require.main === module) { try { process.exitCode = main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { main, parse, checkResult, HELP };
