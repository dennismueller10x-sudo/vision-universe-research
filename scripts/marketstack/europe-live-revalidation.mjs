/** Authenticated, private, bounded evidence collection. Never publishes or changes product gates. */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {createEuropeBudget, estimateEuropeBatch} from './europe-credits.mjs';
import {privateRoot} from './europe-ingestion.mjs';
import {validIsin} from './europe-universe.mjs';

const require = createRequire(import.meta.url);
const {createAuditAdapter, normalizeObservation} = require('../../providers/marketstack/audit-adapter.js');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const LIVE_TARGET = 13000;
export const LIVE_HARD_CAP = 16000;
const digest = value => createHash('sha256').update(value).digest('hex');
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const symbol = value => typeof value === 'string' && /^[A-Z0-9][A-Z0-9._-]{0,64}$/.test(value);
const shift = (date, delta) => new Date(Date.parse(date) + delta * 86400000).toISOString().slice(0, 10);
const fatalReasons = new Set(['authError', 'quotaExceeded', 'budgetExceeded', 'EUROPE_RUN_BUDGET_EXCEEDED',
  'responsePersistenceFailed', 'accountingPersistenceFailed', 'budgetReservationFailed']);
const catalogFile = join(ROOT, 'discover/data/europe/catalog.json');

function primary(security) {
  return security.listings.find(row => row.listingId === security.primaryListingId);
}
function requireSafePlanData(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/access.?key|api.?key|password|secret|^(raw|rawPayload|rawText|payload|open|high|low|close|volume|adj_.*)$/i.test(key))
      throw Error('LIVE_PLAN_MUST_CONTAIN_ONLY_SANITIZED_REQUEST_METADATA');
    if (child && typeof child === 'object') requireSafePlanData(child);
  }
}
export function validateLivePlan(plan, {catalog, catalogSha256} = {}) {
  if (!catalog) {
    const bytes = readFileSync(catalogFile);
    catalog = JSON.parse(bytes); catalogSha256 = digest(bytes);
  }
  requireSafePlanData(plan);
  if (plan?.version !== 1 || !Array.isArray(plan.listings) || plan.listings.length !== 449 ||
      catalog?.securities?.length !== 449 || plan.sourceBindings?.catalogSha256 !== catalogSha256)
    throw Error('LIVE_PLAN_CANONICAL_449_BINDING_REQUIRED');
  const padding = plan.policy?.broaderPaddingDays ?? 45;
  if (!Number.isInteger(padding) || padding < 1 || padding > 90) throw Error('INVALID_BROADER_DATE_POLICY');
  const canonical = new Map(catalog.securities.map(row => [row.securityId, row]));
  const seen = new Set();
  for (const listing of plan.listings) {
    const security = canonical.get(listing.securityId), local = security && primary(security);
    if (!security || seen.has(listing.securityId) || security.region !== 'EUROPE' || !local ||
        listing.listingId !== local.listingId || listing.symbol !== local.providerSymbol ||
        listing.mic !== local.mic || listing.currency !== local.currency || listing.isin !== (security.isin ?? null) ||
        !symbol(listing.symbol) || !/^[A-Z0-9]{4}$/.test(listing.mic))
      throw Error('LIVE_PLAN_IDENTITY_OR_US_SCOPE_MISMATCH');
    seen.add(listing.securityId);
    const canonicalAliases = new Set([security.canonicalTicker, ...(security.aliases ?? []), ...(local.aliases ?? [])]);
    if (!Array.isArray(listing.windows) || !Array.isArray(listing.aliases ?? []) ||
        (listing.aliases ?? []).some(alias => !symbol(alias) || !canonicalAliases.has(alias)) ||
        (listing.canonicalTicker != null && listing.canonicalTicker !== security.canonicalTicker))
      throw Error('INVALID_LIVE_WINDOWS_OR_ALIASES');
    const windowIds = new Set();
    for (const window of listing.windows) {
      validateWindow(window);
      if (Date.parse(window.to) - Date.parse(window.from) > 365 * 86400000)
        throw Error('LIVE_HISTORY_WINDOW_MUST_BE_TARGETED');
      if (windowIds.has(window.windowId)) throw Error('DUPLICATE_LIVE_WINDOW');
      windowIds.add(window.windowId);
      if (!Array.isArray(window.targetDates) || !window.targetDates.length ||
          window.targetDates.some(target => !day(target.date) || target.date < window.from || target.date > window.to ||
            !['MISSING', 'QUARANTINE'].includes(target.kind))) throw Error('INVALID_LIVE_TARGET_DATES');
    }
  }
  if (!Array.isArray(plan.corporateActionWindows) ||
      (plan.coverage ? plan.coverage.strongBreakCases !== 47 : plan.corporateActionWindows.length !== 47))
    throw Error('ALL_47_ACTION_WINDOWS_REQUIRED');
  const actionIds = new Set();
  const strongCases = new Set();
  for (const window of plan.corporateActionWindows) {
    validateWindow(window);
    const listing = plan.listings.find(row => row.securityId === window.securityId);
    if (!listing || listing.listingId !== window.listingId || typeof window.discontinuityId !== 'string')
      throw Error('ACTION_WINDOW_IDENTITY_REQUIRED');
    if (actionIds.has(window.discontinuityId)) throw Error('DUPLICATE_ACTION_WINDOW');
    actionIds.add(window.discontinuityId);
    for (const event of window.events ?? []) {
      if (event.type === 'STRONG_BREAK') {
        if (typeof event.caseId !== 'string' || strongCases.has(event.caseId)) throw Error('DUPLICATE_OR_UNBOUND_STRONG_BREAK');
        if (!day(event.eventFrom) || !day(event.eventTo) || event.eventFrom < window.from || event.eventTo > window.to)
          throw Error('ACTION_EVENT_OUTSIDE_WINDOW');
        strongCases.add(event.caseId);
      }
    }
  }
  if (plan.coverage && strongCases.size !== 47) throw Error('ALL_47_DISTINCT_STRONG_BREAKS_REQUIRED');
  const operations = primaryOperations(plan);
  const estimate = estimateEuropeBatch(operations.map(operationEstimate));
  if (estimate.credits > LIVE_TARGET) throw Error('MANDATORY_LIVE_BATCH_EXCEEDS_13000_TARGET');
  return {listings: 449, windows: plan.listings.reduce((sum, row) => sum + row.windows.length, 0),
    corporateActionWindows: plan.corporateActionWindows.length, ...estimate};
}
function validateWindow(window) {
  if (!window || typeof window.windowId !== 'string' || !window.windowId || !day(window.from) ||
      !day(window.to) || window.from > window.to || !Number.isInteger(window.maxPages ?? 1) ||
      (window.maxPages ?? 1) < 1 || (window.maxPages ?? 1) > 100)
    throw Error('INVALID_BOUNDED_LIVE_WINDOW');
}
function listingFor(row) {
  return {securityId: row.securityId, listingId: row.listingId, providerTicker: row.symbol,
    mic: row.mic, currency: row.currency, isin: row.isin};
}
function primaryOperations(plan) {
  const metadata = plan.listings.map(row => ({kind: 'metadata', listing: listingFor(row),
    symbol: row.symbol, variant: 'EXACT_METADATA', maxPages: 1}));
  const windows = plan.listings.flatMap(row => row.windows.map(window => ({kind: 'history',
    listing: listingFor(row), ...window, variant: 'FILTERED_EXACT', maxPages: window.maxPages ?? 1})));
  const actions = plan.corporateActionWindows.flatMap(window => {
    const listing = listingFor(plan.listings.find(row => row.securityId === window.securityId));
    return ['splits', 'dividends'].map(kind => ({...window, listing, kind, variant: 'ACTION_ENDPOINT', maxPages: window.maxPages ?? 1}));
  });
  // All listings receive a primary query before optional retries of any variant.
  return [...metadata, ...actions, ...windows];
}
function operationEstimate(operation) {
  return {endpoint: operation.kind === 'metadata' ? '/tickers/' + operation.symbol :
    operation.kind === 'history' ? '/eod' : '/' + operation.kind,
  params: operation.kind === 'metadata' ? {} : {symbols: operation.querySymbol ?? operation.listing.providerTicker},
  pages: operation.kind === 'metadata' ? 1 : operation.maxPages ?? 1, attempts: 1};
}

