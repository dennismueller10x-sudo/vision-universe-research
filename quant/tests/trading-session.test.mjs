/* =========================================================================
   TRADING SESSION RESOLVER + INTRADAY-VERTRAG (§20 des Auftrags
   FULL MARKET UNIVERSE & LIVE INTRADAY CHARTS)

   Die Zeitzustaende, an denen ein Live-Chart am haeufigsten falsch liegt:
   Freitag 15:00 laeuft, Freitag 16:30 ist fertig, Samstag/Sonntag/Montag
   08:00 zeigen Freitag, Montag 09:31 zeigt Montag, ein Feiertag zeigt den
   Handelstag davor, ein verkuerzter Tag schliesst um 13:00.
   Alle Zeitpunkte sind New Yorker Ortszeit, als UTC geschrieben.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../engines/realtime/trading-session.js");
const Snap = require("../engines/realtime/intraday-snapshot.js");
const CAL = require("../config/market-calendar.json");
const r = (iso) => T.resolve(iso, { calendar: CAL });

/* Freitag, 11. September 2026 (EDT, UTC-4). Montag, 7. September 2026 ist
   Labor Day. Freitag, 27. November 2026 schliesst um 13:00. */
test("TS1 · Freitag 15:00 NY: Boerse offen, die laufende Sitzung waechst", () => {
  const x = r("2026-09-11T19:00:00Z");
  assert.equal(x.marketState, "OPEN");
  assert.equal(x.displaySession.sessionDate, "2026-09-11");
  assert.equal(x.displaySession.kind, "current");
  assert.equal(x.displaySession.isRunning, true);
  assert.equal(x.displaySession.isComplete, false);
  assert.ok(x.displaySession.progress > 0.8 && x.displaySession.progress < 0.9);
  assert.equal(x.displaySession.open, "2026-09-11T13:30:00.000Z");
  assert.equal(x.displaySession.close, "2026-09-11T20:00:00.000Z");
  assert.equal(T.describe(x, { asOfLocal: "14:55" }).label, "Heute · Stand 14:55");
  assert.equal(T.describe(x, { asOfLocal: "14:59", isLive: true }).label, "Heute · live");
});

test("TS2 · Freitag 16:30 NY: Nachboerse, die Sitzung ist vollstaendig und bleibt sichtbar", () => {
  const x = r("2026-09-11T20:30:00Z");
  assert.equal(x.marketState, "AFTER_HOURS");
  assert.equal(x.displaySession.sessionDate, "2026-09-11");
  assert.equal(x.displaySession.isComplete, true);
  assert.equal(x.displaySession.progress, 1);
  assert.equal(T.describe(x, null).label, "Heute · Schluss 16:00");
});

test("TS3 · Samstag, Sonntag und Montag 08:00 zeigen Freitag", () => {
  for (const [iso, state] of [["2026-09-12T14:00:00Z", "CLOSED"], ["2026-09-13T14:00:00Z", "CLOSED"],
                              ["2026-09-14T12:00:00Z", "PRE_MARKET"]]) {
    const x = r(iso);
    assert.equal(x.marketState, state, iso);
    assert.equal(x.displaySession.sessionDate, "2026-09-11", iso);
    assert.equal(x.displaySession.kind, "last", iso);
    assert.equal(T.describe(x, null).label, "Letzter Handelstag · Freitag", iso);
  }
  assert.equal(r("2026-09-12T14:00:00Z").closedReason, "weekend");
});

test("TS4 · Montag 09:31 zeigt Montag: der Wechsel passiert um 09:30, nicht um Mitternacht", () => {
  const vor = r("2026-09-14T13:29:00Z"), nach = r("2026-09-14T13:31:00Z");
  assert.equal(vor.displaySession.sessionDate, "2026-09-11");
  assert.equal(vor.marketState, "PRE_MARKET");
  assert.equal(vor.nextChangeAt, "2026-09-14T13:30:00.000Z");
  assert.equal(nach.displaySession.sessionDate, "2026-09-14");
  assert.equal(nach.marketState, "OPEN");
  assert.equal(nach.displaySession.kind, "current");
  assert.equal(T.describe(nach, { asOfLocal: "09:30" }).label, "Heute · Stand 09:30");
});

test("TS5 · Feiertag (Labor Day) zeigt den Handelstag davor", () => {
  const x = r("2026-09-07T15:00:00Z");
  assert.equal(x.marketState, "HOLIDAY");
  assert.equal(x.closedReason, "holiday");
  assert.equal(x.displaySession.sessionDate, "2026-09-04");
  assert.equal(T.describe(x, null).label, "Letzter Handelstag · Freitag");
  assert.equal(x.nextOpen, "2026-09-08T13:30:00.000Z");
});

