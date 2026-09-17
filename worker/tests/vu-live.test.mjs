/* =========================================================================
   Tests fuer das Durable Object vu-live und den Eingangs-Worker.

   Die Zusagen, die hier geprueft werden:

     - Hundert Zuschauer auf NVDA sind EIN Abonnement beim Anbieter.
     - Was niemand ansieht, wird nach dem Nachlauf abbestellt.
     - Bricht der Anbieter weg oder faellt das Budget, erfaehrt der
       Browser es - und faellt zurueck, statt eine Zahl zu erfinden.
     - Der Schluessel geht an genau eine Stelle: die Anmeldung.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installiereLaufzeit, uhrwerk, anbieter, anfrage, papierZustand } from "./harness.mjs";

installiereLaufzeit();
const { VuLive, sitzung, restSekunden } = await import("../src/vu-live.mjs");
const worker = (await import("../src/index.mjs")).default;

/* Donnerstag, 17.09.2026, 10:00 New York - die Sitzung laeuft. */
const REGULAR = Date.UTC(2026, 8, 17, 14, 0, 0);
const SAMSTAG = Date.UTC(2026, 8, 19, 14, 0, 0);
const FEIERTAG = Date.UTC(2026, 10, 26, 14, 0, 0);     /* Thanksgiving */
const NACHTS = Date.UTC(2026, 8, 17, 2, 0, 0);
const SCHLUESSEL = "tiingo-geheim-4711";

function baue(over) {
  over = over || {};
  const uhr = uhrwerk(over.at === undefined ? REGULAR : over.at);
  const prov = anbieter(over.anbieter);
  const env = Object.assign({
    TIINGO_API_KEY: SCHLUESSEL,
    TIINGO_DYNAMIC_SUBSCRIBE: "false",
    __now: uhr.now, __timers: uhr, __fetch: prov.fetch
  }, over.env);
  const state = papierZustand(uhr);
  return { obj: new VuLive(state, env), uhr, prov, env, state };
}

/* Die Anbieterverbindung entsteht ueber ein Promise. Ein paar
   Mikro-Takte reichen, damit sie steht - wir warten nicht auf Zeit,
   sondern auf die Warteschlange. */
function takte(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 4); i++) p = p.then(() => new Promise((r) => setImmediate(r)));
  return p;
}

async function verbinde(h) {
  const antwort = await h.obj.fetch(anfrage("https://vu-live/live", { Upgrade: "websocket" }));
  assert.equal(antwort.status, 101);
  return antwort.webSocket;
}

async function abonniere(h, ws, symbole) {
  ws.send(JSON.stringify({ op: "subscribe", symbols: symbole }));
  h.uhr.vor(500);                 /* settleMs des Managers */
  await takte();
}

/* ------------------------------------------------------------ Grundlagen */

test("VL-1 die Begruessung nennt die Semantik, nicht nur den Zustand", async () => {
  const h = baue();
  const ws = await verbinde(h);
  const hallo = ws.letzte("hello");
  assert.equal(hallo.priceType, "REALTIME_REFERENCE");
  assert.equal(hallo.source, "TIINGO_IEX_LEVEL6");
  assert.equal(hallo.session, "REGULAR");
  assert.equal(hallo.mode, "reconnect");
  assert.equal(h.prov.verbindungen, 0, "ohne Abonnement wird nichts geoeffnet");
});

test("VL-2 ein Zuschauer auf NVDA ist ein Abonnement", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  assert.equal(h.prov.verbindungen, 1);
  assert.deepEqual(h.prov.tickers(), ["nvda"]);
  assert.deepEqual(ws.letzte("subscribed").symbols, ["NVDA"]);
});

test("VL-3 hundert Zuschauer auf NVDA sind immer noch ein Abonnement", async () => {
  const h = baue();
  const sockets = [];
  for (let i = 0; i < 100; i++) sockets.push(await verbinde(h));
  for (const ws of sockets) ws.send(JSON.stringify({ op: "subscribe", symbols: ["NVDA"] }));
  h.uhr.vor(500);
  await takte();

  assert.equal(h.prov.verbindungen, 1, "je Zuschauer eine Verbindung waere das Ende des Nulltarifs");
  assert.deepEqual(h.prov.tickers(), ["nvda"]);
  assert.equal(h.obj.manager.refCount("NVDA"), 100);
  assert.equal(h.obj.manager.symbols().length, 1);
});

