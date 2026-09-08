/* =========================================================================
   PHASE 4A §18/§19/§21/§23 — ECHTE KURSE IN DEN BESTEHENDEN ENGINES

   Die Frage dieser Datei ist nicht, ob die Bruecke Daten umformt. Sie ist,
   ob die bestehenden Engines danach unveraendert laufen - Technical, Quant
   und Backtest, mit demselben Code wie fuer das Modelluniversum.

   Waere dafuer eine Aenderung an factors.js noetig, waere die Bruecke
   falsch gebaut: dann gaebe es zwei Rechenwege fuer dieselbe Kennzahl, und
   sie wuerden auseinanderlaufen.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PanelBuilder = require("../engines/panel-builder.js");
const Factors = require("../engines/factors.js");
const Semantics = require("../engines/price-semantics.js");
const Methodology = require("../engines/methodology.js");

Semantics.configure(JSON.parse(
  readFileSync(join(ROOT, "quant", "methodology", "price-adjustment-v1.json"), "utf8")));

const configs = {};
for (const [k, f] of Object.entries(Methodology.FILES)) {
  configs[k] = JSON.parse(readFileSync(join(ROOT, "quant", "methodology", f), "utf8"));
}
Methodology.configure(configs);

/* Eine realistische Reihe: 500 Handelstage mit Trend, Schwankung und einem
   Einbruch. Deterministisch, damit die Erwartungen stabil bleiben. */
