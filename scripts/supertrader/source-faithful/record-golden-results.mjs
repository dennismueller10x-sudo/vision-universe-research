#!/usr/bin/env node
/**
 * Runs the source-faithful test files and records every golden case result (STRATEGY-GOLDEN-CASE-RESULTS.json):
 * test name -> pass / fail, with the rules and #709 ids it covers (from the golden catalogue). Deterministic content
 * (no durations, no clock). The record is evidence of a test run, not a substitute for running the tests in CI.
 *
 *   node scripts/supertrader/source-faithful/record-golden-results.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_DIR } from './build-artifacts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
export const SF_TEST_FILES = Object.freeze(['sf-foundation', 'sf-turtle', 'sf-runner', 'sf-darvas', 'sf-weinstein', 'sf-morales-kacher', 'sf-minervini', 'sf-kullamagi', 'sf-holy-grail', 'sf-turtle-completion', 'sf-darvas-completion', 'sf-moka-completion', 'sf-completion', 'sf-turtle-correlation-research', 'sf-industry-strength-research', 'sf-minervini-components', 'sf-context-evidence-research', 'sf-sf3-runner-research'].map((f) => `scripts/supertrader/tests/${f}.test.mjs`));

/** Parses TAP top-level results: [{ file, name, ok }]. */
export function parseTap(text, file) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^(not ok|ok) \d+ - (.*?)( # SKIP.*)?$/.exec(line);
    if (m) out.push({ file, name: m[2].replace(/\\#/g, '#'), ok: m[1] === 'ok', skipped: Boolean(m[3]) });
  }
  return out;
}

export function recordGoldenResults(outDir = ARTIFACT_DIR) {
  const results = [];
  for (const f of SF_TEST_FILES) {
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', f], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SF_RECORDING: '1' } });
    results.push(...parseTap(r.stdout, f));
  }
  const catalogue = JSON.parse(fs.readFileSync(path.join(ARTIFACT_DIR, 'STRATEGY-GOLDEN-CASE-CATALOGUE.json'), 'utf8'));
  const cases = catalogue.goldenTests.map((g) => {
    const [file, name] = g.test.split(': ');
    // exact id match within the file (review SF2-R4-07: 'GC-TUR-N' must not match 'GC-TUR-NOTIONAL')
    const ids = (t) => t.split(':')[0].split(' / ').map((x) => x.trim());
    const hit = results.find((r) => r.file === file && ids(r.name).includes(name));
    return { test: g.test, strategyIds: g.strategyIds, rules: g.rules, psr709: g.psr709, result: !hit ? 'NOT_FOUND' : hit.skipped ? 'SKIPPED' : hit.ok ? 'PASS' : 'FAIL' };
  });
  const summary = { goldenCases: cases.length, pass: cases.filter((c) => c.result === 'PASS').length, fail: cases.filter((c) => c.result === 'FAIL').length, notFound: cases.filter((c) => c.result === 'NOT_FOUND').length, testsRun: results.length, testsFailed: results.filter((r) => !r.ok).length, testsSkipped: results.filter((r) => r.skipped).length };
  const art = { schema: 'supertrader-sf-golden-case-results-1.0.0', rule: catalogue.rule, files: SF_TEST_FILES, summary, cases, otherTests: results.filter((r) => !cases.some((c) => c.test.startsWith(r.file))).length, allTests: results.map((r) => ({ file: r.file, name: r.name, result: r.skipped ? 'SKIPPED' : r.ok ? 'PASS' : 'FAIL' })) };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'STRATEGY-GOLDEN-CASE-RESULTS.json'), JSON.stringify(art, null, 1) + '\n');
  return art;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--out');
  const r = recordGoldenResults(i >= 0 ? path.resolve(a[i + 1]) : ARTIFACT_DIR);
  process.stdout.write(`golden cases ${r.summary.pass}/${r.summary.goldenCases} PASS, tests run ${r.summary.testsRun}, failed ${r.summary.testsFailed}, skipped ${r.summary.testsSkipped}\n`);
  if (r.summary.fail || r.summary.notFound || r.summary.testsFailed) process.exitCode = 1;
}
