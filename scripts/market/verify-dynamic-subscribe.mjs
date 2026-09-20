#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — verify-dynamic-subscribe.mjs

   EINE FRAGE, EINE MESSUNG (Zero-Cost Realtime V1, §1)

   Laesst sich die Tickerliste eines BESTEHENDEN Stufe-6-Sockets
   aendern - ["AAPL"] zu ["AAPL","NVDA"] zu ["NVDA"] - ohne die
   Verbindung neu aufzubauen?

   WARUM DAS ZAEHLT

   Der Subscription Manager kennt zwei Betriebsarten. "dynamic" meldet
   auf der offenen Verbindung nach; "reconnect" baut bei jeder Aenderung
   sauber neu auf. Reconnect ist immer richtig, aber teurer: jeder
   Seitenwechsel kostet einen Verbindungsaufbau und eine Luecke von
   ein, zwei Sekunden. Dynamic ist billiger - aber nur, wenn der
   Anbieter es wirklich kann. Auf Verdacht nachzumelden waere der Weg in
   einen Zustand, in dem ein Titel zu sehen ist, den niemand abonniert
   hat, oder einer fehlt, den jemand ansieht.

   Deshalb wird es gemessen und nicht geglaubt.

   WIE GEMESSEN WIRD

     Kontrolle  Ein eigener Socket mit beiden Titeln. Er beweist, dass
                in DIESEM Zeitfenster beide ueberhaupt handeln. Ohne ihn
                waere "keine NVDA-Ereignisse nach der Nachmeldung" nicht
                von "NVDA handelt gerade nicht" zu unterscheiden.
     P0 Basis   Ein Socket mit ["AAPL"]. Erwartet: AAPL ja, NVDA nein.
     P1 Zugang  Auf DEMSELBEN Socket subscribe ["NVDA"].
     P2 Abgang  Auf DEMSELBEN Socket unsubscribe ["AAPL"].

   WAS IM BERICHT STEHT

   Anzahlen, Abstaende, Antworten des Servers - und keine Kurse (§34).
   Der Schluessel erscheint nirgends; er steht in genau einer Nachricht,
   der Anmeldung, und die wird vor dem Protokollieren geschwaerzt.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TiingoRealtime = require(join(root, "providers", "tiingo", "realtime.js"));
const MarketHours = require(join(root, "quant", "engines", "realtime", "market-hours.js"));
const calendar = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const WS_URL = process.env.TIINGO_WS_URL || TiingoRealtime.DEFAULT_WS_URL;
const APIKEY = process.env.TIINGO_API_KEY || null;
/* Gemessen am 16.09.2026: nur diese Stufe nimmt dieses Konto an. */
const LEVEL = parseInt(arg("--level", "6"), 10) || 6;
const PHASE_SECONDS = Math.max(15, parseInt(arg("--phase-seconds", "45"), 10) || 45);
const A = String(arg("--a", "AAPL")).toUpperCase();
const B = String(arg("--b", "NVDA")).toUpperCase();

/* Ab wie vielen Ereignissen gilt ein Titel in einem Fenster als aktiv.
   Eins kann ein Zufall sein, drei sind ein Strom - dieselbe Schwelle wie
   im Stromnachweis. */
const MIN_EVENTS = 3;

/* Messfenster: 17.09.2026, regulaere US-Sitzung ab 09:30 New York. */

function jetzt() { return Date.now(); }
function schlafen(ms) { return new Promise((r) => setTimeout(r, ms)); }

function sitzung() {
  return MarketHours.sessionAt(jetzt(), { calendar, exchange: "XNYS" });
}

function anmeldung(eventName, tickers) {
  const n = { eventName, authorization: APIKEY || "", eventData: { thresholdLevel: LEVEL } };
  if (tickers) n.eventData.tickers = tickers.map((t) => t.toLowerCase());
  return n;
}
/* Fuer das Protokoll: dieselbe Nachricht ohne den Schluessel.

   Das Feld wird ENTFERNT, nicht geschwaerzt. Ein "[REDACTED]" an dieser
   Stelle waere zwar harmlos, liesse aber die Zeichenfolge
   "authorization": im Bericht stehen - und genau darauf schlaegt die
   Schluesselpruefung an, zu Recht: ein Muster, das man fuer diesen
   einen Fall entschaerft, faengt den naechsten nicht mehr. */
function ohneSchluessel(n) {
  const k = JSON.parse(JSON.stringify(n));
  delete k.authorization;
  k.authorizationField = "entfernt (stand nur in der Nachricht an den Anbieter)";
  return k;
}

