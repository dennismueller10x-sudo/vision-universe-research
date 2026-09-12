/* =========================================================================
   VISION UNIVERSE — market-data-contract.test.mjs

   DER GEMEINSAME ZUSTANDSWORTSCHATZ, UND DIE ZWEI UNTERSCHEIDUNGEN,
   DIE ER ERZWINGT.

   Historical, Intraday und Realtime sind eine Infrastruktur fuer alle
   kuenftigen Frontends. Die Tests hier greifen die beiden Stellen an,
   an denen ein Frontend sonst selbst etwas erfinden muesste - und an
   denen erfundene Antworten am teuersten sind:

     MD10  MARKET_CLOSED ist nicht REALTIME_UNAVAILABLE
     MD11  TECHNICAL_INSUFFICIENT_HISTORY ist nicht HISTORICAL_UNAVAILABLE

   Dazu die Regel des Chart-Vertrages, die ich selbst verletzt hatte:
   nur ausgefuehrte Handel duerfen den Preis-Chart bewegen (MD20/MD21).
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => readFileSync(join(root, p), "utf8");

const C = require(join(root, "quant", "engines", "market-data-contract.js"));
const BM = require(join(root, "quant", "engines", "realtime", "bar-merge.js"));

/* ================================================ DER WORTSCHATZ */

test("MD01 — die zehn Zustaende des Vertrages, geschlossen", () => {
  assert.deepEqual(C.STATES.slice().sort(), [
    "HISTORICAL_AVAILABLE", "HISTORICAL_UNAVAILABLE",
    "INTRADAY_AVAILABLE", "INTRADAY_UNAVAILABLE",
    "MARKET_CLOSED", "NOT_ELIGIBLE", "PROVIDER_UNAVAILABLE",
    "REALTIME_AVAILABLE", "REALTIME_UNAVAILABLE", "SYMBOL_NOT_SUPPORTED"
  ]);
  /* Die Technikachse gehoert ausdruecklich NICHT dazu. */
  for (const t of C.TECHNICAL_STATES) {
    assert.ok(!C.STATES.includes(t), t + " darf kein Datenzustand sein");
  }
});

test("MD02 — jeder gelieferte Zustand stammt aus der Liste", () => {
  const faelle = [
    C.resolveHistorical({ barCount: 0 }), C.resolveHistorical({ barCount: 500 }),
    C.resolveHistorical({ known: false }), C.resolveHistorical({ eligible: false }),
    C.resolveHistorical({ storeReachable: false }),
    C.resolveIntraday({ barCount: 0 }), C.resolveIntraday({ barCount: 10 }),
    C.resolveIntraday({ providerReachable: false }),
    C.resolveRealtime({ tradingOpen: true, connection: "CONNECTED" }),
    C.resolveRealtime({ tradingOpen: true, connection: "CLOSED" }),
    C.resolveRealtime({ tradingOpen: false, connection: "CLOSED" }),
    C.resolveRealtime({ tradingOpen: true, connection: "NOT_CONFIGURED" })
  ];
  for (const f of faelle) {
    assert.ok(C.isState(f.state), "kein Vertragszustand: " + f.state);
  }
});

/* ============================ UNTERSCHEIDUNG 1: GESCHLOSSEN ≠ KAPUTT */

test("MD10 — MARKET_CLOSED ist nicht REALTIME_UNAVAILABLE", () => {
  /* Nachts, Verbindung steht: der Markt ist zu, nicht der Weg. */
  const nachts = C.resolveRealtime({ tradingOpen: false, connection: "CONNECTED" });
  assert.equal(nachts.state, "MARKET_CLOSED");

  /* Nachts, Verbindung steht NICHT: immer noch MARKET_CLOSED. Ein
     Relay, das ausserhalb der Handelszeit schweigt, arbeitet richtig. */
  const nachtsOhne = C.resolveRealtime({ tradingOpen: false, connection: "CLOSED" });
  assert.equal(nachtsOhne.state, "MARKET_CLOSED");

  /* Handel laeuft, Verbindung steht nicht: JETZT ist es ein Ausfall. */
  const tagsOhne = C.resolveRealtime({ tradingOpen: true, connection: "CLOSED" });
  assert.equal(tagsOhne.state, "REALTIME_UNAVAILABLE");

  assert.notEqual(nachts.state, tagsOhne.state,
    "derselbe Zustand fuer Normalfall und Ausfall macht die Meldung wertlos");
});

