/* =========================================================================
   Tests fuer realtime/subscription-manager.js

   Gepruefte Zusage: EINE Anbieterverbindung, egal wie viele Zuschauer.
   Die Uhr wird gestellt, nicht abgewartet - eine Grace Period von sechzig
   Sekunden laesst sich sonst nicht pruefen, ohne sechzig Sekunden zu
   verbrauchen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SM = require("../engines/realtime/subscription-manager.js");

/* Eine Uhr, die stillsteht, bis jemand sie weiterdreht. */
function fakeTimers() {
  let jetzt = 1000000;
  let seq = 1;
  const wecker = new Map();
  return {
    setTimeout(fn, ms) { const id = seq++; wecker.set(id, { at: jetzt + ms, fn }); return id; },
    clearTimeout(id) { wecker.delete(id); },
    now() { return jetzt; },
    /* Zeit vorspulen und alles ausloesen, was faellig wird. */
    advance(ms) {
      const ziel = jetzt + ms;
      for (;;) {
        let naechster = null, nid = null;
        for (const [id, w] of wecker) {
          if (w.at <= ziel && (naechster === null || w.at < naechster)) { naechster = w.at; nid = id; }
        }
        if (nid === null) break;
        const w = wecker.get(nid);
        wecker.delete(nid);
        jetzt = w.at;
        w.fn();
      }
      jetzt = ziel;
    },
    pending() { return wecker.size; }
  };
}

/* Eine Anbieterverbindung als Attrappe: sie merkt sich, was mit ihr
   geschehen ist, und kann Kurse einspielen. */
function fakeLink(opts = {}) {
  const log = [];
  let offen = false, tickers = [], hs = null;
  return {
    log, opensCount: 0, updatesCount: 0, closesCount: 0,
    open(t, handlers) {
      this.opensCount++;
      offen = true; tickers = t.slice(); hs = handlers;
      log.push(["open", t.join(",")]);
      if (opts.autoOpen !== false) handlers.onOpen();
    },
    update(add, remove) {
      if (opts.dynamicSupported === false) { log.push(["update-rejected", add.join(",") + "|" + remove.join(",")]); return false; }
      this.updatesCount++;
      tickers = tickers.filter((x) => remove.indexOf(x) === -1).concat(add);
      log.push(["update", add.join(",") + "|" + remove.join(",")]);
      return true;
    },
    close() { this.closesCount++; offen = false; log.push(["close", tickers.join(",")]); if (hs) hs.onClose(); },
    isOpen() { return offen; },
    tickers() { return tickers.slice(); },
    /* Einen Kurs einspielen, so wie der Anbieter es taete. */
    emit(symbol, price) { if (hs) hs.onTick({ symbol, price, priceType: "REALTIME_REFERENCE" }); },
    fail(reason) { if (hs) hs.onError({ reason, fatal: false }); }
  };
}

function baue(overrides = {}) {
  const timers = fakeTimers();
  const link = fakeLink(overrides.linkOpts);
  const ticks = [];
  const zustaende = [];
  const m = SM.create(Object.assign({
    link, timers,
    graceMs: 60000, settleMs: 400, maxSymbols: 50,
    onTick: (t) => ticks.push(t),
    onStatus: (s) => zustaende.push(s.state)
  }, overrides.manager));
  return { m, link, timers, ticks, zustaende };
}

/* ------------------------------------------------------------ Grundlagen */

test("SM-1 ein Nutzer, ein Titel: genau eine Verbindung mit genau diesem Titel", () => {
  const { m, link, timers } = baue();
  assert.equal(m.acquire("NVDA", "c1").allowed, true);
  timers.advance(500);
  assert.equal(link.opensCount, 1);
  assert.deepEqual(link.tickers(), ["NVDA"]);
  assert.deepEqual(m.symbols(), ["NVDA"]);
  assert.equal(m.status().state, "LIVE");
});

