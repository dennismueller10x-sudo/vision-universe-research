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
  var CAPTION_PATH = "Vier Renditen über 1, 3, 6 und 12 Monate, gezeichnet als Balken. Das ist " +
    "kein Kursverlauf: zwischen den Zeiträumen wird nichts behauptet, und für diesen Titel " +
    "liegt noch keine Kursreihe vor.";

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
    var grid = el("div", { class: "dx-hero-grid", "aria-hidden": "true" });
    var fade = el("div", { class: "dx-hero-fade" });
    var inner = el("div", { class: "dx-hero-inner" });
    var nav = el("div", { class: "dx-hero-nav", role: "tablist", "aria-label": "Featured Titel" });
    host.appendChild(bg);
    host.appendChild(grid);
    host.appendChild(inner);
    host.appendChild(fade);
    host.appendChild(nav);

    var index = 0;
    var timer = null;
    var angehalten = false;
    /* Das Live-Abonnement der gerade gezeigten Flaeche. Beim Wechsel
       gekuendigt, bevor das naechste entsteht: ein Titel, ein Strom. */
    var abo = { kuendigen: null };

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
      if (abo.kuendigen) { abo.kuendigen(); abo.kuendigen = null; }
      S.clear(inner);
      inner.appendChild(copy(stock, options));
      inner.appendChild(media(stock, abo));
      /* Die Eingangsfläche übernimmt die Farbwelt des Signals, das sie
         zeigt: ein neues Jahreshoch leuchtet anders als ein Ausbruch. */
      host.setAttribute("data-world", stock.world || "leadership");
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

  /**
   * Die Eingangsflaeche als Geschichte.
   *
   * Vorher standen hier drei Kennzahlenkacheln nebeneinander - Leadership,
   * relative Staerke, Zwoelfmonatsrendite - und die Ueberschrift war ein
   * Firmenname ohne Aussage. Wer die Begriffe kennt, las eine Zusammen-
   * fassung; wer nicht, sah drei Zahlen ohne Zusammenhang.
   *
   * Jetzt fuehrt die Flaeche wie eine Titelgeschichte: eine Einordnung,
   * der Name, EIN Satz, EINE grosse Zahl - und darunter, klein, die
   * Belege. Die Kennzahlen sind nicht verschwunden; sie stehen dort, wo
   * sie hingehoeren, wenn man schon weiss, worum es geht.
   */
  function copy(stock, options) {
    var kopf = stock.headline || { kicker: "MARKTFÜHRER", line: "" };
    var text = (stock.plain && stock.plain.story) ? stock.plain
             : (D.Klartext ? D.Klartext.karte(stock, {}) : {});

    /* Die Belege: derselbe Satz wie bisher, nur ohne Fachbegriff im Label.
       Sie stehen unter der grossen Zahl, nicht neben ihr. */
    var belege = (stock.reasons || []).slice(0, 3).map(function (reason) {
      return el("li", {}, [
        el("b", { class: "num", text: reason.value }),
        reason.label ? el("span", { text: reason.label }) : null
      ]);
    });

    return el("div", { class: "dx-hero-copy" }, [
      el("div", { class: "dx-kicker", text: kopf.kicker }),
      el("h1", { class: "dx-hero-title", text: stock.companyName || stock.symbol }),
      el("b", { class: "dx-hero-sym", text: stock.symbol +
        (stock.sector ? " · " + stock.sector : "") }),
      /* Die eine grosse Zahl. Sie ist das, was ein Mensch als Erstes
         wissen will, und sie braucht keine Erklaerung. */
      text.zahl ? el("div", { class: "dx-hero-zahl" }, [
        el("b", { class: "num " + (text.zahl.ton || ""), text: text.zahl.wert }),
        el("span", { text: text.zahl.label })
      ]) : null,
      el("p", { class: "dx-hero-line", text: text.story || kopf.line }),
      /* Der fundamentale Kontext: was das Unternehmen gemacht hat - ein
         belegter Satz aus den Jahresabschluessen, wo einer vorliegt. */
      stock.hook && stock.hook.text ? el("p", { class: "dx-hero-hook" }, [
        el("i", { class: "dx-hook-mark", "aria-hidden": "true" }),
        document.createTextNode(stock.hook.text),
        el("span", { class: "dx-hero-hook-src", text: " · Geschäftsjahre " + stock.hook.from + "–" + stock.hook.to })
      ]) : null,
      belege.length ? el("ul", { class: "dx-hero-belege" }, belege) : null,
      el("div", { class: "dx-cta" }, [
        el("a", { class: "dx-btn",
                  href: "#/s/" + (options.universeId || "US_REAL") + "/" + stock.symbol }, [
          document.createTextNode((stock.companyName || stock.symbol) + " entdecken"),
          document.createTextNode(" →")
        ]),
        el("a", { class: "dx-btn dx-btn--ghost",
                  href: "#/c/" + (options.universeId || "US_REAL") + "/market-leaders",
                  text: "Mehr starke Aktien" })
      ])
    ]);
  }

  /**
   * Das Datenbild. Wo eine Kursreihe freigegeben ist, wird sie gezeichnet;
   * sonst der rebasierte Renditepfad - beides echte Daten, keines davon
   * Dekoration. Die Bildunterschrift sagt, was man sieht.
   */
  function media(stock, abo) {
    var host = el("div", { class: "dx-hero-media" });
    var chartHost = el("div", { style: "position:relative" });
    host.appendChild(chartHost);
    liveStreifen(host, stock, abo);

    var kunst = D.Artwork.stockArtwork(stock, { width: 640, height: 320, ticker: true,
                                                scale: "hero", range: "1J" });
    kunst.classList.add("dx-hero-chart");
    chartHost.appendChild(kunst);

    var MC = D.MicroChart;
    var ps = stock.priceSeries;
    if (MC && ps && ps.status === "CALCULATED" && (ps.ranges || ps.points)) {
      host.appendChild(el("p", { class: "dx-hero-caption",
        text: "Echter Kursverlauf über zwölf Monate — Tagesschlusskurse, split-bereinigt. " +
              "Quelle " + ps.source + ", Stand " + (ps.asOf || "") + ". Für diesen Titel ist die " +
              "Kursreihe freigegeben." }));
      return host;
    }
    var m = stock.metrics || {};
    if (isNum(m.return12M) || isNum(m.return6M) || isNum(m.return3M) || isNum(m.return1M)) {
      /* Die Kennzeichnung ist eine Lizenzaussage, keine Bildunterschrift:
         was man sieht, sind vier Renditen als Balken - und ausdruecklich
         kein Kursverlauf. */
      host.appendChild(el("p", { class: "dx-hero-caption", title: CAPTION_PATH,
        text: "Rendite über 1, 3, 6 und 12 Monate — als Balken, nicht als Kurskurve. " +
              "Für diesen Titel liegt noch keine Kursreihe vor; eine Linie ohne Kurse gäbe es nicht." }));
      return host;
    }
    host.appendChild(el("p", { class: "dx-hero-caption",
      text: "Für diesen Titel wird keine Rendite ausgeliefert." }));
    return host;
  }

  /* Der Tagesverlauf unter dem Jahreschart: dieselbe Quelle wie die Karte
     und die Aktienseite (Live-Hub), dieselbe Beschriftung. Erscheint nur,
     wenn ein Snapshot vorliegt - sonst bleibt die Flaeche, wie sie ist. */
  function liveStreifen(host, stock, abo) {
    var Hub = D.LiveHub, MC = D.MicroChart;
    if (!Hub || !Hub.enabled() || stock.dataMode !== "real" || !MC || !MC.renderIntraday) return;
    if (!Hub.resolveEntry(stock.symbol)) return;
    var streifen = el("div", { class: "dx-hero-live", "data-symbol": stock.symbol });
    host.appendChild(streifen);
    abo.kuendigen = Hub.subscribe(stock.symbol, function (p) {
      if (!p.snapshot) { if (streifen.parentNode) streifen.parentNode.removeChild(streifen); return; }
      var svgNode = MC.renderIntraday(p.snapshot, { width: 640, height: 110, symbol: stock.symbol,
                                                    label: p.label && p.label.label });
      if (!svgNode) return;
      S.clear(streifen);
      streifen.setAttribute("data-live", p.snapshot.regularComplete ? "complete" : "running");
      streifen.appendChild(svgNode);
      streifen.appendChild(el("p", { class: "dx-hero-live-label" }, [
        C().liveLabel(p.label, p.snapshot),
        el("span", { text: " · 5-Minuten-Kurse, " + p.snapshot.provider + "/" + (p.snapshot.venue || "IEX") +
                           " · Uhrzeiten New York" })
      ]));
    });
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Hero = { render: render };
})(window);
