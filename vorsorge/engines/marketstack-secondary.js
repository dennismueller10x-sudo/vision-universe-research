/* Optional Vorsorge second-source facade. No fetches, globals registration changes,
 * primary overwrites, schedules or implicit public rights. UMD: Node + browser. */
(function (global) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var F = node ? require('./etf-fundamentals.js') : global.VUVorsorge && global.VUVorsorge.Fundamentals;
  var H = node ? require('./etf-holdings.js') : global.VUVorsorge && global.VUVorsorge.Holdings;
  var P = node ? require('./etf-provider.js') : global.VUVorsorge && global.VUVorsorge.Provider;
  var X = node ? require('./xray.js') : global.VUVorsorge && global.VUVorsorge.XRay;
  var Crypto = node ? require('node:crypto') : null;
  var VERSION = 'vorsorge-marketstack-secondary-1.0.0';
  function present(value) { return value !== null && value !== undefined && value !== ''; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function iso(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
  function safeUrl(value) { return typeof value === 'string' && /^https:\/\//.test(value) && !/[?&](?:access_key|api_key|token)=/i.test(value); }
  function provenance(value, today) { return !!(value && value.source && iso(value.asOf) && value.asOf <= today && safeUrl(value.sourceUrl || value.url) && /^[a-f0-9]{64}$/.test(value.sha256 || '')); }
  function stable(value) { return JSON.stringify(value, function (_, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort().reduce(function (out, key) { out[key] = item[key]; return out; }, {}) : item; }); }
  function exactIdentity(identity, expected, today) {
    return !!(identity && expected && identity.verified === true && expected.verified === true && F.isValidIsin(identity.isin) &&
      identity.isin === expected.isin && identity.providerSymbol === expected.providerSymbol && identity.exchangeMic === expected.exchangeMic &&
      /^[A-Z0-9]{4}$/.test(identity.exchangeMic || '') && present(identity.providerSymbol) &&
      identity.canonicalETFId === expected.canonicalETFId && present(identity.canonicalETFId) &&
      identity.shareClassId === expected.shareClassId && present(identity.shareClassId) &&
      /^[A-Z]{3}$/.test(identity.currency || '') && identity.currency === expected.currency &&
      provenance(identity.provenance, today) && provenance(expected.provenance, today));
  }
  // License review is unresolved. Initial secondary integration is private only;
  // caller booleans cannot authorize public display or redistribution.
  function allowed(options) { return options.mode === 'PRIVATE_RESEARCH'; }
  function componentBinding(component, identity, today) {
    if (!component || !exactIdentity(component.identity, identity, today)) return false;
    var aliases = { isin: 'isin', providerSymbol: 'providerSymbol', providerTicker: 'providerSymbol', symbol: 'providerSymbol', exchangeMic: 'exchangeMic', mic: 'exchangeMic',
      currency: 'currency', canonicalETFId: 'canonicalETFId', fundId: 'canonicalETFId', shareClassId: 'shareClassId' };
    return Object.keys(aliases).every(function (field) { return !present(component[field]) || component[field] === identity[aliases[field]]; });
  }
  function authenticated(component, kind, identity, options, today) {
    var attestation = component && component.attestation, signed = attestation && attestation.payload;
    if (!Crypto || !componentBinding(component, identity, today) || !signed || signed.schemaVersion !== 'vu-marketstack-secondary-attestation-1' ||
      signed.producer !== 'VU_MARKETSTACK_CANONICAL_PRODUCER' || signed.kind !== kind || !iso(signed.asOf) || signed.asOf > today ||
      stable(signed.identity) !== stable(component.identity) || !/^[a-f0-9]{64}$/.test(signed.rawSha256 || '')) return false;
    var key = options.trustedProducerKeys && options.trustedProducerKeys[signed.keyId];
    if (!key || !attestation.signature || typeof attestation.signature !== 'string') return false;
    var body = Object.assign({}, component); delete body.attestation;
    var hash = Crypto.createHash('sha256').update(stable(body)).digest('hex');
    if (hash !== signed.componentSha256) return false;
    try {
      var publicKey = Crypto.createPublicKey(key);
      if (publicKey.asymmetricKeyType !== 'ed25519' || !Crypto.verify(null, Buffer.from(stable(signed)), publicKey, Buffer.from(attestation.signature, 'base64'))) return false;
    } catch (_) { return false; }
    if (kind === 'HOLDINGS') {
      if (signed.completeness !== 'FULL' || signed.normalization !== 'NONE' || signed.originalWeightUnit !== 'fraction' || !Array.isArray(signed.originalWeightFractions) ||
        !Array.isArray(component.rows) || stable(signed.originalWeightFractions) !== stable(component.rows.map(function (row) { return row.weight; })) || signed.providerTotal !== component.rows.length) return false;
    }
    return true;
  }

  function primaryBinding(base, expected) {
    if (!base) return true;
    var fields = base.fields || {}, id = base.identity || {};
    var primaryIsin = present(fields.isin) ? F.valueOf(fields.isin) : present(base.isin) ? F.valueOf(base.isin) : id.isin;
    var values = { isin: primaryIsin, canonicalETFId: base.canonicalETFId || base.fundId || id.canonicalETFId,
      shareClassId: base.shareClassId || id.shareClassId, providerSymbol: base.providerSymbol || fields.symbol || id.providerSymbol,
      exchangeMic: base.exchangeMic || fields.exchangeMic || id.exchangeMic, currency: F.valueOf(fields.currency || fields.listingCurrency || base.currency || id.currency) };
    return Object.keys(values).every(function (key) { return !present(values[key]) || values[key] === expected[key]; }) &&
      ['prices', 'holdings', 'xrayHoldings'].every(function (key) { return !base[key] || primaryBinding(base[key], expected); });
  }

  /** Convert already-reviewed canonical evidence to the existing provider envelope.
   * Input metadata fields use ETFProvider.MAPPING_CONTRACT names/units, not provider raw names.
   * Caller retains original raw evidence in private storage; this envelope never returns it. */
  function prepareRecord(input, options) {
    options = options || {};
    var today = options.today || new Date().toISOString().slice(0, 10);
    if (!iso(today)) throw new Error('INVALID_TODAY');
    if (!input) return { record: null, reasons: ['SOURCE_MISSING'] };
    if (!allowed(options)) return { record: null, reasons: ['RIGHTS_UNCONFIRMED'] };
    if (!F || !H || !P) return { record: null, reasons: ['CONTRACT_ENGINE_UNAVAILABLE'] };
    if (!exactIdentity(input.identity, options.expectedIdentity, today)) return { record: null, reasons: ['EXACT_SHARE_CLASS_LISTING_IDENTITY_REQUIRED'] };
    var identity = input.identity, fields = {}, sources = {}, reasons = [], metadata = input.metadata || {};
    if (present(metadata.fields && metadata.fields.isin) && metadata.fields.isin !== identity.isin) return { record: null, reasons: ['METADATA_ISIN_CONFLICT'] };
    var metadataAuthenticated = authenticated(metadata, 'METADATA', identity, options, today);
    if (Object.keys(metadata.fields || {}).length && !metadataAuthenticated) reasons.push('METADATA_PRODUCER_ATTESTATION_REQUIRED');
    Object.keys(metadataAuthenticated ? metadata.fields || {} : {}).forEach(function (field) {
      var value = metadata.fields[field], source = metadata.provenance && metadata.provenance[field];
      if (!present(value)) return;
      if (!provenance(source, today)) { reasons.push('METADATA_PROVENANCE_' + field); return; }
      var mapped = { isin: identity.isin }; mapped[field] = value;
      if (P.validateMapped(mapped).length) { reasons.push('METADATA_INVALID_' + field); return; }
      if (field === 'isin' && value !== identity.isin) { reasons.push('METADATA_ISIN_CONFLICT'); return; }
      // An expense ratio is a distinct field, never silently relabelled as TER.
      if (field === 'ter' && /expense|ongoing|management/i.test(source.field || source.originalField || '')) { reasons.push('TER_SEMANTICS_UNVERIFIED'); return; }
      if (['fundSize', 'nav'].indexOf(field) >= 0 && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (field === 'nav' && value === 0))) { reasons.push('METADATA_INVALID_' + field); return; }
      if (field === 'ucits' && typeof value !== 'boolean') { reasons.push('METADATA_INVALID_ucits'); return; }
      if (field === 'fundSizeCurrency' && !/^[A-Z]{3}$/.test(value)) { reasons.push('METADATA_INVALID_fundSizeCurrency'); return; }
      if (['navDate', 'inceptionDate'].indexOf(field) >= 0 && (!iso(value) || value > today)) { reasons.push('METADATA_INVALID_' + field); return; }
      if (typeof value === 'object' || (typeof value === 'string' && !value.trim())) { reasons.push('METADATA_INVALID_' + field); return; }
      fields[field] = copy(value); sources[field] = copy(source);
    });
    if (present(fields.fundSize) && !present(fields.fundSizeCurrency)) { delete fields.fundSize; delete sources.fundSize; reasons.push('AUM_CURRENCY_REQUIRED'); }
    if (present(fields.nav) && (!present(fields.navDate) || !/^[A-Z]{3}$/.test(metadata.navCurrency || '') || !provenance(metadata.navCurrencyProvenance, today))) { delete fields.nav; delete sources.nav; reasons.push('NAV_DATE_CURRENCY_REQUIRED'); }
    if (present(fields.nav)) { sources.nav.currency = metadata.navCurrency; sources.nav.currencyProvenance = copy(metadata.navCurrencyProvenance); }
    var prices = null, price = input.prices;
    if (price) {
      var pointsValid = Array.isArray(price.points) && price.points.length > 0 && price.points.every(function (point, index) {
        return Array.isArray(point) && point.length === 2 && iso(point[0]) && point[0] <= today && typeof point[1] === 'number' && Number.isFinite(point[1]) && point[1] > 0 && (!index || price.points[index - 1][0] < point[0]);
      });
      if (authenticated(price, 'PRICES', identity, options, today) && price.canonical === true && price.quality === 'CERTIFIED' && price.priceSeriesType === 'SPLIT_ADJUSTED' && price.adjustmentStatus === 'ADJUSTMENT_CERTIFIED' &&
        ['CURRENT', 'LAST_VALID_SESSION'].indexOf(price.freshness) >= 0 && pointsValid && price.asOf === price.points[price.points.length - 1][0] && provenance(price.provenance, today) && price.provenance.asOf === price.asOf) {
        prices = { provider: 'marketstack', points: copy(price.points), timestamp: price.asOf, priceSeriesType: price.priceSeriesType, provenance: copy(price.provenance) };
      } else reasons.push('CANONICAL_PRICE_GATE_BLOCKED');
    }
    var holdings = null, xray = null, holdingInput = input.holdings;
    if (holdingInput) {
      var rows = holdingInput.rows;
      var complete = authenticated(holdingInput, 'HOLDINGS', identity, options, today) && holdingInput.status === 'FULL' && holdingInput.sufficientComplete === true && holdingInput.xrayReady === true && holdingInput.paginationComplete === true &&
        provenance(holdingInput.provenance, today) && iso(holdingInput.asOf) && holdingInput.provenance.asOf === holdingInput.asOf && holdingInput.asOf <= today &&
        (Date.parse(today) - Date.parse(holdingInput.asOf)) / 864e5 <= (options.maxHoldingsAgeDays === undefined ? 90 : options.maxHoldingsAgeDays) &&
        holdingInput.weightUnit === 'fraction' && Array.isArray(rows) && rows.length > 0 && holdingInput.providerTotal === rows.length;
      var rowsValid = complete && rows.every(function (row) { return row && present(row.holdingName) && typeof row.weight === 'number' && Number.isFinite(row.weight) && row.weight >= 0 && row.weight <= 1 &&
        ['EQUITY', 'BOND', 'CASH', 'FUND', 'ETF', 'COMMODITY'].indexOf(row.assetType) >= 0 && (row.assetType === 'CASH' || F.isValidIsin(row.holdingIsin)); });
      var total = rowsValid ? rows.reduce(function (sum, row) { return sum + row.weight; }, 0) : null;
      var unique = rowsValid && new Set(rows.map(stable)).size === rows.length;
      // The existing XRay engine uses identifiers as keys. Duplicate securities
      // require issuer look-through evidence before this facade may expose them.
      var uniqueSecurities = rowsValid && new Set(rows.map(function (row) { return row.assetType === 'CASH' ? 'CASH:' + (row.currency || '') : row.holdingIsin; })).size === rows.length;
      if (rowsValid && unique && uniqueSecurities && total >= 0.98 && total <= 1.02) {
        var snapshot = H.snapshot({ fundId: identity.canonicalETFId, shareClassId: identity.shareClassId, symbol: identity.providerSymbol, asOf: holdingInput.asOf,
          source: 'marketstack', sourceType: 'MARKET_DATA_PROVIDER', sourceUrl: holdingInput.provenance.sourceUrl || holdingInput.provenance.url, retrievedAt: holdingInput.provenance.retrievedAt, weightUnit: 'fraction' }, rows);
        if (!H.qualityGates(snapshot, null, { today: today, staleDays: options.maxHoldingsAgeDays || 90 }).errors.length) {
          holdings = snapshot;
          xray = { fundId: snapshot.fundId, shareClassId: snapshot.shareClassId, symbol: snapshot.symbol, asOf: snapshot.asOf, source: snapshot.source,
            holdings: snapshot.holdings.map(function (row) { return { holdingIdentifier: row.holdingId, isin: row.holdingIsin, ticker: row.holdingTicker, name: row.holdingName, weight: row.weight, country: row.country, sector: row.sector, currency: row.currency, assetType: row.assetType, source: 'marketstack' }; }) };
          if (X && X.validateHoldingsFile(xray).length) { holdings = null; xray = null; }
        }
      }
      if (!holdings) reasons.push(holdingInput.status === 'GATEWAY_ERROR' ? 'HOLDINGS_GATEWAY_COVERAGE_UNKNOWN' : 'FULL_HOLDINGS_GATE_BLOCKED');
    }
    return { record: { provider: 'marketstack', providerSymbol: identity.providerSymbol, canonicalETFId: identity.canonicalETFId,
      timestamp: today, dataQuality: 'CERTIFIED_FIELDS_ONLY', fieldCoverage: P.coverage(fields, Object.keys(P.MAPPING_CONTRACT.fields)).ratio,
      fields: fields, provenance: sources, prices: prices, holdings: holdings, xrayHoldings: xray, identity: copy(identity) }, reasons: reasons };
  }

  /** Existing merge-result facade: primary values are preserved even when older. */
  function fuse(base, input, options) {
    if (!input) return base;
    if (!options || !options.expectedIdentity || !primaryBinding(base, options.expectedIdentity)) return base;
    var prepared = prepareRecord(input, options);
    if (!prepared.record) return base;
    var secondary = prepared.record, added = [], conflicts = [], fields = Object.assign({}, base && base.fields || {}), sources = Object.assign({}, base && base.provenance || {});
    Object.keys(secondary.fields).forEach(function (field) {
      if (!present(fields[field])) { fields[field] = secondary.fields[field]; sources[field] = secondary.provenance[field]; added.push(field); }
      else if (stable(fields[field]) !== stable(secondary.fields[field])) conflicts.push({ field: field, primary: copy(fields[field]), secondary: copy(secondary.fields[field]), primaryProvenance: copy(sources[field] || null), secondaryProvenance: copy(secondary.provenance[field]), reason: 'PRIMARY_PRESERVED' });
    });
    var addPrice = !present(base && base.prices) && secondary.prices;
    var addHoldings = !present(base && base.holdings) && secondary.holdings;
    if (!added.length && !conflicts.length && !addPrice && !addHoldings) return base;
    var out = Object.assign({}, base || {}, { fields: fields, provenance: sources });
    if (addPrice) out.prices = secondary.prices;
    if (addHoldings) { out.holdings = secondary.holdings; out.xrayHoldings = secondary.xrayHoldings; }
    out.providers = (base && base.providers || []).slice();
    if (out.providers.indexOf('marketstack') < 0) out.providers.push('marketstack');
    out.secondaryEvidence = { source: 'marketstack', addedFields: added, conflicts: conflicts, reasons: prepared.reasons, primaryOverwrite: false, normalizationTo100: false };
    return out;
  }

  /** Opt-in hook around the existing registry; no provider table mutation.
   * getIdentity(symbol) must resolve existing official canonical listing evidence.
   * Multiple same-symbol source candidates fail closed rather than first-match. */
  function wrapRegistry(primary, inputs, options) {
    if (!inputs || !inputs.length) return primary;
    options = options || {};
    function inputFor(symbol) { var matches = inputs.filter(function (input) { return input && input.identity && input.identity.providerSymbol === symbol; }); return matches.length === 1 ? matches[0] : null; }
    function opts(symbol) { return Object.assign({}, options, { expectedIdentity: typeof options.getIdentity === 'function' ? options.getIdentity(symbol) : null }); }
    return Object.assign({}, primary, {
      metadata: function (symbol) { var base = primary.metadata(symbol); return fuse(base, inputFor(symbol), opts(symbol)); },
      prices: function (symbol) { var base = primary.prices(symbol); if (base) return base; var o = opts(symbol); if (!o.expectedIdentity || !primaryBinding(primary.metadata(symbol), o.expectedIdentity)) return base; var prepared = prepareRecord(inputFor(symbol), o); return prepared.record ? prepared.record.prices : base; },
      holdings: function (symbol) { var base = typeof primary.holdings === 'function' ? primary.holdings(symbol) : null; if (base) return base; var o = opts(symbol); if (!o.expectedIdentity || !primaryBinding(primary.metadata(symbol), o.expectedIdentity)) return base; var prepared = prepareRecord(inputFor(symbol), o); return prepared.record ? prepared.record.holdings : base; },
      xrayHoldings: function (symbol) { var base = typeof primary.xrayHoldings === 'function' ? primary.xrayHoldings(symbol) : null; if (base) return base;
        if (typeof primary.holdings === 'function' && primary.holdings(symbol)) return base;
        var o = opts(symbol); if (!o.expectedIdentity || !primaryBinding(primary.metadata(symbol), o.expectedIdentity)) return base;
        var prepared = prepareRecord(inputFor(symbol), o); return prepared.record ? prepared.record.xrayHoldings : base; }
    });
  }
  var api = { VERSION: VERSION, prepareRecord: prepareRecord, fuse: fuse, wrapRegistry: wrapRegistry };
  if (node) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.MarketstackSecondary = api; }
})(typeof window !== 'undefined' ? window : globalThis);
