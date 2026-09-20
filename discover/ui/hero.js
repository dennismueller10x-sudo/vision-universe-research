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
    /* V4 §16: die Flaechen liegen nebeneinander auf einer Spur, die der
       Daumen schiebt. Kein Neubau des DOM beim Wechsel, keine Sprünge:
       translateX auf der Spur, Einrasten am Ende der Geste. */
    var viewport = el("div", { class: "dx-hero-viewport" });
    var track = el("div", { class: "dx-hero-track", role: "group", "aria-roledescription": "Karussell",
                            "aria-label": "Titel, die gerade auffallen" });
    var nav = el("div", { class: "dx-hero-nav", role: "tablist", "aria-label": "Featured Titel" });
    host.appendChild(bg);
    host.appendChild(grid);
    viewport.appendChild(track);
    host.appendChild(viewport);
    host.appendChild(fade);
    host.appendChild(nav);
    host.setAttribute("tabindex", "0");
    host.setAttribute("aria-label", "Eingangsfläche: " + stocks.length + " Titel, mit Pfeiltasten oder Wischen wechseln");

    var index = 0;
    var timer = null;
    var angehalten = false;
    /* Je Flaeche ein Live-Abonnement - nur die sichtbare hat eines. */
    var abos = stocks.map(function () { return { kuendigen: null, streifenHost: null, stock: null }; });
    var slides = stocks.map(function (stock, i) {
      var slide = el("div", { class: "dx-hero-inner dx-hero-slide", role: "group",
                              "aria-roledescription": "Folie", "aria-label": (i + 1) + " von " + stocks.length,
                              "aria-hidden": String(i !== 0), "data-index": String(i) });
      slide.appendChild(copy(stock, options));
      abos[i].stock = stock;
      slide.appendChild(media(stock, abos[i], i === 0));
      track.appendChild(slide);
      return slide;
    });

    stocks.forEach(function (stock, i) {
      var knopf = el("button", { type: "button", role: "tab",
        "aria-label": (stock.companyName || stock.symbol) + " anzeigen",
        "aria-current": String(i === 0) });
      knopf.addEventListener("click", function () { anhalten(); zeigen(i, true); });
      nav.appendChild(knopf);
    });

    function lage(i, dx) {
      track.style.transform = "translate3d(calc(" + (-i * 100) + "% + " + (dx || 0) + "px), 0, 0)";
    }

    function zeigen(neu, animiert) {
      var vorher = index;
      index = (neu + stocks.length) % stocks.length;
      var stock = stocks[index];
      track.classList.toggle("dx-hero-track--animiert", animiert !== false);
      lage(index, 0);
      slides.forEach(function (sl, i) { sl.setAttribute("aria-hidden", String(i !== index)); });
      if (vorher !== index && abos[vorher].kuendigen) { abos[vorher].kuendigen(); abos[vorher].kuendigen = null; }
      liveStreifen(abos[index].streifenHost, stock, abos[index]);
      /* Die Eingangsfläche übernimmt die Farbwelt des Signals, das sie
         zeigt: ein neues Jahreshoch leuchtet anders als ein Ausbruch. */
      host.setAttribute("data-world", stock.world || "leadership");
      Array.prototype.forEach.call(nav.children, function (knopf, i) {
        knopf.setAttribute("aria-current", String(i === index));
      });
      if (D.LiveHub && D.LiveHub.prefetch) D.LiveHub.prefetch(stocks[(index + 1) % stocks.length].symbol);
    }

    function anhalten() {
      angehalten = true;
      if (timer) { global.clearInterval(timer); timer = null; }
    }

    /* ---- Die Geste. Pointer Events, damit Finger, Stift und Maus dieselbe
       Bahn nehmen. Vertikal gewinnt die Seite (touch-action: pan-y in der
       CSS); erst ab 12 px und deutlich horizontaler Richtung uebernimmt
       die Spur, dann sperrt sie den Klick auf den Link darunter, bis der
       Finger wieder oben ist. Am Ende: Einrasten - bei mehr als einem
       Viertel der Breite oder einem schnellen Wisch auf die Nachbarflaeche,
       sonst zurueck. */
    var geste = null, klickSperre = false;
    var SCHWELLE = 12, ANTEIL = 0.25, SCHNELL = 0.45;
    function pointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest(".dx-hero-nav, a, button")) {
        if (e.pointerType === "mouse") return;
      }
      geste = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, aktiv: false, entschieden: false };
      track.classList.remove("dx-hero-track--animiert");
    }
    function pointerMove(e) {
      if (!geste || e.pointerId !== geste.id) return;
      var dx = e.clientX - geste.x0, dy = e.clientY - geste.y0;
      if (!geste.entschieden) {
        if (Math.abs(dx) < SCHWELLE && Math.abs(dy) < SCHWELLE) return;
        geste.entschieden = true;
        geste.aktiv = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!geste.aktiv) { geste = null; track.classList.add("dx-hero-track--animiert"); return; }
        anhalten();
        if (viewport.setPointerCapture) { try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } }
        host.classList.add("dx-hero--wischt");
      }
      if (!geste.aktiv) return;
      /* Widerstand an den Enden: die Spur haelt fest, sie reisst nicht ab. */
      var amRand = (index === 0 && dx > 0) || (index === stocks.length - 1 && dx < 0);
      geste.dx = amRand ? dx * 0.35 : dx;
      lage(index, geste.dx);
      if (e.cancelable) e.preventDefault();
    }
    function pointerUp(e) {
      if (!geste || e.pointerId !== geste.id) return;
      var g = geste; geste = null;
      host.classList.remove("dx-hero--wischt");
      track.classList.add("dx-hero-track--animiert");
      if (!g.aktiv) return;
      var breite = viewport.clientWidth || 1;
      var dauer = Math.max(1, e.timeStamp - g.t0);
      var v = Math.abs(g.dx) / dauer;
      var weit = Math.abs(g.dx) > breite * ANTEIL || v > SCHNELL;
      if (weit && g.dx < 0 && index < stocks.length - 1) zeigen(index + 1, true);
      else if (weit && g.dx > 0 && index > 0) zeigen(index - 1, true);
      else lage(index, 0);
      /* Der Klick, der auf das Loslassen folgt, gehoert zur Geste. */
      klickSperre = true;
      global.setTimeout(function () { klickSperre = false; }, 350);
      if (D.Analytics && D.Analytics.track) D.Analytics.track("hero:swipe", { richtung: g.dx < 0 ? "weiter" : "zurueck", eingerastet: weit });
    }
    viewport.addEventListener("pointerdown", pointerDown);
    viewport.addEventListener("pointermove", pointerMove, { passive: false });
    viewport.addEventListener("pointerup", pointerUp);
    viewport.addEventListener("pointercancel", pointerUp);
    /* Ein Finger wird vom Browser zuerst am beruehrten Element festgehalten;
       setPointerCapture auf die Spur loest diese implizite Bindung, und das
       meldet der Browser als lostpointercapture AM ELEMENT - es steigt bis
       hierher auf. Nur der Verlust der eigenen Bindung bricht die Geste ab. */
    viewport.addEventListener("lostpointercapture", function (e) {
      if (e.target !== viewport || !geste) return;
      geste = null; host.classList.remove("dx-hero--wischt"); track.classList.add("dx-hero-track--animiert"); lage(index, 0);
    });
    viewport.addEventListener("click", function (e) {
      if (klickSperre) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    /* Tastatur: Pfeile wechseln, Pos1/Ende springen. Auf der Flaeche selbst
       oder auf den Punkten. */
    host.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { anhalten(); zeigen(index + 1, true); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { anhalten(); zeigen(index - 1, true); e.preventDefault(); }
      else if (e.key === "Home") { anhalten(); zeigen(0, true); e.preventDefault(); }
      else if (e.key === "End") { anhalten(); zeigen(stocks.length - 1, true); e.preventDefault(); }
    });
    global.addEventListener("resize", function () { lage(index, 0); });

    zeigen(0, false);

    var ruhig = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (stocks.length > 1 && !ruhig) {
      timer = global.setInterval(function () { if (!angehalten) zeigen(index + 1, true); }, WECHSEL_MS);
      host.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "mouse" && timer) { global.clearInterval(timer); timer = null; }
      });
      host.addEventListener("pointerleave", function (e) {
        if (e.pointerType === "mouse" && !angehalten && !timer) {
          timer = global.setInterval(function () { if (!angehalten) zeigen(index + 1, true); }, WECHSEL_MS);
        }
      });
    }
    host.addEventListener("focusin", anhalten);
    /* Zum Aufraeumen durch den Router: alle Stroeme kuendigen. */
    host.__dispose = function () {
      abos.forEach(function (a) { if (a.kuendigen) { a.kuendigen(); a.kuendigen = null; } });
      if (timer) { global.clearInterval(timer); timer = null; }
    };
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
        el("span", { class: "dx-hero-hook-src", text: "Geschäftsjahre " + stock.hook.from + "–" + stock.hook.to })
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
  function media(stock, abo, aktiv) {
    var host = el("div", { class: "dx-hero-media" });
    var chartHost = el("div", { style: "position:relative" });
    host.appendChild(chartHost);
    abo.streifenHost = host;
    if (aktiv) liveStreifen(host, stock, abo);

    var kunst = D.Artwork.stockArtwork(stock, { width: 640, height: 320, ticker: true,
                                                scale: "hero", range: "1J" });
    kunst.classList.add("dx-hero-chart");
    chartHost.appendChild(kunst);

    var MC = D.MicroChart;
    var ps = stock.priceSeries;
    if (MC && ps && ps.status === "CALCULATED" && (ps.ranges || ps.points)) {
      host.appendChild(el("p", { class: "dx-hero-caption",
        text: "Echter Kursverlauf über zwölf Monate — Tagesschlusskurse, split-bereinigt, " +
              "Stand " + C().dateShort(ps.asOf) + ". Herkunft der Daten: Daten & Quellen." }));
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
    if (!host || abo.kuendigen) return;
    if (!Hub || !Hub.enabled() || stock.dataMode !== "real" || !MC || !MC.renderIntraday) return;
    if (!Hub.resolveEntry(stock.symbol)) return;
    var streifen = host.querySelector(".dx-hero-live") || el("div", { class: "dx-hero-live", "data-symbol": stock.symbol });
    if (!streifen.parentNode) host.appendChild(streifen);
    abo.kuendigen = Hub.subscribe(stock.symbol, function (p) {
      if (!p.snapshot) { if (streifen.parentNode) streifen.parentNode.removeChild(streifen); return; }
      var svgNode = MC.renderIntraday(p.snapshot, { width: 640, height: 110, symbol: stock.symbol,
                                                    label: p.label && p.label.label });
      if (!svgNode) return;
      S.clear(streifen);
      streifen.setAttribute("data-live", p.snapshot.regularComplete ? "complete" : "running");
      streifen.setAttribute("data-freshness", (p.freshness && p.freshness.freshnessState) || "");
      streifen.appendChild(svgNode);
      streifen.appendChild(el("p", { class: "dx-hero-live-label" }, [
        C().liveLabel(p.label, p.snapshot),
        el("span", { text: " · 5-Minuten-Kurse · Uhrzeiten New York" })
      ]));
    });
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Hero = { render: render };
})(window);
