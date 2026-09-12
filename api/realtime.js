/* =========================================================================
   VISION UNIVERSE — api/realtime.js

   DER SERVERSEITIGE WEITERLEITER FUER DEN ECHTZEITSTROM.

   Bisher war der Strom im Backend belegt und im Produkt unsichtbar: eine
   statische Seite kann keinen Tiingo-WebSocket oeffnen, ohne den
   Zugangsschluessel in den Browser zu legen. Genau diese Luecke schliesst
   diese Funktion - und nur sie.

     Browser  --SSE-->  diese Funktion  --WSS-->  api.tiingo.com/iex

   DER SCHLUESSEL BLEIBT HIER. Er wird aus der Umgebung gelesen, nie
   ausgeliefert, nie in eine Antwort geschrieben und nie protokolliert.
   Was den Browser erreicht, sind Kursereignisse - kein Zugangsmittel.

   WAS DIESE FUNKTION NICHT TUT

   Sie erfindet nichts. Kommt kein Ereignis, sendet sie keins; sie sagt
   stattdessen, dass keins kam, und nennt den Zustand der Boerse dazu.
   Ein simulierter Kursverlauf waere hier die schlimmste aller Varianten:
   er saehe genau aus wie der Erfolg, auf den seit Tagen gewartet wird.

   KURSART UNBESTAETIGT

   Der Anbieter nennt die Art des Kurses nicht (priceType UNSPECIFIED,
   quant/data/market/commercial/live-candle-verification.json). Diese
   Funktion reicht sie deshalb als `priceTypeConfirmed: false` durch, und
   die Oberflaeche schreibt "Kursaktualisierung", nicht "letzter
   Handelskurs".

   LIZENZGRENZE

   Ausgeliefert werden ausschliesslich die Titel, fuer die eine datierte
   Eigentuemerfreigabe vorliegt (quant/config/development-preview.json).
   Jeder andere Titel wird abgelehnt - nicht stillschweigend, sondern mit
   Begruendung.
   ========================================================================= */
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const Contract = require("../quant/engines/market-data-contract.js");
const MarketHours = require("../quant/engines/realtime/market-hours.js");

const WS_URL = "wss://api.tiingo.com/iex";
/* Die Funktion beendet sich selbst, bevor die Plattform sie beendet: ein
   abgeschnittener Strom sieht im Browser aus wie ein Fehler, ein sauber
   geschlossener nicht. Der Browser verbindet danach neu. */
const STREAM_MS = 50000;
/* KEINE STUFE MEHR - DER TARIF ENTSCHEIDET.

   Hier stand erst 5 (Trades und Quotes), dann 0. Der Anbieter hat BEIDE
   abgelehnt, mit derselben Meldung:

     "thresholdLevel not valid for your subscription tier"  (Code 400)

   Damit ist die Zahl nicht die Frage. Wer eine Stufe nennt, die sein
   Tarif nicht kennt, wird abgewiesen - also wird keine genannt. Der
   Anbieter setzt dann die Stufe, die zum Konto gehoert. Bleibt es bei
   der Ablehnung, liegt es am Tarif und nicht an dieser Datei; die
   Meldung des Anbieters steht dann unveraendert im Bericht. */

function lies(pfad, fallback) {
  try { return JSON.parse(readFileSync(join(process.cwd(), pfad), "utf8")); }
  catch (e) { return fallback; }
}

/* Die Freigabeliste. Sie kommt aus der Datei, nicht aus dem Code - wer
   sie aendert, aendert eine datierte Entscheidung und keinen Konstanten-
   wert. */
/* Kommt null zurueck, ist die FREIGABEDATEI nicht lesbar - das ist etwas
   anderes als "dieser Titel ist nicht freigegeben". Beides zu vermischen
   hiesse, einen Einrichtungsfehler als Lizenzentscheidung auszugeben.
   Auf Vercel kommt die Datei ueber functions.includeFiles mit. */
function erlaubteTitel() {
  const freigabe = lies("quant/config/development-preview.json", null);
  if (!freigabe || !Array.isArray(freigabe.scope)) return null;
  return freigabe.scope;
}

