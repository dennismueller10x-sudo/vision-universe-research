/* =========================================================================
   VISION UNIVERSE QUANT — engines/quant-radar.js        quant-radar-1.0.0

   FRAGE, DIE DIESE DATEI BEANTWORTET
   "Was ist heute neu?" - und zwar ausschliesslich aus Zustaenden, die die
   bestehenden Engines schon veroeffentlichen. Der Radar erfindet kein
   Signal. Er vergleicht zwei veroeffentlichte Staende derselben Engine und
   benennt den Wechsel.

   QUELLEN (je Ereignistyp genau eine)
     SETUP     setup-observation-history (setup-engine, Kaskade 1.0.0)
     SIGNAL    technical-signals-v1/signals-*.json.gz (ENTERED / EXITED)
     STRATEGY  strategy-index-v1 historicalEvidence.transitions
     FACTOR    factor-evidence-history (Stufenwechsel der Faktorwerte)
     MARKET    market factors: newHigh52w am Stichtag
     PATTERN   pattern-match-v1 (braucht zwei Staende - Historie beginnt)

   WAS ER NICHT IST
   - Keine Gesamtnote. Die Reihenfolge der Karten ist eine offen gelegte,
     versionierte Sortierregel aus benannten Schluesseln (PRIORITY_RULE).
   - Keine Prognose und keine Empfehlung. Ein Ereignis sagt, was sich
     zwischen zwei Staenden geaendert hat, nicht, was daraus folgt.
   - Kein Ersatz fuer geschlossene Engine-Zustaende: INVALIDATED, EXIT und
     RISK_RISING der Setup-Engine sind pfadabhaengig und noch nicht
     freigeschaltet. Der Radar ruft sie nicht aus eigener Rechnung aus.

   ALERT-VERTRAG
   Jedes Ereignis hat die Form EVENT_FIELDS und ist damit spaeter an
   Push / E-Mail / App-Benachrichtigung anschliessbar. Zustellung gibt es
   hier keine (delivery: NOT_CONFIGURED).
   ========================================================================= */