test("MD10b MUTATION — ohne die Handelsfrage faellt die Unterscheidung weg", () => {
  /* Wer tradingOpen nicht mitgibt, bekommt KEIN falsches MARKET_CLOSED
     untergeschoben: unbekannte Lage darf nicht als "Markt zu" gelten. */
  const ohne = C.resolveRealtime({ connection: "CLOSED" });
  assert.equal(ohne.state, "REALTIME_UNAVAILABLE",
    "eine unbekannte Boersenlage darf keinen Ausfall verstecken");
});

/* ====================== UNTERSCHEIDUNG 2: KURZ ≠ NICHT VORHANDEN */

test("MD11 — ein junges Listing hat Historie UND zu wenig fuer die Technik", () => {
  /* MTNE: 57 Handelstage. Beides gleichzeitig wahr. */
  const h = C.resolveHistorical({ barCount: 57 });
  const t = C.technicalHistory(57, 300);
  assert.equal(h.state, "HISTORICAL_AVAILABLE");
  assert.equal(t.state, "TECHNICAL_INSUFFICIENT_HISTORY");
  assert.notEqual(h.state, "HISTORICAL_UNAVAILABLE");
  /* Und der Grund sagt ausdruecklich, dass es keine Aussage ueber die
     Verfuegbarkeit ist - sonst schreibt es die Oberflaeche selbst. */
  assert.match(t.reason, /KEINE Aussage ueber die Verfuegbarkeit/);
});

test("MD12 — HISTORICAL_UNAVAILABLE gilt nur unter der Zeichenschwelle", () => {
  assert.equal(C.resolveHistorical({ barCount: 1 }).state, "HISTORICAL_UNAVAILABLE");
  assert.equal(C.resolveHistorical({ barCount: 2 }).state, "HISTORICAL_AVAILABLE");
  assert.equal(C.resolveHistorical({ barCount: 0 }).state, "HISTORICAL_UNAVAILABLE");
});

test("MD13 — ein unerreichbarer Speicher ist kein fehlender Titel", () => {
  const s = C.resolveHistorical({ storeReachable: false, barCount: 0 });
  assert.equal(s.state, "PROVIDER_UNAVAILABLE");
  assert.notEqual(s.state, "HISTORICAL_UNAVAILABLE");
  assert.match(s.reason, /sagt das nichts/);
});

test("MD14 — Berechtigung und Existenz sind zwei verschiedene Absagen", () => {
  assert.equal(C.resolveHistorical({ known: false }).state, "SYMBOL_NOT_SUPPORTED");
  assert.equal(C.resolveHistorical({ eligible: false }).state, "NOT_ELIGIBLE");
});

test("MD15 — INTRADAY_UNAVAILABLE nennt die Boersenlage als Grund", () => {
  const zu = C.resolveIntraday({ barCount: 0, session: { state: "MARKET_CLOSED" } });
  assert.equal(zu.state, "INTRADAY_UNAVAILABLE");
  assert.equal(zu.marketClosed, true);
  assert.match(zu.reason, /Normalfall/);

  const offen = C.resolveIntraday({ barCount: 0, session: { state: null } });
  assert.equal(offen.state, "INTRADAY_UNAVAILABLE");
  assert.equal(offen.marketClosed, false);
  assert.ok(!/Normalfall/.test(offen.reason),
    "waehrend des Handels ist das Ausbleiben kein Normalfall");
});

/* ============================ DER CHART-VERTRAG: NUR ABSCHLUESSE */

test("MD20 — nur TRADE bewegt den Preis-Chart", () => {
  const quelle = lies("vu2-bridge/experience.js");
  assert.match(quelle, /var istAbschluss = t\.kind === "TRADE";/,
    "die Unterscheidung muss im Tick-Handler stehen");
  assert.match(quelle, /if \(!istAbschluss\) return;/,
    "eine Quote darf den Verlauf nicht erreichen");
  /* Und sie steht VOR der Verschmelzung, nicht danach. */
  const iGuard = quelle.indexOf("if (!istAbschluss) return;");
  const iMerge = quelle.indexOf("applyTick");
  assert.ok(iGuard > 0 && iMerge > iGuard,
    "die Quote-Sperre muss vor dem Einmischen greifen");
});

