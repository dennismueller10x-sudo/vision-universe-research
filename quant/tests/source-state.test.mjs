/* =========================================================================
   DER QUELLZUSTAND, AN DEN UHRZEITEN DES VORFALLS GEMESSEN

   Owner-Befund vom 18.09.2026, 16:08 New York, Nebius: ein Chart, der um
   15:50 endet, beschriftet "Heute - Stand 15:50 - Schluss folgt", Fussnote
   "5-Minuten-Kurse" - acht Minuten nach Handelsschluss.

   Diese Tests halten die vier Zustaende an genau den Zeitpunkten fest, die
   der Auftrag nennt, und jede Gegenprobe dazu.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const S = require(join(root, "quant", "engines", "realtime", "source-state.js"));

/* Eine Aufloesung, wie TradingSession.resolve sie liefert - hier von Hand,
   damit die Tests die Zustandslogik pruefen und nicht den Kalender. */
function aufloesung({ offen, heute = "2026-09-18", letzte = "2026-09-17" }) {
  return {
    marketState: offen ? "OPEN" : "CLOSED",
    displaySession: { sessionDate: offen ? heute : letzte },
    lastCompletedSession: { sessionDate: offen ? letzte : heute }
  };
}

function snapshot(over) {
  return Object.assign({
    sessionDate: "2026-09-18", closeLocal: "16:00", timezone: "America/New_York",
    points: [["09:30", 217.8], ["15:50", 223.17]],
    asOf: "2026-09-18T19:50:00.000Z", asOfLocal: "15:50",
    lastRegularLocal: "15:50", finalSlotLocal: "15:55",
    fetchedAfterClose: false, coversFinalSlot: false, regularComplete: false,
    earlyClose: false
  }, over || {});
}

/* ------------------------------------------------- offene Sitzung */

test("SS-1 · 15:50 vor Schluss, kein Strom: SNAPSHOT, ehrlicher Stand", () => {
  const r = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                         live: null, now: "2026-09-18T19:52:00Z" });
  assert.equal(r.state, "SNAPSHOT");
  assert.equal(r.label, "Heute · Stand 15:50");
  assert.equal(r.sourceText, "5-Minuten-Kurse");
  assert.equal(r.isFrozen, false);
});

test("SS-2 · 15:55 vor Schluss, kein Strom: weiterhin SNAPSHOT", () => {
  const snap = snapshot({ points: [["09:30", 217.8], ["15:55", 223.51]],
                          asOf: "2026-09-18T19:55:00Z", asOfLocal: "15:55",
                          lastRegularLocal: "15:55" });
  const r = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snap,
                         live: null, now: "2026-09-18T19:57:00Z" });
  assert.equal(r.state, "SNAPSHOT");
  assert.equal(r.label, "Heute · Stand 15:55");
});

test("SS-3 · frischer Tick: REALTIME, und die Quelle nennt den laufenden Kurs", () => {
  const r = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                         live: { price: 223.4, at: "2026-09-18T19:51:30Z", fresh: true },
                         now: "2026-09-18T19:52:00Z" });
  assert.equal(r.state, "REALTIME");
  assert.equal(r.label, "Markt geöffnet · Live");
  assert.equal(r.sourceText, "5-Minuten-Kurse, fortgeschrieben mit dem laufenden Kurs",
    "Owner-Regel 2: die statische Bezeichnung darf den Chart dann nicht mehr als alleinige Quelle beschreiben");
});

test("SS-4 · Realtime-Ausfall: zurueck auf SNAPSHOT, nie stehengebliebenes 'Live'", () => {
  const r = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                         live: { price: 223.4, at: "2026-09-18T19:45:00Z", fresh: false },
                         now: "2026-09-18T19:52:00Z" });
  assert.equal(r.state, "SNAPSHOT");
  assert.notEqual(r.label, "Markt geöffnet · Live");
});

test("SS-5 · Strom weg UND Snapshot stehen geblieben: STALE", () => {
  const r = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                         live: null, now: "2026-09-18T20:40:00Z",
                         options: { staleAfterMinutes: 15 } });
  assert.equal(r.state, "STALE");
  assert.match(r.label, /nicht aktuell/);
});

/* ---------------------------------------------- der Uebergang 16:00 */

test("SS-6 · 16:01 mit unvollstaendigen Daten: STALE, kein 'Schluss folgt'", () => {
  /* Genau der Zustand des Owner-Screenshots, eine Minute nach der Glocke. */
  const r = S.bestimme({ resolution: aufloesung({ offen: false, heute: "2026-09-18" }),
                         snapshot: snapshot(), now: "2026-09-18T20:01:00Z" });
  assert.equal(r.state, "STALE");
  assert.equal(r.label, "Heute · Stand 15:50 · Schluss fehlt noch");
  assert.equal(r.isFrozen, false);
  assert.doesNotMatch(r.label, /Schluss folgt/, "die Vertroestung ist abgeschafft");
});

