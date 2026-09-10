/* =========================================================================
   VISION UNIVERSE — universe/ui/proof.js

   PRODUKTNACHWEIS AUF DEM VOLLEN UNIVERSUM.

   Diese Schicht ist bewusst duenn. Sie laedt Daten, baut die Navigation
   und formatiert Zahlen - alles andere kommt aus der bestehenden
   Produktschicht:

     /quant/ui/quant.css        Typografie, Abstaende, Karten, Tabellen
     /quant/ui/shell.js         el(), mount(), loadJSON(), Zustandsboxen
     /quant/ui/components.js    section(), disclosure(), metricTile()
     /quant/ui/charts.js        candlestickChart(), lineChart(), sparkline()

   KEINE DATEI UNTER /quant/ WIRD VERAENDERT. Sie werden gelesen, nicht
   angefasst. Ein zweites Designsystem waere genau das, was hier nicht
   geprueft werden soll: der Eigentuemer will das bekannte Produkt sehen,
   nur mit dem ganzen Markt darin.

   WARUM EIN EIGENER NAMENSRAUM

   /quant/ laeuft auf dem synthetischen Modelluniversum: VU Quant Score,
   Factor DNA, Perzentilraenge. Dieses Universum hat davon nichts - es hat
   gemessene Zustaende aus echten Kursreihen. Dieselben Seiten mit beiden
   Datenquellen zu speisen hiesse, zwei Bedeutungen unter einen Namen zu
   legen. Der Namensraum trennt sie; die Oberflaeche bleibt dieselbe.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;

  var BASE = "/universe/";
  var DATA = "/quant/data/proof/";

  var NAV = [
    { href: BASE, label: "Universum" },
    { href: BASE + "screener/", label: "Screener" },
    { href: BASE + "stock/", label: "Einzeltitel" }
  ];

  /* Dieselbe Streuung wie im Bauskript (scripts/proof/build-product-proof.mjs).
     Woertlich gleich, damit der Vergleich moeglich bleibt. */
  var SHARDS = 64;
  function shardOf(ticker) {
    var h = 0;
    for (var i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0;
    return h % SHARDS;
  }

  // ------------------------------------------------------------- Laden
  function loadMeta() { return S.loadJSON(DATA + "meta.json"); }
  function loadIndex() { return S.loadJSON(DATA + "index.json"); }
  function loadRow(ticker) {
    return S.loadJSON(DATA + "rows/" + shardOf(ticker) + ".json").then(function (b) {
      return b.rows[ticker] || null;
    });
  }

  /* Der Zustand, in dem diese Seiten auf GitHub Pages landen wuerden: der
     Datensatz entsteht nur im Vercel-Bauschritt. Kein Fehler, sondern die
     Trennung selbst - und sie wird ausgesprochen, nicht als kaputte Seite
     gezeigt. */
  function datasetMissing(err) {
    var box = el("div", { class: "q-state q-state--error" }, [
      el("b", { text: "Datensatz nicht ausgeliefert" }),
      el("span", { text:
        "Der Produktnachweis laedt " + DATA + "index.json. Diese Datei entsteht ausschliesslich im " +
        "Bauschritt der geschuetzten Vorschau und wird nie committet - in einer oeffentlichen " +
        "Auslieferung gibt es sie deshalb nicht." })
    ]);
    if (err && err.message) box.appendChild(el("p", { class: "q-note", style: "margin-top:8px", text: err.message }));
    return box;
  }

  // -------------------------------------------------------- Zeilenzugriff
  /**
   * Die Tabelle liegt spaltenweise. Diese Huelle macht daraus wieder eine
   * Zeile - ohne 5.683 Objekte zu bauen, die niemand braucht.
   */
  function rowAt(index, i) {
    var r = { ticker: index.tickers[i], _i: i, hasFactors: !!index.hasFactors[i] };
    for (var f = 0; f < index.fields.length; f++) {
      var feld = index.fields[f];
      var v = index.columns[feld.id][i];
      if (v === null || v === undefined) { r[feld.id] = null; continue; }
      if (feld.type === "enum") r[feld.id] = index.enums[feld.id][v];
      else if (feld.type === "bool") r[feld.id] = v === 1;
      else r[feld.id] = v;
    }
    return r;
  }

  function fieldById(index, id) {
    for (var i = 0; i < index.fields.length; i++) if (index.fields[i].id === id) return index.fields[i];
    return null;
  }

  // ------------------------------------------------------ Formatierung
  /* Anteile kommen als Bruch (0.0797), nicht als Prozentzahl. Genau diese
     Verwechslung macht aus 8 % ein Achtel Prozent. */
  function pct(v, digits) {
    if (!Number.isFinite(v)) return "–";
    return S.signed(v * 100, digits === undefined ? 1 : digits) + " %";
  }
  function pctPlain(v, digits) {
    if (!Number.isFinite(v)) return "–";
    return S.num(v * 100, digits === undefined ? 1 : digits) + " %";
  }
  function compact(v) {
    if (!Number.isFinite(v)) return "–";
    var abs = Math.abs(v);
    if (abs >= 1e9) return S.num(v / 1e9, 1) + " Mrd.";
    if (abs >= 1e6) return S.num(v / 1e6, 1) + " Mio.";
    if (abs >= 1e3) return S.num(v / 1e3, 1) + " Tsd.";
    return S.num(v, 0);
  }

  /** Formatiert nach der Einheit des Feldes - eine Stelle, nicht acht. */
  function fmtField(feld, v) {
    if (v === null || v === undefined) return "–";
    if (!feld) return String(v);
    if (feld.type === "bool") return v ? "ja" : "nein";
    if (feld.type === "enum") return String(v);
    if (feld.unit === "pct") return pct(v, feld.digits);
    if (feld.unit === "count") return compact(v);
    if (feld.unit === "years") return S.num(v, 1) + " J.";
    return S.num(v, feld.digits === undefined ? 2 : feld.digits);
  }

  /* Ein Ton, der eine Aussage traegt, nicht eine Farbe um ihrer selbst
     willen: ueber der Linie / unter der Linie, gestiegen / gefallen. */
  function toneChip(text, tone) {
    return el("span", { class: "q-chip tone-" + (tone || "neutral"), text: text });
  }
  function boolChip(v, jaLabel, neinLabel) {
    if (v === null || v === undefined) return el("span", { class: "na", text: "–" });
    return toneChip(v ? (jaLabel || "ja") : (neinLabel || "nein"), v ? "strong" : "poor");
  }

  var QUALITY_TONE = { PASS: "strong", PASS_NOT_ITEMISED: "strong", WARNING: "neutral",
                       FAIL: "poor", UNAVAILABLE: "poor" };
  var QUALITY_LABEL = { PASS: "PASS", PASS_NOT_ITEMISED: "PASS", WARNING: "WARNUNG",
                        FAIL: "FAIL", UNAVAILABLE: "UNAVAILABLE" };
  function qualityChip(status) {
    if (!status) return el("span", { class: "na", text: "–" });
    return toneChip(QUALITY_LABEL[status] || status, QUALITY_TONE[status] || "neutral");
  }

  /** Fehlender Wert - mit Grund, nie als stille Null (§30). */
  function missing(reason) {
    return el("span", { class: "na", title: reason || null, text: "keine Daten" });
  }

  // ---------------------------------------------------------- Navigation
  function renderNav(activeHref) {
    var wrap = S.$("#q-tabs");
    if (!wrap) return;
    S.mount(wrap, NAV.map(function (item) {
      return el("a", {
        class: "q-tab", href: item.href, text: item.label,
        "aria-current": item.href === activeHref ? "page" : null
      });
    }).concat([
      el("a", { class: "q-tab", href: "/quant/", text: "Quant (Modelluniversum)" })
    ]));
  }

  /* Der Umfangshinweis. Er steht auf JEDER Seite, weil die eine
     Verwechslung, die hier moeglich ist, teuer waere: das abgeleitete
     Universum ist nicht der Kurshistorien-Bestand. */
  function scopeBanner(meta) {
    var s = meta.datasetScope || {};
    return el("div", { class: "q-card q-card--flat", style: "margin-bottom:18px" }, [
      el("div", { class: "q-provenance-tags" }, [
        S.provenanceTag("MODE", "REAL", "good"),
        S.provenanceTag("FORM", "PRECOMPUTED", "neutral"),
        S.provenanceTag("SOURCE", "TIINGO + ABGELEITET", "neutral"),
        S.provenanceTag("GATE", meta.gate || "–", "neutral"),
        S.provenanceTag("DELIVERY", "PROTECTED PREVIEW", "warn")
      ]),
      el("p", { class: "q-note", style: "margin-top:10px", text:
        "Abgeleitetes Universum: " + S.num((s.derivedUniverse && s.derivedUniverse.securities) || 0, 0) +
        " Titel mit gemessenen Zustaenden, Abstaenden und Renditen aus echten Kursreihen. " +
        "Kursniveaus (einzelne Kurse, SMA-Werte, 52-Wochen-Marken) bleiben zurueckgehalten; der " +
        "Kurshistorien-Bestand von rund 7,4 GB ist nicht ausgeliefert. Kein VU Quant Score: dieses " +
        "Universum traegt keine Fundamentaldaten." })
    ]);
  }

  // -------------------------------------------------------------- Seite
  /**
   * Derselbe Ablauf wie QuantShell.page(), nur mit dem Datensatz dieses
   * Nachweises statt dem Modelluniversum.
   */
  function page(options) {
    renderNav(options.nav);
    var root = S.$("#q-main");
    S.mount(root, S.loading());

    var need = [loadMeta()];
    if (options.index !== false) need.push(loadIndex());

    return Promise.all(need).then(function (res) {
      var meta = res[0], index = res[1] || null;
      S.clear(root);
      if (options.banner !== false) root.appendChild(scopeBanner(meta));
      var content = el("div", {});
      root.appendChild(content);
      root.appendChild(S.disclaimer());
      var stamp = S.$("#q-datastamp");
      if (stamp) {
        stamp.textContent = "Datenstand " + S.formatDate(meta.asOf) + " · " + (meta.gate || "");
      }
      return options.render(meta, index, content);
    }).catch(function (err) {
      S.mount(root, [datasetMissing(err), S.disclaimer()]);
      if (global.console) global.console.error(err);
    });
  }

  global.VUProof = {
    BASE: BASE, DATA: DATA, SHARDS: SHARDS,
    shardOf: shardOf, loadMeta: loadMeta, loadIndex: loadIndex, loadRow: loadRow,
    rowAt: rowAt, fieldById: fieldById,
    pct: pct, pctPlain: pctPlain, compact: compact, fmtField: fmtField,
    toneChip: toneChip, boolChip: boolChip, qualityChip: qualityChip, missing: missing,
    QUALITY_TONE: QUALITY_TONE, QUALITY_LABEL: QUALITY_LABEL,
    renderNav: renderNav, scopeBanner: scopeBanner, page: page, stockHref: stockHref
  };

  function stockHref(ticker) { return BASE + "stock/?ticker=" + encodeURIComponent(ticker); }
})(window);
