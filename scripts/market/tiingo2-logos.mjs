/** Shadow adapter for the existing central Discover company-logo builder. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { safeSymbol } from '../discover/company-logos-lib.mjs';
import { normalizeSite, rootDomain } from '../discover/company-logos-web.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file, fallback) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
const write = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const identityOK = row => row.identityVerified === true || row.identity?.resolved === true || row.evidence?.identity?.resolved === true;
const cikOf = row => row.cik || row.sec?.cik || row.evidence?.sec?.cik || null;
const companyKey = row => row.companyId || row.company_id || (cikOf(row) ? 'cik:' + String(Number(cikOf(row))) : 'security:' + (row.securityId || row.ticker));
const physicalPath = file => existsSync(file) ? realpathSync(file) : join(physicalPath(dirname(file)), basename(file));

export async function validateLogoAsset(file, { sharpImpl } = {}) {
  let sharp = sharpImpl;
  if (!sharp) try { sharp = (await import('sharp')).default; }
  catch { return { valid: false, reason: 'IMAGE_VALIDATOR_UNAVAILABLE' }; }
  try {
    const bytes = readFileSync(file), metadata = await sharp(bytes, { limitInputPixels: 4096 * 4096 }).metadata();
    if (!['svg', 'png', 'webp', 'jpeg', 'gif'].includes(metadata.format)) return { valid: false, reason: 'UNSUPPORTED_IMAGE_FORMAT' };
    const { data, info } = await sharp(bytes, { limitInputPixels: 4096 * 4096 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width < 32 || info.height < 16) return { valid: false, reason: 'IMAGE_TOO_SMALL' };
    let visible = 0, minX = info.width, maxX = -1, minY = info.height, maxY = -1;
    const colors = new Set();
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] < 16) continue;
      visible++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    if (!visible) return { valid: false, reason: 'IMAGE_FULLY_TRANSPARENT' };
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    if (colors.size === 1 && visible === area) return { valid: false, reason: 'IMAGE_SOLID_PLACEHOLDER' };
    return { valid: true, reason: 'DECODED_VISIBLE_IMAGE', width: info.width, height: info.height,
      format: metadata.format, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch { return { valid: false, reason: 'IMAGE_DECODE_FAILED' }; }
}

export function verifiedOfficialSites(candidates, sites = {}) {
  const result = {};
  for (const row of candidates) {
    const item = sites[row.ticker], site = normalizeSite(item?.url);
    if (!identityOK(row) || !site || item.identityVerified !== true || !item.evidenceUrl ||
      item.companyName !== row.companyName || String(Number(item.cik)) !== String(Number(cikOf(row)))) continue;
    result[row.ticker] = { ...item, url: site.url };
  }
  return result;
}

export async function materializeLogos({ root = repositoryRoot, outputRoot, tickers, candidates = [], officialSites = {},
  assetReviews = {}, seedRoot = repositoryRoot, fetchAssets = true, noWikidata = false, secLogos = false,
  runBuilder, onProgress = () => {}, env = process.env } = {}) {
  if (!outputRoot) throw Error('SHADOW_LOGO_OUTPUT_REQUIRED');
  root = resolve(root); outputRoot = resolve(outputRoot); seedRoot = resolve(seedRoot);
  const out = join(outputRoot, 'discover/logos');
  if (physicalPath(out) === physicalPath(join(repositoryRoot, 'discover/logos')) ||
    physicalPath(out) === physicalPath(join(seedRoot, 'discover/logos'))) throw Error('PRODUCTION_LOGO_OUTPUT_FORBIDDEN');
  const requested = [...new Set(tickers || candidates.map(r => r.ticker))].sort();
  if (!requested.length || requested.some(t => !safeSymbol(t))) throw Error('INVALID_LOGO_TARGETS');
  const byTicker = new Map(candidates.map(r => [r.ticker, r]));
  const previousRows = new Map((read(join(outputRoot, 'tiingo2_logo_report.json'), { rows: [] }).rows || []).map(r => [r.ticker, r]));
  const targetRows = requested.map(t => byTicker.get(t) || { ticker: t, companyName: t, identityVerified: false });
  const safeRows = targetRows.filter(identityOK);
  const inputRoot = join(outputRoot, '.logo-input');
  write(join(inputRoot, 'discover/data/search/US_REAL.json'), { entries: safeRows.map(r => ({ s: r.ticker, n: r.companyName })) });
  write(join(inputRoot, 'quant/data/market/security-master/company-names.json'), { rows: safeRows.map(r => ({ ticker: r.ticker, cik: cikOf(r) })) });
  mkdirSync(out, { recursive: true });
  if (!existsSync(join(out, 'index.json')) && existsSync(join(seedRoot, 'discover/logos'))) cpSync(join(seedRoot, 'discover/logos'), out, { recursive: true });
  const verifiedPath = join(inputRoot, 'verified-sites.json');
  write(verifiedPath, { sites: verifiedOfficialSites(safeRows, officialSites) });
  const args = [join(root, 'scripts/discover/build-company-logos.mjs'), '--root=' + inputRoot, '--output=' + out,
    '--config-root=' + root, '--tickers=' + safeRows.map(r => r.ticker).join(','), '--no-name-search', '--no-index-fetch',
    '--tolerate-source-failures', '--verified-sites=' + verifiedPath];
  if (!secLogos) args.push('--no-sec-logo');
  if (noWikidata) args.push('--no-wikidata');
  let builderFailure = null;
  if (fetchAssets && safeRows.length) try {
    if (runBuilder) await runBuilder({ args, output: out });
    else await new Promise((res, rej) => {
      const child = spawn(process.execPath, args, { cwd: root, env: { ...env, NODE_USE_ENV_PROXY: '1',
        SEC_USER_AGENT: env.SEC_USER_AGENT || 'VisionUniverseResearch info@visionuniverse.de' }, stdio: ['ignore', 'pipe', 'pipe'] });
      const log = chunk => onProgress(String(chunk)); child.stdout.on('data', log); child.stderr.on('data', log);
      child.once('error', rej); child.once('exit', code => code === 0 ? res() : rej(Error('CENTRAL_LOGO_BUILDER_FAILED:' + code)));
    });
  } catch (error) { builderFailure = error.message; onProgress('Central logo resolution unavailable; canonical fallback retained.\n'); }
  const index = read(join(out, 'index.json'), { version: 'company-logos-1.0.0', files: {}, dark: [], wide: {} });
  index.wideFiles ||= {};
  const credits = read(join(out, 'credits.json'), { version: index.version, credits: {} });
  const missing = read(join(out, 'missing.json'), { reasons: {} });
  const sites = read(join(out, 'sites.json'), { sites: {} }).sites || {};
  const exclusions = read(join(root, 'discover/config/logo-exclusions.json'), { symbols: {} }).symbols || {};
  const rows = [], canonicalAssets = new Map();
  for (const candidate of targetRows) {
    const ticker = candidate.ticker, companyId = companyKey(candidate), path = index.files[ticker];
    let credit = credits.credits[ticker];
    let status = 'LOGO_FALLBACK', reason = missing.reasons?.[ticker] || 'NO_VERIFIED_CENTRAL_ASSET', validation = null;
    if (exclusions[ticker]) { status = 'LOGO_FALLBACK'; reason = 'EXCLUDED_BY_CENTRAL_RIGHTSHOLDER_POLICY'; }
    else if (!identityOK(candidate)) { status = 'LOGO_SUSPECT'; reason = 'ISSUER_IDENTITY_UNRESOLVED'; }
    else if (assetReviews[ticker]?.status === 'LOGO_SUSPECT') { status = 'LOGO_SUSPECT'; reason = assetReviews[ticker].reason || 'ISSUER_BRAND_REVIEW_FAILED'; }
    else if (!path && previousRows.get(ticker)?.status === 'LOGO_SUSPECT') { status = 'LOGO_SUSPECT'; reason = previousRows.get(ticker).reason; }
    else if (path && (!credit || !['WIKIMEDIA_COMMONS', 'WEBSITE', 'SEC_FILING'].includes(credit.source))) {
      status = 'LOGO_SUSPECT'; reason = 'ASSET_SOURCE_UNVERIFIED';
    } else if (path) {
      const file = resolve(out, path);
      if (!file.startsWith(out + '/') || (existsSync(file) && !physicalPath(file).startsWith(physicalPath(out) + '/'))) {
        status = 'LOGO_SUSPECT'; reason = 'ASSET_PATH_OUTSIDE_CANONICAL_DIRECTORY';
      }
      else {
        validation = await validateLogoAsset(file);
        if (validation.valid) { status = 'LOGO_VALID'; reason = validation.reason; }
        else { status = validation.reason === 'IMAGE_VALIDATOR_UNAVAILABLE' ? 'LOGO_FALLBACK' : 'LOGO_SUSPECT'; reason = validation.reason; }
      }
    }
    if (status === 'LOGO_VALID') {
      if (canonicalAssets.has(companyId)) {
        const canonical = canonicalAssets.get(companyId);
        const previousWide = credit.wide;
        index.files[ticker] = canonical.path;
        credits.credits[ticker] = { ...canonical.credit, canonicalCompanyId: companyId };
        credit = canonical.credit;
        validation = canonical.validation;
        if (canonical.dark && !index.dark.includes(ticker)) index.dark.push(ticker);
        if (!canonical.dark) index.dark = index.dark.filter(s => s !== ticker);
        if (canonical.credit.wide) index.wide[ticker] = canonical.credit.ratio;
        else delete index.wide[ticker];
        if (path !== canonical.path && path.startsWith('files/')) rmSync(join(out, path), { force: true });
        if (previousWide && previousWide !== canonical.credit.wide && previousWide.startsWith('files/wide/') &&
          !Object.values(credits.credits).some(c => c.wide === previousWide)) rmSync(join(out, previousWide), { force: true });
      } else canonicalAssets.set(companyId, { path, credit, validation, dark: index.dark.includes(ticker) });
    } else {
      delete index.files[ticker]; delete credits.credits[ticker]; delete index.wide?.[ticker]; delete index.wideFiles[ticker];
      const rejectedFile = path && resolve(out, path);
      if (rejectedFile && path.startsWith('files/') && rejectedFile.startsWith(out + '/') &&
        (!existsSync(rejectedFile) || physicalPath(rejectedFile).startsWith(physicalPath(out) + '/')) &&
        !Object.values(index.files).includes(path)) rmSync(rejectedFile, { force: true });
    }
    rows.push({ ticker, companyId, companyName: candidate.companyName, status, reason, fallbackAvailable: true,
      blocksSecurity: false, canonicalPath: status === 'LOGO_VALID' ? '/discover/logos/' + index.files[ticker] : null,
      canonicalWidePath: status === 'LOGO_VALID' && credit?.wide ? '/discover/logos/' + credit.wide : null,
      source: credit?.source || null, sourceUrl: credit?.iconUrl || credit?.page || null,
      officialDomain: credit?.host || (sites[ticker]?.url && normalizeSite(sites[ticker].url)
        ? rootDomain(new URL(sites[ticker].url).hostname) : null),
      license: credit?.licenseName || credit?.license || null, attributionUrl: credit?.licenseUrl || credit?.page || null,
      cacheHash: validation?.sha256 || null, validation, darkBackground: index.dark?.includes(ticker) || false,
      issuerVerification: identityOK(candidate) ? credit?.via || sites[ticker]?.via || 'VERIFIED_CANONICAL_IDENTITY' : 'UNRESOLVED',
      visualReview: assetReviews[ticker] || null });
  }
  index.count = Object.keys(index.files).length;
  for (const [ticker, credit] of Object.entries(credits.credits)) if (index.files[ticker] && credit.wide) index.wideFiles[ticker] = credit.wide;
  write(join(out, 'index.json'), index); write(join(out, 'credits.json'), credits);
  const counts = { LOGO_VALID: 0, LOGO_FALLBACK: 0, LOGO_MISSING: 0, LOGO_SUSPECT: 0 };
  rows.forEach(r => counts[r.status]++);
  const report = { schemaVersion: 1, pipeline: 'scripts/discover/build-company-logos.mjs',
    fallbackRenderer: '/discover/ui/logos.js', productionAssetsModified: false, requested: requested.length,
    canonicalCompanyAssets: canonicalAssets.size, builderFailure, counts, rows };
  write(join(outputRoot, 'tiingo2_logo_report.json'), report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i < 0 ? undefined : i), i < 0 ? true : a.slice(i + 1)]; }));
  const summary = read(join(repositoryRoot, 'docs/tiingo2/tiingo2_final_universe_summary.json'));
  const policy = read(join(repositoryRoot, 'docs/tiingo2/tiingo2_consumer_policy_report.json'));
  const tickers = args.tickers ? String(args.tickers).split(',') : [...summary.added, 'DNA', 'AMC', 'BIRD', 'AMWL'];
  const report = await materializeLogos({ outputRoot: args.output, tickers, candidates: policy.rows,
    noWikidata: Boolean(args['no-wikidata']), onProgress: x => process.stdout.write(x) });
  process.stdout.write(JSON.stringify(report.counts) + '\n');
}
