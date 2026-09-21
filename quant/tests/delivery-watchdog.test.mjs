/* =========================================================================
   DER WAECHTER AUF DEM PRUEFSTAND

   Der Auftrag nennt einen Fall, der FAIL sein MUSS: Markt offen, letzter
   Snapshot Freitag, heute Montag. Er steht hier an erster Stelle, weil er
   der Grund fuer diesen Waechter ist - und weil eine Pruefung, die genau
   ihren Anlassfall nicht faengt, keine ist.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Watchdog = require(join(root, "quant", "engines", "realtime", "delivery-watchdog.js"));

const MIN = 60000;
const JETZT = Date.parse("2026-09-21T14:00:00Z");      /* Montag, 10:00 NY */
const HEUTE = "2026-09-21";
const FREITAG = "2026-09-18";

const gesund = (over) => Object.assign({
  nowMs: JETZT,
  marketState: "OPEN",
  expectedSession: HEUTE,
  snapshot: { sessionDate: HEUTE, asOfMs: JETZT - 3 * MIN },
  delivered: { sessionDate: HEUTE, asOfMs: JETZT - 5 * MIN },
  lastCycle: { triggerAt: new Date(JETZT - 4 * MIN).toISOString(), ok: true, written: 480 },
  intervalMs: 5 * MIN
}, over || {});

const codes = (u) => u.findings.map((f) => f.code);

/* --- Der Anlassfall ---------------------------------------------------- */

test("WD-1 Markt offen + letzter Snapshot Freitag + heute Montag ist FAIL", () => {
  const u = Watchdog.beurteile(gesund({
    snapshot: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") },
    delivered: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") },
    lastCycle: { triggerAt: "2026-09-21T13:09:00Z", ok: true, written: 6 }
  }));
  assert.equal(u.verdict, "FAIL");
  assert.ok(codes(u).includes("falscheSitzung"), JSON.stringify(codes(u)));
});

test("WD-2 Gegenprobe: dieselbe Lage mit heutiger Sitzung ist PASS", () => {
  assert.equal(Watchdog.beurteile(gesund()).verdict, "PASS");
});

/* --- Fall 1/17: der Takt faellt aus ------------------------------------ */

test("WD-3 kein Taktzyklus bei offenem Markt ist FAIL", () => {
  const u = Watchdog.beurteile(gesund({ lastCycle: null }));
  assert.equal(u.verdict, "FAIL");
  assert.ok(codes(u).includes("keinZyklus"));
});

test("WD-4 ein ausgefallener Takt ist FAIL, ein verspaeteter nur WARNING", () => {
  const spaet = Watchdog.beurteile(gesund({
    lastCycle: { triggerAt: new Date(JETZT - 11 * MIN).toISOString(), ok: true, written: 480 },
    snapshot: { sessionDate: HEUTE, asOfMs: JETZT - 11 * MIN }
  }));
  assert.ok(codes(spaet).includes("taktVerspaetet"), JSON.stringify(codes(spaet)));

  const weg = Watchdog.beurteile(gesund({
    lastCycle: { triggerAt: new Date(JETZT - 64 * MIN).toISOString(), ok: true, written: 6 }
  }));
  assert.equal(weg.verdict, "FAIL");
  assert.ok(codes(weg).includes("taktAusgefallen"));
});

test("WD-5 ein fehlgeschlagener Zyklus wird benannt, auch wenn der Stand noch stimmt", () => {
  const u = Watchdog.beurteile(gesund({
    lastCycle: { triggerAt: new Date(JETZT - 4 * MIN).toISOString(), ok: false, written: null }
  }));
  assert.ok(codes(u).includes("zyklusFehlgeschlagen"));
  assert.equal(u.verdict, "WARNING");
});

/* --- Fall 8: der Stand ist zu alt -------------------------------------- */

