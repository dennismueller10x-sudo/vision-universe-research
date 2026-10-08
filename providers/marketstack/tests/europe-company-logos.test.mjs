import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildEuropeCompanyLogoEvidence, createCentralLogoResolver, writePrivateCompanyLogoEvidence } from '../../../scripts/marketstack/europe-company-logos.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6E9sAAAAASUVORK5CYII=', 'base64');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vu-europe-central-logos-')); mkdirSync(join(root, 'discover/logos/files'), { recursive: true });
  writeFileSync(join(root, 'discover/logos/files/SAP.png'), png);
  const sourceSha1 = '1'.repeat(40), companyKey = 'LEI:TEST_ISSUER';
  const registry = { root, index: { files: { SAP: 'files/SAP.png' } },
    credits: { credits: { SAP: { source: 'WIKIMEDIA_COMMONS', path: 'files/SAP.png', sha1: sourceSha1, title: 'File:SAP_logo.svg', page: 'https://commons.wikimedia.org/wiki/File:SAP_logo.svg' } } },
    reviewed: { symbols: { SAP: sourceSha1 } }, exclusions: { symbols: {} }, rejects: { urls: {}, titles: {} },
    names: { rows: [{ ticker: 'SAP', securityId: 'ref_SAP', cik: '0001000184', status: 'RESOLVED',
      candidates: { SEC_COMPANY_TICKERS: { name: 'SAP SE', cik: '1000184' } } }] }, sources: [{ path: 'synthetic-registry', sha256: 'a'.repeat(64) }] };
  const universe = { generatedAt: '2026-10-08T16:00:00Z', mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    securities: [{ securityId: 'ref_SAP_XETR', companyKey, canonicalTicker: 'SAP.XETR', isin: 'DE0007164600', primaryListing: 'marketstack:XETR:SAP.DE',
      listings: ['marketstack:XETR:SAP.DE'], aliases: ['SAP.DE'] }],
    listings: [{ listingKey: 'marketstack:XETR:SAP.DE', status: 'ACCEPTED', companyKey, securityId: 'ref_SAP_XETR', symbol: 'SAP.DE', name: 'SAP SE',
      mic: 'XETR', currency: 'EUR', issuerCountry: 'DE', identityEvidence: [{ verified: true, lei: 'TEST_ISSUER', issuerName: 'SAP SE', issuerCountry: 'DE', legalJurisdiction: 'DE', source: { sha256: 'b'.repeat(64) } }] }] };
  return { root, registry, universe, companyKey };
}
test('unique official issuer/SEC name plus reviewed central asset yields company-scoped evidence and central resolver', async () => {
  const f = fixture();
  try {
    const before = readFileSync(join(f.root, 'discover/logos/files/SAP.png')), evidence = buildEuropeCompanyLogoEvidence(f.universe, f.registry);
    assert.deepEqual(evidence.summary, { companies: 1, securities: 1, valid: 1, fallback: 0, missing: 0, suspect: 0 });
    const logo = evidence.companyEvidence[f.companyKey].logo; assert.equal(logo.companyId, f.companyKey); assert.equal(logo.key, 'SAP');
    assert.equal(logo.asset.sha256, sha(png)); assert.equal(logo.asset.reviewedHashScope, 'COMMONS_ORIGINAL_IMAGE');
    assert.equal(logo.provenance.binding.priceOrFundamentalsTransfer, false);
    assert.equal((await createCentralLogoResolver(evidence, f.registry)('SAP')).sha256, sha(png));
    assert.deepEqual(readFileSync(join(f.root, 'discover/logos/files/SAP.png')), before);
    writeFileSync(join(f.root, 'discover/logos/files/SAP.png'), Buffer.concat([png, Buffer.from('tamper')]));
    assert.equal(await createCentralLogoResolver(evidence, f.registry)('SAP'), null);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('ticker collision, weak name and unsigned issuer cannot reuse a US company asset', () => {
  for (const name of ['Airbus SE', 'SAP Partner SE']) {
    const f = fixture();
    try { f.universe.listings[0].symbol = 'SAP'; f.universe.listings[0].identityEvidence[0].issuerName = name;
      const e = buildEuropeCompanyLogoEvidence(f.universe, f.registry); assert.equal(e.summary.fallback, 1); assert.equal(e.companyEvidence[f.companyKey].logo.key, null);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
  const f = fixture(); try { delete f.universe.listings[0].identityEvidence[0].source.sha256;
    assert.equal(buildEuropeCompanyLogoEvidence(f.universe, f.registry).summary.fallback, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  for (const [issuerName, secName] of [['E.ON SE', 'On Holding AG'], ['NN Group N.V.', 'NN INC']]) {
    const f = fixture(); try {
      f.universe.listings[0].identityEvidence[0].issuerName = issuerName;
      f.registry.names.rows[0].candidates.SEC_COMPANY_TICKERS.name = secName;
      assert.equal(buildEuropeCompanyLogoEvidence(f.universe, f.registry).summary.fallback, 1, issuerName + ' must not match ' + secName);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
test('ambiguous registrants, pending or rejected asset, corrupt PNG and multi-issuer ownership remain suspect without blocking identity', () => {
  for (const mutate of [f => f.registry.names.rows.push({ ...f.registry.names.rows[0], cik: '999', candidates: { SEC_COMPANY_TICKERS: { name: 'SAP SE', cik: '999' } } }),
    f => { f.registry.credits.credits.SAP.pending = true; }, f => { f.registry.rejects.titles['File:SAP_logo.svg'] = 'rejected'; },
    f => writeFileSync(join(f.root, 'discover/logos/files/SAP.png'), 'not an image'),
    f => { f.universe.listings.push({ ...f.universe.listings[0], companyKey: 'LEI:OTHER_ISSUER', securityId: 'ref_OTHER',
      identityEvidence: [{ ...f.universe.listings[0].identityEvidence[0], lei: 'OTHER_ISSUER' }] }); }]) {
    const f = fixture(); try { mutate(f); const e = buildEuropeCompanyLogoEvidence(f.universe, f.registry);
      assert.ok(e.summary.suspect > 0); assert.equal(e.summary.valid, 0); assert.ok(e.rows.every(r => r.logo.blocksIdentity === false));
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
test('logo evidence is private only and output guard leaves central assets untouched', () => {
  const f = fixture(); try { const e = buildEuropeCompanyLogoEvidence(f.universe, f.registry), saved = writePrivateCompanyLogoEvidence(e, f.root);
    assert.equal(JSON.parse(readFileSync(saved.path)).publicationAllowed, false); assert.equal(e.providerRequests, 0);
    assert.throws(() => writePrivateCompanyLogoEvidence(e, process.cwd()), /OUTSIDE_REPOSITORY/);
    assert.throws(() => buildEuropeCompanyLogoEvidence({ ...f.universe, publicationAllowed: true }, f.registry), /PRIVATE_RESEARCH_UNIVERSE_REQUIRED/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
