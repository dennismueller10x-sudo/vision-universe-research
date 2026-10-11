import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDiscoverLogoUniverse, compileEuropeDiscoverScreenerReplay, writePrivateDiscoverScreenerReplay } from '../../../scripts/marketstack/europe-discover-screener-replay.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const id = 'ref_EXAMPLE_XETR', companyId = 'LEI:529900T8BM49AURSDO55';
function sources(dir) {
  const gleif = { data: [{ id: companyId.slice(4), attributes: { lei: companyId.slice(4), entity: { legalName: { name: 'Example SE' }, jurisdiction: 'DE' } } }] };
  const bytes = Buffer.from(JSON.stringify(gleif)), path = join(dir, 'gleif.json'); writeFileSync(path, bytes);
  const source = { kind: 'GLEIF', path, sha256: sha(bytes), queryIsin: 'DE0007164600', httpStatus: 200,
    url: 'https://api.gleif.org/api/v1/lei-records?filter%5Bisin%5D=DE0007164600' };
  const identity = { mode: 'PRIVATE_RESEARCH', publicationAllowed: false, listings: [{ companyId, companyKey: companyId, securityId: id,
    issuerCountry: 'DE', legalName: 'Example SE', displayName: 'Example', isin: 'DE0007164600', providerSymbol: 'EXAMPLE.DE', evidence: [source],
    admissionProof: { issuerBinding: 'VERIFIED_LEGAL_ISSUER', evidenceRefs: [{ kind: 'OFFICIAL_LEGAL_ISSUER', verified: true, sha256: source.sha256 }] } }] };
  return { identity, source };
}
function ref(dir, name, object) {
  const path = join(dir, name), bytes = Buffer.from(JSON.stringify(object)); writeFileSync(path, bytes); return { path, sha256: sha(bytes) };
}
test('exact raw GLEIF identity authorizes only logo name matching; wrong legal name, raw hash or issuer becomes fallback evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-g-logo-'));
  try {
    const { identity, source } = sources(dir), catalog = { securities: [{ securityId: id }] };
    assert.equal(buildDiscoverLogoUniverse(identity, catalog, '2026-10-10T07:00:00Z').listings[0].identityEvidence.length, 1);
    for (const change of [{ legalName: 'Other SE' }, { issuerCountry: 'FR' }, { companyId: 'LEI:another' }]) {
      const altered = structuredClone(identity); Object.assign(altered.listings[0], change);
      assert.equal(buildDiscoverLogoUniverse(altered, catalog, '2026-10-10T07:00:00Z').listings[0].identityEvidence.length, 0);
    }
    writeFileSync(source.path, '{"data":[]}');
    assert.equal(buildDiscoverLogoUniverse(identity, catalog, '2026-10-10T07:00:00Z').listings[0].identityEvidence.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('actual consumer replay preserves base missing values, pins input objects and current central cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-g-replay-'));
  try {
    const { identity } = sources(dir), catalog = { securities: [{ securityId: id, companyId, name: 'Example SE' }] };
    const input = { catalog: ref(dir, 'catalog.json', catalog), identity: ref(dir, 'identity.json', identity) };
    const ready = { IDENTITY: 'VERIFIED', UNIVERSE_IDENTITY_READY: true, DISCOVER_ELIGIBLE: true, BASE_SCREENER: 'READY',
      CHART: 'CHART_LIMITED', CHART_READY: false, CHART_LIMITED: true, sessionLag: 0, TECHNICAL_READY: false, TECHNICAL_PARTIAL: false };
    const contract = { universeId: 'EUROPE', async getReadiness() { return { state: 'AVAILABLE', data: ready }; },
      async getBaseScreenerRow() { return { state: 'AVAILABLE', asOf: '2026-10-09', data: { region: 'EUROPE', securityId: id, listingId: 'EXAMPLE:XETR',
        companyId, country: 'DE', mic: 'XETR', currency: 'EUR', price: 100, priceBasis: 'RAW_UNADJUSTED', freshness: 'CURRENT_LAST_SESSION', sessionLag: 0,
        chartStatus: 'CHART_LIMITED', latestDate: '2026-10-09', historyLength: 28, volume: null, indexes: ['DAX'] } }; },
      async getTechnicalData() { throw Error('NO_CERTIFIED_TECHNICAL'); }, async getPriceSeries() { throw Error('UNNECESSARY_SERIES'); } };
    const outputs = await compileEuropeDiscoverScreenerReplay({ catalog, identityUniverse: identity, contract, sourceInputs: input, generatedAt: '2026-10-10T07:00:00Z' });
    assert.equal(outputs.screenerReplay.summary.baseRows, 1); assert.equal(outputs.screenerReplay.summary.chartLimited, 1);
    assert.equal(outputs.screenerReplay.metricCoverage.sma50, 0); assert.equal(outputs.screenerReplay.missingVolumeEqualsZeroFilterCount, 0);
    assert.equal(outputs.screenerReplay.callerNonEuropeCalls, 0); assert.equal(outputs.screenerReplay.underlyingUSCalls, null, 'no unmeasured zero claimed');
    const measured = await compileEuropeDiscoverScreenerReplay({ catalog, identityUniverse: identity, contract, sourceInputs: input,
      generatedAt: '2026-10-10T07:00:00Z', getUSCallCount: () => 0 });
    assert.equal(measured.screenerReplay.underlyingUSCalls, 0);
    assert.equal(outputs.logoStatus.summary.LOGO_FALLBACK, 1); assert.equal(outputs.logoStatus.identityBlocking, false);
    const files = writePrivateDiscoverScreenerReplay(outputs, join(dir, 'out')); assert.equal(files.length, 3);
    assert.equal(sha(readFileSync(files[0].path)), files[0].sha256);
    await assert.rejects(compileEuropeDiscoverScreenerReplay({ catalog: { securities: [] }, identityUniverse: identity, contract, sourceInputs: input, generatedAt: '2026-10-10T07:00:00Z' }), /UNBOUND_PRIVATE_INPUT_OBJECT/);
    symlinkSync(join(dir, 'foreign'), join(dir, 'out/europe_screener_replay_link.json'));
    const bad = join(dir, 'linked'); symlinkSync(join(dir, 'out'), bad);
    assert.throws(() => writePrivateDiscoverScreenerReplay(outputs, bad), /SYMLINK/);
    let usCalls = 0; const original = contract.getReadiness;
    contract.getReadiness = async (...args) => { usCalls++; return original(...args); };
    await assert.rejects(compileEuropeDiscoverScreenerReplay({ catalog, identityUniverse: identity, contract, sourceInputs: input,
      generatedAt: '2026-10-10T07:00:00Z', getUSCallCount: () => usCalls }), /UNDERLYING_US_ROUTING_REGRESSION/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
