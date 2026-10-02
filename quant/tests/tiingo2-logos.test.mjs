import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { materializeLogos, validateLogoAsset, verifiedOfficialSites } from '../../scripts/market/tiingo2-logos.mjs';
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* central pipeline supports metadata/fallback without sharp */ }

const fixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><path fill="#1940c8" d="M8 12h96v20H28v70H8z"/></svg>');
const json = (p, value) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(value)); };
const row = (ticker, cik = '1') => ({ ticker, companyName: 'Example Corporation', sec: { cik }, identity: { resolved: true } });

test('asset quality validates SVG PNG WEBP and rejects broken/transparent/solid/too-small images', { skip: !sharp }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'logos-quality-'));
  for (const format of ['svg', 'png', 'webp']) {
    const p = join(dir, 'logo.' + format);
    writeFileSync(p, format === 'svg' ? fixture : await sharp(fixture)[format]().toBuffer());
    const v = await validateLogoAsset(p);
    assert.equal(v.valid, true);
    assert.match(v.sha256, /^[a-f0-9]{64}$/);
  }
  const bad = join(dir, 'broken.png'); writeFileSync(bad, 'not an image');
  assert.equal((await validateLogoAsset(bad)).reason, 'IMAGE_DECODE_FAILED');
  for (const [alpha, reason] of [[0, 'IMAGE_FULLY_TRANSPARENT'], [1, 'IMAGE_SOLID_PLACEHOLDER']]) {
    const p = join(dir, alpha + '.png');
    writeFileSync(p, await sharp({ create: { width: 128, height: 128, channels: 4,
      background: { r: 255, g: 255, b: 255, alpha } } }).png().toBuffer());
    assert.equal((await validateLogoAsset(p)).reason, reason);
  }
  const tiny = join(dir, 'tiny.png'); writeFileSync(tiny, await sharp(fixture).resize(16, 16).png().toBuffer());
  assert.equal((await validateLogoAsset(tiny)).reason, 'IMAGE_TOO_SMALL');
});

test('official sites need validated issuer identity, matching CIK/name and primary evidence', () => {
  const candidates = [row('AAA'), row('BBB', '2'), { ...row('CCC'), identity: { resolved: false } }];
  const verified = { url: 'https://example.com/', companyName: 'Example Corporation', cik: '1', identityVerified: true,
    evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/filing.htm' };
  assert.deepEqual(Object.keys(verifiedOfficialSites(candidates, {
    AAA: verified, BBB: verified, CCC: verified,
  })), ['AAA']);
  assert.deepEqual(verifiedOfficialSites(candidates, { AAA: { ...verified, evidenceUrl: null } }), {});
  assert.deepEqual(verifiedOfficialSites(candidates, { AAA: { ...verified, url: 'https://facebook.com/example' } }), {});
});

test('shadow wrapper uses central pipeline and one company asset while preserving unrelated baseline bytes', { skip: !sharp }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'logos-seed-')), output = mkdtempSync(join(tmpdir(), 'logos-shadow-'));
  const keep = 'baseline unchanged'; mkdirSync(join(base, 'discover/logos/files'), { recursive: true });
  writeFileSync(join(base, 'discover/logos/files/KEEP.png'), keep);
  json(join(base, 'discover/logos/index.json'), { files: { KEEP: 'files/KEEP.png' }, wide: {}, dark: [] });
  json(join(base, 'discover/logos/credits.json'), { credits: { KEEP: { source: 'WEBSITE', path: 'files/KEEP.png' } } });
  let invoked = false;
  const report = await materializeLogos({ outputRoot: output, seedRoot: base, candidates: [row('AAA'), row('AAB')], noWikidata: true,
    runBuilder: async ({ args, output: out }) => {
      invoked = true;
      assert.ok(args[0].endsWith('/scripts/discover/build-company-logos.mjs'));
      assert.ok(args.includes('--tickers=AAA,AAB'));
      const index = JSON.parse(readFileSync(join(out, 'index.json'))), credits = JSON.parse(readFileSync(join(out, 'credits.json')));
      for (const ticker of ['AAA', 'AAB']) {
        const path = 'files/' + ticker + '.png'; writeFileSync(join(out, path), await sharp(fixture).png().toBuffer());
        mkdirSync(join(out, 'files/wide'), { recursive: true });
        const wide = 'files/wide/' + ticker + '.png'; writeFileSync(join(out, wide), await sharp(fixture).png().toBuffer());
        index.files[ticker] = path; credits.credits[ticker] = { source: 'WEBSITE', path, host: 'example.com',
          page: 'https://example.com/', iconUrl: 'https://example.com/favicon.png', via: 'SEC_10K', licenseName: 'Marke des Inhabers', wide, ratio: 3 };
      }
      json(join(out, 'index.json'), index); json(join(out, 'credits.json'), credits);
    } });
  assert.equal(invoked, true); assert.equal(report.counts.LOGO_VALID, 2); assert.equal(report.canonicalCompanyAssets, 1);
  assert.equal(report.rows[0].canonicalPath, report.rows[1].canonicalPath);
  assert.equal(report.rows[0].cacheHash, report.rows[1].cacheHash);
  assert.equal(report.rows[0].canonicalWidePath, report.rows[1].canonicalWidePath);
  assert.equal(readFileSync(join(base, 'discover/logos/files/KEEP.png'), 'utf8'), keep);
  assert.equal(readFileSync(join(output, 'discover/logos/files/KEEP.png'), 'utf8'), keep);
  assert.equal(existsSync(join(output, 'discover/logos/files/AAB.png')), false);
  assert.equal(existsSync(join(output, 'discover/logos/files/wide/AAB.png')), false);
  const index = JSON.parse(readFileSync(join(output, 'discover/logos/index.json')));
  assert.equal(index.wideFiles.AAA, index.wideFiles.AAB);
});

