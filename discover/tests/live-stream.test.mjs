/* =========================================================================
   Der Strom auf der Aktienseite (Zero-Cost Realtime V1, Variante C).

   Die eine Zusage, an der alles haengt: der Strom darf nichts
   verschlechtern. Faellt er aus, ist abgeschaltet, wird abgelehnt oder
   ist das kostenlose Kontingent erschoepft, bleibt genau der Zustand
   zurueck, den es vorher gab - Snapshot, Beschriftung, Uhrzeit.

   Geprueft in Node mit gefaelschtem Fenster, gefaelschtem WebSocket,
   gestellter Uhr und gezaehlten Abrufen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const CAL = JSON.parse(src("quant/config/market-calendar.json"));

/* ------------------------------------------------------------- Attrappen */

function macheFabrik(protokoll) {
  function FakeSocket(url) {
    this.url = url;
    this.gesendet = [];
    this.geschlossen = false;
    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    protokoll.sockets.push(this);
    protokoll.opens++;
  }
  FakeSocket.prototype.send = function (daten) { this.gesendet.push(JSON.parse(daten)); };
  FakeSocket.prototype.close = function (code) {
    if (this.geschlossen) return;
    this.geschlossen = true;
    if (this.onclose) this.onclose({ code: code || 1000 });
  };
  /* Von aussen: der Worker meldet sich. */
  FakeSocket.prototype.oeffnen = function () { if (this.onopen) this.onopen({}); };
  FakeSocket.prototype.sagt = function (objekt) { if (this.onmessage) this.onmessage({ data: JSON.stringify(objekt) }); };
  FakeSocket.prototype.abbruch = function () {
    this.geschlossen = true;
    if (this.onclose) this.onclose({ code: 1006 });
  };
  FakeSocket.prototype.befehle = function (op) { return this.gesendet.filter((n) => n.op === op); };
  return FakeSocket;
}

