/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/discover-evidence.js

   AUS EINER DISCOVER-REIHE WIRD BELEGTE EVIDENZ

   -------------------------------------------------------------------------
   WAS EINE REIHE MITBRINGT
   -------------------------------------------------------------------------

   Die Reihen sind bereits redaktionell kuratiert: Titel und Untertitel
   stehen in Lesersprache, die Auswahlregel ist ausformuliert, und die
   Abdeckung sagt ehrlich, wie viele Titel gar nicht entscheidbar waren.

   Das ist besseres Ausgangsmaterial als ein einzelnes Kursereignis -
   und es liegt seit jeher im Repository.

   -------------------------------------------------------------------------
   ZWEI GRENZEN, DIE NICHT VERHANDELBAR SIND
   -------------------------------------------------------------------------

   ZURUECKGEHALTENE DATEN. Manche Felder tragen
   `WITHHELD_REDISTRIBUTION`: sie duerfen angezeigt, aber nicht
   weiterverbreitet werden. Ein Social-Beitrag IST Weiterverbreitung.
   Sie werden hier nicht zu Evidenz - unabhaengig davon, wie nuetzlich
   sie waeren.

   UNMOEGLICHE WERTE. Beim Bauen dieser Datei fiel auf, dass 24 Karten
   Margen von 200 % bis 1567 % anzeigen - Crown Castle mit "1337 %"
   Free-Cashflow-Marge. Die Ursache liegt in der Quelle: dieselbe
   Kennzahl steht bei einem Titel als 0,040015 (Bruch) und bei einem
   anderen als 2,547145 (Prozent), und die Anzeige rechnet immer mal
   hundert.

   Eine Marge ueber 100 % ist keine ungewoehnliche Zahl, sondern eine
   unmoegliche. Sie wird hier nicht uebernommen, auch nicht mit
   Warnung: was in einen Beitrag gelangt, wird gelesen.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Status, die eine Weiterverbreitung ausschliessen. */
  var NICHT_VERBREITBAR = ["WITHHELD_REDISTRIBUTION", "WITHHELD", "LICENSED_ONLY"];

  /* Status, die sagen: gerechnet und belastbar. */
  var BELASTBAR = ["CALCULATED", "OK", "VERIFIED"];

  /* Kennzahlen, bei denen ein Wert ueber dieser Grenze unmoeglich ist. */
  var OBERGRENZE = { marge: 100, anteil: 100, quote: 100 };

  /* -------------------------------------------------------------------
     DAS BRIEF-EVIDENZTOR — EINE DEFINITION, ZWEI AUFRUFER

     Diese Schwelle entschied bisher nur ueber Discover-Reihen, und sie
     stand mitten in `fromRow`. Seit der Owner sie zum Tor der
     Content-Leiter gemacht hat, urteilt sie auch ueber Gelegenheiten
     aus Signalen — und eine Schwelle, die an zwei Stellen NEU
     geschrieben wird, ist zwei Schwellen mit einem Namen.

     Also steht sie hier, einmal, und `fromRow` ruft sie auf wie jeder
     andere auch.

     ZWEI BEDINGUNGEN, NICHT EINE:

       genug Belege     Drei Saetze, die etwas behaupten, das
                        nachpruefbar ist.
       eine Begruendung Der Satz, der sagt, WARUM dieses Thema
                        zusammengehoert. Bei einer Discover-Reihe ist
                        das ihre Auswahlregel; bei einem Signal der
                        Anlass, den es mitbringt.

     Die zweite ist die wichtigere. Drei Zahlen ohne Grund sind eine
     Aufzaehlung, kein Thema — und genau diese Verwechslung ist der
     Ticker-first-Rueckfall, den §12 verbietet.
     ------------------------------------------------------------------- */
  var MINDEST_BELEGE = 3;

  function genuegt(belegAnzahl, begruendung) {
    var n = Number(belegAnzahl);
    if (!isFinite(n) || n < MINDEST_BELEGE) return false;
    /* Eine leere Zeichenkette ist keine Begruendung, `true` auch nicht:
       verlangt ist ein Satz, den jemand lesen kann. Unbekannt faellt
       hier auf `false` und nicht auf "wird schon". */
    return typeof begruendung === "string" && begruendung.trim().length > 0;
  }

  /* -------------------------------------------------------------------
     DIE ANZEIGE DER QUELLE IST IHRE EINHEITSERKLAERUNG

     `plain.zahl` traegt BEIDES: `roh` (1.59171) und `wert` ("+159 %").
     Genommen wurde bisher `roh` - und im Beitrag stand dann "Valero
     Energy: in 12 Monaten 1.59171." Ein Leser liest 1,59. Gemeint ist
     +159 %.

     Dieselbe Verwechslung, vor der der Kopf dieser Datei warnt, nur
     andersherum: dort wurde eine Marge zurueckgewiesen, WEIL die
     Einheit unerklaert war. Hier lag die Erklaerung die ganze Zeit
     daneben - in dem Feld, das die Seite dem Leser ohnehin zeigt.

     Gemessen ueber alle Reihen: 707 angezeigte Werte, Einheit
     ausnahmslos Prozent. Es wird also nichts geraten und nichts
     umgerechnet - es wird gelesen, was die Quelle selbst schreibt.
     ------------------------------------------------------------------- */
  function ausAnzeige(anzeige) {
    var t = String(anzeige === null || anzeige === undefined ? "" : anzeige).trim();
    if (!t) return { ok: false, reason: "keineAnzeige" };
    /* Das Minus der Anzeige ist ein typografisches (U+2212), nicht das
       Tastaturminus. Wer nur "-" prueft, liest jeden Verlust als
       Gewinn. */
    var m = /^([+\u2212-]?)\s*([0-9]+(?:[.,][0-9]+)?)\s*%$/.exec(t);
    if (!m) {
      return { ok: false, reason: "anzeigeUnlesbar",
        message: "Die Quelle zeigt \"" + t + "\" - daraus ist keine Zahl mit " +
          "Einheit zu lesen. Geraten wird hier nicht." };
    }
    var zahl = Number(m[2].replace(",", "."));
    if (!isFinite(zahl)) return { ok: false, reason: "keineZahl" };
    if (m[1] === "-" || m[1] === "\u2212") zahl = -zahl;
    return { ok: true, value: zahl, unit: "%" };
  }

  /* Die Obergrenze, die fuer dieses Label gilt - oder null. Sie stand
     seit jeher in OBERGRENZE und wurde nie gefragt: eine Schwelle, die
     niemandem im Weg steht, ist keine. */
  function obergrenzeFuer(label) {
    var l = String(label || "").toLowerCase();
    var treffer = null;
    Object.keys(OBERGRENZE).forEach(function (k) {
      if (l.indexOf(k) !== -1) treffer = OBERGRENZE[k];
    });
    return treffer;
  }

  function istMarge(label) {
    return /marge|quote|anteil|rendite/i.test(String(label || ""));
  }

  /**
   * Ein Wert aus einer Karte - oder ein Befund, warum nicht.
   *
   * Gibt NIE einen Wert mit Warnung zurueck. Was in einen Beitrag
   * gelangt, wird gelesen; eine Warnung daneben liest niemand mit.
   */
  /* Eine Einheit gilt als erklaert, wenn das Feld selbst sie nennt. */
  function options_unitDeclared(feld) {
    return !!(feld && typeof feld === "object" && (feld.unit || feld.einheit));
  }

  function wertAus(feld, label) {
    if (feld === null || feld === undefined) {
      return { ok: false, reason: "fehlt" };
    }
    var status = (typeof feld === "object" && feld !== null) ? feld.status : null;
    var wert = (typeof feld === "object" && feld !== null) ? feld.value : feld;

    if (status && NICHT_VERBREITBAR.indexOf(status) !== -1) {
      return { ok: false, reason: "nichtVerbreitbar",
        message: "Status " + status + ": darf angezeigt, aber nicht " +
          "weiterverbreitet werden. Ein Social-Beitrag ist Weiterverbreitung." };
    }
    if (status && BELASTBAR.indexOf(status) === -1) {
      return { ok: false, reason: "nichtBelastbar",
        message: "Status " + status + " ist keine belastbare Rechnung." };
    }
    if (typeof wert !== "number" || !isFinite(wert)) {
      return { ok: false, reason: "keineZahl" };
    }
    /* -----------------------------------------------------------------
       DIE EINHEIT IST NICHT ERKLAERT - ALSO IST DER WERT NICHT NUTZBAR

       Der erste Entwurf wies nur Werte ueber 100 % zurueck und liess
       13,37 als "13,4 %" durch. Das war selbst geraten.

       Gemessen an der Reihe "CASHFLOW-MASCHINEN": ihre Regel verlangt
       eine Free-Cashflow-Marge von mindestens 15 %. Alle sechzehn
       Treffer tragen roh-Werte zwischen 1,08 und 13,37. Als Prozent
       gelesen erfuellt KEINER die Regel; als Bruch gelesen waeren es
       108 % bis 1337 % - unmoeglich, zumal die Reihe ueberwiegend
       Banken enthaelt, fuer die eine Free-Cashflow-Marge ohnehin keine
       sinnvolle Kennzahl ist.

       Filter und Anzeige lesen dieselbe Zahl verschieden. Solange die
       Quelle keine Einheit mitliefert, ist jede Deutung eine
       Behauptung - auch die harmlos aussehende.

       Ein Kurs traegt seine Einheit (USD) und einen Status. Eine Marge
       hier nicht. Deshalb wird sie nicht zu Evidenz, bis die Quelle
       die Einheit erklaert. Das ist streng und die einzige ehrliche
       Antwort: was in einen Beitrag gelangt, wird gelesen. */
    if (istMarge(label) && !feld.unit && !options_unitDeclared(feld)) {
      return { ok: false, reason: "unitUndeclared",
        message: label + ": die Quelle erklaert die Einheit nicht. Derselbe " +
          "Kennzahltyp steht dort teils als Bruch (0,04) und teils als " +
          "Prozent (2,55); Filter und Anzeige lesen ihn verschieden. Der " +
          "Rohwert " + wert + " ist damit nicht deutbar - weder als " +
          (wert * 100).toFixed(0) + " % noch als " + wert.toFixed(1) + " %." };
    }
    return { ok: true, value: wert };
  }

  /**
   * Die Evidenz einer Reihe.
   *
   * `row` ist eine Discover-Reihe, unveraendert gelesen. Diese Datei
   * baut keine zweite Discover-Architektur: sie liest die kanonische
   * Datei und uebersetzt sie in Belegsaetze.
   */
  function fromRow(row, options) {
    options = options || {};
    var max = options.maxCompanies || 5;
    var r = row || {};
    var belege = [];
    var befunde = [];

    /* 1. Die Auswahlregel ist der staerkste Beleg der Reihe: sie sagt,
       WARUM diese Titel zusammenstehen. Ohne sie ist eine Liste nur
       eine Liste. */
    if (r.rule) {
      belege.push({ id: "row-rule", statement: String(r.rule),
        source: "discover.row." + (r.rowId || "unbekannt"), temporal: false });
    } else {
      befunde.push({ id: "noRule",
        message: "Diese Reihe nennt keine Auswahlregel. Eine Liste ohne " +
          "Regel ist keine Geschichte - nur eine Aufzaehlung." });
    }

    /* 2. Die Abdeckung - mit der ehrlichen Zahl der nicht
       entscheidbaren Titel. Sie gehoert dazu: "596 von 5947" ohne
       "2849 nicht entscheidbar" waere eine schoenere und falschere
       Aussage. */
    var c = r.coverage;
    if (c && typeof c.matched === "number" && typeof c.universeSize === "number") {
      /* -----------------------------------------------------------------
         DIE ABDECKUNG IST EINE ZAHL, NICHT NUR EIN SATZ

         Sie stand hier als Text ohne Wert - und der Content Brief
         nimmt nur Belege MIT Zahl auf. Damit erreichte die einzige
         Aussage, die ueber die REIHE spricht statt ueber einen
         einzelnen Titel, den Autor nie. Der Einstieg einer Rangliste
         ueber zehn Unternehmen lautete deshalb "412,53 USD - Valero
         Energy, Kurs.": der Autor hatte nichts anderes.

         Die Zahl wird nicht erfunden; sie stand im Satz und steht
         jetzt auch im Feld. Es kommt KEIN Beleg hinzu - die Schwelle
         des Evidenztors bleibt dieselbe. */
      belege.push({ id: "row-coverage",
        metric: "von " + c.universeSize + " geprueften Titeln",
        value: c.matched,
        statement: c.matched + " von " + c.universeSize + " geprueften Titeln " +
          "erfuellen das" + (typeof c.notEvaluable === "number" && c.notEvaluable
            ? "; bei " + c.notEvaluable + " fehlt die noetige Kennzahl" : "") + ".",
        source: "discover.row." + (r.rowId || "unbekannt"), temporal: false });
    }

    /* 3. Die Titel selbst - mit Klarnamen, nicht mit Kuerzeln. */
    var karten = Array.isArray(r.cards) ? r.cards.slice(0, max) : [];
    karten.forEach(function (k) {
      if (!k || !k.companyName) return;
      var name = k.companyName;

      var p = wertAus(k.price, "Kurs");
      if (p.ok) {
        belege.push({ id: "price-" + k.symbol, entity: name,
          metric: "Kurs", value: p.value, unit: "USD",
          statement: name + ": Kurs " + String(p.value).replace(".", ",") + " USD.",
          source: "discover.card", observedAt: k.asOf || r.asOf || null, temporal: true });
      }

      var z = (k.plain || {}).zahl;
      if (z && z.label) {
        /* -----------------------------------------------------------------
           DIE ANZEIGE GILT - AUSSER BEI MARGEN

           Fuer Margen, Quoten und Anteile hat der Kopf dieser Datei
           eine Entscheidung getroffen: sie werden NICHT uebernommen,
           solange die Quelle die Einheit nicht erklaert, weil dieselbe
           Kennzahl dort teils als Bruch und teils als Prozent steht
           und die Anzeige immer mal hundert rechnet.

           Diese Entscheidung bleibt. Sie ueber die Anzeige zu
           umgehen waere genau das, was hier nie passieren soll: eine
           Schwelle senken, bis etwas durchkommt. Die Anzeige wird nur
           dort gelesen, wo die Quelle nie im Verdacht stand - bei
           Renditen und Veraenderungen wie "in 12 Monaten". */
        var a = istMarge(z.label) ? { ok: false, reason: "margeStrikt" }
                                  : ausAnzeige(z.wert);
        if (a.ok) {
          /* Die Obergrenze greift hier heute nie: jedes Label mit
             Obergrenze ist eine Marge, und Margen kommen nicht bis
             hierher. Sie steht trotzdem, weil sie die Frage
             beantwortet, die sich stellt, SOBALD die Quelle Margen
             mit Einheit liefert - und weil ein Wert ueber 100 %
             dann nicht erst im Beitrag auffallen soll. Test LZ-DE
             haelt diese Beziehung fest. */
          var grenze = obergrenzeFuer(z.label);
          if (grenze !== null && Math.abs(a.value) > grenze) {
            befunde.push({ id: "unmoeglicherWert", entity: name,
              message: z.label + ": " + a.value + " " + a.unit + " ist fuer diese " +
                "Kennzahl unmoeglich (hoechstens " + grenze + " " + a.unit + "). " +
                "Was in einen Beitrag gelangt, wird gelesen." });
          } else {
            belege.push({ id: "metric-" + k.symbol, entity: name,
              metric: z.label, value: a.value, unit: a.unit,
              /* Deutsche Schreibweise: 1,4 und nicht 1.4. Der Wert
                 bleibt derselbe; nur der Leser sieht das Komma, das er
                 erwartet. */
              statement: name + ": " + z.label + " " +
                String(a.value).replace(".", ",") + " " + a.unit + ".",
              source: "discover.card." + (z.quelle || "unbekannt"),
              observedAt: k.asOf || null, temporal: false });
          }
          return;
        }

        /* Der Rohwert kommt als nackte Zahl - ohne Status und ohne
           Einheit. Genau das ist das Problem, und es wird hier nicht
           weggebuegelt. */
        var w = wertAus(typeof z.roh === "number"
          ? { value: z.roh, status: "CALCULATED", unit: z.unit || null } : null, z.label);
        if (w.ok) {
          belege.push({ id: "metric-" + k.symbol, entity: name,
            metric: z.label, value: w.value,
            statement: name + ": " + z.label + " " +
              (istMarge(z.label) ? w.value.toFixed(1) + " %" : w.value) + ".",
            source: "discover.card." + (z.quelle || "unbekannt"),
            observedAt: k.asOf || null, temporal: false });
        } else if (w.reason === "unitUndeclared" || w.reason === "nichtVerbreitbar") {
          befunde.push({ id: w.reason, entity: name, message: w.message });
        }
      }

      /* Die Erzaehlung der Karte steht schon in Lesersprache. */
      if ((k.plain || {}).story) {
        belege.push({ id: "story-" + k.symbol, entity: name,
          statement: name + ": " + k.plain.story + ".",
          source: "discover.card.plain", temporal: false });
      }
    });

    return {
      rowId: r.rowId || null,
      title: r.title || null,
      subtitle: r.subtitle || null,
      asOf: r.asOf || null,
      evidence: belege,
      findings: befunde,
      /* Ausdruecklich getrennt: wie viele Belege, und wie viele
         Werte zurueckgewiesen wurden. Eine Reihe mit vielen
         Zurueckweisungen ist eine schlechte Evidenzquelle, auch wenn
         die uebrigen Belege stimmen. */
      evidenceCount: belege.length,
      rejectedCount: befunde.length,
      sufficient: genuegt(belege.length, r.rule),
      explanation: genuegt(belege.length, r.rule)
        ? belege.length + " Belege aus der Reihe, Auswahlregel vorhanden."
        : "Zu wenig Evidenz fuer eine eigene Geschichte: " + belege.length +
          " Belege" + (r.rule ? "" : ", keine Auswahlregel") + "."
    };
  }

  var api = {
    NICHT_VERBREITBAR: NICHT_VERBREITBAR,
    BELASTBAR: BELASTBAR,
    OBERGRENZE: OBERGRENZE,
    MINDEST_BELEGE: MINDEST_BELEGE,
    genuegt: genuegt,
    wertAus: wertAus,
    ausAnzeige: ausAnzeige,
    obergrenzeFuer: obergrenzeFuer,
    fromRow: fromRow
  };

  if (isNode) module.exports = api;
  else global.VUSocialDiscoverEvidence = api;
})(typeof window !== "undefined" ? window : globalThis);
