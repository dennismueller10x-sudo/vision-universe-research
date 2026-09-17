/* =========================================================================
   VISION UNIVERSE — worker/src/tiingo-link.mjs

   Die eine Anbieterverbindung, in der Sprache von Cloudflare.

   WAS HIER NEU IST UND WAS NICHT

   Neu ist genau eine Sache: Cloudflare Workers kennen kein
   `new WebSocket(url)`. Eine ausgehende Verbindung entsteht dort ueber
   fetch() mit einem Upgrade-Kopf, und das Ergebnis traegt die Methoden
   accept() und addEventListener() statt der Eigenschaften onopen und
   onmessage. Diese Datei uebersetzt das eine ins andere.

   Alles andere ist geliehen und bleibt es:

     quant/engines/realtime/transport.js   fuehrt den Socket
     providers/tiingo/realtime.js          liest die Nachrichten
     subscription-manager.js               entscheidet, was abonniert ist

   DER SCHLUESSEL

   Er kommt aus der Umgebung des Workers (Cloudflare Secret) und steht in
   genau einer Nachricht: der Anmeldung. Er wird nicht protokolliert,
   nicht weitergereicht und erscheint in keiner Antwort an einen Browser.
   ========================================================================= */

import Transport from "../../quant/engines/realtime/transport.js";
import TiingoRealtime from "../../providers/tiingo/realtime.js";

const DEFAULT_WS_URL = "wss://api.tiingo.com/iex";
/* Gemessen am 16.09.2026: nur diese Stufe nimmt dieses Konto an. */
const THRESHOLD_LEVEL = 6;

/**
 * Ein Socket im Stil, den transport.js erwartet, aus einem Socket im
 * Stil, den Cloudflare liefert.
 */
function alsKlassischerSocket(cfSocket) {
  const schale = {
    onopen: null, onmessage: null, onerror: null, onclose: null,
    send(data) { cfSocket.send(data); },
    close(code, reason) { try { cfSocket.close(code, reason); } catch (err) { /* schon zu */ } }
  };
  cfSocket.addEventListener("message", (ev) => { if (schale.onmessage) schale.onmessage(ev); });
  cfSocket.addEventListener("error", (ev) => { if (schale.onerror) schale.onerror(ev); });
  cfSocket.addEventListener("close", (ev) => { if (schale.onclose) schale.onclose(ev); });
  return schale;
}

/**
 * @param {object} opts
 *   apiKey    Pflicht, aus dem Secret
 *   wsUrl     Standard: Tiingos IEX-Strom
 *   fetchImpl fuer Tests
 *   timers    Zeitgeber fuer den Transport (Herzschlag)
 *   onRaw(n)  jede eingehende Nachricht, fuer den Budgetwaechter
 *   log(ereignis, daten)  ohne Schluessel, ohne Kurse
 */
