/* =========================================================================
   Tests fuer realtime/free-budget.js

   Die Zusage, die geprueft wird: bevor eine Freigrenze faellt, faellt
   Realtime aus - kontrolliert, mit Grund, und rechtzeitig.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FB = require("../engines/realtime/free-budget.js");

const TAG = Date.UTC(2026, 8, 17, 14, 0, 0);      /* 10:00 New York, Sitzung laeuft */

function baue(over = {}) {
  let jetzt = over.startAt || TAG;
  let rest = over.rest === undefined ? 5.5 * 3600 : over.rest;   /* bis 16:00 */
  const urteile = [];
  const b = FB.create(Object.assign({
    now: () => jetzt,
    sessionRemainingSeconds: () => rest,
    onVerdict: (s) => urteile.push(s.verdict)
  }, over.opts));
  return {
    b, urteile,
    vor(ms) { jetzt += ms; },
    setzeRest(s) { rest = s; }
  };
}

test("FB-1 frisch ist alles frei, und die Quelle steht im Bericht", () => {
  const { b } = baue();
  const s = b.snapshot();
  assert.equal(s.verdict, "OK");
  assert.equal(s.limits.requestsPerDay, 100000);
  assert.equal(s.limits.usableRequestsPerDay, 90000);
  assert.equal(s.limits.durationGBsPerDay, 13000);
  assert.match(s.source, /cloudflare/i);
  assert.equal(b.realtimeAllowed(), true);
});

test("FB-2 zwanzig eingehende Nachrichten sind eine Anfrage", () => {
  const { b } = baue();
  b.noteProviderMessages(20);
  assert.equal(b.snapshot().used.requests, 1);
  b.noteProviderMessages(19);
  assert.equal(b.snapshot().used.requests, 2, "aufgerundet wird nach oben");
});

test("FB-3 Verbindungen und Wecker zaehlen einzeln, nicht im Verhaeltnis", () => {
  const { b } = baue();
  b.noteConnection(5);
  b.noteAlarm(3);
  assert.equal(b.snapshot().used.requests, 8);
});

test("FB-4 WARNING bei siebzig Prozent, PROTECT bei fuenfundachtzig", () => {
  const { b, urteile } = baue();
  /* 90.000 nutzbare Anfragen: 70 % sind 63.000, 85 % sind 76.500. */
  b.noteProviderMessages(20 * 62000);
  assert.equal(b.verdict(), "OK");
  b.noteProviderMessages(20 * 2000);
  assert.equal(b.verdict(), "WARNING");
  b.noteProviderMessages(20 * 14000);
  assert.equal(b.verdict(), "PROTECT");
  assert.equal(b.realtimeAllowed(), false, "im Schutzmodus laeuft Realtime weiter");
  assert.deepEqual(urteile, ["WARNING", "PROTECT"]);
});

test("FB-5 ueber der Grenze heisst EXHAUSTED, nicht 'ein bisschen teurer'", () => {
  const { b } = baue();
  b.noteProviderMessages(20 * 95000);
  assert.equal(b.verdict(), "EXHAUSTED");
  assert.equal(b.realtimeAllowed(), false);
});

test("FB-6 gerechnet wird vorher: ein Symbol kostet bis zum Handelsschluss", () => {
  const { b } = baue({ rest: 5.5 * 3600 });
  /* Ein Symbol, 0,85 Ereignisse je Sekunde, 19.800 Sekunden Rest:
     16.830 Nachrichten = 842 Anfragen.

     0,85 ist der am 17.09.2026 gemessene Durchschnitt eines Korbes aus
     50 liquiden Titeln (0,34) mit dem Faktor 2,5 - nicht mehr die
     Einzelspitze von 1,7, die auf alle Titel angewandt den 40. von 50
     abgelehnt hat, waehrend der echte Verbrauch bei 0,1 Prozent lag. */
  const f = b.forecast(1);
  assert.equal(f.remainingSeconds, 19800);
  assert.equal(f.projectedMessages, 16830);
  assert.equal(f.projectedRequests, 842);
  assert.equal(f.verdict, "OK");
});