test("TS6 · Verkuerzter Handelstag schliesst um 13:00 - danach ist die Sitzung fertig", () => {
  const laeuft = r("2026-11-27T17:30:00Z"), fertig = r("2026-11-27T18:30:00Z");
  assert.equal(laeuft.marketState, "OPEN");
  assert.equal(laeuft.displaySession.closeLocal, "13:00");
  assert.equal(laeuft.displaySession.earlyClose, true);
  assert.equal(laeuft.displaySession.close, "2026-11-27T18:00:00.000Z");
  assert.equal(fertig.marketState, "AFTER_HOURS");
  assert.equal(fertig.displaySession.isComplete, true);
  assert.equal(T.describe(fertig, null).label, "Heute · Schluss 13:00 (verkürzt)");
});

test("TS7 · Winterzeit: 09:30 EST ist 14:30 UTC - keine feste Verschiebung", () => {
  const x = r("2026-01-15T14:35:00Z");
  assert.equal(x.marketState, "OPEN");
  assert.equal(x.displaySession.open, "2026-01-15T14:30:00.000Z");
  assert.equal(x.displaySession.close, "2026-01-15T21:00:00.000Z");
  assert.equal(T.localToUtc("2026-07-01", "09:30"), "2026-07-01T13:30:00.000Z");
});

test("TS8 · Eine aeltere Sitzung als sechs Tage wird mit Datum benannt", () => {
  const x = r("2026-09-20T14:00:00Z");
  assert.equal(T.describe(x, { sessionDate: "2026-09-04" }).label, "Letzter Handelstag · 04.09.");
  assert.equal(T.describe(x, null).label, "Letzter Handelstag · Freitag");
});

/* --------------------------------------------------- Intraday-Vertrag */
const SESSION = T.sessionFor("2026-09-11", { calendar: CAL });
const bar = (iso, close) => ({ timestamp: iso, open: close, high: close, low: close, close, volume: 100 });
const SEC = { securityId: "ref_AAPL", ticker: "AAPL" };
const PERM = { basis: "Test", checkedAt: "2026-09-13" };

test("IS1 · Punkte sind Ortszeit + Schluss; Vor- und Nachboerse liegen getrennt", () => {
  const s = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T19:00:00Z", marketState: "OPEN",
    permission: PERM, previousClose: 100.123,
    bars: [bar("2026-09-11T12:00:00Z", 99), bar("2026-09-11T13:30:00Z", 100.5), bar("2026-09-11T13:35:00Z", 101),
           bar("2026-09-11T18:55:00Z", 102.126), bar("2026-09-11T20:05:00Z", 103), bar("2026-09-10T18:00:00Z", 50)] });
  assert.deepEqual(s.points, [["09:30", 100.5], ["09:35", 101], ["14:55", 102.13]]);
  assert.deepEqual(s.extended.pre, [["08:00", 99]]);
  assert.deepEqual(s.extended.after, [["16:05", 103]]);
  assert.equal(s.discardedBars, 1, "die Bar vom Vortag fliegt raus");
  assert.equal(s.asOf, "2026-09-11T20:05:00.000Z");
  assert.equal(s.asOfLocal, "16:05");
  assert.equal(s.previousClose, 100.12);
  assert.equal(s.regularComplete, false);
  assert.equal(s.isLive, false);
  assert.equal(s.isDelayed, true);
  assert.equal(s.publishable, true);
  assert.equal(Snap.validate(s).ok, true, Snap.validate(s).findings.join(", "));
});

test("IS2 · Nichts wird erfunden: keine Bars, kein Chart", () => {
  const s = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T19:00:00Z", permission: PERM, bars: [] });
  assert.equal(s.points.length, 0);
  assert.equal(s.publishable, false);
  assert.equal(Snap.validate(s).ok, false);
  const einer = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T19:00:00Z", permission: PERM,
                             bars: [bar("2026-09-11T13:30:00Z", 100)] });
  assert.equal(einer.publishable, false, "ein Punkt ist keine Linie");
});

