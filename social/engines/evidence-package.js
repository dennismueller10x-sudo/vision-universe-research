/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/evidence-package.js

   DAS KANONISCHE EVIDENZPAKET

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Der erste Kandidat sagte: "XOM, 76 im Technical Opportunity Score."
   Mehr ging nicht, weil mehr nicht da war: der Signalsammler hatte aus
   dem technischen Bundle genau eine Zahl herausgezogen.

   76 wovon bis wovon? Woraus setzt sich der Wert zusammen? Ist er eine
   Wahrscheinlichkeit? Der Leser konnte es nicht wissen, und ein
   Creative Agent haette es sich ausgedacht.

   Im Bundle stand das alles. Es wurde nur nie mitgenommen:

     score 76, interpretation "methodology_rank", isProbability FALSE
     Band "Konstruktiv" ab 60
     Beitraege je Familie samt Maximum
     Trend BULLISH, 82.3 — mit fertig formulierten Belegsaetzen
     Momentum STRONG_POSITIVE, 12M +47.6 %
     Volatilitaet NORMAL, ATR 2.14 % (Perzentil 43)
     Volumen NORMAL, relativ 0.83x
     Relative Staerke UNAVAILABLE — "Benchmark nicht verfuegbar"
     Disclaimer: "Keine Wahrscheinlichkeit, keine Renditeerwartung."

   -------------------------------------------------------------------------
   WAS DIESES PAKET IST
   -------------------------------------------------------------------------

   Eine kanonische, versionierte Sammlung von Evidence Objects zwischen
   Signal/Gelegenheit und Authoring Brief. Jedes Objekt traegt seinen
   Wert, seinen Satz, seine Quelle, seinen Stand und seinen Zustand.

   Und — genauso wichtig — die NICHT verfuegbaren Dimensionen stehen
   ausdruecklich drin, mit Grund. Ein Autor, der nur sieht, was da ist,
   haelt das Fehlende fuer nicht existent und fuellt es.

   -------------------------------------------------------------------------
   WAS ES NICHT IST
   -------------------------------------------------------------------------

   Keine zweite Datenquelle. Es liest, was die Quant-Schicht erzeugt
   hat, und rechnet nichts nach. Wo dort UNAVAILABLE steht, steht hier
   UNAVAILABLE — und nicht ein Ersatzwert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;
  var German = isNode ? require("./german-text.js") : global.VUSocialGermanText;

  /* Die Dimensionen, nach denen ein Beitrag erzaehlen kann. Jede ist
     entweder belegt oder ausdruecklich nicht — ein Dazwischen gibt es
     nicht. */
  var DIMENSIONS = [
    "SCORE", "TREND", "MOMENTUM", "RELATIVE_STRENGTH", "VOLATILITY",
    "VOLUME", "STRUCTURE", "PRICE", "SETUP"
  ];

  function pct(x, stellen) {
    if (x === null || x === undefined || !isFinite(x)) return null;
    var f = Math.pow(10, stellen === undefined ? 1 : stellen);
    return Math.round(x * 100 * f) / f;
  }

  /* -------------------------------------------------------------------
     DIE SCHREIBUNG DER BELEGSAETZE

     Die Quant-Daten sind ASCII: "TREND_STRUCTURE traegt 27.35 von 30
     Punkten bei". Solange diese Saetze nur gerechnet wurden, war das
     folgenlos. Seit sie an den Autor gehen, sind sie Rohstoff fuer
     veroeffentlichten Text — und "traegt" auf einem deutschen
     Markenkonto ist ein Fehler.

     Repariert wird hier, an der einen Stelle, durch die jeder Beleg
     laeuft. Der Eingriff ist rein orthografisch: keine Zahl, keine
     Kennung und keine Aussage aendert sich.

     Was das Woerterbuch nicht kennt, wird nicht geraten, sondern
     gemeldet. `statementResidue` traegt es bis in die Gates.
     ------------------------------------------------------------------- */
  function ev(spec) {
    var roh = spec.statement;
    var sauber = German.clean(roh);
    var geaendert = (sauber.text !== roh);

    return {
      id: spec.id,
      dimension: spec.dimension,
      statement: sauber.text,
      /* Nur wenn wirklich etwas geaendert wurde. Sonst waere es ein
         zweites Feld mit demselben Inhalt. */
      statementVerbatim: geaendert ? roh : null,
      statementResidue: sauber.residue.length ? sauber.residue : null,
      value: spec.value === undefined ? null : spec.value,
      unit: spec.unit || null,
      /* Beschreibt dieser Beleg eine ENTWICKLUNG ueber Zeit? Der Brief
         verbietet sonst Aussagen ueber Verlaeufe — zu Recht, solange nur
         ein Stand vorliegt. Liegen Horizonte vor, waere dasselbe Verbot
         ein Widerspruch zum mitgelieferten Beleg. */
      temporal: spec.temporal === true,
      /* -----------------------------------------------------------------
         TRAEGT DIESER SATZ DIE EINORDNUNG?

         Das Sufficiency-Tor verlangt, dass die Leitaussage eines
         Pakets erklaert wird - "eine Zahl ohne ihre Bedeutung ist der
         Anfang jeder Fehlinterpretation". Es erkannte diese Saetze
         bisher an ZWEI festen Kennungen aus dem Quant-Bundle. Damit
         konnte nur ein Paket dieser einen Bauart das Tor je bestehen;
         jedes andere scheiterte daran, dass es anders heisst - nicht
         daran, dass ihm die Einordnung fehlt.

         Also sagt der Satz es jetzt selbst. Die Bedingung bleibt
         dieselbe, sie fragt nur nicht mehr nach dem Namen. */
      interpretation: spec.interpretation === true,
      entity: spec.entity || null,
      metric: spec.metric || null,
      source: spec.source || null,
      observedAt: spec.observedAt || null,
      state: spec.state || "VERIFIED",
      /* Woher genau im Bundle — damit sich jede Aussage zurueckverfolgen
         laesst, ohne das Bundle zu durchsuchen. */
      pointer: spec.pointer || null
    };
  }

  /**
   * Baut das Paket aus einem technischen Bundle.
   *
   * @param bundle    quant/data/technical/instruments/<SYM>.json .bundle
   * @param options   { entity, source, now }
   */
  function fromTechnicalBundle(bundle, options) {
    options = options || {};
    if (!bundle) {
      return { ok: false, reason: "noBundle",
        message: "Kein technisches Bundle. Ohne Bundle gibt es keine Evidenz." };
    }

    var entity = options.entity || bundle.instrumentId || null;
    var source = options.source || bundle.source || "vu.technical";
    var asOf = bundle.dataCutoff || bundle.analysisTime || null;

    var evidence = [];
    var unavailable = [];

    /* ------------------------------------------------------- SCORE */
    var os = bundle.opportunityScore || null;
    if (os && typeof os.score === "number") {
      evidence.push(ev({
        id: "score", dimension: "SCORE", entity: entity,
        metric: "Technical Opportunity Score", value: os.score, unit: null,
        source: source, observedAt: asOf, pointer: "/opportunityScore/score",
        statement: "Technical Opportunity Score " + os.score + " von 100" +
          (os.band && os.band.label ? " (Band „" + os.band.label + "“ ab " +
            os.band.min + ")" : "") + "."
      }));

      /* Die Bedeutung der Zahl. Sie ist der Unterschied zwischen einer
         Kennzahl und einer Prozentzahl, die wie eine Chance aussieht. */
      if (os.disclaimer) {
        evidence.push(ev({
          id: "score-meaning", dimension: "SCORE", entity: entity,
          interpretation: true,
          metric: "Bedeutung des Scores", value: null,
          source: source, observedAt: asOf, pointer: "/opportunityScore/disclaimer",
          statement: os.disclaimer
        }));
      }
      if (os.isProbability === false) {
        evidence.push(ev({
          id: "score-not-probability", dimension: "SCORE", entity: entity,
          interpretation: true,
          metric: "Interpretation", value: null,
          source: source, observedAt: asOf, pointer: "/opportunityScore/interpretation",
          statement: "Der Wert ist ein methodischer Rang (" +
            (os.interpretation || "methodology_rank") +
            "), keine Wahrscheinlichkeit und keine Renditeerwartung."
        }));
      }

      /* Woraus er sich zusammensetzt. Ohne das ist eine Punktzahl eine
         Meinung mit Nachkommastelle. */
      var beitraege = os.contributions || {};
      var maxima = os.maxContribution || {};
      Object.keys(beitraege).forEach(function (fam) {
        evidence.push(ev({
          id: "score-contribution-" + fam.toLowerCase(),
          dimension: "SCORE", entity: entity,
          metric: "Beitrag " + fam, value: beitraege[fam], unit: "Punkte",
          source: source, observedAt: asOf,
          pointer: "/opportunityScore/contributions/" + fam,
          statement: fam + " traegt " + beitraege[fam] +
            (maxima[fam] ? " von " + maxima[fam] : "") + " Punkten bei."
        }));
      });

      (os.notes || []).forEach(function (n, i) {
        evidence.push(ev({
          id: "score-note-" + (i + 1), dimension: "SCORE", entity: entity,
          metric: "Hinweis", value: null, source: source, observedAt: asOf,
          pointer: "/opportunityScore/notes/" + i, statement: n
        }));
      });
    } else {
      unavailable.push({ dimension: "SCORE", reason: "Kein Opportunity Score im Bundle." });
    }

    /* ------------------------------------------------------- PREIS */
    var lb = bundle.lastBar || null;
    if (lb && typeof lb.close === "number") {
      evidence.push(ev({
        id: "price-close", dimension: "PRICE", entity: entity,
        metric: "Schlusskurs", value: lb.close, unit: bundle.currency || null,
        source: source, observedAt: lb.timestamp || asOf, pointer: "/lastBar/close",
        statement: "Schlusskurs " + lb.close + " " + (bundle.currency || "") +
          " am " + (lb.timestamp || asOf) + "."
      }));
    } else {
      unavailable.push({ dimension: "PRICE", reason: "Kein Schlusskurs im Bundle." });
    }

    /* ------------------------------------------------------- TREND */
    var t = bundle.trend || null;
    if (t && t.direction && typeof t.trendScore === "number") {
      evidence.push(ev({
        id: "trend", dimension: "TREND", entity: entity,
        metric: "Trend", value: t.trendScore, unit: null,
        source: source, observedAt: asOf, pointer: "/trend/trendScore",
        statement: "Trendrichtung " + t.direction + ", Trendwert " + t.trendScore + "."
      }));
      /* Die fertig formulierten Belegsaetze der Engine. Sie neu zu
         formulieren hiesse, eine zweite Lesart derselben Zahl zu
         erzeugen. */
      (t.evidence || []).slice(0, 4).forEach(function (e, i) {
        if (!e || !e.statement) return;
        evidence.push(ev({
          id: "trend-" + (e.key || i), dimension: "TREND", entity: entity,
          metric: e.key || "Trendbeleg", value: e.value, source: source,
          observedAt: asOf, pointer: "/trend/evidence/" + i, statement: e.statement
        }));
      });
    } else {
      unavailable.push({ dimension: "TREND", reason: "Kein Trendbefund im Bundle." });
    }

    /* ---------------------------------------------------- MOMENTUM */
    var m = bundle.momentum || null;
    if (m && m.state && typeof m.momentumScore === "number") {
      evidence.push(ev({
        id: "momentum", dimension: "MOMENTUM", entity: entity,
        metric: "Momentum", value: m.momentumScore, unit: null,
        source: source, observedAt: asOf, pointer: "/momentum/momentumScore",
        statement: "Momentum " + m.state + ", Wert " + m.momentumScore + "."
      }));
      var h = m.horizons || {};
      ["1M", "3M", "12M"].forEach(function (k) {
        if (!h[k] || typeof h[k].return !== "number") return;
        evidence.push(ev({
          id: "momentum-" + k.toLowerCase(), dimension: "MOMENTUM", entity: entity,
          metric: k + "-Rendite", value: pct(h[k].return), unit: "%", temporal: true,
          source: source, observedAt: asOf, pointer: "/momentum/horizons/" + k + "/return",
          statement: k + "-Entwicklung " + pct(h[k].return) + " %" +
            (typeof h[k].z === "number" ? " (z=" + h[k].z + ")" : "") + "."
        }));
      });
    } else {
      unavailable.push({ dimension: "MOMENTUM", reason: "Kein Momentumbefund im Bundle." });
    }

    /* -------------------------------------------- RELATIVE STAERKE */
    var rs = bundle.relativeStrength || null;
    if (rs && rs.state === "UNAVAILABLE") {
      /* AUSDRUECKLICH. Ein Autor, der nur sieht, was da ist, haelt das
         Fehlende fuer nicht existent — und fuellt es. */
      unavailable.push({ dimension: "RELATIVE_STRENGTH",
        reason: rs.reason || "Relative Staerke nicht verfuegbar.",
        pointer: "/relativeStrength/reason" });
    } else if (rs && typeof rs.rsScore === "number") {
      evidence.push(ev({
        id: "relative-strength", dimension: "RELATIVE_STRENGTH", entity: entity,
        metric: "Relative Staerke", value: rs.rsScore,
        source: source, observedAt: asOf, pointer: "/relativeStrength/rsScore",
        statement: "Relative Staerke " + rs.rsScore + "."
      }));
    } else {
      unavailable.push({ dimension: "RELATIVE_STRENGTH",
        reason: "Kein Befund zur relativen Staerke." });
    }

    /* ------------------------------------------------- VOLATILITAET */
    var vol = bundle.volatility || null;
    if (vol && vol.regime && vol.metrics && typeof vol.metrics.atrPct === "number") {
      evidence.push(ev({
        id: "volatility", dimension: "VOLATILITY", entity: entity,
        metric: "Volatilitaetsregime", value: pct(vol.metrics.atrPct, 2), unit: "%",
        source: source, observedAt: asOf, pointer: "/volatility/metrics/atrPct",
        statement: "Volatilitaet " + vol.regime + ", ATR " +
          pct(vol.metrics.atrPct, 2) + " % des Kurses" +
          (typeof vol.metrics.atrPctPercentile === "number"
            ? " (Perzentil " + Math.round(vol.metrics.atrPctPercentile) + ")" : "") + "."
      }));
    } else {
      unavailable.push({ dimension: "VOLATILITY", reason: "Kein Volatilitaetsbefund." });
    }

    /* ------------------------------------------------------ VOLUMEN */
    var v = bundle.volume || null;
    if (v && v.state && v.metrics && typeof v.metrics.relativeVolume === "number") {
      evidence.push(ev({
        id: "volume", dimension: "VOLUME", entity: entity,
        metric: "Relatives Volumen", value: v.metrics.relativeVolume, unit: "x",
        source: source, observedAt: asOf, pointer: "/volume/metrics/relativeVolume",
        statement: "Volumen " + v.state + ", relativ " + v.metrics.relativeVolume +
          "× zum Median."
      }));
    } else {
      unavailable.push({ dimension: "VOLUME", reason: "Kein Volumenbefund." });
    }

    /* ---------------------------------------------------- STRUKTUR */
    var st = bundle.structure || null;
    if (st && st.state && st.state.trend) {
      evidence.push(ev({
        id: "structure", dimension: "STRUCTURE", entity: entity,
        metric: "Marktstruktur", value: null,
        source: source, observedAt: asOf, pointer: "/structure/state/trend",
        statement: "Marktstruktur " + st.state.trend + "."
      }));
    } else {
      unavailable.push({ dimension: "STRUCTURE", reason: "Kein Strukturbefund." });
    }

    /* Die Datengrundlage selbst ist eine Aussage. */
    if (bundle.analysisLookback && bundle.analysisLookback.bars) {
      evidence.push(ev({
        id: "data-basis", dimension: "SCORE", entity: entity,
        metric: "Datengrundlage", value: bundle.analysisLookback.bars, unit: "Handelstage",
        source: source, observedAt: asOf, pointer: "/analysisLookback/bars",
        statement: "Grundlage sind " + bundle.analysisLookback.bars +
          " Handelstage seit " + bundle.analysisLookback.from + "."
      }));
    }

    var paket = {
      packageVersion: "evidence-package-1.0.0",
      entity: entity,
      asOf: asOf,
      source: source,
      sourceRevision: options.sourceRevision || null,
      methodologyVersion: bundle.methodologyVersion || null,
      dataVersion: bundle.dataVersion || null,
      evidence: evidence,
      unavailable: unavailable,
      dimensionsAvailable: Array.from(new Set(evidence.map(function (e) {
        return e.dimension; }))),
      generatedAt: options.now || null
    };

    paket.packageId = Hash.prefixedHash("evp", {
      entity: entity, asOf: asOf, dataVersion: bundle.dataVersion || null,
      ids: evidence.map(function (e) { return e.id + ":" + e.value; })
    });

    return Object.assign({ ok: true, reason: null }, paket);
  }

  /* -------------------------------------------------------------------
     STORY SUFFICIENCY

     Eine Gelegenheit mit hohem Score ist NICHT automatisch
     veroeffentlichungswuerdig. Ein Beitrag braucht genug voneinander
     unabhaengige belegte Aussagen, um etwas zu erzaehlen — sonst
     entsteht wieder eine Karte mit einer Zahl darauf.

     Geprueft wird die BREITE (wie viele Dimensionen), die TIEFE (wie
     viele belegte Saetze) und die EINORDNUNG (weiss der Leser, was die
     Leitzahl bedeutet?). Die letzte ist die wichtigste: eine Zahl ohne
     ihre Bedeutung ist der Anfang jeder Fehlinterpretation.
     ------------------------------------------------------------------- */
  var SUFFICIENCY_DEFAULTS = {
    minDimensions: 3,
    minStatements: 5,
    requireInterpretation: true,
    requireDatedAnchor: true
  };

  function assessSufficiency(paket, options) {
    var regeln = Object.assign({}, SUFFICIENCY_DEFAULTS, options || {});
    var gruende = [];

    var dims = (paket && paket.dimensionsAvailable) || [];
    var saetze = ((paket && paket.evidence) || []).filter(function (e) {
      return e.statement && String(e.statement).trim(); });

    if (dims.length < regeln.minDimensions) {
      gruende.push("Nur " + dims.length + " belegte Dimension(en); verlangt sind " +
        regeln.minDimensions + ". Aus einer Dimension wird eine Zahl, keine Geschichte.");
    }
    if (saetze.length < regeln.minStatements) {
      gruende.push("Nur " + saetze.length + " belegte Aussage(n); verlangt sind " +
        regeln.minStatements + ".");
    }

    if (regeln.requireInterpretation) {
      var hatBedeutung = saetze.some(function (e) {
        /* Die beiden Kennungen bleiben stehen: Pakete, die vor diesem
           Feld gebaut wurden, sollen weiter gelten. Neue sagen es
           ueber das Feld. */
        return e.interpretation === true ||
          e.id === "score-meaning" || e.id === "score-not-probability"; });
      if (!hatBedeutung) {
        gruende.push("Die Leitzahl hat keine Einordnung. Eine Zahl ohne ihre " +
          "Bedeutung ist der Anfang jeder Fehlinterpretation.");
      }
    }

    if (regeln.requireDatedAnchor) {
      var hatAnker = saetze.some(function (e) {
        return e.value !== null && e.value !== undefined && e.observedAt; });
      if (!hatAnker) {
        gruende.push("Keine datierte Zahl. Ohne Stand ist jede Angabe zeitlos — " +
          "und damit falsch, sobald sie alt wird.");
      }
    }

    return {
      sufficient: gruende.length === 0,
      dimensions: dims.length,
      statements: saetze.length,
      unavailable: ((paket && paket.unavailable) || []).map(function (u) {
        return u.dimension; }),
      reasons: gruende,
      explanation: gruende.length === 0
        ? "Ausreichend belegt: " + dims.length + " Dimensionen, " + saetze.length +
          " Aussagen" +
          (((paket && paket.unavailable) || []).length
            ? "; nicht verfuegbar: " + paket.unavailable.map(function (u) {
                return u.dimension; }).join(", ") : "") + "."
        : gruende.join(" ")
    };
  }

  /* =====================================================================
     DAS PAKET AUS EINEM THEMA DER PLATTE

     `fromTechnicalBundle` war lange der einzige Weg zu einem Paket -
     und er fuehrt ueber genau eine Datei je EINZELWERT. Damit konnte
     nur ein Inhalt ueber einen einzelnen Titel je belegt werden.

     Eine Rangliste aus einer Discover-Reihe traegt ihre Belege
     laengst mit: die Auswahlregel, die Abdeckung, die Kurse der
     Titel, ihre Kennzahlen. Siebzehn Saetze, jeder mit Quelle. Sie
     mussten nur in die kanonische Form gebracht werden, statt eine
     zweite Evidenzarchitektur danebenzustellen.

     ES WIRD NICHTS ERFUNDEN. Diese Funktion rechnet nicht, sie
     uebersetzt: jeder Satz, den sie ausgibt, stand so im Thema. Was
     dort fehlt, fehlt auch hier - und das Sufficiency-Tor sieht es.

     DIE DIMENSION KOMMT AUS DEM BELEG, NICHT AUS SEINEM NAMEN. Ein
     Beleg mit Kennzahl traegt die Kennzahl als Dimension. Ein Beleg
     OHNE Entitaet spricht ueber das Thema als Ganzes - das ist die
     Einordnung. Einer MIT Entitaet und ohne Zahl erzaehlt von einem
     Titel. Diese drei Faelle stehen in den Daten; eine Liste von
     Kennungen haette dagegen beim naechsten neuen Beleg geschwiegen.
     ===================================================================== */
  function fromTopicEvidence(thema, options) {
    options = options || {};
    var t = thema || {};
    var roh = Array.isArray(t.evidence) ? t.evidence : [];

    if (!roh.length) {
      return { ok: false, reason: "NO_EVIDENCE",
        message: "Das Thema \"" + (t.title || t.topicId || "ohne Titel") +
          "\" traegt keine Belege." };
    }

    var asOf = t.asOf || options.asOf || null;
    var evidence = roh.map(function (e, i) {
      var ueberDasGanze = !e.entity;
      var hatZahl = e.value !== null && e.value !== undefined;
      return ev({
        id: e.id || ("topic-" + i),
        dimension: e.metric ? String(e.metric).toUpperCase()
          : (ueberDasGanze ? "EINORDNUNG" : "ERZAEHLUNG"),
        /* Die Einordnung ist der Satz UEBER das Thema, nicht der ueber
           einen einzelnen Titel. Eine Firmenbeschreibung erklaert die
           Leitaussage einer Rangliste nicht. */
        interpretation: ueberDasGanze && !hatZahl,
        entity: e.entity || null,
        metric: e.metric || null,
        value: hatZahl ? e.value : null,
        unit: e.unit || null,
        temporal: e.temporal === true,
        source: e.source || null,
        observedAt: e.observedAt || asOf || null,
        pointer: e.pointer || null,
        statement: e.statement || ""
      });
    }).filter(function (e) { return e.statement && e.statement.trim(); });

    var paket = {
      packageVersion: "evidence-package-1.0.0",
      entity: options.entity || t.title || t.topicId || null,
      asOf: asOf,
      source: options.source || (Array.isArray(t.sources) ? t.sources[0] : null) || null,
      sourceRevision: options.sourceRevision || null,
      methodologyVersion: null,
      dataVersion: null,
      evidence: evidence,
      /* Was dem Thema fehlt, wird nicht verschwiegen - aber auch nicht
         erfunden. Die Platte fuehrt ihre Zurueckweisungen als Zahl;
         eine Dimensionsliste hat sie nicht. */
      unavailable: [],
      dimensionsAvailable: Array.from(new Set(evidence.map(function (e) {
        return e.dimension; }))),
      generatedAt: options.now || null
    };

    paket.packageId = Hash.prefixedHash("evp", {
      entity: paket.entity, asOf: asOf, dataVersion: null,
      ids: evidence.map(function (e) { return e.id + ":" + e.value; })
    });

    return Object.assign({ ok: true, reason: null }, paket);
  }

  /* -------------------------------------------------------------------
     DIE INHALTSKENNUNG

     Sie haengt am Titel und am Datenstand — zwei Belegpakete zum
     selben Titel an verschiedenen Tagen sind verschiedene Inhalte.

     Sie steht HIER und nicht beim Anfragenden, weil zwei Stellen sie
     berechnen: das Skript, das den Creative Request stellt, und der
     Zyklus, der das Ergebnis spaeter sucht. Zwei Rechenwege waeren
     zwei Gelegenheiten zu driften — und eine Drift hiesse, dass der
     Zyklus das fertige Ergebnis nie findet und es niemandem auffaellt.
     ------------------------------------------------------------------- */
  function contentIdFor(entity, asOf) {
    return "vu-" + String(entity || "").toLowerCase() + "-" +
      String(asOf || "").replace(/[^0-9]/g, "").slice(0, 8);
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    SUFFICIENCY_DEFAULTS: SUFFICIENCY_DEFAULTS,
    fromTechnicalBundle: fromTechnicalBundle,
    fromTopicEvidence: fromTopicEvidence,
    assessSufficiency: assessSufficiency,
    contentIdFor: contentIdFor
  };

  if (isNode) module.exports = api;
  else global.VUSocialEvidencePackage = api;
})(typeof window !== "undefined" ? window : globalThis);
