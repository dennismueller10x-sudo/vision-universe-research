/* =========================================================================
   VISION UNIVERSE — finra-daily-list.js          (finra-daily-list-1.0.0)

   ZWEITE UNABHAENGIGE CORPORATE-ACTION-QUELLE: FINRA OTC DAILY LIST

   Die FINRA OTC Daily List (api.finra.org, Datensatz otcMarket/
   otcDailyList, ohne Anmeldung) ist die regulatorische Tagesliste der
   FINRA fuer OTC-Aktien: Splits und Reverse Splits mit Verhaeltnis und
   Ex-Tag, Aktiendividenden, Symbol- und Namensaenderungen,
   Marktplatzwechsel (Delisting von NASDAQ/NYSE in den OTC-Handel,
   Listing an einer Boerse), Loeschungen, Konkurs-Kennzeichen.

   Unabhaengig von SEC (keine Emittenten-Einreichung, sondern die
   Veroeffentlichung der Selbstregulierungsorganisation) und vom
   Kursanbieter (Tiingo). Jede Zeile traegt den Veroeffentlichungs-
   zeitpunkt dailyListDatetime: der erste Moment, zu dem die Angabe
   oeffentlich war (PIT). Eine spaetere Aenderungszeile (DC) oder
   Streichung (DD) gilt erst ab ihrer eigenen Veroeffentlichung.

   GRENZEN (gemessen, CORPORATE-ACTION-SOURCE-MANIFEST-V3.json)
     - Abdeckung: OTC-Wertpapiere. Boersennotierte Aktien erscheinen nur
       beim Wechsel in den OTC-Handel oder aus ihm heraus.
     - Zeitraum der API: ab 2018 (einzelne Altzeilen 2016).
     - Identitaet: Symbol + Wertpapierbezeichnung, keine CIK. Ein Symbol
       wird nach Jahren neu vergeben: die Zuordnung verlangt das
       Zeitfenster der Notierung und eine nicht widersprechende
       Bezeichnung.

   Nur Felder, keine Kurse. Kein bekannter Fehlerfall fliesst ein.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "finra-daily-list-1.0.0";
  var SYSTEM = "FINRA_OTC_DAILY_LIST";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function day(d) { return d ? String(d).slice(0, 10) : null; }
  function addDays(d, n) { return new Date(Date.parse(day(d) + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  /** "1:10" -> {newShares: 1, oldShares: 10}; Dezimalstellen erlaubt. */
  function rate(s) {
    var m = /^\s*([\d.]+)\s*:\s*([\d.]+)\s*$/.exec(String(s || ""));
    if (!m) return null;
    var a = Number(m[1]), b = Number(m[2]);
    return a > 0 && b > 0 ? { a: a, b: b } : null;
  }
  /**
   * Verhaeltnis neue Aktien je alte Aktie (splitFactor-Konvention).
   * reverseSplitRate "1:10" = 1 neue fuer 10 alte -> 0,1; forwardSplitRate
   * "3:1" = 3 neue fuer 1 alte -> 3. Beide gesetzt ("Reverse Split followed
   * by Forward Split"): Produkt.
   */
  function ratioOf(row) {
    var rv = rate(row.reverseSplitRate), fw = rate(row.forwardSplitRate), q = null;
    if (rv) q = Math.min(rv.a, rv.b) / Math.max(rv.a, rv.b);
    if (fw) q = (q || 1) * (Math.max(fw.a, fw.b) / Math.min(fw.a, fw.b));
    if (q === null && isNum(Number(row.stockPercentage)) && Number(row.stockPercentage) >= 25 && /stock\s+dividend/i.test(String(row.dailyListReasonDescription || "")))
      q = 1 + Number(row.stockPercentage) / 100;
    return q;
  }
  function kindOf(row) {
    var r = String(row.dailyListReasonDescription || ""), c = String(row.dailyListEventCode || "");
    if (/split/i.test(r) || row.reverseSplitRate || row.forwardSplitRate) return "SPLIT";
    if (/stock\s+dividend/i.test(r) && isNum(Number(row.stockPercentage)) && Number(row.stockPercentage) >= 25) return "SPLIT";
    if (/market\s+center\s+change\s+delisted\s+from/i.test(r)) return "EXCHANGE_DELISTING_TO_OTC";
    if (/market\s+center\s+change\s+listed\s+on/i.test(r)) return "EXCHANGE_LISTING_FROM_OTC";
    if (/market\s+center\s+change/i.test(r)) return "MARKET_CENTER_CHANGE";
    if (/symbol/i.test(r) || row.changeSymbolFlag === "Y") return "SYMBOL_CHANGE";
    if (/bankruptcy|financial\s+status\s+change\s+bankruptcy/i.test(r) || row.bankruptcyFlag === "Y") return "BANKRUPTCY";
    if (/acquisition|merger|amalgamation|exchanged|going\s+private/i.test(r)) return "MERGER_OR_ACQUISITION";
    if (/liquidation|charter\s+cancelled|dissolution|registration\s+revoked/i.test(r)) return "TERMINATION";
    if (/adr|gdr/i.test(r) && (row.oldADROrdinaryShareRate || row.newADROrdnyShareRate)) return "ADR_RATIO_CHANGE";
    if (/name/i.test(r)) return "NAME_CHANGE";
    if (/cash\s+dividend/i.test(r)) return "CASH_DIVIDEND";
    if (c === "SD") return "DELETION";
    if (c === "SA") return "ADDITION";
    return "OTHER";
  }
  /** FINRA-Zeitstempel "2020-07-02 16:57:27.0" (US/Eastern) -> Tag der Veroeffentlichung. */
  function publishedDay(row) { return day(row.dailyListDatetime) || day(row.calendarDay); }

  /**
   * Eine Zeile -> Beobachtung. Eine Streichung (Ereigniscode DD) kennzeichnet
   * cancelled = true; eine Aenderung (DC) ersetzt die frueheren Angaben ab
   * ihrer eigenen Veroeffentlichung.
   */
  function observation(row) {
    var kind = kindOf(row), q = kind === "SPLIT" ? ratioOf(row) : null;
    var adrOld = rate(row.oldADROrdinaryShareRate), adrNew = rate(row.newADROrdnyShareRate);
    var o = {
      system: SYSTEM, id: row.OTCDailyListID != null ? String(row.OTCDailyListID) : null, kind: kind, code: row.dailyListEventCode || null,
      reason: row.dailyListReasonDescription || null, oldSymbol: row.oldSymbolCode || null, newSymbol: row.newSymbolCode || null,
      oldName: row.oldSecurityDescription || null, newName: row.newSecurityDescription || null,
      ratio: isNum(q) && q > 0 ? q : null, exDate: day(row.exDate), publishedAt: row.dailyListDatetime || null, visibleAt: publishedDay(row),
      listDay: day(row.calendarDay), cancelled: row.dailyListEventCode === "DD",
      adrRatioChange: adrOld && adrNew ? (adrNew.a / adrNew.b) / (adrOld.a / adrOld.b) : null
    };
    o.provenance = fnv([o.id, o.kind, o.oldSymbol, o.newSymbol, o.ratio, o.exDate, o.publishedAt, o.code].join("|"));
    return o;
  }

  /** Normalisierte Wertpapierbezeichnung (Gross, ohne Rechtsform und Gattung). */
  var STOP = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|SA|NV|AG|LLC|LP|HOLDINGS?|GROUP|THE|COMMON|STOCK|SHARES?|ORDINARY|CLASS|CL|NEW|ADR|ADS|AMERICAN|DEPOSITARY|SPONSORED|UNSPONSORED|ISSUED|PAR|VALUE|USD|CDA|CANADA|\(.*?\))\b/g;
  function nameTokens(s) {
    return String(s || "").toUpperCase().replace(/&AMP;/g, "&").replace(/\(.*?\)/g, " ").replace(STOP, " ").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(function (t) { return t.length >= 3; });
  }
  /** YES: ein bedeutungstragendes Wort gemeinsam; NO: beide bekannt und keines; UNKNOWN: ein Name fehlt. */
  function nameMatch(a, b) {
    var x = nameTokens(a), y = nameTokens(b);
    if (!x.length || !y.length) return "UNKNOWN";
    for (var i = 0; i < x.length; i++) if (y.indexOf(x[i]) >= 0) return "YES";
    return "NO";
  }

  /**
   * Die FINRA-Beobachtungen einer Notierung: Symbol = Ticker (alt oder neu)
   * und Ex-Tag bzw. Listentag im Notierungsfenster (+-7 Tage), Bezeichnung
   * widerspricht dem Firmennamen nicht. Liefert je Beobachtung die
   * Identitaetsbasis.
   *
   * @param {Array} observations  observation() je Zeile
   * @param {object} listing      {ticker, from, to, name}
   */
  function forListing(observations, listing) {
    var t = String(listing.ticker || "").toUpperCase(), lo = addDays(listing.from, -7), hi = listing.to ? addDays(listing.to, 7) : "9999-12-31";
    var out = [];
    (observations || []).forEach(function (o) {
      if (!o || (String(o.oldSymbol || "").toUpperCase() !== t && String(o.newSymbol || "").toUpperCase() !== t)) return;
      var d = o.exDate || o.listDay || o.visibleAt;
      if (!d || d < lo || d > hi) return;
      var nm = nameMatch(listing.name, o.oldName || o.newName);
      if (nm === "NO") return;
      out.push(Object.assign({}, o, { identity: { basis: ["SYMBOL_IN_LISTING_WINDOW"].concat(nm === "YES" ? ["NAME_MATCH"] : []), nameMatch: nm } }));
    });
    return out.sort(function (a, b) { return String(a.visibleAt).localeCompare(String(b.visibleAt)) || String(a.id).localeCompare(String(b.id)); });
  }

  /**
   * Split-Ereignisse einer Notierung im Format der SEC-Ereignisse
   * (corporate-action-validation.js): je Ex-Tag ein Ereignis, Stufe
   * EFFECTIVE mit Ex-Tag als Handelstag. Mehrere Zeilen desselben Ereignisses
   * (DA, DC, DD) bleiben als observations erhalten; eventAsOf() bildet die
   * Sicht zum Stichtag.
   */
  function splitEvents(listingObservations) {
    var groups = {};
    (listingObservations || []).filter(function (o) { return o.kind === "SPLIT"; }).forEach(function (o) {
      var key = (o.oldSymbol || o.newSymbol || "") + "|" + (o.exDate || o.listDay);
      (groups[key] = groups[key] || []).push(o);
    });
    return Object.keys(groups).sort().map(function (k) {
      var obs = groups[k].sort(function (a, b) { return String(a.publishedAt || a.visibleAt).localeCompare(String(b.publishedAt || b.visibleAt)) || String(a.id).localeCompare(String(b.id)); });
      return Object.assign({ observations: obs, provenanceHash: fnv(obs.map(function (x) { return x.provenance; }).join("|")) }, viewOf(obs));
    });
  }
  /** Sicht aus einer Folge von Beobachtungen: die zuletzt veroeffentlichte gilt; eine Streichung hebt auf. */
  function viewOf(obs) {
    var last = obs[obs.length - 1], first = obs[0];
    var v = { system: SYSTEM, stage: last.cancelled || !last.ratio || !last.exDate ? "CANCELLED_OR_UNDATED" : "EFFECTIVE", ratio: last.cancelled ? null : last.ratio,
      direction: last.ratio ? (last.ratio < 1 ? "REVERSE" : "FORWARD") : null, marketDate: last.cancelled ? null : last.exDate, effectiveDate: null, timing: null,
      visibleAt: first.visibleAt, effectiveVisibleAt: last.cancelled ? null : last.visibleAt, confidence: "HIGH",
      stageVisibleAt: last.cancelled || !last.ratio ? {} : { EFFECTIVE: last.visibleAt },
      sources: obs.map(function (x) { return { system: SYSTEM, form: "OTC_DAILY_LIST", items: [x.code], accession: x.id, filedDate: x.visibleAt, publishedAt: x.publishedAt }; }),
      tickerMentioned: true, identity: last.identity || null };
    return v;
  }
  /** Das Ereignis, wie es vor dem Stichtag veroeffentlicht war (nur Zeilen mit visibleAt STRIKT vor asOf). */
  function eventAsOf(ev, asOf) {
    if (!asOf) return ev;
    var obs = (ev.observations || []).filter(function (x) { return x.visibleAt && x.visibleAt < asOf; });
    if (!obs.length) return null;
    return Object.assign({ observations: obs, provenanceHash: ev.provenanceHash }, viewOf(obs));
  }

  /** Listing-Ereignisse (Marktplatzwechsel, Symbolwechsel, Loeschung, Konkurs) mit Tag und Sichtbarkeit. */
  function listingEvents(listingObservations) {
    return (listingObservations || []).filter(function (o) {
      return ["EXCHANGE_DELISTING_TO_OTC", "EXCHANGE_LISTING_FROM_OTC", "MARKET_CENTER_CHANGE", "SYMBOL_CHANGE", "DELETION", "BANKRUPTCY", "MERGER_OR_ACQUISITION", "TERMINATION", "ADR_RATIO_CHANGE"].indexOf(o.kind) >= 0;
    }).map(function (o) {
      return { system: SYSTEM, kind: o.kind, date: o.exDate || o.listDay || o.visibleAt, visibleAt: o.visibleAt, publishedAt: o.publishedAt, id: o.id, adrRatioChange: o.adrRatioChange, provenance: o.provenance };
    });
  }

  var api = { VERSION: VERSION, SYSTEM: SYSTEM, observation: observation, ratioOf: ratioOf, kindOf: kindOf, nameMatch: nameMatch, nameTokens: nameTokens,
    forListing: forListing, splitEvents: splitEvents, eventAsOf: eventAsOf, listingEvents: listingEvents };
  if (isNode) module.exports = api;
  else global.VUFinraDailyList = api;
})(typeof window !== "undefined" ? window : globalThis);
