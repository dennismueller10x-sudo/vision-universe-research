/* =========================================================================
   VISION UNIVERSE — providers/tiingo/realtime.js

   Die Echtzeitpfade von Tiingo. Node-only, serverseitig.

   Diese Datei baut keine zweite Tiingo-Architektur. Sie benutzt den
   bestehenden Adapter aus Phase 4A - dessen Kontingentzaehlung, dessen
   Zwischenspeicher, dessen Fehlererkennung - und macht aus seinen
   Methoden Transporte im Sinne von realtime/transport.js.

     getQuote()          -> REALTIME_QUOTE  (Polling)
     getIntradayBars()   -> INTRADAY        (Polling)
     getDailyBars()      -> EOD             (Polling, langsam)
     IEX-WebSocket       -> REALTIME_STREAM (nur mit uebergebenem Socket)

   WAS HIER OFFEN IST, UND WARUM ES OFFEN BLEIBT

   Ob der vorliegende Zugang Echtzeitkurse liefert, ist NICHT bekannt. Der
   Kursendpunkt antwortet - das ist gemessen. Ob die Zahl, die er liefert,
   von jetzt oder von vor fuenfzehn Minuten ist, ist nicht gemessen, und
   die Anbieterdokumentation ist dafuer keine Quelle: sie beschreibt
   Tarife, nicht dieses Konto.

   Deshalb baut diese Datei die Wege und behauptet ueber keinen von ihnen,
   dass er Echtzeit liefert. Die Faehigkeiten `realtime` und `websocket`
   stehen im Adapter auf null und werden ausschliesslich durch
   scripts/market/verify-tiingo-realtime.mjs angehoben - an einem echten
   Zeitstempel bei offener Boerse.

   DER SCHLUESSEL

   Der WebSocket von Tiingo authentifiziert sich mit dem Token in der
   ersten Nachricht. Diese Datei laeuft ausschliesslich serverseitig; sie
   prueft das beim Laden. Ein Browser, der sie ausfuehrte, wuerde den
   Schluessel in einer Netzwerknachricht veroeffentlichen, die jedes
   Entwicklerwerkzeug anzeigt.
   ========================================================================= */
"use strict";

/* Kein Umweg, kein Hinweis, kein Notbetrieb: im Browser existiert diese
   Datei nicht. Ein Ladefehler ist hier das gewuenschte Verhalten. */
if (typeof window !== "undefined" && typeof window.document !== "undefined") {
  throw new Error("providers/tiingo/realtime.js ist serverseitig. Im Browser wuerde " +
                  "der Zugangsschluessel veroeffentlicht.");
}

const path = require("path");
const engines = path.join(__dirname, "..", "..", "quant", "engines");
const Transport = require(path.join(engines, "realtime", "transport.js"));

const PROVIDER_ID = "tiingo";
const DEFAULT_WS_URL = "wss://api.tiingo.com/iex";

/* Die Abrufabstaende. Sie stehen gegen das Stundenkontingent des freien
   Zugangs (50/h): ein Kursabruf alle 15 Sekunden waere 240 Anfragen pro
   Stunde und haette das Kontingent nach zwoelf Minuten verbraucht.

   Die Zahlen unten sind deshalb kein Komfortwert, sondern eine Rechnung:
   60 Sekunden ergeben 60 Anfragen pro Stunde - immer noch zu viel fuer
   den freien Zugang, aber im Rahmen fuer einen bezahlten. Wer den freien
   benutzt, uebergibt einen groesseren Abstand oder nimmt Intraday. Die
   Fallback-Engine faengt den Kontingentfehler ohnehin ab; besser ist, ihn
   nicht auszuloesen. */
const DEFAULT_INTERVALS = {
  REALTIME_QUOTE: 60000,
  INTRADAY: 300000,
  EOD: 6 * 3600000
};