/**
 * Ein Socket, den man waehrend des Laufs weiter befehligen kann.
 */
function oeffne(tickers) {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.WebSocket !== "function") {
      reject(new Error("Diese Node-Laufzeit stellt kein WebSocket bereit."));
      return;
    }
    const ws = new globalThis.WebSocket(WS_URL);
    const griff = {
      ws,
      offen: false,
      gesendet: [],           /* geschwaerzt */
      verwaltung: [],         /* Antworten ohne Kurs */
      ereignisse: [],         /* {at, symbol} - ohne Kurs */
      fehler: null,
      geschlossenMit: null,
      senden(n) { griff.gesendet.push({ at: new Date().toISOString(), nachricht: ohneSchluessel(n) }); ws.send(JSON.stringify(n)); },
      zaehle(symbol, vonMs, bisMs) {
        const s = symbol.toUpperCase();
        return griff.ereignisse.filter((e) => e.symbol === s && e.at >= vonMs && e.at <= bisMs).length;
      },
      symboleIn(vonMs, bisMs) {
        const m = Object.create(null);
        griff.ereignisse.forEach((e) => { if (e.at >= vonMs && e.at <= bisMs) m[e.symbol] = (m[e.symbol] || 0) + 1; });
        return m;
      },
      zu() { try { ws.close(1000, "fertig"); } catch (err) { /* schon zu */ } }
    };
    ws.onopen = () => {
      griff.offen = true;
      griff.senden(anmeldung("subscribe", tickers));
      resolve(griff);
    };
    ws.onerror = (ev) => { griff.fehler = (ev && ev.message) || "socketError"; };
    ws.onclose = (ev) => { griff.offen = false; griff.geschlossenMit = { code: ev && ev.code, reason: (ev && ev.reason) || null }; };
    ws.onmessage = (ev) => {
      let roh = null;
      try { roh = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch (e) { return; }
      /* parseIexMessage liefert einen Umschlag {tick, raw}, nicht den
         Tick selbst. Der erste Lauf am 17.09.2026 hat genau das
         uebersehen: alle Kurse landeten in der Verwaltungsablage, die
         Kontrolle sah null Ereignisse fuer AAPL und NVDA um 09:42 New
         York - und meldete INCONCLUSIVE. Die Anordnung war richtig; der
         Leser war es nicht. */
      const umschlag = TiingoRealtime.parseIexMessage(ev);
      const tick = umschlag && umschlag.tick ? umschlag.tick : null;
      if (tick && tick.symbol) {
        griff.ereignisse.push({ at: jetzt(), symbol: String(tick.symbol).toUpperCase() });
        return;
      }
      /* Alles, was kein Kurs ist, ist eine Auskunft des Servers - und
         genau die entscheidet die Frage, wenn er die Nachmeldung
         ablehnt. Sie wird deshalb vollstaendig aufgehoben; sie traegt
         keine Kurse. */
      if (griff.verwaltung.length < 40) {
        griff.verwaltung.push({ at: new Date().toISOString(), nachricht: roh });
      }
    };
    setTimeout(() => { if (!griff.offen) reject(new Error("Verbindungsaufbau nach 20 s ohne Antwort.")); }, 20000);
  });
}

async function fenster(griff, sekunden, name) {
  const von = jetzt();
  await schlafen(sekunden * 1000);
  const bis = jetzt();
  return { phase: name, von: new Date(von).toISOString(), bis: new Date(bis).toISOString(),
           sekunden, symbols: griff.symboleIn(von, bis), vonMs: von, bisMs: bis };
}