test("WD-6 ein zu alter Stand ist FAIL, auch wenn der Takt laeuft", () => {
  /* Genau der Fall vom Sitzungsbeginn: der Takt lief, lieferte aber
     nichts (527 Titel, 0 Bars). Ein Waechter, der nur den Takt prueft,
     meldete hier PASS. */
  const u = Watchdog.beurteile(gesund({
    snapshot: { sessionDate: HEUTE, asOfMs: JETZT - 25 * MIN },
    delivered: { sessionDate: HEUTE, asOfMs: JETZT - 25 * MIN },
    lastCycle: { triggerAt: new Date(JETZT - 2 * MIN).toISOString(), ok: true, written: 0 }
  }));
  assert.equal(u.verdict, "FAIL");
  assert.ok(codes(u).includes("standZuAlt"), JSON.stringify(codes(u)));
});

test("WD-7 Gegenprobe: derselbe Takt mit frischem Stand bleibt PASS", () => {
  assert.equal(Watchdog.beurteile(gesund({
    lastCycle: { triggerAt: new Date(JETZT - 2 * MIN).toISOString(), ok: true, written: 480 }
  })).verdict, "PASS");
});

/* --- Faelle 19/20: Auslieferung und Browser ---------------------------- */

test("WD-8 haengt die Auslieferung hinter dem Repository, ist das FAIL", () => {
  const u = Watchdog.beurteile(gesund({
    delivered: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") }
  }));
  assert.equal(u.verdict, "FAIL");
  assert.ok(codes(u).includes("auslieferungHinterher"));
});

test("WD-9 ein Auslieferungsrueckstand innerhalb eines Takts ist nur WARNING", () => {
  const u = Watchdog.beurteile(gesund({
    delivered: { sessionDate: HEUTE, asOfMs: JETZT - 13 * MIN },
    snapshot: { sessionDate: HEUTE, asOfMs: JETZT - 2 * MIN }
  }));
  assert.equal(u.verdict, "WARNING");
  assert.ok(codes(u).includes("auslieferungVerspaetet"));
});

test("WD-10 ein grosser Rueckstand derselben Sitzung ist FAIL", () => {
  const u = Watchdog.beurteile(gesund({
    delivered: { sessionDate: HEUTE, asOfMs: JETZT - 40 * MIN },
    snapshot: { sessionDate: HEUTE, asOfMs: JETZT - 2 * MIN }
  }));
  assert.equal(u.verdict, "FAIL");
  assert.ok(codes(u).includes("auslieferungZuWeitHinterher"));
});

test("WD-11 nicht gemessen ist nicht in Ordnung", () => {
  const u = Watchdog.beurteile(gesund({ delivered: null }));
  assert.ok(codes(u).includes("auslieferungUngeprueft"));
  assert.equal(u.verdict, "WARNING", "eine ungemessene Auslieferung darf nicht als PASS durchgehen");
});

/* --- Faelle 11-13: geschlossen, Wochenende, Feiertag ------------------- */

test("WD-12 bei geschlossener Boerse ist ein alter Stand kein Fehler", () => {
  for (const zustand of ["CLOSED", "AFTER", "PRE"]) {
    const u = Watchdog.beurteile(gesund({
      marketState: zustand, expectedSession: null,
      snapshot: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") },
      delivered: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") },
      lastCycle: null
    }));
    assert.equal(u.verdict, "PASS", zustand + " sollte ruhig bleiben: " + JSON.stringify(codes(u)));
  }
});

test("WD-13 Gegenprobe: derselbe Stand bei offenem Markt ist FAIL", () => {
  const u = Watchdog.beurteile(gesund({
    snapshot: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") },
    delivered: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") },
    lastCycle: null
  }));
  assert.equal(u.verdict, "FAIL",
               "sonst wuerde der Waechter den Anlassfall nur deshalb verpassen, " +
               "weil dieselbe Lage ausserhalb der Sitzung harmlos ist");
});

/* --- Sauberkeit des Urteils -------------------------------------------- */

test("WD-14 das Urteil ist immer der hoechste Schweregrad", () => {
  const u = Watchdog.beurteile(gesund({
    lastCycle: { triggerAt: new Date(JETZT - 4 * MIN).toISOString(), ok: false, written: null },
    delivered: { sessionDate: FREITAG, asOfMs: Date.parse("2026-09-18T20:00:00Z") }
  }));
  assert.ok(codes(u).includes("zyklusFehlgeschlagen"));
  assert.ok(codes(u).includes("auslieferungHinterher"));
  assert.equal(u.verdict, "FAIL", "ein WARNING darf ein FAIL nicht verdecken");
});

