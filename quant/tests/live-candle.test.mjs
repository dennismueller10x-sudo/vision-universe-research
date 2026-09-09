/* =========================================================================
   VISION UNIVERSE — live-candle.test.mjs   (Tiingo Commercial, §5, §6, §33)

   Prueft den Weg vom Stromereignis zur laufenden Minutenkerze.

   Der Anbieter wird durch einen minimalen WebSocket-Server ersetzt, der
   IEX-Nachrichten in Tiingos Form sendet. Alles danach ist echt: der
   Transport aus quant/engines/realtime/transport.js, der Parser aus
   providers/tiingo/realtime.js und die Kerzenbildung aus
   quant/engines/realtime/bar-merge.js.

   Warum ein echter Socket und kein Attrappenobjekt: der Fehler, den
   dieser Test finden soll, sitzt selten in der Rechnung. Er sitzt in der
   Anmeldenachricht, im Nachrichtenformat und darin, dass ein Tick mit
   fremdem Zeitstempel in den falschen Eimer faellt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const Transport = require(join(engines, "realtime", "transport.js"));
const BarMerge = require(join(engines, "realtime", "bar-merge.js"));
const TiingoRealtime = require(join(root, "providers", "tiingo", "realtime.js"));
const calendar = JSON.parse(
  readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

/* ------------------------------------------- Minimaler WebSocket-Server

   Nur so viel RFC 6455, wie dieser Test braucht: Handschlag, Textrahmen
   senden, eingehende Rahmen entgegennehmen. Keine Fragmentierung, keine
   Erweiterungen - die schickt der Client hier nicht. */
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function encodeTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = len;
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer) {
  /* Reicht fuer die eine kurze Anmeldenachricht des Clients. */
  const out = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let len = buffer[offset + 1] & 0x7f;
    let pos = offset + 2;
    if (len === 126) { len = buffer.readUInt16BE(pos); pos += 2; }
    else if (len === 127) { len = Number(buffer.readBigUInt64BE(pos)); pos += 8; }
    let mask = null;
    if (masked) { mask = buffer.subarray(pos, pos + 4); pos += 4; }
    if (pos + len > buffer.length) break;
    const data = Buffer.from(buffer.subarray(pos, pos + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    if (opcode === 0x1) out.push(data.toString("utf8"));
    offset = pos + len;
  }
  return out;
}

/**
 * @param {object} opts
 *   ticks      [{symbol, price, size, atMs}] - was gesendet wird
 *   ackFirst   sendet vor den Kursen eine Bestaetigung
 */
function startWsServer(opts = {}) {
  const received = [];
  const sockets = new Set();
  const server = createServer();
  server.on("upgrade", (req, socket) => {
    /* Ohne diese Buchfuehrung haengt der Test. server.close() nimmt nur
       keine neuen Verbindungen mehr an; eine offene Upgrade-Verbindung
       haelt die Ereignisschleife weiter am Leben, und node --test wartet
       dann auf einen Server, den es fuer geschlossen haelt. */
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const key = req.headers["sec-websocket-key"];
    const accept = createHash("sha1").update(key + WS_MAGIC).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + accept + "\r\n\r\n");
    socket.on("data", (chunk) => { decodeFrames(chunk).forEach((m) => received.push(m)); });
    socket.on("error", () => { /* Test-Socket */ });

    if (opts.ackFirst !== false) {
      socket.write(encodeTextFrame(JSON.stringify({
        messageType: "I",
        response: { code: 200, message: "Success" },
        data: { subscriptionId: 4242 }
      })));
    }
    let i = 0;
    const send = () => {
      if (i >= (opts.ticks || []).length) return;
      const t = opts.ticks[i++];
      socket.write(encodeTextFrame(JSON.stringify({
        messageType: "A",
        service: "iex",
        /* Tiingos Form: [typ, zeitstempel, ticker, ...zahlen].
           "T" ist ein ausgefuehrter Trade, "Q" ein Geld-/Briefkurs. */
        data: [t.kind || "T", new Date(t.atMs).toISOString(), t.symbol, t.price, t.size]
      })));
      setTimeout(send, opts.intervalMs === undefined ? 15 : opts.intervalMs);
    };
    setTimeout(send, 10);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        server, port: server.address().port, received: () => received,
        close: () => {
          for (const socket of sockets) { try { socket.destroy(); } catch (err) { /* zu */ } }
          sockets.clear();
          server.close();
        }
      }));
  });
}

