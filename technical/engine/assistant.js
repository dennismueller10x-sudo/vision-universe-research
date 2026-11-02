/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine/assistant.js
   ANALYSE-ASSISTENT (Master Completion 3.0, T1/T2; docs/technical/TECHNICAL_ASSISTANT.md)

   Fuehrt von einer Analysefrage zu passenden, gepruefen Kriterien. Der Assistent
   rechnet NICHTS selbst:
     - jedes Kriterium ist ein Filter aus technical-query.js (bzw. ein Vorlagen-Filter
       aus templates.js) und wird mit dessen Praedikat ausgewertet;
     - die Auswahl wird zu einer Vorlage im Format von templates.js zusammengesetzt und
       mit templates.js#evaluate eingeordnet (erfuellt / fast erfuellt / unvollstaendig,
       je Kriterium PASS / FAIL / UNKNOWN; unbekannt zaehlt nie als erfuellt);
     - Voraussetzung bleibt der aktuelle Kurs (fresh), wie bei jeder Vorlage.

   Je Analyseziel werden vier Ebenen getrennt ausgewiesen (Auftrag T1):
     METHOD    allgemein erklaerte Analyse- oder Handelsmethodik (Beschreibung, keine Aussage)
     CRITERIA  technisch messbare Suchkriterien (die Filter unten)
     OBSERVED  historisch untersuchte Beobachtung (Verweis auf vorhandene Auswertungen
               mit ihrer Einstufung; keine neue Zahl)
     EDGE      statistisch nachgewiesener Vorteil - fuer KEIN Ziel nachgewiesen
   Keine Trefferquoten, keine Renditen, keine Kauf- oder Verkaufssignale.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Q = isNode ? require("../../quant/engines/technical/technical-query.js") : global.VUTechnical.Query;
  var TPL = isNode ? require("./templates.js") : global.VUTechnical.Templates;

  var ASSISTANT_VERSION = "technical-assistant-1.0.0";
  var TRI = ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"];

  /* Die vier Ebenen (Reihenfolge = Anzeige). */
  var LEVELS = [
    { id: "METHOD", title: "Allgemein erklärte Methodik", short: "Methodik" },
    { id: "CRITERIA", title: "Messbare Suchkriterien", short: "Kriterien" },
    { id: "OBSERVED", title: "Historisch untersuchte Beobachtung", short: "Historie" },
    { id: "EDGE", title: "Statistisch nachgewiesener Vorteil", short: "Vorteil" }
  ];
  /* Gilt fuer jedes Ziel. Die Ansicht zeigt den Text als letzte Ebene. */
  var EDGE_TEXT = "Nicht nachgewiesen. Für keine Kombination dieses Assistenten ist ein Vorteil nach Kosten und außerhalb der untersuchten Stichprobe belegt. Die Treffer sind Kandidaten zum Ansehen, keine Kauf- oder Verkaufssignale.";
  var LIMITS = [
    "Die Treffer beschreiben den technischen Zustand am Stichtag. Sie sagen nichts über künftige Kurse.",
    "Historische Auswertungen beschreiben die Vergangenheit; sie lassen sich nicht in die Zukunft fortschreiben.",
    "Kosten, Ausführung, Unternehmenszahlen und Nachrichten sind nicht berücksichtigt.",
    "Mehr Kriterien bedeuten weniger Treffer, nicht automatisch bessere."
  ];

  function o(id, label, why, filter, on, term) { return { id: id, label: label, why: why, filter: filter, on: !!on, term: term || null }; }

  /*
   * Begriffe (Glossar). Jede Option kann auf einen Begriff verweisen; die Ansicht erklaert ihn
   * beim Kriterium. Kurz, ohne Fachjargon, ohne Wertung.
   */
  var TERMS = {
    sma: { title: "Gleitender Durchschnitt (SMA)", text: "Mittelwert der Schlusskurse der letzten n Tage, z. B. 50 oder 200. Liegt der Kurs darüber, zeigt der Trend in diesem Zeitraum eher nach oben." },
    adx: { title: "ADX", text: "Misst, wie ausgeprägt ein Trend ist (0–100), aber nicht seine Richtung. Werte über 25 gelten üblicherweise als ausgeprägter Trend." },
    rsRank: { title: "RS-Rang", text: "Relative Stärke: Rang der Kursentwicklung über 6 Monate im Vergleich zu allen aktuellen Aktien (0 = schwächste, 100 = stärkste)." },
    structure: { title: "Marktstruktur", text: "Abfolge der letzten Hochs und Tiefs. Höhere Hochs und höhere Tiefs heißen Aufwärtsstruktur." },
    breakout: { title: "Ausbruch", text: "Ein Schlusskurs jenseits einer zuvor erkannten Grenze, z. B. über einen Widerstand oder aus einer Seitwärtsrange. Bestätigt heißt: per Schlusskurs, nicht nur im Tagesverlauf." },
    relVol: { title: "Relatives Volumen", text: "Handelsvolumen des Tages im Verhältnis zum Median der letzten 20 Tage. 1,5 bedeutet: anderthalbmal so viel wie üblich." },
    roc: { title: "Kursänderung (ROC)", text: "Prozentuale Veränderung des Kurses über einen festen Zeitraum, z. B. 63 Handelstage (rund 3 Monate)." },
    macd: { title: "MACD-Histogramm", text: "Differenz zwischen MACD-Linie und Signallinie. Positiv heißt: Der kurzfristige Schwung ist zuletzt stärker als der längerfristige." },
    rsi: { title: "RSI", text: "Relative Strength Index (0–100). Über 70 gilt als überkauft, unter 30 als überverkauft – das sind Beschreibungen, keine Vorhersagen." },
    cross: { title: "Kreuzen der SMA 200", text: "Der Schlusskurs wechselt von unter nach über die 200-Tage-Linie. Die Zahl nennt, vor wie vielen Handelstagen das geschah." },
    reversal: { title: "Umkehrformation", text: "Chartformation, die nach einem Abwärtsverlauf eine Wende andeuten kann, z. B. Doppelboden oder umgekehrte Schulter-Kopf-Schulter. Bestätigt heißt: Ausbruch per Schlusskurs." },
    candle: { title: "Kerzenmuster", text: "Form einer oder weniger Tageskerzen (z. B. Hammer). Kerzenmuster beschreiben einzelne Tage und sind für sich allein wenig aussagekräftig." },
    squeeze: { title: "Bollinger-Enge", text: "Die Bollinger-Bänder liegen so eng wie selten zuvor (Breite im unteren 20-%-Bereich der eigenen Historie). Das beschreibt eine ruhige Phase, nicht die Richtung danach." },
    nr7: { title: "NR7 und Inside Bar", text: "NR7: engste Tagesspanne der letzten 7 Tage. Inside Bar: Hoch und Tief liegen innerhalb des Vortags. Beides beschreibt Ruhe im Kursverlauf." },
    contraction: { title: "Volatilitätskontraktion", text: "Formation, bei der die Rücksetzer nacheinander kleiner werden, während der Kurs über der SMA 50 bleibt." },
    chop: { title: "Choppiness Index", text: "Unterscheidet Trend und Seitwärtsphase (0–100). Über 61,8 gilt als seitwärts, unter 38,2 als Trendphase." },
    level: { title: "Unterstützung und Widerstand", text: "Kursbereiche, an denen der Kurs früher mehrfach gedreht hat. Das Chart Studio zeichnet die erkannten Niveaus als Schicht „Niveaus“." },
    high52: { title: "52-Wochen-Hoch und -Tief", text: "Höchster bzw. tiefster Kurs des letzten Jahres. Viele Marktteilnehmer beachten diese Marken, deshalb gelten sie oft als Widerstand bzw. Unterstützung." },
    trendline: { title: "Trendlinie und Seitwärtsrange", text: "Eine steigende Unterstützungslinie verbindet höhere Tiefs; eine Seitwärtsrange (Rechteck) ist ein waagerechter Korridor zwischen Unterstützung und Widerstand." },
    timeframe: { title: "Zeitrahmen", text: "Dieselbe Regel auf Tages-, Wochen- oder Monatskerzen. Woche und Monat zählen nur abgeschlossene Perioden; die laufende Woche fließt nicht ein." },
    combine: { title: "Kriterien kombinieren", text: "Alle gewählten Kriterien müssen erfüllt sein (UND). Jedes weitere Kriterium verkleinert die Trefferliste." }
  };

  /*
   * Analyseziele. options[].filter wie in templates.js (Abfragefilter oder { kind: "all" | "formationDirection" }).
   * evidence: Verweise auf vorhandene Auswertungen, nur mit IDs, die ein Test gegen die Artefakte prueft:
   *   signals    -> technical/data/signal-evidence.json (indicators[].id), reading darf nicht WITH_DIRECTION sein,
   *                 solange EDGE "nicht nachgewiesen" lautet
   *   formations -> technical/data/formation-evidence.json (types[].type)
   *   s4         -> S4-Studie (docs/technical/S4_TEMPLATE_STUDY.md), Einstufung RESEARCH_LIMITED
   */
  var GOALS = [
    { id: "trendfolge", icon: "trend", title: "Trendfolge", question: "Welche Aktien befinden sich in einem intakten Aufwärtstrend?",
      purpose: "Sucht Aktien, deren Kurs über den wichtigen Durchschnittslinien liegt und deren Trend ausgeprägt ist. Trendfolge setzt nicht auf eine Wende, sondern betrachtet bestehende Bewegungen.",
      method: "Trendfolge ist ein verbreiteter Ansatz: Man betrachtet Aktien, die bereits steigen, und prüft, ob Kurs und Durchschnittslinien in Aufwärtsordnung stehen. Ein Trend kann jederzeit enden; die Kriterien sagen nichts darüber, wie lange er hält.",
      options: [
        o("aboveSma50", "Kurs über SMA 50", "Der mittelfristige Trend zeigt nach oben.", { field: "aboveSma50", op: "is", value: true }, true, "sma"),
        o("aboveSma200", "Kurs über SMA 200", "Der langfristige Trend zeigt nach oben.", { field: "aboveSma200", op: "is", value: true }, true, "sma"),
        o("sma50AboveSma200", "SMA 50 über SMA 200", "Die Durchschnittslinien stehen in Aufwärtsordnung.", { field: "sma50AboveSma200", op: "is", value: true }, true, "sma"),
        o("adx25", "ADX 14 über 25", "Der Trend ist ausgeprägt (Stärke, nicht Richtung).", { field: "adx", op: "gt", value: 25 }, true, "adx"),
        o("sma200Rising", "SMA 200 steigt seit einem Monat", "Auch die langfristige Linie selbst zeigt nach oben.", { field: "sma200Rising", op: "is", value: true }, false, "sma"),
        o("structureBull", "Aufwärtsstruktur (höhere Hochs und Tiefs)", "Die Abfolge der Swings bestätigt den Trend.", { field: "structure", op: "in", value: ["BULLISH"] }, false, "structure"),
        o("rsRank70", "RS-Rang mindestens 70", "Die Aktie gehört über 6 Monate zum stärkeren Drittel.", { field: "rsRank", op: "gte", value: 70 }, false, "rsRank")
      ],
      sort: { field: "adx", dir: "desc" }, templates: ["trend", "uptrendBasic", "establishedUptrend"],
      evidence: { s4: ["establishedUptrend", "uptrendBasic", "aboveSma200"], signals: ["goldenCross", "crossAboveSma200"], formations: [],
        text: "Wochen-Näherungen von „Etablierter Aufwärtstrend“, „Aufwärtstrend, vereinfacht“ und „Über SMA 200“ sind historisch geprüft (1990–2026, S4): Ab 2016 zeigt keine davon einen Überschuss gegenüber dem S&P 500; Einstufung „Forschung, eingeschränkt“. Die Vorlage „Trendfolge“ mit ADX ist mangels langer Tagesdaten nicht historisch getestet." } },

    { id: "ausbruch", icon: "breakout", title: "Ausbruch", question: "Welche Aktien haben einen Widerstand oder eine Seitwärtsrange per Schlusskurs überwunden?",
      purpose: "Sucht bestätigte Ausbrüche über erkannte Widerstände oder aus Seitwärtsranges, auf Wunsch mit erhöhtem Volumen.",
      method: "Ausbruchsanalyse betrachtet den Moment, in dem der Kurs eine länger respektierte Grenze überwindet. Viele Ausbrüche scheitern und fallen in den alten Bereich zurück; das Volumen wird oft als Bestätigung gelesen, ist aber keine Garantie.",
      options: [
        o("breakoutConfirmed", "Bestätigter Ausbruch über Widerstand oder aus einer Range", "Ein Schlusskurs lag über der erkannten Grenze.", { field: "formationConfirmed", op: "in", value: ["RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"] }, true, "breakout"),
        o("relVol15", "Relatives Volumen mindestens 1,5", "Am Stichtag wurde deutlich mehr gehandelt als üblich.", { field: "relVol", op: "gte", value: 1.5 }, true, "relVol"),
        o("newHigh20d", "Schluss über dem 20-Tage-Hoch", "Der Kurs schließt über dem höchsten Stand der letzten vier Wochen.", { field: "newHigh20d", op: "is", value: true }, false, "breakout"),
        o("triangleUp", "Dreieck mit bestätigtem Ausbruch nach oben", "Ein Schlusskurs lag über der oberen Dreieckslinie.", { field: "formationConfirmedUp", op: "in", value: TRI }, false, "breakout"),
        o("aboveSma200", "Kurs über SMA 200", "Der Ausbruch liegt in einem langfristigen Aufwärtstrend.", { field: "aboveSma200", op: "is", value: true }, false, "sma")
      ],
      sort: { field: "relVol", dir: "desc" }, templates: ["breakout", "triangleBreakoutUp", "high52"],
      evidence: { s4: ["high52w"], signals: ["donchianBreakUp"], formations: ["RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"],
        text: "Erkannte Ausbrüche sind über rund ein Marktjahr beschreibend ausgewertet (Methodik, Formations-Evidenz): wie oft sie sich bestätigten oder scheiterten. Der Schluss über dem 20-Tage-Hoch zeigt dort keinen gesicherten Unterschied zum Querschnitt. Eine lange historische Prüfung der Ausbruchs-Vorlage fehlt mangels langer Tagesdaten (S4)." } },

    { id: "momentum", icon: "pulse", title: "Momentum", question: "Welche Aktien entwickeln sich zuletzt stärker als der Gesamtmarkt?",
      purpose: "Sucht Aktien mit hoher relativer Stärke und positivem kurzfristigem Schwung.",
      method: "Momentum-Ansätze betrachten Aktien, die sich zuletzt besser entwickelt haben als andere. Starke Phasen können abrupt enden; hohe Werte beschreiben die Vergangenheit, nicht die Zukunft.",
      options: [
        o("rsRank80", "RS-Rang mindestens 80", "Die Aktie gehört über 6 Monate zum stärksten Fünftel.", { field: "rsRank", op: "gte", value: 80 }, true, "rsRank"),
        o("roc63pos", "Kursänderung über 3 Monate positiv", "Der Kurs liegt höher als vor 63 Handelstagen.", { field: "roc63", op: "gt", value: 0 }, true, "roc"),
        o("macdPos", "MACD-Histogramm positiv", "Der kurzfristige Schwung ist zuletzt stärker als der längerfristige.", { field: "macdPositive", op: "is", value: true }, true, "macd"),
        o("rsiNotOverbought", "RSI 14 unter 70", "Die Aktie gilt nicht als überkauft.", { field: "rsi14", op: "lt", value: 70 }, false, "rsi"),
        o("aboveSma50", "Kurs über SMA 50", "Der mittelfristige Trend zeigt nach oben.", { field: "aboveSma50", op: "is", value: true }, false, "sma")
      ],
      sort: { field: "rsRank", dir: "desc" }, templates: ["establishedUptrend", "high52", "uptrendBasic"],
      evidence: { s4: ["establishedUptrend", "high52w"], signals: ["macdCrossUp"], formations: [],
        text: "Die Wochen-Näherung mit RS-Rang (Etablierter Aufwärtstrend) und die 52-Wochen-Hochs sind historisch geprüft (S4): Ab 2016 kein Überschuss gegenüber dem S&P 500. Das Kreuzen der MACD-Signallinie zeigt über rund ein Marktjahr keinen gesicherten Unterschied zum Querschnitt." } },

    { id: "trendwende", icon: "reversal", title: "Trendwende", question: "Wo gibt es erste technische Hinweise auf eine Wende nach einem Rückgang?",
      purpose: "Sucht Aktien, die zuletzt über die 200-Tage-Linie gestiegen sind oder eine Umkehrformation bestätigt haben.",
      method: "Trendwenden-Analyse sucht frühe Anzeichen, dass ein Abwärtsverlauf endet. Solche Hinweise sind häufig und scheitern oft; erst weitere Bestätigungen machen eine Wende wahrscheinlicher, nie sicher.",
      options: [
        o("crossUp200", "Vor höchstens 10 Handelstagen über die SMA 200 gestiegen", "Der Kurs hat die langfristige Linie gerade von unten gekreuzt.", { field: "crossAboveSma200Days", op: "lte", value: 10 }, true, "cross"),
        o("macdPos", "MACD-Histogramm positiv", "Der kurzfristige Schwung hat gedreht.", { field: "macdPositive", op: "is", value: true }, true, "macd"),
        o("reversalUp", "Bestätigte Umkehrformation nach oben", "Doppelboden, umgekehrte Schulter-Kopf-Schulter oder fallender Keil mit Ausbruch nach oben.", { field: "formationConfirmedUp", op: "in", value: ["DOUBLE_BOTTOM", "INVERSE_HEAD_AND_SHOULDERS", "FALLING_WEDGE"] }, false, "reversal"),
        o("rsiExitOversold", "RSI vor höchstens 10 Tagen aus dem überverkauften Bereich", "Der RSI ist von unter 30 wieder darüber gestiegen.", { field: "rsiExitOversoldDays", op: "lte", value: 10 }, false, "rsi"),
        o("candleBull", "Bullisches Kerzenmuster am Stichtag", "Eine Kerze, die üblicherweise als Gegenbewegung gelesen wird.", { field: "candleBullish", op: "in", value: Q.field("candleBullish") ? Object.keys(Q.field("candleBullish").values) : [] }, false, "candle")
      ],
      sort: { field: "crossAboveSma200Days", dir: "asc" }, templates: ["aboveSma200"],
      evidence: { s4: [], signals: ["crossAboveSma200", "rsiExitOversold", "goldenCross"], formations: ["DOUBLE_BOTTOM", "INVERSE_HEAD_AND_SHOULDERS", "FALLING_WEDGE"],
        text: "Das Kreuzen der SMA 200 von unten, der RSI-Austritt aus dem überverkauften Bereich und das Golden Cross zeigen über rund ein Marktjahr keinen gesicherten Unterschied zum Querschnitt. Umkehrformationen sind beschreibend ausgewertet: Ein großer Teil wird innerhalb von 20 Tagen ungültig." } },

    { id: "ruhephase", icon: "bars", title: "Volatilität und Konsolidierung", question: "Welche Aktien bewegen sich gerade ungewöhnlich ruhig?",
      purpose: "Sucht ruhige Phasen mit enger Kursspanne. Solche Phasen gehen oft einer größeren Bewegung voraus – in welche Richtung, sagen die Kriterien nicht.",
      method: "Volatilitäts- und Konsolidierungsanalyse betrachtet Phasen, in denen sich der Kurs kaum bewegt. Die Richtung der folgenden Bewegung ist offen; deshalb wird Ruhe oft mit einem Trendfilter kombiniert.",
      options: [
        o("bbSqueeze", "Bollinger-Enge", "Die Bänder liegen so eng wie selten zuvor.", { field: "bbSqueeze", op: "is", value: true }, true, "squeeze"),
        o("contraction", "Volatilitätskontraktion erkannt", "Die Rücksetzer werden nacheinander kleiner.", { field: "formationActive", op: "in", value: ["VOLATILITY_CONTRACTION"] }, false, "contraction"),
        o("nr7", "NR7 (engste Tagesspanne seit 7 Tagen)", "Der Stichtag hatte die kleinste Spanne der letzten sieben Tage.", { field: "nr7", op: "is", value: true }, false, "nr7"),
        o("insideBar", "Inside Bar", "Hoch und Tief liegen innerhalb des Vortags.", { field: "insideBar", op: "is", value: true }, false, "nr7"),
        o("choppy", "Choppiness Index über 61,8", "Der Kurs bewegt sich eher seitwärts als im Trend.", { field: "choppiness14", op: "gt", value: 61.8 }, false, "chop"),
        o("aboveSma200", "Kurs über SMA 200", "Die Ruhephase liegt in einem langfristigen Aufwärtstrend.", { field: "aboveSma200", op: "is", value: true }, true, "sma")
      ],
      sort: { field: "distHigh52w", dir: "desc" }, templates: ["contraction", "triangleOpenUptrend", "bullflag"],
      evidence: { s4: [], signals: ["bollingerAboveUpper"], formations: ["VOLATILITY_CONTRACTION", "SYMMETRICAL_TRIANGLE"],
        text: "Volatilitätskontraktionen und Dreiecke sind über rund ein Marktjahr beschreibend ausgewertet (Methodik): wie oft sie sich bestätigten oder scheiterten. Eine lange historische Prüfung fehlt mangels langer Tagesdaten (S4)." } },

    { id: "niveaus", icon: "trophy", title: "Unterstützung und Widerstand", question: "Welche Aktien stehen nahe an wichtigen Kursmarken?",
      purpose: "Sucht Aktien nahe am 52-Wochen-Hoch, in einer Seitwärtsrange oder an einer steigenden Unterstützungslinie. Die genauen Niveaus zeigt das Chart Studio.",
      method: "Die Analyse von Unterstützung und Widerstand betrachtet Kursbereiche, an denen der Kurs früher gedreht hat. Solche Marken können halten oder durchbrochen werden; sie sind Orientierung, kein Versprechen.",
      options: [
        o("nearHigh5", "Höchstens 5 % unter dem 52-Wochen-Hoch", "Der Kurs steht nahe am wichtigsten Widerstand des letzten Jahres.", { field: "distHigh52w", op: "gte", value: -0.05 }, true, "high52"),
        o("rectangle", "Seitwärtsrange (Rechteck) erkannt", "Der Kurs pendelt zwischen einer waagerechten Unterstützung und einem Widerstand.", { field: "formationActive", op: "in", value: ["RECTANGLE"] }, false, "trendline"),
        o("supportLine", "Steigende Unterstützungslinie erkannt", "Höhere Tiefs lassen sich mit einer Linie verbinden.", { field: "formationActive", op: "in", value: ["SUPPORT_TRENDLINE"] }, false, "trendline"),
        o("aboveSma200", "Kurs über SMA 200", "Die Marke liegt in einem langfristigen Aufwärtstrend.", { field: "aboveSma200", op: "is", value: true }, true, "sma")
      ],
      sort: { field: "distHigh52w", dir: "desc" }, templates: ["high52", "high200w", "breakout"],
      evidence: { s4: ["high52w", "high200w"], signals: [], formations: ["RECTANGLE", "SUPPORT_TRENDLINE", "RESISTANCE_TRENDLINE"],
        text: "Neue 52- und 200-Wochen-Hochs sind historisch geprüft (S4): Ab 2016 kein Überschuss gegenüber dem S&P 500. Seitwärtsranges und Trendlinien sind über rund ein Marktjahr beschreibend ausgewertet (Methodik)." } },

    { id: "zeitrahmen", icon: "clock", title: "Bestätigung über Zeitrahmen", question: "Zeigen Tages-, Wochen- und Monatschart in dieselbe Richtung?",
      purpose: "Prüft dieselbe Trendregel auf Tages-, Wochen- und Monatskerzen. Stimmen alle überein, ist das Bild über mehrere Zeiträume einheitlich.",
      method: "Bei der Multi-Timeframe-Analyse wird ein Befund auf mehreren Zeitrahmen geprüft. Ein übereinstimmendes Bild gilt als robuster beschrieben; über die Zukunft sagt auch das nichts.",
      options: [
        o("day", "Tag: Kurs über SMA 200", "Langfristiger Trend im Tageschart.", { field: "aboveSma200", op: "is", value: true }, true, "timeframe"),
        o("week", "Woche: Wochenschluss über der 40-Wochen-Linie", "Derselbe Befund auf abgeschlossenen Wochen.", { field: "aboveSma200", op: "is", value: true, tf: "1W" }, true, "timeframe"),
        o("month", "Monat: Monatsschluss über der 10-Monats-Linie", "Derselbe Befund auf abgeschlossenen Monaten.", { field: "aboveSma200", op: "is", value: true, tf: "1M" }, true, "timeframe"),
        o("macdDay", "Tag: MACD-Histogramm positiv", "Kurzfristiger Schwung im Tageschart.", { field: "macdPositive", op: "is", value: true }, false, "macd"),
        o("macdWeek", "Woche: MACD-Histogramm positiv", "Kurzfristiger Schwung im Wochenchart.", { field: "macdPositive", op: "is", value: true, tf: "1W" }, false, "macd")
      ],
      sort: { field: "distSma200", dir: "desc" }, templates: ["aboveSma200", "high200w"],
      evidence: { s4: ["aboveSma200"], signals: ["crossAboveSma200"], formations: [],
        text: "Die Wochenregel „Über SMA 200“ ist historisch geprüft (S4): Ab 2016 kein Überschuss gegenüber dem S&P 500. Die Kombination mehrerer Zeitrahmen selbst ist nicht gesondert historisch untersucht." } },

    { id: "kombination", icon: "bars", title: "Kriterien kombinieren", question: "Ich möchte selbst mehrere technische Kriterien verbinden.",
      purpose: "Startet mit einem Trendkriterium; weitere Bausteine aus Trend, Stärke, Formation, Volumen und Ruhe lassen sich zu- und abschalten.",
      method: "Kombinationen verbinden Kriterien unterschiedlicher Art, z. B. Trend und Formation. Jedes Kriterium verkleinert die Trefferliste; dass eine Kombination besser ist als ihre Teile, ist damit nicht gezeigt.",
      options: [
        o("aboveSma200", "Kurs über SMA 200", "Der langfristige Trend zeigt nach oben.", { field: "aboveSma200", op: "is", value: true }, true, "sma"),
        o("rsRank70", "RS-Rang mindestens 70", "Die Aktie gehört über 6 Monate zum stärkeren Drittel.", { field: "rsRank", op: "gte", value: 70 }, false, "rsRank"),
        o("triangleOpen", "Offenes Dreieck (noch ohne Ausbruch)", "Die Kurse laufen zwischen zwei zusammenlaufenden Linien.", { field: "formationOpen", op: "in", value: TRI }, false, "trendline"),
        o("volAbove", "Volumen über Durchschnitt", "Am Stichtag wurde mehr gehandelt als üblich.", { field: "volAboveAvg", op: "is", value: true }, false, "relVol"),
        o("bbSqueeze", "Bollinger-Enge", "Die Bänder liegen so eng wie selten zuvor.", { field: "bbSqueeze", op: "is", value: true }, false, "squeeze"),
        o("adx25", "ADX 14 über 25", "Der Trend ist ausgeprägt (Stärke, nicht Richtung).", { field: "adx", op: "gt", value: 25 }, false, "adx")
      ],
      sort: { field: "rsRank", dir: "desc" }, templates: ["triangleOpenUptrend", "uptrendBasic"],
      evidence: { s4: [], signals: [], formations: [],
        text: "Selbst gewählte Kombinationen sind nicht historisch untersucht. Für einzelne Bausteine stehen die Auswertungen auf der Methodik-Seite." } }
  ];

  /* S4: Wochen-Naeherungen, die die Studie geprueft hat (Einstufung RESEARCH_LIMITED, S4_TEMPLATE_STUDY.md §2). */
  var S4_TESTED = ["establishedUptrend", "uptrendBasic", "aboveSma200", "high52w", "high200w"];
  var S4_RATING = "RESEARCH_LIMITED";

  function list() { return GOALS.slice(); }
  function get(id) { return GOALS.filter(function (g) { return g.id === id; })[0] || null; }
  function term(id) { return TERMS[id] || null; }
  /** Option nur anbieten, wenn ihr Feld im Abfragekatalog steht (z. B. Fachmodell-Felder) und der Zeitrahmen erlaubt ist. */
  function optionAvailable(x) {
    var f = x.filter; if (f.kind) return true;
    var fd = Q.field(f.field); return !!fd && (!f.tf || fd.tfs.indexOf(f.tf) >= 0);
  }
  function options(g) { return g.options.filter(optionAvailable); }
  function defaults(g) { return options(g).filter(function (x) { return x.on; }).map(function (x) { return x.id; }); }

  /** Auswahl aus der Adresse (k=a,b,c); ohne k die Voreinstellung; unbekannte IDs entfallen. */
  function selectionFromParam(g, v) {
    if (v === undefined || v === null) return defaults(g);
    var ids = options(g).map(function (x) { return x.id; }), out = [];
    String(v).split(",").forEach(function (k) { if (ids.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k); });
    /* Reihenfolge wie im Ziel, damit Adresse und Anzeige stabil sind. */
    return ids.filter(function (k) { return out.indexOf(k) >= 0; });
  }

  /**
   * Vorlage im Format von templates.js aus Ziel + Auswahl. null bei unbekanntem Ziel oder leerer Auswahl.
   * Ausgewertet wird sie ausschliesslich mit TPL.evaluate / TPL.checklist.
   */
  function build(goalId, selected) {
    var g = get(goalId); if (!g) return null;
    var sel = selected || defaults(g), crit = options(g).filter(function (x) { return sel.indexOf(x.id) >= 0; });
    if (!crit.length) return null;
    return { id: "ziel-" + g.id, goal: g.id, group: "assistant", icon: g.icon, title: g.title, summary: g.purpose, timeframe: "1D", sort: g.sort,
      criteria: crit.map(function (x) { return { id: x.id, label: x.label, why: x.why, filter: x.filter, term: x.term }; }) };
  }

  /** Adresse des Ziels; selected nur, wenn von der Voreinstellung abweichend. */
  function href(goalId, selected, show) {
    var g = get(goalId); if (!g) return "#/assistent";
    var q = [], def = defaults(g);
    if (selected && selected.join(",") !== def.join(",")) q.push("k=" + selected.join(","));
    if (show && show !== "voll") q.push("zeige=" + show);
    return "#/assistent/" + encodeURIComponent(g.id) + (q.length ? "?" + q.join("&") : "");
  }
  /** Parameter fuer Chart Studio und Screener (z=<Ziel>[&k=...]). */
  function paramsOf(goalId, selected) {
    var g = get(goalId), def = g ? defaults(g) : [];
    return "z=" + encodeURIComponent(goalId) + (selected && selected.join(",") !== def.join(",") ? "&k=" + selected.join(",") : "");
  }
  /** Aus Chart-Parametern (z, k) die zusammengesetzte Vorlage. */
  function fromParams(p) {
    var g = p && p.z ? get(p.z) : null; if (!g) return null;
    var sel = selectionFromParam(g, p.k);
    return { goal: g, selected: sel, template: build(g.id, sel) };
  }

  /** Abfrage fuer den Screener-Baukasten (sichtbar und bearbeitbar); nutzt templates.js#toQuery. */
  function toQuery(goalId, selected) { var t = build(goalId, selected); return t ? TPL.toQuery(t) : null; }

  /** Pruefung der Definitionen (Tests): eindeutige IDs, gueltige Filter, Begriffe vorhanden, keine Signal- oder Renditesprache. */
  var BANNED = /Kaufsignal|kaufen|verkaufen|Rendite|Gewinn|Chance|empfehl|garantiert|sicher(?:e|er|es)? (?:Treffer|Gewinn)|Trefferquote|Minervini|IBD|O'Neil|Prognose/i;
  function texts(g) {
    var out = [g.title, g.question, g.purpose, g.method, g.evidence.text];
    g.options.forEach(function (x) { out.push(x.label, x.why); });
    return out;
  }
  function validateAll() {
    var errors = [], ids = {};
    GOALS.forEach(function (g) {
      if (ids[g.id]) errors.push("DUP " + g.id); ids[g.id] = 1;
      if (!options(g).length) errors.push("NO_OPTIONS " + g.id);
      if (!defaults(g).length) errors.push("NO_DEFAULTS " + g.id);
      var oids = {};
      g.options.forEach(function (x) {
        if (oids[x.id]) errors.push("DUP_OPTION " + g.id + "/" + x.id); oids[x.id] = 1;
        if (x.term && !TERMS[x.term]) errors.push("TERM " + g.id + "/" + x.id);
        if (!optionAvailable(x)) errors.push("UNAVAILABLE " + g.id + "/" + x.id);
        if (x.filter.kind === "formationDirection") return;
        var fs = x.filter.kind === "all" ? x.filter.filters : [x.filter];
        if (fs.some(function (f) { return f.op === "in" && (!Array.isArray(f.value) || !f.value.length); })) { errors.push("EMPTY_IN " + g.id + "/" + x.id); return; }
        var v = Q.validate({ timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: fs }] });
        if (!v.ok) errors.push("FILTER " + g.id + "/" + x.id + " " + JSON.stringify(v.errors));
      });
      (g.templates || []).forEach(function (t) { if (!TPL.TEMPLATES.some(function (x) { return x.id === t; })) errors.push("TEMPLATE " + g.id + "/" + t); });
      (g.evidence.s4 || []).forEach(function (t) { if (S4_TESTED.indexOf(t) < 0) errors.push("S4 " + g.id + "/" + t); });
      texts(g).forEach(function (s) { if (BANNED.test(s || "")) errors.push("WORDING " + g.id + ": " + s); });
      if (g.sort && !Q.field(g.sort.field)) errors.push("SORT " + g.id);
    });
    Object.keys(TERMS).forEach(function (k) { if (BANNED.test(TERMS[k].text) || BANNED.test(TERMS[k].title)) errors.push("WORDING term " + k); });
    LIMITS.concat([EDGE_TEXT]).forEach(function (s) { if (/Rendite|Gewinn|empfehl|garantiert/i.test(s)) errors.push("WORDING limits"); });
    return errors;
  }

  var api = { ASSISTANT_VERSION: ASSISTANT_VERSION, LEVELS: LEVELS, EDGE_TEXT: EDGE_TEXT, LIMITS: LIMITS, TERMS: TERMS, GOALS: GOALS, S4_TESTED: S4_TESTED, S4_RATING: S4_RATING,
    list: list, get: get, term: term, options: options, defaults: defaults, selectionFromParam: selectionFromParam, build: build, href: href, paramsOf: paramsOf,
    fromParams: fromParams, toQuery: toQuery, validateAll: validateAll };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Assistant = api; }
})(typeof window !== "undefined" ? window : globalThis);
