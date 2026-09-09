/* =========================================================================
   VISION UNIVERSE — verify-live-candle.mjs   (Tiingo Commercial, §5, §6, §21)

   Der Echtzeitnachweis, der nicht nach dem ersten Ereignis aufhoert.

   Der bestehende Nachweis (verify-tiingo-realtime.mjs) beantwortet eine
   Ja/Nein-Frage: kommt ueberhaupt ein Kurs? Fuer ein Live-Chart genuegt
   das nicht. Ein Chart, der sich waehrend der Handelszeit sichtbar bewegen
   soll, braucht eine ANDERE Auskunft:

     - kommen mehrere Ereignisse hintereinander?
     - in welchem Abstand?
     - bleibt die Verbindung ueber die Messdauer stehen?
     - laesst sich daraus eine laufende Minutenkerze bilden?

   Diese vier Fragen beantwortet dieses Skript, und zwar mit Zahlen.

   WAS ES BENUTZT UND WAS ES NICHT BAUT

   Nichts an der Echtzeitarchitektur ist hier neu. Der Socket laeuft ueber
   quant/engines/realtime/transport.js, die Nachrichten werden von
   providers/tiingo/realtime.js geparst, und die Minutenkerze entsteht in
   quant/engines/realtime/bar-merge.js - derselbe applyTick(), den auch das
   Chart benutzt. Ein zweiter Kerzenaufbau nur fuer den Nachweis wuerde
   genau das nicht belegen, was er belegen soll.

   THRESHOLD LEVEL

   Tiingos IEX-Strom nimmt in der Anmeldung einen thresholdLevel. Welcher
   Wert bei diesem Konto welche Nachrichten liefert, ist ungeprueft - also
   wird gemessen: derselbe Titel, dieselbe Dauer, verschiedene Stufen.
   Die Vorgabe (§4: Stufe 6) wird zuerst gemessen, danach Stufe 5 zum
   Vergleich. Was dabei herauskommt, steht im Bericht; eine Erwartung
   steht nicht darin.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/verify-live-candle.mjs
     TIINGO_API_KEY=... node scripts/market/verify-live-candle.mjs --seconds 120
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const Transport = require(join(engines, "realtime", "transport.js"));
const BarMerge = require(join(engines, "realtime", "bar-merge.js"));
const MarketHours = require(join(engines, "realtime", "market-hours.js"));
const TiingoRealtime = require(join(root, "providers", "tiingo", "realtime.js"));

const SCALE = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));
const calendar = JSON.parse(
  readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const WS_URL = process.env.TIINGO_WS_URL || TiingoRealtime.DEFAULT_WS_URL;
const SECONDS = Math.max(15, parseInt(arg("--seconds", "90"), 10) || 90);
/* Ab wie vielen Ereignissen gilt ein Strom als "liefert laufend"? Drei
   ist die kleinste Zahl, aus der sich ein Abstand und dessen Streuung
   ueberhaupt bilden lassen. Zwei Ereignisse ergeben einen Abstand ohne
   Streuung - und ein einzelner Abstand ist keine Frequenz. */
const MIN_EVENTS_FOR_STREAM = 3;
/* Wie viele Ereignisse in derselben Minute noetig sind, damit eine
   laufende Kerze mehr ist als ein Punkt. §6 verlangt ausdruecklich
   mehrere Preisupdates innerhalb derselben Kerze. */
const MIN_TICKS_IN_CANDLE = 2;

const apiKey = process.env.TIINGO_API_KEY || null;
const PRIMARY = arg("--symbol", "NVDA");
/* §5: NVDA zuerst, danach so viele weitere Canary-Titel, wie fuer die
   Kontovalidierung sinnvoll ist - ausdruecklich nicht hundert Titel
   einzeln. Zwei weitere genuegen: sie zeigen, ob der Strom am Konto
   haengt oder am Papier. */
const SECONDARY = SCALE.canary.symbols.filter((s) => s !== PRIMARY).slice(0, 2);

