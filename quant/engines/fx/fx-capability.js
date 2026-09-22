/* =========================================================================
   VISION UNIVERSE — fx/fx-capability.js   (Currency Layer V1, §5, §38)

   WAS DER BESTEHENDE ZUGANG AN FX TATSAECHLICH KANN.

   Der Auftrag beginnt mit einer Annahme des Owners: der vorhandene
   Tiingo-Vertrag umfasse FX-Daten. Diese Datei tut das Gegenteil von
   Zustimmen. Sie haelt fest, dass wir es nicht wissen.

   Das ist kein Zoegern, sondern die Regel, die dieses Repository seit
   Phase 2 traegt (quant/engines/capabilities.js): eine Faehigkeit hat drei
   Zustaende, und `null` heisst "ungeprueft". Ein bestehender Vertrag ist
   keine Messung. Er sagt, dass etwas erlaubt sein koennte - nicht, dass
   ein Endpunkt antwortet, welche Paare er fuehrt, wie tief seine Historie
   reicht und ob die Antwort oeffentlich gezeigt werden darf.

   DER UNTERSCHIED, DER HIER ZAEHLT

   "Tiingo kann Intraday" und "Tiingo kann Intraday-FX" sind zwei Aussagen.
   Die erste ist fuer Aktien belegt (Phase 4A), die zweite fuer Waehrungen
   nicht. Wer beide zusammenwirft, baut eine EUR-Anzeige auf einen Endpunkt,
   den niemand aufgerufen hat.

   WIE EIN null ZU true WIRD

   Durch scripts/market/probe-tiingo-fx.mjs - einen Lauf gegen den echten
   Zugang, der je Faehigkeit festhaelt, was geantwortet hat. Nicht durch
   das Lesen einer Tarifseite und nicht durch das Bearbeiten dieser Datei
   von Hand.

   LIZENZ IST KEINE FAEHIGKEIT

   Ob ein Abruf funktioniert und ob sein Ergebnis oeffentlich gezeigt
   werden darf, sind verschiedene Fragen. Die zweite beantwortet
   quant/engines/display-policy.js, nicht diese Datei. Ein erfolgreicher
   FX-Abruf ist keine Erlaubnis.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Capabilities = isNode ? require("../capabilities.js") : global.VUCapabilities;

  var VERSION = "fx-capability-1.0.0";

  /* Der Stand, den dieser Auftrag vorfindet. Jede FX-Faehigkeit ist
     ungeprueft, weil in dieser Session kein TIINGO_API_KEY vorliegt und
     damit kein Endpunkt befragt werden konnte.

     Die Zahlen unter `limits` sind bewusst leer statt geschaetzt. Ein
     geschaetztes Kontingent ist ein Ausfall mit Ansage - derselbe Befund
     wie beim Aktienkontingent im Commercial-Bericht (§211 dort). */
  var TIINGO_FX_UNVERIFIED = {
    plan: "commercial-internal-use",
    declaredAt: "2026-09-22",
    verifiedAt: null,
    fx: {
      fxCurrent:         null,
      fxDaily:           null,
      fxHistoricalDaily: null,
      fxIntraday:        null,
      fxRealtime:        null,
      fxWebsocket:       null,
      fxCrossPairs:      null,
      fxBulkQuotes:      null
    },
    limits: {},
    evidence: {
      fxCurrent:         { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; kein Endpunkt befragt." },
      fxDaily:           { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; kein Endpunkt befragt." },
      fxHistoricalDaily: { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; historische Tiefe nicht gemessen." },
      fxIntraday:        { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; Frequenz nicht gemessen." },
      fxRealtime:        { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; Verzoegerung nicht gemessen." },
      fxWebsocket:       { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; keine Verbindung aufgebaut." },
      fxCrossPairs:      { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; Paarliste nicht abgerufen." },
      fxBulkQuotes:      { verificationLevel: "UNVERIFIED", reason: "Kein Zugang in der Session; keine Sammelanfrage gestellt." }
    },
    notes: {
      contract: "Ein bestehender Commercial-Zugang fuer Aktienkurse sagt nichts ueber das FX-Produkt desselben Anbieters.",
      license: "Redistribution und oeffentliche Darstellung werden von display-policy.js entschieden, nicht hier.",
      cost: "Es wurde keine kostenpflichtige Funktion aktiviert und keine zweite Datenquelle angebunden."
    }
  };

  /* Welche Realtime-Stufe der Currency Layer fahren darf (§12).

     Die Reihenfolge ist eine Rangfolge des Aufwands, nicht der Qualitaet.
     Stufe A ist die Vorgabe, bis jemand einen Mehrwert von B oder C
     belegt: ein Aktienkurs, der sich im Sekundentakt bewegt, und ein
     Wechselkurs, der sich im Promillebereich des Tages bewegt, sind
     nicht dasselbe Problem. Eine zweite High-Frequency-Infrastruktur
     ohne gemessenen Nutzen waere Aufwand, Kontingent und Betriebsrisiko
     fuer eine Nachkommastelle. */
  var REALTIME_TIERS = {
    A: {
      id: "A",
      label: "Realtime-Aktie x letzter aktueller FX-Stand",
      requires: ["fxCurrent"],
      cost: "minimal - ein FX-Abruf je Aktualisierungsintervall, nicht je Tick",
      isDefault: true,
      reason: "Fuer eine Consumer-Anzeige in EUR ist die Bewegung des Aktienkurses um Groessenordnungen groesser als die des Wechselkurses innerhalb derselben Minute."
    },
    B: {
      id: "B",
      label: "Realtime-Aktie x Intraday-FX",
      requires: ["fxIntraday"],
      cost: "mittel - zusaetzliche Intraday-Abrufe je Paar",
      isDefault: false,
      reason: "Erst zu rechtfertigen, wenn ein Tagesverlauf messbar von Stufe A abweicht."
    },
    C: {
      id: "C",
      label: "Realtime-Aktie x Realtime-FX",
      requires: ["fxRealtime"],
      cost: "hoch - zweiter Push-Transport, eigener Betriebszustand",
      isDefault: false,
      reason: "Fuer eine Consumer-Darstellung nicht belegt. Nicht ohne Owner-Entscheidung bauen."
    }
  };

  function declareTiingoFx(spec) {
    var merged = spec || TIINGO_FX_UNVERIFIED;
    return Capabilities.declare("tiingo", merged);
  }

  /**
   * Welche Realtime-Stufe eine Deklaration traegt.
   *
   * Gibt immer eine Antwort und nie eine Vermutung: sind alle Faehigkeiten
   * ungeprueft, ist die Antwort `null` mit Grund - nicht Stufe A "weil die
   * ja eh die einfachste ist". Stufe A braucht fxCurrent, und auch das
   * muss jemand gemessen haben.
   */
  function resolveRealtimeTier(declaration) {
    var order = ["C", "B", "A"];
    var blocked = [];
    for (var i = 0; i < order.length; i++) {
      var tier = REALTIME_TIERS[order[i]];
      var ok = tier.requires.every(function (cap) {
        return Capabilities.supports(declaration, "fx", cap);
      });
      if (ok) return { tier: tier.id, label: tier.label, reason: tier.reason, blocked: blocked };
      blocked.push(tier.id);
    }
    return {
      tier: null,
      label: null,
      reason: "Keine FX-Faehigkeit ist belegt. Solange das so ist, liefert der Currency Layer UNAVAILABLE und das Produkt zeigt die native Waehrung.",
      blocked: blocked
    };
  }

  /**
   * Die Frage, die vor jedem Ausbau steht: muessen wir eine zweite Quelle
   * anbinden? Die ehrliche Antwort bei ungepruefter Lage ist "unbekannt",
   * nicht "ja".
   */
  function needsSecondSource(declaration) {
    var required = ["fxDaily", "fxHistoricalDaily", "fxCurrent"];
    var missing = [], unknown = [];
    required.forEach(function (cap) {
      if (Capabilities.explicitlyMissing(declaration, "fx", cap)) missing.push(cap);
      else if (!Capabilities.supports(declaration, "fx", cap)) unknown.push(cap);
    });
    if (missing.length) {
      return { answer: "YES", missing: missing, unknown: unknown,
               action: "OWNER_ESCALATION", reason: "Der bestehende Vertrag deckt " + missing.join(", ") + " ausdruecklich nicht ab." };
    }
    if (unknown.length) {
      return { answer: "UNKNOWN", missing: missing, unknown: unknown,
               action: "PROBE", reason: "Ungeprueft: " + unknown.join(", ") + ". Erst messen (scripts/market/probe-tiingo-fx.mjs), dann entscheiden." };
    }
    return { answer: "NO", missing: [], unknown: [],
             action: "USE_PRIMARY", reason: "Der bestehende Zugang deckt den Bedarf. Eine zweite kommerzielle Quelle waere Komfort, kein Erfordernis." };
  }

  var api = {
    VERSION: VERSION,
    TIINGO_FX_UNVERIFIED: TIINGO_FX_UNVERIFIED,
    REALTIME_TIERS: REALTIME_TIERS,
    declareTiingoFx: declareTiingoFx,
    resolveRealtimeTier: resolveRealtimeTier,
    needsSecondSource: needsSecondSource
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Capability = api; }
})(typeof window !== "undefined" ? window : globalThis);