/** Baut die Messkette genau so auf wie verify-live-candle.mjs. */
function collect(port, opts = {}) {
  return new Promise((resolve) => {
    /* Die Uhr der Kerzenreihe kann festgehalten werden.

       Ohne das haengt der Test an der Wanduhr: faellt zwischen dem letzten
       Tick und der Pruefung ein Minutenwechsel, gilt die Kerze als
       abgeschlossen, und der Test scheitert an der Uhrzeit statt an der
       Sache. Genau das ist einmal passiert. */
    const series = BarMerge.createSeries({
      timeframe: "1m", interval: "1m", calendar, exchange: "XNYS", adjustmentStatus: null,
      now: opts.now
    });
    const events = [];
    let ack = null, opened = false, messages = 0;

    const transport = Transport.createWebSocketTransport({
      id: "test-stream", dataClass: "REALTIME_STREAM",
      connect: () => new globalThis.WebSocket(`ws://127.0.0.1:${port}`),
      onOpenSend: () => JSON.stringify({
        eventName: "subscribe", authorization: "test-key",
        eventData: { thresholdLevel: opts.thresholdLevel === undefined ? 6 : opts.thresholdLevel,
                     tickers: (opts.symbols || ["nvda"]) }
      }),
      parse: (ev) => {
        messages++;
        try {
          const raw = ev && ev.data !== undefined ? ev.data : ev;
          const msg = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (msg && msg.messageType === "I") ack = msg.response || null;
        } catch (err) { /* egal */ }
        return TiingoRealtime.parseIexMessage(ev);
      }
    });

    const finish = () => {
      try { transport.stop(); } catch (err) { /* zu */ }
      resolve({ events, ack, opened, messages, series });
    };
    setTimeout(finish, opts.durationMs || 700);

    transport.start({
      onOpen: () => { opened = true; },
      onTick: (tick) => {
        events.push(tick);
        series.applyTick({ price: tick.price, size: tick.size, timestamp: tick.timestamp,
                           receivedAt: Date.now(), source: "tiingo",
                           dataClass: "REALTIME_STREAM" });
      },
      onError: () => {},
      onClose: () => {}
    });
  });
}

/* --------------------------------------------------------------- Tests */

test("LC1 — Anmeldung, Bestaetigung und mehrere aufeinanderfolgende Kursereignisse", async () => {
  const now = Date.now();
  const ticks = [];
  for (let i = 0; i < 6; i++) {
    ticks.push({ symbol: "NVDA", price: 184.20 + i * 0.04, size: 100 + i, atMs: now + i * 20 });
  }
  const srv = await startWsServer({ ticks, intervalMs: 15 });
  try {
    const r = await collect(srv.port, { durationMs: 900 });

    assert.ok(r.opened, "die Verbindung muss zustande kommen");
    /* §5: Anmeldung und Bestaetigung, nicht nur ein offener Socket. */
    const subscribe = JSON.parse(srv.received()[0]);
    assert.equal(subscribe.eventName, "subscribe");
    assert.equal(subscribe.eventData.thresholdLevel, 6, "thresholdLevel 6 wie in §4 vorgegeben");
    assert.deepEqual(subscribe.eventData.tickers, ["nvda"]);
    assert.ok(r.ack && r.ack.code === 200, "die Bestaetigung des Anbieters muss erkannt werden");

    /* §5: nicht nach einem einzelnen Ereignis stoppen. */
    assert.ok(r.events.length >= 5, `mindestens 5 Ereignisse erwartet, ${r.events.length} erhalten`);
    r.events.forEach((e) => {
      assert.equal(e.symbol, "NVDA", "jedes Ereignis traegt sein Symbol");
      assert.ok(e.timestamp, "jedes Ereignis traegt einen Zeitstempel");
      assert.ok(typeof e.price === "number" && e.price > 0, "jedes Ereignis traegt einen Kurs");
    });
  } finally { srv.close(); }
});

