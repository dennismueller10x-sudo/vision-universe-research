/* =========================================================================
   VISION UNIVERSE QUANT — BACKTEST RESULT CONTRACT (backtest-result-2.0.0)

   Art-unabhaengiger Ergebnisumschlag. Beschreibung und Regeln:
   docs/quant/backtest-result-v2.schema.json, docs/quant/BACKTEST_RESULT_CONTRACT_V2.md.

   validate(envelope, { certification }) ist fail-closed:
     - feste Abschnitte, keine unbekannten Felder
     - productionApproved immer false
     - PRODUCT_CERTIFIED / certificationStatus CERTIFIED nur mit einem
       mitgelieferten backtest-certification-v1-Artefakt, das fuer diese Art
       (bzw. Regel) CERTIFIED meldet und certificationViolations() besteht
     - keine Alpha-/Vorteilsbehauptung ohne Holm-korrigiertes p < alpha
   Kein Produktpfad liest diesen Vertrag (nicht verdrahtet).
   ========================================================================= */
(function (global) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var Kinds = isNode ? require('./backtest-kinds.cjs') : global.VUBacktestKinds;
  var Cert = isNode ? require('./backtest-certification.js') : global.VUBacktestCertification;
  var nodeCrypto = null;
  if (isNode) { try { nodeCrypto = require('node:crypto'); } catch (e) { nodeCrypto = null; } }

  var VERSION = 'backtest-result-2.0.0';
  var CONTRACT_PATH = 'docs/quant/backtest-result-v2.schema.json';
  var SECTIONS = ['schemaVersion', 'identity', 'period', 'spec', 'events', 'portfolio', 'metrics', 'uncertainty', 'dataQuality', 'methods', 'limitations', 'status', 'envelopeHash'];
  var ENUMS = {
    scope: ['SINGLE_LISTING', 'POPULATION'],
    grain: ['DAILY', 'WEEKLY', 'MONTHLY', 'UNSPECIFIED'],
    eventsForm: ['EVENTS', 'TRADES', 'FINDING', 'NONE'],
    metricsBasis: ['PORTFOLIO', 'PER_EVENT', 'NONE'],
    methodState: ['EXECUTED', 'NOT_RUN', 'NOT_APPLICABLE'],
    state: ['RESEARCH_EXECUTED', 'PREPARED_DATA_LIMITED', 'PRODUCT_CERTIFIED'],
    certificationStatus: ['CERTIFIED', 'LIMITED', 'COLLECTING_HISTORY', 'WITHHELD', 'NOT_CERTIFIED', 'NOT_ASSESSED'],
    certificationScope: ['KIND', 'RULE'],
    evidenceKind: ['OBSERVED', 'TESTED', 'SIMULATED_LEDGER', 'SYNTHETIC_TEST'],
    familyCorrection: ['HOLM', 'BENJAMINI_HOCHBERG', 'NONE']
  };
  var METRIC_KEYS = ['basis', 'totalReturn', 'cagr', 'annualReturns', 'volatility', 'maxDrawdown', 'hitRate', 'trades', 'turnover', 'costs', 'cashShare', 'benchmark', 'excess', 'perEvent'];
  var FIELDS = {
    identity: ['kind', 'scope', 'listingId', 'listingHash', 'populationId', 'populationHash', 'source'],
    source: ['adapter', 'schemaVersion', 'engineVersion', 'artifact', 'resultHash'],
    period: ['from', 'to', 'asOf', 'grain'],
    spec: ['id', 'version', 'description', 'parameters', 'specHash'],
    events: ['form', 'occurrences', 'completed', 'immature', 'censored', 'ineligible', 'titles', 'entry', 'exit'],
    portfolio: ['dates', 'equity', 'cashShare', 'initialCapital', 'endCapital'],
    uncertainty: ['method', 'interval', 'level', 'p', 'family'],
    family: ['size', 'correction', 'adjustedP', 'alpha'],
    dataQuality: ['coverage', 'censored', 'terminal', 'corporateActions', 'totalReturnBasis', 'survivorship', 'warnings'],
    method: ['method', 'state', 'result'],
    status: ['state', 'certificationStatus', 'certificationScope', 'certificationRuleId', 'certificationSource', 'productionApproved', 'evidenceKind']
  };
  var PER_EVENT_NULL = ['totalReturn', 'cagr', 'annualReturns', 'turnover', 'cashShare'];
  var ALPHA_CLAIM_PATTERNS = [
    /\balpha\b/i,
    /\bedge\s+(proven|confirmed|established|bewiesen|belegt|nachgewiesen)\b/i,
    /\b(proven|guaranteed|confirmed)\s+(edge|alpha|outperformance)\b/i,
    /\boutperformance\s+(proven|confirmed|guaranteed)\b/i,
    /\bbeats?\s+the\s+market\b/i,
    /(ueberrendite|überrendite|vorteil)\s+(bewiesen|belegt|nachgewiesen|gesichert)/i
  ];
  var HEX64 = /^[a-f0-9]{64}$/;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  /* Kanonisches JSON wie research-contract.cjs#canonical (sortierte Schluessel, nur endliche Zahlen). */
  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') { if (!isFinite(value)) throw new Error('NON_FINITE_NUMBER'); return JSON.stringify(value); }
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}';
    throw new Error('NON_JSON_VALUE');
  }
  function hash(value) {
    if (!nodeCrypto) throw new Error('HASH_UNAVAILABLE');
    return nodeCrypto.createHash('sha256').update(canonical(value)).digest('hex');
  }
  function without(obj, key) { var o = {}; Object.keys(obj).forEach(function (k) { if (k !== key) o[k] = obj[k]; }); return o; }
  function specHashOf(spec) { return hash(without(spec, 'specHash')); }
  /* Setzt specHash und envelopeHash. Veraendert die Eingabe nicht. */
  function seal(envelope) {
    var e = JSON.parse(JSON.stringify(envelope));
    e.spec.specHash = specHashOf(e.spec);
    delete e.envelopeHash;
    e.envelopeHash = hash(e);
    return e;
  }

  function plainObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function finiteOrNull(x) { return x === null || (typeof x === 'number' && isFinite(x)); }
  function validDate(x) { return typeof x === 'string' && DATE.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x; }

  function strings(value, out) {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(function (v) { strings(v, out); });
    else if (plainObject(value)) Object.keys(value).forEach(function (k) { strings(value[k], out); });
    return out;
  }
  function alphaClaims(envelope) {
    return strings(envelope, []).filter(function (s) { return ALPHA_CLAIM_PATTERNS.some(function (re) { return re.test(s); }); });
  }
  function holmSupportsClaim(u) {
    var f = u && u.family;
    return !!f && f.correction === 'HOLM' && typeof f.alpha === 'number' && f.alpha > 0 && f.alpha <= 0.1 && typeof f.adjustedP === 'number' && isFinite(f.adjustedP) && f.adjustedP < f.alpha;
  }

  function certificationEntry(doc, kind, scope, ruleId) {
    if (!doc || !Array.isArray(doc.kinds)) return null;
    var k = doc.kinds.filter(function (x) { return x && x.id === kind; })[0] || null;
    if (!k || scope !== 'RULE') return k;
    return (k.rules || []).filter(function (r) { return r && r.id === ruleId; })[0] || null;
  }

  function validate(envelope, options) {
    options = options || {};
    var errors = [];
    var fail = function (x) { errors.push(x); };
    var keysExactly = function (obj, list, name) {
      if (!plainObject(obj)) { fail(name + ':NOT_AN_OBJECT'); return false; }
      Object.keys(obj).forEach(function (k) { if (list.indexOf(k) < 0) fail(name + ':UNKNOWN_FIELD:' + k); });
      list.forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(obj, k)) fail(name + ':MISSING_FIELD:' + k); });
      return true;
    };
    var e = envelope;
    if (!keysExactly(e, SECTIONS, 'envelope')) return { valid: false, errors: errors };
    if (e.schemaVersion !== VERSION) fail('UNKNOWN_SCHEMA_VERSION');

    /* identity */
    var id = e.identity, kind = null;
    if (keysExactly(id, FIELDS.identity, 'identity')) {
      if (!Kinds.isKind(id.kind)) fail('UNKNOWN_KIND'); else kind = id.kind;
      if (ENUMS.scope.indexOf(id.scope) < 0) fail('UNKNOWN_SCOPE');
      if (id.scope === 'SINGLE_LISTING' && (typeof id.listingId !== 'string' || !id.listingId)) fail('SINGLE_LISTING_REQUIRES_LISTING_ID');
      if (id.scope === 'POPULATION' && (typeof id.populationId !== 'string' || !id.populationId)) fail('POPULATION_REQUIRES_POPULATION_ID');
      if (id.listingHash !== null && !HEX64.test(id.listingHash)) fail('INVALID_LISTING_HASH');
      if (id.populationHash !== null && !HEX64.test(id.populationHash)) fail('INVALID_POPULATION_HASH');
      if (id.scope === 'POPULATION' && !HEX64.test(id.populationHash || '')) fail('POPULATION_HASH_REQUIRED');
      if (keysExactly(id.source, FIELDS.source, 'identity.source')) {
        if (typeof id.source.adapter !== 'string' || !id.source.adapter) fail('SOURCE_ADAPTER_REQUIRED');
        if (typeof id.source.schemaVersion !== 'string' || !id.source.schemaVersion) fail('SOURCE_SCHEMA_VERSION_REQUIRED');
      }
    }
    /* period */
    if (keysExactly(e.period, FIELDS.period, 'period')) {
      ['from', 'to'].forEach(function (k) { if (e.period[k] !== null && !validDate(e.period[k])) fail('INVALID_PERIOD_' + k.toUpperCase()); });
      if (!validDate(e.period.asOf)) fail('INVALID_AS_OF');
      if (validDate(e.period.from) && validDate(e.period.to) && e.period.from > e.period.to) fail('PERIOD_FROM_AFTER_TO');
      if (validDate(e.period.to) && validDate(e.period.asOf) && e.period.to > e.period.asOf) fail('PERIOD_AFTER_AS_OF');
      if (ENUMS.grain.indexOf(e.period.grain) < 0) fail('UNKNOWN_GRAIN');
    }
    /* spec */
    if (keysExactly(e.spec, FIELDS.spec, 'spec')) {
      if (typeof e.spec.id !== 'string' || !e.spec.id) fail('SPEC_ID_REQUIRED');
      if (!plainObject(e.spec.parameters)) fail('SPEC_PARAMETERS_REQUIRED');
      if (!HEX64.test(e.spec.specHash || '')) fail('INVALID_SPEC_HASH');
      else if (nodeCrypto) { try { if (specHashOf(e.spec) !== e.spec.specHash) fail('SPEC_HASH_MISMATCH'); } catch (x) { fail('SPEC_NOT_CANONICAL_JSON'); } }
    }
    /* events */
    if (keysExactly(e.events, FIELDS.events, 'events')) {
      if (ENUMS.eventsForm.indexOf(e.events.form) < 0) fail('UNKNOWN_EVENTS_FORM');
      ['occurrences', 'completed', 'immature', 'censored', 'ineligible', 'titles'].forEach(function (k) {
        var v = e.events[k]; if (v !== null && !(typeof v === 'number' && v >= 0 && Math.floor(v) === v)) fail('INVALID_EVENTS_' + k.toUpperCase());
      });
    }
    /* metrics + portfolio */
    var m = e.metrics, basis = null;
    if (keysExactly(m, METRIC_KEYS, 'metrics')) {
      basis = m.basis;
      if (ENUMS.metricsBasis.indexOf(basis) < 0) fail('UNKNOWN_METRICS_BASIS');
      ['totalReturn', 'cagr', 'volatility', 'maxDrawdown', 'hitRate', 'trades', 'turnover', 'cashShare'].forEach(function (k) { if (!finiteOrNull(m[k])) fail('INVALID_METRIC_' + k); });
      if (typeof m.maxDrawdown === 'number' && m.maxDrawdown > 0) fail('MAX_DRAWDOWN_POSITIVE');
      if (typeof m.hitRate === 'number' && (m.hitRate < 0 || m.hitRate > 1)) fail('HIT_RATE_OUT_OF_RANGE');
      if (typeof m.cashShare === 'number' && (m.cashShare < 0 || m.cashShare > 1)) fail('CASH_SHARE_OUT_OF_RANGE');
      if (typeof m.volatility === 'number' && m.volatility < 0) fail('NEGATIVE_VOLATILITY');
      if (typeof m.trades === 'number' && (m.trades < 0 || Math.floor(m.trades) !== m.trades)) fail('INVALID_TRADE_COUNT');
      if (m.annualReturns !== null && (!Array.isArray(m.annualReturns) || m.annualReturns.some(function (r) { return !plainObject(r) || !/^\d{4}$/.test(r.year) || !finiteOrNull(r.value); }))) fail('INVALID_ANNUAL_RETURNS');
      ['costs', 'benchmark', 'excess', 'perEvent'].forEach(function (k) { if (m[k] !== null && !plainObject(m[k])) fail('INVALID_METRIC_' + k); });
      if (basis === 'PER_EVENT') PER_EVENT_NULL.forEach(function (k) { if (m[k] !== null) fail('PER_EVENT_FORBIDS_' + k); });
      if (basis === 'NONE') ['totalReturn', 'cagr', 'annualReturns', 'volatility', 'maxDrawdown', 'hitRate', 'turnover', 'cashShare', 'perEvent'].forEach(function (k) { if (m[k] !== null) fail('NO_BASIS_FORBIDS_' + k); });
      if (basis !== 'PER_EVENT' && m.perEvent !== null && basis !== null) fail('PER_EVENT_BLOCK_ONLY_WITH_PER_EVENT_BASIS');
    }
    if (basis === 'PORTFOLIO') {
      var p = e.portfolio;
      if (keysExactly(p, FIELDS.portfolio, 'portfolio')) {
        var n = Array.isArray(p.dates) ? p.dates.length : -1;
        if (n < 2 || !Array.isArray(p.equity) || !Array.isArray(p.cashShare) || p.equity.length !== n || p.cashShare.length !== n) fail('PORTFOLIO_PATH_SHAPE');
        else {
          for (var i = 0; i < n; i++) {
            if (!validDate(p.dates[i]) || (i && p.dates[i] <= p.dates[i - 1])) { fail('PORTFOLIO_DATES_NOT_ASCENDING'); break; }
            if (!(typeof p.equity[i] === 'number' && isFinite(p.equity[i]) && p.equity[i] >= 0)) { fail('PORTFOLIO_EQUITY_INVALID'); break; }
            if (p.cashShare[i] !== null && !(typeof p.cashShare[i] === 'number' && p.cashShare[i] >= 0 && p.cashShare[i] <= 1)) { fail('PORTFOLIO_CASH_SHARE_INVALID'); break; }
          }
          if (e.period && validDate(e.period.from) && p.dates[0] !== e.period.from) fail('PORTFOLIO_PERIOD_MISMATCH');
          if (e.period && validDate(e.period.to) && p.dates[n - 1] !== e.period.to) fail('PORTFOLIO_PERIOD_MISMATCH');
        }
        if (!(typeof p.initialCapital === 'number' && p.initialCapital > 0)) fail('PORTFOLIO_INITIAL_CAPITAL');
        if (!(typeof p.endCapital === 'number' && isFinite(p.endCapital) && p.endCapital >= 0)) fail('PORTFOLIO_END_CAPITAL');
      }
    } else if (e.portfolio !== null) fail('PORTFOLIO_ONLY_WITH_PORTFOLIO_BASIS');
    /* uncertainty */
    var u = e.uncertainty;
    if (u !== null && keysExactly(u, FIELDS.uncertainty, 'uncertainty')) {
      if (typeof u.method !== 'string' || !u.method) fail('UNCERTAINTY_METHOD_REQUIRED');
      if (u.interval !== null && !(Array.isArray(u.interval) && u.interval.length === 2 && u.interval.every(function (x) { return typeof x === 'number' && isFinite(x); }) && u.interval[0] <= u.interval[1])) fail('INVALID_INTERVAL');
      if (!finiteOrNull(u.level) || (typeof u.level === 'number' && (u.level <= 0 || u.level >= 1))) fail('INVALID_INTERVAL_LEVEL');
      if (!finiteOrNull(u.p) || (typeof u.p === 'number' && (u.p < 0 || u.p > 1))) fail('INVALID_P');
      if (u.family !== null && keysExactly(u.family, FIELDS.family, 'uncertainty.family')) {
        if (ENUMS.familyCorrection.indexOf(u.family.correction) < 0) fail('UNKNOWN_FAMILY_CORRECTION');
        if (u.family.size !== null && !(typeof u.family.size === 'number' && u.family.size >= 1 && Math.floor(u.family.size) === u.family.size)) fail('INVALID_FAMILY_SIZE');
        if (!finiteOrNull(u.family.adjustedP) || (typeof u.family.adjustedP === 'number' && (u.family.adjustedP < 0 || u.family.adjustedP > 1))) fail('INVALID_ADJUSTED_P');
        if (!finiteOrNull(u.family.alpha)) fail('INVALID_FAMILY_ALPHA');
      }
    }
    /* dataQuality */
    if (keysExactly(e.dataQuality, FIELDS.dataQuality, 'dataQuality')) {
      if (typeof e.dataQuality.totalReturnBasis !== 'string' || !e.dataQuality.totalReturnBasis) fail('RETURN_BASIS_REQUIRED');
      if (!Array.isArray(e.dataQuality.warnings) || e.dataQuality.warnings.some(function (w) { return typeof w !== 'string' || !w; })) fail('INVALID_DATA_QUALITY_WARNINGS');
      if (!finiteOrNull(e.dataQuality.censored)) fail('INVALID_CENSORED_COUNT');
    }
    /* methods: genau die sieben, je einmal */
    if (!Array.isArray(e.methods)) fail('METHODS_REQUIRED');
    else {
      var seen = {};
      e.methods.forEach(function (x) {
        if (!keysExactly(x, FIELDS.method, 'methods[]')) return;
        if (!Kinds.isMethod(x.method)) fail('UNKNOWN_METHOD:' + x.method);
        if (seen[x.method]) fail('DUPLICATE_METHOD:' + x.method); seen[x.method] = true;
        if (ENUMS.methodState.indexOf(x.state) < 0) fail('UNKNOWN_METHOD_STATE:' + x.method);
        if (x.state === 'EXECUTED' && !plainObject(x.result)) fail('EXECUTED_METHOD_WITHOUT_RESULT:' + x.method);
        if (x.state !== 'EXECUTED' && x.result !== null && !plainObject(x.result)) fail('INVALID_METHOD_RESULT:' + x.method);
      });
      Kinds.METHODS.forEach(function (x) { if (!seen[x]) fail('METHOD_MISSING:' + x); });
    }
    /* limitations */
    if (!Array.isArray(e.limitations) || !e.limitations.length || e.limitations.some(function (x) { return typeof x !== 'string' || !x; })) fail('LIMITATIONS_REQUIRED');
    /* status */
    var s = e.status;
    if (keysExactly(s, FIELDS.status, 'status')) {
      if (s.productionApproved !== false) fail('PRODUCTION_APPROVAL_FORBIDDEN');
      if (ENUMS.state.indexOf(s.state) < 0) fail('UNKNOWN_STATE');
      if (ENUMS.certificationStatus.indexOf(s.certificationStatus) < 0) fail('UNKNOWN_CERTIFICATION_STATUS');
      if (ENUMS.certificationScope.indexOf(s.certificationScope) < 0) fail('UNKNOWN_CERTIFICATION_SCOPE');
      if (s.certificationScope === 'RULE' && (typeof s.certificationRuleId !== 'string' || !s.certificationRuleId)) fail('RULE_SCOPE_REQUIRES_RULE_ID');
      if (s.certificationScope === 'KIND' && s.certificationRuleId !== null) fail('KIND_SCOPE_FORBIDS_RULE_ID');
      if (ENUMS.evidenceKind.indexOf(s.evidenceKind) < 0) fail('UNKNOWN_EVIDENCE_KIND');
      if (s.evidenceKind === 'SYNTHETIC_TEST' && s.state !== 'PREPARED_DATA_LIMITED') fail('SYNTHETIC_EVIDENCE_IS_PREPARED_ONLY');
      var doc = options.certification || null, entry = kind ? certificationEntry(doc, kind, s.certificationScope, s.certificationRuleId) : null;
      var docErrors = doc ? (Cert ? Cert.certificationViolations(doc) : ['CERTIFICATION_ENGINE_UNAVAILABLE']) : null;
      var proven = !!entry && entry.status === 'CERTIFIED' && docErrors && !docErrors.length;
      if (s.state === 'PRODUCT_CERTIFIED' && (!proven || s.certificationStatus !== 'CERTIFIED')) fail('PRODUCT_CERTIFIED_WITHOUT_CERTIFICATION_ARTIFACT');
      if (s.certificationStatus === 'CERTIFIED' && !proven) fail('CERTIFIED_STATUS_WITHOUT_CERTIFICATION_ARTIFACT');
      if (doc && entry && s.certificationStatus !== 'NOT_ASSESSED' && s.certificationStatus !== entry.status) fail('CERTIFICATION_STATUS_CONTRADICTS_ARTIFACT');
      if (doc && docErrors && docErrors.length && s.certificationStatus !== 'NOT_ASSESSED') fail('CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT');
    }
    /* Alpha-Regel */
    if (alphaClaims(e).length && !holmSupportsClaim(u)) fail('ALPHA_CLAIM_WITHOUT_HOLM_ADJUSTED_EVIDENCE');
    /* Umschlag-Hash */
    if (!HEX64.test(e.envelopeHash || '')) fail('INVALID_ENVELOPE_HASH');
    else if (nodeCrypto) { try { if (hash(without(e, 'envelopeHash')) !== e.envelopeHash) fail('ENVELOPE_HASH_MISMATCH'); } catch (x) { fail('ENVELOPE_NOT_CANONICAL_JSON'); } }
    else if (!options.skipHashVerification) fail('HASH_VERIFICATION_UNAVAILABLE');
    return { valid: errors.length === 0, errors: errors };
  }

  var api = { VERSION: VERSION, CONTRACT_PATH: CONTRACT_PATH, SECTIONS: SECTIONS, ENUMS: ENUMS, METRIC_KEYS: METRIC_KEYS, FIELDS: FIELDS, ALPHA_CLAIM_PATTERNS: ALPHA_CLAIM_PATTERNS,
    canonical: canonical, hash: hash, specHashOf: specHashOf, seal: seal, validate: validate, alphaClaims: alphaClaims, holmSupportsClaim: holmSupportsClaim, certificationEntry: certificationEntry };
  if (isNode) module.exports = api; else global.VUBacktestResultContract = api;
})(typeof window !== 'undefined' ? window : globalThis);
