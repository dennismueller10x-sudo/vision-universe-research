/** Reproducible private replay. Never calls a provider or writes product data. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createDecipheriv } from 'node:crypto';
import { privateRoot } from './europe-ingestion.mjs';
import { buildEuropeEquityUniverse, validIsin, validLei, EUROPE_EXCHANGE_PLAN } from './europe-universe.mjs';
import { evaluateEuropePriceSeries, evaluateFreshness, validateEodBars, projectEuropeRawResearch, classifyAdjustment } from './europe-quality.mjs';
import { buildEuropeCompanyLogoEvidence, readCentralLogoRegistry } from './europe-company-logos.mjs';
const require = createRequire(import.meta.url);
const { normalizeObservation, snapshotExchangeMappings } = require('../../providers/marketstack/audit-adapter.js');
export const COMPILER_VERSION = 'marketstack-europe-private-evidence-1';
const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const unique = values => [...new Set(values.filter(Boolean))];
const key = (mic, symbol) => `${mic}:${symbol}`;
const mics = new Set(EUROPE_EXCHANGE_PLAN.flatMap(p => p.mics));
const fresh = status => ['CURRENT', 'LAST_VALID_SESSION'].includes(status);
const malformedCurrency = observation => [observation?.normalized?.currency, observation?.raw?.currency, observation?.raw?.price_currency]
  .some(value => value !== null && value !== undefined && (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)));
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function csvRows(text) {
  const records = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ';' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); records.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); records.push(row); }
  const headerIndex = records.findIndex(row => row.includes('ISIN') && row.includes('MIC Code'));
  if (headerIndex < 0) throw Error('OFFICIAL_XETRA_HEADER_MISSING');
  const header = records[headerIndex]; return records.slice(headerIndex + 1).map(row => Object.fromEntries(header.map((name, i) => [name, row[i] || ''])));
}
function gleifQueryIsin(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'api.gleif.org' &&
    parsed.pathname === '/api/v1/lei-records' ? parsed.searchParams.get('filter[isin]') : null; } catch { return null; }
}
/** Replay the index publisher's anonymous public frontend response format. */
export function decryptPublicIndexResponse(encrypted, page) {
  const body = JSON.parse(encrypted), match = page.match(/<script\b[^>]*data-drupal-selector="drupal-settings-json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw Error('PUBLIC_INDEX_SETTINGS_MISSING');
  const settings = JSON.parse(match[1]), password = settings.ajax_secure?.kye;
  if (settings.user?.uid !== 0 || typeof password !== 'string' || !password || /[^\x00-\x7F]/.test(password)) throw Error('ANONYMOUS_PUBLIC_INDEX_SETTINGS_REQUIRED');
  if (!/^[a-f0-9]{16}$/i.test(body.s || '') || !/^[a-f0-9]{32}$/i.test(body.iv || '')) throw Error('PUBLIC_INDEX_ENVELOPE_INVALID');
  const salt = Buffer.from(body.s, 'hex'); let block = Buffer.alloc(0), material = Buffer.alloc(0);
  while (material.length < 48) { block = createHash('md5').update(Buffer.concat([block, Buffer.from(password), salt])).digest(); material = Buffer.concat([material, block]); }
  const iv = material.subarray(32, 48);
  if (iv.toString('hex') !== body.iv.toLowerCase()) throw Error('PUBLIC_INDEX_IV_CONFLICT');
  const decoder = createDecipheriv('aes-256-cbc', material.subarray(0, 32), iv);
  const html = JSON.parse(Buffer.concat([decoder.update(Buffer.from(body.ct, 'base64')), decoder.final()]).toString('utf8'));
  if (typeof html !== 'string') throw Error('PUBLIC_INDEX_TABLE_INVALID');
  return { html, instrument: settings.custom?.instrument?.product_data };
}
function safeFile(root, relative) {
  if (typeof relative !== 'string' || relative.includes('..') || relative.startsWith('/')) throw Error('UNSAFE_EVIDENCE_PATH');
  const path = join(root, relative);
  for (let cursor = path; cursor !== root; cursor = dirname(cursor)) if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw Error('SYMLINK_EVIDENCE_PATH');
  return path;
}
function objectHashes(value, hashes = new Set()) {
  if (Array.isArray(value)) value.forEach(v => objectHashes(v, hashes));
  else if (value && typeof value === 'object') {
    if (value.symbol || value.ticker || value.isin) hashes.add(digest(value));
    Object.values(value).forEach(v => objectHashes(v, hashes));
  }
  return hashes;
}
function scopeMatches(op, manifest) {
  const endpoint = decodeURIComponent(manifest.endpoint || '');
  if (manifest.host !== 'api.marketstack.com' || manifest.apiVersion !== 'v2' || manifest.status !== 200) return false;
  if (op.kind === 'metadata') return endpoint === `/tickers/${op.symbol}`;
  if (['latest', 'latestBatch', 'history'].includes(op.kind)) {
    const mic = op.mic || op.listing?.mic, symbols = op.symbols || [op.listing?.providerTicker];
    return endpoint === (op.kind === 'history' ? '/eod' : '/eod/latest') && manifest.params?.exchange === mic &&
      String(manifest.params?.symbols || '').split(',').every(symbol => symbols.includes(symbol)) &&
      (op.kind !== 'history' || (!op.from || manifest.params?.date_from === op.from) && (!op.to || manifest.params?.date_to === op.to));
  }
  if (op.kind === 'snapshot') return endpoint === '/stockprice' && manifest.params?.ticker ===
    (op.listing?.snapshotTicker || op.listing?.canonicalTicker || op.listing?.providerTicker);
  if (['splits', 'dividends'].includes(op.kind)) return endpoint === `/${op.kind}` && manifest.params?.symbols === op.listing?.providerTicker;
  return false;
}
function snapshotMic(raw, op) {
  const reported = normalizeObservation(raw).normalized.providerExchange;
  if (reported) return reported;
  if (raw.exchange_code === op.listing?.mic) return raw.exchange_code;
  const norm = s => String(s || '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  return snapshotExchangeMappings.find(mapping => mapping.mic === op.listing?.mic && mapping.providerExchangeCode === raw.exchange_code &&
    (!raw.exchange_name || norm(raw.exchange_name) === norm(mapping.providerExchangeName)))?.mic || null;
}
function counts(rows) { const map = new Map(); rows.forEach(row => { const h = digest(row); map.set(h, (map.get(h) || 0) + 1); }); return map; }

/** Verify all source bytes and rederive normalized fields from contained raw rows. */
export function loadEvidenceDirectory(path, { onProgress = () => {} } = {}) {
  const root = privateRoot(path), manifestPath = safeFile(root, 'raw-manifest.json');
  const manifest = json(manifestPath), summaryPath = safeFile(root, 'summary.json'), summary = json(summaryPath);
  if (!Array.isArray(manifest) || summary.version !== 'marketstack-europe-ingestion-1') throw Error('INVALID_INGESTION_EVIDENCE_SCHEMA');
  const byId = new Map();
  for (const entry of manifest) {
    if (!/^\d{6}$/.test(entry.id || '') || byId.has(entry.id)) throw Error('DUPLICATE_OR_INVALID_RAW_ID');
    const rawPath = safeFile(root, `raw/${entry.id}.json`), bytes = readFileSync(rawPath);
    if (sha(bytes) !== entry.sha256) throw Error(`RAW_HASH_MISMATCH:${entry.id}`);
    byId.set(entry.id, { ...entry, rawPath });
    if (byId.size % 500 === 0) onProgress({ phase: 'RAW_HASHES', verified: byId.size, total: manifest.length });
  }
  const operations = [], directories = [], quarantined = [];
  for (const resultEntry of summary.results || []) {
    if (!resultEntry.resultPath) continue;
    if (operations.length && operations.length % 250 === 0) onProgress({ phase: 'RAW_REPLAY', operations: operations.length, total: summary.results.length });
    const normalizedPath = safeFile(root, resultEntry.resultPath), bytes = readFileSync(normalizedPath), entry = JSON.parse(bytes);
    if (digest(entry.operation) !== digest(resultEntry.operation) || digest(entry.responseIds) !== digest(resultEntry.responseIds)) throw Error('NORMALIZED_SUMMARY_BINDING_MISMATCH');
    const provenance = { source: 'FRESH_MARKETSTACK_V2_HASH_VERIFIED_RESPONSE', evidenceRoot: root,
      lease: summary.lease, ordinal: entry.ordinal, normalizedPath, normalizedSha256: sha(bytes),
      responseIds: entry.responseIds, responses: entry.responseIds.map(id => {
        const m = byId.get(id); if (!m) throw Error('RAW_RESPONSE_REFERENCE_MISSING');
        return { id, sha256: m.sha256, endpoint: m.endpoint, params: m.params, retrievedAt: m.retrievedAt, status: m.status };
      }) };
    if (entry.operation.kind === 'directory') {
      directories.push({ operation: entry.operation, complete: entry.result.complete === true,
        scopeComplete: entry.result.scopeComplete === true, downloadedCount: entry.result.downloadedCount ?? entry.result.data?.length ?? 0,
        provenance }); continue;
    }
    if (!['metadata', 'latest', 'latestBatch', 'history', 'splits', 'dividends', 'snapshot'].includes(entry.operation.kind)) continue;
    const matched = new Map(), sourceRows = [], pagination = [];
    for (const id of entry.responseIds) {
      const m = byId.get(id); if (!scopeMatches(entry.operation, m)) continue;
      const body = json(m.rawPath), data = body.data ?? body;
      if (body.pagination) pagination.push(body.pagination);
      const rows = (Array.isArray(data) ? data : [data]).filter(row => row && typeof row === 'object');
      for (const row of rows) {
        if (entry.operation.kind === 'snapshot' && snapshotMic(row, entry.operation) !== entry.operation.listing?.mic) continue;
        sourceRows.push(row);
      }
      for (const hash of objectHashes(body)) if (!matched.has(hash)) matched.set(hash, m);
    }
    const observations = [];
    const wrappers = entry.operation.kind === 'metadata' ? entry.result.observations || [] : entry.result.data || [];
    for (const wrapped of Array.isArray(wrappers) ? wrappers : [wrappers]) {
      const raw = wrapped?.raw; if (!raw || typeof raw !== 'object') continue;
      const m = matched.get(digest(raw));
      if (!m) { quarantined.push({ ordinal: entry.ordinal, reason: 'RAW_ROW_NOT_CONTAINED_IN_SCOPED_RESPONSE', rawHash: digest(raw) }); continue; }
      const kind = entry.operation.kind === 'snapshot' ? 'SNAPSHOT' : ['metadata'].includes(entry.operation.kind) ? 'METADATA' : 'EOD';
      const derived = normalizeObservation(raw, { kind, retrievedAt: m.retrievedAt });
      if (kind === 'SNAPSHOT') derived.normalized.providerExchange = snapshotMic(raw, entry.operation);
      const fields = ['providerTicker', 'providerExchange', 'isin', 'currency', 'open', 'high', 'low', 'close', 'volume', 'tradingDate', 'marketTimestamp', 'asOf', 'timestamp', 'date'];
      if (wrapped.normalized && fields.some(field => Object.hasOwn(wrapped.normalized, field) &&
        JSON.stringify(wrapped.normalized[field]) !== JSON.stringify(derived.normalized[field]))) {
        quarantined.push({ ordinal: entry.ordinal, reason: 'NORMALIZED_FIELD_DIFFERS_FROM_AUTHENTICATED_RAW', rawHash: digest(raw) }); continue;
      }
      observations.push({ ...derived,
        provenance: { ...provenance, rawSha256: m.sha256, rawResponseId: m.id, retrievedAt: m.retrievedAt } });
    }
    const rejectedPartitionAllowed = entry.operation.kind === 'latestBatch' || !(entry.result.rejectedObservations || []).length;
    if (!rejectedPartitionAllowed) quarantined.push({ ordinal: entry.ordinal, reason: 'UNEXPECTED_REJECTED_OBSERVATIONS_OUTSIDE_LATEST_BATCH' });
    const sourceCounts = counts(sourceRows), wrapperRows = [...(Array.isArray(wrappers) ? wrappers : [wrappers]), ...(entry.result.rejectedObservations || [])].map(w => w?.raw).filter(Boolean);
    const wrapperCounts = counts(wrapperRows);
    const replayComplete = sourceCounts.size === wrapperCounts.size && [...sourceCounts].every(([h, n]) => wrapperCounts.get(h) === n);
    if (!replayComplete) quarantined.push({ ordinal: entry.ordinal, reason: 'NORMALIZED_RAW_MULTISET_DIFFERS_FROM_SCOPED_RESPONSE', sourceRows: sourceRows.length,
      normalizedRows: wrapperRows.length, provenance });
    const latestCardinalityValid = entry.operation.kind !== 'latest' || sourceRows.length === 1;
    if (!latestCardinalityValid) quarantined.push({ ordinal: entry.ordinal, reason: 'AMBIGUOUS_LATEST_RAW_RESPONSE', sourceRows: sourceRows.length });
    let latestBatchPartitionValid = true;
    if (entry.operation.kind === 'latestBatch') {
      const scoped = sourceRows.filter(raw => { const n = normalizeObservation(raw).normalized;
        return n.providerExchange === entry.operation.mic && entry.operation.symbols.includes(n.providerTicker); });
      const symbolCounts = new Map(); scoped.forEach(raw => { const symbol = normalizeObservation(raw).normalized.providerTicker;
        symbolCounts.set(symbol, (symbolCounts.get(symbol) || 0) + 1); });
      const expectedAccepted = counts(scoped.filter(raw => symbolCounts.get(normalizeObservation(raw).normalized.providerTicker) === 1));
      const actualAccepted = counts(observations.map(o => o.raw));
      latestBatchPartitionValid = expectedAccepted.size === actualAccepted.size && [...expectedAccepted].every(([h, n]) => actualAccepted.get(h) === n);
      if (!latestBatchPartitionValid) quarantined.push({ ordinal: entry.ordinal, reason: 'LATEST_BATCH_NORMALIZATION_PARTITION_MISMATCH' });
    }
    const cleanNormalization = replayComplete && rejectedPartitionAllowed && latestCardinalityValid && latestBatchPartitionValid && observations.length === (Array.isArray(wrappers) ? wrappers.filter(w => w?.raw).length : wrappers?.raw ? 1 : 0);
    const paginationComplete = pagination.length > 0 && pagination.every(p => Number.isInteger(p.total) && Number.isInteger(p.count) && Number.isInteger(p.offset)) &&
      pagination.every(p => p.total === pagination[0].total) && pagination.every((p, i) => p.offset === (i ? pagination[i - 1].offset + pagination[i - 1].count : 0)) &&
      pagination.at(-1).offset + pagination.at(-1).count === pagination[0].total && sourceRows.length === pagination[0].total;
    operations.push({ operation: entry.operation, result: { ok: cleanNormalization && entry.result.ok,
      complete: cleanNormalization && (entry.operation.kind === 'history' ? paginationComplete : entry.result.complete),
      paginationComplete: entry.result.paginationComplete, reason: entry.result.reason, status: entry.result.status }, observations, provenance });
    if (!cleanNormalization) operations.at(-1).observations = [];
  }
  return { verified: true, root, operations, directories, quarantined,
    provenance: { summarySha256: sha(readFileSync(summaryPath)), manifestSha256: sha(readFileSync(manifestPath)),
      lease: summary.lease, generatedAt: summary.generatedAt, rawResponses: manifest.length, allRawHashesVerified: true }, summary };
}

/** Official issuer identity is independent of provider display names. */
export function readOfficialIdentities(paths) {
  const rows = [], manifests = [], quarantined = [], xetraSources = new Map();
  for (const path of paths) {
    const bytes = readFileSync(path), document = JSON.parse(bytes);
    if (!Array.isArray(document.rows)) throw Error('OFFICIAL_IDENTITY_ROWS_MISSING');
    manifests.push({ path, sha256: sha(bytes), schema: document.schema, complete: document.complete === true, generatedAt: document.generatedAt });
    for (const row of document.rows) {
      const g = row.provenance?.gleif, x = row.provenance?.xetra;
      if (row.verified !== true || !validIsin(row.isin) || !validLei(row.lei) || g?.httpStatus !== 200 || g.queryIsin !== row.isin ||
        !g.url || !x?.url || !/^[a-f0-9]{64}$/.test(g.sha256 || '') || !/^[a-f0-9]{64}$/.test(x.sha256 || '') ||
        row.issuerCountryBasis !== 'GLEIF_ENTITY_JURISDICTION' || row.legalJurisdiction !== row.issuerCountry ||
        row.entityStatus !== 'ACTIVE' || row.entityCategory !== 'GENERAL') {
        quarantined.push({ isin: row.isin, reason: 'OFFICIAL_IDENTITY_NOT_VERIFIED_ACTIVE_GENERAL_ISSUER' }); continue;
      }
      const gleifPath = join(dirname(path), `${row.isin}.gleif.raw.json`);
      if (!existsSync(gleifPath) || !x.path || !existsSync(x.path)) throw Error('OFFICIAL_RAW_SOURCE_MISSING');
      const gleifBytes = readFileSync(gleifPath);
      if (sha(gleifBytes) !== g.sha256) throw Error(`OFFICIAL_GLEIF_RAW_HASH_MISMATCH:${row.isin}`);
      const gleifDocument = JSON.parse(gleifBytes), gleif = gleifDocument.data || [];
      if (gleifQueryIsin(g.url) !== row.isin || ![gleifDocument.links?.first, gleifDocument.links?.last]
        .some(url => gleifQueryIsin(typeof url === 'string' ? url : url?.href) === row.isin)) {
        quarantined.push({ isin: row.isin, reason: 'OFFICIAL_GLEIF_RAW_QUERY_ISIN_CONFLICT' }); continue;
      }
      const verifiedEntity = gleif.filter(record => (record.attributes?.lei || record.id) === row.lei &&
        record.attributes?.entity?.jurisdiction === row.issuerCountry && record.attributes.entity.category === 'GENERAL' &&
        record.attributes.entity.status === 'ACTIVE');
      if (gleif.length !== 1 || verifiedEntity.length !== 1) { quarantined.push({ isin: row.isin, reason: 'OFFICIAL_GLEIF_ENTITY_FACT_CONFLICT' }); continue; }
      if (!xetraSources.has(x.sha256)) {
        const xetraBytes = readFileSync(x.path);
        if (sha(xetraBytes) !== x.sha256) throw Error('OFFICIAL_XETRA_RAW_HASH_MISMATCH');
        xetraSources.set(x.sha256, csvRows(xetraBytes.toString('utf8')));
      }
      const xetra = xetraSources.get(x.sha256).filter(record => record.ISIN === row.isin && record['MIC Code'] === 'XETR' &&
        record['Instrument Type'] === row.officialInstrumentType && record['Primary Market MIC Code'] === row.primaryMarketMic &&
        record['Instrument Status'] === 'Active' && record['Product Status'] === 'Active');
      if (!xetra.length || (row.regulatoryLiquid === true && !xetra.some(record => record['Regulatory Liquid Instrument'] === 'Y'))) {
        quarantined.push({ isin: row.isin, reason: 'OFFICIAL_XETRA_CLASS_FACT_CONFLICT' }); continue;
      }
      const officialMnemonic = unique(xetra.map(record => record.Mnemonic));
      const mnemonicIsins = unique(xetraSources.get(x.sha256).filter(record => record.Mnemonic === row.providerMnemonic &&
        record['MIC Code'] === 'XETR' && record['Instrument Type'] === 'CS' && record['Instrument Status'] === 'Active' &&
        record['Product Status'] === 'Active').map(record => record.ISIN));
      if (row.providerMnemonic && !officialMnemonic.includes(row.providerMnemonic)) {
        quarantined.push({ isin: row.isin, reason: 'OFFICIAL_XETRA_NATIVE_MNEMONIC_CONFLICT' }); continue;
      }
      rows.push({ ...row, nativeMnemonicVerifiedUnique: mnemonicIsins.length === 1 && mnemonicIsins[0] === row.isin,
        listingCurrency: (() => { const currencies = unique(xetra.map(record => record.Currency)); return currencies.length === 1 ? currencies[0] : null; })(),
        firstTradingDate: (() => { const dates = unique(xetra.map(record => record['First Trading Date']).filter(dateValid)); return dates.length === 1 ? dates[0] : null; })(),
        officialManifest: { path, sha256: sha(bytes) } });
    }
  }
  return { rows, manifests, quarantined };
}
export function readIndexReferences(paths) {
  return paths.map(path => {
    const bytes = readFileSync(path), document = JSON.parse(bytes);
    if (document.referenceVerified !== true || !document.source?.path || !existsSync(document.source.path) ||
      sha(readFileSync(document.source.path)) !== document.source.sha256) throw Error('OFFICIAL_INDEX_REFERENCE_SOURCE_UNVERIFIED');
    const rawText = readFileSync(document.source.path, 'utf8'), docIsins = unique((document.rows || []).map(row => row.isin));
    let extracted = null;
    if (document.source.url === 'https://api.live.deutsche-boerse.com/v1/search/equity_search') {
      const raw = JSON.parse(rawText), isins = unique((raw.data || []).map(row => row.isin));
      const expectedIndex = { DAX: 'DE0008469008', MDAX: 'DE0008467416', SDAX: 'DE0009653386', TecDAX: 'DE0007203275', FTSE100: 'GB0001383545', IBEX35: 'ES0SI0000005' }[document.index];
      if (!expectedIndex || digest(document.source.requestBody?.indices) !== digest([expectedIndex]) ||
        document.source.requestBody.offset !== 0 || document.source.requestBody.limit < raw.recordsTotal) throw Error('OFFICIAL_INDEX_REQUEST_SCOPE_CONFLICT');
      if (document.index === 'IBEX35') {
        const page = document.source.pageSource;
        if (page?.url !== 'https://www.bolsasymercados.es/en/bme-exchange/prices-and-markets/shares/ibex-35-es0si0000005.html' ||
          !page.path || !existsSync(page.path) || sha(readFileSync(page.path)) !== page.sha256 ||
          !readFileSync(page.path, 'utf8').includes('index:ES0SI0000005')) throw Error('OFFICIAL_INDEX_PUBLIC_SCOPE_PAGE_UNVERIFIED');
      }
      if (raw.recordsTotal === isins.length && (raw.data || []).length === isins.length) extracted = isins;
    } else if (document.index === 'ATX' && document.source.url === 'https://www.wienerborse.at/en/index/atx-AT0000999982/composition/') {
      const section = rawText.slice(rawText.indexOf('c6984-module-container'));
      const body = section.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
      if (body) extracted = unique([...body.matchAll(/<span\s+class="isin">([A-Z0-9]+)<\/span>/g)].map(m => m[1]));
    } else if (document.index === 'FTSEMIB' && document.source.kind === 'OFFICIAL_VENUE_PAGINATED_RAW_ENVELOPE') {
      const raw = JSON.parse(rawText);
      if (raw.responses?.length === 2 && raw.responses.every((r, i) => {
        const bytes = r.rawBytesBase64 ? Buffer.from(r.rawBytesBase64, 'base64') : Buffer.from(r.rawText);
        return sha(bytes) === r.source.sha256 && ['latin1', 'utf8'].includes(r.textEncoding || 'utf8') &&
          bytes.toString(r.textEncoding || 'utf8') === r.rawText &&
          r.source.url === `https://www.borsaitaliana.it/borsa/azioni/ftse-mib/lista.html?lang=en&page=${i + 1}`;
      })) {
        extracted = unique(raw.responses.flatMap(r => [...r.rawText.matchAll(/\/borsa\/azioni\/scheda\/([A-Z]{2}[A-Z0-9]{9}[0-9])-MTAA\.html/g)].map(m => m[1])).filter(validIsin));
      }
    } else if (document.index === 'SMI') {
      const url = new URL(document.source.url), raw = JSON.parse(rawText), rawUrl = new URL(raw.requestURL, 'https://www.six-group.com');
      if (url.protocol !== 'https:' || url.hostname !== 'www.six-group.com' || url.pathname !== '/fqs/ref.json' ||
        url.searchParams.get('where') !== 'ValorSymbol@SMI' || rawUrl.searchParams.get('where') !== 'ValorSymbol@SMI' ||
        raw.pageNumber !== 1 || raw.pageSize < raw.totalRows || raw.totalRows !== 20 || raw.rowData?.length !== 20) throw Error('OFFICIAL_SMI_REQUEST_SCOPE_CONFLICT');
      const col = raw.colNames?.indexOf('ISIN'); if (col >= 0) extracted = unique(raw.rowData.map(row => row[col]));
    } else if (new URL(document.source.url).hostname === 'live.euronext.com' && document.source.publicDecode?.anonymous === true) {
      const decode = document.source.publicDecode, expected = { CAC40: 'FR0003500008-XPAR', AEX: 'NL0000000107-XAMS' }[document.index];
      if (!expected || !decode.pageSource?.path || sha(readFileSync(decode.pageSource.path)) !== decode.pageSource.sha256 ||
        decode.pageSource.url !== `https://live.euronext.com/en/popout-page/getIndexComposition/${expected}` ||
        document.source.url !== `https://live.euronext.com/en/ajax/getIndexCompositionFull/${expected}` ||
        !decode.publicScripts?.length || decode.publicScripts.some(script => new URL(script.url).hostname !== 'live.euronext.com' || sha(readFileSync(script.path)) !== script.sha256)) {
        throw Error('PUBLIC_INDEX_DECODE_SOURCE_UNVERIFIED');
      }
      const replay = decryptPublicIndexResponse(rawText, readFileSync(decode.pageSource.path, 'utf8'));
      if (replay.instrument !== expected || sha(replay.html) !== decode.decryptedSource?.sha256) throw Error('PUBLIC_INDEX_DECODE_RESULT_CONFLICT');
      extracted = unique([...replay.html.matchAll(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g)].map(m => m[0])).filter(validIsin);
    }
    const rosterExtractionVerified = Boolean(extracted && extracted.length === document.target && extracted.every(validIsin) &&
      docIsins.length === document.rows.length && docIsins.length === extracted.length && docIsins.every(isin => extracted.includes(isin)));
    if (extracted && !rosterExtractionVerified) throw Error('OFFICIAL_INDEX_NORMALIZED_ROSTER_DIFFERS_FROM_AUTHENTICATED_SOURCE');
    return { ...document, sourceContentVerified: true, rosterExtractionVerified,
      referenceReviewReason: rosterExtractionVerified ? null : 'DETERMINISTIC_SOURCE_ROSTER_EXTRACTION_UNRESOLVED',
      documentSha256: sha(bytes), documentPath: path };
  });
}
function scopedMetadata(op, observation) {
  const raw = observation.raw, n = observation.normalized;
  const reported = unique([n.providerExchange, ...(raw.stock_exchanges || []).map(e => e.mic || e.exchange_mic)]);
  return n.providerTicker === op.symbol && (!n.providerExchange || n.providerExchange === op.mic) &&
    reported.includes(op.mic) && validIsin(n.isin) && (!op.expectedIsin || op.expectedIsin === n.isin);
}
function recentSession(freshness, calendar, date) {
  const sessions = calendar.expectedSessions || [], previous = sessions[sessions.indexOf(calendar.expectedLastCompletedSession) - 1];
  return fresh(freshness.status) || freshness.status === 'DELAYED' && date === previous;
}
function officialMetadataBridge(op, observation, official, selectBars, calendars, now) {
  const raw = observation.raw, n = observation.normalized;
  const missingIsin = value => value === null || value === undefined || value === '';
  if (!missingIsin(n.isin) || !missingIsin(raw.isin) || malformedCurrency(observation) || op.mic !== 'XETR' ||
    n.providerExchange !== 'XETR' || n.providerTicker !== op.symbol ||
    String(raw.item_type || raw.asset_type || '').toLowerCase() !== 'equity' || raw.active === false || raw.is_active === false) return null;
  const matches = official.filter(e => e.nativeMnemonicVerifiedUnique === true && e.mic === 'XETR' && e.active === true &&
    e.officialInstrumentType === 'CS' && e.providerMnemonic && op.symbol === `${e.providerMnemonic}.DE` &&
    (!op.expectedIsin || op.expectedIsin === e.isin));
  const isins = unique(matches.map(e => e.isin)), leis = unique(matches.map(e => e.lei));
  if (isins.length !== 1 || leis.length !== 1) return null;
  const candidates = ['latest', 'latestBatch'].flatMap(kind => selectBars([op.symbol], 'XETR', kind)).flatMap(e => e.observations);
  candidates.sort((a, b) => String(b.normalized.tradingDate).localeCompare(String(a.normalized.tradingDate)));
  const latest = candidates[0], calendar = calendars.XETR || {}, officialCurrencies = unique(matches.map(e => e.listingCurrency));
  const currency = latest?.normalized.currency || (officialCurrencies.length === 1 ? officialCurrencies[0] : null);
  const price = latest?.normalized, listing = { mic: 'XETR', providerTicker: op.symbol, currency };
  if (!latest || malformedCurrency(latest) || !currency || officialCurrencies.length !== 1 || officialCurrencies[0] !== currency || n.currency != null && n.currency !== currency ||
    new Set(candidates.filter(o => o.normalized.tradingDate === price.tradingDate)
    .map(o => digest(Object.fromEntries(['open', 'high', 'low', 'close', 'volume', 'currency'].map(k => [k, o.normalized[k]]))))).size !== 1) return null;
  const quality = validateEodBars([latest], { listing, now, calendar }), bar = quality.validBars[0];
  const freshness = evaluateFreshness({ latestDate: bar?.date, listing, now, calendar });
  if (!bar || !recentSession(freshness, calendar, bar.date) || typeof bar.volume !== 'number' || bar.volume <= 0) return null;
  return { resolvedIsin: isins[0], identityEvidence: matches, policy: 'OFFICIAL_NATIVE_MNEMONIC_MIC_BRIDGE', verified: true,
    nativeMnemonic: matches[0].providerMnemonic, providerSymbol: op.symbol, mic: op.mic, providerIsin: n.isin,
    officialSource: matches[0].provenance.xetra, metadataProvenance: observation.provenance, latestProvenance: latest.provenance,
    qualityVersion: quality.version, latestDate: bar.date, freshness: freshness.status, issuerLei: leis[0],
    currency, priceCurrencyBasis: latest.normalized.currency ? 'PROVIDER_REPORTED' : 'CANONICAL_REFERENCE_CURRENCY' };
}
function calendarSlice(calendar = {}, bars = []) {
  const dates = bars.map(b => b.normalized?.tradingDate || b.raw?.date?.slice(0, 10)).filter(Boolean).sort();
  const first = dates[0];
  return { ...calendar, expectedSessions: calendar.expectedSessions?.filter(date => (!first || date >= first) && date <= calendar.expectedLastCompletedSession) };
}
function compactQuality(q) {
  return { ...q, rawBars: undefined, validBars: undefined, quarantine: q.quarantine.map(row => ({ rawIndex: row.rawIndex, date: row.date, reasons: row.reasons || row.codes, rawHash: digest(row.raw || row) })) };
}
function compactActions(actions) {
  return { version: actions.version, status: actions.status, issues: actions.issues, correlations: actions.correlations,
    absenceEstablished: actions.absenceEstablished, adjustmentStatus: actions.adjustmentStatus, providerAdjustedCertified: false,
    events: (actions.normalized?.events || []).map(event => ({ ...event, raw: undefined, rawHash: digest(event.raw || event) })),
    quality: actions.quality ? compactQuality(actions.quality) : null, evidence: actions.evidence };
}
function compactUniverse(universe) {
  const calendarProof = (calendar, count) => calendar ? { mic: calendar.mic, verified: calendar.verified, source: calendar.source,
    expectedLastCompletedSession: calendar.expectedLastCompletedSession, expectedSessions: calendar.expectedSessions?.slice(-count),
    timezone: calendar.timezone, provenance: calendar.provenance, coverage: calendar.coverage } : null;
  const candidate = c => ({ ...c, observations: (c.observations || []).map(o => ({
    normalized: Object.fromEntries(['providerTicker', 'providerSymbol', 'mic', 'isin', 'resolvedIsin', 'currency', 'resolvedCurrency', 'active', 'classification'].map(k => [k, o.normalized[k]])),
    rawSha256: o.provenance.rawSha256, rawRowSha256: digest(o.raw), provenance: o.provenance,
    rawPreservation: 'UNCHANGED_REFERENCED_PRIVATE_RAW_RESPONSE', identityResolution: o.input?.identityResolution || null })),
    identityEvidence: (c.identityEvidence || []).map(e => ({ verified: e.verified, source: e.source,
      issuerName: e.issuerName, isin: e.isin, lei: e.lei, mic: e.mic, providerMnemonic: e.providerMnemonic,
      listingCurrency: e.listingCurrency, officialReferenceMic: e.officialReferenceMic,
      officialReferenceCurrency: e.officialReferenceCurrency, issuerCountry: e.issuerCountry,
      issuerCountryBasis: e.issuerCountryBasis, legalJurisdiction: e.legalJurisdiction, entityStatus: e.entityStatus, entityCategory: e.entityCategory,
      officialInstrumentType: e.officialInstrumentType, typeSource: e.typeSource, active: e.active, regulatoryLiquid: e.regulatoryLiquid,
      primaryMic: e.primaryMic, primaryMarketMic: e.primaryMarketMic, productPrimaryPolicy: e.productPrimaryPolicy,
      liquidityEvidence: e.liquidityEvidence ? { ...e.liquidityEvidence, calendar: calendarProof(e.liquidityEvidence.calendar, 21) } : null,
      germanIndexMembershipEvidence: e.germanIndexMembershipEvidence,
      nativeMnemonicVerifiedUnique: e.nativeMnemonicVerifiedUnique, firstTradingDate: e.firstTradingDate,
      homeActivityEvidence: e.homeActivityEvidence ? { ...e.homeActivityEvidence, calendar: calendarProof(e.homeActivityEvidence.calendar, 2) } : null,
      provenance: e.provenance, officialManifest: e.officialManifest })) });
  const candidates = universe.candidates.map(candidate), listings = candidates.filter(c => c.status === 'ACCEPTED');
  return { ...universe, candidates, listings, germany: { ...universe.germany, candidates: candidates.filter(c => c.issuerCountry === 'DE') },
    aliasGroups: universe.aliasGroups.map(g => ({ ...g, sourceVersions: g.sourceVersions.map(v => ({ rawRowSha256: digest(v.raw), provenance: v.provenance })) })),
    rawLayer: 'FULL_PROVIDER_RAW_RETAINED_BY_HASH_AND_PRIVATE_PATH_NOT_DUPLICATED_IN_CANONICAL_UNIVERSE' };
}
function inputBars(operations, symbols, mic, kind) {
  return operations.filter(e => e.operation.kind === kind && (e.operation.mic || e.operation.listing?.mic) === mic)
    .map(e => ({ ...e, observations: e.observations.filter(o => symbols.includes(o.normalized.providerTicker) && o.normalized.providerExchange === mic) }))
    .filter(e => e.observations.length);
}
function priceOperationIndex(operations) {
  const index = new Map();
  for (const entry of operations) {
    const mic = entry.operation.mic || entry.operation.listing?.mic;
    for (const observation of entry.observations) {
      if (observation.normalized.providerExchange !== mic) continue;
      const lookupKey = `${entry.operation.kind}:${mic}:${observation.normalized.providerTicker}`;
      if (!index.has(lookupKey)) index.set(lookupKey, new Map());
      const group = index.get(lookupKey); if (!group.has(entry)) group.set(entry, []); group.get(entry).push(observation);
    }
  }
  return (symbols, mic, kind) => {
    const groups = new Map();
    for (const symbol of symbols) for (const [entry, observations] of index.get(`${kind}:${mic}:${symbol}`) || []) {
      if (!groups.has(entry)) groups.set(entry, []); groups.get(entry).push(...observations);
    }
    return [...groups].map(([entry, observations]) => ({ ...entry, observations }));
  };
}
const DEFAULT_INDEX_TARGETS = { DAX: 40, MDAX: 50, SDAX: 70, TecDAX: 30, 'EURO STOXX 50': 50, 'CAC 40': 40,
  AEX: null, SMI: 20, FTSE100: 100, IBEX35: 35, FTSEMIB: 40, ATX: 20 };
const normalizedIndex = name => ({ CAC40: 'CAC 40', EUROSTOXX50: 'EURO STOXX 50', FTSE100: 'FTSE100', FTSEMIB: 'FTSEMIB', IBEX35: 'IBEX35', TECDAX: 'TecDAX' }[String(name).toUpperCase().replace(/[ _-]/g, '')] || name);
const referenceVerifiedFor = (r, now) => r.referenceVerified === true && r.sourceContentVerified === true && r.rosterExtractionVerified === true &&
  dateValid(r.asOf) && r.asOf <= now.slice(0, 10) && r.source?.sha256;
export function buildEquityIndexCoverage(productRows, indexReferences, now) {
  return Object.entries(DEFAULT_INDEX_TARGETS).map(([index, nominal]) => {
    const ref = indexReferences.find(r => normalizedIndex(r.index) === index && referenceVerifiedFor(r, now));
    if (!ref) return { index, target: nominal, targetBasis: 'NOMINAL_INDEX_SIZE_NOT_CURRENT_ROSTER', mapped: null, fresh: null, chart: null,
      technical: null, quant: null, supertrader: null, missing: null, status: 'CURRENT_AUTHORITATIVE_ROSTER_UNRESOLVED' };
    const targets = unique((ref.rows || []).filter(r => validIsin(r.isin)).map(r => r.isin));
    const rows = productRows.filter(r => r.identityStatus === 'ACCEPTED' && targets.includes(r.isin));
    const count = test => unique(rows.filter(test).map(r => r.isin)).length, mapped = count(() => true);
    return { index, target: targets.length, targetBasis: ref.targetBasis, asOf: ref.asOf, source: ref.source, mapped,
      fresh: count(r => fresh(r.readiness.LATEST_EOD)), chart: count(r => r.readiness.CHART === 'CHART_READY'),
      technical: count(r => r.readiness.TECHNICAL === 'TECHNICAL_READY'), quant: count(r => r.readiness.QUANT === 'QUANT_FULL'),
      supertrader: count(r => r.readiness.SUPERTRADER === 'SUPERTRADER_READY'), missing: targets.length - mapped,
      missingIsins: targets.filter(isin => !rows.some(r => r.isin === isin)), status: 'EXACT_ISIN_OFFICIAL_ROSTER_JOIN' };
  });
}

export function compileEuropeEvidence({ evidence, officialIdentity, calendars = {}, now, protectedSecurityIds = [], indexReferences = [] } = {}) {
  if (!now || !Number.isFinite(Date.parse(now))) throw Error('EXPLICIT_EVALUATION_TIME_REQUIRED');
  if (!Array.isArray(evidence) || evidence.some(e => e.verified !== true)) throw Error('HASH_VERIFIED_EVIDENCE_REQUIRED');
  const operations = evidence.flatMap(e => e.operations), official = officialIdentity?.rows || [];
  const selectBars = priceOperationIndex(operations);
  const referenceReady = r => r.referenceVerified === true && r.sourceContentVerified === true && r.rosterExtractionVerified === true &&
    dateValid(r.asOf) && r.asOf <= now.slice(0, 10) && r.source?.sha256;
  const metadata = [], failures = [];
  for (const entry of operations.filter(e => e.operation.kind === 'metadata' && e.operation.assetKind !== 'ETF')) {
    const candidates = entry.observations.map(observation => ({ observation,
      bridge: scopedMetadata(entry.operation, observation) ? null : officialMetadataBridge(entry.operation, observation, official, selectBars, calendars, now) }));
    const matches = candidates.filter(candidate => !malformedCurrency(candidate.observation) &&
      (scopedMetadata(entry.operation, candidate.observation) || candidate.bridge));
    if (entry.result.ok !== true || matches.length !== 1 || !mics.has(entry.operation.mic)) {
      failures.push({ mic: entry.operation.mic, providerSymbol: entry.operation.symbol, expectedIsin: entry.operation.expectedIsin || null,
        status: 'REVIEW', reasons: ['FRESH_EXACT_METADATA_UNRESOLVED'], provenance: entry.provenance }); continue;
    }
    const { observation, bridge } = matches[0], n = observation.normalized, resolvedIsin = bridge?.resolvedIsin || n.isin;
    const identities = official.filter(e => e.isin === resolvedIsin);
    metadata.push({ observation, bridge, mic: entry.operation.mic, symbol: n.providerTicker, isin: resolvedIsin, identities });
  }
  // A provider alias is collapsed only after exact class AND independently sourced issuer proof.
  const groups = new Map();
  for (const item of metadata) {
    const issuerKeys = unique(item.identities.map(e => e.lei));
    const groupKey = issuerKeys.length === 1 ? `${item.isin}:${item.mic}:${issuerKeys[0]}` : `${item.mic}:${item.symbol}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []); groups.get(groupKey).push(item);
  }
  const observations = [], identityEvidence = [], priceByListing = new Map(), aliasGroups = [];
  for (const group of groups.values()) {
    const symbols = unique(group.map(g => g.symbol)), mic = group[0].mic;
    const histories = selectBars(symbols, mic, 'history').sort((a, b) => b.observations.length - a.observations.length);
    const latestEntries = ['latest', 'latestBatch'].flatMap(kind => selectBars(symbols, mic, kind));
    const latestCandidates = latestEntries.flatMap(e => e.observations).sort((a, b) => String(b.normalized.tradingDate).localeCompare(String(a.normalized.tradingDate)) ||
      String(b.provenance.retrievedAt).localeCompare(String(a.provenance.retrievedAt)));
    const latest = latestCandidates[0], contemporaneous = latestCandidates.filter(o => o.normalized.tradingDate === latest?.normalized.tradingDate);
    const priceConflict = new Set(contemporaneous.map(o => digest(Object.fromEntries(['open', 'high', 'low', 'close', 'volume', 'currency'].map(k => [k, o.normalized[k]]))))).size > 1;
    const preferredSymbol = histories[0]?.observations[0]?.normalized.providerTicker || latest?.normalized.providerTicker || symbols.slice().sort()[0];
    const representative = group.find(g => g.symbol === preferredSymbol), raw = representative.observation.raw;
    const currencies = mic === 'XETR' ? unique(representative.identities.filter(e => e.mic === 'XETR').map(e => e.listingCurrency)) : [];
    const currency = currencies.length === 1 ? currencies[0] : representative.observation.normalized.currency || latest?.normalized.currency || null;
    const listing = { mic, providerTicker: preferredSymbol, providerSymbol: preferredSymbol, currency,
      verifiedAliases: symbols, isin: representative.isin };
    listing.priceCurrencyBasis = currencies.length === 1 ? 'CANONICAL_REFERENCE_CURRENCY' : 'PROVIDER_REPORTED';
    listing.priceCurrencyEvidence = currencies.length === 1 ? representative.identities.filter(e => e.mic === mic && e.listingCurrency === currency)
      .map(e => ({ currency, mic, isin: e.isin, nativeMnemonic: e.providerMnemonic, rawField: 'Currency', rawCurrencyValue: currency,
        source: e.provenance.xetra })) : null;
    const bridged = group.some(g => g.bridge), firstTradingDates = unique(representative.identities.map(e => e.firstTradingDate).filter(dateValid));
    if (bridged && mic === 'XETR' && firstTradingDates.length === 1) listing.identityValidFrom = firstTradingDates[0];
    const calendar = calendars[mic] || {};
    const latestQuality = validateEodBars(latest && !priceConflict ? [latest] : [], { listing, now, calendar });
    const latestBar = latestQuality.validBars.at(-1);
    const freshness = evaluateFreshness({ latestDate: latestBar?.date, now, calendar, listing });
    if (priceConflict) { freshness.status = 'INVALID'; freshness.reason = 'LATEST_ALIAS_PRICE_CONFLICT';
      latestQuality.quarantine.push(...contemporaneous.map(raw => ({ date: raw.normalized.tradingDate, raw, reasons: ['LATEST_ALIAS_PRICE_CONFLICT'] })));
      latestQuality.counts = { raw: contemporaneous.length, valid: 0, quarantined: contemporaneous.length }; }
    const rawHistoryQuality = histories[0] ? validateEodBars(histories[0].observations, { listing, now,
      calendar: calendarSlice(calendar, histories[0].observations), requestRange: { from: histories[0].operation.from, to: histories[0].operation.to } }) : null;
    const liquidityBars = rawHistoryQuality?.validBars.slice(-20) || [];
    const turnovers = liquidityBars.map(bar => bar.close * bar.volume).sort((a, b) => a - b);
    const median = turnovers.length === 20 ? (turnovers[9] + turnovers[10]) / 2 : null;
    const measuredLiquidity = liquidityBars.length === 20 && currency === 'EUR' &&
      liquidityBars.every(bar => bar.currency === 'EUR' && typeof bar.volume === 'number' && bar.volume > 0) && median >= 100000 ? {
        verified: true, basis: 'VALIDATED_RAW_UNADJUSTED_EOD', mic, providerSymbol: preferredSymbol, isin: representative.isin, currency: 'EUR',
        minimumObservations: 20, minimumMedianDailyTurnoverEUR: 100000, medianDailyTurnoverEUR: median,
        observations: liquidityBars.map(bar => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
          volume: bar.volume, currency: bar.currency, rawSha256: bar.raw.provenance.rawSha256 })),
        calendar: { ...calendar, expectedSessions: calendar.expectedSessions?.slice(-21) }, source: histories[0].provenance,
        policyMeaning: 'EUROPE_CONSUMER_ADMISSION_ONLY_NOT_QUANT_OR_STRATEGY_METHOD' } : null;
    const identities = representative.identities.map(identity => {
      // Xetra metadata/activeness/currency never transfers to another venue.
      const e = structuredClone(identity); e.officialReferenceMic = identity.mic;
      if (identity.mic !== mic) { e.officialReferenceCurrency = identity.listingCurrency ?? null; e.listingCurrency = null; }
      if (mic === 'XETR' && e.productPrimaryPolicy === 'GERMANY_LIQUID_LOCAL_XETRA') return e;
      const germanIndex = indexReferences.find(r => referenceReady(r) && ['DAX', 'MDAX', 'SDAX', 'TecDAX'].includes(r.index) &&
        r.rows.some(row => row.isin === e.isin));
      if (mic === 'XETR' && ['XFRA', 'XETR'].includes(e.primaryMarketMic) && e.mic === 'XETR' && e.active === true) {
        if (e.issuerCountry === 'DE' && measuredLiquidity) {
          e.primaryMic = 'XETR'; e.productPrimaryPolicy = 'GERMANY_MEASURED_LIQUID_LOCAL_XETRA'; e.liquidityEvidence = measuredLiquidity; return e;
        }
        if (e.issuerCountry !== 'DE' && germanIndex) {
          e.primaryMic = 'XETR'; e.productPrimaryPolicy = 'GERMANY_OFFICIAL_INDEX_EUROPEAN_LOCAL_XETRA';
          e.germanIndexMembershipEvidence = { verified: true, rosterExtractionVerified: true, index: germanIndex.index, isin: e.isin,
            asOf: germanIndex.asOf, evaluatedAt: now, source: germanIndex.source, documentSha256: germanIndex.documentSha256 }; return e;
        }
      }
      e.productPrimaryPolicy = null; e.active = null;
      const sessions = calendar.expectedSessions || [], previous = sessions[sessions.indexOf(calendar.expectedLastCompletedSession) - 1];
      const recent = fresh(freshness.status) || freshness.status === 'DELAYED' && latestBar?.date === previous;
      if (e.primaryMarketMic === mic && e.officialInstrumentType === 'CS' && e.typeSource === 'XETRA_REFERENCE' &&
        calendar.verified === true && calendar.mic === mic && latestBar && latestQuality.quarantine.length === 0 && recent &&
        typeof latestBar.volume === 'number' && latestBar.volume > 0 && (latest.normalized.currency || currencies.length === 1 && mic === 'XETR') &&
        (!latest.normalized.currency || currency === latest.normalized.currency) &&
        raw.active !== false && raw.is_active !== false) {
        e.mic = mic; e.primaryMic = mic; e.providerSymbol = preferredSymbol; e.active = true;
        e.productPrimaryPolicy = 'EUROPE_OFFICIAL_PRIMARY_MIC_EXACT_ISIN_RECENT_EOD';
        e.homeActivityEvidence = { verified: true, validPrice: true, qualityVersion: latestQuality.version,
          qualityStatus: latestQuality.status, activityBasis: 'RECENT_SCOPED_HOME_EOD', mic, providerSymbol: preferredSymbol,
          isin: e.isin, observedDate: latestBar.date, volume: latestBar.volume, currency, priceCurrencyBasis: listing.priceCurrencyBasis,
          priceCurrencyEvidence: listing.priceCurrencyEvidence, freshness: freshness.status,
          rawSha256: latest.provenance.rawSha256, metadataRawSha256: representative.observation.provenance.rawSha256,
          calendar: { ...calendar, expectedSessions: sessions.slice(-3) }, provenance: latest.provenance };
      }
      return e;
    });
    identityEvidence.push(...identities);
    const sourceVersions = group.map(g => ({ raw: g.observation.raw, provenance: g.observation.provenance }));
    const row = { ...raw, symbol: preferredSymbol, stock_exchange: { mic }, exchangeMic: mic, isin: representative.isin,
      currency, assetType: raw.asset_type || raw.item_type, active: raw.active ?? raw.is_active };
    // An explicit conflicting alias type/activeness/currency must not disappear during consolidation.
    for (const item of group) observations.push({ row: { ...row, security_type: item.observation.raw.security_type,
      securityType: item.observation.raw.securityType, instrument_type: item.observation.raw.instrument_type,
      type: item.observation.raw.type,
      name: item.observation.raw.name, issuer_country: item.observation.raw.issuer_country, issuer: item.observation.raw.issuer,
      asset_type: item.observation.raw.asset_type || item.observation.raw.item_type,
      assetType: item.observation.raw.asset_type || item.observation.raw.item_type,
      is_active: item.observation.raw.is_active, status: item.observation.raw.status,
      active: item.observation.raw.active ?? item.observation.raw.is_active,
      currency: item.observation.normalized.currency || latest?.normalized.currency || currency }, raw: item.observation.raw,
      providerNormalized: item.observation.normalized, identityResolution: item.bridge || null,
      provenance: item.observation.provenance, verifiedAliasSymbols: symbols, sourceVersions });
    const bars = histories[0]?.observations || (latest ? [latest] : []), sliced = calendarSlice(calendar, bars);
    const nativeAliases = identities.filter(e => mic === 'XETR' && e.officialReferenceMic === 'XETR' &&
      e.mic === mic && e.providerMnemonic && e.active === true).map(e => e.providerMnemonic);
    listing.verifiedAliases = unique([...symbols, ...nativeAliases]);
    const snapshots = selectBars(listing.verifiedAliases, mic, 'snapshot');
    const snapshot = snapshots.flatMap(e => e.observations)[0] || null;
    const actions = ['splits', 'dividends'].flatMap(kind => selectBars(symbols, mic, kind)).flatMap(e => e.observations);
    const requestRange = histories[0] ? { from: histories[0].operation.from, to: histories[0].operation.to } : null;
    const evaluation = evaluateEuropePriceSeries({ bars, listing, calendar: sliced, now, requestRange, corporateActions: actions, snapshot });
    evaluation.rawAdjustedDiagnostic = { scope: 'FULL_AUTHENTICATED_OPERATION_ROWS_BEFORE_RAW_PRICE_QUARANTINE',
      admittedBasis: 'VALID_RAW_OHLC_PRICE_SCOPE_ONLY', noAdjustedFieldRepair: true,
      rawPriceQuarantineCount: evaluation.quality.quarantine.length,
      classification: classifyAdjustment(bars.map(bar => ({ date: bar.normalized.tradingDate, providerRaw: bar.raw }))),
      invalidOnValidRaw: classifyAdjustment(evaluation.quality.validBars).invalid,
      invalidOnQuarantinedRaw: classifyAdjustment(evaluation.quality.quarantine).invalid };
    evaluation.corporateActions = compactActions(evaluation.corporateActions);
    // A historical series does not replace latest-session evidence for freshness.
    evaluation.freshness = freshness;
    if (!fresh(freshness.status) && evaluation.readiness.chart === 'CHART_READY') evaluation.readiness.chart = 'CHART_LIMITED';
    if (histories[0] && histories[0].result.complete !== true && evaluation.readiness.chart === 'CHART_READY') evaluation.readiness.chart = 'CHART_LIMITED';
    if (bridged && evaluation.readiness.chart === 'CHART_READY') evaluation.readiness.chart = 'CHART_LIMITED';
    const historyLast = evaluation.quality.validBars.at(-1);
    const historyLatestConflict = Boolean(historyLast && latestBar && historyLast.date === latestBar.date &&
      ['open', 'high', 'low', 'close', 'volume', 'currency'].some(field => historyLast[field] !== latestBar[field]));
    if (historyLatestConflict) { evaluation.quality.warnings.push({ code: 'LATEST_HISTORY_BAR_CONFLICT', date: latestBar.date });
      evaluation.readiness.chart = 'CHART_LIMITED'; evaluation.readiness.technical = 'TECHNICAL_BLOCKED'; }
    priceByListing.set(`marketstack:${mic}:${preferredSymbol.toUpperCase()}`, { evaluation, latestQuality, latest: latestBar ? {
      date: latestBar.date, open: latestBar.open, high: latestBar.high, low: latestBar.low, close: latestBar.close, volume: latestBar.volume,
      currency, mic, providerSymbol: latest.normalized.providerTicker, provenance: latest.provenance } : null,
      provenance: { history: histories[0]?.provenance || null, latest: latest?.provenance || null,
        actions: actions.map(a => a.provenance), snapshot: snapshot?.provenance || null, calendar: calendar.provenance || { source: calendar.source } },
      historyPaginationComplete: histories[0]?.result.complete === true, aliases: symbols, latestObservations: contemporaneous,
      priceCurrencyBasis: listing.priceCurrencyBasis, priceCurrencyEvidence: listing.priceCurrencyEvidence,
      historicalIdentity: bridged ? { status: 'CURRENT_LISTING_BRIDGE_HISTORICAL_CONTINUITY_UNCERTIFIED', admittedFrom: listing.identityValidFrom || null } : null,
      conflicts: [...(priceConflict ? ['LATEST_ALIAS_PRICE_CONFLICT'] : []), ...(historyLatestConflict ? ['LATEST_HISTORY_BAR_CONFLICT'] : [])] });
    aliasGroups.push({ isin: representative.isin, mic, chosenSymbol: preferredSymbol, symbols,
      basis: group[0].identities.length ? 'EXACT_FRESH_ISIN_MIC_PLUS_OFFICIAL_ISSUER' : 'NO_ALIAS_JOIN', sourceVersions });
  }
  const indexMembership = indexReferences.filter(referenceReady)
    .flatMap(r => (r.rows || []).filter(row => validIsin(row.isin)).map(row => ({ isin: row.isin, index: normalizedIndex(r.index), asOf: r.asOf, source: r.source })));
  const candidatePriceStatus = Object.fromEntries([...priceByListing].map(([id, value]) => [id, value.evaluation.freshness.status]));
  const candidatePriceCurrencyConflict = Object.fromEntries([...priceByListing].map(([id, value]) => [id,
    value.latestQuality.quarantine.some(row => row.reasons.some(reason => ['CURRENCY_INCONSISTENT', 'INVALID_CURRENCY_DECLARATION'].includes(reason)))]));
  const universe = buildEuropeEquityUniverse(observations, { identityEvidence, protectedSecurityIds, generatedAt: now,
    indexMembership, candidatePriceStatus, candidatePriceCurrencyConflict });
  universe.metadataFailures = failures; universe.aliasGroups = aliasGroups;
  for (const security of universe.securities) {
    const aliases = aliasGroups.filter(g => g.isin === security.isin);
    security.aliases = unique([...security.aliases, ...aliases.flatMap(g => g.symbols.flatMap(symbol => [symbol, `${symbol}.${g.mic}`]))]);
  }
  for (const listing of universe.candidates) {
    const aliases = aliasGroups.find(g => g.isin === listing.isin && g.mic === listing.mic && g.chosenSymbol.toUpperCase() === listing.providerSymbol.toUpperCase());
    listing.verifiedAliases = aliases?.symbols || [listing.providerSymbol];
    const versions = listing.observations || [];
    listing.providerIsins = [...new Set(versions.map(v => v.input?.providerNormalized?.isin ?? null))];
    listing.identityResolution = versions.map(v => v.input?.identityResolution).find(Boolean) || null;
    listing.isinBasis = listing.identityResolution ? 'OFFICIAL_NATIVE_MNEMONIC_MIC_BRIDGE' : 'FRESH_EXACT_PROVIDER_ISIN';
    const price = priceByListing.get(listing.listingKey);
    listing.priceCurrencyBasis = price?.priceCurrencyBasis || null; listing.priceCurrencyEvidence = price?.priceCurrencyEvidence || null;
  }
  const existingKeys = new Set(universe.candidates.map(c => c.listingKey));
  for (const f of failures) {
    const listingKey = `marketstack:${f.mic}:${String(f.providerSymbol).toUpperCase()}`;
    if (existingKeys.has(listingKey)) continue;
    const known = official.filter(o => o.isin === f.expectedIsin), leis = unique(known.map(o => o.lei)), countries = unique(known.map(o => o.issuerCountry));
    universe.candidates.push({ ...f, listingKey, isin: validIsin(f.expectedIsin) ? f.expectedIsin : null,
      securityKey: validIsin(f.expectedIsin) ? `ISIN:${f.expectedIsin}` : null, securityId: null,
      companyKey: leis.length === 1 ? `LEI:${leis[0]}` : null, issuerCountry: countries.length === 1 ? countries[0] : null,
      observations: [], identityEvidence: known, indexMembership: [], identityBasis: 'OFFICIAL_REFERENCE_ONLY_PROVIDER_METADATA_UNRESOLVED' });
    existingKeys.add(listingKey);
  }
  universe.summary.candidates = universe.candidates.length;
  universe.summary.review = universe.candidates.filter(c => c.status === 'REVIEW').length;
  universe.germany.candidates = universe.candidates.filter(c => c.issuerCountry === 'DE');
  universe.germany.summary.candidates = universe.germany.candidates.length;
  universe.germany.summary.review = universe.germany.candidates.filter(c => c.status === 'REVIEW').length;
  universe.candidateDefinition = 'Fresh exact metadata candidates; directory coverage is reported separately and is not an investable universe count';
  universe.summary.metadataAttempts = operations.filter(e => e.operation.kind === 'metadata' && e.operation.assetKind !== 'ETF').length;
  universe.summary.unresolvedMetadataAttempts = failures.length;
  for (const c of universe.listings) {
    const p = priceByListing.get(c.listingKey), e = p?.evaluation;
    if (!e || p.conflicts.length) continue;
    const bars = [...e.quality.validBars];
    const latest = p.latestQuality.validBars[0];
    if (latest && (!bars.length || bars.at(-1).date < latest.date)) bars.push(latest);
    p.researchTechnical = projectEuropeRawResearch({ quality: { ...e.quality, validBars: bars },
      listing: { mic: c.mic, currency: c.currency, providerTicker: c.providerSymbol,
        verifiedAliases: c.verifiedAliases, securityId: c.securityId, listingId: c.listingKey },
      calendar: calendars[c.mic] || {} });
  }
  const qualityRows = [], freshnessRows = [], adjustmentRows = [], productRows = [], quantRows = [], strategyRows = [], logoRows = [];
  for (const c of universe.candidates) {
    const p = priceByListing.get(c.listingKey), e = p?.evaluation;
    const common = { listingKey: c.listingKey, securityKey: c.securityKey, securityId: c.securityId, companyKey: c.companyKey,
      isin: c.isin, mic: c.mic, providerSymbol: c.providerSymbol, issuerCountry: c.issuerCountry, identityStatus: c.status };
    const accepted = c.status === 'ACCEPTED', chart = accepted ? e.readiness.chart : 'CHART_BLOCKED';
    const technical = accepted && p?.researchTechnical?.engineProjection === true ? 'TECHNICAL_PARTIAL' : 'TECHNICAL_BLOCKED';
    const quant = technical === 'TECHNICAL_READY' ? 'QUANT_TECHNICAL_ONLY' : 'QUANT_BLOCKED';
    const supertrader = accepted && e.readiness.supertrader === 'SUPERTRADER_INPUT_READY' ? 'SUPERTRADER_READY' : 'SUPERTRADER_BLOCKED';
    qualityRows.push({ ...common, quality: e ? compactQuality(e.quality) : null, latestQuality: p ? compactQuality(p.latestQuality) : null,
      latest: p?.latest || null, history: e?.history || null, historyPaginationComplete: p?.historyPaginationComplete || false,
      conflicts: p?.conflicts || [], historicalIdentity: p?.historicalIdentity || null,
      priceCurrencyBasis: p?.priceCurrencyBasis || null, priceCurrencyEvidence: p?.priceCurrencyEvidence || null,
      latestObservations: p?.latestObservations || [], provenance: p?.provenance || null });
    freshnessRows.push({ ...common, ...e?.freshness, status: e?.freshness.status || 'MISSING', snapshot: e?.snapshot || { status: 'EOD_ONLY' } });
    adjustmentRows.push({ ...common, ...(e?.adjustment || { status: 'ADJUSTMENT_UNKNOWN' }),
      rawAdjustedDiagnostic: e?.rawAdjustedDiagnostic || null, corporateActions: e?.corporateActions || null });
    const readiness = { IDENTITY: c.status, LATEST_EOD: e?.freshness.status || 'MISSING', SNAPSHOT: e?.snapshot.status || 'EOD_ONLY',
      HISTORY: e?.history || { observations: 0 }, CHART: chart, LOGO: 'LOGO_MISSING', SEARCH: accepted ? 'SEARCH_INPUT_READY' : 'SEARCH_BLOCKED',
      WATCHLIST: accepted ? 'WATCHLIST_INPUT_READY' : 'WATCHLIST_BLOCKED', DISCOVER: accepted ? 'DISCOVER_INPUT_READY' : 'DISCOVER_BLOCKED',
      SCREENER: accepted && p.latest ? fresh(e.freshness.status) ? 'SCREENER_INPUT_READY' : 'SCREENER_LIMITED' : 'SCREENER_BLOCKED',
      TECHNICAL: technical, FUNDAMENTALS: 'FUNDAMENTALS_UNKNOWN', QUANT: quant, SUPERTRADER: supertrader,
      BACKTEST: accepted ? e.readiness.backtest === 'BACKTEST_INPUT_READY' ? 'BACKTEST_READY' : e.readiness.backtest : 'BLOCKED' };
    productRows.push({ ...common, readiness, publicationTier: accepted ? chart !== 'CHART_BLOCKED' ? 2 : 1 : 0,
      technicalProjection: p?.researchTechnical ? { status: p.researchTechnical.status, asOf: p.researchTechnical.asOf,
        engineProjection: p.researchTechnical.engineProjection, metrics: p.researchTechnical.metrics,
        methodology: p.researchTechnical.methodology || null, scope: p.researchTechnical.scope } : null,
      tierMeaning: 'PRIVATE_INPUT_READINESS_ONLY', consumerReplay: 'NOT_EVALUATED', publicationAllowed: false, rightsStatus: 'DISPLAY_REDISTRIBUTION_UNVERIFIED' });
    quantRows.push({ ...common, status: quant, fundamentals: 'UNKNOWN', reason: 'NO_BOUND_FILING_PROJECTION_OR_CERTIFIED_ADJUSTED_TECHNICAL_INPUTS', existingUSPopulationUnchanged: true });
    strategyRows.push({ ...common, supertrader, backtest: readiness.BACKTEST, indicators: e?.readiness.indicators || null,
      adjustmentBasis: e?.adjustment.status || 'ADJUSTMENT_UNKNOWN', benchmark: 'RS_BLOCKED', methodologyChanged: false });
    logoRows.push({ ...common, status: 'LOGO_MISSING', pipeline: 'EXISTING_CENTRAL_LOGO_PIPELINE', reason: 'NO_VALIDATED_LOGO_EVIDENCE_SUPPLIED', blocksIdentity: false });
  }
  const stats = country => {
    const rows = productRows.filter(r => typeof country === 'function' ? country(r) : !country || r.issuerCountry === country), accepted = rows.filter(r => r.identityStatus === 'ACCEPTED');
    return { companies: unique(accepted.map(r => r.companyKey)).length, securities: unique(accepted.map(r => r.securityKey)).length,
      listings: accepted.length, freshEod: accepted.filter(r => fresh(r.readiness.LATEST_EOD)).length,
      chartReady: accepted.filter(r => r.readiness.CHART === 'CHART_READY').length, technicalReady: accepted.filter(r => r.readiness.TECHNICAL === 'TECHNICAL_READY').length,
      technicalPartial: accepted.filter(r => r.readiness.TECHNICAL === 'TECHNICAL_PARTIAL').length,
      quantFull: 0, quantPartial: 0, quantTechnicalOnly: accepted.filter(r => r.readiness.QUANT === 'QUANT_TECHNICAL_ONLY').length,
      supertraderReady: accepted.filter(r => r.readiness.SUPERTRADER === 'SUPERTRADER_READY').length,
      snapshotsCurrent: accepted.filter(r => ['SNAPSHOT_CURRENT', 'REALTIME_OBSERVED'].includes(r.readiness.SNAPSHOT)).length };
  };
  const indexCoverage = buildEquityIndexCoverage(productRows, indexReferences, now);
  const header = { schema: COMPILER_VERSION, generatedAt: now, mode: 'PRIVATE_RESEARCH', publicationAllowed: false };
  const listingEvidence = {}, series = [];
  for (const c of universe.listings) {
    const p = priceByListing.get(c.listingKey), e = p?.evaluation;
    const evidenceRef = `PRIVATE_RAW_REPLAY:${p?.provenance.history?.normalizedSha256 || p?.provenance.latest?.normalizedSha256 || 'NONE'}:${c.listingKey}`;
    const point = bar => Object.fromEntries(['date', 'open', 'high', 'low', 'close', 'volume'].map(k => [k, bar[k] ?? null]));
    let points = (e?.quality.validBars || []).map(point);
    const last = points.at(-1);
    const coherent = Boolean(p.latest && !p.conflicts.length && (!last || last.date <= p.latest.date));
    if (coherent && (!last || last.date < p.latest.date)) points.push(point(p.latest));
    if (!coherent) points = [];
    listingEvidence[c.listingKey] = { latest: { status: e?.freshness.status || 'MISSING', date: p?.latest?.date || null,
      volume: p?.latest?.volume ?? null, currency: c.currency, close: p?.latest?.close ?? null, evidenceRef },
      history: { valid: points.length > 0, observations: points.length, partial: !p.historyPaginationComplete,
        chartStatus: e?.readiness.chart || 'CHART_BLOCKED', evidenceRef },
      priceQuality: { status: points.length ? 'VALIDATED' : 'INVALID', evidenceRef,
        volumeValid: Boolean(e?.quality.volumeVerified && p.latestQuality.volumeVerified),
        quarantinedCount: e?.quality.quarantine.length || 0, warnings: e?.quality.warnings || [], conflicts: p.conflicts },
      adjustment: { status: e?.adjustment.status || 'ADJUSTMENT_UNKNOWN', evidenceRef,
        rawDiagnosticEvidenceRef: `marketstack_europe_adjustment_status.json#${c.listingKey}` },
      chart: { status: e?.readiness.chart || 'CHART_BLOCKED', evidenceRef },
      technical: p.researchTechnical?.engineProjection === true ? { ...p.researchTechnical, status: 'TECHNICAL_PARTIAL',
        researchStatus: p.researchTechnical.status, evidenceRef,
        methodology: `EXISTING_ENGINE:${p.researchTechnical.methodology.featureVersion}:${p.researchTechnical.methodology.parametersHash}`,
        methodologyEvidence: p.researchTechnical.methodology,
        provenance: { ...p.researchTechnical.provenance, priceCurrencyBasis: p.priceCurrencyBasis, priceCurrencyEvidence: p.priceCurrencyEvidence } } : null,
      provenance: { ...p.provenance, priceCurrencyBasis: p.priceCurrencyBasis, priceCurrencyEvidence: p.priceCurrencyEvidence } };
    if (points.length) series.push({ securityId: c.securityId, listingId: c.listingKey, basis: 'RAW_UNADJUSTED', currency: c.currency,
      points: points.map(bar => [bar.date, bar.close]), provenance: { evidenceRef, ...p.provenance, priceCurrencyBasis: p.priceCurrencyBasis,
        priceCurrencyEvidence: p.priceCurrencyEvidence }, sessionContinuity: 'UNKNOWN' });
  }
  const groupObservations = ['DAX', 'MDAX', 'SDAX', 'TecDAX'].map(index => {
    const reference = official.filter(e => e.xetraIndexProductGroup === index), isins = unique(reference.map(e => e.isin));
    const admitted = productRows.filter(r => r.identityStatus === 'ACCEPTED' && isins.includes(r.isin));
    return { index, observedClasses: isins.length, mappedClasses: unique(admitted.map(r => r.isin)).length,
      freshClasses: unique(admitted.filter(r => fresh(r.readiness.LATEST_EOD)).map(r => r.isin)).length,
      basis: 'OFFICIAL_XETRA_PRODUCT_GROUP_OBSERVATION_NOT_AUTHORITATIVE_CURRENT_INDEX_ROSTER' };
  });
  const compact = compactUniverse(universe);
  const outputs = {
    marketstack_europe_equity_universe: { ...compact, ...header, foundationMode: compact.mode },
    marketstack_germany_universe: { ...header, ...compact.germany, companies: universe.companies.filter(c => c.issuerCountry === 'DE'),
      securities: universe.securities.filter(s => universe.companies.some(c => c.companyKey === s.companyKey && c.issuerCountry === 'DE')), listings: compact.listings.filter(l => l.issuerCountry === 'DE') },
    marketstack_europe_price_quality: { ...header, rows: qualityRows }, marketstack_europe_freshness: { ...header, rows: freshnessRows },
    marketstack_europe_adjustment_status: { ...header, rows: adjustmentRows }, marketstack_europe_product_readiness: { ...header, rows: productRows },
    marketstack_europe_quant_readiness: { ...header, rows: quantRows }, marketstack_europe_supertrader_readiness: { ...header, rows: strategyRows },
    marketstack_europe_logo_status: { ...header, rows: logoRows }, marketstack_europe_index_coverage: { ...header, rows: indexCoverage },
    marketstack_europe_core_projection: { ...header, listingEvidence, series },
    marketstack_europe_evidence_summary: { ...header, germany: stats('DE'), germanyLocal: stats(r => r.mic === 'XETR' &&
      universe.listings.some(c => c.listingKey === r.listingKey && c.productPrimaryPolicy?.startsWith('GERMANY_'))),
      europe: stats(), candidates: universe.summary,
      directoryCoverage: evidence.flatMap(e => e.directories), sources: evidence.map(e => e.provenance),
      indexProductGroupObservations: groupObservations,
      officialIdentity: officialIdentity?.manifests || [], quarantine: [...evidence.flatMap(e => e.quarantined), ...(officialIdentity?.quarantined || [])],
      constraints: ['RAW_FIELDS_RETAINED_IN_PRIVATE_SOURCES', 'NO_ADJUSTMENT_CERTIFICATION_FROM_PROVIDER_FIELDS', 'NO_US_METHOD_OR_POPULATION_MUTATION', 'NO_PUBLIC_RIGHTS_RELEASE'] }
  };
  return { outputs, universe, productRows, indexCoverage };
}

