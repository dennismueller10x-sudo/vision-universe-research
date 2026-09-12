/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/swipe.js

   EINE SWIPE-GRUNDLAGE, NICHT FÜNF KARUSSELLS

   Die Reihen von Discover waren bisher ein `overflow-x:auto` mit
   Scroll-Snap und zwei Pfeilen. Auf dem Telefon funktioniert das - der
   Browser bringt Momentum und Gummiband selbst mit, und wer versucht,
   das nachzubauen, macht es schlechter. Auf dem Schreibtisch fehlte
   dagegen fast alles: kein Ziehen mit der Maus, kein Trackpad-Gefühl,
   keine Tastatur, kein Zustand für Analytics, kein Prefetch.

   Dieses Modul ist die gemeinsame Grundlage. Es nimmt eine bestehende
   Spur (`.dx-rail`) und ergänzt, was fehlt - es ersetzt den nativen
   Scroll nicht. Das ist die wichtigste Entscheidung hier:

   DER BROWSER SCROLLT. WIR BEOBACHTEN NUR.

   Ein selbstgebauter Transform-Slider fühlt sich auf einem Telefon immer
   fremd an: er kennt weder die Beschleunigungskurve des Systems noch die
   Grenzen, an denen das Gerät nachfedert. Deshalb bleibt scrollLeft die
   Wahrheit, und jede Geste schreibt nur dorthin.

   WAS DAZUKOMMT

   - Ziehen mit der Maus (Desktop), ohne den Klick auf eine Karte zu
     zerstören: erst ab ein paar Pixeln Bewegung gilt es als Ziehen.
   - Tastatur: Pfeile, Pos1/Ende, Tab springt sichtbar.
   - Ein Fortschrittsband statt eines Balkens - es zeigt, dass es
     weitergeht, ohne wie eine Scrollleiste auszusehen.
   - Beobachtung, welche Karten sichtbar sind: daraus entstehen die
     Analytics-Ereignisse und das Vorladen der nächsten Karte.
   - Keine horizontale Geste stiehlt das vertikale Scrollen. Das ist der
     häufigste Fehler solcher Komponenten und der Grund, warum sie sich
     "wie eine Webseite mit Karussell" anfühlen.

   WAS AUSDRÜCKLICH NICHT DAZUKOMMT

   Kein Endlos-Nachladen, kein automatisches Weiterlaufen, keine
   Rückmeldung, die zum Weiterwischen drängt. Das hier ist ein
   Finanzprodukt: die Geste soll das Blättern leicht machen, nicht das
   Aufhören schwer.
   ========================================================================= */
