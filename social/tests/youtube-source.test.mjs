/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/youtube-source.test.mjs

   ZWEI TOEPFE, UND SIE DUERFEN SICH NIE BERUEHREN

   Diese Datei hat einmal das Gegenteil geprueft. Sie verlangte, dass
   `search.list` 100 Einheiten aus einem gemeinsamen Topf von 10.000
   kostet - das Modell, das bis zum 2026-06-01 galt. Die Tests waren
   gruen, die Annahme war falsch, und gruene Tests auf einer falschen
   Annahme sind schlimmer als keine: sie halten sie fest.

   Seit Juni 2026 gilt:

     SUCHE       100 Aufrufe je Tag, eigener Topf, je 1
     ALLGEMEIN   10.000 Einheiten je Tag, alles andere, je 1

   Die Knappheit ist damit eine ANZAHL und kein Preis - und die Tests
   halten fest, dass die beiden Waehrungen nirgends addiert werden.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Y = require("../engines/youtube-source.js");

/* ------------------------------------------------------- Das Modell selbst */

test("YS1 · Suche und Allgemeines sind zwei Toepfe mit zwei Waehrungen", () => {
  const s = Y.KONTINGENT.buckets.search;
  const g = Y.KONTINGENT.buckets.general;
  assert.equal(s.unit, "calls");
  assert.equal(s.dailyLimit, 100);
  assert.equal(s.costPerCall, 1);
  assert.equal(g.unit, "units");
  assert.equal(g.dailyLimit, 10000);
  /* Der Unterschied der Einheiten ist der ganze Punkt: wer beide als
     "Units" fuehrt, addiert sie irgendwann. */
  assert.notEqual(s.unit, g.unit);
});

test("YS2 · Das alte Modell ist als ueberholt vermerkt, nicht geloescht", () => {
  /* Eine stillschweigend korrigierte Annahme laesst sich spaeter nicht
     von einer nie getroffenen unterscheiden. */
  assert.equal(Y.KONTINGENT.modelValidFrom, "2026-06-01");
  assert.match(Y.KONTINGENT.verification.supersededModel, /100 Einheiten/);
});

test("YS3 · search.list kostet 1 im Suchtopf und NICHTS im allgemeinen", () => {
  const k = Y.kosten({ "search.list": 8 });
  assert.equal(k.search, 8);
  assert.equal(k.general, 0,
    "Seit Juni 2026 zieht die Suche nichts mehr aus dem allgemeinen Topf");
});

test("YS4 · Detailabrufe kosten 1 im allgemeinen Topf und nichts im Suchtopf", () => {
  const k = Y.kosten({ "videos.list": 50, "channels.list": 30, "playlistItems.list": 20 });
  assert.equal(k.general, 100);
  assert.equal(k.search, 0);
});

test("YS5 · Die Kosten kommen nie als eine Zahl zurueck", () => {
  /* Eine Summe ueber beide Toepfe waere eine Zahl ohne Bedeutung:
     Aufrufe und Einheiten haben keinen Kurs zueinander. */
  const k = Y.kosten({ "search.list": 1, "videos.list": 1 });
  assert.equal(typeof k.search, "number");
  assert.equal(typeof k.general, "number");
  assert.equal(k.total, undefined);
});

test("YS6 · Eine unbekannte Methode kostet mindestens eine Einheit — im allgemeinen Topf", () => {
  /* Unbekannt darf nicht "gratis" heissen. Und sie darf nicht in den
     Suchtopf: nur Suche und Upload haben eigene. */
  const k = Y.kosten({ "irgendwas.list": 7 });
  assert.equal(k.general, 7);
  assert.equal(k.search, 0);
  assert.deepEqual(k.unknownMethods, ["irgendwas.list"]);
});

/* ------------------------------------------------------------ Der Tagesplan */

test("YS7 · Der Plan haelt BEIDE Grenzen ein und prueft sie einzeln", () => {
  const p = Y.tagesplan({});
  assert.equal(p.withinSearchQuota, true);
  assert.equal(p.withinGeneralQuota, true);
  assert.equal(p.withinQuota, true);
  /* Einzeln, damit erkennbar bleibt, welche der beiden reissen wuerde. */
  assert.equal(typeof p.withinSearchQuota, "boolean");
  assert.equal(typeof p.withinGeneralQuota, "boolean");
});

test("YS8 · Die Reserve im Suchtopf bleibt uebrig", () => {
  /* Der Auftrag ist ausdruecklich: nicht alle hundert Aufrufe fest
     verplanen. Was zurueckbleibt, ist fuer neue Themen, Ereignisse und
     Nachfassen da - also fuer alles, was sich vorher nicht
     aufschreiben laesst. */
  const p = Y.tagesplan({ searches: 100, reserveSearchCalls: 30 });
  assert.ok(p.search.planned <= 70);
  assert.equal(p.search.reserve, 30);
});

