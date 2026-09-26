/* =========================================================================
   DIE FORM DER REISE — WIE VIEL EINE SEITE ÜBERHAUPT ZU SAGEN HAT.

   Gemessen am 26.09.2026 über dieselbe 500er-Stichprobe wie die
   Reisemessung, und zwar nicht "was ist beantwortet", sondern "was ist
   GEHALTVOLL": eine Station zählt nur, wenn sie mindestens einen konkreten
   Wert zeigt.

     11 gehaltvolle Stationen   352 Titel        \
     10                          56              |  volle Reise: 409
      9                           1             /
      7                           9             \
      6                           2              |  reduzierte Reise: 89
      5                          34              |
      4                          37              |
      3                           7             /
      1                           2                praktisch leer: 2

   Der Unterschied zur alten Zählung ist der Punkt: ACAA gilt an vier
   Stationen als "beantwortet" und zeigt dort 0 von 7 Faktoren und 0 von 16
   Kennzahlen. Für einen Leser ist das keine Antwort, sondern eine leere
   Fläche mit Überschrift.

   WAS EINE DATENARME SEITE HEUTE IST, UND WARUM DAS EIN PRODUKTFEHLER IST

   Dieselbe Messung: 91 Titel der Stichprobe haben höchstens acht
   beantwortete Stationen. Ihr Median sind FÜNF Absagen auf einer Seite -
   aber nur DREI verschiedene Ursachen (Verteilung: 2 Ursachen bei 13
   Titeln, 3 bei 68, 4 bei 9, 5 bei einem). Und die häufigsten gemeinsamen
   Ausfälle tragen denselben Grund, Titel für Titel:

     setup + setupChange          73 mal zusammen aus, 73 mal identischer Grund
     setup + technical            73 mal zusammen aus, 73 mal identischer Grund
     setupChange + technical      73 mal zusammen aus, 73 mal identischer Grund
     factorStrength + strategy    21 mal zusammen aus, 21 mal identischer Grund

   Fünf Absagen für drei Ursachen sind keine datenarme Seite, sondern eine
   schlecht verdichtete. Deshalb entscheidet dieses Modul zwei Dinge - und
   nur diese zwei:

     1. WELCHE FORM die Seite hat (volle Reise, reduzierte Reise, oder
        ausdrücklich "hierzu liegt nichts vor").
     2. WIE die nicht verfügbaren Bereiche zu GRUPPEN zusammenfallen, je
        nach dem Grund, den die Dienste ohnehin je Titel veröffentlichen.

   Was es NICHT tut: rechnen, Daten lesen, Schwellen erfinden, einen Grund
   ersetzen. Es bekommt die gemessenen Zustände übergeben und gibt Sätze
   zurück, die genau diese Zustände wiedergeben. Jede Zahl in einem Satz
   stammt aus dem `unavailability`-Block des jeweiligen Dienstes; fehlt sie,
   fehlt der Satzteil - und nicht die Zahl wird geschätzt.

   EIN UNBEKANNTER CODE VERSCHWINDET NICHT. Er landet in der Gruppe
   `OTHER`, die ihn beim Namen nennt, und ein Test hält jeden Code, den die
   Dienste heute erzeugen können, gegen diese Tabelle. Eine Verdichtung, die
   still schluckt, was sie nicht kennt, wäre schlimmer als elf Boxen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var SCHEMA_VERSION = "journey-shape-1.0.0";

  /* Die Stationen der Reise, in der Reihenfolge der Seite. `area` ist der
     Name, unter dem ein Leser den Bereich in einer Gruppenerklärung
     wiederfindet - Alltagssprache, kein Modulname. Das Wörterbuch verbietet
     die internen Namen in der Hauptkopie; diese hier sind die erlaubten. */
  var STATIONS = [
    { id: "identity",         area: "Letzter Kurs" },
    { id: "chart",            area: "Kursverlauf" },
    { id: "factorStrength",   area: "Wie stark die Aktie dasteht", zahlenBereich: true },
    { id: "change",           area: "Was sich verändert hat", zahlenBereich: true },
    { id: "setup",            area: "Ob sich eine Situation aufbaut" },
    { id: "setupChange",      area: "Was diesen Zustand ändern würde" },
    { id: "patterns",         area: "Chance und Risiko in ähnlichen Lagen" },
    { id: "strategy",         area: "Welcher Anlagestil passt", zahlenBereich: true },
    { id: "assignmentChange", area: "Ob sich die Zuordnung geändert hat" },
    { id: "technical",        area: "Die Kursstruktur" },
    { id: "business",         area: "Die Unternehmenszahlen", zahlenBereich: true }
  ];
  /* EIN CODE HEISST NICHT IN JEDER STATION DASSELBE.
   *
   * Gemessen an ACAA und ANV: die Unternehmenszahlen fallen mit
   * SOURCE_MISSING aus - und landeten damit in der Gruppe "keine
   * auswertbare Kursreihe". Das ist schlicht falsch: dort fehlen
   * Geschaeftszahlen, nicht Schlusskurse. Derselbe Code bedeutet an den
   * Kursstationen "keine Kursreihe" und an den Zahlenstationen "keine
   * Kennzahlen". Wer nur den Code abbildet, erklaert dem Leser die falsche
   * Ursache - schlimmer als elf Boxen, weil es plausibel klingt. */
  var ZAHLEN_BEREICH = {};
  for (var zi = 0; zi < STATIONS.length; zi++) if (STATIONS[zi].zahlenBereich) ZAHLEN_BEREICH[STATIONS[zi].id] = true;
  var AREA = {};
  for (var si = 0; si < STATIONS.length; si++) AREA[STATIONS[si].id] = STATIONS[si].area;

  /* Die Schwelle kommt aus der Verteilung oben, nicht aus dem Gefühl - und
     sie ist in ABSAGEN formuliert, nicht in Stationen. Das ist kein
     Geschmack: eine Seite zeigt nicht immer alle elf Stationen (die
     Aktienseite trägt acht davon, die übrigen liegen auf der Quant-Ansicht),
     und eine Schwelle "mindestens neun gehaltvoll" würde jede Teilseite
     fälschlich für datenarm erklären. Gezählt wird, was der Leser sieht:
     höchstens zwei Absagen sind Beiwerk in einer vollen Reise, ab der
     dritten ist die Seite ein Stapel.

     Auf allen elf Stationen ist das genau die gemessene Grenze: höchstens
     zwei Absagen heisst mindestens neun gehaltvoll, also die 409 - und
     darunter die 89. Eine Station mit höchstens einer gehaltvollen Aussage
     hat nicht wenig zu sagen, sondern nichts; das ist eine eigene Form. */
  var MAX_WITHHELD_IN_FULL = 2;
  var MINIMAL_MAX_SUBSTANTIVE = 1;

  function zahl(value) {
    return typeof value === "number" && isFinite(value) ? value : null;
  }
  function deutsch(value) {
    var n = zahl(value);
    if (n === null) return null;
    return n.toLocaleString ? n.toLocaleString("de-DE") : String(n);
  }

  /* ----------------------------------------------------------------------
     DIE URSACHENGRUPPEN.

     Ein Grund, den mehrere Bereiche teilen, wird EINMAL erklärt. Die Codes
     sind die, die die Dienste veröffentlichen - `unavailability.reason`
     bevorzugt, sonst `reason`. Die Reihenfolge ist die der Erklärkraft: was
     an der Kursgeschichte liegt, zuerst.
     ---------------------------------------------------------------------- */
  var CAUSES = [
    {
      id: "SHORT_HISTORY",
      codes: ["INSUFFICIENT_HISTORY", "INSUFFICIENT_WEEKLY_HISTORY"],
      headline: "Die Kursgeschichte ist noch zu kurz",
      /* Die Zahlen stehen in genau dem Block, den der Dienst je Titel
         mitschickt. Fehlt er, bleibt der Satz ohne Zahl - er wird nicht
         mit einer plausiblen gefüllt. */
      sentence: function (detail) {
        var bars = deutsch(detail.bars), required = deutsch(detail.requiredBars);
        var weeks = deutsch(detail.weeks), requiredWeeks = deutsch(detail.requiredWeeks);
        if (bars && required) {
          return "Diese Auswertungen brauchen einen längeren Kursverlauf. Für diesen Titel liegen " +
            bars + " Handelstage vor, gebraucht werden " + required + ".";
        }
        if (weeks && requiredWeeks) {
          return "Diese Auswertungen brauchen einen längeren Kursverlauf. Für diesen Titel liegen " +
            weeks + " Wochen vor, gebraucht werden " + requiredWeeks + ".";
        }
        return "Diese Auswertungen brauchen einen längeren Kursverlauf, als für diesen Titel vorliegt.";
      },
      outlook: "Das ändert sich von selbst, sobald der Titel länger gehandelt wird."
    },
    {
      id: "NO_SERIES",
      codes: ["SOURCE_MISSING", "NO_SERIES"],
      headline: "Für diesen Titel liegt noch keine auswertbare Kursreihe vor",
      sentence: function () {
        return "Ohne eine geprüfte Reihe von Schlusskursen entsteht hier keine Auswertung. " +
          "Ersatzwerte werden nicht gebildet.";
      },
      outlook: null
    },
    {
      /* WELCHE REIHE FEHLT, MUSS DASTEHEN.
       *
       * ACAA zeigt einen Kursverlauf ueber 117 Handelstage - und die
       * Musterlage fiel unter "keine auswertbare Kursreihe". Fuer einen
       * Leser widersprechen sich die beiden Saetze, und einer von ihnen
       * wirkt wie ein Fehler der Seite. Der veroeffentlichte Grund ist
       * praeziser als die Gruppe war: es fehlt die WOCHENreihe, auf der
       * die Musterforschung rechnet. */
      id: "NO_WEEKLY_SERIES",
      codes: ["NO_WEEKLY_SERIES"],
      headline: "Für Wochenvergleiche liegt noch keine Reihe vor",
      sentence: function () {
        return "Diese Auswertung vergleicht Wochenverläufe über mehrere Jahre. " +
          "Für diesen Titel ist noch keine geprüfte Wochenreihe veröffentlicht - " +
          "der Tagesverlauf oben bleibt davon unberührt.";
      },
      outlook: null
    },
    {
      id: "RARELY_TRADED",
      codes: ["TECHNICAL_WINDOW_OUTSIDE_CALENDAR", "TECHNICAL_SESSION_NOT_A_TRADING_DAY"],
      headline: "Der Titel wird zu selten gehandelt",
      sentence: function (detail) {
        var sessions = deutsch(detail.sessions), from = detail.windowFrom, to = detail.windowTo;
        if (sessions && from && to) {
          return "Die letzten " + sessions + " Handelstage reichen von " + from + " bis " + to +
            ". Eine Kursstruktur über einen so langen Zeitraum beschreibt nicht die heutige Lage.";
        }
        if (detail.session) {
          return "Für diesen Titel liegt ein Kurs an einem Tag ohne Börsenhandel (" + detail.session +
            "). Solange das nicht geklärt ist, wird hier nichts ausgewertet.";
        }
        return "Die vorhandenen Handelstage liegen so weit auseinander, dass sie die heutige Lage nicht beschreiben.";
      },
      outlook: null
    },
    {
      id: "NO_FIGURES",
      codes: ["NOT_COVERED_BY_FACTOR_EVIDENCE", "NO_EVIDENCE", "INPUT_NOT_MATERIALIZED",
              "NO_COMPARABLE_OBSERVATION", "NO_MEASURABLE_FEATURES"],
      headline: "Zahlen zum Unternehmen liegen noch nicht vor",
      /* KEIN GEMEINSAMER NENNER FUER ZWEI VERSCHIEDENE MENGEN.
       *
       * Hier stand einmal "Von 7 Kennzahlen ist keine veroeffentlicht" -
       * die 7 sind die Faktoren, die 16 sind die Kennzahlen, und die
       * Gruppe fasst beide. Ein Satz, der den Nenner der einen Menge auf
       * die andere anwendet, ist eine erfundene Aussage, auch wenn beide
       * Zahlen gemessen sind. Die Zahlen stehen deshalb JE BEREICH hinter
       * seinem Namen, und der Satz bleibt ohne Nenner. */
      sentence: function () {
        return "Für diesen Titel sind die benötigten Werte noch nicht veröffentlicht. " +
          "Ohne sie entsteht keine Einordnung - geschätzt wird nichts.";
      },
      outlook: null
    },
    {
      id: "NO_SECOND_STATE",
      codes: ["NO_SECOND_PUBLISHED_STATE"],
      headline: "Es gibt noch keinen zweiten Stand zum Vergleich",
      sentence: function () {
        return "Eine Veränderung braucht zwei veröffentlichte Stände. Für diesen Titel liegt bisher einer vor.";
      },
      outlook: "Mit dem nächsten veröffentlichten Stand ist der Vergleich möglich."
    },
    {
      id: "NOT_PERMITTED",
      codes: ["DISPLAY_NOT_PERMITTED", "INVALID_TECHNICAL_PROVENANCE", "INVALID_IDENTITY"],
      headline: "Diese Angaben dürfen hier nicht gezeigt werden",
      sentence: function () {
        return "Die Prüfung von Herkunft und Freigabe ist für diesen Titel nicht bestanden. " +
          "Was nicht geprüft ist, wird nicht angezeigt.";
      },
      outlook: null
    }
  ];

  var CAUSE_BY_CODE = {};
  for (var ci = 0; ci < CAUSES.length; ci++) {
    for (var cj = 0; cj < CAUSES[ci].codes.length; cj++) CAUSE_BY_CODE[CAUSES[ci].codes[cj]] = CAUSES[ci];
  }

  /* Ein Code, den diese Tabelle nicht kennt, wird genannt und nicht
     verschluckt. Der Satz bleibt wahr, auch wenn er weniger erklärt. */
  function fremdeGruppe(code) {
    return {
      id: "OTHER",
      headline: "Dieser Bereich ist derzeit nicht auswertbar",
      sentence: function () {
        return "Der veröffentlichte Grund lautet „" + code + "“. " +
          "Er ist hier noch nicht in Alltagssprache übersetzt.";
      },
      outlook: null,
      unknownCode: code
    };
  }

  function causeFor(code, stationId) {
    /* Die Zahlenbereiche lesen SOURCE_MISSING als "diese Werte fehlen" und
       nicht als "keine Kursreihe" - siehe ZAHLEN_BEREICH oben. */
    if (ZAHLEN_BEREICH[stationId] && (code === "SOURCE_MISSING" || code === "NO_SERIES")) {
      return CAUSE_BY_CODE.NO_EVIDENCE;
    }
    return CAUSE_BY_CODE[code] || fremdeGruppe(code);
  }

  /* ----------------------------------------------------------------------
     DIE FORM EINER SEITE.

     Eingabe: je Station, was die Dienste gesagt haben.
       { id: { substantive: boolean, reason: string|null, detail: {} } }

     `substantive` entscheidet der Aufrufer, weil nur er weiss, ob die
     Station einen konkreten Wert HAT - nicht, ob sie AVAILABLE sagt. Genau
     diese Unterscheidung ist der Grund, warum dieses Modul existiert.
     ---------------------------------------------------------------------- */
  function assess(stations) {
    var input = stations || {};
    var substantive = [], withheld = [];
    for (var i = 0; i < STATIONS.length; i++) {
      var id = STATIONS[i].id;
      /* Eine Station, die der Aufrufer nicht übergibt, trägt diese Seite
         nicht - sie ist keine Absage. Sonst würde jede Teilansicht ihre
         eigene Unvollständigkeit als Datenmangel des Titels ausgeben. */
      if (!Object.prototype.hasOwnProperty.call(input, id)) continue;
      var entry = input[id] || {};
      if (entry.substantive) { substantive.push(id); continue; }
      withheld.push({
        id: id, area: AREA[id],
        reason: entry.reason || "UNAVAILABLE",
        detail: entry.detail || {}
      });
    }

    var shape = substantive.length <= MINIMAL_MAX_SUBSTANTIVE ? "MINIMAL"
      : withheld.length <= MAX_WITHHELD_IN_FULL ? "FULL" : "REDUCED";

    /* Gruppieren nach Ursache, Reihenfolge nach CAUSES - damit zwei Seiten
       mit derselben Lage dieselbe Reihenfolge zeigen. */
    var buckets = [], byId = {};
    for (var w = 0; w < withheld.length; w++) {
      var cause = causeFor(withheld[w].reason, withheld[w].id);
      var key = cause.id === "OTHER" ? "OTHER:" + withheld[w].reason : cause.id;
      if (!byId[key]) {
        byId[key] = { cause: cause, causeId: cause.id, unknownCode: cause.unknownCode || null,
                      headline: cause.headline, areas: [], stations: [], reasons: [], detail: {} };
        buckets.push(byId[key]);
      }
      var bucket = byId[key];
      /* Jeder Bereich traegt SEINE Zahlen, keine geteilten. */
      var dw = withheld[w].detail || {}, note = null;
      if (zahl(dw.available) !== null && zahl(dw.total) !== null && dw.total > 0) {
        note = deutsch(dw.available) + " von " + deutsch(dw.total) + " Werten liegen vor";
      }
      bucket.areas.push(note ? withheld[w].area + " (" + note + ")" : withheld[w].area);
      bucket.stations.push(withheld[w].id);
      if (bucket.reasons.indexOf(withheld[w].reason) < 0) bucket.reasons.push(withheld[w].reason);
      /* Der erste Titel-Detailblock, der Zahlen trägt, erklärt die Gruppe.
         Zwei Bereiche derselben Ursache tragen dieselben Zahlen; wo nicht,
         gewinnt der vollständigere. */
      var d = withheld[w].detail || {};
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k) &&
          d[k] !== null && d[k] !== undefined && bucket.detail[k] === undefined) bucket.detail[k] = d[k];
    }
    var order = {};
    for (var oi = 0; oi < CAUSES.length; oi++) order[CAUSES[oi].id] = oi;
    buckets.sort(function (a, b) {
      var ai = order[a.causeId] === undefined ? 99 : order[a.causeId];
      var bi = order[b.causeId] === undefined ? 99 : order[b.causeId];
      return ai - bi || b.areas.length - a.areas.length;
    });
    var groups = buckets.map(function (bucket) {
      return {
        causeId: bucket.causeId, unknownCode: bucket.unknownCode,
        headline: bucket.headline,
        explanation: bucket.cause.sentence(bucket.detail),
        outlook: bucket.cause.outlook || null,
        areas: bucket.areas.slice(), stations: bucket.stations.slice(),
        reasons: bucket.reasons.slice()
      };
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      shape: shape,
      substantive: substantive, substantiveCount: substantive.length,
      withheldCount: withheld.length,
      /* Was die Verdichtung einspart, in einer Zahl - damit die Wirkung
         messbar ist und nicht behauptet. */
      noticesBefore: withheld.length, noticesAfter: groups.length,
      groups: groups
    };
  }

  /* ----------------------------------------------------------------------
     WAS GEHALTVOLL IST - EINMAL FESTGELEGT, FUER DIE SEITE UND FUER DIE
     MESSUNG.

     Diese Funktion ist der Grund, warum das Modul existiert und nicht zwei
     Kopien der Regel in Oberflaeche und Messskript stehen. Sie liest die
     Antworten der Dienste, wie sie sind, und entscheidet je Station nur
     eines: steht dort mindestens ein konkreter Wert?

     Eine Quelle, die der Aufrufer nicht uebergibt, erzeugt keine Station -
     `"patterns" in sources` unterscheidet "nicht gefragt" von "gefragt und
     nichts bekommen". Die Aktienseite fragt acht Stationen, die Messung
     alle elf; beide bekommen dieselben Urteile.
     ---------------------------------------------------------------------- */
  function faktorZahlen(row) {
    if (!row) return { available: 0, total: 0 };
    var prefix = null, total = 0, available = 0;
    for (var key in row) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      var m = /^(.*\.)availableFactors$/.exec(key);
      if (m) { prefix = m[1]; available = zahl(row[key]) === null ? 0 : row[key]; }
    }
    if (prefix) {
      for (var k2 in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k2)) continue;
        if (k2.indexOf(prefix) === 0 && k2 !== prefix + "availableFactors") total += 1;
      }
    }
    return { available: available, total: total };
  }

  function stationsFrom(sources) {
    var src = sources || {}, hat = function (name) {
      return Object.prototype.hasOwnProperty.call(src, name);
    };
    var out = {};
    if (hat("stock")) {
      var s = src.stock || {};
      var preis = s.price && zahl(s.price.value) !== null;
      out.identity = { substantive: !!preis, reason: s.reason || "SOURCE_MISSING", detail: {} };
      var bars = (s.chart && s.chart.bars) || [];
      out.chart = { substantive: !!(s.chart && s.chart.state === "AVAILABLE" && bars.length > 1),
                    reason: (s.chart && s.chart.reason) || "SOURCE_MISSING", detail: {} };
      var metriken = [], fam = (s.quant && s.quant.families) || [];
      for (var f = 0; f < fam.length; f++) metriken = metriken.concat(fam[f].metrics || []);
      var daMetriken = metriken.filter(function (m) { return m.state === "AVAILABLE"; });
      var ersterGrund = null;
      for (var mi = 0; mi < metriken.length; mi++) {
        if (metriken[mi].state !== "AVAILABLE" && metriken[mi].reason) { ersterGrund = metriken[mi].reason; break; }
      }
      out.business = { substantive: daMetriken.length > 0,
        reason: ersterGrund || (s.quant && s.quant.reason) || "INPUT_NOT_MATERIALIZED",
        detail: { available: daMetriken.length, total: metriken.length } };
    }
    if (hat("evidenceRow")) {
      var zahlen = faktorZahlen(src.evidenceRow);
      out.factorStrength = { substantive: zahl(zahlen.available) !== null && zahlen.available > 0,
        reason: src.evidenceRow ? "INPUT_NOT_MATERIALIZED" : "NOT_COVERED_BY_FACTOR_EVIDENCE",
        detail: zahlen.total ? zahlen : {} };
    }
    if (hat("factors")) {
      var fe = src.factors || {}, items = (fe.change && fe.change.items) || [];
      var vergleichbar = items.filter(function (i) { return i.state === "AVAILABLE"; });
      out.change = { substantive: vergleichbar.length > 0,
        reason: fe.state === "AVAILABLE" ? "NO_COMPARABLE_OBSERVATION" : (fe.reason || "NO_COMPARABLE_OBSERVATION"),
        detail: items.length ? { available: vergleichbar.length, total: items.length } : {} };
      /* Die Quant-Ansicht hat keine Screening-Zeile in der Hand, sondern die
         Faktor-Evidenz des Titels selbst. Dieselbe Frage, andere Quelle:
         wie viele der Faktoren tragen einen Wert? */
      if (!hat("evidenceRow")) {
        var faktoren = fe.factors || [];
        var mitWert = faktoren.filter(function (f) { return f.state === "AVAILABLE"; });
        out.factorStrength = { substantive: mitWert.length > 0,
          reason: fe.state === "AVAILABLE" ? "INPUT_NOT_MATERIALIZED" : (fe.reason || "NOT_COVERED_BY_FACTOR_EVIDENCE"),
          detail: faktoren.length ? { available: mitWert.length, total: faktoren.length } : {} };
      }
    }
    if (hat("setup")) {
      var sp = src.setup || {};
      var grund = (sp.unavailability && sp.unavailability.reason) || sp.reason || "UNAVAILABLE";
      var detail = sp.unavailability || {};
      out.setup = { substantive: sp.state === "AVAILABLE", reason: grund, detail: detail };
      out.setupChange = { substantive: sp.state === "AVAILABLE" && !!sp.cascade,
        reason: sp.state === "AVAILABLE" ? (sp.cascadeReason || "SETUP_ROW_NOT_IN_ARTIFACT") : grund,
        detail: detail };
    }
    if (hat("patterns")) {
      var pm = src.patterns || {};
      out.patterns = { substantive: pm.state === "AVAILABLE",
        reason: (pm.unavailability && pm.unavailability.reason) || pm.reason || "UNAVAILABLE",
        detail: pm.unavailability || {} };
    }
    if (hat("match")) {
      var sm = src.match || {};
      out.strategy = { substantive: sm.state === "AVAILABLE", reason: sm.reason || "UNAVAILABLE", detail: {} };
    }
    if (hat("assignmentChange")) {
      out.assignmentChange = { substantive: !!src.assignmentChange,
        reason: "NO_SECOND_PUBLISHED_STATE", detail: {} };
    }
    if (hat("technical")) {
      var ti = src.technical || {};
      out.technical = { substantive: ti.state === "AVAILABLE",
        reason: (ti.unavailability && ti.unavailability.reason) || ti.reason || "UNAVAILABLE",
        detail: ti.unavailability || {} };
    }
    return out;
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    stationsFrom: stationsFrom,
    STATIONS: STATIONS.slice(),
    AREA: AREA,
    CAUSES: CAUSES.map(function (c) { return { id: c.id, codes: c.codes.slice(), headline: c.headline }; }),
    MAX_WITHHELD_IN_FULL: MAX_WITHHELD_IN_FULL,
    MINIMAL_MAX_SUBSTANTIVE: MINIMAL_MAX_SUBSTANTIVE,
    knows: function (code) { return !!CAUSE_BY_CODE[code]; },
    causeIdFor: function (code) { return (CAUSE_BY_CODE[code] || { id: "OTHER" }).id; },
    assess: assess
  };

  if (isNode) module.exports = api;
  else global.VUJourneyShape = api;
})(typeof window !== "undefined" ? window : globalThis);
