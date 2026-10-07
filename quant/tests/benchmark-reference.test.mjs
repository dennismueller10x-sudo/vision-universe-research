/* SPY als BENCHMARK_REFERENCE (Owner-Entscheid 02.10.2026).

   SPY gehoert in die kanonische Historie, damit Backtests ihn als
   Gesamtrendite vergleichen - und nirgends sonst hin. Diese Tests sichern
   beide Haelften: die Ablage fuehrt ihn, das Produktuniversum nicht; und
   die Signal-Studie rechnet nur dann mit Gesamtrendite, wenn Titel UND
   Vergleich sie auf derselben Wochenachse tragen. Jede Zusicherung hat
   eine Gegenprobe, die rot werden muss. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { benchmarkSpec, withBenchmark, BENCHMARK_ROLE } from "../../scripts/market/benchmark-reference.mjs";
import { resolveProductUniverse } from "../../scripts/market/universe-source.mjs";
import { createFsDriver } from "../../scripts/market/storage/fs-driver.mjs";
import { totalReturnState } from "../../scripts/market/refresh-benchmark-history.mjs";
import { barsWithDividends } from "./total-return-fixtures.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SB = require("../engines/signal-backtest.js");
const Guard = require("../engines/zero-cost-guard.js");
const { createHistoryStore } = require("../engines/history-store.js");
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const SPY = benchmarkSpec();

test("the benchmark is SPY with role BENCHMARK_REFERENCE", () => {
  assert.deepEqual(SPY, { ticker: "SPY", securityId: "ref_SPY", role: BENCHMARK_ROLE });
});

test("PRODUCT_UNIVERSE_BEFORE == PRODUCT_UNIVERSE_AFTER: SPY is in no product or gate list", () => {
  const isSpy = (x) => x && (x.securityId === "ref_SPY" || x.ticker === "SPY" || x.s === "SPY" || x.m === "ref_SPY");
  /* Produktuniversum (Company Master), Gate-Universum der Ablage, Marktfaehigkeit,
     Security-Master-Entscheidungen, Aktienliste: SPY steht in keiner. */
  const product = resolveProductUniverse(ROOT);
  assert.equal(product.securities.some(isSpy), false, "SPY im Produktuniversum");
  assert.equal(json("quant/data/market/scale/universe-FULL_UNIVERSE.json").securities.some(isSpy), false, "SPY im Gate-Universum");
  const cap = json("quant/data/universe/market-capability.json");
  assert.equal(cap.members.some(isSpy), false, "SPY in der Marktfaehigkeit");
  assert.equal(cap.members.length, product.securities.length, "Marktfaehigkeit und Produktuniversum sind dieselbe Menge");
  const decisions = json("quant/data/market/security-master/eligibility.json").decisions || [];
  assert.equal((Array.isArray(decisions) ? decisions : Object.values(decisions)).some(isSpy), false, "SPY im Security Master");
  assert.equal(existsSync(join(ROOT, "quant/data/market/discover-series-long/ref_SPY.json")), false, "SPY in den Titelreihen der Studien");
  /* Die Hinzufuegung betrifft nur die Mitglieder der vollen Ablage. */
  const members = [{ ticker: "AAA", securityId: "ref_AAA" }];
  assert.deepEqual(withBenchmark("GATE_100", members), members, "ein Teil-Gate bekommt keine Benchmark");
  assert.deepEqual(withBenchmark("FULL_UNIVERSE", members).map((m) => m.ticker), ["AAA", "SPY"]);
  assert.equal(withBenchmark("FULL_UNIVERSE", withBenchmark("FULL_UNIVERSE", members)).length, 2, "nie doppelt");
  /* Gegenprobe: eine Liste, die SPY schon fuehrt, bleibt unveraendert. */
  const withSpy = members.concat([{ ticker: "SPY", securityId: "ref_SPY" }]);
  assert.deepEqual(withBenchmark("FULL_UNIVERSE", withSpy), withSpy);
});

