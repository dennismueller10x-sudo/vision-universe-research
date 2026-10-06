/* =========================================================================
   VISION UNIVERSE — scripts/core/data-quality.mjs

   Datenqualitaet des Repository-Stands (core/data-quality.js).

     node scripts/core/data-quality.mjs            Bericht
     node scripts/core/data-quality.mjs --json     Bericht als JSON
     node scripts/core/data-quality.mjs --strict   Exit 2, wenn eine ERROR-Regel faellt
     node scripts/core/data-quality.mjs --out=PFAD Bericht zusaetzlich als Datei

   Liest nur committete Artefakte, ruft keinen Anbieter, schreibt nichts
   ins Repository. Laufzeit: einige Sekunden (alle Kursreihen werden
   gelesen - genau das ist der Punkt).
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { args, REPO_ROOT, require } from "./lib.mjs";

const a = args();
const root = typeof a.root === "string" ? a.root : REPO_ROOT;
const DQ = require(join(REPO_ROOT, "core", "data-quality.js"));
const Identity = require(join(REPO_ROOT, "core", "identity.js"));
const TS = require(join(REPO_ROOT, "quant", "engines", "realtime", "trading-session.js"));
const calendar = JSON.parse(readFileSync(join(REPO_ROOT, "quant", "config", "market-calendar.json"), "utf8"));

const p = (rel) => join(root, rel);
const json = (rel) => JSON.parse(readFileSync(p(rel), "utf8"));
const maybe = (rel) => { try { return existsSync(p(rel)) ? json(rel) : null; } catch (e) { return null; } };
const dir = (rel, re) => existsSync(p(rel)) ? readdirSync(p(rel)).filter((n) => re.test(n)).sort() : [];

const now = a.now ? new Date(a.now) : new Date();
const lage = TS.resolve(now, { calendar });
const expected = lage.lastCompletedSession ? lage.lastCompletedSession.sessionDate : null;
const lag = (date, exp) => {
  if (!date || !exp) return null;
  if (date >= exp) return 0;
  let d = date, n = 0;
  while (d < exp && n < 60) { d = TS.nextTradingDay(d, { calendar }); if (!d) return null; n++; }
  return n;
};

const rules = [];
/* Identitaet */
const elig = maybe("quant/data/market/security-master/eligibility.json");
const decisions = elig ? elig.decisions : [];
const sources = { "eligibility.json": decisions, "tiingo-universe.json": (maybe("quant/config/tiingo-universe.json") || {}).securities };
for (const f of dir("quant/data/market/scale", /^universe-.*\.json$/)) sources["scale/" + f] = (maybe("quant/data/market/scale/" + f) || {}).securities;
rules.push(DQ.idConsistency(sources, Identity));
rules.push(DQ.universeDuplicates(decisions));
const instruments = [];
for (const f of dir("quant/data/universe/instruments", /\.json$/)) instruments.push(...((maybe("quant/data/universe/instruments/" + f) || {}).instruments || []));
rules.push(DQ.activeSymbolCollisions(instruments));

/* Kurse */
const SERIES = "quant/data/market/discover-series";
const LONG = "quant/data/market/discover-series-long";
const daily = dir(SERIES, /^ref_.*\.json$/).map((f) => maybe(SERIES + "/" + f)).filter(Boolean);
rules.push(DQ.seriesIntegrity(daily));
rules.push(DQ.seriesFreshness(daily, expected, lag, 2));
rules.push(DQ.implausibleJumps(daily, 0.6));
const pairs = [];
for (const s of daily) {
  const w = maybe(LONG + "/" + s.securityId + ".json");
  if (w) pairs.push({ securityId: s.securityId, daily: s, weekly: w });
}
rules.push(DQ.dailyWeeklyAgreement(pairs, 0.005));
const byId = new Map(daily.map((s) => [s.securityId, s]));
const stockIndex = maybe("discover/data/stock-index/US_REAL.json");
const indexSymbols = stockIndex ? stockIndex.symbols : [];
const payloadFiles = dir("discover/data/stocks/US_REAL", /\.json$/).map((f) => f.replace(/\.json$/, ""));
const payloadPairs = [];
for (const t of indexSymbols) {
  let id; try { id = Identity.securityIdForTicker(t); } catch (e) { continue; }
  const s = byId.get(id), pl = s && maybe("discover/data/stocks/US_REAL/" + t + ".json");
  if (s && pl) payloadPairs.push({ ticker: t, series: s, payload: pl });
}
rules.push(DQ.payloadMatchesSeries(payloadPairs));