test("VL-4 ein Kurs erreicht alle Zuschauer des Titels und niemanden sonst", async () => {
  const h = baue();
  const a = await verbinde(h); const b = await verbinde(h); const c = await verbinde(h);
  await abonniere(h, a, ["NVDA"]);
  await abonniere(h, b, ["NVDA"]);
  await abonniere(h, c, ["AAPL"]);

  h.prov.kurs("NVDA", 177.25, h.uhr.now());
  h.uhr.vor(1000);                 /* Zusammenfassungsfenster */
  await takte();

  const ua = a.letzte("u"), ub = b.letzte("u"), uc = c.letzte("u");
  assert.equal(ua.v[0][0], "NVDA");
  assert.equal(ua.v[0][1], 177.25);
  assert.equal(ub.v[0][1], 177.25);
  assert.equal(uc, null, "AAPL-Zuschauer bekommt keinen NVDA-Kurs");
});

test("VL-5 viele Ereignisse in einer Sekunde werden zu einer Nachricht", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  const vorher = ws.mit("u").length;

  for (let i = 0; i < 50; i++) h.prov.kurs("NVDA", 170 + i * 0.01, h.uhr.now());
  h.uhr.vor(1000);
  await takte();

  assert.equal(ws.mit("u").length - vorher, 1, "fuenfzig Ereignisse, eine Nachricht");
  assert.equal(ws.letzte("u").v[0][1], 170.49, "und zwar der letzte Stand");
});

test("VL-6 die laufende Kerze wird mitgefuehrt", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.prov.kurs("NVDA", 100, h.uhr.now());
  h.prov.kurs("NVDA", 104, h.uhr.now());
  h.prov.kurs("NVDA", 97, h.uhr.now());
  h.prov.kurs("NVDA", 101, h.uhr.now());
  h.uhr.vor(1000);
  await takte();

  const v = ws.letzte("u").v[0];           /* [sym, last, at, o, h, l, c] */
  assert.equal(v[3], 100, "Eroeffnung");
  assert.equal(v[4], 104, "Hoch");
  assert.equal(v[5], 97, "Tief");
  assert.equal(v[6], 101, "Schluss");
});

test("VL-7 wer spaeter dazukommt, bekommt sofort den bekannten Stand", async () => {
  const h = baue();
  const a = await verbinde(h);
  await abonniere(h, a, ["NVDA"]);
  h.prov.kurs("NVDA", 188.5, h.uhr.now());
  h.uhr.vor(1000);
  await takte();

  const b = await verbinde(h);
  await abonniere(h, b, ["NVDA"]);
  assert.equal(b.letzte("u").v[0][1], 188.5, "sonst bliebe der Chart bis zum naechsten Ereignis leer");
});

/* ------------------------------------------------- Abmelden und Nachlauf */

test("VL-8 der letzte Zuschauer geht: der Titel bleibt im Nachlauf abonniert", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  ws.send(JSON.stringify({ op: "unsubscribe", symbols: ["NVDA"] }));
  await takte();

  assert.deepEqual(h.obj.manager.symbols(), ["NVDA"], "sofort abbestellen hiesse: wer zurueckblaettert, zahlt neu");
  h.uhr.vor(30000);
  await takte();
  assert.deepEqual(h.obj.manager.symbols(), ["NVDA"], "der Nachlauf laeuft noch");
  h.uhr.vor(40000);
  await takte();
  assert.deepEqual(h.obj.manager.symbols(), [], "nach dem Nachlauf ist Schluss");
});

test("VL-9 wer im Nachlauf zurueckkommt, kostet keinen neuen Aufbau", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  const aufbauten = h.prov.verbindungen;
  ws.send(JSON.stringify({ op: "unsubscribe", symbols: ["NVDA"] }));
  h.uhr.vor(20000);
  await abonniere(h, ws, ["NVDA"]);
  assert.equal(h.prov.verbindungen, aufbauten, "es wurde neu verbunden, obwohl der Titel noch anlag");
});

test("VL-10 ein abgerissener Browser gibt alle seine Titel frei", async () => {
  const h = baue();
  const a = await verbinde(h); const b = await verbinde(h);
  await abonniere(h, a, ["NVDA", "AAPL"]);
  await abonniere(h, b, ["NVDA"]);
  assert.equal(h.obj.manager.refCount("NVDA"), 2);

  a.close(1006, "Funkloch");
  await takte();
  assert.equal(h.obj.manager.refCount("NVDA"), 1, "b sieht NVDA weiter an");
  assert.equal(h.obj.manager.refCount("AAPL"), 0, "AAPL sieht niemand mehr an");
  assert.equal(h.obj.clients.size, 1);
});

