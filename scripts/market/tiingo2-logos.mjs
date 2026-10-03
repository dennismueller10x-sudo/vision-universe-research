/** Scoped adapter for the existing reviewed company-logo pipeline. The
 * canonical shadow supplies Search and issuer identity; unreviewed images
 * remain on the existing fallback path. */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { runExistingProcess } from './tiingo2-fundamentals.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));

export async function materializeLogos({ root, outputRoot, tickers, fetchAssets = true, onProgress = () => {} }) {
  root = resolve(root); outputRoot = resolve(outputRoot);
  if (!outputRoot.startsWith(join(root, '.market-cache') + sep)) throw Error('LOGO_SHADOW_ROOT_REQUIRED');
  const scope = [...new Set(tickers)].sort();
  if (!scope.length || scope.some(ticker => !/^[A-Z0-9._-]{1,12}$/.test(ticker))) throw Error('LOGO_SCOPE_INVALID');
  const logoRoot = join(outputRoot, 'discover/logos');
  const args = [join(root, 'scripts/discover/build-company-logos.mjs'),
    '--root=' + outputRoot, '--output=' + logoRoot, '--config-root=' + root,
    '--tickers=' + scope.join(',')];
  if (!fetchAssets) args.push('--no-wikidata', '--no-name-search', '--no-web', '--no-sec-logo', '--no-index-fetch');
  const result = await runExistingProcess(process.execPath, args, { cwd: outputRoot, onProgress });
  if (result.code !== 0) throw Error('CANONICAL_LOGO_PIPELINE_FAILED:' + result.output.slice(-1200));
  const indexPath = join(logoRoot, 'index.json'), missingPath = join(logoRoot, 'missing.json');
  const index = read(indexPath), credits = read(join(logoRoot, 'credits.json')).credits ?? {};
  const missing = read(missingPath), reviewed = read(join(root, 'discover/config/logo-reviewed.json')).symbols ?? {};
  const rows = [];
  for (const ticker of scope) {
    const assetPath = index.files?.[ticker] ?? null, credit = credits[ticker];
    let status = 'LOGO_FALLBACK', reasonCode = missing.reasons?.[ticker] ?? 'NO_REVIEWED_CANONICAL_LOGO';
    if (assetPath) {
      const file = resolve(logoRoot, assetPath), within = relative(logoRoot, file);
      const bytes = within && !within.startsWith('..') && !within.includes(sep + '..' + sep) && existsSync(file) ? readFileSync(file) : null;
      const actualSha1 = bytes && createHash('sha1').update(bytes).digest('hex');
      if (bytes?.length && credit?.pending !== true && credit?.sha1 === actualSha1 && reviewed[ticker] === actualSha1) {
        status = 'LOGO_VALID'; reasonCode = null;
      } else {
        // Never expose an unverified image via the canonical index.
        status = 'LOGO_SUSPECT'; reasonCode = 'REVIEWED_ASSET_BYTES_OR_CREDIT_MISMATCH';
        delete index.files[ticker]; delete index.wide?.[ticker];
        index.dark = (index.dark ?? []).filter(item => item !== ticker);
        missing.reasons = { ...(missing.reasons ?? {}), [ticker]: reasonCode };
      }
    }
    rows.push({ ticker, status, reasonCode, assetPath: status === 'LOGO_VALID' ? 'discover/logos/' + assetPath : null,
      source: 'EXISTING_CANONICAL_LOGO_PIPELINE', fallbackReady: status !== 'LOGO_VALID' });
  }
  if (rows.some(row => row.status === 'LOGO_SUSPECT')) {
    index.count = Object.keys(index.files ?? {}).length;
    writeFileSync(indexPath, JSON.stringify(index) + '\n');
    writeFileSync(missingPath, JSON.stringify(missing, null, 1) + '\n');
  }
  const counts = Object.fromEntries(['LOGO_VALID', 'LOGO_FALLBACK', 'LOGO_MISSING', 'LOGO_SUSPECT'].map(status => [status, rows.filter(row => row.status === status).length]));
  return { schemaVersion: 'tiingo2-scoped-logo-status-1', source: 'scripts/discover/build-company-logos.mjs', rows, counts, productionWrites: 0 };
}
