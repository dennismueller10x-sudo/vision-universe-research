/** Server-only, bounded diagnostic of all API-directory matched US listings.
 * Raw observations/checkpoints are private Action artifacts, never canonical data.
 * A valid latest candle does not validate company identity or historical bases.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Client from '../../providers/marketstack/client.js';
import Adapter from '../../providers/marketstack/adapter.js';

const VERSION = 'marketstack-us-latest-benchmark-1.0.0';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const countBy = (rows, fn) => rows.reduce((out, row) => { const k = fn(row) || 'UNKNOWN'; out[k] = (out[k] || 0) + 1; return out; }, {});
const safeReason = reason => ['budgetExceeded','authError','notConfigured','entitlementRestricted','quotaExceeded',
  'accountingPersistenceFailed','pageBudgetExceeded','timeout','networkError','rateLimited','internalError',
  'invalidResponse','invalidPagination','dataUnavailable'].includes(reason) ? reason : 'requestFailed';
const terminal = reason => ['budgetExceeded','authError','notConfigured','entitlementRestricted','quotaExceeded',
  'accountingPersistenceFailed'].includes(reason);
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

export function planFullUSLatest(directoryDiff, batchSize = 100) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Batch size must be 1..100');
  if (!Array.isArray(directoryDiff?.rows)) throw new Error('Authenticated directory benchmark required');
  const targets = directoryDiff.rows.filter(r => r.status === 'DIRECTORY_MATCHED').map(r => {
    const mic = r.directoryListing?.mic, symbol = r.directoryListing?.symbol;
    if (!r.securityId || !symbol || symbol !== r.providerSymbol || !r.expectedMics?.includes(mic) ||
      !['XNAS','XNYS','XASE','ARCX','BATS','IEXG'].includes(mic) || r.directoryListing.metadataConflict)
      throw new Error('Directory match lacks protected canonical listing identity');
    return { securityId: r.securityId, ticker: r.ticker, providerSymbol: symbol, mic,
      expectedCurrency: 'USD', instrumentType: r.instrumentType || 'UNKNOWN',
      activeStatus: r.activeStatus || 'UNKNOWN', productMember: r.productMember === true, consumer: r.consumer === true };
  }).sort((a, b) => a.mic.localeCompare(b.mic, 'en') || a.providerSymbol.localeCompare(b.providerSymbol, 'en'));
  if (!targets.length || new Set(targets.map(r => r.securityId)).size !== targets.length ||
    new Set(targets.map(r => r.mic + '\0' + r.providerSymbol)).size !== targets.length)
    throw new Error('Nonempty unique canonical target listings required');
  const batches = [];
  for (const mic of [...new Set(targets.map(r => r.mic))]) {
    const local = targets.filter(r => r.mic === mic);
    for (let offset = 0; offset < local.length; offset += batchSize) {
      const members = local.slice(offset, offset + batchSize);
      batches.push({ id: mic + ':' + offset, mic, members });
    }
  }
  const fingerprint = sha(JSON.stringify({ version: VERSION, baseline: directoryDiff.baselineSource?.sha256 || null, targets, batchSize }));
  return { targets, batches, fingerprint, estimatedMinimumCredits: targets.length, estimatedMinimumRequests: batches.length };
}

export function evaluateLatestObservation(target, raw, today, freshnessDays = 7) {
  if (!validDay(today)) throw new Error('Valid UTC audit day required');
  const base = { securityId: target.securityId, ticker: target.ticker, providerSymbol: target.providerSymbol,
    mic: target.mic, expectedCurrency: target.expectedCurrency, instrumentType: target.instrumentType,
    activeStatus: target.activeStatus, productMember: target.productMember, consumer: target.consumer,
    companyIdentityValidation: 'DIRECTORY_SYMBOL_MIC_ONLY_UNVERIFIED_ISSUER',
    historyValidation: 'NOT_TESTED', adjustmentBasis: 'UNVERIFIED', dataFrequency: 'EOD', delayState: 'EOD_ONLY' };
  if (!raw) return { ...base, status: 'MISSING_LATEST', validLatest: false };
  const currencyRaw = raw.price_currency || raw.currency;
  const currency = typeof currencyRaw === 'string' ? currencyRaw.trim().toUpperCase() : null;
  const observation = { marketTimestamp: raw.date || null, symbol: raw.symbol || null, mic: raw.exchange || null,
    reportedCurrency: currencyRaw || null, assetType: raw.asset_type || null,
    open: Adapter.number(raw.open), high: Adapter.number(raw.high), low: Adapter.number(raw.low), close: Adapter.number(raw.close),
    volume: Adapter.number(raw.volume), observedAdjustedClose: Adapter.number(raw.adj_close),
    splitFactor: Adapter.number(raw.split_factor), dividend: Adapter.number(raw.dividend) };
  const failed = status => ({ ...base, status, validLatest: false, observation });
  if (raw.symbol !== target.providerSymbol) return failed('SYMBOL_MISMATCH');
  if (raw.exchange !== target.mic) return failed('EXCHANGE_MISMATCH');
  if (!currency) return failed('MISSING_PROVIDER_CURRENCY');
  if (!/^[A-Z]{3}$/.test(currency) || currency !== target.expectedCurrency) return failed('CURRENCY_MISMATCH');
  if (raw.price_currency && raw.currency && String(raw.currency).trim().toUpperCase() !== currency) return failed('CURRENCY_MISMATCH');
  const normalized = Adapter.normalizeBar(target.securityId, { ...raw, price_currency: currency,
    ...(raw.currency ? { currency } : {}) }, { securityId: target.securityId, symbol: target.providerSymbol,
    mic: target.mic, exchange: target.mic, currency: target.expectedCurrency,
    assetType: target.instrumentType === 'ETF' ? 'etf' : 'equity' });
  if (!normalized.ok) {
    const statuses = { invalidDate: 'INVALID_DATE', invalidOHLC: 'INVALID_OHLC', invalidAdjustedOHLC: 'INVALID_ADJUSTED_OHLC',
      invalidCorporateAction: 'INVALID_CORPORATE_ACTION', assetTypeMismatch: 'ASSET_TYPE_MISMATCH' };
    return failed(statuses[normalized.reason] || 'NORMALIZATION_REJECTED');
  }
  const date = normalized.bar.date;
  if (date > today) return failed('FUTURE_DATE');
  const ageDays = Math.floor((Date.parse(today) - Date.parse(date)) / 86400000);
  const staleActive = target.activeStatus === 'ACTIVE' && ageDays > freshnessDays;
  return { ...base, status: staleActive ? 'STALE_LATEST_ACTIVE' : 'VALID_LATEST', validLatest: !staleActive,
    structurallyValid: true, tradingDate: date, ageDays, normalizedCurrency: currency, observation,
    metadataMissing: ['asset_type', 'price_currency'].filter(field => !raw[field]),
    currencyCaseNormalized: currencyRaw !== currency };
}

function atomicWrite(file, state) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); renameSync(tmp, file);
}

function summarize(state, plan) {
  const rows = state.rows;
  const outcome = selected => ({ total: selected.length, validLatest: selected.filter(r => r.validLatest).length,
    byStatus: countBy(selected, r => r.status) });
  const attemptedIds = new Set(state.batches.filter(b => b.attempted).flatMap(b => b.securityIds));
  const pendingBatches = plan.batches.filter(b => !state.batches.some(saved => saved.id === b.id && saved.complete));
  state.summary = { totalBaseline: state.baselineTotal, metadataMatchedTargets: plan.targets.length,
    symbolsAttempted: attemptedIds.size, remainingSymbols: plan.targets.length - attemptedIds.size,
    pendingRetryOrUnattemptedSymbols: pendingBatches.reduce((n, b) => n + b.members.length, 0),
    completeResponseBatches: state.batches.filter(b => b.complete).length, totalBatches: plan.batches.length,
    byStatus: countBy(rows, r => r.status), validLatest: rows.filter(r => r.validLatest).length,
    actualPriceQualityRejected: rows.filter(r => !['VALID_LATEST','NOT_ATTEMPTED','REQUEST_FAILED','BATCH_INCOMPLETE'].includes(r.status)).length,
    activeCommonEquities: outcome(rows.filter(r => r.instrumentType === 'EQUITY_COMMON' && r.activeStatus === 'ACTIVE')),
    product: outcome(rows.filter(r => r.productMember)), consumer: outcome(rows.filter(r => r.consumer)) };
  state.remainingWork = pendingBatches.map(b => ({ batchId: b.id, mic: b.mic, symbols: b.members.map(m => m.providerSymbol) }));
  state.complete = pendingBatches.length === 0;
  if (state.complete) state.state = 'COMPLETE_LATEST_OBSERVATION_BENCHMARK';
  state.updatedAt = new Date().toISOString();
  return state;
}

/** Uses its own existing sanitized client so the bounded full-universe budget is
 * independent of discovery probes. An injected factory is for deterministic tests.
 * Cumulative reservations survive process interruption and never reset on resume. */
