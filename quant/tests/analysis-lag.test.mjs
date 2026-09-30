/* =========================================================================
   ZWEI STAENDE NEBENEINANDER SIND ZWEI STAENDE.

   Gemessen am 25.09.2026: die Kursstruktur der Produktartefakte endete am
   2026-09-10, der veroeffentlichte Kursstand am 2026-09-24 - zehn
   Handelstage, bei 5.646 von 5.676 Titeln dieselben zehn. Ursache war ein
   fehlender `--push` in die dauerhafte Ablage, nicht die Analyse. Die Seite
   zeigte beides untereinander, jedes fuer sich richtig, und nichts sagte,
   dass sie nicht denselben Tag beschreiben.

   Diese Datei prueft nicht die Zahl zehn - die verschwindet, sobald die
   Ablage nachgezogen ist. Sie prueft den VERTRAG, der in beiden Welten
   gelten muss:

     liegt die Auswertung zurueck, sagt der Dienst es mit Zahl und beiden
     Daten - liegt sie nicht zurueck, erfindet er keinen Abstand.

   Frontend-Rebuild (quant/app): Prüfintention erhalten – die Abstandszeile
   wohnte in vu2/experience.js (analysisLagLine, geloescht). Der Satz steht
   jetzt in quant/app/view-model.js (analysisLagText) und wird dort per
   require() AUSGEFUEHRT statt als Quelltextausschnitt gelesen; die Seite
   (quant/app/page-stock.js) muss ihn aus t.lag setzen, und die kanonische
   Seite quant/index.html muss die Frische-Engine laden.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url).pathname;
const Service = require(join(root, "quant/api/product-services.js"));
const Policy = require(join(root, "quant/engines/display-policy.js"));
const Query = require(join(root, "quant/engines/query.js"));
const Freshness = require(join(root, "quant/engines/realtime/freshness.js"));
const calendar = require(join(root, "quant/config/market-calendar.json"));

const api = Service.create({
  loadJSON: async (path) => JSON.parse(readFileSync(join(root, path.slice(1)), "utf8")),
  loadCompressedJSON: async (path) => JSON.parse(gunzipSync(readFileSync(join(root, path.slice(1))))),
  displayPolicy: Policy, queryEngine: Query
});

test("the service names the lag with both dates, or none at all", async () => {
  const technical = await api.getTechnicalIntelligence("NVDA");
  if (technical.state !== "AVAILABLE" || !technical.fullWorkspace) return;
  const serie = JSON.parse(readFileSync(join(root, "quant/data/market/discover-series/ref_NVDA.json"), "utf8"));
  const erwartet = Freshness.lagSessions(technical.asOf, serie.asOf, calendar);

  if (erwartet > 0) {
    assert.ok(technical.lag, "die Auswertung liegt " + erwartet + " Sitzungen zurueck, der Dienst sagt nichts");
    assert.equal(technical.lag.lagSessions, erwartet);
    assert.equal(technical.lag.analysisAsOf, technical.asOf);
    assert.equal(technical.lag.priceAsOf, serie.asOf);
    /* Der Sitzungsbegriff ist der der Kursfrische und keine zweite
       Zaehlweise daneben. */
    assert.equal(technical.lag.contract, "freshness-contract-1.0.0");
  } else {
    assert.equal(technical.lag, null, "ohne Rueckstand darf kein Abstand behauptet werden");
  }
});

test("the lag counts trading sessions, not calendar days", () => {
  /* 2026-09-10 bis 2026-09-24 sind 14 Kalendertage und 10 Handelstage. Wer
     Kalendertage zaehlt und "Handelstage" darunter schreibt, sagt eine
     falsche Zahl in einem richtigen Satz. */
  assert.equal(Freshness.lagSessions("2026-09-10", "2026-09-24", calendar), 10);
  assert.equal(Freshness.lagSessions("2026-09-24", "2026-09-24", calendar), 0);
  assert.equal(Freshness.lagSessions("2026-09-25", "2026-09-24", calendar), 0);
});

/* Die Zeile selbst, ausgefuehrt und nicht nur gelesen - jetzt aus dem View
   Model der neuen Oberflaeche. Die alte Fassung baute ein <p class=
   "analysis-lag">; die neue liefert den Satz, und die Seite setzt ihn in die
   Zeile unter der Kursstruktur. Geprueft wird deshalb (a) der Satz als
   Verhalten und (b) dass die Seite genau diesen Satz aus t.lag setzt. */
