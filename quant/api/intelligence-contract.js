/* Provider-neutral current-market product view. Reads existing feature values,
 * never recomputes them. Callers supply the existing display-policy decision.
 * This is a boundary contract, not a browser authorization mechanism. */
(function (global) {
  'use strict';
  var Registry = typeof module !== 'undefined' && module.exports
    ? require('../engines/market-metric-registry.js') : global.VUMarketMetricRegistry;
  var STATES = Object.freeze(['AVAILABLE','STALE','DELAYED','INSUFFICIENT_HISTORY',
    'NOT_APPLICABLE','SOURCE_MISSING','PROVIDER_ERROR','PIPELINE_ERROR','UNAVAILABLE']);
  function dateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var ms = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === value ? value : null;
  }
  function read(object, path) {
    return path.reduce(function (value, key) {
      return value && Object.prototype.hasOwnProperty.call(value,key) ? value[key] : undefined;
    }, object);
  }
  function buildMarketView(input) {
    input = input || {};
    var snapshot = input.snapshot, source = input.provenance || {};
    var result = {
      contractVersion: '1.0.0', securityId: input.securityId || null,
      asOf: null, availability: { state: 'UNAVAILABLE', reason: 'NO_SNAPSHOT' },
      metrics: {}, provenance: null,
      methodology: { registryVersion: Registry.version, engineVersion: null },
      temporal: { mode: 'CURRENT_ANALYSIS', pitEligibility: 'NOT_CERTIFIED' }
    };
    function reject(state, reason) { result.availability = { state: state, reason: reason }; return result; }
    if (typeof input.securityId !== 'string' || !input.securityId.trim()) return reject('PIPELINE_ERROR','IDENTITY_MISSING');
    if (!input.permission || input.permission.allowed !== true || !input.permission.basis)
      return reject('UNAVAILABLE','DISPLAY_NOT_PERMITTED');
    if (source.isMock !== false || typeof source.snapshotId !== 'string' || !source.snapshotId ||
        typeof source.sourceId !== 'string' || !source.sourceId)
      return reject('SOURCE_MISSING','VERIFIED_PROVENANCE_REQUIRED');
    if (source.securityId !== input.securityId ||
        (snapshot && snapshot.securityId && snapshot.securityId !== input.securityId))
      return reject('PIPELINE_ERROR','IDENTITY_MISMATCH');
    if (!snapshot) return reject('SOURCE_MISSING','NO_SNAPSHOT');
    if (snapshot.version !== Registry.engineVersion) return reject('PIPELINE_ERROR','ENGINE_VERSION_MISMATCH');
    if (snapshot.status !== 'OK') return reject('UNAVAILABLE', 'SOURCE_UNAVAILABLE');
    if (!dateOnly(snapshot.asOf) || !dateOnly(input.decisionDate)) return reject('PIPELINE_ERROR','INVALID_DATE');
    if (snapshot.asOf > input.decisionDate) return reject('PIPELINE_ERROR','FUTURE_DATA');
    // Freshness is supplied by the session-aware health layer, never guessed
    // from weekends/calendar days here. Missing health is not "available".
    var health = input.healthState;
    if (STATES.indexOf(health) === -1) return reject('SOURCE_MISSING','HEALTH_STATE_REQUIRED');
    if (['AVAILABLE','STALE','DELAYED'].indexOf(health) === -1) return reject(health,'HEALTH_GATE');
    result.asOf = snapshot.asOf;
    result.provenance = { sourceId: source.sourceId, snapshotId: source.snapshotId, isMock: false,
      basis: snapshot.basis || null, adjustmentStatus: snapshot.adjustmentStatus || null };
    result.methodology.engineVersion = snapshot.version;
    var available = 0, invalid = false;
    Registry.entries.forEach(function (metric) {
      var value = read(snapshot.values, metric.field);
      var status = read(snapshot.fieldStatus, metric.field);
      var state, reason = null;
      if (status === 'CALCULATED') {
        var valid = metric.unit === 'boolean' ? typeof value === 'boolean'
          : typeof value === 'number' && Number.isFinite(value);
        state = valid ? health : 'PIPELINE_ERROR';
        if (!valid) { reason = 'INVALID_VALUE'; invalid = true; }
        else available++;
      } else if (['INSUFFICIENT_HISTORY','SOURCE_MISSING','NOT_APPLICABLE'].indexOf(status) !== -1) {
        state = status;
      } else if (status === 'WITHHELD_REDISTRIBUTION') {
        state = 'UNAVAILABLE'; reason = 'DISPLAY_WITHHELD';
      } else { state = 'PIPELINE_ERROR'; reason = 'FIELD_STATUS_MISSING'; invalid = true; }
      result.metrics[metric.metricId] = { value: ['AVAILABLE','STALE','DELAYED'].indexOf(state) !== -1 ? value : null,
        state: state, reason: reason, unit: metric.unit, metricVersion: metric.version };
    });
    result.availability = { state: invalid ? 'PIPELINE_ERROR' : available ? health : 'UNAVAILABLE',
      reason: invalid ? 'INVALID_METRIC_FIELDS' : available ? null : 'NO_AVAILABLE_METRICS' };
    return result;
  }
  var api = Object.freeze({ version: '1.0.0', states: STATES, buildMarketView: buildMarketView });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VUIntelligenceContract = api;
})(typeof window !== 'undefined' ? window : globalThis);
