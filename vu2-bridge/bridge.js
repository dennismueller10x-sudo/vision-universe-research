/* =========================================================================
   VISION UNIVERSE — vu2-bridge/bridge.js

   DIE BRUECKE ZWISCHEN VU2 UND DEM VOLLEN UNIVERSUM.

   Die VU2-Oberflaeche (vu2/experience.js) ist fertig und gut. Ihre
   Datenschicht (quant/api/product-services.js) ist es auch - sie ist nur
   auf die fuenf freigegebenen Titel begrenzt, weil zum Zeitpunkt ihres
   Baus nichts anderes ausgeliefert war. Inzwischen liegt das ganze
   Universum als geprueftes Artefakt vor.

   Diese Datei aendert KEINE Zeile an beiden. Sie legt sich zwischen sie:

     product-services.js   erzeugt die Dienste
     bridge.js             umhuellt sie   <- hier
     experience.js         benutzt sie

   Das ist Absicht. Astra/Codex arbeitet an VU2 weiter; eine Aenderung in
   deren Dateien waere ein Konflikt bei jedem ihrer naechsten Commits.
   Eine Umhuellung ist additiv: faellt sie weg, ist wieder der
   urspruengliche Zustand da.

   WAS DIE BRUECKE HINZUFUEGT

     Suche         ueber alle ausgelieferten Titel, nicht ueber fuenf
     Einzeltitel   jeder Titel des Universums oeffnet sich
     Quant         gemessene Faktoren je Titel
     Screener      Regeln ueber das ganze Universum
     Discover      dieselben Rezepte, volle Grundgesamtheit
     Chart         Echtzeit und Intraday ueber die Serverseite

   WAS SIE NICHT TUT

   Sie erfindet keinen Wert. Wo das Universum nichts traegt - Kursniveaus,
   Fundamentaldaten ausserhalb der SEC-Titel, Kursreihen ausserhalb der
   Freigabe - steht ein Produktzustand mit Begruendung und keine Null.
   ========================================================================= */
