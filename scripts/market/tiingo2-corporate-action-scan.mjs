#!/usr/bin/env node
// Read-only replay. Outputs diagnoses and dates, never provider price bars.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const Quality = require('../../quant/engines/market-quality.js');

export function normalizeCorporateActionBars(bars) {
  return bars.map(b => ({ ...b, date: String(b.date).slice(0, 10),
    adjustedClose: b.adjustedClose ?? b.adjClose ?? null,
    dividend: b.dividend ?? b.divCash ?? null }));
}

export function scanCorporateActionSeries(series) {
  const results = series.map(payload => {
    const bars = normalizeCorporateActionBars(payload.bars || []);
    const adjustment = Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' });
    const actions = Quality.classifyCorporateActions(bars);
    // This reproduces the old decision's trigger, without inferring whether
    // an action exists from the size of the market return.
    const oldFalseRejectDates = adjustment.observed.splitEvidence.filter(e =>
      e.rawMovePct >= Quality.DEFAULTS.splitJumpPct &&
      e.adjustedMovePct > Quality.DEFAULTS.splitResidualPct).map(e => e.date);
    return {
      ticker: payload.ticker || payload.securityId || 'UNKNOWN',
      companyName: payload.name || payload.companyName || null,
      sourceSha256: payload.sourceSha256 || createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      barCount: bars.length, firstDate: bars[0]?.date || null, latestDate: bars.at(-1)?.date || null,
      adjustmentGatePassed: adjustment.ok, corporateActionGateStatus: actions.status,
      corporateActionGatePassed: actions.ok, reviewRequired: actions.reviewRequired,
      splitFalseRejectionFixed: adjustment.ok && oldFalseRejectDates.length > 0,
      falseRejectionDates: oldFalseRejectDates,
      counts: actions.counts,
      events: actions.events.map(e => ({ date: e.date, status: e.status, reason: e.reason })),
      adjustmentFindingCodes: [...new Set(adjustment.findings.map(f => f.code))].sort(),
    };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker) || a.sourceSha256.localeCompare(b.sourceSha256));
  const classifications = {};
  for (const result of results) classifications[result.corporateActionGateStatus] =
    (classifications[result.corporateActionGateStatus] || 0) + 1;
  return { schemaVersion: 1, rule: 'TIINGO_ACTION_FACTOR_COHERENCE_V2',
    rawPricePublication: false, productionModified: false,
    summary: { seriesChecked: results.length,
      falseSplitRejectionsFixed: results.filter(r => r.splitFalseRejectionFixed).length,
      distinctTickersFixed: [...new Set(results.filter(r => r.splitFalseRejectionFixed).map(r => r.ticker))].sort(),
      classifications }, results };
}

function readInput(input) {
  if (statSync(input).isDirectory()) {
    return readdirSync(input).filter(f => f.endsWith('.json')).sort()
      .map(f => JSON.parse(readFileSync(join(input, f), 'utf8'))).filter(p => Array.isArray(p.bars));
  }
  const report = JSON.parse(readFileSync(input, 'utf8'));
  if (Array.isArray(report)) return report;
  if (Array.isArray(report.series)) return report.series;
  if (Array.isArray(report.bars)) return [report];
  // Accepted PR346 private account evidence bundle, where each EOD response
  // may contain an overlap or full history. Keep windows separate.
  if (Array.isArray(report.responses)) return report.responses
    .filter(r => Array.isArray(r.payload) && r.payload.some(b => b && typeof b.close === 'number'))
    .map(r => {
      const url = r.request?.url || r.url || '';
      const match = String(url).match(/daily\/([^/?]+)\/prices/);
      const ref = r.references?.find(p => p.ticker || p.symbol);
      return { ticker: ref?.ticker || ref?.symbol || match?.[1]?.toUpperCase() ||
          r.ticker || r.references?.[0]?.id || 'UNKNOWN',
        sourceSha256: r.sha256, bars: r.payload };
    });
  throw new Error(`UNSUPPORTED_EVIDENCE_INPUT:${basename(input)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: tiingo2-corporate-action-scan.mjs private-series-dir-or-evidence.json output.json');
  const report = scanCorporateActionSeries(readInput(input));
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report.summary) + '\n');
}
