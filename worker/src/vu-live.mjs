/* =========================================================================
   VISION UNIVERSE — worker/src/vu-live.mjs

   Das eine Durable Object. Es haelt genau eine Tiingo-Verbindung und
   bedient daraus alle Browser, die gerade eine Aktienseite offen haben.

   WARUM GENAU EINES

   Gemessen am 16.09.2026: das ganze Band sind 1.022 Ereignisse je
   Sekunde. Das kostenlose Kontingent traegt 85. Ein Titel, den jemand
   ansieht, sind im schlimmsten Fall 1,7. Also wird abonniert, was
   jemand ansieht - und das passt in ein Objekt: gemessen 2,22 Mikro-
   sekunden Rechenzeit je Ereignis und rund 8 MB fuer fuenfzig Titel mit
   laufender Kerze, bei 128 MB Speicher und einem Kern.

   Sharding waere Komplexitaet ohne Messwert dahinter.

   WAS ES NICHT TUT

   Es entscheidet nicht, ob "LIVE" ueber dem Chart stehen darf. Es
   liefert Kurse mit Zeitstempel; das Etikett entsteht im Browser aus
   freshness.js und data-status.js - denselben Modulen wie beim
   statischen Pfad. Ein zweiter Ort, an dem "LIVE" entsteht, waere der
   Ort, an dem es irgendwann faelschlich entsteht.

   Es speichert auch keine Ticks. Die Historie kommt aus dem statischen
   Pfad und aus R2; der Strom ergaenzt nur den letzten Punkt und die
   laufende Kerze.
   ========================================================================= */

import SubscriptionManager from "../../quant/engines/realtime/subscription-manager.js";
import FreeBudget from "../../quant/engines/realtime/free-budget.js";
import BarMerge from "../../quant/engines/realtime/bar-merge.js";
import MarketHours from "../../quant/engines/realtime/market-hours.js";
import { createTiingoLink } from "./tiingo-link.mjs";
import kalender from "../../quant/config/market-calendar.json" with { type: "json" };

/* Additive wire contract: indices 0..7 retain their legacy meaning.
   The parallel semantics array describes the LAST EVENT, not the OHLC candle.
   Untyped provider events must never inherit TRADE from an earlier event.
   The legacy candle can contain reference events; consumers requiring
   trades must build their own view from explicitly typed trade prices,
   never interpret these OHLC fields as trade-only candles. */
const UPDATE_SCHEMA = "vu-live-update-1.1.0";
function updateRow(symbol, value) {
  return [symbol, value.last, value.at, value.o, value.h, value.l, value.c, value.pAt];
}

/* Wie oft der Browser hoert. Nicht jedes Ereignis wird gezeichnet:
   1.022 Nachrichten je Sekunde waeren fuer ein Auge dasselbe Bild wie
   eine, kosteten aber Bandbreite und Rechenzeit auf einem Telefon. */
const COALESCE_MS = 1000;
/* Der Wecker: er prueft die Sitzung, raeumt abgelaufene Abonnements und
   schreibt den Verbrauch fort. */
const ALARM_MS = 30000;
/* Ohne Zuschauer wird nach dieser Zeit alles geschlossen. */
const IDLE_CLOSE_MS = 60000;
/* Eine harte Obergrenze, unabhaengig vom Budget. */
const MAX_SYMBOLS = 50;
/* Nachlauf eines Titels, den gerade niemand mehr ansieht. Wer zwischen
   zwei Aktienseiten hin- und herspringt, soll nicht zweimal einen
   Verbindungsaufbau bezahlen. */
const GRACE_MS = 60000;

function jetzt() { return Date.now(); }

function zahl(wert, ersatz) {
  var n = Number(wert);
  return isFinite(n) && n >= 0 ? n : ersatz;
}

/**
 * Was zur Laufzeit gilt.
 *
 * Alle Werte kommen aus der Umgebung und haben einen Vorgabewert. Die
 * beiden Eintraege mit zwei Unterstrichen sind Einspeisepunkte fuer
 * Tests - in Cloudflare enthaelt env nur Zeichenketten und Bindungen,
 * eine Funktion kann dort nicht stehen. Es ist dieselbe Naht, die
 * transport.js seit jeher hat: die Zeit und die Verbindung werden
 * gereicht, nicht genommen. Ohne sie waere jeder Test dieser Datei ein
 * Test gegen die echte Boerse und die echte Uhr.
 */