(function (global) {
  "use strict";

  var VERSION = "quant-radar-1.2.0";
  var ALERT_EVENT_SCHEMA = "quant-alert-event-3.0.0";

  /* Die Ereignistypen. `tone` ordnet ein (up = verbessert, down =
     verschlechtert, info = neutral), `rank` ist der erste Sortierschluessel
     der Karten. Ein Typ ohne Quelle steht trotzdem hier - mit dem Grund, aus
     dem er heute nicht ausgegeben wird (siehe CLOSED_TYPES im Build). */
  var EVENT_TYPES = [
    { id: "SETUP_CONFIRMED", source: "SETUP", tone: "up", rank: 1, label: "Setup bestätigt", plain: "Alle Bedingungen der Stufe „bestätigt“ sind am Stichtag erfüllt." },
    { id: "SETUP_NEW", source: "SETUP", tone: "up", rank: 2, label: "Neues Setup", plain: "Ein vollständiges Setup ist entstanden; der Auslöser fehlt noch." },
    { id: "STRATEGY_MATCH_NEW", source: "STRATEGY", tone: "up", rank: 3, label: "Neu in einer Strategie", plain: "Die Aktie erfüllt jetzt alle Bedingungen eines Anlagestils." },
    { id: "NEW_52W_HIGH", source: "MARKET", tone: "up", rank: 4, label: "Neues 52-Wochen-Hoch", plain: "Das Tageshoch liegt auf oder über dem höchsten Kurs der letzten 52 Wochen." },
    { id: "MOMENTUM_IMPROVED", source: "SIGNAL", tone: "up", rank: 5, label: "Momentum verbessert", plain: "Die Kursentwicklung über 6 Monate ist wieder positiv." },
    { id: "TREND_UP", source: "SIGNAL", tone: "up", rank: 6, label: "Über der langfristigen Linie", plain: "Der Kurs liegt wieder über seinem langfristigen Durchschnitt." },
    { id: "PATTERN_MATCH_NEW", source: "PATTERN", tone: "info", rank: 7, label: "Neues historisches Muster", plain: "Für die Aktie gilt ein marktweit geprüftes Muster, das vorher nicht galt." },
    { id: "FACTOR_CHANGED", source: "FACTOR", tone: "info", rank: 8, label: "Eigenschaft verändert", plain: "Ein Faktorwert ist in eine andere Stufe gewechselt." },
    { id: "RISK_RISING", source: "FACTOR", tone: "down", rank: 9, label: "Risiko steigt", plain: "Der Risiko-Faktor ist in eine schwächere Stufe gefallen: die Aktie schwankt im Vergleich stärker." },
    { id: "SETUP_WEAKENED", source: "SETUP", tone: "down", rank: 10, label: "Setup nicht mehr erfüllt", plain: "Eine Bedingung der bisherigen Setup-Stufe gilt nicht mehr." },
    { id: "SETUP_INVALIDATED", source: "SETUP", tone: "down", rank: 11, label: "Setup ungültig", plain: "Der Kurs schloss unter der Invalidierungsmarke eines laufenden Setups." },
    { id: "STRATEGY_MATCH_LOST", source: "STRATEGY", tone: "down", rank: 12, label: "Strategie verlassen", plain: "Die Aktie erfüllt eine Bedingung des Anlagestils nicht mehr." },
    { id: "MOMENTUM_DETERIORATED", source: "SIGNAL", tone: "down", rank: 13, label: "Momentum verschlechtert", plain: "Die Kursentwicklung über 6 Monate ist negativ geworden." },
    { id: "TREND_DOWN", source: "SIGNAL", tone: "down", rank: 14, label: "Unter die langfristige Linie", plain: "Der Kurs ist unter seinen langfristigen Durchschnitt gefallen." },
    { id: "EVIDENCE_CHANGED", source: "EVIDENCE", tone: "info", rank: 15, label: "Historische Evidenz verändert", plain: "Die Zahl abgeschlossener Vergleichsfälle derselben Aktie hat eine Evidenzstufe überschritten oder verlassen." }
  ];
  var TYPE = {};
  EVENT_TYPES.forEach(function (t) { TYPE[t.id] = t; });

  /* Pflichtfelder eines Alert-Ereignisses. 1.0.0: Owner-Auftrag 01.10.2026
     (Daily Usefulness); 2.0.0: Backtest & Signal Intelligence - Emittent,
     Erkennungszeit, Ausloeser, Invalidierung, Backtest-Beleg, Vertrauen und
     ein stabiler Schluessel gegen doppelte Zustellung. */
  /* 3.0.0: Wirksamkeit, Base Rate, Gueltigkeit und ob der Zustand wirklich
     neu ist (Ledger: derselbe dedupeKey alarmiert nur einmal). */
  var EVENT_FIELDS = ["id", "securityId", "ticker", "issuerId", "eventType", "occurredAt", "effectiveAt", "detectedAt", "validUntil", "previousState", "currentState",
    "trigger", "invalidation", "explanation", "evidence", "baseRate", "backtestEvidence", "trustState", "nextCondition", "dedupeKey", "isNew"];
  var TRUST_STATES = ["NOT_READY", "LIMITED", "USABLE", "ROBUST"];

  /* Woher die historische Evidenz je Ereignistyp kommt. Ein Typ ohne
     Studie steht mit seinem Grund hier, nicht stillschweigend leer. */
  var BACKTEST_SOURCE = {
    /* Nur veroeffentlichte Setup-Staende; die Rekonstruktion ist keine Ergebnisquelle. */
    SETUP_CONFIRMED: { study: "setup-outcomes-v1", ruleId: "SETUP_CONFIRMED" },
    SETUP_NEW: { study: "setup-outcomes-v1", ruleId: "SETUP_NEW" },
    SETUP_WEAKENED: { study: "setup-outcomes-v1", ruleId: "SETUP_WEAKENED" },
    MOMENTUM_IMPROVED: { study: "signal-backtest-v1", ruleId: "MOMENTUM_IMPROVED" },
    MOMENTUM_DETERIORATED: { study: "signal-backtest-v1", ruleId: "MOMENTUM_DETERIORATED" },
    TREND_UP: { study: "signal-backtest-v1", ruleId: "TREND_UP" },
    TREND_DOWN: { study: "signal-backtest-v1", ruleId: "TREND_DOWN" },
    NEW_52W_HIGH: { study: "signal-backtest-v1", ruleId: "NEW_52W_HIGH" },
    SETUP_INVALIDATED: { reason: "PATH_STATES_CLOSED" },
    STRATEGY_MATCH_NEW: { reason: "MEMBERSHIP_AND_FACTOR_HISTORY_TOO_SHORT" },
    STRATEGY_MATCH_LOST: { reason: "MEMBERSHIP_AND_FACTOR_HISTORY_TOO_SHORT" },
    FACTOR_CHANGED: { reason: "FACTOR_HISTORY_TOO_SHORT" },
    RISK_RISING: { reason: "FACTOR_HISTORY_TOO_SHORT" },
    PATTERN_MATCH_NEW: { reason: "PATTERN_MATCH_HISTORY_TOO_SHORT" },
    EVIDENCE_CHANGED: { reason: "NOT_A_TRADABLE_EVENT" }
  };

  /* Ein Ereignis wird genau einmal zugestellt: gleiche Aktie, gleicher Typ,
     gleicher Schluessel, gleicher Stichtag -> gleicher dedupeKey. */
  function dedupeKey(event) {
    return [event.securityId || event.ticker, event.eventType, event.subject || "-", event.occurredAt].join("|");
  }

  /* Die Lebenszyklus-Stufen der Setup-Engine in ihrer Reihenfolge. Die
     ersten vier sind am Stichtag entscheidbar, die letzten vier brauchen
     eine geordnete Historie und sind noch geschlossen. */
  var LIFECYCLE = [
    { id: "NO_SETUP", label: "Kein Setup", tier: "POINT_IN_TIME" },
    { id: "WATCH", label: "Beobachten", tier: "POINT_IN_TIME" },
    { id: "SETUP_FORMING", label: "Setup entsteht", tier: "POINT_IN_TIME" },
    { id: "CONFIRMED", label: "Setup bestätigt", tier: "POINT_IN_TIME" },
    { id: "ACTIVE", label: "Trend läuft", tier: "PATH_DEPENDENT" },
    { id: "RISK_RISING", label: "Risiko steigt", tier: "PATH_DEPENDENT" },
    { id: "INVALIDATED", label: "Ungültig", tier: "PATH_DEPENDENT" },
    { id: "EXIT", label: "Ausstieg erreicht", tier: "PATH_DEPENDENT" }
  ];
  var MATURITY = { NO_SETUP: 0, WATCH: 1, SETUP_FORMING: 2, CONFIRMED: 3 };

  /* DIE SORTIERREGEL - offen gelegt, versioniert, ohne Gewichte.
     Karten werden lexikografisch nach diesen Schluesseln geordnet; der
     erste Unterschied entscheidet. Es entsteht keine Zahl, die man fuer
     eine Note halten koennte. */
  var PRIORITY_RULE = {
    version: "radar-priority-1.0.0",
    keys: [
      { id: "eventRank", direction: "asc", plain: "Art des wichtigsten Ereignisses (bestätigtes Setup vor neuem Setup vor neuer Strategie …)" },
      { id: "positiveSources", direction: "desc", plain: "Wie viele unabhängige Quellen am selben Tag eine Verbesserung melden" },
      { id: "setupMaturity", direction: "desc", plain: "Reife des Setups (bestätigt vor entstehend vor beobachten)" },
      { id: "evidence", direction: "desc", plain: "Historische Evidenz vorhanden (mindestens 10 abgeschlossene Vergleichsfälle)" },
      { id: "factorCoverage", direction: "desc", plain: "Wie viele der sieben Eigenschaften bewertet sind (Datenvollständigkeit)" },
      { id: "ticker", direction: "asc", plain: "Kürzel - nur damit die Reihenfolge eindeutig ist" }
    ]
  };

  function cardKeys(card) {
    var best = 99, sources = {};
    (card.events || []).forEach(function (e) {
      var t = TYPE[e.eventType];
      if (!t) return;
      var rank = e.eventType === "FACTOR_CHANGED" && e.direction === "down" ? 13.5 : t.rank;
      if (rank < best) best = rank;
      var up = t.tone === "up" || (e.eventType === "FACTOR_CHANGED" && e.direction === "up");
      if (up) sources[t.source] = true;
    });
    return {
      eventRank: best,
      positiveSources: Object.keys(sources).length,
      setupMaturity: card.setup && MATURITY[card.setup.state] !== undefined ? MATURITY[card.setup.state] : -1,
      evidence: card.replay && card.replay.sufficient ? 1 : 0,
      factorCoverage: typeof card.factorCoverage === "number" ? card.factorCoverage : 0,
      ticker: card.ticker
    };
  }
  function compareCards(a, b) {
    var ka = cardKeys(a), kb = cardKeys(b);
    for (var i = 0; i < PRIORITY_RULE.keys.length; i++) {
      var key = PRIORITY_RULE.keys[i], x = ka[key.id], y = kb[key.id];
      if (x === y) continue;
      var lower = x < y ? -1 : 1;
      return key.direction === "asc" ? lower : -lower;
    }
    return 0;
  }

  /* Prueft ein Ereignis gegen den Alert-Vertrag. Gibt die Liste der
     Verstoesse zurueck (leer = gueltig). */
  function eventViolations(event) {
    var errors = [];
    if (!event || typeof event !== "object") return ["EVENT_NOT_AN_OBJECT"];
    EVENT_FIELDS.forEach(function (f) { if (!Object.prototype.hasOwnProperty.call(event, f)) errors.push("MISSING_" + f); });
    if (event.eventType && !TYPE[event.eventType]) errors.push("UNKNOWN_EVENT_TYPE");
    if (event.occurredAt && !/^\d{4}-\d{2}-\d{2}$/.test(event.occurredAt)) errors.push("INVALID_OCCURRED_AT");
    if (!Array.isArray(event.evidence) || !event.evidence.length) errors.push("EVIDENCE_REQUIRED");
    if (typeof event.explanation !== "string" || !event.explanation) errors.push("EXPLANATION_REQUIRED");
    if (typeof event.detectedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(event.detectedAt) || event.detectedAt.slice(0, 10) < event.occurredAt) errors.push("INVALID_DETECTED_AT");
    if (!event.trigger || event.trigger.state !== "DEFINED" || !event.trigger.text) errors.push("TRIGGER_REQUIRED");
    if (!event.invalidation || (event.invalidation.state === "DEFINED" ? !event.invalidation.text : event.invalidation.state !== "NOT_DEFINED" || !event.invalidation.reason)) errors.push("INVALIDATION_REQUIRED");
    var be = event.backtestEvidence;
    if (!be || (be.state !== "AVAILABLE" && be.state !== "WITHHELD")) errors.push("BACKTEST_EVIDENCE_REQUIRED");
    else if (be.state === "AVAILABLE" && (!be.study || !be.returnType || !(be.n > 0) || !be.horizon || TRUST_STATES.indexOf(be.trust) < 1)) errors.push("BACKTEST_EVIDENCE_INCOMPLETE");
    else if (be.state === "WITHHELD" && !be.reason) errors.push("BACKTEST_WITHHELD_WITHOUT_REASON");
    if (TRUST_STATES.indexOf(event.trustState) < 0 || (be && event.trustState !== (be.trust || "NOT_READY"))) errors.push("TRUST_STATE_MISMATCH");
    if (event.dedupeKey !== dedupeKey(event)) errors.push("DEDUPE_KEY_MISMATCH");
    var isDate = function (d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); };
    if (!isDate(event.effectiveAt) || event.effectiveAt !== event.occurredAt) errors.push("INVALID_EFFECTIVE_AT");
    if (!isDate(event.validUntil) || event.validUntil < event.effectiveAt) errors.push("INVALID_VALID_UNTIL");
    if (typeof event.isNew !== "boolean") errors.push("IS_NEW_REQUIRED");
    /* Eine Trefferquote erscheint nie ohne ihre Base Rate. */
    if (be && be.state === "AVAILABLE") {
      var br = event.baseRate;
      if (!br || typeof br.positiveShare !== "number" || typeof br.base !== "number" || typeof br.delta !== "number") errors.push("BASE_RATE_REQUIRED");
      else if (Math.abs(br.positiveShare - br.base - br.delta) > 0.002) errors.push("BASE_RATE_INCONSISTENT");
    } else if (event.baseRate !== null) errors.push("BASE_RATE_WITHOUT_EVIDENCE");
    /* Was hier nie stehen darf - dieselbe Liste wie bei Setup und Studie. */
    ["probability", "successRate", "expectedReturn", "targetPrice", "winRate", "hitRate", "recommendation", "forecast"].forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(event, k)) errors.push("FORBIDDEN_KEY_" + k);
    });
    return errors;
  }

  var api = {
    VERSION: VERSION, ALERT_EVENT_SCHEMA: ALERT_EVENT_SCHEMA,
    EVENT_TYPES: EVENT_TYPES, TYPE: TYPE, EVENT_FIELDS: EVENT_FIELDS,
    LIFECYCLE: LIFECYCLE, MATURITY: MATURITY, PRIORITY_RULE: PRIORITY_RULE,
    TRUST_STATES: TRUST_STATES, BACKTEST_SOURCE: BACKTEST_SOURCE, dedupeKey: dedupeKey,
    cardKeys: cardKeys, compareCards: compareCards, eventViolations: eventViolations
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUQuantRadar = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
