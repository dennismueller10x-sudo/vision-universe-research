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
   * V4.1 §17-18: der Feed hat keine harte Grenze nach zehn Titeln mehr.
   * Er bekommt eine deterministische Reihenfolge (discover/data/feed/
   * <Universum>.json, gebaut aus den ausgelieferten Reihen) und zeigt sie
   * in Stuecken: die ersten Karten liegen bei, die naechsten werden von
   * den Aktienseiten nachgeladen, bevor das Ende des gezeigten Stuecks
   * erreicht ist. Nie das ganze Universum im Browser, nie ein Titel
   * zweimal. Das Ende bleibt ein Ende: wer alle Titel der Reihenfolge
   * gesehen hat, kommt zu den Ausgaengen - nicht zu Nachschub aus dem
   * Nichts.
   *
   * @param {HTMLElement} root
   * @param {Array} karten   erste Karten (Contract.toCard-Form) mit Herkunft
   * @param {object} options {universeId, zurueck, weiter, order, batchSize, laden(symbol) -> Promise<card>, affinity}
   */
  function render(root, karten, options) {
    options = options || {};
    var universeId = options.universeId || "US_REAL";
    var order = options.order || karten.map(function (k) { return { s: k.symbol, herkunft: k.herkunft || null, sec: k.sector || null }; });
    var gesamt = order.length;
    var batch = options.batchSize || 12;
    var host = el("div", { class: "dx-feed", role: "region",
                           "aria-label": "Aktien einzeln entdecken" });

    /* Die Kopfzeile bleibt oben stehen: sie ist der Ausweg. Ein Modus
       ohne sichtbaren Ausgang waere eine Falle. */
    var zaehler = el("span", { class: "dx-feed-zaehler", text: "1 von " + gesamt });
    host.appendChild(el("div", { class: "dx-feed-bar" }, [
      el("a", { class: "dx-feed-zurueck", href: options.zurueck || "#/u/US_REAL" }, [
        document.createTextNode("← Übersicht")
      ]),
      zaehler
    ]));

    var spur = el("div", { class: "dx-feed-spur" });
    var gezeigt = 0, gesehen = Object.create(null), laedt = false, fertig = false;
    var beobachter = null;

    function anhaengen(karte, index) {
      if (!karte || gesehen[karte.symbol]) return false;
      gesehen[karte.symbol] = true;
      var eintrag = order[index] || {};
      if (!karte.herkunft && eintrag.herkunft) karte = Object.assign({}, karte, { herkunft: eintrag.herkunft });
      var screen = bildschirm(karte, index, gesamt, options);
      spur.insertBefore(screen, ende);
      if (beobachter) beobachter.observe(screen);
      gezeigt = index + 1;
      return true;
    }

    /* Das Ende ist ein Ende - mit Ausgaengen, nicht mit Nachschub. */
    var ausgaenge = (options.weiter || []).map(function (w, i) {
      return el("a", { class: "dx-btn" + (i ? " dx-btn--ghost" : ""), href: w.href, text: w.label });
    });
    ausgaenge.push(el("a", { class: "dx-btn dx-btn--ghost", href: options.zurueck || "#/u/US_REAL",
                             text: "Zurück zu Discover" }));
    var ende = el("section", { class: "dx-feed-screen dx-feed-screen--ende", "data-index": "ende", hidden: true }, [
      el("div", { class: "dx-feed-inner" }, [
        el("p", { class: "dx-kicker", text: "Das war die Auswahl" }),
        el("h2", { text: "Fertig durchgesehen." }),
        el("p", { class: "dx-feed-satz",
                  text: "Diese Auswahl umfasst " + gesamt + " Titel aus den Sammlungen von Discover. Wohin als Nächstes?" }),
        el("div", { class: "dx-cta dx-cta--stapel" }, ausgaenge)
      ])
    ]);
    spur.appendChild(ende);

    /* Die naechsten Karten - von den Aktienseiten, deterministisch nach
       der Reihenfolge; eine Neigung des Nutzers (V4.1 §20, lokal, ohne
       Server) hebt innerhalb EINES Stuecks Titel seiner zuletzt
       angesehenen Sektoren nach vorn - nie ueber Stueckgrenzen hinweg. */
    function naechstesStueck() {
      if (laedt || fertig) return Promise.resolve(false);
      var von = gezeigt, bis = Math.min(gesamt, von + batch);
      if (von >= gesamt) { fertig = true; ende.hidden = false; return Promise.resolve(false); }
      laedt = true;
      var eintraege = order.slice(von, bis);
      var aff = options.affinity || [];
      if (aff.length) {
        var vorne = eintraege.filter(function (e) { return e.sec && aff.indexOf(e.sec) !== -1; }).slice(0, 4);
        var hinten = eintraege.filter(function (e) { return vorne.indexOf(e) === -1; });
        eintraege = vorne.concat(hinten);
      }
      var lader = options.laden || function (symbol) {
        return S.loadJSON("/discover/data/stocks/" + universeId + "/" + symbol + ".json");
      };
      return Promise.all(eintraege.map(function (e) {
        return lader(e.s).then(function (k) { return k ? Object.assign({}, k, { herkunft: e.herkunft || k.herkunft || null }) : null; })
                         .catch(function () { return null; });
      })).then(function (geladen) {
        var index = von;
        geladen.forEach(function (k) { if (k) { if (anhaengen(k, index)) index++; else gezeigt = index; } });
        /* Titel ohne Seite werden uebersprungen; der Zaehler bleibt ehrlich. */
        gezeigt = bis;
        laedt = false;
        if (bis >= gesamt) { fertig = true; ende.hidden = false; }
        return true;
      }).catch(function () { laedt = false; return false; });
    }

    if (global.IntersectionObserver) {
      beobachter = new global.IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (e) {
          if (!e.isIntersecting) return;
          if (e.target.dataset.index === "ende") {
            zaehler.textContent = "Ende";
            if (D.Analytics && !host.__fertig) {
              host.__fertig = true;
              D.Analytics.track("immersive_complete", { universeId: universeId, count: gesamt });
            }
            return;
          }
          var i = Number(e.target.dataset.index);
          if (!isNum(i)) return;
          zaehler.textContent = (i + 1) + " von " + gesamt;
          if (options.merken) options.merken(i);
          if (D.Swipe) D.Swipe.melden("feed:karte", { index: i, symbol: e.target.dataset.symbol });
          /* Vorbereiten, was als Naechstes kommt - und das naechste Stueck
             holen, bevor das Ende des gezeigten erreicht ist. */
          var naechste = order[i + 1];
          if (naechste && D.Swipe) D.Swipe.vorladen("/discover/data/stocks/" + universeId + "/" + naechste.s + ".json");
          if (i >= gezeigt - 5) naechstesStueck();
        });
      }, { root: spur, threshold: 0.55 });
      beobachter.observe(ende);
    }

    /* Die ersten Karten liegen bei. */
    karten.forEach(function (k, i) { anhaengen(k, i); });
    gezeigt = Math.max(gezeigt, Math.min(karten.length, gesamt));
    if (gezeigt >= gesamt) { fertig = true; ende.hidden = false; }
    if (!global.IntersectionObserver) { /* ohne Beobachter: alles in Stuecken nachladen, wenn gescrollt wird */
      spur.addEventListener("scroll", function () {
        if (spur.scrollTop + spur.clientHeight * 3 > spur.scrollHeight) naechstesStueck();
      });
    }
    if (D.Analytics) D.Analytics.track("immersive_start", { universeId: universeId, count: gesamt });

    host.appendChild(spur);
    root.appendChild(host);
    /* Die Spur faengt oben an - auch wenn die Seite davor weit unten
       stand; sonst uebernimmt der Browser den alten Versatz und die
       Zaehlung beginnt bei drei. */
    spur.scrollTop = 0;
    /* Der Wisch-Hinweis liegt unter dem Inhalt des ersten Bildschirms.
       Reicht der Inhalt bis dorthin (kleines Telefon, langer Satz), faellt
       der Hinweis weg - ein Knopf unter einem Pfeil ist keiner. */
    if (global.requestAnimationFrame) global.requestAnimationFrame(function () {
      var wink = spur.querySelector(".dx-feed-weiter");
      var inhalt = wink && wink.parentNode ? wink.parentNode.querySelector(".dx-feed-inner") : null;
      if (wink && inhalt && inhalt.getBoundingClientRect().bottom > wink.getBoundingClientRect().top - 4) wink.hidden = true;
    });

    /* Zurueck an die Stelle, an der man war (Sitzung, nicht Konto). */
    var resume = isNum(options.resumeIndex) ? options.resumeIndex : -1;
    if (resume > 0 && resume < gesamt) {
      var schritte = 0;
      (function weiter() {
        if (gezeigt > resume || schritte >= 6) {
          var ziel = spur.querySelector('[data-index="' + Math.min(resume, gezeigt - 1) + '"]');
          if (ziel) ziel.scrollIntoView({ block: "start", behavior: "auto" });
          return;
        }
        schritte++;
        naechstesStueck().then(function (ok) { if (ok) weiter(); });
      })();
    }
    host.__naechstesStueck = naechstesStueck;
    host.__stand = function () { return { gezeigt: gezeigt, gesamt: gesamt, fertig: fertig }; };
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
        karte.was ? el("p", { class: "dx-was-line", text: karte.was }) : null,
        /* Was das Unternehmen gemacht hat - der belegte Satz aus den
           Jahresabschluessen, wo einer vorliegt. */
        karte.hook && karte.hook.text ? el("p", { class: "dx-hook dx-feed-hook" }, [
          el("i", { class: "dx-hook-mark", "aria-hidden": "true" }),
          document.createTextNode(karte.hook.text),
          el("span", { class: "dx-hook-src", text: "GJ " + karte.hook.from + "–" + karte.hook.to })
        ]) : null,
        el("div", { class: "dx-feed-bild" }, [
          C().lazyArtwork(karte, { width: 720, height: 260, ticker: true, scale: "hero" })
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