function fenster(antworten, now, stream) {
  const calls = [];
  const timers = [];
  const protokoll = { sockets: [], opens: 0 };
  const w = {
    document: { visibilityState: "visible", addEventListener(typ, fn) { (this._h = this._h || {})[typ] = fn; } },
    addEventListener(typ, fn) { (this._h = this._h || {})[typ] = fn; },
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
  w.WebSocket = macheFabrik(protokoll);
  for (const f of ["quant/engines/realtime/market-hours.js", "quant/engines/realtime/trading-session.js",
                   "quant/engines/realtime/intraday-snapshot.js", "quant/engines/realtime/freshness.js"]) {
    new Function("window", "module", src(f).replace('typeof window !== "undefined" ? window : globalThis', "window"))(w, undefined);
  }
  new Function("window", src("discover/ui/live-hub.js"))(w);
  const Hub = w.VUDiscover.LiveHub;
  let jetzt = new Date(now);
  Hub.init({
    realtime: { available: true, intraday: { index: "/idx.json", refreshMinutes: 10 }, stream: stream || null },
    calendar: CAL, now: () => jetzt, fetch: w.fetch
  });
  return { Hub, calls, timers, w, protokoll, sockets: protokoll.sockets,
           vor(ms) { jetzt = new Date(jetzt.getTime() + ms); },
           feuere(kind) { timers.filter((t) => !t.cleared && t.kind === kind).forEach((t) => { t.cleared = true; t.fn(); }); } };
}

const STROM = { available: true, url: "wss://live.visionuniverse.de/live", freshSeconds: 90,
                maxSymbolsPerClient: 5, priceType: "REALTIME_REFERENCE", source: "TIINGO_IEX_LEVEL6" };

const uhr = (i) => { const m = 570 + i * 5; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
const snap = (sym, punkte, complete) => ({
  schemaVersion: "intraday-snapshot-1.0.0", symbol: sym, instrumentId: sym, securityId: "ref_" + sym,
  provider: "tiingo", venue: "IEX", dataMode: "real", interval: "5min", sessionDate: "2026-09-17",
  sessionOpenLocal: "09:30", sessionCloseLocal: "16:00", timezone: "America/New_York",
  asOf: "2026-09-17T14:00:00.000Z", asOfLocal: uhr(punkte - 1),
  regularComplete: !!complete, isComplete: !!complete, previousClose: 100, publishBasis: "Test",
  points: Array.from({ length: punkte }, (_, i) => [uhr(i), 100 + i])
});
const idx = (entries, display) => ({ entries, displaySession: display, sessions: {} });
const eintrag = (sym, s) => ({ securityId: "ref_" + sym, sessionDate: s.sessionDate, asOf: s.asOf, asOfLocal: s.asOfLocal,
                               points: s.points.length, regularComplete: s.regularComplete, path: "/snap/" + sym + ".json" });
const ruhe = () => new Promise((r) => setTimeout(r, 5));

/* Donnerstag, 17.09.2026, 10:00 New York. */
const OFFEN = "2026-09-17T14:00:00Z";
const SAMSTAG = "2026-09-19T14:00:00Z";

function welt(now, stream, symbole) {
  const antworten = { };
  const eintraege = {};
  (symbole || ["AAPL"]).forEach((sym) => {
    const s = snap(sym, 7, false);
    antworten["/snap/" + sym + ".json"] = s;
    eintraege[sym] = eintrag(sym, s);
  });
  antworten["/idx.json"] = idx(eintraege, { sessionDate: "2026-09-17", isComplete: false });
  return fenster(antworten, now, stream);
}

async function aufAktienseite(h, sym) {
  await h.Hub.loadIndex();
  const got = [];
  const kuendigen = h.Hub.live(sym || "AAPL", (p) => got.push(p));
  await ruhe(); await ruhe();
  return { got, kuendigen, letzte: () => got[got.length - 1] };
}

/* ------------------------------------------------------------------ Tests */

test("LS-1 ohne eingeschalteten Strom ist live() genau subscribe()", async () => {
  const h = welt(OFFEN, null);
  const a = await aufAktienseite(h);
  assert.equal(h.protokoll.opens, 0, "eine nicht ausgerollte Adresse darf nicht angewaehlt werden");
  assert.equal(a.letzte().snapshot.points.length, 7);
  assert.equal(a.letzte().label.label, "Heute · Stand 10:00");
  assert.equal(a.letzte().live.available, false);
  assert.equal(a.letzte().live.price, null);
  assert.equal(h.Hub.liveState().state, "IDLE");
});

test("LS-2 zuerst der Snapshot, dann der Strom - nie umgekehrt", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  /* Der erste Rueckruf traegt schon Daten: der Chart ist nie leer. */
  assert.equal(a.got[0].snapshot.points.length, 7);
  assert.equal(a.got[0].live.price, null, "zum Zeitpunkt des Snapshots gibt es noch keinen Tick");
  assert.equal(h.protokoll.opens, 1);
  assert.equal(h.sockets[0].url, STROM.url);
  h.sockets[0].oeffnen();
  assert.deepEqual(h.sockets[0].befehle("subscribe")[0].symbols, ["AAPL"]);
  assert.equal(h.Hub.liveState().state, "OPEN");
});

test("LS-3 ein frischer Tick fuehrt die Zahl und die Beschriftung nach", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "hello", priceType: "REALTIME_REFERENCE", source: "TIINGO_IEX_LEVEL6" });
  h.sockets[0].sagt({ op: "u", v: [["AAPL", 123.45, Date.parse(OFFEN), 120, 124, 119, 123.45]] });

  const p = a.letzte();
  assert.equal(p.live.price, 123.45);
  assert.equal(p.live.fresh, true);
  assert.equal(p.live.priceType, "REALTIME_REFERENCE");
  assert.equal(p.live.source, "TIINGO_IEX_LEVEL6");
  assert.equal(p.live.high, 124);
  assert.equal(p.snapshot.points.length, 7, "der Snapshot selbst bleibt unangetastet");
  assert.equal(p.freshness.freshnessState, "LIVE");
  assert.equal(!!p.snapshotFreshness, true, "die urspruengliche Bewertung bleibt einsehbar");
});

test("LS-4 ein alter Tick bestimmt die Beschriftung nicht", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "u", v: [["AAPL", 123.45, Date.parse(OFFEN)]] });
  const vorher = a.letzte().label.label;

  /* Fuenf Minuten ohne Tick. Das Etikett widerruft sich selbst - dafuer
     gibt es den Verfall-Zeitgeber; ohne ihn bliebe "Live" stehen, bis der
     Snapshot-Pfad das naechste Mal nachfragt. */
  h.vor(5 * 60000);
  h.feuere("timeout");
  const p = a.letzte();
  assert.equal(p.live.fresh, false, "ein Titel, der nicht handelt, ist kein Ausfall - aber auch nicht live");
  assert.equal(p.live.price, 123.45, "die letzte bekannte Zahl bleibt sichtbar, mit ihrem Alter");
  assert.equal(p.live.ageMs, 300000);
  assert.equal(p.label.label, vorher.replace("10:00", "10:00"), "es gilt weiter die Beschriftung des Snapshots");
  assert.equal(p.label.label.indexOf("Stand") !== -1, true);
});