test("LC2 — aus mehreren Ereignissen derselben Minute entsteht eine laufende Kerze", async () => {
  /* Alle Ticks in derselben Minute und mit einem klaren Verlauf:
     hoch, hoeher, tiefer, dazwischen. Open, High, Low und Close muessen
     danach eindeutig bestimmt sein.

     Die Zeitpunkte liegen am ANFANG einer Minute, und die Uhr der Reihe
     steht fest: sonst entscheidet der Sekundenzeiger darueber, ob die
     Kerze noch laeuft. */
  const base = Math.floor(Date.now() / 60000) * 60000 + 2000;
  const prices = [184.20, 184.31, 184.18, 184.24];
  const ticks = prices.map((p, i) => ({ symbol: "NVDA", price: p, size: 10, atMs: base + i * 30 }));
  const srv = await startWsServer({ ticks, intervalMs: 20 });
  try {
    const r = await collect(srv.port, { durationMs: 900, now: () => base + 3000 });
    assert.equal(r.events.length, prices.length);

    const candle = r.series.last();
    assert.ok(candle, "es muss eine Kerze entstanden sein");
    assert.equal(candle.open, prices[0], "Open ist der erste Kurs der Periode");
    assert.equal(candle.high, Math.max(...prices), "High ist das Maximum");
    assert.equal(candle.low, Math.min(...prices), "Low ist das Minimum");
    assert.equal(candle.close, prices[prices.length - 1], "Close ist der letzte Kurs");
    assert.ok(candle.timestamp, "die Kerze traegt einen Zeitstempel");
    /* Eine laufende Kerze ist ausdruecklich nicht bestaetigt: ihr Schluss
       bewegt sich noch. Alles, was auf bestaetigten Bars rechnet, darf sie
       nicht als Schlusskurs nehmen. */
    assert.equal(candle.confirmed, false, "die laufende Kerze darf nicht als bestaetigt gelten");
    assert.equal(candle.origin, "REALTIME_DEVELOPING");
    assert.equal(r.series.stats().ticks, prices.length);
    /* §6 verlangt mehrere Preisupdates innerhalb derselben Kerze. */
    assert.equal(r.series.length(), 1, "alle vier Ticks gehoeren in dieselbe Minute");
    assert.equal(candle.volume, 40, "das Volumen summiert die Ticks der Periode");
  } finally { srv.close(); }
});

test("LC3 — Verwaltungsnachrichten und Nicht-Trade-Nachrichten erzeugen keine Kerze", async () => {
  /* Ein Quote ("Q") traegt Geld und Brief, keinen ausgefuehrten Kurs.
     Daraus eine Kerze zu bauen waere eine andere Zahl als die, die das
     Chart zeigt. */
  const q = TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", data: ["Q", new Date().toISOString(), "NVDA", 184.1, 100, 184.3, 100]
  }));
  assert.equal(q, null, "ein Quote darf keinen Tick erzeugen");

  const heartbeat = TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "H", data: {}
  }));
  assert.equal(heartbeat, null, "ein Heartbeat ist kein Kurs");

  const trade = TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", data: ["T", "2026-09-09T14:31:02.000Z", "NVDA", 184.2, 55]
  }));
  assert.ok(trade && trade.tick, "ein Trade muss einen Tick erzeugen");
  assert.equal(trade.tick.price, 184.2);
  assert.equal(trade.tick.size, 55);
  assert.equal(trade.tick.symbol, "NVDA");
  assert.equal(trade.raw, null, "die Rohnachricht wird nicht weitergereicht");
});