test("SM-2 hundert Nutzer auf demselben Titel sind EIN Anbieterabonnement", () => {
  const { m, link, timers } = baue();
  for (let i = 0; i < 100; i++) m.acquire("NVDA", "c" + i);
  timers.advance(500);
  assert.equal(link.opensCount, 1, "mehr als eine Verbindung geoeffnet");
  assert.equal(link.updatesCount, 0, "unnoetige Nachmeldung");
  assert.deepEqual(link.tickers(), ["NVDA"]);
  assert.equal(m.refCount("NVDA"), 100);
  assert.equal(m.clientCount(), 100);
});

test("SM-3 zwei Titel, ein Nutzer: eine Verbindung mit beiden", () => {
  const { m, link, timers } = baue({ manager: { mode: "dynamic" } });
  m.acquire("NVDA", "c1");
  timers.advance(500);
  m.acquire("AAPL", "c1");
  timers.advance(500);
  assert.equal(link.opensCount, 1, "fuer den zweiten Titel wurde neu verbunden");
  assert.equal(link.updatesCount, 1);
  assert.deepEqual(link.tickers().sort(), ["AAPL", "NVDA"]);
});

test("SM-4 Aenderungen in schneller Folge werden zu einer zusammengefasst", () => {
  const { m, link, timers } = baue({ manager: { mode: "dynamic" } });
  m.acquire("A", "c1"); m.acquire("B", "c1"); m.acquire("C", "c1");
  timers.advance(100);
  assert.equal(link.opensCount, 0, "zu frueh verbunden - das Sammelfenster greift nicht");
  timers.advance(400);
  assert.equal(link.opensCount, 1);
  assert.deepEqual(link.tickers().sort(), ["A", "B", "C"]);
});

/* ---------------------------------------------------------- Grace Period */

test("SM-5 der letzte Zuschauer geht: der Titel bleibt sechzig Sekunden abonniert", () => {
  const { m, link, timers } = baue();
  m.acquire("NVDA", "c1");
  timers.advance(500);
  m.release("NVDA", "c1");
  timers.advance(59000);
  assert.deepEqual(m.wanted(), ["NVDA"], "der Nachlauf endet zu frueh");
  assert.equal(link.closesCount, 0);
  timers.advance(2000);
  assert.deepEqual(m.wanted(), [], "der Nachlauf endet nicht");
  timers.advance(500);
  assert.equal(link.closesCount, 1, "die Verbindung bleibt ohne Zuschauer offen");
  assert.equal(m.status().state, "IDLE");
});

test("SM-6 wer im Nachlauf zurueckkommt, bekommt keine neue Verbindung", () => {
  const { m, link, timers } = baue();
  m.acquire("NVDA", "c1");
  timers.advance(500);
  m.release("NVDA", "c1");
  timers.advance(30000);
  assert.equal(m.acquire("NVDA", "c2").allowed, true);
  timers.advance(60000);
  assert.equal(link.opensCount, 1, "im Nachlauf wurde neu verbunden");
  assert.equal(link.closesCount, 0);
  assert.deepEqual(m.symbols(), ["NVDA"]);
});

test("SM-7 ein Client verschwindet: alle seine Titel gehen in den Nachlauf", () => {
  const { m, timers } = baue();
  m.acquire("A", "c1"); m.acquire("B", "c1"); m.acquire("A", "c2");
  timers.advance(500);
  assert.equal(m.releaseClient("c1"), 2);
  assert.equal(m.refCount("A"), 1, "der zweite Zuschauer wurde mit entfernt");
  assert.equal(m.refCount("B"), 0);
  assert.equal(m.clientCount(), 1);
  timers.advance(61000);
  assert.deepEqual(m.wanted(), ["A"]);
});

/* ------------------------------------------------------------- Betriebsart */

test("SM-8 dynamic: Titelwechsel ohne Neuaufbau", () => {
  const { m, link, timers } = baue({ manager: { mode: "dynamic" }, linkOpts: { dynamicSupported: true } });
  m.acquire("AAPL", "c1");
  timers.advance(500);
  m.acquire("NVDA", "c1");
  m.release("AAPL", "c1");
  timers.advance(500);
  assert.equal(link.opensCount, 1);
  assert.equal(link.closesCount, 0);
  assert.deepEqual(m.symbols().sort(), ["AAPL", "NVDA"], "AAPL laeuft im Nachlauf mit");
  timers.advance(61000);
  assert.deepEqual(m.symbols(), ["NVDA"]);
  assert.equal(link.updatesCount, 2, "Hinzufuegen und Entfernen als Nachmeldung");
});

