/* Consumer objects only. Immutable keys; pointer last; private state is never an allowed asset. */
import {createHash} from 'node:crypto';
import {readFileSync, realpathSync, statSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createS3DriverFromEnv} from '../market/storage/s3-driver.mjs';
import {createFsDriver} from '../market/storage/fs-driver.mjs';
import {approvedForPublication} from './production-approval.mjs';
export const MAX = 512 * 1024;
const sha = b => createHash('sha256').update(b).digest('hex');
const ID = '(?:iss_cik_\\d{10}|vu_[a-f0-9]{14})';
export function allowedAsset(path) {
  return path === 'index.json' || new RegExp('^snapshots/[a-f0-9]{24}/(?:' + ID + '|lookup/[A-Z0-9.-]{1,2})\\.json$').test(path || '');
}
export function prefixFor(namespace) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace || '')) throw new Error('INVALID_CONSUMER_NAMESPACE');
  return `v1/company-intelligence/consumer/${namespace}/`;
}
export function validateManifest(m) {
  if (!m || (m.slot !== undefined && ![0, 1].includes(m.slot)) || m.schema !== 1 || !/^[a-f0-9]{24}$/.test(m.generation || '') || !Array.isArray(m.tickers) || !m.tickers.length || m.tickers.length > 100 ||
      m.tickers.some(t => !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)) || !m.assets || !m.assets['index.json'] || Object.keys(m.assets).length > 250 ||
      !Number.isFinite(Date.parse(m.generatedAt)) || Object.entries(m.assets).some(([p, v]) => !allowedAsset(p) || (p !== 'index.json' && !p.startsWith('snapshots/' + m.generation + '/')) || !/^[a-f0-9]{64}$/.test(v?.sha256 || '') || !Number.isSafeInteger(v.bytes) || v.bytes <= 0 || v.bytes > MAX)) throw new Error('INVALID_CONSUMER_MANIFEST');
  return m;
}
async function manifest(driver, key) {
  const bytes = await driver.get(key);
  if (!bytes) return null;
  if (bytes.length > MAX) throw new Error('INVALID_CONSUMER_MANIFEST');
  return validateManifest(JSON.parse(bytes));
}
// Validate every local object before the first remote write. A correct hash alone
// does not prove a complete, correctly scoped consumer generation.
export function preflight(root, m, prior = null, {localReview = false} = {}) {
  const approved = approvedForPublication(m);
  if (m.productionApproval && !approved) throw new Error('PRODUCTION_APPROVAL_INVALID');
  if (!localReview && m.releaseState === 'REVIEW_ONLY') throw new Error('REVIEW_ONLY_PUBLICATION_REFUSED');
  const assets = new Map();
  for (const [path, meta] of Object.entries(m.assets)) {
    const file = realpathSync(resolve(root, path));
    if (!file.startsWith(root + sep) || statSync(file).size > MAX) throw new Error('UNSAFE_PUBLIC_FILE');
    const bytes = readFileSync(file);
    if (bytes.length !== meta.bytes || sha(bytes) !== meta.sha256) throw new Error('LOCAL_CONSUMER_INTEGRITY_FAILED');
    const data = JSON.parse(bytes);
    if (data.coverage?.sources || data.coverage?.sec || data.coverage?.ir || data.checkpoints || data.state === 'DISABLED') throw new Error('PRIVATE_OR_DISABLED_CONTENT');
    assets.set(path, {bytes, data});
  }
  const index = assets.get('index.json').data;
  if (index.schema !== 'vu-company-intelligence-1.0.0' || !['PREVIEW','AVAILABLE'].includes(index.state) || index.generation !== m.generation || index.generatedAt !== m.generatedAt) throw new Error('INVALID_PUBLIC_INDEX');
  const issuerPaths = [...assets.keys()].filter(p => p !== 'index.json' && !p.includes('/lookup/'));
  if (!issuerPaths.length) throw new Error('EMPTY_PUBLICATION_REFUSED');
  if (prior) {
    const missingTickers = prior.tickers.filter(t => !m.tickers.includes(t));
    const ids = new Set(issuerPaths.map(p => p.split('/').at(-1)));
    const missingIssuers = Object.keys(prior.assets).filter(p => p !== 'index.json' && !p.includes('/lookup/') && !ids.has(p.split('/').at(-1)));
    if (missingTickers.length || missingIssuers.length) throw new Error('SHRUNK_PUBLICATION_REFUSED');
  }
  const lookups = Array.isArray(index.lookupShards) ? index.lookupShards.map(prefix => {
    const lookup = assets.get(`snapshots/${m.generation}/lookup/${prefix}.json`)?.data;
    if (!lookup || lookup.schema !== index.schema || lookup.generation !== m.generation) throw new Error('INCOMPLETE_LOOKUP_GENERATION');
    return lookup;
  }) : [index];
  for (const ticker of m.tickers) {
    const lookup = lookups.find(l => l.tickers?.[ticker]);
    const listings = lookup?.tickers?.[ticker];
    if (!Array.isArray(listings) || !listings.length || new Set(listings.map(l => l.companyId)).size !== 1) throw new Error('PUBLIC_IDENTITY_NOT_UNIQUE');
    const path = lookup.companies?.[listings[0].companyId];
    if (path && !assets.has(path)) throw new Error('INCOMPLETE_COMPANY_GENERATION');
    if (path) {
      const payload = assets.get(path).data;
      if (!payload.listings?.some(l => l.symbol === ticker && listings.some(m => m.instrumentId === l.instrumentId))) throw new Error('PUBLIC_LISTING_MISMATCH');
    }
  }
  for (const path of issuerPaths) {
    const p = assets.get(path).data;
    if (!localReview && !approved && (p.companyProfile?.editorialStatus === 'REVIEW_ONLY' || ['CATALOGUE_AND_EXISTING_FACTS','OWNED_IR_SEC_REVIEW','RESTORED_OWNED_IR_SEC_REVIEW'].includes(p.previewBasis))) throw new Error('REVIEW_ONLY_PUBLICATION_REFUSED');
    if (p.companyId + '.json' !== path.split('/').at(-1) || p.schema !== index.schema || p.state !== 'AVAILABLE' || p.generatedAt !== m.generatedAt) throw new Error('INVALID_PUBLIC_COMPANY');
    for (const key of ['news','events','earnings','filings','calls','timeline']) {
      if (!Array.isArray(p[key]) || p[key].length > 200 || p[key].some(row => row?.companyId !== p.companyId)) throw new Error('INVALID_PUBLIC_SECTIONS');
    }
  }
  const counts = contentCounts(assets);
  if (prior?.contentCounts && Object.entries(prior.contentCounts).some(([key, count]) => count > 0 && counts[key] < count * 0.75)) throw new Error('CONTENT_REGRESSION_REFUSED');
  return assets;
}
function contentCounts(assets) {
  const counts = {profiles:0,financials:0,news:0,earnings:0,calls:0,materials:0};
  for (const [path, {data:p}] of assets) {
    if (path === 'index.json' || path.includes('/lookup/')) continue;
    counts.profiles += p.companyProfile?.state === 'AVAILABLE' ? 1 : 0;
    counts.financials += p.latestFinancials?.state === 'AVAILABLE' ? 1 : 0;
    for (const key of ['news','earnings','calls','materials']) counts[key] += p[key]?.length || 0;
  }
  return counts;
}
async function intactGeneration(driver, prefix, meta) {
  const objects = new Map();
  for (const [path, expected] of Object.entries(meta.assets)) {
    const key = prefix + `slot-${meta.slot || 0}/` + (path === 'index.json' ? path : path.split('/').slice(2).join('/'));
    const bytes = await driver.get(key);
    if (!bytes || bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) return null;
    try { objects.set(path, {bytes, data:JSON.parse(bytes)}); } catch { return null; }
  }
  return {...meta, contentCounts:contentCounts(objects)};
}
export async function readAsset(driver, {namespace, asset, now = Date.now()}) {
  if (!allowedAsset(asset)) throw new Error('INVALID_CONSUMER_PATH');
  const prefix = prefixFor(namespace);
  const current = await manifest(driver, prefix + 'manifest.json');
  if (!current) throw new Error('CONSUMER_NOT_PUBLISHED');
  let selected = current;
  if (!current.assets[asset] && asset !== 'index.json') {
    selected = await manifest(driver, prefix + 'previous.json');
    if (!selected?.assets[asset]) throw new Error('GENERATION_UNAVAILABLE');
  }
  const meta = selected.assets[asset];
  const timestamp = Date.parse(selected.generatedAt);
  if (timestamp > now + 300000 || now - timestamp > 7 * 86400000) throw new Error('CONSUMER_EXPIRED');
  // index is generation-keyed in storage too, so pointer swaps cannot mix old/new index bytes.
  const key = `slot-${selected.slot || 0}/` + (asset === 'index.json' ? asset : asset.split('/').slice(2).join('/'));
  const bytes = await driver.get(prefix + key);
  if (!bytes || bytes.length !== meta.bytes || bytes.length > MAX || sha(bytes) !== meta.sha256) throw new Error('CONSUMER_INTEGRITY_FAILED');
  return {bytes, generation: selected.generation, stale: now - timestamp > 48 * 3600000};
}
export async function publish(driver, {namespace, directory}) {
  const prefix = prefixFor(namespace), root = realpathSync(directory);
  const m = validateManifest(JSON.parse(readFileSync(resolve(root, 'manifest.json'))));
  let prior = await manifest(driver, prefix + 'manifest.json');
  if (prior && Date.parse(m.generatedAt) < Date.parse(prior.generatedAt)) throw new Error('STALE_PUBLICATION_REFUSED');
  if (prior) {
    // Preserve the last fully intact slot, including when the active pointer's
    // assets are damaged. Legacy manifests gain measured module baselines here.
    let intact = await intactGeneration(driver, prefix, prior);
    if (!intact) {
      const previous = await manifest(driver, prefix + 'previous.json');
      intact = previous ? await intactGeneration(driver, prefix, previous) : null;
    }
    if (!intact) throw new Error('NO_INTACT_PUBLIC_GENERATION');
    prior = intact;
  }
  if (prior?.generation === m.generation && JSON.stringify(prior.assets) !== JSON.stringify(m.assets)) throw new Error('IMMUTABLE_GENERATION_COLLISION');
  const checked = preflight(root, m, prior);
  m.contentCounts = contentCounts(checked);
  m.slot = prior?.generation === m.generation ? prior.slot : prior ? 1 - (prior.slot || 0) : 0;
  let put = 0, unchanged = 0, bytes = 0;
  for (const [path, meta] of Object.entries(m.assets)) {
    const data = checked.get(path).bytes;
    const key = prefix + `slot-${m.slot}/` + (path === 'index.json' ? path : path.split('/').slice(2).join('/'));
    const existing = await driver.get(key);
    if (existing && sha(existing) === meta.sha256) {
      unchanged++;
    } else {
      await driver.put(key, data); put++; bytes += data.length;
      const verified = await driver.get(key);
      if (!verified || sha(verified) !== meta.sha256) throw new Error('CONSUMER_UPLOAD_FAILED');
    }
  }
  if (prior?.generation !== m.generation) {
    if (prior) await driver.put(prefix + 'previous.json', Buffer.from(JSON.stringify(prior)));
    await driver.put(prefix + 'manifest.json', Buffer.from(JSON.stringify(m)));
  }
  const verified = await manifest(driver, prefix + 'manifest.json');
  if (verified?.generation !== m.generation) throw new Error('CONSUMER_POINTER_FAILED');
  return {status: 'PUBLISHED', generation: m.generation, uploadedObjects: put, unchangedObjects: unchanged, uploadedBytes: bytes, retainedGenerations: prior && prior.generation !== m.generation ? 2 : 1};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), arg = k => args[args.indexOf(k) + 1];
  try {
    if (!args.includes('--namespace') || !args.includes('--directory')) throw new Error('MISSING_ARGUMENT');
    const driver = args.includes('--local-root') ? createFsDriver(arg('--local-root')) : createS3DriverFromEnv();
    console.log(JSON.stringify(await publish(driver, {namespace: arg('--namespace'), directory: arg('--directory')})));
  } catch { console.error('CONSUMER_PUBLICATION_FAILED'); process.exitCode = 1; }
}
