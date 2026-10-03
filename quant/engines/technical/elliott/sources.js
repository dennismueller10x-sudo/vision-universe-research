/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/sources.js
   SOURCE-GROUNDED RULE MATRIX (Master Mission II, Addendum §1–§5)

   Eine Quelle der Wahrheit fuer Regelaudit, Profi-Ansicht und Dokumentation
   (docs/technical-intelligence/ELLIOTT_RULE_MATRIX.md wird hieraus erzeugt).

   Klassen
     HARD_RULE        Verletzung → Zaehlung UNGUELTIG (nie durch Scores kompensierbar)
     DEFINITION       Bestandteil der Musterdefinition; Verletzung → anderes Muster/ungueltig
     GUIDELINE        Richtlinie der Literatur; erhoeht/senkt nur die Plausibilitaet
     VU_OPERATIONAL   VU-Festlegung, wo die Literatur keinen Zahlenwert nennt (offen gekennzeichnet)
     VU_HEURISTIC     VU-Kriterium (Ingenieursentscheidung), keine Elliott-Regel
     VU_MEASUREMENT   gemessene Eigenschaft (Stabilitaet, Verzug), keine Elliott-Regel

   Quellenqualitaet
     A  Original bzw. Standardwerk der klassischen Schule
     B  Lehrwerk des Instituts derselben Schule
     V  Vision Universe (eigene Festlegung / Messung)

   Verifikation: Fundstellen auf Kapitel-/Abschnittsebene des Standardwerks. Der
   Volltext liegt nicht im Repository; die Domain des Verlags ist in der
   Arbeitsumgebung gesperrt. Seitenzahlen werden deshalb NICHT angegeben.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);

  var SOURCES = {
    EWP: { title: "A. J. Frost & R. R. Prechter, Elliott Wave Principle: Key to Market Behavior (10. Aufl., 2005)", quality: "A", role: "Standardwerk der klassischen Schule" },
    RNE: { title: "R. N. Elliott, The Wave Principle (1938); Nature's Law (1946)", quality: "A", role: "Original" },
    EWI: { title: "W. Gorman & J. Kennedy, Visual Guide to Elliott Wave Trading (EWI, 2013)", quality: "B", role: "Lehrwerk des Instituts (Zahlenwerte für Musterdefinitionen)" },
    VU: { title: "Vision Universe — eigene Festlegung bzw. Messung", quality: "V", role: "keine Elliott-Quelle" }
  };
  var VERIFICATION = "Kapitel-/Abschnittsebene; nicht gegen den Volltext geprüft";

  function m(cls, statement, src, locator, influence, note) { return { class: cls, statement: statement, source: src, locator: locator, influence: influence, note: note || null }; }
  var INVALIDATES = "Verletzung → Zählung ungültig (Muster wird verworfen)";
  var OPEN = "auf laufender Welle offen, solange noch erfüllbar";

  /** Regeln und Definitionen (Schluessel = ruleId ohne Praefix W_/Y_ bei Doppel-Zigzag). */
  var RULES = {
    ALTERNATING_DIRECTION: m("HARD_RULE", "Aufeinanderfolgende Wellen wechseln die Richtung", "EWP", "Kap. 1, Grundmuster (5 Wellen in Trendrichtung, 3 dagegen)", INVALIDATES),
    W2_NOT_BEYOND_W1_ORIGIN: m("HARD_RULE", "Welle 2 retraced nie mehr als 100 % von Welle 1", "EWP", "Kap. 1, Impulse — Regel 1", INVALIDATES),
    W3_BEYOND_W1_END: m("HARD_RULE", "Welle 3 läuft über das Ende von Welle 1 hinaus", "EWP", "Kap. 1, Impulse (Konstruktion der Motivwelle)", INVALIDATES + "; " + OPEN),
    W3_NOT_SHORTEST: m("HARD_RULE", "Welle 3 ist nie die kürzeste der Wellen 1, 3 und 5", "EWP", "Kap. 1, Impulse — Regel 2", INVALIDATES + "; " + OPEN),
    W4_NO_OVERLAP_W1: m("HARD_RULE", "Welle 4 betritt nie das Preisgebiet von Welle 1 (Impuls)", "EWP", "Kap. 1, Impulse — Regel 3", INVALIDATES),
    DIAGONAL_W4_OVERLAPS_W1: m("DEFINITION", "Diagonale: Welle 4 überlappt das Gebiet von Welle 1", "EWP", "Kap. 1, Diagonal Triangles (Leading/Ending)", "Definitionsmerkmal: ohne Überlappung keine Diagonale (Impuls-Lesart)"),
    DIAGONAL_W4_VS_W2: m("DEFINITION", "Keilform: kontrahierend W4 < W2, expandierend W4 > W2", "EWP", "Kap. 1, Diagonal Triangles (Keilform der Begrenzungslinien)", INVALIDATES),
    DIAGONAL_W5_VS_W3: m("DEFINITION", "Keilform: kontrahierend W5 < W3, expandierend W5 > W3", "EWP", "Kap. 1, Diagonal Triangles", INVALIDATES),
    W4_NOT_BEYOND_W3_ORIGIN: m("HARD_RULE", "Diagonale: Welle 4 retraced Welle 3 nicht vollständig", "EWP", "Kap. 1, Diagonal Triangles (Motivwelle schreitet voran)", INVALIDATES),
    B_NOT_BEYOND_A_ORIGIN: m("HARD_RULE", "Zigzag: Welle B retraced nie mehr als 100 % von Welle A", "EWP", "Kap. 1, Zigzags", INVALIDATES),
    ZIGZAG_B_BELOW_90PCT: m("DEFINITION", "Zigzag: B retraced weniger als 90 % von A (sonst Flat)", "EWI", "Musterdefinition Flat/Zigzag (Grenzwert 90 %)", "Klassengrenze Zigzag ↔ Flat", "EWP beschreibt die Grenze qualitativ („fast vollständig“); der Zahlenwert stammt aus dem EWI-Lehrwerk."),
    FLAT_B_AT_LEAST_90PCT: m("DEFINITION", "Flat: B retraced mindestens 90 % von A", "EWI", "Musterdefinition Flat (Grenzwert 90 %)", "Klassengrenze Flat ↔ Zigzag", "Zahlenwert aus dem EWI-Lehrwerk; EWP qualitativ."),
    FLAT_B_NOT_EXCESSIVE: m("VU_OPERATIONAL", "Flat: B höchstens 200 % von A", "VU", "VU-Betriebsgrenze; EWP Kap. 1 (Flats) nennt für expandierte Flats typische B von 123,6–138,2 %, aber keine Obergrenze", INVALIDATES, "Keine klassische Regel. Verhindert, dass ein neuer Trend als B-Welle gezählt wird."),
    TRIANGLE_BOUNDARIES: m("DEFINITION", "Dreieck: Extreme laufen zusammen (kontrahierend) oder auseinander (expandierend)", "EWP", "Kap. 1, Triangles", INVALIDATES, "Barrier-Toleranz von 5 % der A-Länge für D ist eine VU-Festlegung (Barrier-Dreieck)."),
    TRIANGLE_E_INSIDE: m("HARD_RULE", "Dreieck: Welle E endet innerhalb der Begrenzung", "EWP", "Kap. 1, Triangles", INVALIDATES),
    WXY_W_IS_THREE: m("DEFINITION", "Kombination: W unterteilt sich in drei Wellen", "EWP", "Kap. 1, Combinations (Double Three)", INVALIDATES),
    WXY_Y_IS_THREE: m("DEFINITION", "Kombination: Y unterteilt sich in drei Wellen", "EWP", "Kap. 1, Combinations (Double Three)", INVALIDATES),
    X_NOT_BEYOND_W_ORIGIN: m("DEFINITION", "Kombination: X retraced nie mehr als 100 % von W", "EWP", "Kap. 1, Combinations / Double Zigzags", INVALIDATES, "Operationalisierung: über den W-Ursprung hinaus wäre die Korrektur beendet."),
    Y_BEYOND_W_END: m("DEFINITION", "Doppel-/Dreifach-Zigzag: Y läuft über das Ende von W hinaus", "EWP", "Kap. 1, Double and Triple Zigzags (jeder Zigzag schreitet voran)", INVALIDATES + "; " + OPEN),
    X2_NOT_BEYOND_Y_ORIGIN: m("DEFINITION", "Dreifach-Zigzag: das zweite X retraced Y nicht vollständig", "EWP", "Kap. 1, Double and Triple Zigzags", INVALIDATES, "Operationalisierung analog zum ersten X."),
    Z_BEYOND_Y_END: m("DEFINITION", "Dreifach-Zigzag: Z läuft über das Ende von Y hinaus", "EWP", "Kap. 1, Double and Triple Zigzags", INVALIDATES + "; " + OPEN),
    TZ_W_IS_THREE: m("DEFINITION", "Dreifach-Zigzag: W unterteilt sich als Zigzag (drei Wellen 5-3-5)", "EWP", "Kap. 1, Double and Triple Zigzags", INVALIDATES),
    TZ_Y_IS_THREE: m("DEFINITION", "Dreifach-Zigzag: Y unterteilt sich als Zigzag (drei Wellen 5-3-5)", "EWP", "Kap. 1, Double and Triple Zigzags", INVALIDATES),
    TZ_Z_IS_THREE: m("DEFINITION", "Dreifach-Zigzag: Z unterteilt sich als Zigzag (drei Wellen 5-3-5)", "EWP", "Kap. 1, Double and Triple Zigzags", INVALIDATES)
  };

  /** Richtlinien (Schluessel = Guideline-Key ohne Praefix W_/Y_). Einfluss: Mittelwert aller Richtlinien → Richtlinienpassung. */
  var GL = "erhöht/senkt nur die Richtlinienpassung (Rang, Count Quality); nie Gültigkeit";
  var GUIDELINES = {
    W2_RETRACEMENT: m("GUIDELINE", "Welle 2 retraced typisch 50–61,8 % von Welle 1", "EWP", "Kap. 4, Ratio Analysis (Retracements)", GL),
    W3_EXTENSION: m("GUIDELINE", "Welle 3 häufig 1,618–2,618 × Welle 1", "EWP", "Kap. 4, Ratio Analysis (Multiples)", GL),
    W4_RETRACEMENT: m("GUIDELINE", "Welle 4 retraced typisch 23,6–38,2 % von Welle 3", "EWP", "Kap. 2, Depth of Corrective Waves; Kap. 4", GL),
    ALTERNATION: m("GUIDELINE", "Wellen 2 und 4 alternieren (Tiefe, Dauer, Form)", "EWP", "Kap. 2, Alternation", GL, "Umgesetzt: Tiefe und Dauer; Form (scharf/seitwärts) nicht."),
    W5_PROPORTION: m("GUIDELINE", "Bei verlängerter Welle 3 tendieren Wellen 1 und 5 zur Gleichheit", "EWP", "Kap. 2, Wave Equality", GL),
    EXTENSION_IN_ONE: m("GUIDELINE", "Meist ist genau eine der Wellen 1, 3, 5 verlängert", "EWP", "Kap. 1, Extension", GL),
    NO_TRUNCATION: m("GUIDELINE", "Welle 5 endet meist jenseits von Welle 3 (Truncation zulässig, aber selten)", "EWP", "Kap. 1, Truncation", GL),
    CHANNEL: m("GUIDELINE", "Welle 5 endet nahe der Parallelen zur 2-4-Linie durch Welle 3", "EWP", "Kap. 2, Channeling", GL),
    W3_MOMENTUM: m("GUIDELINE", "Welle 3 ist meist die dynamischste", "EWP", "Kap. 2, Wave Personality", GL),
    W3_VOLUME: m("GUIDELINE", "Volumen in Welle 3 meist höher als in Welle 1", "EWP", "Kap. 2, Volume", GL, "Nur mit Volumendaten (Wochenschluss-Reihen: entfällt)."),
    W2_DEEP: m("GUIDELINE", "Diagonale: Welle 2 retraced tief (typ. 66–81 %)", "EWP", "Kap. 1, Diagonal Triangles; Kap. 4", GL),
    W4_DEEP: m("GUIDELINE", "Diagonale: Welle 4 retraced tief (typ. 66–81 %)", "EWP", "Kap. 1, Diagonal Triangles; Kap. 4", GL),
    THROW_OVER: m("GUIDELINE", "Diagonale: Welle 5 endet meist jenseits Welle 3 (Throw-over)", "EWP", "Kap. 2, Throw-over", GL),
    B_RETRACEMENT: m("GUIDELINE", "Zigzag: B retraced typisch 38,2–78,6 % von A", "EWP", "Kap. 4, Ratio Analysis (Corrective Waves)", GL),
    C_BEYOND_A_END: m("GUIDELINE", "C endet (fast immer) jenseits des A-Endes", "EWP", "Kap. 1, Zigzags/Flats", GL, "Literatur: „fast immer“ — deshalb Richtlinie, nicht Regel."),
    C_PROPORTION: m("GUIDELINE", "C ≈ A (oder 1,618 bzw. 0,618 × A)", "EWP", "Kap. 4, Ratio Analysis (Zigzags/Flats)", GL),
    B_PROPORTION: m("GUIDELINE", "Flat: B 90–138,2 % von A", "EWP", "Kap. 1, Flats; Kap. 4", GL),
    LEG_RATIOS: m("GUIDELINE", "Dreieck: Folgewellen ≈ 0,618 der Vorwelle", "EWP", "Kap. 4, Triangles", GL),
    EXPANDING_RARE: m("GUIDELINE", "Expandierende Dreiecke sind selten", "EWP", "Kap. 1, Triangles", GL),
    X_PROPORTION: m("GUIDELINE", "Verbindungswelle X typisch 38,2–78,6 %", "EWP", "Kap. 1, Combinations", GL),
    Y_PROPORTION: m("GUIDELINE", "Y ≈ W (0,618–1,618)", "EWP", "Kap. 4, Ratio Analysis", GL),
    Z_PROPORTION: m("GUIDELINE", "Z ≈ Y (0,618–1,618)", "EWP", "Kap. 4, Ratio Analysis", GL)
  };

  /** Bestandteile der Count Quality und weitere Audit-Dimensionen — mit Klasse und Begruendung der Gewichte. */
  var CRITERIA = {
    guidelines: m("GUIDELINE", "Richtlinienpassung (Mittel der Richtlinien oben)", "EWP", "Kap. 2 und 4", "Gewicht 0,25: Hauptinhalt der Lehrbuch-Plausibilität"),
    subdivision: m("DEFINITION", "Unterteilung 5-3 auf dem nächstfeineren Grad", "EWP", "Kap. 1, Essential Design / Degree", "Gewicht 0,15: Definition, aber nur so gut wie die Auflösung der feineren Skala (oft „nicht aufgelöst“ = 0,5)", "Messung über VU-Pivotskalen."),
    higherDegree: m("DEFINITION", "Verschachtelung: passt in die enthaltende Welle des höheren Grades", "EWP", "Kap. 1, Degree", "Gewicht 0,20: Grad-Konsistenz ist für Praktiker zentral", "Formalisierung `nestedFit` ist VU-Umsetzung."),
    proportion: m("GUIDELINE", "Zeitproportion benachbarter Wellen", "EWP", "Kap. 2, „Right Look“/Proportion", "Gewicht 0,15", "Formalisierung (Dauer-Verhältnis 0,382–2,618) ist VU-Festlegung."),
    personality: m("GUIDELINE", "Wellencharakter: Welle 5 mit nachlassendem Momentum", "EWP", "Kap. 2, Wave Personality", "Gewicht 0,10: qualitative Literatur, schwache Formalisierung (RSI-Divergenz)"),
    clarity: m("VU_HEURISTIC", "Eindeutigkeit: Rangabstand zur besten materiell anderen Lesart", "VU", "—", "Gewicht 0,15: Praktiker arbeiten mit Alternativen; eine knapp führende Lesart ist schwächer"),
    priceSimilarity: m("GUIDELINE", "Preisproportion gleicher Grade (benachbarte Wellen nicht kleiner als 1/3)", "EWP", "Kap. 2, „Right Look“", "nur Audit (kein Gewicht): nach dem Einfrieren der Count Quality ergänzt", "NEoWave (Neely) macht daraus eine Regel; VU nutzt sie nicht als Regel (andere Schule)."),
    signalToNoise: m("VU_HEURISTIC", "Schwünge deutlich größer als die Umkehrschwelle (≥ 1,6)", "VU", "—", "Anwendbarkeit; unter 1,6 Enthaltung"),
    historyCoverage: m("VU_HEURISTIC", "Anteil der Kurshistorie, die sich als Elliott-Struktur lesen lässt", "VU", "—", "Anwendbarkeit"),
    stability: m("VU_MEASUREMENT", "Neuzuordnungen in den letzten 26 Schritten", "VU", "—", "nur Audit/Anzeige (Neuzuordnungs-Risiko)"),
    latency: m("VU_MEASUREMENT", "Erkennungsverzug der jüngsten Welle", "VU", "—", "nur Audit/Anzeige")
  };

  function baseId(id) { return String(id).replace(/^(W_|Y_)/, ""); }
  function ruleMeta(id) { return RULES[id] || RULES[baseId(id)] || null; }
  function guidelineMeta(id) { return GUIDELINES[id] || GUIDELINES[baseId(id)] || null; }

  var api = { SOURCES: SOURCES, VERIFICATION: VERIFICATION, RULES: RULES, GUIDELINES: GUIDELINES, CRITERIA: CRITERIA, ruleMeta: ruleMeta, guidelineMeta: guidelineMeta, baseId: baseId };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottSources = api; }
})(typeof window !== "undefined" ? window : globalThis);