test("LS-5 bei geschlossener Boerse wird gar nicht erst verbunden", async () => {
  const h = welt(SAMSTAG, STROM);
  const a = await aufAktienseite(h);
  assert.equal(h.protokoll.opens, 0);
  assert.equal(h.Hub.liveWanted(), false);
  assert.equal(a.letzte().live.available, true, "eingerichtet ist er - nur gerade nicht sinnvoll");
  assert.equal(a.letzte().live.state, "IDLE");
});

test("LS-6 zwei Titel teilen sich eine Verbindung", async () => {
  const h = welt(OFFEN, STROM, ["AAPL", "NVDA"]);
  await h.Hub.loadIndex();
  const k1 = h.Hub.live("AAPL", () => {});
  await ruhe();
  h.sockets[0].oeffnen();
  const k2 = h.Hub.live("NVDA", () => {});
  await ruhe();

  assert.equal(h.protokoll.opens, 1, "je Titel eine Verbindung waere die Rechnung, die hier vermieden wird");
  const angemeldet = h.sockets[0].befehle("subscribe").reduce((a, n) => a.concat(n.symbols), []);
  assert.deepEqual(angemeldet.sort(), ["AAPL", "NVDA"]);
  k1(); k2();
});

test("LS-7 wer die Seite verlaesst, meldet ab - und der letzte macht das Licht aus", async () => {
  const h = welt(OFFEN, STROM, ["AAPL", "NVDA"]);
  await h.Hub.loadIndex();
  const k1 = h.Hub.live("AAPL", () => {});
  const k2 = h.Hub.live("NVDA", () => {});
  await ruhe();
  h.sockets[0].oeffnen();
  await ruhe();

  k1();
  assert.deepEqual(h.sockets[0].befehle("unsubscribe")[0].symbols, ["AAPL"]);
  assert.equal(h.sockets[0].geschlossen, false, "NVDA sieht noch jemand an");
  k2();
  assert.equal(h.sockets[0].geschlossen, true, "ohne Zuschauer keine Verbindung");
  assert.equal(h.Hub.liveState().state, "IDLE");
});

test("LS-8 ein Abriss faellt auf den Snapshot zurueck und versucht es erneut", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "u", v: [["AAPL", 123.45, Date.parse(OFFEN)]] });
  assert.equal(a.letzte().freshness.freshnessState, "LIVE");

  h.sockets[0].abbruch();
  const p = a.letzte();
  assert.equal(p.live.state, "RECONNECTING");
  assert.equal(p.live.reason, "disconnected");
  assert.equal(p.snapshot.points.length, 7, "der Snapshot-Pfad ist unberuehrt");
  assert.equal(p.label.label.indexOf("Stand") !== -1, true, "und seine Beschriftung gilt wieder");

  h.feuere("timeout");
  assert.equal(h.protokoll.opens, 2, "es wird erneut versucht");
});

test("LS-9 eine Ablehnung wird benannt, nicht verschwiegen", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "denied", symbol: "AAPL", reason: "budgetProtect" });

  const p = a.letzte();
  assert.equal(p.live.reason, "budgetProtect");
  assert.equal(p.live.price, null);
  assert.equal(p.snapshot.points.length, 7);
  assert.equal(p.label.label.indexOf("Stand") !== -1, true);
});

test("LS-10 erschoepftes Kontingent heisst Rueckfall, nicht Rechnung", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "budget", verdict: "WARNING" });
  assert.equal(h.sockets[0].geschlossen, false, "gewarnt ist nicht abgeschaltet");

  /* PROTECT ist das Ende, nicht die Vorstufe zum Ende (Owner-Regel
     17.09.2026). Zwischen 85 und 100 Prozent waere der Strom zwar noch
     moeglich, aber sein Ende dann ein Abbruch statt eines Rueckfalls. */
  h.sockets[0].sagt({ op: "budget", verdict: "PROTECT" });
  assert.equal(h.sockets[0].geschlossen, true);
  assert.equal(a.letzte().live.reason, "budgetProtect");
  assert.equal(h.protokoll.opens, 1, "kein Wiederanlauf gegen eine Grenze");
  assert.equal(a.letzte().snapshot.points.length, 7);
});

