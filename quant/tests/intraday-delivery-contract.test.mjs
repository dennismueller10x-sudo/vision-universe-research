/* =========================================================================
   DIE DREI FAELLE AUS §21, DIE SONST KEIN ZUHAUSE HAETTEN

   Der Auftrag vom 21.09.2026 nennt zwanzig Regressionsfaelle. Siebzehn
   davon liegen in pacemaker.test.mjs, delivery-watchdog.test.mjs und
   waker.test.mjs. Diese Datei traegt die drei uebrigen:

     Fall 7   die laufende Sitzung ist noch nicht verfuegbar
     Fall 16  Providerbudget
     Fall 17  Recovery-Trigger

   Fall 7 ist der wichtigste, weil er am 21.09. real eingetreten ist: um
   09:38 New Yorker Zeit lieferte der Anbieter fuer alle 527 angefragten
   Titel NULL regulaere Bars. Was ein System in dieser Lage tut, ist der
   Unterschied zwischen "ehrlich leer" und "erfunden".
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Snapshot = require(join(root, "quant", "engines", "realtime", "intraday-snapshot.js"));
const Tiingo = require(join(root, "providers", "tiingo", "adapter.js"));

const SITZUNG = {
  sessionDate: "2026-09-21", kind: "current", isRunning: true, isComplete: false,
  /* open/close als ISO-Zeichenketten: der Bauer liest sie mit
     Date.parse. Mein erster Anlauf gab Millisekunden - Date.parse(Zahl)
     ergibt NaN, und dann faellt JEDE Bar aus dem Fenster. ID-2 hat
     genau das gefangen; ohne die Gegenprobe haette ID-1 bestanden,
     weil der Bauer nie etwas erzeugt haette. */
  open: "2026-09-21T13:30:00.000Z", close: "2026-09-21T20:00:00.000Z",
  preOpen: "2026-09-21T08:00:00.000Z", afterClose: "2026-09-22T00:00:00.000Z",
  openLocal: "09:30", closeLocal: "16:00", earlyClose: false, hasStarted: true
};

function baue(bars, jetzt) {
  return Snapshot.build({
    security: { securityId: "ref_AAPL", ticker: "AAPL" },
    bars: bars, session: SITZUNG, now: new Date(jetzt),
    marketState: "OPEN", provider: "tiingo", venue: "IEX", interval: "5min",
    previousClose: 337.00, permission: { allowed: true, basis: "Test" },
    delayMinutes: 5
  });
}

/* ================================================================ Fall 7
   Die Sitzung laeuft, der Anbieter hat noch nichts.
   ==================================================================== */

test("ID-1 keine Bars bei offener Sitzung: nicht veroeffentlichbar, nichts erfunden", () => {
  /* Der reale Fall vom 21.09.2026, 09:38 New York: 527 Titel, 527
     Antworten, null regulaere Bars. Ein System, das hier einen Punkt
     erzeugt - aus dem Vortagesschluss, aus dem letzten bekannten Kurs,
     aus irgendetwas -, erfindet einen Handelstag. */
  const snap = baue([], Date.parse("2026-09-21T13:38:00Z"));
  assert.equal(snap.publishable, false, "ohne Bars gibt es nichts zu veroeffentlichen");
  assert.ok(!snap.points || snap.points.length === 0, "kein einziger Punkt darf entstehen");
  /* Der Vortagesschluss darf als BEZUG mitgefuehrt werden - er ist eine
     Tatsache von gestern. Er darf nur nicht als Punkt von heute
     auftauchen. */
  if (snap.points && snap.points.length) {
    assert.fail("aus einem Vortagesschluss wurde ein heutiger Kurs");
  }
});

test("ID-2 Gegenprobe: mit echten Bars entsteht sehr wohl ein Snapshot", () => {
  /* Ohne diese Haelfte koennte ID-1 auch dann bestehen, wenn der
     Snapshot-Bauer generell nichts mehr erzeugt.
     ZWEI Bars, nicht eine: publishable verlangt regular.length >= 2 -
     aus einem einzelnen Punkt laesst sich kein Verlauf zeichnen. Mein
     erster Anlauf gab eine Bar und fiel darauf herein; die Gegenprobe
     hat dabei sich selbst gefunden. */
  const snap = baue([
    { date: "2026-09-21", timestamp: "2026-09-21T13:55:00.000Z",
      open: 336, high: 336.5, low: 335.8, close: 336.2, volume: 1000 },
    { date: "2026-09-21", timestamp: "2026-09-21T14:00:00.000Z",
      open: 336.2, high: 336.9, low: 336.0, close: 336.7, volume: 1200 }
  ], Date.parse("2026-09-21T14:06:00Z"));
  assert.equal(snap.publishable, true);
  assert.equal(snap.points.length, 2);
  assert.equal(snap.discardedBars, 0, "beide Bars liegen im Fenster");
});