async function main() {
  const s = sitzung();
  const bericht = {
    schemaVersion: "dynamic-subscribe-verification-1.0.0",
    frage: "Laesst sich die Tickerliste eines bestehenden Stufe-" + LEVEL + "-Sockets aendern, " +
           "ohne die Verbindung neu aufzubauen?",
    auftrag: "Zero-Cost Realtime V1 §1",
    checkedAt: new Date().toISOString(),
    endpoint: WS_URL,
    thresholdLevel: LEVEL,
    symbols: { a: A, b: B },
    phaseSeconds: PHASE_SECONDS,
    session: { phase: s.phase, localDate: s.localDate, localTime: s.localTime,
               isOpen: s.isOpen, calendarCoverage: s.calendarCoverage },
    result: "UNKNOWN",
    reason: null,
    consequence: null,
    control: null, phases: [], serverMessages: [], sent: []
  };

  if (!APIKEY) {
    bericht.result = "UNKNOWN";
    bericht.reason = "noApiKey";
    bericht.consequence = "Ohne Schluessel gibt es keine Verbindung. Der Manager bleibt im Modus 'reconnect'.";
    return schreibe(bericht);
  }
  if (s.phase !== "REGULAR") {
    /* Ausserhalb der Sitzung ist jede Antwort auf diese Frage geraten:
       ohne Handel gibt es keine Ereignisse, und ohne Ereignisse ist eine
       geglueckte Nachmeldung von einer stillen nicht zu unterscheiden. */
    bericht.result = "UNKNOWN";
    bericht.reason = "marketClosed:" + s.phase;
    bericht.consequence = "Nur waehrend der regulaeren Sitzung messbar. Der Manager bleibt bis dahin " +
                          "im Modus 'reconnect' - der ist immer richtig, nur teurer.";
    return schreibe(bericht);
  }

  /* ---- Kontrolle: handeln beide Titel in diesem Fenster ueberhaupt? */
  console.log("Kontrolle: " + A + " und " + B + " auf einem eigenen Socket, " + PHASE_SECONDS + " s …");
  const kontrolle = await oeffne([A, B]);
  const kFenster = await fenster(kontrolle, PHASE_SECONDS, "control");
  kontrolle.zu();
  bericht.control = {
    phase: "control", sekunden: PHASE_SECONDS, symbols: kFenster.symbols,
    aActive: (kFenster.symbols[A] || 0) >= MIN_EVENTS,
    bActive: (kFenster.symbols[B] || 0) >= MIN_EVENTS,
    note: "Ohne diesen Lauf waere 'keine Ereignisse nach der Nachmeldung' nicht von " +
          "'der Titel handelt gerade nicht' zu unterscheiden."
  };
  bericht.serverMessages = bericht.serverMessages.concat(kontrolle.verwaltung.slice(0, 5));
  console.log("   " + JSON.stringify(kFenster.symbols));

  if (!bericht.control.aActive || !bericht.control.bActive) {
    bericht.result = "INCONCLUSIVE";
    bericht.reason = "controlInactive";
    bericht.consequence = "In diesem Fenster handelte mindestens einer der beiden Titel nicht oft genug. " +
                          "Ein Nein waere hier nicht belegt, sondern erschlossen. Der Manager bleibt im " +
                          "Modus 'reconnect'.";
    return schreibe(bericht);
  }

  /* ---- Der eigentliche Lauf auf EINEM Socket -------------------------- */
  console.log("P0: Socket mit [" + A + "] …");
  const g = await oeffne([A]);
  const p0 = await fenster(g, PHASE_SECONDS, "P0_baseline");
  console.log("   " + JSON.stringify(p0.symbols));

  console.log("P1: subscribe [" + B + "] auf demselben Socket …");
  const nachmeldungAt = jetzt();
  g.senden(anmeldung("subscribe", [B]));
  const p1 = await fenster(g, PHASE_SECONDS, "P1_add");
  console.log("   " + JSON.stringify(p1.symbols));

  console.log("P2: unsubscribe [" + A + "] auf demselben Socket …");
  g.senden(anmeldung("unsubscribe", [A]));
  const p2 = await fenster(g, PHASE_SECONDS, "P2_remove");
  console.log("   " + JSON.stringify(p2.symbols));

  const nochOffen = g.offen;
  const geschlossenMit = g.geschlossenMit;
  g.zu();

  bericht.phases = [p0, p1, p2].map((p) => ({
    phase: p.phase, from: p.von, to: p.bis, seconds: p.sekunden, symbols: p.symbols,
    a: p.symbols[A] || 0, b: p.symbols[B] || 0
  }));
  bericht.sent = g.gesendet;
  bericht.serverMessages = bericht.serverMessages.concat(g.verwaltung);
  bericht.socket = {
    /* Eine einzige Verbindung ueber alle drei Phasen - das ist die
       halbe Frage. Waere sie zwischendurch abgerissen, saehe eine
       geglueckte Nachmeldung genauso aus wie ein Neuaufbau. */
    stayedOpen: nochOffen,
    closedWith: geschlossenMit,
    reconnects: 0,
    openedAt: new Date(nachmeldungAt - PHASE_SECONDS * 1000).toISOString()
  };

  /* ---- Urteil --------------------------------------------------------- */
  const p0b = p0.symbols[B] || 0;
  const p1b = p1.symbols[B] || 0;
  const p1a = p1.symbols[A] || 0;
  const p2a = p2.symbols[A] || 0;
  const p2b = p2.symbols[B] || 0;
  const ablehnung = bericht.serverMessages.find((m) => {
    const t = JSON.stringify(m.nachricht || "").toLowerCase();
    return t.indexOf("error") !== -1 || t.indexOf("not valid") !== -1 || t.indexOf("invalid") !== -1;
  }) || null;

  bericht.evidence = {
    baselineLeak: p0b, addObserved: p1b, aDuringAdd: p1a,
    aAfterRemove: p2a, bAfterRemove: p2b,
    socketStayedOpen: nochOffen,
    explicitRejection: ablehnung ? ablehnung.nachricht : null
  };

  if (!nochOffen) {
    bericht.result = "INCONCLUSIVE";
    bericht.reason = "socketClosedDuringRun";
    bericht.consequence = "Die Verbindung hielt nicht ueber alle drei Phasen. Damit ist nicht zu trennen, " +
                          "ob eine Nachmeldung wirkte oder ein Neuaufbau. Modus bleibt 'reconnect'.";
  } else if (p0b >= MIN_EVENTS) {
    /* Der Socket liefert einen Titel, der nie abonniert wurde. Dann misst
       diese Anordnung nicht, was sie zu messen vorgibt. */
    bericht.result = "INCONCLUSIVE";
    bericht.reason = "baselineLeak";
    bericht.consequence = "Der Socket lieferte " + B + ", bevor er abonniert war. Die Tickerliste wirkt in " +
                          "dieser Anordnung nicht als Filter; der Nachweis misst dann etwas anderes als " +
                          "die Frage. Modus bleibt 'reconnect'.";
  } else if (p1b >= MIN_EVENTS) {
    bericht.result = "DYNAMIC_SUPPORTED";
    bericht.reason = null;
    bericht.consequence = "Nachmelden wirkt auf der offenen Verbindung. Der Subscription Manager darf im " +
                          "Modus 'dynamic' laufen (TIINGO_DYNAMIC_SUBSCRIBE=true); ein Titelwechsel kostet " +
                          "dann keinen Verbindungsaufbau mehr." +
                          (p2a < MIN_EVENTS
                            ? " Das Abmelden wirkt ebenfalls: " + A + " verstummte."
                            : " ACHTUNG: das Abmelden wirkte NICHT - " + A + " lief weiter (" + p2a +
                              " Ereignisse). Ein Titel, den niemand mehr ansieht, kostet dann bis zum " +
                              "Neuaufbau weiter Kontingent.");
  } else if (ablehnung) {
    bericht.result = "DYNAMIC_REJECTED";
    bericht.reason = "serverRejected";
    bericht.consequence = "Der Server hat die Nachmeldung ausdruecklich abgelehnt. Der Manager bleibt im " +
                          "Modus 'reconnect' - jede Aenderung baut sauber neu auf.";
  } else {
    bericht.result = "DYNAMIC_REJECTED";
    bericht.reason = "silentlyIgnored";
    bericht.consequence = "Die Nachmeldung blieb wirkungslos: " + B + " lieferte " + p1b + " Ereignisse, " +
                          "obwohl die Kontrolle im selben Zeitraum " + (kFenster.symbols[B] || 0) + " zeigte. " +
                          "Stillschweigend ignoriert ist der gefaehrlichere der beiden Faelle - der Manager " +
                          "bleibt im Modus 'reconnect'.";
  }

  return schreibe(bericht);
}

function schreibe(bericht) {
  mkdirSync(OUT_DIR, { recursive: true });
  const pfad = join(OUT_DIR, "dynamic-subscribe-verification.json");
  writeFileSync(pfad, JSON.stringify(bericht, null, 2) + "\n");
  console.log("");
  console.log("ERGEBNIS: " + bericht.result + (bericht.reason ? " (" + bericht.reason + ")" : ""));
  console.log(bericht.consequence || "");
  console.log("Bericht: " + pfad);
  return bericht;
}

main().catch((err) => {
  console.error("Fehlgeschlagen: " + (err && err.message ? err.message : err));
  schreibe({
    schemaVersion: "dynamic-subscribe-verification-1.0.0",
    checkedAt: new Date().toISOString(), result: "UNKNOWN", reason: "runError",
    message: (err && err.message) || String(err),
    consequence: "Ohne Messung bleibt der Manager im Modus 'reconnect'."
  });
  process.exitCode = 0;
});
