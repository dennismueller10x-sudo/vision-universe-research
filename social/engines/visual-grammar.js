/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-grammar.js

   SECHS FAMILIEN, DAMIT DER FEED NICHT EIN LAYOUT IST (§16, §17, §19)

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI GIBT, OBWOHL ES SCHON BILDFORMEN GIBT
   -------------------------------------------------------------------------

   visual-intelligence.js kennt FORMEN: CHART, SCORE, COMPARISON,
   CAROUSEL und die uebrigen. Eine Form beantwortet die Frage "womit
   wird gezeichnet". Sie beantwortet nicht die Frage "wie sieht ein
   Beitrag von uns aus".

   Das ist der Unterschied, den §19 meint. Zwoelf Beitraege koennen
   zwoelf verschiedene FORMEN benutzen und trotzdem alle gleich
   aussehen: gleiche Flaechenaufteilung, gleiche Textmenge, Atlas
   immer an derselben Stelle, der Akzent immer als Zierde. Der Feed
   kollabiert nicht auf der Ebene der Diagrammtypen, sondern auf der
   Ebene der Anmutung.

   Eine Visual Family ist deshalb keine zweite Formliste. Sie ist die
   Ebene darueber: sie waehlt aus den vorhandenen FORMEN, weist Atlas
   eine Rolle zu, legt die Text-Rangfolge fest und benennt, woran
   genau dieser Beitragstyp scheitert. Die FORMEN bleiben, wo sie
   sind - diese Datei erfindet keine einzige neue.

   -------------------------------------------------------------------------
   FAILURE CONDITIONS SIND FUNKTIONEN, NICHT SAETZE
   -------------------------------------------------------------------------

   Der Auftrag verlangt fuer jede Familie Failure Conditions. Eine
   Failure Condition, die als Prosa in einem Kommentar steht, hat noch
   nie etwas verhindert - und diese Verwechslung ist uns in diesem
   Projekt schon passiert: eine Pruefung las ihren eigenen
   erklaerenden Kommentar als ausgefuehrten Code.

   Jedes `fehlerbild` hier hat deshalb ein `trifft(spec, familie)`,
   das mit ja oder nein antwortet. Was nicht entscheidbar ist, steht
   nicht in der Liste.

   -------------------------------------------------------------------------
   WAS DIESE ENGINE NICHT SIEHT
   -------------------------------------------------------------------------

   Sie rechnet an einer Beschreibung des Bildes, nicht an Pixeln:
   Flaechenanteile, Rangfolgen, erklaerte Akzente. Wo eine Angabe
   fehlt, faellt die Pruefung GESCHLOSSEN aus. Ein Bild, von dem
   niemand weiss, wie gross sein dominanter Text ist, hat die
   Mobilregel nicht bestanden - es hat sie ungeprueft gelassen, und
   ungeprueft ist hier nicht bestanden. Dieselbe Regel wie beim
   Logo-Kontrast und beim Byte-Abdruck: Unbekanntes wird nicht als
   Null und nicht als Ja verbucht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VI = isNode ? require("./visual-intelligence.js")
    : global.VUSocialVisualIntelligence;
  var VC = isNode ? require("./visual-composition.js")
    : global.VUSocialVisualComposition;

  /* Die Zeichenflaeche kommt aus der Komposition. Eine zweite Angabe
     derselben Geometrie waere eine zweite Source of Truth (§2). */
  var FLAECHE = VC.FLAECHE;

  /* -------------------------------------------------------------------
     §17 — ATLAS HAT ROLLEN, KEINE PLAETZE

     Atlas ist die Figur der Marke. Die Frage ist nie "wo steht er",
     sondern "was tut er in diesem Bild". Vier Antworten, und sie
     schliessen sich gegenseitig aus.

     `flaecheMin`/`flaecheMax` sind der Anteil der Bildflaeche. Die
     Baender ueberlappen absichtlich nicht: sonst waere die Rolle aus
     der Groesse nicht mehr ablesbar und jede Angabe waere richtig.

     `traegtAussage` ist der eigentliche Unterschied. Nur als HERO
     darf Atlas die Aussage des Bildes sein. In jeder anderen Rolle
     ist er anwesend, aber die Aussage steht woanders - und ein Atlas,
     der die Aussage traegt, ohne HERO zu sein, ist genau der
     Dekorationsfall, den §12 ausschliesst.
     ------------------------------------------------------------------- */
  var ATLAS_ROLLEN = {
    ATLAS_HERO: {
      id: "ATLAS_HERO",
      zweck: "Atlas ist der Gegenstand des Bildes. Die Szene handelt von ihm.",
      flaecheMin: 0.25, flaecheMax: 0.70,
      traegtAussage: true,
      /* Als HERO darf er vor den Daten stehen, weil es dann keine
         gibt, die er verdecken koennte. */
      vorDaten: true
    },
    ATLAS_GUIDE: {
      id: "ATLAS_GUIDE",
      zweck: "Atlas fuehrt durch eine Erklaerung: er zeigt, deutet, ordnet. " +
        "Der Inhalt bleibt die Aussage.",
      flaecheMin: 0.10, flaecheMax: 0.24,
      traegtAussage: false,
      vorDaten: false
    },
    ATLAS_OBSERVER: {
      id: "ATLAS_OBSERVER",
      zweck: "Atlas ist anwesend und sieht mit. Er kommentiert nicht und " +
        "verdeckt nichts.",
      flaecheMin: 0.04, flaecheMax: 0.09,
      traegtAussage: false,
      vorDaten: false
    },
    ATLAS_SIGNATURE: {
      id: "ATLAS_SIGNATURE",
      zweck: "Atlas als Absenderzeichen am Rand. Kleinste Anwesenheit, " +
        "reine Zugehoerigkeit.",
      flaecheMin: 0.005, flaecheMax: 0.03,
      traegtAussage: false,
      vorDaten: false
    }
  };

  /* -------------------------------------------------------------------
     TEXT AUF DEM BILD HAT RAENGE

     §13 macht Text-on-Visual zur Pflicht. Pflicht allein genuegt
     nicht: Text, der vorhanden, aber der vierte Rang ist, haelt
     niemanden an. Deshalb gibt es Rollen mit einer Rangfolge, und
     jede Familie sagt, welche sie fuehrt.
     ------------------------------------------------------------------- */
  var TEXT_ROLLEN = {
    HOOK: "Der Satz, der den Daumen anhaelt. Kurz, vollstaendig, ohne Ton lesbar.",
    BELEG: "Die Zahl oder der Befund, der die Hook einloest.",
    KONTEXT: "Woran gemessen wurde: Gegenstand, Zeitraum, Bezugsgroesse.",
    QUELLE: "Woher die Zahl stammt.",
    SIGNATUR: "Das Logo. Absender, nicht Aussage."
  };

  /* -------------------------------------------------------------------
     AKZENTE BEDEUTEN ETWAS ODER SIE SIND DEKOR

     Die Signalfarbe ist im VU-System knapp. Sie markiert Bedeutung:
     eine Richtung, ein Extrem, den genannten Gegenstand, eine
     Schwelle. Sobald sie etwas markiert, das keine dieser vier
     Bedeutungen hat, ist sie Zierde - und ein Bild voller Zierde ist
     das, was am Ende "nach KI" aussieht.
     ------------------------------------------------------------------- */
  var AKZENT_BEDEUTUNGEN = {
    RICHTUNG: "Aufwaerts oder abwaerts - die Bewegung selbst.",
    EXTREM: "Der groesste oder kleinste Wert der Reihe.",
    SUBJEKT: "Der Gegenstand, von dem der Beitrag handelt.",
    SCHWELLE: "Eine Grenze, gegen die gemessen wird."
  };

  /* Mehr als drei markierte Stellen heben nichts mehr hervor: wenn
     alles betont ist, ist nichts betont. Die Zahl ist nicht gegriffen,
     sondern die Obergrenze, ab der die Markierung ihren Zweck
     verliert. */
  var AKZENT_HOECHSTZAHL = 3;

  /* -------------------------------------------------------------------
     MOBILREGELN

     Der einzige Ausschnitt, den die meisten je sehen, ist ein
     Telefon in der Hand, im Vorbeiscrollen. Zwei Zahlen entscheiden
     dort ueber Lesbarkeit:

     `mindestHoeheAnteil` - wie hoch der fuehrende Text mindestens
     sein muss, gemessen an der Bildhoehe. 1350 Pixel Bildhoehe mal
     0.055 sind rund 74 Pixel Versalhoehe; das ist die Groesse, bei
     der ein Satz auf einem Telefondisplay im Feed noch gelesen und
     nicht nur gesehen wird.

     `sichererBereich` - der Rand, unter dem die Bedienelemente der
     Plattform liegen. Er kommt aus derselben Geometrie wie die
     Komposition.
     ------------------------------------------------------------------- */
  var MOBIL = {
    mindestHoeheAnteil: 0.055,
    sichererRand: FLAECHE.rand / FLAECHE.hoehe
  };

  function liste(v) { return Array.isArray(v) ? v.slice() : []; }
  function zahl(x) { return typeof x === "number" && isFinite(x) ? x : null; }

  function textElemente(spec) {
    return liste(spec && spec.textElemente).filter(function (t) {
      return t && typeof t === "object";
    });
  }

  function fuehrend(spec) {
    /* Der fuehrende Text ist der mit dem kleinsten Rang. Kein Rang
       heisst kein fuehrender Text - nicht "vermutlich der erste". */
    var mit = textElemente(spec).filter(function (t) { return zahl(t.rang) !== null; });
    if (!mit.length) return null;
    return mit.reduce(function (a, b) { return b.rang < a.rang ? b : a; });
  }

  /* -------------------------------------------------------------------
     FEHLERBILDER, DIE FUER JEDE FAMILIE GELTEN

     Sie stehen an einem Ort, damit sechs Familien nicht sechsmal
     dieselbe Frage verschieden beantworten - dieselbe Ueberlegung,
     aus der VORAUSSETZUNG in visual-intelligence.js entstanden ist.
     ------------------------------------------------------------------- */
  var ALLGEMEINE_FEHLERBILDER = [
    {
      id: "KEIN_TEXT_AUF_BILD",
      satz: "Das Bild traegt keinen Text. §13 macht Text-on-Visual zur " +
        "Pflicht - ein Bild ohne Satz laesst die Caption die Arbeit tun, " +
        "und die Caption wird im Vorbeiscrollen nicht gelesen.",
      trifft: function (spec) { return textElemente(spec).length === 0; }
    },
    {
      id: "KEINE_HOOK_AUF_BILD",
      satz: "Es steht Text auf dem Bild, aber keine Hook. Ein Titel ist " +
        "keine Hook: er benennt das Thema, statt einen Grund zum " +
        "Anhalten zu geben.",
      trifft: function (spec) {
        return textElemente(spec).length > 0 &&
          !textElemente(spec).some(function (t) { return t.rolle === "HOOK"; });
      }
    },
    {
      id: "TEXT_OHNE_RANG",
      satz: "Mindestens ein Textelement hat keinen Rang. Ohne Rangfolge " +
        "ist die Hierarchie eine Absicht und keine Eigenschaft des Bildes.",
      trifft: function (spec) {
        return textElemente(spec).some(function (t) { return zahl(t.rang) === null; });
      }
    },
    {
      id: "DOMINANTES_ELEMENT_IST_NICHT_TEXT",
      satz: "Das groesste Element des Bildes ist kein Text. Damit " +
        "entscheidet die Bildflaeche und nicht die Aussage darueber, " +
        "was zuerst gelesen wird.",
      trifft: function (spec) {
        return spec.dominantesElement !== undefined &&
          spec.dominantesElement !== null &&
          spec.dominantesElement !== "TEXT";
      }
    },
    {
      id: "FUEHRENDER_TEXT_UNGEMESSEN",
      satz: "Die Hoehe des fuehrenden Textes ist nicht angegeben. Ob er " +
        "auf einem Telefon lesbar ist, bleibt damit unbekannt - und " +
        "unbekannt ist hier nicht bestanden.",
      trifft: function (spec) {
        var f = fuehrend(spec);
        return !!f && zahl(f.hoeheAnteil) === null;
      }
    },
    {
      id: "FUEHRENDER_TEXT_ZU_KLEIN",
      satz: "Der fuehrende Text ist kleiner als " +
        Math.round(MOBIL.mindestHoeheAnteil * 1000) / 10 +
        "% der Bildhoehe. Auf einem Telefon im Feed ist er sichtbar, " +
        "aber nicht lesbar.",
      trifft: function (spec) {
        var f = fuehrend(spec);
        var h = f ? zahl(f.hoeheAnteil) : null;
        return h !== null && h < MOBIL.mindestHoeheAnteil;
      }
    },
    {
      id: "TEXT_AUSSERHALB_SICHERBEREICH",
      satz: "Mindestens ein Textelement liegt im Randbereich, den die " +
        "Plattform mit ihren eigenen Bedienelementen ueberdeckt.",
      trifft: function (spec) {
        return textElemente(spec).some(function (t) {
          return t.imSicherenBereich === false;
        });
      }
    },
    {
      id: "ATLAS_OHNE_ROLLE",
      satz: "Atlas ist im Bild, aber ohne benannte Rolle (§17). Ein Atlas " +
        "ohne Rolle ist ein Atlas als Dekoration.",
      trifft: function (spec) {
        return !!spec.atlas && !ATLAS_ROLLEN[spec.atlas.rolle];
      }
    },
    {
      id: "ATLAS_FLAECHE_UNGEMESSEN",
      satz: "Atlas hat eine Rolle, aber sein Flaechenanteil ist nicht " +
        "angegeben. Die Rolle ist damit eine Behauptung ohne Mass.",
      trifft: function (spec) {
        return !!spec.atlas && !!ATLAS_ROLLEN[spec.atlas.rolle] &&
          zahl(spec.atlas.flaechenAnteil) === null;
      }
    },
    {
      id: "ATLAS_FLAECHE_VERFEHLT_ROLLE",
      satz: "Der Flaechenanteil von Atlas passt nicht zu seiner erklaerten " +
        "Rolle. Eine Signatur, die ein Viertel des Bildes einnimmt, ist " +
        "keine Signatur.",
      trifft: function (spec) {
        var r = spec.atlas && ATLAS_ROLLEN[spec.atlas.rolle];
        var a = spec.atlas ? zahl(spec.atlas.flaechenAnteil) : null;
        if (!r || a === null) return false;
        return a < r.flaecheMin || a > r.flaecheMax;
      }
    },
    {
      id: "ATLAS_TRAEGT_AUSSAGE_OHNE_HERO",
      satz: "Atlas traegt die Aussage des Bildes, ist aber nicht HERO. " +
        "Dann steht die Marke an der Stelle, an der ein Befund stehen " +
        "muesste.",
      trifft: function (spec) {
        var r = spec.atlas && ATLAS_ROLLEN[spec.atlas.rolle];
        return !!r && spec.atlas.traegtAussage === true && !r.traegtAussage;
      }
    },
    {
      id: "ATLAS_VERDECKT_DATEN",
      satz: "Atlas steht vor der Datenflaeche, ohne HERO zu sein. Die " +
        "Figur verdeckt den Beleg, auf den sich der Beitrag beruft.",
      trifft: function (spec) {
        var r = spec.atlas && ATLAS_ROLLEN[spec.atlas.rolle];
        return !!r && spec.atlas.vorDaten === true && !r.vorDaten;
      }
    },
    {
      id: "AKZENT_OHNE_BEDEUTUNG",
      satz: "Mindestens ein Akzent markiert nichts Benanntes. Eine " +
        "Signalfarbe ohne Bedeutung ist Zierde, und Zierde ist das, was " +
        "einen Beitrag austauschbar macht.",
      trifft: function (spec) {
        return liste(spec.akzente).some(function (a) {
          return !AKZENT_BEDEUTUNGEN[a && a.bedeutung ? a.bedeutung : a];
        });
      }
    },
    {
      id: "ZU_VIELE_AKZENTE",
      satz: "Mehr als " + AKZENT_HOECHSTZAHL + " markierte Stellen. Wenn " +
        "alles betont ist, ist nichts betont.",
      trifft: function (spec) {
        return liste(spec.akzente).length > AKZENT_HOECHSTZAHL;
      }
    }
  ];

  /* -------------------------------------------------------------------
     §16 — DIE SECHS FAMILIEN

     Jede traegt: Zweck, geeignete Storytypen, erlaubte FORMEN aus
     visual-intelligence.js, Atlas-Rolle, Text-Hierarchie,
     Visual-Hierarchie, Akzentlogik, Mobilregeln und eigene
     Failure Conditions.
     ------------------------------------------------------------------- */
  function hatText(spec, rolle) {
    return textElemente(spec).some(function (t) { return t.rolle === rolle; });
  }

  var FAMILIEN = {
    CINEMATIC_STORY: {
      id: "CINEMATIC_STORY",
      zweck: "Eine Szene traegt eine Aussage ueber eine Entwicklung. Das " +
        "Bild ist kein Beleg, sondern ein Bild - der Beleg steht als Satz " +
        "darin.",
      storytypen: ["VISION", "ENTWICKLUNG", "EINORDNUNG"],
      formen: ["ATLAS", "GENERATIVE", "COMPANY_VISUAL"],
      atlasRollen: ["ATLAS_HERO", "ATLAS_OBSERVER"],
      atlasOptional: true,
      textHierarchie: ["HOOK", "KONTEXT", "SIGNATUR"],
      visualHierarchie: ["Die Szene", "Der fuehrende Satz", "Das Absenderzeichen"],
      akzente: ["SUBJEKT", "RICHTUNG"],
      mobil: "Der Satz liegt ueber der ruhigsten Flaeche der Szene, nicht " +
        "ueber ihrem Detail.",
      fehlerbilder: [
        {
          id: "SZENE_OHNE_AUSSAGE",
          satz: "Eine Szene ohne Hook ist ein Stimmungsbild. Genau das ist " +
            "der Beitrag, an den sich niemand erinnert.",
          trifft: function (spec) { return !hatText(spec, "HOOK"); }
        },
        {
          id: "SZENE_ALS_SYMBOLBILD",
          satz: "Die Szene ist als Symbol fuer ein Thema beschrieben und " +
            "nicht als dieser eine Vorgang. Ein Symbolbild fuer " +
            "\"Technologie\" ist austauschbar.",
          trifft: function (spec) {
            var m = String(spec.motiv || "");
            if (!m) return false;
            return VI.GENERISCHE_MOTIVE.some(function (g) {
              return m.toLowerCase().indexOf(String(g).toLowerCase()) !== -1;
            });
          }
        }
      ]
    },

    DATA_EDITORIAL: {
      id: "DATA_EDITORIAL",
      zweck: "Eine gemessene Reihe ist das Motiv. Die Form der Bewegung " +
        "traegt, der Satz benennt, was an ihr bemerkenswert ist.",
      storytypen: ["BEFUND", "ENTWICKLUNG", "ZERLEGUNG"],
      formen: ["CHART", "PERFORMANCE", "SCORE", "DATA_CARD"],
      /* Vor Daten hat Atlas nichts zu suchen: er wuerde den Beleg
         verdecken, auf den sich der Beitrag beruft. */
      atlasRollen: ["ATLAS_OBSERVER", "ATLAS_SIGNATURE"],
      atlasOptional: true,
      textHierarchie: ["HOOK", "BELEG", "KONTEXT", "QUELLE", "SIGNATUR"],
      visualHierarchie: ["Die Datenform", "Der fuehrende Satz", "Die Bezugsachse"],
      akzente: ["RICHTUNG", "EXTREM", "SCHWELLE"],
      mobil: "Die Datenform nimmt die Flaeche, nicht den Rand. " +
        "Achsenbeschriftung darf klein bleiben, die Form nicht.",
      fehlerbilder: [
        {
          id: "DATEN_OHNE_QUELLE",
          satz: "Eine gemessene Reihe ohne Quellenangabe. Eine Zahl ohne " +
            "Herkunft ist auf einem Bild eine Behauptung mit Achsen.",
          trifft: function (spec) { return !hatText(spec, "QUELLE"); }
        },
        {
          id: "DATEN_OHNE_BEZUG",
          satz: "Kein Kontextelement: es fehlt, woran gemessen wurde. " +
            "Ohne Gegenstand und Zeitraum ist die Kurve dekorativ.",
          trifft: function (spec) { return !hatText(spec, "KONTEXT"); }
        },
        {
          id: "BELEG_FEHLT",
          satz: "Die Hook steht da, der Beleg nicht. Eine Behauptung, die " +
            "das Bild selbst nicht einloest.",
          trifft: function (spec) { return !hatText(spec, "BELEG"); }
        }
      ]
    },

    RANKING: {
      id: "RANKING",
      zweck: "Eine geordnete Reihe. Die Position ist die Aussage, nicht " +
        "der Einzelwert.",
      storytypen: ["UEBERBLICK", "BEFUND"],
      formen: ["COMPARISON", "DATA_CARD"],
      atlasRollen: ["ATLAS_SIGNATURE"],
      atlasOptional: true,
      textHierarchie: ["HOOK", "KONTEXT", "BELEG", "QUELLE", "SIGNATUR"],
      visualHierarchie: ["Die Reihenfolge", "Das Kriterium", "Die Einzelwerte"],
      akzente: ["EXTREM", "SUBJEKT"],
      mobil: "Hoechstens so viele Zeilen, wie auf einem Telefon ohne " +
        "Zoom lesbar bleiben.",
      fehlerbilder: [
        {
          id: "RANGLISTE_OHNE_KRITERIUM",
          satz: "Eine Rangliste ohne benanntes Kriterium. \"Top 5\" ohne " +
            "wonach ist eine Reihenfolge, die sich als Messung gibt.",
          trifft: function (spec) { return !hatText(spec, "KONTEXT"); }
        },
        {
          id: "RANGLISTE_ZU_KURZ", gestalt: true,
          satz: "Weniger als drei Eintraege. Zwei Dinge sind ein Vergleich, " +
            "keine Rangliste - und der Leser merkt den Unterschied.",
          trifft: function (spec) {
            var n = zahl(spec.eintraege);
            return n !== null && n < 3;
          }
        }
      ]
    },

    COMPARISON: {
      id: "COMPARISON",
      zweck: "Zwei oder wenige Groessen an einer Achse. Der Abstand ist " +
        "die Aussage.",
      storytypen: ["VERGLEICH", "BEFUND"],
      formen: ["COMPARISON", "DATA_CARD", "NUMBER_VISUAL"],
      atlasRollen: ["ATLAS_SIGNATURE", "ATLAS_OBSERVER"],
      atlasOptional: true,
      textHierarchie: ["HOOK", "BELEG", "KONTEXT", "QUELLE", "SIGNATUR"],
      visualHierarchie: ["Der Abstand", "Die verglichenen Namen", "Die Achse"],
      akzente: ["EXTREM", "SUBJEKT"],
      mobil: "Der Abstand muss auf Daumengroesse erkennbar sein, bevor " +
        "eine Zahl gelesen wird.",
      fehlerbilder: [
        {
          id: "VERGLEICH_MIT_EINEM", gestalt: true,
          satz: "Ein Vergleich braucht mindestens zwei Groessen.",
          trifft: function (spec) {
            var n = zahl(spec.eintraege);
            return n !== null && n < VC.MINDEST.vergleichswerte;
          }
        },
        {
          id: "UNGLEICHE_ACHSEN",
          satz: "Die verglichenen Groessen stehen nicht auf derselben " +
            "Achse. Ungleiche Achsen machen aus einem Vergleich eine " +
            "Behauptung.",
          trifft: function (spec) { return spec.gleicheAchse === false; }
        }
      ]
    },

    EXPLAINER: {
      id: "EXPLAINER",
      zweck: "Ein Zusammenhang in Schritten. Jeder Schritt setzt den " +
        "vorherigen voraus.",
      storytypen: ["MECHANIK", "EINORDNUNG"],
      formen: ["CAROUSEL", "MINIMAL_TYPOGRAPHY", "MIXED"],
      /* Fuehren ist genau die Rolle, fuer die es ATLAS_GUIDE gibt. */
      atlasRollen: ["ATLAS_GUIDE", "ATLAS_SIGNATURE"],
      atlasOptional: true,
      textHierarchie: ["HOOK", "KONTEXT", "BELEG", "SIGNATUR"],
      visualHierarchie: ["Der Schrittaufbau", "Der fuehrende Satz", "Die Beispiele"],
      akzente: ["SCHWELLE", "SUBJEKT"],
      mobil: "Ein Schritt je Vollbild. Zwei Schritte nebeneinander sind " +
        "auf einem Telefon keiner.",
      fehlerbilder: [
        {
          id: "ERKLAERUNG_OHNE_SCHRITTE", gestalt: true,
          satz: "Weniger als zwei Schritte. Eine Erklaerung, die aus einem " +
            "Schritt besteht, ist eine Behauptung.",
          trifft: function (spec) {
            var n = zahl(spec.schritte);
            return n !== null && n < 2;
          }
        },
        {
          id: "SCHRITTE_OHNE_GEGENSTAND",
          satz: "Die Schritte haben keinen benannten Gegenstand. Eine " +
            "Mechanik ohne Beispiel bleibt ein Schaubild.",
          trifft: function (spec) { return !hatText(spec, "KONTEXT"); }
        }
      ]
    },

    MAGAZINE_REPORT: {
      id: "MAGAZINE_REPORT",
      zweck: "Redaktionelle Anmutung: eine Zeile, die etwas behauptet, ein " +
        "Bild, das sie stuetzt, ein Beleg, der sie haelt.",
      storytypen: ["EINORDNUNG", "UEBERBLICK", "BEFUND"],
      formen: ["COMPANY_VISUAL", "MIXED", "NUMBER_VISUAL", "MINIMAL_TYPOGRAPHY"],
      atlasRollen: ["ATLAS_OBSERVER", "ATLAS_SIGNATURE"],
      atlasOptional: true,
      textHierarchie: ["HOOK", "BELEG", "KONTEXT", "QUELLE", "SIGNATUR"],
      visualHierarchie: ["Die Zeile", "Das Bild", "Der Beleg"],
      akzente: ["SUBJEKT", "EXTREM"],
      mobil: "Die Zeile bricht auf hoechstens drei Zeilen. Was laenger " +
        "ist, wird im Feed ueberblaettert.",
      fehlerbilder: [
        {
          id: "ZEILE_OHNE_BEHAUPTUNG",
          satz: "Die fuehrende Zeile benennt nur das Thema. Eine " +
            "Ueberschrift, die nichts behauptet, gibt keinen Grund " +
            "anzuhalten.",
          trifft: function (spec) { return !hatText(spec, "HOOK"); }
        },
        {
          id: "REPORT_OHNE_BELEG",
          satz: "Redaktionelle Anmutung ohne Beleg. Das ist die Form des " +
            "Journalismus ohne seine Substanz.",
          trifft: function (spec) { return !hatText(spec, "BELEG"); }
        }
      ]
    }
  };

  var FAMILIEN_IDS = Object.keys(FAMILIEN);

  /* -------------------------------------------------------------------
     DIE PRUEFUNG
     ------------------------------------------------------------------- */
  function pruefe(familieId, spec) {
    spec = spec || {};
    var fam = FAMILIEN[familieId];
    if (!fam) {
      return {
        ok: false,
        familie: familieId || null,
        verstoesse: [{
          id: "UNBEKANNTE_FAMILIE",
          satz: "Keine Visual Family benannt oder der Name ist keiner der " +
            "sechs (§16): " + FAMILIEN_IDS.join(", ") + "."
        }],
        erklaerung: "Ohne Familie gibt es keine Regeln, gegen die geprueft " +
          "werden koennte."
      };
    }

    var verstoesse = [];

    function pruefeListe(eintraege) {
      eintraege.forEach(function (fb) {
        var trifft = false;
        try { trifft = !!fb.trifft(spec, fam); } catch (e) { trifft = true; }
        if (trifft) verstoesse.push({ id: fb.id, satz: fb.satz });
      });
    }

    pruefeListe(ALLGEMEINE_FEHLERBILDER);
    pruefeListe(fam.fehlerbilder);

    /* Die Form muss eine sein, die diese Familie fuehren kann - und sie
       muss es in visual-intelligence.js ueberhaupt geben. Sonst waere
       hier eine zweite Formliste entstanden. */
    if (spec.form) {
      if (!VI.FORMEN[spec.form]) {
        verstoesse.push({
          id: "UNBEKANNTE_FORM",
          satz: "Die Bildform '" + spec.form + "' gibt es in " +
            "visual-intelligence.js nicht. Familien waehlen aus den " +
            "vorhandenen Formen; sie erfinden keine."
        });
      } else if (fam.formen.indexOf(spec.form) === -1) {
        verstoesse.push({
          id: "FORM_PASST_NICHT_ZUR_FAMILIE",
          satz: "Die Familie " + fam.id + " fuehrt " + spec.form + " nicht. " +
            "Erlaubt: " + fam.formen.join(", ") + "."
        });
      }
    } else {
      verstoesse.push({
        id: "KEINE_FORM",
        satz: "Keine Bildform angegeben. Die Familie sagt, wie der Beitrag " +
          "aussieht; die Form sagt, womit gezeichnet wird - beides wird " +
          "gebraucht."
      });
    }

    /* Atlas-Rolle gegen die Familie. */
    if (spec.atlas && ATLAS_ROLLEN[spec.atlas.rolle] &&
        fam.atlasRollen.indexOf(spec.atlas.rolle) === -1) {
      verstoesse.push({
        id: "ATLAS_ROLLE_PASST_NICHT_ZUR_FAMILIE",
        satz: "In " + fam.id + " kann Atlas nicht " + spec.atlas.rolle +
          " sein. Erlaubt: " + fam.atlasRollen.join(", ") + "."
      });
    }
    if (!spec.atlas && fam.atlasOptional === false) {
      verstoesse.push({
        id: "ATLAS_FEHLT",
        satz: "Die Familie " + fam.id + " ist ohne Atlas nicht vollstaendig."
      });
    }

    /* Akzente gegen die Akzentlogik der Familie. */
    liste(spec.akzente).forEach(function (a) {
      var b = (a && a.bedeutung) ? a.bedeutung : a;
      if (AKZENT_BEDEUTUNGEN[b] && fam.akzente.indexOf(b) === -1) {
        verstoesse.push({
          id: "AKZENT_PASST_NICHT_ZUR_FAMILIE",
          satz: "Der Akzent '" + b + "' gehoert nicht zur Logik von " +
            fam.id + ". Erlaubt: " + fam.akzente.join(", ") + "."
        });
      }
    });

    /* Die Text-Rangfolge der Familie ist eine Reihenfolge, keine Menge.
       Zwei Elemente in der falschen Ordnung sind ein anderes Bild. */
    var geordnet = textElemente(spec)
      .filter(function (t) { return zahl(t.rang) !== null && fam.textHierarchie.indexOf(t.rolle) !== -1; })
      .sort(function (a, b) { return a.rang - b.rang; });
    for (var i = 1; i < geordnet.length; i++) {
      var vorherSoll = fam.textHierarchie.indexOf(geordnet[i - 1].rolle);
      var jetztSoll = fam.textHierarchie.indexOf(geordnet[i].rolle);
      if (jetztSoll < vorherSoll) {
        verstoesse.push({
          id: "TEXT_HIERARCHIE_VERLETZT",
          satz: geordnet[i].rolle + " steht ueber " + geordnet[i - 1].rolle +
            ". Die Rangfolge von " + fam.id + " ist: " +
            fam.textHierarchie.join(" > ") + "."
        });
        break;
      }
    }

    return {
      ok: verstoesse.length === 0,
      familie: fam.id,
      form: spec.form || null,
      atlasRolle: (spec.atlas && spec.atlas.rolle) || null,
      verstoesse: verstoesse,
      erklaerung: verstoesse.length === 0
        ? "Der Entwurf entspricht der Grammatik von " + fam.id + "."
        : verstoesse.map(function (v) { return v.satz; }).join(" ")
    };
  }

  /* -------------------------------------------------------------------
     WELCHE FAMILIE

     Abgeleitet aus dem, was ohnehin dasteht: die gewaehlte Bildform
     und die Gestalt der Evidenz. Nicht geraten und nicht zugelost.
     Mehrdeutigkeit wird gemeldet, nicht stillschweigend aufgeloest -
     sonst waere die Wahl eine Vorgabe mit Zufallsanstrich.
     ------------------------------------------------------------------- */
  function waehleFamilie(spec) {
    spec = spec || {};
    var form = spec.form || null;
    if (!form) {
      return { familie: null, grund: "Ohne Bildform laesst sich keine " +
        "Familie ableiten." };
    }
    var kandidaten = FAMILIEN_IDS.filter(function (id) {
      return FAMILIEN[id].formen.indexOf(form) !== -1;
    });
    if (!kandidaten.length) {
      return { familie: null, grund: "Zur Form " + form + " gehoert keine " +
        "der sechs Familien." };
    }
    if (kandidaten.length === 1) {
      return { familie: kandidaten[0], grund: "Einzige Familie, die " +
        form + " fuehrt." };
    }

    /* -----------------------------------------------------------------
       ERST AUSSCHLIESSEN, DANN WAEHLEN

       Der erste Anlauf hat gleich positiv gewaehlt - und meldete
       deshalb bei einer gewoehnlichen Datenkarte mit EINER Zahl
       Mehrdeutigkeit zwischen DATA_EDITORIAL, RANKING und COMPARISON.
       Dabei war die Evidenz eindeutig: eine Rangliste braucht drei
       Eintraege, ein Vergleich zwei. Mit einem Wert scheiden beide aus.

       Eine Familie, deren Mindestmenge die Evidenz schon unterbietet,
       ist keine Kandidatin. Das steht nicht als zweite Regel hier,
       sondern benutzt die Failure Conditions, die die Familien
       ohnehin fuehren.

       Ausgeschlossen wird NUR an `gestalt`-Bedingungen: an denen, die
       etwas ueber die GESTALT DER EVIDENZ sagen. Der zweite Anlauf
       filterte an allen - und dann fiel eine unfertige Datenkarte
       nicht als "DATA_EDITORIAL, und die Hook fehlt" aus, sondern als
       "zu dieser Form passt keine Familie". Das ist ein Befund ueber
       den Entwurf, verkleidet als Befund ueber die Grammatik, und er
       haette die eigentliche Ursache verdeckt.

       Die Trennung ist gerade der Sinn der Sache: ob eine Rangliste
       drei Eintraege hat, entscheidet, WELCHE Familie es ist. Ob die
       Hook auf dem Bild steht, entscheidet, ob der Entwurf FERTIG ist.
       ----------------------------------------------------------------- */
    var n = zahl(spec.eintraege);
    var schritte = zahl(spec.schritte);
    var verworfen = [];
    kandidaten = kandidaten.filter(function (id) {
      var fam = FAMILIEN[id];
      var raus = fam.fehlerbilder.some(function (fb) {
        if (!fb.gestalt) return false;
        try { return !!fb.trifft(spec, fam); } catch (e) { return false; }
      });
      if (raus) verworfen.push(id);
      return !raus;
    });

    if (!kandidaten.length) {
      return { familie: null, verworfen: verworfen,
        grund: "Zur Form " + form + " passt keine Familie: die Gestalt " +
          "der Evidenz schliesst jede aus (" + verworfen.join(", ") + ")." };
    }
    if (kandidaten.length === 1) {
      return { familie: kandidaten[0],
        grund: verworfen.length
          ? "Einzige Familie, zu der die Gestalt der Evidenz passt (" +
            verworfen.join(", ") + " scheiden aus)."
          : "Einzige Familie, die " + form + " fuehrt." };
    }

    /* Mehrere bleiben moeglich. Jetzt entscheidet die Gestalt der
       Evidenz - nicht die Reihenfolge der Liste. */
    if (kandidaten.indexOf("RANKING") !== -1 && n !== null && n >= 3) {
      return { familie: "RANKING", grund: n + " geordnete Eintraege." };
    }
    if (kandidaten.indexOf("COMPARISON") !== -1 && n !== null && n === 2) {
      return { familie: "COMPARISON", grund: "Zwei Groessen an einer Achse." };
    }
    if (kandidaten.indexOf("EXPLAINER") !== -1 && schritte !== null && schritte >= 2) {
      return { familie: "EXPLAINER", grund: schritte + " Schritte." };
    }
    if (kandidaten.indexOf("DATA_EDITORIAL") !== -1 && spec.gemesseneReihe) {
      return { familie: "DATA_EDITORIAL", grund: "Eine gemessene Reihe." };
    }
    return {
      familie: null,
      mehrdeutig: kandidaten,
      grund: "Die Form " + form + " passt zu mehreren Familien (" +
        kandidaten.join(", ") + ") und die Evidenz entscheidet nicht " +
        "zwischen ihnen."
    };
  }

  /* -------------------------------------------------------------------
     §19 — OB DER FEED AUF EIN LAYOUT KOLLABIERT

     Nicht eine Meinung ueber Abwechslung, sondern eine Rechnung ueber
     die letzten Beitraege. Sechs Dimensionen, in denen ein Feed
     eintoenig werden kann.

     Das Fenster hat eine Untergrenze. Ueber drei Beitraege laesst
     sich nichts ueber Abwechslung sagen - und ein zu kleines Fenster
     als "bestanden" zu verbuchen waere wieder der Fall, in dem
     Unbekanntes als Ja gezaehlt wird.
     ------------------------------------------------------------------- */
  var VARIATIONS_DIMENSIONEN = [
    { id: "familie", lies: function (p) { return p.familie || null; },
      hoechstAnteil: 0.50, mindestVerschieden: 3 },
    { id: "form", lies: function (p) { return p.form || null; },
      hoechstAnteil: 0.60, mindestVerschieden: 3 },
    { id: "atlasRolle", lies: function (p) {
        return p.atlasRolle || (p.atlas && p.atlas.rolle) || "OHNE_ATLAS"; },
      hoechstAnteil: 0.70, mindestVerschieden: 2 },
    { id: "dominantesElement", lies: function (p) {
        return p.dominantesTextRolle || null; },
      hoechstAnteil: 0.80, mindestVerschieden: 2 },
    { id: "akzent", lies: function (p) {
        var a = liste(p.akzente).map(function (x) {
          return (x && x.bedeutung) ? x.bedeutung : x; });
        return a.length ? a.slice().sort().join("+") : "OHNE_AKZENT"; },
      hoechstAnteil: 0.70, mindestVerschieden: 2 },
    { id: "farbwelt", lies: function (p) { return p.farbwelt || null; },
      hoechstAnteil: 0.70, mindestVerschieden: 2 }
  ];

  var FENSTER_MINDEST = 6;

  function feedVariation(beitraege) {
    var liste_ = Array.isArray(beitraege) ? beitraege.filter(Boolean) : [];
    if (liste_.length < FENSTER_MINDEST) {
      return {
        zustand: "UNGEPRUEFT",
        gemessen: liste_.length,
        dimensionen: [],
        erklaerung: "Nur " + liste_.length + " Beitraege im Fenster " +
          "(mindestens " + FENSTER_MINDEST + "). Ueber Abwechslung laesst " +
          "sich damit nichts sagen - das ist kein bestandener Befund."
      };
    }

    var befunde = VARIATIONS_DIMENSIONEN.map(function (d) {
      var werte = liste_.map(d.lies);
      var unbekannt = werte.filter(function (w) { return w === null || w === undefined; }).length;
      if (unbekannt === werte.length) {
        return { id: d.id, zustand: "UNGEPRUEFT", verschieden: 0,
          groesstAnteil: null,
          satz: "Zu " + d.id + " ist in keinem Beitrag etwas erfasst." };
      }
      var bekannt = werte.filter(function (w) { return w !== null && w !== undefined; });
      var zaehler = {};
      bekannt.forEach(function (w) { zaehler[w] = (zaehler[w] || 0) + 1; });
      var namen = Object.keys(zaehler);
      var groesst = namen.reduce(function (a, b) {
        return zaehler[b] > zaehler[a] ? b : a; });
      var anteil = zaehler[groesst] / bekannt.length;
      var eng = anteil > d.hoechstAnteil;
      var arm = namen.length < d.mindestVerschieden;
      return {
        id: d.id,
        zustand: (eng || arm) ? "KOLLABIERT" : "VIELFAELTIG",
        verschieden: namen.length,
        groesstAnteil: Math.round(anteil * 100) / 100,
        groesstWert: groesst,
        satz: eng
          ? Math.round(anteil * 100) + "% der Beitraege teilen '" + groesst +
            "' - ueber " + Math.round(d.hoechstAnteil * 100) + "% ist der " +
            "Feed in dieser Dimension ein Layout."
          : arm
            ? "Nur " + namen.length + " verschiedene Werte (mindestens " +
              d.mindestVerschieden + ")."
            : namen.length + " verschiedene Werte, groesster Anteil " +
              Math.round(anteil * 100) + "%."
      };
    });

    var kollabiert = befunde.filter(function (b) { return b.zustand === "KOLLABIERT"; });
    var ungeprueft = befunde.filter(function (b) { return b.zustand === "UNGEPRUEFT"; });

    return {
      zustand: kollabiert.length ? "KOLLABIERT"
        : ungeprueft.length === befunde.length ? "UNGEPRUEFT" : "VIELFAELTIG",
      gemessen: liste_.length,
      dimensionen: befunde,
      kollabiert: kollabiert.map(function (b) { return b.id; }),
      erklaerung: kollabiert.length
        ? "Der Feed kollabiert in " + kollabiert.length + " Dimension(en): " +
          kollabiert.map(function (b) { return b.id + " - " + b.satz; }).join(" ")
        : ungeprueft.length
          ? "Vielfaeltig, soweit erfasst; ungeprueft: " +
            ungeprueft.map(function (b) { return b.id; }).join(", ") + "."
          : "Ueber " + liste_.length + " Beitraege in allen " +
            befunde.length + " Dimensionen vielfaeltig."
    };
  }

  /* -------------------------------------------------------------------
     VOM GEZEICHNETEN BILD ZUR PRUEFBAREN BESCHREIBUNG

     Die Grammatik darf nicht an einer Beschreibung pruefen, die neben
     dem Bild entsteht. Genau das waere die Sorte Tor, die immer gruen
     ist: zwei Register fuer eine Tatsache, und nur eines wird
     fortgeschrieben.

     Deshalb liest diese Funktion den RENDER-PLAN - dieselbe Struktur,
     aus der das HTML entsteht. Die Schriftgroessen kommen aus
     `plan.textGroessen`, das der Renderer selbst fuellt. Fehlt es,
     entsteht KEINE Ersatzannahme: die Hoehe bleibt leer, und die
     Mobilregel faellt als ungemessen durch.

     Was der Plan nicht hat, behauptet diese Funktion nicht. Der
     gezeichnete Kartenpfad kennt heute keine Hook-Ebene - also
     entsteht hier auch keine, und die Grammatik sagt genau das.
     ------------------------------------------------------------------- */
  /* Welche Herkunft einen Satz zur Hook macht. Aus den Daten
     gerechnete Saetze und blosse Themennennungen sind es nicht. */
  var HOOK_HERKUNFT = ["visualBrief.textLayers", "pkg.hook"];

  var EBENEN_ROLLEN = [
    { feld: "aussage", rolle: "HOOK", rang: 1, rolleWennKeineHook: "BELEG" },
    { feld: "zahl", rolle: "BELEG", rang: 2 },
    { feld: "zahlText", rolle: "BELEG", rang: 3 },
    { feld: "entitaet", rolle: "KONTEXT", rang: 4 },
    { feld: "quelle", rolle: "QUELLE", rang: 5 }
  ];

  function ausRenderPlan(plan, zusatz) {
    plan = plan || {};
    zusatz = zusatz || {};
    var ebenen = plan.ebenen || {};
    var groessen = plan.textGroessen || null;
    var hoehe = zahl(plan.hoehe) || FLAECHE.hoehe;

    var elemente = [];
    EBENEN_ROLLEN.forEach(function (e) {
      var wert = ebenen[e.feld];
      if (wert === null || wert === undefined || String(wert).trim() === "") return;
      var px = groessen ? zahl(groessen[e.feld]) : null;
      var rolle = e.rolle;
      if (e.rolleWennKeineHook) {
        var herkunft = (plan.ebenenHerkunft || {})[e.feld] || null;
        if (HOOK_HERKUNFT.indexOf(herkunft) === -1) rolle = e.rolleWennKeineHook;
      }
      elemente.push({
        feld: e.feld,
        rolle: rolle,
        text: String(wert),
        rang: e.rang,
        /* Ohne Groessentabelle bleibt die Hoehe NULL. Sie zu schaetzen
           hiesse, Unbekanntes als Messung zu verbuchen. */
        hoeheAnteil: px === null ? null : px / hoehe,
        imSicherenBereich: true
      });
    });

    /* Das Wortzeichen zeichnet der Renderer immer. Es ist Absender,
       nicht Aussage - der letzte Rang, immer. */
    if (groessen && zahl(groessen.marke) !== null) {
      elemente.push({
        feld: "marke", rolle: "SIGNATUR", text: "VISION UNIVERSE",
        rang: 9, hoeheAnteil: groessen.marke / hoehe, imSicherenBereich: true
      });
    }

    /* Welches Element das groesste ist, wird GERECHNET und nicht
       angenommen. Bei NUMBER_VISUAL ist die Zahl groesser als der
       Satz - und dann ist der dominante Text ein BELEG und keine
       Hook. Das ist eine Tatsache ueber das Bild, keine Absicht. */
    var messbar = elemente.filter(function (e) { return e.hoeheAnteil !== null; });
    var groesstes = messbar.length
      ? messbar.reduce(function (a, b) { return b.hoeheAnteil > a.hoeheAnteil ? b : a; })
      : null;

    return {
      form: zusatz.form || plan.visualType || null,
      flaeche: { breite: zahl(plan.breite) || FLAECHE.breite, hoehe: hoehe },
      textElemente: elemente,
      /* Der Renderer zeichnet Text und Flaechen, kein freies Motiv. */
      dominantesElement: groesstes ? "TEXT" : null,
      dominantesTextRolle: groesstes ? groesstes.rolle : null,
      dominantesTextFeld: groesstes ? groesstes.feld : null,
      atlas: zusatz.atlas || null,
      akzente: liste(zusatz.akzente),
      farbwelt: zusatz.farbwelt || null,
      eintraege: zusatz.eintraege !== undefined ? zusatz.eintraege : null,
      schritte: zusatz.schritte !== undefined ? zusatz.schritte : null,
      gleicheAchse: zusatz.gleicheAchse,
      gemesseneReihe: zusatz.gemesseneReihe,
      motiv: zusatz.motiv || null
    };
  }

  var api = {
    FLAECHE: FLAECHE,
    MOBIL: MOBIL,
    FAMILIEN: FAMILIEN,
    FAMILIEN_IDS: FAMILIEN_IDS,
    ATLAS_ROLLEN: ATLAS_ROLLEN,
    TEXT_ROLLEN: TEXT_ROLLEN,
    AKZENT_BEDEUTUNGEN: AKZENT_BEDEUTUNGEN,
    AKZENT_HOECHSTZAHL: AKZENT_HOECHSTZAHL,
    ALLGEMEINE_FEHLERBILDER: ALLGEMEINE_FEHLERBILDER,
    VARIATIONS_DIMENSIONEN: VARIATIONS_DIMENSIONEN,
    FENSTER_MINDEST: FENSTER_MINDEST,
    EBENEN_ROLLEN: EBENEN_ROLLEN,
    HOOK_HERKUNFT: HOOK_HERKUNFT,
    ausRenderPlan: ausRenderPlan,
    pruefe: pruefe,
    waehleFamilie: waehleFamilie,
    feedVariation: feedVariation
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisualGrammar = api;
})(typeof window !== "undefined" ? window : globalThis);
