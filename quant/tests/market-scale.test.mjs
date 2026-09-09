/* =========================================================================
   VISION UNIVERSE — market-scale.test.mjs   (Tiingo Commercial, §33)

   Die Engines der Skalierungsphase: Instrumentenklassifikation,
   Marktfaktoren, Qualitaetsurteil und Echtzeit-Stufenmodell.

   Der Schwerpunkt liegt bewusst auf den Faellen, in denen ein Ergebnis
   NICHT entstehen darf. Ein Faktor, der bei zu kurzer Historie eine Zahl
   liefert, faellt nirgends auf - und verfaelscht jeden Screener, der ihn
   benutzt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const Classification = require(join(engines, "instrument-classification.js"));
const MarketFactors = require(join(engines, "market-factors.js"));
const MarketQuality = require(join(engines, "market-quality.js"));
const Tiers = require(join(engines, "realtime", "subscription-tiers.js"));
const Features = require(join(engines, "technical", "feature-store.js"));
const Momentum = require(join(engines, "technical", "momentum-engine.js"));

const TODAY = "2026-09-09";

/** Handelstage rueckwaerts ab `endDate`, damit die Reihe nicht veraltet. */
function tradingDates(count, endDate) {
  const dates = [];
  const cursor = new Date(Date.parse(endDate + "T00:00:00Z"));
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (dates.length < count) {
    dates.unshift(cursor.toISOString().slice(0, 10));
    do { cursor.setUTCDate(cursor.getUTCDate() - 1); }
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  }
  return dates;
}

function series(count, opts = {}) {
  const dates = tradingDates(count, opts.endDate || TODAY);
  const bars = dates.map((date, i) => {
    const price = opts.prices ? opts.prices[i] : 100 * Math.exp(i * 0.0006 + Math.sin(i / 17) * 0.02);
    return {
      date, open: price * 0.998, high: price * 1.004, low: price * 0.996, close: price,
      volume: opts.volumes ? opts.volumes[i] : 1000000,
      adjustedOpen: price * 0.998, adjustedHigh: price * 1.004,
      adjustedLow: price * 0.996, adjustedClose: price,
      splitFactor: 1, dividend: 0, dataSourceId: "ds_tiingo"
    };
  });
  return { ticker: opts.ticker || "TST", provider: "tiingo",
           adjustmentStatus: "splitAdjusted", bars };
}

/* ------------------------------------------------- Klassifikation */

test("MS1 — die Klassifikation belegt COMMON_STOCK und raet nie darauf", () => {
  const rows = [
    { ticker: "AAPL", assetType: "Stock", exchange: "NASDAQ", currency: "USD", endDate: "2026-09-08" },
    { ticker: "BRK-B", assetType: "Stock", exchange: "NYSE", endDate: "2026-09-08" },
    { ticker: "BAC-PB", assetType: "Stock", exchange: "NYSE", endDate: "2026-09-08" },
    { ticker: "XYZ-WT", assetType: "Stock", exchange: "NASDAQ", endDate: "2026-09-08" },
    { ticker: "ABC-U", assetType: "Stock", exchange: "NASDAQ", endDate: "2026-09-08" },
    { ticker: "SPY", assetType: "ETF", exchange: "NYSE ARCA", endDate: "2026-09-08" },
    { ticker: "VFINX", assetType: "Mutual Fund", exchange: "NASDAQ", endDate: "2026-09-08" },
    { ticker: "MYST", assetType: "", exchange: "PINK", endDate: "2026-09-08" }
  ];
  const byTicker = {};
  Classification.classifyAll(rows, { today: TODAY }).classifications
    .forEach((c) => { byTicker[c.ticker] = c; });

  assert.equal(byTicker.AAPL.instrumentType, "COMMON_STOCK");
  /* Ein Klassenbuchstabe ist keine eigene Gattung: BRK-B ist eine
     Stammaktie und muss im Screener auftauchen. */
  assert.equal(byTicker["BRK-B"].instrumentType, "COMMON_STOCK");
  assert.equal(byTicker["BRK-B"].shareClass, "B");
  assert.equal(byTicker["BRK-B"].screenerEligible, true);

  assert.equal(byTicker["BAC-PB"].instrumentType, "PREFERRED");
  assert.equal(byTicker["XYZ-WT"].instrumentType, "WARRANT");
  assert.equal(byTicker["ABC-U"].subtype, "UNIT");
  assert.equal(byTicker.SPY.instrumentType, "ETF");
  assert.equal(byTicker.VFINX.instrumentType, "FUND");

  /* Der Kern von §7: UNKNOWN ist ein Ergebnis und keine Aktie. */
  assert.equal(byTicker.MYST.instrumentType, "UNKNOWN");
  assert.equal(byTicker.MYST.screenerEligible, false);

  for (const t of ["BAC-PB", "XYZ-WT", "ABC-U", "SPY", "VFINX", "MYST"]) {
    assert.equal(byTicker[t].screenerEligible, false,
                 `${t} darf nicht im Aktien-Screener landen`);
  }
});