test("LC4 — ein Tick aus einer abgelaufenen Minute bewegt keinen bestaetigten Schlusskurs", () => {
  /* Der teuerste Fehler in einem Live-Chart: ein Nachzuegler, der eine
     bereits abgeschlossene Kerze nachtraeglich veraendert. Alles, was auf
     bestaetigten Bars rechnet, verliesse sich dann auf einen Wert, der
     sich noch bewegt. */
  const fixed = Date.parse("2026-09-09T14:35:30.000Z");
  const series = BarMerge.createSeries({
    timeframe: "1m", interval: "1m", calendar, exchange: "XNYS",
    adjustmentStatus: null, now: () => fixed
  });

  const current = series.applyTick({ price: 100, size: 1, timestamp: fixed, receivedAt: fixed });
  assert.equal(current.action, "appended");

  const late = series.applyTick({ price: 999, size: 1,
                                  timestamp: fixed - 5 * 60000, receivedAt: fixed });
  assert.equal(late.action, "ignored");
  assert.equal(late.reason, "bucketClosed");
  assert.equal(series.length(), 1, "der Nachzuegler darf keine zweite Kerze anlegen");
  assert.equal(series.last().close, 100, "der Schlusskurs bleibt unberuehrt");
  assert.equal(series.stats().rejectedConfirmed, 1);
});

test("LC5 — der geschriebene Nachweis nennt weder Kurse noch den Zugangsschluessel", async () => {
  /* §34 und §2: der Bericht wird ausgeliefert, also darf er weder Kurse
     noch Zugangsdaten tragen. Geprueft wird die tatsaechlich geschriebene
     Datei und nicht der Quelltext - eine Quelltextpruefung wuerde eine
     Zeile finden, die den Schluessel nur erwaehnt, und eine uebersehen,
     die ihn durchreicht.

     Der Lauf zeigt auf eine Adresse, an der niemand horcht. Damit ist er
     in Sekunden vorbei und misst genau das, was hier interessiert: was
     landet im Bericht. */
  const dir = mkdtempSync(join(tmpdir(), "vu-live-"));
  const secret = "SECRET-nicht-im-bericht-4711";
  const execFileAsync = promisify(execFile);
  await execFileAsync(process.execPath,
    [join(root, "scripts", "market", "verify-live-candle.mjs"), "--out", dir, "--seconds", "15"],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: Object.assign({}, process.env, {
        TIINGO_API_KEY: secret,
        /* Port 1 ist reserviert; dort horcht nichts. */
        TIINGO_WS_URL: "ws://127.0.0.1:1"
      }) });

  const text = readFileSync(join(dir, "live-candle-verification.json"), "utf8");
  assert.ok(!text.includes(secret), "der Zugangsschluessel darf im Bericht nicht vorkommen");
  assert.ok(!text.includes("SECRET"), "auch kein Bruchstueck davon");

  const report = JSON.parse(text);
  /* Ohne Verbindung kann nichts belegt sein - und das muss auch so
     dastehen statt als vorsichtiges TRUE. */
  assert.equal(report.LIVE_CHART_READY !== "TRUE", true,
               "ohne Verbindung darf LIVE_CHART_READY nie TRUE sein");
  assert.ok(report.measurements.length >= 1);
  assert.equal(report.measurements[0].connection.opened, false);

  /* Der Berichtsaufbau weist Bewegung relativ aus, nicht als Betrag. */
  const m = report.measurements[0];
  assert.ok("rangeRelative" in m.candle);
  assert.ok("closeMovedFromOpen" in m.candle);
  for (const forbidden of ["\"open\":", "\"high\":", "\"low\":", "\"close\":"]) {
    assert.ok(!text.includes(forbidden),
              `der Bericht darf kein Kursfeld ${forbidden} tragen`);
  }
});