/* ------------------------------------------------------------- Anbieter */

test("VL-11 ein zweiter Titel wird im Reconnect-Modus sauber neu aufgebaut", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  assert.equal(h.prov.verbindungen, 1);
  await abonniere(h, ws, ["AAPL"]);
  assert.equal(h.prov.verbindungen, 2, "Reconnect-Modus baut neu auf");
  assert.deepEqual(h.prov.tickers().sort(), ["aapl", "nvda"]);
});

test("VL-12 im Dynamic-Modus wird nachgemeldet statt neu verbunden", async () => {
  const h = baue({ env: { TIINGO_DYNAMIC_SUBSCRIBE: "true" } });
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  assert.equal(h.prov.verbindungen, 1);
  await abonniere(h, ws, ["AAPL"]);
  assert.equal(h.prov.verbindungen, 1, "dieselbe Verbindung bleibt stehen");
  const letzte = h.prov.anmeldungen[h.prov.anmeldungen.length - 1];
  assert.equal(letzte.eventName, "subscribe");
  assert.deepEqual(letzte.eventData.tickers, ["aapl"]);
});

test("VL-13 bricht der Anbieter weg, erfaehrt der Browser es", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  const vorher = ws.mit("status").length;

  h.prov.abbruch(1006);
  await takte();
  h.uhr.vor(5000);
  await takte();

  assert.equal(ws.mit("status").length > vorher, true, "Stille waere die Luege");
  assert.notEqual(h.obj.manager.status().state, "LIVE");
});

test("VL-14 laesst sich gar keine Verbindung aufbauen, wird das gesagt", async () => {
  const h = baue({ anbieter: { verweigern: true } });
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  await takte();
  const s = h.obj.manager.status();
  assert.notEqual(s.state, "LIVE");
  assert.equal(ws.mit("status").length > 0, true);
});

/* ------------------------------------------------------------- Sitzung */

test("VL-15 ausserhalb der Sitzung wird nicht abonniert - Wochenende", async () => {
  const h = baue({ at: SAMSTAG });
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  assert.equal(h.prov.verbindungen, 0);
  const abgelehnt = ws.letzte("denied");
  assert.equal(abgelehnt.symbol, "NVDA");
  assert.equal(typeof abgelehnt.reason, "string");
  assert.equal(ws.letzte("hello").session, "CLOSED");
});

test("VL-16 ausserhalb der Sitzung wird nicht abonniert - Feiertag und Nacht", async () => {
  for (const [t, erwartet] of [[FEIERTAG, "CLOSED"], [NACHTS, "CLOSED"]]) {
    const h = baue({ at: t });
    const ws = await verbinde(h);
    await abonniere(h, ws, ["NVDA"]);
    assert.equal(h.prov.verbindungen, 0, "bei " + new Date(t).toISOString());
    assert.equal(ws.letzte("hello").session, erwartet);
  }
});

test("VL-17 der Handelsschluss schliesst den Strom, nicht der letzte Zuschauer", async () => {
  const h = baue({ at: Date.UTC(2026, 8, 17, 19, 59, 0) });    /* 15:59 New York */
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  assert.equal(h.obj.manager.symbols().length, 1);

  h.uhr.vor(2 * 60000);                 /* 16:01 New York */
  await h.obj.alarm();
  await takte();
  assert.deepEqual(h.obj.manager.symbols(), [], "nach Handelsschluss gibt es nichts zu streamen");
});

test("VL-18 die Restzeit der Sitzung wird in Ortszeit gerechnet", () => {
  assert.equal(sitzung(REGULAR).phase, "REGULAR");
  assert.equal(restSekunden(REGULAR), 6 * 3600, "10:00 bis 16:00 New York");
  assert.equal(restSekunden(SAMSTAG), 0);
  assert.equal(restSekunden(FEIERTAG), 0);
  /* Halber Handelstag: 27.11.2026 schliesst um 13:00. */
  const halb = Date.UTC(2026, 10, 27, 17, 0, 0);               /* 12:00 New York */
  assert.equal(sitzung(halb).earlyClose, "13:00");
  assert.equal(restSekunden(halb), 3600);
});

/* -------------------------------------------------------------- Budget */

