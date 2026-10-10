/* =========================================================================
   VISION UNIVERSE TECHNICAL — projection/elliott-projection.js
   ELLIOTT PROJECTION ENGINE (elliott-projection-1.0.0)

   Sitzt AUF der eingefrorenen Elliott-Ausgabe (elliott-3.2.2, Regelwerk
   elliott-rules-3.1.0) und aendert sie nicht. Eingabe ist die veroeffentlichte
   Form `pro.elliott` (Shard bzw. slim() im Build) — dieselbe Zaehlung, die der
   Kunde sieht. Keine Pivot-Suche, kein Ranking, keine Enthaltung: das alles
   bleibt in der Engine.

   Was dieses Modul tut:
     1. Thesen aus Primaerzaehlung, hoeherem Grad (nur Motivwellen 3/5) und
        Alternativen bilden (keine erfundenen Zaehlungen).
     2. Projektionsleiter BASIS / ERWEITERT / EXTREM je Thesentyp aus
        festen Verhaeltnisbaendern (RELATIONSHIPS, jede mit Quelle und Klasse).
     3. Invalidation (harte Regel bzw. Musterende der Engine), Bestaetigungs-
        niveau, Deckel (W3 nie die kuerzeste, Diagonal-Keilform), Truncation.
     4. Fahrplan "Was als Naechstes passieren muss": Elliott-Anforderung
        getrennt von VU-Bestaetigung (Trend, Relative Staerke, Marktstruktur,
        Volumen, hoehere Zeitebene).
     5. Leitplanken gegen Datenfehler (tote Reihen, Split-Spruenge, negative
        oder nicht endliche Preise, unplausible Groessenordnung).
     6. Lebenszyklus (advanceLifecycle): eingefrorene Revisionen, nur
        anhaengende Ereignisse — Zonen werden nie nachtraeglich verschoben.

   PROJEKTION ≠ WAHRSCHEINLICHKEIT. Prozentangaben sind reine Arithmetik
   (Zonengrenze / Kurs − 1). Kein Feld dieses Moduls ist eine Trefferquote.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Patterns = isNode ? require("../elliott/patterns.js") : (global.VUTechnical && global.VUTechnical.ElliottPatterns);

  var VERSION = "elliott-projection-1.2.0";   // 1.2.0: Explore Elliott (weitere regelkonforme Lesarten, eingeklappt), Split-Aufloesung per Kapitalmassnahmen-Beleg, Rollenwechsel im Lebenszyklus; Formeln unveraendert
                                               // 1.1.0: Motiv-Alternative aus dem Kandidatenpool der Engine (nur Produkt-Sichtbarkeit, Formeln unveraendert)
  var SCHEMA = "vu-elliott-projection-1.0.0";
  var EWP = "EWP", EWI = "EWI", VU = "VU";
  var MAX_MULTIPLE = 1000;   // Zone > 1000 × Kurs (+99.900 %) gilt als Datenfehler, nicht als Projektion

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }
  /** Preise mit relativer Genauigkeit (auch Kurse unter einem Cent bleiben exakt genug). */
  function rp(v) { return isNum(v) ? Number(v.toPrecision(8)) : null; }

  // =====================================================================
  //  BEZIEHUNGEN (Quelle, Klasse, Formel) — eine Quelle der Wahrheit
  // =====================================================================
  /* Klassen:
       PROJECTION_RELATIONSHIP  Verhaeltnis, das die Literatur als typische Projektion nennt
       GUIDELINE                Richtlinienband des eingefrorenen Regelwerks (patterns.js)
       VU_OPERATIONAL           VU-Festlegung, wo die Literatur keinen Zahlenwert nennt (offen gekennzeichnet)
     Fundstellen auf Kapitelebene (wie quant/engines/technical/elliott/sources.js). */
  function rel(cls, source, locator, formula, statement, guideline) { return { class: cls, source: source, locator: locator, formula: formula, statement: statement, guideline: guideline || null }; }
  var RELATIONSHIPS = {
    W3_BASE: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis (Multiples)", "W3 = 1,0–1,618 × W1 ab Ende W2", "Welle 3 mindestens so lang wie Welle 1, bis zum Goldenen Schnitt", "W3_EXTENSION (akzeptables Band 1,0–4,236, unterer Teil)"),
    W3_EXTENDED: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis (Multiples); Kap. 1, Extension", "W3 = 1,618–2,618 × W1 ab Ende W2", "Verlängerte Welle 3 – typisches Band der Literatur", "W3_EXTENSION (ideales Band 1,618–2,618)"),
    W3_EXTREME: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis (Multiples)", "W3 = 2,618–4,236 × W1 ab Ende W2", "Außergewöhnlich verlängerte Welle 3 – oberer Rand des zulässigen Bandes", "W3_EXTENSION (akzeptables Band, oberer Teil)"),
    DIAG_W3_BASE: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 1, Diagonal Triangles; Kap. 4", "W3 = 0,618–1,0 × W1 ab Ende W2", "Kontrahierende Diagonale: Welle 3 kürzer als Welle 1"),
    DIAG_W3_EXTENDED: rel("VU_OPERATIONAL", VU, "Fibonacci-Folge fortgesetzt; Keilform expandierend (EWP Kap. 1)", "W3 = 1,0–1,618 × W1 ab Ende W2", "Expandierende Diagonale: Welle 3 länger als Welle 1"),
    W5_BASE: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis; Kap. 2, Wave Equality", "W5 = 0,618–1,0 × W1 ab Ende W4", "Welle 5 tendiert zu Gleichheit mit Welle 1 oder 0,618 davon", "W5_PROPORTION"),
    W5_EXTENDED: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 4, Ratio Analysis (Multiples); Kap. 1, Extension", "W5 = 1,0–1,618 × W1 ab Ende W4", "Verlängerte Welle 5 bis 1,618 × Welle 1"),
    W5_EXTREME: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 4, Ratio Analysis (Multiples)", "W5 = 1,0–1,618 × Strecke W1-Anfang bis W3-Ende, ab Ende W4", "Verlängerte Welle 5: bis 1,618 × Netto-Strecke der Wellen 1 bis 3"),
    DIAG_W5_CONTRACTING: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 1, Diagonal Triangles (Keilform)", "W5 = 0,618–1,0 × W3 ab Ende W4 (kürzer als W3)", "Kontrahierende Diagonale: Welle 5 kürzer als Welle 3"),
    DIAG_W5_EXPANDING_BASE: rel("VU_OPERATIONAL", VU, "Keilform expandierend (EWP Kap. 1); Band = Fibonacci-Folge", "W5 = 1,0–1,618 × W3 ab Ende W4", "Expandierende Diagonale: Welle 5 länger als Welle 3"),
    DIAG_W5_EXPANDING_EXTENDED: rel("VU_OPERATIONAL", VU, "Fibonacci-Folge fortgesetzt", "W5 = 1,618–2,618 × W3 ab Ende W4", "Expandierende Diagonale, weit verlängerte Welle 5"),
    C_ZIGZAG_BASE: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis (Zigzags)", "C = 0,618–1,0 × A ab Ende B", "Welle C bis Gleichheit mit Welle A", "C_PROPORTION"),
    C_ZIGZAG_EXTENDED: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis (Zigzags)", "C = 1,0–1,618 × A ab Ende B", "Verlängerte Welle C bis 1,618 × Welle A", "C_PROPORTION"),
    C_ZIGZAG_EXTREME: rel("VU_OPERATIONAL", VU, "Fibonacci-Folge fortgesetzt (2,618)", "C = 1,618–2,618 × A ab Ende B", "Außergewöhnlich verlängerte Welle C"),
    C_FLAT_REGULAR_BASE: rel("GUIDELINE", EWP, "Kap. 1, Flats; Kap. 4", "C = 1,0–1,236 × A ab Ende B", "Reguläre Flat: C etwa so lang wie A", "C_PROPORTION (reguläre Flat, ideal)"),
    C_FLAT_REGULAR_EXTENDED: rel("GUIDELINE", EWP, "Kap. 1, Flats; Kap. 4", "C = 1,236–1,618 × A ab Ende B", "Reguläre Flat: C etwas länger als A", "C_PROPORTION (reguläre Flat, akzeptabel)"),
    C_FLAT_EXPANDED_BASE: rel("GUIDELINE", EWP, "Kap. 1, Flats (Expanded); Kap. 4", "C = 1,382–1,618 × A ab Ende B", "Expandierte Flat: C typisch 1,382–1,618 × A", "C_PROPORTION (expandierte Flat, ideal)"),
    C_FLAT_EXPANDED_EXTENDED: rel("GUIDELINE", EWP, "Kap. 1, Flats (Expanded); Kap. 4", "C = 1,618–2,618 × A ab Ende B", "Expandierte Flat: C bis 2,618 × A", "C_PROPORTION (expandierte Flat, akzeptabel)"),
    Y_BASE: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis", "Y = 0,618–1,0 × W ab Ende X", "Welle Y bis Gleichheit mit Welle W", "Y_PROPORTION"),
    Y_EXTENDED: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis", "Y = 1,0–1,618 × W ab Ende X", "Welle Y länger als W, bis 1,618 × W", "Y_PROPORTION (ideales Band)"),
    Y_EXTREME: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis", "Y = 1,618–2,618 × W ab Ende X", "Welle Y am oberen Rand des zulässigen Bandes", "Y_PROPORTION (akzeptables Band)"),
    Z_BASE: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis", "Z = 0,618–1,0 × Y ab Ende X₂", "Welle Z bis Gleichheit mit Welle Y", "Z_PROPORTION"),
    Z_EXTENDED: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis", "Z = 1,0–1,618 × Y ab Ende X₂", "Welle Z bis 1,618 × Welle Y", "Z_PROPORTION"),
    Z_EXTREME: rel("GUIDELINE", EWP, "Kap. 4, Ratio Analysis", "Z = 1,618–2,618 × Y ab Ende X₂", "Welle Z am oberen Rand des zulässigen Bandes", "Z_PROPORTION (akzeptables Band)"),
    NEXT_BASE: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 1 (Korrektur beendet → Trend setzt fort); Kap. 4, Retracements", "Rücklauf 0,618–1,0 × Korrekturlänge ab Korrekturende", "Rücklauf der Korrektur bis zu ihrem Ursprung"),
    NEXT_EXTENDED: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 4, Ratio Analysis (Multiples)", "1,0–1,618 × Korrekturlänge ab Korrekturende", "Über den Ursprung der Korrektur hinaus bis 1,618 × Korrekturlänge"),
    NEXT_EXTREME: rel("VU_OPERATIONAL", VU, "Fibonacci-Folge fortgesetzt (2,618)", "1,618–2,618 × Korrekturlänge ab Korrekturende", "Weit über den Ursprung der Korrektur hinaus"),
    THRUST_BASE: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 1, Triangles (Thrust ≈ breiteste Stelle)", "Ausbruch = 0,618–1,0 × Breite von Welle A ab Ende E", "Ausbruch aus dem Dreieck etwa um seine größte Breite"),
    THRUST_EXTENDED: rel("VU_OPERATIONAL", VU, "Fibonacci-Folge fortgesetzt", "Ausbruch = 1,0–1,618 × Breite von Welle A ab Ende E", "Ausbruch über die Dreiecksbreite hinaus"),
    REV_IMPULSE_BASE: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 4, Retracements; Kap. 2, Depth of Corrective Waves", "Korrektur 0,382–0,5 × gesamter Impuls ab Ende W5", "Gegenbewegung bis zur Hälfte des Impulses"),
    REV_IMPULSE_EXTENDED: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 4, Retracements", "Korrektur 0,5–0,618 × gesamter Impuls ab Ende W5", "Tiefe Gegenbewegung bis 61,8 % des Impulses"),
    REV_ED_BASE: rel("PROJECTION_RELATIONSHIP", EWP, "Kap. 1, Diagonal Triangles (Ending Diagonal: schneller Rücklauf mindestens zum Ursprung)", "Rücklauf 0,618–1,0 × Diagonale ab Ende W5", "Rücklauf bis zum Ursprung der Ending Diagonal"),
    REV_ED_EXTENDED: rel("VU_OPERATIONAL", VU, "Fibonacci-Folge fortgesetzt", "Rücklauf 1,0–1,618 × Diagonale ab Ende W5", "Rücklauf über den Ursprung der Diagonale hinaus"),
    REV_LD_BASE: rel("GUIDELINE", EWP, "Kap. 1, Diagonal Triangles; Kap. 4", "Welle 2 = 0,5–0,66 × Leading Diagonal ab Ende W5", "Folgekorrektur nach Leading Diagonal (Welle 2/B)", "W2_DEEP (unterer Teil)"),
    REV_LD_EXTENDED: rel("GUIDELINE", EWP, "Kap. 1, Diagonal Triangles; Kap. 4", "Welle 2 = 0,66–0,81 × Leading Diagonal ab Ende W5", "Tiefe Folgekorrektur nach Leading Diagonal", "W2_DEEP (ideales Band)")
  };
  /** Produktdarstellung (keine Elliott-Aussage, offen gekennzeichnet). */
  var PRESENTATION = {
    zones: "Zonen = Preisspanne zwischen zwei Verhältnissen desselben Bandes (keine Punktziele).",
    percent: "Prozent = Zonengrenze ÷ aktueller Kurs − 1. Reine Arithmetik, keine Wahrscheinlichkeit.",
    rounding: "Anzeige auf drei signifikante Stellen nach außen gerundet (untere Grenze ab-, obere aufgerundet).",
    tiers: "Basis = konservatives Band, Erweitert = nächstes Band, Extrem = äußerstes Band, das die Methodik noch zulässt."
  };

  /* Leitern: [Stufe, Verhaeltnis von, bis, Beziehung] — Verhaeltnis × Referenzlaenge ab Anker in Thesenrichtung. */
  var LADDERS = {
    W3_IMPULSE: [["BASE", 1.0, 1.618, "W3_BASE"], ["EXTENDED", 1.618, 2.618, "W3_EXTENDED"], ["EXTREME", 2.618, 4.236, "W3_EXTREME"]],
    W3_DIAGONAL: [["BASE", 0.618, 1.0, "DIAG_W3_BASE"], ["EXTENDED", 1.0, 1.618, "DIAG_W3_EXTENDED"]],
    W5_IMPULSE: [["BASE", 0.618, 1.0, "W5_BASE"], ["EXTENDED", 1.0, 1.618, "W5_EXTENDED"], ["EXTREME", 1.0, 1.618, "W5_EXTREME", "NET13"]],
    W5_DIAG_CONTRACTING: [["BASE", 0.618, 1.0, "DIAG_W5_CONTRACTING"]],
    W5_DIAG_EXPANDING: [["BASE", 1.0, 1.618, "DIAG_W5_EXPANDING_BASE"], ["EXTENDED", 1.618, 2.618, "DIAG_W5_EXPANDING_EXTENDED"]],
    C_ZIGZAG: [["BASE", 0.618, 1.0, "C_ZIGZAG_BASE"], ["EXTENDED", 1.0, 1.618, "C_ZIGZAG_EXTENDED"], ["EXTREME", 1.618, 2.618, "C_ZIGZAG_EXTREME"]],
    C_FLAT_REGULAR: [["BASE", 1.0, 1.236, "C_FLAT_REGULAR_BASE"], ["EXTENDED", 1.236, 1.618, "C_FLAT_REGULAR_EXTENDED"]],
    C_FLAT_EXPANDED: [["BASE", 1.382, 1.618, "C_FLAT_EXPANDED_BASE"], ["EXTENDED", 1.618, 2.618, "C_FLAT_EXPANDED_EXTENDED"]],
    Y_WXY: [["BASE", 0.618, 1.0, "Y_BASE"], ["EXTENDED", 1.0, 1.618, "Y_EXTENDED"], ["EXTREME", 1.618, 2.618, "Y_EXTREME"]],
    Z_TRIPLE: [["BASE", 0.618, 1.0, "Z_BASE"], ["EXTENDED", 1.0, 1.618, "Z_EXTENDED"], ["EXTREME", 1.618, 2.618, "Z_EXTREME"]],
    NEXT_CORRECTION_DONE: [["BASE", 0.618, 1.0, "NEXT_BASE"], ["EXTENDED", 1.0, 1.618, "NEXT_EXTENDED"], ["EXTREME", 1.618, 2.618, "NEXT_EXTREME"]],
    THRUST: [["BASE", 0.618, 1.0, "THRUST_BASE"], ["EXTENDED", 1.0, 1.618, "THRUST_EXTENDED"]],
    REV_IMPULSE: [["BASE", 0.382, 0.5, "REV_IMPULSE_BASE"], ["EXTENDED", 0.5, 0.618, "REV_IMPULSE_EXTENDED"]],
    REV_ED: [["BASE", 0.618, 1.0, "REV_ED_BASE"], ["EXTENDED", 1.0, 1.618, "REV_ED_EXTENDED"]],
    REV_LD: [["BASE", 0.5, 0.66, "REV_LD_BASE"], ["EXTENDED", 0.66, 0.81, "REV_LD_EXTENDED"]]
  };
  var TIERS = ["BASE", "EXTENDED", "EXTREME"];
  var TIER_DE = { BASE: "Basis-Projektion", EXTENDED: "Erweiterte Projektion", EXTREME: "Extreme Projektion" };
  var TYPE_DE = { WAVE_3: "Mögliche Welle 3", WAVE_5: "Mögliche Welle 5", WAVE_C: "Mögliche Welle C", NEXT_MOVE: "Mögliche Folgebewegung nach Korrektur", THRUST: "Möglicher Ausbruch aus dem Dreieck", REVERSAL: "Mögliche Gegenbewegung nach Impuls" };
  var MOTIVE = { IMPULSE: 1, LEADING_DIAGONAL: 1, ENDING_DIAGONAL: 1 };
  /* Explore Elliott: Produkt-Leitplanken in Kundensprache (Fachansicht zeigt zusaetzlich Kennung, Wert und Schwelle). */
  var EXPLORE_VERSION = "EXPLORE_ELLIOTT_1.0.0", EXPLORE_MAX = 3;
  var GATE_DE = {
    G2: { title: "Grad-Zuordnung uneindeutig", text: "Die Lesart erfüllt alle Elliott-Regeln, ihr Wellengrad kollidiert aber mit einer anderen abgeschlossenen Struktur vergleichbarer Größe." },
    G3: { title: "Struktur zu verrauscht", text: "Die Wellen heben sich nicht deutlich genug vom normalen Kursrauschen ab." },
    G4: { title: "Struktur für den Wochenchart noch zu kurz", text: "Die erste Welle ist kürzer als ein halbes Jahr – für eine Wochenchart-These zu klein." },
    G5: { title: "Gegen aktuellen Trend", text: "Die Lesart läuft gegen den gemessenen übergeordneten Trend." }
  };
  var CORRECTIVE = { ZIGZAG: 1, FLAT: 1, WXY: 1, DOUBLE_ZIGZAG: 1, TRIPLE_ZIGZAG: 1, TRIANGLE: 1 };

  // =====================================================================
  //  ZAEHLUNG → THESENGEOMETRIE
  // =====================================================================
  function pts(waves) { var p = [waves[0].fromPrice]; waves.forEach(function (w) { p.push(w.toPrice); }); return p; }
  function signOf(waves) { return waves[0].toPrice >= waves[0].fromPrice ? 1 : -1; }
  function developingWave(c) {
    if (c.complete) return null;
    if (c.currentWave && isNum(c.currentWave.wave)) return c.currentWave.wave;
    return c.waves.length;
  }
  function L(p, k) { return Math.abs(p[k] - p[k - 1]); }

  /**
   * Geometrie einer These aus einer Zaehlung (Primaer/Alternative).
   * @returns {null|{type, target, ladderKey, ref, refLabel, net13?, anchor, anchorTime, provisional, s, conf, confRule, confClass, confText, cap?, capRule?, notes[], variant}}
   */
  function geometry(c) {
    if (!c || !c.waves || !c.waves.length) return null;
    var W = c.waves, p = pts(W), s0 = signOf(W), dw = developingWave(c), t = c.pattern, notes = [];
    var at = function (k) { return W[k - 1] ? W[k - 1].toTime : null; };
    function g(o) { o.notes = o.notes || notes; o.pattern = t; return o; }
    if (c.complete) {
      var last = p[p.length - 1], span = Math.abs(last - p[0]), dirN = c.nextMove === "UP" ? 1 : c.nextMove === "DOWN" ? -1 : -s0;
      if (t === "TRIANGLE") return g({ type: "THRUST", target: "Ausbruch", ladderKey: "THRUST", ref: L(p, 1), refLabel: "Breite von Welle A", anchor: last, anchorTime: at(W.length), provisional: false, s: dirN,
                                        conf: p[4], confRule: "S4_TRIANGLE_THRUST", confClass: "VU_OPERATIONAL", confText: "Schluss jenseits des Endes von Welle D (Setup-Definition S4)" });
      if (CORRECTIVE[t]) return g({ type: "NEXT_MOVE", target: "Folgebewegung", ladderKey: "NEXT_CORRECTION_DONE", ref: span, refLabel: "Länge der Korrektur", anchor: last, anchorTime: at(W.length), provisional: false, s: dirN,
                                     conf: p[p.length - 2], confRule: "S3_CORRECTION_COMPLETE", confClass: "VU_OPERATIONAL", confText: "Schluss jenseits des Endes der vorletzten Welle der Korrektur (Setup-Definition S3)" });
      if (t === "IMPULSE") return g({ type: "REVERSAL", target: "Korrektur", ladderKey: "REV_IMPULSE", ref: span, refLabel: "Länge des Impulses", anchor: last, anchorTime: at(5), provisional: false, s: dirN,
                                      conf: p[4], confRule: "W4_AREA", confClass: "VU_OPERATIONAL", confText: "Schluss jenseits des Endes von Welle 4 (Bereich der vorherigen Welle 4)" });
      if (t === "ENDING_DIAGONAL" || t === "LEADING_DIAGONAL") return g({ type: "REVERSAL", target: t === "ENDING_DIAGONAL" ? "Rücklauf" : "Welle 2", ladderKey: t === "ENDING_DIAGONAL" ? "REV_ED" : "REV_LD", ref: span, refLabel: "Länge der Diagonale",
                                      anchor: last, anchorTime: at(5), provisional: false, s: dirN, conf: p[4], confRule: "W4_AREA", confClass: "VU_OPERATIONAL", confText: "Schluss jenseits des Endes von Welle 4" });
      return null;
    }
    var prov = function (k) { return dw === k; };   // Ankerwelle laeuft noch → Anker vorlaeufig (laufendes Extrem)
    if (t === "IMPULSE" || t === "LEADING_DIAGONAL" || t === "ENDING_DIAGONAL") {
      var diag = t !== "IMPULSE";
      if ((dw === 2 || dw === 3) && p.length >= 3) {
        return g({ type: "WAVE_3", target: "3", ladderKey: diag ? "W3_DIAGONAL" : "W3_IMPULSE", ref: L(p, 1), refLabel: "Länge von Welle 1", anchor: p[2], anchorTime: at(2), provisional: prov(2), s: s0,
                   conf: p[1], confRule: "W3_BEYOND_W1_END", confClass: "HARD_RULE", confText: "Welle 3 muss über das Ende von Welle 1 hinauslaufen (harte Regel)" });
      }
      if ((dw === 4 || dw === 5) && p.length >= 5) {
        var L1 = L(p, 1), L3 = L(p, 3), net13 = Math.abs(p[3] - p[0]), o = { type: "WAVE_5", target: "5", ref: diag ? L3 : L1, refLabel: diag ? "Länge von Welle 3" : "Länge von Welle 1", net13: net13, anchor: p[4], anchorTime: at(4), provisional: prov(4), s: s0,
          conf: p[3], confRule: diag ? "THROW_OVER" : "NO_TRUNCATION", confClass: "GUIDELINE", confText: "Welle 5 läuft meist über das Ende von Welle 3 hinaus (sonst Truncation, selten)", truncation: { price: p[3], rule: "NO_TRUNCATION" } };
        if (!diag) {
          o.ladderKey = "W5_IMPULSE";
          if (L3 < L1) { o.cap = L3; o.capRule = "W3_NOT_SHORTEST"; o.capText = "Welle 3 ist kürzer als Welle 1 – Welle 5 darf Welle 3 nicht übertreffen (harte Regel)"; }
          if (L3 > 1.618 * L1) notes.push("Welle 3 ist verlängert – Welle 5 tendiert dann zur Gleichheit mit Welle 1 (Richtlinie); eine zweite Verlängerung ist selten.");
        } else {
          var contracting = L3 < L1;
          o.ladderKey = contracting ? "W5_DIAG_CONTRACTING" : "W5_DIAG_EXPANDING";
          o.variant = contracting ? "CONTRACTING" : "EXPANDING";
          if (contracting) { o.cap = L3; o.capRule = "DIAGONAL_W5_VS_W3"; o.capText = "Kontrahierende Diagonale – Welle 5 muss kürzer als Welle 3 bleiben (Definition)"; }
        }
        return g(o);
      }
      return null;
    }
    if (t === "ZIGZAG" || t === "FLAT" || t === "WXY") {
      if ((dw === 2 || dw === 3) && p.length >= 3) {
        var key = t === "ZIGZAG" ? "C_ZIGZAG" : t === "WXY" ? "Y_WXY" : null, variant = null;
        if (t === "FLAT") { var b = L(p, 2) / Math.max(1e-12, L(p, 1)); variant = b <= 1.05 ? "REGULAR" : "EXPANDED"; key = variant === "REGULAR" ? "C_FLAT_REGULAR" : "C_FLAT_EXPANDED";
          if (variant === "EXPANDED") notes.push("Expandierte oder laufende Flat möglich: eine laufende (running) Flat endet mit Welle C vor dem Ende von Welle A (selten)."); }
        return g({ type: "WAVE_C", target: t === "WXY" ? "Y" : "C", ladderKey: key, variant: variant, ref: L(p, 1), refLabel: t === "WXY" ? "Länge von Welle W" : "Länge von Welle A", anchor: p[2], anchorTime: at(2), provisional: prov(2), s: s0,
                   conf: p[1], confRule: t === "WXY" ? "Y_BEYOND_W_END_OP" : "C_BEYOND_A_END", confClass: t === "WXY" ? "VU_OPERATIONAL" : "GUIDELINE",
                   confText: t === "WXY" ? "Welle Y läuft über das Ende von Welle W hinaus (VU-Festlegung)" : "Welle C endet fast immer jenseits des Endes von Welle A (Richtlinie)" });
      }
      return null;
    }
    if (t === "DOUBLE_ZIGZAG") {
      if ((dw === 6 || dw === 7) && p.length >= 7) return g({ type: "WAVE_C", target: "Y·c", ladderKey: "C_ZIGZAG", ref: L(p, 5), refLabel: "Länge von Welle Y·a", anchor: p[6], anchorTime: at(6), provisional: prov(6), s: s0,
                                                              conf: p[3], confRule: "Y_BEYOND_W_END", confClass: "DEFINITION", confText: "Y läuft über das Ende von W hinaus (Definition Doppel-Zigzag)" });
      if ((dw === 2 || dw === 3) && p.length >= 3) return g({ type: "WAVE_C", target: "W·c", ladderKey: "C_ZIGZAG", ref: L(p, 1), refLabel: "Länge von Welle W·a", anchor: p[2], anchorTime: at(2), provisional: prov(2), s: s0,
                                                              conf: p[1], confRule: "C_BEYOND_A_END", confClass: "GUIDELINE", confText: "Welle c endet fast immer jenseits des Endes von Welle a (Richtlinie)" });
      return null;
    }
    if (t === "TRIPLE_ZIGZAG") {
      if ((dw === 4 || dw === 5) && p.length >= 5) return g({ type: "WAVE_C", target: "Z", ladderKey: "Z_TRIPLE", ref: L(p, 3), refLabel: "Länge von Welle Y", anchor: p[4], anchorTime: at(4), provisional: prov(4), s: s0,
                                                              conf: p[3], confRule: "Z_BEYOND_Y_END", confClass: "DEFINITION", confText: "Z läuft über das Ende von Y hinaus (Definition Dreifach-Zigzag)" });
      if ((dw === 2 || dw === 3) && p.length >= 3) return g({ type: "WAVE_C", target: "Y", ladderKey: "Y_WXY", ref: L(p, 1), refLabel: "Länge von Welle W", anchor: p[2], anchorTime: at(2), provisional: prov(2), s: s0,
                                                              conf: p[1], confRule: "Y_BEYOND_W_END", confClass: "DEFINITION", confText: "Y läuft über das Ende von W hinaus (Definition Dreifach-Zigzag)" });
      return null;
    }
    return null;   // laufendes Dreieck, Welle 1/A: keine Projektion
  }

  /**
   * These des hoeheren Grades: nur Motivwellen (Welle 3 oder 5), wenn die Primaerzaehlung die Korrekturwelle 2/4 des
   * hoeheren Grades ist und abgeschlossen ist, oder wenn die laufende Welle des hoeheren Grades 3 bzw. 5 ist.
   */
  function higherGeometry(H, primary) {
    if (!H || !MOTIVE[H.pattern] || !H.waves || !H.waves.length || !H.current) return null;
    var W = H.waves, k = W.map(function (w) { return String(w.label); }).indexOf(String(H.current.label));
    if (k < 0) return null;
    var last = W[W.length - 1], legs = null, T = null;
    if (k === W.length - 1 && primary && primary.complete && CORRECTIVE[primary.pattern] && (H.current.label === "2" || H.current.label === "4")) { legs = W.slice(0, k + 1); T = k + 2; }
    else if (last.status === "DEVELOPING" && (last.label === "3" || last.label === "5")) { legs = W.slice(0, W.length - 1); T = W.length; }
    if (!legs) return null;
    var c = { pattern: H.pattern, complete: false, currentWave: { wave: T }, waves: legs.concat([{ label: String(T), fromPrice: legs[legs.length - 1].toPrice, toPrice: legs[legs.length - 1].toPrice, fromTime: legs[legs.length - 1].toTime, toTime: null, status: "DEVELOPING" }]) };
    var geo = geometry(c);
    if (!geo) return null;
    geo.provisional = false;
    var inv = Patterns ? Patterns.invalidation(H.pattern, legs.map(function (w) { return { fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status }; }), T) : { hard: null, revision: null };
    geo.invalidation = inv.hard ? { price: inv.hard.price, direction: inv.hard.direction, ruleId: inv.hard.ruleId, statement: inv.hard.statement, kind: "HARD_RULE" } : null;
    geo.revision = inv.revision ? { price: inv.revision.price, direction: inv.revision.direction, ruleId: inv.revision.ruleId, statement: inv.revision.statement, kind: "REVISION" } : null;
    geo.key = "HD|" + H.pattern + "|" + W[0].fromTime + "|" + signOf(W);
    geo.waves = legs;
    return geo;
  }

  // =====================================================================
  //  LEITER, ANZEIGE, LEITPLANKEN
  // =====================================================================
  /** Drei signifikante Stellen, nach aussen gerundet (dir −1 = ab, +1 = auf). */
  function sig3(v, dir) {
    if (!isNum(v) || v <= 0) return v;
    var mag = Math.pow(10, Math.floor(Math.log10(v)) - 2), q = v / mag;
    var r = dir < 0 ? Math.floor(q + 1e-9) : dir > 0 ? Math.ceil(q - 1e-9) : Math.round(q);
    return Math.round(r * mag * 1e6) / 1e6;
  }
  function ladder(geo, close) {
    var spec = LADDERS[geo.ladderKey] || [], s = geo.s, out = [], omitted = [];
    var capPrice = isNum(geo.cap) ? geo.anchor + s * geo.cap : null;
    spec.forEach(function (row) {
      var tier = row[0], ref = row[4] === "NET13" ? geo.net13 : geo.ref, a = geo.anchor + s * ref * row[1], b = geo.anchor + s * ref * row[2];
      var near = a, far = b, relationId = row[3];
      if (capPrice !== null && s * near >= s * capPrice) { omitted.push({ tier: tier, reason: "CAP", text: geo.capText }); return; }
      var capped = false;
      if (capPrice !== null && s * far > s * capPrice) { far = capPrice; capped = true; }
      /* Extrem-Stufe der Welle 5 (1,0–1,618 × Strecke 1–3) beginnt nie unterhalb der erweiterten Stufe */
      var prev = out[out.length - 1];
      if (prev && s * near < s * prev.far) near = prev.far;
      if (s * far <= s * near) { omitted.push({ tier: tier, reason: "OVERLAP", text: "fällt mit der vorigen Stufe zusammen" }); return; }
      var lo = Math.min(near, far), hi = Math.max(near, far);
      if (!isNum(lo) || !isNum(hi)) { omitted.push({ tier: tier, reason: "NOT_FINITE", text: "rechnerisch nicht darstellbar" }); return; }
      if (lo <= 0) { omitted.push({ tier: tier, reason: "BELOW_ZERO", text: "die Zone läge bei oder unter null – rechnerisch nicht darstellbar" }); return; }
      if (hi > close * MAX_MULTIPLE) { omitted.push({ tier: tier, reason: "IMPLAUSIBLE_MAGNITUDE", text: "mehr als das Tausendfache des Kurses – Datenfehler wahrscheinlich, nicht angezeigt" }); return; }
      var state = s > 0 ? (close < lo ? "OPEN" : close <= hi ? "INSIDE" : "PASSED") : (close > hi ? "OPEN" : close >= lo ? "INSIDE" : "PASSED");
      out.push({ tier: tier, label: TIER_DE[tier], ratios: [row[1], row[2]], basis: row[4] === "NET13" ? "NET13" : "REF", relationId: relationId, capped: capped,
                 low: rp(lo), high: rp(hi), mid: rp(Math.sqrt(lo * hi)), display: { low: sig3(lo, -1), high: sig3(hi, 1) },
                 pctLow: r4(lo / close - 1), pctHigh: r4(hi / close - 1), state: state, near: near, far: far });
    });
    out.forEach(function (z) { delete z.near; delete z.far; });
    TIERS.forEach(function (tier) { if (!spec.some(function (r) { return r[0] === tier; })) omitted.push({ tier: tier, reason: "NOT_IN_METHOD", text: "die Methodik nennt für diesen Fall kein weiteres Band" }); });
    return { zones: out, omitted: omitted };
  }

  /** Datenleitplanken: unterdrueckt nur bei ungueltigen Daten, nie wegen Groesse. */
  function guardrails(E, ctx) {
    var flags = [], block = null;
    if (!isNum(ctx.close) || ctx.close <= 0) block = { code: "PRICE_INVALID", text: "Kein gültiger aktueller Kurs." };
    else if (ctx.stalePriceBars) block = { code: "DEAD_OR_PINNED", text: "Der Kurs ist seit mehreren Bars unverändert (z. B. Übernahme, Delisting) – keine Projektion." };
    /* 1.2.0: ein Split-Verdacht sperrt, solange der Kapitalmassnahmen-Beleg der Reihe ihn nicht als echte Kursbewegung
       aufloest (corporate-action-evidence.js: kein Split beim Anbieter UND kein Tagessprung in Split-Groesse). */
    else if (E && E.dataQuality && (E.dataQuality.suspectedSplits > 0 || (Array.isArray(E.dataQuality.suspectedSplits) && E.dataQuality.suspectedSplits.length)) && E.dataQuality.splitResolution !== "RESOLVED") block = { code: "SPLIT_ARTIFACT", text: "Kurssprung im Split-Verhältnis – die Reihe ist vermutlich nicht bereinigt, keine Projektion." };
    if (!block && E && E.dataQuality && E.dataQuality.splitResolution === "RESOLVED") flags.push({ code: "SPLIT_SUSPICION_RESOLVED", text: "Kurssprung in Split-Größe ist laut Anbieter keine Kapitalmaßnahme (mehrtägige Bewegung, kein Split verzeichnet)." });
    if (!block && ctx.close < 1) flags.push({ code: "PENNY_STOCK", text: "Kurs unter 1: schon kleine Kursänderungen ergeben große Prozentwerte." });
    return { block: block, flags: flags };
  }
  /** Spruenge innerhalb der Ankerwellen (unplausible Datenspruenge, nicht als Split erkannt). */
  function jumpInside(geo, ctx) {
    var b = ctx.bars; if (!b || !b.t || !b.c || !geo.waves) return null;
    var from = geo.waves[0].fromTime;
    for (var i = 1; i < b.t.length; i++) {
      if (b.t[i] <= from) continue;
      var r = b.c[i] / b.c[i - 1];
      if (!isNum(r) || r <= 0 || r > 5 || r < 0.2) return { code: "ABSURD_JUMP", text: "Unplausibler Kurssprung (" + b.t[i] + ") innerhalb der Struktur – keine Projektion." };
    }
    return null;
  }

  // =====================================================================
  //  KONTEXT (Trend, Relative Staerke, Marktstruktur) — beeinflusst keine Formel
  // =====================================================================
  function context(ctx) {
    var tr = ctx.trend || null, st = tr && tr.state;
    var trend = { state: st === "UP" ? "POSITIVE" : st === "DOWN" ? "NEGATIVE" : "NEUTRAL", label: st === "UP" ? "Positiv" : st === "DOWN" ? "Negativ" : "Neutral",
                  detail: "Übergeordneter Trend (Dow-Theorie, Hoch-/Tiefpunkte)" };
    var rs = null;
    if (ctx.rs && isNum(ctx.rs.rank)) {
      var q = ctx.rs.rank, d = isNum(ctx.rs.rankPrev) ? q - ctx.rs.rankPrev : null;
      rs = { rank: r4(q), rankPrev: isNum(ctx.rs.rankPrev) ? r4(ctx.rs.rankPrev) : null, universe: ctx.rs.universe || null,
             state: q >= 0.8 ? "TOP20" : q <= 0.2 ? "BOTTOM20" : "MIDDLE", trend: d === null ? null : d >= 0.1 ? "IMPROVING" : d <= -0.1 ? "WEAKENING" : "STABLE",
             label: (q >= 0.8 ? "Top 20 %" : q <= 0.2 ? "Untere 20 %" : "Mittelfeld") + " · stärker als " + Math.round(q * 100) + " %" + (d === null ? "" : d >= 0.1 ? ", verbessert" : d <= -0.1 ? ", schwächer werdend" : ""),
             detail: "26-Wochen-Kursentwicklung im Vergleich aller analysierten Aktien" };
    } else rs = { state: "UNAVAILABLE", label: "nicht verfügbar", detail: "Für diesen Titel liegt kein Vergleichsrang vor" };
    var v = ctx.structureVote, structure = { vote: isNum(v) ? r4(v) : null, detail: "Swing-Struktur (höhere Hochs/Tiefs) der Chartbild-Analyse" };
    var vol = ctx.volume ? { state: ctx.volume.accumulation === "ACCUMULATION" && ctx.volume.relativeVolume >= 1.2 ? "EXPANDING_UP" : ctx.volume.accumulation === "DISTRIBUTION" && ctx.volume.relativeVolume >= 1.2 ? "EXPANDING_DOWN" : "NORMAL",
                             relativeVolume: r4(ctx.volume.relativeVolume), accumulation: ctx.volume.accumulation || null } : { state: "NOT_AVAILABLE" };
    return { trend: trend, rs: rs, structure: structure, volume: vol, higherTimeframe: ctx.alignment || null };
  }
  /** Marktstruktur relativ zur Thesenrichtung. */
  function structureFor(ctxOut, s) {
    var v = ctxOut.structure.vote;
    if (!isNum(v)) return { state: "UNAVAILABLE", label: "nicht verfügbar" };
    var a = v * s;
    return a >= 0.5 ? { state: "CONFIRMED", label: "Bestätigt" } : a <= -0.5 ? { state: "CONFLICTING", label: "Widersprüchlich" } : { state: "DEVELOPING", label: "Im Aufbau" };
  }

  // =====================================================================
  //  THESE
  // =====================================================================
  /** Grenzen exakt (vier signifikante Stellen, nie zur sicheren Seite gerundet). */
  function fmtP(v) { if (!isNum(v)) return "–"; var a = Math.abs(v), d = a < 1 ? Math.max(4, 3 - Math.floor(Math.log10(a || 1))) : a < 10 ? 3 : a < 100 ? 2 : a < 1000 ? 1 : 0; return v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: d }); }
  function beyond(s, close, level) { return isNum(level) && s * (close - level) > 0; }

  function thesis(geo, count, source, ctx, ctxOut) {
    var s = geo.s, close = ctx.close, lad = ladder(geo, close);
    var inv = geo.invalidation !== undefined ? geo.invalidation
      : count.complete ? (count.revision ? { price: count.revision.price, direction: count.revision.direction, ruleId: count.revision.ruleId, statement: CORRECTIVE[count.pattern] ? "jenseits des Musterendes wäre die Korrektur nicht abgeschlossen" : "jenseits des Endes von Welle 5 wäre der Impuls nicht abgeschlossen", kind: "REVISION" } : null)
      : (count.invalidation ? { price: count.invalidation.price, direction: count.invalidation.direction, ruleId: count.invalidation.ruleId, statement: count.invalidation.statement, kind: count.invalidation.kind || "HARD_RULE" } : null);
    var revision = geo.revision !== undefined ? geo.revision : (!count.complete && count.revision ? { price: count.revision.price, direction: count.revision.direction, ruleId: count.revision.ruleId, statement: count.revision.statement, kind: "REVISION" } : null);
    if (revision && inv && revision.price === inv.price) revision = null;
    var invalidNow = inv && isNum(inv.price) ? (inv.direction === "below" ? close < inv.price : close > inv.price) : false;
    var confPassed = beyond(s, close, geo.conf);
    var allPassed = lad.zones.length > 0 && lad.zones.every(function (z) { return z.state === "PASSED"; });
    var status = invalidNow ? "INVALID" : allPassed ? "EXHAUSTED" : confPassed && !geo.provisional ? "CONFIRMED" : "DEVELOPING";
    var label = TYPE_DE[geo.type];
    if (geo.type === "WAVE_C" && geo.target !== "C") label = "Mögliche Welle " + geo.target;
    if (geo.type === "WAVE_3" || geo.type === "WAVE_5") label = TYPE_DE[geo.type] + (source === "HIGHER_DEGREE" ? " (höherer Grad)" : "");
    if (geo.type === "REVERSAL" && geo.target === "Welle 2") label = "Mögliche Welle 2 nach Leading Diagonal";
    var key = (source === "HIGHER_DEGREE" ? geo.key : (count.persistenceKey || (count.pattern + "|" + count.waves[0].fromTime + "|" + signOf(count.waves)))) + "|" + geo.type + "|" + geo.target;
    var t = {
      key: key, source: source, type: geo.type, label: label, target: geo.target, degree: source === "HIGHER_DEGREE" ? "HIGHER" : "ANALYSIS",
      pattern: geo.pattern, patternName: count.patternName || null, variant: geo.variant || count.variant || null, direction: s > 0 ? "UP" : "DOWN",
      status: status, statusLabel: { DEVELOPING: "Im Aufbau – noch nicht bestätigt", CONFIRMED: "Strukturell bestätigt", EXHAUSTED: "Alle Projektionszonen bereits erreicht", INVALID: "Ungültig" }[status],
      anchor: { price: rp(geo.anchor), time: geo.anchorTime, provisional: !!geo.provisional, text: geo.provisional ? "vorläufig: laufendes Extrem der Vorwelle" : "Ende der Vorwelle" },
      reference: { label: geo.refLabel, length: r4(geo.ref), net13: isNum(geo.net13) ? r4(geo.net13) : null },
      ladderKey: geo.ladderKey, zones: lad.zones, omittedTiers: lad.omitted,
      invalidation: inv ? { price: rp(inv.price), direction: inv.direction, ruleId: inv.ruleId, kind: inv.kind, statement: inv.statement, display: rp(inv.price), displayText: fmtP(inv.price),
                            pct: r4(inv.price / close - 1), text: "Schließt der Kurs " + (inv.direction === "below" ? "unter " : "über ") + fmtP(inv.price) + ", gilt diese Elliott-Projektion nicht mehr." } : null,
      revision: revision ? { price: rp(revision.price), direction: revision.direction, ruleId: revision.ruleId, statement: revision.statement } : null,
      confirmation: isNum(geo.conf) ? { price: rp(geo.conf), ruleId: geo.confRule, class: geo.confClass, statement: geo.confText, passed: confPassed, pct: r4(geo.conf / close - 1) } : null,
      cap: isNum(geo.cap) ? { price: rp(geo.anchor + s * geo.cap), ruleId: geo.capRule, statement: geo.capText } : null,
      truncation: geo.truncation && !beyond(s, close, geo.truncation.price) ? { price: rp(geo.truncation.price), ruleId: geo.truncation.rule, statement: "Endet Welle 5 vor " + fmtP(geo.truncation.price) + " (Ende Welle 3), wäre sie verkürzt (Truncation) – zulässig, aber selten." } : null,
      countQuality: source === "HIGHER_DEGREE" ? null : count.countQuality ? count.countQuality.level : null, ruleValidity: source === "HIGHER_DEGREE" ? null : count.ruleAudit ? count.ruleAudit.validity : null,
      notes: geo.notes.slice(), anchorWaves: (geo.waves || count.waves).map(function (w) { return { label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: r4(w.fromPrice), toPrice: r4(w.toPrice), status: w.status }; })
    };
    t.roadmap = roadmap(t, geo, ctx, ctxOut);
    t.signature = signature(t);
    return t;
  }
  /** Fingerabdruck der eingefrorenen Groessen (Anker, Referenz, Grenzen) — aendert er sich, entsteht eine neue Revision. */
  function signature(t) {
    return [t.key, t.anchor.price, t.anchor.provisional ? 1 : 0, t.reference.length, t.reference.net13, t.invalidation ? t.invalidation.price : null, t.confirmation ? t.confirmation.price : null,
            t.zones.map(function (z) { return z.tier + ":" + z.low + "-" + z.high; }).join(",")].join("|");
  }

  /** Fahrplan: ELLIOTT-ANFORDERUNG (Regeln/Definitionen/Richtlinien der Zaehlung) getrennt von VU-BESTAETIGUNG. */
  function roadmap(t, geo, ctx, ctxOut) {
    var s = geo.s, close = ctx.close, el = [], vu = [];
    var item = function (list, id, text, state, cls, ruleId) { list.push({ id: id, text: text, state: state, class: cls, ruleId: ruleId || null }); };
    if (t.invalidation) item(el, "HOLD_INVALIDATION", "Kein Schlusskurs " + (t.invalidation.direction === "below" ? "unter " : "über ") + fmtP(t.invalidation.price), t.status === "INVALID" ? "FAILED" : "MET", t.invalidation.kind === "HARD_RULE" ? "HARD_RULE" : "REVISION", t.invalidation.ruleId);
    if (geo.provisional) item(el, "ANCHOR_WAVE_COMPLETE", "Vorwelle abgeschlossen (Wende bestätigt) – bis dahin ist der Anker vorläufig", "OPEN", "DEFINITION", null);
    if (t.revision) item(el, "HOLD_REVISION", "Kein Schlusskurs " + (t.revision.direction === "below" ? "unter " : "über ") + fmtP(t.revision.price) + " (sonst andere Wellenzuordnung)", (t.revision.direction === "below" ? close < t.revision.price : close > t.revision.price) ? "FAILED" : "MET", "REVISION", t.revision.ruleId);
    if (t.confirmation) item(el, "CONFIRMATION", (t.confirmation.passed ? "Bestätigungsniveau überschritten: " : "Schluss " + (s > 0 ? "über " : "unter ") + fmtP(t.confirmation.price) + " – ") + t.confirmation.statement,
                             t.confirmation.passed ? "MET" : "OPEN", t.confirmation.class, t.confirmation.ruleId);
    if (t.cap) item(el, "CAP", t.cap.statement + " (Deckel " + fmtP(t.cap.price) + ")", s * (close - t.cap.price) >= 0 ? "FAILED" : "MET", t.cap.ruleId === "W3_NOT_SHORTEST" ? "HARD_RULE" : "DEFINITION", t.cap.ruleId);
    var trendOk = ctxOut.trend.state === (s > 0 ? "POSITIVE" : "NEGATIVE"), trendBad = ctxOut.trend.state === (s > 0 ? "NEGATIVE" : "POSITIVE");
    item(vu, "TREND", "Übergeordneter Trend " + (s > 0 ? "aufwärts" : "abwärts"), trendOk ? "MET" : trendBad ? "FAILED" : "OPEN", "VU_CONFIRMATION");
    var rs = ctxOut.rs;
    if (rs.state === "UNAVAILABLE") item(vu, "RS", "Relative Stärke " + (s > 0 ? "Top 20 %" : "untere 20 %"), "NA", "VU_CONFIRMATION");
    else item(vu, "RS", "Relative Stärke " + (s > 0 ? "Top 20 %" : "untere 20 %") + " (aktuell: stärker als " + Math.round(rs.rank * 100) + " %)", (s > 0 ? rs.state === "TOP20" : rs.state === "BOTTOM20") ? "MET" : "OPEN", "VU_CONFIRMATION");
    var ms = structureFor(ctxOut, s);
    item(vu, "STRUCTURE", "Marktstruktur bestätigt (" + (s > 0 ? "höhere Hochs und Tiefs" : "tiefere Hochs und Tiefs") + ")", ms.state === "CONFIRMED" ? "MET" : ms.state === "CONFLICTING" ? "FAILED" : ms.state === "UNAVAILABLE" ? "NA" : "OPEN", "VU_CONFIRMATION");
    var v = ctxOut.volume.state;
    item(vu, "VOLUME", "Volumen-Ausweitung in Thesenrichtung", v === "NOT_AVAILABLE" ? "NA" : (s > 0 ? v === "EXPANDING_UP" : v === "EXPANDING_DOWN") ? "MET" : "OPEN", "VU_CONFIRMATION");
    if (ctxOut.higherTimeframe) item(vu, "HIGHER_TIMEFRAME", "Wochen- und Tagesbild gleichgerichtet", ctxOut.higherTimeframe === "ALIGNED" ? "MET" : ctxOut.higherTimeframe === "COUNTER_TREND" ? "FAILED" : ctxOut.higherTimeframe === "UNAVAILABLE" ? "NA" : "OPEN", "VU_CONFIRMATION");
    return { elliott: el, vu: vu, structure: ms,
             note: "Elliott-Anforderungen kommen aus den Regeln der Zählung. VU-Bestätigungen sind unabhängige Signale; sie verändern die Projektion nicht und sind keine Elliott-Regeln." };
  }

  /** Projektions-Kennzahl fuer den Vergleich (Mitte der erweiterten Stufe, sonst der fernsten). */
  function upside(t) {
    if (!t || !t.zones.length) return null;
    var z = t.zones.filter(function (x) { return x.tier === "EXTENDED"; })[0] || t.zones[t.zones.length - 1];
    return z.mid;
  }

  /**
   * Hauptfunktion.
   * @param {object} E    veroeffentlichte Form pro.elliott (Shard / slim)
   * @param {object} ctx  { close, asOf, timeframe, trend:{state}, structureVote, alignment, volume, rs:{rank,rankPrev,universe}, stalePriceBars, bars:{t:[],c:[]} }
   */
  function build(E, ctx) {
    var out = { schemaVersion: SCHEMA, version: VERSION, timeframe: ctx.timeframe || null, asOf: ctx.asOf || null, close: r4(ctx.close),
                engine: { elliott: E ? E.engineVersion || null : null, ruleSet: E ? E.ruleSetVersion || null : null },
                status: "NO_PROJECTION", reason: null, consumerVisible: false, primary: null, alternative: null, highUpside: null, motiveAlternative: null, explore: [], exploreDiagnostics: [], exploreWithheld: false,
                context: null, guardrails: { flags: [] },
                evidence: { status: "INSUFFICIENT", label: "Experimentell – noch keine ausreichende Evidenz", text: "Für Projektionszonen gibt es noch keine belastbare historische Prüfung. Das prospektive Register zeichnet jede angezeigte These ab jetzt ohne Rückblick auf." },
                disclaimer: "Projektion ≠ Wahrscheinlichkeit: Die Zonen zeigen, wohin die Welle rechnerisch laufen könnte, wenn die Zählung stimmt. Prozentwerte sind Arithmetik vom aktuellen Kurs, keine Trefferquote." };
    if (!E || !E.primary) { out.status = "UNAVAILABLE"; out.reason = "Keine regelkonforme Wellenzählung."; return out; }
    var gr = guardrails(E, ctx); out.guardrails.flags = gr.flags;
    if (gr.block) { out.status = "DATA_INVALID"; out.reason = gr.block.text; out.guardrails.block = gr.block; return out; }
    var ctxOut = context(ctx); out.context = ctxOut;
    var abstain = !!(E.applicability && E.applicability.abstain);
    function mk(geo, count, source, sink) {
      /* sink: Explore-Lesarten melden Verworfenes in out.exploreDiagnostics, nie in die Hinweise der Hauptprojektion */
      var flags = sink || out.guardrails.flags;
      if (!geo) return null;
      var j = jumpInside(geo.waves ? geo : Object.assign({ waves: count.waves }, geo), ctx);
      if (j) { flags.push(j); return null; }
      var th = thesis(geo, count, source, ctx, ctxOut);
      if (!th.zones.length) th.omittedTiers.forEach(function (x) { if ((x.reason === "IMPLAUSIBLE_MAGNITUDE" || x.reason === "NOT_FINITE") && !flags.some(function (f) { return f.code === x.reason; })) flags.push({ code: x.reason, text: x.text }); });
      /* Eine These, deren Grenze per Schluss schon verletzt ist, ist keine These mehr (nicht zeigen, nicht verfolgen). */
      if (th.status === "INVALID") { flags.push({ code: "INVALID_THESIS", text: th.label + " (" + source.toLowerCase() + "): Grenze bereits verletzt – nicht gezeigt." }); return null; }
      return th.zones.length ? th : null;
    }
    /* Primaere Interpretation: hoeherer Grad (Motivwelle 3/5), sonst die eigene These der Primaerzaehlung. */
    var own = mk(geometry(E.primary), E.primary, "PRIMARY");
    var hdGeo = higherGeometry(E.higherDegree, E.primary), hd = hdGeo ? mk(hdGeo, Object.assign({}, E.primary, { patternName: E.higherDegree.patternName, persistenceKey: null, countQuality: null }), "HIGHER_DEGREE") : null;
    if (hd && own && hd.direction !== own.direction) hd = null;   // widerspricht der kurzfristigen Struktur → nicht als Hauptthese
    out.primary = hd || own;
    if (hd && own) out.primary.subStructure = { label: own.label, type: own.type, zones: own.zones, invalidation: own.invalidation, text: "Kurzfristige Struktur innerhalb der These des höheren Grades" };
    /* Alternative: staerkste Alternative mit Projektion (nur echte Alternativen der Engine). */
    var alts = (E.alternatives || []).map(function (a) { return mk(geometry(a), a, "ALTERNATIVE"); });
    out.alternative = alts.filter(Boolean)[0] || null;
    /* Hochpotenzial-Alternative: echte, regelkonforme Motiv-Alternative (Welle 3/5) mit deutlich groesserer Projektion. */
    var base = out.primary ? upside(out.primary) / ctx.close - 1 : 0;
    (E.alternatives || []).forEach(function (a, q) {
      var th = alts[q]; if (!th || out.highUpside) return;
      if (!(th.type === "WAVE_3" || th.type === "WAVE_5") || !(th.pattern === "IMPULSE" || th.pattern === "LEADING_DIAGONAL") || th.direction !== "UP" || (a.ruleAudit && a.ruleAudit.validity !== "VALID")) return;
      var up = upside(th) / ctx.close - 1;
      if (up >= 1.0 && up >= 2 * Math.max(0, base)) { th.highUpside = true; th.highUpsideText = "Alternative Lesart mit hohem Aufwärtspotenzial – nicht die bevorzugte Zählung, geringe Klarheit."; out.highUpside = th; }
    });
    if (out.highUpside && out.alternative && out.highUpside.key === out.alternative.key) out.highUpside = { ref: "ALTERNATIVE", key: out.alternative.key };
    /* PRODUKT-SICHTBARKEIT (1.1.0) — Motiv-Alternative: die beste regelkonforme Lesart mit laufender Welle 2/3 aus dem Kandidatenpool
       der Engine (E.hiddenMotive, geprueft in ti-projection.mjs#motiveCandidateFor), die nicht unter den zwei angezeigten Alternativen
       steht. Nie Hauptlesart; hoechstens eine; nur, wenn keine angezeigte Alternative schon eine Welle-3-These ist. Formeln,
       Invalidation und Leitplanken sind dieselben wie fuer jede These. Sichtbar auch, wenn sich die Engine fuer die Hauptzaehlung
       enthaelt — dann ausdruecklich als Alternative mit niedriger Strukturklarheit. */
    var hm = E.hiddenMotive;
    if (hm && hm.count && !(out.alternative && out.alternative.type === "WAVE_3") && !(out.primary && out.primary.type === "WAVE_3" && out.primary.direction === hm.count.direction)) {
      var mt = mk(geometry(hm.count), hm.count, "MOTIVE_ALTERNATIVE");
      /* ausgeschoepft (alle Zonen schon erreicht) hat als Alternative keinen Nutzen → nicht zeigen */
      if (mt && mt.status === "EXHAUSTED") { out.guardrails.flags.push({ code: "MOTIVE_EXHAUSTED", text: "Motiv-Alternative: alle Projektionszonen bereits erreicht – nicht gezeigt." }); mt = null; }
      if (mt && mt.type === "WAVE_3") {
        mt.label = "Mögliche Welle 3 · Alternative Lesart";
        mt.clarity = { level: "LOW", label: "Niedrig", text: "Regelkonforme Lesart aus der Kandidatensuche der Engine, Rang " + (hm.rank + 1) + " von " + hm.pool + " – nicht die bevorzugte Zählung." };
        mt.pool = { rank: hm.rank, size: hm.pool };
        mt.visibility = "PRODUCT_VISIBILITY_1.1.0";
        var upM = upside(mt) / ctx.close - 1;
        if (!out.highUpside && mt.direction === "UP" && upM >= 1.0 && upM >= 2 * Math.max(0, base)) { mt.highUpside = true; mt.highUpsideText = "Alternative Lesart mit hohem Aufwärtspotenzial – nicht die bevorzugte Zählung, niedrige Strukturklarheit."; }
        out.motiveAlternative = mt;
      }
    }
    /* EXPLORE ELLIOTT (1.2.0) — weitere regelkonforme Lesarten, die mindestens eine Produkt-Leitplanke verfehlen
       (E.explore, ausgewaehlt in ti-projection.mjs#exploreCandidatesFor). Nie Hauptlesart, nie reguläre Alternative,
       hoechstens 3, eingeklappt. Dieselben Formeln, Invalidation und Datenleitplanken wie jede These. Verworfen werden
       Lesarten mit derselben Thesenkennung wie eine angezeigte These und nahezu gleiche Leitern (Mitte der erweiterten
       Stufe innerhalb von 10 % einer angezeigten These derselben Richtung und desselben Typs). */
    out.explore = []; out.exploreDiagnostics = [];
    /* Explore-Kandidaten des Titels wegen Datenproblem gesperrt (Build): bestehende Explore-Thesen zurueckhalten, nicht umdeuten */
    out.exploreWithheld = !!(E.explore && /^DATA_/.test(E.explore.reason || ""));
    var ex = E.explore && E.explore.items ? E.explore.items : [];
    ex.slice(0, EXPLORE_MAX).forEach(function (it) {
      var shownT = [out.primary, out.alternative, out.highUpside && out.highUpside.zones ? out.highUpside : null, out.motiveAlternative].concat(out.explore).filter(Boolean);
      var th = mk(geometry(it.count), it.count, "EXPLORE", out.exploreDiagnostics);
      if (!th) return;
      if (th.status === "EXHAUSTED" || !th.invalidation || !(th.invalidation.price > 0)) { out.exploreDiagnostics.push({ code: "EXPLORE_DROPPED", text: th.label + " (Explore): " + (th.invalidation ? "alle Zonen erreicht" : "keine Invalidation") + " – nicht gezeigt." }); return; }
      var dup = shownT.some(function (o) {
        if (o.key === th.key) return true;
        if (o.direction !== th.direction || o.type !== th.type) return false;
        var a = upside(o), b = upside(th); return isNum(a) && isNum(b) && Math.abs(a / b - 1) <= 0.1;
      });
      if (dup) { out.exploreDiagnostics.push({ code: "EXPLORE_DUPLICATE", text: th.label + " (Explore): gleiche These oder nahezu gleiche Projektionsleiter wie eine angezeigte Lesart – nicht gezeigt." }); return; }
      th.role = "EXPLORE";
      th.label = th.label.replace(/ \(höherer Grad\)$/, "") + " · Wochenchart";
      th.headline = "Weitere Elliott-Lesart";
      th.exploreStatus = { code: "EXPLORATIVE", label: "Explorativ", text: "Nicht als reguläre Alternative freigegeben" };
      th.clarity = { level: "LOW", label: "Niedrig", text: "Regelkonforme Lesart aus der Kandidatensuche der Engine – nicht die bevorzugte Zählung, nicht als reguläre Alternative freigegeben." };
      th.pool = { rank: it.rank, size: it.pool, text: "Rang " + (it.rank + 1) + " von " + it.pool + " gültigen Interpretationen" };
      th.hardRules = { status: "PASSED", label: "Elliott-Regeln: erfüllt", rules: it.count.ruleAudit ? (it.count.ruleAudit.hardRules || []) : [], open: it.count.ruleAudit ? (it.count.ruleAudit.openRules || []) : [] };
      th.qualityGates = { status: "FAILED", failed: it.failed.slice(), results: it.gates,
                          label: "Produkt-Leitplanken: verfehlt " + it.failed.join(", "),
                          reasons: it.failed.map(function (g) { return { gate: g, title: GATE_DE[g].title, text: GATE_DE[g].text, value: it.gates[g] ? it.gates[g].value : null, threshold: it.gates[g] ? it.gates[g].threshold : null }; }) };
      th.slot = out.explore.length + 1;   // Anzeige-Reihenfolge (nach dem Verwerfen von Dubletten)
      th.visibility = EXPLORE_VERSION;
      out.explore.push(th);
    });
    out.exploreVisible = out.explore.length;
    /* Verwendete Beziehungen mitliefern (Fachansicht: Formel, Klasse, Quelle) — die Oberflaeche rechnet nicht. */
    var used = {};
    [out.primary, out.primary && out.primary.subStructure, out.alternative, out.highUpside, out.motiveAlternative].concat(out.explore).forEach(function (t) { if (t && t.zones) t.zones.forEach(function (z) { used[z.relationId] = RELATIONSHIPS[z.relationId]; }); });
    out.relations = used;
    out.presentation = PRESENTATION;
    out.status = out.primary || out.alternative ? (abstain ? "ABSTAIN" : "AVAILABLE") : "NO_PROJECTION";
    out.consumerVisible = out.status === "AVAILABLE";
    out.motiveVisible = !!out.motiveAlternative;
    if (abstain) out.reason = "Die Engine enthält sich (keine verlässliche Zählung). Die Projektion steht nur in der Fachansicht und ist keine Produktaussage.";
    else if (!out.primary && !out.alternative) out.reason = "Die aktuelle Zählung liefert keine Projektion (z. B. Welle 1 läuft oder ein Dreieck ist noch nicht abgeschlossen).";
    return out;
  }

  // =====================================================================
  //  LEBENSZYKLUS — eingefroren, nur anhaengen
  // =====================================================================
  /**
   * @param {object|null} entry  bisheriger Eintrag dieser These (oder null)
   * @param {object|null} th     aktuelle These (oder null = nicht mehr vorhanden)
   * @param {{t:string[], c:number[]}} bars  Schlusskurse (aufsteigend)
   * @param {string} asOf
   * @param {object} meta { id, symbol, timeframe, role, versions }
   * @returns {object} neuer Eintrag (der alte wird nicht veraendert)
   */
  function advanceLifecycle(entry, th, bars, asOf, meta) {
    var e = entry ? JSON.parse(JSON.stringify(entry)) : null;
    function ev(type, d, extra) { e.events.push(Object.assign({ d: d, type: type, rev: e.rev }, extra || {})); }
    if (e && e.state === "ARCHIVED") return e;
    var withheld = !!(meta && meta.withheld);
    if (!e) {
      if (!th) return null;
      e = { id: meta.id, symbol: meta.symbol, timeframe: meta.timeframe, key: th.key, type: th.type, label: th.label, direction: th.direction, source: th.source, role: meta.role, createdAt: asOf, rev: 0, state: "CREATED", checkedAt: asOf, revisions: [], events: [] };
      freeze(e, th, asOf, meta); ev("CREATED", asOf);
      e.state = th.status === "CONFIRMED" ? "CONFIRMED" : "DEVELOPING";
      if (th.status === "CONFIRMED") ev("CONFIRMED", asOf, { atCreation: true });
      return e;
    }
    if (asOf <= e.checkedAt) return e;   // gleiche Daten → keine Aenderung (idempotent)
    var R = e.revisions[e.revisions.length - 1], s = e.direction === "UP" ? 1 : -1, has = function (t) { return e.events.some(function (x) { return x.type === t && x.rev === e.rev; }); };
    /* Kurse seit der letzten Pruefung gegen die eingefrorene Revision */
    for (var i = 0; i < bars.t.length; i++) {
      var d = bars.t[i], c = bars.c[i]; if (d <= e.checkedAt || d > asOf) continue;
      if (R.invalidation && (R.invalidation.direction === "below" ? c < R.invalidation.price : c > R.invalidation.price)) { ev("INVALIDATED", d, { close: c }); e.state = "INVALIDATED"; ev("ARCHIVED", d); e.state = "ARCHIVED"; e.checkedAt = asOf; return e; }
      if (R.confirmation && !R.confirmationPassedAtFreeze && !has("CONFIRMED") && s * (c - R.confirmation.price) > 0) { ev("CONFIRMED", d, { close: c }); e.state = "CONFIRMED"; }
      R.zones.forEach(function (z) {
        var t = z.tier + "_PROJECTION_REACHED"; if (z.stateAtFreeze !== "OPEN" || has(t)) return;
        if (s > 0 ? c >= z.low : c <= z.high) { ev(t, d, { close: c }); e.state = t; }
      });
    }
    e.checkedAt = asOf;
    /* Produkt zeigt die Projektion gerade nicht (Engine enthaelt sich, Datenfehler): weiter verfolgen, nicht umdeuten */
    if (withheld) { if (!e.withheld) { ev("WITHHELD", asOf, { note: "Die Projektion wird derzeit nicht angezeigt (keine verlässliche Zählung oder Datenproblem); die eingefrorene These wird weiter verfolgt." }); e.withheld = true; } return e; }
    if (e.withheld) { ev("SHOWN_AGAIN", asOf); e.withheld = false; }
    if (!th) { ev("RELABELLED", asOf, { note: "Die Zählung liefert diese These nicht mehr (andere Lesart oder Abschluss)." }); e.state = "RELABELLED"; ev("ARCHIVED", asOf); e.state = "ARCHIVED"; return e; }
    /* 1.2.0: Rollenwechsel (z. B. EXPLORE → MOTIVE_ALTERNATIVE → ALTERNATIVE → PRIMARY) als Ereignis — dieselbe These, Geschichte bleibt */
    if (meta.role && e.role && e.role !== meta.role) { ev("ROLE_CHANGED", asOf, { from: e.role, to: meta.role }); e.role = meta.role; }
    if (th.signature !== R.signature) {
      freeze(e, th, asOf, meta); ev("REVISED", asOf, { note: "Anker oder Grenzen der Zählung haben sich geändert – neue Revision, die vorige bleibt erhalten." });
      e.state = th.status === "CONFIRMED" ? "CONFIRMED" : "DEVELOPING";
    }
    return e;
  }
  function freeze(e, th, asOf, meta) {
    e.rev = e.revisions.length + 1;
    e.revisions.push({ rev: e.rev, frozenAt: asOf, signature: th.signature, anchor: th.anchor, reference: th.reference,
                       zones: th.zones.map(function (z) { return { tier: z.tier, low: z.low, high: z.high, stateAtFreeze: z.state }; }),
                       invalidation: th.invalidation ? { price: th.invalidation.price, direction: th.invalidation.direction, ruleId: th.invalidation.ruleId } : null,
                       confirmation: th.confirmation ? { price: th.confirmation.price, ruleId: th.confirmation.ruleId } : null, confirmationPassedAtFreeze: !!(th.confirmation && th.confirmation.passed),
                       versions: meta.versions || null });
  }
  var STATE_DE = { CREATED: "Neu", DEVELOPING: "Im Aufbau", CONFIRMED: "Bestätigt", BASE_PROJECTION_REACHED: "Basis-Projektion erreicht", EXTENDED_PROJECTION_REACHED: "Erweiterte Projektion erreicht",
                   EXTREME_PROJECTION_REACHED: "Extreme Projektion erreicht", INVALIDATED: "Ungültig geworden", RELABELLED: "Neu gezählt", ARCHIVED: "Archiviert", REVISED: "Neue Revision", ROLE_CHANGED: "Rolle gewechselt", WITHHELD: "Derzeit nicht angezeigt", SHOWN_AGAIN: "Wieder angezeigt" };

  var api = { VERSION: VERSION, SCHEMA: SCHEMA, RELATIONSHIPS: RELATIONSHIPS, LADDERS: LADDERS, PRESENTATION: PRESENTATION, TIER_DE: TIER_DE, TYPE_DE: TYPE_DE, STATE_DE: STATE_DE,
              GATE_DE: GATE_DE, EXPLORE_VERSION: EXPLORE_VERSION, EXPLORE_MAX: EXPLORE_MAX, build: build, geometry: geometry, higherGeometry: higherGeometry, ladder: ladder, sig3: sig3, context: context, advanceLifecycle: advanceLifecycle, MAX_MULTIPLE: MAX_MULTIPLE };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottProjection = api; }
})(typeof window !== "undefined" ? window : globalThis);
