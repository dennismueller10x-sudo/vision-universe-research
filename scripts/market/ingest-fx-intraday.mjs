/* =========================================================================
   VISION UNIVERSE — ingest-fx-intraday.mjs   (Currency Layer, O-9)

   EIN FX-STATE JE WAEHRUNGSPAAR - NICHT JE AKTIE UND NICHT JE TICK.

   Der Owner-Entscheid O-9 benennt die Gegenteile, die es zu vermeiden
   gilt: eine FX-Anfrage je Aktie, eine je Tick, eine Verbindung je
   Frontend, eine Logik je Produkt. Was statt dessen entsteht, ist ein
   zentraler Zustand: USD/EUR wird EINMAL geholt und von AAPL, NVDA,
   MSFT und jedem weiteren USD-Titel gemeinsam konsumiert.

   Die Zahl, die das belegt, steht im Bericht: `securitiesPerRequest`.
   Bei 10.858 USD-Titeln und einem Abruf ist sie fuenfstellig.

   WARUM EIN STAND UND KEINE REIHE

   Die Tagesreihen sind nach Kalendertag geschluesselt. Sechs
   Intraday-Bars desselben Tages fielen darin auf einen Punkt zusammen.
   Ein Intraday-Stand braucht eine Uhrzeit, und er braucht keine
   Historie - die Frage ist "wie steht der Kurs jetzt", nicht "wie stand
   er um 11:05". Deshalb schreibt dieses Skript je Paar EINEN Stand mit
   vollem Zeitstempel, den fx-rates.ingestCurrent() annimmt.

   Wer eine Intraday-HISTORIE braucht, braucht ein anderes Skript und
   einen anderen Vertrag. Diese Unterscheidung nicht zu machen waere der
   erste Schritt zu einer zweiten Kurshistorie neben der ersten.

   FREQUENZ UND ANSPRUCH

   Der Stand traegt frequency INTRADAY. Das ist der Unterschied, an dem
   §53 haengt: mit einem Tagesschluss darf keine EUR-Anzeige "Realtime"
   heissen, mit einem hinreichend frischen Intraday-Stand darf sie es.
   Was "hinreichend frisch" heisst, entscheidet fx-freshness.js
   (INTRADAY: 3600 Sekunden), nicht dieses Skript.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/ingest-fx-intraday.mjs
     node scripts/market/ingest-fx-intraday.mjs --dry-run
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Rates = require(join(ROOT, "quant", "engines", "fx", "fx-rates.js"));
const Providers = require(join(ROOT, "quant", "engines", "fx", "fx-provider-registry.js"));
const Capabilities = require(join(ROOT, "quant", "engines", "capabilities.js"));

Providers.configure(JSON.parse(readFileSync(join(ROOT, "quant", "config", "fx-license.json"), "utf8")));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const DRY_RUN = flags.has("--dry-run");
const PUBLISH = flags.has("--publish");
const maxArg = args.find((a) => a.startsWith("--max-pairs="));
const MAX_PAIRS = maxArg ? Number(maxArg.slice("--max-pairs=".length)) : 12;

const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const KEY = process.env.TIINGO_API_KEY || "";

const OUT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "fx", "intraday-state.json")
  : resolve(ROOT, ".market-cache", "currency", "intraday-state.json");

function readFirst(...candidates) {
  for (const f of candidates) if (existsSync(f)) return { file: f, data: JSON.parse(readFileSync(f, "utf8")) };
  return null;
}

const requirements = readFirst(
  resolve(ROOT, "quant", "data", "market", "fx", "pair-requirements.json"),
  resolve(ROOT, ".market-cache", "currency", "pair-requirements.json"));
if (!requirements) {
  console.error("Kein Paarbedarf. Erst: node scripts/market/build-fx-pair-requirements.mjs");
  process.exit(1);
}

const probe = readFirst(
  resolve(ROOT, "quant", "data", "market", "capabilities", "tiingo-fx-probe.json"),
  resolve(ROOT, ".market-cache", "currency", "tiingo-fx-probe.json"));

/* Die Sperre: ohne belegtes fxIntraday wird nicht abgerufen. Dieselbe
   Regel wie beim historischen Import - ein Lauf auf Verdacht verbraucht
   Kontingent und lernt nichts. */