test("LC6 — ein Quote-Strom ist etwas anderes als kein Strom", async () => {
  /* Der Befund, den die erste Messung bei offener Boerse ergab: die
     Verbindung stand ueber die volle Dauer und trug 132 Nachrichten -
     alle Quotes, kein einziger Trade. Als blosses "0 Ereignisse" gemeldet
     sah das aus wie ein toter Strom.

     Die Unterscheidung entscheidet, was als naechstes zu tun ist: bei
     einem toten Strom hilft nur ein Tarifwechsel, bei einem Quote-Strom
     steht der technische Weg und es fehlt die Datenart. */
  const now = Date.now();
  const ticks = [];
  for (let i = 0; i < 5; i++) {
    ticks.push({ symbol: "NVDA", price: 184.2 + i * 0.02, size: 100, atMs: now + i * 20,
                 kind: "Q" });
  }
  const srv = await startWsServer({ ticks, intervalMs: 15 });
  try {
    const r = await collect(srv.port, { durationMs: 900 });
    /* Quotes duerfen keinen Tick erzeugen - das ist die bestehende,
       richtige Regel aus parseIexMessage. */
    assert.equal(r.events.length, 0, "aus Quotes entsteht kein Tick");
    assert.equal(r.series.length(), 0, "und keine Kerze");
    /* Aber die Nachrichten sind angekommen. Genau das muss unterscheidbar
       bleiben. */
    assert.ok(r.messages >= 5, `es kamen ${r.messages} Nachrichten an`);
  } finally { srv.close(); }
});

test("LC7 — die Auswertung trennt 'kein Strom' von 'Strom ohne Trades'", () => {
  /* Geprueft wird die Entscheidungslogik selbst, an der Quelle: die drei
     Faelle muessen im Bericht unterschiedliche Woerter erzeugen. Ohne das
     verschwindet der teuerste Befund in einem FALSE. */
  const src = readFileSync(join(root, "scripts", "market", "verify-live-candle.mjs"), "utf8");

  assert.match(src, /quoteStreamAvailable/);
  assert.match(src, /tradeStreamAvailable/);
  assert.match(src, /rejectedThresholdLevels/);
  /* Der Quote-Fall braucht seinen eigenen Zweig - nicht denselben Text
     wie "kein Strom". */
  assert.match(src, /withQuotes\.length\) \{[\s\S]{0,400}?Quotes\)/);
  /* Und er darf nicht als TRUE durchgehen: eine Kerze aus Geld- und
     Briefkursen ist eine andere Zahl. */
  const quoteBranch = src.slice(src.indexOf("} else if (!withEvents.length && withQuotes.length) {"),
                                src.indexOf("} else if (!withEvents.length) {"));
  assert.match(quoteBranch, /liveChartReady = "FALSE"/);
  assert.ok(!quoteBranch.includes('liveChartReady = "TRUE"'));
  /* §21 wird getrennt beantwortet: sichtbare Bewegung ja, aus Trades nein. */
  assert.match(src, /fromExecutedTrades/);
  assert.match(src, /fromQuotesOnly/);
  assert.match(src, /decisionRequired/);
});

test("LC8 — die neue Nachrichtenform ergibt einen Tick, der seine Unbestimmtheit mitfuehrt", () => {
  /* Gemessen am 2026-09-09 gegen den Commercial-Zugang: die IEX-Stufe 6
     liefert [Zeitstempel, Ticker, Kurs] - drei Felder, kein Typfeld.
     Der Parser hat diese Nachrichten zuvor alle verworfen.

     Er liest sie jetzt - und schreibt an den Tick, dass die Kursart NICHT
     bekannt ist. Ohne diese Kennzeichnung saehe eine Kerze aus
     unbestimmten Kursen genauso aus wie eine aus Abschluessen. */
  const neu = TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", service: "iex",
    data: ["2026-09-09T09:47:40.460465838-04:00", "NVDA", 184.24]
  }));
  assert.ok(neu && neu.tick, "die neue Form muss einen Tick ergeben");
  assert.equal(neu.tick.price, 184.24);
  assert.equal(neu.tick.symbol, "NVDA");
  assert.equal(neu.tick.priceType, "UNSPECIFIED");
  assert.equal(neu.tick.messageForm, "iexNoTypeField");
  assert.equal(neu.tick.size, null, "die Form traegt keine Stueckzahl");

  /* Die typisierte Form bleibt, was sie war - und sagt es jetzt auch. */
  const trade = TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", data: ["T", "2026-09-09T13:47:40Z", "NVDA", 184.2, 55]
  }));
  assert.equal(trade.tick.priceType, "TRADE");
  assert.equal(trade.tick.messageForm, "iexTyped");
  assert.equal(trade.tick.size, 55);

  /* Und ein Quote bleibt verworfen: Geld und Brief sind keine Kerze. */
  const quote = TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", data: ["Q", "2026-09-09T13:47:40Z", "NVDA", 184.1, 100, 184.3, 100]
  }));
  assert.equal(quote, null);

  /* Zu kurze oder unbrauchbare Nachrichten bleiben verworfen. */
  assert.equal(TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", data: ["2026-09-09T09:47:40Z", "NVDA"] })), null);
  assert.equal(TiingoRealtime.parseIexMessage(JSON.stringify({
    messageType: "A", data: ["2026-09-09T09:47:40Z", "NVDA", 0] })), null);
});

