/* Concrete, append-only canonical staging. Apply is a separate, fail-closed
 * transaction requiring QA evidence bound to these exact staged bytes.
 * This module neither fetches prices nor manufactures factors/projections. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, unlinkSync, lstatSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { hostname } from 'node:os';
import { classifyCandidate } from './tiingo2-policy.mjs';
const Company = createRequire(import.meta.url)('../../quant/engines/company-master.js');
export const REQUIRED_PUBLICATION_QA = ['IDENTITY', 'BASELINE', 'PROJECTIONS', 'SEARCH', 'CHARTS', 'WATCHLIST', 'QUANT', 'DISCOVER', 'SCREENER', 'SUPERTRADER', 'SEC', 'RELEASE', 'BROWSER'];
export const REQUIRED_CANONICAL_PROJECTIONS = ['quant/data/universe/master-manifest.json', 'quant/data/universe/search/manifest.json', 'quant/data/universe/market-capability.json', 'quant/data/product/universe-list-v1.json.gz', 'discover/data/meta.json'];
export const CANONICAL_PUBLICATION_PATHS = {
  raw: 'quant/data/market/scale/universe-FULL_UNIVERSE.json',
  eligibility: 'quant/data/market/security-master/eligibility.json',
  names: 'quant/data/market/security-master/company-names.json',
  instruments: 'quant/data/universe/instruments'
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (data) => Buffer.from(JSON.stringify(data, null, 2) + '\n');
const symbol = (row) => String(row.ticker ?? row.symbol ?? row.listing?.ticker ?? '').toUpperCase().trim();
const currentHash = (file) => existsSync(file) ? sha(readFileSync(file)) : null;
function guardedPath(root, path) {
  if (typeof path !== 'string' || !path || path.includes('\\')) throw new Error('INVALID_PUBLICATION_PATH');
  const full = resolve(root, path), rel = relative(resolve(root), full);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || resolve(path) === path) throw new Error('UNSAFE_PUBLICATION_PATH');
  let cursor = resolve(root);
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    try { if (lstatSync(cursor).isSymbolicLink()) throw new Error('SYMLINK_PUBLICATION_PATH'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return full;
}
function canonicalPath(path) {
  return Object.values(CANONICAL_PUBLICATION_PATHS).slice(0, 3).includes(path) || /^quant\/data\/universe\/instruments\/[A-Z0-9_-]+\.json$/.test(path) || projectionPath(path);
}
function projectionPath(path) { return REQUIRED_CANONICAL_PROJECTIONS.includes(path) || /^quant\/data\/universe\/search\/(sym|name)\/[A-Za-z0-9_-]+\.json$/.test(path); }
function readDocument(root, path) { return JSON.parse(readFileSync(guardedPath(root, path), 'utf8')); }
function assertPrefix(before, after, field) {
  if (after[field].length < before[field].length) throw new Error('BASELINE_REMOVAL');
  for (let i = 0; i < before[field].length; i++) if (JSON.stringify(before[field][i]) !== JSON.stringify(after[field][i])) throw new Error('BASELINE_ROW_CHANGED');
}
function bump(map, field) { map[field] = (map[field] ?? 0) + 1; }

/** baselineHashes is an optional path => sha256 map. Every source read is
 * independently captured in the manifest and checked again at apply time.
 * candidates may include both eligible and withheld rows; only preview.ADDED
 * is staged, and those rows are independently rechecked by consumer policy. */
