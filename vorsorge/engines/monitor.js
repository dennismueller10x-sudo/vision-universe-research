/* =========================================================================
   VISION UNIVERSE VORSORGE — monitor.js   (vorsorge-monitor-1.0.0)

   "Was hat sich veraendert?" und "Bin ich auf Kurs?".

   Zwei Quellen fuer Aenderungen:
   1. ETF-Stamm: der Build vergleicht den neuen mit dem vorherigen Stand
      (diffMasters) und schreibt die Ereignisse nach data/changes.json.
      Erkannt wird nur, was der Stamm belegt: Name, Status (inaktiv /
      delistet), Index, neue Listings, verschwundene Listings. TER, Fusionen
      und Tracking Difference brauchen eine Emittentenquelle - bis dahin
      stehen sie als "nicht ueberwacht" in der Liste, nicht als "keine
      Aenderung".
   2. Eigener Plan: ein gespeicherter Schnappschuss wird mit der aktuellen
      Rechnung verglichen (diffPlan).
   Regulatorische Aenderungen erscheinen nur, wenn eine Regeldatei mit
   neuer ruleVersion vorliegt - nie als freie Behauptung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "vorsorge-monitor-1.0.0";

  var UNMONITORED = [
    { type: "TER_CHANGE", label: "ETF-Kosten (TER) geändert", reason: "Keine Emittentenquelle für Kostenquoten angeschlossen." },
    { type: "FUND_MERGER", label: "ETF fusioniert", reason: "Fusionen melden Emittenten; Quelle nicht angeschlossen." },
    { type: "TRACKING_DIFFERENCE", label: "Tracking Difference verändert", reason: "Benötigt Indexstände und Gesamtrendite; nicht angeschlossen." }
  ];

  function diffMasters(prev, next, asOf) {
    var events = [];
    var P = {}, N = {};
    (prev && prev.etfs || []).forEach(function (e) { P[e.listingId] = e; });
    (next && next.etfs || []).forEach(function (e) { N[e.listingId] = e; });
    Object.keys(N).forEach(function (id) {
      var a = P[id], b = N[id];
      if (!a) { if (prev) events.push({ type: "NEW_LISTING", symbol: b.symbol, text: b.symbol + " ist neu im ETF-Verzeichnis.", asOf: asOf }); return; }
      if (a.name !== b.name) events.push({ type: "NAME_CHANGE", symbol: b.symbol, from: a.name, to: b.name, text: b.symbol + " heißt jetzt „" + b.name + "“.", asOf: asOf });
      if (a.index !== b.index) events.push({ type: "INDEX_CHANGE", symbol: b.symbol, from: a.index, to: b.index, text: "Index von " + b.symbol + " geändert: " + (a.index || "–") + " → " + (b.index || "–") + ".", asOf: asOf });
      if (a.status !== b.status) events.push({ type: b.status === "INACTIVE" ? "CLOSED_OR_DELISTED" : "STATUS_CHANGE", symbol: b.symbol, from: a.status, to: b.status,
        text: b.status === "INACTIVE" ? b.symbol + " wird nicht mehr gehandelt (geschlossen oder delistet)." : "Status von " + b.symbol + ": " + a.status + " → " + b.status + ".", asOf: asOf });
    });
    Object.keys(P).forEach(function (id) {
      if (!N[id]) events.push({ type: "REMOVED", symbol: P[id].symbol, text: P[id].symbol + " ist nicht mehr im Verzeichnis des Anbieters.", asOf: asOf });
    });
    return { version: VERSION, asOf: asOf, events: events, unmonitored: UNMONITORED };
  }

  /** Plan-Schnappschuss: nur, was sich spaeter vergleichen laesst. */
  function snapshotPlan(planResult, portfolio, at) {
    var base = (planResult.scenarios || []).filter(function (s) { return s.id === "basis"; })[0] || planResult.scenarios[0];
    return { at: at, monthly: planResult.input.monthly, cost: planResult.input.cost, targetAge: planResult.input.targetAge,
      goalAttainment: base ? base.goalAttainment : null, realBase: base ? base.real : null,
      portfolio: (portfolio || []).map(function (p) { return { symbol: p.symbol, weight: p.weight }; }) };
  }

  function diffPlan(prev, next) {
    if (!prev) return [];
    var out = [];
    function pct(x) { return Math.round(x * 100); }
    if (prev.goalAttainment !== null && next.goalAttainment !== null && Math.abs(next.goalAttainment - prev.goalAttainment) >= 0.01) {
      out.push({ type: "GOAL_ATTAINMENT", text: "Zielerreichung " + pct(prev.goalAttainment) + " % → " + pct(next.goalAttainment) + " %.", delta: next.goalAttainment - prev.goalAttainment });
    }
    if (prev.monthly !== next.monthly) out.push({ type: "SAVINGS_RATE", text: "Sparrate " + prev.monthly + " € → " + next.monthly + " €." });
    if (prev.cost !== next.cost) out.push({ type: "COST", text: "Kostenannahme " + (prev.cost * 100).toFixed(2) + " % → " + (next.cost * 100).toFixed(2) + " %." });
    var a = JSON.stringify(prev.portfolio || []), b = JSON.stringify(next.portfolio || []);
    if (a !== b) out.push({ type: "PORTFOLIO", text: "Portfolio-Zusammensetzung geändert." });
    return out;
  }

  /** Ampel: auf Kurs ab 100 % Zielerreichung im Basisszenario, knapp ab 80 %. */
  function onTrack(goalAttainment) {
    if (goalAttainment === null || goalAttainment === undefined || !Number.isFinite(goalAttainment)) return { state: "UNKNOWN", label: "Noch kein Plan" };
    if (goalAttainment >= 1) return { state: "ON_TRACK", label: "Auf Kurs" };
    if (goalAttainment >= 0.8) return { state: "CLOSE", label: "Knapp" };
    return { state: "OFF_TRACK", label: "Nicht auf Kurs" };
  }

  /**
   * Riester-Analyse: BEHALTEN vs. NEUAUSRICHTUNG als zwei Szenarien.
   * Keine Empfehlung - nur die Rechnung mit den eingegebenen Annahmen.
   */
  function riesterComparison(input, M) {
    input = input || {};
    var years = Math.max(0, Number(input.years) || 0);
    var keep = M.futureValue({ start: input.contractValue, monthly: (Number(input.ownMonthly) || 0) + (Number(input.allowanceYearly) || 0) / 12,
      years: years, annualReturn: input.keepReturn, annualCost: input.keepCost });
    var switchStart = Math.max(0, (Number(input.contractValue) || 0) - (Number(input.switchCost) || 0));
    var sw = M.futureValue({ start: switchStart, monthly: (Number(input.ownMonthly) || 0) + (Number(input.newAllowanceYearly) || 0) / 12,
      years: years, annualReturn: input.newReturn, annualCost: input.newCost });
    var guarantee = Number(input.guaranteedValue) || 0;
    return {
      version: VERSION,
      keep: { label: "Behalten", endValue: keep.nominal, invested: keep.invested, guaranteeFloor: guarantee || null },
      realign: { label: "Wechsel / Neuausrichtung", endValue: sw.nominal, invested: sw.invested, startAfterCosts: switchStart, guaranteeFloor: null },
      difference: sw.nominal - keep.nominal,
      breakEvenNote: guarantee > 0 ? "Der Bestandsvertrag garantiert " + Math.round(guarantee) + " € zum Rentenbeginn. Die Neuausrichtung hat keine solche Garantie." : null,
      caveats: ["Förderung kann bei einem Wechsel anders ausfallen oder zurückgefordert werden (förderschädliche Verwendung prüfen).",
        "Abschluss- und Vertriebskosten eines neuen Vertrags sind in den Wechselkosten anzugeben.",
        "Szenarien, keine Empfehlung."]
    };
  }

  var api = { VERSION: VERSION, UNMONITORED: UNMONITORED, diffMasters: diffMasters, snapshotPlan: snapshotPlan,
    diffPlan: diffPlan, onTrack: onTrack, riesterComparison: riesterComparison };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Monitor = api; }
})(typeof window !== "undefined" ? window : globalThis);
