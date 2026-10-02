import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConsumerPolicy, identityGate, classifyCandidate, buildPolicyReport, previewPublication } from '../../scripts/market/tiingo2-policy.mjs';

const today = '2026-10-02';
function ready(ticker = 'NEW') {
  return { ticker, securityId: `ref_${ticker}`, instrument_type: 'EQUITY_COMMON', active: true,
    evidence: { identity: { resolved: true }, price: { historyValid: true, latestValid: true, latestDate: '2026-10-01', corporateActionValid: true }, sec: { cik: '0001234567', available: true, pitValid: true }, factors: { materialized: true, basisValid: true }, products: { discoverReady: true, screenerReady: true, superTraderReady: true } } };
}
test('staging requires every price/identity/action gate; SEC existence never fabricates factors', () => {
  const row = ready('CART');
  assert.equal(classifyCandidate(row, { today }).decision, 'AUTO_ACCEPT');
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
