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
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
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
  /* Ab der wievielten Anfrage antwortet die Attrappe mit 429? null heisst
     nie. Damit laesst sich die Ablehnung DES ANBIETERS von unserem
     eigenen Budget unterscheiden - der Unterschied, um den es in dieser
     Nacharbeit geht. */
  const rateLimitAfter = opts.rateLimitAfter === undefined ? null : opts.rateLimitAfter;
  let requests = 0;
  /* Je Titel mitzaehlen. Ein Fortsetzen, das schon geholte Titel erneut
     laedt, ist an dieser Zahl zu erkennen und sonst an nichts. */
  const perSymbol = new Map();
  const server = createServer((req, res) => {
    requests++;
    const url = new URL(req.url, "http://localhost");
    const m = url.pathname.match(/^\/tiingo\/daily\/([^/]+)\/prices$/);
    if (!m) { res.writeHead(404).end(JSON.stringify({ detail: "Not found" })); return; }
    const symbol = decodeURIComponent(m[1]).toUpperCase();
    perSymbol.set(symbol, (perSymbol.get(symbol) || 0) + 1);
    if (rateLimitAfter !== null && requests > rateLimitAfter) {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "3600",
                           "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "0" });
      res.end(JSON.stringify({ detail: "Too many requests" }));
      return;
    }
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
      resolve({ server, port: server.address().port, requests: () => requests,
                perSymbol: () => new Map(perSymbol) });
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

test("SG9 — das Vollausbaustadium wird bewertet, ohne einen Kurs zu holen", async () => {
  /* §25: erst bewerten, dann starten. Ein Backfill, der auf halbem Weg an
     der Platte scheitert, hat Kontingent verbrannt und nichts belegt.

     Der Test stellt einen Anbieter bereit und weist nach, dass er NICHT
     angefragt wird - das ist der Punkt der Betriebsart. */
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");

    /* Eine Bilanz aus einem bestandenen Gate als Messgrundlage. */
    writeFileSync(join(scaleDir, "gate-GATE_500.json"), JSON.stringify({
      gate: "GATE_500", verdict: "PASS",
      accounting: { requested: 500, storageBytes: 1594884000, storageMB: 1520.6,
                    storageMBPer1000Symbols: 3041.2, requests: 502, bytesReceivedMB: 866.7 },
      run: { runtimeSecondsPerSymbol: 0.602 }
    }));

    const securities = [];
    for (let i = 0; i < 8158; i++) {
      securities.push({ securityId: "ref_S" + i, ticker: "S" + i,
                        provider: "tiingo", providerSymbol: "S" + i });
    }
    writeFileSync(join(scaleDir, "universe-FULL_UNIVERSE.json"), JSON.stringify({
      gate: "FULL_UNIVERSE", targetSize: null, actualSize: securities.length,
      method: "RULE_BASED_FROM_PROVIDER_UNIVERSE",
      bySector: { UNKNOWN: securities.length }, byExchange: { NASDAQ: 4908, NYSE: 2718 },
      notes: [], securities
    }));

    const out = await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "FULL_UNIVERSE", "--assess-only", "--scale-dir", scaleDir,
       "--work-dir", join(dir, "cache")],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });
    assert.match(out, /Bewertung ohne Abruf/);

    /* Der eigentliche Nachweis: keine einzige Anfrage. */
    assert.equal(provider.requests(), 0, "die Bewertung darf nichts abrufen");

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-FULL_UNIVERSE.json"), "utf8"));
    assert.equal(report.verdict, "ASSESSED");
    assert.equal(report.universe.actualSize, securities.length);
    /* Die Hochrechnung muss auf einer MESSUNG stehen, nicht auf einer Annahme. */
    assert.equal(report.measurementBasis.length, 1);
    assert.equal(report.measurementBasis[0].gate, "GATE_500");
    assert.ok(report.projection.storageGB > 20, "8.158 Titel bei 3 GB je 1.000 sind ueber 20 GB");
    assert.equal(report.feasibility.verdict, "STORAGE_MIGRATION_REQUIRED");
    /* Und die Empfehlung darf nicht sein, die Historie zu kuerzen. */
    assert.match(report.feasibility.recommendation, /NICHT empfohlen wird: die Historie zu kuerzen/);
  } finally {
    provider.server.close();
  }
});

test("SG10 — ohne Messgrundlage wird nicht hochgerechnet", async () => {
  /* Eine Hochrechnung ohne gemessene Rate waere eine Zahl ohne Deckung -
     und sie saehe genauso aus wie eine belegte. */
  const dir = sandbox();
  const scaleDir = join(dir, "scale");
  writeFileSync(join(scaleDir, "universe-FULL_UNIVERSE.json"), JSON.stringify({
    gate: "FULL_UNIVERSE", targetSize: null, actualSize: 2, method: "TEST",
    bySector: {}, byExchange: {},
    securities: [{ securityId: "ref_A", ticker: "A", provider: "tiingo", providerSymbol: "A" },
                 { securityId: "ref_B", ticker: "B", provider: "tiingo", providerSymbol: "B" }]
  }));

  await run("scripts/market/run-scale-gate.mjs",
    ["--gate", "FULL_UNIVERSE", "--assess-only", "--scale-dir", scaleDir,
     "--work-dir", join(dir, "cache")]);

  const report = JSON.parse(readFileSync(join(scaleDir, "gate-FULL_UNIVERSE.json"), "utf8"));
  assert.equal(report.verdict, "ASSESSED");
  assert.equal(report.projection.status, "NO_MEASUREMENT_BASIS");
  assert.equal(report.feasibility.verdict, "UNKNOWN");
  assert.ok(report.projection.storageGB === undefined,
            "ohne Messgrundlage darf keine Zahl erscheinen");
});

