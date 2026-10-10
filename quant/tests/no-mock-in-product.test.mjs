/* =========================================================================
   KEINE SICHTBARE SEITE LAEUFT AUF DEM SYNTHETISCHEN MODELLUNIVERSUM.

   Eigentuemerentscheidung (Oktober 2026): das Modelluniversum (511
   erfundene Wertpapiere, quant/engines/mock-generator.js) bleibt als
   Testgrundlage der Engines bestehen - aber kein HTML, kein Browser-Skript
   und keine Datei unter quant/data/** darf mehr darauf beruhen. Die alten
   Mehrseiten-Adressen (/quant/ranking/, /quant/stock/?ticker=..., ...)
   sind Weiterleitungen auf die App (quant/ui/legacy-redirect.js).

   Drei Pruefungen:
     a) kein HTML / Browser-JS ausserhalb der Tests verweist auf die
        Mock-Datensaetze oder die Mock-Engines;
     b) keine Datei unter quant/data/** traegt auf oberster Ebene
        isMock:true oder dataMode:"mock" (mit genau einer begruendeten
        Ausnahme, siehe unten);
     c) jede alte Adresse fuehrt auf eine Route, die QXApp.parse kennt -
        synthetische und kaputte Ticker landen auf der Aktienliste.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Redirect = require("../ui/legacy-redirect.js");
const Strategy = require("../engines/strategy.js");

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  .split("\0").filter(Boolean).filter((f) => existsSync(join(ROOT, f)));

/* QXApp.parse, wie in quant/app/app.js - per Klammerzaehlung herausgeloest
   (dieselbe Technik wie internal-links.test.mjs). */
function funktion(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " fehlt");
  let tiefe = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") tiefe++;
    else if (src[i] === "}" && --tiefe === 0) break;
  }
  return src.slice(start, i + 1);
}
const appJs = readFileSync(join(ROOT, "quant/app/app.js"), "utf8");
const { parse } = new Function(funktion(appJs, "parse") + "\nreturn { parse };")();

/* ------------------------------------------------------------------ a */
/* Was ein Browser laedt: jedes HTML und jedes JS ausserhalb von Tests,
   Build-Skripten und Dokumentation. Die beiden Mock-Engines selbst sind
   ausgenommen - sie bleiben fuer die Engine-Tests bestehen, werden aber
   nicht ausgeliefert (scripts/vu2/build-release.mjs, permitted()). */
