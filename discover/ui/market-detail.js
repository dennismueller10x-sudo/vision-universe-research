/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/market-detail.js

   EIN DETAIL-SYSTEM FUER ALLE MARKTINSTRUMENTE (#/maerkte/<SYMBOL>)

   Tracker, Krypto, Edelmetalle, Energie, Renditen, Leitzinsen, Devisen:
   eine Architektur, asset-aware Darstellung. Alles, was die Seite weiss,
   steht im Multi-Asset Product Contract (snapshot.json): Assetklasse,
   Einheit, Waehrung, Sitzung, Historie (history.intervals), Intraday-Pfad,
   Realtime-Faehigkeit, Umrechenbarkeit, Frische, Herkunft.

   WIEDERVERWENDET, NICHT NACHGEBAUT
   - Chart: VUDiscover.MicroChart.renderRange (dieselbe Zeichnung wie die
     Aktienseite), Zeitraeume: VUQuant.SeriesSampling.sliceRange.
   - Frische/Sitzung: VUMultiAssetContract.refresh.
   - Waehrung: VUMultiAssetContract.present / VUFx.layer (nur CONVERTIBLE).
   - Realtime: VUDiscover.LiveHub.live - derselbe VU-Live-Worker wie die
     Aktienseite, nur fuer Tracker (IEX), nur in der regulaeren US-Sitzung.
     "Live" steht nur bei frischem Tick; faellt der Strom weg, zeigt die
     Seite wieder den letzten kanonischen Stand.

   Keine Anbieterlogik, keine Umrechnung von Hand, keine erfundenen Punkte.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var SNAPSHOT = "/quant/data/market/multi-asset/snapshot.json";
  var CONFIG = "/quant/config/multi-asset.json";

  /* Zeitraeume der Detailseite; Schluessel wie history.intervals. */
  var ZEITRAEUME = [
    { id: "1D", label: "1T", lang: "1 Tag" }, { id: "1W", label: "1W", lang: "1 Woche" },
    { id: "1M", label: "1M", lang: "1 Monat" }, { id: "3M", label: "3M", lang: "3 Monate" },
    { id: "1Y", label: "1J", lang: "1 Jahr" }, { id: "5Y", label: "5J", lang: "5 Jahre" },
    { id: "MAX", label: "MAX", lang: "die gesamte Historie" }
  ];
  /* Gewaehlter Zeitraum je Instrument - ueberlebt den Neuaufbau nach
     einem Waehrungswechsel (der Router zeichnet dann neu). */
  var gewaehlt = {};
  var MAX_PUNKTE = 900;

  function M() { return global.VUDiscover.Markets; }
  function MA() { return global.VUMultiAssetContract; }
  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function zahl(v, d) {
    try { return new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
    catch (_) { return v.toFixed(d); }
  }
  function vz(v, text) { return (v > 0 ? "+" : v < 0 ? "−" : "±") + text; }
  function datumText(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }

  /* ------------------------------------------------------------- Semantik */

  function istRendite(c) { return c.quote.unit === "PERCENT"; }
  function istStufen(c) { return c.history.representation === "STEPS"; }

  /** Was fuer ein Instrument ist das - in einem Satz, ohne Anbieter. */
  function instrumentText(c) {
    var i = c.instrument, t = i.subType;
    if (t === "INDEX_TRACKER") return "Börsengehandelter Tracker (ETF) · " + i.name;
    if (t === "INDEX_PRICE") return "Aktienindex · offizieller Indexstand in Punkten";
    if (t === "CRYPTO_SPOT_AGGREGATED") return "Kryptowährung · über mehrere Handelsplätze aggregierter Kurs";
    if (t === "SPOT_METAL") return "Edelmetall · Spotpreis je Feinunze (kein Future, kein ETF)";
    if (t === "SPOT_REFERENCE") return "Rohstoff · Tagesspotpreis als Referenz (kein Future)";
    if (t === "GOVERNMENT_BOND_YIELD_CMT") return "Rendite US-Staatsanleihe · " + i.tenorYears + " Jahre (konstante Laufzeit)";
    if (t === "GOVERNMENT_BOND_YIELD_TERM_STRUCTURE") return "Rendite Bundesanleihe · " + i.tenorYears + " Jahre (Zinsstruktur)";
    if (t === "POLICY_RATE_TARGET_RANGE") return "Leitzins · Zielband der US-Notenbank";
    if (t === "POLICY_RATE_DEPOSIT_FACILITY") return "Leitzins · Einlagesatz der EZB";
    if (t === "OVERNIGHT_REFERENCE_RATE") return "Referenzzins · tatsächlicher Tagesgeldsatz am Markt";
    if (t === "FX_REFERENCE_FIXING") return "Devisen · Referenzkurs der EZB, einmal je Handelstag";
    return i.family || i.assetClass;
  }

  var FREQUENZ = { INTRADAY: "mehrmals täglich (5-Minuten-Kurse, Abruf alle 3 Stunden)", DAILY: "einmal je Handelstag",
                   EVENT: "bei jedem Beschluss" };

  /** "Warum ist das wichtig?" - Einordnung, keine Kausalbehauptung, keine Beratung. */
  function warumWichtig(c) {
    var i = c.instrument, a = i.assetClass;
    if (c.tracker) return "Der Tracker bildet die Bewegung des Markts „" + c.tracker.displayMarketName + "“ ab. Viele Anleger nutzen ihn als Maßstab dafür, wie sich dieser Markt insgesamt entwickelt.";
    if (a === "INDEX") return "Der Nikkei 225 zeigt die Entwicklung großer japanischer Unternehmen und ist ein wichtiger Blick auf Asien.";
    if (a === "CRYPTO") return "Kryptowährungen handeln rund um die Uhr und schwanken oft deutlich stärker als Aktien.";
    if (i.symbol === "XAUUSD") return "Gold wird häufig als defensiver Vermögenswert beobachtet – ob es in einer bestimmten Phase so wirkt, zeigt erst der Verlauf.";
    if (a === "PRECIOUS_METAL") return "Edelmetalle werden sowohl als Wertanlage als auch in der Industrie nachgefragt.";
    if (a === "COMMODITY") return "Energiepreise beeinflussen Kosten für Unternehmen und Verbraucher und werden deshalb auch mit Blick auf die Inflation beobachtet.";
    if (a === "YIELD") return "Steigende Renditen können Finanzierung verteuern und die Bewertung wachstumsstarker Aktien beeinflussen. Eine Rendite ist für sich weder gut noch schlecht.";
    if (a === "RATE") return "Leitzinsen bestimmen, wie teuer Geld für Banken ist – und wirken damit auf Kredite, Sparzinsen und Anleiherenditen.";
    if (a === "FX") return "Der Euro-Dollar-Kurs bestimmt, was Kurse aus den USA in Euro wert sind.";
    return null;
  }

  /* ------------------------------------------------------------ Zeitraeume */

  /**
   * Welche Zeitraeume traegt der Vertrag wirklich?
   * 1T nur mit echtem Intraday-Pfad; alle anderen aus history.intervals.
   * @returns {Array} [{id,label,lang,state:"AVAILABLE"|"UNAVAILABLE"}]
   */
  function zeitraeume(c) {
    var iv = (c.history && c.history.intervals) || {};
    return ZEITRAEUME.map(function (z) {
      var ok = z.id === "1D" ? !!(c.history.intradayPath && c.capabilities && c.capabilities.intraday && iv["1D"]) : !!iv[z.id];
      return { id: z.id, label: z.label, lang: z.lang, state: ok ? "AVAILABLE" : "UNAVAILABLE" };
    });
  }

  function standardZeitraum(c, liste) {
    var vorher = gewaehlt[c.instrument.symbol];
    var frei = liste.filter(function (z) { return z.state === "AVAILABLE"; }).map(function (z) { return z.id; });
    if (vorher && frei.indexOf(vorher) !== -1) return vorher;
    if (frei.indexOf("1D") !== -1 && (c.tracker || c.instrument.assetClass === "CRYPTO")) return "1D";
    if (frei.indexOf("1Y") !== -1) return "1Y";
    return frei[frei.length - 1] || null;
  }

  /* ---------------------------------------------------------------- Reihen */

  /** Stufenreihe [datum, unten, oben] -> gezeichnete Treppe der Obergrenze (bzw. des Satzes). */
  function treppe(points, bis) {
    var out = [];
    points.forEach(function (p, i) {
      var v = isNum(p[2]) ? p[2] : p[1];
      if (i > 0) out.push([p[0], out[out.length - 1][1]]);
      out.push([p[0], v]);
    });
    if (out.length && bis && bis > out[out.length - 1][0]) out.push([bis, out[out.length - 1][1]]);
    return out;
  }

  function ausduennen(p) {
    if (p.length <= MAX_PUNKTE) return p;
    var k = Math.ceil(p.length / MAX_PUNKTE), out = [];
    for (var i = 0; i < p.length - 1; i += k) out.push(p[i]);
    out.push(p[p.length - 1]);
    return out;
  }

  /** Letzte Sitzung (Tracker, New Yorker Datum) bzw. letzte 24 Stunden (24/7, 24/5). */
  function intradayFenster(c, points) {
    if (!points.length) return [];
    var letzte = points[points.length - 1][0];
    if (c.tracker) {
      var tag = nyDatum(letzte);
      return points.filter(function (p) { return nyDatum(p[0]) === tag; });
    }
    var ab = Date.parse(letzte) - 24 * 3600 * 1000;
    return points.filter(function (p) { return Date.parse(p[0]) >= ab; });
  }
  function nyDatum(iso) {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)); }
    catch (_) { return String(iso).slice(0, 10); }
  }
  function uhrzeit(iso, zone) {
    try { return new Intl.DateTimeFormat("de-DE", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
    catch (_) { return String(iso).slice(11, 16); }
  }

  /**
   * Monetaere Reihen in die Anzeigewaehrung - ausschliesslich ueber den
   * Currency Core: Tagesreihen mit historischem Kurs (layer.series),
   * Intraday-Punkte je Punkt ueber layer.price. Ohne Kurs bleibt die
   * Originalwaehrung (und die Seite sagt es).
   */
  function inAnzeige(c, points, intraday) {
    var L = global.VUFx && global.VUFx.layer;
    var nativ = c.quote.nativeCurrency;
    var aus = { points: points, currency: nativ, converted: false };
    if (!L || c.capabilities.currencyConversion !== "CONVERTIBLE" || !nativ) return aus;
    var ziel = L.preference && L.preference.get ? L.preference.get() : nativ;
    if (!ziel || ziel === nativ) return aus;
    if (intraday) {
      var conv = points.map(function (p) {
        var m = L.price(p[1], nativ, { displayCurrency: ziel });
        return m && m.available && m.display && isNum(m.display.value) ? [p[0], m.display.value] : null;
      });
      if (conv.some(function (x) { return !x; })) return aus;
      return { points: conv, currency: ziel, converted: true };
    }
    var r = L.series(points, nativ, { displayCurrency: ziel });
    if (!r || !r.available || !r.points || r.points.length < 2) return aus;
    return { points: r.points.map(function (p) { return [p.date, p.display]; }), currency: r.displayCurrency, converted: true };
  }

  /* ------------------------------------------------------------------ Kopf */

  function kopf(c, layer) {
    var Mk = M(), k = Mk.kopfText(c);
    var eyebrow = c.tracker ? "Markt · Tracker · " + c.instrument.symbol : k.klasse + " · " + c.instrument.symbol;
    var wert = Mk.wertText(c, layer);
    var ver = Mk.veraenderungText(c);
    var richtung = c.quote.change && c.quote.change.semantics === "PERCENT_OF_VALUE" ? (c.quote.change.percent || 0) : 0;
    var neutral = !!(c.quote.change && c.quote.change.semantics === "BASIS_POINTS");
    var wertNode = el("p", { class: "dx-md-wert", text: wert || "–" });
    var verNode = el("b", { text: ver || "" });
    var verZeile = el("p", { class: "dx-md-veraenderung " + (neutral ? "is-neutral" : richtung > 0 ? "is-up" : richtung < 0 ? "is-down" : "is-flat") },
                      [verNode, el("span", { text: " " + (Mk.referenzText ? Mk.referenzText(c) || "" : "") })]);
    var frische = el("span", { class: "dx-md-frische is-" + c.data.freshness.state.toLowerCase(), text: Mk.frischeText(c) });
    var markt = Mk.marktText(c);
    var stand = Mk.standText(c.quote.asOf);
    var status = el("p", { class: "dx-md-status" }, [
      frische,
      markt ? el("span", { class: "dx-md-markt", text: markt }) : null,
      stand ? el("span", { class: "dx-md-stand", text: (c.market.sessionProfile === "POLICY_EVENT" ? "gültig seit " : "Stand ") + stand }) : null,
      c.data.provenance && c.data.provenance.attribution ? el("span", { class: "dx-md-quelle", text: c.data.provenance.attribution }) : null
    ].filter(Boolean));
    var teile = [
      el("p", { class: "dx-md-eyebrow", text: eyebrow }),
      el("h1", { text: k.titel }),
      el("p", { class: "dx-md-typ", text: instrumentText(c) }),
      wertNode, verZeile, status
    ];
    if (c.tracker) teile.push(trackerBox(c));
    return { node: el("header", { class: "dx-md-kopf" }, teile), wert: wertNode, veraenderung: verNode, verZeile: verZeile, frische: frische };
  }

  function trackerBox(c) {
    return el("div", { class: "dx-md-tracker", role: "note" }, [
      el("dl", {}, [
        el("dt", { text: "Markt" }), el("dd", { text: c.tracker.displayMarketName }),
        el("dt", { text: "Tracker" }), el("dd", { text: c.instrument.symbol }),
        el("dt", { text: "Instrument" }), el("dd", { text: c.instrument.name })
      ]),
      el("p", { text: "Dieser Markt wird über einen börsengehandelten Tracker dargestellt. Der angezeigte Preis ist der Anteilspreis von " +
        c.instrument.symbol + " und nicht der offizielle Indexstand." + (c.proxy && c.proxy.currencyNote ? " " + c.proxy.currencyNote + "." : "") })
    ]);
  }

  /* ----------------------------------------------------------------- Chart */

  /** Wortlaut der Zeitraum-Performance - beim Tracker ETF-Performance, bei Renditen bp. */
  function performanceText(c, pts, z) {
    if (pts.length < 2) return null;
    var a = pts[0][1], b = pts[pts.length - 1][1];
    var wer = c.tracker ? "Der " + c.instrument.symbol + "-Tracker" : (c.instrument.nameDe || c.instrument.name);
    var ueber = z.id === "1D" ? (c.tracker ? "seit Sitzungsbeginn" : "in den letzten 24 Stunden") : "über " + z.lang;
    if (istRendite(c)) {
      var bp = (b - a) * 100;
      return { text: wer + " " + ueber + ": " + vz(bp, zahl(Math.abs(bp), 0) + " bp"), wert: bp, neutral: true };
    }
    if (!(a > 0)) return null;
    var p = 100 * (b / a - 1);
    return { text: wer + " " + ueber + ": " + vz(p, zahl(Math.abs(p), 2) + " %"), wert: p, neutral: false };
  }

  function chartBereich(c, ctx) {
    var MC = global.VUDiscover.MicroChart, SS = global.VUQuant && global.VUQuant.SeriesSampling;
    var liste = zeitraeume(c);
    var aktiv = standardZeitraum(c, liste);
    var box = el("div", { class: "dx-md-chart" });
    var kopfzeile = el("div", { class: "dx-md-chart-kopf" });
    var leiste = el("div", { class: "dx-tf dx-md-tf", role: "group", "aria-label": "Zeitraum" });
    var fuss = el("p", { class: "dx-md-chart-fuss" });
    var cache = { tage: null, intraday: null };
    var live = { punkte: [] };

    function laden(id) {
      if (id === "1D") {
        if (cache.intraday) return Promise.resolve(cache.intraday);
        return S.loadJSON(c.history.intradayPath).then(function (d) { cache.intraday = (d && d.points) || []; return cache.intraday; });
      }
      if (cache.tage) return Promise.resolve(cache.tage);
      return S.loadJSON(c.history.path).then(function (d) {
        var p = (d && d.points) || [];
        cache.tage = istStufen(c) ? treppe(p, c.history.observedThrough || c.history.availableTo) : p;
        return cache.tage;
      });
    }

    function zeichnen() {
      var z = liste.filter(function (x) { return x.id === aktiv; })[0];
      Array.prototype.forEach.call(leiste.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-range") === aktiv)); });
      if (!z) { S.clear(box); box.appendChild(el("p", { class: "dx-md-leer", text: "Für dieses Instrument liegt keine Historie vor." })); return Promise.resolve(); }
      return laden(aktiv).then(function (roh) {
        if (ctx.isActive && !ctx.isActive()) return;
        var pts, von, bis, teil = false;
        if (aktiv === "1D") {
          pts = intradayFenster(c, roh.filter(function (p) { return isNum(p[1]); })).concat(live.punkte);
        } else {
          var basis = roh.filter(function (p) { return isNum(p[1]); });
          var sel = SS ? SS.sliceRange(basis, aktiv, basis.length ? basis[basis.length - 1][0] : undefined) : { points: basis, complete: true };
          pts = sel.points; teil = sel.complete === false;
        }
        var anzeige = inAnzeige(c, pts, aktiv === "1D");
        pts = ausduennen(anzeige.points);
        S.clear(box); S.clear(kopfzeile);
        if (pts.length < 2) { box.appendChild(el("p", { class: "dx-md-leer", text: "Für diesen Zeitraum liegen keine Daten vor." })); fuss.textContent = ""; return; }
        von = pts[0][0]; bis = pts[pts.length - 1][0];
        var perf = performanceText(c, pts, z);
        if (perf) kopfzeile.appendChild(el("p", { class: "dx-md-perf " + (perf.neutral ? "is-neutral" : perf.wert > 0 ? "is-up" : perf.wert < 0 ? "is-down" : "is-flat"), text: perf.text }));
        var zone = c.tracker ? "America/New_York" : "Europe/Berlin";
        var tagVon = nyOderLokal(von, zone), tagBis = nyOderLokal(bis, zone);
        kopfzeile.appendChild(el("p", { class: "dx-md-spanne", text: aktiv === "1D"
          ? (tagVon === tagBis ? datumText(tagVon) + ", " + uhrzeit(von, zone) + "–" + uhrzeit(bis, zone)
                               : datumText(tagVon) + ", " + uhrzeit(von, zone) + " – " + datumText(tagBis) + ", " + uhrzeit(bis, zone)) +
            " Uhr" + (c.tracker ? " New Yorker Zeit" : "")
          : datumText(von) + " bis " + datumText(bis) + (teil ? " · kürzerer Zeitraum verfügbar" : "") }));
        var mobil = global.matchMedia && global.matchMedia("(max-width: 760px)").matches;
        var svg = MC.renderRange(pts, { width: mobil ? 390 : 1040, height: mobil ? 260 : 380, symbol: c.instrument.symbol,
          range: aktiv === "1D" ? "1W" : aktiv === "3M" ? "6M" : aktiv, label: z.lang, log: istRendite(c) ? false : undefined });
        if (!svg) { box.appendChild(el("p", { class: "dx-md-leer", text: "Für diesen Zeitraum liegen keine Daten vor." })); return; }
        if (aktiv === "1D") {
          var daten = svg.querySelectorAll(".dx-range-date"), t0 = Date.parse(von), t1 = Date.parse(bis);
          Array.prototype.forEach.call(daten, function (n, i) { n.textContent = uhrzeit(new Date(t0 + (t1 - t0) * i / (daten.length - 1)).toISOString(), zone); });
        }
        if (istRendite(c)) svg.setAttribute("data-direction", "neutral");
        svg.setAttribute("aria-label", (c.tracker ? c.instrument.symbol + "-Tracker" : (c.instrument.nameDe || c.instrument.symbol)) + ": Verlauf " +
          z.lang + " von " + von.slice(0, 16).replace("T", " ") + " bis " + bis.slice(0, 16).replace("T", " "));
        box.appendChild(svg);
        fuss.textContent = achsenText(c, anzeige) + (aktiv === "1D" ? " · 5-Minuten-Kurse" + (live.punkte.length ? ", ergänzt um Live-Kurse" : "") : istStufen(c) ? " · jeder Schritt ist ein Beschluss" : " · Tageswerte") +
          (c.tracker && aktiv !== "1D" ? " · Kurs split-bereinigt, ohne Ausschüttungen" : "");
      }).catch(function () {
        if (ctx.isActive && !ctx.isActive()) return;
        S.clear(box); box.appendChild(el("p", { class: "dx-md-leer", text: "Der Verlauf konnte gerade nicht geladen werden." }));
      });
    }

    liste.forEach(function (z) {
      var b = el("button", { type: "button", "data-range": z.id, "aria-pressed": String(z.id === aktiv), text: z.label,
        disabled: z.state !== "AVAILABLE", title: z.state === "AVAILABLE" ? z.lang : "Für " + z.lang + " liegen keine Daten vor" });
      b.onclick = function () { if (z.state !== "AVAILABLE" || aktiv === z.id) return; aktiv = z.id; gewaehlt[c.instrument.symbol] = z.id; zeichnen(); };
      leiste.appendChild(b);
    });

    return {
      node: el("section", { class: "dx-md-chartbereich", "aria-label": "Verlauf" }, [kopfzeile, leiste, box, fuss]),
      zeichnen: zeichnen,
      livePunkt: function (iso, wert) {
        if (aktiv !== "1D") return;
        var letzter = live.punkte[live.punkte.length - 1];
        if (letzter && letzter[0] >= iso) return;
        live.punkte.push([iso, wert]); if (live.punkte.length > 400) live.punkte.shift();
        zeichnen();
      }
    };
  }
  function nyOderLokal(iso, zone) {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)); }
    catch (_) { return iso.slice(0, 10); }
  }

  function achsenText(c, anzeige) {
    var q = c.quote;
    if (q.unit === "PERCENT") return c.instrument.assetClass === "RATE"
      ? "Achse: Zinssatz in %" + (q.valueKind === "RANGE" ? " (Obergrenze des Zielbands)" : "") + " – nicht umgerechnet"
      : "Achse: Rendite in % – nicht umgerechnet";
    if (q.unit === "INDEX_POINTS") return "Achse: Indexpunkte – nicht umgerechnet";
    if (q.unit === "FX_RATE") return "Achse: US-Dollar je Euro";
    var je = { PRICE_PER_SHARE: " je Anteil", PRICE_PER_OUNCE: " je Feinunze", PRICE_PER_BARREL: " je Barrel", PRICE_PER_MMBTU: " je MMBtu" }[q.unit] || "";
    return "Achse: " + anzeige.currency + je + (anzeige.converted ? " (umgerechnet aus " + q.nativeCurrency + ")" : "");
  }

  /* ---------------------------------------------------------------- Fakten */

  function fakten(c, stufen) {
    var q = c.quote, h = c.history, zeilen = [];
    function z(k, v) { if (v) zeilen.push(el("dt", { text: k }), el("dd", { text: v })); }
    z("Instrument", instrumentText(c));
    z("Einheit", q.unit === "PERCENT" ? "Prozent; Veränderung in Basispunkten (1 bp = 0,01 Prozentpunkte)" :
      q.unit === "INDEX_POINTS" ? "Indexpunkte" : q.unit === "FX_RATE" ? "US-Dollar je Euro" :
      (q.nativeCurrency || "") + (q.unitDisplay ? " " + q.unitDisplay : "") + " (Originalwährung)" +
      (c.capabilities.currencyConversion === "CONVERTIBLE" ? "; Anzeige in der gewählten Währung" : ""));
    z("Aktualisierung", c.capabilities.intraday && c.history.intradayPath
      ? "Tageswerte und 5-Minuten-Kurse (Abruf alle 3 Stunden)" + (c.capabilities.realtimeCapability ? ", live während der regulären US-Sitzung" : "")
      : (FREQUENZ[c.data.frequency] || c.data.frequency));
    z("Handel", c.market.sessionProfile === "CRYPTO_24_7" ? "Rund um die Uhr, auch am Wochenende" :
      c.market.sessionProfile === "US_EQUITY_ETF" ? "US-Börsensitzung 09:30–16:00 New York" :
      c.market.sessionProfile === "METALS_OTC_24_5" ? "Außerbörslich, werktags rund um die Uhr" :
      c.market.sessionProfile === "POLICY_EVENT" ? "Beschluss der Notenbank – kein Handel" :
      c.market.sessionProfile === "REFERENCE_DAILY" ? "Veröffentlichter Tageswert – kein laufender Handel" : null);
    z("Historie", h.available ? "ab " + datumText(h.availableFrom) + " (" + zahl(h.observations, 0) + " Werte)" : null);
    if (stufen) { z("Letzte Änderung", stufen.text); z("Gilt seit", datumText(stufen.seit)); }
    z("Realtime", c.capabilities.realtimeCapability ? "Live-Kurse während der regulären US-Sitzung" : "Keine Live-Kurse – angezeigt wird der letzte veröffentlichte Stand");
    return el("section", { class: "dx-md-fakten", "aria-label": "Was hier gezeigt wird" }, [el("h2", { text: "Was hier gezeigt wird" }), el("dl", {}, zeilen)]);
  }

  /** Letzte Zinsentscheidung aus der Stufenreihe. */
  function letzteAenderung(punkte) {
    var p = (punkte || []).filter(function (x) { return x && isNum(isNum(x[2]) ? x[2] : x[1]); });
    if (p.length < 2) return null;
    var v = function (x) { return isNum(x[2]) ? x[2] : x[1]; };
    var a = p[p.length - 2], b = p[p.length - 1];
    var bp = Math.round((v(b) - v(a)) * 100);
    return { seit: b[0], bp: bp, text: vz(bp, zahl(Math.abs(bp), 0) + " bp") + " am " + datumText(b[0]) };
  }

  /* ---------------------------------------------------------------- Live */

  /**
   * Tracker: derselbe Strom wie auf der Aktienseite. Nur ein frischer Tick
   * waehrend der regulaeren Sitzung macht "Live"; sonst bleibt der
   * kanonische Stand stehen (und kehrt zurueck, wenn der Tick altert).
   */
  function liveAnbinden(c, k, chart, layer) {
    var Hub = global.VUDiscover.LiveHub;
    if (!c.tracker || !c.capabilities.realtimeCapability || !Hub || !Hub.live) return function () {};
    var ch = c.quote.change;
    var referenz = ch && isNum(ch.absolute) && isNum(c.quote.value) ? c.quote.value - ch.absolute : null;
    var basis = { wert: k.wert.textContent, ver: k.veraenderung.textContent, frische: k.frische.textContent, klasse: k.frische.className, verKlasse: k.verZeile.className };
    var warLive = false;
    return Hub.live(c.instrument.symbol, function (p) {
      var l = p && p.live;
      if (l && l.fresh && isNum(l.price)) {
        warLive = true;
        var anzeige = inAnzeige(c, [[l.at, l.price]], true);
        var F = global.VUFx && global.VUFx.Format;
        k.wert.textContent = F ? F.formatPrice(anzeige.points[0][1], anzeige.currency, { decimals: 2 }) : zahl(anzeige.points[0][1], 2) + " " + anzeige.currency;
        if (isNum(referenz) && referenz > 0) {
          var pr = 100 * (l.price / referenz - 1);
          k.veraenderung.textContent = vz(pr, zahl(Math.abs(pr), 2) + " %");
          k.verZeile.className = "dx-md-veraenderung " + (pr > 0 ? "is-up" : pr < 0 ? "is-down" : "is-flat");
        }
        k.frische.textContent = "Markt geöffnet · Live";
        k.frische.className = "dx-md-frische is-live";
        chart.livePunkt(l.at, l.price);
      } else if (warLive) {
        warLive = false;
        k.wert.textContent = basis.wert; k.veraenderung.textContent = basis.ver;
        k.frische.textContent = basis.frische; k.frische.className = basis.klasse; k.verZeile.className = basis.verKlasse;
      }
    });
  }

  /* --------------------------------------------------------------- Render */

  function weitere(c, alle) {
    var Mk = M();
    var gruppe = (Mk.GRUPPEN || []).filter(function (g) { return g.symbole.indexOf(c.instrument.symbol) !== -1; })[0];
    if (!gruppe) return null;
    var links = gruppe.symbole.filter(function (s) { return s !== c.instrument.symbol; }).map(function (s) {
      var x = alle.filter(function (y) { return y.instrument.symbol === s; })[0];
      if (!x || x.quote.state !== "AVAILABLE") return null;
      return el("a", { class: "dx-md-chip", href: "#/maerkte/" + encodeURIComponent(s), text: Mk.kopfText(x).titel });
    }).filter(Boolean);
    if (!links.length) return null;
    return el("nav", { class: "dx-md-weiter", "aria-label": "Weitere " + gruppe.titel }, [el("h2", { text: "Weitere " + gruppe.titel }), el("div", {}, links)]);
  }

  /**
   * @param {HTMLElement} root
   * @param {string} symbol
   * @param {object} ctx {calendar, isActive}
   * @returns {Promise<function|undefined>} Aufraeumen (Live-Abo kuendigen)
   */
  function render(root, symbol, ctx) {
    ctx = ctx || {};
    var sym = String(symbol || "").toUpperCase();
    return Promise.all([S.loadJSON(SNAPSHOT), S.loadJSON(CONFIG).catch(function () { return null; })]).then(function (r) {
      if (ctx.isActive && !ctx.isActive()) return;
      var snap = r[0], cfg = r[1] || {};
      var jetzt = new Date();
      var alle = snap.instruments.map(function (c) { return MA().refresh(c, { now: jetzt, calendar: ctx.calendar, config: cfg }); });
      var c = alle.filter(function (x) { return x.instrument.symbol === sym || x.instrument.instrumentId === symbol; })[0];
      var zurueck = el("a", { class: "dx-back", href: "#/maerkte", text: "← Märkte" });
      if (!c || c.quote.state !== "AVAILABLE") {
        root.appendChild(el("div", { class: "dx-page dx-md" }, [zurueck, el("h1", { text: "Kein Marktdetail" }),
          el("p", { class: "dx-md-leer", text: c ? (M().kopfText(c).titel + ": für dieses Instrument liegt kein belegbarer Wert vor.") : "Dieses Instrument führt der Datenkern nicht." })]));
        return;
      }
      var layer = global.VUFx && global.VUFx.layer;
      var k = kopf(c, layer);
      var chart = chartBereich(c, ctx);
      var stufen = istStufen(c) ? letzteAenderung(c.history.recent) : null;
      var warum = warumWichtig(c);
      var seite = el("article", { class: "dx-page dx-md", "data-instrument": c.instrument.symbol, "data-asset-class": c.instrument.assetClass,
                                  "data-proxy": c.proxy && c.proxy.isProxy ? "tracker" : "none" }, [
        zurueck, k.node, chart.node,
        warum ? el("section", { class: "dx-md-warum" }, [el("h2", { text: "Warum ist das wichtig?" }), el("p", { text: warum })]) : null,
        fakten(c, stufen),
        weitere(c, alle),
        el("p", { class: "dx-md-hinweis", text: "Informationen zur eigenen Recherche, keine Anlageberatung." })
      ].filter(Boolean));
      root.appendChild(seite);
      document.title = M().kopfText(c).titel + (c.tracker ? " (Tracker " + c.instrument.symbol + ")" : "") + " — Märkte — Discover";
      chart.zeichnen();
      return liveAnbinden(c, k, chart, layer);
    });
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.MarketDetail = {
    render: render, zeitraeume: zeitraeume, standardZeitraum: standardZeitraum, treppe: treppe,
    intradayFenster: intradayFenster, performanceText: performanceText, instrumentText: instrumentText,
    letzteAenderung: letzteAenderung, warumWichtig: warumWichtig, achsenText: achsenText
  };
})(typeof window !== "undefined" ? window : globalThis);
