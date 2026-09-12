/* =========================================================================
   VISION UNIVERSE — vu2-bridge/experience.js

   DIE OBERFLAECHENSEITE DER BRUECKE.

   bridge.js gibt der VU2-Anwendung das ganze Universum als Daten. Diese
   Datei ergaenzt drei Dinge, die sich nicht ueber die Datenschicht
   erreichen lassen, weil sie in fertigem Aufbau stehen:

     1  Ein Kopfband mit dem tatsaechlichen Umfang. Die Listenansichten
        zeigen bewusst eine handhabbare Auswahl; ohne diese Zeile liest
        sich das wie "mehr gibt es nicht".
     2  Eine Suche ueber ALLE ausgelieferten Titel. Die eingebaute Suche
        durchsucht die Liste der Ansicht - das sind nicht alle.
     3  Den Chartbereich, den der Eigentuemer bisher nie gesehen hat:
        Intraday und Echtzeit, beide ueber die Serverseite, beide ohne
        Zugangsschluessel im Browser.

   Sie laedt NACH vu2/experience.js und aendert dort keine Zeile. Was sie
   tut, ist Hinzufuegen: ein Band, ein Dialog, ein Abschnitt.

   NICHTS HIER ERFINDET EINEN KURS. Kommt kein Ereignis, steht das da -
   mit dem Grund und mit dem Zustand der Boerse.
   ========================================================================= */
