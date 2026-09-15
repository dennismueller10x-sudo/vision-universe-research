/* Der Live-Hub: ein Strom je Titel, Abonnements nur fuer Sichtbares,
   kein Polling bei geschlossener Boerse, Aufraeumen beim Kuendigen,
   Sitzungswechsel ohne neuen Abruf. Geprueft in Node mit gefaelschtem
   Fenster, gezaehlten Abrufen und gestellter Uhr. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const CAL = JSON.parse(src("quant/config/market-calendar.json"));

function fenster(antworten, now) {
  const calls = [];
  const timers = [];
  const w = {
    document: { visibilityState: "visible", addEventListener() {} },
    addEventListener() {},
    setInterval: (fn, ms) => { timers.push({ fn, ms, kind: "interval" }); return timers.length; },
    clearInterval: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, kind: "timeout" }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    fetch: (url, init) => {
      calls.push({ url, cache: init && init.cache });
      const a = typeof antworten[url] === "function" ? antworten[url]() : antworten[url];
      return Promise.resolve({ ok: !!a, status: a ? 200 : 404, json: () => Promise.resolve(a) });
    }
  };
  /* UMD-Module im Browserpfad laden: `module` ist hier nicht definiert. */
  for (const f of ["quant/engines/realtime/market-hours.js", "quant/engines/realtime/trading-session.js",
                   "quant/engines/realtime/intraday-snapshot.js", "quant/engines/realtime/freshness.js"]) {
    new Function("window", "module", src(f).replace("typeof window !== \"undefined\" ? window : globalThis", "window"))(w, undefined);
  }
  new Function("window", src("discover/ui/live-hub.js"))(w);
  const Hub = w.VUDiscover.LiveHub;
  Hub.init({ realtime: { available: true, intraday: { index: "/idx.json", refreshMinutes: 10 } },
             calendar: CAL, now: () => new Date(now), fetch: w.fetch });
  return { Hub, calls, timers, w };
}

