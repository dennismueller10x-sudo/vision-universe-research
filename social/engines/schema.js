/* =========================================================================
   VISION UNIVERSE SOCIAL — schema.js
   KANONISCHES DATENMODELL (§37)

   Die Entitaeten des Social Intelligence OS. Sie sind die gemeinsame
   Sprache aller Komponenten; oberhalb der Adapter-Schicht existiert kein
   plattformspezifisches Feld.

   DIE REGEL DIESER DATEI

   Ein Feld, das nicht bekannt ist, ist `null` — nicht 0, nicht "", nicht
   ein plausibler Standardwert. Die Lehre aus dem Quant-Bereich
   ("Missing != Zero", MASTER §31.5) gilt hier woertlich weiter: eine 0 bei
   `impressions` ist die Aussage "niemand hat es gesehen", ein `null` ist
   die Aussage "wir wissen es nicht". Das sind zwei verschiedene Dinge, und
   eine Learning Engine, die sie verwechselt, lernt Unsinn.

   Validierung laeuft zur Laufzeit, weil das Repository kein TypeScript hat
   und keines bekommt (MASTER §31.12).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* ------------------------------------------------------------------ */
  /* Aufzaehlungen. Alle Zustaende sind geschlossen — ein unbekannter
     Wert ist ein Fehler und kein neuer Zustand.                         */
  /* ------------------------------------------------------------------ */

  /* Lebenszyklus einer Veroeffentlichung (§15). ARCHIVED ist Endzustand,
     FAILED ist es nicht: aus FAILED fuehrt RETRY zurueck in den Lauf. */
  var PUBLICATION_STATES = [
    "IDEA", "DRAFT", "VALIDATED", "READY", "SCHEDULED",
    "PUBLISHING", "PUBLISHED", "FAILED", "RETRY", "ARCHIVED"
  ];

  /* Erlaubte Uebergaenge. Ohne diese Tabelle waere der Lebenszyklus eine
     Absichtserklaerung; mit ihr ist er pruefbar. Ein Uebergang, der hier
     fehlt, findet nicht statt — auch nicht "nur einmal, zum Testen". */
  var PUBLICATION_TRANSITIONS = {
    IDEA:       ["DRAFT", "ARCHIVED"],
    DRAFT:      ["VALIDATED", "DRAFT", "ARCHIVED"],
    VALIDATED:  ["READY", "DRAFT", "ARCHIVED"],
    READY:      ["SCHEDULED", "PUBLISHING", "DRAFT", "ARCHIVED"],
    SCHEDULED:  ["PUBLISHING", "READY", "ARCHIVED"],
    PUBLISHING: ["PUBLISHED", "FAILED"],
    PUBLISHED:  ["ARCHIVED"],
    FAILED:     ["RETRY", "ARCHIVED"],
    RETRY:      ["PUBLISHING", "FAILED", "ARCHIVED"],
    ARCHIVED:   []
  };

  /* Zustand einer Datenaussage (§27). CONFLICTING ist der wichtigste:
     zwei Quellen, zwei Zahlen — das ist nicht "unbekannt", sondern ein
     Widerspruch, den ein Mensch aufloesen muss. */
  var DATA_STATES = ["VERIFIED", "STALE", "UNAVAILABLE", "CONFLICTING"];

  /* Unterstuetzungsgrad einer Plattformfaehigkeit (§8). */
  var SUPPORT_LEVELS = ["SUPPORTED", "PARTIALLY_SUPPORTED", "MANUAL_REQUIRED", "UNAVAILABLE"];

  /* Gesundheitszustaende (§41). UNAVAILABLE heisst "die Quelle existiert
     fuer uns nicht", FAIL heisst "sie existiert und antwortet falsch". */
  var HEALTH_STATES = ["PASS", "WARNING", "FAIL", "UNAVAILABLE"];

  /* Signalklassen (§4). */
  var SIGNAL_CLASSES = ["INTERNAL", "MARKET", "NEWS", "SOCIAL", "OWN_PERFORMANCE", "AUDIENCE"];

  /* Content-Archetypen (§7). Erweiterbar — die Liste ist Konfiguration,
     kein Gesetz; sie steht hier, damit Validierung und Content Memory
     dieselbe Menge kennen. */
  var CONTENT_ARCHETYPES = [
    "BREAKING_MARKET_INSIGHT", "EXPLAIN_THE_MOVE", "FUTURE_TECHNOLOGY",
    "STOCK_STORY", "DATA_STORY", "MYTH_VS_REALITY", "OPPORTUNITY_RISK",
    "EDUCATIONAL", "MARKET_CONTEXT", "CONTRARIAN_INSIGHT",
    "VISUAL_DATA_STORY", "COMPANY_DEEP_DIVE", "WEEKLY_THEME", "TREND_EXPLAINER",
    /* -----------------------------------------------------------------
       DER ARCHETYP, DEN ES FUER DIE GROESSTE FAMILIE NICHT GAB

       Die Content Family RANKING steht seit langem in
       content-universe.js, der Einstiegsvorschlag "list_tension" in
       audience-frame.js, die Bildform COMPARISON in visual.js. Nur ein
       ARCHETYP fehlte - die Liste hier war fuer Formate ueber EINEN
       Titel gebaut.

       Die Folge war im ersten Lauf ueber die Content Ladder zu sehen:
       eine Rangliste ueber zehn Unternehmen bekam erst STOCK_STORY
       (ein Format fuer einen Titel), nach der Formpruefung dann
       DATA_STORY und schliesslich EDUCATIONAL - jedes Mal das erste,
       was uebrig blieb. Gemessen worden waere spaeter "EDUCATIONAL
       erreicht n Reichweite" fuer eine Rangliste.

       Die Zuordnung ist eine redaktionelle Entscheidung (§21). Sie
       steht hier, weil die Daten sie verlangen, und sie ist
       ausdruecklich als solche benannt. */
    "RANKING_LIST"
  ];

  /* Visuelle Strategien (§13). */
  /* GENERATIVE steht neben den gezeichneten Formen und nicht in ihnen:
     ein generatives Bild wird nicht aus einem Bildplan gezeichnet,
     sondern von einem Creative Agent erzeugt und uebernommen. Es als
     DATA_CARD zu fuehren hiesse, dem Lernen eine Bildform beizubringen,
     die nie zu sehen war. */
  /* -------------------------------------------------------------------
     DREI FORMEN, DIE ES GAB, ABER NICHT GEBEN DURFTE

     SCORE, PERFORMANCE und COMPARISON standen seit ihrer Einfuehrung
     in visual.js (mit Datenbedarf), in visual-composition.js (mit
     Layout) und in render-asset.mjs (mit Zeichenzweig) - nur hier
     nicht. Eine Bildform, die drei Stufen bauen koennen und die
     vierte nicht kennt.

     Aufgefallen ist es erst, als der Lauf zum ersten Mal ein Thema
     ueber MEHRERE Titel baute: dort ist keine Zeitreihe verfuegbar,
     die Wahl faellt auf COMPARISON - und das Schema brach den Zyklus
     ab. Solange nur Einzelwerte liefen, gewann immer CHART, und der
     Widerspruch blieb unsichtbar.

     EINE VOKABEL AN ZWEI STELLEN GEHT AUSEINANDER. Ein Test haelt die
     beiden Listen jetzt aneinander (VT1), damit die naechste neue
     Bildform nicht wieder nur an drei von vier Stellen entsteht.
     ------------------------------------------------------------------- */
  var VISUAL_TYPES = [
    "CHART", "NUMBER_VISUAL", "ATLAS", "COMPANY_VISUAL", "DATA_CARD",
    "CAROUSEL", "MOTION_GRAPHIC", "VIDEO", "MINIMAL_TYPOGRAPHY", "MIXED",
    "GENERATIVE", "SCORE", "PERFORMANCE", "COMPARISON"
  ];

  /* Kanonische Metriken (§17). Jede Plattform meldet eine Teilmenge; was
     eine Plattform nicht meldet, bleibt null und wird nie geschaetzt. */
  var CANONICAL_METRICS = [
    "impressions", "reach", "views", "watchTimeSeconds", "completionRate",
    "likes", "comments", "shares", "saves", "clicks",
    "followersGained", "engagementRate", "profileVisits"
  ];

  /* ------------------------------------------------------------------ */
  /* Hilfsmittel                                                          */
  /* ------------------------------------------------------------------ */

  function fail(message) { throw new Error("VUSocialSchema: " + message); }

  function isIsoDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }

  function requireOneOf(value, allowed, field) {
    if (allowed.indexOf(value) === -1) {
      fail(field + " muss einer von [" + allowed.join(", ") + "] sein, war: " + JSON.stringify(value));
    }
    return value;
  }

  function requireString(value, field) {
    if (typeof value !== "string" || value.trim() === "") fail(field + " fehlt");
    return value;
  }

  /** Zahl oder null — niemals ein stiller Standardwert. */
  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  /* ------------------------------------------------------------------ */
  /* Provenance (§28)                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Herkunft genau einer Aussage. Ohne sie darf keine konkrete Zahl in
   * einen Beitrag gelangen (§27).
   */
  function sourceRef(spec) {
    spec = spec || {};
    return {
      source: requireString(spec.source, "sourceRef.source"),        // z.B. "vu.technical"
      provider: spec.provider || null,                               // z.B. "tiingo", "sec"
      entity: spec.entity || null,                                   // Ticker, CIK, Thema
      metric: spec.metric || null,                                   // z.B. "close", "revenue"
      value: spec.value === undefined ? null : spec.value,
      unit: spec.unit || null,
      observedAt: isIsoDate(spec.observedAt) ? spec.observedAt : null,
      /* freshnessSeconds ist bewusst getrennt von observedAt: eine
         Quelle kann einen alten Wert frisch ausliefern. */
      freshnessSeconds: numberOrNull(spec.freshnessSeconds),
      state: requireOneOf(spec.state || "UNAVAILABLE", DATA_STATES, "sourceRef.state"),
      confidence: numberOrNull(spec.confidence),                     // 0..1 oder null
      url: spec.url || null
    };
  }

  /* ------------------------------------------------------------------ */
  /* Entitaeten (§37)                                                     */
  /* ------------------------------------------------------------------ */

  /** Ein Plattformanbieter. */
  function socialProvider(spec) {
    spec = spec || {};
    return {
      providerId: requireString(spec.providerId, "socialProvider.providerId"),
      displayName: spec.displayName || spec.providerId,
      platform: requireString(spec.platform, "socialProvider.platform"),
      apiVersion: spec.apiVersion || null,
      docsUrl: spec.docsUrl || null
    };
  }

  /** Ein verbundenes Konto. Traegt NIE ein Token. */
  function socialAccount(spec) {
    spec = spec || {};
    /* Auch die EINGABE wird geprueft, nicht nur das Ergebnis. Das Ergebnis
       waere ohnehin sauber — es wird Feld fuer Feld aufgebaut. Aber ein
       Aufrufer, der hier ein Token uebergibt, hat es irgendwo in der Hand
       und wird es an der naechsten Stelle ebenfalls uebergeben. Der Fehler
       gehoert dorthin gemeldet, wo er entsteht. */
    assertNoSecrets(spec, "socialAccount(spec)");
    var account = {
      accountId: requireString(spec.accountId, "socialAccount.accountId"),
      providerId: requireString(spec.providerId, "socialAccount.providerId"),
      /* Die plattformseitige Kennung (z.B. Instagram-User-ID). Oeffentlich,
         kein Geheimnis — anders als das Token, das hier nichts zu suchen hat. */
      externalId: spec.externalId || null,
      username: spec.username || null,
      accountType: spec.accountType || null,        // z.B. "INSTAGRAM_PROFESSIONAL"
      pageId: spec.pageId || null,                  // Facebook-Seite bei Instagram
      connectedAt: isIsoDate(spec.connectedAt) ? spec.connectedAt : null,
      tokenExpiresAt: isIsoDate(spec.tokenExpiresAt) ? spec.tokenExpiresAt : null,
      scopes: Array.isArray(spec.scopes) ? spec.scopes.slice() : [],
      state: requireOneOf(spec.state || "not_configured",
        ["connected", "expired", "revoked", "not_configured", "error"], "socialAccount.state")
    };
    assertNoSecrets(account, "socialAccount");
    return account;
  }

  /** Ein aufbereitetes Signal (§4). */
  function trendSignal(spec) {
    spec = spec || {};
    return {
      signalId: requireString(spec.signalId, "trendSignal.signalId"),
      signalClass: requireOneOf(spec.signalClass, SIGNAL_CLASSES, "trendSignal.signalClass"),
      topic: requireString(spec.topic, "trendSignal.topic"),
      entities: Array.isArray(spec.entities) ? spec.entities.slice() : [],
      observedAt: isIsoDate(spec.observedAt) ? spec.observedAt : null,
      /* Rohmessungen. Was die Quelle nicht liefert, bleibt null — die
         Trend-Engine rechnet dann ohne diese Dimension weiter und sagt es. */
      measures: {
        volume: numberOrNull(spec.measures && spec.measures.volume),
        volumePrior: numberOrNull(spec.measures && spec.measures.volumePrior),
        volumePriorPrior: numberOrNull(spec.measures && spec.measures.volumePriorPrior),
        engagement: numberOrNull(spec.measures && spec.measures.engagement),
        platforms: Array.isArray(spec.measures && spec.measures.platforms)
          ? spec.measures.platforms.slice() : []
      },
      provenance: Array.isArray(spec.provenance) ? spec.provenance.map(sourceRef) : [],
      /* Text aus externen Quellen ist UNTRUSTED (§50). Das Feld heisst so,
         damit niemand es versehentlich in einen Prompt gibt. */
      untrustedText: typeof spec.untrustedText === "string" ? spec.untrustedText : null
    };
  }

  /** Eine bewertete Gelegenheit (§6). */
  function contentOpportunity(spec) {
    spec = spec || {};
    return {
      opportunityId: requireString(spec.opportunityId, "contentOpportunity.opportunityId"),
      createdAt: isIsoDate(spec.createdAt) ? spec.createdAt : null,
      topic: requireString(spec.topic, "contentOpportunity.topic"),
      entities: Array.isArray(spec.entities) ? spec.entities.slice() : [],
      signalIds: Array.isArray(spec.signalIds) ? spec.signalIds.slice() : [],
      score: numberOrNull(spec.score),
      components: spec.components && typeof spec.components === "object" ? spec.components : {},
      archetype: spec.archetype ? requireOneOf(spec.archetype, CONTENT_ARCHETYPES, "contentOpportunity.archetype") : null,
      platform: spec.platform || null,
      timeSensitivity: spec.timeSensitivity || null,   // "BREAKING" | "TIMELY" | "EVERGREEN"
      provenance: Array.isArray(spec.provenance) ? spec.provenance.map(sourceRef) : [],
      explanation: spec.explanation || null
    };
  }

  /** Das fertige Content Package (§10). */
  function contentPackage(spec) {
    spec = spec || {};
    return {
      packageId: requireString(spec.packageId, "contentPackage.packageId"),
      opportunityId: spec.opportunityId || null,
      createdAt: isIsoDate(spec.createdAt) ? spec.createdAt : null,
      topic: requireString(spec.topic, "contentPackage.topic"),
      thesis: spec.thesis || null,
      hook: spec.hook || null,
      /* -----------------------------------------------------------------
         WIE DIESER HOOK ZUSTANDE KAM

         §9 macht den Hook zu einem eigenen Optimierungsobjekt. Ein
         Optimierungsobjekt, dessen Herkunft beim Verpacken verlorengeht,
         ist keines: der Lernpfad koennte spaeter nie fragen, welcher
         Archetyp getragen hat und was zur Wahl stand.

         Genau das ist passiert. Der Archetyp stand im Zwischenpaket und
         fehlte im fertigen - eine von Hand gefuehrte Feldliste, aus der
         ein Feld faellt. Dieselbe Fehlerfamilie, die in diesem Projekt
         schon den Byte-Abdruck zweimal unterwegs verloren hat.
         ----------------------------------------------------------------- */
      hookArchetype: spec.hookArchetype || null,
      hookSelection: spec.hookSelection || null,
      /* Die Vergleichsreihe: jeder Wert mit seinem Gegenstand. Ohne
         sie im Paket muesste der Renderer sie neu ableiten, und zwei
         Ableitungen sind zwei Gelegenheiten, Zahl und Name
         auseinanderzubringen. */
      visualComparison: spec.visualComparison || null,
      caption: spec.caption || null,
      cta: spec.cta || null,
      hashtags: Array.isArray(spec.hashtags) ? spec.hashtags.slice() : [],
      archetype: spec.archetype ? requireOneOf(spec.archetype, CONTENT_ARCHETYPES, "contentPackage.archetype") : null,
      visualType: spec.visualType ? requireOneOf(spec.visualType, VISUAL_TYPES, "contentPackage.visualType") : null,
      visualBrief: spec.visualBrief || null,
      assets: Array.isArray(spec.assets) ? spec.assets.slice() : [],
      /* Plattformvarianten: derselbe Gedanke, andere Form. Nicht derselbe
         Text mit anderem Zeilenumbruch. */
      variants: spec.variants && typeof spec.variants === "object" ? spec.variants : {},
      /* Jede konkrete Zahl im Text braucht hier ihren Beleg (§27, §28). */
      claims: Array.isArray(spec.claims) ? spec.claims.map(function (c) {
        return {
          text: requireString(c.text, "claim.text"),
          numeric: c.numeric === undefined ? null : c.numeric,
          source: c.source ? sourceRef(c.source) : null
        };
      }) : [],
      validation: spec.validation && typeof spec.validation === "object" ? spec.validation : {
        factCheck: null, brandCheck: null, audienceSeparation: null,
        fatigueCheck: null
      }
    };
  }

  /** Eine Veroeffentlichung (§15). */
  function publication(spec) {
    spec = spec || {};
    return {
      publicationId: requireString(spec.publicationId, "publication.publicationId"),
      packageId: spec.packageId || null,
      providerId: requireString(spec.providerId, "publication.providerId"),
      accountId: spec.accountId || null,
      state: requireOneOf(spec.state || "IDEA", PUBLICATION_STATES, "publication.state"),
      /* Der Idempotency-Key ist die einzige Sicherung gegen den teuersten
         Fehler des Systems: derselbe Beitrag zweimal veroeffentlicht. Er
         wird aus dem Inhalt abgeleitet, nicht zufaellig vergeben. */
      idempotencyKey: requireString(spec.idempotencyKey, "publication.idempotencyKey"),
      scheduledFor: isIsoDate(spec.scheduledFor) ? spec.scheduledFor : null,
      publishedAt: isIsoDate(spec.publishedAt) ? spec.publishedAt : null,
      externalPostId: spec.externalPostId || null,
      permalink: spec.permalink || null,
      attempts: Array.isArray(spec.attempts) ? spec.attempts.slice() : [],
      autonomyLevel: numberOrNull(spec.autonomyLevel),
      strategyVersion: spec.strategyVersion || null
    };
  }

  /** Ein Versuch innerhalb einer Veroeffentlichung. */
  function publicationAttempt(spec) {
    spec = spec || {};
    return {
      attemptId: requireString(spec.attemptId, "publicationAttempt.attemptId"),
      startedAt: isIsoDate(spec.startedAt) ? spec.startedAt : null,
      finishedAt: isIsoDate(spec.finishedAt) ? spec.finishedAt : null,
      outcome: requireOneOf(spec.outcome || "pending",
        ["pending", "succeeded", "failed", "skipped"], "publicationAttempt.outcome"),
      errorCode: spec.errorCode || null,
      /* Fehlermeldungen von Anbietern koennen Zugangsdaten spiegeln
         (siehe quant/tests/secrets.test.mjs S8). Der Adapter bereinigt sie,
         bevor sie hier ankommen. */
      errorMessage: spec.errorMessage || null,
      retryable: spec.retryable === true
    };
  }

  /** Ein Metrik-Schnappschuss (§17). */
  function metricSnapshot(spec) {
    spec = spec || {};
    var metrics = {};
    CANONICAL_METRICS.forEach(function (m) {
      metrics[m] = numberOrNull(spec.metrics && spec.metrics[m]);
    });
    return {
      snapshotId: requireString(spec.snapshotId, "metricSnapshot.snapshotId"),
      publicationId: requireString(spec.publicationId, "metricSnapshot.publicationId"),
      providerId: requireString(spec.providerId, "metricSnapshot.providerId"),
      capturedAt: isIsoDate(spec.capturedAt) ? spec.capturedAt : null,
      ageHours: numberOrNull(spec.ageHours),
      metrics: metrics,
      /* Die Originalkennzahlen des Anbieters bleiben erhalten (§17). Sie
         sind Beleg und Rueckfallebene, wenn sich die Normalisierung als
         falsch erweist — ohne sie waere eine Korrektur Datenverlust. */
      providerMetrics: spec.providerMetrics && typeof spec.providerMetrics === "object"
        ? spec.providerMetrics : {},
      state: requireOneOf(spec.state || "UNAVAILABLE", DATA_STATES, "metricSnapshot.state")
    };
  }

  /** Eine Lernbeobachtung (§19). */
  function learningObservation(spec) {
    spec = spec || {};
    return {
      observationId: requireString(spec.observationId, "learningObservation.observationId"),
      createdAt: isIsoDate(spec.createdAt) ? spec.createdAt : null,
      dimension: requireString(spec.dimension, "learningObservation.dimension"), // z.B. "archetype"
      value: requireString(spec.value, "learningObservation.value"),             // z.B. "DATA_STORY"
      sampleSize: numberOrNull(spec.sampleSize),
      effect: numberOrNull(spec.effect),
      /* Ohne Unsicherheit ist ein Effekt eine Behauptung (§19). */
      confidenceInterval: Array.isArray(spec.confidenceInterval) ? spec.confidenceInterval.slice() : null,
      sufficient: spec.sufficient === true,
      note: spec.note || null
    };
  }

  /** Eine Strategieversion (§21). */
  function strategyVersion(spec) {
    spec = spec || {};
    return {
      versionId: requireString(spec.versionId, "strategyVersion.versionId"),
      createdAt: isIsoDate(spec.createdAt) ? spec.createdAt : null,
      parentVersionId: spec.parentVersionId || null,
      parameters: spec.parameters && typeof spec.parameters === "object" ? spec.parameters : {},
      rationale: spec.rationale || null,
      observationIds: Array.isArray(spec.observationIds) ? spec.observationIds.slice() : [],
      /* Reversibel heisst: es gibt einen Vorgaenger und einen Weg zurueck. */
      reversible: spec.reversible !== false
    };
  }

  /* ------------------------------------------------------------------ */
  /* Geheimnis-Sperre                                                     */
  /* ------------------------------------------------------------------ */

  /* Feldnamen, die niemals in einer kanonischen Entitaet vorkommen
     duerfen. Die Pruefung ist eine Sperre, kein Hinweis: ein Token, das
     einmal in einem Artefakt landet, ist in der Git-Historie. */
  var FORBIDDEN_FIELDS = [
    "accessToken", "access_token", "refreshToken", "refresh_token",
    "appSecret", "app_secret", "clientSecret", "client_secret",
    "token", "secret", "password", "authorization", "apiKey", "api_key"
  ];

  function assertNoSecrets(value, label) {
    var seen = [];
    (function walk(node, path) {
      if (!node || typeof node !== "object") return;
      if (seen.indexOf(node) !== -1) return;
      seen.push(node);
      Object.keys(node).forEach(function (key) {
        if (FORBIDDEN_FIELDS.indexOf(key) !== -1) {
          fail((label || "entity") + " enthaelt ein verbotenes Feld: " + path + key);
        }
        walk(node[key], path + key + ".");
      });
    })(value, "");
    return value;
  }

  var api = {
    PUBLICATION_STATES: PUBLICATION_STATES,
    PUBLICATION_TRANSITIONS: PUBLICATION_TRANSITIONS,
    DATA_STATES: DATA_STATES,
    SUPPORT_LEVELS: SUPPORT_LEVELS,
    HEALTH_STATES: HEALTH_STATES,
    SIGNAL_CLASSES: SIGNAL_CLASSES,
    CONTENT_ARCHETYPES: CONTENT_ARCHETYPES,
    VISUAL_TYPES: VISUAL_TYPES,
    CANONICAL_METRICS: CANONICAL_METRICS,
    FORBIDDEN_FIELDS: FORBIDDEN_FIELDS,

    sourceRef: sourceRef,
    socialProvider: socialProvider,
    socialAccount: socialAccount,
    trendSignal: trendSignal,
    contentOpportunity: contentOpportunity,
    contentPackage: contentPackage,
    publication: publication,
    publicationAttempt: publicationAttempt,
    metricSnapshot: metricSnapshot,
    learningObservation: learningObservation,
    strategyVersion: strategyVersion,

    assertNoSecrets: assertNoSecrets,
    numberOrNull: numberOrNull,
    isIsoDate: isIsoDate
  };

  if (isNode) module.exports = api;
  else global.VUSocialSchema = api;
})(typeof window !== "undefined" ? window : globalThis);