if (!DRY_RUN) {
  const declaration = Capabilities.declare("tiingo", { fx: (probe && probe.data.capabilities) || {} });
  if (!Capabilities.supports(declaration, "fx", "fxIntraday")) {
    console.error("ABBRUCH: fxIntraday ist nicht belegt.");
    console.error("  Erst messen: node scripts/market/probe-tiingo-fx.mjs (mit TIINGO_API_KEY)");
    process.exit(2);
  }
  if (!KEY) { console.error("ABBRUCH: TIINGO_API_KEY fehlt."); process.exit(2); }
}

/* Welche Paare einen Intraday-Stand brauchen: die groessten nach
   Titelzahl. Der lange Schwanz braucht keinen - ein Unternehmen, das in
   KZT berichtet, hat keinen Realtime-Kurs, den ein frischer FX-Stand
   verbessern wuerde. */
const canonical = new Map();
for (const p of requirements.data.pairs || []) {
  const key = [p.base, p.quote].sort().join("|");
  if (!canonical.has(key)) canonical.set(key, { base: p.base, quote: p.quote, securities: 0 });
  canonical.get(key).securities += p.securities || 0;
}
const wanted = [...canonical.values()]
  .sort((a, b) => b.securities - a.securities)
  .slice(0, MAX_PAIRS);

/* Welche Schreibweise der Anbieter fuehrt, steht in der Sondierung -
   gemessen, nicht geraten. Ohne sie wird beides probiert. */
const resolved = new Map();
for (const r of (probe && probe.data.tickerResolution && probe.data.tickerResolution.all) || []) {
  if (r.served && r.servedAs) resolved.set(r.requestedPair, r.servedAs);
}
function candidates(pair) {
  const known = resolved.get(`${pair.base}/${pair.quote}`);
  const a = (pair.base + pair.quote).toLowerCase();
  const b = (pair.quote + pair.base).toLowerCase();
  return known ? [known, known === a ? b : a] : [a, b];
}

let requests = 0;
const results = [];

async function fetchState(pair) {
  for (const ticker of candidates(pair)) {
    requests++;
    let res;
    try {
      res = await fetch(`${BASE}/tiingo/fx/top?tickers=${ticker}`,
        { headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" } });
    } catch (err) {
      return { pair, ok: false, reason: "networkError", detail: String(err && err.message) };
    }
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) return { pair, ok: false, reason: "accessDenied", httpStatus: res.status };
      continue;
    }
    const body = await res.json();
    const row = Array.isArray(body) && body[0];
    if (!row) continue;

    /* Der Mittelkurs, wenn er da ist; sonst die Mitte aus Geld und Brief.
       Kein Rueckfall auf eine einzelne Seite: ein Briefkurs ist kein
       Wechselkurs, sondern ein Wechselkurs plus Spanne, und der Fehler
       liefe systematisch in eine Richtung. */
    const mid = typeof row.midPrice === "number" ? row.midPrice
      : (typeof row.bidPrice === "number" && typeof row.askPrice === "number"
          ? (row.bidPrice + row.askPrice) / 2 : null);
    if (mid === null || !(mid > 0)) continue;

    const asOf = row.quoteTimestamp || row.timestamp || row.date || null;
    if (!asOf || !isFinite(Date.parse(asOf))) continue;

    /* Die gelieferte Richtung ist die des Tickers, nicht die angefragte. */
    const served = ticker === (pair.base + pair.quote).toLowerCase()
      ? { base: pair.base, quote: pair.quote, direction: "DIRECT" }
      : { base: pair.quote, quote: pair.base, direction: "INVERSE" };

    return { pair, ok: true, ticker, served, rate: mid, asOf,
             ageSeconds: Math.round((Date.now() - Date.parse(asOf)) / 1000) };
  }
  return { pair, ok: false, reason: "pairNotServed" };
}