test("ID-2b ein einzelner Punkt ist kein Verlauf", () => {
  /* Die Grenze selbst, damit sie nicht unbemerkt verrutscht. */
  const snap = baue([{ date: "2026-09-21", timestamp: "2026-09-21T13:55:00.000Z",
                       open: 336, high: 336.5, low: 335.8, close: 336.2, volume: 1000 }],
                    Date.parse("2026-09-21T14:01:00Z"));
  assert.equal(snap.points.length, 1, "der Punkt entsteht");
  assert.equal(snap.publishable, false, "veroeffentlicht wird er trotzdem nicht");
});

test("ID-3 eine noch nicht begonnene Sitzung traegt keinen Punkt", () => {
  const snap = baue([], Date.parse("2026-09-21T13:00:00Z"));   /* 09:00 NY */
  assert.equal(snap.publishable, false);
  assert.ok(!snap.regularComplete, "eine Sitzung ohne Bars ist nie abgeschlossen");
});

/* =============================================================== Fall 16
   Das Providerbudget wird nicht heimlich angehoben.
   ==================================================================== */

test("ID-4 die Drossel bleibt unsere Zahl, solange sie unsere Zahl ist", () => {
  const limits = Tiingo.commercialPlanCapabilities().limits;
  /* Die Kopplung ist der Punkt, nicht die Zahl. Wer die Drossel erhoeht,
     muss zugleich sagen, WORAUF er sich stuetzt. Bleibt die Herkunft
     SAFETY_CEILING und die Anbieterauskunft UNKNOWN, ist die Erhoehung
     eine Erfindung - und §7 des Auftrags verbietet sie.
     Stand 21.09.2026: verify-request-limits.mjs ergibt erneut
     PROVIDER_CONFIRMATION_REQUIRED. */
  const herkunft = limits.provenance || {};
  const anbieter = limits.providerObserved || {};
  if (herkunft.requestsPerMinute === "SAFETY_CEILING" && anbieter.status === "UNKNOWN") {
    assert.equal(limits.requestsPerMinute, 100,
      "Die Drossel wurde erhoeht, ohne dass sich die Herkunft geaendert hat. " +
      "Entweder liegt jetzt ein Beleg vor - dann gehoert er in provenance - " +
      "oder die Zahl ist erfunden.");
  }
  assert.equal(limits.verified, false,
    "verified: true braucht eine Anbieterauskunft, keine Gewoehnung");
});

test("ID-5 der belegte Nachweis wird nicht als Anbieterzusage ausgegeben", () => {
  const bericht = JSON.parse(readFileSync(
    join(root, "quant", "data", "market", "commercial", "request-limits.json"), "utf8"));
  const u = bericht.verdict || {};
  if (u.status === "UNKNOWN") {
    assert.equal(u.requestsPerHour, null,
      "ein UNKNOWN-Urteil darf keine Stundenzahl behaupten");
    assert.ok(u.classification === "PROVIDER_CONFIRMATION_REQUIRED");
    assert.ok(typeof u.lowerBound === "number",
      "die Untergrenze aus Beobachtung gehoert benannt");
    assert.ok(/Untergrenze|Beobachtung/i.test(u.lowerBoundNote || ""),
      "die Untergrenze muss sich selbst als Beobachtung bezeichnen");
  }
});

/* =============================================================== Fall 17
   Die Reparatur, die keinen Sturm ausloest.
   ==================================================================== */

const waechter = readFileSync(
  join(root, ".github", "workflows", "intraday-delivery-watchdog.yml"), "utf8");

