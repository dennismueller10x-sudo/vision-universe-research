/* =========================================================================
   VISION UNIVERSE — assets/vu-ui.js            Bausteine C04–C20 (Redesign 2027)

   Markup-Helfer für die gemeinsamen Bausteine aus Folie C der Vorlage
   docs/design/redesign-2027 (lib.js). Jede Funktion liefert HTML-Text mit
   den Klassen aus assets/vu-ui.css; alle Eingaben werden maskiert.
   Fehlt ein Wert, zeigt der Baustein „–“ oder nichts (Regel 7: keine
   erfundenen Zahlen).

   C01–C03 (Kopfzeile, Produkt-Leiste, Menü): assets/site-navigation.js
   C06 (der eine Chart): assets/vu-chart.js. Diese Datei kennt den Chart nicht: Aktienzeilen bekommen
   die fertige Kleinform (Chart-Modul .sparkline) als `chart`, damit Seiten ohne Chart-Skript sie nutzen können.

   Browser: globalThis.VUUI; Node (Tests): module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUUI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VERSION = "vu-ui-1.3.0";
  var SPRITE = "/assets/product-icons.svg#";
  var THEME_SPRITE = "/assets/theme-icons.svg#";
  var CUR = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  /** Zahl deutsch: 1.234,56 */
  function num(v, d) {
    if (!isNum(v)) return "–";
    var k = d == null ? 2 : d;
    return v.toLocaleString("de-DE", { minimumFractionDigits: k, maximumFractionDigits: k });
  }
  /** Prozent mit Vorzeichen und echtem Minus: +3,12 % / −4,22 % */
  function pct(v, d) {
    if (!isNum(v)) return "–";
    return (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v), d) + " %";
  }
  /** Kurs mit nachgestelltem Währungszeichen: 204,64 $ */
  function money(v, cur) {
    if (!isNum(v)) return "–";
    var c = CUR[cur] || cur || "";
    return num(v, Math.abs(v) >= 1000 ? 0 : 2) + (c ? " " + c : "");
  }

  /* ---------------------------------------------------------------- Symbole */
  var GLYPH = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
    line: '<path d="M3 17l5-6 4 3 7-8"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    bars: '<path d="M5 20V13M11 20V7M17 20V4"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    wave: '<path d="M3 14c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 3 4"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    pie: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8h8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'
  };
  function glyph(name, size) {
    var s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + (GLYPH[name] || "") + "</svg>";
  }
  /** Welt-Symbol aus dem gemeinsamen Sprite (discover, quant, technical, …). */
  function worldIcon(id, size) {
    var s = size || 15;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="' + SPRITE + esc(id) + '"/></svg>';
  }
  /** HUD-Kachel einer Welt (schwarz, Symbol neongrün). */
  function hud(id, size, radius) {
    var s = size || 44;
    return '<span class="vu-hud" style="--vu-hud:' + s + "px;border-radius:" + (radius || 12) + 'px">' + worldIcon(id, s) + "</span>";
  }
  /** Themen-Symbol einer Discover-Themenwelt aus dem Themen-Sprite; die id ist der Slug aus discover/themes.js. */
  function themeIcon(slug, size) {
    var s = size || 40;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="' + THEME_SPRITE + esc(slug) + '"/></svg>';
  }
  /** Themen-Kachel (neongrünes Quadrat, Symbol schwarz). Steht seit 14.11.2026 anstelle der Themenbilder. */
  function themeHud(slug, size, radius) {
    var s = size || 74;
    return '<span class="vu-hud vu-hud--lime" style="--vu-hud:' + s + "px;border-radius:" + (radius || Math.round(s * 0.3)) + 'px">' + themeIcon(slug, Math.round(s * 0.54)) + "</span>";
  }

  /* ------------------------------------------------------------- C07, C08, C09 */
  /** C07 Kursbewegung: Plus neongrüne Pille ▲, Minus schwarze Pille ▼. */
  // Preserve each renderer's existing value/unit; only spell its visible sign.
  function movementLabel(text) {
    var value = String(text == null ? "" : text).replace(/[▲▼◆]/g, "").trim();
    if (!/\d/.test(value)) return "Keine Angabe";
    return value.replace(/^\+\s*/, "Plus ").replace(/^[−-]\s*/, "Minus ")
      .replace(/%/g, " Prozent").replace(/\bPp\./g, "Prozentpunkte").replace(/\bp\.\s*a\./gi, "pro Jahr").replace(/\s+/g, " ").trim();
  }
  function chg(v, o) {
    var opt = o || {};
    if (!isNum(v)) return '<span role="img" aria-label="Keine Angabe" class="vu-chg vu-chg--flat' + (opt.big ? " vu-chg--big" : "") + '">–</span>';
    var dir = v > 0 ? "" : v < 0 ? " vu-chg--down" : " vu-chg--flat";
    var arrow = v > 0 ? "▲" : v < 0 ? "▼" : "◆";
    return '<span role="img" aria-label="' + esc((v > 0 ? 'Plus ' : v < 0 ? 'Minus ' : 'Unverändert ') + num(Math.abs(v), opt.digits) + ' Prozent') + '" class="vu-chg' + dir + (opt.big ? " vu-chg--big" : "") + '"><span aria-hidden="true">' + arrow + "</span> " + esc(pct(v, opt.digits)) + "</span>";
  }
  var VERDICT = {
    strong: { mark: "▲", text: "Stark" },
    mid: { mark: "◆", text: "Mittel" },
    weak: { mark: "▼", text: "Schwach" },
    none: { mark: "○", text: "Keine Aussage" }
  };
  /** C08 Urteil. kind: strong | mid | weak | none; text optional (z. B. „Sehr stark“). */
  function verdict(kind, text) {
    var k = VERDICT[kind] ? kind : "none";
    return '<span class="vu-verdict vu-verdict--' + k + '" data-verdict="' + k + '"><span aria-hidden="true">' + VERDICT[k].mark + "</span> " + esc(text || VERDICT[k].text) + "</span>";
  }
  /** C09 Erklärung: ein Satz in Alltagssprache. */
  function help(text) {
    return '<div class="vu-help"><i aria-hidden="true">?</i><span>' + esc(text) + "</span></div>";
  }
  /** C09 kurz: „?“ hinter einer Kennzahl; die Seite öffnet damit ein Sheet (data-vu-help). */
  function q(text, label) {
    return '<button type="button" class="vu-q" data-vu-help="' + esc(text) + '" aria-label="Erklärung: ' + esc(label || text) + '">?</button>';
  }

  /* ------------------------------------------------------------- Logo, C04, C05 */
  /* Firmenlogo (Owner 06.11.2026, alle Aktien): Kachel trägt das Kürzel; sobald die Logo-Liste
     (/discover/logos/index.json, derselbe Cache wie discover/ui/logos.js) geladen ist, ersetzt das Logo
     das Kürzel. Ohne Logo bleibt das Kürzel auf der schwarzen Kachel. Kein Bild ohne Eintrag, also keine 404. */
  var LOGO_BASE = "/discover/logos/", logoFiles = null, logoDark = {}, logoStarted = false;
  function logoFill(tile) {
    var t = tile.getAttribute("data-t"), f = logoFiles && logoFiles[t];
    tile.removeAttribute("data-t");
    if (!f) return;
    var img = document.createElement("img");
    /* Das Bild hängt sofort (unsichtbar) in der Kachel – ein lazy Bild außerhalb des Dokuments lädt der Browser nie. */
    img.alt = ""; img.width = 42; img.height = 42; img.loading = "lazy"; img.decoding = "async"; img.className = "vu-logo-wait";
    img.addEventListener("load", function () { Array.prototype.slice.call(tile.childNodes).forEach(function (c) { if (c !== img) tile.removeChild(c); }); img.className = ""; if (logoDark[t]) tile.classList.add("vu-logo-tile--dark"); });
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); });
    img.src = LOGO_BASE + f;
    tile.appendChild(img);
  }
  function logoScan(root) { if (logoFiles) Array.prototype.forEach.call((root || document).querySelectorAll(".vu-logo-tile[data-t]"), logoFill); }
  function logoStart() {
    if (logoStarted || typeof document === "undefined" || typeof fetch !== "function") return;
    logoStarted = true;
    var pending = root.__vuLogoIndex || (root.__vuLogoIndex = fetch(LOGO_BASE + "index.json", { cache: "default", priority: "low" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }));
    pending.then(function (d) {
      logoFiles = (d && d.files) || {};
      ((d && d.dark) || []).forEach(function (s) { logoDark[s] = true; });
      logoScan(document);
      if (typeof MutationObserver === "function") new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType !== 1) return; if (n.matches && n.matches(".vu-logo-tile[data-t]")) logoFill(n); else if (n.querySelectorAll) logoScan(n); }); }); }).observe(document.documentElement, { childList: true, subtree: true });
    });
  }
  function logo(ticker, o) {
    var opt = o || {}, full = String(ticker || ""), t = full.slice(0, 5);
    var inner = opt.src ? '<img src="' + esc(opt.src) + '" alt="" width="42" height="42" loading="lazy" decoding="async">' : esc(t);
    if (!opt.src && opt.logo !== false && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(full)) logoStart();
    return '<span class="vu-logo-tile' + (opt.xl ? " vu-logo-tile--xl" : "") + '"' + (!opt.src && opt.logo !== false && full ? ' data-t="' + esc(full) + '"' : "") + ' aria-hidden="true">' + inner + "</span>";
  }
  /* N5: jede Perspektive gehört zu genau einer Welt. */
  var PERSPECTIVES = [
    { id: "discover", label: "Überblick", icon: "discover" },
    { id: "technical", label: "Chart", icon: "technical" },
    { id: "fundamental", label: "Zahlen", icon: "fundamental" },
    { id: "quant", label: "Faktoren", icon: "quant" },
    { id: "supertrader", label: "Methoden", icon: "supertrader" },
    { id: "elliott", label: "Wellen", icon: "elliott" },
    { id: "hedgefonds", label: "Investoren", icon: "hedgefonds" }
  ];
  /** Adresse einer Perspektive (heutige Welt-Adressen, N5). hedgefonds braucht die CUSIP, sonst Suche. */
  function perspectiveHref(id, ticker, o) {
    var t = encodeURIComponent(String(ticker || "").toUpperCase()), opt = o || {};
    switch (id) {
      case "discover": return "/discover/#/s/" + encodeURIComponent(opt.universe || "US_REAL") + "/" + t;
      case "technical": return "/technical/#/chart/" + t;
      case "fundamental": return "/fundamental/#/" + t;
      case "quant": return "/quant/#/aktie/" + t;
      case "supertrader": return "/supertrader/stock/" + t + "/";
      case "elliott": return "/elliott/#/" + t;
      case "hedgefonds": return opt.cusip ? "/hedgefonds/#/aktie/" + encodeURIComponent(opt.cusip) : "/hedgefonds/#/aktie/" + t;
      default: return "#";
    }
  }
  /**
   * C05 Perspektiven-Leiste. o.active: Welt-ID der aktiven Perspektive. Die aktive steht vorn,
   * die davor liegende bleibt links sichtbar (wie im Mockup). o.only: erlaubte Welt-IDs.
   */
  function persp(ticker, o) {
    var opt = o || {}, list = PERSPECTIVES.filter(function (p) { return !opt.only || opt.only.indexOf(p.id) >= 0; });
    var i = Math.max(0, list.map(function (p) { return p.id; }).indexOf(opt.active));
    var order = list.slice(Math.max(0, i - 1)).concat(list.slice(0, Math.max(0, i - 1)));
    return '<nav class="vu-persp' + (opt.sticky ? " vu-persp--sticky" : "") + '" aria-label="Perspektiven für ' + esc(ticker) + '">' + order.map(function (p) {
      var on = p.id === opt.active;
      return '<a href="' + esc(perspectiveHref(p.id, ticker, opt)) + '" data-world="' + p.id + '"' + (on ? ' aria-current="page"' : "") + ">" + worldIcon(p.icon, 15) + "<span>" + esc(p.label) + "</span></a>";
    }).join("") + "</nav>";
  }
  /**
   * C04 Aktienkopf: Zurück, Logo, Name + Kürzel + was die Firma macht, Merken;
   * Kurs (veröffentlichter Schluss, ADR-002), Bewegung, Datum, Euro-Wert; darunter C05.
   * s: {ticker, name, what, price, currency, changePct, dateLabel, eurLabel, backHref, saved}
   */
  function stockHead(s, o) {
    var opt = o || {}, st = s || {};
    var meta = [st.dateLabel ? esc(st.dateLabel) : "", st.eurLabel ? "≈ " + esc(st.eurLabel) : ""].filter(Boolean).join("<br>");
    var back = st.backHref ? '<a class="vu-round" href="' + esc(st.backHref) + '" aria-label="Zurück">' + glyph("back") + "</a>" : '<button type="button" class="vu-round" data-vu-back aria-label="Zurück">' + glyph("back") + "</button>";
    return '<header class="vu-stockhead" data-vu-stock="' + esc(st.ticker) + '" data-vu-stock-name="' + esc(st.name || st.ticker) + '"><div class="vu-stockhead__top">' + back + logo(st.ticker, { src: st.logo }) +
      '<div class="vu-stockhead__name"><b>' + esc(st.name || st.ticker) + "</b><span>" + esc(st.ticker) + (st.what ? " · " + esc(st.what) : "") + "</span></div>" +
      '<button type="button" class="vu-round" data-vu-watch="' + esc(st.ticker) + '" aria-pressed="' + (st.saved ? "true" : "false") + '" aria-label="' + esc(st.ticker) + ' merken">' + glyph("heart") + "</button></div>" +
      (isNum(st.price) ? '<div class="vu-stockhead__price"><b>' + esc(money(st.price, st.currency)) + "</b>" + chg(st.changePct, { big: true }) + (meta ? '<span class="vu-stockhead__meta">' + meta + "</span>" : "") + "</div>" : "") +
      (opt.persp === false ? "" : persp(st.ticker, { active: opt.active, cusip: st.cusip, universe: st.universe, sticky: opt.sticky })) + "</header>";
  }

  /* ------------------------------------------------------------- C10–C14 */
  /** C10 Aktienzeile: Logo, Name + Zusatz, Mini-Chart (C06 klein, als fertiges SVG in r.chart), Kurs + Bewegung. */
  function stockRow(r) {
    var x = r || {}, spark = x.chart || "";
    var tag = x.href ? "a" : "div";
    return "<" + tag + ' class="vu-lrow' + (spark ? "" : " vu-lrow--nochart") + (x.noPrice ? " vu-lrow--noprice" : "") + '"' + (x.href ? ' href="' + esc(x.href) + '"' : "") + ">" + logo(x.ticker, { src: x.logo }) +
      '<div class="vu-lrow__name"><b>' + esc(x.name || x.ticker) + "</b><span>" + esc(x.sub || x.ticker) + "</span></div>" +
      (spark ? '<div class="vu-lrow__mini">' + spark + "</div>" : "") +
      (x.noPrice ? "" : '<div class="vu-lrow__price"><span>' + esc(money(x.price, x.currency)) + "</span>" + chg(x.changePct) + "</div>") + "</" + tag + ">";
  }
  /** C11 Kachel */
  function tile(label, value, sub) {
    return '<div class="vu-tile"><div class="vu-tile__label">' + esc(label) + '</div><div class="vu-tile__value">' + esc(value == null || value === "" ? "–" : value) + "</div>" + (sub ? '<div class="vu-tile__sub">' + esc(sub) + "</div>" : "") + "</div>";
  }
  /** C12 Navigationskarte. icon: Welt-ID des Sprites. */
  function navcard(o) {
    var x = o || {};
    var lead = x.icon ? hud(x.icon, 42) : x.glyph ? '<span class="vu-hud" style="--vu-hud:42px">' + glyph(x.glyph, 21) + "</span>" : "";
    return '<a class="vu-navcard" href="' + esc(x.href || "#") + '">' + lead + '<span class="vu-navcard__text"><b>' + esc(x.title) + "</b>" + (x.sub ? "<span>" + esc(x.sub) + "</span>" : "") + "</span>" +
      (x.right ? x.right : '<svg class="vu-navcard__go" viewBox="0 0 24 24" aria-hidden="true">' + GLYPH.next + "</svg>") + "</a>";
  }
  /** C13 Abschnittstitel mit optionalem Link rechts. */
  function sect(title, o) {
    var x = o || {}, h = x.level || 2;
    return '<div class="vu-sect"><h' + h + ">" + esc(title) + "</h" + h + ">" + (x.href ? '<a href="' + esc(x.href) + '">' + esc(x.link || "Alle") + "</a>" : "") + "</div>";
  }
  /** C14 Reiter/Segment. items: [{id,label,href?}], active: id. */
  function seg(items, active, o) {
    var x = o || {};
    return '<div class="vu-seg" role="' + (x.tabs ? "tablist" : "group") + '"' + (x.label ? ' aria-label="' + esc(x.label) + '"' : "") + ">" + (items || []).map(function (it) {
      var on = it.id === active;
      if (it.href) return '<a href="' + esc(it.href) + '"' + (on ? ' aria-current="page"' : "") + ">" + esc(it.label) + "</a>";
      return '<button type="button" data-id="' + esc(it.id) + '"' + (x.tabs ? ' role="tab" aria-selected="' + on + '"' : ' aria-pressed="' + on + '"') + ">" + esc(it.label) + "</button>";
    }).join("") + "</div>";
  }
  /** Zeitleiste C06: 1T · 1W · 1M · 1J · 5J · Max (Segment). */
  function ranges(active) {
    var r = ["1T", "1W", "1M", "1J", "5J", "Max"]; /* gleich assets/vu-chart.js RANGES (Test core/tests/vu-ui.test.mjs) */
    return seg(r.map(function (x) { return { id: x, label: x }; }), active || "1J", { label: "Zeitraum" });
  }

  /* ------------------------------------------------------------- C15–C20 */
  /** C15 Schalter (echtes Kontrollkästchen mit Rolle switch). */
  function toggle(on, label, name) {
    return '<label style="display:inline-flex;align-items:center;gap:10px;min-height:44px"><input type="checkbox" role="switch" class="vu-switch"' + (name ? ' name="' + esc(name) + '"' : "") + (on ? " checked" : "") + ">" + (label ? '<span style="font-size:13px;font-weight:700">' + esc(label) + "</span>" : "") + "</label>";
  }
  /** C16 Sheet: Hülle mit Griff. Öffnen/Schließen über openSheet/closeSheet. */
  function sheet(id, title, body) {
    return '<div class="vu-sheet-backdrop" id="' + esc(id) + '" hidden><div class="vu-sheet-ui" role="dialog" aria-modal="true" tabindex="-1" aria-label="' + esc(title) + '"><h2 class="vu-mt">' + esc(title) + '</h2><div class="vu-sheet-body" style="margin-top:12px">' + (body || "") + "</div></div></div>";
  }
  /** C17 Balken: Anteil 0–100. */
  function meter(v, o) {
    var x = o || {}, p = isNum(v) ? Math.max(0, Math.min(100, v)) : 0;
    return '<div class="vu-meter' + (x.lime ? " vu-meter--lime" : "") + '" role="img" aria-label="' + esc((x.label || "Anteil") + " " + (isNum(v) ? num(v, 0) : "–")) + '"><i style="--v:' + p + '"></i></div>';
  }
  /** C17 Säulen: data [[label, wert]], letzte Säule neongrün. */
  function bars(data, o) {
    var x = o || {}, d = (data || []).filter(function (r) { return r && isNum(r[1]); });
    if (!d.length) return "";
    var w = x.width || 354, h = x.height || 150, mx = Math.max.apply(null, d.map(function (r) { return Math.max(0, r[1]); })) || 1, bw = w / d.length;
    return '<svg class="vu-bars" viewBox="0 0 ' + w + " " + (h + 18) + '" role="img" aria-label="' + esc(x.label || "Balken") + '">' + d.map(function (r, i) {
      var bh = Math.max(2, Math.max(0, r[1]) / mx * h), last = i === d.length - 1;
      return '<rect' + (last ? ' class="is-last"' : "") + ' x="' + (i * bw + 3).toFixed(1) + '" y="' + (h - bh).toFixed(1) + '" width="' + Math.max(1, bw - 6).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="4"/>' +
        (x.allLabels || i % 2 === (d.length - 1) % 2 ? '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (h + 14) + '" text-anchor="middle">' + esc(x.allLabels ? "GJ " + String(r[0]).slice(-2) : String(r[0]).slice(-2)) + "</text>" : "");
    }).join("") + "</svg>";
  }
  /** C18 Leerer Zustand: ehrlich sagen, was fehlt. */
  function blank(text, o) {
    var x = o || {};
    return '<div class="vu-blank">' + (x.verdict === false ? "" : verdict("none")) + "<span>" + esc(text) + "</span></div>";
  }
  /** C19 PRO-Marke */
  function pro() { return '<span class="vu-pro">PRO</span>'; }
  /** Etikett für Forschungsergebnisse (CLAUDE.md: „Forschung, nicht zertifiziert“). */
  function research(text) { return '<span class="vu-research">' + esc(text || "Forschung, nicht zertifiziert") + "</span>"; }
  /** C20 Suche mit Atlas-Knopf. */
  function search(o) {
    var x = o || {};
    return '<a class="vu-find" href="' + esc(x.href || "/discover/#/suche") + '">' + glyph("search", 18) + "<span>" + esc(x.placeholder || "Aktie, Thema oder Frage …") + '</span><i aria-hidden="true">' + glyph("spark", 18) + "</i></a>";
  }

  /* ------------------------------------------------------------- App-Konzept 2 (Owner-Freigabe 14.11.2026)
     Bausteine des freigegebenen Prototyps: antippbare Kachel, Schiene, Zahlenreihe, Grafiken (Ring, Zeiger, Vorher/Nachher,
     Balken um die Nulllinie, Raster, Netz) und die „Weiter“-Karte am Seitenende. Tiefe öffnet sich im Fenster (popup, data-vu-pop).
     Alle Grafiken zeichnen nur übergebene Werte; fehlt ein Wert, steht „–“ oder die Stelle bleibt leer (Regel 7). */
  function extra(a) {
    var out = "";
    if (a) Object.keys(a).forEach(function (k) { if (a[k] != null && a[k] !== false) out += " " + k + '="' + esc(a[k] === true ? "" : a[k]) + '"'; });
    return out;
  }
  function clamp(v) { return isNum(v) ? Math.max(0, Math.min(100, v)) : null; }
  /** Antippbare Kachel. body: fertiges HTML (nur span/b/svg, die Kachel ist Link oder Knopf).
      o: href (Link) | pop (Kennung eines <template>, öffnet es im Fenster; popTitle = Titel) | sonst Knopf für eigenen Klick;
      tone: "night" (immer dunkel) | "lime" | "line" | "glow"; label (aria-label); attrs {name: wert}; cls. */
  function tap(body, o) {
    var x = o || {}, tag = x.href ? "a" : "button";
    return "<" + tag + ' class="vu-tap' + (x.tone ? " vu-tap--" + esc(x.tone) : "") + (x.cls ? " " + esc(x.cls) : "") + '"' +
      (x.href ? ' href="' + esc(x.href) + '"' : ' type="button"') +
      (x.pop ? ' aria-haspopup="dialog" data-vu-pop="' + esc(x.pop) + '"' + (x.popTitle ? ' data-vu-pop-title="' + esc(x.popTitle) + '"' : "") : "") +
      (x.label ? ' aria-label="' + esc(x.label) + '"' : "") + extra(x.attrs) + ">" + (body || "") + "</" + tag + ">";
  }
  /** Zahlenkachel: große Zahl, eine Zeile darunter, optional eine Grafik (fertiges HTML). o wie tap(). */
  function stat(value, label, o) {
    var x = o || {};
    return tap('<b class="vu-stat__v vu-num">' + esc(value == null || value === "" ? "–" : value) + '</b><span class="vu-stat__l">' + esc(label) + "</span>" +
      (x.graphic ? '<span class="vu-stat__g" aria-hidden="true">' + x.graphic + "</span>" : ""), Object.assign({}, x, { cls: "vu-stat" + (x.cls ? " " + x.cls : "") }));
  }
  /** Kompakte Zahlenreihe: [{value, label, tone?: "lime"}], zwei bis vier Werte in einer Zeile. */
  function stats(list, o) {
    var x = o || {};
    return '<div class="vu-stats" role="list"' + (x.label ? ' aria-label="' + esc(x.label) + '"' : "") + ">" + (list || []).map(function (it) {
      return '<div role="listitem"' + (it.tone ? ' class="is-' + esc(it.tone) + '"' : "") + '><b class="vu-num">' + esc(it.value == null || it.value === "" ? "–" : it.value) + "</b><span>" + esc(it.label) + "</span></div>";
    }).join("") + "</div>";
  }
  /** Schiene: waagerecht wischbar, rastet ein, läuft bis an den Bildschirmrand. items: fertiges HTML je Platz. o: label, width (px je Platz). */
  function rail(items, o) {
    var x = o || {};
    return '<div class="vu-rail" role="list" tabindex="0"' + (x.label ? ' aria-label="' + esc(x.label) + '"' : "") + (x.width ? ' style="--vu-rail-w:' + Number(x.width) + 'px"' : "") + ">" +
      (items || []).map(function (it) { return '<div role="listitem">' + it + "</div>"; }).join("") + "</div>";
  }
  /** Ring: Anteil 0–100 als Kreis, in der Mitte der Wert. o: size, stroke, text (Mitte), label (aria). */
  function ring(v, o) {
    var x = o || {}, size = x.size || 56, sw = x.stroke || 6, r = (size - sw) / 2, c = 2 * Math.PI * r, p = clamp(v);
    return '<span class="vu-ring" role="img" aria-label="' + esc((x.label || "Anteil") + " " + (p == null ? "–" : num(p, 0) + " %")) + '" style="width:' + size + "px;height:" + size + 'px"><svg viewBox="0 0 ' + size + " " + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '"/>' +
      (p == null ? "" : '<circle class="is-on" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '" stroke-dasharray="' + (c * p / 100).toFixed(2) + " " + c.toFixed(2) + '"/>') +
      '</svg><b class="vu-num" style="font-size:' + Math.round(size * 0.27) + 'px">' + esc(x.text != null ? x.text : p == null ? "–" : num(p, 0)) + "</b></span>";
  }
  /** Zeiger: Anteil 0–100 als Halbkreis, darunter der Wert groß. o: text (z. B. „37 %“), label (aria), width. */
  function gauge(v, o) {
    var x = o || {}, w = 200, sw = 16, r = (w - sw) / 2, c = Math.PI * r, p = clamp(v), d = "M" + sw / 2 + " " + w / 2 + "A" + r + " " + r + " 0 0 1 " + (w - sw / 2) + " " + w / 2;
    return '<span class="vu-gauge" role="img" aria-label="' + esc((x.label || "Anteil") + " " + (p == null ? "–" : num(p, 0) + " %")) + '"' + (x.width ? ' style="--vu-gauge-w:' + Number(x.width) + 'px"' : "") + '><svg viewBox="0 0 ' + w + " " + (w / 2 + sw / 2) + '" aria-hidden="true"><path d="' + d + '" stroke-width="' + sw + '"/>' +
      (p == null ? "" : '<path class="is-on" d="' + d + '" stroke-width="' + sw + '" stroke-dasharray="' + (c * p / 100).toFixed(2) + " " + (c + sw).toFixed(2) + '"/>') +
      '</svg><b class="vu-num">' + esc(x.text != null ? x.text : p == null ? "–" : num(p, 0) + " %") + "</b></span>";
  }
  /** Vorher/Nachher auf einer Skala 0–100: Zahl vorher, Balken, Zahl nachher. Zuwachs neongrün, Verlust als heller Rest. */
  function delta(from, to, o) {
    var x = o || {}, a = clamp(from), b = clamp(to);
    if (a == null || b == null) return "";
    var lo = Math.min(a, b), hi = Math.max(a, b), up = b > a;
    return '<span class="vu-delta' + (up ? " is-up" : b < a ? " is-down" : "") + '" role="img" aria-label="' + esc((x.label ? x.label + ": " : "") + "von " + num(a, 0) + " auf " + num(b, 0)) + '"><b class="vu-num">' + num(a, 0) + '</b><span class="vu-delta__bar"><i style="width:' + lo + '%"></i><i class="is-diff" style="left:' + lo + "%;width:" + (hi - lo) + '%"></i></span><b class="vu-num">' + num(b, 0) + "</b></span>";
  }
  /** Balken um die Nulllinie: rows [{label, sub?, value, text?}], plus rechts neongrün, minus links. o: max (Skala), label, digits. */
  function diverge(rows, o) {
    var x = o || {}, list = (rows || []).filter(function (r) { return r && isNum(r.value); });
    if (!list.length) return "";
    var mx = x.max || Math.max.apply(null, list.map(function (r) { return Math.abs(r.value); })) || 1;
    return '<div class="vu-div" role="list"' + (x.label ? ' aria-label="' + esc(x.label) + '"' : "") + ">" + list.map(function (r) {
      var w = (Math.min(100, Math.abs(r.value) / mx * 100) / 2).toFixed(1), txt = r.text != null ? r.text : (r.value > 0 ? "+" : r.value < 0 ? "−" : "") + num(Math.abs(r.value), x.digits == null ? 1 : x.digits);
      return '<div class="vu-div__r" role="listitem"><span class="vu-div__l"><b>' + esc(r.label) + "</b>" + (r.sub ? "<span>" + esc(r.sub) + "</span>" : "") + '</span><span class="vu-div__b" aria-hidden="true"><i class="' + (r.value > 0 ? "is-up" : r.value < 0 ? "is-down" : "") + '" style="width:' + w + '%"></i></span><b class="vu-num' + (r.value > 0 ? " is-up" : "") + '">' + esc(txt) + "</b></div>";
    }).join("") + "</div>";
  }
  /** Raster: Zeilen × Spalten mit Werten 0–100, stark (ab 75) neongrün. cols [{html, label}], rows [{label, values[], hrefs?[]}]. o: label, note [links, rechts]. */
  function heat(cols, rows, o) {
    var x = o || {}, n = (cols || []).length;
    if (!n || !(rows || []).length) return "";
    return '<div class="vu-heat" role="table"' + (x.label ? ' aria-label="' + esc(x.label) + '"' : "") + ' style="--vu-heat-n:' + n + '"><div class="vu-heat__r" role="row"><span role="columnheader"><span class="vu-visually-hidden">' + esc(x.corner || "Eigenschaft") + "</span></span>" +
      cols.map(function (c) { return '<span class="vu-heat__h" role="columnheader"' + (c.label ? ' title="' + esc(c.label) + '"' : "") + ">" + (c.html || esc(c.label)) + (c.html && c.label ? '<span class="vu-visually-hidden">' + esc(c.label) + "</span>" : "") + "</span>"; }).join("") + "</div>" +
      rows.map(function (r) {
        return '<div class="vu-heat__r" role="row"><span class="vu-heat__l" role="rowheader">' + esc(r.label) + "</span>" + cols.map(function (c, i) {
          var v = clamp(r.values && r.values[i]), cls = "vu-heat__c vu-num" + (v == null ? " is-na" : v >= 75 ? " is-hi" : ""), a = v == null ? 0 : v >= 75 ? 100 : Math.round(v * 0.4), href = r.hrefs && r.hrefs[i];
          var inner = v == null ? "–" : String(Math.round(v));
          return href ? '<a class="' + cls + '" role="cell" style="--a:' + a + '" href="' + esc(href) + '">' + inner + "</a>" : '<span class="' + cls + '" role="cell" style="--a:' + a + '">' + inner + "</span>";
        }).join("") + "</div>";
      }).join("") + (x.note ? '<div class="vu-heat__n"><span>' + esc(x.note[0] || "") + "</span><span>" + esc(x.note[1] || "") + "</span></div>" : "") + "</div>";
  }
  /** Netz: Werte 0–100 je Achse als Fläche. values [n|null], o: size, labels [kurz], compare (zweite Reihe, als Linie), label (aria). */
  function radar(values, o) {
    var x = o || {}, vals = values || [], n = vals.length;
    if (n < 3) return "";
    var size = x.size || 150, pad = x.labels ? 22 : 4, cx = size / 2, cy = size / 2, R = size / 2 - pad;
    var pt = function (i, v) { var a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * (v / 100); return (cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1); };
    var poly = function (list, cls) { return '<polygon class="' + cls + '" points="' + list.map(function (v, i) { return pt(i, clamp(v) == null ? 0 : clamp(v)); }).join(" ") + '"/>'; };
    var grid = [25, 50, 75, 100].map(function (g) { return '<polygon class="vu-radar__g" points="' + vals.map(function (_, i) { return pt(i, g); }).join(" ") + '"/>'; }).join("") +
      vals.map(function (_, i) { return '<line class="vu-radar__g" x1="' + cx + '" y1="' + cy + '" x2="' + pt(i, 100).split(",")[0] + '" y2="' + pt(i, 100).split(",")[1] + '"/>'; }).join("");
    var labels = x.labels ? x.labels.map(function (l, i) { var a = -Math.PI / 2 + i * 2 * Math.PI / n, lx = cx + (R + 11) * Math.cos(a), ly = cy + (R + 11) * Math.sin(a); return '<text x="' + lx.toFixed(1) + '" y="' + (ly + 3.5).toFixed(1) + '" text-anchor="' + (Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end") + '">' + esc(l) + "</text>"; }).join("") : "";
    var aria = (x.label ? x.label + ": " : "") + vals.map(function (v, i) { return (x.names && x.names[i] ? x.names[i] + " " : "") + (clamp(v) == null ? "–" : Math.round(v)); }).join(", ");
    return '<svg class="vu-radar" viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(aria) + '">' + grid + poly(vals, "vu-radar__a") + (x.compare ? poly(x.compare, "vu-radar__b") : "") + labels + "</svg>";
  }
  /** „Weiter“-Karte am Seitenende: führt zum nächsten sinnvollen Ort. o: title, sub, href, eyebrow (Standard „Weiter“). */
  function next(o) {
    var x = o || {};
    return '<a class="vu-next" href="' + esc(x.href || "#") + '"><span class="vu-next__t"><span class="vu-ltag">' + esc(x.eyebrow || "Weiter") + "</span><b>" + esc(x.title) + "</b>" + (x.sub ? "<span>" + esc(x.sub) + "</span>" : "") + '</span><i aria-hidden="true">' + glyph("next", 20) + "</i></a>";
  }

  /* ------------------------------------------------------------- Verhalten */
  /** Fenster (C16) öffnen/schließen: am Telefon von unten, am Schreibtisch mittig. Escape, Tippen auf den Hintergrund,
      Griff (tippen oder nach unten ziehen) schließen; Tab bleibt im Fenster, die Seite dahinter rollt nicht, der Fokus
      kehrt zum Auslöser zurück. Mehrere Fenster stapeln sich, Escape schließt das oberste. Ereignis „vu-sheet-close“ am Element. */
  var openSheets = [];
  function focusable(panel) {
    return Array.prototype.filter.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'), function (n) { return n.offsetParent !== null || n === panel.ownerDocument.activeElement; });
  }
  function sheetKey(e) {
    var el = openSheets[openSheets.length - 1];
    if (!el) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSheet(el); return; }
    if (e.key !== "Tab") return;
    var panel = el.querySelector(".vu-sheet-ui") || el, list = focusable(panel), doc = el.ownerDocument, at = doc.activeElement;
    if (!list.length) { e.preventDefault(); if (panel.focus) panel.focus(); return; }
    var first = list[0], last = list[list.length - 1];
    if (!panel.contains(at) || (e.shiftKey && (at === first || at === panel)) || (!e.shiftKey && at === last)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  }
  function sheetGrab(el, panel) {
    var doc = el.ownerDocument, grab = panel.querySelector(":scope > .vu-sheet-grab");
    if (!grab) {
      grab = doc.createElement("button"); grab.type = "button"; grab.className = "vu-sheet-grab"; grab.setAttribute("aria-label", "Schließen");
      panel.insertBefore(grab, panel.firstChild);
    }
    panel.classList.add("vu-sheet-ui--grab");
    if (grab.__vuBound) return;
    grab.__vuBound = true;
    var y0 = null, dy = 0, moved = false;
    grab.addEventListener("pointerdown", function (e) { y0 = e.clientY; dy = 0; moved = false; if (grab.setPointerCapture) try { grab.setPointerCapture(e.pointerId); } catch (err) { /* ohne Zeiger */ } panel.style.transition = "none"; });
    grab.addEventListener("pointermove", function (e) { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); if (dy > 4) moved = true; panel.style.transform = dy ? "translateY(" + dy + "px)" : ""; });
    var end = function (e) {
      if (y0 == null) return;
      y0 = null; panel.style.transition = ""; panel.style.transform = "";
      if (e.type === "pointerup" && dy > 90) closeSheet(el);
    };
    grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
    grab.addEventListener("click", function () { if (!moved) closeSheet(el); moved = false; });
  }
  function openSheet(el) {
    if (!el) return;
    if (root.VUGestures && root.document.documentElement.hasAttribute("data-vu-gestures")) return root.VUGestures.openSheet(el);
    var doc = el.ownerDocument, panel = el.querySelector(".vu-sheet-ui") || el, at = openSheets.indexOf(el);
    if (at >= 0) openSheets.splice(at, 1); else el.__vuReturn = doc.activeElement;
    if (panel !== el) {
      if (!panel.hasAttribute("role")) panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      sheetGrab(el, panel);
    }
    el.hidden = false;
    if (!el.__vuClose) {
      el.__vuClose = function (e) { if (e.target === el) closeSheet(el); };
      el.addEventListener("click", el.__vuClose);
    }
    if (!openSheets.length) {
      doc.addEventListener("keydown", sheetKey, true);
      var gap = root.innerWidth && doc.documentElement.clientWidth ? root.innerWidth - doc.documentElement.clientWidth : 0;
      doc.documentElement.classList.add("vu-sheet-open");
      if (gap > 0 && doc.body) { doc.body.__vuPad = doc.body.style.paddingRight; doc.body.style.paddingRight = gap + "px"; }
    }
    openSheets.push(el);
    /* Wird das Fenster von außen versteckt oder entfernt (el.hidden = true, el.remove()), löst sich die Sperre trotzdem. */
    if (root.MutationObserver && !el.__vuWatch) {
      el.__vuWatch = new root.MutationObserver(function () { if (el.hidden || !el.isConnected) closeSheet(el); });
      el.__vuWatch.observe(el, { attributes: true, attributeFilter: ["hidden"] });
      if (el.parentNode) el.__vuWatch.observe(el.parentNode, { childList: true });
    }
    panel.scrollTop = 0;
    if (panel.focus) try { panel.focus({ preventScroll: true }); } catch (err) { panel.focus(); }
  }
  function closeSheet(el) {
    if (!el) return;
    if (root.VUGestures && root.document.documentElement.hasAttribute("data-vu-gestures")) root.VUGestures.closeSheet(el);
    var doc = el.ownerDocument, at = openSheets.indexOf(el), was = !el.hidden;
    if (el.__vuWatch) { el.__vuWatch.disconnect(); el.__vuWatch = null; }
    el.hidden = true;
    if (el.__vuClose) { el.removeEventListener("click", el.__vuClose); el.__vuClose = null; }
    if (at < 0) return;
    openSheets.splice(at, 1);
    if (!openSheets.length) {
      doc.removeEventListener("keydown", sheetKey, true);
      doc.documentElement.classList.remove("vu-sheet-open");
      if (doc.body && doc.body.__vuPad != null) { doc.body.style.paddingRight = doc.body.__vuPad; doc.body.__vuPad = null; }
    }
    var back = el.__vuReturn; el.__vuReturn = null;
    if (back && back.focus && doc.contains(back)) try { back.focus({ preventScroll: true }); } catch (err) { back.focus(); }
    if (was && typeof root.CustomEvent === "function") el.dispatchEvent(new root.CustomEvent("vu-sheet-close"));
  }
  /** Fenster in einem Zug: baut das Sheet, hängt es an die Seite, öffnet es und räumt es beim Schließen wieder ab.
      o: title, body (HTML-Text oder Knoten), id, cls, onClose. Liefert das Element (Inhalt: .vu-sheet-body); schließen mit closeSheet(el). */
  function popup(o) {
    var x = o || {}, doc = root.document;
    if (!doc) return null;
    var id = x.id || "vu-pop", old = doc.getElementById(id);
    if (old) { closeSheet(old); old.remove(); }
    var wrap = doc.createElement("div"); wrap.innerHTML = sheet(id, x.title || "", "");
    var el = wrap.firstChild, body = el.querySelector(".vu-sheet-body");
    if (x.cls) el.classList.add(x.cls);
    if (!x.title) { var h = el.querySelector("h2"); if (h) h.hidden = true; }
    if (typeof x.body === "string") body.innerHTML = x.body; else if (x.body) body.appendChild(x.body);
    doc.body.appendChild(el);
    var gone = function () { root.removeEventListener("hashchange", away); if (el.parentNode) el.remove(); if (x.onClose) x.onClose(el); };
    var away = function () { closeSheet(el); if (el.parentNode) gone(); };
    el.addEventListener("vu-sheet-close", gone);
    root.addEventListener("hashchange", away);
    openSheet(el);
    return el;
  }
  /** Kacheln mit data-vu-pop="<id>" öffnen den Inhalt von <template id="<id>"> im Fenster (Titel: data-vu-pop-title). Einmal je Bereich binden. */
  function bindPops(scope) {
    var doc = (scope && scope.ownerDocument) || root.document, host = scope || doc;
    if (!doc || !host || host.__vuPops) return;
    host.__vuPops = true;
    host.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-vu-pop]");
      if (!b || !host.contains(b)) return;
      var tpl = doc.getElementById(b.getAttribute("data-vu-pop"));
      if (!tpl) return;
      e.preventDefault();
      var frag = tpl.content ? tpl.content.cloneNode(true) : null, box = doc.createElement("div");
      if (frag) box.appendChild(frag); else box.innerHTML = tpl.innerHTML;
      popup({ id: "vu-pop-" + b.getAttribute("data-vu-pop"), title: b.getAttribute("data-vu-pop-title") || "", body: box });
    });
  }
  /** „?“-Knöpfe einer Seite an ein gemeinsames Sheet binden (C09 + C16). */
  function bindHelp(scope) {
    var doc = (scope && scope.ownerDocument) || root.document;
    if (!doc) return;
    (scope || doc).addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-vu-help]");
      if (!b) return;
      e.preventDefault();
      var el = doc.getElementById("vu-help-sheet");
      if (!el) { var wrap = doc.createElement("div"); wrap.innerHTML = sheet("vu-help-sheet", "Kurz erklärt", ""); el = wrap.firstChild; doc.body.appendChild(el); }
      el.querySelector(".vu-sheet-body").innerHTML = help(b.getAttribute("data-vu-help"));
      openSheet(el);
    });
  }

  /* ------------------------------------------------------------- Pflicht-Hinweise (Strang F)
     Texte aus assets/legal-notices.json; sichtbar erst mit legalApproved: true (Owner + Anwalt, RECHTLICHE_ABNAHME A15).
     Bis dahin liefert legal() einen leeren Text und die Seiten bleiben, wie sie sind. */
  /* VU-LEGAL:BEGIN – erzeugt aus assets/legal-notices.json (scripts/legal/sync-legal-notices.mjs), nicht von Hand ändern */
  var LEGAL = {"approved":true,"version":"vu-hinweise-2026-11-07-1","notices":{"footer":{"text":"Vision Universe ist eine Software zur Analyse von Aktien. Die Ergebnisse entstehen automatisch nach beschriebenen Regeln und sind für alle gleich. Keine Anlageberatung, keine Anlageempfehlung, keine Kauf- oder Verkaufsempfehlung. Aktien können bis zum Totalverlust fallen. Frühere und simulierte Ergebnisse sind kein verlässlicher Hinweis auf die Zukunft.","label":null,"required":null,"links":[["Impressum","https://konto.visionuniverse.de/rechtliches/impressum"],["Kontakt","https://konto.visionuniverse.de/kontakt"],["Datenschutz","https://konto.visionuniverse.de/rechtliches/datenschutz"],["Nutzungsbedingungen","https://konto.visionuniverse.de/rechtliches/agb"],["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"]]},"stock":{"text":"Einstufungen und Werte beschreiben, wie diese Aktie nach den Regeln der jeweiligen Methode im Vergleich zu anderen Aktien abschneidet – Datenstand siehe oben. Sie berücksichtigen deine persönliche Situation nicht und sind keine Empfehlung, diese Aktie zu kaufen, zu halten oder zu verkaufen.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"ranking":{"text":"Diese Liste zeigt Aktien, die die beschriebenen Bedingungen zum Datenstand rechnerisch erfüllen. Die Reihenfolge folgt der Regel, nicht einer Einschätzung, welche Aktie besser für dich ist.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"setup":{"text":"Regel-Ergebnis der Methode, für alle gleich: Die Aktie erfüllt zum Datenstand die beschriebenen Bedingungen. Zonen laut Methode sind Rechenpunkte, kein Kursziel und keine Prognose. Das ist keine Empfehlung, die Aktie zu kaufen oder zu verkaufen.","label":null,"required":["Methode und Regelversion","Datenstand","Link zur Methodik"],"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"],["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"backtest":{"text":"Forschung, nicht zertifiziert: Dieser Backtest rechnet eine Regel rückwirkend auf historische Kurse. Das Ergebnis hängt von Zeitraum, Kosten, Ausführung und Datenumfang ab (Angaben unten). Es ist keine Prognose und kein Renditeversprechen. Frühere und simulierte Wertentwicklungen sind kein verlässlicher Indikator für künftige Ergebnisse.","label":"Forschung, nicht zertifiziert","required":["Zeitraum","Kosten je Trade","Vergleichsmaßstab (z. B. S&P 500 Gesamtrendite)","Enthält delistete Titel: ja/nein","Anzahl getesteter Varianten","größter Verlust (max. Drawdown)"],"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"]]},"modelPortfolio":{"text":"Musterdepot: ein Rechenmodell ohne echtes Geld, das eine Methode nach Regel rechnet. Es zeigt, was die Methode tut, nicht, was du tun solltest, und ist keine Empfehlung. Reale Ergebnisse weichen durch Kosten, Steuern, Kurslücken und Ausführungszeitpunkt ab.","label":"Rechenmodell, kein echtes Geld","required":null,"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"],["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"thirdParty":{"text":"Angabe Dritter: zusammengefasste Einschätzungen externer Analysten bzw. Pflichtmeldungen an die SEC, unverändert mit Quelle und Datum. Nicht von Vision Universe erstellt und keine Einschätzung von Vision Universe.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]},"ai":{"text":"Die KI übersetzt deine Frage in Filter; die Zahlen rechnet Vision Universe aus seinen Daten. KI-Texte können Fehler enthalten. Der Atlas beantwortet keine Fragen zu deiner persönlichen Situation und sagt nicht, was du kaufen oder verkaufen sollst.","label":null,"required":null,"links":[["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"]]},"editorial":{"text":"Redaktionelle Einordnung, keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Methodik und Interessen: siehe Seite „Methodik, Quellen und Interessen“.","label":null,"required":null,"links":[["Methodik, Quellen und Interessen","https://konto.visionuniverse.de/rechtliches/methodik"]]}},"appLinks":[["Impressum","https://konto.visionuniverse.de/rechtliches/impressum"],["Kontakt","https://konto.visionuniverse.de/kontakt"],["Datenschutz","https://konto.visionuniverse.de/rechtliches/datenschutz"],["Nutzungsbedingungen","https://konto.visionuniverse.de/rechtliches/agb"],["Risikohinweise","https://konto.visionuniverse.de/rechtliches/risikohinweise"],["Datenquellen & Methodik","https://research.visionuniverse.de/infos/#quellen"]],"menuTitle":"Rechtliches & Infos","footerInApp":false,"footerOnWeb":false};
  /* VU-LEGAL:END */
  function legalNotice(key) { return LEGAL.approved && LEGAL.notices && LEGAL.notices[key] || null; }
  function legal(key, o) {
    var n = legalNotice(key), x = o || {};
    if (!n) return "";
    return '<aside class="vu-legal" data-legal="' + esc(key) + '"><p>' + esc(n.text) + "</p>" +
      (x.facts && n.required ? '<ul class="vu-legal-facts">' + n.required.map(function (r) { return "<li><b>" + esc(String(r).replace(/\s*\(z\. B\.[^)]*\)/, "").replace(/:\s*ja\/nein$/, "")) + ":</b> " + esc(x.facts[r] == null ? "–" : x.facts[r]) + "</li>"; }).join("") + "</ul>" : "") +
      (n.links.length ? '<p class="vu-legal-links">' + n.links.map(function (l) { return '<a href="' + esc(l[1]) + '">' + esc(l[0]) + "</a>"; }).join(" · ") + "</p>" : "") + "</aside>";
  }

  /** Static shapes use the same card/row rhythm as the final redesign. */
  function skeleton(kind) {
    var k = /^(head|card|rows)$/.test(kind) ? kind : 'card';
    return '<div class="vu-skeleton vu-skeleton--' + k + '" aria-hidden="true"><i></i><i></i><i></i>' + (k === 'rows' ? '<i></i><i></i><i></i>' : '') + '</div>';
  }
  /** Bound speculation on actual link intent; the product supplies its canonical loader. */
  function bindIntent(resolveKey, load, root) {
    var doc = root || document, timer, count = 0, since = 0, seen = new Map();
    function intent(e) {
      if (globalThis.navigator && globalThis.navigator.connection && globalThis.navigator.connection.saveData) return;
      var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      var key; try { key = resolveKey(new URL(a.href, location.href)); } catch (_) { return; }
      if (!key) return;
      if (Date.now() - since > 30000) { since = Date.now(); count = 0; seen.clear(); }
      if (count >= 3 || seen.has(key)) return;
      clearTimeout(timer);
      function warm() { if (seen.has(key)) return; seen.set(key, true); count++; Promise.resolve().then(function () { return load(key); }).catch(function () { seen.delete(key); }); }
      if (e.type === 'pointerover') timer = setTimeout(warm, 100); else warm();
    }
    function cancel() { clearTimeout(timer); }
    ['pointerover', 'pointerdown', 'focusin'].forEach(function (name) { doc.addEventListener(name, intent, { passive: true }); });
    doc.addEventListener('pointerout', cancel, { passive: true });
    return function () { cancel(); ['pointerover', 'pointerdown', 'focusin'].forEach(function (name) { doc.removeEventListener(name, intent); }); doc.removeEventListener('pointerout', cancel); };
  }

  /** Snapshot only the synchronous route start; slow data never holds a transition open. */
  function transition(update) {
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || !doc.startViewTransition || doc.visibilityState === 'hidden' || (globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches)) return update();
    var result, called = false;
    try {
      var view = doc.startViewTransition(function () { called = true; result = update(); if (result && result.catch) result.catch(function () {}); });
      if (view.ready && view.ready.catch) view.ready.catch(function () {});
      view.finished.catch(function () {});
      return view.updateCallbackDone.then(function () { return result; }, function () { return called ? result : update(); });
    } catch (e) { return called ? result : update(); }
  }

  /* Owner-Entscheidung 07.11.2026 (PLAN §11): Anbieter- und Fachquellen-Namen gehören nicht in die Produktseiten, sondern
     zentral auf /infos/#quellen („Datenquellen & Methodik“). Erzeugte Artefakte (z. B. supertrader/data/registry.json)
     tragen die Namen weiter für die Herkunftsprüfung; die Seiten neutralisieren sie nur in der Darstellung. Die Aussage
     „keine Regel des Traders, sondern eine Drittvariante“ bleibt erhalten, nur der Name wandert auf die Quellenseite. */
  var SOURCE_NAMES = [
    [/TraderFox['’] Variante/g, "die Drittvariante"],
    [/TraderFox['’] /g, "die "],
    [/TraderFox-Varianten?/g, "Drittvariante"],
    [/TraderFox-Beschreibung(en)?/g, function (m, pl) { return pl ? "Beschreibungen Dritter" : "Beschreibung eines Drittanbieters"; }],
    [/TraderFox-Beiträge(n)?/g, function (m, n) { return "Beiträge" + (n || "") + " eines Drittanbieters"; }],
    [/TraderFox-(Renditen|Angaben|Regeln|Regel|Marktampel|System)/g, function (m, w) { return w + " des Drittanbieters"; }],
    [/TraderFox\/aktien Magazin/g, "Drittanbieter"],
    [/TraderFox \/ /g, ""],
    [/TraderFox GmbH/g, "Drittanbieter"],
    [/(mobile\.)?traderfox\.de/gi, "Drittanbieter"],
    [/schreibt TraderFox/g, "schreibt ein Drittanbieter"],
    [/TraderFox schreibt/g, "ein Drittanbieter schreibt"],
    [/(die )?von TraderFox/g, function (m, d) { return (d || "") + "von einem Drittanbieter"; }],
    [/TraderFox nennt/g, "Der Drittanbieter nennt"],
    [/\bTraderFox\b/g, "Drittanbieter"],
    [/\bSEC-(?=[A-Za-zÄÖÜäöü])/g, ""]
  ];
  function neutralSourceText(t) {
    if (typeof t !== "string" || !/traderfox|\bSEC-/i.test(t)) return t;
    for (var i = 0; i < SOURCE_NAMES.length; i++) t = t.replace(SOURCE_NAMES[i][0], SOURCE_NAMES[i][1]);
    return t;
  }
  function neutralSources(v) {
    if (typeof v === "string") return neutralSourceText(v);
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) v[i] = neutralSources(v[i]); return v; }
    if (v && typeof v === "object") { for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) v[k] = neutralSources(v[k]); }
    return v;
  }

  /* ------------------------------------------------------------ Profil (Konzept Quant „Ein Profil je Aktie“, 08.11.2026)
     Sieben Eigenschaften, ein Wort je Eigenschaft, überall gleich (docs/design/quant-2026-11, Entscheidungen 1 und 2).
     Werte 0–100 (Rang unter den bewerteten US-Aktien) oder null = keine Daten. Keine Gesamtnote. */
  var PROFILE_KEYS = ["profitability", "growth", "quality", "momentum", "value", "risk", "revisions"];
  var PROFILE_LABEL = { profitability: "Verdient gut", growth: "Ist gewachsen", quality: "Gewinn gedeckt & stabil", momentum: "Kurs lief gut", value: "Preis im Branchenvergleich", risk: "Ruhig für die Branche", revisions: "Analysten" };
  var PROFILE_GLYPH = { profitability: "bars", growth: "pulse", quality: "check", momentum: "line", value: "target", risk: "wave", revisions: "person" };
  var STAGE_MARKS = [25, 45, 75, 90];
  /* Ein Faktor ohne einen einzigen Wert im Produktuniversum (Abdeckung 0, aus den veroeffentlichten Daten: bandSemantics.universe,
     von quant/api/product-services.js nach globalThis.VUFactorCoverage geschrieben) wird nicht gezeigt, bis er Werte hat (13.11.2026). */
  function profileOpen(k) { var c = typeof globalThis !== "undefined" ? globalThis.VUFactorCoverage : null; return !(c && c[k] === 0); }
  /** Stufe einer Eigenschaft: Sehr schwach < 25 ≤ Schwach < 45 ≤ Mittel < 75 ≤ Stark < 90 ≤ Sehr stark. */
  function profileStage(v) { return !isNum(v) ? "Keine Daten" : v >= 90 ? "Sehr stark" : v >= 75 ? "Stark" : v >= 45 ? "Mittel" : v >= 25 ? "Schwach" : "Sehr schwach"; }
  function profileStrong(v) { return isNum(v) && v >= 75; }
  function profileValue(values, k) { var v = values ? values[k] : null; return isNum(v) ? Math.max(0, Math.min(100, Math.round(v))) : null; }
  function profileAria(values, keys) {
    return "Profil: " + keys.map(function (k) { var v = profileValue(values, k); return PROFILE_LABEL[k] + " " + (v == null ? "keine Daten" : v); }).join(", ");
  }
  /** Profil klein: sechs Säulen in fester Reihenfolge (ohne Analysten), stark neongrün mit schwarzem Rand, fehlend gestrichelt. */
  function profileMini(values, o) {
    var x = o || {}, w = x.width || 66, h = x.height || 30, keys = PROFILE_KEYS.slice(0, 6), gap = 4, bw = (w - gap * (keys.length - 1)) / keys.length;
    return '<svg class="vu-pmini" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(x.label || profileAria(values, keys)) + '">' + keys.map(function (k, i) {
      var v = profileValue(values, k), bh = v == null ? 3 : Math.max(3, v / 100 * h), cls = v == null ? "is-na" : profileStrong(v) ? "is-hi" : "";
      return '<rect' + (cls ? ' class="' + cls + '"' : "") + ' x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (h - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2"/>';
    }).join("") + "</svg>";
  }
  /** Legende zum kleinen Profil: die sechs Wörter unter den Säulen. */
  function profileLegend() { return '<div class="vu-plg" aria-hidden="true">' + PROFILE_KEYS.slice(0, 6).map(function (k) { return "<span>" + esc(PROFILE_LABEL[k]) + "</span>"; }).join("") + "</div>"; }
  /** Profil groß: sieben Zeilen mit Symbol, Wort, Balken (Stufen-Marken 25 · 45 · 75 · 90), Zahl und Stufe. o.why: {key: Grund}. */
  function profileFull(values, o) {
    var x = o || {};
    return '<div class="vu-pf" role="list">' + PROFILE_KEYS.filter(profileOpen).map(function (k) {
      var v = profileValue(values, k), why = x.why && x.why[k];
      return '<div class="vu-pf-r' + (v == null ? " is-na" : "") + '" role="listitem"' + (v == null && why ? ' title="' + esc(why) + '"' : "") + ' data-key="' + k + '"><span class="vu-pf-l">' + glyph(PROFILE_GLYPH[k], 15) + esc(PROFILE_LABEL[k]) + "</span>" +
        '<span class="vu-pf-b" aria-hidden="true"><i class="' + (profileStrong(v) ? "is-hi" : "") + '" style="width:' + (v == null ? 0 : v) + '%"></i>' + STAGE_MARKS.map(function (m) { return '<em style="left:' + m + '%"></em>'; }).join("") + "</span>" +
        '<b class="vu-num">' + (v == null ? "–" : v) + "</b>" + (x.noStage ? "" : '<span class="vu-pf-s">' + esc(profileStage(v)) + "</span>") + "</div>";
    }).join("") + "</div>";
  }

  return Object.freeze({
    PROFILE: Object.freeze({ keys: PROFILE_KEYS, label: PROFILE_LABEL, glyph: PROFILE_GLYPH, marks: STAGE_MARKS, stage: profileStage, strong: profileStrong, open: profileOpen }),
    profileMini: profileMini, profileFull: profileFull, profileLegend: profileLegend,
    VERSION: VERSION, skeleton: skeleton, bindIntent: bindIntent, transition: transition, legal: legal, legalNotice: legalNotice, neutralSourceText: neutralSourceText, neutralSources: neutralSources, PERSPECTIVES: PERSPECTIVES, esc: esc, num: num, pct: pct, money: money,
    glyph: glyph, worldIcon: worldIcon, hud: hud, themeIcon: themeIcon, themeHud: themeHud, logo: logo,
    chg: chg, movementLabel: movementLabel, verdict: verdict, help: help, q: q,
    stockHead: stockHead, persp: persp, perspectiveHref: perspectiveHref,
    stockRow: stockRow, tile: tile, navcard: navcard, sect: sect, seg: seg, ranges: ranges,
    toggle: toggle, sheet: sheet, meter: meter, bars: bars, blank: blank, pro: pro, research: research, search: search,
    openSheet: openSheet, closeSheet: closeSheet, bindHelp: bindHelp,
    tap: tap, stat: stat, stats: stats, rail: rail, ring: ring, gauge: gauge, delta: delta, diverge: diverge, heat: heat, radar: radar, next: next,
    popup: popup, bindPops: bindPops
  });
});
