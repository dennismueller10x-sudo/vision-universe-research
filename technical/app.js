/* =========================================================================
   VISION UNIVERSE TECHNICAL — app.js
   Redesign 2027 (docs/design/redesign-2027, Folien T01–T06):
   Startseite (#/), Screener mit Reitern Suchen · Vorlagen · Gespeichert
   (#/screener, ?reiter=vorlagen|gespeichert; alte Adressen #/vorlagen und
   #/screener/gespeichert bleiben gueltig), Muster (#/muster, frueher
   #/methodik), Aktienseite Perspektive „Chart“ (#/chart/<T>), Chart Studio
   als PRO-Ansicht (#/chart/<T>/studio). Hash-Routen, keine Bibliothek.

   Datenquellen (nur lesend):
     /technical/data/index-v1.json + meta.json         (Startseite, Chart Studio; Erzeuger build-screener.mjs)
     /technical/data/screener-v1.json                  (nur Screener, bei Bedarf)
     /technical/data/spark-v1.json                     (Mini-Kursverlauf der Trefferkarten, nach dem ersten Bild)
     /quant/data/product/technical-signals-v1/by-ticker/<T>.json.gz
                                                       (Tagesbars + Vollhistorien-Features)
     /quant/data/market/discover-series-long/<securityId>.json (Wochenschluesse)
   Indikatoren und Formationen im Chart Studio rechnen dieselben Engines,
   die den Screener-Datensatz erzeugen (quant/engines/technical/*).
   ========================================================================= */