export function writePrivateEquityEvidence(result, out) {
  const root = privateRoot(out); mkdirSync(root, { recursive: true, mode: 0o700 });
  const files = [];
  for (const [name, value] of Object.entries(result.outputs)) {
    const path = safeFile(root, `${name}.json`), bytes = JSON.stringify(value) + '\n';
    writeFileSync(path, bytes, { mode: 0o600 }); files.push({ name: `${name}.json`, sha256: sha(bytes), bytes: Buffer.byteLength(bytes) });
  }
  const manifest = { schema: COMPILER_VERSION, generatedAt: result.outputs.marketstack_europe_evidence_summary.generatedAt,
    publicationAllowed: false, files }; writeFileSync(safeFile(root, 'evidence-output-manifest.json'), JSON.stringify(manifest) + '\n', { mode: 0o600 });
  return manifest;
}

function applyCentralLogos(outputs) {
  const logos = buildEuropeCompanyLogoEvidence(outputs.marketstack_europe_equity_universe, readCentralLogoRegistry());
  outputs.marketstack_europe_central_logo_evidence = logos;
  outputs.marketstack_europe_core_projection.companyEvidence = logos.companyEvidence;
  for (const row of outputs.marketstack_europe_logo_status.rows) {
    const logo = logos.companyEvidence[row.companyKey]?.logo;
    if (logo && row.identityStatus === 'ACCEPTED') { row.status = logo.status; row.evidence = logo; delete row.reason; }
  }
  for (const row of outputs.marketstack_europe_product_readiness.rows) {
    const logo = logos.companyEvidence[row.companyKey]?.logo;
    if (logo && row.identityStatus === 'ACCEPTED') row.readiness.LOGO = logo.status;
  }
  outputs.marketstack_europe_evidence_summary.logos = logos.summary;
}

