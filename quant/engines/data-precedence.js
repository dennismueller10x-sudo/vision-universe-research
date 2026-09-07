/* =========================================================================
   VISION UNIVERSE — data-precedence.js   (Phase 3, §18, §19, §20)

   Was gilt, wenn zwei Anbieter denselben Wert liefern und er verschieden ist?

   Die naheliegende Antwort - "Anbieter A gewinnt immer" - ist aus einem
   bestimmten Grund falsch. Ein Anbieter kann bei Kursen hervorragend und bei
   Fundamentaldaten schwach sein; einer kann heute aktueller sein und fuer
   die Vergangenheit unbrauchbar. Eine feste Rangfolge ueber alle Datenklassen
   wirft diese Unterschiede weg und gewinnt dafuer nichts ausser Einfachheit.

   Deshalb entscheidet hier eine Reihenfolge von Kriterien, und das erste
   davon ist nicht die Anbieterguete, sondern die Eignung fuer den Zweck:
   fuer eine historische Abfrage schlaegt eine zeitpunktgenaue Quelle jede
   aktuellere, auch eine deutlich bessere.

   Enthaelt ausserdem:
     - DataQualityScore  (§19) intern, nicht fuer die Anzeige gedacht
     - dataSnapshotId    (§20) damit ein Backtest sagen kann, worauf er lief
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Die Kriterien in ihrer Reihenfolge. Jedes wird erst geprueft, wenn das
     vorige unentschieden bleibt. */
  var CRITERIA = [
    "pitSuitability",     // taugt die Quelle fuer diese Art Abfrage?
    "capability",         // deckt sie das Feld ueberhaupt zugesichert ab?
    "confidence",         // wie sicher ist der einzelne Wert?
    "freshness",          // wie aktuell ist er? (nur bei Gegenwartsabfragen)
    "providerPriority",   // erst hier: die konfigurierte Rangfolge
    "timestamp"           // letzter Ausweg: der juengere Datenstand
  ];

  var DATA_TYPES = ["marketData", "fundamentals", "corporateActions", "estimates", "reference"];

  /**
   * Waehlt aus mehreren Kandidaten denselben Feldes einen aus.
   *
   * @param {Array} candidates  [{providerId, value, asOf, availableAt, confidence,
   *                              capability, pitCapable, ingestedAt}]
   * @param {object} context    {dataType, decisionTime, historical, providerPriority}
   */
  function resolve(candidates, context) {
    context = context || {};
    var usable = (candidates || []).filter(function (c) {
      return c && c.value !== undefined && c.value !== null;
    });

    if (!usable.length) {
      return { resolved: false, reason: "noCandidates", value: null,
               message: "Kein Anbieter liefert einen Wert fuer dieses Feld." };
    }
    /* Der Einzelkandidat wird bewusst NICHT vorab durchgewinkt. Sonst
       umgeht genau der Fall die Pruefungen, in dem es keine Alternative
       gibt - und ein einzelner, nicht zeitpunktgenauer Wert waere fuer eine
       historische Abfrage kein Notbehelf, sondern eine falsche Antwort. */

    /* Historische Abfragen: eine Quelle ohne Zeitpunktgenauigkeit ist hier
       nicht schlechter, sondern unbrauchbar. Sie wird ausgeschlossen, nicht
       nur zurueckgestuft. */
    var pool = usable;
    if (context.historical) {
      var pitCapable = usable.filter(function (c) { return c.pitCapable === true; });
      if (pitCapable.length) {
        pool = pitCapable;
      } else {
        return { resolved: false, reason: "noPitSource", value: null,
                 contenders: usable.length,
                 message: "Fuer eine historische Abfrage liegt keine zeitpunktgenaue Quelle vor. " +
                          "Ein aktueller Wert waere hier kein ungenauer, sondern ein falscher." };
      }
    }

    /* Werte, die zum Entscheidungszeitpunkt noch nicht verfuegbar waren,
       scheiden aus - unabhaengig vom Anbieter. */
    if (context.decisionTime) {
      var available = pool.filter(function (c) {
        return !c.availableAt || c.availableAt <= context.decisionTime;
      });
      if (!available.length) {
        return { resolved: false, reason: "noneAvailableYet", value: null,
                 message: "Kein Kandidat war zum Entscheidungszeitpunkt bereits veroeffentlicht." };
      }
      pool = available;
    }

    var ranked = pool.slice().sort(function (a, b) {
      return compare(a, b, context);
    });

    if (ranked.length === 1 && usable.length === 1) {
      return { resolved: true, winner: ranked[0], value: ranked[0].value,
               criterion: "onlyCandidate", contenders: 1, excluded: [],
               ranking: [{ providerId: ranked[0].providerId, value: ranked[0].value }],
               disagreement: null };
    }

    var winner = ranked[0];

    /* Die Abweichung wird ueber ALLE brauchbaren Kandidaten gerechnet, nicht
       nur ueber die im Rennen verbliebenen. Sonst verschwindet die
       interessanteste Information genau dann, wenn der Ausschluss den Wert
       veraendert hat: dass eine ausgeschlossene Quelle etwas deutlich
       anderes sagt, ist ein Befund und kein Nebengeraeusch. */
    var disagreement = describeDisagreement(usable, winner);

    return {
      resolved: true,
      winner: winner,
      value: winner.value,
      criterion: decidingCriterion(ranked[0], ranked[1], context),
      contenders: pool.length,
      excluded: usable.filter(function (c) { return pool.indexOf(c) === -1; })
        .map(function (c) {
          return { providerId: c.providerId, value: c.value,
                   reason: context.historical && c.pitCapable !== true
                     ? "nicht zeitpunktgenau" : "zum Entscheidungszeitpunkt nicht verfuegbar" };
        }),
      ranking: ranked.map(function (c) { return { providerId: c.providerId, value: c.value }; }),
      disagreement: disagreement
    };
  }

  function score(candidate, context) {
    var priority = (context.providerPriority || {})[candidate.providerId];
    return {
      pitSuitability: context.historical ? (candidate.pitCapable === true ? 1 : 0) : 0,
      capability: candidate.capability === true ? 1 : (candidate.capability === false ? -1 : 0),
      confidence: typeof candidate.confidence === "number" ? candidate.confidence : 0,
      freshness: context.historical ? 0 : freshnessScore(candidate, context),
      providerPriority: typeof priority === "number" ? -priority : 0,
      timestamp: candidate.ingestedAt || candidate.asOf || ""
    };
  }

  function compare(a, b, context) {
    var sa = score(a, context), sb = score(b, context);
    for (var i = 0; i < CRITERIA.length; i++) {
      var k = CRITERIA[i];
      if (sa[k] === sb[k]) continue;
      if (k === "timestamp") return sa[k] > sb[k] ? -1 : 1;
      return sb[k] - sa[k];
    }
    /* Vollstaendiger Gleichstand: stabil nach Anbieterkennung sortieren,
       damit dieselbe Eingabe immer dasselbe Ergebnis liefert. Ein
       nichtdeterministischer Datenstand waere schlimmer als ein
       willkuerlicher. */
    return a.providerId < b.providerId ? -1 : 1;
  }

  function decidingCriterion(first, second, context) {
    if (!second) return "onlyCandidate";
    var sa = score(first, context), sb = score(second, context);
    for (var i = 0; i < CRITERIA.length; i++) {
      if (sa[CRITERIA[i]] !== sb[CRITERIA[i]]) return CRITERIA[i];
    }
    return "tieBreak";
  }

  function freshnessScore(candidate, context) {
    var stamp = candidate.asOf || candidate.availableAt;
    if (!stamp) return 0;
    var reference = context.now || new Date().toISOString().slice(0, 10);
    var days = daysBetween(stamp, reference);
    if (days === null) return 0;
    return -days;
  }

  function daysBetween(a, b) {
    var ta = Date.parse(a), tb = Date.parse(b);
    if (!isFinite(ta) || !isFinite(tb)) return null;
    return Math.round((tb - ta) / 86400000);
  }

  /**
   * Wie weit liegen die Kandidaten auseinander?
   *
   * Eine Abweichung von 0,1 % zwischen zwei Anbietern ist Rundung. Eine von
   * 40 % heisst, dass mindestens einer etwas anderes misst - eine andere
   * Periode, eine andere Definition, eine andere Waehrung. Der Gewinner ist
   * dann zwar bestimmt, aber die Auswahl ist nicht mehr die interessante
   * Information.
   */
  function describeDisagreement(pool, winner) {
    var numeric = pool.filter(function (c) { return typeof c.value === "number"; });
    if (numeric.length < 2) {
      var distinct = {};
      pool.forEach(function (c) { distinct[String(c.value)] = true; });
      var count = Object.keys(distinct).length;
      return count > 1
        ? { type: "categorical", distinctValues: count,
            message: count + " verschiedene Werte. Kein Zahlenvergleich moeglich." }
        : null;
    }
    var values = numeric.map(function (c) { return c.value; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) return null;
    var base = Math.abs(winner.value) || Math.abs(max) || 1;
    var spreadPct = ((max - min) / base) * 100;

    return {
      type: "numeric",
      min: min, max: max,
      spreadPct: Math.round(spreadPct * 100) / 100,
      severity: spreadPct < 0.5 ? "rounding" : spreadPct < 5 ? "minor" : "material",
      message: spreadPct < 0.5
        ? "Abweichung im Rundungsbereich."
        : spreadPct < 5
          ? "Merkliche Abweichung zwischen den Anbietern."
          : "Erhebliche Abweichung (" + Math.round(spreadPct) + " %). Vermutlich messen die " +
            "Anbieter Verschiedenes - andere Periode, andere Definition oder andere Waehrung. " +
            "Die Auswahl eines Gewinners loest das nicht."
    };
  }

  /* ------------------------------------------------ DataQualityScore §19 */

  var QUALITY_COMPONENTS = {
    completeness:            { weight: 20, label: "Vollstaendigkeit" },
    freshness:               { weight: 15, label: "Aktualitaet" },
    pitConfidence:           { weight: 25, label: "Zeitpunktgenauigkeit" },
    sourceReliability:       { weight: 15, label: "Quellenguete" },
    identifierConfidence:    { weight: 15, label: "Kennungssicherheit" },
    corporateActionCoverage: { weight: 10, label: "Kapitalmassnahmen" }
  };

  /**
   * Interne Kennzahl, ausdruecklich nicht fuer die Anzeige.
   *
   * Der Grund fuer die Zurueckhaltung: eine Zahl wie "Datenqualitaet 72"
   * wirkt praezise und ist es nicht. Sie taugt, um zwei Konfigurationen
   * desselben Systems zu vergleichen, nicht um einem Leser etwas ueber
   * seine Daten zu sagen. Die Gewichtung ist eine Setzung, keine Messung.
   */
  function dataQualityScore(components) {
    components = components || {};
    var total = 0, max = 0, breakdown = {}, missing = [];

    Object.keys(QUALITY_COMPONENTS).forEach(function (key) {
      var spec = QUALITY_COMPONENTS[key];
      var value = components[key];
      max += spec.weight;
      if (typeof value !== "number" || !isFinite(value)) {
        missing.push(key);
        breakdown[key] = { label: spec.label, value: null, weight: spec.weight, points: 0 };
        return;
      }
      var clamped = Math.max(0, Math.min(1, value));
      var points = clamped * spec.weight;
      total += points;
      breakdown[key] = { label: spec.label, value: clamped, weight: spec.weight,
                         points: Math.round(points * 10) / 10 };
    });

    var score = Math.round((total / max) * 100);

    return {
      score: score,
      breakdown: breakdown,
      missing: missing,
      /* Ein Wert, dem die Haelfte der Bestandteile fehlt, ist keine 50 -
         er ist keine Aussage. */
      reliable: missing.length <= 2,
      internalOnly: true,
      note: missing.length > 2
        ? "Zu viele Bestandteile fehlen (" + missing.length + " von " +
          Object.keys(QUALITY_COMPONENTS).length + "). Der Wert ist nicht aussagekraeftig."
        : null
    };
  }

  /* ------------------------------------------------- dataSnapshotId §20 */

  /**
   * Erzeugt die Kennung eines Datenstands.
   *
   * Format: VU-<UNIVERSUM>-<DATUM>-v<N>
   * Beispiel: VU-US-EQUITY-2026-09-07-v1
   *
   * Der Zweck ist nicht Ordnung, sondern Nachvollziehbarkeit: ein Backtest
   * ohne Angabe, auf welchem Datenstand er lief, laesst sich nicht
   * wiederholen und sein Ergebnis nicht ueberpruefen. Sobald echte Daten
   * einlaufen, aendert sich der Stand mit jedem Abruf.
   */
  function createSnapshotId(options) {
    options = options || {};
    var universe = String(options.universe || "US-EQUITY").toUpperCase().replace(/[^A-Z0-9-]/g, "-");
    var date = options.date || new Date().toISOString().slice(0, 10);
    var version = options.version || 1;
    return "VU-" + universe + "-" + date + "-v" + version;
  }

  var SNAPSHOT_PATTERN = /^VU-([A-Z0-9-]+)-(\d{4}-\d{2}-\d{2})-v(\d+)$/;

  function parseSnapshotId(id) {
    var m = SNAPSHOT_PATTERN.exec(String(id || ""));
    if (!m) return { valid: false, id: id, reason: "Kennung entspricht nicht dem Muster VU-<UNIVERSUM>-<JJJJ-MM-TT>-v<N>." };

    /* Das Muster allein laesst den 45. des 13. Monats durch. Bei einer
       Kennung, auf die sich ein Backtest zur Nachvollziehbarkeit beruft,
       waere ein unmoegliches Datum kein Schoenheitsfehler: es hiesse, dass
       sich der Datenstand nicht wiederfinden laesst. */
    if (!isRealDate(m[2])) {
      return { valid: false, id: id, reason: "Das Datum '" + m[2] + "' existiert nicht." };
    }
    return { valid: true, id: id, universe: m[1], date: m[2], version: parseInt(m[3], 10) };
  }

  function isRealDate(iso) {
    var parts = iso.split("-");
    var y = +parts[0], mo = +parts[1], d = +parts[2];
    var date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y &&
           date.getUTCMonth() === mo - 1 &&
           date.getUTCDate() === d;
  }

  /**
   * Beschreibt einen Datenstand vollstaendig genug, dass sich ein Backtest
   * darauf berufen kann.
   */
  function describeSnapshot(options) {
    options = options || {};
    var id = options.id || createSnapshotId(options);
    var parsed = parseSnapshotId(id);
    return {
      dataSnapshotId: id,
      universe: parsed.universe || null,
      date: parsed.date || null,
      version: parsed.version || null,
      sources: options.sources || {},
      adjustment: options.adjustment || "UNKNOWN",
      providerQualification: options.providerQualification || null,
      recordCounts: options.recordCounts || {},
      createdAt: options.createdAt || new Date().toISOString(),
      /* Ohne diese Angabe ist ein Backtest kein Nachweis, sondern eine
         Vorfuehrung - und das muss an der Kennung haengen, nicht in einer
         Fussnote stehen. */
      evidenceEligible: options.evidenceEligible === true,
      evidenceNote: options.evidenceEligible === true
        ? null
        : "Dieser Datenstand ist nicht als Nachweis geeignet. Es fehlt mindestens eine " +
          "Voraussetzung: zeitpunktgenaue Fundamentaldaten, delistete Titel oder " +
          "total-return-bereinigte Kurse."
    };
  }

  var api = {
    CRITERIA: CRITERIA, DATA_TYPES: DATA_TYPES, QUALITY_COMPONENTS: QUALITY_COMPONENTS,
    SNAPSHOT_PATTERN: SNAPSHOT_PATTERN,
    resolve: resolve, describeDisagreement: describeDisagreement,
    dataQualityScore: dataQualityScore,
    createSnapshotId: createSnapshotId, parseSnapshotId: parseSnapshotId, isRealDate: isRealDate,
    describeSnapshot: describeSnapshot
  };

  if (isNode) module.exports = api;
  else global.VUDataPrecedence = api;
})(typeof window !== "undefined" ? window : globalThis);
