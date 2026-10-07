/* Fresh provider discovery and read-only universe diff. Provider rows remain in
 * .market-cache by default; this module never writes the canonical master. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const TIINGO_DISCOVERY_URL = 'https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip';
export const DISCOVERY_VERSION = 'tiingo2-discovery-1.0.0';
const text = (v) => v == null || String(v).trim() === '' ? null : String(v).trim();
const upper = (v) => text(v)?.toUpperCase() || null;
const hash = (v) => createHash('sha256').update(v).digest('hex');
const stable = (v) => JSON.stringify(v, (_k, value) => value && !Array.isArray(value) && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])) : value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))
  && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

/** Strict CSV parsing, including embedded quotes/newlines and UTF-8 BOM. */
export function parseDiscoveryCsv(input) {
  const csv = String(input).replace(/^\uFEFF/, '');
  const matrix = []; let row = [], field = '', quoted = false, closed = false;
  const pushRow = () => { row.push(field); if (row.some((v) => v.trim())) matrix.push(row); row = []; field = ''; closed = false; };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"') {
      if (field || closed) throw new Error('Malformed discovery CSV quote');
      quoted = true;
    } else if (c === ',') { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && csv[i + 1] === '\n') i++; pushRow(); }
    else { if (closed && !/\s/.test(c)) throw new Error('Malformed discovery CSV after quote'); field += c; }
  }
  if (quoted) throw new Error('Unclosed discovery CSV quote');
  if (row.length || field) pushRow();
  if (!matrix.length) throw new Error('Empty discovery CSV');
  const columns = matrix.shift().map((v) => v.trim());
  if (!columns.includes('ticker') || new Set(columns).size !== columns.length) throw new Error('Invalid discovery CSV columns');
  const rows = matrix.map((cells) => {
    if (cells.length !== columns.length) throw new Error('Discovery CSV column count mismatch');
    return Object.fromEntries(columns.map((k, i) => [k, cells[i].trim()]));
  });
  return { columns, rows };
}

/** Read one CSV from Tiingo's ZIP; reject truncation, encryption and zip bombs. */
export function readTiingoZip(buffer, maxExpandedBytes = 128 * 1024 * 1024) {
  const b = Buffer.from(buffer); let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid Tiingo ZIP directory');
  if (b.readUInt16LE(eocd + 4) || b.readUInt16LE(eocd + 6)) throw new Error('Multipart Tiingo ZIP unsupported');
  let p = b.readUInt32LE(eocd + 16); const candidates = [];
  for (let i = 0; i < b.readUInt16LE(eocd + 10); i++) {
    if (p + 46 > eocd || b.readUInt32LE(p) !== 0x02014b50) throw new Error('Truncated Tiingo ZIP');
    const flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10);
    const size = b.readUInt32LE(p + 20), expanded = b.readUInt32LE(p + 24);
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42), name = b.toString('utf8', p + 46, p + 46 + nl);
    if (p + 46 + nl + el + cl > eocd) throw new Error('Truncated Tiingo ZIP entry');
    if (/\.csv$/i.test(name)) {
      if (flags & 1 || ![0, 8].includes(method) || expanded > maxExpandedBytes) throw new Error('Unsafe Tiingo ZIP entry');
      if (local + 30 > p || b.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid Tiingo ZIP local entry');
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      if (start + size > p) throw new Error('Truncated Tiingo ZIP data');
      const raw = b.subarray(start, start + size);
      const data = method === 8 ? inflateRawSync(raw, { maxOutputLength: maxExpandedBytes }) : raw;
      if (data.length !== expanded) throw new Error('Tiingo ZIP expanded size mismatch');
      candidates.push({ name, text: data.toString('utf8') });
    }
    p += 46 + nl + el + cl;
  }
  if (candidates.length !== 1) throw new Error('Tiingo ZIP must contain exactly one CSV');
  return candidates[0];
}

/** Missing provider fields remain null. An old endDate means INACTIVE,
 * never proven DELISTED; listing/action evidence must establish that. */
