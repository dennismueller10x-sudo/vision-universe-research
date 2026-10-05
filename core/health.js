/* =========================================================================
   VISION UNIVERSE CORE — health.js

   SYSTEMZUSTAND AUF EINEN BLICK.

   Liest das Source-of-Truth-Register (core/registry/domains.json) und je
   Domaene ihr kanonisches Artefakt und urteilt deterministisch:

     OK        Frischevertrag erfuellt, Artefakt lesbar, Bestand plausibel
     DEGRADED  Rueckstand ueber der Warnschwelle oder Bestand unter Soll
     STALE     Rueckstand ueber der harten Schwelle
     FAILED    Artefakt fehlt oder ist nicht lesbar
     DISABLED  Domaene ist bewusst abgeschaltet
     NOT_DELIVERED  gegen die Seite gemessen, Artefakt wird bewusst nicht
               ausgeliefert (repositoryOnly)
     UNKNOWN   kein Zeitstempel - Frische nicht messbar

   Jede Zeile traegt: letzter Lauf, erwarteter und tatsaechlicher Stand,
   Rueckstand, Datensaetze, Warnungen, Erzeuger und Workflow - damit die
   Frage "wo ist der Fehler?" beantwortet ist, bevor jemand ein Log oeffnet.

   Rein: kein I/O. Der Aufrufer liefert die geladenen Artefakte
   (scripts/core/system-health.mjs aus dem Dateisystem oder per HTTP,
   /status/ per fetch). Die Sitzungslogik kommt aus der bestehenden
   Engine (quant/engines/realtime/trading-session.js) - keine zweite
   Handelskalender-Logik.

   UMD: globalThis.VUCore.Health
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.Health = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-health-1.0.0";
  var RANK = { OK: 0, DISABLED: 0, NOT_DELIVERED: 0, UNKNOWN: 1, DEGRADED: 2, STALE: 3, FAILED: 4 };
  var HOUR = 3600000;

  /** Wert unter einem Punktpfad ("a.b.0.c"); null, wenn nicht vorhanden. */
  function at(obj, path) {
    if (!path) return null;
    var parts = String(path).split("."), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return null;
      cur = cur[parts[i]];
    }
    return cur === undefined ? null : cur;
  }
  function first(obj, paths) {
    for (var i = 0; i < (paths || []).length; i++) {
      var v = at(obj, paths[i]);
      if (v !== null && v !== "") return v;
    }
    return null;
  }
  /** Zahl der Datensaetze: Zahl, Arraylaenge oder Schluesselzahl. */
  function count(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return null;
  }
  function parseTime(v) {
    if (typeof v !== "string") return null;
    var t = Date.parse(v);
    return isFinite(t) ? t : null;
  }
  function isoDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null; }
  /** Handelstag eines Zeitpunkts in New York (fuer Zeitstempel ohne asOf). */
  function nyDate(ms) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(ms));
    } catch (e) { return new Date(ms).toISOString().slice(0, 10); }
  }
  function worse(a, b) { return (RANK[b] || 0) > (RANK[a] || 0) ? b : a; }

  /** Handelstage, die `date` hinter `expected` liegt (0 = gleich). */
  function lagSessions(date, expected, ctx) {
    if (!date || !expected || date >= expected) return 0;
    if (!ctx.tradingSession || !ctx.calendar) return null;
    var d = date, n = 0;
    while (d < expected && n < 60) {
      d = ctx.tradingSession.nextTradingDay(d, { calendar: ctx.calendar });
      if (!d) return null;
      n++;
    }
    return n;
  }

  /**
   * Bewertet eine Domaene.
   * @param domain   Eintrag aus domains.json
   * @param loaded   { ok: true, data } | { ok: false, error }
   * @param ctx      { now: Date, calendar, tradingSession, resolution }
   */
  function assessDomain(domain, loaded, ctx) {
    var out = {
      id: domain.id, label: domain.label, layer: domain.layer, group: domain.group,
      critical: !!domain.critical, status: "OK", artifact: domain.artifact,
      producer: domain.producer || null, workflow: domain.workflow || null, schedule: domain.schedule || null,
      lastUpdate: null, asOf: null, expected: null, ageHours: null, lagSessions: null,
      records: null, expectedRecords: null, coverage: null, warnings: [], reason: null
    };
    if (domain.repositoryOnly && ctx.target === "site") {
      out.status = "NOT_DELIVERED"; out.reason = "REPOSITORY_ONLY";
      out.warnings.push("Wird nicht ausgeliefert; nur gegen das Repository messbar.");
      return out;
    }
    if (!loaded || !loaded.ok) {
      out.status = "FAILED";
      out.reason = "ARTIFACT_UNREADABLE";
      out.warnings.push("Artefakt nicht lesbar: " + (loaded && loaded.error ? loaded.error : "unbekannt"));
      return out;
    }
    var data = loaded.data;
    var dis = domain.disabledWhen;
    if (dis && at(data, dis.path) === dis.equals) {
      out.status = "DISABLED"; out.reason = "DISABLED_BY_ARTIFACT";
      return out;
    }
    var ts = first(data, domain.timestamp);
    var tsMs = parseTime(ts);
    out.lastUpdate = tsMs ? new Date(tsMs).toISOString() : null;
    out.asOf = isoDate(first(data, domain.asOf)) || (tsMs ? null : null);
    out.ageHours = tsMs ? Math.round(((ctx.now.getTime() - tsMs) / HOUR) * 10) / 10 : null;

    out.records = domain.records ? count(at(data, domain.records)) : null;
    out.expectedRecords = domain.expectedRecords ? count(at(data, domain.expectedRecords)) : null;
    if (out.records !== null && out.expectedRecords) {
      out.coverage = Math.round((out.records / out.expectedRecords) * 1000) / 1000;
    }
    if (domain.minRecords && out.records !== null && out.records < domain.minRecords) {
      out.status = worse(out.status, "DEGRADED");
      out.warnings.push("Nur " + out.records + " Datensaetze (Soll mindestens " + domain.minRecords + ").");
    }
    if (domain.records && out.records === 0) {
      out.status = worse(out.status, "DEGRADED");
      out.warnings.push("Artefakt ohne Datensaetze.");
    }
    if (tsMs && tsMs > ctx.now.getTime() + 10 * 60000) {
      out.status = worse(out.status, "DEGRADED");
      out.warnings.push("Zeitstempel liegt in der Zukunft (" + out.lastUpdate + ").");
    }

    var f = domain.freshness || { kind: "none" };
    var res = ctx.resolution;
    if (f.kind === "hours") {
      if (out.ageHours === null) { out.status = worse(out.status, "UNKNOWN"); out.reason = "NO_TIMESTAMP"; }
      else if (out.ageHours > f.staleAfter) { out.status = worse(out.status, "STALE"); out.reason = "OLDER_THAN_" + f.staleAfter + "H"; }
      else if (out.ageHours > f.warnAfter) { out.status = worse(out.status, "DEGRADED"); out.reason = "OLDER_THAN_" + f.warnAfter + "H"; }
      out.expected = "juenger als " + f.warnAfter + " h";
    } else if (f.kind === "sessions") {
      var expected = res && res.lastCompletedSession ? res.lastCompletedSession.sessionDate : null;
      var date = out.asOf || (tsMs ? nyDate(tsMs) : null);
      out.asOf = date;
      out.expected = expected;
      var lag = lagSessions(date, expected, ctx);
      out.lagSessions = lag;
      if (!date) { out.status = worse(out.status, "UNKNOWN"); out.reason = "NO_ASOF"; }
      else if (lag === null) { out.status = worse(out.status, "UNKNOWN"); out.reason = "NO_CALENDAR"; }
      else if (lag >= f.staleAfter) { out.status = worse(out.status, "STALE"); out.reason = "BEHIND_" + lag + "_SESSIONS"; }
      else if (lag >= f.warnAfter) { out.status = worse(out.status, "DEGRADED"); out.reason = "BEHIND_" + lag + "_SESSIONS"; }
    } else if (f.kind === "intraday") {
      assessIntraday(out, data, f, ctx);
    }
    if (out.status !== "OK" && !out.reason) out.reason = "SEE_WARNINGS";
    return out;
  }

  /* Intraday: bei offener Boerse zaehlt das Alter des letzten Takts; nach
     Schluss muss der vollstaendige Tagesverlauf der letzten Sitzung
     vorliegen. Genau der Zustand vom 03.10.2026 (Verzeichnis stand auf
     14:25 New York, "laeuft", nach Schluss nie vervollstaendigt) war
     vorher nur im Freshness-Monitor sichtbar. */
  function assessIntraday(out, data, f, ctx) {
    var res = ctx.resolution || {};
    var ds = data.dataSession || null;
    out.asOf = ds ? ds.sessionDate : null;
    if (!ds) { out.status = worse(out.status, "UNKNOWN"); out.reason = "NO_DATA_SESSION"; return; }
    if (res.marketState === "OPEN") {
      out.expected = res.currentSession ? res.currentSession.sessionDate : null;
      var lastTick = parseTime(ds.asOf);
      var minutes = lastTick ? (ctx.now.getTime() - lastTick) / 60000 : null;
      if (out.expected && ds.sessionDate !== out.expected) {
        out.status = worse(out.status, "STALE"); out.reason = "NOT_CURRENT_SESSION";
      } else if (minutes === null || minutes > (f.openStaleMinutes || 30)) {
        out.status = worse(out.status, "STALE"); out.reason = "TICK_OLDER_THAN_" + (f.openStaleMinutes || 30) + "MIN";
        if (minutes !== null) out.warnings.push("Letzter Takt vor " + Math.round(minutes) + " Minuten.");
      }
      return;
    }
    var expected = res.lastCompletedSession ? res.lastCompletedSession.sessionDate : null;
    out.expected = expected;
    out.lagSessions = lagSessions(ds.sessionDate, expected, ctx);
    if (expected && ds.sessionDate < expected) {
      out.status = worse(out.status, "STALE"); out.reason = "BEHIND_" + out.lagSessions + "_SESSIONS";
    } else if (f.closedRequireComplete && ds.sessionDate === expected && ds.regularComplete === false) {
      out.status = worse(out.status, "STALE"); out.reason = "SESSION_NOT_COMPLETED";
      out.warnings.push("Tagesverlauf " + ds.sessionDate + " endet " + (ds.asOfLocal || "?") + " New York - Schluss fehlt.");
    }
    var disp = data.displaySession || {};
    if (res.marketState !== "OPEN" && disp.isRunning === true) {
      out.warnings.push("Verzeichnis meldet die Sitzung als laufend, die Boerse ist geschlossen.");
    }
    if (Array.isArray(data.universeSessions) && expected && data.universeSessions.indexOf(expected) < 0) {
      out.status = worse(out.status, "DEGRADED");
      out.warnings.push("Universumslauf fuer " + expected + " fehlt (nur Discover-Umfang).");
    }
  }

  /**
   * Bewertet die ganze Plattform.
   * @param registry   domains.json
   * @param artifacts  { [artifactPath]: {ok,data}|{ok:false,error} }
   * @param opts       { now, calendar, tradingSession }
   */
  function evaluate(registry, artifacts, opts) {
    opts = opts || {};
    var now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
    var resolution = null;
    if (opts.tradingSession && opts.calendar) {
      try { resolution = opts.tradingSession.resolve(now, { calendar: opts.calendar }); } catch (e) { resolution = null; }
    }
    var ctx = { now: now, calendar: opts.calendar || null, tradingSession: opts.tradingSession || null, resolution: resolution,
                target: opts.target === "site" ? "site" : "repository" };
    var domains = (registry.domains || []).map(function (d) { return assessDomain(d, artifacts[d.artifact], ctx); });
    var overall = "OK";
    domains.forEach(function (d) {
      /* Eine nicht-kritische Domaene kann die Plattform hoechstens auf
         DEGRADED ziehen: News ohne Zeitplan ist kein Ausfall der Kurse. */
      var s = d.critical ? d.status : (RANK[d.status] >= RANK.DEGRADED ? "DEGRADED" : d.status === "UNKNOWN" ? "OK" : d.status);
      overall = worse(overall, s === "UNKNOWN" ? "DEGRADED" : s);
    });
    var counts = {};
    domains.forEach(function (d) { counts[d.status] = (counts[d.status] || 0) + 1; });
    return {
      version: VERSION,
      checkedAt: now.toISOString(),
      market: resolution ? {
        state: resolution.marketState || null,
        lastCompletedSession: resolution.lastCompletedSession ? resolution.lastCompletedSession.sessionDate : null,
        currentSession: resolution.currentSession ? resolution.currentSession.sessionDate : null
      } : null,
      overall: overall,
      counts: counts,
      domains: domains
    };
  }

  /** Textbericht (CLI, Workflow-Zusammenfassung). */
  function formatText(report) {
    var lines = ["VISION UNIVERSE SYSTEM HEALTH  " + report.overall + "  (" + report.checkedAt + ")"];
    if (report.market) lines.push("Markt: " + report.market.state + " · letzte abgeschlossene Sitzung " + report.market.lastCompletedSession);
    lines.push("");
    report.domains.forEach(function (d) {
      var stand = d.asOf || (d.lastUpdate ? d.lastUpdate.slice(0, 16).replace("T", " ") : "-");
      var extra = [];
      if (d.lagSessions) extra.push(d.lagSessions + " Sitzung(en) zurueck");
      if (d.ageHours !== null && d.ageHours !== undefined) extra.push(d.ageHours + " h alt");
      if (d.records !== null && d.records !== undefined) extra.push(d.records + (d.expectedRecords ? "/" + d.expectedRecords : "") + " Datensaetze");
      lines.push(pad(d.label, 30) + pad(d.status, 10) + pad(stand, 18) + extra.join(" · "));
      if (d.status !== "OK" && d.status !== "DISABLED" && d.status !== "NOT_DELIVERED") {
        if (d.reason) lines.push("    Grund: " + d.reason + (d.workflow ? " · Erzeuger: " + d.workflow : ""));
        d.warnings.forEach(function (w) { lines.push("    - " + w); });
      }
    });
    return lines.join("\n");
  }
  function pad(s, n) { s = String(s); return s.length >= n ? s + " " : s + new Array(n - s.length + 1).join(" "); }

  return { VERSION: VERSION, RANK: RANK, evaluate: evaluate, assessDomain: assessDomain, formatText: formatText, at: at };
});
