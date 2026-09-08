/* =========================================================================
   REALTIME §21 — DIE FALLBACK-MATRIX

   Fuenfzehn Szenarien, von A bis O. Sie sind der eigentliche Gegenstand
   dieses Workstreams: nicht der Fall, in dem alles laeuft, sondern die
   vierzehn, in denen etwas fehlt.

   Jedes Szenario prueft zweierlei - was der Chart zeigt UND was
   darueber steht. Das ist keine Verdopplung: ein Chart, der die richtigen
   Daten mit dem falschen Etikett zeigt, ist gefaehrlicher als einer, der
   gar nichts zeigt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  createClock, buildFeed, negotiationFor, createScriptedTransport,
  intradayBar, tick, HANDEL, GESCHLOSSEN, CALENDAR
} from "./realtime-fixtures.mjs";

const require = createRequire(import.meta.url);
const Transport = require("../engines/realtime/transport.js");

const ALLES = { historicalDaily: true, intraday: true, realtime: true, websocket: true };
const OHNE_STREAM = { historicalDaily: true, intraday: true, realtime: true, websocket: false };
const NUR_INTRADAY = { historicalDaily: true, intraday: true, realtime: false, websocket: false };
const NUR_EOD = { historicalDaily: true, intraday: false, realtime: false, websocket: false };
const NICHTS = { historicalDaily: false, intraday: false, realtime: false, websocket: false };

/* Baut die uebliche Aufstellung: ein Kurspfad, ein Intraday-Pfad, ein
   Tagespfad - alle steuerbar. */
function aufbau(market, opts) {
  opts = opts || {};
  const clock = createClock(opts.start === undefined ? HANDEL : opts.start);
  const quote = createScriptedTransport({
    id: "q", dataClass: "REALTIME_QUOTE", timers: clock.timers, intervalMs: 10000,
    mode: opts.quoteMode || "ok",
    ticks: (now) => [tick(now, 1, 100)]
  });
  const intraday = createScriptedTransport({
    id: "i", dataClass: "INTRADAY", kind: "barPolling", timers: clock.timers, intervalMs: 60000,
    mode: opts.intradayMode || "ok",
    bars: (now) => [intradayBar(now, 1, 99)]
  });
  const eod = createScriptedTransport({
    id: "e", dataClass: "EOD", kind: "eod", timers: clock.timers, intervalMs: 3600000,
    mode: opts.eodMode || "ok",
    bars: (now) => [intradayBar(now, 60, 98)]
  });
  const stream = opts.stream || Transport.createNullTransport({
    id: "s", dataClass: "REALTIME_STREAM", reason: "transportUnavailable" });

  const feed = buildFeed(Object.assign({
    negotiation: negotiationFor(market, opts.negotiationOpts),
    transports: { REALTIME_STREAM: stream, REALTIME_QUOTE: quote,
                  INTRADAY: intraday, EOD: eod },
    timers: clock.timers
  }, opts.feed || {}));

  return { clock, feed, quote, intraday, eod, stream };
}

/* ============================================================== A === */

test("A · Realtime verfuegbar → LIVE", async () => {
  const { clock, feed } = aufbau(OHNE_STREAM);
  feed.start();
  await clock.advance(1);
  assert.equal(feed.status().code, "LIVE");
  assert.equal(feed.status().isLive, true);
  assert.match(feed.status().text, /^LIVE · \d{2}:\d{2}:\d{2}$/);
  assert.equal(feed.activeDataClass(), "REALTIME_QUOTE");
  assert.equal(feed.connection().state, "LIVE");
});

/* ============================================================== B === */

test("B · Der Strom faellt aus → Wiederaufbau → Intraday", async () => {
  const { clock, feed, quote } = aufbau(OHNE_STREAM);
  feed.start();
  await clock.advance(1);
  assert.equal(feed.status().code, "LIVE");

  quote.script.mode = "transportFailed";
  await clock.advance(120000);

  assert.equal(feed.activeDataClass(), "INTRADAY");
  assert.equal(feed.connection().state, "FALLBACK_INTRADAY");
  assert.equal(feed.status().code, "INTRADAY");

  /* Der Weg dorthin war sichtbar - genau das fordert §22. */
  const codes = feed.codes();
  assert.ok(codes.includes("LIVE"));
  assert.ok(codes.includes("RECONNECTING"));
  assert.ok(codes.includes("INTRADAY"));
  assert.ok(codes.indexOf("RECONNECTING") < codes.lastIndexOf("INTRADAY"));
});

