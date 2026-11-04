/* Per-stock publication isolation for the Europe Discover display projection
 * (owner approval 2026-11-03). The reviewed universe stays complete (449
 * securities). Each security is admitted only if it passes every existing
 * identity, Close-quality and freshness gate on its own
 * (core/europe-discover-eligibility.js, unchanged criteria). A security that
 * fails is published as BLOCKED: it keeps its catalog identity, carries an
 * explicit reason, and never gets a chart or price (the eligibility gate
 * refuses any listing whose discoverPublication.status is not ADMITTED).
 * The blocked list is part of the manifest and bound by SHA-256 to the
 * hash-bound catalog flags. A broad failure never ships quietly as
 * "partial": more than POLICY.maxBlocked blocked securities (5 % of the
 * universe, rounded down) abort the publication. */
(function (root, factory) {
  'use strict'; var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {}; root.VUCore.EuropePublicationIsolation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'europe-discover-per-stock-isolation-1';
  var UNIVERSE = 449;
  var POLICY = Object.freeze({universe: UNIVERSE, maxBlockedShare: 0.05, maxBlocked: Math.floor(UNIVERSE * 0.05)});
  // Reason classes shown in the product. Provider failures, unexplained price
  // breaks, outdated closes and any other failed admission check.
  var CLASSES = Object.freeze(['PROVIDER_DATA_UNAVAILABLE', 'PRICE_DISCONTINUITY_UNRESOLVED', 'PRICES_NOT_CURRENT', 'ADMISSION_CHECK_FAILED']);
  var PROVIDER_HOLDS = ['PROVIDER_REQUEST_FAILED', 'PROVIDER_PAGINATION_INCOMPLETE', 'NO_NEW_COMPLETED_SESSION'];
  var PRICE_HOLDS = ['OVERLAP_CLOSE_CONFLICT', 'TAIL_CRITICAL_CLOSE_ISSUE', 'UNEXPLAINED_CLOSE_DISCONTINUITY_AT_JOIN'];

  /** hold: refresh hold reason or null; criticalIssues: issues cut from the
   * appended tail; admissionReasons: discoverReasonCodes of the failed gate. */
  function classify(hold, criticalIssues, admissionReasons) {
    var reasons = (admissionReasons || []).filter(function (r) { return r !== 'PUBLICATION_BLOCKED'; });
    var head = typeof hold === 'string' ? hold.split(':')[0] : null;
    if (head && PROVIDER_HOLDS.indexOf(head) >= 0) return {reasonClass: 'PROVIDER_DATA_UNAVAILABLE', reasonCode: hold};
    if (head && PRICE_HOLDS.indexOf(head) >= 0) return {reasonClass: 'PRICE_DISCONTINUITY_UNRESOLVED', reasonCode: hold};
    if (Array.isArray(criticalIssues) && criticalIssues.length) return {reasonClass: 'PRICE_DISCONTINUITY_UNRESOLVED', reasonCode: 'UNEXPLAINED_CLOSE_DISCONTINUITY'};
    if (hold) return {reasonClass: 'ADMISSION_CHECK_FAILED', reasonCode: hold};
    if (reasons.length === 1 && reasons[0] === 'LAST_CLOSE_TOO_OLD_OR_UNVERIFIABLE') return {reasonClass: 'PRICES_NOT_CURRENT', reasonCode: reasons[0]};
    return {reasonClass: 'ADMISSION_CHECK_FAILED', reasonCode: reasons[0] || 'DISCOVER_ADMISSION_FAILED'};
  }

  function sorted(entries) { return entries.slice().sort(function (a, b) { return a.securityId < b.securityId ? -1 : a.securityId > b.securityId ? 1 : 0; }); }

  /** Builds the manifest section. digest: JSON-string -> hex SHA-256. */
  function build(blockedEntries, now, digest) {
    var blocked = sorted(blockedEntries.map(function (b) {
      if (!b || typeof b.securityId !== 'string' || CLASSES.indexOf(b.reasonClass) < 0 || typeof b.reasonCode !== 'string' || !b.reasonCode) throw Error('BLOCKED_REASON_REQUIRED');
      return {securityId: b.securityId, ticker: b.ticker || null, mic: b.mic || null, reasonClass: b.reasonClass, reasonCode: b.reasonCode,
        admissionReasons: (b.admissionReasons || []).slice()};
    }));
    return {version: VERSION, evaluatedAt: now, universe: UNIVERSE, admitted: UNIVERSE - blocked.length, blockedCount: blocked.length,
      policy: {kind: 'PER_STOCK_ISOLATION', maxBlocked: POLICY.maxBlocked, maxBlockedShare: POLICY.maxBlockedShare,
        rule: 'every admitted security passes the unchanged admission gates individually; blocked securities get no chart or price'},
      blocked: blocked, blockedSha256: digest(JSON.stringify(blocked))};
  }

  /** Checks manifest section, catalog flags and limits. A publication without
   * the section (before per-stock isolation) means every listing is admitted.
   * Returns {admitted:[securityId], blocked:[entry], legacy:boolean}. */
  function verify(manifest, catalog, digest) {
    if (!manifest || !catalog || !Array.isArray(catalog.securities)) throw Error('EUROPE_PUBLICATION_REQUIRED');
    var ids = catalog.securities.map(function (s) { return s.securityId; });
    if (ids.length !== UNIVERSE || manifest.securityCount !== UNIVERSE || new Set(ids).size !== UNIVERSE) throw Error('REVIEWED_449_SET_REQUIRED');
    var flags = {};
    catalog.securities.forEach(function (s) { var l = s.listings && s.listings[0]; flags[s.securityId] = l && l.discoverPublication; });
    var p = manifest.publication;
    if (p === undefined) {
      if (ids.some(function (id) { return flags[id] !== undefined; })) throw Error('PUBLICATION_SECTION_REQUIRED');
      return {admitted: ids, blocked: [], legacy: true};
    }
    if (!p || p.version !== VERSION || p.universe !== UNIVERSE || !Array.isArray(p.blocked) || p.blockedCount !== p.blocked.length || p.admitted + p.blockedCount !== UNIVERSE) throw Error('PUBLICATION_COUNTS_INVALID');
    if (!p.policy || p.policy.maxBlocked !== POLICY.maxBlocked || p.blocked.length > POLICY.maxBlocked) throw Error('BLOCKED_SHARE_LIMIT_EXCEEDED:' + p.blocked.length + '>' + POLICY.maxBlocked);
    if (typeof digest === 'function' && digest(JSON.stringify(p.blocked)) !== p.blockedSha256) throw Error('BLOCKED_LIST_HASH_MISMATCH');
    if (JSON.stringify(sorted(p.blocked)) !== JSON.stringify(p.blocked)) throw Error('BLOCKED_LIST_ORDER_INVALID');
    var blocked = {};
    p.blocked.forEach(function (b) {
      if (!b || blocked[b.securityId] || ids.indexOf(b.securityId) < 0 || CLASSES.indexOf(b.reasonClass) < 0 || typeof b.reasonCode !== 'string' || !b.reasonCode) throw Error('BLOCKED_ENTRY_INVALID:' + (b && b.securityId));
      blocked[b.securityId] = b;
    });
    var admitted = [];
    ids.forEach(function (id) {
      var f = flags[id], b = blocked[id];
      if (b) { if (!f || f.status !== 'BLOCKED' || f.reasonClass !== b.reasonClass || f.reasonCode !== b.reasonCode) throw Error('BLOCKED_FLAG_MISMATCH:' + id); }
      else if (!f || f.status !== 'ADMITTED') throw Error('ADMITTED_FLAG_MISMATCH:' + id);
      else admitted.push(id);
    });
    if (admitted.length !== p.admitted || !admitted.length) throw Error('PUBLICATION_COUNTS_INVALID');
    return {admitted: admitted, blocked: p.blocked.slice(), legacy: false};
  }

  return {VERSION: VERSION, POLICY: POLICY, CLASSES: CLASSES, classify: classify, build: build, verify: verify};
});
