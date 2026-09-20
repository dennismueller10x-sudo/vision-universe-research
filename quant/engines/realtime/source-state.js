/* =========================================================================
   DER QUELLZUSTAND DER AKTIENSEITE - EINE WAHRHEIT, VIER WERTE

   Owner-Entscheidung vom 19.09.2026, nach dem Nebius-Befund: der sichtbare
   Status der Consumer Stock Page wird AUSSCHLIESSLICH hier abgeleitet.

   Vorher war er ueber fuenf Groessen verstreut - freshnessState, isLive,
   partial, streaming, regularComplete - und jede Oberflaeche setzte sie
   ein bisschen anders zusammen. Das Ergebnis war am 18.09. um 16:08 New
   York auf dem Telefon zu sehen: ein Chart, der um 15:50 endete, mit der
   Beschriftung "Heute - Stand 15:50 - Schluss folgt" und der Fussnote
   "5-Minuten-Kurse", obwohl die Sitzung acht Minuten vorher geschlossen
   hatte.

   DIE VIER ZUSTAENDE

     REALTIME       Die Boerse ist offen UND ein frischer Tick liegt vor.
                    Der Chart wird fortgeschrieben. Nur hier darf
                    "Markt geoeffnet - Live" stehen.

     SNAPSHOT       Die Boerse ist offen, es gibt keinen frischen Tick,
                    aber der Snapshot ist im Takt. Ehrlich: "Heute -
                    Stand HH:MM".

     FINAL_SESSION  Die Sitzung ist vorbei UND es kann nichts mehr
                    kommen (nach Schluss geholt). Der Verlauf steht
                    eingefroren. Ein Schluss wird nur behauptet, wenn die
                    Reihe ihn auch traegt.

     STALE          Alles andere: die laufende Sitzung mit einem stehen
                    gebliebenen Stand, eine geschlossene Sitzung ohne
                    Abschluss, eine aeltere Sitzung. Wird als solcher
                    gekennzeichnet - nie als final.

   WAS DIESE DATEI NICHT TUT

   Sie ersetzt den Freshness-Vertrag nicht. Der bleibt die Grundlage fuer
   Health-Checks und Tagesreihen. Sie ist die Schicht darueber, die fuer
   die Aktienseite EINE Antwort gibt - und die Quellenbezeichnung gleich
   mit, damit "5-Minuten-Kurse" nicht laenger behauptet wird, wenn der
   laufende Kurs den letzten Punkt gesetzt hat.
   ========================================================================= */