test('missing, failed or suspect logos use central fallback and never block a security', async () => {
  const base = mkdtempSync(join(tmpdir(), 'logos-empty-')), output = mkdtempSync(join(tmpdir(), 'logos-fallback-'));
  const report = await materializeLogos({ outputRoot: output, seedRoot: base,
    candidates: [row('AAA'), { ...row('BIRD'), identity: { resolved: false } }],
    runBuilder: async () => { throw Error('NETWORK_UNAVAILABLE'); } });
  assert.equal(report.counts.LOGO_FALLBACK, 1); assert.equal(report.counts.LOGO_SUSPECT, 1);
  assert.equal(report.builderFailure, 'NETWORK_UNAVAILABLE');
  assert.ok(report.rows.every(r => r.blocksSecurity === false && r.fallbackAvailable));
  assert.equal(report.fallbackRenderer, '/discover/ui/logos.js');
});

test('issuer brand review removes suspect asset and remains idempotent with central fallback', { skip: !sharp }, async () => {
  const base = mkdtempSync(join(tmpdir(), 'logos-brand-seed-')), output = mkdtempSync(join(tmpdir(), 'logos-brand-shadow-'));
  mkdirSync(join(base, 'discover/logos/files'), { recursive: true });
  writeFileSync(join(base, 'discover/logos/files/AAA.png'), await sharp(fixture).png().toBuffer());
  json(join(base, 'discover/logos/index.json'), { files: { AAA: 'files/AAA.png' }, wide: {}, dark: [] });
  json(join(base, 'discover/logos/credits.json'), { credits: { AAA: { source: 'WEBSITE', path: 'files/AAA.png', host: 'previous-issuer.com' } } });
  const options = { outputRoot: output, seedRoot: base, candidates: [row('AAA')], fetchAssets: false,
    assetReviews: { AAA: { status: 'LOGO_SUSPECT', reason: 'CURRENT_ISSUER_BRAND_MISMATCH' } } };
  const first = await materializeLogos(options), again = await materializeLogos({ ...options, assetReviews: {} });
  assert.equal(first.rows[0].status, 'LOGO_SUSPECT'); assert.equal(again.rows[0].status, 'LOGO_SUSPECT');
  assert.equal(existsSync(join(output, 'discover/logos/files/AAA.png')), false);
  assert.equal(JSON.parse(readFileSync(join(output, 'discover/logos/index.json'))).files.AAA, undefined);
});

test('wrapper rejects production output and unsafe symbol before any builder call', async () => {
  const root = join(process.cwd(), 'discover/logos');
  await assert.rejects(materializeLogos({ outputRoot: process.cwd(), candidates: [row('AAA')] }), /PRODUCTION_LOGO_OUTPUT_FORBIDDEN/);
  await assert.rejects(materializeLogos({ outputRoot: tmpdir(), tickers: ['../evil'] }), /INVALID_LOGO_TARGETS/);
});

test('a shadow-directory symlink cannot bypass the production asset guard', async () => {
  const base = mkdtempSync(join(tmpdir(), 'logos-guard-seed-')), output = mkdtempSync(join(tmpdir(), 'logos-guard-shadow-'));
  mkdirSync(join(base, 'discover/logos'), { recursive: true }); mkdirSync(join(output, 'discover'), { recursive: true });
  symlinkSync(join(base, 'discover/logos'), join(output, 'discover/logos'), 'dir');
  await assert.rejects(materializeLogos({ outputRoot: output, seedRoot: base, candidates: [row('AAA')] }), /PRODUCTION_LOGO_OUTPUT_FORBIDDEN/);
});

test('existing central renderer follows shared wide asset paths, retains legacy URLs and image-error fallback', async () => {
  const index = { files: { AAA: 'files/AAA.png', AAB: 'files/AAA.png', OLD: 'files/OLD.png' },
    wide: { AAA: 3, AAB: 3, OLD: 2 }, wideFiles: { AAA: 'files/wide/AAA.png', AAB: 'files/wide/AAA.png' }, dark: ['AAA'] };
  const node = tag => ({ tag, childNodes: [], events: {}, attributes: {}, textContent: '',
    style: { setProperty() {} }, classList: { classes: [], add(c) { this.classes.push(c); } },
    setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, cb) { this.events[k] = cb; },
    appendChild(n) { this.childNodes.push(n); n.parentNode = this; },
    removeChild(n) { this.childNodes = this.childNodes.filter(c => c !== n); n.parentNode = null; } });
  const window = { document: { createElement: node }, fetch: async () => ({ ok: true, json: async () => index }) };
  vm.runInNewContext(readFileSync(join(process.cwd(), 'discover/ui/logos.js'), 'utf8'), { window });
  await new Promise(setImmediate);
  const logos = window.VUDiscover.Logos, a = logos.mark('AAA', { name: 'Example', wide: true }),
    b = logos.mark('AAB', { name: 'Example', wide: true }), old = logos.mark('OLD', { name: 'Legacy', wide: true });
  assert.equal(a.childNodes[0].src, '/discover/logos/files/wide/AAA.png');
  assert.equal(a.childNodes[0].src, b.childNodes[0].src);
  assert.equal(old.childNodes[0].src, '/discover/logos/files/wide/OLD.png');
  a.childNodes[0].events.load(); assert.ok(a.classList.classes.includes('dx-logo--dark'));
  b.childNodes[0].events.error(); assert.equal(b.childNodes.length, 0); assert.equal(b.textContent, 'E');
  const missing = logos.mark('BIRD', { name: 'Allbirds' });
  assert.equal(missing.childNodes.length, 0); assert.equal(missing.textContent, 'A');
});