(function (g) {
  "use strict";

  var S = g.QuantShell;
  var api = g.VUBridgeServices;
  if (!S || !api || !api.bridge) return;

  var el = S.el;
  var params = new URLSearchParams(location.search);
  var view = params.get("view") || "home";
  var ticker = String(params.get("ticker") || "").toUpperCase();

  /* Mit Schraegstrich: vercel.json setzt trailingSlash, ohne ihn kostet
     jeder Aufruf eine Weiterleitung - beim Ereignisstrom waere das eine
     zusaetzliche Runde vor dem ersten Kurs. */
  var STREAM = "/api/realtime/";
  var INTRADAY = "/api/intraday/";

  /* Die VU2-Ansichten bauen ihren Inhalt ASYNCHRON auf: erst wenn der
     Dienst geantwortet hat, steht die Seite. Wer direkt nach
     DOMContentLoaded nach ".focus" greift, greift ins Leere - genau das
     ist beim ersten Versuch passiert, und die Ergaenzung blieb
     wirkungslos, ohne einen Fehler zu werfen. Deshalb wird auf das
     Element gewartet, nicht auf ein Ereignis geraten. */
  function warteAuf(auswahl, grenzeMs) {
    return new Promise(function (fertig) {
      var da = document.querySelector(auswahl);
      if (da) return fertig(da);
      var ziel = document.getElementById("content") || document.body;
      var uhr = setTimeout(function () { beobachter.disconnect(); fertig(null); }, grenzeMs || 20000);
      var beobachter = new MutationObserver(function () {
        var treffer = document.querySelector(auswahl);
        if (!treffer) return;
        clearTimeout(uhr); beobachter.disconnect(); fertig(treffer);
      });
      beobachter.observe(ziel, { childList: true, subtree: true });
    });
  }

  function bereit(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function num(v, stellen) {
    return Number.isFinite(v)
      ? v.toLocaleString("de-DE", { minimumFractionDigits: stellen === undefined ? 2 : stellen,
                                    maximumFractionDigits: stellen === undefined ? 2 : stellen })
      : "–";
  }
  function zeit(iso) {
    if (!iso) return "–";
    var d = new Date(iso);
    return isNaN(d) ? "–" : d.toLocaleTimeString("de-DE", { hour12: false });
  }

  bereit(function () {
    kopfband();
    sucheErsetzen();
    if (view === "stock" && ticker) { chartBereich(); einzeltitelSchaerfen(); }
  });

  /* ------------------------------------------------------------ Kopfband */
  function kopfband() {
    var app = document.getElementById("app");
    var header = app && app.querySelector("header.top");
    if (!header) return;

    var band = el("div", { class: "vu-scope" }, [
      el("span", { class: "vu-scope-text", text: "Universum wird geladen …" })
    ]);
    header.insertAdjacentElement("afterend", band);

    api.getUniverse().then(function (u) {
      var f = u.fullUniverse;
      if (!f) return;
      S.mount(band, [
        el("span", { class: "vu-scope-text" }, [
          el("b", { text: f.securities.toLocaleString("de-DE") + " Titel" }),
          el("span", { text: " im ausgelieferten Universum · " +
            f.withFactors.toLocaleString("de-DE") + " mit gemessenen Faktoren · Datenstand " +
            (f.asOf || "–") }),
          el("span", { class: "vu-scope-note", text:
            "Listen zeigen die " + f.listed + " meistgehandelten Titel. Suche und Screener sehen alle." })
        ]),
        el("button", { class: "vu-scope-button", type: "button", text: "Titel suchen",
                       onclick: function () { sucheOeffnen(); } })
      ]);
    }).catch(function () {
      S.mount(band, el("span", { class: "vu-scope-text", text:
        "Der Universumsdatensatz ist in dieser Auslieferung nicht vorhanden." }));
    });
  }

  /* -------------------------------------------------------------- Suche */
  var dialog = null, eingabe = null, treffer = null, tickerListe = null;

  function sucheErsetzen() {
    var knopf = Array.prototype.slice.call(document.querySelectorAll("header.top .utility button"))
      .filter(function (b) { return /Suche/i.test(b.textContent || ""); })[0];
    if (knopf) {
      var neu = knopf.cloneNode(true);       /* entfernt den alten Handler */
      knopf.parentNode.replaceChild(neu, knopf);
      neu.addEventListener("click", sucheOeffnen);
    }
    /* Die eingebaute Tastenkombination zeigt dieselbe eingeschraenkte
       Liste. In der Erfassungsphase abfangen, bevor sie greift. */
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault(); e.stopImmediatePropagation(); sucheOeffnen();
      }
    }, true);
  }

  function sucheOeffnen() {
    if (!dialog) baueSuche();
    dialog.showModal();
    eingabe.focus();
    eingabe.select();
    if (!tickerListe) {
      api.bridge.index().then(function (idx) {
        tickerListe = idx.tickers;
        aktualisiere();
      }).catch(function () {
        S.mount(treffer, el("p", { text: "Der Universumsindex ist nicht verfuegbar." }));
      });
    }
  }

  function baueSuche() {
    dialog = el("dialog", { class: "vu-search", "aria-label": "Im gesamten Universum suchen" });
    eingabe = el("input", { class: "search", placeholder: "Ticker — z. B. ORCL, TSLA, KO",
                            "aria-label": "Ticker suchen", autocomplete: "off" });
    treffer = el("div", { class: "search-results links" });
    var zaehler = el("p", { class: "muted vu-search-count", text: "" });
    eingabe.addEventListener("input", aktualisiere);
    eingabe.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var erster = treffer.querySelector("a");
        if (erster) location.assign(erster.getAttribute("href"));
      }
    });
    dialog.append(
      el("h2", { text: "Im gesamten Universum suchen" }),
      eingabe, zaehler, treffer,
      el("button", { class: "button secondary", text: "Schliessen",
                     onclick: function () { dialog.close(); } })
    );
    document.getElementById("app").append(dialog);
    dialog._zaehler = zaehler;
  }

  function aktualisiere() {
    if (!tickerListe) return;
    var q = eingabe.value.trim().toUpperCase();
    var gefunden = [];
    for (var i = 0; i < tickerListe.length && gefunden.length < 400; i++) {
      var t = tickerListe[i];
      if (!q || t.indexOf(q) !== -1) gefunden.push(t);
    }
    gefunden.sort(function (a, b) {
      if (q) {
        var ra = a === q ? 0 : a.indexOf(q) === 0 ? 1 : 2;
        var rb = b === q ? 0 : b.indexOf(q) === 0 ? 1 : 2;
        if (ra !== rb) return ra - rb;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    var zeige = gefunden.slice(0, 12);
    S.mount(treffer, zeige.map(function (t) {
      return el("a", { text: t, href: "/vu2/?view=stock&ticker=" + encodeURIComponent(t) });
    }));
    dialog._zaehler.textContent = q
      ? gefunden.length + (gefunden.length === 400 ? "+" : "") + " Treffer von " +
        tickerListe.length.toLocaleString("de-DE") + " Titeln" +
        (zeige.length < gefunden.length ? " · " + zeige.length + " angezeigt" : "")
      : tickerListe.length.toLocaleString("de-DE") + " Titel im Universum — tippe einen Ticker.";
    if (!zeige.length) S.mount(treffer, el("p", { text: "Kein Titel mit diesem Ticker im Universum." }));
  }


  /* ------------------------------------------- Einzeltitel ohne Kursreihe

     Zwei Stellen der fertigen Ansicht sagen fuer Titel ohne ausgelieferte
     EOD-Reihe etwas Falsches, und beide sind Kursstellen:

       1  Die grosse Zahl oben ist der letzte Schlusskurs. Kursniveaus
          sind fuer dieses Universum zurueckgehalten - dort steht dann
          "Nicht verfuegbar" in Schriftgroesse 34. Das ist wahr und
          trotzdem die schlechteste Art, es zu sagen: die Seite HAT eine
          gemessene Aussage, sie steht nur woanders.
       2  Der leere Chart meldet "Tagesverlaeufe benoetigen freigegebene
          Intraday-Daten". Der Grund ist aber ein anderer: fuer diesen
          Titel ist ueberhaupt keine EOD-Reihe ausgeliefert.

     Beides wird ersetzt - nicht ueberdeckt. Was danach dasteht, ist eine
     gemessene Groesse mit ihrem Namen und der richtige Grund. */
  function einzeltitelSchaerfen() {
    api.getStockIntelligence(ticker).then(function (s) {
      if (!s || s.state !== "AVAILABLE" || !s.vuFullUniverse) return;
      if (s.chart && s.chart.state === "AVAILABLE" && (s.chart.bars || []).length) return;
      return warteAuf("#content .focus", 20000).then(function (focus) {
        if (focus) schaerfe(focus, s);
      });
    }).catch(function () { /* die Ansicht bleibt, wie sie ist */ });
  }

  function schaerfe(focus, s) {
    var quote = focus.querySelector(".quote");
    if (quote) {
      var kopf = Number.isFinite(s.above200.value)
        ? { wert: (s.above200.value > 0 ? "+" : "") + num(s.above200.value, 1) + " %",
            label: "Abstand zum 200-Tage-Durchschnitt · Stand " + (s.asOf || "–") }
        : { wert: "Keine Faktorzeile",
            label: "Die Kursreihe dieses Titels hat den Qualitaetstest des Laufs nicht bestanden." };
      quote.textContent = kopf.wert;
      var unterzeile = quote.nextElementSibling;
      if (unterzeile && unterzeile.classList.contains("muted")) {
        unterzeile.textContent = kopf.label + " · Kursniveaus sind fuer dieses Universum " +
          "zurueckgehalten; ausgeliefert sind Abstaende, Zustaende und Renditen.";
      }
    }
    var hinweis = focus.querySelector(".notice");
    if (hinweis) {
      S.mount(hinweis, [
        el("h3", { text: "Fuer " + ticker + " ist keine Tagesschluss-Reihe ausgeliefert" }),
        el("p", { class: "muted", text:
          (s.chart && s.chart.reason) ||
          "Die Faktoren stammen aus einer echten Kursreihe; der Bestand selbst liegt in keiner Auslieferung." }),
        el("p", { class: "muted", text:
          "Der Tagesverlauf (1T/5T) kommt unabhaengig davon ueber die Serverseite - siehe Zeitraumleiste." })
      ]);
    }
  }

  /* ====================================================================
     1T UND 5T IM BESTEHENDEN CHART

     Die Zeitraumleiste der Aktienseite fuehrt 1T und 5T seit jeher
     (quant/engines/chart-ranges.js, source: "intraday"). Was fehlte,
     waren die Bars - und deshalb meldete die Seite dort "nicht
     verfuegbar".

     Diese Bruecke liefert sie nach: sie faengt den Klick auf einen
     Intraday-Zeitraum ab, holt die Bars von der Serverfunktion und
     zeichnet sie in DENSELBEN Chartbereich, mit derselben Chartfunktion
     wie die Seite selbst. Kein zweiter Chart, keine zweite Seite.

     Der Klick wird in der Erfassungsphase abgefangen; sonst liefe zuerst
     der eingebaute Zeichner und meldete wieder "nicht verfuegbar".
     ==================================================================== */

  var live = {
    quelle: null,        /* die eine offene Verbindung - nie zwei */
    bars: [],            /* die gezeichneten Intraday-Bars */
    rangeId: null,       /* welcher Intraday-Zeitraum gerade laeuft */
    host: null,          /* der Chartbereich der Seite */
    status: null,        /* die Statuszeile darunter */
    preis: null,
    updates: 0,
    letzterFingerabdruck: null,
    marktStatus: null
  };

  var INTRADAY_RANGES = ["1D", "5D"];

  function chartBereich() {
    warteAuf("#content .focus .ranges", 25000).then(function (leiste) {
      if (!leiste) return;
      var host = leiste.previousElementSibling;
      if (!host) return;
      live.host = host;

      /* Die Statuszeile gehoert unter den Chart - eine Zeile, kein
         zweites Fenster. */
      live.status = el("p", { class: "muted vu-live-status", text: "" });
      leiste.insertAdjacentElement("afterend", live.status);

      leiste.addEventListener("click", function (e) {
        var knopf = e.target && e.target.closest ? e.target.closest("button[data-range]") : null;
        if (!knopf) return;
        var id = knopf.dataset.range;
        if (INTRADAY_RANGES.indexOf(id) === -1) {
          /* Zurueck zu einem Tagesschluss-Zeitraum: der eingebaute
             Zeichner uebernimmt wieder, und der Strom endet. */
          stromBeenden("rangeChanged");
          live.rangeId = null;
          S.clear(live.status);
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        markiere(leiste, id);
        live.rangeId = id;
        intradayZeichnen(id);
      }, true);

      /* Ohne Klick passiert nichts: der Nutzer waehlt den Tagesverlauf.
         Ein automatisch geoeffneter Strom auf jeder Aktienseite waere
         genau die unnoetige Anbieterverbindung, die hier vermieden
         werden soll. */
      S.mount(live.status, hinweisZeile());
    });

    /* Verlaesst der Nutzer die Seite, endet das Abonnement - sofort. */
    window.addEventListener("pagehide", function () { stromBeenden("pagehide"); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") stromBeenden("hidden");
    });
  }

  function hinweisZeile() {
    return [el("span", { text: "1T und 5T zeigen den Tagesverlauf. Er wird beim Auswaehlen " +
      "serverseitig geholt; Kursaktualisierungen laufen nur, solange dieser Zeitraum offen ist." })];
  }

  function markiere(leiste, id) {
    Array.prototype.forEach.call(leiste.querySelectorAll("button[data-range]"), function (b) {
      var an = b.dataset.range === id;
      b.classList.toggle("selected", an);
      b.setAttribute("aria-pressed", an ? "true" : "false");
    });
  }

  function intradayZeichnen(rangeId) {
    stromBeenden("neueAuswahl");
    live.bars = [];
    live.updates = 0;
    S.mount(live.host, el("div", { class: "notice" }, [
      el("h3", { text: "Tagesverlauf wird geholt …" }),
      el("p", { class: "muted", text: "Serverseitiger Abruf fuer " + ticker + "." })
    ]));
    S.mount(live.status, el("span", { text: "Abruf laeuft …" }));

    var tage = rangeId === "5D" ? 5 : 2;
    fetch(INTRADAY + "?ticker=" + encodeURIComponent(ticker) + "&freq=5min&days=" + tage,
          { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        live.marktStatus = d.marketStatus || null;
        if (d.state !== "INTRADAY_AVAILABLE" || !(d.bars || []).length) {
          S.mount(live.host, zustandsKarte(d, rangeId));
          S.mount(live.status, el("span", { text: zustandsText(d) }));
          /* Kein Tagesverlauf heisst nicht "kein Strom": ein Titel kann
             heute noch keine Bars haben und trotzdem handeln. */
          if (d.state === "INTRADAY_UNAVAILABLE") stromStarten();
          return;
        }
        live.bars = d.bars.slice();
        zeichne(rangeId, d);
        stromStarten();
      })
      .catch(function () {
        S.mount(live.host, el("div", { class: "notice" }, [
          el("h3", { text: "Tagesverlauf derzeit nicht erreichbar" }),
          el("p", { class: "muted", text: "Die Serverfunktion hat nicht geantwortet." })
        ]));
      });
  }

  /* Gezeichnet wird mit derselben Chartfunktion, die die Seite fuer alle
     anderen Zeitraeume benutzt - und ueber dieselbe Zeitraumauswahl
     (VUChartRanges), damit 1T und 5T genau das Fenster schneiden, das sie
     versprechen. */
  function zeichne(rangeId, daten) {
    var auswahl = g.VUChartRanges.selectRange(rangeId,
      { intraday: live.bars, intradayAdjustmentStatus: "RAW" },
      { gates: { ENABLE_LIVE_MARKET_DATA: true } });
    var bars = auswahl.ok ? auswahl.bars : live.bars;
    var breite = Math.min(900, Math.max(280, (live.host.clientWidth || window.innerWidth) - 40));
    S.mount(live.host, g.QuantCharts.lineChart({
      title: ticker + " · Tagesverlauf (" + (rangeId === "5D" ? "5 Tage" : "1 Tag") + ")",
      width: breite, height: 290,
      dates: bars.map(function (b) { return b.date; }),
      series: [{ values: bars.map(function (b) { return b.close; }) }],
      yFormat: function (v) { return v.toFixed(2) + " $"; }
    }));
    var stand = bars.length ? bars[bars.length - 1] : null;
    live.preis = stand ? stand.close : null;
    S.mount(live.status, statusZeile({
      bars: bars.length,
      von: bars.length ? bars[0].date : null,
      bis: stand ? stand.date : null,
      marktStatus: (daten && daten.marketStatus) || live.marktStatus
    }));
  }

  function statusZeile(x) {
    var teile = [x.bars + " Bars · " + kurzzeit(x.von) + " bis " + kurzzeit(x.bis)];
    if (x.marktStatus) teile.push(marktText(x.marktStatus));
    if (live.updates) {
      teile.push(live.updates + " Kursaktualisierungen" +
        (Number.isFinite(live.preis) ? " · zuletzt " + num(live.preis) + " $" : ""));
    }
    return el("span", { text: teile.join(" · ") });
  }

  function marktText(status) {
    return status === "OPEN" ? "Boerse geoeffnet"
      : status === "EXTENDED_HOURS" ? "erweiterte Handelszeit"
      : "Boerse geschlossen";
  }

  function kurzzeit(iso) {
    if (!iso) return "–";
    var d = new Date(iso);
    return isNaN(d) ? String(iso).slice(0, 16).replace("T", " ")
      : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  /* Jeder Zustand der Serverfunktion bekommt eine Karte mit Klartext -
     und die Zustaende bleiben auseinandergehalten. */
  var ZUSTAND_TEXT = {
    INTRADAY_UNAVAILABLE: "Der Anbieter fuehrt fuer diesen Titel in diesem Fenster keine Bars.",
    PROVIDER_UNAVAILABLE: "Der Anbieter hat nicht geantwortet oder den Abruf abgelehnt.",
    NOT_ELIGIBLE: "Dieses Papier ist im Eignungslauf ausgeschlossen und wird nicht wie eine Aktie behandelt.",
    SYMBOL_NOT_SUPPORTED: "Dieses Symbol gehoert nicht zum Produktuniversum dieser Vorschau.",
    NOT_CONFIGURED: "Der Zugangsschluessel ist in dieser Umgebung nicht hinterlegt.",
    SCOPE_UNREADABLE: "Das Symbolverzeichnis ist in dieser Auslieferung nicht lesbar.",
    INVALID_FREQUENCY: "Ungueltiges Intervall.",
    INVALID_IDENTITY: "Kein gueltiger Ticker."
  };

  function zustandsText(d) {
    var basis = ZUSTAND_TEXT[d.state] || d.reason || "Kein Ergebnis.";
    if (d.marketStatus) basis += " · " + marktText(d.marketStatus);
    return basis;
  }

  function zustandsKarte(d, rangeId) {
    return el("div", { class: "notice" }, [
      el("h3", { text: "Tagesverlauf (" + (rangeId === "5D" ? "5 Tage" : "1 Tag") + ") derzeit nicht verfuegbar" }),
      el("p", { class: "muted", text: zustandsText(d) }),
      d.instrumentClass ? el("p", { class: "muted", text: "Instrumentenklasse: " + d.instrumentClass }) : null,
      d.remedy ? el("p", { class: "muted", text: "Naechster Schritt: " + d.remedy }) : null
    ]);
  }

  /* ------------------------------------------------------------ Strom */

  function stromBeenden(grund) {
    if (!live.quelle) return;
    try { live.quelle.close(); } catch (e) { /* egal */ }
    live.quelle = null;
    live.letzterFingerabdruck = null;
  }

  function stromStarten() {
    stromBeenden("neustart");          /* nie zwei Verbindungen fuer denselben Titel */
    var quelle;
    try { quelle = new EventSource(STREAM + "?tickers=" + encodeURIComponent(ticker)); }
    catch (e) { return; }
    live.quelle = quelle;

    quelle.addEventListener("status", function (e) {
      var d = JSON.parse(e.data);
      live.marktStatus = d.marketStatus || live.marktStatus;
      if (d.state === "CONNECTED") { ergaenzeStatus("Kursaktualisierungen aktiv"); return; }
      if (d.state === "PROVIDER_ERROR") {
        ergaenzeStatus("Anbieter: " + d.reason);
        stromBeenden("providerError");
        return;
      }
      ergaenzeStatus(ZUSTAND_TEXT[d.state] || d.reason || d.state);
      stromBeenden(d.state);
    });

    quelle.addEventListener("tick", function (e) {
      var t = JSON.parse(e.data);
      if (t.ticker !== ticker) return;
      var finger = t.at + "|" + t.price + "|" + (t.size === undefined ? "" : t.size);
      if (finger === live.letzterFingerabdruck) return;   /* nichts doppelt zeichnen */
      live.letzterFingerabdruck = finger;
      live.updates++;
      live.preis = t.price;
      letztenPunktSetzen(t);
    });

    quelle.addEventListener("summary", function (e) {
      var d = JSON.parse(e.data);
      live.marktStatus = d.marketStatus || live.marktStatus;
      stromBeenden("summary");
      if (d.verdict === "MARKET_CLOSED_NO_TICKS_EXPECTED") {
        ergaenzeStatus("keine Kursereignisse zu erwarten · " + marktText(d.marketStatus));
        return;                                   /* nicht endlos neu verbinden */
      }
      /* Das Messfenster der Serverfunktion ist kurz; solange der Nutzer
         den Tagesverlauf offen hat, wird neu verbunden. */
      if (live.rangeId) setTimeout(function () { if (live.rangeId) stromStarten(); }, 750);
    });

    quelle.addEventListener("error", function () {
      ergaenzeStatus("Verbindung unterbrochen");
      stromBeenden("error");
    });
  }

  function ergaenzeStatus(text) {
    if (!live.status) return;
    var grund = live.status.querySelector("span");
    var basis = grund ? grund.textContent.split(" · ").filter(function (t) {
      return !/Kursaktualisierung|Anbieter:|Verbindung|zu erwarten/.test(t);
    }).join(" · ") : "";
    S.mount(live.status, el("span", { text: (basis ? basis + " · " : "") + text }));
  }

  /* Der letzte Punkt wird auf den gemeldeten Kurs gesetzt - nicht
     interpoliert, nicht fortgeschrieben. Faellt eine neue
     Fuenf-Minuten-Marke an, kommt ein Punkt dazu. */
  function letztenPunktSetzen(tick) {
    if (!live.bars.length || !live.rangeId) {
      if (live.status) ergaenzeStatus(live.updates + " Kursaktualisierungen · zuletzt " +
        num(tick.price) + " $");
      return;
    }
    var letzte = live.bars[live.bars.length - 1];
    var marke = fuenfMinutenMarke(tick.at);
    if (marke && letzte.date && marke > letzte.date) {
      live.bars.push({ date: marke, open: tick.price, high: tick.price,
                       low: tick.price, close: tick.price, volume: null });
    } else {
      letzte.close = tick.price;
      if (letzte.high === null || tick.price > letzte.high) letzte.high = tick.price;
      if (letzte.low === null || tick.price < letzte.low) letzte.low = tick.price;
    }
    zeichne(live.rangeId, { marketStatus: live.marktStatus });
    ergaenzeStatus(live.updates + " Kursaktualisierungen · zuletzt " + num(tick.price) + " $");
  }

  function fuenfMinutenMarke(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5);
    return d.toISOString();
  }
})(typeof window !== "undefined" ? window : globalThis);
