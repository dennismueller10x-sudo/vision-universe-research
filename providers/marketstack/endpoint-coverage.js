/* Documented Marketstack v2 endpoint coverage. Reads only the committed
 * contract; no provider IO. A documented exclusion tells a reviewer that an
 * empty response is uninformative; it is never absence or completeness proof. */
'use strict';
const contract = require('./endpoint-coverage.json');
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
deepFreeze(contract);
const european = new Set(contract.europeanMics);
const byEndpoint = new Map(contract.endpoints.map(entry => [entry.endpoint, entry]));
const STATES = Object.freeze(['DOCUMENTED_NOT_COVERED', 'UNDOCUMENTED']);

/** endpoint is the documented template ('/splits', '/tickers/{symbol}/splits'). */
function documentedCoverage(endpoint, mic) {
  const entry = byEndpoint.get(endpoint);
  const base = { endpoint, mic: mic ?? null, sourceSha256: contract.source.sha256, absenceProven: false, coverageCertified: false };
  if (!entry) return { ...base, state: 'UNDOCUMENTED', reason: 'ENDPOINT_NOT_IN_CONTRACT', quote: null };
  if (typeof mic !== 'string' || !european.has(mic)) return { ...base, state: 'UNDOCUMENTED', reason: 'MIC_OUTSIDE_EUROPEAN_SCOPE', quote: entry.quote };
  return { ...base, state: entry.europeanCoverage, reason: entry.europeanCoverage === 'DOCUMENTED_NOT_COVERED' ? 'VENUE_NOT_NAMED_IN_PROVIDER_DOCUMENTATION' : 'PROVIDER_DOCUMENTATION_SILENT', quote: entry.quote };
}

/** The Europe collector requests actions only as '/' + kind (splits|dividends). */
function actionEndpointCoverage(kind, mic) {
  if (!['splits', 'dividends'].includes(kind)) return documentedCoverage(null, mic);
  return documentedCoverage('/' + kind, mic);
}

module.exports = { contract, documentedCoverage, actionEndpointCoverage, STATES };
