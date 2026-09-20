/* =========================================================================
   FRESHNESS-VERTRAG (V4 §9-10, §40)

   Die Zeitzustaende, in denen ein Chart als "aktuell" luegen koennte:
   Freitag -> Montag, Wochenende, Feiertag, verkuerzter Tag, Sommerzeit,
   Oeffnung, Schluss, neue Sitzung, stehen gebliebener Workflow.
   Alle Zeitpunkte sind New Yorker Ortszeit, als UTC geschrieben.

   Der Vorfall vom 15.09.2026 ist FR1: die Reihe traegt Freitag, der
   Montag ist gehandelt - und "Letzter Handelstag · Freitag" darf nicht
   mehr erscheinen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../engines/realtime/trading-session.js");
const F = require("../engines/realtime/freshness.js");
const CAL = require("../config/market-calendar.json");

const r = (iso) => T.resolve(iso, { calendar: CAL });
const intra = (sessionDate, asOfLocal, complete, extra) => Object.assign({
  symbol: "AAPL", securityId: "ref_AAPL", provider: "tiingo", venue: "IEX", interval: "5min",
  sessionDate, asOfLocal,
  asOf: T.localToUtc(sessionDate, asOfLocal, "America/New_York"),
  regularComplete: !!complete, isComplete: !!complete, closeLocal: "16:00"
}, extra || {});
const daily = (lastDate) => ({ ticker: "AAPL", securityId: "ref_AAPL", source: "tiingo", grain: "1day", to: lastDate, asOf: lastDate });
const bewerte = (iso, series, kind, opts) => F.assess({ resolution: r(iso), series, kind: kind || "intraday", calendar: CAL, options: opts });

/* Freitag, 11. September 2026 (EDT). Montag, 14. September, ist ein
   normaler Handelstag. Dienstag, 15. September, 07:37 UTC = 03:37 NY. */

test("FR1 · Der Vorfall: Dienstag frueh, Reihe von Freitag, Montag wurde gehandelt -> STALE, nie 'Letzter Handelstag'", () => {
  const b = bewerte("2026-09-15T07:37:00Z", intra("2026-09-11", "15:55", true));
  assert.equal(b.freshnessState, "STALE");
  assert.equal(b.expectedSessionDate, "2026-09-14");
  assert.equal(b.lagSessions, 1);
  assert.equal(b.reason, "lastSessionMissing");
  assert.equal(b.label.tone, "stale");
  assert.equal(b.label.label, "Stand Fr., 11.09. · nicht aktuell");
  assert.ok(!/Letzter Handelstag/.test(b.label.label));
  assert.equal(b.marketSessionState, "CLOSED");
});

test("FR2 · Freitag -> Montag 08:00: Freitag ist die letzte Sitzung, LAST_SESSION", () => {
  const b = bewerte("2026-09-14T12:00:00Z", intra("2026-09-11", "15:55", true));
  assert.equal(b.freshnessState, "LAST_SESSION");
  assert.equal(b.lagSessions, 0);
  assert.equal(b.label.label, "Letzter Handelstag · Freitag");
  assert.equal(b.label.tone, "complete");
});

test("FR3 · Wochenende: Samstag und Sonntag zeigen Freitag als letzte Sitzung", () => {
  for (const iso of ["2026-09-12T14:00:00Z", "2026-09-13T22:00:00Z"]) {
    const b = bewerte(iso, intra("2026-09-11", "15:55", true));
    assert.equal(b.freshnessState, "LAST_SESSION", iso);
    assert.equal(b.label.label, "Letzter Handelstag · Freitag", iso);
  }
  /* ... aber Donnerstag am Samstag ist STALE. */
  const alt = bewerte("2026-09-12T14:00:00Z", intra("2026-09-10", "15:55", true));
  assert.equal(alt.freshnessState, "STALE");
  assert.equal(alt.lagSessions, 1);
  assert.equal(alt.label.label, "Stand Do., 10.09. · nicht aktuell");
});

test("FR4 · Feiertag (Labor Day 07.09.): Freitag 04.09. ist die letzte Sitzung; Donnerstag 03.09. ist STALE", () => {
  const ok = bewerte("2026-09-07T15:00:00Z", intra("2026-09-04", "15:55", true));
  assert.equal(ok.freshnessState, "LAST_SESSION");
  assert.equal(ok.marketSessionState, "HOLIDAY");
  assert.equal(ok.label.label, "Letzter Handelstag · Freitag");
  const alt = bewerte("2026-09-07T15:00:00Z", intra("2026-09-03", "15:55", true));
  assert.equal(alt.freshnessState, "STALE");
  assert.equal(alt.lagSessions, 1);
  /* Dienstag nach dem Feiertag, 08:00: Freitag bleibt LAST_SESSION - der
     Montag war kein Handelstag und fehlt nicht. */
  const di = bewerte("2026-09-08T12:00:00Z", intra("2026-09-04", "15:55", true));
  assert.equal(di.freshnessState, "LAST_SESSION");
  assert.equal(di.lagSessions, 0);
});

