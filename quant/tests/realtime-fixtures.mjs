/* =========================================================================
   REALTIME — PRUEFHILFEN

   Eine Uhr, die man anhalten kann, und Transporte, die sich auf Ansage
   verhalten.

   Ein Live-Chart laesst sich nicht mit echter Zeit pruefen: ein
   Wiederaufbau mit exponentiellem Backoff, ein Verfall nach fuenf Minuten
   und ein Rueckfall nach drei Fehlversuchen ergaeben eine Testsuite, die
   eine Viertelstunde laeuft und trotzdem nur einen von zehn Ablaeufen
   trifft. Mit einer gestellten Uhr sind es Millisekunden - und, was mehr
   zaehlt, dieselben Millisekunden bei jedem Lauf.

   `advance` gibt zwischen zwei Zeitschritten die Ereignisschleife frei.
   Ohne das laeuft der Zeitgeber weiter, waehrend die Zusagen aus dem
   Abruf noch offen sind - und der Test prueft einen Zustand, den es in
   Wirklichkeit nie gibt.
   ========================================================================= */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CALENDAR = JSON.parse(
  readFileSync(join(ROOT, "quant/config/market-calendar.json"), "utf8"));
export const THRESHOLDS = JSON.parse(
  readFileSync(join(ROOT, "quant/config/realtime-thresholds.json"), "utf8"));

/* Dienstag, 8. September 2026, 14:00 New York - mitten im regulaeren
   Handel und keine Woche mit Feiertag. */
export const HANDEL = Date.parse("2026-09-08T18:00:00Z");
/* Sonntag. */
export const GESCHLOSSEN = Date.parse("2026-09-06T18:00:00Z");

export function createClock(startMs) {
  let t = startMs;
  const jobs = [];
  let seq = 0;

  const timers = {
    setTimeout(fn, ms) {
      const job = { fn, at: t + (ms || 0), seq: seq++ };
      jobs.push(job);
      return job;
    },
    clearTimeout(job) {
      const i = jobs.indexOf(job);
      if (i >= 0) jobs.splice(i, 1);
    },
    now() { return t; }
  };

  /* Laeuft bis zum Zielzeitpunkt und laesst dazwischen die offenen
     Zusagen zu Ende laufen. */
  async function advance(ms) {
    const ziel = t + ms;
    for (let schutz = 0; schutz < 10000; schutz++) {
      jobs.sort((a, b) => (a.at - b.at) || (a.seq - b.seq));
      if (!jobs.length || jobs[0].at > ziel) break;
      const job = jobs.shift();
      t = job.at;
      job.fn();
      await drain();
    }
    t = ziel;
    await drain();
  }

  /* Mikrotasks und Immediates abarbeiten. Beides ist noetig: `then`
     laeuft als Mikrotask, ein `await` in einer Kette kann eine Runde
     Immediates brauchen. */
  async function drain(runden) {
    for (let i = 0; i < (runden || 4); i++) {
      await new Promise((r) => setImmediate(r));
    }
  }

  return {
    timers, advance, drain,
    now: () => t,
    set: (ms) => { t = ms; },
    pending: () => jobs.length
  };
}

/**
 * Ein Transport, der sich steuern laesst.
 *
 * `mode` entscheidet, was der naechste Abruf tut:
 *   "ok"      liefert die vorbereiteten Bars/Ticks
 *   "empty"   antwortet ohne neue Daten
 *   ein Grund ("rateLimited", "timeout", ...) laesst ihn scheitern
 */
export function createScriptedTransport(spec) {
  const Transport = require("../engines/realtime/transport.js");
  const state = {
    mode: spec.mode || "ok",
    calls: 0,
    nextBars: spec.bars || null,
    nextTicks: spec.ticks || null
  };
  const t = Transport.createPollingTransport({
    id: spec.id || "scripted",
    kind: spec.kind || "quotePolling",
    dataClass: spec.dataClass,
    intervalMs: spec.intervalMs || 10000,
    timers: spec.timers,
    maxConsecutiveErrors: spec.maxConsecutiveErrors === undefined ? 2 : spec.maxConsecutiveErrors,
    poll() {
      state.calls++;
      if (state.mode !== "ok" && state.mode !== "empty") {
        return Promise.resolve({ available: false, reason: state.mode,
                                 message: "Vorgegeben: " + state.mode });
      }
      const data = { bars: [], ticks: [] };
      if (state.mode === "ok") {
        data.bars = typeof state.nextBars === "function"
          ? state.nextBars(spec.timers.now(), state.calls) : (state.nextBars || []);
        data.ticks = typeof state.nextTicks === "function"
          ? state.nextTicks(spec.timers.now(), state.calls) : (state.nextTicks || []);
      }
      return Promise.resolve({ available: true, data });
    },
    toBars: (d) => d.bars || [],
    toTicks: (d) => d.ticks || []
  });
  t.script = state;
  return t;
}

/** Eine Intraday-Bar auf dem 5-Minuten-Raster, relativ zu `now`. */
export function intradayBar(nowMs, minutenZurueck, close, extra) {
  const ts = nowMs - minutenZurueck * 60000;
  return Object.assign({
    timestamp: new Date(ts).toISOString(),
    date: new Date(ts).toISOString().slice(0, 10),
    open: close, high: close, low: close, close: close, volume: 1000,
    adjustmentStatus: "raw"
  }, extra || {});
}

export function tick(nowMs, sekundenZurueck, price, extra) {
  return Object.assign({
    price, timestamp: new Date(nowMs - sekundenZurueck * 1000).toISOString(), size: 10
  }, extra || {});
}

export function negotiationFor(market, opts) {
  const Capabilities = require("../engines/capabilities.js");
  const Negotiation = require("../engines/realtime/capability-negotiation.js");
  return Negotiation.negotiate({
    capabilities: Capabilities.declare((opts && opts.providerId) || "testprovider",
                                       { market: market }),
    gates: (opts && opts.gates) || { ENABLE_LIVE_MARKET_DATA: true },
    audience: (opts && opts.audience) || "internal",
    providerId: (opts && opts.providerId) || "testprovider"
  });
}

/** Baut einen Feed mit gestellter Uhr und den uebergebenen Transporten. */
export function buildFeed(opts) {
  const Feed = require("../engines/realtime/feed.js");
  const statuses = [];
  const feed = Feed.createLiveFeed(Object.assign({
    calendar: CALENDAR,
    thresholds: THRESHOLDS,
    interval: "5min",
    timeframe: "5m",
    adjustmentStatus: "raw",
    watchdogMs: 5000,
    maxReconnectAttempts: 2,
    backoffMs: [100, 200],
    onStatus: (s) => statuses.push(s)
  }, opts));
  feed.statuses = statuses;
  feed.labels = () => statuses.map((s) => s.text);
  feed.codes = () => statuses.map((s) => s.code);
  return feed;
}
