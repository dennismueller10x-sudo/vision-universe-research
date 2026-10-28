/* Research-only weekly loader. Wraps the UNCHANGED offline adapter (weekly-real-adapter.cjs) and adds opt-in
 * research registries. No productive caller (server/, backtest materialize/refresh/batch, V7/V8 runners) uses this
 * module, and it is not part of any backtest generation's code dependencies; the adapter itself is untouched.
 *
 * createResearchLoader(root, options)
 *   options is a plain object; every key is opt-in and DEFAULT OFF:
 *     identityEvidence: true                    apply the SEC-sourced bindings of research-identity-evidence.cjs
 *                                               (evidenceLevel SEC_SAME_DAY_PRICE_AND_COVER only)
 *     identityEvidenceAllowCoverPageOnly: true  additionally apply COVER_PAGE_ONLY bindings (requires identityEvidence)
 *   Unknown keys or non-boolean values fail closed (INVALID_LOADER_OPTIONS). A later research registry (e.g. the
 *   corporate-action registry) adds its own key to LOADER_OPTIONS below.
 *   Without any enabled option it returns the adapter's own createLoader(root) loader, so outputs are byte-identical,
 *   and the identity registry module is not even required.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Adapter = require('./weekly-real-adapter.cjs');
const { validate, hash } = Adapter;

const LOADER_OPTIONS = Object.freeze(['identityEvidence', 'identityEvidenceAllowCoverPageOnly']);
function loaderOptions(options) {
  if (options === undefined) return {};
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options) !== Object.prototype) throw Error('INVALID_LOADER_OPTIONS');
  for (const [k, v] of Object.entries(options)) if (!LOADER_OPTIONS.includes(k) || typeof v !== 'boolean') throw Error('INVALID_LOADER_OPTIONS:' + k);
  if (options.identityEvidenceAllowCoverPageOnly && !options.identityEvidence) throw Error('INVALID_LOADER_OPTIONS:identityEvidenceAllowCoverPageOnly');
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
function identityEvidenceBindings(opts) {
  const reg = validateIdentityEvidenceRegistry(require('./research-identity-evidence.cjs'));
  const levels = opts.identityEvidenceAllowCoverPageOnly ? IDENTITY_EVIDENCE_LEVELS : ['SEC_SAME_DAY_PRICE_AND_COVER'];
  return { registryHash: hash(reg), bindings: new Map(reg.records.filter(r => levels.includes(r.evidenceLevel)).map(r => [r.securityId, r])) };
}
const coverAgeDays = (asOf, filingDate) => Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(filingDate + 'T00:00:00Z')) / 86400000);

function loadBound(record, securityId, doc, rows, canonical, registryHash) {
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
  const r = validate({ ...doc, points, from: points[0][0], to: points.at(-1)[0] }, identity);
  return { ...r, warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL']),
    identityEvidenceBinding: { schemaVersion: IDENTITY_EVIDENCE_SCHEMA, registryHash, securityId, cik: record.cik, issuer: record.issuer, canonicalId: record.canonicalId,
      replacesCanonicalIds: record.replacesCanonicalIds.slice(), mic: record.mic, instrumentClass: record.instrumentClass, evidenceLevel: record.evidenceLevel,
      validFrom: record.validFrom, validTo: record.validTo, seriesFrom: points[0][0], seriesTo: points.at(-1)[0], historyGuardSha256: g.pointsSha256,
      lastConfirmedCover: { ...record.lastConfirmedCover }, coverAgeDays: age, maxCoverAgeDays: IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS, sources: record.sources.length } };
}

function createResearchLoader(root, options) {
  const opts = loaderOptions(options);
  const base = Adapter.createLoader(root);
  if (!opts.identityEvidence) return base; // default: the adapter's own loader, byte-identical
  const evidence = identityEvidenceBindings(opts);
  // The bound branch reads the same master file as the adapter (same path, same grouping rules).
  const masterBytes = fs.readFileSync(path.join(root, 'quant/data/market/security-master/us-security-master.json'), 'utf8');
  if (hash(masterBytes) !== base.masterHash) throw Error('IDENTITY_EVIDENCE_MASTER_CHANGED_DURING_LOAD');
  const master = JSON.parse(masterBytes), byId = new Map(), canonical = new Map();
  for (const row of master.rows) {
    const key = row.baseline_security_id;
    if (key) { if (!byId.has(key)) byId.set(key, []); byId.get(key).push(row); }
    if (row.canonical_id && key) { if (!canonical.has(row.canonical_id)) canonical.set(row.canonical_id, new Set()); canonical.get(row.canonical_id).add(key); }
  }
  const loader = (securityId, suppliedBytes) => {
    const record = evidence.bindings.get(securityId);
    if (!record) return base(securityId, suppliedBytes);
    const rel = 'quant/data/market/discover-series-long/' + securityId + '.json';
    const bytes = suppliedBytes === undefined ? fs.readFileSync(path.join(root, rel), 'utf8') : suppliedBytes;
    return { ...loadBound(record, securityId, JSON.parse(bytes), byId.get(securityId) || [], canonical, evidence.registryHash),
      sourcePath: rel, sourceBytesHash: hash(bytes), masterVersion: master.version, masterGeneratedAt: master.generatedAt };
  };
  loader.masterHash = base.masterHash;
  loader.identityEvidence = Object.freeze({ schemaVersion: IDENTITY_EVIDENCE_SCHEMA, registryHash: evidence.registryHash,
    boundSecurityIds: Object.freeze([...evidence.bindings.keys()].sort()), allowCoverPageOnly: !!opts.identityEvidenceAllowCoverPageOnly });
  return loader;
}

module.exports = { createResearchLoader, validateIdentityEvidenceRegistry, LOADER_OPTIONS, IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS };
