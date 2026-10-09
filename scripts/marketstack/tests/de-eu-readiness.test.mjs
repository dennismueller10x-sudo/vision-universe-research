import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Identity from '../../../core/identity.js';
import Features from '../../../quant/engines/technical/feature-store.js';
import { evaluateListingReadiness, evaluateUniverseReadiness } from '../de-eu-readiness.mjs';

// Deliberately synthetic fixture. Its weekday calendar is not a real exchange
// calendar and its evidence is never used as source/provider certification.
function fixture(n = 300) {
  const dates = [];
  const day = new Date('2026-10-05T00:00:00Z');
  while (dates.length < n) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.unshift(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() - 1);
  }
  const ref = ['synthetic-fixture-only'];
  const listing = { companyId: 'synthetic-company', securityId: Identity.securityIdForTicker('SYNTHETIC.LOCAL'),
    listingId: 'synthetic-listing-XETR', isin: 'DE0000000000', mic: 'XETR', currency: 'EUR', indices: ['DAX', 'TecDAX'] };
  const bars = dates.map((date, i) => ({ date, open: 100 + i * 0.15,
    high: 102 + i * 0.15, low: 98 + i * 0.15, close: 101 + i * 0.15 + Math.sin(i / 7), volume: 10000 + i * 2 }));
  return { listing, history: { bars, source: 'synthetic-test', apiVersion: 'fixture-v1', sourceEvidence: ref,
    adjustmentStatus: { verified: true, priceSeriesType: 'SPLIT_ADJUSTED', evidence: ref }, quality: { issues: [] } },
  asOf: '2026-10-06', verifiedWindow: { start: dates[0], end: dates.at(-1), evidence: ref },
  metadata: { identityVerified: true, identityEvidence: ref, currencyVerified: true, currencyEvidence: ref, quoteUnit: 'MAJOR',
    referenceVerified: true, referenceEvidence: ref,
    calendar: { verified: true, mic: 'XETR', expectedSessions: dates, expectedLastSession: dates.at(-1), evidence: ref },
    volume: { verified: true, unit: 'SHARES', adjustmentBasis: 'SPLIT_ADJUSTED', evidence: ref },
    rights: { privateDevelopment: true, publicDisplay: false, evidence: ref },
    productIntegration: {}, fundamentals: { verified: false }, shareBasis: { verified: false }, fx: { verified: false } } };
}
const fn = (input) => evaluateListingReadiness(input).functions;

test('canonical indexMemberships supports metadata filters without any price history',()=>{
 const input=fixture();input.listing.indexMemberships=input.listing.indices;delete input.listing.indices;input.history={};
 assert.equal(fn(input).indexRegionFilters.status,'READY');
 input.metadata.referenceVerified=false;assert.equal(fn(input).indexRegionFilters.status,'BLOCKED');
});

test('verified local series uses unchanged engines, without assigning Quant or Supertrader scores', () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const result = fn(input);
  for (const name of ['privateCloseChart', 'latestEod', 'indexRegionFilters', 'sma20', 'sma50', 'sma200', 'range52w', 'momentumEngine', 'volatilityEngine', 'volumeEngine']) {
    assert.equal(result[name].status, 'READY', name);
    assert.ok(result[name].evidence.length > 0, name);
  }
  assert.equal(result.sma20.value.sma20, Features.sma(input.history.bars.map((b) => b.close), 20).at(-1));
  assert.equal(result.quantFullScore.status, 'BLOCKED');
  assert.ok(result.quantFullScore.causes.includes('MISSING_FUNDAMENTALS'));
  assert.ok(result.supertraderInputs.causes.includes('MISSING_FX_OR_SHARE_BASIS'));
  assert.equal(result.publishedBacktest.status, 'BLOCKED');
  assert.equal(result.publicDisplay.status, 'BLOCKED');
  assert.equal(result.quantFullScore.value, undefined);
  assert.equal(before, JSON.stringify(input), 'pure evaluator must not mutate input');
});