export function stageCanonicalPublication({ root, output, candidates, preview, baselineHashes = {}, runId, today }) {
  root = resolve(root); output = resolve(output);
  if (!runId || !Array.isArray(candidates) || !Array.isArray(preview?.ADDED) || preview.REMOVED?.length) throw new Error('INVALID_APPEND_ONLY_STAGE');
  if (output === root || output.startsWith(join(root, 'quant') + sep)) throw new Error('OUTPUT_MUST_NOT_BE_CANONICAL');
  const stageDate = today ?? preview.asOf ?? new Date().toISOString().slice(0, 10);
  const paths = CANONICAL_PUBLICATION_PATHS;
  const rawBefore = readDocument(root, paths.raw), eligibilityBefore = readDocument(root, paths.eligibility), namesBefore = readDocument(root, paths.names);
  const raw = structuredClone(rawBefore), eligibility = structuredClone(eligibilityBefore), names = structuredClone(namesBefore);
  const originals = new Map([[paths.raw, rawBefore], [paths.eligibility, eligibilityBefore], [paths.names, namesBefore]]);
  const sourceHashes = {};
  const capture = (path) => {
    const found = currentHash(guardedPath(root, path));
    if (Object.hasOwn(baselineHashes, path) && baselineHashes[path] !== found) throw new Error('STALE_STAGE_BASELINE:' + path);
    sourceHashes[path] = found;
  };
  for (const path of Object.keys(baselineHashes)) { guardedPath(root, path); capture(path); }
  for (const path of originals.keys()) capture(path);
  const shards = new Map(), historicalSymbols = new Set(), historicalIds = new Set();
  const instrumentDirectory = guardedPath(root, paths.instruments);
  if (!existsSync(instrumentDirectory)) throw new Error('CANONICAL_INSTRUMENT_BASELINE_MISSING');
  for (const file of readdirSync(instrumentDirectory).filter((name) => name.endsWith('.json')).sort()) {
    const path = paths.instruments + '/' + file;
    capture(path);
    const doc = readDocument(root, path);
    shards.set(path, structuredClone(doc)); originals.set(path, doc);
    for (const instrument of doc.instruments ?? []) {
      historicalSymbols.add(symbol(instrument)); historicalIds.add(instrument.instrumentId);
      for (const id of instrument.legacyIds ?? []) historicalIds.add(id);
      if (instrument.masterMemberId) historicalIds.add(instrument.masterMemberId);
    }
  }
  const existingSymbols = new Set([...raw.securities, ...eligibility.decisions, ...names.rows].map(symbol));
  const existingIds = new Set([...raw.securities, ...eligibility.decisions, ...names.rows].map((row) => row.securityId).filter(Boolean));
  const candidateMap = new Map();
  for (const row of candidates) {
    const t = symbol(row);
    if (candidateMap.has(t) && JSON.stringify(candidateMap.get(t)) !== JSON.stringify(row)) throw new Error('AMBIGUOUS_STAGE_CANDIDATE:' + t);
    candidateMap.set(t, row);
  }
  const stagedSymbols = new Set(), changedShards = new Set(), additions = [];
  for (const added of [...preview.ADDED].sort((a, b) => symbol(a).localeCompare(symbol(b)))) {
    const t = symbol(added), candidate = candidateMap.get(t);
    if (!candidate || stagedSymbols.has(t)) throw new Error('MISSING_OR_DUPLICATE_STAGE_CANDIDATE:' + t);
    const listing = { ...(candidate.listing ?? candidate), ticker: t, securityId: candidate.securityId, provider: 'tiingo' };
    if (!listing.name && !listing.companyName && candidate.companyName) listing.name = candidate.companyName;
    const verified = classifyCandidate({ ...candidate, ticker: t }, { today: stageDate, peers: candidates, root });
    if (!verified.publicationReady || !candidate.securityId || candidate.securityId !== added.securityId) throw new Error('CANDIDATE_NOT_PUBLICATION_READY:' + t);
    if (!listing.exchange || existingSymbols.has(t) || historicalSymbols.has(t) || existingIds.has(candidate.securityId) || historicalIds.has(candidate.securityId)) throw new Error('EXISTING_OR_HISTORICAL_IDENTITY_REQUIRES_RECONCILIATION:' + t);
    const baseInstrument = Company.toInstrument(listing, { today: stageDate, provider: 'tiingo' });
    const targetType = verified.policy.instrumentType === 'ADR' ? 'ADR' : 'COMMON_STOCK';
    // An explicit master ADR classification can be stronger than Tiingo's
    // generic Stock label. Derivative/fund conflicts are never overridden.
    if (!['COMMON_STOCK', 'ADR', 'REIT', 'TRUST', 'SPAC'].includes(baseInstrument.securityType)) throw new Error('CANONICAL_CLASSIFICATION_CONFLICT:' + t);
    const instrument = verified.policy.instrumentType === 'ADR' && baseInstrument.securityType === 'COMMON_STOCK'
      ? Company.toInstrument(listing, { today: stageDate, provider: 'tiingo', classification: { ...candidate.classification,
        country: baseInstrument.country, currency: baseInstrument.currency, instrumentType: targetType, confidence: candidate.classification?.confidence ?? baseInstrument.securityTypeConfidence,
        typeBasis: 'VERIFIED_SECURITY_MASTER', shareClass: baseInstrument.shareClass, subtype: baseInstrument.subtype, otc: baseInstrument.otc,
        active: baseInstrument.active, activeBasis: baseInstrument.activeBasis, startDate: baseInstrument.firstTradeDate, endDate: baseInstrument.lastTradeDate,
        screenerEligible: baseInstrument.screenerEligible, assetType: baseInstrument.assetTypeRaw, adrEvidence: 'verifiedSecurityMaster' } })
      : baseInstrument;
    instrument.instrumentId = Company.mintInstrumentId(listing, 0);
    if (historicalIds.has(instrument.instrumentId)) throw new Error('CANONICAL_INSTRUMENT_ID_COLLISION:' + t);
    if (!['COMMON_STOCK', 'ADR', 'REIT', 'TRUST', 'SPAC'].includes(instrument.securityType) || instrument.active === false) throw new Error('CANONICAL_CLASSIFICATION_CONFLICT:' + t);
    const instrumentType = verified.policy.instrumentType;
    const productClass = ['ADR', 'REIT', 'TRUST', 'SPAC'].includes(instrumentType) ? 'SEPARATE_CLASS' : 'ELIGIBLE';
    const decision = { ticker: t, securityId: candidate.securityId, exchange: listing.exchange,
      instrument_type: instrumentType, classification_status: 'CLASSIFIED', classification_confidence: candidate.classification?.confidence ?? instrument.securityTypeConfidence,
      active_status: 'ACTIVE', product_eligibility: productClass, product_eligibility_reason: 'TIINGO2_VERIFIED_INCREMENTAL_ADDITION', evidence_source: 'TIINGO2_STAGED_QA', review_flags: [], start_date: listing.startDate ?? null };
    Company.applyEligibility(instrument, decision);
    instrument.firstSeen = stageDate;
    if (instrument.active === null) { instrument.active = true; instrument.activeBasis = 'Tiingo2 explicit active evidence'; }
    const cik = candidate.evidence?.sec?.cik ?? candidate.cik;
    if (/^\d{10}$/.test(String(cik ?? ''))) { instrument.cik = cik; instrument.cikSource = 'TIINGO2_VERIFIED_SEC_MAPPING'; instrument.issuerId = Company.issuerIdFromCik(cik); instrument.issuerIdSource = instrument.cikSource; }
    const name = candidate.companyName ?? listing.name ?? listing.companyName ?? null;
    const resolvedName = typeof name === 'string' && name.trim() && name.trim().toUpperCase() !== t ? name : null;
    raw.securities.push({ securityId: candidate.securityId, ticker: t, company: resolvedName, exchange: listing.exchange, country: instrument.country ?? 'US', currency: instrument.currency ?? null, assetType: listing.assetType ?? 'Stock', instrumentType: instrument.securityType, active: true, providerSymbol: t, provider: 'tiingo', sector: null, sectorStatus: 'SOURCE_MISSING', industry: null, industryStatus: 'SOURCE_MISSING', startDate: listing.startDate ?? null, selection: 'tiingo2:' + runId });
    eligibility.decisions.push(decision);
    names.rows.push({ securityId: candidate.securityId, ticker: t, exchange: listing.exchange, providerSymbol: t, inProductUniverse: true, companyName: resolvedName, displayName: resolvedName, nameSource: resolvedName ? 'TIINGO_METADATA' : null, nameAsOf: stageDate, cik: instrument.cik, status: resolvedName ? 'RESOLVED' : 'UNRESOLVED', reason: resolvedName ? null : 'PROVIDER_HAS_NO_NAME', nameConflict: null, confirmedBy: null, candidates: {} });
    const shardPath = paths.instruments + '/' + Company.shardKey(t) + '.json';
    if (!shards.has(shardPath)) { capture(shardPath); shards.set(shardPath, { shard: Company.shardKey(t), engine: Company.VERSION, count: 0, instruments: [] }); }
    const shard = shards.get(shardPath); shard.instruments.push(instrument); shard.count = shard.instruments.length; changedShards.add(shardPath);
    stagedSymbols.add(t); existingSymbols.add(t); existingIds.add(candidate.securityId); historicalIds.add(instrument.instrumentId);
    additions.push({ ticker: t, securityId: candidate.securityId, instrumentId: instrument.instrumentId, issuerId: instrument.issuerId, quantReady: verified.productReadiness.quant });
    if (raw.byExchange) bump(raw.byExchange, listing.exchange);
    if (raw.bySector) bump(raw.bySector, 'UNKNOWN');
  }
  const files = [], stagedContents = new Map();
  if (additions.length) {
    raw.actualSize = raw.securities.length;
    eligibility.counts = { universeMembers: eligibility.decisions.length, ELIGIBLE: 0, SEPARATE_CLASS: 0, EXCLUDED: 0, REVIEW: 0, productUniverse: 0 };
    for (const row of eligibility.decisions) { bump(eligibility.counts, row.product_eligibility); if (row.product_eligibility !== 'EXCLUDED') eligibility.counts.productUniverse++; }
    eligibility.excludedByClass = {}; eligibility.separateByClass = {};
    for (const row of eligibility.decisions) {
      if (row.product_eligibility === 'EXCLUDED') bump(eligibility.excludedByClass, row.instrument_type);
      if (row.product_eligibility === 'SEPARATE_CLASS') bump(eligibility.separateByClass, row.instrument_type);
    }
    for (const doc of [raw, eligibility, names]) doc.tiingo2Refresh = { runId, asOf: stageDate, addedMembers: additions.length, removals: 0 };
    const rawBytes = jsonBytes(raw);
    eligibility.nonDestructive = { ...eligibility.nonDestructive, universeFile: paths.raw, universeMembersBefore: rawBefore.securities.length, universeMembersAfter: raw.securities.length, universeSha256: sha(rawBytes), membersRemoved: 0, r2ObjectsDeleted: 0 };
    if (eligibility.nameLayer) eligibility.nameLayer = { ...eligibility.nameLayer, sha256: null, names: names.rows.length, incrementalRunId: runId };
    names.counts = { ...names.counts, rows: names.rows.length, productRows: names.rows.filter((row) => row.inProductUniverse).length, resolved: names.rows.filter((row) => row.inProductUniverse && row.status === 'RESOLVED').length, unresolved: names.rows.filter((row) => row.inProductUniverse && row.status !== 'RESOLVED').length };
    names.counts.bySource = {}; names.counts.unresolvedReasons = {};
    for (const row of names.rows.filter((row) => row.inProductUniverse)) {
      if (row.status === 'RESOLVED') bump(names.counts.bySource, row.nameSource);
      else bump(names.counts.unresolvedReasons, row.reason ?? 'UNKNOWN');
    }
    names.master = { ...names.master, file: paths.eligibility, sha256: sha(jsonBytes(eligibility)), productUniverse: eligibility.counts.productUniverse };
    const prepared = new Map([[paths.raw, raw], [paths.eligibility, eligibility], [paths.names, names], ...[...changedShards].map((path) => [path, shards.get(path)])]);
    for (const [path, doc] of prepared) {
      const field = path === paths.raw ? 'securities' : path === paths.eligibility ? 'decisions' : path === paths.names ? 'rows' : 'instruments';
      if (originals.has(path)) assertPrefix(originals.get(path), doc, field);
      const bytes = jsonBytes(doc), stagedPath = 'files/' + path;
      guardedPath(output, stagedPath); stagedContents.set(stagedPath, bytes);
      files.push({ path, stagedPath, baselineSha256: sourceHashes[path], stagedSha256: sha(bytes), bytes: bytes.length, unchangedBaselineRows: originals.get(path)?.[field]?.length ?? 0 });
    }
  }
  const manifest = { schemaVersion: 'tiingo2-canonical-publication-1.0.0', runId, asOf: stageDate, status: 'STAGED_ONLY', additions, removals: [], baselineHashes: sourceHashes, files, requiredQA: REQUIRED_PUBLICATION_QA, projectionRequired: REQUIRED_CANONICAL_PROJECTIONS, projectionStatus: 'NOT_MATERIALIZED', canonicalFilesWritten: false };
  const manifestBytes = jsonBytes(manifest), manifestPath = join(output, 'manifest.json');
  if (existsSync(manifestPath) && sha(readFileSync(manifestPath)) !== sha(manifestBytes)) throw new Error('STAGE_RUN_ALREADY_HAS_DIFFERENT_CONTENT');
  for (const [path, bytes] of stagedContents) {
    const destination = guardedPath(output, path); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
  }
  mkdirSync(output, { recursive: true }); writeFileSync(manifestPath, manifestBytes);
  return { ...manifest, manifestPath, manifestSha256: sha(manifestBytes) };
}