export function normalizeDiscoveryRows(rows, { asOf, activeWindowDays = 7 } = {}) {
  if (!day(asOf)) throw new Error('Discovery asOf must be a valid YYYY-MM-DD');
  if (!Number.isInteger(activeWindowDays) || activeWindowDays < 0) throw new Error('Invalid activeWindowDays');
  return rows.map((raw) => {
    const ticker = upper(raw.ticker); if (!ticker) throw new Error('Discovery row missing ticker');
    const startDate = text(raw.startDate ?? raw.start_date), endDate = text(raw.endDate ?? raw.end_date);
    for (const d of [startDate, endDate]) if (d && !day(d)) throw new Error('Invalid discovery date for ' + ticker);
    const explicit = upper(raw.listingStatus ?? raw.listing_status ?? raw.activeStatus ?? raw.active_status);
    let listingStatus = ['ACTIVE', 'DELISTED', 'INACTIVE', 'MERGED', 'RENAMED'].includes(explicit) ? explicit : 'UNKNOWN';
    let statusEvidence = listingStatus !== 'UNKNOWN' ? 'PROVIDER_EXPLICIT' : 'UNAVAILABLE';
    if (listingStatus === 'UNKNOWN' && typeof raw.active === 'boolean') {
      listingStatus = raw.active ? 'ACTIVE' : 'INACTIVE'; statusEvidence = 'PROVIDER_EXPLICIT';
    } else if (listingStatus === 'UNKNOWN' && endDate) {
      const ageDays = (Date.parse(asOf) - Date.parse(endDate)) / 86400000;
      listingStatus = ageDays >= 0 ? (ageDays <= activeWindowDays ? 'ACTIVE' : 'INACTIVE') : 'UNKNOWN';
      statusEvidence = ageDays >= 0 ? 'INFERRED_PRICE_END_DATE' : 'FUTURE_END_DATE';
    }
    const normalized = {
      ticker, providerSymbol: text(raw.providerSymbol) || ticker,
      companyName: text(raw.name ?? raw.companyName ?? raw.company ?? raw.company_name),
      assetType: text(raw.assetType ?? raw.asset_type), exchange: upper(raw.exchange),
      currency: upper(raw.priceCurrency ?? raw.currency), startDate, endDate,
      active: listingStatus === 'ACTIVE' ? true : listingStatus === 'UNKNOWN' ? null : false,
      listingStatus, statusEvidence, provider: 'tiingo', providerMetadata: raw,
      sourceTimestamp: text(raw.sourceTimestamp ?? raw.source_timestamp)
    };
    return { recordId: hash(stable(raw)), ...normalized };
  }).sort((a, b) => compare(a.ticker, b.ticker) || compare(a.recordId, b.recordId));
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true }); const tmp = path + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n'); renameSync(tmp, path);
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function validateCache(path) {
  const value = readJson(path);
  if (value.version !== DISCOVERY_VERSION || value.recordsSha256 !== hash(stable(value.records))) throw new Error('Invalid discovery cache ' + path);
  return value;
}

/** Resume an immutable run ID or obtain fresh provider bytes. Cache freshness
 * concerns the last successful provider fetch, never file modification time. */
