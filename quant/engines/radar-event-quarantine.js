/* =========================================================================
   VISION UNIVERSE - radar-event-quarantine.js

   Ereignisse, die der Radar frueher veroeffentlicht hat und die sich als
   Rechenartefakt erwiesen haben, bleiben in den unveraenderlichen
   Tagessnapshots (radar-history/events) stehen - ein Snapshot wird nie von
   Hand umgeschrieben. Die Ereignis-Historie, die der Radar je Aktie zeigt,
   liest die Snapshots durch diesen Filter: nur die einzeln benannten
   (Titel, Ereignistyp, Stichtag) fallen heraus, mit Grund und Beleg im
   Eintrag (quant/config/radar-event-quarantine.json). Kein Muster, keine
   Wildcard, keine Zeitspanne.
   ========================================================================= */
(function (root) {
  "use strict";
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function validate(config) {
    var errors = [];
    if (!config || !Array.isArray(config.entries)) return { valid: false, errors: ["ENTRIES_MISSING"] };
    var seen = {};
    config.entries.forEach(function (e, i) {
      if (!e || typeof e.ticker !== "string" || !/^[A-Z0-9.\-]{1,12}$/.test(e.ticker)) errors.push("TICKER_INVALID:" + i);
      else if (typeof e.eventType !== "string" || !/^[A-Z_]{2,40}$/.test(e.eventType)) errors.push("EVENT_TYPE_INVALID:" + i);
      else if (typeof e.occurredAt !== "string" || !DATE.test(e.occurredAt)) errors.push("OCCURRED_AT_INVALID:" + i);
      else if (typeof e.reason !== "string" || e.reason.length < 20) errors.push("REASON_MISSING:" + i);
      else if (typeof e.evidence !== "string" || e.evidence.length < 20) errors.push("EVIDENCE_MISSING:" + i);
      else {
        var key = e.ticker + "|" + e.eventType + "|" + e.occurredAt;
        if (seen[key]) errors.push("DUPLICATE:" + key);
        seen[key] = true;
      }
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function index(config) {
    var v = validate(config);
    if (!v.valid) throw new Error("RADAR_EVENT_QUARANTINE_INVALID:" + v.errors[0]);
    var map = {};
    config.entries.forEach(function (e) { map[e.ticker + "|" + e.eventType + "|" + e.occurredAt] = true; });
    return map;
  }

  /** true, wenn genau dieses Ereignis in Quarantaene steht. */
  function isQuarantined(map, ticker, eventType, occurredAt) {
    return map[ticker + "|" + eventType + "|" + occurredAt] === true;
  }

  var api = { validate: validate, index: index, isQuarantined: isQuarantined };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VURadarEventQuarantine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
