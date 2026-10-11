/** Product-specific evidence projection. No identity generation, pricing math or provider calls. */
export const PRODUCT_READINESS_VERSION = 'europe-product-readiness-2.1';
const unique = values => [...new Set(values)];
const available = result => result?.state === 'AVAILABLE';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const finiteMetrics = metrics => Object.values(metrics || {}).filter(value => typeof value === 'number' && Number.isFinite(value)).length;

/** Audit the producer's explicit graph against Core, preserving multiple share classes.
 * Unknown class detail is retained; it is not evidence of ordinary/common shares.
 */
export function auditEuropeCanonicalGraph(universe, { catalog, previousUniverse, protectedIds = [], previousMembershipPolicy = 'ALL' } = {}) {
  if (!['ALL', 'SHARED_CURRENT_ADMISSION_ONLY'].includes(previousMembershipPolicy)) throw Error('CANONICAL_PREVIOUS_MEMBERSHIP_POLICY_INVALID');
  const findings = [], companies = new Map(), securities = new Map(), listings = new Map();
  const protectedSet = new Set(protectedIds);
  const add = (map, rows, key, kind) => {
    for (const row of rows || []) {
      if (!nonempty(row[key]) || map.has(row[key])) findings.push({ code: 'DUPLICATE_OR_MISSING_' + kind, id: row[key] || null });
      else map.set(row[key], row);
    }
  };
  add(companies, universe?.companies, 'companyKey', 'COMPANY');
  add(securities, universe?.securities, 'securityId', 'SECURITY');
  add(listings, universe?.listings, 'listingKey', 'LISTING');
  const previous = new Map((previousUniverse?.securities || []).map(s => [s.securityKey || 'ISIN:' + s.isin, s.securityId]));
  const projected = new Map((catalog?.securities || []).map(s => [s.securityId, s]));
  const listingOwners = new Map(), isinOwners = new Map(), rows = [];
  for (const s of securities.values()) {
    const errors = [], company = companies.get(s.companyKey), priorId = previous.get(s.securityKey || 'ISIN:' + s.isin);
    const listingKeys = (s.listings || []).map(l => typeof l === 'string' ? l : l.listingKey || l.listingId);
    const primaryKey = s.primaryListing || s.primaryListingId;
    if (!company) errors.push('COMPANY_MISSING');
    if (company && (!nonempty(company.issuerCountry) || !/^LEI:[A-Z0-9]{20}$/.test(company.companyKey))) errors.push('COMPANY_IDENTITY_INCOMPLETE');
    if (company && !(company.securities || []).includes(s.securityKey)) errors.push('COMPANY_SECURITY_LINK_MISSING');
    if (!nonempty(s.isin) || s.securityKey !== 'ISIN:' + s.isin) errors.push('SHARE_CLASS_ISIN_BINDING_MISSING');
    if (isinOwners.has(s.isin)) errors.push('DUPLICATE_SECURITY_ISIN'); else isinOwners.set(s.isin, s.securityId);
    if (protectedSet.has(s.securityId)) errors.push('PROTECTED_US_ID_COLLISION');
    if (priorId && priorId !== s.securityId) errors.push('PREVIOUS_CANONICAL_ID_CHANGED');
    if (!Array.isArray(s.listings) || !listingKeys.length || unique(listingKeys).length !== listingKeys.length || !listingKeys.includes(primaryKey)) errors.push('LISTING_MEMBERSHIP_INVALID');
    const bound = [];
    for (const key of listingKeys) {
      const l = listings.get(key);
      if (!l || l.securityId !== s.securityId || l.companyKey !== s.companyKey) { errors.push('LISTING_IDENTITY_BINDING_INVALID'); continue; }
      if (listingOwners.has(key)) errors.push('LISTING_MULTIPLE_SECURITY_OWNERS'); else listingOwners.set(key, s.securityId);
      if (l.status !== 'ACCEPTED' || !nonempty(l.mic) || !nonempty(l.providerSymbol) || !nonempty(l.currency) || l.active !== true) errors.push('LISTING_FACTS_INCOMPLETE');
      if (!Array.isArray(l.identityEvidence) || !l.identityEvidence.some(e => e.verified === true && (e.source || e.provenance?.source))) errors.push('LISTING_IDENTITY_EVIDENCE_MISSING');
      if (l.isin && l.isin !== s.isin || l.issuerCountry && l.issuerCountry !== company?.issuerCountry ||
          (l.identityEvidence || []).some(e => e.verified === true && (e.isin && e.isin !== s.isin || e.lei && 'LEI:' + e.lei !== s.companyKey || e.issuerCountry && e.issuerCountry !== company?.issuerCountry))) errors.push('OFFICIAL_IDENTITY_DIMENSIONS_CONFLICT');
      if (typeof l.isPrimary !== 'boolean' || l.isPrimary !== (key === primaryKey)) errors.push('PRIMARY_SECONDARY_BINDING_INVALID');
      bound.push({ listingId: key, mic: l.mic, providerSymbol: l.providerSymbol, currency: l.currency, active: l.active,
        isPrimary: l.isPrimary, aliases: unique([...(l.verifiedAliases || []), ...(l.aliases || [])]), issuerCountry: l.issuerCountry || company?.issuerCountry || null });
    }
    if (bound.filter(l => l.isPrimary).length !== 1) errors.push('PRIMARY_LISTING_NOT_UNIQUE');
    if (catalog) {
      const c = projected.get(s.securityId);
      if (!c || c.companyId !== s.companyKey || c.isin !== s.isin || c.primaryListingId !== primaryKey ||
          JSON.stringify((c.listings || []).map(l => l.listingId).sort()) !== JSON.stringify(listingKeys.slice().sort())) errors.push('CORE_GRAPH_MATERIALIZATION_MISMATCH');
    }
    errors.forEach(code => findings.push({ code, securityId: s.securityId }));
    rows.push({ companyId: s.companyKey, lei: s.companyKey?.startsWith('LEI:') ? s.companyKey.slice(4) : null,
      companyCountry: company?.issuerCountry || null, securityId: s.securityId, isin: s.isin || null,
      shareClassDetail: s.shareClassDetail || 'UNKNOWN', primaryListingId: primaryKey, listings: bound,
      status: errors.length ? 'BLOCKED_IDENTITY' : 'IDENTITY_READY', reasons: unique(errors) });
  }
  for (const key of listings.keys()) if (!listingOwners.has(key)) findings.push({ code: 'ORPHAN_ACCEPTED_LISTING', listingId: key });
  for (const c of companies.values()) if (!(c.securities || []).length || (c.securities || []).some(key => ![...securities.values()].some(s => s.securityKey === key && s.companyKey === c.companyKey))) findings.push({ code: 'COMPANY_SECURITY_MEMBERSHIP_INVALID', companyId: c.companyKey });
  if (previousMembershipPolicy === 'ALL') for (const id of previous.values()) if (!securities.has(id)) findings.push({ code: 'PREVIOUS_ACCEPTED_SECURITY_MISSING', securityId: id });
  return { schema: PRODUCT_READINESS_VERSION, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    status: findings.length ? 'CANONICAL_GRAPH_BLOCKED' : 'CANONICAL_GRAPH_VERIFIED',
    auditScope: 'STRUCTURAL_GRAPH_AND_SOURCE_DIMENSIONS', previousMembershipPolicy,
    checksumValidation: 'AUTHENTICATED_UPSTREAM_PRODUCER_REQUIRED_NOT_REEVALUATED_HERE',
    coreMaterializationVerified: !!catalog && findings.length === 0,
    summary: { companies: companies.size, securities: securities.size, listings: listings.size,
      identityReady: rows.filter(r => r.status === 'IDENTITY_READY').length, findings: findings.length,
      unknownShareClassDetail: rows.filter(r => r.shareClassDetail === 'UNKNOWN').length }, rows, findings };
}