test("FB-7 mayAdd erlaubt das erste Symbol und lehnt ab, bevor die Grenze faellt", () => {
  const { b } = baue({ rest: 5.5 * 3600 });
  assert.equal(b.mayAdd("NVDA", 0).allow, true);

  /* Die Grenze liegt bei fuenfeinhalb Stunden Rest rechnerisch beim
     91. Titel: 91 x 0,85 x 19.800 / 20 = 76.598 von 90.000 nutzbaren
     Anfragen, also ueber 85 Prozent. Der 90. geht noch. */
  assert.equal(b.mayAdd("NEU", 89).allow, true, "der 90. Titel wurde zu frueh abgelehnt");
  const viele = b.mayAdd("NEU", 90);
  assert.equal(viele.allow, false);
  assert.equal(viele.reason, "budgetProtect");
  assert.equal(viele.projection.symbols, 91);

  /* Und die Zahl, auf die es im Betrieb ankommt: fuenfzig gleichzeitig
     betrachtete Titel - die harte Obergrenze des Objekts - passen
     bequem. Genau das hat die alte Annahme verhindert. */
  assert.equal(b.mayAdd("NEU", 49).allow, true, "fuenfzig Titel muessen durchgehen");
  assert.equal(b.forecast(50).requestShare < 0.6, true,
    "fuenfzig Titel verbrauchen " + Math.round(b.forecast(50).requestShare * 100) + " % der Anfragen");
});

test("FB-8 kurz vor Handelsschluss ist mehr erlaubt als am Morgen", () => {
  /* Bei 23.040 Sekunden Rest liegt die Schutzschwelle rechnerisch beim
     79. Titel: 79 x 0,85 x 23.040 / 20 = 77.357 von 90.000 nutzbaren
     Anfragen. Zehn Minuten vor Schluss dagegen kostet derselbe Titel
     fast nichts mehr - die Restzeit ist der Faktor, nicht die Zahl. */
  const morgens = baue({ rest: 6.4 * 3600 });
  const abends = baue({ rest: 600 });
  assert.equal(morgens.b.mayAdd("X", 78).allow, false, "morgens wurde zu viel erlaubt");
  assert.equal(abends.b.mayAdd("X", 200).allow, true, "abends wurde zu wenig erlaubt");
  /* Und der Gegenbeweis, dass die Grenze nicht willkuerlich frueh liegt. */
  assert.equal(morgens.b.mayAdd("X", 50).allow, true, "morgens wurde zu frueh abgelehnt");
});

test("FB-9 die Laufzeit hat ihre eigene Grenze", () => {
  const { b } = baue();
  /* 13.000 GB-s bei 0,128 GB sind 101.562 Sekunden Laufzeit. Gewarnt
     wird ab 71.094 Sekunden, geschuetzt ab 86.328 - weit mehr als eine
     Sitzung, aber endlich. */
  b.noteActiveSeconds(70000);
  assert.equal(b.verdict(), "OK");
  b.noteActiveSeconds(2000);
  assert.equal(b.verdict(), "WARNING");
  b.noteActiveSeconds(15000);
  assert.equal(b.verdict(), "PROTECT");
  const s = b.snapshot();
  assert.equal(s.used.durationGBs, Math.round(0.128 * 87000));
});

test("FB-10 eine ganze Sitzung mit einem Objekt bleibt deutlich im Freibetrag", () => {
  const { b } = baue();
  b.noteActiveSeconds(6.5 * 3600);
  const s = b.snapshot();
  assert.equal(s.used.durationGBs, 2995);
  assert.equal(s.share.duration < 0.24, true,
    "eine Sitzung verbraucht " + Math.round(s.share.duration * 100) + " % der Laufzeit");
  assert.equal(s.verdict, "OK");
});

test("FB-11 fuenf betrachtete Titel sind eine ganze Sitzung lang unauffaellig", () => {
  const { b } = baue({ rest: 6.5 * 3600 });
  const f = b.forecast(5);
  assert.equal(f.verdict, "OK");
  assert.equal(f.requestShare < 0.25, true,
    "fuenf Titel verbrauchen " + Math.round(f.requestShare * 100) + " % der Anfragen");
});

test("FB-12 der Tag wechselt um Mitternacht UTC und setzt alles zurueck", () => {
  const h = baue({ startAt: Date.UTC(2026, 8, 17, 23, 0, 0) });
  h.b.noteProviderMessages(20 * 80000);
  assert.equal(h.b.verdict(), "PROTECT");
  h.vor(2 * 3600 * 1000);                     /* 01:00 UTC am Folgetag */
  assert.equal(h.b.verdict(), "OK", "der Tageswechsel setzt den Verbrauch nicht zurueck");
  assert.equal(h.b.snapshot().used.requests, 0);
  assert.equal(h.b.snapshot().day, "2026-09-18");
});

test("FB-13 Spitzenwerte werden gemerkt, auch wenn sie wieder fallen", () => {
  const { b } = baue();
  b.noteSymbols(12); b.noteClients(40);
  b.noteSymbols(3); b.noteClients(5);
  const s = b.snapshot();
  assert.equal(s.used.peakSymbols, 12);
  assert.equal(s.used.peakClients, 40);
});