/** Refresh publisher-reference joins and central logos over authenticated outputs.
 * Existing admission, prices, technical methods and historical proofs are retained.
 */
function readPrivateEquityOutputs(out) {
  const root = privateRoot(out), manifestPath = safeFile(root, 'evidence-output-manifest.json');
  const manifestBytes = readFileSync(manifestPath), manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== COMPILER_VERSION || manifest.publicationAllowed !== false || !Array.isArray(manifest.files)) throw Error('PRIVATE_EQUITY_MANIFEST_REQUIRED');
  const outputs = {};
  for (const file of manifest.files) {
    if (!/^marketstack_(?:europe_[a-z_]+|germany_universe)\.json$/.test(file.name)) throw Error('UNEXPECTED_EQUITY_OUTPUT_NAME');
    const bytes = readFileSync(safeFile(root, file.name));
    if (sha(bytes) !== file.sha256 || bytes.length !== file.bytes) throw Error('PRIVATE_OUTPUT_HASH_MISMATCH');
    const doc = JSON.parse(bytes);
    if (doc.mode !== 'PRIVATE_RESEARCH' || doc.publicationAllowed !== false || doc.generatedAt !== manifest.generatedAt) throw Error('PRIVATE_OUTPUT_GENERATION_MISMATCH');
    outputs[file.name.slice(0, -5)] = doc;
  }
  return { root, outputs, manifestSha256: sha(manifestBytes) };
}
export function refreshPrivateEquityMetadata(out, { indexReferences = [], centralLogos = true, now = new Date().toISOString() } = {}) {
  const { root, outputs, manifestSha256 } = readPrivateEquityOutputs(out);
  const universe = outputs.marketstack_europe_equity_universe, rows = outputs.marketstack_europe_product_readiness.rows;
  const references = indexReferences.filter(r => referenceVerifiedFor(r, now));
  outputs.marketstack_europe_index_coverage.rows = buildEquityIndexCoverage(rows, references, now);
  const names = references.map(r => normalizedIndex(r.index));
  for (const doc of [universe, outputs.marketstack_germany_universe]) for (const c of [...(doc.candidates || []), ...(doc.listings || [])]) {
    c.indexMembership = [...(c.indexMembership || []).filter(r => !names.includes(normalizedIndex(r.index))),
      ...references.filter(r => r.rows.some(member => member.isin === c.isin)).map(r => ({ index: normalizedIndex(r.index), asOf: r.asOf, source: r.source }))];
  }
  if (centralLogos) applyCentralLogos(outputs);
  outputs.marketstack_europe_evidence_summary.metadataRefresh = { refreshedAt: now,
    previousManifestSha256: manifestSha256, admissionAndPriceEvidenceUnchanged: true,
    officialIndexReferences: references.map(r => ({ index: r.index, documentSha256: r.documentSha256, source: r.source })),
    centralLogosRecomputed: centralLogos };
  return writePrivateEquityEvidence({ outputs }, root);
}

