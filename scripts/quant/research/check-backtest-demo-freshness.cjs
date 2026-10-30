#!/usr/bin/env node
'use strict';
// Checks whether the committed demonstration results (docs/quant/backtest-demos/results/*.json) still match the code
// and the inputs on this checkout. Read-only: it compares the hashes each result recorded (inputHashes) with the files
// as they are now. It never rebuilds a demo (that needs the private data; see build-backtest-demos.cjs).
//   node scripts/quant/research/check-backtest-demo-freshness.cjs [--results <dir>] [--out <file>] [--strict]
// CODE      a recorded code file has different bytes now -> the demo does not document the code on this checkout.
// INPUTS    certification artefact or security master changed since the build (expected drift, information only).
// --strict  exit 1 on any CODE finding (default: report only, exit 0).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const R = require('./backtest-runner.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_RESULTS = path.join(ROOT, 'docs/quant/backtest-demos/results');
const MASTER = 'quant/data/market/security-master/us-security-master.json';
const SCHEMA = 'backtest-demo-freshness-1.0.0';

const shaBytes = b => crypto.createHash('sha256').update(b).digest('hex');
const fileSha = (root, f) => { try { return shaBytes(fs.readFileSync(path.join(root, f))); } catch { return null; } };

function demoFreshness({ root = ROOT, resultsDir = DEFAULT_RESULTS } = {}) {
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) throw Error('NO_DEMO_RESULTS:' + resultsDir);
  const shaCache = new Map(), current = f => (shaCache.has(f) ? shaCache.get(f) : (shaCache.set(f, fileSha(root, f)), shaCache.get(f)));
  let certSha = null;
  try { certSha = R.hash(JSON.parse(fs.readFileSync(path.join(root, R.CERTIFICATION_PATH), 'utf8'))); } catch { certSha = null; }
  const masterSha = current(MASTER);
  const code = {}, cases = [];
  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    const doc = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
    const h = doc && doc.inputHashes;
    if (!h || !h.code || typeof h.code !== 'object') throw Error('DEMO_WITHOUT_INPUT_HASHES:' + f);
    const stale = Object.keys(h.code).sort().filter(p => current(p) !== h.code[p]);
    for (const p of stale) (code[p] = code[p] || { recorded: new Set(), current: current(p), cases: [] }).cases.push(id), code[p].recorded.add(h.code[p]);
    const recMaster = h.population && h.population.masterHash != null ? h.population.masterHash : null;
    cases.push({ id, kind: doc.kind || null, codeStale: stale,
      certificationChanged: certSha !== null && h.certification !== certSha,
      masterChanged: recMaster !== null && masterSha !== null && recMaster !== masterSha });
  }
  const codeFindings = Object.keys(code).sort().map(p => ({ file: p, current: code[p].current, recorded: [...code[p].recorded].sort(), cases: code[p].cases }));
  return {
    schemaVersion: SCHEMA, demos: cases.length,
    code: { status: codeFindings.length ? 'STALE' : 'CURRENT', findings: codeFindings },
    inputs: { certificationChanged: cases.filter(c => c.certificationChanged).length, masterChanged: cases.filter(c => c.masterChanged).length },
    cases
  };
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') o.strict = true;
    else if ((a === '--results' || a === '--out') && argv[i + 1] && o[a.slice(2)] === undefined) o[a.slice(2)] = argv[++i];
    else throw Error('INVALID_ARGUMENTS:' + a);
  }
  const rep = demoFreshness({ resultsDir: o.results ? path.resolve(o.results) : DEFAULT_RESULTS });
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(rep, null, 2) + '\n');
  console.log(`[backtest-demos] ${rep.demos} Demos · Code ${rep.code.status}` +
    rep.code.findings.map(x => ` [${x.file}: ${x.cases.length} Demos]`).join('') +
    ` · Zertifizierung seit Bau geaendert: ${rep.inputs.certificationChanged} · Stamm geaendert: ${rep.inputs.masterChanged}`);
  return o.strict && rep.code.findings.length ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error('ABBRUCH: ' + e.message); process.exitCode = 2; }
}
module.exports = { demoFreshness, SCHEMA };
