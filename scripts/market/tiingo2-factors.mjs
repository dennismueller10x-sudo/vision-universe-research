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

export function classifyMaterializedFactorRecord(record, { publicationAllowed = false, refreshedPrice = true } = {}) {
  if (!record?.factors || Evidence.publicationViolations(record).length || !refreshedPrice) return { quantStatus: 'BLOCKED', factorDnaStatus: 'NONE', availableFactors: [], fullQuantScoreReady: false };
  const availableFactors = Evidence.FACTOR_ORDER.filter((id) => record.factors[id]?.state === 'AVAILABLE');
  const factorDnaStatus = availableFactors.length === Evidence.FACTOR_ORDER.length ? 'FULL' : availableFactors.length ? 'PARTIAL' : 'NONE';
  const technicalOnly = availableFactors.length && availableFactors.every((id) => ['momentum', 'risk'].includes(id));
  return { quantStatus: publicationAllowed && factorDnaStatus === 'FULL' ? 'QUANT_FULL' : technicalOnly ? 'TECHNICAL_ONLY' : availableFactors.length ? 'PARTIAL' : 'BLOCKED', factorDnaStatus, availableFactors, fullQuantScoreReady: publicationAllowed && factorDnaStatus === 'FULL' };
}

export async function materializeFactors({ root, tickers, marketStoreDir, privateDir, asOf, onProgress = () => {}, rebuildTaxonomy = true }) {
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
  const broad = read(factorsPath), rows = new Map((broad.securities ?? []).map((row) => [row.securityId, row]));
  for (const row of scoped.securities ?? []) {
    const previous = rows.get(row.securityId);
    if (previous && previous.ticker !== row.ticker) throw new Error('CANONICAL_FACTOR_SECURITY_ID_COLLISION');
    rows.set(row.securityId, row);
  }
  broad.securities = [...rows.values()];
  broad.tiingo2Incremental = { asOf, requested: scope, updated: (scoped.securities ?? []).map((row) => row.ticker), source: 'EXISTING_MARKET_FACTOR_PRODUCER', canonicalIdsPreserved: true };
  write(factorsPath, broad);
  if (rebuildTaxonomy) await command('scripts/quant/build-sic-peer-taxonomy.mjs');
  await command('scripts/quant/build-factor-evidence.mjs');
  const contract = read(join(root, 'quant/methodology/quant-v2.json'));
  const refreshed = new Set((scoped.securities ?? []).map((row) => row.ticker));
  const marketRows = new Map((scoped.securities ?? []).map((row) => [row.ticker, row]));
  const summary = read(join(factorDir, 'factors-TIINGO2_SCOPE-summary.json'));
  const result = { schemaVersion: 'tiingo2-factor-materialization-1.0.0', asOf, scope, source: 'EXISTING_CANONICAL_FACTOR_PRODUCERS', fullQuantScore: { allowed: contract.publication.allowed, reason: contract.publication.reason }, rows: [], counts: {}, producerSummary: summary.coverage ?? null, canonicalProductionWrites: 0 };
  for (const ticker of scope) {
    const artifactPath = 'quant/data/product/factor-evidence-v1/' + Company.shardKey(ticker) + '.json.gz';
    let record = null, artifact = null, bytes = null;
    if (existsSync(join(root, artifactPath))) {
      bytes = readFileSync(join(root, artifactPath)); artifact = JSON.parse(gunzipSync(bytes));
      if (!Evidence.validShard(artifact, Company.shardKey(ticker))) throw new Error('INVALID_CANONICAL_FACTOR_EVIDENCE_SHARD');
      record = artifact.securities?.[ticker] ?? null;
    }
    const readiness = classifyMaterializedFactorRecord(record, { publicationAllowed: contract.publication.allowed === true, refreshedPrice: refreshed.has(ticker) });
    const market = marketRows.get(ticker);
    const proof = record && readiness.availableFactors.length ? { state: 'MATERIALIZED', verified: true, artifactPath, artifactSha256: sha(bytes), schemaVersion: artifact.schemaVersion, methodologyVersion: artifact.methodologyVersion, ticker, securityId: record.securityId, asOf: record.asOf } : { state: 'NOT_MATERIALIZED', verified: false, artifactSha256: null };
    result.rows.push({ ticker, securityId: byTicker.get(ticker).securityId, ...readiness, refreshedPrice: refreshed.has(ticker), bars: record?.bars ?? market?.bars ?? null, canonicalEvidence: proof, factorStates: Object.fromEntries(Evidence.FACTOR_ORDER.map((id) => [id, record?.factors?.[id] ? { state: record.factors[id].state, reason: record.factors[id].reason ?? null, componentStates: (record.factors[id].components ?? []).map((component) => ({ id: component.id, state: component.state, reason: component.reason ?? null })) } : { state: 'UNAVAILABLE', reason: 'INPUT_NOT_MATERIALIZED' }])), marketFieldStatus: market?.fieldStatus ?? null, benchmark: scoped.benchmark, productQuantReady: proof.verified === true, fullQuantScoreState: contract.publication.allowed ? 'METHODOLOGY_ALLOWED' : 'BLOCKED_BY_EXISTING_METHODOLOGY' });
  }
  for (const state of ['QUANT_FULL', 'TECHNICAL_ONLY', 'PARTIAL', 'BLOCKED']) result.counts[state] = result.rows.filter((row) => row.quantStatus === state).length;
  const reportPath = join(privateDir, 'factors-report.json'); write(reportPath, result);
  result.reportPath = reportPath; result.reportSha256 = sha(readFileSync(reportPath)); return result;
}
