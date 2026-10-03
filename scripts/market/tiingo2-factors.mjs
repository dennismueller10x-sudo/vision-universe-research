/* Uses the existing market-factor, SIC peer and Factor DNA producers in an
 * isolated canonical shadow. Scoped price calculations are merged into the
 * existing broad peer context; no composite Quant score is enabled. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { assertShadowRoot, runExistingProcess } from './tiingo2-fundamentals.mjs';
import { resolveProductUniverse } from './universe-source.mjs';
const require = createRequire(import.meta.url);
const Company = require('../../quant/engines/company-master.js');
const Evidence = require('../../quant/engines/factor-evidence.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(readFileSync(file));
const write = (file, data) => { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); };
const WITHHELD_FIELD_PROXY = { sma20: 'priceAboveSMA20', sma50: 'priceAboveSMA50', sma100: 'priceAboveSMA100',
  sma200: 'priceAboveSMA200', high52w: 'distanceTo52wHigh', low52w: 'distanceTo52wLow' };

export function factorCoverageFromRows(securities, skipped) {
  const fieldCoverage = {}, skippedByReason = {};
  for (const row of skipped) skippedByReason[row.reason] = (skippedByReason[row.reason] ?? 0) + 1;
  for (const row of securities) {
    for (const [name, raw] of Object.entries(row.fieldStatus ?? {})) {
      const statuses = raw && typeof raw === 'object' ? Object.entries(raw).map(([key, status]) => [name + '.' + key, status]) : [[name, raw]];
      for (let [field, status] of statuses) {
        if (status === 'WITHHELD_REDISTRIBUTION') status = row.fieldStatus[WITHHELD_FIELD_PROXY[field]];
        if (!['CALCULATED', 'INSUFFICIENT_HISTORY', 'SOURCE_MISSING', 'NOT_APPLICABLE'].includes(status)) throw Error('FACTOR_COVERAGE_STATUS_UNRESOLVED:' + field);
        const counts = fieldCoverage[field] ??= { CALCULATED: 0, INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0, NOT_APPLICABLE: 0 };
        counts[status]++;
      }
    }
  }
  return { requested: securities.length + skipped.length, computed: securities.length, skipped: skipped.length, skippedByReason, fieldCoverage };
}

export function mergeScopedMarketFactors(broad, scoped, { asOf }) {
  const before = factorCoverageFromRows(broad.securities ?? [], broad.skipped ?? []);
  if (JSON.stringify(before) !== JSON.stringify(broad.coverage)) throw Error('FACTOR_BASELINE_COVERAGE_NOT_REPRODUCED');
  const rows = new Map((broad.securities ?? []).map(row => [row.securityId, row]));
  const materialized = new Set();
  for (const row of scoped.securities ?? []) {
    const previous = rows.get(row.securityId);
    if (!row.securityId || !row.ticker || previous && previous.ticker !== row.ticker || materialized.has(row.ticker)) throw Error('CANONICAL_FACTOR_SECURITY_ID_COLLISION');
    rows.set(row.securityId, row); materialized.add(row.ticker);
  }
  const skipped = (broad.skipped ?? []).filter(row => !materialized.has(row.ticker));
  const securities = [...rows.values()];
  if (new Set(securities.map(row => row.ticker)).size !== securities.length ||
      skipped.some(row => materialized.has(row.ticker))) throw Error('FACTOR_MATERIALIZED_AND_SKIPPED_COLLISION');
  const coverage = factorCoverageFromRows(securities, skipped);
  return { ...broad, securities, skipped, coverage,
    tiingo2Incremental: { asOf, requested: [...new Set((scoped.securities ?? []).map(row => row.ticker))].sort(),
      updated: [...materialized].sort(), source: 'EXISTING_MARKET_FACTOR_PRODUCER', canonicalIdsPreserved: true,
      priorCoverage: { requested: before.requested, computed: before.computed, skipped: before.skipped } } };
}

export function classifyMaterializedFactorRecord(record, { publicationAllowed = false, refreshedPrice = true, expectedSecurityId, expectedTicker, expectedAsOf } = {}) {
  if (!record?.factors || Evidence.publicationViolations(record).length || !refreshedPrice) return { quantStatus: 'BLOCKED', factorDnaStatus: 'NONE', availableFactors: [], fullQuantScoreReady: false };
  if ((expectedSecurityId && record.securityId !== expectedSecurityId) || (expectedTicker && record.ticker !== expectedTicker) || (expectedAsOf && record.asOf !== expectedAsOf)) return { quantStatus: 'BLOCKED', factorDnaStatus: 'NONE', availableFactors: [], fullQuantScoreReady: false, reason: 'CANONICAL_FACTOR_BINDING_MISMATCH' };
  const availableFactors = Evidence.FACTOR_ORDER.filter((id) => record.factors[id]?.state === 'AVAILABLE');
  if (availableFactors.some((id) => record.factors[id].score < 0 || record.factors[id].score > 100)) return { quantStatus: 'BLOCKED', factorDnaStatus: 'NONE', availableFactors: [], fullQuantScoreReady: false, reason: 'CANONICAL_FACTOR_SCORE_OUT_OF_RANGE' };
  const factorDnaStatus = availableFactors.length === Evidence.FACTOR_ORDER.length ? 'FULL' : availableFactors.length ? 'PARTIAL' : 'NONE';
  const technicalOnly = availableFactors.length && availableFactors.every((id) => ['momentum', 'risk'].includes(id));
  return { quantStatus: publicationAllowed && factorDnaStatus === 'FULL' ? 'QUANT_FULL' : technicalOnly ? 'TECHNICAL_ONLY' : availableFactors.length ? 'PARTIAL' : 'BLOCKED', factorDnaStatus, availableFactors, fullQuantScoreReady: publicationAllowed && factorDnaStatus === 'FULL' };
}

export async function materializeFactors({ root, tickers, marketStoreDir, privateDir, asOf, onProgress = () => {}, rebuildTaxonomy = true, deferCanonicalEvidence = false }) {
  root = assertShadowRoot(root); privateDir = resolve(privateDir); marketStoreDir = resolve(marketStoreDir ?? join(root, '.market-cache'));
  const scope = [...new Set(tickers.map((ticker) => String(ticker).toUpperCase()))].sort();
  if (!scope.length || scope.some((ticker) => !/^[A-Z0-9._-]+$/.test(ticker))) throw new Error('INVALID_FACTOR_SCOPE');
  const universe = resolveProductUniverse(root), byTicker = new Map(universe.securities.map((row) => [row.ticker, row]));
  const securities = scope.map((ticker) => { const row = byTicker.get(ticker); if (!row) throw new Error('CANONICAL_MEMBER_REQUIRED:' + ticker); return row; });
  const scaleDir = join(privateDir, 'scale'), factorDir = join(privateDir, 'market-factors');
  write(join(scaleDir, 'universe-TIINGO2_SCOPE.json'), { gate: 'TIINGO2_SCOPE', universeSource: 'SECURITY_MASTER', universeFile: universe.file, securities });
  const command = async (script, args = []) => {
    const result = await runExistingProcess(process.execPath, [join(root, script), ...args], { cwd: root, onProgress });
    if (result.code !== 0) throw new Error('EXISTING_FACTOR_PRODUCER_FAILED:' + script + ':' + result.output.slice(-3000));
  };
  await command('scripts/market/build-market-factors.mjs', ['--gate', 'TIINGO2_SCOPE', '--scale-dir', scaleDir, '--out', factorDir, '--work-dir', marketStoreDir, '--benchmark', 'SPY']);
  const scoped = read(join(factorDir, 'factors-TIINGO2_SCOPE.json'));
  const factorsPath = join(root, 'quant/data/market/factors/factors-FULL_UNIVERSE.json');
  const broad = mergeScopedMarketFactors(read(factorsPath), scoped, { asOf });
  write(factorsPath, broad);
  const broadSummaryPath = join(root, 'quant/data/market/factors/factors-FULL_UNIVERSE-summary.json');
  const broadSummary = read(broadSummaryPath);
  broadSummary.coverage = broad.coverage; broadSummary.skipped = broad.skipped;
  if (broadSummary.detail?.location === 'repository') broadSummary.detail.symbols = broad.securities.length;
  broadSummary.canary = (broadSummary.canary ?? []).map(row => broad.securities.find(current => current.securityId === row.securityId) ?? row);
  broadSummary.tiingo2Incremental = broad.tiingo2Incremental;
  write(broadSummaryPath, broadSummary);
  if (rebuildTaxonomy) await command('scripts/quant/build-sic-peer-taxonomy.mjs');
  if (!deferCanonicalEvidence) await command('scripts/quant/build-factor-evidence.mjs');
  const contract = read(join(root, 'quant/methodology/quant-v2.json'));
  const refreshed = new Set((scoped.securities ?? []).map((row) => row.ticker));
  const summary = read(join(factorDir, 'factors-TIINGO2_SCOPE-summary.json'));
  const result = { schemaVersion: 'tiingo2-factor-materialization-1.0.0', asOf, scope, source: 'EXISTING_CANONICAL_FACTOR_PRODUCERS', fullQuantScore: { allowed: contract.publication.allowed, reason: contract.publication.reason }, rows: [], counts: {}, producerSummary: summary.coverage ?? null, canonicalProductionWrites: 0 };
  result.rows=scope.map(ticker=>({ticker,securityId:byTicker.get(ticker).securityId,refreshedPrice:refreshed.has(ticker),benchmark:scoped.benchmark}));
  result.reportPath=join(privateDir,'factors-report.json');
  return assessMaterializedFactorReadiness({root,report:result,deferred:deferCanonicalEvidence});
}

/** Re-read the actual canonical shards after their existing producer has
 * consumed current technical quotes. No factor engine or price rebuild here. */
