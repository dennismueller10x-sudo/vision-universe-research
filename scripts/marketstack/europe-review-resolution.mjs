/** Europe 2.1 diagnostic/resolution producer. Private only; no provider calls. */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, lstatSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validIsin, validLei, verifiedMeasuredGermanCashShare, EUROPE_EXCHANGE_PLAN } from './europe-universe.mjs';
import { compileEuropeEvidence, loadEvidenceDirectory, readOfficialIdentities, readIndexReferences } from './europe-build-evidence.mjs';
import { buildEurope21HistoryOverlay } from './europe21-quality.mjs';
import { classifyAdjustment, validateEodBars } from './europe-quality.mjs';
import { buildEquityIndexCoverage } from './europe-build-evidence.mjs';
import { readCurrentMicRelationships } from './europe-mic-policy.mjs';
import { privateReplayRoot } from './europe-private-files.mjs';
const require = createRequire(import.meta.url), Identity = require('../../core/identity.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => /^[a-f0-9]{64}$/.test(value || '');
const unique = values => [...new Set(values.filter(value => value != null))].sort();
const table = rows => new Map((rows || []).map(row => [row.listingKey, row]));
const leiFor = row => typeof row.companyKey === 'string' && row.companyKey.startsWith('LEI:') ? row.companyKey.slice(4) : '';
const allowedMics = new Set(EUROPE_EXCHANGE_PLAN.flatMap(p => p.mics));
const datedToday = (source, now) => sha(source?.sha256) && source?.httpStatus === 200 &&
  typeof source.retrievedAt === 'string' && Number.isFinite(Date.parse(source.retrievedAt)) &&
  Date.parse(source.retrievedAt) <= Date.parse(now) && new Date(source.retrievedAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
function regularFile(root, name, allowMissing = false) {
  if (!/^[A-Za-z0-9_.-]+\.json$/.test(name)) throw Error('INVALID_PRIVATE_FILE_NAME');
  const path = resolve(root, name);
  try { if (!lstatSync(path).isFile()) throw Error('PRIVATE_REGULAR_FILE_REQUIRED'); }
  catch (error) { if (!(allowMissing && error.code === 'ENOENT')) throw error; }
  return path;
}
function atomicJson(root, name, bytes) {
  const path = regularFile(root, name, true), temporary = resolve(root, randomUUID() + '.tmp');
  writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temporary, path);
}

export const REVIEW_CLUSTERS = Object.freeze([
  'IDENTITY_AMBIGUOUS', 'MISSING_ISIN', 'MISSING_LEI', 'MIC_MISMATCH', 'MULTIPLE_LISTINGS',
  'ALIAS_UNRESOLVED', 'SECONDARY_LISTING', 'PRIMARY_LISTING_UNCLEAR', 'STALE_EOD', 'SHORT_HISTORY',
  'INVALID_OHLC', 'ADJUSTMENT_UNKNOWN', 'CORPORATE_ACTION_UNCERTAIN', 'ASSET_TYPE_UNCLEAR',
  'SHARE_CLASS_UNCLEAR', 'INACTIVE_STATUS_UNCLEAR', 'DUPLICATE_RISK', 'LIQUIDITY_UNKNOWN',
  'FUNDAMENTALS_MISSING', 'OTHER'
]);
// The first failed gate is primary. Product dependencies remain secondary labels.
export const PRIMARY_CLUSTER_ORDER = Object.freeze([
  'MIC_MISMATCH', 'MISSING_ISIN', 'MISSING_LEI', 'IDENTITY_AMBIGUOUS', 'ASSET_TYPE_UNCLEAR',
  'STALE_EOD', 'PRIMARY_LISTING_UNCLEAR', 'ALIAS_UNRESOLVED', 'INACTIVE_STATUS_UNCLEAR',
  'INVALID_OHLC', 'SHORT_HISTORY', 'SECONDARY_LISTING', 'MULTIPLE_LISTINGS', 'DUPLICATE_RISK',
  'SHARE_CLASS_UNCLEAR', 'LIQUIDITY_UNKNOWN', 'ADJUSTMENT_UNKNOWN', 'CORPORATE_ACTION_UNCERTAIN',
  'FUNDAMENTALS_MISSING', 'OTHER'
]);
export const CLUSTER_DEFINITIONS = Object.freeze({
  IDENTITY_AMBIGUOUS: 'Explicit missing/conflicting issuer or share-class identity reason.',
  MISSING_ISIN: 'No checksum-valid canonical class ISIN; expected query ISIN is not an admitted identity.',
  MISSING_LEI: 'No checksum-valid issuer LEI company key.',
  MIC_MISMATCH: 'Explicit conflicting MIC evidence; distinct primary and local MIC alone is not a mismatch.',
  MULTIPLE_LISTINGS: 'Exact checksum-valid ISIN appears on distinct MICs; never a same-MIC alias count.',
  ALIAS_UNRESOLVED: 'Exact ISIN has multiple query symbols on this MIC, or an explicit alias failure.',
  SECONDARY_LISTING: 'Explicit isPrimary=false and a distinct identified primary MIC.',
  PRIMARY_LISTING_UNCLEAR: 'Primary/product-primary policy is unresolved or missing.',
  STALE_EOD: 'Prior evaluated STALE EOD or explicit stale consumer exclusion; DELAYED is separate.',
  SHORT_HISTORY: 'Observed history has fewer than 252 valid observations; absent history is unknown.',
  INVALID_OHLC: 'Preserved quarantined OHLC is impossible, nonnumeric or nonpositive.',
  ADJUSTMENT_UNKNOWN: 'Adjustment basis is uncertified (including PARTIAL/INVALID); status is retained.',
  CORPORATE_ACTION_UNCERTAIN: 'No validated action/absence basis; empty events do not prove no actions.',
  ASSET_TYPE_UNCLEAR: 'No explicit admitted equity kind and no exact verified official CS class proof.',
  SHARE_CLASS_UNCLEAR: 'Ordinary/preferred detail unknown; an exact ISIN cash class can still be identified.',
  INACTIVE_STATUS_UNCLEAR: 'No boolean listing activity or exact same-MIC official/activity proof.',
  DUPLICATE_RISK: 'Multiple exact-ISIN same-MIC symbols may be aliases; no display-name grouping.',
  LIQUIDITY_UNKNOWN: 'No source-backed regulatory or independently measured liquidity evidence.',
  FUNDAMENTALS_MISSING: 'Bound product fundamentals missing/unknown; missing is not numeric zero.',
  OTHER: 'No classified reason; retained for complete coverage, never automatic admission.'
});

function assertCandidates(universe) {
  if (!Array.isArray(universe?.candidates)) throw Error('CANDIDATE_ARRAY_REQUIRED');
  const seen = new Set();
  for (const row of universe.candidates) {
    if (!row.listingKey || seen.has(row.listingKey)) throw Error('DUPLICATE_OR_MISSING_CANDIDATE_KEY');
    if (!['ACCEPTED', 'REVIEW', 'REJECTED'].includes(row.status)) throw Error('INVALID_CANDIDATE_STATUS');
    seen.add(row.listingKey);
  }
}
function assertOverlay(rows, candidates) {
  const keys = new Set(candidates.map(row => row.listingKey)), seen = new Set();
  for (const row of rows || []) {
    if (!keys.has(row.listingKey) || seen.has(row.listingKey)) throw Error('CONFLICTING_OR_FOREIGN_OVERLAY_KEY');
    seen.add(row.listingKey);
    const candidate = candidates.find(c => c.listingKey === row.listingKey);
    for (const key of ['isin', 'companyKey', 'mic']) if (row[key] != null && candidate[key] != null && row[key] !== candidate[key])
      throw Error('CONFLICTING_OVERLAY_IDENTITY');
  }
}

/** All counts are scoped candidate/query keys unless an exact identity basis is named. */
export function buildReviewClusters({ baselineUniverse, priceQuality = {}, freshness = {}, adjustments = {},
  productReadiness = {}, sourceBinding = null } = {}) {
  assertCandidates(baselineUniverse);
  for (const overlay of [priceQuality, freshness, adjustments, productReadiness]) assertOverlay(overlay.rows, baselineUniverse.candidates);
  const quality = table(priceQuality.rows), fresh = table(freshness.rows), adjusted = table(adjustments.rows), product = table(productReadiness.rows);
  const byIsin = new Map();
  for (const row of baselineUniverse.candidates) if (validIsin(row.isin)) {
    if (!byIsin.has(row.isin)) byIsin.set(row.isin, []);
    byIsin.get(row.isin).push(row);
  }
  const rows = baselineUniverse.candidates.filter(c => c.status === 'REVIEW').sort((a, b) => a.listingKey.localeCompare(b.listingKey)).map(c => {
    const reasons = c.reasons || [], q = quality.get(c.listingKey), f = fresh.get(c.listingKey), a = adjusted.get(c.listingKey), p = product.get(c.listingKey);
    const evidence = (c.identityEvidence || []).filter(e => e.verified === true && validIsin(c.isin) && e.isin === c.isin);
    const officialCashClass = evidence.some(e => e.officialInstrumentType === 'CS' && e.typeSource === 'XETRA_REFERENCE' && sha(e.provenance?.xetra?.sha256));
    const explicitTypeConflict = reasons.some(r => /CONFLICTING_INSTRUMENT_TYPE|EXCLUDED_INSTRUMENT_TYPE/.test(r));
    const exactActivity = evidence.some(e => e.mic === c.mic && (typeof e.active === 'boolean' || e.homeActivityEvidence?.verified === true));
    const group = byIsin.get(c.isin) || [], sameVenue = group.filter(row => row.mic === c.mic);
    const labels = new Set(), add = (label, condition) => { if (condition) labels.add(label); };
    add('MISSING_ISIN', !validIsin(c.isin)); add('MISSING_LEI', !validLei(leiFor(c)));
    add('IDENTITY_AMBIGUOUS', reasons.some(r => /ISSUER_(IDENTITY|COUNTRY)_MISSING|CONFLICTING_.*IDENTITY|CONFLICTING_ISSUER/.test(r)));
    add('MIC_MISMATCH', reasons.some(r => /MIC_(MISMATCH|CONFLICT)|CONFLICTING_.*MIC|EXCHANGE_MISMATCH/.test(r)));
    add('MULTIPLE_LISTINGS', new Set(group.map(row => row.mic)).size > 1);
    add('ALIAS_UNRESOLVED', sameVenue.length > 1 || reasons.some(r => /ALIAS/.test(r)));
    add('SECONDARY_LISTING', c.isPrimary === false && c.primaryMic && c.primaryMic !== c.mic);
    add('PRIMARY_LISTING_UNCLEAR', !c.primaryMic || reasons.some(r => /PRIMARY_LISTING|PRODUCT_PRIMARY_POLICY/.test(r)));
    add('STALE_EOD', f?.status === 'STALE' || reasons.includes('STALE_PRICE_CONSUMER_REVIEW'));
    add('SHORT_HISTORY', Number.isInteger(q?.history?.observations) && q.history.observations < 252);
    add('INVALID_OHLC', (q?.quality?.quarantine || []).some(row => row.reasons.some(r => /IMPOSSIBLE_OHLC|NON_POSITIVE_PRICE|NON_NUMERIC_OHLC/.test(r))));
    add('ADJUSTMENT_UNKNOWN', a?.status !== 'ADJUSTMENT_CERTIFIED');
    add('CORPORATE_ACTION_UNCERTAIN', a?.corporateActions?.status !== 'VALIDATED');
    add('ASSET_TYPE_UNCLEAR', explicitTypeConflict || (!officialCashClass && (!c.kind || reasons.includes('AMBIGUOUS_INSTRUMENT_TYPE'))));
    add('SHARE_CLASS_UNCLEAR', !c.shareClassDetail || c.shareClassDetail === 'UNKNOWN');
    add('INACTIVE_STATUS_UNCLEAR', typeof c.active !== 'boolean' && !exactActivity);
    add('DUPLICATE_RISK', sameVenue.length > 1 || reasons.some(r => /DUPLICATE/.test(r)));
    add('LIQUIDITY_UNKNOWN', !evidence.some(e => (e.regulatoryLiquid === true &&
      (e.officialReferenceMic || e.mic) === c.mic && c.mic === 'XETR' && sha(e.provenance?.xetra?.sha256)) || verifiedMeasuredGermanCashShare(e, c)));
    add('FUNDAMENTALS_MISSING', !p?.readiness?.FUNDAMENTALS || ['FUNDAMENTALS_UNKNOWN', 'FUNDAMENTALS_MISSING', 'FUNDAMENTALS_BLOCKED'].includes(p.readiness.FUNDAMENTALS));
    if (!labels.size) labels.add('OTHER');
    return { listingKey: c.listingKey, providerSymbol: c.providerSymbol, mic: c.mic,
      isin: validIsin(c.isin) ? c.isin : null, expectedIsin: validIsin(c.expectedIsin) ? c.expectedIsin : null,
      companyKey: validLei(leiFor(c)) ? c.companyKey : null, issuerCountry: c.issuerCountry || null,
      primaryCluster: PRIMARY_CLUSTER_ORDER.find(label => labels.has(label)), labels: [...labels].sort(),
      originalReasons: [...reasons].sort(), sourceGeneration: baselineUniverse.generatedAt || null,
      freshness: f?.status || 'UNOBSERVED', historyObservations: q?.history?.observations ?? null,
      adjustment: a?.status || 'ADJUSTMENT_UNKNOWN', corporateActions: a?.corporateActions?.status || 'UNKNOWN',
      officialCashClass, exactActivity, countBasis: 'SCOPED_CANDIDATE_QUERY_KEY' };
  });
  const clusters = REVIEW_CLUSTERS.map(cluster => ({ cluster, definition: CLUSTER_DEFINITIONS[cluster],
    primaryCount: rows.filter(row => row.primaryCluster === cluster).length,
    multiLabelCount: rows.filter(row => row.labels.includes(cluster)).length,
    examples: rows.filter(row => row.labels.includes(cluster)).slice(0, 3).map(row => ({ listingKey: row.listingKey, isin: row.isin, originalReasons: row.originalReasons })) }));
  const statuses = Object.fromEntries(['ACCEPTED', 'REVIEW', 'REJECTED'].map(status => [status, baselineUniverse.candidates.filter(row => row.status === status).length]));
  return { schema: 'vu-europe-review-clusters-2.1', mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    sourceBinding, primaryOrder: PRIMARY_CLUSTER_ORDER, counts: { candidates: baselineUniverse.candidates.length, ...statuses,
      primaryTotal: clusters.reduce((n, cluster) => n + cluster.primaryCount, 0),
      multiLabelTotal: clusters.reduce((n, cluster) => n + cluster.multiLabelCount, 0),
      knownReviewCompanies: unique(rows.map(row => row.companyKey)).length,
      knownReviewSecurities: unique(rows.map(row => row.isin)).length },
    countMeaning: 'Primary clusters partition review query keys. Multi-label counts overlap. Unknown identities are never counted as companies.',
    clusters, rows };
}

export function buildReviewResolutionPlan({ clusters, baselineUniverse, indexCoverage = {} } = {}) {
  assertCandidates(baselineUniverse);
  if (clusters?.counts?.REVIEW !== baselineUniverse.candidates.filter(row => row.status === 'REVIEW').length) throw Error('CLUSTER_BASELINE_MISMATCH');
  const expected = new Map(baselineUniverse.candidates.filter(row => row.status === 'REVIEW').map(row => [row.listingKey, row])), seen = new Set();
  for (const row of clusters.rows || []) {
    const candidate = expected.get(row.listingKey);
    if (!candidate || seen.has(row.listingKey) || row.isin !== (validIsin(candidate.isin) ? candidate.isin : null) ||
      row.mic !== candidate.mic || row.companyKey !== (validLei(leiFor(candidate)) ? candidate.companyKey : null) ||
      !REVIEW_CLUSTERS.includes(row.primaryCluster) || !Array.isArray(row.labels) || row.labels.some(label => !REVIEW_CLUSTERS.includes(label)) ||
      !row.labels.includes(row.primaryCluster)) throw Error('CLUSTER_BASELINE_KEY_OR_IDENTITY_MISMATCH');
    seen.add(row.listingKey);
  }
  if (seen.size !== expected.size) throw Error('CLUSTER_BASELINE_KEY_OR_IDENTITY_MISMATCH');
  const indexByIsin = new Map();
  for (const index of indexCoverage.rows || []) if (index.status === 'EXACT_ISIN_OFFICIAL_ROSTER_JOIN') {
    for (const isin of index.missingIsins || []) if (validIsin(isin)) {
      if (!indexByIsin.has(isin)) indexByIsin.set(isin, []);
      indexByIsin.get(isin).push(index.index);
    }
  }
  const candidates = table(baselineUniverse.candidates);
  const rows = clusters.rows.map(row => {
    const c = candidates.get(row.listingKey), indices = unique(indexByIsin.get(row.isin || row.expectedIsin) || []);
    const priorAcceptedSameClass = validIsin(row.isin) && baselineUniverse.candidates.some(a => a.status === 'ACCEPTED' && a.isin === row.isin);
    const actions = unique([
      'REFRESH_EXACT_SCOPED_PROVIDER_METADATA', 'REFRESH_EXACT_CLASS_GLEIF_AND_OFFICIAL_REFERENCE', 'REFRESH_EOD_WITH_VERIFIED_EXCHANGE_CALENDAR',
      ...(row.labels.includes('ALIAS_UNRESOLVED') ? ['VERIFY_UNIQUE_SYMBOL_MIC_ISIN_ALIAS'] : []),
      ...(row.labels.includes('PRIMARY_LISTING_UNCLEAR') ? ['PROVE_PRIMARY_LOCAL_LISTING_POLICY_WITH_SOURCE'] : []),
      ...(row.labels.includes('MIC_MISMATCH') ? ['QUARANTINE_MIC_CONFLICT_UNTIL_EXACT_REFERENCE_RELATION'] : []),
      ...(row.labels.includes('INVALID_OHLC') ? ['KEEP_PRIOR_RAW_QUARANTINE_IMMUTABLE'] : []),
      ...(priorAcceptedSameClass ? ['PRESERVE_EXISTING_SECURITY_ID_IF_SAME_CLASS_ISSUER'] : [])
    ]);
    return { ...row, status: 'STILL_REVIEW', resolution: 'CURRENT_EVIDENCE_REQUIRED', priority: indices.length ? 1 : row.issuerCountry === 'DE' ? 2 : 5,
      priorityBasis: indices.length ? 'PRIOR_EXACT_ISIN_OFFICIAL_INDEX_GAP' : row.issuerCountry === 'DE' ? 'VERIFIED_ISSUER_COUNTRY_GERMANY' : 'NO_VERIFIED_CAP_SIZE_PRIORITY',
      indexTargets: indices, priorAcceptedSameClass, queryHypothesisOnly: !row.isin && Boolean(row.expectedIsin),
      knownAliasSymbols: unique((c?.verifiedAliases || []).map(a => typeof a === 'string' ? a : a.symbol)), actions,
      automaticAcceptanceAllowed: false, hardRequirements: ['EXACT_IDENTITY', 'CURRENT_METADATA', 'CURRENT_SCOPED_EOD', 'ASSET_TYPE', 'PRIMARY_POLICY', 'LIQUIDITY', 'PROTECTED_ID_ISOLATION'] };
  }).sort((a, b) => a.priority - b.priority || a.listingKey.localeCompare(b.listingKey));
  return { schema: 'vu-europe-review-resolution-2.1', mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    sourceBinding: clusters.sourceBinding, counts: { start: rows.length, accepted: 0, stillReview: rows.length, rejected: 0 },
    clusters: clusters.clusters.map(cluster => ({ cluster: cluster.cluster, start: cluster.primaryCount, accepted: 0, stillReview: cluster.primaryCount, rejected: 0 })),
    rows, distinctPriorityClassHypotheses: unique(rows.filter(row => row.priority <= 2).map(row => row.isin || row.expectedIsin)).length };
}

/** One hypothesis per exact class/MIC. Historical failed aliases are not replayed in bulk. */
export function buildPrioritizedRefreshPlan({ baselineUniverse, resolution, maxGermany = 250, maxEurope = 200 } = {}) {
  assertCandidates(baselineUniverse);
  if (![maxGermany, maxEurope].every(n => Number.isInteger(n) && n >= 0)) throw Error('BOUNDED_PRIORITY_LIMIT_REQUIRED');
  const priorities = table(resolution?.rows), grouped = new Map();
  for (const c of baselineUniverse.candidates.filter(c => c.status === 'REVIEW' &&
    !['ETF', 'ETN', 'ETC', 'FUND'].includes(c.kind) && !(c.reasons || []).includes('EXCLUDED_INSTRUMENT_TYPE'))) {
    const isin = validIsin(c.isin) ? c.isin : validIsin(c.expectedIsin) ? c.expectedIsin : null;
    if (!isin || !c.mic || !c.providerSymbol) continue;
    const row = priorities.get(c.listingKey), official = (c.identityEvidence || []).filter(e => e.verified === true && e.isin === isin);
    const scopedObservation = (c.observations || []).some(o => o.normalized?.providerTicker === c.providerSymbol && o.normalized?.mic === c.mic);
    const indexTargets = row?.indexTargets || [];
    const score = (scopedObservation ? 100 : 0) + (c.providerSymbol.endsWith('.DE') ? 10 : 0);
    const key = `${isin}:${c.mic}`, candidate = { isin, mic: c.mic, providerSymbol: c.providerSymbol, priorListingKey: c.listingKey,
      issuerCountry: c.issuerCountry || null, priorStatus: c.status, priorReasons: c.reasons || [],
      indexTargets, priority: row?.priority || (c.issuerCountry === 'DE' ? 2 : 5), scopedMetadataObserved: scopedObservation,
      officialIdentityObserved: official.some(e => validLei(e.lei)), canonicalIdentityUnverified: !validIsin(c.isin),
      evidenceRequirements: ['CURRENT_EXACT_METADATA', 'CURRENT_GLEIF_EXACT_ISIN', 'CURRENT_OFFICIAL_CLASS_REFERENCE', 'CURRENT_SCOPED_EOD_CALENDAR'], score };
    const previous = grouped.get(key);
    if (!previous || candidate.score > previous.score || candidate.score === previous.score && candidate.providerSymbol.localeCompare(previous.providerSymbol) < 0) grouped.set(key, candidate);
  }
  const ordered = [...grouped.values()].sort((a, b) => a.priority - b.priority || Number(b.scopedMetadataObserved) - Number(a.scopedMetadataObserved) || a.isin.localeCompare(b.isin));
  const germany = ordered.filter(c => c.issuerCountry === 'DE').slice(0, maxGermany);
  // European index cores first; long tail lacking prior scoped metadata is deferred.
  const europe = ordered.filter(c => c.issuerCountry !== 'DE' && (c.indexTargets.length || c.scopedMetadataObserved && c.officialIdentityObserved)).slice(0, maxEurope);
  const candidates = [...germany, ...europe].map(({ score, ...c }) => c);
  const acceptedLatest = baselineUniverse.candidates.filter(c => c.status === 'ACCEPTED').map(c => ({ providerSymbol: c.providerSymbol, mic: c.mic, isin: c.isin, securityId: c.securityId }));
  return { schema: 'vu-europe-priority-refresh-2.1', mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    sourceBinding: resolution?.sourceBinding || null, counts: { germany: germany.length, europe: europe.length, candidates: candidates.length, acceptedLatest: acceptedLatest.length },
    constraints: ['ONE_METADATA_QUERY_PER_EXACT_ISIN_MIC', 'NO_REPEATED_NATIVE_ALIAS_SWEEP', 'PRIOR_PROOFS_ARE_QUERY_PLANNING_ONLY', 'NO_CURRENT_ADMISSION_BEFORE_FRESH_EVIDENCE'],
    candidates, acceptedLatest, freshIdentityTargets: unique([...candidates, ...acceptedLatest].map(c => c.isin)),
    metadataOperations: candidates.map(c => ({ kind: 'metadata', symbol: c.providerSymbol, mic: c.mic, assetKind: 'EQUITY', expectedIsin: c.isin, maxPages: 1 })) };
}

/** Stable canonical graph: only exact classes/issuers; names never form identities. */
export function buildCanonicalEuropeGraph({ baselineUniverse, admittedUniverse = baselineUniverse, protectedSecurityIds = [] } = {}) {
  assertCandidates(baselineUniverse); assertCandidates(admittedUniverse);
  const existing = new Map(), protectedIds = new Set(protectedSecurityIds), companyRows = new Map(), securityRows = new Map(), listings = [], quarantine = [];
  for (const row of baselineUniverse.candidates.filter(c => c.status === 'ACCEPTED')) {
    if (!validIsin(row.isin) || !validLei(leiFor(row)) || !row.securityId) throw Error('INVALID_PRIOR_CANONICAL_IDENTITY');
    if (existing.has(row.isin) && (existing.get(row.isin).companyKey !== row.companyKey || existing.get(row.isin).securityId !== row.securityId)) throw Error('CONFLICTING_PRIOR_CLASS_IDENTITY');
    existing.set(row.isin, row);
  }
  const currentByKey = table(admittedUniverse.candidates), candidates = [...admittedUniverse.candidates.filter(c => c.status === 'ACCEPTED')];
  for (const old of baselineUniverse.candidates.filter(c => c.status === 'ACCEPTED')) if (!candidates.some(c => c.listingKey === old.listingKey)) {
    const current = currentByKey.get(old.listingKey);
    if (current && ((validIsin(current.isin) && current.isin !== old.isin) || (current.companyKey && current.companyKey !== old.companyKey))) {
      quarantine.push({ listingKey: old.listingKey, securityId: old.securityId, reason: 'CURRENT_CLASS_OR_ISSUER_CONFLICT_WITH_PRIOR_ID' }); continue;
    }
    candidates.push({ ...old, currentAdmissionStatus: current?.status || 'NOT_REFRESHED', priorIdentityRetained: true });
  }
  const idOwners = new Map();
  const primaryByClass = new Map();
  for (const c of candidates.filter(c => c.isPrimary === true)) {
    if (!primaryByClass.has(c.isin)) primaryByClass.set(c.isin, []);
    primaryByClass.get(c.isin).push(c);
  }
  for (const c of candidates.sort((a, b) => a.listingKey.localeCompare(b.listingKey))) {
    const identity = (c.identityEvidence || []).filter(e => e.verified === true && e.isin === c.isin && e.lei === leiFor(c));
    const names = unique(identity.map(e => e.issuerName).filter(Boolean)), countries = unique(identity.map(e => e.issuerCountry).filter(Boolean));
    const prior = existing.get(c.isin), primaries = primaryByClass.get(c.isin) || [], primary = primaries.length === 1 ? primaries[0] : null;
    let id = prior?.securityId || securityRows.get(c.isin)?.securityId || null;
    if (!id && primary?.canonicalTicker) { try { id = Identity.securityIdForTicker(primary.canonicalTicker); } catch { /* quarantine invalid scope */ } }
    const failures = [];
    if (!prior && primaries.length !== 1) failures.push('NEW_CLASS_PRIMARY_LISTING_UNRESOLVED');
    if (!validIsin(c.isin) || !validLei(leiFor(c)) || !identity.length || names.length !== 1 || countries.length !== 1 || countries[0] !== c.issuerCountry) failures.push('VERIFIED_ISSUER_CLASS_IDENTITY_REQUIRED');
    if (prior && prior.companyKey !== c.companyKey) failures.push('CURRENT_ISSUER_CONFLICT_WITH_PRIOR_ID');
    if (!id || !allowedMics.has(c.mic) || (!prior && !c.canonicalTicker?.endsWith('.' + c.mic)) || protectedIds.has(id)) failures.push('CANONICAL_ID_COLLISION_OR_UNSCOPED_TICKER');
    if (idOwners.has(id) && idOwners.get(id) !== c.isin) failures.push('CANONICAL_ID_CLASS_COLLISION');
    if (failures.length) { quarantine.push({ listingKey: c.listingKey, securityId: id, reasons: failures }); continue; }
    idOwners.set(id, c.isin);
    const previousCompany = companyRows.get(c.companyKey);
    if (previousCompany && (previousCompany.issuerCountry !== c.issuerCountry || previousCompany.issuerName !== names[0])) {
      quarantine.push({ listingKey: c.listingKey, reason: 'CONFLICTING_COMPANY_FACTS' }); continue;
    }
    if (!previousCompany) companyRows.set(c.companyKey, { companyId: c.companyKey, companyKey: c.companyKey, lei: leiFor(c), issuerName: names[0],
      issuerCountry: c.issuerCountry, identityStatus: 'VERIFIED', securities: [], provenance: identity.map(e => ({ source: e.source, officialManifest: e.officialManifest })) });
    if (!securityRows.has(c.isin)) securityRows.set(c.isin, { securityId: id, securityKey: 'ISIN:' + c.isin, isin: c.isin,
      companyId: c.companyKey, companyKey: c.companyKey, region: 'EUROPE', kind: c.kind,
      shareClassDetail: c.shareClassDetail || 'UNKNOWN', identity: { status: 'VERIFIED' },
      primaryListingId: c.isPrimary === true ? c.listingKey : null, listings: [], acceptance: c.priorIdentityRetained ? 'RETAINED_IDENTITY' : 'ACCEPTED' });
    const security = securityRows.get(c.isin);
    if (security.companyKey !== c.companyKey) { quarantine.push({ listingKey: c.listingKey, reason: 'CONFLICTING_CLASS_ISSUER' }); continue; }
    if (c.isPrimary === true && security.primaryListingId && security.primaryListingId !== c.listingKey) {
      quarantine.push({ listingKey: c.listingKey, reason: 'MULTIPLE_UNRESOLVED_PRIMARY_LISTINGS' }); continue;
    }
    if (c.isPrimary === true) security.primaryListingId = c.listingKey;
    const listing = { listingId: c.listingKey, listingKey: c.listingKey, securityId: id, securityKey: 'ISIN:' + c.isin,
      companyId: c.companyKey, companyKey: c.companyKey, isin: c.isin, issuerCountry: c.issuerCountry, exchangeCountry: c.exchangeCountry || null,
      shareClassDetail: c.shareClassDetail || 'UNKNOWN', mic: c.mic, provider: c.provider || 'marketstack',
      providerSymbol: c.providerSymbol, canonicalTicker: c.canonicalTicker, currency: c.currency ?? null,
      active: c.active ?? null, isPrimary: c.isPrimary === true, primaryMic: c.primaryMic || null,
      primaryMarketMic: c.primaryMarketMic || null, productPrimaryPolicy: c.productPrimaryPolicy || null,
      verifiedAliases: c.verifiedAliases || [], identityEvidence: identity, observations: c.observations || [],
      priceCurrencyBasis: c.priceCurrencyBasis || null, priceCurrencyEvidence: c.priceCurrencyEvidence || null,
      status: 'ACCEPTED', admissionStatus: c.currentAdmissionStatus || c.status, priorIdentityRetained: c.priorIdentityRetained === true,
      currentPriceReadiness: c.priorIdentityRetained ? 'CURRENT_EVIDENCE_REQUIRED' : 'CONSUMER_GATES_REQUIRED', publicationAllowed: false };
    listings.push(listing); security.listings.push(listing); companyRows.get(c.companyKey).securities.push('ISIN:' + c.isin);
  }
  const companies = [...companyRows.values()].map(company => ({ ...company, securities: unique(company.securities),
    securityIds: unique([...securityRows.values()].filter(s => s.companyKey === company.companyKey).map(s => s.securityId)) }));
  return { schema: 'vu-europe-canonical-graph-2.1', mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    counts: { companies: companies.length, securities: securityRows.size, listings: listings.length, quarantined: quarantine.length },
    companies, securities: [...securityRows.values()].map(s => ({ ...s, primaryListing: s.primaryListingId,
      canonicalTicker: s.listings.find(l => l.listingKey === s.primaryListingId)?.canonicalTicker || null,
      aliases: unique(s.listings.flatMap(l => [l.providerSymbol, l.canonicalTicker, ...l.verifiedAliases])),
      listingDetails: s.listings, listings: s.listings.map(l => l.listingKey) })), listings, quarantine, existingUSPopulationUnchanged: true };
}

/** Additional 2.1 admission requirements; it cannot bypass the foundation compiler. */
export function diagnoseCurrentAdmission({ candidate, qualityRow, freshnessRow, now } = {}) {
  if (!Number.isFinite(Date.parse(now))) throw Error('EXPLICIT_EVALUATION_TIME_REQUIRED');
  const reasons = [], c = candidate || {}, symbols = new Set([c.providerSymbol, ...(c.verifiedAliases || []).filter(a => typeof a === 'string')]);
  if (c.status !== 'ACCEPTED') reasons.push('FOUNDATION_IDENTITY_OR_CONSUMER_GATE_BLOCKED');
  const identity = (c.identityEvidence || []).filter(e => e.verified === true && e.isin === c.isin && e.lei === leiFor(c));
  if (!identity.some(e => datedToday(e.source, now) && datedToday(e.provenance?.xetra, now))) reasons.push('CURRENT_OFFICIAL_CLASS_AND_GLEIF_REQUIRED');
  const responseToday = response => datedToday({ ...response, httpStatus: response.status }, now);
  const metadata = (c.observations || []).some(o => symbols.has(o.normalized?.providerTicker) && o.normalized?.mic === c.mic &&
    (o.normalized?.isin === c.isin || o.normalized?.resolvedIsin === c.isin) && sha(o.rawSha256 || o.provenance?.rawSha256) &&
    sha(o.provenance?.normalizedSha256) && (o.provenance?.responses || []).some(response => responseToday(response) &&
      response.endpoint === '/tickers/' + o.normalized.providerTicker || responseToday(response) &&
      response.endpoint === '/tickers/' + encodeURIComponent(o.normalized.providerTicker)));
  if (!metadata) reasons.push('CURRENT_EXACT_SCOPED_METADATA_REQUIRED');
  const latest = qualityRow?.provenance?.latest;
  const currentPriceSource = sha(latest?.normalizedSha256) && (latest?.responses || []).some(response => responseToday(response) &&
    response.endpoint === '/eod/latest' && response.params?.exchange === c.mic &&
    String(response.params?.symbols || '').split(',').some(symbol => symbols.has(symbol)));
  if (!currentPriceSource) reasons.push('CURRENT_EXACT_SCOPED_EOD_SOURCE_REQUIRED');
  const recent = ['CURRENT', 'LAST_VALID_SESSION'].includes(freshnessRow?.status) ||
    freshnessRow?.status === 'DELAYED' && freshnessRow.missedVerifiedSessions === 1;
  if (freshnessRow?.listingKey !== c.listingKey || freshnessRow?.mic !== c.mic || freshnessRow?.calendarVerified !== true ||
    !recent || freshnessRow?.evaluatedAt !== now || !qualityRow?.latest ||
    (qualityRow?.latestQuality?.quarantine || []).length || qualityRow?.conflicts?.length) reasons.push('RECENT_VALID_CALENDAR_BOUND_EOD_REQUIRED');
  return { eligible: reasons.length === 0, reasons, scope: 'PRIVATE_ADMISSION_ONLY', publicationAllowed: false };
}

/** Legal names are derived from the verified body, never trusted from editable summaries. */
export function readSourceBoundOfficialIdentity(paths) {
  const result = readOfficialIdentities(paths);
  result.rows = result.rows.map(row => {
    const root = privateReplayRoot(dirname(row.officialManifest.path));
    const bytes = readFileSync(regularFile(root, row.isin + '.gleif.raw.json'));
    if (hash(bytes) !== row.provenance.gleif.sha256) throw Error('OFFICIAL_GLEIF_BODY_CHANGED_AFTER_REPLAY');
    const records = JSON.parse(bytes).data || [], record = records.find(r => (r.attributes?.lei || r.id) === row.lei);
    const issuerName = record?.attributes?.entity?.legalName?.name;
    if (typeof issuerName !== 'string' || !issuerName.trim()) throw Error('OFFICIAL_GLEIF_LEGAL_NAME_REQUIRED');
    return { ...row, issuerName, issuerNameBasis: 'RAW_GLEIF_ENTITY_LEGAL_NAME',
      normalizedIssuerNameReplaced: row.issuerName !== issuerName };
  });
  return result;
}

/** Coherent repeated wire observations across operations form one new session bar.
 * Raw bodies and every row receipt are retained; ambiguity inside one operation
 * and any individually invalid member are never hidden by a representative.
 */
export function coalesceCoherentNewSessionObservations({ observations, cachedBars, protectedQuarantineDates, listing, calendar, now, sourceRequestRanges = {} }) {
  const observed = new Set(cachedBars.map(b => b.normalized.tradingDate)), protectedDates = new Set(protectedQuarantineDates), dates = new Map();
  for (const bar of observations) { const date = bar.normalized.tradingDate; if (!dates.has(date)) dates.set(date, []); dates.get(date).push(bar); }
  const additions = [], coalesced = [];
  for (const [date, members] of dates) {
    const sourceIds = members.map(b => b.provenance?.normalizedSha256), qualities = members.map(b => validateEodBars([b], { listing, calendar, now, requestRange: sourceRequestRanges[b.provenance?.normalizedSha256] }));
    const coherent = members.length > 1 && !observed.has(date) && !protectedDates.has(date) && sourceIds.every(sha) &&
      new Set(sourceIds).size === sourceIds.length && qualities.every(q => q.validBars.length === 1 && q.quarantine.length === 0) &&
      new Set(qualities.map(q => JSON.stringify(Object.fromEntries(['date', 'open', 'high', 'low', 'close', 'volume', 'currency'].map(k => [k, q.validBars[0][k]]))))).size === 1;
    if (!coherent) { additions.push(...members); continue; }
    const ordered = members.slice().sort((a, b) => String(b.provenance.retrievedAt || '').localeCompare(String(a.provenance.retrievedAt || '')) || a.provenance.normalizedSha256.localeCompare(b.provenance.normalizedSha256));
    additions.push(ordered[0]); coalesced.push({ date, selectedRowSha256: hash(JSON.stringify(ordered[0])),
      basis: 'INDIVIDUALLY_VALID_IDENTICAL_RAW_OHLCV_AND_CANONICAL_QUOTE_CURRENCY_ACROSS_DISTINCT_AUTHENTICATED_OPERATIONS',
      sourceRows: ordered.map(bar => ({ rowSha256: hash(JSON.stringify(bar)), provenance: bar.provenance })), sourceRowsRetained: members.length });
  }
  return { additions, coalesced, originalObservationCount: observations.length, canonicalObservationCount: additions.length };
}
/** Only loader-authenticated OHLC wrappers can feed immutable history overlays. */
export function applyEurope21HistoryOverlays({ outputs, baseline, evidence, current, calendars, now }) {
  const operations = evidence.flatMap(e => e.operations), currentOperations = current.flatMap(e => e.operations);
  const bySha = new Map(operations.map(o => [o.provenance.normalizedSha256, o]));
  const sourceRequestRanges = Object.fromEntries(operations.filter(o => o.operation.kind === 'history').map(o => [o.provenance.normalizedSha256, { from: o.operation.from ?? null, to: o.operation.to ?? null }]));
  const previousRows = baseline.priceQuality.rows.filter(r => r.identityStatus === 'ACCEPTED');
  const rows = table(outputs.marketstack_europe_price_quality.rows), projection = outputs.marketstack_europe_core_projection;
  const receipts = [], metricCoverage = {};
  const compact = quality => ({ ...Object.fromEntries(['version', 'warnings', 'gaps', 'missingDates', 'calendarSource', 'currency', 'counts', 'volumeVerified', 'status'].map(k => [k, quality[k]])),
    quarantine: quality.quarantine.map(q => ({ date: q.date, reasons: q.reasons, rawHash: hash(JSON.stringify(q.raw || q)) })) });
  for (const c of outputs.marketstack_europe_equity_universe.listings) {
    const row = rows.get(c.listingKey), visible = projection.listingEvidence[c.listingKey];
    if (!row || !visible) continue;
    const previous = previousRows.find(r => r.isin === c.isin && r.mic === c.mic);
    const cachedOperation = bySha.get((previous || row).provenance?.history?.normalizedSha256);
    const aliases = new Set([c.providerSymbol, ...(c.verifiedAliases || [])]);
    const scoped = observation => aliases.has(observation.normalized.providerTicker) && observation.normalized.providerExchange === c.mic;
    const cachedBars = cachedOperation?.observations.filter(scoped) || [];
    const originalAdditions = currentOperations.filter(o => ['latest', 'latestBatch', 'history'].includes(o.operation.kind) && (o.operation.mic || o.operation.listing?.mic) === c.mic)
      .flatMap(o => o.observations.filter(scoped));
    const protectedDates = unique(previousRows.filter(r => r.isin === c.isin && r.mic === c.mic).flatMap(r => (r.quality?.quarantine || []).map(q => q.date)));
    const listing = { mic: c.mic, providerTicker: c.providerSymbol, providerSymbol: c.providerSymbol, verifiedAliases: c.verifiedAliases,
      currency: c.currency, securityId: c.securityId, listingId: c.listingKey };
    if (row.historicalIdentity?.admittedFrom) listing.identityValidFrom = row.historicalIdentity.admittedFrom;
    const sourceReceipts = unique([cachedOperation?.provenance.normalizedSha256, ...originalAdditions.map(o => o.provenance.normalizedSha256)])
      .map(normalizedSha256 => operations.find(o => o.provenance.normalizedSha256 === normalizedSha256)?.provenance).filter(Boolean);
    if (!sourceReceipts.length) continue;
    const combined = coalesceCoherentNewSessionObservations({ observations: originalAdditions, cachedBars, protectedQuarantineDates: protectedDates, listing, calendar: calendars[c.mic] || {}, now, sourceRequestRanges });
    const overlay = buildEurope21HistoryOverlay({ cachedBars, additions: combined.additions, listing, calendar: calendars[c.mic] || {}, now, protectedQuarantineDates: protectedDates, sourceReceipts, sourceRequestRanges });
    overlay.receipt.coherentCrossOperationRows = combined.coalesced;
    overlay.receipt.originalAdditionalObservationCount = combined.originalObservationCount;
    overlay.receipt.canonicalAdditionalObservationCount = combined.canonicalObservationCount;
    const bars = overlay.quality.validBars, technical = overlay.projection;
    receipts.push(overlay.receipt); row.quality = compact(overlay.quality); row.historyOverlay = overlay.receipt;
    row.history = { ...(row.history || {}), observations: bars.length, firstDate: bars[0]?.date || null, lastDate: bars.at(-1)?.date || null };
    visible.history = { ...visible.history, valid: bars.length > 0, observations: bars.length, chartStatus: bars.length ? 'CHART_LIMITED' : 'CHART_BLOCKED' };
    visible.priceQuality = { ...visible.priceQuality, status: bars.length ? 'VALIDATED' : 'INVALID', quarantinedCount: overlay.quality.quarantine.length,
      volumeValid: overlay.quality.volumeVerified === true && row.latestQuality?.volumeVerified === true, warnings: overlay.quality.warnings };
    visible.provenance.historyOverlay = overlay.receipt;
    const series = projection.series.find(s => s.listingId === c.listingKey);
    if (series) { series.points = bars.map(b => [b.date, b.close]); series.provenance.historyOverlay = overlay.receipt; }
    // A current contradiction never authorizes either charts or private engine metrics.
    const safe = !(row.conflicts || []).length && bars.at(-1)?.date === visible.latest?.date;
    visible.technical = safe && technical.engineProjection === true ? { ...technical, status: 'TECHNICAL_PARTIAL', researchStatus: technical.status,
      methodology: `EXISTING_ENGINE:${technical.methodology.featureVersion}:${technical.methodology.parametersHash}`,
      methodologyEvidence: technical.methodology, evidenceRef: visible.priceQuality.evidenceRef,
      provenance: { ...technical.provenance, historyOverlay: overlay.receipt, priceCurrencyBasis: row.priceCurrencyBasis, priceCurrencyEvidence: row.priceCurrencyEvidence } } : null;
    if (!safe) { if (series) series.points = []; visible.history.valid = false; visible.history.chartStatus = 'CHART_BLOCKED'; visible.chart = { ...visible.chart, status: 'CHART_BLOCKED' }; }
    for (const product of outputs.marketstack_europe_product_readiness.rows.filter(r => r.listingKey === c.listingKey)) {
      product.readiness.HISTORY = row.history; product.readiness.CHART = safe && bars.length ? 'CHART_LIMITED' : 'CHART_BLOCKED';
      product.readiness.TECHNICAL = visible.technical ? 'TECHNICAL_PARTIAL' : 'TECHNICAL_BLOCKED';
      product.technicalProjection = visible.technical ? { status: technical.status, asOf: technical.asOf, engineProjection: true,
        metrics: technical.metrics, methodology: technical.methodology, scope: technical.scope } : null;
    }
    const adjustment = outputs.marketstack_europe_adjustment_status.rows.find(r => r.listingKey === c.listingKey);
    if (adjustment) { Object.assign(adjustment, classifyAdjustment(bars)); visible.adjustment.status = adjustment.status;
      adjustment.rawAdjustedDiagnostic = { scope: 'FULL_AUTHENTICATED_OPERATION_ROWS_BEFORE_RAW_PRICE_QUARANTINE', admittedBasis: 'VALID_RAW_OHLC_PRICE_SCOPE_ONLY',
        noAdjustedFieldRepair: true, rawPriceQuarantineCount: overlay.quality.quarantine.length,
        classification: classifyAdjustment([...cachedBars, ...originalAdditions].map(b => ({ date: b.normalized.tradingDate, providerRaw: b.raw }))),
        originalSourceObservationCount: cachedBars.length + originalAdditions.length, coherentRepeatedObservations: combined.coalesced,
        invalidOnValidRaw: classifyAdjustment(bars).invalid, invalidOnQuarantinedRaw: classifyAdjustment(overlay.quality.quarantine).invalid }; }
    for (const [name, value] of Object.entries(visible.technical?.metrics || {})) if (typeof value === 'number' && Number.isFinite(value)) metricCoverage[name] = (metricCoverage[name] || 0) + 1;
  }
  projection.series = projection.series.filter(s => s.points.length);
  outputs.europe_history_overlay_receipts = { schema: 'europe21-history-overlay-receipts-1', generatedAt: now, mode: 'PRIVATE_RESEARCH', publicationAllowed: false, rows: receipts,
    immutablePriorQuarantineRows: previousRows.reduce((n, r) => n + (r.quality?.quarantine?.length || 0), 0), releasedQuarantineRows: 0, technicalMetricCoverage: metricCoverage };
  return receipts;
}
/** Paths are replayed from complete authenticated RAW before any canonical admission. */
export function compileEurope21ResolutionFromPaths({ baselineDirectory, baselineManifestSha256, evidenceDirectories,
  cachedEvidenceDirectories = [], identityPaths, calendars, now, protectedSecurityIds = [], indexPaths = [], micRelationshipsPath = null, onProgress = () => {} } = {}) {
  if (!Array.isArray(evidenceDirectories) || !evidenceDirectories.length || !Number.isFinite(Date.parse(now))) throw Error('CURRENT_RAW_DIRECTORIES_AND_TIME_REQUIRED');
  const baseline = readPinnedBaseline(baselineDirectory, baselineManifestSha256);
  const current = evidenceDirectories.map(descriptor => {
    if (!descriptor?.path || !descriptor.planHash || !descriptor.phase || !descriptor.baselineMain) throw Error('PINNED_CURRENT_RUN_DESCRIPTOR_REQUIRED');
    return loadEvidenceDirectory(descriptor.path, { onProgress, expectedEurope21: descriptor });
  });
  const cached = cachedEvidenceDirectories.map(path => loadEvidenceDirectory(path, { onProgress }));
  const currentScopes = new Set(current.flatMap(e => e.operations).filter(o => o.operation.kind === 'metadata')
    .map(o => `${o.operation.mic}:${o.operation.symbol}`));
  // Old metadata remains diagnostic; current scoped responses supersede it without editing old RAW.
  const evidence = [...cached.map(e => ({ ...e, operations: e.operations.filter(o => o.operation.kind !== 'metadata' ||
    !currentScopes.has(`${o.operation.mic}:${o.operation.symbol}`)) })), ...current];
  const officialIdentity = readSourceBoundOfficialIdentity(identityPaths || []), indexReferences = readIndexReferences(indexPaths);
  const micRelationships = micRelationshipsPath ? readCurrentMicRelationships(micRelationshipsPath, now) : null;
  const compiled = compileEuropeEvidence({ evidence, officialIdentity, calendars, now, protectedSecurityIds, indexReferences, micRelationships });
  const output = compiled.outputs, fresh = table(output.marketstack_europe_freshness.rows), quality = table(output.marketstack_europe_price_quality.rows);
  const priorClasses = new Map(baseline.baselineUniverse.candidates.filter(c => c.status === 'ACCEPTED').map(c => [c.isin, c]));
  const priorListingKeys = new Set(baseline.baselineUniverse.candidates.filter(c => c.status === 'ACCEPTED').map(c => c.listingKey));
  const declined = new Set(), admissions = [];
  for (const c of output.marketstack_europe_equity_universe.candidates) {
    const prior = priorClasses.get(c.isin), diagnostics = diagnoseCurrentAdmission({ candidate: c, qualityRow: quality.get(c.listingKey), freshnessRow: fresh.get(c.listingKey), now });
    const priorSameIssuer = prior?.companyKey === c.companyKey;
    const newAccepted = c.status === 'ACCEPTED' && !priorListingKeys.has(c.listingKey);
    if (newAccepted && !diagnostics.eligible) { c.status = 'REVIEW'; c.reasons = unique([...(c.reasons || []), ...diagnostics.reasons]); declined.add(c.listingKey); }
    if (prior && !priorSameIssuer) { c.status = 'REVIEW'; c.reasons = unique([...(c.reasons || []), 'CURRENT_ISSUER_CONFLICT_WITH_PRIOR_ID']); declined.add(c.listingKey); }
    // Reuse the prior class ID on every admitted alias/venue; never derive another ID for that class.
    if (c.status === 'ACCEPTED' && priorSameIssuer) c.securityId = prior.securityId;
    admissions.push({ listingKey: c.listingKey, isin: c.isin || null, priorClass: Boolean(priorSameIssuer), currentAdmission: c.status,
      currentEvidenceEligible: diagnostics.eligible, reasons: diagnostics.reasons, sourceGeneration: now });
  }
  const universe = output.marketstack_europe_equity_universe;
  universe.listings = universe.candidates.filter(c => c.status === 'ACCEPTED');
  for (const status of ['ACCEPTED', 'REVIEW', 'REJECTED']) universe.summary[status.toLowerCase()] = universe.candidates.filter(c => c.status === status).length;
  for (const artifact of Object.values(output)) if (Array.isArray(artifact.rows)) for (const row of artifact.rows) {
    const c = universe.candidates.find(c => c.listingKey === row.listingKey); if (!c) continue;
    row.securityId = c.securityId; row.identityStatus = c.status;
    if (declined.has(c.listingKey) && row.readiness) Object.assign(row.readiness, { IDENTITY: 'REVIEW', SEARCH: 'SEARCH_BLOCKED',
      WATCHLIST: 'WATCHLIST_BLOCKED', DISCOVER: 'DISCOVER_BLOCKED', CHART: 'CHART_BLOCKED', SCREENER: 'SCREENER_BLOCKED',
      TECHNICAL: 'TECHNICAL_BLOCKED', QUANT: 'QUANT_BLOCKED', SUPERTRADER: 'SUPERTRADER_BLOCKED', BACKTEST: 'BLOCKED' });
  }
  const projection = output.marketstack_europe_core_projection;
  projection.series = projection.series.filter(series => !declined.has(series.listingId)).map(series => ({ ...series,
    securityId: universe.listings.find(c => c.listingKey === series.listingId)?.securityId || series.securityId }));
  for (const listingKey of declined) delete projection.listingEvidence[listingKey];
  const graph = buildCanonicalEuropeGraph({ baselineUniverse: baseline.baselineUniverse, admittedUniverse: universe, protectedSecurityIds });
  const admittedKeys = new Set(universe.listings.map(c => c.listingKey)), admittedClasses = new Set(universe.listings.map(c => c.isin));
  universe.companies = graph.companies.filter(company => universe.listings.some(c => c.companyKey === company.companyKey)).map(company => ({ ...company,
    securities: company.securities.filter(key => admittedClasses.has(key.slice(5))),
    securityIds: company.securityIds.filter(id => universe.listings.some(c => c.securityId === id)) }));
  universe.securities = graph.securities.filter(security => admittedClasses.has(security.isin)).map(security => ({ ...security,
    canonicalTicker: universe.listings.find(c => c.listingKey === security.primaryListingId)?.canonicalTicker || null,
    listingDetails: security.listingDetails.filter(l => admittedKeys.has(l.listingKey)),
    listings: security.listings.filter(key => admittedKeys.has(key)),
    aliases: unique(security.listingDetails.filter(l => admittedKeys.has(l.listingKey)).flatMap(l => [l.providerSymbol, l.canonicalTicker, ...l.verifiedAliases])) }));
  universe.summary.companies = universe.companies.length; universe.summary.securities = universe.securities.length;
  universe.summary.listings = universe.listings.length;
  for (const [listingKey, evidence] of Object.entries(projection.listingEvidence)) {
    const c = universe.listings.find(c => c.listingKey === listingKey);
    if (c && evidence.technical) evidence.technical.securityId = c.securityId;
  }
  applyEurope21HistoryOverlays({ outputs: output, baseline, evidence, current, calendars, now });
  output.marketstack_germany_universe = projectGermanyUniverse(universe);
  const productRows = output.marketstack_europe_product_readiness.rows, accepted = productRows.filter(r => r.identityStatus === 'ACCEPTED');
  const stats = predicate => {
    const selected = accepted.filter(predicate);
    return { companies: new Set(selected.map(r => r.companyKey)).size, securities: new Set(selected.map(r => r.securityId)).size, listings: selected.length,
      freshEod: selected.filter(r => ['CURRENT', 'LAST_VALID_SESSION'].includes(r.readiness.LATEST_EOD)).length,
      chartReady: selected.filter(r => r.readiness.CHART === 'CHART_READY').length, chartLimited: selected.filter(r => r.readiness.CHART === 'CHART_LIMITED').length,
      technicalReady: selected.filter(r => r.readiness.TECHNICAL === 'TECHNICAL_READY').length, technicalPartial: selected.filter(r => r.readiness.TECHNICAL === 'TECHNICAL_PARTIAL').length,
      quantFull: 0, quantPartial: 0, supertraderReady: 0, backtestReady: 0 };
  };
  const summary = output.marketstack_europe_evidence_summary;
  Object.assign(summary, { candidates: universe.summary, germany: stats(r => r.issuerCountry === 'DE'), europe: stats(() => true),
    germanyLocal: stats(r => r.mic === 'XETR' && universe.listings.some(c => c.listingKey === r.listingKey && c.productPrimaryPolicy?.startsWith('GERMANY_'))),
    technicalMetricCoverage: output.europe_history_overlay_receipts.technicalMetricCoverage, priorIdentityPreserved: graph.securities.filter(s => priorClasses.has(s.isin)).length });
  output.marketstack_europe_index_coverage.rows = buildEquityIndexCoverage(productRows, indexReferences, now);
  for (const row of output.marketstack_europe_index_coverage.rows) {
    const reference = indexReferences.find(r => r.index === row.index && r.rosterExtractionVerified === true && r.referenceVerified === true && r.sourceContentVerified === true);
    if (!reference) { row.nominalTarget = row.target; row.target = null; row.mapped = null; row.accepted = null; continue; }
    const exactMembers = new Set(reference.rows.map(member => member.isin).filter(validIsin));
    const mapped = new Set(universe.candidates.filter(c => validIsin(c.isin) && exactMembers.has(c.isin) && validLei(leiFor(c)) && (c.observations || []).length > 0 &&
      c.identityEvidence?.some(e => e.verified === true && e.isin === c.isin && e.lei === leiFor(c))).map(c => c.isin));
    row.accepted = row.mapped; row.mapped = mapped.size; row.missingAccepted = row.target - row.accepted;
    row.missing = row.target - row.mapped; row.missingMappedIsins = [...exactMembers].filter(isin => !mapped.has(isin));
    row.mappingBasis = 'SOURCE_VERIFIED_EXACT_CLASS_AND_ISSUER_CANDIDATE_JOIN_DISTINCT_FROM_CURRENT_ACCEPTANCE';
  }
  if (!output.marketstack_europe_index_coverage.rows.some(r => r.index === 'Nordics')) output.marketstack_europe_index_coverage.rows.push({ index: 'Nordics', target: null, status: 'UNKNOWN', missing: null, reason: 'NO_AUTHORITATIVE_NORDIC_REFERENCE_ROSTER' });
  output.europe_identity_readiness = { ...graph, generatedAt: now, sourceBinding: baseline.sourceBinding, admissions };
  const clusters = buildReviewClusters({ baselineUniverse: universe, priceQuality: output.marketstack_europe_price_quality,
    freshness: output.marketstack_europe_freshness, adjustments: output.marketstack_europe_adjustment_status,
    productReadiness: output.marketstack_europe_product_readiness,
    sourceBinding: { priorBaseline: baseline.sourceBinding, currentSources: current.map(e => e.provenance), generatedAt: now } });
  output.europe_review_clusters = clusters;
  const oldByKey = new Map(baseline.baselineUniverse.candidates.map(c => [c.listingKey, c]));
  const transitions = universe.candidates.map(c => ({ listingKey: c.listingKey, isin: c.isin || null, companyKey: c.companyKey || null,
    securityId: c.securityId || null, previousStatus: oldByKey.get(c.listingKey)?.status || 'NEW_QUERY_KEY', currentStatus: c.status,
    reasons: c.reasons || [], priorCanonicalIdRetained: priorClasses.has(c.isin) && priorClasses.get(c.isin).securityId === c.securityId }));
  const promoted = transitions.filter(r => r.previousStatus === 'REVIEW' && r.currentStatus === 'ACCEPTED');
  output.europe_review_resolution = { schema: 'europe21-current-resolution-1', generatedAt: now, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    countingBasis: 'SCOPED_PROVIDER_QUERY_KEYS_NOT_COMPANIES', baselineCandidates: baseline.baselineUniverse.candidates.length,
    currentCandidates: universe.candidates.length, previousReviewPromotedQueryKeys: promoted.length,
    previousReviewPromotedClasses: new Set(promoted.map(r => r.isin)).size, previousReviewPromotedCompanies: new Set(promoted.map(r => r.companyKey)).size,
    retainedPriorCanonicalClasses: graph.securities.filter(s => priorClasses.has(s.isin)).length,
    priorAcceptedCurrentConsumerHeld: transitions.filter(r => r.previousStatus === 'ACCEPTED' && r.currentStatus !== 'ACCEPTED').length,
    priorBaseline: baseline.sourceBinding, currentSources: current.map(e => e.provenance), rows: transitions };

  return { ...compiled, outputs: output, baseline, admissions, graph,
    currentMetadataScopes: currentScopes.size,
    currentSources: current.map(e => e.provenance), historicalSources: cached.map(e => e.provenance) };
}

/** Country counts describe only this issuer-country cohort, never the EU total. */
export function projectGermanyUniverse(universe) {
  const { germany, ...common } = universe;
  const candidates = universe.candidates.filter(c => c.issuerCountry === 'DE'), listings = universe.listings.filter(c => c.issuerCountry === 'DE');
  const companies = universe.companies.filter(c => c.issuerCountry === 'DE'), classes = new Set(listings.map(c => c.isin));
  const securities = universe.securities.filter(s => classes.has(s.isin));
  return { ...common, candidates, listings, companies, securities, countryBasis: 'SOURCE_VERIFIED_ISSUER_JURISDICTION_NOT_LISTING_VENUE',
    summary: { candidates: candidates.length, accepted: candidates.filter(c => c.status === 'ACCEPTED').length,
      review: candidates.filter(c => c.status === 'REVIEW').length, rejected: candidates.filter(c => c.status === 'REJECTED').length,
      companies: companies.length, securities: securities.length, listings: listings.length } };
}
/** Reproducible CLI configuration; all provider bodies still pass complete RAW replay. */
export function replayEurope21ResolutionFromConfig(configPath, onProgress = () => {}) {
  const root = privateReplayRoot(dirname(configPath)), config = JSON.parse(readFileSync(regularFile(root, configPath.split('/').at(-1))));
  const read = path => { const root = privateReplayRoot(dirname(path)); return JSON.parse(readFileSync(regularFile(root, path.split('/').at(-1)))); };
  const calendarDoc = config.calendarsPath ? read(config.calendarsPath) : null;
  const calendars = calendarDoc?.calendars || config.calendars;
  const protectedSecurityIds = unique([...(config.protectedSecurityIds || []), ...(config.protectedSecurityIdsPaths || []).flatMap(path => read(path).securityIds || [])]);
  return compileEurope21ResolutionFromPaths({ ...config, calendars, now: config.now || calendarDoc?.generatedAt, protectedSecurityIds, onProgress });
}
/** The manifest authenticates bytes and scope, never an edited normalized row. */
export function readPinnedBaseline(directory, expectedManifestSha256) {
  if (!sha(expectedManifestSha256)) throw Error('PINNED_BASELINE_MANIFEST_SHA_REQUIRED');
  const root = privateReplayRoot(directory), bytes = readFileSync(regularFile(root, 'evidence-output-manifest.json'));
  if (hash(bytes) !== expectedManifestSha256) throw Error('BASELINE_MANIFEST_SHA_MISMATCH');
  const manifest = JSON.parse(bytes), files = new Map();
  if (manifest.publicationAllowed !== false || !Array.isArray(manifest.files)) throw Error('PRIVATE_BASELINE_REQUIRED');
  for (const entry of manifest.files) {
    if (!/^[a-z0-9_]+\.json$/.test(entry.name) || files.has(entry.name)) throw Error('INVALID_MANIFEST_FILE');
    const body = readFileSync(regularFile(root, entry.name));
    if (body.length !== entry.bytes || hash(body) !== entry.sha256) throw Error('BASELINE_FILE_SHA_MISMATCH');
    const value = JSON.parse(body);
    if (value.publicationAllowed !== false || !['PRIVATE_RESEARCH', 'PRIVATE_DISCOVERY'].includes(value.mode)) throw Error('PRIVATE_BASELINE_FILE_REQUIRED');
    files.set(entry.name, value);
  }
  const get = name => { if (!files.has(name)) throw Error('BASELINE_FILE_REQUIRED:' + name); return files.get(name); };
  return { baselineUniverse: get('marketstack_europe_equity_universe.json'), priceQuality: get('marketstack_europe_price_quality.json'),
    freshness: get('marketstack_europe_freshness.json'), adjustments: get('marketstack_europe_adjustment_status.json'),
    productReadiness: get('marketstack_europe_product_readiness.json'), indexCoverage: get('marketstack_europe_index_coverage.json'),
    sourceBinding: { directory: root, manifestSha256: expectedManifestSha256, generatedAt: manifest.generatedAt,
      files: manifest.files.map(e => ({ name: e.name, sha256: e.sha256, bytes: e.bytes })) } };
}

export function writePrivateReviewArtifacts({ baseline, out }) {
  const root = privateReplayRoot(out); mkdirSync(root, { recursive: true, mode: 0o700 });
  const clusters = buildReviewClusters(baseline), resolution = buildReviewResolutionPlan({ ...baseline, clusters });
  const graph = buildCanonicalEuropeGraph(baseline);
  const plan = buildPrioritizedRefreshPlan({ ...baseline, resolution });
  const artifacts = { europe_review_clusters: clusters, europe_review_resolution: resolution, europe_identity_readiness: graph,
    europe_prioritized_refresh_plan: plan };
  const files = Object.entries(artifacts).map(([name, data]) => {
    const bytes = Buffer.from(JSON.stringify(data)); atomicJson(root, name + '.json', bytes);
    return { name: name + '.json', bytes: bytes.length, sha256: hash(bytes) };
  });
  const manifest = { schema: 'vu-europe-review-output-2.1', publicationAllowed: false, mode: 'PRIVATE_RESEARCH', sourceBinding: baseline.sourceBinding, files };
  atomicJson(root, 'review-output-manifest.json', JSON.stringify(manifest));
  return { manifest, counts: clusters.counts, graphCounts: graph.counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i), arg.slice(i + 1)]; }));
  if (!args['--baseline'] || !args['--baseline-sha'] || !args['--out']) throw Error('BASELINE_SHA_AND_PRIVATE_OUT_REQUIRED');
  const result = writePrivateReviewArtifacts({ baseline: readPinnedBaseline(args['--baseline'], args['--baseline-sha']), out: args['--out'] });
  console.log(JSON.stringify({ counts: result.counts, graph: result.graphCounts, files: result.manifest.files }));
}