function pct(list, p) {
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Misst einen Stromlauf.
 *
 * Der Rueckgabewert enthaelt bewusst KEINE Kurse - nur Anzahlen,
 * Abstaende und die Form der entstandenen Kerze in relativen Groessen
 * (§34). Die Kerze selbst wird echt gebaut; sie wird nur nicht
 * ausgeliefert.
 */
function measureStream(opts) {
  return new Promise((resolve) => {
    const symbols = opts.symbols;
    const thresholdLevel = opts.thresholdLevel;
    const durationMs = opts.durationMs;

    if (typeof globalThis.WebSocket !== "function") {
      resolve({ result: "ERROR", reason: "noWebSocketRuntime",
                message: "Diese Node-Laufzeit stellt kein WebSocket bereit." });
      return;
    }

    /* Die Minutenkerze. Dieselbe Engine wie im Chart, Zeitraster 1m. */
    const series = BarMerge.createSeries({
      timeframe: "1m", interval: "1m", calendar, exchange: "XNYS",
      adjustmentStatus: null
    });

    const events = [];          /* {atMs, symbol, hasTimestamp, lagS} */
    const perSymbol = {};
    let messages = 0, adminMessages = 0, subscriptionAck = null, opened = false;
    let openedAt = null, firstEventAt = null, lastEventAt = null;
    let socketError = null, closeCode = null, closeReason = null;
    let candleTicks = 0, candleBucket = null;
    let done = false;

    const transport = Transport.createWebSocketTransport({
      id: "tiingo-iex-stream", dataClass: "REALTIME_STREAM",
      heartbeatMs: 0,
      connect: function () { return new globalThis.WebSocket(WS_URL); },
      /* Die Anmeldenachricht traegt den Schluessel. Sie wird hier gebaut,
         nirgends protokolliert und nicht in den Bericht aufgenommen. */
      onOpenSend: function () {
        return JSON.stringify({
          eventName: "subscribe",
          authorization: apiKey || "",
          eventData: { thresholdLevel: thresholdLevel,
                       tickers: symbols.map((s) => s.toLowerCase()) }
        });
      },
      parse: function (ev) {
        messages++;
        /* Verwaltungsnachrichten zaehlen mit, aber getrennt: die
           Bestaetigung der Anmeldung ist ein eigener Befund (§5). */
        try {
          const raw = ev && ev.data !== undefined ? ev.data : ev;
          const msg = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (msg && msg.messageType && msg.messageType !== "A") {
            adminMessages++;
            if (msg.messageType === "I" || msg.response) {
              subscriptionAck = {
                messageType: msg.messageType,
                code: msg.response ? msg.response.code : null,
                message: msg.response ? String(msg.response.message || "").slice(0, 120) : null,
                hasSubscriptionId: !!(msg.data && msg.data.subscriptionId)
              };
            }
          }
        } catch (err) { /* eine unlesbare Nachricht ist keine Kursnachricht */ }
        return TiingoRealtime.parseIexMessage(ev);
      }
    });

    const stop = (result, extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { transport.stop(); } catch (err) { /* geschlossen genug */ }

      const gaps = [];
      for (let i = 1; i < events.length; i++) gaps.push(events[i].atMs - events[i - 1].atMs);
      const lags = events.map((e) => e.lagS).filter((v) => v !== null);
      const running = series.last();
      const stats = series.stats();

      resolve(Object.assign({
        result,
        thresholdLevel,
        symbols,
        durationSeconds: Math.round(durationMs / 1000),
        connection: {
          opened,
          openedAfterMs: openedAt && openedAt - startedAt,
          subscriptionAck,
          messages,
          adminMessages,
          socketError,
          closeCode, closeReason,
          /* Stabilitaet ist nicht "keine Fehlermeldung", sondern: die
             Verbindung stand ueber die ganze Messdauer. */
          stableForFullDuration: opened && closeCode === null && socketError === null
        },
        events: {
          count: events.length,
          firstAfterMs: firstEventAt ? firstEventAt - startedAt : null,
          lastAfterMs: lastEventAt ? lastEventAt - startedAt : null,
          perSecond: events.length && lastEventAt && firstEventAt && lastEventAt > firstEventAt
            ? Math.round(events.length / ((lastEventAt - firstEventAt) / 1000) * 100) / 100 : null,
          gapMs: {
            min: gaps.length ? Math.min.apply(null, gaps) : null,
            median: pct(gaps, 50),
            p90: pct(gaps, 90),
            max: gaps.length ? Math.max.apply(null, gaps) : null
          },
          providerLagSeconds: {
            min: lags.length ? Math.min.apply(null, lags) : null,
            median: pct(lags, 50),
            max: lags.length ? Math.max.apply(null, lags) : null
          },
          withTimestamp: events.filter((e) => e.hasTimestamp).length,
          withSymbol: events.filter((e) => e.symbol).length,
          bySymbol: perSymbol,
          consecutive: events.length >= MIN_EVENTS_FOR_STREAM
        },
        candle: {
          bucket: running ? running.bucket : null,
          ticksInBucket: candleTicks,
          barsFormed: series.length(),
          /* Die Kerze in relativen Groessen: dass sie sich bewegt hat,
             ohne zu sagen, wo. Genau das ist der Nachweis aus §6. */
          hasOpen: !!(running && running.open !== null),
          hasHigh: !!(running && running.high !== null),
          hasLow: !!(running && running.low !== null),
          hasClose: !!(running && running.close !== null),
          hasTimestamp: !!(running && running.timestamp),
          rangeRelative: running && running.open
            ? Math.round((running.high - running.low) / running.open * 1e6) / 1e6 : null,
          closeMovedFromOpen: running && running.open
            ? Math.round((running.close / running.open - 1) * 1e6) / 1e6 : null,
          origin: running ? running.origin : null,
          confirmed: running ? running.confirmed : null,
          mergeStats: { ticks: stats.ticks, accepted: stats.accepted,
                        rejectedFuture: stats.rejectedFuture,
                        rejectedConfirmed: stats.rejectedConfirmed,
                        rejectedMalformed: stats.rejectedMalformed },
          multipleUpdatesInSameCandle: candleTicks >= MIN_TICKS_IN_CANDLE
        }
      }, extra || {}));
    };

    const startedAt = Date.now();
    const timer = setTimeout(() => {
      stop(opened
        ? (events.length >= MIN_EVENTS_FOR_STREAM ? "PASSED"
           : events.length > 0 ? "PARTIAL" : "UNKNOWN")
        : "FAILED");
    }, durationMs);

    transport.start({
      onOpen: function () { opened = true; openedAt = Date.now(); },
      onTick: function (tick) {
        const at = Date.now();
        if (!firstEventAt) firstEventAt = at;
        lastEventAt = at;
        const lagS = tick.timestamp
          ? Math.round((at - new Date(tick.timestamp).getTime()) / 1000) : null;
        events.push({ atMs: at, symbol: tick.symbol || null,
                      hasTimestamp: !!tick.timestamp, lagS });
        const key = (tick.symbol || "?").toUpperCase();
        perSymbol[key] = (perSymbol[key] || 0) + 1;

        /* Die Kerze: genau so, wie das Chart sie bauen wuerde. */
        const before = series.last();
        const r = series.applyTick({
          price: tick.price, size: tick.size,
          timestamp: tick.timestamp, receivedAt: at,
          currency: "USD", source: "tiingo", dataClass: "REALTIME_STREAM"
        });
        const after = series.last();
        if (after && after.bucket !== candleBucket) { candleBucket = after.bucket; candleTicks = 0; }
        if (r.action !== "rejected" && r.action !== "ignored") candleTicks++;
        void before;
      },
      onError: function (err) {
        socketError = { reason: err.reason, fatal: !!err.fatal };
        if (err.fatal) stop("FAILED");
      },
      onClose: function (info) {
        if (info && info.reason === "stopped") return;
        closeCode = info ? info.code : null;
        closeReason = info ? String(info.message || "").slice(0, 120) : null;
        stop(opened ? (events.length ? "PARTIAL" : "FAILED") : "FAILED",
             { closedEarly: true });
      }
    });
  });
}

async function main() {
  const session = MarketHours.sessionAt(Date.now(), { calendar, exchange: "XNYS" });
  console.log("Vision Universe — Live-Kerzen- und Stromnachweis\n");
  console.log(`  Titel:   ${PRIMARY} (danach ${SECONDARY.join(", ") || "keine weiteren"})`);
  console.log(`  Sitzung: ${session.phase}${session.closedReason ? " (" + session.closedReason + ")" : ""}` +
              `  ${session.localDate} ${session.localTime} ET`);
  console.log(`  Dauer:   ${SECONDS} s je Messung\n`);

  const runs = [];
  if (!apiKey) {
    console.log("  Kein TIINGO_API_KEY gesetzt. Es wird keine Verbindung aufgebaut.");
  } else {
    /* §4 nennt Stufe 6 ausdruecklich; Stufe 5 laeuft als Vergleich. Beide
       am selben Titel, sonst vergleicht die Messung zwei Dinge. */
    for (const level of [6, 5]) {
      console.log(`  Messung: ${PRIMARY}, thresholdLevel ${level}, ${SECONDS} s ...`);
      const r = await measureStream({ symbols: [PRIMARY], thresholdLevel: level,
                                      durationMs: SECONDS * 1000 });
      runs.push(Object.assign({ scope: "primary" }, r));
      console.log(`    ${r.result}  Verbindung ${r.connection && r.connection.opened ? "offen" : "nicht zustande"}` +
                  `, ${r.events ? r.events.count : 0} Kursereignisse` +
                  (r.events && r.events.perSecond !== null ? `, ${r.events.perSecond}/s` : "") +
                  (r.candle ? `, Kerze mit ${r.candle.ticksInBucket} Update(s)` : ""));
    }

    /* Nur wenn die erste Messung ueberhaupt etwas geliefert hat, lohnt
       sich der Kontoquerschnitt. Sonst misst man dreimal dasselbe Nein. */
    const best = runs.reduce((a, b) =>
      (b.events && a.events && b.events.count > a.events.count) ? b : a, runs[0]);
    if (SECONDARY.length && best && best.events && best.events.count > 0) {
      console.log(`  Messung: ${SECONDARY.join(", ")}, thresholdLevel ${best.thresholdLevel}, ${SECONDS} s ...`);
      const r = await measureStream({ symbols: SECONDARY, thresholdLevel: best.thresholdLevel,
                                      durationMs: SECONDS * 1000 });
      runs.push(Object.assign({ scope: "secondary" }, r));
      console.log(`    ${r.result}  ${r.events ? r.events.count : 0} Kursereignisse ` +
                  `${JSON.stringify(r.events ? r.events.bySymbol : {})}`);
    } else if (SECONDARY.length) {
      runs.push({ scope: "secondary", result: "SKIPPED", symbols: SECONDARY,
                  reason: "Die Erstmessung lieferte kein Kursereignis. Weitere Titel zu " +
                          "messen wuerde dasselbe Ergebnis wiederholen, nicht pruefen." });
    }
  }

  /* --------------------------------------------------- Bewertung */

  const measured = runs.filter((r) => r.result && r.result !== "SKIPPED");
  const withEvents = measured.filter((r) => r.events && r.events.count > 0);
  const streaming = measured.filter((r) => r.events && r.events.consecutive);
  const withCandle = measured.filter((r) => r.candle && r.candle.multipleUpdatesInSameCandle);
  const anyOpened = measured.some((r) => r.connection && r.connection.opened);

  /* LIVE_CHART_READY ist kein Optimismus. TRUE verlangt: Verbindung
     stand, mehrere aufeinanderfolgende Ereignisse, und daraus ist eine
     Minutenkerze mit mehr als einem Update entstanden. Fehlt eines
     davon bei offener Boerse: FALSE. Bei geschlossener Boerse: UNKNOWN -
     dann hat die Messung die Handelspause gemessen und nicht den Tarif. */
  let liveChartReady;
  let liveChartReason;
  if (!apiKey) {
    liveChartReady = "UNKNOWN";
    liveChartReason = "Kein Zugang konfiguriert. Es wurde nichts gemessen.";
  } else if (streaming.length && withCandle.length) {
    liveChartReady = "TRUE";
    liveChartReason = "Mehrere aufeinanderfolgende Kursereignisse, und daraus ist eine laufende " +
                      "Minutenkerze mit mehr als einem Update entstanden.";
  } else if (session.phase !== "REGULAR") {
    liveChartReady = "UNKNOWN";
    liveChartReason = `Gemessen wurde in der Phase ${session.phase}. Ein ausbleibender Kurs ` +
                      "misst dann die Handelspause und nicht den Tarif. Der Lauf ist waehrend " +
                      "der regulaeren Sitzung zu wiederholen.";
  } else if (!anyOpened) {
    liveChartReady = "FALSE";
    liveChartReason = "Die Verbindung kam bei offener Boerse nicht zustande.";
  } else if (!withEvents.length) {
    liveChartReady = "FALSE";
    liveChartReason = "Die Verbindung stand bei offener Boerse, lieferte aber keine " +
                      "Kursnachricht. Dieser Zugang bedient den Strom nicht.";
  } else {
    liveChartReady = "FALSE";
    liveChartReason = "Kursereignisse kamen an, aber zu wenige fuer eine laufende Kerze " +
                      "(mindestens " + MIN_EVENTS_FOR_STREAM + " Ereignisse und " +
                      MIN_TICKS_IN_CANDLE + " Updates in derselben Minute).";
  }

  const report = {
    generatedAt: new Date().toISOString(),
    provider: "tiingo",
    plan: "commercial",
    scope: "realtimeStreamAndLiveCandle",
    verificationLevel: apiKey ? "RUNTIME_VERIFIED" : "NOT_VERIFIED",
    note: "Der Bericht enthaelt keine Kurse. Die Minutenkerze wurde echt gebaut " +
          "(quant/engines/realtime/bar-merge.js, derselbe applyTick wie im Chart); " +
          "ausgewiesen sind ihre Form und ihre Bewegung in relativen Groessen, nicht ihre Werte.",
    run: {
      source: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      repository: process.env.GITHUB_REPOSITORY || null,
      runId: process.env.GITHUB_RUN_ID || null,
      commit: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF_NAME || null,
      wsUrl: WS_URL,
      secondsPerMeasurement: SECONDS
    },
    sessionAtRun: {
      phase: session.phase, localDate: session.localDate, localTime: session.localTime,
      closedReason: session.closedReason || null,
      note: "Ein Stromnachweis ausserhalb der regulaeren Sitzung kann nur UNKNOWN ergeben."
    },
    thresholds: {
      minEventsForStream: MIN_EVENTS_FOR_STREAM,
      minTicksInCandle: MIN_TICKS_IN_CANDLE
    },
    LIVE_CHART_READY: liveChartReady,
    liveChartReason,
    /* Die Frage aus §21 - bewegt sich ein geoeffnetes Chart sichtbar? -
       ist genau die obere, in anderen Worten. Sie steht trotzdem
       getrennt, weil sie getrennt gestellt wurde. */
    marketOpenExperience: {
      visibleMovementPossible: liveChartReady === "TRUE",
      basis: liveChartReason
    },
    measurements: runs
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, "live-candle-verification.json");
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");

  console.log(`\n  LIVE_CHART_READY = ${liveChartReady}`);
  console.log(`  ${liveChartReason}`);
  console.log(`\n  Bericht: ${file.replace(root + "/", "")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