function sende(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* Das Produktuniversum - dieselbe Datei, die auch /api/intraday liest.
   Fehlt sie, bleibt es bei der engeren Freigabe. */
function produktUniversum() {
  const liste = lies("quant/data/proof/product-tickers.json", null);
  if (!liste || !Array.isArray(liste.tickers) || !liste.tickers.length) return null;
  return liste.tickers;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const angefragt = String(url.searchParams.get("tickers") || "")
    .toUpperCase().split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5);

  /* DERSELBE UMFANG WIE BEI INTRADAY.

     Historical, Intraday und Realtime sind EINE Infrastruktur. Zwei
     verschiedene Titelmengen darin waeren zwei Infrastrukturen, und
     jedes Frontend muesste beide kennen - genau das, was der
     Integrationsvertrag ausschliesst.

     Die Rueckfallrichtung bleibt eng: ohne lesbare Produktliste gilt
     die schmalere Freigabe, nie umgekehrt. */
  const erlaubt = erlaubteTitel();
  const produkt = produktUniversum();
  const zulaessig = (t) => produkt ? (produkt.includes(t) || (erlaubt || []).includes(t))
                                   : (erlaubt || []).includes(t);
  const tickers = (erlaubt || produkt) ? angefragt.filter(zulaessig) : [];
  const abgelehnt = (erlaubt || produkt) ? angefragt.filter((t) => !zulaessig(t)) : angefragt;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  /* .trim(): ein eingefuegter Schluessel bringt haeufig einen
     Zeilenumbruch oder ein Leerzeichen mit. Der Anbieter lehnt ihn dann
     ab, und die Meldung sieht aus wie ein Rechteproblem statt wie ein
     Kopierfehler. */
  const key = (process.env.TIINGO_API_KEY || "").trim();
  const start = Date.now();

  if (!key) {
    /* Kein Schluessel ist kein Fehler dieser Funktion, sondern eine
       fehlende Einstellung - und sie wird benannt, damit niemand nach
       einem Programmfehler sucht. */
    sende(res, "status", {
      state: "NOT_CONFIGURED",
      contractState: Contract.resolveRealtime({ connection: "NOT_CONFIGURED",
                                                tradingOpen: true }).state,
      runtime: process.version,
      reason: "TIINGO_API_KEY ist in dieser Umgebung nicht gesetzt.",
      remedy: "Vercel → Projekt → Settings → Environment Variables → TIINGO_API_KEY (Scope: Preview).",
      tickers, rejected: abgelehnt
    });
    return res.end();
  }

  if (!erlaubt && !produkt) {
    sende(res, "status", {
      state: "SCOPE_UNREADABLE",
      contractState: "PROVIDER_UNAVAILABLE",
      reason: "Die Freigabeliste (quant/config/development-preview.json) ist zur Laufzeit nicht lesbar.",
      remedy: "vercel.json → functions.includeFiles muss quant/config/** enthalten.",
      rejected: abgelehnt
    });
    return res.end();
  }

  if (!tickers.length) {
    sende(res, "status", {
      state: "NOT_PERMITTED",
      contractState: Contract.resolveRealtime({ eligible: false }).state,
      reason: abgelehnt.length
        ? "Diese Titel gehoeren nicht zum Produktuniversum."
        : "Kein Titel angefragt.",
      scope: produkt ? "PRODUCT_UNIVERSE" : "DEVELOPMENT_PREVIEW_SCOPE",
      scopeSize: produkt ? produkt.length : (erlaubt || []).length,
      rejected: abgelehnt
    });
    return res.end();
  }

  if (typeof globalThis.WebSocket !== "function") {
    sende(res, "status", {
      state: "NO_WEBSOCKET_RUNTIME",
      reason: "Diese Laufzeit stellt keinen WebSocket-Client bereit (Node 22+ noetig).",
      remedy: "vercel.json → functions.runtime auf nodejs22.x setzen.",
      runtime: process.version
    });
    return res.end();
  }

  let updates = 0, erstesUpdate = null, offen = false, beendet = false;
  const socket = new globalThis.WebSocket(WS_URL);

  function schliesse(grund) {
    if (beendet) return;
    beendet = true;
    try { socket.close(); } catch (e) { /* egal */ }
    sende(res, "summary", {
      state: offen ? "CLOSED" : "NEVER_CONNECTED",
      reason: grund,
      connected: offen,
      updates,
      firstUpdateAt: erstesUpdate,
      durationMs: Date.now() - start,
      priceTypeConfirmed: false,
      note: updates === 0
        ? "Keine Kursereignisse im Messfenster. Ausserhalb der Handelszeiten ist das der Normalfall - " +
          "es wird nichts erfunden, um den Chart bewegt aussehen zu lassen."
        : null
    });
    res.end();
  }

  const uhr = setTimeout(() => schliesse("streamWindowElapsed"), STREAM_MS);
  /* Ein Lebenszeichen alle zehn Sekunden: ohne es schliessen manche
     Zwischenschichten eine stille Verbindung. */
  const puls = setInterval(() => { if (!beendet) res.write(": puls\n\n"); }, 10000);
  const aufraeumen = () => { clearTimeout(uhr); clearInterval(puls); };

  req.on("close", () => { aufraeumen(); schliesse("clientClosed"); });

  socket.addEventListener("open", () => {
    offen = true;
    socket.send(JSON.stringify({
      eventName: "subscribe",
      authorization: key,
      eventData: { tickers }
    }));
    /* Die Boersenlage gehoert in die Verbindungsmeldung: sie
       entscheidet, ob ein schweigender Strom MARKET_CLOSED ist oder
       REALTIME_UNAVAILABLE. Ohne sie muesste das Frontend raten - und
       jedes Frontend anders. */
    const kalender = lies("quant/config/market-calendar.json", null);
    const sitzung = Contract.marketSession(MarketHours, new Date(),
      kalender ? { calendar: kalender } : {});
    sende(res, "status", {
      state: "CONNECTED",
      contractState: Contract.resolveRealtime({
        connection: "CONNECTED", tradingOpen: sitzung.tradingOpen }).state,
      marketSession: sitzung,
      at: new Date().toISOString(),
      runtime: process.version,
      tickers, rejected: abgelehnt,
      url: WS_URL,
      priceTypeConfirmed: false,
      priceLabel: "Kursaktualisierung",
      note: "Der Anbieter nennt die Kursart nicht (UNSPECIFIED). Es wird deshalb kein " +
            "'letzter Handelskurs' behauptet."
    });
  });

  socket.addEventListener("message", (event) => {
    if (beendet) return;
    let nachricht = null;
    try { nachricht = JSON.parse(String(event.data)); } catch (e) { return; }

    if (nachricht.messageType === "I") {
      sende(res, "subscribed", { at: new Date().toISOString(), response: nachricht.response || null });
      return;
    }
    if (nachricht.messageType === "E") {
      /* Ein Fehler des Anbieters gehoert weitergereicht - aber ohne
         alles, was ein Zugangsmittel sein koennte. */
      /* Die Meldung des Anbieters WOERTLICH weitergeben (gekuerzt, nie
         mit Zugangsmittel): ohne sie sieht ein abgelehnter Schluessel
         genauso aus wie ein fehlendes Recht. Der Code kommt mit. */
      const antwort = nachricht.response || {};
      sende(res, "status", {
        state: "PROVIDER_ERROR",
        providerCode: antwort.code === undefined ? null : antwort.code,
        reason: String(antwort.message || "unbekannt").slice(0, 200),
        remedy: "Wert von TIINGO_API_KEY in Vercel pruefen: exakt der Token, ohne " +
                "Anfuehrungszeichen, ohne Zeilenumbruch, Scope Preview."
      });
      return;
    }
    if (nachricht.messageType !== "A" || !Array.isArray(nachricht.data)) return;

    const tick = deuteIexZeile(nachricht.data);
    if (!tick) return;
    updates++;
    if (!erstesUpdate) erstesUpdate = new Date().toISOString();
    sende(res, "tick", Object.assign(tick, { seq: updates, receivedAt: new Date().toISOString() }));
  });

  socket.addEventListener("error", () => {
    if (!beendet) sende(res, "status", { state: "SOCKET_ERROR", reason: "Verbindung zum Anbieter gestoert." });
    aufraeumen(); schliesse("socketError");
  });
  socket.addEventListener("close", () => { aufraeumen(); schliesse("socketClosed"); });
};