(function (global) {
  "use strict";

  var ZUSTAENDE = ["REALTIME", "SNAPSHOT", "FINAL_SESSION", "STALE"];

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function ms(x) { var t = Date.parse(x); return isFinite(t) ? t : null; }

  /* Die alten Snapshots kennen fetchedAfterClose noch nicht. Fuer sie
     gilt regularComplete als das, was es damals bedeutete: "nach
     Schluss geholt". */
  function nachSchlussGeholt(snap) {
    if (!snap) return false;
    if (snap.fetchedAfterClose !== undefined) return !!snap.fetchedAfterClose;
    return !!snap.regularComplete;
  }
  function traegtSchluss(snap) {
    if (!snap) return false;
    if (snap.coversFinalSlot !== undefined) return !!snap.coversFinalSlot;
    return !!snap.regularComplete;
  }

  /**
   * @param {object} eingabe
   *   resolution  Aufloesung der Handelszeiten (TradingSession.resolve)
   *   snapshot    Der ausgelieferte Tagesverlauf oder null
   *   live        {price, at, fresh} aus dem Strom oder null
   *   now         Date/ISO (Vorgabe: jetzt)
   *   options     {staleAfterMinutes}
   * @returns {{state, reason, label, tone, sourceText, sessionDate,
   *            asOfLocal, lastRegularLocal, coversSession, isFrozen}}
   */
  function bestimme(eingabe) {
    var e = eingabe || {};
    var r = e.resolution || null;
    var snap = e.snapshot || null;
    var live = e.live || null;
    var now = e.now ? (e.now instanceof Date ? e.now.getTime() : ms(e.now)) : Date.now();
    var opt = e.options || {};
    var stillstandMs = (isNum(opt.staleAfterMinutes) ? opt.staleAfterMinutes : 15) * 60000;

    var out = {
      state: "STALE", reason: "unknown", sessionDate: snap ? snap.sessionDate || null : null,
      asOfLocal: snap ? snap.asOfLocal || null : null,
      lastRegularLocal: snap ? (snap.lastRegularLocal || null) : null,
      coversSession: traegtSchluss(snap), isFrozen: false
    };

    if (!snap || !Array.isArray(snap.points) || !snap.points.length) {
      out.state = "STALE"; out.reason = "noSnapshot";
      out.label = "Kein Tagesverlauf"; out.tone = "none";
      out.sourceText = null;
      return out;
    }

    var offen = !!(r && r.marketState === "OPEN");
    var laufende = r && r.displaySession ? r.displaySession.sessionDate : null;
    var erwartet = r && r.lastCompletedSession ? r.lastCompletedSession.sessionDate : null;
    var schluss = snap.closeLocal || "16:00";
    var stand = out.asOfLocal ? String(out.asOfLocal).slice(0, 5) : null;

    /* ---- 1. Offene Boerse: traegt ein frischer Tick den letzten Punkt? */
    if (offen && snap.sessionDate === laufende) {
      if (live && live.fresh === true && isNum(live.price)) {
        out.state = "REALTIME"; out.reason = "freshTick";
        out.label = "Markt geöffnet · Live"; out.tone = "live";
        out.sourceText = "5-Minuten-Kurse, fortgeschrieben mit dem laufenden Kurs";
        return out;
      }
      var alter = snap.asOf ? now - ms(snap.asOf) : Infinity;
      if (alter <= stillstandMs) {
        out.state = "SNAPSHOT"; out.reason = "runningSession";
        out.label = "Heute · Stand " + (stand || "?"); out.tone = "pending";
        out.sourceText = "5-Minuten-Kurse";
        return out;
      }
      out.state = "STALE"; out.reason = "runningSessionStaleAsOf";
      out.label = "Heute · Stand " + (stand || "?") + " · nicht aktuell"; out.tone = "stale";
      out.sourceText = "5-Minuten-Kurse";
      return out;
    }

    /* ---- 2. Offene Boerse, aber der Verlauf ist von gestern */
    if (offen) {
      out.state = "STALE"; out.reason = "currentSessionMissing";
      out.label = "Letzter Handelstag · " + (snap.sessionDate || "?") + " · heutige Kurse fehlen";
      out.tone = "stale"; out.sourceText = "5-Minuten-Kurse";
      return out;
    }

    /* ---- 3. Geschlossene Boerse: nur was abgeschlossen ist, ist final */
    if (snap.sessionDate === erwartet) {
      if (!nachSchlussGeholt(snap)) {
        /* Owner-Regel 6: niemals einen unvollstaendigen Snapshot als
           final darstellen. Kein "Schluss folgt" mehr - das las sich wie
           eine Zusage und war eine Vertroestung. */
        out.state = "STALE"; out.reason = "closeMissing";
        out.label = "Heute · Stand " + (stand || "?") + " · Schluss fehlt noch"; out.tone = "stale";
        out.sourceText = "5-Minuten-Kurse";
        return out;
      }
      out.state = "FINAL_SESSION"; out.isFrozen = true;
      out.tone = "complete";
      out.sourceText = "5-Minuten-Kurse";
      if (traegtSchluss(snap)) {
        out.reason = "sessionComplete";
        out.label = "Heute · Schluss " + schluss + (snap.earlyClose ? " (verkürzt)" : "");
      } else {
        /* Ein illiquider Titel ohne Handel bis zur Glocke. Es kommt
           nichts mehr - aber ein Schluss um 16:00 waere erfunden. */
        out.reason = "sessionCompleteNoLateTrades";
        out.label = "Heute · Schluss · letzter Kurs " + (out.lastRegularLocal || stand || "?");
      }
      return out;
    }

    /* ---- 4. Eine aeltere Sitzung */
    out.state = "STALE"; out.reason = "olderThanLastSession";
    out.label = "Stand " + (snap.sessionDate || "?") + " · nicht aktuell"; out.tone = "stale";
    out.sourceText = "5-Minuten-Kurse";
    return out;
  }

  var API = { ZUSTAENDE: ZUSTAENDE, bestimme: bestimme };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) { global.VURealtime = global.VURealtime || {}; global.VURealtime.SourceState = API; }
})(typeof globalThis !== "undefined" ? globalThis : this);