/* Produkte */
rules.push(DQ.payloadIndexParity(indexSymbols, payloadFiles));
const refs = [];
const signals = maybe("supertrader/data/signals.json");
if (signals) {
  const seen = new Set();
  const walk = (x, owner) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, owner));
    if (!x || typeof x !== "object") return;
    if (x.chart && typeof x.chart.weeklyPath === "string" && !seen.has(x.chart.weeklyPath)) { seen.add(x.chart.weeklyPath); refs.push({ owner: "supertrader/signals.json", path: x.chart.weeklyPath }); }
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v, owner);
  };
  walk(signals, "supertrader");
  /* Jede Karte verlinkt auf /supertrader/stock/<SYM>/ (supertrader.js#stockUrl). */
  const syms = new Set(Object.keys(signals.bySymbol || {}));
  const sammle = (x) => { if (Array.isArray(x)) x.forEach(sammle); else if (x && typeof x === "object") { if (typeof x.symbol === "string") syms.add(x.symbol); Object.values(x).forEach((v) => v && typeof v === "object" && sammle(v)); } };
  sammle(signals.partialChecks);
  for (const t of syms) refs.push({ owner: "supertrader-karte", path: "/supertrader/stock/" + t + "/index.html" });
}
for (const t of indexSymbols.slice(0)) {
  const pl = maybe("discover/data/stocks/US_REAL/" + t + ".json");
  if (pl && pl.priceSeries && typeof pl.priceSeries.path === "string") refs.push({ owner: "discover/" + t, path: pl.priceSeries.path });
}
rules.push(DQ.referencedPathsExist(refs, (path) => existsSync(p(path.replace(/^\//, "")))));
const ixIndex = maybe("quant/data/market/index-membership/index.json");
const indexes = ixIndex ? ixIndex.indexes.map((i) => maybe("quant/data/market/index-membership/" + i.indexId + ".json")).filter(Boolean) : [];
rules.push(DQ.indexMembersResolve(indexes, Object.fromEntries(decisions.map((d) => [d.securityId, d]))));

const report = Object.assign(DQ.summarize(rules), { checkedAt: now.toISOString(), expectedSession: expected });

if (a.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`VISION UNIVERSE DATA QUALITY  ${report.overall}  (Sitzung ${expected}, ${report.checkedAt})\n`);
  for (const r of rules) {
    console.log(`${r.status === "PASS" ? "PASS" : r.severity.padEnd(5)}  ${r.id.padEnd(9)} ${r.title}  [${r.failed}/${r.checked}]`);
    if (r.status !== "PASS") for (const s of r.samples.slice(0, 8)) console.log("         - " + s);
    if (r.note && r.status !== "PASS") console.log("         " + r.note);
  }
}
if (typeof a.out === "string") writeFileSync(a.out, JSON.stringify(report, null, 2) + "\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Vision Universe Data Quality · ${report.overall}`, "",
    "| Regel | Schwere | Ergebnis | Fehler/geprueft | Beispiele |", "|---|---|---|---|---|",
    ...rules.map((r) => `| ${r.id} ${r.title} | ${r.severity} | ${r.status} | ${r.failed}/${r.checked} | ${r.samples.slice(0, 3).join("; ").replace(/\|/g, "/")} |`), ""].join("\n"));
}
if (a.strict && report.overall === "FAIL") process.exit(2);