const VM = require(join(root, "quant/app/view-model.js"));

test("the line is withheld without a lag and speaks in the singular at one session", () => {
  const analysisLagLine = VM.analysisLagText;
  assert.equal(typeof analysisLagLine, "function", "view-model.js exportiert analysisLagText nicht");
  assert.equal(analysisLagLine(null), null);
  assert.equal(analysisLagLine({ lagSessions: 0, analysisAsOf: "2026-09-24", priceAsOf: "2026-09-24" }), null);
  assert.equal(analysisLagLine({ lagSessions: null, analysisAsOf: "2026-09-10", priceAsOf: "2026-09-24" }), null);
  const eine = analysisLagLine({ lagSessions: 1, analysisAsOf: "2026-09-23", priceAsOf: "2026-09-24" });
  assert.equal(typeof eine, "string");
  assert.match(eine, /einen Handelstag/);
  assert.equal(/1 Handelstage/.test(eine), false, "eine Sitzung darf nicht im Plural stehen");
  const zehn = analysisLagLine({ lagSessions: 10, analysisAsOf: "2026-09-10", priceAsOf: "2026-09-24" });
  assert.match(zehn, /10 Handelstage/);
  assert.match(zehn, /2026-09-10/);
  assert.match(zehn, /2026-09-24/);
});

test("the surface sentence names both dates and holds back at zero", () => {
  /* Vorher als Quelltextmuster geprueft (lag.analysisAsOf, lag.priceAsOf,
     lagSessions<1 -> null). Jetzt dieselben Zusagen als Verhalten: */
  const satz = VM.analysisLagText({ lagSessions: 3, analysisAsOf: "2026-09-21", priceAsOf: "2026-09-24" });
  /* beide Staende im Satz, */
  assert.match(satz, /2026-09-21/);
  assert.match(satz, /2026-09-24/);
  /* kein Abstand, keine Zeile - auch nicht bei einem negativen Wert, */
  assert.equal(VM.analysisLagText({ lagSessions: 0, analysisAsOf: "2026-09-24", priceAsOf: "2026-09-24" }), null);
  assert.equal(VM.analysisLagText({ lagSessions: -1, analysisAsOf: "2026-09-25", priceAsOf: "2026-09-24" }), null);
  /* ein Handelstag im Singular, */
  assert.match(VM.analysisLagText({ lagSessions: 1, analysisAsOf: "2026-09-23", priceAsOf: "2026-09-24" }), /einen Handelstag/);
  /* und die Seite behauptet nicht, der Kursverlauf sei genauso alt. */
  assert.match(satz, /Kursverlauf (darüber )?ist aktuell/);
  /* Die Seite setzt genau diesen Satz aus dem Abstand des Dienstes - sonst
     gaebe es den Satz, aber keinen Leser. */
  const seite = readFileSync(join(root, "quant/app/page-stock.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(seite, /VM\.analysisLagText\(t\.lag\)/, "die Aktienseite setzt die Abstandszeile nicht mehr");
});

test("the freshness engine is actually loaded by the page that needs it", () => {
  /* Die Zeile faellt sonst still weg: ohne das Skript ist Freshness
     undefined, analysisLag gibt null zurueck, und der Abstand
     verschwindet - genau der Zustand, der behoben werden sollte.
     Kanonische Seite ist seit dem Frontend-Umbau quant/index.html;
     vu2/index.html ist nur noch ein Umleitungsstummel. */
  const html = readFileSync(join(root, "quant/index.html"), "utf8");
  assert.match(html, /realtime\/trading-session\.js/);
  assert.match(html, /realtime\/freshness\.js/);
  /* Und die Frische-Engine steht VOR den Product Services, die sie beim
     Anlegen des Dienstes nachschlagen. */
  assert.ok(html.indexOf("realtime/freshness.js") < html.indexOf("api/product-services.js"),
    "freshness.js wird erst nach product-services.js geladen");
  const service = readFileSync(join(root, "quant/api/product-services.js"), "utf8");
  assert.match(service, /g\.VURealtime&&g\.VURealtime\.Freshness/);
});
