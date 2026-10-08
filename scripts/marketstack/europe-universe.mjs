/** Private discovery foundation; no provider calls, production writes or publication. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const Identity = require('../../core/identity.js');
const CompanyMaster = require('../../quant/engines/company-master.js');

export const EUROPE_EXCHANGE_PLAN = Object.freeze([
  { country: 'DE', priority: 1, mics: ['XETR', 'XFRA', 'XBER', 'XDUS', 'XHAM', 'XHAN', 'XMUN', 'XSTU'] },
  { country: 'FR', priority: 2, mics: ['XPAR'] },
  { country: 'NL', priority: 3, mics: ['XAMS'] },
  { country: 'CH', priority: 4, mics: ['XSWX', 'XVTX'] },
  { country: 'GB', priority: 5, mics: ['XLON'] },
  { country: 'SE', priority: 6, mics: ['XSTO'] },
  { country: 'DK', priority: 7, mics: ['XCSE'] },
  { country: 'NO', priority: 8, mics: ['XOSL'] },
  { country: 'FI', priority: 9, mics: ['XHEL'] },
  { country: 'ES', priority: 10, mics: ['XMAD'] },
  { country: 'IT', priority: 11, mics: ['XMIL'] },
  { country: 'AT', priority: 12, mics: ['XWBO'] },
  { country: 'BE', priority: 13, mics: ['XBRU'] }
]);
const MIC_COUNTRY = new Map(EUROPE_EXCHANGE_PLAN.flatMap(p => p.mics.map(mic => [mic, p.country])));
const COUNTRIES = new Set(EUROPE_EXCHANGE_PLAN.map(p => p.country));
const str = value => typeof value === 'string' ? value.trim() : '';
const upper = value => str(value).toUpperCase();
const copy = value => value == null ? value : structuredClone(value);
const distinct = values => [...new Set(values.filter(Boolean))];

export function validIsin(value) {
  const isin = upper(value);
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = [...isin].map(c => /\d/.test(c) ? c : String(c.charCodeAt(0) - 55)).join('');
  return [...digits].reverse().reduce((sum, c, i) => {
    let digit = Number(c) * (i % 2 ? 2 : 1);
    return sum + (digit > 9 ? digit - 9 : digit);
  }, 0) % 10 === 0;
}

/** Broad "stock/equity" and display-name guesses cannot prove a share class. */
export function classifyEquity(row = {}) {
  const type = upper(row.security_type || row.securityType || row.instrument_type || row.asset_type || row.assetType || row.type).replace(/[ _-]+/g, ' ');
  const name = upper(row.name || row.company_name);
  const excluded = /\b(ETF|ETN|ETC|UCITS|FUND|WARRANT|CERTIFICATE|RIGHTS?|UNITS?|BONDS?|DEBENTURE|ADR|GDR|DEPOSITARY RECEIPT)\b/;
  const equity = /^(COMMON( STOCK| SHARE(S)?)?|ORDINARY( SHARE(S)?| STOCK)?|PREFERRED( STOCK| SHARE(S)?)?|PREFERENCE SHARE(S)?)$/;
  if (excluded.test(type)) return { status: 'REJECTED', kind: type, reasons: ['EXCLUDED_INSTRUMENT_TYPE'] };
  if (excluded.test(name)) return { status: equity.test(type) ? 'REVIEW' : 'REJECTED', kind: null, reasons: ['EXCLUDED_NAME_LABEL'] };
  if (!equity.test(type)) return { status: 'REVIEW', kind: null, reasons: ['AMBIGUOUS_INSTRUMENT_TYPE'] };
  return { status: 'ACCEPTED', kind: /PREFER/.test(type) ? 'PREFERRED' : 'ORDINARY', reasons: [] };
}

