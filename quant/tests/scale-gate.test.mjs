/* =========================================================================
   VISION UNIVERSE — scale-gate.test.mjs   (Tiingo Commercial, §33)

   Prueft die Scale-Kette an einem echten Lauf: Universumsaufbau,
   Gate-Auswahl, Gate-Durchlauf mit Bilanz und Urteil.

   Der Anbieter wird durch einen lokalen HTTP-Server ersetzt, der
   dieselbe Antwortform liefert. Das ist kein Mock der eigenen Engines -
   Adapter, Qualitaetspruefung, Speicher und Bilanz laufen echt. Ersetzt
   ist ausschliesslich die Gegenstelle, und genau die kann ein Test nicht
   anfassen, ohne fremdes Kontingent zu verbrauchen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* --------------------------------------------------- Anbieterattrappe */

/** Erzeugt eine plausible Kursreihe mit einem Split und Dividenden. */
function makeBars(seed, count, endDate) {
  const bars = [];
  let price = 20 + (seed % 80);
  let split = null;

  /* Rueckwaerts vom letzten Handelstag zaehlen, nicht vorwaerts von einer
     geschaetzten Startzeit: die Reihe MUSS bis endDate reichen, sonst
     prueft der Test die Stale-Erkennung statt der Pipeline - und faellt
     aus einem Grund durch, den er selbst erzeugt hat. */
  const dates = [];
  const cursor = new Date(Date.parse(endDate + "T00:00:00Z"));
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (dates.length < count) {
    dates.unshift(cursor.toISOString().slice(0, 10));
    do { cursor.setUTCDate(cursor.getUTCDate() - 1); }
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  }

  for (let i = 0; i < count; i++) {
    price *= 1 + Math.sin((i + seed) / 11) * 0.012 + 0.0003;
    const date = dates[i];
    /* Ein 2:1-Split in der Mitte - die Reihe soll die Splitpruefung
       tatsaechlich beschaeftigen und nicht nur durchlaufen. */
    const isSplit = i === Math.floor(count / 2);
    if (isSplit) { price = price / 2; split = date; }
    const raw = price;
    bars.push({
      date: date + "T00:00:00.000Z",
      open: raw * 0.995, high: raw * 1.008, low: raw * 0.99, close: raw,
      volume: 1000000 + (i % 17) * 5000,
      adjOpen: raw * 0.995, adjHigh: raw * 1.008, adjLow: raw * 0.99, adjClose: raw,
      adjVolume: 1000000 + (i % 17) * 5000,
      divCash: i % 63 === 0 && i > 0 ? 0.25 : 0,
      splitFactor: isSplit ? 2 : 1
    });
  }
  /* Die rohe Spalte muss den Split zeigen, die bereinigte nicht - sonst
     prueft der Test die Bereinigungssemantik nicht, sondern umgeht sie. */
  const splitIndex = bars.findIndex((b) => b.splitFactor === 2);
  for (let i = 0; i < splitIndex; i++) {
    ["open", "high", "low", "close"].forEach((k) => { bars[i][k] *= 2; });
  }
  return { bars, split };
}

function startProvider(opts = {}) {
  const failFor = new Set(opts.failFor || []);
  const shortFor = new Set(opts.shortFor || []);
  const endDate = opts.endDate || new Date().toISOString().slice(0, 10);
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    const url = new URL(req.url, "http://localhost");
    const m = url.pathname.match(/^\/tiingo\/daily\/([^/]+)\/prices$/);
    if (!m) { res.writeHead(404).end(JSON.stringify({ detail: "Not found" })); return; }
    const symbol = decodeURIComponent(m[1]).toUpperCase();
    if (failFor.has(symbol)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Error: Ticker '" + symbol + "' not found." }));
      return;
    }
    const count = shortFor.has(symbol) ? 40 : 600;
    const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const { bars } = makeBars(seed, count, endDate);
    const start = url.searchParams.get("startDate");
    const filtered = start ? bars.filter((b) => b.date.slice(0, 10) >= start) : bars;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, requests: () => requests });
    });
  });
}

