/* =========================================================================
   VISION UNIVERSE TECHNICAL — timeframe.js
   TIMEFRAME ENGINE (Aggregation, Kalender, Session-Policy)

   EOD/Daily ist die V1-Foundation. Hoehere Timeframes (1W, 1M) entstehen
   durch Aggregation entlang des tatsaechlichen Handelskalenders — die
   Wochenbar schliesst am letzten Handelstag der ISO-Woche, die Monatsbar am
   letzten Handelstag des Kalendermonats. Kein naives UTC-Gruppieren.

   Intraday (1m … 4h) wird optional konsumiert. 4h ist kein neutrales
   Intervall: die Bar-Grenzen entstehen aus Session-Start und
   Boersenkalender (sessionPolicy in technical-v1.json), versioniert.
   Kanonische Intraday-Timestamps sind Exchange-Lokalzeit im Format
   YYYY-MM-DDTHH:MM; Bars ausserhalb der regulaeren Session sind
   sessionType EXTENDED und werden nur auf Wunsch einbezogen.

   Die letzte aggregierte Bar ist DEVELOPING, solange der Aufrufer nicht
   erklaert, dass die Periode geschlossen ist (closed:true). Engines, die
   auf aggregierten Serien rechnen, behandeln sie entsprechend.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Canonical = isNode ? require("./canonical-bars.js") : global.VUTechnical.CanonicalBars;

  var AGGREGATION_VERSION = "tf-agg-1.0.0";

  var TIMEFRAMES = {
    "1m":  { minutes: 1,   kind: "intraday" },
    "5m":  { minutes: 5,   kind: "intraday" },
    "15m": { minutes: 15,  kind: "intraday" },
    "30m": { minutes: 30,  kind: "intraday" },
    "1h":  { minutes: 60,  kind: "intraday" },
    "4h":  { minutes: 240, kind: "intraday" },
    "1D":  { minutes: 0,   kind: "daily" },
    "1W":  { minutes: 0,   kind: "weekly" },
    "1M":  { minutes: 0,   kind: "monthly" }
  };
  var ORDER = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"];

  var DEFAULT_POLICY = {
    policyId: "XNYS-regular-v1", exchange: "XNYS", timezone: "America/New_York",
    sessionStart: "09:30", sessionEnd: "16:00", fourHourAnchor: "SESSION_START", includeExtended: false
  };

  function rank(tf) { return ORDER.indexOf(tf); }

  // ------------------------------------------------------------- Kalender
  function toDate(iso) { return new Date(iso.slice(0, 10) + "T00:00:00Z"); }
  function toISO(d) { return d.toISOString().slice(0, 10); }
  var MS_DAY = 86400000;

  /** ISO-Wochenschluessel (Montag-basiert), z. B. "2024-W05". */
  function isoWeekKey(iso) {
    var d = toDate(iso);
    var day = d.getUTCDay() || 7;                 // Mo=1 … So=7
    d.setUTCDate(d.getUTCDate() + 4 - day);       // Donnerstag der Woche
    var year = d.getUTCFullYear();
    var yearStart = new Date(Date.UTC(year, 0, 1));
    var week = Math.ceil((((d - yearStart) / MS_DAY) + 1) / 7);
    return year + "-W" + (week < 10 ? "0" + week : week);
  }
  function monthKey(iso) { return iso.slice(0, 7); }

  /**
   * Handelskalender aus den bekannten Handelstagen einer Serie. Fuer
   * Zeitpunkte NACH dem letzten bekannten Tag werden Werktage fortgeschrieben
   * (feiertagsunabhaengig — das ist dokumentierte Naeherung fuer
   * Projektionsachsen, keine Handelstagswahrheit).
   */
  function createCalendar(tradingDays) {
    var days = (tradingDays || []).map(function (t) { return t.slice(0, 10); });
    var index = Object.create(null);
    days.forEach(function (d, i) { index[d] = i; });

    function nextWeekday(iso, n) {
      var d = toDate(iso);
      var left = n;
      while (left > 0) {
        d = new Date(d.getTime() + MS_DAY);
        var wd = d.getUTCDay();
        if (wd !== 0 && wd !== 6) left--;
      }
      return toISO(d);
    }

    return {
      calendarVersion: "calendar-1.0.0",
      days: days,
      has: function (iso) { return index[iso.slice(0, 10)] !== undefined; },
      indexOf: function (iso) { var i = index[iso.slice(0, 10)]; return i === undefined ? -1 : i; },
      /** n Handelstage nach iso (n>=0). Innerhalb der Historie exakt, danach Werktage. */
      offset: function (iso, n) {
        var i = this.indexOf(iso);
        if (i >= 0 && i + n < days.length) return days[i + n];
        var base = i >= 0 ? days[days.length - 1] : iso.slice(0, 10);
        var remaining = i >= 0 ? n - (days.length - 1 - i) : n;
        return nextWeekday(base, remaining);
      },
      extrapolated: function (iso) { return !this.has(iso) || this.indexOf(iso) > days.length - 1; }
    };
  }

  // ---------------------------------------------------------- Aggregation
  function minutesOf(hhmm) { var p = hhmm.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  /** Bucket-Schluessel + kanonischer Bar-Timestamp fuer eine Quell-Bar. */
  function bucketOf(ts, target, policy) {
    var spec = TIMEFRAMES[target];
    if (spec.kind === "weekly") return { key: isoWeekKey(ts), stamp: null };
    if (spec.kind === "monthly") return { key: monthKey(ts), stamp: null };
    if (spec.kind === "daily") return { key: ts.slice(0, 10), stamp: ts.slice(0, 10) };
    /* intraday: Session-verankert */
    var date = ts.slice(0, 10);
    var hm = ts.length >= 16 ? minutesOf(ts.slice(11, 16)) : NaN;
    var start = minutesOf(policy.sessionStart), end = minutesOf(policy.sessionEnd);
    var extended = !(hm >= start && hm < end);
    if (extended && !policy.includeExtended) return null;
    var rel = hm - start;
    var b = Math.floor(rel / spec.minutes);
    var bucketStart = start + b * spec.minutes;
    var stamp = date + "T" + pad2(Math.floor(bucketStart / 60)) + ":" + pad2(bucketStart % 60);
    return { key: date + "#" + b, stamp: stamp, extended: extended,
             partial: bucketStart + spec.minutes > end };
  }

  /**
   * Aggregiert eine Serie auf einen groesseren Timeframe.
   * @param {object} series CanonicalBarSeries
   * @param {string} target Ziel-Timeframe
   * @param {object} [opts] { policy, closed }
   */
  function aggregate(series, target, opts) {
    opts = opts || {};
    var policy = Object.assign({}, DEFAULT_POLICY, opts.policy || {});
    if (!TIMEFRAMES[target]) throw new Error("Unbekannter Timeframe: " + target);
    if (rank(target) <= rank(series.timeframe)) throw new Error("Aggregation nur auf groesseren Timeframe (" + series.timeframe + " → " + target + ")");
    var srcKind = TIMEFRAMES[series.timeframe].kind, dstKind = TIMEFRAMES[target].kind;
    if (srcKind !== "intraday" && dstKind === "intraday") throw new Error("Intraday laesst sich nicht aus Daily erzeugen");

    var buckets = [];
    var current = null;
    for (var i = 0; i < series.length; i++) {
      var ts = series.timestamps[i];
      var b = bucketOf(ts, target, policy);
      if (!b) continue;
      if (!current || current.key !== b.key) {
        current = { key: b.key, stamp: b.stamp, first: i, last: i, open: series.open[i], high: series.high[i],
                    low: series.low[i], close: series.close[i], volume: series.volume[i], flags: [],
                    factor: series.adjustmentFactor[i], partial: !!b.partial, extended: !!b.extended, count: 1 };
        buckets.push(current);
      } else {
        current.last = i; current.count++;
        if (series.high[i] > current.high) current.high = series.high[i];
        if (series.low[i] < current.low) current.low = series.low[i];
        current.close = series.close[i];
        current.volume = (current.volume === null || series.volume[i] === null) ? (current.volume === null ? series.volume[i] : current.volume) : current.volume + series.volume[i];
        current.factor = series.adjustmentFactor[i];
      }
      var f = series.corporateActionFlags[i];
      if (f && f.length) current.flags = current.flags.concat(f);
    }

    var cols = { timestamps: [], open: [], high: [], low: [], close: [], volume: [], adjustmentFactor: [], corporateActionFlags: [] };
    buckets.forEach(function (bk) {
      /* Wochen-/Monatsbar traegt den Timestamp des letzten enthaltenen
         Handelstags — das ist der Zeitpunkt, an dem sie bekannt war. */
      cols.timestamps.push(bk.stamp || series.timestamps[bk.last]);
      cols.open.push(bk.open); cols.high.push(bk.high); cols.low.push(bk.low); cols.close.push(bk.close);
      cols.volume.push(bk.volume); cols.adjustmentFactor.push(bk.factor);
      cols.corporateActionFlags.push(bk.flags.length ? bk.flags : null);
    });

    var out = Canonical.createSeries({
      instrumentId: series.instrumentId, exchange: series.exchange, currency: series.currency,
      timeframe: target, priceSeriesType: series.priceSeriesType, sessionType: "AGGREGATED",
      source: series.source, sourceRevision: series.sourceRevision, dataVersion: series.dataVersion,
      meta: Object.assign({}, series.meta, {
        aggregation: { from: series.timeframe, to: target, version: AGGREGATION_VERSION, policyId: policy.policyId,
                       sourceHash: series.dataHash },
        lastBarStatus: opts.closed ? "CONFIRMED" : "DEVELOPING",
        bucketSpans: buckets.map(function (bk) { return [bk.first, bk.last]; }),
        partialLastBucket: buckets.length ? !!buckets[buckets.length - 1].partial : false
      })
    }, cols);
    return out;
  }

  /** Multi-Timeframe-Rollen (§31): hoeher = Regime, Setup, tiefer = Trigger. */
  function roles(setupTimeframe) {
    var i = rank(setupTimeframe);
    return {
      context: ORDER[Math.min(ORDER.length - 1, i + 1)],
      setup: setupTimeframe,
      trigger: i > 0 ? ORDER[i - 1] : null
    };
  }

  var api = {
    AGGREGATION_VERSION: AGGREGATION_VERSION, TIMEFRAMES: TIMEFRAMES, ORDER: ORDER, DEFAULT_POLICY: DEFAULT_POLICY,
    rank: rank, isoWeekKey: isoWeekKey, monthKey: monthKey, bucketOf: bucketOf,
    createCalendar: createCalendar, aggregate: aggregate, roles: roles
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Timeframe = api; }
})(typeof window !== "undefined" ? window : globalThis);
