/* =========================================================================
   VISION UNIVERSE CORE — watchlist-view.js

   Aus der gemeinsamen Watchlist-Uebersicht (core/data/watchlist-summary-v1.json,
   scripts/watchlist/build-summary.mjs) und der persoenlichen Auswahl eines
   Nutzers (instrumentId, Notiz) wird je Zeile eine Ansicht mit ZUSTAENDEN:

     AVAILABLE   belegt und aktuell
     STALE       belegt, aber aelter als die Frist der Datenart (domains.json)
     UNAVAILABLE keine Abdeckung, gesperrt oder zurueckgehalten - mit Grund

   Keine eigene Rechnung: Werte, Stufen und Freigaben kommen aus den Artefakten.
   Die Regeln hier entscheiden nur, was AUSGEWIESEN werden darf:
     * kein Quant-Gesamtscore, solange publication.compositeAllowed=false
     * eine Supertrader-Eignung nur fuer freigegebene Strategien
       (released: LIVE, CRITERIA_MET, nicht Forschung); sonst "Forschung"
     * ein neues 52-Wochen-Hoch nur, wenn der Technikstand aktuell ist;
       Annaeherung und Hoch auf Wochen-/Monatsschluss sind eigene Zustaende
     * veraltete Abschnitte zaehlen in keiner Kennzahl der Liste mit
     * ein Listing ohne aktive Notierung (delistet) traegt keine Marktdaten

   UMD: Browser (globalThis.VUCore.WatchlistView), Node (require).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var isNode = typeof module === "object" && module.exports;
  var SC = isNode ? require("./stock-context.js") : root.VUCore && root.VUCore.StockContext;
  var api = factory(SC);
  if (isNode) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.WatchlistView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (SC) {
  "use strict";

  var VERSION = "watchlist-view-1.0.0";
  var SCHEMA = "vu-watchlist-summary-1.0.0";
  var RULE_VERSION = "watchlist-events-1.0.0";
  var NEAR_HIGH = -0.05;           /* Discover nearHigh/watch: hoechstens 5 % unter dem 52W-Hoch */
  var ACTIONABLE = ["SETUP", "ENTRY_READY", "TRIGGERED", "ACTIVE"];
  var FACTOR_LABEL = { quality: "Qualität", growth: "Wachstum", momentum: "Momentum", value: "Bewertung",
    profitability: "Profitabilität", revisions: "Revisionen", risk: "Risiko" };
  var REASON = {
    SOURCE_MISSING: "Quelle nicht ausgeliefert", NOT_IN_UNIVERSE: "Nicht im Vision-Universe-Bestand",
    LISTING_INACTIVE: "Listing nicht aktiv (delistet oder ersetzt)", NOT_COVERED: "Keine Abdeckung",
    LISTING_AMBIGUOUS: "Listing nicht eindeutig", CURRENCY_MISMATCH: "Währung passt nicht zum Listing",
    COMPOSITE_WITHHELD: "Gesamtscore nicht freigegeben", STALE: "Datenstand veraltet"
  };

  /* --------------------------------------------------------------- Laden
     Auslieferung in Teilen (scripts/watchlist/build-summary.mjs#splitSummary): meta.json plus je Ticker-Scherbe
     rows/<shardKey>.json; names.json nur fuer Suche und Uebernahme. Fehlt ein Teil, fehlen seine Zeilen
     (die Ansicht sagt dann "nicht verfuegbar") - es wird nichts ergaenzt. */
  var BASE = "/core/data/watchlist-summary-v1/";
  var PATHS = { meta: BASE + "meta.json", names: BASE + "names.json", rows: function (key) { return BASE + "rows/" + key + ".json"; } };
  function merge(meta, parts) {
    var cols = {};
    meta.fields.forEach(function (f) { cols[f] = []; });
    parts.forEach(function (p) { if (p && p.cols) meta.fields.forEach(function (f) { cols[f] = cols[f].concat(p.cols[f] || []); }); });
    var doc = {}; for (var k in meta) if (k !== "shards") doc[k] = meta[k];
    doc.cols = cols; doc.count = cols.i.length;
    return doc;
  }
  /** keys: Scherben (core/identity.js#shardKey der Ticker). fetchJson(path) -> Promise<json>. */
  function load(fetchJson, keys, meta) {
    return (meta ? Promise.resolve(meta) : fetchJson(PATHS.meta)).then(function (m) {
      if (!m || m.schemaVersion !== SCHEMA || !Array.isArray(m.fields)) throw new Error("WATCHLIST_SUMMARY_INVALID");
      var have = {}; (m.shards || []).forEach(function (k) { have[k] = true; });
      var wanted = (keys || []).filter(function (k, i, a) { return have[k] && a.indexOf(k) === i; });
      return Promise.all(wanted.map(function (k) { return fetchJson(PATHS.rows(k)).then(function (p) { return p && p.shard === k ? p : null; }, function () { return null; }); }))
        .then(function (parts) { return { meta: m, doc: merge(m, parts), loaded: wanted.filter(function (k, i) { return parts[i]; }) }; });
    });
  }

  /* ---------------------------------------------------------------- Index */
  function index(doc) {
    if (!doc || doc.schemaVersion !== SCHEMA || !doc.cols || !Array.isArray(doc.cols.i)) throw new Error("WATCHLIST_SUMMARY_INVALID");
    var pos = {}, c = doc.cols;
    for (var k = 0; k < c.i.length; k++) pos[c.i[k]] = k;
    function get(id) {
      var k = pos[id];
      if (k === undefined) return null;
      var r = {};
      doc.fields.forEach(function (f) { r[f] = c[f][k]; });
      return r;
    }
    /* Suche zum Hinzufuegen: Kuerzel exakt zuerst, dann Anfang, dann Name. Nur aktive Listings. */
    function search(query, limit) {
      var q = String(query || "").trim().toUpperCase(), out = [];
      if (!q) return out;
      var scored = [];
      for (var k = 0; k < c.i.length; k++) {
        if (c.act[k] !== 1) continue;
        var s = c.s[k], n = String(c.n[k] || "").toUpperCase(), score = s === q ? 0 : s.indexOf(q) === 0 ? 1 : n.indexOf(q) === 0 ? 2 : n.indexOf(q) > 0 ? 3 : -1;
        if (score >= 0) scored.push([score, s.length, k]);
      }
      scored.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || (c.s[a[2]] < c.s[b[2]] ? -1 : 1); });
      for (var j = 0; j < scored.length && out.length < (limit || 8); j++) {
        var x = scored[j][2];
        out.push({ instrumentId: c.i[x], ticker: c.s[x], name: c.n[x], exchange: c.x[x] });
      }
      return out;
    }
    /* Aktives Listing zu einem Ticker (Uebernahme alter Browser-Watchlists). */
    function resolveTicker(ticker) {
      var t = String(ticker || "").trim().toUpperCase(), hit = [];
      for (var k = 0; k < c.i.length; k++) if (c.s[k] === t && c.act[k] === 1) hit.push(c.i[k]);
      return hit.length === 1 ? hit[0] : null;
    }
    return { doc: doc, get: get, search: search, resolveTicker: resolveTicker, size: c.i.length };
  }

  /* ----------------------------------------------------------- Aktualitaet */
  /* Ein Handelstag gilt als "faellig", sobald sein Datenlauf ueblicherweise
     veroeffentlicht ist: am Folgetag 06:00 UTC (die Laeufe enden gegen 03:00 UTC). */
  function sessionsDue(sessions, after, now) {
    if (!after) return null;
    var n = 0, t = now.getTime();
    for (var k = 0; k < sessions.length; k++) {
      var s = sessions[k];
      if (s <= after) continue;
      var due = Date.parse(s + "T00:00:00Z") + 30 * 3600 * 1000;
      if (t >= due) n++;
    }
    if (sessions.length && t >= Date.parse(sessions[sessions.length - 1] + "T00:00:00Z") + 30 * 3600 * 1000) return null;
    return n;
  }
  function freshness(doc, sourceId, dateIso, now) {
    var src = doc.sources && doc.sources[sourceId], rule = src && src.freshness;
    if (!src) return { state: "UNAVAILABLE", reason: "SOURCE_MISSING" };
    if (!rule || rule.kind === "none") return { state: "OK", lag: null };
    if (rule.kind === "sessions") {
      var cal = doc.calendar || {}, lag = sessionsDue(cal.sessions || [], dateIso || src.asOf, now);
      if (lag === null) return { state: "STALE", lag: null, reason: "STALE" };
      return { state: lag >= rule.staleAfter ? "STALE" : lag >= rule.warnAfter ? "WARN" : "OK", lag: lag };
    }
    if (rule.kind === "hours") {
      var at = Date.parse(src.generatedAt || src.asOf || "");
      if (!isFinite(at)) return { state: "STALE", reason: "STALE" };
      var h = (now.getTime() - at) / 3600000;
      return { state: h >= rule.staleAfter ? "STALE" : h >= rule.warnAfter ? "WARN" : "OK", ageHours: Math.round(h) };
    }
    return { state: "OK" };
  }

  function unavailable(reason, extra) { var o = { state: "UNAVAILABLE", reason: reason, reasonText: REASON[reason] || reason }; for (var k in extra || {}) o[k] = extra[k]; return o; }
  function why(r, section) { return (r.why && r.why[section]) || "NOT_COVERED"; }

  /* ------------------------------------------------------------- Ansicht */
  function view(ix, item, now) {
    now = now || new Date();
    var doc = ix.doc, r = ix.get(item.instrumentId), src = doc.sources || {};
    var base = { instrumentId: item.instrumentId, tickerAtAdd: item.ticker || null, note: item.note || null, addedAt: item.addedAt || null,
      listId: item.listId || null, alerts: item.alerts || {} };
    if (!r) {
      base.identity = unavailable("NOT_IN_UNIVERSE");
      base.ticker = item.ticker || null; base.name = null;
      ["price", "quant", "high52", "volume", "trend", "supertrader"].forEach(function (s) { base[s] = unavailable("NOT_IN_UNIVERSE"); });
      base.links = []; base.relevance = 0;
      return base;
    }
    var active = r.act === 1;
    base.ticker = r.s; base.name = r.n; base.exchange = r.x; base.currency = r.cu;
    base.identity = { state: active ? "AVAILABLE" : "UNAVAILABLE", listing: active ? "ACTIVE" : "INACTIVE", delistedAt: r.del || null,
      tickerChanged: !!(item.ticker && item.ticker !== r.s), reason: active ? null : "LISTING_INACTIVE",
      reasonText: active ? null : REASON.LISTING_INACTIVE };
    if (!active) {
      ["price", "quant", "high52", "volume", "trend", "supertrader"].forEach(function (s) { base[s] = unavailable("LISTING_INACTIVE"); });
      base.links = []; base.relevance = 0;
      return base;
    }

    // Kurs
    if (!src.price) base.price = unavailable("SOURCE_MISSING");
    else if (!(r.c > 0)) base.price = unavailable(why(r, "price"));
    else {
      var pf = freshness(doc, "price", r.cd, now);
      base.price = { state: pf.state === "STALE" ? "STALE" : "AVAILABLE", close: r.c, currency: r.pu || r.cu, date: r.cd, freshness: pf,
        basis: src.price.basis, kind: "EOD_CLOSE" };
    }

    // Quant: sieben Faktoren mit Stufe, Gesamtscore zurueckgehalten
    var qs = src.quant;
    if (!qs) base.quant = unavailable("SOURCE_MISSING");
    else if (!r.q) base.quant = unavailable(why(r, "quant"));
    else {
      var qf = freshness(doc, "quant", r.qd, now), bands = qs.bands || [];
      var factors = (qs.factorOrder || []).map(function (id, k) {
        var f = r.q[k];
        return f ? { id: id, label: FACTOR_LABEL[id] || id, state: "AVAILABLE", score: f[0], band: f[1] == null ? null : (bands[f[1]] || {}).id || null,
          bandLabel: f[1] == null ? null : (bands[f[1]] || {}).label || null }
          : { id: id, label: FACTOR_LABEL[id] || id, state: "UNAVAILABLE", score: null, band: null, bandLabel: null };
      });
      base.quant = { state: qf.state === "STALE" ? "STALE" : "AVAILABLE", factors: factors, available: factors.filter(function (f) { return f.state === "AVAILABLE"; }).length,
        dataQuality: r.qdq || null, asOf: r.qd || null, marketCap: r.mc, freshness: qf,
        composite: qs.publication && qs.publication.compositeAllowed === true ? { state: "UNAVAILABLE", reason: "NOT_IN_SUMMARY" }
          : { state: "WITHHELD", reason: (qs.publication && qs.publication.reason) || "QUANT_V2_NOT_ACTIVE", reasonText: REASON.COMPOSITE_WITHHELD } };
    }

    // Technik: 52W-Hoch, Volumen, Trend
    var ts = src.technical;
    if (!ts) { base.high52 = base.volume = base.trend = unavailable("SOURCE_MISSING"); }
    else if (!r.td) { base.high52 = base.volume = base.trend = unavailable(why(r, "technical")); }
    else {
      var tf = freshness(doc, "technical", r.td, now);
      /* Der Technikstand des Titels muss der Universumsstand sein (fresh) und die Datei fristgerecht. */
      var stale = tf.state === "STALE" || r.tf !== 1;
      var hs;
      if (stale) hs = { state: "STALE", reason: "STALE", reasonText: REASON.STALE };
      else if (r.h52 === true) hs = { state: "AVAILABLE", signal: "NEW_HIGH", label: "Neues 52-Wochen-Hoch" };
      else if (typeof r.dh === "number" && r.dh >= NEAR_HIGH) hs = { state: "AVAILABLE", signal: "NEAR_HIGH", label: "Nahe 52-Wochen-Hoch" };
      else if (r.h52w === true || r.h52m === true) hs = { state: "AVAILABLE", signal: "RECENT_HIGH", label: r.h52w ? "52W-Hoch auf Wochenschluss" : "52W-Hoch auf Monatsschluss" };
      else if (r.h52 === false) hs = { state: "AVAILABLE", signal: "BELOW", label: "Unter dem 52-Wochen-Hoch" };
      else hs = unavailable("NOT_COVERED");
      if (hs.state !== "UNAVAILABLE") { hs.distance = r.dh; hs.asOf = r.td; hs.freshness = tf; }
      base.high52 = hs;
      base.volume = r.rv == null ? unavailable("NOT_COVERED") : stale ? { state: "STALE", relVol: r.rv, reason: "STALE", reasonText: REASON.STALE }
        : { state: "AVAILABLE", relVol: r.rv, signal: r.vs === true ? "SPIKE" : r.rv >= 1.5 ? "ELEVATED" : "NORMAL",
          label: r.vs === true ? "Volumen ≥ 2× Durchschnitt" : r.rv >= 1.5 ? "Volumen erhöht" : "Volumen normal" };
      base.trend = { state: stale ? "STALE" : "AVAILABLE", structure: r.st || null, aboveSma200: r.a200, rsi14: r.rsi, asOf: r.td };
    }

    // Supertrader: Eignung nur bei freigegebener Strategie
    var ss = src.supertrader;
    if (!ss) base.supertrader = unavailable("SOURCE_MISSING");
    else if (r.sts === null || r.sts === undefined) base.supertrader = unavailable(why(r, "supertrader"));
    else {
      var sf = freshness(doc, "supertrader", ss.asOf, now);
      var entries = r.sts.map(function (e) {
        var meta = ss.strategies[e[0]] || {};
        return { strategyId: e[0], name: meta.name || e[0], state: e[1], stateLabel: (ss.lifecycle || {})[e[1]] || e[1], released: meta.released === true,
          actionable: ACTIONABLE.indexOf(e[1]) >= 0, level: meta.level || null, levelLabel: meta.levelLabel || null,
          presentationLabel: meta.presentationLabel || null };
      });
      var valid = entries.filter(function (e) { return e.released && e.actionable; });
      var st = sf.state === "STALE" ? "STALE" : "AVAILABLE";
      base.supertrader = { state: st, freshness: sf, entries: entries, asOf: ss.asOf,
        status: st === "STALE" ? "STALE" : valid.length ? "VALID_SIGNAL" : entries.length ? "RESEARCH_ONLY" : "NO_SIGNAL",
        label: st === "STALE" ? "Datenstand veraltet" : valid.length ? "Gültiges Supertrader-Signal" : entries.length ? "Forschung · nicht freigegeben" : "Kein offenes Setup" };
    }

    // Produktwelten (eine Adressregel: core/stock-context.js)
    base.links = [];
    if (SC) {
      try {
        var ctx = SC.fromUs(r.s);
        ["discover", "quant", "technical", "technik", "supertrader", "fundamental"].forEach(function (p) {
          if (p === "supertrader" && !r.stp) return;
          var h = SC.href(ctx, p);
          if (h) base.links.push({ product: p, href: h });
        });
      } catch (e) { base.links = []; }
    }
    base.relevance = relevance(base);
    return base;
  }

  /* Rangfolge fuer "Relevanz": nur belegte, aktuelle Ereignisse zaehlen. */
  function relevance(v) {
    var n = 0;
    if (v.supertrader && v.supertrader.status === "VALID_SIGNAL") n += 8;
    if (v.high52 && v.high52.signal === "NEW_HIGH") n += 4;
    if (v.volume && v.volume.signal === "SPIKE") n += 2;
    if (v.high52 && v.high52.signal === "NEAR_HIGH") n += 1;
    return n;
  }

  /* ------------------------------------------------------------ Liste */
  function aggregate(views) {
    var out = { total: views.length, validSupertrader: 0, researchSupertrader: 0, newHighs: 0, nearHighs: 0, volumeSpikes: 0,
      stale: 0, unavailable: 0, delisted: 0, quantBands: {} };
    views.forEach(function (v) {
      if (v.identity.listing === "INACTIVE") out.delisted++;
      if (v.supertrader.status === "VALID_SIGNAL") out.validSupertrader++;
      if (v.supertrader.status === "RESEARCH_ONLY") out.researchSupertrader++;
      if (v.high52.signal === "NEW_HIGH") out.newHighs++;
      if (v.high52.signal === "NEAR_HIGH") out.nearHighs++;
      if (v.volume.signal === "SPIKE") out.volumeSpikes++;
      if ([v.price, v.quant, v.high52, v.supertrader].some(function (s) { return s.state === "STALE"; })) out.stale++;
      if (v.price.state === "UNAVAILABLE") out.unavailable++;
      if (v.quant.state === "AVAILABLE") v.quant.factors.forEach(function (f) {
        var b = out.quantBands[f.id] = out.quantBands[f.id] || { VERY_STRONG: 0, STRONG: 0, NEUTRAL: 0, WEAK: 0, VERY_WEAK: 0, NONE: 0 };
        b[f.band || "NONE"]++;
      });
    });
    return out;
  }

  var SORTS = {
    relevance: function (a, b) { return b.relevance - a.relevance || byName(a, b); },
    company: function (a, b) { return byName(a, b); },
    ticker: function (a, b) { return String(a.ticker || "").localeCompare(String(b.ticker || "")); },
    added: function (a, b) { return String(b.addedAt || "").localeCompare(String(a.addedAt || "")); },
    freshness: function (a, b) { return String(b.price.date || "").localeCompare(String(a.price.date || "")) || byName(a, b); },
    signal: function (a, b) { return rankSignal(b) - rankSignal(a) || byName(a, b); }
  };
  function byName(a, b) { return String(a.name || a.ticker || "").localeCompare(String(b.name || b.ticker || ""), "de"); }
  function rankSignal(v) { return v.supertrader.status === "VALID_SIGNAL" ? 3 : v.supertrader.status === "RESEARCH_ONLY" ? 1 : 0; }
  /* Sortierung nach einem Faktor (kein Gesamtscore): fehlende Werte ans Ende. */
  function factorSort(id) {
    function s(v) { var f = v.quant.state === "AVAILABLE" && v.quant.factors.filter(function (x) { return x.id === id; })[0]; return f && f.score != null ? f.score : -1; }
    return function (a, b) { return s(b) - s(a) || byName(a, b); };
  }
  function sort(views, key) {
    var fn = /^factor:/.test(key) ? factorSort(key.slice(7)) : SORTS[key] || SORTS.relevance;
    return views.slice().sort(fn);
  }
  var FILTERS = {
    all: function () { return true; },
    validSupertrader: function (v) { return v.supertrader.status === "VALID_SIGNAL"; },
    newHigh: function (v) { return v.high52.signal === "NEW_HIGH"; },
    nearHigh: function (v) { return v.high52.signal === "NEW_HIGH" || v.high52.signal === "NEAR_HIGH"; },
    volume: function (v) { return v.volume.signal === "SPIKE" || v.volume.signal === "ELEVATED"; },
    attention: function (v) { return [v.identity, v.price, v.quant, v.high52, v.supertrader].some(function (s) { return s.state !== "AVAILABLE"; }); }
  };
  function filter(views, opts) {
    var q = String((opts && opts.query) || "").trim().toLowerCase(), f = FILTERS[(opts && opts.filter) || "all"] || FILTERS.all;
    return views.filter(function (v) {
      return f(v) && (!q || String(v.ticker || "").toLowerCase().indexOf(q) >= 0 || String(v.name || "").toLowerCase().indexOf(q) >= 0
        || String(v.note || "").toLowerCase().indexOf(q) >= 0);
    });
  }
  var GROUPS = [
    { id: "validSupertrader", label: "Gültiges Supertrader-Signal", test: FILTERS.validSupertrader },
    { id: "newHigh", label: "Neues 52-Wochen-Hoch", test: FILTERS.newHigh },
    { id: "volume", label: "Volumen auffällig", test: function (v) { return v.volume.signal === "SPIKE"; } },
    { id: "nearHigh", label: "Nahe 52-Wochen-Hoch", test: function (v) { return v.high52.signal === "NEAR_HIGH"; } },
    { id: "research", label: "Supertrader-Forschung", test: function (v) { return v.supertrader.status === "RESEARCH_ONLY"; } },
    { id: "attention", label: "Prüfung offen oder nicht verfügbar", test: function (v) { return v.identity.state !== "AVAILABLE" || v.price.state !== "AVAILABLE"; } },
    { id: "rest", label: "Ohne aktuelles Signal", test: function () { return true; } }
  ];
  /* Jede Zeile genau einmal: in der ersten zutreffenden Gruppe. */
  function group(views) {
    var left = views.slice(), out = [];
    GROUPS.forEach(function (g) {
      var hit = left.filter(g.test);
      left = left.filter(function (v) { return hit.indexOf(v) < 0; });
      if (hit.length) out.push({ id: g.id, label: g.label, items: hit });
    });
    return out;
  }

  /* ------------------------------------------------------------ Ereignisse
     Vorbereitung fuer eine spaetere Benachrichtigung (APP_READINESS.md §6):
     Vergleich zweier veroeffentlichter Uebersichten, deterministisch, je
     Instrument EINMAL (nicht je Nutzer). Ereignisse zu veralteten Staenden
     entstehen nicht. Format: core/contracts/events.schema.json. */
  function hash(s) { var h = 0x811c9dc5; for (var k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; } return ("0000000" + h.toString(16)).slice(-8); }
  function events(prevDoc, nextDoc, opts) {
    var prev = index(prevDoc), next = index(nextDoc), now = (opts && opts.now) || new Date(), ids = opts && opts.instrumentIds, out = [];
    var list = ids || nextDoc.cols.i;
    function ev(type, subtype, v, asOf, domain, artifact, evidence, severity) {
      out.push({ schemaVersion: "vu-event-1.0.0", eventId: "ev_" + hash([type, subtype, v.instrumentId, asOf, RULE_VERSION].join("|")) + hash(v.instrumentId + asOf),
        type: type, subtype: subtype, instrumentId: v.instrumentId, securityId: v.ticker ? "ref_" + v.ticker.replace(/[^A-Z0-9]/g, "_") : null,
        ticker: v.ticker, occurredAt: now.toISOString(), asOf: asOf, source: { domain: domain, artifact: artifact, ruleVersion: RULE_VERSION },
        evidence: evidence, severity: severity || "INFO", expiresAt: null });
    }
    list.forEach(function (id) {
      var a = view(prev, { instrumentId: id }, now), b = view(next, { instrumentId: id }, now);
      if (b.identity.state !== "AVAILABLE") return;
      if (b.high52.signal === "NEW_HIGH" && a.high52.signal !== "NEW_HIGH")
        ev("PRICE_EVENT", "NEW_52W_HIGH", b, b.high52.asOf, "technicalWorld", "/technical/data/screener-v1.json", { distanceBefore: a.high52.distance == null ? null : a.high52.distance, distance: b.high52.distance }, "NOTABLE");
      if (b.volume.signal === "SPIKE" && a.volume.signal !== "SPIKE")
        ev("PRICE_EVENT", "VOLUME_SPIKE", b, b.trend.asOf, "technicalWorld", "/technical/data/screener-v1.json", { relVolBefore: a.volume.relVol == null ? null : a.volume.relVol, relVol: b.volume.relVol });
      if (b.supertrader.status === "VALID_SIGNAL" && a.supertrader.status !== "VALID_SIGNAL")
        ev("SUPERTRADER_SIGNAL", "VALID_SIGNAL", b, b.supertrader.asOf, "supertrader", "/supertrader/data/signals-core.json",
          { entries: b.supertrader.entries.filter(function (e) { return e.released && e.actionable; }).map(function (e) { return [e.strategyId, e.state]; }) }, "NOTABLE");
      if (b.quant.state === "AVAILABLE" && a.quant.state === "AVAILABLE") {
        /* "Deutlich": Wechsel um mindestens zwei Stufen (factor-band-2.0.0), nicht jede Nachkommastelle. */
        var order = ["VERY_WEAK", "WEAK", "NEUTRAL", "STRONG", "VERY_STRONG"];
        b.quant.factors.forEach(function (f, k) {
          var g = a.quant.factors[k];
          if (!f.band || !g || !g.band) return;
          var d = order.indexOf(f.band) - order.indexOf(g.band);
          if (Math.abs(d) >= 2) ev("QUANT_CHANGE", d > 0 ? "FACTOR_BAND_UP" : "FACTOR_BAND_DOWN", b, b.quant.asOf, "quant", "/quant/data/product/factor-evidence-v1/",
            { factor: f.id, bandBefore: g.band, band: f.band, scoreBefore: g.score, score: f.score });
        });
        if (a.quant.dataQuality && b.quant.dataQuality && a.quant.dataQuality !== b.quant.dataQuality)
          ev("QUANT_CHANGE", "DATA_QUALITY_CHANGED", b, b.quant.asOf, "quant", "/quant/data/product/factor-evidence-v1/", { before: a.quant.dataQuality, after: b.quant.dataQuality });
      }
    });
    return out;
  }

  return { VERSION: VERSION, SCHEMA: SCHEMA, RULE_VERSION: RULE_VERSION, NEAR_HIGH: NEAR_HIGH, FACTOR_LABEL: FACTOR_LABEL, REASON: REASON,
    PATHS: PATHS, load: load, merge: merge, index: index, freshness: freshness, view: view, aggregate: aggregate, sort: sort, filter: filter, group: group, events: events,
    GROUPS: GROUPS.map(function (g) { return { id: g.id, label: g.label }; }) };
});
