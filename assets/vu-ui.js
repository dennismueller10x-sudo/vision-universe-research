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

  var VERSION = "vu-ui-1.1.0";
  var SPRITE = "/assets/product-icons.svg#";
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
    book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
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

  /* ------------------------------------------------------------- C07, C08, C09 */
  /** C07 Kursbewegung: Plus neongrüne Pille ▲, Minus schwarze Pille ▼. */
  function chg(v, o) {
    var opt = o || {};
    if (!isNum(v)) return '<span class="vu-chg vu-chg--flat' + (opt.big ? " vu-chg--big" : "") + '">–</span>';
    var dir = v > 0 ? "" : v < 0 ? " vu-chg--down" : " vu-chg--flat";
    var arrow = v > 0 ? "▲" : v < 0 ? "▼" : "◆";
    return '<span class="vu-chg' + dir + (opt.big ? " vu-chg--big" : "") + '"><span aria-hidden="true">' + arrow + "</span> " + esc(pct(v, opt.digits)) + "</span>";
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
  function logo(ticker, o) {
    var opt = o || {}, t = String(ticker || "").slice(0, 5);
    var inner = opt.src ? '<img src="' + esc(opt.src) + '" alt="" loading="lazy" decoding="async">' : esc(t);
    return '<span class="vu-logo-tile' + (opt.xl ? " vu-logo-tile--xl" : "") + '" aria-hidden="true">' + inner + "</span>";
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
    return '<header class="vu-stockhead"><div class="vu-stockhead__top">' + back + logo(st.ticker, { src: st.logo }) +
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
    return '<div class="vu-sheet-backdrop" id="' + esc(id) + '" hidden><div class="vu-sheet-ui" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><h2 class="vu-mt">' + esc(title) + '</h2><div class="vu-sheet-body" style="margin-top:12px">' + (body || "") + "</div></div></div>";
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
        (i % 2 === (d.length - 1) % 2 ? '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (h + 14) + '" text-anchor="middle">' + esc(String(r[0]).slice(-2)) + "</text>" : "");
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

  /* ------------------------------------------------------------- Verhalten */
  /** Sheets öffnen/schließen (Escape, Tippen auf den Hintergrund). */
  function openSheet(el) {
    if (!el) return;
    el.hidden = false;
    var close = function (e) { if (!e || e.target === el || e.key === "Escape") closeSheet(el); };
    el.__vuClose = close;
    el.addEventListener("click", close);
    el.ownerDocument.addEventListener("keydown", close);
    var f = el.querySelector("button,a,[tabindex]"); if (f && f.focus) f.focus();
  }
  function closeSheet(el) {
    if (!el) return;
    el.hidden = true;
    if (el.__vuClose) { el.removeEventListener("click", el.__vuClose); el.ownerDocument.removeEventListener("keydown", el.__vuClose); el.__vuClose = null; }
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

  return Object.freeze({
    VERSION: VERSION, PERSPECTIVES: PERSPECTIVES, esc: esc, num: num, pct: pct, money: money,
    glyph: glyph, worldIcon: worldIcon, hud: hud, logo: logo,
    chg: chg, verdict: verdict, help: help, q: q,
    stockHead: stockHead, persp: persp, perspectiveHref: perspectiveHref,
    stockRow: stockRow, tile: tile, navcard: navcard, sect: sect, seg: seg, ranges: ranges,
    toggle: toggle, sheet: sheet, meter: meter, bars: bars, blank: blank, pro: pro, research: research, search: search,
    openSheet: openSheet, closeSheet: closeSheet, bindHelp: bindHelp
  });
});
