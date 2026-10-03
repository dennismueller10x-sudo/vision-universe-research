/* =========================================================================
   VISION UNIVERSE CORE — diagnose.js

   SELBSTDIAGNOSE JE WERTPAPIER.

   "Die NVDA-Seite ist veraltet - wo ist der Fehler?" Die Kette, die jede
   Aktienseite traegt, wird Glied fuer Glied geprueft, in der Reihenfolge,
   in der die Daten entstehen:

     Identitaet -> Produktuniversum -> Tageskurse -> lange Reihe
       -> Aktienseite (Payload) -> Fundamentals -> Faehigkeiten (Quant)
       -> Intraday

   Das erste kaputte Glied ist die wahrscheinliche Ursache; die Diagnose
   nennt es mit Befund und dem Lauf, der es reparieren wuerde. Es wird
   nichts repariert - Diagnose zuerst.

   Rein bis auf den uebergebenen Loader: load(path) -> Promise<json>.
   Node (scripts/core/diagnose.mjs) und Browser (/status/) teilen sich
   dieselbe Logik.

   UMD: globalThis.VUCore.Diagnose
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.Diagnose = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VERSION = "core-diagnose-1.0.0";
  var Identity = (typeof module === "object" && module.exports) ? require("./identity.js") : (root.VUCore && root.VUCore.Identity);

  var REPAIR = {
    identity: "Ticker pruefen (Grossschrift, Trennzeichen wie beim Anbieter, z. B. BRK-B).",
    universe: "Wertpapierstamm/Produktuniversum neu bauen (scripts/market/build-us-eligibility.mjs; Company Master: universe-master.yml).",
    eod: "Marktdaten-Refresh starten (market-data-refresh.yml). Faellt er erneut, Ablehnungsregister pruefen (classify-rejections.mjs).",
    long: "Lange Reihen neu veroeffentlichen (long-series.yml).",
    payload: "Discover-Daten neu bauen (build-discover-data.mjs, laeuft im Marktdaten-Refresh).",
    fundamentals: "SEC daily/consumer pruefen (sec-fundamentals-daily.yml, sec-consumer-fundamentals.yml); ohne CIK keine Fundamentals.",
    capabilities: "Capability-Matrix neu bauen (build-capability-matrix.mjs + build-product-capabilities.mjs im Refresh).",
    intraday: "Intraday-Takt pruefen (intraday-pacemaker.yml / intraday-delivery-watchdog.yml)."
  };

  function step(id, label) { return { id: id, label: label, status: "OK", detail: null, cause: null, repair: null }; }
  function fail(s, status, detail, cause, repairKey) {
    s.status = status; s.detail = detail; s.cause = cause || detail; s.repair = repairKey ? REPAIR[repairKey] : null; return s;
  }
  async function tryLoad(load, path) {
    try { return { ok: true, data: await load(path) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  /**
   * @param ticker  z. B. "NVDA"
   * @param opts    { load, expectedSession, lagSessions(date, expected) -> n|null, universeId }
   */
  async function diagnose(ticker, opts) {
    opts = opts || {};
    var load = opts.load, universe = opts.universeId || "US_REAL", expected = opts.expectedSession || null;
    var lag = opts.lagSessions || function (a, b) { return a === b ? 0 : null; };
    var steps = [], t = Identity.normalizeTicker(ticker), id = null;

    /* 1 Identitaet */
    var s1 = step("identity", "Identitaet (core/identity.js)");
    steps.push(s1);
    if (!t) { fail(s1, "FAILED", "Kein gueltiger Ticker: " + ticker, "Ungueltiger Ticker", "identity"); return finish(ticker, steps); }
    id = Identity.securityIdForTicker(t);
    s1.detail = t + " -> " + id;

    /* 2 Produktuniversum: Company Master (Instrument) und Discover-Index */
    var s2 = step("universe", "Produktuniversum (Company Master, Discover-Index)");
    steps.push(s2);
    var shard = Identity.shardKey(t);
    var master = await tryLoad(load, "/quant/data/universe/instruments/" + shard + ".json");
    var inst = master.ok ? (master.data.instruments || []).filter(function (i) { return i.symbol === t; }) : [];
    var active = inst.filter(function (i) { return i.active; });
    var index = await tryLoad(load, "/discover/data/stock-index/" + universe + ".json");
    var inIndex = index.ok && (index.data.symbols || []).indexOf(t) >= 0;
    if (!inst.length) fail(s2, "FAILED", "Nicht im Company Master.", "Wertpapier unbekannt oder nicht im Universum", "universe");
    else if (!active.length) fail(s2, "WARN", "Im Company Master nur inaktiv (" + inst.map(function (i) { return i.instrumentId; }).join(", ") + ").", "Als inaktiv/delistet gefuehrt", "universe");
    else if (active.length > 1) fail(s2, "WARN", "Mehrere aktive Instrumente: " + active.map(function (i) { return i.instrumentId + "@" + i.exchange; }).join(", "), "Mehrdeutige Identitaet", "universe");
    else s2.detail = active[0].instrumentId + " · " + (active[0].companyName || "") + " · " + active[0].exchange;
    if (s2.status === "OK" && !inIndex) fail(s2, "WARN", "Im Company Master, aber keine Discover-Aktienseite (nicht im Discover-Index).", "Nicht im Discover-Umfang (Eignung/Policy)", "universe");

    /* 3 Tageskurse */
    var s3 = step("eod", "Tageskurse (discover-series)");
    steps.push(s3);
    var series = await tryLoad(load, "/quant/data/market/discover-series/" + id + ".json");
    var last = null;
    if (!series.ok) fail(s3, "FAILED", "Keine veroeffentlichte Tagesreihe " + id + ".", "Kurse fehlen", "eod");
    else {
      var pts = series.data.points || [];
      last = pts.length ? pts[pts.length - 1] : null;
      var l = expected && series.data.to ? lag(series.data.to, expected) : null;
      s3.detail = "Stand " + series.data.to + (last ? ", Schluss " + last[1] : "") + (l !== null ? " · " + l + " Sitzung(en) zurueck" : "");
      if (!last || !(last[1] > 0)) fail(s3, "FAILED", "Reihe ohne gueltigen letzten Kurs.", "Kursreihe defekt", "eod");
      else if (l !== null && l >= 2) fail(s3, "STALE", s3.detail, "Kurse veraltet (" + l + " Sitzungen)", "eod");
      else if (l === 1) fail(s3, "WARN", s3.detail, "Letzte Sitzung fehlt", "eod");
    }

    /* 4 lange Reihe */
    var s4 = step("long", "Lange Reihe (5J/Max)");
    steps.push(s4);
    var longS = await tryLoad(load, "/quant/data/market/discover-series-long/" + id + ".json");
    if (!longS.ok) fail(s4, "WARN", "Keine Wochenreihe " + id + ".", "5J/Max-Chart leer", "long");
    else s4.detail = "Stand " + longS.data.to + " · " + (longS.data.barCount || (longS.data.points || []).length) + " Wochen";

    /* 5 Aktienseite */
    var s5 = step("payload", "Aktienseite (discover/data/stocks)");
    steps.push(s5);
    var payload = await tryLoad(load, "/discover/data/stocks/" + universe + "/" + t + ".json");
    if (!payload.ok) {
      if (inIndex) fail(s5, "FAILED", "Index nennt die Seite, die Datei fehlt.", "Generierte Aktienseite fehlt", "payload");
      else fail(s5, "SKIPPED", "Keine Discover-Seite (nicht im Umfang).", null, null);
    } else {
      var p = payload.data, price = p.price && p.price.value;
      s5.detail = "Stand " + p.asOf + (typeof price === "number" ? ", Kurs " + price : "") + (p.dataQuality ? " · Qualitaet " + p.dataQuality : "");
      if (last && typeof price === "number" && Math.abs(price / last[1] - 1) > 0.0005) fail(s5, "FAILED", "Seite zeigt " + price + ", Reihe " + last[1] + ".", "Seite und Reihe widersprechen sich (zweite Preiswahrheit)", "payload");
      else if (last && p.asOf && p.asOf < last[0]) fail(s5, "STALE", "Seite Stand " + p.asOf + ", Reihe " + last[0] + ".", "Seite nicht nachgebaut", "payload");
    }

    /* 6 Fundamentals */
    var s6 = step("fundamentals", "Fundamentals (SEC)");
    steps.push(s6);
    var fu = payload.ok ? payload.data.fundamentals : null;
    if (!payload.ok) fail(s6, "SKIPPED", "Ohne Aktienseite nicht pruefbar.", null, null);
    else if (!fu || !fu.available) fail(s6, "WARN", "Keine Fundamentals auf der Seite" + (fu && fu.cik === null ? " (keine CIK)" : "") + ".", "Fundamentals fehlen", "fundamentals");
    else s6.detail = "Stand " + fu.asOf + " · CIK " + fu.cik + (fu.latestFiscalYear ? " · GJ " + fu.latestFiscalYear : "");

    /* 7 Faehigkeiten (Quant) */
    var s7 = step("capabilities", "Faehigkeiten (Quant/Discover)");
    steps.push(s7);
    var caps = await tryLoad(load, "/quant/data/product/capabilities-v1.json");
    if (!caps.ok) fail(s7, "WARN", "Capability-Projektion nicht lesbar.", "Faehigkeiten unbekannt", "capabilities");
    else {
      var row = caps.data.rows && caps.data.rows[t];
      if (!row) fail(s7, "WARN", "Kein Eintrag in capabilities-v1.json.", "Nicht in der Quant-Projektion", "capabilities");
      else {
        var have = [], miss = [];
        (caps.data.capabilities || []).forEach(function (c, i) { ((row[1] >>> i) & 1 ? have : miss).push(c); });
        s7.detail = "vorhanden: " + have.join(", ");
        if (row[0] !== id) fail(s7, "FAILED", "Projektion fuehrt " + row[0] + " statt " + id + ".", "Zweite Identitaet in der Quant-Projektion", "capabilities");
        else if (miss.indexOf("HAS_MARKET_DATA") >= 0) fail(s7, "WARN", "Ohne Marktdaten: " + miss.join(", "), "Quant ohne Kurse", "capabilities");
        else if (miss.length) s7.detail += " · fehlt: " + miss.join(", ");
      }
    }

    /* 8 Intraday */
    var s8 = step("intraday", "Intraday");
    steps.push(s8);
    var intra = await tryLoad(load, "/quant/data/market/intraday/index.json");
    if (!intra.ok) fail(s8, "WARN", "Intraday-Verzeichnis nicht lesbar.", "Intraday unbekannt", "intraday");
    else {
      var e = (intra.data.entries || {})[t];
      if (!e) s8.status = "SKIPPED", s8.detail = "Nicht im Intraday-Umfang (Discover-Flaechen).";
      else {
        s8.detail = "Sitzung " + e.sessionDate + " bis " + (e.lastRegularLocal || "?") + " · " + (e.regularComplete ? "vollstaendig" : "unvollstaendig");
        if (expected && e.sessionDate < expected) fail(s8, "WARN", s8.detail, "Intraday hinter der letzten Sitzung", "intraday");
        else if (opts.marketState && opts.marketState !== "OPEN" && e.sessionDate === expected && !e.regularComplete)
          fail(s8, "WARN", s8.detail, "Tagesverlauf ohne Schluss (Boerse geschlossen)", "intraday");
      }
    }
    return finish(t, steps);
  }

  function finish(ticker, steps) {
    var order = { FAILED: 3, STALE: 2, WARN: 1, OK: 0, SKIPPED: 0 };
    var worst = steps.reduce(function (w, s) { return (order[s.status] || 0) > (order[w.status] || 0) ? s : w; }, steps[0]);
    var firstBad = steps.filter(function (s) { return s.status === "FAILED" || s.status === "STALE"; })[0] ||
                   steps.filter(function (s) { return s.status === "WARN"; })[0] || null;
    return {
      version: VERSION, ticker: ticker,
      status: worst && order[worst.status] ? worst.status : "OK",
      likelyCause: firstBad ? firstBad.cause : null,
      failedStep: firstBad ? firstBad.id : null,
      suggestedRepair: firstBad ? firstBad.repair : null,
      steps: steps
    };
  }

  function formatText(d) {
    var lines = [d.ticker + "  " + d.status];
    d.steps.forEach(function (s) {
      lines.push("  " + (s.label + "                                                  ").slice(0, 52) + s.status + (s.detail ? "  " + s.detail : ""));
    });
    if (d.likelyCause) {
      lines.push("", "Wahrscheinliche Ursache: " + d.likelyCause);
      if (d.suggestedRepair) lines.push("Vorgeschlagene Reparatur: " + d.suggestedRepair);
    }
    return lines.join("\n");
  }

  return { VERSION: VERSION, diagnose: diagnose, formatText: formatText };
});