function loadStage(staged) {
  const path = typeof staged === 'string' ? join(resolve(staged), 'manifest.json') : staged.manifestPath;
  const bytes = readFileSync(path), manifest = JSON.parse(bytes);
  if (manifest.schemaVersion !== 'tiingo2-canonical-publication-1.0.0' || !Array.isArray(manifest.files) || manifest.removals?.length) throw new Error('INVALID_STAGE_MANIFEST');
  return { manifest, manifestSha256: sha(bytes), output: dirname(path) };
}
function atomicWrite(file, bytes) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + '.tiingo2-' + process.pid + '.tmp';
  try { writeFileSync(tmp, bytes); renameSync(tmp, file); } finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
function publicationLock(root) {
  const file = join(root, '.market-cache/tiingo2-publication.lock'); mkdirSync(dirname(file), { recursive: true });
  let fd;
  try { fd = openSync(file, 'wx'); }
  catch {
    // Serialize reclamation itself. Without this mutex two stale-owner
    // readers could each unlink the other's newly acquired live lock.
    const recoveryPath = file + '.recovery';
    let recoveryFd;
    try { recoveryFd = openSync(recoveryPath, 'wx'); } catch { throw new Error('PUBLICATION_LOCK_RECOVERY_BUSY'); }
    try {
      writeFileSync(recoveryFd, JSON.stringify({ pid: process.pid, host: hostname() }));
      let previous;
      try { previous = JSON.parse(readFileSync(file)); } catch { throw new Error('PUBLICATION_TRANSACTION_LOCKED'); }
      if (previous.host !== hostname() || !Number.isInteger(previous.pid) || previous.pid <= 0) throw new Error('PUBLICATION_TRANSACTION_LOCKED');
      try { process.kill(previous.pid, 0); throw new Error('PUBLICATION_TRANSACTION_LOCKED'); }
      catch (error) { if (error.code !== 'ESRCH') throw new Error('PUBLICATION_TRANSACTION_LOCKED'); }
      // Only demonstrably dead owners on this host may be recovered. An
      // unknown host, live/reused PID or unreadable owner stays fail-closed.
      unlinkSync(file);
      try { fd = openSync(file, 'wx'); } catch { throw new Error('PUBLICATION_TRANSACTION_LOCKED'); }
    } finally { closeSync(recoveryFd); unlinkSync(recoveryPath); }
  }
  writeFileSync(fd, JSON.stringify({ pid: process.pid, host: hostname() }));
  return () => { closeSync(fd); unlinkSync(file); };
}

