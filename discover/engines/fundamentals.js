/* =========================================================================
   VISION UNIVERSE DISCOVER — fundamentals.js

   DER KURS ZEIGT, WAS DIE AKTIE GEMACHT HAT.
   DIE FUNDAMENTALS ZEIGEN, WAS DAS UNTERNEHMEN GEMACHT HAT.

   Dieses Modul liest die kompakten Consumer-Bundles der SEC-Pipeline
   (scripts/quant/sec/consumer.py: Annual / Quarterly / TTM, strikt
   getrennt, jede Zahl mit Filing) und rechnet daraus - deterministisch,
   ohne Schaetzung, ohne Sprachmodell - die Consumer-Bausteine:

     compare()   DAMALS VS. HEUTE mit adaptivem Horizont (10 -> 5 -> 3 ->
                 erste vs. letzte valide Periode), nur Werte, die es gibt
     journey()   DIE ENTWICKLUNG DES UNTERNEHMENS: Jahresreihen fuer
                 Umsatz, Gewinn, Cashflow, Margen, EPS, Schulden/Kasse, Aktien
     story()     FUNDAMENTAL STORY: Saetze, die rechnerisch belegt sind -
                 jeder mit metric, periodStart, periodEnd, valueStart,
                 valueEnd, calculation, source, asOf
     health()    FUNDAMENTAL HEALTH: Wachstum, Profitabilitaet, Cashflow,
                 Bilanz, Verwaesserung - mit dokumentierten Schwellen
     signals()   Fundamentale Discover-Signale fuer Sammlungen
     latest()    WIE STEHT DAS GESCHAEFT HEUTE DA: letztes Geschaeftsjahr
                 und TTM, jeweils mit Periode benannt

   Annual, Quarterly und TTM werden nie vermischt: compare/journey/story/
   health rechnen auf Geschaeftsjahren (FY); latest() zeigt TTM getrennt und
   benennt "durch welches Quartal". Fehlt ein Wert, fehlt die Zeile - nie
   eine Null als Platzhalter.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "fundamentals-1.2.0";

  /* ------------------------------------------------ PLAUSIBILITAET (V4 §22)

     Eine Marge von 1 337 % ist eine wahre Division und trotzdem keine
     Auskunft: Crown Castle meldet unter dem ASC-606-Konzept nur einen
     Teil des Umsatzes, der freie Cashflow steht gegen den ganzen. Banken
     und Versicherer haben keinen Umsatz, der zu einem freien Cashflow
     passt. Und ein Unternehmen mit 36 000 $ Umsatz hat keine Nettomarge,
     die man einem Leser zeigen sollte. Diese Regeln nehmen solche Zahlen
     aus Karten, Sammlungen und Health-Zeilen - mit Grund, nie mit einem
     erfundenen Ersatzwert. */
  var PLAUSIBILITY = {
    minRevenueForMargins: 50e6,       /* USD: darunter keine Margen */
    maxAbsMargin: 1.5,                /* |Marge| > 150 % = Nenner passt nicht zum Zaehler */
    maxAbsMarginExpansionPp: 100,     /* Prozentpunkte in drei Jahren */
    revenueFragmentFactor: 1.5,       /* |Gewinn| oder |FCF| > 1,5 x Umsatz: Umsatz ist ein Fragment */
    maxFiscalYearAgeYears: 2,         /* juengstes Geschaeftsjahr aelter als zwei Jahre: veraltet */
    financialSectors: ["Financials", "Real Estate"],
    maxRevenueToAssetsForBalanceSheetBusiness: 0.08   /* Umsatz/Bilanzsumme darunter: Bank, Versicherer, Vermoegensverwalter */
  };

  function marginCheck(model, fy, opts) {
    opts = opts || {};
    var rev = byYear(model.annual.revenue || [])[fy], ni = byYear(model.annual.net_income || [])[fy],
        fcf = byYear(model.annual.free_cash_flow || [])[fy];
    var out = { netMargin: null, fcfMargin: null, omitted: {} };
    var finanz = opts.sector && PLAUSIBILITY.financialSectors.indexOf(opts.sector) !== -1;
    /* Ohne Sektor (die kuratierte Zuordnung deckt nur einen Teil des
       Universums) verraet die Bilanz das Geschaeftsmodell: Banken,
       Versicherer und Vermoegensverwalter setzen weniger als 8 % ihrer
       Bilanzsumme um. Fuer sie ist "freier Cashflow zu Umsatz" keine
       Kennzahl - der Cashflow einer Bank sind Einlagen und Kredite. */
    var assets = byYear(model.annual.total_assets || [])[fy];
    if (!finanz && rev && assets && typeof assets.v === "number" && assets.v > 0 && typeof rev.v === "number" && rev.v > 0 &&
        rev.v / assets.v < PLAUSIBILITY.maxRevenueToAssetsForBalanceSheetBusiness) {
      finanz = true; out.balanceSheetBusiness = { revenueToAssets: rev.v / assets.v, detail: "Umsatz " + Math.round(rev.v) + " zu Bilanzsumme " + Math.round(assets.v) };
    }
    if (!rev || typeof rev.v !== "number" || rev.v <= 0) { out.omitted.netMargin = out.omitted.fcfMargin = { reason: "NO_REVENUE" }; return out; }
    if (rev.v < PLAUSIBILITY.minRevenueForMargins) {
      /* vu-currency: C - Diagnosetext einer Auslassung, kein Anzeigewert. Die Schwelle ist in USD definiert */
      out.omitted.netMargin = out.omitted.fcfMargin = { reason: "REVENUE_TOO_SMALL", detail: "Umsatz " + Math.round(rev.v) + " $ unter " + PLAUSIBILITY.minRevenueForMargins + " $" };
      return out;
    }
    if (ni && typeof ni.v === "number") {
      var nm = ni.v / rev.v;
      if (Math.abs(ni.v) > rev.v * PLAUSIBILITY.revenueFragmentFactor) out.omitted.netMargin = { reason: "REVENUE_FRAGMENT_SUSPECTED", detail: "|Gewinn| " + Math.round(ni.v) + " > " + PLAUSIBILITY.revenueFragmentFactor + " x Umsatz " + Math.round(rev.v) };
      else if (Math.abs(nm) > PLAUSIBILITY.maxAbsMargin) out.omitted.netMargin = { reason: "MARGIN_OUT_OF_BAND", detail: "Nettomarge " + (nm * 100).toFixed(0) + " %" };
      else out.netMargin = nm;
    }
    if (fcf && typeof fcf.v === "number") {
      var fm = fcf.v / rev.v;
      if (finanz) out.omitted.fcfMargin = { reason: "NOT_APPLICABLE_FINANCIAL", detail: "Free Cashflow zu Umsatz ist fuer " + (opts.sector || "ein Bilanzgeschaeft (Umsatz unter 8 % der Bilanzsumme)") + " keine belastbare Kennzahl" };
      else if (Math.abs(fcf.v) > rev.v * PLAUSIBILITY.revenueFragmentFactor) out.omitted.fcfMargin = { reason: "REVENUE_FRAGMENT_SUSPECTED", detail: "|FCF| " + Math.round(fcf.v) + " > " + PLAUSIBILITY.revenueFragmentFactor + " x Umsatz " + Math.round(rev.v) };
      else if (Math.abs(fm) > PLAUSIBILITY.maxAbsMargin) out.omitted.fcfMargin = { reason: "MARGIN_OUT_OF_BAND", detail: "FCF-Marge " + (fm * 100).toFixed(0) + " %" };
      else out.fcfMargin = fm;
    }
    return out;
  }

  /* Ist das juengste Geschaeftsjahr noch eine Auskunft ueber heute? */
  function staleness(model) {
    if (!model || !model.years.length) return { stale: false, fiscalYear: null, ageYears: null };
    var fy = model.years[model.years.length - 1];
    var rows = model.annual.revenue || model.annual.net_income || [];
    var r = byYear(rows)[fy];
    var ende = r && r.end ? r.end : null;
    var ref = model.asOf || (model.generatedAt ? String(model.generatedAt).slice(0, 10) : null);
    if (!ende || !ref) return { stale: false, fiscalYear: fy, ageYears: null, end: ende };
    var age = (Date.parse(ref) - Date.parse(ende)) / (365.25 * 86400000);
    return { stale: age > PLAUSIBILITY.maxFiscalYearAgeYears, fiscalYear: fy, ageYears: Math.round(age * 10) / 10, end: ende,
             reason: age > PLAUSIBILITY.maxFiscalYearAgeYears ? "FISCAL_YEAR_STALE" : null };
  }
  var SOURCE = "sec_edgar:companyfacts";

  /* ------------------------------------------------------------ Lesen */

  var COLUMNS_DEFAULT = ["fy", "fp", "end", "v", "filed", "accn", "derived"];

  function rows(bundle, kind, metric) {
    var block = bundle && bundle[kind];
    var list = block && block[metric];
    if (!Array.isArray(list)) return [];
    var cols = (bundle.columns || COLUMNS_DEFAULT);
    return list.map(function (r) {
      var o = {};
      for (var i = 0; i < cols.length; i++) o[cols[i]] = r[i];
      o.metric = metric;
      return o;
    }).filter(function (o) { return typeof o.v === "number" && isFinite(o.v); })
      .sort(function (a, b) { return a.fy - b.fy || String(a.end).localeCompare(String(b.end)); });
  }

  function byYear(list) {
    var m = {};
    list.forEach(function (r) { m[r.fy] = r; });
    return m;
  }

  /** Das Lesemodell: alle Jahresreihen einmal aufgeloest. */
  function fromBundle(bundle) {
    if (!bundle || bundle.schema !== "vu-consumer-fundamentals-1.0.0") return null;
    var metrics = Object.keys(bundle.annual || {});
    var annual = {};
    metrics.forEach(function (m) { annual[m] = rows(bundle, "annual", m); });
    var quarterly = {};
    Object.keys(bundle.quarterly || {}).forEach(function (m) { quarterly[m] = rows(bundle, "quarterly", m); });
    var ttm = bundle.ttm || {};
    var revenue = annual.revenue || [];
    return {
      version: VERSION,
      cik: bundle.cik, name: bundle.name, tickers: bundle.tickers || [],
      asOf: bundle.asOf, generatedAt: bundle.generatedAtUtc,
      units: bundle.units || {},
      annual: annual, quarterly: quarterly, ttm: ttm,
      years: revenue.map(function (r) { return r.fy; }),
      coverage: bundle.coverage || {},
      source: SOURCE
    };
  }

  /* ------------------------------------------------------------ Rechnen */

  function pct(a, b) { return (typeof a === "number" && typeof b === "number" && b !== 0) ? (a / b - 1) : null; }
  function cagr(a, b, years) {
    if (typeof a !== "number" || typeof b !== "number" || a <= 0 || b <= 0 || !(years > 0)) return null;
    return Math.pow(b / a, 1 / years) - 1;
  }
  function ratio(a, b) { return (typeof a === "number" && typeof b === "number" && b !== 0) ? a / b : null; }

  /** Margen je Geschaeftsjahr - nur wo Zaehler und Nenner aus demselben FY stammen. */
  function marginSeries(model, numerator) {
    var rev = byYear(model.annual.revenue || []);
    return (model.annual[numerator] || []).map(function (r) {
      var v = rev[r.fy];
      if (!v || v.v === 0) return null;
      return { fy: r.fy, end: r.end, v: r.v / v.v, filed: r.filed, accn: r.accn, metric: numerator + "_margin",
               inputs: [numerator, "revenue"], calculation: numerator + " / revenue (FY " + r.fy + ")" };
    }).filter(Boolean);
  }

  function evidence(startRow, endRow, model, calculation) {
    return {
      metric: startRow.metric,
      periodStart: { fy: startRow.fy, end: startRow.end, filed: startRow.filed || null, accession: startRow.accn || null },
      periodEnd: { fy: endRow.fy, end: endRow.end, filed: endRow.filed || null, accession: endRow.accn || null },
      valueStart: startRow.v, valueEnd: endRow.v,
      calculation: calculation, source: model.source, asOf: model.asOf,
      version: VERSION
    };
  }

  /* ------------------------------------------------------------ Horizont */

  var HORIZONS = [10, 5, 3];

  /**
   * Der laengste sinnvolle echte Vergleich auf der Umsatzreihe: 10, sonst
   * 5, sonst 3 Jahre, sonst erste vs. letzte valide Periode (>= 1 Jahr).
   */
  function horizon(model) {
    var years = model.years;
    if (!years.length) return null;
    var latest = years[years.length - 1];
    for (var i = 0; i < HORIZONS.length; i++) {
      if (years.indexOf(latest - HORIZONS[i]) !== -1) return { years: HORIZONS[i], from: latest - HORIZONS[i], to: latest, kind: "FIXED" };
    }
    if (years.length >= 2) return { years: latest - years[0], from: years[0], to: latest, kind: "FIRST_VS_LATEST" };
    return null;
  }

  /**
   * Sprung in der Aktienanzahl zwischen zwei Geschaeftsjahren: ein Split,
   * ein Reverse Split oder eine Kapitalmassnahme. Die SEC-Zeitreihe ist
   * NICHT splitbereinigt ueber die Jahre hinweg (jeder Wert steht so, wie
   * er damals berichtet wurde), also sind Gewinn je Aktie und Aktienanzahl
   * ueber einen solchen Sprung hinweg nicht vergleichbar. NVIDIA: 569 Mio.
   * Aktien FY2016, 24,5 Mrd. FY2026 - das ist kein Wachstum, das sind zwei
   * Splits. Schwelle: Faktor >= 1,5 oder <= 1/1,5 von einem FY zum naechsten.
   */
  /**
   * Zwei "Geschaeftsjahre", deren Enden weniger als 300 Tage auseinanderliegen,
   * sind kein Jahresvergleich: bei einem Wechsel des Geschaeftsjahresendes
   * (VF Corp Dezember -> Maerz 2019, L3Harris Juni -> Dezember 2019) traegt
   * die SEC-Reihe fuer das Uebergangsjahr einen Zwoelfmonatswert, der sich
   * mit dem Vorjahr ueberschneidet. 53 von 5 066 Unternehmen im Bulk-Lauf.
   */
  var MIN_YEAR_GAP_DAYS = 300;
  function yearsAdjacent(model, y0, y1) {
    var series = model.annual.revenue || model.annual.net_income || [];
    var m = byYear(series);
    if (!m[y0] || !m[y1] || !m[y0].end || !m[y1].end) return true;
    var d = (new Date(m[y1].end) - new Date(m[y0].end)) / 86400000;
    return d >= MIN_YEAR_GAP_DAYS;
  }
  var SHARE_JUMP_FACTOR = 1.5;
  function shareDiscontinuity(model, from, to) {
    var series = model.annual.diluted_weighted_average_shares || model.annual.shares_outstanding || [];
    var m = byYear(series), years = Object.keys(m).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 1; i < years.length; i++) {
      var y0 = years[i - 1], y1 = years[i];
      if (y1 <= from || y0 >= to) continue;
      if (!(m[y0].v > 0) || !(m[y1].v > 0)) continue;
      var ratio = m[y1].v / m[y0].v;
      if (ratio >= SHARE_JUMP_FACTOR || ratio <= 1 / SHARE_JUMP_FACTOR) {
        return { fromFy: y0, toFy: y1, ratio: ratio,
                 note: "Gewinn je Aktie und Aktienanzahl sind über diesen Zeitraum nicht vergleichbar: zwischen den berichteten Werten für Geschäftsjahr " + y0 + " und " + y1 +
                       " springt die Aktienanzahl um den Faktor " + ratio.toFixed(1).replace(".", ",") + " — ein Aktiensplit oder eine Kapitalmaßnahme, die in der berichteten Zeitreihe nicht rückwirkend bereinigt ist." };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------ DAMALS VS. HEUTE */

  var COMPARE_ROWS = [
    { id: "revenue",            label: "Umsatz",            metric: "revenue",            kind: "money" },
    { id: "net_income",         label: "Nettogewinn",       metric: "net_income",         kind: "money" },
    { id: "operating_margin",   label: "Operative Marge",   metric: "operating_income",   kind: "margin" },
    { id: "free_cash_flow",     label: "Free Cashflow",     metric: "free_cash_flow",     kind: "money" },
    { id: "eps_diluted",        label: "Gewinn je Aktie",   metric: "eps_diluted",        kind: "per_share" },
    { id: "shares",             label: "Aktienanzahl",      metric: "diluted_weighted_average_shares", fallback: "shares_outstanding", kind: "shares" },
    { id: "net_debt",           label: "Nettoschulden",     metric: "net_debt",           kind: "money" }
  ];

  /* Ende -> Anfang, einmal je Reihe.

     Faellt der Kern aus (die Seite hat ihn nicht geladen), bleibt die
     Zuordnung leer - dann rechnet der Vertrag die Flussgroesse nicht um
     und sagt das auch. Ein geratener Periodenanfang waere schlimmer. */
  function periodenGrenzen(series) {
    var E = (typeof VUFx !== "undefined" && VUFx && VUFx.Engine) ? VUFx.Engine : null;
    if (!E || typeof E.periodIndex !== "function") return {};
    return E.periodIndex(series || []);
  }

  /* Dieselbe Zuordnung fuer eine Oberflaeche, die nur die
     veroeffentlichten Daten vor sich hat.

     Die Vergleichszeilen tragen "damals" und "heute" - zwei Enden, aus
     denen sich kein Anfang ableiten laesst. Die Jahresreihe daneben
     traegt alle Enden, und Geschaeftsjahresenden sind fuer ein
     Unternehmen ueber alle Kennzahlen dieselben. Aus ihrer Vereinigung
     entsteht die Kette, aus der Kette der Anfang. */
  function periodenIndex(journeyOderTracks) {
    var tracks = (journeyOderTracks && journeyOderTracks.tracks) || journeyOderTracks || null;
    if (!tracks) return {};
    var enden = {};
    Object.keys(tracks).forEach(function (k) {
      var t = tracks[k];
      if (!t) return;
      var listen = Array.isArray(t) ? [t] : Object.keys(t).map(function (m) { return t[m]; });
      listen.forEach(function (liste) {
        if (!Array.isArray(liste)) return;
        liste.forEach(function (r) { if (r && r.end) enden[r.end] = true; });
      });
    });
    /* Die erste Periode bekommt ihren Anfang aus der Laenge der
       folgenden. Ohne sie bliebe der erste Balken einer Jahresreihe in
       Originalwaehrung, waehrend alle anderen in Euro stuenden - ein
       Diagramm mit zwei Waehrungen ist schlechter als eines mit einer.
       Die Ableitung kommt aus den Perioden desselben Unternehmens, nicht
       aus dem Kalender. */
    var E = (typeof VUFx !== "undefined" && VUFx && VUFx.Engine) ? VUFx.Engine : null;
    if (!E || typeof E.periodIndex !== "function") return {};
    return E.periodIndex(Object.keys(enden).sort().map(function (e) { return { end: e }; }),
                         { inferFirstFromChain: true });
  }

  function compare(model) {
    var h = model && horizon(model);
    if (!h) return { available: false, reason: "NO_ANNUAL_HISTORY" };
    var out = [];
    var jump = shareDiscontinuity(model, h.from, h.to);
    COMPARE_ROWS.forEach(function (def) {
      if (jump && (def.kind === "per_share" || def.kind === "shares")) return;
      var series = def.kind === "margin" ? marginSeries(model, def.metric) : (model.annual[def.metric] || []);
      if (!series.length && def.fallback) series = model.annual[def.fallback] || [];
      var m = byYear(series);
      var a = m[h.from], b = m[h.to];
      if (!a || !b) return;
      /* Der Periodenanfang, abgeleitet aus der Vorperiode.

         Eine Flussgroesse wird mit dem Periodenmittel umgerechnet, und
         dafuer braucht der Currency Contract beide Grenzen. Das
         Geschaeftsjahr steht nicht im Kalender - Toyota endet im Maerz,
         Alibaba auch -, also wird es NICHT angenommen, sondern aus dem
         Ende der Vorperiode abgeleitet. Die Regel dafuer steht im Kern
         (currency-engine.resolvePeriodChain); hier wird sie benutzt und
         nicht nachgebaut. */
      var grenzen = periodenGrenzen(series);
      var row = { id: def.id, label: def.label, kind: def.kind, metric: def.metric,
                  unit: def.kind === "margin" ? "ratio" : (model.units[def.metric] || null),
                  then: { fy: a.fy, end: a.end, start: grenzen[a.end] || null, value: a.v },
                  now: { fy: b.fy, end: b.end, start: grenzen[b.end] || null, value: b.v } };
      if (def.kind === "margin") {
        row.change = { pp: (b.v - a.v) * 100, calculation: "Marge FY " + b.fy + " minus Marge FY " + a.fy + " in Prozentpunkten" };
        row.evidence = evidence(a, b, model, a.calculation + " vs. " + b.calculation);
      } else {
        var p = pct(b.v, a.v);
        row.change = { abs: b.v - a.v, pct: (a.v > 0 && b.v !== null) ? p : null, cagr: cagr(a.v, b.v, h.years),
                       calculation: def.metric + " FY " + b.fy + " / FY " + a.fy + " - 1" };
        row.evidence = evidence(a, b, model, row.change.calculation);
      }
      out.push(row);
    });
    return { available: out.length > 0, horizon: h, rows: out, note: jump ? jump.note : null, shareJump: jump,
             asOf: model.asOf, source: model.source, version: VERSION };
  }

  /* ------------------------------------------------------------ JOURNEY */

  function journey(model) {
    if (!model || !model.years.length) return { available: false, reason: "NO_ANNUAL_HISTORY" };
    function pts(list) { return list.map(function (r) { return { fy: r.fy, end: r.end, v: r.v, filed: r.filed || null, accn: r.accn || null }; }); }
    var gross = marginSeries(model, "gross_profit"), op = marginSeries(model, "operating_income"), net = marginSeries(model, "net_income");
    var tracks = {
      revenue: pts(model.annual.revenue || []),
      net_income: pts(model.annual.net_income || []),
      free_cash_flow: pts(model.annual.free_cash_flow || []),
      operating_cash_flow: pts(model.annual.operating_cash_flow || []),
      eps_diluted: pts(model.annual.eps_diluted || []),
      margins: { gross: pts(gross), operating: pts(op), net: pts(net) },
      cash: pts(model.annual.cash_and_equivalents || []),
      debt: pts(model.annual.total_debt || []),
      shares: pts(model.annual.diluted_weighted_average_shares || model.annual.shares_outstanding || [])
    };
    var available = Object.keys(tracks).filter(function (k) {
      return k === "margins" ? (tracks.margins.gross.length || tracks.margins.operating.length || tracks.margins.net.length) : tracks[k].length >= 2;
    });
    var first = model.years[0], last = model.years[model.years.length - 1];
    var jump = shareDiscontinuity(model, first, last);
    return { available: available.length > 0, tracks: tracks, availableTracks: available, years: model.years.slice(),
             caveats: jump ? { eps_diluted: jump.note, shares: jump.note } : {},
             units: model.units, asOf: model.asOf, source: model.source, version: VERSION };
  }

  /* ------------------------------------------------------------ STORY */

  function fmtPct(x) { return (x >= 0 ? "+" : "") + (x * 100).toFixed(0).replace(".", ",") + " %"; }
  /* "mehr als verdoppelt" fuer +4 210 % waere eine Untertreibung, die sich
     wie Desinteresse liest: das Vielfache wird ausgesprochen. */
  function vielfaches(m) {
    if (m >= 100) return "um ein Vielfaches gesteigert (auf das " + Math.floor(m) + "-Fache)";
    if (m >= 10) return "auf das " + Math.floor(m) + "-Fache gesteigert";
    if (m >= 5) return "mehr als verfünffacht";
    if (m >= 4) return "mehr als vervierfacht";
    if (m >= 3) return "mehr als verdreifacht";
    return "mehr als verdoppelt";
  }

  /**
   * Nur Saetze, die rechnerisch aus zwei benannten Perioden folgen. Jede
   * Aussage traegt ihren Beleg; die Reihenfolge ist die Reihenfolge der
   * Regeln, nicht eine Gewichtung.
   */
  function story(model) {
    var h = model && horizon(model);
    if (!h) return { available: false, statements: [] };
    var rev = byYear(model.annual.revenue || []), ni = byYear(model.annual.net_income || []);
    var fcf = byYear(model.annual.free_cash_flow || []);
    var opm = byYear(marginSeries(model, "operating_income"));
    var sh = byYear(model.annual.diluted_weighted_average_shares || model.annual.shares_outstanding || []);
    var debt = byYear(model.annual.total_debt || []);
    var st = [];
    var years = model.years, latest = years[years.length - 1], prev = years.indexOf(latest - 1) !== -1 ? latest - 1 : null;

    function add(id, text, a, b, calc, extra) {
      var s = { id: id, text: text, evidence: evidence(a, b, model, calc) };
      if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
      st.push(s);
    }

    /* Umsatz ueber den Horizont. */
    if (rev[h.from] && rev[h.to] && rev[h.from].v > 0) {
      var g = pct(rev[h.to].v, rev[h.from].v);
      var jahre = h.years;
      if (g >= 1) add("revenue_doubled", "Der Umsatz hat sich in " + jahre + " Jahren " + vielfaches(1 + g) + ".", rev[h.from], rev[h.to], "revenue FY " + h.to + " / FY " + h.from + " - 1 = " + fmtPct(g), { growth: g, years: jahre, multiple: 1 + g });
      else if (g >= 0.25) add("revenue_up", "Der Umsatz ist in " + jahre + " Jahren um " + fmtPct(g) + " gewachsen.", rev[h.from], rev[h.to], "revenue FY " + h.to + " / FY " + h.from + " - 1", { growth: g, years: jahre });
      else if (g <= -0.15) add("revenue_down", "Der Umsatz liegt heute " + fmtPct(g) + " unter dem Stand vor " + jahre + " Jahren.", rev[h.from], rev[h.to], "revenue FY " + h.to + " / FY " + h.from + " - 1", { growth: g, years: jahre });
      else add("revenue_flat", "Der Umsatz hat sich in " + jahre + " Jahren kaum veraendert (" + fmtPct(g) + ").", rev[h.from], rev[h.to], "revenue FY " + h.to + " / FY " + h.from + " - 1", { growth: g, years: jahre });
    }
    /* Gewinn schneller als Umsatz. */
    if (rev[h.from] && rev[h.to] && ni[h.from] && ni[h.to] && rev[h.from].v > 0 && ni[h.from].v > 0 && ni[h.to].v > 0) {
      var gr = pct(rev[h.to].v, rev[h.from].v), gn = pct(ni[h.to].v, ni[h.from].v);
      if (gn > gr + 0.1) add("profit_faster", "Der Gewinn wächst schneller als der Umsatz.", ni[h.from], ni[h.to], "net_income " + fmtPct(gn) + " vs. revenue " + fmtPct(gr) + " ueber " + h.years + " Jahre", { profitGrowth: gn, revenueGrowth: gr });
      else if (gr > gn + 0.1) add("profit_slower", "Der Umsatz wächst schneller als der Gewinn.", ni[h.from], ni[h.to], "net_income " + fmtPct(gn) + " vs. revenue " + fmtPct(gr) + " ueber " + h.years + " Jahre", { profitGrowth: gn, revenueGrowth: gr });
    }
    /* Vom Verlust in den Gewinn (und umgekehrt). */
    if (ni[h.from] && ni[h.to] && ni[h.from].v < 0 && ni[h.to].v > 0) add("turned_profitable", "Das Unternehmen schreibt heute Gewinn - vor " + h.years + " Jahren war es ein Verlust.", ni[h.from], ni[h.to], "net_income FY " + h.from + " < 0, FY " + h.to + " > 0");
    if (ni[h.from] && ni[h.to] && ni[h.from].v > 0 && ni[h.to].v < 0) add("turned_loss", "Das Unternehmen schreibt heute Verlust - vor " + h.years + " Jahren war es profitabel.", ni[h.from], ni[h.to], "net_income FY " + h.from + " > 0, FY " + h.to + " < 0");
    /* Operative Marge. */
    if (opm[h.from] && opm[h.to]) {
      var dpp = (opm[h.to].v - opm[h.from].v) * 100;
      if (dpp >= 3) add("margin_up", "Die operative Marge ist deutlich gestiegen (" + dpp.toFixed(1).replace(".", ",") + " Prozentpunkte).", opm[h.from], opm[h.to], "operating_income / revenue, FY " + h.to + " minus FY " + h.from, { pp: dpp });
      else if (dpp <= -3) add("margin_down", "Die operative Marge ist deutlich gesunken (" + dpp.toFixed(1).replace(".", ",") + " Prozentpunkte).", opm[h.from], opm[h.to], "operating_income / revenue, FY " + h.to + " minus FY " + h.from, { pp: dpp });
    }
    /* Free Cashflow zuletzt - nur wenn das Vorjahr ein volles Jahr davor liegt. */
    if (prev !== null && fcf[prev] && fcf[latest] && yearsAdjacent(model, prev, latest)) {
      var df = pct(fcf[latest].v, fcf[prev].v);
      if (fcf[prev].v > 0 && fcf[latest].v > 0 && df <= -0.15) add("fcf_down", "Der freie Cashflow ist zuletzt zurückgegangen (" + fmtPct(df) + ").", fcf[prev], fcf[latest], "free_cash_flow FY " + latest + " / FY " + prev + " - 1", { change: df });
      else if (fcf[prev].v > 0 && fcf[latest].v > 0 && df >= 0.15) add("fcf_up", "Der freie Cashflow ist zuletzt kräftig gestiegen (" + fmtPct(df) + ").", fcf[prev], fcf[latest], "free_cash_flow FY " + latest + " / FY " + prev + " - 1", { change: df });
      else if (fcf[latest].v < 0) add("fcf_negative", "Der freie Cashflow war im letzten Geschaeftsjahr negativ.", fcf[prev], fcf[latest], "free_cash_flow FY " + latest + " < 0");
    }
    /* Aktienanzahl - nur ohne Split/Kapitalmassnahme im Zeitraum. */
    if (!shareDiscontinuity(model, h.from, h.to) && sh[h.from] && sh[h.to] && sh[h.from].v > 0) {
      var ds = pct(sh[h.to].v, sh[h.from].v);
      if (ds >= 0.05) add("shares_up", "Die Zahl der ausstehenden Aktien ist gestiegen (" + fmtPct(ds) + " in " + h.years + " Jahren).", sh[h.from], sh[h.to], "shares FY " + h.to + " / FY " + h.from + " - 1", { change: ds });
      else if (ds <= -0.05) add("shares_down", "Die Zahl der Aktien ist gesunken - das Unternehmen kauft Aktien zurück (" + fmtPct(ds) + " in " + h.years + " Jahren).", sh[h.from], sh[h.to], "shares FY " + h.to + " / FY " + h.from + " - 1", { change: ds });
    }
    /* Verschuldung schneller als Gewinn. */
    if (debt[h.from] && debt[h.to] && ni[h.from] && ni[h.to] && debt[h.from].v > 0 && ni[h.from].v > 0 && ni[h.to].v > 0) {
      var gd = pct(debt[h.to].v, debt[h.from].v), gp = pct(ni[h.to].v, ni[h.from].v);
      if (gd > gp + 0.25 && gd > 0.25) add("debt_faster", "Die Verschuldung ist schneller gestiegen als der Gewinn.", debt[h.from], debt[h.to], "total_debt " + fmtPct(gd) + " vs. net_income " + fmtPct(gp) + " ueber " + h.years + " Jahre", { debtGrowth: gd, profitGrowth: gp });
    }
    return { available: st.length > 0, horizon: h, statements: st, asOf: model.asOf, source: model.source, version: VERSION };
  }

  /* ------------------------------------------------------------ HEALTH */

  /* Schwellen - dokumentiert in docs/VU_FUNDAMENTAL_INTELLIGENCE.md. Alle
     Werte auf Geschaeftsjahren; "Wachstum" ist die Umsatz-CAGR ueber den
     adaptiven Horizont, "Profitabilitaet" die Nettomarge des letzten FY,
     "Cashflow" die FCF-Marge des letzten FY, "Bilanz" Nettoschulden zu FCF,
     "Verwaesserung" die Aktienanzahl ueber den Horizont. */
  var THRESHOLDS = {
    growth:        [[0.20, "Sehr stark"], [0.10, "Stark"], [0.03, "Solide"], [0.0, "Flach"], [-Infinity, "Rückläufig"]],
    profitability: [[0.20, "Sehr stark"], [0.10, "Stark"], [0.03, "Solide"], [0.0, "Knapp"], [-Infinity, "Negativ"]],
    cashflow:      [[0.15, "Sehr stark"], [0.08, "Stark"], [0.0001, "Solide"], [-Infinity, "Negativ"]],
    dilution:      [[-0.03, "Rückkäufe"], [0.02, "Gering"], [0.10, "Moderat"], [Infinity, "Hoch"]]
  };
  function grade(table, x) {
    for (var i = 0; i < table.length; i++) if (x >= table[i][0]) return table[i][1];
    return table[table.length - 1][1];
  }
  function gradeUp(table, x) { /* fuer Skalen, bei denen kleiner besser ist */
    for (var i = 0; i < table.length; i++) if (x <= table[i][0]) return table[i][1];
    return table[table.length - 1][1];
  }

  function health(model, opts) {
    opts = opts || {};
    var h = model && horizon(model);
    if (!model || !model.years.length) return { available: false, categories: [] };
    var latest = model.years[model.years.length - 1];
    var rev = byYear(model.annual.revenue || []), ni = byYear(model.annual.net_income || []), fcf = byYear(model.annual.free_cash_flow || []);
    var nd = byYear(model.annual.net_debt || []), sh = byYear(model.annual.diluted_weighted_average_shares || model.annual.shares_outstanding || []);
    var cats = [];
    if (h && rev[h.from] && rev[h.to]) {
      var c = cagr(rev[h.from].v, rev[h.to].v, h.years);
      if (c !== null) cats.push({ id: "growth", label: "Wachstum", grade: grade(THRESHOLDS.growth, c), value: c, unit: "cagr",
        detail: "Umsatz " + fmtPct(c) + " pro Jahr über " + h.years + " Jahre", evidence: evidence(rev[h.from], rev[h.to], model, "CAGR revenue FY " + h.from + " -> FY " + h.to), thresholds: THRESHOLDS.growth });
    }
    var mc = marginCheck(model, latest, opts);
    var omitted = {};
    if (mc.netMargin !== null) {
      var nm = mc.netMargin;
      cats.push({ id: "profitability", label: "Profitabilitaet", grade: grade(THRESHOLDS.profitability, nm), value: nm, unit: "ratio",
        detail: "Nettomarge " + (nm * 100).toFixed(1).replace(".", ",") + " % im Geschaeftsjahr " + latest, evidence: evidence(ni[latest], rev[latest], model, "net_income / revenue FY " + latest), thresholds: THRESHOLDS.profitability });
    } else if (mc.omitted.netMargin) omitted.profitability = mc.omitted.netMargin;
    if (mc.fcfMargin !== null) {
      var fm = mc.fcfMargin;
      cats.push({ id: "cashflow", label: "Cashflow", grade: grade(THRESHOLDS.cashflow, fm), value: fm, unit: "ratio",
        detail: "Free-Cashflow-Marge " + (fm * 100).toFixed(1).replace(".", ",") + " % im Geschaeftsjahr " + latest, evidence: evidence(fcf[latest], rev[latest], model, "free_cash_flow / revenue FY " + latest), thresholds: THRESHOLDS.cashflow });
    } else if (mc.omitted.fcfMargin) omitted.cashflow = mc.omitted.fcfMargin;
    if (nd[latest]) {
      var g2, det;
      if (nd[latest].v <= 0) { g2 = "Sehr solide"; det = "Mehr Kasse als Schulden (Nettokasse) zum Geschaeftsjahresende " + latest; }
      else if (fcf[latest] && fcf[latest].v > 0) {
        var x = nd[latest].v / fcf[latest].v;
        g2 = x <= 2 ? "Solide" : x <= 4 ? "Belastet" : "Angespannt";
        det = "Nettoschulden entsprechen " + x.toFixed(1).replace(".", ",") + " Jahren freiem Cashflow (FY " + latest + ")";
      } else { g2 = "Angespannt"; det = "Nettoschulden ohne positiven freien Cashflow im Geschaeftsjahr " + latest; }
      cats.push({ id: "balance", label: "Bilanz", grade: g2, value: nd[latest].v, unit: model.units.net_debt || "USD", detail: det,
        evidence: evidence(nd[latest], nd[latest], model, "net_debt FY " + latest + (fcf[latest] ? " / free_cash_flow FY " + latest : "")),
        thresholds: [["net cash", "Sehr solide"], ["<= 2x FCF", "Solide"], ["<= 4x FCF", "Belastet"], ["> 4x FCF oder FCF <= 0", "Angespannt"]] });
    }
    var jump = h && shareDiscontinuity(model, h.from, h.to);
    if (h && !jump && sh[h.from] && sh[h.to] && sh[h.from].v > 0) {
      var ds = pct(sh[h.to].v, sh[h.from].v);
      cats.push({ id: "dilution", label: "Verwässerung", grade: gradeUp(THRESHOLDS.dilution, ds), value: ds, unit: "pct",
        detail: "Aktienanzahl " + fmtPct(ds) + " in " + h.years + " Jahren", evidence: evidence(sh[h.from], sh[h.to], model, "shares FY " + h.to + " / FY " + h.from + " - 1"), thresholds: THRESHOLDS.dilution });
    }
    if (jump) omitted.dilution = jump.note;
    return { available: cats.length > 0, horizon: h, categories: cats, omitted: omitted,
             plausibility: PLAUSIBILITY, staleness: staleness(model),
             asOf: model.asOf, source: model.source, version: VERSION };
  }

  /* ------------------------------------------------------------ LATEST */

  function latest(model, opts) {
    opts = opts || {};
    if (!model) return { available: false };
    var years = model.years, fy = years.length ? years[years.length - 1] : null;
    var out = { available: false, fiscalYear: fy, annual: {}, ttm: {}, ttmThrough: (model.coverage && model.coverage.ttmThrough) || null };
    if (fy !== null) {
      Object.keys(model.annual).forEach(function (m) {
        var r = byYear(model.annual[m])[fy];
        if (r) out.annual[m] = { v: r.v, end: r.end, filed: r.filed || null, accn: r.accn || null, unit: model.units[m] || null };
      });
      out.available = Object.keys(out.annual).length > 0;
    }
    Object.keys(model.ttm || {}).forEach(function (m) {
      var t = model.ttm[m];
      if (t && typeof t.v === "number") out.ttm[m] = { v: t.v, end: t.end, through: t.through || null, kind: t.kind, unit: t.unit || model.units[m] || null, derived: !!t.derived };
    });
    var rev = out.annual.revenue, ni = out.annual.net_income, eq = out.annual.stockholders_equity;
    out.derived = {};
    out.omitted = {};
    if (fy !== null) {
      var mc = marginCheck(model, fy, opts);
      if (mc.netMargin !== null) out.derived.netMargin = mc.netMargin;
      if (mc.fcfMargin !== null) out.derived.fcfMargin = mc.fcfMargin;
      out.omitted = mc.omitted;
      var plausibel = !mc.omitted.netMargin || mc.omitted.netMargin.reason === "NO_REVENUE";
      if (rev && out.annual.operating_income && rev.v >= PLAUSIBILITY.minRevenueForMargins && plausibel) {
        var om = out.annual.operating_income.v / rev.v;
        if (Math.abs(om) <= PLAUSIBILITY.maxAbsMargin) out.derived.operatingMargin = om;
      }
      if (rev && out.annual.gross_profit && rev.v >= PLAUSIBILITY.minRevenueForMargins && plausibel) {
        var gm = out.annual.gross_profit.v / rev.v;
        if (Math.abs(gm) <= PLAUSIBILITY.maxAbsMargin) out.derived.grossMargin = gm;
      }
    }
    if (ni && eq && eq.v > 0) out.derived.roe = ni.v / eq.v;
    out.staleness = staleness(model);
    return out;
  }

  /* ------------------------------------------------------------ SIGNALS */

  /** Fundamentale Signale fuer Discover-Sammlungen - jedes mit Beleg. */
  function signals(model, opts) {
    opts = opts || {};
    var out = {};
    if (!model || !model.years.length) return out;
    out.omitted = {};
    var st = staleness(model);
    if (st.stale) { out.omitted.all = { reason: st.reason, detail: "Juengstes Geschaeftsjahr " + st.fiscalYear + " (Ende " + st.end + ") ist " + st.ageYears + " Jahre alt" }; out.staleness = st; return out; }
    var y = model.years, latest = y[y.length - 1];
    var rev = byYear(model.annual.revenue || []), ni = byYear(model.annual.net_income || []), fcf = byYear(model.annual.free_cash_flow || []);
    var opm = byYear(marginSeries(model, "operating_income")), nd = byYear(model.annual.net_debt || []);
    function has(m, k) { return m[k] && typeof m[k].v === "number"; }
    var r3 = (has(rev, latest) && has(rev, latest - 3)) ? cagr(rev[latest - 3].v, rev[latest].v, 3) : null;
    var r10 = (has(rev, latest) && has(rev, latest - 10)) ? cagr(rev[latest - 10].v, rev[latest].v, 10) : null;
    var mc = marginCheck(model, latest, opts);
    var nm = mc.netMargin, fm = mc.fcfMargin;
    Object.keys(mc.omitted).forEach(function (k) { out.omitted[k] = mc.omitted[k]; });
    /* Wachstum auf einer Basis unter der Margengrenze bleibt eine Zahl -
       aber die Sammlungen pruefen die Basis (fundBasis im Build). */
    if (r3 !== null) out.revenueGrowth3y = { value: r3, evidence: evidence(rev[latest - 3], rev[latest], model, "CAGR revenue 3J") };
    if (r10 !== null) out.revenueGrowth10y = { value: r10, evidence: evidence(rev[latest - 10], rev[latest], model, "CAGR revenue 10J") };
    if (nm !== null) out.netMargin = { value: nm, evidence: evidence(ni[latest], rev[latest], model, "net_income / revenue FY " + latest) };
    if (fm !== null) out.fcfMargin = { value: fm, evidence: evidence(fcf[latest], rev[latest], model, "free_cash_flow / revenue FY " + latest) };
    if (has(ni, latest) && has(ni, latest - 1) && has(ni, latest - 2) && ni[latest - 2].v > 0 && ni[latest - 1].v > 0 && ni[latest].v > 0 &&
        yearsAdjacent(model, latest - 2, latest - 1) && yearsAdjacent(model, latest - 1, latest)) {
      var g1 = pct(ni[latest - 1].v, ni[latest - 2].v), g2 = pct(ni[latest].v, ni[latest - 1].v);
      out.earningsAcceleration = { value: g2 - g1, latestGrowth: g2, priorGrowth: g1, evidence: evidence(ni[latest - 2], ni[latest], model, "net_income Wachstum FY" + latest + " (" + fmtPct(g2) + ") vs. FY" + (latest - 1) + " (" + fmtPct(g1) + ")") };
    }
    if (opm[latest] && opm[latest - 3]) {
      var me = (opm[latest].v - opm[latest - 3].v) * 100;
      var revLatest = has(rev, latest) ? rev[latest].v : null, revFrom = has(rev, latest - 3) ? rev[latest - 3].v : null;
      if (revLatest === null || revFrom === null || revLatest < PLAUSIBILITY.minRevenueForMargins || revFrom < PLAUSIBILITY.minRevenueForMargins) {
        out.omitted.marginExpansion3y = { reason: "REVENUE_TOO_SMALL", detail: "Umsatzbasis in FY" + (latest - 3) + " oder FY" + latest + " unter " + PLAUSIBILITY.minRevenueForMargins + " $" };
      } else if (Math.abs(me) > PLAUSIBILITY.maxAbsMarginExpansionPp || mc.omitted.netMargin) {
        out.omitted.marginExpansion3y = { reason: mc.omitted.netMargin ? mc.omitted.netMargin.reason : "MARGIN_OUT_OF_BAND", detail: "Margenaenderung " + me.toFixed(0) + " pp" };
      } else {
        out.marginExpansion3y = { value: me, evidence: evidence(opm[latest - 3], opm[latest], model, "operating margin FY" + latest + " minus FY" + (latest - 3) + " (pp)") };
      }
    }
    var fcfPositive3 = [latest, latest - 1, latest - 2].every(function (k) { return has(fcf, k) && fcf[k].v > 0; });
    if (has(fcf, latest)) out.fcfPositiveThreeYears = { value: fcfPositive3, evidence: evidence(fcf[fcfPositive3 ? latest - 2 : latest], fcf[latest], model, "free_cash_flow > 0 in FY" + (latest - 2) + ".." + latest) };
    if (has(ni, latest) && has(ni, latest - 2) && ni[latest - 2].v < 0 && ni[latest].v > 0) out.turnaround = { value: true, evidence: evidence(ni[latest - 2], ni[latest], model, "net_income FY" + (latest - 2) + " < 0, FY" + latest + " > 0") };
    if (nd[latest]) out.netCash = { value: nd[latest].v <= 0, evidence: evidence(nd[latest], nd[latest], model, "net_debt FY" + latest + " <= 0") };
    if (r10 !== null) {
      var allProfitable = true;
      for (var k = latest - 10; k <= latest; k++) if (!has(ni, k) || ni[k].v <= 0) { allProfitable = false; break; }
      out.compounder = { value: r10 >= 0.10 && allProfitable, revenueCagr10y: r10, allProfitable: allProfitable,
                         evidence: evidence(rev[latest - 10], rev[latest], model, "CAGR revenue 10J >= 10 % und net_income > 0 in jedem FY") };
    }
    out.fiscalYear = latest;
    return out;
  }

  /* ------------------------------------------------------------ PRICE + FUNDAMENTALS */

  /**
   * Kurs und Unternehmen nebeneinander, ohne Kausalitaet: die Kursveraenderung
   * ueber die verfuegbare Reihe und das fundamentale Wachstum ueber die
   * naechstliegenden Geschaeftsjahre - beide Perioden exakt benannt.
   */
  function priceVsFundamentals(model, priceStart, priceEnd) {
    if (!model || !priceStart || !priceEnd || !(priceStart.close > 0)) return { available: false };
    var yStart = Number(String(priceStart.date).slice(0, 4)), yEnd = Number(String(priceEnd.date).slice(0, 4));
    var rev = byYear(model.annual.revenue || []), ni = byYear(model.annual.net_income || []);
    /* Das letzte Geschaeftsjahr, das VOR dem Startdatum endete, und das letzte vor dem Enddatum. */
    function fyBefore(date) { var best = null; model.years.forEach(function (fy) { if (rev[fy] && rev[fy].end <= date) best = fy; }); return best; }
    var a = fyBefore(priceStart.date), b = fyBefore(priceEnd.date);
    if (a === null || b === null || a === b) return { available: false, reason: "NO_TWO_FISCAL_YEARS_IN_RANGE" };
    var out = { available: true, price: { from: priceStart.date, to: priceEnd.date, change: pct(priceEnd.close, priceStart.close) },
                fiscal: { from: a, to: b, years: b - a }, note: "Nebeneinander, nicht Ursache und Wirkung." };
    if (rev[a] && rev[b]) out.revenueChange = { value: pct(rev[b].v, rev[a].v), evidence: evidence(rev[a], rev[b], model, "revenue FY" + b + " / FY" + a + " - 1") };
    if (ni[a] && ni[b] && ni[a].v > 0) out.netIncomeChange = { value: pct(ni[b].v, ni[a].v), evidence: evidence(ni[a], ni[b], model, "net_income FY" + b + " / FY" + a + " - 1") };
    return out;
  }

  /* ------------------------------------------------------------ Capabilities */

  function capabilities(model) {
    if (!model) return { HAS_FUNDAMENTALS: false };
    var c = model.coverage || {}, hz = c.horizons || {};
    return { HAS_FUNDAMENTALS: model.years.length > 0, annualYears: model.years.length,
             HAS_FUNDAMENTALS_3Y: !!hz["3y"], HAS_FUNDAMENTALS_5Y: !!hz["5y"], HAS_FUNDAMENTALS_10Y: !!hz["10y"],
             HAS_TTM: !!(c.ttmMetrics && c.ttmMetrics.length), HAS_QUARTERLY: Object.keys(model.quarterly).length > 0,
             latestFiscalYear: model.years.length ? model.years[model.years.length - 1] : null, ttmThrough: c.ttmThrough || null };
  }

  var api = { PLAUSIBILITY: PLAUSIBILITY, marginCheck: marginCheck, staleness: staleness, VERSION: VERSION, SOURCE: SOURCE, THRESHOLDS: THRESHOLDS, COMPARE_ROWS: COMPARE_ROWS,
              fromBundle: fromBundle, horizon: horizon, compare: compare, journey: journey, story: story,
              health: health, latest: latest, signals: signals, priceVsFundamentals: priceVsFundamentals,
              capabilities: capabilities, shareDiscontinuity: shareDiscontinuity, yearsAdjacent: yearsAdjacent, SHARE_JUMP_FACTOR: SHARE_JUMP_FACTOR, marginSeries: marginSeries, cagr: cagr, periodenIndex: periodenIndex };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Fundamentals = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
