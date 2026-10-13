/** Second authenticated evidence phase. Native ticker strings are lookup hypotheses,
 * never listing aliases until fresh exact ISIN/MIC metadata proves the same security. */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {createEuropeBudget, estimateEuropeBatch} from './europe-credits.mjs';
import {privateRoot} from './europe-ingestion.mjs';
import {validateLivePlan, verifiedMetadata, validateHistoryResult} from './europe-live-revalidation.mjs';

const require = createRequire(import.meta.url), {createAuditAdapter} = require('../../providers/marketstack/audit-adapter.js');
const hash = value => createHash('sha256').update(value).digest('hex');
export const NATIVE_PRIOR_ANCHOR = Object.freeze({runId: '38406637090',
  sourceCommit: '6251f8a61d2f53886943466c415658c31ffb26c7',
  summarySha256: '77d1f2dd11fd43f53870ad900289bee408778e3bc0a851fd89fe7e8952bff735',
  planFileSha256: '73b227e9a897c91a086f4983f6dd4d799c627d01acf8b1e3529473a53e97d522',
  planSha256: 'b54ad8770246a93954e0bd5f471f3e74e86594bcdfc565700cfdf3f8ca963875',
  requests: 8828, credits: 8828});
export const NATIVE_TARGET_REMAINING = 4172, NATIVE_HARD_REMAINING = 7172;
const suffixByMic = Object.freeze({XETR: '.DE', XPAR: '.PA', XAMS: '.AS', XSWX: '.SW', XCSE: '.CO',
  XWBO: '.VI', XMAD: '.MC', XMIL: '.MI', XBRU: '.BR', XSTO: '.ST'});
const fatal = new Set(['authError', 'quotaExceeded', 'budgetExceeded', 'EUROPE_RUN_BUDGET_EXCEEDED',
  'responsePersistenceFailed', 'accountingPersistenceFailed', 'budgetReservationFailed']);
function canonicalListing(row) {
  return {securityId: row.securityId, listingId: row.listingId, providerTicker: row.symbol,
    mic: row.mic, currency: row.currency, isin: row.isin};
}
export function nativeTickerHypothesis(row) {
  const suffix = suffixByMic[row.mic];
  if (!suffix || typeof row.symbol !== 'string' || !row.symbol.endsWith(suffix)) return null;
  const candidate = row.symbol.slice(0, -suffix.length);
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(candidate)) return null;
  return {symbol: candidate, namespaceSuffix: suffix, requestedMic: row.mic,
    basis: 'UNVERIFIED_PROVIDER_NAMESPACE_LOOKUP_HYPOTHESIS',
    sameSecurityVerified: false, permitsHistoryRequest: false};
}
export function validateNativePhase(plan, priorRun) {
  validateLivePlan(plan);
  if (!priorRun || Object.entries(NATIVE_PRIOR_ANCHOR).some(([key, value]) => priorRun[key] !== value) ||
      hash(JSON.stringify(plan)) !== NATIVE_PRIOR_ANCHOR.planSha256 ||
      hash(JSON.stringify(priorRun.sourceBindings)) !== hash(JSON.stringify(plan.sourceBindings)))
    throw Error('NATIVE_PHASE_PINNED_PREVIOUS_RUN_REQUIRED');
  const rows = plan.listings.map(row => ({row, hypothesis: nativeTickerHypothesis(row)}));
  const operations = rows.flatMap(({row, hypothesis}) => !hypothesis ? [] : [
    {endpoint: '/tickers/' + hypothesis.symbol, params: {}, pages: 1},
    ...row.windows.map(window => ({endpoint: '/eod', params: {symbols: hypothesis.symbol}, pages: window.maxPages ?? 1}))]);
  const {operations: details, ...estimate} = estimateEuropeBatch(operations);
  if (estimate.credits > NATIVE_TARGET_REMAINING || priorRun.credits + estimate.credits > 13000 ||
      priorRun.credits + NATIVE_HARD_REMAINING !== 16000) throw Error('NATIVE_PHASE_CUMULATIVE_BUDGET_EXCEEDED');
  return {...estimate, securities: 449, metadataHypotheses: rows.filter(row => row.hypothesis).length,
    cumulativeWorstCaseCredits: priorRun.credits + estimate.credits,
    cumulativeTargetCredits: 13000, cumulativeHardCap: 16000};
}

