/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/youtube-source.test.mjs

   EIN KONTINGENT, DAS MAN NICHT KAUFEN KANN, IST EINE ARCHITEKTUR

   10.000 Einheiten am Tag. Eine Suche kostet 100, ein Detailabruf 1.
   Wer das uebersieht, verbraucht den Tag mit hundert Suchen und weiss
   ueber die Treffer nichts.

   Diese Tests halten drei Dinge fest:

     1. Die Rechnung stimmt und haelt das Kontingent ein — auch wenn
        jemand mehr verlangt, als da ist.
     2. Kein Schluessel ist ein OWNER-SCHRITT und kein Fehler.
     3. Die Kontingentannahme weiss, dass sie ungeprueft ist. Sie wurde
        an Sekundaerquellen bestaetigt, nicht an der Primaerquelle
        gelesen — der Proxy laesst developers.google.com nicht durch.
        Eine Annahme, die sich fuer geprueft haelt, ist gefaehrlicher
        als eine, die fehlt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Y = require("../engines/youtube-source.js");

/* ------------------------------------------------------------ Die Rechnung */

test("YS1 · Die Kosten folgen den Methodenpreisen, nicht der Anzahl", () => {
  /* Eine Suche kostet so viel wie hundert Detailabrufe. Genau das ist
     der Grund fuer die ganze Form der Nutzung. */
  assert.equal(Y.kosten({ "search.list": 1 }), 100);
  assert.equal(Y.kosten({ "videos.list": 100 }), 100);
  assert.equal(Y.kosten({ "search.list": 2, "videos.list": 50 }), 250);
});

test("YS2 · Eine unbekannte Methode kostet mindestens eine Einheit", () => {
  /* Unbekannt darf nicht "gratis" heissen. Auch eine fehlerhafte
     Anfrage wird berechnet — die Schaetzung muss nach oben irren. */
  assert.equal(Y.kosten({ "irgendwas.list": 7 }), 7);
  assert.equal(Y.KONTINGENT.minimumChargePerRequest, 1);
});

test("YS3 · Der Tagesplan bleibt im Kontingent", () => {
  const p = Y.tagesplan({});
  assert.equal(p.withinQuota, true);
  assert.ok(p.estimatedCost <= p.free);
  assert.equal(p.estimatedCost, Y.kosten(p.calls));
});

test("YS4 · Mehr verlangen als da ist, erhoeht nichts", () => {
  /* Der Plan gibt zurueck, was moeglich ist - nicht, was gewuenscht
     wurde. Hundert Suchen waeren das ganze Tagesbudget. */
  const p = Y.tagesplan({ searches: 100 });
  assert.ok(p.calls["search.list"] <= 100);
  assert.equal(p.withinQuota, true);
  assert.ok(p.estimatedCost <= Y.KONTINGENT.dailyUnits);
});

test("YS5 · Ein hoeheres Tagesbudget als das offizielle wird nicht geglaubt", () => {
  /* Wuensche sind kein Kontingent. Wer 50.000 einsetzt, bekommt
     10.000 - sonst plante das Modul einen Tag, den es nicht gibt. */
  const p = Y.tagesplan({ dailyUnits: 50000 });
  assert.equal(p.dailyUnits, Y.KONTINGENT.dailyUnits);
});

test("YS6 · Die Reserve bleibt uebrig, damit der Tag reagieren kann", () => {
  /* Dieselbe Ueberlegung wie beim Hashtag-Budget: ein Kontingent, das
     mittags leer ist, kann auf nichts mehr reagieren. */
  const p = Y.tagesplan({ reserveUnits: 2000 });
  assert.ok(p.free - p.estimatedCost >= 2000 - 1,
    "Nach dem Plan muss die Reserve noch da sein");
});