/* ------------------------------------------------------------ Aufbau */

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "vu-scale-"));
  mkdirSync(join(dir, "scale"), { recursive: true });
  return dir;
}

function writeUniverse(dir, tickers) {
  const entries = tickers.map((t, i) => ({
    ticker: t, company: null, exchange: i % 2 ? "NYSE" : "NASDAQ", country: "US",
    currency: "USD", assetType: "Stock", instrumentType: "COMMON_STOCK",
    classificationConfidence: "HIGH", active: true, providerSymbol: t, provider: "tiingo",
    screenerEligible: true, otc: false, startDate: "1999-01-04", endDate: null,
    sector: null, industry: null, sectorStatus: "SOURCE_MISSING", industryStatus: "SOURCE_MISSING"
  }));
  const file = join(dir, "universe.json");
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), entries }));
  return file;
}

const execFileAsync = promisify(execFile);

/* Bewusst asynchron. Die Anbieterattrappe laeuft im SELBEN Prozess wie
   der Test; ein synchroner Kindprozessaufruf blockiert dessen
   Ereignisschleife, der Server antwortet nie, und der Test haengt bis
   zum Zeitlimit. Das ist keine Stilfrage, sondern die einzige Variante,
   die ueberhaupt funktioniert. */
async function run(script, args, env) {
  const r = await execFileAsync(process.execPath, [join(root, script), ...args], {
    encoding: "utf8", env: Object.assign({}, process.env, env || {}),
    maxBuffer: 16 * 1024 * 1024
  });
  return r.stdout;
}

/* ------------------------------------------------------------- Tests */

test("SG1 — der Universumsaufbau klassifiziert echte Stammdatenzeilen und liefert nur die Bilanz aus", async () => {
  const dir = sandbox();
  const csv = join(dir, "tickers.csv");
  writeFileSync(csv, [
    "ticker,exchange,assetType,priceCurrency,startDate,endDate",
    "AAPL,NASDAQ,Stock,USD,1980-12-12,2026-09-08",
    "SPY,NYSE ARCA,ETF,USD,1993-01-29,2026-09-08",
    "BAC-PB,NYSE,Stock,USD,2013-01-02,2026-09-08",
    "GONE,NASDAQ,Stock,USD,2001-01-02,2018-05-04",
    "VFINX,NASDAQ,Mutual Fund,USD,1990-01-02,2026-09-08",
    "MYST,PINK,,USD,2010-01-02,2026-09-08"
  ].join("\n"));

  const outDir = join(dir, "universe");
  const out = await run("scripts/market/build-market-universe.mjs",
    ["--from-csv", csv, "--out", outDir, "--work-dir", join(dir, "work")]);
  assert.match(out, /COMMON_STOCK/);

  const summary = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8"));
  assert.equal(summary.status, "OK");
  /* Nur die Bilanz wird ausgeliefert - niemals die Liste selbst (§26/§34). */
  assert.ok(!("entries" in summary), "summary.json darf keine Tickerliste enthalten");
  assert.ok(!("tickers" in summary));
  assert.equal(summary.redistribution.fullList, "LEGAL_REVIEW_REQUIRED");
  assert.equal(summary.totals.byInstrumentType.ETF, 1);
  assert.equal(summary.totals.byInstrumentType.PREFERRED, 1);
  assert.equal(summary.totals.byInstrumentType.FUND, 1);
  assert.equal(summary.totals.byInstrumentType.UNKNOWN, 1);
  /* GONE ist delistet und AAPL nicht: screenerfaehig ist genau einer. */
  assert.equal(summary.totals.screenerEligible, 1);
});

