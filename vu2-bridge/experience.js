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
     3  Den Hauptchart der Einzeltitelseite. Er stand da, konnte aber
        nur die fuenf veroeffentlichten Titel zeichnen; fuer alle
        anderen wurde die Zeitraumleiste ausgeblendet. Jetzt speist ihn
        der dauerhafte Speicher - und die kurzen Zeitraeume speist der
        Anbieter ueber die Serverseite.

        ES IST EIN CHART, KEIN ZWEITER. Frueher kam unter der Seite ein
        eigener Block mit einem eigenen Intraday-Chart. Zwei Charts
        uebereinander sind zwei Antworten auf dieselbe Frage; 1T und 5T
        sind jetzt Zeitraeume DESSELBEN Charts.

   Sie laedt NACH vu2/experience.js und aendert dort keine Zeile. Was sie
   tut, ist Hinzufuegen und Speisen: ein Band, ein Dialog, und der
   bestehende Chart mit einer Quelle.

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
    if (view === "stock" && ticker) { hauptchart(); kopfzahlSchaerfen(); }
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
      /* Zwei Zahlen, nicht eine. Der Produktumfang ist das, was die
         Ansichten zeigen; die Mitgliedschaft ist das, was geholt und
         gespeichert wurde. Nur den Produktumfang zu nennen verschwiege
         die 799 Titel, nur die Mitgliedschaft zu nennen zaehlte sie
         mit. */
      var zahl = function (n) { return Number(n).toLocaleString("de-DE"); };
      var hatProdukt = Number.isFinite(f.productSecurities);
      var kopf = hatProdukt
        ? zahl(f.productSecurities) + " Titel im Produktuniversum"
        : zahl(f.securities) + " Titel";
      var rumpf = hatProdukt
        ? " · " + zahl(f.securities) + " Mitglieder insgesamt, " + zahl(f.excluded) +
          " belegte Nicht-Aktien ausgeschlossen · Datenstand " + (f.asOf || "–")
        : " im ausgelieferten Universum · " + zahl(f.withFactors) +
          " mit gemessenen Faktoren · Datenstand " + (f.asOf || "–");

      var hinweise = ["Listen zeigen die " + f.listed +
        " meistgehandelten Titel. Suche und Screener sehen das Produktuniversum."];
      if (hatProdukt && f.excludedByClass) {
        /* Woraus die 799 bestehen. Eine Zahl ohne ihre Gattungen laedt
           zum Raten ein, und geraten wird hier nirgends. */
        var teile = Object.keys(f.excludedByClass).sort(function (a, b) {
          return f.excludedByClass[b] - f.excludedByClass[a];
        }).map(function (k) { return k + " " + f.excludedByClass[k]; });
        hinweise.push("Ausgeschlossen: " + teile.join(", ") +
          (Number.isFinite(f.review) && f.review
            ? " · " + f.review + " Verdachtsfaelle bleiben enthalten und sind markiert." : ""));
      }
      if (f.coverage) {
        hinweise.push("Ablage " + f.coverage.storage + " % · zeichenbar " +
          f.coverage.chart + " % (ab " + f.coverage.chartMinBars + " Bars) · Technik " +
          f.coverage.technical + " % (ab " + f.coverage.technicalMinBars + " Bars)");
      }

      S.mount(band, [
        el("span", { class: "vu-scope-text" }, [
          el("b", { text: kopf }),
          el("span", { text: rumpf })
        ].concat(hinweise.map(function (t) {
          return el("span", { class: "vu-scope-note", text: t });
        }))),
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
  /* Eignung je Ticker, aus dem Index gelesen. Die Suche FINDET weiter
     alles - ein ausgeschlossener Titel ist nicht geloescht, und wer
     AACBW eintippt, soll ihn bekommen. Sie sagt nur dazu, was er ist. */
  var eignungListe = null;

  var EIGNUNG_LABEL = {
    EXCLUDED: "keine Aktie",
    REVIEW: "Verdachtsfall",
    SEPARATE_CLASS: "Vorzug"
  };

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
        var spalte = idx.columns && idx.columns.productEligibility;
        var namen = idx.enums && idx.enums.productEligibility;
        if (spalte && namen) {
          eignungListe = spalte.map(function (v) {
            return v === null || v === undefined ? null : namen[v];
          });
        }
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
      var marke = eignungListe ? EIGNUNG_LABEL[eignungListe[tickerListe.indexOf(t)]] : null;
      var a = el("a", { href: "/vu2/?view=stock&ticker=" + encodeURIComponent(t) }, [
        el("span", { text: t })
      ]);
      /* Die Markierung steht NEBEN dem Treffer, nicht an seiner Stelle.
         Ein ausgeschlossener Titel bleibt anklickbar - er ist
         gespeichert, nur eben kein Produkttitel. */
      if (marke) a.append(el("span", { class: "vu-search-tag", text: marke }));
      return a;
    }));
    dialog._zaehler.textContent = q
      ? gefunden.length + (gefunden.length === 400 ? "+" : "") + " Treffer von " +
        tickerListe.length.toLocaleString("de-DE") + " Titeln" +
        (zeige.length < gefunden.length ? " · " + zeige.length + " angezeigt" : "")
      : tickerListe.length.toLocaleString("de-DE") + " Titel im Universum — tippe einen Ticker.";
    if (!zeige.length) S.mount(treffer, el("p", { text: "Kein Titel mit diesem Ticker im Universum." }));
  }


  /* ============================================ DER HAUPTCHART

     BISHER GAB ES ZWEI CHARTS UND EINEN VORWAND.

     Oben zeichnete die fertige VU2-Ansicht Schlusskurse - aber nur fuer
     die fuenf veroeffentlichten Titel; fuer alle anderen blendete die
     Bruecke die Zeitraumleiste aus und schrieb "keine Kursreihe
     ausgeliefert". Unten kam ein ZWEITER Chart mit Intraday dazu, als
     eigener Abschnitt.

     Beides faellt weg. Es gibt einen Chart, und er kann alles:

       1T, 5T    Intraday, serverseitig beim Anbieter geholt
       1M .. MAX Tagesschluss aus dem dauerhaften Speicher (R2)

     Die Leiste bleibt die der Ansicht, die Zeichenfunktion bleibt
     QuantCharts.lineChart, der Platz bleibt derselbe. Was sich aendert,
     ist die Quelle - und dass ein nicht verfuegbarer Zeitraum jetzt
     seinen GRUND traegt, statt zu verschwinden.

     WARUM DIE BRUECKE DEN CHART UEBERNIMMT

     Die Ansicht ruft selectRange nur mit Tagesdaten auf; Intraday kennt
     sie nicht, und ihre Datei gehoert Astra/Codex. Die Bruecke setzt
     sich deshalb an dieselbe Stelle - gleicher Behaelter, gleiche
     Leiste, gleiche Zeichenfunktion - und reicht beide Quellen hinein. */

  var CR = g.VUChartRanges;

  /* ------------------------------- Die Verschmelzungs-Engine nachladen

     bar-merge.js faltet einen Tick in die LAUFENDE Kerze: high/low/close
     und Volumen der offenen Periode, und niemals eine bereits
     abgeschlossene Bar. Genau das verlangt der Chart-Vertrag mit
     "aktive Kerze".

     Sie steht nicht in vu2/index.html, und dort darf auch nichts
     dazukommen - die Seite gehoert Astra/Codex und traegt genau die drei
     Bruecken-Zeilen. Also laedt die Bruecke sie selbst nach.

     FAELLT DAS NACHLADEN AUS, BEWEGT SICH DER CHART NICHT. Das ist
     Absicht: eine eigene, schnell hingeschriebene Faltung waere eine
     zweite Fassung derselben Regel - und die erste ist geprueft. Lieber
     ein stehender Chart als zwei Wahrheiten ueber dieselbe Kerze. */
  var MERGE_DATEIEN = [
    "/quant/engines/realtime/staleness.js",
    "/quant/engines/realtime/session-policy.js",
    "/quant/engines/realtime/bar-merge.js"
  ];
  var mergeVersprechen = null;
  function barMerge() {
    if (mergeVersprechen) return mergeVersprechen;
    mergeVersprechen = MERGE_DATEIEN.reduce(function (kette, pfad) {
      return kette.then(function () {
        if (g.VURealtime && g.VURealtime.BarMerge) return null;
        return new Promise(function (fertig, daneben) {
          var s = document.createElement("script");
          s.src = pfad;
          s.onload = fertig;
          s.onerror = function () { daneben(new Error("nicht ladbar: " + pfad)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () {
      return (g.VURealtime && g.VURealtime.BarMerge) || null;
    }).catch(function () { return null; });
    return mergeVersprechen;
  }

  function hauptchart() {
    if (!CR || !g.QuantCharts) return;
    warteAuf("#content .focus", 20000).then(function (focus) {
      if (!focus) return;
      var leiste = focus.querySelector(".ranges");
      if (!leiste) return;
      /* Der Chartbehaelter der Ansicht ist das Geschwister VOR der
         Leiste. Ihn wiederzuverwenden ist der Unterschied zwischen
         "denselben Chart speisen" und "einen zweiten danebenstellen". */
      var behaelter = leiste.previousElementSibling;
      if (!behaelter) return;
      leiste.hidden = false;
      baueChart(focus, behaelter, leiste);
    });
  }

  function baueChart(focus, behaelter, leiste) {
    var daten = { eod: [], intraday: [], adjustmentStatus: null };
    var gates = { ENABLE_LIVE_MARKET_DATA: false };
    var aktuell = CR.DEFAULT_RANGE;
    var liveWerte = [];

    var fussnote = el("p", { class: "muted vu-chart-note", text: "Kursreihe wird geladen …" });
    behaelter.insertAdjacentElement("afterend", fussnote);

    function zeichne(id) {
      aktuell = id;
      var res = CR.selectRange(id, daten, { gates: gates });
      Array.prototype.forEach.call(leiste.querySelectorAll("button"), function (b) {
        var an = b.dataset.range === id;
        b.classList.toggle("selected", an);
        b.setAttribute("aria-pressed", an ? "true" : "false");
      });
      S.clear(behaelter);
      if (!res.ok) {
        behaelter.append(el("div", { class: "notice" }, [
          el("h3", { text: "Dieser Zeitraum ist nicht verfuegbar" }),
          el("p", { class: "muted", text: res.message || "Kein Ergebnis." })
        ]));
        fussnote.textContent = res.message || "";
        return;
      }
      /* Absolute Kurse, keine Differenzen - auch Intraday. Eine
         Prozentachse saehe bei 1T genauso aus und waere etwas
         anderes. */
      behaelter.append(g.QuantCharts.lineChart({
        title: ticker + " · " + (res.source === "intraday" ? "Intraday" : "Schlusskurse"),
        width: Math.min(900, Math.max(280, (behaelter.clientWidth || window.innerWidth) - 40)),
        height: 290,
        dates: res.bars.map(function (b) { return b.date; }),
        series: [{ values: res.bars.map(function (b) { return b.close; }) }],
        yFormat: function (v) { return num(v, 2) + " $"; }
      }));
      fussnote.textContent = res.source === "intraday"
        ? res.bars.length + " Intraday-Bars · " + res.from + " bis " + res.to +
          " · serverseitig geholt, nicht gespeichert · Kursart laut Anbieter unbestaetigt."
        : res.bars.length + " Handelstage · " + res.from + " bis " + res.to +
          " · aus dem dauerhaften Speicher, ohne Anbieteranfrage" +
          (daten.adjustmentStatus ? " · Bereinigung: " + daten.adjustmentStatus : "");
    }

    function leisteNeu() {
      var zustaende = CR.rangeBar(daten, { gates: gates });
      S.clear(leiste);
      zustaende.forEach(function (z) {
        var b = el("button", { text: z.label, dataset: { range: z.id } });
        if (!z.available) {
          /* Ein verschwundener Knopf ist eine unbeantwortete Frage.
             Er bleibt stehen, abgeblendet, mit seinem Grund. */
          b.disabled = true;
          b.classList.add("vu-range-off");
          b.title = z.message || "Nicht verfuegbar";
        } else {
          b.addEventListener("click", function () { zeichne(z.id); });
        }
        leiste.append(b);
      });
    }

    /* Zuerst die Tagesreihe: sie traegt die meisten Zeitraeume. */
    api.bridge.chartFuer(ticker).then(function (c) {
      daten.eod = c.bars || [];
      daten.adjustmentStatus = c.adjustmentStatus || null;
      leisteNeu();
      if (daten.eod.length) {
        /* Der voreingestellte Zeitraum, sonst der erste, der traegt.
           Ein junges Listing hat kein Jahr - es bekommt trotzdem
           seinen vollen Verlauf und nicht die Meldung, es gaebe
           keine Historie. */
        var res = CR.selectRange(CR.DEFAULT_RANGE, daten, { gates: gates });
        zeichne(res.ok ? CR.DEFAULT_RANGE : (res.suggestion || "MAX"));
      } else {
        S.clear(behaelter);
        behaelter.append(el("div", { class: "notice" }, [
          el("h3", { text: "Fuer " + ticker + " liegt keine Kursreihe im Speicher" }),
          el("p", { class: "muted", text: c.reason ||
            "Der Speicher fuehrt fuer diesen Titel keine Reihe." })
        ]));
        fussnote.textContent = "";
      }
      intradayLaden();
    });

    /* Und dann Intraday. Es kommt NACH der Tagesreihe, weil der Chart
       ohne es schon steht - und weil das Gate erst wahr wird, wenn
       wirklich Bars da sind. Eine Freischaltung per Behauptung waere
       genau die Umkehrung, vor der chart-ranges.js warnt. */
    function intradayLaden() {
      fetch(INTRADAY + "?ticker=" + encodeURIComponent(ticker) + "&freq=5min&days=5",
            { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.state === "AVAILABLE" && (d.bars || []).length) {
            daten.intraday = d.bars;
            daten.intradayAdjustmentStatus = null;
            gates.ENABLE_LIVE_MARKET_DATA = true;
            leisteNeu();
            zeichne(aktuell);
            echtzeitAnbinden();
            return;
          }
          intradayGrund = d.reason || null;
          leisteNeu();
          zeichne(aktuell);
        })
        .catch(function () { leisteNeu(); zeichne(aktuell); });
    }
    var intradayGrund = null;

    /* Die Verschmelzungsreihe. Einmal aus den geholten Intraday-Bars
       gesaet; danach faltet jeder Abschluss in ihre laufende Kerze. */
    var serieVersprechen = null;
    function reihe() {
      if (serieVersprechen) return serieVersprechen;
      serieVersprechen = barMerge().then(function (BM) {
        if (!BM || !daten.intraday.length) return null;
        /* timeframe/interval muessen zur geholten Aufloesung passen -
           die Intraday-Bars kommen mit freq=5min. Der Ursprung heisst
           INTRADAY: so kann eine spaetere, bestaetigte Bar sie
           ueberschreiben, ein laufender Tick aber nicht. */
        var serie = BM.createSeries({ timeframe: "5min", interval: "5min",
                                      exchange: "XNYS" });
        serie.seed(daten.intraday, "INTRADAY");
        return serie;
      }).catch(function () { return null; });
      return serieVersprechen;
    }

    /* -------------------------------------------------------- Echtzeit

       Der Strom zeichnet keinen eigenen Chart mehr. Er haengt seine
       Punkte an den LAUFENDEN Chart, wenn gerade ein Intraday-Zeitraum
       zu sehen ist - und sagt sonst nur, dass er verbunden ist.

       Die Beschriftung bleibt neutral: der Anbieter hat die Kursart
       nicht bestaetigt. "Kursaktualisierung" ist das, was belegt ist. */
    function echtzeitAnbinden() {
      var pille = el("span", { class: "pill", text: "verbinde …" });
      var zeileStatus = el("p", { class: "muted vu-live-status" }, [
        el("span", { text: "Kursaktualisierung " }), pille
      ]);
      fussnote.insertAdjacentElement("afterend", zeileStatus);

      var quelle;
      try { quelle = new EventSource(STREAM + "?tickers=" + encodeURIComponent(ticker)); }
      catch (e) { pille.textContent = "nicht moeglich"; return; }

      quelle.addEventListener("status", function (e) {
        var d = JSON.parse(e.data);
        if (d.state === "CONNECTED") {
          pille.textContent = "verbunden"; pille.classList.add("vu-live-on"); return;
        }
        pille.textContent = d.state === "NOT_CONFIGURED" ? "Schluessel fehlt"
          : d.state === "NOT_PERMITTED" ? "nicht freigegeben" : "nicht verfuegbar";
        quelle.close();
      });
      quelle.addEventListener("subscribed", function () {
        pille.textContent = "abonniert"; pille.classList.add("vu-live-on");
      });
      quelle.addEventListener("tick", function (e) {
        var t = JSON.parse(e.data);

        /* ------------------------------------------------------------
           NUR ABSCHLUESSE BEWEGEN DEN PREIS-CHART.

           HIER LAG EIN FEHLER, UND ZWAR MEINER. Diese Stelle nahm jeden
           Tick: Abschluss wie Quote. Der Anbieter liefert beides - "T"
           ist ein ausgefuehrter Handel, "Q" die Mitte aus Geld und
           Brief. Eine Quote-Mitte ist ein ANGEBOT, kein Kurs; sie als
           Kurspunkt zu zeichnen behauptet einen Handel, den es nicht
           gegeben hat.

           Die Quote verschwindet deshalb nicht - sie steht in der
           Statuszeile, ausdruecklich als Quote-Mitte beschriftet. Sie
           fasst nur den Preisverlauf nicht an. */
        var istAbschluss = t.kind === "TRADE";
        liveWerte.push(t.price);
        if (liveWerte.length > 240) liveWerte.shift();
        pille.textContent = num(t.price, 2) + " $ · " +
          (istAbschluss ? "Abschluss" : "Quote-Mitte") + " · " + zeit(t.receivedAt);
        if (!istAbschluss) return;

        /* Und nur, wenn gerade ein Intraday-Zeitraum zu sehen ist. In
           einen Zehnjahreschart einzelne Ticks zu schreiben ergaebe eine
           Linie, die etwas anderes behauptet als sie zeigt. */
        var r = CR.byId ? CR.byId(aktuell) : null;
        var istIntraday = (r && r.source === "intraday") ||
                          aktuell === "1D" || aktuell === "5D";
        if (!istIntraday || !daten.intraday.length) return;

        /* Die AKTIVE KERZE, nicht eine neue je Tick. Das uebernimmt
           bar-merge.js: es kennt die Periodengrenzen und ruehrt eine
           abgeschlossene Bar nicht mehr an. */
        reihe().then(function (serie) {
          if (!serie) return;                      /* Engine fehlt: Chart steht */
          var r2 = serie.applyTick({ price: t.price, size: t.size,
                                     timestamp: t.at || t.receivedAt,
                                     receivedAt: t.receivedAt });
          if (!r2 || (r2.action !== "updated" && r2.action !== "appended")) return;
          daten.intraday = serie.bars();
          zeichne(aktuell);
        });
      });
      quelle.addEventListener("summary", function (e) {
        var d = JSON.parse(e.data);
        quelle.close();
        pille.textContent = d.updates ? d.updates + " Aktualisierungen" : "keine Ereignisse";
        if (d.reason === "streamWindowElapsed") setTimeout(echtzeitAnbinden, 500);
      });
      quelle.addEventListener("error", function () {
        pille.textContent = "unterbrochen"; quelle.close();
      });
    }
  }

  /* ------------------------------- Die grosse Zahl ueber dem Chart

     Sie ist der letzte Schlusskurs. Fuer Titel ohne ausgelieferte Reihe
     stand dort "Nicht verfuegbar" in Schriftgroesse 34 - wahr, aber die
     schlechteste Art es zu sagen. Jetzt gibt es fuer fast jeden Titel
     eine Reihe; die Zahl wird deshalb aus IHR gesetzt, mit ihrem Stand
     daneben. */
  function kopfzahlSchaerfen() {
    warteAuf("#content .focus", 20000).then(function (focus) {
      if (!focus) return;
      var quote = focus.querySelector(".quote");
      if (!quote) return;
      api.bridge.chartFuer(ticker).then(function (c) {
        if (c.state !== "AVAILABLE" || !c.bars.length) return;
        var letzte = c.bars[c.bars.length - 1];
        if (!Number.isFinite(letzte.close)) return;
        quote.textContent = num(letzte.close, 2) + " $";
        var unterzeile = quote.nextElementSibling;
        if (unterzeile && unterzeile.classList.contains("muted")) {
          unterzeile.textContent = "Letzter gespeicherter Schlusskurs · " +
            String(letzte.date).slice(0, 10) + " · aus dem dauerhaften Speicher, " +
            "serverseitig geholt.";
        }
      });
    });
  }


})(typeof window !== "undefined" ? window : globalThis);