/* ============================================================== C === */

test("C · Kein Realtime, Intraday vorhanden → INTRADAY", async () => {
  const { clock, feed } = aufbau(NUR_INTRADAY);
  feed.start();
  await clock.advance(1);
  assert.equal(feed.activeDataClass(), "INTRADAY");
  assert.equal(feed.status().code, "INTRADAY");
  assert.equal(feed.status().isLive, false);
  assert.match(feed.status().text, /^INTRADAY · Stand \d{2}:\d{2}$/);
});

/* ============================================================== D === */

test("D · Weder Realtime noch Intraday, EOD vorhanden → EOD", async () => {
  const { clock, feed } = aufbau(NUR_EOD);
  feed.start();
  await clock.advance(1);
  assert.equal(feed.activeDataClass(), "EOD");
  assert.equal(feed.status().code, "EOD");
  assert.match(feed.status().text, /^LETZTER SCHLUSSKURS · \d{2}\.\d{2}\.\d{4}$/);
});

/* ============================================================== E === */

test("E · Nichts verfuegbar → UNAVAILABLE, kein Absturz und kein Mock", async () => {
  const { clock, feed } = aufbau(NICHTS);
  feed.start();
  await clock.advance(20000);
  assert.equal(feed.activeDataClass(), "UNAVAILABLE");
  assert.equal(feed.status().code, "UNAVAILABLE");
  assert.equal(feed.status().text, "MARKTDATEN DERZEIT NICHT VERFÜGBAR");
  assert.equal(feed.bars().length, 0);
  assert.equal(feed.connection().state, "UNAVAILABLE");
});

/* ============================================================== F === */

test("F · Realtime kehrt zurueck → Nachladen → Entdoppeln → LIVE", async () => {
  const { clock, feed, quote } = aufbau(OHNE_STREAM, {
    feed: {
      retryRealtimeAfterMs: 30000,
      /* Das Nachladen liefert genau die Bars, die waehrend des Ausfalls
         entstanden waeren - eine davon ueberschneidet sich absichtlich
         mit einer bereits vorhandenen. */
      backfill: (range) => Promise.resolve({
        available: true,
        data: { bars: [
          intradayBar(clock.now(), 15, 97),
          intradayBar(clock.now(), 10, 98),
          intradayBar(clock.now(), 10, 98)      // Dublette
        ] }
      })
    }
  });
  feed.start();
  await clock.advance(1);
  assert.equal(feed.status().code, "LIVE");

  quote.script.mode = "transportFailed";
  await clock.advance(120000);
  assert.equal(feed.activeDataClass(), "INTRADAY");

  quote.script.mode = "ok";
  await clock.advance(120000);

  assert.equal(feed.activeDataClass(), "REALTIME_QUOTE");
  assert.equal(feed.status().code, "LIVE");
  assert.ok(feed.diagnostics().counters.backfills >= 1, "Es wurde nachgeladen.");

  /* Keine doppelten Kerzen trotz Nachladen und Ueberschneidung. */
  const buckets = feed.bars().map((b) => b.bucket);
  assert.equal(new Set(buckets).size, buckets.length);
  assert.deepEqual(buckets.slice(), buckets.slice().sort());
});

/* ============================================================== G === */

test("G · Ein veralteter Echtzeitwert ist nicht mehr LIVE", async () => {
  const { clock, feed, quote } = aufbau(OHNE_STREAM);
  feed.start();
  await clock.advance(1);
  assert.equal(feed.status().code, "LIVE");

  /* Der Abruf laeuft weiter, liefert aber nichts Neues - der haeufigste
     und unauffaelligste Ausfall. */
  quote.script.mode = "empty";
  await clock.advance(60000);
  assert.notEqual(feed.status().code, "LIVE");
  assert.equal(feed.status().code, "DELAYED");
  assert.match(feed.status().text, /^VERZÖGERT · Stand/);
  /* Die Bars bleiben stehen - es fehlt nichts, es ist nur alt. */
  assert.ok(feed.bars().length >= 1);
});

