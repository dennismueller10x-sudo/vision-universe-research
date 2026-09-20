/* =========================================================================
   VISION UNIVERSE — realtime/freshness.js

   DER FRESHNESS-VERTRAG: IST DAS, WAS DER CHART ZEIGT, DER STAND, DEN ER
   BEHAUPTET?

   Der Trading Session Resolver (trading-session.js) sagt, welche Sitzung
   ein Chart JETZT zeigen muesste. Diese Datei vergleicht das mit dem, was
   fuer einen Titel tatsaechlich vorliegt, und gibt jedem Kursverlauf
   einen von vier Zustaenden:

     LIVE          Boerse offen, die Reihe gehoert zur laufenden Sitzung
                   und ist juenger als die Karenz (refreshMinutes x 3).
     LAST_SESSION  Die Reihe ist die letzte abgeschlossene regulaere
                   Sitzung - oder, in der Karenz nach 09:30, die Sitzung
                   davor, solange die laufende noch keinen Stand hat.
     STALE         Die Reihe ist aelter als das, was jetzt gelten muesste:
                   eine Sitzung fehlt, ein Stand blieb stehen, ein Schluss
                   kam nicht. Wird NIE als aktuell beschriftet.
     UNAVAILABLE   Es gibt keine Reihe.

   Der Vorfall, der diesen Vertrag noetig gemacht hat (15.09.2026): die
   Seite zeigte "Letzter Handelstag · Freitag", obwohl der Montag laengst
   gehandelt war. Die Beschriftung war formal richtig - Freitag WAR die
   Sitzung der Reihe -, aber sie behauptete, das sei der letzte
   Handelstag. Dieser Vertrag trennt die beiden Fragen: "Welche Sitzung
   ist das?" und "Ist das die Sitzung, die jetzt gelten muesste?".

   Eine Karenz gibt es, weil Snapshots auf GitHub Pages im Takt eines
   Workflows entstehen (refreshMinutes): in den ersten Minuten nach 09:30
   gibt es die laufende Sitzung noch nicht, und nach 16:00 kommt der
   Schluss erst mit dem naechsten Lauf. Innerhalb der Karenz ist der
   Vortag bzw. der letzte Stand LAST_SESSION; danach ist er STALE.

   Fuer Tagesreihen (Schlusskurse) gilt dasselbe mit einer laengeren
   Karenz (graceHours): der Tagesschluss wird abends einmal geholt.

   Dasselbe Modul laeuft in Node (Ingest, Health-Check, Tests) und im
   Browser (Live-Hub, Karten, Aktienseite): eine Antwort fuer beide.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var TS = isNode ? require("./trading-session.js")
                  : (global.VURealtime && global.VURealtime.TradingSession);

  var CONTRACT_VERSION = "freshness-contract-1.0.0";
  var STATES = ["LIVE", "LAST_SESSION", "STALE", "UNAVAILABLE"];
  var DEFAULTS = {
    refreshMinutes: 10,
    /* Intraday: wie lange darf die laufende Sitzung ohne Stand sein, wie
       alt darf ein Stand bei offener Boerse sein, wie lange darf der
       Schluss nach 16:00 fehlen - drei Laeufe des Workflows. */
    graceMinutes: 30,
    /* Tagesreihen: der Tagesschluss kommt mit dem Abendlauf (22:30 UTC),
       dazu Build und Auslieferung. Sechs Stunden nach Schluss muss er da
       sein. */
    graceHours: 6
  };
  var DAY_MS = 86400000;
  var MARKT_WORT = { PRE_MARKET: "Vorbörse", OPEN: "Geöffnet", AFTER_HOURS: "Nachbörse", CLOSED: "Geschlossen", HOLIDAY: "Feiertag" };
  var WOCHENTAGE_KURZ = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function ms(v) { return v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v); }
  function dayMs(iso) {
    return Date.UTC(parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10) - 1, parseInt(iso.slice(8, 10), 10));
  }
  function weekdayOf(iso) { return new Date(dayMs(iso)).getUTCDay(); }
  function datumKurz(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "."; }
  function isoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null; }

  function options(opts) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = DEFAULTS[k]; });
    if (opts) Object.keys(opts).forEach(function (k) { if (opts[k] !== undefined && opts[k] !== null) o[k] = opts[k]; });
    if (!isNum(o.graceMinutes)) o.graceMinutes = Math.max(DEFAULTS.graceMinutes, 3 * (o.refreshMinutes || 10));
    return o;
  }

  /* Wie viele Handelstage liegt `date` hinter `expected`? 0 = dieselbe
     Sitzung, 1 = eine Sitzung fehlt, ... (hoechstens 40, dann 40). */
  function lagSessions(date, expected, calendar) {
    if (!date || !expected || date >= expected) return 0;
    var d = date, n = 0;
    while (d < expected && n < 40) {
      d = TS.nextTradingDay(d, { calendar: calendar });
      if (!d) return 40;
      n++;
    }
    return n;
  }

  /* Der Tag als Wort: "Heute", "Montag" (bis sechs Tage), "Fr., 11.09."
     (aelter, oder wenn die Reihe nicht die gueltige Sitzung ist). */
  function tagWort(sessionDate, localDate, mitDatum) {
    var abstand = Math.round((dayMs(localDate) - dayMs(sessionDate)) / DAY_MS);
    if (abstand === 0) return "Heute";
    if (!mitDatum && abstand >= 1 && abstand <= 6) return TS.WOCHENTAGE[weekdayOf(sessionDate)];
    return WOCHENTAGE_KURZ[weekdayOf(sessionDate)] + ", " + datumKurz(sessionDate);
  }

  /**
   * Der Befund fuer eine Reihe.
   *
   * @param {object} input
   *   resolution   Ergebnis von TradingSession.resolve(now, {calendar})
   *   series       Intraday-Snapshot ({sessionDate, asOf, asOfLocal,
   *                regularComplete, closeLocal, ...}) oder Tagesreihe
   *                ({lastDate|asOf|to, ...}) oder null
   *   kind         "intraday" (Standard) | "daily"
   *   now          Zeitpunkt (Standard: resolution.now)
   *   calendar     Marktkalender (fuer die Sitzungszaehlung)
   *   options      {refreshMinutes, graceMinutes, graceHours}
   *   identity     {securityId, symbol, source, interval} (optional; sonst
   *                aus der Reihe)
   * @returns {object} Vertrag (siehe Kopf), immer mit freshnessState und
   *   label {label, tone, sessionDate}.
   */
  function assess(input) {
    input = input || {};
    var r = input.resolution;
    var kind = input.kind === "daily" ? "daily" : "intraday";
    var opt = options(input.options);
    var now = input.now !== undefined ? ms(input.now) : (r && r.now ? ms(r.now) : Date.now());
    var s = input.series || null;
    var id = input.identity || {};
    var seriesDate = s ? isoDate(kind === "daily" ? (s.lastDate || s.to || s.asOf) : s.sessionDate) : null;
    var out = {
      contractVersion: CONTRACT_VERSION, kind: kind,
      securityId: id.securityId || (s && s.securityId) || null,
      symbol: id.symbol || (s && (s.symbol || s.ticker)) || null,
      source: id.source || (s && (s.provider ? s.provider + (s.venue ? "/" + s.venue : "") : s.source)) || null,
      interval: id.interval || (s && (s.interval || s.grain)) || (kind === "daily" ? "1day" : null),
      sessionDate: seriesDate,
      asOf: s ? (kind === "daily" ? (s.asOf || seriesDate) : (s.asOf || null)) : null,
      lastBarTimestamp: s ? (s.lastBarTimestamp || (kind === "intraday" ? s.asOf || null : (seriesDate ? seriesDate + "T" + "16:00" : null))) : null,
      marketSessionState: r ? r.marketState : null,
      expectedSessionDate: null, lagSessions: null,
      withinGrace: false, partial: false,
      freshnessState: "UNAVAILABLE", reason: null,
      checkedAt: new Date(now).toISOString()
    };

    if (!r || !r.displaySession || !r.lastCompletedSession) {
      out.reason = s ? "noSessionResolution" : "noSeries";
      out.label = beschriften(out, r, s, opt);
      return out;
    }
    var current = r.currentSession, last = r.lastCompletedSession;
    var open = r.marketState === "OPEN";
    var expected = kind === "daily" ? last : (open ? current : last);
    out.expectedSessionDate = expected.sessionDate;

    if (!s || !seriesDate) {
      out.reason = "noSeries";
      out.label = beschriften(out, r, s, opt);
      return out;
    }
    out.lagSessions = lagSessions(seriesDate, expected.sessionDate, input.calendar);

    if (seriesDate > expected.sessionDate) {
      /* Eine Reihe aus der Zukunft gibt es nicht - ausser die Uhr des
         Betrachters geht nach. Nichts erfinden: als aktuell werten, aber
         benennen. */
      out.freshnessState = kind === "intraday" && open ? "LIVE" : "LAST_SESSION";
      out.reason = "aheadOfClock";
    } else if (kind === "intraday") {
      intraday(out, r, s, seriesDate, expected, current, last, open, now, opt);
    } else {
      daily(out, s, seriesDate, expected, now, opt);
    }
    out.label = beschriften(out, r, s, opt);
    return out;
  }

  function intraday(out, r, s, seriesDate, expected, current, last, open, now, opt) {
    var graceMs = opt.graceMinutes * 60000;
    var complete = !!s.regularComplete;
    if (open) {
      if (seriesDate === current.sessionDate) {
        var alter = out.asOf ? now - ms(out.asOf) : Infinity;
        /* Ein Stand der laufenden Sitzung ist live, solange er nicht
           aelter ist als die Karenz; sonst ist der Workflow stehen
           geblieben, und "Heute · Stand 11:00" um 14:00 waere eine
           falsche Auskunft. */
        if (alter <= graceMs + opt.refreshMinutes * 60000) { out.freshnessState = "LIVE"; out.reason = "runningSession"; }
        else { out.freshnessState = "STALE"; out.reason = "runningSessionStaleAsOf"; out.partial = true; }
        return;
      }
      if (seriesDate === last.sessionDate) {
        /* Die Boerse hat gerade geoeffnet, der erste Stand fehlt noch. */
        out.withinGrace = (now - ms(current.open)) <= graceMs;
        out.freshnessState = out.withinGrace ? "LAST_SESSION" : "STALE";
        out.reason = out.withinGrace ? "previousSessionWithinOpenGrace" : "currentSessionMissing";
        return;
      }
      out.freshnessState = "STALE"; out.reason = "olderThanLastSession";
      return;
    }
    /* Boerse nicht offen: es gilt die letzte abgeschlossene Sitzung. */
    if (seriesDate === expected.sessionDate) {
      if (complete) { out.freshnessState = "LAST_SESSION"; out.reason = "lastCompletedSession"; return; }
      out.partial = true;
      out.withinGrace = (now - ms(expected.close)) <= graceMs;
      out.freshnessState = out.withinGrace ? "LAST_SESSION" : "STALE";
      out.reason = out.withinGrace ? "closePendingWithinGrace" : "closeMissing";
      return;
    }
    out.freshnessState = "STALE";
    out.reason = out.lagSessions === 1 ? "lastSessionMissing" : "olderThanLastSession";
  }

  function daily(out, s, seriesDate, expected, now, opt) {
    if (seriesDate === expected.sessionDate) { out.freshnessState = "LAST_SESSION"; out.reason = "lastCompletedSession"; return; }
    if (out.lagSessions === 1) {
      out.withinGrace = (now - ms(expected.close)) <= opt.graceHours * 3600000;
      out.freshnessState = out.withinGrace ? "LAST_SESSION" : "STALE";
      out.reason = out.withinGrace ? "closePendingWithinGrace" : "lastSessionMissing";
      if (out.withinGrace) out.partial = true;
      return;
    }
    out.freshnessState = "STALE"; out.reason = "olderThanLastSession";
  }

  /* ---------------------------------------------------------- Sprache */

  /**
   * Die Beschriftung - in der Sprache der Seite, ohne Anbieternamen.
   *
   *   LIVE          "Heute · Stand 15:42"
   *   LAST_SESSION  "Heute · Schluss 16:00"            (heutige Sitzung, fertig)
   *                 "Heute · Stand 15:55 · Schluss folgt" (Karenz nach Schluss)
   *                 "Letzter Handelstag · Montag"       (fruehere Sitzung, bis 6 Tage)
   *                 "Letzter Handelstag · 04.09."       (aelter)
   *                 "Letzter Handelstag · Montag · heutige Kurse folgen" (Karenz nach 09:30)
   *                 daily: "Schluss Montag" / "Schluss Fr., 11.09. · Montag folgt"
   *   STALE         "Stand Fr., 11.09. · nicht aktuell" (nie "Letzter Handelstag")
   *                 "Heute · Stand 11:00 · nicht aktuell"
   *   UNAVAILABLE   "Kein Tagesverlauf" / "Kein Schlusskurs"
   *
   * tone: live | complete | pending | stale | none
   */
  function beschriften(out, r, s, opt) {
    var state = out.freshnessState, kind = out.kind;
    var sd = out.sessionDate, heute = r && r.localDate && sd === r.localDate;
    var stand = s && s.asOfLocal ? String(s.asOfLocal).slice(0, 5) : null;
    var schluss = (s && s.closeLocal) || (r && r.displaySession && r.displaySession.sessionDate === sd && r.displaySession.closeLocal) || "16:00";
    var verkuerzt = s && s.earlyClose ? " (verkürzt)" : "";
    var label, tone;
    if (state === "UNAVAILABLE" || !sd) {
      label = kind === "daily" ? "Kein Schlusskurs" : "Kein Tagesverlauf"; tone = "none";
    } else if (state === "STALE") {
      tone = "stale";
      if (kind === "daily") label = "Schluss " + tagWort(sd, r.localDate, true) + " · nicht aktuell";
      else if (heute) label = "Heute · Stand " + (stand || "?") + " · nicht aktuell";
      else label = "Stand " + tagWort(sd, r.localDate, true) + " · nicht aktuell";
    } else if (state === "LIVE") {
      tone = "live";
      /* ZWEI ARTEN VON "LIVE", UND SIE HEISSEN VERSCHIEDEN

         Der Snapshot-Pfad liefert eine Reihe, die im Sitzungstakt
         nachgezogen wird: aktuell, aber nicht fortlaufend. Sie sagt
         "Heute · Stand 13:20" und nennt damit die Uhrzeit, auf die sie
         sich berufen kann.

         Ein fortlaufender Strom ist etwas anderes. isLive === true setzt
         nur, wer wirklich einen hat - der Ingest schreibt in jeden
         Snapshot isLive: false. Dann, und nur dann, steht hier das Wort,
         das der Nutzer als Zusage liest.

         Owner-Vorgabe vom 17.09.2026: "Die UI darf nur dann anzeigen
         'Markt geoeffnet · Live', wenn tatsaechlich ein frischer
         Realtime-State vorliegt." Die Bedingung dafuer steht in dieser
         Zeile und nirgends sonst. */
      label = (s && s.isLive === true)
        ? "Markt geöffnet · Live"
        : "Heute · Stand " + (stand || r.localTime.slice(0, 5));
    } else if (kind === "daily") {
      tone = out.partial ? "pending" : "complete";
      var naechster = out.expectedSessionDate ? TS.WOCHENTAGE[weekdayOf(out.expectedSessionDate)] : null;
      label = "Schluss " + tagWort(sd, r.localDate, out.partial) +
              (out.partial && naechster ? " · " + naechster + " folgt" : "");
    } else if (heute) {
      tone = out.partial ? "pending" : "complete";
      label = out.partial ? "Heute · Stand " + (stand || "?") + " · Schluss folgt"
                          : "Heute · Schluss " + schluss + verkuerzt;
    } else {
      tone = out.withinGrace ? "pending" : "complete";
      label = "Letzter Handelstag · " + tagWort(sd, r.localDate, false) +
              (out.withinGrace ? " · heutige Kurse folgen" : "");
    }
    return { label: label, tone: tone, sessionDate: sd, state: state,
             marketState: r ? r.marketState : null,
             marketStateWord: r ? (MARKT_WORT[r.marketState] || "Geschlossen") : null,
             isToday: !!heute, timezoneNote: "Uhrzeiten in New Yorker Zeit" };
  }

  /** Zaehlung ueber viele Befunde - fuer Health-Checks und Verzeichnisse. */
  function summarize(befunde) {
    var out = { total: 0, byState: {}, byReason: {}, stale: [] };
    STATES.forEach(function (s) { out.byState[s] = 0; });
    (befunde || []).forEach(function (b) {
      out.total++;
      out.byState[b.freshnessState] = (out.byState[b.freshnessState] || 0) + 1;
      if (b.reason) out.byReason[b.reason] = (out.byReason[b.reason] || 0) + 1;
      if (b.freshnessState === "STALE") out.stale.push(b.symbol || b.securityId || "?");
    });
    return out;
  }

  var api = { CONTRACT_VERSION: CONTRACT_VERSION, STATES: STATES, DEFAULTS: DEFAULTS,
              assess: assess, summarize: summarize, lagSessions: lagSessions };
  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.Freshness = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
