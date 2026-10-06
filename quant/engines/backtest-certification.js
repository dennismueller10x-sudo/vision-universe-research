/* =========================================================================
   VISION UNIVERSE QUANT — BACKTEST CERTIFICATION (backtest-certification-1.0.0)

   Ein Status je Backtest-Art und je Regel, abgeleitet aus Gates:

     gate = { id, label, category: HARD|HISTORY|STRUCTURAL|QUALITY,
              state: PASS|FAIL, value, required, reason }

   Regel (in dieser Reihenfolge):
     1. ein HARD-Gate faellt               -> WITHHELD
     2. ein HISTORY-Gate faellt            -> COLLECTING_HISTORY
     3. alles bestanden, Vertrauen reicht,
        keine Owner-Freigabe noetig         -> CERTIFIED (CERTIFICATION_READY)
        ... aber Owner-Freigabe noetig      -> WITHHELD  (OWNER_APPROVAL_REQUIRED)
     4. sonst: Ergebnisse veroeffentlicht   -> LIMITED
               nicht veroeffentlicht        -> WITHHELD

   Es gibt keinen Weg zu CERTIFIED ohne bestandene Gates. Ein Artefakt, das
   etwas anderes behauptet, besteht certificationViolations() nicht.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var VERSION = "backtest-certification-1.0.0";
  var STATUSES = ["CERTIFIED", "LIMITED", "COLLECTING_HISTORY", "WITHHELD"];
  var CATEGORIES = ["HARD", "HISTORY", "STRUCTURAL", "QUALITY"];
  var TRUST_RANK = { NOT_READY: 0, LIMITED: 1, USABLE: 2, ROBUST: 3 };

  function gate(id, label, category, pass, value, required, reason) {
    if (CATEGORIES.indexOf(category) < 0) throw new Error("unknown gate category " + category);
    return { id: id, label: label, category: category, state: pass ? "PASS" : "FAIL", value: value, required: required === undefined ? null : required, reason: pass ? null : (reason || id.toUpperCase()) };
  }

  /* input = { gates, trust, published, ownerApproval: {required, given}, minimumTrust } */
  function classify(input) {
    var gates = input.gates || [];
    var failed = function (cat) { return gates.filter(function (g) { return g.category === cat && g.state !== "PASS"; }); };
    var hard = failed("HARD"), history = failed("HISTORY"), structural = failed("STRUCTURAL"), quality = failed("QUALITY");
    var minTrust = TRUST_RANK[input.minimumTrust || "USABLE"];
    var trustOk = TRUST_RANK[input.trust || "NOT_READY"] >= minTrust;
    var owner = input.ownerApproval || { required: false, given: false };
    var allPass = !hard.length && !history.length && !structural.length && !quality.length;
    var readiness = allPass && trustOk ? (owner.required && !owner.given ? "OWNER_APPROVAL_REQUIRED" : "CERTIFICATION_READY") : "NOT_READY";
    var status, reason;
    if (hard.length) { status = "WITHHELD"; reason = hard[0].reason; }
    else if (history.length) { status = "COLLECTING_HISTORY"; reason = history[0].reason; }
    else if (readiness === "CERTIFICATION_READY") { status = "CERTIFIED"; reason = null; }
    else if (readiness === "OWNER_APPROVAL_REQUIRED") { status = "WITHHELD"; reason = "OWNER_APPROVAL_REQUIRED"; }
    else if (input.published) { status = "LIMITED"; reason = (structural[0] || quality[0] || { reason: "TRUST_BELOW_CERTIFICATION" }).reason; }
    else { status = "WITHHELD"; reason = (structural[0] || quality[0] || { reason: "TRUST_BELOW_CERTIFICATION" }).reason; }
    return { status: status, readiness: readiness, reason: reason,
      blockers: hard.concat(history, structural, quality).map(function (g) { return { id: g.id, category: g.category, reason: g.reason, value: g.value, required: g.required }; }) };
  }

  /* Wie lange noch? Aus Bestand, Ziel und gemessener Taktung. */
  function eta(have, need, daysPerUnit, asOf) {
    if (!(need > have)) return null;
    if (!(daysPerUnit > 0) || !asOf) return { remaining: need - have, date: null };
    var d = new Date(Date.parse(asOf) + Math.ceil((need - have) * daysPerUnit) * 86400000);
    return { remaining: need - have, date: d.toISOString().slice(0, 10) };
  }

  /* Pruefung eines Zertifizierungs-Artefakts: jeder Status muss aus seinen
     Gates folgen; CERTIFIED nie mit offenem Gate. */
  function certificationViolations(doc) {
    var errors = [];
    if (!doc || doc.schemaVersion !== VERSION) return ["unexpected schemaVersion"];
    (doc.kinds || []).forEach(function (k) {
      [k].concat(k.rules || []).forEach(function (x) {
        if (STATUSES.indexOf(x.status) < 0) errors.push(x.id + ": unknown status");
        var again = classify({ gates: x.gates, trust: x.trust, published: x.published, ownerApproval: x.ownerApproval, minimumTrust: x.minimumTrust });
        if (again.status !== x.status) errors.push(x.id + ": status " + x.status + " does not follow its gates (" + again.status + ")");
        if (again.readiness !== x.readiness) errors.push(x.id + ": readiness does not follow its gates");
        if (x.status === "CERTIFIED" && (x.gates || []).some(function (g) { return g.state !== "PASS"; })) errors.push(x.id + ": certified with an open gate");
        (x.gates || []).forEach(function (g) { if (CATEGORIES.indexOf(g.category) < 0) errors.push(x.id + "." + g.id + ": unknown category"); });
      });
    });
    return errors;
  }

  var api = { VERSION: VERSION, STATUSES: STATUSES, CATEGORIES: CATEGORIES, TRUST_RANK: TRUST_RANK, gate: gate, classify: classify, eta: eta, certificationViolations: certificationViolations };
  if (isNode) module.exports = api; else global.VUBacktestCertification = api;
})(typeof window !== "undefined" ? window : globalThis);
