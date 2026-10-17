/* =========================================================================
   VISION UNIVERSE — assets/stock-navigator.js        Aktien-Navigator (VU3)

   Eine Zeile unter dem Kopf jeder Aktien-Detailseite: dieselbe Aktie in
   Discover, Quant, Technik, Elliott, Supertrader und (in Planung)
   Fundamental. Ergaenzung, kein Ersatz: Hauptmenue, Produkt-Untermenues
   und Dock bleiben unberuehrt; die Kacheln nutzen die Produkt-Icons aus
   /assets/product-icons.svg.

   Identitaet, Adressen und Verfuegbarkeit kommen aus
   core/stock-context.js (VUCore.StockContext). Verfuegbar heisst belegt
   (Manifest-Ausschnitt aus dem Release-Bau); ohne Beleg bleibt eine
   Kachel neutral ("unknown": Link ohne Haken). Nicht abgedeckte Module
   sind ausgegraut und erklaeren sich auf Tippen, statt ins Leere zu
   fuehren. Fundamental steht als "In Planung".

   Braucht vorher /core/identity.js und /core/stock-context.js.
   Browser: globalThis.VUStockNavigator; Node (Tests): module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var SC = typeof module === "object" && module.exports ? require("../core/stock-context.js") : root.VUCore && root.VUCore.StockContext;
  var api = factory(SC, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUStockNavigator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (SC, root) {
  "use strict";

  var VERSION = "stock-navigator-1.0.0";
  var SPRITE = "/assets/product-icons.svg#";
  /* Reihenfolge = StockContext.PRODUCTS. icon: Symbol im Sprite (Technik heisst dort "technical"). */
  var MODULES = {
    discover: { label: "Discover", icon: "discover", why: "Anlass, Kurs und Unternehmen im Überblick" },
    quant: { label: "Quant", icon: "quant", why: "Eigenschaften, Setup und Belege" },
    technik: { label: "Technik", icon: "technical", why: "Kursstruktur, Marken und Chartbild" },
    elliott: { label: "Elliott", icon: "elliott", why: "Wellenzählung mit Gegenszenario" },
    supertrader: { label: "Super­trader", plain: "Supertrader", icon: "supertrader", why: "Regelcheck je Strategie" },
    fundamental: { label: "Funda­mental", plain: "Fundamental", icon: "fundamental", why: "Wachstum, Profitabilität, Bilanz, Bewertung" }
  };
  var STATE_TEXT = { available: "verfügbar", unavailable: "keine Abdeckung", planned: "In Planung", unknown: "" };
  var TICK = { available: "✓", unavailable: "–", planned: "…", unknown: "" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function reason(m, st, sym) {
    var name = m.plain || m.label;
    if (st.state === "planned") return name + ": Diese Welt ist in Planung und noch nicht verfügbar.";
    if (st.reason === "REGION_NOT_COVERED") return name + ": " + sym + " ist ein europäisches Listing – " + name + " analysiert derzeit nur US-Aktien.";
    return name + ": Für " + sym + " liegt hier keine Abdeckung vor.";
  }

  function icon(id) {
    return '<span class="vu-product-icon vu-snav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="' + SPRITE + esc(id) + '"/></svg></span>';
  }

  /** Kachel (Zeile) oder Karte (Panel). Deaktiviert = kein href: ein Tippen erklaert, statt zu navigieren. */
  function item(st, ctx, current, card) {
    var m = MODULES[st.product], sym = ctx.displaySymbol;
    var cur = st.product === current, off = !cur && (st.state === "unavailable" || st.state === "planned" || !st.href);
    var attrs = off
      ? ' role="link" aria-disabled="true" tabindex="0" data-reason="' + esc(reason(m, st, sym)) + '"'
      : ' href="' + esc(st.href) + '"';
    if (cur) attrs += ' aria-current="page"';
    attrs += ' data-module="' + esc(st.product) + '" data-state="' + esc(st.state) + '"';
    var stText = STATE_TEXT[st.state] || "";
    var sr = '<span class="vu-snav-sr"> – ' + esc(cur ? "aktuelle Ansicht" : stText || "Abdeckung nicht bestätigt") + "</span>";
    if (card) {
      return '<a class="vu-snav-card"' + attrs + ">" + icon(m.icon) + "<span><b>" + m.label + "</b><small>" + esc(m.why) + "</small>" +
        (stText ? '<span class="vu-snav-st">' + esc(stText) + "</span>" : "") + sr + "</span></a>";
    }
    return '<a class="vu-snav-chip"' + attrs + ' title="' + esc((m.plain || m.label) + (stText ? " · " + stText : "")) + '">' + icon(m.icon) +
      '<i class="vu-snav-tick" data-s="' + esc(st.state) + '" aria-hidden="true">' + (TICK[st.state] || "") + "</i><span>" + m.label + "</span>" + sr + "</a>";
  }

  /** HTML des Navigators. states: StockContext.availability(ctx, manifest). */
  function html(ctx, states, current, panelId) {
    var id = esc(panelId || "vu-snav-panel");
    return '<div class="vu-snav-row"><p class="vu-snav-eyebrow" aria-hidden="true">Analysewelten</p><ul class="vu-snav-list">' +
      states.map(function (st) { return "<li>" + item(st, ctx, current) + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="vu-snav-more" aria-expanded="false" aria-controls="' + id + '" aria-label="Alle Analysewelten mit Erklärung">Alle' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
      '<div class="vu-snav-panel" id="' + id + '" hidden>' + states.map(function (st) { return item(st, ctx, current, true); }).join("") + "</div>" +
      '<p class="vu-snav-note" role="status" aria-live="polite"></p>';
  }

  var shardCache = {};
  function loadShard(ctx, fetchImpl) {
    var url = SC.availabilityUrl(ctx), f = fetchImpl || (root.fetch && root.fetch.bind(root));
    if (!f) return Promise.resolve(null);
    if (!shardCache[url]) {
      /* 404 (keine belegte Aktie in diesem Ausschnitt) oder Netzfehler: kein Beleg -> neutral. */
      shardCache[url] = f(url).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
      shardCache[url].then(function (v) { if (!v) delete shardCache[url]; });
    }
    return shardCache[url];
  }

  function bind(nav) {
    var btn = nav.querySelector(".vu-snav-more"), panel = nav.querySelector(".vu-snav-panel"), note = nav.querySelector(".vu-snav-note");
    btn.addEventListener("click", function () { var open = panel.hidden; panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
    function explain(e) { var t = e.target.closest && e.target.closest("[data-reason]"); if (!t) return false; e.preventDefault(); note.textContent = t.getAttribute("data-reason"); return true; }
    nav.addEventListener("click", explain);
    nav.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") explain(e); });
  }

  var seq = 0;
  /**
   * Navigator in host zeichnen. ctx: StockContext-Kontext, current: Produkt-ID der Seite.
   * Zeichnet sofort neutral und ersetzt den Inhalt, sobald der Manifest-Ausschnitt da ist.
   * @returns {function} dispose
   */
  function mount(host, ctx, current, opts) {
    if (!host || !ctx) return function () {};
    var o = opts || {}, alive = true, panelId = "vu-snav-panel-" + (++seq);
    var nav = host.ownerDocument.createElement("nav");
    nav.className = "vu-snav";
    nav.setAttribute("aria-label", "Analysewelten für " + ctx.displaySymbol);
    nav.setAttribute("data-key", SC.key(ctx));
    function draw(manifest) {
      nav.innerHTML = html(ctx, SC.availability(ctx, manifest), current, panelId);
      bind(nav);
    }
    draw(null);
    host.replaceChildren(nav);
    loadShard(ctx, o.fetch).then(function (manifest) { if (alive && manifest) draw(manifest); });
    return function () { alive = false; if (nav.parentNode) nav.parentNode.removeChild(nav); };
  }

  return Object.freeze({ VERSION: VERSION, MODULES: MODULES, html: html, mount: mount, loadShard: loadShard });
});
