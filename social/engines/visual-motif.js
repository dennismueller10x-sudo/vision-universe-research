/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-motif.js

   DAS MOTIV FOLGT DER STORY (§10 DES CREATIVE-PRODUCTION-AUFTRAGS)

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   request-creative.mjs bat den Creative Agent bisher IMMER um dieselbe
   Szene: "FUTURE_TECH", "Eine hochwertige, abstrakte Future-Tech-Szene".
   Ein Halbleiterhersteller und ein Pharmakonzern bekamen dieselbe
   Anweisung - das Motiv folgte der Anfrage, nicht der Geschichte.

   -------------------------------------------------------------------------
   WOHER DAS THEMA KOMMT — NICHT ERFUNDEN
   -------------------------------------------------------------------------

   Die Branche eines Titels steht bereits im Repository, aus einer
   amtlichen Klassifikation: `quant/data/product/sic-peer-taxonomy-v1.json`
   traegt je Symbol den SIC-Code (Standard Industrial Classification, aus
   den SEC-Einreichungen selbst - `cik` steht in derselben Zeile). Diese
   Datei ordnet SIC-Codes auf ein sichtbares Motiv - keine neue Datenquelle,
   nur eine neue Lesart einer vorhandenen.

   Passt kein SIC-Code zu einem konkreten Motiv, bleibt es beim bisherigen
   generischen FUTURE_TECH - das ist der sichere Rueckfall, nicht ein
   Fehler.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var fs = isNode ? require("node:fs") : null;
  var path = isNode ? require("node:path") : null;

  /* -------------------------------------------------------------------
     DIE SIC4-PRAEFIXE, DIE EIN KONKRETES MOTIV TRAGEN

     Nur die Faelle aus §10 des Auftrags, plus ein paar naheliegende
     Nachbarn derselben Branche. Kein Anspruch auf Vollstaendigkeit -
     ein SIC-Code, der hier nicht steht, faellt auf FUTURE_TECH zurueck,
     nicht auf eine geratene Zuordnung.
     ------------------------------------------------------------------- */
  var SIC4_MOTIVE = {
    /* Halbleiter */
    "3674": { strategy: "SEMICONDUCTOR_WORLD", label: "Halbleiter",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Halbleiterfertigung: Wafer, Reinraum, Chip-Struktur in " +
        "Makroaufnahme. Keine lesbare Marke, kein Logo eines Dritten." },
    "3559": { strategy: "SEMICONDUCTOR_WORLD", label: "Halbleiter-Anlagenbau",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Fertigungsanlagentechnik fuer Halbleiter: Praezisionsmaschinen, " +
        "Reinraum-Atmosphaere. Keine lesbare Marke." },

    /* Automobil / autonomes Fahren */
    "3711": { strategy: "ROBOTICS", label: "Fahrzeugbau",
      instruction: "Eine hochwertige, abstrakte Szene mit Fahrzeug- oder " +
        "Sensorwelt: eine Strasse bei Daemmerung, LIDAR-Punktwolken, ein " +
        "stilisiertes Fahrzeug. Keine lesbare Marke, kein konkretes " +
        "Fahrzeugmodell." },
    "3714": { strategy: "ROBOTICS", label: "Fahrzeugtechnik",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Fahrzeugtechnik: Praezisionsbauteile, Fertigungslinie, " +
        "technische Detailaufnahme. Keine lesbare Marke." },
    /* SIC 3827 traegt real in den Daten Halbleiter-Messtechnik (KLAC,
       CAMT, NVMI - Inspektions- und Metrologiegeraete, nicht
       allgemeine Robotik), 3559 Halbleiter-Anlagenbau (ASML, ACLS,
       ACMR). Beide bekommen deshalb dasselbe Motiv wie 3674, nicht ein
       geratenes Robotik-Bild. */
    "3827": { strategy: "SEMICONDUCTOR_WORLD", label: "Halbleiter-Messtechnik",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Halbleiterfertigung: Wafer, Reinraum, Chip-Struktur in " +
        "Makroaufnahme. Keine lesbare Marke, kein Logo eines Dritten." },

    /* Software / Cloud / KI-Infrastruktur / Cybersecurity */
    "7372": { strategy: "AI_INFRASTRUCTURE", label: "Software",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Rechenzentrums- und KI-Infrastruktur: Server-Reihen, " +
        "Datenfluss-Visualisierung, kuehles Licht. Keine lesbare Marke, " +
        "kein Logo eines Dritten." },
    "7371": { strategy: "AI_INFRASTRUCTURE", label: "IT-Dienstleistung",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Rechenzentrums- und KI-Infrastruktur: Server-Reihen, " +
        "Datenfluss-Visualisierung, kuehles Licht. Keine lesbare Marke." },
    "7379": { strategy: "AI_INFRASTRUCTURE", label: "Computerdienste",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Rechenzentrums- und KI-Infrastruktur: Server-Reihen, " +
        "Datenfluss-Visualisierung, kuehles Licht. Keine lesbare Marke." },
    "7373": { strategy: "AI_INFRASTRUCTURE", label: "Systemintegration",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Netzwerk- und Sicherheitsinfrastruktur: verschluesselte " +
        "Datenstroeme, digitale Schutzschicht, kuehles Licht. Keine " +
        "lesbare Marke." },

    /* Raumfahrt / Luftfahrt. 3812 (Navigations-, Fuehrungs- und
       Flugelektronik: LHX, DRS, GRMN, LUNR) und 3721 (Flugzeugbau: BA,
       AVAV, ACHR) sind in den echten Daten belegt; 3761 (Lenkflugkoerper
       und Raumfahrzeuge im engeren Sinn) hat im aktuellen Bestand keine
       Titel, bleibt aber als korrekte Zuordnung stehen. */
    "3761": { strategy: "FUTURE_TECH", label: "Raumfahrt",
      instruction: "Eine hochwertige, abstrakte Weltraum-Szene: Orbit, " +
        "Satellit, Erdkruemmung im Hintergrund. Keine lesbare Marke, " +
        "keine Flagge, kein Logo eines Dritten." },
    "3812": { strategy: "FUTURE_TECH", label: "Luft- und Raumfahrttechnik",
      instruction: "Eine hochwertige, abstrakte Weltraum- oder " +
        "Luftfahrt-Szene: Orbit, Instrumentierung, praezise Technik. " +
        "Keine lesbare Marke." },
    "3721": { strategy: "FUTURE_TECH", label: "Flugzeugbau",
      instruction: "Eine hochwertige, abstrakte Luftfahrt-Szene: " +
        "Flugzeugsilhouette, Triebwerk in Makroaufnahme, praezise " +
        "Technik. Keine lesbare Marke, kein konkretes Flugzeugmodell." },

    /* Energie / Versorger */
    "4911": { strategy: "FUTURE_TECH", label: "Energieversorgung",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Energieinfrastruktur: Stromnetz, Umspannwerk bei Daemmerung, " +
        "Energiefluss-Visualisierung. Keine lesbare Marke." },
    "4931": { strategy: "FUTURE_TECH", label: "Energieversorgung",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Energieinfrastruktur: Stromnetz, Umspannwerk bei Daemmerung, " +
        "Energiefluss-Visualisierung. Keine lesbare Marke." },
    "2911": { strategy: "FUTURE_TECH", label: "Energie / Raffinerie",
      instruction: "Eine hochwertige, abstrakte Szene aus der " +
        "Energieinfrastruktur: Raffinerie- oder Pipeline-Silhouette bei " +
        "Daemmerung, industrielle Praezision. Keine lesbare Marke." },

    /* Gesundheit / Pharma / Biotech */
    "2836": { strategy: "FUTURE_TECH", label: "Biotechnologie",
      instruction: "Eine hochwertige, abstrakte Labor-Szene: " +
        "Molekuelstruktur, Praezisionsinstrumente, steriles Licht. " +
        "Keine lesbare Marke, kein Markenname eines Medikaments." },
    "2834": { strategy: "FUTURE_TECH", label: "Pharmazeutik",
      instruction: "Eine hochwertige, abstrakte Labor-Szene: " +
        "Molekuelstruktur, Praezisionsinstrumente, steriles Licht. " +
        "Keine lesbare Marke, kein Markenname eines Medikaments." },
    "8731": { strategy: "FUTURE_TECH", label: "Biologische Forschung",
      instruction: "Eine hochwertige, abstrakte Labor-Szene: " +
        "Molekuelstruktur, Praezisionsinstrumente, steriles Licht. " +
        "Keine lesbare Marke." }
  };

  var STANDARD = {
    strategy: "FUTURE_TECH", label: "generisch",
    instruction: "Eine hochwertige, abstrakte Future-Tech-Szene im " +
      "Vision-Universe-Register. Sie illustriert Messung und Einordnung " +
      "— nicht Kursverlauf und nicht Gewinn."
  };

  var PALETTE = ["deep black", "white", "chrome", "electric cyan", "subtle violet"];

  var _taxonomieCache = null;
  function ladeTaxonomie(root) {
    if (_taxonomieCache) return _taxonomieCache;
    var pfad = path.join(root || process.cwd(),
      "quant/data/product/sic-peer-taxonomy-v1.json");
    if (!fs.existsSync(pfad)) { _taxonomieCache = { spalten: [], zeilen: [] }; return _taxonomieCache; }
    var roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
    _taxonomieCache = { spalten: roh.rowColumns || [], zeilen: roh.rows || [] };
    return _taxonomieCache;
  }

  /** Der SIC4-Code eines Symbols, oder null. Nichts geraten: fehlt der
      Eintrag, ist das Ergebnis null, nicht ein geratener Code. */
  function sic4Fuer(symbol, root) {
    var t = ladeTaxonomie(root);
    var iTicker = t.spalten.indexOf("ticker");
    var iSic4 = t.spalten.indexOf("sic4");
    if (iTicker === -1 || iSic4 === -1) return null;
    var zeile = t.zeilen.find(function (z) { return z[iTicker] === symbol; });
    return zeile ? (zeile[iSic4] || null) : null;
  }

  /**
   * Das Motiv fuer ein Symbol: welche generative Strategie, welche
   * Anweisung an den Agenten, welche Palette. Ohne Treffer der sichere
   * generische Rueckfall - kein geratenes Motiv.
   */
  function motivFuer(symbol, root) {
    var sic4 = sic4Fuer(symbol, root);
    var eintrag = (sic4 && SIC4_MOTIVE[sic4]) || STANDARD;
    return {
      symbol: symbol,
      sic4: sic4,
      strategy: eintrag.strategy,
      label: eintrag.label,
      instruction: eintrag.instruction,
      palette: PALETTE.slice(),
      explanation: sic4
        ? "SIC " + sic4 + " (" + eintrag.label + ") -> " + eintrag.strategy
        : "Kein SIC-Eintrag fuer " + symbol + " -> generischer Rueckfall " +
          eintrag.strategy
    };
  }

  var api = {
    SIC4_MOTIVE: SIC4_MOTIVE,
    STANDARD: STANDARD,
    sic4Fuer: sic4Fuer,
    motivFuer: motivFuer
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisualMotif = api;
})(typeof window !== "undefined" ? window : globalThis);
