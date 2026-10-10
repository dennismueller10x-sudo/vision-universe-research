/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/patterns.js
   ELLIOTT V2 PATTERN LIBRARY (rule set elliott-rules-2.0.1)

   Eine Musterklasse = Wellenzahl + erwartete Unterteilung + Regeln +
   Richtlinien + Invalidation + Projektion. Quelle der Regeln:
   Frost & Prechter, "Elliott Wave Principle" (EWP, 10. Aufl. 2005), Kap. 1–4,
   ergaenzt um die von Elliott Wave International (EWI) veroeffentlichten
   Praezisierungen (Gorman/Kennedy, "Visual Guide to Elliott Wave Trading",
   2013). Jede Regel traegt `source`.

   DREI KLASSEN, NIE VERMISCHT:

     HARD        Elliott-Regel ("never"/"always" in EWP). Verletzung →
                 Kandidat verworfen.
     DEFINITION  Klassengrenze zwischen Mustern (z. B. Flat: B >= 90 % A;
                 Diagonal: W4 ueberlappt W1). Verletzung → "nicht DIESES
                 Muster" (ein anderes kann gelten). Wirkt ebenfalls als Gate.
     GUIDELINE   Tendenz ("usually", "often"). Rankt 0..1, legitimiert nie.

   Empirische Eigenschaften (wie oft trat X in VU-Daten ein) stehen NICHT
   hier, sondern in der Evidence-Schicht (evidence/*).

   Notation: Punkte p0..pn (p0 = Ursprung von Welle 1/A, pk = Ende von
   Welle k). s = Richtung der ersten Welle (+1 auf, −1 ab). o(k) = s·pk ist
   der orientierte Preis — groesser heisst "weiter in Musterrichtung".
   Ein DEVELOPING-Leg ist das laufende Extrem; es kann nur weiter laufen,
   deshalb sind "überschreitet"-Regeln darauf `null` (offen), "nicht-
   ueber"-Regeln sofort entscheidbar.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);

  var RULE_SET_VERSION = "elliott-rules-3.1.0";   // 3.0.0: Dreifach-Zigzag (kompakt W-X-Y-X-Z); 3.1.0: W/Y/Z als Zigzag (Red-Team M7)
  var TRIANGLE_BARRIER_TOL = 0.05;   // Barrier-Dreieck: D darf B um 5 % der A-Laenge ueberschreiten
  var EWP = "Frost & Prechter, Elliott Wave Principle (2005), ";
  var EWI = "Gorman & Kennedy (EWI), Visual Guide to Elliott Wave Trading (2013), ";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function len(l) { return Math.abs(l.toPrice - l.fromPrice); }
  function ratio(a, b) { return b > 0 ? a / b : Infinity; }
  function dev(l) { return l && l.status === "DEVELOPING"; }

  /** Score einer Kennzahl gegen ein ideales und ein akzeptables Band (0..1). */
  function band(x, ideal, acceptable) {
    if (!isNum(x)) return null;
    if (x >= ideal[0] && x <= ideal[1]) return 1;
    if (x >= acceptable[0] && x <= acceptable[1]) {
      var d = x < ideal[0] ? (ideal[0] - x) / Math.max(1e-9, ideal[0] - acceptable[0]) : (x - ideal[1]) / Math.max(1e-9, acceptable[1] - ideal[1]);
      return Math.max(0, 1 - 0.8 * d);
    }
    return 0;
  }
  /** Naehe zu einem Zielverhaeltnis (log-Distanz), 1 = exakt. */
  function near(x, target, tol) {
    if (!isNum(x) || x <= 0) return null;
    var d = Math.abs(Math.log(x / target));
    return Math.max(0, 1 - d / Math.log(1 + (tol || 0.25)));
  }

  // ----------------------------------------------------------- Rule helpers
  function Ctx(legs) {
    var s = legs[0].toPrice >= legs[0].fromPrice ? 1 : -1;
    var p = [legs[0].fromPrice]; legs.forEach(function (l) { p.push(l.toPrice); });
    return { legs: legs, s: s, p: p, o: function (k) { return s * p[k]; }, L: function (k) { return legs[k - 1] ? len(legs[k - 1]) : NaN; }, n: legs.length };
  }
  function R(out, id, cls, passed, detail, source) { out.push({ ruleId: id, class: cls, passed: passed, detail: detail, source: source }); }

  /** Richtungen alternieren: ungerade Wellen in s, gerade gegen s. */
  function alternation(c, out, id) {
    var ok = true;
    c.legs.forEach(function (l, k) { var d = (l.toPrice - l.fromPrice) * c.s; if ((k % 2 === 0 && d <= 0) || (k % 2 === 1 && d >= 0)) ok = false; });
    R(out, id || "ALTERNATING_DIRECTION", "HARD", ok, "Wellen wechseln die Richtung", EWP + "Kap. 1 (Grundform)");
  }

  /** Regel "Welle k endet jenseits von Punkt j": auf laufendem Leg offen, solange nicht erfuellt. */
  function beyond(c, out, id, k, j, cls, detail, source) {
    if (c.n < k) return;
    var ok = c.o(k) > c.o(j);
    if (!ok && dev(c.legs[k - 1])) R(out, id, cls, null, detail + " (Welle läuft noch)", source);
    else R(out, id, cls, ok, detail, source);
  }
  /** Regel "Welle k endet NICHT jenseits von Punkt j (in Gegenrichtung)": sofort entscheidbar. */
  function notBeyondAgainst(c, out, id, k, j, cls, detail, source) {
    if (c.n < k) return;
    R(out, id, cls, c.o(k) > c.o(j), detail, source);
  }

  // =====================================================================
  //  MUSTERKLASSEN
  // =====================================================================

  /* ---------------------------------------------------------- IMPULSE */
  function impulseRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    notBeyondAgainst(c, out, "W2_NOT_BEYOND_W1_ORIGIN", 2, 0, "HARD", "Welle 2 retraced nie mehr als 100 % von Welle 1", EWP + "Kap. 1, Impulse — Regel 1");
    beyond(c, out, "W3_BEYOND_W1_END", 3, 1, "HARD", "Welle 3 läuft über das Ende von Welle 1 hinaus", EWP + "Kap. 1, Impulse");
    notBeyondAgainst(c, out, "W4_NO_OVERLAP_W1", 4, 1, "HARD", "Welle 4 betritt nie das Preisgebiet von Welle 1", EWP + "Kap. 1, Impulse — Regel 3");
    if (c.n >= 5) {
      var l1 = c.L(1), l3 = c.L(3), l5 = c.L(5);
      if (!dev(legs[4])) R(out, "W3_NOT_SHORTEST", "HARD", l3 >= Math.min(l1, l5), "Welle 3 ist nie die kürzeste der Wellen 1, 3, 5", EWP + "Kap. 1, Impulse — Regel 2");
      else if (l3 < l1 && l5 > l3) R(out, "W3_NOT_SHORTEST", "HARD", false, "Welle 5 ist bereits länger als die kürzere Welle 3 (W3 < W1)", EWP + "Kap. 1, Impulse — Regel 2");
      else R(out, "W3_NOT_SHORTEST", "HARD", null, "offen, solange Welle 5 läuft", EWP + "Kap. 1, Impulse — Regel 2");
    } else if (c.n >= 3) R(out, "W3_NOT_SHORTEST", "HARD", null, "erst mit Welle 5 prüfbar", EWP + "Kap. 1, Impulse — Regel 2");
    return out;
  }
  function impulseGuidelines(legs) {
    var c = Ctx(legs), g = {};
    var l1 = c.L(1), l2 = c.L(2), l3 = c.L(3), l4 = c.L(4), l5 = c.L(5);
    if (c.n >= 2 && !dev(legs[1])) g.W2_RETRACEMENT = band(l2 / l1, [0.5, 0.618], [0.236, 0.886]);
    if (c.n >= 3 && !dev(legs[2])) g.W3_EXTENSION = band(l3 / l1, [1.618, 2.618], [1.0, 4.236]);
    if (c.n >= 4 && !dev(legs[3])) g.W4_RETRACEMENT = band(l4 / l3, [0.236, 0.382], [0.1, 0.618]);
    if (c.n >= 4 && !dev(legs[3])) {
      /* Alternation (EWP Kap. 2): Tiefe ODER Dauer von W2 und W4 unterscheiden sich. */
      var depth = Math.abs(l2 / l1 - l4 / l3), time = Math.abs(Math.log(Math.max(1, legs[1].duration) / Math.max(1, legs[3].duration)));
      g.ALTERNATION = Math.min(1, depth / 0.25 * 0.5 + Math.min(1, time / Math.log(2)) * 0.5);
    }
    if (c.n >= 5 && !dev(legs[4])) {
      var ext3 = l3 > 1.618 * l1;
      /* Wenn W3 verlaengert ist, tendieren W1 und W5 zur Gleichheit (EWP Kap. 4). */
      g.W5_PROPORTION = ext3 ? near(l5 / l1, 1.0, 0.618) : Math.max(near(l5 / l1, 0.618, 0.382) || 0, band(l5 / (Math.abs(c.p[3] - c.p[0])), [0.382, 0.618], [0.236, 1.0]) || 0);
      /* Genau eine Welle verlaengert (EWP Kap. 1, "Extension"). */
      var arr = [l1, l3, l5].sort(function (a, b) { return b - a; });
      g.EXTENSION_IN_ONE = arr[0] >= 1.382 * arr[1] ? 1 : arr[0] >= 1.15 * arr[1] ? 0.6 : 0.3;
      /* Truncation (W5 verfehlt W3-Ende): zulaessig, aber selten. */
      g.NO_TRUNCATION = c.o(5) > c.o(3) ? 1 : 0.25;
      /* Kanal (EWP Kap. 2): Basislinie W2–W4, Parallele durch W3; W5 endet nahe der Parallelen. */
      var t2 = legs[1].toIndex, t4 = legs[3].toIndex;
      if (t4 !== t2) {
        var slope = (c.p[4] - c.p[2]) / (t4 - t2), upper = c.p[3] + slope * (legs[4].toIndex - legs[2].toIndex);
        g.CHANNEL = Math.max(0, 1 - Math.abs(c.p[5] - upper) / Math.max(1e-9, l3) / 0.5);
      }
    }
    if (c.n >= 3 && legs[0].perBar && legs[2].perBar) g.W3_MOMENTUM = legs[2].perBar >= legs[0].perBar ? 1 : 0.4;
    if (c.n >= 3 && isNum(legs[0].meanVolume) && isNum(legs[2].meanVolume)) g.W3_VOLUME = legs[2].meanVolume >= legs[0].meanVolume ? 1 : 0.5;
    return g;
  }

  /* --------------------------------------------------------- DIAGONALS */
  function diagonalRules(legs, kind) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    notBeyondAgainst(c, out, "W2_NOT_BEYOND_W1_ORIGIN", 2, 0, "HARD", "Welle 2 retraced nie mehr als 100 % von Welle 1", EWP + "Kap. 1, Diagonal Triangles");
    beyond(c, out, "W3_BEYOND_W1_END", 3, 1, "HARD", "Welle 3 läuft über das Ende von Welle 1 hinaus", EWP + "Kap. 1, Diagonal Triangles");
    notBeyondAgainst(c, out, "W4_NOT_BEYOND_W3_ORIGIN", 4, 2, "HARD", "Welle 4 retraced Welle 3 nicht vollständig", EWP + "Kap. 1, Diagonal Triangles");
    if (c.n >= 4) {
      /* Klassengrenze Impuls/Diagonale: W4 betritt das Gebiet von W1. */
      R(out, "DIAGONAL_W4_OVERLAPS_W1", "DEFINITION", c.o(4) <= c.o(1), "In einer Diagonale überlappt Welle 4 das Gebiet von Welle 1", EWP + "Kap. 1, Diagonal Triangles (\"almost always\"); als Klassengrenze zum Impuls verwendet");
    }
    /* Form: kontrahierend (1>3>5, 2>4) oder expandierend (1<3<5, 2<4). */
    if (c.n >= 3 && !dev(legs[2])) {
      var contracting = c.L(3) < c.L(1);
      if (c.n >= 4) {
        /* Eine laufende W4 kann nur laenger werden: "kuerzer als W2" ist sofort entscheidbar, sobald verletzt;
           "laenger als W2" bleibt offen, bis erfuellt (Review-Befund 6). */
        var ok4 = contracting ? c.L(4) < c.L(2) : c.L(4) > c.L(2);
        R(out, "DIAGONAL_W4_VS_W2", "DEFINITION", ok4 ? (dev(legs[3]) && contracting ? null : true) : (dev(legs[3]) && !contracting ? null : false), (contracting ? "kontrahierend: W4 kürzer als W2" : "expandierend: W4 länger als W2"), EWP + "Kap. 1, Diagonal Triangles (Keilform)");
      }
      if (c.n >= 5) {
        var l5 = c.L(5);
        if (contracting) {
          if (l5 >= c.L(3)) R(out, "DIAGONAL_W5_VS_W3", "DEFINITION", false, "kontrahierend: W5 muss kürzer als W3 sein", EWP + "Kap. 1, Diagonal Triangles");
          else R(out, "DIAGONAL_W5_VS_W3", "DEFINITION", dev(legs[4]) ? null : true, "kontrahierend: W5 kürzer als W3", EWP + "Kap. 1, Diagonal Triangles");
        } else {
          if (l5 > c.L(3)) R(out, "DIAGONAL_W5_VS_W3", "DEFINITION", true, "expandierend: W5 länger als W3", EWP + "Kap. 1, Diagonal Triangles");
          else R(out, "DIAGONAL_W5_VS_W3", "DEFINITION", dev(legs[4]) ? null : false, "expandierend: W5 muss länger als W3 sein", EWP + "Kap. 1, Diagonal Triangles");
        }
      }
    }
    if (c.n >= 5 && !dev(legs[4])) R(out, "W3_NOT_SHORTEST", "HARD", c.L(3) >= Math.min(c.L(1), c.L(5)), "Welle 3 ist nie die kürzeste", EWP + "Kap. 1, Diagonal Triangles");
    void kind;
    return out;
  }
  function diagonalGuidelines(legs) {
    var c = Ctx(legs), g = {};
    if (c.n >= 2 && !dev(legs[1])) g.W2_DEEP = band(c.L(2) / c.L(1), [0.66, 0.81], [0.5, 0.95]);
    if (c.n >= 4 && !dev(legs[3])) g.W4_DEEP = band(c.L(4) / c.L(3), [0.66, 0.81], [0.5, 0.95]);
    if (c.n >= 5 && !dev(legs[4])) g.THROW_OVER = c.o(5) > c.o(3) ? 1 : 0.4;   // W5 endet meist jenseits W3 (Throw-over/Truncation selten)
    return g;
  }

  /* ---------------------------------------------------------- ZIGZAG */
  function zigzagRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    notBeyondAgainst(c, out, "B_NOT_BEYOND_A_ORIGIN", 2, 0, "HARD", "Welle B retraced nie mehr als 100 % von Welle A", EWP + "Kap. 1, Zigzags");
    if (c.n >= 2 && !dev(legs[1])) R(out, "ZIGZAG_B_BELOW_90PCT", "DEFINITION", c.L(2) / c.L(1) < 0.9, "Zigzag: B retraced weniger als 90 % von A (sonst Flat)", EWI + "Flat-Definition B >= 90 %");
    else if (c.n >= 2 && c.L(2) / c.L(1) >= 0.9) R(out, "ZIGZAG_B_BELOW_90PCT", "DEFINITION", false, "B hat bereits 90 % von A retraced", EWI + "Flat-Definition B >= 90 %");
    return out;
  }
  function zigzagGuidelines(legs) {
    var c = Ctx(legs), g = {};
    if (c.n >= 2 && !dev(legs[1])) g.B_RETRACEMENT = band(c.L(2) / c.L(1), [0.382, 0.786], [0.236, 0.9]);
    if (c.n >= 3 && !dev(legs[2])) {
      g.C_BEYOND_A_END = c.o(3) > c.o(1) ? 1 : 0.15;   // EWP Kap. 1, Zigzags: "almost always" — Guideline, nicht Regel
      g.C_PROPORTION = Math.max(near(c.L(3) / c.L(1), 1.0, 0.25) || 0, 0.8 * (near(c.L(3) / c.L(1), 1.618, 0.2) || 0), 0.7 * (near(c.L(3) / c.L(1), 0.618, 0.2) || 0));
    }
    return g;
  }

  /* ------------------------------------------------------------ FLAT */
  function flatRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    if (c.n >= 2) {
      var b = c.L(2) / c.L(1);
      if (dev(legs[1]) && b < 0.9) R(out, "FLAT_B_AT_LEAST_90PCT", "DEFINITION", null, "B läuft noch (" + Math.round(b * 100) + " % von A)", EWI + "Flat: B >= 90 % von A");
      else R(out, "FLAT_B_AT_LEAST_90PCT", "DEFINITION", b >= 0.9, "Flat: B retraced mindestens 90 % von A", EWI + "Flat: B >= 90 % von A");
      R(out, "FLAT_B_NOT_EXCESSIVE", "VU_OPERATIONAL", b <= 2.0, "B überschreitet A hoechstens um 100 % (sonst neuer Trend, keine Korrektur)", "VU-Klassengrenze (EWP Kap. 1, Flats: expandierte B typ. 123,6–138,2 %)");
    }
    return out;
  }
  function flatVariant(legs) {
    if (legs.length < 2) return null;
    var c = Ctx(legs), b = c.L(2) / c.L(1);
    if (b <= 1.05) return "REGULAR";
    if (legs.length < 3 || dev(legs[2])) return "EXPANDED_OR_RUNNING";
    return c.o(3) > c.o(1) ? "EXPANDED" : "RUNNING";
  }
  function flatGuidelines(legs) {
    var c = Ctx(legs), g = {};
    if (c.n >= 2 && !dev(legs[1])) g.B_PROPORTION = band(c.L(2) / c.L(1), [0.9, 1.382], [0.9, 1.618]);
    if (c.n >= 3 && !dev(legs[2])) {
      var v = flatVariant(legs), r = c.L(3) / c.L(1);
      g.C_PROPORTION = v === "REGULAR" ? band(r, [1.0, 1.236], [0.8, 1.618]) : v === "EXPANDED" ? band(r, [1.382, 1.618], [1.0, 2.618]) : 0.35;   // Running Flats sind selten (EWP Kap. 1, Flats)
      g.C_BEYOND_A_END = c.o(3) > c.o(1) ? 1 : 0.4;
    }
    return g;
  }

  /* -------------------------------------------------------- TRIANGLE */
  function triangleRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    /* Kontrahierend (inkl. Barrier, Running): C nicht jenseits A-Ende, D nicht jenseits B-Ende, E nicht jenseits C-Ende. */
    var tol = TRIANGLE_BARRIER_TOL * c.L(1);
    /* "Nicht jenseits" (kontrahierend) ist sofort entscheidbar; "jenseits" (expandierend) bleibt auf einer
       laufenden Welle offen, solange sie es noch erreichen kann (Review-Befund 5). */
    var contracting = true, expanding = true;
    if (c.n >= 3) { contracting = contracting && c.o(3) < c.o(1); expanding = expanding && (c.o(3) > c.o(1) || dev(legs[2])); }
    if (c.n >= 4) { contracting = contracting && c.o(4) > c.o(2) - tol; expanding = expanding && (c.o(4) < c.o(2) || dev(legs[3])); }
    if (c.n >= 5) { contracting = contracting && c.o(5) < c.o(3); expanding = expanding && (c.o(5) > c.o(3) || dev(legs[4])); }
    if (c.n >= 3) R(out, "TRIANGLE_BOUNDARIES", "DEFINITION", contracting || expanding, contracting ? "kontrahierend: Extreme laufen zusammen" : expanding ? "expandierend: Extreme laufen auseinander" : "weder kontrahierend noch expandierend", EWP + "Kap. 1, Triangles");
    if (c.n >= 5 && contracting && !dev(legs[4])) R(out, "TRIANGLE_E_INSIDE", "HARD", c.L(5) < c.L(3), "kontrahierend: E kürzer als C", EWP + "Kap. 1, Triangles");
    return out;
  }
  function triangleShape(legs) {
    if (legs.length < 3) return null;
    var c = Ctx(legs);
    return c.o(3) < c.o(1) ? "CONTRACTING" : "EXPANDING";
  }
  function triangleGuidelines(legs) {
    var c = Ctx(legs), g = {};
    var ok = [];
    for (var k = 2; k <= Math.min(c.n, 5); k++) if (!dev(legs[k - 1])) ok.push(band(c.L(k) / c.L(k - 1), [0.5, 0.886], [0.3, 1.0]));
    if (ok.length && triangleShape(legs) === "CONTRACTING") g.LEG_RATIOS = ok.reduce(function (a, b) { return a + b; }, 0) / ok.length;
    if (triangleShape(legs) === "EXPANDING") g.EXPANDING_RARE = 0.4;
    return g;
  }

  /* --------------------------------------------------- COMBINATIONS */
  /* Kompakt (3 Legs W-X-Y): auf der Analyseskala sichtbar als drei Legs,
     deren W und Y jeweils DREI Unterwellen zeigen (3-3-3). Ohne aufgeloeste
     Unterteilung nicht von Zigzag/Flat unterscheidbar → DEFINITION. */
  function wxyRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    notBeyondAgainst(c, out, "X_NOT_BEYOND_W_ORIGIN", 2, 0, "DEFINITION", "X retraced nie mehr als 100 % von W", EWP + "Kap. 1, Combinations");
    /* Ohne aufgeloeste Unterteilung ist W-X-Y nicht von Zigzag/Flat zu
       unterscheiden → die Klassengrenze gilt dann als NICHT erfuellt. */
    var subW = legs[0].sub, subY = legs[2] ? legs[2].sub : null;
    R(out, "WXY_W_IS_THREE", "DEFINITION", !!(subW && subW.cls === "K"), "W unterteilt sich sichtbar in drei Wellen (Korrektur)", EWP + "Kap. 1, Combinations");
    if (legs[2] && !dev(legs[2])) R(out, "WXY_Y_IS_THREE", "DEFINITION", !!(subY && subY.cls === "K"), "Y unterteilt sich sichtbar in drei Wellen", EWP + "Kap. 1, Combinations");
    return out;
  }
  function wxyGuidelines(legs) {
    var c = Ctx(legs), g = {};
    if (c.n >= 2 && !dev(legs[1])) g.X_PROPORTION = band(c.L(2) / c.L(1), [0.382, 0.786], [0.2, 1.0]);
    if (c.n >= 3 && !dev(legs[2])) g.Y_PROPORTION = band(c.L(3) / c.L(1), [0.618, 1.618], [0.382, 2.618]);
    return g;
  }
  /* Ausgeschrieben (7 Legs): Zigzag(3) – X(1) – Zigzag(3) = Double Zigzag. */
  function doubleZigzagRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    var W = legs.slice(0, 3), Y = legs.slice(4, 7);
    zigzagRules(W).forEach(function (r) { r.ruleId = "W_" + r.ruleId; out.push(r); });
    if (legs.length >= 4) notBeyondAgainst(c, out, "X_NOT_BEYOND_W_ORIGIN", 4, 0, "DEFINITION", "X retraced nie mehr als 100 % von W", EWP + "Kap. 1, Combinations");
    if (Y.length) zigzagRules(Y).forEach(function (r) { r.ruleId = "Y_" + r.ruleId; out.push(r); });
    if (legs.length >= 7) beyond(c, out, "Y_BEYOND_W_END", 7, 3, "DEFINITION", "Double Zigzag: Y läuft über das Ende von W hinaus", EWP + "Kap. 1, Double Zigzags (\"each zigzag makes progress\")");
    return out;
  }
  function doubleZigzagGuidelines(legs) {
    var g = {}, W = zigzagGuidelines(legs.slice(0, 3));
    Object.keys(W).forEach(function (k) { g["W_" + k] = W[k]; });
    if (legs.length >= 7) { var Y = zigzagGuidelines(legs.slice(4, 7)); Object.keys(Y).forEach(function (k) { g["Y_" + k] = Y[k]; }); }
    if (legs.length >= 4 && !dev(legs[3])) { var c = Ctx(legs); g.X_PROPORTION = band(c.L(4) / Math.abs(c.p[3] - c.p[0]), [0.382, 0.786], [0.2, 0.95]); }
    return g;
  }

  /* Dreifach-Zigzag, kompakt (5 Legs W-X-Y-X-Z): drei Zigzags, verbunden durch zwei X; jeder Zigzag schreitet voran
     (EWP Kap. 1, Double and Triple Zigzags). W, Y, Z muessen sich sichtbar als Dreier zeigen — sonst waere es ein Impuls
     oder ein Dreieck (gleiche Wellenzahl). */
  function tripleZigzagRules(legs) {
    var c = Ctx(legs), out = [];
    alternation(c, out);
    notBeyondAgainst(c, out, "X_NOT_BEYOND_W_ORIGIN", 2, 0, "DEFINITION", "X retraced nie mehr als 100 % von W", EWP + "Kap. 1, Double and Triple Zigzags");
    beyond(c, out, "Y_BEYOND_W_END", 3, 1, "DEFINITION", "Y läuft über das Ende von W hinaus", EWP + "Kap. 1, Double and Triple Zigzags");
    notBeyondAgainst(c, out, "X2_NOT_BEYOND_Y_ORIGIN", 4, 2, "DEFINITION", "Das zweite X retraced Y nicht vollständig", EWP + "Kap. 1, Double and Triple Zigzags");
    beyond(c, out, "Z_BEYOND_Y_END", 5, 3, "DEFINITION", "Z läuft über das Ende von Y hinaus", EWP + "Kap. 1, Double and Triple Zigzags");
    [[0, "TZ_W_IS_THREE", "W"], [2, "TZ_Y_IS_THREE", "Y"], [4, "TZ_Z_IS_THREE", "Z"]].forEach(function (q) {
      var l = legs[q[0]]; if (!l) return;
      if (dev(l)) return;
      R(out, q[1], "DEFINITION", !!(l.sub && l.sub.cls === "K" && (l.sub.pattern === "ZIGZAG" || l.sub.pattern === "DOUBLE_ZIGZAG")), q[2] + " unterteilt sich sichtbar als Zigzag (nicht Flat oder Dreieck — sonst Triple Three)", EWP + "Kap. 1, Double and Triple Zigzags");
    });
    return out;
  }
  function tripleZigzagGuidelines(legs) {
    var c = Ctx(legs), g = {};
    if (c.n >= 2 && !dev(legs[1])) g.X_PROPORTION = band(c.L(2) / c.L(1), [0.382, 0.786], [0.2, 0.95]);
    if (c.n >= 3 && !dev(legs[2])) g.Y_PROPORTION = band(c.L(3) / c.L(1), [0.618, 1.618], [0.382, 2.618]);
    if (c.n >= 5 && !dev(legs[4])) g.Z_PROPORTION = band(c.L(5) / c.L(3), [0.618, 1.618], [0.382, 2.618]);
    return g;
  }

  // =====================================================================
  //  INVALIDATION & PROJEKTION
  // =====================================================================
  /*
   * Fuer eine laufende Welle dw gibt es zwei Niveaus:
   *   hard      — jenseits davon verletzt der Count eine HARD/DEFINITION-Regel
   *               (Muster ungueltig)
   *   revision  — jenseits davon bleibt das Muster moeglich, aber die
   *               aktuelle Wellenzuordnung aendert sich (z. B. W2 laeuft
   *               weiter statt W3 hat begonnen).
   * dir: "below" (bullish) bzw. "above" (bearish) — orientiert an s des Musters.
   */
  function level(price, s, ruleId, statement) { return isNum(price) ? { price: price, direction: s > 0 ? "below" : "above", ruleId: ruleId, statement: statement } : null; }
  function invalidation(type, legs, dw) {
    var c = Ctx(legs), s = c.s, p = c.p;
    var out = { hard: null, revision: null };
    /* Welle 1 / A laeuft: das Muster begann am Ursprung — jenseits davon gibt es diese Lesart nicht (Review-Befund 8). */
    if (dw === 1) { out.hard = level(p[0], s, "PATTERN_ORIGIN", "Ursprung der ersten Welle"); return out; }
    if (type === "IMPULSE") {
      if (dw === 2) out.hard = level(p[0], s, "W2_NOT_BEYOND_W1_ORIGIN", "Welle 2 darf den Ursprung von Welle 1 nicht unterschreiten");
      if (dw === 3) { out.hard = level(p[0], s, "W2_NOT_BEYOND_W1_ORIGIN", "Ursprung von Welle 1"); out.revision = level(p[2], s, "W3_START", "unter dem Ende von Welle 2 wäre Welle 2 noch nicht beendet"); }
      if (dw === 4) out.hard = level(p[1], s, "W4_NO_OVERLAP_W1", "Welle 4 darf das Gebiet von Welle 1 nicht betreten");
      if (dw === 5) { out.hard = level(p[1], s, "W4_NO_OVERLAP_W1", "Ende von Welle 1"); out.revision = level(p[4], s, "W5_START", "unter dem Ende von Welle 4 wäre Welle 4 noch nicht beendet"); }
    } else if (type === "LEADING_DIAGONAL" || type === "ENDING_DIAGONAL") {
      var contracting = legs.length >= 3 && c.L(3) < c.L(1);
      if (dw === 2) out.hard = level(p[0], s, "W2_NOT_BEYOND_W1_ORIGIN", "Ursprung von Welle 1");
      if (dw === 3) { out.hard = level(p[0], s, "W2_NOT_BEYOND_W1_ORIGIN", "Ursprung von Welle 1"); out.revision = level(p[2], s, "W3_START", "Ende von Welle 2"); }
      if (dw === 4) {
        /* kontrahierend bindet "W4 kuerzer als W2" frueher als der W3-Ursprung (Review-Befund 6). */
        if (contracting) { var lim = p[3] - s * c.L(2); out.hard = s * lim > s * p[2] ? level(lim, s, "DIAGONAL_W4_VS_W2", "kontrahierend: Welle 4 muss kürzer als Welle 2 bleiben") : level(p[2], s, "W4_NOT_BEYOND_W3_ORIGIN", "Ursprung von Welle 3"); }
        else out.hard = level(p[2], s, "W4_NOT_BEYOND_W3_ORIGIN", "Welle 4 darf den Ursprung von Welle 3 nicht erreichen");
      }
      if (dw === 5) { out.hard = level(p[2], s, "W4_NOT_BEYOND_W3_ORIGIN", "Ursprung von Welle 3"); out.revision = level(p[4], s, "W5_START", "Ende von Welle 4"); }
    } else if (type === "ZIGZAG" || type === "FLAT" || type === "WXY") {
      /* B (bzw. X) darf den Ursprung nicht erreichen; Flat: B hoechstens 200 % von A. Laeuft C, ist ein
         Ruecklauf ueber das B-Ende eine NEUZUORDNUNG (B laeuft weiter), keine Regelverletzung (Review-Befund 7). */
      var hardB = type === "FLAT" ? level(p[1] - s * 2.0 * c.L(1), s, "FLAT_B_NOT_EXCESSIVE", "B läuft über 200 % von A hinaus")
                                  : level(p[0], s, type === "WXY" ? "X_NOT_BEYOND_W_ORIGIN" : "B_NOT_BEYOND_A_ORIGIN", "Ursprung der Korrektur");
      if (dw === 2) out.hard = hardB;
      if (dw === 3) { out.hard = hardB; out.revision = level(p[2], s, "C_START", "jenseits des B-Endes wäre Welle B noch nicht beendet"); }
    } else if (type === "TRIANGLE") {
      /* Nur kontrahierend gibt es eine Grenze: die laufende Welle darf das Extrem zwei Wellen zuvor nicht
         ueberschreiten (D mit Barrier-Toleranz). Expandierend: keine harte Grenze (Review-Befund 5). */
      if (dw >= 2 && dw <= 5) out.revision = level(p[dw - 1], dw % 2 === 1 ? s : -s, "TRIANGLE_LEG_START", "jenseits des Starts der laufenden Welle wäre die vorige Welle nicht beendet");
      if (dw >= 3 && dw <= 5 && triangleShape(legs) === "CONTRACTING") {
        var dirSign = dw % 2 === 1 ? s : -s, ref = p[dw - 2] + (dw === 4 ? dirSign * TRIANGLE_BARRIER_TOL * c.L(1) : 0);
        out.hard = { price: ref, direction: dirSign > 0 ? "above" : "below", ruleId: "TRIANGLE_BOUNDARIES", statement: "Dreieck ungültig, wenn die laufende Welle das Extrem von zwei Wellen zuvor überschreitet" };
      }
    } else if (type === "TRIPLE_ZIGZAG") {
      if (dw === 2) out.hard = level(p[0], s, "X_NOT_BEYOND_W_ORIGIN", "X darf den Ursprung von W nicht erreichen");
      if (dw === 3) { out.hard = level(p[0], s, "X_NOT_BEYOND_W_ORIGIN", "Ursprung von W"); out.revision = level(p[2], s, "Y_START", "Ende des ersten X"); }
      if (dw === 4) out.hard = level(p[2], s, "X2_NOT_BEYOND_Y_ORIGIN", "das zweite X darf den Ursprung von Y nicht erreichen");
      if (dw === 5) { out.hard = level(p[2], s, "X2_NOT_BEYOND_Y_ORIGIN", "Ursprung von Y"); out.revision = level(p[4], s, "Z_START", "Ende des zweiten X"); }
    } else if (type === "DOUBLE_ZIGZAG") {
      if (dw <= 3) return invalidation("ZIGZAG", legs.slice(0, 3), dw);
      if (dw === 4) out.hard = level(p[0], s, "X_NOT_BEYOND_W_ORIGIN", "X darf den Ursprung von W nicht erreichen");
      if (dw >= 5) { var inner = invalidation("ZIGZAG", legs.slice(4), dw - 4); out.hard = inner.hard; out.revision = inner.revision; }
    }
    return out;
  }

  /**
   * Zielkandidaten (Preis) fuer die naechste(n) Welle(n), aus den
   * Fibonacci-Proportionen der Literatur. Jeder Kandidat traegt die
   * Relation in Klartext — keine Zahl ohne Herkunft.
   * @returns {{phase:string, kind:"COMPLETION"|"TARGET", price:number, ratio:number, relation:string, weight:number}[]}
   */
  function projections(type, legs, dw, complete) {
    var c = Ctx(legs), s = c.s, p = c.p, out = [];
    function add(phase, kind, price, r, relation, w) { if (isNum(price) && price > 0) out.push({ phase: phase, kind: kind, price: price, ratio: r, relation: relation, weight: w }); }
    var L1 = c.L(1);
    if (type === "IMPULSE" || type === "LEADING_DIAGONAL" || type === "ENDING_DIAGONAL") {
      var diag = type !== "IMPULSE";
      if (complete) {
        var span = Math.abs(p[5] - p[0]);
        [0.382, 0.5, 0.618].forEach(function (r, k) { add("NEXT_CORRECTION", "TARGET", p[5] - s * span * r, r, r * 100 + " % Korrektur des gesamten Impulses", k === 1 ? 1 : 0.8); });
        if (!diag) add("NEXT_CORRECTION", "TARGET", p[4], 1, "Bereich der vorherigen Welle 4", 0.9);
        else add("NEXT_CORRECTION", "TARGET", p[0], 1, "Ursprung der Diagonale (typisches Ziel nach Ending Diagonal)", 0.9);
        return out;
      }
      if (dw === 2) {
        (diag ? [0.66, 0.81] : [0.5, 0.618]).forEach(function (r) { add("2", "COMPLETION", p[1] - s * L1 * r, r, "Welle 2 = " + r + " × Welle 1", 1); });
        var w2mid = p[1] - s * L1 * (diag ? 0.7 : 0.56);
        [1.0, 1.618, 2.618].forEach(function (r, k) { add("3", "TARGET", w2mid + s * L1 * r, r, "Welle 3 = " + r + " × Welle 1 (ab erwarteter Welle-2-Zone)", [0.7, 1, 0.6][k]); });
      }
      if (dw === 3) {
        add("3", "TARGET", p[1], 1, "Ende von Welle 1 (Bestätigung der Lesart)", 0.6);
        (diag ? [0.618, 1.0] : [1.0, 1.618, 2.618]).forEach(function (r, k) { add("3", "TARGET", p[2] + s * L1 * r, r, "Welle 3 = " + r + " × Welle 1", diag ? 1 : [0.6, 1, 0.6][k]); });
      }
      if (dw === 4) {
        var L3 = c.L(3);
        (diag ? [0.66, 0.81] : [0.236, 0.382, 0.5]).forEach(function (r, k) { add("4", "COMPLETION", p[3] - s * L3 * r, r, "Welle 4 = " + r + " × Welle 3", diag ? 1 : [0.7, 1, 0.6][k]); });
        var w4 = p[3] - s * L3 * (diag ? 0.7 : 0.382);
        w5Targets(w4, diag);
      }
      if (dw === 5) w5Targets(p[4], diag);
      return out;
    }
    function w5Targets(base, diag) {
      var L3 = c.L(3), net13 = Math.abs(p[3] - p[0]);
      var cap = L3 < L1 ? L3 : (diag && L3 < L1 ? L3 : null);
      if (diag) { var L5c = L3 < L1 ? L3 * 0.8 : L3 * 1.2; add("5", "TARGET", base + s * L5c, null, (L3 < L1 ? "kontrahierend: Welle 5 kürzer als Welle 3" : "expandierend: Welle 5 länger als Welle 3"), 1); }
      else {
        var ext3 = L3 > 1.618 * L1;
        add("5", "TARGET", base + s * L1 * (ext3 ? 1.0 : 0.618), ext3 ? 1.0 : 0.618, ext3 ? "Welle 5 = Welle 1 (Welle 3 verlängert)" : "Welle 5 = 0,618 × Welle 1", 1);
        add("5", "TARGET", base + s * net13 * 0.618, 0.618, "Welle 5 = 0,618 × Strecke Welle 1–3", 0.8);
        if (!ext3) add("5", "TARGET", base + s * L1 * 1.0, 1.0, "Welle 5 = Welle 1", 0.7);
      }
      if (cap !== null) out.push({ phase: "5", kind: "CAP", price: base + s * cap, ratio: 1, relation: "Welle 5 darf nicht länger als Welle 3 werden (W3 nie die kürzeste)", weight: 0 });
    }
    if (type === "ZIGZAG" || type === "FLAT" || type === "WXY" || type === "DOUBLE_ZIGZAG" || type === "TRIPLE_ZIGZAG") {
      var A = type === "DOUBLE_ZIGZAG" || type === "TRIPLE_ZIGZAG" ? null : L1;
      if (complete) {
        var span2 = Math.abs(p[p.length - 1] - p[0]);
        add("AFTER_CORRECTION", "TARGET", p[0], 1, "Ursprung der Korrektur (Trend setzt sich fort)", 1);
        add("AFTER_CORRECTION", "TARGET", p[p.length - 1] - s * span2 * 1.618, 1.618, "1,618 × Korrekturlänge vom Korrekturende", 0.6);
        return out;
      }
      if (type === "DOUBLE_ZIGZAG" || type === "TRIPLE_ZIGZAG") return out;
      if (dw === 2) {
        if (type === "FLAT") [0.9, 1.0, 1.236].forEach(function (r, k) { add("B", "COMPLETION", p[1] - s * A * r, r, "B = " + r + " × A (Flat)", [0.7, 1, 0.7][k]); });
        else [0.5, 0.618, 0.786].forEach(function (r, k) { add("B", "COMPLETION", p[1] - s * A * r, r, "B = " + r + " × A", [0.8, 1, 0.6][k]); });
        var bmid = p[1] - s * A * (type === "FLAT" ? 1.0 : 0.6);
        (type === "FLAT" ? [1.0, 1.618] : [1.0, 1.618, 0.618]).forEach(function (r, k) { add("C", "TARGET", bmid + s * A * r, r, "C = " + r + " × A (ab erwarteter B-Zone)", [1, 0.7, 0.5][k]); });
      }
      if (dw === 3) {
        if (type === "FLAT") { var v = flatVariant(legs); (v === "REGULAR" ? [1.0, 1.236] : [1.382, 1.618]).forEach(function (r) { add("C", "TARGET", p[2] + s * A * r, r, "C = " + r + " × A (" + (v === "REGULAR" ? "reguläre" : "expandierte") + " Flat)", 1); }); }
        else [0.618, 1.0, 1.618].forEach(function (r, k) { add("C", "TARGET", p[2] + s * A * r, r, "C = " + r + " × A", [0.6, 1, 0.7][k]); });
      }
      return out;
    }
    if (type === "TRIANGLE") {
      if (complete) {
        /* Thrust nach dem Dreieck ≈ breiteste Stelle (Welle A) ab Ende E, gegen die Richtung von E (EWP Kap. 1, Triangles). */
        var thrustDir = -Ctx([legs[4]]).s;
        add("THRUST", "TARGET", p[5] + thrustDir * L1, 1, "Ausbruch nach dem Dreieck ≈ Breite von Welle A", 1);
        add("THRUST", "TARGET", p[5] + thrustDir * L1 * 0.618, 0.618, "0,618 × Breite des Dreiecks", 0.6);
      }
      return out;
    }
    return out;
  }

  // =====================================================================
  //  REGISTRY
  // =====================================================================
  var PATTERNS = {
    IMPULSE:          { type: "IMPULSE", family: "MOTIVE", waves: 5, labels: ["1", "2", "3", "4", "5"], subdivision: ["M", "K", "M", "K", "M"], rules: impulseRules, guidelines: impulseGuidelines,
                        positions: ["1", "3", "5", "A", "C", "ROOT"], source: EWP + "Kap. 1" },
    LEADING_DIAGONAL: { type: "LEADING_DIAGONAL", family: "MOTIVE", waves: 5, labels: ["1", "2", "3", "4", "5"], subdivision: ["MK", "K", "MK", "K", "MK"], rules: function (l) { return diagonalRules(l, "LEADING"); }, guidelines: diagonalGuidelines,
                        positions: ["1", "A"], source: EWP + "Kap. 1, Diagonal Triangles (Leading Diagonal)" },
    ENDING_DIAGONAL:  { type: "ENDING_DIAGONAL", family: "MOTIVE", waves: 5, labels: ["1", "2", "3", "4", "5"], subdivision: ["K", "K", "K", "K", "K"], rules: function (l) { return diagonalRules(l, "ENDING"); }, guidelines: diagonalGuidelines,
                        positions: ["5", "C"], source: EWP + "Kap. 1, Diagonal Triangles (Ending Diagonal)" },
    ZIGZAG:           { type: "ZIGZAG", family: "CORRECTIVE", waves: 3, labels: ["A", "B", "C"], subdivision: ["M", "K", "M"], rules: zigzagRules, guidelines: zigzagGuidelines,
                        positions: ["2", "4", "B", "W", "Y", "X"], source: EWP + "Kap. 1, Zigzags–44 (Zigzag)" },
    FLAT:             { type: "FLAT", family: "CORRECTIVE", waves: 3, labels: ["A", "B", "C"], subdivision: ["K", "K", "M"], rules: flatRules, guidelines: flatGuidelines,
                        positions: ["2", "4", "B", "W", "Y", "X"], source: EWP + "Kap. 1, Flats" },
    TRIANGLE:         { type: "TRIANGLE", family: "CORRECTIVE", waves: 5, labels: ["A", "B", "C", "D", "E"], subdivision: ["K", "K", "K", "K", "K"], rules: triangleRules, guidelines: triangleGuidelines,
                        positions: ["4", "B", "X", "Y"], source: EWP + "Kap. 1, Triangles (Triangle)" },
    WXY:              { type: "WXY", family: "CORRECTIVE", waves: 3, labels: ["W", "X", "Y"], subdivision: ["K", "K", "K"], rules: wxyRules, guidelines: wxyGuidelines,
                        positions: ["2", "4", "B"], source: EWP + "Kap. 1, Combinations (Double Three)" },
    DOUBLE_ZIGZAG:    { type: "DOUBLE_ZIGZAG", family: "CORRECTIVE", waves: 7, labels: ["A", "B", "C", "X", "A", "B", "C"], displayLabels: ["W·a", "W·b", "W·c", "X", "Y·a", "Y·b", "Y·c"], subdivision: ["M", "K", "M", "K", "M", "K", "M"], rules: doubleZigzagRules, guidelines: doubleZigzagGuidelines,
                        positions: ["2", "4", "B"], source: EWP + "Kap. 1, Double Zigzags (Double Zigzag)" },
    TRIPLE_ZIGZAG:    { type: "TRIPLE_ZIGZAG", family: "CORRECTIVE", waves: 5, labels: ["W", "X", "Y", "X", "Z"], displayLabels: ["W", "X", "Y", "X₂", "Z"], subdivision: ["K", "K", "K", "K", "K"], rules: tripleZigzagRules, guidelines: tripleZigzagGuidelines,
                        positions: ["2", "4", "B"], source: EWP + "Kap. 1, Double and Triple Zigzags (Triple Zigzag)", since: "elliott-rules-3.0.0" }
  };
  var TYPES = Object.keys(PATTERNS);
  /* Engine 2.x kennt nur die Muster bis Regelwerk 2.0.1 (Vorher/Nachher-Vergleiche bleiben reproduzierbar). */
  var TYPES_V2 = TYPES.filter(function (t) { return !PATTERNS[t].since; });

  /** Bewertet ein (vollstaendiges oder partielles) Muster. */
  function evaluate(type, legs) {
    var P = PATTERNS[type];
    if (!P) throw new Error("Unbekanntes Muster " + type);
    if (!legs.length || legs.length > P.waves) return null;
    var rules = P.rules(legs);
    var violations = rules.filter(function (r) { return r.passed === false; });
    var gm = P.guidelines(legs), keys = Object.keys(gm).filter(function (k) { return isNum(gm[k]); });
    var gfit = keys.length ? keys.reduce(function (a, k) { return a + gm[k]; }, 0) / keys.length : null;
    return {
      type: type, family: P.family, sign: legs[0].toPrice >= legs[0].fromPrice ? 1 : -1, legs: legs, wavesPresent: legs.length, wavesTotal: P.waves,
      rules: rules, valid: violations.length === 0, violations: violations.map(function (r) { return r.ruleId; }),
      openRules: rules.filter(function (r) { return r.passed === null; }).map(function (r) { return r.ruleId; }),
      guidelines: gm, guidelineFit: gfit, variant: type === "FLAT" ? flatVariant(legs) : type === "TRIANGLE" ? triangleShape(legs) : type.indexOf("DIAGONAL") >= 0 && legs.length >= 3 && !dev(legs[2]) ? (len(legs[2]) < len(legs[0]) ? "CONTRACTING" : "EXPANDING") : null
    };
  }

  /** Nur Regeln (ohne Richtlinien) — fuer Suchverfahren, die sehr viele Teilmuster pruefen. */
  function checkRules(type, legs) {
    var Pt = PATTERNS[type];
    if (!legs.length || legs.length > Pt.waves) return false;
    var rules = Pt.rules(legs);
    for (var k = 0; k < rules.length; k++) if (rules[k].passed === false) return false;
    return true;
  }

  var api = { checkRules: checkRules, TYPES_V2: TYPES_V2, RULE_SET_VERSION: RULE_SET_VERSION, PATTERNS: PATTERNS, TYPES: TYPES, evaluate: evaluate, invalidation: invalidation, projections: projections,
              band: band, near: near, len: len, ratio: ratio, flatVariant: flatVariant, triangleShape: triangleShape };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottPatterns = api; }
})(typeof window !== "undefined" ? window : globalThis);