function laufzeit(env) {
  var uhr = typeof env.__now === "function" ? env.__now : jetzt;
  return {
    now: uhr,
    fetchImpl: typeof env.__fetch === "function" ? env.__fetch : undefined,
    timers: typeof env.__timers === "object" && env.__timers ? env.__timers : {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { return clearTimeout(id); },
      now: uhr
    },
    coalesceMs: zahl(env.COALESCE_MS, COALESCE_MS),
    alarmMs: zahl(env.ALARM_MS, ALARM_MS),
    idleCloseMs: zahl(env.IDLE_CLOSE_MS, IDLE_CLOSE_MS),
    graceMs: zahl(env.GRACE_MS, GRACE_MS),
    maxSymbols: zahl(env.MAX_SYMBOLS, MAX_SYMBOLS),
    dynamic: env.TIINGO_DYNAMIC_SUBSCRIBE === "true"
  };
}

export function sitzung(t) {
  return MarketHours.sessionAt(t === undefined ? jetzt() : t,
                               { calendar: kalender, exchange: "XNYS" });
}

/* Wie lange die regulaere Sitzung noch laeuft. Der Budgetwaechter
   rechnet damit vorher aus, was ein neues Symbol bis zum Schluss
   kostet.

   Gerechnet wird in Ortszeit der Boerse, nicht in UTC: 16:00 New York
   ist mal 20:00 und mal 21:00 UTC, je nach Sommerzeit. Der
   Sitzungsbefund liefert die Ortszeit schon fertig - und mit ihr den
   vorgezogenen Schluss an den halben Handelstagen. */
const REGULAR_END_LOCAL = "16:00";

function minutenAus(hhmm) {
  const teile = String(hhmm || "").split(":");
  return (parseInt(teile[0], 10) || 0) * 60 + (parseInt(teile[1], 10) || 0);
}

export function restSekunden(t) {
  const s = sitzung(t);
  if (s.phase !== "REGULAR" || !s.localTime) return 0;
  const teile = s.localTime.split(":");
  const jetztSek = (parseInt(teile[0], 10) || 0) * 3600 +
                   (parseInt(teile[1], 10) || 0) * 60 +
                   (parseInt(teile[2], 10) || 0);
  const endeSek = minutenAus(s.earlyClose || REGULAR_END_LOCAL) * 60;
  return Math.max(0, endeSek - jetztSek);
}

export class VuLive {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    const cfg = laufzeit(env);
    this.cfg = cfg;
    this.now = cfg.now;
    this.clients = new Map();          /* WebSocket -> {id, symbols:Set} */
    this.werte = new Map();            /* SYMBOL -> {last, at, o,h,l,c, bucket} */
    this.serien = new Map();           /* SYMBOL -> bar-merge Serie */
    this.schmutzig = new Set();
    this.flushTimer = null;
    this.letzterAktivStempel = cfg.now();
    this.protokoll = [];
    this.letztePhase = sitzung(cfg.now()).phase;

    this.budget = FreeBudget.create({
      sessionRemainingSeconds: () => restSekunden(cfg.now()),
      now: cfg.now,
      onVerdict: (s) => this.budgetGeaendert(s)
    });

    this.link = createTiingoLink({
      apiKey: env.TIINGO_API_KEY,
      fetchImpl: cfg.fetchImpl,
      timers: cfg.timers,
      /* Bis die Messung bei offener Boerse vorliegt: keine Nachmeldung
         auf Verdacht (siehe tiingo-link.mjs). */
      dynamicSupported: cfg.dynamic,
      onRaw: (n) => this.budget.noteProviderMessages(n),
      log: (ereignis, daten) => this.notiere(ereignis, daten)
    });