test("SG2 — GATE_100 kommt aus der kuratierten Auswahl, GATE_500 enthaelt es vollstaendig", async () => {
  const dir = sandbox();
  const seed = JSON.parse(readFileSync(join(root, "quant", "config", "gate-100-seed.json"), "utf8"));
  const tickers = [];
  for (const spec of Object.values(seed.sectors)) tickers.push(...spec.tickers, ...spec.alternates);
  for (let i = 0; i < 800; i++) tickers.push("SYN" + String(i).padStart(4, "0"));
  const universe = writeUniverse(dir, tickers);
  const scaleDir = join(dir, "scale");

  await run("scripts/market/select-gate-universe.mjs",
      ["--gate", "GATE_100", "--universe", universe, "--out", scaleDir]);
  const g100 = JSON.parse(readFileSync(join(scaleDir, "universe-GATE_100.json"), "utf8"));
  assert.equal(g100.actualSize, 100);
  assert.deepEqual(g100.canaryIncluded.sort(), ["AAPL", "JPM", "MSFT", "NVDA", "XOM"]);
  assert.equal(Object.keys(g100.bySector).length, 9, "neun Sektoren, nicht nur Technologie");
  assert.ok(!g100.bySector.UNKNOWN, "in GATE_100 hat jeder Titel einen kuratierten Sektor");
  g100.securities.forEach((s) => assert.equal(s.sectorStatus, "CURATED",
    "ein kuratierter Sektor darf nie als Anbieterangabe erscheinen"));

  await run("scripts/market/select-gate-universe.mjs",
      ["--gate", "GATE_500", "--universe", universe, "--out", scaleDir]);
  const g500 = JSON.parse(readFileSync(join(scaleDir, "universe-GATE_500.json"), "utf8"));
  assert.equal(g500.actualSize, 500);
  const inG500 = new Set(g500.securities.map((s) => s.ticker));
  for (const s of g100.securities) {
    assert.ok(inG500.has(s.ticker), `${s.ticker} fehlt in GATE_500 - Gates muessen geschachtelt sein`);
  }
});

test("SG3 — ein Gate-Lauf bilanziert vollstaendig und kommt zu einem Urteil", async () => {
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "AAA", "BBB", "CCC", "DDD", "EEE"];
    writeFileSync(join(scaleDir, "universe-GATE_100.json"), JSON.stringify({
      gate: "GATE_100", targetSize: 100, actualSize: tickers.length,
      method: "TEST", bySector: {}, byExchange: {},
      securities: tickers.map((t) => ({
        securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
        instrumentType: "COMMON_STOCK", provider: "tiingo", providerSymbol: t,
        sector: "Technology", sectorStatus: "CURATED", selection: "seed"
      }))
    }));

    const out = await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", join(dir, "cache")],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));

    /* §8 verlangt genau diese Posten. Ein Gate ohne sie ist kein Gate. */
    for (const field of ["requested", "resolved", "success", "warning", "fail", "unavailable",
                         "providerErrors", "requests", "bytesReceived", "storageBytes"]) {
      assert.ok(field in report.accounting, `Bilanzposten fehlt: ${field}`);
    }
    assert.equal(report.accounting.requested, tickers.length);
    assert.equal(report.accounting.resolved, tickers.length);
    assert.ok(report.run.runtimeMs > 0);
    assert.ok(report.accounting.storageBytes > 0, "der Lauf muss messbar etwas abgelegt haben");
    assert.ok(report.historyCoverage.covered > 0);
    assert.ok(["PASS", "FAIL", "INCOMPLETE"].includes(report.verdict));

    /* §12: der Canary lief, und zwar vor dem Gate. */
    assert.ok(report.canary, "ohne Canary-Block ist der Bericht unvollstaendig");
    assert.equal(report.canary.of, 5);
    assert.match(out, /Canary/);

    /* §34: keine Kurse im ausgelieferten Bericht. */
    const text = JSON.stringify(report);
    assert.ok(!/"close"/.test(text), "der Gate-Bericht darf keine Kurse tragen");
    assert.ok(!/"bars":\s*\[/.test(text), "der Gate-Bericht darf keine Kursreihe tragen");

    /* Jeder Titel traegt einen Status und keinen stillen Leerwert (§30). */
    for (const t of tickers) {
      assert.ok(report.perSymbol[t], `${t} fehlt in perSymbol`);
      assert.ok(["PASS", "WARNING", "FAIL", "UNAVAILABLE"].includes(report.perSymbol[t].status));
    }
  } finally {
    provider.server.close();
  }
});

