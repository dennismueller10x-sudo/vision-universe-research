/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/alerts.js
   ALERT-MODELL: Vergleich zweier Analyse-Zustaende → Ereignisse

   Jedes Ergebnis traegt `alerts` (engine.js alertState): Szenario-ID,
   Ausblick, Konfidenz und die Niveaus. Ein Alert entsteht, wenn sich
   zwischen zwei Snapshots desselben Titels etwas Bedeutsames aendert.
   Keine Benachrichtigungs-Infrastruktur hier — nur das Datenmodell und
   die deterministische Ableitung (Build schreibt alerts.json je Lauf).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "ti-alerts-1.0.0";
  var TYPES = {
    ENTRY_ZONE_REACHED: "Kurs hat die Einstiegszone erreicht",
    BREAKOUT_CONFIRMED: "Bestätigungsniveau per Schlusskurs überwunden",
    TARGET_REACHED: "Zielzone 1 erreicht",
    INVALIDATED: "Szenario per Schlusskurs ungültig",
    SCENARIO_CHANGED: "Hauptszenario hat die Richtung gewechselt",
    CONFIDENCE_CHANGED: "Einigkeit der Verfahren hat sich deutlich verändert"
  };
  var RANK = { LOW: 0, MODERATE: 1, HIGH: 2 };

  /**
   * @param {object|null} prev  alertState des vorherigen Laufs
   * @param {object} next       alertState des aktuellen Laufs
   * @param {object} meta       { symbol, asOf }
   */
  function diff(prev, next, meta) {
    var out = [];
    function ev(type, extra) { out.push(Object.assign({ type: type, text: TYPES[type], symbol: meta.symbol, asOf: meta.asOf }, extra || {})); }
    if (!next) return out;
    if (prev && prev.direction && next.direction && prev.direction !== next.direction) ev("SCENARIO_CHANGED", { from: prev.direction, to: next.direction });
    if (prev && prev.confidence && next.confidence && Math.abs(RANK[prev.confidence] - RANK[next.confidence]) >= 2) ev("CONFIDENCE_CHANGED", { from: prev.confidence, to: next.confidence });
    var sameScenario = prev && prev.scenarioId === next.scenarioId;
    var pf = (prev && prev.flags) || {}, nf = next.flags || {};
    /* Ereignisse nur bei Flankenwechsel desselben Szenarios — ein neues Szenario startet ohne Altlasten. */
    if (nf.inEntryZone && !(sameScenario && pf.inEntryZone)) ev("ENTRY_ZONE_REACHED", { levels: next.levels && [next.levels.entryLow, next.levels.entryHigh] });
    if (nf.confirmed && sameScenario && !pf.confirmed) ev("BREAKOUT_CONFIRMED", { level: next.levels && next.levels.confirmation });
    if (nf.target1Reached && sameScenario && !pf.target1Reached) ev("TARGET_REACHED", { zone: next.levels && next.levels.target1 });
    if (nf.invalidated && sameScenario && !pf.invalidated) ev("INVALIDATED", { level: next.levels && next.levels.invalidation });
    return out;
  }

  /**
   * Ein ganzer Lauf (Mission IV §51): Ereignisse nur, wenn sich die MARKTDATEN eines Titels bewegt haben — nie aus einer
   * Methoden- oder Engine-Aenderung. Regeln:
   *   1. kein voriger Index → Ausgangszustand, keine Ereignisse
   *   2. anderer Methodenschluessel (Engine-/Regel-/Bundle-Versionen) → alle Ereignisse unterdrueckt ("METHODOLOGY_CHANGED")
   *   3. je Titel: gleiches Datenstand-Datum wie zuvor → keine Ereignisse ("DATA_UNCHANGED")
   *   4. Titel ohne vorige Zeile (neu im Universum) → Ausgangszustand, keine Ereignisse
   * @param prev  { methodologyKey, rows: [{ t, asOf, alerts }] } | null
   * @param next  { methodologyKey, rows: [{ t, asOf, alerts }] }
   */
  function diffRun(prev, next) {
    if (!prev || !prev.rows || !prev.rows.length) return { events: [], suppressed: "BASELINE", skippedUnchanged: 0 };
    if (prev.methodologyKey !== next.methodologyKey) return { events: [], suppressed: "METHODOLOGY_CHANGED", skippedUnchanged: 0, from: prev.methodologyKey || null, to: next.methodologyKey };
    var byT = {}; prev.rows.forEach(function (r) { byT[r.t] = r; });
    var events = [], skipped = 0;
    next.rows.forEach(function (r) {
      var p0 = byT[r.t];
      if (!p0) return;                                   // neuer oder wieder aufgenommener Titel: Ausgangszustand, kein Ereignis
      if (p0.asOf && r.asOf && p0.asOf === r.asOf) { skipped++; return; }
      diff(p0 ? p0.alerts : null, r.alerts, { symbol: r.t, asOf: r.asOf }).forEach(function (e) { events.push(e); });
    });
    return { events: events, suppressed: null, skippedUnchanged: skipped };
  }

  var api = { VERSION: VERSION, TYPES: TYPES, diff: diff, diffRun: diffRun };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIAlerts = api; }
})(typeof window !== "undefined" ? window : globalThis);