/* Uhrzeiten ab 09:30 im Fuenf-Minuten-Takt - als echte HH:MM. */
const uhr = (i) => { const m = 570 + i * 5; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
const snap = (sym, punkte, complete) => ({
  schemaVersion: "intraday-snapshot-1.0.0", symbol: sym, instrumentId: sym, securityId: "ref_" + sym,
  provider: "tiingo", venue: "IEX", dataMode: "real", interval: "5min", sessionDate: "2026-09-11",
  sessionOpenLocal: "09:30", sessionCloseLocal: "16:00",
  asOf: "2026-09-11T" + uhr(punkte - 1).replace(/^(\d\d)/, (h) => String(Number(h) + 4).padStart(2, "0")) + ":00Z",
  asOfLocal: uhr(punkte - 1), regularComplete: !!complete, isComplete: !!complete,
  previousClose: 100, publishBasis: "Test",
  points: Array.from({ length: punkte }, (_, i) => [uhr(i), 100 + i])
});
const idx = (entries, display) => ({ entries, displaySession: display, sessions: {} });
const eintrag = (sym, s) => ({ securityId: "ref_" + sym, sessionDate: s.sessionDate, asOf: s.asOf, asOfLocal: s.asOfLocal,
                               points: s.points.length, regularComplete: s.regularComplete, path: "/snap/" + sym + ".json" });
const tickMicro = () => new Promise((r) => setTimeout(r, 5));

test("LH1 · drei Abonnenten, ein Abruf: Verzeichnis einmal, Snapshot einmal", async () => {
  const s = snap("AAPL", 4, false);
  const { Hub, calls } = fenster({ "/idx.json": idx({ AAPL: eintrag("AAPL", s) }, { sessionDate: "2026-09-11", isComplete: false }),
                                   "/snap/AAPL.json": s }, "2026-09-11T14:00:00Z");
  await Hub.loadIndex();
  const got = [];
  const k1 = Hub.subscribe("AAPL", (p) => got.push(p));
  const k2 = Hub.subscribe("AAPL", (p) => got.push(p));
  const k3 = Hub.subscribe("AAPL", (p) => got.push(p));
  await tickMicro(); await tickMicro();
  assert.equal(got.length, 3);
  assert.equal(got[0].snapshot.points.length, 4);
  assert.equal(got[0].label.label, "Heute · Stand 09:45");
  assert.equal(calls.filter((c) => c.url === "/snap/AAPL.json").length, 1);
  assert.equal(calls.filter((c) => c.url === "/idx.json").length, 1);
  assert.equal(Hub.stats().subscribers, 3);
  k1(); k2(); k3();
  assert.equal(Hub.stats().subscribers, 0);
  assert.equal(Hub.stats().polling, false, "ohne Abonnenten kein Timer");
});

test("LH2 · ohne Eintrag im Verzeichnis kommt null - und kein Abruf", async () => {
  const { Hub, calls } = fenster({ "/idx.json": idx({}, { sessionDate: "2026-09-11", isComplete: true }) }, "2026-09-12T14:00:00Z");
  await Hub.loadIndex();
  let p = null;
  Hub.subscribe("ZZZZ", (x) => { p = x; });
  await tickMicro();
  assert.equal(p.snapshot, null);
  assert.equal(calls.length, 1);
});

test("LH3 · Polling nur bei offener Boerse; die Sichtbarkeit haelt es an", async () => {
  const s = snap("AAPL", 4, true);
  const antworten = { "/idx.json": idx({ AAPL: eintrag("AAPL", s) }, { sessionDate: "2026-09-11", isComplete: true }), "/snap/AAPL.json": s };
  const zu = fenster(antworten, "2026-09-12T14:00:00Z");
  await zu.Hub.loadIndex();
  const k = zu.Hub.subscribe("AAPL", () => {});
  await tickMicro();
  assert.equal(zu.Hub.shouldPoll(), false, "Samstag: nichts nachzufragen");
  assert.equal(zu.Hub.stats().polling, false, "Samstag: kein Timer");
  assert.equal(await zu.Hub.tick(), false);
  k();
  const offen = fenster(antworten, "2026-09-11T14:00:00Z");
  await offen.Hub.loadIndex();
  offen.Hub.subscribe("AAPL", () => {});
  await tickMicro();
  assert.equal(offen.Hub.shouldPoll(), true);
  assert.equal(offen.Hub.stats().polling, true);
  offen.w.document.visibilityState = "hidden";
  offen.Hub.reset();
  assert.equal(offen.Hub.stats().polling, false);
});

test("LH4 · ein Tick holt nur, was sich geaendert hat, und der Snapshot waechst nur", async () => {
  let stand = snap("AAPL", 4, false);
  const antworten = {
    "/idx.json": () => idx({ AAPL: eintrag("AAPL", stand) }, { sessionDate: "2026-09-11", isComplete: false }),
    "/snap/AAPL.json": () => stand
  };
  const { Hub, calls } = fenster(antworten, "2026-09-11T14:00:00Z");
  await Hub.loadIndex();
  const got = [];
  Hub.subscribe("AAPL", (p) => got.push(p.snapshot.points.length));
  await tickMicro();
  assert.equal(await Hub.tick(), true);
  assert.equal(calls.filter((c) => c.url === "/snap/AAPL.json").length, 1, "gleicher Stand: kein zweiter Abruf");
  stand = snap("AAPL", 6, false);
  await Hub.tick(); await tickMicro();
  assert.deepEqual(got, [4, 6]);
  assert.equal(calls.filter((c) => c.url === "/snap/AAPL.json").length, 2);
  assert.equal(calls[calls.length - 1].cache, "no-cache", "Nachfragen umgehen den Cache");
  /* Ein kleinerer Nachfolger ersetzt nichts. */
  stand = Object.assign(snap("AAPL", 3, false), { asOf: "2026-09-11T19:59:00Z" });
  await Hub.tick(); await tickMicro();
  assert.equal(Hub.peek("AAPL").points.length, 6);
});

test("LH5 · Sitzungswechsel: die Beschriftung springt um 09:30 ohne neuen Snapshot", async () => {
  const s = snap("AAPL", 78, true);
  let jetzt = "2026-09-14T13:29:30Z";
  const { Hub, timers } = fenster({ "/idx.json": idx({ AAPL: eintrag("AAPL", s) }, { sessionDate: "2026-09-11", isComplete: true }),
                                    "/snap/AAPL.json": s }, jetzt);
  Hub.init({ realtime: { available: true, intraday: { index: "/idx.json", refreshMinutes: 10 } }, calendar: CAL,
             now: () => new Date(jetzt) });
  await Hub.loadIndex();
  const labels = [];
  Hub.subscribe("AAPL", (p) => labels.push(p.label.label));
  await tickMicro();
  assert.equal(labels[0], "Letzter Handelstag · Freitag");
  const roll = timers.find((t) => t.kind === "timeout" && !t.cleared);
  assert.ok(roll && roll.ms <= 32000, "Zeitgeber auf die Sitzungsgrenze");
  jetzt = "2026-09-14T13:31:00Z";
  roll.fn(); await tickMicro();
  assert.equal(labels[1], "Letzter Handelstag · Freitag · heutige Kurse folgen", "der Snapshot ist noch Freitag - und heisst so");
  assert.equal(labels.length, 2);
  assert.equal(Hub.stats().rollovers, 1);
});

test("LH6 · ohne Freigabe (meta.realtime.available=false) tut der Hub nichts", async () => {
  const { Hub, calls, w } = fenster({}, "2026-09-11T14:00:00Z");
  Hub.reset();
  Hub.init({ realtime: { available: false }, calendar: CAL, fetch: w.fetch });
  assert.equal(Hub.enabled(), false);
  let p; Hub.subscribe("AAPL", (x) => { p = x; });
  assert.equal(p.snapshot, null);
  assert.equal(calls.length, 0);
});

test("LH7 · Titel ausserhalb des Discover-Umfangs: Pfad aus Sitzung, Muster und Ausnahmen - kein Abruf ins Leere", async () => {
  const s = snap("ZZZ", 6, true);
  const antworten = {
    "/idx.json": { entries: {}, displaySession: { sessionDate: "2026-09-11", isComplete: true }, sessions: {},
                   pathPattern: "/i/<sessionDate>/<securityId>.json", idPattern: "ref_<symbol>",
                   idExceptions: { "BRK-A": "ref_BRK_A" }, available: { "2026-09-10": ["ZZZ"], "2026-09-11": ["ZZZ", "BRK-A"] } },
    "/i/2026-09-11/ref_ZZZ.json": s
  };
  const { Hub, calls } = fenster(antworten, "2026-09-12T14:00:00Z");
  await Hub.loadIndex();
  assert.equal(Hub.entryFor("ZZZ"), null, "kein Eintrag mit Metadaten");
  assert.equal(Hub.resolveEntry("ZZZ").path, "/i/2026-09-11/ref_ZZZ.json", "juengste Sitzung gewinnt");
  assert.equal(Hub.resolveEntry("BRK-A").securityId, "ref_BRK_A", "Ausnahme statt Muster");
  assert.equal(Hub.resolveEntry("NOPE"), null, "unbekannt bleibt unbekannt - kein Pfad, kein 404");
  let p = null; Hub.subscribe("ZZZ", (x) => { p = x; }); await tickMicro(); await tickMicro();
  assert.equal(p.snapshot.symbol, "ZZZ");
  assert.equal(calls.filter((c) => c.url.startsWith("/i/")).length, 1);
});

test("LH8 · Freshness-Vertrag im Hub: ein Freitags-Snapshot am Dienstag ist STALE und heisst 'nicht aktuell'", async () => {
  const s = snap("AAPL", 78, true);
  const { Hub } = fenster({ "/idx.json": idx({ AAPL: eintrag("AAPL", s) }, { sessionDate: "2026-09-11", isComplete: true }),
                            "/snap/AAPL.json": s }, "2026-09-15T07:37:00Z");
  await Hub.loadIndex();
  const got = [];
  Hub.subscribe("AAPL", (p) => got.push(p));
  await tickMicro(); await tickMicro();
  assert.equal(got[0].freshness.freshnessState, "STALE");
  assert.equal(got[0].freshness.expectedSessionDate, "2026-09-14");
  assert.equal(got[0].label.label, "Stand Fr., 11.09. · nicht aktuell");
  assert.equal(got[0].label.tone, "stale");
  assert.equal(got[0].label.marketStateWord, "Geschlossen");
  /* Dasselbe Verzeichnis am Montagmorgen: Freitag ist die letzte Sitzung. */
  const { Hub: H2 } = fenster({ "/idx.json": idx({ AAPL: eintrag("AAPL", s) }, { sessionDate: "2026-09-11", isComplete: true }),
                               "/snap/AAPL.json": s }, "2026-09-14T12:00:00Z");
  await H2.loadIndex();
  const got2 = [];
  H2.subscribe("AAPL", (p) => got2.push(p));
  await tickMicro(); await tickMicro();
  assert.equal(got2[0].freshness.freshnessState, "LAST_SESSION");
  assert.equal(got2[0].label.label, "Letzter Handelstag · Freitag");
});

test("LH9 · Nachfragen, wenn das Verzeichnis die letzte abgeschlossene Sitzung nicht kennt (Nachzug des Workflows)", async () => {
  const s = snap("AAPL", 78, true);
  const index = Object.assign(idx({ AAPL: eintrag("AAPL", s) }, { sessionDate: "2026-09-11", isComplete: true }),
                              { lastCompletedSession: { sessionDate: "2026-09-11" } });
  const { Hub } = fenster({ "/idx.json": index, "/snap/AAPL.json": s }, "2026-09-15T07:37:00Z");
  await Hub.loadIndex();
  Hub.subscribe("AAPL", () => {});
  assert.equal(Hub.shouldPoll(), true, "das Verzeichnis haengt hinter dem Kalender - nachfragen");
});