test("LC9 — ein TRUE aus unbestimmten Kursen sagt seine Einschraenkung mit", () => {
  /* Die Kerze entsteht - das ist messbar. Woraus sie entsteht, ist bei der
     neuen Nachrichtenform nicht messbar. Ein TRUE ohne diese Zeile waere
     die Zusage, der Chart zeige Abschluesse. */
  const src = readFileSync(join(root, "scripts", "market", "verify-live-candle.mjs"), "utf8");
  const branch = src.slice(src.indexOf("} else if (streaming.length && withCandle.length) {"),
                           src.indexOf('} else if (session.phase !== "REGULAR") {'));
  assert.match(branch, /liveChartReady = "TRUE"/);
  assert.match(branch, /EINSCHRAENKUNG/);
  assert.match(branch, /UNSPECIFIED/);
  assert.match(src, /priceTypeVerified/);
  assert.match(src, /priceTypeNote/);
});

test("LC10 — zwei Titel ergeben zwei Kerzen, nicht eine gemeinsame", async () => {
  /* Der Fehler des Laufs davor: die Kurse zweier Titel fielen in dieselbe
     Kerze und ergaben eine Spanne von 55 Prozent - eine Zahl, die nichts
     misst. Ein Chart zeigt einen Titel; die Messung muss das auch tun. */
  const base = Math.floor(Date.now() / 60000) * 60000 + 2000;
  const ticks = [];
  for (let i = 0; i < 4; i++) {
    ticks.push({ symbol: "AAPL", price: 230 + i * 0.05, size: 10, atMs: base + i * 20 });
    ticks.push({ symbol: "MSFT", price: 510 + i * 0.05, size: 10, atMs: base + i * 20 + 5 });
  }
  const srv = await startWsServer({ ticks, intervalMs: 15 });
  try {
    const r = await collect(srv.port, { durationMs: 1100, now: () => base + 3000,
                                        symbols: ["aapl", "msft"] });
    assert.equal(r.events.length, ticks.length);

    /* Die Reihe des Tests ist bewusst eine gemeinsame - geprueft wird
       hier, dass das MESSSKRIPT je Titel trennt. Der Nachweis dafuer
       steht in seiner Quelle, weil die Aufteilung dort passiert. */
    const src = readFileSync(join(root, "scripts", "market", "verify-live-candle.mjs"), "utf8");
    assert.match(src, /seriesBySymbol/);
    assert.match(src, /function seriesFor\(symbol\)/);
    /* Und die Kerze im Bericht gehoert einem benannten Titel. */
    assert.match(src, /symbol: leadSymbol/);
    assert.match(src, /perSymbol: perSymbolCandles/);
    /* Eine gemeinsame Reihe ueber alle Titel darf es nicht mehr geben. */
    assert.ok(!/const series = BarMerge\.createSeries/.test(src),
              "eine einzelne Sammelreihe waere der alte Fehler");
  } finally { srv.close(); }
});