test("MS2 — ein beendetes Listing ist nicht screenerfaehig, und der Grund steht dabei", () => {
  const gone = Classification.classify(
    { ticker: "GONE", assetType: "Stock", exchange: "NASDAQ", endDate: "2019-04-01" },
    { today: TODAY });
  assert.equal(gone.instrumentType, "COMMON_STOCK");
  assert.equal(gone.active, false);
  assert.equal(gone.screenerEligible, false);
  assert.match(gone.activeBasis, /endDate:2019-04-01/);

  /* Kein endDate heisst NICHT inaktiv - Tiingo fuehrt laufende Titel
     oft ohne. Die Luecke muss als Luecke dastehen. */
  const unknown = Classification.classify(
    { ticker: "LIVE", assetType: "Stock", exchange: "NYSE" }, { today: TODAY });
  assert.equal(unknown.active, null);
  assert.equal(unknown.screenerEligible, true);
  assert.match(unknown.screenerReason, /nicht aus Anbieterdaten belegbar/);
});

test("MS3 — ohne Firmennamen wird ADR nicht geraten, sondern als ungeprueft gemeldet", () => {
  const ohneName = Classification.classify(
    { ticker: "BABA", assetType: "Stock", exchange: "NYSE", endDate: "2026-09-08" },
    { today: TODAY });
  assert.equal(ohneName.instrumentType, "COMMON_STOCK");
  assert.equal(ohneName.adrEvidence, "unavailable",
               "ohne Namen darf keine ADR-Aussage entstehen");

  const mitName = Classification.classify(
    { ticker: "BABA", assetType: "Stock", exchange: "NYSE", endDate: "2026-09-08",
      name: "Alibaba Group Holding Ltd American Depositary Shares" }, { today: TODAY });
  assert.equal(mitName.instrumentType, "ADR");
  assert.equal(mitName.adrEvidence, "name");
  /* ADR ist eine Aktie: sie gehoert in den Screener, nur getrennt gefuehrt. */
  assert.equal(mitName.screenerEligible, true);
});

/* ---------------------------------------------------- Marktfaktoren */

test("MS4 — SMA20/50/100/200 samt Zustand und Abstand, alle vier", () => {
  const f = MarketFactors.computeFactors(series(600));
  for (const p of [20, 50, 100, 200]) {
    assert.equal(f.fieldStatus["sma" + p], "CALCULATED", `SMA${p} fehlt`);
    assert.equal(typeof f.values["priceAboveSMA" + p], "boolean");
    assert.equal(typeof f.values["distanceToSMA" + p], "number");
  }
  /* Der Abstand muss zum Zustand passen - sonst zeigt der Screener
     "ueber SMA200" und daneben einen negativen Abstand. */
  for (const p of [20, 50, 100, 200]) {
    const above = f.values["priceAboveSMA" + p];
    const dist = f.values["distanceToSMA" + p];
    assert.equal(above, dist > 0, `Zustand und Abstand widersprechen sich bei SMA${p}`);
  }
});