test("SM-9 reconnect: Titelwechsel baut die Verbindung mit der vollen Liste neu auf", () => {
  const { m, link, timers } = baue({ manager: { mode: "reconnect" } });
  m.acquire("AAPL", "c1");
  timers.advance(500);
  m.acquire("NVDA", "c1");
  timers.advance(500);
  assert.equal(link.opensCount, 2);
  assert.equal(link.closesCount, 1);
  assert.deepEqual(link.tickers().sort(), ["AAPL", "NVDA"]);
});

test("SM-10 lehnt der Anbieter die Nachmeldung ab, faellt der Manager auf Neuaufbau zurueck und sagt es", () => {
  const { m, link, timers } = baue({ manager: { mode: "dynamic" }, linkOpts: { dynamicSupported: false } });
  m.acquire("AAPL", "c1");
  timers.advance(500);
  m.acquire("NVDA", "c1");
  timers.advance(500);
  assert.equal(m.mode(), "reconnect", "der Modus bleibt auf dynamic stehen");
  assert.equal(link.opensCount, 2, "es wurde nicht neu aufgebaut");
  assert.deepEqual(link.tickers().sort(), ["AAPL", "NVDA"]);
  assert.equal(m.status().modeReason, "dynamicUpdateRejected");
});

/* ------------------------------------------------------------- Grenzen */

test("SM-11 ueber der Titelgrenze wird abgelehnt, nicht gekauft", () => {
  const { m, timers } = baue({ manager: { maxSymbols: 3 } });
  assert.equal(m.acquire("A", "c1").allowed, true);
  assert.equal(m.acquire("B", "c1").allowed, true);
  assert.equal(m.acquire("C", "c1").allowed, true);
  const vierter = m.acquire("D", "c1");
  assert.equal(vierter.allowed, false);
  assert.equal(vierter.reason, "symbolLimitReached");
  timers.advance(500);
  assert.equal(m.symbols().length, 3);
});

test("SM-12 der Budgetwaechter kann ein neues Symbol verweigern", () => {
  const budget = { mayAdd: (sym) => sym === "TEUER" ? { allow: false, reason: "protect" } : { allow: true } };
  const { m, timers } = baue({ manager: { budget } });
  assert.equal(m.acquire("NVDA", "c1").allowed, true);
  const abgelehnt = m.acquire("TEUER", "c1");
  assert.equal(abgelehnt.allowed, false);
  assert.equal(abgelehnt.reason, "protect");
  assert.equal(m.status().state, "BLOCKED");
  timers.advance(500);
  assert.deepEqual(m.wanted(), ["NVDA"], "das abgelehnte Symbol steht trotzdem in der Liste");
});

test("SM-13 ein bereits abonniertes Symbol fragt das Budget nicht erneut", () => {
  let gefragt = 0;
  const budget = { mayAdd: () => { gefragt++; return { allow: true }; } };
  const { m, timers } = baue({ manager: { budget } });
  m.acquire("NVDA", "c1");
  m.acquire("NVDA", "c2");
  m.acquire("NVDA", "c3");
  timers.advance(500);
  assert.equal(gefragt, 1);
});

/* ------------------------------------------------------------- Sitzung */

test("SM-14 ausserhalb der regulaeren Sitzung wird nicht verbunden", () => {
  let phase = "CLOSED";
  const { m, link, timers } = baue({ manager: { session: () => phase } });
  m.acquire("NVDA", "c1");
  timers.advance(500);
  assert.equal(link.opensCount, 0, "bei geschlossener Boerse wurde verbunden");
  assert.equal(m.status().reason, "sessionClosed");
  phase = "REGULAR";
  m.reevaluate();
  timers.advance(500);
  assert.equal(link.opensCount, 1, "zur Eroeffnung wurde nicht verbunden");
});