test("IS3 · Abgeschlossen ist unveraenderlich, laufend waechst nur", () => {
  const alt = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T15:00:00Z", permission: PERM,
    bars: [bar("2026-09-11T13:30:00Z", 100), bar("2026-09-11T13:35:00Z", 101), bar("2026-09-11T13:40:00Z", 102)] });
  const weniger = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T15:05:00Z", permission: PERM,
    bars: [bar("2026-09-11T13:30:00Z", 100), bar("2026-09-11T13:35:00Z", 101)] });
  assert.equal(Snap.merge(alt, weniger).reason, "fewerPoints");
  const mehr = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T15:10:00Z", permission: PERM,
    bars: [bar("2026-09-11T13:30:00Z", 100), bar("2026-09-11T13:35:00Z", 101), bar("2026-09-11T13:40:00Z", 102),
           bar("2026-09-11T13:45:00Z", 103)] });
  assert.equal(Snap.merge(alt, mehr).reason, "grown");
  /* NACH SCHLUSS GEHOLT IST NICHT DASSELBE WIE VOLLSTAENDIG
     Owner-Regel vom 19.09.2026: `regularComplete = now >= close` ist
     verboten. Diese Reihe endet um 09:45 New York - sie wurde nach
     Schluss geholt, deckt aber den letzten Slot (15:55) nicht ab. Sie
     ist damit unveraenderlich, aber NICHT vollstaendig; ein Etikett
     darf hier keinen Schluss um 16:00 behaupten. */
  const fertig = Snap.build({ security: SEC, session: SESSION, now: "2026-09-12T01:00:00Z", permission: PERM,
    bars: mehr.points.map((p, i) => bar("2026-09-11T13:" + (30 + i * 5) + ":00Z", p[1])) });
  assert.equal(fertig.fetchedAfterClose, true, "nach Schluss geholt");
  assert.equal(fertig.coversFinalSlot, false, "deckt 15:55 nicht ab");
  assert.equal(fertig.regularComplete, false, "also nicht vollstaendig");
  assert.equal(fertig.lastRegularLocal, "09:45");
  assert.equal(fertig.finalSlotLocal, "15:55");
  assert.equal(fertig.isComplete, true);
  /* Unveraenderlich bleibt es trotzdem - es kann nichts mehr kommen. */
  assert.equal(Snap.merge(fertig, mehr).reason, "immutable");
  assert.equal(Snap.merge(fertig, mehr).chosen, fertig);

  /* Die Gegenprobe: eine Reihe, die den letzten Slot WIRKLICH erreicht,
     ist vollstaendig. Ohne sie wuerde der Test nur beweisen, dass
     regularComplete nie true wird. */
  const bisSchluss = [];
  for (let m = 13 * 60 + 30; m <= 19 * 60 + 55; m += 5) {
    bisSchluss.push(bar("2026-09-11T" + String(Math.floor(m / 60)).padStart(2, "0") + ":" +
                        String(m % 60).padStart(2, "0") + ":00Z", 100 + (m % 7)));
  }
  const voll = Snap.build({ security: SEC, session: SESSION, now: "2026-09-12T01:00:00Z",
                            permission: PERM, bars: bisSchluss });
  assert.equal(voll.lastRegularLocal, "15:55");
  assert.equal(voll.coversFinalSlot, true);
  assert.equal(voll.regularComplete, true, "bis zum letzten Slot = vollstaendig");
  const naechste = Object.assign({}, mehr, { sessionDate: "2026-09-14" });
  assert.equal(Snap.merge(fertig, naechste).reason, "newSession");
});

test("IS4 · validate lehnt Punkte ausserhalb der Sitzung, Unordnung und fehlende Grundlage ab", () => {
  const ok = Snap.build({ security: SEC, session: SESSION, now: "2026-09-11T19:00:00Z", permission: PERM,
    bars: [bar("2026-09-11T13:30:00Z", 100), bar("2026-09-11T13:35:00Z", 101)] });
  assert.equal(Snap.validate(ok).ok, true);
  assert.equal(Snap.validate(Object.assign({}, ok, { points: [["09:30", 100], ["16:00", 101]] })).ok, false);
  assert.equal(Snap.validate(Object.assign({}, ok, { points: [["09:35", 100], ["09:30", 101]] })).ok, false);
  assert.equal(Snap.validate(Object.assign({}, ok, { publishBasis: null })).ok, false);
  assert.equal(Snap.validate(Object.assign({}, ok, { dataMode: "mock" })).ok, false);
  assert.equal(Snap.cacheKey("ref_AAPL", "2026-09-11", "5min"), "ref_AAPL|2026-09-11|5min");
});

/* V4.1 §4: ein Zeitplan-Lauf kurz vor der Eroeffnung wartet auf sie. */
test("TS-W1 · 09:27 NY am Handelstag: der Lauf wartet bis eine Minute nach 09:30", () => {
  const x = r("2026-09-16T13:27:00Z");
  assert.equal(x.marketState, "PRE_MARKET");
  assert.equal(T.openWaitMs(x, Date.parse("2026-09-16T13:27:00Z"), 7), 4 * 60000);
});
test("TS-W2 · 09:15 NY: zu frueh, es wird nicht gewartet", () => {
  const x = r("2026-09-16T13:15:00Z");
  assert.equal(T.openWaitMs(x, Date.parse("2026-09-16T13:15:00Z"), 7), 0);
});
test("TS-W3 · offene Boerse, Nachboerse und Wochenende warten nie", () => {
  assert.equal(T.openWaitMs(r("2026-09-16T14:00:00Z"), Date.parse("2026-09-16T14:00:00Z"), 7), 0);
  assert.equal(T.openWaitMs(r("2026-09-16T21:00:00Z"), Date.parse("2026-09-16T21:00:00Z"), 7), 0);
  assert.equal(T.openWaitMs(r("2026-09-19T13:27:00Z"), Date.parse("2026-09-19T13:27:00Z"), 7), 0);
});