test("MS5 — zu kurze Historie liefert INSUFFICIENT_HISTORY, niemals eine Null", () => {
  const f = MarketFactors.computeFactors(series(120));
  assert.equal(f.values.sma200, null);
  assert.equal(f.fieldStatus.sma200, "INSUFFICIENT_HISTORY");
  assert.equal(f.values.priceAboveSMA200, null);
  assert.equal(f.values.aboveAllSMA, null,
               "fehlende Werte duerfen nicht als Zustimmung durchgehen");
  assert.equal(f.values.returns["12M"], null);
  assert.equal(f.fieldStatus.returns["12M"], "INSUFFICIENT_HISTORY");
  assert.equal(f.values.high52w, null);
  assert.equal(f.fieldStatus.high52w, "INSUFFICIENT_HISTORY");

  /* Was rechenbar ist, wird gerechnet - eine kurze Reihe ist nicht wertlos. */
  assert.equal(f.fieldStatus.sma20, "CALCULATED");
  assert.equal(f.fieldStatus.returns["1M"], "CALCULATED");
});

test("MS6 — 52-Wochen-Hoch, neuer Hoechststand und die 5-Prozent-Frage", () => {
  /* Eine Reihe, die genau am letzten Tag ihr Jahreshoch macht. */
  const n = 400;
  const prices = new Array(n).fill(0).map((_, i) => 100 + i * 0.1);
  const f = MarketFactors.computeFactors(series(n, { prices }));
  assert.equal(f.values.newHigh52w, true);
  assert.equal(f.values.within5PctOf52wHigh, true);
  assert.ok(Math.abs(f.values.distanceTo52wHigh) < 0.01);

  /* Eine Reihe, die 20 % unter ihrem Hoch steht. */
  const fallend = prices.slice();
  for (let i = n - 30; i < n; i++) fallend[i] = fallend[n - 31] * 0.8;
  const g = MarketFactors.computeFactors(series(n, { prices: fallend }));
  assert.equal(g.values.newHigh52w, false);
  assert.equal(g.values.within5PctOf52wHigh, false);
  assert.ok(g.values.distanceTo52wHigh < -0.15);
});

test("MS7 — die Momentumhorizonte stimmen mit der bestehenden Engine ueberein", () => {
  /* §16: keine neue Methodik erfinden. Die Horizonte muessen dieselben
     sein wie in momentum-engine.js / feature-store.js - sonst meldet der
     Screener ein anderes 3-Monats-Momentum als die Einzelansicht. */
  assert.deepEqual(Object.keys(MarketFactors.HORIZONS).sort(),
                   Object.keys(Momentum.DEFAULTS.horizonWeights).sort());
  assert.deepEqual(MarketFactors.HORIZONS, Features.DEFAULTS.momentumHorizons);
  assert.equal(MarketFactors.YEAR_WINDOW, Features.DEFAULTS.yearWindow);
});

test("MS8 — Renditen werden gegen den Kurs vor N Handelstagen gerechnet", () => {
  const n = 400;
  const prices = new Array(n).fill(100);
  /* Genau 21 Handelstage vor dem Ende auf 50 setzen: die 1M-Rendite
     muss dann exakt +100 % sein. */
  prices[n - 1 - 21] = 50;
  const f = MarketFactors.computeFactors(series(n, { prices }));
  assert.equal(f.values.returns["1M"], 1);
});