test("FR5 · Verkuerzter Tag (27.11., Schluss 13:00): um 13:20 ist die Sitzung fertig, um 14:00 fehlt der Schluss", () => {
  const fertig = bewerte("2026-11-27T18:20:00Z", intra("2026-11-27", "12:55", true, { closeLocal: "13:00", earlyClose: true }));
  assert.equal(fertig.freshnessState, "LAST_SESSION");
  assert.equal(fertig.label.label, "Heute · Schluss 13:00 (verkürzt)");
  const offen = bewerte("2026-11-27T18:20:00Z", intra("2026-11-27", "12:40", false, { closeLocal: "13:00" }));
  assert.equal(offen.freshnessState, "LAST_SESSION");
  assert.equal(offen.partial, true);
  assert.equal(offen.withinGrace, true);
  assert.equal(offen.label.label, "Heute · Stand 12:40 · Schluss folgt");
  const spaet = bewerte("2026-11-27T19:00:00Z", intra("2026-11-27", "12:40", false, { closeLocal: "13:00" }));
  assert.equal(spaet.freshnessState, "STALE");
  assert.equal(spaet.reason, "closeMissing");
  assert.equal(spaet.label.label, "Heute · Stand 12:40 · nicht aktuell");
});

test("FR6 · Sommerzeit: Sitzungsgrenzen in UTC wandern, der Befund nicht (09:31 NY im November = 14:31 UTC)", () => {
  /* Montag, 2. November 2026: Sommerzeit endete am 1. November. */
  const vor = bewerte("2026-11-02T14:29:00Z", intra("2026-10-30", "15:55", true));
  assert.equal(vor.marketSessionState, "PRE_MARKET");
  assert.equal(vor.freshnessState, "LAST_SESSION");
  const nach = bewerte("2026-11-02T14:31:00Z", intra("2026-10-30", "15:55", true));
  assert.equal(nach.marketSessionState, "OPEN");
  assert.equal(nach.freshnessState, "LAST_SESSION");
  assert.equal(nach.withinGrace, true);
  assert.equal(nach.label.label, "Letzter Handelstag · Freitag · heutige Kurse folgen");
  /* Im Sommer dieselbe Ortszeit eine UTC-Stunde frueher. */
  const sommer = bewerte("2026-09-14T13:31:00Z", intra("2026-09-11", "15:55", true));
  assert.equal(sommer.marketSessionState, "OPEN");
  assert.equal(sommer.withinGrace, true);
});

test("FR7 · Oeffnung: in der Karenz nach 09:30 gilt der Vortag, danach ist er STALE", () => {
  const karenz = bewerte("2026-09-14T13:50:00Z", intra("2026-09-11", "15:55", true));
  assert.equal(karenz.freshnessState, "LAST_SESSION");
  assert.equal(karenz.reason, "previousSessionWithinOpenGrace");
  const vorbei = bewerte("2026-09-14T14:15:00Z", intra("2026-09-11", "15:55", true));
  assert.equal(vorbei.freshnessState, "STALE");
  assert.equal(vorbei.reason, "currentSessionMissing");
  assert.equal(vorbei.label.label, "Stand Fr., 11.09. · nicht aktuell");
  /* Engere Karenz ueber die Optionen. */
  const eng = bewerte("2026-09-14T13:50:00Z", intra("2026-09-11", "15:55", true), "intraday", { graceMinutes: 10 });
  assert.equal(eng.freshnessState, "STALE");
});

test("FR8 · Laufende Sitzung: frischer Stand ist LIVE, ein stehen gebliebener Stand ist STALE", () => {
  const live = bewerte("2026-09-14T15:45:00Z", intra("2026-09-14", "11:40", false));
  assert.equal(live.freshnessState, "LIVE");
  assert.equal(live.label.label, "Heute · Stand 11:40");
  assert.equal(live.label.tone, "live");
  const stehen = bewerte("2026-09-14T18:00:00Z", intra("2026-09-14", "11:40", false));
  assert.equal(stehen.freshnessState, "STALE");
  assert.equal(stehen.reason, "runningSessionStaleAsOf");
  assert.equal(stehen.label.label, "Heute · Stand 11:40 · nicht aktuell");
});

test("FR9 · Schluss: 16:05 mit Stand 15:55 ist LAST_SESSION (Schluss folgt), 17:00 ohne Schluss ist STALE, mit Schluss fertig", () => {
  const folgt = bewerte("2026-09-14T20:05:00Z", intra("2026-09-14", "15:55", false));
  assert.equal(folgt.freshnessState, "LAST_SESSION");
  assert.equal(folgt.partial, true);
  assert.equal(folgt.label.label, "Heute · Stand 15:55 · Schluss folgt");
  const fehlt = bewerte("2026-09-14T21:00:00Z", intra("2026-09-14", "15:55", false));
  assert.equal(fehlt.freshnessState, "STALE");
  const fertig = bewerte("2026-09-14T21:00:00Z", intra("2026-09-14", "15:55", true));
  assert.equal(fertig.freshnessState, "LAST_SESSION");
  assert.equal(fertig.label.label, "Heute · Schluss 16:00");
});