test("the long-series publisher never writes the benchmark into the title series", () => {
  const src = readFileSync(join(ROOT, "scripts/market/publish-long-series.mjs"), "utf8");
  assert.match(src, /import \{ benchmarkSpec \} from "\.\/benchmark-reference\.mjs"/);
  assert.match(src, /!\(BENCHMARK && \(s\.securityId === BENCHMARK\.securityId \|\| s\.ticker === BENCHMARK\.ticker\)\)/,
    "ohne den Filter landet SPY in discover-series-long und damit als Titel in Signal-Backtest, Mustern und Radar");
});

function syncFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "vu-bm-sync-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const f of ["scripts/market/sync-history-store.mjs", "scripts/market/benchmark-reference.mjs", "scripts/market/storage/fs-driver.mjs",
    "quant/engines/history-store.js", "quant/engines/bar-codec.js", "quant/engines/zero-cost-guard.js", "quant/engines/survivorship-control.js", "quant/config/tiingo-scale.json"]) {
    mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(dir, f));
  }
  const write = (p, v) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), JSON.stringify(v)); };
  const stock = { ticker: "TST", securityId: "ref_TST" };
  for (const gate of ["FULL_UNIVERSE", "TEST"]) write(`quant/data/market/scale/universe-${gate}.json`, { securities: [stock] });
  const bars = (id, n) => Array.from({ length: n }, (_, i) => ({ securityId: id, date: `2026-09-${String(i + 1).padStart(2, "0")}`, close: 10 + i, adjustedClose: 10 + i }));
  write("working/tiingo/daily/ref_TST.json", { ticker: "TST", securityId: "ref_TST", provider: "tiingo", bars: bars("ref_TST", 3) });
  write("working/tiingo/daily/ref_SPY.json", { ticker: "SPY", securityId: "ref_SPY", provider: "tiingo", role: BENCHMARK_ROLE, bars: bars("ref_SPY", 4) });
  const run = (direction, gate) => {
    const operation = direction === "pull" ? "RECOVERY" : "BULK_UPLOAD", preflight = join(dir, "preflight.json");
    writeFileSync(preflight, JSON.stringify({ generatedAt: new Date().toISOString(), operation, gate, provider: "tiingo", market: "US", measured: true, offline: false,
      verdict: { verdict: Guard.ALLOWED }, budgetForRun: { classAOperations: 100, classBOperations: 100 } }));
    return spawnSync(process.execPath, [join(dir, "scripts/market/sync-history-store.mjs"), "--" + direction, "--gate", gate, "--work-dir", join(dir, "working"),
      "--report", join(dir, "report.json"), "--preflight", preflight, "--local-root", join(dir, "durable")], { encoding: "utf8", env: { PATH: process.env.PATH } });
  };
  return { dir, run, durable: createHistoryStore({ driver: createFsDriver(join(dir, "durable")), provider: "tiingo" }) };
}

test("the full store pushes and restores SPY; a partial gate does not", async (t) => {
  const f = syncFixture(t);
  const partial = f.run("push", "TEST"); assert.equal(partial.status, 0, partial.stderr);
  assert.equal(await f.durable.getSeries("SPY"), null, "ein Teil-Gate schreibt keine Benchmark");
  const full = f.run("push", "FULL_UNIVERSE"); assert.equal(full.status, 0, full.stderr);
  const spy = await f.durable.getSeries("SPY");
  assert.ok(spy, "die volle Ablage fuehrt SPY");
  assert.equal(spy.securityId, "ref_SPY"); assert.equal(spy.bars.length, 4);
  rmSync(join(f.dir, "working"), { recursive: true, force: true });
  const pull = f.run("pull", "FULL_UNIVERSE"); assert.equal(pull.status, 0, pull.stderr);
  const restored = JSON.parse(readFileSync(join(f.dir, "working/tiingo/daily/ref_SPY.json"), "utf8"));
  assert.equal(restored.bars.length, 4, "die Materialisierung bekommt SPY aus der Ablage zurueck");
});