export function recordPrivateEquityConsumerReplay(out, reportPath, expectedSha256) {
  const { root, outputs, manifestSha256 } = readPrivateEquityOutputs(out);
  const path = safeFile(privateRoot(dirname(reportPath)), reportPath.split('/').at(-1)), bytes = readFileSync(path);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '') || sha(bytes) !== expectedSha256) throw Error('CONSUMER_REPLAY_HASH_MISMATCH');
  const replay = JSON.parse(bytes), universe = outputs.marketstack_europe_equity_universe;
  if (replay.mode !== 'PRIVATE_RESEARCH' || replay.publicationAllowed !== false || replay.status !== 'PRIVATE_CONTRACT_REPLAY_PASSED' ||
    replay.inputManifest?.sha256 !== manifestSha256 || replay.generatedAt !== universe.generatedAt || replay.providerRequests !== 0 ||
    replay.providerCredits !== 0 || replay.publicLoaderCalls !== 0 || replay.usCalls !== 0) throw Error('CONSUMER_REPLAY_SCOPE_MISMATCH');
  const securities = new Map(), charts = new Map();
  for (const s of replay.securities || []) {
    if (securities.has(s.securityId) || s.identity !== 'AVAILABLE' || s.publicationAllowed !== false || !s.watchlist?.passed ||
      s.missingSearchFields?.length || !(s.searches || []).length || s.searches.some(q => !q.passed || !Number.isInteger(q.resultCount) || q.resultCount < 1)) throw Error('CONSUMER_REPLAY_SECURITY_PROOF_INVALID');
    securities.set(s.securityId, s);
  }
  const admitted = new Set(universe.securities.map(s => s.securityId));
  if (admitted.size !== securities.size || [...admitted].some(id => !securities.has(id))) throw Error('CONSUMER_REPLAY_SECURITY_SET_MISMATCH');
  for (const c of replay.charts || []) {
    if (charts.has(c.listingId) || !universe.listings.some(l => l.listingKey === c.listingId && l.securityId === c.securityId) ||
      c.publicationAllowed !== false || c.basis !== 'RAW_UNADJUSTED') throw Error('CONSUMER_REPLAY_LISTING_PROOF_INVALID');
    charts.set(c.listingId, c);
  }
  const evidence = { path, sha256: expectedSha256, inputManifestSha256: manifestSha256, generatedAt: replay.generatedAt,
    scope: 'PRIVATE_CORE_CONSUMER_REPLAY', publicationAllowed: false };
  const productRows = outputs.marketstack_europe_product_readiness.rows;
  for (const row of productRows.filter(r => r.identityStatus === 'ACCEPTED')) {
    const s = securities.get(row.securityId), chart = charts.get(row.listingKey);
    row.consumerReplay = 'REPLAY_PASSED'; row.consumerReplayEvidence = evidence;
    row.readiness.SEARCH = 'SEARCH_READY'; row.readiness.WATCHLIST = 'WATCHLIST_READY';
    row.readiness.DISCOVER = s.readiness?.DISCOVER === 'BLOCKED' ? 'DISCOVER_BLOCKED' : row.readiness.DISCOVER;
    row.readiness.SCREENER = s.readiness?.SCREENER === 'BLOCKED' ? 'SCREENER_BLOCKED' : row.readiness.SCREENER;
    row.readiness.CHART = chart?.state === 'AVAILABLE' ? chart.chartStatus : 'CHART_BLOCKED';
    row.readiness.TECHNICAL = chart?.technical?.state === 'AVAILABLE' && chart.technical.status === 'TECHNICAL_PARTIAL' ? 'TECHNICAL_PARTIAL' : 'TECHNICAL_BLOCKED';
    row.readiness.BACKTEST = s.readiness?.BACKTEST || row.readiness.BACKTEST;
    row.publicationTier = row.readiness.CHART !== 'CHART_BLOCKED' ? 2 : 1;
    row.tierMeaning = 'PRIVATE_CONSUMER_REPLAY_ONLY';
  }
  const summary = outputs.marketstack_europe_evidence_summary;
  summary.consumerReplay = { ...evidence, status: replay.status, summary: replay.summary };
  summary.technicalMetricCoverage = Object.fromEntries(['sma20', 'sma50', 'sma200', 'high52w', 'momentum', 'volatility', 'drawdown', 'relativeStrength', 'breakout']
    .map(metric => [metric, [...charts.values()].filter(c => c.technical?.state === 'AVAILABLE' && typeof c.technical.metrics?.[metric] === 'number' && Number.isFinite(c.technical.metrics[metric])).length]));
  summary.technicalMetricCoverage.basis = 'PRIVATE_RAW_CONTIGUOUS_TRAILING_SEGMENT_UNCHANGED_ENGINE_DEFAULTS';
  for (const [name, country] of [['europe', null], ['germany', 'DE']]) {
    const rows = productRows.filter(r => r.identityStatus === 'ACCEPTED' && (!country || r.issuerCountry === country));
    summary[name].chartLimited = rows.filter(r => r.readiness.CHART === 'CHART_LIMITED').length;
    summary[name].searchTested = rows.length; summary[name].watchlistTested = rows.length;
  }
  for (const r of outputs.marketstack_europe_index_coverage.rows) {
    if (r.status !== 'EXACT_ISIN_OFFICIAL_ROSTER_JOIN') continue;
    const rows = productRows.filter(p => p.identityStatus === 'ACCEPTED' && universe.listings.some(l =>
      l.listingKey === p.listingKey && l.indexMembership.some(m => normalizedIndex(m.index) === r.index)));
    r.chartLimited = unique(rows.filter(p => p.readiness.CHART === 'CHART_LIMITED').map(p => p.isin)).length;
    r.technicalPartial = unique(rows.filter(p => p.readiness.TECHNICAL === 'TECHNICAL_PARTIAL').map(p => p.isin)).length;
  }
  return writePrivateEquityEvidence({ outputs }, root);
}