test('unknown/raw/total-return adjustments allow a private close chart but block technical levels', () => {
  for (const basis of ['UNKNOWN', 'RAW', 'TOTAL_RETURN']) {
    const input = fixture(); input.history.adjustmentStatus.priceSeriesType = basis;
    const result = fn(input);
    assert.equal(result.privateCloseChart.status, 'READY');
    assert.equal(result.latestEod.status, 'READY');
    assert.equal(result.sma20.status, 'BLOCKED');
    assert.ok(result.sma20.causes.includes('UNKNOWN_ADJUSTMENT_BASIS'));
    assert.equal(result.sma20.value, undefined);
  }
});

test('already adjusted input is not split-adjusted a second time', () => {
  const input = fixture();
  input.history.bars.forEach((b) => { b.splitFactor = 4; b.adjustmentFactor = 4; });
  const result = fn(input);
  assert.equal(result.sma50.value.sma50, Features.sma(input.history.bars.map((b) => b.close), 50).at(-1));
  assert.equal(result.latestEod.status, 'READY');
});

test('an omitted local session is not hidden by an intersection or filled bar', () => {
  const input = fixture(); input.history.bars.splice(180, 1);
  const result = fn(input);
  assert.equal(result.privateCloseChart.status, 'READY');
  assert.equal(result.sma20.status, 'BLOCKED');
  assert.ok(result.sma20.causes.includes('MISSING_HISTORY'));
  assert.equal(input.history.bars.length, 299);
});

test('duplicates and unordered rows are rejected before the canonical adapter can normalise them', () => {
  for (const change of [(bars) => bars.splice(8, 0, { ...bars[8] }), (bars) => bars.reverse()]) {
    const input = fixture(); change(input.history.bars);
    const result = fn(input);
    assert.equal(result.privateCloseChart.status, 'BLOCKED');
    assert.equal(result.sma20.status, 'BLOCKED');
    assert.ok(result.sma20.causes.includes('PROVIDER_DATA_DEFECT'));
  }
});

test('short genuine history exposes only warmed-up functions', () => {
  const result = fn(fixture(30));
  assert.equal(result.privateCloseChart.status, 'READY');
  assert.equal(result.sma20.status, 'READY');
  assert.equal(result.momentum1M.status, 'READY');
  assert.equal(result.realizedVolatility20d.status, 'READY');
  for (const name of ['sma50', 'sma200', 'range52w', 'momentum12M']) {
    assert.equal(result[name].status, 'BLOCKED');
    assert.ok(result[name].causes.includes('SHORT_HISTORY'));
    assert.equal(result[name].value, undefined);
  }
});

test('a close-only cache supports private prices while explicitly withholding OHLC-dependent features', () => {
  const input = fixture(); input.history.bars = input.history.bars.map(({ date, close }) => ({ date, close }));
  const result = evaluateListingReadiness(input);
  assert.equal(result.functions.privateCloseChart.status, 'READY');
  assert.equal(result.functions.latestEod.status, 'READY');
  assert.equal(result.functions.sma20.status, 'BLOCKED');
  assert.ok(result.functions.sma20.causes.includes('MISSING_HISTORY'));
  assert.ok(!result.functions.sma20.causes.includes('PROVIDER_DATA_DEFECT'));
  assert.deepEqual(result.inputSummary.missingOhlcFields, ['open', 'high', 'low']);
});

test('volume status is independent from prices, including null and zero volume', () => {
  const missing = fixture(); missing.history.bars.forEach((b) => { b.volume = null; });
  const a = fn(missing);
  assert.equal(a.sma200.status, 'READY');
  assert.equal(a.privateCloseChart.status, 'READY');
  assert.equal(a.volumeEngine.status, 'BLOCKED');
  assert.ok(a.relativeVolume.causes.includes('PROVIDER_DATA_DEFECT'));
  assert.equal(missing.history.bars[0].volume, null, 'never coerce null into zero');
  const zero = fixture(); zero.history.bars.forEach((b) => { b.volume = 0; });
  const b = fn(zero);
  assert.equal(b.latestEod.status, 'READY');
  assert.equal(b.sma20.status, 'READY');
  assert.equal(b.relativeVolume.status, 'BLOCKED', 'no relative-volume denominator');
});