test("SG11 — FULL_UNIVERSE laedt nichts ohne ausdrueckliche Erlaubnis", async () => {
  /* Der Schutz gehoert in das Skript und nicht in die Workflow-Datei.

     Er stand zuerst in einer Shell-Bedingung im Workflow, und ein Lauf hat
     trotzdem einen vollstaendigen Backfill begonnen - stundenlang, mit
     absehbarem Platzmangel. Eine Sicherung, die von aussen falsch
     verdrahtet werden kann, ist keine. Dieser Test haelt sie dort fest,
     wo sie nicht umgangen werden kann. */
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const securities = [];
    for (let i = 0; i < 300; i++) {
      securities.push({ securityId: "ref_S" + i, ticker: "S" + i,
                        provider: "tiingo", providerSymbol: "S" + i });
    }
    writeFileSync(join(scaleDir, "universe-FULL_UNIVERSE.json"), JSON.stringify({
      gate: "FULL_UNIVERSE", targetSize: null, actualSize: securities.length,
      method: "TEST", bySector: {}, byExchange: {}, notes: [], securities
    }));

    /* Ohne Flag und ohne --assess-only: der Lauf muss trotzdem bewerten. */
    const out = await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "FULL_UNIVERSE", "--scale-dir", scaleDir, "--work-dir", join(dir, "cache")],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });

    assert.match(out, /es wird bewertet, nicht geladen/);
    assert.equal(provider.requests(), 0,
                 "ohne ausdrueckliche Erlaubnis darf FULL_UNIVERSE nichts abrufen");

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-FULL_UNIVERSE.json"), "utf8"));
    assert.equal(report.verdict, "ASSESSED");
    assert.match(report.assessReason, /Groessenschutz/);
  } finally {
    provider.server.close();
  }
});

test("SG12 — ueber der Detailgrenze bleiben die Befunde im Bericht, der Rest wandert ab", async () => {
  /* §26: was ausgeliefert wird, ist das Ergebnis; Arbeitsmaterial bleibt in
     der Arbeitsablage. Die Grenze ist hier klein gesetzt, damit der Test
     sie mit wenigen Titeln erreicht - die Regel ist dieselbe.

     Der Punkt, auf den es ankommt: ein Titel, der NICHT sauber durchlief,
     darf nie aus dem ausgelieferten Bericht verschwinden. Ein Bericht ohne
     seine Befunde waere keiner. */
  const dir = sandbox();
  const provider = await startProvider({ failFor: ["BBB"], shortFor: ["CCC"] });
  try {
    const scaleDir = join(dir, "scale");
    const cache = join(dir, "cache");
    const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "AAA", "BBB", "CCC", "DDD", "EEE"];
    writeFileSync(join(scaleDir, "universe-GATE_100.json"), JSON.stringify({
      gate: "GATE_100", targetSize: 100, actualSize: tickers.length, method: "TEST",
      bySector: {}, byExchange: {},
      securities: tickers.map((t) => ({
        securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
        provider: "tiingo", providerSymbol: t
      }))
    }));

    try {
      await run("scripts/market/run-scale-gate.mjs",
        ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
         "--detail-limit", "3"],
        { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });
    } catch (err) { /* das Urteil kann FAIL sein - der Bericht entsteht trotzdem */ }

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));
    assert.equal(report.perSymbolDetail.location, "workingStore");
    assert.equal(report.perSymbolDetail.symbolsTotal, tickers.length);

    /* Die Befunde bleiben. */
    assert.ok(report.perSymbol.BBB, "ein Anbieterfehler darf nicht aus dem Bericht fallen");
    assert.equal(report.perSymbol.BBB.status, "UNAVAILABLE");
    assert.ok(report.perSymbol.CCC, "eine zu kurze Reihe darf nicht aus dem Bericht fallen");
    for (const t of Object.keys(report.perSymbol)) {
      assert.notEqual(report.perSymbol[t].status, "PASS",
                      "saubere Titel gehoeren ueber der Grenze nicht in den Bericht");
    }

    /* Und die vollstaendige Liste liegt trotzdem vor - nur woanders. */
    const detail = JSON.parse(readFileSync(
      join(cache, "tiingo", "gates", "gate-GATE_100-perSymbol.json"), "utf8"));
    assert.equal(Object.keys(detail).length, tickers.length);
    for (const t of tickers) assert.ok(detail[t], `${t} fehlt in der Arbeitsablage`);
  } finally {
    provider.server.close();
  }
});

test("SG13 — auch Faktoren und Technical schreiben ihre Einzelzeilen in DIE Arbeitsablage des Laufs", async () => {
  /* Die Ergaenzung zu SG12, und aus demselben Grund: ein Lauf mit
     --work-dir darf seine Einzelzeilen nicht in die Ablage des
     Repositories schreiben. Der Fehler faellt sonst niemandem auf - er
     legt nur Dateien an einer Stelle ab, an der sie niemand sucht. */
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
        provider: "tiingo", providerSymbol: t
      }))
    }));
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });

    const factorsDir = join(dir, "factors");
    await run("scripts/market/build-market-factors.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
       "--out", factorsDir, "--benchmark", "SPY", "--detail-limit", "3"]);

    const summary = JSON.parse(readFileSync(
      join(factorsDir, "factors-GATE_100-summary.json"), "utf8"));
    assert.equal(summary.detail.location, "workingStore");
    assert.ok(!existsSync(join(factorsDir, "factors-GATE_100.json")),
              "ueber der Grenze darf keine Einzelzeilendatei ausgeliefert werden");
    const detail = JSON.parse(readFileSync(
      join(cache, "tiingo", "factors", "factors-GATE_100.json"), "utf8"));
    assert.equal(detail.securities.length, summary.coverage.computed);

    const techDir = join(dir, "technical");
    await run("scripts/technical/run-technical-scale.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", cache,
       "--out", techDir, "--benchmark", "SPY", "--detail-limit", "3"]);

    const tech = JSON.parse(readFileSync(
      join(techDir, "technical-coverage-GATE_100.json"), "utf8"));
    assert.equal(tech.perSymbolDetail.location, "workingStore");
    const techDetail = JSON.parse(readFileSync(
      join(cache, "tiingo", "technical", "technical-coverage-GATE_100-perSymbol.json"), "utf8"));
    assert.equal(Object.keys(techDetail).length, tickers.length);
  } finally {
    provider.server.close();
  }
});

