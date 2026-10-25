/* =========================================================================
   VISION UNIVERSE TECHNICAL — app.js
   Startseite (#/), Screener (#/screener), Chart Studio (#/chart/<T>),
   Methodik (#/methodik). Hash-Routen, keine Bibliothek.

   Datenquellen (nur lesend):
     /technical/data/index-v1.json + meta.json         (Startseite, Chart Studio; Erzeuger build-screener.mjs)
     /technical/data/screener-v1.json                  (nur Screener, bei Bedarf)
     /quant/data/product/technical-signals-v1/by-ticker/<T>.json.gz
                                                       (Tagesbars + Vollhistorien-Features)
     /quant/data/market/discover-series-long/<securityId>.json (Wochenschluesse)
   Indikatoren und Formationen im Chart Studio rechnen dieselben Engines,
   die den Screener-Datensatz erzeugen (quant/engines/technical/*).
   ========================================================================= */
(function (global) {
  "use strict";
  var M = global.VUTechnicalModel, Q = global.VUTechnical.Query, QT = global.VUTechnical.QueryText, Chart = global.VUTechnicalChart;
  var doc = global.document;

  /* -------------------------------------------------------------- DOM */
  function el(tag, attrs, kids) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    /* eine Ebene verschachtelter Listen (z. B. dt/dd-Paare) wird flach eingesetzt */
    [].concat.apply([], [].concat(kids || [])).forEach(function (c) { if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : String(c)); });
    return n;
  }
  function put(host, kids) { host.replaceChildren.apply(host, [].concat(kids || []).filter(Boolean)); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  var GLYPH = {
    trend: "M4 17l5-5 4 3 7-8M15 7h5v5", breakout: "M3 15h7l3-8 3 5h5M14 4h6v6", triangle: "M4 5l16 7-16 7z", flag: "M5 21V4M5 4h11l-3 4 3 4H5",
    bars: "M5 20V12M10 20V7M15 20v-5M20 20V4", pulse: "M3 12h4l3-7 4 14 3-7h4", range: "M4 7h16M4 17h16M7 7v10M17 7v10", contraction: "M3 6l5 5 4-3 4 2 5-1M3 18l5-4 4 2 4-1 5 1",
    reversal: "M4 18l4-10 4 7 4-10 4 13", trophy: "M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 21h8M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3", clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2",
    search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4", chevron: "M9 6l6 6-6 6", back: "M15 6l-6 6 6 6", save: "M6 3h12v18l-6-4-6 4z", expand: "M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6",
    up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6"
  };
  function glyph(name, cls) {
    var s = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", cls || "tc-glyph");
    var p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", GLYPH[name] || GLYPH.trend); s.appendChild(p);
    return s;
  }
  function productIcon() {
    var s = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var u = doc.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "/assets/product-icons.svg#technical");
    s.appendChild(u); return s;
  }

  /* ------------------------------------------------------------- Daten */
  var cache = {};
  function fetchJSON(path) {
    if (!cache[path]) cache[path] = fetch(path, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    return cache[path];
  }
  function fetchGz(path) {
    if (!cache[path]) cache[path] = fetch(path, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (typeof DecompressionStream !== "function") throw new Error("NO_DECOMPRESSION");
      return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
    });
    return cache[path];
  }
  var dataset = null;
  function loadScreener() {
    if (dataset) return Promise.resolve(dataset);
    return Promise.all([fetchJSON(M.SCREENER_PATH), fetchJSON(M.META_PATH).catch(function () { return null; })]).then(function (r) {
      dataset = { ds: Q.createDataset(r[0]), artifact: r[0], meta: r[1] };
      return dataset;
    });
  }
  /* Startseite und Chart Studio brauchen nur Kuerzel, Namen und Trefferzahlen: schlanker Index statt des vollen Datensatzes.
     Fehlt er (z. B. vor dem ersten Erzeugerlauf), wird er aus dem Datensatz nachgerechnet - dieselbe Funktion wie im Erzeuger. */
  var indexP = null;
  function loadIndex() {
    if (indexP) return indexP;
    var meta = fetchJSON(M.META_PATH).catch(function () { return null; });
    indexP = Promise.all([fetchJSON(M.INDEX_PATH).then(function (x) { if (!x || x.schemaVersion !== M.INDEX_SCHEMA) throw new Error("INDEX_SCHEMA"); return x; })
      .catch(function () { return loadScreener().then(function (D) { return M.homeIndex(D.artifact); }); }), meta]).then(function (r) {
      var ix = r[0], pos = {};
      ix.s.forEach(function (t, i) { pos[t] = i; });
      return { index: ix, meta: r[1], name: function (t) { return pos[t] >= 0 ? ix.n[pos[t]] : null; }, has: function (t) { return pos[t] >= 0; },
        entries: ix.s.map(function (t, i) { return { s: t, n: ix.n[i] }; }) };
    });
    indexP.catch(function () { indexP = null; });
    return indexP;
  }
  function loadInstrument(ticker) {
    var paths = M.technicalPaths(ticker);
    return fetchGz(paths[0]).catch(function () { return fetchGz(paths[1]); }).then(function (doc2) {
      var inst = doc2 && doc2.instruments && doc2.instruments[ticker];
      if (!inst || !inst.bars) throw new Error("NOT_AVAILABLE");
      return { inst: inst, generatedAt: doc2.generatedAt };
    });
  }
  /* Identitaet nur ueber core/identity.js (ADR-001). */
  function loadWeekly(ticker) { return fetchJSON(M.LONG_DIR + global.VUCore.Identity.securityIdForTicker(ticker) + ".json"); }

  /* Engines fuer das Chart Studio: erst bei Bedarf, in Abhaengigkeitsreihenfolge. */
  var ENGINE_SCRIPTS = ["/quant/engines/hash.js", "/quant/engines/technical/feature-store.js", "/quant/engines/technical/pivot-engine.js",
    "/quant/engines/technical/elliott/patterns.js", "/quant/engines/technical/elliott/elliott-v2.js", "/quant/engines/technical/canonical-bars.js",
    "/quant/engines/technical/ti/context.js", "/quant/engines/technical/ti/chart-patterns.js", "/quant/engines/technical/ti/levels.js",
    "/quant/engines/technical/indicators.js", "/quant/engines/technical/formations.js"];
  var enginesReady = null;
  function loadEngines() {
    if (enginesReady) return enginesReady;
    enginesReady = ENGINE_SCRIPTS.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (ok, fail) {
          var s = doc.createElement("script"); s.src = src; s.async = false;
          s.onload = ok; s.onerror = function () { fail(new Error("ENGINE_LOAD:" + src)); };
          doc.head.appendChild(s);
        });
      });
    }, Promise.resolve());
    return enginesReady;
  }

  function store() { try { return global.localStorage; } catch (e) { return null; } }
  function lastTicker() { try { return (store() && store().getItem(M.LAST_KEY)) || null; } catch (e) { return null; } }
  function rememberTicker(t) { try { store() && store().setItem(M.LAST_KEY, t); } catch (e) { /* privat */ } }

  /* ------------------------------------------------------- Bausteine */
  function searchBox(entries, placeholder) {
    var input = el("input", { class: "tc-input", type: "search", placeholder: placeholder || "Aktie, Kürzel oder Setup suchen …", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
      role: "combobox", "aria-expanded": "false", "aria-controls": "tc-results", "aria-autocomplete": "list", "aria-label": "Aktie suchen" });
    var list = el("ul", { id: "tc-results", class: "tc-results", role: "listbox", hidden: true });
    var hits = [], active = -1;
    function go(t) { location.hash = M.chartHref(t); }
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; }
    function paint() {
      hits = M.search(entries, input.value, 8);
      put(list, hits.map(function (h, i) {
        return el("li", { role: "option", id: "tc-hit-" + i, "aria-selected": "false", onmousedown: function (ev) { ev.preventDefault(); go(h.s); } }, [el("b", { text: h.s }), el("span", { text: h.n || "" })]);
      }));
      list.hidden = !hits.length; input.setAttribute("aria-expanded", String(!!hits.length)); active = -1;
    }
    input.addEventListener("input", paint);
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault(); if (!hits.length) return;
        active = (active + (ev.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
        [].forEach.call(list.children, function (li, k) { li.classList.toggle("is-active", k === active); li.setAttribute("aria-selected", String(k === active)); });
        input.setAttribute("aria-activedescendant", "tc-hit-" + active);
      } else if (ev.key === "Enter") {
        var t = active >= 0 ? hits[active] : hits[0];
        if (t) go(t.s); else if (/^[A-Za-z0-9.-]{1,12}$/.test(input.value.trim())) go(input.value.trim().toUpperCase());
      } else if (ev.key === "Escape") close();
    });
    return el("div", { class: "tc-search", role: "search" }, [glyph("search", "tc-search-icon"), input, list]);
  }

  function shareBar(count, total) {
    var share = total ? Math.min(1, count / total) : 0;
    return el("span", { class: "tc-share", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.max(3, Math.round(share * 100)) + "%" })]);
  }
  function rowCard(href, icon, title, sub, count, total) {
    return el("a", { class: "tc-row", href: href }, [
      el("span", { class: "tc-row-icon" }, glyph(icon)),
      el("span", { class: "tc-row-text" }, [el("b", { text: title }), el("span", { text: sub })]),
      shareBar(count, total),
      el("strong", { class: "tc-row-count num", text: isNum(count) ? count.toLocaleString("de-DE") : "–", title: total ? (Math.round(count / total * 1000) / 10).toLocaleString("de-DE") + " % des Universums" : null }),
      glyph("chevron", "tc-chev")
    ]);
  }
  function sectionHead(title, href, linkText) {
    return el("div", { class: "tc-sec-head" }, [el("h2", { text: title }), href ? el("a", { href: href, class: "tc-more" }, [linkText || "Alle", glyph("chevron", "tc-chev-s")]) : null]);
  }
  function tabs(items, active) {
    return el("nav", { class: "tc-tabs", "aria-label": "Ansicht" }, items.map(function (t) {
      return el("a", { href: t[1], class: "tc-tab" + (t[0] === active ? " is-on" : ""), "aria-current": t[0] === active ? "page" : null, text: t[2] });
    }));
  }
  function disclaimer(meta) {
    return el("p", { class: "tc-disclaimer" }, ["Signale werden regelbasiert erkannt – keine Handlungsempfehlung. ",
      meta && meta.asOf ? "Kursstand " + M.dateDe(meta.asOf) + ". " : "", el("a", { href: "#/methodik", text: "Methodik" })]);
  }
  function stateBox(title, text, action) {
    return el("div", { class: "tc-state", role: "status" }, [el("b", { text: title }), el("p", { text: text }), action || null]);
  }

  /* ------------------------------------------------------------- Start */
  var PRESET_ICON = { breakout: "breakout", trend: "trend", triangles: "triangle", high52: "trophy", aboveSma200: "bars", high200w: "trophy", contraction: "contraction", bullflag: "flag" };

  function viewHome(main) {
    var hero = el("section", { class: "tc-hero vu-product-hero vu-hero-fidelity", "data-product": "technical", "aria-labelledby": "tc-hero-h" }, [
      el("div", { class: "vu-hero-scene", "aria-hidden": "true" }),
      el("span", { class: "vu-product-icon vu-product-icon--hero", "aria-hidden": "true" }, productIcon()),
      el("p", { class: "vu-hero-name", text: "Technical" }),
      el("h1", { class: "vu-hero-headline", id: "tc-hero-h", text: "Charts verstehen – Setups erkennen." }),
      el("p", { class: "vu-hero-description", text: "Automatische Chartanalyse, technische Indikatoren und Mustererkennung für US-Aktien – regelbasiert und nachvollziehbar." })
    ]);
    var searchSlot = el("div", { class: "tc-search-slot" }), chips = el("div", { class: "tc-chips", role: "list" });
    var kpis = el("ul", { class: "tc-kpis", "aria-label": "Datenumfang" }), focus = el("div", { class: "tc-list" }), ranks = el("div", { class: "tc-list" });
    put(main, [hero, searchSlot, chips, kpis, sectionHead("Setups im Fokus", "#/screener"), focus, sectionHead("Technische Ranglisten", "#/screener"), ranks, el("div", { class: "tc-foot-slot" })]);
    hero.append(searchSlot, chips);
    loadIndex().then(function (X) {
      var ix = X.index;
      put(searchSlot, searchBox(X.entries));
      put(chips, ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN"].filter(X.has).map(function (t) {
        return el("a", { class: "tc-chip", role: "listitem", href: M.chartHref(t) }, [el("b", { text: t }), el("span", { text: shortName(X.name(t)) })]);
      }));
      var asOf = X.meta && X.meta.asOf || ix.asOf;
      put(kpis, [
        el("li", {}, [el("b", { class: "num", text: ix.count.toLocaleString("de-DE") }), el("span", { text: "Aktien im Kursuniversum" })]),
        el("li", {}, [el("b", { class: "num", text: ix.focusUnion.toLocaleString("de-DE") }), el("span", { text: "Setups im Fokus" })]),
        el("li", {}, [el("b", { class: "num", text: asOf ? M.dateDe(asOf).slice(0, 6) : "–" }), el("span", { text: "Stand der Signale" })])
      ]);
      function card(id) { var p = Q.PRESETS.filter(function (x) { return x.id === id; })[0]; return rowCard("#/screener?preset=" + id, PRESET_ICON[id], p.title, p.description, ix.presets[id] || 0, ix.count); }
      put(focus, M.FOCUS.map(card));
      put(ranks, M.RANKS.map(card));
      main.querySelector(".tc-foot-slot").replaceWith(disclaimer(X.meta));
    }).catch(function () {
      put(searchSlot, stateBox("Daten derzeit nicht verfügbar", "Der Screener-Datensatz konnte nicht geladen werden. Das Chart Studio ist über die Adresse #/chart/<Kürzel> weiter erreichbar."));
    });
  }
  function shortName(n) { return String(n || "").replace(/,? (Inc\.?|Corp(oration)?\.?|Co\.|Ltd\.?|plc|Holdings?|Class [A-C]|N\.V\.|S\.A\.)\b.*$/i, "").slice(0, 18); }

  /* ---------------------------------------------------------- Screener */
  /* Suchfeld "Suche in Worten": Vorschau beim Tippen (erkannt, nicht erkannt, Fehler), Ausfuehren ueber die Adresse #/screener?q=… */
  var EXAMPLES = ["Dreieck über der SMA 200 mit steigendem Volumen", "Bestätigter Ausbruch mit Volumenspitze und RSI unter 75", "Doppelboden oder Keil über der 50-Tage-Linie"];
  function textSearch(textQ, parsed) {
    if (!QT) return null;
    var input = el("input", { class: "tc-input", type: "search", maxlength: "300", value: textQ || "", placeholder: "z. B. " + EXAMPLES[0], "aria-label": "Setup in Worten beschreiben", "aria-describedby": "tc-ts-preview", autocomplete: "off" });
    var preview = el("div", { class: "tc-ts-preview", id: "tc-ts-preview", "aria-live": "polite" });
    function paint(r) {
      if (!r) { put(preview, el("div", { class: "tc-examples" }, [el("span", { class: "tc-note", text: "Beispiele" })].concat(EXAMPLES.map(function (x) { return el("button", { type: "button", class: "tc-linkbtn", text: x, onclick: function () { input.value = x; paint(QT.parse(x)); input.focus(); } }); })))); return; }
      var kids = [];
      if (r.recognized.length) kids.push(el("div", { class: "tc-ts-row" }, [el("span", { text: "Erkannt" })].concat(r.recognized.map(function (t) { return el("span", { class: "tc-mini is-ok", text: t }); }))));
      if (r.unknown.length) kids.push(el("div", { class: "tc-ts-row" }, [el("span", { text: "Nicht erkannt" })].concat(r.unknown.map(function (t) { return el("span", { class: "tc-mini is-warn", text: t }); }))));
      r.errors.filter(function (e) { return e.code !== "EMPTY"; }).forEach(function (e) { kids.push(el("p", { class: "tc-note is-warn", text: ERROR_TEXT[e.code] ? ERROR_TEXT[e.code](e.text) : e.code + (e.text ? ": " + e.text : "") })); });
      if (r.query.groups.length) kids.push(el("p", { class: "tc-note" }, ["Abfrage: ", el("code", { text: r.canonical || "–" })]));
      put(preview, kids);
    }
    var timer = null;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { paint(input.value.trim() ? QT.parse(input.value) : null); }, 120); });
    paint(parsed);
    return el("form", { class: "tc-textsearch", role: "search", onsubmit: function (ev) { ev.preventDefault(); var v = input.value.trim(); location.hash = "#/screener" + (v ? "?q=" + encodeURIComponent(v) : ""); } }, [
      el("label", { class: "tc-ts-label", for: "tc-ts-input" }, [glyph("search"), el("b", { text: "Suche in Worten" }), el("em", { text: "regelbasiert" })]),
      el("div", { class: "tc-ts-field" }, [Object.assign(input, { id: "tc-ts-input" }), el("button", { class: "tc-btn", type: "submit", text: "Suchen" })]),
      preview,
      el("p", { class: "tc-note", text: "Übersetzt Fachbegriffe, Kennzahlen mit Vergleich (z. B. „RSI unter 40“) und Formationen in die validierte Abfrage. Nicht Erkanntes wird angezeigt, nicht geraten. Eine Übersetzung durch ein Sprachmodell ist vorbereitet, aber nicht aktiv." })
    ]);
  }
  /* Filter-Baukasten: jede Kombination aus dem Feldkatalog, Gruppen ODER, Zeilen UND; Ausfuehren ueber #/screener?q=<kanonisch>. */
  var OP_LABEL = { gt: "über", gte: "mindestens", lt: "unter", lte: "höchstens", between: "zwischen", is: "ist", in: "eines von" };
  function builderCard(initial, open) {
    var b = JSON.parse(JSON.stringify(initial)), host = el("div", { class: "tc-builder-body" }), msg = el("p", { class: "tc-note", role: "status" });
    function fieldsFor(tf) { return Q.FIELDS.filter(function (f) { return f.tfs.indexOf(tf) >= 0; }); }
    function fieldSelect(row, onchange) {
      var groups = {}, order = [];
      fieldsFor(b.tf).forEach(function (f) { if (!groups[f.group]) { groups[f.group] = []; order.push(f.group); } groups[f.group].push(f); });
      return el("select", { class: "tc-select", "aria-label": "Feld", onchange: onchange }, order.map(function (g) {
        return el("optgroup", { label: g }, groups[g].map(function (f) { return el("option", { value: f.id, text: Q.labelOf(f, b.tf), selected: f.id === row.field }); }));
      }));
    }
    function valueInput(row, key, label) {
      return el("input", { class: "tc-input tc-input-s tc-num-in", inputmode: "decimal", value: M.formatFieldInput(row.field, row[key]), "aria-label": label,
        onchange: function (ev) { row[key] = M.parseFieldInput(row.field, ev.target.value); } });
    }
    function rowView(row, gi, ri) {
      var f = Q.field(row.field), kids = [fieldSelect(row, function (ev) { b.groups[gi][ri] = M.defaultRow(ev.target.value); paint(); })];
      if (f.kind === "bool") kids.push(el("select", { class: "tc-select", "aria-label": "Wert", onchange: function (ev) { row.value = ev.target.value === "1"; } },
        [el("option", { value: "1", text: "ja", selected: row.value === true }), el("option", { value: "0", text: "nein", selected: row.value === false })]));
      else if (f.kind === "enum") {
        var sum = el("span", {});
        var paintSum = function () { sum.textContent = row.value.length ? row.value.map(function (k) { return f.values[k]; }).join(", ") : "nichts gewählt"; };
        paintSum();
        kids.push(el("details", { class: "tc-enum-pick" }, [el("summary", {}, [el("b", { text: row.value.length + " von " + Object.keys(f.values).length + ": " }), sum]),
          el("div", { class: "tc-enum", role: "group", "aria-label": Q.labelOf(f, b.tf) }, Object.keys(f.values).map(function (k) {
            return el("label", { class: "tc-check" }, [el("input", { type: "checkbox", checked: row.value.indexOf(k) >= 0, onchange: function (ev) {
              var i = row.value.indexOf(k); if (ev.target.checked && i < 0) row.value.push(k); if (!ev.target.checked && i >= 0) row.value.splice(i, 1);
              ev.target.closest("details").querySelector("summary b").textContent = row.value.length + " von " + Object.keys(f.values).length + ": "; paintSum(); } }), f.values[k]]);
          }))]));
      }
      else {
        kids.push(el("select", { class: "tc-select", "aria-label": "Vergleich", onchange: function (ev) { row.op = ev.target.value; if (row.op === "between" && !isNum(row.value2)) row.value2 = row.value; paint(); } },
          Q.opsFor(f.kind).map(function (o) { return el("option", { value: o, text: OP_LABEL[o], selected: row.op === o }); })));
        kids.push(valueInput(row, "value", "Wert"));
        if (row.op === "between") kids.push(el("span", { text: "und" }), valueInput(row, "value2", "Obergrenze"));
        if (f.kind === "pct") kids.push(el("span", { class: "tc-unit", text: "%" }));
      }
      kids.push(el("button", { type: "button", class: "tc-icon-btn", "aria-label": "Bedingung entfernen", onclick: function () { b.groups[gi].splice(ri, 1); if (!b.groups[gi].length && b.groups.length > 1) b.groups.splice(gi, 1); paint(); } }, "×"));
      return el("div", { class: "tc-brow" }, kids);
    }
    function paint() {
      var tfSel = el("div", { class: "tc-seg", role: "radiogroup", "aria-label": "Zeitrahmen des Baukastens" }, Object.keys(Q.TIMEFRAMES).map(function (k) {
        return el("button", { type: "button", role: "radio", "aria-checked": String(b.tf === k), class: "tc-seg-b" + (b.tf === k ? " is-on" : ""), text: Q.TIMEFRAMES[k], onclick: function () {
          b.tf = k; var ok = fieldsFor(k).map(function (f) { return f.id; }), dropped = 0;
          b.groups = b.groups.map(function (g) { return g.filter(function (r) { var keep = ok.indexOf(r.field) >= 0; if (!keep) dropped++; return keep; }); });
          msg.textContent = dropped ? dropped + " Bedingung(en) gibt es nur im Tageschart und wurden entfernt." : ""; paint(); } });
      }));
      put(host, [el("div", { class: "tc-brow tc-brow-tf" }, [el("span", { text: "Zeitrahmen" }), tfSel])].concat(b.groups.map(function (g, gi) {
        return el("fieldset", { class: "tc-bgroup" }, [el("legend", { text: gi ? "oder: alle Bedingungen dieser Gruppe" : "Alle Bedingungen dieser Gruppe" })]
          .concat(g.map(function (r, ri) { return rowView(r, gi, ri); }))
          .concat([el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "+ Bedingung", onclick: function () { g.push(M.defaultRow(fieldsFor(b.tf)[0].id)); paint(); } })]));
      }), [el("div", { class: "tc-brow" }, [
        el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "+ Oder-Gruppe", onclick: function () { b.groups.push([M.defaultRow(fieldsFor(b.tf)[0].id)]); paint(); } }),
        el("button", { type: "button", class: "tc-btn", text: "Anwenden", onclick: apply })]), msg]));
    }
    function apply() {
      var q = M.queryFromBuilder(b), v = Q.validate(q);
      if (!q.groups.length) { msg.textContent = "Bitte mindestens eine Bedingung wählen."; return; }
      if (!v.ok) { msg.textContent = "Nicht auswertbar: " + v.errors.map(function (e) { return ERROR_TEXT[e.code] ? ERROR_TEXT[e.code](e.path) : e.code; }).join(", ") + " – bitte Werte prüfen."; return; }
      location.hash = "#/screener?q=" + encodeURIComponent(QT.toText(v.query));
    }
    paint();
    return el("details", { class: "tc-filter tc-builder", open: open ? true : null }, [
      el("summary", {}, [el("span", { class: "tc-row-icon" }, glyph("bars")), el("b", { text: "Filter-Baukasten: beliebige Indikatoren kombinieren" }), glyph("chevron", "tc-chev tc-rot")]),
      el("div", { class: "tc-filter-body" }, [el("p", { class: "tc-note", text: "Jede Kennzahl aus dem Katalog mit Vergleich oder Ja/Nein. Bedingungen einer Gruppe gelten gemeinsam, Gruppen alternativ. Wochen- und Monatswerte nur für Felder, die es dort gibt." }), host])
    ]);
  }

  var ERROR_TEXT = {
    FIELD_NOT_AVAILABLE_FOR_TIMEFRAME: function (t) { return "„" + t + "“ gibt es nur im Tageschart und wurde weggelassen."; },
    CONFIRMED_WITHOUT_FORMATION: function () { return "„bestätigt“ bezieht sich auf eine Formation – bitte eine nennen."; },
    UNKNOWN_FORMATION: function (t) { return "Unbekannte Formation: " + t; },
    INVALID_VALUE2: function (t) { return "Bei „zwischen“ muss die erste Zahl kleiner sein (" + t + ")."; },
    TOO_MANY_GROUPS: function () { return "Höchstens " + Q.MAX_GROUPS + " „oder“-Teile."; },
    TOO_MANY_FILTERS: function () { return "Höchstens " + Q.MAX_FILTERS + " Bedingungen."; }
  };

  function viewScreener(main, route) {
    var p = route.params || {}, presetId = p.preset, preset = presetId && Q.PRESETS.filter(function (x) { return x.id === presetId; })[0];
    var st = M.stateFromParams(p);
    /* Suche in Worten: regelbasiert uebersetzt (query-text.js), gerechnet wird dieselbe validierte Abfrage. */
    var textQ = !preset && typeof p.q === "string" && p.q.trim() ? p.q.trim().slice(0, 300) : null;
    var parsed = textQ && QT ? QT.parse(textQ) : null;
    var head = el("header", { class: "tc-head" }, [
      el("a", { class: "tc-back", href: "#/" }, [glyph("back"), "Technical"]),
      el("h1", { class: "tc-title", text: "Screener" }),
      el("p", { class: "tc-lead", text: "Setups, Indikatoren und Chartmuster regelbasiert filtern." })
    ]);
    var tabBar = tabs([["home", "#/", "Überblick"], ["build", "#/screener", "Screener"], ["saved", "#/screener/gespeichert", "Gespeichert"], ["method", "#/methodik", "Methodik"]], route.tab);
    if (route.tab === "saved") return viewSaved(main, head, tabBar);
    var body = el("div", { class: "tc-screener" }), results = el("section", { class: "tc-results-sec", id: "tc-treffer", "aria-live": "polite" });
    put(main, [head, tabBar, body, results]);

    function go(next) { location.hash = "#/screener" + (next ? "?" + next : ""); }
    function toggle(list, id) { var i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id); }
    function pill(label, on, onclick, extra) { return el("button", { type: "button", class: "tc-pill" + (on ? " is-on" : "") + (extra ? " " + extra : ""), "aria-pressed": String(!!on), onclick: onclick, text: label }); }
    function card(icon, title, kids, open) {
      return el("details", { class: "tc-filter", open: open === false ? null : true }, [
        el("summary", {}, [el("span", { class: "tc-row-icon" }, glyph(icon)), el("b", { text: title }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, kids)
      ]);
    }

    loadScreener().then(function (D) {
      var ds = D.ds, built = preset ? { query: Object.assign({ limit: 200 }, preset.query), dropped: [] }
        : parsed ? { query: Object.assign({}, parsed.query, { limit: 200 }), dropped: [] } : M.queryFromState(st);
      var res = Q.evaluate(ds, built.query);
      if (res.error) { put(body, stateBox("Ungültige Abfrage", res.errors.map(function (e) { return e.code; }).join(", "))); return; }
      var tf = built.query.timeframe;
      var controls = [textSearch(textQ, parsed), QT ? builderCard(parsed && parsed.query.groups.length ? M.builderFromQuery(parsed.query) : { tf: st.tf, groups: [[M.defaultRow("aboveSma200")]] }, !!parsed) : null];
      if (parsed) {
        controls.push(el("div", { class: "tc-preset" }, [el("b", { text: "Erkannt als" }), el("p", { text: Q.describe(built.query) || "Keine auswertbare Bedingung" }),
          el("a", { class: "tc-link", href: "#/screener", text: "Filter per Klick setzen" })]));
      } else if (preset) {
        controls.push(el("div", { class: "tc-preset" }, [el("b", { text: preset.title }), el("p", { text: Q.describe(preset.query) }),
          el("a", { class: "tc-link", href: "#/screener", text: "Eigene Filter setzen" })]));
      } else {
        controls.push(card("triangle", "Chartmuster", [
          el("div", { class: "tc-pills" }, M.PATTERN_PILLS.map(function (pp) { return pill(pp.label, st.patterns.indexOf(pp.id) >= 0, function () { toggle(st.patterns, pp.id); go(M.paramsFromState(st)); }); })),
          el("label", { class: "tc-check" }, [el("input", { type: "checkbox", checked: st.confirmed, onchange: function (ev) { st.confirmed = ev.target.checked; go(M.paramsFromState(st)); } }), "Nur bestätigte Formationen"])
        ]));
        controls.push(card("bars", "Trendfilter", [el("div", { class: "tc-pills" }, M.TREND_PILLS.map(function (tp) {
          return pill(M.trendLabel(tp, st.tf), st.trends.indexOf(tp.id) >= 0, function () { toggle(st.trends, tp.id); go(M.paramsFromState(st)); });
        }))]));
        controls.push(card("clock", "Zeitrahmen", [el("div", { class: "tc-seg", role: "radiogroup", "aria-label": "Zeitrahmen" }, Object.keys(Q.TIMEFRAMES).map(function (k) {
          return el("button", { type: "button", role: "radio", "aria-checked": String(st.tf === k), class: "tc-seg-b" + (st.tf === k ? " is-on" : ""), text: Q.TIMEFRAMES[k], onclick: function () { st.tf = k; go(M.paramsFromState(st)); } });
        }))]));
        var rsiInput = el("input", { type: "number", min: "1", max: "99", step: "1", class: "tc-num", value: isNum(st.rsiMax) ? st.rsiMax : 60, "aria-label": "RSI-Grenzwert",
          onchange: function (ev) { var v = Number(ev.target.value); if (v > 0 && v < 100) { st.rsiMax = v; go(M.paramsFromState(st)); } } });
        controls.push(el("div", { class: "tc-toggles" }, [
          el("label", { class: "tc-toggle" }, [el("span", { class: "tc-row-icon" }, glyph("bars")), el("span", { text: "Volumen über Durchschnitt" }),
            el("input", { type: "checkbox", role: "switch", checked: st.vol, onchange: function (ev) { st.vol = ev.target.checked; go(M.paramsFromState(st)); } })]),
          el("label", { class: "tc-toggle" }, [el("span", { class: "tc-row-icon" }, glyph("pulse")), el("span", {}, ["RSI unter ", rsiInput]),
            el("input", { type: "checkbox", role: "switch", checked: isNum(st.rsiMax), onchange: function (ev) { st.rsiMax = ev.target.checked ? Number(rsiInput.value) || 60 : null; go(M.paramsFromState(st)); } })])
        ]));
        controls.push(el("div", { class: "tc-logic" }, [el("span", { text: "Verknüpfung" }), el("div", { class: "tc-seg", role: "radiogroup", "aria-label": "Verknüpfung der Bedingungen" }, [["AND", "Alle Bedingungen"], ["OR", "Mindestens eine"]].map(function (o) {
          return el("button", { type: "button", role: "radio", "aria-checked": String(st.logic === o[0]), class: "tc-seg-b" + (st.logic === o[0] ? " is-on" : ""), text: o[1], onclick: function () { st.logic = o[0]; go(M.paramsFromState(st)); } });
        }))]));
        if (built.dropped.length) controls.push(el("p", { class: "tc-note", text: "Nur im Tageschart verfügbar und deshalb nicht angewendet: " + built.dropped.join(", ") + "." }));
      }
      controls.push(el("a", { class: "tc-cta", href: "#/screener" + (location.hash.split("?")[1] ? "?" + location.hash.split("?")[1] : ""), onclick: function (ev) { ev.preventDefault(); results.scrollIntoView({ behavior: "smooth", block: "start" }); } },
        [res.count.toLocaleString("de-DE") + " Treffer anzeigen", el("span", { "aria-hidden": "true", text: " →" })]));
      put(body, controls);
      renderResults(D, res, built.query, preset);
    }).catch(function (e) {
      put(body, stateBox("Daten derzeit nicht verfügbar", "Der Screener-Datensatz konnte nicht geladen werden (" + String(e && e.message || e) + ")."));
    });

    function renderResults(D, res, query, preset) {
      var ds = D.ds, cols = ds.cols, sortField = query.sort && query.sort.field;
      var sortSel = el("select", { class: "tc-select", "aria-label": "Sortieren", onchange: function (ev) { st.sort = ev.target.value; go(M.paramsFromState(st)); }, disabled: preset || parsed ? true : null }, [
        el("option", { value: "", text: "Erfüllte Bedingungen", selected: !st.sort && !sortField })
      ].concat(["relVol", "rs6m", "distHigh52w", "distSma200", "adx", "rsi14", "chg1d"].filter(function (id) { return Q.field(id).tfs.indexOf(query.timeframe) >= 0; }).map(function (id) {
        return el("option", { value: id, text: Q.labelOf(Q.field(id), query.timeframe), selected: (preset || parsed ? sortField : st.sort) === id });
      })));
      var list = el("div", { class: "tc-hits" });
      var total = query.groups.reduce(function (a, g) { return a + g.filters.length; }, 0), wanted = M.wantedFormations(query);
      res.indices.slice(0, 60).forEach(function (i) {
        var row = ds.row(i), chips = M.matchedChips(row, query);
        var right = sortField ? [el("span", { text: Q.labelOf(Q.field(sortField), query.timeframe) }), el("b", { class: "num", text: valueText(sortField, row[Q.columnKey(sortField, query.timeframe)]) })]
          : [el("span", { text: "Bedingungen" }), el("b", { class: "num", text: total ? Math.min(total, res.matched[i]) + "/" + total : "–" })];
        var flags = [];
        if (!row.fresh) flags.push(el("span", { class: "tc-flag", text: "Kurs vom " + M.dateDe(row.asOf) }));
        if (!row.hasVolume) flags.push(el("span", { class: "tc-flag", text: "ohne Volumen" }));
        if (row.suspectJumpAt) flags.push(el("span", { class: "tc-flag", title: "Schlussfaktor mit Split-Signatur oder außerhalb 0,2–5: möglicher nicht nachgezogener Split", text: "Kurssprung prüfen (" + M.dateDe(row.suspectJumpAt) + ")" }));
        list.append(el("a", { class: "tc-hit", href: M.chartHref(row.s) }, [
          el("div", { class: "tc-hit-top" }, [
            el("span", { class: "tc-hit-id" }, [el("b", { text: row.s }), el("span", { text: shortName(row.n) })]),
            el("span", { class: "tc-hit-px num" }, [M.price(row.close), el("em", { class: row.chg1d >= 0 ? "is-up" : "is-down", text: (row.chg1d >= 0 ? "▲ " : "▼ ") + M.pct(row.chg1d) })]),
            el("span", { class: "tc-hit-spark", html: Chart.sparkline(row.spark || []) }),
            el("span", { class: "tc-hit-score" }, right),
            glyph("chevron", "tc-chev")
          ]),
          chips.length ? el("div", { class: "tc-hit-chips" }, chips.map(function (c) { return el("span", { class: "tc-mini", text: c }); })) : null,
          el("p", { class: "tc-hit-text" }, [M.hitSentence(row, wanted)].concat(flags))
        ]));
      });
      var funnel = el("details", { class: "tc-funnel" }, [el("summary", { text: "Wie die Treffer entstehen" }),
        el("ol", {}, res.funnel.map(function (f) {
          return el("li", {}, [el("span", { text: f.label }), el("b", { class: "num", text: f.count.toLocaleString("de-DE") }),
            f.missing ? el("em", { text: f.missing.toLocaleString("de-DE") + " ohne Wert" }) : null]);
        })),
        el("p", { class: "tc-note", text: "Strukturierte Abfrage (validiert, deterministisch ausgewertet):" }),
        el("pre", { class: "tc-json", text: JSON.stringify(query, null, 1) })]);
      var saveName = el("input", { class: "tc-input tc-input-s", type: "text", maxlength: "60", placeholder: "Name der Suchstrategie", "aria-label": "Name der Suchstrategie" });
      var saveMsg = el("span", { class: "tc-note", role: "status" });
      var save = el("details", { class: "tc-save" }, [
        el("summary", {}, [el("span", { class: "tc-row-icon" }, glyph("save")), el("span", {}, [el("b", { text: "Suchstrategie speichern" }), el("span", { text: "Aktuelle Filter in diesem Browser sichern." })]), glyph("chevron", "tc-chev")]),
        el("form", { class: "tc-save-form", onsubmit: function (ev) {
          ev.preventDefault();
          var name = saveName.value.trim() || (preset ? preset.title : Q.describe(query)).slice(0, 60);
          var r = M.saveScreen(store(), name, preset ? "preset=" + preset.id : textQ ? "q=" + encodeURIComponent(textQ) : M.paramsFromState(st));
          saveMsg.textContent = r.ok ? "Gespeichert. Zu finden unter „Gespeichert“." : "Speichern nicht möglich (Browser-Speicher gesperrt).";
        } }, [saveName, el("button", { class: "tc-btn", type: "submit", text: "Speichern" }), saveMsg])
      ]);
      put(results, [el("div", { class: "tc-sec-head" }, [el("h2", { text: "Treffer" }), el("label", { class: "tc-sort" }, ["Sortieren: ", sortSel])]),
        res.count ? list : stateBox("Keine Treffer", "Keine Aktie erfüllt diese Bedingungen. Weniger Filter oder „Mindestens eine“ erweitern die Auswahl."),
        res.count > 60 ? el("p", { class: "tc-note", text: "Gezeigt: 60 von " + res.count.toLocaleString("de-DE") + " Treffern." }) : null,
        funnel, save, disclaimer(D.meta)]);
    }
  }
  function valueText(field, v) {
    var f = Q.field(field);
    if (typeof v === "boolean") return v ? "ja" : "nein";
    return f.kind === "pct" ? M.pct(v, 1) : M.num(v, field === "relVol" ? 2 : 1);
  }

  /** Abfrage einer gespeicherten Filteradresse (Vorlage, Suche in Worten oder Schnellfilter) - dieselben Wege wie der Screener. */
  function queryOfParams(params) {
    var r = M.parseRoute("#/screener?" + params), p = r.params || {};
    var preset = p.preset && Q.PRESETS.filter(function (x) { return x.id === p.preset; })[0];
    if (preset) return preset.query;
    if (p.q && QT) return QT.parse(p.q).query;
    return M.queryFromState(M.stateFromParams(p)).query;
  }
  function viewSaved(main, head, tabBar) {
    var list = M.loadScreens(store()), status = el("p", { class: "tc-note", role: "status" });
    var fileIn = el("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      f.text().then(function (txt) { var r = M.importScreens(store(), txt); status.textContent = r.ok ? r.added + " übernommen, " + r.skipped + " übersprungen (doppelt, ungültig oder Liste voll)." : "Import nicht möglich (" + r.error + ")."; if (r.ok && r.added) render(); });
    } });
    var tools = el("div", { class: "tc-brow" }, [
      el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "Exportieren (JSON)", disabled: list.length ? null : true, onclick: function () {
        var a = el("a", { href: URL.createObjectURL(new Blob([M.exportScreens(store())], { type: "application/json" })), download: "technical-suchstrategien.json" }); doc.body.append(a); a.click(); a.remove();
      } }),
      el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "Importieren", onclick: function () { fileIn.click(); } }), fileIn]);
    var rows = list.map(function (sv) {
      var q = queryOfParams(sv.params), desc = Q.describe(q) || "–", count = el("b", { class: "num", text: "…" });
      var nameIn = el("input", { class: "tc-input tc-input-s", value: sv.name, maxlength: "60", "aria-label": "Name ändern" });
      var edit = el("form", { class: "tc-brow", hidden: true, onsubmit: function (ev) { ev.preventDefault(); M.updateScreen(store(), sv.id, { name: nameIn.value }); render(); } },
        [nameIn, el("button", { class: "tc-btn", type: "submit", text: "Übernehmen" })]);
      loadScreener().then(function (D) { var r = Q.evaluate(D.ds, Object.assign({}, q, { limit: 1 })); count.textContent = r.error ? "–" : r.count.toLocaleString("de-DE"); }).catch(function () { count.textContent = "–"; });
      return el("div", { class: "tc-saved" }, [
        el("div", { class: "tc-row" }, [el("span", { class: "tc-row-icon" }, glyph("save")),
          el("a", { class: "tc-row-text", href: "#/screener?" + sv.params }, [el("b", { text: sv.name }), el("span", { text: desc })]),
          el("span", { class: "tc-hit-score" }, [el("span", { text: "Treffer heute" }), count])]),
        el("div", { class: "tc-brow tc-saved-actions" }, [
          el("span", { class: "tc-note", text: (sv.updatedAt ? "Geändert am " + M.dateDe(sv.updatedAt.slice(0, 10)) : "Gespeichert am " + M.dateDe(sv.createdAt.slice(0, 10))) }),
          el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "Umbenennen", onclick: function () { edit.hidden = !edit.hidden; if (!edit.hidden) nameIn.focus(); } }),
          el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "Link kopieren", onclick: function () {
            var url = location.origin + location.pathname + "#/screener?" + sv.params;
            (global.navigator && navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { status.textContent = "Link kopiert."; }, function () { status.textContent = url; });
          } }),
          el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "Löschen", onclick: function () { M.deleteScreen(store(), sv.id); render(); } })]),
        edit]);
    });
    var body = list.length ? el("div", { class: "tc-list" }, rows) : stateBox("Noch keine Suchstrategie gespeichert", "Im Screener Filter wählen und „Suchstrategie speichern“ nutzen. Gespeichert wird nur in diesem Browser; über „Importieren“ lassen sich exportierte Strategien übernehmen.");
    put(main, [head, tabBar, tools, status, body]);
  }

  /* ------------------------------------------------------- Chart Studio */
  /* Schichten im Kurs (beliebig kombinierbar) und Unterfenster (eines zur Zeit). */
  var LAYERS = [["trend", "Trendlinien"], ["muster", "Muster"], ["niveaus", "Niveaus"], ["sma", "SMA 50/200"], ["ema", "EMA 20/50/200"], ["bb", "Bollinger"],
    ["keltner", "Keltner"], ["donchian", "Donchian"], ["ichimoku", "Ichimoku"], ["supertrend", "Supertrend"], ["psar", "Parabolic SAR"], ["vwma", "VWMA 20"], ["volumen", "Volumen"]];
  var PANE_LIST = [["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stochastik"], ["adx", "ADX"], ["atr", "ATR"], ["cci", "CCI"], ["williams", "Williams %R"], ["aroon", "Aroon"],
    ["mfi", "MFI"], ["obv", "OBV"], ["cmf", "CMF"]];
  var PANES = {};
  PANE_LIST.forEach(function (p) { PANES[p[0]] = 1; });
  var RANGES = [["1M", 21], ["3M", 63], ["6M", 126], ["1J", 252], ["5J", 260], ["Max", 0]];
  var studio = { layers: { trend: true, muster: true, niveaus: true, sma: true, volumen: true }, range: "1J", full: false };

  function viewChartPicker(main) {
    var head = el("header", { class: "tc-head" }, [el("a", { class: "tc-back", href: "#/" }, [glyph("back"), "Technical"]), el("h1", { class: "tc-title", text: "Chart Studio" }),
      el("p", { class: "tc-lead", text: "Aktie wählen: Trendlinien, Indikatoren, Niveaus und Formationen erscheinen automatisch." })]);
    var slot = el("div", { class: "tc-search-slot" });
    put(main, [head, slot]);
    var last = lastTicker();
    loadIndex().then(function (X) {
      put(slot, [searchBox(X.entries, "Aktie oder Kürzel …"),
        last ? el("p", { class: "tc-note" }, ["Zuletzt geöffnet: ", el("a", { href: M.chartHref(last), text: last })]) : null]);
    }).catch(function () { put(slot, stateBox("Suche nicht verfügbar", "Bitte das Kürzel direkt in der Adresse angeben: #/chart/NVDA")); });
  }

  function viewChart(main, route) {
    var T = route.ticker;
    if (!T) return viewChartPicker(main);
    rememberTicker(T);
    var titleName = el("span", { text: "" });
    var head = el("header", { class: "tc-head" }, [
      el("a", { class: "tc-back", href: "#/" }, [glyph("back"), el("span", {}, [titleName])]),
      el("p", { class: "tc-eyebrow", text: T }),
      el("h1", { class: "tc-title", text: "Chart Studio" }),
      el("p", { class: "tc-lead", text: "Automatische Trendlinien, Indikatoren und Signale im Kursverlauf." })
    ]);
    var tabBar = tabs([["chart", M.chartHref(T), "Chart"], ["signals", M.chartHref(T, "signals"), "Signale"]], route.tab);
    /* Wechsel in die anderen Welten: gemeinsamer Aktien-Navigator (core/stock-context.js, Verfuegbarkeit nur mit Nachweis). */
    var links = el("div", { class: "tc-snav" });
    try {
      var SN = global.VUStockNavigator, SCX = global.VUCore && global.VUCore.StockContext;
      if (SN && SCX) SN.mount(links, SCX.fromUs(T), "technical");
    } catch (e) { /* ungueltiges Kuerzel: kein Navigator */ }
    var body = el("div", { class: "tc-studio", "aria-busy": "true" }, [el("div", { class: "tc-skel", style: "height:360px" })]);
    put(main, [head, links, tabBar, body]);

    Promise.all([loadInstrument(T), loadEngines(), loadIndex().catch(function () { return null; })]).then(function (r) {
      var inst = r[0].inst, D = r[2], name = D ? D.name(T) : null;
      titleName.textContent = name ? shortName(name) : T;
      head.querySelector(".tc-eyebrow").textContent = T + (name ? " · " + shortName(name).toUpperCase() : "");
      doc.title = T + " · Chart Studio · Technical · Vision Universe®";
      var VT = global.VUTechnical, b = inst.bars, bundle = inst.bundle || {};
      var series = VT.CanonicalBars.fromRows(b.timestamps.map(function (d, i) { return { date: d, open: b.open[i], high: b.high[i], low: b.low[i], close: b.close[i], volume: b.volume[i] }; }),
        { instrumentId: T, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "technical-signals-v1" });
      var prep = VT.TIContext.prepare(series), t = series.length - 1;
      var analysis = VT.Formations.analyzeAt(prep, t), ctx = VT.TIContext.at(prep, t), levels = VT.TILevels.supportResistance(ctx);
      var fromIdx = Math.max(0, series.length - 252), hist = VT.Formations.history(prep, fromIdx, t);
      var S = { dates: b.timestamps, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      var ind = { ema20: VT.Indicators.compute(S, "ema", { period: 20 }).values, ema50: VT.Indicators.compute(S, "ema", { period: 50 }).values,
        bb: VT.Indicators.compute(S, "bollinger").values, rsi: VT.Indicators.compute(S, "rsi").values, macd: VT.Indicators.compute(S, "macd").values, stoch: VT.Indicators.compute(S, "stochastic").values };
      /* Weitere Katalog-Indikatoren; ohne Volumen liefert compute() einen Fehler und die Schicht bleibt leer. */
      ["keltner", "donchian", "ichimoku", "supertrend", "psar", "vwma", "adx", "atr", "cci", "williamsR", "aroon", "mfi", "obv", "cmf"].forEach(function (id) {
        var r2 = VT.Indicators.compute(S, id); ind[id] = r2.error ? null : r2.values;
      });
      var cs = bundle.chartSeries || {}, F = bundle.featuresAtCutoff || {};
      body.removeAttribute("aria-busy");
      if (route.tab === "signals") return renderSignals(body, analysis, F, b.close[t], levels, hist, inst, D);
      renderStudio(body, { T: T, S: S, cs: cs, ind: ind, analysis: analysis, levels: levels, F: F, inst: inst, hist: hist, D: D, focus: route.params && route.params.f || null });
    }).catch(function (e) {
      body.removeAttribute("aria-busy");
      put(body, stateBox("Kein technisches Chartbild für " + T, e && e.message === "NOT_AVAILABLE"
        ? "Für dieses Kürzel liegt keine ausreichend lange, geprüfte Tagesreihe vor (mindestens etwa ein Jahr Handel, gültiger Kalender)."
        : "Die Kursdaten konnten nicht geladen werden (" + String(e && e.message || e) + ").", el("a", { class: "tc-link", href: "#/chart", text: "Andere Aktie wählen" })));
    });
  }

  function renderStudio(body, X) {
    var S = X.S, n = S.close.length, last = n - 1, chg = S.close[last] / S.close[last - 1] - 1;
    var host = el("div", { class: "tc-chart-host" });
    var legend = el("div", { class: "tc-legend" });
    var expand = el("button", { type: "button", class: "tc-icon-btn", "aria-label": "Chart vergrößern", "aria-pressed": String(studio.full), onclick: function () { studio.full = !studio.full; card.classList.toggle("is-full", studio.full); expand.setAttribute("aria-pressed", String(studio.full)); chart && chart.redraw(); } }, glyph("expand"));
    var card = el("section", { class: "tc-card tc-chart-card" + (studio.full ? " is-full" : ""), "aria-label": "Kurschart" }, [
      el("div", { class: "tc-quote" }, [el("b", { text: X.T }), el("strong", { class: "num", text: M.price(S.close[last]) }), el("em", { class: chg >= 0 ? "is-up" : "is-down", text: (chg >= 0 ? "▲ " : "▼ ") + M.pct(chg) }), expand]),
      legend, host,
      el("div", { class: "tc-ranges", role: "radiogroup", "aria-label": "Zeitraum" }, RANGES.map(function (rg) {
        return el("button", { type: "button", role: "radio", class: "tc-range" + (studio.range === rg[0] ? " is-on" : ""), "aria-checked": String(studio.range === rg[0]), text: rg[0], onclick: function () { studio.range = rg[0]; renderStudio(body, X); } });
      }))
    ]);
    function layerPill(L) {
      return el("button", { type: "button", class: "tc-pill" + (studio.layers[L[0]] ? " is-on" : ""), "aria-pressed": String(!!studio.layers[L[0]]), text: L[1], onclick: function () {
        var on = !studio.layers[L[0]];
        if (PANES[L[0]] && on) Object.keys(PANES).forEach(function (k) { studio.layers[k] = false; });
        studio.layers[L[0]] = on; renderStudio(body, X);
      } });
    }
    var layerBar = el("div", { class: "tc-layer-groups" }, [
      el("div", { class: "tc-layers", role: "group", "aria-label": "Schichten im Kurschart" }, [el("span", { class: "tc-layers-h", text: "Im Kurs" })].concat(LAYERS.map(layerPill))),
      el("div", { class: "tc-layers", role: "group", "aria-label": "Indikator-Unterfenster (eines zur Zeit)" }, [el("span", { class: "tc-layers-h", text: "Unterfenster" })].concat(PANE_LIST.map(layerPill)))
    ]);
    var focusF = X.focus && (X.analysis.formations || []).filter(function (f) { return f.id === X.focus; })[0];
    var focusBar = X.focus ? el("p", { class: "tc-focus", role: "status" }, focusF
      ? ["Fokus: ", el("b", { text: focusF.name }), " · " + M.STATE_BADGE[focusF.state] + " · erkannt " + M.dateDe(focusF.detectedAt) + " ", el("a", { class: "tc-link", href: M.chartHref(X.T), text: "Alle Formationen zeigen" })]
      : ["Diese Formation ist im aktuellen Stand nicht mehr enthalten. ", el("a", { class: "tc-link", href: M.chartHref(X.T), text: "Alle Formationen zeigen" })]) : null;
    var weekly = !X.focus && (studio.range === "5J" || studio.range === "Max");
    var signals = el("section", { class: "tc-signals" }), levelsSec = el("section", { class: "tc-levels" });
    put(body, [focusBar, card, layerBar, signals, levelsSec, dataQuality(X.inst, X.D, weekly), disclaimer(X.D && X.D.meta)]);
    var chart = null;

    if (weekly) {
      put(legend, el("span", { class: "tc-note", text: "Wochenschlüsse (Linie) · Formationen und Volumen nur im Tageschart" }));
      loadWeekly(X.T).then(function (w) {
        var pts = (w.points || []).filter(function (p) { return isNum(p[1]); });
        var dates = pts.map(function (p) { return p[0]; }), close = pts.map(function (p) { return p[1]; });
        var VT = global.VUTechnical, s10 = VT.Indicators.sma(close, 10), s40 = VT.Indicators.sma(close, 40);
        put(legend, legendItems([["Kurs (Woche)", "var(--tc-price)"], ["SMA 10 W", "var(--tc-c1)"], ["SMA 40 W", "var(--tc-c2)"]]));
        chart = Chart.render(host, { title: X.T + " Wochenchart", mode: "line", window: studio.range === "5J" ? 260 : 0,
          data: { dates: dates, close: close, open: close, high: close, low: close, volume: [] },
          overlays: [{ id: "s10", label: "SMA 10 W", values: s10, color: "var(--tc-c1)" }, { id: "s40", label: "SMA 40 W", values: s40, color: "var(--tc-c2)" }] });
      }).catch(function () { put(host, stateBox("Keine Wochenreihe", "Für diese Aktie liegt keine lange Wochenreihe vor.")); });
    } else {
      var win = RANGES.filter(function (r) { return r[0] === studio.range; })[0][1];
      /* Fokus: Fenster vom ersten Punkt der Formation (mit Vorlauf) bis heute */
      if (focusF) {
        var t0 = [focusF.detectedAt].concat((focusF.points || []).map(function (p) { return p.time; }), (focusF.lines || []).map(function (l) { return l.from.time; })).sort()[0];
        var i0 = S.dates.indexOf(t0);
        if (i0 >= 0) win = Math.min(n, Math.max(42, n - i0 + 15));
      }
      var cfg = studioConfig(X, win, focusF);
      put(legend, legendItems(cfg.legend));
      chart = Chart.render(host, cfg);
    }
    renderSignalCards(signals, X.analysis, X.F, S.close[last], true);
    renderLevels(levelsSec, X.levels);
  }

  function legendItems(items) { return items.map(function (it) { return el("span", { class: "tc-leg" }, [el("i", { style: "background:" + it[1] }), it[0]]); }); }

  function studioConfig(X, win, focusF) {
    var S = X.S, L = studio.layers, overlays = [], lines = [], zones = [], levels = [], markers = [], legend = [["Kurs", "var(--tc-price)"]];
    var from = Math.max(0, S.dates.length - win), firstDate = S.dates[from];
    if (L.sma) {
      if (X.cs.sma50) { overlays.push({ id: "sma50", label: "SMA 50", values: X.cs.sma50, color: "var(--tc-c1)" }); legend.push(["SMA 50", "var(--tc-c1)"]); }
      if (X.cs.sma200) { overlays.push({ id: "sma200", label: "SMA 200", values: X.cs.sma200, color: "var(--tc-c2)" }); legend.push(["SMA 200", "var(--tc-c2)"]); }
    }
    if (L.ema) {
      /* Aus der Vollhistorie, wenn das Bundle sie traegt (ema-settled-1.0.0); sonst im Anzeigefenster gerechnet. */
      overlays.push({ id: "ema20", label: "EMA 20", values: X.cs.ema20 || X.ind.ema20, color: "var(--tc-c3)", dash: "4 3" }); legend.push(["EMA 20", "var(--tc-c3)"]);
      overlays.push({ id: "ema50", label: "EMA 50", values: X.cs.ema50 || X.ind.ema50, color: "var(--tc-c4)", dash: "4 3" }); legend.push(["EMA 50", "var(--tc-c4)"]);
      if (X.cs.ema200 && X.cs.ema200.some(isNum)) { overlays.push({ id: "ema200", label: "EMA 200", values: X.cs.ema200, color: "var(--tc-c2)", dash: "4 3" }); legend.push(["EMA 200", "var(--tc-c2)"]); }
    }
    var ex = X.ind;
    if (L.keltner) {
      overlays.push({ id: "kcu", label: "Keltner oben", values: ex.keltner.upper, color: "var(--tc-c4)", dash: "2 3" });
      overlays.push({ id: "kcl", label: "Keltner unten", values: ex.keltner.lower, color: "var(--tc-c4)", dash: "2 3" }); legend.push(["Keltner 20/2", "var(--tc-c4)"]);
    }
    if (L.donchian) {
      overlays.push({ id: "dcu", label: "Donchian oben", values: ex.donchian.upper, color: "var(--tc-c3)" });
      overlays.push({ id: "dcl", label: "Donchian unten", values: ex.donchian.lower, color: "var(--tc-c3)" }); legend.push(["Donchian 20", "var(--tc-c3)"]);
    }
    if (L.ichimoku) {
      overlays.push({ id: "ica", label: "Wolke A", values: ex.ichimoku.cloudA, color: "var(--tc-c1)", dash: "1 2" });
      overlays.push({ id: "icb", label: "Wolke B", values: ex.ichimoku.cloudB, color: "var(--tc-c2)", dash: "1 2" });
      overlays.push({ id: "ick", label: "Kijun", values: ex.ichimoku.kijun, color: "var(--tc-c5)" }); legend.push(["Ichimoku-Wolke A/B", "var(--tc-c1)"], ["Kijun 26", "var(--tc-c5)"]);
    }
    if (L.supertrend) {
      var stl = ex.supertrend.line, sd = ex.supertrend.direction;
      overlays.push({ id: "stu", label: "Supertrend aufwärts", values: stl.map(function (v, i) { return sd[i] > 0 ? v : NaN; }), color: "var(--tc-up)" });
      overlays.push({ id: "std", label: "Supertrend abwärts", values: stl.map(function (v, i) { return sd[i] < 0 ? v : NaN; }), color: "var(--tc-down)" }); legend.push(["Supertrend 10/3", "var(--tc-up)"]);
    }
    if (L.vwma) { overlays.push({ id: "vwma", label: "VWMA 20", values: ex.vwma, color: "var(--tc-c5)" }); legend.push(["VWMA 20", "var(--tc-c5)"]); }
    if (L.psar) {
      for (var pi = from; pi < S.dates.length; pi++) if (isNum(ex.psar.sar[pi])) markers.push({ time: S.dates[pi], price: ex.psar.sar[pi], tone: ex.psar.direction[pi] > 0 ? "positive" : "negative", size: 1.6 });
      legend.push(["Parabolic SAR", "var(--tc-watch)"]);
    }
    if (L.bb) {
      overlays.push({ id: "bbu", label: "Bollinger oben", values: X.ind.bb.upper, color: "var(--tc-c5)", dash: "2 3" });
      overlays.push({ id: "bbl", label: "Bollinger unten", values: X.ind.bb.lower, color: "var(--tc-c5)", dash: "2 3" }); legend.push(["Bollinger 20/2", "var(--tc-c5)"]);
    }
    var forms = focusF ? [focusF] : (X.analysis.formations || []).filter(function (f) { return f.state !== "INVALIDATED" || f.invalidatedAt >= firstDate; });
    forms.forEach(function (f) {
      var isTrend = f.family === "TRENDLINE" || f.family === "CHANNEL";
      if (!focusF && (isTrend ? !L.trend : !L.muster)) return;
      var tone = f.state === "INVALIDATED" ? "muted" : f.direction === "BEARISH" ? "negative" : "positive";
      (f.lines || []).forEach(function (l) { lines.push({ from: l.from, to: l.to, tone: tone, dash: f.state === "DETECTED" ? "6 4" : null }); });
      if (f.zone && (L.muster || focusF)) zones.push({ low: f.zone.low, high: f.zone.high, from: f.zone.from, to: f.zone.to, tone: "accent" });
      if (!isTrend || focusF) (f.points || []).forEach(function (p) { markers.push({ time: p.time, price: p.price, tone: tone, size: 3 }); });
      if (f.state === "CONFIRMED" && f.confirmedAt && !isTrend) {
        var ci = S.dates.indexOf(f.confirmedAt);
        if (ci >= 0) markers.push({ time: f.confirmedAt, price: S.close[ci], tone: "accent", size: 6, label: f.family === "BREAKOUT" ? "Ausbruch" : "Bestätigt" });
      }
    });
    if (L.niveaus) {
      (X.levels.resistances || []).slice(0, 2).forEach(function (z, i) { zones.push({ low: z.zoneLow, high: z.zoneHigh, tone: "negative", label: i ? null : "Widerstand" }); });
      (X.levels.supports || []).slice(0, 2).forEach(function (z, i) { zones.push({ low: z.zoneLow, high: z.zoneHigh, tone: "positive", label: i ? null : "Unterstützung" }); });
    }
    var pane = null;
    if (L.rsi) pane = { title: "RSI 14", min: 0, max: 100, guides: [30, 70], series: [{ label: "RSI", values: X.cs.rsi14 || X.ind.rsi, color: "var(--tc-c1)" }] };
    if (L.macd) pane = { title: "MACD 12/26/9", guides: [0], series: [{ label: "Histogramm", values: X.ind.macd.histogram, bars: true }, { label: "MACD", values: X.ind.macd.macd, color: "var(--tc-c1)" }, { label: "Signal", values: X.ind.macd.signal, color: "var(--tc-c2)" }] };
    if (L.stoch) pane = { title: "Stochastik 14/3/3", min: 0, max: 100, guides: [20, 80], series: [{ label: "%K", values: X.ind.stoch.k, color: "var(--tc-c1)" }, { label: "%D", values: X.ind.stoch.d, color: "var(--tc-c2)" }] };
    if (L.adx) pane = { title: "ADX 14", min: 0, guides: [20, 25], series: [{ label: "ADX", values: ex.adx, color: "var(--tc-c1)" }] };
    if (L.atr) pane = { title: "ATR 14 (USD)", series: [{ label: "ATR", values: ex.atr, color: "var(--tc-c1)" }] };
    if (L.cci) pane = { title: "CCI 20", guides: [-100, 0, 100], series: [{ label: "CCI", values: ex.cci, color: "var(--tc-c1)" }] };
    if (L.williams) pane = { title: "Williams %R 14", min: -100, max: 0, guides: [-80, -20], series: [{ label: "%R", values: ex.williamsR, color: "var(--tc-c1)" }] };
    if (L.aroon) pane = { title: "Aroon 25", min: 0, max: 100, guides: [30, 70], series: [{ label: "Aroon Up", values: ex.aroon.up, color: "var(--tc-up)" }, { label: "Aroon Down", values: ex.aroon.down, color: "var(--tc-down)" }] };
    if (L.mfi) pane = ex.mfi ? { title: "Money Flow Index 14", min: 0, max: 100, guides: [20, 80], series: [{ label: "MFI", values: ex.mfi, color: "var(--tc-c1)" }] } : null;
    if (L.obv) pane = ex.obv ? { title: "On-Balance-Volume", series: [{ label: "OBV", values: ex.obv, color: "var(--tc-c1)" }] } : null;
    if (L.cmf) pane = ex.cmf ? { title: "Chaikin Money Flow 20", guides: [0], series: [{ label: "CMF", values: ex.cmf, bars: true }] } : null;
    return { title: X.T + " Tageschart", mode: "candles", window: win, data: S, overlays: overlays, lines: lines, zones: zones, levels: levels, markers: markers, volume: !!L.volumen, pane: pane, legend: legend };
  }

  var ICON_OF = { formation: "triangle" };
  function renderSignalCards(host, analysis, F, close, compact) {
    var all = M.findings(analysis, F, close);
    var active = all.filter(function (f) { return !(f.formation && f.formation.state === "INVALIDATED"); });
    var shown = compact ? active.slice(0, 6) : all;
    put(host, [el("h2", { text: compact ? "Aktive Signale" : "Alle Befunde" }),
      shown.length ? el("div", { class: "tc-list" }, shown.map(signalCard)) : stateBox("Keine aktiven Befunde", "Im Tageschart ist derzeit keine Formation erkannt."),
      compact && all.length > shown.length ? el("a", { class: "tc-link", href: location.hash.replace(/\/signale$/, "") + "/signale", text: "Alle " + all.length + " Befunde mit Regeln und Historie" }) : null]);
  }
  function signalCard(f) {
    var detail = null;
    if (f.formation) {
      var x = f.formation, dq = x.dataQuality || {};
      detail = el("div", { class: "tc-detail" }, [
        el("dl", {}, [
          el("dt", { text: "Erkennung" }), el("dd", { text: x.rules.detect }),
          el("dt", { text: "Bestätigung" }), el("dd", { text: x.rules.confirm }),
          el("dt", { text: "Invalidierung" }), el("dd", { text: x.rules.invalidate }),
          el("dt", { text: "Erkannt" }), el("dd", { text: M.dateDe(x.detectedAt) + " (mit dem Wissen dieses Tages)" }),
          el("dt", { text: "Im Chart" }), el("dd", {}, el("a", { class: "tc-link", href: location.hash.replace(/\?.*$/, "").replace(/\/signale$/, "") + "?f=" + encodeURIComponent(x.id), text: "Nur diese Formation zeigen" })),
          el("dt", { text: "Zeitrahmen" }), el("dd", { text: x.timeframe === "1D" ? "Tag" : x.timeframe }),
          el("dt", { text: "Datenbasis" }), el("dd", { text: (dq.bars || "–") + " Tagesbars" + (dq.hasVolume ? ", mit Volumen" : ", ohne Volumen") + ", ATR " + M.price(dq.atr) })
        ])
      ]);
    }
    var head = [el("span", { class: "tc-row-icon" }, glyph(f.icon || ICON_OF[f.kind])), el("span", { class: "tc-row-text" }, [el("b", { text: f.title }), el("span", { text: f.text })]),
      el("span", { class: "tc-badge tc-" + f.tone, text: f.badge })];
    return detail ? el("details", { class: "tc-signal" }, [el("summary", {}, head.concat([glyph("chevron", "tc-chev tc-rot")])), detail]) : el("div", { class: "tc-signal" }, head);
  }
  function renderLevels(host, lv) {
    var r = lv.nearestResistance, s = lv.nearestSupport;
    put(host, [el("h2", { text: "Relevante Niveaus" }), el("div", { class: "tc-level-grid" }, [
      el("div", { class: "tc-level-card" }, [el("span", { class: "tc-level-ico is-down" }, glyph("up")), el("span", {}, [el("span", { text: "Widerstand" }), el("b", { class: "num", text: r ? M.price(r.center) : "–" }),
        r ? el("small", { text: "Zone " + M.price(r.zoneLow) + " – " + M.price(r.zoneHigh) + " · " + r.touches + " Kontakte" }) : el("small", { text: "Kein Widerstand über dem Kurs im Betrachtungsfenster" })])]),
      el("div", { class: "tc-level-card" }, [el("span", { class: "tc-level-ico is-up" }, glyph("down")), el("span", {}, [el("span", { text: "Unterstützung" }), el("b", { class: "num", text: s ? M.price(s.center) : "–" }),
        s ? el("small", { text: "Zone " + M.price(s.zoneLow) + " – " + M.price(s.zoneHigh) + " · " + s.touches + " Kontakte" }) : el("small", { text: "Keine Unterstützung unter dem Kurs im Betrachtungsfenster" })])])
    ])]);
  }
  function renderSignals(body, analysis, F, close, levels, hist, inst, D) {
    var cards = el("section", {}), lv = el("section", {});
    renderSignalCards(cards, analysis, F, close, false);
    renderLevels(lv, levels);
    var histList = el("section", { class: "tc-history" }, [el("h2", { text: "Erkennungen der letzten 12 Monate" }),
      el("p", { class: "tc-note", text: "Jede Zeile zeigt, was an ihrem Erkennungstag mit den damals verfügbaren Daten erkennbar war, und den heutigen Zustand." }),
      hist.length ? el("ol", { class: "tc-hist" }, hist.slice().reverse().map(function (h) {
        return el("li", {}, [el("b", { text: h.name }), el("span", { text: "erkannt " + M.dateDe(h.detectedAt) + (h.knownAt !== h.detectedAt ? " (ausgewertet " + M.dateDe(h.knownAt) + ")" : "") }),
          el("em", { class: "tc-badge tc-" + (h.stateNow === "CONFIRMED" ? "positive" : h.stateNow === "DETECTED" ? "watch" : h.stateNow === "INVALIDATED" ? "negative" : "neutral"), text: h.stateNow ? { CONFIRMED: "heute bestätigt", DETECTED: "heute beobachtet", INVALIDATED: "heute invalidiert" }[h.stateNow] : "nicht mehr aktiv" })]);
      })) : el("p", { class: "tc-note", text: "Keine Erkennungen im Zeitraum." })]);
    put(body, [cards, lv, histList, dataQuality(inst, D, false), disclaimer(D && D.meta)]);
  }
  function dataQuality(inst, D, weekly) {
    var b = inst.bars, bundle = inst.bundle || {};
    return el("details", { class: "tc-dq" }, [el("summary", { text: "Datenqualität und Herkunft" }), el("dl", {}, [
      el("dt", { text: "Kursreihe" }), el("dd", { text: "Tiingo EOD, split-bereinigt (" + (inst.priceSeriesType || "–") + "), " + b.close.length + " Tagesbars bis " + M.dateDe(b.timestamps[b.timestamps.length - 1]) }),
      el("dt", { text: "Gleitende Durchschnitte" }), el("dd", { text: "SMA 50/200 und RSI auf der Vollhistorie (" + (bundle.analysisLookback ? bundle.analysisLookback.bars + " Bars seit " + M.dateDe(bundle.analysisLookback.from) : "Bundle") + "); " + (bundle.chartSeries && bundle.chartSeries.ema200 ? "EMA 20/50/200 ebenfalls auf der Vollhistorie, erst nach ihrer Aufwärmphase; " : "EMA, ") + "Bollinger, MACD, Stochastik auf dem Anzeigefenster nach der Aufwärmphase" }),
      (function () {
        var es = bundle.emaSettlement, p = es && es.periods && es.periods.filter(function (x) { return x.period === 200; })[0];
        if (!p) return null;
        var pct = function (v) { return isNum(v) ? (v * 100).toLocaleString("de-DE", { maximumSignificantDigits: 2 }) + " %" : "–"; };
        return [el("dt", { text: "EMA 200" }), el("dd", { class: p.status === "SETTLED" ? null : "is-warn", text: p.status === "SETTLED"
          ? "veröffentlicht seit " + M.dateDe(p.firstSettledDate) + "; Fehlerschranke heute " + pct(p.errorBoundAtCutoff) + " des Kurses (Grenze 0,1 %)"
          : "nicht veröffentlicht: " + (p.barsAfterSeed !== null && p.barsAfterSeed < p.warmupBars ? "Historie zu kurz (frühestens ab " + p.minimumBars + " Tagesbars)" : "Fehlerschranke " + pct(p.errorBoundAtCutoff) + " über 0,1 % (Startfenster weit vom heutigen Kurs)") })];
      })(),
      (function () {
        var Fm = global.VUTechnical && global.VUTechnical.Formations, at = [];
        if (Fm && Fm.suspectJump) for (var q = 1; q < b.close.length; q++) if (Fm.suspectJump(b.close[q] / b.close[q - 1])) at.push(M.dateDe(b.timestamps[q]));
        return at.length ? [el("dt", { text: "Kurssprünge" }), el("dd", { class: "is-warn", text: "Datenverdacht am " + at.slice(-3).join(", ") + ": Schlussfaktor mit Split-Signatur oder außerhalb 0,2–5. Indikatoren und Formationen um diese Tage können verfälscht sein; Kurslücken werden dort nicht gemeldet." })] : null;
      })(),
      el("dt", { text: "Volumen" }), el("dd", { text: b.volume && b.volume.some(function (v) { return v > 0; }) ? "vorhanden" : "nicht vorhanden – Volumenindikatoren entfallen" }),
      el("dt", { text: "Formationen" }), el("dd", { text: "Nur bestätigte Swing-Punkte; Erkennung ohne Blick in die Zukunft (Engine " + global.VUTechnical.Formations.ENGINE_VERSION + ")" }),
      weekly ? el("dt", { text: "Wochenchart" }) : null, weekly ? el("dd", { text: "Wochenschlüsse aus der langen Reihe (discover-series-long), nur Schlusskurse" }) : null,
      el("dt", { text: "Screener-Stand" }), el("dd", { text: D && D.meta ? M.dateDe(D.meta.asOf) + " · " + D.meta.counts.rows.toLocaleString("de-DE") + " Titel" : "nicht geladen" })
    ])]);
  }

  /* ----------------------------------------------------------- Methodik */
  function viewMethod(main) {
    var head = el("header", { class: "tc-head" }, [el("a", { class: "tc-back", href: "#/" }, [glyph("back"), "Technical"]), el("h1", { class: "tc-title", text: "Methodik" }),
      el("p", { class: "tc-lead", text: "Jeder Indikator und jede Formation mit Definition, Parametern und Regeln." })]);
    var slot = el("div", { class: "tc-method" }, [el("div", { class: "tc-skel", style: "height:200px" })]);
    put(main, [head, tabs([["home", "#/", "Überblick"], ["build", "#/screener", "Screener"], ["method", "#/methodik", "Methodik"]], "method"), slot]);
    loadEngines().then(function () {
      var VT = global.VUTechnical, fam = { TREND: "Trend", MOMENTUM: "Momentum", VOLATILITY: "Volatilität", VOLUME: "Volumen" };
      var ind = Object.keys(fam).map(function (k) {
        return el("details", { class: "tc-filter", open: k === "TREND" ? true : null }, [el("summary", {}, [el("b", { text: fam[k] }), glyph("chevron", "tc-chev tc-rot")]),
          el("div", { class: "tc-filter-body" }, el("dl", { class: "tc-defs" }, VT.Indicators.CATALOG.filter(function (c) { return c.family === k; }).reduce(function (a, c) {
            var params = Object.keys(c.params).map(function (p) { return p + " " + c.params[p]; }).join(", ");
            return a.concat([el("dt", { text: c.name }), el("dd", { text: c.definition + (params ? " · Standard: " + params : "") + " · Aufwärmphase: " + c.warmup(c.params) + " Bars" })]);
          }, [])))]);
      });
      var rules = VT.Formations.RULES, legacy = VT.Formations.LEGACY, names = Q.FORMATION_TYPES;
      var forms = el("details", { class: "tc-filter" }, [el("summary", {}, [el("b", { text: "Formationen und Zustände" }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [el("p", { text: "Jede Formation ist entweder erkannt (in Bildung), bestätigt (Bestätigungsregel erfüllt) oder invalidiert. Erkannt wird nur aus bestätigten Swing-Punkten; der Erkennungstag ist der erste Tag, an dem die Formation mit den damals verfügbaren Daten sichtbar war – nie rückwirkend." }),
          el("dl", { class: "tc-defs" }, Object.keys(names).reduce(function (a, k) {
            var r = rules[k], l = legacy[k];
            return a.concat([el("dt", { text: names[k] }), el("dd", { text: r ? "Erkennung: " + r.detect + " Bestätigung: " + r.confirm + " Invalidierung: " + r.invalidate : "Regelwerk ti-chart-patterns (Doppeltop/-boden, Kopf-Schulter, Dreiecke, Rechteck, Flagge, Tasse mit Henkel). Bestätigung: " + l.confirm + " Invalidierung: " + l.invalidate })]);
          }, []))])]);
      var data = el("details", { class: "tc-filter" }, [el("summary", {}, [el("b", { text: "Daten, Zeitrahmen und Grenzen" }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [el("ul", { class: "tc-bullets" }, [
          "Tageskurse: Tiingo EOD, split-bereinigt nach der einen Preiswahrheit der Plattform (ADR-002); 270 Tagesbars je Titel aus der Produkt-Materialisierung.",
          "SMA 50/200, RSI 14, ADX, MACD, 52-Wochen-Hoch und relatives Volumen im Screener stammen aus der Vollhistorie (feature-store.js, dieselbe Rechnung wie Quant).",
          "EMA 20/50/200 werden auf der Vollhistorie gerechnet und an einem Tag nur gezeigt, wenn ihr möglicher Fehler gegenüber jeder anderen Startkonvention höchstens 0,1 % des Kurses beträgt (Schranke: Restgewicht des Startwerts × Spanne des Startfensters ÷ Schlusskurs) und der Startwert höchstens noch mit 5 % wirkt. Frühestens ab 500 Tagesbars (EMA 200), 125 (EMA 50) und 50 (EMA 20). Bei stark gefallenen Titeln kann die EMA 200 trotz langer Historie fehlen; der 200-Tage-Trend steht dann über die SMA 200.",
          "Woche und Monat: Wochenschlüsse aus der langen Reihe (nur Schlusskurse, nur abgeschlossene Wochen); Monatswerte aus dem letzten Wochenschluss je Monat.",
          "Relative Stärke: Kursänderung über 63 bzw. 126 Handelstage minus der des S&P-500-ETF SPY am selben Stichtag.",
          "Es gibt keinen Setup-Score: Sortiert wird nach einem gewählten, offengelegten Feld oder nach der Zahl erfüllter Bedingungen.",
          "Formationen sind beschreibend. Eine statistische Prüfung ihrer Trefferquoten in VU-Daten steht aus; sie sind keine Prognose."
        ].map(function (t) { return el("li", { text: t }); }))])]);
      var search = el("details", { class: "tc-filter" }, [el("summary", {}, [el("b", { text: "Suche in Worten" }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [el("ul", { class: "tc-bullets" }, [
          "Regelbasiert, ohne Sprachmodell: Fachbegriffe („über der SMA 200“, „Doppelboden“, „Volumenspitze“, „überverkauft“) und Kennzahlen mit Vergleich („RSI unter 40“, „ADX ≥ 25“, „RSI zwischen 30 und 50“) werden in dieselbe validierte Abfrage übersetzt wie die Filter per Klick.",
          "„und“, „mit“ und Komma verbinden Bedingungen; „oder“ trennt Alternativen („und“ bindet stärker). Mehrere Formationen bilden eine Liste: „Dreieck oder Keil“ genügt eine davon.",
          "„bestätigt“ verlangt bestätigte Formationen; „Woche“ oder „Monat“ wählt den Zeitrahmen. Prozentkennzahlen werden in Prozent gelesen: „Abstand zum 52-Wochen-Hoch über -5“ = −5 %.",
          "Nicht Erkanntes wird angezeigt und nicht geraten. Die kanonische Schreibweise (z. B. „aboveSma200 und rsi14 < 40“) wird unter der Eingabe gezeigt und ist ebenfalls eingebbar.",
          "Eine Übersetzung durch ein Sprachmodell ist vorbereitet (gleiches Abfrageschema, Prüfung durch dieselbe Validierung), aber nicht aktiv."
        ].map(function (t) { return el("li", { text: t }); }))])]);
      put(slot, [el("h2", { text: "Indikatoren" })].concat(ind, [el("h2", { text: "Formationen" }), forms, el("h2", { text: "Screener" }), search, data]));
    }).catch(function () { put(slot, stateBox("Methodik nicht geladen", "Die Engine-Dateien konnten nicht geladen werden.")); });
  }

  /* ------------------------------------------------------------- Router */
  function render() {
    var main = doc.getElementById("tc-main"), route = M.parseRoute(location.hash);
    main.classList.toggle("is-home", route.view === "home");
    if (route.view === "home") { doc.title = "Technical · Vision Universe®"; viewHome(main); }
    else if (route.view === "screener") { doc.title = "Screener · Technical · Vision Universe®"; viewScreener(main, route); }
    else if (route.view === "chart") { doc.title = (route.ticker ? route.ticker + " · " : "") + "Chart Studio · Technical · Vision Universe®"; viewChart(main, route); }
    else if (route.view === "method") { doc.title = "Methodik · Technical · Vision Universe®"; viewMethod(main); }
    else put(main, stateBox("Seite nicht gefunden", "Diese Adresse kennt Technical nicht.", el("a", { class: "tc-link", href: "#/", text: "Zur Technical-Startseite" })));
    main.setAttribute("aria-busy", "false");
    var last = lastTicker();
    if (global.VUNavigation) global.VUNavigation.dock(last ? { hrefs: { chart: "/technical/" + M.chartHref(last) } } : {});
  }
  var lastView = null;
  function onHash() {
    var r = M.parseRoute(location.hash), key = r.view + "|" + (r.ticker || "");
    render();
    if (key !== lastView) global.scrollTo(0, 0);
    lastView = key;
  }
  global.addEventListener("hashchange", onHash);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", onHash); else onHash();
  global.VUTechnicalApp = { render: render };
})(window);
