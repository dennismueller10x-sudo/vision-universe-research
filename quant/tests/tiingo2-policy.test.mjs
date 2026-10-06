import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateConsumerPolicy, identityGate, classifyCandidate, buildPolicyReport, previewPublication } from '../../scripts/market/tiingo2-policy.mjs';
const require = createRequire(import.meta.url);
const Factors = require('../engines/market-factors.js');
const FactorEvidence = require('../engines/factor-evidence.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const today = '2026-10-02';
function ready(ticker = 'NEW') {
  return { ticker, securityId: `ref_${ticker}`, instrument_type: 'EQUITY_COMMON', active: true,
    evidence: { identity: { resolved: true }, price: { historyValid: true, latestValid: true, latestDate: '2026-10-01', corporateActionValid: true }, sec: { cik: '0001234567', available: true, pitValid: true }, factors: { materialized: true, basisValid: true }, products: { discoverReady: true, screenerReady: true, superTraderReady: true } } };
}
test('staging requires every price/identity/action gate; SEC existence never fabricates factors', () => {
  const row = ready('CART');
  assert.equal(classifyCandidate(row, { today }).decision, 'AUTO_ACCEPT');
  assert.equal(classifyCandidate(row, { today }).productReadiness.quant, false, 'private calculation is not a canonical Quant artifact');
  row.evidence.factors.materialized = false;
  assert.equal(classifyCandidate(row, { today }).productReadiness.quant, false);
  assert.equal(classifyCandidate(row, { today }).publicationReady, true);
  for (const field of ['historyValid', 'latestValid', 'corporateActionValid']) {
    const incomplete = ready(); delete incomplete.evidence.price[field];
    assert.equal(classifyCandidate(incomplete, { today }).publicationReady, false, field);
  }
  const unresolved = ready(); delete unresolved.evidence.identity.resolved;
  assert.equal(classifyCandidate(unresolved, { today }).publicationReady, false);
});
test('short IPO history keeps membership and Search without claiming a chart', () => {
  const row = ready('CHWM');
  row.evidence.price.bars = 2;
  row.evidence.price.quality = 'FAIL';
  const short = classifyCandidate(row, { today });
  assert.equal(short.publicationReady, true);
  assert.equal(short.productReadiness.search, true);
  assert.equal(short.productReadiness.watchlist, true);
  assert.equal(short.productReadiness.chart, false);
  assert.ok(short.reasonCodes.includes('INSUFFICIENT_CHART_HISTORY'));
  row.evidence.price.bars = 5;
  const sufficient = classifyCandidate(row, { today });
  assert.equal(sufficient.productReadiness.chart, true);
  assert.ok(!sufficient.reasonCodes.includes('INSUFFICIENT_CHART_HISTORY'));
});
test('HOS 21 bars and DNA private arithmetic cannot certify Quant or Factor DNA delivery', () => {
  const bars = Array.from({ length: 21 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, i + 2)).toISOString().slice(0, 10), open: 10 + i, high: 11 + i, low: 9 + i, close: 10 + i, volume: 1000, adjustedOpen: 10 + i, adjustedHigh: 11 + i, adjustedLow: 9 + i, adjustedClose: 10 + i, adjustedVolume: 1000, splitFactor: 1, dividend: 0 }));
  const calculated = Factors.computeFactors({ ticker: 'HOS', bars, adjustmentStatus: 'adjusted' }, { module: 'quantV2Momentum' });
  assert.equal(calculated.status, 'OK');
  assert.equal(calculated.fieldStatus.sma200, 'INSUFFICIENT_HISTORY');
  assert.equal(calculated.fieldStatus.relativeStrength12M1M, 'SOURCE_MISSING');
  for (const ticker of ['HOS', 'DNA']) {
    const row = ready(ticker);
    row.evidence.factors = { materialized: true, basisValid: true, calculation: { state: 'PARTIAL', bars: 21 }, canonicalEvidence: { state: 'NOT_MATERIALIZED', verified: false, artifactSha256: null } };
    row.evidence.products.quantReady = true;
    const result = classifyCandidate(row, { today });
    assert.equal(result.publicationReady, true, 'price membership preconditions remain separate');
    assert.equal(result.productReadiness.quantCandidateEligible, true);
    assert.equal(result.productReadiness.quant, false);
    assert.equal(result.productReadiness.factorsMaterialized, false);
    assert.equal(result.productReadiness.discover, false);
    assert.equal(result.dataReadiness.marketCalculationState, 'PARTIAL');
    assert.ok(result.reasonCodes.includes('CANONICAL_FACTOR_EVIDENCE_REQUIRED'));
  }
});
test('Quant product readiness requires exact existing canonical artifact bytes, record binding and affirmative product gate', () => {
  const artifactPath = 'quant/data/product/factor-evidence-v1/AA.json.gz';
  const bytes = readFileSync(join(root, artifactPath)), artifact = JSON.parse(gunzipSync(bytes));
  const record = artifact.securities.AA, row = ready('AA');
  row.evidence.sec.cik = record.cik; row.evidence.price.latestDate = record.asOf;
  row.evidence.factors.canonicalEvidence = { state: 'MATERIALIZED', verified: true, artifactPath, artifactSha256: createHash('sha256').update(bytes).digest('hex'), schemaVersion: artifact.schemaVersion, methodologyVersion: artifact.methodologyVersion, ticker: record.ticker, securityId: record.securityId, asOf: record.asOf };
  assert.equal(classifyCandidate(row, { today: record.asOf }).productReadiness.quant, false, 'artifact alone cannot assert product gate');
  row.evidence.products.quantReady = true;
  const valid = classifyCandidate(row, { today: record.asOf });
  assert.equal(valid.productReadiness.quant, true);
  assert.deepEqual(valid.dataReadiness.availableCanonicalFactors, FactorEvidence.FACTOR_ORDER.filter((id) => record.factors[id].state === 'AVAILABLE'));
  assert.equal(valid.productReadiness.fullQuantScoreReady, false, 'existing full-7F methodology remains inactive');
  for (const patch of [{ artifactSha256: '0'.repeat(64) }, { schemaVersion: 'invented' }, { methodologyVersion: 'invented' }, { securityId: 'ref_SOMETHING_ELSE' }, { ticker: 'OTHER' }, { asOf: '1999-01-01' }, { verified: false }, { artifactPath: '../../outside.json.gz' }]) {
    const wrong = structuredClone(row); Object.assign(wrong.evidence.factors.canonicalEvidence, patch);
    assert.equal(classifyCandidate(wrong, { today: record.asOf }).productReadiness.quant, false, JSON.stringify(patch));
  }
  const wrongCik = structuredClone(row); wrongCik.evidence.sec.cik = '0000000001';
  assert.equal(classifyCandidate(wrongCik, { today: record.asOf }).productReadiness.quant, false, 'same symbol cannot borrow another SEC issuer');
});
test('intentional consumer policy is retained; bank/REIT names and SIC are not heuristics', () => {
  for (const [name, instrument_type, sic] of [['River Bank Software', 'EQUITY_COMMON', '7372'], ['A REIT', 'REIT', '6798'], ['A Bank', 'EQUITY_COMMON', '6022']]) assert.equal(evaluateConsumerPolicy({ name, instrument_type, sic }).included, true);
  const excluded = ready(); excluded.consumerPolicy = { included: false, reasonCodes: ['EXCLUDED_BANK'] };
  assert.equal(classifyCandidate(excluded, { today }).decision, 'REJECT_WITH_REASON');
  assert.ok(classifyCandidate(excluded, { today }).reasonCodes.includes('EXCLUDED_BANK'));
});
test('preferred/funds/warrants never auto publish; UNKNOWN remains visible for existing members', () => {
  for (const instrument_type of ['PREFERRED', 'ETF', 'FUND', 'WARRANT', 'UNIT', 'RIGHT', 'TEST']) {
    assert.equal(classifyCandidate({ ...ready(), instrument_type }, { today }).decision, 'REJECT_WITH_REASON');
  }
  assert.equal(evaluateConsumerPolicy({ instrument_type: 'UNKNOWN' }).status, 'REVIEW');
  assert.equal(evaluateConsumerPolicy({ instrument_type: 'UNKNOWN' }, { baselineConsumer: true }).status, 'INCLUDED');
});
test('share classes and same issuer survive; explicit aliases alone are deduplicated', () => {
  for (const symbols of [['BRK.A', 'BRK.B'], ['GOOG', 'GOOGL']]) {
    const rows = symbols.map((t) => ({ ...ready(t), companyId: 'same-company', cik: '0001234567', name: 'Same issuer' }));
    for (const row of rows) assert.equal(identityGate(row, rows).passed, true);
  }
  const alias = ready('BRK-A'); alias.evidence.identity.aliasOf = 'BRK.A';
  assert.equal(identityGate(alias).passed, true, 'unverified alias is not a merge instruction');
  alias.evidence.identity.aliasVerified = true;
  assert.equal(classifyCandidate(alias, { today }).decision, 'REJECT_WITH_REASON');
  const collision = ready('BRK.B'); collision.securityId = 'ref_BRK.A'; collision.shareClass = 'B';
  const peer = { ...ready('BRK.A'), shareClass: 'A' };
  assert.ok(identityGate(collision, [peer]).reasonCodes.includes('SECURITY_ID_COLLISION'));
});
test('inactive, stale, future prices and symbol collisions cannot auto publish', () => {
  for (const date of ['2026-09-01', '2026-10-03', '2026-02-31', null]) {
    const row = ready(); row.evidence.price.latestDate = date;
    assert.equal(classifyCandidate(row, { today }).publicationReady, false);
  }
  const inactive = ready(); inactive.active = false;
  assert.equal(classifyCandidate(inactive, { today }).decision, 'REJECT_WITH_REASON');
  const collision = ready(); collision.evidence.identity.symbolCollision = true;
  assert.equal(classifyCandidate(collision, { today }).decision, 'MANUAL_REVIEW');
});
test('preview is idempotent on repeated rows and fails closed on conflicting candidates', () => {
  const a = classifyCandidate(ready('IPO'), { today });
  assert.equal(previewPublication([], [a, a]).counts.after, 1);
  assert.equal(previewPublication([], [a, { ...a, securityId: 'another-security' }]).counts.after, 0);
  assert.equal(previewPublication([], [a, { ...a, publicationReady: false }]).counts.after, 0);
  const alias = { ...a, ticker: 'RENAMED' };
  assert.equal(previewPublication([ready('IPO')], [alias]).counts.after, 1, 'new ticker with existing canonical ID needs an alias migration');
  assert.deepEqual(previewPublication([], [a, alias, { ...alias, ticker: 'THIRD_ALIAS' }]).ADDED, [], 'same canonical ID under distinct tickers is ambiguous');
  const missingId = ready(); delete missingId.securityId;
  assert.equal(classifyCandidate(missingId, { today }).publicationReady, false);
  const sameSymbol = ready('IPO'); sameSymbol.securityId = 'another-security';
  assert.ok(buildPolicyReport([ready('IPO'), sameSymbol], { today }).rows.every((r) => !r.publicationReady));
});
test('confirmed false corporate-action rejection is staged until repaired', () => {
  const row = ready('DNA'); row.evidence.price.corporateActionValid = false;
  row.evidence.price.corporateActionFalseRejectionConfirmed = true;
  const pending = classifyCandidate(row, { today });
  assert.equal(pending.decision, 'ACCEPT_AFTER_FIX'); assert.equal(pending.publicationReady, false);
  row.evidence.price.corporateActionValid = true; row.evidence.price.corporateActionFixed = true;
  const fixed = classifyCandidate(row, { today });
  assert.equal(fixed.decision, 'ACCEPT_AFTER_FIX'); assert.equal(fixed.publicationReady, true);
});
test('preview is additive, preserves missing/delisted existing titles and cannot publish pending fixes', () => {
  const baseline = [ready('KEEP'), ready('HISTORICAL')];
  const delisted = ready('KEEP'); delisted.active = false;
  const pending = ready('DNA'); pending.evidence.price.corporateActionValid = false;
  pending.evidence.price.corporateActionFalseRejectionConfirmed = true;
  const report = buildPolicyReport([delisted, pending, ready('IPO')], { today });
  const preview = previewPublication(baseline, report.rows);
  assert.deepEqual(preview.ADDED.map((r) => r.ticker), ['IPO']);
  assert.deepEqual(preview.REMOVED, []);
  assert.deepEqual(preview.UNCHANGED, ['HISTORICAL', 'KEEP']);
  assert.equal(preview.counts.after, 3);
  assert.equal(preview.RECLASSIFIED[0].action, 'RETAIN_EXISTING_MEMBER');
  assert.deepEqual(buildPolicyReport([ready('B'), ready('A')], { today }), buildPolicyReport([ready('A'), ready('B')], { today }));
});