async function main() {
  if (DRY_RUN) {
    console.log(`--dry-run: ${wanted.length} Paare wuerden einen Intraday-Stand bekommen.`);
    for (const p of wanted) {
      console.log(`  ${p.base}/${p.quote}  ${candidates(p)[0]}  ${p.securities} Titel`);
    }
    const total = wanted.reduce((n, p) => n + p.securities, 0);
    console.log(`\n  ${wanted.length} Anfragen bedienen ${total} Titel - ${Math.round(total / Math.max(1, wanted.length))} Titel je Anfrage.`);
    process.exit(0);
  }

  const store = Rates.createStore();
  for (const pair of wanted) {
    const r = await fetchState(pair);
    results.push(r);
    if (!r.ok) { console.log(`  ${pair.base}/${pair.quote}  --  ${r.reason}`); continue; }
    const accepted = store.ingestCurrent(r.served.base, r.served.quote, {
      rate: r.rate, asOf: r.asOf,
      ...Providers.ingestMeta("tiingo", { frequency: "INTRADAY" })
    });
    console.log(`  ${pair.base}/${pair.quote}  ok als ${r.ticker} (${r.served.direction})  ` +
                `Stand ${r.asOf}  ${r.ageSeconds} s alt  ${accepted.accepted ? "" : "[" + accepted.reason + "]"}`);
  }

  const ok = results.filter((r) => r.ok);
  const securitiesServed = ok.reduce((n, r) => n + (r.pair.securities || 0), 0);

  const state = {
    schema: "vu-fx-intraday-state-1.0.0",
    generatedAtUtc: new Date().toISOString(),
    note: "Ein zentraler Stand je Waehrungspaar (O-9). Kein Abruf je Aktie, keiner je Tick. " +
          "frequency INTRADAY - nur damit darf eine EUR-Anzeige 'Realtime' heissen (§53).",
    provider: "tiingo",
    requests,
    pairsRequested: wanted.length,
    pairsWithState: ok.length,
    securitiesServed,
    /* Die Zahl, die O-9 belegt oder widerlegt. */
    securitiesPerRequest: requests ? Math.round(securitiesServed / requests) : null,
    states: store.currentStates().map((s) => {
      const c = store.currentFor(...s.pair.split("/"));
      return { pair: s.pair, asOf: c.asOf, source: c.source, role: c.role,
               frequency: c.frequency, ageSecondsAtWrite: Math.round((Date.now() - Date.parse(c.asOf)) / 1000) };
    }),
    failed: results.filter((r) => !r.ok).map((r) => ({ pair: `${r.pair.base}/${r.pair.quote}`, reason: r.reason })),
    /* Die Kurse selbst liegen daneben und nicht im Bericht: der Bericht
       wird committet, die Staende nicht. */
    ratesWrittenTo: OUT.replace(ROOT + "/", "").replace("intraday-state.json", "intraday-rates.json")
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(state, null, 2) + "\n");

  /* Die Staende mit Kurs - in die Arbeitsablage, nie in den
     ausgelieferten Pfad. */
  const ratesFile = join(dirname(OUT), "intraday-rates.json");
  writeFileSync(ratesFile, JSON.stringify({
    schema: "vu-fx-intraday-rates-1.0.0",
    generatedAtUtc: state.generatedAtUtc,
    rates: store.currentStates().map((s) => store.currentFor(...s.pair.split("/")))
  }, null, 2) + "\n");

  console.log(`\n${ok.length} von ${wanted.length} Paaren mit Stand, ${requests} Anfragen.`);
  console.log(`  ${securitiesServed} Titel bedient - ${state.securitiesPerRequest} je Anfrage.`);
  console.log(`Bericht: ${OUT}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