test("SS-7 · vollstaendiger Schlussstand: FINAL_SESSION, eingefroren", () => {
  const snap = snapshot({ points: [["09:30", 217.8], ["15:55", 223.51]],
                          asOfLocal: "16:35", lastRegularLocal: "15:55",
                          fetchedAfterClose: true, coversFinalSlot: true, regularComplete: true });
  const r = S.bestimme({ resolution: aufloesung({ offen: false }), snapshot: snap,
                         now: "2026-09-18T21:00:00Z" });
  assert.equal(r.state, "FINAL_SESSION");
  assert.equal(r.label, "Heute · Schluss 16:00");
  assert.equal(r.isFrozen, true);
  assert.doesNotMatch(r.label, /folgt/);
});

test("SS-8 · nach Schluss geholt, aber Reihe endet 15:40: kein falscher Schluss 16:00", () => {
  /* Owner-Regel 4, der Kern: eine Reihe mit letztem Stand vor dem letzten
     Slot darf niemals als Schluss 16:00 bezeichnet werden. Ein illiquider
     Titel wird deshalb trotzdem nicht ewig STALE - es kommt ja nichts mehr. */
  const snap = snapshot({ points: [["09:30", 10], ["15:40", 11]],
                          asOfLocal: "15:40", lastRegularLocal: "15:40",
                          fetchedAfterClose: true, coversFinalSlot: false, regularComplete: false });
  const r = S.bestimme({ resolution: aufloesung({ offen: false }), snapshot: snap,
                         now: "2026-09-18T21:00:00Z" });
  assert.equal(r.state, "FINAL_SESSION");
  assert.equal(r.label, "Heute · Schluss · letzter Kurs 15:40");
  assert.doesNotMatch(r.label, /16:00/, "kein erfundener Schlusszeitpunkt");
  assert.equal(r.isFrozen, true);
});

test("SS-9 · verkuerzte Sitzung: der Schluss steht als der der Sitzung, nicht als 16:00", () => {
  const snap = snapshot({ closeLocal: "13:00", earlyClose: true,
                          points: [["09:30", 10], ["12:55", 11]],
                          asOfLocal: "12:55", lastRegularLocal: "12:55", finalSlotLocal: "12:55",
                          fetchedAfterClose: true, coversFinalSlot: true, regularComplete: true });
  const r = S.bestimme({ resolution: aufloesung({ offen: false }), snapshot: snap,
                         now: "2026-09-18T18:00:00Z" });
  assert.equal(r.state, "FINAL_SESSION");
  assert.equal(r.label, "Heute · Schluss 13:00 (verkürzt)");
});

/* ------------------------------------------- Wochenende und Feiertag */

test("SS-10 · Wochenende: die Freitagssitzung bleibt final, nicht 'heute'", () => {
  /* Am Samstag ist die letzte abgeschlossene Sitzung der Freitag. */
  const snap = snapshot({ sessionDate: "2026-09-18", lastRegularLocal: "15:55",
                          fetchedAfterClose: true, coversFinalSlot: true, regularComplete: true });
  const r = S.bestimme({ resolution: aufloesung({ offen: false, heute: "2026-09-18" }),
                         snapshot: snap, now: "2026-09-19T14:00:00Z" });
  assert.equal(r.state, "FINAL_SESSION");
  assert.equal(r.isFrozen, true);
});

test("SS-11 · Feiertag/aeltere Sitzung: STALE, niemals final", () => {
  const snap = snapshot({ sessionDate: "2026-09-10", lastRegularLocal: "15:55",
                          fetchedAfterClose: true, coversFinalSlot: true, regularComplete: true });
  const r = S.bestimme({ resolution: aufloesung({ offen: false, heute: "2026-09-18" }),
                         snapshot: snap, now: "2026-09-18T21:00:00Z" });
  assert.equal(r.state, "STALE");
  assert.match(r.label, /nicht aktuell/);
  assert.equal(r.isFrozen, false);
});

/* ------------------------------------------------------ Gegenproben */

test("SS-12 · ohne Tagesverlauf wird nichts behauptet", () => {
  const r = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: null });
  assert.equal(r.state, "STALE");
  assert.equal(r.label, "Kein Tagesverlauf");
  assert.equal(r.sourceText, null);
});

