/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/markets.js

   MÄRKTE (Multi-Asset Data Core §53, §54)

   Eine Seite, die auf einen Blick sagt, wo Aktienmaerkte, Rohstoffe,
   Krypto, Zinsen und Devisen stehen - und nichts behauptet, was die Daten
   nicht tragen.

   WAS DIESE DATEI NICHT TUT

   Sie kennt keinen Anbieter, holt keinen Kurs und rechnet keine Waehrung
   um. Sie liest den Product Contract des Data Core
   (/quant/data/market/multi-asset/snapshot.json), bewertet die Frische
   zur Anzeigezeit mit VUMultiAssetContract.refresh() und laesst
   monetaere Werte vom Currency Core (VUFx.layer) in die Anzeigewaehrung
   bringen. Punkte, Prozent und Zinssaetze bleiben, was sie sind.

   MARKT-TRACKER (Owner-Entscheidung 2026-09-25, Tiingo-first)

   Aktienmaerkte erscheinen ueber boersengehandelte Tracker (QQQ, SPY,
   DIA ...). Eine Karte nennt den Markt ("Nasdaq 100") und daneben
   sichtbar den Tracker ("Tracker · QQQ"); der Wert ist der Kurs des
   Trackers in Waehrung, nie Indexpunkte. Ein Index ohne eigene Quelle,
   dessen Markt ein Tracker zeigt, erscheint nicht zusaetzlich als leere
   Karte.

   GRUPPEN (Owner-Ergaenzung 2026-09-25)

   Aktienmaerkte, Energie, Edelmetalle, Krypto, US-Renditen,
   Europa-Renditen, Leitzinsen, Devisen - ausschliesslich Instrumente,
   die der Core bereits fuehrt. Die Seite waehlt aus und ordnet; Wert,
   Einheit, Frische und Marktzustand kommen aus dem Vertrag.

   KEINE FALSCHE VERGLEICHBARKEIT

   Eine Rendite bewegt sich in Basispunkten, ein Index in Prozent. Die
   Karten stehen deshalb in Gruppen je Assetklasse, und jede Veraenderung
   traegt ihre Einheit ("+15 bp" ist kein "+15 %").
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var SNAPSHOT = "/quant/data/market/multi-asset/snapshot.json";
  var CONFIG = "/quant/config/multi-asset.json";
  /* Markets 2.0: der deskriptive Market Pulse (Core-Artefakt) und seine
     versionierten Schwellen. Discover rechnet daraus nichts neu. */
  var PULSE = "/quant/data/market/intelligence/market-pulse.json";
  var PULSE_CONFIG = "/quant/config/market-pulse.json";
  /* Markets 3.0: Verlauf des Marktumfelds (point in time, Core-Artefakt). */
  var PULSE_HISTORY = "/quant/data/market/intelligence/market-pulse-history.json";

  /* Die Gruppen der Seite, je Assetklasse und Region. Nur Instrumente,
     die der Core fuehrt und freigibt; die Klasse ist Schutz gegen einen
     falsch einsortierten Eintrag (ein Tracker ist nie eine Rendite). */
  var GRUPPEN = [
    { id: "aktien", titel: "Aktienmärkte", klassen: ["INDEX", "ETF"],
      symbole: ["QQQ", "SPY", "DIA", "N225", "IWM", "FEZ", "URTH"] },
    { id: "energie", titel: "Energie", klassen: ["COMMODITY"], symbole: ["WTI", "BRENT", "NATGAS"] },
    { id: "edelmetalle", titel: "Edelmetalle", klassen: ["PRECIOUS_METAL"], symbole: ["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"] },
    { id: "krypto", titel: "Krypto", klassen: ["CRYPTO"], symbole: ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD"] },
    { id: "us-renditen", titel: "US-Renditen", klassen: ["YIELD"], symbole: ["US2Y", "US5Y", "US10Y", "US30Y"] },
    { id: "eu-renditen", titel: "Europa-Renditen", klassen: ["YIELD"], symbole: ["DE2Y", "DE10Y", "DE30Y"] },
    { id: "leitzinsen", titel: "Leitzinsen", klassen: ["RATE"], symbole: ["FED_TARGET", "US_EFFR", "ECB_DFR"] },
    { id: "devisen", titel: "Devisen", klassen: ["FX"], symbole: ["EURUSD"] }
  ];
  /* EEM (Schwellenlaender) steht im Core, sein Anzeigename dort noch ohne
     Umlaut - folgt, sobald der Core ihn korrigiert. */
  var AUSWAHL = GRUPPEN.reduce(function (a, g) { return a.concat(g.symbole); }, []);

  var KLASSE_WORT = { INDEX: "Index", ETF: "Markt-Tracker", YIELD: "Rendite", RATE: "Leitzins", COMMODITY: "Rohstoff",
                      PRECIOUS_METAL: "Edelmetall", CRYPTO: "Krypto", FX: "Devisen" };
  var FRISCHE_WORT = { LIVE: "Live", CURRENT: "Aktuell", LAST_SESSION: "Letzter Handelsstand",
                       STALE: "Nicht aktuell", UNAVAILABLE: "Kein Stand" };
  var MARKT_WORT = { OPEN: "Handel läuft", CLOSED: "Geschlossen", PRE_MARKET: "Vorbörse", AFTER_HOURS: "Nachbörse",
                     HOLIDAY: "Feiertag", WEEKEND: "Wochenende", DAILY_BREAK: "Handelspause" };

  function zahl(v, stellen) {
    try {
      return new Intl.NumberFormat("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(v);
    } catch (_) { return v.toFixed(stellen); }
  }
  function vorzeichen(v, text) { return (v > 0 ? "+" : v < 0 ? "−" : "±") + text; }

  /* Der Stand in Berliner Zeit - ein reiner Tag bleibt ein Tag. */
  function standText(asOf) {
    if (!asOf) return null;
    var s = String(asOf);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4);
    try {
      return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit",
                                                hour: "2-digit", minute: "2-digit" }).format(new Date(s)) + " Uhr";
    } catch (_) { return s.slice(0, 16).replace("T", " "); }
  }

  /**
   * Der angezeigte Wert - nach der Einheit, nicht nach dem Symbol.
   * Nur monetaere Einheiten gehen durch den Currency Core.
   */
  function wertText(c, layer) {
    var q = c.quote, MA = global.VUMultiAssetContract;
    if (q.state !== "AVAILABLE") return null;
    var p = MA.present(c, { layer: layer });
    var d = p.display;
    if (q.valueKind === "RANGE" && q.range) {
      return zahl(q.range.lower, 2) + "–" + zahl(q.range.upper, 2) + " %";
    }
    if (q.unit === "PERCENT") return zahl(d.value, 2) + " %";
    if (q.unit === "INDEX_POINTS") return zahl(d.value, 2) + " Pkt.";
    if (q.unit === "FX_RATE") return zahl(d.value, q.decimals || 4) + " " + (q.nativeCurrency || "");
    /* Monetaer: Waehrungsformat aus dem Core, Mengeneinheit daneben. */
    var F = global.VUFx && global.VUFx.Format;
    var betrag = F ? F.formatPrice(d.value, d.currency, { decimals: q.decimals })
                   : zahl(d.value, q.decimals || 2) + " " + (d.currency || "");
    return betrag + (q.unitDisplay ? " " + q.unitDisplay : "");
  }

  function veraenderungText(c) {
    var ch = c.quote.change;
    if (!ch) return null;
    if (ch.semantics === "BASIS_POINTS") {
      if (typeof ch.basisPoints !== "number") return null;
      return vorzeichen(ch.basisPoints, zahl(Math.abs(ch.basisPoints), Math.abs(ch.basisPoints) % 1 ? 1 : 0) + " bp");
    }
    if (typeof ch.percent !== "number") return null;
    return vorzeichen(ch.percent, zahl(Math.abs(ch.percent), 2) + " %");
  }

  function referenzText(c) {
    var d = c.quote.changeReferenceDate;
    if (!d) return null;
    if (c.market.sessionProfile === "POLICY_EVENT") return "seit dem Beschluss davor (" + standText(d) + ")";
    return "gegenüber " + standText(d);
  }

  function hinweisText(c) {
    var q = c.quote;
    if (q.state === "CAPABILITY_GAP") {
      return c.instrument.assetClass === "INDEX"
        ? "Keine lizenzierte Indexquelle angebunden. Ein ETF wird nicht als Index ausgegeben."
        : "Instrument nicht eindeutig belegbar - kein Wert statt eines ungeklärten.";
    }
    if (q.state === "WITHHELD_LICENSE") return "Technisch angebunden, öffentliche Anzeige noch nicht freigegeben.";
    if (q.state === "SOURCE_MISSING") return "Die Quelle hat zuletzt nicht geliefert.";
    return null;
  }

  /* Der Marktzustand aus dem Vertrag - nur wo ein Handel dahintersteht.
     Krypto handelt rund um die Uhr und bekommt keine Boersensitzung;
     Tageswerte, Fixings und Beschluesse haben keinen Handelszustand. */
  function marktText(c) {
    var p = c.market.sessionProfile, s = c.market.state;
    if (p === "CRYPTO_24_7") return "Handel rund um die Uhr (24/7)";
    if (p === "REFERENCE_DAILY" || p === "POLICY_EVENT" || c.instrument.subType === "FX_REFERENCE_FIXING") return null;
    var w = MARKT_WORT[s];
    if (!w) return null;
    if (p === "US_EQUITY_ETF") return "US-Handelssitzung: " + w;
    if (p === "METALS_OTC_24_5") return "OTC-Handel: " + w;
    return "Börse: " + w;
  }

  function frischeText(c) {
    var f = c.data.freshness.state;
    if (f === "LAST_SESSION" && c.market.sessionProfile === "CRYPTO_24_7") return "Letzter Stand";
    return FRISCHE_WORT[f] || f;
  }

  /* Die Kopfzeile: beim Tracker der Markt als Titel und der Tracker
     sichtbar daneben - nie der Tracker als Index. */
  function kopfText(c) {
    if (c.tracker) return { klasse: "Tracker · " + c.instrument.symbol, titel: c.tracker.displayMarketName || c.instrument.nameDe };
    return { klasse: KLASSE_WORT[c.instrument.assetClass] || c.instrument.assetClass, titel: c.instrument.nameDe || c.instrument.name };
  }

  function karte(c, layer) {
    var q = c.quote, frische = c.data.freshness.state;
    var kopf = kopfText(c);
    var wert = wertText(c, layer), veraenderung = veraenderungText(c);
    /* Farbe nur fuer Kursbewegungen. Eine steigende Rendite ist weder
       gut noch schlecht - sie bekommt keine Gewinn-/Verlustfarbe. */
    var richtung = q.change && q.change.semantics === "PERCENT_OF_VALUE" ? (q.change.percent || 0) : 0;
    var neutral = !!(q.change && q.change.semantics === "BASIS_POINTS");
    var kinder = [
      el("div", { class: "dx-markt-kopf" }, [
        el("span", { class: "dx-markt-klasse", text: kopf.klasse }),
        el("h3", { text: kopf.titel })
      ])
    ];
    if (wert) {
      kinder.push(el("p", { class: "dx-markt-wert", text: wert }));
      if (veraenderung) {
        kinder.push(el("p", { class: "dx-markt-veraenderung " + (neutral ? "is-neutral" : richtung > 0 ? "is-up" : richtung < 0 ? "is-down" : "is-flat") }, [
          el("b", { text: veraenderung }), el("span", { text: " " + (referenzText(c) || "") })
        ]));
      }
      var MC = global.VUDiscover && global.VUDiscover.MicroChart;
      var recent = c.history && c.history.recent;
      if (MC && recent && recent.length >= 5 && c.history.representation !== "STEPS") {
        var svg = MC.render({ status: "CALCULATED", points: recent, range: "3M", source: c.data.source },
                            { width: 260, height: 54, symbol: c.instrument.symbol });
        if (svg) kinder.push(el("div", { class: "dx-markt-chart", "aria-hidden": "true" }, [svg]));
      }
    } else {
      kinder.push(el("p", { class: "dx-markt-leer", text: hinweisText(c) || "Kein Wert." }));
    }
    var stand = standText(q.observationDate && c.market.sessionProfile === "POLICY_EVENT" ? q.asOf : q.asOf);
    var fuss = [];
    if (wert) {
      fuss.push(el("span", { class: "dx-markt-frische is-" + frische.toLowerCase(), text: frischeText(c) }));
      var markt = marktText(c);
      if (markt) fuss.push(el("span", { class: "dx-markt-zustand", text: markt }));
      if (stand) fuss.push(el("span", { text: (c.market.sessionProfile === "POLICY_EVENT" ? "gültig seit " : "Stand ") + stand }));
      var att = c.data.provenance && c.data.provenance.attribution;
      if (att) fuss.push(el("span", { class: "dx-markt-quelle", text: att }));
    }
    var semantik = wert ? semantikKurz(c) : null;
    if (semantik) kinder.push(el("p", { class: "dx-markt-semantik", text: semantik }));
    kinder.push(el("div", { class: "dx-markt-fuss" }, fuss));
    /* Jede Karte mit Wert fuehrt zu ihrem Marktdetail - keine Sackgasse. */
    var link = q.state === "AVAILABLE";
    return el(link ? "a" : "article", {
      class: "dx-markt-karte is-" + q.state.toLowerCase() + (link ? " is-link" : ""),
      href: link ? "#/maerkte/" + encodeURIComponent(c.instrument.symbol) : null,
      "data-instrument": c.instrument.symbol, "data-asset-class": c.instrument.assetClass,
      "data-proxy": c.proxy && c.proxy.isProxy ? "tracker" : "none",
      "data-quote-state": q.state, "data-freshness": frische, "data-unit": q.unitId
    }, kinder);
  }

  /* Eine Zeile, die sagt, WAS die Zahl ist - kein Anbietername. */
  function semantikKurz(c) {
    var t = c.instrument.subType;
    if (t === "INDEX_TRACKER" && c.tracker) {
      return c.tracker.trackerDisclosure + ". Kurs und Bewegung des Trackers - nicht der offizielle Indexstand" +
        (c.proxy && c.proxy.currencyNote ? ". " + c.proxy.currencyNote : ".");
    }
    if (t === "INDEX_PRICE") return "Offizieller Indexstand (Tagesschluss), in Punkten.";
    if (t === "SPOT_REFERENCE") return "Tagesspotpreis (Referenz), kein Future.";
    if (t === "SPOT_METAL") return "Spotpreis je Feinunze (OTC-Markt).";
    if (t === "CRYPTO_SPOT_AGGREGATED") return "Über mehrere Handelsplätze aggregierter Kurs. Kein Börsenschluss, auch am Wochenende.";
    if (t === "GOVERNMENT_BOND_YIELD_CMT") return "Tageswert der Renditekurve (konstante Laufzeit).";
    if (t === "GOVERNMENT_BOND_YIELD_TERM_STRUCTURE") return "Geschätzte Rendite für genau diese Restlaufzeit (Zinsstruktur).";
    if (t === "POLICY_RATE_TARGET_RANGE") return "Beschlossenes Zielband. Gilt bis zum nächsten Beschluss.";
    if (t === "POLICY_RATE_DEPOSIT_FACILITY") return "Beschlossener Satz. Gilt bis zum nächsten Beschluss.";
    if (t === "OVERNIGHT_REFERENCE_RATE") return "Tatsächlicher Tagesgeldsatz am Markt - kein Beschluss.";
    if (t === "FX_REFERENCE_FIXING") return "Referenzkurs der EZB (einmal je Handelstag).";
    return null;
  }

  function gruppieren(contracts) {
    var bySym = {};
    contracts.forEach(function (c) { bySym[c.instrument.symbol] = c; });
    return GRUPPEN.map(function (g) {
      var liste = g.symbole.map(function (s) { return bySym[s]; })
        .filter(function (c) { return c && g.klassen.indexOf(c.instrument.assetClass) !== -1; });
      return { id: g.id, titel: g.titel, karten: liste };
    }).filter(function (g) { return g.karten.length; });
  }

  /* Bewegung nur, wenn der Nutzer sie nicht abgeschaltet hat. */
  function sanft() { return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }

  /* Mobil zuerst: eine Sprungleiste zu den Gruppen. Buttons statt
     Anker - der Hash gehoert dem Router (#/maerkte). */
  function sprungleiste(gruppen) {
    return el("nav", { class: "dx-maerkte-nav", "aria-label": "Assetklassen" }, gruppen.map(function (g) {
      /* Der Klick als Eigenschaft - ein onclick-Attribut aus einer Funktion waere nur Text. */
      var b = el("button", { type: "button", class: "dx-maerkte-sprung", "data-ziel": "maerkte-" + g.id, text: g.titel });
      b.onclick = function () {
        var ziel = global.document && global.document.getElementById("maerkte-" + g.id);
        if (ziel && ziel.scrollIntoView) ziel.scrollIntoView({ behavior: sanft(), block: "start" });
      };
      return b;
    }));
  }

  /* ----------------------------------------------------- Direkt zu
     Zwei Reihen grosser Chips zwischen Hero und Kacheln - oben die Themen
     der Einordnung, unten die Maerkte. Jeder Chip hat ein eigenes Symbol in
     eigener Farbe (wie Logos in einer Broker-App) und springt zu seinem
     Bereich. Die Farben sind Wiedererkennung, keine Marktbedeutung - Gruen
     und Orange bleiben "unterstuetzt" und "Gegenwind" vorbehalten. */
  var THEMEN = [
    { ziel: "maerkte-aendern", label: "Bullish & Bearish", symbol: "pfeile", farbe: "#5e5ce6" },
    { ziel: "maerkte-verlauf", label: "12 Monate", symbol: "kurve", farbe: "#0a84ff" },
    { ziel: "maerkte-dimensionen", label: "5 Dimensionen", symbol: "regler", farbe: "#af52de" },
    { ziel: "maerkte-vorher-jetzt", label: "Was ist neu?", symbol: "funken", farbe: "#ff2d55" },
    { ziel: "maerkte-warum", label: "Warum?", symbol: "lupe", farbe: "#6e7b91" },
    { ziel: "maerkte-worauf", label: "Worauf achten", symbol: "auge", farbe: "#5856d6" },
    { ziel: "maerkte-breite", label: "Marktbreite", symbol: "balken", farbe: "#30b0c7" },
    { ziel: "maerkte-crossasset", label: "Cross Asset", symbol: "knoten", farbe: "#007aff" },
    { ziel: "maerkte-jetzt", label: "Markt jetzt", symbol: "blitz", farbe: "#e6b000" },
    { ziel: "maerkte-movers", label: "Top & Flop", symbol: "hoch", farbe: "#ff375f" }
  ];
  var GRUPPE_SYMBOL = { aktien: ["kerzen", "#2f6fed"], energie: ["flamme", "#e8590c"], edelmetalle: ["barren", "#d49a0a"],
                        krypto: ["bitcoin", "#7c5cff"], "us-renditen": ["prozent", "#1f4fb8"], "eu-renditen": ["prozent", "#0a84ff"],
                        leitzinsen: ["saeulen", "#636a78"], devisen: ["waehrung", "#2f9463"] };

  function symbol(key) {
    var MI = global.VUDiscover && global.VUDiscover.MarketIntelligence;
    return MI && MI.glyph ? MI.glyph(key) : null;
  }

  function direktZu(seite, gruppen) {
    if (!global.document || !seite.querySelector) return null;
    function chip(ziel, label, sym, farbe) {
      if (!seite.querySelector("#" + ziel)) return null;
      var b = el("button", { type: "button", class: "dx-mn-chip", "data-ziel": ziel }, [
        el("span", { class: "dx-mn-icon", style: "--c:" + farbe, "aria-hidden": "true" }, [symbol(sym)].filter(Boolean)),
        el("span", { class: "dx-mn-label", text: label })
      ]);
      b.onclick = function () {
        var z = global.document.getElementById(ziel);
        if (z && z.scrollIntoView) z.scrollIntoView({ behavior: sanft(), block: "start" });
      };
      return b;
    }
    var themen = THEMEN.map(function (t) { return chip(t.ziel, t.label, t.symbol, t.farbe); }).filter(Boolean);
    var maerkte = gruppen.map(function (g) {
      var s = GRUPPE_SYMBOL[g.id] || ["kerzen", "#636a78"];
      return chip("maerkte-" + g.id, g.titel, s[0], s[1]);
    }).filter(Boolean);
    if (themen.length + maerkte.length < 4) return null;
    return el("nav", { class: "dx-mn", id: "maerkte-direkt", "aria-label": "Direkt zu den Bereichen der Seite" }, [
      el("h2", { class: "dx-mn-titel", text: "Direkt zu" }),
      el("div", { class: "dx-mn-scroll" }, [el("div", { class: "dx-mn-reihen" }, [
        themen.length ? el("div", { class: "dx-mn-reihe", "data-reihe": "themen", "data-titel": "Einordnung" }, themen) : null,
        maerkte.length ? el("div", { class: "dx-mn-reihe", "data-reihe": "maerkte", "data-titel": "Märkte" }, maerkte) : null
      ].filter(Boolean))])
    ]);
  }

  /* ------------------------------------------------ Markets 2.0: Intelligence */

  /** MARKT JETZT: die auffaelligsten Tagesbewegungen, deterministisch (VUMarketPulse.marketNow). */
  function marktJetztItems(contracts, pcfg, jetzt) {
    var MP = global.VUMarketPulse;
    if (!MP || !pcfg || !pcfg.marketNow) return [];
    /* Nur, was die Seite auch zeigt - jeder Eintrag fuehrt zu einer Karte und ihrem Detail. */
    var gezeigt = contracts.filter(function (c) { return AUSWAHL.indexOf(c.instrument.symbol) !== -1; });
    return MP.marketNow(gezeigt, pcfg.marketNow, jetzt);
  }
  /** Markets 3.0: dieselben Bewegungen als Geschichten (VUMarketPulse.marketNowStories). */
  function marktJetzt(contracts, pcfg, jetzt) {
    var MI = global.VUDiscover && global.VUDiscover.MarketIntelligence;
    var items = marktJetztItems(contracts, pcfg, jetzt);
    if (!items.length || !MI) return null;
    return MI.stories(items, standText);
  }

  var DIM_NAME = { TREND: "Trend", BREADTH: "Marktbreite", MOMENTUM: "Momentum", RISK: "Risiko", CROSS_ASSET: "Cross Asset" };
  var DIM_ORDER = ["TREND", "BREADTH", "MOMENTUM", "RISK", "CROSS_ASSET"];

  /** WAS BEWEGT DIE MAERKTE? Zustand, Evidenz, Erklaerung, Methodik - aus dem Core-Artefakt. */
  function pulsBereich(p) {
    if (!p || !p.dimensions) return null;
    var dims = DIM_ORDER.map(function (k) { return p.dimensions[k]; }).filter(Boolean);
    var kacheln = dims.map(function (d) {
      return el("div", { class: "dx-puls-dim is-" + String(d.state).toLowerCase(), "data-dimension": d.id, "data-state": d.state }, [
        el("span", { class: "dx-puls-name", text: DIM_NAME[d.id] || d.id }),
        el("b", { class: "dx-puls-zustand", text: d.label }),
        el("p", { text: d.summary })
      ]);
    });
    var tiefe = dims.map(function (d) {
      return el("section", { class: "dx-puls-tiefe", "data-dimension": d.id }, [
        el("h3", { text: (DIM_NAME[d.id] || d.id) + ": " + d.label }),
        d.evidence.length ? el("ul", {}, d.evidence.map(function (e) {
          return el("li", { class: e.current === false ? "is-alt" : "" }, [
            el("span", { text: e.label + ": " }), el("b", { text: e.text }),
            e.current === false ? el("span", { class: "dx-puls-alt", text: " · Stand " + standText(e.asOf) + ", nicht aktuell" }) : null
          ].filter(Boolean));
        })) : null,
        d.explanation ? el("p", { class: "dx-puls-erklaerung", text: d.explanation }) : null,
        el("p", { class: "dx-puls-methodik", text: "Methodik: " + d.methodology })
      ].filter(Boolean));
    });
    return el("section", { class: "dx-maerkte-puls", id: "maerkte-puls", "aria-label": "Was bewegt die Märkte?" }, [
      el("h2", { text: "Was bewegt die Märkte?" }),
      el("p", { class: "dx-puls-schlagzeile", text: p.headline && p.headline.text ? p.headline.text : "Gerade keine belastbare Einordnung." }),
      el("div", { class: "dx-puls-raster" }, kacheln),
      el("details", { class: "dx-puls-details" }, [el("summary", { text: "Unter der Oberfläche: Messwerte und Methodik" })].concat(tiefe).concat([
        el("p", { class: "dx-puls-methodik", text: "Makro-Umfeld (Inflation, Wachstum, Arbeitsmarkt): noch nicht zertifiziert und deshalb nicht Teil dieser Einordnung. " +
          "Sektoren: noch keine belastbare Sektorzuordnung im Datenkern." })
      ])),
      el("p", { class: "dx-maerkte-unter", text: "Stand " + (standText(p.generatedAt) || "unbekannt") +
        ". Beschreibung des beobachteten Zustands aus festen Regeln – kein Gesamtscore, keine Prognose, keine Anlageberatung." })
    ]);
  }

  /** AKTIEN IN BEWEGUNG: Gewinner und Verlierer der juengsten Sitzung, je mit Link zur Aktienseite. */
  function moversBereich(p) {
    var m = p && p.movers;
    if (!m || !m.gainers || !m.gainers.length) return null;
    function spalte(titel, xs, glyph, art) {
      var ic = symbol(glyph);
      return el("div", { class: "dx-movers-spalte is-" + art }, [el("h3", {}, [ic ? el("span", { class: "dx-m3-icon is-" + art, "aria-hidden": "true" }, [ic]) : null,
        el("span", { text: titel })].filter(Boolean)), el("ol", {}, xs.map(function (x) {
        return el("li", {}, [el("a", { href: "#/s/US_REAL/" + encodeURIComponent(x.symbol), "data-symbol": x.symbol }, [
          el("span", { class: "dx-movers-name", text: x.name }), el("span", { class: "dx-movers-sym", text: x.symbol }),
          el("b", { class: x.changePercent > 0 ? "is-up" : x.changePercent < 0 ? "is-down" : "", text: vorzeichen(x.changePercent, zahl(Math.abs(x.changePercent), 2) + " %") })
        ])]);
      }))]);
    }
    return el("section", { class: "dx-maerkte-movers", id: "maerkte-movers", "aria-label": "Aktien in Bewegung" }, [
      el("h2", { text: "Aktien in Bewegung" }),
      el("p", { class: "dx-maerkte-unter", text: "Sitzung vom " + standText(m.session) + " gegenüber " + standText(m.previousSession) +
        (m.complete ? "" : " (Sitzung läuft)") + " · " + m.eligible + " liquide Titel aus dem Discover-Universum" }),
      el("div", { class: "dx-movers-raster" }, [spalte("Stärkste Gewinner", m.gainers, "hoch", "kurs-up"), spalte("Stärkste Verlierer", m.losers, "runter", "kurs-down")])
    ]);
  }

  /** Anzeigenamen je Symbol fuer Verweise - beim Tracker Markt und Tracker. */
  function namen(contracts) {
    var n = {};
    contracts.forEach(function (c) { var k = kopfText(c); n[c.instrument.symbol] = c.tracker ? k.titel + " · " + c.instrument.symbol : k.titel; });
    return n;
  }

  /**
   * Markets 3.0: Einordnung zuerst, Belege danach.
   * HERO -> FUENF DIMENSIONEN -> VORHER/JETZT -> WARUM -> WORAUF ES ANKOMMT ->
   * WAS WUERDE ES AENDERN -> VERLAUF -> MARKTBREITE -> CROSS ASSET ->
   * MARKT JETZT -> AKTIEN IN BEWEGUNG -> ALLE MAERKTE.
   * @param {HTMLElement} root
   * @param {object} ctx {calendar, isActive}
   */
  function render(root, ctx) {
    ctx = ctx || {};
    var MA = global.VUMultiAssetContract;
    var MI = global.VUDiscover && global.VUDiscover.MarketIntelligence;
    function optional(p) { return S.loadJSON(p).catch(function () { return null; }); }
    return Promise.all([S.loadJSON(SNAPSHOT), optional(CONFIG), optional(PULSE), optional(PULSE_CONFIG), optional(PULSE_HISTORY)]).then(function (r) {
      if (ctx.isActive && !ctx.isActive()) return;
      var snap = r[0], cfg = r[1], puls = r[2], pcfg = r[3], hist = r[4];
      var jetzt = new Date();
      var contracts = snap.instruments.map(function (c) {
        return MA.refresh(c, { now: jetzt, calendar: ctx.calendar, config: cfg || {} });
      });
      var layer = global.VUFx && global.VUFx.layer;
      var nm = namen(contracts);
      var seite = el("div", { class: "dx-page dx-maerkte dx-m3" }, [
        el("a", { class: "dx-back", href: "#/", text: "← Discover" }),
        el("h1", { class: "dx-m3-titel", text: "Märkte" })
      ]);
      function dazu(n) { if (n) { if (n.classList) n.classList.add("dx-m3-reveal"); seite.appendChild(n); } return n; }
      var verlaufNode = null, heroNode = null;
      if (puls && MI && puls.environment) {
        heroNode = dazu(MI.hero(puls, jetzt));
        if (MI.kacheln) dazu(MI.kacheln(puls, hist));
        dazu(MI.landkarte(puls));
        dazu(MI.vorherJetzt(puls));
        dazu(MI.warum(puls));
        dazu(MI.worauf(puls, nm));
        dazu(MI.bildAendern(puls, nm));
        verlaufNode = dazu(MI.verlauf(hist, puls));
        dazu(MI.breite(puls, hist));
        dazu(MI.crossAsset(puls, nm));
      } else if (puls) {
        dazu(pulsBereich(puls));
      }
      dazu(marktJetzt(contracts, pcfg, jetzt));
      dazu(moversBereich(puls));
      var gruppen = gruppieren(contracts);
      dazu(el("section", { class: "dx-maerkte-alle", id: "maerkte-alle", "aria-label": "Alle Märkte" }, [
        el("h2", { text: "Alle Märkte" }),
        el("p", { class: "dx-maerkte-lead", text: "Jeder Markt mit Einheit, Stand und Quelle – antippen für Verlauf und Einordnung. " +
          "Aktienmärkte erscheinen über gekennzeichnete Markt-Tracker, nicht als offizieller Indexstand; Renditen bewegen sich in Basispunkten." }),
        sprungleiste(gruppen)
      ]));
      gruppen.forEach(function (g) {
        dazu(el("section", { class: "dx-maerkte-gruppe", id: "maerkte-" + g.id, "aria-label": g.titel }, [
          el("h2", { text: g.titel }),
          el("div", { class: "dx-maerkte-raster", tabindex: "0", role: "group", "aria-label": g.titel + " – wischen für mehr" }, g.karten.map(function (c) { return karte(c, layer); }))
        ]));
      });
      /* Erst jetzt, da alle Bereiche stehen: nur Chips mit echtem Ziel. */
      var direkt = heroNode ? direktZu(seite, gruppen) : null;
      if (direkt) seite.insertBefore(direkt, heroNode);
      seite.appendChild(el("p", { class: "dx-maerkte-stand", text: "Datenstand: " + (standText(snap.generatedAt) || "unbekannt") +
        ". Beträge in der gewählten Anzeigewährung; Punkte, Prozent und Zinssätze werden nicht umgerechnet. Informationen zur eigenen Recherche, keine Anlageberatung." }));
      root.appendChild(seite);
      if (verlaufNode && verlaufNode._zeichnen) verlaufNode._zeichnen();
      if (MI && MI.beleben) MI.beleben(root);
    });
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Markets = { render: render, gruppieren: gruppieren, wertText: wertText, kopfText: kopfText, semantikKurz: semantikKurz,
                                veraenderungText: veraenderungText, standText: standText, marktText: marktText,
                                frischeText: frischeText, referenzText: referenzText,
                                marktJetzt: marktJetzt, marktJetztItems: marktJetztItems, pulsBereich: pulsBereich, moversBereich: moversBereich, namen: namen,
                                GRUPPEN: GRUPPEN, AUSWAHL: AUSWAHL };
})(typeof window !== "undefined" ? window : globalThis);
