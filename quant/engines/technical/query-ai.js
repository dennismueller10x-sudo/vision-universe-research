/* =========================================================================
   VISION UNIVERSE TECHNICAL — query-ai.js
   SUCHE IN WORTEN MIT SPRACHMODELL (vorbereitet, standardmaessig AUS)

   Ein Sprachmodell darf genau eines: einen Satz in das Abfrageformat aus
   technical-query.js uebersetzen. Gerechnet wird immer nur dort (evaluate);
   dieses Modul fuehrt nichts aus und ruft kein Netzwerk. Der Aufrufer
   reicht einen Anbieter als Funktion herein (request -> Promise<Antwort>);
   ohne Freischaltung und ohne Anbieter gilt der regelbasierte Parser
   (query-text.js) - das ist auch die Rueckfallstufe bei jedem Fehler.

   Pruefung jeder Modellantwort (interpret):
     MALFORMED           kein JSON-Objekt mit "query"
     INVALID             Q.validate lehnt ab (unbekanntes Feld, Operator,
                         Zeitrahmen, Wert) - wird NICHT ausgefuehrt
     ASSUMED_THRESHOLD   eine Zahl der Abfrage steht nicht im Satz und ist
                         keine feste Definition eines erkannten Begriffs
                         (query-text.js, z. B. "ueberverkauft" = RSI < 30):
                         das Modell hat eine Schwelle angenommen; der Nutzer
                         muss sie sehen und bestaetigen oder aendern
     UNMAPPED            Teile des Satzes hat das Modell nicht abgebildet
                         (eigene Angabe) oder der Parser kennt sie nicht
     DIFFERS_FROM_RULES  der regelbasierte Parser versteht den Satz voll und
                         kommt zu einer anderen Abfrage
   Status: OK (ausfuehrbar, keine Hinweise), REVIEW (ausfuehrbar, Hinweise
   muessen sichtbar sein), REJECTED (nicht ausfuehrbar; Rueckfall Regeln).

   Kosten: Freischaltung nur ueber config.enabled UND einen Anbieter; dazu
   eine Obergrenze je Sitzung (maxCalls), Eingabelaenge (maxInputChars),
   Ausgabe-Token (maxOutputTokens) und eine Zeitgrenze (timeoutMs). Keine
   Freischaltung ohne Owner-Freigabe (Anbieter, Kosten, Budget, Datenschutz).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Q = isNode ? require("./technical-query.js") : global.VUTechnical.Query;
  var QT = isNode ? require("./query-text.js") : global.VUTechnical.QueryText;
  var VERSION = "technical-query-ai-1.0.0";

  var DEFAULTS = { enabled: false, maxCalls: 20, maxInputChars: 300, maxOutputTokens: 800, timeoutMs: 8000 };

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function config(over) {
    var c = {}, k;
    for (k in DEFAULTS) c[k] = DEFAULTS[k];
    for (k in (over || {})) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) c[k] = over[k];
    return c;
  }

  /** Antwortformat des Modells: die Abfrage plus eigene Angabe, was es nicht abbilden konnte. */
  function responseSchema() {
    return { type: "object", additionalProperties: false, required: ["query", "unmapped"],
      properties: { query: Q.jsonSchema(),
        unmapped: { type: "array", maxItems: 10, items: { type: "string", maxLength: 80 }, description: "Teile des Satzes, die sich mit den Feldern nicht abbilden lassen (wörtlich)" } } };
  }

  /** Anfrage an einen Anbieter (kein Netzwerk hier). Anweisung und Beispiele aus query-text.js#contract. */
  function buildRequest(text, cfg) {
    var c = config(cfg), k = QT.contract();
    return { version: VERSION, contract: k.version, instructions: k.instructions +
        " Trage alles, was du nicht abbilden kannst, wörtlich in \"unmapped\" ein. Eine Schwelle, die im Satz nicht als Zahl steht, ist eine Annahme und soll vermieden werden.",
      schema: responseSchema(), examples: k.examples, input: String(text || "").slice(0, c.maxInputChars), maxOutputTokens: c.maxOutputTokens };
  }

  /* Zahlen im Satz (Komma oder Punkt), als Zahl und - fuer Prozentfelder - als Anteil. */
  function numbersIn(text) {
    var out = [], m, re = /[-−]?\d+(?:[.,]\d+)?/g, s = String(text || "");
    while ((m = re.exec(s))) { var v = Number(m[0].replace("−", "-").replace(",", ".")); if (isNum(v)) { out.push(v, Math.abs(v)); } }
    return out;
  }
  function grounded(value, nums, kind) {
    return nums.some(function (n) {
      var c = kind === "pct" ? [n / 100, -n / 100] : [n, -n];
      return c.some(function (x) { return Math.abs(x - value) <= 1e-9 * Math.max(1, Math.abs(x)); });
    });
  }
  function filterKey(f) { return [f.field, f.op, JSON.stringify(f.value), f.value2 === undefined ? "" : f.value2, f.tf || ""].join("|"); }
  function canonicalOf(query) { try { return QT.toText(query); } catch (e) { return null; } }

  /**
   * interpret(text, raw) -> { status, query|null, canonical|null, issues:[{code,text}], rules }
   * `raw`: Modellantwort als String oder Objekt { query, unmapped }.
   */
  function interpret(text, raw) {
    var rules = QT.parse(text), issues = [];
    var rulesView = { ok: rules.ok, canonical: rules.canonical || null, unknown: rules.unknown.slice() };
    var obj = raw;
    if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch (e) { obj = null; } }
    if (!obj || typeof obj !== "object" || !obj.query || typeof obj.query !== "object") {
      return { status: "REJECTED", query: null, canonical: null, issues: [{ code: "MALFORMED", text: "Die Antwort ist keine Abfrage." }], rules: rulesView };
    }
    var v = Q.validate(obj.query);
    if (!v.ok) {
      return { status: "REJECTED", query: null, canonical: null, rules: rulesView,
        issues: v.errors.map(function (e) { return { code: "INVALID", text: e.code + (e.path ? " (" + e.path + ")" : "") }; }) };
    }
    var query = v.query, nums = numbersIn(text), defined = {};
    /* Fest definierte Begriffe des Regelparsers ("ueberverkauft" = RSI 14 unter 30) sind keine Annahme des Modells. */
    rules.query.groups.forEach(function (g) { g.filters.forEach(function (f) { defined[filterKey(f)] = true; }); });
    query.groups.forEach(function (g) {
      g.filters.forEach(function (f) {
        var def = Q.field(f.field);
        if (defined[filterKey(f)]) return;
        [["value", f.value], ["value2", f.value2]].forEach(function (p) {
          if (!isNum(p[1])) return;
          if (!grounded(p[1], nums, def.kind)) issues.push({ code: "ASSUMED_THRESHOLD", text: Q.describeFilter ? Q.describeFilter(f, query.timeframe) : f.field + " " + f.op + " " + p[1] });
        });
      });
    });
    var unmapped = Array.isArray(obj.unmapped) ? obj.unmapped.filter(function (s) { return typeof s === "string" && s.trim(); }).slice(0, 10) : [];
    if (unmapped.length) issues.push({ code: "UNMAPPED", text: unmapped.join(", ") });
    else if (!rules.ok && rules.unknown.length) issues.push({ code: "UNMAPPED", text: rules.unknown.join(", ") + " (vom Regelparser nicht erkannt; das Modell meldet nichts)" });
    var canonical = canonicalOf(query);
    if (rules.ok && rules.canonical && canonical && rules.canonical !== canonical) issues.push({ code: "DIFFERS_FROM_RULES", text: "Regelbasiert: " + rules.canonical });
    if (!query.groups.length || !query.groups.some(function (g) { return g.filters.length; })) {
      return { status: "REJECTED", query: null, canonical: null, issues: issues.concat([{ code: "EMPTY", text: "Keine abbildbare Bedingung." }]), rules: rulesView };
    }
    return { status: issues.length ? "REVIEW" : "OK", query: query, canonical: canonical, issues: issues, rules: rulesView };
  }

  /** Regelbasiertes Ergebnis in derselben Form (Rueckfall und Normalfall ohne Freischaltung). */
  function fromRules(text, reason) {
    var r = QT.parse(text), issues = reason ? [{ code: reason, text: REASON_TEXT[reason] || reason }] : [];
    if (r.unknown.length) issues.push({ code: "UNMAPPED", text: r.unknown.join(", ") });
    var runnable = r.query && r.query.groups.some(function (g) { return g.filters.length; });
    return { source: "rules", status: runnable ? (issues.length ? "REVIEW" : "OK") : "REJECTED", query: runnable ? r.query : null,
      canonical: runnable ? r.canonical : null, issues: issues, rules: { ok: r.ok, canonical: r.canonical || null, unknown: r.unknown.slice() } };
  }
  var REASON_TEXT = {
    DISABLED: "Die Sprachmodell-Stufe ist nicht freigeschaltet; regelbasiert übersetzt.",
    BUDGET: "Obergrenze für Modellaufrufe dieser Sitzung erreicht; regelbasiert übersetzt.",
    TOO_LONG: "Eingabe zu lang für die Modellstufe; regelbasiert übersetzt.",
    TIMEOUT: "Das Modell hat nicht rechtzeitig geantwortet; regelbasiert übersetzt.",
    PROVIDER_ERROR: "Das Modell ist nicht erreichbar; regelbasiert übersetzt.",
    MODEL_REJECTED: "Die Modellantwort war nicht gültig; regelbasiert übersetzt."
  };

  /**
   * createSearch({ config, provider }) -> { search(text) -> Promise<Ergebnis>, calls() }
   * provider(request) -> Promise<raw>. Ohne config.enabled === true oder ohne provider: nur Regeln.
   */
  function createSearch(opts) {
    var c = config(opts && opts.config), provider = opts && typeof opts.provider === "function" ? opts.provider : null, used = 0;
    function search(text) {
      var t = String(text || "").trim();
      if (!c.enabled || !provider) return Promise.resolve(fromRules(t, provider || c.enabled ? "DISABLED" : null));
      if (t.length > c.maxInputChars) return Promise.resolve(fromRules(t, "TOO_LONG"));
      if (used >= c.maxCalls) return Promise.resolve(fromRules(t, "BUDGET"));
      used++;
      var timer = null;
      var timeout = new Promise(function (resolve) { timer = setTimeout(function () { resolve({ __timeout: true }); }, c.timeoutMs); });
      return Promise.race([Promise.resolve().then(function () { return provider(buildRequest(t, c)); }), timeout]).then(function (raw) {
        clearTimeout(timer);
        if (raw && raw.__timeout) return fromRules(t, "TIMEOUT");
        var r = interpret(t, raw);
        if (r.status === "REJECTED") { var fb = fromRules(t, "MODEL_REJECTED"); fb.model = r; return fb; }
        r.source = "model";
        return r;
      }, function () { clearTimeout(timer); return fromRules(t, "PROVIDER_ERROR"); });
    }
    return { search: search, calls: function () { return used; }, config: c };
  }

  var api = { VERSION: VERSION, DEFAULTS: DEFAULTS, responseSchema: responseSchema, buildRequest: buildRequest,
    interpret: interpret, fromRules: fromRules, createSearch: createSearch, REASON_TEXT: REASON_TEXT };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.QueryAI = api; }
})(typeof window !== "undefined" ? window : globalThis);