test("YS7 · Verbrauchtes Kontingent verkleinert den Plan", () => {
  const voll = Y.tagesplan({});
  const fast = Y.tagesplan({ usedToday: 9500 });
  assert.ok(fast.estimatedCost < voll.estimatedCost);
  assert.equal(fast.withinQuota, true);
  assert.equal(fast.free, 500);
});

test("YS8 · Ein leeres Kontingent plant nichts, statt zu ueberziehen", () => {
  const leer = Y.tagesplan({ usedToday: 10000 });
  assert.equal(leer.free, 0);
  assert.equal(leer.estimatedCost, 0);
  assert.equal(leer.withinQuota, true);
});

/* ------------------------------------------------- Kein Schluessel ist kein Fehler */

test("YS9 · Ohne Schluessel wartet die Quelle auf den Owner", () => {
  const c = Y.capability({});
  assert.equal(c.state, "AWAITING_OWNER_SOURCE");
  assert.equal(c.ownerStepRequired.secretName, "YOUTUBE_API_KEY");
  /* Der Zustand darf nicht nach Defekt klingen. */
  assert.match(c.explanation, /kein Fehler/);
});

test("YS10 · Die Quelle ist offiziell und kostenlos — und das Kontingent unverkaeuflich", () => {
  const c = Y.capability({ apiKey: "x" });
  assert.equal(c.state, "READY");
  assert.equal(c.official, true);
  assert.equal(c.cost, 0);
  /* §2: keine kostenpflichtige Quota-Erweiterung ohne neues Owner-Gate.
     Hier ist sie nicht einmal kaufbar - das gehoert in die Daten. */
  assert.equal(c.quota.purchasable, false);
});

/* ------------------------------------- Die Annahme kennt ihre eigene Herkunft */

test("YS11 · Die Kontingentannahme gibt sich nicht als Primaerquelle aus", () => {
  const v = Y.KONTINGENT.verification;
  assert.equal(v.primarySourceRead, false);
  assert.match(v.primarySource, /developers\.google\.com/);
  assert.match(v.blockedBy, /EGRESS_BLOCKED/);
});

test("YS12 · Solange die Primaerquelle ungelesen ist, bleibt die Pruefung faellig", () => {
  /* Alter verjaehrt, eine nie gelesene Quelle nicht. Auch am Tag der
     Eintragung ist die Pruefung offen. */
  const heute = Y.pruefungFaellig({ now: Y.KONTINGENT.verifiedAt });
  assert.equal(heute.ageDays, 0);
  assert.equal(heute.due, true);
  assert.ok(heute.reasons.some((r) => /Primaerquelle/.test(r)));
});

test("YS13 · Alter ist ein zweiter, eigener Grund", () => {
  const alt = Y.pruefungFaellig({ now: "2026-12-31T00:00:00Z" });
  assert.equal(alt.due, true);
  assert.equal(alt.reasons.length, 2, "Beide Gruende werden genannt, nicht nur der erste");
  assert.ok(alt.ageDays > 30);
});

test("YS14 · Der Zustand der Quelle traegt die faellige Pruefung mit", () => {
  /* Ein Schluessel allein macht die Quelle nicht benutzbar. Wer nur auf
     state === READY schaut, verbraucht Kontingent nach einer Annahme,
     die niemand belegt hat. */
  const c = Y.capability({ apiKey: "x" });
  assert.equal(c.state, "READY");
  assert.equal(c.quotaCheck.due, true);
});

test("YS15 · Dieses Modul ruft nichts auf", () => {
  /* Die Trennung ist die Zusicherung: planen und rechnen hier, aufrufen
     erst nach dem Owner-Schritt. Ein Netzaufruf haette Kontingent
     verbraucht, bevor irgendjemand zugestimmt hat. */
  const quelle = Object.keys(Y).join(" ");
  assert.equal(/fetch|request|http/i.test(quelle), false);
  assert.deepEqual(Object.keys(Y).sort(),
    ["KONTINGENT", "STATE", "capability", "kosten", "pruefungFaellig", "tagesplan"]);
});