test("MS9 — ohne Benchmark bleibt die relative Staerke leer, mit Grund", () => {
  const ohne = MarketFactors.computeFactors(series(400));
  assert.equal(ohne.values.relativeStrength["12M"], null);
  assert.equal(ohne.fieldStatus.relativeStrength["12M"], "SOURCE_MISSING",
               "'kein Benchmark' ist etwas anderes als 'zu kurze Historie'");

  const bench = { closes: new Array(400).fill(0).map((_, i) => 100 * Math.exp(i * 0.0003)) };
  const mit = MarketFactors.computeFactors(series(400), { benchmark: bench });
  assert.equal(mit.fieldStatus.relativeStrength["12M"], "CALCULATED");
  assert.equal(typeof mit.values.relativeStrength["12M"], "number");
});

test("MS10 — stripPriceLevels entfernt Kursniveaus und behaelt Abstaende", () => {
  const f = MarketFactors.computeFactors(series(400));
  const s = MarketFactors.stripPriceLevels(f);
  for (const k of MarketFactors.PRICE_LEVEL_FIELDS) {
    assert.ok(!(k in s.values), `${k} ist ein Kursniveau und darf nicht ausgeliefert werden`);
    assert.equal(s.fieldStatus[k], "WITHHELD_REDISTRIBUTION");
  }
  assert.ok(!("price" in s));
  /* Was bleiben MUSS - sonst waere der Screener leer. */
  assert.equal(typeof s.values.distanceToSMA200, "number");
  assert.equal(typeof s.values.priceAboveSMA200, "boolean");
  assert.equal(typeof s.values.distanceTo52wHigh, "number");
  assert.equal(typeof s.values.returns["12M"], "number");
  assert.equal(s.priceLevelsWithheld, true);
});

test("MS11 — auf einer unbereinigten Reihe mit Split wird nicht die rohe Spalte gerechnet", () => {
  const n = 400;
  const payload = series(n);
  /* Split in der Mitte: die rohe Spalte springt, die bereinigte nicht. */
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    payload.bars[i].open *= 2; payload.bars[i].high *= 2;
    payload.bars[i].low *= 2; payload.bars[i].close *= 2;
  }
  payload.bars[half].splitFactor = 2;

  assert.equal(MarketFactors.priceBasis(payload.bars, "splitAdjusted"), "adjustedClose");
  const f = MarketFactors.computeFactors(payload);
  assert.equal(f.basis, "adjustedClose");
  /* Auf der rohen Spalte waere die 12-Monats-Rendite durch den Split
     etwa halbiert - ein Kursverlust, den es nie gab. */
  assert.ok(f.values.returns["12M"] > -0.3,
            "der Split darf nicht als Kurssturz in die Rendite laufen");

  /* Ohne belastbare bereinigte Spalte faellt die Rechnung auf die rohe
     zurueck - und sagt das. */
  const ohne = payload.bars.map((b) => Object.assign({}, b, { adjustedClose: null }));
  assert.equal(MarketFactors.priceBasis(ohne, "unadjusted"), "close");
});

/* ------------------------------------------------ Qualitaetsurteil */

test("MS12 — das Qualitaetsurteil trennt UNAVAILABLE von FAIL", () => {
  const leer = MarketQuality.assessSeries({ bars: [] }, { today: TODAY });
  assert.equal(leer.status, "UNAVAILABLE");
  assert.equal(leer.statusReason, "emptySeries");

  const fehlt = MarketQuality.assessSeries(null, { today: TODAY });
  assert.equal(fehlt.status, "UNAVAILABLE");
  assert.equal(fehlt.statusReason, "noSeries");

  const sauber = MarketQuality.assessSeries(series(400), { today: TODAY });
  assert.ok(["PASS", "WARNING"].includes(sauber.status), `unerwartet ${sauber.status}`);
  assert.equal(sauber.metrics.factorReady, true);
});

test("MS13 — eine veraltete letzte Bar ist ein FAIL und kein stiller Erfolg", () => {
  const alt = series(400, { endDate: "2026-06-01" });
  const r = MarketQuality.assessSeries(alt, { today: TODAY });
  assert.equal(r.status, "FAIL");
  assert.equal(r.statusReason, "stale_last_bar");
  assert.ok(r.metrics.staleTradingDays > 5);
});

