/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/hero.js

   Die Eingangsflaeche.

   Sie beantwortet in einem Blick: WAS BEWEGT SICH GERADE, UND WARUM.
   Der Titel darauf ist nicht ausgewaehlt, weil er gut aussieht, sondern
   weil er ein belegtes Signal traegt - die Auswahl trifft der Build
   (buildFeatured in scripts/discover/build-discover-data.mjs) und nicht
   das Frontend. Dieses Modul stellt nur dar, was dort entschieden wurde.

   BEWEGUNG

   Der Wechsel zwischen den Titeln laeuft langsam (zehn Sekunden) und
   haelt an, sobald jemand die Flaeche benutzt - ein Karussell, das
   weiterspringt, waehrend man liest, ist eine Zumutung. Bei
   prefers-reduced-motion laeuft er gar nicht erst los, und die Striche
   bleiben als Bedienung stehen.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;

  var WECHSEL_MS = 10000;

  /* Der vollständige Wortlaut der Bildunterschrift - auf kleinen Displays
     zeigt die Fläche nur zwei Zeilen davon, der Rest steht im title. */
  var CAPTION_PATH = "Renditepfad über zwölf Monate, rebasiert auf 100 — zurückgerechnet aus den " +
    "ausgelieferten Renditen über 12, 6, 3 und 1 Monat. Vier Stützstellen und der heutige Stand; " +
    "dazwischen wird nichts behauptet. Absolute Kursniveaus dieses Titels sind Anbieterdaten und " +
    "bleiben zurück.";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function C() { return D.Cards; }

  /**
   * @param {object} payload  discover/data/featured/<UNIVERSE>.json
   * @param {object} options  {universeId}
   * @returns {HTMLElement}
   */
  function render(payload, options) {
    options = options || {};
    var stocks = (payload && payload.stocks) || [];
    var host = el("header", { class: "dx-hero" });
    if (!stocks.length) {
      host.appendChild(el("div", { class: "dx-hero-bg" }));
      host.appendChild(el("div", { class: "dx-hero-inner" }, [
        el("div", { class: "dx-hero-copy" }, [
          el("h1", { class: "dx-hero-title", text: "Discover" }),
          el("p", { class: "dx-hero-line",
            text: "In diesem Universum trägt derzeit kein Titel ein Discovery-Signal. " +
                  "Die Reihen darunter zeigen trotzdem, was die Kennzahlen hergeben." })
        ])
      ]));
      return host;
    }

    var bg = el("div", { class: "dx-hero-bg" });
    var fade = el("div", { class: "dx-hero-fade" });
    var inner = el("div", { class: "dx-hero-inner" });
    var nav = el("div", { class: "dx-hero-nav", role: "tablist", "aria-label": "Featured Titel" });
    host.appendChild(bg);
    host.appendChild(inner);
    host.appendChild(fade);
    host.appendChild(nav);

    var index = 0;
    var timer = null;
    var angehalten = false;

    stocks.forEach(function (stock, i) {
      var knopf = el("button", { type: "button", role: "tab",
        "aria-label": (stock.companyName || stock.symbol) + " anzeigen",
        "aria-current": String(i === 0) });
      knopf.addEventListener("click", function () { anhalten(); zeigen(i); });
      nav.appendChild(knopf);
    });

    function zeigen(neu) {
      index = (neu + stocks.length) % stocks.length;
      var stock = stocks[index];
      S.clear(inner);
      inner.appendChild(copy(stock, options));
      inner.appendChild(media(stock));
      host.classList.toggle("dx-hero--up", !!(stock.signals && (stock.signals.new52WeekHigh ||
        stock.signals.marketLeader)));
      Array.prototype.forEach.call(nav.children, function (knopf, i) {
        knopf.setAttribute("aria-current", String(i === index));
      });
    }

    function anhalten() {
      angehalten = true;
      if (timer) { global.clearInterval(timer); timer = null; }
    }

    zeigen(0);

    var ruhig = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (stocks.length > 1 && !ruhig) {
      timer = global.setInterval(function () { if (!angehalten) zeigen(index + 1); }, WECHSEL_MS);
      host.addEventListener("pointerenter", function () {
        if (timer) { global.clearInterval(timer); timer = null; }
      });
      host.addEventListener("pointerleave", function () {
        if (!angehalten && !timer) {
          timer = global.setInterval(function () { if (!angehalten) zeigen(index + 1); }, WECHSEL_MS);
        }
      });
    }
    host.addEventListener("focusin", anhalten);
    return host;
  }

  function copy(stock, options) {
    var m = stock.metrics || {};
    var kopf = stock.headline || { kicker: "MARKTFÜHRER", line: "" };
    var stats = (stock.reasons || []).slice(0, 3).map(function (reason) {
      return el("div", { class: "dx-stat" }, [
        el("span", { text: reason.label }),
        el("b", { class: "num", text: reason.value }),
        reason.hint ? el("small", { text: reason.hint }) : null
      ]);
    });

    return el("div", { class: "dx-hero-copy" }, [
      el("div", { class: "dx-kicker", text: kopf.kicker }),
      el("b", { class: "dx-hero-sym", text: stock.symbol +
        (stock.sector ? " · " + stock.sector : "") }),
      el("h1", { class: "dx-hero-title", text: stock.companyName || stock.symbol }),
      el("p", { class: "dx-hero-line", text: kopf.line }),
      el("div", { class: "dx-hero-stats" }, stats),
      el("div", { class: "dx-cta" }, [
        el("a", { class: "dx-btn",
                  href: "#/s/" + (options.universeId || "US_REAL") + "/" + stock.symbol }, [
          document.createTextNode((stock.companyName || stock.symbol) + " entdecken"),
          document.createTextNode(" →")
        ]),
        isNum(m.leadershipPercentile)
          ? el("a", { class: "dx-btn dx-btn--ghost",
                      href: "#/c/" + (options.universeId || "US_REAL") + "/market-leaders",
                      text: "Alle Marktführer" })
          : null
      ])
    ]);
  }

  /**
   * Das Datenbild. Wo eine Kursreihe freigegeben ist, wird sie gezeichnet;
   * sonst der rebasierte Renditepfad - beides echte Daten, keines davon
   * Dekoration. Die Bildunterschrift sagt, was man sieht.
   */
  function media(stock) {
    var host = el("div", { class: "dx-hero-media" });
    var chartHost = el("div", { style: "position:relative" });
    host.appendChild(chartHost);

    if (Array.isArray(stock.sparkline) && stock.sparkline.length > 2) {
      var chart = C().areaChart(stock.sparkline, { width: 600, height: 300,
        label: stock.symbol + ": Kursverlauf der letzten 52 Wochen" });
      chart.setAttribute("class", "dx-spark dx-hero-chart");
      chartHost.appendChild(chart);
      host.appendChild(el("p", { class: "dx-hero-caption", title: CAPTION_PATH,
        text: "Kursverlauf der letzten 52 Wochen, split-bereinigt. " +
              "Freigegeben für diesen Titel in der Anzeigerichtlinie." }));
      return host;
    }
    if (Array.isArray(stock.performancePath) && stock.performancePath.length > 2) {
      var pfad = C().pathChart(stock.performancePath, { width: 600, height: 300,
        label: stock.symbol + ": Renditepfad über zwölf Monate" });
      pfad.setAttribute("class", "dx-spark dx-hero-chart");
      chartHost.appendChild(pfad);
      host.appendChild(el("p", { class: "dx-hero-caption", title: CAPTION_PATH,
        text: "Renditepfad über zwölf Monate, rebasiert auf 100 — zurückgerechnet aus den " +
              "ausgelieferten Renditen über 12, 6, 3 und 1 Monat. Vier Stützstellen und der " +
              "heutige Stand; dazwischen wird nichts behauptet. Absolute Kursniveaus dieses " +
              "Titels sind Anbieterdaten und bleiben zurück." }));
      return host;
    }
    host.appendChild(el("p", { class: "dx-hero-caption",
      text: "Für diesen Titel wird kein Verlauf ausgeliefert." }));
    return host;
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Hero = { render: render };
})(window);