test("FR10 · Neue Sitzung: Dienstag 10:30 mit Montag-Reihe ist STALE, mit Dienstag-Reihe LIVE", () => {
  const alt = bewerte("2026-09-15T14:30:00Z", intra("2026-09-14", "15:55", true));
  assert.equal(alt.freshnessState, "STALE");
  assert.equal(alt.expectedSessionDate, "2026-09-15");
  const neu = bewerte("2026-09-15T14:30:00Z", intra("2026-09-15", "10:25", false));
  assert.equal(neu.freshnessState, "LIVE");
});

test("FR11 · Ohne Reihe: UNAVAILABLE mit erwarteter Sitzung", () => {
  const b = bewerte("2026-09-15T07:37:00Z", null);
  assert.equal(b.freshnessState, "UNAVAILABLE");
  assert.equal(b.expectedSessionDate, "2026-09-14");
  assert.equal(b.label.label, "Kein Tagesverlauf");
});

test("FR12 · Tagesreihen: Schluss Montag am Dienstag frueh ist aktuell; Freitag am Dienstag frueh ist STALE; Montag abends in der Karenz noch Freitag", () => {
  const ok = bewerte("2026-09-15T07:37:00Z", daily("2026-09-14"), "daily");
  assert.equal(ok.freshnessState, "LAST_SESSION");
  assert.equal(ok.label.label, "Schluss Montag");
  const alt = bewerte("2026-09-15T07:37:00Z", daily("2026-09-11"), "daily");
  assert.equal(alt.freshnessState, "STALE");
  assert.equal(alt.label.label, "Schluss Fr., 11.09. · nicht aktuell");
  /* Montag 17:00 NY: der Abendlauf (22:30 UTC = 18:30 NY) steht noch aus. */
  const karenz = bewerte("2026-09-14T21:00:00Z", daily("2026-09-11"), "daily");
  assert.equal(karenz.freshnessState, "LAST_SESSION");
  assert.equal(karenz.partial, true);
  assert.equal(karenz.label.label, "Schluss Fr., 11.09. · Montag folgt");
  /* Dienstag 01:00 NY (05:00 UTC): sechs Stunden nach Schluss - jetzt fehlt er. */
  const spaet = bewerte("2026-09-15T05:00:00Z", daily("2026-09-11"), "daily");
  assert.equal(spaet.freshnessState, "STALE");
  /* Waehrend der Sitzung gilt fuer Tagesreihen der Vortag. */
  const offen = bewerte("2026-09-15T15:00:00Z", daily("2026-09-14"), "daily");
  assert.equal(offen.freshnessState, "LAST_SESSION");
  assert.equal(offen.expectedSessionDate, "2026-09-14");
});

test("FR13 · Vertrag traegt Identitaet, Quelle, Intervall, Zeitstempel und Marktlage", () => {
  const b = bewerte("2026-09-15T07:37:00Z", intra("2026-09-14", "15:55", true));
  assert.equal(b.contractVersion, F.CONTRACT_VERSION);
  assert.equal(b.securityId, "ref_AAPL");
  assert.equal(b.symbol, "AAPL");
  assert.equal(b.source, "tiingo/IEX");
  assert.equal(b.interval, "5min");
  assert.equal(b.sessionDate, "2026-09-14");
  assert.equal(b.asOf, "2026-09-14T19:55:00.000Z");
  assert.equal(b.lastBarTimestamp, "2026-09-14T19:55:00.000Z");
  assert.equal(b.marketSessionState, "CLOSED");
  assert.ok(b.checkedAt);
  for (const k of ["securityId", "symbol", "source", "sessionDate", "asOf", "interval", "lastBarTimestamp",
                   "marketSessionState", "freshnessState"]) assert.ok(k in b, k);
});

test("FR14 · summarize zaehlt Zustaende und nennt die veralteten Titel", () => {
  const s = F.summarize([
    bewerte("2026-09-15T07:37:00Z", intra("2026-09-14", "15:55", true)),
    bewerte("2026-09-15T07:37:00Z", intra("2026-09-11", "15:55", true)),
    bewerte("2026-09-15T07:37:00Z", null)
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.byState.LAST_SESSION, 1);
  assert.equal(s.byState.STALE, 1);
  assert.equal(s.byState.UNAVAILABLE, 1);
  assert.deepEqual(s.stale, ["AAPL"]);
});

test("FR15 · Eine STALE-Beschriftung enthaelt in keinem Zustand 'Letzter Handelstag' oder 'live'", () => {
  const faelle = [
    ["2026-09-15T07:37:00Z", intra("2026-09-11", "15:55", true)],
    ["2026-09-14T18:00:00Z", intra("2026-09-14", "11:40", false)],
    ["2026-09-14T14:15:00Z", intra("2026-09-11", "15:55", true)],
    ["2026-09-14T21:00:00Z", intra("2026-09-14", "15:55", false)]
  ];
  for (const [iso, s] of faelle) {
    const b = bewerte(iso, s);
    assert.equal(b.freshnessState, "STALE", iso);
    assert.ok(!/Letzter Handelstag|live/.test(b.label.label), b.label.label);
    assert.ok(/nicht aktuell/.test(b.label.label), b.label.label);
  }
});