test("MS14 — fehlende Provenienz und zu kurze Historie werden getrennt gemeldet", () => {
  const ohneQuelle = series(400);
  delete ohneQuelle.provider;
  ohneQuelle.bars.forEach((b) => { delete b.dataSourceId; });
  const r = MarketQuality.assessSeries(ohneQuelle, { today: TODAY });
  assert.ok(r.findings.some((f) => f.code === "missing_provenance"));
  assert.equal(r.status, "FAIL");

  const kurz = MarketQuality.assessSeries(series(120), { today: TODAY });
  assert.ok(kurz.findings.some((f) => f.code === "insufficient_history_for_factors"));
  assert.equal(kurz.metrics.factorReady, false);
  /* Zu kurz ist kein Fehler der Daten: die Reihe bleibt verwendbar. */
  assert.equal(kurz.status, "WARNING");
});

test("MS15 — unplausible Kapitalmassnahmen werden gefunden", () => {
  const p = series(400);
  p.bars[200].splitFactor = 100000;
  const r = MarketQuality.assessSeries(p, { today: TODAY });
  assert.ok(r.findings.some((f) => f.code === "implausible_split"));
  assert.equal(r.status, "FAIL");
  assert.equal(r.metrics.implausibleSplits, 1);

  const d = series(400);
  d.bars[100].dividend = -0.5;
  const rd = MarketQuality.assessSeries(d, { today: TODAY });
  assert.ok(rd.findings.some((f) => f.code === "negative_dividend"));
});

test("MS16 — assessBatch zaehlt aus, ohne einen Fall zu verlieren", () => {
  const batch = {
    a: series(400), b: series(120), c: { bars: [] },
    d: series(400, { endDate: "2025-01-02" })
  };
  const r = MarketQuality.assessBatch(batch, { today: TODAY });
  assert.equal(r.summary.total, 4);
  assert.equal(r.summary.PASS + r.summary.WARNING + r.summary.FAIL + r.summary.UNAVAILABLE, 4);
  assert.equal(r.summary.UNAVAILABLE, 1);
  assert.equal(r.results.d.status, "FAIL");
});

/* ------------------------------------------------- Echtzeitstufen */

test("MS17 — HOT/WARM/COLD: die hoehere Stufe gewinnt, und COLD ist der Rest", () => {
  const now = Date.parse("2026-09-09T14:00:00Z");
  const universe = new Array(500).fill(0).map((_, i) => "SYM" + i);
  const plan = Tiers.assign({
    open: ["NVDA", "AAPL"],
    watchlists: ["NVDA", "XOM"],
    views: { TSLA: 9, GE: 1 },
    universe
  }, null, { now });

  assert.deepEqual(plan.tiers.HOT, ["AAPL", "NVDA"]);
  assert.ok(plan.tiers.WARM.includes("XOM"));
  assert.ok(plan.tiers.WARM.includes("TSLA"));
  assert.ok(!plan.tiers.WARM.includes("NVDA"),
            "ein geoeffneter Titel ist HOT, auch wenn er auf einer Watchlist steht");
  assert.ok(plan.tiers.COLD.includes("GE"), "selten aufgerufen bleibt COLD");
  assert.equal(plan.counts.total, plan.tiers.HOT.length + plan.tiers.WARM.length + plan.tiers.COLD.length);
  assert.equal(plan.browserConnectsDirectly, false);
});