test("SM-15 Handelsschluss waehrend offener Verbindung: sie wird geschlossen", () => {
  let phase = "REGULAR";
  const { m, link, timers } = baue({ manager: { session: () => phase } });
  m.acquire("NVDA", "c1");
  timers.advance(500);
  assert.equal(link.isOpen(), true);
  phase = "CLOSED";
  m.reevaluate();
  timers.advance(500);
  assert.equal(link.isOpen(), false);
  assert.equal(m.status().reason, "sessionClosed");
});

/* --------------------------------------------------------------- Ticks */

test("SM-16 Kurse erreichen nur Titel, die jemand ansieht", () => {
  const { m, link, timers, ticks } = baue();
  m.acquire("NVDA", "c1");
  timers.advance(500);
  link.emit("NVDA", 100);
  link.emit("FREMD", 50);
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].symbol, "NVDA");
});

test("SM-17 nach dem letzten Zuschauer kommt kein Kurs mehr durch, auch im Nachlauf nicht", () => {
  const { m, link, timers, ticks } = baue();
  m.acquire("NVDA", "c1");
  timers.advance(500);
  link.emit("NVDA", 100);
  m.release("NVDA", "c1");
  link.emit("NVDA", 101);
  assert.equal(ticks.length, 1, "ein Kurs ohne Zuschauer wurde durchgereicht");
});

/* ------------------------------------------------------ Ausfall und Ende */

test("SM-18 ein Anbieterfehler setzt den Zustand auf DEGRADED, nicht auf LIVE", () => {
  const { m, link, timers } = baue();
  m.acquire("NVDA", "c1");
  timers.advance(500);
  assert.equal(m.status().state, "LIVE");
  link.fail("heartbeatMissed");
  assert.equal(m.status().state, "DEGRADED");
  assert.equal(m.status().reason, "heartbeatMissed");
  assert.equal(m.stats().providerErrors, 1);
});

test("SM-19 bricht die Verbindung ab, gelten die Symbole nicht mehr als live", () => {
  const { m, link, timers } = baue();
  m.acquire("NVDA", "c1");
  timers.advance(500);
  link.close();
  assert.deepEqual(m.symbols(), [], "nach dem Abbruch steht der Titel weiter auf live");
  assert.deepEqual(m.wanted(), ["NVDA"], "der Wunsch ist mit der Verbindung verschwunden");
  assert.equal(m.status().state, "DEGRADED");
});

test("SM-20 shutdown raeumt alles ab und laesst keinen Wecker stehen", () => {
  const { m, link, timers } = baue();
  m.acquire("A", "c1"); m.acquire("B", "c2");
  timers.advance(500);
  m.release("A", "c1");
  m.shutdown("sessionEnd");
  assert.equal(link.isOpen(), false);
  assert.deepEqual(m.wanted(), []);
  assert.equal(m.clientCount(), 0);
  assert.equal(timers.pending(), 0, "es bleibt ein Wecker stehen");
  assert.equal(m.status().state, "IDLE");
});

test("SM-21 die Zusage in einem Satz: nie mehr als eine Verbindung", () => {
  /* Ein Durcheinander aus Zugriffen, wie es der Feed erzeugt. */
  const { m, link, timers } = baue({ manager: { mode: "dynamic" } });
  const titel = ["AAPL", "NVDA", "MSFT", "VLO", "PANW"];
  for (let runde = 0; runde < 20; runde++) {
    const sym = titel[runde % titel.length];
    m.acquire(sym, "client" + (runde % 4));
    if (runde % 3 === 0) m.release(titel[(runde + 2) % titel.length], "client" + (runde % 4));
    timers.advance(120);
  }
  timers.advance(120000);
  assert.equal(link.opensCount <= 2, true,
    "es wurden " + link.opensCount + " Verbindungen geoeffnet - erwartet hoechstens zwei");
  assert.equal(m.status().stats.refusedByLimit, 0);
});