/* ============================================================== H === */

test("H · Geschlossene Boerse ist kein Fehler", async () => {
  const { clock, feed } = aufbau(OHNE_STREAM, { start: GESCHLOSSEN });
  feed.start();
  await clock.advance(60000);
  const s = feed.status();
  assert.equal(s.isLive, false);
  assert.equal(s.code, "MARKET_CLOSED");
  assert.equal(feed.staleness().level, "MARKET_CLOSED");
  assert.equal(feed.staleness().session.closedReason, "weekend");
  /* Kein Rueckfall, kein Wiederaufbau, kein Fehlerzustand. */
  assert.equal(feed.connection().state === "RECONNECTING", false);
  assert.equal(feed.diagnostics().retryCount, 0);
});

/* ============================================================== I === */

test("I · Bei einer Zeitueberschreitung bleibt der letzte belastbare Stand sichtbar", async () => {
  const { clock, feed, quote, intraday } = aufbau(OHNE_STREAM);
  feed.start();
  await clock.advance(1);
  const barsVorher = feed.bars().length;
  assert.ok(barsVorher >= 1);

  quote.script.mode = "timeout";
  intraday.script.mode = "timeout";
  await clock.advance(300000);

  assert.ok(feed.bars().length >= barsVorher, "Der Chart wurde nicht geleert.");
  assert.notEqual(feed.status().code, "LIVE");
  assert.ok(["EOD", "DELAYED", "RECONNECTING", "INTRADAY", "MARKET_CLOSED"]
    .includes(feed.status().code), "Status: " + feed.status().code);
});

/* ============================================================== J === */

test("J · Ein erschoepftes Kontingent fuehrt zu einem geordneten Rueckfall", async () => {
  const { clock, feed, quote } = aufbau(OHNE_STREAM);
  feed.start();
  await clock.advance(1);
  quote.script.mode = "rateLimited";
  await clock.advance(180000);

  assert.notEqual(feed.activeDataClass(), "REALTIME_QUOTE");
  assert.ok(["INTRADAY", "EOD"].includes(feed.activeDataClass()));
  const diag = feed.diagnostics();
  assert.ok(diag.fallbackReason !== null);
  assert.equal(feed.status().isLive, false);
});

/* ============================================================== K === */

test("K · Ein wiederholter Zeitstempel erzeugt keine zweite Kerze", async () => {
  const clock = createClock(HANDEL);
  const feste = intradayBar(HANDEL, 5, 100);
  const intraday = createScriptedTransport({
    id: "i", dataClass: "INTRADAY", kind: "barPolling", timers: clock.timers,
    intervalMs: 10000, bars: () => [feste]         // immer dieselbe Bar
  });
  const feed = buildFeed({
    negotiation: negotiationFor(NUR_INTRADAY),
    transports: { INTRADAY: intraday },
    timers: clock.timers
  });
  feed.start();
  await clock.advance(60000);
  assert.equal(feed.bars().length, 1);
  assert.ok(feed.diagnostics().mergeStats.duplicates >= 3);
});

/* ============================================================== L === */

test("L · Bars in falscher Reihenfolge landen deterministisch richtig", async () => {
  const clock = createClock(HANDEL);
  let runde = 0;
  const intraday = createScriptedTransport({
    id: "i", dataClass: "INTRADAY", kind: "barPolling", timers: clock.timers,
    intervalMs: 10000,
    bars: () => {
      runde++;
      /* Absichtlich verkehrt: die spaetere Bar kommt zuerst. */
      if (runde === 1) return [intradayBar(HANDEL, 5, 101)];
      if (runde === 2) return [intradayBar(HANDEL, 15, 99)];
      if (runde === 3) return [intradayBar(HANDEL, 10, 100)];
      return [];
    }
  });
  const feed = buildFeed({
    negotiation: negotiationFor(NUR_INTRADAY),
    transports: { INTRADAY: intraday },
    timers: clock.timers
  });
  feed.start();
  await clock.advance(40000);

  const bars = feed.bars();
  assert.equal(bars.length, 3);
  const buckets = bars.map((b) => b.bucket);
  assert.deepEqual(buckets, buckets.slice().sort(), "Die Reihe ist aufsteigend.");
  assert.deepEqual(bars.map((b) => b.close), [99, 100, 101]);
  assert.ok(feed.diagnostics().mergeStats.outOfOrder >= 1);
});