test("YS9 · Mehr Suchen verlangen als erlaubt erhoeht nichts", () => {
  const p = Y.tagesplan({ searches: 500 });
  assert.ok(p.search.planned <= Y.KONTINGENT.buckets.search.dailyLimit);
  assert.equal(p.withinSearchQuota, true);
});

test("YS10 · Ein hoeheres Tageslimit als das offizielle wird nicht geglaubt", () => {
  const p = Y.tagesplan({ dailySearchCalls: 5000, dailyUnits: 999999 });
  assert.equal(p.search.dailyLimit, 100);
  assert.equal(p.general.dailyLimit, 10000);
});

test("YS11 · Verbrauchte Suchen verkleinern den Plan", () => {
  const voll = Y.tagesplan({});
  const fast = Y.tagesplan({ searchCallsUsedToday: 95 });
  assert.equal(fast.search.free, 5);
  assert.ok(fast.search.planned < voll.search.planned);
});

test("YS12 · Ein leerer Suchtopf plant keine Suche, auch bei vollem allgemeinen Topf", () => {
  /* Der Fall, der das ganze Modell erklaert: neuntausend freie
     Einheiten helfen nicht, wenn die hundertste Suche gelaufen ist. */
  const p = Y.tagesplan({ searchCallsUsedToday: 100, unitsUsedToday: 1000 });
  assert.equal(p.search.free, 0);
  assert.equal(p.search.planned, 0);
  assert.ok(p.general.free > 0, "Der allgemeine Topf ist davon unberuehrt");
  assert.match(p.explanation, /403 quotaExceeded/);
});

test("YS13 · Ein leerer allgemeiner Topf verhindert keine Suche", () => {
  /* Die Gegenprobe zur Unabhaengigkeit - in die andere Richtung. */
  const p = Y.tagesplan({ unitsUsedToday: 10000 });
  assert.equal(p.general.free, 0);
  assert.ok(p.search.planned > 0);
  assert.equal(p.withinSearchQuota, true);
});

/* ------------------------------------------- Kein Schluessel ist kein Fehler */

test("YS14 · Ohne Schluessel wartet die Quelle auf den Owner — einmalig", () => {
  const c = Y.capability({});
  assert.equal(c.state, "AWAITING_OWNER_SOURCE");
  assert.equal(c.ownerStepRequired.secretName, "YOUTUBE_API_KEY");
  assert.equal(c.ownerStepRequired.oneTime, true);
  assert.match(c.explanation, /kein Fehler/);
});

test("YS15 · Der freigegebene Pfad verlangt keine Zahlungsmethode", () => {
  /* Steht ausdruecklich in den Daten, damit niemand vorsichtshalber
     Billing einschaltet - das waere eine Kostenentscheidung ohne
     Anlass. */
  assert.equal(Y.capability({ apiKey: "x" }).billingRequired, false);
  assert.equal(Y.capability({ apiKey: "x" }).cost, 0);
  assert.equal(Y.KONTINGENT.buckets.search.purchasable, false);
  assert.equal(Y.KONTINGENT.purchasable, false);
});

/* ------------------------------------- Die Annahme kennt ihre eigene Herkunft */

test("YS16 · Die Primaerquelle bleibt als unerreichbar vermerkt", () => {
  const v = Y.KONTINGENT.verification;
  assert.equal(v.primarySourceRead, false);
  assert.match(v.blockedBy, /PRIMARY_SOURCE_UNREACHABLE_FROM_THIS_ENVIRONMENT/);
});

test("YS17 · Solange die Primaerquelle ungelesen ist, bleibt die Pruefung faellig", () => {
  /* Genau dieser Weg hat das alte Modell neun Monate ueberleben
     lassen. Alter verjaehrt, eine nie gelesene Quelle nicht. */
  const heute = Y.pruefungFaellig({ now: Y.KONTINGENT.verifiedAt });
  assert.equal(heute.ageDays, 0);
  assert.equal(heute.due, true);
  assert.ok(heute.reasons.some((r) => /Primaerquelle/.test(r)));
});

test("YS18 · Der Zustand der Quelle traegt die faellige Pruefung mit", () => {
  const c = Y.capability({ apiKey: "x" });
  assert.equal(c.state, "READY");
  assert.equal(c.quotaCheck.due, true);
});

test("YS19 · Dieses Modul ruft nichts auf", () => {
  const quelle = Object.keys(Y).join(" ");
  assert.equal(/fetch|request|http/i.test(quelle), false);
  assert.deepEqual(Object.keys(Y).sort(),
    ["KONTINGENT", "STATE", "capability", "kosten", "pruefungFaellig", "tagesplan"]);
});