const MOCK_ENGINES = new Set(["quant/engines/mock-generator.js", "quant/engines/mock-provider.js"]);
function isBrowserFile(f) {
  if (!/\.(html|js)$/.test(f)) return false;
  if (/^(scripts|docs|providers|node_modules|\.github)\//.test(f)) return false;
  if (/(^|\/)(tests|fixtures)\//.test(f)) return false;
  if (/^(api|server|worker)\//.test(f)) return false;   // serverseitig
  return !MOCK_ENGINES.has(f);
}
/* Kommentare duerfen die Geschichte erzaehlen; geprueft wird Code. */
const ohneKommentare = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
const FORBIDDEN = [
  ["quant/data/securities.json", /securities\.json/],
  ["quant/data/meta.json", /(quant\/data\/meta\.json|["'](\/quant\/)?data\/meta\.json["'])/],
  ["rankings.json", /rankings\.json/],
  ["score-history.json", /score-history\.json/],
  ["quant/data/dna", /data\/dna\b/],
  ["scan-mock.json", /scan-mock\.json/],
  ["mock-provider", /mock-provider/],
  ["mock-generator", /mock-generator/],
  ["backtest-worker", /backtest-worker/]
];

test("a · kein HTML und kein Browser-Skript verweist auf Mock-Datensaetze oder Mock-Engines", () => {
  const files = tracked.filter(isBrowserFile);
  assert.ok(files.length > 100, "nur " + files.length + " Browser-Dateien gefunden - die Auswahl greift nicht");
  assert.ok(files.includes("quant/ui/shell.js") && files.includes("quant/app/app.js") && files.includes("quant/index.html"));
  const hits = [];
  for (const f of files) {
    const code = ohneKommentare(readFileSync(join(ROOT, f), "utf8"));
    for (const [label, re] of FORBIDDEN) if (re.test(code)) hits.push(f + " -> " + label);
  }
  assert.deepEqual(hits, [], "Verweise auf das synthetische Modelluniversum: " + hits.join(", "));
});

test("a · kein HTML laedt ein Skript, das es nicht mehr gibt (insbesondere keine geloeschten Mock-Seiten)", () => {
  const missing = [];
  for (const f of tracked.filter((x) => x.endsWith(".html") && isBrowserFile(x))) {
    const html = readFileSync(join(ROOT, f), "utf8");
    for (const m of html.matchAll(/<script[^>]*\bsrc="(\/(?:quant|discover|assets|ask|screener)\/[^"?#]+)"/g)) {
      if (!existsSync(join(ROOT, m[1]))) missing.push(f + " -> " + m[1]);
    }
  }
  assert.deepEqual(missing, []);
});

test("a · die Mock-Engines und der Mock-Datensatz werden nicht ausgeliefert", async () => {
  const { permitted } = await import(new URL("../../scripts/vu2/build-release.mjs", import.meta.url));
  for (const p of MOCK_ENGINES) assert.equal(permitted(p), false, p + " waere im Release");
  for (const p of ["quant/data/securities.json", "quant/data/meta.json", "quant/data/rankings.json", "quant/data/score-history.json",
                   "quant/data/radar.json", "quant/data/events.json", "quant/data/strategies.json", "quant/data/field-catalog.json",
                   "quant/data/technical/scan-mock.json", "quant/ui/backtest-worker.js", "quant/api/client.js"]) {
    assert.ok(!existsSync(join(ROOT, p)), p + " existiert wieder");
  }
  assert.ok(!existsSync(join(ROOT, "quant/data/dna")), "quant/data/dna existiert wieder");
  assert.ok(!tracked.some((f) => /^quant\/data\/technical\/instruments\/VUF?\d+\.json$/.test(f)), "synthetische Technical-Instrumente liegen wieder in quant/data");
});

/* ------------------------------------------------------------------ b */
/* Die eine Ausnahme: quant/data/market/status.json ist der Statusbericht
   des (nicht konfigurierten) Twelve-Data-Referenzzugangs. "mock" heisst
   dort nach quant/engines/data-mode.js "kein Zugang" - die Datei traegt
   keinen einzigen Kurs. Sie bleibt nur zulaessig, solange das so ist. */
const STATUS_FILE = "quant/data/market/status.json";

function walkJson(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJson(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

test("b · keine Datei unter quant/data traegt isMock:true oder dataMode:\"mock\"", () => {
  const files = walkJson(join(ROOT, "quant", "data"), []);
  assert.ok(files.length > 50, "nur " + files.length + " JSON-Dateien unter quant/data");
  const hits = [];
  for (const file of files) {
    let doc;
    try { doc = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) continue;
    const rel = file.slice(ROOT.length + 1).split("\\").join("/");
    if (doc.isMock === true || doc.dataMode === "mock" || doc.mockData) {
      if (rel === STATUS_FILE) continue;
      hits.push(rel);
    }
  }
  assert.deepEqual(hits, [], "synthetische Daten unter quant/data: " + hits.join(", "));
});

test("b · die Ausnahme quant/data/market/status.json traegt keine Kurse und keine Mock-Behauptung fuer das Produkt", () => {
  const status = JSON.parse(readFileSync(join(ROOT, STATUS_FILE), "utf8"));
  assert.equal(status.configured, false);
  assert.equal(status.publicDataState.mode, "UNAVAILABLE");
  assert.deepEqual(status.securities, {});
  assert.equal(status.summary, null);
  assert.doesNotMatch(status.notice, /Mock-Modus|Modelluniversum|synthetisch/i);
});

test("b · Technical-Index und -Meta enthalten nur echte Instrumente", () => {
  const index = JSON.parse(readFileSync(join(ROOT, "quant/data/technical/index.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(ROOT, "quant/data/technical/meta.json"), "utf8"));
  assert.ok(index.instruments.length > 0);
  for (const row of index.instruments) {
    assert.equal(row.isMock, false, row.instrumentId);
    assert.equal(row.dataMode, "real", row.instrumentId);
    assert.doesNotMatch(row.instrumentId, /^VUF?\d+$/);
  }
  assert.equal(meta.mockData, undefined, "meta.json traegt noch einen mockData-Block");
});

/* ------------------------------------------------------------------ c */
const TABLE = [
  /* Ranking: kein Gesamt-Score (quant-v2 publication.allowed:false) */
  ["/quant/ranking/", "", "/quant/#/screener"],
  ["/quant/ranking/", "?view=quantScore", "/quant/#/screener"],
  ["/quant/ranking/", "?view=scoreVelocity30d", "/quant/#/screener"],
  ["/quant/ranking/", "?view=momentumScore", "/quant/#/screener?frage=momentum"],
  ["/quant/ranking/", "?view=valueScore&sector=Tech", "/quant/#/screener?frage=guenstig"],
  ["/quant/ranking/", "?view=riskScore", "/quant/#/screener?frage=ruhig"],
  ["/quant/ranking/", "?view=qualityScore", "/quant/#/screener?frage=qualitaet"],
  ["/quant/ranking/", "?view=growthScore", "/quant/#/screener?frage=wachstum-qualitaet"],
  ["/quant/ranking/", "?view=<script>", "/quant/#/screener"],
  ["/quant/ranking/index.html", "", "/quant/#/screener"],
  ["/quant/ranking", "", "/quant/#/screener"],
  ["/quant/screener/", "?q=momentum", "/quant/#/screener/profi"],
  ["/quant/strategies/", "", "/quant/#/strategien"],
  ["/quant/strategies/", "?id=vu-quality-compounders", "/quant/#/strategien/quality-compounder"],
  ["/quant/strategies/", "?id=vu-momentum-leaders&version=2", "/quant/#/strategien/momentum-leader"],
  ["/quant/strategies/", "?id=vu-quality-momentum", "/quant/#/strategien/quality-momentum"],
  ["/quant/strategies/", "?id=vu-garp", "/quant/#/strategien/garp"],
  ["/quant/strategies/", "?id=vu-future-leaders", "/quant/#/strategien/future-leader"],
  ["/quant/strategies/", "?id=usr_123", "/quant/#/strategien"],
  ["/quant/strategies/", "?id=../../etc", "/quant/#/strategien"],
  ["/quant/strategies/builder/", "?from=vu-garp", "/quant/#/screener/profi?hinweis=strategy-lab"],
  ["/quant/backtests/", "?id=bt_1", "/quant/#/backtest"],
  ["/quant/watchlist/", "", "/quant/#/aktien"],
  ["/quant/stock/", "?ticker=NVDA", "/quant/#/aktie/NVDA"],
  ["/quant/stock/", "?ticker=brk.b", "/quant/#/aktie/BRK.B"],
  ["/quant/stock/", "?ticker=VU0001", "/quant/#/aktien"],
  ["/quant/stock/", "?ticker=vuf011", "/quant/#/aktien"],
  ["/quant/stock/", "", "/quant/#/aktien"],
  ["/quant/stock/", "?ticker=", "/quant/#/aktien"],
  ["/quant/stock/", "?ticker=TOOLONGTICKER123", "/quant/#/aktien"],
  ["/quant/stock/", "?ticker=%3Cimg%3E", "/quant/#/aktien"],
  ["/quant/stock/", "?ticker=A%2FB", "/quant/#/aktien"],
  ["/quant/technical/", "?symbol=MSFT", "/quant/#/aktie/MSFT/technik"],
  ["/quant/technical/", "?ticker=AAPL", "/quant/#/aktie/AAPL/technik"],
  ["/quant/technical/", "?symbol=VUF003&layer=ELLIOTT", "/quant/#/aktien"],
  ["/quant/technical/", "", "/quant/#/aktien"],
  ["/quant/ai/", "?q=momentum", "/ask/"],
  ["/quant/radar/", "", "/quant/#/radar"]
];

test("c · legacyPathRoute bildet jede alte Adresse auf ihr Ziel ab", () => {
  for (const [path, search, expected] of TABLE) {
    assert.equal(Redirect.legacyPathRoute(path, search), expected, path + search);
  }
  /* Keine alte Quant-Seite: kein Ziel (das Stub-Skript faellt dann auf /quant/#/ zurueck). */
  for (const path of ["/quant/", "/quant/markt/", "/quant/methodology/", "/discover/", "/"]) {
    assert.equal(Redirect.legacyPathRoute(path, ""), null, path);
  }
});

test("c · jedes Ziel einer Weiterleitung ist eine Route, die QXApp.parse kennt", () => {
  const targets = new Set(TABLE.map((row) => row[2]));
  for (const id of Object.keys(Redirect.STRATEGY)) targets.add(Redirect.legacyPathRoute("/quant/strategies/", "?id=" + id));
  for (const v of Object.keys(Redirect.RANKING_VIEW)) targets.add(Redirect.legacyPathRoute("/quant/ranking/", "?view=" + v));
  for (const target of targets) {
    if (target === "/ask/") { assert.ok(existsSync(join(ROOT, "ask/index.html"))); continue; }
    assert.ok(target.startsWith("/quant/#/"), target);
    const r = parse(target.slice("/quant/".length));
    assert.notEqual(r.view, "notfound", target + " kennt parse nicht");
    if (target.includes("/strategien/")) assert.ok(r.id, target);
    if (target.includes("/aktie/")) assert.ok(/^[A-Z0-9.-]{1,12}$/.test(r.ticker) && !/^VUF?\d+$/.test(r.ticker), target);
  }
});

test("c · die abgebildeten Strategien und Screener-Fragen existieren wirklich", () => {
  const profiles = JSON.parse(readFileSync(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8")).profiles.map((p) => p.profileId);
  for (const id of Object.values(Redirect.STRATEGY)) assert.ok(profiles.includes(id), id + " ist kein Strategieprofil");
  const pages = readFileSync(join(ROOT, "quant/app/pages.js"), "utf8");
  for (const frage of Object.values(Redirect.RANKING_VIEW)) assert.match(pages, new RegExp('\\{ id: "' + frage + '"'), frage + " ist keine Screener-Frage");
  assert.match(pages, /params\.get\("hinweis"\) === "strategy-lab"/, "der Profi-Screener erklaert die Weiterleitung aus dem Strategy Lab nicht");
  /* Kein Ranking-Ersatz: die Methodik verbietet einen veroeffentlichten Gesamt-Score. */
  const v2 = JSON.parse(readFileSync(join(ROOT, "quant/methodology/quant-v2.json"), "utf8"));
  assert.equal(v2.publication.allowed, false);
  assert.ok(!Object.keys(Redirect.RANKING_VIEW).includes("quantScore"));
});

test("c · Weiterleitungsseiten: noindex, kanonisch /quant/, noscript-Link, keine Shell und keine Daten", () => {
  const stubs = ["ai", "backtests", "radar", "ranking", "screener", "stock", "strategies", "strategies/builder", "technical", "watchlist"];
  for (const dir of stubs) {
    const file = join(ROOT, "quant", dir, "index.html");
    const html = readFileSync(file, "utf8");
    assert.ok(html.includes('<script src="/quant/ui/legacy-redirect.js"></script>'), dir);
    assert.match(html, /<meta name="robots" content="noindex">/, dir);
    assert.match(html, /<link rel="canonical" href="\/quant\/">/, dir);
    assert.match(html, /<noscript>[\s\S]*<a href="\/(quant\/#\/|ask\/)[^"]*">/, dir);
    assert.ok(html.includes("vu-navigation") && html.includes("site-navigation.css"), dir);
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(scripts, ["/assets/site-navigation.js", "/quant/ui/legacy-redirect.js"], dir);
    assert.ok(!existsSync(join(ROOT, "quant", dir, "app.js")), dir + "/app.js existiert wieder");
    /* Das statische Ziel des Stubs stimmt mit der Abbildung ohne Parameter ueberein. */
    const target = Redirect.legacyPathRoute("/quant/" + dir + "/", "");
    assert.ok(html.includes('href="' + target.split("?")[0]), dir + ": noscript-Ziel weicht von " + target + " ab");
  }
  /* Jede index.html unter quant/ ist entweder eine Seite mit Shell oder genau so eine Weiterleitung. */
  const pages = tracked.filter((f) => /^quant\/(.*\/)?index\.html$/.test(f) && !/\/(tests|fixtures)\//.test(f));
  for (const f of pages) {
    const html = readFileSync(join(ROOT, f), "utf8");
    const redirect = html.includes("/quant/ui/legacy-redirect.js");
    assert.ok(redirect !== html.includes("/quant/ui/shell.js"), f + ": weder Seite noch Weiterleitung (oder beides)");
    if (redirect) assert.ok(stubs.includes(f.replace(/^quant\//, "").replace(/\/index\.html$/, "")), f + " ist eine unerwartete Weiterleitung");
  }
});

test("c · Mock-Speicherstaende werden geraeumt, eine Ticker-Merkliste der App bleibt", () => {
  function store(init) {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), removeItem: (k) => m.delete(k), setItem: (k, v) => m.set(k, String(v)), map: m };
  }
  const old = store({ "vu.quant.backtests.v1": "[]", "vu.quant.strategies.v1": "{}", "vu.quant.watchlist.v1": '{"securityIds":["sec_VU0001"]}', "vu.quant.recent.v1": '["NVDA"]' });
  Redirect.clearMockStorage(old);
  assert.deepEqual([...old.map.keys()], ["vu.quant.recent.v1"]);
  const app = store({ "vu.quant.watchlist.v1": '["NVDA","AAPL"]' });
  Redirect.clearMockStorage(app);
  assert.equal(app.map.get("vu.quant.watchlist.v1"), '["NVDA","AAPL"]');
  const broken = store({ "vu.quant.watchlist.v1": "{kaputt" });
  Redirect.clearMockStorage(broken);
  assert.equal(broken.map.has("vu.quant.watchlist.v1"), false);
  /* Gesperrter Speicher wirft nicht. */
  Redirect.clearMockStorage({ getItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });
  Redirect.clearMockStorage(null);
});

test("c · run() leitet per location.replace weiter und raeumt den Speicher", () => {
  const calls = [];
  const removed = [];
  Redirect.run({
    location: { pathname: "/quant/stock/", search: "?ticker=nvda", replace: (u) => calls.push(u) },
    localStorage: { getItem: () => null, removeItem: (k) => removed.push(k) }
  });
  assert.deepEqual(calls, ["/quant/#/aktie/NVDA"]);
  assert.deepEqual(removed, ["vu.quant.backtests.v1", "vu.quant.strategies.v1"]);
  const fallback = [];
  Redirect.run({ location: { pathname: "/quant/unbekannt/", search: "", replace: (u) => fallback.push(u) }, get localStorage() { throw new Error("SecurityError"); } });
  assert.deepEqual(fallback, ["/quant/#/"]);
});

/* Die frueheren Seiten blockierten nicht zertifizierte Regeln vor dem
   Backtest-Worker (quant/api/client.js, entfernt). Die Regel selbst liegt in
   der Engine und gilt weiter. */
test("Regeln ohne Backtest-Zertifizierung bleiben gesperrt (vormals Preflight in quant/api/client.js)", () => {
  const definition = Strategy.createDefinition({ filters: [
    { field: "elliottCountStatus", operator: "eq", value: "AMBIGUOUS", scale: "raw" }
  ] });
  const result = Strategy.backtestEligibility(definition);
  assert.equal(result.eligible, false);
  assert.equal(result.code, "RULE_METRIC_NOT_BACKTEST_CERTIFIED");
  assert.deepEqual(Array.from(result.blockedFields), ["elliottCountStatus"]);
});
