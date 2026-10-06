/* =========================================================================
   VISION UNIVERSE SOCIAL — autonomy.js
   AUTONOMIESTUFEN UND IHRE VORAUSSETZUNGEN (§16)

   Sechs Stufen, 0 bis 5. Die Architektur ist auf 5 ausgelegt; der Betrieb
   beginnt weit darunter.

   DER KERN DIESER DATEI

   Eine Autonomiestufe ist keine Einstellung, sondern ein ERGEBNIS. Sie
   gilt nur, wenn ihre Voraussetzungen erfuellt sind — und die werden hier
   gegen den tatsaechlichen Systemzustand geprueft, nicht gegen eine
   Absicht in einer Konfigurationsdatei.

   Wer Stufe 4 eintraegt, waehrend die Analytics-Kette seit drei Tagen
   nichts geliefert hat, bekommt Stufe 2 — und eine Liste, was fehlt. Das
   ist der Unterschied zwischen "wir haben Autonomie konfiguriert" und
   "das System darf autonom handeln".

   §45 (NO FAKE AUTONOMY) ist hier operativ: die effektive Stufe ist das,
   was die Oberflaeche anzeigt. Niemals die gewuenschte.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var LEVELS = [
    { level: 0, id: "RESEARCH_ONLY",      label: "Nur Beobachtung",
      description: "Signale sammeln, Trends bewerten. Kein Entwurf, keine Veroeffentlichung." },
    { level: 1, id: "SUGGESTIONS",        label: "Vorschlaege",
      description: "Das System schlaegt Themen vor. Texte entstehen von Hand." },
    { level: 2, id: "AUTO_DRAFT",         label: "Automatischer Entwurf",
      description: "Das System erzeugt Content Packages. Freigabe und Terminierung von Hand." },
    { level: 3, id: "AUTO_SCHEDULE",      label: "Automatische Terminierung",
      description: "Das System plant den Zeitpunkt. Die Veroeffentlichung braucht eine Freigabe." },
    { level: 4, id: "AUTO_PUBLISH",       label: "Automatische Veroeffentlichung",
      description: "Veroeffentlichung innerhalb freigegebener Richtlinien, ohne Einzelfreigabe." },
    { level: 5, id: "AUTONOMOUS_OPS",     label: "Autonomer Betrieb",
      description: "Strategie, Mischung und Experimente steuert das System selbst." }
  ];

  /* Voraussetzungen je Stufe. Kumulativ: Stufe 4 erfuellt auch alles,
     was Stufe 3 verlangt. Die IDs entsprechen Feldern im Zustandsbericht,
     damit die Pruefung datengetrieben bleibt und nicht aus if-Ketten
     besteht, die jemand "nur kurz" umgeht. */
  var REQUIREMENTS = {
    0: [],
    1: ["signalsAvailable"],
    2: ["signalsAvailable", "contentPipelineHealthy"],
    3: ["signalsAvailable", "contentPipelineHealthy", "brandValidationHealthy", "factValidationHealthy"],
    4: ["signalsAvailable", "contentPipelineHealthy", "brandValidationHealthy", "factValidationHealthy",
        "providerStable", "publishingStable", "analyticsCorrect", "killSwitchPresent", "rollbackPresent"],
    5: ["signalsAvailable", "contentPipelineHealthy", "brandValidationHealthy", "factValidationHealthy",
        "providerStable", "publishingStable", "analyticsCorrect", "killSwitchPresent", "rollbackPresent",
        "learningValidated", "experimentsValidated"]
  };

  var REQUIREMENT_LABELS = {
    signalsAvailable:       "Mindestens eine Signalquelle liefert aktuelle Daten",
    contentPipelineHealthy: "Die Content-Pipeline laeuft fehlerfrei durch",
    brandValidationHealthy: "Die Brand-Pruefung ist aktiv und getestet",
    factValidationHealthy:  "Die Faktenpruefung ist aktiv und getestet",
    providerStable:         "Der Provider meldet seit dem Beobachtungsfenster PASS",
    publishingStable:       "Veroeffentlichungen laufen ohne unbehandelte Fehler",
    analyticsCorrect:       "Analytics werden vollstaendig und plausibel eingelesen",
    killSwitchPresent:      "Kill Switch vorhanden und wirksam",
    rollbackPresent:        "Strategie-Rollback vorhanden und getestet",
    learningValidated:      "Die Learning Engine hat belastbare Stichproben",
    experimentsValidated:   "Die Experiment-Engine liefert entschiedene Experimente"
  };

  function fail(m) { throw new Error("VUSocialAutonomy: " + m); }

  function levelInfo(level) {
    var found = LEVELS.filter(function (l) { return l.level === level; })[0];
    if (!found) fail("unbekannte Autonomiestufe: " + level);
    return found;
  }

  /**
   * Die effektive Stufe.
   *
   * @param desiredLevel  Was der Owner eingetragen hat.
   * @param readiness     Der gemessene Zustand: { signalsAvailable: true, ... }
   *                      Ein FEHLENDES Feld gilt als NICHT erfuellt — nicht
   *                      als "wahrscheinlich in Ordnung".
   */
  function effectiveLevel(desiredLevel, readiness) {
    var desired = Number(desiredLevel);
    if (!Number.isInteger(desired) || desired < 0 || desired > 5) fail("ungueltige Wunschstufe: " + desiredLevel);
    readiness = readiness || {};

    var missingByLevel = {};
    var granted = 0;

    for (var level = 0; level <= desired; level++) {
      var missing = REQUIREMENTS[level].filter(function (req) {
        return readiness[req] !== true;
      });
      missingByLevel[level] = missing;
      if (missing.length === 0) granted = level;
      else break;   /* Stufen sind kumulativ: was hier scheitert, scheitert auch darueber. */
    }

    var blocking = missingByLevel[granted + 1] || [];

    return {
      desired: desired,
      effective: granted,
      /* capped ist die Aussage, die im Command Center steht: "Sie wollten
         4, das System laeuft auf 2, weil X und Y fehlen." */
      capped: granted < desired,
      info: levelInfo(granted),
      missing: blocking.map(function (id) {
        return { id: id, label: REQUIREMENT_LABELS[id] || id };
      }),
      /* Die Erklaerung in einem Satz (§32). */
      explanation: granted >= desired
        ? "Stufe " + granted + " (" + levelInfo(granted).label + ") ist erreicht: alle Voraussetzungen erfuellt."
        : "Stufe " + desired + " angefordert, wirksam ist Stufe " + granted + " (" + levelInfo(granted).label +
          "). Es fehlt: " + blocking.map(function (id) { return REQUIREMENT_LABELS[id] || id; }).join("; ") + "."
    };
  }

  /** Darf auf dieser Stufe ohne Einzelfreigabe veroeffentlicht werden? */
  function allowsUnattendedPublish(effective) {
    return Number(effective) >= 4;
  }

  /** Darf auf dieser Stufe automatisch terminiert werden? */
  function allowsAutoSchedule(effective) {
    return Number(effective) >= 3;
  }

  /** Darf auf dieser Stufe automatisch entworfen werden? */
  function allowsAutoDraft(effective) {
    return Number(effective) >= 2;
  }

  var api = {
    LEVELS: LEVELS,
    REQUIREMENTS: REQUIREMENTS,
    REQUIREMENT_LABELS: REQUIREMENT_LABELS,
    levelInfo: levelInfo,
    effectiveLevel: effectiveLevel,
    allowsUnattendedPublish: allowsUnattendedPublish,
    allowsAutoSchedule: allowsAutoSchedule,
    allowsAutoDraft: allowsAutoDraft
  };

  if (isNode) module.exports = api;
  else global.VUSocialAutonomy = api;
})(typeof window !== "undefined" ? window : globalThis);