/** Accepts corrected connector rows or {row, raw, provenance, exchangeMic}. */
export function normalizeDirectoryObservation(observation = {}) {
  const row = observation.row || (observation.normalized ? { ...(observation.raw || {}), ...observation.normalized } : observation.raw || observation);
  const exchange = row.stock_exchange || row.stockExchange || (typeof row.exchange === 'object' ? row.exchange : {}) || {};
  // Provider acronym is deliberately never treated as a MIC.
  const micCandidates = distinct([observation.exchangeMic, row.exchangeMic, row.mic, row.mic_code, row.providerExchange,
    exchange.mic, exchange.mic_code, exchange.exchange_mic, typeof row.exchange === 'string' && /^[A-Z0-9]{4}$/.test(row.exchange) ? row.exchange : null].map(upper));
  const mic = micCandidates[0] || '';
  const symbol = str(row.providerSymbol || row.providerTicker || row.symbol || row.ticker);
  const active = row.is_active ?? row.active ?? (upper(row.status) === 'ACTIVE' ? true : ['INACTIVE', 'DELISTED'].includes(upper(row.status)) ? false : null);
  return {
    provider: 'marketstack', providerSymbol: symbol, providerTicker: symbol, symbol, mic: mic || null, micConflict: micCandidates.length > 1,
    exchangeCountry: MIC_COUNTRY.get(mic) || null,
    providerExchangeCode: str(row.providerExchangeCode || exchange.acronym || row.exchange_code) || null,
    name: str(row.name || row.company_name) || null,
    isin: upper(row.isin) || null, currency: upper(row.currency || exchange.currency?.code) || null,
    active, classification: classifyEquity(row),
    // Generic row.country is often the exchange country. It is not issuer evidence.
    issuerCountry: upper(row.issuer_country || row.issuer?.country) || null,
    raw: copy(observation.raw ?? row), input: copy(observation), row: copy(row), provenance: copy(observation.provenance || {})
  };
}

function evidenceFor(listing, evidence) {
  return evidence.filter(e => e.verified === true && str(e.provenance?.source || e.source) && (
    (upper(e.mic) === listing.mic && upper(e.providerSymbol || e.providerTicker || e.symbol) === upper(listing.providerSymbol)) ||
    (validIsin(listing.isin) && upper(e.isin) === listing.isin)
  ));
}
function one(values) { const v = distinct(values); return v.length === 1 ? v[0] : null; }
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function companyKey(e) {
  if (validLei(e.lei)) return `LEI:${upper(e.lei)}`;
  if (/^\d{1,10}$/.test(String(e.cik || ''))) return CompanyMaster.issuerIdFromCik(String(e.cik));
  if (str(e.issuerId) && str(e.issuerIdNamespace)) return `${str(e.issuerIdNamespace)}:${str(e.issuerId)}`;
  return null;
}

export function validLei(value) {
  const lei = upper(value);
  if (!/^[A-Z0-9]{18}\d{2}$/.test(lei)) return false;
  const digits = [...lei].map(c => /\d/.test(c) ? c : String(c.charCodeAt(0) - 55)).join('');
  return [...digits].reduce((remainder, digit) => (remainder * 10 + Number(digit)) % 97, 0) === 1;
}

/** Read private freshly collected official evidence without making paid calls. */
export function readGermanIdentityEvidence(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.schema !== 'marketstack-germany-official-identity-evidence-1.0.0' || !Array.isArray(manifest.rows)) {
    throw new Error('OFFICIAL_IDENTITY_EVIDENCE_SCHEMA_INVALID');
  }
  const identityEvidence = [], quarantined = [];
  for (const row of manifest.rows) {
    const gleif = row.provenance?.gleif, xetra = row.provenance?.xetra;
    const valid = row.verified === true && validIsin(row.isin) && validLei(row.lei) &&
      gleif?.httpStatus === 200 && upper(gleif.queryIsin) === upper(row.isin) &&
      /^[a-f0-9]{64}$/.test(gleif.sha256 || '') && /^[a-f0-9]{64}$/.test(xetra?.sha256 || '') &&
      row.issuerCountryBasis === 'GLEIF_ENTITY_JURISDICTION' && upper(row.legalJurisdiction) === upper(row.issuerCountry) &&
      str(gleif.url) && str(xetra?.url) && str(row.provenance?.source);
    if (valid) identityEvidence.push(copy(row));
    else quarantined.push({ isin: row.isin || null, status: row.status || null, reason: 'OFFICIAL_IDENTITY_EVIDENCE_UNVERIFIED' });
  }
  return { identityEvidence, quarantined, manifest: {
    schema: manifest.schema, generatedAt: manifest.generatedAt || null, complete: manifest.complete === true,
    candidateCount: manifest.candidateCount ?? null, completed: manifest.completed ?? manifest.rows.length,
    gleifRequests: manifest.gleifRequests ?? null, marketstackCredits: manifest.marketstackCredits ?? null,
    rightsStatus: manifest.rightsStatus || 'UNKNOWN', xetraSource: copy(manifest.xetraSource)
  } };
}

