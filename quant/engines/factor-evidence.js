/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — FACTOR EVIDENCE ENGINE v1

   What this is: the per-factor evidence layer of the canonical Quant V2
   factor definitions (quant/methodology/quant-v2.json). It answers
   "how strong is this factor, why, and how sure are we", across the broad
   product universe, from inputs that already exist.

   What this deliberately is NOT: the VU Quant Score. Quant V2 publication
   is closed (publication.allowed = false, fullScoreRequiresEveryFactor =
   true). This engine therefore never emits a composite score, never emits
   a ranking, and never redistributes the weight of a missing factor.
   A factor that cannot be computed against its own contract stays
   UNAVAILABLE with a typed reason; its raw inputs may still be shown as
   evidence, but they never become a score.

   Methodology identity: vu-factor-evidence-1.0.0, derived from
   quant-v2.0.0. It is a separate, independently versioned product
   contract so that a later Quant V2 activation is a new decision and not
   a silent reinterpretation of what was published here.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

    /* 2.0.0 seit der Owner-Entscheidung vom 2026-09-24 (Option C): der
     Momentumfaktor rechnet auf splitbereinigten Kursen, drei seiner
     Komponenten heissen anders, und die Gesamtrendite steht als eigene
     Anlegerevidenz daneben. Eine neue Bedeutung bekommt eine neue
     Version - die 1.0.0-Beobachtungen bleiben unveraendert unter ihrer
     eigenen Reihe stehen. */
  var METHODOLOGY_VERSION = "vu-factor-evidence-2.0.0";
  var DERIVED_FROM = "quant-v2.2.0";
  var SHARD_SCHEMA = "factor-evidence-product-1.0.0";
  var SUMMARY_SCHEMA = "factor-evidence-summary-1.0.0";
  var SCREENING_SCHEMA = "factor-evidence-screening-1.0.0";
  var SNAPSHOT_SCHEMA = "factor-evidence-snapshot-1.0.0";
  var SNAPSHOT_INDEX_SCHEMA = "factor-evidence-snapshot-index-1.0.0";

  /* Der Katalog-Namensraum, unter dem diese Evidenz selektierbar ist.
     Quant V1 behaelt seine eigenen Felder; keiner der beiden Namensraeume
     wird je auf den anderen umgedeutet. */
  var NAMESPACE = "quantV2.factorEvidence";

  /* Canonical seven-factor order. Identical to quant-v2.0.0 factorOrder;
     the order is part of the product promise and never sorted by value. */
  var FACTOR_ORDER = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];

  /* Typed unavailability. A factor is never silently absent. */
  var FACTOR_STATES = ["AVAILABLE", "UNAVAILABLE", "NOT_APPLICABLE"];
  var FACTOR_REASONS = [
    "INSUFFICIENT_COMPONENTS",          /* fewer components than the contract demands */
    "INSUFFICIENT_WEIGHTED_COVERAGE",   /* available component weight below minimum */
    "MANDATORY_COMPONENT_MISSING",      /* a component the contract marks mandatory is absent */
    "INPUT_NOT_MATERIALIZED",           /* the input exists in the contract, not in any artifact */
    "PEER_GROUP_UNAVAILABLE",           /* no peer level reaches its minimum issuer count */
    "SECTOR_TEMPLATE_MISSING",          /* generic formula not applicable, no versioned template */
    "BLOCKED_EXTERNAL",                 /* licensed source absent; Revisions */
    "IDENTITY_UNRESOLVED",              /* no canonical issuer join */
    "FUNDAMENTALS_UNAVAILABLE",         /* no PIT-safe filing observation */
    "PRICE_FACTORS_UNAVAILABLE"         /* no certified price factor row */
  ];

  var COMPONENT_STATES = ["AVAILABLE", "UNAVAILABLE"];

  /* Display bands. Cut points are the quant-v2.0.0 ratingBands; only the
     labels are product wording. A band is a position in the universe, not
     a verdict about the company. */
  var BANDS = [
    { min: 90, id: "VERY_STRONG", label: "Sehr stark", plain: "Gehört zu den stärksten 10 % im Universum." },
    { min: 75, id: "STRONG", label: "Stark", plain: "Liegt deutlich über dem Durchschnitt des Universums." },
    { min: 45, id: "NEUTRAL", label: "Durchschnittlich", plain: "Liegt im mittleren Bereich des Universums." },
    { min: 25, id: "WEAK", label: "Schwach", plain: "Liegt unter dem Durchschnitt des Universums." },
    { min: 0, id: "VERY_WEAK", label: "Sehr schwach", plain: "Gehört zum schwächsten Viertel im Universum." }
  ];

  var CONFIDENCE_BANDS = [
    { min: 90, id: "HIGH", label: "hoch" },
    { min: 75, id: "MEDIUM", label: "mittel" },
    { min: 60, id: "LOW", label: "niedrig" },
    { min: 0, id: "INSUFFICIENT", label: "nicht ausreichend" }
  ];

  /* quant-v2.0.0 confidence.formulaWeights, unchanged. */
  var CONFIDENCE_WEIGHTS = { coverage: 0.50, freshness: 0.20, peerQuality: 0.15, historyDepth: 0.10, provenance: 0.05 };

  /* Beginner-facing meaning per factor. This is the Meaning layer: it must
     be understandable before any formula is shown. */
  var FACTOR_MEANING = {
    quality: {
      label: "Unternehmensqualität",
      question: "Wie solide ist das Unternehmen aufgestellt?",
      plain: "Qualität fragt, ob ein Unternehmen stabil finanziert ist und ob die ausgewiesenen Gewinne durch echten Zahlungsfluss gedeckt sind.",
      higherMeans: "Höher bedeutet solidere Bilanz und belastbarere Rechnungslegung. Es ist keine Empfehlung."
    },
    growth: {
      label: "Wachstum",
      question: "Wächst das Geschäft — und wird es schneller oder langsamer?",
      plain: "Wachstum misst, wie stark Umsatz, Gewinn und Zahlungsfluss über mehrere Jahre zugenommen haben und ob sich das Tempo verändert.",
      higherMeans: "Höher bedeutet stärkeres bereits realisiertes Wachstum. Es ist keine Prognose."
    },
    momentum: {
      label: "Kursstärke",
      question: "Wie hat sich der Kurs im Vergleich zum Markt entwickelt?",
      plain: "Kursstärke misst die Kursentwicklung über mehrere Zeiträume und den Abstand zu wichtigen Trendbereichen.",
      higherMeans: "Höher bedeutet stärkere bisherige Marktbestätigung. Es ist keine Vorhersage."
    },
    value: {
      label: "Bewertung",
      question: "Was bezahle ich für das, was das Unternehmen verdient?",
      plain: "Bewertung setzt den Börsenwert ins Verhältnis zu Gewinn, Zahlungsfluss, Umsatz und Eigenkapital.",
      higherMeans: "Höher bedeutet günstiger bewertet im Vergleich zum Universum. Es ist keine Aussage über einen fairen Preis."
    },
    profitability: {
      label: "Profitabilität",
      question: "Wie viel bleibt vom Geschäft übrig?",
      plain: "Profitabilität misst, wie viel Ertrag ein Unternehmen aus seinem eingesetzten Kapital und seinem Umsatz erzielt.",
      higherMeans: "Höher bedeutet stärkere laufende Ertragskraft. Es ist keine Empfehlung."
    },
    revisions: {
      label: "Erwartungstrend",
      question: "Werden die Erwartungen der Analysten angehoben oder gesenkt?",
      plain: "Erwartungstrend misst, wie sich die Gewinnschätzungen von Analysten in den letzten Monaten verändert haben.",
      higherMeans: "Höher bedeutet steigende Erwartungen. Dieser Faktor benötigt eine lizenzierte Datenquelle."
    },
    risk: {
      label: "Risiko",
      question: "Wie stark hat der Kurs bisher geschwankt?",
      plain: "Risiko misst Schwankungsbreite und die größten zwischenzeitlichen Verluste der Vergangenheit.",
      higherMeans: "Höher bedeutet geringeres beobachtetes Schwankungsrisiko. Vergangene Schwankungen sind keine Verlustprognose."
    }
  };

  /* Typed reason wording. A user must be able to read why something is
     missing without reading the code. */
  var REASON_TEXT = {
    INSUFFICIENT_COMPONENTS: "Zu wenige Einzelkennzahlen erfüllen die Methodik. Der Faktorwert bleibt geschlossen; die vorhandenen Kennzahlen stehen als Evidenz darunter.",
    INSUFFICIENT_WEIGHTED_COVERAGE: "Die vorhandenen Einzelkennzahlen decken zu wenig Gewicht der Methodik ab. Der Faktorwert bleibt geschlossen; die vorhandenen Kennzahlen stehen als Evidenz darunter.",
    MANDATORY_COMPONENT_MISSING: "Eine in der Methodik zwingende Kennzahl fehlt. Es wird kein Ersatzwert gebildet.",
    INPUT_NOT_MATERIALIZED: "Der benötigte Eingabewert ist in der bestehenden Datenplattform noch nicht materialisiert.",
    PEER_GROUP_UNAVAILABLE: "Keine Vergleichsgruppe erreicht die methodisch geforderte Mindestgröße.",
    SECTOR_TEMPLATE_MISSING: "Die allgemeine Formel gilt für diese Branche nicht. Eine eigene, versionierte Branchenvorlage existiert noch nicht.",
    BLOCKED_EXTERNAL: "Es liegt keine lizenzierte, zeitpunktgenaue Datenquelle vor. Ein Ersatz wäre erfunden und wird nicht gebildet.",
    IDENTITY_UNRESOLVED: "Für diesen Titel besteht keine eindeutige kanonische Emittenten-Zuordnung.",
    FUNDAMENTALS_UNAVAILABLE: "Für diesen Titel liegt keine zeitpunktsichere Geschäftszahlen-Beobachtung vor.",
    PRICE_FACTORS_UNAVAILABLE: "Für diesen Titel liegt keine zertifizierte Kursfaktor-Zeile vor."
  };

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }

  function band(score) {
    if (!finite(score)) return null;
    for (var i = 0; i < BANDS.length; i += 1) if (score >= BANDS[i].min) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }

  function confidenceBand(value) {
    if (!finite(value)) return null;
    for (var i = 0; i < CONFIDENCE_BANDS.length; i += 1) if (value >= CONFIDENCE_BANDS[i].min) return CONFIDENCE_BANDS[i];
    return CONFIDENCE_BANDS[CONFIDENCE_BANDS.length - 1];
  }

  /* ---------------------------------------------------------------------
     Cross-sectional normalization.

     Winsorization at the 2nd/98th percentile and deterministic midrank
     percentiles, exactly as quant-v2.0.0 normalization describes. Ties
     share their average rank so that two identical inputs can never be
     ordered by array position. Counts and binaries are excluded from
     winsorization by the caller.
     --------------------------------------------------------------------- */
  function percentileOf(sorted, fraction) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var position = fraction * (sorted.length - 1),
      lower = Math.floor(position),
      upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function winsorBounds(values) {
    var sorted = values.filter(finite).slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) return null;
    return { low: percentileOf(sorted, 0.02), high: percentileOf(sorted, 0.98), count: sorted.length };
  }

  function clamp(value, bounds) {
    if (!bounds || !finite(value)) return value;
    if (value < bounds.low) return bounds.low;
    if (value > bounds.high) return bounds.high;
    return value;
  }

  /* Deterministic midrank percentile in [0,100]. direction "lower" means a
     lower input is the better outcome and is inverted here, never later. */
  function midrankPercentiles(values, direction) {
    var indexed = [];
    values.forEach(function (value, index) { if (finite(value)) indexed.push({ value: value, index: index }); });
    var out = values.map(function () { return null; });
    if (indexed.length < 2) {
      indexed.forEach(function (entry) { out[entry.index] = 50; });
      return out;
    }
    indexed.sort(function (a, b) { return a.value - b.value || a.index - b.index; });
    var i = 0;
    while (i < indexed.length) {
      var j = i;
      while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
      var midrank = (i + j) / 2,
        percentile = (midrank / (indexed.length - 1)) * 100;
      for (var k = i; k <= j; k += 1) out[indexed[k].index] = percentile;
      i = j + 1;
    }
    if (direction === "lower") {
      out = out.map(function (value) { return finite(value) ? 100 - value : null; });
    }
    return out;
  }

  /* Peer blend, quant-v2.0.0 normalization.peerBlend. Universe-only is an
     allowed fallback and always carries a confidence penalty. */
  function blend(peerPercentile, universePercentile, peerLevel) {
    if (peerLevel === "universe" || !finite(peerPercentile)) {
      return finite(universePercentile) ? universePercentile : null;
    }
    if (!finite(universePercentile)) return peerPercentile;
    return 0.70 * peerPercentile + 0.30 * universePercentile;
  }

  /* ---------------------------------------------------------------------
     Factor assembly against a factor contract taken from quant-v2.json.
     The contract decides; this function only applies it.
     --------------------------------------------------------------------- */
  function assembleFactor(contract, components) {
    var available = components.filter(function (component) { return component.state === "AVAILABLE" && finite(component.score); }),
      availableWeight = available.reduce(function (sum, component) { return sum + component.weight; }, 0),
      requirements = contract.minimumDataRequirements || {},
      minimumComponents = requirements.minimumComponents || 1,
      minimumWeight = requirements.minimumOriginalWeight || 0;

    if (!available.length) return { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null, availableWeight: 0 };
    if (available.length < minimumComponents) return { state: "UNAVAILABLE", reason: "INSUFFICIENT_COMPONENTS", score: null, availableWeight: availableWeight };
    if (availableWeight + 1e-9 < minimumWeight) return { state: "UNAVAILABLE", reason: "INSUFFICIENT_WEIGHTED_COVERAGE", score: null, availableWeight: availableWeight };

    /* factorFormula: sum(componentWeight*componentScore)/sum(availableComponentWeight).
       Renormalization happens only inside the factor and is disclosed as
       availableWeight; it never crosses a factor boundary. */
    var weighted = available.reduce(function (sum, component) { return sum + component.weight * component.score; }, 0);
    return { state: "AVAILABLE", reason: null, score: weighted / availableWeight, availableWeight: availableWeight };
  }

  /* quant-v2.0.0 confidence. Not a probability of success, and stated as
     such wherever it is shown. */
  function confidence(parts) {
    var total = 0;
    Object.keys(CONFIDENCE_WEIGHTS).forEach(function (key) {
      var value = finite(parts[key]) ? Math.max(0, Math.min(100, parts[key])) : 0;
      total += CONFIDENCE_WEIGHTS[key] * value;
    });
    return Math.round(total * 10) / 10;
  }

  /* ---------------------------------------------------------------------
     Artifact validation. A browser must be able to refuse an artifact that
     drifted, rather than render whatever it received.
     --------------------------------------------------------------------- */
  function validShard(payload, shard) {
    if (!payload || payload.schemaVersion !== SHARD_SCHEMA) return false;
    if (payload.methodologyVersion !== METHODOLOGY_VERSION || payload.derivedFrom !== DERIVED_FROM) return false;
    if (shard && payload.shard !== shard) return false;
    if (!payload.publication || payload.publication.compositeAllowed !== false || payload.publication.rankingAllowed !== false) return false;
    if (!payload.securities || typeof payload.securities !== "object") return false;
    return true;
  }

  /* Zeile fuer die gemeinsame Regel-Engine: Spaltenreihenfolge aus dem
     Artefakt, Feldnamen aus dem Katalog. Ein Leser, der die Faktorreihen-
     folge ein zweites Mal annimmt, wuerde genau dann falsch liegen, wenn
     sie sich einmal aendert. */
  function screeningRow(ticker, values, fields) {
    if (!Array.isArray(values) || !Array.isArray(fields) || values.length !== fields.length) return null;
    var row = { ticker: ticker };
    fields.forEach(function (fieldId, index) {
      var value = values[index];
      row[fieldId] = finite(value) ? value : null;
    });
    return row;
  }

  /* WARTET DAS ARTEFAKT NOCH AUF DEN NEUBAU, ODER IST ES KAPUTT?

     Zwei sehr verschiedene Lagen, die ohne diese Unterscheidung
     denselben Fehler ergeben. Nach einem Methodikwechsel traegt das
     veroeffentlichte Artefakt noch die vorige Version - strukturell
     einwandfrei, nur nicht mehr aktuell. Das ist ein Zustand mit einem
     Ablaufdatum ("der naechste Lauf holt es nach") und keine
     Datenstoerung.

     Ein Artefakt, dessen Aufbau nicht stimmt, ist etwas anderes, und
     beides gleich zu melden hiesse, bei jedem Versionswechsel einen
     Defekt anzuzeigen - bis niemand mehr hinschaut. */
  function screeningVersionState(payload) {
    if (!payload || payload.schemaVersion !== SCREENING_SCHEMA || payload.namespace !== NAMESPACE ||
        !Array.isArray(payload.fields) || !payload.fields.length ||
        !payload.rows || typeof payload.rows !== "object" ||
        !payload.publication || payload.publication.compositeAllowed !== false ||
        payload.publication.rankingAllowed !== false) {
      return "INVALID";
    }
    if (payload.methodologyVersion === METHODOLOGY_VERSION && payload.derivedFrom === DERIVED_FROM) {
      return "CURRENT";
    }
    return "SUPERSEDED";
  }

  function validScreening(payload) {
    if (!payload || payload.schemaVersion !== SCREENING_SCHEMA) return false;
    if (payload.methodologyVersion !== METHODOLOGY_VERSION || payload.derivedFrom !== DERIVED_FROM) return false;
    if (payload.namespace !== NAMESPACE) return false;
    if (!payload.publication || payload.publication.compositeAllowed !== false || payload.publication.rankingAllowed !== false) return false;
    if (!Array.isArray(payload.fields) || !payload.fields.length) return false;
    if (!payload.fields.every(function (id) { return id.indexOf(NAMESPACE + ".") === 0; })) return false;
    if (!payload.rows || typeof payload.rows !== "object") return false;
    return true;
  }

  function validSummary(payload) {
    if (!payload || payload.schemaVersion !== SUMMARY_SCHEMA) return false;
    if (payload.methodologyVersion !== METHODOLOGY_VERSION || payload.derivedFrom !== DERIVED_FROM) return false;
    if (!payload.publication || payload.publication.compositeAllowed !== false || payload.publication.rankingAllowed !== false) return false;
    if (!payload.counts || !Number.isSafeInteger(payload.counts.productUniverse)) return false;
    if (!payload.factorStates || typeof payload.factorStates !== "object") return false;
    return true;
  }

  /* A published record must never carry a composite score or a rank. This
     is the gate, not a convention: it is asserted on write and on read. */
  function publicationViolations(record) {
    var errors = [];
    if (!record || typeof record !== "object") return ["record must be an object"];
    ["compositeScore", "quantScore", "score", "rank", "universeRank", "percentileRank"].forEach(function (key) {
      if (record[key] !== undefined) errors.push("forbidden published field '" + key + "'");
    });
    if (record.composite && record.composite.state !== "WITHHELD") errors.push("composite must be WITHHELD while Quant V2 is not active");
    if (record.factors) {
      FACTOR_ORDER.forEach(function (id) {
        var factor = record.factors[id];
        if (!factor) { errors.push("missing factor '" + id + "'"); return; }
        if (FACTOR_STATES.indexOf(factor.state) === -1) errors.push("invalid state for factor '" + id + "'");
        if (factor.state === "AVAILABLE" && !finite(factor.score)) errors.push("available factor '" + id + "' without score");
        if (factor.state !== "AVAILABLE" && finite(factor.score)) errors.push("unavailable factor '" + id + "' must not carry a score");
        if (factor.state !== "AVAILABLE" && FACTOR_REASONS.indexOf(factor.reason) === -1) errors.push("invalid reason for factor '" + id + "'");
      });
      if (Object.keys(record.factors).length !== FACTOR_ORDER.length) errors.push("factor set must be exactly the canonical seven");
    }
    return errors;
  }

  /* ---------------------------------------------------------------------
     Wire format. Component wording, weight, window and contract input are
     identical for every security, so the artifact carries them once in its
     head under componentSpecs and the record carries only measurements.
     hydrate() joins the two back together before anything is rendered.
     --------------------------------------------------------------------- */
  function hydrate(record, head) {
    if (!record) return null;
    var specs = (head && head.componentSpecs) || {},
      weights = (head && head.factorWeights) || {},
      factors = {};
    FACTOR_ORDER.forEach(function (factorId) {
      var factor = record.factors && record.factors[factorId];
      if (!factor) { factors[factorId] = { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null, components: [] }; return; }
      factors[factorId] = Object.assign({}, factor, {
        weight: weights[factorId] !== undefined ? weights[factorId] : null,
        components: (factor.components || []).map(function (component) {
          /* Traegt der Titel eine Branchenvorlage, gilt deren Eintrag: sie
             gewichtet dieselbe Kennzahl anders als die generische Formel
             und nennt eine andere Formelzeile. Ohne Vorlageneintrag bleibt
             es beim generischen - und ein Artefakt ohne Vorlagen verhaelt
             sich Zeichen fuer Zeichen wie vorher. */
          var templateId = record.template && record.template.id,
            spec = (templateId && specs[templateId + ":" + factorId + ":" + component.id]) ||
              specs[factorId + ":" + component.id] || {};
          return Object.assign({}, spec, component);
        })
      });
    });
    return Object.assign({}, record, { factors: factors });
  }

  /* Ordered view for the UI. Never sorted by value: the canonical order is
     part of what the user learns to read. */
  function ordered(record) {
    if (!record || !record.factors) return [];
    return FACTOR_ORDER.map(function (id) {
      var factor = record.factors[id] || { state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", score: null },
        meaning = FACTOR_MEANING[id],
        display = factor.state === "AVAILABLE" ? band(factor.score) : null;
      return {
        id: id,
        label: meaning.label,
        question: meaning.question,
        plain: meaning.plain,
        higherMeans: meaning.higherMeans,
        state: factor.state,
        reason: factor.reason || null,
        reasonText: factor.state === "AVAILABLE" ? null : (REASON_TEXT[factor.reason] || REASON_TEXT.INPUT_NOT_MATERIALIZED),
        score: factor.state === "AVAILABLE" ? factor.score : null,
        band: display ? display.id : null,
        bandLabel: display ? display.label : "Nicht verfügbar",
        bandPlain: display ? display.plain : null,
        components: Array.isArray(factor.components) ? factor.components : [],
        coverage: finite(factor.availableWeight) ? factor.availableWeight : null,
        confidence: finite(factor.confidence) ? factor.confidence : null,
        confidenceBand: confidenceBand(factor.confidence),
        peer: factor.peer || null
      };
    });
  }

  /* One sentence a beginner can act on, built only from what is available.
     It states position and gaps; it never advises. */
  function summarySentence(record) {
    var factors = ordered(record).filter(function (factor) { return factor.state === "AVAILABLE"; });
    if (!factors.length) return "Für diesen Titel liegt derzeit keine auswertbare Faktor-Evidenz vor.";
    var sorted = factors.slice().sort(function (a, b) { return b.score - a.score; }),
      strongest = sorted[0],
      weakest = sorted[sorted.length - 1],
      parts = [];
    parts.push(strongest.label + " ist mit " + strongest.bandLabel.toLowerCase() + " die klarste Stärke.");
    if (sorted.length > 1 && weakest.id !== strongest.id) parts.push(weakest.label + " ist mit " + weakest.bandLabel.toLowerCase() + " die klarste Schwäche.");
    var missing = ordered(record).filter(function (factor) { return factor.state !== "AVAILABLE"; });
    if (missing.length) parts.push(missing.length + " von 7 Faktoren bleiben ohne Wert, weil ihre Daten die Methodik nicht erfüllen.");
    return parts.join(" ");
  }

  var api = {
    METHODOLOGY_VERSION: METHODOLOGY_VERSION,
    DERIVED_FROM: DERIVED_FROM,
    SHARD_SCHEMA: SHARD_SCHEMA,
    SUMMARY_SCHEMA: SUMMARY_SCHEMA,
    SCREENING_SCHEMA: SCREENING_SCHEMA,
    SNAPSHOT_SCHEMA: SNAPSHOT_SCHEMA,
    SNAPSHOT_INDEX_SCHEMA: SNAPSHOT_INDEX_SCHEMA,
    NAMESPACE: NAMESPACE,
    FACTOR_ORDER: FACTOR_ORDER.slice(),
    FACTOR_STATES: FACTOR_STATES.slice(),
    FACTOR_REASONS: FACTOR_REASONS.slice(),
    COMPONENT_STATES: COMPONENT_STATES.slice(),
    BANDS: BANDS.map(function (entry) { return Object.assign({}, entry); }),
    CONFIDENCE_BANDS: CONFIDENCE_BANDS.map(function (entry) { return Object.assign({}, entry); }),
    CONFIDENCE_WEIGHTS: Object.assign({}, CONFIDENCE_WEIGHTS),
    FACTOR_MEANING: JSON.parse(JSON.stringify(FACTOR_MEANING)),
    REASON_TEXT: Object.assign({}, REASON_TEXT),
    band: band,
    confidenceBand: confidenceBand,
    winsorBounds: winsorBounds,
    clamp: clamp,
    midrankPercentiles: midrankPercentiles,
    blend: blend,
    assembleFactor: assembleFactor,
    confidence: confidence,
    validShard: validShard,
    validSummary: validSummary,
    validScreening: validScreening,
    screeningVersionState: screeningVersionState,
    screeningRow: screeningRow,
    publicationViolations: publicationViolations,
    hydrate: hydrate,
    ordered: ordered,
    summarySentence: summarySentence
  };

  if (isNode) module.exports = api;
  else global.VUFactorEvidence = api;
})(typeof window !== "undefined" ? window : globalThis);