/** Validate page ordering/window/returned identity in addition to client offset/count/total proof. */
export function validateHistoryResult(result, operation) {
  const rows = result.data ?? [], aliases = new Set([operation.querySymbol ?? operation.listing.providerTicker]);
  const accepted = [], rejected = [], dates = new Set(); let previous = null;
  const problems = [];
  for (const item of rows) {
    const row = item.normalized ? item : normalizeObservation(item, {kind: 'EOD', retrievedAt: result.retrievedAt});
    const normalized = row.normalized, date = normalized.tradingDate;
    if (!aliases.has(normalized.providerTicker) || normalized.providerExchange !== operation.listing.mic) {
      rejected.push(row); continue;
    }
    if (!day(date) || date < operation.from || date > operation.to) problems.push('RETURNED_DATE_OUTSIDE_WINDOW');
    if (day(result.retrievedAt?.slice(0, 10)) && date > result.retrievedAt.slice(0, 10)) problems.push('RETURNED_FUTURE_DATE');
    if (previous !== null && date < previous) problems.push('ORDERING_MISMATCH');
    if (dates.has(date)) problems.push('DUPLICATE_LISTING_DATE');
    previous = date; dates.add(date); accepted.push(row);
  }
  if (rejected.length && operation.variant !== 'EXCHANGE_UNFILTERED') problems.push('RETURNED_IDENTITY_MISMATCH');
  const scopedComplete = result.ok === true && result.complete === true && problems.length === 0;
  return {...result, data: accepted, rejectedObservations: rejected, queryValidationProblems: [...new Set(problems)],
    complete: scopedComplete, scopeComplete: scopedComplete, providerPaginationComplete: result.complete === true,
    querySymbol: operation.querySymbol ?? operation.listing.providerTicker,
    reason: problems.length ? problems[0] : result.reason, canonicalAdmission: false};
}
export function verifiedMetadata(result, listing, queriedSymbol = listing.providerTicker) {
  if (!validIsin(listing.isin)) return false;
  const candidates = (result.observations ?? []).filter(item => {
    const raw = item.raw, normalized = item.normalized;
    const mics = [normalized.providerExchange, ...(raw.stock_exchanges ?? []).map(venue => venue.mic ?? venue.exchange_mic)];
    return normalized.providerTicker === queriedSymbol && normalized.isin === listing.isin &&
      mics.includes(listing.mic) && raw.active !== false && raw.is_active !== false &&
      (!normalized.currency || normalized.currency === listing.currency);
  });
  return result.ok === true && candidates.length === 1;
}
function compactResult(result) {
  // Every raw page is archived exactly once; observations preserve all row fields.
  const {raw, rawPages, ...compact} = result;
  if (compact.observations) delete compact.data;
  return compact;
}
export function unresolvedTargetDates(operation, result) {
  if (operation.kind !== 'history') return [];
  const observations = new Map(result.ok === true && result.complete === true ?
    (result.data ?? []).map(row => [row.normalized.tradingDate, row]) : []);
  const usableQuarantineBar = row => {
    const value = row?.normalized;
    if (!value || !['open', 'high', 'low', 'close'].every(field => Number.isFinite(value[field]) && value[field] > 0) ||
        !Number.isFinite(value.volume) || value.volume < 0 ||
        value.high < Math.max(value.open, value.close, value.low) || value.low > Math.min(value.open, value.close, value.high)) return false;
    return !value.currency || value.currency === operation.listing.currency;
  };
  return [...new Set((operation.targetDates ?? []).filter(target => {
    const row = observations.get(target.date);
    return target.kind === 'MISSING' ? !row : target.kind === 'QUARANTINE' && !usableQuarantineBar(row);
  }).map(target => target.date))];
}

