/* Read-only, current-manifest-bound cost and CAS preview for the existing
 * HistoryStore. This prepares no R2 objects and authorizes no publication. */
import { readFileSync, lstatSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifyStagedCanonicalPublication } from './tiingo2-publication.mjs';
import { splitAdjustedCloses } from './publish-discover-series.mjs';

const require = createRequire(import.meta.url);
const Guard = require('../../quant/engines/zero-cost-guard.js');
const Store = require('../../quant/engines/history-store.js');
const Quality = require('../../quant/engines/market-quality.js');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function privatePath(root, path) {
  if (typeof path !== 'string' || path.includes('\\') || path.startsWith('/')) throw Error('HISTORY_PLAN_UNSAFE_PATH');
  const full = resolve(root, path), rel = relative(resolve(root), full);
  if (!rel || rel === '..' || rel.startsWith('..' + sep)) throw Error('HISTORY_PLAN_UNSAFE_PATH');
  for (let ancestor = resolve(root);; ancestor = dirname(ancestor)) {
    if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink()) throw Error('HISTORY_PLAN_UNSAFE_PATH');
    if (ancestor === dirname(ancestor)) break;
  }
  let current = resolve(root);
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (existsSync(current) && (lstatSync(current).isSymbolicLink() ||
        lstatSync(current).isFile() && lstatSync(current).nlink > 1)) throw Error('HISTORY_PLAN_UNSAFE_PATH');
  }
  return full;
}