test("SG4 — Anbieterfehler werden als UNAVAILABLE gezaehlt, nicht als Erfolg", async () => {
  const dir = sandbox();
  const provider = await startProvider({ failFor: ["BBB", "CCC"], shortFor: ["DDD"] });
  try {
    const scaleDir = join(dir, "scale");
    const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "AAA", "BBB", "CCC", "DDD"];
    writeFileSync(join(scaleDir, "universe-GATE_100.json"), JSON.stringify({
      gate: "GATE_100", targetSize: 100, actualSize: tickers.length, method: "TEST",
      bySector: {}, byExchange: {},
      securities: tickers.map((t) => ({
        securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
        provider: "tiingo", providerSymbol: t, sector: null, sectorStatus: "SOURCE_MISSING"
      }))
    }));

    try {
      await run("scripts/market/run-scale-gate.mjs",
        ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", join(dir, "cache")],
        { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });
    } catch (err) {
      /* Ein FAIL-Urteil beendet den Prozess mit 1. Genau so soll es sein -
         der Bericht ist trotzdem geschrieben. */
    }

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));
    assert.equal(report.accounting.unavailable, 2, "zwei Anbieterfehler, zwei UNAVAILABLE");
    assert.ok(Object.keys(report.accounting.providerErrors).length > 0,
              "Anbieterfehler muessen nach Grund aufgeschluesselt sein");
    assert.equal(report.perSymbol.BBB.status, "UNAVAILABLE");
    assert.notEqual(report.perSymbol.DDD.status, "PASS",
                    "eine 40-Bar-Reihe darf nicht als saubere Historie durchgehen");
    assert.equal(report.verdict, "FAIL", "22 % Ausfall darf kein Gate bestehen");
    assert.match(report.verdictReason, /resolvedRate|successRate|historyCoverageRate/);
  } finally {
    provider.server.close();
  }
});

test("SG5 — eine Canary-Regression stoppt das Gate, bevor ein Titel geladen wird", async () => {
  const dir = sandbox();
  const provider = await startProvider({ failFor: ["NVDA"] });
  try {
    const scaleDir = join(dir, "scale");
    writeFileSync(join(scaleDir, "universe-GATE_100.json"), JSON.stringify({
      gate: "GATE_100", targetSize: 100, actualSize: 3, method: "TEST",
      bySector: {}, byExchange: {},
      securities: ["AAA", "BBB", "CCC"].map((t) => ({
        securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
        provider: "tiingo", providerSymbol: t
      }))
    }));

    let failed = false;
    try {
      await run("scripts/market/run-scale-gate.mjs",
        ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", join(dir, "cache")],
        { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });
    } catch (err) { failed = true; }

    assert.ok(failed, "eine Canary-Regression muss den Lauf mit Fehlercode beenden");
    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.verdictReason, "canaryRegression");
    assert.ok(report.canary.regression);
    /* Der eigentliche Beweis: das Gate-Universum wurde nicht angefasst. */
    assert.ok(!report.perSymbol, "nach einer Canary-Regression darf kein Gate-Titel geladen werden");
  } finally {
    provider.server.close();
  }
});

