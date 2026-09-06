/* =========================================================================
   VISION UNIVERSE QUANT — query.js
   STRUCTURED QUERY SCHEMA + SCREENER ENGINE (§27, §28, §30)

   Kanonische Wahrheit jeder Abfrage ist ein versionierter, typisierter
   JSON-AST. VUQL ist nur seine lesbare Darstellung, natuerliche Sprache nur
   ein Weg, ihn zu erzeugen.

   ES GIBT GENAU EINE FILTERLOGIK. Screener-UI, VUQL, AI-Tool und die
   Strategy Engine rufen alle execute() auf demselben AST auf. Zwei
   unabhaengige Filterimplementierungen waeren der sicherste Weg, dass
   Screener-Ergebnis und Backtest-Universum auseinanderlaufen.

   scale-Semantik eines Filters:
     "raw"        vergleicht den Rohwert    (FCF > 0, EV/EBITDA <= 25)
     "percentile" vergleicht das Perzentil  (MOMENTUM_6M PCTL >= 80)
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;
  var Hash = isNode ? require("./hash.js") : global.VUHash;

  var QUERY_SCHEMA_VERSION = "1.0";
  var QUERY_TYPES = ["stock_screen"];
  var SCALES = ["raw", "percentile"];
  var DIRECTIONS = ["asc", "desc"];
  var MAX_LIMIT = 500;
  var MAX_FILTERS = 24;

  var UNIVERSES = {
    US_EQUITIES: { universeId: "US_EQUITIES", label: "US Equities (Mock)", region: "US", assetType: "equity" }
  };

  // ---------------------------------------------------------------------
  // Konstruktion
  // ---------------------------------------------------------------------
  function createQuery(partial) {
    partial = partial || {};
    return {
      version: partial.version || QUERY_SCHEMA_VERSION,
      type: partial.type || "stock_screen",
      universe: partial.universe || { universeId: "US_EQUITIES", region: "US", assetType: "equity" },
      filters: (partial.filters || []).map(normalizeFilter),
      sort: partial.sort || [{ field: "quantScore", direction: "desc" }],
      limit: partial.limit === undefined ? 25 : partial.limit
    };
  }

  function normalizeFilter(f) {
    var out = { field: f.field, operator: f.operator, value: f.value, scale: f.scale || "raw" };
    if (f.label) out.label = f.label;
    return out;
  }

  function queryHash(query) { return Hash.prefixedHash("q", query); }

  // ---------------------------------------------------------------------
  // Validierung — schema + semantisch (§30)
  // ---------------------------------------------------------------------
  function validate(query) {
    var errors = [];
    var warnings = [];

    function err(m) { errors.push(m); }

    if (!query || typeof query !== "object" || Array.isArray(query)) {
      return { valid: false, errors: ["query must be an object"], warnings: [] };
    }
    if (query.version !== QUERY_SCHEMA_VERSION) {
      err("version: expected '" + QUERY_SCHEMA_VERSION + "', got " + JSON.stringify(query.version));
    }
    if (QUERY_TYPES.indexOf(query.type) === -1) {
      err("type: '" + query.type + "' is not a supported query type");
    }

    /* Universe */
    var u = query.universe;
    if (!u || typeof u !== "object") {
      err("universe: required object");
    } else {
      var known = UNIVERSES[u.universeId];
      if (!known) err("universe.universeId: unknown universe '" + u.universeId + "'");
      else {
        if (u.region && u.region !== known.region) err("universe.region: '" + u.region + "' does not match universe " + u.universeId);
        if (u.assetType && u.assetType !== known.assetType) err("universe.assetType: '" + u.assetType + "' does not match universe " + u.universeId);
      }
    }

    /* Filter */
    if (!Array.isArray(query.filters)) {
      err("filters: must be an array");
    } else {
      if (query.filters.length > MAX_FILTERS) err("filters: at most " + MAX_FILTERS + " filters allowed");
      query.filters.forEach(function (f, i) { validateFilter(f, "filters[" + i + "]", err); });
      detectContradictions(query.filters, warnings, err);
    }

    /* Sort */
    if (!Array.isArray(query.sort)) {
      err("sort: must be an array");
    } else {
      if (query.sort.length > 3) err("sort: at most 3 sort keys allowed");
      query.sort.forEach(function (s, i) {
        var p = "sort[" + i + "]";
        if (!s || typeof s !== "object") { err(p + ": must be an object"); return; }
        var fd = Catalog.field(s.field);
        if (!fd) { err(p + ".field: unknown field '" + s.field + "'"); return; }
        if (fd.type !== "number") err(p + ".field: '" + s.field + "' is not sortable (type " + fd.type + ")");
        if (DIRECTIONS.indexOf(s.direction) === -1) err(p + ".direction: must be 'asc' or 'desc'");
      });
    }

    /* Limit */
    if (typeof query.limit !== "number" || !Number.isInteger(query.limit)) {
      err("limit: must be an integer");
    } else if (query.limit < 1 || query.limit > MAX_LIMIT) {
      err("limit: must be between 1 and " + MAX_LIMIT);
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function validateFilter(f, path, err) {
    if (!f || typeof f !== "object") { err(path + ": must be an object"); return; }

    var fd = Catalog.field(f.field);
    if (!fd) { err(path + ".field: unknown field '" + f.field + "'"); return; }

    var op = Catalog.operator(f.operator);
    if (!op) { err(path + ".operator: unknown operator '" + f.operator + "'"); return; }

    if (SCALES.indexOf(f.scale) === -1) { err(path + ".scale: must be one of " + SCALES.join(", ")); return; }

    /* Perzentil-Skala nur wo ein Perzentil ueberhaupt existiert. */
    if (f.scale === "percentile") {
      if (!fd.percentileAvailable) {
        err(path + ": field '" + f.field + "' has no percentile representation");
        return;
      }
      if (op.arity !== 1 && op.arity !== 2) { err(path + ".operator: '" + f.operator + "' not allowed on percentile scale"); return; }
    }

    /* Typvertraeglichkeit Operator <-> Feld. */
    var effectiveType = f.scale === "percentile" ? "number" : fd.type;
    if (op.types.indexOf(effectiveType) === -1) {
      err(path + ".operator: '" + f.operator + "' not allowed for " + effectiveType + " field '" + f.field + "'");
      return;
    }

    /* Wertpruefung inkl. Einheiten-/Wertebereichsplausibilitaet. */
    if (op.arity === "list") {
      if (!Array.isArray(f.value) || f.value.length === 0) { err(path + ".value: expected non-empty array"); return; }
      f.value.forEach(function (v, i) { checkScalar(v, fd, f.scale, path + ".value[" + i + "]", err); });
    } else if (op.arity === 2) {
      if (!Array.isArray(f.value) || f.value.length !== 2) { err(path + ".value: 'between' expects [min, max]"); return; }
      checkScalar(f.value[0], fd, f.scale, path + ".value[0]", err);
      checkScalar(f.value[1], fd, f.scale, path + ".value[1]", err);
      if (Number.isFinite(f.value[0]) && Number.isFinite(f.value[1]) && f.value[0] > f.value[1]) {
        err(path + ".value: 'between' min must not exceed max");
      }
    } else {
      checkScalar(f.value, fd, f.scale, path + ".value", err);
    }
  }

  function checkScalar(v, fd, scale, path, err) {
    if (scale === "percentile") {
      if (typeof v !== "number" || !Number.isFinite(v)) { err(path + ": percentile must be a number"); return; }
      if (v < 0 || v > 100) err(path + ": percentile must be between 0 and 100");
      return;
    }
    if (fd.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) { err(path + ": expected a finite number"); return; }
      if (fd.unit === "score" && (v < -100 || v > 100)) err(path + ": score values range from 0 to 100");
      if (fd.unit === "pctl" && (v < 0 || v > 100)) err(path + ": percentile values range from 0 to 100");
      return;
    }
    if (fd.type === "string" || fd.type === "enum") {
      if (typeof v !== "string") { err(path + ": expected a string"); return; }
      if (fd.values && fd.values.indexOf(v) === -1) {
        err(path + ": '" + v + "' is not a valid value for " + fd.id);
      }
      return;
    }
    if (fd.type === "boolean" && typeof v !== "boolean") err(path + ": expected a boolean");
  }

  /* Semantische Validierung: Filter, die sich gegenseitig ausschliessen,
     erzeugen sonst still ein leeres Ergebnis und wirken wie ein Datenfehler. */
  function detectContradictions(filters, warnings, err) {
    var bounds = Object.create(null);
    filters.forEach(function (f) {
      if (typeof f.value !== "number") return;
      var key = f.field + "@" + f.scale;
      var b = bounds[key] || (bounds[key] = { min: -Infinity, max: Infinity });
      if (f.operator === "gt" || f.operator === "gte") b.min = Math.max(b.min, f.value);
      if (f.operator === "lt" || f.operator === "lte") b.max = Math.min(b.max, f.value);
    });
    Object.keys(bounds).forEach(function (key) {
      var b = bounds[key];
      if (b.min > b.max) err("filters: contradictory bounds on " + key.split("@")[0] + " (>= " + b.min + " and <= " + b.max + ")");
    });

    var seen = Object.create(null);
    filters.forEach(function (f) {
      var sig = f.field + "|" + f.operator + "|" + f.scale + "|" + JSON.stringify(f.value);
      if (seen[sig]) warnings.push("filters: duplicate filter on " + f.field + " (" + f.operator + ")");
      seen[sig] = true;
    });
  }

  // ---------------------------------------------------------------------
  // Ausfuehrung
  // ---------------------------------------------------------------------

  /**
   * Wert eines Feldes aus einer Zeile lesen.
   * row.percentiles[fieldId] traegt die vorberechneten Perzentile (§90).
   * Ein fehlender Wert ist null und faellt NIE auf einen Ersatzwert zurueck.
   */
  function readValue(row, fieldId, scale) {
    if (scale === "percentile") {
      var p = row.percentiles && row.percentiles[fieldId];
      return (p === undefined || p === null || !Number.isFinite(p)) ? null : p;
    }
    var v = row[fieldId];
    if (v === undefined) return null;
    if (typeof v === "number" && !Number.isFinite(v)) return null;
    return v;
  }

  function matchOne(value, f) {
    /* Fehlende Daten erfuellen keinen Filter. Ein Unternehmen ohne ROIC
       ist NICHT automatisch "ROIC >= 10" — es ist unbekannt (§21, §93). */
    if (value === null) return false;
    switch (f.operator) {
      case "eq":  return value === f.value;
      case "ne":  return value !== f.value;
      case "gt":  return value >  f.value;
      case "gte": return value >= f.value;
      case "lt":  return value <  f.value;
      case "lte": return value <= f.value;
      case "in":  return f.value.indexOf(value) !== -1;
      case "notIn": return f.value.indexOf(value) === -1;
      case "between": return value >= f.value[0] && value <= f.value[1];
      default: return false;
    }
  }

  function matches(row, filters) {
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      if (!matchOne(readValue(row, f.field, f.scale), f)) return false;
    }
    return true;
  }

  function compareRows(a, b, sort) {
    for (var i = 0; i < sort.length; i++) {
      var s = sort[i];
      var av = readValue(a, s.field, "raw");
      var bv = readValue(b, s.field, "raw");
      /* Nulls immer ans Ende, unabhaengig von der Sortierrichtung. */
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) continue;
      return s.direction === "asc" ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    }
    /* Stabiler Tiebreak, damit gleiche Eingaben gleiche Reihenfolge ergeben. */
    return String(a.ticker || "") < String(b.ticker || "") ? -1 : 1;
  }

  /**
   * Fuehrt einen validierten Query-AST auf einer Zeilenmenge aus.
   * Wirft, wenn der AST ungueltig ist — ungueltiges VUQL/AST darf nie
   * ausgefuehrt werden (§30).
   */
  function execute(query, rows, options) {
    options = options || {};
    var validation = validate(query);
    if (!validation.valid) {
      var e = new Error("Invalid query: " + validation.errors.join("; "));
      e.validation = validation;
      throw e;
    }

    var universeRows = rows;
    /* Ein Screener zeigt das heute investierbare Universum. Delistete Titel
       bleiben fuer den Backtest erhalten, gehoeren aber nicht in eine
       aktuelle Kandidatenliste — es sei denn, es wird ausdruecklich
       danach gefiltert. */
    var asksForStatus = query.filters.some(function (f) { return f.field === "status"; });
    if (!asksForStatus && options.includeDelisted !== true) {
      universeRows = universeRows.filter(function (r) { return r.status === "active"; });
    }

    var matched = universeRows.filter(function (r) { return matches(r, query.filters); });
    var sorted = matched.slice().sort(function (a, b) { return compareRows(a, b, query.sort); });
    var limited = sorted.slice(0, query.limit);

    return {
      query: query,
      queryHash: queryHash(query),
      universeSize: universeRows.length,
      matchedCount: matched.length,
      returnedCount: limited.length,
      truncated: matched.length > query.limit,
      rows: limited,
      warnings: validation.warnings,
      asOf: options.asOf || null,
      methodologyVersion: options.methodologyVersion || null,
      dataSnapshotId: options.dataSnapshotId || null
    };
  }

  /** Menschenlesbare Beschreibung eines Filters — UI und AI teilen sie. */
  function describeFilter(f) {
    var fd = Catalog.field(f.field);
    var label = fd ? fd.label : f.field;
    var op = Catalog.operator(f.operator);
    var opLabel = op ? op.label : f.operator;
    var value;
    if (Array.isArray(f.value)) {
      value = f.operator === "between"
        ? f.value.map(function (v) { return formatFor(f, fd, v); }).join(" – ")
        : f.value.join(", ");
    } else {
      value = formatFor(f, fd, f.value);
    }
    var scaleLabel = f.scale === "percentile" ? " (Perzentil)" : "";
    return label + scaleLabel + " " + opLabel + " " + value;
  }

  function formatFor(f, fd, v) {
    if (f.scale === "percentile") return String(v);
    if (!fd || typeof v !== "number") return String(v);
    return Catalog.formatValue(fd.id, v);
  }

  function describeQuery(query) {
    return {
      universe: (UNIVERSES[query.universe.universeId] || {}).label || query.universe.universeId,
      filters: query.filters.map(describeFilter),
      sort: query.sort.map(function (s) {
        var fd = Catalog.field(s.field);
        return (fd ? fd.label : s.field) + " " + (s.direction === "desc" ? "absteigend" : "aufsteigend");
      }),
      limit: query.limit
    };
  }

  var api = {
    QUERY_SCHEMA_VERSION: QUERY_SCHEMA_VERSION,
    QUERY_TYPES: QUERY_TYPES,
    SCALES: SCALES,
    MAX_LIMIT: MAX_LIMIT,
    MAX_FILTERS: MAX_FILTERS,
    UNIVERSES: UNIVERSES,
    createQuery: createQuery,
    queryHash: queryHash,
    validate: validate,
    execute: execute,
    matches: matches,
    readValue: readValue,
    describeFilter: describeFilter,
    describeQuery: describeQuery
  };

  if (isNode) module.exports = api;
  else global.VUQuery = api;
})(typeof window !== "undefined" ? window : globalThis);
