/* =========================================================================
   VISION UNIVERSE® DISCOVER — app.js

   Router und Seiten.

   Die Anwendung wird statisch ausgeliefert; navigiert wird ueber den Hash:

     #/                          Startseite
     #/u/US_REAL                 Startseite eines Universums
     #/c/US_REAL/market-leaders  Kategorie
     #/s/US_REAL/NVDA            Titel
     #/einzeln/US_REAL           Einzeln entdecken

   Geladen wird ausschliesslich aus discover/data/** - fertige Payloads aus
   dem Build.

   DIE STARTSEITE (V3)

   Sie ist kein Skript mehr, das Reihen aneinanderhaengt, sondern ein
   Manifest aus dem Build (discover/data/home/<U>.json): eine Folge von
   Surfaces, jede mit ihrer Auswahl. Welche Karte wo steht, hat der Build
   entschieden und nachgerechnet - hier wird nur gezeichnet. Das Manifest
   kommt in Stuecken: das erste traegt, was ueber der Falz steht; die
   weiteren laedt die Seite nach, sobald man in ihre Naehe scrollt. Eine
   Startseite kostet damit zwei Abrufe, egal ob das Universum 498 oder
   7 000 Titel hat.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;
  var BASE = "/discover/data/";

  var state = { meta: null, universeId: "US_REAL", calendar: null, search: null, searchUi: null,
                memory: null };

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
      /* Das Gedaechtnis des Geraets - einmal je Sitzung. Die Karten
         fragen es ueber D.memory, ob man einen Titel schon kennt. */
      if (!state.memory && D.Memory) { state.memory = D.Memory.create(); D.memory = state.memory; }
      if (state.meta.universes && state.meta.universes.length) {
        var bekannt = state.meta.universes.some(function (u) { return u.universeId === state.universeId; });
        if (!bekannt) state.universeId = state.meta.universes[0].universeId;
      }
      /* Der Live-Hub: ein Verzeichnis, einmal - danach entscheidet jede
         Karte synchron, ob sie einen Tagesverlauf hat. Ohne Freigabe
         (meta.realtime.available) bleibt er aus, und nichts wird geholt. */
      if (D.LiveHub) {
        D.LiveHub.init({ realtime: state.meta.realtime, calendar: state.calendar });
        return D.LiveHub.loadIndex().catch(function () { return null; }).then(function () { return state.meta; });
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
    var lage = D.RealtimeSource.assess({
      gates: state.meta.gates, audience: "public", calendar: state.calendar,
      asOf: universeMeta().asOf, now: new Date()
    });
    /* Der Session-Resolver benennt, welche Sitzung gerade gilt und wie
       sie heisst - dieselbe Sprache wie auf den Karten. */
    var T = global.VURealtime && global.VURealtime.TradingSession;
    if (T) {
      lage.trading = T.resolve(new Date(), { calendar: state.calendar });
      var Hub = D.LiveHub, idx = Hub && Hub.enabled() ? Hub.index() : null;
      /* Der Datenstand des Verzeichnisses (dataSession: juengste Sitzung mit
         Snapshots, spaetester Stand) - nicht der Zeitpunkt des Laufs. Der
         Freshness-Vertrag sagt, ob das der Stand ist, der jetzt gelten
         muesste; "Stand Freitag" bei gehandeltem Montag heisst dann
         "Stand Fr., 11.09. · nicht aktuell". */
      var stand = null;
      if (idx && idx.dataSession && idx.dataSession.sessionDate) {
        stand = { sessionDate: idx.dataSession.sessionDate, asOf: idx.dataSession.asOf, asOfLocal: idx.dataSession.asOfLocal,
                  regularComplete: idx.dataSession.regularComplete !== false };
      } else if (idx && idx.entries) {
        var syms = Object.keys(idx.entries);
        for (var i = 0; i < syms.length; i++) {
          var e = idx.entries[syms[i]];
          if (!stand || e.sessionDate > stand.sessionDate || (e.sessionDate === stand.sessionDate && e.asOf > stand.asOf)) {
            stand = { sessionDate: e.sessionDate, asOf: e.asOf, asOfLocal: e.asOfLocal, regularComplete: !!e.regularComplete };
          }
        }
      }
      var fr = Hub && Hub.enabled() && Hub.freshness ? Hub.freshness(stand) : null;
      lage.freshness = fr;
      lage.beschreibung = fr ? fr.label : T.describe(lage.trading, stand);
      lage.liveSnapshots = !!(idx && idx.entryCount);
    }
    return lage;
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

    /* Die Zeile sagt, was gilt: "Geöffnet · Stand 15:42" waehrend der
       Sitzung, sonst "Geschlossen · Letzter Handelstag · Freitag". Kein
       "Live" ohne Strom, kein technischer Code. */
    var zusatz;
    if (lage.beschreibung && lage.liveSnapshots) {
      /* Kurz genug fuer die Leiste - auch auf dem Telefon: "Stand 15:42",
         "Schluss 16:00", "Stand Freitag". Das Wort davor sagt schon, ob
         die Boerse offen ist. */
      zusatz = lage.beschreibung.label.replace(/^Heute · /, "").replace(/^Letzter Handelstag · /, "Stand ");
    } else {
      zusatz = universe.asOf ? S.formatDate(universe.asOf) : "";
    }
    if (lage.freshness && lage.freshness.freshnessState === "STALE") klasse += " dx-status--stale";
    var status = el("div", { class: "dx-status " + klasse, "data-freshness": lage.freshness ? lage.freshness.freshnessState : "",
      title: (lage.beschreibung ? lage.beschreibung.timezoneNote + ". " : "") +
             (lage.freshness && lage.freshness.freshnessState === "STALE"
               ? "Der ausgelieferte Stand ist aelter als der letzte Handelstag (" + lage.freshness.expectedSessionDate + "). "
               : "") +
             (lage.message || "Sitzung nach dem hinterlegten Handelskalender (XNYS).") }, [
      el("span", { class: "dx-dot" }),
      el("b", { text: "US Market" }),
      document.createTextNode(lage.mode === "live" ? "Live"
        : (lage.beschreibung ? (lage.beschreibung.marketStateWord || lage.beschreibung.state) : sessionWort(lage))),
      document.createTextNode(zusatz ? " · " + zusatz : "")
    ]);

    /* Der Universumsschalter erscheint nur, wenn es etwas zu schalten gibt.
       Seit dem 15.09.2026 wird nur das reale Universum ausgeliefert. */
    var switcher = el("div", { class: "dx-switch", role: "group", "aria-label": "Universum" });
    if ((state.meta.universes || []).length < 2) switcher = null;
    ((state.meta.universes || []).length < 2 ? [] : state.meta.universes).forEach(function (u) {
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

    /* Der Einstieg in den Einzelmodus. Er steht hier als Angebot neben
       der Suche - nicht als Startseite, nicht als Umleitung. Wer ihn
       nicht anfasst, merkt nichts von ihm. */
    var einzeln = el("a", { class: "dx-einzeln", href: "#/einzeln/" + state.universeId,
                            title: "Eine Aktie pro Bildschirm — zum Durchwischen",
                            "aria-label": "Einzeln entdecken" }, [
      el("i", { "aria-hidden": "true" }),
      el("span", { text: "Einzeln entdecken" })
    ]);

    return el("div", { class: "dx-bar" }, [
      el("a", { class: "dx-brand", href: "#/" }, [
        document.createTextNode("Discover"),
        el("span", { text: "Vision Universe®" })
      ]),
      status, switcher, einzeln, suche
    ].filter(Boolean));
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
  /**
   * Der Hinweis zur Datenlage. Er erklaert, warum die Karten zeigen, was
   * sie zeigen - und er ist keine Warnung, also steht er auch in keinem
   * Kasten. Auf dem Telefon zugeklappt, am Schreibtisch offen.
   */
  function datenhinweis(marke, kurz, lang) {
    var offen = !global.matchMedia || global.matchMedia("(min-width:861px)").matches;
    var node = el("details", { class: "dx-inline-note" }, [
      el("summary", {}, [el("b", { text: marke + " · " }), document.createTextNode(kurz)]),
      el("p", { text: lang })
    ]);
    if (offen) node.setAttribute("open", "open");
    return node;
  }

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

    var universe = universeMeta();
    var ctx = {
      universeId: state.universeId, universeLabel: universe.label, universeSize: universe.securities,
      asOf: universe.asOf, meta: state.meta,
      sectorWorlds: (state.meta.visualLanguage && state.meta.visualLanguage.sectorWorlds) || {}
    };
    if (D.Analytics) D.Analytics.track("discover_impression", { universeId: state.universeId });

    /* Der Hinweis zur Datenlage: unter der Eingangsflaeche, nicht in
       einem Kasten - er erklaert, warum die Karten zeigen, was sie
       zeigen, er warnt nicht. */
    var hinweis = null;
    if (universe.kind === "mock") {
      hinweis = datenhinweis("Modelluniversum",
        "Alle " + universe.securities + " Titel dieser Ansicht sind synthetisch erzeugt.",
        "Sie tragen vollständige Kursreihen und zeigen deshalb Kurs, Verlauf und Chart — aber " +
        "keine reale Marktaussage. Ranglisten werden ausschließlich innerhalb dieses " +
        "Universums gerechnet.");
    } else if (universe.securities > universe.withPriceSeries) {
      /* Nur solange nicht jeder Titel eine Kursreihe traegt: dann sagt die
         Seite, wie viele es sind - und dass der Rest Balken zeigt, keine
         Linie. Tragen alle eine Reihe, gibt es keinen Hinweis. */
      hinweis = datenhinweis("Kursreihen",
        "Für " + universe.withPriceSeries + " von " + universe.securities + " Titeln liegt eine Kursreihe vor.",
        "Titel ohne Kursreihe zeigen Renditen über 1, 3, 6 und 12 Monate als Balken — keinen " +
        "Kursverlauf. Die übrigen Reihen kommen mit dem nächsten Marktdaten-Lauf; geschätzt wird nichts.");
    }

    var homeInfo = (state.meta.home || []).filter(function (h) {
      return h.universeId === state.universeId;
    })[0];
    if (!homeInfo || !homeInfo.chunks || !homeInfo.chunks.length) {
      S.clear(heroHost);
      body.appendChild(C().emptyState("Keine Startseite ausgeliefert",
        "Für dieses Universum liegt kein Startseiten-Manifest vor (discover/data/home/). " +
        "Erzeugt wird es mit node scripts/discover/build-discover-data.mjs."));
      return;
    }

    /* Sichtbarkeit der Surfaces: ein Beobachter fuer alle. Daraus
       entstehen collection_view und die gemerkte Position - und sonst
       nichts. */
    var beobachter = global.IntersectionObserver ? new global.IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (!e.isIntersecting) return;
        var node = e.target;
        beobachter.unobserve(node);
        var index = Number(node.getAttribute("data-surface-index"));
        if (D.Analytics) {
          D.Analytics.track("collection_view", { universeId: state.universeId,
            rowId: node.getAttribute("data-row") || null,
            surface: node.getAttribute("data-surface-type") || null });
          if (node.getAttribute("data-surface-type") === "theme") {
            D.Analytics.track("theme_open", { universeId: state.universeId,
              themeId: (node.getAttribute("data-row") || "").replace(/^thema-/, "") });
          }
        }
        if (state.memory && isNum(index)) state.memory.setPosition(state.universeId, index);
      });
    }, { threshold: 0.35 }) : null;

    var laufendeNummer = 0;
    var geladen = Object.create(null);

    function zeichneSurface(surface) {
      if (surface.type === "hero") {
        S.clear(heroHost);
        heroHost.appendChild(D.Hero.render({ stocks: surface.cards || [] }, { universeId: state.universeId }));
        if (hinweis) body.appendChild(hinweis);
        return;
      }
      var node = D.Surfaces.render(surface, ctx);
      if (!node) return;
      node.setAttribute("data-surface-index", String(laufendeNummer++));
      body.appendChild(node);
      if (beobachter) beobachter.observe(node);
      /* "Zuletzt angesehen" direkt nach der Rangliste - dort, wo man
         beim zweiten Besuch weitermachen will. */
      if (surface.type === "ranking" && surface.id === "top-10" && state.memory) {
        var zuletzt = D.Surfaces.recent(state.memory, ctx);
        if (zuletzt) body.appendChild(zuletzt);
        /* Die eine ehrliche Personalisierung: Nachbarn des zuletzt
           geoeffneten Titels, vom Geraet gemerkt (engines/memory.js). */
        var weil = D.Surfaces.becauseYouViewed ? D.Surfaces.becauseYouViewed(state.memory, ctx) : null;
        if (weil) body.appendChild(weil);
      }
    }

    /* Das naechste Stueck kommt, sobald man in seine Naehe scrollt - nicht
       sofort. Wer nach der dritten Reihe eine Aktie oeffnet, hat den Rest
       nie geladen. */
    function nachladen(next) {
      var sentinel = el("div", { class: "dx-sentinel", "aria-hidden": "true" });
      body.appendChild(sentinel);
      if (global.IntersectionObserver) {
        var io = new global.IntersectionObserver(function (eintraege) {
          if (!eintraege.some(function (e) { return e.isIntersecting; })) return;
          io.disconnect();
          ladeStueck(next, sentinel);
        }, { rootMargin: "900px 0px" });
        io.observe(sentinel);
      } else {
        ladeStueck(next, sentinel);
      }
    }

    function ladeStueck(url, sentinel) {
      if (geladen[url]) return Promise.resolve();
      geladen[url] = true;
      return S.loadJSON(url).then(function (teil) {
        if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
        (teil.surfaces || []).forEach(zeichneSurface);
        C().revealOnScroll(body);
        if (teil.next) nachladen(teil.next);
        else { body.appendChild(footer()); C().revealOnScroll(body); }
      }).catch(function (err) {
        if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
        body.appendChild(C().note("Startseite nicht vollständig ladbar",
          "Ein Teil der Startseite (" + url + ") konnte nicht geladen werden (" +
          (err && err.message) + "). Was oben steht, ist davon nicht betroffen."));
        body.appendChild(footer());
      });
    }

    body.appendChild(C().skeletonRail(5));
    var erster = homeInfo.chunks[0];
    S.loadJSON(erster).then(function (teil) {
      S.clear(body);
      geladen[erster] = true;
      (teil.surfaces || []).forEach(zeichneSurface);
      C().revealOnScroll(body);
      if (teil.next) nachladen(teil.next);
      else body.appendChild(footer());
    }).catch(function (err) {
      S.clear(heroHost);
      S.clear(body);
      body.appendChild(C().note("Startseite nicht ladbar",
        "Das Startseiten-Manifest konnte nicht geladen werden (" + (err && err.message) + ")."));
    });
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

    if (state.memory) state.memory.recordCollection(rowId);
    if (D.Analytics) D.Analytics.track("collection_view", { universeId: universeId, rowId: rowId, surface: "category" });

    S.loadJSON(BASE + "rows/" + universeId + "/" + rowId + ".json").then(function (row) {
      S.clear(body);
      if (rowId === "sector-leaders") {
        body.appendChild(D.Surfaces.sectors({
          type: "sectors", id: "sectors", rowId: "sector-leaders", title: row.title,
          subtitle: row.subtitle, sectors: row.sectors || [],
          withoutSector: row.coverage && row.coverage.withoutSector
        }, { universeId: universeId,
             sectorWorlds: (state.meta.visualLanguage && state.meta.visualLanguage.sectorWorlds) || {} }));
        body.appendChild(footer());
        C().revealOnScroll(body);
        return;
      }

      if (row.world) body.setAttribute("data-world", row.world);
      body.appendChild(C().railHead(row.title, row.subtitle, {
        count: row.coverage.matched + " von " + row.coverage.universeSize,
        href: "#/u/" + universeId, moreLabel: "Zurück zu Discover"
      }));
      /* Was die Reihe prueft, steht dabei - in einem Satz. Eine Themen-
         reihe sagt zusaetzlich, dass ihre Zugehoerigkeit redaktionell ist. */
      if (row.rule || row.editorial) {
        body.appendChild(C().note(row.editorial ? "Redaktionelle Zuordnung" : "Regel dieser Sammlung",
          row.editorial
            ? "Welche Unternehmen zu diesem Thema gehören, ist eine Einordnung der Redaktion — keine " +
              "Kennzahl. Die Reihenfolge und alle Zahlen auf den Karten sind gerechnet."
            : row.rule));
      }

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
        host.appendChild(C().grid(cards, { rowId: row.rowId, universeId: universeId,
                                           world: row.world }));
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

  /* ------------------------------------------- Einzeln entdecken (Feed) */
  /**
   * Ein eigener Modus, kein Ersatz.
   *
   * Die Auswahl entsteht aus Reihen, die ohnehin ausgeliefert werden -
   * es gibt keinen zweiten Datensatz fuer diesen Modus und keine zweite
   * Rangliste. Jede Karte traegt, aus welcher Sammlung sie kommt; damit
   * bleibt auch hier nachvollziehbar, warum ein Titel auftaucht.
   */
  function renderFeed(root, universeId) {
    universeId = universeId || state.universeId;
    state.universeId = universeId;
    S.clear(root);
    var app = el("div", { class: "dx-app dx-app--feed" });
    root.appendChild(app);
    document.body.classList.add("dx-feed-aktiv");

    /* Zwanzig Titel aus sechs Sammlungen, abwechselnd - und dann Schluss.
       Bekannte Namen sind dabei, Ueberraschungen auch. */
    var quellen = [
      { rowId: "market-leaders", herkunft: "Die stärksten Aktien", anzahl: 5 },
      { rowId: "bekannte-namen", herkunft: "Bekannte Namen in Bewegung", anzahl: 4 },
      { rowId: "new-52-week-highs", herkunft: "Neue Jahreshochs", anzahl: 4 },
      { rowId: "momentum-leaders", herkunft: "Seit Monaten im Aufwind", anzahl: 3 },
      { rowId: "comeback", herkunft: "Comeback?", anzahl: 2 },
      { rowId: "ueberraschungen", herkunft: "Überraschungen", anzahl: 2 }
    ];
    var ZIEL = 20;

    Promise.all(quellen.map(function (q) {
      return S.loadJSON(BASE + "rows/" + universeId + "/" + q.rowId + ".json")
        .then(function (row) { return { q: q, row: row }; })
        .catch(function () { return null; });
    })).then(function (teile) {
      /* Abwechselnd aus den Sammlungen nehmen: sonst stehen die ersten
         vier Bildschirme alle in derselben Welt. Ein Titel erscheint
         hoechstens einmal. */
      /* Jede Sammlung gibt ihre ersten Titel - und ein paar mehr als
         gebraucht, weil derselbe Titel oft in mehreren Sammlungen steht
         und nur einmal gezeigt wird. */
      var eimer = teile.filter(Boolean).map(function (t) {
        return (t.row.cards || []).slice(0, t.q.anzahl + 6).map(function (c) {
          return Object.assign({}, c, { herkunft: t.q.herkunft });
        });
      });
      var quote = teile.filter(Boolean).map(function (t) { return t.q.anzahl; });
      /* Abwechselnd, jede Sammlung bis zu ihrer Quote; was durch
         Doppelte fehlt, fuellen die uebrigen in einer zweiten Runde auf. */
      var karten = [], gesehen = Object.create(null);
      var genommen = eimer.map(function () { return 0; });
      var zeiger = eimer.map(function () { return 0; });
      function ziehe(i) {
        while (zeiger[i] < eimer[i].length) {
          var k = eimer[i][zeiger[i]++];
          if (gesehen[k.symbol]) continue;
          gesehen[k.symbol] = true;
          karten.push(k); genommen[i]++;
          return true;
        }
        return false;
      }
      for (var runde = 0; runde < 6 && karten.length < ZIEL; runde++) {
        for (var i = 0; i < eimer.length && karten.length < ZIEL; i++) {
          if (genommen[i] < quote[i]) ziehe(i);
        }
      }
      for (var j = 0; j < eimer.length && karten.length < ZIEL; j++) {
        while (karten.length < ZIEL && ziehe(j)) { /* auffuellen */ }
      }
      /* Die Ausgaenge am Ende: die Themenwelten, dann zurueck. */
      var weiter = ((state.meta.editorial && state.meta.editorial.themes) || []).slice(0, 3)
        .map(function (t) {
          return { label: "Weiter mit " + t.title.charAt(0) + t.title.slice(1).toLowerCase(),
                   href: "#/c/" + universeId + "/thema-" + t.id };
        });
      S.clear(app);
      if (!karten.length) {
        app.appendChild(C().note("Nichts zu entdecken",
          "Für dieses Universum werden derzeit keine Reihen ausgeliefert."));
        return;
      }
      D.Feed.render(app, karten, { universeId: universeId, zurueck: "#/u/" + universeId, weiter: weiter });
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

    /* Erst das Verzeichnis der ausgelieferten Seiten, dann die Seite.

       Die Reihenfolge ist der Unterschied zwischen einer sauberen Konsole
       und einem absichtlichen 404 je Aufruf: im erweiterten Universum hat
       die grosse Mehrheit der Titel KEINE ausgelieferte Detailseite, und
       sie blind anzufragen hiesse, den Normalfall als Fehler zu
       behandeln. */
    S.loadJSON(BASE + "stock-index/" + universeId + ".json")
      .catch(function () { return null; })
      .then(function (index) {
        var ausgeliefert = !index || !index.symbols ||
                           index.symbols.indexOf(symbol) >= 0;
        if (!ausgeliefert) { ausMaster(host, universeId, symbol); return; }
        ladeDetail(host, universeId, symbol);
      });
  }

  function ladeDetail(host, universeId, symbol) {
    S.loadJSON(BASE + "stocks/" + universeId + "/" + symbol + ".json").then(function (detail) {
      D.Detail.render(host, detail, { universeId: universeId, meta: state.meta });
      C().revealOnScroll(host);
      document.title = (detail.companyName || symbol) + " — Vision Universe® Discover";
      if (state.memory) state.memory.recordView(symbol, { universeId: universeId,
        companyName: detail.companyName || null, world: detail.world || null });
      if (D.Analytics) D.Analytics.track("stock_open", { universeId: universeId, symbol: symbol, from: "detail" });
    }).catch(function () {
      /* Keine ausgelieferte Detailseite. Das ist ab jetzt der REGELFALL
         und kein Fehler: der Company Master fuehrt tausende Titel, fuer
         die keine Discovery-Reihe gerechnet wird. Statt eines
         Leerzustands wird die Seite aus dem Master gebaut - Identitaet,
         Handelsplatz, Gattung, und was der Datenweg fuer diesen Titel
         kann (§17, §48).

         Erst wenn auch der Master den Titel nicht kennt, ist es wirklich
         nichts - und dann sagt die Seite genau das. */
      ausMaster(host, universeId, symbol);
    });
  }

  function ausMaster(host, universeId, symbol) {
    var dir = (global.VUInstrumentDirectory && global.VUCompanyMaster)
      ? global.VUInstrumentDirectory.create({}) : null;
    if (!dir) { nichtGefunden(host, universeId, symbol, null); return; }

    dir.getInstrument(symbol).then(function (res) {
      if (res.status !== "OK") { nichtGefunden(host, universeId, symbol, res); return; }
      return dir.manifest().catch(function () { return null; }).then(function (manifest) {
        return dir.search(symbol, { limit: 1 }).catch(function () { return null; })
          .then(function (treffer) {
            var eintrag = treffer && treffer.entries && treffer.entries.length
              ? treffer.entries[0] : null;
            D.Detail.renderInstrument(host, {
              instrument: res.instrument,
              alternateListings: res.alternateListings,
              capabilities: dir.capabilities(eintrag),
              masterVersion: manifest ? manifest.version : null,
              asOf: manifest ? manifest.asOf : null
            }, { universeId: universeId });
            C().revealOnScroll(host);
            document.title = (res.instrument.companyName || symbol) +
                             " — Vision Universe® Discover";
          });
      });
    }).catch(function (err) {
      nichtGefunden(host, universeId, symbol, { status: "ERROR", reason: err && err.message });
    });
  }

  function nichtGefunden(host, universeId, symbol, res) {
    S.clear(host);
    host.appendChild(el("a", { class: "dx-back", href: "#/", text: "← Discover" }));
    host.appendChild(el("div", { style: "padding:20px 0" }, [
      C().emptyState("Kein Titel mit dem Kürzel " + symbol,
        res && res.status === "NOT_IN_UNIVERSE"
          ? "Der Company Master führt kein Instrument mit diesem Kürzel. Das Universum umfasst " +
            "die US-Primärbörsen; außerbörsliche Titel und Fonds sind nicht enthalten."
          : "Für diesen Titel wird in »" + universeMeta(universeId).label + "« keine Detailseite " +
            "ausgeliefert, und das Instrumentenverzeichnis ist nicht erreichbar" +
            (res && res.reason ? " (" + res.reason + ")" : "") + ".")
    ]));
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
      /* Der Feed-Modus faerbt den Koerper, damit die Seite selbst nicht
         zweimal scrollt. Beim Verlassen wird das zurueckgenommen - sonst
         bliebe die Uebersicht in einem Zustand haengen, den niemand
         angefordert hat. */
      if (teile[0] !== "einzeln") document.body.classList.remove("dx-feed-aktiv");
      if (teile[0] === "einzeln") {
        renderFeed(root, teile[1] || state.universeId);
      } else if (teile[0] === "s" && teile.length >= 3) {
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