/* Die IEX-Zeile des Anbieters ist ein Array mit fester Reihenfolge:
     [0] messageType  "Q" Quote | "T" Trade | "B" Break
     [1] timestamp    ISO
     [3] ticker
   Danach unterscheiden sich die Felder je Art. Nur was tatsaechlich eine
   Zahl ist, wird uebernommen; fehlt der Kurs, entsteht kein Tick. */
function deuteIexZeile(zeile) {
  const art = zeile[0], zeitstempel = zeile[1], ticker = String(zeile[3] || "").toUpperCase();
  if (!ticker) return null;

  if (art === "T") {
    const preis = zahl(zeile[9]), menge = zahl(zeile[10]);
    if (preis === null) return null;
    return { ticker, kind: "TRADE", price: preis, size: menge, at: zeitstempel || null,
             priceTypeConfirmed: false };
  }
  /* Welche Zeilen kommen, entscheidet der Tarif. Beide Arten werden
     gedeutet: "T" ist ein Abschluss, "Q" die Mitte aus Geld und Brief.
     Der Chart nimmt, was kommt - und schreibt nie "Handelskurs", wenn
     es eine Quote-Mitte war. */
  if (art === "Q") {
    const bid = zahl(zeile[5]), mid = zahl(zeile[6]), ask = zahl(zeile[7]);
    const preis = mid !== null ? mid : (bid !== null && ask !== null ? (bid + ask) / 2 : null);
    if (preis === null) return null;
    return { ticker, kind: "QUOTE", price: preis, bid, ask, at: zeitstempel || null,
             priceTypeConfirmed: false };
  }
  return null;
}

function zahl(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }

module.exports.config = { maxDuration: 60 };
