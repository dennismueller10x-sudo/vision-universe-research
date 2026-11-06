/* =========================================================================
   VISION UNIVERSE QUANT — musterdepots/depots.js        Quant-Musterdepots

   Liest genau ein Artefakt: /quant/data/product/model-depots-v1.json
   (Erzeuger scripts/quant/portfolio/model-depots.cjs, Workflow quant-model-depots.yml).
   Rechnet nichts nach und zeigt keine Rendite: weder Backtest-Renditen noch eine Veränderung je Position.
   Die Wertentwicklung ab Live-Start erscheint nur, wenn der Export sie mit performance.state = PUBLISHED führt
   (Owner-Freigabe im Plan). Bausteine aus assets/vu-ui.js (Redesign 2027).

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

  /* ---------------------------------------------------------------- Ansichten */
  function head(doc) {
    return '<p class="vu-ltag">Quant · Musterdepots</p><h1 class="vu-lt">Was die Regeln heute halten</h1>' +
      '<p class="vu-lead">Fünf Quant-Profile als Musterdepot: Jedes nimmt Aktien streng nach seiner Regel auf und schichtet einmal im Monat um. So sieht man, was eine Methode tut, nicht, was du tun solltest.</p>' +
      '<span class="md-label">' + LABEL + "</span>" +
      '<div class="vu-grid md-tiles">' + U.tile("Live seit", dDe(doc.liveStart)) + U.tile("Datenstand", dDe(doc.asOf)) + U.tile("Umschichtung", "monatlich") + U.tile("Depots", String(doc.depots.length)) + "</div>";
  }
  function performance(doc, depot) {
    if (doc.performance && doc.performance.state === "PUBLISHED" && depot && Array.isArray(depot.nav) && depot.nav.length) {
      var last = depot.nav[depot.nav.length - 1];
      return U.sect("Wertentwicklung ab Live-Start", { level: 2 }) + '<div class="vu-grid md-tiles">' + U.tile("Seit " + dDe(doc.liveStart), U.pct((last[1] - 1) * 100, 1), "nach Kosten, ohne Steuern, Stand " + dDe(last[0])) + "</div>" +
        U.help("Wertentwicklung des Rechenmodells, kein echtes Geld. Frühere Ergebnisse sind kein verlässlicher Hinweis auf die Zukunft.");
    }
    return U.sect("Wertentwicklung", { level: 2 }) + U.blank("Die Wertentwicklung ab Live-Start wird gerechnet und erscheint hier nach der Freigabe. Ergebnisse aus Rückrechnungen (Backtests) zeigen wir an dieser Stelle nicht.", { verdict: false });
  }
  function overview(doc) {
    var cards = doc.depots.map(function (d) {
      var c = lastChanges(d);
      return '<a class="md-card" href="#/' + encodeURIComponent(d.profileId) + '"><span class="vu-ltag">Musterdepot</span><h2>' + esc(d.name) + "</h2><p>" + esc(d.rule) + "</p>" +
        '<div class="md-meta">' + d.positions.length + " Positionen · zuletzt umgeschichtet " + dDe(d.lastRebalance) + (c.date ? " · " + c.rein.length + " rein, " + c.raus.length + " raus" : "") + "</div></a>";
    }).join("");
    return head(doc) + '<div class="md-sec">' + U.sect("Die fünf Depots", { level: 2 }) + '<div class="md-cards">' + cards + "</div></div>" +
      '<div class="md-sec">' + performance(doc, null) + "</div>" + foot(doc);
  }
  function detail(doc, depot) {
    var c = lastChanges(depot);
    var rows = depot.positions.slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (p) {
      return '<tr><td><a href="' + esc(stockHref(p.ticker)) + '">' + esc(p.ticker) + '</a></td><td class="num">' + pctW(p.weight) + '</td><td class="num">' + dDe(p.since) + '</td><td class="num">' + esc(U.money(p.entryPrice, "USD")) + "</td></tr>";
    }).join("");
    var log = groupedLog(depot).map(function (g) {
      return '<div class="vu-box"><h3>Umschichtung ' + dDe(g.date) + '</h3><p class="vu-sm vu-mu">' + g.rein.length + " rein · " + g.raus.length + " raus</p>" +
        (g.rein.length ? '<div class="md-chips" aria-label="Rein">' + g.rein.map(function (e) { return '<a class="md-chip md-chip--in" href="' + esc(stockHref(e.ticker)) + '">+ ' + esc(e.ticker) + " <small>" + pctW(e.weight) + "</small></a>"; }).join("") + "</div>" : "") +
        (g.raus.length ? '<div class="md-chips" aria-label="Raus">' + g.raus.map(function (e) { return '<a class="md-chip md-chip--out" href="' + esc(stockHref(e.ticker)) + '">− ' + esc(e.ticker) + " <small>seit " + dDe(e.since) + "</small></a>"; }).join("") + "</div>" : "") + "</div>";
    }).join("");
    return '<a class="md-back" href="#/">← Alle Musterdepots</a><p class="vu-ltag">Quant · Musterdepot</p><h1 class="vu-lt">' + esc(depot.name) + '</h1><p class="vu-lead">' + esc(depot.rule) + "</p>" +
      '<span class="md-label">' + LABEL + "</span>" +
      '<div class="vu-grid md-tiles">' + U.tile("Positionen", String(depot.positions.length)) + U.tile("Investiert", U.num((depot.invested || 0) * 100, 0) + " %") + U.tile("Zuletzt", dDe(depot.lastRebalance), c.rein.length + " rein, " + c.raus.length + " raus") + U.tile("Nächste", dDe(depot.nextRebalance), "erster Lauf im Monat") + "</div>" +
      '<div class="md-sec">' + U.sect("Bestand", { level: 2 }) + '<div class="md-wrap"><table class="md-table"><caption class="vu-xs vu-mu" style="text-align:left">Gewicht im Modell, Aufnahme mit Datum und veröffentlichtem Schlusskurs</caption><thead><tr><th scope="col">Aktie</th><th scope="col" class="num">Gewicht</th><th scope="col" class="num">Aufgenommen</th><th scope="col" class="num">Aufnahmekurs</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      U.help("Die Gewichte folgen der Regel: höchstens 8 % je Aktie und 25 % je Branche, Risiko gleich verteilt. Ein Musterdepot ist ein Rechenmodell, keine echten Orders.") + "</div>" +
      '<div class="md-sec">' + U.sect("Umschichtungen", { level: 2 }) + '<div class="md-log">' + (log || U.blank("Noch keine Umschichtung.", { verdict: false })) + "</div></div>" +
      '<div class="md-sec">' + performance(doc, depot) + "</div>" + foot(doc);
  }
  function foot(doc) {
    return (U.legal("modelPortfolio") || "") +
      '<p class="md-foot">Datenstand ' + dDe(doc.asOf) + ". Regel und Engine: VU-Portfolio-Standard (" + esc(doc.rules && doc.rules.engine) + "), Kurse: veröffentlichte Schlusskurse (Tiingo, split-bereinigt), Kosten " + esc(doc.rules && doc.rules.costsBpsPerSide) + " Basispunkte je Seite. Keine Anlageberatung, keine Empfehlung.</p>";
  }
  function render(doc, hash) {
    var id = String(hash || "").replace(/^#\/?/, "").split("?")[0];
    var depot = id ? doc.depots.filter(function (d) { return d.profileId === id; })[0] : null;
    if (id && !depot) return '<a class="md-back" href="#/">← Alle Musterdepots</a>' + U.blank("Dieses Musterdepot gibt es nicht.");
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
      root.addEventListener("hashchange", function () { show(); main.focus(); });
    }).catch(function () {
      main.innerHTML = '<p class="vu-ltag">Quant · Musterdepots</p><h1 class="vu-lt">Musterdepots</h1>' + U.blank("Die Musterdepots sind gerade nicht verfügbar. Der erste Lauf steht aus oder die Daten konnten nicht geladen werden.");
    });
    if (U && U.bindHelp) U.bindHelp(main);
  }

  return { DATA: DATA, LABEL: LABEL, render: render, validate: validate, lastChanges: lastChanges, groupedLog: groupedLog, start: start };
});
