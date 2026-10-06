/* =========================================================================
   VISION UNIVERSE — realtime/asset-freshness.js   (Multi-Asset Core §28, §29, §38)

   IST DIESER WERT AKTUELL - GEMESSEN AN DER UHR SEINER ASSETKLASSE?

   "Letzter Kurs aelter als 15 Minuten = veraltet" ist fuer eine Aktie am
   Dienstag um 15 Uhr richtig, fuer Bitcoin am Samstag falsch herum, fuer
   eine US-Rendite sinnlos (sie erscheint einmal am Tag) und fuer einen
   Leitzins absurd (er gilt Wochen). Diese Datei gibt jedem Wert einen
   Zustand aus EINEM Vokabular, aber nach der Regel seiner Klasse.

   DIE FUENF ZUSTAENDE

     LIVE          Nur mit belegtem Echtzeitpfad (Frequenz REALTIME) und
                   frischem Stand bei laufendem Markt. Nie aus einem
                   Snapshot, nie kosmetisch (§30).
     CURRENT       Der Stand, der jetzt gelten muss: der juengste Snapshot
                   eines laufenden Marktes, der zuletzt faellige Tageswert
                   einer Veroeffentlichung, der geltende Beschluss.
     LAST_SESSION  Der Markt ruht (Wochenende, Pause, Schluss), und der
                   Wert ist der letzte vor dem Schluss - aktuell, aber
                   ohne laufenden Handel.
     STALE         Aelter als das, was jetzt gelten muesste. Wird nie als
                   aktuell beschriftet.
     UNAVAILABLE   Es gibt keinen Wert.

   KEINE ZWEITE FRESHNESS-ENGINE

   Boersengebundene Werte (Aktie, Index) gehen durch freshness.js, der
   Devisenmarkt durch fx-freshness.js aus dem Currency Core. Neu ist nur,
   was keiner der beiden kennt: rund um die Uhr (Krypto), Wochenfenster
   mit Pause (Metalle, Futures), Veroeffentlichungen (Renditen) und
   Beschluesse (Leitzinsen).

   Laeuft in Node und im Browser.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var R = isNode ? null : (global.VURealtime || {});
  var Profiles = isNode ? require("./session-profiles.js") : R.SessionProfiles;
  var Freshness = isNode ? require("./freshness.js") : R.Freshness;
  var FxFreshness = isNode ? require("../fx/fx-freshness.js") : (global.VUFx && global.VUFx.Freshness);

  var VERSION = "asset-freshness-1.0.0";
  var STATES = ["LIVE", "CURRENT", "LAST_SESSION", "STALE", "UNAVAILABLE"];
  var TONE = { LIVE: "live", CURRENT: "complete", LAST_SESSION: "complete", STALE: "stale", UNAVAILABLE: "none" };

  var DEFAULTS = {
    CONTINUOUS: { liveSeconds: 180, staleAfterSeconds: 21600 },
    WEEKLY_WINDOW: { liveSeconds: 180, staleAfterSeconds: 21600, closeGraceSeconds: 3600 },
    REFERENCE_MONTHLY: { maxLagDays: 62 },
    POLICY_EVENT: { maxCheckAgeHours: 96 }
  };

  function ms(v) {
    if (v === null || v === undefined) return NaN;
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return v;
    /* Ein reines Datum ist ein Tageswert; sein Zeitpunkt ist das Ende des
       Tages (dieselbe Lesart wie fx-freshness.js). */
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Date.parse(v + "T23:59:59Z");
    return Date.parse(v);
  }
  function isoDate(v) { var s = String(v || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; }
  function merged(a, b) { var o = {}; [a, b].forEach(function (x) { if (x) Object.keys(x).forEach(function (k) { o[k] = x[k]; }); }); return o; }

  function result(state, reason, extra) {
    var out = { engineVersion: VERSION, state: state, reason: reason, tone: TONE[state] };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    out.realtimeClaimAllowed = state === "LIVE";
    return out;
  }

  /* ------------------------------------------------ Laufzeit-/Alterregel */
  function ageRule(obs, session, now, th) {
    var at = ms(obs.asOf);
    if (!isFinite(at)) return result("UNAVAILABLE", "invalidAsOf");
    var age = Math.max(0, Math.round((now - at) / 1000));
    var realtime = obs.frequency === "REALTIME";
    if (session.isOpen) {
      if (realtime && age <= th.liveSeconds) return result("LIVE", "freshRealtimeTick", { ageSeconds: age });
      if (age <= th.staleAfterSeconds) return result("CURRENT", realtime ? "realtimeTickNotFresh" : "latestSnapshot", { ageSeconds: age });
      return result("STALE", "ageExceedsLimit", { ageSeconds: age, limitSeconds: th.staleAfterSeconds });
    }
    /* Markt ruht: gemessen am letzten Schluss, nicht an der Uhr. */
    var close = ms(session.lastCloseAt);
    if (!isFinite(close)) return result("STALE", "noLastClose", { ageSeconds: age });
    var gapAtClose = Math.round((close - at) / 1000);
    if (gapAtClose <= (th.closeGraceSeconds || 3600)) {
      return result("LAST_SESSION", session.closedReason || "marketClosed", { ageSeconds: age, lastCloseAt: session.lastCloseAt });
    }
    return result("STALE", "staleBeforeMarketClose", { ageSeconds: age, lastCloseAt: session.lastCloseAt });
  }

  /* ------------------------------------------------ Boerse (Aktie, Index) */
  function exchangeRule(obs, session, now, opts) {
    var r = session.resolution;
    var kind = obs.frequency === "DAILY" ? "daily" : "intraday";
    var series = kind === "daily"
      ? { lastDate: isoDate(obs.observationDate || obs.asOf), asOf: obs.asOf }
      : { sessionDate: isoDate(obs.observationDate || obs.asOf), asOf: obs.asOf, regularComplete: !!obs.sessionComplete,
          fetchedAfterClose: obs.sessionComplete === true, isLive: obs.frequency === "REALTIME" };
    var f = Freshness.assess({ resolution: r, series: series, kind: kind, now: now, calendar: opts.calendar,
                                options: opts.freshnessOptions || null });
    /* Der bestehende Vertrag nennt einen laufenden Snapshot LIVE und
       beschriftet ihn trotzdem "Heute · Stand". Hier heisst LIVE nur,
       was ein Echtzeitpfad belegt - der Snapshot ist CURRENT. */
    var map = { LIVE: obs.frequency === "REALTIME" ? "LIVE" : "CURRENT", LAST_SESSION: session.isOpen ? "CURRENT" : "LAST_SESSION",
                STALE: "STALE", UNAVAILABLE: "UNAVAILABLE" };
    return result(map[f.freshnessState] || "UNAVAILABLE", f.reason, { delegate: "freshness.js", lagSessions: f.lagSessions });
  }

  /* ------------------------------------------------ Devisen (Currency Core) */
  function fxRule(obs, now) {
    var f = FxFreshness.assess({ available: true, asOf: obs.asOf, frequency: obs.frequency || "DAILY", method: "LATEST_AVAILABLE" },
                               { now: now, frequency: obs.frequency || "DAILY" });
    var state = f.state === "CURRENT" ? (obs.frequency === "REALTIME" && f.realtimeClaimAllowed ? "LIVE" : "CURRENT")
              : f.state === "LAST_AVAILABLE" ? "LAST_SESSION" : f.state;
    return result(state, f.reason || (f.state === "LAST_AVAILABLE" ? "fxWeekClosed" : "withinFxLimit"),
                  { ageSeconds: f.ageSeconds, delegate: "fx-freshness.js" });
  }

  /* ------------------------------------------------ Veroeffentlichung */
  function publicationRule(obs, session, now, instrument, opts, th) {
    var obsDate = isoDate(obs.observationDate || obs.asOf);
    if (!obsDate) return result("UNAVAILABLE", "noObservationDate");
    if (instrument.sessionProfile === "REFERENCE_MONTHLY") {
      var lagDays = Math.round((now - ms(obsDate)) / 86400000);
      return lagDays <= th.maxLagDays ? result("CURRENT", "latestMonthlyPublication", { lagDays: lagDays })
                                      : result("STALE", "monthlyPublicationMissing", { lagDays: lagDays });
    }
    var expected = session.expectedObservationDate;
    var pub = session.publisher || {};
    var lag = Profiles.businessDaysBetween(obsDate, expected, pub, opts.calendar);
    var extra = { observationDate: obsDate, expectedObservationDate: expected, lagBusinessDays: lag,
                  maxLagBusinessDays: pub.maxLagBusinessDays || 1 };
    if (obsDate >= expected) return result("CURRENT", "latestPublication", extra);
    if (lag <= (pub.maxLagBusinessDays || 1)) return result("CURRENT", "publicationPendingWithinLag", extra);
    return result("STALE", "publicationMissing", extra);
  }

  /* ------------------------------------------------ Beschluss (Stufenserie) */
  function eventRule(obs, now, th) {
    /* Zwischen zwei Beschluessen bleibt der Wert derselbe - das ist nicht
       veraltet, das ist die Natur der Reihe (§25). Veraltet waere nur,
       dass niemand mehr nachgesehen hat, ob ein neuer Beschluss vorliegt. */
    var checked = ms(obs.checkedAt || obs.asOf);
    if (!isFinite(checked)) return result("UNAVAILABLE", "neverChecked");
    var hours = (now - checked) / 3600000;
    if (hours <= th.maxCheckAgeHours) {
      return result("CURRENT", "stepSeriesValidUntilNextDecision",
                    { effectiveSince: obs.effectiveSince || null, checkedAt: obs.checkedAt || null, checkAgeHours: Math.round(hours) });
    }
    return result("STALE", "sourceNotCheckedRecently", { checkedAt: obs.checkedAt || null, checkAgeHours: Math.round(hours) });
  }

  /**
   * Der Zustand eines Wertes.
   *
   * @param {object} input
   *   instrument   aufgeloeste Master-Zeile (sessionProfile, sessionExchange,
   *                publisherProfile)
   *   observation  {asOf, observationDate, frequency: REALTIME|INTRADAY|DAILY|
   *                MONTHLY|EVENT, checkedAt, effectiveSince, sessionComplete}
   *   now          Zeitpunkt (Standard: jetzt)
   *   calendar     quant/config/market-calendar.json
   *   config       quant/config/multi-asset.json (Schwellen, Herausgeber)
   * @returns {object} {state, reason, tone, realtimeClaimAllowed, session, ...}
   */
  function assess(input) {
    input = input || {};
    var inst = input.instrument || {};
    var obs = input.observation || null;
    var cfg = input.config || {};
    var now = input.now !== undefined ? ms(input.now) : Date.now();
    var profile = inst.sessionProfile;
    var publisher = inst.publisherProfile && cfg.publisherProfiles ? cfg.publisherProfiles[inst.publisherProfile] : null;
    var session = Profiles.stateAt(profile, now, { calendar: input.calendar, exchange: inst.sessionExchange, publisher: publisher });
    var th = merged(DEFAULTS[session.kind] || DEFAULTS[profile], (cfg.freshness || {})[profile]);

    var out;
    if (!obs || (!obs.asOf && !obs.observationDate)) out = result("UNAVAILABLE", "noObservation");
    else if (session.kind === "EXCHANGE") out = exchangeRule(obs, session, now, input);
    else if (session.kind === "FX_CORE") out = fxRule(obs, now);
    else if (session.kind === "CONTINUOUS" || session.kind === "WEEKLY_WINDOW") out = ageRule(obs, session, now, th);
    else if (session.kind === "PUBLICATION") out = publicationRule(obs, session, now, inst, input, th);
    else if (session.kind === "EVENT") out = eventRule(obs, now, th);
    else out = result("UNAVAILABLE", "unresolvedSessionProfile");

    var s = {};
    Object.keys(session).forEach(function (k) { if (k !== "resolution" && k !== "publisher") s[k] = session[k]; });
    out.session = s;
    out.profile = profile;
    out.checkedAt = new Date(now).toISOString();
    return out;
  }

  var api = { VERSION: VERSION, STATES: STATES, DEFAULTS: DEFAULTS, assess: assess };
  if (isNode) module.exports = api;
  else { global.VURealtime = global.VURealtime || {}; global.VURealtime.AssetFreshness = api; }
})(typeof window !== "undefined" ? window : globalThis);
