/* =========================================================================
   VISION UNIVERSE® DISCOVER — app.js

   Router und Seiten.

   Die Anwendung wird statisch ausgeliefert; navigiert wird ueber den Hash:

     #/                          Startseite
     #/u/US_REAL                 Startseite eines Universums
     #/c/US_REAL/market-leaders  Kategorie
     #/s/US_REAL/NVDA            Titel

   Geladen wird ausschliesslich aus discover/data/** - fertige Payloads aus
   dem Build. Eine Startseite kostet damit einen Abruf je Reihe, nicht
   einen je Titel.

   RHYTHMUS DER STARTSEITE (§6)

   Keine zwei Reihen sehen gleich aus. Die Reihenfolge ist bewusst gesetzt:
   Eingangsflaeche, dann die nummerierte Signature-Reihe, dann eine
   Poster-Reihe, dann eine kompakte, dann wieder Poster - und zum Schluss
   die Sektoren als Kacheln statt als Karten.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;
  var BASE = "/discover/data/";

  /* Die Dramaturgie der Startseite. `variant` bestimmt die Kartenform. */
  var HOME_SEQUENCE = [
    { rowId: "market-leaders", variant: "rank", limit: 10, as: "top-10" },
    { rowId: "new-52-week-highs", variant: "wide" },
    { rowId: "breakout-watch", variant: "compact" },
    { rowId: "momentum-leaders", variant: "poster" },
    { rowId: "relative-strength", variant: "poster" },
    { rowId: "trend-quality", variant: "compact" },
    { rowId: "sector-leaders", variant: "sector" }
  ];

  /* Wie viele Poster eine Reihe auf der Startseite zeigt. Mehr als etwa
     zwanzig wischt ohnehin niemand durch; die vollständige Rangliste steht
     hinter "Alle anzeigen". */
  var RAIL_LIMIT = 18;

  var state = { meta: null, universeId: "US_REAL", calendar: null, search: null, searchUi: null };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function C() { return D.Cards; }

  /* ------------------------------------------------------------ Laden */
  function loadMeta() {
    if (state.meta) return Promise.resolve(state.meta);
    return Promise.all([
      S.loadJSON(BASE + "meta.json"),
      S.loadJSON("/quant/config/market-calendar.json").catch(function () { return null; })
    ]).then(function (parts) {
      state.meta = parts[0];
      state.calendar = parts[1];
      global.VUDiscoverMeta = state.meta;
      if (state.meta.universes && state.meta.universes.length) {
        var bekannt = state.meta.universes.some(function (u) { return u.universeId === state.universeId; });
        if (!bekannt) state.universeId = state.meta.universes[0].universeId;
      }
      return state.meta;
    });
  }

  function universeMeta(universeId) {
    return (state.meta.universes || []).filter(function (u) {
      return u.universeId === (universeId || state.universeId);
    })[0] || state.meta.universes[0];
  }

  /* ------------------------------------------------------- Marktstatus */
  function marketState() {
    return D.RealtimeSource.assess({
      gates: state.meta.gates, audience: "public", calendar: state.calendar,
      asOf: universeMeta().asOf, now: new Date()
    });
  }

  /**
   * Die App-Leiste: Marktstatus, Universum, Suche.
   *
   * "LIVE" steht hier nur, wenn die Live-Schicht es tatsaechlich meldet
   * (§16). Alles andere heisst, was es ist: letzte Sitzung mit Datum.
   */
  function appBar() {
    var universe = universeMeta();
    var lage = marketState();
    var klasse = lage.mode === "live" ? "dx-status--live"
               : lage.session === "REGULAR" ? "dx-status--open"
               : (lage.session === "PRE" || lage.session === "AFTER") ? "dx-status--ext" : "";

    var status = el("div", { class: "dx-status " + klasse,
      title: lage.message || "Sitzung nach dem hinterlegten Handelskalender (XNYS)." }, [
      el("span", { class: "dx-dot" }),
      el("b", { text: "US Market" }),
      document.createTextNode(lage.mode === "live" ? "Live" : sessionWort(lage)),
      document.createTextNode(universe.asOf ? " · " + S.formatDate(universe.asOf) : "")
    ]);

    var switcher = el("div", { class: "dx-switch", role: "group", "aria-label": "Universum" });
    (state.meta.universes || []).forEach(function (u) {
      var knopf = el("button", { type: "button", text: u.label,
                                 "aria-pressed": String(u.universeId === state.universeId) });
      knopf.addEventListener("click", function () {
        if (u.universeId === state.universeId) return;
        state.universeId = u.universeId;
        location.hash = "#/u/" + u.universeId;
      });
      switcher.appendChild(knopf);
    });

    ensureSearch();
    var suche = el("button", { class: "dx-searchbtn", type: "button" }, [
      searchIcon(),
      document.createTextNode("Aktien entdecken"),
      el("kbd", { text: "/" })
    ]);
    suche.addEventListener("click", function () { openSearch(); });

    return el("div", { class: "dx-bar" }, [
      el("a", { class: "dx-brand", href: "#/" }, [
        document.createTextNode("Discover"),
        el("span", { text: "Vision Universe®" })
      ]),
      status, switcher, suche
    ]);
  }

  function sessionWort(lage) {
    switch (lage.session) {
      case "REGULAR": return "Geöffnet";
      case "PRE": return "Vorbörse";
      case "AFTER": return "Nachbörse";
      default: return "Geschlossen";
    }
  }

  function searchIcon() {
    var icon = C().svg("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none",
                                stroke: "currentColor", "stroke-width": 2.3 });
    icon.appendChild(C().svg("circle", { cx: 11, cy: 11, r: 7 }));
    icon.appendChild(C().svg("line", { x1: 20, y1: 20, x2: 16.2, y2: 16.2,
                                       "stroke-linecap": "round" }));
    return icon;
  }

  /* Die Suche wird angelegt, sobald die Leiste steht - nicht erst beim
     ersten Klick. Sonst gibt es die Tastaturabkürzung "/" so lange nicht,
     wie niemand den Knopf benutzt hat, und genau die soll den Knopf ja
     ersparen. */
  function ensureSearch() {
    if (!state.searchUi) {
      state.searchUi = D.Search.create({ universeId: function () { return state.universeId; } });
      document.body.appendChild(state.searchUi.node);
    }
    return state.searchUi;
  }

  function openSearch() { ensureSearch().open(); }

  /* -------------------------------------------------------- Startseite */
  function renderHome(root) {
    S.clear(root);
    var app = el("div", { class: "dx-app" });
    root.appendChild(app);
    app.appendChild(appBar());

    var heroHost = el("div", {});
    var body = el("div", { class: "dx-page" });
    app.appendChild(heroHost);
    app.appendChild(body);

    heroHost.appendChild(el("div", { class: "dx-hero" }, [el("div", { class: "dx-hero-bg" })]));

    S.loadJSON(BASE + "featured/" + state.universeId + ".json").then(function (payload) {
      S.clear(heroHost);
      heroHost.appendChild(D.Hero.render(payload, { universeId: state.universeId }));
    }).catch(function () {
      S.clear(heroHost);
      heroHost.appendChild(C().note("Eingangsfläche nicht ladbar",
        "Die Auswahl der Featured-Titel konnte nicht geladen werden. Die Reihen darunter " +
        "sind davon nicht betroffen."));
    });

    var universe = universeMeta();
    /* Der Hinweis zur Datenlage gehört unter die Eingangsfläche, aber nicht
       in einen Kasten: er erklärt, warum die Poster zeigen, was sie zeigen —
       er ist keine Warnung. */
    if (universe.kind === "mock") {
      body.appendChild(el("p", { class: "dx-inline-note" }, [
        el("b", { text: "Modelluniversum · " }),
        document.createTextNode("Alle " + universe.securities + " Titel dieser Ansicht sind " +
          "synthetisch erzeugt. Sie tragen vollständige Kursreihen und zeigen deshalb Kurs, " +
          "Verlauf und Chart — aber keine reale Marktaussage. Ranglisten werden ausschließlich " +
          "innerhalb dieses Universums gerechnet.")
      ]));
    } else if (universe.redistribution) {
      body.appendChild(el("p", { class: "dx-inline-note" }, [
        el("b", { text: "Kursniveaus · " }),
        document.createTextNode("Absolute Kurse realer Titel sind Anbieterdaten und bleiben " +
          "zurück. Die Poster zeigen deshalb den rebasierten Renditepfad, Abstände und Scores — " +
          "bei " + universe.withPriceSeries + " freigegebenen Titeln zusätzlich Kurs und " +
          "Kursverlauf.")
      ]));
    }

    var plaetze = {};
    HOME_SEQUENCE.forEach(function (schritt) {
      var host = el("div", {});
      host.appendChild(C().skeletonRail(schritt.variant === "compact" ? 6 : 5));
      plaetze[schritt.as || schritt.rowId] = host;
      body.appendChild(host);
    });

    /* Alle Zeilen gleichzeitig laden, aber der Reihe nach zeichnen.

       Der Grund ist nicht die Optik, sondern die Wiederholung: die
       stärksten Titel eines Marktes stehen naturgemäß in mehreren
       Ranglisten zugleich, und eine Startseite, auf der fünfmal dieselben
       vier Namen stehen, ist keine Entdeckung mehr. Ein Titel erscheint
       deshalb auf der Startseite nur einmal — die vollständige Rangliste
       jeder Kategorie bleibt über "Alle anzeigen" erreichbar und wird
       nicht verändert. Die Ausnahme ist die Signature-Reihe: TOP 10 zeigt
       immer die echte Reihenfolge, sonst wäre sie keine. */
    var gezeigt = Object.create(null);
    var kette = Promise.resolve();

    HOME_SEQUENCE.forEach(function (schritt) {
      var laden = S.loadJSON(BASE + "rows/" + state.universeId + "/" + schritt.rowId + ".json");
      kette = kette.then(function () {
        return laden.then(function (row) {
          var host = plaetze[schritt.as || schritt.rowId];
          S.clear(host);
          if (schritt.variant === "sector") {
            host.appendChild(sectorRail(row));
          } else if (schritt.as === "top-10") {
            host.appendChild(topTen(row));
            (row.cards || []).slice(0, 10).forEach(function (c) { gezeigt[c.symbol] = true; });
          } else {
            var gefiltert = (row.cards || []).filter(function (c) { return !gezeigt[c.symbol]; });
            var entfernt = (row.cards || []).length - gefiltert.length;
            /* Gezeigt wird genau so viel, wie auch vorgemerkt wird - sonst
               taucht ein Titel, der in dieser Reihe auf Platz 20 stand,
               weiter unten ein zweites Mal auf. */
            var sichtbar = Object.assign({}, row, { cards: gefiltert.slice(0, RAIL_LIMIT) });
            host.appendChild(C().rail(sichtbar, {
              variant: schritt.variant, universeId: state.universeId, limit: RAIL_LIMIT,
              countSuffix: entfernt ? " · ohne bereits gezeigte" : null
            }));
            sichtbar.cards.forEach(function (c) { gezeigt[c.symbol] = true; });
          }
          C().revealOnScroll(host);
        }).catch(function (err) {
          var host = plaetze[schritt.as || schritt.rowId];
          S.clear(host);
          host.appendChild(C().note("Reihe nicht ladbar",
            "»" + schritt.rowId + "« konnte nicht geladen werden (" +
            (err && err.message) + "). Die übrigen Reihen sind davon nicht betroffen."));
        });
      });
    });

    body.appendChild(footer());
    C().revealOnScroll(body);
  }

  /**
   * Die Signature-Reihe: zehn Titel, grosse Ziffern.
   * Sie entsteht aus derselben Rangliste wie MARKTFUEHRER - ein zweiter
   * Datensatz dafuer waere eine zweite Wahrheit.
   */
  function topTen(row) {
    var konfig = (state.meta.topTen || {});
    var zehn = Object.assign({}, row, {
      rowId: "top-10",
      title: konfig.title || "TOP 10 MARKET LEADERS",
      subtitle: konfig.subtitle || "Die zehn stärksten Titel — nach Leadership Score des Universums.",
      cards: (row.cards || []).slice(0, 10)
    });
    var section = C().rail(zehn, { variant: "rank", universeId: state.universeId, limit: 10 });
    /* Der Verweis fuehrt auf die vollstaendige Rangliste, nicht auf eine
       Kategorie, die es nicht gibt. */
    var mehr = section.querySelector(".dx-more");
    if (mehr) mehr.setAttribute("href", "#/c/" + state.universeId + "/market-leaders");
    return section;
  }

  /** Sektoren als Kacheln: je Sektor eine kleine Rangliste. */
  function sectorRail(payload) {
    var section = el("section", { class: "dx-rail-section dx-fade" });
    section.appendChild(C().railHead(payload.title || "SECTOR LEADERS",
      "Die stärksten Titel je Sektor.", {
        count: payload.coverage.curatedSectors + " Sektoren",
        href: "#/c/" + state.universeId + "/sector-leaders", moreLabel: "Alle Sektoren"
      }));

    if (!payload.sectors || !payload.sectors.length) {
      section.appendChild(C().emptyState("Keine kuratierte Sektorzuordnung",
        "Für dieses Universum liegt keine kuratierte Sektorzuordnung vor. Ein Sektorrang aus " +
        "einer unbelegten Zuordnung wäre ein Rang über eine Vermutung."));
      return section;
    }

    var track = el("div", { class: "dx-rail", role: "list", "aria-label": "Sektoren" });
    payload.sectors.forEach(function (sector) {
      var tile = C().sectorTile(sector, { universeId: state.universeId });
      tile.setAttribute("role", "listitem");
      track.appendChild(tile);
    });
    section.appendChild(C().withRailNav(track));
    if (payload.coverage.withoutSector) {
      section.appendChild(el("p", { class: "dx-inline-note" }, [
        el("b", { text: "Sektorabdeckung · " }),
        document.createTextNode(payload.coverage.withoutSector + " Titel dieses Universums tragen " +
          "keine kuratierte Sektorzuordnung und erscheinen deshalb in keiner Sektorreihe.")
      ]));
    }
    return section;
  }

  /* ----------------------------------------------------- Kategorieseite */
  function renderCategory(root, universeId, rowId) {
    state.universeId = universeId;
    S.clear(root);
    var app = el("div", { class: "dx-app" });
    root.appendChild(app);
    app.appendChild(appBar());
    var body = el("div", { class: "dx-page", style: "padding-top:26px" });
    app.appendChild(body);
    body.appendChild(C().skeletonRail(6));

    S.loadJSON(BASE + "rows/" + universeId + "/" + rowId + ".json").then(function (row) {
      S.clear(body);
      if (rowId === "sector-leaders") {
        body.appendChild(sectorRail(row));
        body.appendChild(footer());
        C().revealOnScroll(body);
        return;
      }

      body.appendChild(C().railHead(row.title, row.subtitle, {
        count: row.coverage.matched + " von " + row.coverage.universeSize,
        href: "#/u/" + universeId, moreLabel: "Zurück zu Discover"
      }));

      var filter = { sector: null, capBucket: null };
      var leiste = el("div", { class: "dx-filters", role: "group", "aria-label": "Filter" });
      var host = el("div", {});

      function zeichnen() {
        S.clear(host);
        var cards = row.cards.filter(function (c) {
          if (filter.sector && c.sector !== filter.sector) return false;
          if (filter.capBucket && c.capBucket !== filter.capBucket) return false;
          return true;
        });
        if (!cards.length) {
          host.appendChild(C().emptyState("Keine Treffer",
            "Mit diesem Filter bleibt in »" + row.title + "« kein Titel übrig."));
          return;
        }
        host.appendChild(C().grid(cards, { rowId: row.rowId, universeId: universeId }));
      }

      function chip(label, onClick, aktiv) {
        var knopf = el("button", { type: "button", text: label, class: aktiv ? "on" : "" });
        knopf.addEventListener("click", function () {
          onClick();
          Array.prototype.forEach.call(leiste.children, function (n) { n.classList.remove("on"); });
          knopf.classList.add("on");
          zeichnen();
        });
        leiste.appendChild(knopf);
      }

      chip("Alle", function () { filter.sector = null; filter.capBucket = null; }, true);
      (row.filters.sectors || []).forEach(function (s) {
        chip(s.id + " · " + s.count, function () { filter.sector = s.id; filter.capBucket = null; });
      });
      (row.filters.capBuckets || []).forEach(function (b) {
        chip(b.label + " · " + b.count, function () { filter.capBucket = b.id; filter.sector = null; });
      });

      body.appendChild(leiste);
      if (!(row.filters.sectors || []).length && !(row.filters.capBuckets || []).length) {
        body.appendChild(C().note("Keine Filter verfügbar",
          "Für dieses Universum liefert die Quelle weder eine kuratierte Sektorzuordnung noch " +
          "eine Marktkapitalisierung. Ein Filter über unbelegte Felder wäre ein Filter über " +
          "Vermutungen."));
      }
      body.appendChild(host);
      zeichnen();

      if (row.coverage && row.coverage.note) {
        body.appendChild(el("div", { style: "margin-top:26px" }, [
          C().note("Abdeckung", row.coverage.note)
        ]));
      }
      body.appendChild(footer());
      C().revealOnScroll(body);
    }).catch(function (err) {
      S.clear(body);
      body.appendChild(C().note("Kategorie nicht ladbar",
        "»" + rowId + "« konnte nicht geladen werden (" + (err && err.message) + ")."));
    });
  }

  /* ------------------------------------------------------- Detailseite */
  function renderDetail(root, universeId, symbol) {
    state.universeId = universeId;
    S.clear(root);
    var app = el("div", { class: "dx-app" });
    root.appendChild(app);
    app.appendChild(appBar());
    var host = el("main", { class: "dx-detail" });
    app.appendChild(host);
    host.appendChild(C().skeletonRail(3));

    S.loadJSON(BASE + "stocks/" + universeId + "/" + symbol + ".json").then(function (detail) {
      D.Detail.render(host, detail, { universeId: universeId, meta: state.meta });
      C().revealOnScroll(host);
      document.title = (detail.companyName || symbol) + " — Vision Universe® Discover";
    }).catch(function () {
      S.clear(host);
      host.appendChild(el("a", { class: "dx-back", href: "#/", text: "← Discover" }));
      host.appendChild(el("div", { style: "padding:20px 0" }, [
        C().emptyState("Keine Detailseite für " + symbol,
          "Für diesen Titel wird in »" + universeMeta(universeId).label + "« keine Detailseite " +
          "ausgeliefert. Im Modelluniversum tragen nur die Titel der Discovery-Reihen eine " +
          "eigene Seite — eine Kursreihe je Titel wäre über das ganze Universum unnötig groß.")
      ]));
    });
  }

  function footer() {
    var universe = universeMeta();
    return el("footer", { class: "dx-foot" }, [
      el("div", {}, [
        el("b", { text: "Discover " + state.meta.moduleVersion + " · " }),
        document.createTextNode("Methodik " + state.meta.methodologyVersion +
          " · Contract " + state.meta.contractVersion)
      ]),
      el("div", { style: "margin-top:6px" }, [
        el("b", { text: "Aktualität: " }),
        document.createTextNode(state.meta.realtime.message)
      ]),
      el("div", { style: "margin-top:6px" }, [
        el("b", { text: "Universum: " }),
        document.createTextNode(universe.rankingScope + " " + universe.note)
      ]),
      el("div", { style: "margin-top:6px" }, [document.createTextNode(state.meta.disclaimer)])
    ]);
  }

  /* ------------------------------------------------------------ Router */
  function route() {
    var root = document.getElementById("d-root");
    var hash = location.hash.replace(/^#/, "");
    var teile = hash.split("/").filter(Boolean);

    loadMeta().then(function () {
      document.title = "Discover — Vision Universe®";
      if (teile[0] === "s" && teile.length >= 3) {
        renderDetail(root, teile[1], decodeURIComponent(teile[2]).toUpperCase());
      } else if (teile[0] === "c" && teile.length >= 3) {
        renderCategory(root, teile[1], teile[2]);
      } else if (teile[0] === "u" && teile[1]) {
        state.universeId = teile[1];
        renderHome(root);
      } else {
        renderHome(root);
      }
      global.scrollTo({ top: 0, behavior: "auto" });
    }).catch(function (err) {
      S.clear(root);
      root.appendChild(el("div", { class: "dx-app" }, [
        el("div", { style: "padding:80px 24px" }, [
          C().emptyState("Discover konnte nicht starten",
            "Die Modul-Metadaten (discover/data/meta.json) sind nicht ladbar: " +
            (err && err.message ? err.message : err) + ". Erzeugt werden sie mit " +
            "node scripts/discover/build-discover-data.mjs.")
        ])
      ]));
    });
  }

  global.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") route();
})(window);