function series(securityId, opts) {
  opts = opts || {};
  const bars = [];
  const d = new Date(Date.UTC(2024, 0, 2));
  let price = opts.start || 100;
  for (let i = 0; i < (opts.days || 500); i++) {
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
    // Deterministischer Verlauf: Aufwaertstrend mit Welle, dazu ein
    // Einbruch in der Mitte, damit ein Drawdown entsteht.
    const wave = Math.sin(i / 40) * 8;
    const crash = (i > 250 && i < 300) ? -18 : 0;
    price = (opts.start || 100) + i * (opts.drift === undefined ? 0.08 : opts.drift) + wave + crash;
    bars.push({
      securityId, date: d.toISOString().slice(0, 10),
      open: +(price * 0.998).toFixed(4), high: +(price * 1.006).toFixed(4),
      low: +(price * 0.994).toFixed(4), close: +price.toFixed(4),
      volume: 1000000 + (i % 7) * 50000,
      /* Eine Reihe, die sich als bereinigt ausgibt, muss auch eine
         bereinigte Spalte mitbringen - sonst prueft der Test etwas
         anderes als er behauptet. */
      adjustedClose: (opts.adjustmentStatus || "adjusted") === "unknown"
        ? null : +price.toFixed(4),
      adjustmentStatus: opts.adjustmentStatus || "adjusted",
      splitFactor: 1, dividend: 0, currency: "USD", dataSourceId: "ds_tiingo"
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { securityId, bars, adjustmentStatus: opts.adjustmentStatus || "adjusted" };
}

/* ------------------------------------------------- Die Bruecke selbst */

test("B1 · Aus Bars wird ein Panel in der Form, die die Engine erwartet", () => {
  const res = PanelBuilder.buildPanel([series("ref_AAPL"), series("ref_MSFT", { start: 200 })]);
  assert.equal(res.ok, true);

  const p = res.panel;
  assert.ok(Array.isArray(p.tradingDays) && p.tradingDays.length > 400);
  assert.equal(p.dayIndex[p.tradingDays[0]], 0);
  assert.ok(p.series.ref_AAPL.close instanceof Float32Array);
  assert.ok(p.series.ref_AAPL.adjustedClose instanceof Float32Array);
  assert.equal(typeof p.series.ref_AAPL.startIndex, "number");
  assert.equal(typeof p.volumeAt, "function");
  assert.ok(p.benchmark && p.benchmark.level instanceof Float32Array);
});

test("B2 · Eine Reihe unbekannter Bereinigung kommt nicht ins Panel", () => {
  // Der Kern: ein Panel aus Reihen unbekannter Bereinigung waere kein
  // unvollstaendiges Ergebnis, sondern ein falsches.
  const res = PanelBuilder.buildPanel([
    series("ref_GUT", { adjustmentStatus: "adjusted" }),
    series("ref_UNBEKANNT", { adjustmentStatus: "unknown" })
  ], { metric: "momentum" });

  assert.equal(res.ok, true);
  assert.deepEqual(res.accepted.map((a) => a.securityId), ["ref_GUT"]);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.rejected[0].securityId, "ref_UNBEKANNT");
  assert.match(res.rejected[0].message, /Splitbereinigt|mindestens/);
});

test("B3 · Ohne brauchbare Reihe entsteht kein Panel", () => {
  const res = PanelBuilder.buildPanel([series("ref_X", { adjustmentStatus: "unknown" })],
    { metric: "momentum" });
  assert.equal(res.ok, false);
  assert.equal(res.panel, null);
  assert.match(res.message, /kein unvollstaendiges Ergebnis, sondern ein falsches/);
});

test("B4 · Die Panelstufe ist die niedrigste enthaltene Reihe", () => {
  // Eine Auswertung ueber alle Titel kann nicht belastbarer sein als die
  // schwaechste Reihe, die eingeht.
  const res = PanelBuilder.buildPanel([
    series("ref_TR", { adjustmentStatus: "adjusted" }),
    series("ref_SPLIT", { adjustmentStatus: "splitAdjusted" })
  ], { requireLevel: "splitAdjusted" });

  assert.equal(res.ok, true);
  assert.equal(res.accepted.length, 2);
  // Die Bruecke antwortet im kanonischen Vokabular der Methodikdatei,
  // nicht im Providervokabular - sonst gaebe es zwei Schreibweisen fuer
  // dieselbe Stufe.
  assert.equal(res.adjustmentStatus, "SPLIT_ADJUSTED");
  // Und daraus folgt: eine Gesamtrendite darf aus diesem Panel nicht kommen.
  assert.equal(Semantics.check("total_return", res.adjustmentStatus).allowed, false);
});

test("B5 · Handelstage werden vereinigt, nicht geschnitten", () => {
  // Ein Titel, der spaeter beginnt, darf die anderen nicht verkuerzen.
  const kurz = series("ref_NEU", { days: 100 });
  const lang = series("ref_ALT", { days: 400 });
  const res = PanelBuilder.buildPanel([kurz, lang]);
  assert.ok(res.panel.tradingDays.length >= 400,
    "die Vereinigung erhaelt die volle Historie des laengsten Titels");
});

/* -------------------------------- §18/§21 Technical- und Quant-Metriken */

test("B6 · Die bestehende Factor-Engine rechnet unveraendert auf echten Bars", () => {
  const res = PanelBuilder.buildPanel([
    series("ref_AAPL", { start: 150 }),
    series("ref_MSFT", { start: 300, drift: 0.12 }),
    series("ref_KO", { start: 60, drift: 0.02 })
  ]);
  assert.equal(res.ok, true);

  const asOf = res.panel.tradingDays[res.panel.tradingDays.length - 1];
  const securities = res.accepted.map((a) => ({
    securityId: a.securityId, ticker: a.securityId.replace("ref_", ""),
    name: "Test " + a.securityId, sector: "Technology", industry: "Software",
    country: "US", assetType: "equity", status: "active", isMock: false,
    fixtureId: null, dataSourceId: "ds_tiingo"
  }));

  // Genau der Aufruf, den auch das Modelluniversum benutzt - kein
  // Sonderweg, keine Kopie.
  const panel = Factors.computeMetricPanel({
    securities, pricePanel: res.panel, factPanel: { asOf, periods: {} }, asOf
  });

  assert.ok(panel.rows.length >= 3);
  const row = panel.rows.find((r) => r.securityId === "ref_AAPL");
  assert.ok(row, "AAPL fehlt im Ergebnis");

  // Die kursbasierten Kennzahlen sind gerechnet - aus echten Bars.
  for (const metric of ["momentum3m", "momentum6m", "momentum12m", "volatility",
                        "maxDrawdown", "distanceTo52wHigh", "priceTo50dma", "priceTo200dma"]) {
    assert.ok(Number.isFinite(row[metric]), metric + " ist nicht berechnet (" + row[metric] + ")");
  }
  // Der eingebaute Einbruch muss sich im Drawdown zeigen.
  /* Der Faktorkatalog fuehrt maxDrawdown als "Groesster Rueckgang der
     letzten 12 Monate (positiver Wert)" mit higherIsBetter:false. Die
     Backtest-Engine weist denselben Namen negativ aus - beide
     Konventionen sind bewusst, aber sie sind nicht dieselbe Zahl. */
  assert.ok(row.maxDrawdown > 0, "der Einbruch erzeugt keinen Drawdown");
  assert.equal(row.asOf, asOf);
});

test("B7 · Ohne Fundamentaldaten bleibt der Quant Score unvollstaendig", () => {
  // §21: reale Titel bekommen echte Kurse und keine erfundenen Bilanzen.
  // Die Deckungslogik aus Phase 1 muss das von selbst erkennen.
  const res = PanelBuilder.buildPanel([series("ref_AAPL"), series("ref_MSFT", { start: 200 })]);
  const asOf = res.panel.tradingDays[res.panel.tradingDays.length - 1];
  const securities = res.accepted.map((a) => ({
    securityId: a.securityId, ticker: a.securityId.replace("ref_", ""),
    name: "Test", sector: "Technology", industry: "Software", country: "US",
    assetType: "equity", status: "active", isMock: false, fixtureId: null,
    dataSourceId: "ds_tiingo"
  }));

  const panel = Factors.computeMetricPanel({
    securities, pricePanel: res.panel, factPanel: { asOf, periods: {} }, asOf
  });
  const QuantScore = require("../engines/quant-score.js");
  const scored = QuantScore.computeScorePanel({ metricPanel: panel, dataSnapshotId: "test" });

  const row = scored.byId.ref_AAPL;
  assert.ok(row, "kein Ergebnis");
  // Momentum und Risiko sind rechenbar, Quality/Value/Growth nicht. Die
  // Deckungspruefung aus Phase 1 muss daraus von selbst "incomplete" machen.
  assert.equal(row.status, "incomplete",
    "ohne Fundamentaldaten darf kein vollstaendiger Score entstehen");
  assert.equal(row.score, null, "ein unvollstaendiger Titel bekommt keine Zahl");
  assert.ok(row.incompleteReasons.length > 0, "der Grund muss benannt sein");
  // Die kursbasierten Faktoren sind trotzdem gerechnet - nicht alles faellt aus.
  assert.ok(Number.isFinite(row.factorScores.momentum),
    "Momentum ist aus Kursen allein rechenbar und muss vorliegen");
});

/* ------------------------------------------------------ §23 Backtest */

test("B8 · Ein reiner Kurs-Backtest laeuft auf echten Bars", () => {
  const Backtest = require("../engines/backtest.js");
  const Strategy = require("../engines/strategy.js");

  /* Sechzehn Titel ueber vier Sektoren - nicht willkuerlich: die Engine
     laesst hoechstens 8 % je Position und 30 % je Sektor zu, ein kleineres
     Universum kaeme also gar nicht auf 100 % investiert. Die Groessenordnung
     entspricht dem Testuniversum aus §6. */
  const SEKTOREN = ["Technology", "Financials", "Energy", "Consumer Staples"];
  const ids = Array.from({ length: 16 }, (_, i) => "ref_" + String.fromCharCode(65 + i));
  const res = PanelBuilder.buildPanel(
    ids.map((id, i) => series(id, { start: 60 + i * 12, drift: 0.02 + i * 0.01 })));
  assert.equal(res.ok, true);

  const securities = res.accepted.map((a, i) => ({
    securityId: a.securityId, ticker: a.securityId.replace("ref_", ""),
    name: "Test", sector: SEKTOREN[i % SEKTOREN.length], industry: "Software",
    country: "US", assetType: "equity", status: "active", isMock: false,
    fixtureId: null, dataSourceId: "ds_tiingo"
  }));

  /* Ein Provider, der ausschliesslich Kurse kennt - genau der Fall aus §23:
     keine Fundamentaldaten vorausgesetzt. */
  const priceOnlyProvider = {
    getSecurities: () => ({ available: true, data: securities }),
    getPricePanel: () => ({ available: true, data: res.panel }),
    getFactPanel: (q) => ({ available: true, data: { asOf: q && q.asOf, periods: {} } }),
    healthCheck: () => ({ status: "ok" })
  };

  /* Momentum-Strategie: braucht nur Kurse. Das Ranking muss ausdruecklich
     auf einen kursbasierten Faktor gestellt werden - die Voreinstellung
     rankt zur Haelfte nach Quality und faende ohne Bilanzdaten korrekt
     keinen einzigen Kandidaten. Und die Groessengrenze muss fallen: eine
     Marktkapitalisierung gibt es hier nicht, und sie zu erfinden waere
     genau das, was §21 verbietet. */
  const definition = Strategy.createDefinition({
    filters: [{ field: "momentum6m", operator: "gt", value: -100 }],
    ranking: { factors: [{ factor: "momentum", weight: 1 }] },
    portfolio: { positions: 13, weighting: "equal", minMarketCapM: 0, minDollarVolumeM: 0 },
    rebalance: "monthly"
  });

  const days = res.panel.tradingDays;
  const result = Backtest.runBacktest({
    definition, strategyId: "tiingo-momentum", strategyVersion: 1,
    startDate: days[60], endDate: days[days.length - 1],
    provider: priceOnlyProvider, dataSnapshotId: "tiingo-test"
  });

  assert.ok(result.equity && result.equity.values.length > 10, "keine Equity-Kurve");
  assert.equal(result.equity.dates.length, result.equity.values.length);
  assert.equal(result.capabilities.everInvested, true,
    "die Strategie muss investiert gewesen sein - sonst prueft der Test nichts");
  assert.ok(Number.isFinite(result.metrics.cagr));
  assert.ok(Number.isFinite(result.metrics.maxDrawdown));
  assert.ok(result.capabilities.timeInvestedPct > 50);
});

test("B9 · Ein Backtest auf ungepruefter Bereinigung kommt nicht zustande", () => {
  // Die Kette greift: die Bruecke lehnt die Reihen ab, also gibt es kein
  // Panel, also keinen Backtest. Kein Ergebnis ist hier das richtige.
  const res = PanelBuilder.buildPanel(
    ["ref_A", "ref_B"].map((id) => series(id, { adjustmentStatus: "unknown" })),
    { metric: "backtest_evidence" });
  assert.equal(res.ok, false);
  assert.equal(res.panel, null);
});

test("B10 · Handelsluecken werden fortgeschrieben, nicht auf null gesetzt", () => {
  const s = series("ref_X", { days: 60 });
  // Eine Luecke in die Mitte reissen.
  s.bars.splice(30, 3);
  const res = PanelBuilder.buildPanel([s]);
  const sr = res.panel.series.ref_X;
  for (let i = sr.startIndex; i <= sr.endIndex; i++) {
    assert.ok(sr.close[i] > 0,
      "Index " + i + " ist null - eine Null waere ein Kurssturz auf null und wuerde " +
      "jede Kennzahl zerstoeren");
  }
});

/* ------------------------------------------------ §31 Herkunftsangabe */

/* Baut denselben reinen Kurs-Backtest wie B8, nur mit steuerbarer
   Herkunftskennzeichnung der Titel. */
function kursBacktest(isMockJeTitel) {
  const Backtest = require("../engines/backtest.js");
  const Strategy = require("../engines/strategy.js");
  const SEKTOREN = ["Technology", "Financials", "Energy", "Consumer Staples"];
  const ids = Array.from({ length: 16 }, (_, i) => "ref_" + String.fromCharCode(65 + i));
  const res = PanelBuilder.buildPanel(
    ids.map((id, i) => series(id, { start: 60 + i * 12, drift: 0.02 + i * 0.01 })));

  const securities = res.accepted.map((a, i) => ({
    securityId: a.securityId, ticker: a.securityId.replace("ref_", ""),
    name: "Test", sector: SEKTOREN[i % SEKTOREN.length], industry: "Software",
    country: "US", assetType: "equity", status: "active",
    isMock: isMockJeTitel(i), fixtureId: null, dataSourceId: "ds_tiingo"
  }));

  const provider = {
    getSecurities: () => ({ available: true, data: securities }),
    getPricePanel: () => ({ available: true, data: res.panel }),
    getFactPanel: (q) => ({ available: true, data: { asOf: q && q.asOf, periods: {} } }),
    healthCheck: () => ({ status: "ok" })
  };
  const definition = Strategy.createDefinition({
    ranking: { factors: [{ factor: "momentum", weight: 1 }] },
    portfolio: { positions: 13, weighting: "equal", minMarketCapM: 0, minDollarVolumeM: 0 },
    rebalance: "monthly"
  });
  const days = res.panel.tradingDays;
  return Backtest.runBacktest({
    definition, strategyId: "herkunft", strategyVersion: 1,
    startDate: days[60], endDate: days[days.length - 1],
    provider, dataSnapshotId: "herkunft-test"
  });
}

test("B11 · Ein Lauf auf echten Titeln wird nicht als synthetisch ausgewiesen", () => {
  // Vorher stand in capabilities.isMock eine feste true. Solange es nur das
  // Modelluniversum gab, war das richtig - bei echten Kursen waere es eine
  // Falschangabe, und der Trust Score haengt daran einen Hinweis auf.
  const result = kursBacktest(() => false);
  assert.equal(result.capabilities.isMock, false);

  const TrustScore = require("../engines/trust-score.js");
  const hinweisText = (r) => JSON.stringify(TrustScore.computeTrustScore(r));

  assert.ok(!/Synthetische Datengrundlage/.test(hinweisText(result)),
    "ein Lauf auf echten Kursen darf nicht als generiertes Universum erklaert werden");
  /* Gegenprobe - sonst wuerde die Zusicherung oben auch dann halten, wenn
     der Trust Score den Hinweis ueberhaupt nicht mehr vergibt. */
  assert.ok(/Synthetische Datengrundlage/.test(hinweisText(kursBacktest(() => true))),
    "beim Modelluniversum muss der Hinweis weiterhin erscheinen");
});

test("B12 · Ein einziger Modelltitel macht den ganzen Lauf synthetisch", () => {
  // Die Regel faellt in die sichere Richtung: gemischt ist nicht real.
  assert.equal(kursBacktest((i) => i === 7).capabilities.isMock, true);
  // Und ohne jede Angabe erst recht nicht.
  assert.equal(kursBacktest(() => undefined).capabilities.isMock, true);
});
