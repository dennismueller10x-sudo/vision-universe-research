/* =========================================================================
   VISION UNIVERSE — explore-curation.js
   EXPLORE HIGHLIGHTS und CANDIDATE EXPLORER (explore-curation-1.0.0)

   AUFGABE
   Die Elliott-Engine (eingefroren) liefert je Titel einen Pool regelkonformer Zaehlungen. Explore Elliott 1.0.0 zeigte
   bis zu drei davon auf 74 % aller Titel. Diese Schicht KURIERT nur: sie waehlt aus bereits gueltigen, bereits
   gefilterten Kandidaten (ti-projection.mjs#exploreCandidateList) aus, welche dem Kunden als Highlight gezeigt werden
   und welche nur im technischen Candidate Explorer (Pro) stehen. Sie erzeugt keine Zaehlung, aendert keinen Rang,
   keine Regel, keine Projektionsformel und kein Gate.

   GRUNDSATZ
   Eine gueltige Zaehlung ist kein Highlight. Ein Highlight ist
     - strukturell sauber GENUG (die Struktur-Leitplanken G3 Rauschen und G4 Groesse sind erfuellt),
     - hoechstens in EINER Deutungs-Leitplanke auffaellig (G2 Grad-Zuordnung ODER G5 gegen den Trend, nie beide),
     - gut platziert im Kandidatenpool der Engine (Rang je Wellentyp),
     - strategisch lesbar (Welle 3 vor Welle 5 vor Welle C),
     - von jeder angezeigten Hauptlesart und von einem zweiten Highlight deutlich verschieden.

   WARUM G3/G4 HART UND G2/G5 WEICH
   G3 (Signal/Rauschen der bestaetigten Wellen >= 3,0) und G4 (erste Welle >= 26 Wochen) messen, ob die Zaehlung eine
   reale, ausreichend grosse Struktur beschreibt. Verfehlt sie eines davon, ist sie Rauschen der Kandidatensuche oder zu
   klein fuer ein Wochenchart-Argument — unabhaengig davon, wie hoch ihre Projektion rechnet. G2 (Grad kollidiert mit einer
   abgeschlossenen Struktur vergleichbarer Groesse) und G5 (gegen den gemessenen Trend) betreffen die DEUTUNG einer sauberen
   Struktur; Elliott-Umkehrungen laufen legitim gegen den Trend. Zwei Deutungsunsicherheiten zugleich (G2 + G5) sind eine zu viel.

   KEINE WAHRSCHEINLICHKEIT
   Rang ist ein Platz im Pool, keine Trefferquote. Die Sortierung ist lexikographisch (keine Gewichte, kein Punktwert)
   und benutzt weder Projektionsgroesse noch Kursziele noch Zukunftsrenditen. Trend, Relative Staerke und Marktstruktur
   senken hoechstens die Reihenfolge (Gleichstand-Stufe), sperren nie. (Die Relative Staerke bleibt Anzeige: sie entsteht nur im Querschnitt eines Laufs.)
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "explore-curation-1.0.0";
  var HIGHLIGHT_VERSION = "explore-highlight-1.0.0";
  var CANDIDATES_VERSION = "explore-candidates-1.0.0";

  /* Richtlinie (vor jeder Auswertung der Kandidaten festgelegt, aus der Bedeutung der Leitplanken abgeleitet; nicht an
     Einzeltiteln und nicht an Ergebnissen eingestellt). Die Rangschwellen sind je Wellentyp festgelegt: Welle 3 ist die
     strategisch wichtigste Lesart, Welle C die haeufigste und unspezifischste. */
  var POLICY = Object.freeze({
    version: VERSION,
    highlight: Object.freeze({
      max: 2,
      /* erlaubte Mengen verfehlter Leitplanken — alles andere (auch G3, G4, jede Kombination) ist kein Highlight */
      allowedFailedSets: Object.freeze(["G2", "G5"]),
      /* beste Rangposition im Pool (Anteil, kleiner = besser): (Rang + 1) / Poolgroesse <= Schwelle */
      rankMax: Object.freeze({ WAVE_3: 0.25, WAVE_5: 0.25, WAVE_C: 0.10 }),
      /* Wellentyp-Prioritaet (kleiner = zuerst) */
      typePriority: Object.freeze({ WAVE_3: 1, WAVE_5: 2, WAVE_C: 3 }),
      /* Rang-Stufen fuer die Reihenfolge (obere Grenzen des Anteils): innerhalb einer Stufe entscheidet zuerst der Kontext, dann die Groesse, dann der genaue Rang */
      rankTiers: Object.freeze([0.10, 0.25, 0.50])
    }),
    candidates: Object.freeze({ max: 6, ladderNearDuplicate: 0.10 })
  });

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function rankPct(c) { return (c.rank + 1) / c.pool; }
  function failedSet(c) { return (c.failed || []).slice().sort().join("+"); }
  function typeP(c, policy) { var p = policy.highlight.typePriority[c.type]; return isNum(p) ? p : 9; }

  /** Kontext-Uebereinstimmung (0..2): Trend und Marktstruktur stehen hinter der These. Nur Reihenfolge, nie Sperre.
      Die Relative Staerke wird dem Kunden gezeigt, geht aber NICHT in die Reihenfolge ein: sie entsteht nur im Querschnitt aller Titel eines Laufs,
      Produkt-Build und Register rechnen diesen Querschnitt getrennt. Mit ihr koennten beide verschiedene Highlights waehlen. Trend und Marktstruktur
      folgen allein aus den Daten des Titels und sind in Produkt und Register gleich. */
  function contextAgreement(c) {
    var x = c.ctx || {}, n = 0;
    if (x.trendAligned === true) n++;
    if (x.structureAligned === true) n++;
    return n;
  }

  /**
   * Highlight-Eignung eines Kandidaten. Rein; ohne Kontext der anderen Kandidaten.
   * @returns {{eligible:boolean, reasons:string[]}}  reasons: Codes der Gruende, warum nicht
   */
  function highlightEligibility(c, policy) {
    policy = policy || POLICY;
    var P = policy.highlight, why = [];
    var set = failedSet(c);
    if (!c.failed || !c.failed.length) why.push("NO_FAILED_GATE");           // ohne verfehlte Leitplanke waere es eine reguläre Alternative (nicht Sache von Explore)
    else if (P.allowedFailedSets.indexOf(set) < 0) why.push(/G3|G4/.test(set) ? "STRUCTURE_GATE_FAILED" : "TOO_MANY_FAILED_GATES");
    var max = P.rankMax[c.type];
    if (!isNum(max)) why.push("TYPE_NOT_PROMOTED");
    else if (!(rankPct(c) <= max)) why.push("RANK_BELOW_THRESHOLD");
    return { eligible: why.length === 0, reasons: why };
  }

  /** Rang-Stufe (0 = oberste): grobe Einteilung des Rangs im Pool, damit Kontext und Groesse innerhalb einer Stufe etwas bewirken koennen. */
  function rankTier(c, policy) {
    var t = (policy || POLICY).highlight.rankTiers, p = rankPct(c);
    for (var i = 0; i < t.length; i++) if (p <= t[i]) return i;
    return t.length;
  }
  /** Reihenfolge (lexikographisch, aufsteigend = besser). Kein Punktwert, keine Gewichte, keine Projektionsgroesse.
      Der Kontext (Trend, Relative Staerke, Marktstruktur) steht NACH Struktur, Wellentyp und Rang-Stufe: er senkt nur die Reihenfolge innerhalb
      gleich guter Lesarten, sperrt nie und hebt nie eine schlechter platzierte Struktur ueber eine besser platzierte. */
  function orderKey(c, policy) {
    policy = policy || POLICY;
    return [
      (c.failed || []).length,        // 1 weniger verfehlte Leitplanken
      typeP(c, policy),               // 2 Wellentyp: 3 vor 5 vor C
      rankTier(c, policy),            // 3 Rang-Stufe im Pool (<=10 %, <=25 %, <=50 %)
      -contextAgreement(c),           // 4 Kontext hinter der These (0..2: Trend, Marktstruktur)
      -(c.w1Weeks || 0),              // 5 groessere Struktur (laengere erste Welle) zuerst
      rankPct(c),                     // 6 genauer Rang im Pool
      String(c.id)                    // 7 stabil
    ];
  }
  function cmp(a, b) {
    for (var i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
    return 0;
  }
  function sortByOrder(list, policy) {
    return list.map(function (c) { return { c: c, k: orderKey(c, policy) }; }).sort(function (x, y) { return cmp(x.k, y.k); }).map(function (x) { return x.c; });
  }

  /** Zwei Kandidaten sind "gleich" im Sinn des Anzeigeschutzes: gleiche Richtung, gleicher Wellentyp, Leiter innerhalb der Toleranz. */
  function nearDuplicate(a, b, tol) {
    if (a.direction !== b.direction || a.type !== b.type) return false;
    if (!isNum(a.mid) || !isNum(b.mid) || a.mid === 0 || b.mid === 0) return a.pattern === b.pattern && a.variant === b.variant;
    return Math.abs(a.mid / b.mid - 1) <= tol;
  }
  /** Zweites Highlight: wesentlich anderes Szenario (Gegenrichtung ODER anderer Wellentyp). */
  function materiallyDifferent(a, b) { return a.direction !== b.direction || a.type !== b.type; }

  /**
   * Kuratierung eines Titels.
   * @param {object[]} cands  Kandidaten (id, type, pattern, variant, direction, failed[], rank, pool, w1Weeks, mid, ctx)
   * @returns {{highlights:object[], candidates:object[], decisions:Object<string,{tier:string, why:string[], rankPct:number, failedSet:string}>}}
   */
  function curate(cands, policy) {
    policy = policy || POLICY;
    var H = policy.highlight, decisions = {}, sorted = sortByOrder(cands || [], policy);
    var elig = [];
    sorted.forEach(function (c) {
      var e = highlightEligibility(c, policy);
      decisions[c.id] = { tier: "CANDIDATE", why: e.reasons.slice(), rankPct: rankPct(c), failedSet: failedSet(c) };
      if (e.eligible) elig.push(c);
    });
    var highlights = [];
    elig.forEach(function (c) {
      if (highlights.length >= H.max) { decisions[c.id].why.push("HIGHLIGHT_SLOTS_FULL"); return; }
      if (highlights.length && !materiallyDifferent(highlights[0], c)) { decisions[c.id].why.push("NOT_DISTINCT_FROM_HIGHLIGHT"); return; }
      highlights.push(c); decisions[c.id].tier = "HIGHLIGHT"; decisions[c.id].why = [];
    });
    /* Candidate Explorer: beste strukturell verschiedene Kandidaten ausser den Highlights, gleiche Reihenfolge, Anzahl begrenzt */
    var candidates = [], C = policy.candidates;
    sorted.forEach(function (c) {
      if (decisions[c.id].tier === "HIGHLIGHT") return;
      if (candidates.length >= C.max) { decisions[c.id].tier = "DROPPED"; decisions[c.id].why.push("CANDIDATE_SLOTS_FULL"); return; }
      if (highlights.concat(candidates).some(function (o) { return nearDuplicate(o, c, C.ladderNearDuplicate); })) { decisions[c.id].tier = "DROPPED"; decisions[c.id].why.push("NEAR_DUPLICATE"); return; }
      candidates.push(c);
    });
    return { highlights: highlights, candidates: candidates, decisions: decisions };
  }

  var api = { VERSION: VERSION, HIGHLIGHT_VERSION: HIGHLIGHT_VERSION, CANDIDATES_VERSION: CANDIDATES_VERSION, POLICY: POLICY,
              rankPct: rankPct, rankTier: rankTier, failedSet: failedSet, contextAgreement: contextAgreement, highlightEligibility: highlightEligibility,
              orderKey: orderKey, sortByOrder: sortByOrder, nearDuplicate: nearDuplicate, materiallyDifferent: materiallyDifferent, curate: curate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ExploreCuration = api; }
})(typeof window !== "undefined" ? window : globalThis);
