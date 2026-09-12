/* =========================================================================
   VISION UNIVERSE DISCOVER — klartext.js

   DIE ÜBERSETZUNGSSCHICHT

   Zwischen der Rechenmaschine und dem Bildschirm fehlte bisher eine Ebene.
   Die Engines liefern "relativeStrengthPercentile: 98", "momentumScore:
   89", "volumeRatio20over60: 2.4" - und genau das stand auch auf der
   Karte. Wer die Begriffe kennt, liest sie schnell. Wer sie nicht kennt,
   liest gar nichts: eine Zahl ohne Bedeutung ist keine Information,
   sondern eine Hürde.

   Dieses Modul übersetzt. Es nimmt einen fertig gerechneten Titel und gibt
   zurück, was ein erwachsener Mensch ohne Finanzstudium daraus lesen
   kann - EINE Aussage, EINE Zahl, EIN Zusatz.

   DREI REGELN, DIE HIER NICHT VERHANDELBAR SIND

   1. Nichts wird erfunden. Jeder Satz folgt aus einer ausgelieferten
      Kennzahl über eine feste Schwelle. Kein Sprachmodell, kein Zufall,
      keine Formulierung "weil es gut klingt". Derselbe Titel ergibt
      morgen denselben Satz, solange die Zahlen dieselben sind.

   2. Vereinfachen heißt nicht verfälschen. "Mehr Handel als sonst" ist
      etwas anderes als "alle kaufen gerade". Relative Stärke ist nicht
      Beliebtheit, Momentum ist keine Prognose, ein neues Hoch ist kein
      Kaufsignal. Wo die einfache Formulierung mehr behaupten würde als
      die Zahl hergibt, bleibt die vorsichtigere stehen.

   3. Einfach ist nicht kindlich. Der Leser ist erwachsen und intelligent;
      er kennt nur eventuell die Fachsprache nicht. Kein belehrender Ton,
      keine Ausrufezeichen, keine Emoji, keine Dringlichkeit.

   WAS HIER NICHT PASSIERT

   Die Fachwerte verschwinden nicht. Sie wandern nur eine Ebene tiefer:
   auf die Aktienseite und in die Analyse. Dieses Modul entscheidet, was
   ZUERST zu sehen ist - nicht, was es gibt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-klartext-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /* Prozent, wie man es im Deutschen schreibt und wie man es liest: große
     Bewegungen ohne Nachkommastelle - "+149 %" ist eine Aussage, "+149,3 %"
     eine Scheingenauigkeit. Kleine Bewegungen mit einer Stelle, weil dort
     der Unterschied zählt. */
  function prozent(v, immerVorzeichen) {
    if (!isNum(v)) return null;
    var z = v * 100;
    var stellen = Math.abs(z) >= 20 ? 0 : 1;
    var text = Math.abs(z).toFixed(stellen).replace(".", ",");
    var vz = z > 0 ? "+" : (z < 0 ? "−" : "");
    if (immerVorzeichen === false) vz = "";
    return vz + text + " %";
  }

  /* Anteil des Marktes, den dieser Titel hinter sich lässt. Das Perzentil
     ist die ehrlichste einfache Zahl, die wir haben: es sagt nichts über
     die Zukunft und nichts über das Unternehmen - nur, wie viele andere
     Titel sich schwächer entwickelt haben. */
  function staerkerAls(perzentil) {
    if (!isNum(perzentil)) return null;
    /* "Stärker als 100 % der Aktien" wäre Unsinn - ein Titel ist nicht
       stärker als er selbst. Die Spitze bekommt deshalb Worte statt einer
       Zahl. */
    if (perzentil >= 99.5) return "Stärker als fast alle Aktien";
    return "Stärker als " + Math.round(perzentil) + " % der Aktien";
  }

  function topProzent(perzentil) {
    if (!isNum(perzentil)) return null;
    var rest = Math.max(1, Math.round(100 - perzentil));
    return "Top " + rest + " %";
  }

  var MONATE = { return12M: "in 12 Monaten", return6M: "in 6 Monaten",
                 return3M: "in 3 Monaten", return1M: "im letzten Monat" };
  /* Dieselben Zeitraeume ausgeschrieben - in einem Satz steht "in zwoelf
     Monaten", in einer Kennzahl "in 12 Monaten". */
  var AUSGESCHRIEBEN = { return12M: "in zwölf Monaten", return6M: "in sechs Monaten",
                         return3M: "in drei Monaten", return1M: "im vergangenen Monat" };

  /**
   * Die eine verständliche Zahl.
   *
   * Gesucht wird die längste Zeitspanne, für die eine Rendite vorliegt -
   * "+149 % in 12 Monaten" trägt weiter als "+4 % im letzten Monat". Zwei
   * Ausnahmen: wo die Reihe ausdrücklich von einem kürzeren Zeitraum
   * handelt (Momentum, frischer Schub), gilt dieser.
   */
  function hauptzahl(stock, wunsch) {
    var m = stock.metrics || {};
    var folge = wunsch ? [wunsch, "return12M", "return6M", "return3M", "return1M"]
                       : ["return12M", "return6M", "return3M", "return1M"];
    for (var i = 0; i < folge.length; i++) {
      var key = folge[i];
      if (isNum(m[key])) {
        return { wert: prozent(m[key]), label: MONATE[key], roh: m[key], quelle: key,
                 ton: m[key] > 0 ? "up" : (m[key] < 0 ? "down" : null) };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------------
     Die Geschichten.

     Geprüft wird von oben nach unten; die erste zutreffende Regel schreibt
     die Überschrift. Die Reihenfolge ist eine Produktentscheidung: ein
     neues Jahreshoch ist für einen Menschen die greifbarste Beobachtung,
     eine Perzentilposition die abstrakteste.

     `wenn` liest ausschließlich ausgelieferte Felder. `satz` gibt genau
     einen Hauptsatz zurück - ohne Ausrufezeichen, ohne Wertung, ohne
     Handlungsempfehlung.
     -------------------------------------------------------------------- */
  var GESCHICHTEN = [
    {
      /* Eine Verdopplung ist die Beobachtung, die ein Mensch am ehesten
         nacherzaehlt - und sie steht vor dem Jahreshoch, weil auf einer
         Startseite sonst viermal derselbe Satz steht. Sie gilt nur, wenn
         die Karte auch die Zwoelfmonatszahl zeigt: sonst behauptete der
         Satz etwas ueber einen Zeitraum, der daneben gar nicht steht. */
      id: "verdoppelt",
      wenn: function (s, zahl) {
        return !!zahl && isNum(zahl.roh) && zahl.roh >= 1 && !!AUSGESCHRIEBEN[zahl.quelle];
      },
      satz: function (s, zahl) {
        return "Hat sich " + AUSGESCHRIEBEN[zahl.quelle] +
               (zahl.roh >= 2 ? " mehr als verdreifacht" : " mehr als verdoppelt");
      },
      zahl: "return12M", positiv: true
    },
    {
      id: "neuesHoch",
      wenn: function (s) { return s.signals && s.signals.new52WeekHigh === true; },
      satz: function () { return "Auf dem höchsten Stand des Jahres"; },
      zahl: "return12M"
    },
    {
      id: "starkesJahr",
      wenn: function (s) {
        return isNum(s.metrics.leadershipPercentile) && s.metrics.leadershipPercentile >= 97 &&
               isNum(s.metrics.return12M) && s.metrics.return12M > 0;
      },
      satz: function () { return "Eine der stärksten Aktien des Jahres"; },
      zahl: "return12M", positiv: true
    },
    {
      id: "marktfuehrer",
      wenn: function (s) { return s.signals && s.signals.marketLeader === true; },
      satz: function () { return "Gehört zu den Marktführern"; },
      zahl: "return12M", positiv: true
    },
    {
      id: "erholung",
      wenn: function (s) {
        var m = s.metrics;
        return isNum(m.maxDrawdown252d) && m.maxDrawdown252d <= -0.30 &&
               isNum(m.return3M) && m.return3M >= 0.15;
      },
      satz: function () { return "Nach schwachen Monaten wieder im Aufwind"; },
      zahl: "return3M", positiv: true
    },
    {
      id: "dynamik",
      wenn: function (s) { return s.signals && s.signals.momentumLeader === true; },
      satz: function (s) {
        return isNum(s.metrics.return6M) && s.metrics.return6M > 0
          ? "Seit Monaten im Aufwärtstrend" : "Starke Kursdynamik";
      },
      zahl: "return6M", positiv: true
    },
    {
      id: "vorMarkt",
      wenn: function (s) { return s.signals && s.signals.relativeStrengthLeader === true; },
      satz: function () { return "Läuft dem Markt davon"; },
      zahl: "return12M", positiv: true
    },
    {
      id: "schub",
      wenn: function (s) { return s.signals && s.signals.breakout === true; },
      satz: function () { return "Kommt gerade in Bewegung"; },
      zahl: "return1M", positiv: true
    },
    {
      id: "nahHoch",
      wenn: function (s) { return s.signals && s.signals.nearHigh === true; },
      satz: function () { return "Fast wieder am Jahreshoch"; },
      zahl: "return12M"
    },
    {
      id: "stabilerTrend",
      wenn: function (s) {
        return isNum(s.metrics.trendAlignment) && s.metrics.trendAlignment >= 1 &&
               isNum(s.metrics.return6M) && s.metrics.return6M > 0;
      },
      satz: function () { return "Seit Monaten durchgehend im Aufwärtstrend"; },
      zahl: "return6M", positiv: true
    },
    {
      id: "steht",
      wenn: function (s) { return s.discoveryEligible === false; },
      satz: function () { return "Zurzeit keine Kursbewegung"; },
      zahl: null
    },
    {
      id: "schwach",
      wenn: function (s) { return isNum(s.metrics.return12M) && s.metrics.return12M < -0.15; },
      satz: function () { return "Deutlich unter dem Stand vor einem Jahr"; },
      zahl: "return12M"
    },
    {
      /* Die Zahl auf der Karte kommt aus dem Zeitraum, über den die Reihe
         spricht - und der kann einem Zwölfmonatsbefund widersprechen.
         Dann wird nicht die Zahl geschönt, sondern der Satz präzisiert. */
      id: "zuletztSchwaecher",
      wenn: function (s, zahl) {
        return !!zahl && isNum(zahl.roh) && zahl.roh < 0 &&
               isNum(s.metrics.return12M) && s.metrics.return12M > 0;
      },
      satz: function (s, zahl) {
        return zahl.quelle === "return12M" ? "Über zwölf Monate im Plus"
                                           : "Zuletzt schwächer, über zwölf Monate im Plus";
      },
      zahl: null
    },
    {
      /* "Über zwölf Monate im Plus" ist für +42 % eine Untertreibung, und
         Untertreibung liest sich wie Desinteresse. */
      id: "deutlichImPlus",
      wenn: function (s, zahl) {
        return !!zahl && isNum(zahl.roh) && zahl.roh >= 0.25 && zahl.quelle === "return12M";
      },
      satz: function () { return "Seit einem Jahr deutlich im Plus"; },
      zahl: "return12M", positiv: true
    },
    {
      id: "etwasSchwaecher",
      wenn: function (s) {
        return isNum(s.metrics.return12M) && s.metrics.return12M <= 0 &&
               s.metrics.return12M >= -0.15;
      },
      satz: function () { return "Etwas unter dem Stand vor einem Jahr"; },
      zahl: "return12M"
    },
    {
      id: "gestiegen",
      wenn: function (s) { return isNum(s.metrics.return12M) && s.metrics.return12M > 0; },
      satz: function () { return "Über zwölf Monate im Plus"; },
      zahl: "return12M", positiv: true
    }
  ];

  /* Der Zusatz: eine kurze zweite Beobachtung, die NICHT wiederholt, was
     die Überschrift schon sagt. Deshalb trägt jede Regel, welche
     Geschichten sie ausschließt. */
  var ZUSAETZE = [
    {
      id: "amHoch",
      nichtBei: ["neuesHoch"],
      wenn: function (s) { return s.signals && s.signals.new52WeekHigh === true; },
      text: function () { return "Neues Jahreshoch"; }
    },
    {
      id: "knappDarunter",
      nichtBei: ["nahHoch"],
      wenn: function (s) {
        return s.signals && s.signals.nearHigh === true &&
               isNum(s.metrics.distanceTo52wHigh);
      },
      text: function (s) {
        /* Unter einem halben Prozent ist "nur 0,2 % darunter" keine
           Information mehr, sondern Rauschen - dort zählt die Lage, nicht
           die Nachkommastelle. */
        return Math.abs(s.metrics.distanceTo52wHigh) < 0.005
          ? "Direkt am Jahreshoch"
          : "Nur " + prozent(Math.abs(s.metrics.distanceTo52wHigh), false) +
            " unter dem Jahreshoch";
      }
    },
    {
      id: "vielHandel",
      nichtBei: ["schub"],
      wenn: function (s) { return s.signals && s.signals.breakout === true; },
      text: function () { return "Mehr Handel als sonst"; }
    },
    {
      id: "branche",
      nichtBei: [],
      wenn: function (s) { return !!(s.sectorRank && s.sectorRank.rank <= 3); },
      text: function (s) {
        return s.sectorRank.rank === 1 ? "Stärkste Aktie ihrer Branche"
                                       : "Nummer " + s.sectorRank.rank + " ihrer Branche";
      }
    },
    {
      id: "vorMarkt",
      nichtBei: ["vorMarkt"],
      wenn: function (s) {
        return isNum(s.metrics.relativeStrengthPercentile) &&
               s.metrics.relativeStrengthPercentile >= 90;
      },
      text: function (s) { return staerkerAls(s.metrics.relativeStrengthPercentile); }
    },
    {
      id: "starkImMarkt",
      nichtBei: ["starkesJahr", "marktfuehrer"],
      wenn: function (s) {
        return isNum(s.metrics.leadershipPercentile) && s.metrics.leadershipPercentile >= 90;
      },
      text: function (s) { return staerkerAls(s.metrics.leadershipPercentile); }
    },
    {
      /* Ein Rückschlag gehört auf die Karte - aber erst, wenn er einer
         ist. Bei -12 % traf die Regel auf fast jeden Titel zu und stand
         dann unter zwei Dritteln aller Karten; eine Beobachtung, die
         überall steht, ist keine mehr. */
      id: "rueckschlag",
      nichtBei: [],
      wenn: function (s) {
        return isNum(s.metrics.maxDrawdown252d) && s.metrics.maxDrawdown252d <= -0.25;
      },
      text: function (s) {
        return "Zwischendurch " + prozent(s.metrics.maxDrawdown252d) + " im Jahr";
      }
    },
    {
      /* Wie ruhig läuft der Kurs? Die Jahresvolatilität in Worten - eine
         Risikoangabe, die niemand nachschlagen muss. Die Schwellen sind
         die üblichen Größenordnungen für Einzelaktien. */
      id: "ruhe",
      nichtBei: [],
      wenn: function (s) {
        return isNum(s.metrics.volatility252d) &&
               (s.metrics.volatility252d <= 0.22 || s.metrics.volatility252d >= 0.60);
      },
      text: function (s) {
        return s.metrics.volatility252d <= 0.22
          ? "Verläuft vergleichsweise ruhig" : "Schwankt stark";
      }
    },
    {
      id: "dreiMonate",
      nichtBei: [],
      wenn: function (s) { return isNum(s.metrics.return3M); },
      text: function (s) { return prozent(s.metrics.return3M) + " in 3 Monaten"; }
    },
  ];

  /* Welche Zahl passt zu welcher Sammlung? Die Reihe gibt den Zeitraum
     vor, über den sie spricht - sonst stünde unter "Seit Monaten im
     Aufwind" eine Zwölfmonatszahl, und der Satz belegte sich selbst
     nicht. */
  /* Was die Reihe schon sagt, sagt die Karte nicht noch einmal.

     Der Weg dahin ging ueber einen Umweg. Zuerst stand auf jeder Karte
     die staerkste Beobachtung ueberhaupt - dann sagte in "Ruhige
     Aufwärtstrends" jede zweite Karte "Eine der stärksten Aktien des
     Jahres", und man musste raten, was die Reihe eigentlich meint. Der
     naechste Versuch liess die Reihe die Geschichte bestimmen - dann
     stand auf allen zwoelf Karten derselbe Satz, und die Reihe las sich
     wie ein Formular.

     Richtig ist das Dritte: die Ueberschrift nennt die Kategorie EINMAL,
     die Karte nennt das, was diesen einen Titel darin auszeichnet, und
     der Zusatz bestaetigt die Zugehoerigkeit. Genau so liest man eine
     gut gemachte Sammlung.

     Bleibt nach dem Streichen nichts uebrig, gilt wieder die volle
     Reihenfolge - lieber eine Wiederholung als eine Karte ohne Aussage. */
  var SAGT_DIE_REIHE_SCHON = {
    "new-52-week-highs": ["neuesHoch", "nahHoch"],
    "market-leaders": ["marktfuehrer"],
    "top-10": ["marktfuehrer"],
    "momentum-leaders": ["dynamik"],
    "relative-strength": ["vorMarkt"],
    "trend-quality": ["stabilerTrend"],
    "breakout-watch": ["schub"]
  };

  var ZAHL_JE_REIHE = {
    "momentum-leaders": "return6M",
    "breakout-watch": "return3M",
    "trend-quality": "return6M"
  };

  /**
   * Die Karte in Klartext.
   *
   * @param {object} stock  ein normalisierter Titel (Contract)
   * @param {object} [opt]  { rowId }
   * @returns {{story, storyId, zahl, zusatz, status, engineVersion}}
   */
  function karte(stock, opt) {
    opt = opt || {};
    if (!stock || !stock.metrics) {
      return { story: null, storyId: null, zahl: null, zusatz: null, status: null,
               engineVersion: ENGINE_VERSION };
    }

    /* Erst die Zahl, dann der Satz.

       Die Reihenfolge ist der Kern dieser Funktion. Die Reihe gibt den
       Zeitraum vor, über den sie spricht; welcher Satz dazu passt, kann
       man erst wissen, wenn die Zahl feststeht. Andersherum entstand der
       Fall, der diese Umstellung ausgelöst hat: "Über zwölf Monate im
       Plus" über einer Karte, auf der -19,6 % stand. Ein Satz, der seiner
       eigenen Zahl widerspricht, ist schlimmer als gar keiner. */
    var vorgabe = ZAHL_JE_REIHE[opt.rowId] || null;
    var zahl = hauptzahl(stock, vorgabe);

    var schonGesagt = SAGT_DIE_REIHE_SCHON[opt.rowId] || [];
    var treffer = null;

    var gesperrt = opt.ausser || [];
    function suche(ohne) {
      for (var i = 0; i < GESCHICHTEN.length; i++) {
        var g = GESCHICHTEN[i];
        if (ohne && schonGesagt.indexOf(g.id) !== -1) continue;
        if (ohne && gesperrt.indexOf(g.id) !== -1) continue;
        if (!g.wenn(stock, zahl)) continue;
        /* Eine Geschichte, die Stärke behauptet, darf nicht über einer
           negativen Zahl stehen. */
        if (g.positiv && zahl && isNum(zahl.roh) && zahl.roh < 0) continue;
        return g;
      }
      return null;
    }
    treffer = suche(true) || suche(false);

    /* Ohne Vorgabe der Reihe bestimmt die Geschichte den Zeitraum: unter
       "Seit Monaten im Aufwärtstrend" gehört die Sechsmonatszahl. */
    if (!vorgabe && treffer && treffer.zahl) zahl = hauptzahl(stock, treffer.zahl);
    if (treffer && treffer.zahl === null && !vorgabe) {
      zahl = treffer.id === "steht" ? null : zahl;
    }

    var zusatz = null;
    for (var j = 0; j < ZUSAETZE.length && !zusatz; j++) {
      var z = ZUSAETZE[j];
      if (treffer && z.nichtBei.indexOf(treffer.id) !== -1) continue;
      if (!z.wenn(stock)) continue;
      zusatz = z.text(stock);
    }

    return {
      story: treffer ? treffer.satz(stock, zahl) : null,
      storyId: treffer ? treffer.id : null,
      zahl: zahl,
      zusatz: zusatz,
      /* Die Einordnung ganz klein: nur dort, wo sie wirklich etwas
         hinzufügt, und nie als Ersatz für die Geschichte. */
      status: topProzent(stock.metrics.leadershipPercentile) &&
              isNum(stock.metrics.leadershipPercentile) &&
              stock.metrics.leadershipPercentile >= 95
        ? topProzent(stock.metrics.leadershipPercentile) : null,
      engineVersion: ENGINE_VERSION
    };
  }

  /**
   * Dieselbe Übersetzung für die Signal-Plakette.
   *
   * Die Plakette hieß bisher NEW HIGH, MARKET LEADER, RS 98, BREAKOUT.
   * Das sind Kürzel aus einem Screener. Hier stehen die Worte, die eine
   * Person ohne Vorkenntnisse liest - die Regel dahinter ist unverändert.
   */
  var PLAKETTEN = {
    new52WeekHigh:          { label: "Neues Jahreshoch" },
    nearHigh:               { label: "Fast am Jahreshoch" },
    marketLeader:           { label: "Marktführer" },
    momentumLeader:         { label: "Starke Dynamik" },
    relativeStrengthLeader: { label: "Stärker als der Markt" },
    breakout:               { label: "Mehr Handel als sonst" },
    trendIntact:            { label: "Stabiler Trend" },
    sectorLeader:           { label: "Stark in ihrer Branche" },
    notTrading:             { label: "Keine Bewegung" }
  };

  function plakette(id) { return PLAKETTEN[id] || null; }

  /**
   * Die Zeitachse der Aktienseite: dieselben Renditen, benannt wie im
   * Alltag. Ausgelassen wird, was nicht vorliegt - eine Spalte "1 Woche"
   * ohne Wochenrendite wäre eine Lücke, die aussieht wie ein Fehler.
   */
  function zeitachse(stock) {
    var m = (stock && stock.metrics) || {};
    return [
      { key: "return1M", label: "1 Monat", wert: prozent(m.return1M), roh: m.return1M },
      { key: "return3M", label: "3 Monate", wert: prozent(m.return3M), roh: m.return3M },
      { key: "return6M", label: "6 Monate", wert: prozent(m.return6M), roh: m.return6M },
      { key: "return12M", label: "12 Monate", wert: prozent(m.return12M), roh: m.return12M }
    ].filter(function (e) { return e.wert !== null; });
  }

  /**
   * Die Jahresspanne als Satz plus Position.
   * `position` ist 0 am Jahrestief und 1 am Jahreshoch.
   */
  function jahresspanne(stock) {
    var m = (stock && stock.metrics) || {};
    if (!isNum(m.distanceTo52wHigh) || !isNum(m.distanceTo52wLow)) return null;
    var hoch = Math.abs(m.distanceTo52wHigh), tief = m.distanceTo52wLow;
    var breite = hoch + tief;
    return {
      position: breite > 0 ? tief / breite : 1,
      zumHoch: prozent(m.distanceTo52wHigh),
      ueberTief: prozent(m.distanceTo52wLow),
      satz: m.distanceTo52wHigh >= -0.005
        ? "Der Kurs steht am höchsten Punkt der letzten zwölf Monate."
        : "Der Kurs liegt " + prozent(hoch, false) + " unter dem höchsten und " +
          prozent(tief, false) + " über dem tiefsten Stand der letzten zwölf Monate."
    };
  }

  /**
   * Die Begründung in einem Satz.
   *
   * Ebene 2 beantwortet "Warum sehe ich diese Aktie?" - und zwar bevor
   * irgendeine Kennzahl auftaucht. Der Satz setzt sich aus der Geschichte
   * und höchstens zwei belegten Beobachtungen zusammen; jede davon trägt
   * ihre Zahl mit. Mehr als ein Satz wird es nicht: die ausführliche
   * Beweisführung steht ein Kapitel tiefer.
   */
  function begruendung(stock, kartentext) {
    var t = kartentext || karte(stock, {});
    if (!t || !t.story) return null;
    var m = stock.metrics || {};
    var teile = [];

    if (t.zahl && isNum(t.zahl.roh)) {
      teile.push("der Kurs ist " + AUSGESCHRIEBEN[t.zahl.quelle] + " um " +
                 prozent(Math.abs(t.zahl.roh), false) +
                 (t.zahl.roh >= 0 ? " gestiegen" : " gefallen"));
    }
    /* Der Hinweis auf das Jahreshoch entfaellt, wenn die Ueberschrift ihn
       schon gibt - ein Satz, der sich selbst wiederholt, klingt wie ein
       Textbaustein. */
    if (stock.signals && stock.signals.new52WeekHigh && t.storyId !== "neuesHoch") {
      teile.push("und steht auf dem höchsten Stand der vergangenen zwölf Monate");
    } else if (t.storyId !== "neuesHoch" &&
               isNum(m.distanceTo52wHigh) && m.distanceTo52wHigh > -0.10) {
      teile.push("und fehlt nur " + prozent(Math.abs(m.distanceTo52wHigh), false) +
                 " zum Jahreshoch");
    } else if (isNum(m.leadershipPercentile) && m.leadershipPercentile >= 90) {
      teile.push("und entwickelt sich stärker als " +
                 Math.min(99, Math.round(m.leadershipPercentile)) + " % der Aktien im Universum");
    }

    /* Ohne erste Beobachtung gibt es auch keine zweite: ein Titel ohne
       Kursbewegung hat keinen Satz mit "und" verdient, sondern den
       kurzen. */
    if (!teile.length || teile[0].indexOf("der Kurs ist") !== 0) return t.story + ".";
    return t.story + ": " + teile.join(" ") + ".";
  }

  /**
   * Eine ganze Reihe übersetzen.
   *
   * Warum das nicht Karte für Karte geht: jede einzelne Karte trifft für
   * sich die richtige Wahl - und trotzdem stand am Ende zwölfmal "Hat
   * sich in zwölf Monaten mehr als verdoppelt" untereinander. Jeder Satz
   * wahr, die Reihe trotzdem unlesbar.
   *
   * Die Regel ist deshalb eine Regel der REIHE: derselbe Satz steht
   * höchstens zweimal darin; danach bekommt der nächste Titel die
   * nächstbeste Beobachtung, die für ihn zutrifft. Erfunden wird nach wie
   * vor nichts - es wird nur eine andere wahre Aussage gewählt.
   *
   * Die Funktion ist reine Rechnung über die übergebene Reihenfolge:
   * dieselbe Liste ergibt dieselben Sätze, und die Nachrechnung im
   * Prüfskript kommt deshalb auf dasselbe Ergebnis.
   */
  var MAX_JE_REIHE = 2;

  function reihe(liste, rowId) {
    var zaehler = Object.create(null);
    return (liste || []).map(function (stock) {
      var gesperrt = [];
      for (var id in zaehler) {
        if (zaehler[id] >= MAX_JE_REIHE) gesperrt.push(id);
      }
      var k = karte(stock, { rowId: rowId, ausser: gesperrt });
      if (k.storyId) zaehler[k.storyId] = (zaehler[k.storyId] || 0) + 1;
      return k;
    });
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, begruendung: begruendung, reihe: reihe,
    MAX_JE_REIHE: MAX_JE_REIHE,
    karte: karte, plakette: plakette, PLAKETTEN: PLAKETTEN,
    zeitachse: zeitachse, jahresspanne: jahresspanne,
    prozent: prozent, staerkerAls: staerkerAls, topProzent: topProzent,
    GESCHICHTEN: GESCHICHTEN, ZUSAETZE: ZUSAETZE
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Klartext = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
