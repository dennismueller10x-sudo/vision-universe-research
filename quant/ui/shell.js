/* =========================================================================
   VISION UNIVERSE QUANT — ui/shell.js

   Gemeinsame Produktschicht aller Quant-Seiten: Datenladen, Navigation,
   Formatierung, Zustaende. Enthaelt bewusst KEINE Berechnungslogik — die
   liegt vollstaendig in quant/engines/** und ist damit auch in Node
   testbar. Diese Datei kennt nur Darstellung.

   Das Laden folgt dem Repository-Muster: statisches JSON aus quant/data/**,
   erzeugt von scripts/quant/build-quant-data.mjs.
   ========================================================================= */
(function (global) {
  "use strict";

  var BASE = "/quant/";
  var Methodology = global.VUMethodology;
  var Catalog = global.VUCatalog;

  var cache = Object.create(null);

  // ------------------------------------------------------------------ DOM
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      /* Bewusst kein "html"-Attribut: el() setzt ausschliesslich textContent.
         Eine innerHTML-Hintertuer wird frueher oder spaeter mit Provider- oder
         Nutzerdaten benutzt, und dann ist sie eine XSS-Luecke. */
      else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else node.setAttribute(k, v === true ? "" : String(v));
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function mount(node, children) {
    clear(node);
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function param(name, fallback) {
    var v = new URLSearchParams(location.search).get(name);
    return v === null || v === "" ? (fallback === undefined ? null : fallback) : v;
  }

  // ----------------------------------------------------------------- Laden
  /**
   * Laedt eine JSON-Datei und merkt sich das ERGEBNIS — niemals einen
   * Fehlschlag. Wuerde die abgelehnte Promise im Cache bleiben, waere eine
   * einzige verlorene Anfrage endgueltig: jeder weitere Aufruf bekaeme
   * dieselbe Ablehnung zurueck, und die Seite liesse sich nur durch Neuladen
   * reparieren. Mit echten Providerdaten sind voruebergehende Fehler der
   * Normalfall, nicht die Ausnahme.
   */
  function loadJSON(path, options) {
    options = options || {};
    if (cache[path]) return cache[path];
    var attempts = options.attempts === undefined ? 3 : options.attempts;

    function attempt(remaining, delay) {
      return fetch(path, { cache: "no-cache" }).then(function (res) {
        if (!res.ok) {
          var err = new Error("Konnte " + path + " nicht laden (HTTP " + res.status + ")");
          err.status = res.status;
          throw err;
        }
        return res.json();
      }).catch(function (err) {
        /* 4xx ausser 408/429 sind dauerhaft — ein erneuter Versuch aendert
           nichts und verzoegert die Fehlermeldung nur. */
        var permanent = err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
        if (remaining <= 1 || permanent) throw err;
        return new Promise(function (resolve) { setTimeout(resolve, delay); })
          .then(function () { return attempt(remaining - 1, delay * 2); });
      });
    }

    var pending = attempt(attempts, 400).catch(function (err) {
      delete cache[path];        // Fehlschlag nicht konservieren
      throw err;
    });
    cache[path] = pending;
    return pending;
  }

  var DATA_FILES = {
    meta: "data/meta.json",
    securities: "data/securities.json",
    scoreHistory: "data/score-history.json",
    radar: "data/radar.json",
    events: "data/events.json",
    rankings: "data/rankings.json",
    strategies: "data/strategies.json",
    fieldCatalog: "data/field-catalog.json"
  };

  /** Shard-Regel der Factor DNA — identisch zu build-quant-data.mjs. */
  function dnaShardKey(ticker) {
    if (ticker.indexOf("VUF") === 0) return "f";
    var n = parseInt(ticker.slice(2), 10);
    return String(Math.floor((n - 1) / 50));
  }

  function loadFactorDna(ticker) { return loadJSON(BASE + "data/dna/" + dnaShardKey(ticker) + ".json"); }

  /**
   * Laedt Methodik und die angeforderten Datensaetze.
   * @param {string[]} need Schluessel aus DATA_FILES
   */
  function boot(need) {
    var methodologyLoads = Object.keys(Methodology.FILES).map(function (key) {
      return loadJSON(BASE + "methodology/" + Methodology.FILES[key]).then(function (cfg) { return [key, cfg]; });
    });

    return Promise.all(methodologyLoads).then(function (pairs) {
      var configs = {};
      pairs.forEach(function (p) { configs[p[0]] = p[1]; });
      Methodology.configure(configs);

      var keys = ["meta"].concat(need || []).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
      return Promise.all(keys.map(function (k) {
        if (!DATA_FILES[k]) throw new Error("Unbekannter Datensatz: " + k);
        return loadJSON(BASE + DATA_FILES[k]).then(function (d) { return [k, d]; });
      }));
    }).then(function (pairs) {
      var data = {};
      pairs.forEach(function (p) { data[p[0]] = p[1]; });
      return data;
    });
  }

  // ---------------------------------------------------------- Navigation
  var NAV = [
    { href: BASE, label: "Quant Home" },
    { href: BASE + "ranking/", label: "Ranking" },
    { href: BASE + "screener/", label: "Screener" },
    { href: BASE + "radar/", label: "Radar" },
    { href: BASE + "strategies/", label: "Strategien" },
    { href: BASE + "backtests/", label: "Backtests" },
    { href: BASE + "watchlist/", label: "Watchlist" },
    { href: BASE + "technical/", label: "Technical" },
    { href: BASE + "ai/", label: "Ask Vision Universe" },
    { href: BASE + "markt/", label: "Marktdaten" }
  ];

  function renderNav(activeHref) {
    var wrap = $("#q-tabs");
    if (!wrap) return;
    mount(wrap, NAV.map(function (item) {
      var isActive = item.href === activeHref;
      return el("a", {
        class: "q-tab", href: item.href, text: item.label,
        "aria-current": isActive ? "page" : null
      });
    }));
  }

  /** Mock-Kennzeichnung (§94). Steht auf jeder Seite, nicht nur im Footer. */
  function mockBanner(meta) {
    return el("div", { class: "q-mock-banner", role: "note" }, [
      el("span", { class: "q-mock-dot", "aria-hidden": "true" }),
      el("div", {}, [
        el("b", { text: "Demo-Daten · synthetisches Universum" }),
        el("span", {
          text: meta.securityCount + " synthetische Wertpapiere (VU0001 …), erzeugt aus Seed „" + meta.seed +
                "“. Keine realen Unternehmen, keine realen Marktdaten, keine reale Wertentwicklung. " +
                "Datenstand des Modells: " + formatDate(meta.asOf) + "."
        })
      ])
    ]);
  }

  // ------------------------------------------------------- Datenherkunft
  /* Phase 2 §17/§21. Der Statusbericht wird serverseitig geschrieben; das
     Frontend liest ihn nur. Fehlt er, ist das kein Fehler, sondern der
     Normalzustand einer Installation ohne Anbieterzugang. */

  var MARKET_STATUS_PATH = BASE + "data/market/status.json";

  var ORIGIN_LABEL = {
    live:             { text: "Live",           tone: "good",    note: "Echtzeitkurse des Anbieters." },
    delayed:          { text: "Verzoegert",     tone: "neutral", note: "Kurse mit Anbieterverzoegerung, typisch 15 Minuten." },
    endOfDay:         { text: "Tagesschluss",   tone: "neutral", note: "Schlusskurse des letzten abgeschlossenen Handelstags." },
    stale:            { text: "Veraltet",       tone: "warn",    note: "Der letzte Abruf ist fehlgeschlagen; angezeigt wird der zuletzt erfolgreiche Stand." },
    mock:             { text: "Demo",           tone: "neutral", note: "Synthetische Daten. Keine realen Unternehmen." },
    unavailable:      { text: "Nicht verfuegbar", tone: "poor",  note: "Fuer diese Datenklasse liegt keine Quelle vor." },
    capabilityMissing:{ text: "Nicht im Zugang", tone: "poor",   note: "Der angebundene Zugang liefert diese Daten grundsaetzlich nicht." }
  };

  var CLASS_LABEL = {
    marketData: "Kurse", fundamentals: "Fundamentaldaten",
    corporateActions: "Kapitalmassnahmen", estimates: "Schaetzungen",
    macro: "Makrodaten", news: "Nachrichten"
  };

  /**
   * Laedt den Statusbericht. Ein fehlender Bericht bedeutet Mock-Modus —
   * nicht Fehler. Diese Funktion lehnt darum nie ab.
   */
  function loadMarketStatus() {
    return loadJSON(MARKET_STATUS_PATH, { attempts: 1 }).catch(function () {
      return { dataMode: "mock", configured: false, provider: null,
               notice: "Kein Datenstand hinterlegt. Das System laeuft vollstaendig im Demo-Modus." };
    });
  }

  /**
   * Ein Abzeichen je Datenklasse.
   *
   * Warum nicht ein einziges Abzeichen fuer die ganze Seite: weil es dann
   * unweigerlich zu "Live" wuerde, sobald irgendetwas live ist. Genau diese
   * Verkuerzung ist die Sorte Halbwahrheit, die eine Seite mit echten
   * Kursen und synthetischen Fundamentaldaten unehrlich macht. Kurse und
   * Fundamentaldaten haben getrennte Herkuenfte und bekommen getrennte
   * Abzeichen.
   */
  function originBadge(dataClass, origin, extra) {
    var spec = ORIGIN_LABEL[origin] || ORIGIN_LABEL.unavailable;
    return el("span", {
      class: "q-origin q-origin-" + spec.tone,
      title: (CLASS_LABEL[dataClass] || dataClass) + ": " + spec.note + (extra ? " " + extra : "")
    }, [
      el("span", { class: "q-origin-dot", "aria-hidden": "true" }),
      el("span", { class: "q-origin-class", text: CLASS_LABEL[dataClass] || dataClass }),
      el("span", { class: "q-origin-value", text: spec.text })
    ]);
  }

  /**
   * Die Datenherkunftsleiste. Zeigt je Datenklasse, woher die Daten
   * kommen, und benennt jede Einschraenkung im Klartext.
   */
  function dataOriginBar(status) {
    status = status || { dataMode: "mock", configured: false };
    var mode = status.dataMode || "mock";
    var classes = [];

    if (mode === "mock") {
      classes.push(["marketData", "mock"], ["fundamentals", "mock"]);
    } else {
      var anyOk = false, anyStale = false;
      var securities = status.securities || {};
      Object.keys(securities).forEach(function (k) {
        if (securities[k].ok) anyOk = true;
        if (securities[k].stale) anyStale = true;
      });
      var marketOrigin = !anyOk ? "mock" : (anyStale ? "stale" : "endOfDay");
      classes.push(["marketData", marketOrigin]);
      /* Fundamentaldaten bleiben in dieser Phase ausnahmslos synthetisch.
         Das ist keine Uebergangsloesung, sondern die bewusste Grenze: ein
         reales Unternehmen mit erfundenen Bilanzzahlen zu zeigen waere die
         eine Sorte Fehler, die sich nicht durch einen Hinweis heilen laesst. */
      classes.push(["fundamentals", "mock"]);
      if (status.capabilities && status.capabilities.market &&
          status.capabilities.market.splits === false) {
        classes.push(["corporateActions", "capabilityMissing"]);
      }
    }

    var badges = classes.map(function (pair) { return originBadge(pair[0], pair[1]); });
    var children = [el("div", { class: "q-origin-row" }, badges)];

    var lines = [];
    if (status.notice) lines.push(status.notice);
    if (status.adjustmentStatus === "unadjusted") {
      lines.push("Die Kursreihen sind nicht um Splits und Dividenden bereinigt. Sie eignen sich zur " +
                 "Darstellung, nicht als Grundlage fuer Total-Return-Kennzahlen.");
    } else if (status.adjustmentStatus === "splitAdjusted") {
      lines.push("Die Kursreihen sind splitbereinigt, aber nicht dividendenbereinigt. Total-Return-" +
                 "Kennzahlen waeren damit systematisch zu niedrig.");
    }
    if (status.generatedAt) {
      /* "Letzter Abruf" waere gelogen, solange gar nichts abgerufen wurde:
         der Zeitstempel sagt dann nur, wann der Statusbericht geschrieben
         wurde. Zwei Zustaende, zwei Beschriftungen. */
      lines.push((status.configured ? "Letzter Abruf: " : "Stand des Berichts: ") +
                 formatDateTime(status.generatedAt) +
                 (status.configured && status.provider ? " · Anbieter: " + status.provider : ""));
    }
    lines.forEach(function (line) {
      children.push(el("p", { class: "q-origin-note", text: line }));
    });

    return el("section", { class: "q-origin-bar", role: "note",
                           "aria-label": "Herkunft der angezeigten Daten" }, children);
  }

  /**
   * Der Hinweis fuer die Seiten, die auf dem Modelluniversum laufen.
   *
   * Wichtig genug fuer einen eigenen Baustein: Ranking, Screener, Radar
   * und Backtests rechnen ausnahmslos auf dem synthetischen Datensatz.
   * Auf diesen Seiten die Herkunftsleiste mit "Kurse: Tagesschluss" zu
   * zeigen, nur weil irgendwo im System echte Kurse abgerufen wurden,
   * waere schlicht falsch — die Kurse dieser Seite sind es nicht.
   * Der richtige Zusatz ist ein anderer: dass es echte Daten gibt, wo sie
   * liegen, und dass sie in diese Auswertung nicht einfliessen.
   */
  function datasetOriginNote(status) {
    if (!status || !status.configured) return null;
    var securities = status.securities || {};
    var loaded = Object.keys(securities).filter(function (k) { return securities[k].ok; });
    if (!loaded.length) return null;

    return el("section", { class: "q-origin-bar", role: "note" }, [
      el("div", { class: "q-origin-row" }, [
        originBadge("marketData", "mock", "Diese Seite rechnet auf dem Modelluniversum."),
        originBadge("fundamentals", "mock")
      ]),
      el("p", { class: "q-origin-note" }, [
        "Die Auswertungen dieser Seite beruhen vollstaendig auf dem synthetischen " +
        "Modelluniversum. Unabhaengig davon liegen echte Tageskurse fuer " + loaded.length +
        " reale Referenztitel vor; sie fliessen hier nicht ein. ",
        el("a", { class: "q-link", href: BASE + "markt/", text: "Zur Datenherkunft" })
      ])
    ]);
  }

  function formatDateTime(iso) {
    if (!iso) return "unbekannt";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  }

  /** Zentrale Disclaimer-Komponente (§82). */
  function disclaimer() {
    return el("footer", { class: "q-disclaimer" }, [
      el("b", { text: "Hinweis" }),
      el("p", {
        text: "Vision Universe® ist ein Research- und Analysewerkzeug. Die gezeigten Auswertungen sind " +
              "quantitative Kennzahlen und Regelwerke, keine Anlageberatung, keine persoenliche Empfehlung und keine " +
              "Aufforderung zum Kauf oder Verkauf von Wertpapieren. Ein Quant Score beschreibt die relative Position " +
              "eines Wertpapiers innerhalb einer Vergleichsgruppe — er ist keine Aussage ueber die Wahrscheinlichkeit " +
              "kuenftiger Kursentwicklungen. Historische Auswertungen beruhen auf Modellannahmen und lassen keinen " +
              "verlaesslichen Rueckschluss auf die kuenftige Entwicklung zu.",
        style: "margin:0 0 8px"
      }),
      el("p", {
        text: "Saemtliche Daten in diesem Bereich sind synthetisch und dienen ausschliesslich der Entwicklung und " +
              "Demonstration des Systems.",
        style: "margin:0"
      })
    ]);
  }

  // --------------------------------------------------------- Formatierung
  function formatDate(iso) {
    if (!iso) return "–";
    var d = new Date(iso.length > 10 ? iso : iso + "T00:00:00Z");
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  }

  function num(v, digits) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "–";
    return v.toLocaleString("de-DE", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits === undefined ? 1 : digits });
  }

  function signed(v, digits) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "–";
    return (v > 0 ? "+" : "") + num(v, digits === undefined ? 1 : digits);
  }

  /**
   * Deutsche Formatierung ueber den Katalog. Lokalisiert wird ausschliesslich
   * die Zahl — Praefix und Einheitensuffix bleiben unangetastet, damit aus
   * "$1.3 Mrd." nicht "$1,3 Mrd," wird.
   */
  function fmt(fieldId, value) {
    var p = Catalog.formatParts(fieldId, value);
    if (!p) return "–";
    return p.prefix + p.value.toLocaleString("de-DE", {
      minimumFractionDigits: p.digits, maximumFractionDigits: p.digits
    }) + p.suffix;
  }

  function toneFor(score) {
    if (score === null || score === undefined || !Number.isFinite(score)) return "none";
    var band = Methodology.bandFor(Methodology.quant().ratingBands, score);
    return band ? band.tone : "none";
  }

  function bandLabel(score) {
    if (score === null || !Number.isFinite(score)) return "Kein Score";
    var band = Methodology.bandFor(Methodology.quant().ratingBands, score);
    return band ? band.label : "–";
  }

  var CONFIDENCE_LABEL = { high: "Hoch", medium: "Mittel", low: "Niedrig", insufficient: "Unzureichend" };
  var FACTOR_LABEL = { quality: "Quality", momentum: "Momentum", value: "Value", growth: "Growth", risk: "Risk", revisions: "Revisions" };

  // -------------------------------------------------------------- States
  function stateBox(title, message, variant) {
    return el("div", { class: "q-state" + (variant ? " q-state--" + variant : "") }, [
      el("b", { text: title }),
      el("span", { text: message })
    ]);
  }

  function loading(message) {
    return el("div", { class: "q-state", "aria-live": "polite" }, [el("span", { text: message || "Lade Daten …" })]);
  }

  function errorBox(err) {
    return stateBox("Daten konnten nicht geladen werden",
      (err && err.message) ? err.message : String(err), "error");
  }

  /** Nicht verfuegbare Daten sichtbar machen statt erfinden (§76, §93). */
  function unavailable(title, reason) {
    return el("div", { class: "q-unavailable" }, [
      el("div", {}, [el("b", { text: title }), el("span", { text: reason })])
    ]);
  }

  /** Standard-Bootstrap einer Seite: Nav, Banner, Disclaimer, Fehlerbehandlung. */
  function page(options) {
    renderNav(options.nav);
    var root = $(options.mount || "#q-main");
    mount(root, loading());
    return boot(options.need).then(function (data) {
      clear(root);
      if (options.banner !== false) root.appendChild(mockBanner(data.meta));

      /* Die Herkunftsleiste wird nachgereicht, sobald der Statusbericht da
         ist. Sie darf den Seitenaufbau nicht aufhalten: eine Seite, die auf
         eine Statusdatei wartet, die es auf den meisten Installationen gar
         nicht gibt, waere langsamer ohne einen einzigen Gewinn. */
      var originSlot = el("div", {});
      if (options.origin !== false) {
        root.appendChild(originSlot);
        loadMarketStatus().then(function (status) {
          /* Im reinen Mock-Modus sagt das Demo-Banner darueber bereits
             alles; zwei Hinweise nebeneinander stumpfen beide ab. */
          var note = datasetOriginNote(status);
          if (note) mount(originSlot, note);
        });
      }

      var content = el("div", {});
      root.appendChild(content);
      var result = options.render(data, content);
      root.appendChild(disclaimer());
      var stamp = $("#q-datastamp");
      if (stamp) stamp.textContent = "Modellstand " + formatDate(data.meta.asOf) + " · " + data.meta.methodologyVersions.quant;
      return result;
    }).catch(function (err) {
      mount(root, [errorBox(err), disclaimer()]);
      if (global.console) global.console.error(err);
      throw err;
    });
  }

  var api = {
    BASE: BASE, NAV: NAV, DATA_FILES: DATA_FILES,
    $: $, $$: $$, el: el, clear: clear, mount: mount, param: param,
    loadJSON: loadJSON, loadFactorDna: loadFactorDna, dnaShardKey: dnaShardKey, boot: boot, page: page,
    renderNav: renderNav, mockBanner: mockBanner, disclaimer: disclaimer,
    formatDate: formatDate, num: num, signed: signed, fmt: fmt,
    toneFor: toneFor, bandLabel: bandLabel,
    CONFIDENCE_LABEL: CONFIDENCE_LABEL, FACTOR_LABEL: FACTOR_LABEL,
    stateBox: stateBox, loading: loading, errorBox: errorBox, unavailable: unavailable,
    MARKET_STATUS_PATH: MARKET_STATUS_PATH, ORIGIN_LABEL: ORIGIN_LABEL, CLASS_LABEL: CLASS_LABEL,
    loadMarketStatus: loadMarketStatus, originBadge: originBadge, dataOriginBar: dataOriginBar,
    datasetOriginNote: datasetOriginNote,
    formatDateTime: formatDateTime
  };

  global.QuantShell = api;
})(window);
