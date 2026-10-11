import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildEuropeCompanyLogoEvidence, createCentralLogoResolver, writePrivateCompanyLogoEvidence, buildEuropeLogoReadiness,
  writePrivateEuropeLogoReadiness } from '../../../scripts/marketstack/europe-company-logos.mjs';
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
function addSite(f, url = 'https://www.sap.com/', via = 'WIKIDATA_CIK') {
  f.registry.sites = { generatedAt: '2026-10-08T15:00:00Z', sites: { SAP: { url, via } } };
  f.registry.siteOverrides = { symbols: {} };
  f.registry.sources.push({ path: 'discover/logos/sites.json', sha256: 'c'.repeat(64) },
    { path: 'discover/config/logo-sites.json', sha256: 'd'.repeat(64) });
}
test('exact issuer-bound cached domain is separate from live availability and blocked asset review', () => {
  const f = fixture(); try {
    addSite(f); f.registry.credits.credits.SAP.pending = true;
    const e = buildEuropeCompanyLogoEvidence(f.universe, f.registry), logo = e.companyEvidence[f.companyKey].logo;
    assert.equal(logo.status, 'LOGO_SUSPECT'); assert.equal(logo.officialDomain.status, 'DOMAIN_CACHED');
    assert.equal(logo.officialDomain.host, 'sap.com'); assert.equal(logo.officialDomain.sourceSha256, 'c'.repeat(64));
    assert.equal(logo.officialDomain.networkAvailability, 'NOT_PROBED'); assert.equal(logo.sourceAvailability.reviewedCachedAsset, false);
    assert.equal(logo.officialDomain.canonical, false); assert.equal(logo.officialDomain.identityUse, 'LOGO_SOURCE_CANDIDATE_ONLY');
    assert.equal(logo.sourceAvailability.automaticAssetPromotion, false); assert.equal(logo.officialDomain.priceOrFundamentalsTransfer, false);
    f.registry.siteOverrides.symbols.SAP = 'https://www.sap.de/';
    assert.equal(buildEuropeCompanyLogoEvidence(f.universe, f.registry).companyEvidence[f.companyKey].logo.officialDomain.sourceSha256, 'd'.repeat(64));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('domain source cannot bypass ticker collisions, missing cache proof, unsafe URL or unknown source', () => {
  for (const mutate of [f => { f.universe.listings[0].identityEvidence[0].issuerName = 'SAP Partner SE'; },
    f => { f.registry.sources = f.registry.sources.filter(row => row.path !== 'discover/logos/sites.json'); },
    f => { f.registry.sites.sites.SAP.url = 'https://user:password@sap.com/'; },
    f => { f.registry.sites.sites.SAP.url = 'https://wikipedia.org/wiki/SAP'; },
    f => { f.registry.sites.sites.SAP.via = 'PROVIDER_GUESS'; }]) {
    const f = fixture(); try { addSite(f); mutate(f);
      const logo = buildEuropeCompanyLogoEvidence(f.universe, f.registry).companyEvidence[f.companyKey].logo;
      assert.equal(logo.officialDomain.status, 'DOMAIN_UNAVAILABLE'); assert.equal(logo.officialDomain.url, null);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
test('competing cached domains and duplicate issuer ownership remain ambiguous independently of asset state', () => {
  for (const duplicateIssuer of [false, true]) {
    const f = fixture(); try {
      addSite(f); f.registry.credits.credits.SAP.pending = true;
      if (duplicateIssuer) f.universe.listings.push({ ...f.universe.listings[0], companyKey: 'LEI:OTHER_ISSUER', securityId: 'ref_OTHER',
        identityEvidence: [{ ...f.universe.listings[0].identityEvidence[0], lei: 'OTHER_ISSUER' }] });
      else {
        f.registry.names.rows.push({ ...f.registry.names.rows[0], ticker: 'SAP2' });
        f.registry.sites.sites.SAP2 = { url: 'https://another-company.example/', via: 'WIKIDATA_CIK' };
      }
      const e = buildEuropeCompanyLogoEvidence(f.universe, f.registry);
      assert.ok(e.rows.every(row => row.logo.officialDomain.status === 'DOMAIN_AMBIGUOUS'));
      assert.ok(e.rows.every(row => row.logo.officialDomain.url === null));
      assert.equal(e.sourceAvailabilitySummary.officialDomainsCached, 0);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
test('per-security readiness preserves company counts, rejects duplicate ownership and guards dangling output symlinks', () => {
  const f = fixture(); try {
    addSite(f); f.universe.listings.push({ ...f.universe.listings[0], securityId: 'ref_SAP_PREFERRED', listingKey: 'second-class' });
    const e = buildEuropeCompanyLogoEvidence(f.universe, f.registry), readiness = buildEuropeLogoReadiness(e);
    assert.equal(readiness.summary.companies.valid, 1); assert.equal(readiness.summary.securities.valid, 2);
    assert.equal(readiness.rows[0].asset.sha256, sha(png)); assert.equal(readiness.publicationAllowed, false);
    assert.equal(readiness.rows[0].blocksIdentity, false);
    const saved = writePrivateEuropeLogoReadiness(e, f.root); assert.equal(JSON.parse(readFileSync(saved.path)).rows.length, 2);
    const broken = structuredClone(e); broken.rows.push({ ...broken.rows[0], companyId: 'another' });
    assert.throws(() => buildEuropeLogoReadiness(broken), /MULTIPLE_COMPANY_LOGO_OWNERS/);
    rmSync(saved.path); const target = join(f.root, 'must-not-be-created'); symlinkSync(target, saved.path);
    assert.throws(() => writePrivateEuropeLogoReadiness(e, f.root), /SYMLINK_OR_NONREGULAR/); assert.equal(existsSync(target), false);
    symlinkSync(target, join(f.root, 'marketstack_europe_central_logo_evidence.json'));
    assert.throws(() => writePrivateCompanyLogoEvidence(e, f.root), /SYMLINK_OR_NONREGULAR/); assert.equal(existsSync(target), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
