import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MarketFactors = require("../engines/market-factors.js");
const Language = require("../engines/product-language.js");
Language.load(JSON.parse(readFileSync("quant/methodology/product-language-v1.json", "utf8")));

const SERIE = "quant/data/market/golden-preview/daily/ref_MSFT.json";
const payload = JSON.parse(readFileSync(SERIE, "utf8"));
const dates = payload.bars.map((b) => b.date);
const closes = payload.bars.map((b) => b.adjustedClose);
const rechne = (zurueck) => MarketFactors.computeFactors(payload, {
  module: "quantV2Momentum",
  benchmark: zurueck === null ? null
    : { closes: zurueck ? closes.slice(0, -zurueck) : closes,
        dates: zurueck ? dates.slice(0, -zurueck) : dates }
});

test("ein gleich aktueller Vergleich wird gerechnet", () => {
  const f = rechne(0);
  assert.equal(f.benchmarkLagSessions, 0);
  assert.equal(f.benchmarkStale, false);
  assert.equal(f.fieldStatus.relativeStrength12M1M, MarketFactors.STATUS.CALCULATED);
  assert.ok(Number.isFinite(f.values.relativeStrength12M1M));
});

test("eine Sitzung Rueckstand ist noch kein Grund, nichts zu zeigen", () => {
  /* Ein Titel kann an einem Tag handeln, an dem der Index es nicht tut.
     Die Grenze steht als benannte Konstante, damit eine Lockerung im
     Diff sichtbar wird. */
  assert.equal(MarketFactors.MAX_BENCHMARK_LAG_SESSIONS, 1);
  const f = rechne(1);
  assert.equal(f.benchmarkLagSessions, 1);
  assert.equal(f.benchmarkStale, false);
  assert.equal(f.fieldStatus.relativeStrength12M1M, MarketFactors.STATUS.CALCULATED);
});

test("der reale SPY-Fall liefert keine Zahl mehr, sondern einen Grund", () => {
  /* SPY endete am 2026-09-17, die Titel liefen bis zum 23. - vier
     Sitzungen. Vorher wurden sechs Tage Marktbewegung als Vorsprung
     jedes einzelnen Titels ausgewiesen. */
  const f = rechne(4);
  assert.equal(f.benchmarkLagSessions, 4);
  assert.equal(f.benchmarkStale, true);
  assert.equal(f.values.relativeStrength12M1M, null);
  assert.equal(f.fieldStatus.relativeStrength12M1M, "BENCHMARK_STALE");
  for (const h of Object.keys(MarketFactors.HORIZONS)) {
    assert.equal(f.values.relativeStrength[h], null, h);
    assert.equal(f.fieldStatus.relativeStrength[h], "BENCHMARK_STALE", h);
  }
});

test("die Verweigerung kostet nur die relative Staerke, nicht den Rest", () => {
  /* Ein veralteter Vergleichsindex sagt nichts ueber die Kursentwicklung
     des Titels selbst. Wuerde er die ganze Zeile entwerten, waere das
     Gate teurer als der Fehler, den es verhindert. */
  const f = rechne(4);
  assert.equal(f.status, "OK");
  assert.ok(Number.isFinite(f.values.return12M1M));
  assert.ok(Number.isFinite(f.values.returns["6M"]));
  assert.ok(Number.isFinite(f.values.distanceToSMA200));
});

test("ohne Vergleichsreihe bleibt es beim alten Grund", () => {
  /* Kein Benchmark und ein veralteter Benchmark sind zwei verschiedene
     Lagen. Sie duerfen nicht denselben Grund tragen. */
  const f = rechne(null);
  assert.equal(f.fieldStatus.relativeStrength12M1M, MarketFactors.STATUS.SOURCE_MISSING);
  assert.equal(f.benchmarkStale, false);
  assert.equal(f.benchmarkLagSessions, null);
});

test("BENCHMARK_STALE hat einen Nutzertext und nennt keine Fachbegriffe", () => {
  assert.ok(Language.has("BENCHMARK_STALE"));
  assert.notEqual(Language.label("BENCHMARK_STALE"), "BENCHMARK_STALE");
  assert.equal(Language.violatesPrimaryCopy(Language.beginner("BENCHMARK_STALE")), null);
  assert.equal(Language.violatesPrimaryCopy(Language.label("BENCHMARK_STALE")), null);
});

test("der Faktorbau weist die Frische der Vergleichsreihe aus", () => {
  /* Der Zustand muss im Artefakt stehen, nicht nur im Log: sonst merkt
     niemand, dass eine ganze Spalte fehlt. */
  const build = readFileSync("scripts/market/build-market-factors.mjs", "utf8");
  assert.match(build, /securitiesWithoutRelativeStrength/);
  assert.match(build, /lagBehindNewestSessions/);
  assert.match(build, /state: benchmarkFreshness\.staleSecurities > 0 \? "STALE" : "CURRENT"/);

  const artefakt = "quant/data/market/factors/factors-FULL_UNIVERSE.json";
  if (!existsSync(artefakt)) return;
  const f = JSON.parse(readFileSync(artefakt, "utf8"));
  /* Ein Artefakt aus der Zeit vor diesem Gate traegt die Felder nicht -
     das ist in Ordnung, solange es nicht behauptet, aktuell zu sein. */
  if (f.benchmark && "state" in f.benchmark) {
    assert.ok(["CURRENT", "STALE"].includes(f.benchmark.state));
    if (f.benchmark.state === "STALE") {
      assert.ok(f.benchmark.securitiesWithoutRelativeStrength > 0,
        "STALE ohne einen einzigen betroffenen Titel waere keine Aussage");
    }
  }
});
