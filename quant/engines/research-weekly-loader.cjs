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

const LOADER_OPTIONS = Object.freeze(['identityEvidence', 'identityEvidenceAllowCoverPageOnly', 'corporateActionEvidence']);
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

function loadBound(record, securityId, doc, rows, canonical, registryHash, validateFn = validate) {
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

function createResearchLoader(root, options) {
  const opts = loaderOptions(options);
  const base = Adapter.createLoader(root);
  if (!opts.identityEvidence && !opts.corporateActionEvidence) return base; // default: the adapter's own loader, byte-identical
  const evidence = opts.identityEvidence ? identityEvidenceBindings(opts) : { registryHash: null, bindings: new Map() };
  const ca = opts.corporateActionEvidence ? caEvidenceIndex() : null;
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
  const loader = (securityId, suppliedBytes) => {
    const record = evidence.bindings.get(securityId), caBound = !!ca && ca.byId.has(securityId);
    if (!record && !caBound) return base(securityId, suppliedBytes);
    const rel = 'quant/data/market/discover-series-long/' + securityId + '.json';
    const bytes = suppliedBytes === undefined ? fs.readFileSync(path.join(root, rel), 'utf8') : suppliedBytes;
    const rows = byId.get(securityId) || [];
    let result;
    if (record) result = loadBound(record, securityId, JSON.parse(bytes), rows, canonical, evidence.registryHash, check);
    else { // the adapter's own single-row rule, unchanged
      if (rows.length !== 1 || canonical.get(rows[0].canonical_id)?.size !== 1) throw Error('AMBIGUOUS_LISTING_IDENTITY');
      result = check(JSON.parse(bytes), rows[0]);
    }
    return { ...result, sourcePath: rel, sourceBytesHash: hash(bytes), masterVersion: master.version, masterGeneratedAt: master.generatedAt };
  };
  loader.masterHash = base.masterHash;
  if (opts.identityEvidence) loader.identityEvidence = Object.freeze({ schemaVersion: IDENTITY_EVIDENCE_SCHEMA, registryHash: evidence.registryHash,
    boundSecurityIds: Object.freeze([...evidence.bindings.keys()].sort()), allowCoverPageOnly: !!opts.identityEvidenceAllowCoverPageOnly });
  if (ca) loader.corporateActionEvidence = Object.freeze({ schemaVersion: CA_EVIDENCE_SCHEMA, registryHash: ca.registryHash, protocolSha256: ca.protocolSha256,
    securityIds: Object.freeze([...ca.byId.keys()].sort()) });
  return loader;
}

module.exports = { createResearchLoader, validateIdentityEvidenceRegistry, validateCaEvidenceRegistry, validatedResult, LOADER_OPTIONS, IDENTITY_EVIDENCE_MAX_COVER_AGE_DAYS, CA_TOLERANCE };
