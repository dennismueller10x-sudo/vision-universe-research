/* =========================================================================
   VISION UNIVERSE SOCIAL — provider.js
   PLATTFORM-ABSTRAKTION (§8)

   Dieselbe Form wie quant/engines/provider.js, weil dieselbe Gefahr
   besteht: sobald ein plattformspezifisches Feld oberhalb des Adapters
   auftaucht, ist der Plattformwechsel keine Adapterfrage mehr, sondern
   eine Migration.

       Plattform-Payload
         -> Adapter            EINZIGER Ort mit Plattformkenntnis
         -> Kanonisches Schema
         -> Engines
         -> Command Center

   VIER INTERFACES

     SocialAuthProvider       Verbindung, Token-Lebenszyklus, Konten
     SocialPublishProvider    Veroeffentlichung
     SocialAnalyticsProvider  Kennzahlen
     SocialAudienceProvider   Kommentare, Erwaehnungen

   Ein Adapter beansprucht NUR die Interfaces, die er tatsaechlich
   erfuellt (MASTER §31.17). Der Mock erfuellt alle vier; Meta erfuellt
   drei und meldet fuer das vierte, was es kann und was nicht.

   VENDOR-LEAKAGE

   findVendorLeakage() sucht in kanonischen Objekten nach Feldnamen, die
   nur eine Plattform kennt. Der Test dazu ist Pflicht und nicht
   abschaltbar — im Quant-Bereich hat genau dieser Guard einen realen
   Fehler gefunden.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;

  var INTERFACES = {
    SocialAuthProvider: {
      methods: ["getAuthorizationUrl", "exchangeCode", "refreshToken", "revoke",
                "getAccounts", "getPermissions", "healthCheck"],
      description: "Autorisierung, Token-Lebenszyklus, Kontoaufloesung. Gibt NIE ein Token an den Aufrufer zurueck — Tokens bleiben im Adapter bzw. im Secret-Store."
    },
    SocialPublishProvider: {
      methods: ["validateMedia", "publish", "getPublishStatus", "healthCheck"],
      description: "Veroeffentlichung. publish() MUSS idempotent sein: derselbe idempotencyKey darf nie zu einem zweiten Beitrag fuehren."
    },
    SocialAnalyticsProvider: {
      methods: ["getPostMetrics", "getAccountMetrics", "healthCheck"],
      description: "Kennzahlen je Beitrag und je Konto, kanonisch normalisiert — mit erhaltenen Originalwerten."
    },
    SocialAudienceProvider: {
      methods: ["getComments", "getMentions", "healthCheck"],
      description: "Publikumssignale. Jeder zurueckgegebene Text ist UNTRUSTED und als solcher markiert."
    }
  };

  /* Gesundheit eines Providers. "not_configured" ist ausdruecklich KEIN
     Fehler: ein Provider ohne hinterlegte Zugangsdaten ist ein Provider,
     der auf eine Owner-Handlung wartet. */
  var HEALTH_STATUS = ["ok", "degraded", "unavailable", "not_configured"];

  function fail(m) { throw new Error("VUSocialProvider: " + m); }

  function makeHealth(status, fields) {
    fields = fields || {};
    if (HEALTH_STATUS.indexOf(status) === -1) fail("unbekannter Gesundheitszustand: " + status);
    return {
      status: status,
      provider: fields.provider || "unknown",
      message: fields.message || "",
      checkedAt: fields.checkedAt || new Date().toISOString(),
      /* Was konkret fehlt. Ein "unavailable" ohne diese Liste erzeugt
         Rateversuche statt Behebung. */
      missing: Array.isArray(fields.missing) ? fields.missing.slice() : [],
      capabilities: fields.capabilities || null,
      lastSuccessAt: fields.lastSuccessAt || null
    };
  }

  /* Feldnamen, die nur eine Plattform kennt. Taucht einer davon in einem
     kanonischen Objekt auf, ist die Abstraktion durchlaessig geworden. */
  var VENDOR_FIELDS = [
    "ig_id", "igId", "media_type", "media_url", "permalink_url",
    "creation_id", "container_id", "fb_page_id", "page_access_token",
    "graph_domain", "instagram_business_account",
    "tweet_id", "retweet_count", "urn", "li_id", "linkedin_urn",
    "tiktok_open_id", "video_id", "snippet", "etag"
  ];

  /**
   * Sucht Vendor-Felder in einem kanonischen Objekt.
   * Gibt die PFADE zurueck, nicht die Werte — ein Leckage-Bericht, der
   * Inhalte mitliefert, ist selbst ein Leck.
   */
  function findVendorLeakage(value, maxDepth) {
    maxDepth = maxDepth || 10;
    var hits = [];
    var seen = [];
    (function walk(node, path, depth) {
      if (!node || typeof node !== "object" || depth > maxDepth) return;
      if (seen.indexOf(node) !== -1) return;
      seen.push(node);
      if (Array.isArray(node)) {
        node.forEach(function (item, i) { walk(item, path + "[" + i + "]", depth + 1); });
        return;
      }
      Object.keys(node).forEach(function (key) {
        /* providerMetrics ist die eine erlaubte Insel: dort stehen die
           Originalkennzahlen des Anbieters absichtlich unveraendert (§17). */
        if (key === "providerMetrics") return;
        if (VENDOR_FIELDS.indexOf(key) !== -1) hits.push(path + key);
        walk(node[key], path + key + ".", depth + 1);
      });
    })(value, "", 0);
    return hits;
  }

  /**
   * Die Registry. Ein Adapter wird nur aufgenommen, wenn er ALLE Methoden
   * jedes beanspruchten Interfaces tatsaechlich besitzt. Ohne TypeScript
   * ist das die einzige Stelle, an der der Vertrag durchgesetzt wird.
   */
  function createRegistry() {
    var providers = Object.create(null);

    function register(adapter) {
      if (!adapter || !adapter.providerId) fail("Adapter ohne providerId");
      if (!Array.isArray(adapter.interfaces) || adapter.interfaces.length === 0) {
        fail(adapter.providerId + ": keine Interfaces angegeben");
      }
      adapter.interfaces.forEach(function (name) {
        var iface = INTERFACES[name];
        if (!iface) fail(adapter.providerId + ": unbekanntes Interface " + name);
        iface.methods.forEach(function (method) {
          if (typeof adapter[method] !== "function") {
            fail(adapter.providerId + " beansprucht " + name + ", implementiert aber " + method + "() nicht");
          }
        });
      });
      if (!adapter.capabilities) fail(adapter.providerId + ": keine Capability-Deklaration");
      providers[adapter.providerId] = adapter;
      return adapter;
    }

    function get(providerId) {
      var p = providers[providerId];
      if (!p) fail("unbekannter Provider: " + providerId);
      return p;
    }

    function has(providerId) { return !!providers[providerId]; }

    function ids() { return Object.keys(providers); }

    /** Alle Provider, die ein bestimmtes Interface erfuellen. */
    function implementing(interfaceName) {
      return ids().filter(function (id) {
        return providers[id].interfaces.indexOf(interfaceName) !== -1;
      });
    }

    /**
     * Sammelt die Gesundheit aller Provider. Ein Ausfall darf die Abfrage
     * der uebrigen nicht verhindern (§33): jeder Adapter wird einzeln
     * gekapselt, ein geworfener Fehler wird zu einem Zustand.
     */
    function healthAll() {
      return Promise.all(ids().map(function (id) {
        var p = providers[id];
        return Promise.resolve()
          .then(function () { return p.healthCheck(); })
          .catch(function (err) {
            return makeHealth("unavailable", {
              provider: id,
              message: "healthCheck() hat einen Fehler geworfen: " + String(err && err.message).slice(0, 160)
            });
          });
      }));
    }

    return {
      register: register, get: get, has: has, ids: ids,
      implementing: implementing, healthAll: healthAll
    };
  }

  /**
   * Gemeinsame Antwortform aller Adapter. "available: false" ist ein
   * gueltiges Ergebnis mit Grund — kein geworfener Fehler.
   */
  function result(spec) {
    spec = spec || {};
    var out = {
      available: spec.available === true,
      reason: spec.reason || null,
      provider: spec.provider || null,
      data: spec.data === undefined ? null : spec.data,
      message: spec.message || "",
      retryable: spec.retryable === true,
      retryAfterSeconds: Schema.numberOrNull(spec.retryAfterSeconds)
    };
    /* Die Sperre aus dem Schema gilt auch hier: kein Adapter reicht ein
       Token durch, auch nicht versehentlich in einer Fehlerantwort. */
    Schema.assertNoSecrets(out, "provider.result");
    return out;
  }

  var api = {
    INTERFACES: INTERFACES,
    HEALTH_STATUS: HEALTH_STATUS,
    VENDOR_FIELDS: VENDOR_FIELDS,
    makeHealth: makeHealth,
    findVendorLeakage: findVendorLeakage,
    createRegistry: createRegistry,
    result: result
  };

  if (isNode) module.exports = api;
  else global.VUSocialProvider = api;
})(typeof window !== "undefined" ? window : globalThis);
