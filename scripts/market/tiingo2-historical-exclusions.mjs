/** Durable exclusions from the confirmed debt cleanup. Membership is never
 * inferred from a fresh provider Stock label when the canonical decision is
 * a reviewed non-equity exclusion. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HISTORICAL_EXCLUSIONS_PATH = 'quant/config/tiingo2-historical-exclusions.json';
export const PROTECTED_CONSUMER_BASELINE_PATH = 'quant/config/tiingo2-protected-consumer-baseline.json';

export function assertProtectedConsumerBaseline(consumerRows, manifest) {
  if (!Array.isArray(consumerRows) || !Array.isArray(manifest?.rows) || manifest.count !== manifest.rows.length ||
      consumerRows.length < manifest.count) throw Error('PROTECTED_CONSUMER_BASELINE_COUNT_MISMATCH');
  const current = new Map();
  for (const row of consumerRows) {
    if (current.has(row.ticker)) throw Error('PROTECTED_CONSUMER_DUPLICATE_SYMBOL:' + row.ticker);
    current.set(row.ticker, row.securityId);
  }
  const baselineIds = new Set();
  for (const row of manifest.rows) {
    if (!row.ticker || !row.securityId || baselineIds.has(row.securityId) || current.get(row.ticker) !== row.securityId)
      throw Error('PROTECTED_CONSUMER_IDENTITY_REMOVED_OR_CHANGED:' + row.ticker);
    baselineIds.add(row.securityId);
  }
  return { original: manifest.count, current: consumerRows.length, additions: consumerRows.length - manifest.count, removals: 0 };
}

export function loadProtectedConsumerBaseline(root, consumerRows) {
  const manifest = JSON.parse(readFileSync(join(root, PROTECTED_CONSUMER_BASELINE_PATH), 'utf8'));
  if (manifest.schemaVersion !== 'tiingo2-protected-consumer-baseline-1' ||
      manifest.sourceCommit !== '88f23553fbf8799a9bbdc4a820f5b51a686ac015' || manifest.count !== 6397)
    throw Error('PROTECTED_CONSUMER_BASELINE_MANIFEST_INVALID');
  return assertProtectedConsumerBaseline(consumerRows, manifest);
}

export function loadHistoricalExclusions(root) {
  const manifest = JSON.parse(readFileSync(join(root, HISTORICAL_EXCLUSIONS_PATH), 'utf8'));
  const eligibility = JSON.parse(readFileSync(join(root, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  if (manifest.schemaVersion !== 'tiingo2-historical-exclusions-1' || manifest.baselineConsumer !== 6397 ||
      manifest.count !== 22 || manifest.rows?.length !== 22) throw Error('HISTORICAL_EXCLUSIONS_MANIFEST_INVALID');
  const decisions = new Map(eligibility.decisions.map(row => [row.ticker, row]));
  const protectedRows = new Map();
  for (const row of manifest.rows) {
    const decision = decisions.get(row.ticker);
    if (!row.historicallyExcluded || row.reasonCode !== 'CONFIRMED_NON_EQUITY_DEBT' ||
        row.priorDecision !== 'CONFIRMED_NON_EQUITY:DEBT' || !/^ref_[A-Z0-9]+$/.test(row.securityId) ||
        protectedRows.has(row.ticker) || decision?.securityId !== row.securityId ||
        decision.instrument_type !== 'DEBT' || decision.product_eligibility !== 'EXCLUDED' ||
        decision.product_eligibility_reason !== row.priorDecision) {
      throw Error('HISTORICAL_EXCLUSION_BASELINE_MISMATCH:' + row.ticker);
    }
    protectedRows.set(row.ticker, row);
  }
  return protectedRows;
}
