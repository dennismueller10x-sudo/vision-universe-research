/* Research-only weekly loader. Wraps the UNCHANGED offline adapter (weekly-real-adapter.cjs) and adds opt-in
 * research registries. No productive caller (server/, backtest materialize/refresh/batch, V7/V8 runners) uses this
 * module, and it is not part of any backtest generation's code dependencies; the adapter itself is untouched.
 *
 * createResearchLoader(root, options)
 *   options is a plain object; every key is opt-in and DEFAULT OFF:
 *     identityEvidence: true                    apply the SEC-sourced bindings of research-identity-evidence.cjs
 *                                               (evidenceLevel SEC_SAME_DAY_PRICE_AND_COVER only)
 *     identityEvidenceAllowCoverPageOnly: true  additionally apply COVER_PAGE_ONLY bindings (requires identityEvidence)
 *     corporateActionEvidence: true             resolve UNRESOLVED corporate-action items that match a record of
 *                                               research-ca-evidence.cjs (same listing, same week/prevWeek, closes and
 *                                               weekly ratio within 1e-5); everything else is the unchanged validate()
 *     identityEvidenceProtocolV10: true         additionally apply the V10-protocol records (research-identity-evidence-1.1.0
 *                                               extension: SELECT_EXISTING_ROW for ambiguous baseline ids, SEC same-day price
 *                                               plus cover evidence only); requires identityEvidence. Separate flag because the
 *                                               owner decision of 2026-10-28 binds identityEvidence:true to the five dossier records.
 *     listingLifecycleEvidence: true            frozen weekly tails (>= 4 identical closes at the end): cut at the SEC-sourced last
 *                                               trading day of research-listing-lifecycle.cjs and attach listingLifecycle; frozen
 *                                               tails without a record fail closed (FROZEN_TAIL_UNRESOLVED); non-frozen ids without
 *                                               a record are returned exactly as without this option.
 *     identityEvidenceProtocolV12: true         additionally apply the V12 LARGECAP records (non-enumerable extension `v12` of
 *                                               research-identity-evidence.cjs, docs/quant-recovery/v12/largecap/protocol-1.0.0.json):
 *                                               SELECT_EXISTING_ROW(_BY_KEY) and RESTRICT_SINGLE_ROW (history only after an unresolved
 *                                               corporate action); requires identityEvidenceProtocolV10; replaces a V10 record of the same id.
 *     identityEvidenceProtocolV13Largecap: true additionally apply the V13 LARGECAP records (research-largecap-price-anchors.cjs,
 *                                               docs/quant-recovery/v13/largecap/protocol-1.0.0.json + amendment 1.0.1): CLOSED intervals
 *                                               [validFrom, validTo] confirmed by SEC price bands and symbol/exchange statements; requires
 *                                               identityEvidenceProtocolV12; a record never replaces another record (duplicate id fails closed).
 *   Unknown keys or non-boolean values fail closed (INVALID_LOADER_OPTIONS).
 *   Without any enabled option it returns the adapter's own createLoader(root) loader, so outputs are byte-identical,
 *   and neither research registry module is even required.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Adapter = require('./weekly-real-adapter.cjs');
const CorporateActions = require('./corporate-action-evidence.js');
const { validate, hash } = Adapter;

const LOADER_OPTIONS = Object.freeze(['identityEvidence', 'identityEvidenceAllowCoverPageOnly', 'corporateActionEvidence', 'identityEvidenceProtocolV10', 'listingLifecycleEvidence']);
// V12 LARGECAP (docs/quant-recovery/v12/largecap/protocol-1.0.0.json): identityEvidenceProtocolV12 additionally applies the records of the
// non-enumerable extension `v12` of research-identity-evidence.cjs (requires identityEvidenceProtocolV10); a v12 record replaces the V10 record
// of the same id only under this option. Kept in a separate list so LOADER_OPTIONS (V9/V10) is unchanged.
const LOADER_OPTIONS_V12 = Object.freeze(['identityEvidenceProtocolV12']);
// V13 LARGECAP (docs/quant-recovery/v13/largecap/protocol-1.0.0.json): separate list, LOADER_OPTIONS and LOADER_OPTIONS_V12 unchanged.
const LOADER_OPTIONS_V13 = Object.freeze(['identityEvidenceProtocolV13Largecap']);
function loaderOptions(options) {
  if (options === undefined) return {};
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options) !== Object.prototype) throw Error('INVALID_LOADER_OPTIONS');
  for (const [k, v] of Object.entries(options)) if (!(LOADER_OPTIONS.includes(k) || LOADER_OPTIONS_V12.includes(k) || LOADER_OPTIONS_V13.includes(k)) || typeof v !== 'boolean') throw Error('INVALID_LOADER_OPTIONS:' + k);
  if (options.identityEvidenceAllowCoverPageOnly && !options.identityEvidence) throw Error('INVALID_LOADER_OPTIONS:identityEvidenceAllowCoverPageOnly');
  if (options.identityEvidenceProtocolV10 && !options.identityEvidence) throw Error('INVALID_LOADER_OPTIONS:identityEvidenceProtocolV10');
  if (options.identityEvidenceProtocolV12 && !options.identityEvidenceProtocolV10) throw Error('INVALID_LOADER_OPTIONS:identityEvidenceProtocolV12');
  if (options.identityEvidenceProtocolV13Largecap && !options.identityEvidenceProtocolV12) throw Error('INVALID_LOADER_OPTIONS:identityEvidenceProtocolV13Largecap');
  return { ...options };
}

const IDENTITY_EVIDENCE_SCHEMA = 'research-identity-evidence-1.0.0', IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS = 400;
const IDENTITY_EVIDENCE_LEVELS = Object.freeze(['SEC_SAME_DAY_PRICE_AND_COVER', 'COVER_PAGE_ONLY']);
function validateIdentityEvidenceRegistry(reg) {
  const bad = why => { throw Error('INVALID_RESEARCH_IDENTITY_EVIDENCE:' + why); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, HEX = /^[a-f0-9]{64}$/, ACC = /^\d{10}-\d{2}-\d{6}$/, isDate = x => DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
  if (!reg || reg.schemaVersion !== IDENTITY_EVIDENCE_SCHEMA || !Array.isArray(reg.records) || !reg.records.length) bad('SCHEMA');
  const seen = new Set();
  for (const r of reg.records) {
    const id = r?.securityId;
    if (typeof id !== 'string' || !/^ref_[A-Za-z0-9_.-]+$/.test(id) || seen.has(id)) bad('SECURITY_ID'); seen.add(id);
    if (typeof r.ticker !== 'string' || id !== 'ref_' + r.ticker || !/^\d{10}$/.test(r.cik) || typeof r.issuer !== 'string' || !r.issuer) bad('ISSUER:' + id);
    if (typeof r.canonicalId !== 'string' || !r.canonicalId.startsWith('v9-sec-binding:' + r.cik + ':' + r.ticker + ':') || r.masterRowAction !== 'REPLACE_MISBOUND_ROW') bad('CANONICAL_ID:' + id);
    if (!Array.isArray(r.replacesCanonicalIds) || !r.replacesCanonicalIds.length || r.replacesCanonicalIds.some(x => typeof x !== 'string' || !x || x === r.canonicalId)) bad('REPLACES:' + id);
    if (!['XNAS', 'XNYS', 'XASE'].includes(r.mic) || !/COMMON/.test(r.instrumentClass || '') || r.currency !== 'USD' || typeof r.provider !== 'string' || r.activeStatus !== 'ACTIVE_SEC_CONFIRMED') bad('LISTING:' + id);
    if (!isDate(r.validFrom) || !(r.validTo === null || isDate(r.validTo) && r.validTo >= r.validFrom)) bad('INTERVAL:' + id);
    if (!IDENTITY_EVIDENCE_LEVELS.includes(r.evidenceLevel)) bad('EVIDENCE_LEVEL:' + id);
    const g = r.historyGuard; if (!g || g.checkedFrom !== r.validFrom || !isDate(g.checkedTo) || g.checkedTo < g.checkedFrom || !HEX.test(g.pointsSha256) || !Number.isInteger(g.bars) || g.bars < 1) bad('HISTORY_GUARD:' + id);
    const c = r.lastConfirmedCover; if (!c || !ACC.test(c.accession) || !isDate(c.filingDate) || !HEX.test(c.sha256)) bad('LAST_COVER:' + id);
    if (!Array.isArray(r.sources) || !r.sources.length || r.sources.some(s => !ACC.test(s?.accession) || !HEX.test(s.sha256) || typeof s.url !== 'string' || !s.url.startsWith('https://www.sec.gov/Archives/edgar/data/') || typeof s.claim !== 'string' || !s.claim)) bad('SOURCES:' + id);
    if (!r.sources.some(s => s.accession === c.accession && s.sha256 === c.sha256)) bad('LAST_COVER_NOT_SOURCED:' + id);
    const pe = r.priceEvidence; if (!Array.isArray(pe) || pe.some(p => !isDate(p?.date) || !ACC.test(p.accession) || !HEX.test(p.sha256))) bad('PRICE_EVIDENCE:' + id);
    if ((r.evidenceLevel === 'COVER_PAGE_ONLY') !== (pe.length === 0)) bad('EVIDENCE_LEVEL_PRICE_EVIDENCE:' + id);
  }
  return reg;
}
// V10 extension (research-identity-evidence-1.1.0): SELECT_EXISTING_ROW bindings for ambiguous baseline ids, qualified under
// docs/quant-recovery/v10/population/protocol-1.0.0.json. Only SEC_SAME_DAY_PRICE_AND_COVER; cover-only cases are never registered.
const IDENTITY_EVIDENCE_V10_SCHEMA = 'research-identity-evidence-1.1.0';
function validateIdentityEvidenceV10(reg) {
  const bad = why => { throw Error('INVALID_RESEARCH_IDENTITY_EVIDENCE_V10:' + why); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, HEX = /^[a-f0-9]{64}$/, ACC = /^\d{10}-\d{2}-\d{6}$/, isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
  const ext = reg && reg.v10;
  if (!ext || ext.schemaVersion !== IDENTITY_EVIDENCE_V10_SCHEMA || !HEX.test(ext.protocolSha256 || '') || !Array.isArray(ext.records)) bad('SCHEMA');
  const seen = new Set(reg.records.map(r => r.securityId));
  for (const r of ext.records) {
    const id = r?.securityId;
    if (typeof id !== 'string' || !/^ref_[A-Za-z0-9_.-]+$/.test(id) || seen.has(id)) bad('SECURITY_ID'); seen.add(id);
    if (typeof r.ticker !== 'string' || id !== 'ref_' + r.ticker || !/^\d{10}$/.test(r.cik) || typeof r.issuer !== 'string' || !r.issuer) bad('ISSUER:' + id);
    if (r.masterRowAction !== 'SELECT_EXISTING_ROW' || typeof r.selectedCanonicalId !== 'string' || !Array.isArray(r.masterRowSet) || r.masterRowSet.length < 2
      || r.masterRowSet.filter(x => x === r.selectedCanonicalId).length !== 1 || r.masterRowSet.some((x, i, a) => typeof x !== 'string' || (i && a[i - 1] > x))) bad('MASTER_ROW_SET:' + id);
    if (!['XNAS', 'XNYS', 'XASE'].includes(r.mic) || !/COMMON/.test(r.instrumentClass || '') || r.activeStatus !== 'ACTIVE_SEC_CONFIRMED') bad('LISTING:' + id);
    if (!isDate(r.validFrom) || r.validTo !== null) bad('INTERVAL:' + id);
    if (r.evidenceLevel !== 'SEC_SAME_DAY_PRICE_AND_COVER' || r.protocolSha256 !== ext.protocolSha256) bad('EVIDENCE_LEVEL:' + id);
    const g = r.historyGuard; if (!g || g.checkedFrom !== r.validFrom || !isDate(g.checkedTo) || g.checkedTo < g.checkedFrom || !HEX.test(g.pointsSha256) || !Number.isInteger(g.bars) || g.bars < 1) bad('HISTORY_GUARD:' + id);
    const c = r.lastConfirmedCover; if (!c || !ACC.test(c.accession) || !isDate(c.filingDate) || !HEX.test(c.sha256)) bad('LAST_COVER:' + id);
    if (!Array.isArray(r.sources) || r.sources.length < 2 || r.sources.some(s => !ACC.test(s?.accession) || !HEX.test(s.sha256) || typeof s.url !== 'string' || !s.url.startsWith('https://www.sec.gov/Archives/edgar/data/') || typeof s.claim !== 'string' || !s.claim)) bad('SOURCES:' + id);
    if (!r.sources.some(s => s.role === 'IXBRL_COVER_LATEST' && s.accession === c.accession && s.sha256 === c.sha256)) bad('LAST_COVER_NOT_SOURCED:' + id);
    const pe = r.priceEvidence;
    if (!Array.isArray(pe) || !pe.length || pe.some(p => !isDate(p?.date) || p.date < r.validFrom || !ACC.test(p.accession) || !HEX.test(p.sha256) || typeof p.quote !== 'string' || p.quote.length > 300
      || !(Math.abs(p.ratioSeriesToSource - 1) <= 0.02) || !r.sources.some(s => s.accession === p.accession && s.sha256 === p.sha256))) bad('PRICE_EVIDENCE:' + id);
  }
  return ext;
}
// V12 extension (research-identity-evidence-1.2.0), non-enumerable property `v12` of the registry so that JSON.stringify(registry) - and every
// existing registryHash - is unchanged. Actions: SELECT_EXISTING_ROW (as V10), SELECT_EXISTING_ROW_BY_KEY (duplicate canonical_id rows, protocol L5),
// RESTRICT_SINGLE_ROW (single master row, history only after an unresolved corporate action, protocol part RESTRICT).
const IDENTITY_EVIDENCE_V12_SCHEMA = 'research-identity-evidence-1.2.0';
const IDENTITY_V12_ACTIONS = Object.freeze(['SELECT_EXISTING_ROW', 'SELECT_EXISTING_ROW_BY_KEY', 'RESTRICT_SINGLE_ROW']);
const V12_RECORDS = new WeakSet();
const rowKey = r => r.canonical_id + '|' + r.active_status + '|' + r.end_date;
function validateIdentityEvidenceV12(reg) {
  const bad = why => { throw Error('INVALID_RESEARCH_IDENTITY_EVIDENCE_V12:' + why); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, HEX = /^[a-f0-9]{64}$/, ACC = /^\d{10}-\d{2}-\d{6}$/, isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
  const d = reg && Object.getOwnPropertyDescriptor(reg, 'v12'), ext = d && d.value;
  if (!d || d.enumerable || !ext || ext.schemaVersion !== IDENTITY_EVIDENCE_V12_SCHEMA || !HEX.test(ext.protocolSha256 || '') || !HEX.test(ext.v10ProtocolSha256 || '') || !Array.isArray(ext.records)) bad('SCHEMA');
  const dossier = new Set(reg.records.map(r => r.securityId)), seen = new Set();
  for (const r of ext.records) {
    const id = r?.securityId;
    if (typeof id !== 'string' || !/^ref_[A-Za-z0-9_.-]+$/.test(id) || dossier.has(id) || seen.has(id)) bad('SECURITY_ID'); seen.add(id);
    if (typeof r.ticker !== 'string' || id !== 'ref_' + r.ticker || !/^\d{10}$/.test(r.cik) || typeof r.issuer !== 'string' || !r.issuer) bad('ISSUER:' + id);
    if (!IDENTITY_V12_ACTIONS.includes(r.masterRowAction)) bad('ACTION:' + id);
    const sorted = a => Array.isArray(a) && a.every((x, i) => typeof x === 'string' && x && (!i || a[i - 1] < x));
    if (r.masterRowAction === 'SELECT_EXISTING_ROW' && (typeof r.selectedCanonicalId !== 'string' || !Array.isArray(r.masterRowSet) || r.masterRowSet.length < 2
      || r.masterRowSet.filter(x => x === r.selectedCanonicalId).length !== 1 || !sorted(r.masterRowSet))) bad('MASTER_ROW_SET:' + id);
    if (r.masterRowAction === 'SELECT_EXISTING_ROW_BY_KEY') {
      const k = r.selectedRowKey;
      if (!k || typeof k.canonicalId !== 'string' || k.activeStatus !== 'ACTIVE' || !isDate(k.endDate) || r.selectedCanonicalId !== k.canonicalId
        || !sorted(r.masterRowKeys) || r.masterRowKeys.length < 2 || r.masterRowKeys.filter(x => x === k.canonicalId + '|ACTIVE|' + k.endDate).length !== 1) bad('MASTER_ROW_KEYS:' + id);
    }
    if (r.masterRowAction === 'RESTRICT_SINGLE_ROW') {
      const e = r.caEvent;
      if (typeof r.selectedCanonicalId !== 'string' || !Array.isArray(r.masterRowSet) || r.masterRowSet.length !== 1 || r.masterRowSet[0] !== r.selectedCanonicalId
        || !e || !isDate(e.week) || typeof e.verdict !== 'string' || !e.verdict || !(r.validFrom > e.week)) bad('RESTRICT:' + id);
    }
    if (!['XNAS', 'XNYS', 'XASE'].includes(r.mic) || !/COMMON/.test(r.instrumentClass || '') || r.activeStatus !== 'ACTIVE_SEC_CONFIRMED') bad('LISTING:' + id);
    if (!isDate(r.validFrom) || r.validTo !== null) bad('INTERVAL:' + id);
    if (r.evidenceLevel !== 'SEC_SAME_DAY_PRICE_AND_COVER' || r.protocolSha256 !== ext.protocolSha256) bad('EVIDENCE_LEVEL:' + id);
    const g = r.historyGuard; if (!g || g.checkedFrom !== r.validFrom || !isDate(g.checkedTo) || g.checkedTo < g.checkedFrom || !HEX.test(g.pointsSha256) || !Number.isInteger(g.bars) || g.bars < 1) bad('HISTORY_GUARD:' + id);
    const c = r.lastConfirmedCover; if (!c || !ACC.test(c.accession) || !isDate(c.filingDate) || !HEX.test(c.sha256)) bad('LAST_COVER:' + id);
    if (!Array.isArray(r.sources) || r.sources.length < 2 || r.sources.some(s => !ACC.test(s?.accession) || !HEX.test(s.sha256) || typeof s.url !== 'string' || !s.url.startsWith('https://www.sec.gov/Archives/edgar/data/') || typeof s.claim !== 'string' || !s.claim)) bad('SOURCES:' + id);
    if (!r.sources.some(s => s.role === 'IXBRL_COVER_LATEST' && s.accession === c.accession && s.sha256 === c.sha256)) bad('LAST_COVER_NOT_SOURCED:' + id);
    const pe = r.priceEvidence;
    if (!Array.isArray(pe) || !pe.length || pe.some(p => !isDate(p?.date) || p.date < r.validFrom || !ACC.test(p.accession) || !HEX.test(p.sha256) || typeof p.quote !== 'string' || p.quote.length > 300
      || !(Math.abs(p.ratioSeriesToSource - 1) <= 0.02) || !r.sources.some(s => s.accession === p.accession && s.sha256 === p.sha256))) bad('PRICE_EVIDENCE:' + id);
  }
  return ext;
}
// V13 LARGECAP registry (research-largecap-price-anchors-1.0.0): closed intervals confirmed by SEC price bands and symbol/exchange statements.
const LARGECAP_V13_SCHEMA = 'research-largecap-price-anchors-1.0.0';
const V13_RECORDS = new WeakSet();
function validateLargecapV13(reg, existingIds = new Set()) {
  const bad = why => { throw Error('INVALID_RESEARCH_LARGECAP_V13:' + why); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, HEX = /^[a-f0-9]{64}$/, ACC = /^\d{10}-\d{2}-\d{6}$/, isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
  const pos = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
  if (!reg || reg.schemaVersion !== LARGECAP_V13_SCHEMA || reg.methodId !== 'SOURCE_PRICE_BAND_IDENTITY_INTERVAL' || !HEX.test(reg.protocolSha256 || '') || !HEX.test(reg.amendmentSha256 || '')
    || !HEX.test(reg.casesSha256 || '') || reg.productionApproved !== false || !Array.isArray(reg.records)) bad('SCHEMA');
  const seen = new Set();
  for (const r of reg.records) {
    const id = r?.securityId;
    if (typeof id !== 'string' || !/^ref_[A-Za-z0-9_.-]+$/.test(id) || seen.has(id) || existingIds.has(id)) bad('SECURITY_ID'); seen.add(id);
    if (typeof r.ticker !== 'string' || id !== 'ref_' + r.ticker || !/^\d{10}$/.test(r.cik)) bad('ISSUER:' + id);
    const sorted = a => Array.isArray(a) && a.every((x, i) => typeof x === 'string' && x && (!i || a[i - 1] < x));
    if (r.masterRowAction === 'SINGLE_ROW_INTERVAL') { if (!Array.isArray(r.masterRowSet) || r.masterRowSet.length !== 1 || r.masterRowSet[0] !== r.selectedCanonicalId) bad('MASTER_ROW_SET:' + id); }
    else if (r.masterRowAction === 'SELECT_EXISTING_ROW') { if (!sorted(r.masterRowSet) || r.masterRowSet.length < 2 || r.masterRowSet.filter(x => x === r.selectedCanonicalId).length !== 1) bad('MASTER_ROW_SET:' + id); }
    else bad('ACTION:' + id);
    if (!isDate(r.validFrom) || !isDate(r.validTo) || r.validTo <= r.validFrom) bad('INTERVAL:' + id);
    if (r.evidenceLevel !== 'SEC_PRICE_BAND_AND_SYMBOL' || r.protocolVersion !== '1.0.1') bad('EVIDENCE_LEVEL:' + id);
    const g = r.historyGuard; if (!g || g.checkedFrom !== r.validFrom || g.checkedTo !== r.validTo || !HEX.test(g.pointsSha256 || '') || !Number.isInteger(g.bars) || g.bars < 104) bad('HISTORY_GUARD:' + id);
    if (!Array.isArray(r.bandConfirmedMoves) || r.bandConfirmedMoves.some(m => !isDate(m?.week) || !isDate(m.prevWeek) || m.prevWeek >= m.week || m.prevWeek < r.validFrom || m.week > r.validTo
      || !pos(m.close) || !pos(m.prevClose) || !pos(m.weeklyRatio) || Math.abs(m.close / m.prevClose - m.weeklyRatio) > CA_TOLERANCE)) bad('MOVES:' + id);
    if (!Array.isArray(r.sources) || r.sources.length < 4 || r.sources.some(s => typeof s?.role !== 'string' || !ACC.test(s.accession || '') || !HEX.test(s.sha256 || '') || typeof s.url !== 'string'
      || !s.url.startsWith('https://www.sec.gov/Archives/edgar/data/') || typeof s.quote !== 'string' || !s.quote || s.quote.length > 300)) bad('SOURCES:' + id);
    for (const role of ['PRICE_ANCHOR_FIRST', 'PRICE_ANCHOR_LAST', 'IDENTITY_SYMBOL_EXCHANGE']) if (!r.sources.some(s => s.role === role)) bad('SOURCE_ROLE:' + role + ':' + id);
  }
  return reg;
}
function identityEvidenceBindings(opts) {
  const reg = validateIdentityEvidenceRegistry(require('./research-identity-evidence.cjs'));
  const levels = opts.identityEvidenceAllowCoverPageOnly ? IDENTITY_EVIDENCE_LEVELS : ['SEC_SAME_DAY_PRICE_AND_COVER'];
  const bindings = new Map(reg.records.filter(r => levels.includes(r.evidenceLevel)).map(r => [r.securityId, r]));
  if (opts.identityEvidenceProtocolV10) for (const r of validateIdentityEvidenceV10(reg).records) bindings.set(r.securityId, r);
  let v12RegistryHash = null;
  if (opts.identityEvidenceProtocolV12) {
    const ext = validateIdentityEvidenceV12(reg);
    v12RegistryHash = hash(ext);
    for (const r of ext.records) { V12_RECORDS.add(r); bindings.set(r.securityId, r); }
  }
  let v13RegistryHash = null;
  if (opts.identityEvidenceProtocolV13Largecap) {
    const v13 = validateLargecapV13(require('./research-largecap-price-anchors.cjs'), new Set(bindings.keys()));
    v13RegistryHash = hash(v13);
    for (const r of v13.records) { V13_RECORDS.add(r); bindings.set(r.securityId, r); }
  }
  return { registryHash: hash(reg), v12RegistryHash, v13RegistryHash, bindings };
}
const coverAgeDays = (asOf, filingDate) => Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(filingDate + 'T00:00:00Z')) / 86400000);

function loadSelected(record, securityId, doc, rows, canonical, registryHash, validateFn) {
  // V10 SELECT_EXISTING_ROW: the master row set of this baseline id must be exactly the recorded one; the selected row is used unchanged.
  const ids = rows.map(r => r.canonical_id).sort();
  if (!rows.some(r => r.canonical_id === record.selectedCanonicalId)) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
  if (rows.filter(r => r.canonical_id === record.selectedCanonicalId).length !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  if (ids.length !== record.masterRowSet.length || ids.some((x, i) => x !== record.masterRowSet[i])) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  const row = rows.find(r => r.canonical_id === record.selectedCanonicalId);
  if (row.ticker !== record.ticker || canonical.get(row.canonical_id)?.size !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  const g = record.historyGuard;
  if (!Array.isArray(doc.points) || hash(doc.points.filter(p => p[0] >= g.checkedFrom && p[0] <= g.checkedTo)) !== g.pointsSha256) throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf) || !Number.isFinite(Date.parse(doc.asOf + 'T00:00:00Z'))) throw Error('INVALID_SOURCE_METADATA');
  const age = coverAgeDays(doc.asOf, record.lastConfirmedCover.filingDate);
  if (age > IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS) throw Error('IDENTITY_EVIDENCE_EXPIRED:' + age);
  const points = doc.points.filter(p => p[0] >= record.validFrom);
  if (!points.length) throw Error('INSUFFICIENT_HISTORY');
  const identity = { ...row, source_provenance: IDENTITY_EVIDENCE_V10_SCHEMA + ':' + record.cik };
  const r = validateFn({ ...doc, points, from: points[0][0], to: points.at(-1)[0] }, identity);
  return { ...r, warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL']),
    identityEvidenceBinding: { schemaVersion: IDENTITY_EVIDENCE_V10_SCHEMA, registryHash, securityId, cik: record.cik, issuer: record.issuer, canonicalId: record.selectedCanonicalId,
      masterRowAction: record.masterRowAction, masterRowSet: record.masterRowSet.slice(), mic: record.mic, instrumentClass: record.instrumentClass, evidenceLevel: record.evidenceLevel,
      validFrom: record.validFrom, validTo: record.validTo, seriesFrom: points[0][0], seriesTo: points.at(-1)[0], historyGuardSha256: g.pointsSha256,
      lastConfirmedCover: { ...record.lastConfirmedCover }, coverAgeDays: age, maxCoverAgeDays: IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS, sources: record.sources.length,
      priceEvidence: record.priceEvidence.length, protocolSha256: record.protocolSha256 } };
}
function loadV12(record, securityId, doc, rows, canonical, v12RegistryHash, validateFn) {
  // V12: every check fails closed before the unchanged validate() runs on the selected master row and the sourced interval.
  let row;
  if (record.masterRowAction === 'SELECT_EXISTING_ROW') {
    const ids = rows.map(r => r.canonical_id).sort();
    if (!rows.some(r => r.canonical_id === record.selectedCanonicalId)) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
    if (rows.filter(r => r.canonical_id === record.selectedCanonicalId).length !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
    if (ids.length !== record.masterRowSet.length || ids.some((x, i) => x !== record.masterRowSet[i])) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
    row = rows.find(r => r.canonical_id === record.selectedCanonicalId);
  } else if (record.masterRowAction === 'SELECT_EXISTING_ROW_BY_KEY') {
    const keys = rows.map(rowKey).sort(), k = record.selectedRowKey, want = k.canonicalId + '|ACTIVE|' + k.endDate;
    if (!rows.some(r => r.canonical_id === record.selectedCanonicalId)) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
    if (keys.length !== record.masterRowKeys.length || keys.some((x, i) => x !== record.masterRowKeys[i])) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
    const hit = rows.filter(r => rowKey(r) === want);
    if (hit.length !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
    row = hit[0];
  } else { // RESTRICT_SINGLE_ROW
    if (!rows.some(r => r.canonical_id === record.selectedCanonicalId)) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
    if (rows.length !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
    row = rows[0];
  }
  if (row.ticker !== record.ticker || canonical.get(row.canonical_id)?.size !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  const g = record.historyGuard;
  if (!Array.isArray(doc.points) || hash(doc.points.filter(p => p[0] >= g.checkedFrom && p[0] <= g.checkedTo)) !== g.pointsSha256) throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf) || !Number.isFinite(Date.parse(doc.asOf + 'T00:00:00Z'))) throw Error('INVALID_SOURCE_METADATA');
  const age = coverAgeDays(doc.asOf, record.lastConfirmedCover.filingDate);
  if (age > IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS) throw Error('IDENTITY_EVIDENCE_EXPIRED:' + age);
  const points = doc.points.filter(p => p[0] >= record.validFrom);
  if (!points.length) throw Error('INSUFFICIENT_HISTORY');
  const identity = { ...row, source_provenance: IDENTITY_EVIDENCE_V12_SCHEMA + ':' + record.cik };
  const r = validateFn({ ...doc, points, from: points[0][0], to: points.at(-1)[0] }, identity);
  const restrict = record.masterRowAction === 'RESTRICT_SINGLE_ROW';
  return { ...r, warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL'], restrict ? ['HISTORY_BEFORE_UNRESOLVED_CORPORATE_ACTION_EXCLUDED'] : []),
    identityEvidenceBinding: { schemaVersion: IDENTITY_EVIDENCE_V12_SCHEMA, registryHash: v12RegistryHash, securityId, cik: record.cik, issuer: record.issuer, canonicalId: row.canonical_id,
      masterRowAction: record.masterRowAction, masterRowSet: (record.masterRowSet || record.masterRowKeys).slice(), selectedRowKey: record.selectedRowKey ? { ...record.selectedRowKey } : null,
      caEvent: restrict ? { ...record.caEvent } : null, mic: record.mic, instrumentClass: record.instrumentClass, evidenceLevel: record.evidenceLevel,
      validFrom: record.validFrom, validTo: record.validTo, seriesFrom: points[0][0], seriesTo: points.at(-1)[0], historyBarsExcluded: doc.points.length - points.length, historyGuardSha256: g.pointsSha256,
      lastConfirmedCover: { ...record.lastConfirmedCover }, coverAgeDays: age, maxCoverAgeDays: IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS, sources: record.sources.length,
      priceEvidence: record.priceEvidence.length, protocolSha256: record.protocolSha256 } };
}
function loadV13(record, securityId, doc, rows, canonical, v13RegistryHash, validateFn) {
  // V13 LARGECAP: closed interval; every check fails closed before the unchanged validate() runs on the selected row and the interval.
  const ids = rows.map(r => r.canonical_id).sort();
  if (!rows.some(r => r.canonical_id === record.selectedCanonicalId)) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
  if (rows.filter(r => r.canonical_id === record.selectedCanonicalId).length !== 1 || ids.length !== record.masterRowSet.length || ids.some((x, i) => x !== record.masterRowSet[i])) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  const row = rows.find(r => r.canonical_id === record.selectedCanonicalId);
  if (row.ticker !== record.ticker || row.active_status !== 'ACTIVE' || canonical.get(row.canonical_id)?.size !== 1) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  if (record.masterRowAction === 'SELECT_EXISTING_ROW' && rows.some(r => r !== row && r.active_status === 'ACTIVE')) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  if (doc.ticker !== record.ticker || !Array.isArray(doc.points)) throw Error('LISTING_IDENTITY_MISMATCH');
  if (frozenTailRun(doc.points) >= FROZEN_TAIL_MIN_RUN) throw Error('V13_FROZEN_TAIL_NOT_SUPPORTED');
  const g = record.historyGuard;
  const points = doc.points.filter(p => p[0] >= record.validFrom && p[0] <= record.validTo);
  if (!points.length || hash(points) !== g.pointsSha256 || points.length !== g.bars || points[0][0] !== record.validFrom || points.at(-1)[0] !== record.validTo) throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf) || !Number.isFinite(Date.parse(doc.asOf + 'T00:00:00Z'))) throw Error('INVALID_SOURCE_METADATA');
  const identity = { ...row, source_provenance: LARGECAP_V13_SCHEMA + ':' + record.cik };
  const sub = { ...doc, points, from: points[0][0], to: points.at(-1)[0] };
  let r;
  const used = [];
  try { r = validateFn(sub, identity); } catch (e) {
    if (!String(e.message).startsWith('CORPORATE_ACTION_UNRESOLVED:')) throw e;
    // Only split-sized moves recorded as band-confirmed (same week, previous week, closes and ratio within 1e-5) are resolved.
    const suspected = points.flatMap(([date, price], i) => i && CorporateActions.splitSized(price / points[i - 1][1]) ? [{ time: date }] : []);
    const items = CorporateActions.resolve(suspected, doc.corporateActions).items.map(item => {
      if (item.status !== 'UNRESOLVED') return item;
      const i = points.findIndex(p => p[0] === item.time), m = record.bandConfirmedMoves.find(x => x.week === item.time);
      if (!m || i < 1 || m.prevWeek !== points[i - 1][0] || !near(points[i][1], m.close) || !near(points[i - 1][1], m.prevClose) || Math.abs(points[i][1] / points[i - 1][1] - m.weeklyRatio) > CA_TOLERANCE) return null;
      used.push(m);
      return { time: item.time, status: 'RESOLVED_SOURCE_PRICE_BAND', reason: 'BAND_CONFIRMED_LEVEL', providerReason: item.reason, returnBasis: 'PRICE_RETURN_ONLY', weeklyRatio: m.weeklyRatio };
    });
    if (items.some(x => x === null)) throw e; // fail closed with the unchanged validate() error
    for (const s of suspected) {
      if (items.find(x => x.time === s.time).status === 'RESOLVED_SOURCE_PRICE_BAND') continue;
      const i = points.findIndex(p => p[0] === s.time), ev = (doc.corporateActions?.moves || []).find(x => x.week === s.time);
      if (!ev || !Number.isFinite(ev.weeklyRatio) || Math.abs(ev.weeklyRatio - points[i][1] / points[i - 1][1]) > 0.00001) throw Error('CORPORATE_ACTION_EVIDENCE_MISMATCH');
    }
    r = validatedResult(sub, identity, { status: 'RESOLVED', items });
  }
  const priceOnly = used.length > 0;
  return { ...r, returnBasis: priceOnly ? 'PRICE_RETURN_ONLY' : r.returnBasis,
    warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCE_PRICE_BAND_INTERVAL', 'HISTORY_OUTSIDE_ANCHORED_INTERVAL_EXCLUDED', 'SERIES_TRUNCATED_AT_LAST_ANCHOR_NOT_A_DELISTING'],
      priceOnly ? ['BAND_CONFIRMED_MOVE_DISTRIBUTION_NOT_EXCLUDED'] : []),
    identityEvidenceBinding: { schemaVersion: LARGECAP_V13_SCHEMA, registryHash: v13RegistryHash, securityId, cik: record.cik, canonicalId: row.canonical_id, masterRowAction: record.masterRowAction,
      masterRowSet: record.masterRowSet.slice(), evidenceLevel: record.evidenceLevel, protocolVersion: record.protocolVersion, validFrom: record.validFrom, validTo: record.validTo,
      seriesFrom: points[0][0], seriesTo: points.at(-1)[0], historyBarsExcludedBefore: doc.points.filter(p => p[0] < record.validFrom).length,
      historyBarsExcludedAfter: doc.points.filter(p => p[0] > record.validTo).length, historyGuardSha256: g.pointsSha256,
      bandConfirmedMoves: used.map(m => ({ ...m })), sources: record.sources.length } };
}
function loadBound(record, securityId, doc, rows, canonical, registryHash, validateFn = validate, v12RegistryHash = null, v13RegistryHash = null) {
  if (V13_RECORDS.has(record)) return loadV13(record, securityId, doc, rows, canonical, v13RegistryHash, validateFn);
  if (V12_RECORDS.has(record)) return loadV12(record, securityId, doc, rows, canonical, v12RegistryHash, validateFn);
  if (record.masterRowAction === 'SELECT_EXISTING_ROW') return loadSelected(record, securityId, doc, rows, canonical, registryHash, validateFn);
  // Master rows: every replaced row must still exist, and nothing else may be attached to this baseline id.
  for (const id of record.replacesCanonicalIds) if (!rows.some(r => r.canonical_id === id)) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
  if (rows.some(r => !record.replacesCanonicalIds.includes(r.canonical_id) || r.ticker !== record.ticker || canonical.get(r.canonical_id)?.size !== 1)) throw Error('IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED');
  const g = record.historyGuard;
  if (!Array.isArray(doc.points) || hash(doc.points.filter(p => p[0] >= g.checkedFrom && p[0] <= g.checkedTo)) !== g.pointsSha256) throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf) || !Number.isFinite(Date.parse(doc.asOf + 'T00:00:00Z'))) throw Error('INVALID_SOURCE_METADATA');
  const age = coverAgeDays(doc.asOf, record.lastConfirmedCover.filingDate);
  if (age > IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS) throw Error('IDENTITY_EVIDENCE_EXPIRED:' + age);
  const points = doc.points.filter(p => p[0] >= record.validFrom && (record.validTo === null || p[0] <= record.validTo));
  if (!points.length) throw Error('INSUFFICIENT_HISTORY');
  const identity = { canonical_id: record.canonicalId, baseline_security_id: securityId, ticker: record.ticker, currency: record.currency, provider: record.provider, start_date: record.validFrom,
    active_status: 'ACTIVE', eligible_us_equity: true, instrument_type: 'EQUITY_COMMON', source_provenance: IDENTITY_EVIDENCE_SCHEMA + ':' + record.cik };
  const r = validateFn({ ...doc, points, from: points[0][0], to: points.at(-1)[0] }, identity);
  return { ...r, warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL']),
    identityEvidenceBinding: { schemaVersion: IDENTITY_EVIDENCE_SCHEMA, registryHash, securityId, cik: record.cik, issuer: record.issuer, canonicalId: record.canonicalId,
      replacesCanonicalIds: record.replacesCanonicalIds.slice(), mic: record.mic, instrumentClass: record.instrumentClass, evidenceLevel: record.evidenceLevel,
      validFrom: record.validFrom, validTo: record.validTo, seriesFrom: points[0][0], seriesTo: points.at(-1)[0], historyGuardSha256: g.pointsSha256,
      lastConfirmedCover: { ...record.lastConfirmedCover }, coverAgeDays: age, maxCoverAgeDays: IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS, sources: record.sources.length } };
}

// ---------------------------------------------------------------- corporate-action evidence (opt-in)
const CA_EVIDENCE_SCHEMA = 'research-ca-evidence-1.0.0', CA_TOLERANCE = 1e-5;
const CA_CLASSES = Object.freeze({ GENUINE_MOVE: 'PRICE_RETURN', SPINOFF_DISTRIBUTION: 'PRICE_RETURN_ONLY' });
function validateCaEvidenceRegistry(reg) {
  const bad = why => { throw Error('INVALID_RESEARCH_CA_EVIDENCE:' + why); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, HEX = /^[a-f0-9]{64}$/, ACC = /^\d{10}-\d{2}-\d{6}$/;
  const isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
  const pos = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
  if (!reg || reg.schemaVersion !== CA_EVIDENCE_SCHEMA || !HEX.test(reg.protocolSha256 || '') || !Array.isArray(reg.records)) bad('SCHEMA');
  const seen = new Set();
  for (const r of reg.records) {
    const id = r?.securityId, key = id + '@' + r?.week;
    if (typeof id !== 'string' || !/^ref_[A-Za-z0-9_.-]+$/.test(id) || seen.has(key)) bad('SECURITY_ID'); seen.add(key);
    if (typeof r.ticker !== 'string' || id !== 'ref_' + r.ticker || !/^\d{10}$/.test(r.cik) || typeof r.canonicalId !== 'string' || !r.canonicalId) bad('LISTING:' + key);
    if (!isDate(r.week) || !isDate(r.prevWeek) || r.prevWeek >= r.week) bad('WEEK:' + key);
    if (!pos(r.prevClose) || !pos(r.close) || !pos(r.weeklyRatio) || Math.abs(r.close / r.prevClose - r.weeklyRatio) > CA_TOLERANCE || !CorporateActions.splitSized(r.weeklyRatio)) bad('CLOSES:' + key);
    if (!Object.hasOwn(CA_CLASSES, r.class) || r.returnBasis !== CA_CLASSES[r.class]) bad('CLASS:' + key);
    if (r.protocolSha256 !== reg.protocolSha256 || !isDate(String(r.verifiedAt || '').slice(0, 10))) bad('PROTOCOL:' + key);
    const sc = r.shareContinuity;
    if (!sc || !pos(sc.before?.shares) || !pos(sc.after?.shares) || !(sc.before.coverDate <= r.prevWeek) || !(sc.after.coverDate >= r.week)
      || !(sc.ratio >= 0.8 && sc.ratio <= 1.25) || Math.abs(sc.after.shares / sc.before.shares - sc.ratio) > 1e-9) bad('SHARE_CONTINUITY:' + key);
    const idn = r.identity;
    if (!idn || idn.before?.tradingSymbol !== r.ticker || idn.after?.tradingSymbol !== r.ticker || !ACC.test(idn.before.accession || '') || !ACC.test(idn.after.accession || '') || !idn.exchangeEvidence) bad('IDENTITY:' + key);
    if (!Array.isArray(r.sources) || r.sources.length < 3 || r.sources.some(s => typeof s?.role !== 'string' || !ACC.test(s.accession) || !HEX.test(s.sha256) || typeof s.url !== 'string'
      || !s.url.startsWith('https://www.sec.gov/Archives/edgar/data/') || typeof s.quote !== 'string')) bad('SOURCES:' + key);
    const affirm = r.class === 'GENUINE_MOVE' ? 'AFFIRMATIVE_8K' : 'SPINOFF_8K';
    if (!r.sources.some(s => s.role === affirm && s.quote.length >= 20)) bad('AFFIRMATIVE_SOURCE:' + key);
  }
  return reg;
}
function caEvidenceIndex() {
  const reg = validateCaEvidenceRegistry(require('./research-ca-evidence.cjs'));
  const byId = new Map();
  for (const r of reg.records) { if (!byId.has(r.securityId)) byId.set(r.securityId, []); byId.get(r.securityId).push(r); }
  return { registryHash: hash(reg), protocolSha256: reg.protocolSha256, byId };
}
const near = (a, b) => Math.abs(a - b) <= CA_TOLERANCE * Math.abs(b);
// The adapter's validate() return object, rebuilt for an overlaid corporate-action quality. validate() itself is unchanged;
// research-ca-evidence.test.mjs proves this builder equals validate() output for CLEAN/RESOLVED series.
function validatedResult(doc, identity, corporateActionQuality) {
  return { corporateActionQuality, dataMode: 'real', sourceSchemaVersion: doc.schemaVersion, calendar: 'OBSERVED_ISO_WEEKS', publishBasis: doc.publishBasis || null, listingId: identity.canonical_id,
    securityId: doc.securityId, ticker: doc.ticker, currency: doc.currency, provider: doc.provider, listingStart: identity.start_date, identityEvidence: identity.source_provenance,
    identityHash: hash(identity), sourceHash: hash(doc), asOf: doc.asOf, returnBasis: 'PRICE_RETURN', adjustment: 'SPLIT_ADJUSTED', points: doc.points, corporateActions: doc.corporateActions || null,
    warnings: ['EX_POST_ADJUSTED_HISTORY_NOT_AS_PUBLISHED_PIT', 'DIVIDENDS_EXCLUDED', 'SPLIT_ADJUSTMENT_PROVIDER_EVIDENCE_ONLY_NO_RAW_RECONSTRUCTION', 'FRACTIONAL_SPLIT_ADJUSTED_UNITS',
      'SINGLE_LISTING_SELECTION_NO_MARKET_WIDE_EDGE', 'WEEKLY_CALENDAR_FROM_OBSERVED_BARS_NOT_INTRADAY_SESSION_PROOF'] };
}
function caValidator(index) {
  return (doc, identity) => {
    try { return validate(doc, identity); } catch (e) {
      if (!String(e.message).startsWith('CORPORATE_ACTION_UNRESOLVED:')) throw e;
      // validate() runs its checks in a fixed order; every check before the corporate-action gate has passed. Only that gate is overlaid.
      const records = index.byId.get(doc.securityId) || [], pts = doc.points, used = [];
      const suspected = pts.flatMap(([date, price], i) => i && CorporateActions.splitSized(price / pts[i - 1][1]) ? [{ time: date }] : []);
      const items = CorporateActions.resolve(suspected, doc.corporateActions).items.map(item => {
        if (item.status !== 'UNRESOLVED') return item;
        const i = pts.findIndex(p => p[0] === item.time), rec = records.find(r => r.week === item.time);
        if (!rec || i < 1 || rec.canonicalId !== identity.canonical_id || rec.ticker !== doc.ticker || rec.prevWeek !== pts[i - 1][0]
          || !near(pts[i][1], rec.close) || !near(pts[i - 1][1], rec.prevClose) || Math.abs(pts[i][1] / pts[i - 1][1] - rec.weeklyRatio) > CA_TOLERANCE) return null;
        used.push(rec);
        return { time: item.time, status: 'RESOLVED_SOURCE_VERIFIED', reason: rec.class, providerReason: item.reason, returnBasis: rec.returnBasis, weeklyRatio: rec.weeklyRatio, cik: rec.cik };
      });
      if (items.some(x => x === null)) throw e; // fail closed with the unchanged validate() error
      for (const s of suspected) { // validate()'s own evidence check for the provider-resolved suspects
        if (items.find(x => x.time === s.time).status === 'RESOLVED_SOURCE_VERIFIED') continue;
        const i = pts.findIndex(p => p[0] === s.time), ev = doc.corporateActions.moves.find(m => m.week === s.time);
        if (!Number.isFinite(ev.weeklyRatio) || Math.abs(ev.weeklyRatio - pts[i][1] / pts[i - 1][1]) > 0.00001) throw Error('CORPORATE_ACTION_EVIDENCE_MISMATCH');
      }
      const r = validatedResult(doc, identity, { status: 'RESOLVED', items });
      const priceOnly = used.some(x => x.returnBasis === 'PRICE_RETURN_ONLY');
      return { ...r, returnBasis: priceOnly ? 'PRICE_RETURN_ONLY' : r.returnBasis,
        warnings: r.warnings.concat(['CORPORATE_ACTION_RESOLVED_BY_RESEARCH_REGISTRY'], priceOnly ? ['SPINOFF_DISTRIBUTION_VALUE_NOT_IN_PRICE_SERIES'] : []),
        corporateActionEvidenceBinding: { schemaVersion: CA_EVIDENCE_SCHEMA, registryHash: index.registryHash, protocolSha256: index.protocolSha256,
          records: used.map(x => ({ week: x.week, prevWeek: x.prevWeek, class: x.class, returnBasis: x.returnBasis, cik: x.cik, sources: x.sources.length, verifiedAt: x.verifiedAt })) } };
    }
  };
}

// ---------------------------------------------------------------- listing lifecycle evidence (opt-in)
const LIFECYCLE_SCHEMA = 'research-listing-lifecycle-1.0.0', FROZEN_TAIL_MIN_RUN = 4;
const TERMINAL_KINDS = Object.freeze(['CASH_MERGER', 'STOCK_MERGER', 'CASH_AND_STOCK', 'DELISTED_NO_CONSIDERATION', 'UNKNOWN']);
const LIFECYCLE_CATEGORIES = Object.freeze(['MERGER_TERMINAL_CONSIDERATION', 'DELISTED_FORM25', 'DEREGISTERED_FORM15']);
function frozenTailRun(points) {
  if (!Array.isArray(points) || !points.length) return 0;
  const last = points.at(-1)[1]; let run = 1;
  for (let i = points.length - 2; i >= 0 && points[i][1] === last; i--) run++;
  return run;
}
function validateLifecycleRegistry(reg) {
  const bad = why => { throw Error('INVALID_RESEARCH_LISTING_LIFECYCLE:' + why); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, HEX = /^[a-f0-9]{64}$/, ACC = /^\d{10}-\d{2}-\d{6}$/, isDate = x => typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
  const num = x => x === null || (typeof x === 'number' && Number.isFinite(x) && x > 0);
  if (!reg || reg.schemaVersion !== LIFECYCLE_SCHEMA || !HEX.test(reg.protocolSha256 || '') || !Array.isArray(reg.records)) bad('SCHEMA');
  const seen = new Set();
  for (const r of reg.records) {
    const id = r?.securityId;
    if (typeof id !== 'string' || !/^ref_[A-Za-z0-9_.-]+$/.test(id) || seen.has(id)) bad('SECURITY_ID'); seen.add(id);
    if (typeof r.ticker !== 'string' || id !== 'ref_' + r.ticker || !/^\d{10}$/.test(r.cik) || typeof r.issuer !== 'string' || !r.issuer) bad('ISSUER:' + id);
    if (!LIFECYCLE_CATEGORIES.includes(r.category) || r.status !== 'DELISTED_SOURCE_VERIFIED' || r.protocolSha256 !== reg.protocolSha256) bad('STATUS:' + id);
    if (!isDate(r.lastTradeDate) || !(typeof r.frozenClose === 'number' && r.frozenClose > 0)) bad('LAST_TRADE:' + id);
    const g = r.historyGuard; if (!g || !isDate(g.checkedFrom) || g.checkedTo !== r.lastTradeDate || g.checkedFrom > g.checkedTo || !HEX.test(g.pointsSha256) || !Number.isInteger(g.bars) || g.bars < 1) bad('HISTORY_GUARD:' + id);
    const t = r.terminal;
    if (!t || !TERMINAL_KINDS.includes(t.kind) || !num(t.cashPerShare) || !num(t.stockRatio) || !(t.acquirerTicker === null || typeof t.acquirerTicker === 'string') || !(t.paymentDate === null || isDate(t.paymentDate))) bad('TERMINAL:' + id);
    const shape = { CASH_MERGER: [true, false], STOCK_MERGER: [false, true], CASH_AND_STOCK: [true, true], DELISTED_NO_CONSIDERATION: [false, false], UNKNOWN: [false, false] }[t.kind];
    if ((t.cashPerShare !== null) !== shape[0] || (t.stockRatio !== null) !== shape[1]) bad('TERMINAL_SHAPE:' + id);
    if (!Array.isArray(r.sources) || !r.sources.length || r.sources.some(s => typeof s?.role !== 'string' || !ACC.test(s.accession) || !HEX.test(s.sha256) || typeof s.url !== 'string'
      || !s.url.startsWith('https://www.sec.gov/Archives/edgar/data/') || typeof s.quote !== 'string' || !s.quote || s.quote.length > 300)) bad('SOURCES:' + id);
    if (!r.sources.some(s => s.role === 'LAST_TRADE_STATEMENT')) bad('LAST_TRADE_SOURCE:' + id);
    if (shape[0] || shape[1]) { if (!r.sources.some(s => s.role === 'TERMINAL_CONSIDERATION')) bad('TERMINAL_SOURCE:' + id); }
  }
  return reg;
}
function lifecycleIndex() {
  const reg = validateLifecycleRegistry(require('./research-listing-lifecycle.cjs'));
  return { registryHash: hash(reg), protocolSha256: reg.protocolSha256, byId: new Map(reg.records.map(r => [r.securityId, r])) };
}

const isoWeekOf = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); };
function createResearchLoader(root, options) {
  const opts = loaderOptions(options);
  const base = Adapter.createLoader(root);
  if (!opts.identityEvidence && !opts.corporateActionEvidence && !opts.listingLifecycleEvidence) return base; // default: the adapter's own loader, byte-identical
  const evidence = opts.identityEvidence ? identityEvidenceBindings(opts) : { registryHash: null, bindings: new Map() };
  const ca = opts.corporateActionEvidence ? caEvidenceIndex() : null;
  const lc = opts.listingLifecycleEvidence ? lifecycleIndex() : null;
  const check = ca ? caValidator(ca) : validate;
  // The research branches read the same master file as the adapter (same path, same grouping rules).
  const masterBytes = fs.readFileSync(path.join(root, 'quant/data/market/security-master/us-security-master.json'), 'utf8');
  if (hash(masterBytes) !== base.masterHash) throw Error('IDENTITY_EVIDENCE_MASTER_CHANGED_DURING_LOAD');
  const master = JSON.parse(masterBytes), byId = new Map(), canonical = new Map();
  for (const row of master.rows) {
    const key = row.baseline_security_id;
    if (key) { if (!byId.has(key)) byId.set(key, []); byId.get(key).push(row); }
    if (row.canonical_id && key) { if (!canonical.has(row.canonical_id)) canonical.set(row.canonical_id, new Set()); canonical.get(row.canonical_id).add(key); }
  }
  const rel = securityId => 'quant/data/market/discover-series-long/' + securityId + '.json';
  // The loader without lifecycle evidence; with the default arguments exactly the behaviour before this option existed.
  const inner = (securityId, suppliedBytes, checkFn = check, ownPath = false) => {
    const record = evidence.bindings.get(securityId), caBound = !!ca && ca.byId.has(securityId);
    if (!record && !caBound && !ownPath) return base(securityId, suppliedBytes);
    const bytes = suppliedBytes === undefined ? fs.readFileSync(path.join(root, rel(securityId)), 'utf8') : suppliedBytes;
    const rows = byId.get(securityId) || [];
    let result;
    if (record) result = loadBound(record, securityId, JSON.parse(bytes), rows, canonical, evidence.registryHash, checkFn, evidence.v12RegistryHash, evidence.v13RegistryHash);
    else { // the adapter's own single-row rule, unchanged
      if (rows.length !== 1 || canonical.get(rows[0].canonical_id)?.size !== 1) throw Error('AMBIGUOUS_LISTING_IDENTITY');
      result = checkFn(JSON.parse(bytes), rows[0]);
    }
    return { ...result, sourcePath: rel(securityId), sourceBytesHash: hash(bytes), masterVersion: master.version, masterGeneratedAt: master.generatedAt };
  };
  const loader = !lc ? (securityId, suppliedBytes) => inner(securityId, suppliedBytes) : (securityId, suppliedBytes) => {
    if (!/^ref_[A-Za-z0-9_.-]+$/.test(securityId)) throw Error('INVALID_SECURITY_ID');
    const bytes = suppliedBytes === undefined ? fs.readFileSync(path.join(root, rel(securityId)), 'utf8') : suppliedBytes;
    const doc = JSON.parse(bytes), rec = lc.byId.get(securityId);
    if (!rec) { // unchanged result, unless the series ends frozen: repeated closes are not trades
      const run = Array.isArray(doc.points) ? frozenTailRun(doc.points) : 0;
      if (run < FROZEN_TAIL_MIN_RUN) return inner(securityId, bytes);
      // Without a sourced last trading day the listing is kept up to its last observed close (the first bar of the frozen
      // run) and everything after is removed: outcomes beyond it are censored with an UNKNOWN terminal value. Excluding the
      // whole listing would select on the later outcome (delisting) - V10 review finding 4.
      const keep = doc.points.length - run + 1, lastObserved = doc.points[keep - 1][0];
      const r = inner(securityId, bytes, (d, identity) => check({ ...d, points: d.points.slice(0, keep), to: lastObserved }, identity), true);
      return { ...r, warnings: r.warnings.concat(['FROZEN_TAIL_CUT_AT_LAST_OBSERVED_CLOSE', 'REPEATED_CLOSES_REMOVED_TERMINAL_UNKNOWN']),
        listingLifecycle: { schemaVersion: LIFECYCLE_SCHEMA, registryHash: lc.registryHash, protocolSha256: lc.protocolSha256, status: 'FROZEN_TAIL_UNSOURCED_CENSORED', category: null, cik: null,
          lastTradeDate: null, lastObservedDate: lastObserved, frozenTailBarsRemoved: run - 1,
          terminal: { kind: 'UNKNOWN', cashPerShare: null, stockRatio: null, acquirerTicker: null, paymentDate: null, evidence: [] } } };
    }
    const g = rec.historyGuard, ltd = rec.lastTradeDate;
    if (doc.ticker !== rec.ticker || !Array.isArray(doc.points)) throw Error('LISTING_LIFECYCLE_CONFLICT');
    if (hash(doc.points.filter(p => p[0] >= g.checkedFrom && p[0] <= g.checkedTo)) !== g.pointsSha256) throw Error('LISTING_LIFECYCLE_HISTORY_GUARD_MISMATCH');
    if (doc.points.some(p => p[0] > ltd && p[1] !== rec.frozenClose)) throw Error('LISTING_LIFECYCLE_CONFLICT'); // the series moves after the sourced last trading day
    let terminalOverride = false, cutRemoved = 0, lastBarAfterLtd = false, cutLast = null;
    const cutCheck = (d, identity) => {
      // A last trading day inside a week leaves that week's bar labelled after it; its close is the real last close
      // (the frozen value). Keep that one bar under its own label, never the repeats after it - V10 review finding 6.
      const pts = d.points.filter(p => p[0] <= ltd), next = d.points[pts.length];
      if (next && isoWeekOf(next[0]) === isoWeekOf(ltd)) { pts.push(next); lastBarAfterLtd = true; }
      cutRemoved = d.points.length - pts.length; cutLast = pts.length ? pts.at(-1)[0] : null;
      if (!pts.length) throw Error('INSUFFICIENT_HISTORY');
      // INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED is satisfied only by a sourced terminal kind.
      terminalOverride = !!identity && identity.active_status !== 'ACTIVE' && rec.terminal.kind !== 'UNKNOWN';
      return check({ ...d, points: pts, to: pts.at(-1)[0] }, terminalOverride ? { ...identity, active_status: 'ACTIVE' } : identity);
    };
    const r = inner(securityId, bytes, cutCheck, true);
    return { ...r, warnings: r.warnings.concat(['SERIES_CUT_AT_SOURCED_LAST_TRADE_DATE', 'REPEATED_CLOSES_AFTER_LAST_TRADE_REMOVED'], terminalOverride ? ['INACTIVE_LISTING_TERMINAL_VALUE_SOURCE_VERIFIED'] : []),
      listingLifecycle: { schemaVersion: LIFECYCLE_SCHEMA, registryHash: lc.registryHash, protocolSha256: lc.protocolSha256, status: rec.status, category: rec.category, cik: rec.cik,
        lastTradeDate: ltd, lastObservedDate: cutLast, lastBarLabelAfterLastTradeDate: lastBarAfterLtd, frozenTailBarsRemoved: cutRemoved,
        terminal: { kind: rec.terminal.kind, cashPerShare: rec.terminal.cashPerShare, stockRatio: rec.terminal.stockRatio, acquirerTicker: rec.terminal.acquirerTicker,
          paymentDate: rec.terminal.paymentDate, evidence: rec.sources.map(s => ({ role: s.role, accession: s.accession, url: s.url, sha256: s.sha256, quote: s.quote })) } } };
  };
  loader.masterHash = base.masterHash;
  if (opts.identityEvidence) loader.identityEvidence = Object.freeze({ schemaVersion: IDENTITY_EVIDENCE_SCHEMA, registryHash: evidence.registryHash,
    boundSecurityIds: Object.freeze([...evidence.bindings.keys()].sort()), allowCoverPageOnly: !!opts.identityEvidenceAllowCoverPageOnly, protocolV10: !!opts.identityEvidenceProtocolV10,
    ...(opts.identityEvidenceProtocolV12 ? { protocolV12: true, v12SchemaVersion: IDENTITY_EVIDENCE_V12_SCHEMA, v12RegistryHash: evidence.v12RegistryHash } : {}),
    ...(opts.identityEvidenceProtocolV13Largecap ? { protocolV13Largecap: true, v13SchemaVersion: LARGECAP_V13_SCHEMA, v13RegistryHash: evidence.v13RegistryHash } : {}) });
  if (ca) loader.corporateActionEvidence = Object.freeze({ schemaVersion: CA_EVIDENCE_SCHEMA, registryHash: ca.registryHash, protocolSha256: ca.protocolSha256,
    securityIds: Object.freeze([...ca.byId.keys()].sort()) });
  if (lc) loader.listingLifecycleEvidence = Object.freeze({ schemaVersion: LIFECYCLE_SCHEMA, registryHash: lc.registryHash, protocolSha256: lc.protocolSha256,
    frozenTailMinRun: FROZEN_TAIL_MIN_RUN, securityIds: Object.freeze([...lc.byId.keys()].sort()) });
  return loader;
}

module.exports = { createResearchLoader, validateIdentityEvidenceRegistry, validateIdentityEvidenceV10, validateIdentityEvidenceV12, validateCaEvidenceRegistry, validateLifecycleRegistry, validatedResult, frozenTailRun,
  validateLargecapV13, LOADER_OPTIONS, LOADER_OPTIONS_V12, LOADER_OPTIONS_V13, IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS, CA_TOLERANCE, FROZEN_TAIL_MIN_RUN, TERMINAL_KINDS };