test("MS18 — ohne gemessene Abo-Grenze laeuft die Zuteilung gegen ein kleines Budget", () => {
  const now = Date.now();
  const open = new Array(80).fill(0).map((_, i) => "OPEN" + i);
  const plan = Tiers.assign({ open, universe: [] }, null, { now });

  assert.equal(plan.capacity.capacitySource, "UNMEASURED");
  assert.equal(plan.capacity.maxStreamSubscriptions, null,
               "eine geratene Grenze waere schlimmer als keine");
  assert.equal(plan.streamed.length, Tiers.DEFAULTS.conservativeStreamBudget);
  assert.equal(plan.deferredToQuote.length, 80 - Tiers.DEFAULTS.conservativeStreamBudget);
  /* Was nicht in den Strom passt, faellt zurueck - es faellt nicht aus. */
  assert.match(plan.deferredReason, /Kursabfrage/);

  /* Mit gemessener Grenze zaehlt sie. */
  const gemessen = Tiers.assign({ open, universe: [] },
                                { maxStreamSubscriptions: 60 }, { now });
  assert.equal(gemessen.capacity.capacitySource, "MEASURED");
  assert.equal(gemessen.streamed.length, 60);
});

test("MS19 — die Lastschaetzung rechnet die Abrufe, statt sie zu behaupten", () => {
  const now = Date.now();
  const plan = Tiers.assign({
    open: ["NVDA"], watchlists: ["AAPL", "MSFT"],
    universe: new Array(1000).fill(0).map((_, i) => "S" + i)
  }, null, { now });
  const load = Tiers.estimateLoad(plan, { REALTIME_QUOTE: 60000, EOD: 6 * 3600000 });

  /* Zwei WARM-Titel im Minutentakt sind 120 Anfragen pro Stunde. Das
     ist keine Schaetzung, sondern eine Division. */
  assert.equal(load.requestsPerHour.warmPolling, 120);
  assert.equal(load.streamSubscriptions, 1);
  assert.equal(load.requestsPerHour.total,
               load.requestsPerHour.warmPolling + load.requestsPerHour.coldPolling +
               load.requestsPerHour.deferredHotPolling);
});

/* ---------------------------------------------------- Konfiguration */

test("MS20 — die kuratierte Gate-100-Auswahl ist widerspruchsfrei", () => {
  const seed = JSON.parse(readFileSync(join(root, "quant", "config", "gate-100-seed.json"), "utf8"));
  const scale = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

  let total = 0;
  const seen = new Set();
  for (const [sector, spec] of Object.entries(seed.sectors)) {
    assert.equal(spec.tickers.length, spec.target,
                 `${sector}: ${spec.tickers.length} Titel bei Ziel ${spec.target}`);
    total += spec.target;
    for (const t of spec.tickers.concat(spec.alternates || [])) {
      assert.ok(!seen.has(t), `${t} kommt mehrfach vor`);
      seen.add(t);
    }
    assert.ok((spec.alternates || []).length > 0,
              `${sector} braucht Ersatztitel - sonst kippt das Gate an einem einzigen Ticker`);
  }
  assert.equal(total, 100, "die Sektorziele muessen sich auf 100 summieren");

  /* Die Canary-Titel muessen in der Auswahl stecken, sonst verliert das
     Gate seinen Vergleich (§12). */
  const alle = new Set();
  Object.values(seed.sectors).forEach((s) => s.tickers.forEach((t) => alle.add(t)));
  for (const c of scale.canary.symbols) {
    assert.ok(alle.has(c), `Canary-Titel ${c} fehlt in der Gate-100-Auswahl`);
  }
  /* Und sie duerfen ausdruecklich nicht als Qualitaetsbeweis gelten. */
  assert.match(seed.canaryNote, /nicht als Qualitaetsbeweis/);
});

