/** Discover identity admission. Raw replay only; no network or product writes. */
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, lstatSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), Identity = require('../../core/identity.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const unique = values => [...new Set(values.filter(v => v != null && v !== ''))].sort();
const europeanCountries = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH GB'.split(' '));
export const EUROPE_MICS = Object.freeze(['XETR','XFRA','XPAR','XAMS','XBRU','XSWX','XLON','XSTO','XCSE','XOSL','XHEL','XMAD','BMEX','XMIL','MTAA','XWBO','XBRU']);
const europeanMics = new Set(EUROPE_MICS);
function file(path) {
  path = resolve(path);
  for (let p = path; ; p = dirname(p)) { if (lstatSync(p).isSymbolicLink()) throw Error('SYMLINK_INPUT_FORBIDDEN'); if (p === dirname(p)) break; }
  if (!lstatSync(path).isFile()) throw Error('REGULAR_INPUT_REQUIRED');
  return readFileSync(path);
}
function checked(path, expected) { const bytes = file(path); if (!/^[a-f0-9]{64}$/.test(expected || '') || hash(bytes) !== expected) throw Error('INPUT_HASH_MISMATCH'); return bytes; }
export function validIsin(value) {
  if (typeof value !== 'string' || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
  const digits = [...value].map(c => /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c).join('');
  let sum = 0; [...digits].reverse().forEach((c, i) => { let n = Number(c) * (i % 2 ? 2 : 1); sum += n > 9 ? n - 9 : n; }); return sum % 10 === 0;
}
export function validLei(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9]{18}[0-9]{2}$/.test(value)) return false;
  let remainder = 0; for (const char of value) for (const digit of (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export function parseOfficialCsv(text) {
  const records = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ';' && !quoted) { row.push(field); field = ''; } else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); records.push(row); row = []; field = ''; } else field += c; }
  if (quoted) throw Error('UNTERMINATED_OFFICIAL_CSV'); if (field || row.length) { row.push(field.replace(/\r$/, '')); records.push(row); }
  const index = records.findIndex(r => r.includes('ISIN') && r.includes('MIC Code'));
  if (index < 0 || new Set(records[index]).size !== records[index].length) throw Error('OFFICIAL_CSV_HEADER_REQUIRED');
  return records.slice(index + 1).filter(r => r.some(Boolean)).map(r => Object.fromEntries(records[index].map((key, i) => [key, r[i] ?? ''])));
}
function gleifIsin(url) { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'api.gleif.org' && u.pathname === '/api/v1/lei-records' ? u.searchParams.get('filter[isin]') : null; } catch { return null; } }
/** The official document is only a pointer; class/type/activity/name/currency are derived from source bytes. */
export function readDiscoverOfficialReference(documentPath, expectedDocumentSha256) {
  const document = JSON.parse(checked(documentPath, expectedDocumentSha256)), source = document.source;
  if (source?.httpStatus !== 200 || !/^https:\/\/www\.cashmarket\.deutsche-boerse\.com\/.+\/t7-xetr-allTradableInstruments\.csv$/.test(source.url || '')) throw Error('OFFICIAL_XETRA_SOURCE_REQUIRED');
  const rows = parseOfficialCsv(checked(source.path, source.sha256).toString('utf8')), entities = new Map(), quarantine = [];
  for (const pointer of [...(document.rows || []), ...(document.unresolved || [])]) {
    if (!validIsin(pointer.isin)) continue;
    const g = pointer.provenance?.gleif || pointer.source;
    if (g?.httpStatus !== 200 || !g.path || !/^[a-f0-9]{64}$/.test(g.sha256 || '') || gleifIsin(g.url) !== pointer.isin) continue;
    const body = JSON.parse(checked(g.path, g.sha256)), data = body.data;
    if (![body.links?.first, body.links?.last].every(v => gleifIsin(typeof v === 'string' ? v : v?.href) === pointer.isin) || !Array.isArray(data) || data.length !== 1 || body.meta?.pagination?.total !== 1) { quarantine.push({ isin: pointer.isin, reason: 'GLEIF_QUERY_SCOPE_OR_CARDINALITY_UNKNOWN' }); continue; }
    const a = data[0].attributes, e = a?.entity;
    if (e?.status !== 'ACTIVE' || e.category !== 'GENERAL' || !e.legalName?.name || a.lei !== data[0].id || !validLei(a.lei)) continue;
    entities.set(pointer.isin, { lei: a.lei || data[0].id, issuerName: e.legalName.name, issuerCountry: e.jurisdiction, source: g });
  }
  const symbols = new Map();
  const names = new Map();
  for (const r of rows.filter(r => r['Instrument Type'] === 'CS' && r['Product Status'] === 'Active' && r['Instrument Status'] === 'Active')) {
    const k = r['MIC Code'] + ':' + r.Mnemonic; if (!symbols.has(k)) symbols.set(k, new Set()); symbols.get(k).add(r.ISIN);
    const name = String(r.Instrument).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); if (!names.has(name)) names.set(name, new Set()); names.get(name).add(r.ISIN);
  }
  return { classes: rows.filter(r => validIsin(r.ISIN)).map(r => ({ isin: r.ISIN, mic: r['MIC Code'], nativeTicker: r.Mnemonic,
    instrumentName: r.Instrument, type: r['Instrument Type'], active: r['Product Status'] === 'Active' && r['Instrument Status'] === 'Active',
    primaryMarketMic: r['Primary Market MIC Code'] || null, countryOfIssue: r['Country Of Issue'] || null, currency: r.Currency || null, firstTradingDate: r['First Trading Date'] || null,
    nativeUnique: symbols.get(r['MIC Code'] + ':' + r.Mnemonic)?.size === 1, officialNameUnique: names.get(String(r.Instrument).replace(/[^A-Za-z0-9]/g, '').toUpperCase())?.size === 1, issuer: entities.get(r.ISIN) || null,
    provenance: { source, documentPath, documentSha256: expectedDocumentSha256, rowSha256: digest(r), rawFieldMap: { isin: 'ISIN', name: 'Instrument', type: 'Instrument Type', mic: 'MIC Code', ticker: 'Mnemonic', currency: 'Currency' } } })), quarantine };
}
const missing = v => v === null || v === undefined || v === '';
function metadataMic(raw) {
  const singular = unique([raw.exchange, raw.stock_exchange?.mic, raw.stock_exchange?.exchange_mic].filter(v => typeof v === 'string' && /^[A-Z0-9]{4}$/.test(v)));
  return { singular, plural: unique((raw.stock_exchanges || []).flatMap(e => [e.mic, e.exchange_mic]).filter(v => typeof v === 'string' && /^[A-Z0-9]{4}$/.test(v))) };
}
export function projectMetadataRaw(raw) { return { providerSymbol: raw.symbol ?? raw.ticker ?? null, isin: raw.isin ?? null,
  name: raw.name ?? null, assetType: raw.asset_type ?? raw.item_type ?? null, currency: raw.price_currency ?? raw.currency ?? null,
  active: raw.active ?? raw.is_active ?? null, ...metadataMic(raw) }; }
