/* =========================================================================
   VISION UNIVERSE QUANT — ui/shell.js

   Gemeinsame Produktschicht der Quant-Seiten (App unter /quant/,
   Marktdaten, Data Inspector) und von Discover: Datenladen, Navigation,
   Formatierung, Zustaende. Enthaelt bewusst KEINE Berechnungslogik — die
   liegt vollstaendig in quant/engines/** und ist damit auch in Node
   testbar. Diese Datei kennt nur Darstellung.

   Das synthetische Modelluniversum (511 erfundene Wertpapiere) und die
   Seiten, die darauf liefen, sind entfernt; diese Shell laedt keine
   Mock-Datensaetze mehr. Alte Adressen leitet quant/ui/legacy-redirect.js
   auf die App weiter.
   ========================================================================= */
(function (global) {
  "use strict";

  var BASE = "/quant/";
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

  /** Statische, gzip-komprimierte Product Data. Die Dekompression geschieht
   * nach einem Same-Origin-Fetch; private History wird nie angefordert. */
  function loadCompressedJSON(path) {
    if (cache[path]) return cache[path];
    var pending = fetch(path, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) {
        var err = new Error("Konnte " + path + " nicht laden (HTTP " + res.status + ")");
        err.status = res.status; throw err;
      }
      return res.arrayBuffer();
    }).then(function (buffer) {
      if (typeof DecompressionStream !== "function") throw new Error("GZIP_DECOMPRESSION_UNSUPPORTED");
      return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    }).then(JSON.parse).catch(function (err) { delete cache[path]; throw err; });
    cache[path] = pending;
    return pending;
  }

  // ---------------------------------------------------------- Navigation
  /* Navigation der Nebenseiten (Marktdaten, Data Inspector). Die Bereiche
     der App sind Hash-Routen unter /quant/ (siehe quant/app/app.js). */
  var NAV = [
    { href: BASE + "#/", label: "Quant Home" },
    { href: BASE + "#/screener", label: "Screener" },
    { href: BASE + "#/radar", label: "Radar" },
    { href: BASE + "#/strategien", label: "Strategien" },
    { href: BASE + "#/backtest", label: "Backtests" },
    { href: BASE + "#/aktien", label: "Aktien" },
    { href: BASE + "#/methodik", label: "Methodik" },
    { href: "/ask/", label: "AI Atlas" },
    { href: BASE + "markt/", label: "Marktdaten" },
    { href: BASE + "data-inspector/", label: "Data Inspector" }
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
    sec:              { text: "SEC-Meldungen",  tone: "good",    note: "Unternehmenszahlen aus den Pflichtmeldungen bei der SEC (siehe Data Inspector)." },
    unavailable:      { text: "Nicht verfuegbar", tone: "poor",  note: "Fuer diese Datenklasse liegt keine Quelle vor." },
    capabilityMissing:{ text: "Nicht im Zugang", tone: "poor",   note: "Der angebundene Zugang liefert diese Daten grundsaetzlich nicht." }
  };

  var CLASS_LABEL = {
    marketData: "Kurse", fundamentals: "Fundamentaldaten",
    corporateActions: "Kapitalmassnahmen", estimates: "Schaetzungen",
    macro: "Makrodaten", news: "Nachrichten"
  };

  function provenanceTag(label, value, tone) {
    return el("span", { class: "q-chip" + (tone ? " tone-" + tone : ""),
                        text: label + " · " + value });
  }

  /**
   * Laedt den Statusbericht des Referenz-Kurszugangs. Ein fehlender Bericht
   * bedeutet "nicht verfuegbar" - nicht Fehler. Diese Funktion lehnt darum
   * nie ab.
   */
  function loadMarketStatus() {
    return loadJSON(MARKET_STATUS_PATH, { attempts: 1 }).catch(function () {
      return { dataMode: "mock", configured: false, provider: null,
               publicDataState: { mode: "UNAVAILABLE" },
               notice: "Kein Datenstand hinterlegt." };
    });
  }

  /**
   * Ein Abzeichen je Datenklasse.
   *
   * Warum nicht ein einziges Abzeichen fuer die ganze Seite: weil es dann
   * unweigerlich zu "Live" wuerde, sobald irgendetwas live ist. Genau diese
   * Verkuerzung ist die Sorte Halbwahrheit, die eine Seite mit echten
   * Kursen und fehlenden Fundamentaldaten unehrlich macht. Kurse und
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
    /* "mock" heisst im Statusbericht des Referenzzugangs nur: kein Zugang
       konfiguriert. Synthetische Kurse zeigt keine Seite mehr - die
       Kursklasse ist dann schlicht nicht verfuegbar. */
    var mode = status.dataMode || "mock";
    var publicUnavailable = mode === "mock" ||
      (status.publicDataState && status.publicDataState.mode === "UNAVAILABLE");
    var classes = [];

    if (publicUnavailable) {
      classes.push(["marketData", "unavailable"], ["fundamentals", "sec"]);
    } else {
      var anyOk = false, anyStale = false;
      var securities = status.securities || {};
      Object.keys(securities).forEach(function (k) {
        if (securities[k].ok) anyOk = true;
        if (securities[k].stale) anyStale = true;
      });
      var marketOrigin = !anyOk ? "unavailable" : (anyStale ? "stale" : "endOfDay");
      classes.push(["marketData", marketOrigin]);
      classes.push(["fundamentals", "sec"]);
      /* Kapitalmassnahmen bekommen ein eigenes Abzeichen, sobald ueber sie
         etwas bekannt ist - in beide Richtungen. Frueher stand hier nur der
         Fall "liefert der Zugang nicht"; seit Splits und Dividenden bei
         Tiingo zur Laufzeit belegt sind, waere das Schweigen im
         Erfolgsfall die unehrlichere Haelfte: der Leser saehe nicht, dass
         die Kursreihe um echte Ereignisse bereinigt ist. */
      var market = (status.capabilities && status.capabilities.market) || {};
      if (market.splits === false || market.dividends === false) {
        classes.push(["corporateActions", "capabilityMissing"]);
      } else if (market.splits === true && market.dividends === true) {
        classes.push(["corporateActions", anyOk ? "endOfDay" : "unavailable"]);
      }
    }

    var badges = classes.map(function (pair) { return originBadge(pair[0], pair[1]); });
    var source = publicUnavailable ? "NONE" : (status.provider ? String(status.provider).replace(/-/g, " ").toUpperCase() : "NONE");
    var children = [
      el("div", { class: "q-provenance-tags" }, [
        provenanceTag("MODE", publicUnavailable ? "UNAVAILABLE" : "HYBRID", publicUnavailable ? "neutral" : "strong"),
        provenanceTag("FORM", "PRECOMPUTED", "neutral"),
        provenanceTag("SOURCE", source, "neutral")
      ]),
      el("div", { class: "q-origin-row" }, badges)
    ];

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
              "Aufforderung zum Kauf oder Verkauf von Wertpapieren. Ein Faktorwert beschreibt die relative Position " +
              "eines Wertpapiers innerhalb einer Vergleichsgruppe — er ist keine Aussage ueber die Wahrscheinlichkeit " +
              "kuenftiger Kursentwicklungen. Historische Auswertungen beruhen auf Modellannahmen und lassen keinen " +
              "verlaesslichen Rueckschluss auf die kuenftige Entwicklung zu.",
        style: "margin:0 0 8px"
      }),
      el("p", {
        text: "Datenherkunft und Verarbeitungsform werden auf jeder Seite anhand der geladenen Metadaten ausgewiesen. " +
              "REAL, HYBRID, PRECOMPUTED, BETA und UNAVAILABLE sind getrennte Zustaende; fehlende Daten werden nicht " +
              "stillschweigend ersetzt.",
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

  var api = {
    BASE: BASE, NAV: NAV,
    $: $, $$: $$, el: el, clear: clear, mount: mount, param: param,
    loadJSON: loadJSON, loadCompressedJSON: loadCompressedJSON,
    renderNav: renderNav, disclaimer: disclaimer,
    formatDate: formatDate, num: num, signed: signed, fmt: fmt,
    CONFIDENCE_LABEL: CONFIDENCE_LABEL, FACTOR_LABEL: FACTOR_LABEL,
    stateBox: stateBox, loading: loading, errorBox: errorBox, unavailable: unavailable,
    MARKET_STATUS_PATH: MARKET_STATUS_PATH, ORIGIN_LABEL: ORIGIN_LABEL, CLASS_LABEL: CLASS_LABEL,
    loadMarketStatus: loadMarketStatus, originBadge: originBadge, dataOriginBar: dataOriginBar,
    provenanceTag: provenanceTag,
    formatDateTime: formatDateTime
  };

  global.QuantShell = api;

  /* Die Bereichsleiste ist die gemeinsame Produkt-Leiste der Vision-Universe-
     Shell (assets/site-navigation.js): Quant | Screener | Strategien | Aktien
     | ☰. Alle Seiten unter /quant/ fordern sie hier an; der aktive Eintrag
     folgt dem Pfad. Die uebrigen Bereiche dieser Seiten (Ranking, Backtests,
     Watchlist ...) stehen als ruhige Liste am Seitenende (renderNav). */
  if (global.VUNavigation) global.VUNavigation.dock({});
})(window);