export async function collectNativeAliasRevalidation({plan, priorRun, out,
  apiKey = process.env.MARKETSTACK_API_KEY, fetchImpl, sleep, log = row => console.log(JSON.stringify(row))} = {}) {
  const planned = validateNativePhase(plan, priorRun);
  if (!apiKey || typeof apiKey !== 'string') throw Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
  out = privateRoot(out); mkdirSync(out, {recursive: true, mode: 0o700});
  if (existsSync(join(out, 'credits.json')) || existsSync(join(out, 'summary.json'))) throw Error('NATIVE_PHASE_REENTRY_REFUSED');
  const budget = createEuropeBudget(join(out, 'credits.json'), {runId: 'europe-native-alias-followup-38406637090',
    targetCredits: NATIVE_TARGET_REMAINING, hardCap: NATIVE_HARD_REMAINING, maxCredits: NATIVE_TARGET_REMAINING});
  for (const name of ['raw', 'normalized']) mkdirSync(join(out, name), {mode: 0o700});
  const manifest = [], results = [], states = new Map(); let sequence = 900000, terminalReason = null;
  const write = (path, value) => writeFileSync(join(out, path), JSON.stringify(value) + '\n', {mode: 0o600});
  const gzipWrite = (path, text) => {
    const bytes = Buffer.from(text), compressed = gzipSync(bytes, {level: 6});
    writeFileSync(join(out, path), compressed, {flag: 'wx', mode: 0o600});
    return {path, codec: 'gzip', sha256: hash(bytes), bytes: bytes.length,
      compressedSha256: hash(compressed), compressedBytes: compressed.length};
  };
  const api = createAuditAdapter({apiKey, fetchImpl, sleep, sharedBudget: budget,
    maxRequests: NATIVE_TARGET_REMAINING, maxCredits: NATIVE_TARGET_REMAINING, maxRetries: 0,
    timeoutMs: 90000, minIntervalMs: fetchImpl ? 0 : 250, cacheTtlMs: 0,
    onResponse: async response => {
      const id = String(++sequence), binding = gzipWrite('raw/' + id + '.json.gz', response.rawText);
      const {rawText, body, ...rest} = response, meta = {...rest, id, ...binding};
      manifest.push(meta); write('raw/' + id + '.meta.json', meta);
      if (manifest.length % 25 === 0) write('raw-manifest.json', manifest);
    }});
  function estimateOperation(operation) {
    return {endpoint: operation.kind === 'metadata' ? '/tickers/' + operation.symbol : '/eod',
      params: operation.kind === 'metadata' ? {} : {symbols: operation.querySymbol}, pages: operation.maxPages ?? 1};
  }
  async function execute(operation) {
    const ordinal = 900000 + results.length, before = manifest.length; let result;
    if (terminalReason) result = {ok: false, complete: false, skipped: true, reason: terminalReason};
    else {
      try {
        budget.estimateBatch([estimateOperation(operation)]);
        if (operation.kind === 'metadata') result = await api.getTicker(operation.symbol);
        else {
          const queried = {...operation.listing, providerTicker: operation.querySymbol};
          result = validateHistoryResult(await api.getHistoricalEOD(queried, {from: operation.from,
            to: operation.to, limit: 1000, maxPages: operation.maxPages}), operation);
        }
      } catch (error) {
        result = {ok: false, complete: false, reason: error.code === 'EUROPE_BATCH_EXCEEDS_BUDGET' ? error.code : 'NATIVE_OPERATION_FAILED'};
      } finally {api.client.clearCache();}
    }
    if (fatal.has(result.reason) || String(result.reason).startsWith('LEDGER_')) terminalReason = result.reason;
    const {raw, rawPages, ...compact} = result;
    if (compact.observations) delete compact.data;
    const entry = {ordinal, operation, responseIds: manifest.slice(before).map(row => row.id), result: compact};
    const binding = gzipWrite('normalized/' + String(ordinal) + '.json.gz', JSON.stringify(entry) + '\n');
    const row = {ordinal, operation, responseIds: entry.responseIds, resultPath: binding.path,
      normalizedSha256: binding.sha256, normalizedCompressedSha256: binding.compressedSha256,
      codec: 'gzip', normalizedBytes: binding.bytes, compressedBytes: binding.compressedBytes,
      ok: result.ok === true, complete: result.complete === true, reason: result.reason ?? null,
      status: result.status ?? null, skipped: result.skipped === true,
      downloadedCount: result.data?.length ?? result.observations?.length ?? null};
    results.push(row); if (results.length % 25 === 0) write('result-manifest.json', results);
    return {result, entry: row};
  }
  function batchLog(phase, operations) {
    const {operations: details, ...estimate} = estimateEuropeBatch(operations.map(estimateOperation)), state = budget.status();
    log({phase, estimate, requests: state.requests, reservedCredits: state.estimatedCredits,
      cumulativeRequests: priorRun.requests + state.requests, cumulativeReservedCredits: priorRun.credits + state.estimatedCredits,
      remainingTarget: budget.status().remainingCredits, remainingHardCap: 16000 - priorRun.credits - state.estimatedCredits,
      titlesFinished: [...states.values()].filter(row => row.finished).length, titlesOpen: 449 - [...states.values()].filter(row => row.finished).length});
  }
  try {
    const metadataOperations = [];
    for (const row of plan.listings) {
      const hypothesis = nativeTickerHypothesis(row);
      states.set(row.securityId, {securityId: row.securityId, listingId: row.listingId, hypothesis,
        metadataMatched: false, status: hypothesis ? 'METADATA_NOT_PROBED' : 'NO_SAFE_NAMESPACE_LOOKUP_HYPOTHESIS',
        primaryWindows: row.windows.length, historyProbes: 0, finished: !hypothesis});
      if (hypothesis) metadataOperations.push({kind: 'metadata', listing: canonicalListing(row),
        symbol: hypothesis.symbol, variant: 'ALIAS_METADATA', maxPages: 1, nativeLookupHypothesis: hypothesis});
    }
    for (let i = 0; i < metadataOperations.length; i += 25) {
      const batch = metadataOperations.slice(i, i + 25); batchLog('NATIVE_METADATA_BATCH', batch);
      for (const operation of batch) {
        const {result, entry} = await execute(operation), state = states.get(operation.listing.securityId);
        state.metadataMatched = verifiedMetadata(result, operation.listing, operation.symbol);
        state.metadataEvidence = {normalizedSha256: entry.normalizedSha256, responseIds: entry.responseIds};
        state.status = state.metadataMatched ? 'FRESH_EXACT_ISIN_MIC_NATIVE_ALIAS_VERIFIED' :
          result.ok ? 'NATIVE_METADATA_IDENTITY_UNVERIFIED' : 'NATIVE_METADATA_NOT_AVAILABLE';
        if (!state.metadataMatched) state.finished = true;
      }
    }
    const histories = plan.listings.flatMap(row => {
      const state = states.get(row.securityId);
      if (!state.metadataMatched) return [];
      return row.windows.map(window => ({kind: 'history', listing: canonicalListing(row), ...window,
        maxPages: window.maxPages ?? 1, variant: 'VERIFIED_ALIAS', querySymbol: state.hypothesis.symbol,
        nativeAliasMetadataEvidence: state.metadataEvidence, nativeAliasIdentityVerified: true}));
    });
    for (let i = 0; i < histories.length; i += 25) {
      const batch = histories.slice(i, i + 25); batchLog('NATIVE_HISTORY_BATCH', batch);
      for (const operation of batch) {
        const {result} = await execute(operation), state = states.get(operation.listing.securityId);
        state.historyProbes++; if (!result.ok || !result.complete) state.status = 'NATIVE_HISTORY_ERROR_OR_INCOMPLETE';
      }
    }
    for (const state of states.values()) state.finished = true;
    const status = budget.status(), summary = {schema: 'vu-europe-live-revalidation-1', phase: 'NATIVE_ALIAS_FOLLOWUP',
      generatedAt: new Date().toISOString(), sourceBindings: plan.sourceBindings, planSha256: hash(JSON.stringify(plan)),
      executionSourceCommit: process.env.GITHUB_SHA ?? null, priorRun, planned, budget: status,
      cumulativeAccounting: {priorRequests: priorRun.requests, priorReservedCredits: priorRun.credits,
        additionalRequests: status.requests, additionalReservedCredits: status.estimatedCredits,
        requests: priorRun.requests + status.requests, reservedCredits: priorRun.credits + status.estimatedCredits,
        targetCredits: 13000, hardCap: 16000, targetRemaining: 13000 - priorRun.credits - status.estimatedCredits,
        hardRemaining: 16000 - priorRun.credits - status.estimatedCredits, actualBilledCredits: 'UNKNOWN'},
      all449Included: true, listings: [...states.values()], results, rawResponses: manifest.length,
      terminalReason, transport: api.client.stats(), productionWrites: 0, analyticalGatesChanged: false,
      scheduleEnabled: false, publication: 'PRIVATE_EVIDENCE_ONLY', actualBilledCredits: 'UNKNOWN'};
    write('summary.json', summary); batchLog('NATIVE_COLLECTION_COMPLETE', []); return summary;
  } finally {write('raw-manifest.json', manifest); write('result-manifest.json', results); budget.close();}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const argument = process.argv[i], split = argument.indexOf('='), key = split < 0 ? argument : argument.slice(0, split);
    const value = split < 0 ? process.argv[++i] : argument.slice(split + 1);
    if (!['--plan', '--anchor', '--out'].includes(key) || !value || args[key]) throw Error('INVALID_NATIVE_CLI_ARGUMENT');
    args[key] = value;
  }
  if (!args['--plan'] || !args['--anchor'] || !args['--out']) throw Error('NATIVE_PLAN_ANCHOR_PRIVATE_OUTPUT_REQUIRED');
  const bytes = readFileSync(args['--plan']);
  if (hash(bytes) !== NATIVE_PRIOR_ANCHOR.planFileSha256) throw Error('NATIVE_ORIGINAL_PLAN_FILE_HASH_REQUIRED');
  await collectNativeAliasRevalidation({plan: JSON.parse(bytes), priorRun: JSON.parse(readFileSync(args['--anchor'])), out: args['--out']});
}