/* ==========================================================================
   CHECKPOINT UND FORTSETZEN (§4, §6 der Nacharbeit)

   Vorgeschichte: der FULL_UNIVERSE-Lauf endete nach exakt 5.000
   Anfragen. Die Zahl stammte aus COMMERCIAL_LIMITS - unser eigenes
   Budget, nie gemessen, mit verified:false. Der Bericht meldete
   trotzdem FAIL und drei gerissene Quoten, als laege es an den Daten.
   686 Titel waren schlicht nie abgerufen worden.

   Die Tests hier halten beides fest: dass ein Budgetstopp als solcher
   berichtet wird, und dass ein Fortsetzen keine Arbeit doppelt macht
   und keinen Titel verliert.
   ========================================================================== */

function writeGateUniverse(scaleDir, gate, tickers) {
  writeFileSync(join(scaleDir, `universe-${gate}.json`), JSON.stringify({
    gate, targetSize: tickers.length, actualSize: tickers.length,
    method: "TEST", bySector: {}, byExchange: {},
    securities: tickers.map((t) => ({
      securityId: "ref_" + t, ticker: t, exchange: "NASDAQ", currency: "USD",
      instrumentType: "COMMON_STOCK", provider: "tiingo", providerSymbol: t,
      sector: "Technology", sectorStatus: "CURATED", selection: "rule"
    }))
  }));
}

/* Canary (5) + Benchmark (1) laufen vor dem Gate und verbrauchen Budget.
   Wer das beim Rechnen vergisst, misst den falschen Stopp-Punkt. */
const VORLAUF_ANFRAGEN = 6;

test("SG14 — ein Stopp am eigenen Budget ist kein FAIL, sondern fortsetzbar", async () => {
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const gateTickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"];
    writeGateUniverse(scaleDir, "GATE_100", ["AAPL", "MSFT", "NVDA", "JPM", "XOM", ...gateTickers]);

    /* Budget so knapp, dass der Vorlauf plus drei Gate-Titel hineinpassen. */
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", join(dir, "cache"),
       "--request-budget", String(VORLAUF_ANFRAGEN + 3), "--max-wait-ms", "1"],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));

    /* Der Kern: nicht FAIL. Die Daten sind nicht schlecht - sie sind
       teilweise nicht abgerufen. */
    assert.equal(report.verdict, "INCOMPLETE_RESUMABLE",
      "ein Budgetstopp darf nicht als Datenfehler berichtet werden");
    assert.match(report.verdictReason, /eigenesBudget/);
    assert.equal(report.resumable.status, "RESUMABLE");
    assert.ok(report.resumable.pending > 0, "es muessen Titel offen ausgewiesen sein");

    /* Und die Urheberschaft steht dran: WIR haben aufgehoert zu fragen. */
    assert.equal(report.resumable.cause, "clientBudget");
    assert.match(report.resumable.causeNote, /nicht Tiingos/i);
    assert.equal(report.accounting.providerObserved.http429Seen, false);
    assert.equal(report.accounting.providerObserved.status, "NO_PROVIDER_STATEMENT");
    assert.ok(report.accounting.providerObserved.symbolsBlockedByOwnBudget > 0);
    assert.equal(report.accounting.providerObserved.symbolsRefusedByProvider, 0);
    assert.equal(report.accounting.requestBudget.provenance, "SAFETY_CEILING");

    /* Die Quote ueber die tatsaechlich geholten Titel bleibt lesbar -
       sie ist bei einem Teillauf die einzige aussagekraeftige. */
    assert.ok(report.qualityOfResolved, "qualityOfResolved fehlt");
    assert.equal(report.qualityOfResolved.of, report.accounting.resolved);

    /* Eine abgewiesene Zeile nennt den Urheber, nicht nur den Grund. */
    const blockiert = Object.values(report.perSymbol)
      .filter((r) => r.status === "UNAVAILABLE" && r.source === "clientBudget");
    assert.ok(blockiert.length > 0, "keine Zeile traegt source clientBudget");
    assert.match(blockiert[0].message, /Anbieter hat nichts abgelehnt/);
  } finally {
    provider.server.close();
  }
});