test("MS21 — der Skalierungsplan schreibt volle Historie und geordnete Stufen vor", () => {
  const scale = JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));

  /* §10: keine kuenstliche Begrenzung. */
  assert.equal(scale.history.policy, "MAX_AVAILABLE");
  assert.ok(scale.history.initialFrom <= "1990-01-01");

  /* §8/§37: die Stufen haengen aneinander, und keine ueberspringt eine. */
  const ids = scale.gates.map((g) => g.id);
  assert.deepEqual(ids, ["CANARY", "GATE_100", "GATE_500", "GATE_2000", "FULL_UNIVERSE"]);
  for (let i = 0; i < scale.gates.length - 1; i++) {
    assert.equal(scale.gates[i].next, scale.gates[i + 1].id,
                 `${scale.gates[i].id} muss auf ${scale.gates[i + 1].id} zeigen`);
  }
  assert.equal(scale.gates[scale.gates.length - 1].next, null);
  /* Das Vollausbaustadium hat bewusst keine Zielzahl (§25). */
  assert.equal(scale.gates[scale.gates.length - 1].size, null);

  /* §12: ein Canary-Fehlschlag darf nicht durchgewunken werden. */
  assert.equal(scale.pass.minCanaryPassRate, 1.0);

  /* §20: die Abo-Grenze bleibt ungemessen, statt geraten zu werden. */
  assert.equal(scale.realtime.capacity.maxStreamSubscriptions, null);
  assert.equal(scale.realtime.capacity.source, "UNMEASURED");
});

test("MS22 — ein echter Kurssturz auf der bereinigten Spalte ist kein Bereinigungsfehler", () => {
  /* Der Fall aus dem ersten Lauf gegen die volle Historie: Apple faellt am
     29.09.2000 um 51,9 Prozent an einem Tag. Das Verhaeltnis 2,08 liegt in
     der Toleranz fuer einen 2:1-Split, und die Reihe wurde deshalb komplett
     verworfen - fuer ein Ereignis, das tatsaechlich stattgefunden hat.

     Der Anbieter meldet fuer diesen Tag ausdruecklich splitFactor 1, und
     geprueft wird die bereinigte Spalte. Beides zusammen schliesst einen
     nicht bereinigten Split aus. */
  function crash(splitFactor, adjusted) {
    const dates = tradingDates(300, TODAY);
    let p = 100;
    return dates.map((date, i) => {
      p = i === 150 ? p * 0.481 : p * 1.001;
      return { date, open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6,
               adjustedClose: adjusted ? p : null,
               splitFactor, dividend: 0, dataSourceId: "ds_tiingo" };
    });
  }

  const bereinigt = MarketQuality.validateBars(crash(1, true),
    { today: TODAY, adjustmentStatus: "adjusted" });
  assert.equal(bereinigt.ok, true, "eine echte Tagesbewegung darf die Reihe nicht verwerfen");
  assert.ok(bereinigt.findings.some((f) => f.code === "large_move_matching_split_ratio"));
  assert.ok(bereinigt.findings.some((f) => f.severity === "warning"),
            "der Sprung bleibt kennzeichnungspflichtig - er verschwindet nicht");

  /* Und die Gegenprobe, zweimal: wo die Angabe FEHLT und wo auf der
     rohen Spalte geprueft wird, bleibt der Verdacht ein Fehler. Ohne
     diese beiden Faelle waere die Aenderung oben eine Aufweichung. */
  const ohneAngabe = MarketQuality.validateBars(crash(null, true),
    { today: TODAY, adjustmentStatus: "adjusted" });
  assert.equal(ohneAngabe.ok, false);
  assert.ok(ohneAngabe.findings.some((f) => f.code === "suspected_unadjusted_split"));

  const roh = MarketQuality.validateBars(crash(1, false),
    { today: TODAY, adjustmentStatus: "unadjusted" });
  assert.equal(roh.ok, false);
  assert.ok(roh.findings.some((f) => f.code === "suspected_unadjusted_split"));

  /* Ein tatsaechlich angekuendigter Split bleibt ein angekuendigter Split. */
  const echterSplit = MarketQuality.validateBars(crash(2, true),
    { today: TODAY, adjustmentStatus: "adjusted" });
  assert.ok(echterSplit.findings.some((f) => f.code === "announced_split"));
  assert.equal(echterSplit.ok, true);
});