test("WD-15 der Bericht traegt keine Kurse", () => {
  const u = Watchdog.beurteile(gesund());
  const text = JSON.stringify(u);
  assert.ok(!/price|close|last|bid|ask/i.test(text.replace(/lastCycle\w*/g, "")),
            "der Waechter beschreibt Zeiten und Sitzungen, keine Kurse");
});

/* --- Der Produktionsbefund vom 21.09.2026, 18:06:55 -------------------- */

/* Der Waechter meldete WARNING "Letzter Taktzyklus vor 10 min", waehrend
   der Takt voellig stabil lief. Verglichen wurden zwei verschiedene
   Dinge: die Zeit SEIT Zyklusbeginn gegen den Abstand ZWISCHEN zwei
   Beginnen. Ein Zyklus beginnt alle 5:04 und dauert 5:02 - das Alter
   seines Beginns pendelt also zwischen 0 und gut 10 Minuten, und die
   Schwelle liegt bei 9. Wer frueh im Zyklus misst, bekommt PASS; wer
   spaet misst, WARNING - bei identischer Produktion. */

const ECHT = Date.parse("2026-09-21T18:06:55Z");
const echterZyklus = {
  triggerAt: "2026-09-21T18:02:10.906Z",     /* Beginn: 4:44 vor der Messung */
  fetchEndAt: "2026-09-21T18:07:12.294Z",    /* Ende liegt NACH der Messung  */
  ok: true, written: 488
};

test("WD-16 ein stabiler Takt schlaegt nicht an, auch kurz vor dem naechsten Zyklus", () => {
  /* Genau die Lage von 18:06:55: der zuletzt VERZEICHNETE Zyklus ist
     Z10 (Beginn 17:57:03, Ende 18:02:04) - sein Beginn ist 9:52 alt,
     sein Ende 4:51. Gemessen wird ab dem Ende. */
  const u = Watchdog.beurteile({
    nowMs: ECHT,
    marketState: "OPEN",
    expectedSession: "2026-09-21",
    snapshot: { sessionDate: "2026-09-21", asOfMs: ECHT - 6 * MIN },
    delivered: { sessionDate: "2026-09-21", asOfMs: ECHT - 8 * MIN },
    lastCycle: {
      triggerAt: "2026-09-21T17:57:03.091Z",
      fetchEndAt: "2026-09-21T18:02:04.513Z",
      ok: true, written: 486
    },
    intervalMs: 5 * MIN
  });
  assert.ok(!codes(u).includes("taktVerspaetet"),
            "stabiler Takt darf nicht als verspaetet gelten: " + JSON.stringify(codes(u)));
  assert.ok(!codes(u).includes("taktAusgefallen"), JSON.stringify(codes(u)));
});

test("WD-17 Gegenprobe: ein wirklich stehengebliebener Takt schlaegt weiterhin an", () => {
  /* Ohne diese Gegenprobe waere WD-16 nur eine Abschaltung der Regel.
     Zwoelf Minuten seit dem ENDE des letzten Zyklus sind echt zu lang. */
  const spaet = Watchdog.beurteile({
    nowMs: ECHT,
    marketState: "OPEN",
    expectedSession: "2026-09-21",
    snapshot: { sessionDate: "2026-09-21", asOfMs: ECHT - 12 * MIN },
    delivered: { sessionDate: "2026-09-21", asOfMs: ECHT - 12 * MIN },
    lastCycle: {
      triggerAt: "2026-09-21T17:49:00.000Z",
      fetchEndAt: "2026-09-21T17:54:00.000Z",   /* 12:55 vor der Messung */
      ok: true, written: 480
    },
    intervalMs: 5 * MIN
  });
  assert.ok(codes(spaet).includes("taktVerspaetet"), JSON.stringify(codes(spaet)));

  /* Und eine halbe Stunde Stillstand bleibt FAIL, nicht WARNING. */
  const tot = Watchdog.beurteile({
    nowMs: ECHT,
    marketState: "OPEN",
    expectedSession: "2026-09-21",
    snapshot: { sessionDate: "2026-09-21", asOfMs: ECHT - 30 * MIN },
    delivered: { sessionDate: "2026-09-21", asOfMs: ECHT - 30 * MIN },
    lastCycle: {
      triggerAt: "2026-09-21T17:31:00.000Z",
      fetchEndAt: "2026-09-21T17:36:00.000Z",
      ok: true, written: 480
    },
    intervalMs: 5 * MIN
  });
  assert.ok(codes(tot).includes("taktAusgefallen"), JSON.stringify(codes(tot)));
  assert.equal(tot.verdict, "FAIL");
});

