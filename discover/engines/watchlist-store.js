/* Listing identity storage, with read-only import of the existing ticker list.
   Legacy data changes only in response to an explicit user removal. */
(function (global) {
  'use strict';
  var LEGACY = 'vu-discover-watchlist-v1', KEY = 'vu-discover-watchlist-listings-v1';
  function parse(storage, key) { try { var a = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function ticker(s) { return typeof s === 'string' && /^[A-Z0-9.\-]{1,24}$/.test(s); }
  function valid(r) { return r && ticker(r.ticker) && /^vu_[a-f0-9]+$/.test(r.listingId) && typeof r.universeId === 'string'; }
  function reference(symbol, detail, universeId) {
    return { ticker: symbol, listingId: detail && (detail.listingId || detail.instrumentId) || null,
      universeId: universeId || 'US_REAL', exchange: detail && detail.exchange || null };
  }
  function load(storage) {
    var rows = parse(storage, KEY).filter(valid), seen = new Set();
    rows = rows.filter(function (r) { if (seen.has(r.listingId)) return false; seen.add(r.listingId); return true; });
    parse(storage, LEGACY).filter(ticker).forEach(function (s) {
      if (!rows.some(function (r) { return r.ticker === s && r.universeId === 'US_REAL'; })) rows.push(reference(s));
    });
    return rows;
  }
  function matches(row, ref) {
    return row.listingId && ref.listingId ? row.listingId === ref.listingId : row.ticker === ref.ticker && row.universeId === ref.universeId;
  }
  function contains(storage, ref) { return load(storage).some(function (r) { return matches(r, ref); }); }
  function assertListing(detail, listingId) {
    if (listingId && decodeURIComponent(listingId) !== (detail.listingId || detail.instrumentId)) throw Error('Listing passt nicht zur Aktienseite');
  }
  function toggle(storage, ref) {
    if (!ref || !ticker(ref.ticker)) throw Error('WATCHLIST_IDENTITY_INVALID');
    var found = contains(storage, ref), rows = parse(storage, KEY).filter(valid);
    if (found) {
      rows = rows.filter(function (r) { return !matches(r, ref); });
      if (ref.universeId === 'US_REAL') storage.setItem(LEGACY, JSON.stringify(parse(storage, LEGACY).filter(function (s) { return s !== ref.ticker; })));
    } else {
      if (!valid(ref)) throw Error('WATCHLIST_LISTING_ID_REQUIRED');
      if (load(storage).length >= 100) throw Error('WATCHLIST_LIMIT_REACHED');
      rows.unshift(ref);
    }
    storage.setItem(KEY, JSON.stringify(rows));
    return !found;
  }
  var api = { load: load, reference: reference, contains: contains, toggle: toggle, assertListing: assertListing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VUWatchlistStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
