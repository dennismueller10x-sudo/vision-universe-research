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
    { href: BASE + "ai/", label: "Ask Vision Universe" }
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
    stateBox: stateBox, loading: loading, errorBox: errorBox, unavailable: unavailable
  };

  global.QuantShell = api;
})(window);