test("VL-19 die Warnung erreicht den Browser, bevor etwas ausfaellt", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.obj.budget.noteProviderMessages(20 * 64000);            /* > 70 % */
  await takte();
  assert.equal(ws.letzte("budget").verdict, "WARNING");
  assert.equal(h.obj.manager.symbols().length, 1, "gewarnt ist nicht abgeschaltet");
});

test("VL-20 im Schutzmodus kommt nichts Neues mehr dazu", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.obj.budget.noteProviderMessages(20 * 78000);            /* > 85 % */
  await takte();
  assert.equal(ws.letzte("budget").verdict, "PROTECT");

  await abonniere(h, ws, ["AAPL"]);
  assert.equal(ws.letzte("denied").symbol, "AAPL");
  assert.equal(h.obj.manager.symbols().indexOf("AAPL"), -1);
  assert.equal(h.obj.manager.symbols().indexOf("NVDA") !== -1, true, "das Laufende bleibt laufen");
});

test("VL-21 ist das Kontingent erschoepft, wird abgeschaltet statt abgerechnet", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.obj.budget.noteProviderMessages(20 * 95000);
  await takte();
  assert.equal(ws.letzte("budget").verdict, "EXHAUSTED");
  assert.equal(ws.letzte("status").reason, "budgetExhausted");
  assert.deepEqual(h.obj.manager.symbols(), []);
});

test("VL-22 der Verbrauch wird gezaehlt, nicht geschaetzt", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  for (let i = 0; i < 40; i++) h.prov.kurs("NVDA", 170 + i, h.uhr.now());
  h.uhr.vor(1000);
  await takte();
  const s = h.obj.budget.snapshot();
  /* 40 Anbieternachrichten sind 2 Anfragen (20:1), dazu die Verbindung
     des Browsers, seine Nachricht und die gestellten Wecker. */
  assert.equal(s.used.requests >= 3, true, "gezaehlt wurden " + s.used.requests);
  assert.equal(s.used.peakSymbols >= 1, true);
});

/* -------------------------------------------------------- Widerstand */

test("VL-23 ein Neustart des Objekts verliert den Zustand, aber nicht die Faehigkeit", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.prov.kurs("NVDA", 150, h.uhr.now());
  h.uhr.vor(1000);
  await takte();

  /* Cloudflare darf ein Objekt jederzeit auslagern. Danach ist es neu -
     und muss von selbst wieder arbeiten koennen. */
  const neu = new VuLive(papierZustand(h.uhr), h.env);
  const ws2 = await neu.fetch(anfrage("https://vu-live/live", { Upgrade: "websocket" }))
    .then((a) => a.webSocket);
  ws2.send(JSON.stringify({ op: "subscribe", symbols: ["NVDA"] }));
  h.uhr.vor(500);
  await takte();
  h.prov.kurs("NVDA", 151, h.uhr.now());
  h.uhr.vor(1000);
  await takte();
  assert.equal(ws2.letzte("u").v[0][1], 151);
});

test("VL-24 ohne Zuschauer wird geschlossen und geschlafen", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  ws.close(1000, "Seite zu");
  await takte();

  h.uhr.vor(70000);
  await h.obj.alarm();
  await takte();
  assert.equal(h.obj.clients.size, 0);
  assert.deepEqual(h.obj.manager.symbols(), []);
  assert.equal(h.obj.serien.size, 0, "kein Speicher fuer niemanden");
});

test("VL-25 mehr als die Obergrenze geht nicht", async () => {
  const h = baue({ env: { MAX_SYMBOLS: 3 } });
  const ws = await verbinde(h);
  await abonniere(h, ws, ["AAPL", "NVDA", "MSFT", "VLO"]);
  assert.equal(h.obj.manager.symbols().length, 3);
  assert.equal(ws.letzte("denied").symbol, "VLO");
});

test("VL-26 Unsinn vom Browser aendert nichts", async () => {
  const h = baue();
  const ws = await verbinde(h);
  ws.send("kein json");
  ws.send(JSON.stringify({ hallo: "welt" }));
  ws.send(JSON.stringify({ op: "subscribe", symbols: [null, "", "   "] }));
  h.uhr.vor(500);
  await takte();
  assert.deepEqual(h.obj.manager.symbols(), []);
  assert.equal(h.obj.clients.size, 1, "der Socket lebt noch");
  ws.send(JSON.stringify({ op: "ping" }));
  await takte();
  assert.equal(typeof ws.letzte("pong").t, "number");
});

/* ------------------------------------------------------------ Schluessel */