export function verifyScopedHistoryIntent({ root, staged, planRoot, sourceCommit }) {
  root = resolve(root); planRoot = resolve(planRoot);
  if (!planRoot.includes(sep + '.market-cache' + sep)) throw Error('HISTORY_PLAN_PRIVATE_ROOT_REQUIRED');
  const verified = verifyStagedCanonicalPublication({ root, staged });
  if (verified.protectedQAStatus !== 'BOUND_AND_VERIFIED') throw Error('SCOPED_HISTORY_PROTECTED_QA_UNBOUND');
  const planFile = privatePath(planRoot, 'history-publication-plan.json');
  const planBytes = readFileSync(planFile), plan = JSON.parse(planBytes);
  const manifestPath = typeof staged === 'string' ? join(resolve(staged), 'manifest.json') : staged.manifestPath;
  const manifest = JSON.parse(readFileSync(manifestPath));
  if (plan.schemaVersion !== 'tiingo2-private-history-publication-intent-1.0.0' ||
      plan.publicationManifestSha256 !== verified.manifestSha256 ||
      !/^[a-f0-9]{40}$/.test(sourceCommit || '') || plan.sourceCommit !== sourceCommit ||
      plan.operation !== 'APPEND_NEW_SECURITIES_ONLY' || plan.productionWrites !== 0 ||
      plan.owner !== 'quant/engines/history-store.js' ||
      plan.transport !== 'AUTHENTICATED_ENCRYPTED_PACKAGE_ONLY' ||
      plan.writer !== 'EXISTING_HISTORY_STORE_WITH_CURRENT_ZERO_COST_PREFLIGHT' ||
      !Array.isArray(plan.protectedExistingSecuritiesUpdated) || plan.protectedExistingSecuritiesUpdated.length ||
      !['CURRENT_STORAGE_PREFLIGHT', 'PROVIDER_IDENTITY', 'CURRENT_INDEX_CAS', 'CORPORATE_ACTIONS',
        'PUBLISHED_PRODUCT_MANIFEST_HASH'].every(gate => plan.requiredGates?.includes(gate)) ||
      !Array.isArray(plan.rows) || plan.rows.length !== manifest.additions.length || manifest.removals?.length)
    throw Error('SCOPED_HISTORY_INTENT_NOT_BOUND');
  const additions = new Map(manifest.additions.map(row => [row.ticker, row])), seen = new Set();
  const rows = [];
  for (const row of plan.rows) {
    const addition = additions.get(row.ticker);
    if (!addition || seen.has(row.ticker) || addition.securityId !== row.securityId ||
        row.path !== 'private-histories/tiingo/daily/' + row.securityId + '.json' ||
        row.precondition !== 'ABSENT_OR_EXACT_SAME_SOURCE_CONTENT' ||
        row.existingObjectOverwriteAllowed !== false || !/^[a-f0-9]{64}$/.test(row.sha256 || ''))
      throw Error('SCOPED_HISTORY_IDENTITY_OR_PRECONDITION_INVALID');
    seen.add(row.ticker);
    const bytes = readFileSync(privatePath(planRoot, row.path));
    if (sha(bytes) !== row.sha256) throw Error('SCOPED_HISTORY_SOURCE_HASH_MISMATCH');
    const series = JSON.parse(bytes);
    if (series.ticker !== row.ticker || series.securityId !== row.securityId || series.provider !== 'tiingo' ||
        !Array.isArray(series.bars) || series.bars.length !== row.bars || series.bars.length < 2 ||
        row.firstDate !== series.bars[0].date || row.latestDate !== series.bars.at(-1).date ||
        series.bars.some((bar, index) => bar.securityId !== row.securityId || !validDate(bar.date) ||
          index > 0 && bar.date <= series.bars[index - 1].date))
      throw Error('SCOPED_HISTORY_SOURCE_SERIES_INVALID');
    const validNumber = value => typeof value === 'number' && Number.isFinite(value);
    if (!series.currency || series.adjustmentStatus !== 'adjusted' ||
        !/^[a-f0-9]{64}$/.test(series.provenance?.sourceResponseSha256 ?? '') ||
        series.provenance?.seriesSha256 !== sha(Buffer.from(JSON.stringify(series.bars))) ||
        series.bars.some(bar => bar.currency !== series.currency ||
          ![bar.open, bar.high, bar.low, bar.close, bar.adjustedClose].every(value => validNumber(value) && value > 0) ||
          !validNumber(bar.volume) || bar.volume < 0 || !validNumber(bar.splitFactor) || bar.splitFactor <= 0 ||
          bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close)) ||
        Quality.classifyCorporateActions(series.bars).ok !== true)
      throw Error('SCOPED_HISTORY_PRICE_OR_ACTIONS_INVALID');
    const chartPath = 'quant/data/market/discover-series/' + row.securityId + '.json';
    const chartEntry = manifest.files.find(entry => entry.path === chartPath);
    if (!chartEntry || !/^projection-blobs\/[a-f0-9]{64}\.bin$/.test(chartEntry.stagedPath))
      throw Error('SCOPED_HISTORY_STAGED_CHART_BINDING_MISSING');
    const chartBytes = readFileSync(privatePath(dirname(manifestPath), chartEntry.stagedPath));
    if (sha(chartBytes) !== chartEntry.stagedSha256) throw Error('SCOPED_HISTORY_STAGED_CHART_HASH_MISMATCH');
    const chart = JSON.parse(chartBytes), adjusted = new Map(splitAdjustedCloses(series.bars).map(bar =>
      [bar.date, Math.round(bar.close * 100) / 100]));
    if (chart.securityId !== row.securityId || chart.ticker !== row.ticker || chart.provider !== 'tiingo' ||
        chart.currency !== series.currency || chart.corporateActionStatus !== 'PASS' ||
        chart.sourceResponseSha256 !== series.provenance.sourceResponseSha256 ||
        chart.sourceBarCount !== series.bars.length || chart.to !== series.bars.at(-1).date ||
        !Array.isArray(chart.points) || chart.points.length < 2 ||
        chart.points.some(point => !Array.isArray(point) || point.length !== 2 ||
          adjusted.get(point[0]) !== point[1]))
      throw Error('SCOPED_HISTORY_CHART_SOURCE_MISMATCH');
    rows.push({ ticker: row.ticker, securityId: row.securityId, bars: row.bars,
      sourceSha256: row.sha256, sourceBytes: bytes.length });
  }
  return { schemaVersion: 'tiingo2-scoped-history-intent-verified-1', runId: manifest.runId,
    sourceCommit, publicationManifestSha256: verified.manifestSha256, planSha256: sha(planBytes),
    rows: rows.sort((a, b) => a.ticker.localeCompare(b.ticker)), productionWrites: 0 };
}