test("LS-11 Handelsschluss waehrend der Sitzung schliesst den Strom", async () => {
  const h = welt(OFFEN, STROM);
  await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "session", session: "AFTER" });
  assert.equal(h.sockets[0].geschlossen, true);
  assert.equal(h.Hub.liveState().state, "IDLE");
  assert.equal(h.Hub.liveState().reason, "marketClosed");
});

test("LS-12 ein verstecktes Fenster streamt nicht", async () => {
  const h = welt(OFFEN, STROM);
  await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.w.document.visibilityState = "hidden";
  h.w.document._h.visibilitychange();
  assert.equal(h.sockets[0].geschlossen, true);

  h.w.document.visibilityState = "visible";
  h.w.document._h.visibilitychange();
  assert.equal(h.protokoll.opens, 2, "sichtbar heisst wieder verbinden");
});

test("LS-13 der Strom nennt nie einen Abschluss", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "u", v: [["AAPL", 123.45, Date.parse(OFFEN), 120, 124, 119, 123.45]] });
  const text = JSON.stringify(a.letzte());
  for (const verboten of ["Last Trade", "Last Sale", "Official", "Schlusskurs des Handels"]) {
    assert.equal(text.indexOf(verboten), -1, "gefunden: " + verboten);
  }
  assert.equal(a.letzte().live.note.indexOf("Kein offizieller Abschluss") !== -1, true);
});

test("LS-14 die Zaehlung stimmt und reset() laesst nichts offen", async () => {
  const h = welt(OFFEN, STROM);
  const a = await aufAktienseite(h);
  h.sockets[0].oeffnen();
  h.sockets[0].sagt({ op: "u", v: [["AAPL", 1, Date.parse(OFFEN)]] });
  h.sockets[0].sagt({ op: "u", v: [["AAPL", 2, Date.parse(OFFEN)]] });
  const s = h.Hub.liveStats();
  assert.equal(s.ticks, 2);
  assert.equal(s.opens, 1);
  assert.equal(s.connected, true);
  a.kuendigen();
  h.Hub.reset();
  assert.equal(h.sockets[0].geschlossen, true);
  assert.equal(h.Hub.liveStats().connected, false);
  assert.equal(h.Hub.liveStats().ticks, 0);
});

test("LS-15 die Kette steht im Befund: Anbieter, Cloudflare, Browser", () => {
  /* Owner §19: Provider Timestamp, Cloudflare Receive, VU State, Client
     Receive, Chart Render. Die ersten drei muessen im Rueckruf ankommen,
     sonst ist die Latenz, die spaeter im Bericht steht, eine Zahl ueber
     die halbe Strecke. */
  const h = welt(OFFEN, STROM);
  return aufAktienseite(h).then((a) => {
    h.sockets[0].oeffnen();
    const providerAt = Date.parse(OFFEN) - 300;
    const cloudflareAt = Date.parse(OFFEN) - 120;
    h.sockets[0].sagt({ op: "u", v: [["AAPL", 123.45, cloudflareAt, 120, 124, 119, 123.45, providerAt]] });

    const l = a.letzte().live;
    assert.equal(l.providerAt, new Date(providerAt).toISOString());
    assert.equal(l.providerLagMs, 180, "Anbieter -> Cloudflare");
    assert.equal(typeof l.clientLagMs, "number", "Cloudflare -> Browser");
    assert.equal(l.fresh, true);
  });
});

test("LS-16 ohne Anbieterzeitstempel wird nichts erfunden", () => {
  const h = welt(OFFEN, STROM);
  return aufAktienseite(h).then((a) => {
    h.sockets[0].oeffnen();
    h.sockets[0].sagt({ op: "u", v: [["AAPL", 123.45, Date.parse(OFFEN)]] });
    const l = a.letzte().live;
    assert.equal(l.providerAt, null);
    assert.equal(l.providerLagMs, null, "keine Zahl ist besser als eine geratene");
    assert.equal(l.price, 123.45);
  });
});
