/* =========================================================================
   VISION UNIVERSE — realtime/intraday-snapshot.js

   DER INTRADAY-VERTRAG

   Ein Snapshot ist der Tagesverlauf EINER Sitzung EINES Titels, so wie
   der Anbieter ihn geliefert hat: 5-Minuten-Bars ueber Tiingo/IEX, in
   Punkte [Ortszeit, Schluss] uebersetzt. Er traegt, wofuer er gilt
   (Titel, Sitzung, Intervall, Anbieter), wie alt er ist (asOf), und ob
   die Sitzung abgeschlossen ist.

   Regeln, die diese Datei durchsetzt und die Tests festhalten:

     - Kein Punkt entsteht hier. Was der Anbieter nicht geliefert hat,
       fehlt. Es wird nicht interpoliert, nicht fortgeschrieben und
       nicht mit dem Tagesschluss aufgefuellt.
     - Ein Snapshot einer abgeschlossenen Sitzung ist unveraenderlich:
       merge() gibt ihn zurueck, egal was danach kommt.
     - Waehrend der Sitzung waechst er nur: ein Nachfolger mit weniger
       Punkten ersetzt ihn nicht.
     - Ein Snapshot ohne einen einzigen Punkt der regulaeren Sitzung ist
       kein Chart und wird nicht veroeffentlicht (publishable=false).

   Dasselbe Modul laeuft im Ingest (Node) und im Browser (Pruefung vor dem
   Zeichnen): der Chart zeichnet nur, was validate() durchlaesst.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("./market-hours.js")
                           : (global.VURealtime && global.VURealtime.MarketHours);

  var SCHEMA = "intraday-snapshot-1.0.0";
  var SERIES_TYPE = "INTRADAY_BARS";

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function minutesOf(hhmm) {
    var p = String(hhmm || "").split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  /**
   * Baut den Snapshot aus Anbieter-Bars.
   *
   * @param {object} input
   *   security     {securityId, ticker}
   *   bars         [{timestamp, open, high, low, close, volume}] (Adapter-Form)
   *   session      Ergebnis von TradingSession.sessionFor / displaySession
   *   now          Zeitpunkt des Abrufs
   *   marketState  Befund zum Abrufzeitpunkt
   *   provider, venue, interval
   *   previousClose  letzter Tagesschluss VOR der Sitzung (oder null)
   *   permission   {basis, checkedAt} aus der Anzeigerichtlinie
   *   delayMinutes Refresh-Intervall der Auslieferung
   */
  function build(input) {
    input = input || {};
    var session = input.session;
    if (!session || !session.sessionDate) throw new Error("intraday-snapshot: ohne Sitzung kein Snapshot");
    var tz = session.timezone || "America/New_York";
    var nowMs = input.now ? new Date(input.now).getTime() : Date.now();
    var openMs = Date.parse(session.open), closeMs = Date.parse(session.close);
    var preMs = session.preOpen ? Date.parse(session.preOpen) : openMs;
    var afterMs = session.afterClose ? Date.parse(session.afterClose) : closeMs;

    var regular = [], pre = [], after = [], lastTs = null, verworfen = 0;
    var bars = (input.bars || []).slice().sort(function (a, b) {
      return Date.parse(a.timestamp) - Date.parse(b.timestamp);
    });
    bars.forEach(function (b) {
      var ts = Date.parse(b.timestamp);
      if (!isFinite(ts) || !isNum(b.close)) { verworfen++; return; }
      if (ts < preMs || ts >= afterMs) { verworfen++; return; }
      var lp = MarketHours.localParts(ts, tz);
      if (!lp || lp.date !== session.sessionDate) { verworfen++; return; }
      var punkt = [lp.clock.slice(0, 5), round2(b.close)];
      if (ts < openMs) pre.push(punkt);
      else if (ts < closeMs) regular.push(punkt);
      else after.push(punkt);
      if (lastTs === null || ts > lastTs) lastTs = ts;
    });
    /* Doppelte Uhrzeiten (der Anbieter liefert gelegentlich denselben
       Stempel zweimal): der spaetere Eintrag gilt. */
    regular = dedupe(regular); pre = dedupe(pre); after = dedupe(after);

    var asOf = lastTs === null ? null : new Date(lastTs).toISOString();
    var asOfLocal = lastTs === null ? null : MarketHours.localParts(lastTs, tz).clock.slice(0, 5);
    var regularComplete = nowMs >= closeMs;
    return {
      schemaVersion: SCHEMA,
      instrumentId: input.security.ticker, symbol: input.security.ticker,
      securityId: input.security.securityId,
      provider: input.provider || "tiingo", venue: input.venue || "IEX",
      dataMode: "real",
      seriesType: SERIES_TYPE, interval: input.interval || "5min",
      sessionDate: session.sessionDate, timezone: tz,
      sessionOpen: session.open, sessionClose: session.close,
      sessionOpenLocal: session.openLocal, sessionCloseLocal: session.closeLocal,
      closeLocal: session.closeLocal, earlyClose: !!session.earlyClose,
      extendedHours: { preOpenLocal: session.preOpenLocal || null, afterCloseLocal: session.afterCloseLocal || null },
      asOf: asOf, asOfLocal: asOfLocal,
      fetchedAt: new Date(nowMs).toISOString(),
      marketStateAtFetch: input.marketState || null,
      isLive: false,
      isDelayed: true, delayMinutes: isNum(input.delayMinutes) ? input.delayMinutes : null,
      regularComplete: regularComplete,
      isComplete: nowMs >= afterMs,
      previousClose: isNum(input.previousClose) ? round2(input.previousClose) : null,
      points: regular,
      extended: { pre: pre, after: after },
      pointCount: regular.length,
      discardedBars: verworfen,
      publishable: regular.length >= 2,
      publishBasis: input.permission ? input.permission.basis || null : null,
      publishCheckedAt: input.permission ? input.permission.checkedAt || null : null,
      note: "Tagesverlauf aus Anbieter-Bars (" + (input.interval || "5min") + ", " + (input.venue || "IEX") +
            "). Punkte sind [Ortszeit, Schluss]; zwischen ihnen liegt nichts Erfundenes."
    };
  }

  function dedupe(punkte) {
    var out = [], seen = Object.create(null);
    punkte.forEach(function (p) {
      if (seen[p[0]] !== undefined) { out[seen[p[0]]] = p; return; }
      seen[p[0]] = out.length; out.push(p);
    });
    return out;
  }

  /** Darf hieraus ein Chart werden? Die einzige Stelle, die das entscheidet. */
  function validate(snapshot) {
    var f = [];
    if (!snapshot || typeof snapshot !== "object") return { ok: false, findings: ["kein Objekt"] };
    if (snapshot.schemaVersion !== SCHEMA) f.push("schemaVersion " + snapshot.schemaVersion);
    if (snapshot.dataMode !== "real") f.push("dataMode " + snapshot.dataMode);
    if (!snapshot.provider) f.push("ohne Anbieter");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.sessionDate))) f.push("sessionDate fehlt");
    if (!snapshot.asOf) f.push("asOf fehlt");
    if (!Array.isArray(snapshot.points)) f.push("points fehlt");
    else {
      if (snapshot.points.length < 2) f.push("weniger als zwei Punkte");
      var lo = minutesOf(snapshot.sessionOpenLocal || "09:30"), hi = minutesOf(snapshot.sessionCloseLocal || "16:00");
      var prev = -1;
      for (var i = 0; i < snapshot.points.length; i++) {
        var p = snapshot.points[i];
        if (!Array.isArray(p) || !/^\d{2}:\d{2}$/.test(String(p[0])) || !isNum(p[1])) { f.push("Punkt " + i + " nicht [Uhrzeit, Kurs]"); break; }
        var m = minutesOf(p[0]);
        if (m < lo || m >= hi) { f.push("Punkt " + p[0] + " ausserhalb der Sitzung"); break; }
        if (m <= prev) { f.push("Punkte nicht aufsteigend bei " + p[0]); break; }
        prev = m;
      }
    }
    if (!snapshot.publishBasis) f.push("ohne Grundlage");
    return { ok: f.length === 0, findings: f };
  }

  /**
   * Alt gegen neu. Abgeschlossen bleibt abgeschlossen; laufend waechst nur.
   * @returns {{ chosen: object, reason: string }}
   */
  function merge(prev, next) {
    if (!prev) return { chosen: next, reason: "first" };
    if (!next) return { chosen: prev, reason: "noNext" };
    if (prev.sessionDate !== next.sessionDate) return { chosen: next, reason: "newSession" };
    if (prev.regularComplete && prev.isComplete) return { chosen: prev, reason: "immutable" };
    var np = (next.points || []).length, pp = (prev.points || []).length;
    if (np < pp) return { chosen: prev, reason: "fewerPoints" };
    return { chosen: next, reason: np > pp ? "grown" : "refreshed" };
  }

  /** Cache-Schluessel: Titel + Sitzung + Intervall. */
  function cacheKey(securityId, sessionDate, interval) {
    return securityId + "|" + sessionDate + "|" + (interval || "5min");
  }

  var api = { SCHEMA: SCHEMA, SERIES_TYPE: SERIES_TYPE, build: build, validate: validate,
              merge: merge, cacheKey: cacheKey, minutesOf: minutesOf };
  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.IntradaySnapshot = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
