/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/elliott-v3.js
   ELLIOTT 3.0 — HIERARCHISCHER WELLEN-PARSER

   Warum eine neue Architektur (ELLIOTT_ENGINE_QUALITY_PREREG.md, Korpus v2):
   V2 zaehlt auf festen Pivot-Skalen (4/8/15/28 %). Eine Skala ist aber kein
   Wellengrad: in einem Impuls mit verlaengerter Welle 3 sind die Unterwellen
   von Welle 3 groesser als Welle 2 — jede feste Schwelle mischt dann Grade.
   V2 waehlt ausserdem die Skala nach dem Rangwert der besten Lesart, nicht
   nach Grad-Kriterien. Ergebnis im Korpus: 9 % richtige Hauptzaehlungen,
   die meisten Fehler eine Ebene zu tief.

   V3 waehlt Wellenenden FREI aus einem feinen, volatilitaetsnormierten
   Pivot-Pool ("Monowellen") und prueft Grad-Konsistenz explizit:

   1. POOL. Kausaler ZigZag auf Schlusskursen mit Schwelle k·ATR (nur
      Preisdifferenzen → invariant gegen Preis×c und Preis+c).
   2. EXTREMALE SEGMENTE. Eine Welle von a nach b ist nur zulaessig, wenn a
      und b die Extreme des Abschnitts [a, b] sind (eine Welle endet an
      ihrem Extrem — EWP Kap. 1, Wellen werden zwischen Extremen gezaehlt).
   3. SUCHE. Fuer jede Musterklasse: Tiefensuche ueber Wellenenden, nach
      jedem Schritt Regelpruefung (patterns.js: HARD/DEFINITION, Quelle je
      Regel). Ein Muster endet JETZT: entweder mit laufender Welle (Ende =
      aktuelles Extrem) oder abgeschlossen an einem Pivot, der seither nicht
      ueberschritten wurde (die Folgewelle laeuft).
   4. UNTERTEILUNG RELATIV ZUR WELLENGROESSE. Jede Welle wird im Skalenraum
      zerlegt (ZigZag mit Schwellen 4–40 % ihrer eigenen Laenge); stabil
      bleibende Wellenzahlen (5 bzw. 3) und ihre Regelkonformitaet ergeben
      Motiv/Korrektur — die konkrete Unterstruktur (z. B. "Welle B = Flat")
      wird ausgegeben (verschachtelte Zaehlung).
   5. GRAD-KONSISTENZ. Aehnlichkeit benachbarter Wellen (NEoWave-Rule of
      Similarity, Neely 1990 — VU_OPERATIONAL), Grad-Trennung (Unterwellen
      einer Welle kleiner als die Nachbarwellen des Musters), Signifikanz des
      Ursprungs (der Startpunkt ist Extrem einer Bewegung mindestens
      vergleichbarer Groesse).
   6. HOEHERER GRAD aus derselben Suche: die beste Lesart, in der die
      Hauptzaehlung eine einzelne Welle ist.

   Keine Wahrscheinlichkeit; gleiche Ausgabeform wie V2 (Produkt, API v3).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../hash.js") : global.VUHash;
  var P = isNode ? require("./patterns.js") : global.VUTechnical.ElliottPatterns;
  var V2 = isNode ? require("./elliott-v2.js") : global.VUTechnical.ElliottV2;

  var ENGINE_VERSION = "elliott-3.2.2";   // 3.2.1 = 3.2.0 + Datenlage-Fix fuer Tagesreihen (nach HOLDOUT-3); 3.2.2 = abgeschlossene WXY hoechstens NIEDRIG (Mission IV, nur Anwendbarkeit, Zaehlung unveraendert)

  var DEFAULTS = {
    poolAtr: 1.0,                 // Monowellen-Schwelle in ATR
    windowYears: 6,               // Ursprung hoechstens so weit zurueck
    maxNodes: 25000,              // Suchbudget je Analyse (Korpus DEVELOPMENT: 60 000 → 25 000 ohne Genauigkeitsverlust)
    maxScored: 500,               // vollstaendig bewertete Kandidaten (nach pfadbasierter Vorauswahl)
    similarity: 1 / 3,            // NEoWave Rule of Similarity
    subGrid: [0.04, 0.06, 0.09, 0.13, 0.19, 0.28, 0.4],
    unresolvedFit: 0.4,
    anchorMinRatio: 0.3,
    orthodoxMax: 0.4,             // Ueberschiessen der Folgewelle (B eines expandierten Flats) relativ zu ihrer Laenge
    orthodoxShortMax: 0.7,        // Ende hinter dem Extrem (Dreieck-E, Running-Flat-C): Abstand zum Extrem relativ zur Ausdehnung
    anchorMinAtr: 4,
    subNoise: 0,                  // 3.2: Rauschschwelle der Unterteilung in σ·√Dauer (0 = aus)              // Ursprung schliesst eine Bewegung >= 4 ATR ab (Suchbudget; Korpus DEVELOPMENT: keine Genauigkeitseinbusse, 34 → 23 ms)
    /* 3.1: kalibriert auf Korpus DEVELOPMENT, Layout A und B (Ende + Mitte; scripts/technical/elliott-calibration/calibrate-weights.mjs; Koordinatensuche, Sensitivitaet ±50 % dokumentiert in
       ELLIOTT_ENGINE3_REPORT.md). Keine VALIDATION- oder HOLDOUT-Faelle verwendet. */
    weights: { guidelines: 0.06, subdivision: 0.45, separation: 0.03, anchor: 0.45, dominance: 0.45, similarity: 0, trendContext: 0, coverage: 0.45, prior: 0.15, higherDegree: 0, tail: 0.2, residual: 0, hierarchy: 0, proportion: 0 },
    hierMargin: 0.1, hierChild: 0.5,
    wxyMargin: 0,                 // 3.3-Kandidat: Mindestvorsprung der Korrektur- vor der Motiv-Lesart fuer W und Y (0 = aus)
    subShrink: null,              // 3.2: { a, b, rMin } Zuverlaessigkeit der Unterteilung nach Unterwellen-Rauschabstand (null = aus)
    typePrior: { IMPULSE: 1, ZIGZAG: 1, FLAT: 0.85, TRIANGLE: 0.7, LEADING_DIAGONAL: 0.6, ENDING_DIAGONAL: 0.65, WXY: 0.65, DOUBLE_ZIGZAG: 0.7, TRIPLE_ZIGZAG: 0.5 },
    stickiness: 0.05, stickinessQuiet: 0.05, maxAlternatives: 2,   // Hysterese-Studie DEVELOPMENT: 0,05 = instabile Wechsel 0,66 %/Woche (V2 0,92 %), Erkennung −5 % ggü. 0,03; hoeher haelt an ueberholten Zaehlungen fest
    alternativeMinInvalidationGapAtr: 0.5,
    clarity: { high: 0.1, moderate: 0.04 }, structural: { high: 0.68, moderate: 0.55 },
    noise: { abstainBelow: 1.3, full: 3.0 },
    /* Eichung Korpus DEVELOPMENT (scripts: elliott-corpus-eval, Bericht ELLIOTT_ENGINE3_REPORT.md): [1, countQuality, clarity/0,15, z/4, Strukturmehrdeutigkeit, laufend] */
    /* 3.2 (Mission III §19–§21, Red-Team 3.2 M2/H3): geeicht auf Korpus DEVELOPMENT, Layouts A, B, C1, C3 (je Layout gleich gewichtet),
       nur abgeschlossene Muster, alle Rauschstufen (scripts/technical/elliott-calibration/applicability32-*.mjs). Merkmale:
       [1, Zaehlqualitaet, Klarheit (nur Strukturmehrdeutigkeit), z/4, (Strukturmehrdeutigkeit: fest 0), laufend, Hierarchie-Widerspruch,
        Zeit-Preis-Proportion, laufend × Wellenanteil]. HOCH ab 0,75 (falsch im Entwicklungssplit: A 16 %, B 21 %), MITTEL ab 0,55
       (A 23 %, B 24 %, C1/C3 41–50 %). Laufende Zaehlungen hoechstens NIEDRIG (developingCap). */
    applicability: { coef: [-9.665, 7.516, 0.852, 1.339, 0, -2.677, -0.801, 3.151, -2.667], high: 0.75, moderate: 0.55, highMinZ: null, developingCap: true, capPatterns: ["WXY"] }
  };

  /* VERSIONIERTE PROFILE (Mission VI §90). Produktionsstandard bleibt elliott-3.2.2 (DEFAULTS). Ein Profil aendert NUR die
     aufgefuehrten Parameter und meldet seinen Namen als engineVersion. Datenmodus: Schlusskurse (Close-only).
       elliott-3.3.0-rc1 = NICHT EINGEFROREN, NUR FORSCHUNG (Red-Team §57, reviews/ELLIOTT_33_REDTEAM.md: zweiter Blick auf
                       VALIDATION, praktikerinformierte Auswahl, budgetabhaengig). 3.2.2 + (a) keine Aehnlichkeitsschranke in der
                       Suche + (b) Trendkontext COUNTER_DEVELOPING, Gewicht 0,2: JEDE laufende Lesart, deren unterstellter Trend
                       dem gemessenen Trend widerspricht, erhaelt 0 (auch laufende Gegentrend-Impulse), alles andere 0,5.
                       Uebersteuerungen durch input.engine sind fuer Profile verboten (Ergebnis waere nicht mehr das Profil). */
  var PROFILES = {
    "elliott-3.3.0-rc1": { noSimilarity: true, trendContextMode: "COUNTER_DEVELOPING", weights: { trendContext: 0.2 } }
  };
  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) { var m = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * m) / m; }
  function mean(a) { a = a.filter(isNum); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // =================================================================
  //  1. POOL (kausal)
  // =================================================================
  function buildPool(close, atr, asOf, k) {
    var pts = [], dir = 0, ext = 0, hi = 0, lo = 0;
    function T(i) { var a = atr[i]; return isNum(a) && a > 0 ? k * a : 0.02 * close[i]; }
    for (var i = 0; i <= asOf; i++) {
      var c = close[i];
      if (dir === 0) {
        if (c > close[hi]) hi = i;
        if (c < close[lo]) lo = i;
        if (close[hi] - c >= T(i) && hi < i) { pts.push({ i: hi, s: 1, c: i }); dir = -1; ext = i; for (var q = hi; q <= i; q++) if (close[q] < close[ext]) ext = q; }
        else if (c - close[lo] >= T(i) && lo < i) { pts.push({ i: lo, s: -1, c: i }); dir = 1; ext = i; for (var r = lo; r <= i; r++) if (close[r] > close[ext]) ext = r; }
        continue;
      }
      if (dir > 0) {
        if (c > close[ext]) ext = i;
        else if (close[ext] - c >= T(i)) { pts.push({ i: ext, s: 1, c: i }); dir = -1; ext = i; }
      } else {
        if (c < close[ext]) ext = i;
        else if (c - close[ext] >= T(i)) { pts.push({ i: ext, s: -1, c: i }); dir = 1; ext = i; }
      }
    }
    var dev = null;
    if (dir !== 0 && (!pts.length || ext > pts[pts.length - 1].i)) dev = { i: ext, s: dir, c: null, dev: true };
    return { pts: dev ? pts.concat([dev]) : pts, dev: dev };
  }

  /** Trendfreie Rauschstaerke je Bar: 1,4826·MAD der zweiten Differenzen / √2 (Zufallspfad mit Drift: Δ²x = σ(e_t − e_{t−1})),
      relativ zum Kurs (mittlerer Kurs im Fenster) wieder in Preiseinheiten. Kausal: nur Bars bis asOf. */
  function noiseSigma(close, asOf, win) {
    var d = [], from = Math.max(2, asOf - win);
    for (var i = from; i <= asOf; i++) { var x = (close[i] - close[i - 1]) - (close[i - 1] - close[i - 2]); if (isNum(x)) d.push(Math.abs(x)); }
    if (d.length < 10) return null;
    d.sort(function (x, y) { return x - y; });
    return 1.4826 * d[Math.floor(d.length / 2)] / Math.SQRT2;
  }
  // =================================================================
  //  4. UNTERTEILUNG IM SKALENRAUM
  // =================================================================
  function zigzagSegment(close, a, b, T) {
    var dir = close[b] >= close[a] ? 1 : -1, pts = [a], d = dir, ext = a;
    for (var i = a + 1; i <= b; i++) {
      if (d * (close[i] - close[ext]) > 0) ext = i;
      else if (d * (close[ext] - close[i]) >= T) { pts.push(ext); d = -d; ext = i; }
    }
    if (d === dir) { if (pts[pts.length - 1] !== ext) pts.push(ext); }
    else pts[pts.length - 1] = b;
    if (pts[pts.length - 1] !== b) pts.push(b);
    /* Alternation sichern */
    var out = [pts[0]];
    for (var k = 1; k < pts.length; k++) {
      var prev = out[out.length - 1], pd = out.length >= 2 ? Math.sign(close[prev] - close[out[out.length - 2]]) : 0, cd = Math.sign(close[pts[k]] - close[prev]);
      if (cd === 0) continue;
      if (pd !== 0 && cd === pd) out[out.length - 1] = pts[k]; else out.push(pts[k]);
    }
    return out;
  }
  function legsFromIdx(series, idx, lastDev) {
    var legs = [];
    for (var k = 1; k < idx.length; k++) {
      var a = idx[k - 1], b = idx[k];
      legs.push({ fromIndex: a, toIndex: b, fromPrice: series.close[a], toPrice: series.close[b], fromTime: series.timestamps[a], toTime: series.timestamps[b],
                  duration: Math.max(1, b - a), status: lastDev && k === idx.length - 1 ? "DEVELOPING" : "CONFIRMED", perBar: Math.abs(series.close[b] - series.close[a]) / Math.max(1, b - a), meanVolume: null });
    }
    return legs;
  }
  var SUB_TYPES = { 3: ["ZIGZAG", "FLAT"], 5: ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL", "TRIANGLE"], 7: ["DOUBLE_ZIGZAG"] };   // Unterebene ohne Unter-Unterteilung: WXY/Dreifach-Zigzag nicht pruefbar
  function classifySegment(series, a, b, cfg, memo) {
    var key = a + "-" + b;
    if (memo[key]) return memo[key];
    var close = series.close, L = Math.abs(close[b] - close[a]), bars = b - a;
    var res = { count: 1, cls: "?", motive: 0, corrective: 0, pattern: null, points: null, maxCounter: 0, resolved: false };
    if (L <= 0 || bars < 3) { memo[key] = res; return res; }
    var counts = {}, readings = {}, levels = 0, finest = null;
    /* 3.2 (Mission III §13, Fehler-Taxonomie hohes Rauschen): Unterwellen zaehlen nur, wenn sie groesser als das Rauschen sind.
       Schwelle = max(Anteil der Wellenlaenge, subNoise · σ · √(Unterwellendauer)). σ = trendfreie Rauschstaerke je Bar (robust aus den
       zweiten Differenzen der Schlusskurse bis zum Analysezeitpunkt, siehe noiseSigma) — ATR misst auf Schlusskursen den Trend mit. */
    var noiseFloor = cfg.subNoise && isNum(cfg._sigma) ? cfg.subNoise * cfg._sigma * Math.sqrt(Math.max(2, bars / 5)) : 0;
    cfg.subGrid.forEach(function (th) {
      var z = zigzagSegment(close, a, b, Math.max(th * L, noiseFloor)), m = z.length - 1;
      if (!finest) finest = z;
      if (m > 9) return;
      levels++;
      counts[m] = (counts[m] || 0) + 1;
      if (!readings[m]) readings[m] = z;           // feinste Schwelle mit dieser Zahl
    });
    /* groesste Gegenbewegung (feinste Aufloesung) */
    var dir = close[b] >= close[a] ? 1 : -1, mc = 0;
    if (finest) for (var k = 1; k < finest.length; k++) { var mv = close[finest[k]] - close[finest[k - 1]]; if (mv * dir < 0) mc = Math.max(mc, Math.abs(mv)); }
    res.maxCounter = mc;
    var structured = 0; Object.keys(counts).forEach(function (m) { if (+m >= 3) structured += counts[m]; });
    if (!structured) { memo[key] = res; return res; }
    res.resolved = true;
    var best = { M: { s: 0 }, K: { s: 0 } };
    [3, 5, 7, 9].forEach(function (m) {
      if (!counts[m]) return;
      var pers = counts[m] / structured;
      if (m === 9) { if (0.7 * pers > best.M.s) best.M = { s: 0.7 * pers, t: "EXTENDED_IMPULSE", m: 9, z: readings[9] }; return; }
      var legs = legsFromIdx(series, readings[m], false);
      (SUB_TYPES[m] || []).forEach(function (t) {
        var e = P.evaluate(t, legs);
        if (!e || !e.valid) return;
        if (t.indexOf("DIAGONAL") >= 0 && !e.rules.some(function (r) { return r.ruleId === "DIAGONAL_W4_OVERLAPS_W1" && r.passed === true; })) return;
        var fam = P.PATTERNS[t].family === "MOTIVE" ? "M" : "K";
        var g = isNum(e.guidelineFit) ? e.guidelineFit : 0.5, sc = pers * (0.75 + 0.25 * g);
        if (sc > best[fam].s) best[fam] = { s: sc, t: t, m: m, z: readings[m], v: e.variant, tr: t === "IMPULSE" && legs.length === 5 && (legs[4].toPrice - legs[2].toPrice) * (legs[0].toPrice >= legs[0].fromPrice ? 1 : -1) < 0 };
      });
    });
    res.motive = round(best.M.s, 3); res.corrective = round(best.K.s, 3);
    var win = best.M.s > best.K.s ? best.M : best.K.s > 0 ? best.K : null;
    if (win) { res.cls = best.M.s > best.K.s ? "M" : "K"; res.pattern = win.t; res.count = win.m; res.points = win.z; res.variant = win.v || null; res.truncated = !!win.tr; }
    memo[key] = res;
    return res;
  }
  function orthodoxShort(sub) { return !!sub && sub.resolved && (sub.pattern === "FLAT" || sub.pattern === "TRIANGLE" || (sub.pattern === "IMPULSE" && sub.truncated) || sub.pattern === "ENDING_DIAGONAL"); }
  function subFit(expected, sub, cfg) {
    if (!sub || !sub.resolved) return cfg.unresolvedFit;
    var d = sub.motive - sub.corrective;
    if (expected === "M") return clamp(0.45 + 0.55 * d, 0.05, 1);
    if (expected === "K") return clamp(0.45 - 0.55 * d, 0.05, 1);
    return clamp(0.45 + 0.55 * Math.abs(d), 0.05, 1);
  }

  // =================================================================
  //  2./3. SUCHE
  // =================================================================
  function analyze(input) {
    var m = (input.methodology && input.methodology.elliottV3) || {};
    var profileName = input.profile || (m.engine && m.engine.profile) || null;
    if (profileName && !PROFILES[profileName]) throw new Error("Unbekanntes Elliott-Profil " + profileName);
    if (profileName && ((input.engine && Object.keys(input.engine).length) || (m.engine && Object.keys(m.engine).some(function (k) { return k !== "profile"; })))) throw new Error("Profil " + profileName + " darf nicht uebersteuert werden");
    var prof = profileName ? PROFILES[profileName] : {};
    var cfg = Object.assign({}, DEFAULTS, prof, m.engine || {}, input.engine || {});
    cfg.weights = Object.assign({}, DEFAULTS.weights, prof.weights || {}, (m.engine && m.engine.weights) || (input.engine && input.engine.weights) || {});
    var engineVersion = profileName || ENGINE_VERSION;
    cfg.typePrior = Object.assign({}, DEFAULTS.typePrior, (m.engine && m.engine.typePrior) || {}, (input.engine && input.engine.typePrior) || {});
    var series = input.series, features = input.features, close = series.close;
    var asOf = isNum(input.asOfIndex) ? Math.min(input.asOfIndex, series.length - 1) : series.length - 1;
    var bpy = input.barsPerYear || (series.timeframe === "1W" ? 52 : 252);
    var atrCol = features.columns.atr, atr = isNum(atrCol[asOf]) ? atrCol[asOf] : close[asOf] * 0.02;
    var pool = buildPool(close, atrCol, asOf, cfg.poolAtr), pts = pool.pts, n = pts.length;
    cfg._sigma = noiseSigma(close, asOf, 260);
    /* FORENSIK (Mission VI, nur Forschung): zaehlt, wo Suchpfade je Musterklasse enden. Ohne input.forensics wird nichts
       gezaehlt; die Ausgabe ist mit und ohne Forensik identisch (Test practitioner-forensics). */
    var F = input.forensics ? { byType: {}, anchors: { total: 0, visited: 0, skippedWindow: 0, skippedAnchorAtr: 0, skippedDev: 0 }, scoreDrops: {}, prerank: {}, final: {} } : null;
    function fT(type) { return F.byType[type] || (F.byType[type] = { reach: {}, prune: {}, found: { complete: 0, developing: 0, internal: 0 }, endTouched: 0 }); }
    function fz(type, k, why) { if (!F) return; var t = fT(type), key = "w" + k + ":" + why; t.prune[key] = (t.prune[key] || 0) + 1; }
    var ctx = { cfg: Object.assign({}, V2.DEFAULTS, { clarity: cfg.clarity, structural: cfg.structural, maxAlternatives: cfg.maxAlternatives, alternativeMinInvalidationGapAtr: cfg.alternativeMinInvalidationGapAtr }), trendDir: V2.trendDirection(series, asOf, bpy) };
    /* Suffix-Extreme fuer "seither nicht ueberschritten" */
    var sufMax = new Array(asOf + 2), sufMin = new Array(asOf + 2);
    sufMax[asOf + 1] = -Infinity; sufMin[asOf + 1] = Infinity;
    for (var i = asOf; i >= 0; i--) { sufMax[i] = Math.max(close[i], sufMax[i + 1]); sufMin[i] = Math.min(close[i], sufMin[i + 1]); }
    function untouched(p) { return p.s > 0 ? sufMax[p.i + 1] <= close[p.i] : sufMin[p.i + 1] >= close[p.i]; }
    /* Signifikanz des Ursprungs: Groesse der Bewegung, deren Extrem der Punkt ist (von links) */
    var leftSig = new Array(n);
    for (var a = 0; a < n; a++) {
      var pa = pts[a], best = 0;
      for (var j = a - 1; j >= 0; j--) {
        var pj = pts[j];
        if (pa.s < 0 ? close[pj.i] < close[pa.i] : close[pj.i] > close[pa.i]) break;
        if (pj.s !== pa.s) best = Math.max(best, Math.abs(close[pj.i] - close[pa.i]));
      }
      leftSig[a] = best;
    }
    /* Nachfolger: extremale Segmente. Ausnahme ORTHODOXES ENDE (EWP Kap. 2, "orthodox top"): eine Welle, auf die ein
       expandierter Flat oder ein Dreieck folgt, endet nicht am Preisextrem — die B-Welle der Folgekorrektur ueberschreitet
       es. Zugelassen wird deshalb ein Ueberschiessen der Folgewelle ueber ihren Start um hoechstens cfg.orthodoxMax ihrer
       Laenge; die Welle muss sich dann als Flat oder Dreieck unterteilen (Pruefung in score()). */
    var succMemo = {};
    function succ(a) {
      if (succMemo[a]) return succMemo[a];
      var pa = pts[a], out = [], run = close[pa.i], over = 0;
      for (var j = a + 1; j < n; j++) {
        var pj = pts[j];
        if (pj.s === pa.s) {
          if (pa.s < 0 ? close[pj.i] < close[pa.i] : close[pj.i] > close[pa.i]) over = Math.max(over, Math.abs(close[pj.i] - close[pa.i]));
          continue;
        }
        var better = pa.s < 0 ? close[pj.i] > run : close[pj.i] < run;
        if (better) {
          run = close[pj.i];
          var L = Math.abs(close[pj.i] - close[pa.i]);
          if (over <= cfg.orthodoxMax * L) out.push({ j: j, over: over, short: 0 });
        } else {
          /* ORTHODOXES ENDE VOR DEM EXTREM (Running Flat, Truncation, Dreieck): die Welle endet hinter ihrem Preisextrem.
             Kandidat ist nur ein Punkt, der seit dem Extrem selbst extremal ist (zweite Spitze), mit begrenztem Abstand. */
          /* Bezug ist die erreichte Ausdehnung der Welle (Start → Extrem), nicht ihr Netto: ein Dreieck als Welle 4 endet mit E
             nahe seiner Mitte. Zugelassen nur mit passender Unterteilung (Pruefung in dfs). */
          var L2 = Math.abs(close[pj.i] - close[pa.i]), ext2 = Math.abs(run - close[pa.i]), shortBy = Math.abs(run - close[pj.i]);
          var towards = pa.s < 0 ? close[pj.i] > close[pa.i] : close[pj.i] < close[pa.i];
          if (towards && L2 > 0 && shortBy <= cfg.orthodoxShortMax * ext2 && over <= cfg.orthodoxMax * ext2) out.push({ j: j, over: over, short: shortBy });
        }
      }
      succMemo[a] = out;
      return out;
    }
    var minAnchorIdx = asOf - cfg.windowYears * bpy;
    var dq = dataQuality(series, Math.max(0, minAnchorIdx), asOf);
    var nodes = 0, truncated = false, found = [], overs = [];
    var subMemo = {};
    function legsOfPath(path, withSub, devLast) {
      var idx = path.map(function (q) { return pts[q].i; }), last = pts[path[path.length - 1]];
      var legs = legsFromIdx(series, idx, !!last.dev || !!devLast);
      legs.forEach(function (l, k) { var p = pts[path[k + 1]]; l.confirmedIndex = p.dev ? null : p.c; l.fromPivotId = "p" + l.fromIndex; l.toPivotId = (p.dev ? "dev" : "p") + l.toIndex;
        if (withSub) { var sub = classifySegment(series, l.fromIndex, l.toIndex, cfg, subMemo); l.sub = { count: sub.count, cls: sub.cls, pattern: sub.pattern, variant: sub.variant || null, motive: sub.motive, corrective: sub.corrective, resolved: sub.resolved, points: sub.points, maxCounter: sub.maxCounter }; } });
      return legs;
    }
    function similar(l1, l2) {
      var a1 = Math.abs(l1.toPrice - l1.fromPrice), a2 = Math.abs(l2.toPrice - l2.fromPrice);
      return Math.min(a1, a2) >= cfg.similarity * Math.max(a1, a2) || Math.min(l1.duration, l2.duration) >= cfg.similarity * Math.max(l1.duration, l2.duration);
    }
    /* 3.1 (Red-Team H1): harte Regeln und Definitionen auch gegen die Preisextreme INNERHALB jeder Welle pruefen — nicht nur an den
       markierten Wellenenden. Sonst koennte ein orthodoxes Ende eine Verletzung (z. B. Welle 2 unter dem Ursprung von Welle 1)
       verdecken. Grundlage: die Regeln beziehen sich auf den Kursverlauf der Welle (EWP Kap. 1). */
    var extMemo = {};
    function extremeAgainst(l) {
      var key = l.fromIndex + "-" + l.toIndex;
      if (extMemo[key] !== undefined) return extMemo[key];
      var up = l.toPrice >= l.fromPrice, e = l.toPrice;
      for (var i2 = l.fromIndex; i2 <= l.toIndex; i2++) e = up ? Math.max(e, close[i2]) : Math.min(e, close[i2]);
      var lo = l.fromPrice;
      for (var i3 = l.fromIndex; i3 <= l.toIndex; i3++) lo = up ? Math.min(lo, close[i3]) : Math.max(lo, close[i3]);
      return (extMemo[key] = { ext: e, back: lo });   // ext = Extrem in Wellenrichtung, back = Extrem gegen die Wellenrichtung
    }
    function intraOk(type, legs) { return intraWhy(type, legs) === null; }
    /* Grund der Verletzung (null = in Ordnung); gleiche Bedingungen in gleicher Reihenfolge wie bisher intraOk */
    function intraWhy(type, legs) {
      var s0 = legs[0].toPrice >= legs[0].fromPrice ? 1 : -1, p0 = legs[0].fromPrice, o = function (v) { return s0 * v; };
      function wave(k) { return legs[k - 1]; }
      /* 3.2 (Red-Team 3.2 H1): JEDE Welle mit Unterteilung "M" (Motivwelle: Impuls 1/3/5, Zigzag A/C, Flat C, Doppel-Zigzag a/c)
         laeuft nie hinter ihren eigenen Start zurueck — auch nicht als laufende Welle. Vorher nur fuer Impulse/Diagonalen geprueft. */
      var subM = P.PATTERNS[type].subdivision;
      for (var km = 1; km <= legs.length; km++) if (subM[km - 1] === "M" && o(extremeAgainst(wave(km)).back) < o(wave(km).fromPrice) - 1e-9) return "INTRA_MOTIVE_WAVE_BEHIND_START_w" + km;
      if (type === "IMPULSE" || type.indexOf("DIAGONAL") >= 0) {
        if (wave(2) && o(extremeAgainst(wave(2)).ext) <= o(p0)) return "INTRA_W2_BEYOND_W1_ORIGIN";                                   // W2 nie hinter W1-Ursprung
        if (wave(4) && type === "IMPULSE" && o(extremeAgainst(wave(4)).ext) <= o(wave(1).toPrice)) return "INTRA_W4_IN_W1_TERRITORY";  // W4 nie im Gebiet von W1
        if (wave(4) && type !== "IMPULSE" && o(extremeAgainst(wave(4)).ext) <= o(wave(3).fromPrice)) return "INTRA_DIAG_W4_BEYOND_W3_ORIGIN"; // Diagonale: W4 nicht hinter W3-Ursprung
        for (var k2 = 1; k2 <= legs.length; k2 += 2) if (wave(k2) && o(extremeAgainst(wave(k2)).back) < o(wave(k2).fromPrice) - 1e-9) return "INTRA_MOTIVE_WAVE_BEHIND_START_w" + k2; // Motivwelle unterschreitet ihren Start nicht
      } else if (type === "ZIGZAG" || type === "DOUBLE_ZIGZAG" || type === "TRIPLE_ZIGZAG" || type === "WXY") {
        if (wave(2) && o(extremeAgainst(wave(2)).ext) <= o(p0)) return "INTRA_B_BEYOND_ORIGIN";                                   // B bzw. X nie hinter dem Ursprung
      } else if (type === "FLAT") {
        if (wave(2) && Math.abs(extremeAgainst(wave(2)).ext - wave(1).toPrice) > 2.0 * Math.abs(wave(1).toPrice - p0)) return "INTRA_FLAT_B_OVER_200PCT"; // VU-Grenze B <= 200 % von A
      } else if (type === "TRIANGLE" && legs.length >= 3) {
        var contracting = o(legs[2].toPrice) < o(legs[0].toPrice);
        if (contracting) for (var k3 = 3; k3 <= legs.length; k3++) {
          var w = wave(k3), ref = wave(k3 - 2).toPrice, dirW = (k3 % 2 === 1) ? s0 : -s0, tol = (k3 === 4 ? 0.05 : 0) * Math.abs(legs[0].toPrice - p0);
          if (dirW * extremeAgainst(w).ext > dirW * ref + tol) return "INTRA_TRIANGLE_BOUNDARY";                                    // Dreieck: innerhalb der Begrenzung
        }
      }
      return null;
    }
    /* Wellen-Objekte je Kante einmal erzeugen (Suche erzeugt sonst je Knoten neue Listen → GC-Last). */
    var legMemo = {};
    function legAB(qa, qb, devLast, withSub) {
      var key = qa + "," + qb + (devLast ? "d" : "") + (withSub ? "s" : "");
      var l = legMemo[key];
      if (l) return l;
      var A = pts[qa], B = pts[qb];
      l = { fromIndex: A.i, toIndex: B.i, fromPrice: close[A.i], toPrice: close[B.i], fromTime: series.timestamps[A.i], toTime: series.timestamps[B.i],
            duration: Math.max(1, B.i - A.i), status: B.dev || devLast ? "DEVELOPING" : "CONFIRMED", perBar: Math.abs(close[B.i] - close[A.i]) / Math.max(1, B.i - A.i), meanVolume: null,
            confirmedIndex: B.dev ? null : B.c, fromPivotId: "p" + A.i, toPivotId: (B.dev ? "dev" : "p") + B.i };
      if (withSub) { var sub = classifySegment(series, A.i, B.i, cfg, subMemo); l.sub = { count: sub.count, cls: sub.cls, pattern: sub.pattern }; }
      legMemo[key] = l;
      return l;
    }
    function dfs(type, w, path, legs) {
      if (nodes++ > cfg.maxNodes) { truncated = true; return; }
      var k = path.length - 1, lastP = pts[path[k]], ws = type === "WXY" || type === "TRIPLE_ZIGZAG";
      if (k >= 1) {
        if (F) { var tr = fT(type).reach; tr[k] = (tr[k] || 0) + 1; }
        if (k >= 2 && !cfg.noSimilarity && !lastP.dev && !similar(legs[k - 2], legs[k - 1])) { fz(type, k, "SIMILARITY"); return; }
        if (k === 1 && !cfg.noAnchorPrune && leftSig[path[0]] < cfg.anchorMinRatio * Math.abs(legs[0].toPrice - legs[0].fromPrice)) { fz(type, k, "ANCHOR_RATIO"); return; }
        if (!P.checkRules(type, legs)) { if (F) fz(type, k, "RULE:" + P.evaluate(type, legs).violations[0]); return; }
        if (F) { var iw = intraWhy(type, legs); if (iw) { fz(type, k, iw); return; } }
        else if (!intraOk(type, legs)) return;
        if (lastP.dev) { found.push({ type: type, path: path.slice(), over: overs.slice(), complete: false }); if (F) fT(type).found.developing++; }
        else if (untouched(lastP)) {
          if (k === w) { found.push({ type: type, path: path.slice(), over: overs.slice(), complete: true }); if (F) fT(type).found.complete++; }
          /* Laufende Welle k mit internem Ruecksetzer: ihr Extrem steht, der Kurs korrigiert darin (kleinerer Grad) */
          var li = legs.slice(0, k - 1); li.push(legAB(path[k - 1], path[k], true, ws));
          if (P.checkRules(type, li)) { found.push({ type: type, path: path.slice(), over: overs.slice(), complete: false, internal: true }); if (F) fT(type).found.internal++; }
        } else if (F && k === w) fT(type).endTouched++;
      }
      if (k === w || lastP.dev) return;
      var nx = succ(path[k]);
      for (var q = 0; q < nx.length; q++) {
        /* Ende hinter dem Extrem nur, wenn sich die Welle als Running Flat, Dreieck oder trunkierter Impuls zerlegt */
        if (nx[q].short > 0) {
          /* 3.1 (Red-Team H1): ein Ende hinter dem Extrem nur an Korrekturpositionen (Unterteilung K) — Motivwellen enden am Extrem */
          if (P.PATTERNS[type].subdivision[k] !== "K") { fz(type, k + 1, "SHORT_END_AT_MOTIVE_POSITION"); continue; }
          var cs = classifySegment(series, lastP.i, pts[nx[q].j].i, cfg, subMemo); if (!orthodoxShort(cs)) { fz(type, k + 1, "SHORT_END_NOT_ORTHODOX"); continue; }
        }
        path.push(nx[q].j); overs.push(nx[q].over); legs.push(legAB(path[k], nx[q].j, false, ws));
        dfs(type, w, path, legs);
        path.pop(); overs.pop(); legs.pop();
        if (truncated) return;
      }
    }
    /* Ursprungsreihenfolge: bedeutendste zuerst — reicht das Suchbudget nicht, fallen die unwahrscheinlichsten weg (nicht die juengsten). */
    var anchorOrder = []; for (var a3 = 0; a3 < n; a3++) anchorOrder.push(a3);
    anchorOrder.sort(function (x, y) { return leftSig[y] - leftSig[x] || x - y; });
    if (F) F.anchors.total = anchorOrder.length;
    for (var ai = 0; ai < anchorOrder.length && !truncated; ai++) {
      var a2 = anchorOrder[ai];
      if (pts[a2].i < minAnchorIdx || pts[a2].dev) { if (F) { if (pts[a2].dev) F.anchors.skippedDev++; else F.anchors.skippedWindow++; } continue; }
      /* Ursprung muss eine Bewegung abschliessen, die deutlich groesser als die Monowellen-Schwelle ist (Suchbudget). */
      if (cfg.anchorMinAtr && isNum(atrCol[pts[a2].i]) && leftSig[a2] < cfg.anchorMinAtr * atrCol[pts[a2].i]) { if (F) F.anchors.skippedAnchorAtr++; continue; }
      if (F) F.anchors.visited++;
      P.TYPES.forEach(function (t) { if (!truncated) dfs(t, P.PATTERNS[t].waves, [a2], []); });
    }
    if (F) { F.anchors.unvisitedAfterTruncation = truncated ? anchorOrder.length - ai : 0; }

    /* Diagnose: warum wurde ein vorgegebener Pfad nicht gefunden? (nur Forschung) */
    var explain = null;
    if (input.debugTruth && input.debugTruth.explain) {
      var T = input.debugTruth.pts, tol = input.debugTruth.tol, type0 = input.debugTruth.types[0];
      var path = [], why = null;
      for (var z = 0; z < T.length && !why; z++) {
        var want = z === 0 ? null : -pts[path[z - 1]].s;
        var bestQ = -1, bd = Infinity;
        for (var q = 0; q < n; q++) { if (pts[q].dev) continue; if (want !== null && pts[q].s !== want) continue; if (z > 0 && q <= path[z - 1]) continue; var dd = Math.abs(pts[q].i - T[z]); if (dd < bd) { bd = dd; bestQ = q; } }
        if (bestQ < 0 || bd > tol) { why = "NO_POOL_POINT_w" + z; break; }
        if (z > 0) {
          var sx = succ(path[z - 1]).filter(function (o) { return o.j === bestQ; })[0];
          if (!sx) why = "NOT_SUCCESSOR_w" + z;
          else if (sx.short > 0 && !orthodoxShort(classifySegment(series, pts[path[z - 1]].i, pts[bestQ].i, cfg, subMemo))) why = "SHORT_END_NOT_ORTHODOX_w" + z;
        }
        path.push(bestQ);
        if (!why && z >= 1) {
          var lg = path.slice(1).map(function (qq, k2) { return legAB(path[k2], qq, false, true); });
          if (z === 1 && leftSig[path[0]] < cfg.anchorMinRatio * Math.abs(lg[0].toPrice - lg[0].fromPrice)) why = "ANCHOR_PRUNE";
          else if (z >= 2 && !similar(lg[z - 2], lg[z - 1])) why = "SIMILARITY_PRUNE_w" + z;
          else if (!P.checkRules(type0, lg)) why = "RULES:" + P.evaluate(type0, lg).violations.join("+");
        }
      }
      if (!why && !untouched(pts[path[path.length - 1]])) why = "END_TOUCHED_LATER";
      if (!why && pts[path[0]].i < minAnchorIdx) why = "ANCHOR_OUTSIDE_WINDOW";
      explain = why || "PATH_OK";
    }
    // ---------------------------------------------------------------- Bewertung
    /* Zweistufige Bewertung (Laufzeit): zuerst die pfadbasierten Merkmale (Ursprung, Dominanz, Vollstaendigkeit, Prior, Anschluss,
       Restpfad) fuer alle Kandidaten, vollstaendig (mit Unterteilung) nur die besten cfg.maxScored. */
    var domMemo = {};
    function dominanceOf(q0, spanBars) {
      var p0i = pts[q0].i, lb = p0i - 2 * spanBars, key = q0 + "|" + lb;
      if (domMemo[key] !== undefined) return domMemo[key];
      var mx = 0;
      for (var z = q0; z >= 0 && pts[z].i >= lb; z--) if (!pts[z].dev) mx = Math.max(mx, leftSig[z]);
      return (domMemo[key] = mx > 0 ? clamp(leftSig[q0] / mx, 0, 1) : 1);
    }
    /* Vollstaendigkeit (VU-Heuristik). "WAVES" (3.2.2): Anteil der vorhandenen Wellen am Muster — bevorzugt bei gleichen
       Wellenenden systematisch das Muster mit weniger Wellen (A-B-C laufend = 100 %, 1-2-3 laufend = 67,5 %).
       "DEV3" (3.3-Kandidat, Mission VI): ab der dritten vorhandenen Welle gilt eine laufende Zaehlung als gleich vollstaendig
       wie eine abgeschlossene — 1-2-3 und A-B-C auf denselben Wellenenden sind nach EWP bis Welle 4/5 bzw. C nicht
       unterscheidbar; die Entscheidung bleibt den uebrigen Merkmalen (Unterteilung, Richtlinien, Kontext) ueberlassen. */
    function coverageOf(complete, nl, waves) {
      if (complete) return 1;
      if (cfg.coverageMode === "DEV3" && nl >= 3) return 1;
      return Math.min(1, 0.35 + 0.65 * (nl - 1) / Math.max(1, waves - 1));
    }
    function pathParts(f) {
      var spec = P.PATTERNS[f.type], q0 = f.path[0], qa = f.path[1], ql = f.path[f.path.length - 1], qp = f.path[f.path.length - 2];
      var w1 = Math.abs(close[pts[qa].i] - close[pts[q0].i]), anc = leftSig[q0] / Math.max(1e-9, w1);
      var endI = pts[ql].i, lastLen = Math.abs(close[endI] - close[pts[qp].i]), tailMove = Math.abs(close[asOf] - close[endI]);
      var tail = f.internal ? clamp(1 - tailMove / Math.max(1e-9, 0.5 * lastLen), 0, 1) : f.complete ? clamp(tailMove / Math.max(1e-9, 0.382 * lastLen), 0, 1) : 1;
      var resid = 1;
      if (!f.internal && endI < asOf) {
        var dirT = close[asOf] >= close[endI] ? 1 : -1, ext = close[endI], cm = 0;
        for (var t2 = endI + 1; t2 <= asOf; t2++) { if (dirT * (close[t2] - ext) > 0) ext = close[t2]; else cm = Math.max(cm, Math.abs(ext - close[t2])); }
        resid = clamp(1 - cm / Math.max(1e-9, Math.max(tailMove, 0.382 * lastLen)), 0, 1);
      }
      var nl = f.path.length - 1;
      return { anchor: P.band(anc, [0.9, 1e9], [cfg.anchorMinRatio, 1e9]), dominance: dominanceOf(q0, endI - pts[q0].i),
               coverage: coverageOf(f.complete, nl, spec.waves),
               prior: cfg.typePrior[f.type] === undefined ? 0.6 : cfg.typePrior[f.type], tail: tail, residual: resid };
    }
    found.forEach(function (f) { f.parts = pathParts(f); var r = 0; Object.keys(cfg.weights).forEach(function (k) { r += cfg.weights[k] * (k in f.parts ? f.parts[k] : 0.5); }); f.pre = r; });
    found.sort(function (x, y) { return y.pre - x.pre; });
    if (F) found.forEach(function (f, ix) { var pr = F.prerank[f.type] || (F.prerank[f.type] = { found: 0, withinMaxScored: 0, bestPrePos: null }); pr.found++; if (ix < cfg.maxScored) pr.withinMaxScored++; if (pr.bestPrePos === null) pr.bestPrePos = ix; });
    var cands = found.slice(0, cfg.maxScored).map(function (f) { var sc = score(f); if (!sc && input.debugTruth) f.dropped = true; else f.cand = sc; return sc; }).filter(Boolean);
    /* Diagnose (nur Forschung): Ist die wahre Lesart im Pool, gefunden, bewertet — und wo steht sie? */
    var truthDiag = null;
    if (input.debugTruth) {
      var T = input.debugTruth.pts, tol = input.debugTruth.tol;
      var poolHit = T.map(function (t) { var d = Infinity; pts.forEach(function (p) { d = Math.min(d, Math.abs(p.i - t)); }); return d; });
      var match = function (path) { if (path.length !== T.length) return false; for (var z = 0; z < T.length; z++) if (Math.abs(pts[path[z]].i - T[z]) > tol) return false; return true; };
      var hits = found.filter(function (f) { return input.debugTruth.types.indexOf(f.type) >= 0 && f.complete && match(f.path); });
      truthDiag = { poolDist: poolHit, foundInSearch: hits.length, droppedInScore: hits.filter(function (f) { return f.dropped; }).length, cands: hits.filter(function (f) { return f.cand; }).map(function (f) { return f.cand; }) };
    }
    function score(f) {
      var legs = legsOfPath(f.path, true, f.internal), spec = P.PATTERNS[f.type], e = P.evaluate(f.type, legs);
      /* Diagonale nur mit sichtbarem Definitionsmerkmal (sonst Kopie der Impulslesart) */
      function drop(why) { if (F) { var d = F.scoreDrops[f.type] || (F.scoreDrops[f.type] = {}); d[why] = (d[why] || 0) + 1; } return null; }
      if (f.type.indexOf("DIAGONAL") >= 0 && !e.rules.some(function (r) { return r.ruleId === "DIAGONAL_W4_OVERLAPS_W1" && r.passed === true; })) return drop("DIAGONAL_NO_W4_OVERLAP");
      e = P.evaluate(f.type, legs);   // WXY braucht die Unterteilung
      if (!e || !e.valid) return drop(e ? "RULE:" + e.violations[0] : "EVAL_NULL");
      if (!intraOk(f.type, legs)) return drop(F ? intraWhy(f.type, legs) : "INTRA");
      /* 3.3-Kandidat (Mission IV §26): W und Y einer Doppel-Korrektur muessen sich DEUTLICH korrektiv unterteilen — sonst ist W-X-Y
         ein Auffangbecken fuer beliebige drei Schwuenge (Produktion: 1.877 WXY vs. 44 Impulse; Korpus: WXY 1.305-mal gewaehlt, 13 % richtig). */
      if (cfg.wxyMargin && f.type === "WXY") {
        var okW = function (l) { return l.status === "DEVELOPING" || (l.sub && l.sub.resolved && (l.sub.corrective - l.sub.motive) >= cfg.wxyMargin); };
        if (!okW(legs[0]) || (legs[2] && !okW(legs[2]))) return drop("WXY_MARGIN");
      }
      /* orthodoxes Ende: die ueberschiessende Folgewelle muss ein Flat oder Dreieck sein */
      for (var ov = 0; ov < f.over.length; ov++) {
        /* 3.2 (Red-Team 3.2 H1): Ueberschiessen nur an Korrekturpositionen und nur mit SICHTBARER Flat-/Dreieck-Unterteilung —
           eine laufende Welle kann das noch nicht zeigen, also kein Ueberschiessen fuer laufende Wellen. */
        if (f.over[ov] > 0) { var lg = legs[ov], sp = lg.sub && lg.sub.pattern; if (lg.status === "DEVELOPING" || spec.subdivision[ov].indexOf("K") < 0 || (sp !== "FLAT" && sp !== "TRIANGLE")) return drop("OVERSHOOT_NOT_FLAT_OR_TRIANGLE"); lg.orthodoxOvershoot = f.over[ov]; }
      }
      var conf = legs.filter(function (l) { return l.status !== "DEVELOPING"; });
      var subs = legs.map(function (l, k) { return l.status === "DEVELOPING" ? null : subFit(spec.subdivision[k], l.sub, cfg); }).filter(isNum);
      /* Grad-Trennung: groesste Gegenbewegung in einer Welle vs. kleinere Nachbarwelle des Musters */
      var sep = [];
      legs.forEach(function (l, k) {
        if (l.status === "DEVELOPING" || !l.sub) return;
        var nb = [legs[k - 1], legs[k + 1]].filter(function (x) { return x && x.status !== "DEVELOPING"; }).map(function (x) { return Math.abs(x.toPrice - x.fromPrice); });
        if (!nb.length) return;
        sep.push(P.band(l.sub.maxCounter / Math.min.apply(null, nb), [0, 0.75], [0, 1.4]));
      });
      var simN = 0, simOk = 0;
      for (var q = 1; q < legs.length; q++) { simN++; if (legs[q].status === "DEVELOPING" || (Math.min(Math.abs(legs[q].toPrice - legs[q].fromPrice), Math.abs(legs[q - 1].toPrice - legs[q - 1].fromPrice)) >= cfg.similarity * Math.max(Math.abs(legs[q].toPrice - legs[q].fromPrice), Math.abs(legs[q - 1].toPrice - legs[q - 1].fromPrice)))) simOk++; }
      /* 3.2 ZEIT UND PREIS GEMEINSAM (Mission III §4, §6; Taxonomie Layout C: kleine Kontextschwuenge + ganzer Impuls als W-X-Y):
         benachbarte Wellen desselben Grades sind in Preis UND Zeit vergleichbar. Je Paar r = √(Preisverhaeltnis · Zeitverhaeltnis)
         (jeweils klein/gross); Bewertung ueber das ungünstigste Paar, P.band(r, [1/3, 1], [0,1, 1]). Keine harte Regel: NEoWave
         (Neely, Rule of Similarity) verlangt nur Preis ODER Zeit ≥ 1/3 — das bleibt die Suchschranke. Laufende Welle ausgenommen. */
      var prop = [];
      for (var q2 = 1; q2 < legs.length; q2++) {
        var la = legs[q2 - 1], lb = legs[q2];
        if (la.status === "DEVELOPING" || lb.status === "DEVELOPING") continue;
        var pa2 = Math.abs(la.toPrice - la.fromPrice), pb2 = Math.abs(lb.toPrice - lb.fromPrice);
        var rp = Math.min(pa2, pb2) / Math.max(1e-9, Math.max(pa2, pb2)), rt = Math.min(la.duration, lb.duration) / Math.max(la.duration, lb.duration);
        prop.push(P.band(Math.sqrt(rp * rt), [1 / 3, 1], [0.1, 1]));
      }
      var dw = f.complete ? spec.waves : legs.length, pp = f.parts;
      var c = {
        guidelines: isNum(e.guidelineFit) ? e.guidelineFit : 0.5,
        subdivision: subShrink(subs.length ? mean(subs) : cfg.unresolvedFit, legs, spec),
        separation: sep.length ? mean(sep) : 0.5,
        anchor: pp.anchor,
        dominance: pp.dominance,
        similarity: simN ? simOk / simN : 0.5,
        /* 3.3-Kandidat (Mission VI): trendContextMode "DEVELOPING_ONLY" — der Trend des hoeheren Grades entscheidet nur bei laufenden
           Zaehlungen (1-2-3 vs. A-B-C auf denselben Wellenenden, EWP: Korrekturen laufen gegen den Trend des naechsthoeheren Grades);
           abgeschlossene Muster unterscheidet ihre Struktur, dort neutral 0,5. */
        trendContext: trendContextOf(e, f),
        coverage: pp.coverage,
        prior: pp.prior,
        higherDegree: 0.5,
        tail: pp.tail,
        residual: pp.residual,
        proportion: prop.length ? Math.min.apply(null, prop) : 0.5
      };
      e.waves = legs; e.complete = f.complete; e.internal = !!f.internal; e.developingWave = dw; e.startLeg = f.path[0];
      e.subdivisionFit = c.subdivision;
      e.subdivisionDetail = legs.map(function (l, k) { return { wave: spec.labels[k], expected: spec.subdivision[k], observed: l.sub ? l.sub.count : null, observedClass: l.sub ? l.sub.cls : null, pattern: l.sub ? l.sub.pattern : null, fit: l.status === "DEVELOPING" ? null : round(subFit(spec.subdivision[k], l.sub, cfg), 3) }; });
      e.prior = c.prior; e.components = c; e.span = [legs[0].fromIndex, legs[legs.length - 1].toIndex];
      e.base = baseRank(c);
      return e;
    }
    /* 3.2 (Mission III §12, Taxonomie hohes Rauschen: falsche Sieger gewinnen vor allem ueber die Unterteilung): die Unterteilungs-
       evidenz wird zum neutralen Wert hin gezogen, wenn die erwarteten Unterwellen kaum groesser als das Rauschen sind.
       zSub = (|Welle|/n) / (σ·√(Dauer/n)), n = erwartete Unterwellenzahl; Zuverlaessigkeit r = clamp((zSub − a)/(b − a), rMin, 1). */
    function subShrink(v, legs, spec) {
      var S = cfg.subShrink;
      if (!S || !isNum(cfg._sigma) || cfg._sigma <= 0) return v;
      var zs = [];
      legs.forEach(function (l, k) { if (l.status === "DEVELOPING") return; var nn = spec.subdivision[k] === "M" ? 5 : 3, d = Math.max(1, l.toIndex - l.fromIndex);
        zs.push((Math.abs(l.toPrice - l.fromPrice) / nn) / (cfg._sigma * Math.sqrt(Math.max(1, d / nn)))); });
      if (!zs.length) return v;
      zs.sort(function (x, y) { return x - y; });
      var r = clamp((zs[Math.floor(zs.length / 2)] - S.a) / (S.b - S.a), S.rMin, 1);
      return cfg.unresolvedFit + r * (v - cfg.unresolvedFit);
    }
    /* Trendkontext. Standard (3.2.2, Gewicht 0): mit Trend 1, gegen 0,2, ohne Trend 0,5.
       "DEVELOPING_ONLY": nur laufende Zaehlungen, mit Trend 1 / gegen 0,2; abgeschlossene 0,5.
       "COUNTER_DEVELOPING" (3.3-Kandidat rc1, Mission VI, nicht eingefroren): JEDE laufende Lesart, deren unterstellter Trend dem
       gemessenen Trend (V2.trendDirection, 1 Jahr bis asOf) widerspricht, wird abgewertet (0) — gemeint war die EWP-Regel
       "Korrekturen laufen gegen den Trend des naechsthoeheren Grades" (1-2-3 vs. A-B-C); die Umsetzung trifft auch laufende
       Gegentrend-Impulse, und der Jahrestrend ist nur eine Naeherung des hoeheren Grades. Alles andere neutral (0,5). */
    function trendContextOf(e, f) {
      if (ctx.trendDir === 0) return 0.5;
      var agree = V2.impliedTrend(e) === ctx.trendDir;
      if (cfg.trendContextMode === "COUNTER_DEVELOPING") return !f.complete && !agree ? 0 : 0.5;
      if (cfg.trendContextMode === "DEVELOPING_ONLY" && f.complete) return 0.5;
      return agree ? 1 : 0.2;
    }
    function baseRank(c) { var r = 0; Object.keys(cfg.weights).forEach(function (k) { r += cfg.weights[k] * (isNum(c[k]) ? c[k] : 0.5); }); return r; }
    /* 6. hoeherer Grad: Lesart Y, in der X eine einzelne (abgeschlossene oder laufende) Welle ist */
    cands.sort(function (x, y) { return y.base - x.base; });
    var top = cands.slice(0, 400);
    function containing(x) {
      var best = null;
      top.forEach(function (y) {
        if (y === x || y.span[0] > x.span[0] || (y.span[1] - y.span[0]) <= (x.span[1] - x.span[0])) return;
        var wv = null, kk = -1;
        y.waves.forEach(function (w, k) { if (w.fromIndex === x.span[0] && (w.toIndex === x.span[1] || (w.status === "DEVELOPING" && !x.complete))) { wv = w; kk = k; } });
        if (!wv) return;
        if (!best || y.base > best.y.base) best = { y: y, k: kk };
      });
      return best;
    }
    top.forEach(function (x) {
      /* Hoeherer Grad als WIDERSPRUCHS-Pruefung, nicht als Belohnung fuers Enthaltensein (sonst gewinnen systematisch
         Teilstrukturen): passt X als Welle in eine mindestens gleich gute groessere Lesart → 0,6; widerspricht → 0,2. */
      var h = containing(x);
      if (!h || h.y.base < x.base - 0.05) { x.components.higherDegree = 0.5; x.higher = h || null; }
      else {
        var exp = P.PATTERNS[h.y.type].subdivision[h.k], fam = x.family === "MOTIVE" ? "M" : "K";
        var dirOk = x.sign === (h.y.waves[h.k].toPrice >= h.y.waves[h.k].fromPrice ? 1 : -1);
        x.components.higherDegree = dirOk && (exp === "MK" || exp === fam) ? 0.6 : 0.2;
        x.higher = h;
      }
      x.rank = round(baseRank(x.components), 4);
    });
    top.sort(function (x, y) { return y.rank - x.rank || (y.span[1] - y.span[0]) - (x.span[1] - x.span[0]) || (x.type < y.type ? -1 : 1); });
    /* 3.2 HIERARCHIE ZUERST (Mission III §5, §8; Fehler-Taxonomie HOLDOUT-2/DEVELOPMENT: 59 % der echten groben Gradfehler bauen die
       Bestaetigungsbewegung ein). Eine Lesart Y widerspricht einer abgeschlossenen Struktur X, wenn
         (a) Y an einem INNEREN Wellenende von X beginnt und ueber das Ende von X hinauslaeuft — Y macht die letzte(n) Welle(n) von X
             zu Gleichrangigen der Bewegung danach (Grad gemischt), oder
         (b) Y genau am Ende von X beginnt, aber deutlich kleiner ist (Zeit UND Preis < hierChild von X): Y ist dann eine Unterwelle
             der Bewegung nach X, nicht die Struktur gleichen Grades.
       Gezaehlt wird nur gegen X mit mindestens vergleichbarem Rangwert (X.base >= Y.base − hierMargin). Komponente "hierarchy":
       1 ohne Widerspruch, 0 bei (a), 0,5 bei (b). */
    /* immer berechnet (Merkmal der Anwendbarkeit 3.2); in den Rangwert nur mit Gewicht > 0 (VALIDATION: Gewicht 0, siehe Bericht) */
    {
      var compl = top.filter(function (x) { return x.complete; });
      var sizeOf = function (x) { if (x._size) return x._size; var hi = -Infinity, lo = Infinity; x.waves.forEach(function (w) { hi = Math.max(hi, w.fromPrice, w.toPrice); lo = Math.min(lo, w.fromPrice, w.toPrice); }); return (x._size = { t: x.span[1] - x.span[0], p: hi - lo }); };
      top.forEach(function (y) { y.components.hierarchy = 1; y.hierConflict = null; });
      top.forEach(function (y) {
        compl.forEach(function (x) {
          if (x === y) return;
          /* (a) Kreuzung: Y beginnt an einem inneren Wellenende von X und laeuft ueber das Ende von X hinaus. Symmetrisch: bestraft
             wird jede der beiden Lesarten, gegen die die andere mindestens vergleichbar stark ist (bei Gleichstand beide). */
          var inner = x.waves.slice(0, -1).some(function (w) { return w.toIndex === y.span[0]; });
          if (inner && y.span[1] > x.span[1]) {
            if (x.base >= y.base - cfg.hierMargin) { y.components.hierarchy = 0; y.hierConflict = { with: x.type, span: x.span, kind: "CROSSES" }; }
            if (y.complete && y.base >= x.base - cfg.hierMargin) { x.components.hierarchy = 0; x.hierConflict = { with: y.type, span: y.span, kind: "CROSSED" }; }
            return;
          }
          /* (b) Y beginnt am Ende von X und ist in Zeit UND Preis deutlich kleiner: Unterwelle der Bewegung nach X */
          if (y.span[0] === x.span[1] && x.base >= y.base - cfg.hierMargin && y.components.hierarchy > 0.5) {
            var sx = sizeOf(x), sy = sizeOf(y);
            if (sy.t < cfg.hierChild * sx.t && sy.p < cfg.hierChild * sx.p) { y.components.hierarchy = 0.5; y.hierConflict = { with: x.type, span: x.span, kind: "CHILD_AFTER_PARENT" }; }
          }
        });
      });
      if (cfg.weights.hierarchy) top.forEach(function (y) { y.rank = round(baseRank(y.components), 4); });
      top.sort(function (x, y) { return y.rank - x.rank || (y.span[1] - y.span[0]) - (x.span[1] - x.span[0]) || (x.type < y.type ? -1 : 1); });
    }

    if (F) top.forEach(function (t, ix) {
      var fe = F.final[t.type] || (F.final[t.type] = { scored: 0, bestPos: null, best: null });
      fe.scored++;
      if (fe.bestPos === null) { fe.bestPos = ix; fe.best = { complete: t.complete, internal: !!t.internal, rank: t.rank, rankGapToTop: round(top[0].rank - t.rank, 4), wavesPresent: t.waves.length,
        spanBars: t.span[1] - t.span[0], components: roundMap(t.components), topComponents: roundMap(top[0].components), hierConflict: t.hierConflict ? t.hierConflict.kind : null }; }
    });
    if (F) F.scoredTotal = cands.length;
    if (truthDiag) { truthDiag.rank = truthDiag.cands.length ? Math.min.apply(null, truthDiag.cands.map(function (c) { var ix = top.indexOf(c); return ix < 0 ? 9999 : ix; })) : null;
                     truthDiag.best = truthDiag.cands.length ? truthDiag.cands.slice().sort(function (x, y) { return (y.rank || y.base) - (x.rank || x.base); })[0] : null; }
    var degreesInfo = { analysis: "ew3", engine: "hierarchical", poolPivots: n, candidates: cands.length, searchTruncated: truncated, nodes: nodes };
    var base = { engineVersion: engineVersion, ruleSetVersion: P.RULE_SET_VERSION, repaintingPolicy: "CONFIRMS_WITH_DELAY", isProbability: false,
                 parametersHash: Hash.hashValue({ v: engineVersion, cfg: Object.assign({}, cfg, { _sigma: undefined }) }), asOfIndex: asOf, asOf: series.timestamps[asOf], degrees: degreesInfo };
    if (!top.length) return Object.assign(base, { status: "UNAVAILABLE", reason: n < 6 ? "TOO_FEW_SWINGS" : "NO_VALID_COUNT", detail: n < 6 ? "Zu wenige Schwünge für eine Wellenzählung" : "Keine regelkonforme Lesart der jüngsten Schwünge",
                                                 primary: null, alternatives: [], higherDegree: null, historicalMap: null, applicability: { score: null, level: "LOW", abstain: true, components: {}, reasons: ["Keine regelkonforme Lesart"] } });
    /* Persistenz (kausal, aus dem Vortag) */
    var prev = input.previous || null;
    /* Informationsabhaengige Hysterese (§23): Solange seit dem Vortag kein neuer Wendepunkt bestaetigt wurde, hat sich die
       Struktur nicht geaendert — dann haelt die Engine ihre Lesart (stickinessQuiet). Mit neuer Information konkurrieren alle
       Lesarten fast frei (stickiness), damit an einer ueberholten Zaehlung nicht festgehalten wird. */
    var confirmedNow = pool.dev ? n - 1 : n;
    if (prev && prev.key) {
      var quiet = isNum(prev.pivots) && prev.pivots === confirmedNow;
      var st = quiet ? cfg.stickinessQuiet : cfg.stickiness;
      var keep = top.filter(function (c) { return V2.candidateKey(c) === prev.key; })[0];
      if (keep && keep !== top[0] && keep.rank >= top[0].rank - st) { top.splice(top.indexOf(keep), 1); top.unshift(keep); }
    }
    var best0 = top[0];
    var primary = V2.buildCount(best0, ctx, atr);
    primary.persistenceKey = V2.candidateKey(best0);
    primary.persistencePivots = confirmedNow;
    decorate(primary, best0);
    var alternatives = [];
    for (var k = 1; k < top.length && alternatives.length < cfg.maxAlternatives; k++) {
      var cc = V2.buildCount(top[k], ctx, atr);
      if (!V2.materiallyDifferent(primary, cc, atr, ctx.cfg)) continue;
      if (alternatives.some(function (x) { return !V2.materiallyDifferent(x, cc, atr, ctx.cfg); })) continue;
      decorate(cc, top[k]); cc._src = top[k];
      alternatives.push(cc);
    }
    var clarity = alternatives.length ? round(primary.rank - alternatives[0].rank, 4) : round(primary.rank, 4);
    primary.countQuality = V2.countQuality(best0, primary, clarity, features, ctx.cfg);
    alternatives.forEach(function (x) { x.countQuality = V2.countQuality(x._src, x, null, features, ctx.cfg); });
    primary.ruleAudit = V2.ruleAudit(best0, primary);
    alternatives.forEach(function (x) { x.ruleAudit = V2.ruleAudit(x._src, x); delete x._src; });
    primary.detection = V2.detectionLatency(primary, input.pivots, series, asOf);
    /* Mehrdeutigkeit zerlegen: Grad (eine Lesart ist Teil der anderen), Etikett (gleiche Wellenenden), Struktur */
    var amb = ambiguityKind(best0, alternatives.length ? top.filter(function (t) { return V2.buildCountId(t) === alternatives[0].countId; })[0] : null);
    /* Strukturstaerke gegen Zufallspfad gleicher Dauer: |Welle| / (ATR·1,25·sqrt(Dauer)) */
    var zs = best0.waves.filter(function (w) { return w.status !== "DEVELOPING"; }).map(function (w) { return Math.abs(w.toPrice - w.fromPrice) / Math.max(1e-9, atr * 1.25 * Math.sqrt(Math.max(1, w.duration))); });
    zs.sort(function (x, y) { return x - y; });
    var zMed = zs.length ? zs[Math.floor(zs.length / 2)] : null;
    var snr = isNum(zMed) ? { ratio: round(zMed, 3), score: round(clamp((zMed - cfg.noise.abstainBelow) / (cfg.noise.full - cfg.noise.abstainBelow), 0, 1), 3) } : null;
    var wFrac = primary.complete ? 1 : (primary.currentWave ? primary.currentWave.wave : best0.waves.length) / Math.max(1, P.PATTERNS[best0.type].waves);
    var appl = applicability3(primary.countQuality, alternatives.length && amb.kind === "STRUCTURE" ? clarity : null, snr, cfg, amb, primary.complete,
                              { hier: best0.components.hierarchy, prop: best0.components.proportion, waveFrac: wFrac, pattern: primary.pattern });
    if (dq.blocking) { appl.level = "LOW"; appl.abstain = true; appl.reasons.unshift(dq.note); }
    /* 3.2 (Red-Team 3.2 M3): Grad- oder Etikett-Mehrdeutigkeit ist nicht "klar" (solche Hauptzaehlungen stimmten im Korpus nur in 12–14 %) */
    var clarityLevel = amb.kind === "NONE" ? "HIGH" : amb.kind !== "STRUCTURE" ? "MODERATE" : clarity >= cfg.clarity.high ? "HIGH" : clarity >= cfg.clarity.moderate ? "MODERATE" : "LOW";
    var status = primary.currentWave.wave === 1 && !primary.complete ? "EARLY" : clarityLevel === "LOW" ? "AMBIGUOUS" : "OK";
    var hd = best0.higher ? higherObj(best0.higher) : null;
    var nearest = nearestScale(best0, input.pivots);
    degreesInfo.analysis = nearest; degreesInfo.higher = hd ? "ew3+1" : null;
    var hmap = null;
    try { var A = V2.analyzeScale(series, input.pivots, nearest, input.pivots.scaleIds[input.pivots.scaleIds.indexOf(nearest) - 1] || null, asOf, { cfg: V2.DEFAULTS, trendDir: ctx.trendDir }, null); hmap = A ? V2.historicalMap(A) : null; } catch (err) { hmap = null; }
    return Object.assign(base, {
      status: status, reason: status === "OK" ? null : status === "EARLY" ? "FIRST_WAVE_ONLY" : "ALTERNATIVES_CLOSE",
      primary: primary, alternatives: alternatives,
      structuralScore: primary.rank, structuralLevel: primary.rank >= cfg.structural.high ? "HIGH" : primary.rank >= cfg.structural.moderate ? "MODERATE" : "LOW",
      clarity: clarity, clarityLevel: clarityLevel, ambiguity: amb,
      confidenceType: "structural_fit", confidenceNote: "Rangwert der Regel-, Richtlinien- und Gradpassung, keine Wahrscheinlichkeit.",
      higherDegree: hd, trendContext: ctx.trendDir, candidateCount: cands.length,
      applicability: appl, candidateTree: V2.candidateTree(primary, alternatives),
      historicalMap: hmap, atr: round(atr, 4), dataQuality: dq,
      trace: { poolPivots: n, candidates: cands.length, nodes: nodes, truncated: truncated, chosen: { rank: best0.rank, components: roundMap(best0.components) },
               explain: explain, forensics: F || undefined,
               truth: truthDiag ? { poolDist: truthDiag.poolDist, found: truthDiag.foundInSearch, dropped: truthDiag.droppedInScore, rank: truthDiag.rank, comp: truthDiag.best ? roundMap(truthDiag.best.components) : null, score: truthDiag.best ? (truthDiag.best.rank || truthDiag.best.base) : null } : undefined,
               allCands: input.debugAll ? top.map(function (t) { return { type: t.type, complete: t.complete, pts: [t.waves[0].fromIndex].concat(t.waves.map(function (w) { return w.toIndex; })), c: t.components, subs: t.waves.map(function (w) { return { from: w.fromIndex, to: w.toIndex, st: w.status, p: w.sub ? w.sub.pattern : null }; }) }; }) : undefined,
               debugTop: input.debug ? top.slice(0, input.debug).map(function (t) { return { pattern: t.type, complete: t.complete, rank: t.rank, pts: [t.waves[0].fromIndex].concat(t.waves.map(function (w) { return w.toIndex; })), c: roundMap(t.components), subs: t.waves.map(function (w) { return w.sub ? w.sub.cls + w.sub.count + ':' + w.sub.motive + '/' + w.sub.corrective : '-'; }).join(' ') }; }) : undefined,
               rejectedTop: top.slice(1, 4).map(function (t) { return { pattern: t.type, complete: t.complete, rank: t.rank, from: series.timestamps[t.span[0]], why: whyLower(best0, t) }; }) }
    });

    function decorate(count, src) {
      count.waves.forEach(function (w, k) {
        var l = src.waves[k];
        if (l && l.sub && l.sub.pattern && l.sub.points && l.status !== "DEVELOPING") {
          var lab = (P.PATTERNS[l.sub.pattern] ? (P.PATTERNS[l.sub.pattern].displayLabels || P.PATTERNS[l.sub.pattern].labels) : ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
          w.subdivision = { count: l.sub.count, class: l.sub.cls, pattern: l.sub.pattern, variant: l.sub.variant, motive: l.sub.motive, corrective: l.sub.corrective,
                            waves: l.sub.points.slice(1).map(function (ix, q) { return { label: V2.notate(lab[q] || String(q + 1), "LOWER"), toIndex: ix, toTime: series.timestamps[ix], toPrice: round(close[ix], 4) }; }) };
        } else if (l && l.sub) w.subdivision = { count: l.sub.count, class: l.sub.cls, pattern: l.sub.pattern || null };
      });
      count.degree = { relative: 0, notation: "Hauptgrad", spanBars: src.span[1] - src.span[0] };
    }
    function higherObj(h) {
      var y = h.y, spec = P.PATTERNS[y.type], dw = y.complete ? spec.waves : y.waves.length;
      return { scaleId: "ew3+1", pattern: y.type, patternName: V2.PATTERN_NAMES_DE[y.type], rank: round(y.base, 4),
               current: { label: spec.labels[h.k], notation: V2.notate(spec.labels[h.k], "HIGHER"), role: V2.currentRole(y.type, h.k + 1), direction: V2.waveDirection(y.sign, h.k + 1) },
               waves: V2.labelWaves(y, "HIGHER"), containsPrimaryAsWave: spec.labels[h.k], developingWave: dw };
    }
  }
  /** Datenlage im Analysefenster: Luecken in der Zeitachse, unbereinigte Splits (Kurs springt um ein Split-Verhaeltnis). */
  function dataQuality(series, from, to) {
    var ts = series.timestamps, c = series.close, d = [], gaps = 0, maxGap = 0, splits = [];
    /* 3.2.1: Abstand in BOERSENTAGEN (Wochenenden abgezogen) — sonst zaehlte bei Tagesdaten jedes Wochenende als Luecke und jede
       Tagesreihe enthielt sich ("Luecken in der Kurshistorie"). Bei Wochendaten unveraendert (jede Woche enthaelt ein Wochenende). */
    function bizDays(a, b) { var t0 = Date.parse(a), t1 = Date.parse(b); if (!isNum(t0) || !isNum(t1)) return NaN; var n = Math.round((t1 - t0) / 86400000), w = 0, d0 = new Date(t0).getUTCDay(); for (var q = 1; q <= n; q++) { var wd = (d0 + q) % 7; if (wd === 0 || wd === 6) w++; } return n - w; }
    for (var i = from + 1; i <= to; i++) { var dt = bizDays(ts[i - 1], ts[i]); if (isNum(dt)) d.push(dt); }
    var med = d.length ? d.slice().sort(function (a, b) { return a - b; })[Math.floor(d.length / 2)] : null;
    if (isNum(med) && med > 0) d.forEach(function (x) { if (x > 2.5 * med) { gaps++; maxGap = Math.max(maxGap, Math.round(x / med) - 1); } });
    for (var j = from + 1; j <= to; j++) {
      var r = c[j] / c[j - 1];
      [2, 3, 4, 5, 10].forEach(function (k) { if (Math.abs(r * k - 1) < 0.03 || Math.abs(r / k - 1) < 0.03) splits.push({ index: j, time: ts[j], ratio: r > 1 ? "1:" + k : k + ":1" }); });
    }
    var blocking = splits.length > 0 || maxGap >= 4 || gaps >= 3;
    return { gaps: gaps, maxGapBars: maxGap, suspectedSplits: splits, blocking: blocking,
             note: splits.length ? "Kurssprung im Split-Verhältnis – Daten vermutlich nicht bereinigt, keine Zählung" : blocking ? "Lücken in der Kurshistorie – keine verlässliche Zählung" : gaps ? "einzelne Datenlücke" : null };
  }
  function roundMap(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { o[k] = isNum(m[k]) ? round(m[k], 3) : m[k]; }); return o; }
  function whyLower(a, b) {
    var out = [];
    Object.keys(a.components).forEach(function (k) { var d = (a.components[k] || 0) - (b.components[k] || 0); if (d > 0.08) out.push(k); });
    return out.length ? "schwächer bei: " + out.join(", ") : "knapp schwächer";
  }
  function ambiguityKind(x, y) {
    if (!y) return { kind: "NONE", note: "keine materiell andere Lesart" };
    /* 3.1 (Red-Team H4): DEGREE nur, wenn eine Lesart die andere als EINE Welle enthaelt (gleicher Start, gleiches Ende bzw.
       beide laufend) UND beide dieselbe laufende Richtung implizieren — sonst ist es ein struktureller Widerspruch. */
    function asWave(big, small) {
      return big.span[0] <= small.span[0] && big.span[1] >= small.span[1] && big.waves.some(function (w) { return w.fromIndex === small.span[0] && (w.toIndex === small.span[1] || (w.status === "DEVELOPING" && !small.complete)); });
    }
    var curDir = function (c) { return c.complete ? -V2.waveDirection(c.sign, c.waves.length) : V2.waveDirection(c.sign, c.waves.length); };
    if ((asWave(y, x) || asWave(x, y)) && curDir(x) === curDir(y)) return { kind: "DEGREE", note: "dieselbe Struktur auf einer anderen Ebene gezählt, gleiche laufende Richtung" };
    var same = x.waves.length === y.waves.length && x.waves.every(function (w, k) { return w.fromIndex === y.waves[k].fromIndex && w.toIndex === y.waves[k].toIndex; });
    if (same) return { kind: "LABEL", note: "gleiche Wellenenden, anderes Muster" };
    var nx = x.complete ? -V2.waveDirection(x.sign, x.waves.length) : V2.waveDirection(x.sign, x.waves.length);
    var ny = y.complete ? -V2.waveDirection(y.sign, y.waves.length) : V2.waveDirection(y.sign, y.waves.length);
    return { kind: "STRUCTURE", note: nx === ny ? "andere Wellenenden, gleiche laufende Richtung" : "andere Wellenenden, andere laufende Richtung", sameDirection: nx === ny };
  }
  /**
   * Anwendbarkeit = Strukturklarheit der Zaehlung: Wie oft stimmte eine Hauptzaehlung mit diesen Merkmalen im synthetischen
   * Korpus (bekannte Struktur)? Logistische Eichung auf Korpus DEVELOPMENT (Ende + Mitte, alle Rauschstufen); Stufen ueber
   * Praezisionsziele: HOCH ab 0,6 (3.1: falsche Sicherheit 13 % im Entwicklungssplit, Layout A+B), MITTEL ab 0,35, darunter
   * KEINE VERLAESSLICHE ZAEHLUNG. Keine Prognose ueber den Kurs — die Eichung misst Methodentreue, nicht Ergebnis.
   */
  function applicability3(q, clarity, snr, cfg, amb, complete, ex) {
    var A = cfg.applicability; ex = ex || {};
    var x = [1, q && isNum(q.score) ? q.score : 0.5, isNum(clarity) ? clamp(clarity / 0.15, 0, 1) : 1, snr ? Math.min(4, snr.ratio) / 4 : 0.3, amb && amb.kind === "STRUCTURE" ? 1 : 0, complete ? 0 : 1];
    if (A.coef.length > 6) x.push(isNum(ex.hier) ? 1 - ex.hier : 0, isNum(ex.prop) ? ex.prop : 0.5, complete ? 0 : (isNum(ex.waveFrac) ? ex.waveFrac : 0));
    var eta = 0; for (var k = 0; k < x.length; k++) eta += x[k] * A.coef[k];
    var score = 1 / (1 + Math.exp(-eta));
    var level = score >= A.high ? "HIGH" : score >= A.moderate ? "MODERATE" : "LOW";
    /* 3.2 (Red-Team 3.2 H3): laufende Zaehlungen hoechstens NIEDRIG — im Korpus (DEVELOPMENT und VALIDATION, alle Layouts) war keine
       laufende Hauptzaehlung mit MITTEL/HOCH richtig. Sie werden als "moegliche Welle" gezeigt, nicht als verlaessliche Zaehlung. */
    if (!complete && A.developingCap) level = "LOW";
    /* 3.2.2 (Mission IV, Engine-3.3-Vorstudie, VALIDATION): abgeschlossene WXY mit MITTEL/HOCH waren in 170 von 266 Faellen falsch –
       meist laufende Impulse, Diagonalen oder Dreiecke, die als fertige Doppelkorrektur gelesen wurden. Nur Absenkung (weniger
       Aussagen), keine neue Behauptung; die Zaehlung selbst bleibt unveraendert. */
    var capped = (A.capPatterns || []).indexOf(ex.pattern) >= 0 && level !== "LOW";
    if (capped) level = "LOW";
    /* Wellen kaum groesser als ein Zufallspfad gleicher Dauer: hoechstens MITTEL (Korpus DEVELOPMENT, hohes Rauschen) */
    if (level === "HIGH" && snr && isNum(A.highMinZ) && snr.ratio < A.highMinZ) level = "MODERATE";
    var reasons = [];
    if (amb && amb.kind === "STRUCTURE" && isNum(clarity) && clarity < 0.05) reasons.push("Mehrere Lesarten mit anderen Wellenenden liegen fast gleichauf");
    if (q && q.level === "LOW") reasons.push("Die beste Zählung erfüllt die Richtlinien nur schwach");
    if (snr && snr.ratio < 1.3) reasons.push("Die Wellen sind kaum größer als ein Zufallspfad gleicher Dauer");
    if (capped) reasons.push("Doppelte Korrekturen (W-X-Y) sind oft ein noch laufendes Muster – deshalb nie als verlässliche Zählung");
    if (!complete) reasons.push("Das Muster läuft noch – laufende Zählungen sind seltener richtig als abgeschlossene");
    if (isNum(ex.prop) && ex.prop < 0.5) reasons.push("Die Wellen sind in Zeit und Preis ungleich groß – möglicherweise werden verschiedene Grade vermischt");
    if (isNum(ex.hier) && ex.hier < 1) reasons.push("Die Zählung schneidet eine andere vollständige Struktur – Gradzuordnung unsicher");
    if (amb && amb.kind === "DEGREE") reasons.push("Alternative zählt dieselbe Struktur nur auf einer anderen Ebene (kein Widerspruch)");
    return { score: round(score, 3), level: level, abstain: level === "LOW", basis: "synthetic-calibrated structural clarity",
             components: { countQuality: x[1], clarity: round(x[2], 3), signalToNoise: snr ? snr.ratio : null, structureAmbiguity: x[4] === 1, developing: x[5] === 1, hierarchyConflict: x[6] > 0, proportion: isNum(x[7]) ? round(x[7], 3) : null },
             signalToNoise: snr ? snr.ratio : null, reasons: level === "HIGH" ? reasons.filter(function (r) { return /Ebene/.test(r); }) : reasons };
  }
  function nearestScale(e, pivots) {
    var ids = pivots && pivots.scaleIds ? pivots.scaleIds : ["scale-1"];
    var rel = mean(e.waves.filter(function (w) { return w.status !== "DEVELOPING"; }).map(function (w) { return Math.abs(w.toPrice - w.fromPrice) / Math.max(1e-9, Math.min(w.toPrice, w.fromPrice)); }));
    var th = ids.map(function (id) { return pivots.scales[id].params ? pivots.scales[id].params.minPct : 0; });
    var pick = ids[0];
    for (var k = 0; k < ids.length; k++) if (isNum(rel) && rel >= th[k] * 1.6) pick = ids[k];
    return pick;
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, PROFILES: PROFILES, analyzeElliottV3: analyze, buildPool: buildPool, classifySegment: classifySegment, zigzagSegment: zigzagSegment };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottV3 = api; }
})(typeof window !== "undefined" ? window : globalThis);
