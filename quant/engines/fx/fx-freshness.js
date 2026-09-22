/* =========================================================================
   VISION UNIVERSE — fx/fx-freshness.js   (Currency Layer V1, §23, §53)

   IST DER WECHSELKURS, MIT DEM WIR GERADE RECHNEN, DER STAND, DEN WIR
   BEHAUPTEN?

   Der Aktienkurs kann Realtime sein und der Wechselkurs daneben einen Tag
   alt. Das ist kein Fehler - es ist der Normalfall, sobald FX taeglich und
   Aktien im Sekundentakt kommen. Ein Fehler wird daraus genau dann, wenn
   das Produkt das Ergebnis "Realtime EUR" nennt.

   Diese Datei ist die Schwester von realtime/freshness.js und absichtlich
   nach demselben Muster gebaut: vier Zustaende, ein Rang, eine Karenz je
   Frequenz. Sie ist trotzdem eine eigene Datei, weil sie eine andere Frage
   beantwortet. realtime/freshness.js fragt "gehoert diese Kursreihe zur
   Sitzung, die jetzt gelten muesste" und braucht dafuer einen
   Boersenkalender. FX hat keine Boersensitzung im selben Sinn; hier zaehlt
   allein, wie alt der Stand gemessen an seiner zugesagten Frequenz ist.

   DIE VIER ZUSTAENDE

     CURRENT         Der Stand liegt innerhalb der Toleranz seiner Frequenz.
     LAST_AVAILABLE  Kein Stand fuer den angefragten Zeitpunkt; der letzte
                     zulaessige vorherige gilt. Der Normalfall an jedem
                     Wochenende - benannt, nicht als Makel.
     STALE           Aelter als die Toleranz. Darf gezeigt, nie als aktuell
                     beschriftet werden.
     UNAVAILABLE     Kein verwendbarer Stand. Dann wird nicht umgerechnet,
                     sondern die native Waehrung gezeigt.

   DIE REGEL, DIE ALLES TRAEGT

   Bei UNAVAILABLE gibt es keine Anzeige in der Anzeigewaehrung. Keine
   1:1-Umrechnung, kein Eurozeichen an einer Dollarzahl, keine "ungefaehre"
   Angabe. Der ehrliche Rueckfall ist die Originalwaehrung mit einem
   Hinweis - nicht eine falsche Zahl mit dem richtigen Symbol.

   CONSUMER-SPRACHE

   Diese Datei liefert zusaetzlich einen kurzen deutschen Satz je Zustand.
   Nicht jede Karte soll eine FX-Metadatenflut tragen (§53); die meisten
   zeigen gar nichts, und nur STALE und UNAVAILABLE muessen sichtbar
   werden. `consumerVisible` sagt, welcher Fall das ist.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "fx-freshness-1.0.0";
  var CONTRACT_VERSION = "currency-fx-v1.0.0";

  var STATES = ["UNAVAILABLE", "STALE", "LAST_AVAILABLE", "CURRENT"];
  var RANK = { UNAVAILABLE: 0, STALE: 1, LAST_AVAILABLE: 2, CURRENT: 3 };

  /* Ab wann ein Stand seiner Frequenz nicht mehr gerecht wird.

     DAILY steht bewusst auf vier Tagen und nicht auf einem: Karfreitag bis
     Ostermontag sind vier Kalendertage ohne Fixing, und ein Vertrag, der
     Ostern als Stoerung meldet, wird ignoriert, bis er eine echte Stoerung
     meldet. Vier Tage decken jede Feiertagsbruecke ab und fangen trotzdem
     einen Abriss, der laenger dauert. */
  var STALE_AFTER = {
    REALTIME: 120,        // 2 Minuten
    INTRADAY: 3600,       // 1 Stunde
    DAILY:    345600      // 4 Tage
  };

  var LABELS = {
    CURRENT:        { de: "Wechselkurs aktuell", consumerVisible: false,
                      detail: "Der verwendete Wechselkurs liegt innerhalb der zugesagten Aktualitaet." },
    LAST_AVAILABLE: { de: "Letzter verfuegbarer Wechselkurs", consumerVisible: false,
                      detail: "Fuer den angefragten Tag gibt es kein Fixing; es gilt der letzte vorherige Stand." },
    STALE:          { de: "Wechselkurs nicht aktuell", consumerVisible: true,
                      detail: "Der verwendete Wechselkurs ist aelter als vorgesehen. Die Umrechnung bleibt sichtbar, gilt aber nicht als aktuell." },
    UNAVAILABLE:    { de: "Kein Wechselkurs verfuegbar", consumerVisible: true,
                      detail: "Es liegt kein verwendbarer Wechselkurs vor. Angezeigt wird der Originalwert in seiner Waehrung." }
  };

  /* --------------------------------------------------------------------
     DER DEVISENMARKT HAT EINEN ANDEREN KALENDER ALS EINE AKTIENBOERSE
     -------------------------------------------------------------------- */

  /* realtime/market-hours.js kennt Sitzungen mit Eroeffnung und Schluss.
     Fuer FX ist das falsch: der Devisenmarkt laeuft durchgehend von
     Sonntag 22:00 UTC bis Freitag 22:00 UTC. Es gibt keine
     Mittagspause, keinen Eroeffnungsgong und - je nach Paar - auch keine
     einheitlichen Feiertage.

     Warum das hier ueberhaupt zaehlt: ohne diesen Kalender ist jeder
     Samstag ein Stoerfall. Ein Kurs von Freitag 22:00 ist am Sonntag
     36 Stunden alt und wuerde gegen jede Realtime- oder Intraday-Toleranz
     als STALE gelten - obwohl er der richtige, aktuelle Kurs ist. Ein
     System, das am Wochenende verlaesslich Warnungen erzeugt, bringt
     seinen Nutzern bei, Warnungen zu ueberlesen.

     Die Gegenrichtung ist genauso wichtig und der eigentliche Grund:
     bleibt der Kurs am Dienstagnachmittag stehen, ist das sehr wohl eine
     Stoerung, und dieselbe Anzeige muss das dann auch sagen. Der
     Kalender unterscheidet die beiden Faelle; er verschweigt keinen. */
  var MARKET_PHASES = ["OPEN", "CLOSED_WEEKEND"];

  var WEEK_OPEN_UTC_HOUR = 22;   // Sonntag 22:00 UTC
  var WEEK_CLOSE_UTC_HOUR = 22;  // Freitag 22:00 UTC

  /* Wie nah am Marktschluss der letzte Stand liegen muss, damit er als
     Schlusskurs gilt.

     Eine Stunde, und nicht die Realtime-Toleranz von zwei Minuten: gegen
     Freitagabend duennt der Handel aus, und der letzte Tick eines Paares
     kann ohne Weiteres eine halbe Stunde vor Schluss liegen. Mit der
     Realtime-Toleranz gemessen waere dann jedes Wochenende ein
     Stoerfall - genau der Fehlalarm, den der Marktkalender verhindern
     soll.

     Eine Stunde ist zugleich eng genug, dass ein Stand, der schon am
     Mittwoch stehen blieb, nicht durchrutscht. */
  var CLOSE_GRACE_SECONDS = 3600;

  /**
   * Laeuft der Devisenhandel zu diesem Zeitpunkt?
   *
   * Bewusst ohne Feiertagskalender: ein Feiertagskalender je Waehrungsraum
   * waere eine eigene Datenquelle mit eigener Pflege, und ein ungepflegter
   * waere schlechter als keiner. Feiertage zeigen sich statt dessen als
   * Luecke in der Reihe und werden von PREVIOUS_AVAILABLE aufgefangen.
   */
  function marketPhase(when) {
    var ms = parseTime(when === undefined ? Date.now() : when);
    if (!isFinite(ms)) return { phase: "OPEN", isOpen: true, reason: "unknownTimestamp" };
    var d = new Date(ms);
    var dow = d.getUTCDay();          // 0 = Sonntag
    var hour = d.getUTCHours();

    if (dow === 6) return { phase: "CLOSED_WEEKEND", isOpen: false, reason: "saturday" };
    if (dow === 0 && hour < WEEK_OPEN_UTC_HOUR) {
      return { phase: "CLOSED_WEEKEND", isOpen: false, reason: "sundayBeforeOpen" };
    }
    if (dow === 5 && hour >= WEEK_CLOSE_UTC_HOUR) {
      return { phase: "CLOSED_WEEKEND", isOpen: false, reason: "fridayAfterClose" };
    }
    return { phase: "OPEN", isOpen: true, reason: null };
  }

  /** Der letzte Freitag 22:00 UTC vor dem Zeitpunkt. */
  function lastMarketClose(ms) {
    var d = new Date(ms);
    var probe = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WEEK_CLOSE_UTC_HOUR, 0, 0);
    while (new Date(probe).getUTCDay() !== 5 || probe > ms) probe -= 86400000;
    return probe;
  }

  function parseTime(v) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === "number") return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v === "string") {
      /* Ein reines Tagesdatum ist ein Tagesschluss. Es auf Mitternacht zu
         legen wuerde jeden Tagesstand um bis zu 24 Stunden aelter
         erscheinen lassen, als er ist. Wir legen ihn auf das Ende des
         Tages - der Stand gilt fuer diesen Tag, nicht fuer seinen Beginn. */
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(v + "T23:59:59Z");
      return Date.parse(v);
    }
    return NaN;
  }

  /**
   * Der Freshness-Zustand eines FX-Standes.
   *
   * GEMESSEN WIRD GEGEN DEN ZEITPUNKT, DEN DER KURS BESCHREIBEN SOLL -
   * nicht gegen die Uhr.
   *
   * Das ist der Unterschied, an dem eine naiv gebaute Freshness-Pruefung
   * scheitert: ein Wechselkurs vom 30.06.2021, mit dem ein Bilanzwert vom
   * 30.06.2021 umgerechnet wird, ist perfekt - er ist genau der Kurs
   * dieses Stichtags. Gegen die heutige Uhr gemessen waere er fuenf Jahre
   * alt und damit STALE, und jede historische Anzeige traege eine Warnung,
   * die nichts bedeutet. Wer solche Warnungen erzeugt, bringt den Nutzern
   * bei, sie zu uebersehen - und dann uebersehen sie auch die echte.
   *
   * Bezugszeitpunkt ist deshalb `quote.requestedDate`, sofern vorhanden,
   * sonst `now`. Liegt der angefragte Tag in der Zukunft, gilt `now`:
   * ein Kurs kann nicht frischer sein als die Gegenwart.
   *
   * @param {object} quote   Ergebnis aus fx-rates.rateAt/latest/periodAverage
   * @param {object} opts    { now, frequency, staleAfterSeconds }
   */
  function assess(quote, opts) {
    opts = opts || {};
    var now = parseTime(opts.now !== undefined ? opts.now : Date.now());
    if (!isFinite(now)) now = Date.now();

    if (!quote || quote.available !== true) {
      return build("UNAVAILABLE", null, null, null,
        quote && quote.reason ? quote.reason : "noQuote",
        quote && quote.detail ? quote.detail : null);
    }

    /* Der Fast Path traegt keinen Stand, weil er keinen braucht. Eine
       Identitaet ist immer aktuell - sie kann gar nicht veralten. */
    if (quote.method === "IDENTITY") {
      return build("CURRENT", 0, quote.asOf, "IDENTITY", null,
        "Quell- und Zielwaehrung sind gleich; es wird kein Wechselkurs verwendet.");
    }

    var frequency = opts.frequency || quote.frequency || "DAILY";
    var limit = typeof opts.staleAfterSeconds === "number"
      ? opts.staleAfterSeconds
      : (STALE_AFTER[frequency] !== undefined ? STALE_AFTER[frequency] : STALE_AFTER.DAILY);

    var asOfMs = parseTime(quote.asOf);
    if (!isFinite(asOfMs)) {
      return build("UNAVAILABLE", null, quote.asOf || null, frequency, "invalidAsOf",
        "Der Stand traegt kein auswertbares Datum. Ein Kurs ohne Zeitpunkt ist kein Kurs.");
    }

    /* Der Bezugszeitpunkt: der angefragte Tag, wenn es einen gibt. Bei
       einem Periodendurchschnitt ist es das Periodenende - der Kurs
       beschreibt die Periode, die dort endet. */
    var referenceRaw = quote.requestedDate || quote.periodEnd || null;
    var reference = referenceRaw ? parseTime(referenceRaw) : now;
    if (!isFinite(reference) || reference > now) reference = now;

    var ageSeconds = Math.max(0, Math.round((reference - asOfMs) / 1000));

    if (ageSeconds > limit) {
      /* Bevor das STALE heisst: laeuft ueberhaupt Handel?

         Am Wochenende ist der Freitagsschluss der aktuelle Kurs, nicht
         ein veralteter. Er wird LAST_AVAILABLE genannt - derselbe
         Zustand wie bei einem uebertragenen Feiertagskurs - und traegt
         den Grund mit. Gemessen wird gegen den Marktschluss, nicht
         gegen die Uhr: ein Stand, der schon vor Freitagabend stehen
         blieb, ist auch am Samstag eine Stoerung. */
      if (opts.marketAware !== false && frequency !== "DAILY") {
        var phase = marketPhase(reference);
        if (!phase.isOpen) {
          var lastClose = lastMarketClose(reference);
          var ageAtClose = Math.max(0, Math.round((lastClose - asOfMs) / 1000));
          var closeLimit = Math.max(limit, CLOSE_GRACE_SECONDS);
          if (ageAtClose <= closeLimit) {
            return build("LAST_AVAILABLE", ageSeconds, quote.asOf, frequency, null,
              "Der Devisenhandel ruht (" + phase.reason + "). Der Stand vom " + quote.asOf +
              " ist der letzte vor Marktschluss und damit der geltende.", referenceRaw, phase);
          }
          return build("STALE", ageSeconds, quote.asOf, frequency, "staleBeforeMarketClose",
            "Der Stand vom " + quote.asOf + " lag schon " + Math.round(ageAtClose / 60) +
            " Minuten vor dem letzten Marktschluss zurueck (zulaessig sind " + Math.round(closeLimit / 60) +
            "). Das ist kein Wochenende, das ist eine Luecke.",
            referenceRaw, phase);
        }
      }
      return build("STALE", ageSeconds, quote.asOf, frequency, "ageExceedsLimit",
        "Stand vom " + quote.asOf + " ist gegenueber " + (referenceRaw || "jetzt") +
        " um mehr als die zulaessigen " + limit + " Sekunden zurueck.", referenceRaw,
        marketPhase(reference));
    }

    /* Ein Uebertrag ist nicht veraltet, er ist uebertragen. Der
       Unterschied ist fuer den Nutzer belanglos und fuer die Methodik
       wesentlich: LAST_AVAILABLE heisst "die Quelle hat an diesem Tag
       nichts geliefert, weil nichts zu liefern war". */
    if (quote.method === "PREVIOUS_AVAILABLE" ||
        (quote.method === "LATEST_AVAILABLE" && quote.requestedDate)) {
      return build("LAST_AVAILABLE", ageSeconds, quote.asOf, frequency, null,
        quote.fallbackReason || null, referenceRaw, marketPhase(reference));
    }

    return build("CURRENT", ageSeconds, quote.asOf, frequency, null, null, referenceRaw, marketPhase(reference));
  }

  function build(state, ageSeconds, asOf, frequency, reason, detail, reference, phase) {
    var label = LABELS[state];
    return {
      contractVersion: CONTRACT_VERSION,
      state: state,
      rank: RANK[state],
      asOf: asOf,
      referencePoint: reference || null,
      ageSeconds: ageSeconds,
      frequency: frequency,
      marketPhase: phase ? phase.phase : null,
      marketOpen: phase ? phase.isOpen : null,
      displayAllowed: state !== "UNAVAILABLE",
      /* Die Frage, an der sich §53 entscheidet: darf ueber diesem Wert
         "Realtime" stehen?

         Zwei Bedingungen, und die zweite wurde zuerst vergessen. CURRENT
         allein reicht nicht: ein TAGESKURS ist innerhalb seiner
         Vier-Tage-Toleranz voellig in Ordnung und damit CURRENT - aber
         "Realtime EUR" darf ueber einem Ergebnis, das mit dem
         gestrigen Tagesschluss gerechnet wurde, trotzdem nicht stehen.
         Der Aktienkurs ist dann realtime, die Umrechnung nicht, und das
         Produkt daraus ist es erst recht nicht.

         IDENTITY ist der eine Fall ohne Wechselkurs: eine EUR-Zahl in
         EUR ist so aktuell wie der Wert selbst. */
      realtimeClaimAllowed: state === "CURRENT" &&
        (frequency === "REALTIME" || frequency === "INTRADAY" || frequency === "IDENTITY"),
      consumerVisible: label.consumerVisible,
      label: label.de,
      detail: detail || label.detail,
      reason: reason || null
    };
  }

  /**
   * Der schlechteste Zustand mehrerer Staende. Eine Karte, die Kurs,
   * Marktkapitalisierung und Umsatz gemeinsam in EUR zeigt, ist so aktuell
   * wie ihr aeltester Wechselkurs - nicht so aktuell wie ihr juengster.
   */
  function worst(assessments) {
    var list = (assessments || []).filter(Boolean);
    if (!list.length) return build("UNAVAILABLE", null, null, null, "noAssessments", null);
    return list.reduce(function (a, b) { return a.rank <= b.rank ? a : b; });
  }

  var api = {
    VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION,
    STATES: STATES, RANK: RANK, STALE_AFTER: STALE_AFTER, LABELS: LABELS,
    MARKET_PHASES: MARKET_PHASES, CLOSE_GRACE_SECONDS: CLOSE_GRACE_SECONDS,
    marketPhase: marketPhase, lastMarketClose: lastMarketClose,
    assess: assess, worst: worst
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Freshness = api; }
})(typeof window !== "undefined" ? window : globalThis);
