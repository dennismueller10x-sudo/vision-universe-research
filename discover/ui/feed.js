/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/feed.js

   IMMERSIVE STOCK DISCOVERY

   Eine Aktie pro Bildschirm. Wischen führt zur nächsten. Mehr ist es
   nicht - und mehr soll es auch nicht sein.

   WARUM DAS HIER KEIN FEED IM ÜBLICHEN SINN IST

   Die Interaktion stammt erkennbar von den vertikalen Content-Apps, und
   das ist Absicht: sie ist die beste Art, die es gibt, um eine Sache nach
   der anderen anzusehen. Was NICHT übernommen wird, ist alles, womit
   diese Apps ihr Geld verdienen - kein endloses Nachladen ohne Ende, kein
   Autoplay, keine Likes, keine Zähler, kein "gerade heiß", kein
   Kaufen-Knopf. In einem Finanzprodukt wäre jede dieser Mechaniken eine
   Einladung zum unüberlegten Handeln.

   Deshalb: eine feste, endliche Liste. Wer sie durchgesehen hat, kommt an
   ein Ende, und dort steht kein "weiter so", sondern der Weg zurück in
   die Übersicht.

   WIE ES TECHNISCH FUNKTIONIERT

   Mit `scroll-snap-type: y mandatory` und sonst nichts. Keine Geste wird
   abgefangen, keine Transformation gerechnet, kein Scroll simuliert. Das
   Ergebnis fühlt sich auf jedem Gerät wie das System an, weil es das
   System ist - und es funktioniert mit Tastatur, Bildlaufleiste,
   Screenreader und reduzierter Bewegung, ohne dass dafür etwas gebaut
   werden musste.

   Der Modus ist ein Angebot, kein Ersatz: Discover, Sammlungen und
   Aktienseiten bleiben unverändert erreichbar.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var D = global.VUDiscover;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function C() { return D.Cards; }

  /**
   * Baut den Modus.
   *
   * @param {HTMLElement} root
   * @param {Array} karten   Kartenliste (Contract.toCard-Form) mit Herkunft
   * @param {object} options {universeId, zurueck}
   */
  function render(root, karten, options) {
    options = options || {};
    var host = el("div", { class: "dx-feed", role: "region",
                           "aria-label": "Aktien einzeln entdecken" });

    /* Die Kopfzeile bleibt oben stehen: sie ist der Ausweg. Ein Modus
       ohne sichtbaren Ausgang waere eine Falle. */
    host.appendChild(el("div", { class: "dx-feed-bar" }, [
      el("a", { class: "dx-feed-zurueck", href: options.zurueck || "#/u/US_REAL" }, [
        document.createTextNode("← Übersicht")
      ]),
      el("span", { class: "dx-feed-zaehler", text: "1 von " + karten.length })
    ]));

    var spur = el("div", { class: "dx-feed-spur" });
    karten.forEach(function (karte, i) {
      spur.appendChild(bildschirm(karte, i, karten.length, options));
    });

    /* Das Ende ist ein Ende. */
    spur.appendChild(el("section", { class: "dx-feed-screen dx-feed-screen--ende" }, [
      el("div", { class: "dx-feed-inner" }, [
        el("p", { class: "dx-kicker", text: "Das war die Auswahl" }),
        el("h2", { text: "Fertig durchgesehen." }),
        el("p", { class: "dx-feed-satz",
                  text: "Diese Auswahl umfasst " + karten.length + " Titel und lädt nicht " +
                        "endlos nach. Weiter geht es in der Übersicht — oder in einer " +
                        "der Sammlungen." }),
        el("div", { class: "dx-cta" }, [
          el("a", { class: "dx-btn", href: options.zurueck || "#/u/US_REAL",
                    text: "Zurück zur Übersicht" })
        ])
      ])
    ]));

    host.appendChild(spur);
    root.appendChild(host);

    /* Der Zaehler oben zeigt, wo man ist - das ist die einzige
       Rueckmeldung, die dieser Modus gibt. */
    var zaehler = host.querySelector(".dx-feed-zaehler");
    if (global.IntersectionObserver) {
      var beobachter = new global.IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (e) {
          if (!e.isIntersecting) return;
          var i = Number(e.target.dataset.index);
          if (!isNum(i)) return;
          zaehler.textContent = (i + 1) + " von " + karten.length;
          if (D.Swipe) D.Swipe.melden("feed:karte", { index: i, symbol: e.target.dataset.symbol });
          /* Vorbereiten, was als Naechstes kommt. */
          var naechste = karten[i + 1];
          if (naechste && D.Swipe) {
            D.Swipe.vorladen("/discover/data/stocks/" +
                             (options.universeId || "US_REAL") + "/" + naechste.symbol + ".json");
          }
        });
      }, { threshold: 0.55 });
      Array.prototype.forEach.call(spur.querySelectorAll("[data-index]"), function (n) {
        beobachter.observe(n);
      });
    }
    return host;
  }

  /** Ein Bildschirm: eine Aktie, eine Aussage, eine Zahl, ein Bild. */
  function bildschirm(karte, index, gesamt, options) {
    var text = karte.plain || (D.Klartext ? D.Klartext.karte(karte, {}) : {});
    var universeId = options.universeId || "US_REAL";
    var ziel = "#/s/" + universeId + "/" + karte.symbol;

    var section = el("section", {
      class: "dx-feed-screen", "data-world": karte.world || null,
      "data-index": String(index), "data-symbol": karte.symbol,
      "aria-label": (index + 1) + " von " + gesamt + ": " + (karte.companyName || karte.symbol)
    }, [
      el("div", { class: "dx-feed-bg", "aria-hidden": "true" }),
      el("div", { class: "dx-feed-inner" }, [
        karte.herkunft
          ? el("p", { class: "dx-kicker", text: karte.herkunft })
          : null,
        el("h2", { class: "dx-feed-name", text: karte.companyName || karte.symbol }),
        el("p", { class: "dx-feed-meta" }, [karte.symbol, karte.sector]
          .filter(Boolean).map(function (t) { return el("span", { text: t }); })),
        text.zahl ? el("div", { class: "dx-feed-zahl" }, [
          el("b", { class: "num " + (text.zahl.ton || ""), text: text.zahl.wert }),
          el("span", { text: text.zahl.label })
        ]) : null,
        text.story ? el("p", { class: "dx-feed-satz", text: text.story }) : null,
        el("div", { class: "dx-feed-bild" }, [
          D.Artwork.stockArtwork(karte, { width: 720, height: 260, ticker: true,
                                          band: true, scale: "hero" })
        ]),
        text.zusatz ? el("p", { class: "dx-feed-zusatz", text: text.zusatz }) : null,
        el("div", { class: "dx-cta" }, [
          el("a", { class: "dx-btn", href: ziel }, [
            document.createTextNode((karte.companyName || karte.symbol) + " ansehen"),
            document.createTextNode(" →")
          ])
        ])
      ]),
      /* Der Hinweis nach unten. Er verschwindet nach dem ersten
         Bildschirm - einmal gezeigt reicht. */
      index === 0
        ? el("div", { class: "dx-feed-weiter", "aria-hidden": "true" }, [
            /* Am Telefon wischt man, am Schreibtisch scrollt man. Der
               Hinweis sagt, was dieses Geraet kann - nicht, was die
               Metapher der Entwickler war. */
            el("span", { text: global.matchMedia &&
                               global.matchMedia("(hover: hover) and (pointer: fine)").matches
                           ? "Weiterscrollen" : "Weiterwischen" }),
            el("i", {})
          ])
        : null
    ]);
    return section;
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Feed = { render: render };
})(window);