(function (g) {
  "use strict";

  var Basis = g.VUProductServices;
  if (!Basis || typeof Basis.create !== "function") return;

  var DATEN = "/quant/data/proof/";
  var SHARDS_FALLBACK = 64;

  /* Wie viele Titel die Listenansichten tragen. Die Suche und der
     Screener sehen IMMER alle; hier geht es nur darum, dass die
     Startseite nicht 5.683 Zeilen aufbaut. Die Auswahlregel ist bewusst
     wertfrei: die meistgehandelten Titel, gemessen am
     20-Tage-Durchschnittsvolumen. Keine Empfehlung, keine Rangliste. */
  var LISTE = 48;

  /* ---------------------------------------------------- Produkteignung

     Der Backfill hat 7.803 Titel geholt, darunter 799 belegte Warrants,
     Units, Rights und Testpapiere in der punktlosen NASDAQ-Schreibweise
     (AACBW ist der Warrant auf AACB). Sie bleiben Mitglieder des
     Universums - geloescht wird nichts -, aber sie gehoeren nicht in
     Listen, Screener und Ranglisten.

     Die Regel ist ABSICHTLICH als "nicht EXCLUDED" formuliert und nicht
     als "gleich ELIGIBLE":

       ELIGIBLE        Stammaktie
       SEPARATE_CLASS  belegter Vorzug - handelbar, nur keine Stammaktie
       REVIEW          Verdacht OHNE Stammbeleg
       EXCLUDED        belegte Nicht-Aktie

     Ein Verdacht ist kein Befund. Wer hier auf ELIGIBLE pruefte, wuerfe
     527 Titel aus dem Produkt, von denen 219 nie widerlegt wurden.

     Faellt das Feld weg - ein aelterer Datensatz ohne Eignungsschicht -,
     gilt jeder Titel als Produkttitel. Dann ist die Vorschau wieder
     genau das, was sie vorher war, und nicht versehentlich leer. */
  function imProdukt(zeile) {
    return !zeile || zeile.productEligibility !== "EXCLUDED";
  }

  // ------------------------------------------------------------ Laden
  var zwischenspeicher = {};
  function hole(load, pfad) {
    if (!zwischenspeicher[pfad]) zwischenspeicher[pfad] = load(DATEN + pfad);
    return zwischenspeicher[pfad];
  }

  function shardOf(ticker, shards) {
    var h = 0;
    for (var i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0;
    return h % (shards || SHARDS_FALLBACK);
  }

  // ------------------------------------------------------ Umrechnung
  function kennzahl(wert, einheit) {
    return Number.isFinite(wert)
      ? { value: wert, unit: einheit, state: "AVAILABLE" }
      : { value: null, unit: einheit, state: "SOURCE_MISSING" };
  }
  function prozent(anteil) {
    return kennzahl(Number.isFinite(anteil) ? anteil * 100 : null, "percent");
  }
  function fehlt(einheit) { return { value: null, unit: einheit, state: "SOURCE_MISSING" }; }

  var SEKTOR_FEHLT = "Sektor nicht im Anbieteruniversum";

  /* Der Anbieter liefert fuer dieses Universum keinen Firmennamen. Einen
     zu erfinden waere eine Auskunft, die niemand gegeben hat - und den
     Ticker als Namen auszugeben saehe genauso aus. Was hier steht, ist
     die Einordnung: Boerse und Sektor. */
  function bezeichnung(zeile) {
    var sektor = zeile.sector && zeile.sector !== "UNKNOWN" ? zeile.sector : SEKTOR_FEHLT;
    return (zeile.exchange || "Boerse unbekannt") + " · " + sektor;
  }

  function faktor(zeile, pfad) {
    var werte = zeile.factors && zeile.factors.values;
    if (!werte) return null;
    var punkt = pfad.indexOf(".");
    if (punkt < 0) return Number.isFinite(werte[pfad]) ? werte[pfad] : null;
    var gruppe = werte[pfad.slice(0, punkt)];
    var v = gruppe ? gruppe[pfad.slice(punkt + 1)] : null;
    return Number.isFinite(v) ? v : null;
  }

  /* Eine Universumszeile in der Form, die die VU2-Oberflaeche erwartet.
     Dieselben Feldnamen, dieselben Einheiten - sonst zeigt eine fertige
     Ansicht Zahlen mit falscher Bedeutung. */
  function alsProdukt(zeile, dienste) {
    return {
      securityId: zeile.securityId,
      ticker: zeile.ticker,
      name: bezeichnung(zeile),
      industry: null,
      state: "AVAILABLE",
      marketState: "AVAILABLE",
      asOf: (zeile.factors && zeile.factors.asOf) || zeile.historyTo || null,
      fundamentalsAsOf: "nicht verfuegbar",
      availableAt: "nicht verfuegbar",
      /* Kursniveaus bleiben zurueckgehalten (§34) - ausgeliefert sind
         Zustaende, Abstaende und Renditen. */
      price: fehlt("USD"),
      momentum6m: prozent(faktor(zeile, "returns.6M")),
      above200: prozent(faktor(zeile, "distanceToSMA200")),
      above50: prozent(faktor(zeile, "distanceToSMA50")),
      revenueGrowth: fehlt("percent"),
      operatingMargin: fehlt("percent"),
      fcfMargin: fehlt("percent"),
      roic: fehlt("percent"),
      drawdown: prozent(faktor(zeile, "maxDrawdown252d")),
      provenance: {
        fundamentals: null,
        market: "Tiingo · abgeleitete Zustaende",
        methodology: "/universe/stock/?ticker=" + encodeURIComponent(zeile.ticker),
        marketMetricOwner: "scripts/market/build-market-factors.mjs",
        marketUnits: "percent; gemessene Abstaende und Renditen, keine Modellperzentile"
      },
      /* Zusatzangaben der Bruecke. Die VU2-Ansichten lesen sie nicht -
         die Bruecke selbst schon. */
      vuFullUniverse: true,
      dataQuality: zeile.dataQuality || null,
      exchange: zeile.exchange || null,
      sector: zeile.sector && zeile.sector !== "UNKNOWN" ? zeile.sector : null,
      bars: zeile.bars || null,
      historyFrom: zeile.historyFrom || null,
      historyTo: zeile.historyTo || null,
      workspaces: dienste.workspaces(zeile.ticker)
    };
  }

  // --------------------------------------------------------- Dienste
  function create(optionen) {
    var dienste = Basis.create(optionen);
    var load = optionen.loadJSON;
    var query = optionen.queryEngine;

    var metaP = null, indexP = null, freigabeP = null;
    function meta() { return metaP || (metaP = hole(load, "meta.json")); }
    function index() { return indexP || (indexP = hole(load, "index.json")); }
    function freigabe() {
      return freigabeP || (freigabeP = load("/quant/config/development-preview.json")
        .then(function (f) { return (f && f.scope) || []; })
        .catch(function () { return []; }));
    }

    /* Die spaltenweise Tabelle wieder als Zeile. Einmal gebaut, danach
       nur gelesen - 5.683 Objekte entstehen genau einmal. */
    var zeilenCache = null;
    function alleZeilen() {
      if (zeilenCache) return Promise.resolve(zeilenCache);
      return index().then(function (idx) {
        var felder = idx.fields, spalten = idx.columns, enums = idx.enums;
        var liste = new Array(idx.count);
        for (var i = 0; i < idx.count; i++) {
          var r = { ticker: idx.tickers[i], securityId: "ref_" + idx.tickers[i],
                    hasFactors: idx.hasFactors[i] === 1, _i: i };
          for (var f = 0; f < felder.length; f++) {
            var feld = felder[f], v = spalten[feld.id][i];
            if (v === null || v === undefined) { r[feld.id] = null; continue; }
            if (feld.type === "enum") r[feld.id] = enums[feld.id][v];
            else if (feld.type === "bool") r[feld.id] = v === 1;
            else r[feld.id] = v;
          }
          liste[i] = r;
        }
        zeilenCache = liste;
        return liste;
      });
    }

    /* Eine vollstaendige Zeile mit Faktoren - aus ihrem Buendel. */
    var buendelCache = {};
    function vollZeile(ticker) {
      return meta().then(function (m) {
        var nummer = shardOf(ticker, m.shards);
        if (!buendelCache[nummer]) buendelCache[nummer] = hole(load, "rows/" + nummer + ".json");
        return buendelCache[nummer].then(function (b) { return b.rows[ticker] || null; });
      });
    }

    function istImUniversum(ticker) {
      return index().then(function (idx) { return idx.tickers.indexOf(ticker) !== -1; });
    }

    /* Aus der schmalen Indexzeile wird eine Produktzeile. Die Faktoren
       liegen dort bereits als Einzelfelder (nicht verschachtelt), also
       wird hier direkt gelesen. */
    function indexAlsProdukt(r) {
      return {
        securityId: r.securityId, ticker: r.ticker, name: bezeichnung(r), industry: null,
        state: "AVAILABLE", marketState: "AVAILABLE",
        asOf: null,
        fundamentalsAsOf: "nicht verfuegbar", availableAt: "nicht verfuegbar",
        price: fehlt("USD"),
        momentum6m: prozent(r["returns.6M"]),
        above200: prozent(r.distanceToSMA200),
        above50: prozent(r.distanceToSMA50),
        revenueGrowth: fehlt("percent"), operatingMargin: fehlt("percent"),
        fcfMargin: fehlt("percent"), roic: fehlt("percent"),
        drawdown: prozent(r.maxDrawdown252d),
        provenance: {
          fundamentals: null, market: "Tiingo · abgeleitete Zustaende",
          methodology: "/universe/stock/?ticker=" + encodeURIComponent(r.ticker),
          marketMetricOwner: "scripts/market/build-market-factors.mjs",
          marketUnits: "percent; gemessene Abstaende und Renditen, keine Modellperzentile"
        },
        vuFullUniverse: true, dataQuality: r.dataQuality || null,
        exchange: r.exchange || null,
        sector: r.sector && r.sector !== "UNKNOWN" ? r.sector : null,
        bars: r.bars || null, historyFrom: null, historyTo: null,
        workspaces: dienste.workspaces(r.ticker)
      };
    }

    // ------------------------------------------------------ Universum
    var universumCache = null;
    function getUniverse() {
      if (universumCache) return universumCache;
      universumCache = Promise.all([dienste.getUniverse(), alleZeilen(), index(), meta()])
        .then(function (res) {
          var basis = res[0], zeilen = res[1], idx = res[2], m = res[3];
          var bekannt = {};
          var stocks = [];
          if (basis && basis.state === "AVAILABLE") {
            basis.stocks.forEach(function (s) { bekannt[s.ticker] = true; stocks.push(s); });
          }
          /* Die meistgehandelten Titel zuerst - eine Messung, keine
             Bewertung. Wer mehr sehen will, nimmt Suche oder Screener. */
          var weitere = zeilen.filter(function (r) {
              return !bekannt[r.ticker] && r.hasFactors && imProdukt(r);
            })
            .sort(function (a, b) { return (b.avgVolume20d || 0) - (a.avgVolume20d || 0); })
            .slice(0, LISTE)
            .map(indexAlsProdukt);

          return {
            state: "AVAILABLE",
            stocks: stocks.concat(weitere),
            scope: "FULL_UNIVERSE_PREVIEW",
            totalMarketState: "AVAILABLE",
            reason: null,
            /* Die wahren Zahlen - die Bruecke zeigt sie im Kopfband an. */
            fullUniverse: {
              securities: idx.count,
              withFactors: idx.withFactors,
              listed: stocks.length + weitere.length,
              asOf: m.asOf,
              gate: m.gate,
              approvedDisplay: (basis && basis.stocks ? basis.stocks.length : 0),
              /* Mitgliedschaft und Produktumfang stehen nebeneinander.
                 Nur eine der beiden Zahlen zu zeigen hiesse entweder
                 799 Warrants mitzuzaehlen oder zu verschweigen, dass
                 sie geholt und gespeichert wurden. */
              productSecurities: m.productUniverse && m.productUniverse.status === "PRESENT"
                ? m.productUniverse.productSecurities : null,
              excluded: m.productUniverse && m.productUniverse.status === "PRESENT"
                ? m.productUniverse.excluded : null,
              excludedByClass: m.productUniverse && m.productUniverse.status === "PRESENT"
                ? m.productUniverse.excludedByClass : null,
              review: m.productUniverse && m.productUniverse.status === "PRESENT"
                ? m.productUniverse.review : null,
              coverage: m.coverageMetrics && m.coverageMetrics.status === "PRESENT"
                ? { storage: m.coverageMetrics.storage.STORAGE_COVERAGE_PERCENT,
                    chart: m.coverageMetrics.chart.CHART_AVAILABILITY_PERCENT,
                    chartMinBars: m.coverageMetrics.thresholds.chartMinBars,
                    technical: m.coverageMetrics.technical.TECHNICAL_HISTORY_ELIGIBILITY_PERCENT,
                    technicalMinBars: m.coverageMetrics.thresholds.technicalMinBars }
                : null
            }
          };
        })
        .catch(function () { return dienste.getUniverse(); });
      return universumCache;
    }

    async function getMarketIntelligence() {
      var universum = await getUniverse();
      if (universum.state !== "AVAILABLE") return dienste.getMarketIntelligence();
      return {
        version: "1.0.0", state: "AVAILABLE", scope: universum.scope,
        marketPulse: {
          state: "AVAILABLE",
          securities: universum.fullUniverse ? universum.fullUniverse.securities : universum.stocks.length,
          withFactors: universum.fullUniverse ? universum.fullUniverse.withFactors : 0
        },
        observations: universum.stocks.map(function (stock) {
          var beides = stock.above200.state === "AVAILABLE" && stock.above50.state === "AVAILABLE";
          return {
            stock: stock,
            trend: beides ? {
              state: "AVAILABLE",
              label: stock.above200.value > 0 && stock.above50.value > 0
                ? "Ueber wichtigen Trendbereichen" : "Trendbereiche pruefen",
              explanation: "Vergleich des letzten verfuegbaren Kurses mit dem 50- und " +
                           "200-Tage-Durchschnitt. Keine Prognose.",
              evidence: [
                { label: "Abstand zum 50-Tage-Durchschnitt", metric: stock.above50 },
                { label: "Abstand zum 200-Tage-Durchschnitt", metric: stock.above200 }
              ]
            } : { state: "SOURCE_MISSING", label: "Trend derzeit nicht verfuegbar" }
          };
        })
      };
    }

    // ---------------------------------------------------- Einzeltitel
    async function getStockIntelligence(ticker) {
      ticker = String(ticker || "").toUpperCase();
      var basis = await dienste.getStockIntelligence(ticker);
      if (basis && basis.state === "AVAILABLE") return basis;
      if (!(await istImUniversum(ticker))) return basis;

      var zeile = await vollZeile(ticker);
      if (!zeile) return basis;
      var stock = alsProdukt(zeile, dienste);

      /* Kursreihe nur, wo eine ausgeliefert ist. Sonst ein
         ausgesprochener Zustand - nie ein leerer Chart. */
      var erlaubt = await freigabe();
      if (erlaubt.indexOf(ticker) !== -1) {
        try {
          var p = await load("/quant/data/market/golden-preview/daily/ref_" + ticker + ".json");
          stock.chart = { state: (p.bars || []).length ? "AVAILABLE" : "SOURCE_MISSING",
                          bars: p.bars || [], adjustmentStatus: p.adjustmentStatus };
        } catch (e) { stock.chart = { state: "SOURCE_MISSING", bars: [] }; }
      } else {
        stock.chart = {
          state: "SOURCE_MISSING", bars: [],
          reason: "Fuer diesen Titel ist keine Kursreihe ausgeliefert. Die Faktoren stammen " +
                  "aus einer echten Reihe; der Bestand selbst (rund 7,4 GB) liegt in keiner Auslieferung."
        };
      }
      return stock;
    }

    // ---------------------------------------------------------- Quant
    var QUANT_FAMILIEN = [
      ["quality", "Ertragskraft", "Wie profitabel arbeitet das Unternehmen?", [
        ["operatingMargin", "Operative Marge", "percent", null],
        ["fcfMargin", "Freier Cashflow · Marge", "percent", null],
        ["roic", "Kapitalrendite (ROIC)", "percent", null]
      ]],
      ["growth", "Wachstum", "Wie veraendert sich das Geschaeft?", [
        ["revenueGrowth", "Umsatzwachstum", "percent", null]
      ]],
      ["momentum", "Kursstaerke", "Wie hat sich der Kurs entwickelt?", [
        ["momentum1m", "Kursentwicklung · 1 Monat", "percent", "returns.1M"],
        ["momentum3m", "Kursentwicklung · 3 Monate", "percent", "returns.3M"],
        ["momentum6m", "Kursentwicklung · 6 Monate", "percent", "returns.6M"],
        ["momentum12m", "Kursentwicklung · 12 Monate", "percent", "returns.12M"],
        ["momentum12m1m", "12 Monate ohne den letzten", "percent", "return12M1M"],
        ["relativeStrength12m", "Relative Staerke · 12 Monate", "percent", "relativeStrength.12M"]
      ]],
      ["trend", "Trendlage", "Wo steht der Kurs zu seinen Durchschnitten?", [
        ["priceTo20dma", "Abstand zum 20-Tage-Durchschnitt", "percent", "distanceToSMA20"],
        ["priceTo50dma", "Abstand zum 50-Tage-Durchschnitt", "percent", "distanceToSMA50"],
        ["priceTo200dma", "Abstand zum 200-Tage-Durchschnitt", "percent", "distanceToSMA200"],
        ["distanceTo52wHigh", "Abstand zum 52-Wochen-Hoch", "percent", "distanceTo52wHigh"],
        ["distanceTo52wLow", "Abstand zum 52-Wochen-Tief", "percent", "distanceTo52wLow"]
      ]],
      ["risk", "Kursrisiko", "Wie stark schwankte der Kurs?", [
        ["volatility20d", "Schwankung · 20 Tage", "percent", "volatility20d"],
        ["volatility252d", "Schwankung · 252 Tage", "percent", "volatility252d"],
        ["maxDrawdown", "Groesster Rueckgang · 252 Tage", "percent", "maxDrawdown252d"]
      ]],
      ["volume", "Handel", "Wie viel wird gehandelt?", [
        ["avgVolume20d", "Durchschnittsvolumen · 20 Tage", "count", "avgVolume20d"],
        ["volumeRatio", "Volumenverhaeltnis 20/60", "ratio", "volumeRatio20over60"]
      ]]
    ];

    async function getQuantWorkspace(ticker) {
      ticker = String(ticker || "").toUpperCase();
      var basis = await dienste.getQuantWorkspace(ticker);
      if (basis && basis.state === "AVAILABLE") return basis;
      if (!(await istImUniversum(ticker))) return basis;

      var zeile = await vollZeile(ticker);
      if (!zeile) return basis;
      if (zeile.factorsStatus !== "PRESENT") {
        return { state: "UNAVAILABLE", reason: "NO_FACTOR_ROW",
                 detail: "Die Kursreihe dieses Titels hat den Qualitaetstest des Laufs nicht bestanden." };
      }
      var status = (zeile.factors && typeof zeile.factors.fieldStatusRef === "number")
        ? (((await meta()).fieldStatusTemplates || [])[zeile.factors.fieldStatusRef] || {})
        : ((zeile.factors && zeile.factors.fieldStatus) || {});

      function statusFuer(pfad) {
        if (!pfad) return null;
        var punkt = pfad.indexOf(".");
        if (punkt < 0) return status[pfad] || null;
        var gruppe = status[pfad.slice(0, punkt)];
        return gruppe ? gruppe[pfad.slice(punkt + 1)] || null : null;
      }

      return {
        state: "AVAILABLE", version: "1.0.0-bridge",
        ticker: ticker, name: bezeichnung(zeile),
        asOf: zeile.factors.asOf, fundamentalsAsOf: null, availableAt: null,
        score: { state: "UNAVAILABLE", reason: "NO_FUNDAMENTALS_FOR_THIS_UNIVERSE" },
        pitEligible: false,
        families: QUANT_FAMILIEN.map(function (fam) {
          return {
            id: fam[0], label: fam[1], question: fam[2],
            metrics: fam[3].map(function (m) {
              var pfad = m[3];
              var roh = pfad ? faktor(zeile, pfad) : null;
              var st = statusFuer(pfad);
              var wert = roh === null ? null : (m[2] === "percent" ? roh * 100 : roh);
              return {
                metricId: m[0], label: m[1], unit: m[2],
                value: wert,
                state: wert === null ? "SOURCE_MISSING" : "AVAILABLE",
                reason: wert !== null ? null
                  : !pfad ? "Fundamentaldaten liegen fuer dieses Universum nicht vor."
                  : st === "INSUFFICIENT_HISTORY" ? "Die Kursreihe reicht fuer diesen Zeitraum nicht zurueck."
                  : "Fuer diesen Titel nicht ausgeliefert.",
                description: null,
                owner: "scripts/market/build-market-factors.mjs",
                catalog: "quant/data/proof/index.json",
                panelVersion: faktorEngineVersion(),
                asOf: zeile.factors.asOf, availableAt: zeile.factors.asOf
              };
            })
          };
        }),
        methodologyHref: "/universe/stock/?ticker=" + encodeURIComponent(ticker),
        legacyHref: "/universe/stock/?ticker=" + encodeURIComponent(ticker)
      };
    }
    /* Reine Beschriftung der Kachel - die Engine, aus der die Faktoren
       stammen. Steht hier als Konstante, damit nicht jede Kachel auf
       eine Datei warten muss. */
    function faktorEngineVersion() { return "market-factors-1.0.0"; }

    // -------------------------------------------------------- Screener
    var SCREENER_FELDER = {
      momentum6m: "returns.6M",
      momentum3m: "returns.3M",
      momentum12m: "returns.12M",
      priceTo200dma: "distanceToSMA200",
      priceTo50dma: "distanceToSMA50",
      maxDrawdown: "maxDrawdown252d",
      volatility: "volatility252d"
    };
    var NUR_FUNDAMENTAL = ["revenueGrowth", "operatingMargin", "fcfMargin", "roic", "price"];

    function screenerZeile(r) {
      var z = { ticker: r.ticker, securityId: r.securityId, status: "active" };
      Object.keys(SCREENER_FELDER).forEach(function (id) {
        var pfad = SCREENER_FELDER[id];
        /* Die Indexzeile traegt die Faktoren flach: "returns.6M" ist ein
           Feldname, kein Pfad. */
        var v = r[pfad];
        z[id] = Number.isFinite(v) ? v * 100 : null;
      });
      z.avgVolume20d = r.avgVolume20d;
      /* Fundamentalfelder gibt es fuer dieses Universum nicht. null heisst
         "unbekannt" - die Query-Engine laesst damit keinen Filter zu, und
         genau das ist richtig. */
      NUR_FUNDAMENTAL.forEach(function (id) { z[id] = null; });
      return z;
    }

    async function screen(abfrage) {
      var basisErgebnis = null;
      try {
        var zeilen = await alleZeilen();
        var universum = await getUniverse();
        /* Der Screener rechnet ueber das Produktuniversum. Ein Warrant
           mit 400 % Zwoelfmonatsrendite ist kein Fund, sondern ein
           Derivat - und stand vor dem Aufraeumen an der Spitze der
           Momentumliste. */
        var imProduktZeilen = zeilen.filter(imProdukt);
        var ausgeschlossen = zeilen.length - imProduktZeilen.length;
        var kandidaten = imProduktZeilen.filter(function (r) { return r.hasFactors; })
          .map(screenerZeile);
        var ergebnis = query.execute(abfrage, kandidaten);
        var nachTicker = {};
        universum.stocks.forEach(function (s) { nachTicker[s.ticker] = s; });
        var zeilenNachTicker = {};
        zeilen.forEach(function (r) { zeilenNachTicker[r.ticker] = r; });

        return {
          state: "AVAILABLE",
          query: ergebnis.query, queryHash: ergebnis.queryHash,
          scope: "PRODUCT_UNIVERSE_PREVIEW",
          eligible: kandidaten.length,
          universeSize: imProduktZeilen.length,
          membershipSize: zeilen.length,
          excludedNonEquities: ausgeschlossen,
          stocks: ergebnis.rows.map(function (r) {
            return nachTicker[r.ticker] ||
                   (zeilenNachTicker[r.ticker] ? indexAlsProdukt(zeilenNachTicker[r.ticker]) : null);
          }).filter(Boolean)
        };
      } catch (e) {
        basisErgebnis = await dienste.screen(abfrage);
        return basisErgebnis;
      }
    }

    async function getDiscover() {
      var rezepte = dienste.getRecipes();
      var sammlungen = [];
      for (var i = 0; i < rezepte.length; i++) {
        var rezept = rezepte[i];
        sammlungen.push(Object.assign({}, rezept, { result: await screen(rezept.query) }));
      }
      return { collections: sammlungen, scope: "FULL_UNIVERSE_PREVIEW" };
    }

    /* Alles, was die Bruecke nicht besser kann, bleibt unveraendert:
       Technical, Elliott, Fundamentals-Historie und der Strategiekontext
       haengen an Datensaetzen, die es nur fuer die freigegebenen Titel
       gibt. Dort ist der bestehende Zustand die richtige Antwort. */
    var api = Object.assign({}, dienste, {
      getUniverse: getUniverse,
      getMarketIntelligence: getMarketIntelligence,
      getStockIntelligence: getStockIntelligence,
      getQuantWorkspace: getQuantWorkspace,
      screen: screen,
      getDiscover: getDiscover
    });

    /* Fuer die Oberflaechenteile der Bruecke (Suche, Live-Chart). */
    api.bridge = {
      alleZeilen: alleZeilen, index: index, meta: meta, freigabe: freigabe,
      vollZeile: vollZeile, indexAlsProdukt: indexAlsProdukt
    };
    g.VUBridgeServices = api;
    return api;
  }

  g.VUProductServices = { create: create, base: Basis };
})(typeof window !== "undefined" ? window : globalThis);
