/* =========================================================================
   VISION UNIVERSE — Marktdaten (Phase 2, §17/§21/§22)

   Diese Seite ist absichtlich die einzige im Quant-Bereich, die reale
   Wertpapiere zeigt. Sie beantwortet drei Fragen, und zwar getrennt:

     1. Welche Daten sind gerade echt, welche synthetisch?
     2. Was liefert der angebundene Zugang ueberhaupt — und was nicht?
     3. Wie sehen die abgerufenen Reihen aus?

   Was sie ausdruecklich NICHT tut: einen Quant Score, ein Ranking oder
   eine Bewertung fuer diese realen Unternehmen zeigen. Dafuer fehlen die
   Fundamentaldaten, und sie zu erfinden ist die eine Sorte Fehler, die
   sich nicht durch einen Hinweis heilen laesst.

   Ohne konfigurierten Zugang ist die Seite kein Fehlerzustand: sie erklaert
   dann, was zu tun waere. Das ist der Normalzustand jeder Installation
   ohne Anbieterschluessel.
   ========================================================================= */
(function (global) {
  "use strict";

  var Q = global.QuantShell;
  var C = global.QuantCharts;
  var el = Q.el;

  var STATUS = Q.BASE + "data/market/status.json";
  var DAILY = Q.BASE + "data/market/daily/";
  var INTRADAY = Q.BASE + "data/market/intraday/";
  var GATES_FILE = Q.BASE + "config/feature-gates.json";
  var CALENDAR_FILE = Q.BASE + "config/market-calendar.json";
  var THRESHOLDS_FILE = Q.BASE + "config/realtime-thresholds.json";

  var Ranges = global.VUChartRanges;
  var Policy = global.VUDisplayPolicy;
  var RT = global.VURealtime || {};
  var LiveChart = global.VULiveChart;

  /* Die Gates werden einmal geladen und dann herumgereicht. Sie kommen aus
     einer Datei im Repository, nicht aus der Umgebung: der Browser hat
     keine Umgebungsvariablen, und eine zweite, lockerere Regel fuer ihn
     waere genau die Luecke, durch die Live-Daten oeffentlich werden. */
  var gates = Policy.gatesFromConfig(null);
  var gateConfig = null;
  /* Kalender und Verfallsschwellen. Fehlen sie, faellt die Engine auf
     ihre eingebauten Vorgaben zurueck - der Statusbefund traegt dann
     calendarCoverage=false und behauptet keine Vollstaendigkeit. */
  var kalender = null;
  var schwellen = null;

  /* --------------------------------------------------------------- Hilfen */

  function fmtPrice(v, currency) {
    if (typeof v !== "number" || !isFinite(v)) return "—";
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
           " " + (currency || "");
  }

  function pctChange(bars, days) {
    if (!bars || bars.length < 2) return null;
    var last = bars[bars.length - 1];
    var i = Math.max(0, bars.length - 1 - days);
    var first = bars[i];
    if (!first || !first.close) return null;
    return (last.close / first.close - 1) * 100;
  }

  function signedPct(v) {
    if (v === null) return "—";
    return (v >= 0 ? "+" : "") + v.toFixed(1) + " %";
  }

  /* ------------------------------------------------------------ Bausteine */

  function head() {
    return el("header", { class: "q-section-head", style: "display:block" }, [
      el("p", { class: "q-kicker", text: "Datenherkunft" }),
      el("h1", { class: "q-h1", text: "Marktdaten" }),
      el("p", {
        class: "q-lead",
        text: "Diese Seite zeigt, woher die Daten dieser Anwendung stammen. Sie trennt dabei " +
              "streng zwischen echten Kursen eines Anbieters und dem synthetischen Modelluniversum, " +
              "auf dem Ranking, Screener und Backtests laufen."
      })
    ]);
  }

  /** Der Zustand ohne Zugang — die haeufigste Lage, kein Fehler. */
  function notConfigured(status) {
    return el("div", {}, [
      /* Der Hinweis aus dem Statusbericht steht bereits in der
         Herkunftsleiste darueber. Hier steht, was das praktisch bedeutet —
         nicht dasselbe noch einmal. */
      Q.stateBox(
        "Kein Anbieterzugang konfiguriert",
        "Alle Auswertungen dieser Anwendung beruhen auf dem synthetischen Modelluniversum. " +
        "Das ist ein vollstaendig funktionsfaehiger Zustand und keine Einschraenkung der " +
        "Auswertungslogik — es fehlen echte Kurse, nicht Funktionen.",
        "empty"
      ),
      el("section", { class: "q-section" }, [
        el("div", { class: "q-section-head" }, [
          el("h2", { class: "q-h2", text: "Was dafuer noetig waere" })
        ]),
        el("ol", { class: "q-steps" }, [
          el("li", { text: "Einen kostenlosen Zugang beim Anbieter anlegen (Twelve Data, Free Plan)." }),
          el("li", { text: "Den Schluessel als Repository-Secret TWELVE_DATA_API_KEY hinterlegen — " +
                           "nicht in einer Datei, nicht im Frontend." }),
          el("li", { text: "Den Workflow ‚Marktdaten aktualisieren‘ starten. Er ruft ab, prueft " +
                           "die Reihen und committet das Ergebnis." })
        ]),
        el("p", { class: "q-note",
          text: "Der Schluessel bleibt dabei im Runner der GitHub Action. Diese Seite wird statisch " +
                "ausgeliefert; alles, was sie laedt, ist oeffentlich lesbar. Deshalb erreicht kein " +
                "Zugangsdatum den Browser — und deshalb ruft der Browser auch nichts direkt beim " +
                "Anbieter ab." })
      ])
    ]);
  }

  /** Die Faehigkeitsmatrix des Anbieters — drei Zustaende, ehrlich benannt. */
  function capabilityTable(status) {
    var LABEL = {
      "true": { text: "vorhanden", cls: "q-cap-yes" },
      "false": { text: "nicht enthalten", cls: "q-cap-no" },
      "null": { text: "ungeprueft", cls: "q-cap-unknown" }
    };
    var NAMES = {
      realtime: "Echtzeitkurse", delayed: "Verzoegerte Kurse", daily: "Tagesschluss",
      intraday: "Intraday-Bars", websocket: "Push-Verbindung",
      historicalDaily: "Tageshistorie", historicalIntraday: "Intraday-Historie",
      splits: "Split-Ereignisse", dividends: "Dividendenereignisse",
      adjustedPrices: "Total-Return-bereinigte Kurse",
      splitAdjustedPrices: "Splitbereinigte Kurse",
      symbolSearch: "Symbolsuche", marketStatus: "Boersenstatus", bulkQuotes: "Sammelabfrage"
    };

    var market = (status.capabilities && status.capabilities.market) || {};
    var evidence = status.evidence || {};

    /* Die dritte Spalte ist der eigentliche Fortschritt dieser Phase.
       "vorhanden" ohne Angabe der Herkunft ist eine Behauptung; mit Lauf
       und Datum ist es ein Befund, den jemand nachschlagen kann. */
    function beleg(k) {
      var e = evidence[k];
      if (!e) {
        return el("span", { class: "q-note", text:
          market[k] === true ? "aus der Deklaration" : "—" });
      }
      var wann = String(e.checkedAt || "").slice(0, 10);
      return el("span", { class: "q-note", text:
        (e.source === "github-actions" ? "Laufzeitpruefung" : "Laufzeitpruefung (lokal)") +
        (e.runId ? " · Lauf " + e.runId : "") + (wann ? " · " + wann : "") });
    }

    var rows = Object.keys(NAMES).filter(function (k) { return k in market; }).map(function (k) {
      var spec = LABEL[String(market[k])] || LABEL["null"];
      return el("tr", {}, [
        el("td", { text: NAMES[k] }),
        el("td", {}, [el("span", { class: "q-cap " + spec.cls, text: spec.text })]),
        el("td", {}, [beleg(k)])
      ]);
    });

    return el("section", { class: "q-section" }, [
      el("div", { class: "q-section-head" }, [
        el("div", {}, [
          el("h2", { class: "q-h2", text: "Was dieser Zugang liefert" }),
          el("p", { text: "Anbieter: " + (status.provider || "unbekannt") + ". " +
                          "‚Ungeprueft‘ heisst nicht ‚nicht vorhanden‘ — es heisst, dass niemand " +
                          "es nachgesehen hat. Die Anwendung verlaesst sich nur auf ausdruecklich " +
                          "zugesicherte Faehigkeiten." })
        ])
      ]),
      el("div", { class: "q-table-wrap" }, [
        el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { text: "Faehigkeit" }), el("th", { text: "Status" }),
            el("th", { text: "Woher" })
          ])]),
          el("tbody", {}, rows)
        ])
      ])
    ]);
  }

  /* ------------------------------------------- Entwickleransicht (§27) */

  var KLASSE_LABEL = {
    marketData: "Tageskurse",
    intraday: "Intraday",
    realtime: "Echtzeit",
    corporateActions: "Kapitalmassnahmen",
    fundamentals: "Fundamentaldaten"
  };

  /**
   * Wer darf was sehen - und warum nicht.
   *
   * Die Frage "koennen wir diese Kurse anzeigen" und die Frage "duerfen
   * wir sie anzeigen" werden regelmaessig verwechselt, weil ein
   * funktionierender Abruf sich wie eine Erlaubnis anfuehlt. Diese Tabelle
   * haelt beide getrennt und nennt bei jedem Nein den Grund. Ein
   * gesperrter Zugang ohne Begruendung ist eine Sackgasse; mit
   * Begruendung ist er eine Aufgabe.
   */
  function permissionSection(status) {
    var policy = status.policy || {};
    var gateInfo = status.gates || {};

    var klassen = Object.keys(policy);
    if (!klassen.length) return null;

    var zeilen = klassen.map(function (k) {
      var p = policy[k] || {};
      function zelle(entscheidung) {
        var ja = entscheidung && entscheidung.allowed === true;
        return el("td", {}, [
          el("span", { class: "q-cap " + (ja ? "q-cap-yes" : "q-cap-no"),
                       text: ja ? "erlaubt" : "gesperrt" }),
          !ja && entscheidung && entscheidung.message
            ? el("p", { class: "q-note", text: entscheidung.message })
            : null
        ]);
      }
      return el("tr", {}, [
        el("td", { text: KLASSE_LABEL[k] || k }),
        zelle(p.internal),
        zelle(p.public)
      ]);
    });

    var gateZeilen = Object.keys(gateInfo).map(function (name) {
      var g = gateInfo[name];
      return el("tr", {}, [
        el("td", {}, [
          el("strong", { class: "q-mono", text: name }),
          el("p", { class: "q-note", text: g.reason || "" })
        ]),
        el("td", {}, [el("span", {
          class: "q-cap " + (g.enabled ? "q-cap-yes" : "q-cap-no"),
          text: g.enabled ? "an" : "aus" })])
      ]);
    });

    return el("section", { class: "q-section" }, [
      el("div", { class: "q-section-head" }, [
        el("div", {}, [
          el("h2", { class: "q-h2", text: "Freigaben" }),
          el("p", { text: "Ob Daten abrufbar sind, ist eine technische Frage. Ob sie gezeigt " +
                          "werden duerfen, ist eine rechtliche. Beide stehen hier getrennt — " +
                          "ein funktionierender Abruf ist keine Erlaubnis." })
        ])
      ]),
      el("div", { class: "q-table-wrap" }, [
        el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { text: "Datenklasse" }),
            el("th", { text: "Intern" }),
            el("th", { text: "Oeffentlich" })
          ])]),
          el("tbody", {}, zeilen)
        ])
      ]),
      el("h3", { class: "q-h3", text: "Feature-Gates" }),
      el("p", { class: "q-note", text:
        "Die Gates stehen neben der Richtlinie, nicht ueber ihr. Ein eingeschaltetes Gate hebt " +
        "keine fehlende Erlaubnis auf — beides muss zutreffen. Sie stehen in " +
        "quant/config/feature-gates.json; eine Freischaltung ist damit ein Commit mit " +
        "Begruendung und Datum." }),
      el("div", { class: "q-table-wrap" }, [
        el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { text: "Gate" }), el("th", { text: "Zustand" })
          ])]),
          el("tbody", {}, gateZeilen)
        ])
      ])
    ]);
  }

  /** Betriebszahlen des letzten Abrufs (§22). */
  function operations(status) {
    var s = status.summary || {};
    var q = status.quota || {};
    var tiles = [
      ["Abgerufen", (s.ok || 0) + " von " + (s.requested || 0)],
      ["Abgelehnt (Qualitaet)", String(s.rejected || 0)],
      ["Fehlgeschlagen", String(s.failed || 0)],
      ["Anfragen", String(s.requests || 0)],
      ["Wiederholungen", String(s.retries || 0)],
      ["Antwortzeit", s.averageLatencyMs ? s.averageLatencyMs + " ms" : "—"],
      ["Kontingent (Tag)", q.dayLimit ? (q.dayUsed || 0) + " / " + q.dayLimit : "—"],
      ["Zustand", (status.health && status.health.status) || "unbekannt"]
    ];

    return el("section", { class: "q-section" }, [
      el("div", { class: "q-section-head" }, [
        el("div", {}, [
          el("h2", { class: "q-h2", text: "Letzter Abruf" }),
          el("p", { text: "Serverseitig ausgefuehrt am " + Q.formatDateTime(status.generatedAt) + "." })
        ])
      ]),
      el("div", { class: "q-metrics" }, tiles.map(function (t) {
        return el("div", { class: "q-metric" }, [
          el("span", { class: "q-metric-label", text: t[0] }),
          el("strong", { class: "q-metric-value q-mono", text: t[1] })
        ]);
      }))
    ]);
  }

  /* Fehlergruende in Klartext. Ein Code wie "qualityCheckFailed" ist eine
     Angabe fuer die Entwicklung, keine Auskunft an den Leser — und die
     Unterscheidung zwischen "wir konnten nicht" und "wir wollten nicht"
     ist gerade hier die interessante. */
  var REASON_LABEL = {
    qualityCheckFailed: "Qualitaetspruefung nicht bestanden",
    quotaExceeded: "Kontingent erschoepft",
    rateLimited: "Anfragegrenze erreicht",
    authError: "Zugang abgelehnt",
    notConfigured: "Kein Zugang",
    symbolUnmapped: "Symbol nicht zugeordnet",
    providerCapabilityMissing: "Nicht im Zugang enthalten",
    requestFailed: "Abruf fehlgeschlagen"
  };

  /** Die Liste der Referenztitel mit ihrem Ladezustand. */
  function universeTable(status) {
    var entries = Object.keys(status.securities || {}).map(function (id) {
      return Object.assign({ securityId: id }, status.securities[id]);
    });
    if (!entries.length) return null;

    var rows = entries.map(function (e) {
      var cell = e.ok
        ? el("span", { class: "q-cap q-cap-yes", text: e.bars + " Bars" })
        : el("span", {
            class: "q-cap q-cap-no",
            title: e.message || "",
            text: REASON_LABEL[e.reason] || e.reason || "Fehler"
          });
      return el("tr", {}, [
        el("td", {}, [
          e.ok
            ? el("a", { class: "q-link", href: "?symbol=" + encodeURIComponent(e.securityId), text: e.ticker })
            : el("span", { text: e.ticker })
        ]),
        el("td", {}, [cell]),
        el("td", { class: "q-mono", text: e.ok ? e.first + " – " + e.last : "—" }),
        el("td", { class: "q-mono", text: e.ok ? String(e.warnings || 0) : "—" })
      ]);
    });

    return el("section", { class: "q-section" }, [
      el("div", { class: "q-section-head" }, [
        el("div", {}, [
          el("h2", { class: "q-h2", text: "Referenzuniversum" }),
          el("p", { text: "Reale, liquide Titel — ausschliesslich Kursdaten. Diese Unternehmen " +
                          "erhalten keine Fundamentalkennzahlen und damit auch keinen Quant Score." })
        ])
      ]),
      el("div", { class: "q-table-wrap" }, [
        el("table", { class: "q-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { text: "Titel" }), el("th", { text: "Zustand" }),
            el("th", { text: "Zeitraum" }), el("th", { text: "Warnungen" })
          ])]),
          el("tbody", {}, rows)
        ])
      ])
    ]);
  }

  /** Kursverlauf eines einzelnen Referenztitels. */
  /**
   * Was die Bereinigungsstufe fuer die gezeigte Reihe bedeutet.
   *
   * Die Quelle gehoert in die Erklaerung: der Satz "ein Split wuerde sich
   * hier als Kurssturz zeigen" ist bei einer Jahresreihe die richtige
   * Warnung und bei einem Tagesverlauf Unsinn - an einem einzelnen Tag
   * liegt kein Split im Zeitraum. Eine Warnung, die erkennbar nicht passt,
   * bringt dem Leser bei, Warnungen zu ueberlesen.
   */
  function adjustmentNote(status, quelle) {
    var stufe = String(status || "").toUpperCase();
    if (stufe === "TOTAL_RETURN" || status === "adjusted") return "Total-Return-bereinigt.";
    if (stufe === "SPLIT_ADJUSTED" || status === "splitAdjusted") {
      return "Splitbereinigt, aber nicht dividendenbereinigt. Die ausgewiesenen Veraenderungen " +
             "unterschaetzen die Gesamtrendite eines Dividendenzahlers.";
    }
    if (stufe === "RAW" || status === "unadjusted" || status === "raw") {
      return quelle === "intraday"
        ? "Unbereinigte Kurse des Handelstages. Fuer den Verlauf innerhalb eines Tages ist das " +
          "richtig - ein Vergleich ueber laengere Zeitraeume gehoert in die Tagesreihe."
        : "Nicht bereinigt. Ein Aktiensplit im Zeitraum wuerde sich hier als Kurssturz zeigen, " +
          "obwohl kein Wert verloren ging.";
    }
    return "Bereinigungsstufe ungeprueft. Die Reihe ist zur Anschauung geeignet, nicht als " +
           "Grundlage einer Renditeaussage.";
  }

  var QUELLE_LABEL = {
    eod: "Tagesschlusskurse",
    intraday: "Intraday (IEX)"
  };

  /* ------------------------------------------------- Zeitraumleiste (§17) */

  /**
   * Die Leiste bleibt vollstaendig. Ein nicht verfuegbarer Zeitraum wird
   * abgeblendet, nicht entfernt - ein verschwundener Knopf ist eine
   * unbeantwortete Frage, und die Antwort ("dafuer braucht es Intraday,
   * und das ist nicht freigeschaltet") ist genau die, die diese Seite
   * geben soll.
   */
  function rangeBar(daten, aktiv, onSelect) {
    var zustand = Ranges.rangeBar(daten, { gates: gates });
    return el("div", { class: "q-rangebar", role: "group", "aria-label": "Zeitraum" },
      zustand.map(function (r) {
        return el("button", {
          type: "button",
          class: "q-range" + (r.id === aktiv ? " is-active" : "") +
                 (r.available ? "" : " is-off"),
          "aria-pressed": r.id === aktiv ? "true" : "false",
          title: r.available ? QUELLE_LABEL[r.source] : r.message,
          text: r.label,
          onclick: function () { onSelect(r.id); }
        });
      }));
  }

  /* ------------------------------------------------ Datenstatus (PR #51)

     Die Realtime-Engine haengt hier als BEOBACHTER am Chart, nicht als
     Torwaechter.

     Sie beantwortet die Frage, die diese Seite bisher nur in einer
     Fusszeile beantwortet hat: was sehe ich, aus welcher Sitzung, von
     wann? Dafuer laeuft ein echter Feed - mit einem Abrufweg, der die
     bereits geladenen statischen Bars ausliefert. Der Browser spricht
     dabei mit niemandem: es gibt hier keinen Anbieterzugriff und keinen
     Schluessel, und daran aendert diese Anbindung nichts.

     Was sie ausdruecklich NICHT tut: den Renderpfad an die
     Anzeigerichtlinie haengen. Die Seite liefert diese Bars heute aus;
     ob sie das oeffentlich darf, ist eine Lizenzfrage, die vor diesem
     Workstream entschieden wurde. Sie hier nachtraeglich in den
     Renderpfad zu legen wuerde den Chart schwarz schalten - eine
     Produktaenderung, die niemand beauftragt hat und die wie ein Fehler
     aussaehe. Der Befund gehoert in den Bericht, nicht in einen stillen
     Seiteneffekt. */

  var feeds = [];

  function stopFeeds() {
    feeds.forEach(function (f) { try { f.stop(); } catch (e) { /* egal */ } });
    feeds = [];
  }

  /* Ein Abrufweg ueber bereits geladene Bars. Kein Netzzugriff. */
  function statischerTransport(bars, dataClass) {
    return RT.Transport.createPollingTransport({
      id: "static-" + String(dataClass).toLowerCase(),
      kind: dataClass === "EOD" ? "eod" : "barPolling",
      dataClass: dataClass,
      /* Der Bestand aendert sich nur mit einem neuen Importlauf, also mit
         einem neuen Seitenaufruf. Ein kurzer Takt waere Beschaeftigung
         ohne Erkenntnis. */
      intervalMs: 3600000,
      poll: function () {
        return Promise.resolve({ available: bars.length > 0, data: { bars: bars },
                                 reason: bars.length ? null : "noData" });
      },
      toBars: function (d) { return d.bars; }
    });
  }

  /**
   * Baut den Datenstatus zu einer Reihe.
   *
   * Die Faehigkeiten kommen aus dem Statusbericht des Importlaufs - also
   * aus dem, was gemessen wurde, nicht aus einer Annahme. Die Zielgruppe
   * ist `internal`, weil hier eine technische Frage beantwortet wird
   * (welche Datenklasse, wie alt) und keine rechtliche.
   */
  function datenStatus(payload, daten, status) {
    if (!RT.Feed || !LiveChart) return null;

    var caps = global.VUCapabilities.declare(
      (status && status.provider) || "unknown",
      { market: (status && status.capabilities && status.capabilities.market) || {} });

    var neg = RT.CapabilityNegotiation.negotiate({
      capabilities: caps,
      providerId: (status && status.provider) || "unknown",
      audience: "internal",
      gates: gates
    });

    var transports = {};
    if ((daten.eod || []).length) transports.EOD = statischerTransport(daten.eod, "EOD");
    if ((daten.intraday || []).length) {
      transports.INTRADAY = statischerTransport(daten.intraday, "INTRADAY");
    }

    var host = el("div", {});
    var feed = RT.Feed.createLiveFeed({
      negotiation: neg,
      capabilities: caps,
      transports: transports,
      timeframe: "1D",
      interval: "1D",
      adjustmentStatus: payload.adjustmentStatus || null,
      calendar: kalender,
      thresholds: schwellen,
      /* Ein Tagesschluss altert in Tagen. Alle fuenf Sekunden nachzusehen
         waere sinnlos; einmal pro Minute genuegt, damit der Uebergang in
         eine andere Sitzung nicht unbemerkt bleibt. */
      watchdogMs: 60000,
      onStatus: function (s) { LiveChart.updateBadge(host.firstChild, s); }
    });
    feeds.push(feed);
    feed.start();
    host.appendChild(LiveChart.dataStatusBadge(feed.status()));
    return host;
  }

  function chartFor(payload, daten, rangeId) {
    var res = Ranges.selectRange(rangeId, daten, { gates: gates });

    if (!res.ok) {
      var box = Q.stateBox("Zeitraum nicht verfuegbar", res.message, "empty");
      if (res.suggestion) {
        box.appendChild(el("p", { class: "q-note", text:
          "Verfuegbar ist zum Beispiel " + res.suggestion + "." }));
      }
      return box;
    }

    var wrap = el("div", {}, [
      el("div", { class: "q-chart-wrap" }, [
        C.candlestickChart({
          bars: res.bars,
          title: "Kursverlauf " + payload.ticker + " (" + res.rangeId + ")",
          description: QUELLE_LABEL[res.source] + " in " + (payload.currency || "") +
                       " von " + res.from + " bis " + res.to + ", " + res.bars.length +
                       " Kurspunkte. " + adjustmentNote(res.adjustmentStatus, res.source),
          yFormat: function (v) { return v.toFixed(2); }
        })
      ]),
      /* Die Fusszeile ist nicht Dekoration. Ein Chart ohne Angabe von
         Quelle und Bereinigung laesst offen, ob die gezeigte Bewegung eine
         Rendite ist oder nur ein Kursverlauf - und das ist der Unterschied,
         um den es in diesem ganzen Projekt geht. */
      el("p", { class: "q-note", text:
        QUELLE_LABEL[res.source] + " · " + res.bars.length + " Punkte · " +
        res.from + " bis " + res.to + " · " + adjustmentNote(res.adjustmentStatus, res.source) })
    ]);
    return wrap;
  }

  function seriesSection(payload, status) {
    var bars = payload.bars || [];
    var closes = bars.map(function (b) { return b.close; });

    var daten = {
      eod: bars,
      intraday: payload.intraday || [],
      adjustmentStatus: payload.adjustmentStatus,
      intradayAdjustmentStatus: payload.intradayAdjustmentStatus || "RAW"
    };

    var metrics = [
      ["Letzter Kurs", fmtPrice(closes[closes.length - 1], payload.currency)],
      ["1 Monat", signedPct(pctChange(bars, 21))],
      ["6 Monate", signedPct(pctChange(bars, 126))],
      ["12 Monate", signedPct(pctChange(bars, 252))]
    ];

    var aktiv = Q.param("range") || Ranges.DEFAULT_RANGE;
    if (!Ranges.byId(aktiv)) aktiv = Ranges.DEFAULT_RANGE;
    var chartHost = el("div", {});
    var leisteHost = el("div", {});

    function zeichne(id) {
      aktiv = id;
      Q.mount(chartHost, chartFor(payload, daten, aktiv));
      Q.mount(leisteHost, rangeBar(daten, aktiv, zeichne));
    }
    zeichne(aktiv);

    /* Der Datenstatus steht ueber dem Chart und nicht unter ihm: er
       beantwortet, was man gleich sehen wird. Eine Fusszeile beantwortet
       es, nachdem man es schon geglaubt hat. */
    var statusHost = datenStatus(payload, daten, status);

    return el("section", { class: "q-section" }, [
      el("div", { class: "q-section-head" }, [
        el("div", {}, [
          el("h2", { class: "q-h2", text: payload.name + " (" + payload.ticker + ")" }),
          el("p", { text: payload.exchange + " · " + payload.currency + " · " +
                          bars.length + " Handelstage · " + adjustmentNote(payload.adjustmentStatus) })
        ]),
        statusHost || el("a", { class: "q-section-link", href: "?", text: "Uebersicht" })
      ]),
      statusHost
        ? el("p", { style: "margin:0 0 12px" }, [
            el("a", { class: "q-section-link", href: "?", text: "Uebersicht" })
          ])
        : null,
      el("div", { class: "q-metrics" }, metrics.map(function (m) {
        return el("div", { class: "q-metric" }, [
          el("span", { class: "q-metric-label", text: m[0] }),
          el("strong", { class: "q-metric-value q-mono", text: m[1] })
        ]);
      })),
      leisteHost,
      chartHost,
      Q.unavailable("Kein Quant Score fuer diesen Titel",
        "Fuer reale Unternehmen liegen in dieser Ausbaustufe keine Fundamentaldaten vor. Ein Score " +
        "aus Kursdaten allein waere kein Quant Score, sondern ein Momentum-Signal mit falschem Namen.")
    ]);
  }

  /* --------------------------------------------------------------- Aufbau */

  function render() {
    Q.renderNav(Q.BASE + "markt/");
    var root = Q.$("#q-main");
    Q.mount(root, Q.loading("Lade Datenstand …"));

    /* Die Gates zuerst. Faellt die Datei aus, bleibt es beim strengsten
       Standard - ein fehlgeschlagener Abruf darf nichts freischalten. */
    stopFeeds();
    Q.loadJSON(GATES_FILE, { attempts: 1 })
      .then(function (cfg) { gateConfig = cfg; gates = Policy.gatesFromConfig(cfg); })
      .catch(function () { gateConfig = null; gates = Policy.gatesFromConfig(null); })
      .then(function () {
        /* Beide Dateien sind optional. Ein fehlender Kalender darf die
           Seite nicht anhalten - er macht die Sitzungsaussage nur
           unsicherer, und genau das sagt der Befund dann auch. */
        return Promise.all([
          Q.loadJSON(CALENDAR_FILE, { attempts: 1 }).catch(function () { return null; }),
          Q.loadJSON(THRESHOLDS_FILE, { attempts: 1 }).catch(function () { return null; })
        ]).then(function (beides) { kalender = beides[0]; schwellen = beides[1]; });
      })
      .then(function () { return Q.loadMarketStatus(); })
      .then(function (status) {
        Q.clear(root);
        root.appendChild(head());
        root.appendChild(Q.dataOriginBar(status));

        if (!status.configured) {
          root.appendChild(notConfigured(status));
          root.appendChild(status.capabilities ? capabilityTable(status) : el("div", {}));
          root.appendChild(Q.disclaimer());
          return;
        }

        var symbol = Q.param("symbol");
        if (symbol) {
          return Q.loadJSON(DAILY + symbol + ".json").then(function (payload) {
            /* Intraday wird nur geholt, wenn das Gate offen ist. Ein Abruf,
               der nur deshalb stattfindet, weil eine Datei existiert, waere
               die Umkehrung der Regel: dann entschiede der Datenbestand
               ueber die Freigabe. */
            if (gates.ENABLE_LIVE_MARKET_DATA !== true) return payload;
            return Q.loadJSON(INTRADAY + symbol + ".json", { attempts: 1 })
              .then(function (iv) {
                payload.intraday = iv.bars || [];
                payload.intradayAdjustmentStatus = iv.adjustmentStatus || "RAW";
                return payload;
              })
              .catch(function () { return payload; });
          }).then(function (payload) {
            root.appendChild(seriesSection(payload, status));
            root.appendChild(Q.disclaimer());
          }).catch(function () {
            root.appendChild(Q.stateBox("Reihe nicht verfuegbar",
              "Fuer " + symbol + " liegt kein abgerufener Datenstand vor.", "empty"));
            root.appendChild(universeTable(status) || el("div", {}));
            root.appendChild(Q.disclaimer());
          });
        }

        var universe = universeTable(status);
        if (universe) root.appendChild(universe);
        root.appendChild(operations(status));
        root.appendChild(capabilityTable(status));
        var freigaben = permissionSection(status);
        if (freigaben) root.appendChild(freigaben);
        root.appendChild(Q.disclaimer());
      }).catch(function (err) {
        Q.mount(root, [Q.errorBox(err), Q.disclaimer()]);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window);
