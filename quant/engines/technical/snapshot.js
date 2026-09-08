/* =========================================================================
   VISION UNIVERSE TECHNICAL — snapshot.js
   HISTORICAL ANALYSIS SNAPSHOTS + EVIDENCE FOUNDATION

   Jede Analyse ist historisch reproduzierbar: AnalysisSnapshot traegt
   snapshotId, instrumentId, analysisTime, dataCutoff, engineBundleVersion,
   methodologyVersion, parametersHash, dataVersion, primaryScenarioId,
   alternativeScenarioIds[], signalRefs[], annotationRefs[], evidenceRefs[],
   createdAt, supersedesSnapshotId.

   Snapshots werden nie rueckwirkend ueberschrieben. Korrigiert ein Provider
   Bars, entsteht eine neue dataVersion und ein neuer Snapshot, der den
   alten per supersedesSnapshotId referenziert. Projected-vs-Actual braucht
   genau diese Unveraenderlichkeit.

   Evidence Records (Foundation): scenarioClass, snapshot, entry,
   invalidation, targets, eventualOutcome, timeToTarget, timeToInvalidation.
   Outcome-Auswertung ist walk-forward (nur Bars NACH dem Cutoff) mit
   konservativer Same-Bar-Policy. Keine Erfolgsquoten vor ausreichender
   Stichprobe.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;

  var SNAPSHOT_VERSION = "snapshot-1.0.0";
  var EVIDENCE_VERSION = "evidence-1.0.0";

  function contentHashOf(b) {
    return Hash.hashValue({ i: b.instrumentId, t: b.analysisTime, c: b.dataCutoff, d: b.dataVersion, p: b.parametersHash, s: b.scenarios.scenarios.map(function (s) { return s.scenarioId; }),
                            score: b.opportunityScore.score, e: b.elliott ? (b.elliott.primaryCount ? b.elliott.primaryCount.countId : b.elliott.status) : null });
  }

  /**
   * Erzeugt einen Snapshot aus einem Analyse-Bundle.
   * @param {object} bundle  technical-analysis.js
   * @param {object} [o]     { supersedesSnapshotId, createdAt, includeBundle }
   */
  function createSnapshot(bundle, o) {
    o = o || {};
    var contentHash = contentHashOf(bundle);
    var snapshotId = "snap_" + Hash.hashValue({ i: bundle.instrumentId, t: bundle.analysisTime, d: bundle.dataVersion, p: bundle.parametersHash, m: bundle.methodologyVersion });
    var sc = bundle.scenarios;
    var signalRefs = [];
    ["trend", "momentum", "relativeStrength", "volatility", "volume", "supportResistance", "fibonacci", "elliott"].forEach(function (k) {
      var e = bundle[k]; if (!e) return;
      signalRefs.push({ engine: k, engineVersion: e.engineVersion, parametersHash: e.parametersHash, state: e.direction || e.state || e.regime || e.status || null, value: e.value === undefined ? null : e.value });
    });
    signalRefs.push({ engine: "structure", engineVersion: bundle.structure.engineVersion, parametersHash: bundle.structure.parametersHash, state: bundle.structure.state.regime, value: bundle.structure.state.structureScore });
    var evidenceRefs = [];
    sc.scenarios.forEach(function (s) { (s.supportingEvidence || []).concat(s.conflictingEvidence || []).forEach(function (ev) { if (evidenceRefs.indexOf(ev.evidenceId) === -1) evidenceRefs.push(ev.evidenceId); }); });
    var snap = {
      snapshotVersion: SNAPSHOT_VERSION, snapshotId: snapshotId, contentHash: contentHash,
      instrumentId: bundle.instrumentId, analysisTime: bundle.analysisTime, dataCutoff: bundle.dataCutoff,
      engineBundleVersion: bundle.bundleVersion, methodologyVersion: bundle.methodologyVersion, elliottMethodologyVersion: bundle.elliottMethodologyVersion,
      parametersHash: bundle.parametersHash, dataVersion: bundle.dataVersion, dataHash: bundle.dataHash, universeVersion: o.universeVersion || null,
      primaryScenarioId: sc.primary ? sc.primary.scenarioId : null,
      alternativeScenarioIds: sc.scenarios.filter(function (s) { return s.type !== "PRIMARY"; }).map(function (s) { return s.scenarioId; }),
      signalRefs: signalRefs,
      annotationRefs: bundle.annotations ? bundle.annotations.annotations.map(function (a) { return a.annotationId; }) : [],
      evidenceRefs: evidenceRefs,
      opportunityScore: bundle.opportunityScore.score,
      createdAt: o.createdAt || bundle.analysisTime,
      supersedesSnapshotId: o.supersedesSnapshotId || null,
      /* Frozen: die Szenarien selbst (fuer Projected-vs-Actual), kompakt. */
      frozen: {
        lastClose: bundle.lastBar.close,
        scenarios: sc.scenarios.map(function (s) { return { scenarioId: s.scenarioId, type: s.type, direction: s.direction, template: s.template, status: s.status, entryZone: s.entryZone, invalidation: s.invalidation, targetZones: s.targetZones, confidence: s.confidence }; }),
        tradeSetup: bundle.tradeSetup.status === "INCOMPLETE" ? { status: "INCOMPLETE", missing: bundle.tradeSetup.missing } : { status: bundle.tradeSetup.status, riskReward: bundle.tradeSetup.riskReward, setupQuality: bundle.tradeSetup.setupQuality },
        elliott: bundle.elliott && bundle.elliott.primaryCount ? { status: bundle.elliott.status, degreeScale: bundle.elliott.degreeScale, currentWave: bundle.elliott.primaryCount.currentWave, invalidation: bundle.elliott.primaryCount.invalidation, projectionZones: bundle.elliott.primaryCount.projection.zones, confidence: bundle.elliott.confidence } : (bundle.elliott ? { status: bundle.elliott.status, reason: bundle.elliott.reason } : null)
      }
    };
    if (o.includeBundle) snap.bundle = bundle;
    return snap;
  }

  /** Datenrevision: neuer Snapshot, der den alten referenziert — nie ein Rewrite. */
  function superseding(bundle, previousSnapshot, o) {
    return createSnapshot(bundle, Object.assign({}, o || {}, { supersedesSnapshotId: previousSnapshot ? previousSnapshot.snapshotId : null }));
  }

  // -------------------------------------------------------------- Evidence
  /** Evidence Record aus einem Snapshot und einem seiner Szenarien. Outcome bleibt offen. */
  function createEvidenceRecord(snapshot, scenario) {
    if (!scenario.entryZone || !scenario.invalidation || !scenario.targetZones || !scenario.targetZones.length) return null;
    return {
      evidenceVersion: EVIDENCE_VERSION,
      recordId: "ev_" + Hash.hashValue({ s: snapshot.snapshotId, sc: scenario.scenarioId }),
      snapshotId: snapshot.snapshotId, instrumentId: snapshot.instrumentId, analysisTime: snapshot.analysisTime, dataCutoff: snapshot.dataCutoff,
      scenarioId: scenario.scenarioId, scenarioClass: scenario.direction + ":" + scenario.template, direction: scenario.direction,
      entry: { zoneLow: scenario.entryZone.zoneLow, zoneHigh: scenario.entryZone.zoneHigh }, invalidation: scenario.invalidation.price,
      targets: scenario.targetZones.map(function (t) { return { zoneLow: t.zoneLow, zoneHigh: t.zoneHigh }; }),
      eventualOutcome: null, timeToTarget: null, timeToInvalidation: null, maxFavorableExcursion: null, maxAdverseExcursion: null, evaluatedThrough: null
    };
  }

  /**
   * Walk-Forward-Outcome: nur Bars mit timestamp > dataCutoff. Konservativ:
   * beruehrt eine Daily Bar Stop UND Target, zaehlt der Stop (Reihenfolge
   * innerhalb der Bar ist ohne Intraday-Daten unbekannt).
   */
  function evaluateOutcome(record, series) {
    var sign = record.direction === "BULLISH" ? 1 : -1;
    var start = -1;
    for (var i = 0; i < series.length; i++) if (series.timestamps[i] > record.dataCutoff) { start = i; break; }
    if (start < 0) return Object.assign({}, record, { eventualOutcome: "NO_DATA" });
    var entered = null, entryPrice = null, mfe = 0, mae = 0, out = Object.assign({}, record);
    var targetsHit = [];
    for (var t = start; t < series.length; t++) {
      var hi = series.high[t], lo = series.low[t];
      if (entered === null) {
        if (lo <= record.entry.zoneHigh && hi >= record.entry.zoneLow) { entered = t; entryPrice = Math.min(Math.max(series.open[t], record.entry.zoneLow), record.entry.zoneHigh); out.entryTime = series.timestamps[t]; }
        else if (sign > 0 ? lo <= record.invalidation : hi >= record.invalidation) { out.eventualOutcome = "INVALIDATED_BEFORE_ENTRY"; out.timeToInvalidation = t - start; out.evaluatedThrough = series.timestamps[t]; return out; }
        else if (sign > 0 ? hi >= record.targets[0].zoneLow : lo <= record.targets[0].zoneHigh) { out.eventualOutcome = "TARGET_WITHOUT_ENTRY"; out.evaluatedThrough = series.timestamps[t]; return out; }
        /* AUDIT-FIX: Entry-Bar wird nicht sofort auf Target/Stop ausgewertet
           (Reihenfolge innerhalb der Bar unbekannt) — konservativ ab t+1. */
        continue;
      }
      var fav = sign > 0 ? hi - entryPrice : entryPrice - lo, adv = sign > 0 ? entryPrice - lo : hi - entryPrice;
      if (fav > mfe) mfe = fav; if (adv > mae) mae = adv;
      var stopHit = sign > 0 ? lo <= record.invalidation : hi >= record.invalidation;
      if (stopHit) { out.eventualOutcome = targetsHit.length ? "TARGET" + targetsHit.length + "_THEN_INVALIDATION" : "INVALIDATION"; out.timeToInvalidation = t - entered; out.evaluatedThrough = series.timestamps[t]; break; }
      for (var k = targetsHit.length; k < record.targets.length; k++) {
        var hit = sign > 0 ? hi >= record.targets[k].zoneLow : lo <= record.targets[k].zoneHigh;
        if (!hit) break;
        targetsHit.push({ target: k + 1, bars: t - entered, time: series.timestamps[t] });
        if (k === 0) out.timeToTarget = t - entered;
      }
      if (targetsHit.length === record.targets.length) { out.eventualOutcome = "ALL_TARGETS"; out.evaluatedThrough = series.timestamps[t]; break; }
      out.evaluatedThrough = series.timestamps[t];
    }
    if (!out.eventualOutcome) out.eventualOutcome = entered === null ? "NO_ENTRY_YET" : targetsHit.length ? "TARGET" + targetsHit.length + "_OPEN" : "OPEN";
    out.targetsHit = targetsHit; out.maxFavorableExcursion = mfe; out.maxAdverseExcursion = mae; out.entryPrice = entryPrice;
    return out;
  }

  /** Aggregat nur mit ausreichender Stichprobe — sonst displayable:false. */
  function aggregateEvidence(records, minEffectiveSample) {
    minEffectiveSample = minEffectiveSample || 30;
    var closed = records.filter(function (r) { return r.eventualOutcome && /INVALIDATION|TARGET|ALL_TARGETS/.test(r.eventualOutcome) && !/OPEN|WITHOUT_ENTRY|BEFORE_ENTRY/.test(r.eventualOutcome); });
    /* Effektives N: ueberlappende Snapshots desselben Instruments innerhalb von 20 Bars zaehlen einmal. */
    var seen = {}, effective = 0;
    closed.forEach(function (r) { var key = r.instrumentId + ":" + r.analysisTime.slice(0, 7); if (!seen[key]) { seen[key] = 1; effective++; } });
    var t1 = closed.filter(function (r) { return /TARGET|ALL/.test(r.eventualOutcome); }).length;
    return { evidenceVersion: EVIDENCE_VERSION, sampleSize: closed.length, effectiveSampleSize: effective, minEffectiveSample: minEffectiveSample,
             displayable: effective >= minEffectiveSample,
             target1BeforeInvalidation: effective >= minEffectiveSample ? t1 / closed.length : null,
             note: effective >= minEffectiveSample ? null : "Stichprobe zu klein (" + effective + " < " + minEffectiveSample + ") — keine Erfolgsquote anzeigen." };
  }

  var api = { SNAPSHOT_VERSION: SNAPSHOT_VERSION, EVIDENCE_VERSION: EVIDENCE_VERSION, contentHashOf: contentHashOf, createSnapshot: createSnapshot, superseding: superseding,
              createEvidenceRecord: createEvidenceRecord, evaluateOutcome: evaluateOutcome, aggregateEvidence: aggregateEvidence };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Snapshot = api; }
})(typeof window !== "undefined" ? window : globalThis);