test("SPY total return is AVAILABLE only when the same canonical engine reconstructs it with dividends on record", () => {
  const bar = (date, close, dividend = 0, extra = {}) => ({ date, close, splitFactor: 1, dividend, adjustedClose: null, ...extra });
  const ok = [bar("2024-01-02", 100), bar("2024-01-03", 99.5, 0.5), bar("2024-01-04", 100)];
  const r = totalReturnState(ok);
  assert.equal(r.state, "AVAILABLE", JSON.stringify(r));
  assert.equal(r.contract, "canonical-total-return-1.0.0");
  assert.equal(r.benchmarkContract, "benchmark-contract-1.0.0");
  assert.equal(totalReturnState([bar("2024-01-02", 100), bar("2024-01-03", 101)]).reason, "BENCHMARK_DIVIDENDS_MISSING", "ein Vergleichsmassstab ohne erfasste Ausschuettung ist unvollstaendig");
  assert.equal(totalReturnState([bar("2024-01-02", 100), bar("2024-01-03", 101, null)]).reason, "DIVIDEND_FIELD_MISSING");
  assert.equal(totalReturnState([]).state, "UNAVAILABLE");
});

test("survivorship still gates trust: a passed return basis alone never lifts a rule above LIMITED", () => {
  const checks = Object.fromEntries(SB.TRUST_CHECKS.map((c) => [c.id, { state: "PASS" }]));
  const robustSample = { n: 50000, titles: 3000 };
  assert.equal(SB.trustState(checks, robustSample), "ROBUST", "Kontrolle: alles bestanden ist ROBUST");
  checks.survivorship = { state: "FAIL", reason: "TODAYS_UNIVERSE_ONLY" };
  assert.equal(SB.trustState(checks, robustSample), "LIMITED", "ohne Ueberlebenden-Kontrolle bleibt es LIMITED, auch mit Gesamtrendite");
});

/* --------------------------------------------- Signal-Studie mit Fixture */

