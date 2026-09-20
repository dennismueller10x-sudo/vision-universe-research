/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/creator-universe.js

   WEN BEOBACHTEN WIR — UND WER HAT DAS ENTSCHIEDEN?

   -------------------------------------------------------------------------
   KEINE HANDGEPFLEGTE LISTE
   -------------------------------------------------------------------------

   Eine Liste von Accounts, die jemand einmal aufgeschrieben hat, ist
   keine Quelle der Wahrheit. Sie ist ein Bild vom Tag ihrer Entstehung,
   und sie altert unsichtbar: nichts an ihr sagt, WARUM ein Account
   darauf steht oder ob der Grund noch gilt.

   Das Creator Watch Universe entsteht deshalb wie das Hashtag-Portfolio:
   aus dem Content Universe. Was Vision Universe beobachtet, leitet sich
   daraus ab, worueber Vision Universe sprechen koennte.

   -------------------------------------------------------------------------
   DER SATZ, DEN DIESES MODUL NIE SAGT
   -------------------------------------------------------------------------

   "Dieser Account ist gut."

   Er steht nicht drin, und er kann auch nicht hineingeraten: `pruefe()`
   weist jedes Feld zurueck, das ein Qualitaetsurteil traegt. Das ist
   keine Hoeflichkeit gegenueber Fremden, sondern Methodik. Wir sehen
   von aussen Zahlen ohne Nenner - keine Reichweite, keine Ziele, keine
   Kosten. Aus "viele Likes" folgt weder "gut gemacht" noch "fuer uns
   brauchbar".

   Was dieses Modul stattdessen misst, ist eine Aussage ueber UNS:

     RELEVANZ    Wie viele UNSERER Themen beruehrt dieser Kanal?

   Ein Kanal, der aus dem Universum faellt, faellt nicht heraus, weil er
   schlecht waere, sondern weil er zu unserem Programm nichts mehr
   beitraegt. Die Begruendung sagt das woertlich - sonst liest ein
   spaeterer Lauf sie als Urteil.

   -------------------------------------------------------------------------
   DIE REIHENFOLGE IST EINE ABHAENGIGKEIT, KEINE VORLIEBE
   -------------------------------------------------------------------------

   YouTube zuerst, Instagram danach (§3). Der Grund ist nicht Geschmack:
   Instagram Business Discovery braucht einen BEKANNTEN Nutzernamen. Es
   findet niemanden - es sieht jemanden nach, von dem man schon weiss.
   Entdeckt wird also auf YouTube; Instagram vertieft.

   Und genau an der Naht sitzt eine Luecke, die dieses Modul nicht
   ueberspringt: aus einem YouTube-Kanal folgt KEIN Instagram-Name. Ihn
   zu raten - aus dem Kanalnamen, aus der Aehnlichkeit - waere eine
   erfundene Zuordnung. Ein Eintrag traegt deshalb
   `instagramHandle: null` samt Grund, bis die Zuordnung auf einem
   erlaubten Weg BELEGT ist.

   -------------------------------------------------------------------------
   VERSIONIERT, WEIL LERNEN SONST VERGESSEN HEISST
   -------------------------------------------------------------------------

   Jede Aenderung erzeugt eine neue Version, die auf ihre Vorgaengerin
   zeigt und einen Grund mitbringt. Ohne diese Kette wuesste niemand,
   ob ein Kanal nie drin war oder einmal entfernt wurde - und der
   Unterschied ist der ganze Lernstand.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Die Reihenfolge ist die Abhaengigkeit: entdecken, dann vertiefen. */
  var ENTDECKUNGSWEGE = ["YOUTUBE_SEARCH", "INSTAGRAM_BUSINESS_DISCOVERY"];

  /* -------------------------------------------------------------------
     FELDER, DIE NICHT HEREINDUERFEN

     Zwei Gruppen, zwei Gruende.

     FREMDER INHALT: Beschreibungen, Titel, Vorschaubilder. §5 - fremde
     Texte, Bilder und Creatives werden niemals Produktionsmaterial.
     Ein Kanalname ist davon ausgenommen: ohne ihn gibt es keinen
     Aufruf. Er ist eine Adresse, kein Werk.

     URTEILE: alles, was einen Account bewertet. §3 - keine Accounts
     automatisch als gut oder schlecht bewerten. Das ist leichter
     gesagt als eingehalten, weil sich ein Urteil in einem harmlosen
     Feldnamen versteckt ("tier", "grade", "recommended"). Deshalb
     steht die Liste hier und wird gemessen, nicht zugesichert.
     ------------------------------------------------------------------- */
  var VERBOTEN_INHALT = ["description", "bio", "videoTitle", "videoTitles",
    "caption", "captions", "thumbnail", "thumbnailUrl", "transcript",
    "quote", "text", "screenshot"];

  var VERBOTEN_URTEIL = ["quality", "qualityScore", "rating", "grade",
    "tier", "good", "bad", "recommended", "blacklisted", "verdict",
    "creatorScore", "ranking"];

  var STATE = {
    /* Entdeckt, aber noch nie beobachtet: wir wissen von ihm, mehr nicht. */
    DISCOVERED: "DISCOVERED",
    /* Liefert Beobachtungen zu unseren Themen. */
    WATCHED: "WATCHED",
    /* Aus dem Beobachtungsprogramm genommen - eine Aussage ueber UNSER
       Programm, nicht ueber den Kanal. */
    RETIRED_NO_PROGRAM_RELEVANCE: "RETIRED_NO_PROGRAM_RELEVANCE"
  };

  /* -------------------------------------------------------------------
     SUCHBEGRIFFE AUS DEM CONTENT UNIVERSE

     Je Content Family ein kleiner Satz deutschsprachiger Suchphrasen,
     die zur FORM passen. Das sind keine Kanalnamen - es sind Fragen,
     die unser Programm stellt. Wer sie beantwortet, entscheidet die
     Suche und nicht wir.
     ------------------------------------------------------------------- */
  var FAMILY_QUERIES = {
    NEWS_NOW:             ["boersennews deutsch", "aktien news heute"],
    STOCK_STORY:          ["aktienanalyse deutsch", "aktie vorgestellt"],
    ETF_PRODUCT:          ["etf erklaert deutsch", "etf sparplan"],
    MARKET_EXPLAINER:     ["boerse erklaert", "maerkte verstehen deutsch"],
    EDUCATION:            ["geldanlage lernen", "boerse fuer anfaenger"],
    DATA_STORY:           ["aktien kennzahlen erklaert"],
    RANKING:              ["beste aktien", "top aktien deutsch"],
    COMPARISON:           ["etf vergleich", "aktien vergleich deutsch"],
    MEGATREND:            ["zukunftsaktien", "megatrends investieren"],
    DIVIDEND:             ["dividenden aktien deutsch", "dividendenstrategie"],
    EARNINGS:             ["quartalszahlen analyse"],
    EVERGREEN:            ["langfristig investieren deutsch"],
    VU_ORIGINAL_RESEARCH: ["aktien research deutsch"],
    MAGAZINE_STORY:       ["finanzjournalismus deutsch"],
    REPORT_STORY:         ["aktienreport deutsch"]
  };

  function normalisiere(s) {
    return String(s === undefined || s === null ? "" : s)
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  /**
   * Suchphrasen fuer die Entdeckung — abgeleitet, nicht kuratiert.
   *
   * Dieselbe Regel wie beim Hashtag-Portfolio: eine Entitaet lohnt eine
   * eigene Suche erst, wenn sie im Programm WIEDERKEHRT. Eine Suche
   * nach einem Titel, der genau einmal vorkommt, findet Kanaele, die
   * genau einmal passen.
   */
  function suchbegriffe(topics, options) {
    options = options || {};
    var minThemen = options.minTopicsForEntity === undefined
      ? 2 : options.minTopicsForEntity;

    var map = {};
    function merke(phrase, t, entitaet) {
      var k = normalisiere(phrase);
      if (!k) return;
      map[k] = map[k] || { query: k, topicIds: [], families: [], entities: [] };
      var e = map[k];
      if (e.topicIds.indexOf(t.topicId) === -1) e.topicIds.push(t.topicId);
      if (t.family && e.families.indexOf(t.family) === -1) e.families.push(t.family);
      if (entitaet && e.entities.indexOf(entitaet) === -1) e.entities.push(entitaet);
    }

    (topics || []).forEach(function (t) {
      (FAMILY_QUERIES[t.family] || []).forEach(function (q) { merke(q, t, null); });
      (t.entities || []).forEach(function (ent) {
        if (normalisiere(ent).length < 3) return;
        merke(ent + " aktie analyse", t, ent);
      });
    });

    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (q) {
        if (q.families.length && !q.entities.length) return true;
        return q.topicIds.length >= minThemen;
      })
      /* Mehr Themen je Suche heisst mehr Antwort je Einheit. Eine
         Aussage ueber unser Programm, nicht ueber die Treffer. */
      .sort(function (a, b) {
        if (b.topicIds.length !== a.topicIds.length) {
          return b.topicIds.length - a.topicIds.length;
        }
        return a.query.localeCompare(b.query);
      });
  }

  /* -------------------------------------------------------------------
     EIN EINTRAG

     Er traegt eine Adresse, eine Herkunft und eine Zaehlung. Kein
     Werk, kein Urteil.
     ------------------------------------------------------------------- */
  function eintrag(spec) {
    spec = spec || {};
    return {
      creatorId: spec.creatorId || null,
      platform: spec.platform || null,
      /* Adresse, kein Werk: ohne sie gibt es keinen Aufruf. */
      handle: spec.handle || null,
      /* -----------------------------------------------------------
         Aus einem YouTube-Kanal folgt kein Instagram-Name. Geraten
         wird er nicht; belegt wird er oder er bleibt null - samt
         Grund, damit niemand die Luecke fuer eine Antwort haelt. */
      instagramHandle: spec.instagramHandle || null,
      instagramLinkEvidence: spec.instagramLinkEvidence || null,
      instagramLinkState: spec.instagramHandle
        ? (spec.instagramLinkEvidence ? "EVIDENCED" : "UNEVIDENCED")
        : "UNRESOLVED",
      discoveredAt: spec.discoveredAt || null,
      discoveredVia: spec.discoveredVia || null,
      discoveredByQuery: spec.discoveredByQuery || null,
      /* Wozu aus UNSEREM Programm gehoert er. */
      topicMapping: (spec.topicIds || []).slice(),
      contentFamilyMapping: (spec.families || []).slice(),
      observationCount: spec.observationCount || 0,
      lastObservedAt: spec.lastObservedAt || null,
      state: spec.state || STATE.DISCOVERED,
      /* Woertlich, weil die Verwechslung der ganze Punkt ist. */
      isQualityJudgement: false
    };
  }

  /**
   * Prueft einen Eintrag auf beides: fremden Inhalt und verstecktes
   * Urteil. Zwei Verbote, ein Durchgang.
   */
  function pruefe(e) {
    var befunde = [];
    VERBOTEN_INHALT.forEach(function (f) {
      if (e && Object.prototype.hasOwnProperty.call(e, f) &&
          e[f] !== null && e[f] !== undefined) {
        befunde.push({ id: "copiedContent", field: f,
          message: "Feld \"" + f + "\" traegt fremden Inhalt. Vision " +
            "Universe lernt Muster und uebernimmt keine Werke." });
      }
    });
    VERBOTEN_URTEIL.forEach(function (f) {
      if (e && Object.prototype.hasOwnProperty.call(e, f) &&
          e[f] !== null && e[f] !== undefined) {
        befunde.push({ id: "creatorJudgement", field: f,
          message: "Feld \"" + f + "\" bewertet einen fremden Account. " +
            "Von aussen sehen wir Zahlen ohne Nenner; daraus folgt kein " +
            "Urteil." });
      }
    });
    return { ok: befunde.length === 0, findings: befunde };
  }

  function inhalt(eintraege) {
    return (eintraege || []).map(function (e) {
      return [e.platform, e.creatorId, e.state,
        (e.topicMapping || []).slice().sort().join("|")].join("~");
    }).sort().join("\n");
  }

  /**
   * Eine Version des Watch Universe.
   *
   * `basedOn` und `changeReason` sind nicht Zierde: ohne sie ist nicht
   * unterscheidbar, ob ein Kanal nie drin war oder einmal entfernt
   * wurde - und genau dieser Unterschied IST der Lernstand.
   */
  function universum(eintraege, spec) {
    spec = spec || {};
    var liste = (eintraege || []).slice();
    var schlecht = [];
    liste.forEach(function (e) {
      var p = pruefe(e);
      if (!p.ok) schlecht.push({ creatorId: e.creatorId, findings: p.findings });
    });

    var nachStand = {};
    liste.forEach(function (e) {
      nachStand[e.state] = (nachStand[e.state] || 0) + 1;
    });

    return {
      version: spec.version === undefined ? 1 : spec.version,
      basedOn: spec.basedOn === undefined ? null : spec.basedOn,
      createdAt: spec.createdAt || null,
      changeReason: spec.changeReason || "Erste Fassung.",
      discoveryOrder: ENTDECKUNGSWEGE.slice(),
      entries: liste,
      counts: nachStand,
      /* Ein Universum mit einem beanstandeten Eintrag ist nicht
         benutzbar: die Verbote sind keine Empfehlung. */
      ok: schlecht.length === 0,
      violations: schlecht,
      fingerprint: inhalt(liste),
      rankedByQuality: false,
      explanation: liste.length + " Kanaele, entdeckt ueber " +
        ENTDECKUNGSWEGE.join(" dann ") + ". Die Reihenfolge ist eine " +
        "Abhaengigkeit: Business Discovery findet niemanden, es sieht " +
        "jemanden nach."
    };
  }

  /* -------------------------------------------------------------------
     LERNEN

     Zwei Bewegungen, beide ueber UNS:

       Ein Kanal, der Beobachtungen zu unseren Themen liefert, bleibt.
       Ein Kanal, der ueber ein ganzes Fenster keine liefert, geht -
       nicht, weil er schlecht ist, sondern weil er zu unserem
       Programm nichts beitraegt.

     Der Unterschied steht in der Begruendung JEDES Eintrags, nicht nur
     im Kommentar dieser Datei: ein spaeterer Lauf liest Felder, keine
     Absichten.
     ------------------------------------------------------------------- */
  function lernen(vorher, beobachtungen, spec) {
    spec = spec || {};
    var minBeobachtungen = spec.minObservations === undefined
      ? 1 : spec.minObservations;
    var b = beobachtungen || [];
    var jetzt = spec.now || null;

    /* Beobachtungen je Kanal - gezaehlt, nicht geschaetzt. */
    var zaehler = {};
    b.forEach(function (o) {
      var id = o && (o.creatorId || o.accountId);
      if (!id) return;
      zaehler[id] = zaehler[id] || { n: 0, zuletzt: null, themen: [] };
      zaehler[id].n += 1;
      if (o.observedAt && (!zaehler[id].zuletzt || o.observedAt > zaehler[id].zuletzt)) {
        zaehler[id].zuletzt = o.observedAt;
      }
      if (o.topicId && zaehler[id].themen.indexOf(o.topicId) === -1) {
        zaehler[id].themen.push(o.topicId);
      }
    });

    var aenderungen = [];
    var neu = (vorher && vorher.entries ? vorher.entries : []).map(function (e) {
      var z = zaehler[e.creatorId];
      var kopie = Object.assign({}, e);

      if (z) {
        kopie.observationCount = (e.observationCount || 0) + z.n;
        /* -----------------------------------------------------------
           DER ZAEHLER MEINT AUFEINANDERFOLGEND

           Er stand zuerst still, statt zurueckzugehen. Die Folge war
           nicht sichtbar, aber sie war da: ein Kanal, der in jedem
           zweiten Fenster beobachtet wird, sammelt drei leere Fenster
           ein und faellt heraus - obwohl er regelmaessig liefert.

           "Traegt zu unserem Programm nichts bei" heisst
           UNUNTERBROCHEN nichts. Eine Beobachtung setzt die Reihe
           zurueck. */
        kopie.emptyWindows = 0;
        kopie.lastObservedAt = z.zuletzt || e.lastObservedAt;
        z.themen.forEach(function (t) {
          if (kopie.topicMapping.indexOf(t) === -1) kopie.topicMapping.push(t);
        });
        if (e.state === STATE.DISCOVERED && z.n >= minBeobachtungen) {
          kopie.state = STATE.WATCHED;
          aenderungen.push({ creatorId: e.creatorId, from: e.state, to: kopie.state,
            reason: z.n + " Beobachtungen zu unseren Themen. Das ist eine " +
              "Aussage ueber die Relevanz fuer UNSER Programm und keine " +
              "Bewertung des Kanals." });
        }
        return kopie;
      }

      /* -------------------------------------------------------------
         KEINE BEOBACHTUNG IST NICHT DASSELBE WIE EINE SCHLECHTE

         Ein Kanal ohne Treffer kann drei Dinge bedeuten: er passt
         nicht mehr zu unserem Programm, er hat in diesem Fenster
         nichts veroeffentlicht, oder wir haben nicht hingesehen. Nur
         das erste rechtfertigt ein Entfernen - und unterscheiden kann
         man es nur ueber MEHRERE leere Fenster. */
      var leer = (e.emptyWindows || 0) + 1;
      kopie.emptyWindows = leer;
      var maxLeer = spec.maxEmptyWindows === undefined ? 3 : spec.maxEmptyWindows;
      if (leer >= maxLeer && e.state !== STATE.RETIRED_NO_PROGRAM_RELEVANCE) {
        kopie.state = STATE.RETIRED_NO_PROGRAM_RELEVANCE;
        aenderungen.push({ creatorId: e.creatorId, from: e.state, to: kopie.state,
          reason: leer + " Fenster ohne Beobachtung zu unseren Themen. " +
            "Aus dem Beobachtungsprogramm genommen, weil er zu UNSEREM " +
            "Programm nichts beitraegt - das ist kein Urteil ueber den " +
            "Kanal und keine Aussage ueber seine Qualitaet." });
      }
      return kopie;
    });

    /* Neu entdeckte kommen dazu - als DISCOVERED, nicht als bewertet. */
    (spec.discovered || []).forEach(function (d) {
      var schonDa = neu.some(function (e) {
        return e.creatorId === d.creatorId && e.platform === d.platform;
      });
      if (schonDa) return;
      neu.push(eintrag(Object.assign({ discoveredAt: jetzt }, d)));
      aenderungen.push({ creatorId: d.creatorId, from: null, to: STATE.DISCOVERED,
        reason: "Ueber " + (d.discoveredVia || "unbekannt") + " gefunden zu " +
          "der Suche \"" + (d.discoveredByQuery || "?") + "\", die aus " +
          "unserem Content Universe stammt." });
    });

    var grund = aenderungen.length
      ? aenderungen.length + " Aenderung(en) aus " + b.length + " Beobachtungen."
      : "Keine Aenderung: " + b.length + " Beobachtungen aendern an der " +
        "Zusammensetzung nichts.";

    var naechste = universum(neu, {
      version: (vorher && vorher.version ? vorher.version : 0) + 1,
      basedOn: vorher && vorher.version ? vorher.version : null,
      createdAt: jetzt,
      changeReason: grund
    });
    naechste.changes = aenderungen;
    /* Eine Version ohne Aenderung ist trotzdem eine Version: sie
       belegt, dass hingesehen wurde. */
    naechste.changed = aenderungen.length > 0;
    return naechste;
  }

  /**
   * Der Zustand der Entdeckung.
   *
   * Ohne YouTube-Schluessel wird nicht entdeckt - und das ist ein
   * offener Owner-Schritt, kein Defekt.
   */
  function capability(spec) {
    spec = spec || {};
    var youtube = !!spec.youtubeReady;
    var meta = spec.metaConnected;
    return {
      modelId: "creator.watch_universe",
      discoveryOrder: ENTDECKUNGSWEGE.slice(),
      youtubeReady: youtube,
      /* null bleibt null: aus fehlenden lokalen Credentials folgt
         nicht, dass nichts verbunden ist (§7). */
      metaConnected: meta === undefined ? null : meta,
      canDiscover: youtube,
      canDeepen: youtube && meta === true,
      explanation: youtube
        ? "Entdeckung moeglich. Vertiefung ueber Business Discovery " +
          (meta === true ? "ebenfalls." : meta === null || meta === undefined
            ? "unbekannt - die Verbindung wurde von hier aus nicht geprueft."
            : "nicht: kein verbundenes Meta-Konto.")
        : "Ohne YouTube-Schluessel wird nicht entdeckt. Das ist der offene " +
          "Owner-Schritt und kein Defekt."
    };
  }

  var api = {
    ENTDECKUNGSWEGE: ENTDECKUNGSWEGE,
    STATE: STATE,
    FAMILY_QUERIES: FAMILY_QUERIES,
    VERBOTEN_INHALT: VERBOTEN_INHALT,
    VERBOTEN_URTEIL: VERBOTEN_URTEIL,
    normalisiere: normalisiere,
    suchbegriffe: suchbegriffe,
    eintrag: eintrag,
    pruefe: pruefe,
    universum: universum,
    lernen: lernen,
    capability: capability
  };

  if (isNode) module.exports = api;
  else global.VUSocialCreatorUniverse = api;
})(typeof window !== "undefined" ? window : globalThis);
