/* =========================================================================
   VISION UNIVERSE — discover/ui/overview.js       Aktienseite „Überblick“ (D09)

   Redesign 2027 (docs/design/redesign-2027, Folie D09, Mockup d09-a):
   unter Kopf und Chart die Abschnitte in dieser Reihenfolge –
   In einem Satz · Zeitachse · Jahresspanne · Auf einen Blick (drei Urteile) ·
   Was macht <Firma>? · Wie sich das Geschäft entwickelt hat · Wie gesund ist
   die Firma? · Ist <Firma> teuer? · Was dafür spricht, was dagegen ·
   In welchen Indizes? · Platz in Ranglisten · Ähnliche Aktien · Gleiches
   Thema · Günstiger bewertet · Mehr in anderen Welten.

   Nur Darstellung: alle Werte kommen aus der Detaildatei der Aktie
   (discover/data/stocks/<U>/<T>.json) und den Einordnungs-Engines. Fehlt
   ein Wert, entfällt der Abschnitt oder sagt, was fehlt (Regel 7).
   Bausteine: assets/vu-ui.js (VUUI), Chart C06: assets/vu-chart.js.
   ========================================================================= */
(function (global) {
  "use strict";
  var D = global.VUDiscover = global.VUDiscover || {};

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v, d) { return isNum(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) : "–"; }
  function pct(v, d) { return isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v), d) + " %" : "–"; }
  /** US-Dollar in Mrd./Bio. (Fundamentalzahlen in Dollar wie die SEC-Quelle; D09 „Entfällt“). */
  function usd(v) {
    if (!isNum(v)) return "–";
    var a = Math.abs(v);
    if (a >= 1e12) return num(v / 1e12, 2) + " Bio. $";
    if (a >= 1e9) return num(v / 1e9, 1) + " Mrd. $";
    if (a >= 1e6) return num(v / 1e6, 0) + " Mio. $";
    return num(v, 0) + " $";
  }
  function U() { return global.VUUI; }
  function frag(html) { var t = document.createElement("template"); t.innerHTML = html; return t.content; }
  function section(id, title, inner, link) {
    return '<section class="dv3-sec" data-sec="' + id + '">' + U().sect(title, link ? { href: link.href, link: link.text } : null) + inner + "</section>";
  }
  var KLEIN = { im: 1, in: 1, und: 1, mit: 1, von: 1, der: 1, die: 1, das: 1, "für": 1, am: 1, an: 1, auf: 1, zum: 1, zur: 1 };
  var GROSS = { nasdaq: "NASDAQ", ki: "KI", etf: "ETF", us: "US", usa: "USA", "s&p": "S&P", it: "IT", ai: "AI" };
  /** Titel der Reihen (in Daten GROSS) lesbar: „STÄRKSTE AKTIEN IM NASDAQ-100“ → „Stärkste Aktien im NASDAQ-100“. */
  function titleCase(s) {
    return String(s || "").toLocaleLowerCase("de-DE").split(/(\s+)/).map(function (w, i) {
      if (/^\s+$/.test(w)) return w;
      var core = w.replace(/[^\p{L}&]+.*$/u, "");
      if (GROSS[core]) return GROSS[core] + w.slice(core.length);
      if (i && KLEIN[w]) return w;
      return w.charAt(0).toLocaleUpperCase("de-DE") + w.slice(1);
    }).join("");
  }
  function pctFromRatio(r, d) { return isNum(r) ? pct(r * 100, d) : "–"; }

  /* ------------------------------------------------------------ Abschnitte */
  /** In einem Satz: plain.story + Klartext-Zahl + plain.zusatz */
  function satz(d) {
    var p = d.plain;
    if (!p || !p.story) return "";
    var z = p.zahl || {}, roh = isNum(z.roh) ? z.roh : null;
    var big = z.wert ? '<span class="dv3-big' + (roh != null && roh < 0 ? " is-down" : roh === 0 ? " is-flat" : "") + '"><span aria-hidden="true">' + (roh != null && roh < 0 ? "▼" : roh === 0 ? "◆" : "▲") + "</span> " + esc(z.wert) + "</span>" : "";
    return '<div class="vu-box dv3-satz"><div class="vu-ltag">In einem Satz</div><p class="dv3-satz-t">' + esc(p.story) + "</p>" +
      (big ? '<div class="dv3-satz-z">' + big + '<span class="vu-mu vu-sm">' + esc([z.label, p.zusatz].filter(Boolean).join(" · ")) + "</span></div>" : "") + "</div>";
  }
  /** Zeitachse 1M/3M/6M/12M als Pillen */
  function zeitachse(d) {
    var z = (d.zeitachse || []).filter(function (x) { return x && isNum(x.roh); });
    if (!z.length) return "";
    return section("zeitachse", "Zeitachse", '<div class="vu-grid">' + z.map(function (x) {
      return '<div class="vu-box dv3-zeit"><span class="vu-sm"><b>' + esc(x.label) + "</b></span>" + U().chg(x.roh * 100, { digits: 1 }) + "</div>";
    }).join("") + "</div>");
  }
  /** Jahresspanne: Balken mit Punkt, Abstand zu Tief und Hoch, Satz */
  function spanne(d) {
    var j = d.jahresspanne, m = d.metrics || {};
    if (!j || !isNum(j.position)) return "";
    var p = Math.max(0, Math.min(1, j.position)) * 100;
    var price = d.price && isNum(d.price.value) ? d.price.value : null;
    return section("spanne", "Jahresspanne", '<div class="vu-box dv3-spanne"><div class="dv3-spanne-bar" role="img" aria-label="Position in der Jahresspanne: ' + num(p, 0) + ' %"><i style="width:' + p.toFixed(1) + '%"></i><b style="left:' + p.toFixed(1) + '%"></b></div>' +
      '<div class="dv3-spanne-l"><span><span class="vu-mu">Tief</span><br><b>' + esc((j.ueberTief || pctFromRatio(m.distanceTo52wLow, 0)) + " darüber") + "</b></span>" +
      '<span style="text-align:center"><span class="vu-mu">Heute</span><br><b>' + (price != null ? esc(U().money(price, "USD")) : "–") + "</b></span>" +
      '<span style="text-align:right"><span class="vu-mu">Hoch</span><br><b>' + esc((j.zumHoch || pctFromRatio(m.distanceTo52wHigh, 1)) + " darunter") + "</b></span></div>" +
      (j.satz ? '<p class="vu-sm" style="margin:10px 0 0">' + esc(j.satz) + "</p>" : "") + "</div>");
  }
  var GRADE = { "Sehr stark": "strong", "Stark": "strong", "Sehr solide": "strong", "Solide": "mid", "Mittel": "mid", "Flach": "weak", "Schwach": "weak", "Rückläufig": "weak", "Angespannt": "weak" };
  function gradeKind(g) { return GRADE[g] || "mid"; }
  /** Bewertung gegen den Marktmedian (fundamentals.valuation.relative.stufe; Regel steht in valuation.context.rule). */
  function bewertungsUrteil(v) {
    var r = v && v.relative;
    if (!r || !r.stufe) return null;
    if (r.stufe === "hoch") return ["weak", "Teurer als der Markt"];
    if (r.stufe === "niedrig" || r.stufe === "guenstig") return ["strong", "Günstiger als der Markt"];
    return ["mid", "Wie der Markt"];
  }
  /** Kurs: Bewegung eines Monats (Darstellungsregel D09: ab +5 % stärker, ab −5 % schwächer, sonst seitwärts). */
  function kursUrteil(r1m) {
    if (!isNum(r1m)) return null;
    if (r1m >= 0.05) return ["strong", "Etwas stärker"];
    if (r1m <= -0.05) return ["weak", "Etwas schwächer"];
    return ["mid", "Seitwärts"];
  }
  /** Auf einen Blick: drei Urteile Geschäft / Bewertung / Kurs (tippbar → Perspektive Zahlen bzw. Chart). */
  function blick(d) {
    var f = d.fundamentals || {}, g = d.geschaeftszahlen || {}, rows = [], t = encodeURIComponent(d.symbol);
    var growth = f.health && (f.health.categories || []).filter(function (c) { return c.id === "growth"; })[0];
    if (growth) rows.push(["fundamental", "Geschäft", gradeKind(growth.grade), growth.grade, isNum(g.umsatzWachstum) ? "Umsatz " + pctFromRatio(g.umsatzWachstum, 0) + " in 12 Monaten" : growth.detail, "/fundamental/#/" + t]);
    var b = bewertungsUrteil(f.valuation);
    if (b) rows.push(["fundamental", "Bewertung", b[0], b[1], "KGV " + num(f.valuation.pe && f.valuation.pe.value, 1) + " · Markt " + num(f.valuation.relative.peMedian, 1), "/fundamental/#/" + t]);
    var k = kursUrteil(d.metrics && d.metrics.return1M);
    if (k) rows.push(["technical", "Kurs", k[0], k[1], pctFromRatio(d.metrics.return1M, 1) + " in 1 Monat", "/technical/#/chart/" + t]);
    if (!rows.length) return "";
    return section("blick", "Auf einen Blick", '<div class="vu-stack">' + rows.map(function (r) {
      return '<a class="vu-box dv3-blick" href="' + esc(r[5]) + '">' + U().hud(r[0], 36, 10) + '<span class="dv3-blick-t"><b>' + esc(r[1]) + '</b><span class="vu-xs vu-mu">' + esc(r[4]) + "</span></span>" + U().verdict(r[2], r[3]) + "</a>";
    }).join("") + "</div>");
  }
  /** Was macht <Firma>? Ein Satz, Sektor, Börse, Aktienzahl, Themen-Chips */
  function firma(d, universe) {
    var f = d.fundamentals || {}, shares = f.valuation && f.valuation.marketCap && f.valuation.marketCap.shares;
    var meta = [d.sector, d.exchange, isNum(shares) ? num(shares / 1e9, 1) + " Mrd. Aktien" : null].filter(Boolean).join(" · ");
    var chips = (d.themes || []).slice(0, 8).map(function (th, i) {
      return '<a class="vu-chip' + (i ? "" : " vu-chip--lime") + '" href="#/c/' + esc(universe) + "/" + esc(th.rowId) + '">' + esc(titleCase(th.title)) + "</a>";
    }).join("");
    var text = d.description || d.was;
    if (!text && !meta) return "";
    return section("firma", "Was macht " + (d.companyName || d.symbol) + "?", '<div class="vu-box dv3-firma">' + (text ? '<p class="dv3-firma-t">' + esc(text) + "</p>" : "") + (meta ? '<div class="vu-xs vu-mu" style="font-weight:700;margin-top:6px">' + esc(meta) + "</div>" : "") +
      (chips ? '<div class="dv3-chips">' + chips + "</div>" : "") + "</div>");
  }
  /** Wie sich das Geschäft entwickelt hat: Reiter Umsatz/Gewinn/Cashflow, Von → Bis, Balken, Kernsatz, „?“ GJ, Aussagen */
  var TRACKS = [["revenue", "Umsatz"], ["net_income", "Gewinn"], ["free_cash_flow", "Cashflow"]];
  function geschaeft(d) {
    var f = d.fundamentals || {}, j = f.journey;
    if (!j || !j.available || !j.tracks) return "";
    var have = TRACKS.filter(function (t) { return (j.tracks[t[0]] || []).filter(function (x) { return isNum(x.v); }).length >= 2; });
    if (!have.length) return "";
    var st = (f.story && f.story.statements || []).map(function (s) { return s.text; }).filter(Boolean);
    var html = '<div class="dv3-gesch" data-track="' + have[0][0] + '">' + U().seg(have.map(function (t) { return { id: t[0], label: t[1] }; }), have[0][0], { label: "Kennzahl" }) +
      '<div class="dv3-gesch-body"></div>' +
      (st[0] ? '<div class="vu-box vu-box--lime dv3-kern"><b>' + esc(st[0]) + "</b></div>" : "") +
      '<div style="margin-top:10px">' + U().help("GJ = Geschäftsjahr. Es endet je Firma in einem anderen Monat; die Zahlen stammen aus den SEC-Berichten.") + "</div>" +
      (st.length > 1 ? '<ul class="dv3-checks">' + st.slice(1, 4).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    return section("geschaeft", "Wie sich das Geschäft entwickelt hat", html);
  }
  function geschaeftZeichnen(host, d, track) {
    var pts = ((d.fundamentals.journey.tracks || {})[track] || []).filter(function (x) { return isNum(x.v); }).slice(-12);
    var body = host.querySelector(".dv3-gesch-body");
    if (!body || pts.length < 2) return;
    var a = pts[0], b = pts[pts.length - 1];
    body.innerHTML = '<div class="dv3-vonbis"><div><div class="vu-xs vu-mu"><b>GJ ' + esc(a.fy) + '</b></div><div class="dv3-von">' + esc(usd(a.v)) + '</div></div><span aria-hidden="true">›</span><div><div class="vu-xs vu-mu"><b>GJ ' + esc(b.fy) + '</b></div><div class="dv3-bis">' + esc(usd(b.v)) + "</div></div></div>" +
      '<div style="margin-top:12px">' + U().bars(pts.map(function (p) { return [String(p.fy), p.v]; }), { height: 130, label: "Werte je Geschäftsjahr" }) + "</div>";
  }
  /** Wie gesund ist die Firma? 4 Kategorien mit Frage, Urteil, Beleg */
  var FRAGE = { growth: "Wächst sie?", profitability: "Verdient sie gut?", cashflow: "Bleibt Geld übrig?", balance: "Ist die Bilanz solide?" };
  var NAME = { growth: "Wachstum", profitability: "Profitabilität", cashflow: "Cashflow", balance: "Bilanz" };
  function gesundheit(d) {
    var h = d.fundamentals && d.fundamentals.health;
    if (!h || !h.available || !(h.categories || []).length) return "";
    var nm = (h.categories || []).filter(function (c) { return c.id === "profitability"; })[0];
    return section("gesund", "Wie gesund ist die Firma?", '<div class="vu-grid">' + h.categories.map(function (c) {
      return '<div class="vu-box dv3-gesund"><div class="vu-xs vu-mu"><b>' + esc(FRAGE[c.id] || c.label) + "</b></div><b>" + esc(NAME[c.id] || c.label) + '</b><div style="margin-top:8px">' + U().verdict(gradeKind(c.grade), c.grade) + '</div><div class="vu-xs" style="margin-top:8px;font-weight:700">' + esc(String(c.detail || "").replace(/Geschaeftsjahr/g, "Geschäftsjahr").replace(/Geschaeftsjahresende/g, "Geschäftsjahresende")) + "</div></div>";
    }).join("") + "</div>" + (nm && isNum(nm.value) ? '<div style="margin-top:10px">' + U().help("Nettomarge " + num(nm.value * 100, 1) + " %: Von 100 $ Umsatz bleiben " + num(nm.value * 100, 2) + " $ Gewinn übrig.") + "</div>" : ""));
  }
  /** Ist <Firma> teuer? KGV gegen den Marktmedian, Urteil, „?“, vier Kacheln */
  function teuer(d) {
    var v = d.fundamentals && d.fundamentals.valuation;
    if (!v || !v.available || !v.pe || !isNum(v.pe.value)) return "";
    var pe = v.pe.value, med = v.relative && v.relative.peMedian, u = bewertungsUrteil(v) || ["none", "Keine Aussage"];
    var mx = Math.max(pe, isNum(med) ? med : 0) || 1;
    var ctx = v.context || {};
    var tiles = [
      U().tile("Börsenwert", v.marketCap && isNum(v.marketCap.value) ? usd(v.marketCap.value) : "–", "Kurs × Aktien"),
      U().tile("Kurs-Umsatz (KUV)", v.ps && isNum(v.ps.value) ? num(v.ps.value, 1) : "–", isNum(ctx.psMedian) ? "Markt: " + num(ctx.psMedian, 1) : ""),
      U().tile("Gewinnrendite", pe > 0 ? num(100 / pe, 1) + " %" : "–", "1 / KGV"),
      U().tile("Free-Cashflow-Rendite", v.fcfYield && isNum(v.fcfYield.value) ? num(v.fcfYield.value * 100, 1) + " %" : "–", "Cash je 100 $ Börsenwert")
    ];
    var name = d.companyName || d.symbol;
    return '<section class="dv3-sec dv2-stock-valuation" data-sec="teuer">' + U().sect("Ist " + name + " teuer?") +
      '<div class="vu-box dv3-teuer"><div class="dv3-teuer-h"><b>Kurs-Gewinn-Verhältnis</b>' + U().verdict(u[0], u[1]) + "</div>" +
      '<div class="dv3-kgv"><span>' + esc(name) + '</span><div class="vu-meter"><i style="--v:' + (pe / mx * 100).toFixed(0) + '"></i></div><span class="vu-num">' + num(pe, 1) + "</span>" +
      (isNum(med) ? '<span class="vu-mu">Markt</span><div class="vu-meter dv3-markt"><i style="--v:' + (med / mx * 100).toFixed(0) + '"></i></div><span class="vu-num vu-mu">' + num(med, 1) + "</span>" : "") + "</div>" +
      '<div style="margin-top:12px">' + U().help("KGV " + num(pe, 1) + ": Du zahlst " + num(pe, 2) + " $ für 1 $ Jahresgewinn. Höher heißt: Im Kurs steckt mehr Erwartung.") + "</div></div>" +
      '<div class="vu-grid dv2-valuation-components" style="margin-top:10px">' + tiles.join("") + "</div></section>";
  }
  /** Was dafür spricht, was dagegen (Einordnung, 3 + 2) */
  function waage(d) {
    if (!D.Einordnung || !D.Einordnung.waage) return "";
    var w = D.Einordnung.waage(d), DF = D.DetailFundamentals;
    if (DF && DF.waageZeilen) {
      var extra = DF.waageZeilen(d), ids = {};
      w.dafuer.concat(w.beachten).forEach(function (e) { ids[e.id] = true; });
      extra.dafuer.forEach(function (e) { if (!ids[e.id]) w.dafuer.push(e); });
      extra.beachten.forEach(function (e) { if (!ids[e.id]) w.beachten.push(e); });
    }
    var rows = w.dafuer.slice(0, 3).map(function (e) { return ["+", e]; }).concat(w.beachten.slice(0, 2).map(function (e) { return ["−", e]; }));
    if (!rows.length) return "";
    return section("waage", "Was dafür spricht, was dagegen", '<div class="vu-box dv3-liste">' + rows.map(function (r) {
      return '<div class="dv3-waage"><span class="dv3-mark' + (r[0] === "+" ? "" : " is-minus") + '" aria-label="' + (r[0] === "+" ? "dafür" : "dagegen") + '">' + r[0] + "</span><div><b class=\"vu-sm\">" + esc(r[1].text) + "</b>" + (r[1].beleg ? '<span class="vu-xs vu-mu">' + esc(r[1].beleg) + "</span>" : "") + "</div></div>";
    }).join("") + "</div>" + (w.hinweis ? '<p class="vu-xs vu-mu" style="margin:8px 0 0">' + esc(w.hinweis) + "</p>" : ""));
  }
  /** In welchen Indizes? Gewicht als Balken */
  function indizes(d) {
    var ix = d.indexMemberships || [];
    if (!ix.length) return "";
    var mx = Math.max.apply(null, ix.map(function (x) { return isNum(x.weight) ? x.weight : 0; }).concat([1]));
    var sp = ix.filter(function (x) { return isNum(x.weight); })[0];
    return section("indizes", "In welchen Indizes?", '<div class="vu-box dv3-liste">' + ix.map(function (x) {
      return '<div class="dv3-index"><div class="dv3-index-h vu-sm"><b>' + esc(x.indexName || x.shortLabel) + '</b><span class="' + (isNum(x.weight) ? "" : "vu-mu") + '"><b>' + (isNum(x.weight) ? "Gewicht " + num(x.weight, 2) + " %" : "Mitglied") + "</b></span></div>" +
        (isNum(x.weight) ? '<div class="vu-meter vu-meter--lime" style="height:7px;margin-top:7px"><i style="--v:' + (x.weight / mx * 100).toFixed(0) + '"></i></div>' : "") + "</div>";
    }).join("") + "</div>" + (sp ? '<div style="margin-top:10px">' + U().help("Gewicht " + num(sp.weight, 2) + " %: Von 100 € in einem " + (sp.shortLabel || sp.indexName) + "-Fonds stecken " + num(sp.weight, 2) + " € in " + (d.companyName || d.symbol) + ".") + "</div>" : ""));
  }
  /** Platz in Ranglisten (memberships, Rang von N) */
  function ranglisten(d, universe) {
    var m = (d.memberships || []).filter(function (x) { return isNum(x.rank) && isNum(x.of); });
    if (!m.length) return "";
    return section("ranglisten", "Platz in Ranglisten", '<div class="vu-stack" style="gap:6px">' + m.slice(0, 6).map(function (x) {
      return '<a class="dv3-rang" href="#/c/' + esc(universe) + "/" + esc(x.rowId) + '"><span class="vu-num">' + x.rank + '.</span><b class="vu-sm">' + esc(titleCase(x.title)) + '</b><span class="vu-xs vu-mu"><b>von ' + x.of + "</b></span></a>";
    }).join("") + "</div>");
  }
  /** Ähnliche Aktien, Gleiches Thema, Günstiger bewertet (je Regel als Satz) */
  function liste(d, key, title, universe) {
    var n = d.discoverNext && d.discoverNext[key];
    if (!n || !(n.cards || []).length) return "";
    var rows = n.cards.slice(0, 3).map(function (c) {
      var path = (c.performancePath || []).map(function (p) { return p.value; }).filter(isNum);
      return U().stockRow({ ticker: c.symbol, name: c.companyName, sub: c.was || c.sector, series: path.length > 2 ? path : null, price: c.price && c.price.value, currency: "USD", changePct: c.changePercent && c.changePercent.value, href: "#/s/" + universe + "/" + encodeURIComponent(c.symbol) });
    }).join("");
    var t = key === "sameTheme" && n.title ? "Gleiches Thema: " + titleCase(n.title.replace(/^Gleiches Thema · /, "")) : title;
    return section(key, t, '<div class="dv3-rows">' + rows + "</div>" + (n.rule && !/thema-|themenliste/i.test(n.rule) ? '<div style="margin-top:6px">' + U().help(n.rule.charAt(0).toUpperCase() + n.rule.slice(1) + ".") + "</div>" : ""));
  }
  /** Mehr in anderen Welten (sechs Perspektiven) */
  function welten(d) {
    var t = d.symbol, P = [["technical", "Chart", "Trend, Zonen"], ["fundamental", "Zahlen", "SEC-Berichte"], ["quant", "Faktoren", "6 Eigenschaften"], ["supertrader", "Methoden", "Regeln der Profis"], ["elliott", "Wellen", "Struktur"], ["hedgefonds", "Investoren", "13F-Daten"]];
    if (d.region === "EUROPE") return "";
    return section("welten", "Mehr zu " + (d.companyName || t) + " in anderen Welten", '<div class="vu-grid dv3-welten" style="--vu-cols:3">' + P.map(function (p) {
      return '<a class="vu-box dv3-welt" href="' + esc(U().perspectiveHref(p[0], t)) + '">' + U().hud(p[0], 30, 9) + "<b>" + esc(p[1]) + '</b><span class="vu-xs vu-mu">' + esc(p[2]) + "</span></a>";
    }).join("") + "</div>");
  }

  /**
   * Abschnitte in root einsetzen (nach dem Chart). Gibt die Knoten zurück, damit detail.js sie einordnet.
   * Ohne VUUI (Skript nicht geladen) entfällt der Überblick; die bisherigen Kapitel bleiben dann sichtbar.
   */
  function render(d, opts) {
    if (!U() || !d) return null;
    var universe = (opts && opts.universeId) || d.universeId || "US_REAL";
    var html = [satz(d), zeitachse(d), spanne(d), blick(d), firma(d, universe), geschaeft(d), gesundheit(d), teuer(d), waage(d), indizes(d), ranglisten(d, universe),
      liste(d, "similar", "Ähnliche Aktien", universe), liste(d, "sameTheme", "Gleiches Thema", universe), liste(d, "cheaperAlternatives", "Günstiger bewertet", universe), welten(d)].join("");
    var box = document.createElement("div");
    box.className = "vu-ui dv3-overview";
    box.appendChild(frag(html));
    var g = box.querySelector(".dv3-gesch");
    if (g) {
      geschaeftZeichnen(g, d, g.getAttribute("data-track"));
      g.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".vu-seg button");
        if (!b) return;
        g.querySelectorAll(".vu-seg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        geschaeftZeichnen(g, d, b.getAttribute("data-id"));
      });
    }
    U().bindHelp(box);
    return box;
  }

  D.Overview = Object.freeze({ render: render, kursUrteil: kursUrteil, bewertungsUrteil: bewertungsUrteil, gradeKind: gradeKind, titleCase: titleCase });
  if (typeof module === "object" && module.exports) module.exports = D.Overview;
})(typeof globalThis !== "undefined" ? globalThis : this);
