/* =========================================================================
   VISION UNIVERSE SOCIAL — signals.js
   SOCIAL SIGNAL LAYER (§4) UND VU ALS CONTENT BRAIN (§3)

   Die Bruecke zwischen dem, was Vision Universe bereits weiss, und dem,
   was daraus ein Beitrag werden koennte.

   DIE WICHTIGSTE AUSSAGE DIESER DATEI

   Vision Universe ist fuer das Social-System keine externe Website. Ein
   neues 52-Wochen-Hoch in der Technical Intelligence ist kein Fund einer
   Recherche — es ist ein EREIGNIS IM EIGENEN HAUS, und es erreicht das
   Social-System ueber einen Contract und nicht ueber einen Crawler.

   FUENF KLASSEN (§4)

     INTERNAL         VU-Daten und -Intelligence
     MARKET           Marktbewegungen, Unternehmen, Ereignisse
     NEWS             Nachrichten
     SOCIAL           oeffentliche Trends, soweit Lizenz und API es erlauben
     OWN_PERFORMANCE  die eigene Wirkung

   WAS ES HEUTE GIBT UND WAS NICHT

   INTERNAL und MARKET lassen sich aus dem bestehenden Repository
   speisen — die Artefakte liegen unter quant/data/**. NEWS, SOCIAL und
   AUDIENCE brauchen Quellen, die es noch nicht gibt. Sie sind hier
   DEFINIERT und melden UNAVAILABLE (§45). Sie liefern keine Platzhalter
   und keine erfundenen Trends.

   PROVENANCE IST PFLICHT (§28)

   Ein Signal ohne Herkunft wird nicht angenommen. Nicht "mit Warnung
   angenommen" — nicht angenommen. Alles, was spaeter im Text steht, haengt
   an dieser Kette.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema    = isNode ? require("./schema.js")    : global.VUSocialSchema;
  var Untrusted = isNode ? require("./untrusted.js") : global.VUSocialUntrusted;
  var Hash      = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  /* Die internen Ereignistypen, die zu Signalen werden. Sie entsprechen
     den Bereichen aus §3 und sind bewusst als DATEN und nicht als Code
     gefuehrt: ein neuer VU-Bereich ist dann ein Eintrag, kein Umbau. */
  var INTERNAL_EVENT_TYPES = {
    NEW_52W_HIGH:        { label: "Neues 52-Wochen-Hoch",      class: "MARKET",   sensitivity: "TIMELY",   needsNumber: true },
    NEW_52W_LOW:         { label: "Neues 52-Wochen-Tief",      class: "MARKET",   sensitivity: "TIMELY",   needsNumber: true },
    MOMENTUM_SHIFT:      { label: "Momentum-Wechsel",          class: "INTERNAL", sensitivity: "TIMELY",   needsNumber: true },
    QUANT_SCORE_JUMP:    { label: "Sprung im Quant Score",     class: "INTERNAL", sensitivity: "TIMELY",   needsNumber: true },
    EARNINGS_RELEASE:    { label: "Geschaeftszahlen",          class: "MARKET",   sensitivity: "BREAKING", needsNumber: true },
    VALUATION_EXTREME:   { label: "Bewertungsextrem",          class: "INTERNAL", sensitivity: "EVERGREEN",needsNumber: true },
    REGIME_CHANGE:       { label: "Wechsel des Marktregimes",  class: "MARKET",   sensitivity: "TIMELY",   needsNumber: true },
    RANKING_ENTRY:       { label: "Neueintritt in ein Ranking",class: "INTERNAL", sensitivity: "TIMELY",   needsNumber: true },
    TECHNICAL_SETUP:     { label: "Technisches Setup",         class: "INTERNAL", sensitivity: "TIMELY",   needsNumber: true },
    FUNDAMENTAL_TREND:   { label: "Fundamentale Entwicklung",  class: "INTERNAL", sensitivity: "EVERGREEN",needsNumber: true },
    SECTOR_ROTATION:     { label: "Sektorrotation",            class: "MARKET",   sensitivity: "TIMELY",   needsNumber: true },
    BRIEFING_HIGHLIGHT:  { label: "Kernaussage aus dem Briefing", class: "INTERNAL", sensitivity: "TIMELY", needsNumber: false }
  };

  /* -------------------------------------------------------------------
     WELCHE EREIGNISSE EINE URSACHE MITBRINGEN

     Ein Beitrag, der "warum bewegt sich X" verspricht, braucht ein
     Ereignis, das eine Bewegung UND einen Anlass kennt. Geschaeftszahlen
     sind so ein Anlass. Ein technischer Score ist keiner: er beschreibt
     eine Lage, und die Lage ist nicht ihr eigener Grund.

     Der Unterschied ist nicht akademisch. Der erste echte Kandidat trug
     den Archetyp EXPLAIN_THE_MOVE fuer einen Text, der keine Bewegung
     erklaert — und genau dieses Etikett waere spaeter als Evidenz
     zitiert worden: "EXPLAIN_THE_MOVE erreicht n Reichweite". Gemessen
     worden waere etwas anderes.
     ------------------------------------------------------------------- */
  var CAUSAL_EVENT_TYPES = [
    "EARNINGS_RELEASE",   /* ein Ereignis mit Datum und Inhalt */
    "REGIME_CHANGE",      /* ein benennbarer Wechsel */
    "SECTOR_ROTATION",    /* eine Verschiebung zwischen Gruppen */
    "MOMENTUM_SHIFT"      /* ein Wechsel, kein Zustand */
  ];

  function providesCause(eventType) {
    return CAUSAL_EVENT_TYPES.indexOf(String(eventType)) !== -1;
  }

  /* -------------------------------------------------------------------
     WOVON EIN EREIGNIS HANDELT

     Die Archetyp-Eignung kannte bisher zwei Fragen: wie dringend, und
     gibt es eine Zahl. Beides sagt nichts darueber, WOVON der Beitrag
     handeln wuerde.

     Die Folge war im ersten echten Kandidaten zu sehen: ein technischer
     Score zu XOM bekam den Archetyp FUTURE_TECHNOLOGY — zulaessig, weil
     der TIMELY ist und keine Zahl braucht. Das Etikett waere dann als
     Evidenz zitiert worden ("FUTURE_TECHNOLOGY erreicht n Reichweite"),
     und gemessen worden waere eine Kurskarte.

     Die Praemisse ist kein Themenklassifikator. Sie sagt nur, welcher
     ART der Anlass ist — und das weiss der Ereignistyp.
     ------------------------------------------------------------------- */
  var EVENT_PREMISE = {
    NEW_52W_HIGH:        "SECURITY_METRIC",
    NEW_52W_LOW:         "SECURITY_METRIC",
    MOMENTUM_SHIFT:      "SECURITY_METRIC",
    QUANT_SCORE_JUMP:    "SECURITY_METRIC",
    VALUATION_EXTREME:   "SECURITY_METRIC",
    RANKING_ENTRY:       "SECURITY_METRIC",
    TECHNICAL_SETUP:     "SECURITY_METRIC",
    FUNDAMENTAL_TREND:   "SECURITY_METRIC",
    EARNINGS_RELEASE:    "EVENT",
    REGIME_CHANGE:       "MARKET_STATE",
    SECTOR_ROTATION:     "MARKET_STATE",
    BRIEFING_HIGHLIGHT:  "CONCEPT"
  };

  function premiseOf(eventType) {
    return EVENT_PREMISE[String(eventType)] || null;
  }

  /* Quellen, die es geben WIRD, aber heute nicht gibt. Sie stehen hier,
     damit die Health-Matrix sie nennen kann — eine Quelle, die im Bericht
     fehlt, wird nicht vermisst. */
  var PLANNED_SOURCES = {
    "signals.news":   { label: "Nachrichtensignale",
                        blockedBy: "Kein lizenzierter News-Provider angebunden.",
                        contract: "NewsDataProvider (quant/engines/provider.js) ist bereits definiert." },
    "signals.social": { label: "Externe Social-Signale",
                        blockedBy: "Keine Plattform-API mit Trenddaten angebunden; Lizenz- und " +
                                   "Plattformregeln sind vorher zu klaeren.",
                        contract: "SocialAudienceProvider liefert Kommentare; oeffentliche Trends brauchen " +
                                  "eine eigene Quelle." },
    "signals.audience": { label: "Publikumssignale",
                        blockedBy: "Setzt veroeffentlichte Beitraege mit Kommentaren voraus.",
                        contract: "SocialAudienceProvider.getComments()" }
  };

  function fail(m) { throw new Error("VUSocialSignals: " + m); }

  /**
   * Wandelt ein internes VU-Ereignis in ein Signal.
   *
   * @param event {
   *   type, entity, metric, value, unit, observedAt,
   *   source, provider, state, strength (0..1), context
   * }
   */
  function fromInternalEvent(event, options) {
    options = options || {};
    event = event || {};
    var definition = INTERNAL_EVENT_TYPES[event.type];
    if (!definition) {
      return { ok: false, signal: null,
               reason: "Unbekannter interner Ereignistyp '" + event.type + "'. " +
                       "Neue Typen werden in INTERNAL_EVENT_TYPES eingetragen, nicht improvisiert." };
    }
    if (!event.source) {
      return { ok: false, signal: null,
               reason: "Signal ohne Herkunft wird nicht angenommen (§28)." };
    }
    if (definition.needsNumber && (event.value === null || event.value === undefined)) {
      return { ok: false, signal: null,
               reason: definition.label + " ohne Zahl ist keine Aussage. Ein Beitrag darueber " +
                       "haette nichts zu belegen (§27)." };
    }

    var provenance = [Schema.sourceRef({
      source: event.source,
      provider: event.provider || null,
      entity: event.entity || null,
      metric: event.metric || null,
      value: event.value === undefined ? null : event.value,
      unit: event.unit || null,
      observedAt: event.observedAt || null,
      state: event.state || "VERIFIED",
      confidence: event.confidence === undefined ? null : event.confidence
    })];

    var topic = event.topic || (definition.label + (event.entity ? " — " + event.entity : ""));

    var signal = Schema.trendSignal({
      signalId: Hash.prefixedHash("sig", {
        type: event.type, entity: event.entity || null,
        observedAt: event.observedAt || null, metric: event.metric || null
      }),
      signalClass: definition.class,
      topic: topic,
      entities: event.entity ? [event.entity] : [],
      observedAt: event.observedAt || options.now || new Date().toISOString(),
      measures: {
        /* Ein internes Ereignis hat kein Erwaehnungsvolumen. Das Feld
           bleibt null — es wird NICHT mit der Signalstaerke gefuellt,
           sonst rechnet die Trend-Engine mit einer Zahl, die etwas
           anderes bedeutet. */
        volume: null, volumePrior: null, volumePriorPrior: null,
        engagement: null, platforms: []
      },
      provenance: provenance
    });

    return {
      ok: true,
      signal: signal,
      /* Was die Opportunity Engine zusaetzlich braucht. Es haengt am
         Signal, statt darin zu stehen: die Staerke ist eine Bewertung,
         keine Beobachtung. */
      internal: {
        eventType: event.type,
        label: definition.label,
        timeSensitivity: definition.sensitivity,
        hasNumbers: event.value !== null && event.value !== undefined,
        /* Bringt dieses Ereignis einen ANLASS mit, oder nur einen
           Zustand? Ein technischer Score beschreibt eine Lage, und die
           Lage ist nicht ihr eigener Grund. */
        hasCause: providesCause(event.type),
        premise: premiseOf(event.type),
        strength: Schema.numberOrNull(event.strength),
        context: event.context || null
      },
      reason: null
    };
  }

  /**
   * Nimmt ein externes Social-Signal an. Der Text ist UNTRUSTED und wird
   * als solcher markiert und geprueft (§50).
   */
  function fromExternalSignal(raw, options) {
    options = options || {};
    raw = raw || {};
    if (!raw.source) {
      return { ok: false, signal: null, reason: "Externes Signal ohne Herkunft wird nicht angenommen." };
    }
    if (!raw.topic) {
      return { ok: false, signal: null, reason: "Externes Signal ohne Thema." };
    }

    var findings = raw.text ? Untrusted.detect(raw.text) : [];
    var signal = Schema.trendSignal({
      signalId: Hash.prefixedHash("sig", { source: raw.source, topic: raw.topic, at: raw.observedAt || null }),
      signalClass: "SOCIAL",
      topic: raw.topic,
      entities: Array.isArray(raw.entities) ? raw.entities : [],
      observedAt: raw.observedAt || options.now || new Date().toISOString(),
      measures: {
        volume: raw.volume, volumePrior: raw.volumePrior, volumePriorPrior: raw.volumePriorPrior,
        engagement: raw.engagement,
        platforms: Array.isArray(raw.platforms) ? raw.platforms : []
      },
      provenance: [Schema.sourceRef({
        source: raw.source, provider: raw.provider || null,
        observedAt: raw.observedAt || null,
        state: raw.state || "VERIFIED"
      })],
      untrustedText: raw.text ? Untrusted.sanitize(raw.text) : null
    });

    return {
      ok: true,
      signal: signal,
      injectionFindings: findings,
      reason: findings.length
        ? "Das Signal wurde angenommen, der Belegtext enthaelt jedoch " + findings.length +
          " Auffaelligkeit(en): " + findings.join(", ") + ". Die Glaubwuerdigkeit sinkt entsprechend."
        : null
    };
  }

  /**
   * Der Zustand einer geplanten, aber nicht vorhandenen Quelle.
   * §45: sie meldet UNAVAILABLE und liefert keine Platzhalter.
   */
  function plannedSourceStatus(sourceId) {
    var planned = PLANNED_SOURCES[sourceId];
    if (!planned) fail("unbekannte geplante Quelle: " + sourceId);
    return {
      component: sourceId,
      label: planned.label,
      state: "UNAVAILABLE",
      dataSource: null,
      lastSuccessAt: null,
      failureMode: planned.blockedBy,
      nextAction: planned.contract,
      detail: "Diese Quelle ist definiert, aber nicht angebunden. Sie liefert keine Daten und " +
              "gibt keine vor."
    };
  }

  /**
   * Fasst Signale zu Themen zusammen. Zwei Signale zum selben Unternehmen
   * am selben Tag sind ein Thema mit zwei Belegen — nicht zwei Themen.
   */
  function cluster(signals, options) {
    options = options || {};
    var byKey = Object.create(null);
    (signals || []).forEach(function (s) {
      /* Der Schluessel ist die Entitaet, ersatzweise das Thema: "NVDA"
         bindet ein 52-Wochen-Hoch und einen Momentum-Wechsel zusammen. */
      var key = (s.entities && s.entities.length ? s.entities[0] : s.topic).toUpperCase();
      (byKey[key] = byKey[key] || []).push(s);
    });

    return Object.keys(byKey).map(function (key) {
      var group = byKey[key];
      var classes = Array.from(new Set(group.map(function (s) { return s.signalClass; })));
      return {
        key: key,
        topic: group[0].topic,
        entities: Array.from(new Set(group.reduce(function (acc, s) { return acc.concat(s.entities); }, []))),
        signalIds: group.map(function (s) { return s.signalId; }),
        signalClasses: classes,
        /* Mehrere Klassen auf dasselbe Thema sind das staerkste Muster,
           das dieses System kennt: aussen und innen zeigen dasselbe. */
        confirmedAcrossClasses: classes.length > 1,
        earliestObservedAt: group.map(function (s) { return s.observedAt; })
          .filter(Boolean).sort()[0] || null,
        provenance: group.reduce(function (acc, s) { return acc.concat(s.provenance || []); }, [])
      };
    }).sort(function (a, b) { return b.signalIds.length - a.signalIds.length; });
  }

  var api = {
    INTERNAL_EVENT_TYPES: INTERNAL_EVENT_TYPES,
    CAUSAL_EVENT_TYPES: CAUSAL_EVENT_TYPES,
    providesCause: providesCause,
    EVENT_PREMISE: EVENT_PREMISE,
    premiseOf: premiseOf,
    PLANNED_SOURCES: PLANNED_SOURCES,
    fromInternalEvent: fromInternalEvent,
    fromExternalSignal: fromExternalSignal,
    plannedSourceStatus: plannedSourceStatus,
    cluster: cluster
  };

  if (isNode) module.exports = api;
  else global.VUSocialSignals = api;
})(typeof window !== "undefined" ? window : globalThis);