function verifyCanonicalProjections({ root, output, manifest }) {
  const entries = new Map(manifest.files.map((file) => [file.path, file]));
  const bytesFor = (path) => {
    const entry = entries.get(path);
    if (!entry) throw new Error('CANONICAL_PROJECTION_MISSING:' + path);
    const bytes = readFileSync(guardedPath(output, entry.stagedPath));
    if (sha(bytes) !== entry.stagedSha256) throw new Error('CANONICAL_PROJECTION_INTEGRITY_FAILED');
    return bytes;
  };
  const docFor = (path) => JSON.parse(bytesFor(path));
  const preserveMembers = (path, field, id) => {
    if (!existsSync(guardedPath(root, path))) return;
    const before = readDocument(root, path);
    const after = path.endsWith('.gz') ? JSON.parse(gunzipSync(bytesFor(path))) : docFor(path);
    const afterIds = new Set((after[field] ?? []).map(id));
    if ((before[field] ?? []).some((row) => !afterIds.has(id(row)))) throw new Error('BASELINE_PROJECTION_MEMBER_DROPPED:' + path);
  };
  for (const path of REQUIRED_CANONICAL_PROJECTIONS) bytesFor(path);
  const master = docFor('quant/data/universe/master-manifest.json');
  const index = master.shards?.index;
  if (!Array.isArray(index) || master.totals?.published !== index.reduce((n, row) => n + row.count, 0)) throw new Error('MASTER_PROJECTION_COUNT_MISMATCH');
  for (const path of Object.keys(manifest.baselineHashes).filter((path) => path.startsWith(CANONICAL_PUBLICATION_PATHS.instruments + '/'))) {
    if (manifest.baselineHashes[path] !== null && !index.some((row) => CANONICAL_PUBLICATION_PATHS.instruments + '/' + row.shard + '.json' === path)) throw new Error('MASTER_BASELINE_SHARD_DROPPED');
  }
  for (const shard of index) {
    const path = CANONICAL_PUBLICATION_PATHS.instruments + '/' + shard.shard + '.json';
    const doc = entries.has(path) ? docFor(path) : readDocument(root, path);
    if (shard.count !== doc.instruments?.length) throw new Error('MASTER_SHARD_PROJECTION_MISMATCH');
  }
  const searchManifest = docFor('quant/data/universe/search/manifest.json');
  const baselineSearch = existsSync(guardedPath(root, 'quant/data/universe/search/manifest.json')) ? readDocument(root, 'quant/data/universe/search/manifest.json') : null;
  const nameEntries = [];
  for (const mode of ['sym', 'name']) {
    const descriptors = searchManifest[mode] ?? [];
    if (!Array.isArray(descriptors)) throw new Error('INVALID_SEARCH_PROJECTION_MANIFEST');
    if ((baselineSearch?.[mode] ?? []).some((row) => !descriptors.some((after) => after.shard === row.shard))) throw new Error('BASELINE_SEARCH_SHARD_REFERENCE_DROPPED');
    for (const descriptor of descriptors) {
      const path = 'quant/data/universe/search/' + mode + '/' + descriptor.shard + '.json';
      const doc = entries.has(path) ? docFor(path) : readDocument(root, path);
      if (descriptor.count !== doc.entries?.length) throw new Error('SEARCH_PROJECTION_MANIFEST_MISMATCH');
      if (mode === 'name') nameEntries.push(...doc.entries);
    }
  }
  const capability = docFor('quant/data/universe/market-capability.json');
  const universe = JSON.parse(gunzipSync(bytesFor('quant/data/product/universe-list-v1.json.gz')));
  const discover = docFor('discover/data/meta.json');
  const eligibilityHash = entries.get(CANONICAL_PUBLICATION_PATHS.eligibility)?.stagedSha256 ?? manifest.baselineHashes[CANONICAL_PUBLICATION_PATHS.eligibility];
  if (discover.universeSource?.source !== 'SECURITY_MASTER' || discover.universeSource?.file !== CANONICAL_PUBLICATION_PATHS.eligibility || discover.universeSource?.sha256 !== eligibilityHash) throw new Error('DISCOVER_PROJECTION_SOURCE_MISMATCH');
  preserveMembers('quant/data/universe/market-capability.json', 'members', (row) => [row.s, row.m, row.i].join('|'));
  const universePath = 'quant/data/product/universe-list-v1.json.gz';
  if (existsSync(guardedPath(root, universePath))) {
    const before = JSON.parse(gunzipSync(readFileSync(guardedPath(root, universePath))));
    const symbols = new Set((universe.entries ?? []).map((row) => row.s));
    if ((before.entries ?? []).some((row) => !symbols.has(row.s))) throw new Error('BASELINE_PROJECTION_MEMBER_DROPPED:' + universePath);
  }
  for (const path of entries.keys()) if (/^quant\/data\/universe\/search\/(sym|name)\//.test(path)) preserveMembers(path, 'entries', (row) => row.i);
  for (const addition of manifest.additions) {
    const shard = Company.shardKey(addition.ticker);
    const instrumentPath = CANONICAL_PUBLICATION_PATHS.instruments + '/' + shard + '.json';
    if (!index.some((row) => row.shard === shard)) throw new Error('MASTER_ADDITION_NOT_INDEXED');
    const search = docFor('quant/data/universe/search/sym/' + shard + '.json');
    if (!searchManifest.sym?.some((row) => row.shard === shard && row.count === search.entries?.length)) throw new Error('SEARCH_PROJECTION_MANIFEST_MISMATCH');
    if (!search.entries?.some((row) => row.s === addition.ticker && row.i === addition.instrumentId)) throw new Error('SEARCH_ADDITION_NOT_INDEXED');
    if (!capability.members?.some((row) => row.s === addition.ticker && row.m === addition.securityId && row.i === addition.instrumentId && row.ph === true)) throw new Error('CHART_ADDITION_NOT_MATERIALIZED');
    if (!universe.entries?.some((row) => row.s === addition.ticker && Number.isFinite(row.c) && row.c > 0 && typeof row.d === 'string')) throw new Error('UNIVERSE_LIST_ADDITION_NOT_MATERIALIZED');
    const instrument = docFor(instrumentPath).instruments?.find((row) => row.instrumentId === addition.instrumentId);
    if (!instrument) throw new Error('CANONICAL_ADDITION_NOT_MATERIALIZED');
    if (instrument.companyName && !nameEntries.some((row) => row.i === addition.instrumentId)) throw new Error('SEARCH_COMPANY_NAME_NOT_INDEXED');
  }
  return true;
}

/** Attach actual outputs from existing canonical builders. Missing price or
 * projection outputs stay blockers; arbitrary QA PASS cannot bypass them. */
export function attachCanonicalProjections({ root, staged, preparedFiles }) {
  root = resolve(root);
  const { manifest, output } = loadStage(staged);
  if (existsSync(join(output, 'applied.json'))) throw new Error('CANNOT_CHANGE_APPLIED_TRANSACTION');
  if (!Array.isArray(preparedFiles)) throw new Error('INVALID_PREPARED_PROJECTIONS');
  const proposed = structuredClone(manifest), contents = new Map(), seenPaths = new Set();
  for (const file of preparedFiles) {
    if (!projectionPath(file.path) || seenPaths.has(file.path)) throw new Error('INVALID_OR_DUPLICATE_PROJECTION_PATH');
    seenPaths.add(file.path);
    const bytes = Buffer.from(file.bytes);
    const baseline = currentHash(guardedPath(root, file.path)), stagedPath = 'projection-blobs/' + sha(bytes) + '.bin';
    proposed.baselineHashes[file.path] = baseline;
    proposed.files = proposed.files.filter((entry) => entry.path !== file.path);
    proposed.files.push({ path: file.path, stagedPath, baselineSha256: baseline, stagedSha256: sha(bytes), bytes: bytes.length, projection: true });
    contents.set(stagedPath, bytes);
  }
  const searchManifestEntry = proposed.files.find((file) => file.path === 'quant/data/universe/search/manifest.json');
  if (searchManifestEntry) {
    const search = JSON.parse(contents.get(searchManifestEntry.stagedPath) ?? readFileSync(guardedPath(output, searchManifestEntry.stagedPath)));
    for (const mode of ['sym', 'name']) for (const descriptor of search[mode] ?? []) {
      const path = 'quant/data/universe/search/' + mode + '/' + descriptor.shard + '.json';
      if (!Object.hasOwn(proposed.baselineHashes, path)) proposed.baselineHashes[path] = currentHash(guardedPath(root, path));
    }
  }
  // Immutable content blobs leave any prior valid stage intact even if a
  // new attachment fails. Advance the manifest only after real reader checks.
  for (const [path, bytes] of contents) atomicWrite(guardedPath(output, path), bytes);
  verifyCanonicalProjections({ root, output, manifest: proposed });
  proposed.projectionStatus = 'MATERIALIZED_AND_VERIFIED';
  proposed.files.sort((a, b) => a.path.localeCompare(b.path));
  const bytes = jsonBytes(proposed), manifestPath = join(output, 'manifest.json'); atomicWrite(manifestPath, bytes);
  return { ...proposed, manifestPath, manifestSha256: sha(bytes) };
}

/** Explicit QA proof must be {manifestSha256,checks:{IDENTITY:'PASS',...}}.
 * No absent check, SKIPPED result or proof for another stage is accepted. */
export function applyCanonicalPublication({ root, staged, qaProof }) {
  root = resolve(root);
  const { manifest, manifestSha256, output } = loadStage(staged);
  if (qaProof?.manifestSha256 !== manifestSha256 || REQUIRED_PUBLICATION_QA.some((check) => qaProof.checks?.[check] !== 'PASS')) throw new Error('PUBLICATION_QA_NOT_GREEN');
  if (manifest.projectionStatus !== 'MATERIALIZED_AND_VERIFIED') throw new Error('CANONICAL_PROJECTIONS_NOT_MATERIALIZED');
  const unlock = publicationLock(root), receiptPath = join(output, 'applied.json');
  try {
    if (existsSync(receiptPath)) {
      const receipt = JSON.parse(readFileSync(receiptPath));
      if (receipt.status === 'APPLIED' && receipt.manifestSha256 === manifestSha256) {
        for (const entry of manifest.files) if (currentHash(guardedPath(root, entry.path)) !== entry.stagedSha256) throw new Error('APPLIED_FILES_HAVE_CHANGED');
        verifyCanonicalProjections({ root, output, manifest });
        return { ...receipt, status: 'ALREADY_APPLIED' };
      }
      if (receipt.status === 'PREPARED') throw new Error('INTERRUPTED_TRANSACTION_REQUIRES_ROLLBACK');
    }
    for (const [path, expected] of Object.entries(manifest.baselineHashes)) if (currentHash(guardedPath(root, path)) !== expected) throw new Error('PUBLICATION_BASELINE_CAS_FAILED:' + path);
    verifyCanonicalProjections({ root, output, manifest });
    const prepared = manifest.files.map((entry) => {
      if (!canonicalPath(entry.path)) throw new Error('UNSUPPORTED_CANONICAL_PUBLICATION_PATH');
      const bytes = readFileSync(guardedPath(output, entry.stagedPath));
      if (sha(bytes) !== entry.stagedSha256 || manifest.baselineHashes[entry.path] !== entry.baselineSha256) throw new Error('STAGED_CONTENT_INTEGRITY_FAILED');
      return { ...entry, bytes };
    });
    for (const entry of prepared) {
      if (entry.baselineSha256 === null) continue;
      const backup = guardedPath(output, 'rollback/' + entry.path);
      mkdirSync(dirname(backup), { recursive: true }); writeFileSync(backup, readFileSync(guardedPath(root, entry.path)));
    }
    const receipt = { status: 'PREPARED', runId: manifest.runId, manifestSha256, files: manifest.files, qaProof, baselineHashes: manifest.baselineHashes };
    atomicWrite(receiptPath, jsonBytes(receipt));
    const written = [];
    try {
      for (const entry of prepared) { atomicWrite(guardedPath(root, entry.path), entry.bytes); written.push(entry); }
      receipt.status = 'APPLIED'; atomicWrite(receiptPath, jsonBytes(receipt)); return receipt;
    } catch (error) {
      for (const entry of written.reverse()) {
        const file = guardedPath(root, entry.path);
        if (entry.baselineSha256 === null) { if (existsSync(file)) unlinkSync(file); }
        else atomicWrite(file, readFileSync(guardedPath(output, 'rollback/' + entry.path)));
      }
      receipt.status = 'ROLLED_BACK'; receipt.error = error.message; atomicWrite(receiptPath, jsonBytes(receipt)); throw error;
    }
  } finally { unlock(); }
}

/** Restores exact original bytes. Refuses to overwrite a subsequent edit. */
export function rollbackCanonicalPublication({ root, staged }) {
  root = resolve(root);
  const { manifest, manifestSha256, output } = loadStage(staged), receiptPath = join(output, 'applied.json');
  const unlock = publicationLock(root);
  try {
    const receipt = JSON.parse(readFileSync(receiptPath));
    if (receipt.manifestSha256 !== manifestSha256) throw new Error('ROLLBACK_MANIFEST_MISMATCH');
    if (receipt.status === 'ROLLED_BACK') return receipt;
    const restores = manifest.files.map((entry) => {
      if (!canonicalPath(entry.path)) throw new Error('UNSUPPORTED_CANONICAL_PUBLICATION_PATH');
      const current = currentHash(guardedPath(root, entry.path));
      if (![entry.stagedSha256, entry.baselineSha256].includes(current)) throw new Error('ROLLBACK_WOULD_OVERWRITE_SUBSEQUENT_EDIT');
      const bytes = entry.baselineSha256 === null ? null : readFileSync(guardedPath(output, 'rollback/' + entry.path));
      if (bytes !== null && sha(bytes) !== entry.baselineSha256) throw new Error('ROLLBACK_BACKUP_INTEGRITY_FAILED');
      return { ...entry, bytes };
    });
    for (const entry of restores) {
      const file = guardedPath(root, entry.path);
      if (entry.bytes === null) { if (existsSync(file)) unlinkSync(file); }
      else atomicWrite(file, entry.bytes);
    }
    receipt.status = 'ROLLED_BACK'; atomicWrite(receiptPath, jsonBytes(receipt)); return receipt;
  } finally { unlock(); }
}
