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
      now: iso(nowMs), marketState: r.marketState,
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
    if (!published || !published.slot) return { action: "COMPUTE", reason: "NO_PUBLISHED" };
    if (ctx.schemaVersion && published.schemaVersion !== ctx.schemaVersion) return { action: "COMPUTE", reason: "SCHEMA_CHANGED" };
    var ps = published.slot.dueAt, ds = plan.due.dueAt;
    if (ps > ds) return { action: "SKIP", reason: "PUBLISHED_NEWER" };
    if (ps === ds && published.eodAsOf === ctx.basisAsOf) {
      if (CONCLUSIVE[published.status]) return { action: "SKIP", reason: "UP_TO_DATE" };
      var age = (ctx.nowMs - Date.parse(published.generatedAt)) / 60000;
      return age >= CONFIG.retryMin ? { action: "COMPUTE", reason: "RETRY" } : { action: "SKIP", reason: "RETRY_LATER" };
    }
    return { action: "COMPUTE", reason: ps === ds ? "BASIS_CHANGED" : "SLOT_DUE" };
  }

  /**
   * Darf ein neu gerechnetes Ergebnis das veröffentlichte ersetzen?
   * Nie rückwärts: gleiche Sitzung und Basis, aber älterer Datenstand
   * (asOf) bleibt draußen. Ein nicht schlüssiges Ergebnis ersetzt ein
   * schlüssiges derselben Sitzung nicht - die letzte gültige Auswahl bleibt.
   */
  function mayReplace(published, fresh) {
    if (!published) return { ok: true, reason: "NOTHING_PUBLISHED" };
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
   * ctx      {nowMs, eodAsOf}  eodAsOf: Stand des Abendlaufs (Basis)
   */
  function assess(monitor, calendar, ctx) {
    var nowMs = ctx.nowMs, plan = planAt(nowMs, calendar), findings = [];
    function add(level, code, text) { findings.push({ level: level, code: code, text: text }); }
    var pub = monitor && monitor.published ? monitor.published : null;
    var pubSlot = pub && pub.slot ? pub.slot.dueAt : null;
    /* Dieselben Schwellen mit und ohne Monitor-Datei: ein frischer Rollout
       (noch keine Datei) darf nicht schon in der Toleranz alarmieren. */
    if (plan.due && (!pubSlot || pubSlot < plan.due.dueAt)) {
      var covered = ctx.eodAsOf && ctx.eodAsOf >= plan.due.sessionDate;
      var wo = pub ? "nicht veröffentlicht" : "keine veröffentlichte Live-Auswahl";
      if (!covered && plan.dueAgeMin <= CONFIG.alarmWindowMin) {
        if (plan.dueAgeMin > CONFIG.overdueFailMin) add("FAIL", "RECOMPUTE_OVERDUE", "Slot " + plan.due.id + " ist seit " + plan.dueAgeMin + " Min. fällig, " + wo + " - der Lauf wurde nicht gestartet oder ist gescheitert.");
        else if (plan.dueAgeMin > CONFIG.toleranceMin) add("WARN", "RECOMPUTE_LATE", "Slot " + plan.due.id + " ist seit " + plan.dueAgeMin + " Min. fällig, " + wo + ".");
      }
    }
    if (!monitor || !monitor.published) {
      return { level: findings.some(function (f) { return f.level === "FAIL"; }) ? "FAIL" : findings.length ? "WARN" : "OK", plan: plan, findings: findings };
    }
    var ls = monitor.lastSuccess;
    if (ls && typeof ls.dataAgeMinutes === "number" && ls.dataState && ls.dataState.stale) {
      add("WARN", "DATA_STALE", "Bei der letzten Rechnung waren die Kursdaten veraltet (" + ls.dataState.reason + ", " + ls.dataAgeMinutes + " Min.) - Taktgeber oder Anbieter, nicht die Neuberechnung.");
    }
    if (monitor.error && monitor.error.code && plan.dueAgeMin !== null && plan.dueAgeMin <= CONFIG.alarmWindowMin) {
      add("WARN", "COMPUTE_ERROR", "Letzte Rechnung: " + monitor.error.code + (monitor.error.message ? " - " + monitor.error.message : ""));
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
