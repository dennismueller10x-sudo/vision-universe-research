/* Musterseite der Bausteine C01–C20 (Redesign 2027, Folie C). Intern, nur Darstellung.
   Beispielwerte aus der Vorlage (Stand 30.10.2026); der Chart zeigt die echte NVDA-Kursreihe. */
(function () {
  "use strict";
  var U = window.VUUI, C = window.VUChart, kit = document.getElementById("kit");
  if (!U || !C || !kit) return;
  var NV = { ticker: "NVDA", name: "NVIDIA", what: "Chips für KI und Grafik", price: 204.64, currency: "USD", changePct: -4.22, dateLabel: "Schluss Fr. 30.10.", eurLabel: "183,17 €", backHref: "/status/" };

  function box(id, title, inner) {
    return '<section class="bk-c" id="' + id + '"><div class="bk-h"><b>' + id + "</b><span>" + U.esc(title) + "</span></div>" + inner + "</section>";
  }
  function dockPreview(world, active) {
    var nav = window.VUNavigation && window.VUNavigation.products ? window.VUNavigation.products() : [];
    var p = nav.filter(function (x) { return x.id === world; })[0];
    if (!p) return U.blank("Produkt-Leiste nicht geladen.");
    return '<div class="bk-dock" role="img" aria-label="Produkt-Leiste ' + U.esc(p.label) + '">' + p.items.map(function (it, i) {
      return '<span class="' + (i === active ? "on" : "") + '">' + (i ? "" : U.worldIcon(p.id, 20)) + "<span>" + U.esc(it.label) + "</span></span>";
    }).join("") + "<span>☰<span>Menü</span></span></div>";
  }

  kit.innerHTML = [
    box("C01", "Kopfzeile", '<p class="vu-sm vu-mu">Oben auf dieser Seite: links die Welt oder das Logo, rechts Suche, Atlas, Mein Bereich (assets/site-navigation.js).</p>'),
    box("C02", "Produkt-Leiste", dockPreview("supertrader", 2) + '<p class="vu-xs vu-mu" style="margin-top:8px">Fünf Plätze: Start der Welt, drei Bereiche, Menü. Aktiver Platz neongrün.</p>'),
    box("C03", "Menü", '<p class="vu-sm vu-mu">Vollbild, Schwarz, 3 × 3 Produkte, Mein Bereich, Darstellung und Währung. Siehe N3.</p><p style="margin-top:10px"><button type="button" class="vu-btn vu-btn--ink vu-btn--sm" id="open-menu">Menü öffnen</button></p>'),
    box("C04", "Aktienkopf", U.stockHead(NV, { persp: false })),
    box("C05", "Perspektiven-Leiste", U.persp("NVDA", { active: "fundamental" })),
    box("C06", "Der eine Chart", '<div id="chart"></div>'),
    box("C07", "Kursbewegung", '<div class="bk-row">' + U.chg(3.12, { big: true }) + U.chg(-4.22, { big: true }) + U.chg(0.4) + "</div>"),
    box("C08", "Urteil", '<div class="bk-row">' + U.verdict("strong") + U.verdict("mid") + U.verdict("weak") + U.verdict("none") + "</div>"),
    box("C09", "Erklärung „?“", U.help("KGV 25,9: Du zahlst 25,90 $ für 1 $ Jahresgewinn.") + '<p class="vu-sm" style="margin-top:10px">KGV 25,9' + U.q("KGV 25,9: Du zahlst 25,90 $ für 1 $ Jahresgewinn.", "KGV") + "</p>"),
    box("C10", "Aktienzeile", '<div id="rows"></div>'),
    box("C11", "Kachel", '<div class="vu-grid">' + U.tile("Umsatz 12 Monate", "303,0 Mrd. $", "+83,4 %") + U.tile("KGV", "25,9", "Bewertung") + "</div>"),
    box("C12", "Navigationskarte", U.navcard({ href: "/supertrader/", icon: "supertrader", title: "Regeln berühmter Trader", sub: "13 Methoden" })),
    box("C13", "Abschnittstitel", U.sect("Meine Aktien", { href: "/discover/#/watchlist", link: "Alle", level: 3 })),
    box("C14", "Reiter / Segment", U.seg([{ id: "u", label: "Umsatz" }, { id: "g", label: "Gewinn" }, { id: "c", label: "Cashflow" }], "u", { label: "Kennzahl" })),
    box("C15", "Schalter", '<div class="bk-row">' + U.toggle(true, "Benachrichtigen") + U.toggle(false, "Aus") + "</div>"),
    box("C16", "Sheet", '<p class="vu-sm vu-mu">Von unten, abgerundet, Griff oben, dunkler Hintergrund. Für Erklärungen, Filter, Merken.</p><p style="margin-top:10px"><button type="button" class="vu-btn vu-btn--sm" id="open-sheet">Sheet öffnen</button></p>' +
      U.sheet("demo-sheet", "Filter", U.help("Ein Sheet hält Erklärungen, Filter und Merken.") + '<p style="margin-top:14px"><button type="button" class="vu-btn vu-btn--block" id="close-sheet">Fertig</button></p>')),
    box("C17", "Balken", U.bars([["2017", 9.7], ["2018", 11.7], ["2019", 10.9], ["2020", 16.7], ["2021", 26.9], ["2022", 27.0], ["2023", 60.9], ["2024", 130.5], ["2025", 216.0], ["2026", 303.0]], { label: "Umsatz je Jahr in Mrd. $ (Beispiel)" }) + '<div style="margin-top:12px">' + U.meter(86, { label: "Wachstum" }) + '</div><div style="margin-top:8px">' + U.meter(64, { lime: true, label: "Kursstärke" }) + "</div>"),
    box("C18", "Leerer Zustand", U.blank("Keine belastbare Zählung. Wir zeigen nichts Erfundenes.")),
    box("C19", "PRO-Marke", '<div class="bk-row">' + U.pro() + '<span class="vu-sm vu-mu">für Profi-Inhalte</span>' + U.research() + "</div>"),
    box("C20", "Suche", U.search())
  ].join("");

  /* C06 und C10 mit echten Kursreihen (Kurshistorie aus dem Repository). */
  function series(t) {
    return fetch("/quant/data/market/discover-series/ref_" + t + ".json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  series("NVDA").then(function (s) {
    var host = document.getElementById("chart");
    if (!s || !s.points) { host.innerHTML = U.blank("Kursreihe nicht geladen."); return; }
    var pts = s.points, n = pts.length;
    var cut = function (days) { var to = Date.parse(pts[n - 1][0]); return pts.filter(function (p) { return to - Date.parse(p[0]) <= days * 864e5; }); };
    C.mount(host, {
      label: "NVIDIA", currency: s.currency, initial: "1J",
      ranges: [
        { id: "1T", label: "1T", disabled: true, reason: "Intraday nur in den Welten" },
        { id: "1W", label: "1W", points: cut(7) }, { id: "1M", label: "1M", points: cut(31) }, { id: "1J", label: "1J", points: pts },
        { id: "5J", label: "5J", disabled: true, reason: "Lange Reihe in den Welten" }, { id: "Max", label: "Max", disabled: true, reason: "Lange Reihe in den Welten" }
      ]
    });
  });
  var ROWS = [["NVDA", "NVIDIA", "Chips für KI und Grafik"], ["AMD", "Advanced Micro Devices", "Prozessoren und Grafikchips"]];
  Promise.all(ROWS.map(function (r) { return series(r[0]); })).then(function (list) {
    document.getElementById("rows").innerHTML = list.map(function (s, i) {
      var v = s && s.points ? s.points.slice(-60).map(function (p) { return p[1]; }) : null;
      var last = v && v[v.length - 1], prev = v && v[v.length - 2];
      return U.stockRow({ ticker: ROWS[i][0], name: ROWS[i][1], sub: ROWS[i][2], series: v, price: last, currency: s && s.currency, changePct: v ? (last / prev - 1) * 100 : null, href: "/discover/#/s/US_REAL/" + ROWS[i][0] });
    }).join("");
  });

  document.getElementById("open-menu").addEventListener("click", function () {
    var nav = document.querySelector("vu-navigation"), b = nav && nav.shadowRoot && nav.shadowRoot.querySelector("button.toggle");
    if (b) b.click();
  });
  var sh = document.getElementById("demo-sheet");
  document.getElementById("open-sheet").addEventListener("click", function () { U.openSheet(sh); });
  document.getElementById("close-sheet").addEventListener("click", function () { U.closeSheet(sh); });
  U.bindHelp(document);
})();