test("FB-14 die Annahme je Symbol ist gemessen, und zwar am richtigen Gegenstand", () => {
  /* Zwei Messungen, und die Unterscheidung ist der ganze Punkt:

       1,7   die Spitze EINES Titels im ganzen Band (XLK, 16.09.2026)
       0,34  der Durchschnitt von 50 ABONNIERTEN Titeln (17.09.2026)

     Gerechnet wird mit dem Durchschnitt mal 2,5 - deutlich ueber der
     Messung, immer noch unter der Einzelspitze. Die Spitze auf jeden
     Titel anzuwenden hiess, den lebhaftesten Titel des Marktes fuer den
     Normalfall zu halten. */
  assert.equal(FB.MEASURED_MAX_EVENTS_PER_SECOND, 1.7, "die Einzelspitze bleibt dokumentiert");
  assert.equal(FB.MEASURED_BASKET_EVENTS_PER_SECOND, 0.34);
  assert.equal(FB.DEFAULT_ASSUMED_EVENTS_PER_SECOND, 0.85);
  assert.equal(FB.DEFAULT_ASSUMED_EVENTS_PER_SECOND < FB.MEASURED_MAX_EVENTS_PER_SECOND, true,
    "die Annahme darf die Einzelspitze nicht ueberschreiten");
  assert.equal(FB.DEFAULT_ASSUMED_EVENTS_PER_SECOND > FB.MEASURED_BASKET_EVENTS_PER_SECOND * 2, true,
    "und sie muss deutlich ueber dem gemessenen Durchschnitt liegen");
  const { b } = baue();
  assert.equal(b.snapshot().assumedEventsPerSecondPerSymbol, 0.85);
});

test("FB-17 die Schwellen haengen am gezaehlten Verbrauch, nicht an der Annahme", () => {
  /* Der Grund, warum eine weniger pessimistische Annahme sicher bleibt:
     WARNING und PROTECT entstehen aus dem, was tatsaechlich
     durchgelaufen ist. Waere die Annahme zu niedrig, kaemen ein paar
     Titel mehr herein - und die Schwellen griffen trotzdem. */
  const { b, urteile } = baue({ opts: { assumedEventsPerSecond: 0.001 } });
  assert.equal(b.snapshot().assumedEventsPerSecondPerSymbol, 0.001);
  assert.equal(b.mayAdd("X", 400).allow, true, "mit winziger Annahme kommt alles herein");
  b.noteProviderMessages(20 * 64000);
  assert.equal(b.verdict(), "WARNING", "die Warnung kommt aus dem echten Verbrauch");
  b.noteProviderMessages(20 * 14000);
  assert.equal(b.verdict(), "PROTECT");
  assert.equal(b.mayAdd("Y", 1).allow, false, "und dann kommt nichts mehr herein");
  assert.deepEqual(urteile, ["WARNING", "PROTECT"]);
});

test("FB-15 ein leeres Restfenster verlangt keine Vorausschau", () => {
  const { b } = baue({ rest: 0 });
  const f = b.forecast(50);
  assert.equal(f.projectedMessages, 0);
  assert.equal(b.mayAdd("X", 49).allow, true, "bei geschlossener Boerse wird grundlos abgelehnt");
});

test("FB-16 die Annahme hinter der Reserve steht im Bericht, nicht in einem Kommentar", () => {
  /* Owner-Entscheidung vom 17.09.2026: der andere Worker im selben
     Konto wird durch die Reserve abgedeckt, sein Verbrauch wird nicht
     gemessen. Eine Annahme, die nur im Quelltext steht, ist beim
     naechsten Zwischenfall nicht auffindbar - deshalb faehrt jeder
     Schnappschuss sie mit. */
  const { b } = baue();
  const r = b.snapshot().reserveRationale;
  assert.equal(r.accountWideLimits, true, "die Freigrenzen gelten je Konto, nicht je Worker");
  assert.equal(r.otherWorkersMeasured, false, "es waere gemessen oder es ist es nicht");
  assert.equal(r.covers.some((x) => /anderen Workers/.test(x)), true);
  assert.match(r.risk, /Rueckfall auf den\s+Snapshot-Pfad|Snapshot-Pfad/);
  assert.match(r.risk, /keine Rechnung/,
    "der Ausgang ist ein Ausfall, kein Kostenfall - und das muss dastehen");
  assert.equal(b.snapshot().limits.reserveRequests, FB.DEFAULT_RESERVE_REQUESTS);
});