test("SG15 — Fortsetzen holt keinen Titel doppelt und verliert keinen", async () => {
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const work = join(dir, "cache");
    const gateTickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"];
    const alle = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", ...gateTickers];
    writeGateUniverse(scaleDir, "GATE_100", alle);

    const env = { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` };

    /* START → Teilmenge → Checkpoint */
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", work,
       "--request-budget", String(VORLAUF_ANFRAGEN + 3), "--max-wait-ms", "1"], env);
    const ersterLauf = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));
    assert.equal(ersterLauf.verdict, "INCOMPLETE_RESUMABLE");
    const nachErstem = provider.perSymbol();

    /* FORTSETZEN → vollstaendig */
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", work,
       "--request-budget", "500", "--max-wait-ms", "1"], env);
    const zweiterLauf = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));

    /* Kein Titel verloren: am Ende ist jeder aufgeloest. */
    assert.equal(zweiterLauf.accounting.requested, alle.length);
    assert.equal(zweiterLauf.accounting.resolved, alle.length,
      "nach dem Fortsetzen muss jeder Titel aufgeloest sein");
    assert.equal(zweiterLauf.accounting.unavailable, 0);
    assert.equal(zweiterLauf.resumable.status, "COMPLETE");
    assert.notEqual(zweiterLauf.verdict, "INCOMPLETE_RESUMABLE");

    /* Keine Doppelarbeit: kein Gate-Titel wurde zweimal GEHOLT.

       Der Canary laeuft in jedem Lauf erneut - das ist Absicht (§12) und
       zaehlt nicht als Doppelarbeit. Geprueft werden die Gate-Titel. */
    const nachZweitem = provider.perSymbol();
    for (const t of gateTickers) {
      const gesamt = nachZweitem.get(t) || 0;
      assert.equal(gesamt, 1,
        `${t} wurde ${gesamt}-mal geholt statt genau einmal (vor dem Fortsetzen: ${nachErstem.get(t) || 0})`);
    }

    /* Deterministisch: die zusammengesetzte Reihe ist dieselbe, die ein
       Lauf in einem Zug erzeugt haette. */
    const frisch = join(dir, "cache-frisch");
    const scaleFrisch = join(dir, "scale-frisch");
    mkdirSync(scaleFrisch, { recursive: true });
    writeGateUniverse(scaleFrisch, "GATE_100", alle);
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleFrisch, "--work-dir", frisch,
       "--request-budget", "500", "--max-wait-ms", "1"], env);
    const inEinemZug = JSON.parse(readFileSync(join(scaleFrisch, "gate-GATE_100.json"), "utf8"));

    for (const t of gateTickers) {
      assert.deepEqual(
        { status: zweiterLauf.perSymbol[t].status, bars: zweiterLauf.perSymbol[t].bars },
        { status: inEinemZug.perSymbol[t].status, bars: inEinemZug.perSymbol[t].bars },
        `${t} unterscheidet sich zwischen fortgesetztem und durchgehendem Lauf`);
    }
    assert.equal(zweiterLauf.historyCoverage.covered, inEinemZug.historyCoverage.covered);
    assert.equal(zweiterLauf.accounting.success, inEinemZug.accounting.success);
    assert.equal(zweiterLauf.accounting.warning, inEinemZug.accounting.warning);
  } finally {
    provider.server.close();
  }
});

test("SG16 — sagt der Anbieter selbst nein, wird das als seine Aussage berichtet", async () => {
  const dir = sandbox();
  /* Diesmal lehnt die Attrappe ab - mit 429 und Kontingentkoepfen, so
     wie es ein echtes Limit taete. */
  const provider = await startProvider({ rateLimitAfter: VORLAUF_ANFRAGEN + 2 });
  try {
    const scaleDir = join(dir, "scale");
    const gateTickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];
    writeGateUniverse(scaleDir, "GATE_100", ["AAPL", "MSFT", "NVDA", "JPM", "XOM", ...gateTickers]);

    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", join(dir, "cache"),
       "--request-budget", "500", "--max-wait-ms", "1"],
      { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` });

    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));
    const beobachtet = report.accounting.providerObserved;

    /* Das ist der Unterschied zu SG14: hier hat der Anbieter geredet. */
    assert.equal(beobachtet.http429Seen, true, "ein echtes 429 muss als solches erscheinen");
    assert.ok(beobachtet.http429Count > 0);
    assert.equal(beobachtet.status, "PROVIDER_LIMIT_OBSERVED");
    assert.ok(beobachtet.symbolsRefusedByProvider > 0,
      "vom Anbieter abgelehnte Titel muessen getrennt gezaehlt werden");
    assert.equal(beobachtet.symbolsBlockedByOwnBudget, 0,
      "unser Budget war grosszuegig - die Ablehnung kam von aussen");
    assert.match(beobachtet.note, /Beleg/);

    /* Die Kontingentkoepfe des Anbieters werden mitgeschrieben - sie sind
       die einzige Auskunft, die er von sich aus gibt. */
    assert.ok(beobachtet.rateLimitHeaders, "Kontingentkoepfe wurden nicht mitgeschrieben");
    assert.equal(beobachtet.rateLimitHeaders["x-ratelimit-limit"], "5000");
    assert.equal(beobachtet.retryAfterSeconds, 3600);
  } finally {
    provider.server.close();
  }
});