test('unverified volume or calendar evidence prevents dependent technical grants', () => {
  const volume = fixture(); volume.metadata.volume.evidence = [];
  assert.equal(fn(volume).sma20.status, 'READY');
  assert.ok(fn(volume).volumeEngine.causes.includes('UNVERIFIED_VOLUME_BASIS'));
  const calendar = fixture(); calendar.metadata.calendar.mic = 'XNYS';
  assert.equal(fn(calendar).privateCloseChart.status, 'READY');
  assert.ok(fn(calendar).sma20.causes.includes('MISSING_CALENDAR_BASIS'));
  assert.ok(fn(calendar).latestEod.causes.includes('MISSING_CALENDAR_BASIS'));
});

test('currency, local/ADR MIC and identity conflicts cannot pass mapping', () => {
  for (const field of ['currency', 'mic', 'securityId', 'listingId', 'isin']) {
    const input = fixture(); input.history.bars.at(-1)[field] = 'DIFFERENT';
    const result = fn(input);
    assert.ok(result.latestEod.causes.includes('MAPPING_ERROR'), field);
    assert.ok(result.sma20.causes.includes('MAPPING_ERROR'), field);
    assert.equal(result.privateCloseChart.status, 'BLOCKED');
  }
  const pence = fixture(); pence.metadata.quoteUnit = 'MINOR';
  assert.ok(fn(pence).privateCloseChart.causes.includes('MISSING_FX_OR_SHARE_BASIS'));
});

test('banks and local preference shares are not removed from reference or charts', () => {
  const input = fixture(); input.listing.shareClass = 'GERMAN_PREFERENCE'; input.listing.sector = 'FINANCIALS';
  input.metadata.quant = { policyEligible: false };
  const result = fn(input);
  assert.equal(result.indexRegionFilters.status, 'READY');
  assert.equal(result.privateCloseChart.status, 'READY');
  assert.ok(result.quantFullScore.causes.includes('CURRENT_POLICY_INELIGIBLE'));
});

test('field-specific old issues do not globally certify or globally block a younger verified window', () => {
  const input = fixture(400);
  const oldEnd = input.history.bars[80].date;
  input.history.quality.issues = [{ start: input.history.bars[0].date, end: oldEnd, fields: ['adjustment'], cause: 'UNKNOWN_ADJUSTMENT_BASIS', evidence: ['old-event-unresolved'] }];
  input.verifiedWindow.start = input.history.bars[100].date;
  const good = fn(input);
  assert.equal(good.sma200.status, 'READY');
  assert.equal(good.sma200.window.bars, 300);
  const whole = structuredClone(input); whole.verifiedWindow.start = whole.history.bars[0].date;
  assert.ok(fn(whole).sma200.causes.includes('UNKNOWN_ADJUSTMENT_BASIS'));
  input.history.quality.issues.push({ start: input.history.bars.at(-1).date, fields: ['volume'], cause: 'PROVIDER_DATA_DEFECT', evidence: ['volume-defect'] });
  const vol = fn(input);
  assert.equal(vol.sma200.status, 'READY');
  assert.equal(vol.volumeEngine.status, 'BLOCKED');
});

test('freshness uses documented completed local sessions, while stale EOD remains honest', () => {
  const input = fixture(); input.asOf = '2026-10-11';
  input.metadata.calendar.expectedLastSession = '2026-10-09';
  const result = fn(input).latestEod;
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.value.date, '2026-10-05');
  assert.equal(result.value.freshness, 'STALE');
  assert.equal(result.value.dataKind, 'EOD');
  assert.ok(result.causes.includes('STALE_EOD'));
});

test('future bars never enter fixed-stichtag calculations; invalid dates never disappear silently', () => {
  const input = fixture(); const base = evaluateListingReadiness(input);
  input.history.bars.push({ ...input.history.bars.at(-1), date: '2026-10-07', close: 500, high: 502 });
  const future = evaluateListingReadiness(input);
  assert.deepEqual(future.functions.sma200, base.functions.sma200);
  assert.equal(future.inputSummary.futureBarsExcluded, 1);
  const malformed = fixture(); malformed.history.bars.at(-1).date = '2026-02-30';
  assert.equal(fn(malformed).privateCloseChart.status, 'BLOCKED');
  assert.throws(() => evaluateListingReadiness({ ...fixture(), asOf: '2026-02-30' }), /fixed/);
});