test("ID-6 die Reparatur springt nur bei Taktbefunden an", () => {
  /* Ein zu alter Stand, weil der Anbieter nichts liefert, ist mit einem
     weiteren Abruf nicht zu heilen - dort waere Nachholen nur Verkehr.
     Der reale Fall: 09:38 und 09:46 je null Bars. Dreimal nachholen
     haette dreimal null ergeben. */
  for (const code of ["keinZyklus", "taktAusgefallen", "falscheSitzung"]) {
    assert.ok(waechter.includes("'" + code + "'"), code + " fehlt in der Reparaturbedingung");
  }
  for (const code of ["standZuAlt", "auslieferungZuWeitHinterher", "taktVerspaetet"]) {
    assert.ok(!new RegExp("contains\\(needs\\.pruefen\\.outputs\\.codes, '" + code + "'\\)").test(waechter),
              code + " darf keine Reparatur ausloesen");
  }
});

test("ID-7 die Reparatur teilt die Concurrency-Gruppe des Taktgebers", () => {
  /* Zwei Schreiber auf denselben Dateien waeren ein Wettlauf um
     denselben Ref. Die gemeinsame Gruppe macht das unmoeglich: laeuft
     ein Block, wartet die Reparatur. */
  const nachholen = waechter.slice(waechter.indexOf("  nachholen:"));
  assert.match(nachholen, /group:\s*intraday-pacemaker/,
               "ohne gemeinsame Gruppe schreiben Reparatur und Taktgeber gleichzeitig");
  assert.match(nachholen, /cancel-in-progress:\s*false/);
});

test("ID-8 die Reparatur prueft die Lage erneut, bevor sie holt", () => {
  /* Zwischen Urteil und Reparatur liegt eine Warteschlange. Meist hat
     sich die Lage bis dahin erledigt - ein Abruf auf Verdacht waere
     genau der Trigger-Sturm, den §17 verbietet. */
  const nachholen = waechter.slice(waechter.indexOf("  nachholen:"));
  assert.match(nachholen, /Ist die Lage noch dieselbe\?/);
  assert.match(nachholen, /if:\s*steps\.nochmal\.outputs\.verdict == 'FAIL'/);
});

test("ID-9 die Reparatur holt EINEN Zyklus, nicht einen ganzen Block", () => {
  assert.match(waechter, /run-pacemaker\.mjs --max-cycles=1/,
               "ein zweiter Block waere ein zweiter Taktgeber");
});

/* =========================================================== Vollstaendig
   Eine Liste, die sich selbst prueft.
   ==================================================================== */

test("ID-10 jeder der zwanzig Faelle aus §21 hat einen Test", () => {
  const dateien = {
    pacemaker: readFileSync(join(root, "quant", "tests", "pacemaker.test.mjs"), "utf8"),
    watchdog: readFileSync(join(root, "quant", "tests", "delivery-watchdog.test.mjs"), "utf8"),
    waker: readFileSync(join(root, "worker-waker", "tests", "waker.test.mjs"), "utf8"),
    sourceState: readFileSync(join(root, "quant", "tests", "source-state.test.mjs"), "utf8"),
    hier: readFileSync(join(root, "quant", "tests", "intraday-delivery-contract.test.mjs"), "utf8")
  };
  /* Fall -> ein Testbezeichner, der ihn nachweislich abdeckt. Die
     Zuordnung steht hier und nicht in einer Tabelle im Bericht: eine
     Tabelle veraltet stillschweigend, dieser Test nicht. */
  const zuordnung = {
    1: ["pacemaker", "PM-6"], 2: ["pacemaker", "PM-14"], 3: ["waker", "WK-2"],
    4: ["pacemaker", "PM-15"], 5: ["pacemaker", "PM-7"], 6: ["pacemaker", "PM-1"],
    7: ["hier", "ID-1"], 8: ["watchdog", "WD-6"], 9: ["sourceState", "SS-"],
    10: ["sourceState", "SS-"], 11: ["pacemaker", "PM-2"], 12: ["pacemaker", "PM-2"],
    13: ["pacemaker", "PM-2"], 14: ["pacemaker", "PM-5"], 15: ["pacemaker", "PM-17"],
    16: ["hier", "ID-4"], 17: ["hier", "ID-6"], 18: ["pacemaker", "PM-10"],
    19: ["watchdog", "WD-9"], 20: ["watchdog", "WD-8"]
  };
  const fehlend = [];
  for (const [fall, [datei, kennung]] of Object.entries(zuordnung)) {
    if (!dateien[datei] || !dateien[datei].includes(kennung)) fehlend.push(fall + " (" + kennung + ")");
  }
  assert.deepEqual(fehlend, [], "Faelle ohne Test: " + fehlend.join(", "));
});
