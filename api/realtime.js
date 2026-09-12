/* =========================================================================
   VISION UNIVERSE — api/realtime.js

   DER SERVERSEITIGE WEITERLEITER FUER DEN ECHTZEITSTROM.

     Browser  --SSE-->  diese Funktion  --WSS-->  api.tiingo.com/iex

   DER SCHLUESSEL BLEIBT HIER. Er wird aus der Umgebung gelesen, nie
   ausgeliefert, nie in eine Antwort geschrieben, nie protokolliert. Was
   den Browser erreicht, sind Kursereignisse.

   BEDARFSGESTEUERT, NICHT DAUERHAFT

   "Jede Aktie live-faehig" heisst NICHT 7.004 stehende Abonnements. Es
   heisst: wer einen Titel oeffnet, bekommt fuer diesen Titel einen
   Strom - und wenn er weiterblaettert, endet er. Jede Verbindung
   abonniert deshalb genau die Symbole ihres Aufrufs, hoechstens so
   viele wie die Vorschaukonfiguration erlaubt, und sie endet mit dem
   Aufruf. Es gibt keinen Zustand, der einen Aufruf ueberlebt.

   WELCHE SYMBOLE - ENTSCHEIDET NICHT DIESE DATEI

   Die Grenze kommt aus dem Eignungslauf ueber api/_scope.js. Hier steht
   keine Tickerliste; frueher stand hier eine mit fuenf Namen.

   KEINE STUFE IM ABONNEMENT

   thresholdLevel 5 und 0 wurden beide vom Anbieter abgelehnt
   ("not valid for your subscription tier"). Wer eine Stufe nennt, die
   sein Tarif nicht kennt, wird abgewiesen - also wird keine genannt, und
   der Anbieter setzt die des Kontos.

   KURSART UNBESTAETIGT

   Der Anbieter nennt sie nicht (priceType UNSPECIFIED). Deshalb
   `priceTypeConfirmed: false` in jedem Ereignis und "Kursaktualisierung"
   in der Oberflaeche - nie "letzter Handelskurs".

   NICHTS WIRD ERFUNDEN. Kommt kein Ereignis, wird keins gesendet; die
   Zusammenfassung sagt dann, dass keins kam, und nennt den Marktzustand
   dazu.
   ========================================================================= */
"use strict";

const Scope = require("./_scope.js");

const WS_URL = "wss://api.tiingo.com/iex";

