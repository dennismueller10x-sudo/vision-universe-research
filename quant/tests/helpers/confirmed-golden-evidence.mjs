/* Historical evidence is bounded by the producer's committed measurement.
   Current provider rows are never silently substituted for that measurement. */
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
export const ROOT = new URL('../../../', import.meta.url);
export const confirmedEvidence = JSON.parse(readFileSync(new URL('../fixtures/confirmed-total-return-report.json', import.meta.url), 'utf8'));
export const confirmedReport = confirmedEvidence.report;
export function confirmedPayload(ticker) {
  assert.equal(confirmedReport.verdict, 'TOTAL_RETURN_CONFIRMED', 'historical report must actually certify its recorded interval');
  const measured = confirmedReport.series.find((s) => s.ticker === ticker);
  assert.ok(measured && /^\d{4}-\d{2}-\d{2}$/.test(measured.to), ticker + ': missing confirmed interval');
  const payload = JSON.parse(readFileSync(new URL('quant/data/market/golden-preview/daily/' + measured.securityId + '.json', ROOT), 'utf8'));
  const bars = payload.bars.filter((b) => b.date.slice(0,10) >= measured.from && b.date.slice(0,10) <= measured.to);
  assert.equal(bars.length, measured.barCount, ticker + ': historical input interval no longer reproduces the report');
  assert.equal(bars[0].date.slice(0,10), measured.from);
  assert.equal(bars.at(-1).date.slice(0,10), measured.to);
  return {...payload, bars, first: measured.from, last: measured.to};
}
export function confirmedSandbox() {
  const directory = mkdtempSync(join(tmpdir(), 'vu-confirmed-golden-'));
  mkdirSync(join(directory, 'scripts/market'), {recursive:true});
  mkdirSync(join(directory, 'quant/data/market/golden-preview/daily'), {recursive:true});
  copyFileSync(new URL('scripts/market/verify-total-return-capability.mjs', ROOT), join(directory, 'scripts/market/verify-total-return-capability.mjs'));
  for (const row of confirmedReport.series) writeFileSync(join(directory, 'quant/data/market/golden-preview/daily', row.securityId + '.json'), JSON.stringify(confirmedPayload(row.ticker)));
  return {directory, cleanup: () => rmSync(directory, {recursive:true, force:true})};
}
