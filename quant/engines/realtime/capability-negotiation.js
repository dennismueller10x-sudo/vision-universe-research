/* =========================================================================
   VISION UNIVERSE — realtime/capability-negotiation.js

   Was kann dieser Zugang wirklich - jetzt, mit diesem Schluessel, unter
   dieser Lizenz?

   Die Frage hat drei Gutachter, und alle drei muessen zustimmen:

     1. DER ANBIETER   Liefert er die Klasse? Antwort aus capabilities.js,
                       angehoben nur durch Laufzeitnachweise.
     2. DAS GATE       Ist der Abruf ueberhaupt freigeschaltet? Antwort aus
                       feature-gates.json.
     3. DIE LIZENZ     Darf das Ergebnis dieser Zielgruppe gezeigt werden?
                       Antwort aus display-policy.js.

   Ein Nein von einem der drei ist ein Nein. Die Reihenfolge der Pruefung
   bestimmt aber, WELCHES Nein der Nutzer und der Betreiber zu sehen
   bekommen - und das ist keine Kosmetik: "Der Anbieter kann das nicht"
   loest man mit einem Anbieterwechsel, "Die Lizenz erlaubt es nicht" mit
   einem Vertrag, und "Das Gate ist aus" mit einem Commit. Drei
   verschiedene Aufgaben, drei verschiedene Zustaende.

   Deshalb wird zuerst die Anbieterfrage gestellt. Eine Klasse, die der
   Anbieter gar nicht liefert, als BLOCKED_BY_LICENSE zu melden, waere eine
   Falschauskunft in Richtung Rechtsabteilung.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var DataClass = isNode ? require("./data-class.js")
                         : global.VURealtime.DataClass;
  var Capabilities = isNode ? require("../capabilities.js") : global.VUCapabilities;
  var Policy = isNode ? require("../display-policy.js") : global.VUDisplayPolicy;

  var NEGOTIATION_VERSION = "capability-negotiation-1.0.0";

  /* Die Klassen, ueber die verhandelt wird. UNAVAILABLE ist keine
     Faehigkeit, sondern das Ergebnis, wenn keine andere uebrig bleibt. */
  var NEGOTIABLE = DataClass.DATA_CLASSES.filter(function (c) {
    return c !== DataClass.TERMINAL_CLASS;
  });

  /**
   * Verhandelt alle Datenklassen fuer einen Zugang.
   *
   * @param {object} spec
   *   capabilities  Deklaration aus capabilities.js (Pflicht)
   *   gates         {ENABLE_LIVE_MARKET_DATA: bool, ...}
   *   audience      "internal" | "public"  (Standard: internal)
   *   providerId    ueberschreibt capabilities.providerId
   *   probe         optionaler Laufzeitbefund je Klasse:
   *                 {REALTIME_QUOTE: {result:"PASSED"|"FAILED"|"ERROR"|"UNKNOWN", ...}}
   *   errors        {KLASSE: "meldung"} - eine Pruefung ist gescheitert
   *
   * @returns {object} {version, providerId, audience, classes, order,
   *                    available, bestAvailable, unknown}
   */
  function negotiate(spec) {
    spec = spec || {};
    var caps = spec.capabilities || null;
    var providerId = spec.providerId || (caps && caps.providerId) || "unknown";
    var audience = spec.audience === "public" ? "public" : "internal";
    var gates = spec.gates || {};
    var probe = spec.probe || {};
    var errors = spec.errors || {};

    var classes = {};
    NEGOTIABLE.forEach(function (dc) {
      classes[dc] = judge(dc, {
        capabilities: caps, providerId: providerId, audience: audience,
        gates: gates, probe: probe[dc] || null, error: errors[dc] || null
      });
    });

    var available = NEGOTIABLE.filter(function (dc) { return classes[dc].usable; });
    var unknown = NEGOTIABLE.filter(function (dc) { return classes[dc].state === "UNKNOWN"; });

    return {
      version: NEGOTIATION_VERSION,
      providerId: providerId,
      audience: audience,
      plan: (caps && caps.plan) || "unknown",
      /* Die Deklaration reist mit. Nachgelagerte Schichten - etwa die
         Sitzungsrichtlinie - brauchen sie, und sie ein zweites Mal
         durchzureichen waere die Sorte Doppelung, bei der irgendwann
         beide Wege verschiedene Antworten geben. */
      capabilities: caps,
      classes: classes,
      order: NEGOTIABLE.slice(),
      available: available,
      bestAvailable: available.length ? available[0] : DataClass.TERMINAL_CLASS,
      unknown: unknown,
      checkedAt: spec.now ? new Date(spec.now).toISOString() : new Date().toISOString()
    };
  }

  /* Ein einzelnes Urteil. Die Reihenfolge der Abbrueche ist die Aussage
     dieser Funktion - siehe Modulkopf. */
  function judge(dataClass, ctx) {
    var capRef = DataClass.CLASS_CAPABILITY[dataClass];

    /* 0. Eine gescheiterte Pruefung ist kein Befund ueber den Anbieter.
       Sie steht vor allem anderen, damit ein Netzfehler nicht als
       "Anbieter kann das nicht" in die Matrix wandert. */
    if (ctx.error) {
      return DataClass.finding(dataClass, "ERROR", "probeFailed",
        { message: String(ctx.error) });
    }

    /* 1. Der Anbieter. Der Laufzeitbefund darf die Deklaration anheben und
       senken - er ist gemessen, sie ist geschrieben. */
    var declared = capRef && ctx.capabilities
      ? Capabilities.supports(ctx.capabilities, capRef.set, capRef.capability) ? true
        : Capabilities.explicitlyMissing(ctx.capabilities, capRef.set, capRef.capability) ? false
        : null
      : null;

    var state = DataClass.fromTriState(applyProbe(declared, ctx.probe));

    if (state === "UNAVAILABLE") {
      return DataClass.finding(dataClass, "UNAVAILABLE", "capabilityDeclaredMissing", {
        message: "Der Zugang " + ctx.providerId + " liefert diese Datenklasse nicht."
      });
    }
    if (state === "UNKNOWN") {
      return DataClass.finding(dataClass, "UNKNOWN", "capabilityUnverified", {
        message: "Fuer " + ctx.providerId + " ist diese Datenklasse weder belegt noch " +
                 "ausgeschlossen. Ungeprueft heisst nicht vorhanden."
      });
    }

    /* 2. Das Gate. Technisch vorhanden, betrieblich nicht freigegeben -
       das ist BLOCKED_BY_PLAN: es haengt an unserer Konfiguration bzw. am
       Tarif, nicht an einem fehlenden Vertrag. */
    var gate = DataClass.CLASS_GATE[dataClass];
    if (gate && ctx.gates[gate] !== true) {
      return DataClass.finding(dataClass, "BLOCKED_BY_PLAN", "gateDisabled", {
        gate: gate,
        message: "Die Datenklasse ist beim Anbieter vorhanden, aber " + gate +
                 " ist nicht gesetzt."
      });
    }

    /* 3. Die Lizenz. Erst jetzt, und mit der Zielgruppe, die tatsaechlich
       gefragt hat. Intern darf mehr als oeffentlich, und das ist so
       gewollt - sonst liesse sich nichts pruefen. */
    var licenseClass = DataClass.CLASS_LICENSE_CLASS[dataClass];
    var form = DataClass.isRealtimeClass(dataClass) ? "realtime" : "raw";
    var verdict = Policy.check({
      providerId: ctx.providerId, dataClass: licenseClass,
      audience: ctx.audience, form: form, gates: ctx.gates
    });
    if (!verdict.allowed) {
      /* Ein abgelehntes Gate innerhalb der Richtlinie bleibt
         BLOCKED_BY_PLAN - es ist dasselbe Nein wie oben, nur an einer
         zweiten Stelle geprueft. Alles andere ist eine Lizenzfrage. */
      var blocked = verdict.reason === "gateDisabled"
        ? "BLOCKED_BY_PLAN" : "BLOCKED_BY_LICENSE";
      return DataClass.finding(dataClass, blocked, verdict.reason, {
        message: verdict.message,
        basis: verdict.basis || null,
        licenseCheckedAt: verdict.checkedAt || null
      });
    }

    return DataClass.finding(dataClass, "AVAILABLE", null, {
      message: null,
      basis: verdict.basis || null,
      licenseCheckedAt: verdict.checkedAt || null
    });
  }

  /**
   * Der Laufzeitbefund ueber der Deklaration.
   *
   * PASSED hebt an, FAILED senkt ab, alles andere laesst die Deklaration
   * stehen. Insbesondere macht ein UNKNOWN-Befund aus einem deklarierten
   * true kein null: wer gemessen hat, dass er nichts messen konnte, hat
   * nichts widerlegt.
   */
  function applyProbe(declared, probe) {
    if (!probe || !probe.result) return declared;
    if (probe.result === "PASSED") return true;
    if (probe.result === "FAILED") return false;
    return declared;
  }

  /**
   * Die Matrix als Zeilen - fuer Bericht, Doku und Entwickleransicht.
   * Bewusst ohne jede Anbieter-Nutzlast: hier stehen Zustaende, keine Kurse.
   */
  function matrix(negotiation) {
    return negotiation.order.map(function (dc) {
      var f = negotiation.classes[dc];
      return {
        dataClass: dc, state: f.state, usable: f.usable,
        reason: f.reason, capability: f.capability
      };
    });
  }

  /** Kurzform fuer Protokolle. Enthaelt nie einen Schluessel oder Kurs. */
  function summarize(negotiation) {
    return negotiation.order.map(function (dc) {
      return dc + "=" + negotiation.classes[dc].state;
    }).join(" ");
  }

  var api = {
    NEGOTIATION_VERSION: NEGOTIATION_VERSION,
    NEGOTIABLE: NEGOTIABLE,
    negotiate: negotiate,
    matrix: matrix,
    summarize: summarize
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.CapabilityNegotiation = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
