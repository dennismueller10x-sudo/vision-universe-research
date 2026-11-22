/* =========================================================================
   MARKTBRIEFING – SEITE AUF WWW.VISIONUNIVERSE.DE (/marktbriefing/)

   Erzeugt aus einem Briefing (engine.js) die öffentliche Seite als fertiges
   HTML: jede Szene, jede Zahl und die Kurzfassung stehen im Dokument (Google,
   KI-Suche, ohne JavaScript lesbar). landing/marktbriefing/mb.js ergänzt nur
   Bewegung, den abfahrbaren Kursverlauf und die Karten-Ansicht.

   CSP der Website: kein Inline-Skript, kein Inline-Stil-Block. Daten für das
   Skript stehen als <script type="application/json"> (wird nicht ausgeführt),
   Stile in mb.css; Stil-Attribute sind erlaubt (style-src-attr).

   Kopf, Menü und Fuß kommen aus landing/news/index.html (eine Quelle für die
   Navigation). Farben nach dem Design-System: Weiß, Schwarz, Neongrün, Grau;
   Plus = neongrüne Pille, Minus = schwarze Pille, kein Rot.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Render = isNode ? require("./render.js") : global.VUMarketBriefingRender;

  var SITE = "https://www.visionuniverse.de";
  /* Wie landing/news/index.html: Research-Navigation im Quelltext, der Website-Build (landing/scripts/build.mjs) entfernt sie. */
  var NAV_HEAD = '<link rel="stylesheet" href="/assets/site-navigation.css">';
  var NAV_BODY = '<vu-navigation></vu-navigation><script src="/assets/site-navigation.js"></script>';
  var WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var MO = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var MS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

  function esc(s) { return String(s == null ? "" : s).replace(/(\d) %/g, "$1 %").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(x, d) { return Math.abs(x).toFixed(d == null ? 1 : d).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function sg(x) { return x > 0 ? "+" : x < 0 ? "−" : ""; }
  function pct(x, d) { return sg(x) + num(x, d) + " %"; }
  function pill(x, d) { return '<span class="mb-pill ' + (x < 0 ? "dn" : x > 0 ? "up" : "nt") + '">' + (x < 0 ? "▼ " : x > 0 ? "▲ " : "") + num(x, d) + " %</span>"; }
  function dmy(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "."; }
  function longDate(iso) { var d = new Date(iso + "T12:00:00Z"); return WD[d.getUTCDay()] + ", " + d.getUTCDate() + ". " + MO[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function tag(t) { return '<span class="mb-tag">' + esc(t) + "</span>"; }
  function ldTag(o) { return '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, "\\u003c") + "</script>"; }

  /* Szenen: eine Aussage je Bildschirm. Gibt [{id, bg, toc, html}] zurück. */
  function scenes(b, o) {
    var C = {}; b.cards.forEach(function (c) { C[c.id] = c; });
    var IX = {}; (C.indices ? C.indices.bars.rows : []).forEach(function (r) { IX[r.label] = r.value; });
    var MC = {}; (C.megacaps ? C.megacaps.bars.rows : []).forEach(function (r) { MC[r.label] = r.value; });
    var third = b.cards.filter(function (c) { return c.type === "THIRD"; });
    var S = [], ov = C.overview, day = longDate(b.session);
    var pdf = o.pdf ? '<a class="mb-btn mb-soft" href="' + esc(o.pdf) + '" download>PDF herunterladen</a>' : "";
    var play = '<button class="mb-btn" type="button" data-mb-play>▶ Als Karten ansehen</button>';

    var lead = [["Nasdaq 100", IX["Nasdaq 100"]], ["S&P 500", IX["S&P 500"]], ["Dow Jones", IX["Dow Jones"]]].filter(function (x) { return x[1] != null; });
    var topMc = C.megacaps && C.megacaps.bars.rows[0];
    if (topMc) lead.push([topMc.label, topMc.value]);
    S.push({ id: "start", bg: "l", toc: ov.title, html:
      '<div class="mb-in"><p class="mb-eye">Marktbriefing · Börsenschluss ' + esc(day) + '</p><h1 class="mb-claim mb-h1">' + esc(ov.title) + "</h1>" +
      (ov.sub ? '<p class="mb-say">' + esc(ov.sub) + "</p>" : "") +
      '<div class="mb-chips">' + lead.map(function (x) { return '<div class="mb-chip">' + esc(x[0]) + '<b data-to="' + x[1] + '">' + pct(x[1]) + "</b></div>"; }).join("") + "</div>" +
      '<div class="mb-acts">' + play + pdf + '</div></div><p class="mb-hint" aria-hidden="true">↓ <span>Wischen für den ganzen Tag</span></p>' });

    S.push({ id: "kurz", bg: "w", toc: "Das Wichtigste in Kürze", html:
      '<div class="mb-in"><p class="mb-eye">Das Wichtigste in Kürze</p><ol class="mb-sum">' + (b.summary || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol></div>" });

    if (ov.chart) {
      var q = IX["Nasdaq 100"];
      S.push({ id: "verlauf", bg: "w", toc: "Der Tag im Verlauf", html:
        '<div class="mb-in"><div class="mb-row"><div><p class="mb-eye" data-mb-who>Nasdaq 100 · Tagesverlauf</p><div class="mb-huge mb-num" data-mb-num>' + pct(q, 2) + '</div><p class="mb-eye" data-mb-when>Schluss · ' + esc(day) + "</p></div>" +
        '<div class="mb-ctl"><div class="mb-seg" role="group" aria-label="Index"><button type="button" data-k="QQQ" aria-pressed="true">Nasdaq</button><button type="button" data-k="SPY" aria-pressed="false">S&amp;P 500</button></div>' +
        '<div class="mb-seg" role="group" aria-label="Zeitraum"><button type="button" data-r="1d" aria-pressed="true">1 Tag</button><button type="button" data-r="1m" aria-pressed="false">1 Monat</button></div></div></div>' +
        '<div class="mb-fig" data-mb-tape><svg role="img" aria-label="Nasdaq 100 im Tagesverlauf gegen den Vortagesschluss"></svg></div><p class="mb-note">Finger oder Maus über die Kurve führen. Verlauf gegen Vortagesschluss, verzögert.</p></div>' });
    }

    if (C.indices) {
      var rows = C.indices.bars.rows, dn = rows.filter(function (r) { return r.value < 0; }).length, up = rows.length - dn;
      var claim = dn === rows.length ? "Alle " + rows.length + " Indizes im Minus." : up === rows.length ? "Alle " + rows.length + " Indizes im Plus." : dn + " von " + rows.length + " Indizes im Minus.";
      var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
      S.push({ id: "indizes", bg: "k", toc: claim.replace(".", ""), html:
        '<div class="mb-in"><p class="mb-eye">Weltweit</p><h2 class="mb-claim">' + esc(claim) + '</h2><div class="mb-stack">' +
        rows.slice().sort(function (a, c) { return a.value - c.value; }).map(function (r) {
          return '<div class="mb-st"><b>' + esc(r.label) + '</b><div class="mb-tr"><i data-w="' + (Math.abs(r.value) / mx * 100).toFixed(1) + '"' + (r.value > 0 ? ' class="up"' : "") + '></i></div><span class="mb-v">' + pct(r.value) + "</span></div>"; }).join("") + "</div></div>" });
    }

    var sec = third.filter(function (c) { return !c.columns; })[0];
    if (topMc) {
      S.push({ id: "schwergewichte", bg: "w", toc: topMc.label + " " + pct(topMc.value, 0), html:
        '<div class="mb-in">' + (sec ? tag("Angabe Dritter · " + sec.publisher) : tag("Die Schwergewichte")) + '<div class="mb-huge" data-to="' + topMc.value + '" data-d="0">' + pct(topMc.value, 0) + "</div>" +
        '<h2 class="mb-claim mb-m">' + esc(sec ? sec.title : C.megacaps.title) + "</h2>" + (sec && sec.sub ? '<p class="mb-say">' + esc(sec.sub) + "</p>" : "") +
        '<div class="mb-pills">' + C.megacaps.bars.rows.slice(1).map(function (r) { return '<span class="mb-pair"><b>' + esc(r.label) + "</b>" + pill(r.value) + "</span>"; }).join("") + "</div></div>" });
    }

    if (C.valuation) {
      var val = C.valuation, vn = val.columns.rows[0], vmax = Math.max.apply(null, val.columns.rows.map(function (r) { return Math.max(r.values[0], r.values[1]); })) * 1.08;
      S.push({ id: "bewertung", bg: "l", toc: "Bewertung: " + val.title.replace(/^\w+: /, ""), html:
        '<div class="mb-in mb-duo"><div class="mb-col">' + tag("Eigene Auswertung") + '<p class="mb-eye">Bewertung ' + esc(vn.label) + ' · Kurs geteilt durch Gewinn</p><div class="mb-huge">' + num(vn.values[0], 0) + '<span class="mb-arrow"> → </span>' + num(vn.values[1], 0) + "</div>" +
        '<p class="mb-say">' + esc(val.title) + ". Grundlage sind die Gewinne der letzten vier gemeldeten Quartale.</p></div>" +
        '<div class="mb-db">' + val.columns.rows.map(function (r) { var a = r.values[0], c = r.values[1];
          return '<div class="mb-dbr"><b>' + esc(r.label) + '</b><div class="mb-trk"><i style="left:' + (Math.min(a, c) / vmax * 100).toFixed(1) + "%;width:" + (Math.abs(a - c) / vmax * 100).toFixed(1) + '%"></i><s style="left:' + (a / vmax * 100).toFixed(1) + '%"></s><u data-l="' + (c / vmax * 100).toFixed(1) + '" style="left:' + (a / vmax * 100).toFixed(1) + '%"></u></div><span>' + num(c) + "</span></div>"; }).join("") +
        '<div class="mb-leg"><span class="w">am 12-Monats-Hoch</span><span class="k">am ' + dmy(b.session) + "</span></div></div></div>" });
    }

    if (C.breadth) {
      var br = C.breadth, ad = br.pairs[0], hl = br.pairs[1], tot = ad.total || ad.a + ad.b, dnP = Math.round(ad.b / tot * 100), upP = Math.round(ad.a / tot * 100), dots = "";
      for (var k = 0; k < 100; k++) dots += '<i class="' + (k < upP ? "up" : k < 100 - dnP ? "fl" : "") + '" style="transition-delay:' + k * 9 + 'ms"></i>';
      S.push({ id: "marktbreite", bg: "k", toc: dnP + " % der Aktien im Minus", html:
        '<div class="mb-in mb-duo"><div class="mb-col">' + tag("Eigene Auswertung") + '<div class="mb-huge" data-to="' + dnP + '" data-d="0" data-plain="1">' + dnP + ' %</div><h2 class="mb-claim mb-m">der ' + num(tot, 0) + " US-Aktien schlossen im Minus.</h2>" +
        '<div class="mb-facts"><div><b>' + num(ad.a, 0) + "</b>gestiegen</div><div><b>" + num(ad.b, 0) + "</b>gefallen</div><div><b>" + hl.b + "</b>neue 52-Wochen-Tiefs, " + esc(hl.sub) + "</div></div></div>" +
        '<div class="mb-col"><div class="mb-dots" role="img" aria-label="' + upP + " von 100 Punkten gestiegen, " + dnP + ' gefallen">' + dots + '</div><div class="mb-leg"><span class="l">gestiegen</span><span class="g">unverändert</span><span class="w">gefallen</span><span>1 Punkt = 1 %</span></div></div></div>' });
    }

    if (C.context) {
      var cx = C.context, eps = cx.timeline.episodes || [];
      S.push({ id: "einordnung", bg: "w", toc: cx.title, html:
        '<div class="mb-in">' + tag("Eigene Auswertung") + '<h2 class="mb-claim">' + esc(cx.title) + '.</h2><p class="mb-say">' + esc(cx.sub) + " Jeder Punkt ist ein Handelstag, gruppiert nach Phasen.</p>" +
        '<div class="mb-eps">' + eps.map(function (e, i) {
          return '<div class="mb-ep' + (e.current ? " now" : "") + '"><b>' + MS[+e.from.slice(5, 7) - 1] + " " + e.from.slice(0, 4) + '</b><div class="mb-pts">' + e.days.map(function (d, j) { return '<i title="' + d[0].split("-").reverse().join(".") + ": " + pct(d[1]) + '" style="transition-delay:' + (i * 80 + j * 60) + 'ms"></i>'; }).join("") + "</div><span>" + pct(e.extreme) + "</span></div>"; }).join("") + "</div>" +
        '<div class="mb-facts">' + (cx.stats || []).map(function (s) { return "<div><b>" + pct(s.value) + "</b>" + esc(s.label) + ", " + esc(s.sub) + "</div>"; }).join("") + "</div></div>" });
    }

    third.filter(function (c) { return c.columns; }).forEach(function (f, n) {
      var r = f.columns.rows, last = r[r.length - 1].values[0];
      S.push({ id: "dritte-" + (n + 1), bg: "l", toc: f.title, html:
        '<div class="mb-in mb-duo"><div class="mb-col">' + tag("Angabe Dritter · " + f.publisher) + '<div class="mb-huge" data-to="' + last + '" data-d="0" data-plain="1">' + num(last, 0) + ' %</div><h2 class="mb-claim mb-m">' + esc(f.title) + ".</h2>" + (f.sub ? '<p class="mb-say">' + esc(f.sub) + "</p>" : "") + "</div>" +
        '<div class="mb-colb">' + r.map(function (x) { return '<div><span>' + num(x.values[0], 0) + ' %</span><i class="' + (x.highlight ? "on" : "") + '" data-h="' + x.values[0] + '"></i><small>' + esc(x.label) + "</small></div>"; }).join("") + "</div></div>" });
    });

    if (C.movers) {
      S.push({ id: "bewegungen", bg: "w", toc: "Größte Bewegungen", html:
        '<div class="mb-in mb-duo mb-top"><div class="mb-col"><p class="mb-eye">Einzelwerte</p><h2 class="mb-claim">Die größten Bewegungen des Tages.</h2><p class="mb-say">Größte Anstiege und Rückgänge liquider US-Aktien am ' + dmy(b.session) + '.</p></div><div class="mb-list">' +
        C.movers.groups.map(function (g) { return '<p class="mb-sub">' + esc(g.label) + "</p>" + g.rows.map(function (r) { return '<div class="mb-lr"><span class="mb-lg">' + esc(r.label.slice(0, 4)) + '</span><span class="mb-t">' + esc(r.label) + "<small>" + esc(r.sub) + "</small></span>" + pill(r.value) + "</div>"; }).join(""); }).join("") + "</div></div>" });
    }

    if (C.rates) {
      var rt = C.rates;
      S.push({ id: "zinsen", bg: "k", toc: rt.title, html:
        '<div class="mb-in"><p class="mb-eye">Zinsen und Sachwerte</p><h2 class="mb-claim">' + esc(rt.title) + '.</h2><div class="mb-stack">' +
        rt.bars.rows.map(function (r) { return '<div class="mb-st"><b>' + esc(r.label) + '</b><div class="mb-tr"><i class="up" data-w="' + Math.min(100, Math.abs(r.value) / 16 * 100).toFixed(1) + '"></i></div><span class="mb-v">' + sg(r.value) + num(r.value, 0) + " bp</span></div>"; }).join("") +
        (rt.bars2 ? rt.bars2.rows.map(function (r) { return '<div class="mb-st"><b>' + esc(r.label) + '</b><div class="mb-tr"><i data-w="' + Math.min(100, Math.abs(r.value) / 6 * 100).toFixed(1) + '"></i></div><span class="mb-v">' + pct(r.value) + "</span></div>"; }).join("") : "") +
        '</div><p class="mb-note">Renditen in Basispunkten (neongrün): Fallende Renditen bedeuten steigende Anleihekurse.</p></div>' });
    }

    if (C.picture) {
      var pic = C.picture, a50 = pic.textStats.filter(function (s) { return s.label === "Marktbreite"; })[0];
      var ring = function (s, big) {
        var t = Math.max(0, Math.min(1, (s.value - s.min) / (s.max - s.min))), L = 2 * Math.PI * 46;
        var txt = s.unit === "COUNT" ? s.value + "/" + s.max : (s.min < 0 ? sg(s.value) : "") + num(s.value, 0) + "%";
        return '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="12"/>' +
          (t > 0 ? '<circle class="mb-ar" cx="60" cy="60" r="46" fill="none" stroke="#c8f531" stroke-width="12" stroke-linecap="round" data-d="' + (L * t).toFixed(1) + " " + L.toFixed(1) + '" stroke-dasharray="' + (L * t).toFixed(1) + " " + L.toFixed(1) + '" transform="rotate(-90 60 60)"/>' : "") +
          '<text x="60" y="69" text-anchor="middle" font-size="' + (big ? 26 : 24) + '" font-weight="900" fill="currentColor">' + txt + "</text></svg>"; };
      S.push({ id: "marktbild", bg: "w", toc: "Unser Marktbild", html:
        '<div class="mb-in">' + tag("Eigene Auswertung") + (a50 ? '<div class="mb-gauge">' + ring(a50, true) + '<div class="mb-col"><span class="mb-pill dn">Vorsichtig</span><h2 class="mb-claim mb-m">Nur ' + Math.round(a50.value) + " von 100 Aktien über der 50-Tage-Linie.</h2><p class=\"mb-say\">Vortag " + num(a50.previous, 0) + " %. " + esc(pic.title) + ".</p></div></div>" : "") +
        '<div class="mb-rings">' + pic.textStats.filter(function (s) { return s !== a50; }).map(function (s) { return '<div class="mb-rg">' + ring(s) + "<b>" + esc(s.label) + "</b><small>" + esc(s.text) + "</small></div>"; }).join("") + '</div><p class="mb-note">' + esc(pic.note) + "</p></div>" });
    }

    S.push({ id: "ende", bg: "l", toc: "Karten, PDF und Quellen", html:
      '<div class="mb-in"><p class="mb-eye">Das war der Börsentag</p><h2 class="mb-claim mb-h1">' + b.cards.length + ' Karten zum Teilen.</h2><p class="mb-say">Dieselben Grafiken als Story, als PDF und in der App.</p><div class="mb-acts">' + play + pdf + "</div>" +
      (o.archive && o.archive.length > 1 ? '<nav class="mb-arch" aria-label="Frühere Ausgaben"><p class="mb-sub">Frühere Ausgaben</p>' + o.archive.slice(0, 15).map(function (d) { return '<a href="' + o.base + "marktbriefing/" + d + "/" + '"' + (d === b.session ? ' aria-current="page"' : "") + ">" + dmy(d) + d.slice(0, 4) + "</a>"; }).join("") + "</nav>" : "") +
      '<details class="mb-src"><summary>Quellen und Hinweise</summary><ul>' + b.cards.map(function (c) { return "<li>" + esc(c.title) + ": " + esc(c.source) + (c.url ? ' · <a href="' + esc(c.url) + '" rel="noopener">Originalquelle</a>' : "") + "</li>"; }).join("") + "</ul>" +
      "<p>Marktbriefing zum US-Handelstag " + esc(day) + ". Indizes über ETF-Proxies, Kurse zum Tagesschluss und im Tagesverlauf verzögert. Renditen: US Treasury und Bundesbank. Fundamentaldaten: SEC EDGAR. Marktbreite, Einordnung, Bewertung und Marktbild: eigene Auswertungen von Vision Universe. Angaben Dritter geben die genannte Quelle wieder.</p>" +
      "<p>Redaktionelle Einordnung, keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. " + esc(b.notes.forecast) + "</p></details></div>" });
    return S;
  }

  /* Seite. o: { chrome: {top, bottom} aus landing/news/index.html (Pfade für Tiefe 1), latest, archive, depth (1|2), pdf, image } */
  function page(b, o) {
    o = o || {};
    var depth = o.depth || 1, base = depth === 2 ? "../../" : "../";
    var S = scenes(b, { pdf: o.pdf, archive: o.archive, latest: o.latest, base: base });
    var C = {}; b.cards.forEach(function (c) { C[c.id] = c; });
    var path = "/marktbriefing/" + b.session + "/";
    var url = SITE + path, day = longDate(b.session);
    var title = "Börse am " + dmy(b.session) + b.session.slice(0, 4) + ": " + C.overview.title + " | Marktbriefing";
    var desc = (b.summary || []).slice(0, 2).join(" ").slice(0, 300);
    var img = o.image ? SITE + o.image : SITE + "/assets/share/news.jpg";
    var tape = C.overview.chart ? { QQQ: C.overview.chart.points, SPY: C.overview.chart.spy, month: C.overview.chart.month, close: { QQQ: (C.indices.bars.rows.filter(function (r) { return r.label === "Nasdaq 100"; })[0] || {}).value, SPY: (C.indices.bars.rows.filter(function (r) { return r.label === "S&P 500"; })[0] || {}).value }, day: day } : null;
    var ld = { "@context": "https://schema.org", "@type": "NewsArticle", headline: C.overview.title, description: desc, inLanguage: "de-DE",
      datePublished: b.generatedAt, dateModified: b.generatedAt, mainEntityOfPage: url, url: url, image: [img], articleSection: "Marktbriefing",
      author: { "@type": "Organization", name: "Vision Universe", url: SITE + "/" },
      publisher: { "@type": "Organization", name: "Vision Universe", logo: { "@type": "ImageObject", url: SITE + "/assets/vision-universe-logo-web.png" } },
      about: (C.megacaps ? C.megacaps.bars.rows.slice(0, 3) : []).map(function (r) { return { "@type": "Corporation", tickerSymbol: r.label }; }),
      isAccessibleForFree: true };
    var crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Vision Universe", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Marktbriefing", item: SITE + "/marktbriefing/" }].concat([{ "@type": "ListItem", position: 3, name: "Börsenschluss " + dmy(b.session) + b.session.slice(0, 4), item: url }]) };
    var shift = function (h) { return depth === 2 ? h.replace(/(["'(])\.\.\//g, "$1../../") : h; };
    var chrome = o.chrome || { top: "", bottom: "" };
    var cards = b.cards.map(function (c, i) { return '<template data-mb-card="' + i + '">' + Render.cardSvg(c, i, b.cards.length, b.session) + "</template>"; }).join("");
    return "<!doctype html>\n<html lang=\"de\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
      "<title>" + esc(title) + "</title>\n<meta name=\"description\" content=\"" + esc(desc) + "\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n" +
      '<link rel="canonical" href="' + url + '">\n<meta property="og:type" content="article">\n<meta property="og:site_name" content="Vision Universe">\n<meta property="og:locale" content="de_DE">\n' +
      '<meta property="og:url" content="' + url + '">\n<meta property="og:title" content="' + esc(C.overview.title + " · Marktbriefing") + '">\n<meta property="og:description" content="' + esc(desc) + '">\n<meta property="og:image" content="' + img + '">\n' +
      '<meta name="twitter:card" content="summary_large_image">\n<meta property="article:published_time" content="' + esc(b.generatedAt) + '">\n' +
      '<meta name="theme-color" content="#ffffff">\n<link rel="icon" href="' + base + 'assets/icon-192.png" type="image/png">\n<link rel="apple-touch-icon" href="' + base + 'assets/apple-touch-icon.png">\n<link rel="preload" href="' + base + 'assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="' + base + 'web/site.css">\n<link rel="stylesheet" href="' + base + 'marktbriefing/mb.css">\n' +
      '<script src="' + base + 'web/site.js" defer></script>\n<script src="' + base + 'web/consent.js" defer></script>\n<script src="' + base + 'marktbriefing/mb.js" defer></script>\n<meta name="vu-ga" content="">\n' +
      ldTag(ld) + "\n" + ldTag(crumbs) + "\n" + NAV_HEAD + "</head>\n<body>" + NAV_BODY + "\n" + shift(chrome.top) + "\n" +
      '<main id="inhalt" class="mb" data-session="' + b.session + '">\n<div class="mb-bars" aria-hidden="true">' + S.map(function () { return "<i></i>"; }).join("") + "</div>\n" +
      '<aside class="mb-nav" aria-label="Kapitel"><a class="mb-back" href="../">← Alle Ausgaben</a><p class="mb-brand"><span class="mb-logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#c8f531" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg></span>Marktbriefing</p><p class="mb-stamp"><i></i>Börsenschluss ' + dmy(b.session) + '</p><ol class="mb-toc">' +
      S.map(function (s, i) { return '<li><a href="#' + s.id + '" data-go="' + i + '"><b>' + (i < 9 ? "0" : "") + (i + 1) + "</b><span>" + esc(s.toc) + "</span></a></li>"; }).join("") + '</ol><div class="mb-navfoot"><button class="mb-btn" type="button" data-mb-play>▶ Als Karten ansehen</button>' + (o.pdf ? '<a class="mb-btn mb-soft" href="' + esc(o.pdf) + '" download>PDF herunterladen</a>' : "") + "</div></aside>\n" +
      '<div class="mb-scenes">' + S.map(function (s, i) { return '<section class="mb-sc ' + s.bg + '" id="' + s.id + '" data-i="' + i + '" aria-label="' + esc(s.toc) + '">' + s.html + "</section>"; }).join("\n") + "</div>\n" +
      '<div class="mb-story" role="dialog" aria-modal="true" aria-label="Karten ansehen" hidden><div class="mb-stage"><div class="mb-prog"></div><button class="mb-x" type="button" aria-label="Schließen">✕</button><div class="mb-slide"></div><button class="mb-hit l" type="button" aria-label="Zurück"></button><button class="mb-hit r" type="button" aria-label="Weiter"></button></div></div>\n' +
      cards + "\n" + (tape ? '<script type="application/json" id="mb-tape">' + JSON.stringify(tape).replace(/</g, "\\u003c") + "</script>\n" : "") +
      "</main>\n" + shift(chrome.bottom) + "\n</body>\n</html>\n";
  }

  /* Kopf und Fuß aus landing/news/index.html: alles zwischen <body> und <main>, alles nach </main>. News-Markierung wird zum Marktbriefing. */
  function chromeFrom(newsHtml) {
    var bodyStart = newsHtml.indexOf(">", newsHtml.indexOf("<body")) + 1;
    var top = newsHtml.slice(bodyStart, newsHtml.indexOf("<main"));
    var bottom = newsHtml.slice(newsHtml.indexOf("</main>") + 7, newsHtml.lastIndexOf("</body>"));
    top = top.replace(/<vu-navigation><\/vu-navigation><script src="\/assets\/site-navigation\.js"><\/script>/g, "")
      .replace(/ aria-current="page"/g, "").replace(/href="\.\.\/marktbriefing\/"/g, 'href="../marktbriefing/" aria-current="page"');
    return { top: top.trim(), bottom: bottom.trim() };
  }

  /* Produktseite /marktbriefing/ wie Magazin und Aktienreport (Bausteine pvhero, m3, pvabout, pvpeek, pvtoc, pvend aus
     landing/web/site.css). o: { chrome, parts: {dot, soon, stores} aus landing/report/index.html, archive, pdf, img } */
  function productPage(b, o) {
    var C = {}; b.cards.forEach(function (c) { C[c.id] = c; });
    var chrome = o.chrome || { top: "", bottom: "" }, P = o.parts || {}, ed = b.session + "/", img = o.img || {};
    var title = "Das Marktbriefing: der Börsentag in Szenen | Vision Universe";
    var desc = "Was an der Börse los war, als Story zum Durchwischen: eine Aussage je Bildschirm, eigene Auswertungen und Grafiken. Aktuelle Ausgabe: " + C.overview.title + " (" + dmy(b.session) + b.session.slice(0, 4) + ").";
    var cta = function (href, text) { return '<a class="btn" href="' + href + '"><span>' + esc(text) + "</span>" + (P.dot || "") + "</a>"; };
    var peek = (img.cards || []).map(function (c) { return '<figure class="pvp mbp"><a href="' + ed + "#" + c.anchor + '"><img src="' + ed + c.file + '" alt="' + esc(c.title) + '" loading="lazy"></a><figcaption>' + esc(c.kicker) + "</figcaption></figure>"; }).join("");
    var ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Marktbriefing", url: SITE + "/marktbriefing/", description: desc, inLanguage: "de-DE",
      publisher: { "@type": "Organization", name: "Vision Universe", url: SITE + "/" },
      hasPart: (o.archive || [b.session]).slice(0, 20).map(function (d) { return { "@type": "NewsArticle", url: SITE + "/marktbriefing/" + d + "/", datePublished: d }; }) };
    var main = '<main id="inhalt" class="w"><section class="ahero pvhero" data-hero><div>' +
      '<p class="k pvk">Marktbriefing · Börsenschluss ' + dmy(b.session) + b.session.slice(0, 4) + " · " + b.cards.length + " Karten</p>" +
      "<h1>Das <mark>Marktbriefing.</mark></h1>" +
      '<p class="t">Was an der Börse los war, als Story zum Durchwischen: eine Aussage je Bildschirm, eigene Auswertungen und Grafiken zum Teilen.</p>' +
      '<div class="pvcta">' + cta(ed, "Aktuelle Ausgabe ansehen") + "</div>" +
      (o.pdf ? '<p class="mbpdf"><a href="' + ed + esc(o.pdf) + '" download>Als PDF herunterladen</a> · ' + (b.cards.length + 4) + " Seiten</p>" : "") +
      '</div><div class="pvcover"><a class="mbcov" href="' + ed + '" aria-label="Aktuelle Ausgabe ansehen"><div class="m3 pvm" aria-hidden="true">' +
      (img.p1 ? '<span class="pg p1"><img src="' + ed + img.p1 + '" alt=""></span>' : "") + (img.p2 ? '<span class="pg p2"><img src="' + ed + img.p2 + '" alt=""></span>' : "") +
      (img.cover ? '<span class="cv"><img src="' + ed + img.cover + '" alt=""><i class="shine"></i></span>' : "") +
      '</div></a><p class="pvnow"><small>Aktuelle Ausgabe</small><b>' + esc(C.overview.title) + "</b></p></div></section>" +
      '<section class="full pvabout"><h2>Was ist das?</h2><div class="pvgrid"><div><p class="t">Das Marktbriefing erzählt einen Börsentag in Szenen: was passiert ist, wie es einzuordnen ist und was dahintersteckt. Am Handy zum Wischen, am Rechner mit Kapiteln, dazu als PDF.</p>' +
      '<ul class="pvwhat"><li>Indizes, Schwergewichte, Zinsen und Sachwerte zum Börsenschluss</li><li>Eigene Auswertungen: Marktbreite, historische Einordnung, Bewertung</li><li>Nachrichten des Tages mit Quelle, als Angabe Dritter gekennzeichnet</li><li>Alle Grafiken als Story-Karten zum Teilen und als PDF</li></ul></div>' +
      '<div class="pvissue"><span class="k">Aktuelle Ausgabe · ' + dmy(b.session) + b.session.slice(0, 4) + "</span><h3>" + esc(C.overview.title) + "</h3><p>" + esc((b.summary || []).slice(0, 2).join(" ")) + '</p><p><a class="mbmore" href="' + ed + '">Ausgabe ansehen →</a></p></div></div></section>' +
      (peek ? '<section class="full"><h2>Ein Blick hinein</h2><p class="t pvnote">Drei von ' + b.cards.length + ' Karten der aktuellen Ausgabe. Antippen öffnet die Ausgabe an dieser Stelle.</p><div class="pvpeek">' + peek + "</div></section>" : "") +
      '<section class="full"><h2>Das steht drin</h2><ol class="pvtoc">' + b.cards.map(function (c, i) { return "<li><b>" + (i + 1) + "</b><span><small>" + esc(c.kicker) + "</small>" + esc(c.title) + "</span></li>"; }).join("") + "</ol></section>" +
      ((o.archive || []).length > 1 ? '<section class="full"><h2>Frühere Ausgaben</h2><p class="mbarch">' + o.archive.slice(1, 30).map(function (d) { return '<a href="' + d + '/">' + dmy(d) + d.slice(0, 4) + "</a>"; }).join("") + "</p></section>" : "") +
      '<section class="full pvend"><div class="pvbox">' + (P.soon || "") + "<h2>Bald auch in der App.</h2><p class=\"t\">Das Marktbriefing gibt es in der App mit allen Kursen zum Antippen. Trag dich ein, dann sagen wir dir Bescheid, sobald die App da ist.</p>" +
      '<div class="pvcta">' + cta("../#newsletter", "Zum Start benachrichtigen") + "</div>" + (P.stores || "") + "</div></section></main>";
    return "<!doctype html>\n<html lang=\"de\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>" + esc(title) + "</title>\n<meta name=\"description\" content=\"" + esc(desc) + "\">\n" +
      '<meta name="robots" content="noindex, nofollow">\n<link rel="canonical" href="' + SITE + '/marktbriefing/">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Vision Universe">\n<meta property="og:locale" content="de_DE">\n' +
      '<meta property="og:url" content="' + SITE + '/marktbriefing/">\n<meta property="og:title" content="Das Marktbriefing · Vision Universe">\n<meta property="og:description" content="' + esc(desc) + '">\n' +
      (img.cover ? '<meta property="og:image" content="' + SITE + "/marktbriefing/" + ed + img.cover + '">\n' : "") + '<meta name="twitter:card" content="summary_large_image">\n<meta name="theme-color" content="#ffffff">\n' +
      '<link rel="icon" href="../assets/icon-192.png" type="image/png">\n<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">\n<link rel="preload" href="../assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>\n' +
      '<link rel="stylesheet" href="../web/site.css">\n<link rel="stylesheet" href="../marktbriefing/mb.css">\n<script src="../web/site.js" defer></script>\n<script src="../web/consent.js" defer></script>\n<meta name="vu-ga" content="">\n' +
      ldTag(ld) + "\n" + NAV_HEAD + "</head>\n<body>" + NAV_BODY + "\n" + chrome.top + "\n" + main + "\n" + chrome.bottom + "\n</body>\n</html>\n";
  }

  /* Bausteine aus landing/report/index.html: Pfeil im Knopf, „Bald in der App“, Store-Abzeichen (eine Quelle für das Aussehen). */
  function partsFrom(reportHtml) {
    var pick = function (re) { var m = reportHtml.match(re); return m ? m[0] : ""; };
    return { dot: pick(/<span class="dot">[\s\S]*?<\/svg><\/span>/), soon: pick(/<p class="soon">[\s\S]*?<\/p>/), stores: pick(/<div class="stores">[\s\S]*?<\/p><\/div>/) };
  }

  /* Teaser für die Startseite (Region <!--MB:teaser--> in landing/index.html). */
  function teaser(b, href) {
    var C = {}; b.cards.forEach(function (c) { C[c.id] = c; });
    var IX = {}; (C.indices ? C.indices.bars.rows : []).forEach(function (r) { IX[r.label] = r.value; });
    var chips = ["Nasdaq 100", "S&P 500", "Dow Jones"].filter(function (n) { return IX[n] != null; }).map(function (n) { return "<i>" + esc(n) + "<em>" + pct(IX[n]) + "</em></i>"; });
    if (C.megacaps) chips.push("<i>" + esc(C.megacaps.bars.rows[0].label) + "<em>" + pct(C.megacaps.bars.rows[0].value) + "</em></i>");
    return '<a class="mbt" href="' + href + '"><span class="mbt-k">Marktbriefing · Börsenschluss ' + dmy(b.session) + b.session.slice(0, 4) + '</span><b class="mbt-h">' + esc(C.overview.title) + '</b><span class="mbt-c">' + chips.join("") + '</span><span class="mbt-go">Briefing ansehen →</span></a>';
  }
  function withTeaser(indexHtml, b) {
    var a = "<!--MB:teaser-->", z = "<!--/MB:teaser-->", i = indexHtml.indexOf(a), j = indexHtml.indexOf(z);
    if (i < 0 || j < i) return indexHtml;
    return indexHtml.slice(0, i + a.length) + teaser(b, "./marktbriefing/") + indexHtml.slice(j);
  }

  var api = { page: page, scenes: scenes, chromeFrom: chromeFrom, productPage: productPage, partsFrom: partsFrom, teaser: teaser, withTeaser: withTeaser, SITE: SITE };
  if (isNode) module.exports = api;
  else global.VUMarketBriefingWww = api;
})(typeof window !== "undefined" ? window : globalThis);
