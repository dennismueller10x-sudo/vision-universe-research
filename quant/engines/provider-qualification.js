/* =========================================================================
   VISION UNIVERSE — provider-qualification.js   (Phase 3, §11)

   Ein Pruefstand, der jeden Datenanbieter denselben Fragen aussetzt.

   Der Unterschied zum Pruefstand aus Phase 2 (evaluate-provider.mjs) ist die
   Fragestellung. Dort ging es darum, was ein Anbieter liefert. Hier geht es
   darum, ob sich aus seinen Daten rekonstruieren laesst, was Vision Universe
   an einem historischen Tag tatsaechlich haette wissen koennen. Das ist eine
   engere und unangenehmere Frage, und die meisten Anbieter bestehen sie nicht.

   Zwei Eigenschaften, auf die es ankommt:

   1. Der Pruefstand unterscheidet, WOHER eine Einstufung stammt. Eine
      Faehigkeit, die zur Laufzeit geprueft wurde, zaehlt anders als eine, die
      in einem Vergleichsartikel behauptet wird. Ohne diese Unterscheidung
      entstehen Tabellen, die aussehen wie Messwerte und Zusammenfassungen
      von Marketingtexten sind.

   2. UNKNOWN ist ein zulaessiges Endergebnis. Der Pruefstand erzwingt keine
      Entscheidung, wo die Grundlage fehlt. Eine erfundene Einstufung ist
      schlechter als eine fehlende - sie sieht aus wie Wissen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var LEVELS = ["CONTRADICTED", "UNKNOWN", "REQUIRES_PAID_VALIDATION",
                "RUNTIME_VERIFICATION_REQUIRED", "THIRD_PARTY_REPORTED",
                "DOCUMENTATION_VERIFIED", "RUNTIME_VERIFIED"];

  var LEVEL_RANK = {
    CONTRADICTED: -1, UNKNOWN: 0,
    REQUIRES_PAID_VALIDATION: 1, RUNTIME_VERIFICATION_REQUIRED: 1,
    THIRD_PARTY_REPORTED: 2, DOCUMENTATION_VERIFIED: 3, RUNTIME_VERIFIED: 4
  };

  /* Ein Gate gilt nur ab dieser Stufe als bestanden. Eine Sekundaerquelle
     reicht nicht: sie gibt weiter, was der Anbieter ueber sich sagt, und
     altert schlecht. */
  var GATE_MINIMUM_RANK = LEVEL_RANK.DOCUMENTATION_VERIFIED;

  var STATUS = ["QUALIFIED", "PARTIALLY_QUALIFIED", "NOT_QUALIFIED", "UNKNOWN"];

  var spec = null;
  function configure(json) { spec = json || null; return api; }
  function isConfigured() { return !!spec; }

  function rank(level) {
    var r = LEVEL_RANK[level];
    return r === undefined ? 0 : r;
  }

  /**
   * Ein einzelner Befund.
   *
   * `level` sagt, wie gut der Beleg ist; `value` sagt, was er besagt.
   * Beides getrennt zu fuehren ist der Kern: "nicht vorhanden, gut belegt"
   * und "vorhanden, schlecht belegt" sind verschiedene Zustaende, und ein
   * einzelnes Feld kann sie nicht auseinanderhalten.
   */
  function finding(requirement, value, level, options) {
    options = options || {};
    if (LEVELS.indexOf(level) === -1) {
      throw new Error("Unbekannte Verifikationsstufe: " + level);
    }
    if (value !== true && value !== false && value !== null) {
      throw new Error("finding.value muss true, false oder null sein");
    }
    /* Eine Behauptung ohne Quelle ist keine Einstufung. Bei allem oberhalb
       von UNKNOWN muss gesagt werden, worauf sie sich stuetzt. */
    if (rank(level) > 0 && !options.source) {
      throw new Error("Beleg fuer '" + requirement + "' ohne Quellenangabe (level " + level + ")");
    }
    return {
      requirement: requirement,
      value: value,
      level: level,
      levelRank: rank(level),
      source: options.source || null,
      checkedAt: options.checkedAt || null,
      note: options.note || null,
      quote: options.quote || null
    };
  }

  function requirementSpec(name) {
    return (spec && spec.requirements && spec.requirements[name]) || null;
  }

  /**
   * Wertet ein Gate aus.
   *
   * Drei Ergebnisse, nicht zwei: bestanden, nicht bestanden, und "die
   * Grundlage fehlt". Das dritte ist der haeufigste Fall und darf nicht als
   * das zweite ausgegeben werden.
   */
  function evaluateGate(gateId, findings) {
    var gate = spec && spec.gates && spec.gates[gateId];
    if (!gate) return { gate: gateId, result: "UNKNOWN", reason: "Unbekanntes Gate." };

    var relevant = Object.keys(spec.requirements || {})
      .filter(function (r) { return spec.requirements[r].gate === gateId; })
      .map(function (r) { return findings[r]; })
      .filter(Boolean);

    if (!relevant.length) {
      return { gate: gateId, label: gate.label, result: "UNKNOWN",
               reason: "Zu keiner Anforderung dieses Gates liegt ein Befund vor.",
               requirements: [] };
    }

    var contradicted = relevant.filter(function (f) { return f.value === false; });
    var missing = relevant.filter(function (f) { return f.value === null || f.level === "UNKNOWN"; });
    var weak = relevant.filter(function (f) {
      return f.value === true && f.levelRank < GATE_MINIMUM_RANK;
    });
    var solid = relevant.filter(function (f) {
      return f.value === true && f.levelRank >= GATE_MINIMUM_RANK;
    });

    var detail = {
      gate: gateId, label: gate.label, question: gate.question,
      requirements: relevant.map(function (f) {
        return { requirement: f.requirement, value: f.value, level: f.level, source: f.source };
      }),
      evidenceLevel: relevant.reduce(function (lowest, f) {
        return rank(f.level) < rank(lowest) ? f.level : lowest;
      }, "RUNTIME_VERIFIED")
    };

    if (contradicted.length) {
      detail.result = "FAILED";
      detail.reason = "Widerlegt: " + contradicted.map(function (f) { return f.requirement; }).join(", ") + ".";
      return detail;
    }
    if (missing.length) {
      detail.result = "UNKNOWN";
      detail.reason = "Ohne Befund: " + missing.map(function (f) { return f.requirement; }).join(", ") +
                      ". Nichts zu wissen ist etwas anderes, als etwas zu widerlegen.";
      return detail;
    }
    if (weak.length) {
      detail.result = "UNKNOWN";
      detail.reason = "Nur schwach belegt: " + weak.map(function (f) {
        return f.requirement + " (" + f.level + ")";
      }).join(", ") + ". Ein Gate verlangt mindestens Primaerdokumentation.";
      return detail;
    }
    detail.result = "PASSED";
    detail.reason = solid.length + " Anforderung(en) belegt.";
    return detail;
  }

  /** Eignung fuer eine einzelne Rolle. */
  function evaluateRole(roleId, findings, gates) {
    var role = spec && spec.roles && spec.roles[roleId];
    if (!role) return { role: roleId, status: "UNKNOWN", reason: "Unbekannte Rolle." };

    var out = { role: roleId, label: role.label, purpose: role.purpose,
                missing: [], contradicted: [], unknown: [], weak: [], gates: [] };

    (role.requires || []).forEach(function (req) {
      var f = findings[req];
      if (!f || f.value === null || f.level === "UNKNOWN") { out.unknown.push(req); return; }
      if (f.value === false) { out.contradicted.push(req); return; }
      /* Dieselbe Belegschwelle wie bei den Gates. Ohne sie qualifiziert eine
         Erwaehnung in einem Vergleichsartikel einen Anbieter fuer eine Rolle -
         und die Tabelle sieht dann aus wie ein Pruefergebnis, waehrend sie
         eine Sammlung von Marketingaussagen zusammenfasst. */
      if (f.levelRank < GATE_MINIMUM_RANK) {
        out.weak.push(req + " (" + f.level + ")");
      }
    });

    (role.gates || []).forEach(function (gateId) {
      var g = gates[gateId];
      out.gates.push({ gate: gateId, result: g ? g.result : "UNKNOWN" });
      if (g && g.result === "FAILED") out.contradicted.push(gateId);
      else if (!g || g.result !== "PASSED") out.unknown.push(gateId);
    });

    if (out.contradicted.length) {
      out.status = "NOT_QUALIFIED";
      out.reason = "Nicht erfuellt: " + out.contradicted.join(", ") + ".";
    } else if (out.unknown.length) {
      out.status = "UNKNOWN";
      out.reason = "Ohne belastbaren Befund: " + out.unknown.join(", ") + ".";
    } else if (out.weak.length) {
      out.status = "UNKNOWN";
      out.reason = "Nur schwach belegt: " + out.weak.join(", ") +
                   ". Eine Rolle verlangt mindestens Primaerdokumentation.";
    } else {
      out.status = "QUALIFIED";
      out.reason = "Alle Anforderungen dieser Rolle belegt.";
    }
    return out;
  }

  /**
   * Gesamtergebnis.
   *
   * PARTIALLY_QUALIFIED ist kein Mittelwert und keine Note zwischen gut und
   * schlecht. Es heisst: fuer eine Rolle geeignet, fuer eine andere nicht -
   * und genau so soll ein Anbieter eingesetzt werden.
   */
  function overallStatus(roles) {
    var values = Object.keys(roles).map(function (r) { return roles[r].status; });
    var qualified = values.filter(function (v) { return v === "QUALIFIED"; }).length;
    var notQualified = values.filter(function (v) { return v === "NOT_QUALIFIED"; }).length;
    var unknown = values.filter(function (v) { return v === "UNKNOWN"; }).length;

    if (qualified === values.length) return "QUALIFIED";
    if (qualified > 0) return "PARTIALLY_QUALIFIED";
    if (notQualified > 0 && unknown === 0) return "NOT_QUALIFIED";
    return "UNKNOWN";
  }

  /**
   * Der Hauptaufruf.
   *
   * @param {object} profile  {providerId, plan, findings, capabilities, licensing, cost}
   * @param {object} options  {runtime: {...}}  Ergebnisse echter Abfragen, falls vorhanden.
   */
  function runProviderQualification(profile, options) {
    if (!spec) throw new Error("provider-qualification: configure() mit backtest-evidence-v1.json aufrufen.");
    options = options || {};
    profile = profile || {};

    var findings = {};
    var warnings = [];

    Object.keys(profile.findings || {}).forEach(function (key) {
      var f = profile.findings[key];
      findings[key] = f.requirement ? f : finding(key, f.value, f.level, f);
      if (!requirementSpec(key)) {
        warnings.push("Befund '" + key + "' ist in der Anforderungsliste nicht vorgesehen.");
      }
    });

    /* Laufzeitergebnisse ueberschreiben Dokumentationsangaben - aber nur nach
       oben oder bei Widerspruch. Eine echte Antwort schlaegt jede Behauptung. */
    Object.keys(options.runtime || {}).forEach(function (key) {
      var r = options.runtime[key];
      var previous = findings[key];
      findings[key] = finding(key, r.value, "RUNTIME_VERIFIED",
        { source: r.source || "Laufzeitpruefung", checkedAt: r.checkedAt, note: r.note });
      if (previous && previous.value !== null && previous.value !== r.value) {
        warnings.push("Laufzeitpruefung widerspricht der Dokumentation bei '" + key +
                      "': dokumentiert " + previous.value + ", gemessen " + r.value + ".");
      }
    });

    /* Blockierende Anforderungen ohne jeden Befund benennen. */
    Object.keys(spec.requirements).forEach(function (req) {
      if (!spec.requirements[req].blocking) return;
      if (!findings[req]) {
        findings[req] = finding(req, null, "UNKNOWN", {});
        warnings.push("Blockierende Anforderung '" + req + "' ohne Befund.");
      }
    });

    var gates = {};
    Object.keys(spec.gates).forEach(function (gateId) {
      gates[gateId] = evaluateGate(gateId, findings);
    });

    var roles = {};
    Object.keys(spec.roles).forEach(function (roleId) {
      roles[roleId] = evaluateRole(roleId, findings, gates);
    });

    var evidence = summarizeEvidence(findings);
    if (evidence.byLevel.RUNTIME_VERIFIED === 0) {
      warnings.push("Keine einzige Faehigkeit wurde zur Laufzeit geprueft. " +
                    "Alle Aussagen sind Aussagen ueber Aussagen.");
    }
    if (evidence.byLevel.THIRD_PARTY_REPORTED > evidence.byLevel.DOCUMENTATION_VERIFIED) {
      warnings.push("Mehr Befunde aus Sekundaerquellen als aus Primaerdokumentation. " +
                    "Die Einstufung ist entsprechend vorlaeufig.");
    }

    return {
      providerId: profile.providerId || "unbekannt",
      plan: profile.plan || null,
      evaluatedAt: options.now || new Date().toISOString(),
      qualificationStatus: overallStatus(roles),
      bestRole: bestRole(roles),
      roles: roles,
      gates: gates,
      pitCapability: gates.GATE_C_AVAILABILITY ? gates.GATE_C_AVAILABILITY.result : "UNKNOWN",
      restatementCapability: gates.GATE_A_RESTATEMENT ? gates.GATE_A_RESTATEMENT.result : "UNKNOWN",
      delistingCapability: gates.GATE_B_DELISTING ? gates.GATE_B_DELISTING.result : "UNKNOWN",
      corporateActions: findings.corporateActions || finding("corporateActions", null, "UNKNOWN", {}),
      capabilities: profile.capabilities || null,
      dataQuality: profile.dataQuality || null,
      licensingStatus: profile.licensing || { status: "LEGAL_REVIEW_REQUIRED",
        note: "Keine Lizenzpruefung hinterlegt." },
      cost: profile.cost || null,
      findings: findings,
      evidence: evidence,
      warnings: warnings
    };
  }

  function bestRole(roles) {
    var order = ["BACKTEST_EVIDENCE_PROVIDER", "RESEARCH_DATA_PROVIDER", "MARKET_DATA_PROVIDER"];
    for (var i = 0; i < order.length; i++) {
      if (roles[order[i]] && roles[order[i]].status === "QUALIFIED") return order[i];
    }
    return null;
  }

  function summarizeEvidence(findings) {
    var byLevel = {};
    LEVELS.forEach(function (l) { byLevel[l] = 0; });
    var keys = Object.keys(findings);
    keys.forEach(function (k) { byLevel[findings[k].level] = (byLevel[findings[k].level] || 0) + 1; });
    return {
      total: keys.length,
      byLevel: byLevel,
      runtimeVerified: keys.filter(function (k) { return findings[k].level === "RUNTIME_VERIFIED"; }),
      documentationVerified: keys.filter(function (k) { return findings[k].level === "DOCUMENTATION_VERIFIED"; }),
      thirdPartyOnly: keys.filter(function (k) { return findings[k].level === "THIRD_PARTY_REPORTED"; }),
      requiresPaidValidation: keys.filter(function (k) { return findings[k].level === "REQUIRES_PAID_VALIDATION"; }),
      unknown: keys.filter(function (k) { return findings[k].level === "UNKNOWN"; })
    };
  }

  /** Vergleichstabelle ueber mehrere Ergebnisse (§22). */
  function decisionTable(results) {
    return results.map(function (r) {
      return {
        provider: r.providerId,
        bestRole: r.bestRole || "-",
        pit: r.pitCapability,
        delisted: r.delistingCapability,
        restatements: r.restatementCapability,
        corporateActions: r.corporateActions ? r.corporateActions.value : null,
        licenseConfidence: r.licensingStatus ? r.licensingStatus.status : "UNKNOWN",
        qualification: r.qualificationStatus,
        runtimeVerifiedCount: r.evidence.runtimeVerified.length,
        evidenceTotal: r.evidence.total
      };
    });
  }

  var api = {
    LEVELS: LEVELS, LEVEL_RANK: LEVEL_RANK, STATUS: STATUS,
    GATE_MINIMUM_RANK: GATE_MINIMUM_RANK,
    configure: configure, isConfigured: isConfigured,
    finding: finding, rank: rank,
    evaluateGate: evaluateGate, evaluateRole: evaluateRole,
    runProviderQualification: runProviderQualification,
    summarizeEvidence: summarizeEvidence, decisionTable: decisionTable,
    SPEC_FILE: "backtest-evidence-v1.json"
  };

  if (isNode) module.exports = api;
  else global.VUProviderQualification = api;
})(typeof window !== "undefined" ? window : globalThis);