test("SG17 — ein Abbruch mitten im Lauf nimmt den Fortschritt nicht mit", async () => {
  const dir = sandbox();
  const provider = await startProvider();
  try {
    const scaleDir = join(dir, "scale");
    const work = join(dir, "cache");
    /* Genug Titel, dass der Lauf lange genug dauert, um ihn wirklich
       mitten hinein zu treffen. Mit 30 war er vorbei, bevor das Signal
       ankam - und ein Test, der einen bereits beendeten Lauf abbricht,
       prueft nichts. */
    const gateTickers = Array.from({ length: 400 }, (_, i) => "T" + String(i).padStart(3, "0"));
    writeGateUniverse(scaleDir, "GATE_100", ["AAPL", "MSFT", "NVDA", "JPM", "XOM", ...gateTickers]);
    const env = { TIINGO_API_KEY: "test-key", TIINGO_BASE_URL: `http://127.0.0.1:${provider.port}` };

    const kind = spawn(process.execPath,
      [join(root, "scripts/market/run-scale-gate.mjs"), "--gate", "GATE_100",
       "--scale-dir", scaleDir, "--work-dir", work, "--max-wait-ms", "1",
       "--minute-budget", "100000", "--request-budget", "100000"],
      { env: Object.assign({}, process.env, env), stdio: ["ignore", "pipe", "pipe"] });

    let ausgabe = "";
    kind.stdout.on("data", (d) => { ausgabe += d.toString(); });
    kind.stderr.on("data", (d) => { ausgabe += d.toString(); });

    /* Auf das Ende horchen, BEVOR das Signal geht.

       Andersherum entsteht ein Wettlauf: ist der Lauf schon fertig, ist
       das exit-Ereignis vorbei, der spaeter angehaengte Horcher hoert
       nichts mehr, und der Test haengt bis zum Zeitlimit. */
    const beendet = new Promise((r) => kind.on("exit", (code, signal) => r({ code, signal })));

    /* Warten, bis der Lauf mitten IM Gate steht - die Fortschrittszeile
       kommt alle 25 Titel und beweist das, anders als eine feste Pause. */
    await new Promise((fertig, fehler) => {
      const frist = setTimeout(() => fehler(new Error("Gate-Lauf kam nicht in Gang: " + ausgabe)), 30000);
      const takt = setInterval(() => {
        if (/\d+\/\d+\s+[\d.]+ Titel\/s/.test(ausgabe)) {
          clearInterval(takt); clearTimeout(frist); fertig();
        }
      }, 25);
    });
    kind.kill("SIGTERM");
    const ende = await beendet;

    assert.equal(ende.code, 130, "ein Abbruch muss als Abbruch enden, nicht als Erfolg");
    assert.match(ausgabe, /Fortschritt gesichert/);

    /* Der Checkpoint traegt, was fertig war - und nichts doppelt. */
    const ckptDatei = join(work, "tiingo", "checkpoints", "gate-GATE_100.json");
    assert.ok(existsSync(ckptDatei), "kein Checkpoint geschrieben: " + ckptDatei);
    const ckpt = JSON.parse(readFileSync(ckptDatei, "utf8"));
    assert.ok(ckpt.done.length > 0, "der Checkpoint ist leer - der Abbruch hat alles gekostet");
    assert.ok(ckpt.done.length < gateTickers.length,
      "der Lauf war schon fertig - der Abbruch hat nichts unterbrochen");
    assert.equal(new Set(ckpt.done).size, ckpt.done.length, "der Checkpoint enthaelt Doppelte");
    const nachAbbruch = provider.perSymbol();
    const fertigVorAbbruch = new Set(ckpt.done.map((id) => id.replace(/^ref_/, "")));

    /* Fortsetzen bis zum Ende. */
    await run("scripts/market/run-scale-gate.mjs",
      ["--gate", "GATE_100", "--scale-dir", scaleDir, "--work-dir", work, "--max-wait-ms", "1",
       "--minute-budget", "100000", "--request-budget", "100000"], env);
    const report = JSON.parse(readFileSync(join(scaleDir, "gate-GATE_100.json"), "utf8"));

    /* Kein Titel verloren - auch die aus dem abgebrochenen Lauf sind in
       der Bilanz, ohne erneut geholt worden zu sein. */
    assert.equal(report.accounting.requested, 5 + gateTickers.length);
    assert.equal(report.accounting.resolved, 5 + gateTickers.length,
      "nach dem Fortsetzen fehlt ein Titel in der Bilanz");
    assert.equal(report.accounting.unavailable, 0);
    assert.equal(report.resumable.status, "COMPLETE");

    /* Keine Doppelarbeit: was vor dem Abbruch fertig war, wurde nicht
       noch einmal geholt. */
    const nachEnde = provider.perSymbol();
    let geprueft = 0;
    for (const t of gateTickers) {
      if (!fertigVorAbbruch.has(t)) continue;
      geprueft++;
      assert.equal(nachEnde.get(t), nachAbbruch.get(t),
        `${t} war schon fertig und wurde beim Fortsetzen erneut geholt`);
    }
    assert.ok(geprueft > 0, "es gab nichts zu pruefen - der Abbruch kam zu frueh");
  } finally {
    provider.server.close();
  }
});

/* ==========================================================================
   KURSART UND IHRE FOLGEN (§7-§11 der Nacharbeit)

   Der Strom liefert Kurse ohne Typfeld. Solange der Anbieter nicht sagt,
   was sie bedeuten, darf kein Artefakt sie "Last Trade" nennen und keine
   Kennzahl auf ihnen rechnen. Die Pruefung liest das erzeugte Artefakt,
   nicht die Absicht des Skripts.
   ========================================================================== */

test("SG18 — ohne Zugang behauptet der Stromnachweis keine Kursart und sperrt die Nutzung", async () => {
  const dir = sandbox();
  const out = join(dir, "commercial");
  await run("scripts/market/verify-live-candle.mjs", ["--out", out, "--seconds", "15"], {});
  const bericht = JSON.parse(readFileSync(join(out, "live-candle-verification.json"), "utf8"));

  assert.equal(bericht.LIVE_CHART_READY, "UNKNOWN");
  assert.ok(bericht.priceSemantics, "der Bericht muss die Kursart ausweisen");
  assert.equal(bericht.priceSemantics.outcome, "UNSPECIFIED");
  assert.equal(bericht.priceSemantics.classification, "PROVIDER_CONFIRMATION_REQUIRED");
  assert.equal(bericht.priceSemantics.safeForIntradayIntelligence, false);
  assert.equal(bericht.priceSemantics.providerConfirmationRequired, true);

  /* Ohne Lauf darf auch nichts ueber den Lauf behauptet werden. */
  assert.match(bericht.priceSemantics.known, /Nichts|keine Verbindung/i);

  /* Die Sperre ist maschinenlesbar und benennt, was gesperrt ist. */
  const sperre = bericht.priceSemantics.intradayIntelligence;
  assert.equal(sperre.status, "BLOCKED");
  for (const verboten of ["intradaySignals", "backtesting", "executionSimulation",
                          "tradeBasedVolumeAnalysis", "tradeBasedOHLC"]) {
    assert.ok(sperre.blockedUses.includes(verboten), `${verboten} muss gesperrt sein`);
  }
  /* Das Chart selbst bleibt erlaubt - gesperrt ist das Rechnen, nicht das Zeigen. */
  assert.ok(sperre.permittedUses.includes("liveMovingChart"));
  assert.ok(sperre.labelling.forbidden.includes("Last Trade"));
});

