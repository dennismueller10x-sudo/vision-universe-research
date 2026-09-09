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
const REST_BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
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

    /* Eine Minutenkerze JE TITEL. Dieselbe Engine wie im Chart,
       Zeitraster 1m.

       Eine gemeinsame Reihe fuer mehrere Titel war der Fehler des Laufs
       davor: die Kurse von AAPL und MSFT fielen in dieselbe Kerze und
       ergaben eine Spanne von 55 Prozent - eine Zahl, die nichts misst.
       Ein Chart zeigt einen Titel; die Messung muss das auch tun. */
    const seriesBySymbol = new Map();
    function seriesFor(symbol) {
      const key = String(symbol || symbols[0] || "?").toUpperCase();
      if (!seriesBySymbol.has(key)) {
        seriesBySymbol.set(key, BarMerge.createSeries({
          timeframe: "1m", interval: "1m", calendar, exchange: "XNYS",
          adjustmentStatus: null
        }));
      }
      return seriesBySymbol.get(key);
    }

    const events = [];          /* {atMs, symbol, hasTimestamp, lagS} */
    const perSymbol = {};
    let messages = 0, adminMessages = 0, subscriptionAck = null, opened = false;
    /* Wie viele Kursnachrichten welcher Art kamen.

       Der erste Lauf meldete "134 Nachrichten, 0 Ereignisse" - und liess
       damit offen, was die 134 waren. Sie waren Quotes: Geld und Brief,
       keine ausgefuehrten Trades. Der Unterschied ist der ganze Befund,
       und er darf nicht aus zwei Zahlen erschlossen werden muessen.

       Tiingos IEX-Strom kennzeichnet die Art im ersten Feld: "T" Trade,
       "Q" Quote (Top of Book), "B"/"A" einseitige Aktualisierungen. */
    const messageTypes = Object.create(null);
    let rejectedSubscription = null;

    /* Die FORM der Nachrichten, ohne ihren Inhalt.

       Der Lauf davor zeigte: dieser Zugang liefert am laufenden Band -
       138 Nachrichten in 90 Sekunden auf NVDA - und der Parser wirft
       jede einzelne weg, weil er an Position 0 einen Typbuchstaben
       erwartet und dort ein Zeitstempel steht. Tiingo hat die
       IEX-Regeln geaendert; die Ablehnung von Stufe 5 und 0 sagt es
       ausdruecklich.

       Um den Parser richtig zu erweitern, braucht es die Feldfolge - und
       ausdruecklich NICHT die Werte: Kurse gehoeren nicht in einen
       Bericht (§34). Aufgenommen wird deshalb je Position nur, WAS dort
       steht: Typ, und bei Zeichenketten, ob sie wie ein Zeitstempel oder
       wie das angefragte Symbol aussehen. Zahlen werden gezaehlt, nie
       notiert. */
    const shapeSamples = [];
    const priceTypes = Object.create(null);
    const messageForms = Object.create(null);
    function describeShape(data) {
      return data.map(function (v) {
        if (v === null) return "null";
        if (typeof v === "number") return "number";
        if (typeof v === "string") {
          if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return "isoTimestamp";
          if (symbols.some(function (t) { return t.toUpperCase() === v.toUpperCase(); })) return "requestedTicker";
          if (/^[A-Z]$/.test(v)) return "letter:" + v;
          if (v.length <= 8) return "shortString(" + v.length + ")";
          return "string(" + v.length + ")";
        }
        return typeof v;
      });
    }
    /* WAS IST DIESE ZAHL? (§7/§8 der Nacharbeit)

       Der Strom liefert [Zeitstempel, Ticker, Kurs] - ohne Typfeld. Der
       Tick traegt deshalb priceType "UNSPECIFIED", und solange das so
       bleibt, darf keine Kennzahl auf dieser Kerze als "auf
       Abschluessen gerechnet" gelten.

       Raten ist keine Option. Messen schon: die REST-Kursabfrage
       desselben Titels liefert nebeneinander `last` (letzter an IEX
       ausgefuehrter Trade), `tngoLast` (Tiingos Referenzkurs), Geld,
       Brief und Mitte. Faellt der Stromkurs wiederholt und exakt auf
       genau eines dieser Felder, ist das ein Beleg - kein Beweis, aber
       weit mehr als eine Vermutung.

       Verglichen wird auf Gleichheit, nicht mit Toleranz: eine Toleranz
       wuerde bei eng beieinanderliegenden Feldern jedes Feld "treffen"
       und damit nichts zeigen. Und in den Bericht geht ausschliesslich,
       WELCHES Feld getroffen hat - nie eine Zahl (§34). */
    const preisVergleiche = [];
    const letzterStromkurs = new Map();
    let vergleichsFehler = null;

    async function vergleichePreisart() {
      if (!apiKey || !opts.probeSemantics) return;
      for (const sym of symbols) {
        const stromkurs = letzterStromkurs.get(sym.toUpperCase());
        if (!stromkurs) continue;
        try {
          const res = await fetch(`${REST_BASE}/iex/${encodeURIComponent(sym.toLowerCase())}`,
                                  { headers: { Authorization: "Token " + apiKey } });
          if (!res.ok) continue;
          const body = await res.json();
          const row = Array.isArray(body) ? body[0] : body;
          if (!row) continue;
          const kandidaten = {
            last: row.last, tngoLast: row.tngoLast, mid: row.mid,
            bidPrice: row.bidPrice, askPrice: row.askPrice,
            prevClose: row.prevClose, open: row.open, high: row.high, low: row.low
          };
          const getroffen = [];
          const vorhanden = [];
          for (const [feld, wert] of Object.entries(kandidaten)) {
            if (typeof wert !== "number") continue;
            vorhanden.push(feld);
            if (wert === stromkurs.price) getroffen.push(feld);
          }
          const bid = typeof row.bidPrice === "number" ? row.bidPrice : null;
          const ask = typeof row.askPrice === "number" ? row.askPrice : null;
          preisVergleiche.push({
            symbol: sym.toUpperCase(),
            atMs: Date.now() - (openedAt || Date.now()),
            streamPriceAgeMs: Date.now() - stromkurs.atMs,
            fieldsPresent: vorhanden,
            matchedFields: getroffen,
            withinBidAsk: (bid !== null && ask !== null)
              ? (stromkurs.price >= Math.min(bid, ask) && stromkurs.price <= Math.max(bid, ask))
              : null
          });
        } catch (err) {
          vergleichsFehler = String((err && err.message) || err).slice(0, 120);
        }
      }
    }

    let openedAt = null, firstEventAt = null, lastEventAt = null;
    let socketError = null, closeCode = null, closeReason = null;
    /* Zaehler je Titel, damit ein zweiter Titel den ersten nicht
       zuruecksetzt. */
    const candleTicks = new Map();
    const candleBucket = new Map();
    const maxTicks = new Map();
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
                message: msg.response ? String(msg.response.message || "").slice(0, 200) : null,
                hasSubscriptionId: !!(msg.data && msg.data.subscriptionId)
              };
            }
            /* Eine ausdrueckliche Ablehnung ist ein eigener Befund und
               nicht dasselbe wie Stille. */
            if (msg.messageType === "E" && msg.response && msg.response.code >= 400) {
              rejectedSubscription = {
                code: msg.response.code,
                message: String(msg.response.message || "").slice(0, 200)
              };
            }
          } else if (msg && msg.messageType === "A" && Array.isArray(msg.data)) {
            /* Der Typbuchstabe steht dort, wo einer steht - und nur
               dann. Ein Zeitstempel an Position 0 ist kein Typ, und ihn
               als einen zu zaehlen erzeugte im Lauf davor 138
               "Nachrichtenarten" statt zweier. */
            const first = msg.data[0];
            const kind = typeof first === "string" && /^[A-Z]$/.test(first) ? first : "noTypeField";
            messageTypes[kind] = (messageTypes[kind] || 0) + 1;
            if (shapeSamples.length < 3) {
              shapeSamples.push({ service: msg.service || null, length: msg.data.length,
                                  fields: describeShape(msg.data) });
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
      if (vergleichsTakt) clearInterval(vergleichsTakt);
      try { transport.stop(); } catch (err) { /* geschlossen genug */ }

      const gaps = [];
      for (let i = 1; i < events.length; i++) gaps.push(events[i].atMs - events[i - 1].atMs);
      const lags = events.map((e) => e.lagS).filter((v) => v !== null);
      /* Der Titel mit den meisten Ereignissen steht fuer die Kerze; die
         uebrigen stehen daneben. Eine Sammelkerze ueber mehrere Titel
         gibt es nicht mehr. */
      let leadSymbol = null, leadCount = -1;
      for (const [sym, count] of Object.entries(perSymbol)) {
        if (count > leadCount) { leadCount = count; leadSymbol = sym; }
      }
      const leadSeries = leadSymbol && seriesBySymbol.has(leadSymbol)
        ? seriesBySymbol.get(leadSymbol) : null;
      const running = leadSeries ? leadSeries.last() : null;
      const stats = leadSeries ? leadSeries.stats()
        : { ticks: 0, accepted: 0, rejectedFuture: 0, rejectedConfirmed: 0, rejectedMalformed: 0 };
      const maxTicksInAnyBucket = leadSymbol ? (maxTicks.get(leadSymbol) || 0) : 0;
      const perSymbolCandles = {};
      for (const [sym, ser] of seriesBySymbol.entries()) {
        const last = ser.last();
        perSymbolCandles[sym] = {
          bars: ser.length(),
          ticksInLastBar: candleTicks.get(sym) || 0,
          maxTicksInAnyBar: maxTicks.get(sym) || 0,
          rangeRelative: last && last.open ? Math.round((last.high - last.low) / last.open * 1e6) / 1e6 : null
        };
      }

      const phaseAtEnd = MarketHours.sessionAt(Date.now(), { calendar, exchange: "XNYS" }).phase;
      resolve(Object.assign({
        result,
        thresholdLevel,
        symbols,
        durationSeconds: Math.round(durationMs / 1000),
        sessionPhaseAtStart: phaseAtStart,
        sessionPhaseAtEnd: phaseAtEnd,
        sessionPhaseChanged: phaseAtStart !== phaseAtEnd,
        connection: {
          opened,
          openedAfterMs: openedAt && openedAt - startedAt,
          subscriptionAck,
          messages,
          adminMessages,
          /* Die Auszaehlung nach Art. "T" sind Trades und damit das,
             woraus eine Kerze entsteht; "Q" sind Geld- und Briefkurse. */
          messageTypes: Object.assign({}, messageTypes),
          /* Die Feldfolge, ohne Werte. Sie sagt, wie der Parser zu
             erweitern ist - und verraet keinen Kurs. */
          messageShape: shapeSamples,
          unparsedPriceMessages: messageTypes.noTypeField || 0,
          tradeMessages: messageTypes.T || 0,
          quoteMessages: (messageTypes.Q || 0) + (messageTypes.B || 0) + (messageTypes.A || 0),
          rejectedSubscription,
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
          symbol: leadSymbol,
          bucket: running ? running.bucket : null,
          ticksInBucket: leadSymbol ? (candleTicks.get(leadSymbol) || 0) : 0,
          perSymbol: perSymbolCandles,
          maxTicksInAnyBucket: maxTicksInAnyBucket,
          barsFormed: leadSeries ? leadSeries.length() : 0,
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
          /* Woraus die Kerze besteht. TRADE heisst Abschluesse;
             UNSPECIFIED heisst, der Anbieter nennt die Kursart nicht -
             die Kerze bewegt sich dann sichtbar, aber worauf sie sich
             bezieht, ist ungeklaert. */
          priceTypes: Object.assign({}, priceTypes),
          messageForms: Object.assign({}, messageForms),
          priceTypeVerified: !!priceTypes.TRADE && !priceTypes.UNSPECIFIED,
          mergeStats: { ticks: stats.ticks, accepted: stats.accepted,
                        rejectedFuture: stats.rejectedFuture,
                        rejectedConfirmed: stats.rejectedConfirmed,
                        rejectedMalformed: stats.rejectedMalformed },
          multipleUpdatesInSameCandle: maxTicksInAnyBucket >= MIN_TICKS_IN_CANDLE
        },
        /* Der Feldvergleich: welches REST-Feld der Stromkurs getroffen
           hat. Zahlen stehen hier keine - nur Feldnamen und Zaehlungen. */
        priceFieldProbe: opts.probeSemantics ? (() => {
          const treffer = Object.create(null);
          const vorhanden = Object.create(null);
          let imSpread = 0, mitSpread = 0;
          for (const v of preisVergleiche) {
            for (const f of v.fieldsPresent) vorhanden[f] = (vorhanden[f] || 0) + 1;
            for (const f of v.matchedFields) treffer[f] = (treffer[f] || 0) + 1;
            if (v.withinBidAsk !== null) { mitSpread++; if (v.withinBidAsk) imSpread++; }
          }
          return {
            probes: preisVergleiche.length,
            fieldsPresent: vorhanden,
            matchesByField: treffer,
            withinBidAskOf: mitSpread,
            withinBidAsk: imSpread,
            medianStreamPriceAgeMs: preisVergleiche.length
              ? pct(preisVergleiche.map((v) => v.streamPriceAgeMs).sort((a, b) => a - b), 50)
              : null,
            error: vergleichsFehler,
            note: "Verglichen wird auf exakte Gleichheit zwischen dem letzten Stromkurs und " +
                  "den Feldern der REST-Kursabfrage. Kein Wert wird aufgezeichnet."
          };
        })() : null
      }, extra || {}));
    };

    const startedAt = Date.now();
    /* Die Sitzungsphase am Anfang UND am Ende der Messung. Ein Lauf, der
       ueber die Eroeffnung hinweggeht, misst zwei verschiedene Dinge -
       und ein Bericht, der nur eine Phase nennt, laesst das nicht
       erkennen. */
    const phaseAtStart = MarketHours.sessionAt(startedAt, { calendar, exchange: "XNYS" }).phase;
    const timer = setTimeout(() => {
      stop(opened
        ? (events.length >= MIN_EVENTS_FOR_STREAM ? "PASSED"
           : events.length > 0 ? "PARTIAL" : "UNKNOWN")
        : "FAILED");
    }, durationMs);

    /* Der Vergleich laeuft mitlaufend, nicht am Ende: am Ende waere der
       Stromkurs Sekunden alt und jeder Nichttreffer erklaerbar durch die
       Zeit statt durch die Bedeutung. */
    const vergleichsTakt = opts.probeSemantics
      ? setInterval(() => { vergleichePreisart(); }, Math.max(8000, Math.round(durationMs / 8)))
      : null;

    transport.start({
      onOpen: function () { opened = true; openedAt = Date.now();
                            if (opts.probeSemantics) setTimeout(() => vergleichePreisart(), 4000); },
      onTick: function (tick) {
        const at = Date.now();
        /* Welche Art Kurs der Tick traegt. Bei der typisierten Form ein
           Abschluss, bei der neuen Form unbestimmt - und das muss bis in
           den Bericht durchschlagen, sonst liest sich eine Kerze aus
           unbestimmten Kursen wie eine aus Abschluessen. */
        if (tick.priceType) priceTypes[tick.priceType] = (priceTypes[tick.priceType] || 0) + 1;
        if (tick.messageForm) messageForms[tick.messageForm] = (messageForms[tick.messageForm] || 0) + 1;
        if (!firstEventAt) firstEventAt = at;
        lastEventAt = at;
        const lagS = tick.timestamp
          ? Math.round((at - new Date(tick.timestamp).getTime()) / 1000) : null;
        events.push({ atMs: at, symbol: tick.symbol || null,
                      hasTimestamp: !!tick.timestamp, lagS });
        const key = (tick.symbol || symbols[0] || "?").toUpperCase();
        perSymbol[key] = (perSymbol[key] || 0) + 1;
        /* Nur im Arbeitsspeicher, ausschliesslich fuer den Feldvergleich.
           Dieser Wert verlaesst den Prozess nicht. */
        if (typeof tick.price === "number") letzterStromkurs.set(key, { price: tick.price, atMs: at });

        /* Die Kerze: genau so, wie das Chart sie bauen wuerde - und je
           Titel getrennt. */
        const s2 = seriesFor(tick.symbol);
        const r = s2.applyTick({
          price: tick.price, size: tick.size,
          timestamp: tick.timestamp, receivedAt: at,
          currency: "USD", source: "tiingo", dataClass: "REALTIME_STREAM"
        });
        const after = s2.last();
        /* Beim Minutenwechsel faengt die Zaehlung von vorn an. Gemeldet
           wird deshalb zusaetzlich das Maximum ueber alle Minuten der
           Messung: eine Messung, die kurz nach einem Minutenwechsel
           endet, wuerde sonst eine gut gefuellte Kerze als duenn
           ausweisen - ein Messfehler, kein Befund. */
        if (after && after.bucket !== candleBucket.get(key)) {
          candleBucket.set(key, after.bucket);
          candleTicks.set(key, 0);
        }
        if (r.action !== "rejected" && r.action !== "ignored") {
          candleTicks.set(key, (candleTicks.get(key) || 0) + 1);
        }
        if ((candleTicks.get(key) || 0) > (maxTicks.get(key) || 0)) {
          maxTicks.set(key, candleTicks.get(key) || 0);
        }
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
    /* §4 nennt Stufe 6 ausdruecklich. Stufe 5 und Stufe 0 laufen als
       Vergleich - alle am selben Titel, sonst vergleicht die Messung zwei
       Dinge.

       Stufe 0 ist der entscheidende dritte Fall: sie ist Tiingos
       dokumentierte Grundeinstellung fuer den IEX-Strom und liefert
       alles, was es gibt. Bleibt auch sie stumm, liegt es nicht an der
       Stufe, sondern am Zugang - und genau diese beiden Ursachen wollte
       der erste Lauf unterscheiden koennen und konnte es nicht. */
    for (const level of [6, 5, 0]) {
      console.log(`  Messung: ${PRIMARY}, thresholdLevel ${level}, ${SECONDS} s ...`);
      /* Der Feldvergleich laeuft nur auf der Stufe, die auch Kurse
         liefert. Auf einer abgelehnten Stufe gibt es keinen Stromkurs
         zu vergleichen - dort waeren die Anfragen verschwendet. */
      const r = await measureStream({ symbols: [PRIMARY], thresholdLevel: level,
                                      durationMs: SECONDS * 1000,
                                      probeSemantics: level === 6 });
      runs.push(Object.assign({ scope: "primary" }, r));
      /* Kurz durchatmen, bevor die naechste Verbindung aufgeht. Die
         zweite Messung des ersten Laufs endete nach 0,4 Sekunden - wenn
         der Anbieter je Konto nur eine Verbindung zulaesst, misst ein
         sofortiger Neuaufbau die eigene, noch offene Verbindung. */
      await new Promise((r2) => setTimeout(r2, 3000));
      console.log(`    ${r.result}  Verbindung ${r.connection && r.connection.opened ? "offen" : "nicht zustande"}` +
                  `, ${r.events ? r.events.count : 0} Kursereignisse` +
                  (r.events && r.events.perSecond !== null ? `, ${r.events.perSecond}/s` : "") +
                  (r.candle ? `, Kerze mit bis zu ${r.candle.maxTicksInAnyBucket} Update(s)` : ""));
    }

    /* Nur wenn die erste Messung ueberhaupt etwas geliefert hat, lohnt
       sich der Kontoquerschnitt. Sonst misst man dreimal dasselbe Nein. */
    const best = runs.reduce((a, b) =>
      (b.events && a.events && b.events.count > a.events.count) ? b : a, runs[0]);
    if (SECONDARY.length && best && best.events && best.events.count > 0) {
      console.log(`  Messung: ${SECONDARY.join(", ")}, thresholdLevel ${best.thresholdLevel}, ${SECONDS} s ...`);
      const r = await measureStream({ symbols: SECONDARY, thresholdLevel: best.thresholdLevel,
                                      probeSemantics: true,
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

  /* Drei Faelle, die sich sehr aehnlich sehen und ganz verschiedene
     Folgen haben:

       kein Strom          die Verbindung kommt nicht zustande oder wird
                           abgelehnt. Nichts zu machen ohne Tarifwechsel.
       Strom ohne Trades   die Verbindung steht und liefert - aber Geld-
                           und Briefkurse statt ausgefuehrter Trades.
                           Technisch ist der Weg da; was fehlt, ist die
                           Datenart, aus der eine Kerze entsteht.
       Strom mit Trades    der Fall, fuer den alles gebaut ist.

     Der mittlere Fall war das Ergebnis der ersten Messung, und er ging in
     einem blossen FALSE unter. */
  const withQuotes = measured.filter((r) => r.connection && r.connection.quoteMessages > 0);
  const withTrades = measured.filter((r) => r.connection && r.connection.tradeMessages > 0);
  const rejected = measured.filter((r) => r.connection && r.connection.rejectedSubscription);
  const acceptedLevels = measured
    .filter((r) => r.connection && r.connection.opened && !r.connection.rejectedSubscription)
    .map((r) => r.thresholdLevel);
  const rejectedLevels = rejected.map((r) => r.thresholdLevel);

  /* LIVE_CHART_READY ist kein Optimismus. TRUE verlangt: Verbindung
     stand, mehrere aufeinanderfolgende Ereignisse, und daraus ist eine
     Minutenkerze mit mehr als einem Update entstanden. Fehlt eines
     davon bei offener Boerse: FALSE. Bei geschlossener Boerse: UNKNOWN -
     dann hat die Messung die Handelspause gemessen und nicht den Tarif. */
  let liveChartReady;
  let liveChartReason;
  const unspecifiedOnly = measured.some((r) => r.candle && r.candle.priceTypes &&
    r.candle.priceTypes.UNSPECIFIED > 0 && !r.candle.priceTypes.TRADE);
  /* Hat der Anbieter irgendwo selbst "T" gesagt? Nur dann ist die
     Kursart aus seiner Auskunft belegt und nicht aus unserem Vergleich. */
  const anyTradeTyped = measured.some((r) => r.candle && r.candle.priceTypes &&
    r.candle.priceTypes.TRADE > 0);

  if (!apiKey) {
    liveChartReady = "UNKNOWN";
    liveChartReason = "Kein Zugang konfiguriert. Es wurde nichts gemessen.";
  } else if (streaming.length && withCandle.length) {
    /* Die Kerze entsteht - das ist gemessen. Woraus sie entsteht, ist bei
       der neuen Nachrichtenform NICHT gemessen, und diese Einschraenkung
       gehoert in dieselbe Zeile wie das TRUE. Ein TRUE ohne sie waere die
       Zusage, der Chart zeige Abschluesse. */
    liveChartReady = "TRUE";
    liveChartReason = unspecifiedOnly
      ? "Mehrere aufeinanderfolgende Kursereignisse, und daraus ist eine laufende " +
        "Minutenkerze mit mehr als einem Update entstanden. EINSCHRAENKUNG: der Anbieter " +
        "nennt die Kursart nicht (priceType UNSPECIFIED). Der Chart bewegt sich; ob die " +
        "Zahl ein Abschluss oder ein Referenzkurs ist, ist damit nicht belegt - und alles, " +
        "was auf der Kerze rechnet, braucht diese Auskunft."
      : "Mehrere aufeinanderfolgende Kursereignisse, und daraus ist eine laufende " +
        "Minutenkerze mit mehr als einem Update entstanden. Die Kurse sind ausgefuehrte " +
        "Abschluesse (priceType TRADE).";
  } else if (session.phase !== "REGULAR") {
    liveChartReady = "UNKNOWN";
    liveChartReason = `Gemessen wurde in der Phase ${session.phase}. Ein ausbleibender Kurs ` +
                      "misst dann die Handelspause und nicht den Tarif. Der Lauf ist waehrend " +
                      "der regulaeren Sitzung zu wiederholen.";
  } else if (!anyOpened) {
    liveChartReady = "FALSE";
    liveChartReason = "Die Verbindung kam bei offener Boerse nicht zustande.";
  } else if (!withEvents.length && measured.some((r) => r.connection &&
                                                  r.connection.unparsedPriceMessages > 0)) {
    const u = measured.find((r) => r.connection && r.connection.unparsedPriceMessages > 0);
    liveChartReady = "FALSE";
    liveChartReason =
      "Der Strom liefert - und der Parser kann die Nachrichten nicht lesen. Auf Stufe " +
      u.thresholdLevel + " kamen " + u.connection.unparsedPriceMessages + " Kursnachrichten in " +
      u.durationSeconds + " Sekunden an, ohne das erwartete Typfeld an erster Stelle. " +
      "Das ist kein fehlender Zugang, sondern eine geaenderte Nachrichtenform: die " +
      "abgelehnten Stufen 5 und 0 nennen ausdruecklich neue IEX-Regeln. Die beobachtete " +
      "Feldfolge steht unter measurements[].connection.messageShape.";
  } else if (!withEvents.length && withQuotes.length) {
    liveChartReady = "FALSE";
    liveChartReason =
      "Der Strom laeuft - er liefert aber Geld- und Briefkurse (Quotes) und keine " +
      "ausgefuehrten Trades. Die Verbindung stand ueber die volle Messdauer und trug " +
      withQuotes[0].connection.quoteMessages + " Quote-Nachrichten in " +
      withQuotes[0].durationSeconds + " Sekunden; Trades kamen null. Eine Kerze aus " +
      "Geld- und Briefkursen ist eine ANDERE Zahl als die, die der Chart heute zeigt - " +
      "sie zu bauen waere eine Produktentscheidung und keine Messung. Der technische " +
      "Weg steht; was fehlt, ist die Datenart.";
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

  /* Warum blieb der Strom stumm? Die Antwort steht in den
     Verwaltungsnachrichten und im Schliessgrund, nicht im Ergebniswort.
     Sie hier zusammenzuziehen erspart es, den ganzen Bericht zu lesen,
     um die eine Zeile zu finden, auf die es ankommt. */
  const silenceEvidence = measured
    .filter((r) => r.connection && r.connection.opened && r.events && r.events.count === 0)
    .map((r) => ({
      thresholdLevel: r.thresholdLevel,
      messages: r.connection.messages,
      adminMessages: r.connection.adminMessages,
      subscriptionAck: r.connection.subscriptionAck,
      closeCode: r.connection.closeCode,
      closeReason: r.connection.closeReason,
      stableForFullDuration: r.connection.stableForFullDuration,
      durationSeconds: r.durationSeconds
    }));

  /* ==================================================================
     WAS IST DIESE ZAHL? (§7/§8 der Nacharbeit)

     Genau drei Ausgaenge sind zulaessig, und geraten wird keiner:

       VERIFIED_PRICE_TYPE   Der Anbieter sagt es, und die Messung
                             widerspricht nicht.
       PARTIALLY_VERIFIED    Die Messung zeigt, WELCHEM Feld der
                             Stromkurs folgt - der Anbieter hat es
                             aber nicht benannt.
       UNSPECIFIED /
       PROVIDER_CONFIRMATION_REQUIRED   Nichts davon.

     Der Feldvergleich ist ein Indiz, keine Zusage. Er kann zeigen, dass
     der Stromkurs exakt und wiederholt auf `last` faellt - dass Tiingo
     dieses Feld auch morgen so fuellt, sagt er damit nicht. Deshalb
     hebt selbst ein eindeutiger Vergleich nur auf PARTIALLY_VERIFIED.
     ================================================================== */
  const proben = measured.map((r) => r.priceFieldProbe).filter(Boolean);
  const trefferGesamt = Object.create(null);
  const vorhandenGesamt = Object.create(null);
  let probenAnzahl = 0, imSpread = 0, mitSpread = 0;
  for (const p of proben) {
    probenAnzahl += p.probes || 0;
    imSpread += p.withinBidAsk || 0;
    mitSpread += p.withinBidAskOf || 0;
    for (const [f, n] of Object.entries(p.matchesByField || {})) trefferGesamt[f] = (trefferGesamt[f] || 0) + n;
    for (const [f, n] of Object.entries(p.fieldsPresent || {})) vorhandenGesamt[f] = (vorhandenGesamt[f] || 0) + n;
  }
  const rangliste = Object.entries(trefferGesamt).sort((a, b) => b[1] - a[1]);
  const bester = rangliste[0] || null;
  const zweiter = rangliste[1] || null;
  /* Eindeutig heisst: ein Feld trifft die klare Mehrheit der Proben, und
     kein zweites kommt ihm nahe. Zwei Felder, die gleich oft treffen,
     sind kein Befund - sie waren in diesen Momenten nur gleich gross. */
  const eindeutig = !!(bester && probenAnzahl >= 3 &&
                       bester[1] >= Math.ceil(probenAnzahl * 0.6) &&
                       (!zweiter || zweiter[1] < bester[1] * 0.5));

  const FELDBEDEUTUNG = {
    last: { type: "TRADE", meaning: "letzter an IEX ausgefuehrter Abschluss" },
    tngoLast: { type: "REFERENCE", meaning: "Tiingos konsolidierter Referenzkurs" },
    mid: { type: "MID", meaning: "Mitte zwischen Geld und Brief" },
    bidPrice: { type: "QUOTE", meaning: "Geldkurs" },
    askPrice: { type: "QUOTE", meaning: "Briefkurs" },
    prevClose: { type: "REFERENCE", meaning: "Vortagesschluss" },
    open: { type: "REFERENCE", meaning: "Eroeffnungskurs" }
  };

  let priceSemantics;
  if (!unspecifiedOnly && anyTradeTyped) {
    priceSemantics = {
      outcome: "VERIFIED_PRICE_TYPE",
      priceType: "TRADE",
      evidence: "Der Anbieter kennzeichnet die Nachricht selbst mit dem Typbuchstaben T.",
      known: "Die Kerze besteht aus ausgefuehrten Abschluessen.",
      unknown: null,
      safeForIntradayIntelligence: true
    };
  } else if (eindeutig) {
    const bedeutung = FELDBEDEUTUNG[bester[0]] || { type: "UNKNOWN", meaning: bester[0] };
    priceSemantics = {
      outcome: "PARTIALLY_VERIFIED",
      priceType: "UNSPECIFIED",
      tracksField: bester[0],
      tracksFieldType: bedeutung.type,
      matchRate: Math.round(bester[1] / probenAnzahl * 100) / 100,
      probes: probenAnzahl,
      matchesByField: trefferGesamt,
      evidence: `Der Stromkurs war in ${bester[1]} von ${probenAnzahl} Proben exakt gleich dem ` +
                `REST-Feld ${bester[0]} (${bedeutung.meaning}); kein anderes Feld kam nahe.`,
      known: `Der Strom folgt demselben Wert wie ${bester[0]}.`,
      unknown: "Der Anbieter benennt die Kursart in der Nachricht weiterhin nicht. Ein " +
               "Feldvergleich ist ein Indiz aus einem Zeitraum, keine Zusage fuer den naechsten.",
      safeForIntradayIntelligence: false,
      providerConfirmationRequired: true
    };
  } else {
    priceSemantics = {
      outcome: "UNSPECIFIED",
      priceType: "UNSPECIFIED",
      classification: "PROVIDER_CONFIRMATION_REQUIRED",
      probes: probenAnzahl,
      matchesByField: trefferGesamt,
      fieldsPresent: vorhandenGesamt,
      withinBidAsk: mitSpread ? { of: mitSpread, inside: imSpread } : null,
      evidence: probenAnzahl
        ? "Kein REST-Feld wurde vom Stromkurs eindeutig und wiederholt getroffen."
        : "Kein Vergleich moeglich (keine Proben).",
      /* Nur behaupten, was dieser Lauf gesehen hat. Ohne Zugang hat er
         nichts gesehen, und "es kommen fortlaufend Kurse" waere dann
         eine Aussage ueber einen Lauf, den es nicht gab. */
      known: !apiKey
        ? "Nichts. Ohne Zugang wurde keine Verbindung aufgebaut."
        : withCandle.length
        ? "Es kommen fortlaufend Kurse, und sie bauen eine bewegte Minutenkerze."
        : "Der Strom wurde gemessen; eine bewegte Kerze ist dabei nicht entstanden.",
      unknown: "Was die Zahl bedeutet - Abschluss, Referenz, Mitte oder Quote - ist offen.",
      safeForIntradayIntelligence: false,
      providerConfirmationRequired: true
    };
  }

  /* Was fuer diese Bedeutung gilt, gilt auch fuer alles, was auf ihr
     rechnet. Die Sperre steht im Bericht und nicht nur in der
     Dokumentation, damit ein Programm sie lesen kann (§11). */
  priceSemantics.intradayIntelligence = priceSemantics.safeForIntradayIntelligence
    ? { status: "PERMITTED", note: "Die Kursart ist belegt." }
    : {
        status: "BLOCKED",
        blockedUses: ["intradaySignals", "technicalSignalGeneration", "backtesting",
                      "executionSimulation", "tradeBasedVolumeAnalysis", "tradeBasedOHLC"],
        permittedUses: ["liveMovingChart"],
        labelling: {
          forbidden: ["Last Trade", "Official Trade Price", "Realtime Trade"],
          required: "Die Unsicherheit muss am Kurs sichtbar bleiben.",
          machineReadableField: "priceSemantics.outcome"
        },
        sourceOfTruth: "Die geprueften historischen und Intraday-Datensaetze bleiben die " +
                       "Rechengrundlage, bis die Kursart belegt ist.",
        note: "Kein Verbot des Charts - ein Verbot, auf dieser Kerze zu rechnen und sie zu " +
              "beschriften, als waere sie etwas Belegtes."
      };

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
    priceSemantics,
    /* Die Teilbefunde einzeln. Sie sagen zusammen, was LIVE_CHART_READY
       sagt - aber sie sagen auch, WAS genau fehlt, und das entscheidet
       ueber den naechsten Schritt. */
    streamFindings: {
      connectionAccepted: anyOpened,
      acceptedThresholdLevels: acceptedLevels,
      rejectedThresholdLevels: rejectedLevels,
      rejectionMessage: rejected.length ? rejected[0].connection.rejectedSubscription.message : null,
      quoteStreamAvailable: withQuotes.length > 0,
      tradeStreamAvailable: withTrades.length > 0,
      quoteMessagesObserved: withQuotes.length ? withQuotes[0].connection.quoteMessages : 0,
      tradeMessagesObserved: withTrades.length ? withTrades[0].connection.tradeMessages : 0,
      /* Nachrichten, die ankamen und die der Parser nicht zuordnen
         konnte. Der wichtigste Zaehler dieses Berichts, solange er nicht
         null ist: er trennt "kein Zugang" von "andere Nachrichtenform". */
      unparsedPriceMessages: measured.reduce(
        (max, r) => Math.max(max, (r.connection && r.connection.unparsedPriceMessages) || 0), 0),
      observedMessageShape: (measured.find(
        (r) => r.connection && (r.connection.messageShape || []).length) || { connection: {} })
        .connection.messageShape || [],
      priceTypeVerified: !unspecifiedOnly,
      priceTypeNote: unspecifiedOnly
        ? "Die Kursart ist nicht belegt. Sie zu klaeren ist der naechste Schritt - beim " +
          "Anbieter, nicht im Code: die Nachrichtenform der neuen IEX-Stufe traegt keinen " +
          "Typ. Bis dahin darf keine Kennzahl auf dieser Kerze als 'auf Abschluessen " +
          "gerechnet' ausgewiesen werden."
        : null,
      note: "Eine Kerze entsteht aus ausgefuehrten Trades. Quotes bewegen einen Chart " +
            "ebenfalls sichtbar, sind aber eine andere Groesse - Geld und Brief statt " +
            "Abschluss. Beides zu vermischen waere der Fehler, den die Trennung hier " +
            "verhindert."
    },
    /* Leer, wenn der Strom geliefert hat. Gefuellt sagt er, was der
       Anbieter STATTDESSEN geschickt hat - eine Bestaetigung ohne Daten
       sieht anders aus als eine abgelehnte Anmeldung. */
    silenceEvidence,
    /* Die Frage aus §21 - bewegt sich ein geoeffnetes Chart sichtbar? -
       ist genau die obere, in anderen Worten. Sie steht trotzdem
       getrennt, weil sie getrennt gestellt wurde. */
    marketOpenExperience: {
      /* §21 fragt nach sichtbarer Bewegung, nicht nach Trades. Ein
         Quote-Strom bewegt einen Chart - er bewegt ihn nur mit einer
         anderen Zahl. Die Antwort trennt das. */
      visibleMovementPossible: liveChartReady === "TRUE" || withQuotes.length > 0,
      fromExecutedTrades: withTrades.length > 0,
      fromQuotesOnly: withQuotes.length > 0 && withTrades.length === 0,
      basis: liveChartReason,
      decisionRequired: withQuotes.length > 0 && withTrades.length === 0
        ? "Zwei Wege: den Tarif um die Last-Sale-Daten erweitern, oder die laufende Kerze " +
          "ausdruecklich aus Quote-Mittelkursen bauen. Das zweite ist eine " +
          "Produktentscheidung mit Folgen fuer jede Kennzahl, die auf der Kerze rechnet - " +
          "sie gehoert nicht in ein Skript, sondern in eine Freigabe."
        : null
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