test("SS-13 · jeder Zustand ist einer der vier - und jeder kommt vor", () => {
  const gesehen = new Set();
  const faelle = [
    S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                 live: { price: 1, at: "2026-09-18T19:51:30Z", fresh: true }, now: "2026-09-18T19:52:00Z" }),
    S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(), now: "2026-09-18T19:52:00Z" }),
    S.bestimme({ resolution: aufloesung({ offen: false }),
                 snapshot: snapshot({ fetchedAfterClose: true, coversFinalSlot: true, regularComplete: true,
                                      lastRegularLocal: "15:55" }), now: "2026-09-18T21:00:00Z" }),
    S.bestimme({ resolution: aufloesung({ offen: false }), snapshot: snapshot(), now: "2026-09-18T20:01:00Z" })
  ];
  faelle.forEach((f) => { assert.ok(S.ZUSTAENDE.includes(f.state), f.state); gesehen.add(f.state); });
  assert.deepEqual([...gesehen].sort(), ["FINAL_SESSION", "REALTIME", "SNAPSHOT", "STALE"]);
});

test("SS-14 · 'Markt geoeffnet · Live' steht NUR bei REALTIME", () => {
  /* Die Gegenprobe zu SS-3: ohne sie waere das Etikett nur ein Text. */
  const ohneStrom = [
    S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(), now: "2026-09-18T19:52:00Z" }),
    S.bestimme({ resolution: aufloesung({ offen: false }), snapshot: snapshot(), now: "2026-09-18T20:01:00Z" }),
    S.bestimme({ resolution: aufloesung({ offen: false }),
                 snapshot: snapshot({ fetchedAfterClose: true, coversFinalSlot: true }), now: "2026-09-18T21:00:00Z" })
  ];
  ohneStrom.forEach((r) => assert.notEqual(r.label, "Markt geöffnet · Live", r.state));
});

test("SS-15 · '5-Minuten-Kurse' allein steht NUR, wenn der Strom nichts beigetragen hat", () => {
  const mitStrom = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                                live: { price: 1, at: "2026-09-18T19:51:30Z", fresh: true },
                                now: "2026-09-18T19:52:00Z" });
  assert.notEqual(mitStrom.sourceText, "5-Minuten-Kurse");
  const ohne = S.bestimme({ resolution: aufloesung({ offen: true }), snapshot: snapshot(),
                            now: "2026-09-18T19:52:00Z" });
  assert.equal(ohne.sourceText, "5-Minuten-Kurse");
});

/* =========================================================================
   DIE RIEGEL GEGEN DEN RUECKFALL

   Zwei Formulierungen sind ab dem 19.09.2026 verboten, und zwar im Code,
   nicht nur in der Absicht. Ohne diese Tests kaeme die naechste
   Aenderung ungehindert daran vorbei.
   ========================================================================= */
import { readFileSync as leseDatei } from "node:fs";

test("SS-16 · `now >= close` als Vollstaendigkeit steht nirgends mehr", () => {
  const quelle = leseDatei(join(root, "quant", "engines", "realtime", "intraday-snapshot.js"), "utf8");
  const zeile = /var\s+regularComplete\s*=\s*nowMs\s*>=\s*closeMs\s*;/.exec(quelle);
  assert.equal(zeile, null,
    "regularComplete darf nicht aus der Uhr kommen - Owner-Regel 4 vom 19.09.2026");
  assert.match(quelle, /fetchedAfterClose\s*&&\s*coversFinalSlot/,
    "es muss die Tatsache ueber den Abruf UND die ueber die Daten sein");
});

/* Kommentare zaehlen nicht - dort MUSS der Satz stehen duerfen, weil der
   Vorfall dort erklaert wird. Gesucht wird, was ein Nutzer sehen kann.
   Die erste Fassung dieses Tests erkannte nur Zeilen, die mit `*`
   beginnen, und schlug an den Fortsetzungszeilen der Blockkommentare an.
   Jetzt werden Kommentare wirklich entfernt. */
function ohneKommentare(quelle) {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

test("SS-17 · 'Schluss folgt' ist aus der Consumer-Oberflaeche verschwunden", () => {
  /* Owner-Regel 5: "Kein Schluss folgt." Der Satz war die Vertroestung,
     die der Eigentuemer acht Minuten nach der Glocke gelesen hat. */
  for (const datei of [["quant", "engines", "realtime", "source-state.js"],
                       ["discover", "ui", "detail.js"]]) {
    const code = ohneKommentare(leseDatei(join(root, ...datei), "utf8"));
    assert.equal(/Schluss folgt/.test(code), false,
      datei.join("/") + " enthaelt die abgeschaffte Vertroestung im Code");
  }
});

test("SS-18 · Gegenprobe: die Kommentarentfernung funktioniert wirklich", () => {
  /* Ohne sie waere SS-17 auch dann gruen, wenn ohneKommentare() alles
     wegwirft - und der Riegel waere eine Attrappe. */
  assert.equal(/Schluss folgt/.test(ohneKommentare("/* Schluss folgt */")), false);
  assert.equal(/Schluss folgt/.test(ohneKommentare("var t = 'Schluss folgt';")), true);
  assert.equal(/Schluss folgt/.test(ohneKommentare("// Schluss folgt")), false);
});