export function refreshMaterializedFactorReadiness({root,report}){
  root=assertShadowRoot(root);
  return assessMaterializedFactorReadiness({root,report,deferred:false});
}

function assessMaterializedFactorReadiness({root,report,deferred}){
  const contract=read(join(root,'quant/methodology/quant-v2.json'));
  const byTicker=new Map(resolveProductUniverse(root).securities.map(row=>[row.ticker,row]));
  const marketRows=new Map(read(join(root,'quant/data/market/factors/factors-FULL_UNIVERSE.json')).securities.map(row=>[row.securityId,row]));
  const result={...report,rows:[],counts:{},fullQuantScore:{allowed:contract.publication.allowed,reason:contract.publication.reason}};
  const reportPath=report.reportPath;delete result.reportPath;delete result.reportSha256;delete result.canonicalEvidenceDeferred;
  if(deferred)result.canonicalEvidenceDeferred=true;
  if(new Set(report.rows.map(row=>row.ticker)).size!==report.scope.length||report.rows.length!==report.scope.length)throw Error('INVALID_FACTOR_READINESS_SCOPE');
  for(const prior of report.rows){
    const ticker=prior.ticker,member=byTicker.get(ticker);
    if(!report.scope.includes(ticker)||!member||member.securityId!==prior.securityId)throw Error('CANONICAL_FACTOR_REPORT_IDENTITY_CHANGED:'+ticker);
    const artifactPath = 'quant/data/product/factor-evidence-v1/' + Company.shardKey(ticker) + '.json.gz';
    let record = null, artifact = null, bytes = null;
    if (!deferred && existsSync(join(root, artifactPath))) {
      bytes = readFileSync(join(root, artifactPath)); artifact = JSON.parse(gunzipSync(bytes));
      if (!Evidence.validShard(artifact, Company.shardKey(ticker))) throw new Error('INVALID_CANONICAL_FACTOR_EVIDENCE_SHARD');
      record = artifact.securities?.[ticker] ?? null;
    }
    const market = marketRows.get(prior.securityId);
    if(market&&market.ticker!==ticker)throw Error('CANONICAL_FACTOR_MARKET_IDENTITY_CHANGED:'+ticker);
    const readiness = classifyMaterializedFactorRecord(record, { publicationAllowed: contract.publication.allowed === true, refreshedPrice: prior.refreshedPrice===true&&!!market, expectedSecurityId: member.securityId, expectedTicker: ticker, expectedAsOf: market?.asOf });
    const proof = record && readiness.availableFactors.length ? { state: 'MATERIALIZED', verified: true, artifactPath, artifactSha256: sha(bytes), schemaVersion: artifact.schemaVersion, methodologyVersion: artifact.methodologyVersion, ticker, securityId: record.securityId, asOf: record.asOf } : { state: deferred?'DEFERRED':'NOT_MATERIALIZED', verified: false, artifactSha256: null };
    const base={...prior};delete base.reason;
    result.rows.push({ ...base, ...readiness, ...(deferred?{reason:'AWAITING_FRESH_TECHNICAL_PROJECTIONS'}:{}), bars: record?.bars ?? market?.bars ?? null, canonicalEvidence: proof, factorStates: Object.fromEntries(Evidence.FACTOR_ORDER.map((id) => [id, record?.factors?.[id] ? { state: record.factors[id].state, reason: record.factors[id].reason ?? null, componentStates: (record.factors[id].components ?? []).map((component) => ({ id: component.id, state: component.state, reason: component.reason ?? null })) } : { state: 'UNAVAILABLE', reason: 'INPUT_NOT_MATERIALIZED' }])), marketFieldStatus: market?.fieldStatus ?? null, productQuantReady: proof.verified === true, fullQuantScoreState: contract.publication.allowed ? 'METHODOLOGY_ALLOWED' : 'BLOCKED_BY_EXISTING_METHODOLOGY' });
  }
  for (const state of ['QUANT_FULL', 'TECHNICAL_ONLY', 'PARTIAL', 'BLOCKED']) result.counts[state] = result.rows.filter((row) => row.quantStatus === state).length;
  write(reportPath, result);
  result.reportPath = reportPath; result.reportSha256 = sha(readFileSync(reportPath)); return result;
}
