/* =========================================================================
   VISION UNIVERSE — assets/vu-stock-sheet.js     Aktien-Vorschau (App-Konzept 2)

   Prototyp „App-Konzept 2“ (Owner-Freigabe 14./15.11.2026), Fenster sh-stock
   und sh-vergleich: Ein Tipp auf eine Aktie öffnet von unten eine Vorschau –
   Logo, Name, Kürzel, Herz, Chart über die volle Breite, drei Urteile
   (Geschäft · Chart · Bewertung), „In diesen Modulen“, „Ganz öffnen“ und
   „Vergleichen“. Aussehen 1:1 nach dem Prototyp (assets/vu-stock-sheet.css).

   Nur Darstellung, keine eigene Rechnung. Quellen (fehlt eine, entfällt ihr Teil):
     Discover-Aktiendatei   /discover/data/stocks/US_REAL/<T>.json   Name, Geschäft, Bewertung, Ähnliche
     Kursreihe (ADR-002)    /quant/data/market/discover-series/<securityId>.json (core/identity.js#securityIdForTicker)
     Watchlist-Übersicht    /core/data/watchlist-summary-v1/ über core/watchlist-view.js (Kurs, Quant-Eigenschaften,
                            Trend, 52-Wochen-Hoch, Supertrader-Methoden, Fonds, Elliott – mit den Freigaben dieser Ansicht)

   VUStockSheet.open(ticker, {name, trigger})  öffnet die Vorschau (VUUI.popup); liefert Promise<boolean>
   VUStockSheet.bind(root)                     Klick-Delegation auf [data-vu-stock] (für eigene Seiten)
   VUStockSheet.model / .draw / .data          geteilt mit der Aktienseite /aktie/ (aktie/app.js)

   Browser: globalThis.VUStockSheet; Node (Tests): module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUStockSheet = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var VERSION = "vu-stock-sheet-2.0.0";
  var SPRITE = "/assets/product-icons.svg#";
  var US_TICKER = /^[A-Z0-9][A-Z0-9-]{0,11}$/;
  var WATCH_KEY = "vu-discover-watchlist-v1"; /* dieselbe lokale Liste wie Discover (discover/app.js) */

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v, d) { return isNum(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) : "–"; }
  function pct(v, d) { return isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v), d) + " %" : "–"; }
  var CUR = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF" };
  function money(v, cur) { return isNum(v) ? num(v, Math.abs(v) >= 1000 ? 0 : 2) + " " + (CUR[cur] || cur || "$") : "–"; }
  /** Große Beträge kurz: 215,9 Mrd. $ */
  function compact(v, cur) {
    if (!isNum(v)) return "–";
    var a = Math.abs(v), c = CUR[cur] || cur || "$";
    var t = a >= 1e12 ? [1e12, "Bio."] : a >= 1e9 ? [1e9, "Mrd."] : a >= 1e6 ? [1e6, "Mio."] : null;
    return t ? num(v / t[0], 1) + " " + t[1] + " " + c : num(v, 0) + " " + c;
  }
  function dateShort(iso) { return /^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : ""; }

  /* ------------------------------------------------------------- Grafiken
     Dieselben Zeichnungen wie im Prototyp (mock/kit.js: line, bars, ring; p1.js: radar), aber nur aus übergebenen Werten. */
  var gseq = 0;
  /** Kurslinie. values: Zahlen (mind. 2). o: fill, base (Startlinie), sw, dot, zones [{lo,hi,tone:"up"|"down"}]. */
  function line(values, w, h, o) {
    var v = (values || []).filter(isNum), opt = o || {};
    if (v.length < 2) return "";
    var zs = (opt.zones || []).filter(function (z) { return z && isNum(z.lo) && isNum(z.hi); });
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    if (opt.fit) zs.forEach(function (z) { mn = Math.min(mn, z.lo); mx = Math.max(mx, z.hi); });
    var Y = function (p) { return h - 4 - ((p - mn) / (mx - mn || 1)) * (h - 8); };
    var xy = v.map(function (p, i) { return [(i / (v.length - 1)) * w, Y(p)]; });
    var d = xy.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    var last = xy[xy.length - 1], id = "vsk-g" + (++gseq);
    var zones = zs.map(function (z) {
      var y1 = Math.max(0, Math.min(h, Y(z.hi))), y2 = Math.max(0, Math.min(h, Y(z.lo)));
      return y2 - y1 < 1 ? "" : '<rect class="k-zone k-zone--' + (z.tone === "up" ? "up" : "down") + '" x="0" y="' + y1.toFixed(1) + '" width="' + w + '" height="' + Math.max(3, y2 - y1).toFixed(1) + '"/>';
    }).join("");
    return '<svg class="k-line" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" style="display:block" aria-hidden="true" focusable="false">' +
      (opt.fill ? '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8f531" stop-opacity=".38"/><stop offset="1" stop-color="#c8f531" stop-opacity="0"/></linearGradient></defs><path d="' + d + "L" + w + " " + h + "L0 " + h + 'Z" fill="url(#' + id + ')"/>' : "") +
      (opt.base ? '<path class="k-line-base" d="M0 ' + xy[0][1].toFixed(1) + "H" + w + '" stroke-dasharray="3 4"/>' : "") + zones +
      '<path class="k-line-p" d="' + d + '" fill="none" stroke-width="' + (opt.sw || 2) + '" stroke-linejoin="round" stroke-linecap="round"/>' +
      (opt.dot === false ? "" : '<circle class="k-line-dot" cx="' + (last[0] - 1).toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4"/>') + "</svg>";
  }
  /** Säulen, letzte neongrün. */
  function bars(vals, w, h) {
    var v = (vals || []).filter(isNum);
    if (v.length < 2) return "";
    var mx = Math.max.apply(null, v.map(function (x) { return Math.max(0, x); })) || 1, bw = w / v.length;
    return '<svg class="k-bars" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true" focusable="false">' + v.map(function (x, i) {
      var bh = Math.max(2, Math.max(0, x) / mx * h);
      return '<rect' + (i === v.length - 1 ? ' class="is-last"' : "") + ' x="' + (i * bw + bw * 0.14).toFixed(1) + '" y="' + (h - bh).toFixed(1) + '" width="' + (bw * 0.72).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3"/>';
    }).join("") + "</svg>";
  }
  /** Netz aus sechs Werten 0–100 (fehlender Wert = Mitte). */
  function radar(values, s) {
    var v = values || [], n = v.length;
    if (n < 3) return "";
    var c = s / 2, R = s / 2 - 8;
    var pt = function (i, r) { return [c + r * Math.sin(i * 2 * Math.PI / n), c - r * Math.cos(i * 2 * Math.PI / n)].map(function (x) { return x.toFixed(1); }).join(","); };
    var poly = function (r) { return v.map(function (_, i) { return pt(i, r); }).join(" "); };
    return '<svg class="k-radar" width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + " " + s + '" aria-hidden="true" focusable="false"><polygon class="k-radar-g1" points="' + poly(R) + '"/><polygon class="k-radar-g" points="' + poly(R * 0.66) + '"/><polygon class="k-radar-g" points="' + poly(R * 0.33) + '"/>' +
      '<polygon class="k-radar-a" points="' + v.map(function (x, i) { return pt(i, R * (isNum(x) ? Math.max(0, Math.min(100, x)) : 0) / 100); }).join(" ") + '"/></svg>';
  }
  /** Ring mit Beschriftung in der Mitte. */
  function ring(p, size, sw, label) {
    var r = (size - sw) / 2, c = 2 * Math.PI * r, q = isNum(p) ? Math.max(0, Math.min(100, p)) : 0;
    return '<div class="k-ring" style="width:' + size + "px;height:" + size + 'px"><svg width="' + size + '" height="' + size + '" style="transform:rotate(-90deg)" aria-hidden="true"><circle class="k-ring-bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + sw + '"/>' +
      '<circle class="k-ring-on" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - q / 100)).toFixed(2) + '"/></svg>' +
      '<div class="k-ring-l" style="font-size:' + Math.round(size * 0.27) + 'px">' + esc(label == null ? "" : label) + "</div></div>";
  }
  /** Tagesbewegung als Pille. Owner 15.11.2026: rot bei Minus, neongrün bei Plus (wie assets/stock-navigator.css). */
  function move(changePct, big) {
    if (!isNum(changePct)) return "";
    var dir = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
    return '<span class="k-pill k-move k-move--' + dir + (big ? " k-move--big" : "") + '" role="img" aria-label="' + (changePct > 0 ? "Plus " : changePct < 0 ? "Minus " : "Unverändert ") + num(Math.abs(changePct), 2) + ' Prozent"><span aria-hidden="true">' + (dir === "up" ? "▲" : dir === "down" ? "▼" : "◆") + " " + esc(pct(changePct, 2)) + "</span></span>";
  }
  function icon(id, s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="' + SPRITE + esc(id) + '"/></svg>'; }
  var HEART = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.4C1.4 8 3.6 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.900 3-3 5-3 3.400 0 5.600 3.500 4.300 7.100C19.500 16.400 12 21 12 21z"/></svg>';
  var CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  function logo(ticker, cls) {
    var t = String(ticker || "");
    return '<span class="k-lg' + (cls ? " " + cls : "") + '" data-mono="' + esc(t.slice(0, 4)) + '"><img src="/discover/logos/files/' + encodeURIComponent(t) + '.png" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>';
  }

  /* --------------------------------------------------------------- Modell
     Wählt aus den Quellen die Aussagen der Vorschau und der Aktienseite. Jede Aussage nennt nur, was die Quelle trägt. */
  /* Stufen der Fundamentaldaten (discover/ui/overview.js#GRADE) und Trendwörter (konto/watchlist.js#TREND). */
  var GRADE = { "Sehr stark": "strong", "Stark": "strong", "Sehr solide": "strong", "Solide": "mid", "Mittel": "mid", "Flach": "weak", "Schwach": "weak", "Rückläufig": "weak", "Angespannt": "weak", "Knapp": "weak", "Negativ": "weak" };
  var TREND = { BULLISH: ["Aufwärtstrend", "strong"], BEARISH: ["Abwärtstrend", "weak"], MIXED: ["Gemischt", "mid"], RANGE: ["Seitwärts", "mid"] };
  var PROFILE_KEYS = ["profitability", "growth", "quality", "momentum", "value", "risk"];
  /* Wörter der sechs Eigenschaften: assets/vu-ui.js#PROFILE_LABEL (Test hält sie gleich). */
  var PROFILE_LABEL = { profitability: "Verdient gut", growth: "Ist gewachsen", quality: "Solide Bilanz & Gewinne", momentum: "Kurs lief gut", value: "Preis im Branchenvergleich", risk: "Ruhig für die Branche" };
  var STRONG = 75; /* assets/vu-ui.js#profileStrong */
  var TRACKS = [["revenue", "Umsatz"], ["net_income", "Gewinn"], ["free_cash_flow", "Cashflow"]];

  /* ---------------------------------------------- Lesarten der Module (Klickentwurf 17.11.2026)
     Kachel, Fenster, „In drei Sätzen“ und Modulseite sagen dasselbe: jede Aussage kommt aus derselben Quelle und mit
     derselben Regel wie auf der Modulseite. Die Tabellen sind Abschriften; products/aktie/tests/stock-sheet.test.mjs
     liest die Regeln aus den Moduldateien und hält sie gleich. */
  /* Fundamental: „Das Geschäft in einem Satz“ (fundamental/app.js#business) – zwei Stufen der Discover-Fundamentaldaten
     (Wachstum, Profitabilität), es zählt die schwächere. */
  var F_GRADE = { "Sehr stark": "strong", "Stark": "strong", "Sehr solide": "strong", "Solide": "mid", "Flach": "mid", "Knapp": "mid", "Belastet": "mid", "Rückläufig": "weak", "Negativ": "weak", "Angespannt": "weak" };
  var F_GROW = { "Sehr stark": "Wächst stark", "Stark": "Wächst", "Solide": "Wächst langsam", "Flach": "Wächst kaum", "Rückläufig": "Schrumpft" };
  var F_PROF = { "Sehr stark": "verdient sehr gut", "Stark": "verdient gut", "Solide": "verdient solide", "Knapp": "verdient knapp", "Negativ": "macht Verlust" };
  function businessVerdict(d) {
    var h = d && d.fundamentals && d.fundamentals.health;
    if (!h || !h.available || !Array.isArray(h.categories)) return null;
    var by = {}; h.categories.forEach(function (c) { if (c && c.id) by[c.id] = c; });
    var g = by.growth, p = by.profitability;
    if (!g || !p || !F_GROW[g.grade] || !F_PROF[p.grade]) return null;
    var rank = { strong: 2, mid: 1, weak: 0 }, kg = F_GRADE[g.grade], kp = F_GRADE[p.grade], worse = rank[kg] <= rank[kp] ? g : p;
    return { text: F_GROW[g.grade] + " und " + F_PROF[p.grade], kind: F_GRADE[worse.grade], label: worse.grade };
  }
  /* Technical: Urteil der Aktienseite /technical/#/chart/<T> (technical/app.js#chartSummary): Kurs über SMA 50 und 200.
     Gelesen aus dem Technical-Stand je Aktie (technical/data/stock/<Schlüssel>.json, Felder trend[0] = aboveSma50,
     trend[1] = aboveSma200; technical/engine/stock-summary.js#TREND). Steht der Kurs still (frozenSince), keine Aussage. */
  function chartSummary(aboveSma50, aboveSma200) {
    if (typeof aboveSma50 !== "boolean" || typeof aboveSma200 !== "boolean") return ["Keine Aussage zum Trend", "none"];
    if (aboveSma200 && aboveSma50) return ["Aufwärtstrend intakt", "strong"];
    if (aboveSma200) return ["Rücksetzer im Aufwärtstrend", "mid"];
    if (aboveSma50) return ["Erholung im Abwärtstrend", "mid"];
    return ["Abwärtstrend", "weak"];
  }
  function techVerdict(t) {
    if (!t || !Array.isArray(t.trend)) return null;
    if (t.frozenSince) return ["Keine Aussage zum Trend", "none"];
    return chartSummary(t.trend[0], t.trend[1]);
  }
  /* Supertrader: „Supertrader in drei Sätzen“ der Aktienseite (supertrader/assets/st-redesign.js#stock) aus
     sf-candidates/ticker/<Schlüssel>.json – je Methode die höchste Stufe; Namen aus supertrader/assets/st-names.js. */
  var ST_STAGES = ["CHART_CANDIDATE", "CONFIRMED_RESEARCH_SETUP", "MODELED_TRADE_PLAN"];
  var ST_STAGE_TXT = { CHART_CANDIDATE: "Muster erkannt", CONFIRMED_RESEARCH_SETUP: "Regel erfüllt", MODELED_TRADE_PLAN: "Plan fertig" };
  function supertraderOf(sf, names, ticker) {
    if (!sf || !Array.isArray(sf.views)) return null;
    var hit = {}, views = {};
    sf.views.forEach(function (v) { if (!v || v.ticker !== ticker || !v.candidateId) return; if (!hit[v.candidateId] || ST_STAGES.indexOf(v.stage) > ST_STAGES.indexOf(hit[v.candidateId])) { hit[v.candidateId] = v.stage; views[v.candidateId] = v; } });
    var total = names && Array.isArray(names.ORDER) ? names.ORDER.length : null;
    var ids = Object.keys(hit).sort(function (a, b) { return ST_STAGES.indexOf(hit[b]) - ST_STAGES.indexOf(hit[a]) || (names && names.ORDER ? names.ORDER.indexOf(a) - names.ORDER.indexOf(b) : a < b ? -1 : 1); });
    return { count: ids.length, total: total, asOf: sf.asOf || null,
      entries: ids.map(function (c) { return { id: c, name: names && names.name ? names.name(c, c) : c, stage: hit[c], stageText: ST_STAGE_TXT[hit[c]] || "", met: views[c].met || [], notMet: views[c].notMet || [], pending: views[c].pending || [] }; }) };
  }
  /* Elliott: „Zählbar“ wie die Aktienseite /elliott/#/<T> (quant/app/page-chartbild.js#ewCountable) – dieselbe Einstufung
     wie „Heute anwendbar“ im Wellen-Index (elliott-home.json, applicable.rows). Ohne Eintrag: „Keine Zählung“. */
  function elliottOf(ew, ticker, model) {
    var a = ew && ew.applicable;
    if (!a || !Array.isArray(a.rows)) return null;
    var row = a.rows.filter(function (r) { return r && r.t === ticker; })[0] || null, share = { count: a.count, n: a.n, asOf: a.asOf || null };
    if (!row) return { countable: false, word: "Keine Zählung", share: share };
    var parts = String(row.el || "").split(":"), done = parts[1] === "done";
    var pattern = model && model.patternDe ? model.patternDe(row.el) : parts[0];
    return { countable: true, wave: done ? null : parts[1] || null, done: done, pattern: pattern, line: model && model.countLine ? model.countLine(row) : pattern,
      direction: row.dir === "BULLISH" ? "UP" : row.dir === "BEARISH" ? "DOWN" : null, invalid: model && model.invalidLine ? model.invalidLine(row) : null,
      word: done ? pattern + " abgeschlossen" : "Welle " + (parts[1] || "–"), share: share };
  }
  /* Kurzname der Überschrift (nur Darstellung) – dieselbe Regel wie der Modul-Aktienkopf (assets/stock-navigator.js#shortName;
     der Test hält beide gleich): Rechtsform, Aktiengattung und allgemeine Zusätze am Ende fallen weg, solange ein Wort bleibt. */
  var LEGAL = /,?\s+(Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|Limited|plc|PLC|N\.V\.|S\.A\.|SE|AG|LP|L\.P\.|Holdings?|Group|Class [A-Z]|Cl [A-Z]|Ordinary Shares?|Common Stock|ADR|\(The\)|The)$/i;
  var GENERIC = /\s+(Interactive|Software|Technologies|Technology|Platforms|Systems|International|Enterprises|Industries)$/i;
  function stripLegal(name) { var s = String(name || "").replace(/\s+/g, " ").trim(), prev; do { prev = s; s = s.replace(LEGAL, "").trim(); } while (s !== prev && s); return s; }
  function shortName(name) {
    var s = stripLegal(name), prev;
    do { prev = s; if (s.indexOf(" ") > 0) s = s.replace(GENERIC, "").trim(); } while (s !== prev && s.indexOf(" ") > 0);
    return s || String(name || "").trim();
  }
  /** Rest des vollen Namens nach dem Kurznamen („Interactive Software“), leer, wenn nichts bleibt. */
  function nameRest(name, short) { var f = stripLegal(name); return f && f !== short ? (f.indexOf(short + " ") === 0 ? f.slice(short.length + 1) : f) : ""; }
  /** Zustand eines Moduls im Verfügbarkeits-Ausschnitt (core/stock-context.js#moduleState) oder null ohne Ausschnitt. */
  function availState(avail, product, ticker) {
    var SC = root.VUCore && root.VUCore.StockContext;
    if (!avail || !SC) return null;
    try { return SC.moduleState(SC.fromUs(ticker), product, avail).state; } catch (e) { return null; }
  }

  /** Bewertung gegen den Marktmedian (discover/ui/overview.js#bewertungsUrteil; Regel in valuation.context.rule). */
  function valuationWord(v) {
    var r = v && v.relative;
    if (!r || !r.stufe) return null;
    if (r.stufe === "hoch") return ["Teurer als der Markt", "weak"];
    if (r.stufe === "niedrig" || r.stufe === "guenstig") return ["Günstiger als der Markt", "strong"];
    return ["Wie der Markt", "mid"];
  }
  /** Fonds-Bewegung (hedgefonds/app.js#balanceVerdict: ab 60 % Käufe „Mehr Käufer“, bis 40 % „Mehr Verkäufer“). */
  function balance(b, s) {
    var n = (b || 0) + (s || 0);
    if (!isNum(b) || !isNum(s) || !n) return null;
    var r = b / n;
    return r >= 0.6 ? ["Mehr Käufer", "strong"] : r <= 0.4 ? ["Mehr Verkäufer", "weak"] : ["Ausgeglichen", "mid"];
  }
  function track(detail, id) {
    var t = detail && detail.fundamentals && detail.fundamentals.journey && detail.fundamentals.journey.available && detail.fundamentals.journey.tracks;
    return ((t && t[id]) || []).filter(function (x) { return x && isNum(x.v); });
  }
  function profileOf(watch) {
    var q = watch && watch.quant;
    if (!q || q.state !== "AVAILABLE") return null;
    var out = {}, any = false;
    (q.factors || []).forEach(function (f) { if (PROFILE_KEYS.indexOf(f.id) >= 0) { out[f.id] = f.state === "AVAILABLE" && isNum(f.score) ? Math.round(f.score) : null; if (out[f.id] != null) any = true; } });
    return any ? out : null;
  }

  /**
   * Ansicht einer Aktie. src: {ticker, name?, detail (Discover-Aktiendatei), watch (WatchlistView.view),
   * tech (Eintrag aus technical/data/stock/<Schlüssel>.json), sf (supertrader/data/sf-candidates/ticker/<Schlüssel>.json), stNames (STNames),
   * ew (quant/data/technical-intelligence/v3/elliott-home.json), ewModel (VUElliottHome), avail (core/data/stock-availability/<Schlüssel>.json),
   * hedge (Eintrag aus hedgefonds/data/stocks), articles (insights/artikel.json#artikel)}.
   */
  function summarize(src) {
    var s = src || {}, d = s.detail || null, w = s.watch || null, t = String(s.ticker || (d && d.symbol) || "").toUpperCase();
    var f = (d && d.fundamentals) || {}, m = (d && d.metrics) || {};
    var out = { ticker: t, name: (d && d.companyName) || (w && w.name) || s.name || t, what: (d && d.was) || "", asOf: {} };
    var enc = encodeURIComponent(t);
    out.short = shortName(out.name); out.rest = nameRest(out.name, out.short);
    out.href = "/aktie/#/" + enc;

    /* Kurs: veröffentlichter Schluss der Übersicht (published-close.js, ADR-002); sonst der Kurs der Discover-Datei. */
    if (w && w.price && w.price.state === "AVAILABLE" && isNum(w.price.close)) out.price = { value: w.price.close, currency: w.price.currency || "USD", changePct: isNum(w.price.change) ? w.price.change * 100 : null, date: w.price.date || null };
    else if (d && d.price && isNum(d.price.value)) out.price = { value: d.price.value, currency: "USD", changePct: d.changePercent && isNum(d.changePercent.value) ? d.changePercent.value : null, date: d.asOf || null };
    if (out.price && out.price.date) out.asOf.kurs = out.price.date;

    /* Urteil Geschäft */
    /* Urteil Geschäft = Urteil der Fundamental-Seite (businessVerdict), Satz dazu wie dort („Wächst und macht Verlust.“). */
    var bz = businessVerdict(d), rev = track(d, "revenue"), g = (d && d.geschaeftszahlen) || {};
    if (bz) {
      out.business = { word: bz.label, tone: bz.kind, text: bz.text, series: rev.slice(-10).map(function (x) { return x.v; }),
        sentence: bz.text + "." + (isNum(g.umsatzWachstum) ? " Umsatz " + pct(g.umsatzWachstum * 100, 0) + " in zwölf Monaten." : "") };
      if (f.asOf) out.asOf.zahlen = f.asOf;
    }
    /* Urteil Chart/Kurs: Trend aus der Technik-Übersicht; sonst die Marktstruktur der Discover-Datei (dieselbe Technik-Quelle). */
    /* Urteil Kurs = Urteil der Technical-Seite (techVerdict aus dem Technical-Stand je Aktie). */
    var ti = d && d.technicalIntelligence && d.technicalIntelligence.available && d.technicalIntelligence.layers || {};
    var tv = techVerdict(s.tech), js = d && d.jahresspanne;
    if (tv) {
      var dist = isNum(m.distanceTo52wHigh) ? m.distanceTo52wHigh : w && w.high52 && isNum(w.high52.distance) ? w.high52.distance : null;
      out.chart = { word: tv[0], tone: tv[1],
        sentence: w && w.high52 && w.high52.signal === "NEW_HIGH" ? "Neues Hoch der letzten zwölf Monate." : isNum(dist) ? num(Math.abs(dist) * 100, 0) + " % unter dem Jahreshoch." : js && js.satz ? js.satz : "" };
    }
    /* Urteil Bewertung */
    var vw = valuationWord(f.valuation);
    if (vw && f.valuation.pe && isNum(f.valuation.pe.value)) {
      var med = f.valuation.relative.peMedian;
      out.valuation = { word: vw[0], tone: vw[1], pe: f.valuation.pe.value, median: isNum(med) ? med : null,
        sentence: "KGV " + num(f.valuation.pe.value, 1) + (isNum(med) ? ", Markt " + num(med, 1) + "." : ".") };
    }

    /* Module. Eine Kachel nur, wenn die Quelle der Modulseite vorliegt; das Wort ist das Urteil der Modulseite. */
    var mod = out.modules = {};
    if (bz || (f.health && f.health.available) || rev.length) mod.fundamental = { word: bz ? bz.label : "Kein Urteil", tone: bz ? bz.kind : "none", text: bz ? bz.text : null, series: rev.slice(-10).map(function (x) { return x.v; }), href: "/fundamental/#/" + enc };
    var profile = profileOf(w);
    if (profile) {
      var have = PROFILE_KEYS.filter(function (k) { return profile[k] != null; }), strong = have.filter(function (k) { return profile[k] >= STRONG; }).length;
      mod.quant = { profile: profile, strong: strong, of: have.length, word: strong + " von " + have.length + " stark", href: "/quant/#/aktie/" + enc };
      if (w.quant.asOf) out.asOf.quant = w.quant.asOf;
    }
    if (tv) {
      var sr = ti.supportResistance && ti.supportResistance.status === "available" ? ti.supportResistance : null, zone = function (z, tone) { return z && isNum(z.zoneLow) && isNum(z.zoneHigh) ? { lo: z.zoneLow, hi: z.zoneHigh, tone: tone } : null; };
      mod.technical = { word: tv[0], tone: tv[1], support: zone(sr && sr.nearestSupport, "up"), resistance: zone(sr && sr.nearestResistance, "down"),
        sma200: d && d.rawValues && isNum(d.rawValues.distanceToSMA200) ? d.rawValues.distanceToSMA200 : null, rsi: w && w.trend && isNum(w.trend.rsi14) ? w.trend.rsi14 : null,
        high: w && w.high52 && w.high52.state === "AVAILABLE" ? w.high52.signal : null, asOf: s.tech && s.tech.asOf || null, href: "/technical/#/chart/" + enc };
    }
    /* Supertrader: die 13 Methoden der Aktienseite; eine Kachel bei Treffern oder belegter Seite (auch „Keine der 13“). */
    var stv = supertraderOf(s.sf, s.stNames, t), stState = availState(s.avail, "supertrader", t);
    if (stv && (stv.count > 0 || stState === "available")) {
      var tot = stv.total;
      mod.supertrader = { count: stv.count, total: tot, entries: stv.entries, asOf: stv.asOf,
        word: stv.count ? stv.count + (tot ? " von " + tot : "") + (stv.count === 1 && !tot ? " Methode" : " Methoden") : tot ? "Keine der " + tot : "Keine Methode",
        href: stState === "available" ? "/supertrader/stock/" + enc + "/" : "/supertrader/stock/?s=" + enc };
      if (stv.asOf) out.asOf.supertrader = stv.asOf;
    }
    var h = s.hedge || null, funds = w && w.funds13f && w.funds13f.state === "AVAILABLE" ? w.funds13f : null;
    if (h || funds) {
      var bal = h ? balance(h.buyers, h.sellersCount) : null;
      mod.hedgefonds = { funds: h && isNum(h.fundCount) ? h.fundCount : funds ? funds.holders : null, stars: h && isNum(h.starCount) ? h.starCount : null,
        buyers: h && isNum(h.buyers) ? h.buyers : null, sellers: h && isNum(h.sellersCount) ? h.sellersCount : null, fresh: funds ? funds.newPositions.length : null,
        word: bal ? bal[0] : null, tone: bal ? bal[1] : "mid", period: funds ? funds.period : null, href: "/hedgefonds/#/aktie/" + enc };
      if (mod.hedgefonds.funds == null) delete mod.hedgefonds;
      else if (funds && funds.period) out.asOf.fonds = funds.period;
    }
    /* Elliott: „Zählbar“ wie die Aktienseite; „Keine Zählung“ nur für Aktien, die das Wellenbild führt. */
    var ev = elliottOf(s.ew, t, s.ewModel), ewState = availState(s.avail, "technik", t);
    if (ev && (ev.countable || ewState === "available")) { ev.href = "/elliott/#/" + enc; mod.elliott = ev; }
    var ranks = ((d && d.memberships) || []).filter(function (x) { return isNum(x.rank) && isNum(x.of) && x.rowId !== "sector-leaders"; }).sort(function (a, b) { return a.rank - b.rank || a.rank / a.of - b.rank / b.of; });
    if (d) {
      /* Discover-Fenster: die Story der Discover-Seite. „Geschäft“ ist wie dort (discover/ui/overview.js#businessVerdict) das
         Fundamental-Urteil, „Kurs“ bleibt Discovers hochUrteil. */
      var dg = f.health && f.health.available && (f.health.categories || []).filter(function (c) { return c.id === "growth"; })[0], dst = f.story && f.story.available && (f.story.statements || [])[0];
      var bz0 = businessVerdict(d);
      var dk = isNum(m.distanceTo52wHigh) ? (m.distanceTo52wHigh <= -0.20 ? ["weak", "Schwächer"] : m.distanceTo52wHigh >= -0.05 ? ["strong", "Nah am Hoch"] : ["mid", "Dazwischen"]) : null;
      mod.discover = { rows: ranks.length, best: ranks[0] ? { rank: ranks[0].rank, title: ranks[0].title } : null, ranks: ranks.slice(0, 4).map(function (x) { return { rank: x.rank, of: x.of, title: x.title }; }),
        story: { business: (bz0 || (dg && dst && dst.text)) ? { word: bz0 ? bz0.label : dg.grade, tone: bz0 ? bz0.kind : null, text: [bz0 ? bz0.text + "." : "", (dst && dst.text) || ""].filter(Boolean).join(" ") } : null, price: dk && js && js.zumHoch ? { word: dk[1], text: "Der Kurs liegt " + String(js.zumHoch).replace(/^[−-]/, "") + " unter dem Hoch der letzten 12 Monate." } : null },
        href: "/discover/#/s/US_REAL/" + enc };
    }

    /* Pillen „In diesen Modulen“: nur, was es für die Aktie gibt. */
    var pills = out.pills = [];
    if (mod.quant) pills.push({ icon: "quant", text: mod.quant.word, href: mod.quant.href });
    if (mod.supertrader && mod.supertrader.count > 0) pills.push({ icon: "supertrader", text: mod.supertrader.word, href: mod.supertrader.href });
    if (mod.technical && mod.technical.high === "NEW_HIGH") pills.push({ icon: "technical", text: "Jahreshoch", href: mod.technical.href });
    else if (mod.technical && mod.technical.high === "NEAR_HIGH") pills.push({ icon: "technical", text: "Nah am Jahreshoch", href: mod.technical.href });
    if (mod.hedgefonds) pills.push({ icon: "hedgefonds", text: mod.hedgefonds.buyers != null ? num(mod.hedgefonds.buyers, 0) + " Käufe" : mod.hedgefonds.fresh ? mod.hedgefonds.fresh + (mod.hedgefonds.fresh === 1 ? " neue Position" : " neue Positionen") : num(mod.hedgefonds.funds, 0) + " Fonds", href: mod.hedgefonds.href });
    if (mod.elliott && mod.elliott.countable) pills.push({ icon: "elliott", text: mod.elliott.word, href: mod.elliott.href });

    /* Das Geschäft: Umsatz, Gewinn, Cashflow je Geschäftsjahr */
    out.tracks = TRACKS.map(function (tr) {
      var p = track(d, tr[0]).slice(-10);
      if (p.length < 2) return null;
      var a = p[p.length - 2], b = p[p.length - 1];
      return { id: tr[0], label: tr[1], value: b.v, fy: b.fy, from: p[0].fy, growthPct: a.v > 0 ? (b.v / a.v - 1) * 100 : null, points: p.map(function (x) { return { fy: x.fy, v: x.v }; }) };
    }).filter(Boolean);
    /* Kennzahlen des Fensters Fundamental */
    out.facts = [];
    if (g.status === "CALCULATED" && isNum(g.umsatzTTM) && g.einheit === "usd_m") out.facts.push({ label: "Umsatz 12 Monate", value: compact(g.umsatzTTM * 1e6, "USD"), grade: "", tone: "mid" });
    ((f.health && f.health.available && f.health.categories) || []).forEach(function (c) {
      var yrs = f.health.horizon && f.health.horizon.years, label = { growth: "Umsatzwachstum pro Jahr" + (yrs ? " (" + yrs + " Jahre)" : ""), profitability: "Nettomarge", cashflow: "Free-Cashflow-Marge", balance: "Bilanz" }[c.id] || c.label;
      out.facts.push({ label: label, value: isNum(c.value) && c.id !== "balance" ? (c.id === "growth" ? pct(c.value * 100, 1) : num(c.value * 100, 1) + " %") : "", grade: c.grade, tone: F_GRADE[c.grade] || GRADE[c.grade] || "mid" });
    });
    if (out.valuation) out.facts.push({ label: "KGV", value: num(out.valuation.pe, 1), grade: out.valuation.word, tone: out.valuation.tone });
    if (f.valuation && f.valuation.ps && isNum(f.valuation.ps.value)) out.facts.push({ label: "KUV", value: num(f.valuation.ps.value, 1), grade: "", tone: "mid" });
    out.fiscalYear = f.latestFiscalYear || null;

    /* Mehr wie … (Discover: ähnliche Aktien) */
    var sim = d && d.discoverNext && d.discoverNext.similar && d.discoverNext.similar.cards || [];
    out.similar = sim.filter(function (c) { return c && US_TICKER.test(String(c.symbol || "")); }).slice(0, 8).map(function (c) {
      return { ticker: c.symbol, name: c.companyName || c.symbol, path: (c.performancePath || []).map(function (p) { return p.value; }).filter(isNum), return12M: c.metrics && isNum(c.metrics.return12M) ? c.metrics.return12M * 100 : null };
    });
    /* Aus den News: Artikel, die das Kürzel führen */
    out.news = (s.articles || []).filter(function (a) { return a && Array.isArray(a.ticker) && a.ticker.indexOf(t) >= 0 && a.href && a.titel; }).slice(0, 6)
      .map(function (a) { return { title: a.titel, tag: a.rubrik || "", image: a.bild || null, href: a.href }; });
    return out;
  }

  /** Vergleich zweier Profile: je Eigenschaft beide Werte und wer vorn liegt. Nur Eigenschaften, die beide tragen. */
  function compare(a, b) {
    if (!a || !b) return null;
    var rows = PROFILE_KEYS.filter(function (k) { return isNum(a[k]) && isNum(b[k]); }).map(function (k) { return { key: k, label: PROFILE_LABEL[k], a: a[k], b: b[k] }; });
    if (!rows.length) return null;
    return { rows: rows, aWins: rows.filter(function (r) { return r.a > r.b; }).length, bWins: rows.filter(function (r) { return r.b > r.a; }).length, of: rows.length };
  }

  /* ------------------------------------------------------------- Markup */
  function previewHtml(v, o) {
    var opt = o || {}, cards = [];
    if (v.business) cards.push(["Geschäft", v.business]);
    if (v.chart) cards.push(["Chart", v.chart]);
    if (v.valuation) cards.push(["Bewertung", v.valuation]);
    return '<div class="k-fl k-g12">' + logo(v.ticker, "b") + '<div class="k-f1"><h2 class="k-h2" style="font-size:24px">' + esc(v.name) + '</h2><div class="k-sm k-mut">' + esc(v.ticker) + "</div></div>" +
      '<button type="button" class="k-rnd k-tap k-heart" data-vsk-heart="' + esc(v.ticker) + '" aria-pressed="' + (opt.saved ? "true" : "false") + '" aria-label="' + esc(v.ticker) + ' merken" style="width:44px;height:44px">' + HEART + "</button></div>" +
      '<div class="k-bleed" data-vsk-chart style="margin-top:12px">' + (opt.values ? line(opt.values, opt.width || 430, 130, { fill: true, base: true, sw: 2.2 }) : "") + "</div>" +
      (cards.length ? '<div class="k-fl k-g6 k-mt12" style="align-items:stretch">' + cards.map(function (c) {
        return '<div class="k-f1 k-card" style="padding:10px;border-radius:16px"><div class="k-xs k-mut k-b7">' + c[0] + '</div><div class="k-sm k-b8 k-mt4' + (c[1].tone === "strong" ? " k-lc" : "") + '" style="line-height:1.1">' + esc(c[1].word) + "</div></div>";
      }).join("") + "</div>" : "") +
      (v.pills.length ? '<div class="k-eb k-mt16">In diesen Modulen</div><div class="k-fl k-g6 k-wr k-mt8">' + v.pills.map(function (p) {
        return '<a class="k-pill dk k-tap" style="height:32px" href="' + esc(p.href) + '">' + icon(p.icon, 15) + " " + esc(p.text) + "</a>";
      }).join("") + "</div>" : "") +
      '<div class="k-fl k-g8 k-mt16"><a class="k-btn k-f1 k-tap" href="' + esc(v.href) + '" data-vsk-open>Ganz öffnen</a>' +
      (opt.compare ? '<button type="button" class="k-btn ol k-f1 k-tap" data-vsk-compare>Vergleichen</button>' : "") + "</div>" +
      (v.price && v.price.date ? '<p class="k-xs k-mut k-mt8" style="text-align:center">Schluss ' + esc(dateShort(v.price.date)) + " · keine Empfehlung</p>" : "");
  }
  function compareHtml(a, b, c) {
    return '<div class="k-fl k-sb" style="align-items:flex-start"><div class="k-col k-g6" style="align-items:center;width:120px">' + logo(a.ticker, "b") + '<b style="text-align:center">' + esc(a.name) + '</b></div><div class="k-num k-mut" style="font-size:22px;margin-top:18px">VS</div><div class="k-col k-g6" style="align-items:center;width:120px">' + logo(b.ticker, "b") + '<b style="text-align:center">' + esc(b.name) + "</b></div></div>" +
      c.rows.map(function (r) {
        return '<div style="padding:7px 0"><div class="k-fl k-sb k-xs k-b7 k-mut"><span class="' + (r.a > r.b ? "k-lc" : "") + '">' + r.a + "</span><span>" + esc(r.label) + '</span><span class="' + (r.b > r.a ? "k-lc" : "") + '">' + r.b + "</span></div>" +
          '<div class="k-fl k-g4 k-mt4"><div class="k-bar ' + (r.a > r.b ? "l " : "") + 'k-f1" style="transform:scaleX(-1)"><i style="width:' + r.a + '%"></i></div><div class="k-bar ' + (r.b > r.a ? "l " : "") + 'k-f1"><i style="width:' + r.b + '%"></i></div></div></div>';
      }).join("") +
      '<div class="k-fl k-sb k-mt8 k-g6"><span class="k-pill" style="min-width:0;flex:0 1 auto;overflow:hidden">' + esc(a.ticker) + " vorn: " + c.aWins + " von " + c.of + '</span><span class="k-pill dk" style="min-width:0;flex:0 1 auto;overflow:hidden">' + esc(b.ticker) + " vorn: " + c.bWins + " von " + c.of + "</span></div>" +
      '<a class="k-btn ol k-mt16 k-tap" href="/quant/#/vergleich/' + encodeURIComponent(a.ticker) + "," + encodeURIComponent(b.ticker) + '">Mehr vergleichen in Quant</a>' +
      '<p class="k-xs k-mut k-mt8">Werte 0–100: Rang unter den bewerteten US-Aktien. Vergleich von Eigenschaften, keine Empfehlung.</p>';
  }

  /* ---------------------------------------------------------------- Daten */
  var cache = {};
  function getJSON(path) {
    if (!cache[path]) {
      cache[path] = root.fetch(path, { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      cache[path].then(function (v) { if (!v) delete cache[path]; });
    }
    return cache[path];
  }
  var scripts = {};
  function script(src) {
    var doc = root.document;
    if (!scripts[src]) scripts[src] = new Promise(function (done) {
      var s = doc.createElement("script"); s.src = src; s.async = false;
      s.onload = function () { done(true); }; s.onerror = function () { done(false); };
      doc.head.appendChild(s);
    });
    return scripts[src];
  }
  function css(href) {
    var doc = root.document;
    if (doc.querySelector('link[rel=stylesheet][href^="' + href + '"]')) return;
    var l = doc.createElement("link"); l.rel = "stylesheet"; l.href = href; doc.head.appendChild(l);
  }
  /** Lädt, was fehlt (die Vorschau wird vom Rahmen bei Bedarf nachgeladen und bringt ihre Abhängigkeiten selbst mit). */
  function ready() {
    css("/assets/vu-ui.css"); css("/assets/vu-stock-sheet.css");
    var C = function () { return root.VUCore || {}; };
    return (C().Identity ? Promise.resolve() : script("/core/identity.js"))
      .then(function () { return C().StockContext ? null : script("/core/stock-context.js"); })
      .then(function () { return Promise.all([C().WatchlistView ? null : script("/core/watchlist-view.js"), root.VUUI ? null : script("/assets/vu-ui.js")]); });
  }
  function ident() { return root.VUCore && root.VUCore.Identity; }
  var watchMeta = null;
  /** Ansicht der Watchlist-Übersicht für ein Kürzel: {view, strategies} oder null (Übersicht nicht ausgeliefert, Kürzel unbekannt). */
  function loadWatch(ticker) {
    var WV = root.VUCore && root.VUCore.WatchlistView, Id = ident();
    if (!WV || !Id) return Promise.resolve(null);
    var fetchJson = function (p) { return getJSON(p).then(function (j) { if (!j) throw new Error("MISSING"); return j; }); };
    return WV.load(fetchJson, [Id.shardKey(ticker)], watchMeta).then(function (r) {
      watchMeta = r.meta;
      var ix = WV.index(r.doc), id = ix.resolveTicker(ticker);
      if (!id) return null;
      var st = r.meta.sources && r.meta.sources.supertrader && r.meta.sources.supertrader.strategies;
      return { view: WV.view(ix, { instrumentId: id }), strategies: st ? Object.keys(st).length : null, meta: r.meta };
    }).catch(function () { return null; });
  }
  function seriesPath(ticker, long) { return "/quant/data/market/discover-series" + (long ? "-long" : "") + "/" + ident().securityIdForTicker(ticker) + ".json"; }
  /** Punkte [[Datum, Schluss]] der kanonischen Reihe (ein Jahr Tagesschlüsse; long: Wochenschlüsse seit Beginn). */
  function loadSeries(ticker, long) {
    return getJSON(seriesPath(ticker, long)).then(function (s) {
      return s && s.status === "CALCULATED" && Array.isArray(s.points) ? s.points.filter(function (p) { return p && typeof p[0] === "string" && isNum(p[1]); }) : [];
    });
  }
  function loadDetail(ticker) { return getJSON("/discover/data/stocks/US_REAL/" + encodeURIComponent(ticker) + ".json"); }
  /* Quellen der Modulseiten (dieselben Dateien, die die Module lesen; je Aktie ein kleiner Ausschnitt, der Wellen-Index einmal). */
  var EW_INDEX = "/quant/data/technical-intelligence/v3/elliott-home.json";
  function shard(ticker) { var I = ident(); return I ? I.shardKey(ticker) : String(ticker).slice(0, 2); }
  function loadTech(ticker) { return getJSON("/technical/data/stock/" + shard(ticker) + ".json").then(function (j) { var x = j && j.stocks && j.stocks[ticker]; return x || null; }); }
  function loadSf(ticker) { return Promise.all([getJSON("/supertrader/data/sf-candidates/ticker/" + shard(ticker) + ".json"), root.STNames ? null : script("/supertrader/assets/st-names.js")]).then(function (r) { return r[0] ? { views: (r[0].views || []).filter(function (v) { return v && v.ticker === ticker; }), asOf: r[0].asOf || null } : null; }); }
  function loadEw() { return Promise.all([getJSON(EW_INDEX), root.VUElliottHome ? null : script("/elliott/engine/home-model.js")]).then(function (r) { return r[0]; }); }
  function loadAvail(ticker) { var SC = root.VUCore && root.VUCore.StockContext; try { return SC ? getJSON(SC.availabilityUrl(SC.fromUs(ticker))) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } }
  /** Alles für die Vorschau und die Aktienseite. */
  function load(ticker, o) {
    return ready().then(function () {
      return Promise.all([loadDetail(ticker), loadWatch(ticker), loadTech(ticker), loadSf(ticker), loadEw(), loadAvail(ticker)]);
    }).then(function (r) {
      return { ticker: ticker, name: o && o.name, detail: r[0], watch: r[1] && r[1].view, strategies: r[1] && r[1].strategies, meta: r[1] && r[1].meta,
        tech: r[2], sf: r[3], stNames: root.STNames || null, ew: r[4], ewModel: root.VUElliottHome || null, avail: r[5] };
    });
  }

  /* ------------------------------------------------------------ Merkliste
     Wie Discover: lokale Liste, angemeldet gekoppelt an die Konto-Watchlist (assets/watchlist-button.js#couple). */
  function localList() { try { var a = JSON.parse(root.localStorage.getItem(WATCH_KEY) || "[]"); return Array.isArray(a) ? a.filter(function (s) { return /^[A-Z0-9.\-]{1,24}$/.test(s); }).slice(0, 100) : []; } catch (e) { return []; } }
  var localWatch = {
    has: function (t) { return localList().indexOf(t) >= 0; },
    toggle: function (t) { var l = localList(), i = l.indexOf(t); if (i < 0) l.unshift(t); else l.splice(i, 1); try { root.localStorage.setItem(WATCH_KEY, JSON.stringify(l)); } catch (e) { /* nur diese Sitzung */ } return i < 0; }
  };
  function watchStore() { var W = root.VUWatchButton; return W && W.couple ? W.couple(localWatch) : localWatch; }
  function toast(text) {
    var doc = root.document, t = doc.querySelector(".vsk-toast");
    if (!t) { t = doc.createElement("div"); t.className = "vsk-toast"; t.setAttribute("role", "status"); doc.body.appendChild(t); }
    t.textContent = text; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 1800);
  }
  /** Herz-Knöpfe [data-vsk-heart] in scope bedienen. */
  function bindHearts(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll("[data-vsk-heart]"), function (b) {
      if (b.__vsk) return; b.__vsk = true;
      var t = b.getAttribute("data-vsk-heart"), paint = function () { var on = watchStore().has(t); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", t + (on ? " von der Watchlist entfernen" : " auf die Watchlist")); };
      b.addEventListener("click", function () { var on = watchStore().toggle(t); paint(); toast(on ? "Auf der Watchlist" : "Entfernt"); });
      paint();
      ["vu-watchlist-ready", "vu-watchlist-change"].forEach(function (e) { root.addEventListener(e, function () { if (b.isConnected) paint(); }); });
    });
  }

  /* -------------------------------------------------------------- Fenster */
  function popup(id, body) {
    var el = root.VUUI.popup({ id: id, title: "", body: '<div class="vsk">' + body + "</div>", cls: "vsk-sheet" });
    return el;
  }
  /** Chart der Vorschau in der Breite des Fensters zeichnen (Prototyp: über die volle Breite). */
  function drawPreviewChart(el, points) {
    var host = el.querySelector("[data-vsk-chart]"), panel = el.querySelector(".vu-sheet-ui") || el;
    if (!host || points.length < 2) return;
    host.innerHTML = line(points.map(function (p) { return p[1]; }), Math.round(panel.clientWidth || 390), 130, { fill: true, base: true, sw: 2.2 });
  }
  function openCompare(a, partnerTicker, partnerName) {
    return loadWatch(partnerTicker).then(function (w) {
      var b = summarize({ ticker: partnerTicker, name: partnerName, watch: w && w.view });
      var c = compare(a.modules.quant && a.modules.quant.profile, b.modules.quant && b.modules.quant.profile);
      if (!c) { toast("Für " + (partnerName || partnerTicker) + " liegt kein Profil vor"); return null; }
      return popup("vsk-compare", compareHtml(a, b, c));
    });
  }
  /** Erster ähnlicher Titel mit Profil (für „Vergleichen“). */
  function comparePartner(v) { return v.modules.quant && v.similar.length ? v.similar[0] : null; }

  /* Modul-Kontext (Klickentwurf 17.11.2026): wird die Vorschau in einem Modul geöffnet, führt „Ganz öffnen“ auf
     /aktie/#/<T>/<modul> – die Aktienseite öffnet dann gleich das Fenster dieses Moduls. Das Modul kommt aus der Zuordnung
     des Rahmens (VUNavigation.product, dieselbe wie Menü und Reiter); Home, Discover, Suche, News, Ich und KI geben keinen
     Kontext (Discover ist der Einstieg der Aktienseite und hat kein eigenes Fenster-Ziel). */
  var CONTEXT_MODULES = ["quant", "technical", "fundamental", "hedgefonds", "elliott", "supertrader"];
  function moduleContext() {
    var N = root.VUNavigation, id = null;
    try { id = N && typeof N.product === "function" ? N.product() : null; } catch (e) { id = null; }
    return CONTEXT_MODULES.indexOf(id) >= 0 ? id : null;
  }
  /** Adresse der Aktienseite, mit Modul-Kontext: /aktie/#/<T> bzw. /aktie/#/<T>/<modul>. */
  function aktieHref(ticker, mod) { return "/aktie/#/" + encodeURIComponent(String(ticker).toUpperCase()) + (CONTEXT_MODULES.indexOf(mod) >= 0 ? "/" + mod : ""); }

  /**
   * Vorschau öffnen. Liefert Promise<boolean>: false, wenn das Kürzel keine US-Aktie ist oder nichts vorliegt
   * (der Aufrufer folgt dann seinem Link).
   */
  function open(ticker, o) {
    var t = String(ticker || "").trim().toUpperCase(), opt = o || {};
    if (!US_TICKER.test(t) || !root.document) return Promise.resolve(false);
    return load(t, opt).then(function (src) {
      if (!src.detail && !src.watch) return false;
      var v = summarize(src), partner = comparePartner(v);
      var el = popup("vsk-stock", previewHtml(v, { saved: watchStore().has(t), compare: !!partner }));
      if (!el) return false;
      el.setAttribute("data-vsk-ticker", t);
      bindHearts(el);
      loadSeries(t).then(function (p) { if (el.isConnected) drawPreviewChart(el, p); });
      var cmp = el.querySelector("[data-vsk-compare]");
      if (cmp) cmp.addEventListener("click", function () { openCompare(v, partner.ticker, partner.name); });
      /* „Ganz öffnen“ mit Modul-Kontext; auf der Aktienseite derselben Aktie: nur schließen. */
      var go = el.querySelector("[data-vsk-open]"), ctxMod = moduleContext();
      if (go && ctxMod) go.setAttribute("href", aktieHref(t, ctxMod));
      if (go) go.addEventListener("click", function () { if (root.VUUI) root.VUUI.closeSheet(el); });
      return true;
    });
  }
  /** Klick-Delegation: ein Tipp auf [data-vu-stock] öffnet die Vorschau (Name aus data-vu-stock-name). Einmal je Bereich. */
  function bind(scope) {
    var host = scope || root.document;
    if (!host || host.__vskBound) return;
    host.__vskBound = true;
    host.addEventListener("click", function (e) {
      var n = e.target.closest && e.target.closest("[data-vu-stock]");
      if (!n || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      if (e.target.closest("[data-vsk-heart]") || n.tagName === "HEADER") return;
      var t = n.getAttribute("data-vu-stock");
      if (!US_TICKER.test(String(t || "").toUpperCase())) return;
      e.preventDefault();
      open(t, { name: n.getAttribute("data-vu-stock-name") || "", trigger: n }).then(function (ok) { if (!ok && n.href) root.location.assign(n.href); });
    });
  }

  return Object.freeze({
    VERSION: VERSION, open: open, bind: bind, moduleContext: moduleContext, aktieHref: aktieHref, CONTEXT_MODULES: CONTEXT_MODULES,
    model: Object.freeze({ summarize: summarize, shortName: shortName, nameRest: nameRest, compare: compare, balance: balance, valuationWord: valuationWord, businessVerdict: businessVerdict, chartSummary: chartSummary, techVerdict: techVerdict, supertraderOf: supertraderOf, elliottOf: elliottOf,
      PROFILE_KEYS: PROFILE_KEYS, PROFILE_LABEL: PROFILE_LABEL, STRONG: STRONG, GRADE: GRADE, TREND: TREND, F_GRADE: F_GRADE, F_GROW: F_GROW, F_PROF: F_PROF, ST_STAGES: ST_STAGES, ST_STAGE_TXT: ST_STAGE_TXT }),
    draw: Object.freeze({ line: line, bars: bars, radar: radar, ring: ring, move: move, icon: icon, logo: logo, HEART: HEART, CHEV: CHEV }),
    fmt: Object.freeze({ num: num, pct: pct, money: money, compact: compact, dateShort: dateShort, esc: esc }),
    html: Object.freeze({ preview: previewHtml, compare: compareHtml }),
    data: Object.freeze({ ready: ready, getJSON: getJSON, load: load, loadWatch: loadWatch, loadSeries: loadSeries, loadDetail: loadDetail, seriesPath: seriesPath, script: script }),
    ui: Object.freeze({ popup: popup, bindHearts: bindHearts, toast: toast, watchStore: watchStore, openCompare: openCompare, comparePartner: comparePartner })
  });
});
