import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeUSQuality, calendarEvidence } from '../../scripts/market/finalize-marketstack-us-quality.mjs';
const calendar = { calendarId: 'test', coverage: { from: '2026-01-01', to: '2026-12-31' }, exchanges: { XNYS: { weekdays: [1,2,3,4,5], holidays: ['2026-09-07'] } } };
const flag = (status, extra = {}) => ({ securityId: 'ref_A', ticker: 'A', providerSymbol: 'A', exchange: 'NYSE', expectedMics: ['XNYS'],
  consumer: true, baselineInstrumentType: 'EQUITY_COMMON', companyName: 'A company', activeStatus: { baseline: 'ACTIVE' },
  identifiers: { canonicalCandidates: [{ instrumentId: 'vu_a', mic: 'XNYS' }] }, independentCurrentListing: { currentListing: { role: 'EQUITY_COMMON' } },
  latestQuality: { originalStatus: status, structuralReasonCodes: [], supplementaryRechecks: [] }, ...extra });
const inputs = row => [{ protectedBaselineSource: { sha256: 'base' }, asOfDate: '2026-10-01', generatedAt: 'fixed', rows: [row] },
  { baselineSource: { sha256: 'base' }, rows: [{ securityId: 'ref_A', providerSymbol: 'A', mic: 'XNYS', expectedCurrency: 'USD', status: row.latestQuality.originalStatus,
    observation: { marketTimestamp: '2026-09-30', reportedCurrency: 'THB', close: 987654321, volume: 12345678 } }] }];
test('original currency contract defect is categorized without inventing conversion or identity cause and remains rejected', () => {
  const output = finalizeUSQuality(...inputs(flag('CURRENCY_MISMATCH')), [], calendar);
  const row = output.rows[0]; assert.equal(row.classification, 'PROVIDER_DATA_QUALITY'); assert.match(row.causal_certainty, /ROOT_CAUSE_UNVERIFIED/);
  assert.deepEqual(row.evidence.wrongCurrencyPossibleCauses, ['INCORRECT_PROVIDER_CURRENCY_METADATA','PRICE_IDENTITY_MAPPING_COLLISION']);
  assert.equal(row.safe_for_eod, false); assert.equal(row.safe_for_quant, false); assert.equal(row.safe_for_chart, false);
  assert.equal(row.listing_id, null); assert.equal(row.legacy_instrument_id, 'vu_a'); assert.ok(!JSON.stringify(output).includes('987654321')); assert.ok(!JSON.stringify(output).includes('12345678'));
});
test('documented venue removal explains old quote but cannot release it for current prices or Quant', () => {
  const row = flag('STALE_LATEST_ACTIVE', { activeStatus: { baseline: 'ACTIVE', officialBaselineListingRemovalFiled: true } });
  const output = finalizeUSQuality(...inputs(row), [], calendar); assert.equal(output.rows[0].classification, 'DELISTED');
  assert.equal(output.totals.independentlyExplainedVenueRemoval, 1); assert.equal(output.totals.unsafe, 1); assert.equal(output.totals.safeForEOD, 0);
});
test('current directory absence and old Tiingo reference are insufficient to declare suspension or delisting', () => {
  const args = inputs(flag('STALE_LATEST_ACTIVE', { independentCurrentListing: { currentListing: null } }));
  args[1].rows[0].observation.marketTimestamp = '2026-08-21';
  const output = finalizeUSQuality(...args, [], calendar, { ref_A: { points: [['2026-09-25', 1]] } });
  assert.equal(output.rows[0].classification, 'UNKNOWN'); assert.equal(output.rows[0].evidence.localTiingo.referenceNewerThanFlag, true);
  assert.ok(output.rows[0].evidence.calendar.completedSessionsAfterObservation > 20); assert.equal(output.totals.staleFlagsCalendarExplained, 0);
});
test('role conflict can attribute current baseline mapping contradiction, while unsupported attribution remains UNKNOWN', () => {
  const currentETF = flag('ASSET_TYPE_MISMATCH', { independentCurrentListing: { currentListing: { role: 'ETF' } } });
  assert.equal(finalizeUSQuality(...inputs(currentETF), [], calendar).rows[0].classification, 'IDENTITY_MAPPING_ERROR');
  const unverified = flag('ASSET_TYPE_MISMATCH', { independentCurrentListing: { currentListing: null } });
  assert.equal(finalizeUSQuality(...inputs(unverified), [], calendar).rows[0].classification, 'UNKNOWN');
});
test('calendar excludes unfinished audit-day session and counts prior completed sessions only', () => {
  assert.equal(calendarEvidence(calendar, 'XNYS', '2026-09-30', '2026-10-01').completedSessionsAfterObservation, 0);
  assert.equal(calendarEvidence(calendar, 'XNYS', '2026-09-04', '2026-09-08').completedSessionsAfterObservation, 0);
  assert.equal(calendarEvidence(calendar, 'XNYS', '2026-09-04', '2026-09-09').completedSessionsAfterObservation, 1);
  assert.equal(calendarEvidence(calendar, 'XNAS', '2026-09-04', '2026-09-09').status, 'UNVERIFIED_CALENDAR_COVERAGE');
});
test('source hash/identity disagreement fails closed and fixed timestamp replay is deterministic', () => {
  const args = inputs(flag('INVALID_OHLC')); const a = finalizeUSQuality(...args, [], calendar), b = finalizeUSQuality(...args, [], calendar);
  assert.deepEqual(a, b); args[1].rows[0].status = 'VALID_LATEST'; assert.throws(() => finalizeUSQuality(...args, [], calendar), /disagreement/);
});

test('new official cover/removal and explicit ticker transition explanations remain unsafe and cannot backdate generatedAt',()=>{
  const args=inputs(flag('STALE_LATEST_ACTIVE'));
  const removals={generatedAt:'2026-10-01T19:00:00Z',rows:[{securityId:'ref_A',expectedStaleObservationExplained:true,corporateActionEvidence:[]}]};
  const result=finalizeUSQuality(...args,[],calendar,{}, {generatedAt:'2026-10-01T17:00:00Z',removals});
  assert.equal(result.generatedAt,'2026-10-01T19:00:00.000Z');assert.equal(result.rows[0].classification,'EXPECTED_STALE');assert.equal(result.rows[0].safe_for_eod,false);
  removals.rows[0].expectedStaleObservationExplained=false;removals.rows[0].corporateActionEvidence=[{oldSymbol:'A',newSymbol:'B'}];
  const renamed=finalizeUSQuality(...args,[],calendar,{}, {removals});assert.equal(renamed.rows[0].classification,'CORPORATE_ACTION');assert.equal(renamed.rows[0].safe_for_quant,false);
});

test('literal independently quoted subordinated notes distinguish role mismatch from unexplained type conflict',()=>{
  const row=flag('ASSET_TYPE_MISMATCH',{independentCurrentListing:{currentListing:{role:'UNKNOWN',securityName:'Issuer 4.5% Perpetual Subordinated Notes'}}});
  const result=finalizeUSQuality(...inputs(row),[],calendar);assert.equal(result.rows[0].classification,'IDENTITY_MAPPING_ERROR');assert.equal(result.rows[0].evidence.independentlyExplicitCurrentRole,'BOND');
});