test("SG19 — ein Artefakt, das eine unbelegte Kursart behauptet, kommt nicht durch die Hygiene", async () => {
  const dir = sandbox();
  /* Ein Minimalbaum, der so aussieht wie der echte - nur mit einem
     Bericht, der mehr behauptet, als gemessen wurde. */
  const commercial = join(dir, "quant", "data", "market", "commercial");
  mkdirSync(commercial, { recursive: true });

  function schreibeBefund(inhalt) {
    writeFileSync(join(commercial, "live-candle-verification.json"), JSON.stringify(inhalt));
  }
  async function hygiene() {
    try {
      await run("scripts/market/assert-public-data-hygiene.mjs", [`--root=${dir}`], {});
      return { ok: true, ausgabe: "" };
    } catch (err) {
      return { ok: false, ausgabe: String(err.stderr || err.stdout || err.message) };
    }
  }

  /* Gegenprobe 1: verbotene Beschriftung bei unbelegter Kursart. */
  schreibeBefund({
    LIVE_CHART_READY: "TRUE",
    liveChartReason: "Der Chart zeigt den Last Trade in Echtzeit.",
    priceSemantics: { outcome: "UNSPECIFIED", intradayIntelligence: { status: "BLOCKED" } }
  });
  const eins = await hygiene();
  assert.equal(eins.ok, false, "eine unbelegte Kursart als 'Last Trade' muss anhalten");
  assert.match(eins.ausgabe, /behauptet eine Kursart/);

  /* Gegenprobe 2: unbelegte Kursart ohne Sperre. */
  schreibeBefund({
    LIVE_CHART_READY: "TRUE",
    liveChartReason: "Der Chart bewegt sich.",
    priceSemantics: { outcome: "UNSPECIFIED" }
  });
  const zwei = await hygiene();
  assert.equal(zwei.ok, false, "ohne Sperre darf der Befund nicht durchgehen");
  assert.match(zwei.ausgabe, /sperrt die abgeleitete Nutzung nicht/);

  /* Und der ehrliche Fall geht durch - samt der Verbotsliste selbst, die
     die verbotenen Woerter ja enthaelt und trotzdem kein Verstoss ist. */
  schreibeBefund({
    LIVE_CHART_READY: "TRUE",
    liveChartReason: "Mehrere aufeinanderfolgende Kursereignisse. Die Kursart ist unbelegt.",
    priceSemantics: {
      outcome: "UNSPECIFIED",
      intradayIntelligence: {
        status: "BLOCKED",
        blockedUses: ["intradaySignals", "backtesting"],
        labelling: { forbidden: ["Last Trade", "Official Trade Price", "Realtime Trade"] }
      }
    }
  });
  const drei = await hygiene();
  assert.equal(drei.ok, true,
    "der ehrliche Bericht muss durchgehen - auch wenn er die verbotenen Woerter auflistet");

  /* Ist die Kursart belegt, greift die Sperre nicht mehr. */
  schreibeBefund({
    LIVE_CHART_READY: "TRUE",
    liveChartReason: "Der Chart zeigt den Last Trade.",
    priceSemantics: { outcome: "VERIFIED_PRICE_TYPE", priceType: "TRADE" }
  });
  const vier = await hygiene();
  assert.equal(vier.ok, true, "eine belegte Kursart darf auch so genannt werden");
});

test("SG20 — der Grenzennachweis erfindet ohne Zugang kein Anbieterlimit", async () => {
  const dir = sandbox();
  const out = join(dir, "commercial");
  await run("scripts/market/verify-request-limits.mjs", ["--out", out], {});
  const bericht = JSON.parse(readFileSync(join(out, "request-limits.json"), "utf8"));

  assert.equal(bericht.verificationLevel, "NOT_RUN");
  assert.equal(bericht.requestsMade, 0, "ohne Zugang darf keine Anfrage gestellt werden");
  assert.equal(bericht.verdict.classification, "UNKNOWN");
  assert.equal(bericht.verdict.requestsPerHour, null);

  /* Die Zahl aus dem Code steht drin - mit ihrer Herkunft, nicht als Befund. */
  assert.equal(bericht.configuredLimits.requestsPerHour, 5000);
  assert.equal(bericht.configuredLimits.verified, false);
  assert.equal(bericht.configuredLimits.provenance.requestsPerHour, "SAFETY_CEILING");
  assert.match(bericht.configuredLimits.note, /unser Budget/i);
});

/* ==========================================================================
   UNIVERSUMSWEITE PRUEFUNGEN (§13 der Nacharbeit)

   Fehler, die jeden einzelnen Titel sauber aussehen lassen und erst im
   Vergleich vieler sichtbar werden. Die Tests bauen sie absichtlich ein
   und pruefen, dass die Pruefung sie findet - eine Pruefung, die man nie
   hat anschlagen sehen, ist keine.
   ========================================================================== */

function baueArtefakte(dir, opts = {}) {
  const scale = join(dir, "scale");
  const factors = join(dir, "factors");
  const tech = join(dir, "tech");
  for (const d of [scale, factors, tech]) mkdirSync(d, { recursive: true });

  const tickers = opts.tickers || ["AAA", "BBB", "CCC", "DDD"];
  const securities = tickers.map((t, i) => ({
    securityId: (opts.securityIds && opts.securityIds[i]) || "ref_" + t,
    ticker: t, exchange: "NASDAQ", currency: "USD", instrumentType: "COMMON_STOCK",
    provider: "tiingo", providerSymbol: t
  }));
  writeFileSync(join(scale, "universe-TEST.json"), JSON.stringify({
    gate: "TEST", targetSize: tickers.length, actualSize: tickers.length,
    method: "TEST", bySector: {}, byExchange: {}, securities
  }));

  const perSymbol = {};
  tickers.forEach((t, i) => {
    perSymbol[t] = { status: "PASS", reason: "clean", bars: 900, usable: 900,
                     staleTradingDays: (opts.stale && opts.stale[i]) || 1, factorReady: true };
  });
  writeFileSync(join(scale, "gate-TEST.json"), JSON.stringify(Object.assign({
    gate: "TEST", verdict: "PASS",
    accounting: { requested: tickers.length, resolved: tickers.length, success: tickers.length,
                  warning: 0, fail: 0, unavailable: 0 },
    historyCoverage: { covered: tickers.length },
    perSymbol
  }, opts.gateOverrides || {})));

  writeFileSync(join(factors, "factors-TEST-summary.json"), JSON.stringify({
    gate: "TEST",
    benchmark: opts.benchmark || { id: "SPY", bars: 8000, last: "2026-09-08" },
    coverage: { computed: tickers.length, skipped: 0,
      fieldCoverage: opts.fieldCoverage || {
        sma20: { CALCULATED: tickers.length, INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0, NOT_APPLICABLE: 0 }
      } }
  }));

  writeFileSync(join(tech, "technical-coverage-TEST.json"), JSON.stringify(Object.assign({
    gate: "TEST", requested: tickers.length, evaluated: tickers.length,
    coverage: { TECHNICAL_READY: tickers.length, TECHNICAL_PARTIAL: 0, TECHNICAL_FAILED: 0,
                INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0 }
  }, opts.technicalOverrides || {})));

  return { scale, factors, tech };
}

