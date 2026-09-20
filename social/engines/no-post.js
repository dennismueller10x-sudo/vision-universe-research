/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/no-post.js

   EIN TAG OHNE BEITRAG BRAUCHT EINEN NACHWEIS, KEINE AUSREDE (§13–§16)

   -------------------------------------------------------------------------
   WOGEGEN DIESE DATEI GEBAUT IST
   -------------------------------------------------------------------------

   Ein System, das nichts veroeffentlicht, sieht von aussen genauso aus
   wie ein System, das nichts gefunden hat - und beide sehen aus wie
   eines, das kaputt ist. Der Unterschied ist nicht sichtbar, solange
   die Antwort "heute kein Beitrag" lautet und dabei bleibt.

   Deshalb gibt es hier drei Zustaende und nicht zwei:

     POST_PREPARED        Es ist etwas entstanden.
     NO_POST_JUSTIFIED    Es ist nichts entstanden, UND der Lauf kann
                          zeigen, was er gesucht und warum er nichts
                          genommen hat.
     NO_POST_UNEXPLAINED  Es ist nichts entstanden, und der Nachweis
                          fehlt oder traegt nicht.

   DER DRITTE ZUSTAND IST DER PUNKT. Ohne ihn waere "gerechtfertigt"
   eine Zusicherung, die sich selbst erfuellt: wer nur JUSTIFIED und
   PREPARED kennt, nennt jeden leeren Tag gerechtfertigt. Ein
   unerklaerter leerer Tag ist ein BEFUND und kein Betriebszustand.

   -------------------------------------------------------------------------
   WAS EIN VOLLSTAENDIGER NACHWEIS ENTHAELT (§15)
   -------------------------------------------------------------------------

   GESUCHT ODER NICHT GESUCHT. Zuerst die Frage, die alles andere
   sortiert: hat der Lauf ueberhaupt gesucht? Stand die Uhr im Weg
   (Warteschlange, Tagesobergrenze, Mindestabstand), dann NICHT - und
   das ist in Ordnung, solange es dasteht und der naechste Zeitpunkt
   benannt ist. Wurde gesucht, muss die Suche selbst nachweisbar sein.

   WIE WEIT DIE SUCHE KAM. Welche Content Families gefragt wurden,
   wieviele Themen geprueft, bis zu welcher Stufe die Leiter stieg -
   und welche Stufen NICHT gefragt wurden. Das Letzte ist das
   ehrlichste Feld des ganzen Nachweises.

   WORAN ES LAG. Die Ablehnungsgruende der Leiter und die Torstufen des
   Zyklus, jeweils gezaehlt. Nicht "nichts passte", sondern: vierzehn
   Themen geprueft, elf ohne hinreichende Evidenz, drei an der
   Faktenpruefung.

   EIN BENANNTER GRUND. Genau einer, aus der Vokabel der Kadenz-Engine.
   Ein erfundener Grund ist kein Grund, und ein Grund aus NIE_ALLEIN
   (kein Marktsignal, kein Quant-Signal, keine Nachricht) beendet den
   Tag nie allein - Vision Universe hat vierzehn weitere Familien.

   -------------------------------------------------------------------------
   WAS HIER NICHT PASSIERT
   -------------------------------------------------------------------------

   Diese Datei RECHNET NICHTS NACH. Sie bekommt die Kadenzentscheidung,
   den Suchnachweis der Leiter und die Ablehnungen des Zyklus - alles
   Dinge, die andere Stellen ohnehin erzeugen - und beurteilt, ob sie
   zusammen einen Nachweis ergeben. Eine zweite Rechnung waere eine
   zweite Wahrheit ueber denselben Tag.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Kadenz = isNode ? require("./content-cadence.js") : global.VUSocialContentCadence;

  var ZUSTAND = {
    POST_PREPARED:       "POST_PREPARED",
    NO_POST_JUSTIFIED:   "NO_POST_JUSTIFIED",
    NO_POST_UNEXPLAINED: "NO_POST_UNEXPLAINED"
  };

  /* Die Teile, die ein Nachweis tragen muss. Sie stehen als Liste und
     nicht als Kommentar, damit ein Test sie halten kann - und damit
     die Antwort benennen kann, WELCHER fehlt. */
  var TEILE = {
    ENTSCHEIDUNG_DER_UHR: "ENTSCHEIDUNG_DER_UHR",
    SUCHE:                "SUCHE",
    ABLEHNUNGEN:          "ABLEHNUNGEN",
    BENANNTER_GRUND:      "BENANNTER_GRUND"
  };

  function zahl(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }

  /* Die Ablehnungen des Zyklus nach Torstufe gezaehlt. Die Stufen
     kommen aus den Daten, nicht aus einer Liste hier: eine neue
     Torstufe soll im Nachweis auftauchen, ohne dass jemand sie hier
     nachtraegt. */
  function nachStufe(ablehnungen) {
    var z = {};
    (ablehnungen || []).forEach(function (a) {
      var s = (a && a.stage) || "OHNE_STUFE";
      z[s] = (z[s] || 0) + 1;
    });
    return z;
  }

  /**
   * Der Grund, den die Suche selbst nahelegt.
   *
   * NUR aus dem Suchnachweis abgelesen - hier wird nicht geraten. Wenn
   * die Leiter nichts gefunden hat, sagt ihre eigene Zaehlung, warum.
   */
  function grundAusSuche(leiter, ablehnungen) {
    var l = leiter || {};
    var gruende = l.rejectionReasons || {};
    var abgelehnt = (ablehnungen || []).length;

    /* Der Zyklus hat Themen gehabt und sie an seinen Toren verloren. */
    if (abgelehnt > 0) return Kadenz.GRUND.NO_OPPORTUNITY_PASSED_QUALITY;

    /* Die Leiter hat Themen gesehen, aber keines war belegt. */
    if (zahl(gruende.EVIDENCE_INSUFFICIENT) > 0) {
      return Kadenz.GRUND.INSUFFICIENT_EVIDENCE;
    }
    /* Alles, was sie sah, war schon behandelt. */
    if (zahl(gruende.ALREADY_COVERED) > 0) return Kadenz.GRUND.CONTENT_REPETITION;

    /* Keine Familie trug ueberhaupt ein Thema. */
    if (zahl(l.opportunitiesConsidered) === 0) {
      return Kadenz.GRUND.NO_TOPIC_IN_ANY_FAMILY;
    }
    return Kadenz.GRUND.NO_OPPORTUNITY_PASSED_QUALITY;
  }

  /**
   * Hat die Leiter wirklich JEDE Stufe gefragt?
   *
   * Nur dann darf "keine Familie trug ein Thema" einen Tag beenden.
   * Sonst hat die Suche frueh aufgehoert, und genau diese Verwechslung
   * - aufgehoert mit zu Ende - soll der Nachweis unmoeglich machen.
   */
  function vollstaendigGesucht(leiter) {
    var l = leiter || {};
    var nicht = Array.isArray(l.nichtGefragt) ? l.nichtGefragt : null;
    if (nicht === null) return false;
    return nicht.length === 0;
  }

  /**
   * Die Beurteilung eines Laufs.
   *
   * @param eingabe {
   *   now,
   *   erzeugt        Anzahl entstandener Content-Pakete
   *   kadenz         Ergebnis von ContentCadence.entscheide() oder null
   *   leiter         Ergebnis von ContentLadder.suche() oder null
   *   ablehnungen    [{ topic, stage, reason }] des Zyklus
   *   platte         { ok, grund, erklaerung, themen } oder null
   * }
   */
  function beurteile(eingabe) {
    var e = eingabe || {};
    var erzeugt = zahl(e.erzeugt);
    var k = e.kadenz || null;
    var l = e.leiter || null;
    var ablehnungen = Array.isArray(e.ablehnungen) ? e.ablehnungen : [];

    /* Die Uhr stand im Weg: dann entsteht JETZT nichts, und der Lauf
       hat gar nicht erst gesucht. Das ist kein Mangel - ein Nachweis,
       der so tut, als haette er gesucht, waere die bequemste
       Unwahrheit dieses Berichts. */
    var uhrBlockiert = !!(k && k.darfErzeugen === false);

    /* -----------------------------------------------------------------
       ZWEI FRAGEN, ZWEI ZEITPUNKTE - UND JEDES FELD BEANTWORTET NUR EINE

       Der erste Entwurf mischte sie: `gesucht` las die UHR VON JETZT,
       waehrend `erzeugt` aus dem BERICHT DES LETZTEN LAUFS kam. Im
       Betrieb stand dann "3 Beitraege vorbereitet" und direkt darunter
       "Gesucht: nein" - beides richtig, zusammen unverstaendlich.

       `gesucht` sagt jetzt nur, ob der BERICHTETE Lauf einen
       Suchnachweis hat. Was die Uhr JETZT zulaesst, steht unter `uhr`
       und nirgends sonst. */
    var nachweis = {
      gesucht: !!l,
      /* Die Uhr als Grund gilt nur, wenn auch WIRKLICH nichts entstand.
         Ein Bericht ohne Suchnachweis, in dem Pakete stehen, hat
         gesucht - ihm fehlt nur die Aufzeichnung davon, und das ist
         etwas anderes als "die Uhr liess nicht suchen". */
      warumNichtGesucht: (!l && uhrBlockiert && erzeugt === 0)
        ? (k.grund || "OHNE_GRUND") : null,
      /* Der Lauf, ueber den hier geurteilt wird. Ohne ihn liesse sich
         nicht sagen, ob der Nachweis von heute ist. */
      laufVom: e.laufVom || null,
      uhr: k ? {
        darfErzeugen: k.darfErzeugen === true,
        grund: k.grund || null,
        erklaerung: k.erklaerung || null,
        naechsteFruehestens: k.naechsteFruehestens || null,
        heuteErzeugt: k.lage ? k.lage.heuteErzeugt : null,
        tagesabsicht: k.lage ? k.lage.tagesabsicht : null
      } : null,
      platte: e.platte ? {
        nutzbar: e.platte.ok === true,
        grund: e.platte.grund || null,
        themen: zahl(e.platte.themen)
      } : null,
      suche: l ? {
        familienGefragt: l.familiesConsidered || [],
        familienGefragtAnzahl: zahl(l.familiesConsideredCount),
        themenGeprueft: zahl(l.opportunitiesConsidered),
        stufeErreicht: zahl(l.fallbackDepthReached),
        /* -----------------------------------------------------------------
           ZWEI FORMEN DESSELBEN FELDES

           `ContentLadder.suche()` gibt `gefunden` als LISTE zurueck;
           der Zyklusbericht schreibt sie als ZAHL, weil er die Platte
           nicht verdoppeln soll. Beides ist richtig - und der erste
           Entwurf las nur eine der beiden. Im Bericht stand dann
           "undefined belegt". */
        gefunden: Array.isArray(l.gefunden) ? l.gefunden.length : zahl(l.gefunden),
        ablehnungsgruende: l.rejectionReasons || {},
        /* Das ehrlichste Feld des Nachweises. */
        nichtGefragt: l.nichtGefragt || [],
        vollstaendig: vollstaendigGesucht(l)
      } : null,
      tore: {
        abgelehnt: ablehnungen.length,
        jeStufe: nachStufe(ablehnungen),
        /* Die ersten Beispiele im Klartext - damit der Bericht nicht
           nur zaehlt, sondern zeigt. */
        beispiele: ablehnungen.slice(0, 3).map(function (a) {
          return { thema: a.topic || null, stufe: a.stage || null,
                   grund: a.reason || null };
        })
      },
      erzeugt: erzeugt
    };

    /* -----------------------------------------------------------------
       ZUERST DIE UHR, DANN DIE GESCHICHTE

       Der erste Entwurf fragte `erzeugt` zuerst - und meldete
       POST_PREPARED, weil der LETZTE Lauf drei Pakete gebaut hatte,
       obwohl JETZT keiner entstehen darf. Beides stimmte, die Antwort
       war trotzdem falsch: gefragt ist, was jetzt passiert.

       Steht die Uhr im Weg, ist das die Antwort - und zwar eine
       gerechtfertigte: ein wartender Kandidat ist ein Grund, keiner
       zu bauen, und kein Mangel. Was der letzte Lauf gefunden hat,
       steht weiter im Nachweis; es entscheidet hier nur nichts mehr. */
    if (uhrBlockiert) {
      var uhrGrund = k.grund || null;
      var uhrPruefung = uhrGrund ? Kadenz.grundZulaessig(uhrGrund)
        : { zulaessig: false, erklaerung: "Kein Grund benannt." };
      if (!uhrGrund || !uhrPruefung.zulaessig) {
        return {
          zustand: ZUSTAND.NO_POST_UNEXPLAINED,
          grund: uhrGrund,
          vollstaendig: false,
          fehlendeTeile: [TEILE.BENANNTER_GRUND],
          nachweis: nachweis,
          erklaerung: "Die Frequenzregeln halten einen Beitrag zurueck, aber " +
            "ohne zulaessigen Grund: " + (uhrPruefung.erklaerung || "") +
            " Ein unerklaerter leerer Tag ist ein Befund, kein Betriebszustand."
        };
      }
      return {
        zustand: ZUSTAND.NO_POST_JUSTIFIED,
        grund: uhrGrund,
        vollstaendig: true,
        fehlendeTeile: [],
        nachweis: nachweis,
        erklaerung: satz(nachweis, uhrGrund)
      };
    }

    if (erzeugt > 0) {
      return {
        zustand: ZUSTAND.POST_PREPARED,
        grund: null,
        /* NICHT `true`: die Frage nach einem Nachweis stellt sich bei
           einem Lauf mit Ergebnis nicht. `true` hiesse "geprueft und
           vollstaendig", und geprueft wurde nichts. */
        vollstaendig: null,
        fehlendeTeile: [],
        nachweis: nachweis,
        erklaerung: erzeugt + (erzeugt === 1 ? " Beitrag" : " Beitr\u00e4ge") +
          " vorbereitet."
      };
    }

    /* ------------------------------------------------ Der eine Grund

       Ab hier ist sicher: die Uhr laesst einen Beitrag zu, und es ist
       trotzdem keiner entstanden. Jetzt muss die SUCHE den Tag
       erklaeren. */
    var grund = grundAusSuche(l, ablehnungen);
    var fehlend = [];

    if (!k) fehlend.push(TEILE.ENTSCHEIDUNG_DER_UHR);
    if (!l) fehlend.push(TEILE.SUCHE);
    if (!grund) fehlend.push(TEILE.BENANNTER_GRUND);

    /* -----------------------------------------------------------------
       EIN GRUND AUS NIE_ALLEIN BEENDET DEN TAG NICHT

       Diese Pruefung greift hier heute nie: `grundAusSuche()` gibt nur
       Gruende zurueck, die einen Tag beenden duerfen. Das ist kein
       Zufall, sondern die Zusicherung dieser Funktion - und ein Test
       haelt sie fest (NP17), statt sie zu behaupten.

       Sie steht trotzdem. Wer `grundAusSuche()` erweitert, soll nicht
       aus Versehen NO_MARKET_SIGNAL zu einer Tagesentscheidung machen
       koennen; im Uhrzweig, wo der Grund von aussen kommt, greift
       dieselbe Pruefung sehr wohl. */
    var pruefung = grund ? Kadenz.grundZulaessig(grund)
                         : { zulaessig: false, erklaerung: "Kein Grund benannt." };
    if (grund && !pruefung.zulaessig) fehlend.push(TEILE.BENANNTER_GRUND);

    /* "Keine Familie trug ein Thema" gilt nur, wenn wirklich jede
       gefragt wurde. */
    if (grund === Kadenz.GRUND.NO_TOPIC_IN_ANY_FAMILY &&
        !vollstaendigGesucht(l)) {
      fehlend.push(TEILE.SUCHE);
    }

    /* Wurde gesucht und nichts gefunden, ohne dass die Suche selbst
       einen Ablehnungsgrund nennt, ist der Nachweis leer. */
    if (nachweis.gesucht && nachweis.suche &&
        nachweis.suche.gefunden === 0 && ablehnungen.length === 0 &&
        Object.keys(nachweis.suche.ablehnungsgruende).length === 0) {
      fehlend.push(TEILE.ABLEHNUNGEN);
    }

    var einmalig = fehlend.filter(function (t, i) { return fehlend.indexOf(t) === i; });

    if (einmalig.length) {
      return {
        zustand: ZUSTAND.NO_POST_UNEXPLAINED,
        grund: grund || null,
        vollstaendig: false,
        fehlendeTeile: einmalig,
        nachweis: nachweis,
        erklaerung: "Heute ist kein Beitrag entstanden, und der Nachweis dafuer " +
          "ist unvollstaendig: " + einmalig.join(", ") + ". " +
          (pruefung.erklaerung || "") +
          " Ein unerklaerter leerer Tag ist ein Befund, kein Betriebszustand."
      };
    }

    return {
      zustand: ZUSTAND.NO_POST_JUSTIFIED,
      grund: grund,
      vollstaendig: true,
      fehlendeTeile: [],
      nachweis: nachweis,
      erklaerung: satz(nachweis, grund)
    };
  }

  /**
   * Der Satz, den der Owner liest.
   *
   * Keine Codes, keine Feldnamen, keine Stufennummern ohne Titel.
   */
  function satz(nachweis, grund) {
    var uhrSteht = !!(nachweis.uhr && nachweis.uhr.darfErzeugen === false);
    if (uhrSteht || !nachweis.gesucht) {
      var u = nachweis.uhr || {};
      return "Heute entsteht kein weiterer Beitrag: " +
        (u.erklaerung || "die Frequenzregeln lassen keinen zu.") +
        (u.naechsteFruehestens
          ? " Fruehestens wieder am " + u.naechsteFruehestens + "."
          : "");
    }
    var s = nachweis.suche || {};
    var teile = [];
    teile.push("Gesucht wurde in " + s.familienGefragtAnzahl + " Content " +
      (s.familienGefragtAnzahl === 1 ? "Family" : "Families") + ", geprueft " +
      "wurden " + s.themenGeprueft + " Thema/Themen.");

    if (s.vollstaendig) {
      teile.push("Jede Stufe der Leiter wurde gefragt.");
    } else if ((s.nichtGefragt || []).length) {
      teile.push("Nicht gefragt wurden " + s.nichtGefragt.length + " tiefere " +
        "Stufe(n), weil weiter oben genug gefunden wurde.");
    }

    if (nachweis.tore.abgelehnt > 0) {
      var stufen = Object.keys(nachweis.tore.jeStufe).map(function (st) {
        return nachweis.tore.jeStufe[st] + "x " + st;
      });
      teile.push("An den Qualitaetstoren gescheitert: " + stufen.join(", ") + ".");
    }
    teile.push(erklaerungZumGrund(grund));
    return teile.join(" ");
  }

  function erklaerungZumGrund(grund) {
    var G = Kadenz.GRUND;
    if (grund === G.INSUFFICIENT_EVIDENCE) {
      return "Kein Thema trug genug Belege fuer eine eigene Geschichte.";
    }
    if (grund === G.NO_TOPIC_IN_ANY_FAMILY) {
      return "Keine Quelle trug heute ein Thema.";
    }
    if (grund === G.CONTENT_REPETITION) {
      return "Was zu finden war, wurde zuletzt schon behandelt.";
    }
    if (grund === G.NO_OPPORTUNITY_PASSED_QUALITY) {
      return "Keine Gelegenheit hat alle Tore bestanden.";
    }
    return "Grund: " + grund + ".";
  }

  var api = {
    ZUSTAND: ZUSTAND,
    TEILE: TEILE,
    nachStufe: nachStufe,
    grundAusSuche: grundAusSuche,
    vollstaendigGesucht: vollstaendigGesucht,
    beurteile: beurteile
  };

  if (isNode) module.exports = api;
  else global.VUSocialNoPost = api;
})(typeof window !== "undefined" ? window : globalThis);
