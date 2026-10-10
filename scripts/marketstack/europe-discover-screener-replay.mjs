/** Private source-bound replay of existing Screener/Core and central logo consumers. */
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateReplayRoot } from './europe-private-files.mjs';
import { readCentralLogoRegistry, buildEuropeCompanyLogoEvidence, buildEuropeLogoReadiness } from './europe-company-logos.mjs';
const require = createRequire(import.meta.url), Screener = require('../../screener/europe-readiness.js');
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
function sourceBytes(ref) {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256 || '')) throw Error('PINNED_PRIVATE_INPUT_REQUIRED');
  const path = privateReplayRoot(ref.path), stat = lstatSync(path);
  if (!stat.isFile()) throw Error('REGULAR_PRIVATE_INPUT_REQUIRED');
  const bytes = readFileSync(path); if (hash(bytes) !== ref.sha256) throw Error('PRIVATE_INPUT_SHA_MISMATCH');
  return bytes;
}
function pinnedObject(ref, supplied) {
  let parsed = JSON.parse(sourceBytes(ref));
  for (const key of ref.selector ? ref.selector.split('.') : []) {
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(parsed, key)) throw Error('INVALID_PRIVATE_INPUT_SELECTOR');
    parsed = parsed[key];
  }
  if (stable(parsed) !== stable(supplied)) throw Error('UNBOUND_PRIVATE_INPUT_OBJECT');
}
function legalIssuerEvidence(row) {
  const source = (row.evidence || []).find(e => String(e.kind).toUpperCase() === 'GLEIF');
  if (!source || !row.companyId?.startsWith('LEI:') || source.queryIsin !== row.isin || source.httpStatus !== 200 ||
    row.admissionProof?.issuerBinding !== 'VERIFIED_LEGAL_ISSUER' ||
    !(row.admissionProof.evidenceRefs || []).some(ref => ref.kind === 'OFFICIAL_LEGAL_ISSUER' && ref.verified === true && ref.sha256 === source.sha256)) return null;
  try {
    const url = new URL(source.url); if (url.hostname !== 'api.gleif.org' || url.searchParams.get('filter[isin]') !== row.isin) return null;
    const data = JSON.parse(sourceBytes(source)), lei = row.companyId.slice(4);
    const matches = (data.data || []).filter(r => r.id === lei && r.attributes?.lei === lei &&
      r.attributes?.entity?.legalName?.name === row.legalName && r.attributes?.entity?.jurisdiction === row.issuerCountry);
    if (matches.length !== 1) return null;
    return { verified: true, lei, isin: row.isin, issuerName: row.legalName, issuerCountry: row.issuerCountry,
      legalJurisdiction: row.issuerCountry, provenance: { gleif: source } };
  } catch { return null; }
}
export function buildDiscoverLogoUniverse(identity, catalog, generatedAt) {
  if (identity?.publicationAllowed !== false || !['PRIVATE_RESEARCH', 'PRIVATE_DISCOVERY'].includes(identity.mode)) throw Error('PRIVATE_IDENTITY_REQUIRED');
  const ids = new Set((catalog.securities || []).map(s => s.securityId)), listings = [], seen = new Set();
  for (const row of identity.listings || []) {
    if (!ids.has(row.securityId) || seen.has(row.securityId)) continue;
    seen.add(row.securityId);
    const proof = legalIssuerEvidence(row);
    listings.push({ status: 'ACCEPTED', securityId: row.securityId, companyKey: row.companyId,
      issuerCountry: row.issuerCountry, name: row.displayName || row.issuerName || row.providerSymbol,
      symbol: row.providerSymbol, identityEvidence: proof ? [proof] : [] });
  }
  return { generatedAt, mode: 'PRIVATE_RESEARCH', publicationAllowed: false, listings };
}
export async function compileEuropeDiscoverScreenerReplay({ catalog, identityUniverse, contract, sourceInputs,
  generatedAt, repositoryRoot = repository, getUSCallCount }) {
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) throw Error('EXPLICIT_EVALUATION_TIME_REQUIRED');
  pinnedObject(sourceInputs?.catalog, catalog); pinnedObject(sourceInputs?.identity, identityUniverse);
  const usBefore = typeof getUSCallCount === 'function' ? getUSCallCount() : null;
  if (usBefore !== null && (!Number.isInteger(usBefore) || usBefore < 0)) throw Error('INVALID_US_SENTINEL_COUNT');
  const registry = readCentralLogoRegistry(repositoryRoot), ids = (catalog.securities || []).map(s => s.securityId);
  if (new Set(ids).size !== ids.length) throw Error('DUPLICATE_CATALOG_CANONICAL_ID');
  const logoUniverse = buildDiscoverLogoUniverse(identityUniverse, catalog, generatedAt);
  const logoEvidence = buildEuropeCompanyLogoEvidence(logoUniverse, registry, { generatedAt });
  logoEvidence.universeSource = { ...sourceInputs.identity, catalog: sourceInputs.catalog };
  const logoReadiness = buildEuropeLogoReadiness(logoEvidence), logoRows = new Map(logoReadiness.rows.map(r => [r.securityId, r]));
  for (const security of catalog.securities || []) if (!logoRows.has(security.securityId)) logoRows.set(security.securityId, {
    securityId: security.securityId, companyId: security.companyId, status: 'LOGO_FALLBACK', reason: 'NO_VERIFIED_CURRENT_LEGAL_ISSUER_LOGO_BINDING',
    centralKey: null, asset: null, blocksIdentity: false, fallbackInitial: Array.from(security.name || '?')[0] });
  const calls = {}, counted = { ...contract };
  for (const method of ['getReadiness', 'getBaseScreenerRow', 'getTechnicalData', 'getPriceSeries']) {
    if (typeof contract?.[method] !== 'function') throw Error('ADDITIVE_CORE_CONTRACT_REQUIRED');
    counted[method] = async (ref, ...args) => {
      if (ref?.region !== 'EUROPE' || !ids.includes(ref.securityId)) throw Error('REPLAY_NON_EUROPE_OR_FOREIGN_CANONICAL_REF');
      calls[method] = (calls[method] || 0) + 1; return contract[method](ref, ...args);
    };
  }
  const adapter = Screener.create({ enabled: true, audience: 'research', privateResearch: true, contract: counted, securityIds: ids });
  await adapter.load();
  const rows = adapter.rows(), matrix = adapter.readiness(), enumFilters = {};
  for (const field of ['country', 'exchange', 'currency', 'chartStatus', 'index']) {
    const values = [...new Set(rows.flatMap(row => field === 'index' ? row.indexes : [row[field]]).filter(v => v !== null && v !== undefined))];
    enumFilters[field] = values.map(value => ({ value, count: Screener.filterRows(rows, [{ field, op: 'in', value: [value] }]).length }));
  }
  const metricCoverage = Object.fromEntries(Screener.METRICS.map(metric => [metric, rows.filter(row => row[metric] !== null).length]));
  const usAfter = typeof getUSCallCount === 'function' ? getUSCallCount() : null;
  if (usAfter !== null && (!Number.isInteger(usAfter) || usAfter < usBefore)) throw Error('INVALID_US_SENTINEL_COUNT');
  if (usAfter !== null && usAfter !== usBefore) throw Error('UNDERLYING_US_ROUTING_REGRESSION');
  pinnedObject(sourceInputs.catalog, catalog); pinnedObject(sourceInputs.identity, identityUniverse);
  if (stable(registry.sources) !== stable(readCentralLogoRegistry(repositoryRoot).sources)) throw Error('CENTRAL_LOGO_REGISTRY_CHANGED');
  const logoStatus = { schema: 'europe-discover-logo-status-2', generatedAt, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    sourceInputs, centralRegistry: registry.sources, summary: Object.fromEntries(['LOGO_VALID', 'LOGO_FALLBACK', 'LOGO_MISSING', 'LOGO_SUSPECT'].map(status => [status, [...logoRows.values()].filter(r => r.status === status).length])),
    identityBlocking: false, providerRequests: 0, networkRequests: 0, centralAssetWrites: 0, rows: [...logoRows.values()] };
  const screenerReplay = { schema: 'europe-discover-screener-replay-2', generatedAt, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    sourceInputs, canonicalContractMethods: calls, callerNonEuropeCalls: 0, underlyingUSCalls: usAfter === null ? null : usAfter - usBefore,
    underlyingUSCallsProof: usAfter === null ? 'UNMEASURED: actual root replay must supply its independent US sentinel counter.' : 'ROOT_US_SENTINEL_BEFORE_AND_AFTER_REPLAY',
    summary: { catalog: ids.length, baseRows: rows.length, blocked: ids.length - rows.length,
      chartReady: rows.filter(r => r.chartStatus === 'CHART_READY').length, chartLimited: rows.filter(r => r.chartStatus === 'CHART_LIMITED').length,
      technicalReady: rows.filter(r => r.TECHNICAL === 'TECHNICAL_READY').length, technicalPartial: rows.filter(r => r.TECHNICAL === 'TECHNICAL_PARTIAL').length },
    metricCoverage, enumFilters, nativePricePositiveFilterCount: Screener.filterRows(rows, [{ field: 'price', op: 'gt', value: 0 }]).length,
    missingVolumeEqualsZeroFilterCount: Screener.filterRows(rows.filter(r => r.volume === null), [{ field: 'volume', op: 'eq', value: 0 }]).length,
    factorPublication: { compositeAllowed: false }, rankingsPublished: false, rows, readiness: matrix };
  return { logoStatus, logoEvidence, screenerReplay };
}
export function writePrivateDiscoverScreenerReplay(outputs, directory) {
  const out = privateReplayRoot(directory); mkdirSync(out, { recursive: true, mode: 0o700 });
  return [['europe_logo_status.json', outputs.logoStatus], ['europe_screener_replay.json', outputs.screenerReplay],
    ['europe_company_logo_evidence.json', outputs.logoEvidence]].map(([name, object]) => {
      const path = join(out, name); try { if (!lstatSync(path).isFile()) throw Error('REGULAR_PRIVATE_OUTPUT_REQUIRED'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      // privateReplayRoot also refuses a dangling or existing symlink leaf.
      privateReplayRoot(path); const bytes = Buffer.from(JSON.stringify(object, null, 2) + '\n');
      writeFileSync(path, bytes, { mode: 0o600 }); return { path, bytes: bytes.length, sha256: hash(bytes) };
    });
}
