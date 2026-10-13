/* =========================================================================
   VISION UNIVERSE DISCOVER — refresh-plan.js  (refresh-plan-1.0.0)

   WANN WIRD "IM BLICK" WÄHREND DER SITZUNG NEU GERECHNET?

   Ungefähr alle zwei Stunden, nicht minutengenau. Ein Termin ("Slot") ist
   eine Fälligkeit, kein Auslöser: wer auch immer den Lauf anstößt (der
   externe Wecker, der GitHub-Zeitplan, ein Mensch), fragt diese Datei,
   welcher Slot zuletzt fällig war und ob dessen Ergebnis schon veröffentlicht
   ist. Ist es das, tut der Lauf nichts. Ist es das nicht, rechnet er - auch
   wenn der Auslöser Stunden zu spät kommt. So braucht die Rechnung weder
   einen pünktlichen Zeitplan noch eine Endlosschleife.

   SLOTS (Ortszeit der Börse, aus dem Handelskalender - nie aus UTC-Annahmen)

     INTRADAY  Sitzungsbeginn + 90, + 210, + 330 Minuten
               (regulär 11:00, 13:00, 15:00 New York), nur wenn der Slot
               mindestens 30 Minuten vor dem Schluss liegt
     CLOSE     Handelsschluss + 20 Minuten (regulär 16:20): die Auswahl der
               beendeten Sitzung, unbestätigt bis zum Abendlauf

   Verkürzte Sitzungen (13:00) ergeben 11:00 und 13:20, Feiertage und
   Wochenenden keinen Slot. Sommer- und Winterzeit stecken im Kalender:
   dieselben Ortszeiten sind 15/17/19/20:20 UTC im Sommer und
   16/18/20/21:20 UTC im Winter (USA und Europa stellen an verschiedenen
   Wochenenden um; entscheidend ist allein die New Yorker Zeit).

   REINE FUNKTIONEN, KEIN NETZ, KEINE UHR: die Zeit kommt als Argument.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "refresh-plan-1.0.0";
  var TradingSession = isNode ? require("../../quant/engines/realtime/trading-session.js") : global.VUQuant && global.VUQuant.TradingSession;

  var CONFIG = {
    intradayOffsetsMin: [90, 210, 330],   /* nach Sitzungsbeginn */
    lastIntradayBeforeCloseMin: 30,       /* ein Slot braucht Luft bis zum Schluss */
    afterCloseOffsetMin: 20,              /* Schlussslot nach Handelsschluss */
    toleranceMin: 45,                     /* so spät ist ein Slot noch "pünktlich" */
    overdueFailMin: 90,                   /* ab hier schlägt die Überwachung an */
    alarmWindowMin: 360,                  /* danach ist der Slot nicht mehr aufholbar: kein Alarm */
    maxDataAgeOpenMin: 60,                /* Kursdaten älter als das gelten bei offener Börse als veraltet */
    maxDataAgeCloseMin: 30,               /* beim Schlussslot muss der Stand aus den letzten 30 Min. vor Schluss stammen */
    retryMin: 20,                         /* ein nicht schlüssiges Ergebnis wird frühestens so oft neu versucht */
    basisPublishMin: 120,                 /* so lange darf eine neue Abendlauf-Basis unveröffentlicht bleiben, bevor die Überwachung hinweist */
    validGraceMin: 90                     /* Anzeige gilt bis zum nächsten Slot + dieser Spanne */
  };
  /* Zustände, deren Veröffentlichung einen Slot erledigt. */
  var CONCLUSIVE = { LIVE: 1, NO_EVENTS: 1, SESSION_CLOSED: 1, EOD_CURRENT: 1 };

  function iso(ms) { return new Date(ms).toISOString(); }
  function toMs(when) { return when instanceof Date ? when.getTime() : typeof when === "number" ? when : Date.parse(when); }

  /** Die Slots einer Sitzung (Objekt aus TradingSession.sessionFor). */
  function slotsOf(session) {
    if (!session || !session.open || !session.close) return [];
    var openMs = Date.parse(session.open), closeMs = Date.parse(session.close), out = [];
    CONFIG.intradayOffsetsMin.forEach(function (m, i) {
      var t = openMs + m * 60000;
      if (t <= closeMs - CONFIG.lastIntradayBeforeCloseMin * 60000) {
        out.push({ id: session.sessionDate + "@I" + (i + 1), kind: "INTRADAY", sessionDate: session.sessionDate, dueAt: iso(t) });
      }
    });
    out.push({ id: session.sessionDate + "@C", kind: "CLOSE", sessionDate: session.sessionDate, dueAt: iso(closeMs + CONFIG.afterCloseOffsetMin * 60000) });
    return out;
  }

  function sessionByDate(isoDate, calendar) { return TradingSession.sessionFor(isoDate, { calendar: calendar }); }

  /**
   * Der Terminplan zu einem Zeitpunkt.
   * Rückgabe: {now, marketState, sessionDate, due, next, dueAgeMin}
   *   due  zuletzt fällig gewordener Slot (oder null ohne Kalenderabdeckung)
   *   next nächster Slot (auch am Folgetag)
   */
  function planAt(now, calendar) {
    var nowMs = toMs(now);
    var r = TradingSession.resolve(nowMs, { calendar: calendar });
    var seen = {}, sessions = [];
    [r.lastCompletedSession, r.currentSession].forEach(function (s) {
      if (s && !seen[s.sessionDate]) { seen[s.sessionDate] = 1; sessions.push(s); }
    });
    if (r.nextOpen) {
      var nx = TradingSession.resolve(Date.parse(r.nextOpen) + 60000, { calendar: calendar }).currentSession;
      if (nx && !seen[nx.sessionDate]) { seen[nx.sessionDate] = 1; sessions.push(nx); }
    }
    var slots = [];
    sessions.forEach(function (s) { slots = slots.concat(slotsOf(s)); });
    slots.sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0; });
    var due = null, next = null;
    slots.forEach(function (s) {
      if (Date.parse(s.dueAt) <= nowMs) due = s;
      else if (!next) next = s;
    });
    return {
      now: iso(nowMs), marketState: r.marketState, calendarCoverage: r.calendarCoverage !== false,
      sessionDate: r.displaySession ? r.displaySession.sessionDate : null,
      due: due, next: next,
      dueAgeMin: due ? Math.round((nowMs - Date.parse(due.dueAt)) / 60000) : null
    };
  }

  /**
   * Bis wann darf die Oberfläche die Auswahl dieses Slots zeigen? Bis zum
   * nächsten Slot plus Karenz; fehlt ein nächster Slot, 4 Stunden.
   */
  function validUntil(plan) {
    var base = plan.next ? Date.parse(plan.next.dueAt) + CONFIG.validGraceMin * 60000 : Date.parse(plan.now) + 4 * 3600000;
    return iso(base);
  }

  /**
   * Was tut dieser Lauf?
   * published   die bisher veröffentlichte Live-Datei (oder null)
   * ctx         {nowMs, basisAsOf, schemaVersion, force}
   * Rückgabe    {action: "COMPUTE"|"SKIP", reason}
   *
   * Idempotent: derselbe Zustand ergibt dieselbe Entscheidung; ein zweiter
   * Lauf zum selben Slot ändert nichts. Eine ältere Veröffentlichung wird
   * nie über eine neuere gestellt (PUBLISHED_NEWER).
   */
  function decide(plan, published, ctx) {
    ctx = ctx || {};
    if (ctx.force) return { action: "COMPUTE", reason: "FORCED" };
    if (!plan || !plan.due) return { action: "COMPUTE", reason: "NO_PLAN" };
    /* Die Boerse ist offen, aber der erste Slot des Tages noch nicht faellig
       (Winterzeit: Tick um 10:05 New York, erster Slot 11:00): "faellig" ist
       dann noch der Schlussslot des Vortags. Nichts rechnen - sonst entstuende
       eine LIVE-Auswahl aus 35 Handelsminuten unter dem Slot von gestern. */
    if (plan.marketState === "OPEN" && plan.sessionDate && plan.due.sessionDate !== plan.sessionDate) {
      return { action: "SKIP", reason: "BEFORE_FIRST_SLOT" };
    }
    if (!published || !published.slot) return throttle(plan, ctx, { action: "COMPUTE", reason: "NO_PUBLISHED" });
    if (ctx.schemaVersion && published.schemaVersion !== ctx.schemaVersion) return { action: "COMPUTE", reason: "SCHEMA_CHANGED" };
    /* Ein verspaeteter Nachtlauf mit einer aelteren Basis, als schon veroeffentlicht ist,
       rechnet nichts: die Basis geht nie rueckwaerts (ISO-Daten sind ordnungstreu). */
    if (published.eodAsOf && ctx.basisAsOf && published.eodAsOf > ctx.basisAsOf) return { action: "SKIP", reason: "BASIS_OLDER" };
    var ps = published.slot.dueAt, ds = plan.due.dueAt;
    if (ps > ds) return { action: "SKIP", reason: "PUBLISHED_NEWER" };
    if (ps === ds && published.eodAsOf === ctx.basisAsOf) {
      if (CONCLUSIVE[published.status]) return { action: "SKIP", reason: "UP_TO_DATE" };
      /* Ein Alter, das nicht zu berechnen oder negativ ist (kaputte oder in
         der Zukunft liegende generatedAt), blockiert den Neuversuch nie. */
      var age = (ctx.nowMs - Date.parse(published.generatedAt)) / 60000;
      return !(age >= 0) || age >= CONFIG.retryMin ? { action: "COMPUTE", reason: "RETRY" } : { action: "SKIP", reason: "RETRY_LATER" };
    }
    return throttle(plan, ctx, { action: "COMPUTE", reason: ps === ds ? "BASIS_CHANGED" : "SLOT_DUE" });
  }

  /* Ein Fehlversuch fuer diesen Slot (letzte Rechnung nicht schluessig oder
     ohne Ersetzung) wird nicht bei jedem Ausloeser wiederholt: fruehestens nach
     retryMin. Ohne diese Bremse schriebe ein dauerhafter Anbieterausfall alle
     30 Minuten eine neue Monitor-Datei und damit einen Commit samt Auslieferung. */
  function throttle(plan, ctx, entscheidung) {
    var lr = ctx.lastRun;
    if (lr && plan.due && lr.slotId === plan.due.id && lr.result && lr.result !== "PUBLISHED" && lr.finishedAt) {
      var ago = (ctx.nowMs - Date.parse(lr.finishedAt)) / 60000;
      if (ago >= 0 && ago < CONFIG.retryMin) return { action: "SKIP", reason: "RETRY_LATER" };
    }
    return entscheidung;
  }

  /**
   * Darf ein neu gerechnetes Ergebnis das veröffentlichte ersetzen?
   * Nie rückwärts: gleiche Sitzung und Basis, aber älterer Datenstand
   * (asOf) bleibt draußen. Ein nicht schlüssiges Ergebnis ersetzt ein
   * schlüssiges derselben Sitzung nicht - die letzte gültige Auswahl bleibt.
   */
  function mayReplace(published, fresh) {
    if (!published) return { ok: true, reason: "NOTHING_PUBLISHED" };
    if (published.eodAsOf && fresh.eodAsOf && fresh.eodAsOf < published.eodAsOf) return { ok: false, reason: "OLDER_BASIS" };
    var sameSession = published.sessionDate === fresh.sessionDate && published.eodAsOf === fresh.eodAsOf;
    if (!sameSession) return { ok: true, reason: "OTHER_SESSION" };
    var pubConclusive = !!CONCLUSIVE[published.status], freshConclusive = !!CONCLUSIVE[fresh.status];
    if (pubConclusive && !freshConclusive) return { ok: false, reason: "KEEP_LAST_VALID" };
    if (published.slot && fresh.slot && published.slot.dueAt > fresh.slot.dueAt) return { ok: false, reason: "PUBLISHED_NEWER" };
    if (published.asOf && fresh.asOf && fresh.asOf < published.asOf) return { ok: false, reason: "OLDER_DATA" };
    return { ok: true, reason: "NEWER" };
  }

  /**
   * Datenalter gegen die Börsenlage.
   * Rückgabe {stale, ageMin, reason}: veraltet ist der KURSSTAND (Taktgeber,
   * Anbieter) - nicht zu verwechseln mit einer ausgefallenen Neuberechnung.
   */
  function dataState(plan, asOfIso, nowMs, session) {
    if (!asOfIso) return { stale: true, ageMin: null, reason: "NO_DATA" };
    var ageMin = Math.round((nowMs - Date.parse(asOfIso)) / 60000);
    if (plan.marketState === "OPEN") {
      return ageMin > CONFIG.maxDataAgeOpenMin ? { stale: true, ageMin: ageMin, reason: "OPEN_DATA_OLD" } : { stale: false, ageMin: ageMin, reason: null };
    }
    /* Nach dem Schluss zählt, ob der Stand aus der Schlussphase stammt. */
    if (session && session.close) {
      var gap = Math.round((Date.parse(session.close) - Date.parse(asOfIso)) / 60000);
      return gap > CONFIG.maxDataAgeCloseMin ? { stale: true, ageMin: ageMin, reason: "CLOSE_DATA_OLD" } : { stale: false, ageMin: ageMin, reason: null };
    }
    return { stale: false, ageMin: ageMin, reason: null };
  }

  /**
   * Die Überwachung. Unterscheidet drei Dinge, die sonst alle "veraltet"
   * hießen:
   *   RECOMPUTE_OVERDUE  ein fälliger Slot ist nicht veröffentlicht (der
   *                      Lauf wurde nicht gestartet oder ist gescheitert)
   *   DATA_STALE         die Rechnung lief, aber die Kurse waren alt
   *   COMPUTE_ERROR      die letzte Rechnung meldet einen Fehler
   * Außerhalb des Alarmfensters (Wochenende, Feiertag, nach Abendlauf)
   * bleibt es still.
   *
   * monitor  Inhalt von discover/live/monitor-<U>.json (oder null)
   * ctx      {nowMs, eodAsOf, eodGeneratedAt}  eodAsOf: Stand des Abendlaufs (Basis)
   */
  function assess(monitor, calendar, ctx) {
    var nowMs = ctx.nowMs, plan = planAt(nowMs, calendar), findings = [];
    function add(level, code, text) { findings.push({ level: level, code: code, text: text }); }
    var pub = monitor && monitor.published ? monitor.published : null;
    var pubSlot = pub && pub.slot ? pub.slot.dueAt : null;
    var err = monitor && monitor.error && monitor.error.code ? monitor.error : null;
    /* Eine nicht schluessige Rechnung ist ein Datenproblem (Kurse alt) oder ein
       Rechenfehler - nie "der Lauf wurde nicht gestartet". */
    var errCode = err ? (err.code === "INTRADAY_STALE" ? "DATA_STALE" : "COMPUTE_ERROR") : null;
    var errText = err ? err.code + (err.message ? " - " + err.message : "") : "";
    var inWindow = plan.dueAgeMin !== null && plan.dueAgeMin <= CONFIG.alarmWindowMin;

    /* Dieselben Schwellen mit und ohne Monitor-Datei: ein frischer Rollout
       (noch keine Datei) darf nicht schon in der Toleranz alarmieren. */
    if (plan.due && (!pubSlot || pubSlot < plan.due.dueAt)) {
      var covered = ctx.eodAsOf && ctx.eodAsOf >= plan.due.sessionDate;
      var wo = pub ? "nicht veröffentlicht" : "keine veröffentlichte Live-Auswahl";
      var gelaufen = monitor && monitor.lastRun && monitor.lastRun.slotId === plan.due.id;
      if (!covered && inWindow) {
        if (gelaufen && errCode) {
          /* Der Lauf fand statt; sein Ergebnis war nicht schluessig. */
          if (plan.dueAgeMin > CONFIG.toleranceMin) add("WARN", errCode, "Slot " + plan.due.id + ": der Lauf fand statt, das Ergebnis war nicht schlüssig (" + errText + ") - Taktgeber/Anbieter, nicht die Neuberechnung.");
        } else if (plan.dueAgeMin > CONFIG.overdueFailMin) add("FAIL", "RECOMPUTE_OVERDUE", "Slot " + plan.due.id + " ist seit " + plan.dueAgeMin + " Min. fällig, " + wo + " - der Lauf wurde nicht gestartet oder ist gescheitert.");
        else if (plan.dueAgeMin > CONFIG.toleranceMin) add("WARN", "RECOMPUTE_LATE", "Slot " + plan.due.id + " ist seit " + plan.dueAgeMin + " Min. fällig, " + wo + ".");
      }
    }
    if (errCode && inWindow && !findings.some(function (f) { return f.code === errCode; })) {
      add("WARN", errCode, "Letzte Rechnung: " + errText);
    }
    /* Der Abendlauf hat eine neuere Basis geliefert, als die Veroeffentlichung kennt, und
       die Nachtlauf-Stufe hat sie auch nach zwei Stunden nicht uebernommen (Stufe nicht
       gelaufen oder gescheitert). Nur ein Hinweis: der naechste Slot rechnet ohnehin neu,
       und die Startseite waehlt die Schlusskurs-Auswahl nach der Basis, nicht nach dieser Datei. */
    var basisAlterMin = ctx.eodGeneratedAt ? Math.round((nowMs - Date.parse(ctx.eodGeneratedAt)) / 60000) : null;
    if (pub && pub.eodAsOf && ctx.eodAsOf && ctx.eodAsOf > pub.eodAsOf && plan.marketState !== "OPEN" &&
        basisAlterMin !== null && basisAlterMin > CONFIG.basisPublishMin) {
      add("WARN", "BASIS_NOT_PUBLISHED", "Neue Basis " + ctx.eodAsOf + " (seit " + basisAlterMin + " Min.), veroeffentlicht ist noch " + pub.eodAsOf + " - die Nachtlauf-Stufe 'imblick' ist nicht gelaufen oder gescheitert.");
    }
    /* Ausserhalb der Kalenderabdeckung sind Feiertage unbekannt: nie FAIL. */
    if (plan.calendarCoverage === false) {
      findings.forEach(function (f) { if (f.level === "FAIL") f.level = "WARN"; });
      add("WARN", "CALENDAR_OUT_OF_RANGE", "Der Börsenkalender deckt diesen Tag nicht ab (market-calendar.json); Slots und Feiertage sind nicht gesichert.");
    }
    var level = findings.some(function (f) { return f.level === "FAIL"; }) ? "FAIL" : findings.length ? "WARN" : "OK";
    return { level: level, plan: plan, findings: findings };
  }

  var api = {
    VERSION: VERSION, CONFIG: CONFIG, CONCLUSIVE: CONCLUSIVE,
    slotsOf: slotsOf, planAt: planAt, validUntil: validUntil, decide: decide, mayReplace: mayReplace,
    dataState: dataState, assess: assess, sessionByDate: sessionByDate
  };
  if (isNode) module.exports = api;
  else { global.VUDiscover = global.VUDiscover || {}; global.VUDiscover.RefreshPlan = api; }
})(typeof window !== "undefined" ? window : globalThis);
