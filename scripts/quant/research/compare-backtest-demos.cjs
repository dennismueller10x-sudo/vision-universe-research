#!/usr/bin/env node
'use strict';
// Compares two sets of backtest demonstration results (committed docs/quant/backtest-demos vs a rebuild from
// build-backtest-demos.cjs --out) field by field: state, every number of the envelope metrics, uncertainty, methods,
// period, events, data quality, limitations, population, PIT block and every input hash (code, certification,
// benchmark, population, listings, private registers). Read-only; writes only --out (JSON) and --markdown-out.
//   node scripts/quant/research/compare-backtest-demos.cjs --a <dir> --b <dir> [--out <json>] [--markdown-out <md>] [--only-public]
// A difference is classified as INPUT (inputHashes), RESULT (envelope/population/pit/extras) or STATE.
const fs = require('node:fs');
const path = require('node:path');
const SCHEMA = 'backtest-demo-comparison-1.0.0';
const EPS = 0; // exact: the runner is deterministic; any numeric drift is reported

function walk(a, b, p, out) {
  if (a === b) return;
  const ta = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a, tb = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;
  if (ta !== tb) { out.push({ path: p, a, b }); return; }
  if (ta === 'number') { if (!(Math.abs(a - b) <= EPS) && !(Number.isNaN(a) && Number.isNaN(b))) out.push({ path: p, a, b, delta: b - a }); return; }
  if (ta === 'array') {
    if (a.length !== b.length) out.push({ path: p + '.length', a: a.length, b: b.length });
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${p}[${i}]`, out);
    return;
  }
  if (ta === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push({ path: `${p}.${k}`, a: undefined, b: b[k] });
      else if (!(k in b)) out.push({ path: `${p}.${k}`, a: a[k], b: undefined });
      else walk(a[k], b[k], `${p}.${k}`, out);
    }
    return;
  }
  out.push({ path: p, a, b });
}
const HASH_KEYS = /(^|\.)(specHash|inputHash|envelopeHash|resultHash|listingHash|populationHash|runnerSpecHash)$/;
const category = (p) => p.startsWith('inputHashes') || p.includes('.inputHashes') ? 'INPUT' : p === 'state' || p.endsWith('.status.state') ? 'STATE' : HASH_KEYS.test(p) ? 'HASH' : 'RESULT';

function compare(dirA, dirB) {
  const ra = path.join(dirA, 'results'), rb = path.join(dirB, 'results');
  const ids = [...new Set([...fs.readdirSync(ra), ...fs.readdirSync(rb)])].filter((f) => f.endsWith('.json')).sort();
  const cases = ids.map((f) => {
    const id = f.replace(/\.json$/, '');
    if (!fs.existsSync(path.join(ra, f)) || !fs.existsSync(path.join(rb, f))) return { id, status: 'MISSING', missingIn: fs.existsSync(path.join(ra, f)) ? 'b' : 'a' };
    const A = JSON.parse(fs.readFileSync(path.join(ra, f), 'utf8')), B = JSON.parse(fs.readFileSync(path.join(rb, f), 'utf8'));
    const diffs = []; walk(A, B, '', diffs);
    const d = diffs.map((x) => ({ ...x, path: x.path.replace(/^\./, '') })).map((x) => ({ ...x, category: category(x.path) }));
    const by = (c) => d.filter((x) => x.category === c);
    const status = !d.length ? 'IDENTICAL' : by('STATE').length ? 'STATE_CHANGED' : by('RESULT').length ? 'RESULT_CHANGED' : by('INPUT').length ? 'INPUT_CHANGED_RESULT_SAME' : 'HASH_ONLY';
    return { id, kind: A.kind, stateA: A.state, stateB: B.state, status, counts: { STATE: by('STATE').length, RESULT: by('RESULT').length, INPUT: by('INPUT').length, HASH: by('HASH').length },
      inputDiffs: by('INPUT').map((x) => ({ path: x.path, a: x.a, b: x.b })), resultDiffs: by('RESULT').slice(0, 200), resultDiffsTotal: by('RESULT').length };
  });
  return { schemaVersion: SCHEMA, a: dirA, b: dirB, cases, summary: cases.reduce((m, c) => (m[c.status] = (m[c.status] || 0) + 1, m), {}) };
}

function markdown(rep) {
  const L = [`| Fall | Art | Zustand A → B | Ergebnis | Eingänge geändert | Ergebnisfelder geändert |`, '|---|---|---|---|---|---:|'];
  for (const c of rep.cases) {
    const inp = (c.inputDiffs || []).map((x) => '`' + x.path + '`').join(', ') || '–';
    L.push(`| ${c.id} | ${c.kind || '–'} | ${c.stateA || '–'} → ${c.stateB || '–'} | ${c.status} | ${inp} | ${c.resultDiffsTotal ?? '–'} |`);
  }
  return L.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2), o = {};
  for (let i = 0; i < argv.length; i += 2) { const k = argv[i]; if (!['--a', '--b', '--out', '--markdown-out'].includes(k) || !argv[i + 1]) { console.error('INVALID_ARGUMENTS:' + k); process.exit(2); } o[k.slice(2)] = argv[i + 1]; }
  if (!o.a || !o.b) { console.error('--a und --b erforderlich'); process.exit(2); }
  const rep = compare(path.resolve(o.a), path.resolve(o.b));
  if (o.out) fs.writeFileSync(o.out, JSON.stringify(rep, null, 2) + '\n');
  if (o['markdown-out']) fs.writeFileSync(o['markdown-out'], markdown(rep) + '\n');
  console.log(JSON.stringify(rep.summary));
  for (const c of rep.cases) console.log(`${c.id}: ${c.status} ${JSON.stringify(c.counts || {})}`);
}
module.exports = { compare, markdown, SCHEMA };