/**
 * Wandelt eine Kursabfrage in einen Tick.
 *
 * `timestamp` ist der Zeitstempel des Anbieters, `receivedAt` unserer.
 * Beide werden gebraucht: die Luecke dazwischen ist die
 * Anbieterverzoegerung, und genau sie entscheidet spaeter darueber, ob
 * hier "LIVE" stehen darf.
 */
function quoteToTick(quote, receivedAt) {
  if (!quote || typeof quote.last !== "number" || !isFinite(quote.last)) return null;
  return {
    price: quote.last,
    timestamp: quote.timestamp || null,
    receivedAt: receivedAt,
    cumulativeVolume: typeof quote.volume === "number" ? quote.volume : null,
    currency: quote.currency || "USD",
    source: PROVIDER_ID
  };
}

/**
 * Der Nachrichtenparser des IEX-Stroms.
 *
 * ACHTUNG: die Feldreihenfolge unten ist der dokumentierten Form
 * nachgebaut und an keinem echten Strom geprueft - es gab keinen Zugang,
 * mit dem sich das haette pruefen lassen. Der Parser ist deshalb
 * defensiv: was nicht der erwarteten Form entspricht, ergibt null statt
 * eines geratenen Kurses. Eine falsch gelesene Nachricht waere ein
 * erfundener Kurs, und der ist schlimmer als eine verworfene Nachricht.
 *
 * scripts/market/verify-tiingo-realtime.mjs prueft die Form am echten
 * Strom und schreibt das Ergebnis in den Bericht.
 */
function parseIexMessage(event) {
  var raw = event && event.data !== undefined ? event.data : event;
  var msg;
  if (typeof raw === "string") {
    try { msg = JSON.parse(raw); } catch (err) { return null; }
  } else {
    msg = raw;
  }
  if (!msg || typeof msg !== "object") return null;

  /* Verwaltungsnachrichten (Anmeldung, Heartbeat) tragen keinen Kurs.
     Sie sind kein Fehler und kein Tick. */
  if (msg.messageType !== "A") return null;
  var d = msg.data;
  if (!Array.isArray(d) || d.length < 3) return null;

  /* d[0] Typ, d[1] Zeitstempel, d[2] Ticker. Nur Trades ("T") tragen
     einen ausgefuehrten Kurs; Quotes ("Q") tragen Geld und Brief, und
     aus einem Briefkurs eine Kerze zu bauen waere eine andere Zahl als
     die, die der Chart zeigt. */
  if (d[0] !== "T") return null;
  var price = null, size = null;
  for (var i = 3; i < d.length; i++) {
    if (typeof d[i] === "number" && isFinite(d[i]) && price === null && d[i] > 0) { price = d[i]; continue; }
    if (typeof d[i] === "number" && isFinite(d[i]) && price !== null && size === null) { size = d[i]; }
  }
  if (price === null) return null;
  return {
    tick: {
      price: price,
      size: size,
      timestamp: d[1] || null,
      symbol: d[2] || null,
      source: PROVIDER_ID
    },
    raw: null                 /* Die Rohnachricht wird nicht weitergereicht. */
  };
}

/**
 * Baut die Transporte fuer einen Titel.
 *
 * @param {object} opts
 *   adapter       Tiingo-Adapter aus adapter.js (Pflicht)
 *   securityId    Pflicht
 *   timers        fuer Tests
 *   intervals     {REALTIME_QUOTE, INTRADAY, EOD} in ms
 *   interval      Bar-Intervall fuer Intraday ("5min")
 *   socketFactory () -> Socket. OHNE sie gibt es keinen Stromtransport.
 *   apiKey        nur fuer die Anmeldenachricht des Stroms
 *   tickers       Symbole fuer die Anmeldung
 */
