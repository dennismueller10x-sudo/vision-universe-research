/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/story-selection.js

   EVIDENCE IST NICHT COPY

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   cand_20260918_ca4ea408 war faktisch einwandfrei und trotzdem kein
   guter Beitrag. Die Caption nannte alle sechs Score-Beitraege, drei
   Renditehorizonte, ATR samt Perzentil, relatives Volumen und die
   Zahl der Handelstage. Jede Zahl belegt, keine erfunden — und
   zusammen ein Auszug aus dem Research-Report statt einer Geschichte.

   Der Fehler lag eine Stufe frueher, als es aussah. Die Pipeline kannte
   zwei Zustaende: "Beleg vorhanden" und "Beleg im Text". Dazwischen
   fehlte die Frage, die jede Redaktion zuerst stellt:

       WELCHE der belegten Zahlen erzaehlen zusammen etwas?

   -------------------------------------------------------------------------
   DIE DREI STUFEN
   -------------------------------------------------------------------------

     FULL EVIDENCE    alles, was gemessen und gebunden ist.  Bleibt
                      vollstaendig erhalten — fuer Fact Check,
                      Provenance und jede spaetere Pruefung.

     STORY SELECTION  die wenigen Belege, die zusammen einen
                      SPANNUNGSBOGEN tragen.  Diese Datei.

     PUBLIC COPY      der Text, der erscheint.  Nutzt die Auswahl,
                      nicht den Bestand.

   Nicht verwendete Evidenz ist nicht verlorene Evidenz. Sie wandert
   nach `unused` und bleibt gebunden. Der Fact Check prueft weiter gegen
   ALLES; die Copy zieht nur aus der Auswahl.

   -------------------------------------------------------------------------
   DER SPANNUNGSBOGEN WIRD GEFUNDEN, NICHT ERFUNDEN
   -------------------------------------------------------------------------

   Ein Spannungsbogen braucht zwei Belege, die sich WIDERSPRECHEN,
   ohne sich zu widersprechen: eine Staerke und eine Bremse, beide
   gemessen.

   Die Schwierigkeit ist, das ohne ausgedachte Schwelle zu tun. Ab wann
   ist ein Unterschied "interessant"? Jede Konstante hier waere geraten.

   Die Daten beantworten es selbst. Ein Score aus Teilbeitraegen hat
   einen eigenen Massstab: den Score. Liegt ein Beitrag ueber der
   Gesamtausschoepfung, zieht er nach oben; liegt er darunter, bremst
   er. Die Schwelle ist also der Wert selbst, und es gibt nichts zu
   raten.

       XOM: Score 76 von 100 — Ausschoepfung 76 %.
       darueber:   TREND_STRUCTURE 91 %, PROJECTION 88 %, MOMENTUM 78 %
       darunter:   SETUP 67 %, VOLUME 59 %, VOLATILITY 50 %

   Daraus folgt die Frage, die der Beitrag stellen kann: warum trotz
   dieser Trendstaerke nur 76? Antwort, belegt: weil Volatilitaet und
   Volumen nur die Haelfte beitragen.

   Ohne Straddle gibt es keinen Bogen. Dann sagt diese Datei das — statt
   einen zu behaupten.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei." — der Anteil
     steht in der Aussage, weil er dort schon einmal formuliert wurde.
     Ihn hier neu zu erfinden hiesse, zwei Wahrheiten zu haben. */
  var ANTEIL = /(-?\d+(?:[.,]\d+)?)\s*von\s*(\d+(?:[.,]\d+)?)/i;

  function zahl(x) {
    var n = parseFloat(String(x).replace(",", "."));
    return isFinite(n) ? n : null;
  }

  /** Der Anteil eines Belegs an seinem eigenen Maximum, oder null. */
  function ausschoepfung(beleg) {
    if (!beleg) return null;
    var treffer = ANTEIL.exec(String(beleg.statement || ""));
    if (!treffer) return null;
    var ist = zahl(treffer[1]), max = zahl(treffer[2]);
    if (ist === null || max === null || max <= 0) return null;
    return { share: ist / max, value: ist, max: max };
  }

  /** Der Name hinter einem Beitrags-Beleg: "score-contribution-volume" -> VOLUME. */
  function komponente(beleg) {
    var id = String((beleg && beleg.id) || "");
    var t = /^score-contribution-(.+)$/.exec(id);
    return t ? t[1].toUpperCase() : null;
  }

  /**
   * Die Geschichte aus dem Bestand.
   *
   * `evidence`   die vollstaendige, gebundene Evidenz.
   * `leadId`     der Beleg, der den Massstab setzt (der Score).
   *
   * Gibt IMMER alle Belege zurueck — aufgeteilt, nie reduziert.
   */
  function select(evidence, options) {
    options = options || {};
    var alle = Array.isArray(evidence) ? evidence.slice() : [];
    var leadId = options.leadId || "score";

    var lead = null;
    for (var i = 0; i < alle.length; i++) {
      if (alle[i] && alle[i].id === leadId) { lead = alle[i]; break; }
    }

    var leitAnteil = ausschoepfung(lead);

    /* Alle Belege, die eine eigene Ausschoepfung nennen und nicht der
       Leitbeleg selbst sind. */
    var teile = [];
    alle.forEach(function (e) {
      if (!e || e === lead) return;
      var a = ausschoepfung(e);
      if (!a) return;
      teile.push({ evidence: e, share: a.share, value: a.value, max: a.max,
        component: komponente(e) });
    });

    if (!lead || !leitAnteil || teile.length < 2) {
      return ohneBogen(alle, lead,
        !lead ? "Es gibt keinen Leitbeleg (" + leadId + ")."
          : !leitAnteil ? "Der Leitbeleg nennt kein eigenes Maximum, also " +
            "gibt es keinen Massstab, an dem sich Teile messen lassen."
          : "Weniger als zwei Teilbelege mit eigenem Maximum.");
    }

    var darueber = teile.filter(function (t) { return t.share > leitAnteil.share; });
    var darunter = teile.filter(function (t) { return t.share < leitAnteil.share; });

    if (!darueber.length || !darunter.length) {
      return ohneBogen(alle, lead,
        "Alle Teilbelege liegen auf derselben Seite des Leitwerts (" +
        darueber.length + " darueber, " + darunter.length + " darunter). " +
        "Ohne Straddle gibt es keine gemessene Spannung — und eine " +
        "behauptete waere eine erfundene.");
    }

    darueber.sort(function (a, b) { return b.share - a.share; });
    darunter.sort(function (a, b) { return a.share - b.share; });

    var staerke = darueber[0];
    var bremse = darunter[0];

    /* Die Stuetze: der Beleg, den ein Leser ohne Methodenkenntnis
       wiedererkennt. Nicht die groesste Zahl, sondern die mit dem
       laengsten Zeitraum unter den Renditen - sie ist die, die
       jemand "gespuert" haette. */
    var stuetze = laengsteRendite(alle);

    var benutzt = [lead, staerke.evidence, bremse.evidence];
    if (stuetze) benutzt.push(stuetze);

    /* Beleg-Ids, die eine Zahl im Text unmittelbar absichern muessen -
       etwa die Einordnung, WAS der Leitwert ueberhaupt ist. */
    (options.alwaysInclude || ["score-meaning"]).forEach(function (id) {
      alle.forEach(function (e) {
        if (e && e.id === id && benutzt.indexOf(e) === -1) benutzt.push(e);
      });
    });

    var ids = benutzt.map(function (e) { return e.id; });

    return {
      ok: true,
      hasTension: true,
      lead: lead,
      leadShare: leitAnteil.share,
      tension: {
        /* Die Frage, die der Beitrag beantworten kann - als FRAGE, nicht
           als fertige Zeile. Die Formulierung ist Sache des Autors; hier
           steht nur, worueber er schreiben kann. */
        question: "Warum trotz " + text(staerke) + " nur " +
          leitAnteil.value + " von " + leitAnteil.max + "?",
        strength: staerke,
        drag: bremse,
        spread: staerke.share - bremse.share,
        support: stuetze || null
      },
      selected: benutzt,
      selectedIds: ids,
      /* Nichts geht verloren. Der Fact Check prueft weiter gegen alles. */
      unused: alle.filter(function (e) { return ids.indexOf(e.id) === -1; }),
      full: alle,
      explanation: "Von " + alle.length + " Belegen tragen " + benutzt.length +
        " den Bogen: " + (staerke.component || staerke.evidence.id) + " bei " +
        prozent(staerke.share) + " gegen " +
        (bremse.component || bremse.evidence.id) + " bei " +
        prozent(bremse.share) + ", gemessen am Leitwert " +
        prozent(leitAnteil.share) + ". Die uebrigen " +
        (alle.length - benutzt.length) + " bleiben gebunden."
    };
  }

  function laengsteRendite(alle) {
    var beste = null, besteMonate = 0;
    alle.forEach(function (e) {
      var t = /^momentum-(\d+)m$/i.exec(String((e && e.id) || ""));
      if (!t) return;
      var m = parseInt(t[1], 10);
      if (m > besteMonate) { besteMonate = m; beste = e; }
    });
    return beste;
  }

  function text(t) {
    return (t.component ? t.component + " " : "") + prozent(t.share);
  }

  function prozent(x) { return Math.round(x * 100) + " %"; }

  function ohneBogen(alle, lead, grund) {
    return {
      ok: true,
      hasTension: false,
      lead: lead || null,
      leadShare: null,
      tension: null,
      /* Ohne Bogen wird NICHT ausgewaehlt. Eine willkuerliche Auswahl
         waere schlechter als der vollstaendige Bestand: sie liesse
         Belege weg, ohne dafuer eine Geschichte zu bekommen. */
      selected: alle,
      selectedIds: alle.map(function (e) { return e && e.id; }),
      unused: [],
      full: alle,
      explanation: "Kein gemessener Spannungsbogen: " + grund
    };
  }

  var api = {
    ausschoepfung: ausschoepfung,
    komponente: komponente,
    select: select
  };

  if (isNode) module.exports = api;
  else global.VUSocialStorySelection = api;
})(typeof window !== "undefined" ? window : globalThis);
