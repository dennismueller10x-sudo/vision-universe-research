/* =========================================================================
   VISION UNIVERSE SOCIAL — kill-switch.js
   GLOBALE UND PROVIDERWEISE ABSCHALTUNG (§33)

   Zwei Schalter, nicht einer:

     GLOBAL_AUTOPUBLISH   schaltet jede automatische Veroeffentlichung ab
     <provider>           schaltet genau eine Plattform ab

   WARUM DIE REIHENFOLGE ZAEHLT

   Der globale Schalter gewinnt immer. Ein Provider kann nicht "aktiver"
   sein als das System. Umgekehrt darf ein einzelner ausgefallener
   Provider das Gesamtsystem nicht blockieren (§33 Satz 3) — deshalb ist
   die Abschaltung je Provider getrennt und hat keine Wirkung auf die
   anderen.

   DIE FREISCHALTUNG IST EIN COMMIT

   Wie bei den Feature-Gates des Quant-Bereichs (quant/config/feature-gates.json)
   steht der Zustand als Datei im Repository. Das ist keine Umstaendlichkeit:
   auf GitHub Pages gibt es keine Umgebungsvariablen und keine Oberflaeche
   mit Schreibrecht. Eine Datei im Repository ist nachvollziehbar, hat einen
   Autor, ein Datum und eine Begruendung — ein Klick hat das nicht.

   WAS DER KILL SWITCH NICHT ABSCHALTET

   Beobachtung, Analyse, Entwurf und Messung laufen weiter. Abgeschaltet
   wird die AUSGEHENDE HANDLUNG. Ein System, das bei jedem Zweifel blind
   wird, kann nicht beurteilen, wann es wieder sehen darf.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Handlungen, die ueberhaupt gesperrt werden koennen. Alles, was hier
     nicht steht, ist keine ausgehende Handlung und wird nie gesperrt. */
  var GUARDED_ACTIONS = ["publish", "schedule", "comment", "delete"];

  function fail(m) { throw new Error("VUSocialKillSwitch: " + m); }

  /**
   * Baut den Schalterzustand aus der Konfigurationsdatei.
   *
   * Ein FEHLENDER Eintrag bedeutet AUS. Das ist die entscheidende
   * Voreinstellung: wer einen neuen Provider hinzufuegt und die Konfiguration
   * vergisst, bekommt Stille — nicht einen Beitrag.
   */
  function fromConfig(config) {
    config = config || {};
    var gates = config.gates || {};

    function gate(name) {
      var entry = gates[name];
      if (!entry) return { enabled: false, reason: "kein Eintrag in der Konfiguration", changedAt: null };
      return {
        enabled: entry.enabled === true,
        reason: entry.reason || "",
        changedAt: entry.changedAt || null
      };
    }

    var globalGate = gate("GLOBAL_AUTOPUBLISH");

    /**
     * Die einzige Frage, die das Publishing stellt.
     * Gibt IMMER eine Begruendung zurueck — auch im erlaubten Fall, damit
     * das Audit-Log (§42) sie mitschreiben kann.
     */
    function allows(providerId, action) {
      action = action || "publish";
      if (GUARDED_ACTIONS.indexOf(action) === -1) fail("unbekannte Handlung: " + action);
      if (!providerId) fail("allows() ohne providerId");

      if (!globalGate.enabled) {
        return {
          allowed: false,
          blockedBy: "GLOBAL_AUTOPUBLISH",
          reason: "Globale automatische Veroeffentlichung ist aus. " + (globalGate.reason || ""),
          changedAt: globalGate.changedAt
        };
      }

      var providerGate = gate("PROVIDER_" + String(providerId).toUpperCase());
      if (!providerGate.enabled) {
        return {
          allowed: false,
          blockedBy: "PROVIDER_" + String(providerId).toUpperCase(),
          reason: "Dieser Provider ist abgeschaltet. " + (providerGate.reason || ""),
          changedAt: providerGate.changedAt
        };
      }

      /* Handlungen jenseits von publish/schedule brauchen einen eigenen
         Schalter. "Wir duerfen posten" ist keine Erlaubnis zu kommentieren
         oder zu loeschen. */
      if (action === "comment" || action === "delete") {
        var actionGate = gate("ACTION_" + action.toUpperCase());
        if (!actionGate.enabled) {
          return {
            allowed: false,
            blockedBy: "ACTION_" + action.toUpperCase(),
            reason: "Die Handlung '" + action + "' ist nicht freigeschaltet. " + (actionGate.reason || ""),
            changedAt: actionGate.changedAt
          };
        }
      }

      return {
        allowed: true,
        blockedBy: null,
        reason: "Global und providerseitig freigegeben.",
        changedAt: providerGate.changedAt
      };
    }

    /** Uebersicht fuer das Command Center (§31) und die Health Matrix. */
    function summary(providerIds) {
      return {
        global: globalGate,
        providers: (providerIds || []).map(function (id) {
          var g = gate("PROVIDER_" + String(id).toUpperCase());
          return {
            providerId: id,
            enabled: globalGate.enabled && g.enabled,
            providerGate: g.enabled,
            /* Sichtbar machen, WARUM etwas aus ist. "aus" ohne Grund
               fuehrt dazu, dass jemand es einschaltet, um zu sehen was
               passiert. */
            effectiveReason: !globalGate.enabled ? "global aus"
                           : !g.enabled ? (g.reason || "providerseitig aus")
                           : "frei"
          };
        })
      };
    }

    return {
      allows: allows,
      summary: summary,
      globalEnabled: globalGate.enabled,
      schemaVersion: config.schemaVersion || null
    };
  }

  var api = {
    GUARDED_ACTIONS: GUARDED_ACTIONS,
    fromConfig: fromConfig
  };

  if (isNode) module.exports = api;
  else global.VUSocialKillSwitch = api;
})(typeof window !== "undefined" ? window : globalThis);