export function assessScopedHistoryPreflight({ intent, usage, previousUsage, indexSnapshot, measurement,
  usageETag, targetObjects, measured = true }) {
  const symbols = indexSnapshot?.index?.symbols;
  const indexETag = indexSnapshot?.etag;
  if (!intent?.rows?.length || !symbols || !measurement ||
      !Number.isSafeInteger(measurement.storageBytes) || measurement.storageBytes < 0 ||
      !Number.isSafeInteger(measurement.objectCount) || measurement.objectCount < 0 ||
      ![null, 'string'].includes(indexETag === null ? null : typeof indexETag) ||
      ![null, 'string'].includes(usageETag === null ? null : typeof usageETag))
    throw Error('SCOPED_HISTORY_LIVE_MEASUREMENT_REQUIRED');
  if (!Array.isArray(targetObjects) || targetObjects.length !== intent.rows.length ||
      new Set(targetObjects.map(row => row.ticker)).size !== intent.rows.length ||
      intent.rows.some(row => targetObjects.filter(probe => probe.ticker === row.ticker &&
        typeof probe.key === 'string' && ['gz', 'zst'].some(codec =>
          probe.key.endsWith('/' + Store.keyForTicker(row.ticker) + '.json.' + codec)) &&
        typeof probe.present === 'boolean').length !== 1))
    throw Error('SCOPED_HISTORY_TARGET_HEAD_INCOMPLETE');
  const collisions = intent.rows.filter(row => Object.hasOwn(symbols, row.ticker)).map(row => row.ticker);
  const existingTargetObjects = targetObjects.filter(row => row.present).map(row => row.ticker).sort();
  const orphanObjects = existingTargetObjects.filter(ticker => !Object.hasOwn(symbols, ticker));
  const accounting = Guard.accountingBasis({ measured, usage, previousUsage, index: indexSnapshot.index });
  // Raw private source bytes exceed the compressed provider objects. Add a
  // conservative 1 MiB for the index/usage objects and metadata overhead.
  const sourceBytes = intent.rows.reduce((sum, row) => sum + row.sourceBytes, 0);
  const estimate = Guard.estimateOperations({ kind: 'BULK_UPLOAD', objectWrites: intent.rows.length,
    objectReads: intent.rows.length * 2, objectHeads: intent.rows.length,
    indexWrites: 2, listPages: 0, bytesDelta: sourceBytes + 1048576 });
  const verdict = Guard.evaluate({ operation: 'BULK_UPLOAD', estimate, usage,
    currentStorageBytes: measurement.storageBytes });
  const status = measured && accounting.known && verdict.verdict === Guard.ALLOWED && !collisions.length &&
    !existingTargetObjects.length &&
    ((indexETag === null && Object.keys(symbols).length === 0) ||
      typeof indexETag === 'string' && /^"[^"\r\n]+"$/.test(indexETag)) &&
    (usageETag === null || /^"[^"\r\n]+"$/.test(usageETag)) ? 'PREFLIGHT_GREEN_READ_ONLY' : 'BLOCKED';
  return { schemaVersion: 'tiingo2-scoped-history-preflight-1', status,
    publicationManifestSha256: intent.publicationManifestSha256, planSha256: intent.planSha256,
    sourceCommit: intent.sourceCommit, rows: intent.rows.length, collisions,
    targetObjectProbe: 'COMPLETE', existingTargetObjects, orphanObjects,
    storage: { currentBytes: measurement.storageBytes, objectCount: measurement.objectCount },
    index: { currentETag: indexETag, currentSymbols: Object.keys(symbols).length },
    usage: { currentETag: usageETag, accountingBasis: accounting.basis, accountingKnown: accounting.known },
    estimate, verdict, productionWrites: 0,
    note: 'Any existing target object blocks until exact content is verified by an official scoped writer. A green read-only preflight is not a storage/index publication receipt.' };
}

export async function probeScopedHistoryTargets(store, rows) {
  const targets = [];
  for (const row of rows) {
    const key = store.seriesKey(row.ticker);
    store.budget.consumeClassB(1, 'HEAD intended scoped object ' + key);
    const head = await store.driver.head(key);
    targets.push({ ticker: row.ticker, key, present: !!head });
  }
  return targets;
}

/** Use the same live HistoryStore and R2 driver as sync-history-store, with
 * only the existing zero-cost bookkeeping reserve during observation. */
export async function readScopedHistoryPreflight({ root, staged, planRoot, sourceCommit, driver }) {
  const intent = verifyScopedHistoryIntent({ root, staged, planRoot, sourceCommit });
  const budget = Guard.createBudget({ classAOperations: Guard.BOOKKEEPING_RESERVE.classA,
    classBOperations: Guard.BOOKKEEPING_RESERVE.classB + intent.rows.length });
  const store = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US', budget });
  const month = Guard.monthKey();
  const usageSnapshot = await store.readUsageSnapshot(month);
  const previousUsage = usageSnapshot.usage.updatedAt ? null : await store.readUsage(Guard.previousMonthKey(month));
  const indexSnapshot = await store.readIndexSnapshot();
  const measurement = await store.measureStorage({ expectedObjects: indexSnapshot.index.symbolCount || 7000 });
  const targetObjects = await probeScopedHistoryTargets(store, intent.rows);
  return assessScopedHistoryPreflight({ intent, usage: usageSnapshot.usage, previousUsage,
    indexSnapshot, measurement, usageETag: usageSnapshot.etag, targetObjects });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const root = process.cwd(), staged = arg('--staged'), planRoot = arg('--plan-root'), out = arg('--out');
  if (!staged || !planRoot || !out) throw Error('SCOPED_HISTORY_STAGED_PLAN_OUT_REQUIRED');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const { createS3DriverFromEnv } = await import('./storage/s3-driver.mjs');
  const result = await readScopedHistoryPreflight({ root, staged, planRoot, sourceCommit,
    driver: createS3DriverFromEnv() });
  mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'PREFLIGHT_GREEN_READ_ONLY') process.exitCode = 1;
}
