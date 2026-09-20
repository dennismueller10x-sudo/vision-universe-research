/* =========================================================================
   VISION UNIVERSE SOCIAL — capabilities.js
   PLATTFORM-FAEHIGKEITEN, MASCHINENLESBAR (§8)

   Dieselbe Lehre wie im Quant-Bereich (quant/engines/capabilities.js), nur
   fuer Plattformen statt Datenanbieter: was ein Adapter nicht kann, muss
   er SAGEN. Eine nicht vorhandene Faehigkeit sieht sonst aus wie ein
   Fehler, und ein Fehler sieht aus wie ein voruebergehendes Problem.

   VIER ZUSTAENDE, NICHT ZWEI

     SUPPORTED            geht ueber die API, vollstaendig
     PARTIALLY_SUPPORTED  geht, aber mit Einschraenkung (Format, Menge, Zeit)
     MANUAL_REQUIRED      geht nur mit einem Menschen im Ablauf
     UNAVAILABLE          geht nicht

   Dazu der fuenfte, der kein Zustand ist: `null` = UNGEPRUEFT. "Wir haben
   es nicht getestet" ist keine Zusage und kein Ausschluss (MASTER §31.6,
   die MEDIUM-5-Lehre). Wer `null` zu `UNAVAILABLE` verkuerzt, schaltet
   Funktionen ab, die funktionieren; wer es zu `SUPPORTED` verkuerzt,
   verspricht etwas im Namen einer fremden API.

   WARUM DAS HIER BESONDERS ZAEHLT

   Instagram veroeffentlicht Stories ueber die Content Publishing API nur
   fuer bestimmte Kontotypen; Reels haben eigene Medienanforderungen;
   Kommentare sind lesbar, aber nicht auf jedem Kontotyp beantwortbar. Ein
   System, das das nicht deklariert, erzeugt seine eigenen Ueberraschungen
   im Moment der Veroeffentlichung — also zum spaetestmoeglichen Zeitpunkt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var SUPPORT_LEVELS = ["SUPPORTED", "PARTIALLY_SUPPORTED", "MANUAL_REQUIRED", "UNAVAILABLE"];

  /* Authentifizierung und Kontoverwaltung. */
  var AUTH_CAPABILITIES = [
    "oauth",                  /* Autorisierungscode-Fluss ueber die Plattform */
    "serverSideTokenExchange",/* Code gegen Token, serverseitig */
    "longLivedToken",         /* langlebiges Token erhaeltlich */
    "tokenRefresh",           /* Verlaengerung ohne erneute Nutzeraktion */
    "tokenRevocation",        /* Widerruf ueber die API */
    "permissionIntrospection",/* welche Rechte hat dieses Token wirklich */
    "multiAccount"            /* mehrere Konten je Verbindung */
  ];

  /* Veroeffentlichung. */
  var PUBLISH_CAPABILITIES = [
    "publishImage", "publishCarousel", "publishVideo", "publishReel", "publishStory",
    "publishText",            /* reiner Text ohne Medium */
    "scheduledPublish",       /* die Plattform terminiert selbst */
    "altText", "location", "userTags", "productTags",
    "idempotencyToken",       /* die Plattform kennt selbst einen Wiederholungsschutz */
    "deletePost", "editCaption"
  ];

  /* Analytics. */
  var ANALYTICS_CAPABILITIES = [
    "postInsights", "accountInsights", "audienceDemographics",
    "storyInsights", "videoRetention", "historicalInsights",
    "realtimeInsights", "followerTimeseries"
  ];

  /* Publikum. */
  var AUDIENCE_CAPABILITIES = [
    "readComments", "replyComments", "hideComments", "readMentions", "readDirectMessages"
  ];

  /* Webhooks. */
  var WEBHOOK_CAPABILITIES = ["webhookSubscription", "signatureVerification", "commentEvents", "mentionEvents"];

  var CAPABILITY_SETS = {
    auth: AUTH_CAPABILITIES,
    publish: PUBLISH_CAPABILITIES,
    analytics: ANALYTICS_CAPABILITIES,
    audience: AUDIENCE_CAPABILITIES,
    webhook: WEBHOOK_CAPABILITIES
  };

  function fail(m) { throw new Error("VUSocialCapabilities: " + m); }

  /**
   * Erzeugt eine vollstaendige Deklaration. Nicht genannte Faehigkeiten
   * sind `null` (= ungeprueft), nicht "UNAVAILABLE".
   *
   * `constraints` traegt die Zahlen, die eine PARTIALLY_SUPPORTED-Angabe
   * erst brauchbar machen: ohne "max. 10 Elemente im Carousel" ist
   * "teilweise unterstuetzt" nur ein Achselzucken.
   */
  function declare(providerId, spec) {
    spec = spec || {};
    var out = {
      providerId: providerId,
      platform: spec.platform || providerId,
      apiVersion: spec.apiVersion || null,
      declaredAt: spec.declaredAt || null,
      /* verifiedAt ist der einzige Beleg, der zaehlt: eine Deklaration ist
         eine Behauptung, bis ein Lauf sie gegen die echte API geprueft hat. */
      verifiedAt: spec.verifiedAt || null,
      sets: {},
      constraints: spec.constraints && typeof spec.constraints === "object" ? spec.constraints : {},
      notes: spec.notes && typeof spec.notes === "object" ? spec.notes : {}
    };

    Object.keys(CAPABILITY_SETS).forEach(function (setName) {
      var declared = (spec[setName] && typeof spec[setName] === "object") ? spec[setName] : {};
      var set = {};
      CAPABILITY_SETS[setName].forEach(function (cap) {
        var value = declared[cap];
        if (value === undefined) { set[cap] = null; return; }
        if (value === null) { set[cap] = null; return; }
        if (SUPPORT_LEVELS.indexOf(value) === -1) {
          fail(providerId + "." + setName + "." + cap + ": unbekannter Unterstuetzungsgrad " + JSON.stringify(value));
        }
        set[cap] = value;
      });
      /* Ein Schluessel, den es in der Menge nicht gibt, ist ein Tippfehler
         und keine Erweiterung. Neue Faehigkeiten kommen oben in die Liste. */
      Object.keys(declared).forEach(function (cap) {
        if (CAPABILITY_SETS[setName].indexOf(cap) === -1) {
          fail(providerId + "." + setName + ": unbekannte Faehigkeit '" + cap + "'");
        }
      });
      out.sets[setName] = set;
    });

    return out;
  }

  function lookup(declaration, setName, capability) {
    if (!declaration || !declaration.sets || !declaration.sets[setName]) return null;
    var value = declaration.sets[setName][capability];
    return value === undefined ? null : value;
  }

  /** Nur ein volles SUPPORTED ist ein Ja. */
  function supports(declaration, setName, capability) {
    return lookup(declaration, setName, capability) === "SUPPORTED";
  }

  /** Reicht fuer einen Ablauf, der die Einschraenkung kennt und beachtet. */
  function usable(declaration, setName, capability) {
    var v = lookup(declaration, setName, capability);
    return v === "SUPPORTED" || v === "PARTIALLY_SUPPORTED";
  }

  /** Ausdruecklich geprueft und ausdruecklich nicht vorhanden. */
  function explicitlyUnavailable(declaration, setName, capability) {
    return lookup(declaration, setName, capability) === "UNAVAILABLE";
  }

  /** Ungeprueft — der Zustand, der niemals stillschweigend verschwindet. */
  function unknown(declaration, setName, capability) {
    return lookup(declaration, setName, capability) === null;
  }

  /**
   * Die Antwort, die statt eines leeren Ergebnisses zurueckgeht. Sie ist
   * ein Ergebnis mit Begruendung, kein geworfener Fehler: ein fehlendes
   * Feature ist ein normaler Betriebszustand.
   */
  function capabilityMissing(declaration, setName, capability, hint) {
    var level = lookup(declaration, setName, capability);
    return {
      available: false,
      reason: level === null ? "capabilityUnknown" : "capabilityMissing",
      supportLevel: level,
      providerId: declaration ? declaration.providerId : null,
      capability: setName + "." + capability,
      constraint: declaration && declaration.constraints ? (declaration.constraints[capability] || null) : null,
      message: level === null
        ? "Fuer " + capability + " liegt keine gepruefte Aussage vor. Das ist kein Nein — es ist ungeprueft."
        : (hint || "Der Anbieter stellt " + capability + " nicht bereit (" + level + ")."),
      data: null
    };
  }

  /** Vergleichsmatrix mehrerer Plattformen — speist Doku und Command Center. */
  function matrix(declarations, setName) {
    var caps = CAPABILITY_SETS[setName] || [];
    return caps.map(function (cap) {
      var row = { capability: cap };
      declarations.forEach(function (d) {
        row[d.providerId] = d.sets[setName] ? d.sets[setName][cap] : null;
      });
      return row;
    });
  }

  /** Wieviel einer Deklaration ist tatsaechlich geprueft? Fuer die Health-Matrix. */
  function coverage(declaration) {
    var total = 0, known = 0, verifiedSets = 0;
    Object.keys(CAPABILITY_SETS).forEach(function (setName) {
      CAPABILITY_SETS[setName].forEach(function (cap) {
        total++;
        if (declaration.sets[setName][cap] !== null) known++;
      });
      verifiedSets++;
    });
    return {
      total: total,
      declared: known,
      unknown: total - known,
      ratio: total === 0 ? null : Math.round((known / total) * 1000) / 1000,
      verifiedAt: declaration.verifiedAt
    };
  }

  var api = {
    SUPPORT_LEVELS: SUPPORT_LEVELS,
    CAPABILITY_SETS: CAPABILITY_SETS,
    AUTH_CAPABILITIES: AUTH_CAPABILITIES,
    PUBLISH_CAPABILITIES: PUBLISH_CAPABILITIES,
    ANALYTICS_CAPABILITIES: ANALYTICS_CAPABILITIES,
    AUDIENCE_CAPABILITIES: AUDIENCE_CAPABILITIES,
    WEBHOOK_CAPABILITIES: WEBHOOK_CAPABILITIES,
    declare: declare,
    lookup: lookup,
    supports: supports,
    usable: usable,
    explicitlyUnavailable: explicitlyUnavailable,
    unknown: unknown,
    capabilityMissing: capabilityMissing,
    matrix: matrix,
    coverage: coverage
  };

  if (isNode) module.exports = api;
  else global.VUSocialCapabilities = api;
})(typeof window !== "undefined" ? window : globalThis);
