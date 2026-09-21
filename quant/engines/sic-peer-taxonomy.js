(function (global) {
  "use strict";

  var VERSION = "sic-peer-taxonomy-1.0.0";
  var MINIMUMS = { sic4_industry: 20, sic_division: 40, universe: 200 };
  var DIVISIONS = [
    { id: "A", min: 100, max: 999, name: "Agriculture, Forestry, And Fishing" },
    { id: "B", min: 1000, max: 1499, name: "Mining" },
    { id: "C", min: 1500, max: 1799, name: "Construction" },
    { id: "D", min: 2000, max: 3999, name: "Manufacturing" },
    { id: "E", min: 4000, max: 4999, name: "Transportation, Communications, Electric, Gas, And Sanitary Services" },
    { id: "F", min: 5000, max: 5199, name: "Wholesale Trade" },
    { id: "G", min: 5200, max: 5999, name: "Retail Trade" },
    { id: "H", min: 6000, max: 6799, name: "Finance, Insurance, And Real Estate" },
    { id: "I", min: 7000, max: 8999, name: "Services" },
    { id: "J", min: 9100, max: 9729, name: "Public Administration" }
  ];

  function normalizeSic(raw) {
    var text = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!/^\d{1,4}$/.test(text)) return null;
    var number = Number(text);
    if (!Number.isInteger(number) || number < 100 || number > 9999) return null;
    return String(number).padStart(4, "0");
  }

  function divisionForSic(raw) {
    var sic4 = normalizeSic(raw);
    if (!sic4) return null;
    var number = Number(sic4);
    var division = DIVISIONS.find(function (item) { return number >= item.min && number <= item.max; });
    return division ? { id: division.id, name: division.name, range: String(division.min).padStart(4, "0") + "-" + String(division.max).padStart(4, "0") } : null;
  }

  /* Counts are metric-valid issuer counts, never raw security-row counts. */
  function resolvePeerLevel(counts) {
    counts = counts || {};
    if (Number(counts.sic4_industry) >= MINIMUMS.sic4_industry) {
      return { level: "sic4_industry", confidence: "HIGH", confidencePenaltyRequired: false };
    }
    if (Number(counts.sic_division) >= MINIMUMS.sic_division) {
      return { level: "sic_division", confidence: "MEDIUM", confidencePenaltyRequired: false };
    }
    if (Number(counts.universe) >= MINIMUMS.universe) {
      return { level: "universe", confidence: "LOW", confidencePenaltyRequired: true };
    }
    return { level: null, confidence: "INSUFFICIENT", confidencePenaltyRequired: true };
  }

  function canonicalMatch(security, instrumentByMember, fundamentalsByIssuer) {
    var memberId = security && security.securityId;
    if (!memberId) return { ok: false, reason: "FACTOR_SECURITY_ID_MISSING" };
    var instrument = instrumentByMember && instrumentByMember.get(memberId);
    if (!instrument) return { ok: false, reason: "MASTER_MEMBER_MISSING" };
    if (instrument.masterMemberId !== memberId) return { ok: false, reason: "MASTER_MEMBER_MISMATCH" };
    if (!instrument.issuerId || !instrument.cik) return { ok: false, reason: "ISSUER_ID_MISSING" };
    var cik = String(instrument.cik).padStart(10, "0");
    var expectedIssuerId = "iss_cik_" + cik;
    if (instrument.issuerId !== expectedIssuerId) return { ok: false, reason: "ISSUER_CIK_MISMATCH" };
    var fundamental = fundamentalsByIssuer && fundamentalsByIssuer.get(instrument.issuerId);
    if (!fundamental) return { ok: false, reason: "FUNDAMENTALS_ISSUER_MISSING" };
    if (String(fundamental.issuer.cik).padStart(10, "0") !== cik) return { ok: false, reason: "FUNDAMENTALS_CIK_MISMATCH" };
    var normalizedSic = normalizeSic(fundamental.issuer.sic);
    var division = divisionForSic(fundamental.issuer.sic);
    /* A numeric-looking code outside the official division ranges is not a
       classified SIC. Preserve sicRaw at materialization, but fail closed to
       the same universe-only path as a missing code. */
    var sic4 = division ? normalizedSic : null;
    return { ok: true, instrument: instrument, issuerId: instrument.issuerId, cik: cik,
      issuer: fundamental.issuer, sic4: sic4, division: division, file: fundamental.file,
      classificationMissing: !sic4 || !division };
  }

  function validate(projection) {
    var errors = [];
    if (!projection || projection.version !== VERSION) errors.push("VERSION");
    if (!projection || projection.snapshotMode !== "CURRENT_ONLY") errors.push("CURRENT_ONLY");
    if (!projection || projection.historicalClassificationAvailable !== false || projection.backtestEligible !== false) errors.push("HISTORICAL_FAIL_CLOSED");
    if (!projection || projection.scorePublicationAllowed !== false) errors.push("SCORE_PUBLICATION_LOCK");
    var binding = projection && projection.methodologyBinding;
    if (!binding || binding.industry !== "sic4_industry" || binding.sector !== "sic_division" || binding.universe !== "universe") errors.push("METHODOLOGY_BINDING");
    if (JSON.stringify(projection && projection.minimumValidIssuers) !== JSON.stringify(MINIMUMS)) errors.push("MINIMUMS");
    var join = projection && projection.identityJoin;
    if (!join || join.tickerUsedForJoin !== false || JSON.stringify(join.chain) !== JSON.stringify([
      "factor.securityId", "companyMaster.masterMemberId", "companyMaster.issuerId", "fundamentals.cikDerivedIssuerId"
    ]) || join.fundamentalsIssuerIdDerivation !== "iss_cik_<10-digit-cik>" ||
        join.requiresExactEquality !== true) errors.push("CANONICAL_IDENTITY_JOIN");
    var rows = projection && projection.rows;
    if (!Array.isArray(rows)) errors.push("ROWS");
    var columns = projection && projection.rowColumns;
    var expectedColumns = ["ticker", "securityId", "issuerId", "cik", "sicRaw", "sic4", "sicDivision", "peerLevel", "peerConfidence", "confidencePenaltyRequired", "sourceShard", "marketAsOf"];
    if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) errors.push("ROW_COLUMNS");
    var decodedRows = (rows || []).map(function (packed) { return decodeRow(projection, packed); });
    var seen = Object.create(null);
    decodedRows.forEach(function (row) {
      var key = row && row.securityId;
      if (!key || seen[key]) errors.push("ROW_IDENTITY");
      seen[key] = true;
      var expected = divisionForSic(row.sicRaw);
      if (row.sic4 === null) {
        if (expected !== null || row.sicDivision !== null) errors.push("MISSING_CLASSIFICATION:" + (key || "?"));
        if (row.peerLevel !== "universe" || row.peerConfidence !== "LOW" || row.confidencePenaltyRequired !== true) errors.push("UNKNOWN_CLASSIFICATION_FALLBACK:" + (key || "?"));
      } else {
        if (normalizeSic(row.sicRaw) !== row.sic4) errors.push("SIC:" + (key || "?"));
        if (!expected || expected.id !== row.sicDivision) errors.push("DIVISION:" + (key || "?"));
      }
      if (!row.sourceShard || !row.marketAsOf) errors.push("PROVENANCE:" + (key || "?"));
    });
    if (!projection || !projection.source || !projection.source.fundamentalsObservedAt ||
        !projection.source.factorsGeneratedAt) errors.push("SOURCE_OBSERVATION_TIME");
    if (!projection || !projection.classificationTime || !projection.classificationTime.observedAt ||
        projection.classificationTime.effectiveAt !== null) errors.push("CLASSIFICATION_TIME");
    if (projection && projection.classificationTime && projection.source &&
        projection.classificationTime.observedAt !== projection.source.fundamentalsObservedAt) errors.push("CLASSIFICATION_OBSERVATION_MISMATCH");
    var counts = projection && projection.counts;
    var rejections = projection && projection.rejections;
    var conflicts = projection && projection.identityConflicts;
    var missingClassificationRows = decodedRows.filter(function (row) { return row && row.sic4 === null; }).length;
    var distinctIssuers = new Set(decodedRows.map(function (row) { return row && row.issuerId; }).filter(Boolean)).size;
    if (!counts || !Array.isArray(rejections) || counts.projectedSecurities !== (rows || []).length ||
        counts.identityRejected !== (rejections || []).length || counts.classificationMissing !== missingClassificationRows ||
        counts.classifiedSecurities !== (rows || []).length - missingClassificationRows ||
        counts.distinctIssuers !== distinctIssuers ||
        counts.factorSecurities !== counts.projectedSecurities + counts.identityRejected) errors.push("COUNT_RECONCILIATION");
    if (missingClassificationRows > 0 && (!counts || counts.distinctIssuers < MINIMUMS.universe)) errors.push("UNKNOWN_CLASSIFICATION_UNIVERSE_MINIMUM");
    var industrySets = new Map(), divisionSets = new Map();
    decodedRows.forEach(function (row) {
      if (!row || !row.issuerId) return;
      if (row.sic4) { var industries = industrySets.get(row.sic4) || new Set(); industries.add(row.issuerId); industrySets.set(row.sic4, industries); }
      if (row.sicDivision) { var divisions = divisionSets.get(row.sicDivision) || new Set(); divisions.add(row.issuerId); divisionSets.set(row.sicDivision, divisions); }
    });
    var expectedIndustries = Object.fromEntries([...industrySets].sort(function (a, b) { return a[0].localeCompare(b[0]); }).map(function (entry) { return [entry[0], entry[1].size]; }));
    if (JSON.stringify(projection && projection.industryIssuerCounts) !== JSON.stringify(expectedIndustries)) errors.push("INDUSTRY_ISSUER_COUNTS");
    var divisionKeys = projection && projection.divisions ? Object.keys(projection.divisions).sort() : [];
    if (JSON.stringify(divisionKeys) !== JSON.stringify(DIVISIONS.map(function (division) { return division.id; }).sort())) errors.push("DIVISION_ISSUER_COUNTS");
    DIVISIONS.forEach(function (division) {
      var actual = projection && projection.divisions && projection.divisions[division.id];
      var expectedRange = String(division.min).padStart(4, "0") + "-" + String(division.max).padStart(4, "0");
      if (!actual || actual.name !== division.name || actual.range !== expectedRange || actual.memberIssuers !== (divisionSets.get(division.id) || new Set()).size) errors.push("DIVISION_ISSUER_COUNTS:" + division.id);
    });
    decodedRows.forEach(function (row) {
      if (!row) return;
      var expectedPeer = resolvePeerLevel({ sic4_industry: row.sic4 ? (industrySets.get(row.sic4) || new Set()).size : null,
        sic_division: row.sicDivision ? (divisionSets.get(row.sicDivision) || new Set()).size : null, universe: distinctIssuers });
      if (row.peerLevel !== expectedPeer.level || row.peerConfidence !== expectedPeer.confidence || row.confidencePenaltyRequired !== expectedPeer.confidencePenaltyRequired) errors.push("PEER_RESOLUTION:" + (row.securityId || "?"));
    });
    if (!conflicts || counts && (counts.duplicateMasterMembers !== (conflicts.duplicateMasterMembers || []).length ||
        counts.duplicateFundamentalsIssuers !== (conflicts.duplicateFundamentalsIssuers || []).length)) errors.push("IDENTITY_CONFLICT_RECONCILIATION");
    if (projection && projection.source) {
      var expectedGeneratedAt = [projection.source.fundamentalsObservedAt, projection.source.factorsGeneratedAt].sort().pop();
      if (projection.generatedAt !== expectedGeneratedAt) errors.push("GENERATED_AT_DERIVATION");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function decodeRow(projection, packed) {
    if (!projection || !Array.isArray(projection.rowColumns) || !Array.isArray(packed)) return null;
    return projection.rowColumns.reduce(function (row, field, index) { row[field] = packed[index]; return row; }, {});
  }

  var api = { VERSION: VERSION, MINIMUMS: Object.assign({}, MINIMUMS), DIVISIONS: DIVISIONS.slice(), normalizeSic: normalizeSic, divisionForSic: divisionForSic, resolvePeerLevel: resolvePeerLevel, canonicalMatch: canonicalMatch, decodeRow: decodeRow, validate: validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUSicPeerTaxonomy = api;
})(typeof window !== "undefined" ? window : globalThis);