test("SG6 — Faktoren, Screener, Technical und Gesundheitsbericht laufen auf demselben Bestand", async () => {
  /* Die vollstaendige Kette in einem Lauf: Gate -> Faktoren -> Screener ->
     Technical Intelligence -> Gesundheitsbericht. Sie einzeln zu pruefen
     wuerde genau den Fehler durchlassen, auf den es hier ankommt: dass
     der naechste Schritt den Bestand des vorherigen nicht findet. */
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const cache = join(dir, "cache");
    const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "SPY", "AAA", "BBB"];
    writeFileSync(join(scaleDir, "universe-GATE_100.json"), JSON.stringify({
      gate: "GATE_100", targetSize: 100, actualSize: tickers.length, method: "TEST",
      bySector: {}, byExchange: {},
      securities: tickers.map((t) => ({
        securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
        instrumentType: "COMMON_STOCK", provider: "tiingo", providerSymbol: t,
        sector: "Technology", sectorStatus: "CURATED", selection: "seed"
      }))
    }));

    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });

    /* ------------------------------------------------- Faktoren */
    const factorsDir = join(dir, "factors");
    await run("scripts/market/build-market-factors.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
       "--out", factorsDir, "--benchmark", "SPY"]);

    const factors = JSON.parse(readFileSync(join(factorsDir, "factors-GATE_100.json"), "utf8"));
    assert.ok(factors.securities.length > 0);
    const one = factors.securities[0];
    for (const p of [20, 50, 100, 200]) {
      assert.ok("priceAboveSMA" + p in one.values, `priceAboveSMA${p} fehlt`);
      assert.ok("distanceToSMA" + p in one.values, `distanceToSMA${p} fehlt`);
    }
    /* §34: keine Kursniveaus im ausgelieferten Faktorsatz. */
    assert.ok(!("sma200" in one.values), "SMA-Niveaus gehoeren nicht in das Artefakt");
    assert.ok(!("high52w" in one.values));
    assert.equal(one.fieldStatus.sma200, "WITHHELD_REDISTRIBUTION");
    /* Die Benchmark lag vor, also muss die relative Staerke gerechnet sein. */
    assert.equal(factors.benchmark.id, "SPY");
    assert.equal(one.fieldStatus.relativeStrength["12M"], "CALCULATED");

    /* ------------------------------------------------- Screener */
    const screener = JSON.parse(readFileSync(join(factorsDir, "screener-GATE_100.json"), "utf8"));
    const ids = screener.questions.map((q) => q.id);
    for (const expected of ["aboveSMA20", "aboveSMA50", "aboveSMA200",
                            "aboveSMA20And50And200", "newHigh52w", "within5PctOf52wHigh",
                            "strongestMomentum12M", "strongestRelativeStrength12M",
                            "volumeBreakout", "trendAcceleration",
                            "highVolatility", "lowVolatility"]) {
      assert.ok(ids.includes(expected), `Screener-Frage fehlt: ${expected}`);
    }
    /* Der Kern von §15/§30: jede boolesche Frage traegt drei Zahlen, und
       Treffer plus Nichttreffer plus nicht-entscheidbar ergibt das
       bewertete Universum. Ohne das liest sich eine Luecke wie ein Befund. */
    for (const q of screener.questions.filter((x) => x.kind === "boolean")) {
      assert.equal(q.matched + q.notMatched + q.notEvaluable, q.evaluatedOf,
                   `${q.id}: die drei Zahlen ergeben nicht das bewertete Universum`);
    }

    /* ------------------------------------------------ Technical */
    const techDir = join(dir, "technical");
    await run("scripts/technical/run-technical-scale.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
       "--out", techDir, "--benchmark", "SPY"]);

    const tech = JSON.parse(readFileSync(
      join(techDir, "technical-coverage-GATE_100.json"), "utf8"));
    assert.equal(tech.requested, tickers.length);
    const sum = Object.values(tech.coverage).reduce((a, b) => a + b, 0);
    assert.equal(sum, tickers.length, "jeder Titel braucht genau einen Deckungsstatus");
    assert.ok(tech.coverage.TECHNICAL_READY > 0, "auf 600 sauberen Bars muss die Analyse laufen");
    for (const t of tickers) {
      assert.ok(tech.perSymbol[t], `${t} fehlt im Deckungsbericht`);
    }
    /* §18: die Elliott-Faecher, und Laufzeit statt Vermutung. */
    const elliottSum = Object.values(tech.elliott.coverage).reduce((a, b) => a + b, 0);
    assert.equal(elliottSum, tickers.length);
    assert.ok(tech.performance.msPerSymbol > 0);
    assert.ok(tech.performance.projected.minutesFor2000 > 0);
    /* §26/§34: der Deckungsbericht traegt keine Bundles und keine Kurse. */
    const techText = JSON.stringify(tech);
    assert.ok(!techText.includes('"close"'), "keine Kurse im Deckungsbericht");
    assert.ok(!techText.includes('"timestamps"'), "keine Kursreihen im Deckungsbericht");

    /* --------------------------------------- Gesundheitsbericht */
    const dataRoot = join(dir, "dataroot");
    mkdirSync(join(dataRoot, "market"), { recursive: true });
    cpSync(scaleDir, join(dataRoot, "market", "scale"), { recursive: true });
    cpSync(factorsDir, join(dataRoot, "market", "factors"), { recursive: true });
    cpSync(techDir, join(dataRoot, "technical", "scale"), { recursive: true });

    const healthDir = join(dir, "health");
    await run("scripts/market/build-health-report.mjs",
      ["--data-root", dataRoot, "--out", healthDir]);

    const health = JSON.parse(readFileSync(join(healthDir, "health.json"), "utf8"));
    /* §29/§30: was nicht gelaufen ist, steht als MISSING da - nicht als 0. */
    assert.equal(health.universe.status, "MISSING");
    assert.equal(health.commercialCapabilities.status, "MISSING");
    assert.equal(health.realtime.LIVE_CHART_READY, "UNKNOWN");
    assert.ok(health.gates.GATE_100, "das gelaufene Gate muss im Bericht stehen");
    assert.ok(health.gates.GATE_100.factors.smaCoverage);
    assert.ok(health.gates.GATE_100.technical.READY >= 0);
    assert.ok(health.gates.GATE_100.canary);
    /* §31: die Backtest-Tauglichkeit wird aus dem Gate-Bericht abgeleitet
       und nicht neu gemessen. Sie muss die Bereinigungsstufen auszaehlen
       und einen Widerspruch benennen koennen. */
    const bt = health.gates.GATE_100.backtestReadiness;
    assert.equal(bt.symbols, tickers.length);
    assert.equal(bt.rejectedForFutureBars, 0);
    assert.equal(bt.rawAndAdjustedStoredSeparately, true);
    assert.ok(["DATA_SUPPORTS_BACKTEST", "REVIEW_REQUIRED"].includes(bt.readiness));
    assert.equal(Object.values(bt.byInferredAdjustment).reduce((a, b) => a + b, 0),
                 tickers.length, "jede Reihe braucht genau eine gemessene Bereinigungsstufe");

    /* Ohne Universum ist die Kette nicht betriebsbereit, egal wie gut das
       Gate lief. Genau das muss der Gesamtbefund sagen. */
    assert.equal(health.overall, "NOT_READY");
  } finally {
    provider.server.close();
  }
});

