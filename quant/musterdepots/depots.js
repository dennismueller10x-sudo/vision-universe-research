/* =========================================================================
   VISION UNIVERSE QUANT — musterdepots/depots.js        Quant-Musterdepots

   Liest genau ein Artefakt: /quant/data/product/model-depots-v1.json
   (Erzeuger scripts/quant/portfolio/model-depots.cjs, Workflow quant-model-depots.yml).
   Keine Backtest-Renditen. Die Wertentwicklung ab Live-Start (je Depot aus nav, je Position Schluss heute gegen
   Aufnahmekurs) erscheint nur, wenn der Export performance.state = PUBLISHED führt (Owner-Freigabe 06.11.2026, Plan §11). Bausteine aus assets/vu-ui.js.
   Aussehen nach App-Konzept 2 (Owner 14.11.2026, nur Darstellung): dunkle Kopfkachel mit Frage und Eckdaten, die fünf Depots als
   Schiene, „Alle N“ öffnet den ganzen Bestand im Fenster, „Weiter“-Karte am Seitenende. Der Abschnitt zur Wertentwicklung ist unverändert.

     /quant/musterdepots/                 Übersicht der fünf Depots
     /quant/musterdepots/#/<profil>       ein Depot: Regel, Bestand, Umschichtungen, Datenstand
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUQuantDepots = api;
  if (root.document && root.document.getElementById("md-main")) api.start(root.document);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  var U = root.VUUI;
  var DATA = "/quant/data/product/model-depots-v1.json";
  var LABEL = "Rechenmodell, kein echtes Geld";
  function esc(s) { return U ? U.esc(s) : String(s == null ? "" : s); }
  function dDe(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || "")); return m ? m[3] + "." + m[2] + "." + m[1] : "–"; }
  function pctW(w) { return typeof w === "number" && isFinite(w) ? U.num(w * 100, 1) + " %" : "–"; }
  function stockHref(t) { return "/quant/#/aktie/" + encodeURIComponent(t); }

  /* ---------------------------------------------------------------- Modell (rein, testbar) */
  function lastChanges(depot) {
    var log = depot.protocol || [], last = log.length ? log[log.length - 1].date : null;
    var at = log.filter(function (e) { return e.date === last; });
    return { date: last, rein: at.filter(function (e) { return e.action === "REIN"; }), raus: at.filter(function (e) { return e.action === "RAUS"; }) };
  }
  function groupedLog(depot) {
    var by = {}, order = [];
    (depot.protocol || []).forEach(function (e) { if (!by[e.date]) { by[e.date] = { date: e.date, rein: [], raus: [] }; order.push(e.date); } by[e.date][e.action === "REIN" ? "rein" : "raus"].push(e); });
    return order.reverse().map(function (d) { return by[d]; });
  }
  function validate(doc) {
    if (!doc || doc.schemaVersion !== "model-depots-1.0.0" || doc.label !== LABEL || doc.recommendation !== false || !Array.isArray(doc.depots)) return "SCHEMA";
    return null;
  }

  /* ---------------------------------------------------------------- Ansichten (Redesign 2027: VUUI-Bausteine) */
  var NAMES = {};
  function nameOf(t) { return NAMES[t] || t; }
  function published(doc) { return !!(doc.performance && doc.performance.state === "PUBLISHED"); }
  /* Veränderung seit Aufnahme: veröffentlichter Schluss heute gegen Aufnahmekurs (beides aus dem Export). Nur mit Freigabe. */
  function sinceEntry(p) { return typeof p.lastPrice === "number" && typeof p.entryPrice === "number" && p.entryPrice > 0 ? (p.lastPrice / p.entryPrice - 1) * 100 : null; }
  function navChange(depot) { var n = depot && depot.nav; return Array.isArray(n) && n.length ? { pct: (n[n.length - 1][1] - 1) * 100, date: n[n.length - 1][0] } : null; }
  function label() { return '<p class="md-label">' + U.glyph("check", 14) + "<span>" + LABEL + "</span></p>"; }
  /* Bausteine aus App-Konzept 2 (vu-ui-1.4.0); liegt noch eine ältere vu-ui.js im Cache, gilt die schlichte Form. */
  function tap(body, o) { return U.tap ? U.tap(body, o) : '<a class="vu-tap ' + esc(o.cls || "") + '" href="' + esc(o.href) + '">' + body + "</a>"; }
  function rail(items, o) { return U.rail ? U.rail(items, o) : '<div class="vu-stack">' + items.join("") + "</div>"; }
  function next(o) { return U.next ? U.next(o) : '<div class="vu-stack">' + U.navcard({ glyph: "grid", title: o.title, sub: o.sub, href: o.href }) + "</div>"; }
  function tiles(list) { return '<div class="vu-grid md-tiles">' + list.map(function (t) { return U.tile(t[0], t[1], t[2]); }).join("") + "</div>"; }
  /* „Alle N“: der vollständige Inhalt steht in einem <template> und öffnet sich im Fenster (start bindet den Klick). */
  function popButton(text, tpl, title) { return '<button type="button" class="md-all" aria-haspopup="dialog" data-md-pop="' + tpl + '" data-md-pop-title="' + esc(title) + '">' + esc(text) + "</button>"; }
  function sectAll(title, button) { return '<div class="vu-sect"><h2>' + esc(title) + "</h2>" + (button || "") + "</div>"; }
  function head(doc) {
    return '<header class="md-head vu-night"><p class="vu-ltag">Quant · Musterdepots</p><h1 class="md-head__q">Was die Regeln heute halten</h1>' +
      '<p class="md-head__lead">Fünf Quant-Profile als Musterdepot: Jedes nimmt Aktien streng nach seiner Regel auf und schichtet einmal im Monat um. So sieht man, was eine Methode tut, nicht, was du tun solltest.</p>' + label() +
      tiles([["Live seit", dDe(doc.liveStart)], ["Datenstand", dDe(doc.asOf)], ["Umschichtung", "monatlich"], ["Depots", String(doc.depots.length)]]) + "</header>";
  }
  function performance(doc, depot) {
    if (published(doc)) {
      var rows = (depot ? [depot] : doc.depots).map(function (d) { var c = navChange(d); return c ? { d: d, c: c } : null; }).filter(Boolean);
      if (rows.length) {
        return U.sect(depot ? "Wertentwicklung ab Live-Start" : "Wertentwicklung ab Live-Start " + dDe(doc.liveStart), { level: 2 }) +
          '<div class="vu-stack">' + rows.map(function (r) { return '<div class="vu-box md-perf"><span><b>' + esc(r.d.name) + '</b><span class="vu-xs vu-mu">seit ' + dDe(doc.liveStart) + ", Stand " + dDe(r.c.date) + ", nach Kosten</span></span>" + U.chg(r.c.pct, { big: true, digits: 1 }) + "</div>"; }).join("") + "</div>" +
          U.help("Wertentwicklung des Rechenmodells seit dem Live-Start, kein echtes Geld, ohne Steuern. Ergebnisse aus Rückrechnungen (Backtests) zeigen wir nicht. Frühere Ergebnisse sind kein verlässlicher Hinweis auf die Zukunft.");
      }
    }
    return U.sect("Wertentwicklung", { level: 2 }) + U.blank("Die Wertentwicklung ab Live-Start wird gerechnet und erscheint hier nach der Freigabe. Ergebnisse aus Rückrechnungen (Backtests) zeigen wir an dieser Stelle nicht.", { verdict: false });
  }
  var ROWS_SHOWN = 8;
  function overview(doc) {
    var pub = published(doc);
    var cards = doc.depots.map(function (d) {
      var c = lastChanges(d), nc = pub ? navChange(d) : null;
      return tap('<span class="md-dp__h"><span class="vu-hud md-dp__i">' + U.glyph("grid", 19) + "</span>" + U.glyph("next", 16) + "</span><b>" + esc(d.name) + '</b><span class="md-dp__s">' + esc(d.positions.length + " Positionen · umgeschichtet " + dDe(d.lastRebalance) + (c.date ? " · " + c.rein.length + " rein, " + c.raus.length + " raus" : "")) + "</span>" +
        (nc ? '<span class="md-cardperf vu-xs">' + U.chg(nc.pct, { digits: 1 }) + " seit Live-Start</span>" : ""), { href: "#/" + encodeURIComponent(d.profileId), cls: "md-dp" });
    });
    return head(doc) + '<section class="md-sec">' + U.sect("Die fünf Depots", { level: 2 }) + rail(cards, { label: "Die fünf Depots", width: 236 }) + "</section>" +
      '<section class="md-sec">' + performance(doc, null) + "</section>" + foot(doc) + portfolios();
  }
  function detail(doc, depot) {
    var c = lastChanges(depot), pub = published(doc);
    var rows = depot.positions.slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (p) {
      return U.stockRow({ ticker: p.ticker, name: nameOf(p.ticker), href: stockHref(p.ticker),
        sub: p.ticker + " · " + pctW(p.weight) + " · aufgenommen " + dDe(p.since) + " zu " + U.money(p.entryPrice, "USD"),
        noPrice: !pub, price: p.lastPrice, currency: "USD", changePct: pub ? sinceEntry(p) : null });
    });
    var logs = groupedLog(depot).map(function (g) {
      return '<div class="vu-box md-logbox"><h3 class="vu-sm">Umschichtung ' + dDe(g.date) + '</h3><p class="vu-xs vu-mu">' + g.rein.length + " rein · " + g.raus.length + " raus</p>" +
        (g.rein.length ? '<div class="vu-chips md-chips" aria-label="Rein">' + g.rein.map(function (e) { return '<a class="vu-chip md-chip--in" href="' + esc(stockHref(e.ticker)) + '">+ ' + esc(nameOf(e.ticker)) + " <small>" + pctW(e.weight) + "</small></a>"; }).join("") + "</div>" : "") +
        (g.raus.length ? '<div class="vu-chips md-chips" aria-label="Raus">' + g.raus.map(function (e) { return '<a class="vu-chip md-chip--out" href="' + esc(stockHref(e.ticker)) + '">− ' + esc(e.ticker) + " <small>seit " + dDe(e.since) + "</small></a>"; }).join("") + "</div>" : "") + "</div>";
    });
    var cap = '<p class="vu-xs vu-mu md-cap">Gewicht im Modell, Aufnahme mit Datum und veröffentlichtem Schlusskurs' + (pub ? "; rechts der Schluss heute und die Veränderung seit Aufnahme" : "") + ".</p>";
    var more = rows.length > ROWS_SHOWN, moreLog = logs.length > 1;
    return '<header class="md-head vu-night"><div class="md-head__top"><a class="vu-round md-head__back" href="#/" aria-label="Alle Musterdepots">' + U.glyph("back", 18) + '</a><span class="vu-ltag">Quant · Musterdepot</span></div>' +
      '<h1 class="md-head__q">' + esc(depot.name) + '</h1><p class="md-head__lead">' + esc(depot.rule) + "</p>" + label() +
      tiles([["Positionen", String(depot.positions.length)], ["Investiert", U.num((depot.invested || 0) * 100, 0) + " %"], ["Zuletzt", dDe(depot.lastRebalance), c.rein.length + " rein, " + c.raus.length + " raus"], ["Nächste", dDe(depot.nextRebalance), "erster Lauf im Monat"]]) + "</header>" +
      '<section class="md-sec">' + performance(doc, depot) + "</section>" +
      '<section class="md-sec">' + sectAll("Bestand", more ? popButton("Alle " + rows.length, "md-t-pos", "Bestand · " + depot.name) : "") + cap +
      '<div class="md-rows">' + rows.slice(0, ROWS_SHOWN).join("") + "</div>" +
      (more ? '<template id="md-t-pos">' + cap + '<div class="md-rows">' + rows.join("") + "</div></template>" : "") +
      U.help("Die Gewichte folgen der Regel: höchstens 8 % je Aktie und 25 % je Branche, Risiko gleich verteilt. Ein Musterdepot ist ein Rechenmodell, keine echten Orders.") + "</section>" +
      '<section class="md-sec">' + sectAll("Umschichtungen", moreLog ? popButton("Alle " + logs.length, "md-t-log", "Umschichtungen · " + depot.name) : "") + '<div class="vu-stack">' + (logs[0] || U.blank("Noch keine Umschichtung.", { verdict: false })) + "</div>" +
      (moreLog ? '<template id="md-t-log"><div class="vu-stack">' + logs.join("") + "</div></template>" : "") + "</section>" + foot(doc) + portfolios(depot.profileId);
  }
  /* Alle Musterdepots (Supertrader, Quant, KI) gesammelt unter /portfolios/ (Owner 06.11.2026): die „Weiter“-Karte ganz am Seitenende,
     nach Pflicht-Hinweis und Fußzeile (der Hinweis bleibt so nah an den Zahlen wie bisher). */
  function portfolios(id) { return next({ title: "Alle Portfolios", sub: id ? "Dieses Depot im Bereich Portfolios, neben Supertrader- und KI-Depots" : "Supertrader-, Quant- und KI-Depots an einer Stelle", href: "/portfolios/" + (id ? "#/quant/" + encodeURIComponent(id) : "#/") }); }
  function foot(doc) {
    return (U.legal("modelPortfolio") || "") +
      '<p class="md-foot">Datenstand ' + dDe(doc.asOf) + ". Regel und Engine: VU-Portfolio-Standard (" + esc(doc.rules && doc.rules.engine) + "), Kurse: veröffentlichte Schlusskurse (split-bereinigt), Kosten " + esc(doc.rules && doc.rules.costsBpsPerSide) + " Basispunkte je Seite. Keine Anlageberatung, keine Empfehlung.</p>";
  }
  function render(doc, hash) {
    var id = String(hash || "").replace(/^#\/?/, "").split("?")[0];
    var depot = id ? doc.depots.filter(function (d) { return d.profileId === id; })[0] : null;
    if (id && !depot) return '<a class="md-back" href="#/">' + U.glyph("back", 16) + " Alle Musterdepots</a>" + U.blank("Dieses Musterdepot gibt es nicht.");
    return depot ? detail(doc, depot) : overview(doc);
  }

  function start(doc) {
    var main = doc.getElementById("md-main"), state = null;
    function show() {
      if (!state) return;
      main.innerHTML = render(state, root.location.hash);
      var h = main.querySelector("h1"); doc.title = (h ? h.textContent + " – " : "") + "Musterdepots – Quant · Vision Universe®";
    }
    root.fetch(DATA, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      if (validate(d)) throw new Error("SCHEMA");
      state = d; show();
      /* Volle Firmennamen aus der Namensansicht des Quant-Universums (wie Quant selbst, app.js#loadNames). */
      var S = root.QuantShell;
      if (S && S.loadCompressedJSON) S.loadCompressedJSON("/quant/data/product/universe-names-v1.json.gz").catch(function () { return S.loadCompressedJSON("/quant/data/product/universe-list-v1.json.gz"); })
        .then(function (n) { (n && n.entries || []).forEach(function (e) { if (e && e.s && e.n && e.n !== e.s) NAMES[e.s] = e.n; }); show(); }).catch(function () {});
      root.addEventListener("hashchange", function () { show(); main.focus(); });
    }).catch(function () {
      main.innerHTML = '<p class="vu-ltag">Quant · Musterdepots</p><h1 class="vu-lt">Musterdepots</h1>' + U.blank("Die Musterdepots sind gerade nicht verfügbar. Der erste Lauf steht aus oder die Daten konnten nicht geladen werden.");
    });
    if (U && U.bindHelp) U.bindHelp(main);
    /* Fenster (C16) mit dem Inhalt eines <template>: ganzer Bestand, alle Umschichtungen. */
    main.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-md-pop]"), tpl = b && doc.getElementById(b.getAttribute("data-md-pop"));
      if (!tpl) return;
      e.preventDefault();
      var title = b.getAttribute("data-md-pop-title") || "", el;
      if (U.popup) el = U.popup({ id: "md-pop", title: title, body: tpl.innerHTML, cls: "md-sheet" });
      else { var w = doc.createElement("div"); w.innerHTML = U.sheet("md-pop", title, tpl.innerHTML); el = w.firstChild; doc.body.appendChild(el); U.openSheet(el); el.addEventListener("vu-sheet-close", function () { el.remove(); }); }
      if (el) el.classList.add("vu-ui");
    });
  }

  return { DATA: DATA, LABEL: LABEL, NAMES: NAMES, render: render, validate: validate, lastChanges: lastChanges, groupedLog: groupedLog, start: start };
});
