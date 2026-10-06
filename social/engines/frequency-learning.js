/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/frequency-learning.js

   WAS DIE EIGENE FREQUENZ UEBER SICH SELBST WEISS (§35–§37)

   -------------------------------------------------------------------------
   DIE VERSUCHUNG, GEGEN DIE DIESE DATEI GEBAUT IST
   -------------------------------------------------------------------------

   Man misst: an Tagen mit zwei Beitraegen lief der zweite schlechter.
   Man schreibt: SECOND_POST_CAUSES_LOWER_REACH. Und ab da entscheidet
   das System nach einem Satz, den niemand geprueft hat.

   Der zweite Beitrag kann schlechter gelaufen sein, weil
     - er spaeter am Tag erschien,
     - er ein schwaecheres Thema hatte (das starke war schon vergeben),
     - die Plattform an dem Tag weniger ausspielte,
     - oder weil zwei Beitraege einander tatsaechlich Reichweite nehmen.

   Vier Erklaerungen, eine Beobachtung. Diese Datei nennt deshalb NUR
   die Beobachtung: OBSERVED_ASSOCIATION. Der Unterschied ist nicht
   sprachlich - ein System, das "verursacht" schreibt, hoert auf zu
   suchen.

   -------------------------------------------------------------------------
   WAS SIE AUSGIBT (§37)
   -------------------------------------------------------------------------

   ACHT WERTE, die alle gemessen oder ausdruecklich unbekannt sind, und
   SECHS ENTSCHEIDUNGEN, die sich daraus ableiten. Keine Entscheidung
   ohne ihren Wert; kein Wert ohne seine Stichprobe.

   Eine Beobachtung ohne Stichprobe ist eine Anekdote. Deshalb traegt
   jeder Wert seine Zahl bei sich, und unterhalb der Mindeststichprobe
   entsteht KEINE Empfehlung - nicht eine vorsichtige, sondern gar
   keine.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DIE MINDESTSTICHPROBE

     Dieselbe Zahl, die die Strategie fuer ein "bewaehrtes" Format
     verlangt. Zwei verschiedene Schwellen fuer dieselbe Frage - ab
     wann ist eine Beobachtung belastbar - waeren zwei Antworten.
     ------------------------------------------------------------------- */
  var MINDEST_STICHPROBE = 5;

  /* Was eine Beobachtung SEIN darf. Kausalsprache steht hier
     ausdruecklich nicht - und ein Test haelt das fest. */
  var BEFUND = {
    OBSERVED_ASSOCIATION: "OBSERVED_ASSOCIATION",
    NO_ASSOCIATION_OBSERVED: "NO_ASSOCIATION_OBSERVED",
    INSUFFICIENT_SAMPLE: "INSUFFICIENT_SAMPLE"
  };

  var ENTSCHEIDUNG = {
    DAILY_INTENT: "DAILY_INTENT",
    SECOND_POST_TODAY: "SECOND_POST_TODAY",
    MIN_SPACING_HOURS: "MIN_SPACING_HOURS",
    PREFERRED_HOUR: "PREFERRED_HOUR",
    WEEKLY_CEILING: "WEEKLY_CEILING",
    EXPLORATION_SHARE: "EXPLORATION_SHARE"
  };

  /* `Number(null)` ist 0, und 0 ist eine endliche Zahl. Der erste
     Entwurf zaehlte damit jeden UNGEMESSENEN Beitrag als einen mit der
     Leistung null - "er lief schlecht" statt "er wurde nicht
     gemessen". Genau die Verwechslung, gegen die der ganze Rest dieser
     Datei gebaut ist, im eigenen Hilfsmittel. */
  function zahl(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function mittel(liste) {
    var w = (liste || []).map(zahl).filter(function (x) { return x !== null; });
    if (!w.length) return null;
    return w.reduce(function (a, b) { return a + b; }, 0) / w.length;
  }

  /** Ein Wert mit seiner Stichprobe - nie ohne. */
  function wert(value, sampleSize, quelle) {
    return {
      value: value === undefined ? null : value,
      sampleSize: sampleSize || 0,
      belastbar: (sampleSize || 0) >= MINDEST_STICHPROBE,
      source: quelle || null
    };
  }

  function tag(iso) { return String(iso || "").slice(0, 10); }

  /**
   * Der Frequenzzustand aus dem eigenen Gedaechtnis.
   *
   * @param eintraege  Gedaechtniseintraege (nur EIGENE, gemessene)
   * @param options    { now }
   */
  function zustand(eintraege, options) {
    var o = options || {};
    var alle = (eintraege || []).filter(function (e) {
      return e && e.publishedAt;
    });
    var gemessen = alle.filter(function (e) {
      return zahl(e.performance) !== null;
    });

    /* ---------------------------------------------- Die acht Werte */

    /* 1. Wieviele Beitraege je Tag tatsaechlich erschienen sind. */
    var jeTag = {};
    alle.forEach(function (e) {
      var t = tag(e.publishedAt);
      jeTag[t] = (jeTag[t] || 0).valueOf() + 1;
    });
    var tage = Object.keys(jeTag);
    var proTag = wert(tage.length ? mittel(tage.map(function (t) { return jeTag[t]; })) : null,
      tage.length, "content-memory.publishedAt");

    /* 2. Wieviele Tage ueberhaupt zwei oder mehr trugen. */
    var mehrfachTage = tage.filter(function (t) { return jeTag[t] >= 2; });
    var anteilMehrfach = wert(tage.length ? mehrfachTage.length / tage.length : null,
      tage.length, "content-memory.publishedAt");

    /* 3./4. Die Leistung des ERSTEN und des ZWEITEN Beitrags eines Tages.
       Getrennt, weil genau ihr Unterschied die Frage ist - und
       ausdruecklich als zwei Zahlen und nicht als ein Verhaeltnis:
       ein Quotient sieht aus wie ein Effekt. */
    var ersteDesTages = [];
    var zweiteDesTages = [];
    var nachTag = {};
    gemessen.forEach(function (e) {
      var t = tag(e.publishedAt);
      (nachTag[t] = nachTag[t] || []).push(e);
    });
    Object.keys(nachTag).forEach(function (t) {
      var sortiert = nachTag[t].slice().sort(function (a, b) {
        return Date.parse(a.publishedAt) - Date.parse(b.publishedAt); });
      if (sortiert[0]) ersteDesTages.push(zahl(sortiert[0].performance));
      if (sortiert[1]) zweiteDesTages.push(zahl(sortiert[1].performance));
    });
    var leistungErster = wert(mittel(ersteDesTages), ersteDesTages.length,
      "content-memory.performance");
    var leistungZweiter = wert(mittel(zweiteDesTages), zweiteDesTages.length,
      "content-memory.performance");

    /* 5. Der tatsaechliche Abstand zwischen zwei Beitraegen. */
    var zeiten = alle.map(function (e) { return Date.parse(e.publishedAt); })
      .filter(function (t) { return Number.isFinite(t); })
      .sort(function (a, b) { return a - b; });
    var abstaende = [];
    for (var i = 1; i < zeiten.length; i += 1) {
      abstaende.push((zeiten[i] - zeiten[i - 1]) / 3600000);
    }
    var abstand = wert(mittel(abstaende), abstaende.length,
      "content-memory.publishedAt");

    /* 6. Die Stunde, zu der gemessene Beitraege im Mittel am besten
          liefen - je Stunde mit eigener Stichprobe. */
    var jeStunde = {};
    gemessen.forEach(function (e) {
      var h = new Date(Date.parse(e.publishedAt)).getUTCHours();
      (jeStunde[h] = jeStunde[h] || []).push(zahl(e.performance));
    });
    var besteStunde = null, besteN = 0, besterWert = null;
    Object.keys(jeStunde).forEach(function (h) {
      var n = jeStunde[h].length;
      var m = mittel(jeStunde[h]);
      if (n < MINDEST_STICHPROBE) return;
      if (besterWert === null || m > besterWert) {
        besterWert = m; besteStunde = Number(h); besteN = n;
      }
    });
    var stunde = wert(besteStunde, besteN, "content-memory.publishedAt+performance");

    /* 7. Wieviele Beitraege je 7 Tage erschienen sind. */
    var proWoche = wert(tage.length ? (alle.length / Math.max(1, tage.length)) * 7 : null,
      tage.length, "content-memory.publishedAt");

    /* 8. Wieviel ueberhaupt gemessen ist - die Grundlage von allem. */
    var messbasis = wert(gemessen.length, gemessen.length, "content-memory.performance");

    var werte = {
      postsProTag: proTag,
      anteilTageMitZwei: anteilMehrfach,
      leistungErsterDesTages: leistungErster,
      leistungZweiterDesTages: leistungZweiter,
      mittlererAbstandStunden: abstand,
      besteStundeUtc: stunde,
      postsProWoche: proWoche,
      gemesseneBeitraege: messbasis
    };

    return {
      werte: werte,
      beobachtungen: beobachtungen(werte),
      entscheidungen: entscheidungen(werte),
      mindestStichprobe: MINDEST_STICHPROBE,
      generatedAt: o.now || null
    };
  }

  /* -------------------------------------------------------------------
     DIE BEOBACHTUNG — UND NUR SIE (§36)

     Hier steht, was gesehen wurde, und daneben, was es NICHT heisst.
     Der zweite Satz ist der wichtigere: ohne ihn wird aus einer
     Beobachtung beim naechsten Lesen eine Ursache.
     ------------------------------------------------------------------- */
  function beobachtungen(w) {
    var aus = [];
    var e = w.leistungErsterDesTages;
    var z = w.leistungZweiterDesTages;

    if (!z.belastbar || !e.belastbar) {
      aus.push({
        id: "zweiter-beitrag",
        befund: BEFUND.INSUFFICIENT_SAMPLE,
        sampleSize: Math.min(e.sampleSize, z.sampleSize),
        satz: "Zu wenige Tage mit zwei Beitraegen, um ueberhaupt etwas zu " +
          "beobachten (" + z.sampleSize + " von " + MINDEST_STICHPROBE + ").",
        nichtGesagt: "Dass ein zweiter Beitrag schadet oder nicht schadet. " +
          "Beides waere hier erfunden."
      });
      return aus;
    }

    var unterschied = z.value - e.value;
    aus.push({
      id: "zweiter-beitrag",
      befund: Math.abs(unterschied) < 1
        ? BEFUND.NO_ASSOCIATION_OBSERVED : BEFUND.OBSERVED_ASSOCIATION,
      sampleSize: z.sampleSize,
      differenz: Math.round(unterschied * 10) / 10,
      satz: "An Tagen mit zwei Beitraegen lag der zweite im Mittel " +
        (unterschied < 0 ? Math.abs(Math.round(unterschied * 10) / 10) + " Punkte darunter"
                         : Math.round(unterschied * 10) / 10 + " Punkte darueber") +
        " (n=" + z.sampleSize + ").",
      /* -----------------------------------------------------------------
         DER SATZ, DER DIESE DATEI AUSMACHT

         Er steht als FELD und nicht als Kommentar, weil er mit der
         Beobachtung mitreisen muss. Wer die Zahl weitergibt und diesen
         Satz weglaesst, gibt etwas anderes weiter. */
      nichtGesagt: "Dass der zweite Beitrag die Ursache ist. Er erscheint " +
        "spaeter am Tag, sein Thema war das zweitbeste, und die Plattform " +
        "spielt nicht jeden Tag gleich aus. Beobachtet ist ein " +
        "Zusammenhang, gemessen keine Ursache."
    });
    return aus;
  }

  /* -------------------------------------------------------------------
     SECHS ENTSCHEIDUNGEN — JEDE MIT IHRER GRUNDLAGE

     `empfehlung: null` heisst NICHT "weiter wie bisher". Es heisst:
     diese Entscheidung traegt heute keine Messung, und die Konfiguration
     bleibt, wo der Owner sie hingestellt hat. Der Unterschied steht im
     Feld `grund`.
     ------------------------------------------------------------------- */
  function entscheidungen(w) {
    var aus = [];

    function e(id, empfehlung, grund, stuetze) {
      aus.push({ id: id, empfehlung: empfehlung, grund: grund,
        stuetze: stuetze || null });
    }

    var z = w.leistungZweiterDesTages;
    var er = w.leistungErsterDesTages;

    e(ENTSCHEIDUNG.DAILY_INTENT, null,
      "Die Tagesabsicht ist eine Owner-Entscheidung. Eine Messung kann sie " +
      "stuetzen, nicht ersetzen.", null);

    if (z.belastbar && er.belastbar) {
      var schlechter = (z.value - er.value) < -5;
      e(ENTSCHEIDUNG.SECOND_POST_TODAY, schlechter ? "ZURUECKHALTEND" : "UNVERAENDERT",
        schlechter
          ? "Der zweite Beitrag lag im Mittel deutlich unter dem ersten. Das " +
            "ist ein Zusammenhang, keine Ursache - und ein Grund, genauer " +
            "hinzusehen, kein Verbot."
          : "Kein auffaelliger Unterschied zwischen erstem und zweitem Beitrag.",
        { n: z.sampleSize });
    } else {
      e(ENTSCHEIDUNG.SECOND_POST_TODAY, null,
        "Zu wenige Tage mit zwei Beitraegen (" + z.sampleSize + " von " +
        MINDEST_STICHPROBE + ").", { n: z.sampleSize });
    }

    e(ENTSCHEIDUNG.MIN_SPACING_HOURS,
      w.mittlererAbstandStunden.belastbar
        ? Math.round(w.mittlererAbstandStunden.value) : null,
      w.mittlererAbstandStunden.belastbar
        ? "Der tatsaechliche mittlere Abstand der bisherigen Beitraege."
        : "Zu wenige Abstaende gemessen.",
      { n: w.mittlererAbstandStunden.sampleSize });

    e(ENTSCHEIDUNG.PREFERRED_HOUR,
      w.besteStundeUtc.belastbar ? w.besteStundeUtc.value : null,
      w.besteStundeUtc.belastbar
        ? "Die Stunde mit der besten gemessenen Leistung bei ausreichender Stichprobe."
        : "Keine Stunde erreicht die Mindeststichprobe.",
      { n: w.besteStundeUtc.sampleSize });

    e(ENTSCHEIDUNG.WEEKLY_CEILING, null,
      "Das Publishing-Dach ist eine Owner-Entscheidung. Was gemessen ist: " +
      (w.postsProWoche.belastbar
        ? Math.round(w.postsProWoche.value * 10) / 10 + " Beitraege je Woche bisher."
        : "zu wenige Tage fuer eine Wochenrate."),
      { n: w.postsProWoche.sampleSize });

    e(ENTSCHEIDUNG.EXPLORATION_SHARE, null,
      w.gemesseneBeitraege.belastbar
        ? "Die Erkundungsrate gehoert der Strategie-Engine; sie liest dieselben " +
          "Messungen."
        : "Unter " + MINDEST_STICHPROBE + " gemessenen Beitraegen erkundet das " +
          "System ohnehin - eine Empfehlung waere hier ohne Inhalt.",
      { n: w.gemesseneBeitraege.sampleSize });

    return aus;
  }

  var api = {
    MINDEST_STICHPROBE: MINDEST_STICHPROBE,
    BEFUND: BEFUND,
    ENTSCHEIDUNG: ENTSCHEIDUNG,
    wert: wert,
    zustand: zustand,
    beobachtungen: beobachtungen,
    entscheidungen: entscheidungen
  };

  if (isNode) module.exports = api;
  else global.VUSocialFrequencyLearning = api;
})(typeof window !== "undefined" ? window : globalThis);
