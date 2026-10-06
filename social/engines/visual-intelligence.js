/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-intelligence.js

   EIN TECHNISCH EINWANDFREIES BILD KANN EIN SCHLECHTES BILD SEIN

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   Das XOM-Visual hat jede technische Pruefung bestanden: MIME, Masse,
   PNG-Kettenstruktur, Hash, Rueckleseprobe vom Datentraeger,
   Herkunftskette. Neun Pruefungen, alle gruen.

   Der Owner bewertet die Bildqualitaet trotzdem als nicht ausreichend.
   Das ist kein Widerspruch: die neun Pruefungen beantworten die Frage
   "ist die Datei heil angekommen?". Keine davon fragt "traegt dieses
   Bild die Geschichte?".

   Zwei verschiedene Fragen brauchen zwei verschiedene Tore. Sie
   zusammenzulegen hiesse, aus "die Bytes stimmen" ein Qualitaetsurteil
   zu machen.

   -------------------------------------------------------------------------
   CREATIVE DIRECTION VOR ERZEUGUNG
   -------------------------------------------------------------------------

   Generische KI-Bildsprache entsteht nicht, weil ein Modell schlecht
   waere, sondern weil niemand gesagt hat, was das Bild zeigen soll.
   Wer "Technologie" bestellt, bekommt Neonwuerfel.

   Deshalb steht die Creative Direction VOR der Erzeugung und macht die
   eine visuelle Idee explizit - samt dem, was ausdruecklich nicht
   entstehen soll.

   Ausdruecklich KEIN pauschales Verbot: wenn eine Glaskugel die
   Geschichte traegt, ist sie richtig. Die Story entscheidet, nicht
   eine Motivliste.

   -------------------------------------------------------------------------
   DIE RICHTUNG WIRD ABGELEITET, NICHT NACHGETRAGEN
   -------------------------------------------------------------------------

   Der erste reale Lauf meldete `ready: false`, fehlend `coreIdea` und
   `mobileFocalPoint`. Der naheliegende Reflex waere gewesen, zwei
   Vorgabesaetze zu hinterlegen - und damit genau den Zustand zu
   erzeugen, gegen den diese Datei gebaut ist: ein Feld, das gefuellt
   aussieht und nichts weiss.

   Die beiden Antworten stehen bereits im Graphen, nur verteilt:

     SOCIAL OPPORTUNITY   wovon die Rede ist - Thema, Familie, Entitaeten
     AUDIENCE FRAME       fuer wen, unter welchem Klarnamen, mit welcher
                          Kernfrage, und welche Begriffe oeffentlich
                          nichts zu suchen haben
     STORY DIRECTION      welche Spannung der Text aufmacht - These,
                          Hook, belegte Zahlen
     VISUAL STRATEGY      in welcher FORM ein Bild das ueberhaupt
                          tragen kann

   `deriveDirection` setzt sie zusammen: die FORM kommt aus der
   Strategie, der GEGENSTAND aus Gelegenheit und Rahmen, die SPANNUNG
   aus den gemessenen Belegen.

   Die Probe darauf, dass das eine Ableitung und keine Vorlage ist:
   fehlt einer Form, was sie braucht, entsteht KEINE Idee. Dann bleibt
   das Feld null und das Tor meldet es. Ein Satz, der auch ohne Daten
   entstehen koennte, waere ein Default - und Defaults waren das
   Problem, nicht die Loesung.

   -------------------------------------------------------------------------
   NOT_APPLICABLE IST EINE ANTWORT, LEERSTRING IST KEINE
   -------------------------------------------------------------------------

   Nicht jede Dimension gilt fuer jede Form. Eine Minimal-Typografie
   traegt genau ein Element; eine Rangfolge ueber mehrere Elemente gibt
   es dort nicht. Das ist etwas anderes als eine fehlende Rangfolge.

   Deshalb gibt es drei Zustaende und nicht zwei: ein Wert, das Wort
   NOT_APPLICABLE mit Begruendung - oder null. Eine fehlende Dimension
   als leeren String oder leere Liste zu fuehren hiesse, Fehlen und
   Nichtzutreffen in denselben Topf zu werfen.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DIE STUFEN — GETRENNT, WEIL SIE VERSCHIEDENES ENTSCHEIDEN
     ------------------------------------------------------------------- */
  var STAGES = ["VISUAL_STRATEGY", "CREATIVE_DIRECTION", "VISUAL_PROVIDER",
    "GENERATION", "TECHNICAL_INTEGRITY", "CREATIVE_QUALITY",
    "CANONICAL_SELECTION", "PERFORMANCE_ATTRIBUTION"];

  /* Motive, die erfahrungsgemaess ohne Story-Bezug bestellt werden.
     KEINE Verbotsliste: sie erhoeht nur die Begruendungslast. Wer eines
     davon will, muss sagen, warum es die Geschichte traegt. */
  var GENERISCHE_MOTIVE = [
    "neon", "glaskugel", "kristallkugel", "wuerfel", "würfel", "cyberpunk",
    "serverraum", "rechenzentrum", "matrix", "hologramm", "roboterhand",
    "leuchtende linien", "datenstrom", "futuristische stadt"
  ];

  /* -------------------------------------------------------------------
     DREI ZUSTAENDE, NICHT ZWEI
     ------------------------------------------------------------------- */
  var NOT_APPLICABLE = "NOT_APPLICABLE";

  /* Die Dimensionen aus dem Auftrag (§3). `story` und `visualStrategy`
     stehen bewusst mit drin: eine Richtung ohne Story ist eine
     Bestellung, und eine ohne Form ist ein Wunsch. */
  var DIMENSIONEN = ["story", "visualStrategy", "coreIdea", "mobileFocalPoint",
    "compositionIntent", "visualHierarchy", "brandIntent", "mustShow", "mustNotShow"];

  /* Diese vier beantworten Fragen, die fuer JEDE Bildform gelten. Es
     gibt keine Strategie, bei der "welche EINE Idee traegt die Story?"
     sinnlos waere - NOT_APPLICABLE ist hier deshalb keine zulaessige
     Antwort, sondern eine Ausrede. */
  var NIE_NICHT_ZUTREFFEND = ["story", "visualStrategy", "coreIdea", "mobileFocalPoint"];

  function zahlDe(x) {
    if (x === null || x === undefined || x === "" || !isFinite(Number(x))) return null;
    return String(Math.round(Number(x) * 100) / 100).replace(".", ",");
  }

  /* Namen enden oefter auf einen Punkt, als man denkt: "Apple Inc.",
     "HP Inc.". Ein Satzpunkt dahinter ergibt "Apple Inc..". Kein
     grosser Fehler - aber er steht in Text, den wir selbst erzeugen,
     und faellt in jedem zweiten Beitrag auf. */
  function entdoppel(text) {
    return typeof text === "string" ? text.replace(/\.\.(?!\.)(\s|$)/g, ".$1") : text;
  }

  function gefuellt(v) {
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" ? v.trim().length > 0 : false;
  }

  /* -------------------------------------------------------------------
     DIE SPANNUNG — AUS GEMESSENEN BELEGEN, NICHT AUS DEM GEFUEHL

     Eine Bildidee ohne Spannung ist eine Illustration. Die Spannung
     steht in den Belegen, wenn welche da sind: der groesste Abstand
     zwischen dem, was eine Dimension beitragen koennte, und dem, was
     sie beitraegt. Ist keiner messbar, gibt es keine - erfunden wird
     hier nichts.
     ------------------------------------------------------------------- */
  function spannung(k) {
    if (k.contributions && k.contributions.length >= 2) {
      var nachLuecke = k.contributions.slice().sort(function (a, b) {
        return (b.max - b.value) - (a.max - a.value);
      });
      var nachAnteil = k.contributions.slice().sort(function (a, b) {
        return (b.value / b.max) - (a.value / a.max);
      });
      var schwach = nachLuecke[0], stark = nachAnteil[0];
      if (schwach && stark && schwach.label !== stark.label) {
        return {
          kind: "CONTRIBUTION_GAP",
          text: stark.label + " traegt " + zahlDe(stark.value) + " von " +
            zahlDe(stark.max) + ", " + schwach.label + " nur " +
            zahlDe(schwach.value) + " von " + zahlDe(schwach.max),
          strong: stark.label, weak: schwach.label,
          from: "STORY_DIRECTION/evidence:contributions"
        };
      }
    }
    if (k.peers && k.peers.length >= 2) {
      var sortiert = k.peers.slice().sort(function (a, b) { return b.value - a.value; });
      var oben = sortiert[0], unten = sortiert[sortiert.length - 1];
      if (oben && unten && oben.label !== unten.label) {
        return {
          kind: "PEER_SPREAD",
          text: oben.label + " steht bei " + zahlDe(oben.value) + ", " +
            unten.label + " bei " + zahlDe(unten.value) + " - dasselbe Mass, " +
            "derselbe Stichtag",
          strong: oben.label, weak: unten.label,
          from: "SOCIAL_OPPORTUNITY/vergleichsgruppe"
        };
      }
    }
    if (k.returns && k.returns.length >= 2) {
      var kurz = k.returns[0], lang = k.returns[k.returns.length - 1];
      if (kurz && lang && kurz.label !== lang.label) {
        return {
          kind: "HORIZON_SPREAD",
          text: "ueber " + lang.label + " " + zahlDe(lang.value) + ", ueber " +
            kurz.label + " " + zahlDe(kurz.value) + " - derselbe Titel, zwei " +
            "Zeitraeume, zwei Bilder",
          strong: lang.label, weak: kurz.label,
          from: "STORY_DIRECTION/evidence:returns"
        };
      }
    }
    if (k.total !== null && k.totalMax !== null && k.total < k.totalMax) {
      return {
        kind: "SCORE_REMAINDER",
        text: zahlDe(k.total) + " von " + zahlDe(k.totalMax) + " - und damit " +
          zahlDe(k.totalMax - k.total) + " Punkte, die nicht da sind",
        strong: null, weak: null,
        from: "STORY_DIRECTION/evidence:score"
      };
    }
    return null;
  }

  /* -------------------------------------------------------------------
     WAS EINE FORM BRAUCHT

     Jede Bildform hat andere Voraussetzungen. Eine Kurve ohne Reihe
     ist keine Kurve; eine Zahl ohne Bezugsgroesse ist keine Aussage.
     `braucht` ist genau diese Liste - und wenn etwas davon fehlt,
     entsteht keine Idee. Das ist der Unterschied zwischen Ableitung
     und Vorlage.

     `gezeichnet` trennt die Formen, die unser eigener Renderer aus
     Daten zeichnet, von denen, bei denen ein Modell ein Motiv frei
     erfindet. Nur bei letzteren kann die Frage nach generischer
     KI-Bildsprache ueberhaupt auftreten.
     ------------------------------------------------------------------- */
  var FORMEN = {
    CHART: {
      braucht: ["subject", "coreQuestion", "points"], gezeichnet: true,
      idee: function (k) {
        return "Eine einzige Kurve: " + k.subject + " ueber " + k.points.length +
          " beobachtete Punkte" + (k.spannung ? ", und in ihr " + k.spannung.text : "") +
          ". Die Bewegung selbst ist das Motiv - kein Symbolbild fuer \"Kursentwicklung\".";
      },
      fokus: function (k) {
        return "Die Richtung des Verlaufs und der Name " + k.subject + ". Eine " +
          "Achsenbeschriftung darf auf dem Telefon klein bleiben, die Form der " +
          "Bewegung nicht.";
      },
      aufbau: function () {
        return "Die Kurve nimmt die Flaeche, nicht den Rand. Ein Bezugspunkt macht " +
          "die Bewegung lesbar; eine zweite Reihe waere eine zweite Aussage.";
      },
      rangfolge: function (k) {
        return ["Der Verlauf", "Der Name " + k.subject, "Der Bezugspunkt der Achse"];
      },
      zeigen: function () { return []; }
    },

    /* -----------------------------------------------------------------
       DREI FORMEN, DIE GEZEICHNET WURDEN, ABER KEINE RICHTUNG HATTEN

       SCORE, PERFORMANCE und COMPARISON haben in visual.js einen
       Datenbedarf, in visual-composition.js ein Layout und in
       render-asset.mjs einen Zeichenzweig - und hier stand nichts.
       Solange nur Einzelwerte liefen, gewann immer CHART, und die
       Luecke blieb unsichtbar. Der erste Lauf ueber eine Rangliste
       waehlte COMPARISON, und die Bildrichtung war leer.

       Die Voraussetzungen mussten nicht erfunden werden: `contributions`,
       `returns` und `peers` gibt es als Pruefung seit jeher.
       ----------------------------------------------------------------- */
    SCORE: {
      braucht: ["subject", "coreQuestion", "contributions"], gezeichnet: true,
      idee: function (k) {
        return "Woraus sich der Wert fuer " + k.subject + " ergibt: " +
          k.contributions.length + " Beitraege nebeneinander" +
          (k.spannung ? ", und darin " + k.spannung.text : "") +
          ". Die Zusammensetzung ist das Motiv, nicht die Summe.";
      },
      fokus: function (k) {
        return "Der groesste und der kleinste Beitrag, und der Name " + k.subject +
          ". Wer eine Sekunde hinsieht, muss sehen, was traegt und was bremst.";
      },
      aufbau: function () {
        return "Die Beitraege als Balken in einer Reihe, gleiche Breite, gleiche " +
          "Achse. Ungleiche Achsen machen aus einem Vergleich eine Behauptung.";
      },
      rangfolge: function (k) {
        return ["Die Beitraege im Verhaeltnis zueinander", "Der Name " + k.subject,
          "Die Achse, gegen die gemessen wird"];
      },
      zeigen: function () {
        return ["Die Bezugsgroesse jedes Beitrags - ein Balken ohne Skala " +
          "ist eine Form ohne Aussage"];
      }
    },

    PERFORMANCE: {
      braucht: ["subject", "coreQuestion", "returns"], gezeichnet: true,
      idee: function (k) {
        return "Dieselbe Frage ueber " + k.returns.length + " Zeitraeume fuer " +
          k.subject + (k.spannung ? ": " + k.spannung.text : "") +
          ". Nebeneinander, weil ein einzelner Zeitraum jede Geschichte erzaehlt.";
      },
      fokus: function (k) {
        return "Der Unterschied zwischen den Zeitraeumen und der Name " + k.subject +
          ". Die genauen Prozentwerte sind Nachlesen.";
      },
      aufbau: function () {
        return "Die Zeitraeume in ihrer natuerlichen Reihenfolge, kurz nach lang. " +
          "Eine andere Reihenfolge waere eine Auswahl, die sich als Messung gibt.";
      },
      rangfolge: function (k) {
        return ["Das Verhaeltnis der Zeitraeume zueinander", "Der Name " + k.subject,
          "Die einzelnen Werte"];
      },
      zeigen: function () {
        return ["Dass es Vergangenheit ist - ein Verlauf ist keine Prognose"];
      }
    },

    COMPARISON: {
      braucht: ["subject", "coreQuestion", "peers"], gezeichnet: true,
      /* Zwei Lesarten derselben Form: EIN Titel gegen seine Gruppe -
         oder eine Gruppe, die selbst der Gegenstand ist. Ohne die
         Unterscheidung stand woertlich "Bekannte Namen in Bewegung in
         seiner Gruppe" auf einer Rangliste. */
      idee: function (k) {
        if (k.mehrereTitel) {
          return k.subject + ": " + k.peers.length + " Titel auf einer Achse" +
            (k.spannung ? ", und darin " + k.spannung.text : "") +
            ". Die Spannweite ist das Motiv - nicht der einzelne Wert.";
        }
        return k.subject + " in seiner Gruppe: " + k.peers.length +
          " Werte auf einer Achse" + (k.spannung ? ", und darin " + k.spannung.text : "") +
          ". Die Gruppe ist der Massstab - ohne sie waere die Zahl nur gross oder klein.";
      },
      fokus: function (k) {
        if (k.mehrereTitel) {
          return "Die Spannweite der Reihe und ihr Titel " + k.subject + ". Wer eine " +
            "Sekunde hinsieht, muss sehen, wie weit die Werte auseinanderliegen, " +
            "nicht welchen jeder hat.";
        }
        return "Die Position von " + k.subject + " in der Reihe. Wer eine Sekunde " +
          "hinsieht, muss sehen, wo dieser Wert steht, nicht welchen er hat.";
      },
      aufbau: function () {
        return "Alle Werte auf EINER Achse, gleiche Einheit, gleiche Richtung. Zwei " +
          "Einheiten in einem Vergleich sind kein Vergleich.";
      },
      rangfolge: function (k) {
        if (k.mehrereTitel) {
          return ["Die Spannweite der Reihe", "Der Titel " + k.subject,
            "Die einzelnen Werte"];
        }
        return ["Die Position von " + k.subject + " in der Gruppe",
          "Die Spannweite der Gruppe", "Die einzelnen Werte"];
      },
      zeigen: function () {
        return ["Wer die Gruppe ist und wonach sie ausgewaehlt wurde - eine " +
          "Vergleichsgruppe ohne Regel ist eine Auswahl"];
      }
    },

    NUMBER_VISUAL: {
      braucht: ["subject", "coreQuestion", "total"], gezeichnet: true,
      idee: function (k) {
        return "EINE Zahl: " + zahlDe(k.total) + " von " + zahlDe(k.totalMax) +
          " fuer " + k.subject + (k.spannung && k.spannung.kind === "CONTRIBUTION_GAP"
            ? ", und daneben, woraus sie sich ergibt - " + k.spannung.text : "") +
          ". Die Zahl ist das Bild, nicht die Dekoration um sie herum.";
      },
      fokus: function (k) {
        return zahlDe(k.total) + " und " + k.subject + ". Wer nur eine Sekunde " +
          "hinsieht, muss die Zahl und das Unternehmen haben; die Bezugsgroesse " +
          "ist Nachlesen.";
      },
      aufbau: function () {
        return "Die Zahl steht gross und allein in der oberen Haelfte, die " +
          "Bezugsgroesse unmittelbar darunter und kleiner. Zwei gleich grosse " +
          "Zahlen auf einer Flaeche zwingen zum Raten, welche gilt.";
      },
      rangfolge: function (k) {
        return ["Die Zahl " + zahlDe(k.total), "Die Bezugsgroesse von " +
          zahlDe(k.totalMax), "Der Name " + k.subject];
      },
      zeigen: function (k) {
        return ["Die Bezugsgroesse " + zahlDe(k.totalMax) + " - eine Zahl ohne " +
          "Bezug ist keine Aussage"];
      }
    },

    DATA_CARD: {
      braucht: ["subject", "coreQuestion", "claimNumbers"], gezeichnet: true,
      idee: function (k) {
        return "Eine Karte fuer " + k.subject + ", die genau " + k.claimNumbers.length +
          (k.claimNumbers.length === 1 ? " belegte Zahl" : " belegte Zahlen") +
          " traegt" + (k.spannung ? " und deren Spannung sichtbar macht: " +
            k.spannung.text : "") + ". Was nicht belegt ist, steht nicht auf der Karte.";
      },
      fokus: function (k) {
        return k.claimNumbers[0] + " und der Name " + k.subject + ". Eine Karte, " +
          "die auf dem Telefon erst nach dem Zoomen etwas sagt, hat nichts gesagt.";
      },
      aufbau: function () {
        return "Eine Aussage oben, ihre Belege darunter in gleicher Gewichtung. " +
          "Kein zweiter Blickfang neben dem ersten.";
      },
      rangfolge: function (k) {
        return ["Die Leitzahl " + k.claimNumbers[0], "Der Name " + k.subject,
          "Die uebrigen Belege"];
      },
      zeigen: function () { return []; }
    },

    MINIMAL_TYPOGRAPHY: {
      braucht: ["subject", "coreQuestion", "statement"], gezeichnet: true,
      idee: function (k) {
        return "Der Satz IST das Bild: \"" + k.oneSecondMessage + "\" fuer " +
          k.subject + ". Keine Illustration daneben, die dasselbe noch einmal sagt.";
      },
      fokus: function (k) {
        return "Der Satz selbst, vollstaendig lesbar ohne Zoom. " + k.subject +
          " muss darin vorkommen, sonst weiss der Leser nicht, wovon die Rede ist.";
      },
      aufbau: function () {
        return "Ein Textblock, ruhige Flaeche, keine konkurrierende Grafik. Der " +
          "Zeilenumbruch folgt dem Sinn, nicht der Kante.";
      },
      /* Genau ein Element. Eine Rangfolge ueber mehrere Elemente gibt
         es hier nicht - sie zu behaupten waere eine leere Dimension. */
      rangfolge: function () {
        return { na: "Die Form traegt genau ein Element - den Satz. Eine Rangfolge " +
          "ueber mehrere Bildelemente existiert nicht und waere hier erfunden." };
      },
      zeigen: function () { return []; }
    },

    CAROUSEL: {
      braucht: ["subject", "coreQuestion", "claimNumbersTwo"], gezeichnet: true,
      idee: function (k) {
        return "Eine Folge fuer " + k.subject + ": " + k.claimNumbers.length +
          " Belege, einer je Karte, in der Reihenfolge, in der die Story sie " +
          "braucht" + (k.spannung ? " - die Aufloesung ist " + k.spannung.text : "") +
          ". Die erste Karte muss allein stehen koennen.";
      },
      fokus: function (k) {
        return "Die erste Karte: " + k.claimNumbers[0] + " und " + k.subject + ". " +
          "Wer nicht wischt, sieht nur sie - sie darf keine Fortsetzung voraussetzen.";
      },
      aufbau: function () {
        return "Gleiche Flaechenaufteilung ueber alle Karten, damit das Wischen " +
          "nicht springt. Eine Aussage je Karte.";
      },
      rangfolge: function (k) {
        return ["Die erste Karte", "Die Leitzahl je Karte", "Der Name " + k.subject];
      },
      zeigen: function () {
        return ["Auf der ersten Karte ein vollstaendiger Gedanke - kein Teaser, " +
          "der ohne die zweite Karte nichts sagt"];
      }
    },

    MIXED: {
      braucht: ["subject", "coreQuestion", "statement", "drawable"], gezeichnet: true,
      idee: function (k) {
        return "Grafik und Satz auf einer Flaeche fuer " + k.subject + ": die " +
          "Grafik zeigt " + (k.points ? "den Verlauf" : "die Groessenverhaeltnisse") +
          ", der Satz sagt, was daran zaehlt - \"" + k.oneSecondMessage + "\". " +
          "Zwei Ebenen, eine Aussage.";
      },
      fokus: function (k) {
        return "Die Grafik zuerst, der Satz unmittelbar danach. " + k.subject +
          " muss in beidem wiederzufinden sein.";
      },
      aufbau: function () {
        return "Die Grafik traegt die obere Flaeche, der Satz die untere. Wenn " +
          "beide dasselbe sagen, ist eines davon ueberfluessig.";
      },
      rangfolge: function (k) {
        return ["Die Grafik", "Der Satz", "Der Name " + k.subject];
      },
      zeigen: function () { return []; }
    },

    COMPANY_VISUAL: {
      braucht: ["subject", "coreQuestion", "claimNumbers"], gezeichnet: true,
      idee: function (k) {
        return "Das Unternehmen " + k.subject + " als Gegenstand, nicht als Logo: " +
          k.claimNumbers[0] + " ist das, was an ihm gerade zaehlt" +
          (k.spannung ? ", und " + k.spannung.text + " sagt, warum" : "") + ".";
      },
      fokus: function (k) {
        return "Der Name " + k.subject + " und " + k.claimNumbers[0] + ". Ein " +
          "Firmenbild, das auf dem Telefon nur als Farbflaeche ankommt, nennt " +
          "das Unternehmen nicht.";
      },
      aufbau: function () {
        return "Das Unternehmen benannt, die Zahl daneben. Kein Markenauftritt " +
          "des Unternehmens - wir berichten ueber es, wir bewerben es nicht.";
      },
      rangfolge: function (k) {
        return ["Der Name " + k.subject, "Die Leitzahl " + k.claimNumbers[0],
          "Die Einordnung"];
      },
      zeigen: function () { return []; }
    },

    ATLAS: {
      braucht: ["subject", "coreQuestion", "statement"], gezeichnet: false, atlas: true,
      idee: function (k) {
        return "Atlas traegt die Aussage \"" + k.oneSecondMessage + "\" zu " +
          k.subject + " - als Ableitung aus dem freigegebenen Original, nicht " +
          "als neu erfundene Figur.";
      },
      fokus: function (k) {
        return "Atlas erkennbar als Atlas, und die Aussage zu " + k.subject + " " +
          "lesbar daneben. Eine Figur, die auf dem Telefon jede andere sein " +
          "koennte, traegt keine Wiedererkennung.";
      },
      aufbau: function () {
        return "Die Figur an einer Kante, die Aussage in der freien Flaeche. " +
          "Der Ausschnitt darf sich aendern, die Figur nicht.";
      },
      rangfolge: function (k) {
        return ["Atlas", "Die Aussage", "Der Name " + k.subject];
      },
      zeigen: function () {
        return ["Das freigegebene Atlas-Original als Ausgangsmaterial - " +
          "nachweisbar, nicht nachempfunden"];
      }
    },

    GENERATIVE: {
      /* Die einzige Form, bei der ein Modell das Motiv frei erfindet.
         Genau deshalb braucht sie eine Spannung: ohne sie waere der
         Auftrag "mach ein Bild zu X", und dabei entstehen Neonwuerfel. */
      braucht: ["subject", "coreQuestion", "spannung"], gezeichnet: false,
      idee: function (k) {
        return "EIN Bild fuer das Ungleichgewicht bei " + k.subject + ": " +
          k.spannung.text + ". Gezeigt wird dieses Verhaeltnis - nicht die " +
          "Branche von " + k.subject + ", nicht ein Sinnbild fuer \"Analyse\".";
      },
      fokus: function (k) {
        return "Das Verhaeltnis der beiden Seiten zueinander und der Name " +
          k.subject + ". Wenn auf dem Telefon nur eine huebsche Flaeche ankommt, " +
          "ist die Idee nicht angekommen.";
      },
      aufbau: function (k) {
        return "Zwei ungleiche Gewichte in einer Flaeche, das Verhaeltnis " +
          "sichtbar" + (k.spannung.strong ? " - " + k.spannung.strong + " gegen " +
            k.spannung.weak : "") + ". Symmetrie waere die falsche Aussage.";
      },
      rangfolge: function (k) {
        return ["Das Ungleichgewicht", "Der Name " + k.subject, "Die Einordnung"];
      },
      zeigen: function (k) {
        return ["Das Verhaeltnis " + k.spannung.text + " als Bildgegenstand, " +
          "nicht als Bildunterschrift"];
      }
    },

    MOTION_GRAPHIC: {
      braucht: ["subject", "coreQuestion", "points"], gezeichnet: true, bewegt: true,
      idee: function (k) {
        return "Der Verlauf von " + k.subject + " entsteht vor dem Auge: " +
          k.points.length + " Punkte, in der Reihenfolge, in der sie gemessen " +
          "wurden" + (k.spannung ? ", bis " + k.spannung.text + " steht" : "") + ".";
      },
      fokus: function (k) {
        return "Das erste Vollbild muss schon eine Aussage sein: " + k.subject +
          " und der Ausgangspunkt. Autoplay ohne Ton heisst, dass der erste " +
          "Moment allein steht.";
      },
      aufbau: function () {
        return "Eine Bewegung, eine Richtung. Der Endzustand bleibt stehen, " +
          "lang genug, um gelesen zu werden.";
      },
      rangfolge: function (k) {
        return ["Die Bewegung", "Der Endzustand", "Der Name " + k.subject];
      },
      zeigen: function () {
        return ["Einen stehenden Endzustand - eine Animation ohne Ruhepunkt " +
          "hinterlaesst nichts"];
      }
    },

    VIDEO: {
      braucht: ["subject", "coreQuestion", "statement"], gezeichnet: false, bewegt: true,
      idee: function (k) {
        return "Eine Sequenz zu " + k.subject + ", die \"" + k.oneSecondMessage +
          "\" traegt" + (k.spannung ? " und in " + k.spannung.text + " aufloest" : "") +
          ". Ein Gedanke je Sequenz.";
      },
      fokus: function (k) {
        return "Das erste Vollbild: " + k.subject + " und der Einstieg in die " +
          "Aussage, ohne Ton lesbar.";
      },
      aufbau: function () {
        return "Hochformat, Text im sicheren Bereich ausserhalb der " +
          "Bedienelemente. Der Einstieg traegt die Aussage, nicht der Abspann.";
      },
      rangfolge: function (k) {
        return ["Das erste Vollbild", "Die Aussage", "Der Name " + k.subject];
      },
      zeigen: function () {
        return ["Lesbaren Text ohne Ton - der Ton ist bei den meisten aus"];
      }
    }
  };

  /* Welche Voraussetzung woran haengt. Ein eigener Ort, damit eine
     Form nicht ihre eigene Pruefung mitbringt und zwei Formen
     dieselbe Frage verschieden beantworten. */
  var VORAUSSETZUNG = {
    subject: function (k) { return gefuellt(k.subject); },
    /* Der Rahmen ist keine Zierde: ohne die Frage, mit der jemand
       hinsieht, weiss auch das Bild nicht, worauf es antwortet. Genau
       diese fehlende Frage war der Ausgangsfehler eine Stufe weiter
       oben, im Text. */
    coreQuestion: function (k) { return gefuellt(k.coreQuestion); },
    points: function (k) { return Array.isArray(k.points) && k.points.length >= 2; },
    total: function (k) { return k.total !== null && k.totalMax !== null; },
    contributions: function (k) { return k.contributions.length >= 2; },
    peers: function (k) { return k.peers.length >= 2; },
    returns: function (k) { return k.returns.length >= 2; },
    statement: function (k) { return gefuellt(k.oneSecondMessage); },
    claimNumbers: function (k) { return k.claimNumbers.length >= 1; },
    claimNumbersTwo: function (k) { return k.claimNumbers.length >= 2; },
    drawable: function (k) {
      return VORAUSSETZUNG.points(k) || VORAUSSETZUNG.total(k) ||
        VORAUSSETZUNG.peers(k);
    },
    spannung: function (k) { return !!k.spannung; }
  };

  /**
   * Die Creative Direction.
   *
   * Sie beantwortet die Fragen VOR der Erzeugung. Ein Feld leer zu
   * lassen ist erlaubt - dann meldet `ready()`, dass die Richtung noch
   * keine ist. NOT_APPLICABLE ist etwas anderes als leer und braucht
   * eine Begruendung in `notApplicable`.
   */
  function direction(spec) {
    spec = spec || {};
    var listeOderNa = function (v) {
      if (v === NOT_APPLICABLE) return NOT_APPLICABLE;
      return Array.isArray(v) ? v.slice() : [];
    };
    return {
      topicId: spec.topicId || null,
      visualStrategy: spec.visualStrategy || null,
      /* `storyCarried` hiess das frueher. Der Auftrag nennt die
         Dimension `story`; zwei Namen fuer denselben Wert driften
         auseinander, also gibt es nur noch einen. */
      story: spec.story || spec.storyCarried || null,
      /* Die EINE Idee. Nicht drei. */
      coreIdea: spec.coreIdea || null,
      oneSecondMessage: spec.oneSecondMessage || null,
      mainSubject: spec.mainSubject || null,
      compositionIntent: spec.compositionIntent || spec.composition || null,
      visualHierarchy: listeOderNa(spec.visualHierarchy),
      brandIntent: spec.brandIntent || null,
      mustShow: listeOderNa(spec.mustShow),
      mustNotShow: listeOderNa(
        spec.mustNotShow !== undefined ? spec.mustNotShow : spec.mustNotContain),
      imageLanguage: spec.imageLanguage || null,
      realism: spec.realism || null,
      colourWorld: spec.colourWorld || null,
      /* Mobile-first ist keine Zierde: der Bildausschnitt auf dem
         Telefon ist der einzige, den die meisten je sehen. */
      mobileFocalPoint: spec.mobileFocalPoint || null,
      /* Warum eine Dimension nicht zutrifft. Ohne Begruendung ist
         NOT_APPLICABLE ein Achselzucken und zaehlt nicht. */
      notApplicable: (spec.notApplicable && typeof spec.notApplicable === "object")
        ? spec.notApplicable : {},
      /* Aus welchen vorgelagerten Zustaenden ein Feld stammt. Ohne
         diese Spur laesst sich spaeter nicht mehr unterscheiden, ob
         ein Wert abgeleitet oder eingetragen wurde. */
      derivedFrom: (spec.derivedFrom && typeof spec.derivedFrom === "object")
        ? spec.derivedFrom : {},
      justifiedGenericMotifs: Array.isArray(spec.justifiedGenericMotifs)
        ? spec.justifiedGenericMotifs.slice() : []
    };
  }

  /**
   * Traegt die Richtung?
   *
   * Drei Ergebnisse je Dimension: gefuellt, begruendet nicht
   * zutreffend, oder fehlend. Ein NOT_APPLICABLE ohne Begruendung
   * zaehlt als fehlend - sonst waere es der bequemste Weg an jedem
   * Tor vorbei.
   */
  var PFLICHT = ["story", "visualStrategy", "coreIdea", "oneSecondMessage",
    "mainSubject", "mobileFocalPoint", "compositionIntent", "visualHierarchy",
    "brandIntent", "mustShow", "mustNotShow"];

  function ready(d) {
    var fehlt = [];
    var nichtAnwendbar = [];
    var befunde = [];
    var na = (d && d.notApplicable) || {};

    PFLICHT.forEach(function (f) {
      var v = d ? d[f] : null;
      if (v === NOT_APPLICABLE) {
        if (NIE_NICHT_ZUTREFFEND.indexOf(f) !== -1) {
          fehlt.push(f);
          befunde.push(f + " kann nicht NOT_APPLICABLE sein: die Frage stellt " +
            "sich fuer jede Bildform.");
          return;
        }
        if (!gefuellt(na[f])) {
          fehlt.push(f);
          befunde.push(f + " steht auf NOT_APPLICABLE ohne Begruendung. Ein " +
            "Achselzucken ist keine Antwort.");
          return;
        }
        nichtAnwendbar.push(f);
        return;
      }
      if (!gefuellt(v)) fehlt.push(f);
    });

    return {
      ok: fehlt.length === 0,
      missing: fehlt,
      notApplicable: nichtAnwendbar,
      findings: befunde,
      /* Der eigene Fehlertyp aus dem Auftrag (§4). Eine unvollstaendige
         Richtung ist weder ein Inhaltsfehler noch ein Providerfehler
         noch ein Bildfehler - sie ist ein Befund ueber unsere eigene
         Vorarbeit, und sie muss ihren eigenen Namen tragen, sonst
         sucht jemand an der falschen Stelle. */
      failureType: fehlt.length ? "VISUAL_DIRECTION_INCOMPLETE" : null,
      explanation: fehlt.length === 0
        ? "Die Richtung traegt: " + (PFLICHT.length - nichtAnwendbar.length) +
          " Dimensionen belegt" + (nichtAnwendbar.length
            ? ", " + nichtAnwendbar.length + " begruendet nicht zutreffend (" +
              nichtAnwendbar.join(", ") + ")" : "") + "."
        : "Ohne " + fehlt.join(", ") + " ist das keine Richtung, sondern eine " +
          "Bestellung. Wer \"Technologie\" bestellt, bekommt Neonwuerfel." +
          (befunde.length ? " " + befunde.join(" ") : "")
    };
  }


  /* -------------------------------------------------------------------
     DIE ABLEITUNG

     Sie erfindet nichts und sie faellt nicht auf eine Vorlage zurueck.
     Was hineingeht, steht oben im Kopfkommentar; was herauskommt, ist
     entweder aus diesen Zustaenden gerechnet oder null.
     ------------------------------------------------------------------- */
  function deriveDirection(spec) {
    spec = spec || {};
    var opp   = spec.opportunity || {};
    var frame = spec.audienceFrame || {};
    var story = spec.story || {};
    var daten = spec.visualData || {};
    var strategie = spec.visualStrategy || null;

    /* Der Gegenstand kommt aus dem AUDIENCE FRAME, nicht aus der
       Gelegenheit: der Rahmen fuehrt den Klarnamen, die Gelegenheit
       oft nur das Kuerzel. "XOM" auf einer Bildflaeche sagt einem
       breiten Publikum nichts. */
    var namen = Array.isArray(frame.publicEntityNames) ? frame.publicEntityNames : [];

    /* -----------------------------------------------------------------
       BEI MEHREREN TITELN IST DER ERSTE NICHT DER GEGENSTAND

       `namen[0]` war richtig, solange ein Thema von genau einem Titel
       handelte. Bei einer Rangliste ueber zehn Unternehmen ergab es
       die Bildrichtung "Valero Energy in seiner Gruppe: 5 Werte auf
       einer Achse" - fuer ein Bild, das die Reihe zeigt und nicht
       Valero.

       Traegt das Thema mehrere Titel, ist das THEMA der Gegenstand.
       Einer davon ist es dann ausdruecklich nicht. */
    var mehrere = (namen.length > 1) ||
      (Array.isArray(opp.entities) && opp.entities.length > 1);
    var subject = (mehrere && opp.topic)
      ? opp.topic
      : (namen[0] || (Array.isArray(opp.entities) ? opp.entities[0] : null) ||
         opp.topic || null);

    /* Die belegten Zahlen der Story - nur die mit Beleg. Eine Zahl
       ohne sourceRef darf nicht auf eine Bildflaeche. */
    var claimNumbers = (Array.isArray(story.claims) ? story.claims : [])
      .filter(function (c) { return c && c.source && c.numeric !== null &&
        c.numeric !== undefined; })
      .map(function (c) { return String(c.text).trim(); })
      .filter(function (t) { return t.length > 0; });

    var k = {
      subject: subject,
      /* Ob der Gegenstand EIN Titel ist oder eine Menge. Die
         Vergleichsform spricht sonst von "diesem Objekt in seiner
         Gruppe", obwohl der Gegenstand die Gruppe IST. */
      mehrereTitel: mehrere === true,
      topic: opp.topic || null,
      family: opp.family || null,
      coreQuestion: frame.coreQuestion || null,
      oneSecondMessage: spec.oneSecondMessage || null,
      points: Array.isArray(daten.points) ? daten.points : null,
      contributions: Array.isArray(daten.contributions) ? daten.contributions : [],
      peers: Array.isArray(daten.peers) ? daten.peers : [],
      returns: Array.isArray(daten.returns) ? daten.returns : [],
      total: (daten.total === undefined || daten.total === null) ? null : Number(daten.total),
      totalMax: (daten.totalMax === undefined || daten.totalMax === null)
        ? null : Number(daten.totalMax),
      source: daten.source || null,
      claimNumbers: claimNumbers,
      claimCount: (Array.isArray(story.claims) ? story.claims : []).length
    };
    k.spannung = spannung(k);

    var form = strategie ? FORMEN[strategie] : null;
    var fehlendeEingaben = [];
    var herkunft = {};
    var nichtAnwendbar = {};

    if (!strategie) {
      fehlendeEingaben.push("visualStrategy");
    } else if (!form) {
      fehlendeEingaben.push("visualStrategy:" + strategie + " (keine Form hinterlegt)");
    } else {
      form.braucht.forEach(function (v) {
        if (!VORAUSSETZUNG[v] || !VORAUSSETZUNG[v](k)) fehlendeEingaben.push(v);
      });
    }

    var tragfaehig = !!form && fehlendeEingaben.length === 0;

    function setzeNa(feld, grund) { nichtAnwendbar[feld] = grund; return NOT_APPLICABLE; }

    /* ---------- coreIdea und mobileFocalPoint ---------- */
    var coreIdea = null, mobileFocalPoint = null;
    if (tragfaehig) {
      coreIdea = entdoppel(form.idee(k));
      mobileFocalPoint = entdoppel(form.fokus(k));
      herkunft.coreIdea = ["VISUAL_STRATEGY:" + strategie,
        "AUDIENCE_FRAME:publicEntityNames"]
        .concat(k.spannung ? [k.spannung.from] : []);
      herkunft.mobileFocalPoint = ["VISUAL_STRATEGY:" + strategie,
        "AUDIENCE_FRAME:publicEntityNames"];
    }

    /* ---------- compositionIntent ---------- */
    var compositionIntent = tragfaehig ? entdoppel(form.aufbau(k)) : null;
    if (tragfaehig) herkunft.compositionIntent = ["VISUAL_STRATEGY:" + strategie];

    /* ---------- visualHierarchy ---------- */
    var visualHierarchy = null;
    if (tragfaehig) {
      var r = form.rangfolge(k);
      if (r && r.na) visualHierarchy = setzeNa("visualHierarchy", r.na);
      else visualHierarchy = (r || []).map(entdoppel);
      herkunft.visualHierarchy = ["VISUAL_STRATEGY:" + strategie,
        "AUDIENCE_FRAME:publicEntityNames"];
    }

    /* ---------- brandIntent ----------
       Das Markenregister gilt fuer die Bildflaeche genauso wie fuer
       den Satz. Es steht in brand.js als Sperrliste; hier steht die
       Absicht, die dahintersteht - und bei ATLAS die eine Regel, die
       nur fuer Atlas gilt. */
    var brandIntent = null;
    if (strategie) {
      brandIntent = "Sachlich und belegt. Das Bild macht dieselbe Zusage wie der " +
        "Text: eine Einordnung, keine Empfehlung. Casino-, Geheimtipp-, Moon- " +
        "und Angstregister gelten fuer die Flaeche wie fuer den Satz." +
        (form && form.atlas
          ? " Atlas wird ausschliesslich aus dem freigegebenen Original " +
            "abgeleitet, nie aus einem Textprompt."
          : "");
      herkunft.brandIntent = ["BRAND:BLOCKING_TERMS"]
        .concat(form && form.atlas ? ["BRAND:ATLAS_ASSET_PATH"] : []);
    }

    /* ---------- mustShow ----------
       Der Klarname, weil ein Kuerzel auf einer oeffentlichen Flaeche
       nichts sagt. Die Quellenzeile, wenn eine Reihe im Bild steckt.
       Dazu, was die Form selbst verlangt. */
    var mustShow = null;
    if (tragfaehig) {
      mustShow = ["Den Klarnamen \"" + subject + "\" - nicht das Kuerzel"];
      /* Die Kernfrage ist der Grund, aus dem jemand ueberhaupt
         hinsieht. Ein Bild, das sie nicht beruehrt, ist huebsch und
         geht vorbei. */
      if (k.coreQuestion) {
        mustShow.push("Eine sichtbare Antwort auf die Frage, mit der jemand " +
          "hinsieht: \"" + k.coreQuestion + "\"");
      }
      if (k.source) {
        mustShow.push("Die Quellenzeile \"" + k.source + "\" - ein Bild mit " +
          "Daten ohne Quelle ist eine Behauptung");
      }
      mustShow = mustShow.concat(form.zeigen(k) || []).map(entdoppel);
      herkunft.mustShow = ["AUDIENCE_FRAME:publicEntityNames",
        "VISUAL_STRATEGY:" + strategie]
        .concat(k.coreQuestion ? ["AUDIENCE_FRAME:coreQuestion"] : [])
        .concat(k.source ? ["STORY_DIRECTION/evidence:source"] : []);
    }

    /* ---------- mustNotShow ----------
       Drei Herkuenfte, drei verschiedene Gruende. Die Begriffe, die
       der Rahmen oeffentlich ausschliesst, gelten auf der Bildflaeche
       genauso - eine Flaeche ist nicht weniger oeffentlich als ein
       Satz. Die Prognose-Sperre kommt daher, dass kein einziger Beleg
       eine Prognose ist. Und die generischen KI-Motive kann es nur
       dort geben, wo ein Modell ein Motiv frei erfindet. */
    var mustNotShow = null;
    if (strategie && form) {
      var intern = Array.isArray(frame.internalTermsNotSuitableForHook)
        ? frame.internalTermsNotSuitableForHook : [];
      mustNotShow = [];
      if (intern.length) {
        mustNotShow.push("Interne Begriffe auf der Flaeche: " + intern.join(", ") +
          " - eine Bildflaeche ist nicht weniger oeffentlich als ein Satz");
      }
      if (k.claimCount > 0) {
        mustNotShow.push("Keine in die Zukunft verlaengerte Linie und keinen Pfeil " +
          "als Prognose: von " + k.claimCount + (k.claimCount === 1
            ? " Beleg ist er keiner" : " Belegen ist keiner") + " eine Prognose");
      }
      if (!form.gezeichnet) {
        mustNotShow.push("Generische KI-Bildsprache ohne Storybezug (" +
          /* "wuerfel" und "würfel" stehen beide in der Trefferliste,
             weil beide Schreibweisen vorkommen. Nebeneinander gedruckt
             sehen sie aus wie ein Fehler. */
          GENERISCHE_MOTIVE.filter(function (m, i, alle) {
            return alle.indexOf(m.replace(/ü/g, "ue")) === i ||
              m.indexOf("ü") === -1;
          }).slice(0, 6).join(", ") + " u. a.) - kein Verbot, " +
          "aber begruendungspflichtig");
      }
      if (!mustNotShow.length) {
        mustNotShow = setzeNa("mustNotShow", "Weder interne Begriffe noch Belege " +
          "noch ein frei erfundenes Motiv liegen vor - es gibt nichts, das " +
          "auszuschliessen waere.");
      }
      herkunft.mustNotShow = ["AUDIENCE_FRAME:internalTermsNotSuitableForHook",
        "STORY_DIRECTION:claims", "VISUAL_STRATEGY:" + strategie];
    }

    var d = direction({
      topicId: spec.topicId || opp.topicId || null,
      visualStrategy: strategie,
      story: story.thesis || story.hook || null,
      coreIdea: coreIdea,
      oneSecondMessage: k.oneSecondMessage,
      mainSubject: subject,
      mobileFocalPoint: mobileFocalPoint,
      compositionIntent: compositionIntent,
      visualHierarchy: visualHierarchy,
      brandIntent: brandIntent,
      mustShow: mustShow,
      mustNotShow: mustNotShow,
      notApplicable: nichtAnwendbar,
      derivedFrom: herkunft,
      justifiedGenericMotifs: spec.justifiedGenericMotifs || []
    });

    d.derivation = {
      /* Woertlich: das hier ist keine Vorlage. Wenn die Form ihre
         Voraussetzungen nicht hat, entsteht keine Idee. */
      derived: tragfaehig,
      strategy: strategie,
      missingInputs: fehlendeEingaben,
      tension: k.spannung ? { kind: k.spannung.kind, from: k.spannung.from } : null,
      explanation: tragfaehig
        ? "Abgeleitet aus " + strategie + " auf " + subject +
          (k.spannung ? " mit gemessener Spannung (" + k.spannung.kind + ")"
                      : " ohne messbare Spannung") + "."
        : (!strategie
            ? "Keine Bildform gewaehlt - ohne Form gibt es keine Bildidee."
            : "Die Form " + strategie + " braucht " + fehlendeEingaben.join(", ") +
              ". Das liegt nicht vor, also entsteht keine Idee. Ein Satz, der " +
              "auch ohne diese Daten entstuende, waere ein Default.")
    };
    return d;
  }

  /* -------------------------------------------------------------------
     DAS KREATIVE TOR

     Bewusst getrennt von asset-integrity.js und asset-transport.js:
     die pruefen Bytes, dieses hier prueft Wirkung. Ein Ergebnis von
     hier heisst VISUAL_CREATIVE_QUALITY_FAILED - nie
     ASSET_TRANSPORT_INTEGRITY_FAILED und umgekehrt.
     ------------------------------------------------------------------- */
  var KRITERIEN = [
    "storyAlignment", "scrollStop", "composition", "visualHierarchy",
    "mobileImpact", "brandQuality", "editorialQuality", "originality",
    "comprehensibility", "hookComplementarity", "aiGenericRisk"
  ];

  /**
   * Die kreative Bewertung.
   *
   * `signals` sind Messungen oder Urteile, die von aussen kommen - aus
   * dem Renderer, aus einer Bildanalyse, aus einer Owner-Sichtung.
   * Diese Datei ERFINDET keine: was nicht uebergeben wird, gilt als
   * nicht geprueft und zaehlt nicht als bestanden.
   */
  function assessQuality(spec) {
    spec = spec || {};
    var signale = spec.signals || {};
    var d = spec.direction || null;
    var kriterien = [];

    KRITERIEN.forEach(function (id) {
      var wert = signale[id];
      if (wert === undefined || wert === null) {
        kriterien.push({ id: id, passed: null, blocking: true,
          finding: "Nicht geprueft: kein Signal fuer " + id + " uebergeben." });
        return;
      }
      var ok = typeof wert === "boolean" ? wert : Number(wert) >= 0.6;
      kriterien.push({ id: id, passed: ok, blocking: true,
        value: typeof wert === "number" ? wert : null,
        finding: ok ? null : id + " traegt nicht (" + wert + ")." });
    });

    /* Generische Motive ohne Begruendung: das ist messbar, ohne das
       Bild zu sehen - es steht in der Richtung. */
    var unbegruendet = [];
    if (d) {
      var text = [d.coreIdea, d.mainSubject, d.imageLanguage].join(" ").toLowerCase();
      GENERISCHE_MOTIVE.forEach(function (m) {
        if (text.indexOf(m) !== -1 &&
            (d.justifiedGenericMotifs || []).indexOf(m) === -1) {
          unbegruendet.push(m);
        }
      });
    }
    if (unbegruendet.length) {
      kriterien.push({ id: "aiGenericRisk", passed: false, blocking: true,
        finding: "Generische Motive ohne Begruendung: " + unbegruendet.join(", ") +
          ". Kein Verbot - aber wer eines davon will, muss sagen, warum es " +
          "die Geschichte traegt." });
    }

    var geprueft = kriterien.filter(function (k) { return k.passed !== null; });
    var offen = kriterien.filter(function (k) { return k.passed === false; });
    var ungeprueft = kriterien.filter(function (k) { return k.passed === null; });

    return {
      /* Ungeprueft ist nicht bestanden - dieselbe Regel wie ueberall. */
      passed: offen.length === 0 && ungeprueft.length === 0,
      failureType: offen.length ? "VISUAL_CREATIVE_QUALITY_FAILED" : null,
      /* Ausdruecklich: ein kreativer Befund sagt nichts ueber den
         Transport, und ein Transportfehler nichts ueber die Qualitaet. */
      technicalJudgement: false,
      predictsPerformance: false,
      criteria: kriterien,
      met: geprueft.filter(function (k) { return k.passed; }).length,
      assessed: geprueft.length,
      total: kriterien.length,
      unassessed: ungeprueft.map(function (k) { return k.id; }),
      explanation: offen.length
        ? "Kreativ nicht bestanden: " + offen.map(function (k) { return k.id; }).join(", ") + "."
        : ungeprueft.length
          ? "Technisch mag das Bild stimmen - kreativ ist es ungeprueft: " +
            ungeprueft.map(function (k) { return k.id; }).join(", ") + "."
          : "Alle " + kriterien.length + " kreativen Kriterien bestanden."
    };
  }

  var api = {
    STAGES: STAGES,
    KRITERIEN: KRITERIEN,
    GENERISCHE_MOTIVE: GENERISCHE_MOTIVE,
    NOT_APPLICABLE: NOT_APPLICABLE,
    DIMENSIONEN: DIMENSIONEN,
    NIE_NICHT_ZUTREFFEND: NIE_NICHT_ZUTREFFEND,
    PFLICHT: PFLICHT,
    FORMEN: FORMEN,
    VORAUSSETZUNG: VORAUSSETZUNG,
    spannung: spannung,
    direction: direction,
    deriveDirection: deriveDirection,
    ready: ready,
    assessQuality: assessQuality
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisualIntelligence = api;
})(typeof window !== "undefined" ? window : globalThis);
