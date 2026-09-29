/* =========================================================================
   VISION UNIVERSE — NAMENSVERTRAG v1

   Gemessen am 26.09.2026: bei 5.423 von 7.586 Instrumenten nennt die
   Übersicht einen anderen Namen als die Aktienseite. 3.908 davon
   unterscheiden sich nur in der Rechtsform („Alcoa Corp" / „Alcoa"). 1.515
   unterscheiden sich im Wortlaut — und darunter ist ein Fall, der kein
   Darstellungsthema ist:

       AACI    Liste  „Armada Acquisition Corp. III"
               Seite  „Armada Acquisition Corp I"

   Eine der beiden Angaben ist über die IDENTITÄT falsch. Genau deshalb löst
   dieses Modul das Problem nicht mit einer Quellenrangfolge. „Die Liste
   gewinnt" oder „die Seite gewinnt" würde in der Hälfte der Fälle die
   falsche Gesellschaft anzeigen und in der anderen Hälfte die richtige — mit
   derselben Sicherheit vorgetragen.

   DREI EBENEN, DIE NICHT DASSELBE SIND

     ISSUER_LEGAL_NAME      Die Gesellschaft. Quelle: das SEC-Verzeichnis
                            über die CIK. Gilt für ALLE Wertpapiere dieses
                            Emittenten und kennt keine Aktienklasse.
     SECURITY_DISPLAY_NAME  Die notierte Zeile. Quelle: die Metadaten des
                            Kursanbieters je Kürzel. Trägt die Klasse
                            („Alphabet Inc. Class A") und unterscheidet
                            damit, was der Emittentenname zusammenwirft.
     PRODUCT_DISPLAY_NAME   Was ein Leser sieht. Abgeleitet, nicht erfunden:
                            die Wertpapierebene, wenn sie vorliegt, sonst
                            die Emittentenebene - und in beiden Fällen ist
                            vermerkt, welche Ebene es war.

   Emittentenname und Wertpapiername werden NICHT vermischt. Wer den
   Emittentennamen für eine Zeile ausgibt, verliert die Klasse; wer den
   Wertpapiernamen für den Emittenten ausgibt, behauptet, die Gesellschaft
   heiße nach einer ihrer Klassen.

   WAS DIESES MODUL NICHT TUT

   Es entscheidet keinen Identitätskonflikt. Es klassifiziert die ART einer
   Abweichung und setzt `identityConflict`, wo zwei Quellen über die Sache
   selbst uneins sind. Ein Konflikt wird festgehalten, nicht überschrieben:
   eine stille Wahl zwischen „Armada I" und „Armada III" wäre eine erfundene
   Identität, und die ist schlimmer als ein sichtbares „unklar".
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var CONTRACT_VERSION = "company-naming-1.0.0";

  /* Die drei Ebenen, in der Reihenfolge ihrer Reichweite. */
  var LEVELS = ["ISSUER_LEGAL_NAME", "SECURITY_DISPLAY_NAME", "PRODUCT_DISPLAY_NAME"];

  /* Welche Quelle auf welcher Ebene spricht. Das ist der Kern des Vertrags:
     eine Quelle ist nicht „besser" als eine andere, sie sagt etwas anderes.
     Das SEC-Kürzelverzeichnis bildet CIK → Name ab, also den EMITTENTEN; die
     Anbietermetadaten hängen am Kürzel, also an der ZEILE. */
  var SOURCE_LEVEL = {
    SEC_COMPANY_TICKERS: "ISSUER_LEGAL_NAME",
    "sec:company_tickers": "ISSUER_LEGAL_NAME",
    "quant/data/sec/inspector_index.json": "ISSUER_LEGAL_NAME",
    TIINGO_METADATA: "SECURITY_DISPLAY_NAME",
    VU_CURATED: "PRODUCT_DISPLAY_NAME",
    "discover/config/company-names.json": "PRODUCT_DISPLAY_NAME",
    "dashboard/config/universe.json": "PRODUCT_DISPLAY_NAME",
    "quant/config/market-universe.json": "PRODUCT_DISPLAY_NAME",
    "quant/config/tiingo-universe.json": "PRODUCT_DISPLAY_NAME"
  };

  /* Rechtsformen und ihre Schreibvarianten. Eine Liste und kein Muster wie
     /\bINC\b/, weil „INCYTE" sonst seine ersten drei Buchstaben verliert. */
  var LEGAL_FORMS = ["INCORPORATED", "INC", "CORPORATION", "CORP", "COMPANY", "CO",
    "LIMITED", "LTD", "PLC", "LLC", "LP", "LLP", "SA", "NV", "AG", "SE", "AB", "ASA",
    "OYJ", "SPA", "BV", "GMBH", "KGAA", "CV", "NA", "HOLDINGS", "HOLDING", "GROUP",
    "THE", "CLASS", "CL", "SHARES", "SHS", "ORD", "ORDINARY", "COM", "NEW", "REIT"];

  /* Klassenmarker. „Class A", „Cl B", „Series A" - und die nackten Buchstaben
     am Ende, wie der Anbieter sie schreibt. */
  var CLASS_RE = /\b(?:CLASS|CL|SERIES|SER)\s+([A-Z0-9]{1,3})\b/;
  /* Roemische Zahlen und Ordnungszahlen als eigenes Wort. Genau dieser Fall
     ist AACI: „Corp. III" gegen „Corp I". */
  var ROMAN_RE = /\b(I{1,3}|IV|V|VI{1,3}|IX|X{1,3})\b/g;
  var ORDINAL_RE = /\b([1-9][0-9]?)(?:ST|ND|RD|TH)?\b/g;

  var KINDS = {
    IDENTICAL: "IDENTICAL",
    MISSING_ON_ONE_SIDE: "MISSING_ON_ONE_SIDE",
    A: "LEGAL_FORM_PUNCTUATION_CASE",
    B: "SHORT_FORM",
    C: "SHARE_CLASS_DIFFERENCE",
    D: "SERIES_OR_NUMERAL_DIFFERENCE",
    E: "RENAME_OR_ACQUISITION",
    F: "IDENTITY_CONFLICT",
    G: "UNCLEAR"
  };
  /* Welche Arten die Identität berühren. C ist KEINE: eine Klasse ist eine
     zulässige Ergänzung der Wertpapierebene gegenüber der Emittentenebene.
     D und F sind es - „Armada I" und „Armada III" sind zwei Gesellschaften. */
  var IDENTITY_KINDS = ["D", "F"];

  function normalise(name) {
    /* PUNKTE VERSCHWINDEN, SIE TRENNEN NICHT.
     *
     * Der erste Versuch hat sie durch ein Leerzeichen ersetzt. Damit wurde
     * "ALLIANCEBERNSTEIN HOLDING L.P." zu "... L P" und "AllianceBernstein
     * Holding Lp" zu "... LP" - zwei Woerter gegen eins, und 107 identische
     * Namen landeten in der Gruppe "unklar", also in der Gruppe, die eine
     * Identitaetspruefung verlangt. Ein Punkt in einer Abkuerzung trennt
     * nichts; ein Komma und ein Bindestrich tun es. */
    return String(name || "")
      .toUpperCase()
      .replace(/&AMP;/g, "&")
      .replace(/\./g, "")
      .replace(/[,'"()‘’“”]/g, " ")
      .replace(/[-\/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function words(name) {
    return normalise(name).split(" ").filter(Boolean);
  }

  /* Der Kern eines Namens: ohne Rechtsform, ohne Klassenwort, ohne
     Zeichensetzung. Zwei Namen mit demselben Kern unterscheiden sich in der
     Darstellung, nicht in der Sache. */
  function core(name) {
    var out = [];
    words(name).forEach(function (word) {
      if (LEGAL_FORMS.indexOf(word) >= 0) return;
      out.push(word);
    });
    return out.join(" ");
  }

  function shareClass(name) {
    var match = CLASS_RE.exec(normalise(name));
    return match ? match[1] : null;
  }

  /* Zahlwoerter als Menge. Nur wenn beide Seiten welche tragen, ist ein
     Unterschied darin eine Aussage - eine Zahl gegen keine Zahl ist meist
     eine Kurzform. */
  function numerals(name) {
    var text = normalise(name), out = [];
    var m;
    ROMAN_RE.lastIndex = 0;
    while ((m = ROMAN_RE.exec(text)) !== null) out.push(m[1]);
    ORDINAL_RE.lastIndex = 0;
    while ((m = ORDINAL_RE.exec(text)) !== null) out.push(m[1]);
    return out;
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort().join("|"), y = b.slice().sort().join("|");
    return x === y;
  }

  /* Wie stark zwei Kerne einander enthalten. Kein Ähnlichkeitsmaß mit
     Schwellenzauber: gezählt werden gemeinsame Woerter, weil eine Kurzform
     genau das ist - dieselben Woerter, weniger davon. */
  function overlap(a, b) {
    var wa = a.split(" ").filter(Boolean), wb = b.split(" ").filter(Boolean);
    if (!wa.length || !wb.length) return 0;
    var set = {}, treffer = 0;
    wb.forEach(function (w) { set[w] = (set[w] || 0) + 1; });
    wa.forEach(function (w) { if (set[w]) { treffer += 1; set[w] -= 1; } });
    return treffer / Math.max(wa.length, wb.length);
  }

  /**
   * Die ART einer Abweichung zwischen zwei Namen derselben Wertpapierzeile.
   *
   * @param {string} a erster Name
   * @param {string} b zweiter Name
   * @returns {{kind:string,label:string,identityConflict:boolean,evidence:string}}
   */
  function classifyDeviation(a, b, evidence) {
    var na = normalise(a), nb = normalise(b);
    if (!na || !nb) {
      /* EIN FEHLENDER NAME IST KEINE UNKLARE IDENTITAET.
         Der erste Lauf hat diese neun Faelle in die Gruppe "unklar" gelegt -
         also dorthin, wo eine Identitaetspruefung ansteht - und damit die
         Summe der Gruppen von der Summe der Konflikte getrennt (388 gegen
         379). Eine Partition, deren Teile sich nicht addieren, ist keine. */
      return verdict("MISSING_ON_ONE_SIDE", "Eine der beiden Seiten hat keinen Namen.", false);
    }
    if (na === nb) {
      /* IDENTISCH IST KEINE ABWEICHUNG.
         Der erste Lauf hat 3.930 Paare als "Rechtsform/Zeichensetzung"
         gezaehlt, und ihr Beispiel war "Alcoa Corp" gegen "Alcoa Corp" -
         also gar kein Unterschied. Eine Partition der Abweichungen, die
         Gleichheit mitzaehlt, macht die kosmetische Gruppe beliebig gross
         und die Aussage wertlos. */
      return verdict("IDENTICAL", "Gleich nach Zeichensetzung und Großschreibung.", false);
    }
    var ca = core(a), cb = core(b);
    if (ca === cb) {
      return verdict("A", "Gleicher Kern; Unterschied ist Rechtsform, Klassenwort oder Zeichensetzung.", false);
    }

    /* Zahlwoerter zuerst: sie sind der teuerste Unterschied, und ein
       Prefix-Test würde „Corp I" als Kurzform von „Corp III" durchgehen
       lassen. Genau so ist AACI entstanden. */
    var za = numerals(a), zb = numerals(b);
    if ((za.length || zb.length) && !sameSet(za, zb)) {
      return verdict("D", "Verschiedene Zahlwoerter im Namen: [" + za.join(",") + "] gegen [" +
        zb.join(",") + "]. Bei Nachfolgegesellschaften und Serien sind das zwei verschiedene " +
        "Gesellschaften, keine zwei Schreibweisen.", true);
    }

    var ka = shareClass(a), kb = shareClass(b);
    if (ka !== kb) {
      /* Eine Seite nennt die Klasse, die andere nicht: das ist der Unterschied
         zwischen Emittenten- und Wertpapierebene und kein Konflikt. Zwei
         VERSCHIEDENE Klassen sind einer. */
      if (ka && kb) {
        return verdict("F", "Beide Seiten nennen eine Klasse, und es sind verschiedene: " +
          ka + " gegen " + kb + ".", true);
      }
      return verdict("C", "Eine Seite nennt die Aktienklasse (" + (ka || kb) +
        "), die andere nicht - Wertpapierebene gegen Emittentenebene.", false);
    }

    var quote = overlap(ca, cb);
    if (quote === 1) {
      return verdict("A", "Dieselben Woerter in anderer Reihenfolge oder Schreibweise.", false);
    }
    if (quote >= 0.5) {
      var kurz = ca.split(" ").length < cb.split(" ").length ? a : b;
      return verdict("B", "Gemeinsame Woerter " + Math.round(quote * 100) + " %; die kuerzere Form (\"" +
        String(kurz).trim() + "\") laesst Bestandteile weg, widerspricht aber nicht.", false);
    }
    /* KEIN GEMEINSAMES WORT: UMBENENNUNG ODER TICKERWIEDERVERWENDUNG.
     *
     * Beides sieht lokal gleich aus, und der Unterschied ist teuer:
     *
     *   AAMI  Anbieter "BrightSphere Investment Group Inc"
     *         SEC      "Acadian Asset Management Inc."      → Umbenennung
     *   AEC   Anbieter "Associated Estates Realty Corp"
     *         SEC      "ANFIELD ENERGY INC."                → anderes
     *                                                         Unternehmen
     *
     * Beide tragen dieselbe Verknuepfungsart (TICKER+EXCHANGE), dieselbe
     * Struktur, dieselbe Stichtagsangabe. Ein Unterscheidungsbeleg liegt
     * lokal NICHT vor - AECs erster Handelstag (1993) gehoert der alten
     * Gesellschaft, die CIK der neuen. Deshalb wird hier nicht geraten:
     *
     *   E  nur mit einem Beleg, der eine Fortfuehrung zeigt (dieselbe CIK
     *      auf beiden Seiten). Den gibt es heute in keiner Quelle, also ist
     *      diese Gruppe leer - und das ist ein Befund und kein Versehen.
     *   F  wenn die Verknuepfung selbst schwach ist (nur das Kuerzel).
     *   G  sonst: die beiden Faelle sind lokal nicht trennbar.
     *
     * Alle drei tragen identityConflict = true. Nichts wird ueberschrieben. */
    var join = (evidence && evidence.join) || null;
    var gleicheCik = !!(evidence && evidence.issuerCik && evidence.securityCik &&
      String(evidence.issuerCik) === String(evidence.securityCik));
    if (quote > 0) {
      return verdict("G", "Nur " + Math.round(quote * 100) + " % gemeinsame Woerter - ohne Stichtag oder " +
        "Emittentenbeleg nicht entscheidbar, ob Umbenennung oder Verwechslung.", true);
    }
    if (gleicheCik) {
      return verdict("E", "Kein gemeinsames Wort, aber beide Seiten nennen dieselbe CIK - " +
        "eine Fortfuehrung unter neuem Namen.", true);
    }
    if (join && join !== "TICKER+EXCHANGE") {
      return verdict("F", "Kein gemeinsames Wort, und die Verknuepfung stuetzt sich nur auf das " +
        "Kuerzel (" + join + "). Ein wiederverwendetes Kuerzel trifft dann eine andere Gesellschaft.", true);
    }
    return verdict("G", "Kein gemeinsames Wort im Kern des Namens. Umbenennung und " +
      "Kuerzelwiederverwendung sehen lokal gleich aus; ohne Beleg wird keine von beiden behauptet.", true);
  }

  function verdict(kind, evidence, conflict) {
    return { kind: kind, label: KINDS[kind], identityConflict: !!conflict, evidence: evidence };
  }

  /**
   * Der PRODUKTNAME einer Wertpapierzeile nach dem Vertrag.
   *
   * Kein Rang zwischen Quellen, sondern eine Ebenenwahl: die Zeile wird mit
   * dem Namen der Zeile benannt, wenn es einen gibt. Wo nur die
   * Gesellschaft bekannt ist, steht deren Name - und dass es die
   * Gesellschaft ist, bleibt vermerkt.
   *
   * Bei einem Identitätskonflikt wird NICHT gewählt. Der Produktname bleibt
   * der Name der Wertpapierebene (die engere Zuordnung, sie hängt am
   * Kürzel), `identityConflict` ist true, und beide Kandidaten stehen
   * daneben. Eine Oberfläche kann dann sagen, dass die Angabe unsicher ist,
   * statt eine von zwei Gesellschaften zu behaupten.
   *
   * @param {object} input {issuerName, issuerSource, securityName, securitySource,
   *                        curatedName, curatedSource, ticker}
   */
  function resolve(input) {
    var i = input || {};
    var issuer = trimmed(i.issuerName), security = trimmed(i.securityName), curated = trimmed(i.curatedName);
    var kandidaten = [];
    if (issuer) kandidaten.push({ level: "ISSUER_LEGAL_NAME", name: issuer, source: i.issuerSource || null });
    if (security) kandidaten.push({ level: "SECURITY_DISPLAY_NAME", name: security, source: i.securitySource || null });
    if (curated) kandidaten.push({ level: "PRODUCT_DISPLAY_NAME", name: curated, source: i.curatedSource || null });

    /* Ein Name, der das Kuerzel wiederholt, ist keiner - dieselbe Regel wie
       im Wertpapierstamm. */
    var ticker = String(i.ticker || "").toUpperCase();
    kandidaten = kandidaten.filter(function (k) { return normalise(k.name) !== ticker; });

    if (!kandidaten.length) {
      return { contractVersion: CONTRACT_VERSION, name: null, level: null, source: null,
        identityConflict: false, deviation: null, candidates: [], reason: "NO_NAME_IN_ANY_LEVEL" };
    }

    var abweichung = null, konflikt = false;
    if (issuer && security) {
      abweichung = classifyDeviation(issuer, security, i.evidence || null);
      konflikt = abweichung.identityConflict;
    }

    /* Die Wahl: gepflegter Produktname, sonst Wertpapierebene, sonst
       Emittentenebene. Bei einem Konflikt bleibt es bei der Wertpapierebene,
       weil sie am Kuerzel haengt - und der Konflikt steht daneben. */
    var gewaehlt = null;
    if (curated && !konflikt) gewaehlt = kandidaten.filter(function (k) { return k.level === "PRODUCT_DISPLAY_NAME"; })[0];
    if (!gewaehlt && security) gewaehlt = kandidaten.filter(function (k) { return k.level === "SECURITY_DISPLAY_NAME"; })[0];
    if (!gewaehlt) gewaehlt = kandidaten[0];

    return {
      contractVersion: CONTRACT_VERSION,
      name: gewaehlt.name,
      level: gewaehlt.level,
      source: gewaehlt.source,
      identityConflict: konflikt,
      deviation: abweichung,
      candidates: kandidaten,
      reason: null
    };
  }

  function trimmed(value) {
    var text = typeof value === "string" ? value.trim() : "";
    return text || null;
  }

  function levelOfSource(source) {
    return SOURCE_LEVEL[source] || null;
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    LEVELS: LEVELS.slice(),
    KINDS: Object.assign({}, KINDS),
    IDENTITY_KINDS: IDENTITY_KINDS.slice(),
    SOURCE_LEVEL: Object.assign({}, SOURCE_LEVEL),
    LEGAL_FORMS: LEGAL_FORMS.slice(),
    normalise: normalise,
    core: core,
    shareClass: shareClass,
    numerals: numerals,
    overlap: overlap,
    classifyDeviation: classifyDeviation,
    levelOfSource: levelOfSource,
    resolve: resolve
  };

  if (isNode) module.exports = api;
  else global.VUCompanyNamingContract = api;
})(typeof window !== "undefined" ? window : globalThis);
