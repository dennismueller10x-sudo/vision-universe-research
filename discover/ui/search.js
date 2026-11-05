/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/search.js

   Die Suche als Flaeche (Redesign 2027, Folie D06).

   Leer: zuletzt gesucht (nur auf diesem Geraet), bekannte Namen, Themen
   und drei Fragen an Atlas. Beim Tippen: Treffer nach Gruppen (Aktien,
   Themen, Strategien), der erste Treffer hervorgehoben, die getippten
   Buchstaben neongruen markiert, und die Eingabe als Frage an Atlas.
   Pfeiltasten waehlen, Enter oeffnet den ersten oder gewaehlten Treffer,
   Escape schliesst.

   Die Suche liest den gemeinsamen kanonischen Aktienindex; regionale
   Ansichten verändern weder die Suche noch die Identität der Treffer.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;
  var RECENT_KEY = "vu-discover-recent-search-v1";
  var KNOWN = ["NVDA", "AAPL", "TSLA", "MSFT"];
  var THEMES = ["kuenstliche-intelligenz", "kernenergie-uran", "raumfahrt", "cybersecurity"];
  var QUESTIONS = ["Was heißt KGV?", "Welche Aktien stehen auf dem Jahreshoch?", "Was macht ein Marktbarometer?"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function U() { return global.VUUI; }
  function V() { return (D.Views || {}); }
  function svgIcon(name, size) {
    var t = document.createElement("template");
    t.innerHTML = U() ? U().glyph(name, size || 18) : "";
    return t.content.firstChild || document.createTextNode("");
  }

  function recent() {
    try { var x = JSON.parse(global.localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(x) ? x.filter(function (r) { return r && r.n && /^#\//.test(r.href || ""); }).slice(0, 6) : []; }
    catch (_) { return []; }
  }
  function remember(entry) {
    try {
      var list = recent().filter(function (r) { return r.href !== entry.href; });
      list.unshift({ n: entry.n, href: entry.href });
      global.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
    } catch (_) { /* ohne Speicher keine Liste */ }
  }
  function forget() { try { global.localStorage.removeItem(RECENT_KEY); } catch (_) {} }

  /** Text mit markierten Suchbuchstaben (nur Textknoten, kein Markup aus Daten). */
  function marked(text, q) {
    var span = el("span"), t = String(text || ""), i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) { span.textContent = t; return span; }
    span.append(document.createTextNode(t.slice(0, i)), el("mark", { text: t.slice(i, i + q.length) }), document.createTextNode(t.slice(i + q.length)));
    return span;
  }
  function pill(r) {
    if (!isNum(r)) return el("span", { class: "val" });
    var box = el("span", { class: "val" }), t = document.createElement("template");
    t.innerHTML = U() ? U().chg(r * 100, { digits: 0 }) : "";
    box.append(t.content, el("small", { text: "12 Mon." }));
    return box;
  }
  function atlasHref(q) { return "/ask/" + (q ? "?q=" + encodeURIComponent(q) : ""); }

  function create(options) {
    options = options || {};
    var aktiv = -1;
    var treffer = [];

    var input = el("input", { type: "search", placeholder: "Aktie, Thema, Frage",
                              "aria-label": "Aktien suchen", autocomplete: "off",
                              spellcheck: "false", enterkeyhint: "search" });
    var atlas = el("a", { class: "dx-search-atlas", href: atlasHref(""), "aria-label": "Als Frage an Atlas senden" }, [svgIcon("spark", 18)]);
    var results = el("div", { class: "dx-results", role: "listbox", "aria-label": "Suchergebnisse" });
    var extra = el("div", { class: "dx-search-extra" });
    var empty = el("div", { class: "dx-search-empty" });
    var hint = el("p", { class: "dx-hint dx-search-hint" });
    var close = el("button", { class: "dx-search-close", type: "button", text: "Abbrechen" });

    var overlay = el("div", { class: "dx-search vu-ui", role: "dialog", "aria-modal": "true",
                              "aria-label": "Aktien suchen" }, [
      el("div", { class: "dx-search-inner" }, [
        el("h2", { class: "dx-sr", text: "Suchen" }),
        el("div", { class: "dx-search-row" }, [el("label", { class: "dx-search-field" }, [svgIcon("search", 18), input, atlas]), close]),
        empty,
        el("p", { class: "vu-ltag dx-search-group", hidden: true }),
        results,
        extra,
        hint
      ])
    ]);
    var group = overlay.querySelector(".dx-search-group");

    function section(title, right) {
      var head = el("div", { class: "vu-sect" }, [el("h2", { text: title })]);
      if (right) head.append(right);
      return head;
    }
    function logo(symbol) {
      var t = document.createElement("template");
      t.innerHTML = U() ? U().logo(symbol) : "";
      return t.content.firstChild || el("span");
    }
    function leer() {
      S.clear(empty); empty.hidden = false; group.hidden = true; S.clear(extra);
      hint.textContent = "";
      var last = recent();
      if (last.length) {
        var del = el("button", { type: "button", class: "dx-search-link", text: "Löschen" });
        del.onclick = function () { forget(); leer(); };
        empty.append(section("Zuletzt gesucht", del), el("div", { class: "dx-chipwrap" }, last.map(function (r) {
          var a = el("a", { class: "vu-chip", href: r.href }, [svgIcon("search", 15), document.createTextNode(r.n)]);
          a.onclick = function () { schliessen(); };
          return a;
        })));
      }
      var known = el("div", { class: "dx-search-known" });
      empty.append(section("Bekannte Namen"), known);
      if (D.GlobalUniverse) Promise.all(KNOWN.map(function (s) { return D.GlobalUniverse.search(s).then(function (x) { return (x.entries || []).filter(function (e) { return e.s === s; })[0] || null; }).catch(function () { return null; }); }))
        .then(function (hits) {
          hits.filter(Boolean).forEach(function (hit) {
            var a = el("a", { class: "vu-lrow vu-lrow--nochart dx-known", href: hit.href }, [logo(hit.s), el("div", { class: "vu-lrow__name" }, [el("b", { text: hit.n }), el("span", { text: hit.a || hit.s })]), pill(hit.r)]);
            a.onclick = function () { remember(hit); schliessen(); };
            known.append(a);
          });
        });
      var T = V().Themes;
      if (T) empty.append(section("Themen"), el("div", { class: "dx-chipwrap" }, THEMES.map(T.bySlug).filter(Boolean).map(function (t) {
        var a = el("a", { class: "vu-chip", href: T.href(t) }, [svgIcon("grid", 15), document.createTextNode(t.title)]);
        a.onclick = function () { schliessen(); };
        return a;
      })));
      empty.append(section("Frag Atlas"), el("div", { class: "dx-ask" }, QUESTIONS.map(function (q) {
        return el("a", { class: "vu-navcard dx-ask-q", href: atlasHref(q) }, [el("span", { class: "dx-ask-ic", "aria-hidden": "true" }, [svgIcon("spark", 16)]), el("span", { class: "vu-navcard__text" }, [el("b", { text: q })]), svgIcon("next", 16)]);
      })));
    }

    var sequence = 0;
    function suchen() {
      var q = input.value.trim(), token = ++sequence;
      aktiv = -1;
      atlas.setAttribute("href", atlasHref(q));
      if (!q) { S.clear(results); treffer = []; leer(); return; }
      empty.hidden = true;
      D.GlobalUniverse.search(q).then(function (index) {
        if (token !== sequence || input.value.trim() !== q) return;
        treffer = index.entries;
        zeichnen(index, q);
      }).catch(function () {
        if (token !== sequence) return;
        S.clear(results); treffer = []; S.clear(extra); group.hidden = true;
        hint.textContent = "Die Suche ist derzeit nicht verfügbar.";
      });
    }

    function zeichnen(index, q) {
      S.clear(results); S.clear(extra);
      group.hidden = !treffer.length;
      group.textContent = "Aktien · " + treffer.length + " Treffer";
      hint.textContent = treffer.length ? "Tipp: Suche nach Name, Kürzel (NVDA) oder Thema. Enter öffnet den ersten Treffer."
        : "Kein Titel in »" + index.universeLabel + "« passt zu „" + input.value + "“.";
      treffer.forEach(function (hit, i) {
        var sym = hit.displaySymbol || hit.s;
        var knopf = el("button", { class: "dx-result" + (i === 0 ? " is-first" : ""), type: "button", role: "option",
                                   "aria-selected": "false", "data-world": hit.w || null }, [
          logo(hit.region === "EUROPE" ? (hit.logoKey || sym) : hit.s),
          el("span", { class: "nm" }, [marked(hit.n || hit.s, q),
            el("em", {}, [marked(sym, q), document.createTextNode([hit.a || hit.sec, hit.m ? null : "Modelltitel", hit.h ? "am Jahreshoch" : null].filter(Boolean).map(function (x) { return " · " + x; }).join(""))])]),
          pill(hit.r)
        ]);
        knopf.addEventListener("click", function () { oeffnen(i); });
        knopf.addEventListener("mousemove", function () { markieren(i); });
        results.appendChild(knopf);
      });
      /* Themen und Strategien: dieselbe Eingabe gegen Titel und Kurzbeschreibung. */
      var lq = q.toLowerCase(), T = V().Themes;
      var themes = T ? T.all.filter(function (t) { return (t.title + " " + t.short + " " + t.line).toLowerCase().indexOf(lq) >= 0; }).slice(0, 4) : [];
      var meta = global.VUDiscoverMeta, u = meta && (meta.rows || []).filter(function (r) { return r.universeId === "US_REAL"; })[0];
      var rows = u ? u.rows.filter(function (r) { return r.returned > 0 && !(T && T.byRow(r.rowId)); }) : [];
      var strategies = rows.filter(function (r) { return ((D.V3 ? D.V3.rowTitle(r) : r.title) + " " + (r.subtitle || "")).toLowerCase().indexOf(lq) >= 0; }).slice(0, 3);
      function links(title, list, href, label, sub) {
        if (!list.length) return;
        extra.append(el("p", { class: "vu-ltag dx-search-group", text: title }), el("div", { class: "dx-links" }, list.map(function (x) {
          var a = el("a", { class: "dx-link", href: href(x) }, [el("span", { class: "nm" }, [marked(label(x), q), el("em", { text: sub(x) })]), svgIcon("next", 16)]);
          a.onclick = function () { remember({ n: label(x), href: href(x) }); schliessen(); };
          return a;
        })));
      }
      links("Themen", themes, function (t) { return T.href(t); }, function (t) { return t.title; }, function (t) { return t.short + " · " + t.line; });
      links("Strategien", strategies, function (r) { return "#/strategien/" + r.rowId; }, function (r) { return D.V3 ? D.V3.rowTitle(r) : r.title; }, function (r) { return (r.matched ? r.matched + " Treffer · " : "") + String(r.subtitle || "").split(" — ")[0]; });
      extra.append(el("p", { class: "vu-ltag dx-search-group", text: "Frag Atlas" }),
        el("a", { class: "vu-navcard dx-ask-q", href: atlasHref(q) }, [el("span", { class: "dx-ask-ic", "aria-hidden": "true" }, [svgIcon("spark", 16)]), el("span", { class: "vu-navcard__text" }, [el("b", { text: "„" + q + "“ als Frage an Atlas senden" })]), svgIcon("next", 16)]));
    }

    function markieren(i) {
      aktiv = i;
      Array.prototype.forEach.call(results.children, function (node, index) {
        node.setAttribute("aria-selected", String(index === aktiv));
      });
    }

    function oeffnen(i) {
      var hit = treffer[i === undefined || i < 0 ? 0 : i];
      if (!hit) return;
      remember(hit);
      schliessen();
      location.hash = hit.href;
    }

    function oeffnenOverlay() {
      overlay.classList.add("on");
      document.body.classList.add("dx-suche-offen");
      document.body.style.overflow = "hidden";
      input.value = "";
      S.clear(results);
      treffer = [];
      leer();
      global.setTimeout(function () { input.focus(); }, 60);
      /* Gemeinsamer Index (USA + Europa) und Europa-Freigabe schon beim Oeffnen anstossen - bis zur ersten Eingabe laufen sie. */
      if (D.GlobalUniverse && D.GlobalUniverse.warm) D.GlobalUniverse.warm();
    }

    function schliessen() {
      sequence++;
      overlay.classList.remove("on");
      document.body.classList.remove("dx-suche-offen");
      document.body.style.overflow = "";
    }

    input.addEventListener("input", suchen);
    close.addEventListener("click", schliessen);
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) schliessen();
    });
    overlay.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); schliessen(); return; }
      if (event.key === "ArrowDown") { event.preventDefault(); markieren(Math.min(treffer.length - 1, aktiv + 1)); }
      else if (event.key === "ArrowUp") { event.preventDefault(); markieren(Math.max(0, aktiv - 1)); }
      else if (event.key === "Enter" && (event.target === input || event.target.classList.contains("dx-result"))) { event.preventDefault(); oeffnen(aktiv); }
      var gewaehlt = results.children[aktiv];
      if (gewaehlt && gewaehlt.scrollIntoView) gewaehlt.scrollIntoView({ block: "nearest" });
    });

    /* Tastaturzugang von ueberall. "/" ist die Konvention fuer Suche; sie
       darf nur nicht zuschlagen, waehrend jemand in ein Feld tippt. */
    document.addEventListener("keydown", function (event) {
      var imFeld = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || "");
      if (event.key === "/" && !imFeld && !overlay.classList.contains("on")) {
        event.preventDefault();
        oeffnenOverlay();
      }
    });

    return { node: overlay, open: oeffnenOverlay, close: schliessen };
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Search = { create: create };
})(window);
