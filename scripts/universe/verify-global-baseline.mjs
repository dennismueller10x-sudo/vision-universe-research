// A review guard for the additive global identity rollout. Git comparisons
// inspect the protected data baseline; no ingestion or mutation takes place.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7);
if (!base || !/^[a-zA-Z0-9_./-]+$/.test(base)) throw Error('BASE_REF_REQUIRED');
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
git(['rev-parse', '--verify', base + '^{commit}']);
const layer = JSON.parse(readFileSync('quant/data/universe/global-equities.json'));
const symbols = new Set(layer.listings.map(row => row.ticker));
const ids = new Set(layer.listings.map(row => row.listingId));
const changes = git(['diff', '--name-only', base, '--', 'quant/data/market', 'quant/data/sec', 'discover/data/stocks']).trim().split('\n').filter(Boolean);
for (const path of changes) {
  const ticker = path.match(/^discover\/data\/stocks\/US_REAL\/([^/]+)\.json$/)?.[1];
  if (!ticker || !symbols.has(ticker)) throw Error('PROTECTED_BASELINE_CHANGED: ' + path);
  readFileSync(path); // The overlay must never delete an existing stock detail.
}
const shards = git(['ls-tree', '-r', '--name-only', base, '--', 'quant/data/universe/instruments']).trim().split('\n').filter(Boolean);
let members = 0, enriched = 0;
for (const path of shards) {
  const before = JSON.parse(git(['show', base + ':' + path])).instruments;
  const after = JSON.parse(readFileSync(path)).instruments;
  if (before.length !== after.length) throw Error('MASTER_MEMBERSHIP_CHANGED: ' + path);
  const current = new Map(after.map(row => [row.instrumentId, row]));
  if (current.size !== after.length) throw Error('DUPLICATE_MASTER_ID');
  for (const row of before) {
    const next = current.get(row.instrumentId);
    if (!next) throw Error('MASTER_MEMBER_REMOVED');
    const originalFields = ids.has(row.instrumentId)
      ? Object.fromEntries(Object.keys(row).map(key => [key, next[key]])) : next;
    if (!isDeepStrictEqual(row, originalFields)) throw Error('MASTER_BASELINE_CHANGED: ' + row.instrumentId);
    members++; if (ids.has(row.instrumentId)) enriched++;
  }
}
if (enriched !== layer.listings.length) throw Error('GLOBAL_MEMBERSHIP_MISMATCH');
console.log(JSON.stringify({ state: 'PASS', members, enriched, protectedPriceAndSecArtifactsChanged: 0,
  nonEnrichedDetailsChanged: 0, source: base }));
