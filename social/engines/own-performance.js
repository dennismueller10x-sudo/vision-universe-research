/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/own-performance.js

   WENN NICHTS VON AUSSEN KOMMT, MUSS DAS EIGENE SAUBER SEIN

   -------------------------------------------------------------------------
   WARUM DIESE DATEI JETZT WICHTIGER IST ALS VORHER
   -------------------------------------------------------------------------

   Solange eine externe Quelle in Aussicht stand, war die eigene
   Leistung eine von zwei Evidenzklassen. Jetzt ist sie die einzige.

   Das erhoeht nicht die Anforderungen an die Zahlen - es erhoeht die
   Anforderungen an die EHRLICHKEIT ueber sie. Eine einzige Quelle, die
   ihre Luecken kaschiert, ist schlimmer als zwei, die sie benennen:
   niemand kann mehr gegenrechnen.

   Drei Regeln, und alle drei hat dieses Projekt schon einmal verletzt:

     1. Ein Beitrag OHNE Wert in einer Dimension gehoert nicht in eine
        Gruppe "null". Er faellt heraus, und dass er herausfiel, steht
        im Ergebnis. Die Saettigungsrechnung hat einmal "0 von 25 waren
        MAGAZINE_STORY" gemeldet - und in Wahrheit trug KEINER der 25
        ein Familienfeld.

     2. Ein unveroeffentlichter Kandidat hat keine Leistung. Nicht eine
        schlechte, sondern GAR KEINE. Er kommt hier nicht vor.

     3. Ein Qualitaetsscore ist keine Leistung. Er sagt, ob ein Bild
        technisch und gestalterisch taugt - nicht, ob jemand es
        angesehen hat.

   -------------------------------------------------------------------------
   DIE ABDECKUNG IST TEIL DES BEFUNDS
   -------------------------------------------------------------------------

   Zu jeder Dimension steht, wie viele Beitraege sie ueberhaupt tragen.
   Eine Dimension mit 3 von 25 belegten Feldern kann keine Aussage
   liefern, egal wie deutlich die drei aussehen - und der Grund ist
   nicht "das Format taugt nichts", sondern "wir haben es nicht
   mitgeschrieben".
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DIE LERNDIMENSIONEN

     Jede mit dem Feld, unter dem sie im Gedaechtnis liegt. Die Liste
     ist die Zusicherung: was hier steht, wird ausgewertet - und ein
     Feld, das im Gedaechtnis fehlt, faellt als Luecke auf statt
     stillschweigend zu verschwinden.
     ------------------------------------------------------------------- */
  var DIMENSIONEN = [
    { id: "topic", field: "topic", label: "Thema" },
    { id: "content_family", field: "contentFamily", label: "Content Family" },
    { id: "entity_type", field: "entityType", label: "Entity Type" },
    { id: "audience_frame", field: "audienceFrameBasis", label: "Audience Frame" },
    { id: "story_structure", field: "storyStructure", label: "Story-Struktur" },
    { id: "hook_strategy", field: "hookStrategy", label: "Hook-Strategie" },
    { id: "hook_variant_id", field: "hookVariantId", label: "Hook-Variante" },
    { id: "format", field: "mediaFormat", label: "Format" },
    { id: "visual_strategy", field: "visualStrategy", label: "Visual-Strategie" },
    { id: "visual_variant_id", field: "visualVariantId", label: "Visual-Variante" },
    { id: "timing", field: null, derive: "timing", label: "Veroeffentlichungszeit" },
    { id: "market_context", field: "marketContext", label: "Marktkontext" }
  ];

  /* Felder, die wie Leistung aussehen und keine sind. Sie hier zu
     nennen ist billiger, als spaeter zu erklaeren, warum das System
     Formate nach Bildqualitaet ausgewaehlt hat. */
  var KEINE_LEISTUNG = ["qualityScore", "creativeQuality", "visualQuality",
    "compositionScore", "brandFit", "objectiveScore"];

  /**
   * Die Veroeffentlichungszeit als vergleichbare Groesse.
   *
   * Ein Zeitstempel ist keine Dimension - zwei Beitraege teilen ihn nie.
   * Gruppiert wird nach Wochentag und Tageshaelfte, weil das die
   * Einteilung ist, die eine Redaktion auch tatsaechlich entscheidet.
   */
  function zeitfenster(publishedAt) {
    var t = Date.parse(publishedAt);
    if (!Number.isFinite(t)) return null;
    var d = new Date(t);
    var tage = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    var stunde = d.getUTCHours();
    var teil = stunde < 11 ? "frueh" : stunde < 17 ? "mittag" : "abend";
    return tage[d.getUTCDay()] + "-" + teil;
  }

  function wert(eintrag, dim) {
    if (dim.derive === "timing") return zeitfenster(eintrag.publishedAt);
    var v = eintrag[dim.field];
    if (v === undefined || v === null || v === "") return null;
    return String(v);
  }

  /**
   * Die Datensaetze einer Dimension, wie `learning.observe` sie braucht.
   *
   * Zwei Ausschluesse, beide mit Absicht:
   *   - kein `performance` -> der Beitrag wurde nicht gemessen
   *   - kein Wert in dieser Dimension -> er wurde nicht mitgeschrieben
   *
   * Beides ist NICHT dasselbe wie eine Null, und beides wird gezaehlt.
   */
  function datensaetze(eintraege, dim) {
    var alle = eintraege || [];
    var gemessen = alle.filter(function (e) {
      return e && e.performance !== null && e.performance !== undefined &&
        Number.isFinite(Number(e.performance));
    });
    var mitWert = [];
    var ohneWert = 0;
    gemessen.forEach(function (e) {
      var v = wert(e, dim);
      if (v === null) { ohneWert += 1; return; }
      mitWert.push({ value: v, performanceScore: Number(e.performance) });
    });
    /* -----------------------------------------------------------------
       WARUM EIN BEITRAG NICHT GEMESSEN IST

       "3 ungemessen" ist eine Zahl ohne Aussage. Die drei
       IMAGE-Beitraege im echten Bestand sind nicht ungemessen, weil
       niemand hingesehen haette - das Evidenzregime hat sich geweigert,
       sie gegen eine Basis aus drei Beitraegen zu bewerten. Woertlich:
       "Eine Zahl ohne Basis waere eine Behauptung."

       Das ist die richtige Weigerung. Sie als blosse Luecke zu fuehren,
       macht aus einer sauberen Entscheidung ein Versaeumnis - und
       verdeckt, dass hier eine ganze Kohorte fehlt und nicht drei
       zufaellige Beitraege.

       Der Grund steht im Eintrag; er wird hier nur gezaehlt, nicht neu
       erfunden. */
    var gruende = {};
    alle.forEach(function (e) {
      if (!e) return;
      var hat = e.performance !== null && e.performance !== undefined &&
        Number.isFinite(Number(e.performance));
      if (hat) return;
      var grund = (e.performanceProvenance && e.performanceProvenance.reason) ||
        (e.publishedAt ? "Kein Grund vermerkt." : "Nicht veroeffentlicht.");
      gruende[grund] = (gruende[grund] || 0) + 1;
    });

    return {
      records: mitWert,
      totalEntries: alle.length,
      measured: gemessen.length,
      unmeasured: alle.length - gemessen.length,
      unmeasuredReasons: Object.keys(gruende).map(function (g) {
        return { reason: g, count: gruende[g] };
      }).sort(function (a, b) { return b.count - a.count; }),
      withoutValue: ohneWert,
      coverage: gemessen.length === 0 ? 0
        : Math.round((mitWert.length / gemessen.length) * 1000) / 1000
    };
  }

  /**
   * Alle Dimensionen auswerten.
   *
   * @param spec.observe  learning.observe - hereingereicht, damit hier
   *                      keine zweite Statistik entsteht. Zwei
   *                      Rechenwege waeren zwei Wahrheiten.
   */
  function auswerten(eintraege, spec) {
    spec = spec || {};
    var beobachte = spec.observe;
    if (typeof beobachte !== "function") {
      return { ok: false, dimensions: [],
        explanation: "Kein Beobachter uebergeben. Diese Datei rechnet " +
          "nicht selbst - die Statistik steht in learning.js." };
    }
    var minAbdeckung = spec.minimumCoverage === undefined ? 0.5 : spec.minimumCoverage;

    var ergebnisse = DIMENSIONEN.map(function (dim) {
      var d = datensaetze(eintraege, dim);
      /* Unter der Mindestabdeckung wird gar nicht erst gerechnet. Ein
         Befund aus drei von fuenfundzwanzig Feldern waere eine Aussage
         ueber die Mitschrift, nicht ueber die Beitraege. */
      var auswertbar = d.coverage >= minAbdeckung && d.records.length > 0;
      var beobachtungen = auswertbar
        ? beobachte(dim.id, d.records, spec.observeOptions || {}) : [];
      var belastbar = beobachtungen.filter(function (o) { return o.sufficient; });

      return {
        dimension: dim.id,
        label: dim.label,
        field: dim.field || ("abgeleitet:" + dim.derive),
        measured: d.measured,
        unmeasured: d.unmeasured,
        unmeasuredReasons: d.unmeasuredReasons,
        withoutValue: d.withoutValue,
        coverage: d.coverage,
        evaluable: auswertbar,
        observations: beobachtungen,
        sufficient: belastbar,
        explanation: auswertbar
          ? beobachtungen.length + " Auspraegung(en), " + belastbar.length +
            " davon belastbar."
          : d.measured === 0
            ? "Keine gemessenen Beitraege - es gibt nichts auszuwerten."
            : d.withoutValue + " von " + d.measured + " gemessenen " +
              "Beitraegen tragen dieses Feld nicht (Abdeckung " +
              Math.round(d.coverage * 100) + " %, noetig " +
              Math.round(minAbdeckung * 100) + " %). Das ist eine Luecke " +
              "in der Mitschrift und kein Befund ueber die Beitraege."
      };
    });

    var auswertbare = ergebnisse.filter(function (r) { return r.evaluable; });
    var mitBefund = ergebnisse.filter(function (r) { return r.sufficient.length; });

    return {
      ok: true,
      dimensions: ergebnisse,
      evaluableCount: auswertbare.length,
      withFindingCount: mitBefund.length,
      /* Woertlich: was hier steht, ist gemessene Leistung und keine
         Prognose. */
      predictsPerformance: false,
      explanation: auswertbare.length + " von " + ergebnisse.length +
        " Dimensionen sind auswertbar, " + mitBefund.length + " tragen " +
        "einen belastbaren Befund. Der Rest ist nicht schlecht - er ist " +
        "nicht mitgeschrieben oder zu duenn."
    };
  }

  /* -------------------------------------------------------------------
     EXPLORE ODER EXPLOIT

     Auch ohne externe Trends muss das System Neues finden koennen. Die
     Frage ist nur, WANN es aufhoert zu suchen.

       EXPLOIT   nur dort, wo ein Befund belastbar ist.
       EXPLORE   ueberall sonst - und ausdruecklich auch dort, wo eine
                 Auspraegung gut AUSSIEHT, aber zu duenn ist.

     Der zweite Teil ist der schwierige. Eine Auspraegung mit drei
     Beitraegen und einem grossen Mittelwert sieht aus wie ein Gewinner
     und ist eine Anekdote. Sie zu exploiten hiesse, das System auf
     einen Zufall festzulegen - und weil Exploitation die Stichprobe
     erzeugt, bestaetigt sich der Zufall danach selbst.

     Weak Evidence bleibt Weak Evidence.
     ------------------------------------------------------------------- */
  function exploreExploit(auswertung, options) {
    options = options || {};
    var erg = (auswertung && auswertung.dimensions) || [];

    var exploit = [];
    var explore = [];

    erg.forEach(function (r) {
      if (!r.evaluable) {
        explore.push({ dimension: r.dimension, mode: "EXPLORE",
          reason: r.measured === 0
            ? "Noch nichts gemessen."
            : "Zu wenig mitgeschrieben (Abdeckung " +
              Math.round(r.coverage * 100) + " %)." });
        return;
      }
      if (!r.sufficient.length) {
        /* Der wichtige Fall: es gibt Auspraegungen, aber keine haelt.
           Wer hier exploitet, legt sich auf einen Zufall fest. */
        var bester = r.observations[0];
        explore.push({ dimension: r.dimension, mode: "EXPLORE",
          reason: bester
            ? "Beste Auspraegung \"" + bester.value + "\" (n=" +
              bester.sampleSize + ") ist nicht belastbar: " + bester.note
            : "Keine Auspraegung auswertbar." });
        return;
      }
      exploit.push({ dimension: r.dimension, mode: "EXPLOIT",
        values: r.sufficient.map(function (o) {
          return { value: o.value, effect: o.effect, sampleSize: o.sampleSize };
        }),
        reason: r.sufficient.length + " belastbare Auspraegung(en)." });
    });

    return {
      exploit: exploit,
      explore: explore,
      /* Solange nichts belastbar ist, ist EXPLORE kein Zwischenzustand,
         sondern der richtige Modus. */
      mode: exploit.length ? "MIXED" : "EXPLORE_ONLY",
      explanation: exploit.length
        ? exploit.length + " Dimension(en) tragen belastbare Muster - dort " +
          "wird genutzt. " + explore.length + " bleiben in der Erkundung."
        : "Keine Dimension traegt ein belastbares Muster. Das System " +
          "erkundet - und das ist bei dieser Stichprobe die richtige " +
          "Antwort, nicht eine vorlaeufige."
    };
  }

  var api = {
    DIMENSIONEN: DIMENSIONEN,
    KEINE_LEISTUNG: KEINE_LEISTUNG,
    zeitfenster: zeitfenster,
    datensaetze: datensaetze,
    auswerten: auswerten,
    exploreExploit: exploreExploit
  };

  if (isNode) module.exports = api;
  else global.VUSocialOwnPerformance = api;
})(typeof window !== "undefined" ? window : globalThis);