/* ============================================================== M === */

test("M · Ein Split-Tag erzeugt keinen erfundenen Kurssprung", async () => {
  const clock = createClock(HANDEL);
  let runde = 0;
  const intraday = createScriptedTransport({
    id: "i", dataClass: "INTRADAY", kind: "barPolling", timers: clock.timers,
    intervalMs: 10000,
    bars: () => {
      runde++;
      if (runde === 1) return [intradayBar(HANDEL, 20, 200), intradayBar(HANDEL, 15, 202)];
      if (runde === 2) return [intradayBar(HANDEL, 10, 101, { splitFactor: 2 })];
      return [];
    }
  });
  const feed = buildFeed({
    negotiation: negotiationFor(NUR_INTRADAY),
    transports: { INTRADAY: intraday },
    timers: clock.timers
  });
  feed.start();
  await clock.advance(25000);

  const diag = feed.diagnostics();
  assert.equal(diag.requiresReload, true,
    "Der Split macht die Reihe nachladepflichtig statt sie zu glaetten.");
  assert.match(feed.series().reloadReason(), /^split:/);
  assert.equal(diag.mergeStats.corporateActions, 1);
});

/* ============================================================== N === */

test("N · Ueber die Zeitumstellung hinweg bleibt die Sitzung richtig", async () => {
  /* 6. Maerz 2026 (Winterzeit) und 9. Maerz 2026 (Sommerzeit), beide
     um 09:35 Ortszeit. */
  const vorher = aufbau(NUR_INTRADAY, { start: Date.parse("2026-03-06T14:35:00Z") });
  vorher.feed.start();
  await vorher.clock.advance(1);
  assert.equal(vorher.feed.staleness().session.phase, "REGULAR");
  assert.equal(vorher.feed.staleness().session.localTime.slice(0, 5), "09:35");

  const nachher = aufbau(NUR_INTRADAY, { start: Date.parse("2026-03-09T13:35:00Z") });
  nachher.feed.start();
  await nachher.clock.advance(1);
  assert.equal(nachher.feed.staleness().session.phase, "REGULAR");
  assert.equal(nachher.feed.staleness().session.localTime.slice(0, 5), "09:35");

  /* Beide Sitzungen liefern denselben Eimernamen fuer dieselbe
     Boersenzeit - der Chart springt an der Umstellung nicht. */
  assert.equal(vorher.feed.bars()[0].bucket.slice(10), nachher.feed.bars()[0].bucket.slice(10));
});

/* ============================================================== O === */

test("O · Ohne Zugangsschluessel gibt es keinen Absturz, sondern einen Zustand", async () => {
  const clock = createClock(HANDEL);
  const Tiingo = require("../../providers/tiingo/adapter.js");
  const TiingoRealtime = require("../../providers/tiingo/realtime.js");

  /* Der Adapter ohne Schluessel. Er stellt keine Anfrage und meldet
     notConfigured - das ist der Normalzustand jeder Installation. */
  const provider = Tiingo.createTiingoProvider({ apiKey: null });
  const transports = TiingoRealtime.createTiingoTransports({
    adapter: provider, securityId: "AAPL", timers: clock.timers,
    intervals: { REALTIME_QUOTE: 10000, INTRADAY: 20000, EOD: 60000 }
  });

  const feed = buildFeed({
    negotiation: negotiationFor({ historicalDaily: true, intraday: true }),
    transports, timers: clock.timers
  });
  feed.start();
  await clock.advance(120000);

  assert.equal(feed.status().isLive, false);
  assert.ok(["UNAVAILABLE", "EOD", "INTRADAY", "CONNECTING", "MARKET_CLOSED", "DELAYED"]
    .includes(feed.status().code), "Status: " + feed.status().code);
  assert.equal(feed.bars().length, 0, "Ohne Zugang entstehen keine Bars - und keine erfundenen.");
  assert.equal(provider.healthCheck().status, "not_configured");
});
