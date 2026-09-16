/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/cards.js

   Die Bausteine der Discovery-Flaeche: Poster, Rang-Poster, Sektorkachel,
   Reihen, Verlaufsbilder, Zustaende.

   DER UNTERSCHIED ZUR ERSTEN FASSUNG

   Eine Karte ist hier kein Datenbankeintrag mit Kennzahlen, sondern eine
   Flaeche mit einem Verlauf darin. Der Chart traegt das untere Drittel;
   Signal und Kennzahl stehen darueber. Auf den ersten Blick soll erkennbar
   sein, WELCHES UNTERNEHMEN, WELCHES SIGNAL und WIE DER VERLAUF AUSSIEHT -
   und erst danach die Zahl.

   WAS GEZEICHNET WIRD, WENN ES KEINE KURSREIHE GIBT (V3)

   Fuer reale Titel bleiben absolute Kursniveaus nach der
   Redistributionsregel zurueck. Die Karte zeichnet dann KEINE Linie -
   sondern die vier Renditen ueber 1, 3, 6 und 12 Monate als Balken
   (ui/microchart.js). Eine Linie gibt es nur aus einer ausgelieferten
   Kursreihe. Der fruehere Renditepfad sah aus wie ein Chart und war
   keiner; das ist vorbei.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;
  var NS = "http://www.w3.org/2000/svg";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function valueOf(f) { return f && typeof f === "object" ? f.value : (isNum(f) ? f : null); }
  function statusOf(f) { return f && typeof f === "object" ? f.status : "SOURCE_MISSING"; }

  /* Prozent in deutscher Schreibweise: Komma, echtes Minus, geschuetztes
     Leerzeichen vor dem Zeichen - dieselbe Form wie im Klartext. */
  function prozentText(p, d) {
    var s = Math.abs(p).toFixed(d).replace(".", ",");
    return (p > 0 ? "+" : p < 0 ? "\u2212" : "") + s + "\u00a0%";
  }
  function pct(v, digits) {
    if (!isNum(v)) return "–";
    var scaled = v * 100;
    var d = digits === undefined ? (Math.abs(scaled) < 1 ? 2 : 1) : digits;
    return prozentText(scaled, d);
  }
  function pctPoints(v, digits) {
    if (!isNum(v)) return "–";
    return prozentText(v, digits === undefined ? 2 : digits);
  }
  /** "11.09.2026" aus einem ISO-Datum - fuer Stand-Angaben ohne Anbietername. */
  function dateShort(iso) {
    if (!iso || String(iso).length < 10) return String(iso || "");
    var t = String(iso);
    return t.slice(8, 10) + "." + t.slice(5, 7) + "." + t.slice(0, 4);
  }

  function money(v) {
    if (!isNum(v)) return "–";
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $";
  }
  function score(v) { return isNum(v) ? String(Math.round(v)) : "–"; }
  function times(v) { return isNum(v) ? v.toFixed(1) + "x" : "–"; }
  function toneClass(v) { return !isNum(v) ? "" : v > 0 ? "up" : v < 0 ? "down" : ""; }

  var STATUS_TEXT = {
    WITHHELD_REDISTRIBUTION: "Anbieterkurs, nicht auslieferbar",
    SOURCE_MISSING: "Quelle liefert den Wert nicht",
    INSUFFICIENT_HISTORY: "Zu wenig Historie",
    NOT_APPLICABLE: "Nicht anwendbar"
  };

  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = String(attrs[k]);
      else node.setAttribute(k, String(attrs[k]));
    });
    return node;
  }

  /* Verlaufsfuellungen einmal je Dokument. Ohne gemeinsame defs traegt
     jede Karte ihre eigene Definition - bei 150 Karten sind das 150
     ueberfluessige Knoten. */
  function ensureDefs() {
    if (document.getElementById("dx-defs")) return;
    var holder = svg("svg", { id: "dx-defs", width: 0, height: 0,
                              style: "position:absolute;width:0;height:0;overflow:hidden" });
    var defs = svg("defs", {});
    [["dxUp", "63,208,127"], ["dxDown", "240,103,92"], ["dxHeroFill", "63,208,127"]].forEach(function (pair) {
      var grad = svg("linearGradient", { id: pair[0], x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.appendChild(svg("stop", { offset: "0%", "stop-color": "rgb(" + pair[1] + ")", "stop-opacity": ".30" }));
      grad.appendChild(svg("stop", { offset: "100%", "stop-color": "rgb(" + pair[1] + ")", "stop-opacity": "0" }));
      defs.appendChild(grad);
    });
    holder.appendChild(defs);
    document.body.appendChild(holder);
  }

  /* ------------------------------------------------------- Verlaufsbilder */

  /**
   * Flaechenchart aus einer Kursreihe (Sparkline-Punkte).
   * @param {number[]} values
   * @param {object} opts {width, height, label, showLast}
   */
  function areaChart(values, opts) {
    opts = opts || {};
    ensureDefs();
    var w = opts.width || 300, h = opts.height || 104, padTop = 10, padBottom = 6;
    var node = svg("svg", { class: "dx-spark", viewBox: "0 0 " + w + " " + h,
                            preserveAspectRatio: "none", role: "img",
                            "aria-label": opts.label || "Kursverlauf" });
    var clean = values.filter(isNum);
    if (clean.length < 3) return node;
    var lo = Math.min.apply(null, clean), hi = Math.max.apply(null, clean);
    if (lo === hi) { lo -= 1; hi += 1; }
    var up = clean[clean.length - 1] >= clean[0];
    var x = function (i) { return (i / (values.length - 1)) * w; };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    var d = "", started = false;
    values.forEach(function (v, i) {
      if (!isNum(v)) { started = false; return; }
      d += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
      started = true;
    });
    if (!d) return node;
    node.appendChild(svg("path", { class: "area" + (up ? "" : " down"),
      d: d + "L" + w + " " + h + " L0 " + h + " Z" }));
    node.appendChild(svg("path", { class: "line" + (up ? "" : " down"), d: d.trim() }));
    if (opts.showLast !== false) {
      node.appendChild(svg("circle", { class: "node" + (up ? "" : " down"),
        cx: x(values.length - 1).toFixed(1), cy: y(clean[clean.length - 1]).toFixed(1), r: 2.6 }));
    }
    return node;
  }

  /**
   * Rebasierter Renditepfad: fuenf Stuetzstellen, sichtbar markiert.
   *
   * Bewusst mit Knoten und ohne Glaettung. Eine weiche Kurve durch vier
   * Punkte sieht aus wie eine Kursreihe, und genau das ist sie nicht.
   */
  function pathChart(points, opts) {
    opts = opts || {};
    ensureDefs();
    var w = opts.width || 300, h = opts.height || 104;
    var padTop = 14, padBottom = opts.labels === false ? 8 : 18, padX = 10;
    var node = svg("svg", { class: "dx-spark", viewBox: "0 0 " + w + " " + h,
                            preserveAspectRatio: "none", role: "img",
                            "aria-label": opts.label || "Renditepfad der letzten zwölf Monate" });
    if (!points || points.length < 2) return node;
    var werte = points.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, werte), hi = Math.max.apply(null, werte);
    if (lo === hi) { lo -= 1; hi += 1; }
    var spanne = hi - lo;
    lo -= spanne * 0.12; hi += spanne * 0.12;
    var up = werte[werte.length - 1] >= werte[0];
    var x = function (i) { return padX + (i / (points.length - 1)) * (w - padX * 2); };
    var y = function (v) { return h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom); };

    /* Nulllinie: der Stand vor zwoelf Monaten. Ohne sie sagt die Form
       nichts darueber, ob der Titel ueberhaupt gestiegen ist. */
    node.appendChild(svg("line", { class: "grid", x1: 0, x2: w,
      y1: y(werte[0]).toFixed(1), y2: y(werte[0]).toFixed(1) }));

    var d = points.map(function (p, i) {
      return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1);
    }).join(" ");
    node.appendChild(svg("path", { class: "area" + (up ? "" : " down"),
      d: d + " L" + x(points.length - 1).toFixed(1) + " " + h + " L" + x(0).toFixed(1) + " " + h + " Z" }));
    node.appendChild(svg("path", { class: "line" + (up ? "" : " down"), d: d }));
    points.forEach(function (p, i) {
      node.appendChild(svg("circle", { class: "node" + (up ? "" : " down"),
        cx: x(i).toFixed(1), cy: y(p.value).toFixed(1), r: i === points.length - 1 ? 3 : 1.9 }));
    });
    if (opts.labels !== false) {
      [0, points.length - 1].forEach(function (i) {
        node.appendChild(svg("text", { class: "tick", x: i === 0 ? 2 : w - 2,
          y: h - 5, "text-anchor": i === 0 ? "start" : "end", text: points[i].label }));
      });
    }
    return node;
  }

  /**
   * Das Artwork einer Karte. Es ersetzt die frühere Sparkline: dieselbe
   * Datengrundlage, aber als Komposition aus Verlauf, Schwankungsband,
   * Jahresspanne, Lichtschein und - wo Platz ist - dem Kürzel als Fläche.
   * Die Herleitung steht in discover/ui/artwork.js.
   */
  function posterMedia(card, opts) {
    opts = opts || {};
    return lazyArtwork(card, Object.assign({ klasse: "dx-poster-media" }, opts));
  }

  /* Ein Beobachter fuer alle Karten: sobald ein Datenbild in die Naehe
     des Bildschirms kommt, wird seine Reihe geholt. Nicht vorher. */
  var lazyBeobachter = null;
  function beobachten(node, fn) {
    if (!global.IntersectionObserver) { fn(); return; }
    if (!lazyBeobachter) {
      lazyBeobachter = new global.IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (e) {
          if (!e.isIntersecting) return;
          lazyBeobachter.unobserve(e.target);
          var cb = e.target.__lazy;
          delete e.target.__lazy;
          if (cb) cb();
        });
      }, { rootMargin: "240px 320px" });
    }
    node.__lazy = fn;
    lazyBeobachter.observe(node);
  }

  /* Ein zweiter Beobachter fuer den Tagesverlauf - mit Rand von nur 80
     Pixeln und ohne Abmelden: eine Karte abonniert, wenn sie im Bild ist,
     und kuendigt, wenn sie es verlaesst. Ausserhalb des Bildschirms gibt
     es kein Abonnement - nie mehr Abonnements als sichtbare Karten. */
  var liveBeobachter = null;
  function liveBeobachten(node, rein, raus) {
    if (!global.IntersectionObserver) { rein(); return; }
    if (!liveBeobachter) {
      liveBeobachter = new global.IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (e) {
          var t = e.target;
          if (e.isIntersecting) { if (t.__liveRein) t.__liveRein(); }
          else if (t.__liveRaus) t.__liveRaus();
        });
      }, { rootMargin: "80px 0px" });
    }
    node.__liveRein = rein; node.__liveRaus = raus;
    liveBeobachter.observe(node);
  }

  /**
   * Das Datenbild einer Karte - sofort, wenn die Reihe da ist (oder es
   * keine gibt: dann die Leiter); sonst ein Platzhalter, der eindeutig
   * kein Chart ist, und die Reihe, sobald die Karte sichtbar wird.
   *
   * Seit dem Live-Hub kommt davor der Tagesverlauf: traegt der Titel
   * einen Intraday-Snapshot (Verzeichnis des Hubs), zeigt die Karte die
   * laufende oder letzte Sitzung mit Beschriftung ("Heute · Stand 15:42",
   * "Letzter Handelstag · Freitag") - und laedt die Tagesreihe nur, wenn
   * es keinen gibt. Ein Abruf je sichtbarer Karte, nicht zwei.
   *
   * Der Platzhalter hat dieselbe Hoehe wie das Bild: beim Laden springt
   * nichts. Dieselbe Reihe wird je Titel einmal geladen (series-loader).
   */
  function lazyArtwork(card, opts) {
    opts = opts || {};
    var w = opts.width || 300, h = opts.height || 104;
    var artOpts = { width: w, height: h, ticker: opts.ticker === true, scale: opts.scale || "poster",
                    range: opts.range || (card.priceSeries && card.priceSeries.range) || null };
    var host = el("div", { class: opts.klasse || "dx-lazy-media" });
    var ps = card.priceSeries;
    var Loader = D() && D().SeriesLoader;
    var Hub = D() && D().LiveHub;
    var verweis = ps && ps.status === "CALCULATED" && ps.path && !ps.points && Loader;
    var liveFaehig = !!(Hub && Hub.enabled() && card.dataMode === "real" && opts.live !== false && card.symbol);
    host.setAttribute("data-symbol", card.symbol || "");
    if (!verweis && !liveFaehig) {
      host.appendChild(D().Artwork.stockArtwork(card, artOpts));
      return host;
    }

    /* Der Tagesverlauf hat Vorrang - wenn das Verzeichnis den Titel kennt.
       Das Verzeichnis liegt beim Start der Seite vor (app.js laedt es mit
       der Metadatei); die Entscheidung faellt deshalb hier synchron. */
    var liveEintrag = liveFaehig ? Hub.resolveEntry(card.symbol) : null;

    function tagesreihe() {
      if (host.__live) return;
      if (!verweis) { S.clear(host); host.appendChild(D().Artwork.stockArtwork(card, artOpts)); return; }
      Loader.get(ps.path).then(function (reihe) {
        if (host.__live) return;
        var voll = Object.assign({}, card, { priceSeries: Loader.merge(ps, reihe) });
        S.clear(host);
        host.removeAttribute("data-loading");
        host.appendChild(D().Artwork.stockArtwork(voll, artOpts));
      }).catch(function () {
        /* Die Reihe kam nicht: dann das, was ohne sie gilt - die Leiter.
           Kein leeres Bild, kein Fehlertext auf der Karte. */
        if (host.__live) return;
        S.clear(host);
        host.removeAttribute("data-loading");
        host.appendChild(D().Artwork.stockArtwork(card, artOpts));
      });
    }

    if (verweis || liveEintrag) {
      host.setAttribute("data-series", verweis ? ps.path : "");
      host.setAttribute("data-loading", "true");
      host.style.setProperty("--ar", w + " / " + h);
      host.appendChild(el("div", { class: "dx-art-skeleton", "aria-hidden": "true", text: "Kurs lädt" }));
    } else {
      host.appendChild(D().Artwork.stockArtwork(card, artOpts));
    }
    if (verweis) {
      beobachten(host, function () { if (!liveEintrag) tagesreihe(); });
    }
    if (liveFaehig) liveBinden(host, card, artOpts, tagesreihe);
    return host;
  }

  /* Abonnieren im Bild, kuendigen ausserhalb. Der Rueckruf zeichnet den
     Tagesverlauf neu, wenn ein neuerer Stand kommt - und faellt auf die
     Tagesreihe zurueck, wenn es fuer den Titel keinen gibt. */
  function liveBinden(host, card, artOpts, tagesreihe) {
    var Hub = D().LiveHub, MC = D().MicroChart;
    var abo = null;
    function zeigen(p) {
      if (!p.snapshot) {
        if (!host.__live) tagesreihe();
        return;
      }
      var svgNode = MC.renderIntraday(p.snapshot, { width: artOpts.width, height: artOpts.height,
                                                    symbol: card.symbol, label: p.label && p.label.label });
      if (!svgNode) { if (!host.__live) tagesreihe(); return; }
      host.__live = true;
      S.clear(host);
      host.removeAttribute("data-loading");
      host.setAttribute("data-live", p.snapshot.regularComplete ? "complete" : "running");
      host.setAttribute("data-session", p.snapshot.sessionDate);
      host.setAttribute("data-freshness", (p.freshness && p.freshness.freshnessState) || "");
      host.appendChild(svgNode);
      host.appendChild(liveLabel(p.label, p.snapshot));
    }
    liveBeobachten(host,
      function () { if (!abo) abo = Hub.subscribe(card.symbol, zeigen); },
      function () { if (abo) { abo(); abo = null; } });
  }

  /** "Heute · Stand 15:42" - die Beschriftung des Tagesverlaufs. */
  function liveLabel(label, snap) {
    var text = (label && label.label) || "";
    var tone = (label && label.tone) || (snap && snap.regularComplete ? "complete" : "live");
    return el("span", { class: "dx-live-label dx-live-label--" + tone, "data-freshness": (label && label.state) || "",
                        title: (label && label.timezoneNote ? label.timezoneNote + " · " : "") +
                               "5-Minuten-Kurse" + (tone === "stale" ? " · dieser Stand ist nicht der letzte Handelstag" : "") },
      [el("i", { "aria-hidden": "true" }), document.createTextNode(text)]);
  }

  function D() { return global.VUDiscover; }

  /* ------------------------------------------------------------- Signale */
  /* Welche Farbwelt gehört zu welchem Signal? Dieselbe Zuordnung wie im
     Build (discover-v1.json → visualLanguage.signalWorlds); sie steht hier
     noch einmal, weil die Karte auch ohne geladene Methodik rendern muss. */
  var SIGNAL_TONE = {
    new52WeekHigh: "highs", nearHigh: "highs", marketLeader: "leadership",
    momentumLeader: "momentum", relativeStrengthLeader: "strength",
    breakout: "breakout", trendIntact: "quality", sectorLeader: "sectors",
    notTrading: "muted"
  };

  function signalChip(badge) {
    if (!badge) return null;
    return el("span", { class: "dx-sig dx-sig--" + (SIGNAL_TONE[badge.id] || "muted") }, [
      document.createTextNode(badge.label),
      badge.detail ? el("small", { text: badge.detail }) : null
    ]);
  }

  /* ------------------------------------------------------------- Klartext */
  /* Die Karte fragt die Übersetzungsschicht, was sie zeigen soll. Der
     Build hat die Antwort schon gerechnet und mitgeliefert (`plain`); nur
     wenn eine Karte aus einer älteren Auslieferung stammt, wird sie hier
     nachgerechnet. Zwei Wege, ein Ergebnis - die Engine ist dieselbe. */
  function klartext(card, rowId) {
    if (card && card.plain && card.plain.story) return card.plain;
    var K = D() && D().Klartext;
    return K ? K.karte(card, { rowId: rowId }) : null;
  }

  /**
   * Ein Stock Poster.
   *
   * Die Reihenfolge auf der Karte ist eine Produktentscheidung und keine
   * Layoutfrage: zuerst WELCHE FIRMA, dann WARUM sie hier steht, dann EINE
   * Zahl, die man ohne Vorkenntnisse einordnen kann, dann das Bild. Was
   * darunter läge - Leadership Score, Perzentil, Momentum -, steht auf der
   * Aktienseite. Eine Karte, die sechs Kennzahlen gleichzeitig zeigt,
   * beantwortet keine einzige Frage.
   *
   * @param {object} card    Contract.toCard-Form
   * @param {object} options {rowId, universeId, variant: "poster"|"compact"|"wide", rank}
   */
  function poster(card, options) {
    options = options || {};
    var kompakt = options.variant === "compact";
    var breit = options.variant === "wide";
    var text = klartext(card, options.rowId) || {};
    var preis = valueOf(card.price);
    var change = valueOf(card.changePercent);

    var gesehen = D() && D().memory && D().memory.opened(card.symbol);
    var node = el("a", {
      class: "dx-poster" + (kompakt ? " dx-poster--compact" : "") + (breit ? " dx-poster--wide" : "") +
             (gesehen ? " dx-poster--gesehen" : ""),
      href: "#/s/" + (options.universeId || "US_REAL") + "/" + card.symbol,
      "data-symbol": card.symbol,
      /* Die Karte trägt die Welt ihrer REIHE; das Signal darauf trägt seine
         eigene. So bleibt die Reihe als Welt erkennbar, ohne dass ein
         abweichendes Signal verschwiegen wird. */
      "data-world": options.world || card.world || null,
      "aria-label": (card.companyName || card.symbol) +
        (text.story ? " — " + text.story : "") + " öffnen"
    }, [
      el("div", { class: "dx-poster-top" }, [
        el("div", { class: "dx-poster-id" }, [
          /* Der Name ist die Überschrift. Wo keiner ausgeliefert wird,
             übernimmt das Kürzel diese Rolle - erfunden wird keiner. */
          el("b", { class: "dx-poster-name",
                    text: card.companyName || card.symbol }),
          el("span", { class: "dx-poster-sub" }, [
            el("span", { class: "dx-poster-sym", text: card.symbol }),
            isNum(preis) ? el("span", { class: "dx-poster-preis" }, [
              document.createTextNode(money(preis)),
              isNum(change) ? el("i", { class: toneClass(change),
                                        text: pctPoints(change) }) : null
            ]) : null
          ])
        ])
      ]),
      /* Womit die Firma Geld verdient - ein Einzeiler aus der
         redaktionellen Liste. Er beantwortet "Was ist das?", bevor die
         Zahl "Was ist passiert?" beantwortet. Wo keiner vorliegt, steht
         auch keiner: erfunden wird nichts. */
      card.was && !kompakt ? el("p", { class: "dx-was-line", text: card.was }) : null,
      /* V4 §6/§26 - die Hierarchie der Karte: UNTERNEHMEN, KENNZAHL,
         KLARTEXT, CHART, dann die fundamentale Geschichte. */
      /* Die eine Zahl. Groß genug, um sie aus zwei Metern zu lesen. */
      text.zahl ? el("div", { class: "dx-zahl" }, [
        el("b", { class: "num " + (text.zahl.ton || ""), text: text.zahl.wert }),
        el("span", { text: text.zahl.label })
      ]) : null,
      /* Die eine Aussage. Der Punkt davor trägt die Farbwelt - die Farbe
         wiederholt, was im Text steht, sie ersetzt ihn nie. */
      text.story ? el("p", { class: "dx-story" }, [
        el("i", { class: "dx-story-dot", "aria-hidden": "true" }),
        document.createTextNode(text.story)
      ]) : null,
      posterMedia(card, {
        height: kompakt ? 66 : (breit ? 132 : 92),
        width: breit ? 392 : (kompakt ? 224 : 300),
        ticker: breit === true || options.variant === "rank",
        scale: kompakt ? "mini" : "poster"
      }),
      /* Was das Unternehmen gemacht hat - ein belegter Satz aus den
         Jahresabschluessen (Fundamentals-Engine). Nur wo einer vorliegt. */
      card.hook && card.hook.text && !kompakt ? el("p", { class: "dx-hook",
        title: "Aus den Jahresabschlüssen " + card.hook.from + "–" + card.hook.to + ", Stand " + (card.hook.asOf || "") + " · Herkunft: Daten & Quellen" }, [
        el("i", { class: "dx-hook-mark", "aria-hidden": "true" }),
        document.createTextNode(card.hook.text)
      ]) : null
    ]);

    /* Die kurze Zusatzinfo. Sie wiederholt die Überschrift nicht - dafür
       sorgt klartext.js - und sie ist immer Text, nie nur Farbe. Rechts
       daneben der Grund weiterzuklicken: ein Pfeil, der sagt, dass hinter
       der Karte eine Seite liegt - auch ohne Hover. */
    if (!kompakt) {
      node.appendChild(el("div", { class: "dx-poster-foot" }, [
        text.zusatz ? el("span", { class: "dx-zusatz", text: text.zusatz }) : el("span", {}),
        el("span", { class: "dx-poster-cta", "aria-hidden": "true", text: "Ansehen →" })
      ]));
    }
    node.addEventListener("click", function () {
      var A = D() && D().Analytics;
      if (A) A.track("card_open", { universeId: options.universeId || "US_REAL", rowId: options.rowId || null,
                                    symbol: card.symbol, position: options.position || options.rank || null });
    });

    /* Der Hover-Vorhang zeigt, was als Nächstes interessiert: dieselbe
       Aktie über drei Zeiträume. Keine Scores - drei Zahlen, die jeder
       lesen kann. */
    if (!kompakt) {
      var K = D() && D().Klartext;
      var achse = K ? K.zeitachse(card).filter(function (e) {
        return e.key !== "return3M";
      }) : [];
      node.appendChild(el("div", { class: "dx-reveal", "aria-hidden": "true" },
        achse.map(function (e) { return revealItem(e.label, e.wert); })
             .concat([el("span", { class: "dx-open", text: "Öffnen →" })])));
    }

    if (card.dataMode === "mock") node.setAttribute("data-mock", "true");
    return node;
  }

  function revealItem(label, value) {
    return el("div", {}, [el("span", { text: label }), el("b", { class: "num", text: value })]);
  }

  /** Rang-Poster der Signature-Reihe: Ziffer neben der Karte. */
  function rankPoster(card, options) {
    options = options || {};
    var nummer = String(options.rank);
    return el("div", { class: "dx-rank", "data-world": options.world || null }, [
      el("div", { class: "dx-rank-num", "aria-hidden": "true",
                  text: nummer.length < 2 ? "0" + nummer : nummer }),
      poster(card, options)
    ]);
  }

  /** Sektorkachel: drei Titel, ein Sektor, kein Kartenstapel. */
  function sectorTile(sector, options) {
    options = options || {};
    /* Die Kachel zeigt Name und Zwoelfmonatsrendite - der Leadership Score
       stand hier als zweite Zahl und war die einzige auf der ganzen
       Startseite, die man nicht einordnen kann. Er ist nicht weg: er
       steht auf der Aktienseite. */
    var rows = sector.cards.slice(0, 4).map(function (card, index) {
      var m = card.metrics || {};
      return el("div", { class: "dx-sector-row" }, [
        el("i", { text: String(index + 1) }),
        el("div", { style: "min-width:0" }, [
          el("b", { text: card.companyName || card.symbol }),
          el("em", { text: card.companyName ? card.symbol : (card.exchange || "") })
        ]),
        el("span", { class: "val num " + (isNum(m.return12M) ? toneClass(m.return12M) : ""),
                     text: isNum(m.return12M) ? pct(m.return12M, 0) : "–" })
      ]);
    });
    var node = el("a", {
      class: "dx-sector", "data-world": options.world || null,
      href: "#/c/" + (options.universeId || "US_REAL") + "/sector-leaders",
      "aria-label": "Sektor " + sector.sector + " ansehen"
    }, [
      el("div", { class: "dx-sector-head" }, [
        el("h3", { text: sector.sector }),
        el("span", { text: sector.count + " Titel" })
      ])
    ].concat(rows).concat([
      el("div", { class: "dx-sector-foot", text: "Sektor ansehen →" })
    ]));
    return node;
  }

  /* --------------------------------------------------------------- Reihen */
  function skeletonRail(count) {
    var rail = el("div", { class: "dx-rail" });
    for (var i = 0; i < (count || 5); i++) rail.appendChild(el("div", { class: "dx-skeleton" }));
    return rail;
  }

  function emptyState(title, message) {
    return el("div", { class: "dx-empty" }, [el("b", { text: title }), document.createTextNode(message)]);
  }

  function note(title, message, variant) {
    return el("div", { class: "dx-note" + (variant === "warm" ? " dx-note--warm" : "") }, [
      title ? el("b", { text: title }) : null, document.createTextNode(message)
    ]);
  }

  function railHead(title, subtitle, options) {
    options = options || {};
    return el("div", { class: "dx-rail-head" }, [
      el("h2", { text: title }),
      subtitle ? el("p", { text: subtitle }) : null,
      options.count ? el("span", { class: "dx-rail-count", text: options.count }) : null,
      options.href ? el("a", { class: "dx-more", href: options.href }, [
        document.createTextNode(options.moreLabel || "Alle anzeigen"),
        document.createTextNode(" →")
      ]) : null
    ]);
  }

  /**
   * Eine Discovery-Reihe.
   * @param {object} row     Zeilen-Payload
   * @param {object} options {universeId, variant: "poster"|"compact"|"rank", limit}
   */
  function rail(row, options) {
    options = options || {};
    var variant = options.variant || "poster";
    var section = el("section", { class: "dx-rail-section dx-fade", "data-row": row.rowId });

    section.appendChild(railHead(row.title, row.subtitle, {
      count: row.coverage
        ? row.coverage.matched + " von " + row.coverage.universeSize + (options.countSuffix || "")
        : null,
      href: options.showMore === false ? null : "#/c/" + row.universeId + "/" + row.rowId
    }));

    var welt = options.world || row.world || null;
    if (welt) section.setAttribute("data-world", welt);
    var cards = (row.cards || []).slice(0, options.limit || 24);
    if (!cards.length) {
      section.appendChild(emptyState("Keine Treffer",
        "In dieser Kategorie erfüllt derzeit kein Titel des Universums »" + row.universeLabel +
        "« die Bedingung. Das ist ein Befund, kein Fehler — Stand " + (row.asOf || "unbekannt") + "."));
      return section;
    }

    var track = el("div", { class: "dx-rail", role: "list", "aria-label": row.title });
    cards.forEach(function (card, index) {
      var hinweis = options.hinweise ? options.hinweise[card.symbol] : null;
      var item = variant === "rank"
        ? rankPoster(card, { rowId: row.rowId, universeId: row.universeId, rank: index + 1,
                             world: welt, variant: "rank" })
        : poster(card, { rowId: row.rowId, universeId: row.universeId, variant: variant,
                         world: welt, hinweis: hinweis, position: index + 1 });
      item.setAttribute("role", "listitem");
      track.appendChild(item);
    });

    section.appendChild(withRailNav(track, { label: row.rowId, universeId: row.universeId }));
    return section;
  }

  /** Pfeile am Rand. Sie erscheinen nur mit Zeiger und nur, wo es weitergeht. */
  /**
   * Die Spur bekommt ihre Bedienung.
   *
   * Die Gestenlogik steht in ui/swipe.js und ist fuer jede Sammlung
   * dieselbe - hier haengen nur die beiden Pfeile daran, die auf dem
   * Schreibtisch zeigen, dass es weitergeht. Auf dem Telefon sind sie
   * nicht da: dort wischt man.
   */
  function withRailNav(track, options) {
    options = options || {};
    var prev = el("button", { class: "dx-rail-nav dx-rail-nav--prev", type: "button",
                              "aria-label": "Zurück", hidden: true }, [chevron(true)]);
    var next = el("button", { class: "dx-rail-nav dx-rail-nav--next", type: "button",
                              "aria-label": "Weiter" }, [chevron(false)]);
    var wrap = el("div", { class: "dx-rail-wrap" }, [prev, track, next]);

    var swipe = D() && D().Swipe ? D().Swipe.verbinden(track, {
      label: options.label || null,
      universeId: options.universeId || null,
      onKarte: options.onKarte || null,
      /* Vorbereiten, was als Naechstes kommt: die Aktienseite der
         naechsten ein, zwei Karten - nicht die ganze Sammlung. */
      prefetch: options.prefetch || function (index) {
        /* Die Kursreihe der naechsten ein, zwei Karten - nicht die ganze
           Sammlung, nicht die Aktienseite. Ein Titel, der schon geladen
           ist, kostet nichts. */
        var kind = track.children[index];
        var media = kind && kind.querySelector && kind.querySelector("[data-series]");
        var sym = kind && kind.getAttribute && kind.getAttribute("data-symbol");
        if (D().LiveHub && D().LiveHub.enabled() && sym && D().LiveHub.resolveEntry(sym)) D().LiveHub.prefetch(sym);
        else if (media && D().SeriesLoader && media.getAttribute("data-series")) D().SeriesLoader.prefetch(media.getAttribute("data-series"));
      }
    }) : null;

    function schritt(richtung) {
      if (swipe) return swipe.schritt(richtung);
      track.scrollBy({ left: richtung * Math.max(280, track.clientWidth * 0.8),
                       behavior: "smooth" });
    }
    prev.addEventListener("click", function () { schritt(-1); });
    next.addEventListener("click", function () { schritt(1); });
    function pruefen() {
      prev.hidden = track.scrollLeft < 12;
      next.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 12;
    }
    track.addEventListener("scroll", pruefen, { passive: true });
    global.setTimeout(pruefen, 60);
    return wrap;
  }

  function chevron(left) {
    var icon = svg("svg", { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none",
                            stroke: "currentColor", "stroke-width": 2.4,
                            "stroke-linecap": "round", "stroke-linejoin": "round" });
    icon.appendChild(svg("polyline", { points: left ? "15 18 9 12 15 6" : "9 18 15 12 9 6" }));
    return el("i", {}, [icon]);
  }

  /** Gitter statt Reihe - fuer Kategorieseiten. */
  function grid(cards, options) {
    options = options || {};
    var host = el("div", { class: "dx-grid" });
    cards.forEach(function (card, index) {
      host.appendChild(poster(card, { rowId: options.rowId, universeId: options.universeId,
                                      rank: index + 1, world: options.world }));
    });
    return host;
  }

  /* Einblendung beim ersten Sichtbarwerden - mit Notbremse, damit eine
     Seite ohne Scrollereignis nicht unsichtbar bleibt. */
  function revealOnScroll(root) {
    var nodes = Array.prototype.slice.call((root || document).querySelectorAll(".dx-fade"));
    if (!global.IntersectionObserver) {
      nodes.forEach(function (n) { n.classList.add("in"); });
      return;
    }
    var io = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "120px" });
    nodes.forEach(function (n) { io.observe(n); });
    global.setTimeout(function () {
      nodes.forEach(function (n) { if (!n.classList.contains("in")) n.classList.add("in"); });
    }, 2000);
  }

  var api = {
    dateShort: dateShort,
    pct: pct, pctPoints: pctPoints, money: money, score: score, times: times,
    toneClass: toneClass, valueOf: valueOf, statusOf: statusOf, STATUS_TEXT: STATUS_TEXT,
    svg: svg, ensureDefs: ensureDefs,
    areaChart: areaChart, pathChart: pathChart, posterMedia: posterMedia, lazyArtwork: lazyArtwork, liveLabel: liveLabel,
    SIGNAL_TONE: SIGNAL_TONE,
    signalChip: signalChip, poster: poster, rankPoster: rankPoster, sectorTile: sectorTile,
    rail: rail, railHead: railHead, withRailNav: withRailNav, grid: grid,
    skeletonRail: skeletonRail, emptyState: emptyState, note: note,
    revealOnScroll: revealOnScroll, klartext: klartext
  };

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Cards = api;
})(window);
