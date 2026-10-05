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
    { type: "TER_CHANGE", label: "ETF-Kosten (TER) geändert", reason: "US-Kostenquoten aus SEC-Prospektdaten liegen vor, Änderungen zwischen Prospektständen werden noch nicht verglichen; für UCITS-ETFs keine lizenzierte Kostenquelle." },
    { type: "FUND_MERGER", label: "ETF fusioniert", reason: "Fusionen melden Emittenten; Quelle nicht angeschlossen." },
    { type: "TRACKING_DIFFERENCE", label: "Tracking Difference verändert", reason: "Benötigt Indexstände und Gesamtrendite; nicht angeschlossen." }
  ];

  var CATEGORY = { NEW_LISTING: "PRODUCT_CHANGE", NAME_CHANGE: "PRODUCT_CHANGE", INDEX_CHANGE: "PRODUCT_CHANGE", CLOSED_OR_DELISTED: "PRODUCT_CHANGE",
    STATUS_CHANGE: "PRODUCT_CHANGE", REMOVED: "PRODUCT_CHANGE", DATA_REVIEW: "DATA_UPDATE", COST_CHANGE: "PRODUCT_CHANGE", VOLATILITY_CHANGE: "MARKET_CHANGE", NEW_PRICE_SERIES: "DATA_UPDATE",
    GOAL_ATTAINMENT: "PLAN_CHANGE", SAVINGS_RATE: "PLAN_CHANGE", COST: "PLAN_CHANGE", PORTFOLIO: "PORTFOLIO_CHANGE",
    PORTFOLIO_RISK: "MARKET_CHANGE", RULE_VERSION: "REGULATORY_CHANGE", DATA_AS_OF: "DATA_UPDATE" };
  var CATEGORY_LABEL = { MARKET_CHANGE: "Markt", PORTFOLIO_CHANGE: "Portfolio", PLAN_CHANGE: "Plan", PRODUCT_CHANGE: "Produkt", REGULATORY_CHANGE: "Regeln", DATA_UPDATE: "Daten" };
  function tag(e) { e.category = CATEGORY[e.type] || "DATA_UPDATE"; return e; }

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
      if (a.vol && b.vol && Math.abs(b.vol / a.vol - 1) > 0.3) events.push({ type: "VOLATILITY_CHANGE", symbol: b.symbol, from: a.vol, to: b.vol, text: "Schwankung von " + b.symbol + " deutlich verändert: " + Math.round(a.vol * 100) + " % → " + Math.round(b.vol * 100) + " % p.a.", asOf: asOf });
      if ((a.hy === null || a.hy === undefined) && b.hy !== null && b.hy !== undefined) events.push({ type: "NEW_PRICE_SERIES", symbol: b.symbol, text: "Für " + b.symbol + " liegt jetzt eine Kursreihe vor.", asOf: asOf });
      if (a.status !== b.status) events.push({ type: b.status === "INACTIVE" ? "CLOSED_OR_DELISTED" : "STATUS_CHANGE", symbol: b.symbol, from: a.status, to: b.status,
        text: b.status === "INACTIVE" ? b.symbol + " wird nicht mehr gehandelt (geschlossen oder delistet)." : "Status von " + b.symbol + ": " + a.status + " → " + b.status + ".", asOf: asOf });
    });
    Object.keys(P).forEach(function (id) {
      if (!N[id]) events.push({ type: "REMOVED", symbol: P[id].symbol, text: P[id].symbol + " ist nicht mehr im Verzeichnis des Anbieters.", asOf: asOf });
    });
    // Bei sehr vielen neuen Listings (Erstaufnahme) eine Sammelmeldung statt tausender Einzelzeilen
    var news = events.filter(function (e) { return e.type === "NEW_LISTING"; });
    if (news.length > 50) events = events.filter(function (e) { return e.type !== "NEW_LISTING"; }).concat([{ type: "NEW_LISTING", symbol: null, count: news.length, text: news.length + " ETF-Listings neu im Verzeichnis (Aufnahme des Tiingo-ETF-Universums).", asOf: asOf }]);
    return { version: VERSION, asOf: asOf, events: events.map(tag), unmonitored: UNMONITORED, categories: CATEGORY_LABEL };
  }

  /**
   * Relevanz und Buendelung fuer "Daten & Produkte" (Monitor, Home).
   * - Wechsel des internen Pruefstatus (REVIEW <-> ACTIVE) sind keine Produktaenderung:
   *   je Richtung eine Datenmeldung mit Anzahl und Beispielen.
   * - Relevanz HIGH fuer Listings im oeffentlichen Analyse-Universum, sonst LOW.
   * - Mehr als BUNDLE gleichartige Ereignisse: bis zu 5 relevante einzeln, der Rest gebuendelt.
   * Idempotent: bereits gebuendelte Meldungen (count) bleiben unveraendert.
   */
  var TYPE_ORDER = ["CLOSED_OR_DELISTED", "COST_CHANGE", "NAME_CHANGE", "INDEX_CHANGE", "REMOVED", "NEW_PRICE_SERIES", "VOLATILITY_CHANGE", "NEW_LISTING", "STATUS_CHANGE", "DATA_REVIEW"];
  var TYPE_LABEL = { CLOSED_OR_DELISTED: "geschlossen oder delistet", COST_CHANGE: "mit geänderter Kostenquote laut Prospekt", NAME_CHANGE: "mit neuem Namen", INDEX_CHANGE: "mit geändertem Index", REMOVED: "nicht mehr im Verzeichnis",
    NEW_PRICE_SERIES: "mit neuer Kursreihe", VOLATILITY_CHANGE: "mit deutlich veränderter Schwankung", NEW_LISTING: "neu im Verzeichnis", STATUS_CHANGE: "mit geändertem Status" };
  function examples(list) { var s = list.map(function (e) { return e.symbol; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }); return s.length ? " (z. B. " + s.slice(0, 5).join(", ") + ")" : ""; }
  function prioritize(events, layerOf, opts) {
    var BUNDLE = (opts && opts.bundle) || 10, layer = layerOf || {}, out = [], byType = {};
    var review = { ACTIVE: [], REVIEW: [] };
    (events || []).forEach(function (e) {
      if (e.count) { out.push(e); return; }
      if (e.type === "STATUS_CHANGE" && (e.from === "REVIEW" || e.from === "ACTIVE") && (e.to === "REVIEW" || e.to === "ACTIVE")) { review[e.to].push(e); return; }
      var x = Object.assign({}, e, { relevance: layer[e.symbol] === "PUBLIC_ANALYSIS" ? "HIGH" : "LOW" });
      (byType[x.type] = byType[x.type] || []).push(x);
    });
    Object.keys(byType).forEach(function (t) {
      var list = byType[t].sort(function (a, b) { return (a.relevance === "HIGH" ? 0 : 1) - (b.relevance === "HIGH" ? 0 : 1) || (b.magnitude || 0) - (a.magnitude || 0) || String(a.symbol).localeCompare(String(b.symbol)); });
      if (list.length <= BUNDLE) { out = out.concat(list); return; }
      var keep = list.filter(function (e) { return e.relevance === "HIGH"; }).slice(0, 5), rest = list.filter(function (e) { return keep.indexOf(e) < 0; });
      out = out.concat(keep);
      out.push(tag({ type: t, symbol: null, count: rest.length, relevance: "LOW", asOf: rest[0].asOf, text: rest.length + (rest.length === 1 ? " weiteres Listing " : " weitere Listings ") + (TYPE_LABEL[t] || t) + examples(rest) + "." }));
    });
    if (review.ACTIVE.length) out.push(tag({ type: "DATA_REVIEW", symbol: null, count: review.ACTIVE.length, relevance: "LOW", asOf: review.ACTIVE[0].asOf,
      text: review.ACTIVE.length + (review.ACTIVE.length === 1 ? " Listing hat die Datenprüfung bestanden und ist" : " Listings haben die Datenprüfung bestanden und sind") + " jetzt vollständig analysierbar" + examples(review.ACTIVE) + "." }));
    if (review.REVIEW.length) out.push(tag({ type: "DATA_REVIEW", symbol: null, count: review.REVIEW.length, relevance: "LOW", asOf: review.REVIEW[0].asOf,
      text: review.REVIEW.length + (review.REVIEW.length === 1 ? " Listing" : " Listings") + " wegen unvollständiger Daten zurück in Prüfung" + examples(review.REVIEW) + "." }));
    return out.map(function (e) { return e.category ? e : tag(e); }).sort(function (a, b) {
      return (a.relevance === "HIGH" ? 0 : 1) - (b.relevance === "HIGH" ? 0 : 1) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || (a.count ? 1 : 0) - (b.count ? 1 : 0);
    });
  }

  /** Plan-Schnappschuss: nur, was sich spaeter vergleichen laesst. */
  function snapshotPlan(planResult, portfolio, at, ctx) {
    var base = (planResult.scenarios || []).filter(function (s) { return s.id === "basis"; })[0] || planResult.scenarios[0];
    ctx = ctx || {};
    return { at: at, dataAsOf: ctx.dataAsOf || null, ruleVersions: ctx.ruleVersions || null, portfolioVol: ctx.portfolioVol === undefined ? null : ctx.portfolioVol,
      monthly: planResult.input.monthly, cost: planResult.input.cost, targetAge: planResult.input.targetAge,
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
    if (prev.portfolioVol && next.portfolioVol && Math.abs(next.portfolioVol / prev.portfolioVol - 1) > 0.2) out.push({ type: "PORTFOLIO_RISK", text: "Schwankung deines Portfolios: " + pct(prev.portfolioVol) + " % → " + pct(next.portfolioVol) + " % p.a." });
    if (prev.ruleVersions && next.ruleVersions) Object.keys(next.ruleVersions).forEach(function (k) {
      if (prev.ruleVersions[k] && prev.ruleVersions[k] !== next.ruleVersions[k]) out.push({ type: "RULE_VERSION", text: "Förderregel " + k + " aktualisiert: " + prev.ruleVersions[k] + " → " + next.ruleVersions[k] + "." });
    });
    if (prev.dataAsOf && next.dataAsOf && prev.dataAsOf !== next.dataAsOf) out.push({ type: "DATA_AS_OF", text: "Neuer Datenstand: " + prev.dataAsOf + " → " + next.dataAsOf + "." });
    return out.map(tag);
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

  var api = { VERSION: VERSION, prioritize: prioritize, CATEGORY: CATEGORY, CATEGORY_LABEL: CATEGORY_LABEL, UNMONITORED: UNMONITORED, diffMasters: diffMasters, snapshotPlan: snapshotPlan,
    diffPlan: diffPlan, onTrack: onTrack, riesterComparison: riesterComparison };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Monitor = api; }
})(typeof window !== "undefined" ? window : globalThis);
