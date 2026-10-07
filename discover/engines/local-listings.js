/* Local listings use the central identity and published-price contracts.
   The legacy US watchlist remains in its existing, separate storage key. */
(function (root, factory) {
  'use strict';
  var identity = (typeof module === 'object' && module.exports) ? require('../../core/identity.js') : root.VUCore.Identity;
  var api = factory(identity);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUDiscover = root.VUDiscover || {};
  root.VUDiscover.LocalListings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity) {
  'use strict';
  var KEY = 'vu-discover-local-listings-v1';
  function validId(id) { return Identity.isListingId(id); }
  function reference(row) {
    if (!row || !validId(row.listingId)) throw Error('WATCHLIST_LISTING_ID_REQUIRED');
    return { listingId: row.listingId, ticker: row.ticker, name: row.name, mic: row.mic, currency: row.tradingCurrency || row.currency || null };
  }
  function saved(storage) {
    try {
      var rows = JSON.parse(storage.getItem(KEY) || '[]'), seen = new Set();
      return (Array.isArray(rows) ? rows : []).filter(function (r) {
        if (!r || !validId(r.listingId) || seen.has(r.listingId)) return false;
        seen.add(r.listingId); return true;
      }).slice(0, 100).map(reference);
    } catch (_) { return []; }
  }
  function contains(storage, row) { return saved(storage).some(function (r) { return r.listingId === row.listingId; }); }
  function resolveSaved(storage, listings) {
    var byId = new Map((listings || []).map(function (r) { return [r.listingId, r]; }));
    return saved(storage).map(function (ref) { return byId.get(ref.listingId) || ref; });
  }
  function toggle(storage, row) {
    var ref = reference(row), rows = saved(storage), exists = contains(storage, ref);
    if (exists) rows = rows.filter(function (r) { return r.listingId !== ref.listingId; });
    else { if (rows.length >= 100) throw Error('WATCHLIST_LIMIT_REACHED'); rows.unshift(ref); }
    storage.setItem(KEY, JSON.stringify(rows));
    return !exists;
  }
  function href(row) { return '#/listing/' + encodeURIComponent(row.listingId); }
  function logoSymbol(row) {
    var logo = row && row.logo;
    return logo && ['VERIFIED_LOGO', 'EXISTING_FALLBACK'].includes(logo.status) && logo.companyId &&
      logo.companyId === (row.companyId || row.referencedIssuerId) && /^[A-Z0-9.\-]{1,24}$/.test(logo.symbol || '') ? logo.symbol : '';
  }
  function unitLabel(currency, unit) { return unit === 'MINOR' ? currency === 'GBP' ? 'GBX' : currency + ' Untereinheit' : !unit || unit === 'MAJOR' ? currency : unit; }
  function freshnessLabel(status) {
    return { CURRENT: 'letzte bestätigte Handelssitzung', FRESH_CURRENT_SESSION: 'bestätigte aktuelle Sitzung',
      FRESH_LAST_VALID_SESSION: 'letzte bestätigte Handelssitzung', DELAYED_EXPECTED: 'Tageskurs noch ausstehend',
      STALE_CACHE: 'veralteter Quellenstand', STALE: 'veralteter Quellenstand', MISSING: 'Kurs fehlt', INVALID: 'Kurs gesperrt' }[status] || 'Aktualität nicht bestätigt';
  }
  function readinessLabel(proof, kind) {
    var labels = { CHART_READY: 'Chart freigegeben', CHART_READY_WITH_LIMITATION: 'Chart mit Einschränkung', CHART_BLOCKED: 'Chart gesperrt',
      TECHNICAL_READY: 'Technik freigegeben', TECHNICAL_PARTIAL: 'Technik teilweise freigegeben', TECHNICAL_BLOCKED: 'Technik gesperrt' };
    var expected = { CHART_READY: 'READY', CHART_READY_WITH_LIMITATION: 'PARTIAL', CHART_BLOCKED: 'BLOCKED', TECHNICAL_READY: 'READY', TECHNICAL_PARTIAL: 'PARTIAL', TECHNICAL_BLOCKED: 'BLOCKED' };
    return proof && proof.status === expected[proof.state] && labels[proof.state] || (kind === 'chart' ? 'Chart' : 'Technik') + ' noch nicht geprüft';
  }
  function create(opts) {
    if (!opts || !opts.core) throw Error('LOCAL_LISTINGS_NEEDS_CORE');
    var core = opts.core;
    return {
      list: function (filters) { return core.getListings(filters || {}); },
      screen: function (filters) { return typeof core.getListingScreener === 'function' ? core.getListingScreener(filters || {}) : Promise.resolve({ state: 'UNAVAILABLE', reason: 'PRODUCT_INTEGRATION_MISSING' }); },
      search: function (query) { return core.searchListings(query); },
      detail: async function (id) {
        var listing = await core.getListing(id);
        if (listing.state !== 'AVAILABLE') return { listing: listing, price: listing, series: listing };
        var values = await Promise.all([core.getListingLatestPrice(id), core.getListingPriceSeries(id)]);
        return { listing: listing, price: values[0], series: values[1] };
      }
    };
  }
  return { KEY: KEY, create: create, validId: validId, reference: reference, saved: saved, resolveSaved: resolveSaved, contains: contains,
    toggle: toggle, href: href, logoSymbol: logoSymbol, unitLabel: unitLabel, freshnessLabel: freshnessLabel, readinessLabel: readinessLabel };
});
