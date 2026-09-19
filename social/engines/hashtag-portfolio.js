/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/hashtag-portfolio.js

   DREISSIG HASHTAGS SIND DAS BUDGET, NICHT DIE ANFRAGEN

   -------------------------------------------------------------------------
   DIE GRENZE, DIE MAN LEICHT FALSCH HERUM VERSTEHT
   -------------------------------------------------------------------------

   Meta erlaubt 30 EINZIGARTIGE Hashtags je rollierendem 7-Tage-Fenster
   und Konto. Eine ERNEUTE Abfrage desselben Hashtags innerhalb dieser
   sieben Tage zaehlt NICHT noch einmal.

   Wer das verwechselt, haelt haeufiges Nachsehen fuer teuer und breites
   Streuen fuer billig. Es ist genau umgekehrt: ein einmal geoeffneter
   Hashtag ist sieben Tage lang gratis beobachtbar, und jeder NEUE
   verbraucht einen von dreissig Plaetzen.

   Daraus folgt die Form des Portfolios von selbst:

     KERN         wenige Hashtags, dauerhaft beobachtet. Sie kosten
                  einmal pro Fenster und liefern eine Zeitreihe.
     ERKUNDUNG    wenige Plaetze, bewusst rotierend. Sie kosten jeweils
                  einen Platz und liefern Breite.

   Keine erfundenen Quoten: wie viele Plaetze der Kern bekommt, steht in
   der Konfiguration und ist eine Owner-Groesse, keine Naturkonstante.

   -------------------------------------------------------------------------
   KANDIDATEN KOMMEN AUS DEM CONTENT UNIVERSE
   -------------------------------------------------------------------------

   Keine handgepflegte Liste. Was Vision Universe beobachtet, leitet
   sich aus dem ab, worueber Vision Universe sprechen koennte: aus den
   Content Families und den Entitaeten der aktuellen Themen.

   Ein Hashtag, der zu keinem Thema gehoert, ist ein Hashtag, dessen
   Antwort niemand braucht.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var FENSTER_MS = 7 * 24 * 3600 * 1000;
  var HARTE_GRENZE = 30;

  /* -------------------------------------------------------------------
     ABLEITUNG AUS DEM CONTENT UNIVERSE

     Je Content Family ein kleiner Satz deutschsprachiger Hashtags, die
     zu dieser FORM passen - nicht zu einem einzelnen Titel. Entitaeten
     liefern zusaetzlich ihre eigenen.

     Das ist eine Zuordnung, keine Wertung: welcher Hashtag etwas
     taugt, entscheidet spaeter die Beobachtung.
     ------------------------------------------------------------------- */
  var FAMILY_TAGS = {
    RANKING:              ["aktien", "aktienanalyse", "boerse"],
    COMPARISON:           ["etfvergleich", "aktienvergleich"],
    MEGATREND:            ["zukunftsaktien", "megatrends"],
    EDUCATION:            ["finanzbildung", "boersenwissen", "geldanlage"],
    EVERGREEN:            ["anlegerfehler", "vermoegensaufbau"],
    MARKET_EXPLAINER:     ["boersennews", "maerkte"],
    STOCK_STORY:          ["aktien", "boerse"],
    ETF_PRODUCT:          ["etf", "etfsparplan"],
    NEWS_NOW:             ["boersennews"],
    EARNINGS:             ["quartalszahlen"],
    DIVIDEND:             ["dividende", "dividendenstrategie"],
    DATA_STORY:           ["aktienanalyse"],
    MAGAZINE_STORY:       ["finanzen", "investieren"],
    REPORT_STORY:         ["aktienanalyse", "investieren"],
    VU_ORIGINAL_RESEARCH: ["aktienanalyse"]
  };

  /* Rechtsform- und Aktienklassenzusaetze gehoeren in kein Hashtag.
     "#chartercommunicationsclassa" sucht niemand. */
  var BEIWERK = /\b(class\s*[abc]|inc|corp|corporation|incorporated|company|co|ltd|plc|holdings?|group|nv|sa|ag|se|the)\b/gi;

  function normalisiere(t) {
    return String(t || "").toLowerCase().replace(/^#/, "")
      .replace(BEIWERK, " ")
      .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue")
      .replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
  }

  /**
   * Kandidaten aus den aktuellen Themen - mit Begruendung, woher jeder
   * kommt. Ein Hashtag ohne Herkunft waere wieder eine gepflegte Liste.
   */
  function kandidaten(topics, options) {
    options = options || {};
    var map = {};
    (topics || []).forEach(function (t) {
      (FAMILY_TAGS[t.family] || []).forEach(function (tag) {
        var k = normalisiere(tag);
        if (!k) return;
        map[k] = map[k] || { hashtag: k, topicIds: [], families: [], entities: [] };
        if (map[k].topicIds.indexOf(t.topicId) === -1) map[k].topicIds.push(t.topicId);
        if (map[k].families.indexOf(t.family) === -1) map[k].families.push(t.family);
      });
      /* Entitaeten liefern ihre eigenen - aber nur, wenn ein Klarname
         daraus einen brauchbaren Hashtag macht. "#exxonmobil" ja,
         "#xom" nein: ein Kuerzel als Hashtag findet die falsche Menge. */
      (t.entities || []).forEach(function (e) {
        var k = normalisiere(e);
        /* Zu lange Namen ergeben Hashtags, die niemand benutzt. */
        if (!k || k.length < 4 || k.length > 20) return;
        map[k] = map[k] || { hashtag: k, topicIds: [], families: [], entities: [] };
        if (map[k].entities.indexOf(e) === -1) map[k].entities.push(e);
        if (map[k].topicIds.indexOf(t.topicId) === -1) map[k].topicIds.push(t.topicId);
        if (map[k].families.indexOf(t.family) === -1) map[k].families.push(t.family);
      });
    });

    /* -----------------------------------------------------------------
       EIN PLATZ KAUFT EINE ANTWORT - ALSO NICHT FUER EINE EINZELFRAGE

       Der erste Entwurf oeffnete #okeanisecotankers und
       #lifestancehealthgroup: Firmennamen aus einer Ranking-Reihe, die
       dort genau einmal vorkommen. Formal Kandidaten, praktisch
       verbrannte Plaetze - unter dreissig, die eine Woche halten
       muessen.

       Ein Hashtag aus einer FAMILIE beantwortet eine Frage ueber das
       Programm. Ein Hashtag aus einer EINZELNEN Entitaet beantwortet
       eine Frage ueber einen Titel. Letzteres lohnt erst, wenn die
       Entitaet im Programm WIEDERKEHRT.

       Gemessen, nicht geraten: wie viele Themen nennen sie. */
    var minThemenFuerEntitaet = options.minTopicsForEntity === undefined
      ? 2 : options.minTopicsForEntity;

    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (k) {
        /* Aus einer Familie abgeleitet: immer zulaessig. */
        if (k.families.length && !k.entities.length) return true;
        return k.topicIds.length >= minThemenFuerEntitaet;
      })
      /* Ein Hashtag, der zu mehreren Themen gehoert, beantwortet mehr
         Fragen je Platz. Das ist keine Wertung seiner Qualitaet,
         sondern seiner Reichweite im eigenen Programm. */
      .sort(function (a, b) {
        if (b.topicIds.length !== a.topicIds.length) {
          return b.topicIds.length - a.topicIds.length;
        }
        return a.hashtag.localeCompare(b.hashtag);
      });
  }

  /**
   * Der Zustand eines Hashtags im rollierenden Fenster.
   *
   * OPEN  bereits in diesem Fenster geoeffnet - erneut abzufragen
   *       kostet KEINEN weiteren Platz.
   * FREE  noch nicht geoeffnet - kostet einen Platz.
   */
  function fensterZustand(eintrag, nowIso) {
    if (!eintrag || !eintrag.firstQueriedAt) {
      return { state: "FREE", expiresAt: null, costsSlot: true };
    }
    var ablauf = Date.parse(eintrag.firstQueriedAt) + FENSTER_MS;
    if (Date.parse(nowIso) >= ablauf) {
      return { state: "FREE", expiresAt: null, costsSlot: true,
        note: "Das Fenster ist abgelaufen; eine neue Abfrage oeffnet ein neues." };
    }
    return { state: "OPEN", expiresAt: new Date(ablauf).toISOString(), costsSlot: false };
  }

  /**
   * Der Plan fuer den naechsten Lauf.
   *
   * Gibt zurueck, WAS abgefragt werden soll und WAS NICHT - und warum.
   * Ueberschreitet den Rahmen nie: ein Plan, der ihn sprengt, wird
   * gekuerzt und sagt das.
   */
  function plan(spec) {
    spec = spec || {};
    var now = spec.now || new Date().toISOString();
    var bestand = spec.state || {};
    var kern = (spec.coreHashtags || []).map(normalisiere).filter(Boolean);
    var maxKern = spec.maxCore === undefined ? 8 : spec.maxCore;
    var grenze = Math.min(spec.limit === undefined ? HARTE_GRENZE : spec.limit, HARTE_GRENZE);

    /* -----------------------------------------------------------------
       EIN BUDGET, DAS AM ERSTEN TAG LEER IST, IST KEIN PORTFOLIO

       Der erste Entwurf oeffnete alle dreissig Plaetze im ersten Lauf.
       Formal innerhalb der Grenze - praktisch eine Woche Blindheit:
       taucht morgen ein Thema auf, ist kein Platz mehr da, und das
       Fenster gibt erst in sieben Tagen wieder etwas frei.

       Das ist keine erfundene Quote, sondern eine Folge der
       rollierenden Regel: wer alles auf einmal ausgibt, kann auf
       nichts mehr reagieren. Deshalb zwei Groessen:

         maxNewPerRun   wie viel ein einzelner Lauf oeffnen darf
         reserveSlots   wie viel fuer Unvorhergesehenes freibleibt

       Beide stehen in der Konfiguration. Die Zahlen sind Owner-Groessen
       und keine Naturkonstanten - die Notwendigkeit einer Reserve ist
       aber keine Geschmacksfrage. */
    var reserve = spec.reserveSlots === undefined ? 6 : spec.reserveSlots;
    var maxProLauf = spec.maxNewPerRun === undefined ? 8 : spec.maxNewPerRun;

    /* Wie viele Plaetze sind in diesem Fenster schon verbraucht? */
    var offen = Object.keys(bestand).filter(function (h) {
      return fensterZustand(bestand[h], now).state === "OPEN";
    });
    var verbraucht = offen.length;
    var freiGesamt = Math.max(0, grenze - verbraucht);
    /* Was dieser Lauf ausgeben DARF - nicht, was insgesamt frei ist. */
    var frei = Math.max(0, Math.min(maxProLauf, freiGesamt - reserve));

    /* -----------------------------------------------------------------
       AUSGEBEN, MESSEN, NICHT WIEDERHOLEN

       Ein Erkundungsplatz kauft einen Versuch. Ob #okeanisecotankers
       eine Community hat, laesst sich vorher nicht wissen - nur
       nachher. Dafuer ist der Platz da.

       Was aber nicht passieren darf: denselben leeren Hashtag im
       naechsten Fenster noch einmal oeffnen. Das waere ein Versuch
       ohne Erkenntnisgewinn, bezahlt aus demselben knappen Budget.

       Gemessen wird an dem, was die Beobachtung zurueckgab. Ein
       Hashtag ohne beobachtete Medien ist nicht "schlecht" - er ist
       leer, und das ist ein Befund, kein Urteil. */
    var zurueckgestellt_leer = [];
    var minMedien = spec.minObservedMedia === undefined ? 3 : spec.minObservedMedia;
    var leer = Object.keys(bestand).filter(function (h) {
      var e = bestand[h];
      return typeof e.observedMediaCount === "number" &&
        e.observedMediaCount < minMedien;
    });

    var kandidatenListe = kandidaten(spec.topics || [])
      .filter(function (k) {
        if (leer.indexOf(k.hashtag) === -1) return true;
        zurueckgestellt_leer.push({ hashtag: k.hashtag,
          reason: "Beim letzten Versuch nur " +
            bestand[k.hashtag].observedMediaCount + " Medien beobachtet " +
            "(Schwelle " + minMedien + "). Leer ist ein Befund, kein Urteil - " +
            "aber kein Grund, den Platz noch einmal auszugeben." });
        return false;
      });
    var nachHashtag = {};
    kandidatenListe.forEach(function (k) { nachHashtag[k.hashtag] = k; });

    var gratis = [];      /* schon offen - kostet nichts */
    var neuKern = [];
    var neuErkundung = [];
    var zurueckgestellt = [];

    /* 1. Alles, was schon offen ist und noch zu einem Thema gehoert:
       gratis beobachten. Das ist der eigentliche Gewinn der Regel. */
    offen.forEach(function (h) {
      if (nachHashtag[h] || kern.indexOf(h) !== -1) {
        gratis.push({ hashtag: h, reason: "Fenster offen bis " +
          fensterZustand(bestand[h], now).expiresAt + " - kostet keinen Platz." });
      }
    });

    /* 2. Kern zuerst: er liefert die Zeitreihe, ohne die keine
       Entwicklung sichtbar wird. */
    kern.forEach(function (h) {
      if (gratis.some(function (g) { return g.hashtag === h; })) return;
      if (neuKern.length >= maxKern) {
        zurueckgestellt.push({ hashtag: h, reason: "Kernbudget (" + maxKern + ") erschoepft." });
        return;
      }
      if (neuKern.length + neuErkundung.length >= frei) {
        zurueckgestellt.push({ hashtag: h, reason: "Kein freier Platz im Fenster." });
        return;
      }
      neuKern.push({ hashtag: h, role: "CORE",
        reason: "Kernbeobachtung - liefert die Zeitreihe." });
    });

    /* 3. Erkundung mit dem Rest. Wer hier steht, kommt aus dem Content
       Universe und nicht aus einer Liste. */
    kandidatenListe.forEach(function (k) {
      var h = k.hashtag;
      if (kern.indexOf(h) !== -1) return;
      if (gratis.some(function (g) { return g.hashtag === h; })) return;
      if (neuKern.length + neuErkundung.length >= frei) {
        zurueckgestellt.push({ hashtag: h,
          reason: frei === 0
            ? "Dieser Lauf darf nichts mehr oeffnen (" + verbraucht + " von " +
              grenze + " belegt, " + reserve + " Reserve)."
            : "Laufbudget von " + frei + " ausgeschoepft." });
        return;
      }
      neuErkundung.push({ hashtag: h, role: "EXPLORATION",
        topicIds: k.topicIds, families: k.families,
        reason: "Aus " + k.topicIds.length + " aktuellem/n Thema/Themen, Familien: " +
          k.families.join(", ") + "." });
    });

    var neue = neuKern.concat(neuErkundung);
    return {
      now: now,
      windowLimit: grenze,
      windowUsed: verbraucht,
      windowFree: freiGesamt,
      /* Getrennt ausgewiesen: was frei ist, was dieser Lauf ausgeben
         darf, und was fuer Unvorhergesehenes zurueckgehalten wird. */
      spendableThisRun: frei,
      reserveSlots: reserve,
      maxNewPerRun: maxProLauf,
      /* Gratis und neu getrennt: sonst sieht ein Plan teuer aus, der
         es nicht ist - oder umgekehrt. */
      refresh: gratis,
      newQueries: neue,
      deferred: zurueckgestellt.concat(zurueckgestellt_leer),
      retiredAsEmpty: zurueckgestellt_leer,
      /* Die harte Zusage: dieser Plan verbraucht hoechstens so viele
         Plaetze, wie frei sind. Nie still mehr. */
      slotsRequested: neue.length,
      withinLimit: neue.length <= frei,
      explanation: neue.length + " neue Hashtag(s) (" + neuKern.length + " Kern, " +
        neuErkundung.length + " Erkundung), " + gratis.length + " kostenlose " +
        "Auffrischung(en), " + zurueckgestellt.length + " zurueckgestellt. " +
        verbraucht + " von " + grenze + " Plaetzen im Fenster belegt; dieser " +
        "Lauf durfte " + frei + " oeffnen (" + reserve + " bleiben fuer " +
        "Unvorhergesehenes zurueck)."
    };
  }

  /**
   * Den Bestand nach einer Abfrage fortschreiben.
   *
   * `firstQueriedAt` wird NIE ueberschrieben: es definiert das Fenster.
   * Wer es bei jeder Abfrage neu setzt, verlaengert das Fenster
   * scheinbar endlos und ueberschreitet die Grenze, ohne es zu merken.
   */
  function record(bestand, abfragen, nowIso) {
    var neu = JSON.parse(JSON.stringify(bestand || {}));
    (abfragen || []).forEach(function (a) {
      var h = normalisiere(a.hashtag);
      if (!h) return;
      var e = neu[h] || { hashtag: h, firstQueriedAt: null, lastQueriedAt: null,
        queryCount: 0, topicMapping: [], contentFamilyMapping: [],
        observedMediaCount: null, trendObservations: [], provenance: [] };

      var zustand = fensterZustand(e, nowIso);
      if (zustand.state === "FREE") e.firstQueriedAt = nowIso;
      e.lastQueriedAt = nowIso;
      e.queryCount = (e.queryCount || 0) + 1;

      (a.topicIds || []).forEach(function (t) {
        if (e.topicMapping.indexOf(t) === -1) e.topicMapping.push(t);
      });
      (a.families || []).forEach(function (f) {
        if (e.contentFamilyMapping.indexOf(f) === -1) e.contentFamilyMapping.push(f);
      });
      if (typeof a.observedMediaCount === "number") {
        e.observedMediaCount = a.observedMediaCount;
        e.trendObservations.push({ at: nowIso, mediaCount: a.observedMediaCount,
          edge: a.edge || null });
      }
      e.provenance.push({ at: nowIso, role: a.role || null,
        source: a.source || "meta.instagram.hashtag_search" });
      neu[h] = e;
    });
    return neu;
  }

  var api = {
    FENSTER_MS: FENSTER_MS,
    HARTE_GRENZE: HARTE_GRENZE,
    FAMILY_TAGS: FAMILY_TAGS,
    normalisiere: normalisiere,
    kandidaten: kandidaten,
    fensterZustand: fensterZustand,
    plan: plan,
    record: record
  };

  if (isNode) module.exports = api;
  else global.VUSocialHashtagPortfolio = api;
})(typeof window !== "undefined" ? window : globalThis);
