/* =========================================================================
   VISION UNIVERSE QUANT — BACKTEST RESEARCH ADAPTER (Vorschlag, NICHT verdrahtet)

   getResearchBacktest(kind, envelope, options) -> Objekt in der Form, die
   quant/app/page-backtest.js heute aus getBacktest("signal") liest
   (study.* und study.rules[].*), plus Block "research" mit Status,
   Grenzen und Kennzahlen des backtest-result-2.0.0-Umschlags.

   Isoliert: product-services.js, quant/app/** und alle Views importieren
   diese Datei nicht (quant/tests/backtest-result-contract.test.mjs prueft das).
   Standard: disabled. Auch eingeschaltet zeigt das View-Modell keine
   Ergebniszahl (display.allowed=false, trust NOT_READY); eine Anzeige waere
   eine eigene Owner-Entscheidung. PRODUCT_CERTIFIED wird nur akzeptiert,
   wenn das mitgelieferte Zertifizierungsartefakt die Art (bzw. Regel)
   CERTIFIED meldet.
   ========================================================================= */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var Contract = isNode ? require('../engines/backtest-result-contract.cjs') : g.VUBacktestResultContract;
  var VERSION = 'backtest-research-view-0.1.0';

  /* Felder, die page-backtest.js heute liest (gelesen, nicht geaendert). */
  var PAGE_BACKTEST_FIELDS = Object.freeze({
    study: ['asOf', 'certification', 'engineVersion', 'frictions', 'returnBasis', 'returnTypeNote', 'source', 'survivorship', 'survivorshipSensitivity', 'trustChecks', 'trustRule', 'rules', 'state'],
    rule: ['checks', 'contractTrade', 'dailyDefinition', 'display', 'distribution', 'edgeOutOfSample', 'firstEvent', 'grain', 'horizons', 'id', 'independence', 'lastEvent', 'oos', 'oppositeExit',
      'parameterStability', 'path', 'plain', 'regimes', 'returnType', 'rolling', 'semantics', 'timeToOutcome', 'titles', 'trust', 'trustReasons', 'version', 'walkForward']
  });
  var STATE_WORD = { RESEARCH_EXECUTED: 'Research-Studie ausgeführt', PREPARED_DATA_LIMITED: 'Engine bereit, Nachweise fehlen', PRODUCT_CERTIFIED: 'zertifiziert' };

  function unavailable(kind, reason, extra) {
    var o = { state: 'UNAVAILABLE', reason: reason, kind: kind || null, disabled: true, schemaVersion: VERSION };
    for (var k in (extra || {})) o[k] = extra[k];
    return o;
  }
  function certifiedEntry(doc, s, kind) {
    var e = Contract.certificationEntry(doc, kind, s.certificationScope, s.certificationRuleId);
    return !!e && e.status === 'CERTIFIED';
  }

  function getResearchBacktest(kind, envelope, options) {
    options = options || {};
    if (!Contract) return unavailable(kind, 'CONTRACT_SOURCE_MISSING');
    var check = Contract.validate(envelope, { certification: options.certification || null });
    if (!check.valid) return unavailable(kind, 'RESULT_CONTRACT_VIOLATED', { errors: check.errors });
    if (envelope.identity.kind !== kind) return unavailable(kind, 'KIND_MISMATCH');
    var s = envelope.status;
    if (s.productionApproved !== false) return unavailable(kind, 'PRODUCTION_APPROVAL_FORBIDDEN');
    if (s.state === 'PRODUCT_CERTIFIED' && !certifiedEntry(options.certification, s, kind)) return unavailable(kind, 'PRODUCT_CERTIFICATION_NOT_PROVEN');
    var status = { state: s.state, stateLabel: STATE_WORD[s.state], certificationStatus: s.certificationStatus, certificationScope: s.certificationScope, certificationRuleId: s.certificationRuleId,
      certificationSource: s.certificationSource, evidenceKind: s.evidenceKind, productionApproved: false };
    var limitations = envelope.limitations.slice();
    if (options.enabled !== true) return { state: 'DISABLED', reason: 'RESEARCH_ADAPTER_DISABLED', disabled: true, schemaVersion: VERSION, kind: kind, status: status, limitations: limitations };

    var m = envelope.metrics, ev = envelope.events, dq = envelope.dataQuality, costs = m.costs || {};
    var n = m.perEvent && typeof m.perEvent.n === 'number' ? m.perEvent.n : m.trades;
    var rule = {
      id: envelope.spec.id, version: envelope.spec.version, plain: envelope.spec.description || envelope.spec.id, dailyDefinition: null,
      grain: envelope.period.grain === 'DAILY' ? 'DAILY' : 'WEEKLY', returnType: dq.totalReturnBasis,
      semantics: { entry: ev.entry, exit: ev.exit, frictionsBps: typeof costs.totalRoundTripBps === 'number' ? costs.totalRoundTripBps : null, cooldownWeeks: null },
      firstEvent: envelope.period.from, lastEvent: envelope.period.to, titles: ev.titles, rolling: [],
      /* Nie freigegeben: die Seite zeigt dann nur Gruende statt Ergebniszahlen. */
      display: { allowed: false, sentence: STATE_WORD[s.state] + ' – keine Produktfreigabe.', caveats: limitations },
      trust: 'NOT_READY',
      trustReasons: [{ id: 'researchState', label: 'Research-Stand', reason: s.state }, { id: 'certification', label: 'Zertifizierung', reason: s.certificationStatus }]
        .concat(limitations.map(function (l) { return { id: 'limitation', label: 'Grenze', reason: l }; })),
      checks: {}, horizons: { m6: { label: '6 Monate', n: n, baseRate: null } },
      independence: null, walkForward: null, oos: null, regimes: null, parameterStability: null, oppositeExit: null, timeToOutcome: null, contractTrade: null,
      path: null, distribution: null, edgeOutOfSample: false
    };
    return {
      state: 'AVAILABLE', schemaVersion: VERSION, disabled: false, kind: kind,
      engineVersion: envelope.identity.source.engineVersion, asOf: envelope.period.asOf,
      source: { titles: ev.titles }, survivorship: { plain: dq.survivorship && dq.survivorship.state ? 'Überlebende: ' + dq.survivorship.state : 'Überlebende nicht kontrolliert.' },
      survivorshipSensitivity: null, certification: s.certificationStatus,
      frictions: { roundTripBps: typeof costs.roundTripBps === 'number' ? costs.roundTripBps : null, slippageBps: typeof costs.slippageBps === 'number' ? costs.slippageBps : null },
      returnBasis: dq.totalReturnBasis, returnTypeNote: 'Renditebasis laut Ergebnisumschlag: ' + dq.totalReturnBasis,
      trustChecks: [], trustRule: { plain: 'Research-Ergebnis nach backtest-result-2.0.0; keine Vertrauensstufe, keine Produktfreigabe.' },
      rules: [rule],
      status: status, limitations: limitations,
      research: { envelopeHash: envelope.envelopeHash, metrics: m, uncertainty: envelope.uncertainty, methods: envelope.methods, dataQuality: dq, period: envelope.period, identity: envelope.identity }
    };
  }

  var api = { VERSION: VERSION, PAGE_BACKTEST_FIELDS: PAGE_BACKTEST_FIELDS, getResearchBacktest: getResearchBacktest };
  if (isNode) module.exports = api; else g.VUBacktestResearchAdapter = api;
})(typeof window !== 'undefined' ? window : globalThis);
