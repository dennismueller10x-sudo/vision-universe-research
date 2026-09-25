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

test("the surface sentence names both dates and holds back at zero", () => {
  const source = readFileSync(join(root, "vu2/experience.js"), "utf8");
  const von = source.indexOf("function analysisLagLine(");
  const bis = source.indexOf("function technicalReasonText(", von);
  assert.ok(von > 0 && bis > von, "die Abstandszeile steht nicht mehr in experience.js");
  const block = source.slice(von, bis);
  assert.match(block, /lag\.analysisAsOf/);
  assert.match(block, /lag\.priceAsOf/);
  /* Kein Abstand, keine Zeile - und ein Handelstag im Singular. */
  assert.match(block, /lag\.lagSessions<1\)return null/);
  assert.match(block, /einen Handelstag/);
  /* Und die Seite behauptet nicht, der Kursverlauf sei genauso alt. */
  assert.match(block, /Kursverlauf darüber ist aktuell/);
});

test("the freshness engine is actually loaded by the page that needs it", () => {
  /* Die Zeile faellt sonst still weg: ohne das Skript ist Freshness
     undefined, analysisLag gibt null zurueck, und der Abstand
     verschwindet - genau der Zustand, der behoben werden sollte. */
  const html = readFileSync(join(root, "vu2/index.html"), "utf8");
  assert.match(html, /realtime\/trading-session\.js/);
  assert.match(html, /realtime\/freshness\.js/);
  const service = readFileSync(join(root, "quant/api/product-services.js"), "utf8");
  assert.match(service, /g\.VURealtime&&g\.VURealtime\.Freshness/);
});