export function readExtraDiscoverIssuer(source) {
  if (source.httpStatus !== 200 || !validIsin(source.queryIsin) || gleifIsin(source.url) !== source.queryIsin) throw Error('EXTRA_ISSUER_QUERY_SCOPE_REQUIRED');
  const document = JSON.parse(checked(source.path, source.sha256)), data = document.data;
  if (![document.links?.first, document.links?.last].every(u => gleifIsin(typeof u === 'string' ? u : u?.href) === source.queryIsin) || !Array.isArray(data) || data.length !== 1 || document.meta?.pagination?.total !== 1) return null;
  const a = data[0].attributes, e = a?.entity, lei = a?.lei || data[0].id;
  return e?.status === 'ACTIVE' && e.category === 'GENERAL' && e.legalName?.name && a.lei === data[0].id && validLei(lei)
    ? { isin: source.queryIsin, lei, issuerName: e.legalName.name, issuerCountry: e.jurisdiction, source } : null;
}
/** Issuer-owned ORD class table only. ADR identity, currency and prices are never projected. */
export function readOfficialOrdIssuerDomicle(source) {
  const url = new URL(source.url);
  if (source.kind !== 'NORDEA_OFFICIAL_ORD_CLASS_DOMICILE' || source.httpStatus !== 200 || url.protocol !== 'https:' || url.hostname !== 'www.nordea.com' ||
    url.pathname !== '/en/investors/american-depositary-receipts-adr') throw Error('SCOPED_OFFICIAL_ORD_ISSUER_SOURCE_REQUIRED');
  const html = checked(source.path, source.sha256).toString('utf8');
  const tables = [...html.matchAll(/<h3\b[^>]*>\s*DR Program Information\s*<\/h3>\s*<div\b[^>]*>\s*<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length !== 1) throw Error('UNIQUE_OFFICIAL_ORD_CLASS_TABLE_REQUIRED');
  const text = s => s.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const cells = new Map(); for (const row of tables[0][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const values = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => text(m[1]));
    if (values.length !== 2 || cells.has(values[0])) throw Error('AMBIGUOUS_OFFICIAL_ORD_CLASS_FIELD'); cells.set(values[0], values[1]);
  }
  const isin = cells.get('ORD ISIN'), company = cells.get('Company name');
  if (isin !== 'FI4000297767' || !validIsin(isin) || company !== 'Nordea Bank ABP' || cells.get('Country') !== 'Finland' || cells.get('ORD Ticker') !== 'NDA FH') throw Error('OFFICIAL_ORD_CLASS_ISSUER_DOMICILE_UNRESOLVED');
  return { isin, issuerName: null, displayName: company, issuerCountry: 'FI', countryBasis: 'ISSUER_PUBLISHED_ORD_CLASS_TABLE_COUNTRY',
    source: { ...source, admittedFields: { isin: 'ORD ISIN', issuerDisplayName: 'Company name', issuerCountry: 'Country' }, excludedFields: ['DR ISIN', 'DR Ticker', 'CUSIP', 'Ratio (ORD:DRS)', 'Active Date'] } };
}
/** Dated issuer class relationship + independently retrieved current legal entity, never a fabricated GLEIF-ISIN match. */
export function readOfficialClassIssuerBridge({ release, entity }) {
  const policies = {
    NOKIA_OFFICIAL_CLASS_NOTIFICATION: { url: 'https://www.nokia.com/newsroom/fi-fi/nokia-oyj-omien-osakkeiden-takaisinosto-05032025/', date: '2025-03-05',
      pattern: /Nokia Oyj\s*\(LEI:\s*([A-Z0-9]{20})\)\s*on\s*05\.03\.2025\s*hankkinut omia osakkeitaan\s*\(ISIN\s*([A-Z0-9]{12})\)/g, name: 'Nokia Oyj', isin: 'FI0009000681' },
    UPM_OFFICIAL_CLASS_NOTIFICATION: { url: 'https://www.upm.com/news-and-stories/releases/2026/04/upm-kymmene-corporation-managers-transactions-ehrnrooth/', date: '2026-04-30',
      pattern: /Issuer:\s*UPM-Kymmene Corporation\s*LEI:\s*([A-Z0-9]{20})\s*Notification type:[\s\S]{0,500}?Instrument type:\s*SHARE\s*ISIN:\s*([A-Z0-9]{12})/g, name: 'UPM-Kymmene Corporation', isin: 'FI0009005987' }
  };
  const policy = policies[release.kind];
  if (!policy || release.url !== policy.url || release.httpStatus !== 200 || entity.httpStatus !== 200) throw Error('OFFICIAL_CLASS_BRIDGE_SOURCE_SCOPE_REQUIRED');
  const text = checked(release.path, release.sha256).toString('utf8').replace(/<!--[^]*?-->/g, ' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const matches = [...text.matchAll(policy.pattern)]; if (matches.length !== 1 || matches[0][2] !== policy.isin || !validIsin(matches[0][2]) || !validLei(matches[0][1])) throw Error('EXACT_ISSUER_CLASS_RELATIONSHIP_REQUIRED');
  const [, lei, isin] = matches[0], url = new URL(entity.url);
  if (url.protocol !== 'https:' || url.hostname !== 'api.gleif.org' || url.pathname !== '/api/v1/lei-records/' + lei || url.search) throw Error('CURRENT_ENTITY_LEI_ENDPOINT_SCOPE_REQUIRED');
  const record = JSON.parse(checked(entity.path, entity.sha256)).data, a = record?.attributes, e = a?.entity;
  const names = [e?.legalName?.name, ...(e?.otherNames || []).map(n => n.name)];
  if (!record || Array.isArray(record) || record.id !== lei || a.lei !== lei || e?.status !== 'ACTIVE' || e.category !== 'GENERAL' || !europeanCountries.has(e.jurisdiction) || !names.some(n => typeof n === 'string' && n.toUpperCase() === policy.name.toUpperCase())) throw Error('CURRENT_ENTITY_CLASS_ISSUER_CONFLICT');
  return { isin, lei, issuerName: e.legalName.name, issuerCountry: e.jurisdiction, relationshipAsOf: policy.date,
    source: { ...entity, kind: 'OFFICIAL_CLASS_ISSUER_COMPOUND_BRIDGE', classRelationship: { ...release, relationshipAsOf: policy.date, evidenceRole: 'PUBLISHED_CLASS_TO_ISSUER_LEI' },
      entityEvidenceRole: 'CURRENT_ENTITY_LEI_STATUS_JURISDICTION_ONLY', gleifIsinRelationshipClaimed: false } };
}
/** Replays metadata directly from hash-bound response bodies, ignoring editable normalized observations. */
export function readDiscoverMetadataEvidence({ path, summarySha256, manifestSha256 }) {
  const summary = JSON.parse(checked(join(path, 'summary.json'), summarySha256)), manifest = JSON.parse(checked(join(path, 'raw-manifest.json'), manifestSha256));
  if (!['marketstack-europe-ingestion-1', 'marketstack-europe21-ingestion-1'].includes(summary.version)) throw Error('UNRECOGNIZED_RAW_VERSION');
  const byId = new Map(); for (const r of manifest) { if (!/^\d{6}$/.test(r.id || '') || byId.has(r.id)) throw Error('INVALID_RAW_MANIFEST'); byId.set(r.id, r); }
  const operations = [];
  for (const item of summary.results || []) {
    if (item.operation?.kind !== 'metadata' || item.operation.assetKind === 'ETF') continue;
    const op = item.operation, rows = [], responses = [];
    if (item.resultPath) { if (typeof item.resultPath !== 'string' || !/^normalized\/\d{6}\.json$/.test(item.resultPath)) throw Error('SCOPED_NORMALIZED_PATH_REQUIRED');
      const result = JSON.parse(file(join(path, item.resultPath))); if (digest(result.operation) !== digest(op) || digest(result.responseIds) !== digest(item.responseIds)) throw Error('SUMMARY_OPERATION_BINDING_MISMATCH'); }
    for (const id of item.responseIds || []) {
      const r = byId.get(id); if (!r) throw Error('MISSING_RESPONSE_ID'); const bytes = checked(join(path, 'raw', id + '.json'), r.sha256);
      const provenance = { evidenceRoot: resolve(path), rawPath: join(path, 'raw', id + '.json'), responseId: id, rawSha256: r.sha256, retrievedAt: r.retrievedAt,
        endpoint: r.endpoint, params: r.params, status: r.status, summarySha256, manifestSha256 };
      responses.push(provenance);
      if (r.status !== 200 || r.endpoint !== '/tickers/' + op.symbol) continue;
      const body = JSON.parse(bytes), data = body.data ?? body;
      for (const raw of Array.isArray(data) ? data : [data]) if (raw && typeof raw === 'object' && !Array.isArray(raw)) rows.push({ raw, normalized: projectMetadataRaw(raw), provenance: { ...provenance, rawRowSha256: digest(raw) } });
    }
    operations.push({ operation: op, observations: rows, responses, sourceGeneration: summary.generatedAt,
      listingKey: 'marketstack:' + op.mic + ':' + op.symbol });
  }
  return { operations, source: { path, summarySha256, manifestSha256, version: summary.version, phase: summary.phase || null } };
}
function explicitType(raw) {
  const type = String(raw.asset_type ?? raw.item_type ?? '').trim().toLowerCase();
  if (/etf|fund|warrant|certificate|rights?|units?|bond|note|derivative/.test(type)) return 'EXCLUDED';
  if (['equity','stock','common stock','ordinary share','ordinary shares','preferred stock','preferred share','preferred shares'].includes(type)) return 'EQUITY'; return 'UNKNOWN';
}
/** Security-scoped issuer labels without LEI never assert a cross-class company equivalence. */
export function classifyDiscoverIdentity({ operation, observations, officialClasses, protectedSecurityIds = [] }) {
  const reasons = [], symbol = operation.symbol, mic = operation.mic;
  const output = { listingKey: 'marketstack:' + mic + ':' + symbol, providerSymbol: symbol, mic, identityAdmission: 'REVIEW', reasons,
    isin: null, companyKey: null, issuerName: null, issuerCountry: null, shareClassDetail: 'UNKNOWN', primaryCertification: 'UNKNOWN', evidence: [] };
  const settle = () => { if (reasons.includes('EXCLUDED_PROVIDER_ASSET_TYPE')) { output.identityAdmission = 'REJECTED'; output.assetDisposition = 'EXCLUDED_EQUITY_SCOPE'; }
    output.disposition = output.identityAdmission === 'IDENTITY_READY' ? 'ACCEPTED' : output.identityAdmission; return output; };
  if (!europeanMics.has(mic)) reasons.push('NON_EUROPE_LISTING');
  if (observations.length !== 1) { reasons.push(observations.length ? 'AMBIGUOUS_SCOPED_METADATA' : 'METADATA_UNAVAILABLE'); return settle(); }
  const o = observations[0], raw = o.raw, n = projectMetadataRaw(raw); output.evidence.push(o.provenance);
  if (n.providerSymbol !== symbol || n.singular.length > 1 || n.singular.some(v => v !== mic) || !(n.singular.includes(mic) || n.plural.includes(mic))) reasons.push('EXACT_PROVIDER_MIC_SYMBOL_CONFLICT');
  if ([raw.active, raw.is_active].some(v => v === false)) reasons.push('PROVIDER_INACTIVE');
  if ([raw.active, raw.is_active].some(v => v != null && typeof v !== 'boolean')) reasons.push('INVALID_PROVIDER_ACTIVITY_DECLARATION');
  if ([raw.stock_exchange?.mic, raw.stock_exchange?.exchange_mic].some(v => !missing(v) && (typeof v !== 'string' || !/^[A-Z0-9]{4}$/.test(v)))) reasons.push('INVALID_PROVIDER_MIC_DECLARATION');
  if (!missing(raw.lei) && !validLei(raw.lei)) reasons.push('INVALID_PROVIDER_LEGAL_ISSUER_DECLARATION');
  if (explicitType(raw) === 'EXCLUDED') reasons.push('EXCLUDED_PROVIDER_ASSET_TYPE');
  if (!missing(raw.isin) && !validIsin(raw.isin)) reasons.push('INVALID_PROVIDER_ISIN_DECLARATION');
  const bridge = missing(raw.isin) && mic === 'XETR';
  const nativeConflicts = officialClasses.filter(c => c.mic === mic && c.active && c.type === 'CS' &&
    [c.nativeTicker, c.nativeTicker + '.DE', c.nativeTicker + '.XETR'].includes(symbol));
  if (!missing(raw.isin) && nativeConflicts.some(c => c.isin !== raw.isin)) reasons.push('OFFICIAL_NATIVE_TICKER_CLASS_CONFLICT');
  const matches = officialClasses.filter(c => c.active && c.type === 'CS' && (bridge ? c.mic === mic && c.nativeUnique && symbol === c.nativeTicker + '.DE' : c.isin === n.isin));
  const isins = unique(matches.map(c => c.isin));
  if (isins.length !== 1) { reasons.push(bridge ? 'OFFICIAL_NATIVE_BRIDGE_UNRESOLVED' : 'OFFICIAL_CASH_CLASS_UNRESOLVED'); return settle(); }
  const isin = isins[0]; output.isin = isin;
  if (operation.expectedIsin && operation.expectedIsin !== isin) reasons.push('EXPECTED_PROVIDER_CLASS_CONFLICT');
  const exact = matches.filter(c => c.mic === mic && (symbol === c.nativeTicker + '.DE' || n.isin === c.isin));
  const reference = exact[0] || matches[0], issuer = reference.issuer, legalIssuer = validLei(issuer?.lei);
  if (legalIssuer && validLei(raw.lei) && raw.lei !== issuer.lei) reasons.push('CONFLICTING_PROVIDER_LEGAL_ISSUER');
  // Local official activity or separately matched official primary venue plus exact provider identity.
  if (!exact.length && !matches.some(c => c.primaryMarketMic === mic) && explicitType(raw) !== 'EQUITY') reasons.push('HOME_LISTING_TYPE_OR_RELATION_UNRESOLVED');
  if (issuer?.issuerCountry && !europeanCountries.has(issuer.issuerCountry)) reasons.push('NON_EUROPE_ISSUER');
  if (!issuer?.issuerCountry || !europeanCountries.has(issuer.issuerCountry) || !/^[a-f0-9]{64}$/.test(issuer.source?.sha256 || '')) reasons.push('VERIFIED_EUROPE_ISSUER_COUNTRY_UNRESOLVED');
  if (!issuer && !europeanMics.has(reference.primaryMarketMic)) reasons.push('EUROPE_SECURITY_SCOPE_UNRESOLVED');
  if (!legalIssuer && String(reference.instrumentName).replace(/[^A-Za-z0-9]/g, '').toUpperCase() !== String(n.name).replace(/[^A-Za-z0-9]/g, '').toUpperCase()) reasons.push('SECURITY_SCOPED_OFFICIAL_NAME_BINDING_UNRESOLVED');
  if (!legalIssuer && reference.officialNameUnique !== true) reasons.push('SECURITY_SCOPED_OFFICIAL_NAME_COLLISION');
  if (bridge && explicitType(raw) !== 'EQUITY') reasons.push('NATIVE_BRIDGE_REQUIRES_EXPLICIT_EQUITY');
  if (typeof reference.instrumentName !== 'string' || !reference.instrumentName.trim() || typeof n.name !== 'string' || !n.name.trim()) reasons.push('IDENTITY_NAME_MISSING');
  output.displayName = issuer?.issuerName || reference.instrumentName;
  output.issuerName = issuer?.issuerName || null; output.legalName = issuer?.issuerName || null;
  output.issuerCountry = issuer?.issuerCountry || null;
  output.issuerCountryBasis = legalIssuer ? 'GLEIF_ENTITY_JURISDICTION' : issuer?.issuerCountry ? 'OFFICIAL_EXACT_CLASS_ISSUER_DOMICILE' : 'UNKNOWN';
  output.companyKey = legalIssuer ? 'LEI:' + issuer.lei : 'OFFICIAL_SECURITY_ISSUER:' + isin;
  output.companyConsolidation = legalIssuer ? 'EXACT_LEI' : 'UNKNOWN_ACROSS_SHARE_CLASSES';
  output.companyResolution = legalIssuer ? 'VERIFIED_LEGAL_ENTITY' : 'SECURITY_SCOPED_ISSUER';
  output.issuerIdentityLevel = legalIssuer ? 'VERIFIED_LEGAL_ENTITY' : 'SECURITY_SCOPED_OFFICIAL_LABEL';
  output.evidence.push(reference.provenance); if (issuer) output.evidence.push(issuer.source);
  output.primaryMarketMic = reference.primaryMarketMic; output.primaryCertification = reference.primaryMarketMic === mic ? 'OFFICIAL_REFERENCE_PRIMARY_MIC' : 'UNKNOWN';
  output.localListingPlausible = exact.length > 0 || matches.some(c => c.primaryMarketMic === mic) || explicitType(raw) === 'EQUITY';
  output.active = true; output.kind = 'EQUITY_SHARE_CLASS';
  output.currency = missing(n.currency) ? (reference.mic === mic ? reference.currency : null) : typeof n.currency === 'string' && /^[A-Z]{3}$/.test(n.currency) ? n.currency : null;
  output.currencyBasis = missing(n.currency) && reference.mic === mic ? 'SAME_LISTING_OFFICIAL_REFERENCE' : output.currency ? 'PROVIDER_DECLARED' : missing(n.currency) ? 'UNKNOWN' : 'INVALID_PROVIDER_DECLARATION';
  output.quoteReference = reference.mic === mic ? { mic, isin, nativeTicker: reference.nativeTicker, currency: reference.currency,
    rawField: 'Currency', sourceSha256: reference.provenance.source.sha256, rowSha256: reference.provenance.rowSha256 || null, source: reference.provenance.source } : null;
  if ([Identity.securityIdForTicker(symbol + '.' + mic), output.companyKey, 'ISIN:' + isin, output.listingKey].some(id => protectedSecurityIds.includes(id))) reasons.push('PROTECTED_US_ID_COLLISION');
  output.identityAdmission = reasons.length ? 'REVIEW' : 'IDENTITY_READY'; return settle();
}
export function reclassifyDiscoverCandidates({ operations, officialClasses, previousUniverse, protectedSecurityIds = [], generatedAt }) {
  const grouped = new Map(); for (const op of operations) { if (!grouped.has(op.listingKey)) grouped.set(op.listingKey, []); grouped.get(op.listingKey).push(op); }
  const old = new Map((previousUniverse?.listings || []).map(c => [c.isin, c.securityId]));
  for (const c of previousUniverse?.listings || []) if (!validIsin(c.isin) || !c.securityId || (old.get(c.isin) !== c.securityId)) throw Error('PREVIOUS_IDENTITY_MAP_CONFLICT');
  const candidates = [...grouped.values()].map(attempts => {
    attempts.sort((a, b) => String(b.responses.at(-1)?.retrievedAt || b.sourceGeneration).localeCompare(String(a.responses.at(-1)?.retrievedAt || a.sourceGeneration)));
    // Failed followup does not invent a new identity; last actual metadata observation remains explicitly dated.
    const chosen = attempts.find(a => a.observations.length) || attempts[0];
    const row = classifyDiscoverIdentity({ ...chosen, officialClasses, protectedSecurityIds }); row.attempts = attempts.map(a => ({ operation: a.operation, responses: a.responses }));
    row.metadataObservedAt = chosen.observations[0]?.provenance.retrievedAt || null; return row;
  }).sort((a, b) => a.listingKey.localeCompare(b.listingKey));
  const companies = new Map(), securities = new Map(), listings = [], ids = new Map();
  const classVenues = new Map();
  for (const row of candidates.filter(c => c.identityAdmission === 'IDENTITY_READY')) {
    const key = row.isin + ':' + row.mic; if (!classVenues.has(key)) classVenues.set(key, []); classVenues.get(key).push(row);
  }
  const resolvedListings = [];
  for (const group of classVenues.values()) {
    if (unique(group.map(r => r.companyKey)).length !== 1) { for (const row of group) { row.identityAdmission = 'REVIEW'; row.reasons.push('CONFLICTING_OFFICIAL_ISSUER_IDENTITY'); } continue; }
    const prior = (previousUniverse?.listings || []).find(l => l.isin === group[0].isin && l.mic === group[0].mic);
    const representative = group.find(r => r.providerSymbol === prior?.providerSymbol) || group[0];
    representative.verifiedAliases = unique(group.map(r => r.providerSymbol)); representative.aliasEvidence = group.map(r => ({ providerSymbol: r.providerSymbol, evidence: r.evidence }));
    for (const row of group) if (row !== representative) row.aliasOf = representative.listingKey;
    resolvedListings.push(representative);
  }
  for (const row of resolvedListings) {
    const same = securities.get(row.isin), id = same?.securityId || old.get(row.isin) || Identity.securityIdForTicker(row.providerSymbol + '.' + row.mic);
    if (protectedSecurityIds.includes(id)) { row.identityAdmission = 'REVIEW'; row.reasons.push('PROTECTED_US_ID_COLLISION'); continue; }
    if (ids.has(id) && ids.get(id) !== row.isin) { row.identityAdmission = 'REVIEW'; row.reasons.push('CANONICAL_ID_COLLISION'); continue; }
    if (same && same.companyKey !== row.companyKey) { row.identityAdmission = 'REVIEW'; row.reasons.push('CONFLICTING_OFFICIAL_ISSUER_IDENTITY'); continue; }
    ids.set(id, row.isin); row.securityId = id; row.securityKey = 'ISIN:' + row.isin;
    if (!companies.has(row.companyKey)) companies.set(row.companyKey, { companyKey: row.companyKey, companyId: row.companyKey, issuerName: row.issuerName, displayName: row.displayName, legalName: row.legalName, issuerCountry: row.issuerCountry,
      issuerIdentityLevel: row.issuerIdentityLevel, companyConsolidation: row.companyConsolidation, securities: [] });
    if (!same) { securities.set(row.isin, { securityId: id, securityKey: row.securityKey, isin: row.isin, companyKey: row.companyKey, shareClassDetail: 'UNKNOWN', listings: [], aliases: [] }); companies.get(row.companyKey).securities.push(row.securityKey); }
    const s = securities.get(row.isin); s.listings.push(row.listingKey); s.aliases.push(...(row.verifiedAliases || [row.providerSymbol])); listings.push(row);
  }
  for (const s of securities.values()) { const related = listings.filter(l => l.isin === s.isin); const primary = related.find(l => l.primaryCertification === 'OFFICIAL_REFERENCE_PRIMARY_MIC') || related.find(l => l.mic === 'XETR') || related[0];
    s.primaryListing = primary.listingKey; s.primaryListingId = primary.listingKey; s.canonicalTicker = primary.providerSymbol + '.' + primary.mic; s.aliases = unique(s.aliases);
    for (const l of related) { l.isPrimary = l === primary; l.primarySelectionBasis = l.primaryCertification === 'OFFICIAL_REFERENCE_PRIMARY_MIC' ? 'OFFICIAL_REFERENCE' : 'PRODUCT_DISPLAY_SELECTION_NOT_CERTIFIED_PRIMARY'; } }
  for (const l of listings) {
    l.companyId = l.companyKey; l.listingId = l.listingKey; l.identityStatus = 'UNIVERSE_IDENTITY_READY';
    l.admissionProof = { version: 'europe-discover-identity-2.0.0', status: 'UNIVERSE_IDENTITY_READY', securityId: l.securityId,
      companyId: l.companyId, listingId: l.listingId, isin: l.isin, securityKey: l.securityKey, mic: l.mic, providerSymbol: l.providerSymbol,
      currency: l.currency, issuerCountry: l.issuerCountry, issuerCountryBasis: l.issuerCountryBasis,
      assetType: 'EQUITY', issuerBinding: l.companyResolution === 'VERIFIED_LEGAL_ENTITY' ? 'VERIFIED_LEGAL_ISSUER' : 'SECURITY_SCOPED_OFFICIAL_ISSUER',
      active: true, localListingPlausible: l.localListingPlausible === true, duplicateResolved: true,
      evidenceRefs: l.evidence.flatMap(e => [e.rawSha256 ? { kind: 'AUTHENTICATED_PROVIDER_METADATA', sha256: e.rawSha256, verified: true } : null,
        e.source?.sha256 ? { kind: 'OFFICIAL_CASH_SHARE_REFERENCE', sha256: e.source.sha256, verified: true } : null,
        e.sha256 ? { kind: e.kind === 'NORDEA_OFFICIAL_ORD_CLASS_DOMICILE' ? 'OFFICIAL_EXACT_CLASS_ISSUER_DOMICILE' : 'OFFICIAL_LEGAL_ISSUER', sha256: e.sha256, verified: true } : null,
        e.classRelationship?.sha256 ? { kind: 'OFFICIAL_DATED_CLASS_TO_ISSUER_LEI', sha256: e.classRelationship.sha256, verified: true } : null].filter(Boolean)), reasonCodes: [] };
    l.acceptance = old.has(l.isin) ? 'ACCEPTED' : 'DISCOVER_ONLY';
  }
  for (const alias of candidates.filter(c => c.aliasOf)) { const canonical = listings.find(l => l.listingKey === alias.aliasOf); if (canonical) {
    alias.securityId = canonical.securityId; alias.securityKey = canonical.securityKey; alias.resolvedListingId = canonical.listingId; } }
  const knownCompanies = [...companies.values()].map(c => ({ ...c, securities: [...c.securities] })), knownSecurities = [...securities.values()].map(s => ({ ...s, listings: [...s.listings] })), knownListings = [...listings];
  for (const previous of previousUniverse?.listings || []) if (!securities.has(previous.isin)) {
    const current = candidates.find(c => c.isin === previous.isin && c.mic === previous.mic) || null;
    const row = { ...(current || { listingKey: previous.listingKey, isin: previous.isin, companyKey: previous.companyKey, providerSymbol: previous.providerSymbol, mic: previous.mic, currency: previous.currency }),
      securityId: previous.securityId, securityKey: 'ISIN:' + previous.isin, companyId: current?.companyKey || previous.companyKey,
      listingId: current?.listingKey || previous.listingKey, acceptance: 'ACCEPTED', identityBlocked: true, chartBlocked: true, discoverEligible: false,
      identityStatus: 'BLOCKED', reasonCodes: current?.reasons || ['CURRENT_IDENTITY_UNRESOLVED'], retainedCanonicalIdentityBasis: 'PINNED_PRIOR_EXACT_ISIN_CANONICAL_ID' };
    row.admissionProof = { version: 'europe-discover-identity-2.0.0', status: 'BLOCKED', securityId: row.securityId, companyId: row.companyId,
      listingId: row.listingId, isin: row.isin, securityKey: row.securityKey, mic: row.mic, providerSymbol: row.providerSymbol, currency: row.currency,
      assetType: 'EQUITY', issuerBinding: current?.issuerName ? 'VERIFIED_LEGAL_ISSUER' : 'UNKNOWN', active: current?.active === true,
      localListingPlausible: current?.localListingPlausible === true, duplicateResolved: true, reasonCodes: row.reasonCodes, evidenceRefs: [] };
    knownListings.push(row); const known = knownSecurities.find(s => s.isin === row.isin);
    if (known) { known.listings.push(row.listingKey); known.aliases = unique([...known.aliases, row.providerSymbol]); }
    else knownSecurities.push({ securityId: row.securityId, securityKey: row.securityKey, isin: row.isin, companyKey: row.companyId, shareClassDetail: 'UNKNOWN',
      listings: [row.listingKey], primaryListing: row.listingKey, primaryListingId: row.listingKey, aliases: [row.providerSymbol], canonicalTicker: row.providerSymbol + '.' + row.mic, identityBlocked: true });
    if (!knownCompanies.some(c => c.companyKey === row.companyId)) knownCompanies.push({ companyKey: row.companyId, companyId: row.companyId, issuerName: current?.issuerName || null,
      legalName: current?.legalName || null, displayName: current?.displayName || null, issuerCountry: current?.issuerCountry || null, securities: [row.securityKey], identityBlocked: true });
    else { const company = knownCompanies.find(c => c.companyKey === row.companyId); company.securities = unique([...company.securities, row.securityKey]); }
  }
  const previousCandidates = new Map((previousUniverse?.candidates || []).map(c => [c.listingKey, c]));
  for (const c of candidates) { c.disposition = c.identityAdmission === 'IDENTITY_READY' ? 'ACCEPTED' : c.identityAdmission;
    c.previousDisposition = previousCandidates.get(c.listingKey)?.status || 'UNOBSERVED'; }
  const primaryCounts = {}, multiLabelCounts = {};
  const clusterRows = candidates.map(c => { const labels = [...new Set(c.reasons)].sort(); const primary = labels[0] || 'IDENTITY_READY';
    primaryCounts[primary] = (primaryCounts[primary] || 0) + 1; for (const label of labels) multiLabelCounts[label] = (multiLabelCounts[label] || 0) + 1;
    return { listingKey: c.listingKey, isin: c.isin, providerSymbol: c.providerSymbol, mic: c.mic, previousDisposition: c.previousDisposition,
      disposition: c.disposition, primaryReason: primary, reasonCodes: labels, securityId: c.securityId || null, aliasOf: c.aliasOf || null }; });
  const priorReview = clusterRows.filter(c => c.previousDisposition === 'REVIEW');
  return { schema: 'vu-europe-discover-identity-reclassification-2', generatedAt, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    counts: { candidateQueryKeys: candidates.length, identityReadyQueryKeys: candidates.filter(c => c.identityAdmission === 'IDENTITY_READY').length, identityReadyListings: listings.length,
      reviewQueryKeys: candidates.filter(c => c.disposition === 'REVIEW').length, rejectedQueryKeys: candidates.filter(c => c.disposition === 'REJECTED').length,
      securities: securities.size, verifiedLegalEntityCompanies: [...companies.values()].filter(c => c.issuerIdentityLevel === 'VERIFIED_LEGAL_ENTITY').length,
      unresolvedSecurityScopedIssuerGroups: [...companies.values()].filter(c => c.issuerIdentityLevel !== 'VERIFIED_LEGAL_ENTITY').length },
    candidates, companies: [...companies.values()], securities: [...securities.values()], listings,
    candidateAccounting: { countBasis: 'SCOPED_QUERY_KEYS_NOT_COMPANIES', primaryCounts, multiLabelCounts, rows: clusterRows,
      priorReview: { total: priorReview.length, identityReady: priorReview.filter(c => c.disposition === 'ACCEPTED').length,
        review: priorReview.filter(c => c.disposition === 'REVIEW').length, rejected: priorReview.filter(c => c.disposition === 'REJECTED').length } },
    knownReferenceGraph: { mode: 'PRIVATE_RESEARCH', publicationAllowed: false, generatedAt, companies: knownCompanies, securities: knownSecurities, listings: knownListings },
    previousCanonicalIds: [...old].map(([isin, securityId]) => ({ isin, securityId, currentIdentityReady: securities.has(isin) })) };
}
export function writeDiscoverReclassification(result, out) {
  const root = resolve(out); if (!root.startsWith('/workspace/') || !root.includes('-private')) throw Error('PRIVATE_OUTPUT_REQUIRED'); mkdirSync(root, { recursive: true });
  for (let p = root; ; p = dirname(p)) { if (lstatSync(p).isSymbolicLink()) throw Error('SYMLINK_OUTPUT_FORBIDDEN'); if (p === dirname(p)) break; }
  const target = join(root, 'europe_discover_identity_reclassification.json'); try { if (!lstatSync(target).isFile()) throw Error('REGULAR_OUTPUT_REQUIRED'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temporary = join(root, randomUUID() + '.tmp'), bytes = JSON.stringify(result) + '\n'; writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temporary, target); return { path: target, sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
}
export function compileDiscoverReclassification(config) {
  const evidence = config.evidenceDirectories.map(readDiscoverMetadataEvidence), official = readDiscoverOfficialReference(config.officialReference.path, config.officialReference.sha256);
  for (const source of config.extraIssuerSources || []) { const issuer = readExtraDiscoverIssuer(source); if (issuer) for (const c of official.classes.filter(c => c.isin === issuer.isin)) c.issuer = issuer; }
  for (const source of config.officialOrdIssuerSources || []) { const issuer = readOfficialOrdIssuerDomicle(source); for (const c of official.classes.filter(c => c.isin === issuer.isin && !c.issuer)) c.issuer = issuer; }
  for (const source of config.officialClassIssuerBridges || []) { const issuer = readOfficialClassIssuerBridge(source); for (const c of official.classes.filter(c => c.isin === issuer.isin && !c.issuer)) c.issuer = issuer; }
  const previous = config.previousUniverse ? JSON.parse(checked(config.previousUniverse.path, config.previousUniverse.sha256)) : null;
  const protectedIds = new Set(config.protectedSecurityIds || []);
  for (const source of config.protectedIdentitySources || []) { const document = JSON.parse(checked(source.path, source.sha256));
    if (!Array.isArray(document.securityIds)) throw Error('PROTECTED_ID_ARRAY_REQUIRED'); for (const id of document.securityIds) protectedIds.add(id); }
  const result = reclassifyDiscoverCandidates({ operations: evidence.flatMap(e => e.operations), officialClasses: official.classes, previousUniverse: previous,
    protectedSecurityIds: [...protectedIds], generatedAt: config.now }); result.sourceBindings = { metadata: evidence.map(e => e.source), official: config.officialReference,
      extraIssuers: config.extraIssuerSources || [], officialOrdIssuers: config.officialOrdIssuerSources || [], officialClassIssuerBridges: config.officialClassIssuerBridges || [],
      priorIdentity: config.previousUniverse || null, protectedIdentitySources: config.protectedIdentitySources || [] };
  result.protectedIdentityCollisions = result.knownReferenceGraph.securities.filter(s => protectedIds.has(s.securityId)).map(s => ({ securityId: s.securityId, isin: s.isin, status: 'REFERENCE_QUARANTINED' }));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = name => args[args.indexOf('--' + name) + 1]; if (!args.includes('--config') || !args.includes('--out')) throw Error('--config and --out required');
  const result = compileDiscoverReclassification(JSON.parse(file(value('config')))); console.log(JSON.stringify({ ...writeDiscoverReclassification(result, value('out')), counts: result.counts }));
}
