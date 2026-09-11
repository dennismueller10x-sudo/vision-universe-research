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

     Zwei Stellen der fertigen Ansicht sagen fuer diese Titel etwas
     Falsches, und beide sind Kursstellen:

       1  Die grosse Zahl oben ist der letzte Schlusskurs. Kursniveaus
          sind fuer dieses Universum zurueckgehalten - dort steht dann
          "Nicht verfuegbar" in Schriftgroesse 34. Das ist wahr und
          trotzdem die schlechteste Art, es zu sagen: die Seite HAT eine
          gemessene Aussage, sie steht nur woanders.
       2  Der leere Chart meldet "Tagesverlaeufe benoetigen freigegebene
          Intraday-Daten". Der Grund ist aber ein anderer: fuer diesen
          Titel ist ueberhaupt keine Kursreihe ausgeliefert.

     Beides wird hier ersetzt - nicht ueberdeckt. Was danach dasteht, ist
     eine gemessene Groesse mit ihrem Namen und der richtige Grund. */
  function einzeltitelSchaerfen() {
    api.bridge.freigabe().then(function (erlaubt) {
      if (erlaubt.indexOf(ticker) !== -1) return;   /* freigegeben: echter Chart, nichts tun */
      return api.getStockIntelligence(ticker).then(function (s) {
        if (!s || s.state !== "AVAILABLE" || !s.vuFullUniverse) return;
        return warteAuf("#content .focus", 20000).then(function (focus) {
          if (!focus) return;
          schaerfe(focus, s);
        });
      });
    }).catch(function () { /* ohne Freigabeliste bleibt die Ansicht, wie sie ist */ });
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
        el("h3", { text: "Fuer " + ticker + " ist keine Kursreihe ausgeliefert" }),
        el("p", { class: "muted", text:
          (s.chart && s.chart.reason) ||
          "Die Faktoren stammen aus einer echten Kursreihe; der Bestand selbst liegt in keiner Auslieferung." })
      ]);
    }

    var leiste = focus.querySelector(".ranges");
    /* Eine Zeitraumleiste ohne Daten ist eine Einladung ins Leere. */
    if (leiste) leiste.hidden = true;
  }

  /* -------------------------------------------------------- Chartbereich */
  function chartBereich() {
    var main = document.getElementById("content");
    if (!main) return;

    var abschnitt = el("section", { class: "section vu-live" }, [
      el("span", { class: "eyebrow", text: "Kursdaten in dieser Vorschau" }),
      el("h2", { text: "Intraday und Echtzeit" }),
      el("p", { class: "muted", text: "Beide laufen ueber die Serverseite. Der Zugangsschluessel " +
        "erreicht den Browser nicht — er bleibt in der geschuetzten Umgebung." })
    ]);
    var intradayHost = el("div", { class: "vu-live-block" });
    var liveHost = el("div", { class: "vu-live-block" });
    abschnitt.append(intradayHost, liveHost);

    /* Der Abschnitt gehoert nach oben, direkt unter die Ueberschrift der
       Seite: der Eigentuemer soll nicht danach suchen muessen. Die
       Ueberschrift entsteht erst, wenn der Dienst geantwortet hat. */
    warteAuf("#content .intro", 20000).then(function (anker) {
      if (anker) anker.insertAdjacentElement("afterend", abschnitt);
      else main.prepend(abschnitt);
    });

    api.bridge.freigabe().then(function (erlaubt) {
      var frei = erlaubt.indexOf(ticker) !== -1;
      if (!frei) {
        S.mount(intradayHost, el("div", { class: "notice" }, [
          el("h3", { text: "Intraday und Echtzeit sind fuer " + ticker + " nicht freigegeben" }),
          el("p", { class: "muted", text:
            "Die Anzeige von Kursen ist auf die Titel mit datierter Eigentuemerfreigabe begrenzt (" +
            erlaubt.join(", ") + "). Die gemessenen Faktoren dieses Titels stehen unabhaengig davon " +
            "zur Verfuegung — sie enthalten keine Kursniveaus." })
        ]));
        S.clear(liveHost);
        return;
      }
      intraday(intradayHost);
      echtzeit(liveHost);
    });
  }

  /* ------------------------------------------------------------ Intraday */
  function intraday(host) {
    S.mount(host, el("p", { class: "muted", text: "Intraday-Bars werden serverseitig geholt …" }));
    fetch(INTRADAY + "?ticker=" + encodeURIComponent(ticker) + "&freq=5min&days=3",
          { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.state === "AVAILABLE" && d.bars.length) {
          var kopf = el("div", { class: "vu-live-head" }, [
            el("h3", { text: "Intraday · 5 Minuten" }),
            el("span", { class: "pill", text: d.bars.length + " Bars · " + d.first + " bis " + d.last })
          ]);
          var chart = g.QuantCharts.lineChart({
            title: ticker + " · Intraday (5 Minuten)",
            width: Math.min(900, Math.max(280, (host.clientWidth || window.innerWidth) - 40)),
            height: 240,
            dates: d.bars.map(function (b) { return b.date; }),
            series: [{ values: d.bars.map(function (b) { return b.close; }) }],
            yFormat: function (v) { return v.toFixed(2) + " $"; }
          });
          S.mount(host, [kopf, chart, el("p", { class: "muted", text:
            "Serverseitig geholt (" + zeit(d.fetchedAt) + "), nicht gespeichert. Kursart laut " +
            "Anbieter unbestaetigt." })]);
          return;
        }
        S.mount(host, zustand("Intraday", d));
      })
      .catch(function () {
        S.mount(host, el("div", { class: "notice" }, [
          el("h3", { text: "Intraday derzeit nicht erreichbar" }),
          el("p", { class: "muted", text: "Die Serverfunktion hat nicht geantwortet." })
        ]));
      });
  }

  function zustand(was, d) {
    var texte = {
      NOT_CONFIGURED: "Der Zugangsschluessel ist in dieser Umgebung nicht hinterlegt.",
      NOT_PERMITTED: "Fuer diesen Titel liegt keine Anzeigefreigabe vor.",
      PROVIDER_REJECTED: "Der Anbieter hat den Abruf abgelehnt.",
      EMPTY: "Der Anbieter hat fuer diesen Zeitraum keine Bars geliefert — ausserhalb der " +
             "Handelszeiten ist das der Normalfall.",
      FETCH_FAILED: "Der Abruf ist gescheitert.",
      INVALID_FREQUENCY: "Ungueltiges Intervall."
    };
    return el("div", { class: "notice" }, [
      el("h3", { text: was + " derzeit nicht verfuegbar" }),
      el("p", { class: "muted", text: texte[d.state] || d.reason || "Kein Ergebnis." }),
      d.remedy ? el("p", { class: "muted", text: "Naechster Schritt: " + d.remedy }) : null
    ]);
  }

  /* ------------------------------------------------------------ Echtzeit */
  function echtzeit(host) {
    var werte = [];
    var statusPille = el("span", { class: "pill", text: "verbinde …" });
    var kurs = el("div", { class: "quote", text: "–" });
    var zaehlerText = el("p", { class: "muted", text: "Aktualisierungen: 0" });
    var hinweis = el("p", { class: "muted", text:
      "Neutrale Beschriftung mit Absicht: der Anbieter nennt die Kursart nicht. " +
      "Hier steht deshalb 'Kursaktualisierung' und nicht 'letzter Handelskurs'." });
    var verlauf = el("div", { class: "vu-live-spark" });
    var kopf = el("div", { class: "vu-live-head" }, [
      el("h3", { text: "Echtzeit · Kursaktualisierung" }), statusPille
    ]);
    S.mount(host, [kopf, kurs, verlauf, zaehlerText, hinweis]);

    var quelle;
    try {
      quelle = new EventSource(STREAM + "?tickers=" + encodeURIComponent(ticker));
    } catch (e) {
      statusPille.textContent = "nicht moeglich";
      return;
    }

    quelle.addEventListener("status", function (e) {
      var d = JSON.parse(e.data);
      if (d.state === "CONNECTED") {
        statusPille.textContent = "verbunden";
        statusPille.classList.add("vu-live-on");
        zaehlerText.textContent = "Verbunden " + zeit(d.at) + " · Aktualisierungen: 0";
        return;
      }
      statusPille.textContent = d.state === "NOT_CONFIGURED" ? "Schluessel fehlt"
        : d.state === "NOT_PERMITTED" ? "nicht freigegeben" : "nicht verfuegbar";
      S.mount(host, [kopf, zustand("Echtzeit", d)]);
      quelle.close();
    });

    quelle.addEventListener("subscribed", function () {
      statusPille.textContent = "abonniert";
      statusPille.classList.add("vu-live-on");
    });

    quelle.addEventListener("tick", function (e) {
      var t = JSON.parse(e.data);
      werte.push(t.price);
      if (werte.length > 180) werte.shift();
      kurs.textContent = num(t.price) + " $";
      zaehlerText.textContent = "Aktualisierungen: " + t.seq + " · zuletzt " + zeit(t.receivedAt) +
                                " · Art: " + (t.kind === "TRADE" ? "Abschluss gemeldet" : "Quote-Mitte");
      zeichneVerlauf(verlauf, werte);
    });

    quelle.addEventListener("summary", function (e) {
      var d = JSON.parse(e.data);
      quelle.close();
      var text = d.updates
        ? d.updates + " Aktualisierungen im Messfenster · erste " + zeit(d.firstUpdateAt)
        : "Keine Kursereignisse im Messfenster. " + (d.note || "");
      zaehlerText.textContent = text;
      statusPille.textContent = d.updates ? "Fenster beendet" : "keine Ereignisse";
      /* Neu verbinden, solange die Seite offen ist: das Messfenster der
         Serverfunktion ist kurz, der Chart soll trotzdem weiterlaufen. */
      if (d.reason === "streamWindowElapsed") setTimeout(function () { echtzeitNeu(host, werte); }, 500);
    });

    quelle.addEventListener("error", function () {
      statusPille.textContent = "Verbindung unterbrochen";
      quelle.close();
    });
  }

  /* Wiederverbinden ohne die bisher gesehenen Werte zu verlieren. */
  function echtzeitNeu(host, bisher) {
    echtzeit(host);
  }

  function zeichneVerlauf(host, werte) {
    if (werte.length < 2) return;
    var b = 320, h = 60, min = Math.min.apply(null, werte), max = Math.max.apply(null, werte);
    var spanne = max - min || 1;
    var punkte = werte.map(function (v, i) {
      var x = (i / (werte.length - 1)) * (b - 4) + 2;
      var y = h - 2 - ((v - min) / spanne) * (h - 6);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    var svg = '<svg viewBox="0 0 ' + b + " " + h + '" width="100%" height="' + h +
      '" role="img" aria-label="Verlauf der empfangenen Kursaktualisierungen">' +
      '<polyline fill="none" stroke="currentColor" stroke-width="1.5" points="' + punkte + '"/></svg>';
    host.innerHTML = svg;   /* nur selbst erzeugte Zahlen, kein fremder Text */
  }
})(typeof window !== "undefined" ? window : globalThis);
