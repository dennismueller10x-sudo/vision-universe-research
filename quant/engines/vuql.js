/* =========================================================================
   VISION UNIVERSE QUANT — vuql.js
   VISION UNIVERSE QUERY LANGUAGE (§29, §30)

   VUQL ist NICHT die kanonische interne Wahrheit. Kanonisch ist der
   typisierte JSON-AST aus query.js. VUQL ist seine menschenlesbare,
   portable Darstellung — teilbar, versionierbar, in einer Textzeile
   erklaerbar.

       Natural Language
             |
             v
       JSON Query AST   <-- kanonisch
             ^
             |
           VUQL         <-- lesbar / portabel

   Beispiel:

       UNIVERSE US_EQUITIES
       SECTOR Technology
       MOMENTUM_6M PCTL >= 80
       DISTANCE_52W_HIGH <= 3%
       FCF > 0
       SORT QUANT_SCORE DESC
       LIMIT 25

   Ungueltiges VUQL wird nie ausgefuehrt: parse() liefert Fehler mit
   Zeilennummer, und der erzeugte AST durchlaeuft anschliessend zusaetzlich
   die vollstaendige Validierung aus query.js.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;
  var Query = isNode ? require("./query.js") : global.VUQuery;

  var VUQL_VERSION = "1.0";

  var OP_TEXT = {
    ">=": "gte", "<=": "lte", ">": "gt", "<": "lt",
    "=": "eq", "==": "eq", "!=": "ne", "<>": "ne"
  };
  var OP_SYMBOL = { gte: ">=", lte: "<=", gt: ">", lt: "<", eq: "=", ne: "!=" };

  var KEYWORDS = ["UNIVERSE", "SORT", "LIMIT", "IN", "NOT", "BETWEEN", "AND", "PCTL", "ASC", "DESC"];

  // ---------------------------------------------------------------------
  // Tokenizer je Zeile
  // ---------------------------------------------------------------------
  function tokenizeLine(line) {
    var tokens = [];
    var re = /"([^"]*)"|'([^']*)'|\(([^)]*)\)|(>=|<=|<>|==|!=|>|<|=)|([^\s(]+)/g;
    var m;
    while ((m = re.exec(line)) !== null) {
      if (m[1] !== undefined)      tokens.push({ kind: "string", value: m[1] });
      else if (m[2] !== undefined) tokens.push({ kind: "string", value: m[2] });
      else if (m[3] !== undefined) tokens.push({ kind: "list", value: splitList(m[3]) });
      else if (m[4] !== undefined) tokens.push({ kind: "op", value: m[4] });
      else                         tokens.push({ kind: "word", value: m[5] });
    }
    return tokens;
  }

  function splitList(inner) {
    return inner.split(",").map(function (s) {
      return s.trim().replace(/^["']|["']$/g, "");
    }).filter(function (s) { return s.length > 0; });
  }

  /* Zahl mit optionaler Einheit. "3%" und "3" sind derselbe Wert, weil
     Prozentfelder im Katalog bereits als Prozentzahl definiert sind — das
     Prozentzeichen ist Lesbarkeit, keine zweite Einheit. "1.5B"/"250M"
     werden in Mio. USD umgerechnet, passend zur Katalog-Unit usd_m. */
  function parseNumber(raw) {
    var s = String(raw).trim().replace(/_/g, "");
    var mult = 1;
    if (/%$/.test(s)) s = s.slice(0, -1);
    else if (/[bB]$/.test(s)) { mult = 1000; s = s.slice(0, -1); }
    else if (/[mM]$/.test(s)) { mult = 1; s = s.slice(0, -1); }
    else if (/[kK]$/.test(s)) { mult = 0.001; s = s.slice(0, -1); }
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s) * mult;
  }

  // ---------------------------------------------------------------------
  // Parser
  // ---------------------------------------------------------------------
  /**
   * @returns {{ok:boolean, query:object|null, errors:Array<{line:number,message:string}>}}
   */
  function parse(text) {
    var errors = [];
    var filters = [];
    var sort = [];
    var universeId = "US_EQUITIES";
    var limit = 25;
    var sawLimit = false;

    var lines = String(text || "").split(/\r?\n/);

    lines.forEach(function (rawLine, idx) {
      var lineNo = idx + 1;
      var line = rawLine.replace(/(^|\s)(#|--).*$/, "").trim();
      if (!line) return;

      var tokens = tokenizeLine(line);
      if (!tokens.length) return;
      var head = tokens[0];

      if (head.kind === "word" && head.value.toUpperCase() === "UNIVERSE") {
        if (tokens.length !== 2 || tokens[1].kind !== "word") {
          errors.push({ line: lineNo, message: "UNIVERSE erwartet genau einen Universumsnamen" });
          return;
        }
        universeId = tokens[1].value.toUpperCase();
        if (!Query.UNIVERSES[universeId]) {
          errors.push({ line: lineNo, message: "Unbekanntes Universum '" + universeId + "'. Verfuegbar: " + Object.keys(Query.UNIVERSES).join(", ") });
        }
        return;
      }

      if (head.kind === "word" && head.value.toUpperCase() === "SORT") {
        parseSort(tokens, lineNo, sort, errors);
        return;
      }

      if (head.kind === "word" && head.value.toUpperCase() === "LIMIT") {
        var n = tokens[1] ? parseNumber(tokens[1].value) : null;
        if (n === null || !Number.isInteger(n)) {
          errors.push({ line: lineNo, message: "LIMIT erwartet eine ganze Zahl" });
          return;
        }
        limit = n; sawLimit = true;
        return;
      }

      parseFilter(tokens, lineNo, filters, errors);
    });

    if (!sort.length) sort = [{ field: "quantScore", direction: "desc" }];

    var query = Query.createQuery({
      universe: {
        universeId: universeId,
        region: (Query.UNIVERSES[universeId] || {}).region || "US",
        assetType: (Query.UNIVERSES[universeId] || {}).assetType || "equity"
      },
      filters: filters,
      sort: sort,
      limit: sawLimit ? limit : 25
    });

    /* Syntaktisch korrekt heisst noch nicht ausfuehrbar: der AST muss
       zusaetzlich die volle Query-Validierung bestehen. */
    if (!errors.length) {
      var v = Query.validate(query);
      if (!v.valid) v.errors.forEach(function (m) { errors.push({ line: 0, message: m }); });
    }

    return { ok: errors.length === 0, query: errors.length ? null : query, errors: errors };
  }

  function parseSort(tokens, lineNo, sort, errors) {
    if (tokens.length < 2 || tokens[1].kind !== "word") {
      errors.push({ line: lineNo, message: "SORT erwartet ein Feld" });
      return;
    }
    var fd = Catalog.fieldByToken(tokens[1].value);
    if (!fd) {
      errors.push({ line: lineNo, message: "Unbekanntes Feld '" + tokens[1].value + "' in SORT" });
      return;
    }
    var dir = "desc";
    if (tokens[2] && tokens[2].kind === "word") {
      var d = tokens[2].value.toUpperCase();
      if (d !== "ASC" && d !== "DESC") {
        errors.push({ line: lineNo, message: "SORT-Richtung muss ASC oder DESC sein, nicht '" + tokens[2].value + "'" });
        return;
      }
      dir = d.toLowerCase();
    }
    sort.push({ field: fd.id, direction: dir });
  }

  function parseFilter(tokens, lineNo, filters, errors) {
    var head = tokens[0];
    if (head.kind !== "word") {
      errors.push({ line: lineNo, message: "Zeile muss mit einem Feldnamen oder Schluesselwort beginnen" });
      return;
    }
    var fd = Catalog.fieldByToken(head.value);
    if (!fd) {
      errors.push({ line: lineNo, message: "Unbekanntes Feld '" + head.value + "'" });
      return;
    }

    var i = 1;
    var scale = "raw";
    if (tokens[i] && tokens[i].kind === "word" && tokens[i].value.toUpperCase() === "PCTL") {
      scale = "percentile";
      i++;
      if (!fd.percentileAvailable) {
        errors.push({ line: lineNo, message: "Feld '" + head.value + "' besitzt kein Perzentil" });
        return;
      }
    }

    var operator = null;
    var value = null;
    var t = tokens[i];

    if (!t) {
      errors.push({ line: lineNo, message: "Filter auf '" + head.value + "' ohne Operator oder Wert" });
      return;
    }

    if (t.kind === "op") {
      operator = OP_TEXT[t.value];
      if (!operator) { errors.push({ line: lineNo, message: "Unbekannter Operator '" + t.value + "'" }); return; }
      i++;
      value = readValueTokens(tokens, i, fd, scale, lineNo, errors);
      if (value === undefined) return;
    } else if (t.kind === "word" && t.value.toUpperCase() === "IN") {
      operator = "in"; i++;
      value = readListToken(tokens, i, lineNo, errors);
      if (value === undefined) return;
    } else if (t.kind === "word" && t.value.toUpperCase() === "NOT" &&
               tokens[i + 1] && tokens[i + 1].kind === "word" && tokens[i + 1].value.toUpperCase() === "IN") {
      operator = "notIn"; i += 2;
      value = readListToken(tokens, i, lineNo, errors);
      if (value === undefined) return;
    } else if (t.kind === "word" && t.value.toUpperCase() === "BETWEEN") {
      operator = "between"; i++;
      var lo = tokens[i] ? parseNumber(tokens[i].value) : null;
      var andTok = tokens[i + 1];
      var hi = tokens[i + 2] ? parseNumber(tokens[i + 2].value) : null;
      if (lo === null || hi === null || !andTok || andTok.value.toUpperCase() !== "AND") {
        errors.push({ line: lineNo, message: "BETWEEN erwartet die Form: BETWEEN <min> AND <max>" });
        return;
      }
      value = [lo, hi];
    } else {
      /* Kurzform ohne Operator: "SECTOR Technology" == "SECTOR = Technology". */
      operator = "eq";
      value = readValueTokens(tokens, i, fd, scale, lineNo, errors);
      if (value === undefined) return;
    }

    filters.push({ field: fd.id, operator: operator, value: value, scale: scale });
  }

  function readListToken(tokens, i, lineNo, errors) {
    var t = tokens[i];
    if (!t) { errors.push({ line: lineNo, message: "IN erwartet eine Liste in Klammern, z. B. (Technology, Industrials)" }); return undefined; }
    if (t.kind === "list") return t.value;
    if (t.kind === "string" || t.kind === "word") return [t.value];
    errors.push({ line: lineNo, message: "IN erwartet eine Liste in Klammern" });
    return undefined;
  }

  function readValueTokens(tokens, i, fd, scale, lineNo, errors) {
    var rest = tokens.slice(i);
    if (!rest.length) { errors.push({ line: lineNo, message: "Fehlender Wert fuer '" + Catalog.tokenOf(fd.id) + "'" }); return undefined; }

    if (scale === "percentile" || fd.type === "number") {
      var n = parseNumber(rest[0].kind === "list" ? "" : rest[0].value);
      if (n === null) {
        errors.push({ line: lineNo, message: "'" + rest[0].value + "' ist keine gueltige Zahl fuer " + Catalog.tokenOf(fd.id) });
        return undefined;
      }
      return n;
    }
    if (rest[0].kind === "list") { errors.push({ line: lineNo, message: "Liste nur mit IN / NOT IN erlaubt" }); return undefined; }
    /* Mehrwortwerte ohne Anfuehrungszeichen zusammenfuegen: "Health Care". */
    return rest.map(function (t) { return t.value; }).join(" ");
  }

  // ---------------------------------------------------------------------
  // Serializer: AST -> VUQL
  // ---------------------------------------------------------------------
  function serialize(query) {
    var lines = [];
    lines.push("UNIVERSE " + query.universe.universeId);
    (query.filters || []).forEach(function (f) {
      var token = Catalog.tokenOf(f.field);
      var fd = Catalog.field(f.field);
      var pctl = f.scale === "percentile" ? " PCTL" : "";
      if (f.operator === "in" || f.operator === "notIn") {
        lines.push(token + pctl + (f.operator === "in" ? " IN " : " NOT IN ") + "(" + f.value.join(", ") + ")");
      } else if (f.operator === "between") {
        lines.push(token + pctl + " BETWEEN " + f.value[0] + " AND " + f.value[1]);
      } else {
        var sym = OP_SYMBOL[f.operator] || f.operator;
        var v = f.value;
        if (typeof v === "string" && /\s/.test(v)) v = '"' + v + '"';
        if (f.scale === "raw" && fd && fd.unit === "pct" && typeof v === "number") v = v + "%";
        lines.push(token + pctl + " " + sym + " " + v);
      }
    });
    (query.sort || []).forEach(function (s) {
      lines.push("SORT " + Catalog.tokenOf(s.field) + " " + s.direction.toUpperCase());
    });
    lines.push("LIMIT " + query.limit);
    return lines.join("\n");
  }

  var api = {
    VUQL_VERSION: VUQL_VERSION,
    KEYWORDS: KEYWORDS,
    parse: parse,
    serialize: serialize,
    parseNumber: parseNumber
  };

  if (isNode) module.exports = api;
  else global.VUQL = api;
})(typeof window !== "undefined" ? window : globalThis);