export async function discoverTiingo({ workDir = '.market-cache/tiingo/tiingo2', runId, asOf = new Date().toISOString().slice(0, 10),
  fromCsv, fromZip, fromJson, fetchImpl = globalThis.fetch, maxAgeMs = 0, force = false,
  now = new Date().toISOString(), activeWindowDays = 7, retries = 2, timeoutMs = 30000 } = {}) {
  if (!day(asOf) || Number.isNaN(Date.parse(now))) throw new Error('Invalid discovery time');
  if ([fromCsv, fromZip, fromJson].filter(Boolean).length > 1) throw new Error('Only one discovery input is allowed');
  if (runId && !/^[a-zA-Z0-9_.-]{1,120}$/.test(runId)) throw new Error('Unsafe discovery runId');
  const input = fromCsv || fromZip || fromJson;
  const fingerprint = hash(stable({ asOf, activeWindowDays, input: input ? resolve(input) : TIINGO_DISCOVERY_URL,
    inputSha256: input ? hash(readFileSync(input)) : null }));
  const runPath = runId ? join(workDir, 'runs', runId, 'tiingo2_fresh_discovery.json') : null;
  if (runPath && existsSync(runPath)) {
    const cached = validateCache(runPath);
    if (cached.requestFingerprint !== fingerprint) throw new Error('Discovery runId belongs to a different request');
    return cached;
  }
  const latestPath = join(workDir, 'latest.json');
  const latest = existsSync(latestPath) ? validateCache(latestPath) : null;
  if (!input && !runId && !force && latest && latest.requestFingerprint === fingerprint
    && Date.parse(now) >= Date.parse(latest.discoveryTimestamp) && Date.parse(now) - Date.parse(latest.discoveryTimestamp) < maxAgeMs) return latest;
  let bytes, source, rows;
  if (input) {
    bytes = readFileSync(input);
    source = { kind: fromCsv ? 'LOCAL_CSV' : fromZip ? 'LOCAL_ZIP' : 'LOCAL_JSON', path: resolve(input), provider: 'tiingo', fetchedAt: null };
  } else {
    const headers = {};
    if (latest?.source.etag) headers['If-None-Match'] = latest.source.etag;
    if (latest?.source.lastModified) headers['If-Modified-Since'] = latest.source.lastModified;
    let response;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        response = await fetchImpl(TIINGO_DISCOVERY_URL, { headers, signal: AbortSignal.timeout(timeoutMs) });
        if (response.status === 304 && latest) break;
        if (!response.ok) {
          if (![408, 429].includes(response.status) && response.status < 500) throw new Error('Tiingo discovery HTTP ' + response.status);
          if (attempt === retries) throw new Error('Tiingo discovery HTTP ' + response.status);
        } else { bytes = Buffer.from(await response.arrayBuffer()); break; }
      } catch (error) { if (attempt === retries || /HTTP [234]\d\d/.test(error.message)) throw error; }
      await new Promise((r) => setTimeout(r, Math.min(250 * 2 ** attempt, 2000)));
    }
    if (!bytes && response?.status !== 304) throw new Error('Tiingo discovery returned no data');
    source = { kind: 'PROVIDER_DOWNLOAD', provider: 'tiingo', url: TIINGO_DISCOVERY_URL, fetchedAt: now,
      etag: response.headers.get('etag') || latest?.source.etag || null,
      lastModified: response.headers.get('last-modified') || latest?.source.lastModified || null,
      revalidated: response.status === 304, bytes: bytes?.length || latest?.source.bytes || null };
    if (response.status === 304) rows = latest.records.map((r) => r.providerMetadata);
  }
  if (!rows) {
    if (fromJson) {
      const data = JSON.parse(bytes.toString('utf8')); rows = Array.isArray(data) ? data : data.records || data.rows || data.entries;
      if (!Array.isArray(rows)) throw new Error('Discovery JSON contains no provider rows');
      rows = rows.map((r) => r.providerMetadata || r);
    } else {
      const csv = fromCsv ? bytes.toString('utf8') : readTiingoZip(bytes).text;
      const parsed = parseDiscoveryCsv(csv); rows = parsed.rows; source.columns = parsed.columns;
    }
  }
  if (!rows.length) throw new Error('Empty discovery cannot be staged');
  const records = normalizeDiscoveryRows(rows, { asOf, activeWindowDays });
  const recordsSha256 = hash(stable(records));
  const resolvedRunId = runId || asOf + '-' + hash(stable({ recordsSha256, now })).slice(0, 16);
  const byAssetType = {}, byListingStatus = {};
  for (const r of records) {
    byAssetType[r.assetType || 'UNKNOWN'] = (byAssetType[r.assetType || 'UNKNOWN'] || 0) + 1;
    byListingStatus[r.listingStatus] = (byListingStatus[r.listingStatus] || 0) + 1;
  }
  const result = { version: DISCOVERY_VERSION, runId: resolvedRunId, providerSource: 'tiingo', asOf,
    discoveryTimestamp: now, sourceTimestamp: source.lastModified || null, activeWindowDays,
    requestFingerprint: fingerprint, source, recordsSha256,
    counts: { records: records.length, tickerStrings: new Set(records.map((r) => r.ticker)).size, byAssetType, byListingStatus }, records };
  const destination = runPath || join(workDir, 'runs', resolvedRunId, 'tiingo2_fresh_discovery.json');
  if (existsSync(destination)) {
    const prior = validateCache(destination);
    if (stable(prior) !== stable(result)) throw new Error('Discovery run collision');
  } else atomicJson(destination, result);
  atomicJson(latestPath, result);
  return result;
}

const members = (value) => Array.isArray(value) ? value : value?.securities || value?.decisions || value?.rows || value?.entries || [];
const memberMap = (value) => new Map(members(value).map((s) => [upper(s.ticker), s]));

/** Diff all three canonical projections, retaining every baseline member.
 * Symbol changes require independently resolved evidence from identity stage. */