test("SG7 — ein an der Canary-Regression abgebrochener Lauf laesst sich berichten", async () => {
  /* Der Bericht eines abgebrochenen Laufs traegt keine Bilanz: das
     Gate-Universum wurde nie angefasst. Der Gesundheitsbericht muss genau
     das abbilden koennen. Beim ersten echten Lauf ist er daran
     gescheitert - und hat damit die Auskunft verhindert, fuer die er
     gebaut ist. */
  const dir = sandbox();
  const dataRoot = join(dir, "dataroot");
  mkdirSync(join(dataRoot, "market", "scale"), { recursive: true });
  writeFileSync(join(dataRoot, "market", "scale", "gate-GATE_100.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), gate: "GATE_100", provider: "tiingo",
    verdict: "FAIL", verdictReason: "canaryRegression",
    message: "Canary-Regression vor dem Gate.",
    requested: 100,
    canary: { symbols: ["AAPL"], passed: 0, of: 1, passRate: 0, regression: true,
              details: [{ ticker: "AAPL", ok: false, failures: ["qualityFail:stale_last_bar"],
                          status: "FAIL", bars: 9238, first: "1990-01-02", last: "2026-08-01" }] },
    runtimeMs: 1234
  }, null, 2));

  const healthDir = join(dir, "health");
  await run("scripts/market/build-health-report.mjs", ["--data-root", dataRoot, "--out", healthDir]);

  const health = JSON.parse(readFileSync(join(healthDir, "health.json"), "utf8"));
  assert.equal(health.gates.GATE_100.gate.verdict, "FAIL");
  assert.equal(health.gates.GATE_100.marketData.status, "ABORTED");
  assert.equal(health.gates.GATE_100.marketData.reason, "canaryRegression");
  assert.equal(health.gates.GATE_100.canary.regression, true);
  /* Kein bestandenes Gate heisst nicht betriebsbereit - und der Grund
     muss den Abbruch benennen, nicht das fehlende Universum. */
  assert.equal(health.overall, "NOT_READY");
  assert.equal(health.latestPassedGate, null);
  /* Was nicht gelaufen ist, steht als MISSING da - nicht als 0 (§30). */
  assert.equal(health.gates.GATE_100.factors.status, "MISSING");
  assert.equal(health.gates.GATE_100.technical.status, "MISSING");
});