test("VL-27 der Schluessel geht an den Anbieter und sonst nirgendwohin", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.prov.kurs("NVDA", 123, h.uhr.now());
  h.uhr.vor(1000);
  h.obj.budget.noteProviderMessages(20 * 64000);
  await h.obj.alarm();
  await takte();

  assert.equal(h.prov.anmeldungen[0].authorization, SCHLUESSEL, "ohne ihn gaebe es keinen Strom");

  const anBrowser = JSON.stringify(ws.empfangen);
  assert.equal(anBrowser.indexOf(SCHLUESSEL), -1, "der Schluessel war in einer Nachricht an den Browser");
  const gesundheit = JSON.stringify(h.obj.health());
  assert.equal(gesundheit.indexOf(SCHLUESSEL), -1, "der Schluessel stand im Zustandsbericht");
  const log = JSON.stringify(h.obj.protokoll);
  assert.equal(log.indexOf(SCHLUESSEL), -1, "der Schluessel stand im Protokoll");
});

test("VL-28 der Zustandsbericht nennt die Semantik und keine Kurse", async () => {
  const h = baue();
  const ws = await verbinde(h);
  await abonniere(h, ws, ["NVDA"]);
  h.prov.kurs("NVDA", 999.99, h.uhr.now());
  h.uhr.vor(1000);
  await takte();
  const g = h.obj.health();
  assert.equal(g.priceType, "REALTIME_REFERENCE");
  assert.equal(g.source, "TIINGO_IEX_LEVEL6");
  assert.equal(g.session, "REGULAR");
  assert.equal(g.values, 1);
  assert.equal(JSON.stringify(g).indexOf("999.99"), -1, "ein Zustandsbericht ist keine Kursquelle");
});

/* -------------------------------------------------------------- Worker */

function workerUmgebung(h) {
  return Object.assign({}, h.env, {
    VU_LIVE: { idFromName: (n) => n, get: () => h.obj }
  });
}

test("VL-29 der Worker laesst nur Vision-Universe-Urspruenge herein", async () => {
  const h = baue();
  const env = workerUmgebung(h);
  const gut = await worker.fetch(
    anfrage("https://live.visionuniverse.de/live",
            { Upgrade: "websocket", Origin: "https://research.visionuniverse.de" }), env);
  assert.equal(gut.status, 101);

  const boese = await worker.fetch(
    anfrage("https://live.visionuniverse.de/live",
            { Upgrade: "websocket", Origin: "https://beispiel.invalid" }), env);
  assert.equal(boese.status, 403);
  assert.equal((await boese.json()).error, "originNotAllowed");
  assert.equal(boese.headers.get("access-control-allow-origin"), null);

  const ohne = await worker.fetch(
    anfrage("https://live.visionuniverse.de/live", { Upgrade: "websocket" }), env);
  assert.equal(ohne.status, 403, "ein WebSocket kennt kein Preflight");
});

test("VL-30 der Worker antwortet ohne Upgrade mit einer Erklaerung, nicht mit einem Socket", async () => {
  const h = baue();
  const a = await worker.fetch(
    anfrage("https://live.visionuniverse.de/live", { Origin: "https://research.visionuniverse.de" }),
    workerUmgebung(h));
  assert.equal(a.status, 426);
  assert.equal((await a.json()).error, "upgradeRequired");
});

test("VL-31 /health nennt den Zustand und nicht den Schluessel", async () => {
  const h = baue();
  const a = await worker.fetch(
    anfrage("https://live.visionuniverse.de/health", { Origin: "https://research.visionuniverse.de" }),
    workerUmgebung(h));
  const k = await a.json();
  assert.equal(k.object, "vu-live");
  assert.equal(k.worker.tiingoKeyConfigured, true);
  assert.equal(JSON.stringify(k).indexOf(SCHLUESSEL), -1);
  assert.equal(a.headers.get("access-control-allow-origin"), "https://research.visionuniverse.de");
});

test("VL-32 unbekannte Pfade sind 404, und die Wurzel erklaert sich", async () => {
  const h = baue();
  const env = workerUmgebung(h);
  const wurzel = await worker.fetch(anfrage("https://live.visionuniverse.de/"), env);
  assert.equal((await wurzel.json()).priceType, "REALTIME_REFERENCE");
  const nichts = await worker.fetch(anfrage("https://live.visionuniverse.de/kurse"), env);
  assert.equal(nichts.status, 404);
});
