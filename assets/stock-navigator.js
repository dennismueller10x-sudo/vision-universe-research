/* =========================================================================
   VISION UNIVERSE — assets/stock-navigator.js        Aktien-Navigator (VU3)

   Eine Zeile unter dem Kopf jeder Aktien-Detailseite: dieselbe Aktie in
   Discover, Quant, Technik, Elliott, Supertrader, Fundamental und
   Hedgefonds. Dazu der einheitliche Aktienkopf (head): Logo, Name,
   Kuerzel und Boerse, ein eindeutig beschrifteter Kurs, darunter der
   Navigator - auf jeder Aktienseite gleich (VU3 UI-Refresh). Ergaenzung, kein Ersatz: Hauptmenue, Produkt-Untermenues
   und Dock bleiben unberuehrt; die Kacheln nutzen die Produkt-Icons aus
   /assets/product-icons.svg.

   Identitaet, Adressen und Verfuegbarkeit kommen aus
   core/stock-context.js (VUCore.StockContext). Verfuegbar heisst belegt
   (Manifest-Ausschnitt aus dem Release-Bau); ohne Beleg bleibt eine
   Kachel neutral ("unknown": Link ohne Haken). Nicht abgedeckte Module
   sind ausgegraut und erklaeren sich auf Tippen, statt ins Leere zu
   fuehren.

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

  var VERSION = "stock-navigator-5.1.0";
  var SPRITE = "/assets/product-icons.svg#";
  /* Reihenfolge = StockContext.PRODUCTS. icon: Symbol im Sprite. "technik" ist das Chartbild (/elliott/#/<T>), "technical" die Produktwelt Technical. */
  var MODULES = {
    discover: { label: "Discover", icon: "discover", why: "Anlass, Kurs und Unternehmen im Überblick" },
    quant: { label: "Quant", icon: "quant", why: "Eigenschaften, Setup und Belege" },
    technical: { label: "Tech­nical", plain: "Technical", icon: "technical", why: "Chartanalyse, Indikatoren und Formationen" },
    technik: { label: "Wellen", plain: "Elliott", icon: "elliott", why: "Kursstruktur, Wellen und Szenario" },
    elliott: { label: "Elliott", icon: "elliott", why: "Wellenzählung mit Gegenszenario" },
    supertrader: { label: "Super­trader", plain: "Supertrader", icon: "supertrader", why: "Regelcheck je Strategie" },
    fundamental: { label: "Funda­mental", plain: "Fundamental", icon: "fundamental", why: "Umsatz, Gewinn, Cashflow und Bilanz je Geschäftsjahr" },
    hedgefonds: { label: "Hedge­fonds", plain: "Hedgefonds", icon: "hedgefonds", why: "Welche Fonds die Aktie halten, kaufen und verkaufen" }
  };
  /* Redesign 11/2026 (Mockup N4/N5, Baustein C05): Perspektiven statt Produktnamen, eine wischbare Zeile.
     Reihenfolge wie im Mockup; jede Perspektive gehoert zu genau einer Welt. */
  var PERSPECTIVE = { discover: "Überblick", technical: "Chart", fundamental: "Zahlen", quant: "Faktoren", supertrader: "Methoden", elliott: "Wellen", technik: "Wellen", hedgefonds: "Investoren" };
  /* Redesign 2027 (N5): sieben Perspektiven. „Wellen“ ist das Bild unter /elliott/#/<T> (Modul technik); die
     Profi-Ansicht desselben Bildes (Modul elliott, ?ansicht=profi) ist keine eigene Perspektive mehr. */
  var ORDER = ["discover", "technical", "fundamental", "quant", "supertrader", "technik", "hedgefonds"];
  function ordered(states) { return states.filter(function (s) { return ORDER.indexOf(s.product) >= 0; }).sort(function (a, b) { return ORDER.indexOf(a.product) - ORDER.indexOf(b.product); }); }
  function perspectiveOf(current) { return current === "elliott" ? "technik" : current; }
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
    return '<a class="vu-snav-chip"' + attrs + ' title="' + esc((m.plain || m.label) + (stText ? " · " + stText : "")) + '">' +
      '<svg class="vu-snav-glyph" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><use href="' + SPRITE + esc(m.icon) + '"/></svg><span>' + esc(PERSPECTIVE[st.product] || m.plain || m.label) + "</span>" +
      '<span class="vu-snav-sr"> (' + esc(m.plain || m.label) + ")</span>" + sr + "</a>";
  }

  /** HTML des Navigators. states: StockContext.availability(ctx, manifest). */
  function html(ctx, states, current, panelId) {
    void panelId;
    var cur = perspectiveOf(current);
    return '<ul class="vu-snav-list">' + ordered(states).map(function (st) { return "<li>" + item(st, ctx, cur) + "</li>"; }).join("") + "</ul>" +
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
    var note = nav.querySelector(".vu-snav-note"), cur = nav.querySelector("[aria-current=page]"), list = nav.querySelector(".vu-snav-list");
    /* Die aktuelle Perspektive steht sichtbar am Anfang der Zeile (seitlich wischbar). */
    var reveal = function () { if (cur && list && list.scrollWidth > list.clientWidth) list.scrollLeft = Math.max(0, cur.parentNode.offsetLeft - 40); };
    if (root.requestAnimationFrame) root.requestAnimationFrame(reveal); else reveal();
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
    nav.setAttribute("aria-label", "Perspektiven für " + ctx.displaySymbol);
    nav.setAttribute("data-key", SC.key(ctx));
    function draw(manifest) {
      var markup = html(ctx, SC.availability(ctx, manifest), current, panelId);
      if (nav.firstChild) {
        // Availability changes attributes and explanatory text, not the seven
        // product icons. Keep their connected nodes, focus and loaded sprite.
        var next = host.ownerDocument.createElement("div");
        next.innerHTML = markup.replace(/<svg[\s\S]*?<\/svg>/g, "");
        var oldLinks = nav.querySelectorAll("[data-module]"), newLinks = next.querySelectorAll("[data-module]");
        if (oldLinks.length === newLinks.length && Array.prototype.every.call(oldLinks, function (link, i) { return link.getAttribute("data-module") === newLinks[i].getAttribute("data-module"); })) {
          Array.prototype.forEach.call(oldLinks, function (link, i) {
            var fresh = newLinks[i];
            Array.prototype.slice.call(link.attributes).forEach(function (a) { if (!fresh.hasAttribute(a.name)) link.removeAttribute(a.name); });
            Array.prototype.forEach.call(fresh.attributes, function (a) { link.setAttribute(a.name, a.value); });
            var oldText = link.querySelectorAll(".vu-snav-sr"), newText = fresh.querySelectorAll(".vu-snav-sr");
            Array.prototype.forEach.call(oldText, function (node, j) { if (newText[j]) node.textContent = newText[j].textContent; });
          });
          return;
        }
      }
      nav.innerHTML = markup;
      bind(nav);
    }
    draw(null);
    host.replaceChildren(nav);
    loadShard(ctx, o.fetch).then(function (manifest) { if (alive && manifest) draw(manifest); });
    return function () { alive = false; if (nav.parentNode) nav.parentNode.removeChild(nav); };
  }

  /* ------------------------------------------------------------ Aktienkopf
     Klickentwurf „Modul-Aktienseiten“ (Owner 17.11.2026): Zurück-Pfeil zur Aktienseite + Modul-Etikett, großes Logo,
     Kurzname als Überschrift, darunter der Rest des Namens · Kürzel · Börse, Herz bzw. die Knöpfe der Seite, großer Kurs
     mit Pille zum Vortag, darunter die Schlusskurs-Zeile. Keine Reiterleiste mehr: am Seitenende steht
     „Diese Aktie in anderen Modulen“ (others) – nur Module mit Nachweis, dazu die Pille „Aktienseite“. */
  var KIND = { live: "Live", delayed: "Verzögert", close: "Schlusskurs", intraday: "Letzter Kurs" };
  function num(v, d) { return Number(v).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  var CUR = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF" };
  /** Kurs als Text: 197,61 $ (Waehrungszeichen wie in Discover nachgestellt). */
  function money(v, cur) { var c = CUR[cur] || cur || ""; return num(v, Math.abs(v) >= 1000 ? 0 : 2) + (c ? " " + c : ""); }
  /** Kursblock: großer Wert mit Pille zum Vortag, darunter Art, Zeitbezug und Bezug der Pille („Schlusskurs 13.11.2026 · zum Vortag“).
   *  Ohne Wert kein Block (keine erfundene Zahl). Klassen bleiben (vu-shead-value/-change/-when/-alt): Seiten lesen und ersetzen sie. */
  function priceHtml(p) {
    if (!p || typeof p.value !== "number" || !isFinite(p.value)) return "";
    var ch = typeof p.changePct === "number" && isFinite(p.changePct) ? p.changePct : null;
    var dir = ch == null ? "flat" : ch > 0 ? "up" : ch < 0 ? "down" : "flat";
    var arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "◆";
    var when = [[KIND[p.kind] || p.kind || "", p.at || ""].filter(Boolean).join(" "), ch == null ? "" : p.changeLabel || ""].filter(Boolean).join(" · ");
    return '<div class="vu-shead-price" data-direction="' + dir + '"><div class="vu-shead-row"><b class="vu-shead-value">' + esc(money(p.value, p.currency)) + "</b>" +
      (ch == null ? "" : '<span role="img" aria-label="' + esc((ch > 0 ? "Plus " : ch < 0 ? "Minus " : "Unverändert ") + num(Math.abs(ch), 2) + " Prozent" + (p.changeLabel ? " " + p.changeLabel : "")) + '" class="vu-shead-change">' + arrow + " " + esc((ch > 0 ? "+" : "") + num(ch, 2).replace("-", "−")) + " %</span>") + "</div>" +
      (when || p.alt ? '<p class="vu-shead-when">' + (p.kind === "live" ? '<i class="vu-shead-live" aria-hidden="true"></i>' : "") + esc(when) +
        /* p.alt: derselbe Kurs in einer zweiten Waehrung, klein (Quant: Dollar gross, Euro daneben; Konzept Quant 2026-11). */
        (p.alt ? '<span class="vu-shead-alt">≈ ' + esc(p.alt) + "</span>" : "") + "</p>" : "") + "</div>";
  }
  function logoHtml(o) {
    var t = esc(o.ctx.displaySymbol), mono = esc((o.name || o.ctx.displaySymbol || "?").replace(/[^A-Za-z0-9ÄÖÜäöü]/g, "").slice(0, 1).toUpperCase());
    void t;
    var src = o.logo === false ? null : o.logo || (o.ctx.region === "US" ? "/discover/logos/files/" + encodeURIComponent(o.ctx.ticker) + ".png" : null);
    return '<span class="vu-shead-logo" data-mono="' + mono + '">' + (src ? '<img src="' + esc(src) + '" alt="" width="76" height="76" loading="lazy" decoding="async">' : "") + "</span>";
  }
  /** Anzeigename aus dem Manifest-Ausschnitt. Der Ausschnitt fuehrt US-Namen unter dem Kuerzel (wie seine Modullisten),
   *  nicht unter dem Kontext-Schluessel (US:ref_<T>); Europa traegt noch keine Namen. */
  function shardName(ctx, m) {
    return ctx && ctx.region === "US" && m && m.names && typeof m.names[ctx.ticker] === "string" ? m.names[ctx.ticker] : null;
  }

  /* Kurzname der Überschrift (nur Darstellung): Rechtsform, Aktiengattung und allgemeine Zusätze am Ende fallen weg,
     solange ein Wort bleibt („Take-Two Interactive Software Inc“ → „Take-Two“, „Meta Platforms Class A“ → „Meta“).
     Der volle Name steht darunter. */
  var LEGAL = /,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|Limited|plc|PLC|N\.V\.|S\.A\.|SE|AG|LP|L\.P\.|Holdings?|Group|Class [A-Z]|Cl [A-Z]|Ordinary Shares?|Common Stock|ADR|\(The\)|The)$/i;
  var GENERIC = /\s+(Interactive|Software|Technologies|Technology|Platforms|Systems|International|Enterprises|Industries)$/i;
  function shortName(name) {
    var s = String(name || "").replace(/\s+/g, " ").trim(), prev;
    do { prev = s; s = s.replace(LEGAL, "").trim(); } while (s !== prev && s);
    do { prev = s; if (s.indexOf(" ") > 0) s = s.replace(GENERIC, "").trim(); } while (s !== prev && s.indexOf(" ") > 0);
    return s || String(name || "").trim();
  }
  /** Zeile unter der Überschrift: der Rest des vollen Namens (ohne Rechtsform) · Kürzel · Börse. */
  function subLine(full, short, ticker, exchange) {
    var f = String(full || "").replace(/\s+/g, " ").trim(), prev;
    do { prev = f; f = f.replace(LEGAL, "").trim(); } while (f !== prev && f);
    var rest = f && f !== short ? (f.indexOf(short + " ") === 0 ? f.slice(short.length + 1) : f) : "";
    return [rest, ticker, exchange].filter(Boolean);
  }

  /* Merken (Herz): dieselbe lokale Liste wie Discover und die Aktien-Vorschau (assets/vu-stock-sheet.js#watchStore),
     angemeldet über assets/watchlist-button.js#couple an die Konto-Watchlist gekoppelt. Nur, wenn die Seite keine eigenen
     Knöpfe mitgibt (o.actions). */
  var WATCH_KEY = "vu-discover-watchlist-v1";
  function localList() { try { var a = JSON.parse(root.localStorage.getItem(WATCH_KEY) || "[]"); return Array.isArray(a) ? a.filter(function (s) { return /^[A-Z0-9.\-]{1,24}$/.test(s); }).slice(0, 100) : []; } catch (e) { return []; } }
  var localWatch = {
    has: function (t) { return localList().indexOf(t) >= 0; },
    toggle: function (t) { var l = localList(), i = l.indexOf(t); if (i < 0) l.unshift(t); else l.splice(i, 1); try { root.localStorage.setItem(WATCH_KEY, JSON.stringify(l)); } catch (e) { /* nur diese Sitzung */ } return i < 0; }
  };
  function watchStore() { var W = root.VUWatchButton; return W && W.couple ? W.couple(localWatch) : localWatch; }
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.4C1.4 8 3.6 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.4 0 5.6 3.5 4.3 7.1C19.5 16.4 12 21 12 21z"/></svg>';
  function heart(doc, t) {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "vu-shead-heart"; b.innerHTML = HEART;
    var paint = function () { var on = watchStore().has(t); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", t + (on ? " von der Watchlist entfernen" : " auf die Watchlist")); };
    b.addEventListener("click", function () { watchStore().toggle(t); paint(); });
    paint();
    if (root.addEventListener) ["vu-watchlist-ready", "vu-watchlist-change"].forEach(function (e) { root.addEventListener(e, function () { if (b.isConnected) paint(); }); });
    return b;
  }

  /* ------------------------------------------- Diese Aktie in anderen Modulen
     Pillen am Seitenende, Reihenfolge wie im Klickentwurf. „Elliott“ ist das Bild unter /elliott/#/<T> (Modul technik).
     Nur Module mit Nachweis im Verfuegbarkeits-Ausschnitt (state "available"); ohne Ausschnitt nur „Aktienseite“. */
  var OTHERS = ["discover", "quant", "technical", "fundamental", "hedgefonds", "technik", "supertrader"];
  function aktieHref(ctx) { return ctx.region === "US" ? "/aktie/#/" + encodeURIComponent(ctx.ticker) : SC.href(ctx, "discover"); }
  var HOME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>';
  function othersHtml(ctx, states, current, name) {
    var cur = perspectiveOf(current), by = {}, nm = shortName(name || ctx.name || ctx.displaySymbol || "");
    (states || []).forEach(function (s) { by[s.product] = s; });
    var pills = OTHERS.filter(function (p) { return p !== cur && by[p] && by[p].state === "available" && by[p].href; }).map(function (p) {
      var m = MODULES[p];
      return '<a class="vu-sothers-pill" href="' + esc(by[p].href) + '" data-module="' + esc(p) + '"><span class="vu-sothers-hud"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="' + SPRITE + esc(m.icon) + '"/></svg></span>' + esc(m.plain || m.label) + "</a>";
    });
    /* Owner 18.11.2026: „Übersicht“ (die Aktienzentrale /aktie/#/<T>) steht als erste Pille; am Ende eine Karte zurück dorthin. */
    pills.unshift('<a class="vu-sothers-pill vu-sothers-pill--aktie" href="' + esc(aktieHref(ctx)) + '" data-module="aktie"><span class="vu-sothers-ic">' + HOME + "</span>Übersicht</a>");
    return '<h2 class="vu-sothers-h">Diese Aktie in anderen Modulen</h2><div class="vu-sothers-list">' + pills.join("") + "</div>" +
      '<a class="vu-sothers-back" href="' + esc(aktieHref(ctx)) + '" data-module="aktie"><span class="vu-sothers-back-ic">' + HOME + '</span><span class="vu-sothers-back-t"><b>Zurück zur ' + esc(nm) + "-Übersicht</b><span>alle Module auf einen Blick</span></span>" +
      '<svg class="vu-sothers-back-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></a>';
  }
  /**
   * Pillen „Diese Aktie in anderen Modulen“ in host zeichnen (sofort mit „Aktienseite“, nach dem Ausschnitt vollständig).
   * @returns {{el: Element, dispose: function}}
   */
  function others(host, ctx, current, opts) {
    if (!host || !ctx) return { el: null, dispose: function () {} };
    var o = opts || {}, alive = true, doc = host.ownerDocument, box = doc.createElement("nav");
    box.className = "vu-sothers"; box.setAttribute("aria-label", "Diese Aktie in anderen Modulen"); box.setAttribute("data-key", SC.key(ctx));
    box.innerHTML = othersHtml(ctx, [], current, o.name);
    host.appendChild(box);
    loadShard(ctx, o.fetch).then(function (m) { if (alive && m) box.innerHTML = othersHtml(ctx, SC.availability(ctx, m), current, shardName(ctx, m) || o.name); });
    return { el: box, dispose: function () { alive = false; if (box.parentNode) box.parentNode.removeChild(box); } };
  }

  /**
   * Einheitlicher Aktienkopf der Modul-Aktienseiten. o: {ctx, current, name, exchange, logo, price:{value,currency,changePct,changeLabel,kind,at},
   * actions: Node (ersetzt das Herz), others: false | Element (Ort der Pillen; Standard: Ende des umgebenden <main>, bleibt dort am Ende)}.
   * o.back wird nicht mehr gezeigt: der Zurück-Pfeil führt immer zur Aktienseite /aktie/#/<T>.
   * @returns {{setPrice:function, dispose:function, el:Element, others:{el:Element, place:function}}}
   */
  function head(host, o) {
    if (!host || !o || !o.ctx) return { setPrice: function () {}, setRange: function () {}, dispose: function () {}, el: null, others: { el: null, place: function () {} } };
    var doc = host.ownerDocument, wrap = doc.createElement("header"), ctx = o.ctx, m = MODULES[o.current] || null;
    var full = o.name || ctx.name || ctx.displaySymbol, short = shortName(full);
    wrap.className = "vu-shead vu-shead--k2" + (o.compact ? " vu-shead--compact" : "");
    /* Aktie der Seite für den Atlas-Knopf der Kopfzeile (assets/atlas-sheet.js). */
    wrap.setAttribute("data-vu-stock", o.ctx.displaySymbol || ""); wrap.setAttribute("data-vu-stock-name", full || o.ctx.displaySymbol || "");
    if (o.current) wrap.setAttribute("data-module", o.current);
    var meta = subLine(full, short, ctx.displaySymbol, o.exchange).map(esc).join(" · ");
    /* Owner 18.11.2026: Pfeil = zurück, woher ich kam (ohne Verlauf: Aktienzentrale); daneben die kleine grüne Schaltfläche
       „⌂ <Name> · Übersicht“, die immer in die Aktienzentrale /aktie/#/<T> führt, und klein, in welchem Modul man ist. */
    wrap.innerHTML = '<div class="vu-shead-top"><a class="vu-shead-back" href="' + esc(aktieHref(ctx)) + '" aria-label="Zurück"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
      '<a class="vu-shead-home" href="' + esc(aktieHref(ctx)) + '" aria-label="Zur Übersicht von ' + esc(short || ctx.displaySymbol) + '">' + HOME + '<span class="vu-shead-home-n">' + esc(short || ctx.displaySymbol) + "</span><span>&nbsp;· Übersicht</span></a>" +
      (m ? '<span class="vu-shead-mod">in <b>' + esc(m.plain || m.label) + "</b></span>" : "") + "</div>" +
      '<div class="vu-shead-id">' + logoHtml(o) + '<div class="vu-shead-names"><h1 class="vu-shead-name">' + esc(short || ctx.displaySymbol) + "</h1>" +
      '<p class="vu-shead-meta">' + meta + "</p></div>" + '<div class="vu-shead-actions"></div></div>' +
      '<div class="vu-shead-pricebox"' + (o.pendingPrice ? ' data-price-pending="true" aria-busy="true"' : "") + ">" + priceHtml(o.price) + "</div>";
    var back = wrap.querySelector(".vu-shead-back");
    back.addEventListener("click", function (e) {
      var ref = doc.referrer || "", same = false;
      try { same = !!ref && new URL(ref).origin === root.location.origin; } catch (err) { same = false; }
      if (same && root.history && root.history.length > 1) { e.preventDefault(); root.history.back(); }
    });
    var img = wrap.querySelector(".vu-shead-logo img");
    if (img) img.addEventListener("error", function () { img.remove(); });
    /* App-Konzept 2 (Owner 14.11.2026, „Logos nicht gequetscht“): Wortmarken (deutlich breiter als hoch) bekommen weniger Rand. */
    function wide() { if (img.naturalWidth > img.naturalHeight * 1.6) img.parentNode.setAttribute("data-wide", ""); }
    if (img) { if (img.complete && img.naturalWidth) wide(); else img.addEventListener("load", wide); }
    var acts = wrap.querySelector(".vu-shead-actions");
    if (o.actions) acts.appendChild(o.actions);
    else if (ctx.region === "US") acts.appendChild(heart(doc, ctx.ticker));
    host.replaceChildren(wrap);

    /* Pillen am Seitenende: in o.others, sonst am Ende des umgebenden <main>. Inhalt, den die Seite später anhängt,
       schiebt sie nicht nach oben (Beobachter hält sie am Ende); ersetzt die Seite ihren Inhalt, endet der Beobachter. */
    var oth = o.others === false ? { el: null, dispose: function () {} } : others(doc.createElement("div"), ctx, o.current, o), keeper = null, alive = true;
    function keepLast(main) {
      if (!root.MutationObserver || !main) return;
      keeper = new root.MutationObserver(function () {
        if (!alive || !oth.el.isConnected || !wrap.isConnected) { keeper.disconnect(); keeper = null; return; }
        if (oth.el.parentNode === main && main.lastElementChild !== oth.el) main.appendChild(oth.el);
      });
      keeper.observe(main, { childList: true });
    }
    function place(target, before) {
      if (!oth.el) return;
      if (keeper) { keeper.disconnect(); keeper = null; }
      if (target) target.insertBefore(oth.el, before || null);
    }
    if (oth.el) {
      if (o.others && o.others.appendChild) place(o.others);
      else {
        var tries = 0, settle = function () {
          if (!alive || oth.el.isConnected) return;
          var main = wrap.isConnected ? (wrap.closest("main") || doc.querySelector("main")) : null;
          if (main) { main.appendChild(oth.el); keepLast(main); return; }
          if (++tries < 40) (root.requestAnimationFrame || setTimeout)(settle);
        };
        if (typeof Promise === "function") Promise.resolve().then(settle); else settle();
      }
    }
    /* VU3-Finalisierung: ein Name je Aktie in allen Welten. Der Manifest-Ausschnitt traegt den Anzeigenamen des
       Security-Masters (company-names.json#displayName, derselbe Name wie in Discover); er ersetzt den Namen der Welt. */
    loadShard(ctx, o.fetch).then(function (mf) {
      var n = shardName(ctx, mf), h = wrap.querySelector(".vu-shead-name"), mt = wrap.querySelector(".vu-shead-meta");
      if (!alive || !n || !h) return;
      var s = shortName(n);
      if (h.textContent !== s) h.textContent = s;
      var hn = wrap.querySelector(".vu-shead-home-n"); if (hn && hn.textContent !== s) hn.textContent = s;
      var ex = o.exchange || (mf && mf.exchanges && typeof mf.exchanges[ctx.ticker] === "string" ? mf.exchanges[ctx.ticker] : null);
      if (mt && !mt.children.length) mt.textContent = subLine(n, s, ctx.displaySymbol, ex).join(" · ");
      wrap.setAttribute("data-vu-stock-name", n);
    });
    var lastPrice = o.price || null, range = null;
    function paintPrice() {
      var box = wrap.querySelector(".vu-shead-pricebox"), p = lastPrice;
      if (!p) return;
      if (range) { p = Object.assign({}, p, { changePct: range.pct, changeLabel: range.label }); }
      box.removeAttribute("data-price-pending"); box.setAttribute("aria-busy", "false"); box.innerHTML = priceHtml(p);
    }
    return {
      el: wrap,
      setPrice: function (p) { lastPrice = p; paintPrice(); },
      /** Owner 18.11.2026: die Pille neben dem Kurs zeigt die Veränderung im Zeitraum des Charts ({pct, label}, VUChart.rangeChange). */
      setRange: function (r) { range = r && typeof r.pct === "number" && isFinite(r.pct) ? r : null; paintPrice(); },
      others: { el: oth.el, place: place },
      dispose: function () { alive = false; if (keeper) keeper.disconnect(); oth.dispose(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  /** Navigator aus der Adresse der Seite (StockContext.parse); null, wenn die Adresse keine Aktie ist. */
  function auto(host, opts) {
    var loc = root.location ? root.location.pathname + root.location.hash : "";
    var hit = SC.parse(loc);
    return hit ? mount(host, hit.ctx, hit.product, opts) : null;
  }

  return Object.freeze({ VERSION: VERSION, MODULES: MODULES, PERSPECTIVE: PERSPECTIVE, ORDER: ORDER, OTHERS: OTHERS, html: html, mount: mount, loadShard: loadShard, head: head, others: others, othersHtml: othersHtml, shortName: shortName, subLine: subLine, auto: auto, priceHtml: priceHtml, money: money, shardName: shardName });
});