test('metadata flags without evidence cannot certify rights, mapping or product integration', () => {
  const input = fixture(); input.metadata.identityEvidence = [];
  assert.ok(fn(input).privateCloseChart.causes.includes('MAPPING_ERROR'));
  input.metadata.identityEvidence = ['fixture']; input.metadata.rights.evidence = [];
  assert.ok(fn(input).privateCloseChart.causes.includes('RIGHTS_UNCONFIRMED'));
  input.metadata.rights.evidence = ['fixture']; input.metadata.productIntegration.watchlist = { verified: true, evidence: [] };
  assert.equal(fn(input).watchlist.status, 'BLOCKED');
  input.metadata.productIntegration.watchlist.evidence = ['actual-ui-test-fixture'];
  assert.equal(fn(input).watchlist.status, 'READY');
});

test('fundamental facts require exact company, period and nonfuture filing provenance', () => {
  const input = fixture(); input.metadata.fundamentals = { verified: true, companyId: 'other-company', period: '2025-12-31', filingDate: '2026-03-01', evidence: ['fixture'] };
  assert.equal(fn(input).fundamentalInputs.status, 'BLOCKED');
  input.metadata.fundamentals.companyId = input.listing.companyId;
  assert.equal(fn(input).fundamentalInputs.status, 'PARTIAL');
  assert.equal(fn(input).quantFullScore.status, 'BLOCKED');
  input.metadata.fundamentals.filingDate = '2027-03-01';
  assert.equal(fn(input).fundamentalInputs.status, 'BLOCKED');
});

test('flat series with insufficient standardized momentum cannot emit a complete composite', () => {
  const input = fixture(); input.history.bars.forEach((b) => { b.open = 100; b.high = 101; b.low = 99; b.close = 100; });
  const result = fn(input);
  assert.equal(result.momentum12M.status, 'READY');
  assert.equal(result.momentumEngine.status, 'PARTIAL');
  assert.equal(result.momentumEngine.value.momentumScore, undefined);
  assert.equal(result.momentumEngine.value.state, 'UNDETERMINED');
});

test('FX evidence does not reinterpret native EUR as the USD liquidity thresholds of existing strategies', () => {
  const input = fixture(); input.metadata.fx = { verified: true, asOf: input.asOf, evidence: ['fixture-fx'] };
  const result = fn(input);
  assert.equal(result.supertraderInputs.status, 'BLOCKED');
  assert.ok(result.supertraderInputs.causes.includes('MISSING_FX_OR_SHARE_BASIS'));
  assert.equal(result.supertrader.value, undefined);
});

test('batch identities reject local/ADR collisions and repeat deterministically', () => {
  const input = fixture();
  assert.throws(() => evaluateUniverseReadiness([input, structuredClone(input)]), /duplicate listingId/);
  const second = structuredClone(input); second.listing.listingId = 'second-listing';
  assert.throws(() => evaluateUniverseReadiness([input, second]), /duplicate securityId/);
  assert.deepEqual(evaluateUniverseReadiness([input]), evaluateUniverseReadiness([input]));
});

test('CLI requires explicit output and writes diagnostics only to isolated private paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'de-eu-readiness-'));
  try {
    const root = fileURLToPath(new URL('../../..', import.meta.url));
    const script = path.join(root, 'scripts/marketstack/de-eu-readiness.mjs');
    const src = path.join(tmp, 'input.json'); const out = path.join(tmp, 'readiness.json');
    fs.writeFileSync(src, JSON.stringify([fixture()]));
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root });
    assert.notEqual(run(`--input=${src}`).status, 0);
    const ok = run(`--input=${src}`, `--out=${out}`);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(fs.readFileSync(out)).listings.length, 1);
    const protectedOutput = path.join(root, 'quant/data/de-eu-readiness-forbidden.json');
    assert.notEqual(run(`--input=${src}`, `--out=${protectedOutput}`).status, 0);
    assert.equal(fs.existsSync(protectedOutput), false);
    const publicRootOutput = path.join(root, 'de-eu-readiness-forbidden.json');
    assert.notEqual(run(`--input=${src}`, `--out=${publicRootOutput}`).status, 0);
    assert.equal(fs.existsSync(publicRootOutput), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
