/** Read-only comparison of two committed market-refresh cache generations.
 * Emits focused provider-action evidence; never copies full history to Git. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Quality = require('../../quant/engines/market-quality.js');
const arg = (name) => {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1]) throw Error(`MISSING_${name.slice(2).toUpperCase()}`);
  return process.argv[at + 1];
};
const oldRoot = arg('--old-cache');
const newRoot = arg('--new-cache');
const output = arg('--out');
const affected = JSON.parse(readFileSync(arg('--affected'), 'utf8'));
if (affected.schemaVersion !== 'tiingo2-factor-affected30-1' || affected.tickers.length !== 30 ||
    new Set(affected.tickers).size !== 30) throw Error('INVALID_AFFECTED_POPULATION');

const fields = {
  raw: ['open', 'high', 'low', 'close', 'volume'],
  adjusted: ['adjustedOpen', 'adjustedHigh', 'adjustedLow', 'adjustedClose', 'adjustedVolume'],
  actions: ['splitFactor', 'dividend'],
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const rounded = (value) => finite(value) ? Math.round(value * 1e8) / 1e8 : null;
const select = (bar, keys) => Object.fromEntries(keys.map((key) => [key, bar?.[key] ?? null]));
const pathFor = (root, ticker) => join(root, 'tiingo', 'daily', `ref_${ticker}.json`);

function readPayload(root, ticker) {
  const payload = JSON.parse(readFileSync(pathFor(root, ticker), 'utf8'));
  if (payload.securityId !== `ref_${ticker}` || payload.provider !== 'tiingo' ||
      !Array.isArray(payload.bars) || !payload.bars.length) throw Error(`INVALID_CACHE_IDENTITY:${ticker}`);
  for (let i = 1; i < payload.bars.length; i++) {
    if (payload.bars[i - 1].date >= payload.bars[i].date) throw Error(`UNSORTED_CACHE_BARS:${ticker}`);
  }
  return payload;
}

function window(bars, date) {
  const at = bars.findIndex((bar) => bar.date === date);
  if (at < 0) return null;
  return bars.slice(Math.max(0, at - 1), Math.min(bars.length, at + 2)).map((bar) => ({
    date: bar.date,
    ...select(bar, fields.raw),
    ...select(bar, fields.adjusted),
    ...select(bar, fields.actions),
  }));
}

function examine(payload) {
  const assessment = Quality.assessSeries(payload, { today: '2026-10-03' });
  const consistency = Quality.validateAdjustmentConsistency(payload.bars, {
    claimedStatus: payload.adjustmentStatus,
    dividendConvention: 'TIINGO_REINVESTMENT_CLOSE',
  });
  const actions = Quality.classifyCorporateActions(payload.bars, {
    dividendConvention: 'TIINGO_REINVESTMENT_CLOSE',
  });
  const anomalies = consistency.findings.filter((item) => item.code === 'unexplained_adjustment_step');
  const byDate = new Map(payload.bars.map((bar, at) => [bar.date, at]));
  return {
    securityId: payload.securityId,
    provider: payload.provider,
    updatedAt: payload.updatedAt ?? null,
    adjustmentStatus: payload.adjustmentStatus ?? null,
    adjustmentClaim: payload.adjustmentClaim ?? null,
    bars: payload.bars.length,
    first: payload.bars[0].date,
    last: payload.bars.at(-1).date,
    hash: Object.fromEntries(Object.entries(fields).map(([kind, keys]) =>
      [kind, hash(payload.bars.map((bar) => [bar.date, ...keys.map((key) => bar[key] ?? null)]))])),
    quality: { status: assessment.status, reason: assessment.statusReason,
      findingCodes: [...new Set(assessment.findings.map((item) => item.code))].sort() },
    corporateActions: { counts: actions.counts,
      adverse: actions.events.filter((event) => ['BAD_SERIES', 'MISSING_PROVIDER_ACTION', 'UNKNOWN',
        'SUSPICIOUS_PRICE_BREAK'].includes(event.status)).map((event) => ({
        date: event.date, status: event.status, reason: event.reason,
        expectedFactorStep: rounded(event.evidence?.expectedFactorStep),
        observedFactorStep: rounded(event.evidence?.observedFactorStep),
        relativeError: rounded(event.evidence?.relativeError),
      })) },
    adjustmentAnomalies: anomalies.map((item) => {
      const date = item.context?.date ?? null;
      const at = byDate.get(date);
      const current = payload.bars[at];
      const previous = payload.bars[at - 1];
      const factorPrevious = finite(previous?.adjustedClose) && finite(previous?.close) && previous.close > 0
        ? previous.adjustedClose / previous.close : null;
      const factorCurrent = finite(current?.adjustedClose) && finite(current?.close) && current.close > 0
        ? current.adjustedClose / current.close : null;
      return {
        date,
        factorStep: rounded(factorCurrent && factorPrevious ? factorCurrent / factorPrevious : null),
        factorStepPct: rounded(factorCurrent && factorPrevious ? (factorCurrent / factorPrevious - 1) * 100 : null),
        rawCloseMovePct: rounded(finite(current?.close) && finite(previous?.close) && previous.close > 0
          ? (current.close / previous.close - 1) * 100 : null),
        adjustedCloseMovePct: rounded(finite(current?.adjustedClose) && finite(previous?.adjustedClose) &&
          previous.adjustedClose > 0 ? (current.adjustedClose / previous.adjustedClose - 1) * 100 : null),
        eventWindow: window(payload.bars, date),
      };
    }),
  };
}

function compareBars(oldBars, newBars) {
  const oldMap = new Map(oldBars.map((bar) => [bar.date, bar]));
  const newMap = new Map(newBars.map((bar) => [bar.date, bar]));
  const common = [...oldMap.keys()].filter((date) => newMap.has(date));
  const changes = {};
  for (const [kind, keys] of Object.entries(fields)) {
    const changedDates = common.filter((date) => keys.some((key) =>
      (oldMap.get(date)[key] ?? null) !== (newMap.get(date)[key] ?? null)));
    changes[kind] = { count: changedDates.length, first: changedDates[0] ?? null,
      last: changedDates.at(-1) ?? null };
  }
  return { sharedDates: common.length, addedDates: newMap.size - common.length,
    removedDates: oldMap.size - common.length, changes };
}

const rows = affected.tickers.map((ticker) => {
  const oldPayload = readPayload(oldRoot, ticker);
  const newPayload = readPayload(newRoot, ticker);
  const old = examine(oldPayload);
  const current = examine(newPayload);
  const eventDates = new Set([...old.adjustmentAnomalies, ...current.adjustmentAnomalies].map((e) => e.date));
  return { ticker, old, current, transition: compareBars(oldPayload.bars, newPayload.bars),
    eventComparison: [...eventDates].sort().map((date) => ({ date,
      old: old.adjustmentAnomalies.find((event) => event.date === date) ?? null,
      current: current.adjustmentAnomalies.find((event) => event.date === date) ?? null,
      oldWindow: window(oldPayload.bars, date), currentWindow: window(newPayload.bars, date) })) };
});
const report = { schemaVersion: 'tiingo2-factor-cache-comparison-1',
  source: { oldCacheKey: affected.oldMarketCacheKey, newCacheKey: affected.newMarketCacheKey,
    oldFactorInputCommit: affected.oldFactorInputCommit, newFactorInputCommit: affected.newFactorInputCommit },
  count: rows.length, rows };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ count: rows.length,
  oldWithUnexplained: rows.filter((row) => row.old.adjustmentAnomalies.length).length,
  newWithUnexplained: rows.filter((row) => row.current.adjustmentAnomalies.length).length,
  newAnomalies: rows.reduce((sum, row) => sum + row.current.adjustmentAnomalies.length, 0),
  rawChanged: rows.filter((row) => row.transition.changes.raw.count).length,
  adjustedChanged: rows.filter((row) => row.transition.changes.adjusted.count).length }));