async function pruefeUniversum(dir, p) {
  const args = ["--gate", "TEST", "--scale-dir", p.scale, "--factor-dir", p.factors,
                "--tech-dir", p.tech, "--out", join(dir, "health")];
  try {
    const out = await run("scripts/market/assert-universe-quality.mjs", args, {});
    return { ok: true, ausgabe: out,
             bericht: JSON.parse(readFileSync(join(dir, "health", "universe-quality-TEST.json"), "utf8")) };
  } catch (err) {
    return { ok: false, ausgabe: String(err.stdout || "") + String(err.stderr || ""),
             bericht: JSON.parse(readFileSync(join(dir, "health", "universe-quality-TEST.json"), "utf8")) };
  }
}

test("SG21 — saubere Artefakte kommen durch die Universumspruefung", async () => {
  const dir = sandbox();
  const p = baueArtefakte(dir);
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, true, "der saubere Fall muss durchgehen: " + r.ausgabe);
  assert.equal(r.bericht.status, "PASSED");
  assert.equal(r.bericht.errors, 0);
  /* Und die Pruefungen muessen tatsaechlich gelaufen sein - ein
     Durchgehen, weil nichts geprueft wurde, ist kein Bestehen. */
  for (const pruefung of ["duplicateSecurities", "tickerCollisions", "nonFiniteNumbers",
                          "dateAlignment", "technicalBundles", "accountingConsistency"]) {
    assert.ok(r.bericht.checksRun.includes(pruefung), `${pruefung} lief nicht`);
  }
});

test("SG22 — zwei Titel mit derselben securityId halten an", async () => {
  const dir = sandbox();
  /* Der Bestand wird unter der securityId abgelegt. Zwei Zeilen mit
     derselben Id heisst: die zweite ueberschreibt die erste, und der
     Screener zeigt fuer den einen Titel die Reihe des anderen. */
  const p = baueArtefakte(dir, { securityIds: ["ref_X", "ref_X", "ref_C", "ref_D"] });
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, false, "doppelte securityIds muessen anhalten");
  assert.equal(r.bericht.status, "FAILED");
  const b = r.bericht.findings.find((f) => f.check === "duplicateSecurities");
  assert.ok(b, "kein Befund zu doppelten securityIds");
  assert.equal(b.severity, "ERROR");
});

test("SG23 — eine Tickerkollision ist eine Warnung, kein Abbruch", async () => {
  const dir = sandbox();
  /* Derselbe Ticker an zwei Boersen ist nicht falsch - aber es ist immer
     eine Frage, welche Reihe der Screener nimmt. */
  const p = baueArtefakte(dir, { tickers: ["AAA", "AAA", "CCC", "DDD"],
                                 securityIds: ["ref_A1", "ref_A2", "ref_C", "ref_D"] });
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, true, "eine Kollision darf nicht anhalten");
  assert.equal(r.bericht.status, "PASSED_WITH_WARNINGS");
  const b = r.bericht.findings.find((f) => f.check === "tickerCollisions");
  assert.ok(b && b.severity === "WARNING");
});

test("SG24 — ein Titel ohne Technical-Zustand ist eine stille Luecke und haelt an", async () => {
  const dir = sandbox();
  /* Vier angefordert, drei in den Faechern: einer hat gar keinen
     Zustand. Er sieht im Bericht aus, als haette es ihn nie gegeben. */
  const p = baueArtefakte(dir, {
    technicalOverrides: { requested: 4, evaluated: 3,
      coverage: { TECHNICAL_READY: 3, TECHNICAL_PARTIAL: 0, TECHNICAL_FAILED: 0,
                  INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0 } }
  });
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, false);
  const b = r.bericht.findings.find((f) => f.check === "technicalBundles");
  assert.ok(b, "kein Befund zum fehlenden Buendel");
  assert.match(b.message, /ohne jeden Zustand/);

  /* Gegenprobe: analysiert werden WENIGER als eingeordnet - das ist
     richtig so (zu kurze Historie geht nicht durch die Engine) und darf
     nicht anschlagen. */
  const dir2 = sandbox();
  const p2 = baueArtefakte(dir2, {
    technicalOverrides: { requested: 4, evaluated: 3,
      coverage: { TECHNICAL_READY: 3, TECHNICAL_PARTIAL: 0, TECHNICAL_FAILED: 0,
                  INSUFFICIENT_HISTORY: 1, SOURCE_MISSING: 0 } }
  });
  const r2 = await pruefeUniversum(dir2, p2);
  assert.equal(r2.ok, true,
    "weniger analysierte als eingeordnete Titel ist kein Fehler, sondern die Definition");
});