export async function runFullUSLatest(directoryDiff, options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const maxCredits = options.maxCredits ?? 7400, maxRequests = options.maxRequests ?? 100;
  const freshnessDays = options.freshnessDays ?? 7;
  if (!validDay(today) || !Number.isInteger(maxCredits) || maxCredits < 0 || maxCredits > 7400 ||
    !Number.isInteger(maxRequests) || maxRequests < 0 || maxRequests > 100 || !Number.isInteger(freshnessDays) || freshnessDays < 0)
    throw new Error('Invalid bounded US-latest benchmark controls');
  const plan = planFullUSLatest(directoryDiff, options.batchSize ?? 100);
  const outputPath = resolve(options.outputPath || '.market-cache/marketstack/us-latest-benchmark/' + today + '/checkpoint.json');
  let state;
  if (existsSync(outputPath)) {
    try { state = JSON.parse(readFileSync(outputPath, 'utf8')); } catch (_) { throw new Error('US-latest checkpoint could not be read'); }
    if (state.schemaVersion !== VERSION || state.today !== today || state.inputFingerprint !== plan.fingerprint ||
      !Array.isArray(state.rows) || state.rows.length !== plan.targets.length || !Array.isArray(state.batches) ||
      !Number.isInteger(state.budgetUsed?.requestsAttempted) || !Number.isInteger(state.budgetUsed?.estimatedCreditsConsumed) ||
      state.budgetUsed.requestsAttempted < 0 || state.budgetUsed.estimatedCreditsConsumed < 0 ||
      state.limits?.freshnessDays !== freshnessDays ||
      new Set(state.rows.map(r => r.securityId)).size !== plan.targets.length ||
      new Set(state.batches.map(r => r.id)).size !== state.batches.length ||
      state.rows.some(r => !plan.targets.some(t => t.securityId === r.securityId && t.providerSymbol === r.providerSymbol &&
        t.mic === r.mic && t.expectedCurrency === r.expectedCurrency && t.instrumentType === r.instrumentType &&
        t.activeStatus === r.activeStatus && typeof r.validLatest === 'boolean')) ||
      state.batches.some(saved => !plan.batches.some(b => b.id === saved.id && b.mic === saved.mic &&
        JSON.stringify(b.members.map(t => t.securityId)) === JSON.stringify(saved.securityIds) &&
        JSON.stringify(b.members.map(t => t.providerSymbol)) === JSON.stringify(saved.symbols) &&
        typeof saved.complete === 'boolean' && typeof saved.attempted === 'boolean')))
      throw new Error('US-latest checkpoint identity or structure mismatch');
  } else {
    state = { schemaVersion: VERSION, privateArtifact: true, today, inputFingerprint: plan.fingerprint,
      baselineTotal: directoryDiff.totals?.TOTAL_EXISTING_TIINGO || directoryDiff.rows.length,
      baselineSource: directoryDiff.baselineSource || null, startedAt: new Date().toISOString(),
      limits: { maxCredits, maxRequests, freshnessDays, batchSize: options.batchSize ?? 100 },
      budgetUsed: { requestsAttempted: 0, estimatedCreditsConsumed: 0, semantics: 'CONSERVATIVE_ESTIMATE_NOT_BILLING' },
      batches: [], rows: plan.targets.map(t => ({ ...t, status: 'NOT_ATTEMPTED', validLatest: false })),
      state: 'IN_PROGRESS', complete: false,
      limitations: ['Latest observations only: no full history, adjustment, corporate-action or realtime equivalence is established.',
        'Directory-only issuer identity and ticker reuse remain unverified even for valid latest observations.',
        'All output is a private diagnostic; no protected US prices, universe membership or canonical data are changed.',
        'Inactive instruments may legitimately retain an old last candle; active listings require age <= configured freshness days.'] };
  }
  state.limits = { maxCredits, maxRequests, freshnessDays, batchSize: options.batchSize ?? 100 };
  const before = { ...state.budgetUsed };
  state.limits={maxCredits,maxRequests,freshnessDays,batchSize:options.batchSize??100};
  state.unquotedBaseline={count:directoryDiff.rows.length-plan.targets.length,reason:'NO_VERIFIED_DIRECTORY_MATCH',source:'marketstack_tiingo_us_api_diff.json'};
  summarize(state, plan); atomicWrite(outputPath, state);
  if (state.complete) return state;
  const clientFactory = options.clientFactory || Client.createMarketstackClient;
  const client = clientFactory({ maxCredits: Math.max(0, maxCredits - before.estimatedCreditsConsumed),
    maxRequests: Math.max(0, maxRequests - before.requestsAttempted), maxRetries: 1,
    timeoutMs: 30000, minIntervalMs: 300, cacheTtlMs: 0,
    onAttempt: accounting => {
      state.budgetUsed.requestsAttempted = before.requestsAttempted + accounting.requestsAttempted;
      state.budgetUsed.estimatedCreditsConsumed = before.estimatedCreditsConsumed + accounting.estimatedCreditsConsumed;
      summarize(state, plan);
      atomicWrite(outputPath, state); // reservation before fetch, including retries
    } });
  for (const batch of plan.batches) {
    if (state.batches.some(saved => saved.id === batch.id && saved.complete)) continue;
    const cost = batch.members.length;
    if (state.budgetUsed.requestsAttempted >= maxRequests || state.budgetUsed.estimatedCreditsConsumed + cost > maxCredits) {
      state.state = 'INCOMPLETE_BUDGET_EXHAUSTED'; break;
    }
    // Persist in-flight work before the request. Interruption leaves a resumable batch.
    const record = { id: batch.id, mic: batch.mic, symbols: batch.members.map(t => t.providerSymbol),
      securityIds: batch.members.map(t => t.securityId), attempted: true, complete: false, status: 'IN_FLIGHT' };
    state.batches = state.batches.filter(saved => saved.id !== batch.id); state.batches.push(record); atomicWrite(outputPath, state);
    let response;
    try { response = await client.paginate('/eod/latest', { symbols: record.symbols.join(','), exchange: batch.mic, limit: 1000 },
      { maxPages: 1, cacheTtlMs: 0 }); }
    catch (_) { response = { ok: false, reason: 'requestFailed', data: [], complete: false }; }
    const reason = response.ok ? null : safeReason(response.reason);
    const rawRows = Array.isArray(response.data) ? response.data : [];
    const requested = new Set(record.symbols), bySymbol = new Map();
    record.unrequestedSymbolRows = 0;
    for (const raw of rawRows) {
      if (!raw || !requested.has(raw.symbol)) { record.unrequestedSymbolRows++; continue; }
      const values = bySymbol.get(raw.symbol) || []; values.push(raw); bySymbol.set(raw.symbol, values);
    }
    record.complete = response.ok === true && response.complete === true && record.unrequestedSymbolRows === 0;
    record.status = record.complete ? 'RESPONSE_COMPLETE' : reason || 'RESPONSE_INCOMPLETE';
    record.providerRows = rawRows.length; record.retrievedAt = response.retrievedAt || null;
    record.providerPagination = response.pagination ? { total: response.pagination.total, count: response.pagination.count,
      offset: response.pagination.offset, limit: response.pagination.limit } : null;
    const outcomes = batch.members.map(target => {
      const values = bySymbol.get(target.providerSymbol) || [];
      const base = evaluateLatestObservation(target, null, today, freshnessDays);
      if (!record.complete) return { ...base, status: response.ok ? 'BATCH_INCOMPLETE' : 'REQUEST_FAILED',
        requestReason: record.status, providerObservationCount: values.length, validLatest: false };
      if (values.length > 1) return { ...base, status: 'DUPLICATE_LATEST', validLatest: false, providerObservationCount: values.length };
      return { ...evaluateLatestObservation(target, values[0] || null, today, freshnessDays), retrievedAt: response.retrievedAt || null };
    });
    const byId = new Map(outcomes.map(r => [r.securityId, r])); state.rows = state.rows.map(r => byId.get(r.securityId) || r);
    summarize(state, plan); atomicWrite(outputPath, state);
    if (options.onProgress) options.onProgress({ batchId: batch.id, complete: record.complete,
      symbolsAttempted: state.summary.symbolsAttempted, validLatest: state.summary.validLatest,
      requestsAttempted: state.budgetUsed.requestsAttempted, estimatedCreditsConsumed: state.budgetUsed.estimatedCreditsConsumed,
      remainingSymbols: state.summary.remainingSymbols });
    if (reason && terminal(reason)) { state.state = 'INCOMPLETE_' + reason.toUpperCase(); break; }
  }
  if (!state.complete && state.state === 'IN_PROGRESS') state.state = 'INCOMPLETE_REQUESTS_OR_RESPONSES';
  summarize(state, plan); atomicWrite(outputPath, state);
  return state;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  const diffPath = args.directory || 'reports/marketstack/marketstack_tiingo_us_api_diff.json';
  const report = await runFullUSLatest(JSON.parse(readFileSync(resolve(diffPath))), {
    outputPath: args.out, today: args.today, maxCredits: args['max-credits'] === undefined ? undefined : Number(args['max-credits']),
    maxRequests: args['max-requests'] === undefined ? undefined : Number(args['max-requests']) });
  console.log(JSON.stringify({ state: report.state, complete: report.complete, summary: report.summary, budgetUsed: report.budgetUsed }));
  if (!report.complete) process.exitCode = 2;
}