(function (global) {
  "use strict";
  var M = global.VUTechnicalModel, Q = global.VUTechnical.Query, QT = global.VUTechnical.QueryText, Chart = global.VUTechnicalChart, TPL = global.VUTechnical.Templates, AS = global.VUTechnical.Assistant;
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
  /** Feldname für die Anzeige (ohne „bullisch/bärisch“, Entscheidung 2). */
  function lbl(f, tf) { return M.plain(global.VUTechnical.Query.labelOf(f, tf)); }
  function put(host, kids) { host.replaceChildren.apply(host, [].concat(kids || []).filter(Boolean)); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  /* Langtext der Kurssprung-Kennzeichnung unter der Pruefleiste (Chart Studio); null ohne Kennzeichnung. */
  function jumpNote(row) {
    var f = jumpFlag(row);
    return f ? el("p", { class: "tc-note " + (row.suspectJumpStatus === "CONFIRMED" ? "is-bad" : "is-warn"), role: "note", text: f.title }) : null;
  }
  /* Kurssprung-Kennzeichnung der Zeile (price-jumps.js, screen-row 1.13.0): Verdacht oder bestaetigter Datenfehler. */
  function jumpFlag(row) {
    if (!row || !row.suspectJumpAt) return null;
    var PJ = global.VUTechnical && global.VUTechnical.PriceJumps;
    var j = { date: row.suspectJumpAt, factor: isNum(row.suspectJumpFactor) ? row.suspectJumpFactor : null, status: row.suspectJumpStatus || "SUSPECT", splitSignature: PJ && isNum(row.suspectJumpFactor) ? PJ.splitSignature(row.suspectJumpFactor) : true };
    var d = PJ ? PJ.describe(j.factor === null ? Object.assign({}, j, { factor: "?" }) : j, M.dateDe) : { short: "Kurssprung prüfen (" + M.dateDe(j.date) + ")", long: "" };
    return el("span", { class: "tc-flag" + (j.status === "CONFIRMED" ? " is-bad" : " is-warn"), title: d.long, text: d.short });
  }
  var GLYPH = {
    trend: "M4 17l5-5 4 3 7-8M15 7h5v5", breakout: "M3 15h7l3-8 3 5h5M14 4h6v6", triangle: "M4 5l16 7-16 7z", flag: "M5 21V4M5 4h11l-3 4 3 4H5",
    bars: "M5 20V12M10 20V7M15 20v-5M20 20V4", pulse: "M3 12h4l3-7 4 14 3-7h4", range: "M4 7h16M4 17h16M7 7v10M17 7v10", contraction: "M3 6l5 5 4-3 4 2 5-1M3 18l5-4 4 2 4-1 5 1",
    reversal: "M4 18l4-10 4 7 4-10 4 13", trophy: "M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 21h8M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3", clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2",
    search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4", chevron: "M9 6l6 6-6 6", back: "M15 6l-6 6 6 6", save: "M6 3h12v18l-6-4-6 4z", expand: "M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6",
    up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6", book: "M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9"
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
  /* Ein gemeinsames Versprechen: Vorladen und Ansicht bauen den Datensatz nur einmal. Nach einem Fehler neuer Versuch. */
  var screenerP = null;
  function loadScreener() {
    if (dataset) return Promise.resolve(dataset);
    if (!screenerP) screenerP = Promise.all([fetchJSON(M.SCREENER_PATH), fetchJSON(M.META_PATH).catch(function () { return null; })]).then(function (r) {
      dataset = { ds: Q.createDataset(r[0]), artifact: r[0], meta: r[1] };
      return dataset;
    }, function (e) { screenerP = null; delete cache[M.SCREENER_PATH]; throw e; });
    return screenerP;
  }
  /* Mini-Kursverlauf der Trefferkarten aus spark-v1.json (eigene Datei seit Vertrag 1.2.0): erst nach dem ersten Bild
     geladen; bis dahin bleibt der reservierte Platz leer. Ohne Datei bleibt die Karte ohne Linie (kein Fehler). */
  var sparkP = null, sparkMap = null;
  function loadSpark() {
    if (!sparkP) sparkP = fetchJSON(M.SPARK_PATH).then(function (d) {
      sparkMap = {};
      (d && d.s || []).forEach(function (t, i) { sparkMap[t] = d.spark[i]; });
      return sparkMap;
    }, function () { sparkP = null; return null; });
    return sparkP;
  }
  function sparkSpan(row) {
    var span = el("span", { class: "tc-hit-spark" });
    if (sparkMap) span.innerHTML = VC ? VC.sparkline(sparkMap[row.s] || []) : "";
    else loadSpark().then(function (m) { if (m && VC) span.innerHTML = VC.sparkline(m[row.s] || []); });
    return span;
  }
  /* Auf der Vorlagenliste wird der Datensatz im Leerlauf vorgeladen: Die naechste Aktion ist fast immer eine Vorlage, deren
     Treffer ihn brauchen. Nicht bei "Datensparen" (Save-Data); die Startseite bleibt beim schlanken Index. */
  function prefetchScreener() {
    if (dataset || (navigator.connection && navigator.connection.saveData)) return;
    var go = function () { loadScreener().catch(function () {}); };
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 300);
  }
  /* Startseite und Chart Studio brauchen nur Kuerzel, Namen und Trefferzahlen: schlanker Index statt des vollen Datensatzes.
     Fehlt er (z. B. vor dem ersten Erzeugerlauf), wird er aus dem Datensatz nachgerechnet - dieselbe Funktion wie im Erzeuger. */
  var indexP = null;
  function loadIndex() {
    if (indexP) return indexP;
    var meta = fetchJSON(M.META_PATH).catch(function () { return null; });
    indexP = Promise.all([fetchJSON(M.INDEX_PATH).then(function (x) { if (!x || !/^vu-technical-index-1\./.test(x.schemaVersion || "")) throw new Error("INDEX_SCHEMA"); return x; })
      .catch(function () { return loadScreener().then(function (D) { return M.homeIndex(D.artifact); }); }), meta]).then(function (r) {
      var ix = r[0], pos = {};
      ix.s.forEach(function (t, i) { pos[t] = i; });
      return { index: ix, meta: r[1], name: function (t) { return pos[t] >= 0 ? ix.n[pos[t]] : null; }, has: function (t) { return pos[t] >= 0; },
        entries: ix.s.map(function (t, i) { return { s: t, n: ix.n[i] }; }) };
    });
    indexP.catch(function () { indexP = null; });
    return indexP;
  }
  var evidenceP = null, evidence = null;
  /** Evidenz je Formationstyp; fehlt die Datei, bleibt die Anzeige still (keine erfundenen Werte). */
  function loadEvidence() {
    if (!evidenceP) evidenceP = fetchJSON(M.EVIDENCE_PATH).then(function (e) {
      var by = {}; (e.types || []).forEach(function (t) { by[t.type] = t; });
      evidence = { doc: e, byType: by }; return evidence;
    }).catch(function () { evidenceP = null; return null; });
    return evidenceP;
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
    "/quant/engines/technical/indicators.js", "/quant/engines/technical/formations.js", "/quant/engines/technical/candlesticks.js",
    "/quant/engines/technical/timeframe.js", "/quant/engines/technical/multi-timeframe.js", "/core/listing-staleness.js"];
  var enginesReady = null;
  function loadEngines() {
    if (enginesReady) return enginesReady;
    // Ordered classic scripts download together and execute in insertion order.
    enginesReady = Promise.all(ENGINE_SCRIPTS.map(function (src) {
      return new Promise(function (ok, fail) {
        var s = doc.createElement("script"); s.src = src; s.async = false;
        s.onload = ok; s.onerror = function () { fail(new Error("ENGINE_LOAD:" + src)); };
        doc.head.appendChild(s);
      });
    })).catch(function (error) { enginesReady = null; throw error; });
    return enginesReady;
  }

  function store() { try { return global.localStorage; } catch (e) { return null; } }
  function lastTicker() { try { return (store() && store().getItem(M.LAST_KEY)) || null; } catch (e) { return null; } }
  function rememberTicker(t) { try { store() && store().setItem(M.LAST_KEY, t); } catch (e) { /* privat */ } }

  /* ------------------------------------------------------- Bausteine */
  /** Suche C20: Aktie (Vorschlagsliste) oder, mit words, ein Setup in Worten (fuehrt in den Screener mit erkannter Abfrage). */
  function searchBox(entries, placeholder, words) {
    var input = el("input", { class: "tc-input", type: "search", placeholder: placeholder || "Aktie, Kürzel oder Suche in Worten …", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
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
        var t = active >= 0 ? hits[active] : hits[0], v = input.value.trim();
        if (words && v.indexOf(" ") > 0 && active < 0) location.hash = "#/screener?q=" + encodeURIComponent(v);
        else if (t) go(t.s); else if (words && v) location.hash = "#/screener?q=" + encodeURIComponent(v); else if (/^[A-Za-z0-9.-]{1,12}$/.test(v)) go(v.toUpperCase());
      } else if (ev.key === "Escape") close();
    });
    var goBtn = words ? el("button", { type: "button", class: "tc-search-go", "aria-label": "Suchen", onclick: function () { var v = input.value.trim(); if (!v) { input.focus(); return; } var x = M.search(entries, v, 1)[0]; if (x && v.indexOf(" ") < 0) go(x.s); else location.hash = "#/screener?q=" + encodeURIComponent(v); } }, h(U.glyph("spark", 18))) : null;
    return el("div", { class: "tc-search" + (words ? " tc-search--words" : ""), role: "search" }, [glyph("search", "tc-search-icon"), input, goBtn, list]);
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
  var MAIN_TABS = [["home", "#/", "Technical"], ["build", "#/screener", "Screener"], ["templates", "#/screener?reiter=vorlagen", "Vorlagen"], ["learn", "#/lernen", "Lernen"], ["method", "#/muster", "Muster"]];
  function sectionHead(title, href, linkText) {
    return el("div", { class: "tc-sec-head" }, [el("h2", { text: title }), href ? el("a", { href: href, class: "tc-more" }, [linkText || "Alle", glyph("chevron", "tc-chev-s")]) : null]);
  }
  function tabs(items, active) {
    return el("nav", { class: "tc-tabs", "aria-label": "Ansicht" }, items.map(function (t) {
      return el("a", { href: t[1], class: "tc-tab" + (t[0] === active ? " is-on" : ""), "aria-current": t[0] === active ? "page" : null, text: t[2] });
    }));
  }
  function disclaimer(meta) {
    return el("p", { class: "tc-disclaimer" }, ["Befunde nach festen Regeln. Keine Handlungsempfehlung. ",
      meta && meta.asOf ? "Kursstand " + M.dateDe(meta.asOf) + ". " : "", el("a", { href: "#/muster?reiter=regeln", text: "Regeln und Grenzen" })]);
  }
  function stateBox(title, text, action) {
    return el("div", { class: "tc-state", role: "status" }, [el("b", { text: title }), el("p", { text: text }), action || null]);
  }

  /* ------------------------------------------------- Redesign 2027: Bausteine
     Gemeinsame Bausteine aus assets/vu-ui.js (globalThis.VUUI): Urteil C08, Erklaerung C09, Aktienzeile C10, Kachel C11,
     Navigationskarte C12, Reiter C14, Sheet C16, PRO-Marke C19. Nur Weiss, Schwarz, Neongruen und drei Graustufen. */
  var U = global.VUUI, VC = global.VUChart;
  /** Ein Element aus fertigem Markup der gemeinsamen Bausteine (VUUI maskiert alle Eingaben). */
  function h(markup) { var t = doc.createElement("template"); t.innerHTML = String(markup || "").trim(); return t.content.firstElementChild; }
  function de(v, d) { return isNum(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : "–"; }
  /** Kurzes Datum „29.10.“ aus ISO. */
  function dShort(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : ""; }
  /** Schwarze Kachel mit neongruenem Symbol (Vorlagen, Signale, Familien). */
  function ico(name) { return el("span", { class: "tc-ico", "aria-hidden": "true" }, glyph(name)); }
  /** C16 Sheet: von unten, mit Kicker und Titel; schliesst mit Escape, Tippen daneben und beim Seitenwechsel. */
  function sheet(id, kicker, title, kids) {
    var old = doc.getElementById(id); if (old) old.remove();
    var box = el("div", { class: "vu-sheet-backdrop tc-sheet", id: id, hidden: true }, [el("div", { class: "vu-sheet-ui vu-ui", role: "dialog", "aria-modal": "true", "aria-label": title }, [
      kicker ? el("p", { class: "vu-ltag", text: kicker }) : null, el("h2", { class: "vu-mt tc-sheet-title", text: title }), el("div", { class: "tc-sheet-body" }, kids)])]);
    doc.body.appendChild(box); U.openSheet(box);
    return box;
  }
  function closeSheets() { [].forEach.call(doc.querySelectorAll(".tc-sheet"), function (s) { U.closeSheet(s); s.remove(); }); }
  /** Seitenkopf der Redesign-Seiten: Titel als Frage/Name, ein Satz Nutzen. */
  function pageHead(kicker, title, lead, back) {
    return el("header", { class: "tc-phead" }, [back ? el("a", { class: "tc-back", href: back[0] }, [glyph("back"), back[1]]) : null, kicker ? el("p", { class: "vu-ltag", text: kicker }) : null,
      el("h1", { class: "vu-lt", text: title }), lead ? el("p", { class: "vu-lead", text: lead }) : null]);
  }
  /** C13 Abschnittstitel. */
  function sect(title, href, link) { return h(U.sect(title, href ? { href: href, link: link || "Alle" } : {})); }
  /** Befund-Pille einer Trefferzeile: neongruen = nach oben, schwarz = nach unten, Linie = Richtung offen. */
  function befund(row, wanted) {
    var list = row.formations || [], f = null;
    if (wanted && wanted.length) f = list.filter(function (x) { return wanted.indexOf(x[0]) >= 0; })[0] || null;
    f = f || list[0];
    if (!f) return null;
    var name = M.plain(Q.FORMATION_TYPES[f[0]] || f[0]), dir = f[4] === "UP" ? "up" : f[4] === "DOWN" ? "down" : "open", when = dShort(f[3] || f[2]);
    var text = f[1] === "CONFIRMED" ? name + (dir === "up" ? ", Ausbruch nach oben" : dir === "down" ? ", Ausbruch nach unten" : ", bestätigt") + " · " + when
      : name + ((f[5] || "").indexOf("V") >= 0 ? ", vorläufig" : " in Bildung") + " · " + when;
    return el("span", { class: "tc-befund is-" + dir, title: M.hitSentence(row, wanted) }, [dir === "up" ? "▲ " : dir === "down" ? "▼ " : "", text]);
  }
  /** C10 Aktienzeile aus einer Screener-Zeile (Kurs = veroeffentlichter Schluss, Bewegung des letzten Tages). */
  function rowHtml(row, sub) {
    var sp = sparkMap && sparkMap[row.s];
    return U.stockRow({ ticker: row.s, name: shortName(row.n) || row.s, sub: sub || row.s, chart: sp && VC ? VC.sparkline(sp) : "", price: row.close, currency: "USD", changePct: isNum(row.chg1d) ? row.chg1d * 100 : null });
  }
  /** Trefferkarte: Aktienzeile + Befund in Worten + Datenhinweise. */
  function hitRow(row, wanted, href) {
    var flags = [];
    if (row.frozenSince) flags.push(el("span", { class: "tc-flag", title: "Datenqualitätshinweis: seitdem unveränderter Schlusskurs. Kein bestätigtes Delisting, auch bei illiquiden Titeln möglich. Keine Kennzahlen", text: "Kurs unverändert seit " + M.dateDe(row.frozenSince) }));
    else if (!row.fresh) flags.push(el("span", { class: "tc-flag", text: "Kurs vom " + M.dateDe(row.asOf) }));
    if (!row.hasVolume) flags.push(el("span", { class: "tc-flag", text: "ohne Volumen" }));
    if (row.suspectJumpAt) flags.push(jumpFlag(row));
    return el("a", { class: "tc-hit", href: href || M.chartHref(row.s) }, [h(rowHtml(row)), el("div", { class: "tc-hit-foot" }, [befund(row, wanted)].concat(flags))]);
  }

  /* ------------------------------------------------------------- Start (T01) */
  var PRESET_ICON = { breakout: "breakout", trend: "trend", triangles: "triangle", high52: "trophy", aboveSma200: "bars", high200w: "trophy", contraction: "contraction", bullflag: "flag" };
  /* Alltagstitel der 13 Vorlagen (T03). Der Fachname bleibt klein darunter (templates.js#title). */
  var PLAIN = {
    establishedUptrend: "Steigt seit Monaten", uptrendBasic: "Steigt, einfach geprüft", trend: "Trend mit Kraft", aboveSma200: "Über dem Jahresschnitt",
    triangleOpen: "Dreieck, Entscheidung offen", triangleOpenUptrend: "Dreieck im Aufwärtstrend", triangleBreakoutUp: "Dreieck nach oben aufgelöst", triangles: "Alle Dreiecke",
    bullflag: "Kurze Pause nach Anstieg", contraction: "Ruhige Rücksetzer", breakout: "Gerade ausgebrochen", high52: "Auf Jahreshoch", high200w: "Höchster Stand seit ~4 Jahren"
  };
  var GROUP_PLAIN = { trend: "Trend: es geht schon länger aufwärts", formation: "Muster: der Chart formt etwas", high: "Hochs und Ausbrüche" };
  function plainTitle(t) { return PLAIN[t.id] || t.title; }
  /* Startseite: drei fertige Suchen (AP8-Vorlagen); Fokus und Ranglisten stehen im Reiter Vorlagen. */
  /** Vorlagenkarte: Alltagstitel fett, Fachname klein, Trefferzahl, „+x fast“. */
  function templateRow(id, ix) {
    var t = TPL.get(id), tc = ix.templates && ix.templates[id];
    var count = tc ? tc[0] : ix.presets && isNum(ix.presets[id]) ? ix.presets[id] : null, near = tc && tc[1];
    var n = t.criteria ? t.criteria.length : 0;
    return el("a", { class: "tc-row tc-tcard", href: TPL.href(id) }, [ico(PRESET_ICON[id] || t.icon),
      el("span", { class: "tc-row-text" }, [el("b", { text: plainTitle(t) }), el("span", { text: t.title + (n > 1 ? " · " + n + " Regeln" : "") })]),
      el("span", { class: "tc-tcount" }, [el("strong", { class: "tc-row-count num", text: isNum(count) ? count.toLocaleString("de-DE") : "–" }), el("small", { text: near ? "+" + near.toLocaleString("de-DE") + " fast" : "Treffer" })])]);
  }
  /* ------------------------------------------- Konzept „Der Chart in drei Sätzen“: Bausteine */
  var SHP = global.VUTechnicalShapes;
  /** Abschnittskopf mit Link rechts und einem Satz darunter (Vorlage .rh). */
  function rh(title, href, linkText, sub, tag) {
    return el("div", { class: "tc-rh" }, [el("div", { class: "tc-rh-t" }, [el("h2", { text: title }), tag ? el("span", { class: "tc-rh-tag", text: tag }) : null,
      href ? el("a", { href: href }, [linkText || "Alle", h(U.glyph("next", 13))]) : null]), sub ? el("p", { text: sub }) : null]);
  }
  /** Musterbild in einer Fläche: box = hell (Befund, Karte), ink = schwarz mit Neongrün (Raster, Sheet). */
  function shapeBox(x, size, ink) { var s = el("span", { class: ink ? "tc-mg-ic" : "tc-shapebox", "aria-hidden": "true" }); s.innerHTML = SHP.svg(x, size || 30); return s; }
  /** Richtung eines Befunds: +1 nach oben, −1 nach unten, 0 offen (wie dirPill). */
  function findingDir(f) {
    var x = f.formation;
    if (x && x.directionOpen) return 0;
    if (x) return x.direction === "BULLISH" ? 1 : x.direction === "BEARISH" ? -1 : 0;
    return f.tone === "positive" ? 1 : f.tone === "negative" ? -1 : 0;
  }
  /** Richtung in Worten als Urteil-Pille: neongrün nach oben, schwarz nach unten, grau offen (Entscheidung 2). */
  function dirVerdict(d) { return h(U.verdict(d > 0 ? "strong" : d < 0 ? "weak" : "mid", M.directionWords(d))); }
  function hudGlyph(name, size) { return el("span", { class: "vu-hud", style: "--vu-hud:" + (size || 34) + "px", "aria-hidden": "true" }, glyph(name)); }
  /** Befund-Zeile (Vorlage .bf): Musterbild, Name, ein Satz, Richtung; Tipp öffnet das Befund-Sheet. */
  function bfRow(f, onclick) {
    return el("button", { type: "button", class: "tc-bf", onclick: onclick }, [shapeBox(f, 28), el("span", {}, [el("b", { text: f.title }), el("span", { text: f.text })]),
      f.kind === "indicator" && !findingDir(f) ? h(U.verdict("mid", f.badge)) : dirVerdict(findingDir(f))]);
  }
  /** Fußzeile: Befunde nach festen Regeln (Entscheidung 1). */
  function footNote(asOf, extra) {
    return el("p", { class: "tc-foot" }, ["Befunde nach festen Regeln. Keine Handlungsempfehlung. " + (asOf ? "Kursstand " + M.dateDe(asOf) + ". " : "") + (extra || ""), el("a", { href: "#/muster?reiter=regeln", text: "Regeln und Grenzen" })]);
  }
  var WEEKDAY = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
  function closeLabel(iso) { var d = new Date(iso + "T12:00:00Z"); return iso ? "Schluss " + WEEKDAY[d.getUTCDay()] + " " + dShort(iso) : ""; }

  /* ------------------------------------------------------- Start (TX01) */
  /* Fertige Suchen der Startseite (Vorlage c-home): Alltagstitel, Satz darunter, Trefferzahl; Tipp öffnet den Screener. */
  var HOME_SEARCHES = [["establishedUptrend", "Aufwärtstrend · 8 Regeln", "trend"], ["breakout", "über Widerstand oder Range", "breakout"], ["high52", "höchster Schluss seit 52 Wochen", "trophy"],
    ["contraction", "Schwankung zieht sich zusammen", "contraction"], ["triangleBreakoutUp", "Dreieck mit Ausbruch nach oben", "triangle"]];
  /* „Muster heute im Markt“ (Raster): dieselben Zahlen wie die Musterseite (meta.json formations, erkannt + bestätigt). */
  var HOME_PATTERNS = [["Dreieck", ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"], "dreieck"], ["Ausbruch aus Range", ["RANGE_BREAKOUT"], "range"],
    ["Doppelboden", ["DOUBLE_BOTTOM"], "doppelboden"], ["Doppeltop", ["DOUBLE_TOP"], "doppeltop"]];
  function patternCount(meta, types) { var c = meta && meta.formations || {}; return types.reduce(function (a, t) { return a + (c[t + ":DETECTED"] || 0) + (c[t + ":CONFIRMED"] || 0); }, 0); }
  function patternDir(E, types) {
    var by = E ? E.byType : {}, d = types.map(function (t) { return by[t] && by[t].direction; });
    return d.every(function (x) { return x === "BULLISH"; }) ? 1 : d.every(function (x) { return x === "BEARISH"; }) ? -1 : 0;
  }
  function mgCell(href, name, n, d, shape) {
    return el("a", { class: "tc-mg", href: href }, [shapeBox(shape, 40, true), el("b", { class: "tc-mg-n", text: name }), el("div", { class: "tc-mg-row" }, [el("b", { class: "num", text: de(n) }),
      el("span", { class: "tc-dirdot is-" + (d > 0 ? "up" : d < 0 ? "down" : "open"), role: "img", "aria-label": M.directionWords(d), text: d > 0 ? "▲" : d < 0 ? "▼" : "◆" })])]);
  }
  /** Marktbreite als Urteil: ab 60 % stark, ab 40 % gemischt, darunter schwach (Darstellungsregel, keine Prognose). */
  function breadthVerdict(share) { return share >= 60 ? ["strong", "Starker Markt"] : share >= 40 ? ["mid", "Gemischter Markt"] : ["weak", "Schwacher Markt"]; }
  function viewHome(main) {
    var tag = el("p", { class: "vu-ltag", text: "Technical" });
    var head = el("header", { class: "tc-phead" }, [tag, el("h1", { class: "vu-lt", html: "Was zeigt<br>der Chart?" }),
      el("p", { class: "vu-lead", text: "Jeden Tag lesen feste Regeln die Charts aller US-Aktien und sagen in Worten, was auffällt." })]);
    var searchSlot = el("div", { class: "tc-search-slot" }), chips = el("div", { class: "vu-chips tc-quick", role: "list" }), market = el("div", { class: "tc-market-slot" });
    var fresh = el("div", { class: "tc-rail", "aria-busy": "true" }, [el("div", { class: "tc-skel", style: "height:190px;width:240px;flex:none" })]);
    var freshHead = rh("Heute neu im Chart", null, null, "Muster, die sich zuletzt gebildet oder aufgelöst haben.");
    var searches = el("div", { class: "tc-rail" }), grid = el("div", { class: "tc-mgrid" }), foot = el("div");
    var learn = el("a", { class: "tc-learn", href: "#/lernen" }, [hudGlyph("book", 42), el("span", { class: "tc-learn-t" }, [el("b", { text: "Chart lesen in 4 Lektionen" }), el("span", { class: "tc-learn-s", text: "Kurskerze, Struktur, Unterstützung und Widerstand" })]), h(U.glyph("next", 18))]);
    put(main, [head, searchSlot, chips, market, freshHead, fresh, rh("Fertige Suchen", "#/screener?reiter=vorlagen", "Alle 13", "Tipp öffnet die Treffer im Screener."), searches,
      rh("Muster heute im Markt", "#/muster", "Alle", "So viele Aktien zeigen das Muster."), grid, rh("Lernen"), learn, foot]);
    loadIndex().then(function (X) {
      var ix = X.index, asOf = X.meta && X.meta.asOf || ix.asOf;
      if (asOf) tag.textContent = "Technical · " + closeLabel(asOf);
      put(searchSlot, searchBox(X.entries, "Aktie oder „Dreieck über der 200-Tage-Linie“", true));
      put(chips, ["NVDA", "AAPL", "TSLA", "MSFT"].filter(X.has).map(function (t) { return el("a", { class: "vu-chip", role: "listitem", href: M.chartHref(t) }, [h(U.logo(t)), t]); }));
      /* Entscheidung 10: Markt heute aus der gemeinsamen Quelle (market-pulse.json); ohne sie die eigene Zählung, beide mit Stand und Basis. */
      var above = ix.presets && ix.presets.aboveSma200, own = isNum(above) && ix.count ? { share: above / ix.count * 100, matched: above, base: ix.count, asOf: asOf, source: "technical" } : null;
      fetchJSON(M.MARKET_PULSE_PATH).catch(function () { return null; }).then(function (pulse) {
        var b = M.marketBreadth(pulse) || own;
        if (!b) return;
        var v = breadthVerdict(b.share);
        put(market, el("a", { class: "tc-ms", href: TPL.href("aboveSma200"), "data-source": b.source, "aria-label": "Markt heute: " + v[1] + ", " + M.breadthSentence(b) }, [el("div", {}, [el("span", { class: "vu-ltag", text: "Markt heute" }),
          el("b", {}, [v[1], el("small", { text: Math.round(b.share) + " % über der 200-Tage-Linie" })]), el("div", { class: "tc-ms-bar" }, el("i", { style: "width:" + Math.round(b.share) + "%" })),
          el("span", { class: "tc-ms-basis", text: (isNum(b.matched) ? Math.round(b.matched).toLocaleString("de-DE") + " von " : "Basis ") + Math.round(b.base).toLocaleString("de-DE") + " US-Aktien" + (b.asOf ? " · Stand " + M.dateDe(b.asOf) : "") })]), h(U.glyph("next", 14))]));
      });
      put(searches, HOME_SEARCHES.filter(function (x) { return TPL.get(x[0]); }).map(function (x) {
        var t = TPL.get(x[0]), tc = ix.templates && ix.templates[x[0]], count = tc ? tc[0] : ix.presets && ix.presets[x[0]];
        return el("a", { class: "tc-idc", href: "#/screener?vorlage=" + encodeURIComponent(x[0]) }, [hudGlyph(x[2], 34), el("b", { text: plainTitle(t) }), el("span", { text: x[1] }),
          el("div", { class: "tc-idc-n" }, [el("b", { class: "num", text: de(count) }), el("small", { text: "Treffer" })])]);
      }));
      loadEvidence().then(function (E) {
        put(grid, HOME_PATTERNS.map(function (p) { return mgCell("#/screener?muster=" + ({ dreieck: "dreieck", range: "breakout", doppelboden: "doppelboden", doppeltop: "doppeltop" })[p[2]], p[0], patternCount(X.meta, p[1]), patternDir(E, p[1]), p[2]); }));
        if (E && E.doc) { var a = grid.previousElementSibling && grid.previousElementSibling.querySelector("a"); if (a) a.firstChild.textContent = "Alle " + E.doc.types.length; }
      });
      put(foot, footNote(asOf));
      /* „Heute neu im Chart“ braucht die Formationsspalte des Screener-Datensatzes: erst nach dem ersten Bild geladen. */
      var go = function () { Promise.all([loadScreener(), loadSpark(), loadEvidence()]).then(function (r) { paintFresh(fresh, r[0], asOf, r[2]); }).catch(function () { fresh.removeAttribute("aria-busy"); put(fresh, el("p", { class: "tc-note", text: "Die Musterliste konnte nicht geladen werden." })); }); };
      if (navigator.connection && navigator.connection.saveData) { fresh.removeAttribute("aria-busy"); put(fresh, el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--sm", text: "Neue Muster laden", onclick: go })); }
      else if (global.requestIdleCallback) global.requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 200);
    }).catch(function () {
      put(searchSlot, stateBox("Daten derzeit nicht verfügbar", "Der Screener-Datensatz konnte nicht geladen werden. Der Chart ist über die Adresse #/chart/<Kürzel> weiter erreichbar."));
    });
  }
  /* Ausgeschlossen: Linien, Kanaele und Kursluecken (zu haeufig fuer „neu im Chart“). */
  var FRESH_SKIP = { SUPPORT_TRENDLINE: 1, RESISTANCE_TRENDLINE: 1, ASCENDING_CHANNEL: 1, DESCENDING_CHANNEL: 1, GAP_UP: 1, GAP_DOWN: 1 };
  /** Satz einer Musterkarte: „Doppeltop, nach unten aufgelöst“, „Dreieck, in Bildung“; Ausbrüche tragen die Richtung schon im Namen. */
  function freshSentence(f) {
    var name = M.plain(Q.FORMATION_TYPES[f[0]] || f[0]);
    if (f[1] === "CONFIRMED" && f[4]) return /Ausbruch/.test(name) ? name : name + ", nach " + (f[4] === "UP" ? "oben" : "unten") + (f[0] === "RECTANGLE" ? " verlassen" : " aufgelöst");
    if (f[1] === "CONFIRMED") return name + ", bestätigt";
    return name + ((f[5] || "").indexOf("V") >= 0 ? ", vorläufig" : ", in Bildung");
  }
  /** Drei Aktien mit dem juengsten Muster-Ereignis (Erkennung oder Ausbruch, hoechstens 5 Kalendertage vor dem Stand) als Karten. */
  function paintFresh(host, D, asOf, E) {
    var ds = D.ds, C = ds.cols, cut = asOf ? new Date(Date.parse(asOf) - 5 * 864e5).toISOString().slice(0, 10) : "", pick = [];
    for (var i = 0; i < ds.size; i++) {
      if (!C.fresh[i] || C.frozenSince[i] || !C.formations[i]) continue;
      var f = C.formations[i].filter(function (x) { return !FRESH_SKIP[x[0]] && (x[3] || x[2]) >= cut; })[0];
      /* Nur gehandelte Werte ab 10 $ ohne Tagessprung ueber 15 % (Kleinstwerte und Ausreisser zuerst ausgeblendet). */
      if (f && C.hasVolume[i] && C.close[i] >= 10 && !(Math.abs(C.chg1d[i]) > 0.15) && !C.suspectJumpAt[i]) pick.push({ i: i, f: f, at: f[3] || f[2], dir: f[1] === "CONFIRMED" && f[4] ? 1 : 0, vol: isNum(C.relVol[i]) ? C.relVol[i] : 0 });
    }
    /* Juengstes Ereignis zuerst, bestaetigte Ausbrueche mit Richtung vor Erkennungen, dann hoeheres relatives Volumen. */
    pick.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : b.dir - a.dir || b.vol - a.vol; });
    host.removeAttribute("aria-busy");
    put(host, pick.length ? pick.slice(0, 3).map(function (p) {
      var row = ds.row(p.i), f = p.f, d = f[1] === "CONFIRMED" && f[4] ? (f[4] === "UP" ? 1 : -1) : patternDir(E, [f[0]]);
      var sp = el("div", { class: "tc-nc-sp", "aria-hidden": "true" }); /* C06 Kleinform wie im Konzept: Linie mit neongrüner Fläche und Endpunkt (assets/vu-chart.js). */
      sp.innerHTML = sparkMap && sparkMap[row.s] && VC ? VC.sparkline(sparkMap[row.s], { width: 216, height: 40 }) : "";
      return el("a", { class: "tc-nc", href: M.chartHref(row.s), title: M.hitSentence(row, [f[0]]) }, [
        el("div", { class: "tc-nc-h" }, [h(U.logo(row.s)), el("div", { class: "tc-nc-n" }, [el("b", { text: shortName(row.n) || row.s }), el("span", { text: row.s })]), h(U.chg(isNum(row.chg1d) ? row.chg1d * 100 : null))]),
        el("div", { class: "tc-nc-s" }, [shapeBox(f[0], 30), el("span", { text: freshSentence(f) })]), sp, dirVerdict(d)]);
    }) : [el("p", { class: "tc-note", text: "In den letzten Tagen haben die Regeln kein neues Chartmuster gefunden." })]);
  }
  function shortName(n) { return String(n || "").replace(/,? (Inc\.?|Corp(oration)?\.?|Co\.|Ltd\.?|plc|Holdings?|Class [A-C]|N\.V\.|S\.A\.)\b.*$/i, "").slice(0, 18); }

  /* ---------------------------------------------------------- Screener (T02) */
  /* Suchfeld "Suche in Worten": Vorschau beim Tippen (erkannt, nicht erkannt, Fehler), Ausfuehren ueber die Adresse #/screener?q=… */
  var EXAMPLES = ["Dreieck über der 200-Tage-Linie mit steigendem Volumen", "Bestätigter Ausbruch mit Volumenspitze und RSI unter 75", "Doppelboden oder Keil über der 50-Tage-Linie", "Neues 52-Wochen-Hoch"];
  function textSearch(textQ, parsed) {
    if (!QT) return null;
    var input = el("textarea", { class: "tc-ts-input", rows: "2", maxlength: "300", placeholder: "z. B. " + EXAMPLES[0], "aria-label": "Suche in Worten beschreiben", "aria-describedby": "tc-ts-preview", autocomplete: "off", spellcheck: "false" });
    input.value = textQ || "";
    var preview = el("div", { class: "tc-ts-preview", id: "tc-ts-preview", "aria-live": "polite" });
    function paint(r) {
      if (!r) { put(preview, el("p", { class: "tc-note", text: "Was wir nicht erkennen, zeigen wir an. Wir raten nicht." })); return; }
      var kids = [];
      if (r.recognized.length || r.unknown.length) kids.push(el("p", { class: "vu-ltag tc-ts-h", text: "So verstanden" }));
      if (r.recognized.length || r.unknown.length) kids.push(el("div", { class: "tc-ts-row" }, r.recognized.map(function (t) { return el("span", { class: "tc-mini is-ok" }, [h(U.glyph("check", 14)), M.plain(t)]); })
        .concat(r.unknown.map(function (t) { return el("span", { class: "tc-mini is-warn", title: "nicht erkannt", text: t + " ?" }); }))));
      r.errors.filter(function (e) { return e.code !== "EMPTY"; }).forEach(function (e) { kids.push(el("p", { class: "tc-note is-warn", text: ERROR_TEXT[e.code] ? ERROR_TEXT[e.code](e.text) : e.code + (e.text ? ": " + e.text : "") })); });
      var nRec = r.recognized.length;
      kids.push(el("p", { class: "tc-note", text: (nRec ? (nRec === 1 ? "1 Regel" : nRec + " Regeln") + " erkannt. " : "") + "Was wir nicht erkennen, zeigen wir an." }));
      if (r.query.groups.length) kids.push(queryEditor(r.canonical || ""));
      put(preview, kids);
    }
    /* Die uebersetzte Abfrage ist vor dem Ausfuehren bearbeitbar (kanonische Schreibweise, Rundreise parse(toText(q)) = q). */
    function queryEditor(canonical) {
      var edit = el("textarea", { class: "tc-input tc-input-code", rows: "2", spellcheck: "false", autocomplete: "off", "aria-label": "Übersetzte Abfrage bearbeiten" });
      edit.value = canonical;
      var state = el("p", { class: "tc-note", role: "status" });
      function check() {
        var r = QT.parse(edit.value), bad = r.errors.filter(function (e) { return e.code !== "EMPTY"; });
        state.className = "tc-note" + (r.ok ? "" : " is-warn");
        state.textContent = r.ok ? "Abfrage gültig." : (r.unknown.length ? "Nicht erkannt: " + r.unknown.join(", ") : bad.length ? (ERROR_TEXT[bad[0].code] ? ERROR_TEXT[bad[0].code](bad[0].text) : bad[0].code) : "Keine Bedingung.");
        return r;
      }
      edit.addEventListener("input", check);
      return el("details", { class: "tc-ts-edit" }, [el("summary", {}, ["Abfrage bearbeiten ", h(U.pro())]), edit,
        el("button", { class: "vu-btn vu-btn--line vu-btn--sm", type: "button", text: "Abfrage ausführen", onclick: function () { if (check().ok) location.hash = "#/screener?q=" + encodeURIComponent(edit.value.trim()); } }), state]);
    }
    var timer = null;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { paint(input.value.trim() ? QT.parse(input.value) : null); }, 120); });
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); } });
    paint(parsed);
    var form = el("form", { class: "vu-box tc-textsearch tc-satz", role: "search", onsubmit: function (ev) { ev.preventDefault(); var v = input.value.trim(); location.hash = "#/screener" + (v ? "?q=" + encodeURIComponent(v) : ""); } }, [
      el("label", { class: "tc-ts-label vu-ltag", for: "tc-ts-input", text: "In Worten suchen" }),
      el("div", { class: "tc-ts-field" }, [Object.assign(input, { id: "tc-ts-input" }), el("button", { class: "tc-ts-go", type: "submit", "aria-label": "Suchen" }, h(U.glyph("spark", 18)))]),
      preview
    ]);
    return form;
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
        return el("optgroup", { label: g }, groups[g].map(function (f) { return el("option", { value: f.id, text: lbl(f, b.tf), selected: f.id === row.field }); }));
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
          el("div", { class: "tc-enum", role: "group", "aria-label": lbl(f, b.tf) }, Object.keys(f.values).map(function (k) {
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

  /* Reiter des Screeners (C14): Suchen · Vorlagen · Gespeichert. */
  function screenerTabs(active) {
    return h(U.seg([{ id: "build", label: "Suchen", href: "#/screener" }, { id: "templates", label: "Vorlagen", href: "#/screener?reiter=vorlagen" }, { id: "saved", label: "Gespeichert", href: "#/screener?reiter=gespeichert" }], active, { label: "Screener-Ansicht" }));
  }
  /* Profi-Tabelle: frei waehlbare Spalten (gemerkt in diesem Browser), Export als CSV. */
  var TABLE_COLS = ["rsi14", "distHigh52w", "adx", "rs6m", "relVol", "distSma200", "chg1d", "atrPct"];
  var TABLE_KEY = "vu-technical-table-cols-v1";
  function tableCols() { try { var v = JSON.parse(store().getItem(TABLE_KEY) || "null"); if (Array.isArray(v)) return v.filter(function (x) { return TABLE_COLS.indexOf(x) >= 0; }); } catch (e) { /* Standard */ } return ["rsi14", "distHigh52w"]; }
  var TF_LABEL = { "1D": "Tag", "1W": "Woche", "1M": "Monat" };

  function viewScreener(main, route) {
    var p = route.params || {};
    if (route.tab === "templates") return viewTemplateList(main);
    if (route.tab === "saved") return viewSaved(main);
    var presetId = p.preset, preset = presetId && Q.PRESETS.filter(function (x) { return x.id === presetId; })[0];
    var st = M.stateFromParams(p);
    /* Suche in Worten: regelbasiert uebersetzt (query-text.js), gerechnet wird dieselbe validierte Abfrage. */
    var textQ = !preset && typeof p.q === "string" && p.q.trim() ? p.q.trim().slice(0, 300) : null;
    /* Aus einer Vorlage uebernommen (AP8): Kriterien als Baukasten-Filter, damit sie sich anpassen lassen. */
    var tplFrom = !preset && !textQ && p.vorlage && TPL.get(p.vorlage) ? TPL.toQuery(TPL.compose(p.vorlage, TPL.blocksFromParam(p.plus))) : null;
    /* Aus dem Analyse-Assistenten uebernommen: dieselben Kriterien als Baukasten-Filter. */
    var goalFrom = !preset && !textQ && !tplFrom && AS && p.z ? AS.fromParams(p) : null;
    if (goalFrom && goalFrom.template) tplFrom = TPL.toQuery(goalFrom.template); else goalFrom = null;
    var parsed = textQ && QT ? QT.parse(textQ) : null, table = p.ansicht === "tabelle";
    /* Konzept „Der Chart in drei Sätzen“, TX06: Kopf „Was suchst du?“, Perspektiven-Chips wie im Hauptscreener (Chart aktiv),
       Suche in Worten als schwarze Satz-Karte, fertige Suchen als Schiene, Hauptknopf mit Trefferzahl. Der Technical-Screener
       bleibt (Owner-Änderung 09.11.2026); die anderen Perspektiven öffnen den Hauptscreener. */
    var head = el("header", { class: "tc-phead" }, [el("p", { class: "vu-ltag", text: "Screener · Perspektive Chart" }), el("h1", { class: "vu-lt", text: "Was suchst du?" })]);
    var persp = el("nav", { class: "vu-chips tc-persp", "aria-label": "Perspektive" }, [["basis", "Basis", null], ["zahlen", "Zahlen", "fundamental"], ["faktoren", "Faktoren", "quant"], ["chart", "Chart", "technical"]].map(function (x) {
      var kids = [x[2] ? h(U.worldIcon(x[2], 15)) : h(U.glyph("grid", 15)), x[1]];
      return x[0] === "chart" ? el("span", { class: "vu-chip tc-on", "aria-current": "page" }, kids) : el("a", { class: "vu-chip", href: "/screener/?p=" + x[0] }, kids);
    }));
    var body = el("div", { class: "tc-screener" }), results = el("section", { class: "tc-results-sec", id: "tc-treffer", "aria-live": "polite" });
    /* Ein Screener (Konzept „Verstehen. Finden.“, Entscheidung 1): /screener/ mit vorgewaehlter Perspektive „Chart“.
       Dieser Einstieg leitet erst weiter, wenn /screener/ jedes Technical-Kriterium abdeckt (screener/tests/one-screener.test.mjs). */
    put(main, [head, persp, screenerTabs("build"), body, results]);
    function go(next) { location.hash = "#/screener" + (next ? "?" + next : ""); }
    function withParam(k, v) { var q = (location.hash.split("?")[1] || "").split("&").filter(function (x) { return x && x.split("=")[0] !== k; }); if (v) q.push(k + "=" + v); return "#/screener" + (q.length ? "?" + q.join("&") : ""); }
    if (!dataset) put(results, el("div", { class: "tc-skel", style: "height:220px" }));

    Promise.all([loadScreener(), loadSpark()]).then(function (r) {
      var D = r[0], ds = D.ds, built = preset ? { query: Object.assign({ limit: 200 }, preset.query), dropped: [] }
        : parsed ? { query: Object.assign({}, parsed.query, { limit: 200 }), dropped: [] }
        : tplFrom ? { query: Object.assign({}, tplFrom.query, { limit: 200 }), dropped: [] } : M.queryFromState(st);
      var res = Q.evaluate(ds, built.query);
      if (res.error) { put(body, stateBox("Ungültige Abfrage", res.errors.map(function (e) { return e.code; }).join(", "))); put(results, []); return; }
      var rules = built.query.groups.reduce(function (a, g) { return a + g.filters.length; }, 0);
      var origin = null;
      if (tplFrom) {
        var tpl0 = goalFrom ? goalFrom.template : TPL.get(p.vorlage);
        origin = el("div", { class: "vu-box tc-preset" }, [el("b", { text: (goalFrom ? "Aus dem Analyse-Assistenten „" : "Aus Vorlage „") + (goalFrom ? tpl0.title : plainTitle(tpl0)) + "“" }), el("p", { text: M.plain(Q.describe(built.query)) }),
          tplFrom.dropped.length ? el("p", { class: "tc-note is-warn", text: "Im Baukasten nicht wählbar und deshalb weggelassen: " + tplFrom.dropped.join(", ") + ". Die Trefferzahl kann deshalb von der Vorlage abweichen." }) : null,
          goalFrom ? el("a", { class: "tc-link", href: AS.href(goalFrom.goal.id, goalFrom.selected), text: "Zurück zum Analyseziel" }) : el("a", { class: "tc-link", href: TPL.href(p.vorlage, TPL.blocksFromParam(p.plus)), text: "Zurück zur Vorlage" })]);
      } else if (parsed) {
        origin = el("details", { class: "tc-preset tc-preset--s" }, [el("summary", { text: "Erkannt als (ausführlich)" }), el("p", { text: M.plain(Q.describe(built.query)) || "Keine auswertbare Bedingung" })]);
      } else if (preset) {
        origin = el("div", { class: "vu-box tc-preset" }, [el("b", { text: M.plain(preset.title) }), el("p", { text: M.plain(Q.describe(preset.query)) }), el("a", { class: "tc-link", href: "#/screener", text: "Eigene Suche" })]);
      }
      /* Zeile unter der Suche: Filter (Sheet) mit Anzahl, Zeitrahmen, Verknuepfung, Profi-Tabelle. */
      var tools = el("div", { class: "vu-chips tc-tools" }, [
        el("button", { type: "button", class: "vu-chip vu-chip--on tc-filter-btn", onclick: function () { filterSheet(D, st); } }, [h(U.glyph("filter", 17)), "Filter · " + rules]),
        el("button", { type: "button", class: "vu-chip", text: TF_LABEL[built.query.timeframe] || "Tag", onclick: function () { filterSheet(D, st); } }),
        el("button", { type: "button", class: "vu-chip", text: st.logic === "OR" && !parsed && !tplFrom && !preset ? "Mindestens eine Regel" : "Alle Regeln", onclick: function () { filterSheet(D, st); } }),
        el("a", { class: "vu-chip" + (table ? " vu-chip--on" : ""), href: withParam("ansicht", table ? "" : "tabelle"), "aria-label": table ? "Liste zeigen" : "Profi-Tabelle zeigen", "aria-pressed": String(table) }, [h(U.glyph("list", 17)), table ? "Liste" : "Tabelle"])]);
      /* Trichter in einer Zeile: Zahl je Regel, Regelname gekuerzt (die volle Abfrage steht unter „Wie die Treffer entstehen“). */
      var funnelText = res.funnel.filter(function (f) { return !/universum/i.test(f.label); }).slice(0, 3).map(function (f) { var l = f.label.split(":")[0].split(" (")[0]; return f.count.toLocaleString("de-DE") + " " + (l.length > 30 ? l.slice(0, 29) + "…" : l); }).join(" · ");
      var countCard = el("a", { class: "vu-btn vu-btn--block tc-countcard tc-cta tc-cta-lime" + (rules ? "" : " is-empty"), href: "#tc-treffer", title: funnelText || null, onclick: function (ev) { ev.preventDefault(); results.scrollIntoView({ behavior: "smooth", block: "start" }); } },
        rules ? [el("b", { class: "num", text: res.count.toLocaleString("de-DE") }), " Treffer zeigen"] : [el("b", { text: "–" }), " Noch keine Regel gewählt"]);
      var rail = el("div", { class: "tc-rail" }, HOME_SEARCHES.slice(0, 4).filter(function (x) { return TPL.get(x[0]); }).map(function (x) {
        var t = TPL.get(x[0]), q = TPL.toQuery(TPL.compose(x[0], [])), n = q ? Q.evaluate(ds, Object.assign({}, q.query, { limit: 1 })) : null;
        return el("a", { class: "tc-idc", href: "#/screener?vorlage=" + encodeURIComponent(x[0]) }, [hudGlyph(x[2], 34), el("b", { text: plainTitle(t) }), el("span", { text: x[1] }),
          el("div", { class: "tc-idc-n" }, [el("b", { class: "num", text: n && !n.error ? de(n.count) : "–" }), el("small", { text: "Treffer" })])]);
      }));
      var mainLink = h(U.help("Dieselben Regeln, Vorlagen und die Suche in Worten gibt es auch im Hauptscreener, Perspektive „Chart“, zusammen mit Zahlen und Faktoren."));
      mainLink.querySelector("span").append(" ", el("a", { class: "tc-link", href: "/screener/?p=chart", text: "Im Hauptscreener öffnen" }));
      if (built.dropped && built.dropped.length) origin = el("p", { class: "tc-note", text: "Nur im Tageschart verfügbar und deshalb nicht angewendet: " + built.dropped.join(", ") + "." });
      /* Aus Vorlage, Assistent oder Suche in Worten: die Regeln direkt anpassbar (Baukasten, zugeklappt). */
      var inlineBuilder = QT && (tplFrom || (parsed && parsed.query.groups.length)) ? builderCard(parsed && parsed.query.groups.length ? M.builderFromQuery(parsed.query) : M.builderFromQuery(tplFrom.query), false) : null;
      put(body, [textSearch(textQ, parsed), origin, inlineBuilder, tools, rh("Fertige Suchen · Chart", "#/screener?reiter=vorlagen", "Alle 13"), rail, countCard, mainLink]);
      renderResults(D, res, built.query, rules);
    }).catch(function (e) {
      put(body, [textSearch(textQ, parsed), stateBox("Daten derzeit nicht verfügbar", "Der Screener-Datensatz konnte nicht geladen werden (" + String(e && e.message || e) + ").")]); put(results, []);
    });

    /** Filter-Sheet (T02 b): Chartmuster, nur bestaetigte, Trend (+PRO), Volumen, RSI (PRO), Zeitrahmen, Verknuepfung; Trefferzahl live. */
    function filterSheet(D, st0) {
      var s = JSON.parse(JSON.stringify(st0)), cta = el("button", { type: "button", class: "vu-btn vu-btn--block tc-sheet-cta" }), box = el("div", { class: "tc-fsheet" });
      function count() { var q = M.queryFromState(s), r = Q.evaluate(D.ds, Object.assign({}, q.query, { limit: 1 })); return r.error ? 0 : r.count; }
      function chip(label, on, fn, extra) { return el("button", { type: "button", class: "vu-chip" + (extra ? " " + extra : ""), "aria-pressed": String(!!on), onclick: function () { fn(); paint(); }, text: label }); }
      function toggleIn(list, id) { var i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id); }
      var showPro = false;
      function paint() {
        var main5 = M.TREND_PILLS.filter(function (tp) { return !tp.daily || tp.id === "rs"; }), pro = M.TREND_PILLS.filter(function (tp) { return tp.daily && tp.id !== "rs"; });
        var rsiIn = el("input", { type: "number", min: "1", max: "99", step: "1", class: "tc-num", value: isNum(s.rsiMax) ? s.rsiMax : 60, "aria-label": "RSI-Grenzwert", onchange: function (ev) { var v = Number(ev.target.value); if (v > 0 && v < 100 && isNum(s.rsiMax)) { s.rsiMax = v; paint(); } } });
        put(box, [
          el("div", { class: "vu-box" }, [el("b", { class: "tc-fs-h", text: "Chartmuster" }), el("div", { class: "tc-wrapchips" }, M.PATTERN_PILLS.map(function (pp) { return chip(M.plain(pp.label), s.patterns.indexOf(pp.id) >= 0, function () { toggleIn(s.patterns, pp.id); }); }))]),
          el("label", { class: "tc-switchrow" }, [el("span", { text: "Nur bestätigte Muster" }), el("input", { type: "checkbox", role: "switch", class: "vu-switch", checked: s.confirmed, onchange: function (ev) { s.confirmed = ev.target.checked; paint(); } })]),
          el("div", { class: "vu-box" }, [el("b", { class: "tc-fs-h", text: "Trend" }), el("div", { class: "tc-wrapchips" }, main5.map(function (tp) { return chip(M.plain(M.trendLabel(tp, s.tf)), s.trends.indexOf(tp.id) >= 0, function () { toggleIn(s.trends, tp.id); }); })
            .concat(showPro ? pro.map(function (tp) { return chip(M.plain(M.trendLabel(tp, s.tf)), s.trends.indexOf(tp.id) >= 0, function () { toggleIn(s.trends, tp.id); }); })
              : [el("button", { type: "button", class: "vu-chip", onclick: function () { showPro = true; paint(); } }, ["+ " + pro.length + " ", h(U.pro())])]))]),
          el("div", { class: "vu-box tc-switches" }, [
            el("label", { class: "tc-switchrow" }, [el("span", { text: "Volumen über Durchschnitt" }), el("input", { type: "checkbox", role: "switch", class: "vu-switch", checked: s.vol, onchange: function (ev) { s.vol = ev.target.checked; paint(); } })]),
            el("label", { class: "tc-switchrow" }, [el("span", {}, ["RSI unter ", rsiIn, " ", h(U.pro())]), el("input", { type: "checkbox", role: "switch", class: "vu-switch", checked: isNum(s.rsiMax), onchange: function (ev) { s.rsiMax = ev.target.checked ? Number(rsiIn.value) || 60 : null; paint(); } })])]),
          el("p", { class: "vu-ltag", text: "Zeitrahmen" }),
          el("div", { class: "vu-seg", role: "radiogroup", "aria-label": "Zeitrahmen" }, Object.keys(Q.TIMEFRAMES).map(function (k) { return el("button", { type: "button", role: "radio", "aria-checked": String(s.tf === k), "aria-pressed": String(s.tf === k), text: TF_LABEL[k] || Q.TIMEFRAMES[k], onclick: function () { s.tf = k; paint(); } }); })),
          el("p", { class: "vu-ltag", text: "Verknüpfung" }),
          el("div", { class: "vu-seg", role: "radiogroup", "aria-label": "Verknüpfung der Regeln" }, [["AND", "Alle Regeln"], ["OR", "Mindestens eine"]].map(function (o) { return el("button", { type: "button", role: "radio", "aria-checked": String(s.logic === o[0]), "aria-pressed": String(s.logic === o[0]), text: o[1], onclick: function () { s.logic = o[0]; paint(); } }); })),
          QT ? builderCard(parsed && parsed.query.groups.length ? M.builderFromQuery(parsed.query) : tplFrom ? M.builderFromQuery(tplFrom.query) : { tf: s.tf, groups: [[M.defaultRow("aboveSma200")]] }, false) : null
        ]);
        var n = count();
        cta.textContent = n.toLocaleString("de-DE") + " Treffer anzeigen";
      }
      cta.addEventListener("click", function () { closeSheets(); go(M.paramsFromState(s)); });
      var reset = el("button", { type: "button", class: "tc-linkbtn", text: "Zurücksetzen", onclick: function () { s = { tf: "1D", patterns: [], confirmed: false, trends: [], vol: false, rsiMax: null, logic: "AND", sort: s.sort }; paint(); } });
      paint();
      var sh = sheet("tc-filter-sheet", null, "Filter", [reset, (parsed || tplFrom || preset) ? el("p", { class: "tc-note", text: "Die aktuelle Suche kommt aus " + (parsed ? "der Suche in Worten" : preset ? "einer Schnellsuche" : "einer Vorlage") + ". Filter per Klick ersetzen sie; der Baukasten unten übernimmt sie." }) : null, box, cta]);
      sh.querySelector(".tc-sheet-title").after(reset);
    }

    function renderResults(D, res, query, rules) {
      var ds = D.ds, sortField = query.sort && query.sort.field, wanted = M.wantedFormations(query);
      var probier = [sect("Probier auch"), el("div", { class: "vu-stack" }, EXAMPLES.filter(function (x) { return x !== textQ; }).slice(0, 3).map(function (x) {
        return h(U.navcard({ href: "#/screener?q=" + encodeURIComponent(x), glyph: "spark", title: x }));
      })), h(U.help("Volumen: wie viele Aktien an einem Tag gehandelt wurden. Steigt es beim Ausbruch, machen viele mit.")), disclaimer(D.meta)];
      if (!rules) { put(results, probier); return; }
      var sortSel = el("select", { class: "tc-select tc-sortsel", "aria-label": "Sortieren", onchange: function (ev) { st.sort = ev.target.value; go(M.paramsFromState(st)); }, disabled: preset || parsed || tplFrom ? true : null }, [
        el("option", { value: "", text: "Sortieren: erfüllte Regeln", selected: !st.sort && !sortField })
      ].concat(["relVol", "rs6m", "distHigh52w", "distSma200", "adx", "rsi14", "chg1d"].filter(function (id) { return Q.field(id).tfs.indexOf(query.timeframe) >= 0; }).map(function (id) {
        return el("option", { value: id, text: lbl(Q.field(id), query.timeframe), selected: (preset || parsed ? sortField : st.sort) === id });
      })));
      var shown = 0, list = el("div", { class: "vu-box tc-hits" }), FIRST = 7, PAGE = 60, idx = res.indices;
      var more = el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--block tc-more", onclick: function () { page(PAGE); } });
      function page(k) { idx.slice(shown, shown + k).forEach(function (i) { list.append(hitRow(ds.row(i), wanted)); }); shown = Math.min(idx.length, shown + k); more.hidden = shown >= idx.length; more.textContent = shown <= FIRST ? "Alle " + res.count.toLocaleString("de-DE") + " Treffer" : "Weitere anzeigen"; if (idx.length < res.count && shown >= idx.length) more.hidden = true; }
      var view = table ? profiTable(ds, idx, query) : list;
      /* Funnel und Abfrage fuer Profis (validiert, deterministisch). */
      var funnel = el("details", { class: "tc-funnel" }, [el("summary", { text: "Wie die Treffer entstehen" }),
        el("ol", {}, res.funnel.map(function (f) { return el("li", {}, [el("span", { text: f.label }), el("b", { class: "num", text: f.count.toLocaleString("de-DE") }), f.missing ? el("em", { text: f.missing.toLocaleString("de-DE") + " ohne Wert" }) : null]); })),
        el("p", { class: "tc-note", text: "Strukturierte Abfrage (validiert, deterministisch ausgewertet):" }), el("pre", { class: "tc-json", text: JSON.stringify(query, null, 1) })]);
      var saveName = el("input", { class: "tc-input tc-input-s", type: "text", maxlength: "60", placeholder: "Name der Suche", "aria-label": "Name der Suche" });
      var saveMsg = el("p", { class: "tc-note", role: "status" });
      var saveForm = el("form", { class: "tc-save-form", hidden: true, onsubmit: function (ev) {
        ev.preventDefault();
        var name = saveName.value.trim() || (preset ? preset.title : textQ || M.plain(Q.describe(query))).slice(0, 60);
        var r2 = M.saveScreen(store(), name, preset ? "preset=" + preset.id : textQ ? "q=" + encodeURIComponent(textQ) : tplFrom ? TPL.paramsOf(p.vorlage, TPL.blocksFromParam(p.plus)) : M.paramsFromState(st));
        saveMsg.textContent = r2.ok ? "Gespeichert. Zu finden unter „Gespeichert“." : "Speichern nicht möglich (Browser-Speicher gesperrt).";
        if (r2.ok) acctMirror(r2.id, saveMsg);
      } }, [saveName, el("button", { class: "vu-btn vu-btn--sm", type: "submit", text: "Speichern" })]);
      var actions = el("div", { class: "tc-actions2" }, [
        el("button", { type: "button", class: "vu-btn vu-btn--ink tc-save-btn", onclick: function () { saveForm.hidden = !saveForm.hidden; if (!saveForm.hidden) saveName.focus(); } }, [glyph("save"), "Suche speichern"]),
        el("button", { type: "button", class: "vu-btn vu-btn--line", onclick: function () { openPush(); } }, [h(U.glyph("bell", 18)), "Melden"])]);
      put(results, [el("div", { class: "vu-sect" }, [el("h2", { text: "Treffer" }), sortSel]),
        res.count ? view : stateBox("Keine Treffer", "Keine Aktie erfüllt diese Regeln. Weniger Filter oder „Mindestens eine“ erweitern die Auswahl."),
        table || !res.count ? null : more, res.count > idx.length ? el("p", { class: "tc-note", text: "Gezeigt werden höchstens " + idx.length.toLocaleString("de-DE") + " von " + res.count.toLocaleString("de-DE") + " Treffern." }) : null,
        actions, saveForm, saveMsg, funnel].concat(probier));
      if (!table) page(FIRST);
    }
    /** Profi-Tabelle (T02 c): Aktie, Muster, gewaehlte Spalten, Kurs; CSV-Export. */
    function profiTable(ds, idx, query) {
      var cols = tableCols(), tf = query.timeframe, wanted = M.wantedFormations(query);
      var pick = el("details", { class: "tc-colpick" }, [el("summary", {}, ["Spalten ", h(U.pro())]), el("div", { class: "tc-wrapchips" }, TABLE_COLS.filter(function (id) { return Q.field(id) && Q.field(id).tfs.indexOf(tf) >= 0; }).map(function (id) {
        var on = cols.indexOf(id) >= 0;
        return el("button", { type: "button", class: "vu-chip", "aria-pressed": String(on), text: lbl(Q.field(id), tf), onclick: function () { var next = on ? cols.filter(function (c) { return c !== id; }) : cols.concat([id]); try { store().setItem(TABLE_KEY, JSON.stringify(next)); } catch (e) { /* privat */ } render(); } });
      }))]);
      var use = cols.filter(function (id) { return Q.field(id) && Q.field(id).tfs.indexOf(tf) >= 0; });
      var rows = idx.map(function (i) { var r = ds.row(i), b = befund(r, wanted); return { r: r, muster: b ? b.textContent.replace(/^[▲▼] /, "") : "–", up: b && b.classList.contains("is-up") }; });
      function csv() {
        var head = ["Kürzel", "Name", "Muster"].concat(use.map(function (id) { return lbl(Q.field(id), tf); }), ["Kurs"]);
        var lines = [head].concat(rows.map(function (x) { return [x.r.s, x.r.n, x.muster].concat(use.map(function (id) { var v = x.r[Q.columnKey(id, tf)]; return isNum(v) ? String(Q.field(id).kind === "pct" ? Math.round(v * 10000) / 100 : Math.round(v * 100) / 100).replace(".", ",") : ""; }), [isNum(x.r.close) ? String(x.r.close).replace(".", ",") : ""]); }));
        var txt = lines.map(function (l) { return l.map(function (c) { c = String(c == null ? "" : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(";"); }).join("\n");
        var a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv" })), download: "technical-screener.csv" }); doc.body.append(a); a.click(); a.remove();
      }
      return el("div", { class: "tc-profi" }, [pick,
        el("div", { class: "tc-table-wrap" }, el("table", { class: "tc-table tc-ptable" }, [
          el("thead", {}, el("tr", {}, [el("th", { scope: "col", text: "Aktie" }), el("th", { scope: "col", text: "Muster" })].concat(use.map(function (id) { return el("th", { scope: "col", class: "num", text: lbl(Q.field(id), tf) }); }), [el("th", { scope: "col", class: "num", text: "Kurs" })]))),
          el("tbody", {}, rows.map(function (x) {
            return el("tr", {}, [el("th", { scope: "row" }, el("a", { href: M.chartHref(x.r.s), text: x.r.s })), el("td", { class: "tc-pt-muster" + (x.up ? " is-up" : ""), text: x.muster })]
              .concat(use.map(function (id) { var v = x.r[Q.columnKey(id, tf)]; return el("td", { class: "num", text: isNum(v) ? valueText(id, v) : "–" }); }), [el("td", { class: "num", text: M.price(x.r.close) })]));
          }))])),
        el("p", { class: "tc-note", text: "Profi-Ansicht: Tabelle mit frei wählbaren Spalten. Gezeigt werden die Treffer der aktuellen Suche." }),
        el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--sm", text: "Als CSV exportieren", onclick: csv })]);
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
  /* Gespeicherte Suchen (T04). Gezaehlt wird heute; die Aenderung seit dem letzten Besuch steht in diesem Browser. */
  var SEEN_KEY = "vu-technical-saved-seen-v1";
  /* Z4: Benachrichtigungen über die App (konto/push-settings.js, erst beim Antippen geladen). Neue Treffer einer
     Suche gibt es als Ereignisart noch nicht; das Sheet sagt es und zeigt die Arten für Titel der Watchlist. */
  function openPush() {
    var p = global.__vuPushP || (global.__vuPushP = global.VUPush ? Promise.resolve() : new Promise(function (done) {
      var s = doc.createElement("script"); s.src = "/konto/push-settings.js"; s.onload = s.onerror = function () { done(); }; doc.head.appendChild(s); }));
    p.then(function () { if (global.VUPush) global.VUPush.open({ focus: ["SEARCH_HITS", "SUPERTRADER_SIGNAL", "PRICE_EVENT"] }); });
  }
  /* Z3: Suchen im Konto (konto/saved-searches.js), Abfrage { params }; ohne Anmeldung nur in diesem Browser. */
  var SS = global.VUSavedSearches || null, acctState = null, acctSynced = false, acctMsg = null;
  var acct = { world: "technical",
    list: function () { return M.loadScreens(store()).map(function (x) { return { id: x.id, name: x.name, query: { params: x.params }, acct: x.acct || null }; }); },
    link: function (id, a) { M.linkScreen(store(), id, a); }, unlink: function (id) { M.linkScreen(store(), id, null); },
    add: function (r) { M.addRemoteScreen(store(), r); } };
  function acctMirror(id, msg) { if (SS && id) SS.saved(acct, id).then(function (r) { if (msg && r && r.ok === false && r.message) msg.textContent = r.message; }); }
  function acctBox() {
    var box = el("div", { class: "vu-stack tc-acct" });
    function paint(st) {
      put(box, [h(U.help(acctMsg || (SS ? SS.line(st) : "Ohne Anmeldung bleiben Suchen nur in diesem Browser."))),
        st && st.signedIn && st.pending ? el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--block", onclick: function () {
          this.disabled = true;
          SS.pushPending(acct).then(function (r) { acctMsg = r.state !== "OK" ? r.message || null : null; acctSynced = false; render(); });
        } }, [glyph("save"), "Im Konto speichern"])
        : !st || st.signedIn === false ? h(U.navcard({ href: "/konto/anmelden/?next=" + encodeURIComponent(location.pathname + location.hash), glyph: "grid", title: "Mit Konto auf allen Geräten", sub: "Anmelden, dann liegen deine Suchen im Konto (bis zu 50)." })) : null]);
    }
    paint(acctState);
    if (SS && !acctSynced) {
      acctSynced = true;
      var before = M.loadScreens(store()).length;
      SS.sync(acct).then(function (st) { acctState = st; if (M.loadScreens(store()).length !== before) render(); else paint(st); });
    }
    return box;
  }
  function seenMap() { try { var v = JSON.parse(store().getItem(SEEN_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function viewSaved(main) {
    var list = M.loadScreens(store()), status = el("p", { class: "tc-note", role: "status" }), seen = seenMap();
    var head = pageHead(null, "Screener", null);
    var fileIn = el("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      f.text().then(function (txt) { var r = M.importScreens(store(), txt); status.textContent = r.ok ? r.added + " übernommen, " + r.skipped + " übersprungen (doppelt, ungültig oder Liste voll)." : "Import nicht möglich (" + r.error + ")."; if (r.ok && r.added) render(); });
    } });
    var tools = el("div", { class: "tc-morerow" }, [el("span", { class: "vu-ltag", text: "Mehr" }),
      el("button", { type: "button", class: "vu-chip", text: "Exportieren (JSON)", disabled: list.length ? null : true, onclick: function () {
        var a = el("a", { href: URL.createObjectURL(new Blob([M.exportScreens(store())], { type: "application/json" })), download: "technical-suchstrategien.json" }); doc.body.append(a); a.click(); a.remove();
      } }),
      el("button", { type: "button", class: "vu-chip", text: "Importieren", onclick: function () { fileIn.click(); } }), fileIn]);
    var rows = list.map(function (sv) {
      var sp = M.parseRoute("#/screener?" + sv.params).params || {}, svT = sp.vorlage && TPL.get(sp.vorlage) ? TPL.compose(sp.vorlage, TPL.blocksFromParam(sp.plus)) : null;
      var q = svT ? null : queryOfParams(sv.params), desc = svT ? "Vorlage: " + svT.title + (svT.blocks.length ? " + " + svT.blocks.map(function (b) { return TPL.block(b).title; }).join(", ") : "") : M.plain(Q.describe(q)) || "–";
      var count = el("b", { class: "num", text: "…" }), delta = el("span", { class: "tc-delta" });
      var svHref = svT ? TPL.href(svT.id, svT.blocks) : "#/screener?" + sv.params;
      var nameIn = el("input", { class: "tc-input tc-input-s", value: sv.name, maxlength: "60", "aria-label": "Name ändern" });
      var edit = el("form", { class: "tc-brow", hidden: true, onsubmit: function (ev) { ev.preventDefault(); M.updateScreen(store(), sv.id, { name: nameIn.value }); if (sv.acct) acctMirror(sv.id); render(); } },
        [nameIn, el("button", { class: "vu-btn vu-btn--sm", type: "submit", text: "Übernehmen" })]);
      loadScreener().then(function (D) {
        var n = svT ? TPL.evaluate(D.ds, svT).full.length : (function () { var r = Q.evaluate(D.ds, Object.assign({}, q, { limit: 1 })); return r.error ? null : r.count; })();
        count.textContent = isNum(n) ? n.toLocaleString("de-DE") : "–";
        /* Aenderung gegenueber dem zuletzt gesehenen Kursstand (je Browser gemerkt, kein Konto noetig). */
        var asOf = D.meta && D.meta.asOf, e = seen[sv.id], cur = e;
        if (isNum(n) && (!e || e.asOf !== asOf)) { cur = e ? { n: n, asOf: asOf, prevN: e.n, prevAsOf: e.asOf } : { n: n, asOf: asOf }; seen[sv.id] = cur; try { store().setItem(SEEN_KEY, JSON.stringify(seen)); } catch (x) { /* privat */ } }
        var d = cur && isNum(cur.prevN) && isNum(n) ? n - cur.prevN : null;
        put(delta, d ? el("span", { class: "vu-chip vu-chip--lime tc-new", text: (d > 0 ? "+ " : "− ") + Math.abs(d).toLocaleString("de-DE") + " seit " + dShort(cur.prevAsOf) }) : el("span", { class: "tc-note", text: d === 0 ? "keine Änderung" : "Stand " + dShort(asOf) }));
      }).catch(function () { count.textContent = "–"; });
      return el("div", { class: "vu-box tc-saved" }, [
        el("a", { class: "tc-saved-title", href: svHref }, [el("b", { text: sv.name }), el("span", { class: "tc-row-text" }, el("span", { text: desc }))]),
        el("div", { class: "tc-saved-line" }, [el("span", { class: "tc-hit-score" }, [count, el("span", { text: " Treffer" })]), delta,
          el("button", { type: "button", class: "tc-bell", "aria-label": "Benachrichtigungen zu „" + sv.name + "“", onclick: function () { openPush(); } }, [h(U.glyph("bell", 16))])]),
        el("details", { class: "tc-saved-more" }, [el("summary", { text: "Mehr" }), el("div", { class: "tc-brow tc-saved-actions" }, [
          el("span", { class: "tc-note", text: (sv.updatedAt ? "Geändert am " + M.dateDe(sv.updatedAt.slice(0, 10)) : "Gespeichert am " + M.dateDe(sv.createdAt.slice(0, 10))) +
            (sv.migrated ? " · angepasst: „" + sv.migrated.from + "“ heißt jetzt „" + sv.migrated.to + "“ (gleiche Bedeutung)" : "") }),
          el("button", { type: "button", class: "vu-chip", text: "Umbenennen", onclick: function () { edit.hidden = !edit.hidden; if (!edit.hidden) nameIn.focus(); } }),
          el("button", { type: "button", class: "vu-chip", text: "Link kopieren", onclick: function () {
            var url = location.origin + location.pathname + svHref;
            (global.navigator && navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { status.textContent = "Link kopiert."; }, function () { status.textContent = url; });
          } }),
          el("button", { type: "button", class: "vu-chip", text: "Löschen", onclick: function () { M.deleteScreen(store(), sv.id); if (SS && sv.acct) SS.removed(sv.acct); render(); } })]), edit])]);
    });
    var body = list.length ? [el("p", { class: "vu-ltag tc-count-h", text: list.length + (list.length === 1 ? " Suche" : " Suchen") }), el("div", { class: "vu-stack tc-list" }, rows),
      h(U.help("Die Glocke öffnet die Benachrichtigungen der App. Neue oder herausgefallene Aktien einer Suche meldet sie noch nicht; diese Seite zeigt die Änderung seit deinem letzten Besuch.")),
      acctBox(),
      el("a", { class: "vu-btn vu-btn--line vu-btn--block", href: "#/screener" }, [h(U.glyph("plus", 18)), "Neue Suche"])]
      : [el("div", { class: "tc-empty" }, [el("span", { class: "tc-empty-ico", "aria-hidden": "true" }, glyph("save")), el("h2", { class: "vu-mt", text: "Noch nichts gespeichert" }),
          el("p", { class: "vu-lead", text: "Speichere eine Suche, dann siehst du hier jeden Tag, wie viele Aktien sie trifft." })]),
        el("a", { class: "vu-btn vu-btn--block", href: "#/screener", text: "Erste Suche starten" }),
        el("a", { class: "vu-btn vu-btn--line vu-btn--block", href: "#/screener?reiter=vorlagen", text: "Vorlage wählen" }),
        acctBox()];
    put(main, [head, screenerTabs("saved")].concat(body, [tools, status]));
  }

  /* ------------------------------------------------- Strategie-Vorlagen */
  /* AP8 S1 (docs/technical/STRATEGY_TEMPLATES_PLAN.md): Auswahl, Kriterien, Trendfilter, Treffer nach Erfuellung.
     Gerechnet wird nur mit bestehenden Feldern (engine/templates.js); unbekannt zaehlt nie als erfuellt. */
  var MARK = { PASS: ["✓", "erfüllt", "is-pass"], FAIL: ["✗", "nicht erfüllt", "is-fail"], UNKNOWN: ["?", "unbekannt", "is-unknown"] };
  var SHOW = { voll: "full", fast: "near", offen: "incomplete" };
  function templateHead(back, backText, eyebrow, title, lead) {
    return el("header", { class: "tc-head" }, [
      el("a", { class: "tc-back", href: back }, [glyph("back"), backText]),
      eyebrow ? el("p", { class: "tc-eyebrow", text: eyebrow }) : null,
      el("h1", { class: "tc-title", text: title }),
      el("p", { class: "tc-lead", text: lead })
    ]);
  }
  function viewTemplates(main, route) {
    return route.id ? viewTemplate(main, route) : viewTemplateList(main);
  }
  /* Vorlagen (T03): Reiter im Screener, Gruppen mit Alltagstiteln, Fachname klein, Trefferzahl, „+x fast“. */
  function viewTemplateList(main) {
    var body = el("div", { class: "tc-tpl-groups" }, [el("div", { class: "tc-skel", style: "height:320px" })]);
    put(main, [pageHead(null, "Vorlagen", "Fertige Suchen. Tippe eine an und sieh die Treffer."), screenerTabs("templates"), body]);
    loadIndex().then(function (X) {
      var ix = X.index;
      put(body, TPL.GROUPS.map(function (g) {
        return el("section", { class: "tc-tpl-group", "aria-label": g.title }, [sect(GROUP_PLAIN[g.id] || g.title),
          el("div", { class: "tc-list" }, TPL.list().filter(function (t) { return t.group === g.id; }).map(function (t) { return templateRow(t.id, ix); }))]);
      }).concat([
        h(U.help("„+433 fast“: so viele Aktien erfüllen alle Regeln bis auf eine. Gut für die Watchlist.")),
        el("p", { class: "tc-note", text: "In jeder Vorlage lassen sich Trendfilter (kurz-, mittel- und langfristig, Trendstärke) dazunehmen. Gezählt werden nur Aktien mit aktuellem Kurs." }),
        disclaimer(X.meta)]));
      prefetchScreener();
    }).catch(function () {
      put(body, stateBox("Vorlagen derzeit nicht verfügbar", "Der Index der Startseite konnte nicht geladen werden."));
    });
  }
  /** Regelliste in Worten (T03 b): nummeriert, Alltagssatz fett, Fachformel klein, je Regel die Zahl der erfuellten Titel. */
  function criteriaCard(t, res) {
    return el("ol", { class: "vu-box tc-rules tc-tpl-crit" }, t.criteria.map(function (x, k) {
      var fz = res && res.funnel[k];
      return el("li", { class: "tc-crit" }, [el("span", { class: "tc-rule-n num", "aria-hidden": "true", text: String(k + 1) }), el("span", {}, [
        el("b", { text: x.why || x.label }), x.from ? el("span", { class: "tc-mini", text: "Trendfilter" }) : null,
        el("small", { class: "tc-crit-why", text: x.label + (fz ? " · erfüllt bei " + fz.pass.toLocaleString("de-DE") + (fz.unknown ? ", unbekannt bei " + fz.unknown.toLocaleString("de-DE") : "") : "") })])]);
    }));
  }
  /** Haken je Kriterium (✓ erfuellt, ✗ nicht erfuellt, ? unbekannt) mit ausgeschriebenem Text fuer Screenreader. */
  function ticks(t, states) {
    return el("ul", { class: "tc-ticks", "aria-label": "Kriterien" }, states.map(function (s, k) {
      var m = MARK[s];
      return el("li", { class: m[2], title: t.criteria[k].label + ": " + m[1] }, [el("span", { "aria-hidden": "true", text: m[0] }), el("span", { class: "tc-sr", text: t.criteria[k].label + ": " + m[1] })]);
    }));
  }
  function viewTemplate(main, route) {
    var base = TPL.get(route.id);
    if (!base) { put(main, [pageHead(null, "Vorlage nicht gefunden", "Diese Vorlage gibt es nicht (mehr).", ["#/screener?reiter=vorlagen", "Vorlagen"])]); return; }
    var p = route.params || {}, blocks = TPL.blocksFromParam(p.plus), showKey = SHOW[p.zeige] ? p.zeige : "voll";
    var t = TPL.compose(base.id, blocks), n = t.criteria.length;
    var head = pageHead(null, plainTitle(base), t.title + ". " + (n > 1 ? "Alle " + n + " Regeln müssen gleichzeitig stimmen." : "Eine Regel."), ["#/screener?reiter=vorlagen", "Vorlagen"]);
    var body = el("div", { class: "tc-screener" }), results = el("section", { class: "tc-results-sec", id: "tc-treffer", "aria-live": "polite" });
    put(main, [head, body, results]);
    /* Beim ersten Oeffnen laedt der Screener-Datensatz (gzip rund 1,5 MB, mobil mehrere Sekunden): sichtbarer Zustand statt leerer Seite. */
    if (!dataset) { results.setAttribute("aria-busy", "true"); put(results, [el("p", { class: "tc-note", text: "Treffer werden berechnet. Beim ersten Öffnen lädt der Screener-Datensatz für alle Aktien." }), el("div", { class: "tc-skel", style: "height:220px" })]); }
    Promise.all([loadScreener(), loadSpark()]).then(function (r) {
      var D = r[0];
      results.removeAttribute("aria-busy");
      var ds = D.ds, res = TPL.evaluate(ds, t), nearOk = t.criteria.length >= TPL.NEAR_MIN;
      var blockPills = el("div", { class: "tc-wrapchips" }, TPL.BLOCKS.map(function (B) {
        var on = blocks.indexOf(B.id) >= 0;
        return el("button", { type: "button", class: "vu-chip tc-pill" + (on ? " is-on" : ""), "aria-pressed": String(on), text: B.title, onclick: function () {
          var next = on ? blocks.filter(function (x) { return x !== B.id; }) : blocks.concat([B.id]);
          location.hash = TPL.href(base.id, next, showKey);
        } });
      }));
      var trend = el("details", { class: "tc-filter vu-box", open: blocks.length ? true : null }, [
        el("summary", {}, [el("b", { text: "Trendfilter dazunehmen" + (blocks.length ? " (" + blocks.length + ")" : "") }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [blockPills, el("p", { class: "tc-note", text: "Jeder gewählte Trendfilter kommt als zusätzliche Regel hinzu (alle müssen erfüllt sein)." })])]);
      var seg = [["voll", "Erfüllt", res.full.length]];
      if (nearOk) seg.push(["fast", "Fast erfüllt", res.near.length]);
      if (res.incomplete.length || showKey === "offen") seg.push(["offen", "Unvollständig", res.incomplete.length]);
      if (!seg.some(function (x) { return x[0] === showKey; })) showKey = "voll";
      var segBar = el("div", { class: "vu-seg tc-tpl-seg", role: "tablist", "aria-label": "Treffer nach Erfüllung" }, seg.map(function (x) {
        return el("a", { role: "tab", "aria-selected": String(showKey === x[0]), href: TPL.href(base.id, blocks, x[0]) }, [x[1] + " ", el("b", { class: "num", text: x[2].toLocaleString("de-DE") })]);
      }));
      var tiles = el("div", { class: "vu-grid tc-tpl-tiles" }, [
        el("div", { class: "vu-tile tc-tile-lime" }, [el("div", { class: "vu-tile__label", text: "Erfüllt" }), el("div", { class: "vu-tile__value num", text: res.full.length.toLocaleString("de-DE") })]),
        nearOk ? el("div", { class: "vu-tile" }, [el("div", { class: "vu-tile__label", text: "Eine Regel fehlt" }), el("div", { class: "vu-tile__value num", text: res.near.length.toLocaleString("de-DE") })])
          : el("div", { class: "vu-tile" }, [el("div", { class: "vu-tile__label", text: "Ohne aktuellen Kurs" }), el("div", { class: "vu-tile__value num", text: (res.excluded || 0).toLocaleString("de-DE") })])]);
      var sortNote = t.sort && t.sort.field && Q.field(t.sort.field) ? "Sortiert nach " + lbl(Q.field(t.sort.field), "1D") + ". " : "";
      var saveName = el("input", { class: "tc-input tc-input-s", type: "text", maxlength: "60", placeholder: "Name der Suche", "aria-label": "Name der Suche" });
      var saveMsg = el("p", { class: "tc-note", role: "status" });
      var saveForm = el("form", { class: "tc-save-form", hidden: true, onsubmit: function (ev) {
        ev.preventDefault();
        var r2 = M.saveScreen(store(), saveName.value.trim() || (plainTitle(base) + " (Vorlage)" + (blocks.length ? " + " + blocks.map(function (b) { return TPL.block(b).title; }).join(", ") : "")).slice(0, 60), TPL.paramsOf(base.id, blocks));
        saveMsg.textContent = r2.ok ? "Gespeichert. Zu finden unter „Gespeichert“." : "Speichern nicht möglich (Browser-Speicher gesperrt).";
        if (r2.ok) acctMirror(r2.id, saveMsg);
      } }, [saveName, el("button", { class: "vu-btn vu-btn--sm", type: "submit", text: "Speichern" })]);
      var tq = TPL.toQuery(t);
      put(body, [tiles, sect("Die " + (n === 1 ? "Regel" : n + " Regeln") + " in Worten"), criteriaCard(t, res),
        el("p", { class: "tc-note" }, [sortNote + "Genaue Formeln unter ", el("a", { class: "tc-link", href: "#/muster?reiter=regeln", text: "Muster → Regeln" }), " ", h(U.pro())]),
        t.note ? el("p", { class: "tc-note", text: t.note }) : null,
        trend, segBar,
        el("a", { class: "vu-btn vu-btn--block", href: "#tc-treffer", onclick: function (ev) { ev.preventDefault(); results.scrollIntoView({ behavior: "smooth", block: "start" }); }, text: "Treffer ansehen" }),
        el("div", { class: "tc-actions2" }, [el("a", { class: "vu-btn vu-btn--line", href: "#/screener?" + TPL.paramsOf(base.id, blocks), text: "Anpassen" }),
          el("button", { type: "button", class: "vu-btn vu-btn--line tc-save-btn", onclick: function () { saveForm.hidden = !saveForm.hidden; if (!saveForm.hidden) saveName.focus(); } }, [glyph("save"), "Speichern"])]),
        saveForm, saveMsg,
        tq.dropped.length ? el("p", { class: "tc-note", text: "Im Screener nicht wählbar und dort deshalb weggelassen: " + tq.dropped.join(", ") + "." }) : null,
        el("p", { class: "tc-note", text: "Voraussetzung: aktueller Kurs am Stichtag. " + TPL.LIMITS })]);
      renderTemplateHits(D, t, res, showKey, blocks);
    }).catch(function (e) {
      put(body, stateBox("Daten derzeit nicht verfügbar", "Der Screener-Datensatz konnte nicht geladen werden (" + String(e && e.message || e) + ")."));
    });

    function renderTemplateHits(D, t, res, showKey, blocks) {
      var ds = D.ds, entries = res[SHOW[showKey]], shown = 0, PAGE = 40, list = el("div", { class: "vu-box tc-hits" });
      var tq = TPL.toQuery(t), wanted = M.wantedFormations(tq.query), chartQ = "v=" + encodeURIComponent(t.id) + (blocks.length ? "&plus=" + blocks.join(",") : "");
      var more = el("button", { type: "button", class: "vu-btn vu-btn--line vu-btn--block tc-more", text: "Weitere anzeigen", onclick: function () { page(); } });
      function page() { entries.slice(shown, shown + PAGE).forEach(function (e) { list.append(checklistHit(ds, t, e, chartQ, wanted)); }); shown = Math.min(entries.length, shown + PAGE); more.hidden = shown >= entries.length; count.textContent = "Gezeigt: " + shown.toLocaleString("de-DE") + " von " + entries.length.toLocaleString("de-DE") + "."; }
      var count = el("p", { class: "tc-note" });
      var EMPTY = { voll: ["Keine Aktie erfüllt alle Regeln", "Mit weniger Trendfiltern oder unter „Fast erfüllt“ finden sich Aktien, denen genau eine Regel fehlt."],
        fast: ["Keine Aktie mit genau einer fehlenden Regel", "Alle übrigen Aktien verfehlen mindestens zwei Regeln oder haben unbekannte Werte."],
        offen: ["Keine unvollständigen Treffer", "Für alle eingeordneten Aktien sind alle Regeln bekannt."] }[showKey];
      var EXPLAIN = { voll: "Alle Regeln erfüllt.", fast: "Genau eine Regel nicht erfüllt, alle anderen erfüllt. Sortiert nach der fehlenden Regel.",
        offen: "Keine Regel verfehlt, aber mindestens eine unbekannt (z. B. zu kurze Kurshistorie). Unbekannt zählt nicht als erfüllt." }[showKey];
      put(results, [sect("Treffer"), el("p", { class: "tc-note", text: EXPLAIN }),
        entries.length ? list : stateBox(EMPTY[0], EMPTY[1]), count, more,
        res.excluded ? el("p", { class: "tc-note", text: res.excluded.toLocaleString("de-DE") + " Aktien ohne aktuellen Kurs (hinter dem Stichtag oder eingefroren) sind nicht eingeordnet." }) : null,
        disclaimer(D.meta)]);
      page();
    }
  }
  /* ------------------------------------------------------- Analyse-Assistent (T1/T2, engine/assistant.js) */
  /* Ziel waehlen -> Zweck -> Kriterien (an/aus, Begriffe erklaert) -> Abfrage sichtbar und im Screener bearbeitbar
     -> Treffer mit Checkliste -> Chart Studio mit Pruefleiste -> Grenzen und Evidenz-Ebenen. Gerechnet wird nur
     mit templates.js#evaluate auf den Praedikaten von technical-query.js. */
  /* ------------------------------------------------------- Lernen (TX05) */
  /* Anzeige-Namen und Sätze der acht Lernpfade (Vorlage c-lernen); Inhalte und Lektionen bleiben in academy/content.json. */
  var PATH_PLAIN = {
    struktur: ["Chart lesen", "Kurskerze, Struktur, Unterstützung und Widerstand", "range"], trend: ["Trendfolge", "200-Tage-Linie, relative Stärke", "trend"],
    breakout: ["Ausbrüche", "Dreiecke, Bestätigung, Fehlausbrüche", "breakout"], momentum: ["Schwung", "RSI, MACD, Trend gegen Schwung", "pulse"],
    risiko: ["Schwankung und Risiko", "ruhige und unruhige Phasen", "contraction"], wechsel: ["Trendwechsel", "Doppelboden, Kopf-Schulter", "reversal"],
    zeitrahmen: ["Mehrere Zeitrahmen", "Tag, Woche, Monat", "clock"], routine: ["Eigene Routine", "in 10 Minuten durch einen Chart", "search"]
  };
  /* „Eine Frage an den Chart“: die Ziele des Analyse-Assistenten in Alltagsfragen; jede öffnet den Screener mit den Kriterien des Ziels. */
  var GOAL_QUESTION = { trendfolge: "Welche Aktien sind im Aufwärtstrend?", ausbruch: "Wo gibt es einen Ausbruch?", momentum: "Welche Aktien laufen besser als der Markt?",
    niveaus: "Wer steht an einer Unterstützung?", trendwende: "Wo dreht der Trend nach einem Rückgang?", ruhephase: "Welche Aktien bewegen sich gerade ruhig?",
    zeitrahmen: "Zeigen Tag, Woche und Monat in dieselbe Richtung?" };
  function viewLearn(main, focusReset) {
    var AM = global.VUAcademyModel, slot = el("div", {}, el("div", { class: "tc-skel", style: "height:220px" }));
    put(main, [el("header", { class: "tc-phead" }, [el("p", { class: "vu-ltag", text: "Lernen" }), el("h1", { class: "vu-lt", html: "Charts lesen<br>lernen" }),
      el("p", { class: "vu-lead", text: "8 Lernpfade, 32 kurze Lektionen. Fortschritt bleibt auf diesem Gerät." })]), slot]);
    fetchJSON("/technical/academy/content.json").then(function (c) {
      var done = AM ? AM.read(store(), c) : [], resume = null;
      try { resume = AM && AM.session(global.sessionStorage, c); } catch (e) { resume = null; }
      var byId = {}; c.lessons.forEach(function (l) { byId[l.id] = l; });
      var next = resume && byId[resume.id] ? byId[resume.id] : c.lessons.filter(function (l) { return done.indexOf(l.id) < 0; })[0] || c.lessons[0];
      var path = c.paths.filter(function (p) { return p.id === next.pathId; })[0] || c.paths[0], idx = path.lessons.indexOf(next.id);
      var pct = Math.round(done.length / c.lessons.length * 100);
      var today = el("a", { class: "tc-today", href: "#/akademie/" + next.id }, [el("div", { class: "tc-today-h" }, [el("div", {}, [el("span", { class: "vu-ltag tc-ltag", text: "Weiter mit" }),
        el("b", { text: (PATH_PLAIN[path.id] || [path.title])[0] + " · Lektion " + (idx + 1) }), el("span", { class: "tc-today-s", text: next.title })]), el("span", { class: "tc-go", "aria-hidden": "true" }, h(U.glyph("next", 18)))]),
        el("div", { class: "tc-prog" }, el("i", { style: "width:" + pct + "%" })), el("span", { class: "tc-today-s", role: "status", text: done.length + " von " + c.lessons.length + " Lektionen" })]);
      var paths = el("div", { class: "tc-lpg" }, c.paths.map(function (p) {
        var pp = PATH_PLAIN[p.id] || [p.title, "", "book"], first = p.lessons.filter(function (k) { return done.indexOf(k) < 0; })[0] || p.lessons[0];
        var n = p.lessons.filter(function (k) { return done.indexOf(k) >= 0; }).length;
        return el("a", { href: "#/akademie/" + first, "data-path": p.id, "aria-label": pp[0] + ": " + n + " von " + p.lessons.length + " Lektionen" }, [hudGlyph(pp[2], 34), el("b", { text: pp[0] }), el("span", { text: pp[1] }),
          el("div", { class: "tc-lp-d", "aria-hidden": "true" }, p.lessons.map(function (k) { return el("i", { class: done.indexOf(k) >= 0 ? "is-done" : null }); }))]);
      }));
      var goals = AS ? AS.list().filter(function (g) { return GOAL_QUESTION[g.id]; }) : [];
      var reset = el("button", { type: "button", class: "tc-linkbtn", text: "Lokalen Fortschritt zurücksetzen", onclick: function () { if (!global.confirm("Alle lokalen Lektionsabschlüsse zurücksetzen?")) return; if (AM) AM.save(store(), c, []); viewLearn(main, true); } });
      put(slot, [today, el("div", { class: "tc-st", text: "Lernpfade" }), paths,
        AM && AM.outdated(store(), c) ? el("p", { class: "tc-note", role: "status", text: "Lerninhalte wurden überarbeitet. Abschlüsse geänderter Lektionen müssen erneut markiert werden." }) : null,
        el("p", { class: "tc-note" }, [el("a", { class: "tc-link", href: "/academy/", text: "← Vision Universe Academy" }), " · ", el("a", { class: "tc-link", href: "#/akademie/glossar", text: "Glossar" }), " · ", reset]),
        goals.length ? el("div", { class: "tc-st", text: "Eine Frage an den Chart" }) : null,
        goals.length ? el("div", { class: "vu-chips tc-asks" }, goals.map(function (g) { return el("a", { class: "vu-chip", href: "#/screener?z=" + encodeURIComponent(g.id), text: GOAL_QUESTION[g.id] }); })) : null,
        goals.length ? h(U.help("Jede Frage öffnet den Screener mit passenden Regeln. Wie die Regeln gewählt sind, steht beim Ziel im Screener. Beispiele in den Lektionen sind konstruiert; keine Anlageempfehlung.")) : null,
        footNote(null)]);
      if (focusReset) reset.focus({ preventScroll: true });
    }).catch(function () { put(slot, stateBox("Lerninhalte nicht geladen", "Die Lektionen konnten nicht geladen werden.", el("a", { class: "tc-link", href: "#/lernen", text: "Erneut versuchen" }))); });
  }
  function viewAssistant(main, route) {
    if (!AS) { put(main, [templateHead("#/", "Technical", null, "Analyse-Assistent", "Der Assistent ist derzeit nicht verfügbar."), tabs(MAIN_TABS, "learn")]); return; }
    return route.id ? viewGoal(main, route) : viewGoalList(main);
  }
  function stepHead(n, title) { return el("h2", { class: "tc-step" }, [el("span", { class: "tc-step-n num", "aria-hidden": "true", text: String(n) }), el("span", { class: "tc-sr", text: "Schritt " + n + ": " }), title]); }
  function viewGoalList(main) {
    var head = templateHead("#/", "Technical", null, "Analyse-Assistent", "Welche Frage möchtest du an den Chart stellen? Wähle ein Ziel – der Assistent schlägt passende, geprüfte Kriterien vor und erklärt Treffer und Grenzen.");
    var list = el("div", { class: "tc-list tc-goals" }, AS.list().map(function (g) {
      return el("a", { class: "tc-row tc-goal", href: AS.href(g.id) }, [
        el("span", { class: "tc-row-icon" }, glyph(g.icon)),
        el("span", { class: "tc-row-text" }, [el("b", { text: g.title }), el("span", { text: g.question })]),
        glyph("chevron", "tc-chev")]);
    }));
    put(main, [head, tabs(MAIN_TABS, "learn"), stepHead(1, "Analyseziel wählen"), list,
      el("p", { class: "tc-note", text: "Kein Ziel ist eine Handlungsempfehlung. Jede Ansicht nennt, was historisch untersucht ist und was nicht." })]);
  }
  function termDetails(id) {
    var tm = AS.term(id); if (!tm) return null;
    return el("details", { class: "tc-term" }, [el("summary", { text: "Begriff: " + tm.title }), el("p", { text: tm.text })]);
  }
  function viewGoal(main, route) {
    var g = AS.get(route.id);
    if (!g) { put(main, [templateHead("#/lernen", "Lernen", null, "Analyseziel nicht gefunden", "Dieses Ziel gibt es nicht (mehr)."), tabs(MAIN_TABS, "learn")]); return; }
    var p = route.params || {}, sel = AS.selectionFromParam(g, p.k), showKey = SHOW[p.zeige] ? p.zeige : "voll", t = AS.build(g.id, sel);
    var head = templateHead("#/lernen", "Lernen", "ANALYSEZIEL", g.title, g.question);
    /* Schritt 2: Zweck und allgemein erklaerte Methodik */
    var purpose = el("section", { class: "tc-goal-sec", "aria-labelledby": "tc-g-purpose" }, [
      el("div", { id: "tc-g-purpose" }, stepHead(2, "Zweck")), el("p", { class: "tc-lead-s", text: g.purpose }),
      el("details", { class: "tc-term" }, [el("summary", { text: "Wie diese Analyse üblicherweise verstanden wird" }), el("p", { text: g.method })])]);
    /* Schritt 3: Kriterien an/aus */
    var opts = AS.options(g), termSeen = {};
    var critList = el("ul", { class: "tc-opts" }, opts.map(function (x) {
      /* Jeder Begriff wird nur beim ersten Kriterium erklaert. */
      var showTerm = x.term && !termSeen[x.term]; if (x.term) termSeen[x.term] = 1;
      var on = sel.indexOf(x.id) >= 0;
      return el("li", { class: "tc-opt" + (on ? " is-on" : "") }, [
        el("label", { class: "tc-check" }, [el("input", { type: "checkbox", checked: on, onchange: function () {
          var next = on ? sel.filter(function (k) { return k !== x.id; }) : sel.concat([x.id]);
          location.hash = AS.href(g.id, opts.map(function (y) { return y.id; }).filter(function (k) { return next.indexOf(k) >= 0; }), showKey);
        } }), el("span", {}, [el("b", { text: x.label }), el("span", { class: "tc-crit-why", text: x.why })])]),
        showTerm ? termDetails(x.term) : null]);
    }));
    var crit = el("section", { class: "tc-goal-sec", "aria-labelledby": "tc-g-crit" }, [el("div", { id: "tc-g-crit" }, stepHead(3, "Kriterien")),
      el("p", { class: "tc-note", text: "Vorgeschlagen sind die üblichen Kriterien dieses Ziels. Weitere lassen sich dazunehmen, jedes muss erfüllt sein. " + AS.TERMS.combine.text }), critList]);
    var query = el("section", { class: "tc-goal-sec", "aria-labelledby": "tc-g-query" }), results = el("section", { class: "tc-results-sec tc-goal-sec", id: "tc-treffer", "aria-live": "polite" });
    var limits = el("section", { class: "tc-goal-sec", "aria-labelledby": "tc-g-limits" }, [el("div", { id: "tc-g-limits" }, stepHead(6, "Was die Analyse sagt – und was nicht")),
      el("ol", { class: "tc-levels" }, AS.LEVELS.map(function (L) {
        var txt = L.id === "METHOD" ? "Beschrieben unter „Zweck“." : L.id === "CRITERIA" ? "Die gewählten Kriterien sind eindeutig definiert und im Chart Studio nachprüfbar." : L.id === "OBSERVED" ? g.evidence.text : AS.EDGE_TEXT;
        var state = L.id === "EDGE" ? "is-fail" : L.id === "OBSERVED" ? "is-unknown" : "is-pass", mark = L.id === "EDGE" ? "✗" : L.id === "OBSERVED" ? "~" : "✓";
        return el("li", { class: "tc-level " + state }, [el("span", { class: "tc-crit-mark", "aria-hidden": "true", text: mark }), el("span", {}, [el("b", { text: L.title }), el("span", { class: "tc-crit-why", text: txt })])]);
      })),
      el("ul", { class: "tc-limits" }, AS.LIMITS.map(function (x) { return el("li", { text: x }); })),
      el("p", { class: "tc-note" }, [el("a", { class: "tc-link", href: "#/muster?reiter=regeln", text: "Historische Auswertungen unter Muster → Regeln" })]),
      g.templates && g.templates.length ? el("p", { class: "tc-note" }, ["Passende Vorlagen: "].concat(g.templates.filter(function (id) { return !!TPL.get(id); }).map(function (id, k) {
        return [k ? ", " : "", el("a", { class: "tc-link", href: TPL.href(id), text: TPL.get(id).title })];
      }))) : null]);
    /* Schritt 1 (gewaehlt) und Sprungmarken: auf dem iPhone ist die Seite lang, die Treffer liegen weit unten. */
    function jump(id, text) { return el("a", { class: "tc-pill", href: "#", onclick: function (ev) { ev.preventDefault(); var n = doc.getElementById(id); if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }); }, text: text }); }
    var chosen = el("div", { class: "tc-goal-chosen" }, [stepHead(1, "Ziel gewählt"), el("p", { class: "tc-note" }, [g.title + " · ", el("a", { class: "tc-link", href: "#/assistent", text: "anderes Ziel wählen" })]),
      el("nav", { class: "tc-pills tc-goal-jumps", "aria-label": "Abschnitte" }, [jump("tc-g-crit", "Kriterien"), jump("tc-g-query", "Abfrage"), jump("tc-treffer", "Treffer"), jump("tc-g-limits", "Grenzen")])]);
    put(main, [head, tabs(MAIN_TABS, "learn"), chosen, purpose, crit, query, results, limits]);
    if (!t) {
      put(query, [el("div", { id: "tc-g-query" }, stepHead(4, "Abfrage")), stateBox("Kein Kriterium gewählt", "Bitte mindestens ein Kriterium auswählen.", el("a", { class: "tc-link", href: AS.href(g.id), text: "Vorschlag wiederherstellen" }))]);
      return;
    }
    var tq = AS.toQuery(g.id, sel);
    put(query, [el("div", { id: "tc-g-query" }, stepHead(4, "Abfrage")),
      el("div", { class: "tc-preset" }, [el("b", { text: "So sucht der Screener" }), el("p", { class: "tc-query-text", text: "Aktueller Kurs und " + M.plain(Q.describe(Object.assign({}, tq.query, { groups: [{ op: "AND", filters: tq.query.groups[0].filters.slice(1) }] }))) }),
        el("a", { class: "tc-link", href: "#/screener?" + AS.paramsOf(g.id, sel), text: "Im Screener bearbeiten" })])]);
    if (!dataset) { results.setAttribute("aria-busy", "true"); put(results, [stepHead(5, "Treffer"), el("p", { class: "tc-note", text: "Treffer werden berechnet. Beim ersten Öffnen lädt der Screener-Datensatz für alle Aktien." }), el("div", { class: "tc-skel", style: "height:220px" })]); }
    loadScreener().then(function (D) {
      results.removeAttribute("aria-busy");
      var ds = D.ds, res = TPL.evaluate(ds, t), nearOk = t.criteria.length >= TPL.NEAR_MIN;
      var seg = [["voll", "Erfüllt", res.full.length]];
      if (nearOk) seg.push(["fast", "Fast erfüllt", res.near.length]);
      if (res.incomplete.length || showKey === "offen") seg.push(["offen", "Unvollständig", res.incomplete.length]);
      if (!seg.some(function (x) { return x[0] === showKey; })) showKey = "voll";
      var segBar = el("div", { class: "tc-seg tc-tpl-seg", role: "tablist", "aria-label": "Treffer nach Erfüllung" }, seg.map(function (x) {
        return el("a", { role: "tab", class: "tc-seg-b" + (showKey === x[0] ? " is-on" : ""), "aria-selected": String(showKey === x[0]), href: AS.href(g.id, sel, x[0]) }, [x[1] + " ", el("b", { class: "num", text: x[2].toLocaleString("de-DE") })]);
      }));
      /* Trichter: je Kriterium, wie viele Aktien es erfuellen bzw. unbekannt sind */
      var funnel = el("ul", { class: "tc-goal-funnel" }, res.funnel.map(function (f) {
        return el("li", {}, [el("span", { text: f.label }), el("b", { class: "num", text: f.pass.toLocaleString("de-DE") }), f.unknown ? el("span", { class: "tc-mini", text: f.unknown.toLocaleString("de-DE") + " unbekannt" }) : null]);
      }));
      var entries = res[SHOW[showKey]], shown = 0, PAGE = 30, list = el("div", { class: "tc-hits" }), chartQ = AS.paramsOf(g.id, sel), wanted = M.wantedFormations(tq.query);
      var count = el("p", { class: "tc-note" }), more = el("button", { type: "button", class: "tc-btn tc-btn-ghost", text: "Weitere anzeigen", onclick: function () { page(); } });
      function page() { entries.slice(shown, shown + PAGE).forEach(function (e) { list.append(checklistHit(ds, t, e, chartQ, wanted)); }); shown = Math.min(entries.length, shown + PAGE); more.hidden = shown >= entries.length; count.textContent = "Gezeigt: " + shown.toLocaleString("de-DE") + " von " + entries.length.toLocaleString("de-DE") + "."; }
      var EXPLAIN = { voll: "Alle gewählten Kriterien erfüllt. Ein Treffer öffnet das Chart Studio mit der Prüfung je Kriterium.", fast: "Genau ein Kriterium nicht erfüllt, alle anderen erfüllt.", offen: "Kein Kriterium verfehlt, aber mindestens eines unbekannt (z. B. zu kurze Kurshistorie). Unbekannt zählt nicht als erfüllt." }[showKey];
      put(results, [stepHead(5, "Treffer"), el("details", { class: "tc-filter" }, [el("summary", {}, [el("span", { class: "tc-row-icon" }, glyph("bars")), el("b", { text: "Wie viele Aktien jedes Kriterium erfüllen" }), glyph("chevron", "tc-chev tc-rot")]), el("div", { class: "tc-filter-body" }, funnel)]),
        segBar, el("p", { class: "tc-note", text: EXPLAIN }),
        entries.length ? list : stateBox("Keine Treffer in dieser Auswahl", nearOk ? "Unter „Fast erfüllt“ stehen Aktien, denen genau ein Kriterium fehlt. Mit weniger Kriterien wird die Liste größer." : "Mit weniger oder anderen Kriterien wird die Liste größer."),
        count, more,
        res.excluded ? el("p", { class: "tc-note", text: res.excluded.toLocaleString("de-DE") + " Aktien ohne aktuellen Kurs (hinter dem Stichtag oder eingefroren) sind nicht eingeordnet." }) : null,
        disclaimer(D.meta)]);
      /* Datenqualitaet: Titel mit Kurssprung-Kennzeichnung (price-jumps.js) zaehlen und vor der Liste nennen. */
      var flagged = entries.filter(function (e) { return !!ds.row(e.i).suspectJumpAt; }).length;
      if (flagged) results.insertBefore(el("p", { class: "tc-note is-warn tc-dq-note", role: "note", text: flagged.toLocaleString("de-DE") + (flagged === 1 ? " Treffer trägt" : " Treffer tragen") + " eine Datenqualitäts-Kennzeichnung (Kurssprung). Ein solcher Sprung kann Kennzahlen wie die relative Stärke verfälschen; die Kennzeichnung steht in der Trefferkarte und im Chart." }), entries.length ? list : results.querySelector(".tc-state"));
      page();
    }).catch(function (e) {
      results.removeAttribute("aria-busy");
      put(results, [stepHead(5, "Treffer"), stateBox("Daten derzeit nicht verfügbar", "Der Screener-Datensatz konnte nicht geladen werden (" + String(e && e.message || e) + ").")]);
    });
  }
  /** Trefferkarte mit Kriterien-Checkliste (Vorlagen und Assistent; Einordnung aus templates.js#evaluate). */
  function checklistHit(ds, t, e, chartQ, wanted) {
    var row = ds.row(e.i), pass = e.states.filter(function (s) { return s === "PASS"; }).length;
    var miss = e.states.map(function (s, k) { return s === "FAIL" ? t.criteria[k].label : null; }).filter(Boolean);
    var unk = e.states.map(function (s, k) { return s === "UNKNOWN" ? t.criteria[k].label : null; }).filter(Boolean);
    var flags = [];
    if (!row.hasVolume) flags.push(el("span", { class: "tc-flag", text: "ohne Volumen" }));
    if (row.suspectJumpAt) flags.push(jumpFlag(row));
    return el("a", { class: "tc-hit", href: M.chartHref(row.s, null, chartQ) }, [
      h(rowHtml(row)),
      el("div", { class: "tc-hit-foot" }, [el("span", { class: "tc-hit-score" }, [el("b", { class: "num", text: pass + "/" + e.states.length }), el("span", { text: " Regeln" })]), ticks(t, e.states)]),
      miss.length ? el("p", { class: "tc-hit-text tc-miss" }, [el("b", { text: "Nicht erfüllt: " }), miss.join(", ")]) : null,
      unk.length ? el("p", { class: "tc-hit-text" }, [el("b", { text: "Unbekannt (unvollständig): " }), unk.join(", ")]) : null,
      wanted.length || flags.length ? el("p", { class: "tc-hit-text" }, [wanted.length ? M.hitSentence(row, wanted) : ""].concat(flags)) : null
    ]);
  }
  /** Chart Studio mit ?v=<Vorlage>: Checkliste dieses Titels; laedt den Screener-Datensatz nur fuer diese Leiste. */
  /** Vorlage der Pruefleiste: ?v=<Vorlage>[&plus=] oder ?z=<Analyseziel>[&k=] (Assistent). null ohne gueltige Angabe. */
  function panelSource(params) {
    var a = AS && params.z ? AS.fromParams(params) : null;
    if (a && a.template) return { t: a.template, back: AS.href(a.goal.id, a.selected), backText: "Zum Analyseziel", kind: "Analyseziel", limits: AS.LIMITS[0] + " " + AS.LIMITS[2] };
    var base = params.v ? TPL.get(params.v) : null; if (!base) return null;
    var blocks = TPL.blocksFromParam(params.plus);
    return { t: TPL.compose(base.id, blocks), back: TPL.href(base.id, blocks), backText: "Zur Vorlage", kind: "Vorlage", limits: TPL.LIMITS };
  }
  function templatePanel(T, params) {
    var src = panelSource(params); if (!src) return null;
    var t = src.t;
    /* Zugeklappt: die Zusammenfassung nennt das Ergebnis, der Chart bleibt auf dem iPhone sichtbar. */
    var box = el("details", { class: "tc-filter tc-tpl-panel" }, [el("summary", {}, [el("span", { class: "tc-row-icon" }, glyph("bars")), el("b", { text: src.kind + " „" + t.title + "“ wird geprüft …" }), glyph("chevron", "tc-chev tc-rot")])]);
    loadScreener().then(function (D) {
      var ck = TPL.checklist(D.ds, t, T);
      if (!ck) { put(box, [el("summary", {}, [el("b", { text: src.kind + " „" + t.title + "“: für " + T + " kein Eintrag im Screener" })])]); return; }
      var STATUS = { FULL: "alle Kriterien erfüllt", NEAR: "fast erfüllt – ein Kriterium fehlt", INCOMPLETE: "unvollständig – " + ck.unknown + " unbekannt", NONE: ck.pass + " von " + ck.states.length + " erfüllt", EXCLUDED: "nicht eingeordnet – kein aktueller Kurs" };
      var row = D.ds.row(ck.i);
      put(box, [
        el("summary", {}, [el("span", { class: "tc-row-icon" }, glyph("bars")), el("span", {}, [el("b", { text: t.title }), el("span", { class: "tc-crit-why", text: STATUS[ck.status] })]), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [
          el("ol", { class: "tc-crit-list" }, t.criteria.map(function (x, k) {
            var m = MARK[ck.states[k]], f = x.filter, v = f.kind ? null : row[Q.columnKey(f.field, f.tf || "1D")];
            /* Ja/Nein steht schon im Status ("erfüllt"/"nicht erfüllt"); gezeigt werden nur Zahlenwerte. */
            var val = f.kind || v === null || v === undefined || Array.isArray(v) || typeof v === "boolean" ? "" : " · " + valueText(f.field, v);
            return el("li", { class: "tc-crit " + m[2] }, [el("span", { class: "tc-crit-mark", "aria-hidden": "true", text: m[0] }), el("b", { text: x.label }), el("span", { class: "tc-crit-why", text: m[1] + val })]);
          })),
          jumpNote(row),
          el("p", { class: "tc-note" }, [el("a", { class: "tc-link", href: src.back, text: src.backText }), " · " + src.limits])])
      ]);
    }).catch(function () { put(box, [el("summary", {}, [el("b", { text: src.kind + " konnte nicht geprüft werden (Datensatz nicht geladen)." })])]); });
    return box;
  }
  /** Schichten und Unterfenster, die die Kriterien einer Vorlage im Chart zeigen (model.js#FIELD_CHART). */
  function templateLayers(params) {
    var src = panelSource(params); if (!src) return;
    var t = src.t, pane = null;
    t.criteria.forEach(function (x) {
      var fc = x.filter.field && M.FIELD_CHART[x.filter.field]; if (!fc) return;
      if (fc[0] === "layer") studio.layers[fc[1]] = true;
      if (fc[0] === "pane" && !pane) pane = fc[1];
    });
    if (pane) { Object.keys(PANES).forEach(function (k) { studio.layers[k] = false; }); studio.layers[pane] = true; }
  }

  /* ------------------------------------------------------- Chart Studio */
  /* Schichten im Kurs (beliebig kombinierbar) und Unterfenster (eines zur Zeit). */
  var LAYERS = M.CHART_LAYERS, PANE_LIST = M.CHART_PANES;
  var PANES = {};
  PANE_LIST.forEach(function (p) { PANES[p[0]] = 1; });
  /* "1J·W": Wochenkerzen aus den Tagesbars (abgeschlossene Wochen, dieselben wie die Screener-Spalten formation…@1W). */
  var RANGES = [["1M", 21], ["3M", 63], ["6M", 126], ["1J", 252], ["1J·W", 0], ["5J", 260], ["Max", 0]];
  var studio = { layers: { trend: true, muster: true, niveaus: true, sma: true, volumen: true }, range: "1J", full: false, mode: "candles" };

  function viewChartPicker(main) {
    var head = pageHead(null, "Chart Studio", "Welche Aktie? Zonen, Trend und Befunde erscheinen automatisch, in Worten erklärt.");
    var slot = el("div", { class: "tc-search-slot" });
    put(main, [head, slot]);
    var last = lastTicker();
    loadIndex().then(function (X) {
      put(slot, [searchBox(X.entries, "Aktie oder Kürzel …"),
        last ? el("p", { class: "tc-note" }, ["Zuletzt geöffnet: ", el("a", { href: M.chartHref(last), text: last })]) : null]);
    }).catch(function () { put(slot, stateBox("Suche nicht verfügbar", "Bitte das Kürzel direkt in der Adresse angeben: #/chart/NVDA")); });
  }

  /* T06: Aktienseite, Perspektive „Chart“. Einsteiger: der eine Chart mit Zonen, drei Saetze, Preise, Signale.
     Chart Studio (Kerzen, alle Schichten) ist die PRO-Ansicht unter #/chart/<T>/studio. */
  var simple = { range: "1J", zones: true, trend: false, avg: false };
  function stockHeadMount(host, T, name) {
    var SN = global.VUStockNavigator, SCX = global.VUCore && global.VUCore.StockContext, api = null;
    try { if (SN && SCX) api = SN.head(host, { ctx: SCX.fromUs(T, name ? { name: name } : undefined), current: "technical", name: name || null, pendingPrice: true, back: { href: "#/", label: "Technical" } }); } catch (e) { api = null; }
    if (!api || !api.el) { put(host, h(U.stockHead({ ticker: T, name: name || T, backHref: "#/" }, { active: "technical" }))); api = { setPrice: function () {}, el: host.firstChild }; }
    return api;
  }
  function viewChart(main, route) {
    var T = route.ticker;
    if (!T) return viewChartPicker(main);
    rememberTicker(T);
    var headHost = el("div", { class: "tc-shead" }), head = stockHeadMount(headHost, T, null);
    var body = el("div", { class: "tc-studio", "aria-busy": "true" }, [el("div", { class: "tc-skel", style: "height:360px" })]);
    var tplPanel = route.params && (route.params.v || route.params.z) ? templatePanel(T, route.params) : null;
    if (tplPanel && route.tab === "studio") templateLayers(route.params);
    put(main, [headHost, tplPanel, body]);

    var instrumentP = loadInstrument(T);
    // The validated instrument already carries the exact close displayed here.
    // Paint it before chart engines/history and preserve the shared head node.
    var headP = instrumentP.then(function (r) {
      if (!headHost.isConnected) return;
      var b = r.inst.bars, t = b.close.length - 1, chg = b.close[t] / b.close[t - 1] - 1;
      head.setPrice({ value: b.close[t], currency: "USD", changePct: isNum(chg) ? chg * 100 : null, kind: "close", at: M.dateDe(b.timestamps[t]) });
      if (typeof global.requestAnimationFrame === "function") return new Promise(function (done) { global.requestAnimationFrame(function () { global.requestAnimationFrame(done); }); });
    });
    Promise.all([instrumentP, loadEngines(), loadIndex().catch(function () { return null; }), loadEvidence(), headP]).then(function (r) {
      var inst = r[0].inst, D = r[2], name = D ? D.name(T) : null;
      var headName = head.el && head.el.querySelector(".vu-shead-name");
      if (name && headName && headName.textContent === T) headName.textContent = shortName(name) || name;
      doc.title = T + " · " + (route.tab === "studio" ? "Chart Studio" : "Chart") + " · Technical · Vision Universe®";
      var VT = global.VUTechnical, b = inst.bars, bundle = inst.bundle || {};
      var series = VT.CanonicalBars.fromRows(b.timestamps.map(function (d, i) { return { date: d, open: b.open[i], high: b.high[i], low: b.low[i], close: b.close[i], volume: b.volume[i] }; }),
        { instrumentId: T, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "technical-signals-v1" });
      var prep = VT.TIContext.prepare(series), t = series.length - 1;
      var analysis = VT.Formations.analyzeAt(prep, t), ctx = VT.TIContext.at(prep, t), levels = VT.TILevels.supportResistance(ctx);
      /* The simple chart never consumes formation history; keep the same calculation on its two consumers. */
      var fromIdx = Math.max(0, series.length - 252), hist = route.tab === "signals" || route.tab === "studio" ? VT.Formations.history(prep, fromIdx, t) : [];
      var S = { dates: b.timestamps, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      var cs = bundle.chartSeries || {}, F = bundle.featuresAtCutoff || {};
      var st = M.seriesState(b.timestamps, b.close, D && (D.meta && D.meta.asOf || D.index.asOf), global.VUCore && global.VUCore.ListingStaleness);
      if (st.frozenSince) { analysis = { formations: [] }; levels = { supports: [], resistances: [] }; hist = []; F = {}; }
      body.removeAttribute("aria-busy");
      /* Verlauf der letzten 12 Monate: im Kapitel sofort, im Befund-Sheet erst beim Öffnen (dieselbe Rechnung). */
      var histOf = function () { if (!hist.length && !st.frozenSince) hist = VT.Formations.history(prep, fromIdx, t); return hist; };
      if (route.tab === "signals") return renderSignals(body, { T: T, S: S, analysis: analysis, F: F, levels: levels, hist: histOf(), inst: inst, D: D, st: st, name: name, teil: route.params && route.params.teil });
      if (route.tab !== "studio") return renderSimple(body, { T: T, S: S, cs: cs, analysis: analysis, levels: levels, F: F, inst: inst, D: D, st: st, name: name, histOf: histOf, fromDate: b.timestamps[fromIdx] });
      var ind = { ema20: VT.Indicators.compute(S, "ema", { period: 20 }).values, ema50: VT.Indicators.compute(S, "ema", { period: 50 }).values, sma150: VT.Indicators.compute(S, "sma", { period: 150 }).values,
        bb: VT.Indicators.compute(S, "bollinger").values, rsi: VT.Indicators.compute(S, "rsi").values, macd: VT.Indicators.compute(S, "macd").values, stoch: VT.Indicators.compute(S, "stochastic").values };
      /* Weitere Katalog-Indikatoren; ohne Volumen liefert compute() einen Fehler und die Schicht bleibt leer. */
      ["keltner", "donchian", "ichimoku", "supertrend", "psar", "vwma", "adx", "atr", "cci", "williamsR", "aroon", "mfi", "obv", "cmf",
        "hma", "chandelier", "vortex", "choppiness", "elderImpulse", "zScore", "ulcerIndex", "historicalVolatility", "connorsRsi"].forEach(function (id) {
        var r2 = VT.Indicators.compute(S, id); ind[id] = r2.error ? null : r2.values;
      });
      /* ROC wie die Screener-Felder roc21/roc63 (Prozent statt Anteil). */
      ind.roc21 = VT.Indicators.compute(S, "roc", { period: 21 }).values; ind.roc63 = VT.Indicators.compute(S, "roc", { period: 63 }).values;
      /* Kerzenmuster der Screener-Liste (dieselbe Erkennung wie die Spalten candleBullish/-Bearish/-Neutral). */
      ind.candles = VT.Candlesticks ? VT.Candlesticks.detect({ open: b.open, high: b.high, low: b.low, close: b.close }, { only: Object.keys(Q.CANDLE_TYPES) }).patterns : null;
      renderStudio(body, { T: T, S: S, cs: cs, ind: ind, analysis: analysis, levels: levels, F: F, inst: inst, hist: hist, histOf: histOf, D: D, st: st, name: name, focus: route.params && route.params.f || null });
    }).catch(function (e) {
      head.setPrice(null);
      body.removeAttribute("aria-busy");
      put(body, stateBox("Kein technisches Chartbild für " + T, e && e.message === "NOT_AVAILABLE"
        ? "Für dieses Kürzel liegt keine ausreichend lange, geprüfte Tagesreihe vor (mindestens etwa ein Jahr Handel, gültiger Kalender)."
        : "Die Kursdaten konnten nicht geladen werden (" + String(e && e.message || e) + ").", el("a", { class: "tc-link", href: "#/chart", text: "Andere Aktie wählen" })));
    });
  }

  /* Darstellungsregeln der Einsteigeransicht (T06, keine Prognose; Werte aus featuresAtCutoff wie die Befunde):
     Urteil: Kurs ueber SMA 50 und 200 = Aufwaertstrend intakt (Stark); nur ueber 200 = Ruecksetzer im Aufwaertstrend (Mittel);
     nur ueber 50 = Erholung im Abwaertstrend (Mittel); unter beiden = Abwaertstrend (Schwach). „knapp“ = weniger als 3 % Abstand.
     Schwung: RSI ab 50 Stark, darunter Schwach. Letzter Tag: Muster dieses Tages nach Richtung, sonst Tagesbewegung. */
  function chartSummary(c, s50, s200) {
    if (!isNum(c) || !isNum(s50) || !isNum(s200)) return ["Keine Aussage zum Trend", "none"];
    if (c > s200 && c > s50) return ["Aufwärtstrend intakt", "strong"];
    if (c > s200) return ["Rücksetzer im Aufwärtstrend", "mid"];
    if (c > s50) return ["Erholung im Abwärtstrend", "mid"];
    return ["Abwärtstrend", "weak"];
  }
  function money$(v) { return isNum(v) ? M.price(v) : "–"; }
  /* „Der Chart in drei Sätzen“ (Entscheidung 3): Trend, Schwung, Letzter Tag in Alltagssprache, je mit Urteil.
     Werte wie bisher aus featuresAtCutoff; Fachwerte (RSI) nur in Klammern. */
  function threeSentences(X) {
    var S = X.S, t = S.close.length - 1, c = S.close[t], F = X.F, out = [];
    if (isNum(F.sma200)) {
      var d = c / F.sma200 - 1;
      out.push(["trend", "Trend", Math.abs(d) < 0.0005 ? "Der Kurs liegt genau auf der 200-Tage-Linie." : "Der Kurs liegt " + M.num(Math.abs(d) * 100, 1) + " % " + (d > 0 ? "über" : "unter") + " der 200-Tage-Linie.", d > 0 ? "strong" : "weak"]);
    } else out.push(["trend", "Trend", "Für die 200-Tage-Linie ist die Kurshistorie zu kurz.", "none"]);
    if (isNum(F.rsi14)) {
      var r = F.rsi14, zone = r >= 70 ? ", „überkauft“" : r > 65 ? ", fast „überkauft“" : r <= 30 ? ", „überverkauft“" : r < 35 ? ", fast „überverkauft“" : "";
      var w = M.momentumWords(r);
      out.push(["pulse", "Schwung", (w === "ausgeglichen" ? "Der Schwung ist ausgeglichen" : "Der Kurs ist " + w) + " (RSI " + M.num(r, 1) + zone + ").", r >= 50 ? "strong" : "weak"]);
    } else out.push(["pulse", "Schwung", "Für den Schwung fehlt ein Wert.", "none"]);
    var day = S.dates[t], f = (X.analysis.formations || []).filter(function (x) { return x.state !== "INVALIDATED" && (x.detectedAt === day || x.confirmedAt === day); })[0];
    var vol = isNum(F.relativeVolume) ? " bei " + M.volumeWords(F.relativeVolume) : "";
    var ch = c / S.close[t - 1] - 1, move = !isNum(ch) ? "Unverändert" : ch > 0 ? "Plus " + M.num(ch * 100, 2) + " %" : ch < 0 ? "Minus " + M.num(-ch * 100, 2) + " %" : "Unverändert";
    if (f) out.push(["bars", "Letzter Tag", M.plain(f.name) + (f.state === "CONFIRMED" ? " bestätigt" : " erkannt") + "; " + move.replace(/^U/, "u").replace(/^P/, "p").replace(/^M/, "m") + vol + ".", f.direction === "BULLISH" ? "strong" : f.direction === "BEARISH" ? "weak" : "mid"]);
    else out.push(["bars", "Letzter Tag", move + vol + ".", ch > 0 ? "strong" : ch < 0 ? "weak" : "mid"]);
    return out;
  }
  /** Richtungs-Pille eines Befunds (Chart Studio, Alle Befunde): ▲ neongruen, ▼ schwarz, ◆ grau (keine Rot/Gruen-Pillen). */
  function dirPill(f) {
    var x = f.formation, d = findingDir(f);
    var txt = d ? M.directionWords(d) : x ? M.directionWords(0) : f.badge || M.directionWords(0);
    return el("span", { class: "tc-dpill is-" + (d > 0 ? "up" : d < 0 ? "down" : "flat") }, [d > 0 ? "▲ " : d < 0 ? "▼ " : "◆ ", txt]);
  }
  /* Ein Satz je Mustertyp für das Befund-Sheet (Darstellung; die Regel steht unter „Regeln im Detail“). */
  var TYPE_SENTENCE = {
    GAP_DOWN: "Der Kurs hat deutlich unter dem Vortagestief eröffnet.", GAP_UP: "Der Kurs hat deutlich über dem Vortageshoch eröffnet.",
    DOUBLE_TOP: "Der Kurs ist zweimal am selben Hoch gescheitert (M-Form).", DOUBLE_BOTTOM: "Der Kurs ist zweimal am selben Tief abgeprallt (W-Form).",
    HEAD_AND_SHOULDERS: "Drei Gipfel, der mittlere am höchsten.", INVERSE_HEAD_AND_SHOULDERS: "Drei Täler, das mittlere am tiefsten.",
    SYMMETRICAL_TRIANGLE: "Der Kurs pendelt immer enger zwischen zwei Linien.", ASCENDING_TRIANGLE: "Steigende Tiefs laufen gegen ein flaches Hoch.", DESCENDING_TRIANGLE: "Fallende Hochs laufen gegen ein flaches Tief.",
    RECTANGLE: "Der Kurs bewegt sich seitwärts zwischen zwei Grenzen.", RANGE_BREAKOUT: "Der Kurs hat eine Seitwärtsphase verlassen.", RESISTANCE_BREAKOUT: "Der Kurs hat per Schluss eine Hürde überwunden, an der er vorher gestoppt wurde.",
    BULL_FLAG: "Kurze Pause nach einem starken Anstieg.", BULL_PENNANT: "Kurze Pause nach einem starken Anstieg.", BEAR_FLAG: "Kurze Pause nach einem starken Rückgang.", BEAR_PENNANT: "Kurze Pause nach einem starken Rückgang.",
    RISING_WEDGE: "Zwei steigende Linien laufen aufeinander zu.", FALLING_WEDGE: "Zwei fallende Linien laufen aufeinander zu.",
    ASCENDING_CHANNEL: "Der Kurs läuft zwischen zwei steigenden Linien.", DESCENDING_CHANNEL: "Der Kurs läuft zwischen zwei fallenden Linien.",
    SUPPORT_TRENDLINE: "Eine steigende Linie hat den Kurs mehrmals aufgefangen.", RESISTANCE_TRENDLINE: "Eine fallende Linie hat den Kurs mehrmals gestoppt.",
    CUP_WITH_HANDLE: "Runder Boden, kleine Delle, dann Rückkehr zum Hoch.", VOLATILITY_CONTRACTION: "Die Rücksetzer werden immer kleiner, die Schwankung zieht sich zusammen."
  };
  var HIST_STATE = { CONFIRMED: "heute aktiv", DETECTED: "heute aktiv", INVALIDATED: "heute ungültig" };
  /** Zeitleiste (Vorlage .tl): Datum · Name, heutiger Zustand; aktive Punkte neongrün. */
  function timeline(list) {
    return el("ol", { class: "tc-tl" }, list.map(function (x) {
      var on = x.stateNow === "CONFIRMED" || x.stateNow === "DETECTED";
      return el("li", { class: "tc-tl-r" + (on ? " is-on" : "") }, [el("i", { "aria-hidden": "true" }), el("div", {}, [el("b", { text: dShort(x.detectedAt) + " · " + M.plain(x.name) }),
        el("span", { text: x.stateNow ? HIST_STATE[x.stateNow] : "nicht mehr aktiv" })])]);
    }));
  }
  /** Befund-Sheet (Vorlage c-befund): Bild, Name, Richtung, ein Satz, Erkannt, Ungültig laut Regel, Forschung, Verlauf bei der Aktie. */
  function signalSheet(f, X) {
    var x = f.formation, ev = x && evidence && evidence.byType[x.type], F = X.F, S = X.S, t = S.close.length - 1, c = S.close[t], who = X.name ? shortName(X.name) || X.T : X.T;
    var inv = x && x.levels && x.levels.invalidation, invText = null;
    if (isNum(inv)) invText = (x.direction === "BEARISH" ? "über " : "unter ") + M.price(inv);
    else if (!x && f.id === "sma200" && isNum(F.sma200)) invText = (c > F.sma200 ? "unter " : "über ") + M.price(F.sma200);
    var since = x ? x.detectedAt : S.dates[t];
    var lead = (x && TYPE_SENTENCE[x.type] ? TYPE_SENTENCE[x.type] + " " : "") + f.text;
    var rules = x ? el("details", { class: "tc-sigrules" }, [el("summary", { text: "Regeln im Detail" }), el("dl", { class: "tc-kv tc-kv--stack vu-box" }, [
      el("dt", { text: "Erkennung" }), el("dd", { text: x.rules.detect }), el("dt", { text: "Bestätigung" }), el("dd", { text: x.rules.confirm }), el("dt", { text: "Ungültig, wenn" }), el("dd", { text: x.rules.invalidate })])]) : null;
    var research = el("a", { class: "tc-research", href: "#/muster", onclick: closeSheets }, [el("span", { class: "tc-rh-tag", text: "Forschung" }),
      el("span", { class: "tc-research-t", text: ev && ev.published ? "Hilft dieses Muster? " + M.num(ev.hitRate * 100, 1) + " % lagen vorn · " + ev.n.toLocaleString("de-DE") + " Fälle" : "Hilft dieses Muster? " + (evidence ? evidence.doc.types.length + " Muster mit Belegen" : "Muster mit Belegen") }),
      ev && ev.published ? h(ev.significant ? (ev.hitRate > 0.5 ? U.verdict("strong", "Belegt") : U.verdict("weak", "Gegen die Lesart")) : U.verdict("none", "Kein Vorteil")) : h(U.glyph("next", 15))]);
    var hist = X.histOf ? X.histOf() : [], mine = hist.slice().reverse().slice(0, 5);
    var box = sheet("tc-signal-sheet", null, f.title, [
      el("div", { class: "tc-bsheet-h" }, [shapeBox(f, 38, true), el("div", {}, [el("span", { class: "vu-ltag", text: "Befund · " + who }), el("div", { class: "vu-mt", text: f.title })]), dirVerdict(findingDir(f))]),
      el("p", { class: "tc-sheet-lead", text: lead }),
      el("div", { class: "tc-kt2" }, [el("div", { class: "tc-kt" }, [el("small", { text: "Erkannt" }), el("b", { class: "num", text: M.dateDe(since) })]),
        invText ? el("div", { class: "tc-kt" }, [el("small", { text: "Ungültig laut Regel" }), el("b", { class: "num", text: invText })]) : null]),
      x ? research : null, ev && ev.published ? h(U.help("„Lagen vorn“: Anteil der Fälle, in denen die Aktie 20 Handelstage danach besser lief als der Durchschnitt. Forschung, nicht zertifiziert.")) : null,
      mine.length ? el("div", { class: "tc-st" }, ["Verlauf bei " + who, el("span", { text: "12 Monate" })]) : null, mine.length ? timeline(mine) : null,
      rules,
      el("div", { class: "tc-actions2" }, [el("a", { class: "vu-btn", href: M.chartHref(X.T, "studio", x ? "f=" + encodeURIComponent(x.id) : null), onclick: closeSheets }, [h(U.glyph("line", 18)), "Im Chart Studio"]),
        el("a", { class: "vu-btn vu-btn--line", href: M.chartHref(X.T, "signals"), onclick: closeSheets, text: "Alle Befunde" })])]);
    box.querySelector(".tc-sheet-title").remove();
    return box;
  }
  /** Zwei Zonen-Kacheln (Vorlage .zt): Widerstand über, Unterstützung unter dem Kurs. */
  function zoneTiles(lv) {
    var R = lv && lv.nearestResistance, Su = lv && lv.nearestSupport;
    return el("div", { class: "tc-zt2" }, [
      el("div", { class: "tc-zt" }, [el("small", { text: "Widerstand ▲" }), el("b", { class: "num", text: R ? money$(R.center) : "–" }), el("span", { text: R ? "Zone " + de(R.zoneLow) + "–" + de(R.zoneHigh) + " $ · " + R.touches + "-mal gestoppt" : "Kein Widerstand über dem Kurs" })]),
      el("div", { class: "tc-zt is-lo" }, [el("small", { text: "Unterstützung ▼" }), el("b", { class: "num", text: Su ? money$(Su.center) : "–" }), el("span", { text: Su ? "Zone " + de(Su.zoneLow) + "–" + de(Su.zoneHigh) + " $ · " + Su.touches + "-mal gehalten" : "Keine Unterstützung unter dem Kurs" })])]);
  }
  /** „Befunde heute“: die ersten drei, „Alle N“ öffnet das Kapitel. */
  function befundeHeute(X, n) {
    var all = X.st.frozenSince ? [] : M.findings(X.analysis, X.F, X.S.close[X.S.close.length - 1]).filter(function (f) { return !(f.formation && f.formation.state === "INVALIDATED"); });
    return [rh("Befunde heute", all.length ? M.chartHref(X.T, "signals") : null, "Alle " + all.length, "Was die Regeln heute im Chart finden."),
      all.length ? el("div", { class: "tc-bfl tc-siglist" }, all.slice(0, n || 3).map(function (f) { return bfRow(f, function () { signalSheet(f, X); }); }))
        : h(U.blank(X.st.frozenSince ? "Der Kurs steht still; ohne Kursänderung gibt es keine Befunde." : "Im Tageschart finden die Regeln derzeit keinen Befund.")), all.length];
  }
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function renderSimple(body, X) {
    var S = X.S, n = S.close.length, t = n - 1, F = X.F, lv = X.levels || {}, R = lv.nearestResistance, Su = lv.nearestSupport;
    var sum = chartSummary(S.close[t], F.sma50, F.sma200);
    var host = el("div", { class: "tc-chart-host tc-simple-chart" }), legend = el("p", { class: "tc-note tc-chart-note" });
    var RANGE = { "1T": null, "1W": 5, "1M": 21, "1J": 252, "5J": "W260", "Max": "W0" };
    var chart = null;
    function draw() {
      var win = RANGE[simple.range];
      if (typeof win === "string") {
        put(legend, "Wochenschlüsse aus der langen Kursreihe. Zonen und Linien gelten für den Tageschart.");
        loadWeekly(X.T).then(function (w) {
          var pts = (w.points || []).filter(function (p) { return isNum(p[1]); }), dates = pts.map(function (p) { return p[0]; }), close = pts.map(function (p) { return p[1]; });
          var VT = global.VUTechnical, ov = simple.avg ? [{ id: "s40", label: "40-Wochen-Linie", values: VT.Indicators.sma(close, 40), color: "var(--tc-c2)", dash: "5 4" }] : [];
          chart = Chart.render(host, { title: X.T + " Wochenchart", mode: "line", area: true, height: 170, window: win === "W260" ? 260 : 0, data: { dates: dates, close: close, open: close, high: close, low: close, volume: [] }, overlays: ov, lines: [], zones: [], levels: [], markers: [], volume: false, pane: null });
        }).catch(function () { put(host, stateBox("Keine Wochenreihe", "Für diese Aktie liegt keine lange Wochenreihe vor.")); });
        return;
      }
      var zones = [], lines = [], markers = [], overlays = [];
      if (simple.zones && R) zones.push({ low: R.zoneLow, high: R.zoneHigh, tone: "negative", label: "Widerstand " + de(R.zoneLow) + "–" + de(R.zoneHigh) });
      if (simple.zones && Su) zones.push({ low: Su.zoneLow, high: Su.zoneHigh, tone: "positive", label: "Unterstützung " + de(Su.zoneLow) + "–" + de(Su.zoneHigh) });
      if (simple.trend) formationLayers(X.analysis, S, { trend: true, muster: false }, null, S.dates[Math.max(0, n - win)], lines, [], markers);
      if (simple.avg && X.cs.sma200) overlays.push({ id: "sma200", label: "200-Tage-Linie", values: X.cs.sma200, color: "var(--tc-c2)", dash: "5 4" });
      put(legend, simple.avg ? "Gestrichelt: 200-Tage-Linie." : "");
      chart = Chart.render(host, { title: X.T + " Kurs", mode: "line", area: true, height: 170, window: win, data: S, overlays: overlays, lines: lines, zones: zones, levels: [], markers: markers, volume: false, pane: null });
    }
    var rangeBar = el("div", { class: "vu-seg tc-ranges2", role: "group", "aria-label": "Zeitraum" }, Object.keys(RANGE).map(function (k) {
      return el("button", { type: "button", "aria-pressed": String(simple.range === k), disabled: RANGE[k] === null ? true : null, title: RANGE[k] === null ? "Ein Tag braucht Kurse im Tagesverlauf; Technical rechnet mit Tagesschlüssen." : null, text: k,
        onclick: function () { simple.range = k; [].forEach.call(rangeBar.children, function (b) { b.setAttribute("aria-pressed", String(b.textContent === k)); }); draw(); } });
    }));
    function tog(key, label) { return el("button", { type: "button", class: "vu-chip", "aria-pressed": String(simple[key]), text: label, onclick: function (ev) { simple[key] = !simple[key]; ev.currentTarget.setAttribute("aria-pressed", String(simple[key])); draw(); } }); }
    var story = el("div", { class: "tc-story" }, [el("p", { class: "vu-ltag tc-ltag", text: "Der Chart in drei Sätzen" })].concat(threeSentences(X).map(function (s) {
      return el("div", { class: "tc-story-r" }, [hudGlyph(s[0], 34), el("div", {}, [el("span", { class: "vu-ltag tc-ltag", text: s[1] }), el("p", { text: s[2] })]), h(U.verdict(s[3]))]);
    })));
    var bh = befundeHeute(X, 3), nAll = bh[2];
    var from = X.fromDate ? MONTHS[+X.fromDate.slice(5, 7) - 1] + " " + X.fromDate.slice(0, 4) : null;
    var ep = function (i, href, icon, title, sub) { return el("a", { class: "tc-ep", href: href }, [el("b", { class: "tc-ep-n num", text: String(i) }), hudGlyph(icon, 40), el("span", { class: "tc-ep-t" }, [el("b", {}, title), el("span", { text: sub })]), h(U.glyph("next", 15))]); };
    var chapters = el("nav", { class: "tc-eps", "aria-label": "Kapitel" }, [
      ep(1, M.chartHref(X.T, "signals"), "search", "Alle " + nAll + " Befunde mit Regel", "je Befund: was er bedeutet, wann ungültig"),
      ep(2, M.chartHref(X.T, "signals", "teil=verlauf"), "book", "Verlauf der letzten 12 Monate", "jeder Befund" + (from ? " seit " + from : "") + ", mit heutigem Zustand"),
      ep(3, M.chartHref(X.T, "studio"), "trend", "Chart Studio", "Kerzen, Linien, RSI, MACD · PRO")]);
    put(body, [seriesNote(X.st),
      el("div", { class: "tc-sayrow" }, [el("div", {}, [el("p", { class: "vu-ltag", text: "Was der Chart sagt" }), el("h2", { class: "vu-mt", text: sum[0] })]), h(U.verdict(sum[1]))]),
      host, legend, rangeBar, el("div", { class: "vu-chips tc-togs" }, [tog("zones", "Zonen"), tog("trend", "Trendlinie"), tog("avg", "200-Tage-Linie")]),
      story, h(U.help("Schwung: wie stark der Kurs zuletzt gestiegen oder gefallen ist. Fachleute messen das mit dem RSI (0 bis 100); über 70 gilt als „überkauft“, unter 30 als „überverkauft“.")),
      X.st.frozenSince ? null : zoneTiles(lv), bh[0], bh[1], chapters,
      dataQuality(X.inst, X.D, false), footNote(X.D && (X.D.meta && X.D.meta.asOf), "Quant und Supertrader zur selben Aktie: oben in der Leiste. ")]);
    draw();
  }

  var benchP = null;
  /** SPY-Vergleichsreihe fuer das Unterfenster „Rel. Stärke“; erst beim Einschalten geladen. Fehlt sie, bleibt das Fenster leer. */
  function loadBenchmark() {
    if (!benchP) benchP = fetchJSON(M.BENCHMARK_PATH).then(function (s) {
      var pts = (s && s.points || []).filter(function (p) { return isNum(p[1]); });
      return { dates: pts.map(function (p) { return p[0]; }), close: pts.map(function (p) { return p[1]; }) };
    }).catch(function () { benchP = null; return null; });
    return benchP;
  }
  function renderStudio(body, X) {
    if (studio.layers.rs && X.bench === undefined) {
      X.bench = null;
      loadBenchmark().then(function (bm) { X.bench = bm; if (bm) { X.ind.rs63 = M.relativeStrength(X.S.dates, X.S.close, bm, 63); X.ind.rs126 = M.relativeStrength(X.S.dates, X.S.close, bm, 126); } renderStudio(body, X); });
    }
    var S = X.S, n = S.close.length, last = n - 1;
    var host = el("div", { class: "tc-chart-host" });
    var legend = el("div", { class: "tc-legend" });
    var expand = el("button", { type: "button", class: "tc-icon-btn", "aria-label": "Chart vergrößern", "aria-pressed": String(studio.full), onclick: function () { studio.full = !studio.full; card.classList.toggle("is-full", studio.full); expand.setAttribute("aria-pressed", String(studio.full)); chart && chart.redraw(); } }, glyph("expand"));
    /* Kopf des Chart Studios (T06 b, PRO): Linie oder Kerzen; Kerzen nur hier, hohl (steigend) und schwarz (fallend). */
    var modeSeg = el("div", { class: "vu-seg tc-modeseg", role: "group", "aria-label": "Darstellung" }, [["line", "Linie"], ["candles", "Kerzen"]].map(function (m) {
      return el("button", { type: "button", "aria-pressed": String(studio.mode === m[0]), text: m[1], onclick: function () { studio.mode = m[0]; renderStudio(body, X); } });
    }));
    var studioHead = el("div", { class: "tc-studio-head" }, [el("b", {}, [h(U.pro()), " Chart Studio"]), modeSeg, expand]);
    var card = el("section", { class: "tc-card tc-chart-card" + (studio.full ? " is-full" : ""), "aria-label": "Kurschart" }, [
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
      ? ["Fokus: ", el("b", { text: M.plain(focusF.name) }), " · " + M.STATE_BADGE[focusF.state] + " · erkannt " + M.dateDe(focusF.detectedAt) + " ", el("a", { class: "tc-link", href: M.chartHref(X.T), text: "Alle Formationen zeigen" })]
      : ["Diese Formation ist im aktuellen Stand nicht mehr enthalten. ", el("a", { class: "tc-link", href: M.chartHref(X.T), text: "Alle Formationen zeigen" })]) : null;
    var weekly = !X.focus && (studio.range === "5J" || studio.range === "Max");
    var signals = el("section", { class: "tc-signals" });
    var back = el("p", { class: "tc-note" }, [el("a", { class: "tc-link", href: M.chartHref(X.T), text: "Zurück zur Chart-Seite" }), " · Kerzen nur hier, als Profi-Option."]);
    /* Unter dem Studio (Entscheidung 7): Befunde und Zonen wie auf der Chart-Seite statt „Aktive Signale“. */
    var bh = befundeHeute(X, 6);
    put(body, [studioHead, seriesNote(X.st), focusBar, card, layerBar, signals, X.st.frozenSince ? null : zoneTiles(X.levels), back, dataQuality(X.inst, X.D, weekly), footNote(X.D && X.D.meta && X.D.meta.asOf)]);
    put(signals, [bh[0], bh[1]]);
    var chart = null;

    if (!X.focus && studio.range === "1J·W") {
      var W = weeklyCandleConfig(X);
      if (!W) put(host, stateBox("Keine Wochenkerzen", "Aus den Tagesbars entstehen weniger als zwei abgeschlossene Wochen."));
      else {
        put(legend, legendItems(W.cfg.legend).concat([el("span", { class: "tc-note", text: W.note })]));
        chart = Chart.render(host, W.cfg);
      }
    } else if (weekly) {
      put(legend, el("span", { class: "tc-note", text: "Wochenschlüsse (Linie) · Formationen und Volumen im Tageschart und unter „1J·W“" }));
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

  }

  /** Hinweis zum Zeitbezug der Reihe (wie die Trefferliste: „Kurs unverändert seit …“ bzw. „Kurs vom …“). */
  function seriesNote(st) {
    /* Steht der Kurs im ganzen geladenen Fenster, ist frozenSince dessen Anfang: unverändert spätestens seit diesem Tag. */
    if (st && st.frozenSince) return el("p", { class: "tc-focus is-warn", role: "note" }, [el("b", { text: "Kurs unverändert seit " + (st.frozenIndex === 0 ? "spätestens " : "") + M.dateDe(st.frozenSince) + ". " }),
      (st.frozenIndex === 0 ? "Alle " + st.frozenRun + " geladenen Tagesbars tragen denselben Schlusskurs." : "Die Reihe endet mit " + st.frozenRun + " gleichen Schlusskursen.") + " Das ist ein Datenqualitätshinweis, kein bestätigtes Delisting; auch illiquide Titel können so enden. " +
      "Indikatoren aus diesen Bars sind ohne Aussage, deshalb zeigt Chart Studio wie der Screener keine Formationen, Befunde und Niveaus."]);
    if (st && st.behind) return el("p", { class: "tc-focus", role: "note" }, [el("b", { text: "Kurs vom " + M.dateDe(st.asOf) + ". " }),
      "Der Stichtag des Screeners ist der " + M.dateDe(st.universeAsOf) + ". Befunde und Niveaus beziehen sich auf den letzten verfügbaren Kurs; Ereignisse danach sind nicht bekannt."]);
    return null;
  }

  function legendItems(items) { return items.map(function (it) { return el("span", { class: "tc-leg" }, [el("i", { style: "background:" + it[1] }), it[0]]); }); }

  /**
   * Wochenkerzen aus den geladenen Tagesbars: multi-timeframe.js#completedSeries (abgeschlossene Wochen, Regel
   * STICHTAG_FREITAG), Formationen mit derselben Engine wie die Screener-Spalten formationActive@1W/formationConfirmed@1W
   * (screen-row 1.14.0, ab 26 Wochen). Keine neue Kursreihe: nur eine andere Sicht auf die veroeffentlichten Tagesbars.
   */
  function weeklyCandleConfig(X) {
    var VT = global.VUTechnical, S = X.S;
    if (!VT.MultiTimeframe) return null;
    var series = VT.CanonicalBars.fromRows(S.dates.map(function (d, i) { return { date: d, open: S.open[i], high: S.high[i], low: S.low[i], close: S.close[i], volume: S.volume[i] }; }),
      { instrumentId: X.T, exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "tiingo", sourceRevision: "technical-signals-v1" });
    var wk = VT.MultiTimeframe.completedSeries(series, "1W");
    if (!wk) return null;
    var w = wk.series, WS = { dates: w.timestamps.map(function (t) { return String(t).slice(0, 10); }), open: w.open, high: w.high, low: w.low, close: w.close, volume: w.volume };
    var frozen = X.st && X.st.frozenSince, enough = wk.bars >= 26;
    var analysis = frozen || !enough ? { formations: [] } : VT.Formations.analyzeAt(VT.TIContext.prepare(w), w.length - 1);
    var L = studio.layers, lines = [], zones = [], markers = [], overlays = [], legend = [["Kurs (Woche)", "var(--tc-price)"]];
    if (L.sma) {
      overlays.push({ id: "s10", label: "SMA 10 W", values: VT.Indicators.sma(w.close, 10), color: "var(--tc-c1)" });
      overlays.push({ id: "s40", label: "SMA 40 W", values: VT.Indicators.sma(w.close, 40), color: "var(--tc-c2)" });
      legend.push(["SMA 10 W", "var(--tc-c1)"], ["SMA 40 W", "var(--tc-c2)"]);
    }
    formationLayers(analysis, WS, L, null, WS.dates[0], lines, zones, markers);
    var active = [];
    (analysis.formations || []).forEach(function (f) { if (f.state !== "INVALIDATED" && active.indexOf(f.name) < 0) active.push(f.name); });
    var note = wk.bars + " abgeschlossene Wochen bis " + M.dateDe(wk.asOf) + (wk.droppedOpenBar ? " (laufende Woche nicht enthalten)" : "") + " · " +
      (frozen ? "Kurs unverändert: keine Formationen" : !enough ? "unter 26 Wochen: keine Wochenformationen" : active.length ? "Wochenformationen: " + active.join(", ") : "keine Wochenformation erkannt");
    return { cfg: { title: X.T + " Wochenkerzen", mode: "candles", window: 0, data: WS, overlays: overlays, lines: lines, zones: zones, levels: [], markers: markers, volume: !!L.volumen, pane: null, legend: legend },
      note: note, analysis: analysis, weeks: wk };
  }

  /** Linien, Zonen und Marken der Formationen (Tages- und Wochenchart dieselbe Darstellung). */
  function formationLayers(analysis, S, L, focusF, firstDate, lines, zones, markers) {
    var forms = focusF ? [focusF] : (analysis.formations || []).filter(function (f) { return f.state !== "INVALIDATED" || f.invalidatedAt >= firstDate; });
    forms.forEach(function (f) {
      var isTrend = f.family === "TRENDLINE" || f.family === "CHANNEL";
      if (!focusF && (isTrend ? !L.trend : !L.muster)) return;
      var tone = f.state === "INVALIDATED" ? "muted" : f.direction === "BEARISH" ? "negative" : "positive";
      /* Nur gueltige Linien werden bis heute fortgeschrieben; eine invalidierte endet an ihrem letzten Punkt. */
      (f.lines || []).forEach(function (l) { lines.push({ from: l.from, to: l.to, tone: tone, dash: f.state === "DETECTED" ? "6 4" : null, extend: f.state !== "INVALIDATED" }); });
      if (f.zone && (L.muster || focusF)) zones.push({ low: f.zone.low, high: f.zone.high, from: f.zone.from, to: f.zone.to, tone: "accent" });
      if (!isTrend || focusF) (f.points || []).forEach(function (p) { markers.push({ time: p.time, price: p.price, tone: tone, size: 3 }); });
      if (f.state === "CONFIRMED" && f.confirmedAt && !isTrend) {
        var ci = S.dates.indexOf(f.confirmedAt);
        if (ci >= 0) markers.push({ time: f.confirmedAt, price: S.close[ci], tone: "accent", size: 6, label: f.confirmedAtDetection ? "Erkannt nach Ausbruch" : f.family === "BREAKOUT" ? "Ausbruch" : "Bestätigt" });
      }
      if (f.state === "INVALIDATED" && f.invalidatedAt && f.invalidatedAt >= firstDate && (!isTrend || focusF)) {
        var ii = S.dates.indexOf(f.invalidatedAt);
        if (ii >= 0) markers.push({ time: f.invalidatedAt, price: S.close[ii], tone: "negative", shape: "cross", size: 5, label: focusF ? "Invalidiert" : null, badge: "muted" });
      }
      /* Bei Erkennung bereits ausgebrochen: keine eigene Erkennungsmarke vor dem Ausbruch (Erkennung = Ausbruchstag). */
      if (focusF && f.detectedAt && f.detectedAt >= firstDate && !f.confirmedAtDetection) {
        var di = S.dates.indexOf(f.detectedAt);
        if (di >= 0) markers.push({ time: f.detectedAt, price: S.close[di], tone: "muted", size: 4, label: "Erkannt", badge: "muted" });
      }
    });
  }

  function studioConfig(X, win, focusF) {
    var S = X.S, L = studio.layers, overlays = [], lines = [], zones = [], levels = [], markers = [], legend = [["Kurs", "var(--tc-price)"]];
    var from = Math.max(0, S.dates.length - win), firstDate = S.dates[from];
    if (L.sma) {
      if (X.cs.sma50) { overlays.push({ id: "sma50", label: "SMA 50", values: X.cs.sma50, color: "var(--tc-c1)" }); legend.push(["SMA 50", "var(--tc-c1)"]); }
      /* SMA 150 (AP8 L1) aus den Tagesbars wie die Screener-Spalte aboveSma150 */
      if (X.ind.sma150 && X.ind.sma150.some(isNum)) { overlays.push({ id: "sma150", label: "SMA 150", values: X.ind.sma150, color: "var(--tc-c4)", dash: "6 3" }); legend.push(["SMA 150", "var(--tc-c4)"]); }
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
    if (L.hma && ex.hma) { overlays.push({ id: "hma", label: "Hull MA 20", values: ex.hma, color: "var(--tc-c3)" }); legend.push(["Hull MA 20", "var(--tc-c3)"]); }
    if (L.chandelier && ex.chandelier) { overlays.push({ id: "chl", label: "Chandelier lang 22/3", values: ex.chandelier.long, color: "var(--tc-down)", dash: "5 3" }); legend.push(["Chandelier-Stop lang 22/3", "var(--tc-down)"]); }
    if (L.kerzen && ex.candles) {
      M.candleMarks(S, ex.candles, global.VUTechnical.Candlesticks.PATTERNS, Q.CANDLE_TYPES, from, X.st && X.st.frozenSince ? X.st.frozenIndex + 1 : null).forEach(function (m) { markers.push(m); });
      legend.push(["Kerzenmuster nach oben", "var(--tc-up)"], ["Kerzenmuster nach unten", "var(--tc-down)"]);
    }
    if (L.bb) {
      overlays.push({ id: "bbu", label: "Bollinger oben", values: X.ind.bb.upper, color: "var(--tc-c5)", dash: "2 3" });
      overlays.push({ id: "bbl", label: "Bollinger unten", values: X.ind.bb.lower, color: "var(--tc-c5)", dash: "2 3" }); legend.push(["Bollinger 20/2", "var(--tc-c5)"]);
    }
    formationLayers(X.analysis, S, L, focusF, firstDate, lines, zones, markers);
    if (L.niveaus) {
      (X.levels.resistances || []).slice(0, 2).forEach(function (z, i) { zones.push({ low: z.zoneLow, high: z.zoneHigh, tone: "negative", label: i ? null : "Widerstand" }); });
      (X.levels.supports || []).slice(0, 2).forEach(function (z, i) { zones.push({ low: z.zoneLow, high: z.zoneHigh, tone: "positive", label: i ? null : "Unterstützung" }); });
    }
    var pane = null;
    if (L.rsi) pane = { title: "RSI 14", min: 0, max: 100, guides: [30, 70], series: [{ label: "RSI", values: X.cs.rsi14 || X.ind.rsi, color: "var(--tc-c1)" }] };
    if (L.macd) pane = { title: "MACD 12/26/9", guides: [0], series: [{ label: "Histogramm", values: X.ind.macd.histogram, bars: true }, { label: "MACD", values: X.ind.macd.macd, color: "var(--tc-c1)" }, { label: "Signallinie", values: X.ind.macd.signal, color: "var(--tc-c2)" }] };
    if (L.stoch) pane = { title: "Stochastik 14/3/3", min: 0, max: 100, guides: [20, 80], series: [{ label: "%K", values: X.ind.stoch.k, color: "var(--tc-c1)" }, { label: "%D", values: X.ind.stoch.d, color: "var(--tc-c2)" }] };
    if (L.adx) pane = { title: "ADX 14", min: 0, guides: [20, 25], series: [{ label: "ADX", values: ex.adx, color: "var(--tc-c1)" }] };
    if (L.atr) pane = { title: "ATR 14 (USD)", series: [{ label: "ATR", values: ex.atr, color: "var(--tc-c1)" }] };
    if (L.cci) pane = { title: "CCI 20", guides: [-100, 0, 100], series: [{ label: "CCI", values: ex.cci, color: "var(--tc-c1)" }] };
    if (L.williams) pane = { title: "Williams %R 14", min: -100, max: 0, guides: [-80, -20], series: [{ label: "%R", values: ex.williamsR, color: "var(--tc-c1)" }] };
    if (L.aroon) pane = { title: "Aroon 25", min: 0, max: 100, guides: [30, 70], series: [{ label: "Aroon Up", values: ex.aroon.up, color: "var(--tc-up)" }, { label: "Aroon Down", values: ex.aroon.down, color: "var(--tc-down)" }] };
    if (L.mfi) pane = ex.mfi ? { title: "Money Flow Index 14", min: 0, max: 100, guides: [20, 80], series: [{ label: "MFI", values: ex.mfi, color: "var(--tc-c1)" }] } : null;
    if (L.obv) pane = ex.obv ? { title: "On-Balance-Volume", series: [{ label: "OBV", values: ex.obv, color: "var(--tc-c1)" }] } : null;
    if (L.cmf) pane = ex.cmf ? { title: "Chaikin Money Flow 20", guides: [0], series: [{ label: "CMF", values: ex.cmf, bars: true }] } : null;
    if (L.roc) pane = { title: "ROC 21 / 63 (%)", guides: [0], series: [{ label: "ROC 21", values: ex.roc21, color: "var(--tc-c1)" }, { label: "ROC 63", values: ex.roc63, color: "var(--tc-c2)" }] };
    if (L.crsi) pane = ex.connorsRsi ? { title: "Connors RSI 3/2/100", min: 0, max: 100, guides: [10, 90], series: [{ label: "Connors RSI", values: ex.connorsRsi, color: "var(--tc-c1)" }] } : null;
    if (L.zscore) pane = ex.zScore ? { title: "Z-Score 20", guides: [-2, 0, 2], series: [{ label: "Z-Score", values: ex.zScore, color: "var(--tc-c1)" }] } : null;
    if (L.elder) pane = ex.elderImpulse ? { title: "Elder Impulse 13 (+1 grün, −1 rot)", min: -1, max: 1, guides: [0], series: [{ label: "Impuls", values: ex.elderImpulse, bars: true }] } : null;
    if (L.vortex) pane = ex.vortex ? { title: "Vortex 14", guides: [1], series: [{ label: "VI+", values: ex.vortex.plus, color: "var(--tc-up)" }, { label: "VI−", values: ex.vortex.minus, color: "var(--tc-down)" }] } : null;
    if (L.chop) pane = ex.choppiness ? { title: "Choppiness 14", min: 0, max: 100, guides: [38.2, 61.8], series: [{ label: "Choppiness", values: ex.choppiness, color: "var(--tc-c1)" }] } : null;
    if (L.hv) pane = ex.historicalVolatility ? { title: "Historische Volatilität 20 (% p. a.)", min: 0, series: [{ label: "HV 20", values: ex.historicalVolatility, color: "var(--tc-c1)" }] } : null;
    /* Prozentpunkte wie die Screener-Spalten rs3m/rs6m; ohne Vergleichsreihe kein Fenster. */
    if (L.rs) pane = ex.rs63 && !(X.st && X.st.frozenSince) ? { title: "Relative Stärke ggü. S&P 500 (SPY), Prozentpunkte", guides: [0], series: [{ label: "3 Monate", values: ex.rs63.map(function (v) { return v * 100; }), color: "var(--tc-c1)" }, { label: "6 Monate", values: ex.rs126.map(function (v) { return v * 100; }), color: "var(--tc-c2)" }] } : null;
    if (L.ulcer) pane = ex.ulcerIndex ? { title: "Ulcer Index 14 (%)", min: 0, series: [{ label: "Ulcer", values: ex.ulcerIndex, color: "var(--tc-c1)" }] } : null;
    return { title: X.T + " Tageschart", mode: studio.mode === "line" ? "line" : "candles", area: studio.mode === "line", window: win, data: S, overlays: overlays, lines: lines, zones: zones, levels: levels, markers: markers, volume: !!L.volumen, pane: pane, legend: legend };
  }

  function renderSignalCards(host, analysis, F, close, compact, st) {
    if (st && st.frozenSince) return put(host, [el("h2", { text: compact ? "Befunde heute" : "Alle Befunde" }),
      stateBox("Keine Befunde", "Der Schlusskurs ist " + (st.frozenIndex === 0 ? "spätestens " : "") + "seit dem " + M.dateDe(st.frozenSince) + " unverändert. Ohne Kursänderung gibt es keinen Ausbruch, kein Momentum und keinen Trend.")]);
    var all = M.findings(analysis, F, close);
    var active = all.filter(function (f) { return !(f.formation && f.formation.state === "INVALIDATED"); });
    var shown = compact ? active.slice(0, 6) : all;
    put(host, [el("h2", { text: compact ? "Befunde heute" : "Alle Befunde" }),
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
          el("dt", { text: "Erkannt" }), el("dd", { text: M.dateDe(x.detectedAt) + " (frühester Tag, an dem die Formation mit dem damaligen Wissen erkennbar war)" }),
          x.breakout ? el("dt", { text: "Ausbruch" }) : null, x.breakout ? el("dd", { text: (x.breakout.direction === "UP" ? "Nach oben" : "Nach unten") + " am " + M.dateDe(x.breakout.at) + (x.confirmedAtDetection ? " – bei Erkennung bereits ausgebrochen" : "") }) : null,
          x.provisional ? el("dt", { text: "Status" }) : null, x.provisional ? el("dd", { text: "Vorläufig: vier bestätigte Swing-Punkte; bestätigt erst mit einem fünften Punkt im Kanal." }) : null,
          el("dt", { text: "Im Chart" }), el("dd", {}, el("a", { class: "tc-link", href: M.chartHref(M.parseRoute(location.hash).ticker || "", "studio", "f=" + encodeURIComponent(x.id)), text: "Nur diese Formation im Chart Studio zeigen" })),
          evidence ? el("dt", { text: "Historisch" }) : null, evidence ? el("dd", { text: M.evidenceText(evidence.byType[x.type], evidence.doc.window) }) : null,
          el("dt", { text: "Zeitrahmen" }), el("dd", { text: x.timeframe === "1D" ? "Tag" : x.timeframe }),
          el("dt", { text: "Datenbasis" }), el("dd", { text: (dq.bars || "–") + " Tagesbars" + (dq.hasVolume ? ", mit Volumen" : ", ohne Volumen") + ", ATR " + M.price(dq.atr) })
        ])
      ]);
    }
    var head = [shapeBox(f, 28), el("span", { class: "tc-row-text" }, [el("b", { text: f.title }), el("span", { text: f.text })]), f.kind === "indicator" && !findingDir(f) ? h(U.verdict("mid", f.badge)) : dirVerdict(findingDir(f))];
    return detail ? el("details", { class: "tc-signal" }, [el("summary", {}, head.concat([glyph("chevron", "tc-chev tc-rot")])), detail]) : el("div", { class: "tc-signal" }, head);
  }

  /* Kapitel „Alle Befunde mit Regel“ und „Verlauf der letzten 12 Monate“ (#/chart/<T>/signale, alte Adresse bleibt). */
  function renderSignals(body, X) {
    var st = X.st, cards = el("section", {}), hist = X.hist || [];
    renderSignalCards(cards, X.analysis, X.F, X.S.close[X.S.close.length - 1], false, st);
    var histList = el("section", { class: "tc-history", id: "tc-verlauf" }, [rh("Verlauf der letzten 12 Monate", null, null, "Jede Zeile zeigt, was am Tag des Befunds mit den damals verfügbaren Daten erkennbar war, und den heutigen Zustand."),
      hist.length ? timeline(hist.slice().reverse()) : el("p", { class: "tc-note", text: "Im Zeitraum haben die Regeln nichts gefunden." })]);
    put(body, [el("a", { class: "tc-back", href: M.chartHref(X.T) }, [glyph("back"), "Chart-Seite"]), seriesNote(st), cards, st.frozenSince ? null : zoneTiles(X.levels), histList, dataQuality(X.inst, X.D, false), footNote(X.D && X.D.meta && X.D.meta.asOf)]);
    if (X.teil === "verlauf") setTimeout(function () { histList.scrollIntoView({ block: "start" }); }, 0);
  }
  function dataQuality(inst, D, weekly) {
    var b = inst.bars, bundle = inst.bundle || {};
    return el("details", { class: "tc-dq" }, [el("summary", { text: "Datenqualität und Herkunft" }), el("dl", {}, [
      el("dt", { text: "Kursreihe" }), el("dd", { text: "Tagesschlusskurse, split-bereinigt (" + (inst.priceSeriesType || "–") + "), " + b.close.length + " Tagesbars bis " + M.dateDe(b.timestamps[b.timestamps.length - 1]) }),
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
        var PJ = global.VUTechnical && global.VUTechnical.PriceJumps, at = PJ ? PJ.all(b).map(function (j) { return M.dateDe(j.date) + " (×" + String(j.factor).replace(".", ",") + ")"; }) : [];
        return at.length ? [el("dt", { text: "Kurssprünge" }), el("dd", { class: "is-warn", text: "Datenverdacht am " + at.slice(-3).join(", ") + ": Schlussfaktor mit Split-Signatur oder außerhalb 0,2–5. Indikatoren und Formationen um diese Tage können verfälscht sein; Kurslücken werden dort nicht gemeldet. Ob ein Sprung als Datenfehler bestätigt ist, zeigt die Vorlagen-Prüfleiste." })] : null;
      })(),
      el("dt", { text: "Volumen" }), el("dd", { text: b.volume && b.volume.some(function (v) { return v > 0; }) ? "vorhanden" : "nicht vorhanden – Volumenindikatoren entfallen" }),
      el("dt", { text: "Formationen" }), el("dd", { text: "Nur bestätigte Swing-Punkte; Erkennung ohne Blick in die Zukunft (Engine " + global.VUTechnical.Formations.ENGINE_VERSION + ")" }),
      weekly ? el("dt", { text: "Wochenchart" }) : null, weekly ? el("dd", { text: "Wochenschlüsse aus der langen Reihe (discover-series-long), nur Schlusskurse" }) : null,
      el("dt", { text: "Screener-Stand" }), el("dd", { text: D && D.meta ? M.dateDe(D.meta.asOf) + " · " + D.meta.counts.rows.toLocaleString("de-DE") + " Titel" : "nicht geladen" })
    ])]);
  }

  /* ----------------------------------------------------------- Muster (T05, frueher Methodik) */
  /* Heute im Markt: Gruppen aus meta.json#formations (Erkannt + Bestaetigt), Richtung aus formation-evidence.json#types[].direction. */
  var FAMILY = [
    ["TREND", "Trend", "wohin der Kurs über Wochen läuft", "trend"], ["MOMENTUM", "Schwung", "wie stark der Kurs gerade drückt", "pulse"],
    ["VOLATILITY", "Schwankung", "wie unruhig der Kurs ist", "contraction"], ["VOLUME", "Volumen", "wie viele mitmachen", "bars"]
  ];
  /* Alltagssatz und drei Lesarten je Indikator (Darstellung; die Definition bleibt die der Engine, indicators.js#CATALOG). */
  var IND_PLAIN = {
    sma: ["Der Durchschnittskurs der letzten Tage. Er glättet das Zappeln und zeigt die Richtung.", [["Üblich", "50 und 200 Tage"], ["Kurs darüber", "Trend eher aufwärts"], ["Kurs darunter", "Trend eher abwärts"]]],
    ema: ["Wie der Durchschnitt, aber jüngere Tage zählen mehr. Reagiert schneller.", [["Üblich", "20, 50 und 200 Tage"], ["Kurs darüber", "Trend eher aufwärts"], ["Kurs darunter", "Trend eher abwärts"]]],
    adx: ["Misst, wie kräftig ein Trend ist – egal ob auf- oder abwärts.", [["Unter 20", "kaum Trend"], ["Über 25", "deutlicher Trend"], ["Steigend", "Trend wird kräftiger"]]],
    supertrend: ["Eine Linie unter oder über dem Kurs, die bei einem Richtungswechsel die Seite wechselt.", [["Linie unter dem Kurs", "Aufwärtsphase"], ["Linie über dem Kurs", "Abwärtsphase"], ["Wechsel", "Richtung dreht"]]],
    ichimoku: ["Eine Wolke aus mehreren Linien zeigt Trend und Unterstützung auf einen Blick.", [["Kurs über der Wolke", "Trend eher aufwärts"], ["Kurs in der Wolke", "unentschieden"], ["Kurs unter der Wolke", "Trend eher abwärts"]]],
    psar: ["Punkte über oder unter dem Kurs, die einem Trend nachlaufen.", [["Punkte unter dem Kurs", "Aufwärtsphase"], ["Punkte über dem Kurs", "Abwärtsphase"], ["Seitenwechsel", "mögliche Wende"]]],
    rsi: ["Misst von 0 bis 100, wie stark der Kurs zuletzt gestiegen oder gefallen ist.", [["Über 70", "„überkauft“, stark gelaufen"], ["Um 50", "ausgeglichen"], ["Unter 30", "„überverkauft“, stark gefallen"]]],
    macd: ["Vergleicht einen schnellen und einen langsamen Durchschnitt und zeigt, ob der Schwung zu- oder abnimmt.", [["Über der Signallinie", "Schwung nimmt zu"], ["Unter der Signallinie", "Schwung nimmt ab"], ["Über null", "kurzer Schnitt über dem langen"]]],
    stochastic: ["Zeigt, wo der Schluss in der Spanne der letzten Tage liegt.", [["Über 80", "nahe am Hoch der Spanne"], ["Unter 20", "nahe am Tief der Spanne"], ["Kreuzungen", "Schwung dreht"]]],
    atr: ["Die durchschnittliche Tagesspanne in Dollar: wie weit der Kurs an einem Tag schwankt.", [["Hoch", "unruhiger Kurs"], ["Niedrig", "ruhiger Kurs"], ["Steigend", "Unruhe nimmt zu"]]],
    bollinger: ["Ein Band um den Durchschnitt, das mit der Schwankung breiter oder schmaler wird.", [["Schmales Band", "Ruhe, oft vor einer Bewegung"], ["Kurs am oberen Band", "stark gelaufen"], ["Kurs am unteren Band", "stark gefallen"]]],
    obv: ["Zählt Volumen an Plus-Tagen dazu und an Minus-Tagen ab.", [["Steigend", "Käufer überwiegen"], ["Fallend", "Verkäufer überwiegen"], ["Gegen den Kurs", "Bewegung hat wenig Rückhalt"]]],
    relativeVolume: ["Wie viel heute gehandelt wurde, verglichen mit einem üblichen Tag.", [["1,0×", "üblicher Tag"], ["Über 1,5×", "viel los"], ["Über 2×", "Volumenspitze"]]]
  };
  function patternSheet(c, names) {
    var VT = global.VUTechnical, P = IND_PLAIN[c.id], params = Object.keys(c.params || {}).map(function (k) { return k + " " + c.params[k]; }).join(", ");
    var chartHost = el("div", { class: "tc-ind-chart" }, el("div", { class: "tc-skel", style: "height:160px" }));
    var fam = FAMILY.filter(function (f) { return f[0] === c.family; })[0];
    sheet("tc-ind-sheet", (fam ? fam[1] : c.family) + " · Indikator", c.name, [
      el("p", { class: "tc-sheet-lead", text: P ? P[0] : c.definition }), chartHost,
      P ? el("dl", { class: "vu-box tc-kv" }, P[1].reduce(function (a, r) { return a.concat([el("dt", { text: r[0] }), el("dd", { text: r[1] })]); }, [])) : null,
      el("div", { class: "vu-box vu-box--ink tc-formula" }, [h(U.pro()), " ", c.definition + (params ? " · Standard: " + params : "") + (c.warmup ? " · Aufwärmphase " + c.warmup(c.params) + " Bars" : "")])]);
    /* NVIDIA als Beispiel: Kurslinie und, wo der Indikator im Kurs liegt, die Linie dazu. */
    loadInstrument("NVDA").then(function (r) {
      var b = r.inst.bars, S = { dates: b.timestamps, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }, out = VT.Indicators.compute(S, c.id, c.params);
      var vals = out && !out.error ? out.values : null, ov = [], pane = null;
      if (Array.isArray(vals)) { if (c.overlay) ov.push({ id: c.id, label: c.name, values: vals, color: "var(--tc-c2)", dash: "5 4" }); else pane = { title: c.name, series: [{ label: c.name, values: vals, color: "var(--tc-c2)" }] }; }
      else if (vals && typeof vals === "object") { var k = Object.keys(vals).filter(function (x) { return Array.isArray(vals[x]); })[0]; if (k) { if (c.overlay) ov.push({ id: k, label: k, values: vals[k], color: "var(--tc-c2)", dash: "5 4" }); else pane = { title: c.name + " · " + k, series: [{ label: k, values: vals[k], color: "var(--tc-c2)" }] }; } }
      Chart.render(chartHost, { title: "NVIDIA mit " + c.name, mode: "line", area: true, window: 252, height: 150, data: S, overlays: ov, lines: [], zones: [], levels: [], markers: [], volume: false, pane: pane });
      chartHost.append(el("p", { class: "tc-note", text: "NVIDIA, letzte 12 Monate" + (ov.length ? ", " + c.name + " gestrichelt." : pane ? ", " + c.name + " im Unterfenster." : ".") }));
    }).catch(function () { put(chartHost, el("p", { class: "tc-note", text: "Beispielchart nicht verfügbar." })); });
  }
  function viewMethod(main, route) {
    var tab = (route && route.params && route.params.reiter) || "muster";
    if (["muster", "indikatoren", "regeln"].indexOf(tab) < 0) tab = "muster";
    var head = el("header", { class: "tc-phead" }, [el("p", { class: "vu-ltag", text: "Muster" }), el("h1", { class: "vu-lt", html: "Was die Formen<br>im Chart bedeuten" })]);
    var tabsBar = h(U.seg([{ id: "muster", label: "Muster", href: "#/muster" }, { id: "indikatoren", label: "Indikatoren", href: "#/muster?reiter=indikatoren" }, { id: "regeln", label: "Regeln", href: "#/muster?reiter=regeln" }], tab, { label: "Muster-Ansicht" }));
    var slot = el("div", { class: "tc-method" }, [el("div", { class: "tc-skel", style: "height:200px" })]);
    put(main, [head, tabsBar, slot]);
    if (tab === "muster") return musterTab(slot);
    loadEngines().then(function () {
      if (tab === "indikatoren") return indicatorTab(slot, route.params.familie);
      rulesTab(slot);
    }).catch(function () { put(slot, stateBox("Muster nicht geladen", "Die Engine-Dateien konnten nicht geladen werden.")); });
  }
  /* Musterseite (Vorlage c-muster): Raster mit Bild, Zahl und Richtung; „Hilft das Muster?“ als Liste mit Urteil (Entscheidung 11). */
  var MUSTER_GRID = [["Dreieck", ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"], "dreieck", "dreieck"], ["Ausbruch aus Range", ["RANGE_BREAKOUT"], "range", "breakout"],
    ["Doppelboden", ["DOUBLE_BOTTOM"], "doppelboden", "doppelboden"], ["Doppeltop", ["DOUBLE_TOP"], "doppeltop", "doppeltop"], ["Kopf-Schulter", ["HEAD_AND_SHOULDERS"], "kopf", "sks"],
    ["Kurslücke nach oben", ["GAP_UP"], "luecke_up", "luecke"], ["Kurslücke nach unten", ["GAP_DOWN"], "luecke_dn", "luecke"], ["Flagge steigend", ["BULL_FLAG", "BULL_PENNANT"], "flagge", "flagge"]];
  function musterTab(slot) {
    Promise.all([fetchJSON(M.META_PATH), loadEvidence()]).then(function (r) {
      var meta = r[0], E = r[1], nTypes = E && E.doc ? E.doc.types.length : null;
      var kids = [el("div", { class: "tc-st" }, ["Heute im Markt", nTypes ? el("a", { href: "#/muster?reiter=regeln", text: nTypes + " Muster" }) : null]),
        el("div", { class: "tc-mgrid" }, MUSTER_GRID.map(function (m) { return mgCell("#/screener?muster=" + m[3], m[0], patternCount(meta, m[1]), patternDir(E, m[1]), m[2]); })),
        h(U.help("▲ deutet nach oben, ▼ nach unten, ◆ Richtung offen. Zahl: Aktien mit dem Muster am " + (meta && meta.asOf ? dShort(meta.asOf) : "Stichtag") + "."))];
      if (E && E.doc) {
        var d = E.doc, pub = d.types.filter(function (t) { return t.published; });
        var name = function (t) { return M.plain(Q.FORMATION_TYPES[t.type]) || t.type; };
        var verdictOf = function (t) { return t.significant ? (t.hitRate > 0.5 ? U.verdict("strong", "Belegt") : U.verdict("weak", "Gegen die Lesart")) : U.verdict("none", "Kein Vorteil"); };
        /* Belegte zuerst, dann nach Fallzahl. */
        var rows = pub.slice().sort(function (a, b) { return (b.significant && b.hitRate > 0.5) - (a.significant && a.hitRate > 0.5) || b.n - a.n; }).slice(0, 4);
        kids.push(el("div", { class: "tc-st" }, ["Hilft das Muster?", el("a", { href: "#/muster?reiter=regeln", text: "Forschung" })]),
          el("div", { class: "vu-box tc-hilft" }, rows.map(function (t) {
            return el("div", { class: "tc-kvrow" }, [el("span", {}, [el("b", { text: name(t) }), el("small", { text: de(t.hitRate * 100, 1) + " % lagen vorn · " + t.n.toLocaleString("de-DE") + " Fälle · " + d.method.horizonBars + " Tage danach" })]), h(verdictOf(t))]);
          })),
          h(U.help("„Lagen vorn“: Anteil der Fälle, in denen die Aktie " + d.method.horizonBars + " Handelstage danach besser lief als der Durchschnitt (bei fallenden Mustern: schlechter). Forschung, nicht zertifiziert.")),
          el("p", { class: "tc-note" }, [el("a", { class: "tc-link", href: "#/muster?reiter=regeln", text: "Alle " + d.types.length + " Muster mit Belegen und Regeln" })]));
      }
      kids.push(footNote(meta && meta.asOf));
      put(slot, kids);
    }).catch(function () { put(slot, stateBox("Muster nicht geladen", "Die Musterzahlen konnten nicht geladen werden.")); });
  }
  function indicatorTab(slot, familie) {
    var VT = global.VUTechnical, CAT = VT.Indicators.CATALOG.filter(function (c) { return !c.catalogOnly; });
    var kids = FAMILY.map(function (f) {
      var list = CAT.filter(function (c) { return c.family === f[0]; });
      return el("section", { class: "tc-family", id: f[0].toLowerCase() }, [sect(f[1] + " · " + list.length), el("p", { class: "tc-note", text: "Zeigt " + f[2] + "." }),
        el("div", { class: "vu-box tc-plist" }, list.map(function (c) {
          return el("button", { type: "button", class: "tc-prow", onclick: function () { patternSheet(c); } }, [el("span", { class: "tc-row-text" }, [el("b", { text: c.name }), el("span", { text: IND_PLAIN[c.id] ? IND_PLAIN[c.id][0] : c.definition })]), glyph("chevron", "tc-chev")]);
        }))]);
    });
    var sigSec = el("div", {});
    put(slot, kids.concat([sigSec, el("p", { class: "tc-note", text: "Weitere " + (VT.Indicators.CATALOG.length - CAT.length) + " Indikatoren stehen im Katalog und im Filter-Baukasten des Screeners." })]));
    signalEvidence(sigSec);
    if (familie) { var t = doc.getElementById(String(familie).replace(/[^a-z]/g, "")); if (t) t.scrollIntoView({ block: "start" }); }
  }
  /* Regeln und Grenzen: Formationen, Daten, Suche in Worten, historische Evidenz (vollstaendig wie die fruehere Methodik). */
  function rulesTab(slot) {
    var VT = global.VUTechnical;
    var rules = VT.Formations.RULES, legacy = VT.Formations.LEGACY, names = Q.FORMATION_TYPES;
    var forms = el("details", { class: "tc-filter vu-box" }, [el("summary", {}, [el("b", { text: "Formationen und Zustände" }), glyph("chevron", "tc-chev tc-rot")]),
      el("div", { class: "tc-filter-body" }, [el("p", { text: "Jede Formation ist entweder erkannt (in Bildung), bestätigt (Bestätigungsregel erfüllt) oder invalidiert. Erkannt wird nur aus bestätigten Swing-Punkten; der Erkennungstag ist der erste Tag, an dem die Formation mit den damals verfügbaren Daten sichtbar war – nie rückwirkend." }),
        el("dl", { class: "tc-defs" }, Object.keys(names).reduce(function (a, k) {
          var r = rules[k], l = legacy[k];
          return a.concat([el("dt", { text: names[k] }), el("dd", { text: r ? "Erkennung: " + r.detect + " Bestätigung: " + r.confirm + " Invalidierung: " + r.invalidate : "Regelwerk ti-chart-patterns (Doppeltop/-boden, Kopf-Schulter, Dreiecke, Rechteck, Flagge, Tasse mit Henkel). Bestätigung: " + l.confirm + " Invalidierung: " + l.invalidate })]);
        }, []))])]);
    var ind = el("details", { class: "tc-filter vu-box" }, [el("summary", {}, [el("b", { text: "Indikatoren: Formeln und Parameter" }), h(U.pro()), glyph("chevron", "tc-chev tc-rot")]),
      el("div", { class: "tc-filter-body" }, el("dl", { class: "tc-defs" }, VT.Indicators.CATALOG.filter(function (c) { return !c.catalogOnly; }).reduce(function (a, c) {
        var params = Object.keys(c.params).map(function (p) { return p + " " + c.params[p]; }).join(", ");
        return a.concat([el("dt", { text: c.name }), el("dd", { text: c.definition + (params ? " · Standard: " + params : "") + " · Aufwärmphase: " + c.warmup(c.params) + " Bars" })]);
      }, [])))]);
    var data = el("details", { class: "tc-filter vu-box", open: true }, [el("summary", {}, [el("b", { text: "Daten, Zeitrahmen und Grenzen" }), glyph("chevron", "tc-chev tc-rot")]),
      el("div", { class: "tc-filter-body" }, [el("ul", { class: "tc-bullets" }, [
        "Tageskurse: Tagesschlusskurse, split-bereinigt nach der einen Preiswahrheit der Plattform (ADR-002); 270 Tagesbars je Titel aus der Produkt-Materialisierung.",
        "SMA 50/200, RSI 14, ADX, MACD, 52-Wochen-Hoch und -Tief und relatives Volumen im Screener stammen aus der Vollhistorie (feature-store.js, dieselbe Rechnung wie Quant). Das 52-Wochen-Hoch bzw. -Tief des Tages vergleicht Tageshoch bzw. Tagestief mit dem höchsten Hoch bzw. tiefsten Tief der letzten 252 Handelstage.",
        "EMA 20/50/200 werden auf der Vollhistorie gerechnet und an einem Tag nur gezeigt, wenn ihr möglicher Fehler gegenüber jeder anderen Startkonvention höchstens 0,1 % des Kurses beträgt (Schranke: Restgewicht des Startwerts × Spanne des Startfensters ÷ Schlusskurs) und der Startwert höchstens noch mit 5 % wirkt. Frühestens ab 500 Tagesbars (EMA 200), 125 (EMA 50) und 50 (EMA 20). Bei stark gefallenen Titeln kann die EMA 200 trotz langer Historie fehlen; der 200-Tage-Trend steht dann über die SMA 200.",
        "Woche und Monat: Kennzahlen am letzten abgeschlossenen Wochen- bzw. Monatsbar, gebildet in der Materialisierung aus der vollen Tageshistorie (Eröffnung, Hoch, Tief, Schluss, Volumen; Monatsschluss = Schluss des letzten Handelstags im Monat). Veröffentlicht werden nur die Kennzahlen, keine Wochen- oder Monatsbars. 52-Wochen- bzw. 12-Monats-Hoch und -Tief vergleichen dort Schlusskurse. Ereignisse je Woche/Monat zählen Bars seit dem Ereignis. Titel ohne Materialisierung nutzen Wochenschlüsse aus der langen Reihe.",
        "Zeitbezug: Ein Titel, dessen letzter Kurs vor dem Stichtag liegt, trägt keine Ereignisse und keine Stichtagszustände (Anzeige „Kurs vom …“). Endet eine Reihe mit mindestens fünf gleichen Schlusskursen, gilt sie als eingefroren und trägt keine Kennzahlen (Anzeige „Kurs unverändert seit …“). Das ist ein Datenqualitätshinweis, kein bestätigtes Delisting.",
        "Relative Stärke: Kursänderung über 63 bzw. 126 Handelstage minus der des S&P-500-ETF SPY am selben Stichtag.",
        "Es gibt keine Gesamtnote: Sortiert wird nach einem gewählten, offengelegten Feld oder nach der Zahl erfüllter Bedingungen.",
        "Markt heute (Startseite): Anteil der Aktien über der 200-Tage-Linie; ab 60 % „Starker Markt“, ab 40 % „Gemischter Markt“, darunter „Schwacher Markt“. Eine Beschreibung, keine Prognose.",
        "Formationen und Ereignisse sind beschreibend: technisch definierte Zustände und Ereignisse. Die historische Auswertung der Formationen ist eine statistische Beobachtung über rund ein Marktjahr, kein nachgewiesener handelbarer Vorteil und keine Prognose."
      ].map(function (t) { return el("li", { text: t }); }))])]);
    var search = el("details", { class: "tc-filter vu-box" }, [el("summary", {}, [el("b", { text: "Suche in Worten" }), glyph("chevron", "tc-chev tc-rot")]),
      el("div", { class: "tc-filter-body" }, [el("ul", { class: "tc-bullets" }, [
        "Regelbasiert, ohne Sprachmodell: Fachbegriffe („über der SMA 200“, „Doppelboden“, „Volumenspitze“, „überverkauft“) und Kennzahlen mit Vergleich („RSI unter 40“, „ADX ≥ 25“, „RSI zwischen 30 und 50“) werden in dieselbe validierte Abfrage übersetzt wie die Filter per Klick.",
        "„und“, „mit“ und Komma verbinden Bedingungen; „oder“ trennt Alternativen („und“ bindet stärker). Mehrere Formationen bilden eine Liste: „Dreieck oder Keil“ genügt eine davon.",
        "„bestätigt“ verlangt bestätigte Formationen; „Woche“ oder „Monat“ wählt den Zeitrahmen. Prozentkennzahlen werden in Prozent gelesen: „Abstand zum 52-Wochen-Hoch über -5“ = −5 %.",
        "Nicht Erkanntes wird angezeigt und nicht geraten. Die kanonische Schreibweise (z. B. „aboveSma200 und rsi14 < 40“) wird unter der Eingabe gezeigt und ist ebenfalls eingebbar.",
        "Eine Übersetzung durch ein Sprachmodell ist vorbereitet (gleiches Abfrageschema, Prüfung durch dieselbe Validierung), aber nicht aktiv."
      ].map(function (t) { return el("li", { text: t }); }))])]);
    var evSec = el("div", {}), sigSec = el("div", {});
    loadEvidence().then(function (E) {
      if (!E) return;
      var d = E.doc, w = d.window, fmt = function (v) { return isNum(v) ? (v * 100).toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " %" : "–"; };
      put(evSec, el("details", { class: "tc-filter vu-box", open: true }, [el("summary", {}, [el("b", { text: "Historische Evidenz der Formationen" }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [h(U.research()),
          el("p", { text: "Jede Formation zählt einmal, am ersten Tag, an dem sie mit den damaligen Daten sichtbar war. Gemessen wird 20 Handelstage danach: Zustand laut Regel und die richtungsbereinigte Rendite im Vergleich zum Durchschnitt aller Titel am selben Tag. Erkennungen " + M.dateDe(w.from) + " bis " + M.dateDe(w.to) + ", " + d.titles.toLocaleString("de-DE") + " Titel – rund ein Marktjahr, kein voller Zyklus. Keine Handelssimulation, keine Kosten, keine Prognose." }),
          el("p", { class: "tc-note", text: "„Entfallen“: Die Formation wurde vor Ablauf nicht mehr geführt, ohne dass Bestätigung oder Invalidierung festgehalten wurde – bei den Bestandsformationen (Dreiecke, Doppelböden, SKS, Rechteck, Flaggen) häufig, weil sie beim Bruch verschwinden. Belastbar heißt: Das Ergebnis besteht die Bonferroni-Korrektur über alle " + d.types.length + " Typen. Ab " + d.method.minN + " Fällen wird ein Typ ausgewiesen." }),
          el("div", { class: "tc-table-wrap" }, el("table", { class: "tc-table" }, [
            el("thead", {}, el("tr", {}, ["Formation", "n", "lagen vorn", "bestätigt", "invalidiert", "entfallen", "Rendite ggü. Querschnitt", "Aussage"].map(function (hh) { return el("th", { scope: "col", text: hh }); }))),
            el("tbody", {}, d.types.slice().sort(function (a, b) { return b.n - a.n; }).map(function (t) {
              return el("tr", {}, [el("th", { scope: "row", text: M.plain(Q.FORMATION_TYPES[t.type]) || t.type }), el("td", { class: "num", text: t.n.toLocaleString("de-DE") }),
                el("td", { class: "num", text: t.published && isNum(t.hitRate) ? fmt(t.hitRate) : "–" }),
                el("td", { class: "num", text: t.published ? fmt(t.confirmedBy20) : "–" }), el("td", { class: "num", text: t.published ? fmt(t.invalidatedBy20) : "–" }), el("td", { class: "num", text: t.published ? fmt(t.droppedBy20) : "–" }),
                el("td", { class: "num", text: t.published ? (t.excess20Mean > 0 ? "+" : "") + (t.excess20Mean * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " % ± " + (t.excess20Ci95 * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–" }),
                el("td", { text: !t.published ? "zu wenige Fälle" : t.significant ? "belastbar" : "nicht belastbar" })]);
            }))]))])]));
    });
    signalEvidence(sigSec);
    put(slot, [data, forms, evSec, sigSec, ind, search, disclaimer(null)]);
  }
  /* AP6 (H4): historische Beobachtung zu Indikator-Ereignissen und Kerzenmustern; fehlt die Datei, bleibt der Abschnitt weg. */
  function signalEvidence(sigSec) {
    fetchJSON(M.SIGNAL_EVIDENCE_PATH).then(function (S) {
      if (!S || !/^vu-technical-signal-evidence-1\./.test(S.schemaVersion || "")) return;
      var dir = { BULLISH: "deutet nach oben", BEARISH: "deutet nach unten", NEUTRAL: "Richtung offen" };
      function table(rows) {
        return el("div", { class: "tc-table-wrap" }, el("table", { class: "tc-table is-wrap" }, [
          el("thead", {}, el("tr", {}, ["Ereignis (übliche Lesart)", "Einordnung", "ggü. Querschnitt nach 20 Tagen", "n"].map(function (hh) { return el("th", { scope: "col", text: hh }); }))),
          el("tbody", {}, rows.slice().sort(function (a, b) { return b.n - a.n; }).map(function (r) {
            var excess = isNum(r.mean) ? (r.direction === "BEARISH" ? -r.mean : r.mean) : null;
            return el("tr", { title: M.signalEvidenceText(r) }, [el("th", { scope: "row", text: r.name + " (" + (dir[r.direction] || r.direction) + ")" }),
              el("td", { text: M.READING_SHORT[r.reading] || "–" }),
              el("td", { class: "num", text: isNum(excess) ? (excess > 0 ? "+" : "") + (excess * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " % ± " + (r.ci95 * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–" }),
              el("td", { class: "num", text: r.n.toLocaleString("de-DE") })]);
          }))]));
      }
      put(sigSec, el("details", { class: "tc-filter vu-box" }, [el("summary", {}, [el("b", { text: "Historische Beobachtung: Indikator-Ereignisse und Kerzenmuster" }), glyph("chevron", "tc-chev tc-rot")]),
        el("div", { class: "tc-filter-body" }, [h(U.research()),
          el("p", { text: "Drei Dinge sind zu unterscheiden. Ein Ereignis (z. B. „MACD kreuzt die Signallinie aufwärts“) ist technisch eindeutig definiert und nachrechenbar. Was danach im Mittel geschah, ist eine historische Beobachtung. Ein handelbarer Vorteil nach Kosten, Ausführung und Prüfung außerhalb der Stichprobe ist für keine Zeile nachgewiesen. Die Tabelle zeigt keine Handlungsempfehlungen." }),
          el("p", { text: "Gemessen: Kursverlauf vom Schluss des Ereignistags bis 20 Handelstage später im Vergleich zum Mittel aller Titel am selben Tag. Grundlage: " + S.titles.toLocaleString("de-DE") + " Titel, je Titel die 270 veröffentlichten Tagesbars bis " + M.dateDe(S.window.to) + " – rund ein Marktjahr, kein voller Zyklus. Positiv heißt: der Titel lief besser als der Querschnitt, unabhängig von der Lesart. Ab " + S.method.minN + " Fällen wird eine Zeile ausgewiesen." }),
          el("p", { class: "tc-note", text: "Einordnung: „kein gesicherter Unterschied“ – nach Korrektur für viele gleichzeitige Tests kein statistisch gesicherter Unterschied nachgewiesen; das heißt nicht, dass Gleichheit bewiesen ist; „uneinheitlich“ – belastbar im Mittel, aber mit wechselndem Vorzeichen zwischen Marktphasen (S&P 500 über/unter seiner 50-Tage-Linie) oder Zeithälften; „wie“ bzw. „gegen übliche Lesart“ – belastbar und in allen Teilmengen gleich gerichtet; „ohne Richtung“ – Muster wie Doji haben keine Lesart. Kosten und Survivorship Bias sind nicht berücksichtigt." }),
          el("h3", { text: "Indikator-Ereignisse" }), el("p", { class: "tc-note", text: M.signalEvidenceSummary(S.indicators) }), table(S.indicators),
          el("h3", { text: "Kerzenmuster" }), el("p", { class: "tc-note", text: M.signalEvidenceSummary(S.candles) }), table(S.candles)])]));
    }).catch(function () { /* ohne Datei kein Abschnitt */ });
  }

  /* ------------------------------------------------------------- Router */
  function render() {
    var main = doc.getElementById("tc-main"), route = M.parseRoute(location.hash);
    closeSheets();
    /* Bausteine des Redesigns (vu-ui) gelten fuer Technical; die Akademie behaelt ihre eigene Typografie. */
    main.classList.toggle("vu-ui", route.view !== "academy");
    main.classList.toggle("is-home", route.view === "home");
    /* Entscheidung 8: die Übersichten von Akademie und Assistent leiten auf „Lernen“; Lektionen und Fragen behalten ihre Adresse. */
    if (redirectOf(location.hash)) { redirected = true; location.replace(redirectOf(location.hash)); return; }
    if (route.view === "home") { doc.title = "Technical · Vision Universe®"; viewHome(main); }
    else if (route.view === "learn") { doc.title = "Lernen · Technical · Vision Universe®"; viewLearn(main); }
    else if (route.view === "academy") { global.VUAcademy.render(main, route.id); }
    else if (route.view === "screener") { doc.title = (route.tab === "templates" ? "Vorlagen" : route.tab === "saved" ? "Gespeichert" : "Screener") + " · Technical · Vision Universe®"; viewScreener(main, route); }
    else if (route.view === "chart") { doc.title = (route.ticker ? route.ticker + " · " : "") + (route.tab === "studio" ? "Chart Studio" : "Chart") + " · Technical · Vision Universe®"; viewChart(main, route); }
    else if (route.view === "method") { doc.title = "Muster · Technical · Vision Universe®"; viewMethod(main, route); }
    else if (route.view === "assistant") { var gg = route.id && AS && AS.get(route.id); doc.title = (gg ? gg.title + " · " : "") + "Analyse-Assistent · Technical · Vision Universe®"; viewAssistant(main, route); }
    else if (route.view === "templates") { var tt = route.id && TPL.get(route.id); doc.title = (tt ? tt.title + " · " : "") + "Vorlagen · Technical · Vision Universe®"; viewTemplates(main, route); }
    else put(main, stateBox("Seite nicht gefunden", "Diese Adresse kennt Technical nicht.", el("a", { class: "tc-link", href: "#/", text: "Zur Technical-Startseite" })));
    if (route.view !== "academy" && global.VUAcademy) global.VUAcademy.renderReturn(main);
    main.setAttribute("aria-busy", "false");
    var last = lastTicker();
    if (global.VUNavigation) global.VUNavigation.dock(last ? { hrefs: { chart: "/technical/" + M.chartHref(last) } } : {});
  }
  var lastView = null;
  function onHash() {
    var r = M.parseRoute(location.hash), key = r.view + "|" + (r.ticker || "") + "|" + (r.id || "") + "|" + (r.tab || "") + "|" + (r.params && r.params.reiter || "");
    render();
    if (key !== lastView) global.scrollTo(0, 0);
    lastView = key;
  }
  if (global.VUUI.bindIntent) global.VUUI.bindIntent(function (url) { if (url.origin !== location.origin || url.pathname !== "/technical/") return null; var r = M.parseRoute(url.hash); return r.view === "chart" ? r.ticker : null; }, loadInstrument);
  /* Weiterleitungen (Entscheidung 8) vor dem Seitenübergang: sonst bricht der laufende Übergang ab. */
  function redirectOf(hash) { var r = M.parseRoute(hash); return (r.view === "academy" || r.view === "assistant") && !r.id ? "#/lernen" : null; }
  var redirected = false;
  global.addEventListener("hashchange", function () {
    var to = redirectOf(location.hash);
    if (to) { redirected = true; location.replace(to); return; }
    /* Das Ziel einer Weiterleitung erscheint ohne Übergang (ein sofortiger Seitenwechsel bräche ihn sonst ab). */
    if (redirected) { redirected = false; return onHash(); }
    return global.VUUI.transition ? global.VUUI.transition(onHash) : onHash();
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", onHash); else onHash();
  global.VUTechnicalApp = { render: render };
})(window);