test("SG8 — die erzeugten Artefakte kommen durch die Hygienepruefung", async () => {
  /* Die Regression, die den ersten echten Lauf angehalten hat: der
     Gesundheitsbericht fuehrte eine Anzahl unter dem Feldnamen "sma200",
     der Technical-Bericht eine Schwelle unter "high". Beide Zahlen sind
     harmlos und beide sind in einem ausgelieferten Artefakt von einem
     Kurs nicht zu unterscheiden - die Pruefung hat sie zu Recht
     angehalten.

     Dieser Test baut die Artefakte und laesst die echte Pruefung darauf
     los. Er faengt damit nicht nur diesen einen Fall, sondern jeden
     kuenftigen Feldnamen, der dieselbe Zweideutigkeit hat. */
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const cache = join(dir, "cache");
    const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "SPY"];
    writeFileSync(join(scaleDir, "universe-GATE_100.json"), JSON.stringify({
      gate: "GATE_100", targetSize: 100, actualSize: tickers.length, method: "TEST",
      bySector: {}, byExchange: {},
      securities: tickers.map((t) => ({
        securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
        provider: "tiingo", providerSymbol: t, sector: "Technology", sectorStatus: "CURATED"
      }))
    }));

    const env = { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` };
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache], env);

    /* Ein Baum in der Form des Repositories - die Pruefung erwartet genau
       diese Pfade und darf dafuer nicht in quant/data/ schreiben muessen. */
    const tree = join(dir, "tree");
    const data = join(tree, "quant", "data");
    mkdirSync(join(tree, "quant", "config"), { recursive: true });
    mkdirSync(join(data, "market"), { recursive: true });
    mkdirSync(join(data, "technical"), { recursive: true });
    cpSync(join(root, "quant", "config", "development-preview.json"),
           join(tree, "quant", "config", "development-preview.json"));
    cpSync(scaleDir, join(data, "market", "scale"), { recursive: true });

    await run("scripts/market/build-market-factors.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
       "--out", join(data, "market", "factors"), "--benchmark", "SPY"]);
    await run("scripts/technical/run-technical-scale.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
       "--out", join(data, "technical", "scale"), "--benchmark", "SPY"]);
    await run("scripts/market/build-health-report.mjs",
      ["--data-root", data, "--out", join(data, "market", "health")]);

    /* Die echte Pruefung, auf dem echten Baum. Kein Nachbau. */
    const out = await run("scripts/market/assert-public-data-hygiene.mjs", [`--root=${tree}`]);
    assert.match(out, /no commercial-provider raw bars/);

    /* Gegenprobe: ein echtes Kursniveau muss sie anhalten - sonst
       prueft der Test oben nur, dass nichts passiert. */
    const factorsFile = join(data, "market", "factors", "factors-GATE_100.json");
    const payload = JSON.parse(readFileSync(factorsFile, "utf8"));
    payload.securities[0].values.sma200 = 184.2;
    writeFileSync(factorsFile, JSON.stringify(payload));
    await assert.rejects(
      () => run("scripts/market/assert-public-data-hygiene.mjs", [`--root=${tree}`]),
      "ein durchgereichtes Kursniveau muss die Pruefung anhalten");
  } finally {
    provider.server.close();
  }
});