export function diffUniverses({ discovery, raw = [], product = [], consumer = [], previousDiscovery = null, symbolChanges = [] } = {}) {
  const fresh = new Map();
  for (const r of discovery.records) { if (!fresh.has(r.ticker)) fresh.set(r.ticker, []); fresh.get(r.ticker).push(r); }
  const layers = { raw: memberMap(raw), product: memberMap(product), consumer: memberMap(consumer) };
  const previous = previousDiscovery ? new Set(previousDiscovery.records.map((r) => r.ticker)) : null;
  const changes = new Map(symbolChanges.filter((r) => r.status === 'CONFIRMED' || r.state === 'CONFIRMED_RENAME' || r.confirmed === true).map((r) => [upper(r.newTicker), r]));
  const all = new Set([...fresh.keys(), ...Object.values(layers).flatMap((m) => [...m.keys()])]);
  const records = [...all].sort(compare).map((ticker) => {
    const rows = fresh.get(ticker) || [], inLayers = Object.fromEntries(Object.entries(layers).map(([k, m]) => [k, m.has(ticker)]));
    const categories = [], statuses = [...new Set(rows.map((r) => r.listingStatus))];
    const identityKeys = new Set(rows.map((r) => stable([r.exchange, r.assetType, r.startDate])));
    if (!rows.length) categories.push('PRESENT_IN_VU_BUT_NOT_FRESH');
    else {
      categories.push(inLayers.raw ? 'PRESENT_IN_BOTH' : 'MISSING_IN_CURRENT_VU');
      if (previous && !previous.has(ticker)) categories.push('NEW_IN_TIINGO');
      if (rows.length > 1) categories.push('DUPLICATE');
      if (statuses.includes('DELISTED')) categories.push('DELISTED');
      if (statuses.includes('INACTIVE')) categories.push('INACTIVE');
      if (statuses.includes('UNKNOWN') || statuses.length > 1 || identityKeys.size > 1) categories.push('UNKNOWN');
      if (changes.has(ticker)) categories.push('SYMBOL_CHANGED');
    }
    return { ticker, category: categories[0], categories, inFresh: rows.length > 0, inRaw: inLayers.raw,
      inProduct: inLayers.product, inConsumer: inLayers.consumer,
      missingFrom: Object.keys(inLayers).filter((k) => !inLayers[k]), providerRecords: rows.length,
      symbolCollision: identityKeys.size > 1, listingStatuses: statuses.sort(compare),
      securityId: layers.raw.get(ticker)?.securityId || layers.product.get(ticker)?.securityId || null,
      companyName: rows.find((r) => r.companyName)?.companyName || layers.raw.get(ticker)?.companyName || null,
      providerRecordIds: rows.map((r) => r.recordId), symbolChange: changes.get(ticker) || null };
  });
  const byCategory = {};
  for (const r of records) for (const c of r.categories) byCategory[c] = (byCategory[c] || 0) + 1;
  return { version: 'tiingo2-universe-diff-1.0.0', runId: discovery.runId, discoveryTimestamp: discovery.discoveryTimestamp,
    discoverySha256: discovery.recordsSha256, previousDiscoveryAvailable: !!previous,
    counts: { freshRecords: discovery.records.length, freshTickers: fresh.size, raw: layers.raw.size,
      product: layers.product.size, consumer: layers.consumer.size, byCategory },
    safety: { canonicalWrites: false, removalsApplied: 0, absenceIsDelisting: false }, records };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
  const root = resolve(arg('--root') || '.'), workDir = resolve(arg('--work-dir') || join(root, '.market-cache/tiingo/tiingo2'));
  const discovery = await discoverTiingo({ workDir, runId: arg('--run-id'), asOf: arg('--as-of'),
    fromCsv: arg('--from-csv'), fromZip: arg('--from-zip'), fromJson: arg('--from-json'), force: args.includes('--fresh') });
  const out = resolve(arg('--out') || join(workDir, 'runs', discovery.runId));
  atomicJson(join(out, 'tiingo2_fresh_discovery.json'), discovery);
  if (arg('--raw')) {
    const diff = diffUniverses({ discovery, raw: readJson(arg('--raw')),
      product: arg('--product') ? readJson(arg('--product')) : [], consumer: arg('--consumer') ? readJson(arg('--consumer')) : [],
      previousDiscovery: arg('--previous-discovery') ? readJson(arg('--previous-discovery')) : null });
    atomicJson(join(out, 'tiingo2_universe_diff.json'), diff);
  }
  console.log(JSON.stringify({ runId: discovery.runId, counts: discovery.counts, out }));
}
