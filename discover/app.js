/* =========================================================================
   VISION UNIVERSE® DISCOVER — app.js

   Router und Seiten des Discovery-Moduls.

   Die Anwendung ist statisch ausgeliefert; die Navigation laeuft deshalb
   ueber den Hash - kein Server, der /discover/NVDA aufloesen koennte, und
   keine 404-Umleitung, die eine Seite vortaeuscht, die es nicht gibt:

     #/                         Discover-Startseite
     #/u/US_REAL                Startseite eines Universums
     #/c/US_REAL/market-leaders Kategorie
     #/s/US_REAL/NVDA           Titel

   Geladen wird ausschliesslich aus discover/data/** - fertige Payloads,
   die scripts/discover/build-discover-data.mjs erzeugt hat. Eine
   Startseite kostet damit so viele Abrufe, wie sie Reihen zeigt, und
   nicht so viele, wie das Universum Titel hat.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;
  var BASE = "/discover/data/";

  var ROW_ORDER = ["new-52-week-highs", "market-leaders", "momentum-leaders",
                   "breakout-txt", "breakout-watch", "relative-strength", "trend-quality"];

  var state = { meta: null, universeId: "US_REAL", calendar: null, search: null };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function C() { return D.Cards; }

  /* ----------------------------------------------------------- Laden */
  function loadMeta() {
    if (state.meta) return Promise.resolve(state.meta);
    return Promise.all([
      S.loadJSON(BASE + "meta.json"),
      S.loadJSON("/quant/config/market-calendar.json").catch(function () { return null; })
    ]).then(function (parts) {
      state.meta = parts[0];
      state.calendar = parts[1];
      global.VUDiscoverMeta = state.meta;
      return state.meta;
    });
  }

  function universeMeta(universeId) {
    return (state.meta.universes || []).filter(function (u) { return u.universeId === universeId; })[0] ||
           state.meta.universes[0];
  }

  function rowIdsFor(universeId) {
    var entry = (state.meta.rows || []).filter(function (r) { return r.universeId === universeId; })[0];
    var ids = entry ? entry.rows.map(function (r) { return r.rowId; }) : [];
    ids.push("sector-leaders");
    return ids;
  }

  /* -------------------------------------------------------- Marktstatus */
  function marketState() {
    return D.RealtimeSource.assess({
      gates: state.meta.gates, audience: "public", calendar: state.calendar,
      asOf: universeMeta(state.universeId).asOf, now: new Date()
    });
  }

  function statusPill(assessment) {
    var cls = assessment.session === "REGULAR" ? "d-pill--open"
            : (assessment.session === "PRE" || assessment.session === "AFTER") ? "d-pill--ext"
            : "d-pill--closed";
    return el("span", { class: "d-pill " + cls, title: assessment.calendarCoverage
      ? "Sitzung nach dem hinterlegten Handelskalender (XNYS)."
      : "Ausserhalb der Kalenderabdeckung - die Sitzungsaussage ist nicht gesichert." }, [
      el("span", { class: "d-dot" }),
      document.createTextNode(assessment.sessionLabel)
    ]);
  }

  /* Der ehrliche Aktualitaets-Hinweis (§18): kein LIVE ohne Live-Daten. */
  function dataPill(assessment, universe) {
    var label = assessment.mode === "live" ? "LIVE"
              : assessment.mode === "delayed" ? "VERZÖGERT"
              : universe.kind === "mock" ? "MODELLDATEN"
              : "SCHLUSSKURS";
    return el("span", { class: "d-pill", title: assessment.message || "" }, [
      el("span", { class: "d-dot" }),
      document.createTextNode(label + (universe.asOf ? " · " + S.formatDate(universe.asOf) : ""))
    ]);
  }

  /* ---------------------------------------------------------- Kopfband */
  function hero(options) {
    options = options || {};
    var universe = universeMeta(state.universeId);
    var assessment = marketState();

    var switcher = el("div", { class: "d-switch", role: "group", "aria-label": "Universum" });
    (state.meta.universes || []).forEach(function (u) {
      var button = el("button", { type: "button", "aria-pressed": String(u.universeId === state.universeId),
                                  text: u.label });
      button.addEventListener("click", function () {
        if (u.universeId === state.universeId) return;
        state.universeId = u.universeId;
        location.hash = "#/u/" + u.universeId;
      });
      switcher.appendChild(button);
    });

    return el("header", { class: "d-hero" }, [
      el("div", { class: "d-hero-inner" }, [
        el("div", { class: "d-hero-top" }, [
          el("div", {}, [
            el("div", { class: "d-wordmark" }, [
              el("h1", {}, [document.createTextNode("DISCOVER"),
                            el("span", { class: "d-reg", text: "®" })])
            ]),
            el("p", { class: "d-tagline" }, [
              el("b", { text: "Where market leadership begins. " }),
              document.createTextNode(
                "Vision Universe zeigt, wo gerade neue Jahreshochs, Marktfuehrer und " +
                "Ausbrueche entstehen — als Reihen, nicht als Formular.")
            ])
          ]),
          el("div", { class: "d-status" }, [statusPill(assessment), dataPill(assessment, universe)])
        ]),
        el("div", { class: "d-hero-top" }, [searchBox(), switcher]),
        el("div", { class: "d-hero-meta" }, [
          metaItem("Universum", universe.securities + " Titel"),
          metaItem("Datenart", universe.kind === "real" ? "real (" + (universe.provider || "Anbieter") + ")"
                                                        : "synthetisch (Modell)"),
          metaItem("Benchmark", universe.benchmark || "–"),
          metaItem("Stand", universe.asOf ? S.formatDate(universe.asOf) : "–"),
          metaItem("Methodik", state.meta.methodologyVersion)
        ])
      ])
    ]);
  }

  function metaItem(label, value) {
    return el("span", {}, [document.createTextNode(label + " "), el("b", { text: value })]);
  }

  /* ------------------------------------------------------------- Suche */
  function searchBox() {
    var input = el("input", { type: "search", placeholder: "Unternehmen oder Ticker suchen…",
                              "aria-label": "Titel suchen", autocomplete: "off" });
    var results = el("div", { class: "d-results", hidden: true });
    var box = el("div", { class: "d-search" }, [searchIcon(), input, results]);

    function ensureIndex() {
      if (state.search && state.search.universeId === state.universeId) {
        return Promise.resolve(state.search);
      }
      return S.loadJSON(BASE + "search/" + state.universeId + ".json").then(function (index) {
        state.search = index;
        return index;
      });
    }

    function run() {
      var q = input.value.trim().toUpperCase();
      if (q.length < 1) { results.hidden = true; return; }
      ensureIndex().then(function (index) {
        var hits = index.entries.filter(function (e) {
          return e.s.indexOf(q) === 0 || (e.n && e.n.toUpperCase().indexOf(q) !== -1) ||
                 e.s.indexOf(q) !== -1;
        }).slice(0, 12);
        S.clear(results);
        if (!hits.length) {
          results.appendChild(el("div", { class: "d-results-empty",
            text: "Kein Titel in »" + index.universeLabel + "« passt zu „" + input.value + "“." }));
        }
        hits.forEach(function (hit) {
          var button = el("button", { type: "button" }, [
            el("span", { class: "sym", text: hit.s }),
            el("span", { class: "nm", text: hit.n || "Name nicht ausgeliefert" }),
            el("span", { class: "tag", text: hit.h ? "52W-Hoch" : (hit.sec || (hit.m ? "real" : "Modell")) })
          ]);
          button.addEventListener("click", function () {
            input.value = "";
            results.hidden = true;
            location.hash = "#/s/" + index.universeId + "/" + hit.s;
          });
          results.appendChild(button);
        });
        results.hidden = false;
      }).catch(function () {
        S.clear(results);
        results.appendChild(el("div", { class: "d-results-empty",
          text: "Der Suchindex konnte nicht geladen werden." }));
        results.hidden = false;
      });
    }

    input.addEventListener("input", run);
    input.addEventListener("focus", function () { if (input.value) run(); });
    document.addEventListener("click", function (event) {
      if (!box.contains(event.target)) results.hidden = true;
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { results.hidden = true; input.blur(); }
    });
    return box;
  }

  function searchIcon() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.2");
    var circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "11"); circle.setAttribute("cy", "11"); circle.setAttribute("r", "7");
    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", "20"); line.setAttribute("y1", "20");
    line.setAttribute("x2", "16.2"); line.setAttribute("y2", "16.2");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(circle); svg.appendChild(line);
    return svg;
  }

  /* -------------------------------------------------------- Startseite */
  function renderHome(root) {
    S.clear(root);
    root.appendChild(hero());

    var chips = el("nav", { class: "d-chips", "aria-label": "Kategorien" });
    var body = el("div", { class: "d-page" });
    root.appendChild(chips);
    root.appendChild(body);

    var universe = universeMeta(state.universeId);
    if (universe.kind === "mock") {
      body.appendChild(el("div", { style: "padding:18px 0 0" }, [
        C().notice("Modelluniversum",
          "Alle Titel dieser Ansicht sind synthetisch (" + universe.securities + " Stueck, Seed " +
          "des Vision-Universe-Mock-Generators). Sie tragen vollstaendige Kursreihen und zeigen " +
          "deshalb Preis, Sparkline und Chart - aber keine reale Marktaussage. Ranglisten werden " +
          "ausschliesslich innerhalb dieses Universums gerechnet.")
      ]));
    } else if (universe.redistribution) {
      body.appendChild(el("div", { style: "padding:18px 0 0" }, [
        C().notice("Kursniveaus nicht ausgeliefert",
          "Absolute Kurse realer Titel sind Anbieterdaten und bleiben zurueck. Die Karten zeigen " +
          "deshalb Abstaende, Renditen und Scores — bei " + universe.withPriceSeries +
          " freigegebenen Titeln zusaetzlich Kurs und Verlauf.", "info")
      ]));
    }

    var ids = rowIdsFor(state.universeId);
    var placeholders = {};
    var chipSlots = {};
    ids.forEach(function (id) {
      var host = el("div", {});
      host.appendChild(C().skeletonRail(6));
      placeholders[id] = host;
      body.appendChild(host);
      /* Der Platz des Chips wird jetzt reserviert, gefuellt wird er, wenn
         die Zeile geladen ist. Sonst haengt die Reihenfolge der Leiste
         daran, welche Datei zuerst ankommt. */
      if (id !== "sector-leaders") {
        chipSlots[id] = el("span", {});
        chips.appendChild(chipSlots[id]);
      }
    });

    ids.forEach(function (id) {
      S.loadJSON(BASE + "rows/" + state.universeId + "/" + id + ".json").then(function (row) {
        var host = placeholders[id];
        S.clear(host);
        if (id === "sector-leaders") {
          host.appendChild(sectorSection(row));
        } else {
          host.appendChild(C().discoveryRow(row, { universeId: state.universeId }));
          if (chipSlots[id]) {
            chipSlots[id].appendChild(el("a", { class: "d-chip",
              href: "#/c/" + state.universeId + "/" + row.rowId, text: row.title }));
          }
        }
        C().revealOnScroll(host);
      }).catch(function (err) {
        var host = placeholders[id];
        S.clear(host);
        host.appendChild(C().notice("Zeile nicht ladbar",
          "»" + id + "« konnte nicht geladen werden (" + (err && err.message) + "). " +
          "Die uebrigen Reihen sind davon nicht betroffen."));
      });
    });

    body.appendChild(footer());
  }

  function sectorSection(payload) {
    var wrap = el("section", { class: "d-fade" }, [
      el("div", { class: "d-row-head", style: "margin-top:34px" }, [
        el("div", { class: "d-row-title" }, [
          el("h2", { text: payload.title || "SECTOR LEADERS" }),
          el("p", { text: payload.subtitle || "" })
        ]),
        el("span", { class: "d-row-count",
          text: payload.coverage.curatedSectors + " Sektoren kuratiert" })
      ])
    ]);

    if (!payload.sectors || !payload.sectors.length) {
      wrap.appendChild(C().emptyState("Keine kuratierten Sektoren",
        "Fuer dieses Universum liegt keine kuratierte Sektorzuordnung vor. Ein Sektorrang aus " +
        "einer unbelegten Zuordnung waere ein Rang ueber eine Vermutung."));
      return wrap;
    }

    payload.sectors.forEach(function (sector) {
      wrap.appendChild(C().discoveryRow({
        rowId: "sector-leaders", title: sector.sector,
        subtitle: sector.count + " Titel im Universum",
        universeId: payload.universeId, universeLabel: payload.universeLabel,
        asOf: payload.asOf, cards: sector.cards,
        coverage: { matched: sector.count, universeSize: payload.coverage.universeSize }
      }, { universeId: payload.universeId, showMore: false }));
    });

    if (payload.coverage.withoutSector) {
      wrap.appendChild(C().notice("Sektorabdeckung",
        payload.coverage.withoutSector + " Titel dieses Universums tragen keine kuratierte " +
        "Sektorzuordnung und erscheinen deshalb in keiner Sektorreihe.", "info"));
    }
    return wrap;
  }

  /* ------------------------------------------------------ Kategorieseite */
  function renderCategory(root, universeId, rowId) {
    state.universeId = universeId;
    S.clear(root);
    root.appendChild(hero());
    var body = el("div", { class: "d-page" });
    root.appendChild(body);
    body.appendChild(C().skeletonRail(8));

    S.loadJSON(BASE + "rows/" + universeId + "/" + rowId + ".json").then(function (row) {
      S.clear(body);
      if (rowId === "sector-leaders") {
        body.appendChild(sectorSection(row));
        body.appendChild(footer());
        C().revealOnScroll(body);
        return;
      }

      var filters = { sector: null, capBucket: null };
      var head = el("div", { class: "d-row-head", style: "margin-top:26px" }, [
        el("div", { class: "d-row-title" }, [
          el("h2", { text: row.title }), el("p", { text: row.subtitle || "" })
        ]),
        el("a", { class: "d-more", href: "#/u/" + universeId, text: "← Alle Kategorien" })
      ]);
      body.appendChild(head);

      var chips = el("div", { class: "d-chips", style: "position:static;border:0;background:transparent" });
      var grid = el("div", {});

      function paint() {
        S.clear(grid);
        var cards = row.cards.filter(function (c) {
          if (filters.sector && c.sector !== filters.sector) return false;
          if (filters.capBucket && c.capBucket !== filters.capBucket) return false;
          return true;
        });
        if (!cards.length) {
          grid.appendChild(C().emptyState("Keine Treffer",
            "Mit diesem Filter bleibt in »" + row.title + "« kein Titel uebrig."));
          return;
        }
        grid.appendChild(C().cardGrid(cards, { rowId: row.rowId, universeId: universeId, ranked: true }));
      }

      function addChip(label, onClick, isActive) {
        var chip = el("button", { class: "d-chip" + (isActive ? " on" : ""), type: "button", text: label });
        chip.addEventListener("click", function () {
          onClick();
          S.$$(".d-chip", chips).forEach(function (c) { c.classList.remove("on"); });
          chip.classList.add("on");
          paint();
        });
        chips.appendChild(chip);
      }

      addChip("Alle", function () { filters.sector = null; filters.capBucket = null; }, true);
      (row.filters.sectors || []).forEach(function (s) {
        addChip(s.id + " (" + s.count + ")", function () { filters.sector = s.id; filters.capBucket = null; });
      });
      (row.filters.capBuckets || []).forEach(function (b) {
        addChip(b.label + " (" + b.count + ")", function () { filters.capBucket = b.id; filters.sector = null; });
      });

      body.appendChild(chips);
      if (!(row.filters.sectors || []).length && !(row.filters.capBuckets || []).length) {
        body.appendChild(C().notice("Keine Filter verfuegbar",
          "Fuer dieses Universum liefert die Quelle weder eine kuratierte Sektorzuordnung noch " +
          "eine Marktkapitalisierung. Ein Filter ueber unbelegte Felder waere ein Filter ueber " +
          "Vermutungen.", "info"));
      }
      body.appendChild(grid);
      paint();

      if (row.coverage && row.coverage.note) {
        body.appendChild(C().notice("Abdeckung", row.coverage.note, "info"));
      }
      body.appendChild(footer());
      C().revealOnScroll(body);
    }).catch(function (err) {
      S.clear(body);
      body.appendChild(C().notice("Kategorie nicht ladbar",
        "»" + rowId + "« konnte nicht geladen werden (" + (err && err.message) + ")."));
    });
  }

  /* --------------------------------------------------------- Detailseite */
  function renderDetail(root, universeId, symbol) {
    state.universeId = universeId;
    S.clear(root);
    var host = el("main", { class: "d-detail" });
    root.appendChild(host);
    host.appendChild(C().skeletonRail(3));

    S.loadJSON(BASE + "stocks/" + universeId + "/" + symbol + ".json").then(function (detail) {
      D.Detail.render(host, detail);
      C().revealOnScroll(host);
      document.title = symbol + " — Vision Universe® Discover";
    }).catch(function () {
      S.clear(host);
      host.appendChild(el("a", { class: "d-back", href: "#/", text: "← Discover" }));
      host.appendChild(C().emptyState("Keine Detailseite fuer " + symbol,
        "Fuer diesen Titel wird in »" + universeMeta(universeId).label + "« keine Detailseite " +
        "ausgeliefert. Im Modelluniversum tragen nur die Titel der Discovery-Zeilen eine " +
        "eigene Seite - eine Kursreihe je Titel waere ueber das ganze Universum unnoetig gross."));
    });
  }

  function footer() {
    var universe = universeMeta(state.universeId);
    return el("footer", { class: "d-foot" }, [
      el("div", {}, [
        el("b", { text: "Discover " + state.meta.moduleVersion + " · " }),
        document.createTextNode("Methodik " + state.meta.methodologyVersion +
          " · Contract " + state.meta.contractVersion +
          " · Engines: " + Object.keys(state.meta.engines).map(function (k) {
            return state.meta.engines[k]; }).join(", "))
      ]),
      el("div", { style: "margin-top:6px" }, [
        el("b", { text: "Realtime: " }),
        document.createTextNode(state.meta.realtime.message)
      ]),
      el("div", { style: "margin-top:6px" }, [
        el("b", { text: "Universum: " }),
        document.createTextNode(universe.rankingScope + " " + universe.note)
      ]),
      el("div", { style: "margin-top:6px" }, [document.createTextNode(state.meta.disclaimer)])
    ]);
  }

  /* ------------------------------------------------------------- Router */
  function route() {
    var root = document.getElementById("d-root");
    var hash = location.hash.replace(/^#/, "");
    var parts = hash.split("/").filter(Boolean);

    loadMeta().then(function () {
      document.title = "Discover — Vision Universe®";
      if (parts[0] === "s" && parts.length >= 3) {
        renderDetail(root, parts[1], decodeURIComponent(parts[2]).toUpperCase());
      } else if (parts[0] === "c" && parts.length >= 3) {
        renderCategory(root, parts[1], parts[2]);
      } else if (parts[0] === "u" && parts[1]) {
        state.universeId = parts[1];
        renderHome(root);
      } else {
        renderHome(root);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }).catch(function (err) {
      S.clear(root);
      root.appendChild(el("div", { class: "d-detail" }, [
        C().emptyState("Discover konnte nicht starten",
          "Die Modul-Metadaten (discover/data/meta.json) sind nicht ladbar: " +
          (err && err.message ? err.message : err) + ". Erzeugt werden sie mit " +
          "node scripts/discover/build-discover-data.mjs.")
      ]));
    });
  }

  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") route();
})(window);