/**
 * Identity ACCEPTED is a private discovery decision, never public readiness.
 * Verified evidence joins ONLY through exact MIC/symbol or checksum-valid ISIN.
 * A same-name match, listing country or ISIN prefix never determines the issuer.
 */
export function buildEuropeEquityUniverse(observations = [], options = {}) {
  const evidence = options.identityEvidence || [];
  const protectedIds = new Set(options.protectedSecurityIds || []);
  const byListing = new Map();
  observations.forEach((observation, ordinal) => {
    const n = normalizeDirectoryObservation(observation);
    const key = n.mic && n.providerSymbol ? `marketstack:${n.mic}:${upper(n.providerSymbol)}` : `unresolved:${ordinal}`;
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push(n);
  });
  const candidates = [...byListing].map(([listingKey, versions]) => {
    const n = versions[0], matches = versions.flatMap(v => evidenceFor(v, evidence));
    // Exact provider LEI can identify an issuer; listing country still cannot.
    for (const v of versions) if (validLei(v.row.lei) && v.issuerCountry && str(v.provenance.source || v.provenance.endpoint)) {
      matches.push({ verified: true, lei: upper(v.row.lei), issuerCountry: v.issuerCountry,
        isin: v.isin, source: v.provenance.source || v.provenance.endpoint,
        provenance: copy(v.provenance), identityBasis: 'PROVIDER_LEI_AND_EXPLICIT_ISSUER_COUNTRY' });
    }
    const reasons = distinct(versions.flatMap(v => v.classification.reasons));
    const issuerKeys = distinct(matches.map(companyKey));
    const issuerCountries = distinct([...matches.map(e => upper(e.issuerCountry)), ...versions.map(v => v.issuerCountry)]);
    const isins = distinct([...versions.map(v => v.isin), ...matches.map(e => upper(e.isin))]);
    const primaryMics = distinct(matches.map(e => upper(e.primaryMic)));
    const types = distinct(matches.map(e => upper(e.securityType)));
    let classified = types.length === 1 ? classifyEquity({ security_type: types[0], name: n.name }) : n.classification;
    if (!classified.kind && n.classification.kind) classified = n.classification;
    // Explicit investable cash-share policy: identify the ISIN class without
    // pretending the reference CS category distinguishes ordinary/preferred.
    const officialCashShare = matches.some(e => e.productPrimaryPolicy === 'GERMANY_LIQUID_LOCAL_XETRA' &&
      e.officialInstrumentType === 'CS' && e.typeSource === 'XETRA_REFERENCE' &&
      upper(e.mic) === 'XETR' && upper(e.issuerCountry) === 'DE' && e.active === true && e.regulatoryLiquid === true &&
      validIsin(e.isin) && validLei(e.lei) && e.issuerCountryBasis === 'GLEIF_ENTITY_JURISDICTION' &&
      upper(e.legalJurisdiction) === 'DE' && str(e.provenance?.gleif?.url) && str(e.provenance?.xetra?.url) &&
      e.provenance?.gleif?.httpStatus === 200 && upper(e.provenance.gleif.queryIsin) === upper(e.isin) &&
      /^[a-f0-9]{64}$/.test(e.provenance?.gleif?.sha256 || '') &&
      /^[a-f0-9]{64}$/.test(e.provenance?.xetra?.sha256 || '') && n.mic === 'XETR');
    if (!classified.kind && classified.status !== 'REJECTED' && officialCashShare) {
      classified = { status: 'ACCEPTED', kind: 'EQUITY_SHARE_CLASS', reasons: [] };
    }
    const kind = classified.kind;
    if (classified.status === 'ACCEPTED') {
      const index = reasons.indexOf('AMBIGUOUS_INSTRUMENT_TYPE');
      if (index >= 0) reasons.splice(index, 1);
    }
    let rejected = versions.some(v => v.classification.status === 'REJECTED') || classified.status === 'REJECTED';
    reasons.push(...classified.reasons);
    // Issuer/security facts join by ISIN; listing activity additionally needs venue.
    const listingActiveEvidence = matches.filter(e => upper(e.mic) === n.mic &&
      (!str(e.providerSymbol || e.providerTicker || e.symbol) || upper(e.providerSymbol || e.providerTicker || e.symbol) === upper(n.providerSymbol)));
    const activeEvidence = [...new Set([...versions.map(v => v.active), ...listingActiveEvidence.map(e => e.active)].filter(v => typeof v === 'boolean'))];
    if (activeEvidence.includes(false)) { rejected = true; reasons.push('INACTIVE_LISTING'); }
    if (!activeEvidence.includes(true)) reasons.push('ACTIVE_STATUS_UNKNOWN');
    if (!n.mic || !MIC_COUNTRY.has(n.mic)) reasons.push('UNKNOWN_OR_NON_TARGET_MIC');
    if (versions.some(v => v.micConflict)) reasons.push('CONFLICTING_MIC_EVIDENCE');
    if (!Identity.normalizeTicker(n.providerSymbol)) reasons.push('INVALID_PROVIDER_SYMBOL');
    if (issuerKeys.length !== 1) reasons.push(issuerKeys.length ? 'CONFLICTING_ISSUER_IDENTITY' : 'ISSUER_IDENTITY_MISSING');
    if (issuerCountries.length !== 1) reasons.push(issuerCountries.length ? 'CONFLICTING_ISSUER_COUNTRY' : 'ISSUER_COUNTRY_MISSING');
    else if (!COUNTRIES.has(issuerCountries[0])) { rejected = true; reasons.push('NON_TARGET_ISSUER_COUNTRY'); }
    if (isins.length !== 1 || !validIsin(isins[0])) reasons.push(isins.length > 1 ? 'CONFLICTING_SHARE_CLASS_IDENTITY' : 'VALID_ISIN_MISSING');
    if (primaryMics.length !== 1 || !MIC_COUNTRY.has(primaryMics[0])) reasons.push('PRIMARY_LISTING_UNVERIFIED');
    if (types.length > 1 || distinct(versions.map(v => v.classification.kind)).length > 1) reasons.push('CONFLICTING_INSTRUMENT_TYPE');
    if (classified.kind && versions.some(v => v.classification.kind && v.classification.kind !== classified.kind)) reasons.push('CONFLICTING_INSTRUMENT_TYPE');
    if (distinct(versions.map(v => v.currency)).length > 1) reasons.push('CONFLICTING_LISTING_CURRENCY');
    if (kind === 'PREFERRED' && !matches.some(e => e.preferredRelevant === true)) reasons.push('PREFERRED_RELEVANCE_UNVERIFIED');
    const primaryPolicies = distinct(matches.map(e => str(e.productPrimaryPolicy)));
    for (const e of matches.filter(e => e.productPrimaryPolicy)) {
      if (e.productPrimaryPolicy !== 'GERMANY_LIQUID_LOCAL_XETRA' || upper(e.issuerCountry) !== 'DE' ||
        upper(e.primaryMic) !== 'XETR' || upper(e.mic) !== 'XETR' || e.active !== true || e.regulatoryLiquid !== true) {
        reasons.push('PRODUCT_PRIMARY_POLICY_UNVERIFIED');
      }
    }
    const canonicalTicker = n.providerSymbol && n.mic ? `${upper(n.providerSymbol)}.${n.mic}` : null;
    let proposedSecurityId = null;
    try { proposedSecurityId = Identity.securityIdForTicker(canonicalTicker); } catch { reasons.push('CANONICAL_TICKER_INVALID'); }
    if (protectedIds.has(proposedSecurityId)) reasons.push('PROTECTED_CANONICAL_ID_COLLISION');
    return {
      listingKey, instrumentId: n.mic && n.providerSymbol ? CompanyMaster.mintInstrumentId({ provider: 'marketstack', exchange: n.mic, symbol: upper(n.providerSymbol) }, 0) : null,
      provider: 'marketstack', providerSymbol: n.providerSymbol, providerTicker: n.providerSymbol, symbol: n.providerSymbol, mic: n.mic,
      providerExchangeCode: n.providerExchangeCode, exchangeCountry: n.exchangeCountry,
      name: n.name, currency: n.currency, active: activeEvidence.length === 1 ? activeEvidence[0] : null, kind,
      shareClassDetail: kind === 'ORDINARY' || kind === 'PREFERRED' ? kind : 'UNKNOWN',
      companyKey: one(issuerKeys), issuerCountry: one(issuerCountries), isin: one(isins),
      securityKey: isins.length === 1 && validIsin(isins[0]) ? `ISIN:${isins[0]}` : null,
      primaryMic: one(primaryMics), isPrimary: primaryMics.length === 1 && n.mic === primaryMics[0],
      productPrimaryPolicy: one(primaryPolicies),
      primaryMarketMic: one(matches.map(e => upper(e.primaryMarketMic))),
      canonicalTicker, proposedSecurityId, securityId: null,
      status: rejected ? 'REJECTED' : reasons.length ? 'REVIEW' : 'ACCEPTED', reasons: distinct(reasons),
      observations: versions.map(v => ({ raw: v.raw, input: v.input, normalized: { ...v, raw: undefined, row: undefined, input: undefined }, provenance: v.provenance })),
      identityEvidence: copy(matches), indexMembership: []
    };
  });
  const groups = new Map();
  for (const c of candidates.filter(c => c.status !== 'REJECTED' && c.securityKey)) {
    if (!groups.has(c.securityKey)) groups.set(c.securityKey, []);
    groups.get(c.securityKey).push(c);
  }
  for (const listings of groups.values()) {
    const primaries = listings.filter(l => l.isPrimary && l.status === 'ACCEPTED');
    const issuerKeys = distinct(listings.map(l => l.companyKey));
    const kinds = distinct(listings.map(l => l.kind));
    const nominatedMics = distinct(listings.map(l => l.primaryMic));
    if (primaries.length !== 1 || issuerKeys.length > 1 || kinds.length > 1 || nominatedMics.length > 1) {
      for (const l of listings) if (l.status !== 'REJECTED') {
        l.status = 'REVIEW'; l.reasons = distinct([...l.reasons,
          ...(issuerKeys.length > 1 ? ['SHARE_CLASS_ISSUER_CONFLICT'] : []),
          ...(kinds.length > 1 ? ['SHARE_CLASS_TYPE_CONFLICT'] : []),
          ...(nominatedMics.length > 1 || primaries.length !== 1 ? ['PRIMARY_LISTING_UNRESOLVED'] : [])]);
      }
    } else {
      for (const l of listings) if (l.status === 'ACCEPTED') l.securityId = primaries[0].proposedSecurityId;
    }
  }
  const canonicalOwners = new Map();
  for (const c of candidates.filter(c => c.securityId)) {
    if (!canonicalOwners.has(c.securityId)) canonicalOwners.set(c.securityId, new Set());
    canonicalOwners.get(c.securityId).add(c.securityKey);
  }
  for (const c of candidates) if (canonicalOwners.get(c.securityId)?.size > 1) {
    c.status = 'REVIEW'; c.securityId = null; c.reasons.push('CANONICAL_ID_COLLISION');
  }
  const companyCountries = new Map();
  for (const c of candidates.filter(c => c.status !== 'REJECTED' && c.companyKey)) {
    if (!companyCountries.has(c.companyKey)) companyCountries.set(c.companyKey, new Set());
    if (c.issuerCountry) companyCountries.get(c.companyKey).add(c.issuerCountry);
  }
  for (const c of candidates) if (companyCountries.get(c.companyKey)?.size > 1 && c.status !== 'REJECTED') {
    c.status = 'REVIEW'; c.securityId = null; c.reasons = distinct([...c.reasons, 'COMPANY_COUNTRY_CONFLICT']);
  }
  // Index membership is supplied dated evidence, never guessed from names/tickers.
  for (const c of candidates) c.indexMembership = copy((options.indexMembership || []).filter(m =>
    validDate(m.asOf) && m.source && validIsin(m.isin) && upper(m.isin) === c.isin &&
    (!options.generatedAt || m.asOf <= String(options.generatedAt).slice(0, 10))));
  candidates.sort((a, b) => (EUROPE_EXCHANGE_PLAN.find(p => p.country === a.issuerCountry)?.priority || 99) -
    (EUROPE_EXCHANGE_PLAN.find(p => p.country === b.issuerCountry)?.priority || 99) || a.listingKey.localeCompare(b.listingKey));
  const accepted = candidates.filter(c => c.status === 'ACCEPTED');
  const securities = [...new Set(accepted.map(c => c.securityKey))].map(key => {
    const listings = accepted.filter(c => c.securityKey === key), primary = listings.find(c => c.isPrimary);
    return { securityKey: key, securityId: primary.securityId, canonicalTicker: primary.canonicalTicker,
      companyKey: primary.companyKey, isin: primary.isin, kind: primary.kind, shareClassDetail: primary.shareClassDetail,
      primaryListing: primary.listingKey, listings: listings.map(c => c.listingKey),
      aliases: distinct(listings.flatMap(c => [c.providerSymbol, `${c.providerSymbol}.${c.mic}`])) };
  });
  const companies = [...new Set(accepted.map(c => c.companyKey))].map(key => ({ companyKey: key,
    issuerCountry: accepted.find(c => c.companyKey === key).issuerCountry,
    names: distinct(accepted.filter(c => c.companyKey === key).map(c => c.name)),
    securities: securities.filter(s => s.companyKey === key).map(s => s.securityKey) }));
  const counts = rows => ({ candidates: rows.length, accepted: rows.filter(c => c.status === 'ACCEPTED').length,
    review: rows.filter(c => c.status === 'REVIEW').length, rejected: rows.filter(c => c.status === 'REJECTED').length });
  return { schemaVersion: 'marketstack-europe-equity-universe-1.0.0', generatedAt: options.generatedAt || null,
    mode: 'PRIVATE_DISCOVERY', publicationAllowed: false, inputObservationCount: observations.length,
    summary: { ...counts(candidates), companies: companies.length, securities: securities.length, listings: accepted.length },
    candidates, companies, securities, listings: accepted,
    germany: { summary: { ...counts(candidates.filter(c => c.issuerCountry === 'DE')),
      companies: companies.filter(c => c.issuerCountry === 'DE').length,
      securities: securities.filter(s => accepted.find(c => c.securityKey === s.securityKey).issuerCountry === 'DE').length,
      listings: accepted.filter(c => c.issuerCountry === 'DE').length },
      candidates: candidates.filter(c => c.issuerCountry === 'DE') },
    constraints: ['NO_DISPLAY_NAME_IDENTITY_MATCH', 'EXCHANGE_COUNTRY_IS_NOT_ISSUER_COUNTRY', 'NO_817_LIMIT',
      'US_CANONICAL_IDS_PROTECTED', 'NO_PUBLICATION_WITHOUT_PRICE_QUALITY_AND_RIGHTS_GATES'] };
}