function signalFixture(t, { spyCut = 0, spyGap = false, spyMissingDividend = false, spyFrom = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-bm-signal-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const long = join(dir, "long"), work = join(dir, "work", "tiingo", "daily");
  mkdirSync(long, { recursive: true }); mkdirSync(work, { recursive: true });
  const src = join(ROOT, "quant/data/market/discover-series-long");
  const files = readdirSync(src).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
  /* 60 echte Titel mit langer Reihe - und ein eingeschmuggelter SPY in der Titelliste. */
  const picked = files.filter((f) => JSON.parse(readFileSync(join(src, f), "utf8")).points.length > 1500).slice(0, 60);
  for (const f of picked) {
    const j = JSON.parse(readFileSync(join(src, f), "utf8"));
    copyFileSync(join(src, f), join(long, f));
    /* Gesamtrendite = Kurs mal stetig wachsender Ausschuettungsfaktor. */
    writeFileSync(join(work, j.securityId + ".json"), JSON.stringify({ ticker: j.ticker, securityId: j.securityId, provider: "tiingo",
      bars: barsWithDividends(j.points, j.securityId) }));
  }
  const spySeries = json("quant/data/market/multi-asset/series/SPY.json").points;
  writeFileSync(join(long, "ref_SPY.json"), JSON.stringify({ securityId: "ref_SPY", ticker: "SPY", priceSeriesType: "SPLIT_ADJUSTED", points: spySeries.filter((_, i) => i % 5 === 0) }));
  let spyPts = spySeries.slice(0, spySeries.length - spyCut);
  if (spyFrom) spyPts = spyPts.filter(([d]) => d >= spyFrom); /* der heutige Arbeitsstand: SPY erst ab 2023 */
  if (spyGap) spyPts = spyPts.filter(([d]) => !(d >= "2005-01-01" && d < "2005-03-01"));
  writeFileSync(join(work, "ref_SPY.json"), JSON.stringify({ ticker: "SPY", securityId: "ref_SPY", provider: "tiingo",
    bars: barsWithDividends(spyPts, "ref_SPY", { yield: 0.004, ...(spyMissingDividend ? { oursMisses: new Set([5]) } : {}) }) }));
  const out = join(dir, "signal.json");
  const r = spawnSync(process.execPath, ["--max-old-space-size=4096", join(ROOT, "scripts/quant/build-signal-backtest.mjs"), "--work-dir", join(dir, "work")],
    { encoding: "utf8", env: { PATH: process.env.PATH, VU_SIGNAL_LONG_DIR: long, VU_SIGNAL_OUT: out }, timeout: 600000 });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return JSON.parse(readFileSync(out, "utf8"));
}

test("total return on both sides: the study switches to TOTAL_RETURN and publishes the before/after comparison", (t) => {
  const s = signalFixture(t);
  assert.equal(s.returnType, "TOTAL_RETURN");
  assert.equal(s.source.titles, 60, "der eingeschmuggelte SPY zaehlt nicht als Titel");
  assert.equal(s.source.spyTotalReturn.state, "PASS");
  assert.match(s.source.benchmark, /BENCHMARK_REFERENCE/);
  assert.equal(SB.studyViolations(s).length, 0, JSON.stringify(SB.studyViolations(s)));
  for (const r of s.rules) {
    assert.equal(r.returnType, "TOTAL_RETURN");
    assert.equal(r.checks.returnBasis.state, "PASS");
    assert.notEqual(r.trust, "ROBUST"); assert.notEqual(r.trust, "USABLE");
  }
  assert.equal(s.returnBasisComparison.compared, true);
  assert.deepEqual(s.returnBasisComparison.rules.map((r) => r.id), s.rules.map((r) => r.id));
  assert.equal(s.returnBasis, "CANONICAL_TOTAL_RETURN");
  assert.equal(s.source.spyTotalReturn.canonical.role, "BENCHMARK_REFERENCE");
  assert.equal(s.returnBasisComparison.spyProviderAdjusted, "PASS");
  for (const c of s.returnBasisComparison.rules) {
    for (const side of ["priceReturn", "providerAdjustedReturn", "canonicalTotalReturn"]) for (const k of ["positiveShare", "basePositiveShare", "deltaPositiveShare", "median", "maxDrawdownMedian", "oos", "walkForward", "parameterStability", "trust"]) assert.ok(k in c[side], side + "." + k);
  }
  /* Die Basis aendert die Zahlen wirklich (Ausschuettungen > 0); Anbieter
     und Kanon liegen bei sauberer Anbieterspalte nah beieinander. */
  assert.ok(s.returnBasisComparison.rules.some((c) => c.priceReturn.median !== c.canonicalTotalReturn.median));
  for (const c of s.returnBasisComparison.rules) {
    if (c.canonicalTotalReturn.median !== null) assert.ok(Math.abs(c.canonicalTotalReturn.median - c.providerAdjustedReturn.median) < 0.005, c.id);
  }
});

test("fail closed: a stale, gappy or unadjusted SPY keeps the whole study on price return, no mixing", (t) => {
  for (const [opts, reason] of [[{ spyCut: 40 }, "SPY_TOTAL_RETURN_STALE"], [{ spyGap: true }, "SPY_TOTAL_RETURN_GAPS"], [{ spyMissingDividend: true }, "SPY_TOTAL_RETURN_MISSING"], [{ spyFrom: "2023-01-01" }, "SPY_TOTAL_RETURN_COVERAGE_SHORT"]]) {
    const s = signalFixture(t, opts);
    assert.equal(s.returnType, "SPLIT_ADJUSTED_PRICE", reason);
    assert.equal(s.source.spyTotalReturn.reason, reason);
    assert.equal(s.returnBasisComparison.compared, false);
    assert.ok(s.rules.every((r) => r.returnType === "SPLIT_ADJUSTED_PRICE" && r.checks.returnBasis.state === "FAIL"), reason);
  }
});

/* ------------------------------------------- Abruf gegen eine Attrappe */

function spyBars({ dividendsInAdjusted = true, dividendsInRecord = true } = {}) {
  const dates = [], end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const c = new Date(Date.UTC(1993, 0, 29));
  while (c <= end) { if (c.getUTCDay() % 6) dates.push(c.toISOString().slice(0, 10)); c.setUTCDate(c.getUTCDate() + 1); }
  let p = 44;
  const rows = dates.map((d, i) => { p *= 1 + Math.sin(i / 13) * 0.004 + 0.0003; return { date: d + "T00:00:00.000Z", close: p, div: i % 63 === 0 && i > 0 ? p * 0.004 : 0 }; });
  /* adjClose rueckwaerts: vor jedem Ex-Tag um die Ausschuettung gekuerzt. */
  const adj = new Array(rows.length).fill(1);
  for (let i = rows.length - 2; i >= 0; i--) adj[i] = adj[i + 1] * (rows[i + 1].div > 0 ? 1 - rows[i + 1].div / rows[i].close : 1);
  return rows.map((r, i) => { const a = dividendsInAdjusted ? r.close * adj[i] : r.close;
    return { date: r.date, open: r.close, high: r.close * 1.004, low: r.close * 0.996, close: r.close, volume: 5e7,
      adjOpen: a, adjHigh: a * 1.004, adjLow: a * 0.996, adjClose: a, adjVolume: 5e7, divCash: dividendsInRecord || i !== 63 ? r.div : 0, splitFactor: 1 }; });
}

async function runRefresh(t, opts) {
  const { createServer } = await import("node:http");
  const rows = spyBars(opts);
  let hits = 0;
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (!/^\/tiingo\/daily\/SPY\/prices$/i.test(u.pathname)) { res.writeHead(404).end("{}"); return; }
    hits++;
    const start = u.searchParams.get("startDate");
    res.writeHead(200, { "Content-Type": "application/json", Connection: "close" }).end(JSON.stringify(start ? rows.filter((r) => r.date.slice(0, 10) >= start) : rows));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const dir = mkdtempSync(join(tmpdir(), "vu-bm-refresh-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const report = join(dir, "report.json");
  /* Asynchron: ein spawnSync blockierte die Schleife, an der die Attrappe haengt. */
  const { execFile } = await import("node:child_process");
  await new Promise((resolve, reject) => execFile(process.execPath, [join(ROOT, "scripts/market/refresh-benchmark-history.mjs"), "--work-dir", join(dir, "work"), "--report", report],
    { encoding: "utf8", timeout: 120000, env: { PATH: process.env.PATH, TIINGO_API_KEY: "test", TIINGO_BASE_URL: `http://127.0.0.1:${server.address().port}` } },
    (err, stdout, stderr) => (err ? reject(new Error(String(err.message) + stderr)) : resolve())));
  const cache = join(dir, "work", "tiingo", "daily", "ref_SPY.json");
  return { rep: JSON.parse(readFileSync(report, "utf8")), cache: existsSync(cache) ? JSON.parse(readFileSync(cache, "utf8")) : null, hits };
}

test("the benchmark refresh fetches the whole series in one request with one adjustment", async (t) => {
  const { rep, cache, hits } = await runRefresh(t);
  assert.equal(hits, 1, "eine Anfrage");
  assert.equal(rep.state, "PASS", JSON.stringify(rep));
  assert.equal(rep.totalReturn.state, "AVAILABLE");
  assert.equal(rep.first, "1993-01-29");
  assert.ok(rep.corporateActions.dividends > 100);
  assert.equal(cache.role, BENCHMARK_ROLE);
  assert.ok(cache.bars.every((b) => b.securityId === "ref_SPY" && b.adjustedClose > 0));
  assert.equal(JSON.stringify(rep).includes("\"close\""), false, "der Bericht traegt keine Kurse");
});

test("provider conflict: dividends missing from the adjusted column do not block SPY - the canonical engine wins", async (t) => {
  const { rep, cache } = await runRefresh(t, { dividendsInAdjusted: false });
  assert.equal(rep.state, "PASS", JSON.stringify(rep));
  assert.equal(rep.providerCrossCheck.reason, "DIVIDEND_GAP", "Gegenprobe: der alte Vertrag haette abgelehnt");
  assert.equal(rep.totalReturn.crossCheck.state, "CONFLICT_CANONICAL_WINS");
  assert.ok(cache);
});

test("fail closed: a dividend the provider knows but our record lacks leaves the cache untouched", async (t) => {
  const { rep, cache } = await runRefresh(t, { dividendsInRecord: false });
  assert.equal(rep.state, "FAIL", JSON.stringify(rep));
  assert.equal(rep.canonicalReason, "DIVIDEND_MISSING");
  assert.equal(cache, null, "ohne rekonstruierte Gesamtrendite wird nichts geschrieben");
});
