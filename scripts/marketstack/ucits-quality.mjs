/** Internal-only evidence analysis. No fetches, publication, mutation or guessed metadata. */
import { validIsin } from './europe-universe.mjs';
const DAY = 86400000;
const DERIVATIVES = /swap|future|option|forward|derivative|synthetic/i;
const CASH = /^(cash|cash equivalent|money market|currency)$/i;
const present = value => value !== undefined && value !== null && value !== '';
const first = (...values) => values.find(present) ?? null;
const finite = value => {
  if (!present(value) || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Do not guess decimal separators, magnitudes or source units.
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(value.trim())) return null;
  const number = Number(value.trim().replace(/%$/, ''));
  return Number.isFinite(number) ? number : null;
};
const date = value => {
  const text = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = Date.parse(text + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === text ? text : null;
};
const stableRow = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
function evidence(object, paths, transform = value => value) {
  for (const path of paths) {
    const raw = at(object, path);
    if (!present(raw)) continue;
    const value = transform(raw);
    if (value !== null && value !== undefined) return { value, raw, field: path };
  }
  return { value: null, raw: null, field: null };
}

/** Explicit unit only. In particular a 100% total is never imposed on a partial basket. */
export function analyzeUcitsHoldings(input = {}, options = {}) {
  const report = input.report || input;
  const rows = Array.isArray(input.holdings) ? input.holdings : Array.isArray(report.holdings) ? report.holdings : Array.isArray(report.data?.holdings) ? report.data.holdings : [];
  const raw = first(input.rawData, input.raw, report.rawData, report.raw);
  const suppliedNow = options.now || new Date().toISOString();
  const now = date(suppliedNow) || (typeof suppliedNow === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(suppliedNow)
    && Number.isFinite(Date.parse(suppliedNow)) ? date(suppliedNow.slice(0, 10)) : null);
  if (!now) throw new Error('INVALID_NOW');
  const pagination = input.pagination || report.pagination || {};
  const statusCode = finite(first(input.httpStatus, input.statusCode, report.httpStatus, report.statusCode, typeof report.status === 'number' ? report.status : null, report.error?.status, report.error?.httpStatus));
  const errors = Array.isArray(report.errors) ? report.errors : report.error ? [report.error] : [];
  const gatewayError = statusCode === 504 || errors.some(error => finite(first(error?.status, error?.httpStatus, error?.statusCode)) === 504)
    || /(?:HTTP[_ : -]*504|GATEWAY[_ : -]*(?:TIMEOUT|ERROR))/i.test(String(report.status || ''));
  // The corrected adapter explicitly names its percent_value mapping weightPercent.
  const adapterPercentContract = Array.isArray(report.data?.holdings) && rows.every(row => Object.hasOwn(row, 'weightPercent'));
  const unit = first(options.weightUnit, input.weightUnit, report.weightUnit, adapterPercentContract ? 'percent' : null);
  const certifiedUnit = unit === 'percent' || unit === 'fraction' ? unit : null;
  const periods = report.data?.reportedPeriodEnds || [];
  const uniqueEnds = [...new Set(periods.filter(value => date(value)))];
  const reportedPeriodEnd = periods.length > 0 && periods.every(value => date(value)) && uniqueEnds.length === 1 ? uniqueEnds[0] : null;
  const datePaths = ['asOf', 'as_of', 'holdingsAsOf', 'metadata.asOf', 'metadata.as_of'];
  const dateEvidence = [report, input].flatMap(object => datePaths.map(path => ({ field: path, raw: at(object, path) })).filter(observation => present(observation.raw)))
    .concat(periods.filter(present).map(raw => ({ field: 'reportedPeriodEnds', raw })));
  const invalidDates = dateEvidence.some(observation => !date(observation.raw));
  const dateConflict = new Set(dateEvidence.filter(observation => date(observation.raw)).map(observation => observation.raw)).size > 1;
  const asOfEvidence = evidence({ ...report, ...input, reportedPeriodEnd }, [...datePaths, 'reportedPeriodEnd'], date);
  const asOf = invalidDates || dateConflict ? null : asOfEvidence.value;
  const ageDays = asOf ? (Date.parse(now) - Date.parse(asOf)) / DAY : null;
  const totalEvidence = evidence({ ...report, ...input, pagination }, ['providerTotal', 'totalHoldings', 'holdingsTotal', 'data.reportedTotal', 'pagination.total'], finite);
  const providerTotal = Number.isInteger(totalEvidence.value) && totalEvidence.value >= 0 ? totalEvidence.value : null;
  const paginationComplete = first(input.paginationComplete, report.paginationComplete, pagination.complete);
  const explicitComplete = first(input.complete, report.complete);
  const fundStructure = first(options.fundStructure, input.fundStructure, report.fundStructure);
  const physical = /^(physical|full_physical|physical_full|sampling|physical_sampling)$/i.test(fundStructure || '');
  const normalizedRows = rows.map((row, index) => {
    const weight = evidence(row, ['weightPercent', 'weight', 'weight_pct', 'weight_percentage', 'percentage', 'holding_weight', 'holdingWeight'], finite);
    const fraction = weight.value === null || !certifiedUnit ? null : weight.value / (certifiedUnit === 'percent' ? 100 : 1);
    const category = first(row.assetType, row.asset_type, row.type, row.assetCategory);
    const assetType = ({ EC: 'EQUITY', EP: 'PREFERRED_EQUITY', DBT: 'BOND', DEBT: 'BOND', DC: 'CASH', DER: 'DERIVATIVE', SWP: 'SWAP', FUT: 'FUTURE', OPT: 'OPTION' })[category] || category;
    return {
      sourceRowIndex: index, raw: row.raw || row, weightOriginal: first(row.weightRaw, weight.raw), weightSourceField: weight.field,
      weightOriginalUnit: certifiedUnit, weightFraction: fraction,
      isin: first(row.isin, row.holdingIsin), ticker: first(row.ticker, row.symbol, row.holdingTicker),
      name: first(row.name, row.holdingName), country: first(row.country, row.country_code), sector: first(row.sector),
      assetType, derivative: DERIVATIVES.test(assetType || ''), cash: CASH.test(assetType || '')
    };
  });
  const weighted = normalizedRows.filter(row => row.weightFraction !== null);
  const missingWeights = normalizedRows.length - weighted.length;
  const sumWeights = weighted.length ? weighted.reduce((sum, row) => sum + row.weightFraction, 0) : null;
  const derivatives = normalizedRows.filter(row => row.derivative);
  const cash = normalizedRows.filter(row => row.cash);
  const negativeNonDerivative = normalizedRows.filter(row => row.weightFraction !== null && row.weightFraction < 0 && !row.derivative && !row.cash).length;
  const unknownTypes = normalizedRows.filter(row => !/^(EQUITY|COMMON|PREFERRED_EQUITY|BOND|CASH|CASH EQUIVALENT|MONEY MARKET|CURRENCY|FUND|ETF|COMMODITY|FUTURE|OPTION|SWAP|FORWARD|DERIVATIVE)$/i.test(row.assetType || '')).length;
  const duplicateRows = normalizedRows.length - new Set(normalizedRows.map(row => stableRow(row.raw))).size;
  const reasons = [];
  if (!certifiedUnit) reasons.push('WEIGHT_UNIT_UNKNOWN');
  if (missingWeights) reasons.push('MISSING_WEIGHTS');
  if (!asOf) reasons.push('AS_OF_UNKNOWN');
  if (invalidDates) reasons.push('INVALID_AS_OF_EVIDENCE');
  if (dateConflict) reasons.push('CONFLICTING_AS_OF_EVIDENCE');
  if (duplicateRows) reasons.push('DUPLICATE_HOLDINGS_ROWS');
  if (ageDays !== null && ageDays < 0) reasons.push('FUTURE_AS_OF');
  if (providerTotal !== null && providerTotal !== rows.length) reasons.push('PROVIDER_TOTAL_MISMATCH');
  if (paginationComplete === false) reasons.push('PAGINATION_INCOMPLETE');
  if (negativeNonDerivative) reasons.push('NEGATIVE_NON_DERIVATIVE_WEIGHTS');
  if (!fundStructure) reasons.push('FUND_STRUCTURE_UNKNOWN');
  if (unknownTypes) reasons.push('ASSET_TYPES_INCOMPLETE');
  if (derivatives.length) reasons.push('DERIVATIVES_REQUIRE_LOOKTHROUGH');
  const massComplete = sumWeights !== null && sumWeights >= 0.98 && sumWeights <= 1.02;
  const structureCertified = input.structureCoverageCertified === true || report.structureCoverageCertified === true;
  const completenessEvidence = physical ? massComplete : structureCertified;
  const countComplete = providerTotal !== null && providerTotal === rows.length;
  const transferComplete = explicitComplete !== false && (explicitComplete === true || paginationComplete === true);
  const valid = !!asOf && ageDays >= 0 && !missingWeights && !!certifiedUnit && !negativeNonDerivative && !duplicateRows;
  let status = 'PARTIAL';
  if (gatewayError) status = 'GATEWAY_ERROR';
  else if (!rows.length) status = 'UNAVAILABLE';
  else if (ageDays !== null && ageDays > (options.maxAgeDays ?? 90)) status = 'STALE';
  else if (valid && completenessEvidence && countComplete && transferComplete && paginationComplete !== false) status = 'FULL';
  else if (valid && completenessEvidence && providerTotal === null && transferComplete && paginationComplete !== false) status = 'LIKELY_FULL';
  if (!completenessEvidence && rows.length) reasons.push('COMPLETENESS_NOT_ESTABLISHED');
  if (!transferComplete) reasons.push('TRANSFER_COMPLETENESS_UNKNOWN');
  const sufficientComplete = (status === 'FULL' || status === 'LIKELY_FULL') && physical && !derivatives.length && !unknownTypes;
  return {
    status, underlyingCoverage: gatewayError ? 'UNKNOWN' : sufficientComplete ? 'SUFFICIENTLY_COMPLETE' : 'UNKNOWN',
    asOf, asOfSourceField: asOfEvidence.field, reportPeriodStarts: report.data?.reportDates || [], reportedPeriodEnds: periods,
    retrievedAt: first(input.retrievedAt, report.retrievedAt), ageDays,
    holdingsCount: rows.length, providerTotal, providerTotalSourceField: totalEvidence.field,
    paginationComplete: paginationComplete ?? null, transferComplete, weightUnit: certifiedUnit,
    sumWeights, missingWeights, duplicateRowCount: duplicateRows, asOfEvidence: dateEvidence,
    cashCount: cash.length, derivativeCount: derivatives.length, unknownAssetTypeCount: unknownTypes,
    cashWeight: cash.some(row => row.weightFraction !== null) ? cash.reduce((sum, row) => sum + (row.weightFraction ?? 0), 0) : null,
    derivativeGrossWeight: derivatives.some(row => row.weightFraction !== null) ? derivatives.reduce((sum, row) => sum + Math.abs(row.weightFraction ?? 0), 0) : null,
    fundStructure, sufficientComplete, xrayReady: sufficientComplete,
    reasons, normalizedRows, rawRows: rows, raw, source: 'marketstack', errors
  };
}

const META_FIELDS = {
  isin: ['isin', 'ISIN'], aum: ['aum', 'assets_under_management', 'total_assets', 'fundSize'],
  aumCurrency: ['aum_currency', 'assets_currency', 'fundSizeCurrency'], ter: ['ter', 'expense_ratio', 'expenseRatio'],
  terUnit: ['ter_unit', 'expense_ratio_unit', 'expenseRatioUnit'], nav: ['nav', 'net_asset_value'],
  navDate: ['nav_date', 'navDate'], benchmark: ['benchmark', 'benchmark_name'], domicile: ['domicile', 'fund_domicile'],
  ucits: ['ucits', 'is_ucits'], accDist: ['distribution_policy', 'distributionPolicy', 'acc_dist'],
  replication: ['replication_method', 'replicationMethod', 'replication'], inception: ['inception_date', 'inceptionDate'],
  currency: ['currency', 'fund_currency'], sector: ['sector'], country: ['country']
};
/** A name cue is kept as a cue; neither exchange country nor name certifies UCITS/domicile. */
export function analyzeUcitsMetadata(metadata = {}, options = {}) {
  const source = options.source || 'marketstack';
  const fields = {}, provenance = {}, statuses = {};
  for (const [field, paths] of Object.entries(META_FIELDS)) {
    const numeric = ['aum', 'ter', 'nav'].includes(field);
    const transform = numeric ? finite : ['navDate', 'inception'].includes(field) ? date : field === 'ucits' ? value => typeof value === 'boolean' ? value : null : value => value;
    const observation = evidence(metadata, paths, transform);
    let value = observation.value;
    if (numeric && value !== null && (value < 0 || (field === 'nav' && value === 0))) value = null;
    fields[field] = value;
    provenance[field] = observation.field ? { source, field: observation.field, rawValue: observation.raw, asOf: first(metadata.asOf, metadata.as_of), retrievedAt: options.retrievedAt || null } : null;
    statuses[field] = value !== null ? 'OBSERVED' : observation.field ? 'INVALID' : 'MISSING';
  }
  const terFraction = fields.ter === null ? null : fields.terUnit === 'percent' ? fields.ter / 100 : fields.terUnit === 'fraction' ? fields.ter : null;
  fields.terFraction = terFraction;
  statuses.terFraction = terFraction !== null && terFraction <= 0.05 ? 'OBSERVED' : 'MISSING_UNIT_OR_INVALID';
  if (terFraction !== null && terFraction > 0.05) fields.terFraction = null;
  return { fields, statuses, provenance, raw: metadata,
    ucitsNameCue: /\bUCITS\b/i.test(String(metadata.name || '')) ? 'OBSERVED_NAME_CUE' : null,
    ucitsCertified: fields.ucits === true, coverage: Object.values(statuses).filter(status => status === 'OBSERVED').length / Object.keys(statuses).length };
}

/** ISIN identifies a share class, not a whole fund. No name-based fund deduplication. */
export function buildEtfIdentity(listings = []) {
  const funds = new Map(), classes = new Map();
  const rows = listings.map((listing, index) => {
    const isin = validIsin(listing.isin) ? listing.isin.toUpperCase().trim() : null;
    const fundId = first(listing.canonicalFundId, listing.fundId);
    const shareClassId = first(listing.canonicalShareClassId, listing.shareClassId, isin);
    const symbol = first(listing.providerSymbol, listing.symbol, listing.ticker);
    const exchangeMic = first(listing.exchangeMic, listing.exchange_mic, listing.mic);
    const listingId = first(listing.canonicalListingId, listing.listingId);
    const evidenceKey = symbol && exchangeMic ? `${exchangeMic}:${symbol}` : null;
    const identityStatus = shareClassId && (listingId || evidenceKey) ? 'MAPPED_SHARE_CLASS' : 'REVIEW';
    if (fundId) {
      if (!funds.has(fundId)) funds.set(fundId, { fundId, shareClassIds: new Set(), listingIndexes: [] });
      if (shareClassId) funds.get(fundId).shareClassIds.add(shareClassId);
      funds.get(fundId).listingIndexes.push(index);
    }
    if (shareClassId) {
      if (!classes.has(shareClassId)) classes.set(shareClassId, { shareClassId, fundIds: new Set(), isin, listingIndexes: [] });
      if (fundId) classes.get(shareClassId).fundIds.add(fundId);
      classes.get(shareClassId).listingIndexes.push(index);
    }
    return { fundId, shareClassId, listingId, evidenceKey, identityStatus, isin, symbol, exchangeMic, raw: listing };
  });
  const conflicts = [...classes.values()].filter(group => group.fundIds.size > 1).map(group => ({ shareClassId: group.shareClassId, reason: 'CONFLICTING_FUND_IDENTITY', fundIds: [...group.fundIds] }));
  return { listings: rows, funds: [...funds.values()].map(group => ({ ...group, shareClassIds: [...group.shareClassIds] })),
    shareClasses: [...classes.values()].map(group => ({ ...group, fundIds: [...group.fundIds] })), conflicts,
    unresolvedFundListings: rows.filter(row => !row.fundId).length,
    counts: { funds: funds.size, shareClasses: classes.size, listings: rows.length, uniqueListingEvidence: new Set(rows.map(row => row.listingId || row.evidenceKey).filter(Boolean)).size } };
}

/** A safe secondary-source proposal; primary Vorsorge sources remain authoritative. */
export function ucitsProductReadiness({ identity = {}, holdings = {}, metadata = {}, price = {}, rights = {} } = {}) {
  const fields = metadata.fields || {};
  const identityReady = !!identity.isin && identity.identityStatus === 'MAPPED_SHARE_CLASS';
  const priceReady = price.valid === true && ['CURRENT', 'LAST_VALID_SESSION'].includes(price.freshness);
  const fusionReady = identityReady && !identity.conflicts?.length;
  const holdingsReady = fusionReady && holdings.sufficientComplete === true;
  const xrayReady = holdingsReady && holdings.xrayReady === true;
  const metadataReady = fusionReady && fields.ucits === true && fields.terFraction !== null && fields.terFraction !== undefined && !!fields.domicile;
  const tier = !identityReady || !priceReady ? 0 : xrayReady ? 4 : holdingsReady ? 3 : metadataReady ? 2 : 1;
  return { identityReady, priceReady, fusionReady, holdingsReady, xrayReady, metadataReady, tier,
    vorsorgeReady: fusionReady && priceReady && metadataReady,
    publicationReady: tier > 0 && rights.displayConfirmed === true && rights.commercialConfirmed === true,
    fusionPolicy: { mode: 'SECONDARY_SOURCE_ONLY', mergeKey: identity.isin || null, overwritePrimary: false, keepFieldProvenance: true, normalizePartialHoldingsTo100: false },
    blockedReasons: [!identityReady && 'SHARE_CLASS_IDENTITY_UNRESOLVED', !priceReady && 'PRICE_NOT_READY', !holdingsReady && 'HOLDINGS_COMPLETENESS_NOT_ESTABLISHED', !metadataReady && 'REGULATORY_OR_COST_METADATA_INCOMPLETE', rights.displayConfirmed !== true && 'DISPLAY_RIGHTS_UNCONFIRMED', rights.commercialConfirmed !== true && 'COMMERCIAL_RIGHTS_UNCONFIRMED'].filter(Boolean) };
}
