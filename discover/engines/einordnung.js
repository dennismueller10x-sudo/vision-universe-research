/* =========================================================================
   VISION UNIVERSE DISCOVER — einordnung.js

   DIE AKTIE IN DREISSIG SEKUNDEN

   Ebene 1 fragt "warum ist das interessant?". Ebene 2 fragt weiter: läuft
   das Unternehmen, ist die Aktie teuer, wie riskant ist sie, was spricht
   dafür und was dagegen. Das sind die Fragen, die ein Mensch stellt, bevor
   er eine Aktie ernst nimmt - und keine davon heißt "wie hoch ist das
   Momentum-Perzentil".

   Dieses Modul beantwortet sie in Worten: WACHSTUM SEHR STARK, BEWERTUNG
   HOCH, TREND STARK, RISIKO ERHÖHT. Vier Worte, die jeder versteht, jedes
   mit seiner Zahl daneben.

   DIE REGELN SIND DER PRODUKTVERTRAG

   Ein Wort wie "hoch" ist eine Behauptung. Sie ist nur zulässig, wenn eine
   nachlesbare Schwelle dahintersteht - deshalb stehen alle Schwellen hier,
   in einer Tabelle, und nicht verstreut in der Oberfläche. Wer sie ändert,
   ändert eine Produktaussage und sieht das im Diff.

   Was hier NICHT passiert: keine Schätzung, kein Branchendurchschnitt als
   Ersatz für eine fehlende Zahl, keine Prognose. Fehlt die Datengrundlage,
   fehlt die Einordnung - und die Oberfläche sagt, warum.

   CHANCE UND RISIKO

   Die zweite Aufgabe des Moduls ist eine Waage. Jede Aktie bekommt beide
   Seiten: was für sie spricht und was man beachten sollte. Nicht als
   Meinung, sondern als Liste belegter Beobachtungen. Eine Seite, die nur
   Gründe dafür aufzählt, ist Werbung; eine, die nur warnt, ist auch keine
   Analyse. Volatilität und Rückschlag liegen für jeden Titel vor - es gibt
   deshalb keine Aktie, die ohne "das sollte man beachten" auskommt.

   Und zuletzt: keine Empfehlung. Nirgends steht, ob man kaufen soll.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-einordnung-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  function K() {
    if (isNode) return require("./klartext.js");
    return (global.VUDiscover && global.VUDiscover.Klartext) || null;
  }
  function prozent(v, vz) { var k = K(); return k ? k.prozent(v, vz) : null; }

  /* --------------------------------------------------------------------
     Die Schwellen. Eine Tabelle, absichtlich an einer Stelle.

     `stufe` ist das Wort, das der Nutzer liest. `ton` steuert nur die
     Darstellung und traegt keine Wertung: "warm" heisst nicht schlecht,
     sondern beachtenswert.
     -------------------------------------------------------------------- */
  var SKALEN = {
    wachstum: [
      { ab: 0.25,   stufe: "Sehr stark", ton: "up" },
      { ab: 0.10,   stufe: "Stark",      ton: "up" },
      { ab: 0.02,   stufe: "Moderat",    ton: null },
      { ab: -0.02,  stufe: "Kaum verändert", ton: null },
      { ab: -Infinity, stufe: "Rückläufig", ton: "down" }
    ],
    /* Kurs-Gewinn-Verhaeltnis. Die Baender sind bewusst grob: zwischen
       einem KGV von 18 und 19 liegt keine Aussage, zwischen 12 und 40
       schon. */
    bewertung: [
      { ab: 35,  stufe: "Sehr hoch", ton: "warm" },
      { ab: 20,  stufe: "Hoch",      ton: "warm" },
      { ab: 12,  stufe: "Mittel",    ton: null },
      { ab: 0,   stufe: "Niedrig",   ton: "up" }
    ],
    /* Jahresvolatilitaet. Die Groessenordnungen entsprechen dem, was man
       bei Einzelaktien sieht: unter 22 % ruhig, ueber 60 % sehr bewegt. */
    risiko: [
      { ab: 0.60, stufe: "Hoch",     ton: "warm" },
      { ab: 0.40, stufe: "Erhöht",   ton: "warm" },
      { ab: 0.22, stufe: "Mittel",   ton: null },
      { ab: 0,    stufe: "Niedrig",  ton: "up" }
    ]
  };

  function stufeFuer(skala, wert) {
    if (!isNum(wert)) return null;
    var reihe = SKALEN[skala];
    for (var i = 0; i < reihe.length; i++) {
      if (wert >= reihe[i].ab) return reihe[i];
    }
    return reihe[reihe.length - 1];
  }

  /* Der Trend kommt nicht aus einer einzelnen Zahl, sondern aus zwei:
     wie viele Durchschnittslinien der Kurs ueberschritten hat und wie er
     ueber ein halbes Jahr gelaufen ist. Eine davon allein waere zu
     leicht zu taeuschen. */
  function trendStufe(m) {
    var lage = m.trendAlignment, halbjahr = m.return6M;
    if (!isNum(lage) && !isNum(halbjahr)) return null;
    if (isNum(lage) && lage >= 1 && isNum(halbjahr) && halbjahr > 0.05) {
      return { stufe: "Stark", ton: "up" };
    }
    if (isNum(halbjahr) && halbjahr > 0.02 && (!isNum(lage) || lage >= 0.5)) {
      return { stufe: "Aufwärts", ton: "up" };
    }
    if (isNum(halbjahr) && halbjahr < -0.10) return { stufe: "Abwärts", ton: "down" };
    if (isNum(lage) && lage <= 0.25) return { stufe: "Schwach", ton: "down" };
    return { stufe: "Seitwärts", ton: null };
  }

  /**
   * Die vier bis fünf Zeilen für "Die Aktie in 30 Sekunden".
   *
   * Jede Zeile trägt: die Frage in einem Wort, die Antwort in einem Wort,
   * den Beleg als Zahl - und den Grund, falls die Antwort fehlt.
   */
  function ueberblick(detail) {
    var m = (detail && detail.metrics) || {};
    var g = (detail && detail.geschaeftszahlen) || {};
    var zeilen = [];

    /* Wachstum */
    var w = stufeFuer("wachstum", g.umsatzWachstum);
    zeilen.push(w
      ? { id: "wachstum", label: "Wachstum", wert: w.stufe, ton: w.ton,
          beleg: "Umsatz " + prozent(g.umsatzWachstum) + " gegenüber dem Vorjahr" }
      : { id: "wachstum", label: "Wachstum", wert: null, ton: null,
          fehlt: g.message || "Für diesen Titel liegen keine Geschäftszahlen vor." });

    /* Bewertung */
    var b = g.kgvStatus === "CALCULATED" ? stufeFuer("bewertung", g.kgv) : null;
    zeilen.push(b
      ? { id: "bewertung", label: "Bewertung", wert: b.stufe, ton: b.ton,
          beleg: "Kurs-Gewinn-Verhältnis " + zahl(g.kgv) }
      : { id: "bewertung", label: "Bewertung", wert: null, ton: null,
          fehlt: g.kgvStatus === "WITHHELD_REDISTRIBUTION"
            ? "Ohne ausgelieferten Kurs lässt sich die Bewertung nicht berechnen."
            : "Für diesen Titel liegen keine Gewinnzahlen vor." });

    /* Trend - liegt fuer jeden Titel vor, der eine Kursreihe hat */
    var t = trendStufe(m);
    zeilen.push(t
      ? { id: "trend", label: "Trend", wert: t.stufe, ton: t.ton,
          beleg: isNum(m.return6M) ? prozent(m.return6M) + " in sechs Monaten" : null }
      : { id: "trend", label: "Trend", wert: null, ton: null,
          fehlt: "Keine ausreichende Kurshistorie." });

    /* Risiko */
    var r = stufeFuer("risiko", m.volatility252d);
    zeilen.push(r
      ? { id: "risiko", label: "Risiko", wert: r.stufe, ton: r.ton,
          beleg: isNum(m.maxDrawdown252d)
            ? "Größter Rückgang im Jahr " + prozent(m.maxDrawdown252d) : null }
      : { id: "risiko", label: "Risiko", wert: null, ton: null,
          fehlt: "Keine Schwankungsbreite berechenbar." });

    /* Analysten gibt es in diesem Repository nicht - und eine Zeile
       "keine Daten" fuer etwas, das wir gar nicht beziehen, waere ein
       leeres Versprechen. Sie erscheint deshalb nicht. */
    return { engineVersion: ENGINE_VERSION, zeilen: zeilen };
  }

  function bewertungsStufeDafuer(g) {
    if (!g || g.kgvStatus !== "CALCULATED") return false;
    var stufe = stufeFuer("bewertung", g.kgv);
    return !!stufe && stufe.stufe === "Niedrig";
  }

  function zahl(v) {
    if (!isNum(v)) return "–";
    return (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  }

  /* --------------------------------------------------------------------
     Die Waage.

     Jeder Eintrag ist eine Beobachtung mit ihrer Zahl. Die Reihenfolge
     ist die Staerke des Belegs, nicht die Staerke der Meinung.
     -------------------------------------------------------------------- */
  function waage(detail) {
    var m = (detail && detail.metrics) || {};
    var s = (detail && detail.signals) || {};
    var g = (detail && detail.geschaeftszahlen) || {};
    var dafuer = [], beachten = [];

    /* ---- was dafür spricht ---- */
    if (isNum(g.umsatzWachstum) && g.umsatzWachstum >= 0.10) {
      dafuer.push({ id: "umsatz", text: "Der Umsatz wächst deutlich",
                    beleg: prozent(g.umsatzWachstum) + " gegenüber dem Vorjahr" });
    }
    if (isNum(g.gewinnWachstum) && g.gewinnWachstum >= 0.10) {
      dafuer.push({ id: "gewinn", text: "Der Gewinn wächst schneller als der Umsatz" ,
                    beleg: prozent(g.gewinnWachstum) + " gegenüber dem Vorjahr" });
    }
    if (isNum(g.marge) && g.marge >= 0.20) {
      dafuer.push({ id: "marge", text: "Das Unternehmen arbeitet sehr profitabel",
                    beleg: prozent(g.marge, false) + " des Umsatzes bleiben als Gewinn" });
    }
    if (bewertungsStufeDafuer(g)) {
      dafuer.push({ id: "guenstig",
                    text: "Gemessen am Gewinn ist die Aktie günstig bewertet",
                    beleg: "Kurs-Gewinn-Verhältnis " + zahl(g.kgv) });
    }
    if (s.new52WeekHigh) {
      dafuer.push({ id: "hoch", text: "Der Kurs steht auf dem höchsten Stand des Jahres",
                    beleg: null });
    }
    if (isNum(m.leadershipPercentile) && m.leadershipPercentile >= 90) {
      dafuer.push({ id: "fuehrung", text: "Die Aktie gehört zu den stärksten im Universum",
                    beleg: "stärker als " + Math.min(99, Math.round(m.leadershipPercentile)) +
                           " % der Aktien" });
    }
    if (isNum(m.trendAlignment) && m.trendAlignment >= 1) {
      dafuer.push({ id: "trend", text: "Der Aufwärtstrend ist seit Monaten stabil",
                    beleg: "über allen vier Durchschnittslinien" });
    }
    if (isNum(m.return12M) && m.return12M > 0.20 && !dafuer.some(function (e) {
      return e.id === "fuehrung";
    })) {
      dafuer.push({ id: "rendite", text: "Die Aktie hat über zwölf Monate deutlich zugelegt",
                    beleg: prozent(m.return12M) });
    }

    /* ---- was man beachten sollte ---- */
    /* Die Schwelle ist hier bewusst DIESELBE wie die der Stufe "Hoch"
       weiter oben. Sagt die Seite "Bewertung: Hoch", muss die Waage
       erklaeren, warum das eine Beobachtung ist - sonst behauptet das
       Produkt an zwei Stellen Verschiedenes. */
    var bewertungsStufe = g.kgvStatus === "CALCULATED" ? stufeFuer("bewertung", g.kgv) : null;
    if (bewertungsStufe && (bewertungsStufe.stufe === "Hoch" ||
                            bewertungsStufe.stufe === "Sehr hoch")) {
      beachten.push({ id: "bewertung", text: "Die Bewertung ist hoch — im Kurs steckt bereits " +
                      "viel erwartetes Wachstum", beleg: "Kurs-Gewinn-Verhältnis " + zahl(g.kgv) });
    }
    if (isNum(m.volatility252d) && m.volatility252d >= 0.40) {
      beachten.push({ id: "schwankung", text: "Der Kurs schwankt stark",
                      beleg: "Jahresschwankung " + prozent(m.volatility252d, false) });
    }
    if (isNum(m.maxDrawdown252d) && m.maxDrawdown252d <= -0.18) {
      beachten.push({ id: "rueckschlag",
                      text: "Im vergangenen Jahr gab es einen deutlichen Rückschlag",
                      beleg: prozent(m.maxDrawdown252d) + " vom Höchststand" });
    }
    if (isNum(g.umsatzWachstum) && g.umsatzWachstum < 0) {
      beachten.push({ id: "schrumpft", text: "Der Umsatz ist zuletzt gesunken",
                      beleg: prozent(g.umsatzWachstum) + " gegenüber dem Vorjahr" });
    }
    if (isNum(m.distanceTo52wHigh) && m.distanceTo52wHigh <= -0.25) {
      beachten.push({ id: "unterHoch", text: "Der Kurs liegt deutlich unter seinem Jahreshoch",
                      beleg: prozent(m.distanceTo52wHigh) });
    }
    if (g.status !== "CALCULATED") {
      beachten.push({ id: "keineZahlen",
                      text: "Zu diesem Unternehmen liegen keine Geschäftszahlen vor — " +
                            "beurteilt werden kann nur der Kursverlauf",
                      beleg: null });
    }
    if (isNum(m.volatility252d) && m.volatility252d < 0.40 &&
        isNum(m.maxDrawdown252d) && m.maxDrawdown252d > -0.25 && !beachten.length) {
      /* Auch ein ruhiger Titel bekommt seine Zahl - nur eben eine
         unaufgeregte. Eine leere Spalte waere keine Waage. */
      beachten.push({ id: "schwankungRuhig", text: "Auch ruhige Aktien schwanken",
                      beleg: "Jahresschwankung " + prozent(m.volatility252d, false) });
    }

    return {
      engineVersion: ENGINE_VERSION,
      dafuer: dafuer.slice(0, 4),
      beachten: beachten.slice(0, 4),
      /* Der Satz steht so auf der Seite. Er ist kein Kleingedrucktes,
         sondern die Einordnung der ganzen Sektion. */
      hinweis: "Beide Seiten entstehen aus ausgelieferten Kennzahlen und festen Schwellen. " +
               "Das ist keine Anlageempfehlung und keine Prognose."
    };
  }

  /**
   * Was bedeutet das? - die Erklärung hinter einer Einordnung.
   *
   * Sie erscheint erst auf Tippen. Der Lernweg ist damit umgekehrt zum
   * üblichen: nicht erst lernen, dann das Produkt benutzen, sondern das
   * Produkt benutzen und dabei verstehen.
   */
  var ERKLAERUNGEN = {
    wachstum: "Wachstum heißt hier: Wie viel mehr Umsatz hat das Unternehmen in den " +
              "vergangenen zwölf Monaten gemacht als in den zwölf Monaten davor?",
    bewertung: "Das Kurs-Gewinn-Verhältnis sagt, das Wievielfache des Jahresgewinns eine " +
               "Aktie kostet. Ein hoher Wert bedeutet vereinfacht: Anleger zahlen heute viel " +
               "für Gewinne, die sie erst in Zukunft erwarten.",
    trend: "Der Trend beschreibt, in welche Richtung sich der Kurs über Monate bewegt hat — " +
           "nicht, wohin er als Nächstes geht.",
    risiko: "Risiko heißt hier: Wie stark schwankt der Kurs im Lauf eines Jahres? Größere " +
            "Schwankungen bedeuten größere Ausschläge nach oben und nach unten."
  };

  function erklaerung(id) { return ERKLAERUNGEN[id] || null; }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, SKALEN: SKALEN, ERKLAERUNGEN: ERKLAERUNGEN,
    ueberblick: ueberblick, waage: waage, erklaerung: erklaerung,
    stufeFuer: stufeFuer, trendStufe: trendStufe
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Einordnung = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
