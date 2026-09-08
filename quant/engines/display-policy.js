/* =========================================================================
   VISION UNIVERSE — display-policy.js   (Phase 4A, §15, §30)

   Wer darf welche Daten sehen?

   Die technische Frage "koennen wir diese Kurse anzeigen" und die
   rechtliche Frage "duerfen wir sie anzeigen" haben verschiedene Antworten,
   und sie werden regelmaessig verwechselt. Ein funktionierender Abruf
   fuehlt sich wie eine Erlaubnis an. Er ist keine.

   Dieses Modul trennt beides. Es kennt je Anbieter und Datenklasse vier
   Fragen:

     internalUseAllowed        duerfen wir damit entwickeln?
     publicRawDisplayAllowed   duerfen Rohkurse an Besucher?
     publicDerivedDisplayAllowed  duerfen daraus abgeleitete Werte an Besucher?
     publicRealtimeAllowed     duerfen Echtzeitkurse an Besucher?

   Der Standard ist ueberall der strengste. Eine Erlaubnis entsteht nicht
   dadurch, dass niemand widerspricht - sie muss eingetragen werden, mit
   Datum und Grundlage.

   Die Gegenrichtung ist genauso wichtig: das Modul verbietet nichts, was
   erlaubt ist. Interne Entwicklung ist ausdruecklich zulaessig, sonst
   liesse sich gar nichts pruefen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var PERMISSIONS = [
    "internalUseAllowed",
    "publicRawDisplayAllowed",
    "publicDerivedDisplayAllowed",
    "publicRealtimeAllowed"
  ];

  var DATA_CLASSES = ["marketData", "intraday", "realtime", "fundamentals", "corporateActions"];

  /* Der Standard: intern ja, oeffentlich nichts. Gilt fuer jeden Anbieter,
     zu dem nichts eingetragen ist - auch fuer einen, den niemand kennt. */
  var DEFAULT_POLICY = {
    internalUseAllowed: true,
    publicRawDisplayAllowed: false,
    publicDerivedDisplayAllowed: false,
    publicRealtimeAllowed: false,
    basis: "Standardannahme mangels geprüfter Lizenz.",
    checkedAt: null
  };

  /* Feature-Gates. Sie stehen NEBEN der Richtlinie, nicht darueber: ein
     eingeschaltetes Gate hebt keine fehlende Erlaubnis auf. Beides muss
     zutreffen, damit etwas oeffentlich wird. */
  var GATES = {
    ENABLE_LIVE_MARKET_DATA: {
      label: "Live-Marktdaten intern",
      default: false,
      description: "Schaltet Intraday- und Realtime-Abrufe fuer die Entwicklung frei."
    },
    ENABLE_PUBLIC_LIVE_MARKET_DATA: {
      label: "Live-Marktdaten oeffentlich",
      default: false,
      description: "Schaltet Live-Daten fuer Besucher frei. Erfordert zusaetzlich eine " +
                   "Lizenzgrundlage in der Richtlinie - das Gate allein genuegt nicht."
    }
  };

  var registry = Object.create(null);

  /**
   * Traegt eine Richtlinie ein.
   *
   * Jede Erlaubnis ueber den Standard hinaus verlangt eine Grundlage. Ohne
   * sie wird der Eintrag abgelehnt - eine Erlaubnis ohne Begruendung ist
   * genau die Sorte Eintrag, die spaeter niemand mehr nachvollziehen kann.
   */
  function declare(providerId, dataClass, policy) {
    policy = policy || {};
    var grantsPublic = PERMISSIONS.slice(1).some(function (p) { return policy[p] === true; });
    if (grantsPublic && !policy.basis) {
      throw new Error("display-policy: oeffentliche Erlaubnis fuer " + providerId + "/" +
                      dataClass + " ohne Angabe der Grundlage.");
    }
    if (grantsPublic && !policy.checkedAt) {
      throw new Error("display-policy: oeffentliche Erlaubnis fuer " + providerId + "/" +
                      dataClass + " ohne Pruefdatum.");
    }
    var key = providerId + "|" + dataClass;
    registry[key] = Object.assign({}, DEFAULT_POLICY, policy,
                                  { providerId: providerId, dataClass: dataClass });
    return registry[key];
  }

  function lookup(providerId, dataClass) {
    var key = providerId + "|" + dataClass;
    if (registry[key]) return registry[key];
    return Object.assign({}, DEFAULT_POLICY, {
      providerId: providerId, dataClass: dataClass,
      basis: "Kein Eintrag vorhanden. Es gilt der strengste Standard."
    });
  }

  /**
   * Darf `audience` diese Daten in dieser Form sehen?
   *
   * @param {object} request {providerId, dataClass, audience, form, gates}
   *   audience: "internal" | "public"
   *   form:     "raw" | "derived" | "realtime"
   */
  function check(request) {
    request = request || {};
    var providerId = request.providerId || "unknown";
    var dataClass = request.dataClass || "marketData";
    var audience = request.audience === "public" ? "public" : "internal";
    var form = request.form || "raw";
    var gates = request.gates || {};
    var policy = lookup(providerId, dataClass);

    if (audience === "internal") {
      if (!policy.internalUseAllowed) {
        return deny("internalUseForbidden",
          "Fuer " + providerId + "/" + dataClass + " ist selbst die interne Nutzung " +
          "ausgeschlossen.", policy);
      }
      /* Live-Daten brauchen auch intern ein eingeschaltetes Gate - damit ein
         versehentlicher Abruf nicht durch blosse Anwesenheit eines
         Schluessels entsteht. */
      if ((form === "realtime" || dataClass === "realtime" || dataClass === "intraday") &&
          gates.ENABLE_LIVE_MARKET_DATA !== true) {
        return deny("gateDisabled",
          "ENABLE_LIVE_MARKET_DATA ist nicht gesetzt. Live- und Intraday-Abrufe bleiben aus.",
          policy);
      }
      return allow("internal", policy);
    }

    /* Oeffentlich. Hier gilt: Gate UND Erlaubnis, nicht Gate ODER Erlaubnis. */
    var needed = form === "realtime" ? "publicRealtimeAllowed"
               : form === "derived"  ? "publicDerivedDisplayAllowed"
                                     : "publicRawDisplayAllowed";

    if (form === "realtime" && gates.ENABLE_PUBLIC_LIVE_MARKET_DATA !== true) {
      return deny("gateDisabled",
        "ENABLE_PUBLIC_LIVE_MARKET_DATA ist nicht gesetzt.", policy);
    }
    if (policy[needed] !== true) {
      return deny("notLicensed",
        "Fuer " + providerId + "/" + dataClass + " ist die oeffentliche Anzeige (" + form +
        ") nicht freigegeben. " + (policy.basis || ""), policy);
    }
    return allow("public", policy);
  }

  function allow(audience, policy) {
    return { allowed: true, audience: audience, reason: null, message: null,
             basis: policy.basis || null, checkedAt: policy.checkedAt || null };
  }

  function deny(reason, message, policy) {
    return { allowed: false, audience: null, reason: reason, message: message,
             basis: policy.basis || null, checkedAt: policy.checkedAt || null };
  }

  /**
   * Liest die Gates aus der ausgelieferten Konfigurationsdatei.
   *
   * Der Browser hat keine Umgebungsvariablen. Statt dafuer eine zweite,
   * lockerere Regel zu erfinden, liest er dieselben Gates aus einer Datei,
   * die im Repository steht - eine Freischaltung ist damit ein Commit mit
   * Begruendung und Datum, kein Schalter, den jemand vergisst.
   *
   * Die Auswertung ist genauso streng wie bei der Umgebungsvariante: nur
   * ein ausdrueckliches true schaltet ein. Eine fehlende Datei, ein
   * fehlender Eintrag oder ein unerwarteter Wert bedeuten aus.
   */
  function gatesFromConfig(config) {
    var entries = (config && config.gates) || {};
    var out = {};
    Object.keys(GATES).forEach(function (name) {
      var entry = entries[name];
      out[name] = !!(entry && entry.enabled === true);
    });
    return out;
  }

  /** Warum steht ein Gate so, wie es steht? Fuer die Entwickleransicht. */
  function gateReason(config, name) {
    var entry = (config && config.gates && config.gates[name]) || null;
    if (!entry) return "Kein Eintrag in der Konfiguration. Es gilt der Standard: aus.";
    return entry.reason || (entry.enabled ? "Eingeschaltet ohne Begruendung." : "Ausgeschaltet.");
  }

  /** Liest die Gates aus der Umgebung. Alles ausser "true" ist aus. */
  function gatesFromEnv(env) {
    env = env || {};
    var out = {};
    Object.keys(GATES).forEach(function (name) {
      out[name] = String(env[name]).toLowerCase() === "true";
    });
    return out;
  }

  /** Was ist derzeit eingetragen - fuer die Entwickleransicht. */
  function list() {
    return Object.keys(registry).map(function (k) { return registry[k]; });
  }

  function reset() { registry = Object.create(null); }

  var api = {
    PERMISSIONS: PERMISSIONS, DATA_CLASSES: DATA_CLASSES,
    DEFAULT_POLICY: DEFAULT_POLICY, GATES: GATES,
    declare: declare, lookup: lookup, check: check,
    gatesFromEnv: gatesFromEnv, gatesFromConfig: gatesFromConfig,
    gateReason: gateReason, list: list, reset: reset
  };

  if (isNode) module.exports = api;
  else global.VUDisplayPolicy = api;
})(typeof window !== "undefined" ? window : globalThis);