test("MD21 — ein Abschluss faltet in die LAUFENDE Kerze", () => {
  const jetzt = Date.now();
  const serie = BM.createSeries({ timeframe: "5min", interval: "5min", exchange: "XNYS" });
  const bars = [];
  for (let i = 4; i >= 1; i--) {
    const t = jetzt - i * 5 * 60000;
    bars.push({ timestamp: t, date: new Date(t).toISOString().slice(0, 10),
                open: 10, high: 11, low: 9, close: 10, volume: 100 });
  }
  serie.seed(bars, "INTRADAY");
  const vorher = serie.length();

  const erster = serie.applyTick({ price: 12.5, size: 10, timestamp: jetzt, receivedAt: jetzt });
  assert.equal(erster.action, "appended", "der erste Tick der Periode eroeffnet ihre Kerze");
  const zweiter = serie.applyTick({ price: 12.9, size: 5, timestamp: jetzt + 1000, receivedAt: jetzt + 1000 });
  assert.equal(zweiter.action, "updated", "der zweite faltet hinein, statt eine neue anzulegen");

  assert.equal(serie.length(), vorher + 1, "eine neue Kerze, nicht eine je Tick");
  assert.equal(serie.last().close, 12.9, "der Schluss der aktiven Kerze folgt dem Abschluss");
  assert.equal(serie.last().high, 12.9, "und das Hoch ebenso");
});

test("MD22 — die Bruecke baut die Verschmelzung nicht selbst nach", () => {
  const quelle = lies("vu2-bridge/experience.js");
  assert.match(quelle, /VURealtime.*BarMerge|BarMerge/,
    "die gepruefte Engine muss benutzt werden");
  /* Faellt sie aus, bewegt sich der Chart NICHT - statt einer zweiten,
     schnell hingeschriebenen Faltung. */
  assert.match(quelle, /if \(!serie\) return;/);
  assert.ok(!/daten\.intraday\.concat\(\[\{/.test(quelle),
    "die alte Hand-Faltung darf nicht zurueckkommen");
});

/* ========================================== SICHERHEIT UND UMFANG */

test("MD30 — kein thresholdLevel in der Anmeldung", () => {
  const quelle = lies("api/realtime.js");
  const anmeldung = quelle.slice(quelle.indexOf('eventName: "subscribe"'),
                                 quelle.indexOf('eventName: "subscribe"') + 400);
  assert.ok(!/thresholdLevel/.test(anmeldung),
    "eine Stufe, die der Tarif nicht kennt, laesst die Anmeldung abweisen");
});

test("MD31 — Realtime und Intraday teilen denselben Umfang", () => {
  for (const datei of ["api/intraday.js", "api/realtime.js"]) {
    const quelle = lies(datei);
    assert.match(quelle, /product-tickers\.json/,
      datei + " muss das Produktuniversum lesen");
    assert.match(quelle, /erlaubt/,
      datei + " braucht die engere Freigabe als Rueckfall");
  }
});

test("MD32 — kein Zugangsmittel in browserseitigem Code", () => {
  const browser = ["vu2-bridge/bridge.js", "vu2-bridge/experience.js",
                   "quant/engines/market-data-contract.js",
                   "quant/engines/realtime/bar-merge.js"];
  for (const datei of browser) {
    const text = lies(datei);
    for (const muster of [/TIINGO_API_KEY/, /VU_HISTORY_S3_SECRET/, /AKIA[0-9A-Z]{10,}/]) {
      assert.ok(!muster.test(text), datei + " enthaelt " + muster);
    }
  }
});

test("MD33 — die Serverfunktionen liefern einen Vertragszustand mit", () => {
  for (const datei of ["api/history.js", "api/intraday.js", "api/realtime.js"]) {
    const quelle = lies(datei);
    assert.match(quelle, /contractState/,
      datei + " muss den gemeinsamen Zustand mitliefern");
    assert.match(quelle, /market-data-contract/,
      datei + " muss ihn aus der Engine nehmen, nicht selbst tippen");
  }
});