function confirmedRights(rights, scopes) {
  return rights?.display === true && rights.commercial === true && nonempty(rights.evidenceRef) &&
    rights.confirmation?.status === 'VERIFIED' && rights.confirmation.evidenceRef === rights.evidenceRef &&
    ['EXECUTED_CONTRACT', 'PROVIDER_WRITTEN_CONFIRMATION'].includes(rights.confirmation.sourceType) &&
    scopes.every(scope => rights.dataPaths?.includes(scope));
}

/** Input observations are actual Core responses, not readiness claims alone.
 * Input-ready Quant/strategy gates never imply that a Europe ranking/strategy
 * population has been produced. Each product retains its own publication gate.
 */
export function projectEuropeProductPublication({ identity, readiness = {}, searchesPassed = false, watchlistPassed = false,
  chart, technical, screener, fundamentals, quant, rights = {}, uxEvidence = {} } = {}) {
  const identityReady = available(identity) && nonempty(identity.data?.securityId) && nonempty(identity.data?.listingId) && readiness.IDENTITY === 'VERIFIED';
  const bound = value => value?.securityId === identity?.data?.securityId && value?.listingId === identity?.data?.listingId;
  const basis = chart?.basis || readiness.priceBasis, priceScope = basis === 'RAW_UNADJUSTED' ? 'RAW_EOD' : 'CANONICAL_EOD';
  const chartReady = chart?.state === 'AVAILABLE' && bound(chart) && chart.currency === identity?.data?.currency &&
    ['RAW_UNADJUSTED', 'CANONICAL_SPLIT_ADJUSTED'].includes(chart.basis) && ['CHART_READY', 'CHART_LIMITED'].includes(chart.chartStatus);
  const technicalReady = available(technical) && bound(technical) && technical.currency === identity?.data?.currency &&
    ['TECHNICAL_READY', 'TECHNICAL_PARTIAL'].includes(technical.status) && finiteMetrics(technical.metrics) > 0;
  const technicalMethodValid = nonempty(technical?.methodology) && technical.methodology.startsWith('EXISTING_ENGINE:') &&
    ['RAW_UNADJUSTED', 'CANONICAL_SPLIT_ADJUSTED'].includes(technical.priceBasis);
  const f = fundamentals?.data, mapping = f?.identity?.mapping, i = identity?.data;
  const fundamentalsReady = available(fundamentals) && f?.identity?.status === 'VERIFIED' &&
    mapping?.securityId === i?.securityId && mapping?.listingId === i?.listingId && mapping?.companyId === i?.companyId &&
    nonempty(i?.companyId) && mapping?.isin === i?.isin && nonempty(i?.isin) && mapping?.mic === i?.mic &&
    mapping?.shareClassId === (i?.shareClassId || 'ISIN:' + i?.isin) &&
    nonempty(i?.mic) && mapping?.listingCurrency === i?.currency && f.currencyBasisValid === true && f.sharesBasisValid === true &&
    f.sourcePolicy === 'ESEF_OFFICIAL_FILINGS_PRIMARY_SEC_ACTUAL_FILER_ONLY' && Array.isArray(f.identity.provenance) && f.identity.provenance.length > 0;
  const technicalScope = technical?.priceBasis === 'RAW_UNADJUSTED' ? 'RAW_EOD' : 'CANONICAL_EOD';
  const definitions = [
    ['IDENTITY', 1, identityReady, 'IDENTITY_READY', ['IDENTITY']],
    ['SEARCH', 1, identityReady && searchesPassed, 'SEARCH_READY', ['IDENTITY']],
    ['WATCHLIST', 1, identityReady && watchlistPassed, 'WATCHLIST_READY', ['IDENTITY']],
    ['CHART', 2, chartReady, chart?.chartStatus || 'CHART_BLOCKED', ['IDENTITY', priceScope]],
    ['DISCOVER', 2, chartReady && readiness.DISCOVER === 'READY', readiness.DISCOVER === 'READY' ? 'DISCOVER_READY' : 'DISCOVER_BLOCKED', ['IDENTITY', priceScope]],
    ['SCREENER', 3, available(screener) && bound(screener.data) && readiness.SCREENER === 'READY', readiness.SCREENER === 'READY' ? 'SCREENER_READY' : 'SCREENER_BLOCKED', ['IDENTITY', priceScope]],
    ['TECHNICAL', 3, technicalReady, technical?.status || 'TECHNICAL_BLOCKED', ['IDENTITY', technicalScope, 'TECHNICAL']],
    ['FUNDAMENTALS', 4, fundamentalsReady && readiness.FUNDAMENTALS === 'VALIDATED', readiness.FUNDAMENTALS === 'VALIDATED' ? 'FUNDAMENTALS_READY' : 'FUNDAMENTALS_BLOCKED', ['IDENTITY', 'FUNDAMENTALS']],
    ['QUANT', 4, available(quant) && quant.data?.securityId === i?.securityId && quant.data?.readiness === 'QUANT_FULL' &&
      quant.data?.population === 'EUROPE_SEPARATE_READINESS' && readiness.QUANT === 'QUANT_FULL', readiness.QUANT || 'QUANT_BLOCKED', ['IDENTITY', priceScope, 'TECHNICAL', 'FUNDAMENTALS', 'QUANT']],
    ['SUPERTRADER', 5, readiness.SUPERTRADER === 'READY', readiness.SUPERTRADER || 'BLOCKED', ['IDENTITY', priceScope, 'STRATEGY']],
    ['BACKTEST', 5, readiness.BACKTEST === 'BACKTEST_READY', readiness.BACKTEST || 'BLOCKED', ['IDENTITY', priceScope, 'STRATEGY']]
  ];
  const products = {};
  for (const [product, tier, dataReady, dataStatus, scopes] of definitions) {
    let reason = null, privateStatus = 'READY_PRIVATE';
    if (!identityReady) { privateStatus = 'BLOCKED_IDENTITY'; reason = 'CANONICAL_IDENTITY_NOT_AVAILABLE'; }
    else if (!dataReady) { privateStatus = 'BLOCKED_DATA'; reason = 'REQUIRED_PRODUCT_INPUT_OR_CONSUMER_PROOF_MISSING'; }
    else if (product === 'TECHNICAL' && !technicalMethodValid) { privateStatus = 'BLOCKED_METHOD'; reason = 'UNCHANGED_ENGINE_PROVENANCE_MISSING'; }
    else if (['QUANT', 'SUPERTRADER', 'BACKTEST'].includes(product)) { privateStatus = 'BLOCKED_METHOD'; reason = 'INPUT_READINESS_ONLY_NO_EUROPE_PRODUCT_POPULATION'; }
    let publicStatus = privateStatus;
    if (privateStatus === 'READY_PRIVATE') {
      publicStatus = confirmedRights(rights, scopes) ? 'READY_PUBLIC' : 'BLOCKED_RIGHTS';
      if (publicStatus === 'READY_PUBLIC' && product === 'CHART' && dataStatus === 'CHART_LIMITED' &&
          !(uxEvidence.chartLimitationVisible === true && nonempty(uxEvidence.evidenceRef))) publicStatus = 'BLOCKED_METHOD';
      if (publicStatus === 'READY_PUBLIC' && product === 'TECHNICAL' &&
          (dataStatus !== 'TECHNICAL_READY' || readiness.TECHNICAL !== 'TECHNICAL_READY')) publicStatus = 'BLOCKED_METHOD';
    }
    products[product] = { tier, dataStatus, inputReady: identityReady && dataReady, privateStatus, publicStatus,
      publicationStatus: publicStatus === 'READY_PUBLIC' ? publicStatus : privateStatus, reason,
      publicReason: publicStatus === 'BLOCKED_RIGHTS' ? 'CONCRETE_DISPLAY_COMMERCIAL_PATH_RIGHTS_UNCONFIRMED' :
        publicStatus === 'BLOCKED_METHOD' && privateStatus === 'READY_PRIVATE' ?
          product === 'TECHNICAL' ? 'STRICT_PUBLIC_TECHNICAL_GATE_NOT_READY' : 'VISIBLE_LIMITATION_UX_PROOF_MISSING' : reason,
      requiredRightsPaths: scopes };
  }
  const b = technical?.benchmark;
  const rsReady = technicalReady && technicalMethodValid && readiness.RS === 'RS_READY' && technical.RS === 'RS_READY' &&
    typeof technical.metrics?.relativeStrength === 'number' && Number.isFinite(technical.metrics.relativeStrength) &&
    b?.region === 'EUROPE' && b.status === 'VALIDATED' && nonempty(b.securityId) && b.securityId !== i?.securityId && nonempty(b.evidenceRef);
  return { schema: PRODUCT_READINESS_VERSION, products, RS: rsReady ? 'RS_READY' : 'RS_BLOCKED',
    validTechnicalMetrics: technicalReady ? finiteMetrics(technical.metrics) : 0,
    population: 'EUROPE_SEPARATE_READINESS', rankingEligible: false };
}
