#!/usr/bin/env node
/**
 * Supertrader 9 – the only plaintext a V13 study workflow run (supertrader-st9-v13-study.yml) shows: status, audit
 * pass, number of audit violations and the hashes of the receipt. Whitelisted fields with checked formats; everything
 * else of st9-v13-delisted.public.json (counts per method, census, coverage) stays in the encrypted artifact.
 *
 *   node scripts/supertrader/snapshot/st9-study-summary.mjs <st9-v13-delisted.public.json> <runner exit code>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUSES = Object.freeze(['COMPLETE', 'EXECUTION_AUDIT_FAILED']);
const HEX = /^[0-9a-f]{64}$/;
const hex = (v) => (typeof v === 'string' && HEX.test(v) ? v : 'INVALID');

/** pub: parsed public part or null (runner refused before writing). */
export function summarize(pub, exitCode) {
  const code = Number.isInteger(exitCode) ? exitCode : 'UNKNOWN';
  if (!pub || typeof pub !== 'object') return { status: 'NO_RESULT', runnerExitCode: code };
  const r = pub.receipt ?? {}, ex = pub.historicalInfrastructure?.execution ?? {};
  let violations = 0;
  for (const m of Object.values(ex.methods ?? {})) for (const f of ['A', 'B']) { const n = m?.[f]?.audit?.violationCount; violations += Number.isInteger(n) && n >= 0 ? n : 0; }
  return {
    status: STATUSES.includes(pub.status) ? pub.status : 'INVALID',
    runnerExitCode: code,
    auditPass: ex.pass === true,
    auditViolations: violations,
    resultSha256: hex(r.resultSha256),
    inputFingerprint: hex(r.inputFingerprint),
    datasetSha256: hex(r.datasetSha256),
    registrationSha256: hex(r.registrationSha256),
  };
}

export function markdown(s) {
  return ['### Supertrader 9 – V13-Studie (Ergebnisse verschlüsselt im Artefakt)', '', '| Feld | Wert |', '|---|---|', ...Object.entries(s).map(([k, v]) => `| ${k} | \`${v}\` |`), ''].join('\n');
}

function main() {
  const [file, exit] = process.argv.slice(2);
  let pub = null;
  try { if (file && fs.existsSync(file)) pub = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { pub = null; }
  process.stdout.write(markdown(summarize(pub, /^\d+$/.test(exit ?? '') ? Number(exit) : null)) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
