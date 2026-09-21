/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/hashtags.js

   NULL BIS FUENF, UND JEDER MUSS ZU DIESEM BEITRAG GEHOEREN

   -------------------------------------------------------------------------
   WAS VORHER DASTAND
   -------------------------------------------------------------------------

   In content.js, als Vorgabewert:

       hashtags: options.hashtags || ["VisionUniverse", "Investment", "Daten"]

   Niemand hat je `options.hashtags` uebergeben. Jeder Beitrag dieses
   Kontos haette also dieselben drei Tags getragen - darunter
   "VisionUniverse", ein interner Markenbegriff, den ausserhalb dieses
   Repositories niemand sucht.

   Drei feste Tags unter jedem Post sind keine Hashtags. Sie sind eine
   Signatur.

   -------------------------------------------------------------------------
   WORAUS DIE TAGS ENTSTEHEN
   -------------------------------------------------------------------------

   Ausschliesslich aus dem, was der kanonische Content Context ohnehin
   traegt: Entitaet, Content Family, Audience Frame, Story, Caption,
   Sektor. Keine externe Quelle - insbesondere NICHT die Meta Public
   Hashtag API, die der Owner bewusst nicht aktiviert hat. Fuer eigene
   Tags braucht man sie auch nicht: wir wissen, worueber wir schreiben.

   Was nicht dasteht, wird nicht erfunden. Ein Beitrag ohne erkennbare
   Entitaet und ohne Familie bekommt null Tags, und das ist ein
   gueltiges Ergebnis.

   -------------------------------------------------------------------------
   FUENF IST DIE GRENZE, NICHT DAS ZIEL
   -------------------------------------------------------------------------

   MAX_HASHTAGS = 5 ist hart. Wenn drei passen, werden es drei. Auf
   fuenf aufzufuellen hiesse, zwei Tags zu erfinden - und erfundene
   Tags sind genau das, was die feste Liste oben schon war.

   -------------------------------------------------------------------------
   DEUTSCH, WEIL DAS KONTO DEUTSCH IST
   -------------------------------------------------------------------------

   #Aktienanalyse, nicht #StockAnalysis. Eigennamen bleiben, wie sie
   heissen: #ExxonMobil ist kein englischer Hashtag, sondern ein Name.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Harte Obergrenze (§12). Sie steht hier und nirgends sonst. */
  var MAX_HASHTAGS = 5;

  /* Die Mischung, aus der ein guter Satz Tags besteht (§11). Die
     Reihenfolge ist die Rangfolge: wenn gekuerzt werden muss, faellt
     das Allgemeinste zuerst, weil es am wenigsten ueber DIESEN Beitrag
     sagt. */
  var KATEGORIE = {
    ENTITY:   "ENTITY",     /* #ExxonMobil  — worueber konkret         */
    THEMA:    "THEMA",      /* #Turnaround  — worum es in DIESEM geht  */
    SECTOR:   "SECTOR",     /* #Energie     — in welchem Feld          */
    CONTENT:  "CONTENT",    /* #Aktienanalyse — welche Art Beitrag     */
    AUDIENCE: "AUDIENCE",   /* #Aktien      — fuer wen                 */
    BROADER:  "BROADER"     /* #Investieren — der weitere Zusammenhang */
  };

  var RANG = [KATEGORIE.ENTITY, KATEGORIE.THEMA, KATEGORIE.SECTOR,
              KATEGORIE.CONTENT, KATEGORIE.AUDIENCE, KATEGORIE.BROADER];

  var VERWORFEN = {
    INTERN:      "INTERNAL_TERM",
    DOPPELT:     "DUPLICATE",
    ZU_LANG:     "TOO_LONG",
    ZU_KURZ:     "TOO_SHORT",
    NUR_TICKER:  "TICKER_WHEN_NAME_EXISTS",
    UNBELEGT:    "IMPLIES_UNSUPPORTED_CLAIM",
    UEBERZAEHLIG: "OVER_LIMIT",
    LEER:        "EMPTY"
  };

  /* -------------------------------------------------------------------
     BEGRIFFE, DIE NUR HIER DRIN ETWAS BEDEUTEN (§13)

     Sie beschreiben unsere Maschine, nicht den Beitrag. Wer sie unter
     einen Post schreibt, sucht Leser in einem Raum, den es nicht gibt.
     ------------------------------------------------------------------- */
  var INTERNE_BEGRIFFE = [
    "visionuniverse", "vu", "visionuniversesocial",
    "technicalopportunityscore", "opportunityscore",
    "stockstory", "ranking", "magazinestory", "reportstory",
    "megatrend", "evergreen", "contentuniverse", "fallbackladder",
    "atlas", "orchestrator", "candidate", "approvalcenter"
  ];

  /* Wortteile, die eine Aussage ueber die ZUKUNFT oder eine Empfehlung
     implizieren. Ein Hashtag ist kurz genug, dass er als Behauptung
     gelesen wird - und belegen kann er nichts. */
  var UNBELEGTE_VERSPRECHEN = [
    "kaufen", "verkaufen", "kauftipp", "geheimtipp", "vervielfacher",
    "verdoppler", "raketen", "todesaktie", "jetztkaufen", "mussbesitzen",
    "buy", "sell", "moon", "1000prozent", "schnellreich"
  ];

  /* Rechtsformen und Zusaetze, die in einem Hashtag nur stoeren. */
  var RECHTSFORMEN = /\b(AG|SE|NV|N\.V\.|PLC|Plc|Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?|LLC|S\.A\.|SA|GmbH|Holdings?|Group|Class [A-Z]|The)\b/gi;

  function text(v) { return v === undefined || v === null ? "" : String(v); }

  /**
   * Aus einem Klarnamen einen Hashtag machen.
   *
   * "Exxon Mobil Corporation" -> "ExxonMobil"
   * "HP Inc"                  -> "HP"
   * "Siemens Energy AG"       -> "SiemensEnergy"
   */
  function alsTag(roh) {
    var t = text(roh)
      .replace(RECHTSFORMEN, " ")
      .replace(/[&+]/g, " ")
      /* Umlaute bleiben: #Wärmepumpe ist ein deutscher Hashtag und
         Instagram kann sie. "Waermepumpe" waere eine Verstuemmelung. */
      .replace(/[^0-9A-Za-zÄÖÜäöüß\s-]/g, " ")
      .trim();
    if (!t) return null;

    var teile = t.split(/[\s-]+/).filter(function (w) { return w.length; });
    if (!teile.length) return null;

    return teile.map(function (w) {
      /* Ein bereits durchgehend grosses Kuerzel bleibt, wie es ist:
         "HP" soll nicht zu "Hp" werden. */
      if (w.length <= 4 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join("");
  }

  /* Zum Vergleichen: Kleinschreibung, ohne Umlaute, ohne Pluralendung.
     "#Aktie" und "#Aktien" sind fuer einen Leser dasselbe, und beide
     unter einen Post zu schreiben sieht nach Fuellmaterial aus. */
  function kern(tag) {
    var k = text(tag).toLowerCase()
      .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]/g, "");
    return k.replace(/(en|er|e|s|n)$/, "");
  }

  function istIntern(tag) {
    var k = text(tag).toLowerCase().replace(/[^a-z0-9]/g, "");
    return INTERNE_BEGRIFFE.indexOf(k) !== -1;
  }

  function verspricht(tag) {
    var k = text(tag).toLowerCase().replace(/[^a-z0-9]/g, "");
    for (var i = 0; i < UNBELEGTE_VERSPRECHEN.length; i += 1) {
      if (k.indexOf(UNBELEGTE_VERSPRECHEN[i]) !== -1) return true;
    }
    return false;
  }

  /* -------------------------------------------------------------------
     TICKER ODER KLARNAME? (§13)

     #XOM und #ExxonMobil meinen dasselbe Unternehmen, aber nicht
     dasselbe Publikum: den Ticker kennt, wer ohnehin schon sucht. Der
     Name ist die Einladung.

     Ein Ticker ist deshalb nur dann ein Tag, wenn KEIN Klarname
     vorliegt - und nie zusaetzlich zum Namen.
     ------------------------------------------------------------------- */
  function sichtbarerTicker(s) {
    /* "Technisches Setup — XOM" traegt den Ticker am Ende. */
    var m = /(?:^|[\s—-])([A-Z]{1,5})(?:\.[A-Z]{1,3})?$/.exec(text(s).trim());
    return m ? m[1] : null;
  }

  /* -------------------------------------------------------------------
     DIE FAMILIE SAGT, WELCHE ART BEITRAG DAS IST (§11 CONTENT)

     Kein erfundener Katalog: die Schluessel sind die kanonischen
     Content Families, und was nicht dabeisteht, erzeugt keinen Tag.
     ------------------------------------------------------------------- */
  var FAMILIE_ZU_TAG = {
    STOCK_STORY:      "Aktienanalyse",
    RANKING:          "Aktienvergleich",
    MAGAZINE_STORY:   "Boersenwissen",
    REPORT_STORY:     "Quartalszahlen",
    MEGATREND:        "Megatrends",
    EDUCATION:        "Boersenwissen",
    EVERGREEN:        "Geldanlage",
    NEWS_NOW:         "Marktbericht",
    EARNINGS:         "Quartalszahlen",
    MARKET_EXPLAINER: "Marktbericht"
  };

  /* -------------------------------------------------------------------
     DAS THEMA DES EINZELNEN BEITRAGS (§10, §11)

     Ohne diese Kategorie bekamen alle sechzehn RANKING-Themen der
     Platte exakt dieselben drei Tags: gleiche Familie, mehrere
     Unternehmen, also kein Entity-Tag. Genau die feste Liste, die
     dieser Auftrag abschafft — nur diesmal aus Versehen.

     Die Titel tragen aber echtes Signal: CASHFLOW-MASCHINEN,
     FUNDAMENTALE TURNAROUNDS, NEUE JAHRESHOCHS, KUENSTLICHE
     INTELLIGENZ.

     Deshalb: ein Begriff wird nur dann zum Tag, wenn er im Titel oder
     in der Fragestellung TATSAECHLICH VORKOMMT. Das ist keine Liste,
     die unter jeden Post wandert, sondern eine Erkennung — steht der
     Begriff nicht da, entsteht kein Tag.

     Jeder Eintrag ist ein gaengiger deutscher Anlagebegriff, unter dem
     Leser wirklich suchen. Keine erfundenen Marken-Tags.
     ------------------------------------------------------------------- */
  var BEGRIFF_ZU_TAG = [
    /* Umlaute bleiben, wie `alsTag` sie auch stehen laesst: auf einem
       deutschsprachigen Konto sucht niemand nach "Qualitaetsaktien".
       Die erste Fassung hatte sie hier transliteriert und dort
       erhalten — zwei Schreibweisen in einer Engine. */
    [/cashflow/i,                      "Cashflow"],
    [/turnaround|comeback/i,           "Turnaround"],
    [/dividend/i,                      "Dividenden"],
    [/wachstum|compounder|waechst|wächst/i, "Wachstumsaktien"],
    [/marge|profitabel/i,              "Profitabilität"],
    [/bilanz|substanz/i,               "Substanzwerte"],
    [/jahreshoch|allzeithoch/i,        "Jahreshoch"],
    [/aufwind|aufwaertstrend|aufwärtstrend|momentum/i, "Momentum"],
    [/qualitaet|qualität/i,            "Qualitätsaktien"],
    [/kuenstliche intelligenz|künstliche intelligenz|\bKI\b/i, "KünstlicheIntelligenz"],
    [/robotik|automation/i,            "Robotik"],
    [/mobilitaet|mobilität|elektroauto/i, "Mobilität"],
    [/bewertung|kurs-gewinn|guenstig|günstig/i, "Bewertung"]
  ];

  /* Sektoren, deutsch. Wieder: nur was uebergeben wird, wird benutzt. */
  var SEKTOR_ZU_TAG = {
    ENERGY: "Energie", ENERGIE: "Energie",
    TECHNOLOGY: "Technologie", TECH: "Technologie",
    HEALTHCARE: "Gesundheit", HEALTH: "Gesundheit",
    FINANCIALS: "Finanzwerte", FINANCE: "Finanzwerte",
    INDUSTRIALS: "Industrie", INDUSTRIE: "Industrie",
    UTILITIES: "Versorger",
    MATERIALS: "Rohstoffe", BASIC_MATERIALS: "Rohstoffe",
    "REAL_ESTATE": "Immobilien", REALESTATE: "Immobilien",
    "CONSUMER_STAPLES": "Konsumgueter",
    "CONSUMER_DISCRETIONARY": "Konsum",
    "COMMUNICATION_SERVICES": "Medien"
  };

  function vorschlag(tag, kategorie, quelle) {
    return { tag: tag, kategorie: kategorie, quelle: quelle };
  }

  /**
   * Die Tags fuer einen Beitrag.
   *
   * @param kontext {
   *   entities      Klarnamen, z.B. ["Exxon Mobil"]
   *   entityType    "STOCK" | "NONE" | ...
   *   topic         Titel/Thema, darf einen Ticker enthalten
   *   family        kanonische Content Family
   *   sector        Sektor, falls bekannt
   *   audience      "Aktien" o.ae., falls die Zielgruppe benannt ist
   *   caption       fertiger Text (nur zum Gegenlesen, nie als Quelle
   *                 fuer erfundene Begriffe)
   * }
   */
  function ableiten(kontext) {
    var k = kontext || {};
    var roh = [];

    /* ------------------------------------------------------ 1. ENTITY */
    var namen = Array.isArray(k.entities)
      ? k.entities.filter(function (e) { return text(e).trim(); })
      : [];

    if (namen.length === 1) {
      var t = alsTag(namen[0]);
      if (t) roh.push(vorschlag(t, KATEGORIE.ENTITY, "entities[0]"));
    } else if (namen.length > 1) {
      /* Eine Rangliste ueber zehn Unternehmen bekommt keinen
         Unternehmens-Tag: welchen der zehn sollte er nennen? Wer einen
         herausgreift, behauptet eine Rangfolge, die der Beitrag so
         nicht trifft. */
      roh.push({ uebersprungen: true, kategorie: KATEGORIE.ENTITY,
        grund: namen.length + " Unternehmen — kein einzelner Name traegt den Beitrag" });
    }

    /* Ein Ticker im Titel wird IMMER vorgeschlagen — auch wenn ein
       Klarname vorliegt.

       Die erste Fassung schlug ihn nur im `else`-Zweig vor, also nur
       ohne Klarnamen. Damit konnte der Filter weiter unten
       ("Klarname schlaegt Ticker") gar nicht mehr feuern: ein
       Waechter, der nie im Weg steht, ist keiner — und eine Gegenprobe
       hat ihn folgerichtig nicht vermisst.

       Jetzt entscheidet der Filter, und die Gegenprobe merkt es, wenn
       er verschwindet. Das Ergebnis ist dasselbe; nachpruefbar ist es
       erst so. */
    if (k.topic) {
      var tick = sichtbarerTicker(k.topic);
      if (tick) roh.push(vorschlag(tick, KATEGORIE.ENTITY, "topic (Ticker)"));
    }

    /* ------------------------------------------------------- 2. THEMA
       Aus Titel UND Fragestellung — die Frage sagt oft praeziser,
       worum es geht ("Mindestens 15 Cent freier Cashflow je Dollar
       Umsatz"), als eine Schlagzeile ("CASHFLOW-MASCHINEN"). */
    var themenText = [k.topic, k.question, k.story].map(text).join(" ");
    if (themenText.trim()) {
      for (var bi = 0; bi < BEGRIFF_ZU_TAG.length; bi += 1) {
        if (BEGRIFF_ZU_TAG[bi][0].test(themenText)) {
          roh.push(vorschlag(BEGRIFF_ZU_TAG[bi][1], KATEGORIE.THEMA,
            "Begriff im Thema"));
          break;   /* EIN Themen-Tag. Zwei waeren schon Auffuellen. */
        }
      }
    }

    /* ------------------------------------------------------ 3. SECTOR */
    var sek = text(k.sector).toUpperCase().replace(/[^A-Z_]/g, "");
    if (sek && SEKTOR_ZU_TAG[sek]) {
      roh.push(vorschlag(SEKTOR_ZU_TAG[sek], KATEGORIE.SECTOR, "sector"));
    }

    /* ----------------------------------------------------- 4. CONTENT */
    var fam = text(k.family).toUpperCase();
    if (fam && FAMILIE_ZU_TAG[fam]) {
      roh.push(vorschlag(FAMILIE_ZU_TAG[fam], KATEGORIE.CONTENT, "family"));
    }

    /* ---------------------------------------------------- 5. AUDIENCE */
    if (text(k.audience).trim()) {
      var a = alsTag(k.audience);
      if (a) roh.push(vorschlag(a, KATEGORIE.AUDIENCE, "audience"));
    } else if (text(k.entityType).toUpperCase() === "STOCK") {
      /* Der Beitrag handelt von Aktien — das steht in den Daten und ist
         keine Annahme. */
      roh.push(vorschlag("Aktien", KATEGORIE.AUDIENCE, "entityType=STOCK"));
    }

    /* ----------------------------------------------------- 6. BROADER */
    /* Nur, wenn der Beitrag ueberhaupt in einem Anlagekontext steht.
       Ein Bildungsbeitrag ohne Titel und ohne Familie bekommt ihn
       nicht — sonst waere er wieder die feste Liste von oben. */
    if (roh.some(function (v) { return v.tag; })) {
      roh.push(vorschlag("Investieren", KATEGORIE.BROADER, "Anlagekontext"));
    }

    /* ================================================== Aussortieren */
    var verworfen = [];
    var gesehen = {};
    var behalten = [];

    /* Ein Klarname macht den Ticker ueberfluessig. */
    var hatKlarnamen = roh.some(function (v) {
      return v.tag && v.kategorie === KATEGORIE.ENTITY &&
        v.quelle === "entities[0]";
    });

    roh.forEach(function (v) {
      if (v.uebersprungen) {
        verworfen.push({ tag: null, kategorie: v.kategorie,
          grund: VERWORFEN.LEER, satz: v.grund });
        return;
      }
      var tag = text(v.tag).trim();
      if (!tag) {
        verworfen.push({ tag: tag, grund: VERWORFEN.LEER, satz: "Leerer Tag." });
        return;
      }
      if (tag.length < 2) {
        verworfen.push({ tag: tag, grund: VERWORFEN.ZU_KURZ,
          satz: "Ein Zeichen ist kein Hashtag." });
        return;
      }
      if (tag.length > 30) {
        verworfen.push({ tag: tag, grund: VERWORFEN.ZU_LANG,
          satz: "Zu lang, um gelesen zu werden." });
        return;
      }
      if (istIntern(tag)) {
        verworfen.push({ tag: tag, grund: VERWORFEN.INTERN,
          satz: "Interner Begriff — danach sucht ausserhalb niemand." });
        return;
      }
      if (verspricht(tag)) {
        verworfen.push({ tag: tag, grund: VERWORFEN.UNBELEGT,
          satz: "Der Tag behauptet etwas, das der Beitrag nicht belegt." });
        return;
      }
      if (hatKlarnamen && v.quelle && v.quelle.indexOf("Ticker") !== -1) {
        verworfen.push({ tag: tag, grund: VERWORFEN.NUR_TICKER,
          satz: "Der Klarname sagt mehr Lesern dasselbe." });
        return;
      }
      var kk = kern(tag);
      if (gesehen[kk]) {
        verworfen.push({ tag: tag, grund: VERWORFEN.DOPPELT,
          satz: "Meint dasselbe wie #" + gesehen[kk] + "." });
        return;
      }
      gesehen[kk] = tag;
      behalten.push(v);
    });

    /* ============================================ Die harte Grenze (§12) */
    behalten.sort(function (a, b) {
      return RANG.indexOf(a.kategorie) - RANG.indexOf(b.kategorie);
    });

    var zuviel = behalten.slice(MAX_HASHTAGS);
    zuviel.forEach(function (v) {
      verworfen.push({ tag: v.tag, kategorie: v.kategorie,
        grund: VERWORFEN.UEBERZAEHLIG,
        satz: "Mehr als " + MAX_HASHTAGS + " Tags; das Allgemeinste faellt zuerst." });
    });
    behalten = behalten.slice(0, MAX_HASHTAGS);

    return {
      hashtags: behalten.map(function (v) { return v.tag; }),
      detail: behalten,
      verworfen: verworfen,
      max: MAX_HASHTAGS,
      /* Ausdruecklich: null Tags sind ein Ergebnis und kein Fehler. */
      satz: behalten.length === 0
        ? "Kein Hashtag passt zu diesem Beitrag. Null ist zulaessig — " +
          "zwei erfundene waeren es nicht."
        : behalten.length + " Hashtag(s) aus " +
          behalten.map(function (v) { return v.kategorie; }).join(", ") + "."
    };
  }

  /* -------------------------------------------------------------------
     WAS TATSAECHLICH OEFFENTLICH STEHT (§17)

     Meta bekommt EINEN Text. Der Owner muss vor der Freigabe genau
     diesen sehen - nicht die Caption und daneben eine Liste, aus der
     sich der Rest erst beim Senden zusammensetzt.

     Deterministisch: dieselbe Caption und dieselben Tags ergeben
     immer denselben Text.
     ------------------------------------------------------------------- */
  function finalerText(caption, hashtags) {
    var c = text(caption).trim();
    var tags = (hashtags || [])
      .map(function (t) { return text(t).replace(/^#+/, "").trim(); })
      .filter(function (t) { return t.length; })
      .map(function (t) { return "#" + t; });

    if (!tags.length) return c;
    if (!c) return tags.join(" ");
    /* Leerzeile dazwischen: auf Instagram liest sich die Caption sonst
       bis in die Tags hinein. */
    return c + "\n\n" + tags.join(" ");
  }

  var api = {
    MAX_HASHTAGS: MAX_HASHTAGS,
    KATEGORIE: KATEGORIE,
    VERWORFEN: VERWORFEN,
    FAMILIE_ZU_TAG: FAMILIE_ZU_TAG,
    SEKTOR_ZU_TAG: SEKTOR_ZU_TAG,
    BEGRIFF_ZU_TAG: BEGRIFF_ZU_TAG,
    INTERNE_BEGRIFFE: INTERNE_BEGRIFFE,
    alsTag: alsTag,
    kern: kern,
    ableiten: ableiten,
    finalerText: finalerText
  };

  if (isNode) module.exports = api;
  else global.VUSocialHashtags = api;
})(typeof window !== "undefined" ? window : globalThis);