export function applyPrivateAdjustmentCorrection(out, correctionPath, expectedSha256, expectedInputManifestSha256) {
  const { root, outputs, manifestSha256 } = readPrivateEquityOutputs(out);
  if (expectedInputManifestSha256 !== manifestSha256) throw Error('ADJUSTMENT_CORRECTION_MANIFEST_MISMATCH');
  const path = safeFile(privateRoot(dirname(correctionPath)), correctionPath.split('/').at(-1)), bytes = readFileSync(path);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '') || sha(bytes) !== expectedSha256) throw Error('ADJUSTMENT_CORRECTION_HASH_MISMATCH');
  const correction = JSON.parse(bytes), universe = outputs.marketstack_europe_equity_universe;
  if (correction.mode !== 'PRIVATE_RESEARCH' || correction.publicationAllowed !== false || correction.productionWrites !== 0 ||
    correction.sourceGeneration !== universe.generatedAt || !Array.isArray(correction.errors) || correction.errors.length ||
    correction.oldPriceQualityFileSha256 !== sha(readFileSync(safeFile(root, 'marketstack_europe_price_quality.json'))) ||
    correction.oldAdjustmentFileSha256 !== sha(readFileSync(safeFile(root, 'marketstack_europe_adjustment_status.json')))) throw Error('ADJUSTMENT_CORRECTION_SOURCE_MISMATCH');
  const prices = new Map(outputs.marketstack_europe_price_quality.rows.map(r => [r.listingKey, r]));
  const adjustments = new Map(outputs.marketstack_europe_adjustment_status.rows.map(r => [r.listingKey, r]));
  const changes = new Map();
  for (const row of correction.rows || []) {
    const price = prices.get(row.listingKey), previous = adjustments.get(row.listingKey), value = row.classification;
    const diagnostic = row.rawDiagnostic, source = price?.provenance?.history || price?.provenance?.latest;
    if (changes.has(row.listingKey) || !price || !previous || digest(price) !== row.oldPriceproofSha || digest(previous) !== row.oldClassificationSha ||
      row.identityStatus !== price.identityStatus || row.previousStatus !== previous.status ||
      row.validation?.unchangedPriceGateCounts !== true || digest(row.validation.counts) !== digest(price.quality?.counts) ||
      row.validation.corporateActionStatusPreserved !== previous.corporateActions?.status ||
      !['ADJUSTMENT_PARTIAL', 'ADJUSTMENT_UNKNOWN', 'ADJUSTMENT_INVALID'].includes(value?.status) ||
      value.useProviderAdjusted !== false || value.coverage?.providerBasisCertified === true) throw Error('ADJUSTMENT_CORRECTION_ROW_MISMATCH');
    if (diagnostic?.scope !== 'FULL_AUTHENTICATED_OPERATION_ROWS_BEFORE_RAW_PRICE_QUARANTINE' ||
      diagnostic.admittedBasis !== 'VALID_RAW_OHLC_PRICE_SCOPE_ONLY' || diagnostic.noAdjustedFieldRepair !== true ||
      !Array.isArray(diagnostic.invalidOnValidRaw) || !Array.isArray(diagnostic.invalidOnQuarantinedRaw) ||
      !['ADJUSTMENT_PARTIAL', 'ADJUSTMENT_UNKNOWN', 'ADJUSTMENT_INVALID'].includes(diagnostic.classification?.status) ||
      diagnostic.classification.useProviderAdjusted !== false || diagnostic.classification.coverage?.providerBasisCertified === true ||
      diagnostic.rawPriceQuarantineCount !== price.quality.counts.quarantined ||
      row.validation.sourceNormalizedSha256 !== source?.normalizedSha256 ||
      digest(row.validation.rawResponseHashes) !== digest(source?.responses?.map(r => ({ id: r.id, sha256: r.sha256 })))) throw Error('ADJUSTMENT_CORRECTION_RAW_DIAGNOSTIC_MISMATCH');
    changes.set(row.listingKey, row);
  }
  const evidence = { path, sha256: expectedSha256, inputManifestSha256: manifestSha256,
    sourceGeneration: correction.sourceGeneration, generatedAt: correction.generatedAt,
    scope: 'ADJUSTMENT_METADATA_ONLY', useProviderAdjusted: false };
  const seriesBefore = digest(outputs.marketstack_europe_core_projection.series);
  for (const [listingKey, row] of changes) {
    Object.assign(adjustments.get(listingKey), row.classification, { correctionEvidence: evidence, rawAdjustedDiagnostic: row.rawDiagnostic });
    const core = outputs.marketstack_europe_core_projection.listingEvidence[listingKey];
    if (core) core.adjustment = { ...core.adjustment, status: row.classification.status, correctionEvidence: evidence,
      rawDiagnosticEvidenceRef: `marketstack_europe_adjustment_status.json#${listingKey}` };
    const strategy = outputs.marketstack_europe_supertrader_readiness.rows.find(r => r.listingKey === listingKey);
    if (strategy) strategy.adjustmentBasis = row.classification.status;
  }
  if (digest(outputs.marketstack_europe_core_projection.series) !== seriesBefore) throw Error('ADJUSTMENT_CORRECTION_SERIES_CHANGED');
  for (const row of outputs.marketstack_europe_product_readiness.rows.filter(r => r.identityStatus === 'ACCEPTED'))
    row.consumerReplay = 'REPLAY_REVALIDATION_PENDING';
  outputs.marketstack_europe_evidence_summary.adjustmentCorrection = { ...evidence, corrections: changes.size,
    priorConsumerReplay: outputs.marketstack_europe_evidence_summary.consumerReplay || null,
    seriesSha256Before: seriesBefore, seriesSha256After: seriesBefore, pricesAndIdsUnchanged: true };
  outputs.marketstack_europe_evidence_summary.consumerReplay = { status: 'REPLAY_REVALIDATION_PENDING', correctionEvidence: evidence };
  return writePrivateEquityEvidence({ outputs }, root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value('config') || !value('out')) throw Error('Usage: node europe-build-evidence.mjs --config=/private/config.json --out=/private/output');
  const config = json(value('config'));
  if (value('adjustment-correction')) {
    const manifest = applyPrivateAdjustmentCorrection(value('out'), value('adjustment-correction'), value('adjustment-correction-sha256'), value('input-manifest-sha256'));
    console.log(JSON.stringify({ files: manifest.files.length, publicationAllowed: false, providerRequests: 0 }));
  } else if (value('consumer-replay')) {
    const manifest = recordPrivateEquityConsumerReplay(value('out'), value('consumer-replay'), value('consumer-replay-sha256'));
    console.log(JSON.stringify({ files: manifest.files.length, publicationAllowed: false, providerRequests: 0 }));
  } else if (args.includes('--refresh-metadata')) {
    const manifest = refreshPrivateEquityMetadata(value('out'), { indexReferences: readIndexReferences(config.indexPaths || []),
      centralLogos: config.centralLogos !== false });
    console.log(JSON.stringify({ files: manifest.files.length, publicationAllowed: false, providerRequests: 0 }));
  } else {
  const evidence = (config.evidenceDirs || []).map(path => loadEvidenceDirectory(path,
    { onProgress: state => console.log(JSON.stringify({ evidenceRoot: path, ...state })) }));
  const officialIdentity = readOfficialIdentities(config.identityPaths || []);
  const calendarsDoc = config.calendarsPath ? json(config.calendarsPath) : {};
    const indexReferences = readIndexReferences(config.indexPaths || []);
  const protectedSecurityIds = config.protectedSecurityIdsPath ? json(config.protectedSecurityIdsPath).securityIds : config.protectedSecurityIds || [];
  const result = compileEuropeEvidence({ evidence, officialIdentity, calendars: calendarsDoc.calendars || calendarsDoc,
    now: config.now, protectedSecurityIds, indexReferences });
  if (config.centralLogos !== false) applyCentralLogos(result.outputs);
  const manifest = writePrivateEquityEvidence(result, value('out'));
  const report = result.outputs.marketstack_europe_evidence_summary;
  console.log(JSON.stringify({ files: manifest.files.length, germany: report.germany, europe: report.europe,
    candidates: report.candidates, quarantined: report.quarantine.length, publicationAllowed: false }));
  }
}