function createTiingoTransports(opts) {
  opts = opts || {};
  const adapter = opts.adapter;
  const securityId = opts.securityId;
  if (!adapter) throw new Error("createTiingoTransports: adapter fehlt.");
  if (!securityId) throw new Error("createTiingoTransports: securityId fehlt.");

  const timers = opts.timers || Transport.defaultTimers();
  const intervals = Object.assign({}, DEFAULT_INTERVALS, opts.intervals || {});
  const barInterval = opts.interval || "5min";

  const quote = Transport.createPollingTransport({
    id: "tiingo-quote", kind: "quotePolling", dataClass: "REALTIME_QUOTE",
    intervalMs: intervals.REALTIME_QUOTE, timers: timers,
    poll: function () { return adapter.getQuote(securityId); },
    toBars: function () { return []; },
    toTicks: function (data) {
      const t = quoteToTick(data, timers.now());
      return t ? [t] : [];
    }
  });

  const intraday = Transport.createPollingTransport({
    id: "tiingo-intraday", kind: "barPolling", dataClass: "INTRADAY",
    intervalMs: intervals.INTRADAY, timers: timers,
    poll: function () {
      return adapter.getIntradayBars(securityId, { interval: barInterval });
    },
    toBars: function (data) { return (data && data.bars) || []; }
  });

  const eod = Transport.createPollingTransport({
    id: "tiingo-eod", kind: "eod", dataClass: "EOD",
    intervalMs: intervals.EOD, timers: timers,
    poll: function () { return adapter.getDailyBars(securityId, opts.eodRange || {}); },
    toBars: function (data) { return (data && data.bars) || []; }
  });

  /* Der Strom nur, wenn jemand einen Socket beisteuert. Diese Datei baut
     keinen: ein hier erzeugter Socket waere eine Verbindung, die
     entsteht, weil der Code sie kann - und nicht, weil jemand sie
     wollte. */
  const stream = typeof opts.socketFactory === "function"
    ? Transport.createWebSocketTransport({
        id: "tiingo-iex-stream", dataClass: "REALTIME_STREAM",
        timers: timers,
        heartbeatMs: opts.heartbeatMs || 30000,
        connect: function () { return opts.socketFactory(opts.wsUrl || DEFAULT_WS_URL); },
        /* Die Anmeldenachricht. Sie traegt den Schluessel und wird
           deshalb hier gebaut und nirgends protokolliert. */
        onOpenSend: function () {
          return JSON.stringify({
            eventName: "subscribe",
            authorization: opts.apiKey || "",
            eventData: {
              thresholdLevel: opts.thresholdLevel === undefined ? 5 : opts.thresholdLevel,
              tickers: opts.tickers || []
            }
          });
        },
        parse: parseIexMessage
      })
    : Transport.createNullTransport({
        id: "tiingo-iex-stream", dataClass: "REALTIME_STREAM",
        reason: "transportUnavailable",
        message: "Kein Stromzugang eingerichtet. Der IEX-WebSocket von Tiingo ist mit " +
                 "diesem Konto nicht geprueft; er wird nicht auf Verdacht geoeffnet."
      });

  return {
    REALTIME_STREAM: stream,
    REALTIME_QUOTE: quote,
    INTRADAY: intraday,
    EOD: eod
  };
}

/**
 * Die Nachladefunktion fuer den Feed (§11).
 *
 * Nach einem Verbindungsabbruch fehlen Bars. Der Feed fragt hier nach
 * ihnen, bevor er wieder LIVE anzeigt - und nicht danach.
 */
function createBackfill(opts) {
  opts = opts || {};
  const adapter = opts.adapter;
  const securityId = opts.securityId;
  const interval = opts.interval || "5min";
  if (!adapter || !securityId) return null;

  return function backfill(range) {
    return adapter.getIntradayBars(securityId, {
      interval: interval,
      from: (range && range.from ? String(range.from) : "").slice(0, 10) || undefined,
      to: (range && range.to ? String(range.to) : "").slice(0, 10) || undefined
    });
  };
}

module.exports = {
  PROVIDER_ID,
  DEFAULT_WS_URL,
  DEFAULT_INTERVALS,
  quoteToTick,
  parseIexMessage,
  createTiingoTransports,
  createBackfill
};