export function createTiingoLink(opts) {
  const apiKey = opts.apiKey;
  const wsUrl = opts.wsUrl || DEFAULT_WS_URL;
  const fetchImpl = opts.fetchImpl || fetch;
  const onRaw = opts.onRaw || (() => {});
  const log = opts.log || (() => {});

  let transport = null;
  let cfSocket = null;
  let offen = false;
  let tickers = [];

  function anmeldung(liste) {
    return JSON.stringify({
      eventName: "subscribe",
      authorization: apiKey || "",
      eventData: { thresholdLevel: THRESHOLD_LEVEL, tickers: liste.map((s) => s.toLowerCase()) }
    });
  }

  return {
    isOpen() { return offen; },
    tickers() { return tickers.slice(); },

    open(liste, handlers) {
      tickers = liste.slice();
      offen = false;
      /* Der Verbindungsaufbau ist asynchron; transport.js erwartet ihn
         synchron. Deshalb wird der Socket hier geholt und der Transport
         erst gestartet, wenn er vorliegt. */
      fetchImpl(wsUrl, { headers: { Upgrade: "websocket" } }).then((antwort) => {
        const ws = antwort.webSocket;
        if (!ws) {
          handlers.onError({ reason: "transportFailed", fatal: true,
                             message: "Kein WebSocket in der Antwort (" + antwort.status + ")." });
          return;
        }
        ws.accept();
        cfSocket = ws;
        const schale = alsKlassischerSocket(ws);

        transport = Transport.createWebSocketTransport({
          id: "tiingo-iex-stream",
          dataClass: "REALTIME_STREAM",
          /* Dieselben Uhren wie das Durable Object. Ein eigener Satz
             Zeitgeber hier waere ein zweiter Zeitbegriff im selben
             Objekt - und in einem Test eine Wartezeit, die niemand
             steuern kann. */
          timers: opts.timers,
          /* Ohne Nachricht in dreissig Sekunden meldet sich der Transport.
             Das ist kein Abbruch, aber die Anzeige muss es erfahren. */
          heartbeatMs: 30000,
          connect: () => schale,
          onOpenSend: () => anmeldung(tickers),
          parse: (ev) => {
            onRaw(1);
            return TiingoRealtime.parseIexMessage(ev);
          }
        });

        transport.start({
          onOpen: () => { offen = true; log("providerOpen", { tickers: tickers.length }); handlers.onOpen(); },
          onTick: (tick) => handlers.onTick(tick),
          onError: (err) => { log("providerError", { reason: err && err.reason }); handlers.onError(err); },
          onClose: (info) => {
            offen = false;
            log("providerClose", { code: info && info.code });
            handlers.onClose(info);
          }
        });
        /* Cloudflare feuert kein onopen auf einem bereits angenommenen
           Socket. Der Transport wartet darauf, also wird es hier
           ausgeloest - unmittelbar, weil die Verbindung steht. */
        if (schale.onopen) schale.onopen({});
      }).catch((err) => {
        handlers.onError({ reason: "transportFailed", fatal: true,
                           message: (err && err.message) || "Verbindungsaufbau fehlgeschlagen." });
      });
    },

    /**
     * Nachmeldung auf der offenen Verbindung.
     *
     * OB TIINGO DAS ANNIMMT, IST BEI DER ERSTEN FASSUNG NICHT GEMESSEN.
     * Deshalb gibt diese Funktion false zurueck, solange der Modus nicht
     * ausdruecklich auf "dynamic" gestellt wurde - und der Manager baut
     * dann neu auf. Eine Nachmeldung auf Verdacht waere der Weg in einen
     * Zustand, in dem ein Titel zu sehen ist, den niemand abonniert hat.
     */
    update(add, remove) {
      if (!opts.dynamicSupported) return false;
      if (!offen || !cfSocket) return false;
      try {
        if (add && add.length) {
          cfSocket.send(JSON.stringify({
            eventName: "subscribe", authorization: apiKey || "",
            eventData: { thresholdLevel: THRESHOLD_LEVEL, tickers: add.map((s) => s.toLowerCase()) }
          }));
        }
        if (remove && remove.length) {
          cfSocket.send(JSON.stringify({
            eventName: "unsubscribe", authorization: apiKey || "",
            eventData: { thresholdLevel: THRESHOLD_LEVEL, tickers: remove.map((s) => s.toLowerCase()) }
          }));
        }
        tickers = tickers.filter((t) => (remove || []).indexOf(t) === -1).concat(add || []);
        log("providerUpdate", { add: (add || []).length, remove: (remove || []).length });
        return true;
      } catch (err) {
        return false;
      }
    },

    close() {
      offen = false;
      try { if (transport) transport.stop(); } catch (err) { /* geschlossen genug */ }
      try { if (cfSocket) cfSocket.close(1000, "vu-live"); } catch (err) { /* schon zu */ }
      transport = null;
      cfSocket = null;
    }
  };
}

export const TIINGO_THRESHOLD_LEVEL = THRESHOLD_LEVEL;
export const TIINGO_WS_URL = DEFAULT_WS_URL;
