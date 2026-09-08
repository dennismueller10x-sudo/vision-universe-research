/* =========================================================================
   VISION UNIVERSE — realtime/technical-bridge.js

   Die Grenze zwischen Live-Chart und technischer Analyse.

   Zwei Frequenzebenen, und sie duerfen sich nicht vermischen:

     LIVE-CHART            Ticks, laufende Kerzen, erweiterte Handelszeiten.
                           Darf sich bewegen, darf vorlaeufig sein.
     TECHNICAL INTELLIGENCE  Pivots, Elliott, Zonen, Backtests.
                           Rechnet auf einer kanonischen Serie und darf
                           sich nicht ruecklaufend aendern.

   WARUM DAS EINE EIGENE DATEI IST

   Die Trennung existiert bereits - technical-v1.json schreibt
   `includeExtended: false` fest, und timeframe.js verwirft erweiterte
   Bars entsprechend. Das ist die richtige Stelle, und sie bleibt.

   Was fehlte, war die Gegenrichtung: eine Stelle, an der ausdruecklich
   steht, WAS aus dem Live-Feed ueberhaupt hinueberdarf. Ein Vorgabewert
   in einer Methodikdatei ist eine Einstellung; wer sie ueberschreibt,
   merkt nicht unbedingt, was er anrichtet. Diese Datei macht daraus eine
   Entscheidung mit Namen und einen Test, der anschlaegt.

   DIE DREI REGELN

     T1  Nur bestaetigte Bars. Eine laufende Kerze ist eine Momentaufnahme;
         ein Indikator darauf erzeugt Signale, die wieder verschwinden.
     T2  Nur regulaere Sitzung. Vor- und Nachboerse sind duenn gehandelt,
         und ihre Extrema sind keine Pivots im selben Sinn. Ein
         Support-Level aus einem Nachboersen-Ausschlag von 200 Stueck
         waere eine Linie, die niemand verteidigt hat.
     T3  Keine stille Aenderung. Was hinueberdarf, wird gezaehlt und
         benannt - eine Bruecke, die still filtert, ist eine Bruecke, die
         irgendwann still etwas durchlaesst.

   Zu T2 ausdruecklich: das ist eine Vorgabe, keine Naturkonstante. Wer
   erweiterte Zeiten in eine technische Serie aufnehmen will, kann das -
   mit `includeExtended: true` und der Pflicht, die Methodikversion zu
   erhoehen. Was nicht geht, ist, dass es aus Versehen passiert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var SessionPolicy = isNode ? require("./session-policy.js") : global.VURealtime.SessionPolicy;

  var BRIDGE_VERSION = "technical-bridge-1.0.0";

  /* Der Vorgabevertrag. Er spiegelt XNYS-regular-v1 aus
     technical-v1.json - dieselbe Aussage, an der Stelle, an der die
     Live-Daten sie passieren. */
  var DEFAULT_CONTRACT = {
    contractId: "realtime-to-technical-v1",
    sessionPolicyId: "XNYS-regular-v1",
    includeExtended: false,
    includeDeveloping: false,
    requireAdjustmentStatus: null,   // null = beliebig, aber einheitlich
    note: "Entspricht der Sitzungsrichtlinie der Technical Intelligence. Eine " +
          "Abweichung ist eine Methodikaenderung und verlangt eine neue Version."
  };

  /**
   * Filtert Live-Bars auf das, was die technische Analyse konsumieren darf.
   *
   * @param {Array} bars     Bars aus bar-merge.js
   * @param {object} contract Abweichung vom Vorgabevertrag
   * @returns {object} {bars, rejected, counts, contract, version}
   */
  function forTechnical(bars, contract) {
    var c = merge(DEFAULT_CONTRACT, contract);
    var out = [];
    var counts = {
      total: (bars || []).length,
      accepted: 0,
      droppedDeveloping: 0,
      droppedExtended: 0,
      droppedAdjustmentMismatch: 0,
      droppedMalformed: 0
    };

    (bars || []).forEach(function (b) {
      if (!b || typeof b.close !== "number" || !isFinite(b.close)) {
        counts.droppedMalformed++;
        return;
      }
      /* T1 */
      if (!c.includeDeveloping && b.confirmed !== true) {
        counts.droppedDeveloping++;
        return;
      }
      /* T2 */
      if (!c.includeExtended && isExtendedBar(b)) {
        counts.droppedExtended++;
        return;
      }
      if (c.requireAdjustmentStatus !== null &&
          b.adjustmentStatus !== c.requireAdjustmentStatus) {
        counts.droppedAdjustmentMismatch++;
        return;
      }
      counts.accepted++;
      out.push(b);
    });

    return {
      version: BRIDGE_VERSION,
      contract: c,
      bars: out,
      counts: counts,
      /* T3 - der Bericht ist Teil des Ergebnisses, nicht ein Nebenprodukt.
         Wer die Bruecke benutzt, bekommt ungefragt mitgeteilt, was sie
         zurueckgehalten hat. */
      summary: counts.accepted + " von " + counts.total + " Bars weitergereicht" +
               (counts.droppedExtended ? ", " + counts.droppedExtended + " erweiterte" : "") +
               (counts.droppedDeveloping ? ", " + counts.droppedDeveloping + " laufende" : "") +
               " zurueckgehalten."
    };
  }

  /* Eine Bar gilt als erweitert, wenn eines der beiden Felder es sagt.
     `isExtendedHours` kommt aus bar-merge.js, `sessionType` aus dem
     kanonischen Technical-Modell - beide werden gelesen, damit auch eine
     Bar aus einer aelteren Quelle richtig einsortiert wird. */
  function isExtendedBar(b) {
    if (b.isExtendedHours === true) return true;
    if (b.sessionType === "EXTENDED") return true;
    if (b.session && SessionPolicy.isExtended(b.session)) return true;
    return false;
  }

  /**
   * Die Gegenprobe fuer Tests und Diagnose: enthaelt diese Serie etwas,
   * das die technische Analyse nicht sehen darf?
   */
  function audit(bars, contract) {
    var c = merge(DEFAULT_CONTRACT, contract);
    var verstoesse = [];
    (bars || []).forEach(function (b, i) {
      if (!c.includeExtended && isExtendedBar(b)) {
        verstoesse.push({ index: i, bucket: b.bucket || null, reason: "extendedHours",
                          session: b.session || b.sessionType || null });
      }
      if (!c.includeDeveloping && b && b.confirmed !== true) {
        verstoesse.push({ index: i, bucket: b.bucket || null, reason: "developing" });
      }
    });
    return { clean: verstoesse.length === 0, violations: verstoesse, contract: c };
  }

  /**
   * Was der Live-Feed der technischen Analyse ueber seinen Zustand sagt.
   * Bewusst getrennt von den Bars: die technische Analyse soll wissen,
   * dass gerade erweiterte Daten hereinkommen - und sie trotzdem nicht
   * bekommen.
   */
  function context(feedStatus, session) {
    return {
      version: BRIDGE_VERSION,
      liveSession: session ? (session.session || null) : null,
      liveIsExtended: session ? !!session.isExtended : null,
      liveDataClass: feedStatus ? feedStatus.dataClass : null,
      liveStatusCode: feedStatus ? feedStatus.code : null,
      /* Die Kernaussage in einem Feld: aendert der Live-Betrieb gerade
         irgendetwas an der technischen Serie? Die Antwort ist nein, und
         sie soll ablesbar sein, ohne den Filter nachzulesen. */
      affectsTechnicalSeries: false,
      reason: "Der Live-Feed speist die technische Serie nicht. Sie entsteht aus " +
              "bestaetigten Bars der regulaeren Sitzung (" +
              DEFAULT_CONTRACT.sessionPolicyId + ")."
    };
  }

  function merge(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    if (b) Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  var api = {
    BRIDGE_VERSION: BRIDGE_VERSION,
    DEFAULT_CONTRACT: DEFAULT_CONTRACT,
    forTechnical: forTechnical,
    isExtendedBar: isExtendedBar,
    audit: audit,
    context: context
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.TechnicalBridge = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