    this.manager = SubscriptionManager.create({
      link: this.link,
      mode: cfg.dynamic ? "dynamic" : "reconnect",
      maxSymbols: cfg.maxSymbols,
      graceMs: cfg.graceMs,
      timers: cfg.timers,
      budget: this.budget,
      session: () => sitzung(cfg.now()).phase,
      allowedSessions: ["REGULAR"],
      onTick: (tick) => this.tick(tick),
      onStatus: (s) => this.statusAnAlle(s)
    });
  }

  notiere(ereignis, daten) {
    /* Kein Schluessel, keine Kurse. Nur Anzahlen und Gruende. */
    this.protokoll.push({ at: new Date().toISOString(), ereignis, daten: daten || null });
    if (this.protokoll.length > 50) this.protokoll.shift();
  }

  /* ------------------------------------------------------------ Eingang */

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/health")) {
      return new Response(JSON.stringify(this.health(), null, 2),
        { headers: { "content-type": "application/json; charset=utf-8" } });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("vu-live erwartet eine WebSocket-Verbindung.", { status: 426 });
    }

    const paar = new WebSocketPair();
    const [client, server] = Object.values(paar);
    server.accept();

    const id = crypto.randomUUID();
    this.clients.set(server, { id, symbols: new Set() });
    this.budget.noteConnection(1);
    this.budget.noteClients(this.clients.size);
    this.letzterAktivStempel = this.now();
    await this.weckerStellen();

    server.addEventListener("message", (ev) => this.vomClient(server, ev));
    server.addEventListener("close", () => this.clientWeg(server));
    server.addEventListener("error", () => this.clientWeg(server));

    this.sende(server, {
      op: "hello",
      mode: this.manager.mode(),
      session: sitzung(this.now()).phase,
      coalesceMs: this.cfg.coalesceMs,
      maxSymbols: this.cfg.maxSymbols,
      budget: this.budget.snapshot().verdict,
      priceType: "REALTIME_REFERENCE",
      source: "TIINGO_IEX_LEVEL6"
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  vomClient(ws, ev) {
    const eintrag = this.clients.get(ws);
    if (!eintrag) return;
    this.budget.noteClientMessages(1);
    this.letzterAktivStempel = this.now();

    let nachricht;
    try { nachricht = JSON.parse(typeof ev.data === "string" ? ev.data : ""); }
    catch (err) { return; }
    if (!nachricht || typeof nachricht.op !== "string") return;

    if (nachricht.op === "ping") { this.sende(ws, { op: "pong", t: this.now() }); return; }

    if (nachricht.op === "subscribe") {
      /* Ausserhalb der regulaeren Sitzung gibt es nichts zu streamen -
         und der Browser muss das erfahren. Ein stilles "ja" mit
         anschliessender Stille waere genau die Auskunft, die der
         statische Pfad seit jeher vermeidet: er soll auf den Snapshot
         zurueckfallen und den Stand mit Uhrzeit nennen. */
      const phase = sitzung(this.now()).phase;
      if (phase !== "REGULAR") {
        for (const roh of (nachricht.symbols || []).slice(0, 200)) {
          const sym = String(roh || "").trim().toUpperCase();
          if (sym) this.sende(ws, { op: "denied", symbol: sym, reason: "sessionClosed", session: phase });
        }
        this.sende(ws, { op: "subscribed", symbols: [...eintrag.symbols], session: phase });
        return;
      }
      /* Nicht abschneiden: was ueber der Grenze liegt, wird abgelehnt
         und benannt. Stillschweigend die Liste zu kuerzen hiesse, dem
         Browser einen Titel zu versprechen, der nie kommt. Die 200 sind
         nur ein Riegel gegen eine sinnlos lange Nachricht. */
      const symbole = (nachricht.symbols || []).slice(0, 200);
      for (const roh of symbole) {
        const sym = String(roh || "").trim().toUpperCase();
        if (!sym || eintrag.symbols.has(sym)) continue;
        const urteil = this.manager.acquire(sym, eintrag.id);
        if (!urteil.allowed) {
          /* Abgelehnt heisst abgelehnt, mit Grund - der Browser faellt
             dann auf den Snapshot-Pfad zurueck und zeigt das ehrlich an. */
          this.sende(ws, { op: "denied", symbol: sym, reason: urteil.reason });
          continue;
        }
        eintrag.symbols.add(sym);
        /* Was schon bekannt ist, sofort schicken - sonst bleibt der
           Chart bis zum naechsten Ereignis ohne Live-Punkt. */
        const w = this.werte.get(sym);
        if (w) this.sende(ws, { op: "u", t: this.now(),
                                schemaVersion: UPDATE_SCHEMA, v: [updateRow(sym, w)], semantics: [w.semantics] });
      }
      /* Gezaehlt wird, was gewuenscht ist - nicht, was in dieser
         Millisekunde schon angemeldet ist. Der Abgleich mit dem
         Anbieter laeuft erst ein paar hundert Millisekunden spaeter;
         bis dahin waere der Spitzenwert immer null. */
      this.budget.noteSymbols(this.manager.wanted().length);
      this.sende(ws, { op: "subscribed", symbols: [...eintrag.symbols] });
      return;
    }

    if (nachricht.op === "unsubscribe") {
      for (const roh of (nachricht.symbols || [])) {
        const sym = String(roh || "").trim().toUpperCase();
        if (!eintrag.symbols.delete(sym)) continue;
        this.manager.release(sym, eintrag.id);
      }
      this.sende(ws, { op: "subscribed", symbols: [...eintrag.symbols] });
    }
  }

  clientWeg(ws) {
    const eintrag = this.clients.get(ws);
    if (!eintrag) return;
    this.clients.delete(ws);
    this.manager.releaseClient(eintrag.id);
    this.letzterAktivStempel = this.now();
  }

  /* ------------------------------------------------------------- Kurse */

  tick(tick) {
    const sym = String(tick.symbol || "").toUpperCase();
    const preis = tick.price;
    if (!sym || typeof preis !== "number" || !isFinite(preis)) return;
    const at = this.now();

    /* Die laufende Kerze mit derselben Engine wie der Chart. Nur fuer
       abonnierte Titel - eine Serie je Titel des ganzen Bandes waeren
       gemessene 941 MB und damit das Siebenfache des Erlaubten. */
    let serie = this.serien.get(sym);
    if (!serie) {
      serie = BarMerge.createSeries({ timeframe: "1m", interval: "1m", calendar: kalender,
                                      exchange: "XNYS", adjustmentStatus: null, maxBars: 30,
                                      /* Dieselbe Uhr wie alles andere hier: sonst
                                         beurteilt die Kerzenschicht einen Tick nach
                                         Date.now() und der Rest des Objekts nach der
                                         gereichten Zeit. */
                                      now: this.now });
      this.serien.set(sym, serie);
    }
    serie.applyTick({ price: preis, size: tick.size || null, timestamp: tick.timestamp,
                      receivedAt: at, currency: "USD", source: "tiingo",
                      dataClass: "REALTIME_STREAM" });
    const kerze = serie.last();

    /* Der Zeitstempel DES ANBIETERS, nicht der unsere. Erst mit ihm
       laesst sich die Kette auseinandernehmen: wann hat Tiingo den Kurs
       gesehen, wann Cloudflare, wann der Browser. Ohne ihn waere jede
       Latenzangabe eine Angabe ueber die halbe Strecke. */
    const pAt = tick.timestamp ? Date.parse(tick.timestamp) : NaN;

    this.werte.set(sym, {
      last: preis, at: at, pAt: isFinite(pAt) ? pAt : null,
      semantics: {
        priceType: tick.priceType === "TRADE" && tick.messageForm === "iexTyped"
          ? "TRADE" : "UNSPECIFIED",
        messageForm: tick.messageForm === "iexTyped" || tick.messageForm === "iexNoTypeField"
          ? tick.messageForm : null,
        candlePriceType: "REALTIME_REFERENCE"
      },
      o: kerze ? kerze.open : preis, h: kerze ? kerze.high : preis,
      l: kerze ? kerze.low : preis, c: kerze ? kerze.close : preis,
      bucket: kerze ? kerze.bucket : null
    });
    this.schmutzig.add(sym);
    this.flushPlanen();
  }

  flushPlanen() {
    if (this.flushTimer !== null) return;
    this.flushTimer = this.cfg.timers.setTimeout(() => { this.flushTimer = null; this.flush(); }, this.cfg.coalesceMs);
  }

  flush() {
    if (!this.schmutzig.size) return;
    const t = this.now();
    for (const [ws, eintrag] of this.clients) {
      const nutz = [];
      const semantics = [];
      for (const sym of eintrag.symbols) {
        if (!this.schmutzig.has(sym)) continue;
        const w = this.werte.get(sym);
        if (w) { nutz.push(updateRow(sym, w)); semantics.push(w.semantics); }
      }
      if (nutz.length) this.sende(ws, { op: "u", t, schemaVersion: UPDATE_SCHEMA, v: nutz, semantics });
    }
    this.schmutzig.clear();
  }

  /* ------------------------------------------------------- Zustand raus */

  statusAnAlle(s) {
    const nachricht = {
      op: "status", state: s.state, reason: s.reason, mode: s.mode,
      modeReason: s.modeReason, symbols: s.symbols.length, session: sitzung(this.now()).phase
    };
    for (const ws of this.clients.keys()) this.sende(ws, nachricht);
  }

  budgetGeaendert(schnappschuss) {
    this.notiere("budget", { verdict: schnappschuss.verdict, share: schnappschuss.share });
    for (const ws of this.clients.keys()) {
      this.sende(ws, { op: "budget", verdict: schnappschuss.verdict });
    }
    /* PROTECT IST DAS ENDE, NICHT DIE VORSTUFE ZUM ENDE.

       Owner-Regel vom 17.09.2026: "bei PROTECT Realtime kontrolliert
       deaktivieren, automatischer Fallback auf den bestehenden
       Snapshot-/Intraday-Pfad".

       Die erste Fassung hat bei PROTECT nur keine neuen Titel mehr
       aufgenommen und erst bei erschoepftem Kontingent abgeschaltet.
       Das war zu spaet gedacht: zwischen 85 und 100 Prozent laufen die
       bereits abonnierten Titel weiter und verbrauchen den Rest - und
       das Ende waere dann kein kontrollierter Rueckfall, sondern ein
       Abbruch mitten im Handel.

       Jetzt gilt: bei PROTECT wird der Strom beendet, der Browser
       erfaehrt den Grund und faellt auf den Snapshot-Pfad zurueck. Die
       15 Prozent Rest bleiben, wofuer sie da sind - als Rest. */
    if (schnappschuss.verdict === "PROTECT" || schnappschuss.verdict === "EXHAUSTED") {
      const grund = schnappschuss.verdict === "PROTECT" ? "budgetProtect" : "budgetExhausted";
      this.manager.shutdown(grund);
      this.notiere("realtimeDeaktiviert", { verdict: schnappschuss.verdict, grund: grund });
      for (const ws of this.clients.keys()) {
        this.sende(ws, { op: "status", state: "IDLE", reason: grund,
                         fallback: "snapshot",
                         message: "Der Kurs laeuft nicht mehr mit. Die Seite zeigt weiter den " +
                                  "Stand mit Uhrzeit." });
      }
    }
  }

  sende(ws, objekt) {
    try { ws.send(JSON.stringify(objekt)); } catch (err) { this.clientWeg(ws); }
  }

  /* ------------------------------------------------------------ Wecker */

  async weckerStellen() {
    const wann = this.now() + this.cfg.alarmMs;
    try { await this.state.storage.setAlarm(wann); } catch (err) { /* ohne Wecker laeuft es weiter */ }
  }

  async alarm() {
    this.budget.noteAlarm(1);
    this.budget.noteActiveSeconds(this.cfg.alarmMs / 1000);
    this.budget.noteSymbols(this.manager.wanted().length);
    this.budget.noteClients(this.clients.size);

    const phase = sitzung(this.now()).phase;
    /* Wechselt die Sitzung, erfahren es alle - sonst wartet ein Browser,
       der um 09:29 abgewiesen wurde, bis in alle Ewigkeit auf einen
       Strom, den er nie wieder anfragt. */
    if (phase !== this.letztePhase) {
      this.letztePhase = phase;
      for (const ws of this.clients.keys()) {
        this.sende(ws, { op: "session", session: phase });
      }
    }
    /* Handelsschluss: alles zu. Nicht warten, bis der letzte Browser
       geht - ausserhalb der Sitzung gibt es nichts zu streamen. */
    if (phase !== "REGULAR") {
      this.manager.shutdown("sessionClosed");
    } else {
      this.manager.reevaluate();
    }

    /* Keine Zuschauer mehr: nach der Karenz schliessen und schlafen. */
    if (!this.clients.size && this.now() - this.letzterAktivStempel > this.cfg.idleCloseMs) {
      this.manager.shutdown("idle");
      this.serien.clear();
      this.werte.clear();
      return;                       /* kein neuer Wecker: das Objekt darf schlafen */
    }
    await this.weckerStellen();
  }

  health() {
    const s = this.manager.status();
    return {
      object: "vu-live",
      session: sitzung(this.now()).phase,
      sessionRemainingSeconds: restSekunden(this.now()),
      manager: { state: s.state, reason: s.reason, mode: s.mode, modeReason: s.modeReason,
                 symbols: s.symbols, clients: this.clients.size },
      budget: this.budget.snapshot(),
      values: this.werte.size,
      series: this.serien.size,
      priceType: "REALTIME_REFERENCE",
      source: "TIINGO_IEX_LEVEL6",
      log: this.protokoll.slice(-10)
    };
  }
}
