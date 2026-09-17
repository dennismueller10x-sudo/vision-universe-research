/* =========================================================================
   VISION UNIVERSE DISCOVER — relevance.js

   DIE DISCOVERY-REIHENFOLGE

   Eine Rangliste sagt, wer am stärksten ist. Eine Discovery-Reihe muss
   etwas anderes leisten: die erste sichtbare Karte soll jemanden zum
   Weiterwischen bringen. Das ist nicht dasselbe. Auf Platz eins einer
   Momentum-Rangliste steht heute ein Royalty Trust, den kein
   Privatanleger kennt; auf Platz sieben steht Micron. Für die Rangliste
   ist das richtig. Für den ersten Blick auf eine Reihe ist es verschenkt.

   DIE REGEL, UND WAS SIE NICHT DARF

   Dieses Modul sortiert AUSSCHLIESSLICH innerhalb einer bereits
   qualifizierten Liste um. Es nimmt keinen Titel auf und lässt keinen
   fallen: die Menge, die hineingeht, ist die Menge, die herauskommt.
   Die Aufnahmeregel jeder Reihe (ROW_FILTERS im Build) bleibt die einzige
   Instanz, die über Zugehörigkeit entscheidet.

   Und es hebt nur, was ohnehin weit vorn steht. Ein bekannter Name aus
   der unteren Hälfte einer Rangliste wird nicht nach vorn geholt - sonst
   hiesse eine Reihe "die stärksten Aktien" und zeigte einen Titel, der
   es nicht ist. Der Bonus wirkt im oberen Fenster (Standard: obere
   Hälfte), und er ist klein genug, dass die Reihenfolge der Kennzahlen
   im Groben erhalten bleibt.

   WAS DER SCORE IST - UND WAS NICHT

   Der Discovery-Score ist eine Sortierhilfe. Er wird nirgends angezeigt,
   er ist keine Finanzkennzahl, und er sagt nichts über eine Aktie aus.
   Die Zahlen auf der Karte stammen unverändert aus den Faktoren.

   Nummerierte Ranglisten (TOP 10) laufen NICHT durch dieses Modul: dort
   steht die echte Rangziffer, und die darf nur die Kennzahl vergeben.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-relevance-1.0.0";

  /* Der Bonus je Bekanntheitsstufe, in Einheiten der normierten
     Rangposition (1 = erster Platz, 0 = letzter). 0.18 heisst: eine
     Alltagsmarke darf an Titeln vorbeiziehen, die bis zu 18 % der Liste
     vor ihr liegen - im oberen Fenster, nie darüber hinaus. */
  var DEFAULTS = {
    bonus: { 1: 0.18, 2: 0.10 },
    window: 0.5,          // nur die obere Haelfte der Liste wird gehoben
    minListe: 4           // kuerzere Listen bleiben, wie sie sind
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Ordnet eine qualifizierte Liste für die Anzeige.
   *
   * @param {Array}  cards        Karten in Rangfolge der Kennzahl (Build)
   * @param {object} [opt]
   *        {object} recognition  { SYMBOL: { tier: 1|2 } }
   *        {object} bonus        { 1: n, 2: n }
   *        {number} window       Anteil der Liste (von oben), der gehoben wird
   * @returns {{ cards: Array, trace: Array }}  dieselben Karten, neue Reihenfolge
   */
  function discoveryOrder(cards, opt) {
    opt = opt || {};
    var bonus = opt.bonus || DEFAULTS.bonus;
    var fenster = isNum(opt.window) ? opt.window : DEFAULTS.window;
    var rec = opt.recognition || {};
    var n = cards.length;
    if (n < DEFAULTS.minListe) {
      return { cards: cards.slice(), trace: cards.map(function (c, i) {
        return { symbol: c.symbol, quantRank: i + 1, discoveryRank: i + 1, tier: null, bonus: 0 };
      }) };
    }
    var bewertet = cards.map(function (c, i) {
      var position = 1 - i / (n - 1);              // 1 = ganz vorn
      var eintrag = rec[c.symbol];
      var stufe = eintrag && isNum(eintrag.tier) ? eintrag.tier : null;
      var zuschlag = (stufe && position >= 1 - fenster && isNum(bonus[stufe])) ? bonus[stufe] : 0;
      return { card: c, index: i, tier: stufe, bonus: zuschlag, score: position + zuschlag };
    });
    /* Stabil: bei gleichem Score entscheidet die Rangliste. */
    bewertet.sort(function (a, b) { return (b.score - a.score) || (a.index - b.index); });
    return {
      cards: bewertet.map(function (b) { return b.card; }),
      trace: bewertet.map(function (b, i) {
        return { symbol: b.card.symbol, quantRank: b.index + 1, discoveryRank: i + 1,
                 tier: b.tier, bonus: b.bonus };
      })
    };
  }

  /**
   * Cross-Collection-Diversity über eine Folge von Surfaces.
   *
   * Eine Startseite, auf der derselbe Titel in fünf Reihen unter den
   * ersten zwei Karten steht, wirkt wie ein kleines Universum. Die Regel:
   *
   *   - Ein Titel steht auf höchstens EINER Surface unter den ersten
   *     `leadPositions` Karten (Ausnahme: aussergewöhnliche Titel ab
   *     `exceptionalPercentile`, die dürfen zweimal führen - ein Marktführer,
   *     der zugleich ein Jahreshoch macht, IST die Aussage).
   *   - Ein Titel erscheint auf der ganzen Seite höchstens `maxAppearances`
   *     Mal unter den gezeigten Karten.
   *   - Kurze Listen (≤ `shortList`) werden nicht gekürzt: eine Reihe
   *     mit vier Treffern zeigt ihre vier Treffer.
   *   - Surfaces mit `pure: true` (nummerierte Ranglisten) werden nie
   *     verändert, zählen aber als Auftritte.
   *
   * Entfernt wird nur, umsortiert wird nie. Was bleibt, bleibt in seiner
   * Reihenfolge.
   *
   * @param {Array} surfaces  [{ id, cards, pure?, show }]  show = wie viele gezeigt werden
   * @returns {Array}         Kopien mit `cards` = gezeigte Karten, `hidden` = Zahl der Entfernten
   */
  function diversify(surfaces, opt) {
    opt = opt || {};
    var leadPositions = isNum(opt.leadPositions) ? opt.leadPositions : 2;
    var maxAppearances = isNum(opt.maxAppearances) ? opt.maxAppearances : 2;
    var shortList = isNum(opt.shortList) ? opt.shortList : 6;
    var exceptional = isNum(opt.exceptionalPercentile) ? opt.exceptionalPercentile : 99;

    var auftritte = Object.create(null);
    var fuehrt = Object.create(null);

    return surfaces.map(function (s) {
      var alle = s.cards || [];
      var zeigen = isNum(s.show) ? s.show : alle.length;
      var raus = [], versteckt = 0;

      if (s.pure || alle.length <= shortList) {
        raus = alle.slice(0, zeigen);
      } else {
        for (var i = 0; i < alle.length && raus.length < zeigen; i++) {
          var c = alle[i];
          var n = auftritte[c.symbol] || 0;
          var ausnahme = c.metrics && isNum(c.metrics.leadershipPercentile) &&
                         c.metrics.leadershipPercentile >= exceptional;
          if (n >= maxAppearances) { versteckt++; continue; }
          var wuerdeFuehren = raus.length < leadPositions;
          var darfFuehren = !fuehrt[c.symbol] || (ausnahme && fuehrt[c.symbol] < 2);
          if (wuerdeFuehren && !darfFuehren) { versteckt++; continue; }
          raus.push(c);
        }
      }
      raus.forEach(function (c, i) {
        auftritte[c.symbol] = (auftritte[c.symbol] || 0) + 1;
        if (i < leadPositions) fuehrt[c.symbol] = (fuehrt[c.symbol] || 0) + 1;
      });
      var kopie = {};
      Object.keys(s).forEach(function (k) { kopie[k] = s[k]; });
      kopie.cards = raus;
      kopie.hidden = versteckt;
      return kopie;
    });
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS,
              discoveryOrder: discoveryOrder, diversify: diversify };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Relevance = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