export async function collectLiveRevalidation({plan, out, apiKey = process.env.MARKETSTACK_API_KEY,
  fetchImpl, sleep, log = line => console.log(JSON.stringify(line)), catalog, catalogSha256,
  maxCredits = LIVE_HARD_CAP} = {}) {
  const planned = validateLivePlan(plan, {catalog, catalogSha256});
  if (!Number.isInteger(maxCredits) || maxCredits < planned.credits || maxCredits > LIVE_HARD_CAP)
    throw Error('INVALID_LIVE_16000_HARD_CAP');
  if (!apiKey || typeof apiKey !== 'string') throw Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
  out = privateRoot(out); mkdirSync(out, {recursive: true, mode: 0o700});
  if (existsSync(join(out, 'credits.json')) || existsSync(join(out, 'summary.json'))) throw Error('LIVE_RUN_REENTRY_REFUSED');
  const budget = createEuropeBudget(join(out, 'credits.json'), {maxCredits, targetCredits: LIVE_TARGET,
    hardCap: LIVE_HARD_CAP, runId: 'europe-live-revalidation-449'});
  mkdirSync(join(out, 'raw'), {mode: 0o700}); mkdirSync(join(out, 'normalized'), {mode: 0o700});
  const write = (path, value) => writeFileSync(join(out, path), JSON.stringify(value) + '\n', {mode: 0o600});
  const writeCompressed = (path, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const compressed = gzipSync(bytes, {level: 6});
    writeFileSync(join(out, path), compressed, {flag: 'wx', mode: 0o600});
    return {path, codec: 'gzip', sha256: digest(bytes), bytes: bytes.length,
      compressedSha256: digest(compressed), compressedBytes: compressed.length};
  };
  const manifest = [], results = [], pending = [], metadata = new Map(), listingCounts = new Map();
  const primaries = primaryOperations(plan);
  for (const row of plan.listings) listingCounts.set(row.securityId, row.windows.length);
  let sequence = 0, terminalReason = null, finishedPrimary = new Set();
  const api = createAuditAdapter({apiKey, fetchImpl, sleep, sharedBudget: budget, maxCredits,
    maxRequests: LIVE_HARD_CAP, maxRetries: 0, timeoutMs: 90000, cacheTtlMs: 0,
    minIntervalMs: fetchImpl ? 0 : 250, onResponse: async response => {
      const id = String(++sequence).padStart(6, '0');
      const binding = writeCompressed('raw/' + id + '.json.gz', response.rawText);
      const {rawText, body, ...safe} = response;
      const meta = {...safe, id, ...binding}; manifest.push(meta);
      write('raw/' + id + '.meta.json', meta);
      if (sequence % 25 === 0) write('raw-manifest.json', manifest);
    }});
  const progress = phase => {
    const status = budget.status();
    log({phase, requests: status.requests, reservedCredits: status.estimatedCredits,
      targetRemaining: Math.max(0, LIVE_TARGET - status.estimatedCredits), remainingBudget: status.remainingCredits,
      titlesFinished: finishedPrimary.size, titlesOpen: 449 - finishedPrimary.size});
  };
  const adaptiveBatchEstimate = (phase, operations) => {
    const estimate = estimateEuropeBatch(operations.map(operationEstimate)), state = budget.status();
    log({phase: phase + '_ESTIMATE', requests: estimate.requests, reservedCredits: estimate.credits,
      remainingBudget: state.remainingCredits, targetRemaining: Math.max(0, LIVE_TARGET - state.estimatedCredits),
      titlesFinished: finishedPrimary.size, titlesOpen: 449 - finishedPrimary.size});
  };
  async function perform(operation) {
    if (operation.kind === 'metadata') return api.getTicker(operation.symbol);
    const options = {from: operation.from, to: operation.to, limit: 1000, maxPages: operation.maxPages};
    if (operation.kind === 'splits') return api.getSplits(operation.listing, options);
    if (operation.kind === 'dividends') return api.getDividends(operation.listing, options);
    if (operation.variant === 'EXCHANGE_UNFILTERED') {
      return validateHistoryResult(await api.client.paginate('/eod', {symbols: operation.listing.providerTicker,
        date_from: operation.from, date_to: operation.to, sort: 'ASC', limit: 1000},
      {maxPages: operation.maxPages, cacheTtlMs: 0}), operation);
    }
    const listing = {...operation.listing, providerTicker: operation.querySymbol ?? operation.listing.providerTicker};
    return validateHistoryResult(await api.getHistoricalEOD(listing, options), operation);
  }
  async function execute(operation, phase = 'PRIMARY') {
    const ordinal = results.length, before = sequence;
    let result;
    if (terminalReason) result = {ok: false, complete: false, skipped: true, reason: terminalReason};
    else {
      try {
        const estimate = budget.estimateBatch([operationEstimate(operation)]);
        if (phase !== 'PRIMARY' && budget.status().estimatedCredits + estimate.credits > LIVE_TARGET)
          result = {ok: false, complete: false, skipped: true, reason: 'TARGET_BUDGET_NOT_PROBED'};
        else result = await perform(operation);
      } catch (error) {
        const code = error?.code;
        result = {ok: false, complete: false, reason: code === 'EUROPE_BATCH_EXCEEDS_BUDGET' ? code : 'LIVE_OPERATION_FAILED'};
      } finally {api.client.clearCache();}
    }
    if (fatalReasons.has(result.reason) || String(result.reason).startsWith('LEDGER_')) terminalReason = result.reason;
    const entry = {ordinal, operation, responseIds: manifest.slice(before).map(row => row.id), result: compactResult(result)};
    const binding = writeCompressed('normalized/' + String(ordinal).padStart(6, '0') + '.json.gz', JSON.stringify(entry) + '\n');
    results.push({ordinal, operation, responseIds: entry.responseIds, resultPath: binding.path,
      normalizedSha256: binding.sha256, normalizedCompressedSha256: binding.compressedSha256,
      codec: binding.codec, normalizedBytes: binding.bytes, compressedBytes: binding.compressedBytes,
      ok: result.ok === true, complete: result.complete === true, reason: result.reason ?? null,
      status: result.status ?? null, skipped: result.skipped === true,
      downloadedCount: result.data?.length ?? result.observations?.length ?? null});
    if (operation.kind === 'metadata') metadata.set(operation.listing.securityId + ':' + operation.symbol,
      verifiedMetadata(result, operation.listing, operation.symbol));
    if (results.length % 25 === 0) write('result-manifest.json', results);
    return result;
  }
  let summary;
  try {
    progress('PRIMARY_PLANNED');
    for (let i = 0; i < primaries.length; i += 25) {
      const batch = primaries.slice(i, i + 25);
      const estimate = estimateEuropeBatch(batch.map(operationEstimate));
      log({phase: 'PRIMARY_BATCH_ESTIMATE', ...estimate, remainingBudget: budget.status().remainingCredits,
        titlesFinished: finishedPrimary.size, titlesOpen: 449 - finishedPrimary.size});
      for (const operation of batch) {
        const result = await execute(operation);
        if (operation.kind === 'history') {
          const sid = operation.listing.securityId;
          listingCounts.set(sid, listingCounts.get(sid) - 1);
          if (listingCounts.get(sid) === 0) finishedPrimary.add(sid);
          const remaining = unresolvedTargetDates(operation, result);
          if (remaining.length) pending.push({operation, remaining});
        }
      }
      progress('PRIMARY_BATCH_COMPLETE');
    }
    for (const row of plan.listings) if (!row.windows.length) finishedPrimary.add(row.securityId);
    // Equal-query retries are prohibited. Broader date windows are tried first, across every unresolved window.
    const unresolved = [], broaderPadding = plan.policy?.broaderPaddingDays ?? 45;
    if (!Number.isInteger(broaderPadding) || broaderPadding < 1 || broaderPadding > 90)
      throw Error('INVALID_BROADER_DATE_POLICY');
    for (let i = 0; i < pending.length; i++) {
      if (terminalReason) break;
      if (i % 25 === 0) adaptiveBatchEstimate('BROADER_DATE_BATCH', pending.slice(i, i + 25).map(item => item.operation));
      const item = pending[i], operation = {...item.operation, from: shift(item.operation.from, -broaderPadding),
        to: shift(item.operation.to, broaderPadding), variant: 'BROADER_DATE', maxPages: item.operation.maxPages};
      const result = await execute(operation, 'ADAPTIVE');
      const remaining = unresolvedTargetDates(operation, result);
      if (remaining.length) unresolved.push({operation, remaining});
    }
    const stillUnresolved = [];
    for (let i = 0; i < unresolved.length; i++) {
      if (terminalReason) break;
      if (i % 25 === 0) adaptiveBatchEstimate('EXCHANGE_UNFILTERED_BATCH', unresolved.slice(i, i + 25).map(item => item.operation));
      const operation = {...unresolved[i].operation, variant: 'EXCHANGE_UNFILTERED'};
      const result = await execute(operation, 'ADAPTIVE');
      const remaining = unresolvedTargetDates(operation, result);
      if (remaining.length) stillUnresolved.push({operation, remaining});
    }
    // Only declared aliases that freshly confirm the exact ISIN and MIC can supply alternate-series evidence.
    for (const row of plan.listings) {
      if (terminalReason) break;
      let affected = stillUnresolved.filter(item => item.operation.listing.securityId === row.securityId);
      if (!affected.length) continue;
      const aliases = [...new Set([row.canonicalTicker, ...(row.aliases ?? [])].filter(value => symbol(value) && value !== row.symbol))];
      for (const alias of aliases) {
        if (terminalReason) break;
        if (!affected.length) break;
        const listing = listingFor(row);
        const proof = await execute({kind: 'metadata', listing, symbol: alias, variant: 'ALIAS_METADATA', maxPages: 1}, 'ADAPTIVE');
        if (!verifiedMetadata(proof, listing, alias)) continue;
        const next = [];
        for (const item of affected) {
          const operation = {...item.operation, variant: 'VERIFIED_ALIAS', querySymbol: alias};
          const result = await execute(operation, 'ADAPTIVE');
          if (unresolvedTargetDates(operation, result).length) next.push(item);
        }
        affected = next;
      }
    }
    const state = budget.status();
    summary = {schema: 'vu-europe-live-revalidation-1', generatedAt: new Date().toISOString(),
      sourceBindings: plan.sourceBindings, executionSourceCommit: process.env.GITHUB_SHA ?? null,
      planSha256: digest(JSON.stringify(plan)), planned,
      targetCredits: LIVE_TARGET, hardCap: LIVE_HARD_CAP, budget: state, transport: api.client.stats(),
      terminalReason, all449Included: true, listings: plan.listings.map(row => ({securityId: row.securityId,
        listingId: row.listingId, metadataMatched: metadata.get(row.securityId + ':' + row.symbol) === true,
        primaryWindows: row.windows.length, primaryProcessed: finishedPrimary.has(row.securityId),
        operationCount: results.filter(result => result.operation.listing.securityId === row.securityId).length})),
      results, rawResponses: manifest.length, productionWrites: 0, scheduleEnabled: false,
      publication: 'PRIVATE_EVIDENCE_ONLY', analyticalGatesChanged: false, actualBilledCredits: 'UNKNOWN'};
    write('summary.json', summary); progress('COLLECTION_COMPLETE');
    return summary;
  } finally {
    write('raw-manifest.json', manifest); write('result-manifest.json', results); budget.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const argument = process.argv[i], index = argument.indexOf('=');
    const key = index < 0 ? argument : argument.slice(0, index);
    const value = index < 0 ? process.argv[++i] : argument.slice(index + 1);
    if (!['--plan', '--out'].includes(key) || !value || args[key]) throw Error('INVALID_LIVE_CLI_ARGUMENT');
    args[key] = value;
  }
  if (!args['--plan'] || !args['--out']) throw Error('LIVE_PLAN_AND_PRIVATE_OUTPUT_REQUIRED');
  const plan = JSON.parse(readFileSync(args['--plan'], 'utf8'));
  await collectLiveRevalidation({plan, out: args['--out']});
}