test("SG25 — ein Feld, das bei der Mehrheit fehlt, wird als Explosion gemeldet", async () => {
  const dir = sandbox();
  const p = baueArtefakte(dir, {
    fieldCoverage: {
      sma20: { CALCULATED: 4, INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 0, NOT_APPLICABLE: 0 },
      /* Alle vier leer: das ist kein Einzelfall, das ist die Rechnung. */
      relativeStrength12M: { CALCULATED: 0, INSUFFICIENT_HISTORY: 0, SOURCE_MISSING: 4, NOT_APPLICABLE: 0 }
    }
  });
  const r = await pruefeUniversum(dir, p);
  const b = r.bericht.findings.find((f) => f.check === "nullExplosion");
  assert.ok(b, "eine leere Spalte ueber alle Titel muss auffallen");
  assert.ok(b.fields.some((f) => f.feld === "relativeStrength12M"));
  assert.ok(!b.fields.some((f) => f.feld === "sma20"), "das volle Feld darf nicht dabei sein");
});

test("SG26 — ein Massstab ohne Bars macht jede relative Staerke leer und haelt an", async () => {
  const dir = sandbox();
  /* Genau der Fall des alten GATE_100: die Benchmark fehlte, und alle
     100 Titel trugen SOURCE_MISSING. Im Einzelbericht sah jeder Titel
     in Ordnung aus. */
  const p = baueArtefakte(dir, { benchmark: { id: "SPY", status: "SOURCE_MISSING" } });
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, false);
  const b = r.bericht.findings.find((f) => f.check === "relativeStrengthAlignment");
  assert.ok(b && b.severity === "ERROR");
  assert.match(b.message, /sieht aus wie ein schwacher Titel/);
});

test("SG27 — eine Bilanz, die nicht mit sich selbst stimmt, haelt an", async () => {
  const dir = sandbox();
  const p = baueArtefakte(dir, {
    gateOverrides: { accounting: { requested: 4, resolved: 4, success: 2, warning: 0,
                                   fail: 0, unavailable: 0 } }
  });
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, false);
  const b = r.bericht.findings.find((f) => f.check === "accountingConsistency");
  assert.ok(b, "eine Bilanz mit fehlenden Titeln muss auffallen");
  assert.match(b.message, /in keinem Fach oder in zweien/);
});

test("SG28 — fallen viele Titel zeitlich zurueck, ist das ein Fehler und keine Marktlage", async () => {
  const dir = sandbox();
  /* Ein einzelner zurueckliegender Titel ist normal (ausgesetzt,
     delistet). Die Haelfte ist ein Abrufproblem. */
  const p = baueArtefakte(dir, { stale: [1, 40, 40, 1] });
  const r = await pruefeUniversum(dir, p);
  assert.equal(r.ok, false, "50 % zurueckliegende Titel muessen anhalten");
  const b = r.bericht.findings.find((f) => f.check === "dateAlignment");
  assert.ok(b && b.severity === "ERROR");

  /* Gegenprobe: einer von vier bleibt eine Warnung. */
  const dir2 = sandbox();
  const p2 = baueArtefakte(dir2, { stale: [1, 1, 1, 40], tickers: ["A1", "A2", "A3", "A4"] });
  const r2 = await pruefeUniversum(dir2, p2);
  const b2 = r2.bericht.findings.find((f) => f.check === "dateAlignment");
  assert.ok(b2, "ein zurueckliegender Titel gehoert trotzdem in den Bericht");
});

test("SG29 — die Backfill-Marke im Workflow erreicht die Sicherung im Skript", async () => {
  /* Ein Lauf, der laden sollte, hat bewertet - still und gruen.
     (Actions-Lauf 34369902099.)

     Ursache: es gibt ZWEI Schalter. Der Workflow leerte seinen eigenen
     (--assess-only), aber das Skript traegt seit dem teuren Vorfall eine
     eigene Sicherung (--allow-full-backfill), und die hat der Workflow
     nie gesetzt. Beide Seiten waren fuer sich richtig; zusammen waren
     sie eine Marke ohne Wirkung.

     Der Test haelt die Verbindung fest - nicht die Formulierung. */
  const workflow = readFileSync(join(root, ".github/workflows/tiingo-scale.yml"), "utf8");

  assert.match(workflow, /--allow-full-backfill/,
    "der Workflow muss die Sicherung des Skripts ueberhaupt kennen");

  /* Die Marke und die Sicherung muessen im selben Zweig stehen: wer die
     Marke setzt, muss auch die Sicherung loesen. */
  const zweig = workflow.slice(workflow.indexOf("tiingo-full-backfill"));
  const bisElse = zweig.slice(0, zweig.indexOf("else"));
  assert.match(bisElse, /--allow-full-backfill|ALLOW=/,
    "die Backfill-Marke muss im selben Zweig die Sicherung des Skripts loesen");

  /* Und der Aufruf muss sie weiterreichen - eine gesetzte Variable, die
     nie in der Kommandozeile landet, ist derselbe Fehler noch einmal. */
  const aufruf = workflow.split("\n").find((z) => z.includes("run-scale-gate.mjs --gate"));
  assert.ok(aufruf, "der Aufruf des Gate-Laufs ist nicht zu finden");
  assert.match(aufruf, /\$ALLOW/,
    "der Aufruf muss die Backfill-Erlaubnis weiterreichen");
  assert.match(aufruf, /\$MODE/);
  assert.match(aufruf, /\$BUDGET/,
    "das ausdrueckliche Stundenbudget muss ebenfalls ankommen");

  /* Gegenprobe auf der Skriptseite: ohne die Erlaubnis bewertet es. Das
     ist SG11 - hier wird nur festgehalten, dass die Sicherung noch da
     ist und nicht bei dieser Gelegenheit entfernt wurde. */
  const skript = readFileSync(join(root, "scripts/market/run-scale-gate.mjs"), "utf8");
  assert.match(skript, /ALLOW_FULL_BACKFILL\s*=\s*argv\.includes\("--allow-full-backfill"\)/);
  assert.match(skript, /GATE === "FULL_UNIVERSE" && !ALLOW_FULL_BACKFILL/,
    "die Sicherung im Skript darf nicht entfernt werden");
});
