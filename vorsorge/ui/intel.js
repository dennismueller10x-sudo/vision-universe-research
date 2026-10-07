/* =========================================================================
   VISION UNIVERSE VORSORGE — ui/intel.js
   ETF Intelligence: Bestandteile, ETF X-Ray, "Was hat sich geändert?",
   Kosten, Daten/Herkunft, Kurzkopf. Nur echte Daten (SEC N-PORT, SEC
   Risk/Return, ESMA FIRDS); fehlende Werte werden benannt, nie geschätzt.
   ========================================================================= */
(function (global) {
  "use strict";
  var VS = global.VS, V = global.VUVorsorge, F = VS.fmt, esc = VS.esc;
  var HL = V.Holdings;

  var COUNTRY_NAMES = (function () { try { return new Intl.DisplayNames(["de"], { type: "region" }); } catch (e) { return null; } })();
  VS.countryName = function (code) {
    if (!code || code === "UNASSIGNED") return "Nicht zugeordnet";
    if (code === "CASH") return "Liquidität";
    if (code === "XX") return "Ohne Länderangabe";
    if (/^[A-Z]{2}-/.test(code)) code = code.slice(0, 2);   // GLEIF-Untergliederung (US-DE)
    try { return (COUNTRY_NAMES && COUNTRY_NAMES.of(code)) || code; } catch (e) { return code; }
  };
  VS.sectorName = function (k) { return k === "UNASSIGNED" ? "Nicht zugeordnet" : (HL.SECTORS_DE[k] || k); };
  var ASSET_DE = { EQUITY: "Aktien", BOND: "Anleihen", CASH: "Liquidität", FUND: "Fonds / Geldmarkt", ETF: "ETFs", FUTURE: "Futures", OPTION: "Optionen", SWAP: "Swaps", FORWARD: "Devisentermingeschäfte", COMMODITY: "Rohstoffe", DERIVATIVE: "Derivate", UNKNOWN: "Sonstiges" };
  VS.assetName = function (k) { return ASSET_DE[k] || k; };
  VS.money = function (x, c) {
    if (x === null || x === undefined || !isFinite(x)) return "–";
    var a = Math.abs(x), s = a >= 1e12 ? (x / 1e12).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Bio." : a >= 1e9 ? (x / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mrd." : a >= 1e6 ? (x / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " Mio." : Math.round(x).toLocaleString("de-DE");
    return s + " " + (c === "USD" ? "$" : c === "EUR" ? "€" : c || "");
  };
  VS.costPct = function (x) { return x === null || x === undefined || !isFinite(x) ? "–" : (x * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %"; };
  function wpct(x) { return x === null || x === undefined ? "–" : (x * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " %"; }

  /* ---------------------------------------------------- Laden */
  var cache = {};
  VS.holdings = function (series) {
    if (!series) return Promise.resolve(null);
    if (cache[series]) return cache[series];
    cache[series] = VS.getJSON("/vorsorge/data/holdings/" + encodeURIComponent(series) + ".json").then(function (f) {
      var F_ = f.rowFields;
      f.rows = f.holdings.map(function (r) { var o = {}; F_.forEach(function (k, i) { o[k] = r[i]; }); return o; });
      // Ereignisse/Zeitleiste: Spaltenformat -> Change Event 1.0 (Meta-Felder aus der Datei)
      var ch = f.changes || {};
      if (ch.eventFields) ch.events = (ch.events || []).map(function (r) { var e = { fundId: "sec:" + f.seriesId, fromSnapshot: ch.from, toSnapshot: ch.to, asOf: ch.to, source: f.source, version: ch.eventVersion };
        ch.eventFields.forEach(function (k, i) { e[k] = r[i]; }); e.eventId = V.Changes.eventId(e.fundId, ch.from, ch.to, e.eventType, e.entityId); return e; });
      if (f.timelineFields) f.timeline = (f.timeline || []).map(function (r) { var o = {}; f.timelineFields.forEach(function (k, i) { o[k] = r[i]; }); return o; });
      return f;
    }).catch(function () { delete cache[series]; return null; });
    return cache[series];
  };
  /** Holdings-Datei im Format der X-Ray-Engine (Overlap, Look-through). */
  VS.xrayFile = function (f) {
    // Hebel-/Derivatefonds (Gewichte in % des Nettovermoegens, Summe weit ueber/unter 100 %) nicht durchschauen.
    if (!f || f.derivativeHeavy) return null;
    // Nur Wertpapiere (keine Sicherheiten-/Geldmarktfonds, keine Optionen) gehen in Durchschau und Overlap.
    return { asOf: f.asOf, source: f.source, coverage: f.shownWeight, holdings: f.rows.filter(function (r) { return r.weight > 0 && (r.assetType === "EQUITY" || r.assetType === "BOND" || r.assetType === "ETF"); }).map(function (r) {
      return { name: r.name, ticker: r.ticker, isin: null, holdingIdentifier: VS.holdingIdentity(r), weight: r.weight, country: r.country, sector: r.sector, vuTicker: r.vuTicker };
    }) };
  };
  /** Kanonische Identitaet ueber ETFs hinweg: CUSIP (bei US/CA-ISIN daraus abgeleitet), sonst ISIN, sonst Ticker. */
  VS.holdingIdentity = function (r) {
    var c = r.cusip || (r.isin && /^(US|CA)/.test(r.isin) ? r.isin.slice(2, 11) : null);
    return c ? "CUSIP:" + c : r.isin ? "ISIN:" + r.isin : r.ticker ? "T:" + r.ticker : "N:" + String(r.name || "").toLowerCase();
  };
  VS.stockHref = function (r) { return r.vuTicker ? "/discover/#/s/US_REAL/" + encodeURIComponent(r.vuTicker) : null; };

  /* ---------------------------------------------- Kurzkopf (Übersicht) */
  function fv(d, k) { var f = d.fundamentals && d.fundamentals[k]; return f && typeof f === "object" && "value" in f ? f.value : null; }
  VS.quickHeader = function (e, d) {
    var cost = d.costs && d.costs.status === "AVAILABLE" ? d.costs.value : null;
    var cells = [
      ["Index", esc(e.index || "nicht im Namen genannt")],
      ["Kostenquote", cost !== null ? VS.costPct(cost) + '<span class="vs-fine"> Prospekt</span>' : '<span class="vs-fine">Quelle fehlt</span>'],
      ["Fondsvermögen", fv(d, "aum") !== null ? VS.money(fv(d, "aum"), fv(d, "aumCurrency")) + '<span class="vs-fine"> alle Anteilklassen</span>' : '<span class="vs-fine">Quelle fehlt</span>'],
      ["Positionen", d.holdings && d.holdings.positions ? d.holdings.positions.toLocaleString("de-DE") : '<span class="vs-fine">keine Holdings</span>'],
      ["UCITS", fv(d, "ucits") === false ? "nein (US-Fonds)" : fv(d, "ucits") === true ? "ja" : '<span class="vs-fine">unbekannt</span>'],
      ["Ertragsverwendung", d.distributionPolicy === "DISTRIBUTING_OBSERVED" ? "ausschüttend (beobachtet)" : '<span class="vs-fine">unbekannt</span>'],
      ["Replikation", '<span class="vs-fine">Quelle fehlt</span>'],
      ["Datenstand", '<span class="vs-fine">Kurse ' + F.date(d.metrics && d.metrics.asOf) + (d.holdings && d.holdings.asOf ? " · Holdings " + F.date(d.holdings.asOf) : "") + '</span>']
    ];
    return '<div class="vs-quick">' + cells.map(function (c) { return '<div><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join("") + '</div>';
  };

  /* ---------------------------------------------- Nicht verfuegbar */
  function noHoldings(d) {
    var h = d.holdings || {};
    return VS.pending("Keine Bestandsdaten", h.reason || "Für diesen ETF liegt keine offizielle Bestandsmeldung vor. Wir schätzen keine Inhalte.");
  }
  function sourceLine(f) {
    return (f.rejectedNewer ? '<div class="vs-warnbox" style="margin-top:10px">Ein neuerer Bericht (Bestand zum ' + F.date(f.rejectedNewer.asOf) + ') hat unsere Qualitätsprüfung nicht bestanden (' + esc(f.rejectedNewer.reasons.join(", ")) + ') und wird deshalb nicht gezeigt.</div>' : "") +
      '<p class="vs-fine" style="margin-top:10px">Quelle: ' + esc(f.sourceLabel) + ' · Bestand zum ' + F.date(f.asOf) + ' · veröffentlicht ' + F.date(f.publishedAt) + ' · Gewichte = ' + esc(f.weightBasis) +
      '. Die SEC veröffentlicht Bestände quartalsweise mit rund 60 Tagen Verzögerung.' + VS.stale(f.asOf, 200) + '</p>';
  }

  /* ---------------------------------------------- Bestandteile */
  VS.renderBestandteile = function (el, e, d) {
    if (!d.holdings || d.holdings.status !== "AVAILABLE") { el.innerHTML = '<section class="vs-section">' + noHoldings(d) + '</section>'; return; }
    el.innerHTML = '<section class="vs-section"><div class="vs-loading">Bestand wird geladen …</div></section>';
    VS.holdings(d.holdings.series).then(function (f) {
      if (!f) { el.innerHTML = '<section class="vs-section">' + VS.pending("Bestandsdatei nicht erreichbar", "Bitte später erneut versuchen.") + '</section>'; return; }
      var changeBy = {};
      (f.changes.events || []).forEach(function (ev) { if (/WEIGHT_|HOLDING_ADDED|ENTERED_TOP/.test(ev.eventType)) changeBy[ev.entityId] = changeBy[ev.entityId] || ev; });
      // Nach einem Kennungswechsel traegt das Ereignis die Kennung aus T0; deshalb auch abgeleitete CUSIP und eindeutigen Namen pruefen.
      var nameCount = {}; f.rows.forEach(function (r) { var k = "N:" + String(r.name || "").toLowerCase(); nameCount[k] = (nameCount[k] || 0) + 1; });
      Object.keys(changeBy).forEach(function (id) { var ev = changeBy[id], m = /^ISIN:(US|CA)(\w{9})/.exec(id), nk = "N:" + String(ev.entityName || "").toLowerCase();
        if (m && !changeBy["CUSIP:" + m[2]]) changeBy["CUSIP:" + m[2]] = ev; if (nameCount[nk] === 1 && !changeBy[nk]) changeBy[nk] = ev; });
      function rowKeys(r) { var c = r.isin && /^(US|CA)/.test(r.isin) ? r.isin.slice(2, 11) : null, nk = "N:" + String(r.name || "").toLowerCase();
        return [r.isin ? "ISIN:" + r.isin : null, r.cusip ? "CUSIP:" + r.cusip : null, c ? "CUSIP:" + c : null, r.ticker ? "TICKER:" + r.ticker + "@" : null, nameCount[nk] === 1 ? nk : null].filter(Boolean); }
      var n = 10;
      function draw() {
        var rows = f.rows.slice(0, n);
        el.innerHTML = '<section class="vs-section"><div class="vs-card"><div class="vs-section-head"><div><p class="vs-label">Bestandteile</p><p class="vs-fine">' +
          f.positions.toLocaleString("de-DE") + ' Positionen · die zehn größten: ' + wpct(f.concentration.top10) + '</p></div><div class="vs-seg" role="group" aria-label="Anzahl">' +
          [10, 25, 100].filter(function (k) { return k <= Math.max(10, f.holdingsShown); }).map(function (k) { return '<button data-n="' + k + '" aria-pressed="' + (k === n) + '">' + (k === 100 ? "Alle gezeigten" : "Top " + k) + '</button>'; }).join("") + '</div></div>' +
          '<div class="vs-table-wrap"><table class="vs-table ranked"><caption class="vs-sr">Bestandteile nach Gewicht</caption><thead><tr><th scope="col">#</th><th scope="col">Position</th><th scope="col">Gewicht</th><th scope="col">Wirtschaftszweig</th><th scope="col">Land</th><th scope="col">Seit letzter Meldung</th></tr></thead><tbody>' +
          rows.map(function (r, i) {
            var href = VS.stockHref(r), ev = rowKeys(r).map(function (k) { return changeBy[k]; }).filter(Boolean)[0];
            var chg = ev ? (ev.eventType === "HOLDING_ADDED" ? '<span class="vs-badge">neu</span>' : ev.absoluteChange !== null ? '<span class="num ' + F.cls(ev.absoluteChange) + '">' + (ev.absoluteChange > 0 ? "+" : "−") + (Math.abs(ev.absoluteChange) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + ' PP</span>' : '<span class="vs-fine">' + esc(ev.eventType === "ENTERED_TOP_10" ? "neu in Top 10" : "") + '</span>') : '<span class="vs-fine">–</span>';
            return '<tr><td class="num">' + (i + 1) + '</td><td>' + (href ? '<a href="' + href + '">' + esc(r.ticker || r.name) + '</a>' : '<b>' + esc(r.ticker || "") + '</b>') + '<span class="t-name">' + esc(r.name || "") + '</span>' +
              (r.assetType !== "EQUITY" ? '<span class="t-name">' + esc(VS.assetName(r.assetType)) + '</span>' : "") + '</td><td class="num">' + wpct(r.weight) + '</td><td>' + esc(r.sector ? VS.sectorName(r.sector) : "–") + '</td><td>' + esc(VS.countryName(r.country)) + '</td><td>' + chg + '</td></tr>';
          }).join("") + '</tbody></table></div>' +
          (n >= f.holdingsShown && f.positions > f.holdingsShown ? '<p class="vs-fine" style="margin-top:8px">Gezeigt werden die ' + f.holdingsShown + ' größten Positionen (' + wpct(f.shownWeight) + ' des Fonds). Kennzahlen, Länder und Wirtschaftszweige sind aus allen ' + f.positions.toLocaleString("de-DE") + ' Positionen berechnet.</p>' : "") +
          '<p class="vs-fine" style="margin-top:8px">Klick auf einen Ticker öffnet die Aktienanalyse in Discover. Wirtschaftszweig nach SEC-SIC (nicht GICS).</p>' + sourceLine(f) + '</div></section>';
        el.querySelectorAll("[data-n]").forEach(function (b) { b.onclick = function () { n = Number(b.dataset.n); draw(); }; });
      }
      draw();
    });
  };

  /* ---------------------------------------------- ETF X-Ray */
  function bars(list, label, max) {
    return '<div class="vs-bars" style="margin-top:10px">' + list.slice(0, max || 10).map(function (x) {
      var w = Math.max(0, Math.min(1, x.weight));
      return '<div class="vs-bar"><span>' + esc(label(x.key)) + '</span><span class="track"><span class="fill" style="display:block;width:' + (w * 100).toFixed(1) + '%;background:var(--s1)"></span></span><span class="v num">' + wpct(x.weight) + '</span></div>';
    }).join("") + '</div>';
  }
  VS.renderXray = function (el, e, d) {
    var mt = d.metrics;
    var priceFactors = '<div class="vs-card"><p class="vs-label">Aus der Kursreihe berechnet</p>' +
      '<div class="vs-row"><span>Momentum (6 Monate)</span><span class="num ' + F.cls(mt && mt.windows["6M"].value) + '">' + F.spct(mt && mt.windows["6M"].value) + '</span></div>' +
      '<div class="vs-row"><span>Momentum (12 Monate)</span><span class="num ' + F.cls(mt && mt.windows["1Y"].value) + '">' + F.spct(mt && mt.windows["1Y"].value) + '</span></div>' +
      '<div class="vs-row"><span>Trend: Abstand zum Durchschnitt</span><span class="num ' + F.cls(mt && mt.trend.value) + '">' + F.spct(mt && mt.trend.value) + '</span></div>' +
      '<div class="vs-row"><span>Relative Stärke vs. S&P 500 (12 M)</span><span class="num ' + F.cls(mt && mt.relativeStrengthVsSPY.value) + '">' + F.spct(mt && mt.relativeStrengthVsSPY.value) + '</span></div></div>';
    if (!d.holdings || d.holdings.status !== "AVAILABLE") { el.innerHTML = '<section class="vs-section"><div class="vs-grid g2">' + noHoldings(d) + priceFactors + '</div></section>'; return; }
    el.innerHTML = '<section class="vs-section"><div class="vs-loading">X-Ray wird berechnet …</div></section>';
    VS.holdings(d.holdings.series).then(function (f) {
      if (!f) { el.innerHTML = '<section class="vs-section">' + VS.pending("Bestandsdatei nicht erreichbar", "") + '</section>'; return; }
      var c = f.concentration, x = f.exposures, mp = f.mapping || {};
      var eq = (x.assetTypes.filter(function (a) { return a.key === "EQUITY"; })[0] || {}).weight || 0;
      el.innerHTML = '<section class="vs-section"><div class="vs-card app"><p class="vs-label">Auf einen Blick</p><p style="margin-top:8px;font-size:17px;color:var(--app-ink)">' + esc(f.summary || "") + '</p></div>' +
        (f.derivativeHeavy ? '<div class="vs-warnbox" style="margin-top:12px">⚠ Dieser Fonds arbeitet mit Derivaten (z. B. Swaps, Futures, Optionen) oder Sicherheiten. Die Meldung nennt Werte in Prozent des Nettofondsvermögens – einzelne Positionen können über 100 % liegen, die Summe weicht ab. Konzentrationskennzahlen sind hier nicht wie bei einem klassischen Index-ETF zu lesen.</div>' : "") + '</section>' +
        '<section class="vs-section"><div class="vs-grid g4">' +
        [["Größte Position", wpct(c.top1)], ["Top 5", wpct(c.top5)], ["Top 10", wpct(c.top10)], ["Top 20", wpct(c.top20)]].map(function (k) { return '<div class="vs-card"><p class="vs-label">' + k[0] + '</p><p class="vs-kpi small">' + k[1] + '</p></div>'; }).join("") +
        '</div><p class="vs-fine" style="margin-top:8px">Effektive Anzahl Positionen (Kehrwert des Herfindahl-Index): ' + (c.effectiveNumber !== null ? c.effectiveNumber.toLocaleString("de-DE") : "–") + ' bei ' + c.positions.toLocaleString("de-DE") + ' Positionen – je näher beide Zahlen beieinander liegen, desto gleichmäßiger ist das Gewicht verteilt.</p></section>' +
        '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Länder (Sitz der Emittenten)</p>' + bars(x.countries.filter(function (k) { return k.key !== "CASH"; }), VS.countryName, 10) + '</div>' +
        '<div class="vs-card"><p class="vs-label">Wirtschaftszweige (SEC-SIC)</p>' + (x.sectorCoverage > 0.05 ? bars(x.sectors, VS.sectorName, 11) + '<p class="vs-fine" style="margin-top:8px">Zugeordnet: ' + wpct(x.sectorCoverage) + ' des Fondsvermögens. SIC ist eine US-Behördenklassifikation, nicht GICS.</p>'
          : VS.pending("Keine Sektorzuordnung", eq < 0.5 ? "Überwiegend Anleihen oder andere Anlagen – Wirtschaftszweige gelten für Aktien." : "Für diese Positionen liegen keine SIC-Codes vor.")) + '</div></div></section>' +
        '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Anlagearten</p>' + bars(x.assetTypes, VS.assetName, 8) +
        '<div class="vs-row" style="margin-top:8px"><span>Liquidität</span><span class="num">' + wpct(x.cashWeight) + '</span></div><div class="vs-row"><span>Derivate</span><span class="num">' + x.derivativeCount + (x.derivativeCount === 1 ? ' Position' : ' Positionen') + (x.derivativeCount ? " · " + wpct(x.derivativeGrossWeight) + " brutto" : "") + '</span></div></div>' +
        '<div class="vs-card"><p class="vs-label">Datenabdeckung</p><div class="vs-row"><span>Positionen in der Meldung</span><span class="num">' + f.holdingsCount.toLocaleString("de-DE") + '</span></div>' +
        '<div class="vs-row"><span>Summe der Gewichte</span><span class="num">' + wpct(f.totalWeight) + '</span></div>' +
        '<div class="vs-row"><span>Aktiengewicht dem VU-Aktienstamm zugeordnet</span><span class="num">' + (mp.mappedShareOfEquity !== null && mp.mappedShareOfEquity !== undefined ? wpct(mp.mappedShareOfEquity) : "–") + '</span></div>' +
        '<div class="vs-row"><span>Wirtschaftszweig zugeordnet</span><span class="num">' + wpct(x.sectorCoverage) + '</span></div>' +
        '<p class="vs-fine" style="margin-top:8px">Die Summe kann von 100 % abweichen (Liquidität, Derivate, offene Geschäfte, Wertpapierleihe-Sicherheiten). Faktor-Werte (Qualität, Wachstum, Value) zeigen wir erst, wenn ein ausreichender Teil des Aktiengewichts mit VU-Faktordaten verbunden ist.</p></div></div></section>' +
        (f.similar && f.similar.length ? '<section class="vs-section"><div class="vs-card"><p class="vs-label">Ähnliche Produkte</p><p class="vs-fine">Nach Überschneidung der Bestände (gewichtet, die 100 größten Positionen) – Ähnlichkeit, kein Qualitätsurteil.</p>' +
          f.similar.map(function (x) { return '<div class="vs-row"><span><a href="#/etf/' + encodeURIComponent(x.symbol) + '"><b>' + esc(x.symbol) + '</b></a> <span class="vs-fine">' + esc(x.name) + '</span></span><span class="num">' + wpct(x.overlap) + ' Überschneidung</span></div>'; }).join("") + '</div></section>' : "") +
        '<section class="vs-section">' + priceFactors + sourceLine(f) + '</section>';
    });
  };

  /* ---------------------------------------------- Was hat sich geändert? */
  var TYPE_DE = { HOLDING_ADDED: "Neue Position", HOLDING_REMOVED: "Position entfernt", WEIGHT_INCREASED: "Gewicht gestiegen", WEIGHT_DECREASED: "Gewicht gesunken",
    ENTERED_TOP_10: "Neu in den Top 10", LEFT_TOP_10: "Aus den Top 10", ENTERED_TOP_20: "Neu in den Top 20", LEFT_TOP_20: "Aus den Top 20",
    SECTOR_WEIGHT_CHANGED: "Wirtschaftszweig", COUNTRY_WEIGHT_CHANGED: "Land", HOLDINGS_COUNT_CHANGED: "Anzahl Positionen", CASH_CHANGED: "Liquidität" };
  VS.CHANGE_TYPE_DE = TYPE_DE;
  function evText(ev) {
    if (ev.eventType === "COUNTRY_WEIGHT_CHANGED") return VS.countryName(ev.entityName) + ": " + wpct(ev.oldValue) + " → " + wpct(ev.newValue);
    if (ev.eventType === "SECTOR_WEIGHT_CHANGED") return VS.sectorName(ev.entityName) + ": " + wpct(ev.oldValue) + " → " + wpct(ev.newValue);
    return ev.explanation;
  }
  /* Kostenaenderungen laut Prospekt (nur echte, gleich definierte Felder) - Teil von "Was hat sich geaendert?". */
  function costChangeCard(d) {
    var c = d.costs || {};
    if (c.status !== "AVAILABLE" || !c.previousFiling) return "";
    var ch = c.changes || [];
    return '<section class="vs-section"><div class="vs-card"><p class="vs-label">Kosten laut Prospekt</p>' +
      (ch.length ? ch.map(function (x) { return '<div class="vs-row"><span>' + esc(x.label) + '</span><span class="num">' + VS.costPct(x.oldValue) + ' → ' + VS.costPct(x.newValue) + '</span></div>'; }).join("") +
        '<p class="vs-fine" style="margin-top:6px">Prospekt ' + F.date(c.previousFiling) + ' → ' + F.date(ch[0].to) + ' (SEC Risk/Return-Daten).</p>'
        : '<p class="vs-sub" style="margin-top:6px">Keine Änderung der Kostenquote seit dem Prospekt vom ' + F.date(c.previousFiling) + '.</p>') + '</div></section>';
  }
  VS.renderChanges = function (el, e, d) {
    if (!d.holdings || d.holdings.status !== "AVAILABLE") { el.innerHTML = costChangeCard(d) || ('<section class="vs-section">' + noHoldings(d) + '</section>'); return; }
    VS.holdings(d.holdings.series).then(function (f) {
      if (!f) return;
      var ch = f.changes || {}, evs = ch.events || [], showAll = false;
      function draw() {
        var list = showAll ? evs : evs.filter(function (x) { return x.importance !== "LOW"; });
        el.innerHTML = '<section class="vs-section"><div class="vs-card app"><p class="vs-label">Seit dem letzten Holdings-Update</p>' +
          (ch.status === "BASELINE" ? '<p style="margin-top:8px;color:var(--app-ink)">Erster erfasster Bestand – es gibt noch keinen Vergleich.</p>'
            : '<p style="margin-top:8px;color:var(--app-ink)">' + esc((ch.sentence || "Keine wesentlichen Änderungen.").replace(/^Seit dem letzten Holdings-Update: /, "")) + '</p><p class="vs-fine" style="margin-top:6px;color:var(--app-sub)">Vergleich der Bestände zum ' + F.date(ch.from) + ' und ' + F.date(ch.to) + ' (SEC N-PORT). ' + ch.eventCount + ' Änderungen erkannt. Gewichtsänderungen unter 0,25 Prozentpunkten werden nicht gezeigt; bei unveränderter Stückzahl ist eine Änderung als Kursbewegung gekennzeichnet.</p>') + '</div></section>' +
          (evs.length ? '<section class="vs-section"><div class="vs-card"><div class="vs-section-head"><p class="vs-label">Änderungen</p><label class="vs-fine"><input type="checkbox" id="vs-ch-all"' + (showAll ? " checked" : "") + '> auch kleine Änderungen</label></div>' +
            list.slice(0, 40).map(function (x) { return '<div class="vs-row"><span><span class="vs-badge' + (x.importance === "HIGH" ? " complex" : "") + '">' + esc(TYPE_DE[x.eventType] || x.eventType) + '</span> ' + esc(evText(x)) + '</span><span class="vs-fine">' + esc({ HIGH: "hoch", MEDIUM: "mittel", LOW: "gering" }[x.importance] || "") + '</span></div>'; }).join("") +
            (list.length > 40 ? '<p class="vs-fine">… und ' + (list.length - 40) + ' weitere.</p>' : "") + '</div></section>' : "") +
          '<section class="vs-section"><div class="vs-card"><p class="vs-label">Zeitleiste</p>' + (f.timeline && f.timeline.length ? f.timeline.map(function (t) { return '<div class="vs-row"><span class="num">' + F.date(t.asOf) + '</span><span style="text-align:right">' + esc(t.text) + '</span></div>'; }).join("")
            : '<p class="vs-fine">Noch keine Historie.</p>') +
          '<p class="vs-fine" style="margin-top:8px">Bestände: ' + f.history.map(function (h) { return F.date(h.asOf) + " (" + h.positions.toLocaleString("de-DE") + ")"; }).join(" · ") + '</p></div></section>' + costChangeCard(d);
        var cb = el.querySelector("#vs-ch-all"); if (cb) cb.onchange = function () { showAll = cb.checked; draw(); };
      }
      draw();
    });
  };

  /* ---------------------------------------------- Planspiel: ETF ins Vorsorgedepot
     ctx: { name, symbol, cagr, vol, since, years (Historie), us (US-ETF), complex, cost }.
     Rechnet mit der bisherigen Entwicklung (Gesamtrendite p. a., Schwankung) und der Grund-/Kinderzulage des
     Altersvorsorgedepots (Regeln 2027-DE). Modellrechnung, keine Prognose, keine Empfehlung. */
  VS.renderPlanspiel = function (el, ctx) {
    if (!el) return;
    if (ctx.complex) { el.innerHTML = '<div class="vs-play"><p class="vs-label" style="color:var(--app-muted)">Planspiel</p><h3>Nicht für ein Vorsorge-Planspiel geeignet.</h3><p class="vs-sub" style="margin-top:8px">Hebel-, Short- und Optionsprodukte verlieren über lange Zeiträume oft durch tägliche Neugewichtung an Wert – eine Hochrechnung aus der Vergangenheit wäre irreführend.</p></div>'; return; }
    if (!Number.isFinite(ctx.cagr) || !Number.isFinite(ctx.vol) || !(ctx.years >= 10)) {
      el.innerHTML = '<div class="vs-play"><p class="vs-label" style="color:var(--app-muted)">Planspiel</p><h3>Für ein Planspiel ist die Historie zu kurz.</h3><p class="vs-sub" style="margin-top:8px">Wir rechnen nur mit mindestens zehn Jahren echter Kurshistorie. Im Planer kannst du mit eigenen Annahmen rechnen.</p><a class="vs-pill lime" style="margin-top:14px" href="#/plan">Zum Planer</a></div>'; return;
    }
    var st = VS.state.plan, st0 = { monthly: 100, years: Math.max(5, Math.min(45, (st.targetAge || 67) - (st.age || 35))), zulage: true, kids: 0, starter: false };
    if (!VS.state.planDone) st0.years = 20;
    el.innerHTML = '<div class="vs-play"><p class="vs-label" style="color:var(--app-muted)">Planspiel · Altersvorsorgedepot</p>' +
      '<h3>Was wäre, wenn du ' + esc(ctx.symbol) + ' in dein Vorsorgedepot legst?</h3>' +
      '<p class="vs-sub" style="margin-top:6px">Mit der bisherigen Entwicklung seit ' + esc(String(ctx.since || "")) + ': <b style="color:var(--app-ink)">' + F.pct(ctx.cagr, 1) + ' p. a.</b> inkl. Ausschüttungen, Schwankung ' + F.pct(ctx.vol, 0) + ' p. a.</p>' +
      '<div class="vs-play-grid"><form id="vs-pl-f" onsubmit="return false">' +
      '<div class="vs-slider"><label for="pl-m">Sparrate pro Monat <b id="pl-mv"></b></label><input id="pl-m" type="range" min="25" max="1000" step="25" value="' + st0.monthly + '"></div>' +
      '<div class="vs-slider"><label for="pl-y">Laufzeit bis zur Rente <b id="pl-yv"></b></label><input id="pl-y" type="range" min="5" max="45" step="1" value="' + st0.years + '"></div>' +
      '<label class="vs-toggle"><span>Staatliche Zulage (Altersvorsorgedepot ab 2027)</span><input id="pl-z" type="checkbox" checked></label>' +
      '<div id="pl-zx"><div class="vs-slider"><label for="pl-k">Kinder mit Kindergeld <b id="pl-kv"></b></label><input id="pl-k" type="range" min="0" max="4" step="1" value="0"></div>' +
      '<label class="vs-toggle"><span>Unter 25, erster Vertrag (Einsteigerbonus)</span><input id="pl-s" type="checkbox"></label></div>' +
      '</form><div><div class="vs-play-result" id="pl-res"></div><div class="vs-play-split" id="pl-split"></div><div class="vs-legend" id="pl-leg"></div><div id="pl-chart" style="margin-top:12px"></div></div></div>' +
      '<div class="vs-tabs" style="margin-top:6px"><button class="vs-pill lime" id="pl-apply" type="button">In meinen Plan übernehmen</button><a class="vs-pill" style="background:transparent;color:var(--app-ink);border-color:var(--app-line)" href="#/foerderung">So funktioniert die Zulage</a></div>' +
      '<p class="vs-fine" style="margin-top:12px">Modellrechnung, keine Prognose und keine Empfehlung. Basis: bisherige Gesamtrendite p. a. nach Fondskosten (' + esc(ctx.basis || "Tiingo") + '); pessimistisch/optimistisch = 10 %/90 %-Bandbreite der Durchschnittsrendite über die Laufzeit (Schwankung ÷ √Jahre). ' +
      (ctx.us ? 'In US-Dollar gemessen, Wechselkurs nicht berücksichtigt. US-ETFs selbst sind im Altersvorsorgedepot nicht zulässig (kein Basisinformationsblatt) – die Rechnung zeigt, was die bisherige Entwicklung dieses Engagements bedeutet hätte, etwa über einen UCITS-ETF auf denselben Index. ' : '') +
      'Zulagen nach den Regeln ab 2027 (Grundzulage 50 % auf die ersten 360 €, 25 % bis 1.800 € Eigenbeitrag im Jahr; Kinderzulage bis 300 € je Kind), jährlich eingezahlt und mitverzinst. Steuern und Inflation sind nicht berücksichtigt.</p></div>';
    var form = el.querySelector("#vs-pl-f"), rules = null, last = null;
    VS.rules().then(function (r) { rules = r[0]; draw(); }).catch(function () { draw(); });
    function draw() {
      var m = Number(form.querySelector("#pl-m").value), y = Number(form.querySelector("#pl-y").value), z = form.querySelector("#pl-z").checked;
      var kids = Number(form.querySelector("#pl-k").value), starter = form.querySelector("#pl-s").checked;
      el.querySelector("#pl-mv").textContent = F.eur(m); el.querySelector("#pl-yv").textContent = y + " Jahre"; el.querySelector("#pl-kv").textContent = String(kids);
      el.querySelector("#pl-zx").hidden = !z;
      var sub = 0, bonus = 0;
      if (z && rules && V.Funding) {
        var ch = []; for (var i = 0; i < kids; i++) ch.push({ hasChildBenefit: true });
        var f = V.Funding.altersvorsorgedepot(rules, { ownContribution: m * 12, children: ch, firstContract: starter, age: starter ? 20 : 30 });
        sub = f.eligible ? f.basicAllowance + f.childAllowance : 0; bonus = f.eligible ? f.careerStarterBonus : 0;
      }
      var r = V.Math.historicalScenarios({ cagr: ctx.cagr, vol: ctx.vol, years: y, monthly: m, annualSubsidy: sub, bonus: bonus });
      last = r;
      var L = { pessimistisch: "Pessimistisch", basis: "Wie bisher", optimistisch: "Optimistisch" };
      el.querySelector("#pl-res").innerHTML = r.scenarios.map(function (sc) {
        return '<div class="' + (sc.id === "basis" ? "base" : "") + '"><span>' + L[sc.id] + ' · ' + F.pct(sc.annualReturn, 1) + ' p. a.</span><b class="num">' + F.eur(sc.nominal) + '</b><small>nach ' + y + ' Jahren</small></div>';
      }).join("");
      var base = r.scenarios[1].nominal, gain = Math.max(0, base - r.invested), tot = Math.max(base, r.invested);
      el.querySelector("#pl-split").innerHTML = '<i style="width:' + (r.ownContributions / tot * 100).toFixed(1) + '%;background:#f4f5f0"></i><i style="width:' + (r.subsidies / tot * 100).toFixed(1) + '%;background:var(--s1)"></i><i style="width:' + (gain / tot * 100).toFixed(1) + '%;background:var(--accent)"></i>';
      el.querySelector("#pl-leg").innerHTML = '<span><i style="background:#f4f5f0"></i>Eigene Einzahlungen ' + F.eur(r.ownContributions) + '</span><span><i style="background:var(--s1)"></i>Staatliche Zulagen ' + F.eur(r.subsidies) + '</span><span><i style="background:var(--accent)"></i>Wertzuwachs (Szenario „wie bisher“) ' + F.eur(gain) + '</span>';
      VS.lineChart(el.querySelector("#pl-chart"), [
        { label: "Optimistisch", points: r.path.map(function (p) { return [p[0], p[3]]; }), color: "var(--s3)", dash: true },
        { label: "Wie bisher", points: r.path.map(function (p) { return [p[0], p[2]]; }), color: "var(--accent)", area: true },
        { label: "Pessimistisch", points: r.path.map(function (p) { return [p[0], p[1]]; }), color: "var(--s2)", dash: true }],
        { label: "Vermögensverlauf im Planspiel", zero: true, height: 220, fmtX: function (v) { return "Jahr " + Math.round(v); }, fmtTipX: function (v) { return "nach " + Math.round(v) + " Jahren"; }, fmtY: function (v) { return F.eurK ? F.eurK(v) : F.eur(v); }, fmtTip: function (v) { return F.eur(v); } });
    }
    form.addEventListener("input", draw);
    el.querySelector("#pl-apply").onclick = function () {
      if (!last) return;
      var p = VS.state.plan, c = Number.isFinite(p.cost) ? p.cost : 0;
      // Der Planer zieht Kosten ab; die Historie ist schon nach Fondskosten -> Kosten wieder aufschlagen.
      p.monthly = Number(form.querySelector("#pl-m").value);
      p.returns = { konservativ: Math.round((last.scenarios[0].annualReturn + c) * 1000) / 1000, basis: Math.round((last.scenarios[1].annualReturn + c) * 1000) / 1000, optimistisch: Math.round((last.scenarios[2].annualReturn + c) * 1000) / 1000 };
      VS.save(); VS.analytics.track("planspiel_apply", { symbol: ctx.symbol });
      VS.go("#/plan");
    };
  };

  /* ---------------------------------------------- Kosten */
  VS.renderKosten = function (el, e, d) {
    var c = d.costs || {};
    var f = function (k) { var x = c[k] || (d.fundamentals || {})[k]; return x && typeof x === "object" ? x : null; };
    el.innerHTML = '<section class="vs-section"><div class="vs-grid g2"><div class="vs-card"><p class="vs-label">Laufende Kosten</p>' +
      (c.status === "AVAILABLE" ? '<p class="vs-kpi">' + VS.costPct(c.value) + '</p><p class="vs-fine">' + ({ NET_EXPENSE_RATIO: "Netto-Kostenquote nach Gebührenverzicht (Net Expense Ratio)", EXPENSE_RATIO: "Gesamtkostenquote (Expense Ratio)", MANAGEMENT_FEE_ONLY: "Nur die Verwaltungsgebühr ist gemeldet – eine Gesamtkostenquote steht nicht im Prospektdatensatz" }[c.basis] || "Kostenquote") + ' laut Prospekt-Gebührentabelle (SEC Risk/Return-Daten)' + (c.value === 0 ? '. 0,00 % ist der im Prospekt gemeldete Wert (z. B. gebührenfreier ETF oder vollständiger Gebührenverzicht).' : '') + '</p>' +
        (f("expenseRatio") ? '<div class="vs-row" style="margin-top:10px"><span>Gesamtkostenquote, brutto (Expense Ratio)</span><span class="num">' + VS.costPct(f("expenseRatio").value) + '</span></div>' : "") +
        (f("netExpenseRatio") ? '<div class="vs-row"><span>Nach Gebührenverzicht, netto (Net Expense Ratio)</span><span class="num">' + VS.costPct(f("netExpenseRatio").value) + '</span></div>' : "") +
        (f("managementFee") ? '<div class="vs-row"><span>Verwaltungsgebühr (Management Fee)</span><span class="num">' + VS.costPct(f("managementFee").value) + '</span></div>' : "") +
        '<p class="vs-fine" style="margin-top:8px">Prospekt vom ' + F.date((f("netExpenseRatio") || f("expenseRatio") || f("managementFee") || {}).asOf) + '. ' + esc(c.note || "") + ' Für US-Fonds ist das die „Expense Ratio“ – nicht identisch mit TER oder laufenden Kosten im europäischen Basisinformationsblatt.</p>' +
        // Kostenaenderung nur zwischen zwei echten Prospektstaenden und nur je gleich definiertem Feld
        '<p class="vs-label" style="margin-top:14px">Änderung gegenüber dem vorherigen Prospekt</p>' +
        ((c.changes || []).length ? c.changes.map(function (x) { return '<div class="vs-row"><span>' + esc(x.label) + '</span><span class="num ' + (x.newValue < x.oldValue ? "up" : "down") + '">' + VS.costPct(x.oldValue) + ' → ' + VS.costPct(x.newValue) + '</span></div>'; }).join("") + '<p class="vs-fine">Prospekt ' + F.date(c.previousFiling) + ' → ' + F.date((c.changes[0] || {}).to) + '.</p>'
          : c.previousFiling ? '<p class="vs-sub">Keine Änderung seit dem Prospekt vom ' + F.date(c.previousFiling) + '.</p>' : '<p class="vs-sub">Nur ein Prospektstand im Datensatz – ein Vergleich ist ab dem nächsten Prospekt möglich.</p>')
        : VS.pending("Keine Kostenquote", (c.note || "Keine Primär- oder Regulierungsquelle verfügbar.") + " Wir schätzen keine Kosten.")) +
      '<div class="vs-row" style="margin-top:12px"><span>Tracking Difference</span><span class="vs-fine">nicht berechnet (Indexdaten fehlen)</span></div></div>' +
      '<a class="vs-card app link" href="#/kosten' + (Number.isFinite(c.value) ? "?ter=" + (c.value * 100).toFixed(2) : "") + '"><p class="vs-label">Selbst rechnen</p><p class="vs-kpi small" style="margin-top:6px">Was kosten ' + (Number.isFinite(c.value) ? VS.costPct(c.value) : "die laufenden Kosten") + ' über deine Laufzeit?</p><p class="vs-sub" style="margin-top:8px">Die Kostenanalyse rechnet den Effekt über Jahre – nur die laufenden Produktkosten, ohne Depot- und Handelskosten.</p></a></div></section>';
  };

  /* ---------------------------------------------- Daten / Herkunft */
  VS.renderDaten = function (el, e, d, qualityHtml) {
    var fu = d.fundamentals || {};
    var LABEL = { name: "Name", ticker: "Ticker", exchange: "Börse", listingCurrency: "Handelswährung", issuer: "Anbieter", aum: "Fondsvermögen (alle Anteilklassen)", aumLevel: "Ebene Fondsvermögen", numberOfHoldings: "Positionen",
      domicile: "Domizil", ucits: "UCITS", legalStructure: "Rechtsform", fundStatus: "Status", expenseRatio: "Gesamtkostenquote", netExpenseRatio: "Netto-Kostenquote", managementFee: "Verwaltungsgebühr" };
    var SRC = { TIINGO: "Tiingo (Kursdaten-Anbieter)", SEC_NPORT: "SEC Form N-PORT", SEC_RR: "SEC Prospekt-Daten (Risk/Return)", VU_NAME_RULES: "Vision Universe (aus dem Namen abgeleitet)" };
    var rows = Object.keys(LABEL).filter(function (k) { return fu[k]; }).map(function (k) {
      var x = fu[k], v = x.value;
      var show = k === "aum" ? VS.money(v, fv(d, "aumCurrency")) : k === "aumLevel" ? (v === "FUND" ? "Fonds (alle Anteilklassen der Serie)" : v) : /Ratio|Fee/.test(k) ? VS.costPct(v) : k === "ucits" ? (v === false ? "nein" : v === true ? "ja" : "unbekannt") : String(v);
      return '<tr><td>' + esc(LABEL[k]) + '</td><td>' + esc(show) + '</td><td>' + esc(SRC[x.source] || x.source || "–") + (x.sourceType === "DERIVED" ? ' <span class="vs-fine">(abgeleitet)</span>' : "") + '</td><td>' + F.date(x.asOf) + '</td><td>' + esc({ HIGH: "hoch", MEDIUM: "mittel", LOW: "niedrig" }[x.confidence] || "–") + '</td></tr>';
    });
    el.innerHTML = '<section class="vs-section"><div class="vs-card"><p class="vs-label">Herkunft je Feld</p><div class="vs-table-wrap"><table class="vs-table"><thead><tr><th>Feld</th><th>Wert</th><th>Quelle</th><th>Stand</th><th>Konfidenz</th></tr></thead><tbody>' + rows.join("") + '</tbody></table></div>' +
      ((fu.conflicts || []).length ? '<p class="vs-fine" style="margin-top:8px">Abweichungen zwischen Quellen: ' + esc(fu.conflicts.map(function (c) { return c.field + " (" + c.reason + ")"; }).join(", ")) + '</p>' : "") +
      '<p class="vs-label" style="margin-top:14px">Anbieter je Datenart</p>' +
      '<div class="vs-row"><span>Kurse (Price Provider)</span><span>' + (d.metrics ? "Tiingo · Stand " + F.date(d.metrics.asOf) : '<span class="vs-fine">keine Kursreihe</span>') + '</span></div>' +
      '<div class="vs-row"><span>Holdings (Holdings Provider)</span><span>' + (d.holdings && d.holdings.status === "AVAILABLE" ? "SEC Form N-PORT · Bestand " + F.date(d.holdings.asOf) + (d.holdings.proxy ? " · Referenzbestand von " + esc(d.holdings.proxy.symbol) + " (gleicher Index)" : "") : '<span class="vs-fine">nicht verfügbar' + (d.holdings && d.holdings.reason ? " – " + esc(d.holdings.reason) : "") + '</span>') + '</span></div>' +
      '<div class="vs-row"><span>Kosten (Fundamentals Provider)</span><span>' + (d.costs && d.costs.status === "AVAILABLE" ? "SEC Prospekt-Daten (Risk/Return) · Prospekt " + F.date((fu.netExpenseRatio || fu.expenseRatio || fu.managementFee || {}).asOf) : '<span class="vs-fine">nicht verfügbar</span>') + '</span></div>' +
      '<div class="vs-row"><span>Register (Register Provider)</span><span>' + (fu.domicile && fu.domicile.source === "SEC_NPORT" ? "SEC (US-Investmentgesellschaft, kein UCITS)" : '<span class="vs-fine">kein Registereintrag</span>') + '</span></div>' +
      '<div class="vs-row"><span>Fehlende Felder</span><span class="vs-fine" style="text-align:right">' + esc(((d.provenance || {}).missingFields || []).join(", ") || "–") + '</span></div>' +
      '<div class="vs-row"><span>Fondsdaten des Emittenten</span><span class="vs-fine">nicht angebunden (Nutzungsbedingungen erlauben keinen automatisierten Abruf)</span></div>' +
      '<div class="vs-row"><span>ISIN · WKN</span><span class="vs-fine">für US-Listings nicht verfügbar</span></div></div></section>' +
      '<section class="vs-section">' + (qualityHtml || "") + '</section>';
  };
})(window);