(function (global) {
  "use strict";

  var MODULE_VERSION = "discover-swipe-1.0.0";

  /* Dieselbe DOM-Hilfe wie im ganzen Modul - sie kommt aus der
     bestehenden Produktschicht des Quant-Moduls (quant/ui/shell.js) und
     heisst dort QuantShell. */
  function el(tag, attrs, kinder) {
    var S = global.QuantShell;
    return S ? S.el(tag, attrs, kinder) : null;
  }

  /* Ereignisse gehen an eine Senke, die das Produkt setzen kann. Ohne
     Senke passiert nichts - kein Netzverkehr, kein Speicher, nichts.
     Gemessen wird spaeter, was NUETZT: welche Sammlung geoeffnet wird,
     welche Karte zur Aktienseite fuehrt. Nicht, wie lange jemand
     wischt. */
  var senke = null;
  function melden(name, daten) {
    if (typeof senke !== "function") return;
    try { senke(name, daten || {}); } catch (err) { /* Analytics darf nie stoeren */ }
  }
  function setSink(fn) { senke = typeof fn === "function" ? fn : null; }

  /**
   * Vorladen ohne Nebenwirkungen.
   *
   * Der erste Versuch war ein normaler fetch. Er funktioniert - und
   * hinterlaesst beim Verlassen der Seite abgebrochene Anfragen, die in
   * der Konsole wie Fehler aussehen und in der Browser-QA auch als solche
   * gezaehlt wurden. Ein Vorladen, das Fehler erzeugt, ist keines.
   *
   * `<link rel="prefetch">` ist genau dafuer da: der Browser laedt, wenn
   * er Luft hat, bricht lautlos ab, wenn nicht, und legt das Ergebnis in
   * denselben Cache, aus dem die Seite gleich liest. Jede Adresse wird
   * hoechstens einmal angemeldet.
   */
  var vorgeladen = Object.create(null);
  function vorladen(url) {
    if (!url || vorgeladen[url]) return;
    vorgeladen[url] = true;
    try {
      var link = global.document.createElement("link");
      link.rel = "prefetch";
      link.as = "fetch";
      link.href = url;
      global.document.head.appendChild(link);
    } catch (err) { /* Vorladen darf nie stoeren */ }
  }

  function reduzierteBewegung() {
    return global.matchMedia &&
           global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /**
   * Macht aus einer Spur eine Swipe-Spur.
   *
   * @param {HTMLElement} track  die Spur (`.dx-rail`)
   * @param {object} [opt]
   *        {string} label      Name der Sammlung (für Analytics)
   *        {function} onKarte  (index, node) sobald eine Karte sichtbar wird
   *        {function} prefetch (index) darf die nächsten Inhalte vorbereiten
   * @returns {{ schritt, aktualisieren, zerstoeren }}
   */
  function verbinden(track, opt) {
    opt = opt || {};
    if (!track || track.__swipe) return track && track.__swipe;

    var karten = function () { return Array.prototype.slice.call(track.children); };
    var aufraeumer = [];
    function on(ziel, typ, fn, o) {
      ziel.addEventListener(typ, fn, o);
      aufraeumer.push(function () { ziel.removeEventListener(typ, fn, o); });
    }

    /* ---------------------------------------------------------- Tastatur */
    track.setAttribute("tabindex", "0");
    if (!track.getAttribute("role")) track.setAttribute("role", "list");
    on(track, "keydown", function (e) {
      var weite = schrittweite();
      if (e.key === "ArrowRight") { track.scrollLeft += weite; e.preventDefault(); }
      else if (e.key === "ArrowLeft") { track.scrollLeft -= weite; e.preventDefault(); }
      else if (e.key === "Home") { track.scrollLeft = 0; e.preventDefault(); }
      else if (e.key === "End") { track.scrollLeft = track.scrollWidth; e.preventDefault(); }
      else return;
      melden("swipe:tastatur", { sammlung: opt.label, taste: e.key });
    });

    /* ------------------------------------------------------ Maus ziehen */
    /* Nur mit der Maus. Auf einem Touchgeraet wuerde jede kuenstliche
       Bewegung mit dem nativen Scroll kollidieren - dort machen wir
       nichts. */
    var zieht = false, gezogen = false, startX = 0, startScroll = 0;
    on(track, "pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      zieht = true; gezogen = false;
      startX = e.clientX; startScroll = track.scrollLeft;
    });
    on(track, "pointermove", function (e) {
      if (!zieht) return;
      var weg = e.clientX - startX;
      /* Unter acht Pixeln ist es ein Klick, kein Ziehen. Ohne diese
         Schwelle oeffnet jeder Klick auf eine Karte sie nicht mehr. */
      if (!gezogen && Math.abs(weg) < 8) return;
      if (!gezogen) {
        gezogen = true;
        track.classList.add("dx-rail--zieht");
        track.setPointerCapture(e.pointerId);
      }
      track.scrollLeft = startScroll - weg;
      e.preventDefault();
    });
    function loslassen(e) {
      if (!zieht) return;
      zieht = false;
      track.classList.remove("dx-rail--zieht");
      if (gezogen) {
        /* Der Klick, der aus dem Ziehen entsteht, darf keine Aktienseite
           oeffnen. Er wird genau einmal geschluckt. */
        var schlucken = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
        track.addEventListener("click", schlucken, { capture: true, once: true });
        global.setTimeout(function () {
          track.removeEventListener("click", schlucken, { capture: true });
        }, 0);
        melden("swipe:ziehen", { sammlung: opt.label });
      }
      if (e && e.pointerId !== undefined && track.hasPointerCapture &&
          track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
    }
    on(track, "pointerup", loslassen);
    on(track, "pointercancel", loslassen);
    on(track, "pointerleave", loslassen);

    /* ----------------------------------------------- Sichtbarkeit, Prefetch */
    var gesehen = Object.create(null);
    var beobachter = null;
    if (global.IntersectionObserver) {
      beobachter = new global.IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (eintrag) {
          if (!eintrag.isIntersecting) return;
          var alle = karten();
          var index = alle.indexOf(eintrag.target);
          if (index < 0 || gesehen[index]) return;
          gesehen[index] = true;
          melden("karte:sichtbar", { sammlung: opt.label, index: index });
          if (typeof opt.onKarte === "function") opt.onKarte(index, eintrag.target);
          /* Vorbereitet wird genau das, was als Naechstes kommt - nicht
             die ganze Sammlung. */
          if (typeof opt.prefetch === "function") {
            opt.prefetch(index + 1);
            opt.prefetch(index + 2);
          }
        });
      }, { root: track, threshold: 0.6 });
      karten().forEach(function (k) { beobachter.observe(k); });
      aufraeumer.push(function () { beobachter.disconnect(); });
    }

    /* ------------------------------------------------------ Fortschritt */
    var band = el("div", { class: "dx-swipe-band", "aria-hidden": "true" }, [el("i", {})]);
    var balken = band ? band.firstChild : null;
    if (band && track.parentNode) track.parentNode.appendChild(band);

    function schrittweite() {
      var erste = track.firstElementChild;
      var breite = erste ? erste.getBoundingClientRect().width : 280;
      var luecke = parseFloat(getComputedStyle(track).gap) || 16;
      /* Es wird in ganzen Karten geblaettert - eine halbe Karte am Rand
         ist der Hinweis, dass es weitergeht, kein Zielzustand. */
      var proBlick = Math.max(1, Math.floor(track.clientWidth / (breite + luecke)));
      return (breite + luecke) * proBlick;
    }

    function aktualisieren() {
      var max = track.scrollWidth - track.clientWidth;
      var anteil = max > 4 ? track.scrollLeft / max : 0;
      if (balken) {
        var sichtbar = max > 4 ? Math.max(0.12, track.clientWidth / track.scrollWidth) : 1;
        balken.style.width = (sichtbar * 100).toFixed(2) + "%";
        balken.style.transform = "translateX(" + (anteil * (100 / sichtbar - 100)).toFixed(2) + "%)";
      }
      if (band) band.hidden = max <= 4;
      track.dataset.amAnfang = String(track.scrollLeft < 12);
      track.dataset.amEnde = String(track.scrollLeft >= max - 12);
    }
    on(track, "scroll", aktualisieren, { passive: true });
    global.setTimeout(aktualisieren, 60);
    if (global.ResizeObserver) {
      var ro = new global.ResizeObserver(aktualisieren);
      ro.observe(track);
      aufraeumer.push(function () { ro.disconnect(); });
    }

    function schritt(richtung) {
      var verhalten = reduzierteBewegung() ? "auto" : "smooth";
      track.scrollBy({ left: richtung * schrittweite(), behavior: verhalten });
      melden("swipe:knopf", { sammlung: opt.label, richtung: richtung });
    }

    var api = {
      schritt: schritt,
      aktualisieren: aktualisieren,
      zerstoeren: function () {
        aufraeumer.forEach(function (f) { f(); });
        if (band && band.parentNode) band.parentNode.removeChild(band);
        delete track.__swipe;
      }
    };
    track.__swipe = api;
    return api;
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Swipe = {
    MODULE_VERSION: MODULE_VERSION,
    verbinden: verbinden, vorladen: vorladen,
    setSink: setSink,
    melden: melden
  };
})(window);
