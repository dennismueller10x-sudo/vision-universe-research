/* =========================================================================
   VISION UNIVERSE QUANT — data-mode.js
   DATA MODE UND HERKUNFTSKENNZEICHNUNG (Phase 2, §9, §10, §11, §19, §27)

   Drei Betriebsarten:

     mock     ausschliesslich MockProvider — der V1-Zustand, jederzeit
              vollstaendig funktionsfaehig
     hybrid   echte Marktdaten, synthetische Fundamentaldaten
     live     spaeter, wenn auch Fundamentals aus lizenzierten Quellen kommen

   DIE ZENTRALE REGEL DIESER DATEI:

       Es gibt keinen stillen Rueckfall auf Mock-Daten.

   Faellt eine Live-Quelle aus, wird das ANGEZEIGT. Der Nutzer sieht
   "Live-Daten nicht verfuegbar — Demo-Daten dargestellt", nicht klaglos
   synthetische Kurse, die aussehen wie echte. Ein Backtest auf einer
   Mischung, die niemand mehr auseinanderhalten kann, ist wertlos — und
   gefaehrlich, weil er trotzdem ueberzeugend aussieht.

   Jede Datenklasse traegt deshalb ihre eigene Herkunft. "Die Seite zeigt
   Live-Daten" ist keine zulaessige Aussage; zulaessig ist nur "Kurse live,
   Fundamentaldaten Demo".
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var MODES = ["mock", "hybrid", "live"];

  /* Datenklassen, deren Herkunft getrennt ausgewiesen wird. */
  var DATA_CLASSES = ["marketData", "fundamentals", "corporateActions", "estimates", "macro", "news"];

  /* Herkunft eines Datenpunkts. */
  var ORIGINS = {
    live: { id: "live", label: "Live", tone: "strong", real: true,
            description: "Echte Marktdaten des Anbieters, aktuell abgerufen." },
    delayed: { id: "delayed", label: "Verzoegert", tone: "good", real: true,
               description: "Echte Marktdaten mit anbieterseitiger Verzoegerung." },
    endOfDay: { id: "endOfDay", label: "Tagesschluss", tone: "good", real: true,
                description: "Echte Schlusskurse des letzten Handelstages." },
    mock: { id: "mock", label: "Demo", tone: "neutral", real: false,
            description: "Synthetische Daten. Keine realen Unternehmen, keine reale Wertentwicklung." },
    unavailable: { id: "unavailable", label: "Nicht verfuegbar", tone: "poor", real: false,
                   description: "Fuer diese Datenklasse liegt keine Quelle vor." },
    capabilityMissing: { id: "capabilityMissing", label: "Vom Anbieter nicht bereitgestellt", tone: "poor", real: false,
                         description: "Der konfigurierte Anbieter stellt diese Datenklasse nicht bereit." },
    stale: { id: "stale", label: "Veraltet", tone: "weak", real: true,
             description: "Echte Daten aus dem Cache; ein aktueller Abruf war nicht moeglich." }
  };

  function normalizeMode(value) {
    var mode = String(value || "mock").toLowerCase().trim();
    return MODES.indexOf(mode) === -1 ? "mock" : mode;
  }

  /**
   * Liest den Modus aus der Umgebung. Im Browser gibt es keine
   * Umgebungsvariablen — dort kommt der Modus aus der vom Build-Schritt
   * erzeugten data-status.json. Unbekannte Werte fallen auf "mock"
   * zurueck: der sichere Zustand ist der, in dem nichts als echt gilt.
   */
  function resolveMode(env) {
    env = env || {};
    return normalizeMode(env.DATA_MODE || env.VU_DATA_MODE);
  }

  /**
   * Bringt einen Zustand auf das interne Vokabular.
   *
   * Es gibt zwei Sprechweisen im System, und sie treffen sich genau hier:
   * die Provider und der MarketClient antworten mit Huellen der Form
   * {available, reason, origin}, dieses Modul denkt in {live, stale,
   * capabilityMissing}. Diese Naht ist der Ort, an dem sich ein Zustand
   * stillschweigend in sein Gegenteil verkehren koennte — ein
   * `{available: true}`, das hier als "nicht live" ankommt, wuerde echte
   * Kurse als Demo-Daten ausweisen. Darum wird beides ausdruecklich
   * akzeptiert und ineinander uebersetzt, statt sich auf eine Konvention
   * zu verlassen, die irgendwo im Aufrufpfad verloren gehen kann.
   */
  function normalizeState(raw) {
    var s = raw || {};
    var out = {
      live: s.live === true,
      stale: s.stale === true,
      capabilityMissing: s.capabilityMissing === true || s.reason === "providerCapabilityMissing",
      quoteType: s.quoteType || null,
      provider: s.provider || null,
      asOf: s.asOf || null,
      lastSuccessAt: s.lastSuccessAt || null,
      message: s.message || null
    };
    if (typeof s.available === "boolean") {
      out.live = s.available === true && s.stale !== true;
      if (s.available === true && s.origin && ORIGINS[s.origin]) out.quoteType = s.origin;
    }
    if (!out.message && s.available === false && s.reason) {
      out.message = "Datenklasse nicht verfuegbar (" + s.reason + ").";
    }
    return out;
  }

  /**
   * Bestimmt je Datenklasse die tatsaechliche Herkunft.
   *
   * @param {string} mode
   * @param {object} availability  je Datenklasse entweder
   *   {live, stale, capabilityMissing, quoteType, provider, asOf, message}
   *   oder eine Provider-Huelle {available, reason, origin}.
   */
  function resolveSources(mode, availability) {
    mode = normalizeMode(mode);
    availability = availability || {};
    var out = { mode: mode, classes: {}, sources: {}, anyReal: false, anyMock: false, degraded: [] };

    DATA_CLASSES.forEach(function (cls) {
      var state = normalizeState(availability[cls]);
      var origin;

      if (mode === "mock") {
        origin = cls === "marketData" || cls === "fundamentals" || cls === "corporateActions"
          ? ORIGINS.mock : ORIGINS.unavailable;
      } else if (state.capabilityMissing) {
        /* Gilt fuer JEDE Datenklasse: "der Anbieter kann das grundsaetzlich
           nicht" ist keine Demo-Situation und kein Ausfall. Es ist der
           einzige Zustand, der sich durch einen Plan- oder Anbieterwechsel
           loesen laesst, und die UI muss ihn genau so benennen koennen. */
        origin = ORIGINS.capabilityMissing;
      } else if (cls === "marketData") {
        if (state.live) origin = ORIGINS[state.quoteType] || ORIGINS.endOfDay;
        else if (state.stale) origin = ORIGINS.stale;
        else origin = ORIGINS.mock;             // Ausfall -> Demo, aber sichtbar
      } else if (cls === "fundamentals" || cls === "corporateActions") {
        /* Auch im Live-Modus bleiben Fundamentaldaten synthetisch, solange
           kein Anbieter die PIT-Pruefung bestanden hat. */
        origin = (mode === "live" && state.live) ? ORIGINS.live : ORIGINS.mock;
      } else {
        origin = state.live ? ORIGINS.live : ORIGINS.unavailable;
      }

      var entry = {
        dataClass: cls,
        origin: origin.id,
        label: origin.label,
        tone: origin.tone,
        isReal: origin.real,
        description: origin.description,
        provider: state.provider || (origin.real ? null : "VisionUniverseMock"),
        asOf: state.asOf || null,
        lastSuccessAt: state.lastSuccessAt || null,
        message: state.message || null
      };

      /* Ein Ausfall echter Daten wird ausdruecklich als Degradierung
         vermerkt — er darf nicht als normaler Demo-Betrieb durchgehen. */
      if (mode !== "mock" && cls === "marketData" && origin.id === "mock") {
        entry.degraded = true;
        entry.message = state.message ||
          "Live-Marktdaten sind derzeit nicht verfuegbar. Dargestellt werden Demo-Daten.";
        out.degraded.push(cls);
      }
      if (origin.id === "stale") {
        entry.degraded = true;
        out.degraded.push(cls);
      }

      out.classes[cls] = entry;
      /* Kurzform fuer Aufrufer, die nur die Herkunft brauchen. */
      out.sources[cls] = origin.id;
      if (origin.real) out.anyReal = true;
      if (origin.id === "mock") out.anyMock = true;
    });

    return out;
  }

  /**
   * Ein einzelner Satz, der die Herkunft zusammenfasst. Bewusst nie
   * "Live-Daten" allein — solange irgendetwas synthetisch ist, steht das
   * dabei.
   */
  function summarize(resolution) {
    var market = resolution.classes.marketData;
    var fundamentals = resolution.classes.fundamentals;
    if (resolution.mode === "mock") {
      return "Alle Daten synthetisch (Demo-Modus).";
    }
    var parts = [];
    parts.push("Kurse: " + market.label + (market.provider ? " (" + market.provider + ")" : ""));
    parts.push("Fundamentaldaten: " + fundamentals.label);

    /* Der Satz muss den synthetischen Anteil beim Namen nennen. "Kurse:
       Tagesschluss · Fundamentaldaten: Demo" liest sich fuer jemanden, der
       die Begriffe nicht kennt, wie zwei Datenquellen gleichen Ranges.
       Solange irgendetwas synthetisch ist, steht das ausgeschrieben dabei. */
    if (resolution.anyMock) {
      var syntheticClasses = DATA_CLASSES.filter(function (c) {
        return resolution.classes[c] && resolution.classes[c].origin === "mock";
      });
      parts.push("synthetisch: " + syntheticClasses.join(", "));
    }
    if (resolution.degraded.length) {
      parts.push("eingeschraenkt (" + resolution.degraded.join(", ") + ")");
    }
    return parts.join(" · ");
  }

  /** Darf aus diesen Quellen ein historischer Backtest gerechnet werden? */
  function backtestEligibility(resolution) {
    var fundamentals = resolution.classes.fundamentals;
    var market = resolution.classes.marketData;
    if (!fundamentals.isReal) {
      return {
        allowed: true, realEvidence: false,
        note: "Der Backtest laeuft auf synthetischen Fundamentaldaten. Er belegt die Funktionsweise der " +
              "Engine, nicht die historische Tragfaehigkeit der Strategie." +
              (market.isReal ? " Auch echte Kurse aendern daran nichts, solange die Fundamentaldaten " +
               "synthetisch sind — eine Mischung ist als Evidenz nicht belastbarer als der reine Demo-Modus." : "")
      };
    }
    return { allowed: true, realEvidence: true, note: "Backtest auf lizenzierten historischen Daten." };
  }

  var api = {
    MODES: MODES, DATA_CLASSES: DATA_CLASSES, ORIGINS: ORIGINS,
    normalizeMode: normalizeMode, normalizeState: normalizeState, resolveMode: resolveMode,
    resolveSources: resolveSources, summarize: summarize,
    backtestEligibility: backtestEligibility
  };

  if (isNode) module.exports = api;
  else global.VUDataMode = api;
})(typeof window !== "undefined" ? window : globalThis);