function sende(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const scope = Scope.scope() || {};
  const regeln = scope.realtime || {};
  const grenze = Number(regeln.maxSymbolsPerConnection) || 4;
  const fenster = Number(regeln.streamWindowMs) || 50000;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  const alleAngefragten = String(url.searchParams.get("tickers") || "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  const angefragt = alleAngefragten.slice(0, grenze);

  /* Jedes Symbol einzeln beurteilen - und die Ablehnungen einzeln
     benennen. Eine Sammelabsage waere fuer den Nutzer nicht zu deuten. */
  const erlaubt = [], abgelehnt = [];

  /* Was ueber die Grenze hinausgeht, wird GENANNT und nicht
     weggeschnitten. Vorher stand hier ein stilles .slice(): wer fuenf
     Titel anfragte, bekam vier und erfuhr nichts davon. Ein Aufrufer,
     der nicht merkt, dass ihm etwas fehlt, misst hinterher das
     Falsche. */
  for (const ueberzaehlig of alleAngefragten.slice(grenze)) {
    abgelehnt.push({
      ticker: String(ueberzaehlig).toUpperCase(),
      state: "CONNECTION_LIMIT",
      reason: `Diese Verbindung fuehrt hoechstens ${grenze} Titel; dieser liegt darueber.`,
      instrumentClass: null
    });
  }

  for (const roh of angefragt) {
    const p = Scope.pruefe(roh);
    if (p.state === "SUPPORTED") erlaubt.push(p.ticker);
    else abgelehnt.push({ ticker: p.ticker || String(roh).toUpperCase(), state: p.state,
                          reason: p.reason, instrumentClass: p.instrumentClass || null });
  }

  const sitzung = Scope.sitzung();
  const start = Date.now();
  const key = Scope.schluessel();

  if (!key) {
    sende(res, "status", {
      state: "NOT_CONFIGURED", runtime: process.version, marketStatus: sitzung.marketStatus,
      reason: "TIINGO_API_KEY ist in dieser Umgebung nicht gesetzt.",
      remedy: "Vercel → Projekt → Settings → Environment Variables → TIINGO_API_KEY (Scope: Preview), danach neu bauen.",
      tickers: erlaubt, rejected: abgelehnt
    });
    return res.end();
  }
  if (!erlaubt.length) {
    const einrichtung = abgelehnt.some((a) => a.state === "SCOPE_UNREADABLE");
    sende(res, "status", {
      state: einrichtung ? "SCOPE_UNREADABLE"
        : abgelehnt.length ? abgelehnt[0].state : "NO_SYMBOL_REQUESTED",
      marketStatus: sitzung.marketStatus,
      reason: abgelehnt.length ? abgelehnt[0].reason : "Kein Titel angefragt.",
      rejected: abgelehnt
    });
    return res.end();
  }
  if (regeln.enabled === false) {
    sende(res, "status", { state: "REALTIME_DISABLED", marketStatus: sitzung.marketStatus,
      reason: "Echtzeit ist in dieser Vorschau ausgeschaltet (quant/config/realtime-preview-scope.json)." });
    return res.end();
  }
  if (typeof globalThis.WebSocket !== "function") {
    sende(res, "status", {
      state: "NO_WEBSOCKET_RUNTIME", runtime: process.version,
      reason: "Diese Laufzeit stellt keinen WebSocket-Client bereit (Node 22+ noetig).",
      remedy: "package.json → engines.node auf 22.x setzen."
    });
    return res.end();
  }

  /* Zaehler je Symbol. Ein Gesamtzaehler wuerde die Frage nicht
     beantworten, um die es geht: laeuft es fuer MEHRERE Titel? */
  const zaehler = {};
  for (const t of erlaubt) {
    zaehler[t] = { updates: 0, duplicates: 0, quotes: 0, firstAt: null, lastAt: null, latencyMs: [] };
  }
  /* Gegen Doppelverarbeitung: der Anbieter wiederholt Zeilen, und eine
     zweimal gezeichnete Kerze ist ein falscher Kurs. */
  const zuletzt = new Map();

  let updates = 0, duplikate = 0, quotes = 0, erstesUpdate = null, offen = false, beendet = false, abonniert = false;
  const socket = new globalThis.WebSocket(WS_URL);

  function aufraeumen() { clearTimeout(uhr); clearInterval(puls); }

  function schliesse(grund) {
    if (beendet) return;
    beendet = true;
    aufraeumen();
    try { socket.close(); } catch (e) { /* egal */ }
    const jetzt = Scope.sitzung();
    sende(res, "summary", {
      state: offen ? "CLOSED" : "NEVER_CONNECTED",
      reason: grund,
      connected: offen,
      subscribed: abonniert,
      symbols: erlaubt,
      rejected: abgelehnt,
      updates, duplicates: duplikate, quotes,
      firstUpdateAt: erstesUpdate,
      perSymbol: Object.fromEntries(Object.entries(zaehler).map(([t, z]) => [t, {
        updates: z.updates, duplicates: z.duplicates, quotes: z.quotes,
        firstAt: z.firstAt, lastAt: z.lastAt,
        medianLatencyMs: median(z.latencyMs)
      }])),
      durationMs: Date.now() - start,
      marketStatus: jetzt.marketStatus,
      expectsUpdates: jetzt.expectsUpdates,
      priceTypeConfirmed: false,
      verdict: Scope.verdictFor({ connected: offen, updates: updates,
                                  expectsUpdates: jetzt.expectsUpdates }),
      note: updates === 0 && !jetzt.expectsUpdates
        ? "Keine Kursereignisse - und keine zu erwarten: " +
          `${jetzt.phase}${jetzt.closedReason ? " (" + jetzt.closedReason + ")" : ""}. ` +
          "Das ist kein Fehler des Stroms."
        : null
    });
    res.end();
  }

  const uhr = setTimeout(() => schliesse("streamWindowElapsed"), fenster);
  const puls = setInterval(() => { if (!beendet) res.write(": puls\n\n"); }, 10000);

  /* Verlaesst der Browser die Seite, endet das Abonnement sofort - nicht
     erst mit dem Messfenster. Sonst haelt jede weggeblaetterte Aktie
     noch eine Anbieterverbindung. */
  req.on("close", () => schliesse("clientClosed"));
  req.on("aborted", () => schliesse("clientAborted"));

  socket.addEventListener("open", () => {
    offen = true;
    socket.send(JSON.stringify({
      eventName: "subscribe",
      authorization: key,
      eventData: { tickers: erlaubt }        /* keine Stufe: der Tarif entscheidet */
    }));
    sende(res, "status", {
      state: "CONNECTED", at: new Date().toISOString(), runtime: process.version,
      tickers: erlaubt, rejected: abgelehnt,
      marketStatus: sitzung.marketStatus, expectsUpdates: sitzung.expectsUpdates,
      session: sitzung,
      priceTypeConfirmed: false,
      priceLabel: (scope.priceSemantics && scope.priceSemantics.label) || "Kursaktualisierung",
      note: "Der Anbieter nennt die Kursart nicht (UNSPECIFIED). Es wird deshalb kein " +
            "'letzter Handelskurs' behauptet."
    });
  });

  socket.addEventListener("message", (event) => {
    if (beendet) return;
    let nachricht = null;
    try { nachricht = JSON.parse(String(event.data)); } catch (e) { return; }

    if (nachricht.messageType === "I") {
      abonniert = true;
      sende(res, "subscribed", { at: new Date().toISOString(), tickers: erlaubt,
                                 response: nachricht.response || null });
      return;
    }
    if (nachricht.messageType === "E") {
      const antwort = nachricht.response || {};
      sende(res, "status", {
        state: "PROVIDER_ERROR",
        providerCode: antwort.code === undefined ? null : antwort.code,
        reason: String(antwort.message || "unbekannt").slice(0, 200),
        remedy: "Wert von TIINGO_API_KEY in Vercel pruefen und die Tarifgrenzen des IEX-Stroms."
      });
      return;
    }
    if (nachricht.messageType !== "A" || !Array.isArray(nachricht.data)) return;

    if (istQuote(nachricht.data)) {
      const t = String(nachricht.data[3]).toUpperCase();
      if (zaehler[t]) { zaehler[t].quotes++; quotes++; }
      return;
    }

    const tick = deuteIexZeile(nachricht.data);
    if (!tick || !zaehler[tick.ticker]) return;

    /* Dieselbe Zeile zweimal ist keine zweite Bewegung. */
    const finger = `${tick.ticker}|${tick.at}|${tick.price}|${tick.size === undefined ? "" : tick.size}`;
    if (zuletzt.get(tick.ticker) === finger) {
      duplikate++; zaehler[tick.ticker].duplicates++;
      return;
    }
    zuletzt.set(tick.ticker, finger);

    const empfangen = new Date();
    const z = zaehler[tick.ticker];
    z.updates++; updates++;
    if (!z.firstAt) z.firstAt = empfangen.toISOString();
    z.lastAt = empfangen.toISOString();
    if (!erstesUpdate) erstesUpdate = empfangen.toISOString();
    const versatz = tick.at ? empfangen.getTime() - Date.parse(tick.at) : null;
    if (Number.isFinite(versatz) && versatz >= 0 && versatz < 600000) z.latencyMs.push(versatz);

    sende(res, "tick", Object.assign(tick, {
      seq: updates, seqForSymbol: z.updates,
      receivedAt: empfangen.toISOString(),
      latencyMs: Number.isFinite(versatz) ? versatz : null
    }));
  });

  socket.addEventListener("error", () => {
    if (!beendet) sende(res, "status", { state: "PROVIDER_UNAVAILABLE",
      reason: "Verbindung zum Anbieter gestoert." });
    schliesse("socketError");
  });
  socket.addEventListener("close", () => schliesse("socketClosed"));
};

/* Die IEX-Zeile ist ein Array mit fester Reihenfolge:
     [0] messageType  "Q" Quote | "T" Trade | "B" Break
     [1] timestamp    ISO
     [3] ticker
   Danach unterscheiden sich die Felder je Art. Nur was tatsaechlich eine
   Zahl ist, wird uebernommen; fehlt der Kurs, entsteht kein Tick.

   NUR ABSCHLUESSE WERDEN ZU EINEM KURS.

   Die erste Fassung hat auch Quotes durchgelassen und ihnen einen Kurs
   gegeben: die Mitte zwischen Geld und Brief, notfalls selbst
   ausgerechnet. Das sieht harmlos aus und ist es nicht. Zu diesem Kurs
   hat niemand gehandelt - er ist errechnet, nicht beobachtet. Er waere
   in dieselbe Kerze geflossen wie echte Abschluesse, und die Kerze
   haette hinterher niemand mehr auseinandersortieren koennen.

   Solange der Anbieter die Kursart nicht bestaetigt, ist das einzig
   Vertretbare, nur das zu zeichnen, was unstrittig ein bezahlter Kurs
   ist. Quotes werden gezaehlt und gemeldet - sie belegen, dass der Strom
   laeuft - aber sie bewegen den Chart nicht. */
function deuteIexZeile(zeile) {
  const art = zeile[0], zeitstempel = zeile[1], ticker = String(zeile[3] || "").toUpperCase();
  if (!ticker) return null;

  if (art === "T") {
    const preis = zahl(zeile[9]), menge = zahl(zeile[10]);
    if (preis === null) return null;
    return { ticker, kind: "TRADE", price: preis, size: menge, at: zeitstempel || null,
             priceTypeConfirmed: false };
  }
  return null;
}

/* Eine Zeile, die kein Kurs ist, aber Leben im Strom belegt. */
function istQuote(zeile) { return zeile[0] === "Q" && !!zeile[3]; }

function zahl(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function median(werte) {
  if (!werte.length) return null;
  const s = werte.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

module.exports.config = { maxDuration: 60 };
