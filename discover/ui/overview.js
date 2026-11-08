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
  /** Beträge in Dollar wie die SEC-Quelle (D09 „Entfällt“), formatiert über den zentralen Formatter
      (quant/engines/fx/money-format.js); ohne ihn nur die Zahl, nie ein fest verdrahtetes Zeichen. */
  function usd(v) {
    if (!isNum(v)) return "–";
    var F = global.VUFx && global.VUFx.Format;
    return F && F.formatCompact ? F.formatCompact(v, "USD", { numberLocale: "de-DE" }) : num(v, 0);
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
  /* N6: Erfahrungsstufe aus dem ersten Start bzw. Konto (willkommen/start/prefs.js, localStorage "vu-start-v1".mode). */
  function mode() { try { var o = JSON.parse(localStorage.getItem("vu-start-v1") || "{}"); return o && (o.mode === "pro" || o.mode === "advanced") ? o.mode : "beginner"; } catch (e) { return "beginner"; } }
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
    /* N6 Profi (sys-profi): alle sechs Perspektiven als Kacheln. Urteile nur, wo Discover die Daten schon hat (Zahlen, Chart);
       die übrigen Kacheln führen in ihre Welt, ohne ein Urteil zu erfinden (Discover-Budget: keine Zusatzanfragen). */
    if (mode() === "pro") {
      var byW = {}; rows.forEach(function (r) { if (!byW[r[0]]) byW[r[0]] = r; });
      var o = { universe: "US_REAL" }, P = [["fundamental", "Zahlen"], ["quant", "Faktoren"], ["technical", "Chart"], ["supertrader", "Methoden"], ["elliott", "Wellen"], ["hedgefonds", "Investoren"]];
      return section("blick", "Alle Perspektiven", '<div class="vu-grid dv3-pgrid">' + P.map(function (p) {
        var r = byW[p[0]];
        return '<a class="vu-box dv3-ptile" href="' + esc(U().perspectiveHref(p[0], d.symbol, o)) + '"><span class="dv3-ptile-h">' + U().hud(p[0], 28, 8) + "<b>" + esc(p[1]) + "</b></span>" +
          (r ? U().verdict(r[2], r[3]) + '<span class="vu-xs vu-mu dv3-ptile-s">' + esc(r[4]) + "</span>" : '<span class="vu-xs vu-mu dv3-ptile-s">Perspektive öffnen ›</span>') + "</a>";
      }).join("") + "</div>");
    }
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
      '<div style="margin-top:10px">' + U().help("GJ = Geschäftsjahr. Es endet je Firma in einem anderen Monat; die Zahlen stammen aus den Geschäftsberichten.") + "</div>" +
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
  function waageZeilen(d) {
    if (!D.Einordnung || !D.Einordnung.waage) return null;
    var w = D.Einordnung.waage(d), DF = D.DetailFundamentals;
    if (DF && DF.waageZeilen) {
      var extra = DF.waageZeilen(d), ids = {};
      w.dafuer.concat(w.beachten).forEach(function (e) { ids[e.id] = true; });
      extra.dafuer.forEach(function (e) { if (!ids[e.id]) w.dafuer.push(e); });
      extra.beachten.forEach(function (e) { if (!ids[e.id]) w.beachten.push(e); });
    }
    return { w: w, rows: w.dafuer.slice(0, 3).map(function (e) { return ["+", e]; }).concat(w.beachten.slice(0, 2).map(function (e) { return ["−", e]; })) };
  }
  /** Stärken und Schwächen laut Kennzahlen (Einordnung, 3 + 2; Wortwahl nach docs/legal/WORTWAHL.md) */
  function waage(d) {
    var z = waageZeilen(d); if (!z || !z.rows.length) return "";
    var w = z.w, rows = z.rows;
    return section("waage", "Stärken und Schwächen laut Kennzahlen", '<div class="vu-box dv3-liste">' + rows.map(function (r) {
      return '<div class="dv3-waage"><span class="dv3-mark' + (r[0] === "+" ? "" : " is-minus") + '" aria-label="' + (r[0] === "+" ? "Stärke" : "Schwäche") + '">' + r[0] + "</span><div><b class=\"vu-sm\">" + esc(r[1].text) + "</b>" + (r[1].beleg ? '<span class="vu-xs vu-mu">' + esc(r[1].beleg) + "</span>" : "") + "</div></div>";
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
      return U().stockRow({ ticker: c.symbol, name: c.companyName, sub: c.was || c.sector, chart: path.length > 2 && global.VUChart ? global.VUChart.sparkline(path) : "", price: c.price && c.price.value, currency: "USD", changePct: c.changePercent && c.changePercent.value, href: "#/s/" + universe + "/" + encodeURIComponent(c.symbol) });
    }).join("");
    var t = key === "sameTheme" && n.title ? "Gleiches Thema: " + titleCase(n.title.replace(/^Gleiches Thema · /, "")) : title;
    return section(key, t, '<div class="dv3-rows">' + rows + "</div>" + (n.rule && !/thema-|themenliste/i.test(n.rule) ? '<div style="margin-top:6px">' + U().help(n.rule.charAt(0).toUpperCase() + n.rule.slice(1) + ".") + "</div>" : ""));
  }
  /** Mehr in anderen Welten (sechs Perspektiven) */
  function welten(d) {
    var t = d.symbol, P = [["technical", "Chart", "Trend, Zonen"], ["fundamental", "Zahlen", "Geschäftsberichte"], ["quant", "Faktoren", "6 Eigenschaften"], ["supertrader", "Methoden", "Regeln der Profis"], ["elliott", "Wellen", "Struktur"], ["hedgefonds", "Investoren", "13F-Daten"]];
    if (d.region === "EUROPE") return "";
    return section("welten", "Mehr zu " + (d.companyName || t) + " in anderen Welten", '<div class="vu-grid dv3-welten" style="--vu-cols:3">' + P.map(function (p) {
      return '<a class="vu-box dv3-welt" href="' + esc(U().perspectiveHref(p[0], t)) + '">' + U().hud(p[0], 30, 9) + "<b>" + esc(p[1]) + '</b><span class="vu-xs vu-mu">' + esc(p[2]) + "</span></a>";
    }).join("") + "</div>");
  }


  /* =====================================================================
     Konzept „Reihe für Reihe“, PR 5 (Folien AX01–AX05, Screens a-top, a-full,
     a-chapter, a-next): die Aktie als Titelseite. Unter Kopf und Chart:
     Etiketten · Story in drei Sätzen · 7 Kapitel (zugeklappt, Inhalt der
     bisherigen Abschnitte unverändert) · Reihen der Aktie · Mehr wie … ·
     Gleiches Thema · Niedrigere Bewertung im Sektor. Kommt man aus einer Reihe
     (#/s/U/T?reihe=…), oben die Reihen-Leiste und am Ende die nächste Aktie.
     Nur für US-Aktien; Europa behält den bisherigen Überblick.
     ===================================================================== */
  var OPEN_KEY = "vu-discover-chapters-v1";
  function openSet() { try { var a = JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveOpen(id, on) {
    try { var a = openSet().filter(function (x) { return x !== id; }); if (on) a.push(id); localStorage.setItem(OPEN_KEY, JSON.stringify(a)); } catch (e) { /* kein Speicher */ }
  }
  function reiheAusAdresse() { var m = /[?&]reihe=([a-z0-9-]+)/.exec(String(global.location && global.location.hash || "")); return m ? m[1] : null; }
  function R() { return D.Reihen; }
  function rowName(id, fallback) { return R() ? R().title(id, fallback) : titleCase(fallback || id); }
  function rowLink(universe, id) { var T = D.Views && D.Views.Themes, t = T && T.byRow(id); return t ? T.href(t) : "#/c/" + universe + "/" + id; }
  function sortedMemberships(d) {
    return (d.memberships || []).filter(function (x) { return isNum(x.rank) && isNum(x.of) && x.rowId !== "sector-leaders"; })
      .sort(function (a, b) { return a.rank - b.rank || a.rank / a.of - b.rank / b.of; });
  }
  function themeOf(d) {
    var th = (d.themes || [])[0], T = D.Views && D.Views.Themes;
    if (!th) return null;
    var t = T && T.byRow(th.rowId);
    return { rowId: th.rowId, title: t ? t.title : titleCase(th.title), photo: t && t.photo, href: t ? T.href(t) : null };
  }
  /** Etiketten wie die Metazeile einer Serie: bester Platz, Thema, Index-Gewicht, „+N Reihen“. */
  function etiketten(d, universe) {
    var m = sortedMemberships(d), th = themeOf(d), ix = (d.indexMemberships || []).filter(function (x) { return isNum(x.weight); })[0], out = [];
    if (m[0]) out.push('<a class="vu-chip vu-chip--lime" href="' + esc(rowLink(universe, m[0].rowId)) + '">Platz ' + m[0].rank + " · " + esc(rowName(m[0].rowId, m[0].title)) + "</a>");
    if (th) out.push('<a class="vu-chip" href="' + esc(th.href || rowLink(universe, th.rowId)) + '">' + esc(th.title) + "</a>");
    if (ix) out.push('<span class="vu-chip">' + esc((ix.shortLabel || ix.indexName) + " · " + num(ix.weight, 1) + " %") + "</span>");
    if (m.length > 1) out.push('<a class="vu-chip" href="#dv3-reihen">+' + (m.length - 1) + " Reihen</a>");
    return out.length ? '<div class="dv3-tags">' + out.join("") + "</div>" : "";
  }
  /** Kurs gegen das Jahreshoch: ab −20 % schwächer, bis −5 % nah am Hoch, dazwischen mittel. */
  function hochUrteil(dist) {
    if (!isNum(dist)) return null;
    if (dist <= -0.20) return ["weak", "Schwächer"];
    if (dist >= -0.05) return ["strong", "Nah am Hoch"];
    return ["mid", "Dazwischen"];
  }
  /** Die Story in drei Sätzen: Geschäft, Kurs, Bewertung – je ein Satz und ein Urteil (ersetzt „In einem Satz“ und „Auf einen Blick“). */
  function story(d) {
    var f = d.fundamentals || {}, rows = [], m = d.metrics || {};
    var st = f.story && f.story.available && (f.story.statements || [])[0];
    var growth = f.health && (f.health.categories || []).filter(function (c) { return c.id === "growth"; })[0];
    if (st && st.text) rows.push(["fundamental", "Geschäft", st.text, growth ? [gradeKind(growth.grade), growth.grade] : null]);
    var j = d.jahresspanne, k = hochUrteil(m.distanceTo52wHigh);
    if (j && j.zumHoch && k) rows.push(["technical", "Kurs", "Der Kurs liegt " + j.zumHoch.replace(/^[−-]/, "") + " unter dem Hoch der letzten 12 Monate.", k]);
    else if (d.plain && d.plain.story) rows.push(["technical", "Kurs", d.plain.story + ".", kursUrteil(m.return1M)]);
    var v = f.valuation, b = bewertungsUrteil(v);
    if (b && v.pe && isNum(v.pe.value)) {
      var med = v.relative.peMedian, txt = b[1] === "Wie der Markt" ? "etwa wie der Markt" : b[0] === "weak" ? "über dem Markt" : "unter dem Markt";
      rows.push(["quant", "Bewertung", "KGV " + num(v.pe.value, 1) + ", " + txt + (isNum(med) ? " (" + num(med, 1) + ")." : "."), b]);
    }
    if (!rows.length) return "";
    return '<section class="dv3-story" aria-label="Die Story in drei Sätzen"><p class="vu-ltag">Die Story in drei Sätzen</p>' + rows.map(function (r) {
      return '<div class="dv3-story-r">' + U().hud(r[0], 34, 10) + '<div><span class="vu-ltag">' + esc(r[1]) + "</span><p>" + esc(r[2]) + "</p></div>" + (r[3] ? U().verdict(r[3][0], r[3][1]) : "") + "</div>";
    }).join("") + "</section>";
  }
  /* Bildchen der Kapitel (schwarz, 76 × 52) */
  function thumbSpanne(d) { var p = d.jahresspanne && isNum(d.jahresspanne.position) ? Math.round(Math.max(0, Math.min(1, d.jahresspanne.position)) * 100) : 50; return '<span class="dv3-thumb"><span class="dv3-thumb-range"><i style="width:' + p + '%"></i><b style="left:' + p + '%"></b></span></span>'; }
  function thumbThema(d) { var th = themeOf(d); return th && th.photo ? '<span class="dv3-thumb dv3-thumb--img"><img src="' + esc(th.photo) + '" alt="" loading="lazy" decoding="async"></span>' : '<span class="dv3-thumb">' + U().hud("discover", 30, 8) + "</span>"; }
  function revenue(d) { var j = d.fundamentals && d.fundamentals.journey; return j && j.tracks ? (j.tracks.revenue || []).filter(function (x) { return isNum(x.v); }) : []; }
  function thumbBars(d) { var r = revenue(d).slice(-8), mx = Math.max.apply(null, r.map(function (x) { return x.v; }).concat([1])); return '<span class="dv3-thumb dv3-thumb--bars">' + r.map(function (x, i) { return '<i style="height:' + Math.max(2, Math.round(x.v / mx * 36)) + "px" + (i === r.length - 1 ? ";background:#c8f531" : "") + '"></i>'; }).join("") + "</span>"; }
  function healthCount(d) { var c = (d.fundamentals && d.fundamentals.health && d.fundamentals.health.categories) || []; return [c.filter(function (x) { return /^Sehr/.test(x.grade); }).length, c.length]; }
  function thumbDots(d) { var k = healthCount(d); return '<span class="dv3-thumb dv3-thumb--dots">' + Array.from({ length: k[1] }, function (_, i) { return "<i" + (i < k[0] ? ' class="on"' : "") + "></i>"; }).join("") + "</span>"; }
  function thumbPe(d) { var v = d.fundamentals && d.fundamentals.valuation, pe = v && v.pe && v.pe.value, med = v && v.relative && v.relative.peMedian, mx = Math.max(pe || 0, med || 0) || 1; return '<span class="dv3-thumb dv3-thumb--pe"><i style="width:' + Math.round((pe || 0) / mx * 100) + '%"></i><i style="width:' + Math.round((med || 0) / mx * 100) + '%"></i></span>'; }
  function thumbMarks(z) { var plus = z ? z.rows.filter(function (r) { return r[0] === "+"; }).length : 0, minus = z ? z.rows.length - plus : 0; return '<span class="dv3-thumb dv3-thumb--marks"><b>' + new Array(plus + 1).join("+ ").trim() + "</b><b>" + new Array(minus + 1).join("− ").trim() + "</b></span>"; }
  function thumbIndex(d) { var ix = (d.indexMemberships || []).slice(0, 3), mx = Math.max.apply(null, ix.map(function (x) { return isNum(x.weight) ? x.weight : 0; }).concat([1])); return '<span class="dv3-thumb dv3-thumb--idx">' + ix.map(function (x, i) { return '<i style="width:' + (isNum(x.weight) ? Math.max(20, Math.round(x.weight / mx * 90)) : 60) + "%" + (i % 2 ? "" : ";background:#c8f531") + '"></i>'; }).join("") + "</span>"; }
  function mrd(v) { return isNum(v) ? num(v / 1e9, 2) + " Mrd. $" : "–"; }
  function kapitelListe(d, universe) {
    var name = d.companyName || d.symbol, z = d.zeitachse || [], y = z.filter(function (x) { return x.key === "return12M"; })[0], j = d.jahresspanne;
    var r = revenue(d), last = r[r.length - 1], hc = healthCount(d), v = d.fundamentals && d.fundamentals.valuation, wz = waageZeilen(d);
    var plus = wz ? wz.rows.filter(function (x) { return x[0] === "+"; }).length : 0, minus = wz ? wz.rows.length - plus : 0;
    var ix = d.indexMemberships || [];
    return [
      ["kurs", "Kurs: Zeitachse und Jahresspanne", [y ? y.wert + " in 12 Monaten" : null, j && j.zumHoch ? j.zumHoch.replace(/^[−-]/, "") + " unter dem Hoch" : null].filter(Boolean).join(" · "), thumbSpanne(d), zeitachse(d) + spanne(d)],
      ["firma", "Was macht " + name + "?", [d.was, (d.themes || []).length ? d.themes.length + " Themen" : null].filter(Boolean).join(" · "), thumbThema(d), firma(d, universe)],
      ["geschaeft", "Wie sich das Geschäft entwickelt hat", last ? "Umsatz " + mrd(last.v) + " im GJ " + last.fy : "", thumbBars(d), geschaeft(d)],
      ["gesund", "Wie gesund ist die Firma?", hc[1] ? hc[0] + " von " + hc[1] + " sehr stark" : "", thumbDots(d), gesundheit(d)],
      ["teuer", "Ist " + name + " teuer?", v && v.pe && isNum(v.pe.value) ? "KGV " + num(v.pe.value, 1) + (v.relative && isNum(v.relative.peMedian) ? " · Markt " + num(v.relative.peMedian, 1) : "") : "", thumbPe(d), teuer(d)],
      ["waage", "Stärken und Schwächen laut Kennzahlen", wz && wz.rows.length ? plus + (plus === 1 ? " Stärke" : " Stärken") + " · " + minus + (minus === 1 ? " Schwäche" : " Schwächen") : "", thumbMarks(wz), waage(d)],
      ["indizes", "In welchen Indizes?", ix.map(function (x) { return (x.shortLabel || x.indexName).replace("NASDAQ-100", "Nasdaq-100").replace("Dow Jones Industrial Average", "Dow") + (isNum(x.weight) ? " " + num(x.weight, 1) + " %" : ""); }).join(" · "), thumbIndex(d), indizes(d)]
    ].filter(function (k) { return k[4]; });
  }
  function kapitel(d, universe) {
    var ks = kapitelListe(d, universe), open = openSet();
    if (!ks.length) return "";
    return '<section class="dv3-sec dv3-kapitel" data-sec="kapitel">' + U().sect("Kapitel") + '<p class="dv3-sub">' + ks.length + " Kapitel, je eins aufklappen. Zusammen das, was die Seite bisher untereinander zeigte.</p>" +
      '<div class="dv3-eps">' + ks.map(function (k, i) {
        return '<details class="dv3-ep" data-ch="' + k[0] + '"' + (open.indexOf(k[0]) >= 0 ? " open" : "") + '><summary><b class="dv3-ep-n">' + (i + 1) + "</b>" + k[3] + '<span class="dv3-ep-t"><b>' + esc(k[1]) + "</b>" + (k[2] ? "<span>" + esc(k[2]) + "</span>" : "") + '</span><span class="dv3-ep-c" aria-hidden="true">' + U().glyph("next", 15) + '</span></summary><div class="dv3-ep-body">' + k[4] + "</div></details>";
      }).join("") + "</div></section>";
  }
  /** „{Name} steht in N Reihen“: Platz groß, Tipp öffnet die Reihe. */
  function reihen(d, universe) {
    var m = sortedMemberships(d);
    if (!m.length) return "";
    return '<section class="dv3-sec" id="dv3-reihen" data-sec="reihen">' + U().sect((d.companyName || d.symbol) + " steht in " + m.length + (m.length === 1 ? " Reihe" : " Reihen")) + '<p class="dv3-sub">Platz nach der Regel der Reihe. Tipp öffnet die Reihe.</p><div class="dv3-rail" role="list">' + m.map(function (x) {
      return '<a class="dv3-rk2" role="listitem" href="' + esc(rowLink(universe, x.rowId)) + '"><span class="vu-num">' + x.rank + ".</span><b>" + esc(rowName(x.rowId, x.title)) + '</b><span class="vu-xs vu-mu">von ' + num(x.of, 0) + "</span></a>";
    }).join("") + "</div></section>";
  }
  /** Schienen „Mehr wie …“, „Gleiches Thema“, „Niedrigere Bewertung im Sektor“ (aus discoverNext), Poster wie auf der Startseite. */
  var NEXT = [["similar", function (d) { return "Mehr wie " + (d.companyName || d.symbol); }, "Ähnlich in Kursverhalten, Wachstum, Marge und Bewertung."],
    ["sameTheme", function (d) { var th = themeOf(d); return "Gleiches Thema" + (th ? ": " + th.title : ""); }, ""],
    ["cheaperAlternatives", function () { return "Niedrigere Bewertung im Sektor"; }, null]];
  function schienen(d, universe) {
    return NEXT.map(function (x) {
      var n = d.discoverNext && d.discoverNext[x[0]];
      if (!n || !(n.cards || []).length) return "";
      var sub = x[2] != null ? x[2] : "KGV unter 80 % von " + (d.companyName || d.symbol) + ", Nettomarge mindestens 5 %.";
      return '<section class="dv3-sec dv3-next" data-next="' + x[0] + '">' + U().sect(x[1](d)) + (sub ? '<p class="dv3-sub">' + esc(sub) + "</p>" : "") + '<div class="dv3-rail dv3-posters" role="list"></div></section>';
    }).join("");
  }
  function seriesFor(c) {
    var I = global.VUCore && global.VUCore.Identity;
    try { return I ? { status: "CALCULATED", path: "/quant/data/market/discover-series/" + I.securityIdForTicker(c.symbol) + ".json" } : null; } catch (e) { return null; }
  }
  function fillPosters(box, d, universe) {
    var UI = D.ReihenUI; if (!UI) return;
    box.querySelectorAll(".dv3-next").forEach(function (sec) {
      var n = d.discoverNext[sec.getAttribute("data-next")], rail = sec.querySelector(".dv3-posters");
      n.cards.slice(0, 8).forEach(function (c) { rail.appendChild(UI.poster(Object.assign({ priceSeries: seriesFor(c) }, c), { universeId: universe })); });
    });
  }
  /* ------------------------------------------------ Aus einer Reihe gekommen (a-next) */
  function herkunft(box, d, universe) {
    var id = reiheAusAdresse(), UI = D.ReihenUI;
    if (!id || !UI || !R()) return;
    UI.loadRow({ universeId: universe }, id).then(function (row) {
      if (!box.isConnected) return;
      var cards = row.cards || [], i = cards.map(function (c) { return c.symbol; }).indexOf(d.symbol), total = (row.coverage && row.coverage.matched) || cards.length;
      var prev = i > 0 ? cards[i - 1] : null, next = cards[i + 1] || (i < 0 ? cards[0] : null), title = R().title(id, row.title);
      var href = function (c) { return "#/s/" + universe + "/" + encodeURIComponent(c.symbol) + "?reihe=" + id; };
      var pos = i >= 0 ? (i + 1) + " von " + num(total, 0) : "";
      var bar = document.createElement("nav"); bar.className = "dv3-rowctx"; bar.setAttribute("aria-label", "Reihe " + title);
      bar.innerHTML = (prev ? '<a href="' + esc(href(prev)) + '" aria-label="Vorige Aktie: ' + esc(prev.companyName || prev.symbol) + '">' + U().glyph("back", 14) + "</a>" : '<span aria-hidden="true"></span>') +
        '<a class="dv3-rowctx-t" href="' + esc(rowLink(universe, id)) + '"><b>' + esc(title) + "</b></a><span class=\"dv3-rowctx-p\">" + esc(pos) + "</span>" +
        (next ? '<a href="' + esc(href(next)) + '" aria-label="Nächste Aktie: ' + esc(next.companyName || next.symbol) + '">' + U().glyph("next", 14) + "</a>" : '<span aria-hidden="true"></span>');
      /* Wie a-next: die Leiste steht über dem Aktienkopf und klebt beim Scrollen oben. */
      var page = box.closest(".dv2-stock") || box.parentNode, head = page && page.querySelector(".dv2-head");
      if (head) head.parentNode.insertBefore(bar, head); else box.insertBefore(bar, box.firstChild);
      if (!next) return;
      var npos = (i >= 0 ? i + 2 : 1) + " von " + num(total, 0);
      var end = document.createElement("section"); end.className = "dv3-endcard"; end.setAttribute("aria-label", "Nächste in der Reihe");
      end.innerHTML = '<p class="vu-ltag">Ende der Seite · Nächste in der Reihe</p><div class="dv3-endcard-b"><div class="dv3-endcard-p"></div><div class="dv3-endcard-t"><b>' + esc(next.companyName || next.symbol) + "</b><p>" + esc((next.hook && next.hook.text) || (next.plain && next.plain.story) || "") + "</p><span>" + esc(title + " · " + npos) + "</span></div></div>" +
        '<div class="dv3-endcard-a"><a class="vu-btn" href="' + esc(href(next)) + '">Nächste Aktie</a><a class="vu-btn vu-btn--line" href="' + esc(rowLink(universe, id)) + '">Zur Reihe</a></div><p class="dv3-endcard-h">Oder seitlich wischen: links zurück, rechts weiter.</p>';
      end.querySelector(".dv3-endcard-p").appendChild(UI.poster(next, { universeId: universe }, { row: id }));
      box.appendChild(end);
      /* Seitlich wischen: links zurück, rechts weiter. Nicht im Chart und nicht in Schienen (dort wischt man anderes). */
      var x0 = null, y0 = null;
      document.addEventListener("touchstart", function (e) { var t = e.target; x0 = (t.closest && t.closest(".dx-chapter--chart,.dv3-rail,.dr-rail,.vu-seg,.dv3-gesch")) ? null : e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      document.addEventListener("touchend", function (e) {
        if (x0 == null || !box.isConnected) return;
        var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
        if (Math.abs(dx) < 90 || Math.abs(dy) > 50) return;
        if (dx < 0 && next) global.location.hash = href(next); else if (dx > 0 && prev) global.location.hash = href(prev);
      }, { passive: true });
    }).catch(function () {});
  }
  function bindKapitel(box) {
    box.querySelectorAll(".dv3-ep").forEach(function (det) {
      det.addEventListener("toggle", function () { saveOpen(det.getAttribute("data-ch"), det.open); });
    });
  }
  function renderTitel(d, universe) {
    var html = [etiketten(d, universe), story(d), kapitel(d, universe), reihen(d, universe), schienen(d, universe)].join("");
    var box = document.createElement("div");
    box.className = "vu-ui dv3-overview dv3-titel";
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
    bindKapitel(box);
    fillPosters(box, d, universe);
    herkunft(box, d, universe);
    U().bindHelp(box);
    return box;
  }
  /**
   * Abschnitte in root einsetzen (nach dem Chart). Gibt die Knoten zurück, damit detail.js sie einordnet.
   * Ohne VUUI (Skript nicht geladen) entfällt der Überblick; die bisherigen Kapitel bleiben dann sichtbar.
   */
  function render(d, opts) {
    if (!U() || !d) return null;
    var universe = (opts && opts.universeId) || d.universeId || "US_REAL";
    if (d.region !== "EUROPE" && D.Reihen && D.ReihenUI) return renderTitel(d, universe);
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

  D.Overview = Object.freeze({ render: render, kursUrteil: kursUrteil, bewertungsUrteil: bewertungsUrteil, gradeKind: gradeKind, titleCase: titleCase,
    hochUrteil: hochUrteil, story: story, kapitelListe: kapitelListe, etiketten: etiketten, reiheAusAdresse: reiheAusAdresse });
  if (typeof module === "object" && module.exports) module.exports = D.Overview;
})(typeof globalThis !== "undefined" ? globalThis : this);