test("WD-18 laeuft ein Zyklus noch, zaehlt sein Beginn - die Uhr darf nicht stehen", () => {
  /* Ohne Ende gibt es nichts anderes als den Beginn, und das ist auch
     richtig so: waehrend eines laufenden Abrufs soll die Zeit weiter
     laufen, sonst wuerde ein haengender Zyklus nie auffallen. */
  const laeuft = Watchdog.beurteile({
    nowMs: ECHT,
    marketState: "OPEN",
    expectedSession: "2026-09-21",
    snapshot: { sessionDate: "2026-09-21", asOfMs: ECHT - 2 * MIN },
    delivered: { sessionDate: "2026-09-21", asOfMs: ECHT - 4 * MIN },
    lastCycle: { triggerAt: new Date(ECHT - 3 * MIN).toISOString(), ok: true, written: 0 },
    intervalMs: 5 * MIN
  });
  assert.ok(!codes(laeuft).includes("taktVerspaetet"), JSON.stringify(codes(laeuft)));

  const haengt = Watchdog.beurteile({
    nowMs: ECHT,
    marketState: "OPEN",
    expectedSession: "2026-09-21",
    snapshot: { sessionDate: "2026-09-21", asOfMs: ECHT - 20 * MIN },
    delivered: { sessionDate: "2026-09-21", asOfMs: ECHT - 20 * MIN },
    lastCycle: { triggerAt: new Date(ECHT - 20 * MIN).toISOString(), ok: true, written: 0 },
    intervalMs: 5 * MIN
  });
  assert.ok(codes(haengt).includes("taktAusgefallen"),
            "ein haengender Zyklus muss auffallen: " + JSON.stringify(codes(haengt)));
});

test("WD-19 Gegenprobe: das Ende gewinnt gegen den Beginn, nicht umgekehrt", () => {
  /* Scharf gestellt: derselbe Zyklus, einmal mit und einmal ohne Ende.
     Mit Ende ist er jung, ohne Ende alt. Waere die Reihenfolge
     vertauscht, fiele WD-16 genauso aus - und der Fehler bliebe. */
  const basis = {
    nowMs: ECHT,
    marketState: "OPEN",
    expectedSession: "2026-09-21",
    snapshot: { sessionDate: "2026-09-21", asOfMs: ECHT - 6 * MIN },
    delivered: { sessionDate: "2026-09-21", asOfMs: ECHT - 8 * MIN },
    intervalMs: 5 * MIN
  };
  const mitEnde = Watchdog.beurteile(Object.assign({}, basis, {
    lastCycle: { triggerAt: "2026-09-21T17:57:03.091Z",
                 fetchEndAt: "2026-09-21T18:02:04.513Z", ok: true, written: 486 }
  }));
  const ohneEnde = Watchdog.beurteile(Object.assign({}, basis, {
    lastCycle: { triggerAt: "2026-09-21T17:57:03.091Z", ok: true, written: 486 }
  }));
  assert.equal(mitEnde.facts.lastCycleAgeMinutes, 5, "ab Ende gemessen");
  assert.equal(ohneEnde.facts.lastCycleAgeMinutes, 10, "ab Beginn gemessen");
  assert.ok(!codes(mitEnde).includes("taktVerspaetet"));
  assert.ok(codes(ohneEnde).includes("taktVerspaetet"),
            "ohne Ende bleibt es der alte, strengere Massstab");
});
